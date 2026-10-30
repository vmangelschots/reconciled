import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { EverydayMoneyChart, EverydayTooltip } from "./EverydayMoneyChart";
import { formatDayMonth } from "../lib/yearlyBudgets";

function iso(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const TODAY = iso(0);

function history(days = 5, balance = 184000) {
  return Array.from({ length: days }, (_, i) => ({ date: iso(i - days + 1), balance_cents: balance }));
}

function projection(values) {
  return values.map((balance_cents, i) => ({ date: iso(i), balance_cents }));
}

function data(overrides = {}) {
  return { tier: "everyday", current: true, end: TODAY, points: history(), projection: null, lowest: null, ...overrides };
}

function renderChart(props) {
  return render(
    <MemoryRouter>
      <EverydayMoneyChart width={720} {...props} />
    </MemoryRouter>,
  );
}

describe("EverydayMoneyChart", () => {
  it("shows a past month without a projection or Today", () => {
    renderChart({ data: data({ current: false, end: "2026-09-30" }) });
    expect(screen.getByText(`To ${formatDayMonth("2026-09-30")}`)).toBeInTheDocument();
    expect(screen.queryByText("Today")).not.toBeInTheDocument();
    expect(screen.queryByText("Set up recurring transactions")).not.toBeInTheDocument();
  });

  it("links to Forecast with nothing scheduled", () => {
    renderChart({ data: data() });
    expect(screen.getByRole("link", { name: "Set up recurring transactions" })).toHaveAttribute("href", "/forecast");
  });

  it("labels a low ahead", () => {
    const lowest = { date: iso(1), balance_cents: 31200 };
    renderChart({ data: data({ projection: projection([184000, 31200, 90000]), lowest }) });
    expect(screen.getByText(`Low €312 · ${formatDayMonth(iso(1))}`)).toBeInTheDocument();
  });

  it("labels no low when the projection only rises", () => {
    const lowest = { date: iso(1), balance_cents: 200000 };
    renderChart({ data: data({ projection: projection([184000, 200000]), lowest }) });
    expect(screen.queryByText(/^Low/)).not.toBeInTheDocument();
  });

  it("uses the critical colour when running short", () => {
    const lowest = { date: iso(1), balance_cents: -15000 };
    renderChart({ data: data({ projection: projection([184000, -15000]), lowest }) });
    expect(screen.getByText(/^Low/)).toHaveClass("chart-low-label-critical");
  });

  it("names a stale account beside the projection", () => {
    const accounts = [{ id: 1, name: "Crelan", tier: "everyday", account_type: "checking", last_import_date: iso(-12) }];
    const lowest = { date: iso(1), balance_cents: 100 };
    renderChart({ data: data({ projection: projection([184000, 100]), lowest }), accounts });
    expect(screen.getByText("Crelan: last import 12 days ago")).toBeInTheDocument();
  });

  it("counts several stale accounts", () => {
    const stale = { tier: "everyday", account_type: "checking", last_import_date: null };
    const accounts = [
      { ...stale, id: 1, name: "Crelan" },
      { ...stale, id: 2, name: "Revolut" },
    ];
    const lowest = { date: iso(1), balance_cents: 100 };
    renderChart({ data: data({ projection: projection([184000, 100]), lowest }), accounts });
    expect(screen.getByText("2 accounts not imported this week")).toBeInTheDocument();
  });

  it("shows no stale note without a projection", () => {
    const accounts = [{ id: 1, name: "Crelan", tier: "everyday", account_type: "checking", last_import_date: null }];
    renderChart({ data: data(), accounts });
    expect(screen.queryByText(/Crelan/)).not.toBeInTheDocument();
  });

  it("ignores stale accounts of other tiers", () => {
    const accounts = [{ id: 1, name: "Spaar", tier: "savings", account_type: "savings", last_import_date: null }];
    const lowest = { date: iso(1), balance_cents: 100 };
    renderChart({ data: data({ projection: projection([184000, 100]), lowest }), accounts });
    expect(screen.queryByText(/Spaar/)).not.toBeInTheDocument();
  });

  it("says when history starts below three days, keeping the projection", () => {
    const points = history(2);
    const lowest = { date: iso(1), balance_cents: 100 };
    const { container } = renderChart({ data: data({ points, projection: projection([184000, 100]), lowest }) });
    expect(screen.getByText(`History starts ${formatDayMonth(points[0].date)}.`)).toBeInTheDocument();
    expect(container.querySelector(".recharts-line-curve")).toBeInTheDocument();
    expect(container.querySelector(".recharts-area-curve")).not.toBeInTheDocument();
  });

  it("says when there is no history", () => {
    renderChart({ data: data({ current: false, end: "2020-01-31", points: [] }) });
    expect(screen.getByText("No history yet.")).toBeInTheDocument();
  });

  it("lists days and marks projected ones in the table view", () => {
    const lowest = { date: iso(1), balance_cents: 100 };
    renderChart({ data: data({ points: history(3), projection: projection([184000, 100]), lowest }), showTable: true });
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(1 + 3 + 1);
    expect(rows[4]).toHaveTextContent("Projected");
    expect(rows[3]).not.toHaveTextContent("Projected");
  });
});

describe("EverydayTooltip", () => {
  const point = (row) => ({ active: true, payload: [{ payload: { date: "2026-10-14", ...row } }] });

  it("shows the day, its balance and its change", () => {
    render(<EverydayTooltip {...point({ balance_cents: 184000, change_cents: -5000 })} />);
    const day = new Date(2026, 9, 14).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
    expect(screen.getByText(day)).toBeInTheDocument();
    expect(screen.getByText("€1,840")).toBeInTheDocument();
    expect(screen.getByText("-€50")).toBeInTheDocument();
  });

  it("shows today as an actual", () => {
    render(<EverydayTooltip {...point({ balance_cents: 184000, projected_cents: 184000 })} />);
    expect(screen.queryByText(/Projected/)).not.toBeInTheDocument();
  });

  it("says a later day is projected", () => {
    render(<EverydayTooltip {...point({ projected_cents: 31200 })} />);
    expect(screen.getByText(/Projected/)).toBeInTheDocument();
    expect(screen.getByText("€312")).toBeInTheDocument();
  });
});
