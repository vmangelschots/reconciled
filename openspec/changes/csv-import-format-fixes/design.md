# Design

## Context

`imports/utils.py` currently parses CSV with `csv.DictReader` against the
default dialect (comma delimiter), and `_parse_date` guesses the date
format by trying a fixed list (`%Y-%m-%d`, `%m/%d/%Y`, `%d/%m/%Y`,
`%m/%d/%y`) in order and taking whichever parses without error. Traced
against the user's real Crelan export (semicolon-delimited, dates like
`01/10/2026`), this guessing silently produces wrong dates for any day
≤ 12, since `%m/%d/%Y` happens to parse successfully (with the wrong
meaning) before `%d/%m/%Y` is ever tried. See `proposal.md` - Why.

## Goals / Non-Goals

**Goals:**
- Parse comma-, semicolon-, tab-, and pipe-delimited CSV files correctly,
  without the user having to specify the delimiter.
- Eliminate date-format ambiguity entirely by making the user choose it
  explicitly, rather than trading one guessing heuristic for a smarter
  one that could still be wrong.
- Keep every existing comma-delimited, explicitly-dated import working
  exactly as before.

**Non-Goals:**
- No support for CSV files using a comma as the *decimal* separator in
  amounts (e.g. `1.234,56`) - traced against the user's actual file, its
  amounts already use a plain period decimal point, so this isn't needed
  to fix the reported problem. If a future file needs it, that's a
  separate, narrower change to `_parse_amount_cents`.
- No arbitrary user-supplied `strptime` format string - the date format
  is a fixed, validated list of common options, not free text, to avoid
  format-string injection and keep the mapping UI simple.
- No change to OFX parsing, duplicate detection, or the commit flow -
  none of those are affected by delimiter or date-format handling.

## Decisions

### Delimiter: `csv.Sniffer`, restricted to a safe candidate set
Python's `csv.Sniffer().sniff(sample, delimiters=",;\t|")` detects the
delimiter from a sample of the file's actual content (header + several
data rows), restricted to the four delimiters real bank/spreadsheet
exports actually use. Restricting the candidate set (rather than letting
Sniffer guess from any character) avoids false positives from picking up
a stray character in free-text fields. If sniffing raises (inconclusive
sample, e.g. a single-column file), fall back to comma - preserving
today's exact behavior for files that already work, so this is additive,
not breaking, for existing imports.

Applied once in the `create` (upload) action, before returning CSV
column headers for mapping - `csv_columns` and `parse_csv_candidates`
both need the detected delimiter, so it's detected once and threaded
through rather than re-sniffed at each step.

### Date format: an explicit required field, not smarter guessing
The proposal's Non-Goals already rules out a cleverer heuristic (e.g.
"assume DD/MM if any row's first number is >12") - with a single-row or
all-ambiguous sample, no heuristic is reliable, and silently guessing
wrong is exactly the bug being fixed. A fixed list of common formats
(`YYYY-MM-DD`, `DD/MM/YYYY`, `MM/DD/YYYY`, `DD-MM-YYYY`, `MM-DD-YYYY`,
`DD.MM.YYYY`) maps directly to `strptime` patterns server-side; the
mapping request now includes `date_format` as a required field alongside
`date`/`description`/`amount`, validated the same way those already are
(`validate_csv_mapping` gains it as a required-field check, listed by
name if missing - consistent with the existing "Reject mapping with a
missing required field" scenario).

### No frontend default pre-selected
Per the Goals, this eliminates the ambiguity rather than relocating it -
pre-selecting a default (e.g. ISO) would just be guessing again, dressed
up as a default. The user must pick one before the mapping can proceed,
same as date/description/amount already require.

## Risks / Trade-offs

- [Restricting Sniffer to 4 delimiters could miss an exotic one] →
  Acceptable: comma/semicolon/tab/pipe cover the overwhelming majority of
  real bank and spreadsheet CSV exports; a file using something else
  already fails today, so this doesn't regress anything.
- [Requiring an explicit date format is one more mapping field] →
  Deliberate trade-off per Goals: a guess that's sometimes silently wrong
  is worse than one more required dropdown, especially for financial
  data where a wrong date is a real-money correctness bug, not a cosmetic
  one.
- [This is a breaking change to the `map` action's request shape] →
  Scoped and accepted in `proposal.md` - Impact: pre-release, self-hosted,
  single-user, no versioned API consumers to break.
