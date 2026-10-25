import { useState } from "react";
import { setAccountValue } from "../api/accounts";
import { formatMoney, formatSignedMoney } from "../lib/money";
import { Button } from "./ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/Dialog";
import { Input } from "./ui/Input";
import { Label } from "./ui/Label";
import { useToast } from "./ui/Toast";

function localToday() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Sets an investment, property or loan account's value on a date. A loan
// is entered as what is still owed and sent as a negative value. The
// difference is only known here for today; for another date the server
// works it out from the balance on that date. See the value-adjustments
// spec.
export function SetValueDialog({ account, open, onOpenChange, onSaved }) {
  const isLoan = account.account_type === "loan";
  const sign = isLoan ? -1 : 1;
  const today = localToday();
  const [date, setDate] = useState(today);
  const [value, setValue] = useState(((sign * account.current_balance_cents) / 100).toString());
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const entered = Math.round(parseFloat(value || "0") * 100);
  const valueCents = sign * entered;
  const difference = valueCents - account.current_balance_cents;

  async function handleSubmit(event) {
    event.preventDefault();
    if (isLoan && entered < 0) {
      toast.error("Enter what you still owe as a positive amount.");
      return;
    }
    setSubmitting(true);
    try {
      await setAccountValue(account.id, { date, value_cents: valueCents });
      toast.success("Value set.");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e.data ? Object.values(e.data).flat().join(" ") : e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set value · {account.name}</DialogTitle>
          <DialogDescription>
            Current balance <span className="num font-medium text-ink-primary">{formatMoney(account.current_balance_cents)}</span>
          </DialogDescription>
        </DialogHeader>
        <form id="set-value" onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="set-value-date">Date</Label>
            <Input id="set-value-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="set-value-amount">{isLoan ? "Still owed" : "Value"}</Label>
            <Input
              id="set-value-amount"
              type="number"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
            />
            <span className="text-sm text-ink-secondary">
              {date === today ? (
                <>
                  Adjustment: <span className="num">{formatSignedMoney(difference)}</span>
                </>
              ) : (
                "Difference worked out on save"
              )}
            </span>
          </div>
          {isLoan && (
            <p className="text-xs text-ink-muted">Book the monthly payment as an expense; update what's owed here.</p>
          )}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="set-value" disabled={submitting}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
