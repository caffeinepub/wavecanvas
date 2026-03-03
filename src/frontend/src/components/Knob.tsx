import { useCallback, useRef, useState } from "react";

interface KnobProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  size?: number;
  color?: string;
  onChange?: (value: number) => void;
  onChangeEnd?: (value: number) => void;
  logarithmic?: boolean;
  formatValue?: (v: number) => string;
  bipolar?: boolean;
  disabled?: boolean;
}

const DEFAULT_KNOB_SIZE = 36;
const KNOB_START_ANGLE = -135;
const KNOB_END_ANGLE = 135;
const KNOB_RANGE = KNOB_END_ANGLE - KNOB_START_ANGLE; // 270 degrees

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function invLerp(a: number, b: number, v: number) {
  return (v - a) / (b - a);
}

export function Knob({
  value,
  min = 0,
  max = 1,
  step,
  label,
  size = DEFAULT_KNOB_SIZE,
  color = "#00d4ff",
  onChange,
  onChangeEnd,
  logarithmic = false,
  formatValue,
  bipolar = false,
  disabled = false,
}: KnobProps) {
  const dragRef = useRef<{ startY: number; startValue: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const knobRef = useRef<HTMLDivElement>(null);

  // Normalized value (0-1)
  const normalizeValue = useCallback(
    (v: number) => {
      if (logarithmic && min > 0) {
        return invLerp(
          Math.log(min),
          Math.log(max),
          Math.log(Math.max(min, v)),
        );
      }
      return invLerp(min, max, v);
    },
    [min, max, logarithmic],
  );

  const denormalizeValue = useCallback(
    (n: number) => {
      let v: number;
      if (logarithmic && min > 0) {
        v = Math.exp(lerp(Math.log(min), Math.log(max), n));
      } else {
        v = lerp(min, max, n);
      }
      if (step) v = Math.round(v / step) * step;
      return Math.max(min, Math.min(max, v));
    },
    [min, max, logarithmic, step],
  );

  const norm = Math.max(0, Math.min(1, normalizeValue(value)));
  const angle = KNOB_START_ANGLE + norm * KNOB_RANGE;

  // Indicator line position
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.35;
  const indicatorLen = size * 0.28;
  const angleRad = (angle - 90) * (Math.PI / 180);
  const ix1 = cx + r * Math.cos(angleRad) * 0.45;
  const iy1 = cy + r * Math.sin(angleRad) * 0.45;
  const ix2 = cx + indicatorLen * Math.cos(angleRad);
  const iy2 = cy + indicatorLen * Math.sin(angleRad);

  // Arc path for value indicator
  const startRad = (KNOB_START_ANGLE - 90) * (Math.PI / 180);
  const endRad = (angle - 90) * (Math.PI / 180);
  const trackR = r + size * 0.07;

  function describeArc(startAng: number, endAng: number, radius: number) {
    const sx = cx + radius * Math.cos(startAng);
    const sy = cy + radius * Math.sin(startAng);
    const ex = cx + radius * Math.cos(endAng);
    const ey = cy + radius * Math.sin(endAng);
    const largeArc = endAng - startAng > Math.PI ? 1 : 0;
    return `M ${sx} ${sy} A ${radius} ${radius} 0 ${largeArc} 1 ${ex} ${ey}`;
  }

  // For bipolar, arc from center
  const centerRad = ((bipolar ? 0 : KNOB_START_ANGLE) - 90) * (Math.PI / 180);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      e.preventDefault();
      dragRef.current = { startY: e.clientY, startValue: value };
      setIsDragging(true);

      const onMove = (me: MouseEvent) => {
        if (!dragRef.current) return;
        const dy = dragRef.current.startY - me.clientY;
        const sensitivity = me.shiftKey ? 0.001 : 0.004;
        const delta = dy * sensitivity;
        const newNorm = Math.max(
          0,
          Math.min(1, normalizeValue(dragRef.current.startValue) + delta),
        );
        onChange?.(denormalizeValue(newNorm));
      };

      const onUp = (me: MouseEvent) => {
        if (dragRef.current) {
          const dy = dragRef.current.startY - me.clientY;
          const sensitivity = me.shiftKey ? 0.001 : 0.004;
          const delta = dy * sensitivity;
          const newNorm = Math.max(
            0,
            Math.min(1, normalizeValue(dragRef.current.startValue) + delta),
          );
          onChangeEnd?.(denormalizeValue(newNorm));
        }
        dragRef.current = null;
        setIsDragging(false);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [value, disabled, normalizeValue, denormalizeValue, onChange, onChangeEnd],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (disabled) return;
      e.preventDefault();
      const delta = -e.deltaY * 0.001;
      const newNorm = Math.max(0, Math.min(1, normalizeValue(value) + delta));
      const newVal = denormalizeValue(newNorm);
      onChange?.(newVal);
      onChangeEnd?.(newVal);
    },
    [value, disabled, normalizeValue, denormalizeValue, onChange, onChangeEnd],
  );

  const handleDoubleClick = useCallback(() => {
    if (disabled) return;
    // Reset to default (midpoint)
    const mid = denormalizeValue(bipolar ? 0.5 : 0);
    onChange?.(mid);
    onChangeEnd?.(mid);
  }, [disabled, denormalizeValue, onChange, onChangeEnd, bipolar]);

  const displayValue = formatValue ? formatValue(value) : value.toFixed(2);
  const trackStrokeWidth = Math.max(2, size * 0.06);

  const trackPath = describeArc(
    (KNOB_START_ANGLE - 90) * (Math.PI / 180),
    (KNOB_END_ANGLE - 90) * (Math.PI / 180),
    trackR,
  );

  const valuePath = bipolar
    ? describeArc(centerRad, endRad, trackR)
    : describeArc(startRad, endRad, trackR);

  return (
    <div
      className="flex flex-col items-center gap-0.5 select-none"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div
        ref={knobRef}
        className="relative cursor-ns-resize"
        style={{ width: size, height: size }}
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
      >
        <svg
          width={size}
          height={size}
          style={{ display: "block", overflow: "visible" }}
          aria-hidden="true"
        >
          {/* Outer glow when dragging */}
          {isDragging && (
            <circle
              cx={cx}
              cy={cy}
              r={r + 4}
              fill="none"
              stroke={color}
              strokeWidth={1}
              opacity={0.3}
              style={{ filter: "blur(2px)" }}
            />
          )}

          {/* Track background */}
          <path
            d={trackPath}
            fill="none"
            stroke="oklch(0.22 0.012 240)"
            strokeWidth={trackStrokeWidth}
            strokeLinecap="round"
          />

          {/* Value arc */}
          {norm > 0.001 && (
            <path
              d={valuePath}
              fill="none"
              stroke={color}
              strokeWidth={trackStrokeWidth}
              strokeLinecap="round"
              style={{
                filter: isDragging
                  ? `drop-shadow(0 0 3px ${color})`
                  : undefined,
              }}
            />
          )}

          {/* Knob body */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="oklch(0.13 0.01 250)"
            stroke="oklch(0.28 0.015 240)"
            strokeWidth={1}
          />

          {/* Inner gradient highlight */}
          <circle
            cx={cx - r * 0.2}
            cy={cy - r * 0.2}
            r={r * 0.3}
            fill="oklch(0.22 0.01 200)"
            opacity={0.4}
          />

          {/* Indicator line */}
          <line
            x1={ix1}
            y1={iy1}
            x2={ix2}
            y2={iy2}
            stroke={color}
            strokeWidth={Math.max(1.5, size * 0.04)}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 2px ${color})` }}
          />
        </svg>

        {/* Tooltip */}
        {showTooltip && (
          <div
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 text-xs font-mono rounded pointer-events-none z-50 whitespace-nowrap"
            style={{
              background: "oklch(0.11 0.008 250)",
              border: `1px solid ${color}`,
              color: color,
              fontSize: "0.6rem",
            }}
          >
            {displayValue}
          </div>
        )}
      </div>
      {label && (
        <span
          className="knob-label"
          style={{
            maxWidth: size + 12,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

export default Knob;
