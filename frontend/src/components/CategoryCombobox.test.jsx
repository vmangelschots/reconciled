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
