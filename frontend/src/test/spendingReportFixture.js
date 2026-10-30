const MONTHS = ["2026-08", "2026-09"];

function figures(cents) {
  const total_cents = cents.reduce((sum, c) => sum + c, 0);
  return { cents, total_cents, avg_cents: Math.round(total_cents / cents.length) };
}

function row(id, name, cents, children = []) {
  return { category_id: id, name, children, ...figures(cents) };
}

// A two-month report: nine categories, Groceries with a subcategory.
export function report(overrides = {}) {
  const categories = [
    row(1, "Groceries", [41200, 38800], [
      { category_id: 11, name: "Supermarket", direct: false, ...figures([30000, 28800]) },
      { category_id: 1, name: "Groceries (direct)", direct: true, ...figures([11200, 10000]) },
    ]),
    row(2, "Home", [-3500, 20000]),
    ...["Car", "Fun", "Gifts", "Kids", "Pets", "Sport", "Travel"].map((name, i) => row(3 + i, name, [10000 - i * 100, 0])),
  ];
  const income_categories = [row(20, "Salary", [300000, 300000])];
  const spending = figures([100000, 80000]);
  const income = figures([300000, 300000]);
  const net = figures([200000, 220000]);
  return {
    has_data: true,
    current_month: "2026-10",
    months: MONTHS,
    full_months: MONTHS,
    income_categories,
    uncategorized_income: figures([0, 5000]),
    categories,
    uncategorized: figures([1000, 2000]),
    spending,
    income,
    net,
    savings_rate: { percents: [67, 73], total: 70 },
    in_out: MONTHS.map((month) => ({ month, in_cents: 300000, out_cents: 100000 })),
    ...overrides,
  };
}
