import { type Dispatch, createContext, useContext, useReducer } from "react";
import {
  EVOLVING_GLASS_PAD,
  type ModMatrixSlot,
  type SynthPreset,
  WAVETABLE_PRESETS,
} from "../audio/presets";

export type SynthMode = "wavetable" | "sc" | "experimental";
export type BrushMode =
  | "draw"
  | "smooth"
  | "harmonics"
  | "randomize"
  | "morph"
  | "harmonic-lock";

export interface DrumStep {
  active: boolean;
  velocity: number;
  probability: number;
  accent: boolean;
  microTiming: number;
  flam: number;
  ratchet: number;
  reverse: boolean;
  conditional: number; // every Nth hit, 0 = always
}

export interface DrumVoiceParams {
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  tune: number;
  decay: number;
  drive: number;
  level: number;
}

export interface GrooveState {
  isPlaying: boolean;
  currentStep: number;
  bpm: number;
  swing: number;
  numSteps: number;
  steps: DrumStep[][];
  currentPattern: number;
  patterns: number;
  humanize: boolean;
  subdivide: boolean;
  triplet: boolean;
  songMode: boolean;
  voiceParams: DrumVoiceParams[];
  drumBusCompressor: boolean;
  drumBusSaturation: number;
  drumBusReverb: number;
  drumBusDelay: number;
  sidechainKick: boolean;
}

export interface ArpState {
  enabled: boolean;
  pattern: "up" | "down" | "up-down" | "random" | "chord";
  rate: number; // BPM division: 1=1/4, 2=1/8, 4=1/16
  octaveRange: number;
  latch: boolean;
}

export interface SynthState {
  mode: SynthMode;
  activePreset: SynthPreset | null;
  engineReady: boolean;
  // Core params (mirrored from audio engine for UI)
  params: Record<string, number>;
  modMatrix: ModMatrixSlot[];
  // Canvas
  wavetableFrames: Float32Array[];
  brushMode: BrushMode;
  selectedFrame: number | null;
  canvasZoom: number;
  colorOverlay: boolean;
  // Groove
  groove: GrooveState;
  // Arp
  arp: ArpState;
  // UI
  grooveExpanded: boolean;
  activePanel: "oscillator" | "filter" | "modmatrix" | "effects";
  spectralMode: boolean;
  instabilityAmount: number;
  gmMode: boolean;
  // Keyboard
  pressedKeys: Set<number>;
  octaveShift: number;
  sustain: boolean;
  modWheelValue: number;
  pitchBendValue: number;
}

const DRUM_VOICE_COUNT = 10;
const DRUM_VOICE_NAMES = [
  "Kick",
  "Snare",
  "Clap",
  "CH",
  "OH",
  "LTom",
  "MTom",
  "HTom",
  "Rim",
  "Cymbal",
];

function defaultDrumStep(): DrumStep {
  return {
    active: false,
    velocity: 100,
    probability: 100,
    accent: false,
    microTiming: 0,
    flam: 0,
    ratchet: 1,
    reverse: false,
    conditional: 0,
  };
}

function defaultVoiceParams(): DrumVoiceParams {
  return {
    volume: 0.8,
    pan: 0,
    mute: false,
    solo: false,
    tune: 0,
    decay: 0.5,
    drive: 0,
    level: 1,
  };
}

function defaultGroove(): GrooveState {
  return {
    isPlaying: false,
    currentStep: 0,
    bpm: 120,
    swing: 0,
    numSteps: 16,
    steps: Array.from({ length: DRUM_VOICE_COUNT }, () =>
      Array.from({ length: 64 }, defaultDrumStep),
    ),
    currentPattern: 0,
    patterns: 64,
    humanize: false,
    subdivide: false,
    triplet: false,
    songMode: false,
    voiceParams: Array.from({ length: DRUM_VOICE_COUNT }, defaultVoiceParams),
    drumBusCompressor: true,
    drumBusSaturation: 0.2,
    drumBusReverb: 0.1,
    drumBusDelay: 0,
    sidechainKick: false,
  };
}

export const DRUM_NAMES = DRUM_VOICE_NAMES;

// Default params
function defaultParams(): Record<string, number> {
  return {
    wtPos: 0.2,
    scanSpeed: 0.02,
    unisonVoices: 2,
    unisonDetune: 0.08,
    stereoSpread: 0.6,
    subLevel: 0,
    subType: 0,
    noiseLevel: 0,
    noiseType: 0,
    driftAmount: 0.02,
    octave: 0,
    fineTune: 0,
    oscLevel: 0.75,
    env1Attack: 2.5,
    env1Decay: 0.5,
    env1Sustain: 0.8,
    env1Release: 5.0,
    env2Attack: 1.0,
    env2Decay: 1.0,
    env2Sustain: 0.6,
    env2Release: 2.0,
    env3Attack: 0.01,
    env3Decay: 0.2,
    env3Sustain: 0.5,
    env3Release: 1.0,
    filter1Mode: 0,
    filter1Cutoff: 3000,
    filter1Res: 0.15,
    filter1Drive: 0,
    filter1EnvAmt: 0.3,
    filter2Mode: 0,
    filter2Cutoff: 18000,
    filter2Res: 0.05,
    filter2Drive: 0,
    filter2EnvAmt: 0,
    filterRouting: 0,
    keyTracking: 0.5,
    lfo1Rate: 0.08,
    lfo1Shape: 0,
    lfo1Depth: 0.3,
    lfo1Phase: 0,
    lfo2Rate: 0.15,
    lfo2Shape: 1,
    lfo2Depth: 0.1,
    lfo2Phase: 0.25,
    lfo3Rate: 0.05,
    lfo3Shape: 0,
    lfo3Depth: 0.05,
    lfo3Phase: 0,
    chorusEnabled: 1,
    chorusRate: 0.4,
    chorusDepth: 0.004,
    chorusSpread: 0.6,
    delayEnabled: 0,
    delayTime: 0.375,
    delayFeedback: 0.3,
    delaySpread: 0.5,
    reverbEnabled: 1,
    reverbSize: 0.8,
    reverbDamping: 0.4,
    reverbPreDelay: 0.02,
    satEnabled: 0,
    satDrive: 0.1,
    limiterEnabled: 1,
    limiterThreshold: 0.95,
    limiterRelease: 0.1,
    masterVolume: 0.7,
    modWheelValue: 0,
  };
}

function defaultModMatrix(): ModMatrixSlot[] {
  return Array.from({ length: 8 }, () => ({
    source: 0,
    target: 0,
    amount: 0,
    enabled: false,
  }));
}

const initialState: SynthState = {
  mode: "wavetable",
  activePreset: EVOLVING_GLASS_PAD,
  engineReady: false,
  params: defaultParams(),
  modMatrix: defaultModMatrix(),
  wavetableFrames: [],
  brushMode: "draw",
  selectedFrame: null,
  canvasZoom: 1,
  colorOverlay: false,
  groove: defaultGroove(),
  arp: {
    enabled: false,
    pattern: "up",
    rate: 2,
    octaveRange: 1,
    latch: false,
  },
  grooveExpanded: false,
  activePanel: "oscillator",
  spectralMode: false,
  instabilityAmount: 0.5,
  gmMode: false,
  pressedKeys: new Set(),
  octaveShift: 0,
  sustain: false,
  modWheelValue: 0,
  pitchBendValue: 0,
};

export type SynthAction =
  | { type: "SET_MODE"; mode: SynthMode }
  | { type: "SET_PRESET"; preset: SynthPreset }
  | { type: "SET_ENGINE_READY"; ready: boolean }
  | { type: "SET_PARAM"; name: string; value: number }
  | { type: "SET_PARAMS"; params: Record<string, number> }
  | { type: "SET_MOD_SLOT"; slot: number; data: ModMatrixSlot }
  | { type: "SET_WAVETABLE_FRAMES"; frames: Float32Array[] }
  | { type: "SET_BRUSH_MODE"; mode: BrushMode }
  | { type: "SET_SELECTED_FRAME"; frame: number | null }
  | { type: "SET_COLOR_OVERLAY"; enabled: boolean }
  | { type: "SET_GROOVE"; groove: Partial<GrooveState> }
  | { type: "TOGGLE_STEP"; voiceIdx: number; stepIdx: number }
  | {
      type: "SET_STEP_ACCENT";
      voiceIdx: number;
      stepIdx: number;
      accent: boolean;
    }
  | {
      type: "SET_STEP_VELOCITY";
      voiceIdx: number;
      stepIdx: number;
      velocity: number;
    }
  | {
      type: "SET_STEP_PROBABILITY";
      voiceIdx: number;
      stepIdx: number;
      probability: number;
    }
  | {
      type: "SET_STEP_RATCHET";
      voiceIdx: number;
      stepIdx: number;
      ratchet: number;
    }
  | {
      type: "SET_STEP_MICROTIMING";
      voiceIdx: number;
      stepIdx: number;
      microTiming: number;
    }
  | {
      type: "SET_VOICE_PARAM";
      voiceIdx: number;
      param: keyof DrumVoiceParams;
      value: number | boolean;
    }
  | { type: "TOGGLE_GROOVE" }
  | { type: "SET_ACTIVE_PANEL"; panel: SynthState["activePanel"] }
  | { type: "TOGGLE_SPECTRAL" }
  | { type: "SET_INSTABILITY"; amount: number }
  | { type: "TOGGLE_GM_MODE" }
  | { type: "KEY_DOWN"; midi: number }
  | { type: "KEY_UP"; midi: number }
  | { type: "SET_OCTAVE_SHIFT"; shift: number }
  | { type: "SET_SUSTAIN"; sustain: boolean }
  | { type: "SET_MOD_WHEEL"; value: number }
  | { type: "SET_PITCH_BEND"; value: number }
  | { type: "SET_ARP"; arp: Partial<ArpState> }
  | { type: "SET_GROVE_STEP_COUNT"; count: number }
  | { type: "SET_GROOVE_PLAYING"; playing: boolean }
  | { type: "SET_GROOVE_STEP"; step: number };

function synthReducer(state: SynthState, action: SynthAction): SynthState {
  switch (action.type) {
    case "SET_MODE":
      return { ...state, mode: action.mode };
    case "SET_PRESET":
      return {
        ...state,
        activePreset: action.preset,
        params: { ...state.params, ...presetToParams(action.preset) },
        modMatrix: action.preset.modMatrix,
      };
    case "SET_ENGINE_READY":
      return { ...state, engineReady: action.ready };
    case "SET_PARAM":
      return {
        ...state,
        params: { ...state.params, [action.name]: action.value },
      };
    case "SET_PARAMS":
      return { ...state, params: { ...state.params, ...action.params } };
    case "SET_MOD_SLOT": {
      const newMatrix = [...state.modMatrix];
      newMatrix[action.slot] = action.data;
      return { ...state, modMatrix: newMatrix };
    }
    case "SET_WAVETABLE_FRAMES":
      return { ...state, wavetableFrames: action.frames };
    case "SET_BRUSH_MODE":
      return { ...state, brushMode: action.mode };
    case "SET_SELECTED_FRAME":
      return { ...state, selectedFrame: action.frame };
    case "SET_COLOR_OVERLAY":
      return { ...state, colorOverlay: action.enabled };
    case "SET_GROOVE":
      return { ...state, groove: { ...state.groove, ...action.groove } };
    case "TOGGLE_STEP": {
      const newSteps = state.groove.steps.map((row, vi) =>
        vi === action.voiceIdx
          ? row.map((step, si) =>
              si === action.stepIdx ? { ...step, active: !step.active } : step,
            )
          : row,
      );
      return { ...state, groove: { ...state.groove, steps: newSteps } };
    }
    case "SET_STEP_ACCENT": {
      const newSteps = state.groove.steps.map((row, vi) =>
        vi === action.voiceIdx
          ? row.map((step, si) =>
              si === action.stepIdx ? { ...step, accent: action.accent } : step,
            )
          : row,
      );
      return { ...state, groove: { ...state.groove, steps: newSteps } };
    }
    case "SET_STEP_VELOCITY": {
      const newSteps = state.groove.steps.map((row, vi) =>
        vi === action.voiceIdx
          ? row.map((step, si) =>
              si === action.stepIdx
                ? { ...step, velocity: action.velocity }
                : step,
            )
          : row,
      );
      return { ...state, groove: { ...state.groove, steps: newSteps } };
    }
    case "SET_STEP_PROBABILITY": {
      const newSteps = state.groove.steps.map((row, vi) =>
        vi === action.voiceIdx
          ? row.map((step, si) =>
              si === action.stepIdx
                ? { ...step, probability: action.probability }
                : step,
            )
          : row,
      );
      return { ...state, groove: { ...state.groove, steps: newSteps } };
    }
    case "SET_STEP_RATCHET": {
      const newSteps = state.groove.steps.map((row, vi) =>
        vi === action.voiceIdx
          ? row.map((step, si) =>
              si === action.stepIdx
                ? { ...step, ratchet: action.ratchet }
                : step,
            )
          : row,
      );
      return { ...state, groove: { ...state.groove, steps: newSteps } };
    }
    case "SET_STEP_MICROTIMING": {
      const newSteps = state.groove.steps.map((row, vi) =>
        vi === action.voiceIdx
          ? row.map((step, si) =>
              si === action.stepIdx
                ? { ...step, microTiming: action.microTiming }
                : step,
            )
          : row,
      );
      return { ...state, groove: { ...state.groove, steps: newSteps } };
    }
    case "SET_VOICE_PARAM": {
      const newVP = state.groove.voiceParams.map((vp, i) =>
        i === action.voiceIdx ? { ...vp, [action.param]: action.value } : vp,
      );
      return { ...state, groove: { ...state.groove, voiceParams: newVP } };
    }
    case "TOGGLE_GROOVE":
      return { ...state, grooveExpanded: !state.grooveExpanded };
    case "SET_ACTIVE_PANEL":
      return { ...state, activePanel: action.panel };
    case "TOGGLE_SPECTRAL":
      return { ...state, spectralMode: !state.spectralMode };
    case "SET_INSTABILITY":
      return { ...state, instabilityAmount: action.amount };
    case "TOGGLE_GM_MODE":
      return { ...state, gmMode: !state.gmMode };
    case "KEY_DOWN": {
      const newKeys = new Set(state.pressedKeys);
      newKeys.add(action.midi);
      return { ...state, pressedKeys: newKeys };
    }
    case "KEY_UP": {
      const newKeys = new Set(state.pressedKeys);
      newKeys.delete(action.midi);
      return { ...state, pressedKeys: newKeys };
    }
    case "SET_OCTAVE_SHIFT":
      return { ...state, octaveShift: Math.max(-3, Math.min(3, action.shift)) };
    case "SET_SUSTAIN":
      return { ...state, sustain: action.sustain };
    case "SET_MOD_WHEEL":
      return {
        ...state,
        modWheelValue: action.value,
        params: { ...state.params, modWheelValue: action.value },
      };
    case "SET_PITCH_BEND":
      return { ...state, pitchBendValue: action.value };
    case "SET_ARP":
      return { ...state, arp: { ...state.arp, ...action.arp } };
    case "SET_GROVE_STEP_COUNT": {
      return { ...state, groove: { ...state.groove, numSteps: action.count } };
    }
    case "SET_GROOVE_PLAYING":
      return {
        ...state,
        groove: { ...state.groove, isPlaying: action.playing },
      };
    case "SET_GROOVE_STEP":
      return {
        ...state,
        groove: { ...state.groove, currentStep: action.step },
      };
    default:
      return state;
  }
}

function presetToParams(preset: SynthPreset): Record<string, number> {
  const keys: (keyof SynthPreset)[] = [
    "wtPos",
    "scanSpeed",
    "unisonVoices",
    "unisonDetune",
    "stereoSpread",
    "subLevel",
    "subType",
    "noiseLevel",
    "noiseType",
    "driftAmount",
    "octave",
    "fineTune",
    "oscLevel",
    "env1Attack",
    "env1Decay",
    "env1Sustain",
    "env1Release",
    "env2Attack",
    "env2Decay",
    "env2Sustain",
    "env2Release",
    "env3Attack",
    "env3Decay",
    "env3Sustain",
    "env3Release",
    "filter1Mode",
    "filter1Cutoff",
    "filter1Res",
    "filter1Drive",
    "filter1EnvAmt",
    "filter2Mode",
    "filter2Cutoff",
    "filter2Res",
    "filter2Drive",
    "filter2EnvAmt",
    "filterRouting",
    "keyTracking",
    "lfo1Rate",
    "lfo1Shape",
    "lfo1Depth",
    "lfo1Phase",
    "lfo2Rate",
    "lfo2Shape",
    "lfo2Depth",
    "lfo2Phase",
    "lfo3Rate",
    "lfo3Shape",
    "lfo3Depth",
    "lfo3Phase",
    "chorusEnabled",
    "chorusRate",
    "chorusDepth",
    "chorusSpread",
    "delayEnabled",
    "delayTime",
    "delayFeedback",
    "delaySpread",
    "reverbEnabled",
    "reverbSize",
    "reverbDamping",
    "reverbPreDelay",
    "satEnabled",
    "satDrive",
    "limiterEnabled",
    "limiterThreshold",
    "limiterRelease",
    "masterVolume",
  ];
  const result: Record<string, number> = {};
  for (const k of keys) {
    const v = preset[k];
    if (typeof v === "number") result[k as string] = v;
  }
  return result;
}

// Add some default active steps for demo
function addDefaultSteps(state: SynthState): SynthState {
  // Load a default basic beat
  const presets = WAVETABLE_PRESETS;
  if (presets.length === 0) return state;

  const steps = state.groove.steps.map((row) => [...row]);
  // Kick on 1, 5, 9, 13
  for (const i of [0, 4, 8, 12]) {
    steps[0][i] = { ...steps[0][i], active: true };
  }
  // Snare on 5, 13
  for (const i of [4, 12]) {
    steps[1][i] = { ...steps[1][i], active: true };
  }
  // Hi-hat every 2 steps
  for (const i of [0, 2, 4, 6, 8, 10, 12, 14]) {
    steps[3][i] = { ...steps[3][i], active: true };
  }
  // Open hat on 8
  steps[4][6] = { ...steps[4][6], active: true };

  return { ...state, groove: { ...state.groove, steps } };
}

const initialStateWithBeat = addDefaultSteps(initialState);

// Context
type SynthContextType = { state: SynthState; dispatch: Dispatch<SynthAction> };

export const SynthContext = createContext<SynthContextType>({
  state: initialStateWithBeat,
  dispatch: () => {},
});

export function useSynth() {
  return useContext(SynthContext);
}

export { initialStateWithBeat, synthReducer };
