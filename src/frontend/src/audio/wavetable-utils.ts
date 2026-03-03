/**
 * Wavetable generation and manipulation utilities
 */

const FRAME_SIZE = 512;

export function generateWavetableFrames(
  type: string,
  numFrames = 64,
): Float32Array[] {
  const frames: Float32Array[] = [];
  for (let f = 0; f < numFrames; f++) {
    frames.push(generateFrame(type, f / (numFrames - 1), numFrames));
  }
  return frames;
}

function generateFrame(
  type: string,
  t: number,
  _numFrames: number,
): Float32Array {
  const frame = new Float32Array(FRAME_SIZE);

  switch (type) {
    case "harmonic_smooth":
      for (let n = 1; n <= 8; n++) {
        const amp = (1 / (n * n)) * (1 - t * 0.5);
        addHarmonic(frame, n, amp, 0);
      }
      break;
    case "formant_aggressive":
      addHarmonic(frame, 1, 0.8 - t * 0.3, 0);
      addHarmonic(frame, 2, 0.4 + t * 0.4, 0);
      addHarmonic(frame, 3, 0.2 + t * 0.5, 0);
      addHarmonic(frame, 4, 0.1 + t * 0.3, 0);
      addHarmonic(frame, 5, t * 0.4, 0);
      addHarmonic(frame, 7, t * 0.3, 0);
      break;
    case "saw_bright":
    case "saw": {
      // Interpolate from pure saw to supersaw
      for (let n = 1; n <= 16; n++) {
        const amp = (1 / n) * (1 - t * 0.3 + (n / 16) * t * 0.4);
        addHarmonic(frame, n, amp, 0);
      }
      break;
    }
    case "inharmonic": {
      // Inharmonic partials
      const ratios = [1, 1.41, 2.0, 2.83, 4.0, 5.66, 8.0];
      for (let i = 0; i < ratios.length; i++) {
        const amp = (1 / (i + 1)) * (0.3 + t * 0.7);
        addHarmonicF(frame, ratios[i], amp, i * 0.3);
      }
      break;
    }
    case "formant_vowel": {
      // Vowel formant morph A -> E -> I
      const vowels = [
        [730, 1090, 2440], // A
        [270, 2290, 3010], // E
        [390, 1990, 2550], // I
      ];
      const vt = t * 2;
      const vi = Math.min(Math.floor(vt), 1);
      const vf = vt - vi;
      for (let n = 1; n <= 20; n++) {
        const freq = n * 110; // base freq
        const amp0 = formantAmp(freq, [vowels[vi]]);
        const amp1 = formantAmp(freq, [vowels[vi + 1] || vowels[vi]]);
        const amp = amp0 + vf * (amp1 - amp0);
        addHarmonic(frame, n, amp * 0.5, 0);
      }
      break;
    }
    case "piano_bright": {
      addHarmonic(frame, 1, 0.7 - t * 0.2, 0);
      addHarmonic(frame, 2, 0.5 - t * 0.1, Math.PI * 0.1);
      addHarmonic(frame, 3, 0.35, Math.PI * 0.05);
      addHarmonic(frame, 4, 0.2 - t * 0.05, 0);
      addHarmonic(frame, 5, 0.15, 0);
      addHarmonic(frame, 6, 0.1, 0);
      addHarmonic(frame, 7, 0.08, 0);
      addHarmonic(frame, 8, 0.05, 0);
      break;
    }
    case "fm_tine": {
      // FM-style tine
      addHarmonic(frame, 1, 0.8, 0);
      addHarmonic(frame, 3, 0.3 * t, Math.PI);
      addHarmonic(frame, 5, 0.15 * t, 0);
      addHarmonic(frame, 7, 0.1 * t, Math.PI);
      break;
    }
    case "saw_layered": {
      for (let n = 1; n <= 12; n++) {
        addHarmonic(frame, n, 0.6 / n, n * 0.03);
        addHarmonic(frame, n, 0.4 / n, n * 0.05 + 0.02);
      }
      break;
    }
    case "dual_saw": {
      for (let n = 1; n <= 12; n++) {
        addHarmonic(frame, n, 0.5 / n, 0);
        addHarmonic(frame, n, 0.4 / n, 0.1 + n * 0.02);
      }
      break;
    }
    case "bass_sampled": {
      addHarmonic(frame, 1, 1.0, 0);
      addHarmonic(frame, 2, 0.6, Math.PI * 0.1);
      addHarmonic(frame, 3, 0.3, 0);
      addHarmonic(frame, 4, 0.15, 0);
      addHarmonic(frame, 5, 0.08, 0);
      break;
    }
    case "soft_saw_blend": {
      for (let n = 1; n <= 8; n++) {
        addHarmonic(frame, n, (0.7 / n) * Math.exp(-n * 0.15 * t), 0);
      }
      break;
    }
    case "sine_breath": {
      addHarmonic(frame, 1, 0.9, 0);
      addHarmonic(frame, 2, 0.1, Math.PI * 0.3);
      addHarmonic(frame, 3, 0.05, 0);
      // Add breath as noise-like harmonics at high end
      for (let n = 10; n <= 20; n++) {
        addHarmonic(frame, n, 0.02 * t, Math.random() * Math.PI * 2);
      }
      break;
    }
    case "orchestral_layered": {
      // Layered strings + brass
      for (let n = 1; n <= 10; n++) {
        addHarmonic(frame, n, 0.5 / n, n * 0.05);
        addHarmonic(frame, n, 0.3 / n, n * 0.08 + 0.1);
      }
      addHarmonic(frame, 1, 0.4, 0);
      addHarmonic(frame, 2, 0.3, 0.2);
      addHarmonic(frame, 3, 0.4, 0.1);
      break;
    }
    case "harmonic_sharp_upper": {
      for (let n = 1; n <= 6; n++) {
        addHarmonic(frame, n, 0.5 / n, 0);
      }
      for (let n = 7; n <= 16; n++) {
        addHarmonic(frame, n, (0.3 + t * 0.4) / (n - 5), n * 0.1);
      }
      break;
    }
    case "inharmonic_aggressive": {
      const iratios = [1, 1.5, 2.2, 3.1, 4.7, 6.3, 9.1];
      for (let i = 0; i < iratios.length; i++) {
        addHarmonicF(frame, iratios[i], (0.5 + t * 0.5) / (i + 1), i * 0.5);
      }
      break;
    }
    case "complex_moving": {
      for (let n = 1; n <= 12; n++) {
        const phase = n * t * Math.PI * 2;
        addHarmonic(
          frame,
          n,
          (0.5 / n) * (1 + 0.5 * Math.sin(phase)),
          phase * 0.1,
        );
      }
      break;
    }
    case "thin_alias": {
      addHarmonic(frame, 1, 0.5, 0);
      addHarmonic(frame, 4, 0.6 - t * 0.2, Math.PI);
      addHarmonic(frame, 7, 0.4 - t * 0.1, 0);
      addHarmonic(frame, 11, 0.3 + t * 0.2, Math.PI * 0.5);
      addHarmonic(frame, 13, 0.2 + t * 0.3, 0);
      break;
    }
    case "formant_complex": {
      for (let n = 1; n <= 15; n++) {
        const formantAmp2 = formantAmp(n * 130, [
          [400 + t * 200, 1600 + t * 400, 2500],
        ]);
        addHarmonic(frame, n, formantAmp2 * 0.6, n * 0.2 * t);
      }
      break;
    }
    case "transient_heavy": {
      for (let n = 1; n <= 20; n++) {
        addHarmonic(frame, n, 0.3 / (n * 0.5), Math.random() * Math.PI * 2 * t);
      }
      break;
    }
    case "saw_unstable": {
      for (let n = 1; n <= 14; n++) {
        const drift = (Math.random() - 0.5) * 0.1 * t;
        addHarmonic(frame, n, (0.6 + drift) / n, drift * Math.PI);
      }
      break;
    }
    case "bright_harmonic_contrast": {
      for (let n = 1; n <= 4; n++) {
        addHarmonic(frame, n, 0.4 / n, 0);
      }
      for (let n = 8; n <= 14; n++) {
        addHarmonic(frame, n, (0.3 + t * 0.5) / (n - 5), n * 0.2);
      }
      break;
    }
    default: {
      // Default: sine with harmonics
      for (let n = 1; n <= 8; n++) {
        addHarmonic(
          frame,
          n,
          (1 / n) * (0.5 + t * 0.5 * (n % 2 === 0 ? 0.7 : 1)),
          0,
        );
      }
      break;
    }
  }

  normalizeFrame(frame);
  return frame;
}

function addHarmonic(
  frame: Float32Array,
  n: number,
  amp: number,
  phase: number,
) {
  for (let i = 0; i < FRAME_SIZE; i++) {
    frame[i] += Math.sin((i / FRAME_SIZE) * Math.PI * 2 * n + phase) * amp;
  }
}

function addHarmonicF(
  frame: Float32Array,
  ratio: number,
  amp: number,
  phase: number,
) {
  for (let i = 0; i < FRAME_SIZE; i++) {
    frame[i] += Math.sin((i / FRAME_SIZE) * Math.PI * 2 * ratio + phase) * amp;
  }
}

function formantAmp(freq: number, formants: number[][]): number {
  let amp = 0;
  for (const formant of formants) {
    const f0 = formant[0] || 500;
    const bw = 100;
    const d0 = (freq - f0) / bw;
    amp += Math.exp(-(d0 * d0));
    if (formant[1]) {
      const d1 = (freq - formant[1]) / (bw * 1.5);
      amp += Math.exp(-(d1 * d1)) * 0.7;
    }
    if (formant[2]) {
      const d2 = (freq - formant[2]) / (bw * 2);
      amp += Math.exp(-(d2 * d2)) * 0.5;
    }
  }
  return Math.min(amp, 1.0);
}

function normalizeFrame(frame: Float32Array) {
  let peak = 0;
  for (let i = 0; i < FRAME_SIZE; i++) {
    const abs = Math.abs(frame[i]);
    if (abs > peak) peak = abs;
  }
  if (peak > 0.001) {
    for (let i = 0; i < FRAME_SIZE; i++) {
      frame[i] /= peak;
    }
  }
}

export function drawWaveformOnFrame(
  frame: Float32Array,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  frameWidth: number,
): void {
  const fStart = Math.floor((x0 / frameWidth) * FRAME_SIZE);
  const fEnd = Math.floor((x1 / frameWidth) * FRAME_SIZE);
  for (let i = fStart; i <= fEnd && i < FRAME_SIZE; i++) {
    const t = fEnd > fStart ? (i - fStart) / (fEnd - fStart) : 0;
    frame[i] = y0 + t * (y1 - y0);
  }
}

export function smoothFrame(frame: Float32Array, amount = 0.3): Float32Array {
  const result = new Float32Array(FRAME_SIZE);
  for (let i = 0; i < FRAME_SIZE; i++) {
    const prev = frame[(i - 1 + FRAME_SIZE) % FRAME_SIZE];
    const next = frame[(i + 1) % FRAME_SIZE];
    result[i] = frame[i] * (1 - amount) + (prev + next) * (amount / 2);
  }
  return result;
}

export function addHarmonicToFrame(
  frame: Float32Array,
  harmonic: number,
  amplitude: number,
): void {
  for (let i = 0; i < FRAME_SIZE; i++) {
    frame[i] += Math.sin((i / FRAME_SIZE) * Math.PI * 2 * harmonic) * amplitude;
  }
  normalizeFrame(frame);
}

export function randomizeFrame(frame: Float32Array, numPartials = 8): void {
  frame.fill(0);
  for (let n = 1; n <= numPartials; n++) {
    const amp = (Math.random() * 0.7 + 0.1) / n;
    const phase = Math.random() * Math.PI * 2;
    for (let i = 0; i < FRAME_SIZE; i++) {
      frame[i] += Math.sin((i / FRAME_SIZE) * Math.PI * 2 * n + phase) * amp;
    }
  }
  normalizeFrame(frame);
}

export function morphFrames(
  frameA: Float32Array,
  frameB: Float32Array,
  amount: number,
): Float32Array {
  const result = new Float32Array(FRAME_SIZE);
  for (let i = 0; i < FRAME_SIZE; i++) {
    result[i] = frameA[i] * (1 - amount) + frameB[i] * amount;
  }
  return result;
}

export { FRAME_SIZE };
