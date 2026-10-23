import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewPage } from "./ReviewPage";
import { ToastProvider } from "../components/ui/Toast";
import * as categoriesApi from "../api/categories";
import * as transactionsApi from "../api/transactions";
import { formatMoney } from "../lib/money";
import { ReviewCountProvider } from "../review/ReviewCountContext";

vi.mock("../api/categories", async () => {
  const actual = await vi.importActual("../api/categories");
  return { ...actual, listCategories: vi.fn() };
});

vi.mock("../api/transactions", async () => {
  const actual = await vi.importActual("../api/transactions");
  return {
    ...actual,
    getReviewGroups: vi.fn(),
    getReviewCount: vi.fn(),
    confirmCategories: vi.fn(),
    categorizeUncategorized: vi.fn(),
    updateTransaction: vi.fn(),
  };
});

const CATEGORIES = [
  { id: 1, name: "Groceries", parent: null },
  { id: 2, name: "Transport", parent: null },
  { id: 3, name: "Household", parent: null },
];

function row(id, date, payee, amount_cents, account = "Checking", notes = "") {
  return { id, date, account, payee, amount_cents, notes };
}

function group(key, payee, category, transactions, evidence = { matching: 7, total: 8 }) {
  return {
    key,
    payee,
    direction: "out",
    category,
    source: "history",
    count: transactions.length,
    total_cents: transactions.reduce((sum, t) => sum + t.amount_cents, 0),
    date_from: transactions[0].date,
    date_to: transactions[transactions.length - 1].date,
    accounts: [...new Set(transactions.map((t) => t.account))],
    evidence,
    transactions,
  };
}

const CARREFOUR = group("carrefour", "Carrefour Market", 1, [
  row(11, "2026-10-02", "CARREFOUR MARKET 1234", -3810),
  row(12, "2026-10-09", "CARREFOUR MARKET 0987", -9200, "Checking", "weekly shop"),
  row(13, "2026-10-14", "CARREFOUR MKT", -2000),
  row(14, "2026-10-16", "Carrefour Market", -4100),
  row(15, "2026-10-21", "Carrefour Market", -2130),
]);
const NMBS = group(
  "nmbs",
  "NMBS",
  2,
  [
    row(21, "2026-10-03", "NMBS 551", -1530),
    row(22, "2026-10-08", "NMBS 909", -1530),
    row(23, "2026-10-19", "NMBS 551", -1530),
  ],
  { matching: 11, total: 11 },
);
const IKEA = group("ikea", "IKEA", 3, [row(31, "2026-10-12", "IKEA GENT", -5999)], { matching: 1, total: 1 });

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <ReviewPage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

function cards() {
  return screen.queryAllByTestId("review-group").filter((card) => !card.closest("[inert]"));
}

function card(payee) {
  return cards().find((c) => within(c).queryByText(payee, { selector: "span" }));
}

function pending() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  categoriesApi.listCategories.mockResolvedValue(CATEGORIES);
  transactionsApi.confirmCategories.mockResolvedValue({ confirmed_count: 1 });
  transactionsApi.updateTransaction.mockResolvedValue({});
});

describe("ReviewPage groups", () => {
  it("shows groups largest first with their total, accounts and evidence", async () => {
    transactionsApi.getReviewGroups.mockResolvedValue({ groups: [CARREFOUR, NMBS, IKEA], uncategorized_count: 0 });
    renderPage();

    await screen.findByText("Carrefour Market", { selector: "span" });
    const payees = cards().map((c) => c.querySelector("span").textContent);
    expect(payees).toEqual(["Carrefour Market", "NMBS", "IKEA"]);
    expect(screen.getByText(/9 transactions got a category from your history/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "From your history" })).toBeInTheDocument();

    const carrefour = within(card("Carrefour Market"));
    expect(carrefour.getByText(formatMoney(-21240))).toBeInTheDocument();
    expect(carrefour.getByText("5 transactions")).toBeInTheDocument();
    expect(carrefour.getByText(/7 of 8 earlier payments were/)).toBeInTheDocument();
    expect(carrefour.getByText("Groceries", { selector: "span.font-medium" })).toBeInTheDocument();
    expect(within(card("NMBS")).getByText(/All 11 earlier payments were/)).toBeInTheDocument();
    expect(within(card("IKEA")).getByText(/1 earlier payment was/)).toBeInTheDocument();
  });

  it("starts with focus on the first group's Confirm", async () => {
    transactionsApi.getReviewGroups.mockResolvedValue({ groups: [CARREFOUR, NMBS], uncategorized_count: 0 });
    renderPage();

    await waitFor(() => expect(screen.getByRole("button", { name: "Confirm 5" })).toHaveFocus());
  });

  it("Confirm confirms the group's ids, removes it and focuses the next group", async () => {
    transactionsApi.getReviewGroups.mockResolvedValue({ groups: [CARREFOUR, NMBS], uncategorized_count: 0 });
    renderPage();
    const confirm = await screen.findByRole("button", { name: "Confirm 5" });

    await userEvent.click(confirm);

    expect(transactionsApi.confirmCategories).toHaveBeenCalledWith([11, 12, 13, 14, 15]);
    expect(card("Carrefour Market")).toBeUndefined();
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirm 3" })).toHaveFocus());
    await waitFor(() => expect(screen.queryByText("CARREFOUR MARKET 1234")).toBeNull());
    await waitFor(() =>
      expect(screen.queryAllByTestId("review-group").map((c) => c.querySelector("span").textContent)).toEqual([
        "NMBS",
      ]),
    );
  });

  it("picking another category corrects the whole group", async () => {
    transactionsApi.getReviewGroups.mockResolvedValue({ groups: [NMBS, IKEA], uncategorized_count: 0 });
    renderPage();
    const picker = await screen.findByRole("button", { name: "Category for NMBS" });

    picker.focus();
    await userEvent.keyboard("house{Enter}");

    expect(transactionsApi.confirmCategories).toHaveBeenCalledWith([21, 22, 23], 3);
    expect(card("NMBS")).toBeUndefined();
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirm 1" })).toHaveFocus());
  });

  it("picking the guessed category is the same as Confirm", async () => {
    transactionsApi.getReviewGroups.mockResolvedValue({ groups: [NMBS], uncategorized_count: 0 });
    renderPage();
    const picker = await screen.findByRole("button", { name: "Category for NMBS" });

    picker.focus();
    await userEvent.keyboard("{Enter}{Enter}");

    expect(transactionsApi.confirmCategories).toHaveBeenCalledWith([21, 22, 23]);
  });

  it("a failed confirm brings the group back with an error", async () => {
    transactionsApi.getReviewGroups.mockResolvedValue({ groups: [CARREFOUR, NMBS], uncategorized_count: 0 });
    const save = pending();
    transactionsApi.confirmCategories.mockReturnValue(save.promise);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Confirm 5" }));
    expect(card("Carrefour Market")).toBeUndefined();

    save.reject(new Error("Server said no"));

    await screen.findByText("Server said no");
    expect(card("Carrefour Market")).toBeDefined();
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirm 5" })).toHaveFocus());
  });

  it("three Enter presses clear three groups and show the empty state", async () => {
    transactionsApi.getReviewGroups.mockResolvedValue({ groups: [CARREFOUR, NMBS, IKEA], uncategorized_count: 0 });
    renderPage();

    for (const name of ["Confirm 5", "Confirm 3", "Confirm 1"]) {
      await waitFor(() => expect(screen.getByRole("button", { name })).toHaveFocus());
      await userEvent.keyboard("{Enter}");
    }

    expect(transactionsApi.confirmCategories).toHaveBeenCalledTimes(3);
    const heading = await screen.findByRole("heading", { name: "Nothing to review" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByText("Every transaction has a category.")).toBeInTheDocument();
  });

  it("refreshes the nav count after a confirm", async () => {
    transactionsApi.getReviewGroups.mockResolvedValue({ groups: [IKEA], uncategorized_count: 0 });
    transactionsApi.getReviewCount.mockResolvedValue({ count: 1 });
    render(
      <MemoryRouter>
        <ToastProvider>
          <ReviewCountProvider>
            <ReviewPage />
          </ReviewCountProvider>
        </ToastProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(transactionsApi.getReviewCount).toHaveBeenCalledTimes(1));

    await userEvent.click(await screen.findByRole("button", { name: "Confirm 1" }));

    await waitFor(() => expect(transactionsApi.getReviewCount).toHaveBeenCalledTimes(2));
  });
});

describe("ReviewPage rows", () => {
  it("fixes one row of a mixed payee and keeps the rest of the group", async () => {
    transactionsApi.getReviewGroups.mockResolvedValue({ groups: [CARREFOUR], uncategorized_count: 0 });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Show 5" }));
    expect(screen.getByText("CARREFOUR MARKET 0987")).toBeInTheDocument();
    expect(screen.getByText(/weekly shop/)).toBeInTheDocument();

    const picker = screen.getByRole("button", { name: "Category for CARREFOUR MARKET 0987 on 2026-10-09" });
    picker.focus();
    await userEvent.keyboard("house{Enter}");

    expect(transactionsApi.updateTransaction).toHaveBeenCalledWith(12, { category: 3 });
    expect(transactionsApi.confirmCategories).not.toHaveBeenCalled();
    const carrefour = within(card("Carrefour Market"));
    expect(carrefour.getByRole("button", { name: "Confirm 4" })).toBeInTheDocument();
    expect(carrefour.getByText("4 transactions")).toBeInTheDocument();
    expect(carrefour.getByText(formatMoney(-21240 + 9200))).toBeInTheDocument();
    // Focus moves to the next row's picker.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Category for CARREFOUR MKT on 2026-10-14" })).toHaveFocus(),
    );
  });

  it("after the last row, focus goes back to the group's Confirm", async () => {
    transactionsApi.getReviewGroups.mockResolvedValue({ groups: [CARREFOUR], uncategorized_count: 0 });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Show 5" }));

    const picker = screen.getByRole("button", { name: "Category for Carrefour Market on 2026-10-21" });
    picker.focus();
    await userEvent.keyboard("house{Enter}");

    await waitFor(() => expect(screen.getByRole("button", { name: "Confirm 4" })).toHaveFocus());
  });

  it("a failed row save puts the row back with an error", async () => {
    transactionsApi.getReviewGroups.mockResolvedValue({ groups: [NMBS], uncategorized_count: 0 });
    transactionsApi.updateTransaction.mockRejectedValue(new Error("Server said no"));
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Show 3" }));

    screen.getByRole("button", { name: "Category for NMBS 909 on 2026-10-08" }).focus();
    await userEvent.keyboard("groc{Enter}");

    await screen.findByText("Server said no");
    expect(within(card("NMBS")).getByRole("button", { name: "Confirm 3" })).toBeInTheDocument();
  });
});

describe("ReviewPage empty state", () => {
  it("offers to guess categories for uncategorized transactions and lists the new groups", async () => {
    transactionsApi.getReviewGroups
      .mockResolvedValueOnce({ groups: [], uncategorized_count: 40 })
      .mockResolvedValueOnce({ groups: [CARREFOUR, NMBS], uncategorized_count: 15 });
    transactionsApi.categorizeUncategorized.mockResolvedValue({ categorized_count: 25, attempted_count: 40 });
    renderPage();

    expect(await screen.findByRole("heading", { name: "Nothing to review" })).toBeInTheDocument();
    expect(screen.getByText("40 transactions still have no category.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Guess categories from history" }));

    expect(transactionsApi.categorizeUncategorized).toHaveBeenCalledWith();
    await screen.findByText("Guessed 25 of 40.");
    expect(card("Carrefour Market")).toBeDefined();
    expect(screen.queryByRole("heading", { name: "Nothing to review" })).toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirm 5" })).toHaveFocus());
  });

  it("says so when nothing matched, and points to Transactions instead", async () => {
    transactionsApi.getReviewGroups.mockResolvedValue({ groups: [], uncategorized_count: 40 });
    transactionsApi.categorizeUncategorized.mockResolvedValue({ categorized_count: 0, attempted_count: 40 });
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Guess categories from history" }));

    expect(
      await screen.findByText(/None of the 40 uncategorized transactions match a payee you've categorized before/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Categorize them in Transactions" })).toHaveAttribute(
      "href",
      "/transactions",
    );
    expect(screen.queryByRole("button", { name: "Guess categories from history" })).toBeNull();
  });

  it("has nothing to offer when every transaction has a category", async () => {
    transactionsApi.getReviewGroups.mockResolvedValue({ groups: [], uncategorized_count: 0 });
    renderPage();

    expect(await screen.findByText("Every transaction has a category.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guess categories from history" })).toBeNull();
  });
});
