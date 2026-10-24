import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CategoryCombobox } from "./CategoryCombobox";

const CATEGORIES = [
  { id: 1, name: "Groceries", parent_id: null },
  { id: 2, name: "Transport", parent_id: null },
  { id: 3, name: "Supermarket", parent_id: 1 },
];

async function open() {
  await userEvent.click(screen.getByRole("button"));
}

describe("CategoryCombobox", () => {
  it("lists every category when the search is empty", async () => {
    render(<CategoryCombobox categories={CATEGORIES} value={null} onSelect={vi.fn()} />);
    await open();
    expect(screen.getByText("Groceries")).toBeInTheDocument();
    expect(screen.getByText("Transport")).toBeInTheDocument();
    expect(screen.getByText("Groceries / Supermarket")).toBeInTheDocument();
  });

  it("narrows to matches as the user types", async () => {
    render(<CategoryCombobox categories={CATEGORIES} value={null} onSelect={vi.fn()} />);
    await open();
    await userEvent.type(screen.getByPlaceholderText("Search categories…"), "Trans");

    expect(screen.getByText("Transport")).toBeInTheDocument();
    expect(screen.queryByText("Groceries")).not.toBeInTheDocument();
    expect(screen.queryByText("Groceries / Supermarket")).not.toBeInTheDocument();
  });

  it("typing a parent's name also surfaces its subcategories", async () => {
    render(<CategoryCombobox categories={CATEGORIES} value={null} onSelect={vi.fn()} />);
    await open();
    await userEvent.type(screen.getByPlaceholderText("Search categories…"), "Grocer");

    expect(screen.getByText("Groceries")).toBeInTheDocument();
    expect(screen.getByText("Groceries / Supermarket")).toBeInTheDocument();
    expect(screen.queryByText("Transport")).not.toBeInTheDocument();
  });

  it("calls onSelect with the chosen category's id", async () => {
    const onSelect = vi.fn();
    render(<CategoryCombobox categories={CATEGORIES} value={null} onSelect={onSelect} />);
    await open();
    await userEvent.click(screen.getByText("Transport"));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("calls onSelect with null when the clear option is chosen", async () => {
    const onSelect = vi.fn();
    render(<CategoryCombobox categories={CATEGORIES} value={1} onSelect={onSelect} />);
    await open();
    await userEvent.click(screen.getByText("Uncategorized"));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("offers to create a category when allowCreate is on and nothing matches", async () => {
    render(<CategoryCombobox categories={CATEGORIES} value={null} onSelect={vi.fn()} allowCreate onCreate={vi.fn()} />);
    await open();
    await userEvent.type(screen.getByPlaceholderText("Search categories…"), "Takeout");
    expect(screen.getByText('Create "Takeout"')).toBeInTheDocument();
  });

  it("never offers to create when allowCreate is off, even with no match", async () => {
    render(<CategoryCombobox categories={CATEGORIES} value={null} onSelect={vi.fn()} />);
    await open();
    await userEvent.type(screen.getByPlaceholderText("Search categories…"), "Takeout");
    expect(screen.queryByText('Create "Takeout"')).not.toBeInTheDocument();
  });

  it("does not offer to create when the typed text exactly matches an existing category", async () => {
    render(<CategoryCombobox categories={CATEGORIES} value={null} onSelect={vi.fn()} allowCreate onCreate={vi.fn()} />);
    await open();
    await userEvent.type(screen.getByPlaceholderText("Search categories…"), "Transport");
    expect(screen.queryByText('Create "Transport"')).not.toBeInTheDocument();
  });

  it("calls onCreate with the typed name when the create option is chosen", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<CategoryCombobox categories={CATEGORIES} value={null} onSelect={vi.fn()} allowCreate onCreate={onCreate} />);
    await open();
    await userEvent.type(screen.getByPlaceholderText("Search categories…"), "Takeout");
    await userEvent.click(screen.getByText('Create "Takeout"'));
    expect(onCreate).toHaveBeenCalledWith("Takeout");
  });

  it('hides the clear option while searching for something else', async () => {
    render(<CategoryCombobox categories={CATEGORIES} value={1} onSelect={vi.fn()} />);
    await open();
    await userEvent.type(screen.getByPlaceholderText("Search categories…"), "trans");
    expect(screen.queryByText("Uncategorized")).not.toBeInTheDocument();
  });

  it("lists the clear option when its own label matches the search", async () => {
    render(<CategoryCombobox categories={CATEGORIES} value={1} onSelect={vi.fn()} />);
    await open();
    await userEvent.type(screen.getByPlaceholderText("Search categories…"), "uncat");
    expect(screen.getByText("Uncategorized")).toBeInTheDocument();
  });

  it("forwards aria-label to the trigger", () => {
    render(<CategoryCombobox categories={CATEGORIES} value={null} onSelect={vi.fn()} aria-label="Category" />);
    expect(screen.getByRole("button", { name: "Category" })).toBeInTheDocument();
  });
});

describe("CategoryCombobox highlight", () => {
  it("Enter after typing picks the best match, not the clear option", async () => {
    const onSelect = vi.fn();
    render(<CategoryCombobox categories={CATEGORIES} value={null} onSelect={onSelect} />);
    await open();
    await userEvent.type(screen.getByPlaceholderText("Search categories…"), "groc{Enter}");
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("Enter without typing keeps the current value", async () => {
    const onSelect = vi.fn();
    render(<CategoryCombobox categories={CATEGORIES} value={2} onSelect={onSelect} />);
    await open();
    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("Enter with no match creates the typed category when allowed", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<CategoryCombobox categories={CATEGORIES} value={null} onSelect={vi.fn()} allowCreate onCreate={onCreate} />);
    await open();
    await userEvent.type(screen.getByPlaceholderText("Search categories…"), "Pets{Enter}");
    expect(onCreate).toHaveBeenCalledWith("Pets");
  });

  it("arrow keys still move the highlight", async () => {
    const onSelect = vi.fn();
    render(<CategoryCombobox categories={CATEGORIES} value={null} onSelect={onSelect} />);
    await open();
    // Empty search highlights "Uncategorized" (first); one down is Groceries.
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});

describe("CategoryCombobox type-to-open", () => {
  it("typing on the focused trigger opens it with that character", async () => {
    render(<CategoryCombobox categories={CATEGORIES} value={null} onSelect={vi.fn()} />);
    screen.getByRole("button").focus();
    await userEvent.keyboard("g");
    const input = screen.getByPlaceholderText("Search categories…");
    expect(input).toHaveFocus();
    expect(input).toHaveValue("g");
    expect(screen.queryByText("Transport")).not.toBeInTheDocument();
  });

  it("keeps typing into the search after opening", async () => {
    const onSelect = vi.fn();
    render(<CategoryCombobox categories={CATEGORIES} value={null} onSelect={onSelect} />);
    screen.getByRole("button").focus();
    await userEvent.keyboard("tra{Enter}");
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("ArrowDown opens with an empty search", async () => {
    render(<CategoryCombobox categories={CATEGORIES} value={null} onSelect={vi.fn()} />);
    screen.getByRole("button").focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByPlaceholderText("Search categories…")).toHaveValue("");
  });

  it("does not capture modifier shortcuts", async () => {
    render(<CategoryCombobox categories={CATEGORIES} value={null} onSelect={vi.fn()} />);
    screen.getByRole("button").focus();
    await userEvent.keyboard("{Control>}r{/Control}");
    expect(screen.queryByPlaceholderText("Search categories…")).not.toBeInTheDocument();
  });
});

describe("CategoryCombobox Tab / Escape", () => {
  function Between(props) {
    return (
      <div>
        <button type="button">before</button>
        <CategoryCombobox categories={CATEGORIES} aria-label="Category" {...props} />
        <button type="button">after</button>
      </div>
    );
  }

  async function typeInPicker(text) {
    screen.getByRole("button", { name: "Category" }).focus();
    await userEvent.keyboard(text);
  }

  it("Tab picks the highlighted match and focuses the next field", async () => {
    const onSelect = vi.fn();
    render(<Between value={null} onSelect={onSelect} />);
    await typeInPicker("trans{Tab}");
    expect(onSelect).toHaveBeenCalledWith(2);
    expect(screen.getByText("after")).toHaveFocus();
  });

  it("Shift+Tab picks the match and focuses the previous field", async () => {
    const onSelect = vi.fn();
    render(<Between value={null} onSelect={onSelect} />);
    await typeInPicker("trans{Shift>}{Tab}{/Shift}");
    expect(onSelect).toHaveBeenCalledWith(2);
    expect(screen.getByText("before")).toHaveFocus();
  });

  it("Tab with no match neither selects nor creates", async () => {
    const onSelect = vi.fn();
    const onCreate = vi.fn();
    render(<Between value={1} onSelect={onSelect} allowCreate onCreate={onCreate} />);
    await typeInPicker("Pets{Tab}");
    expect(onSelect).not.toHaveBeenCalled();
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByText("after")).toHaveFocus();
  });

  it("Escape closes without changing the value and returns focus to the trigger", async () => {
    const onSelect = vi.fn();
    render(<Between value={1} onSelect={onSelect} />);
    await typeInPicker("trans{Escape}");
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText("Search categories…")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Category" })).toHaveFocus();
  });

  it("Enter returns focus to the trigger", async () => {
    render(<Between value={null} onSelect={vi.fn()} />);
    await typeInPicker("trans{Enter}");
    expect(screen.getByRole("button", { name: "Category" })).toHaveFocus();
  });

  it("reopening after Escape starts with an empty search", async () => {
    render(<Between value={1} onSelect={vi.fn()} />);
    await typeInPicker("trans{Escape}{Enter}");
    expect(screen.getByPlaceholderText("Search categories…")).toHaveValue("");
  });
});

describe("CategoryCombobox transfer options", () => {
  const ACCOUNTS = [
    { id: 20, name: "Savings" },
    { id: 21, name: "Credit card" },
  ];

  function renderPicker(props = {}) {
    const onSelect = vi.fn();
    const onSelectTransfer = vi.fn();
    render(
      <div>
        <CategoryCombobox
          categories={CATEGORIES}
          value={null}
          onSelect={onSelect}
          aria-label="Category"
          transferAccounts={ACCOUNTS}
          onSelectTransfer={onSelectTransfer}
          {...props}
        />
        <button type="button">after</button>
      </div>,
    );
    return { onSelect, onSelectTransfer };
  }

  async function typeInPicker(text) {
    screen.getByRole("button", { name: "Category" }).focus();
    await userEvent.keyboard(text);
  }

  it("lists the accounts after the categories under a Transfer heading", async () => {
    renderPicker();
    await userEvent.click(screen.getByRole("button", { name: "Category" }));
    expect(screen.getByText("Transfer to")).toBeInTheDocument();
    expect(screen.getByText("→ Savings")).toBeInTheDocument();
    expect(screen.getByText("→ Credit card")).toBeInTheDocument();
  });

  it("finds a transfer by typing and picks it with Enter", async () => {
    const { onSelect, onSelectTransfer } = renderPicker();
    await typeInPicker("sav{Enter}");
    expect(onSelectTransfer).toHaveBeenCalledWith(20);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("picks a transfer with Tab and moves on", async () => {
    const { onSelectTransfer } = renderPicker();
    await typeInPicker("cred{Tab}");
    expect(onSelectTransfer).toHaveBeenCalledWith(21);
    expect(screen.getByText("after")).toHaveFocus();
  });

  it("prefers a matching category over a transfer", async () => {
    // "s" matches Supermarket (a category) and Savings (an account).
    const { onSelect, onSelectTransfer } = renderPicker();
    await typeInPicker("s{Enter}");
    expect(onSelect).toHaveBeenCalledWith(3);
    expect(onSelectTransfer).not.toHaveBeenCalled();
  });

  it("uses ← for an inflow", async () => {
    renderPicker({ direction: "in" });
    await userEvent.click(screen.getByRole("button", { name: "Category" }));
    expect(screen.getByText("Transfer from")).toBeInTheDocument();
    expect(screen.getByText("← Savings")).toBeInTheDocument();
  });

  it("shows the current transfer on the trigger and highlights it on open", async () => {
    const { onSelectTransfer } = renderPicker({ transferAccountId: 20 });
    expect(screen.getByRole("button", { name: "Category" })).toHaveTextContent("→ Savings");
    await typeInPicker("{Enter}{Enter}");
    expect(onSelectTransfer).toHaveBeenCalledWith(20);
  });

  it("falls back to the given name for an account not offered (e.g. archived)", () => {
    renderPicker({ transferAccountId: 99, transferAccountName: "Old savings" });
    expect(screen.getByRole("button", { name: "Category" })).toHaveTextContent("→ Old savings");
  });

  it("offers no transfers to callers that don't pass onSelectTransfer", async () => {
    render(<CategoryCombobox categories={CATEGORIES} value={null} onSelect={vi.fn()} aria-label="Plain" />);
    await userEvent.click(screen.getByRole("button", { name: "Plain" }));
    expect(screen.queryByText(/Transfer/)).not.toBeInTheDocument();
  });
});

describe("CategoryCombobox guesses", () => {
  it("styles a guessed category with its source and a hint", () => {
    render(<CategoryCombobox categories={CATEGORIES} value={1} onSelect={vi.fn()} suggestion="history" />);

    const trigger = screen.getByRole("button");
    expect(trigger).toHaveAttribute("data-suggestion", "history");
    expect(trigger).toHaveClass("border-dashed");
    expect(trigger).toHaveAttribute("title", "Guessed from history. Pick a category to confirm.");
    expect(trigger.querySelector("svg.lucide-history")).not.toBeNull();
  });

  it("puts an AI guess's reason in its hint", () => {
    const { rerender } = render(
      <CategoryCombobox
        categories={CATEGORIES}
        value={1}
        onSelect={vi.fn()}
        suggestion="ai"
        suggestionReason="Restaurant name."
      />,
    );

    const trigger = screen.getByRole("button");
    expect(trigger).toHaveAttribute("data-suggestion", "ai");
    expect(trigger.querySelector("svg.lucide-sparkles")).not.toBeNull();
    expect(trigger).toHaveAttribute("title", "Guessed by AI (Restaurant name). Pick a category to confirm.");

    rerender(<CategoryCombobox categories={CATEGORIES} value={1} onSelect={vi.fn()} suggestion="ai" />);
    expect(trigger).toHaveAttribute("title", "Guessed by AI. Pick a category to confirm.");
  });

  it("shows no guess style for a confirmed category", () => {
    render(<CategoryCombobox categories={CATEGORIES} value={1} onSelect={vi.fn()} />);

    const trigger = screen.getByRole("button");
    expect(trigger).not.toHaveAttribute("data-suggestion");
    expect(trigger).not.toHaveClass("border-dashed");
    expect(trigger).not.toHaveAttribute("title");
  });

  it("ignores a suggestion when no category is shown", () => {
    render(<CategoryCombobox categories={CATEGORIES} value={null} onSelect={vi.fn()} suggestion="history" />);

    expect(screen.getByRole("button")).not.toHaveAttribute("data-suggestion");
  });

  it("keeps the trigger's width classes when guessed", () => {
    render(
      <CategoryCombobox categories={CATEGORIES} value={1} onSelect={vi.fn()} suggestion="history" className="w-48" />,
    );

    expect(screen.getByRole("button")).toHaveClass("min-w-32", "w-48");
  });
});

describe("CategoryCombobox restoreFocusOnSelect", () => {
  it("returns focus to the trigger after a pick by default", async () => {
    render(<CategoryCombobox categories={CATEGORIES} value={null} onSelect={vi.fn()} />);
    screen.getByRole("button").focus();
    await userEvent.keyboard("groc{Enter}");

    await vi.waitFor(() => expect(screen.getByRole("button")).toHaveFocus());
  });

  it("leaves focus to the caller when turned off", async () => {
    const onSelect = vi.fn(() => document.getElementById("elsewhere").focus());
    render(
      <>
        <CategoryCombobox categories={CATEGORIES} value={null} onSelect={onSelect} restoreFocusOnSelect={false} />
        <button id="elsewhere" type="button">
          Elsewhere
        </button>
      </>,
    );
    screen.getAllByRole("button")[0].focus();
    await userEvent.keyboard("groc{Enter}");
    await new Promise((r) => setTimeout(r, 20));

    expect(screen.getByRole("button", { name: "Elsewhere" })).toHaveFocus();
  });

  describe("Split…", () => {
    const WITH_SPORTS = [...CATEGORIES, { id: 4, name: "Sports", parent_id: null }];

    it("is listed last when the search is empty", async () => {
      render(<CategoryCombobox categories={CATEGORIES} value={null} onSelect={vi.fn()} onSplit={vi.fn()} />);
      await open();
      const options = screen.getAllByRole("option");
      expect(options.at(-1)).toHaveTextContent("Split…");
    });

    it("comes first while typing the start of split, ahead of a matching category", async () => {
      const onSplit = vi.fn();
      const onSelect = vi.fn();
      render(<CategoryCombobox categories={WITH_SPORTS} value={null} onSelect={onSelect} onSplit={onSplit} />);
      await open();
      await userEvent.type(screen.getByPlaceholderText("Search categories…"), "sp{Enter}");

      expect(onSplit).toHaveBeenCalledOnce();
      expect(onSelect).not.toHaveBeenCalled();
    });

    it("leaves other searches to the categories", async () => {
      const onSplit = vi.fn();
      const onSelect = vi.fn();
      render(<CategoryCombobox categories={CATEGORIES} value={null} onSelect={onSelect} onSplit={onSplit} />);
      await open();
      await userEvent.type(screen.getByPlaceholderText("Search categories…"), "gro{Enter}");

      expect(onSelect).toHaveBeenCalledWith(1);
      expect(onSplit).not.toHaveBeenCalled();
      await open();
      await userEvent.type(screen.getByPlaceholderText("Search categories…"), "gro");
      expect(screen.queryByText("Split…")).not.toBeInTheDocument();
    });

    it("Tab never picks it", async () => {
      const onSplit = vi.fn();
      const onSelect = vi.fn();
      render(<CategoryCombobox categories={CATEGORIES} value={null} onSelect={onSelect} onSplit={onSplit} />);
      await open();
      await userEvent.type(screen.getByPlaceholderText("Search categories…"), "spl");
      await userEvent.tab();

      expect(onSplit).not.toHaveBeenCalled();
      expect(onSelect).not.toHaveBeenCalled();
    });

    it("is not offered without onSplit", async () => {
      render(<CategoryCombobox categories={CATEGORIES} value={null} onSelect={vi.fn()} />);
      await open();
      expect(screen.queryByText("Split…")).not.toBeInTheDocument();
    });
  });
});
