import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { NetWorthChart, NetWorthPanel, NetWorthTooltip, availableRanges } from "./NetWorthChart";

function months(count) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(2022, i, 1);
    return {
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      total_cents: 1000000 + i * 10000,
      tiers: [{ tier: "everyday", balance_cents: 1000000 + i * 10000 }],
    };
  });
}

function renderPanel(count, props) {
  return render(<NetWorthPanel months={months(count)} selectedMonth="2022-03" width={320} {...props} />);
}

describe("availableRanges", () => {
  it("offers 1Y and All for eighteen months", () => {
    expect(availableRanges(18).map((r) => r.label)).toEqual(["1Y", "All"]);
  });

  it("offers every range beyond five years", () => {
    expect(availableRanges(61).map((r) => r.label)).toEqual(["1Y", "5Y", "All"]);
  });

  it("offers none for a year or less", () => {
    expect(availableRanges(12)).toEqual([]);
  });
});

describe("NetWorthPanel", () => {
  it("opens on All and offers the ranges", () => {
    renderPanel(18);
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "5Y" })).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: /over 18 months/ })).toBeInTheDocument();
  });

  it("narrows to a range", async () => {
    renderPanel(18);
    await userEvent.click(screen.getByRole("button", { name: "1Y" }));
    expect(screen.getByRole("img", { name: /over 12 months/ })).toBeInTheDocument();
  });

  it("shows no range buttons within a year", () => {
    renderPanel(12);
    expect(screen.queryByRole("button", { name: "All" })).not.toBeInTheDocument();
  });

  it("waits for the first month end", () => {
    renderPanel(1);
    expect(screen.getByText(/after your first month end/)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

describe("NetWorthChart", () => {
  it("marks the chosen month only inside the range", () => {
    const { container, rerender } = render(<NetWorthChart months={months(6)} selectedMonth="2022-03" width={320} />);
    expect(container.querySelectorAll(".recharts-reference-dot")).toHaveLength(2);
    rerender(<NetWorthChart months={months(6)} selectedMonth="2019-03" width={320} />);
    expect(container.querySelectorAll(".recharts-reference-dot")).toHaveLength(1);
  });

  it("draws the zero line when net worth crosses it", () => {
    const rows = months(3).map((m, i) => ({ ...m, total_cents: (i - 1) * 100000 }));
    const { container } = render(<NetWorthChart months={rows} selectedMonth="2022-01" width={320} />);
    expect(container.querySelector(".recharts-reference-line")).toBeInTheDocument();
  });
});

describe("NetWorthTooltip", () => {
  const row = {
    month: "2026-10",
    total_cents: 41230000,
    change_cents: 124000,
    tiers: [
      { tier: "everyday", balance_cents: 410000 },
      { tier: "loans", balance_cents: -17980000 },
    ],
  };

  it("lists the month, total, tiers and change in whole euros", () => {
    render(<NetWorthTooltip active payload={[{ payload: row }]} />);
    expect(screen.getByText("October 2026")).toBeInTheDocument();
    expect(screen.getByText("€412,300")).toBeInTheDocument();
    expect(screen.getByText("Everyday")).toBeInTheDocument();
    expect(screen.getByText("-€179,800")).not.toHaveClass("text-critical");
    expect(screen.getByText("+€1,240")).toBeInTheDocument();
    expect(screen.queryByText("Property")).not.toBeInTheDocument();
  });
});

function projection(after, count = 12) {
  const [y, m] = after.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(y, m + i, 1);
    return {
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      total_cents: 2000000 + i * 50000,
      change_cents: 50000,
    };
  });
}

describe("Net worth projection", () => {
  it("draws the history solid and the next 12 months dashed (History and a year ahead)", () => {
    const { container } = renderPanel(18, { projection: projection("2023-06") });
    const lines = container.querySelectorAll(".recharts-line-curve");
    expect(lines).toHaveLength(2);
    expect(lines[0]).not.toHaveAttribute("stroke-dasharray");
    expect(lines[1]).toHaveAttribute("stroke-dasharray", "5 5");
    expect(screen.getByRole("img", { name: /over 18 months/ })).toBeInTheDocument();
  });

  it("keeps the projection after the 1Y range (The 1Y range)", async () => {
    renderPanel(18, { projection: projection("2023-06") });
    await userEvent.click(screen.getByRole("button", { name: "1Y" }));
    expect(screen.getByRole("img", { name: /over 12 months/ })).toBeInTheDocument();
    expect(document.querySelectorAll(".recharts-line-curve")).toHaveLength(2);
  });

  it("says Projected and leaves out the tiers (Hover a projected month)", () => {
    const row = { month: "2027-03", projected_cents: 2100000, change_cents: 50000 };
    render(<NetWorthTooltip active payload={[{ payload: row }]} />);
    expect(screen.getByText(/March 2027 · Projected/)).toBeInTheDocument();
    expect(screen.getByText("€21,000")).toBeInTheDocument();
    expect(screen.getByText("+€500")).toBeInTheDocument();
    expect(screen.queryByText("Everyday")).toBeNull();
  });
});
