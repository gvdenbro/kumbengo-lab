# Plan: kora-tap CLI tool

## Goal
A Python CLI tool (using `uv`) that records spacebar taps to capture rhythm, derives tempo, quantizes beats, and appends a new arrangement to a piece YAML file.

## Files to create

### `tools/kora-tap.py`
Single-file script, run via `uv run tools/kora-tap.py <piece.yaml>`.

Inline script metadata for uv dependencies:
```python
# /// script
# requires-python = ">=3.12"
# dependencies = ["pyyaml"]
# ///
```

## Implementation steps

### Step 1: Parse CLI args and load YAML
- Accept one positional arg: path to a piece YAML file
- Load and parse the YAML, extract current `title` and `tempo`
- Validate the file has the expected structure (title, tempo, arrangements)

### Step 2: Record taps
- Print instructions: "Tap spacebar in rhythm. Press Enter when done."
- Use terminal raw mode (`tty.setraw` / `termios`) to capture individual keypresses without requiring Enter
- Record `time.monotonic()` timestamp for each spacebar press
- Enter/Return ends the recording
- Require minimum 2 taps

### Step 3: Derive tempo
- Compute intervals between consecutive taps
- Use median interval to derive BPM: `60 / median_interval`
- Round BPM to nearest integer

### Step 4: Choose quantization grid
- Default resolution: 0.5 beats
- Check if taps fit better on a 0.25-beat grid: compute quantization error for both resolutions, pick the one with lower total error
- If 0.25 grid is significantly better (>30% less error), use it; otherwise stick with 0.5

### Step 5: Quantize taps to beat grid
- Convert each tap timestamp to beat position: `(tap_time - first_tap) / beat_duration`
  where `beat_duration = 60 / detected_bpm`
- Snap each beat to nearest multiple of the chosen resolution
- Deduplicate (two taps on the same quantized beat → keep one)
- Display the quantized beat list

### Step 6: Prompt for options
- If detected tempo differs from piece tempo by >2 BPM:
  "Piece tempo is X BPM, detected Y BPM. Update piece tempo to Y? [y/N]"
- Arrangement name (default: "Tapped rhythm")
- Difficulty: beginner/intermediate/advanced (default: beginner)
- Default string for all notes (default: R1)

### Step 7: Write arrangement to YAML
- Build the new arrangement dict:
  ```yaml
  - name: <name>
    difficulty: <difficulty>
    steps:
      - { t: 0, string: R1 }
      - { t: 0.5, string: R1 }
      ...
  ```
- Append to the `arrangements` list in the YAML
- If tempo update accepted, update the `tempo` field
- Write back to the file, preserving comments where possible
  (PyYAML drops comments — accept this limitation, note it in output)

## Edge cases
- Less than 2 taps → error message, exit
- Very irregular tapping (high variance in intervals) → warn but proceed
- Duplicate quantized beats → deduplicate silently, show count
- File doesn't exist or isn't valid piece YAML → error message, exit

## Testing
- No automated tests for the interactive parts (terminal raw mode)
- The quantization logic (steps 3-5) will be in pure functions that can be tested
- Add `tools/kora-tap.test.py` with tests for: tempo detection, grid selection, quantization, deduplication

## Not in scope
- Playing back the tapped rhythm (use the website for that)
- Editing existing arrangements
- Multi-string / chord input (use the website or hand-edit YAML)
