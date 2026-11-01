import { useEffect, useRef, useState } from "react";
import { getHousehold, setAiChoice } from "../api/household";
import { Button } from "./ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/Dialog";
import { Panel } from "./ui/Panel";
import { PillSwitch } from "./ui/PillSwitch";
import { SettingRow } from "./ui/SettingRow";
import { useToast } from "./ui/Toast";

const OPTIONS = [
  { value: "off", label: "Off" },
  { value: "on", label: "On" },
];

// Each household's own choice - see specs/auto-categorization. Turning it on
// sends data elsewhere and applies to everyone, so that takes a confirmation.
export function AiSection() {
  const toast = useToast();
  const toastRef = useRef(toast);
  const [household, setHousehold] = useState(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    getHousehold()
      .then(setHousehold)
      .catch((e) => toastRef.current.error(e.message));
  }, []);

  async function save(enabled) {
    try {
      const saved = await setAiChoice(enabled);
      setHousehold((current) => ({ ...current, ai_enabled: saved.ai_enabled }));
      setConfirming(false);
    } catch (e) {
      toast.error(e.data?.detail ?? e.message);
    }
  }

  if (!household?.ai_available) return null;

  return (
    <Panel title="AI categorization">
      <SettingRow
        title="Suggest categories with AI"
        text={
          household.ai_enabled
            ? "On. Payee names, notes and amounts go to OpenAI."
            : "Off. Suggest categories for new payees using AI."
        }
      >
        <PillSwitch
          label="AI categorization"
          options={OPTIONS}
          value={household.ai_enabled ? "on" : "off"}
          onChange={(value) => {
            if (value === "on" && !household.ai_enabled) setConfirming(true);
            if (value === "off" && household.ai_enabled) save(false);
          }}
        />
      </SettingRow>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Turn on AI categorization?</DialogTitle>
            <DialogDescription>
              Reconciled will send payee names, payment notes, amounts and your category names to OpenAI, using the
              account of the person who runs this Reconciled. Account names, balances and dates aren't sent. This
              applies to everyone in your household.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button onClick={() => save(true)}>Turn on</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
