import { useMemo, useState } from "react";

const WIDTH = 760;
const HEIGHT = 280;
const PADDING = { top: 16, right: 16, bottom: 28, left: 64 };

function formatCurrency(cents) {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function formatCompact(cents) {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 1000) {
    return `${dollars < 0 ? "-" : ""}$${(Math.abs(dollars) / 1000).toFixed(1)}K`;
  }
  return `$${Math.round(dollars)}`;
}

function niceTicks(min, max, count = 4) {
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(min + step * i));
}

export function ForecastChart({ points }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const [showTable, setShowTable] = useState(false);

  const plot = useMemo(() => {
    const values = points.map((p) => p.balance_cents);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0);
    const span = max - min || 1;
    const innerWidth = WIDTH - PADDING.left - PADDING.right;
    const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;

    const x = (i) => PADDING.left + (i / (points.length - 1 || 1)) * innerWidth;
    const y = (value) => PADDING.top + innerHeight - ((value - min) / span) * innerHeight;

    const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.balance_cents)}`).join(" ");
    const ticks = niceTicks(min, max);
    const zeroVisible = min < 0 && max > 0;

    return { x, y, path, ticks, zeroVisible, min, max };
  }, [points]);

  if (points.length === 0) return null;

  const hovered = hoverIndex != null ? points[hoverIndex] : null;
  const lastPoint = points[points.length - 1];

  function handleMove(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const innerWidth = WIDTH - PADDING.left - PADDING.right;
    const ratio = (relativeX - PADDING.left) / innerWidth;
    const index = Math.round(ratio * (points.length - 1));
    setHoverIndex(Math.max(0, Math.min(points.length - 1, index)));
  }

  return (
    <div className="forecast-chart">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Projected account balance over time"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {plot.ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={plot.y(tick)}
              y2={plot.y(tick)}
              className="chart-gridline"
            />
            <text x={PADDING.left - 8} y={plot.y(tick)} className="chart-axis-label" textAnchor="end" dy="0.32em">
              {formatCompact(tick)}
            </text>
          </g>
        ))}

        {plot.zeroVisible && (
          <line
            x1={PADDING.left}
            x2={WIDTH - PADDING.right}
            y1={plot.y(0)}
            y2={plot.y(0)}
            className="chart-baseline"
          />
        )}

        <text x={PADDING.left} y={HEIGHT - 6} className="chart-axis-label">
          {points[0].date}
        </text>
        <text x={WIDTH - PADDING.right} y={HEIGHT - 6} className="chart-axis-label" textAnchor="end">
          {lastPoint.date}
        </text>

        <path d={plot.path} className="chart-line" fill="none" />

        <circle cx={plot.x(points.length - 1)} cy={plot.y(lastPoint.balance_cents)} r="4" className="chart-end-dot" />
        <text
          x={plot.x(points.length - 1) - 8}
          y={plot.y(lastPoint.balance_cents) - 10}
          className="chart-end-label"
          textAnchor="end"
        >
          {formatCurrency(lastPoint.balance_cents)}
        </text>

        {hovered && (
          <>
            <line
              x1={plot.x(hoverIndex)}
              x2={plot.x(hoverIndex)}
              y1={PADDING.top}
              y2={HEIGHT - PADDING.bottom}
              className="chart-crosshair"
            />
            <circle cx={plot.x(hoverIndex)} cy={plot.y(hovered.balance_cents)} r="4" className="chart-hover-dot" />
          </>
        )}
      </svg>

      {hovered && (
        <div className="chart-tooltip" aria-hidden="true">
          <strong>{formatCurrency(hovered.balance_cents)}</strong>
          <span>{hovered.date}</span>
        </div>
      )}

      <button type="button" className="chart-table-toggle" onClick={() => setShowTable((v) => !v)}>
        {showTable ? "Hide table" : "Show as table"}
      </button>

      {showTable && (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Projected balance</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.date}>
                <td>{p.date}</td>
                <td>{formatCurrency(p.balance_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
