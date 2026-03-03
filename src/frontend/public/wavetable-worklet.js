/**
 * WaveCanvas AudioWorklet Processor
 * Handles wavetable synthesis, modulation, envelopes, and drum voices
 */

const FRAME_SIZE = 512;
const MAX_FRAMES = 256;
const MAX_VOICES = 8;
const MAX_UNISON = 8;
const SAMPLE_RATE = 44100;
const TWO_PI = Math.PI * 2;

// Wavetable buffer (preallocated)
const wavetableBuffer = new Float32Array(MAX_FRAMES * FRAME_SIZE);
let numFrames = 64;

// Drum voice buffers (preallocated)
const drumNoise = new Float32Array(SAMPLE_RATE);

// Initialize drum noise buffer once
for (let i = 0; i < SAMPLE_RATE; i++) {
  drumNoise[i] = Math.random() * 2 - 1;
}

let drumNoiseIdx = 0;

function nextNoise() {
  drumNoiseIdx = (drumNoiseIdx + 1) % SAMPLE_RATE;
  return drumNoise[drumNoiseIdx];
}

// Pink noise state
const pinkState = new Float32Array(7);
function pinkNoise() {
  const w = nextNoise();
  pinkState[0] = 0.99886 * pinkState[0] + w * 0.0555179;
  pinkState[1] = 0.99332 * pinkState[1] + w * 0.0750759;
  pinkState[2] = 0.96900 * pinkState[2] + w * 0.1538520;
  pinkState[3] = 0.86650 * pinkState[3] + w * 0.3104856;
  pinkState[4] = 0.55000 * pinkState[4] + w * 0.5329522;
  pinkState[5] = -0.7616 * pinkState[5] - w * 0.0168980;
  return (pinkState[0] + pinkState[1] + pinkState[2] + pinkState[3] + pinkState[4] + pinkState[5] + pinkState[6] + w * 0.5362) * 0.11;
}

// State Variable Filter
class SVFilter {
  constructor() {
    this.s1 = 0; this.s2 = 0;
    this.mode = 0; // 0=LP, 1=HP, 2=BP, 3=Notch
    this.cutoff = 20000;
    this.res = 0.1;
    this.drive = 0;
  }
  process(x, sampleRate) {
    const w = 2 * Math.tan(Math.PI * Math.min(this.cutoff, 20000) / sampleRate);
    const g = w / 2;
    const R = 1 - this.res * 0.98;
    const hp = (x - (2 * R + g) * this.s1 - this.s2) / (1 + 2 * R * g + g * g);
    const bp = g * hp + this.s1;
    const lp = g * bp + this.s2;
    this.s1 = g * hp + bp;
    this.s2 = g * bp + lp;
    const notch = hp + lp;
    const modes = [lp, hp, bp, notch];
    return modes[this.mode] || lp;
  }
  reset() { this.s1 = 0; this.s2 = 0; }
}

// ADSR Envelope
class ADSREnvelope {
  constructor() {
    this.state = 'idle'; // idle, attack, decay, sustain, release
    this.value = 0;
    this.attack = 0.01;
    this.decay = 0.1;
    this.sustain = 0.7;
    this.release = 0.3;
    this._releaseStartValue = 0;
    this._phase = 0;
    this._attackRate = 0;
    this._decayRate = 0;
    this._releaseRate = 0;
  }
  noteOn(sampleRate) {
    this._attackRate = 1 / (this.attack * sampleRate + 1);
    this._decayRate = 1 / (this.decay * sampleRate + 1);
    this.state = 'attack';
  }
  noteOff(sampleRate) {
    this._releaseStartValue = this.value;
    this._releaseRate = this.value / (this.release * sampleRate + 1);
    this.state = 'release';
  }
  process() {
    switch (this.state) {
      case 'attack':
        this.value += this._attackRate;
        if (this.value >= 1) { this.value = 1; this.state = 'decay'; }
        break;
      case 'decay':
        this.value -= this._decayRate;
        if (this.value <= this.sustain) { this.value = this.sustain; this.state = 'sustain'; }
        break;
      case 'sustain':
        this.value = this.sustain;
        break;
      case 'release':
        this.value -= this._releaseRate;
        if (this.value <= 0) { this.value = 0; this.state = 'idle'; }
        break;
    }
    return this.value;
  }
  isIdle() { return this.state === 'idle' && this.value <= 0.0001; }
}

// LFO
class LFO {
  constructor() {
    this.phase = 0;
    this.rate = 1;
    this.shape = 0; // 0=sine, 1=tri, 2=saw, 3=revsaw, 4=square, 5=s&h
    this.depth = 0.5;
    this.phaseOffset = 0;
    this._sampleHold = 0;
    this._sampleHoldPhase = 0;
  }
  process(sampleRate) {
    this.phase += this.rate / sampleRate;
    if (this.phase >= 1) this.phase -= 1;
    const p = (this.phase + this.phaseOffset) % 1;
    let v;
    switch (this.shape) {
      case 0: v = Math.sin(p * TWO_PI); break;
      case 1: v = p < 0.5 ? 4 * p - 1 : 3 - 4 * p; break;
      case 2: v = p * 2 - 1; break;
      case 3: v = 1 - p * 2; break;
      case 4: v = p < 0.5 ? 1 : -1; break;
      case 5: {
        if (this._sampleHoldPhase > p) this._sampleHold = Math.random() * 2 - 1;
        this._sampleHoldPhase = p;
        v = this._sampleHold;
        break;
      }
      default: v = 0;
    }
    return v * this.depth;
  }
}

// Single wavetable voice
class WavetableVoice {
  constructor() {
    this.active = false;
    this.note = 0;
    this.velocity = 0;
    this.phase = 0;
    this.freq = 440;
    this.wtPos = 0;
    this.unisonPhases = new Float32Array(MAX_UNISON);
    this.unisonDetune = new Float32Array(MAX_UNISON);
    this.env1 = new ADSREnvelope();
    this.env2 = new ADSREnvelope();
    this.env3 = new ADSREnvelope();
    this.filter1 = new SVFilter();
    this.filter2 = new SVFilter();
    this.subPhase = 0;
    this.driftPhase = 0;
    this.driftValue = 0;
    this.driftTarget = 0;
    this.driftLpState = 0;
  }
}

// Drum voice
class DrumVoice {
  constructor(type) {
    this.type = type; // 'kick','snare','clap','ch','oh','ltom','mtom','htom','rim','cymbal'
    this.active = false;
    this.phase = 0;
    this.pitchPhase = 0;
    this.env = new ADSREnvelope();
    this.pitchEnv = new ADSREnvelope();
    this.velocity = 1;
    this.tune = 0; // semitones
    this.decay = 0.5;
    this.level = 1;
    this.pan = 0;
    this.filter = new SVFilter();
    this.noisePos = 0;
    this.pulseCount = 0;
    this.pulseTimer = 0;
  }
}

// Modulation matrix slot
function makeModSlot() {
  return { source: 0, target: 0, amount: 0, enabled: true };
}

class WaveCanvasProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    this._sr = 44100;
    this._voices = [];
    this._drumVoices = [];
    this._lfos = [new LFO(), new LFO(), new LFO()];
    this._modMatrix = Array.from({ length: 8 }, makeModSlot);
    this._params = this._defaultParams();
    this._voicePool = [];

    // Preallocate voices
    for (let i = 0; i < MAX_VOICES; i++) {
      this._voicePool.push(new WavetableVoice());
    }

    // Preallocate drum voices
    const drumTypes = ['kick','snare','clap','ch','oh','ltom','mtom','htom','rim','cymbal'];
    for (const t of drumTypes) {
      this._drumVoices.push(new DrumVoice(t));
    }

    // Chorus state (preallocated)
    this._chorusDelay = [new Float32Array(4096), new Float32Array(4096)];
    this._chorusIdx = [0, 0];
    this._chorusLFOPhase = 0;

    // Delay state
    this._delayBuf = [new Float32Array(SAMPLE_RATE * 2), new Float32Array(SAMPLE_RATE * 2)];
    this._delayIdx = [0, 0];
    this._delayTime = 0.25;
    this._delayFeedback = 0.3;

    // Reverb (simple schroeder)
    this._revBufs = [
      new Float32Array(2039), new Float32Array(1999),
      new Float32Array(1951), new Float32Array(1901),
      new Float32Array(2053), new Float32Array(2017),
    ];
    this._revIdx = new Int32Array(6);
    this._revAllpass = [new Float32Array(347), new Float32Array(113)];
    this._revApIdx = new Int32Array(2);

    this.port.onmessage = (e) => this._handleMessage(e.data);
  }

  _defaultParams() {
    return {
      // Oscillator
      wtPos: 0, scanSpeed: 0, unisonVoices: 1, unisonDetune: 0.1, stereoSpread: 0.5,
      subLevel: 0, subType: 0, noiseLevel: 0, noiseType: 0, driftAmount: 0.01,
      octave: 0, fineTune: 0, oscLevel: 0.8,
      // Envelopes
      env1Attack: 0.01, env1Decay: 0.1, env1Sustain: 0.7, env1Release: 0.3,
      env2Attack: 0.01, env2Decay: 0.1, env2Sustain: 0.5, env2Release: 0.2,
      env3Attack: 0.01, env3Decay: 0.2, env3Sustain: 0.3, env3Release: 0.5,
      // Filter
      filter1Mode: 0, filter1Cutoff: 18000, filter1Res: 0.1, filter1Drive: 0, filter1EnvAmt: 0,
      filter2Mode: 0, filter2Cutoff: 18000, filter2Res: 0.1, filter2Drive: 0, filter2EnvAmt: 0,
      filterRouting: 0, // 0=serial, 1=parallel
      keyTracking: 0, keyTrackBase: 60,
      // LFOs
      lfo1Rate: 1, lfo1Shape: 0, lfo1Depth: 0.5, lfo1Phase: 0,
      lfo2Rate: 0.3, lfo2Shape: 0, lfo2Depth: 0.3, lfo2Phase: 0,
      lfo3Rate: 2, lfo3Shape: 4, lfo3Depth: 0.2, lfo3Phase: 0,
      // Effects
      chorusEnabled: 0, chorusRate: 0.5, chorusDepth: 0.003, chorusSpread: 0.5,
      delayEnabled: 0, delayTime: 0.25, delayFeedback: 0.3, delaySpread: 0.5,
      reverbEnabled: 0, reverbSize: 0.5, reverbDamping: 0.5, reverbPreDelay: 0.01,
      satEnabled: 0, satDrive: 0.3,
      limiterEnabled: 1, limiterThreshold: 0.95, limiterRelease: 0.1,
      // Modulation matrix (8 slots, stored flat)
      masterVolume: 0.7,
    };
  }

  _handleMessage(data) {
    switch (data.type) {
      case 'noteOn': {
        this._noteOn(data.note, data.velocity);
        break;
      }
      case 'noteOff': {
        this._noteOff(data.note);
        break;
      }
      case 'setParam': {
        this._params[data.name] = data.value;
        this._syncParamsToLFOs();
        break;
      }
      case 'setParams': {
        Object.assign(this._params, data.params);
        this._syncParamsToLFOs();
        break;
      }
      case 'loadWavetable': {
        const frames = data.frames;
        numFrames = Math.min(frames.length, MAX_FRAMES);
        for (let f = 0; f < numFrames; f++) {
          const src = frames[f];
          const len = Math.min(src.length, FRAME_SIZE);
          wavetableBuffer.set(src.slice(0, len), f * FRAME_SIZE);
        }
        break;
      }
      case 'drumTrigger': {
        this._triggerDrum(data.voice, data.velocity);
        break;
      }
      case 'modMatrix': {
        this._modMatrix[data.slot] = data.slot_data;
        break;
      }
      case 'allNotesOff': {
        for (const v of this._voicePool) { v.active = false; }
        break;
      }
    }
  }

  _syncParamsToLFOs() {
    const p = this._params;
    this._lfos[0].rate = p.lfo1Rate;
    this._lfos[0].shape = p.lfo1Shape | 0;
    this._lfos[0].depth = p.lfo1Depth;
    this._lfos[0].phaseOffset = p.lfo1Phase;
    this._lfos[1].rate = p.lfo2Rate;
    this._lfos[1].shape = p.lfo2Shape | 0;
    this._lfos[1].depth = p.lfo2Depth;
    this._lfos[1].phaseOffset = p.lfo2Phase;
    this._lfos[2].rate = p.lfo3Rate;
    this._lfos[2].shape = p.lfo3Shape | 0;
    this._lfos[2].depth = p.lfo3Depth;
    this._lfos[2].phaseOffset = p.lfo3Phase;
  }

  _noteToFreq(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  _noteOn(note, velocity) {
    // Find a free voice or steal the oldest
    let voice = null;
    for (const v of this._voicePool) {
      if (!v.active) { voice = v; break; }
    }
    if (!voice) voice = this._voicePool[0]; // steal

    voice.active = true;
    voice.note = note;
    voice.velocity = velocity / 127;
    const p = this._params;
    const actualNote = note + (p.octave | 0) * 12;
    voice.freq = this._noteToFreq(actualNote) * Math.pow(2, (p.fineTune || 0) / 1200);
    voice.phase = 0;
    voice.subPhase = 0;
    voice.wtPos = p.wtPos || 0;
    voice.driftPhase = Math.random() * TWO_PI;
    voice.driftValue = 0;
    voice.driftTarget = (Math.random() - 0.5) * 0.002;

    // Unison phases
    const uni = Math.max(1, Math.min(MAX_UNISON, (p.unisonVoices | 0) || 1));
    for (let u = 0; u < uni; u++) {
      voice.unisonPhases[u] = Math.random() * TWO_PI / TWO_PI;
      const detune = p.unisonDetune || 0;
      if (uni > 1) {
        voice.unisonDetune[u] = (u / (uni - 1) - 0.5) * 2 * detune;
      } else {
        voice.unisonDetune[u] = 0;
      }
    }

    // Envelope setup
    voice.env1.attack = Math.max(0.001, p.env1Attack || 0.01);
    voice.env1.decay = Math.max(0.001, p.env1Decay || 0.1);
    voice.env1.sustain = p.env1Sustain != null ? p.env1Sustain : 0.7;
    voice.env1.release = Math.max(0.001, p.env1Release || 0.3);
    voice.env1.noteOn(this._sr);

    voice.env2.attack = Math.max(0.001, p.env2Attack || 0.01);
    voice.env2.decay = Math.max(0.001, p.env2Decay || 0.1);
    voice.env2.sustain = p.env2Sustain != null ? p.env2Sustain : 0.5;
    voice.env2.release = Math.max(0.001, p.env2Release || 0.2);
    voice.env2.noteOn(this._sr);

    voice.env3.attack = Math.max(0.001, p.env3Attack || 0.01);
    voice.env3.decay = Math.max(0.001, p.env3Decay || 0.2);
    voice.env3.sustain = p.env3Sustain != null ? p.env3Sustain : 0.3;
    voice.env3.release = Math.max(0.001, p.env3Release || 0.5);
    voice.env3.noteOn(this._sr);

    // Filter setup
    voice.filter1.mode = p.filter1Mode | 0;
    voice.filter1.cutoff = p.filter1Cutoff || 18000;
    voice.filter1.res = p.filter1Res || 0.1;
    voice.filter1.drive = p.filter1Drive || 0;
    voice.filter1.reset();

    voice.filter2.mode = p.filter2Mode | 0;
    voice.filter2.cutoff = p.filter2Cutoff || 18000;
    voice.filter2.res = p.filter2Res || 0.1;
    voice.filter2.drive = p.filter2Drive || 0;
    voice.filter2.reset();
  }

  _noteOff(note) {
    for (const v of this._voicePool) {
      if (v.active && v.note === note) {
        v.env1.noteOff(this._sr);
        v.env2.noteOff(this._sr);
        v.env3.noteOff(this._sr);
      }
    }
  }

  _triggerDrum(voiceIdx, velocity) {
    const dv = this._drumVoices[voiceIdx];
    if (!dv) return;
    dv.active = true;
    dv.velocity = velocity / 127;
    dv.phase = 0;
    dv.pitchPhase = 0;
    dv.noisePos = (Math.random() * SAMPLE_RATE) | 0;

    // Configure per type
    switch (dv.type) {
      case 'kick':
        dv.env.attack = 0.001; dv.env.decay = 0.4 * (dv.decay + 0.1); dv.env.sustain = 0; dv.env.release = 0.05;
        dv.pitchEnv.attack = 0.001; dv.pitchEnv.decay = 0.08; dv.pitchEnv.sustain = 0; dv.pitchEnv.release = 0.01;
        break;
      case 'snare':
        dv.env.attack = 0.001; dv.env.decay = 0.15 * (dv.decay + 0.2); dv.env.sustain = 0; dv.env.release = 0.05;
        dv.filter.mode = 2; dv.filter.cutoff = 2000; dv.filter.res = 0.3;
        break;
      case 'clap':
        dv.env.attack = 0.001; dv.env.decay = 0.1; dv.env.sustain = 0; dv.env.release = 0.05;
        dv.pulseCount = 4; dv.pulseTimer = 0;
        break;
      case 'ch':
        dv.env.attack = 0.001; dv.env.decay = 0.05; dv.env.sustain = 0; dv.env.release = 0.02;
        dv.filter.mode = 1; dv.filter.cutoff = 8000; dv.filter.res = 0.2;
        break;
      case 'oh':
        dv.env.attack = 0.001; dv.env.decay = 0.3; dv.env.sustain = 0; dv.env.release = 0.1;
        dv.filter.mode = 1; dv.filter.cutoff = 6000; dv.filter.res = 0.2;
        break;
      case 'ltom':
        dv.env.attack = 0.001; dv.env.decay = 0.3; dv.env.sustain = 0; dv.env.release = 0.1;
        dv.pitchEnv.attack = 0.001; dv.pitchEnv.decay = 0.15; dv.pitchEnv.sustain = 0; dv.pitchEnv.release = 0.05;
        break;
      case 'mtom':
        dv.env.attack = 0.001; dv.env.decay = 0.25; dv.env.sustain = 0; dv.env.release = 0.1;
        break;
      case 'htom':
        dv.env.attack = 0.001; dv.env.decay = 0.2; dv.env.sustain = 0; dv.env.release = 0.08;
        break;
      case 'rim':
        dv.env.attack = 0.001; dv.env.decay = 0.06; dv.env.sustain = 0; dv.env.release = 0.02;
        break;
      case 'cymbal':
        dv.env.attack = 0.001; dv.env.decay = 0.6; dv.env.sustain = 0; dv.env.release = 0.3;
        dv.filter.mode = 1; dv.filter.cutoff = 7000; dv.filter.res = 0.1;
        break;
    }
    dv.env.noteOn(this._sr);
    if (dv.pitchEnv) dv.pitchEnv.noteOn(this._sr);
  }

  _processDrum(dv, sampleRate) {
    if (!dv.active) return [0, 0];
    const envVal = dv.env.process();
    if (dv.env.isIdle()) { dv.active = false; return [0, 0]; }

    let sample = 0;
    const baseFreq = this._noteToFreq(36 + dv.tune) * Math.pow(2, dv.tune / 12);

    switch (dv.type) {
      case 'kick': {
        const pitchEnvVal = dv.pitchEnv ? dv.pitchEnv.process() : 0;
        const freq = baseFreq + pitchEnvVal * 200;
        dv.phase += freq / sampleRate;
        if (dv.phase >= 1) dv.phase -= 1;
        // Click transient
        const click = envVal > 0.95 ? nextNoise() * 0.3 : 0;
        // Drive
        let sig = Math.sin(dv.phase * TWO_PI) * envVal + click;
        const drive = dv.drive || 0;
        if (drive > 0) sig = Math.tanh(sig * (1 + drive * 3));
        sample = sig;
        break;
      }
      case 'snare': {
        dv.phase += baseFreq * 1.5 / sampleRate;
        if (dv.phase >= 1) dv.phase -= 1;
        const tone = Math.sin(dv.phase * TWO_PI) * 0.4;
        const noise = nextNoise() * 0.8;
        const filtered = dv.filter.process(noise, sampleRate);
        sample = (tone + filtered) * envVal;
        break;
      }
      case 'clap': {
        dv.pulseTimer++;
        const pulseInterval = (sampleRate * 0.01) | 0;
        if (dv.pulseTimer >= pulseInterval && dv.pulseCount > 0) {
          dv.pulseTimer = 0; dv.pulseCount--;
        }
        const noise2 = nextNoise();
        sample = noise2 * envVal * (dv.pulseCount > 0 ? 0.8 : 0.3);
        break;
      }
      case 'ch': {
        // Metallic noise - multiple sine waves
        dv.phase += 4000 / sampleRate;
        if (dv.phase >= 1) dv.phase -= 1;
        const metal = Math.sin(dv.phase * TWO_PI * 3.46) + Math.sin(dv.phase * TWO_PI * 5.17);
        const nz = nextNoise() * 0.5;
        sample = dv.filter.process((metal * 0.3 + nz) * envVal, sampleRate);
        break;
      }
      case 'oh': {
        dv.phase += 3500 / sampleRate;
        if (dv.phase >= 1) dv.phase -= 1;
        const metal2 = Math.sin(dv.phase * TWO_PI * 3.46) + Math.sin(dv.phase * TWO_PI * 5.17);
        const nz2 = nextNoise() * 0.5;
        sample = dv.filter.process((metal2 * 0.3 + nz2) * envVal, sampleRate);
        break;
      }
      case 'ltom': {
        const pitchEnvL = dv.pitchEnv ? dv.pitchEnv.process() : 0;
        const freqL = this._noteToFreq(41) + pitchEnvL * 100;
        dv.phase += freqL / sampleRate;
        if (dv.phase >= 1) dv.phase -= 1;
        sample = Math.sin(dv.phase * TWO_PI) * envVal;
        break;
      }
      case 'mtom': {
        const freqM = this._noteToFreq(47);
        dv.phase += freqM / sampleRate;
        if (dv.phase >= 1) dv.phase -= 1;
        sample = Math.sin(dv.phase * TWO_PI) * envVal;
        break;
      }
      case 'htom': {
        const freqH = this._noteToFreq(52);
        dv.phase += freqH / sampleRate;
        if (dv.phase >= 1) dv.phase -= 1;
        sample = Math.sin(dv.phase * TWO_PI) * envVal;
        break;
      }
      case 'rim': {
        dv.phase += 800 / sampleRate;
        if (dv.phase >= 1) dv.phase -= 1;
        sample = (Math.sin(dv.phase * TWO_PI) + nextNoise() * 0.3) * envVal;
        break;
      }
      case 'cymbal': {
        dv.phase += 5000 / sampleRate;
        if (dv.phase >= 1) dv.phase -= 1;
        const metalC = Math.sin(dv.phase * TWO_PI * 2.756) + Math.sin(dv.phase * TWO_PI * 4.123) + Math.sin(dv.phase * TWO_PI * 5.771);
        const nzC = nextNoise() * 0.3;
        sample = dv.filter.process((metalC * 0.2 + nzC) * envVal, sampleRate);
        break;
      }
    }

    sample *= dv.level * dv.velocity;
    const pan = dv.pan || 0;
    const gainL = Math.cos((pan + 1) * Math.PI / 4);
    const gainR = Math.sin((pan + 1) * Math.PI / 4);
    return [sample * gainL, sample * gainR];
  }

  _processVoice(voice, lfoVals, sampleRate) {
    if (!voice.active) return [0, 0];

    const p = this._params;
    const env1 = voice.env1.process();
    const env2 = voice.env2.process();
    const env3 = voice.env3.process();

    if (voice.env1.isIdle()) {
      voice.active = false;
      return [0, 0];
    }

    // Drift
    voice.driftPhase += 2 / sampleRate;
    voice.driftValue += (voice.driftTarget - voice.driftValue) * 0.001;
    if (Math.abs(voice.driftValue - voice.driftTarget) < 0.0001) {
      voice.driftTarget = (Math.random() - 0.5) * 0.004 * (p.driftAmount || 0.01) * 100;
    }

    // Modulation
    let wtPosOffset = 0;
    let pitchOffset = 0;
    let ampOffset = 0;
    let cutoffOffset = 0;

    for (const slot of this._modMatrix) {
      if (!slot.enabled) continue;
      let srcVal = 0;
      switch (slot.source) {
        case 0: srcVal = lfoVals[0]; break;
        case 1: srcVal = lfoVals[1]; break;
        case 2: srcVal = lfoVals[2]; break;
        case 3: srcVal = env1; break;
        case 4: srcVal = env2; break;
        case 5: srcVal = env3; break;
        case 6: srcVal = voice.velocity; break;
        case 7: srcVal = p.modWheelValue || 0; break;
        case 8: srcVal = (voice.note - 60) / 60; break;
        default: srcVal = 0;
      }
      const amt = slot.amount;
      switch (slot.target) {
        case 0: wtPosOffset += srcVal * amt; break;
        case 2: ampOffset += srcVal * amt; break;
        case 3: cutoffOffset += srcVal * amt * 10000; break;
        case 8: pitchOffset += srcVal * amt * 100; break;
      }
    }

    // Wavetable position
    const wtPos = Math.max(0, Math.min(1, (p.wtPos || 0) + wtPosOffset));
    const frameIdx = wtPos * (numFrames - 1);
    const frame0 = Math.floor(frameIdx);
    const frame1 = Math.min(frame0 + 1, numFrames - 1);
    const frameFrac = frameIdx - frame0;

    // Unison
    const uni = Math.max(1, Math.min(MAX_UNISON, (p.unisonVoices | 0) || 1));
    const spread = p.stereoSpread || 0;
    let outL = 0;
    let outR = 0;

    for (let u = 0; u < uni; u++) {
      const detuneRatio = Math.pow(2, (voice.unisonDetune[u] + voice.driftValue * (p.driftAmount || 0.01) * 100 + pitchOffset / 1200) / 12);
      const phaseInc = voice.freq * detuneRatio / sampleRate;
      voice.unisonPhases[u] += phaseInc;
      if (voice.unisonPhases[u] >= 1) voice.unisonPhases[u] -= 1;

      const ph = voice.unisonPhases[u];
      const sampleIdx0 = (ph * FRAME_SIZE) | 0;
      const sampleIdx1 = (sampleIdx0 + 1) % FRAME_SIZE;
      const sampleFrac = ph * FRAME_SIZE - sampleIdx0;

      // Interpolate between frames
      const f0s0 = wavetableBuffer[frame0 * FRAME_SIZE + sampleIdx0];
      const f0s1 = wavetableBuffer[frame0 * FRAME_SIZE + sampleIdx1];
      const f1s0 = wavetableBuffer[frame1 * FRAME_SIZE + sampleIdx0];
      const f1s1 = wavetableBuffer[frame1 * FRAME_SIZE + sampleIdx1];

      const s0 = f0s0 + sampleFrac * (f0s1 - f0s0);
      const s1 = f1s0 + sampleFrac * (f1s1 - f1s0);
      const wtSample = s0 + frameFrac * (s1 - s0);

      // Stereo pan per unison voice
      let panPos = uni > 1 ? (u / (uni - 1) - 0.5) * spread : 0;
      const gainL = Math.cos((panPos + 0.5) * Math.PI / 2) * 0.7;
      const gainR = Math.sin((panPos + 0.5) * Math.PI / 2) * 0.7;
      outL += wtSample * gainL;
      outR += wtSample * gainR;
    }

    const uniScale = uni > 1 ? 1 / Math.sqrt(uni) : 1;
    outL *= uniScale;
    outR *= uniScale;

    // Sub oscillator
    if (p.subLevel > 0) {
      voice.subPhase += (voice.freq * 0.5) / sampleRate;
      if (voice.subPhase >= 1) voice.subPhase -= 1;
      let subSig = (p.subType | 0) === 0
        ? Math.sin(voice.subPhase * TWO_PI)
        : voice.subPhase < 0.5 ? 1 : -1;
      const sub = subSig * (p.subLevel || 0);
      outL += sub; outR += sub;
    }

    // Noise
    if (p.noiseLevel > 0) {
      const nz = (p.noiseType | 0) === 0 ? nextNoise() : pinkNoise();
      outL += nz * (p.noiseLevel || 0);
      outR += nz * (p.noiseLevel || 0);
    }

    // Level + amp env
    const ampEnv = env1 * (1 + ampOffset);
    outL *= ampEnv * voice.velocity * (p.oscLevel || 0.8);
    outR *= ampEnv * voice.velocity * (p.oscLevel || 0.8);

    // Drive before filter
    const drive = p.filter1Drive || 0;
    if (drive > 0) {
      const d = 1 + drive * 3;
      outL = Math.tanh(outL * d) / d * (drive + 1);
      outR = Math.tanh(outR * d) / d * (drive + 1);
    }

    // Filter 1
    const cutoff1 = Math.max(20, Math.min(20000, (p.filter1Cutoff || 18000) + cutoffOffset + env2 * (p.filter1EnvAmt || 0) * 10000));
    voice.filter1.cutoff = cutoff1;
    voice.filter1.res = p.filter1Res || 0.1;
    voice.filter1.mode = p.filter1Mode | 0;
    outL = voice.filter1.process(outL, sampleRate);

    // Filter 2 (using same instance - simplified for worklet)
    const cutoff2 = Math.max(20, Math.min(20000, (p.filter2Cutoff || 18000)));
    voice.filter2.cutoff = cutoff2;
    voice.filter2.res = p.filter2Res || 0.1;
    voice.filter2.mode = p.filter2Mode | 0;
    const f2L = voice.filter2.process(outL, sampleRate);
    if ((p.filterRouting | 0) === 0) {
      outL = f2L;
      outR = voice.filter2.process(outR, sampleRate);
    } else {
      outL = (outL + f2L) * 0.5;
      outR = (outR + voice.filter2.process(outR, sampleRate)) * 0.5;
    }

    return [outL, outR];
  }

  _processChorus(l, r) {
    const p = this._params;
    if (!p.chorusEnabled) return [l, r];

    this._chorusLFOPhase += (p.chorusRate || 0.5) / this._sr;
    if (this._chorusLFOPhase >= 1) this._chorusLFOPhase -= 1;

    const depth = (p.chorusDepth || 0.003) * this._sr;
    const lfoVal = Math.sin(this._chorusLFOPhase * TWO_PI);
    const delay = (0.005 * this._sr + lfoVal * depth) | 0;

    // Left channel
    const idxL = (this._chorusIdx[0] - delay + this._chorusDelay[0].length) % this._chorusDelay[0].length;
    const delayed0 = this._chorusDelay[0][idxL];
    this._chorusDelay[0][this._chorusIdx[0]] = l;
    this._chorusIdx[0] = (this._chorusIdx[0] + 1) % this._chorusDelay[0].length;

    // Right channel (opposite LFO phase)
    const lfoValR = Math.sin((this._chorusLFOPhase + 0.5) * TWO_PI);
    const delayR = (0.005 * this._sr + lfoValR * depth) | 0;
    const idxR = (this._chorusIdx[1] - delayR + this._chorusDelay[1].length) % this._chorusDelay[1].length;
    const delayed1 = this._chorusDelay[1][idxR];
    this._chorusDelay[1][this._chorusIdx[1]] = r;
    this._chorusIdx[1] = (this._chorusIdx[1] + 1) % this._chorusDelay[1].length;

    const mix = p.chorusSpread || 0.5;
    return [
      l + delayed0 * mix,
      r + delayed1 * mix,
    ];
  }

  _processDelay(l, r) {
    const p = this._params;
    if (!p.delayEnabled) return [l, r];

    const delSamples = Math.min((p.delayTime || 0.25) * this._sr, this._delayBuf[0].length - 1) | 0;
    const fb = p.delayFeedback || 0.3;

    const idxL = (this._delayIdx[0] - delSamples + this._delayBuf[0].length) % this._delayBuf[0].length;
    const idxR = (this._delayIdx[1] - delSamples + this._delayBuf[1].length) % this._delayBuf[1].length;
    const dL = this._delayBuf[0][idxL];
    const dR = this._delayBuf[1][idxR];

    this._delayBuf[0][this._delayIdx[0]] = l + dL * fb;
    this._delayBuf[1][this._delayIdx[1]] = r + dR * fb;
    this._delayIdx[0] = (this._delayIdx[0] + 1) % this._delayBuf[0].length;
    this._delayIdx[1] = (this._delayIdx[1] + 1) % this._delayBuf[1].length;

    const spread = p.delaySpread || 0.5;
    return [l + dL * spread, r + dR * spread];
  }

  _processReverb(l, r) {
    const p = this._params;
    if (!p.reverbEnabled) return [l, r];

    const size = p.reverbSize || 0.5;
    const damp = p.reverbDamping || 0.5;

    let revL = 0, revR = 0;
    const combLengths = [2039, 1999, 1951, 1901, 2053, 2017];
    const input = (l + r) * 0.5;

    for (let i = 0; i < 6; i++) {
      const len = combLengths[i];
      const idx = this._revIdx[i];
      const delayed = this._revBufs[i][idx];
      const fb = 0.7 + size * 0.27;
      this._revBufs[i][idx] = input + delayed * fb * (1 - damp * 0.5);
      this._revIdx[i] = (idx + 1) % len;
      if (i < 3) revL += delayed; else revR += delayed;
    }

    // Allpass
    for (let a = 0; a < 2; a++) {
      const apLen = a === 0 ? 347 : 113;
      const apIdx = this._revApIdx[a];
      const apD = this._revAllpass[a][apIdx];
      const sig = a === 0 ? revL : revR;
      this._revAllpass[a][apIdx] = sig + apD * 0.5;
      this._revApIdx[a] = (apIdx + 1) % apLen;
      if (a === 0) revL = apD - sig * 0.5;
      else revR = apD - sig * 0.5;
    }

    const wet = 0.3;
    return [l + revL * wet * 0.1, r + revR * wet * 0.1];
  }

  _processSaturation(l, r) {
    const p = this._params;
    if (!p.satEnabled) return [l, r];
    const drive = 1 + (p.satDrive || 0.3) * 5;
    return [Math.tanh(l * drive) / Math.tanh(drive), Math.tanh(r * drive) / Math.tanh(drive)];
  }

  _limiter(l, r) {
    const thresh = this._params.limiterThreshold || 0.95;
    return [
      Math.max(-thresh, Math.min(thresh, l)),
      Math.max(-thresh, Math.min(thresh, r)),
    ];
  }

  process(inputs, outputs, params) {
    const out = outputs[0];
    if (!out || out.length < 2) return true;

    const outL = out[0];
    const outR = out[1];
    const sampleRate = this._sr;

    // Process LFOs once per block (approximation for performance)
    const lfoVals = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      lfoVals[i] = this._lfos[i].process(sampleRate);
    }

    for (let i = 0; i < outL.length; i++) {
      let l = 0, r = 0;

      // Synth voices
      for (const v of this._voicePool) {
        if (!v.active) continue;
        const [vl, vr] = this._processVoice(v, lfoVals, sampleRate);
        l += vl; r += vr;
      }

      // Drum voices
      for (const dv of this._drumVoices) {
        if (!dv.active) continue;
        const [dl, dr] = this._processDrum(dv, sampleRate);
        l += dl; r += dr;
      }

      // Effects
      [l, r] = this._processChorus(l, r);
      [l, r] = this._processDelay(l, r);
      [l, r] = this._processReverb(l, r);
      [l, r] = this._processSaturation(l, r);
      [l, r] = this._limiter(l, r);

      const mv = this._params.masterVolume || 0.7;
      outL[i] = l * mv;
      outR[i] = r * mv;
    }

    return true;
  }
}

registerProcessor('wavetable-processor', WaveCanvasProcessor);
