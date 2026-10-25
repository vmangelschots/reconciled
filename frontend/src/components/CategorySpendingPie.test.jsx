import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CategorySpendingPie } from "./CategorySpendingPie";

// 1,000.00 in total: Groceries 250.00 (Supermarket 200.00 + 50.00 direct),
// six more categories, two small ones that fold into Other, and 90.00
// uncategorized.
const DATA = {
  month: "2026-03",
  categories: [
    {
      category_id: 1,
      name: "Groceries",
      spent_cents: 25000,
      direct_cents: 5000,
      subcategories: [{ category_id: 11, name: "Supermarket", spent_cents: 20000 }],
    },
    ...[
      ["Rent", 20000],
      ["Restaurants", 12000],
      ["Transport", 10000],
      ["Clothing", 9000],
      ["Health", 8000],
      ["Gifts", 4000],
      ["Books", 2000],
    ].map(([name, cents], i) => ({
      category_id: i + 2,
      name,
      spent_cents: cents,
      direct_cents: cents,
      subcategories: [],
    })),
  ],
  uncategorized_cents: 10000,
};

function renderPie(data = DATA) {
  return render(<CategorySpendingPie data={data} monthLabel="March 2026" animate={false} />);
}

function legend() {
  return screen.getByRole("list", { name: "Spending share per category in March 2026" });
}

function legendNames() {
  return within(legend())
    .getAllByRole("listitem")
    .map((li) => li.querySelector(".truncate").textContent);
}

function centre() {
  return screen.getByTestId("pie-centre");
}

describe("CategorySpendingPie", () => {
  it("shows the month's total in the centre", () => {
    renderPie();
    expect(centre()).toHaveTextContent("Spent");
    expect(centre()).toHaveTextContent("€1,000.00");
  });

  it("draws one slice per legend row", () => {
    const { container } = renderPie();
    expect(legendNames()).toEqual([
      "Groceries",
      "Rent",
      "Restaurants",
      "Transport",
      "Clothing",
      "Health",
      "Other",
      "Uncategorized",
    ]);
    expect(container.querySelectorAll(".recharts-pie-sector")).toHaveLength(8);
  });

  it("shows each slice's amount and share in the legend", () => {
    renderPie();
    const groceries = within(legend()).getAllByRole("listitem")[0];
    expect(groceries).toHaveTextContent("Groceries");
    expect(groceries).toHaveTextContent("€250.00");
    expect(groceries).toHaveTextContent("25%");
  });

  it("says there is no spending for an empty month", () => {
    renderPie({ month: "2026-03", categories: [], uncategorized_cents: 0 });
    expect(screen.getByText("No spending in March 2026.")).toBeInTheDocument();
    expect(screen.queryByTestId("pie-centre")).not.toBeInTheDocument();
  });

  it("shows a hovered slice's name, amount and share in the centre", async () => {
    renderPie();
    await userEvent.hover(within(legend()).getByText("Groceries"));
    expect(centre()).toHaveTextContent("Groceries");
    expect(centre()).toHaveTextContent("€250.00");
    expect(centre()).toHaveTextContent("25%");

    await userEvent.unhover(within(legend()).getByText("Groceries"));
    expect(centre()).toHaveTextContent("Spent");
  });

  it("drills into a parent's subcategories and back", async () => {
    renderPie();
    await userEvent.click(within(legend()).getByRole("button", { name: /Groceries/ }));
    expect(legendNames()).toEqual(["Supermarket", "Groceries (direct)"]);
    expect(centre()).toHaveTextContent("Groceries");
    expect(centre()).toHaveTextContent("€250.00");
    expect(within(legend()).getAllByRole("listitem")[0]).toHaveTextContent("€200.00");

    await userEvent.click(screen.getByRole("button", { name: "← All categories" }));
    expect(legendNames()).toHaveLength(8);
    expect(centre()).toHaveTextContent("€1,000.00");
  });

  it("drills into Other to show the categories it holds", async () => {
    renderPie();
    await userEvent.click(within(legend()).getByRole("button", { name: /Other/ }));
    expect(legendNames()).toEqual(["Gifts", "Books"]);
    expect(within(legend()).getAllByRole("listitem")[0]).toHaveTextContent("€40.00");
  });

  it("doesn't let categories without subcategories drill in", () => {
    renderPie();
    expect(within(legend()).queryByRole("button", { name: /Rent/ })).not.toBeInTheDocument();
    expect(within(legend()).queryByRole("button", { name: /Uncategorized/ })).not.toBeInTheDocument();
  });

  it("shows the same table as the bars view", () => {
    render(<CategorySpendingPie data={DATA} monthLabel="March 2026" animate={false} showTable />);
    const table = screen.getByRole("table");
    expect(within(table).getByText("Supermarket")).toBeInTheDocument();
    expect(within(table).getByText("Books")).toBeInTheDocument();
  });
});
