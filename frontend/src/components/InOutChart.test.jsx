import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InOutChart, InOutTooltip } from "./InOutChart";

const MONTHS = Array.from({ length: 12 }, (_, i) => {
  const month = `2026-${String(i + 1).padStart(2, "0")}`;
  return { month, in_cents: 200000 + i * 100, out_cents: 150000 };
});

function renderChart() {
  return render(<InOutChart months={MONTHS} width={720} />);
}

describe("InOutChart", () => {
  it("draws a pair of bars for every month", () => {
    const { container } = renderChart();
    expect(container.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(24);
  });

  it("names both series in the legend", () => {
    renderChart();
    const legend = screen.getByRole("list", { name: "Legend" });
    expect(within(legend).getByText("Money in")).toBeInTheDocument();
    expect(within(legend).getByText("Money out")).toBeInTheDocument();
  });

  it("summarises the chart for screen readers", () => {
    renderChart();
    expect(screen.getByRole("img", { name: /Money in vs money out over the last 12 months/ })).toBeInTheDocument();
  });

  it("shows a month's in, out and difference when hovering its bar", async () => {
    // jsdom has no layout; give the chart a box so Recharts can map the
    // mouse position to a month column.
    const rect = { left: 0, top: 0, x: 0, y: 0, width: 720, height: 280, right: 720, bottom: 280 };
    const spy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ ...rect, toJSON() {} });
    const { container } = renderChart();
    // March's "money in" bar (third of the first series).
    const marchBar = container.querySelectorAll(".recharts-bar-rectangle .recharts-rectangle")[2];
    const x = Number(marchBar.getAttribute("x"));
    expect(x).toBeGreaterThan(0);
    fireEvent.mouseMove(container.querySelector(".recharts-wrapper"), { clientX: x + 4, clientY: 200 });

    expect(await screen.findByText(/March 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Money in: \$2,002\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Money out: \$1,500\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Difference: \$502\.00/)).toBeInTheDocument();
    spy.mockRestore();
  });

  it("lists every month in the table view", async () => {
    renderChart();
    await userEvent.click(screen.getByRole("button", { name: "Show as table" }));
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(13); // header + 12 months
    expect(within(rows[3]).getByText("March 2026")).toBeInTheDocument();
    expect(within(rows[3]).getByText("$502.00")).toBeInTheDocument();
  });
});

describe("InOutTooltip", () => {
  it("renders nothing when inactive", () => {
    const { container } = render(<InOutTooltip active={false} payload={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
