import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SpendingChart, SpendingTooltip } from "./SpendingChart";
import { buildSeries, seriesKeyFor } from "../lib/spendingReport";
import { report } from "../test/spendingReportFixture";

function renderChart(props) {
  const data = report();
  return render(<SpendingChart report={data} series={buildSeries(data)} width={720} {...props} />);
}

describe("buildSeries", () => {
  it("keeps the six largest, then Other, then Uncategorized", () => {
    const series = buildSeries(report());
    expect(series.map((s) => s.name)).toEqual(["Groceries", "Home", "Car", "Fun", "Gifts", "Kids", "Other", "Uncategorized"]);
    expect(series[6].cents).toEqual([9600 + 9500 + 9400, 0]);
  });

  it("has no Other or Uncategorized when there's nothing for them", () => {
    const series = buildSeries(report({ categories: report().categories.slice(0, 2), uncategorized: null }));
    expect(series.map((s) => s.name)).toEqual(["Groceries", "Home"]);
  });

  it("gives Other's rows its key, and a subcategory none of its own", () => {
    const series = buildSeries(report());
    expect(seriesKeyFor("c8", series)).toBe("other");
    expect(seriesKeyFor("c1", series)).toBe("c1");
  });
});

describe("SpendingChart", () => {
  it("names every series in the legend", () => {
    renderChart();
    const legend = screen.getByRole("list", { name: "Legend" });
    expect(within(legend).getAllByRole("button")).toHaveLength(8);
  });

  it("isolates a category, and shows them all again", async () => {
    const { container } = renderChart();
    const stacks = () => container.querySelectorAll(".recharts-bar").length;
    expect(stacks()).toBe(8);

    await userEvent.click(screen.getByRole("button", { name: "Groceries" }));
    expect(stacks()).toBe(1);
    expect(screen.getByRole("button", { name: "Groceries" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: "Groceries" }));
    expect(stacks()).toBe(8);
  });

  it("dims everything but the highlighted category", () => {
    const { container } = renderChart({ highlight: "c1" });
    const opacities = [...container.querySelectorAll(".recharts-bar-rectangle path")].map((p) =>
      p.getAttribute("fill-opacity"),
    );
    expect(opacities).toContain("0.45");
    expect(opacities).toContain("1");
  });

  it("draws a negative month below zero rather than dropping it", () => {
    const onSelect = vi.fn();
    const { container } = renderChart({ onSelect });
    expect(container.querySelectorAll(".recharts-bar-rectangle").length).toBeGreaterThan(8);
  });
});

describe("SpendingTooltip", () => {
  it("lists the month's categories and total", () => {
    const series = buildSeries(report());
    const row = { month: "2026-09", c1: 38800, c2: 20000 };
    render(<SpendingTooltip active payload={[{ payload: row }]} series={series} />);
    expect(screen.getByText("September 2026")).toBeInTheDocument();
    expect(screen.getByText("Groceries")).toBeInTheDocument();
    expect(screen.getByText("€388")).toBeInTheDocument();
    expect(screen.getByText("Total: €588")).toBeInTheDocument();
    expect(screen.queryByText("Car")).not.toBeInTheDocument();
  });
});
