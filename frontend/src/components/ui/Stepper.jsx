import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";

/**
 * "‹ label ›" - the one stepper the month and year switchers share, so
 * the two look alike. `unit` names the controls ("Previous month").
 */
export function Stepper({ label, unit, onPrevious, onNext, previousDisabled = false, nextDisabled = false, wide = true }) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" aria-label={`Previous ${unit}`} disabled={previousDisabled} onClick={onPrevious}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className={wide ? "min-w-24 text-center text-sm font-medium text-ink-primary sm:min-w-32" : "min-w-14 text-center text-sm font-medium text-ink-primary"}>
        {label}
      </span>
      <Button variant="ghost" size="icon" aria-label={`Next ${unit}`} disabled={nextDisabled} onClick={onNext}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
