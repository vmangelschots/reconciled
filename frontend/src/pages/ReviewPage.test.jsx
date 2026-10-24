import { act, render, screen, waitFor, within } from "@testing-library/react";
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

function aiGroup(key, payee, category, transactions, reason) {
  return { ...group(key, payee, category, transactions, null), source: "ai", reason };
}

const BISTRO = aiGroup(
  "bistro",
  "Bistro Lumiere",
  3,
  [row(41, "2026-10-05", "BISTRO LUMIERE 12", -4800), row(42, "2026-10-12", "Bistro Lumiere", -3600)],
  "Restaurant name.",
);
const KINEPOLIS = aiGroup("kinepolis", "Kinepolis", 2, [row(51, "2026-10-06", "KINEPOLIS GENT", -1450)], "");

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

describe("ReviewPage AI guesses", () => {
  it("lists AI groups below the history groups, with their evidence", async () => {
    transactionsApi.getReviewGroups.mockResolvedValue({ groups: [IKEA, BISTRO, KINEPOLIS], uncategorized_count: 0 });
    renderPage();

    await screen.findByText("Bistro Lumiere", { selector: "span" });
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["From your history", "AI guesses"]);
    expect(screen.getByText(/Worth a closer look\./)).toBeInTheDocument();
    expect(
      screen.getByText(
        "4 transactions have a guessed category: 1 from your history, 3 by AI. Confirm each group or pick the right category.",
      ),
    ).toBeInTheDocument();

    const bistro = within(card("Bistro Lumiere"));
    // The reason loses its period and its capital, and is in the title.
    const evidence = bistro.getByText(/^AI guess:/);
    expect(evidence).toHaveTextContent("AI guess: Household · Restaurant name");
    expect(evidence).toHaveAttribute("title", "Restaurant name");
    expect(within(card("Kinepolis")).getByText(/^AI guess:/)).toHaveTextContent(/^AI guess: Transport$/);
    expect(bistro.getByRole("button", { name: "Confirm 2" }).className).toMatch(/border/);
    expect(within(card("IKEA")).getByRole("button", { name: "Confirm 1" }).className).toMatch(/bg-accent/);
  });

  it("an AI-only page starts with focus on the first group's picker", async () => {
    transactionsApi.getReviewGroups.mockResolvedValue({ groups: [BISTRO, KINEPOLIS], uncategorized_count: 0 });
    renderPage();

    await waitFor(() => expect(screen.getByRole("button", { name: "Category for Bistro Lumiere" })).toHaveFocus());
    expect(screen.getByText(/3 transactions have a guessed category: 3 by AI\./)).toBeInTheDocument();
  });

  it("focus stops on the AI group's picker, and Enter opens it instead of confirming", async () => {
    transactionsApi.getReviewGroups.mockResolvedValue({ groups: [IKEA, BISTRO], uncategorized_count: 0 });
    renderPage();

    await waitFor(() => expect(screen.getByRole("button", { name: "Confirm 1" })).toHaveFocus());
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("button", { name: "Category for Bistro Lumiere" })).toHaveFocus());

    await userEvent.keyboard("{Enter}");

    expect(await screen.findByPlaceholderText("Search categories…")).toBeInTheDocument();
    expect(transactionsApi.confirmCategories).toHaveBeenCalledTimes(1);
    expect(transactionsApi.confirmCategories).toHaveBeenCalledWith([31]);
  });

  it("an AI group is confirmed with Tab and Enter, or corrected from its picker", async () => {
    transactionsApi.getReviewGroups.mockResolvedValue({ groups: [BISTRO, KINEPOLIS], uncategorized_count: 0 });
    renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: "Category for Bistro Lumiere" })).toHaveFocus());

    await userEvent.keyboard("{Shift>}{Tab}{/Shift}{Enter}");
    expect(transactionsApi.confirmCategories).toHaveBeenCalledWith([41, 42]);

    await waitFor(() => expect(screen.getByRole("button", { name: "Category for Kinepolis" })).toHaveFocus());
    await userEvent.keyboard("groc{Enter}");
    expect(transactionsApi.confirmCategories).toHaveBeenLastCalledWith([51], 1);
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

  it("with AI on, guesses from history and AI and splits the result by source", async () => {
    transactionsApi.getReviewGroups
      .mockResolvedValueOnce({ groups: [], uncategorized_count: 40, ai_enabled: true })
      .mockResolvedValueOnce({ groups: [CARREFOUR, BISTRO], uncategorized_count: 5, ai_enabled: true });
    transactionsApi.categorizeUncategorized.mockResolvedValue({
      categorized_count: 35,
      attempted_count: 40,
      categorized_by_source: { history: 25, ai: 10 },
      ai: { status: "ok", declined_count: 3 },
    });
    renderPage();

    expect(await screen.findByText("Uses your history first, then AI for new payees.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Guess categories" }));

    await screen.findByText("Guessed 35 of 40: 25 from history, 10 by AI.");
    expect(screen.getByText("3 new payees couldn't be guessed.")).toBeInTheDocument();
    expect(card("Carrefour Market")).toBeDefined();
    expect(card("Bistro Lumiere")).toBeDefined();
  });

  it("says when AI didn't respond or the key was rejected", async () => {
    for (const [status, line] of [
      ["failed", "AI guessing didn't respond."],
      ["key_rejected", "AI is not working: check OPENAI_API_KEY."],
    ]) {
      transactionsApi.getReviewGroups
        .mockResolvedValueOnce({ groups: [], uncategorized_count: 40, ai_enabled: true })
        .mockResolvedValueOnce({ groups: [CARREFOUR], uncategorized_count: 15, ai_enabled: true });
      transactionsApi.categorizeUncategorized.mockResolvedValue({
        categorized_count: 25,
        attempted_count: 40,
        categorized_by_source: { history: 25, ai: 0 },
        ai: { status, declined_count: 0 },
      });
      const { unmount } = renderPage();

      await userEvent.click(await screen.findByRole("button", { name: "Guess categories" }));

      await screen.findByText("Guessed 25 of 40.");
      expect(screen.getByText(line)).toBeInTheDocument();
      expect(card("Carrefour Market")).toBeDefined();
      unmount();
    }
  });

  it("shows that it's working, and that it can take a while", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      transactionsApi.getReviewGroups.mockResolvedValue({ groups: [], uncategorized_count: 40, ai_enabled: true });
      const run = pending();
      transactionsApi.categorizeUncategorized.mockReturnValue(run.promise);
      renderPage();

      await userEvent.click(await screen.findByRole("button", { name: "Guess categories" }));

      const button = screen.getByRole("button", { name: "Guessing…" });
      expect(button).toBeDisabled();
      expect(screen.queryByText("This can take up to a minute.")).toBeNull();
      await act(() => vi.advanceTimersByTimeAsync(4000));
      expect(screen.getByText("This can take up to a minute.")).toBeInTheDocument();
      run.resolve({ categorized_count: 0, attempted_count: 40, categorized_by_source: { history: 0, ai: 0 } });
    } finally {
      vi.useRealTimers();
    }
  });

  it("with AI on and nothing guessed, offers to try again", async () => {
    transactionsApi.getReviewGroups.mockResolvedValue({ groups: [], uncategorized_count: 40, ai_enabled: true });
    transactionsApi.categorizeUncategorized.mockResolvedValue({
      categorized_count: 0,
      attempted_count: 40,
      categorized_by_source: { history: 0, ai: 0 },
      ai: { status: "failed", declined_count: 0 },
    });
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Guess categories" }));

    expect(
      await screen.findByText("Couldn't guess a category for any of the 40 uncategorized transactions."),
    ).toBeInTheDocument();
    expect(screen.getByText("AI guessing didn't respond.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Categorize them in Transactions" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(transactionsApi.categorizeUncategorized).toHaveBeenCalledTimes(2));
  });

  it("has nothing to offer when every transaction has a category", async () => {
    transactionsApi.getReviewGroups.mockResolvedValue({ groups: [], uncategorized_count: 0 });
    renderPage();

    expect(await screen.findByText("Every transaction has a category.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guess categories from history" })).toBeNull();
  });
});
