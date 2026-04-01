export type KpiUnit = "count" | "percent" | "minutes" | "score";

export type KpiDefinition = {
  id: string;
  slug: string;
  label: string;
  unit: KpiUnit;
  suffix: string;
  target: number;
  sortOrder: number;
};

export type WeeklyRow = {
  weekLabel: string;
  weekIndex: number;
  thisYear: number | null;
  lastYear: number | null;
};
