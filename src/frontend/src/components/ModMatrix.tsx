import audioEngine from "../audio/AudioEngine";
import type { ModMatrixSlot } from "../audio/presets";
import { useSynth } from "../store/synthStore";
import { Knob } from "./Knob";

const SOURCES = [
  "LFO 1",
  "LFO 2",
  "LFO 3",
  "ENV 1",
  "ENV 2",
  "ENV 3",
  "Velocity",
  "Mod Wheel",
  "Key Track",
  "Aftertouch",
  "Random",
];

const TARGETS = [
  "WT Pos",
  "Scan Speed",
  "Amplitude",
  "Filter Cutoff",
  "Filter Res",
  "Harmonic Emph",
  "Stereo Spread",
  "Phase Dist",
  "Pitch Fine",
  "Sub Level",
  "Noise Level",
];

const LFO_SHAPES = ["SIN", "TRI", "SAW", "R-SAW", "SQR", "S&H"];

function LFOSection() {
  const { state, dispatch } = useSynth();
  const p = state.params;

  const setParam = (name: string, value: number) => {
    dispatch({ type: "SET_PARAM", name, value });
    audioEngine.setParam(name, value);
  };

  const lfos = [
    { id: 1, color: "#00d4ff" },
    { id: 2, color: "#44ffaa" },
    { id: 3, color: "#ffaa00" },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="section-label">LFOs</div>
      {lfos.map((lfo) => {
        const shapeKey = `lfo${lfo.id}Shape` as string;
        const rateKey = `lfo${lfo.id}Rate` as string;
        const depthKey = `lfo${lfo.id}Depth` as string;
        const phaseKey = `lfo${lfo.id}Phase` as string;

        return (
          <div key={lfo.id} className="synth-panel-raised rounded p-2">
            <div className="flex items-center gap-2 mb-2">
              <div
                className="led-cyan"
                style={{
                  background: `oklch(0.78 0.18 ${lfo.id === 1 ? 195 : lfo.id === 2 ? 145 : 55})`,
                }}
              />
              <span className="section-label">LFO {lfo.id}</span>
            </div>
            <div className="flex gap-2 items-end">
              <Knob
                value={p[rateKey] ?? 1}
                min={0.01}
                max={20}
                label="Rate"
                size={28}
                color={lfo.color}
                logarithmic
                onChange={(v) => setParam(rateKey, v)}
                formatValue={(v) => `${v.toFixed(2)}Hz`}
              />
              <Knob
                value={p[depthKey] ?? 0.5}
                min={0}
                max={1}
                label="Depth"
                size={28}
                color={lfo.color}
                onChange={(v) => setParam(depthKey, v)}
              />
              <Knob
                value={p[phaseKey] ?? 0}
                min={0}
                max={1}
                label="Phase"
                size={28}
                color={lfo.color}
                onChange={(v) => setParam(phaseKey, v)}
              />
              <div className="flex flex-col gap-1">
                <div className="section-label">Shape</div>
                <div className="flex flex-wrap gap-0.5">
                  {LFO_SHAPES.map((shape, idx) => (
                    <button
                      type="button"
                      key={shape}
                      className={`synth-btn text-xs py-0 ${Math.round(p[shapeKey] ?? 0) === idx ? "active" : ""}`}
                      style={{ fontSize: "0.5rem", padding: "1px 4px" }}
                      onClick={() => setParam(shapeKey, idx)}
                    >
                      {shape}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ModRow({ slot, index }: { slot: ModMatrixSlot; index: number }) {
  const { dispatch } = useSynth();

  const update = (update: Partial<ModMatrixSlot>) => {
    const newSlot = { ...slot, ...update };
    dispatch({ type: "SET_MOD_SLOT", slot: index, data: newSlot });
    // Post via worklet port if available
    if (audioEngine.workletNode) {
      audioEngine.workletNode.port.postMessage({
        type: "modMatrix",
        slot: index,
        slot_data: newSlot,
      });
    }
  };

  return (
    <div
      className={`flex items-center gap-2 p-1.5 rounded ${slot.enabled ? "synth-panel-raised" : "opacity-50"}`}
    >
      {/* Enable toggle */}
      <button
        type="button"
        className="flex-shrink-0"
        onClick={() => update({ enabled: !slot.enabled })}
        title="Enable/Disable"
      >
        <div className={slot.enabled ? "led-cyan" : "led-off"} />
      </button>

      {/* Source select */}
      <select
        className="text-xs font-mono rounded px-1 py-0.5 flex-1"
        style={{
          background: "oklch(0.11 0.008 250)",
          border: "1px solid oklch(0.22 0.012 240)",
          color: slot.enabled ? "oklch(0.78 0.18 195)" : "oklch(0.52 0.02 220)",
          fontSize: "0.6rem",
          maxWidth: 90,
        }}
        value={slot.source}
        onChange={(e) => update({ source: Number.parseInt(e.target.value) })}
      >
        {SOURCES.map((s, i) => (
          <option key={s} value={i}>
            {s}
          </option>
        ))}
      </select>

      <span className="section-label">→</span>

      {/* Target select */}
      <select
        className="text-xs font-mono rounded px-1 py-0.5 flex-1"
        style={{
          background: "oklch(0.11 0.008 250)",
          border: "1px solid oklch(0.22 0.012 240)",
          color: slot.enabled ? "oklch(0.72 0.19 55)" : "oklch(0.52 0.02 220)",
          fontSize: "0.6rem",
          maxWidth: 90,
        }}
        value={slot.target}
        onChange={(e) => update({ target: Number.parseInt(e.target.value) })}
      >
        {TARGETS.map((t, i) => (
          <option key={t} value={i}>
            {t}
          </option>
        ))}
      </select>

      {/* Amount knob */}
      <Knob
        value={slot.amount}
        min={-1}
        max={1}
        bipolar
        size={24}
        color="#00d4ff"
        onChange={(v) => update({ amount: v })}
        formatValue={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`}
      />

      {/* Delete */}
      <button
        type="button"
        className="synth-btn text-xs py-0 ml-1"
        style={{
          color: "oklch(0.65 0.22 25)",
          padding: "1px 4px",
          fontSize: "0.6rem",
        }}
        onClick={() =>
          update({ source: 0, target: 0, amount: 0, enabled: false })
        }
      >
        ✕
      </button>
    </div>
  );
}

export function ModMatrix() {
  const { state } = useSynth();

  return (
    <div className="flex flex-col gap-2 h-full overflow-y-auto p-2">
      <LFOSection />
      <div className="section-label mt-2">MODULATION MATRIX</div>
      <div className="flex flex-col gap-1">
        {state.modMatrix.map((slot, i) => (
          <ModRow
            key={`mod-${i}-${slot.source}-${slot.target}`}
            slot={slot}
            index={i}
          />
        ))}
      </div>
    </div>
  );
}

export default ModMatrix;
