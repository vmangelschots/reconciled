import { describe, expect, it } from "vitest";
import { billLabel, billWarning, budgetList, reviewItems, verdict } from "./budgetOverview";
import { formatMoney, formatMoneyWhole as whole } from "./money";
import { formatDayMonth } from "./yearlyBudgets";

function bill(id, name, day, cents, state, extra = {}) {
  return {
    id, name, day, due_date: `2026-11-${String(day).padStart(2, "0")}`, amount_cents: cents, state,
    paid_on: null, paid_cents: null, difference_cents: null, source: "manual", ...extra,
  };
}

function streaming(bills, fields = {}) {
  const limit = bills.reduce((sum, b) => sum + b.amount_cents, 0);
  const spent = fields.spent_cents ?? bills.filter((b) => b.paid_on).reduce((sum, b) => sum + b.paid_cents, 0);
  return {
    category_id: 7, category_name: "Streaming", parent_id: null, kind: "bills", limit_cents: limit, spent_cents: spent,
    remaining_cents: limit - spent, over_limit: spent > limit, covers_subcategories: false, covered_by_parent: false,
    caps_cents: null, group_spent_cents: null, overridden: false, bills,
    paid_count: bills.filter((b) => b.paid_on).length,
    due_to_date_cents: 0,
    unpaid_cents: bills.filter((b) => !b.paid_on).reduce((sum, b) => sum + b.amount_cents, 0),
    ...fields,
  };
}

const paid = (on, cents) => ({ paid_on: on, paid_cents: cents });

function summary(categories, attention = {}) {
  return {
    categories,
    yearly: { year: 2026, through: "2026-11-19", start_month: null, starts: null, categories: [] },
    pace: 0.63,
    attention: { categories: [], yearly: [], bills: [], ...attention },
    totals: { has_limits: true, limit_cents: 4097, spent_cents: 2998, outside_cents: 0 },
  };
}

const rowOf = (s) => budgetList(s, []).rows[0];

describe("Bills rows", () => {
  it("two of three paid", () => {
    const row = rowOf(summary([streaming([
      bill(1, "Netflix", 5, 1799, "paid", paid("2026-11-05", 1799)),
      bill(2, "Disney+", 8, 1199, "paid", paid("2026-11-09", 1199)),
      bill(3, "Spotify", 21, 1099, "due_soon"),
    ])]));
    expect(row.figure).toBe(`${whole(1099)} to pay`);
    expect(row.caption).toBe(`2 of 3 paid · Spotify due ${formatDayMonth("2026-11-21")}`);
    expect(row.bar).toBeUndefined();
    expect(row.bills.map((b) => [b.amountCents, b.state])).toEqual([[1799, "paid"], [1199, "paid"], [1099, "due_soon"]]);
  });

  it("all paid", () => {
    const row = rowOf(summary([streaming([bill(1, "Netflix", 5, 1799, "paid", paid("2026-11-05", 1799))])]));
    expect(row.figure).toBe("Paid");
    expect(row.critical).toBe(false);
  });

  it("a missed bill", () => {
    const row = rowOf(summary([streaming([
      bill(1, "Netflix", 5, 1799, "paid", paid("2026-11-05", 1799)),
      bill(2, "Disney+", 8, 1199, "paid", paid("2026-11-08", 1199)),
      bill(3, "Spotify", 21, 1099, "missed"),
    ])]));
    expect(row.caption).toBe("2 of 3 paid · Spotify missed");
  });

  it("over", () => {
    const row = rowOf(summary([streaming([bill(1, "Netflix", 5, 1799, "paid", paid("2026-11-05", 1799))], { spent_cents: 2999 })]));
    expect(row.figure).toBe(`${whole(1200)} over`);
    expect(row.critical).toBe(true);
  });

  it("a Bills category without bills reads like one without a budget", () => {
    const row = budgetList(
      summary([streaming([], {
        limit_cents: null, remaining_cents: null, spent_cents: 799, review: true,
        extras: [{ id: 91, date: "2026-11-18", payee: "PayPal", amount_cents: 799 }],
      })]),
      [],
    ).noBudget.rows[0];
    expect(row.budgeted).toBe(false);
    expect(row.figure).toBe(`${whole(799)} spent`);
    // Still a Bills sheet, so its payment can become the first bill.
    expect(row.bills).toEqual([]);
    expect(row.review.map((i) => [i.kind, i.payment.amount_cents])).toEqual([["extra", 799]]);
  });
});

describe("bill labels", () => {
  const through = "2026-11-19";
  it("says paid on its date, over by how much, or when it's due", () => {
    expect(billLabel(bill(1, "Netflix", 5, 1799, "paid", paid("2026-11-05", 1799)), through)).toBe(`Paid ${formatDayMonth("2026-11-05")}`);
    expect(billLabel(bill(1, "Netflix", 5, 1799, "paid_over", { difference_cents: 200 }), through)).toBe(`+${formatMoney(200)}`);
    expect(billLabel(bill(1, "Netflix", 5, 1799, "paid_under", { difference_cents: -200 }), through)).toBe(`\u2212${formatMoney(200)}`);
    expect(billLabel(bill(3, "Spotify", 21, 1099, "due_soon"), through)).toBe("In 2 days");
    expect(billLabel(bill(3, "Spotify", 19, 1099, "due_soon"), through)).toBe("Today");
    expect(billLabel(bill(3, "Spotify", 21, 1099, "not_seen"), through)).toBe("Not seen");
    expect(billLabel(bill(3, "Spotify", 21, 1099, "missed"), through)).toBe("Missed");
    expect(billLabel(bill(3, "Spotify", 28, 1099, "upcoming"), through)).toBeNull();
  });
});

describe("bill warnings", () => {
  it("Spotify missed", () => {
    const warning = billWarning({ name: "Spotify", category_name: "Streaming", parent_name: null, due_date: "2026-11-21", amount_cents: 1099 });
    expect(warning).toEqual({
      primary: "Spotify missed",
      secondary: `Streaming · due ${formatDayMonth("2026-11-21")} · ${whole(1099)}`,
      critical: true,
    });
  });

  it("counts in the verdict", () => {
    const s = summary([], { bills: [{ name: "Spotify" }] });
    expect(verdict(s, "2026-11", "2026-11")).toBe("1 needs a look");
  });
});

describe("review items", () => {
  const rows = (fields) => streaming([
    bill(1, "Netflix", 5, 1799, "paid_over", { paid_on: "2026-11-05", paid_cents: 1999, difference_cents: 200 }),
    bill(2, "Disney+", 8, 1199, "paid", paid("2026-11-08", 1199)),
  ], { extras: [{ id: 91, date: "2026-11-18", payee: "PayPal", amount_cents: 799 }], review: true, ...fields });

  it("lists bills paid at another amount and payments that pay no bill", () => {
    const items = reviewItems(rows());
    expect(items.map((i) => i.kind)).toEqual(["price", "extra"]);
    expect(items[0].text).toBe(`Netflix paid ${formatMoney(1999)}, expected ${formatMoney(1799)}`);
    expect(items[1].payment.payee).toBe("PayPal");
  });

  it("is empty outside this month and the one before", () => {
    expect(reviewItems(rows({ review: false }))).toEqual([]);
  });

  it("never offers to update a loan bill", () => {
    const row = streaming([bill(1, "House A", 7, 105000, "paid_over", { source: "loan", paid_cents: 110000, difference_cents: 5000 })], { review: true, extras: [] });
    expect(reviewItems(row)).toEqual([]);
  });
});
