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
});
