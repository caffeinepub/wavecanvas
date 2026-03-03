import type { SynthPreset } from "./presets";
import { FRAME_SIZE, generateWavetableFrames } from "./wavetable-utils";

export type AudioEngineState =
  | "uninitialized"
  | "initializing"
  | "ready"
  | "suspended"
  | "error";

export interface DrumStep {
  active: boolean;
  velocity: number;
  probability: number;
  accent: boolean;
  microTiming: number; // ms
}

export interface DrumPattern {
  steps: DrumStep[][]; // [voiceIdx][stepIdx]
  numSteps: number;
  bpm: number;
  swing: number;
}

const DRUM_VOICES = [
  "kick",
  "snare",
  "clap",
  "ch",
  "oh",
  "ltom",
  "mtom",
  "htom",
  "rim",
  "cymbal",
];

class AudioEngine {
  private ctx: AudioContext | null = null;
  workletNode: AudioWorkletNode | null = null;
  private state: AudioEngineState = "uninitialized";
  private stateListeners: ((s: AudioEngineState) => void)[] = [];
  private positionListeners: ((pos: number) => void)[] = [];

  // Drum sequencer
  private pattern: DrumPattern = {
    steps: DRUM_VOICES.map(() =>
      Array.from({ length: 16 }, () => ({
        active: false,
        velocity: 100,
        probability: 100,
        accent: false,
        microTiming: 0,
      })),
    ),
    numSteps: 16,
    bpm: 120,
    swing: 0,
  };
  private isPlaying = false;
  private currentStep = 0;
  private nextStepTime = 0;
  private schedulerTimer: ReturnType<typeof setInterval> | null = null;
  private _scheduleAhead = 0.1; // 100ms lookahead
  private _scheduleInterval = 25; // ms

  // Wavetable
  private wavetableFrames: Float32Array[] = [];
  private currentWavetableType = "harmonic_smooth";
  private _currentWtPos = 0;

  // LFO animation
  private _lfoAnimFrame: number | null = null;

  async initialize(): Promise<void> {
    if (this.state === "ready") return;
    this._setState("initializing");

    try {
      this.ctx = new AudioContext({
        sampleRate: 44100,
        latencyHint: "interactive",
      });
      await this.ctx.audioWorklet.addModule("/wavetable-worklet.js");

      this.workletNode = new AudioWorkletNode(this.ctx, "wavetable-processor", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      this.workletNode.connect(this.ctx.destination);

      // Generate default wavetable
      await this.loadWavetableByType("harmonic_smooth");

      this._setState("ready");
    } catch (e) {
      console.error("AudioEngine init error:", e);
      this._setState("error");
    }
  }

  async ensureRunning(): Promise<void> {
    if (!this.ctx) await this.initialize();
    if (this.ctx?.state === "suspended") {
      await this.ctx.resume();
      this._setState("ready");
    }
  }

  get engineState(): AudioEngineState {
    return this.state;
  }
  get audioContext(): AudioContext | null {
    return this.ctx;
  }

  onStateChange(fn: (s: AudioEngineState) => void): () => void {
    this.stateListeners.push(fn);
    return () => {
      this.stateListeners = this.stateListeners.filter((l) => l !== fn);
    };
  }

  onPositionChange(fn: (pos: number) => void): () => void {
    this.positionListeners.push(fn);
    return () => {
      this.positionListeners = this.positionListeners.filter((l) => l !== fn);
    };
  }

  private _setState(s: AudioEngineState) {
    this.state = s;
    for (const fn of this.stateListeners) fn(s);
  }

  _post(msg: Record<string, unknown>) {
    this.workletNode?.port.postMessage(msg);
  }

  noteOn(midi: number, velocity: number) {
    this._post({ type: "noteOn", note: midi, velocity });
  }

  noteOff(midi: number) {
    this._post({ type: "noteOff", note: midi });
  }

  setParam(name: string, value: number) {
    this._post({ type: "setParam", name, value });
  }

  setParams(params: Record<string, number>) {
    this._post({ type: "setParams", params });
  }

  allNotesOff() {
    this._post({ type: "allNotesOff" });
  }

  async loadWavetableByType(type: string, numFrames = 64) {
    this.currentWavetableType = type;
    this.wavetableFrames = generateWavetableFrames(type, numFrames);
    this._sendWavetable();
  }

  loadCustomWavetable(frames: Float32Array[]) {
    this.wavetableFrames = frames;
    this._sendWavetable();
  }

  private _sendWavetable() {
    if (!this.workletNode) return;
    const data = this.wavetableFrames.map((f) => Array.from(f));
    this._post({ type: "loadWavetable", frames: data });
  }

  getWavetableFrames(): Float32Array[] {
    return this.wavetableFrames;
  }

  applyPreset(preset: SynthPreset) {
    // Load wavetable for this preset
    this.loadWavetableByType(preset.wavetableType);

    // Extract all numeric params
    const params: Record<string, number> = {
      wtPos: preset.wtPos,
      scanSpeed: preset.scanSpeed,
      unisonVoices: preset.unisonVoices,
      unisonDetune: preset.unisonDetune,
      stereoSpread: preset.stereoSpread,
      subLevel: preset.subLevel,
      subType: preset.subType,
      noiseLevel: preset.noiseLevel,
      noiseType: preset.noiseType,
      driftAmount: preset.driftAmount,
      octave: preset.octave,
      fineTune: preset.fineTune,
      oscLevel: preset.oscLevel,
      env1Attack: preset.env1Attack,
      env1Decay: preset.env1Decay,
      env1Sustain: preset.env1Sustain,
      env1Release: preset.env1Release,
      env2Attack: preset.env2Attack,
      env2Decay: preset.env2Decay,
      env2Sustain: preset.env2Sustain,
      env2Release: preset.env2Release,
      env3Attack: preset.env3Attack,
      env3Decay: preset.env3Decay,
      env3Sustain: preset.env3Sustain,
      env3Release: preset.env3Release,
      filter1Mode: preset.filter1Mode,
      filter1Cutoff: preset.filter1Cutoff,
      filter1Res: preset.filter1Res,
      filter1Drive: preset.filter1Drive,
      filter1EnvAmt: preset.filter1EnvAmt,
      filter2Mode: preset.filter2Mode,
      filter2Cutoff: preset.filter2Cutoff,
      filter2Res: preset.filter2Res,
      filter2Drive: preset.filter2Drive,
      filter2EnvAmt: preset.filter2EnvAmt,
      filterRouting: preset.filterRouting,
      keyTracking: preset.keyTracking,
      lfo1Rate: preset.lfo1Rate,
      lfo1Shape: preset.lfo1Shape,
      lfo1Depth: preset.lfo1Depth,
      lfo1Phase: preset.lfo1Phase,
      lfo2Rate: preset.lfo2Rate,
      lfo2Shape: preset.lfo2Shape,
      lfo2Depth: preset.lfo2Depth,
      lfo2Phase: preset.lfo2Phase,
      lfo3Rate: preset.lfo3Rate,
      lfo3Shape: preset.lfo3Shape,
      lfo3Depth: preset.lfo3Depth,
      lfo3Phase: preset.lfo3Phase,
      chorusEnabled: preset.chorusEnabled,
      chorusRate: preset.chorusRate,
      chorusDepth: preset.chorusDepth,
      chorusSpread: preset.chorusSpread,
      delayEnabled: preset.delayEnabled,
      delayTime: preset.delayTime,
      delayFeedback: preset.delayFeedback,
      delaySpread: preset.delaySpread,
      reverbEnabled: preset.reverbEnabled,
      reverbSize: preset.reverbSize,
      reverbDamping: preset.reverbDamping,
      reverbPreDelay: preset.reverbPreDelay,
      satEnabled: preset.satEnabled,
      satDrive: preset.satDrive,
      limiterEnabled: preset.limiterEnabled,
      limiterThreshold: preset.limiterThreshold,
      limiterRelease: preset.limiterRelease,
      masterVolume: preset.masterVolume,
    };
    this.setParams(params);

    // Update mod matrix
    preset.modMatrix.forEach((slot, i) => {
      this._post({ type: "modMatrix", slot: i, slot_data: slot });
    });
  }

  // Drum sequencer
  setDrumPattern(pattern: DrumPattern) {
    this.pattern = pattern;
  }

  getDrumPattern(): DrumPattern {
    return this.pattern;
  }

  setStepActive(voiceIdx: number, stepIdx: number, active: boolean) {
    if (this.pattern.steps[voiceIdx]?.[stepIdx]) {
      this.pattern.steps[voiceIdx][stepIdx].active = active;
    }
  }

  setStepAccent(voiceIdx: number, stepIdx: number, accent: boolean) {
    if (this.pattern.steps[voiceIdx]?.[stepIdx]) {
      this.pattern.steps[voiceIdx][stepIdx].accent = accent;
    }
  }

  startSequencer() {
    if (!this.ctx || this.isPlaying) return;
    this.isPlaying = true;
    this.currentStep = 0;
    this.nextStepTime = this.ctx.currentTime;
    this._scheduleSteps();
    this.schedulerTimer = setInterval(
      () => this._scheduleSteps(),
      this._scheduleInterval,
    );
  }

  stopSequencer() {
    this.isPlaying = false;
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    this.currentStep = 0;
    for (const fn of this.positionListeners) fn(0);
  }

  get isSequencerPlaying(): boolean {
    return this.isPlaying;
  }

  get sequencerStep(): number {
    return this.currentStep;
  }

  setBPM(bpm: number) {
    this.pattern.bpm = Math.max(30, Math.min(300, bpm));
  }

  setSwing(swing: number) {
    this.pattern.swing = Math.max(0, Math.min(0.75, swing));
  }

  private _scheduleSteps() {
    if (!this.ctx || !this.isPlaying) return;
    const { bpm, swing, numSteps } = this.pattern;
    const secondsPerBeat = 60 / bpm;
    const secondsPerStep = secondsPerBeat / 4; // 1/16 note

    while (this.nextStepTime < this.ctx.currentTime + this._scheduleAhead) {
      const step = this.currentStep;

      // Apply swing to even steps
      let stepTime = this.nextStepTime;
      if (swing > 0 && step % 2 === 1) {
        stepTime += secondsPerStep * swing * 0.5;
      }

      this._triggerStep(step, stepTime);
      for (const fn of this.positionListeners) fn(step);

      this.currentStep = (step + 1) % numSteps;
      this.nextStepTime += secondsPerStep;
    }
  }

  private _triggerStep(step: number, time: number) {
    if (!this.ctx) return;
    const { steps } = this.pattern;

    for (let v = 0; v < DRUM_VOICES.length; v++) {
      const stepData = steps[v]?.[step];
      if (!stepData?.active) continue;

      // Probability check
      if (
        stepData.probability < 100 &&
        Math.random() * 100 > stepData.probability
      )
        continue;

      const velocity = stepData.accent ? 127 : stepData.velocity;
      const delay = stepData.microTiming / 1000;
      const trigTime = Math.max(time + delay, this.ctx.currentTime);

      // Schedule via a tiny OscillatorNode trick for precise timing
      if (trigTime <= this.ctx.currentTime + 0.02) {
        this._post({ type: "drumTrigger", voice: v, velocity });
      } else {
        const osc = this.ctx.createOscillator();
        osc.connect(this.ctx.destination);
        osc.frequency.value = 0;
        osc.onended = () => {
          this._post({ type: "drumTrigger", voice: v, velocity });
        };
        osc.start(trigTime);
        osc.stop(trigTime + 0.001);
      }
    }
  }

  get wtPosition(): number {
    return this._currentWtPos;
  }

  destroy() {
    this.stopSequencer();
    if (this._lfoAnimFrame) cancelAnimationFrame(this._lfoAnimFrame);
    this.ctx?.close();
    this.ctx = null;
    this.workletNode = null;
  }

  get frameSize(): number {
    return FRAME_SIZE;
  }

  get numFrames(): number {
    return this.wavetableFrames.length;
  }
}

export const audioEngine = new AudioEngine();
export default audioEngine;
