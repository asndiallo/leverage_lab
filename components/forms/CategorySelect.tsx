import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
    <Select name={name} required defaultValue={defaultValue || undefined}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select…" />
      </SelectTrigger>
      <SelectContent>
        {[...grouped.entries()].map(([group, items]) => (
          <SelectGroup key={group}>
            <SelectLabel>{groupLabels[group]}</SelectLabel>
            {items.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
