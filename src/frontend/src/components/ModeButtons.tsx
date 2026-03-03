import { useEffect, useRef, useState } from "react";
import audioEngine from "../audio/AudioEngine";
import {
  EXPERIMENTAL_PRESETS,
  SC_PRESETS,
  type SynthPreset,
  WAVETABLE_PRESETS,
} from "../audio/presets";
import { useSynth } from "../store/synthStore";
import { Knob } from "./Knob";

const PRESET_BANKS = {
  wavetable: WAVETABLE_PRESETS,
  sc: SC_PRESETS,
  experimental: EXPERIMENTAL_PRESETS,
};

export function ModeButtons() {
  const { state, dispatch } = useSynth();
  const [scDropdownOpen, setScDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setScDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleModeSelect = (mode: "wavetable" | "sc" | "experimental") => {
    dispatch({ type: "SET_MODE", mode });
    const presets = PRESET_BANKS[mode];
    if (presets.length > 0) {
      loadPreset(presets[0]);
    }
  };

  const loadPreset = (preset: SynthPreset) => {
    dispatch({ type: "SET_PRESET", preset });
    if (state.engineReady) {
      audioEngine.applyPreset(preset);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Mode buttons */}
      <button
        type="button"
        className={`synth-btn ${state.mode === "wavetable" ? "active" : ""}`}
        onClick={() => handleModeSelect("wavetable")}
      >
        Wavetable
      </button>

      {/* SC mode with dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          className={`synth-btn ${state.mode === "sc" ? "active" : ""}`}
          onClick={() => {
            handleModeSelect("sc");
            setScDropdownOpen((v) => !v);
          }}
        >
          SC Preset
        </button>
        {state.mode === "sc" && scDropdownOpen && (
          <div className="absolute top-full left-0 mt-1 z-50 modal-glass rounded shadow-lg min-w-48 py-1">
            <div className="section-label px-3 pt-1 pb-2">SC Presets</div>
            <div className="overflow-y-auto" style={{ maxHeight: 240 }}>
              {SC_PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.name}
                  className={`w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-white/5 transition-colors ${
                    state.activePreset?.name === preset.name
                      ? "text-primary"
                      : "text-muted-foreground"
                  }`}
                  style={{
                    color:
                      state.activePreset?.name === preset.name
                        ? "oklch(0.78 0.18 195)"
                        : undefined,
                  }}
                  onClick={() => {
                    loadPreset(preset);
                    setScDropdownOpen(false);
                  }}
                >
                  {preset.name}
                </button>
              ))}
            </div>
            {/* GM Mode toggle */}
            <div className="border-t border-border mt-1 pt-1 px-3 pb-1">
              <button
                type="button"
                className={`synth-btn text-xs w-full ${state.gmMode ? "amber-active" : ""}`}
                onClick={() => dispatch({ type: "TOGGLE_GM_MODE" })}
              >
                GM Mode {state.gmMode ? "ON" : "OFF"}
              </button>
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        className={`synth-btn ${state.mode === "experimental" ? "active" : ""}`}
        onClick={() => handleModeSelect("experimental")}
      >
        Experimental
      </button>

      {/* Instability knob for experimental mode */}
      {state.mode === "experimental" && (
        <div className="flex items-center gap-1">
          <Knob
            value={state.instabilityAmount}
            min={0}
            max={1}
            label="Instability"
            size={28}
            color="#ff4488"
            onChange={(v) => {
              dispatch({ type: "SET_INSTABILITY", amount: v });
              audioEngine.setParam("driftAmount", v * 0.05);
            }}
          />
        </div>
      )}

      {/* Preset buttons for current mode */}
      <div className="flex gap-1 overflow-x-auto">
        {PRESET_BANKS[state.mode].map((preset, idx) => (
          <button
            type="button"
            key={preset.name}
            className={`synth-btn whitespace-nowrap ${state.activePreset?.name === preset.name ? "active" : ""}`}
            onClick={() => loadPreset(preset)}
            title={preset.name}
          >
            {idx + 1}: {preset.name.split(" ").slice(0, 2).join(" ")}
          </button>
        ))}
      </div>
    </div>
  );
}

export default ModeButtons;
