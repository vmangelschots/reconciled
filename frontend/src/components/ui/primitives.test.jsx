import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { Amount } from "./Amount";
import { EmptyState } from "./EmptyState";
import { ListRow } from "./ListRow";
import { MonthSwitcher } from "./MonthSwitcher";
import { PageHeader } from "./PageHeader";
import { Panel } from "./Panel";
import { ProgressBar } from "./ProgressBar";
import { Stat } from "./Stat";

afterEach(() => vi.useRealTimers());

describe("MonthSwitcher", () => {
  it("can't go past the current month", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 24));
    const onChange = vi.fn();
    render(<MonthSwitcher month="2026-10" onChange={onChange} />);

    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(onChange).toHaveBeenCalledWith("2026-09");
  });

  it("uses local time for the current month", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 1, 0, 30)); // 1 Nov 00:30 local
    render(<MonthSwitcher month="2026-10" onChange={() => {}} />);

    expect(screen.getByRole("button", { name: "Next month" })).toBeEnabled();
  });
});

describe("Amount", () => {
  it("marks money in only when signed", () => {
    const { rerender } = render(<Amount cents={240000} signed />);
    expect(screen.getByText(/^\+/)).toHaveClass("text-positive", "num");

    rerender(<Amount cents={-4520} signed />);
    expect(screen.getByText(/45/)).not.toHaveClass("text-positive");

    rerender(<Amount cents={240000} />);
    expect(screen.getByText(/2,400|2\.400/)).not.toHaveClass("text-positive");
    expect(screen.getByText(/2,400|2\.400/).textContent).not.toMatch(/^\+/);
  });
});

describe("ProgressBar", () => {
  it("is capped at full and turns critical when over, with a marker", () => {
    const { rerender } = render(<ProgressBar value={1940} max={2600} marker={0.77} />);
    expect(screen.getByTestId("progress-fill").style.width).toBe(`${(1940 / 2600) * 100}%`);
    expect(screen.getByTestId("progress-fill")).toHaveClass("bg-accent");
    expect(screen.getByTestId("progress-marker").style.left).toBe("77%");

    rerender(<ProgressBar value={2750} max={2600} />);
    expect(screen.getByTestId("progress-fill").style.width).toBe("100%");
    expect(screen.getByTestId("progress-fill")).toHaveClass("bg-critical");
    expect(screen.queryByTestId("progress-marker")).toBeNull();
  });
});

describe("Panel", () => {
  it("shows its title, actions and body", () => {
    render(
      <Panel title="Needs attention" actions={<button type="button">View all</button>}>
        body
      </Panel>,
    );
    expect(screen.getByRole("heading", { name: "Needs attention" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View all" })).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("shows a skeleton while loading and a message on error", () => {
    const { rerender } = render(<Panel title="Budget" loading>body</Panel>);
    expect(screen.getByTestId("panel-loading")).toBeInTheDocument();
    expect(screen.queryByText("body")).toBeNull();

    rerender(<Panel title="Budget" error="Couldn't load the budget.">body</Panel>);
    expect(screen.getByText("Couldn't load the budget.")).toBeInTheDocument();
    expect(screen.queryByText("body")).toBeNull();
  });
});

describe("Stat, PageHeader, ListRow and EmptyState", () => {
  it("render their parts", () => {
    render(
      <MemoryRouter>
        <PageHeader title="Overview">
          <button type="button">Import</button>
        </PageHeader>
        <Stat label="Balance" note="Today" value="€3,482">
          <span>+€1,210 this month</span>
        </Stat>
        <ul>
          <ListRow to="/review" primary="12 guesses to review" secondary="Review" end="12" />
        </ul>
        <EmptyState compact>Everything is in order.</EmptyState>
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Overview" })).toBeInTheDocument();
    expect(screen.getByText("· Today")).toBeInTheDocument();
    expect(screen.getByText("€3,482")).toHaveClass("num");
    expect(screen.getByRole("link", { name: /12 guesses to review/ })).toHaveAttribute("href", "/review");
    expect(screen.getByText("Everything is in order.")).toBeInTheDocument();
  });
});
