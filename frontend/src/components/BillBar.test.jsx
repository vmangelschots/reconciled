import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});
