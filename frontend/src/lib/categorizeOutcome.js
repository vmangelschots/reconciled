// Copy for what a categorizer run did, shared by the Review page's backfill
// and the import summary - see openspec/specs/auto-categorization and
// transaction-import. Responses carry categorized_by_source and ai.

// "10 from your history, 4 by AI", leaving out any zero part.
export function sourceSplit({ history = 0, ai = 0 } = {}, historyLabel = "from your history") {
  const parts = [];
  if (history > 0) parts.push(`${history} ${historyLabel}`);
  if (ai > 0) parts.push(`${ai} by AI`);
  return parts.join(", ");
}

// What to tell the user about the AI step; nothing when it went fine (or
// wasn't used).
export function aiOutcomeLines(ai) {
  if (!ai) return [];
  const lines = [];
  if (ai.status === "failed") lines.push("AI guessing didn't respond.");
  if (ai.status === "key_rejected") lines.push("AI is not working: check OPENAI_API_KEY.");
  if (ai.declined_count > 0) {
    lines.push(
      ai.declined_count === 1
        ? "1 new payee couldn't be guessed."
        : `${ai.declined_count} new payees couldn't be guessed.`,
    );
  }
  return lines;
}

export function aiFailed(ai) {
  return ai?.status === "failed" || ai?.status === "key_rejected";
}

// The model's reason as a phrase after "·": no trailing period. Its casing
// is kept, so "Belgian rail operator" doesn't become "belgian ...".
export function displayReason(reason) {
  return (reason ?? "").trim().replace(/\.+$/, "");
}
