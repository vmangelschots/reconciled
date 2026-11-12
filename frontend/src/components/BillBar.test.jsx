import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatMoney } from "../lib/money";
import { BillBar } from "./BillBar";

describe("BillBar", () => {
  it("sizes segments by amount and fills them by state, without a pace marker", () => {
    render(
      <BillBar
        label="Mortgage bills"
        bills={[
          { id: 1, name: "House A", amountCents: 105000, state: "paid" },
          { id: 2, name: "House B", amountCents: 42000, state: "missed" },
        ]}
      />,
    );
    const [first, second] = screen.getAllByTestId("bill-segment");
    expect(first.style.flexGrow).toBe("105000");
    expect(second.style.flexGrow).toBe("42000");
    expect(first).toHaveClass("bg-positive");
    expect(second).toHaveClass("bg-critical");
    expect(screen.queryByTestId("progress-marker")).toBeNull();
  });

  it("leaves an upcoming bill unfilled", () => {
    render(<BillBar label="Streaming bills" bills={[{ id: 1, name: "Spotify", amountCents: 1099, state: "upcoming" }]} />);
    expect(screen.getByTestId("bill-segment").className).not.toMatch(/bg-(positive|critical|warning|accent)/);
  });

  it("ends with a critical segment for what is beyond the bills, never wider than the bills", () => {
    const bills = [
      { id: 1, name: "Vincent", amountCents: 20000, state: "paid" },
      { id: 2, name: "Partner", amountCents: 20000, state: "paid" },
    ];
    const { rerender } = render(<BillBar label="Spending money bills" bills={bills} overCents={5000} />);
    const over = screen.getByTestId("bill-over");
    expect(over).toHaveClass("bg-critical");
    expect(over.style.flexGrow).toBe("5000");
    expect(over).toHaveAttribute("title", `${formatMoney(5000)} beyond the bills`);

    rerender(<BillBar label="Spending money bills" bills={bills} overCents={500000} />);
    expect(screen.getByTestId("bill-over").style.flexGrow).toBe("40000");

    rerender(<BillBar label="Spending money bills" bills={bills} overCents={0} />);
    expect(screen.queryByTestId("bill-over")).toBeNull();
  });
});
