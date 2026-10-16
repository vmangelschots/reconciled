import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CategorySpendingChart } from "./CategorySpendingChart";

const DATA = {
  month: "2026-03",
  categories: [
    {
      category_id: 1,
      name: "Groceries",
      spent_cents: 25000,
      direct_cents: 5000,
      subcategories: [{ category_id: 3, name: "Supermarket", spent_cents: 20000 }],
    },
    { category_id: 2, name: "Clothing", spent_cents: 5000, direct_cents: 5000, subcategories: [] },
  ],
  uncategorized_cents: 9000,
};

function renderChart(data = DATA) {
  return render(<CategorySpendingChart data={data} monthLabel="March 2026" />);
}

function rowNames() {
  const list = screen.getByRole("list", { name: "Spending per category in March 2026" });
  return within(list)
    .getAllByText(/./, { selector: "span.break-words" })
    .map((el) => el.textContent);
}

describe("CategorySpendingChart", () => {
  it("lists categories largest first, Uncategorized included, with amounts", () => {
    renderChart();
    expect(rowNames()).toEqual(["Groceries", "Uncategorized", "Clothing"]);
    expect(screen.getByText("$250.00")).toBeInTheDocument();
    expect(screen.getByText("$90.00")).toBeInTheDocument();
  });

  it("expands a parent into its subcategories plus the direct spending, and collapses again", async () => {
    renderChart();
    const groceries = screen.getByRole("button", { name: "Groceries" });
    expect(groceries).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(groceries);
    expect(groceries).toHaveAttribute("aria-expanded", "true");
    expect(rowNames()).toEqual(["Groceries", "Supermarket", "Groceries (direct)", "Uncategorized", "Clothing"]);

    await userEvent.click(groceries);
    expect(rowNames()).toEqual(["Groceries", "Uncategorized", "Clothing"]);
  });

  it("omits the direct row when nothing was booked on the parent itself", async () => {
    renderChart({
      ...DATA,
      categories: [{ ...DATA.categories[0], spent_cents: 20000, direct_cents: 0 }],
    });
    await userEvent.click(screen.getByRole("button", { name: "Groceries" }));
    expect(screen.queryByText("Groceries (direct)")).not.toBeInTheDocument();
    expect(screen.getByText("Supermarket")).toBeInTheDocument();
  });

  it("offers no expand control for a category without subcategories", () => {
    renderChart();
    expect(screen.queryByRole("button", { name: "Clothing" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Uncategorized" })).not.toBeInTheDocument();
  });

  it("shows a tooltip with the share of the month's spending on hover", async () => {
    renderChart();
    await userEvent.hover(screen.getByText("$90.00"));
    // 9000 of 39000 total.
    expect(screen.getByRole("tooltip")).toHaveTextContent("Uncategorized: $90.00 · 23% of the month's spending");
  });

  it("says so when the month has no spending", () => {
    renderChart({ month: "2026-03", categories: [], uncategorized_cents: 0 });
    expect(screen.getByText("No spending in March 2026.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("lists every row, subcategories included, in the table view", async () => {
    renderChart();
    await userEvent.click(screen.getByRole("button", { name: "Show as table" }));
    const cells = within(screen.getByRole("table"))
      .getAllByRole("row")
      .slice(1)
      .map((r) => within(r).getAllByRole("cell")[0].textContent);
    expect(cells).toEqual(["Groceries", "Supermarket", "Groceries (direct)", "Uncategorized", "Clothing"]);
  });
});
