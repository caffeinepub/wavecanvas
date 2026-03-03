import audioEngine from "../audio/AudioEngine";
import { useSynth } from "../store/synthStore";
import { Knob } from "./Knob";

const FILTER_MODES = ["LP", "HP", "BP", "Notch"];

function FilterSection({
  id,
  color,
}: {
  id: 1 | 2;
  color: string;
}) {
  const { state, dispatch } = useSynth();
  const p = state.params;
  const prefix = `filter${id}`;

  const setParam = (suffix: string, value: number) => {
    const name = `${prefix}${suffix}`;
    dispatch({ type: "SET_PARAM", name, value });
    audioEngine.setParam(name, value);
  };

  const mode = Math.round(p[`${prefix}Mode`] ?? 0);

  return (
    <div className="synth-panel-raised rounded p-2">
      <div className="flex items-center gap-2 mb-2">
        <div className="led-cyan" style={{ background: `${color}` }} />
        <span className="section-label">FILTER {id}</span>
        {id === 2 && (
          <div className="ml-auto flex gap-1">
            <button
              type="button"
              className={`synth-btn text-xs py-0 ${(p.filterRouting ?? 0) === 0 ? "active" : ""}`}
              style={{ fontSize: "0.5rem", padding: "1px 4px" }}
              onClick={() => {
                dispatch({
                  type: "SET_PARAM",
                  name: "filterRouting",
                  value: 0,
                });
                audioEngine.setParam("filterRouting", 0);
              }}
            >
              SER
            </button>
            <button
              type="button"
              className={`synth-btn text-xs py-0 ${(p.filterRouting ?? 0) === 1 ? "active" : ""}`}
              style={{ fontSize: "0.5rem", padding: "1px 4px" }}
              onClick={() => {
                dispatch({
                  type: "SET_PARAM",
                  name: "filterRouting",
                  value: 1,
                });
                audioEngine.setParam("filterRouting", 1);
              }}
            >
              PAR
            </button>
          </div>
        )}
      </div>

      {/* Mode selector */}
      <div className="flex gap-1 mb-2">
        {FILTER_MODES.map((m, i) => (
          <button
            type="button"
            key={m}
            className={`synth-btn text-xs py-0 ${mode === i ? "active" : ""}`}
            style={{ fontSize: "0.6rem", padding: "1px 6px", flex: 1 }}
            onClick={() => setParam("Mode", i)}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        <Knob
          value={p[`${prefix}Cutoff`] ?? 18000}
          min={20}
          max={20000}
          label="Cutoff"
          size={32}
          color={color}
          logarithmic
          onChange={(v) => setParam("Cutoff", v)}
          formatValue={(v) =>
            v >= 1000 ? `${(v / 1000).toFixed(1)}kHz` : `${v.toFixed(0)}Hz`
          }
        />
        <Knob
          value={p[`${prefix}Res`] ?? 0.1}
          min={0}
          max={0.99}
          label="Reso"
          size={32}
          color={color}
          onChange={(v) => setParam("Res", v)}
        />
        <Knob
          value={p[`${prefix}Drive`] ?? 0}
          min={0}
          max={1}
          label="Drive"
          size={32}
          color={color}
          onChange={(v) => setParam("Drive", v)}
        />
        <Knob
          value={p[`${prefix}EnvAmt`] ?? 0}
          min={-1}
          max={1}
          label="Env Amt"
          size={32}
          bipolar
          color={color}
          onChange={(v) => setParam("EnvAmt", v)}
          formatValue={(v) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(0)}%`}
        />
        {id === 1 && (
          <Knob
            value={p.keyTracking ?? 0}
            min={0}
            max={1}
            label="KeyTrk"
            size={28}
            color={color}
            onChange={(v) => {
              dispatch({ type: "SET_PARAM", name: "keyTracking", value: v });
              audioEngine.setParam("keyTracking", v);
            }}
          />
        )}
      </div>
    </div>
  );
}

interface EffectToggleProps {
  label: string;
  enabled: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function EffectSection({
  label,
  enabled,
  onToggle,
  children,
}: EffectToggleProps) {
  return (
    <div
      className={`synth-panel-raised rounded p-2 ${!enabled ? "opacity-60" : ""}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <button type="button" className="flex-shrink-0" onClick={onToggle}>
          <div className={enabled ? "led-cyan" : "led-off"} />
        </button>
        <span className="section-label">{label}</span>
        <button
          type="button"
          className={`synth-btn text-xs py-0 ml-auto ${enabled ? "active" : ""}`}
          style={{ fontSize: "0.55rem", padding: "1px 5px" }}
          onClick={onToggle}
        >
          {enabled ? "ON" : "OFF"}
        </button>
      </div>
      {enabled && <div className="flex gap-2 flex-wrap">{children}</div>}
    </div>
  );
}

export function FilterPanel() {
  const { state, dispatch } = useSynth();
  const p = state.params;

  const setParam = (name: string, value: number) => {
    dispatch({ type: "SET_PARAM", name, value });
    audioEngine.setParam(name, value);
  };

  return (
    <div className="flex flex-col gap-2 h-full overflow-y-auto p-2">
      <div className="section-label">FILTERS</div>
      <FilterSection id={1} color="oklch(0.78 0.18 195)" />
      <FilterSection id={2} color="oklch(0.75 0.22 145)" />

      <div className="section-label mt-1">EFFECTS</div>

      {/* Chorus */}
      <EffectSection
        label="CHORUS"
        enabled={(p.chorusEnabled ?? 0) > 0}
        onToggle={() =>
          setParam("chorusEnabled", (p.chorusEnabled ?? 0) > 0 ? 0 : 1)
        }
      >
        <Knob
          value={p.chorusRate ?? 0.5}
          min={0.1}
          max={5}
          label="Rate"
          size={28}
          color="#4488ff"
          onChange={(v) => setParam("chorusRate", v)}
          logarithmic
        />
        <Knob
          value={p.chorusDepth ?? 0.003}
          min={0.001}
          max={0.02}
          label="Depth"
          size={28}
          color="#4488ff"
          onChange={(v) => setParam("chorusDepth", v)}
        />
        <Knob
          value={p.chorusSpread ?? 0.5}
          min={0}
          max={1}
          label="Spread"
          size={28}
          color="#4488ff"
          onChange={(v) => setParam("chorusSpread", v)}
        />
      </EffectSection>

      {/* Delay */}
      <EffectSection
        label="DELAY"
        enabled={(p.delayEnabled ?? 0) > 0}
        onToggle={() =>
          setParam("delayEnabled", (p.delayEnabled ?? 0) > 0 ? 0 : 1)
        }
      >
        <Knob
          value={p.delayTime ?? 0.25}
          min={0.01}
          max={2}
          label="Time"
          size={28}
          color="#44ffaa"
          onChange={(v) => setParam("delayTime", v)}
          logarithmic
          formatValue={(v) => `${(v * 1000).toFixed(0)}ms`}
        />
        <Knob
          value={p.delayFeedback ?? 0.3}
          min={0}
          max={0.95}
          label="Fdbk"
          size={28}
          color="#44ffaa"
          onChange={(v) => setParam("delayFeedback", v)}
        />
        <Knob
          value={p.delaySpread ?? 0.5}
          min={0}
          max={1}
          label="Spread"
          size={28}
          color="#44ffaa"
          onChange={(v) => setParam("delaySpread", v)}
        />
      </EffectSection>

      {/* Reverb */}
      <EffectSection
        label="REVERB"
        enabled={(p.reverbEnabled ?? 0) > 0}
        onToggle={() =>
          setParam("reverbEnabled", (p.reverbEnabled ?? 0) > 0 ? 0 : 1)
        }
      >
        <Knob
          value={p.reverbSize ?? 0.5}
          min={0.05}
          max={1}
          label="Size"
          size={28}
          color="#aa88ff"
          onChange={(v) => setParam("reverbSize", v)}
        />
        <Knob
          value={p.reverbDamping ?? 0.5}
          min={0}
          max={1}
          label="Damp"
          size={28}
          color="#aa88ff"
          onChange={(v) => setParam("reverbDamping", v)}
        />
        <Knob
          value={p.reverbPreDelay ?? 0.01}
          min={0}
          max={0.1}
          label="Pre-D"
          size={28}
          color="#aa88ff"
          onChange={(v) => setParam("reverbPreDelay", v)}
        />
      </EffectSection>

      {/* Saturation */}
      <EffectSection
        label="SATURATION"
        enabled={(p.satEnabled ?? 0) > 0}
        onToggle={() => setParam("satEnabled", (p.satEnabled ?? 0) > 0 ? 0 : 1)}
      >
        <Knob
          value={p.satDrive ?? 0.3}
          min={0}
          max={1}
          label="Drive"
          size={28}
          color="#ffaa00"
          onChange={(v) => setParam("satDrive", v)}
        />
      </EffectSection>

      {/* Limiter */}
      <EffectSection
        label="LIMITER"
        enabled={(p.limiterEnabled ?? 1) > 0}
        onToggle={() =>
          setParam("limiterEnabled", (p.limiterEnabled ?? 1) > 0 ? 0 : 1)
        }
      >
        <Knob
          value={p.limiterThreshold ?? 0.95}
          min={0.5}
          max={1}
          label="Thresh"
          size={28}
          color="#ff4488"
          onChange={(v) => setParam("limiterThreshold", v)}
        />
        <Knob
          value={p.limiterRelease ?? 0.1}
          min={0.01}
          max={1}
          label="Release"
          size={28}
          color="#ff4488"
          onChange={(v) => setParam("limiterRelease", v)}
        />
      </EffectSection>
    </div>
  );
}

export default FilterPanel;
