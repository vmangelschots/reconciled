import { useState } from "react";
import { getSpendingCell } from "../api/reports";
import { updateTransaction } from "../api/transactions";
import { useToast } from "../components/ui/Toast";
import { useReport } from "./useReport";

/**
 * Loads the rows behind one figure, and changes a row's category. Pass the
 * result to SpendingRows. `selection`: { category, direct, income, month }.
 */
export function useSpendingCell(selection, onChanged) {
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const [savingId, setSavingId] = useState(null);
  const cell = useReport(() => getSpendingCell(selection.month, selection.category, selection), version);

  async function pick(row, category) {
    setSavingId(row.id);
    try {
      await updateTransaction(row.id, { category });
      setVersion((v) => v + 1);
      onChanged();
    } catch {
      toast.error(`Couldn't change the category of ${row.payee}.`);
    } finally {
      setSavingId(null);
    }
  }

  return { cell, savingId, pick };
}
