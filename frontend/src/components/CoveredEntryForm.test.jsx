import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CoveredEntryForm } from "./CoveredEntryForm";
import { todayIso } from "../lib/dates";
import { formatMoney } from "../lib/money";

const CATEGORIES = [
  { id: 1, name: "Takeout", parent: null, is_tab_group: false, is_tab: false },
  { id: 10, name: "Tabs", parent: null, is_tab_group: true, is_tab: false },
  { id: 11, name: "Sarah", parent: 10, is_tab_group: false, is_tab: true },
  { id: 12, name: "Jan", parent: 10, is_tab_group: false, is_tab: true },
];

function renderForm(props = {}) {
  const handlers = { onSave: vi.fn().mockResolvedValue({}), onDelete: vi.fn().mockResolvedValue({}), onCancel: vi.fn() };
  render(<CoveredEntryForm tabName="Sarah" balanceCents={1000} categories={CATEGORIES} {...handlers} {...props} />);
  return handlers;
}

async function pickCategory(name) {
  await userEvent.click(screen.getByRole("button", { name: "Category" }));
  await userEvent.click(screen.getByRole("option", { name }));
}

describe("CoveredEntryForm", () => {
  it("opens with the amount focused and today's date", () => {
    renderForm();

    expect(screen.getByLabelText("Amount")).toHaveFocus();
    expect(screen.getByLabelText("Date")).toHaveValue(todayIso());
  });

  it("previews the tab's balance while typing", async () => {
    renderForm();

    await userEvent.type(screen.getByLabelText("Amount"), "15");
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(`You'll owe Sarah ${formatMoney(500)}`);
    expect(status.querySelector(".text-warning")).not.toBeNull();

    await userEvent.clear(screen.getByLabelText("Amount"));
    await userEvent.type(screen.getByLabelText("Amount"), "10");
    expect(status).toHaveTextContent("Settled");
    expect(status.querySelector(".text-ink-muted svg")).not.toBeNull();
  });

  it("offers no tabs or tab groups as the category", async () => {
    renderForm();

    await userEvent.click(screen.getByRole("button", { name: "Category" }));

    expect(screen.getByRole("option", { name: "Takeout" })).toBeInTheDocument();
    for (const name of ["Sarah", "Jan", "Tabs"]) expect(screen.queryByRole("option", { name })).toBeNull();
  });

  it("saves with Enter", async () => {
    const { onSave } = renderForm();

    await userEvent.type(screen.getByLabelText("Amount"), "15");
    await userEvent.type(screen.getByLabelText("What it was"), "Sushi Palace");
    await pickCategory("Takeout");
    await userEvent.type(screen.getByLabelText("What it was"), "{Enter}");

    expect(onSave).toHaveBeenCalledWith({
      date: todayIso(),
      payee: "Sushi Palace",
      amount_cents: 1500,
      category: 1,
      notes: "",
    });
  });

  it("says which field is missing and saves nothing", async () => {
    const { onSave } = renderForm();

    await userEvent.click(screen.getByRole("button", { name: /^Add/ }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Enter an amount above zero.")).toBeInTheDocument();
    expect(screen.getByText("Pick a category.")).toBeInTheDocument();
    expect(screen.getByText("Say what it was for.")).toBeInTheDocument();
  });

  it("shows the server's field errors by their field and keeps what was typed", async () => {
    const error = Object.assign(new Error("bad"), { data: { category: ["A covered entry's category can't be a tab."] } });
    const { onSave } = renderForm();
    onSave.mockRejectedValue(error);

    await userEvent.type(screen.getByLabelText("Amount"), "15");
    await userEvent.type(screen.getByLabelText("What it was"), "Sushi Palace");
    await pickCategory("Takeout");
    await userEvent.click(screen.getByRole("button", { name: /^Add/ }));

    expect(await screen.findByText("A covered entry's category can't be a tab.")).toBeInTheDocument();
    expect(screen.getByLabelText("Amount")).toHaveValue("15");
  });

  it("cancels with Escape", async () => {
    const { onCancel } = renderForm();

    await userEvent.type(screen.getByLabelText("Amount"), "{Escape}");

    expect(onCancel).toHaveBeenCalled();
  });

  describe("editing", () => {
    const entry = {
      id: 7,
      date: "2026-11-11",
      payee: "Sushi Palace",
      amount_cents: 1500,
      notes: "",
      covered_category: { id: 1, label: "Takeout" },
    };

    it("is filled in and previews from the balance without the row", () => {
      renderForm({ entry, balanceCents: 1000 });

      expect(screen.getByLabelText("Amount")).toHaveValue("15.00");
      expect(screen.getByLabelText("What it was")).toHaveValue("Sushi Palace");
      expect(screen.getByLabelText("Date")).toHaveValue("2026-11-11");
      expect(screen.getByRole("status")).toHaveTextContent(`You'll owe Sarah ${formatMoney(500)}`);
      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    });

    it("keeps on second thought", async () => {
      const { onDelete } = renderForm({ entry });

      await userEvent.click(screen.getByRole("button", { name: "Delete" }));
      expect(screen.getByText(/Delete this and its Takeout expense\?/)).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Keep" }));

      expect(onDelete).not.toHaveBeenCalled();
      expect(screen.queryByText(/Delete this/)).toBeNull();
      expect(screen.getByLabelText("Amount")).toBeInTheDocument();
    });

    it("deletes after confirming", async () => {
      const { onDelete } = renderForm({ entry });

      await userEvent.click(screen.getByRole("button", { name: "Delete" }));
      await userEvent.click(screen.getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(onDelete).toHaveBeenCalled());
    });
  });
});
