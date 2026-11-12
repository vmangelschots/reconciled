import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NetWorthForecastChart, NetWorthForecastTooltip } from "./NetWorthForecastChart";
import { monthLabel } from "../lib/months";

describe("NetWorthForecastChart", () => {
  it("shows the month, its net worth and the change (Hover a month)", () => {
    const row = { month: "2026-12", total_cents: 8130000, change_cents: 330000 };
    render(<NetWorthForecastTooltip active payload={[{ payload: row }]} />);
    expect(screen.getByText(monthLabel("2026-12"))).toBeInTheDocument();
    expect(screen.getByText("€81,300")).toBeInTheDocument();
    expect(screen.getByText("+€3,300")).toBeInTheDocument();
  });

  it("keeps the normal colour below zero (Negative net worth)", () => {
    const months = [
      { month: "2026-11", total_cents: -500000, change_cents: 0 },
      { month: "2026-12", total_cents: -200000, change_cents: 300000 },
    ];
    const { container } = render(<NetWorthForecastChart months={months} width={600} />);
    const line = container.querySelector(".recharts-line-curve");
    expect(line).toHaveAttribute("stroke", "var(--chart-series-1)");
  });
});
