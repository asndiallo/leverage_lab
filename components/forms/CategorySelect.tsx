import { inputClass } from "./formPrimitives";
import type { CategoryGroup } from "@/types/database";

export type CategoryOption = { code: string; label: string; category_group: CategoryGroup };

const groupLabels: Record<CategoryGroup, string> = {
  income: "Income",
  operating_expense: "Operating expense",
  capital_improvement: "Capital improvement",
  loan: "Loan",
  closing: "Closing",
};

export function CategorySelect({
  categories,
  name = "category",
  defaultValue = "",
}: {
  categories: CategoryOption[];
  name?: string;
  defaultValue?: string;
}) {
  const grouped = new Map<CategoryGroup, CategoryOption[]>();
  for (const c of categories) {
    const arr = grouped.get(c.category_group) ?? [];
    arr.push(c);
    grouped.set(c.category_group, arr);
  }
  return (
    <select name={name} required defaultValue={defaultValue} className={inputClass}>
      {defaultValue === "" && (
        <option value="" disabled>
          Select…
        </option>
      )}
      {[...grouped.entries()].map(([group, items]) => (
        <optgroup key={group} label={groupLabels[group]}>
          {items.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
