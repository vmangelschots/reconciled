import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { completeBank } from "../api/bankSync";
import { useToast } from "../components/ui/Toast";

// Where a bank sends the user back to: finishes the connection, then
// continues in Settings. See specs/bank-sync.
export function BankRedirectPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const started = useRef(false);

  useEffect(() => {
    // Effects run twice in development, and a bank's code works once.
    if (started.current) return;
    started.current = true;
    async function finish() {
      const code = params.get("code");
      if (!code) {
        toast.error(params.get("error_description") || "The bank didn't connect.");
      } else {
        try {
          const connection = await completeBank(code, params.get("state"));
          toast.success(`${connection.bank_name} is connected.`);
        } catch (e) {
          toast.error(e.data?.detail ?? e.message);
        }
      }
      navigate("/settings", { replace: true });
    }
    finish();
  }, [params, navigate, toast]);

  return <p className="text-sm text-ink-secondary">Connecting your bank…</p>;
}
