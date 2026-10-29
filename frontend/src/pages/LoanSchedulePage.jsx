import { AlertTriangle, Check, ChevronLeft, Clock, Landmark, Scale } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAccounts } from "../accounts/AccountsContext";
import { getAccount } from "../api/accounts";
import { listCategories } from "../api/categories";
import {
  addCorrection,
  getLoan,
  linkPayment,
  listPaymentCandidates,
  previewCorrection,
  previewCorrectionRemoval,
  previewLoan,
  removeCorrection,
  removeLoan,
  saveLoan,
  unlinkPayment,
} from "../api/loans";
import { CategoryCombobox } from "../components/CategoryCombobox";
import { Button } from "../components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/Dialog";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { Panel } from "../components/ui/Panel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/Select";
import { useToast } from "../components/ui/Toast";
import { cn } from "../lib/cn";
import { formatShortDate } from "../lib/dates";
import { currentIndex, scheduleWindow, termLabel } from "../lib/loans";
import { formatMoney, formatMoneyWhole } from "../lib/money";

const monthYear = new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric", timeZone: "UTC" });

function formatMonthYear(isoDate) {
  return monthYear.format(new Date(`${isoDate}T00:00:00Z`));
}

const fullDate = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function formatFullDate(isoDate) {
  return fullDate.format(new Date(`${isoDate}T00:00:00Z`));
}

// Today as "YYYY-MM-DD" in the browser's time zone, for date inputs.
function todayIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0, 10);
}

// The earliest day a correction can be dated: one month before the setup
// day, as a bank's figure often predates the latest installment.
function monthBefore(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 2, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

// "693.03" -> 69303, or null when it isn't an amount.
function toCents(value) {
  const amount = parseFloat(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// "Saving reposts 2 installments; 2 payments will no longer match." - the
// warning colour only when a payment stops matching.
function RepostLine({ repost, verb = "Saving reposts" }) {
  return (
    <p className={cn(repost.no_longer_matching > 0 ? "text-warning" : "text-ink-muted")}>
      {verb} {plural(repost.installments, "installment")}
      {repost.no_longer_matching > 0 && `; ${plural(repost.no_longer_matching, "payment")} will no longer match`}.
    </p>
  );
}

// The muted panel under a form that shows what saving would give.
function CheckPanel({ children, ...props }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-surface-2 px-4 py-3 text-sm" {...props}>
      {children}
    </div>
  );
}

function FoundLine({ found, payerName, paymentCents, children }) {
  if (found.length > 0) {
    return (
      <p className="flex items-start gap-1.5 text-ink-secondary">
        <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        Found in {payerName}: {found.map((p) => formatShortDate(p.date)).join(", ")}
      </p>
    );
  }
  return (
    <p className="flex items-start gap-1.5 text-warning">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        No payment of {formatMoney(paymentCents)} in {payerName} in the last 90 days.{children}
      </span>
    </p>
  );
}

function formatRate(rate) {
  return `${Number(rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%`;
}

// A loan's balance is negative; what is owed is the same amount, positive.
// 0 - cents keeps an empty balance from reading "-€0".
function owed(cents) {
  return 0 - cents;
}

function errorMessage(e) {
  return e.data ? Object.values(e.data).flat().join(" ") : e.message;
}

// "€200,000 at 3.00% over 25 years · €944.22 a month from Crelan · ends Nov 2049",
// with "since Dec 2026" when a correction changed the payment.
function termsLine(loan) {
  const over = loan.term_months % 12 === 0 ? `${loan.term_months / 12} years` : `${loan.term_months} months`;
  const since = loan.payment_since ? ` since ${formatMonthYear(loan.payment_since)}` : "";
  return [
    `${formatMoneyWhole(loan.principal_cents)} at ${formatRate(loan.annual_rate)} over ${over}`,
    !loan.paid_off_on && loan.payment_cents != null && `${formatMoney(loan.payment_cents)} a month from ${loan.paid_from_name}${since}`,
    !loan.paid_off_on && loan.end_date && `ends ${formatMonthYear(loan.end_date)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

// The payment before the latest correction, for the header's hover text.
function latestBefore(loan) {
  const corrections = loan.corrections ?? [];
  return corrections[corrections.length - 1]?.payment_before_cents ?? null;
}

// The form's fields as API terms, or null while any is missing.
function toTerms(fields) {
  const principal = parseFloat(fields.principal);
  const rate = parseFloat(fields.rate);
  const term = parseInt(fields.term, 10);
  if (!(principal > 0) || !(rate >= 0) || !(term > 0) || !fields.first || !fields.paidFrom) return null;
  return {
    principal_cents: Math.round(principal * 100),
    annual_rate: fields.rate,
    term_months: term,
    first_payment_date: fields.first,
    paid_from: Number(fields.paidFrom),
    payment_category: fields.category,
    // What the bank says is owed today; a new setup only.
    ...(fields.bank !== undefined &&
      toCents(fields.bank) !== null && {
        bank_balance_cents: toCents(fields.bank),
        bank_balance_date: fields.bankDate || todayIso(),
      }),
  };
}

// What the entered terms give, before anything is saved - so a cent's
// difference with the bank shows here, not as a missed payment weeks later.
// For a new setup, `bank` is what the bank says is owed on `bankDate`
// (undefined until the user opens it); the payment checked is then the
// one it gives.
function TermsCheck({ preview, account, payerName, bank, onBank, bankDate, onBankDate }) {
  if (!preview) return null;
  if (preview.error) return <p className="text-sm text-ink-muted">{preview.error}</p>;
  const found = preview.found_payments;
  const corrected = preview.schedule_payment_cents != null && preview.schedule_payment_cents !== preview.payment_cents;
  return (
    <CheckPanel data-testid="terms-check">
      <p className="text-ink-primary">
        <span className="num font-semibold">{formatMoney(preview.payment_cents)}</span> a month
        {corrected && <span className="text-ink-muted"> · {formatMoney(preview.schedule_payment_cents)} per the terms</span>}
        {preview.last_payment_cents !== preview.payment_cents && (
          <span className="text-ink-muted"> · last one {formatMoney(preview.last_payment_cents)}</span>
        )}
      </p>
      {preview.next_installment && (
        <p className="text-ink-secondary">
          Next: installment {preview.next_installment.number} on {formatShortDate(preview.next_installment.date)}
        </p>
      )}
      <p className="text-ink-secondary">
        Owed today per schedule <span className="num">{formatMoney(owed(preview.schedule_balance_today_cents))}</span>
        {" · "}
        {account.name} shows <span className="num">{formatMoney(owed(preview.current_balance_cents))}</span>
        {onBank && bank === undefined && (
          <>
            {" · "}
            <button type="button" onClick={() => onBank("")} className="text-ink-secondary underline-offset-2 hover:underline">
              The bank says something else
            </button>
          </>
        )}
      </p>
      {onBank && bank !== undefined && (
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="loan-bank">Owed per the bank</Label>
          <div className="relative">
            <Input
              id="loan-bank"
              type="number"
              step="0.01"
              min="0"
              value={bank}
              onChange={(e) => onBank(e.target.value)}
              className="h-8 w-36 pr-7 num"
              autoFocus
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-ink-muted">€</span>
          </div>
          <span className="text-ink-secondary">on</span>
          <Input
            aria-label="Day of the bank's balance"
            type="date"
            value={bankDate}
            min={monthBefore(todayIso())}
            max={todayIso()}
            onChange={(e) => onBankDate(e.target.value)}
            className="h-8 w-40"
          />
          <button type="button" onClick={() => onBank(undefined)} className="text-xs text-ink-muted hover:text-ink-secondary">
            Use the schedule's
          </button>
        </div>
      )}
      <FoundLine found={found} payerName={payerName} paymentCents={preview.payment_cents}>
        {" "}Check the terms against your bank's repayment table
        {onBank && bank === undefined ? (
          <>
            , or, if the bank changed the payment,{" "}
            <button type="button" onClick={() => onBank("")} className="underline underline-offset-2">
              enter what it says you owe
            </button>
            .
          </>
        ) : (
          "."
        )}
      </FoundLine>
      {preview.repost && <RepostLine repost={preview.repost} />}
    </CheckPanel>
  );
}

function RemoveDialog({ open, onOpenChange, onConfirm }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove the schedule?</DialogTitle>
          <DialogDescription>
            The posted adjustments stay as ordinary value adjustments, and future payments no longer update the loan.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * What the bank says is owed on a date, with a live check of the payment
 * it gives from the next installment on. The payment can be replaced with
 * what the bank actually takes. See the loan-schedules spec's "Correct a
 * loan's balance" and "Check a correction before saving".
 */
function CorrectionForm({ loan, payerName, initialPayment, onSaved, onCancel }) {
  const toast = useToast();
  const [on, setOn] = useState(todayIso);
  const [amount, setAmount] = useState("");
  // The payment the user chose, in euros; null means the computed one.
  const [payment, setPayment] = useState(initialPayment != null ? (initialPayment / 100).toFixed(2) : null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const latest = useRef(0);
  const balanceCents = toCents(amount);
  const correction =
    on && balanceCents !== null
      ? { date: on, balance_cents: balanceCents, payment_cents: payment === null ? null : toCents(payment) }
      : null;
  const key = JSON.stringify(correction);

  useEffect(() => {
    if (!correction) {
      setPreview(null);
      return undefined;
    }
    const request = ++latest.current;
    const timer = setTimeout(() => {
      previewCorrection(loan.account, correction)
        .then((result) => request === latest.current && setPreview(result))
        .catch((e) => request === latest.current && setPreview({ error: errorMessage(e) }));
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, loan.account]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!correction) {
      toast.error("Enter what you owe.");
      return;
    }
    setSaving(true);
    try {
      onSaved(await addCorrection(loan.account, correction));
      toast.success("Balance corrected.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-ink-secondary">
        Enter what the bank says you owe. From the next installment, the schedule restarts from that amount at{" "}
        {formatRate(loan.annual_rate)}
        {loan.end_date && `, still ending ${formatMonthYear(loan.end_date)}`}.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="correction-date">On</Label>
          <Input
            id="correction-date"
            type="date"
            value={on}
            min={monthBefore(loan.setup_date)}
            max={todayIso()}
            onChange={(e) => setOn(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="correction-owed">Owed per the bank</Label>
          <div className="relative">
            <Input
              id="correction-owed"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="pr-8"
              required
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-ink-muted">€</span>
          </div>
        </div>
        <p className="text-xs text-ink-muted sm:col-span-2">
          Date it on the day of that balance. If the bank hasn't deducted the latest installment yet, pick a day before it.
        </p>
      </div>

      <CorrectionCheck preview={preview} payerName={payerName} payment={payment} onPayment={setPayment} />

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={saving}>
          Save correction
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function CorrectionCheck({ preview, payerName, payment, onPayment }) {
  if (!preview) return null;
  if (preview.error) return <p className="text-sm text-ink-muted">{preview.error}</p>;
  if (preview.paid_off) {
    return (
      <CheckPanel data-testid="correction-check">
        <p className="font-semibold text-ink-primary">Paid off. No more installments.</p>
        {preview.repost.installments > 0 && <RepostLine repost={preview.repost} />}
      </CheckPanel>
    );
  }
  const difference = preview.difference_cents;
  const near = preview.near_payment;
  return (
    <CheckPanel data-testid="correction-check">
      <p className="flex flex-wrap items-center gap-x-1 text-ink-primary">
        {payment === null ? (
          <span className="num font-semibold">{formatMoney(preview.payment_cents)}</span>
        ) : (
          <Input
            aria-label="Monthly payment"
            type="number"
            step="0.01"
            min="0"
            value={payment}
            onChange={(e) => onPayment(e.target.value)}
            className="h-8 w-28 num"
          />
        )}
        <span>
          a month from {formatShortDate(preview.first_installment.date)}
          {preview.previous_payment_cents != null && preview.previous_payment_cents !== preview.payment_cents && (
            <span className="text-ink-muted"> · was {formatMoney(preview.previous_payment_cents)}</span>
          )}
        </span>
        {payment === null ? (
          <button
            type="button"
            onClick={() => onPayment((preview.payment_cents / 100).toFixed(2))}
            className="ml-auto text-xs text-ink-muted underline-offset-2 hover:text-ink-secondary hover:underline"
          >
            Pay a different amount?
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onPayment(null)}
            className="ml-auto text-xs text-ink-muted underline-offset-2 hover:text-ink-secondary hover:underline"
          >
            Use the computed payment
          </button>
        )}
      </p>
      <p className="text-ink-secondary">
        {plural(preview.installments_left, "installment")} left, ends {formatMonthYear(preview.end_date)}
        {preview.last_payment_cents !== preview.payment_cents && (
          <span className="text-ink-muted"> · last one {formatMoney(preview.last_payment_cents)}</span>
        )}
      </p>
      <p className="text-ink-secondary">
        {difference === 0
          ? "The same as the schedule"
          : `${formatMoney(Math.abs(difference))} ${difference < 0 ? "less" : "more"} than the schedule`}
      </p>
      <FoundLine found={preview.found_payments} payerName={payerName} paymentCents={preview.payment_cents}>
        {near && (
          <>
            {" "}
            {payerName} paid {formatMoney(-near.amount_cents)} on {formatShortDate(near.date)}.{" "}
            <button
              type="button"
              onClick={() => onPayment((-near.amount_cents / 100).toFixed(2))}
              className="font-medium underline underline-offset-2"
            >
              Use {formatMoney(-near.amount_cents)}
            </button>
          </>
        )}
      </FoundLine>
      {preview.repost.installments > 0 && <RepostLine repost={preview.repost} />}
    </CheckPanel>
  );
}

// Asks before removing a correction, saying what the payment goes back to
// and what removing reposts.
function RemoveCorrectionDialog({ loan, correction, onOpenChange, onRemoved }) {
  const toast = useToast();
  const [effect, setEffect] = useState(null);

  useEffect(() => {
    if (!correction) return;
    setEffect(null);
    previewCorrectionRemoval(loan.account, correction.id)
      .then(setEffect)
      .catch((e) => toast.error(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [correction?.id, loan.account]);

  async function handleRemove() {
    try {
      const updated = await removeCorrection(loan.account, correction.id);
      onOpenChange(false);
      toast.success("Correction removed.");
      onRemoved(updated);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <Dialog open={correction != null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove this correction?</DialogTitle>
          <DialogDescription>
            {effect === null
              ? "Checking what changes…"
              : [
                  effect.first_installment &&
                    `The schedule goes back to ${formatMoney(effect.payment_cents)} a month from ${formatShortDate(effect.first_installment.date)}.`,
                  effect.repost.installments > 0 &&
                    `${plural(effect.repost.installments, "installment")} will be reposted` +
                      (effect.repost.no_longer_matching > 0
                        ? `; ${plural(effect.repost.no_longer_matching, "payment")} will no longer match.`
                        : "."),
                ]
                  .filter(Boolean)
                  .join(" ")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={handleRemove}>
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The loan's terms, with a live check of what they give. Used to set up a
 * schedule and to edit one (with Remove). See the loan-schedules spec's
 * "Set up a loan" and "Check the terms before saving".
 */
function LoanForm({ account, loan, categories, payers, onSaved, onCancel, onRemoved }) {
  const toast = useToast();
  const everyday = payers.filter((a) => a.tier === "everyday");
  const [fields, setFields] = useState(() =>
    loan
      ? {
          principal: (loan.principal_cents / 100).toString(),
          rate: Number(loan.annual_rate).toString(),
          term: loan.term_months.toString(),
          first: loan.first_payment_date,
          paidFrom: String(loan.paid_from),
          category: loan.payment_category,
        }
      : {
          principal: "",
          rate: "",
          term: "",
          first: "",
          paidFrom: everyday.length === 1 ? String(everyday[0].id) : "",
          category: null,
        },
  );
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const latest = useRef(0);
  const terms = toTerms(fields);
  const termsKey = JSON.stringify(terms);
  const set = (name) => (e) => setFields((f) => ({ ...f, [name]: e.target.value }));

  useEffect(() => {
    if (!terms) {
      setPreview(null);
      return undefined;
    }
    const request = ++latest.current;
    const timer = setTimeout(() => {
      previewLoan(account.id, terms)
        .then((result) => request === latest.current && setPreview(result))
        .catch((e) => request === latest.current && setPreview({ error: errorMessage(e) }));
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termsKey, account.id]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!terms) {
      toast.error("Fill in the amount, rate, term, first installment and paying account.");
      return;
    }
    setSaving(true);
    try {
      const saved = await saveLoan(account.id, terms);
      toast.success(loan ? "Schedule updated." : "Schedule set up.");
      onSaved(saved);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setConfirmingRemove(false);
    try {
      await removeLoan(account.id);
      toast.success("Schedule removed.");
      onRemoved();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const payerName = payers.find((a) => String(a.id) === fields.paidFrom)?.name ?? "the paying account";
  const term = parseInt(fields.term, 10);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="loan-principal">Amount borrowed</Label>
          <Input id="loan-principal" type="number" step="0.01" min="0" value={fields.principal} onChange={set("principal")} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="loan-rate">Annual rate</Label>
          <div className="relative">
            <Input id="loan-rate" type="number" step="0.0001" min="0" value={fields.rate} onChange={set("rate")} className="pr-8" required />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-ink-muted">%</span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="loan-term">Term in months</Label>
          <Input id="loan-term" type="number" step="1" min="1" max="600" value={fields.term} onChange={set("term")} required />
          {term > 0 && <span className="text-xs text-ink-muted">{termLabel(term)}</span>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="loan-first">First installment (from the repayment table)</Label>
          <Input id="loan-first" type="date" value={fields.first} onChange={set("first")} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label id="loan-paid-from-label">Paid from</Label>
          <Select value={fields.paidFrom} onValueChange={(value) => setFields((f) => ({ ...f, paidFrom: value }))}>
            <SelectTrigger aria-labelledby="loan-paid-from-label">
              <SelectValue placeholder="Choose an account…" />
            </SelectTrigger>
            <SelectContent>
              {payers.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Payment category</Label>
          <CategoryCombobox
            categories={categories.filter((c) => !c.is_tab)}
            value={fields.category}
            onSelect={(id) => setFields((f) => ({ ...f, category: id }))}
            clearLabel="No category"
            placeholder="Optional"
            aria-label="Payment category"
          />
        </div>
      </div>

      <TermsCheck
        preview={preview}
        account={account}
        payerName={payerName}
        bank={fields.bank}
        onBank={loan ? undefined : (value) => setFields((f) => ({ ...f, bank: value, bankDate: f.bankDate || todayIso() }))}
        bankDate={fields.bankDate}
        onBankDate={(value) => setFields((f) => ({ ...f, bankDate: value }))}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={saving}>
          {loan ? "Save" : "Set up schedule"}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        {loan && (
          <Button type="button" variant="ghost" className="ml-auto" onClick={() => setConfirmingRemove(true)}>
            Remove schedule
          </Button>
        )}
      </div>
      {loan && <RemoveDialog open={confirmingRemove} onOpenChange={setConfirmingRemove} onConfirm={handleRemove} />}
    </form>
  );
}

// "Link payment": the outflows that could be this installment's payment,
// closest amount first.
function LinkPicker({ accountId, installment, onLinked, onCancel }) {
  const toast = useToast();
  const [candidates, setCandidates] = useState(null);

  useEffect(() => {
    listPaymentCandidates(accountId, installment.number)
      .then(setCandidates)
      .catch((e) => toast.error(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, installment.number]);

  async function choose(candidate) {
    try {
      onLinked(await linkPayment(accountId, installment.number, candidate.id));
      toast.success(`Installment ${installment.number} posted.`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <div className="col-span-full flex flex-col gap-1 rounded-lg bg-surface px-3 py-2 ring-1 ring-border">
      <p className="text-xs text-ink-muted">Which payment was installment {installment.number}?</p>
      {candidates === null && <p className="text-sm text-ink-muted">Loading...</p>}
      {candidates?.length === 0 && <p className="text-sm text-ink-secondary">No outflows within 15 days of it.</p>}
      {candidates?.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => choose(c)}
          className="flex items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2"
        >
          <span className="w-14 shrink-0 text-xs num text-ink-muted">{formatShortDate(c.date)}</span>
          <span className="min-w-0 flex-1 truncate text-ink-primary">
            {c.payee} <span className="text-ink-muted">· {c.account_name}</span>
          </span>
          <span className="num text-ink-primary">{formatMoney(c.amount_cents)}</span>
        </button>
      ))}
      <Button type="button" variant="ghost" size="sm" className="self-start" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

function InstallmentState({ installment, onLink, onUnlink }) {
  if (installment.state === "posted") {
    return (
      <span className="flex flex-wrap items-center gap-1.5 text-ink-secondary">
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <Check className="h-4 w-4" aria-hidden="true" />
          Posted {formatShortDate(installment.payment.date)}
        </span>
        {installment.payment.linked_by_hand && (
          <Button type="button" variant="ghost" size="sm" className="h-6 px-2" onClick={onUnlink}>
            Unlink
          </Button>
        )}
      </span>
    );
  }
  if (installment.state === "due" || installment.state === "missed") {
    const missed = installment.state === "missed";
    const Icon = missed ? AlertTriangle : Clock;
    return (
      <span className={cn("flex flex-wrap items-center gap-1.5", missed ? "text-warning" : "text-ink-muted")}>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <Icon className="h-4 w-4" aria-hidden="true" />
          {missed ? "Missed" : "Due"}
        </span>
        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-ink-secondary" onClick={onLink}>
          Link payment
        </Button>
      </span>
    );
  }
  return null;
}

function SetupDivider({ date }) {
  return (
    <li className="flex items-center gap-2 py-1 text-xs text-ink-muted" role="separator">
      <span className="h-px flex-1 bg-border" />
      Set up {formatShortDate(date)}
      <span className="h-px flex-1 bg-border" />
    </li>
  );
}

// A balance correction as a row of the schedule, at its date: the amount
// owed in the balance column and the payment before and after it. See the
// loan-schedules spec's "Schedule table".
function CorrectionRow({ correction, onRemove }) {
  const after = correction.payment_after_cents;
  const before = correction.payment_before_cents;
  const change =
    after === null ? "Paid off" : before !== null && before !== after ? (
      <>
        <span className="num">{formatMoney(before)}</span> →{" "}
        <span className="num font-medium text-ink-primary">{formatMoney(after)}</span> a month
      </>
    ) : (
      <>
        <span className="num font-medium text-ink-primary">{formatMoney(after)}</span> a month
      </>
    );
  return (
    <li
      data-correction={correction.id}
      className={cn(ROW_GRID, "-mx-5 border-t border-border bg-accent/5 px-5 py-2.5")}
    >
      <span className="flex items-center gap-1.5 whitespace-nowrap text-ink-primary [grid-area:date]">
        <Scale className="h-4 w-4 text-accent" aria-hidden="true" />
        <span className="num">{formatShortDate(correction.date)}</span>
        <span className="text-ink-muted sm:hidden">· Corrected</span>
      </span>
      <span className="flex flex-col items-end text-xs text-ink-muted [grid-area:split] sm:items-start sm:text-sm sm:[grid-area:1/2/2/4]">
        <span className="hidden text-xs sm:inline">Balance corrected</span>
        <span className="whitespace-nowrap">{change}</span>
      </span>
      <span className="num text-right font-medium text-ink-primary [grid-area:balance]">
        {formatMoney(correction.balance_cents)}
      </span>
      <span className="[grid-area:state]">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-ink-muted hover:text-critical"
          onClick={() => onRemove(correction)}
        >
          Remove
        </Button>
      </span>
    </li>
  );
}

// Shown when the latest installments were missed: maybe the bank changed
// the payment. See the loan-schedules spec's "Suggest a correction when
// payments are missed".
function SuggestionBanner({ suggestion, payerName, onCorrect }) {
  const count = suggestion.missed_count;
  return (
    <div className="mx-5 mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-warning/10 px-4 py-3 text-sm" data-testid="suggestion">
      <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-ink-primary">
        The last {count} installments were missed.{" "}
        {suggestion.amount_cents != null
          ? `${payerName} paid ${formatMoney(suggestion.amount_cents)} around each date. Did the bank change the payment?`
          : "If you repaid extra and the bank changed the payment, correct the balance."}
      </p>
      <Button type="button" variant="outline" size="sm" onClick={() => onCorrect(suggestion.amount_cents)}>
        Correct balance
      </Button>
    </div>
  );
}

const ROW_GRID =
  "grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 [grid-template-areas:'date_balance'_'state_split'] " +
  "sm:grid-cols-[9rem_1fr_1fr_1fr_12rem] sm:items-center sm:[grid-template-areas:'date_interest_principal_balance_state']";

/**
 * One row per installment: two lines on a phone, columns from `sm` up.
 * Opens on what matters now; earlier and later installments are behind
 * "Show earlier" and "Show all". See the loan-schedules spec's "Schedule
 * table" and "The schedule opens on what matters now".
 */
function ScheduleTable({ loan, focus, onChange, onCorrect }) {
  const toast = useToast();
  const [showEarlier, setShowEarlier] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [linking, setLinking] = useState(null);
  const [removing, setRemoving] = useState(null);
  const focusRef = useRef(null);
  const installments = loan.installments;
  const corrections = loan.corrections ?? [];
  const latestCorrection = corrections[corrections.length - 1];
  const range = scheduleWindow(installments, focus, latestCorrection?.date);
  const start = showEarlier ? 0 : range.start;
  const end = showAll ? installments.length : range.end;
  const shown = installments.slice(start, end);
  const current = installments[currentIndex(installments)];
  const last = installments[installments.length - 1];
  const firstAfterSetup = installments.find((i) => i.state !== "before_setup");
  const hasBeforeSetup = installments[0].state === "before_setup";

  useEffect(() => {
    focusRef.current?.scrollIntoView?.({ block: "center" });
  }, [focus]);

  async function handleUnlink(installment) {
    try {
      onChange(await unlinkPayment(loan.account, installment.number));
      toast.success(`Installment ${installment.number} unlinked.`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  // The corrections whose row goes right above `installment`: dated since
  // the installment before it.
  function correctionsBefore(index) {
    const previous = installments[index - 1];
    return corrections.filter(
      (c) => c.date < installments[index].date && (previous === undefined || c.date >= previous.date),
    );
  }
  const correctionsAfterLast = last ? corrections.filter((c) => c.date >= last.date) : corrections;
  const correctionRow = (c) => <CorrectionRow key={`correction-${c.id}`} correction={c} onRemove={setRemoving} />;

  return (
    <Panel title="Repayment schedule" flush>
      {loan.suggestion && <SuggestionBanner suggestion={loan.suggestion} payerName={loan.paid_from_name} onCorrect={onCorrect} />}
      <RemoveCorrectionDialog
        loan={loan}
        correction={removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        onRemoved={onChange}
      />
      <ul className="flex flex-col px-5 pb-2 text-sm">
        <li className={cn(ROW_GRID, "hidden pb-2 text-xs font-medium text-ink-muted sm:grid")} aria-hidden="true">
          <span className="[grid-area:date]">Date</span>
          <span className="text-right [grid-area:interest]">Interest</span>
          <span className="text-right [grid-area:principal]">Principal</span>
          <span className="text-right [grid-area:balance]">Balance after</span>
          <span className="[grid-area:state]">State</span>
        </li>
        {start > 0 && (
          <li>
            <button
              type="button"
              onClick={() => setShowEarlier(true)}
              className="w-full py-2 text-xs text-ink-muted hover:text-ink-secondary"
            >
              Show earlier ({start} installment{start === 1 ? "" : "s"})
            </button>
          </li>
        )}
        {shown.map((installment, offset) => {
          const index = start + offset;
          const divider = hasBeforeSetup && installment === firstAfterSetup;
          const isCurrent = installment === current && installment.state !== "posted";
          const muted = installment.state === "before_setup" || installment.state === "covered";
          const restarted =
            installment.correction_id != null && installment.correction_id !== installments[index - 1]?.correction_id;
          return [
            divider && <SetupDivider key="setup" date={loan.setup_date} />,
            ...correctionsBefore(index).map(correctionRow),
            <li
              key={installment.number}
              ref={installment.number === focus ? focusRef : undefined}
              data-installment={installment.number}
              className={cn(
                ROW_GRID,
                "-mx-5 border-t border-border px-5 py-2.5",
                isCurrent && "bg-surface-2 shadow-[inset_2px_0_0_var(--accent)]",
                muted && "text-ink-muted",
              )}
            >
              <span className="flex flex-col [grid-area:date]">
                <span className={cn("num whitespace-nowrap", !muted && "text-ink-primary")}>
                  {formatShortDate(installment.date)}
                  <span className="hidden text-ink-muted sm:inline"> · {installment.number}</span>
                </span>
                {installment === last ? (
                  <span className="text-xs text-ink-muted">last payment {formatMoney(installment.payment_cents)}</span>
                ) : (
                  restarted && (
                    <span className="whitespace-nowrap text-xs text-ink-muted">payment {formatMoney(installment.payment_cents)}</span>
                  )
                )}
              </span>
              <span className="flex justify-end gap-1 whitespace-nowrap text-xs text-ink-muted [grid-area:split] sm:contents sm:text-sm">
                <span className="num sm:text-right sm:[grid-area:interest]">
                  {formatMoney(installment.interest_cents)}
                  <span className="sm:hidden"> interest · </span>
                </span>
                <span className="num sm:text-right sm:[grid-area:principal]">
                  {formatMoney(installment.principal_cents)}
                  <span className="sm:hidden"> principal</span>
                </span>
              </span>
              <span className={cn("num text-right [grid-area:balance]", !muted && "text-ink-primary")}>
                {formatMoney(installment.balance_after_cents)}
              </span>
              <span className="text-xs [grid-area:state] sm:text-sm">
                <InstallmentState
                  installment={installment}
                  onLink={() => setLinking(installment.number)}
                  onUnlink={() => handleUnlink(installment)}
                />
              </span>
              {linking === installment.number && (
                <LinkPicker
                  accountId={loan.account}
                  installment={installment}
                  onLinked={(updated) => {
                    setLinking(null);
                    onChange(updated);
                  }}
                  onCancel={() => setLinking(null)}
                />
              )}
            </li>,
          ];
        })}
        {end === installments.length && correctionsAfterLast.map(correctionRow)}
      </ul>
      {end < installments.length && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="w-full px-5 pb-3 text-xs text-ink-muted hover:text-ink-secondary"
        >
          Show all ({installments.length - end} more, to {formatMonthYear(last.date)})
        </button>
      )}
    </Panel>
  );
}

/**
 * A loan account's schedule: how much is still owed, the terms, and every
 * installment with its state. Without a setup it offers to set one up.
 * See the loan-schedules spec.
 */
export function LoanSchedulePage() {
  const { accountId } = useParams();
  const id = Number(accountId);
  const [searchParams] = useSearchParams();
  const focus = Number(searchParams.get("installment")) || null;
  const { accounts, refresh: refreshAccounts } = useAccounts();
  const toast = useToast();
  const [account, setAccount] = useState(null);
  // undefined while loading, null when the loan isn't set up.
  const [loan, setLoan] = useState(undefined);
  const [categories, setCategories] = useState([]);
  // null, "edit", or "correct"; the two forms are never open together.
  const [mode, setMode] = useState(null);
  // The payment the correction form opens with, from the banner.
  const [correctPayment, setCorrectPayment] = useState(null);
  const editing = mode === "edit";
  const setEditing = (on) => setMode(on ? "edit" : null);

  function load() {
    return getLoan(id)
      .then(setLoan)
      .catch((e) => {
        if (e.status === 404) setLoan(null);
        else toast.error(errorMessage(e));
      });
  }

  useEffect(() => {
    setAccount(null);
    setLoan(undefined);
    setEditing(false);
    getAccount(id)
      .then((a) => {
        setAccount(a);
        if (a.account_type === "loan") load();
      })
      .catch((e) => toast.error(errorMessage(e)));
    listCategories()
      .then(setCategories)
      .catch((e) => toast.error(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function handleChanged(updated) {
    setLoan(updated);
    setMode(null);
    refreshAccounts();
  }

  function startCorrecting(paymentCents = null) {
    setCorrectPayment(paymentCents);
    setMode("correct");
  }

  const back = (
    <Link
      to={`/transactions/${id}`}
      className="flex items-center gap-1 self-start text-sm text-ink-secondary hover:text-ink-primary"
    >
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      {account?.name ?? "Transactions"}
    </Link>
  );
  const page = (children) => <section className="mx-auto flex w-full max-w-4xl flex-col gap-4">{back}{children}</section>;

  if (!account || (account.account_type === "loan" && loan === undefined)) {
    return page(<p className="text-sm text-ink-secondary">Loading...</p>);
  }
  if (account.account_type !== "loan") {
    return page(<p className="text-sm text-ink-secondary">Only a loan account has a repayment schedule.</p>);
  }

  const payers = accounts.filter((a) => a.id !== id && a.account_type !== "loan");
  const form = (
    <LoanForm
      account={account}
      loan={loan}
      categories={categories}
      payers={payers}
      onSaved={handleChanged}
      onCancel={loan ? () => setEditing(false) : undefined}
      onRemoved={() => {
        setLoan(null);
        setEditing(false);
        refreshAccounts();
      }}
    />
  );

  return page(
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-sm text-ink-secondary">
            <Landmark className="h-4 w-4" aria-hidden="true" />
            {account.name}
          </h1>
          {loan ? (
            <>
              {loan.paid_off_on ? (
                <p className="text-2xl font-semibold text-ink-primary">Paid off {formatFullDate(loan.paid_off_on)}</p>
              ) : (
                <p className="text-2xl font-semibold text-ink-primary">
                  <span className="num">{formatMoneyWhole(owed(loan.current_balance_cents))}</span> still owed
                </p>
              )}
              <p
                className="text-sm text-ink-muted"
                title={
                  loan.payment_since && latestBefore(loan) != null ? `Was ${formatMoney(latestBefore(loan))} a month` : undefined
                }
              >
                {termsLine(loan)}
              </p>
            </>
          ) : (
            <p className="text-2xl font-semibold text-ink-primary">No repayment schedule yet</p>
          )}
        </div>
        {loan && mode === null && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => startCorrecting()}>
              <Scale className="h-4 w-4" aria-hidden="true" />
              Correct balance
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
          </div>
        )}
      </header>

      {!loan && (
        <Panel title="Set up the schedule">
          <p className="mb-4 text-sm text-ink-secondary">
            Enter the terms from the bank's repayment table. Each month, the payment found in the paying account
            lowers what is owed by its principal.
          </p>
          {form}
        </Panel>
      )}
      {loan && editing && <Panel title="Edit the schedule">{form}</Panel>}
      {loan && mode === "correct" && (
        <Panel title="Correct the balance">
          <CorrectionForm
            loan={loan}
            payerName={loan.paid_from_name}
            initialPayment={correctPayment}
            onSaved={handleChanged}
            onCancel={() => setMode(null)}
          />
        </Panel>
      )}
      {loan && <ScheduleTable loan={loan} focus={focus} onChange={handleChanged} onCorrect={startCorrecting} />}
    </>,
  );
}
