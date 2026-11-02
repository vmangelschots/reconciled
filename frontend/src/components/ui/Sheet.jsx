import { cn } from "../../lib/cn";
import { Dialog, DialogContent } from "./Dialog";

const PLACE = {
  side: "bottom-0 left-auto right-0 top-0 h-full max-w-md translate-x-0 translate-y-0 rounded-none",
  bottom: "top-auto bottom-0 left-0 max-h-[85vh] max-w-none translate-x-0 translate-y-0 rounded-b-none rounded-t-2xl",
};

/** A panel from the side, or from the bottom on a phone (`wide` is false). */
export function Sheet({ open, onClose, wide, children }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className={cn("flex flex-col overflow-hidden p-0", wide ? PLACE.side : PLACE.bottom)}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}
