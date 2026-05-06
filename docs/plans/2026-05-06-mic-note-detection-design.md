# Mic-Based Note Detection for Transcription

## Problem

The assign phase of the transcription tool requires clicking the bridge diagram for each step. For users with a kora in hand, it would be faster to simply play the note and have it detected automatically.

## Design

### UX Flow

1. User enters assign phase → mic permission requested once, stream stays open
2. User presses "Listen" button (or spacebar) → UI shows "Listening..."
3. User plucks a kora string
4. Pitch detected → snapped to nearest kora string → shown as "Detected: R5 (G4)"
5. Enter confirms → string assigned, advances to next step
6. Escape or re-press "Listen" → retry detection
7. Bridge diagram click still works alongside (both methods coexist)
8. Leaving assign phase closes mic stream

### Technical Approach

**Dependency:** `pitchfinder` (YIN algorithm, ~15KB, 5K downloads/week, MIT)

**New module: `src/lib/pitch-detect.ts`**
- `openMic()` → requests `getUserMedia({ audio: true })`, creates `AnalyserNode`, returns handle
- `listenForNote(handle, tuning)` → Promise that resolves to a string ID when stable pitch detected
- `closeMic(handle)` → stops stream, disconnects nodes
- Stability heuristic: 3 consecutive frames within ±1 semitone
- Hz → MIDI: `12 * log2(freq / 440) + 69`, then snap to nearest kora string from tuning data

**Transcriber changes:**
- `micRef` holds the open mic handle (opened on assign phase entry, closed on exit)
- `detectedString` state shown in UI
- "Listen" button calls `listenForNote`, sets result
- Enter/Escape keyboard handling in assign phase extended

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
