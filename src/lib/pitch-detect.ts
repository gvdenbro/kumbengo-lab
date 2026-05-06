import { PitchDetector } from 'pitchy';

export interface MicHandle {
  stream: MediaStream;
  ctx: AudioContext;
  analyser: AnalyserNode;
  source: MediaStreamAudioSourceNode;
}

const LISTEN_TIMEOUT = 3000;
const STABLE_FRAMES = 3;
const MIN_CLARITY = 0.9;
const SNAP_MAX_DISTANCE = 2;

export function hzToMidi(hz: number): number {
  return Math.round(12 * Math.log2(hz / 440) + 69);
}

export function snapToString(
  midi: number,
  tuning: Record<string, { midi: number }>,
): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const [id, info] of Object.entries(tuning)) {
    const dist = Math.abs(info.midi - midi);
    if (dist < bestDist) { bestDist = dist; best = id; }
  }
  return bestDist <= SNAP_MAX_DISTANCE ? best : null;
}

export async function openMic(): Promise<MicHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  return { stream, ctx, analyser, source };
}

export function closeMic(handle: MicHandle): void {
  handle.source.disconnect();
  handle.stream.getTracks().forEach(t => t.stop());
  handle.ctx.close();
}

export function listenForNote(
  handle: MicHandle,
  tuning: Record<string, { midi: number }>,
  signal?: AbortSignal,
): Promise<string | null> {
  const detector = PitchDetector.forFloat32Array(handle.analyser.fftSize);
  const buf = new Float32Array(handle.analyser.fftSize);
  let stableCount = 0;
  let lastMidi = -1;

  return new Promise(resolve => {
    if (signal?.aborted) { resolve(null); return; }

    const deadline = setTimeout(() => { cleanup(); resolve(null); }, LISTEN_TIMEOUT);

    const interval = setInterval(() => {
      handle.analyser.getFloatTimeDomainData(buf);

      const [freq, clarity] = detector.findPitch(buf, handle.ctx.sampleRate);
      if (clarity < MIN_CLARITY || freq < 80 || freq > 2000) { stableCount = 0; return; }

      const midi = hzToMidi(freq);
      if (Math.abs(midi - lastMidi) <= 1) {
        stableCount++;
      } else {
        stableCount = 1;
        lastMidi = midi;
      }

      if (stableCount >= STABLE_FRAMES) {
        cleanup();
        resolve(snapToString(lastMidi, tuning));
      }
    }, 50);

    signal?.addEventListener('abort', () => { cleanup(); resolve(null); });

    function cleanup() { clearTimeout(deadline); clearInterval(interval); }
  });
}
