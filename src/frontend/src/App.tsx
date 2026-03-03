import { Toaster } from "@/components/ui/sonner";
import { useEffect, useReducer, useRef, useState } from "react";
import audioEngine from "./audio/AudioEngine";
import { EVOLVING_GLASS_PAD } from "./audio/presets";
import { generateWavetableFrames } from "./audio/wavetable-utils";
import {
  SynthContext,
  initialStateWithBeat,
  synthReducer,
} from "./store/synthStore";

import { FilterPanel } from "./components/FilterPanel";
import { GrooveSequencer } from "./components/GrooveSequencer";
import { KeyboardSection } from "./components/KeyboardSection";
import { Knob } from "./components/Knob";
import { ModMatrix } from "./components/ModMatrix";
import { ModeButtons } from "./components/ModeButtons";
import { OscillatorPanel } from "./components/OscillatorPanel";
import { SnapshotManager } from "./components/SnapshotManager";
import { WavetableCanvas } from "./components/WavetableCanvas";

// Audio init overlay
function AudioOverlay({ onEnable }: { onEnable: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center cursor-pointer"
      style={{
        background: "oklch(0.06 0.005 255 / 0.95)",
        backdropFilter: "blur(8px)",
      }}
      onClick={onEnable}
      onKeyDown={(e) => e.key === "Enter" && onEnable()}
    >
      <div className="flex flex-col items-center gap-6 max-w-sm text-center px-8">
        {/* Logo */}
        <div className="relative">
          <div
            className="text-4xl font-mono font-bold tracking-widest"
            style={{
              color: "oklch(0.78 0.18 195)",
              textShadow:
                "0 0 20px oklch(0.78 0.18 195 / 0.6), 0 0 40px oklch(0.78 0.18 195 / 0.3)",
              letterSpacing: "0.25em",
            }}
          >
            WAVE<span style={{ color: "oklch(0.72 0.19 55)" }}>CANVAS</span>
          </div>
          <div
            className="section-label mt-1"
            style={{ letterSpacing: "0.3em" }}
          >
            WAVETABLE SYNTHESIS ENGINE
          </div>
        </div>

        {/* Animated ring */}
        <div className="relative" style={{ width: 80, height: 80 }}>
          <svg
            width={80}
            height={80}
            viewBox="0 0 80 80"
            aria-label="Loading animation"
          >
            <title>Loading</title>
            <circle
              cx={40}
              cy={40}
              r={34}
              fill="none"
              stroke="oklch(0.22 0.012 240)"
              strokeWidth={2}
            />
            <circle
              cx={40}
              cy={40}
              r={34}
              fill="none"
              stroke="oklch(0.78 0.18 195)"
              strokeWidth={2}
              strokeDasharray={`${213 * 0.75} ${213}`}
              strokeLinecap="round"
              style={{
                transform: "rotate(-90deg)",
                transformOrigin: "40px 40px",
                animation: "rotate-ring 3s linear infinite",
              }}
            />
          </svg>
          <div
            className="absolute inset-0 flex items-center justify-center font-mono text-lg"
            style={{ color: "oklch(0.78 0.18 195)" }}
          >
            ▶
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="synth-btn active text-base py-2 px-8"
            style={{ fontSize: "0.8rem", letterSpacing: "0.2em" }}
          >
            CLICK TO ENABLE AUDIO
          </button>
          <div className="section-label">
            Web Audio API · AudioWorklet Engine · 44.1kHz
          </div>
        </div>

        <div className="section-label opacity-60">
          QWERTY keyboard enabled · MIDI support
        </div>
      </div>

      <style>{`
        @keyframes rotate-ring {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: -213; }
        }
      `}</style>
    </div>
  );
}

type PanelType = "oscillator" | "filter" | "modmatrix" | "effects";

export default function App() {
  const [state, dispatch] = useReducer(synthReducer, initialStateWithBeat);
  const [audioReady, setAudioReady] = useState(false);
  const [activePanel, setActivePanel] = useState<PanelType>("oscillator");
  const initRef = useRef(false);

  const initAudio = async () => {
    if (initRef.current) return;
    initRef.current = true;

    await audioEngine.initialize();
    const frames = generateWavetableFrames(
      EVOLVING_GLASS_PAD.wavetableType,
      64,
    );
    audioEngine.loadCustomWavetable(frames);
    dispatch({ type: "SET_WAVETABLE_FRAMES", frames });

    audioEngine.applyPreset(EVOLVING_GLASS_PAD);
    dispatch({ type: "SET_ENGINE_READY", ready: true });
    setAudioReady(true);
  };

  // Engine state change listener
  useEffect(() => {
    const unsub = audioEngine.onStateChange((s) => {
      if (s === "ready") {
        dispatch({ type: "SET_ENGINE_READY", ready: true });
        setAudioReady(true);
      }
    });
    return unsub;
  }, []);

  return (
    <SynthContext.Provider value={{ state, dispatch }}>
      <div
        className="flex flex-col"
        style={{
          height: "100vh",
          width: "100vw",
          overflow: "hidden",
          background: "oklch(0.08 0.005 250)",
          color: "oklch(0.92 0.01 200)",
        }}
      >
        {/* TOP BAR */}
        <header
          className="flex items-center gap-3 px-3 py-1.5 border-b border-border flex-shrink-0 flex-wrap"
          style={{ background: "oklch(0.10 0.007 250)", minHeight: 44 }}
        >
          {/* Logo */}
          <div
            className="font-mono font-bold tracking-widest text-sm flex-shrink-0"
            style={{
              color: "oklch(0.78 0.18 195)",
              textShadow: "0 0 8px oklch(0.78 0.18 195 / 0.4)",
              letterSpacing: "0.15em",
            }}
          >
            WAVE<span style={{ color: "oklch(0.72 0.19 55)" }}>CANVAS</span>
          </div>

          {/* Engine status LED */}
          <div
            className={audioReady ? "led-green" : "led-off"}
            title={audioReady ? "Audio Ready" : "Audio Not Started"}
          />

          {/* BPM */}
          <div className="flex items-center gap-1">
            <span className="section-label">BPM</span>
            <input
              type="number"
              min={30}
              max={300}
              value={state.groove.bpm}
              className="w-12 text-center font-mono text-xs rounded px-1 py-0.5"
              style={{
                background: "oklch(0.07 0.005 255)",
                border: "1px solid oklch(0.22 0.012 240)",
                color: "oklch(0.78 0.18 195)",
                fontSize: "0.7rem",
              }}
              onChange={(e) => {
                const bpm = Number.parseInt(e.target.value) || 120;
                dispatch({ type: "SET_GROOVE", groove: { bpm } });
                audioEngine.setBPM(bpm);
              }}
            />
          </div>

          {/* Master volume */}
          <Knob
            value={state.params.masterVolume ?? 0.7}
            min={0}
            max={1}
            label="Vol"
            size={26}
            color="#00d4ff"
            onChange={(v) => {
              dispatch({ type: "SET_PARAM", name: "masterVolume", value: v });
              audioEngine.setParam("masterVolume", v);
            }}
          />

          {/* Mode buttons */}
          <div className="flex-1 min-w-0 overflow-x-auto">
            <ModeButtons />
          </div>

          {/* Groove toggle */}
          <button
            type="button"
            className={`synth-btn flex-shrink-0 ${state.grooveExpanded ? "amber-active" : ""}`}
            onClick={() => dispatch({ type: "TOGGLE_GROOVE" })}
          >
            Groove Seq
          </button>

          {/* Snapshots */}
          <SnapshotManager />
        </header>

        {/* MAIN BODY */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* LEFT: Canvas */}
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            {/* Wavetable canvas */}
            <div
              className="flex-shrink-0"
              style={{
                height: 200,
                borderBottom: "1px solid oklch(0.22 0.012 240)",
              }}
            >
              <WavetableCanvas />
            </div>

            {/* Panel tabs */}
            <div
              className="flex gap-0 border-b border-border flex-shrink-0"
              style={{ background: "oklch(0.10 0.007 250)" }}
            >
              {(
                ["oscillator", "modmatrix", "filter", "effects"] as PanelType[]
              ).map((panel) => (
                <button
                  type="button"
                  key={panel}
                  className={`synth-btn rounded-none border-0 border-r border-border ${activePanel === panel ? "active" : ""}`}
                  style={{ borderRadius: 0, padding: "4px 12px" }}
                  onClick={() => setActivePanel(panel)}
                >
                  {panel === "oscillator"
                    ? "OSC + ENV"
                    : panel === "modmatrix"
                      ? "MOD MATRIX"
                      : panel === "filter"
                        ? "FILTER"
                        : "FX"}
                </button>
              ))}
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
              {activePanel === "oscillator" && <OscillatorPanel />}
              {activePanel === "modmatrix" && <ModMatrix />}
              {activePanel === "filter" && <FilterPanel />}
              {activePanel === "effects" && <FilterPanel />}
            </div>
          </div>
        </div>

        {/* GROOVE SEQUENCER (collapsible) */}
        <div className="flex-shrink-0 border-t border-border">
          <GrooveSequencer />
        </div>

        {/* KEYBOARD */}
        <div
          className="flex-shrink-0 border-t border-border"
          style={{ background: "oklch(0.10 0.007 250)" }}
        >
          <KeyboardSection />
        </div>

        {/* FOOTER */}
        <footer
          className="flex items-center justify-center py-0.5 border-t border-border flex-shrink-0"
          style={{ background: "oklch(0.09 0.006 250)" }}
        >
          <span className="section-label opacity-50">
            © {new Date().getFullYear()}. Built with love using{" "}
            <a
              href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
              className="underline hover:opacity-80"
              target="_blank"
              rel="noopener noreferrer"
            >
              caffeine.ai
            </a>
          </span>
        </footer>

        <Toaster />
      </div>

      {/* Audio enable overlay */}
      {!audioReady && <AudioOverlay onEnable={initAudio} />}
    </SynthContext.Provider>
  );
}
