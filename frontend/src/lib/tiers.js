// Account tiers, from most to least liquid - see the accounts spec's
// "Account tiers". An account's tier comes from its type.

export const TIERS = [
  { value: "everyday", label: "Everyday" },
  { value: "savings", label: "Savings" },
  { value: "investments", label: "Investments" },
  { value: "property", label: "Property" },
  { value: "loans", label: "Loans" },
];

export function tierLabel(tier) {
  return TIERS.find((t) => t.value === tier)?.label ?? tier;
}

// Types whose value is set by hand - see the value-adjustments spec.
export const VALUED_TYPES = new Set(["investment", "property", "loan"]);
