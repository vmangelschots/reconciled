import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { focusAdjacentTabbable } from "./focus";

function Row() {
  return (
    <div>
      <button type="button">first</button>
      <input aria-label="disabled" disabled />
      <button type="button" tabIndex={-1}>
        untabbable
      </button>
      <div hidden>
        <button type="button">hidden</button>
      </div>
      <button type="button">middle</button>
      <input aria-label="text" />
    </div>
  );
}

describe("focusAdjacentTabbable", () => {
  it("focuses the next tabbable element, skipping disabled, hidden and tabindex=-1", () => {
    render(<Row />);
    expect(focusAdjacentTabbable(screen.getByText("first"), "next")).toBe(true);
    expect(screen.getByText("middle")).toHaveFocus();
  });

  it("focuses the previous tabbable element", () => {
    render(<Row />);
    focusAdjacentTabbable(screen.getByText("middle"), "prev");
    expect(screen.getByText("first")).toHaveFocus();
  });

  it("moves forward onto an input", () => {
    render(<Row />);
    focusAdjacentTabbable(screen.getByText("middle"), "next");
    expect(screen.getByLabelText("text")).toHaveFocus();
  });

  it("returns false when there is no neighbor", () => {
    render(<Row />);
    expect(focusAdjacentTabbable(screen.getByLabelText("text"), "next")).toBe(false);
    expect(focusAdjacentTabbable(screen.getByText("first"), "prev")).toBe(false);
  });
});
