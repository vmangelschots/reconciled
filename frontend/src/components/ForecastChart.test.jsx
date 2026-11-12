import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ForecastChart, ForecastTooltip, longDay } from "./ForecastChart";
import { formatDayMonth } from "../lib/yearlyBudgets";

function points(values, start = "2026-11-12") {
  const [y, m, d] = start.split("-").map(Number);
  return values.map((balance_cents, i) => {
    const day = new Date(y, m - 1, d + i);
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    return { date, balance_cents };
  });
}

const item = (name, amount_cents, date = "2026-11-25", source = "expected") => ({ name, amount_cents, date, source });

describe("ForecastChart", () => {
  it("labels a low ahead", () => {
    const line = points([184000, 31200, 90000]);
    render(<ForecastChart points={line} lowest={line[1]} width={720} />);
    expect(screen.getByText(`Low €312 · ${formatDayMonth(line[1].date)}`)).toBeInTheDocument();
  });

  it("is critical below zero when income is expected (Running short)", () => {
    const line = points([184000, -15000]);
    render(<ForecastChart points={line} lowest={line[1]} width={720} />);
    expect(screen.getByText(/^Low/)).toHaveClass("chart-low-label-critical");
  });

  it("isn't critical while no income is expected", () => {
    const line = points([184000, -15000]);
    render(<ForecastChart points={line} lowest={line[1]} critical={false} width={720} />);
    expect(screen.getByText(/^Low/)).not.toHaveClass("chart-low-label-critical");
  });
});

describe("ForecastTooltip", () => {
  const hover = (items) => ({ active: true, payload: [{ payload: { date: "2026-11-25", balance_cents: 612000, items } }] });

  it("shows a payday (Hover a payday)", () => {
    render(<ForecastTooltip {...hover([item("Salary", 450000)])} />);
    expect(screen.getByText(longDay("2026-11-25"))).toBeInTheDocument();
    expect(screen.getByText("€6,120")).toBeInTheDocument();
    expect(screen.getByText("Salary")).toBeInTheDocument();
    expect(screen.getByText("+€4,500")).toBeInTheDocument();
  });

  it("lists three items and how many more (A busy day)", () => {
    render(<ForecastTooltip {...hover(["A", "B", "C", "D", "E"].map((n) => item(n, -1000)))} />);
    expect(screen.getByText("C")).toBeInTheDocument();
    expect(screen.queryByText("D")).not.toBeInTheDocument();
    expect(screen.getByText("+2 more")).toBeInTheDocument();
  });
});
