import { useState } from "react";
import { importPortfolio, previewPortfolio } from "../api/accounts";
import { formatMoney, formatSignedMoney } from "../lib/money";
import { formatDayMonth } from "../lib/yearlyBudgets";
import { Button } from "./ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/Dialog";
import { Input } from "./ui/Input";
import { Label } from "./ui/Label";
import { useToast } from "./ui/Toast";

function priceDates({ oldest_price_date: oldest, newest_price_date: newest }) {
  if (!newest) return null;
  return oldest === newest ? `Prices from ${formatDayMonth(newest)}` : `Prices from ${formatDayMonth(oldest)} to ${formatDayMonth(newest)}`;
}

function Row({ label, note, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="flex flex-col">
        {label}
        {note && <span className="text-xs text-ink-muted">{note}</span>}
      </span>
      <span className="num">{children}</span>
    </div>
  );
}

// The server reads the file and keeps nothing, so the preview here is all
// that's left of it: unticking only changes the sum, without a round trip.
// See the portfolio-value-import spec.
export function PortfolioImportDialog({ account, open, onOpenChange, onSaved }) {
  const [preview, setPreview] = useState(null);
  const [excluded, setExcluded] = useState(new Set());
  const [error, setError] = useState(null);
  const [reading, setReading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const included = preview?.cash.filter((c) => !excluded.has(c.id)) ?? [];
  const value = (preview?.holdings_cents ?? 0) + included.reduce((sum, c) => sum + c.balance_cents, 0);

  async function handleFile(event) {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    setReading(true);
    setError(null);
    setPreview(null);
    try {
      const data = await previewPortfolio(account.id, file);
      setPreview(data);
      setExcluded(new Set(data.cash.filter((c) => !c.included).map((c) => c.id)));
    } catch (e) {
      setError(e.message);
    } finally {
      setReading(false);
    }
  }

  function toggle(id) {
    setExcluded((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setSubmitting(true);
    try {
      await importPortfolio(account.id, {
        date: preview.value_date,
        value_cents: value,
        excluded_cash_ids: [...excluded],
      });
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
          <DialogTitle>Import portfolio · {account.name}</DialogTitle>
          <DialogDescription>Save your portfolio as XML in Portfolio Performance, then choose the file.</DialogDescription>
        </DialogHeader>
        <div className="-mx-1 flex max-h-[calc(100dvh-13rem)] flex-col gap-4 overflow-y-auto px-1">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="portfolio-file">File</Label>
            <Input id="portfolio-file" type="file" accept=".xml,text/xml" onChange={handleFile} disabled={reading} />
            {reading && <span className="text-sm text-ink-secondary">Reading the file…</span>}
            {error && (
              <p role="alert" className="text-sm text-critical">
                {error}
              </p>
            )}
          </div>

          {preview && (
            <>
              <div className="flex flex-col gap-2 text-sm text-ink-primary">
                <Row label={`Holdings (${preview.holdings_count})`} note={priceDates(preview)}>
                  {formatMoney(preview.holdings_cents)}
                </Row>
                {preview.cash.map((cash) => (
                  <label key={cash.id} className="flex cursor-pointer items-baseline justify-between gap-4">
                    <span className="flex items-baseline gap-2">
                      <input type="checkbox" checked={!excluded.has(cash.id)} onChange={() => toggle(cash.id)} />
                      {cash.name}
                    </span>
                    <span className={excluded.has(cash.id) ? "num text-ink-muted line-through" : "num"}>
                      {formatMoney(cash.balance_cents)}
                    </span>
                  </label>
                ))}
              </div>
              <div className="flex flex-col gap-1 border-t border-border pt-3 text-sm text-ink-secondary">
                <div className="flex items-baseline justify-between gap-4 font-medium text-ink-primary">
                  <span>Value on {formatDayMonth(preview.value_date)}</span>
                  <span className="num">{formatMoney(value)}</span>
                </div>
                <Row label="Current balance">{formatMoney(preview.current_balance_cents)}</Row>
                {!preview.has_later_value && (
                  <Row label="Adjustment">{formatSignedMoney(value - preview.current_balance_cents)}</Row>
                )}
              </div>
              {preview.has_later_value && (
                <p className="text-sm text-warning">
                  This account has a value set after {formatDayMonth(preview.value_date)}, so its balance stays as it is.
                </p>
              )}
              <p className="text-xs text-ink-muted">
                Reconciled doesn't keep the file. The export holds your trades unencrypted, so delete it once you're done.
              </p>
            </>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={!preview || submitting}>
            Save value
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
