# Design

## Context

At commit, a line's payee becomes `Transaction.payee`. Its description
becomes `notes`, but only when it differs from the payee. The duplicate
check groups existing ledger rows by (date, amount) and then compares
the line's description with the existing row's payee, which is the
mix-up described in proposal.md.

## Decisions

### Compare payee with payee, and nothing else

The similarity test becomes `_is_similar(candidate["payee"],
existing.payee)`, with the same 0.8 threshold.

For every format the check already handled, this changes nothing.
Revolut lines, and CSVs without a payee column, have payee equal to
description, so the comparison gives the same result as before. It only
changes the outcome where payee and description differ: Crelan, OFX with
a memo, and CSV with a mapped payee column.

**Alternative considered: match on payee or on description vs notes.**
That would also catch a line whose payee was renamed after import. It
was rejected because Crelan's description is often a generic "Type
verrichting" such as "Kaartbetaling" or "Overschrijving". Two different
card payments of the same amount on the same day would then match each
other on the description alone, so a new line could be hidden as a
duplicate. Hiding a real line is worse than showing a duplicate in the
preview: the user can untick a duplicate, but won't notice a missing
line.

**Alternative considered: description with notes, falling back to
payee.** This mirrors how the line was stored, but it has the same
generic-description problem, and adds nothing over payee alone for the
formats that matter.

## Risks / Trade-offs

- [A renamed payee is no longer recognized] → This is not a regression:
  the old check failed the same way, since it compared against the
  renamed payee. It is recorded as out of scope in the proposal.
- [Short or near-identical payees on the same day and amount, e.g. two
  "Colruyt" payments of -12.40] → Each existing row marks at most one
  line, so a second real payment is still imported. This is the existing
  "two identical payments on one day" behavior.
