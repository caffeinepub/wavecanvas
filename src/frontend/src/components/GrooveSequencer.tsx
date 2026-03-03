import { useCallback, useEffect, useRef, useState } from "react";
import audioEngine from "../audio/AudioEngine";
import { DRUM_NAMES, useSynth } from "../store/synthStore";
import type { DrumStep } from "../store/synthStore";
import { Knob } from "./Knob";

const STEP_COUNTS = [16, 32, 64];

interface StepPopupProps {
  step: DrumStep;
  voiceIdx: number;
  stepIdx: number;
  onClose: () => void;
}

function StepPopup({ step, voiceIdx, stepIdx, onClose }: StepPopupProps) {
  const { dispatch } = useSynth();
  return (
    <div
      className="fixed z-50 modal-glass rounded p-3 text-xs font-mono shadow-lg"
      style={{ minWidth: 200 }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="section-label">
          {DRUM_NAMES[voiceIdx]} step {stepIdx + 1}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="synth-btn py-0 px-1"
          style={{ fontSize: "0.6rem" }}
        >
          ✕
        </button>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="section-label w-16">Velocity</span>
          <input
            type="range"
            min={0}
            max={127}
            value={step.velocity}
            className="flex-1"
            onChange={(e) =>
              dispatch({
                type: "SET_STEP_VELOCITY",
                voiceIdx,
                stepIdx,
                velocity: Number.parseInt(e.target.value),
              })
            }
          />
          <span style={{ color: "oklch(0.78 0.18 195)", minWidth: 28 }}>
            {step.velocity}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="section-label w-16">Prob %</span>
          <input
            type="range"
            min={0}
            max={100}
            value={step.probability}
            className="flex-1"
            onChange={(e) =>
              dispatch({
                type: "SET_STEP_PROBABILITY",
                voiceIdx,
                stepIdx,
                probability: Number.parseInt(e.target.value),
              })
            }
          />
          <span style={{ color: "oklch(0.78 0.18 195)", minWidth: 28 }}>
            {step.probability}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="section-label w-16">Timing</span>
          <input
            type="range"
            min={-20}
            max={20}
            step={1}
            value={step.microTiming}
            className="flex-1"
            onChange={(e) =>
              dispatch({
                type: "SET_STEP_MICROTIMING",
                voiceIdx,
                stepIdx,
                microTiming: Number.parseInt(e.target.value),
              })
            }
          />
          <span style={{ color: "oklch(0.78 0.18 195)", minWidth: 32 }}>
            {step.microTiming}ms
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="section-label w-16">Ratchet</span>
          <div className="flex gap-1 flex-1">
            {[1, 2, 3, 4].map((r) => (
              <button
                type="button"
                key={r}
                className={`synth-btn py-0 ${step.ratchet === r ? "active" : ""}`}
                style={{ fontSize: "0.6rem", flex: 1 }}
                onClick={() =>
                  dispatch({
                    type: "SET_STEP_RATCHET",
                    voiceIdx,
                    stepIdx,
                    ratchet: r,
                  })
                }
              >
                {r}x
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className={`synth-btn text-xs py-0.5 ${step.accent ? "amber-active" : ""}`}
          onClick={() =>
            dispatch({
              type: "SET_STEP_ACCENT",
              voiceIdx,
              stepIdx,
              accent: !step.accent,
            })
          }
        >
          Accent {step.accent ? "ON" : "OFF"}
        </button>
      </div>
    </div>
  );
}

export function GrooveSequencer() {
  const { state, dispatch } = useSynth();
  const groove = state.groove;
  const [popup, setPopup] = useState<{
    voiceIdx: number;
    stepIdx: number;
    x: number;
    y: number;
  } | null>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Sync sequencer state
  useEffect(() => {
    const unsub = audioEngine.onPositionChange((step) => {
      dispatch({ type: "SET_GROOVE_STEP", step });
    });
    return unsub;
  }, [dispatch]);

  const handlePlayStop = async () => {
    await audioEngine.ensureRunning();
    if (groove.isPlaying) {
      audioEngine.stopSequencer();
      dispatch({ type: "SET_GROOVE_PLAYING", playing: false });
    } else {
      audioEngine.setBPM(groove.bpm);
      audioEngine.setSwing(groove.swing);
      audioEngine.setDrumPattern({
        steps: groove.steps.map((row) =>
          row.slice(0, groove.numSteps).map((s) => ({
            active: s.active,
            velocity: s.velocity,
            probability: s.probability,
            accent: s.accent,
            microTiming: s.microTiming,
          })),
        ),
        numSteps: groove.numSteps,
        bpm: groove.bpm,
        swing: groove.swing,
      });
      audioEngine.startSequencer();
      dispatch({ type: "SET_GROOVE_PLAYING", playing: true });
    }
  };

  // Sync BPM and swing to engine
  useEffect(() => {
    if (groove.isPlaying) {
      audioEngine.setBPM(groove.bpm);
      audioEngine.setSwing(groove.swing);
    }
  }, [groove.bpm, groove.swing, groove.isPlaying]);

  // Sync step changes to engine
  useEffect(() => {
    if (groove.isPlaying) {
      audioEngine.setDrumPattern({
        steps: groove.steps.map((row) =>
          row.slice(0, groove.numSteps).map((s) => ({
            active: s.active,
            velocity: s.velocity,
            probability: s.probability,
            accent: s.accent,
            microTiming: s.microTiming,
          })),
        ),
        numSteps: groove.numSteps,
        bpm: groove.bpm,
        swing: groove.swing,
      });
    }
  }, [
    groove.steps,
    groove.numSteps,
    groove.isPlaying,
    groove.bpm,
    groove.swing,
  ]);

  const handleStepDown = (
    voiceIdx: number,
    stepIdx: number,
    e: React.MouseEvent,
  ) => {
    longPressRef.current = setTimeout(() => {
      longPressRef.current = null;
      setPopup({ voiceIdx, stepIdx, x: e.clientX, y: e.clientY });
    }, 400);
  };

  const handleStepUp = (voiceIdx: number, stepIdx: number) => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
      dispatch({ type: "TOGGLE_STEP", voiceIdx, stepIdx });
    }
  };

  const randomizePattern = useCallback(() => {
    for (let v = 0; v < DRUM_NAMES.length; v++) {
      for (let s = 0; s < groove.numSteps; s++) {
        if (Math.random() < 0.25) {
          dispatch({ type: "TOGGLE_STEP", voiceIdx: v, stepIdx: s });
        }
      }
    }
  }, [groove.numSteps, dispatch]);

  const clearPattern = () => {
    for (let v = 0; v < DRUM_NAMES.length; v++) {
      for (let s = 0; s < 64; s++) {
        const step = groove.steps[v][s];
        if (step.active)
          dispatch({ type: "TOGGLE_STEP", voiceIdx: v, stepIdx: s });
      }
    }
  };

  if (!state.grooveExpanded) return null;

  return (
    <div
      className="synth-panel border-t border-border"
      style={{ minHeight: 280, maxHeight: 380 }}
    >
      {/* Top controls */}
      <div className="flex items-center gap-2 p-2 border-b border-border flex-wrap">
        {/* Play/Stop */}
        <button
          type="button"
          className={`synth-btn ${groove.isPlaying ? "amber-active" : "active"}`}
          onClick={handlePlayStop}
          style={{ minWidth: 40 }}
        >
          {groove.isPlaying ? "■" : "▶"}
        </button>

        {/* BPM */}
        <div className="flex items-center gap-1">
          <span className="section-label">BPM</span>
          <input
            type="number"
            min={30}
            max={300}
            value={groove.bpm}
            className="w-14 text-center font-mono text-xs rounded px-1 py-0.5"
            style={{
              background: "oklch(0.07 0.005 255)",
              border: "1px solid oklch(0.22 0.012 240)",
              color: "oklch(0.78 0.18 195)",
              fontSize: "0.7rem",
            }}
            onChange={(e) => {
              const bpm = Number.parseInt(e.target.value) || 120;
              dispatch({ type: "SET_GROOVE", groove: { bpm } });
            }}
          />
        </div>

        {/* Swing */}
        <div className="flex items-center gap-1">
          <Knob
            value={groove.swing}
            min={0}
            max={0.75}
            label="Swing"
            size={26}
            color="#ffaa00"
            onChange={(v) =>
              dispatch({ type: "SET_GROOVE", groove: { swing: v } })
            }
            formatValue={(v) => `${(v * 100).toFixed(0)}%`}
          />
        </div>

        {/* Steps selector */}
        <div className="flex gap-1">
          {STEP_COUNTS.map((n) => (
            <button
              type="button"
              key={n}
              className={`synth-btn text-xs py-0 ${groove.numSteps === n ? "active" : ""}`}
              style={{ fontSize: "0.6rem", padding: "1px 6px" }}
              onClick={() =>
                dispatch({ type: "SET_GROVE_STEP_COUNT", count: n })
              }
            >
              {n}
            </button>
          ))}
        </div>

        {/* Actions */}
        <button
          type="button"
          className="synth-btn text-xs py-0"
          style={{ fontSize: "0.6rem" }}
          onClick={randomizePattern}
        >
          RAND
        </button>
        <button
          type="button"
          className="synth-btn text-xs py-0"
          style={{ fontSize: "0.6rem" }}
          onClick={clearPattern}
        >
          CLR
        </button>

        {/* Humanize toggle */}
        <button
          type="button"
          className={`synth-btn text-xs py-0 ${groove.humanize ? "active" : ""}`}
          style={{ fontSize: "0.6rem", padding: "1px 6px" }}
          onClick={() =>
            dispatch({
              type: "SET_GROOVE",
              groove: { humanize: !groove.humanize },
            })
          }
        >
          HUMAN
        </button>
      </div>

      {/* Step grid */}
      <div
        ref={scrollRef}
        className="overflow-x-auto p-2"
        style={{ overscrollBehavior: "contain" }}
      >
        <div style={{ minWidth: groove.numSteps * 24 + 80 }}>
          {DRUM_NAMES.map((name, voiceIdx) => {
            const vp = groove.voiceParams[voiceIdx];
            return (
              <div
                key={name}
                className="flex items-center mb-1 gap-1"
                style={{ height: 22 }}
              >
                {/* Voice name */}
                <div
                  className="section-label text-right flex-shrink-0"
                  style={{ width: 38, fontSize: "0.55rem" }}
                >
                  {name}
                </div>

                {/* Steps */}
                <div className="flex gap-0.5 flex-1">
                  {groove.steps[voiceIdx]
                    ?.slice(0, groove.numSteps)
                    .map((step, stepIdx) => {
                      const isActive = step?.active;
                      const isAccent = step?.accent;
                      const isPlayhead =
                        groove.isPlaying && groove.currentStep === stepIdx;
                      const isGroupBorder = stepIdx % 4 === 0 && stepIdx > 0;

                      // biome-ignore lint/suspicious/noArrayIndexKey: step indices are stable positions in the grid
                      return (
                        <button
                          type="button"
                          key={`step-v${voiceIdx}-s${stepIdx}`}
                          className={`step-btn flex-shrink-0 ${isActive ? (isAccent ? "accent" : "active") : ""} ${isPlayhead ? "playhead" : ""}`}
                          style={{
                            width: 20,
                            height: 18,
                            marginLeft: isGroupBorder ? 3 : undefined,
                            opacity: vp.mute ? 0.3 : 1,
                          }}
                          onMouseDown={(e) =>
                            handleStepDown(voiceIdx, stepIdx, e)
                          }
                          onMouseUp={() => handleStepUp(voiceIdx, stepIdx)}
                          onMouseLeave={() => {
                            if (longPressRef.current) {
                              clearTimeout(longPressRef.current);
                              longPressRef.current = null;
                            }
                          }}
                        />
                      );
                    })}
                </div>

                {/* Voice controls */}
                <div className="flex items-center gap-1 ml-1 flex-shrink-0">
                  <button
                    type="button"
                    className={`synth-btn py-0 ${vp.mute ? "amber-active" : ""}`}
                    style={{
                      fontSize: "0.5rem",
                      padding: "0px 3px",
                      minWidth: 20,
                    }}
                    onClick={() =>
                      dispatch({
                        type: "SET_VOICE_PARAM",
                        voiceIdx,
                        param: "mute",
                        value: !vp.mute,
                      })
                    }
                  >
                    M
                  </button>
                  <button
                    type="button"
                    className={`synth-btn py-0 ${vp.solo ? "active" : ""}`}
                    style={{
                      fontSize: "0.5rem",
                      padding: "0px 3px",
                      minWidth: 20,
                    }}
                    onClick={() =>
                      dispatch({
                        type: "SET_VOICE_PARAM",
                        voiceIdx,
                        param: "solo",
                        value: !vp.solo,
                      })
                    }
                  >
                    S
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={vp.volume}
                    className="w-14"
                    style={{ accentColor: "oklch(0.78 0.18 195)" }}
                    onChange={(e) =>
                      dispatch({
                        type: "SET_VOICE_PARAM",
                        voiceIdx,
                        param: "volume",
                        value: Number.parseFloat(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Drum bus */}
      <div className="flex items-center gap-3 px-3 pb-2 border-t border-border pt-2">
        <span className="section-label">DRUM BUS</span>
        <button
          type="button"
          className={`synth-btn py-0 text-xs ${groove.drumBusCompressor ? "active" : ""}`}
          style={{ fontSize: "0.6rem" }}
          onClick={() =>
            dispatch({
              type: "SET_GROOVE",
              groove: { drumBusCompressor: !groove.drumBusCompressor },
            })
          }
        >
          COMP
        </button>
        <Knob
          value={groove.drumBusSaturation}
          min={0}
          max={1}
          label="SAT"
          size={22}
          color="#ffaa00"
          onChange={(v) =>
            dispatch({ type: "SET_GROOVE", groove: { drumBusSaturation: v } })
          }
        />
        <Knob
          value={groove.drumBusReverb}
          min={0}
          max={1}
          label="REV"
          size={22}
          color="#aa88ff"
          onChange={(v) =>
            dispatch({ type: "SET_GROOVE", groove: { drumBusReverb: v } })
          }
        />
        <Knob
          value={groove.drumBusDelay}
          min={0}
          max={1}
          label="DLY"
          size={22}
          color="#44ffaa"
          onChange={(v) =>
            dispatch({ type: "SET_GROOVE", groove: { drumBusDelay: v } })
          }
        />
        <button
          type="button"
          className={`synth-btn py-0 text-xs ${groove.sidechainKick ? "amber-active" : ""}`}
          style={{ fontSize: "0.6rem" }}
          onClick={() =>
            dispatch({
              type: "SET_GROOVE",
              groove: { sidechainKick: !groove.sidechainKick },
            })
          }
        >
          SIDECHAIN
        </button>
      </div>

      {/* Step popup */}
      {popup && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setPopup(null)}
          onKeyDown={() => setPopup(null)}
        >
          <div style={{ position: "absolute", left: popup.x, top: popup.y }}>
            <StepPopup
              step={state.groove.steps[popup.voiceIdx][popup.stepIdx]}
              voiceIdx={popup.voiceIdx}
              stepIdx={popup.stepIdx}
              onClose={() => setPopup(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default GrooveSequencer;
