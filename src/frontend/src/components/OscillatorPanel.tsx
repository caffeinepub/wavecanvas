import { Switch } from "@/components/ui/switch";
import audioEngine from "../audio/AudioEngine";
import { useSynth } from "../store/synthStore";
import { Knob } from "./Knob";

interface OscStripProps {
  id: number;
  enabled: boolean;
  onToggle: () => void;
}

function OscStrip({ id }: OscStripProps) {
  const { state, dispatch } = useSynth();
  const p = state.params;

  const setParam = (name: string, value: number) => {
    dispatch({ type: "SET_PARAM", name, value });
    audioEngine.setParam(name, value);
  };

  // Only osc 1 is fully connected for now (demo)
  const active = id === 0;

  return (
    <div
      className={`synth-panel-raised rounded p-2 ${!active ? "opacity-50" : ""}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className={active ? "led-cyan" : "led-off"} />
        <span className="section-label">OSC {id + 1}</span>
        {active && (
          <span
            className="section-label ml-auto"
            style={{ color: "oklch(0.78 0.18 195)" }}
          >
            ACTIVE
          </span>
        )}
      </div>

      {active ? (
        <div className="flex flex-wrap gap-2">
          <Knob
            value={p.wtPos ?? 0}
            min={0}
            max={1}
            label="WT Pos"
            size={32}
            color="#00d4ff"
            onChange={(v) => setParam("wtPos", v)}
          />
          <Knob
            value={p.octave ?? 0}
            min={-2}
            max={2}
            step={1}
            label="Octave"
            size={32}
            bipolar
            color="#88aaff"
            onChange={(v) => setParam("octave", Math.round(v))}
            formatValue={(v) => `${v >= 0 ? "+" : ""}${Math.round(v)}`}
          />
          <Knob
            value={p.fineTune ?? 0}
            min={-100}
            max={100}
            label="Fine"
            size={32}
            bipolar
            color="#88aaff"
            onChange={(v) => setParam("fineTune", v)}
            formatValue={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(0)}¢`}
          />
          <Knob
            value={p.oscLevel ?? 0.8}
            min={0}
            max={1}
            label="Level"
            size={32}
            color="#00d4ff"
            onChange={(v) => setParam("oscLevel", v)}
          />
          <div className="flex flex-col items-center gap-0.5">
            <Knob
              value={p.subLevel ?? 0}
              min={0}
              max={1}
              label="Sub"
              size={28}
              color="#4488ff"
              onChange={(v) => setParam("subLevel", v)}
            />
            <button
              type="button"
              className={`synth-btn text-xs py-0 ${p.subType === 0 ? "active" : ""}`}
              style={{ fontSize: "0.5rem", padding: "1px 4px" }}
              onClick={() => setParam("subType", p.subType === 0 ? 1 : 0)}
            >
              {p.subType === 0 ? "SIN" : "SQR"}
            </button>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <Knob
              value={p.noiseLevel ?? 0}
              min={0}
              max={0.5}
              label="Noise"
              size={28}
              color="#888888"
              onChange={(v) => setParam("noiseLevel", v)}
            />
            <button
              type="button"
              className={`synth-btn text-xs py-0 ${p.noiseType === 0 ? "" : "active"}`}
              style={{ fontSize: "0.5rem", padding: "1px 4px" }}
              onClick={() => setParam("noiseType", p.noiseType === 0 ? 1 : 0)}
            >
              {p.noiseType === 0 ? "WHT" : "PNK"}
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center section-label py-3">Disabled</div>
      )}
    </div>
  );
}

function UnisonSection() {
  const { state, dispatch } = useSynth();
  const p = state.params;

  const setParam = (name: string, value: number) => {
    dispatch({ type: "SET_PARAM", name, value });
    audioEngine.setParam(name, value);
  };

  return (
    <div className="synth-panel-raised rounded p-2">
      <div className="section-label mb-2">UNISON / DRIFT</div>
      <div className="flex gap-2 flex-wrap">
        <Knob
          value={p.unisonVoices ?? 1}
          min={1}
          max={8}
          step={1}
          label="Voices"
          size={32}
          color="#ffaa00"
          onChange={(v) => setParam("unisonVoices", Math.round(v))}
          formatValue={(v) => `${Math.round(v)}v`}
        />
        <Knob
          value={p.unisonDetune ?? 0.1}
          min={0}
          max={1}
          label="Detune"
          size={32}
          color="#ffaa00"
          onChange={(v) => setParam("unisonDetune", v)}
        />
        <Knob
          value={p.stereoSpread ?? 0.5}
          min={0}
          max={1}
          label="Spread"
          size={32}
          color="#ffaa00"
          onChange={(v) => setParam("stereoSpread", v)}
        />
        <Knob
          value={p.driftAmount ?? 0.01}
          min={0}
          max={0.1}
          label="Drift"
          size={32}
          color="#88aaff"
          onChange={(v) => setParam("driftAmount", v)}
        />
        <Knob
          value={p.masterVolume ?? 0.7}
          min={0}
          max={1}
          label="Master"
          size={32}
          color="#00d4ff"
          onChange={(v) => setParam("masterVolume", v)}
        />
      </div>
    </div>
  );
}

function EnvelopeSection() {
  const { state, dispatch } = useSynth();
  const p = state.params;

  const setParam = (name: string, value: number) => {
    dispatch({ type: "SET_PARAM", name, value });
    audioEngine.setParam(name, value);
  };

  const envs = [
    { id: 1, color: "#00d4ff", label: "ENV 1 (AMP)" },
    { id: 2, color: "#44ffaa", label: "ENV 2 (MOD)" },
    { id: 3, color: "#ffaa00", label: "ENV 3" },
  ];

  return (
    <div className="flex flex-col gap-2">
      {envs.map((env) => (
        <div key={env.id} className="synth-panel-raised rounded p-2">
          <div className="section-label mb-2">{env.label}</div>
          <div className="flex gap-2">
            {["Attack", "Decay", "Sustain", "Release"].map((param) => {
              const key = `env${env.id}${param.charAt(0)}${param.slice(1).toLowerCase()}`;
              const isTime = param !== "Sustain";
              return (
                <Knob
                  key={param}
                  value={p[key] ?? 0.1}
                  min={isTime ? 0.001 : 0}
                  max={
                    isTime
                      ? param === "Attack" || param === "Release"
                        ? 8
                        : 4
                      : 1
                  }
                  label={param.slice(0, 1)}
                  size={28}
                  color={env.color}
                  logarithmic={isTime}
                  onChange={(v) => setParam(key, v)}
                  formatValue={(v) =>
                    isTime
                      ? v < 1
                        ? `${(v * 1000).toFixed(0)}ms`
                        : `${v.toFixed(2)}s`
                      : v.toFixed(2)
                  }
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function OscillatorPanel() {
  return (
    <div className="flex flex-col gap-2 h-full overflow-y-auto p-2">
      <div className="section-label">OSCILLATORS</div>
      <div className="grid grid-cols-2 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <OscStrip key={i} id={i} enabled={i === 0} onToggle={() => {}} />
        ))}
      </div>
      <UnisonSection />
      <div className="section-label mt-1">ENVELOPES</div>
      <EnvelopeSection />
    </div>
  );
}

export default OscillatorPanel;
