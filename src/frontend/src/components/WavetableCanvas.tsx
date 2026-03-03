import { useCallback, useEffect, useRef, useState } from "react";
import audioEngine from "../audio/AudioEngine";
import {
  FRAME_SIZE,
  addHarmonicToFrame,
  morphFrames,
  randomizeFrame,
  smoothFrame,
} from "../audio/wavetable-utils";
import { useSynth } from "../store/synthStore";
import type { BrushMode } from "../store/synthStore";

const BRUSH_COLORS: Record<BrushMode, string> = {
  draw: "#00d4ff",
  smooth: "#88aaff",
  harmonics: "#ffaa00",
  randomize: "#ff4488",
  morph: "#44ffaa",
  "harmonic-lock": "#ffff44",
};

interface HarmonicPopupProps {
  x: number;
  y: number;
  onSelect: (harmonic: number, amplitude: number) => void;
  onClose: () => void;
}

function HarmonicPopup({ x, y, onSelect, onClose }: HarmonicPopupProps) {
  const [amp, setAmp] = useState(0.5);
  return (
    <div
      className="absolute z-50 modal-glass rounded p-3 text-xs font-mono"
      style={{ left: x, top: y, minWidth: 180 }}
    >
      <div className="section-label mb-2">Add Harmonic</div>
      <div className="flex flex-wrap gap-1 mb-2">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 16].map((h) => (
          <button
            type="button"
            key={h}
            className="synth-btn px-1.5 py-0.5 text-xs"
            onClick={() => {
              onSelect(h, amp);
              onClose();
            }}
          >
            H{h}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="section-label">Amp</span>
        <input
          type="range"
          min={0.05}
          max={1}
          step={0.05}
          value={amp}
          onChange={(e) => setAmp(Number.parseFloat(e.target.value))}
          className="flex-1"
        />
        <span style={{ color: "#00d4ff" }}>{amp.toFixed(2)}</span>
      </div>
      <button type="button" className="synth-btn mt-2 w-full" onClick={onClose}>
        Close
      </button>
    </div>
  );
}

export function WavetableCanvas() {
  const { state, dispatch } = useSynth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number>(0);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const wtUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localFramesRef = useRef<Float32Array[]>([]);
  const playheadRef = useRef(0);
  const [harmonicPopup, setHarmonicPopup] = useState<{
    x: number;
    y: number;
    frameIdx: number;
  } | null>(null);

  const frames = state.wavetableFrames;
  const numFrames = frames.length || 64;
  const brushMode = state.brushMode;
  const _brushColor = BRUSH_COLORS[brushMode];

  // Initialize local frames copy
  useEffect(() => {
    if (frames.length > 0) {
      localFramesRef.current = frames.map((f) => new Float32Array(f));
    }
  }, [frames]);

  // Animate playhead
  useEffect(() => {
    let running = true;
    function animate() {
      if (!running) return;
      playheadRef.current = state.params.wtPos || 0;
      frameRef.current = requestAnimationFrame(animate);
    }
    frameRef.current = requestAnimationFrame(animate);
    return () => {
      running = false;
      cancelAnimationFrame(frameRef.current);
    };
  }, [state.params.wtPos]);

  // Main draw function
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: false });
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const framesData =
      localFramesRef.current.length > 0 ? localFramesRef.current : frames;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = "oklch(0.07 0.005 255)";
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = "rgba(100, 150, 200, 0.08)";
    ctx.lineWidth = 1;
    // Vertical frame lines
    if (numFrames > 1) {
      const frameW = W / numFrames;
      for (
        let f = 0;
        f <= numFrames;
        f += Math.max(1, Math.floor(numFrames / 16))
      ) {
        const x = f * frameW;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
    }
    // Horizontal: center, ±0.5
    const cy = H / 2;
    ctx.strokeStyle = "rgba(100, 150, 200, 0.15)";
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(W, cy);
    ctx.stroke();
    ctx.strokeStyle = "rgba(100, 150, 200, 0.07)";
    ctx.beginPath();
    ctx.moveTo(0, cy - H * 0.25);
    ctx.lineTo(W, cy - H * 0.25);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, cy + H * 0.25);
    ctx.lineTo(W, cy + H * 0.25);
    ctx.stroke();

    // Waveform lines per frame
    if (framesData.length > 0) {
      const frameW = W / framesData.length;
      const fW = frameW * 0.92;

      for (let f = 0; f < framesData.length; f++) {
        const frame = framesData[f];
        if (!frame) continue;
        const fX = f * frameW;

        // Color by harmonic energy
        let energy = 0;
        if (state.colorOverlay) {
          for (let i = 0; i < frame.length; i++) energy += frame[i] * frame[i];
          energy = Math.sqrt(energy / frame.length);
        }

        const t = f / Math.max(1, framesData.length - 1);
        const alpha = 0.5 + t * 0.3;

        if (state.colorOverlay) {
          const hue = 195 + energy * 60;
          ctx.strokeStyle = `oklch(${0.6 + energy * 0.3} 0.2 ${hue} / ${alpha})`;
        } else {
          ctx.strokeStyle = `rgba(0, 180, 220, ${alpha})`;
        }
        ctx.lineWidth = 1;

        ctx.beginPath();
        const step = Math.max(1, Math.floor(FRAME_SIZE / fW));
        let firstPoint = true;
        for (let s = 0; s < FRAME_SIZE; s += step) {
          const px = fX + (s / FRAME_SIZE) * fW;
          const py = cy - frame[s] * (H * 0.44);
          if (firstPoint) {
            ctx.moveTo(px, py);
            firstPoint = false;
          } else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }

    // Playhead
    if (numFrames > 0) {
      const pPos = playheadRef.current;
      const px = pPos * W;
      ctx.strokeStyle = "rgba(0, 212, 255, 0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, H);
      ctx.stroke();
      // Glow
      ctx.strokeStyle = "rgba(0, 212, 255, 0.2)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, H);
      ctx.stroke();
    }

    // Selected frame highlight
    if (state.selectedFrame !== null && framesData.length > 0) {
      const frameW = W / framesData.length;
      const sx = state.selectedFrame * frameW;
      ctx.strokeStyle = "rgba(255, 170, 0, 0.8)";
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, 0, frameW, H);
    }
  }, [frames, numFrames, state.colorOverlay, state.selectedFrame]);

  // RAF loop
  useEffect(() => {
    let running = true;
    function loop() {
      if (!running) return;
      draw();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
    return () => {
      running = false;
    };
  }, [draw]);

  // Resize canvas
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ro = new ResizeObserver(() => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    });
    ro.observe(container);
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    return () => ro.disconnect();
  }, []);

  const getCanvasPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    let cx: number;
    let cy: number;
    if ("touches" in e) {
      cx = e.touches[0].clientX - rect.left;
      cy = e.touches[0].clientY - rect.top;
    } else {
      cx = e.clientX - rect.left;
      cy = e.clientY - rect.top;
    }
    return { x: cx, y: cy, w: rect.width, h: rect.height };
  }, []);

  const scheduleWtUpdate = useCallback(() => {
    if (wtUpdateTimerRef.current) clearTimeout(wtUpdateTimerRef.current);
    wtUpdateTimerRef.current = setTimeout(() => {
      const frames = localFramesRef.current;
      if (frames.length > 0) {
        audioEngine.loadCustomWavetable(frames);
        dispatch({
          type: "SET_WAVETABLE_FRAMES",
          frames: frames.map((f) => new Float32Array(f)),
        });
      }
    }, 16);
  }, [dispatch]);

  const applyBrush = useCallback(
    (
      x: number,
      y: number,
      prevX: number | null,
      prevY: number | null,
      w: number,
      h: number,
    ) => {
      if (localFramesRef.current.length === 0) return;
      const framesData = localFramesRef.current;
      const numF = framesData.length;

      if (brushMode === "draw") {
        // Convert canvas coords to frame/sample indices
        const frameIdx = Math.floor((x / w) * numF);
        const clampedFrame = Math.max(0, Math.min(numF - 1, frameIdx));
        const amplitude = -((y / h) * 2 - 1); // invert Y

        const pFrameIdx =
          prevX !== null ? Math.floor((prevX / w) * numF) : clampedFrame;
        const pAmp = prevY !== null ? -((prevY / h) * 2 - 1) : amplitude;

        const fStart = Math.min(clampedFrame, pFrameIdx);
        const fEnd = Math.max(clampedFrame, pFrameIdx);

        for (let f = fStart; f <= fEnd && f < numF; f++) {
          const frame = framesData[f];
          const t = fEnd > fStart ? (f - fStart) / (fEnd - fStart) : 0;
          const amp = pAmp + t * (amplitude - pAmp);

          // Paint amplitude across sample range based on frame position
          const sampleX = Math.round((x / w) * FRAME_SIZE);
          const prevSampleX =
            prevX !== null ? Math.round((prevX / w) * FRAME_SIZE) : sampleX;
          const sStart = Math.min(
            sampleX % FRAME_SIZE,
            prevSampleX % FRAME_SIZE,
          );
          const sEnd = Math.max(sampleX % FRAME_SIZE, prevSampleX % FRAME_SIZE);
          const brushRadius = 4;

          for (
            let s = Math.max(0, sStart - brushRadius);
            s <= Math.min(FRAME_SIZE - 1, sEnd + brushRadius);
            s++
          ) {
            frame[s] = amp;
          }
        }
      } else if (brushMode === "smooth") {
        const frameIdx = Math.floor((x / w) * numF);
        const fStart = Math.max(0, frameIdx - 2);
        const fEnd = Math.min(numF - 1, frameIdx + 2);
        for (let f = fStart; f <= fEnd; f++) {
          const smoothed = smoothFrame(framesData[f], 0.4);
          framesData[f] = smoothed;
        }
      } else if (brushMode === "randomize") {
        const frameIdx = Math.floor((x / w) * numF);
        const clampedFrame = Math.max(0, Math.min(numF - 1, frameIdx));
        randomizeFrame(framesData[clampedFrame]);
      } else if (brushMode === "morph" && state.selectedFrame !== null) {
        const frameIdx = Math.floor((x / w) * numF);
        const clampedFrame = Math.max(0, Math.min(numF - 1, frameIdx));
        const amount = y / h;
        framesData[clampedFrame] = morphFrames(
          framesData[state.selectedFrame],
          framesData[clampedFrame],
          amount,
        );
      }

      scheduleWtUpdate();
    },
    [brushMode, state.selectedFrame, scheduleWtUpdate],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (brushMode === "harmonics") {
        const pos = getCanvasPos(e);
        if (pos) {
          const frameIdx = Math.floor((pos.x / pos.w) * numFrames);
          setHarmonicPopup({ x: e.clientX, y: e.clientY, frameIdx });
        }
        return;
      }
      isDrawingRef.current = true;
      const pos = getCanvasPos(e);
      if (pos) {
        lastPosRef.current = { x: pos.x, y: pos.y };
        applyBrush(pos.x, pos.y, null, null, pos.w, pos.h);
      }
    },
    [brushMode, getCanvasPos, numFrames, applyBrush],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawingRef.current) return;
      const pos = getCanvasPos(e);
      if (!pos) return;
      const prev = lastPosRef.current;
      applyBrush(pos.x, pos.y, prev?.x ?? null, prev?.y ?? null, pos.w, pos.h);
      lastPosRef.current = { x: pos.x, y: pos.y };
    },
    [getCanvasPos, applyBrush],
  );

  const handleMouseUp = useCallback(() => {
    isDrawingRef.current = false;
    lastPosRef.current = null;
  }, []);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (brushMode === "harmonic-lock" || e.ctrlKey) {
        const pos = getCanvasPos(e);
        if (!pos) return;
        const frameIdx = Math.floor((pos.x / pos.w) * numFrames);
        dispatch({ type: "SET_SELECTED_FRAME", frame: frameIdx });
      }
    },
    [brushMode, getCanvasPos, numFrames, dispatch],
  );

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full synth-panel-inset overflow-hidden"
    >
      {/* Brush mode toolbar */}
      <div className="absolute top-2 left-2 flex gap-1 z-10">
        {(
          [
            "draw",
            "smooth",
            "harmonics",
            "randomize",
            "morph",
            "harmonic-lock",
          ] as BrushMode[]
        ).map((mode) => (
          <button
            type="button"
            key={mode}
            className={`synth-btn text-xs ${state.brushMode === mode ? "active" : ""}`}
            onClick={() => dispatch({ type: "SET_BRUSH_MODE", mode })}
            title={mode}
          >
            {mode === "harmonic-lock"
              ? "H-Lock"
              : mode.charAt(0).toUpperCase() + mode.slice(1)}
          </button>
        ))}
        <button
          type="button"
          className={`synth-btn text-xs ${state.colorOverlay ? "amber-active" : ""}`}
          onClick={() =>
            dispatch({
              type: "SET_COLOR_OVERLAY",
              enabled: !state.colorOverlay,
            })
          }
        >
          Spectral Color
        </button>
      </div>

      {/* Frame count info */}
      <div className="absolute top-2 right-2 z-10 section-label">
        {numFrames} frames · {FRAME_SIZE} samples
      </div>

      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-crosshair"
        style={{
          cursor:
            brushMode === "smooth"
              ? "cell"
              : brushMode === "randomize"
                ? "crosshair"
                : "crosshair",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleCanvasClick}
        onKeyDown={handleMouseUp}
      />

      {/* Harmonic popup */}
      {harmonicPopup && (
        <HarmonicPopup
          x={harmonicPopup.x}
          y={harmonicPopup.y}
          onSelect={(h, amp) => {
            const frames = localFramesRef.current;
            if (frames[harmonicPopup.frameIdx]) {
              addHarmonicToFrame(frames[harmonicPopup.frameIdx], h, amp);
              scheduleWtUpdate();
            }
          }}
          onClose={() => setHarmonicPopup(null)}
        />
      )}

      {/* Selected frame indicator */}
      {state.selectedFrame !== null && (
        <div
          className="absolute bottom-2 left-2 z-10 section-label"
          style={{ color: "#ffaa00" }}
        >
          Frame {state.selectedFrame} selected (ctrl+click to deselect)
        </div>
      )}
    </div>
  );
}

export default WavetableCanvas;
