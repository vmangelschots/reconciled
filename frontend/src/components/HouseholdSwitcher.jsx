import { useAuth } from "../auth/AuthContext";
import { switchHousehold } from "../api/household";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/Select";
import { useToast } from "./ui/Toast";

/** Only for people in several households. Switching reloads the whole app, so
 * nothing from the old household stays on screen. See specs/ui-shell. */
export function HouseholdSwitcher({ className }) {
  const { user } = useAuth();
  if (!user || (user.households?.length ?? 0) < 2) return null;
  return <Switcher user={user} className={className} />;
}

function Switcher({ user, className }) {
  const toast = useToast();

  async function change(id) {
    try {
      await switchHousehold(Number(id));
      window.location.assign("/");
    } catch (e) {
      toast.error(e.data?.detail ?? e.message);
    }
  }

  return (
    <div className={className}>
      <Select value={String(user.household.id)} onValueChange={change}>
        <SelectTrigger aria-label="Household">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {user.households.map((household) => (
            <SelectItem key={household.id} value={String(household.id)}>
              {household.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
