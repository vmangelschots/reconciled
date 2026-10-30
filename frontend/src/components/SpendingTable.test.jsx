import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SpendingTable } from "./SpendingTable";
import { buildSeries } from "../lib/spendingReport";
import { report } from "../test/spendingReportFixture";

function renderTable(props = {}, data = report()) {
  return render(<SpendingTable report={data} series={buildSeries(data)} wide onSelect={() => {}} {...props} />);
}

const rowOf = (name) => screen.getByText(name).closest("tr");

describe("SpendingTable", () => {
  it("shows totals and averages, with a Total row", () => {
    renderTable();
    const groceries = within(rowOf("Groceries"));
    expect(groceries.getByText("€412")).toBeInTheDocument();
    expect(groceries.getByText("€800")).toBeInTheDocument();
    expect(groceries.getByText("€400")).toBeInTheDocument();
    expect(within(rowOf("Total expenses")).getByText("€1,800")).toBeInTheDocument();
  });

  it("shows a zero as a dash and a negative in the normal colour", () => {
    renderTable();
    expect(within(rowOf("Car")).getByText("–")).toBeInTheDocument();
    const negative = within(rowOf("Home")).getByText("-€35");
    expect(negative.closest("td")).not.toHaveClass("text-critical");
  });

  it("expands a parent into its subcategories", async () => {
    renderTable();
    expect(screen.queryByText("Supermarket")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Groceries" }));
    expect(screen.getByText("Supermarket")).toBeInTheDocument();
    expect(screen.getByText("Groceries (direct)")).toBeInTheDocument();
  });

  it("doesn't offer to expand a category without subcategories", () => {
    renderTable();
    expect(screen.queryByRole("button", { name: "Home" })).toBeNull();
  });

  it("marks the month so far and counts the full months", () => {
    const data = report({ months: ["2026-09", "2026-10"], full_months: ["2026-09"] });
    renderTable({}, data);
    expect(screen.getByText("so far")).toBeInTheDocument();
  });

  it("says how many months Avg covers", () => {
    renderTable();
    expect(screen.getByText("2 full months")).toBeInTheDocument();
  });

  it("shows a dash for Avg with too little data", () => {
    const data = report();
    data.categories[0].avg_cents = null;
    renderTable({}, data);
    expect(within(rowOf("Groceries")).getAllByText("–")).toHaveLength(1);
  });

  it("lists Income with its total, then Expenses, then Net", () => {
    renderTable();
    const cells = screen.getAllByRole("cell").map((c) => c.textContent);
    const order = ["Income", "Salary", "Uncategorized income", "Total income", "Expenses", "Groceries", "Total expenses", "Net"];
    const positions = order.map((name) => cells.indexOf(name));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(positions).not.toContain(-1);
    expect(within(rowOf("Salary")).getByText("€6,000")).toBeInTheDocument();
  });

  it("leaves out a section without rows", () => {
    renderTable({}, report({ income_categories: [], uncategorized_income: null }));
    expect(screen.queryByText("Total income")).toBeNull();
    expect(screen.getByText("Total expenses")).toBeInTheDocument();
  });

  it("shows Total income, Net and Savings rate, with no average rate", () => {
    renderTable();
    expect(within(rowOf("Total income")).getByText("€6,000")).toBeInTheDocument();
    expect(within(rowOf("Net")).getByText("€4,200")).toHaveClass("text-positive");
    const rate = within(rowOf("Savings rate"));
    expect(rate.getByText("70%")).toBeInTheDocument();
    expect(rate.getByText("–")).toBeInTheDocument();
  });

  it("opens a month cell of a category row", async () => {
    const onSelect = vi.fn();
    renderTable({ onSelect });
    await userEvent.click(within(rowOf("Groceries")).getByRole("button", { name: "€412" }));
    expect(onSelect).toHaveBeenCalledWith({ category: 1, income: undefined, month: "2026-08" });
  });

  it("opens a subcategory and a direct row", async () => {
    const onSelect = vi.fn();
    renderTable({ onSelect });
    await userEvent.click(screen.getByRole("button", { name: "Groceries" }));
    await userEvent.click(within(rowOf("Groceries (direct)")).getByRole("button", { name: "€112" }));
    expect(onSelect).toHaveBeenCalledWith({ category: 1, direct: true, income: undefined, month: "2026-08" });
  });

  it("opens an income cell as income", async () => {
    const onSelect = vi.fn();
    renderTable({ onSelect });
    await userEvent.click(within(rowOf("Salary")).getAllByRole("button", { name: "€3,000" })[0]);
    expect(onSelect).toHaveBeenCalledWith({ category: 20, income: true, month: "2026-08" });
  });

  it("opens nothing from zero, Total, Avg or summary cells", () => {
    renderTable();
    expect(within(rowOf("Car")).getAllByRole("button")).toHaveLength(1);
    expect(within(rowOf("Total income")).queryByRole("button")).toBeNull();
    expect(within(rowOf("Net")).queryByRole("button")).toBeNull();
    expect(within(rowOf("Groceries")).queryByRole("button", { name: "€800" })).toBeNull();
  });

  it("puts Total and Avg first and the newest month next on a phone", () => {
    renderTable({ wide: false });
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers[1]).toBe("Total");
    expect(headers[2]).toMatch(/^Avg/);
    expect(headers[3]).toBe("Sep");
    expect(headers[4]).toBe("Aug");
  });

  it("keeps months oldest first on a wide screen", () => {
    renderTable();
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers.slice(1, 3)).toEqual(["Aug", "Sep"]);
  });

  it("highlights the month hovered on the chart", () => {
    renderTable({ hoverMonth: "2026-09" });
    expect(screen.getByRole("columnheader", { name: "Sep" })).toHaveClass("bg-surface-2");
  });

  it("reports the hovered row's series", async () => {
    const onHoverSeries = vi.fn();
    renderTable({ onHoverSeries });
    await userEvent.hover(rowOf("Pets"));
    expect(onHoverSeries).toHaveBeenLastCalledWith("other");
  });
});
