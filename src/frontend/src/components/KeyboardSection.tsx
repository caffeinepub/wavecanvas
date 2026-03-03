import { useCallback, useEffect, useRef, useState } from "react";
import audioEngine from "../audio/AudioEngine";
import { useSynth } from "../store/synthStore";
import { Knob } from "./Knob";

// QWERTY to MIDI note mapping (relative to base octave)
const QWERTY_MAP: Record<string, number> = {
  a: 60,
  w: 61,
  s: 62,
  e: 63,
  d: 64,
  f: 65,
  t: 66,
  g: 67,
  y: 68,
  h: 69,
  u: 70,
  j: 71,
  k: 72,
  o: 73,
  l: 74,
  p: 75,
  ";": 76,
};

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

function isBlack(semitone: number): boolean {
  return [1, 3, 6, 8, 10].includes(semitone % 12);
}

function noteToName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[midi % 12]}${octave}`;
}

// Find the qwerty key for a given MIDI note
function getQwertyLabel(midi: number, octaveShift: number): string {
  const baseNote = midi - octaveShift * 12;
  for (const [key, note] of Object.entries(QWERTY_MAP)) {
    if (note === baseNote) return key.toUpperCase();
  }
  return "";
}

const ARP_PATTERNS = ["up", "down", "up-down", "random", "chord"] as const;
const ARP_RATES = [
  { label: "1/4", value: 1 },
  { label: "1/8", value: 2 },
  { label: "1/16", value: 4 },
  { label: "1/32", value: 8 },
];

export function KeyboardSection() {
  const { state, dispatch } = useSynth();
  const arpRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const arpNotesRef = useRef<number[]>([]);
  const arpIdxRef = useRef(0);
  const _arpDirRef = useRef<1 | -1>(1);
  const activeNoteRef = useRef<number | null>(null);
  const [pitchBend, setPitchBend] = useState(0.5);
  const [modWheel, setModWheel] = useState(0);
  const modDragRef = useRef<{ startY: number; startValue: number } | null>(
    null,
  );
  const pitchDragRef = useRef<{ startY: number; startValue: number } | null>(
    null,
  );

  // Octave range for display: start 3 octaves from C3
  const startOctave = 3 + state.octaveShift;
  const startMidi = startOctave * 12;
  const numKeys = 37; // ~3 octaves + 1

  // Generate keys
  const keys: { midi: number; isBlack: boolean; x: number; width: number }[] =
    [];
  const WHITE_WIDTH = 26;
  const BLACK_WIDTH = 16;
  let whiteX = 0;

  for (let i = 0; i < numKeys; i++) {
    const midi = startMidi + i;
    const semitone = midi % 12;
    const black = isBlack(semitone);
    if (!black) {
      keys.push({ midi, isBlack: false, x: whiteX, width: WHITE_WIDTH });
      whiteX += WHITE_WIDTH;
    }
  }
  // Add black keys
  let whiteX2 = 0;
  for (let i = 0; i < numKeys; i++) {
    const midi = startMidi + i;
    const semitone = midi % 12;
    const black = isBlack(semitone);
    if (!black) {
      if ([0, 2, 5, 7, 9].includes(semitone % 12)) {
        // Check if next key is black
        const nextSemitone = (semitone + 1) % 12;
        if (isBlack(nextSemitone)) {
          keys.push({
            midi: midi + 1,
            isBlack: true,
            x: whiteX2 + WHITE_WIDTH - BLACK_WIDTH / 2,
            width: BLACK_WIDTH,
          });
        }
      }
      whiteX2 += WHITE_WIDTH;
    }
  }

  // Sort: white first, black on top
  keys.sort((a, b) => {
    if (a.isBlack === b.isBlack) return a.midi - b.midi;
    return a.isBlack ? 1 : -1;
  });
  // De-duplicate
  const seen = new Set<number>();
  const uniqueKeys = keys.filter((k) => {
    if (seen.has(k.midi)) return false;
    seen.add(k.midi);
    return true;
  });

  const totalWidth = whiteX;

  const handleNoteOn = useCallback(
    async (midi: number, velocity = 100) => {
      await audioEngine.ensureRunning();
      if (state.arp.enabled) {
        if (!arpNotesRef.current.includes(midi)) {
          arpNotesRef.current.push(midi);
        }
      } else {
        audioEngine.noteOn(midi, velocity);
      }
      dispatch({ type: "KEY_DOWN", midi });
    },
    [state.arp.enabled, dispatch],
  );

  const handleNoteOff = useCallback(
    (midi: number) => {
      if (!state.arp.enabled) {
        audioEngine.noteOff(midi);
      } else if (!state.arp.latch) {
        arpNotesRef.current = arpNotesRef.current.filter((n) => n !== midi);
      }
      dispatch({ type: "KEY_UP", midi });
    },
    [state.arp.enabled, state.arp.latch, dispatch],
  );

  // QWERTY keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      // Octave shift
      if (e.key === "z") {
        dispatch({ type: "SET_OCTAVE_SHIFT", shift: state.octaveShift - 1 });
        return;
      }
      if (e.key === "x") {
        dispatch({ type: "SET_OCTAVE_SHIFT", shift: state.octaveShift + 1 });
        return;
      }
      // Sustain
      if (e.code === "Space") {
        dispatch({ type: "SET_SUSTAIN", sustain: true });
        e.preventDefault();
        return;
      }

      const base = QWERTY_MAP[e.key.toLowerCase()];
      if (base !== undefined) {
        const midi = base + state.octaveShift * 12;
        handleNoteOn(midi, 100);
      }
    };

    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        dispatch({ type: "SET_SUSTAIN", sustain: false });
        return;
      }
      const base = QWERTY_MAP[e.key.toLowerCase()];
      if (base !== undefined) {
        const midi = base + state.octaveShift * 12;
        if (!state.sustain) handleNoteOff(midi);
      }
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [state.octaveShift, state.sustain, handleNoteOn, handleNoteOff, dispatch]);

  // Arpeggiator
  useEffect(() => {
    if (!state.arp.enabled) {
      if (arpRef.current) clearInterval(arpRef.current);
      if (activeNoteRef.current !== null) {
        audioEngine.noteOff(activeNoteRef.current);
        activeNoteRef.current = null;
      }
      return;
    }

    const bpm = state.groove.bpm || 120;
    const beatMs = 60000 / bpm;
    const intervalMs = beatMs / state.arp.rate;

    const tick = () => {
      const notes = arpNotesRef.current;
      if (notes.length === 0) return;

      // Turn off previous
      if (activeNoteRef.current !== null) {
        audioEngine.noteOff(activeNoteRef.current);
        activeNoteRef.current = null;
      }

      let noteIdx = 0;
      switch (state.arp.pattern) {
        case "up":
          noteIdx = arpIdxRef.current % notes.length;
          arpIdxRef.current++;
          break;
        case "down":
          noteIdx = notes.length - 1 - (arpIdxRef.current % notes.length);
          arpIdxRef.current++;
          break;
        case "up-down": {
          const totalLen = notes.length * 2 - 2;
          const pos = arpIdxRef.current % Math.max(1, totalLen);
          noteIdx = pos < notes.length ? pos : totalLen - pos;
          arpIdxRef.current++;
          break;
        }
        case "random":
          noteIdx = Math.floor(Math.random() * notes.length);
          break;
        case "chord":
          for (const n of notes) audioEngine.noteOn(n, 100);
          activeNoteRef.current = notes[0];
          return;
      }

      // Octave range
      const octaveOffset =
        Math.floor(arpIdxRef.current / notes.length) % state.arp.octaveRange;
      const midi = notes[noteIdx] + octaveOffset * 12;
      audioEngine.noteOn(midi, 100);
      activeNoteRef.current = midi;
    };

    arpRef.current = setInterval(tick, intervalMs);
    return () => {
      if (arpRef.current) clearInterval(arpRef.current);
    };
  }, [state.arp, state.groove.bpm]);

  // Mod wheel drag
  const handleModDown = (e: React.MouseEvent) => {
    modDragRef.current = { startY: e.clientY, startValue: modWheel };
    const onMove = (me: MouseEvent) => {
      if (!modDragRef.current) return;
      const dy = modDragRef.current.startY - me.clientY;
      const v = Math.max(
        0,
        Math.min(1, modDragRef.current.startValue + dy / 100),
      );
      setModWheel(v);
      audioEngine.setParam("modWheelValue", v);
      dispatch({ type: "SET_MOD_WHEEL", value: v });
    };
    const onUp = () => {
      modDragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Pitch bend drag
  const handlePitchDown = (e: React.MouseEvent) => {
    pitchDragRef.current = { startY: e.clientY, startValue: pitchBend };
    const onMove = (me: MouseEvent) => {
      if (!pitchDragRef.current) return;
      const dy = pitchDragRef.current.startY - me.clientY;
      const v = Math.max(
        0,
        Math.min(1, pitchDragRef.current.startValue + dy / 100),
      );
      setPitchBend(v);
      dispatch({ type: "SET_PITCH_BEND", value: v });
    };
    const onUp = () => {
      // Spring back to center
      setPitchBend(0.5);
      dispatch({ type: "SET_PITCH_BEND", value: 0.5 });
      pitchDragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div className="flex flex-col gap-1 px-2 pb-1">
      {/* Controls row */}
      <div className="flex items-center gap-3 py-1 border-b border-border flex-wrap">
        <div className="flex gap-1 items-center">
          <span className="section-label">OCT</span>
          <button
            type="button"
            className="synth-btn py-0"
            style={{ fontSize: "0.7rem", padding: "0px 6px" }}
            onClick={() =>
              dispatch({
                type: "SET_OCTAVE_SHIFT",
                shift: state.octaveShift - 1,
              })
            }
          >
            ◄
          </button>
          <span
            className="font-mono text-xs"
            style={{
              color: "oklch(0.78 0.18 195)",
              minWidth: 24,
              textAlign: "center",
            }}
          >
            {state.octaveShift >= 0 ? "+" : ""}
            {state.octaveShift}
          </span>
          <button
            type="button"
            className="synth-btn py-0"
            style={{ fontSize: "0.7rem", padding: "0px 6px" }}
            onClick={() =>
              dispatch({
                type: "SET_OCTAVE_SHIFT",
                shift: state.octaveShift + 1,
              })
            }
          >
            ►
          </button>
        </div>

        {/* Arpeggiator */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={`synth-btn ${state.arp.enabled ? "active" : ""}`}
            style={{ fontSize: "0.6rem" }}
            onClick={() =>
              dispatch({
                type: "SET_ARP",
                arp: { enabled: !state.arp.enabled },
              })
            }
          >
            ARP
          </button>
          {state.arp.enabled && (
            <>
              <select
                className="text-xs font-mono rounded px-1 py-0.5"
                style={{
                  background: "oklch(0.11 0.008 250)",
                  border: "1px solid oklch(0.22 0.012 240)",
                  color: "oklch(0.78 0.18 195)",
                  fontSize: "0.6rem",
                }}
                value={state.arp.pattern}
                onChange={(e) =>
                  dispatch({
                    type: "SET_ARP",
                    arp: {
                      pattern: e.target.value as typeof state.arp.pattern,
                    },
                  })
                }
              >
                {ARP_PATTERNS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <div className="flex gap-0.5">
                {ARP_RATES.map((r) => (
                  <button
                    type="button"
                    key={r.value}
                    className={`synth-btn py-0 ${state.arp.rate === r.value ? "active" : ""}`}
                    style={{ fontSize: "0.5rem", padding: "0px 3px" }}
                    onClick={() =>
                      dispatch({ type: "SET_ARP", arp: { rate: r.value } })
                    }
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className={`synth-btn py-0 ${state.arp.latch ? "amber-active" : ""}`}
                style={{ fontSize: "0.6rem", padding: "1px 4px" }}
                onClick={() =>
                  dispatch({
                    type: "SET_ARP",
                    arp: { latch: !state.arp.latch },
                  })
                }
              >
                LATCH
              </button>
            </>
          )}
        </div>

        {/* Sustain indicator */}
        <div className="flex items-center gap-1">
          <div className={state.sustain ? "led-cyan" : "led-off"} />
          <span className="section-label">SUS [Space]</span>
        </div>
      </div>

      {/* Keys + strips */}
      <div className="flex items-stretch gap-1" style={{ height: 100 }}>
        {/* Pitch bend strip */}
        <div
          className="flex-shrink-0 flex flex-col items-center justify-center synth-panel-inset rounded cursor-ns-resize select-none"
          style={{ width: 24 }}
          onMouseDown={handlePitchDown}
        >
          <span
            className="section-label"
            style={{ writingMode: "vertical-rl", fontSize: "0.45rem" }}
          >
            PITCH
          </span>
          <div
            className="w-4 rounded"
            style={{
              height: 60,
              background: "oklch(0.22 0.012 240)",
              position: "relative",
              marginTop: 4,
            }}
          >
            <div
              style={{
                position: "absolute",
                bottom: `${pitchBend * 100}%`,
                left: 0,
                right: 0,
                height: 8,
                background: "oklch(0.78 0.18 195)",
                borderRadius: 2,
                transform: "translateY(50%)",
                boxShadow: "0 0 4px oklch(0.78 0.18 195 / 0.6)",
              }}
            />
          </div>
        </div>

        {/* Mod wheel strip */}
        <div
          className="flex-shrink-0 flex flex-col items-center justify-center synth-panel-inset rounded cursor-ns-resize select-none"
          style={{ width: 24 }}
          onMouseDown={handleModDown}
        >
          <span
            className="section-label"
            style={{ writingMode: "vertical-rl", fontSize: "0.45rem" }}
          >
            MOD
          </span>
          <div
            className="w-4 rounded"
            style={{
              height: 60,
              background: "oklch(0.22 0.012 240)",
              position: "relative",
              marginTop: 4,
            }}
          >
            <div
              style={{
                position: "absolute",
                bottom: `${modWheel * 100}%`,
                left: 0,
                right: 0,
                height: 8,
                background: "oklch(0.72 0.19 55)",
                borderRadius: 2,
                boxShadow: "0 0 4px oklch(0.72 0.19 55 / 0.6)",
              }}
            />
          </div>
        </div>

        {/* Piano keys */}
        <div
          className="flex-1 overflow-x-auto"
          style={{ overscrollBehavior: "contain" }}
        >
          <div
            className="relative"
            style={{ width: totalWidth, height: 96, userSelect: "none" }}
          >
            {uniqueKeys.map((key) => {
              const pressed = state.pressedKeys.has(key.midi);
              const qKey = getQwertyLabel(key.midi, state.octaveShift);

              return (
                <div
                  key={key.midi}
                  className="absolute rounded-b cursor-pointer select-none"
                  style={{
                    left: key.x,
                    top: 0,
                    width: key.width,
                    height: key.isBlack ? 60 : 96,
                    zIndex: key.isBlack ? 2 : 1,
                    background: key.isBlack
                      ? pressed
                        ? "oklch(0.6 0.2 195)"
                        : "oklch(0.1 0.01 250)"
                      : pressed
                        ? "oklch(0.75 0.18 195)"
                        : "oklch(0.85 0.01 200)",
                    border: key.isBlack
                      ? "1px solid oklch(0.05 0.005 250)"
                      : "1px solid oklch(0.6 0.02 220)",
                    boxShadow: pressed
                      ? "0 0 8px oklch(0.78 0.18 195 / 0.5)"
                      : key.isBlack
                        ? "0 2px 4px rgba(0,0,0,0.5)"
                        : "0 2px 3px rgba(0,0,0,0.2)",
                    transition: "background 0.05s",
                    overflow: "hidden",
                  }}
                  onMouseDown={(e) => {
                    const velocity = key.isBlack
                      ? 100
                      : Math.round(
                          (1 - e.nativeEvent.offsetY / key.width) * 50 + 60,
                        );
                    handleNoteOn(key.midi, velocity);
                  }}
                  onMouseUp={() => handleNoteOff(key.midi)}
                  onMouseLeave={() => {
                    if (state.pressedKeys.has(key.midi))
                      handleNoteOff(key.midi);
                  }}
                  onMouseEnter={(e) => {
                    if (e.buttons === 1) handleNoteOn(key.midi, 90);
                  }}
                >
                  {/* Key label */}
                  {!key.isBlack && (
                    <div
                      className="absolute bottom-1 left-0 right-0 text-center"
                      style={{
                        fontSize: "0.5rem",
                        color: pressed
                          ? "oklch(0.1 0.01 250)"
                          : "oklch(0.4 0.01 250)",
                      }}
                    >
                      {qKey ||
                        (key.midi % 12 === 0 ? noteToName(key.midi) : "")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default KeyboardSection;
