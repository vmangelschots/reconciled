const TABBABLE = 'a[href], button, input, select, textarea, [tabindex]';

// Elements a plain Tab would visit, in document order. Anything inside
// an open Radix popper (a portaled popover or select) is left out: it
// isn't part of the page's own tab order.
function tabbables() {
  return Array.from(document.querySelectorAll(TABBABLE)).filter(
    (el) =>
      !el.disabled &&
      el.getAttribute("tabindex") !== "-1" &&
      !(el instanceof HTMLInputElement && el.type === "hidden") &&
      !el.closest("[hidden], [inert], [data-radix-popper-content-wrapper]"),
  );
}

// Moves focus to the tabbable element after (or before) `el`, as Tab /
// Shift+Tab would from `el`. Returns false when there is no neighbor.
export function focusAdjacentTabbable(el, direction) {
  const list = tabbables().filter((t) => t !== el && !el.contains(t));
  const isBefore = (t) => t.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING;
  const target = direction === "prev" ? list.filter(isBefore).at(-1) : list.find((t) => !isBefore(t));
  if (!target) return false;
  target.focus();
  return true;
}
