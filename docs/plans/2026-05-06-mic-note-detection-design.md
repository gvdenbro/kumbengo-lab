# Mic-Based Note Detection for Transcription

## Problem

The assign phase of the transcription tool requires clicking the bridge diagram for each step. For users with a kora in hand, it would be faster to simply play the note and have it detected automatically.

## Design

### UX Flow

1. User enters assign phase → mic permission requested once, stream stays open
2. User presses spacebar → UI shows "Listening..." (up to 3s window)
3. User plucks a kora string
4. Stable pitch detected (resolves early) → snapped to nearest kora string → shown as "Detected: R5 (G4)"
5. Enter confirms → string assigned, advances to next step
6. If wrong: spacebar again to re-listen (overwrites previous detection)
7. Bridge diagram click still works alongside (both methods coexist)
8. Leaving assign phase closes mic stream

Note: 3s window gives ~1s to move hand from keyboard to kora, then 2s of listening. Early resolution means no waiting if detection is fast.

### Technical Approach

**Dependency:** `pitchfinder` (YIN algorithm, ~15KB, 5K downloads/week, MIT)

**New module: `src/lib/pitch-detect.ts`**
- `openMic()` → requests `getUserMedia({ audio: true })`, creates `AnalyserNode`, returns handle
- `listenForNote(handle, tuning)` → Promise that resolves to a string ID when stable pitch detected (timeout 3s)
- `closeMic(handle)` → stops stream, disconnects nodes
- Stability heuristic: 3 consecutive frames within ±1 semitone, with amplitude threshold to ignore silence
- Hz → MIDI: `12 * log2(freq / 440) + 69`, then snap to nearest kora string from tuning data
- Early resolution: resolves as soon as stable pitch found, doesn't wait full 3s

**Transcriber changes:**
- `micRef` holds the open mic handle (opened on assign phase entry, closed on exit)
- `detectedString` state shown in UI
- Spacebar in assign phase calls `listenForNote`, sets result
- Enter confirms detection via existing `assignString`

### Files Changed

| File | Change |
|------|--------|
| `package.json` | Add `pitchfinder@^2.0.2` |
| `src/lib/pitch-detect.ts` | New module |
| `src/components/Transcriber.tsx` | Mic lifecycle, Listen button, detection display |

### Rejected Alternatives

- **basic-pitch-ts (Spotify):** Offline-only, processes full audio buffers, no real-time mic support, 5MB model
- **essentia.js:** WASM-based, 2MB, AGPL license, overkill for single-note detection
- **No library (raw autocorrelation):** Works but pitchfinder's YIN is better tested and handles edge cases
- **Continuous listening:** Rejected in favor of on-demand to avoid false detections from decay/ambient noise
