export const DEFAULT_KPI_YEAR = 2026;

export const SUPPORTED_KPI_YEARS = [2026, 2025, 2024, 2023] as const;

export type SupportedKpiYear = (typeof SUPPORTED_KPI_YEARS)[number];
