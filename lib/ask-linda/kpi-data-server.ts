import "server-only";

import {
  readDetailedReport,
} from "@/lib/3cx/import-server";
import {
  reportDateRangeForMonth,
  threeCxRangeLabel,
  type ThreeCxReportRange,
  type ThreeCxReportRow,
} from "@/lib/3cx/email-report";
import { getAppDashboardSettings } from "@/lib/auth/app-settings";
import {
  fetchCrmAiConfirmationRate,
  type CrmAiConfirmationRateResponse,
} from "@/lib/crm/appointments";
import {
  buildKpisPerMonth,
  formatVal,
  getVal,
  meetsTarget,
  MONTHS,
  type KpiRow,
  type MonthDb,
} from "@/lib/kpi-nmac-2026/model";
import { DEFAULT_KPI_YEAR, SUPPORTED_KPI_YEARS, type SupportedKpiYear } from "@/lib/kpi/years";
import { createServiceRoleClient } from "@/lib/supabase/admin";

type ThreeCxImportSummary = {
  source: string | null;
  source_filename: string | null;
  report_start_date: string | null;
  report_end_date: string | null;
  row_count: number | null;
  extension_row_count: number | null;
  imported_at: string | null;
};

const MONTH_NAME_TO_INDEX: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

function normalizeMonthValues(raw: Record<string, unknown> | null | undefined): MonthDb {
  const out: MonthDb = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "number" && Number.isFinite(v)) {
      out[k] = { ty: v };
      continue;
    }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      const ty = typeof o.ty === "number" ? o.ty : Number(o.ty ?? o.thisYear);
      const ly = typeof o.ly === "number" ? o.ly : Number(o.ly ?? o.lastYear);
      const point: MonthDb[string] = {};
      if (Number.isFinite(ty)) point.ty = ty;
      if (Number.isFinite(ly)) point.ly = ly;
      if (point.ty !== undefined || point.ly !== undefined) out[k] = point;
    }
  }
  return out;
}

function emptyMonthDbs(): Record<number, MonthDb> {
  return Object.fromEntries(Array.from({ length: 12 }, (_, m) => [m, {}])) as Record<number, MonthDb>;
}

function normalizeTargets(raw: Record<string, unknown> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw)) {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

export function parseKpiYearFromQuestion(question: string): SupportedKpiYear {
  const match = question.match(/\b(20\d{2})\b/);
  if (match) {
    const y = Number(match[1]);
    if ((SUPPORTED_KPI_YEARS as readonly number[]).includes(y)) {
      return y as SupportedKpiYear;
    }
  }
  return DEFAULT_KPI_YEAR;
}

export function parseMonthIndexFromQuestion(question: string): number | null {
  const t = question.toLowerCase();
  for (const [name, index] of Object.entries(MONTH_NAME_TO_INDEX)) {
    if (new RegExp(`\\b${name}\\b`).test(t)) return index;
  }
  if (/\blast month\b/.test(t)) {
    const now = new Date();
    return (now.getMonth() + 11) % 12;
  }
  if (/\bthis month\b|\bcurrent month\b/.test(t)) {
    return new Date().getMonth();
  }
  return null;
}

export function parseThreeCxRangeFromQuestion(question: string): ThreeCxReportRange {
  const t = question.toLowerCase();
  if (/\b(1st|first)\s+week\b|\bweek\s*1\b/.test(t)) return "week1";
  if (/\b(2nd|second)\s+week\b|\bweek\s*2\b/.test(t)) return "week2";
  if (/\b(3rd|third)\s+week\b|\bweek\s*3\b/.test(t)) return "week3";
  if (/\b(4th|fourth|last)\s+week\b|\bweek\s*4\b|\blast\s+7\s+days\b/.test(t)) return "week4";
  return "month";
}

const KPI_ALIASES: Partial<Record<KpiRow["id"], readonly string[]>> = {
  ai_confirmation_rate: ["ai confirmation", "ai confirmations", "ai confirmed appointments"],
  appt_confirm: ["appointment confirmations", "manual confirmation rate"],
  callrate: ["call answer rate", "answered call rate", "calls answered rate"],
  callvol: ["call volume", "calls received"],
  call_answered: ["answered calls", "serviced calls"],
  call_missed: ["missed calls", "abandoned calls", "unanswered calls"],
  copay: ["copay collection"],
  noshow: ["no show rate", "no shows"],
  util: ["doctor utilization", "provider utilization", "provider utilisation"],
  visits: ["patient checkouts"],
};

function normalizeKpiPhrase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\bnmack\b/g, "nmac")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function containsPhrase(text: string, phrase: string): boolean {
  return ` ${text} `.includes(` ${phrase} `);
}

function isBroadKpiQuestion(question: string): boolean {
  const t = normalizeKpiPhrase(question);
  return (
    /\b(all|list|overview|summary|dashboard|performance|report|which|missing|gaps?)\b/.test(t) ||
    /\b(how are we doing|kpi numbers|kpi metrics|all kpis|on target|below target|no data)\b/.test(t) ||
    /\bnmac kpis?\b/.test(t) && !/\b(rate|score|calls?|visits?|revenue|margin|sales|exams?|tests?|bookings?|productivity|compliance|utilization|utilisation|variances?)\b/.test(t)
  );
}

function matchKpisForQuestion(question: string, kpis: readonly KpiRow[]): KpiRow[] {
  const t = normalizeKpiPhrase(question);
  const specificHits = kpis.filter((kpi) => {
    const phrases = [
      normalizeKpiPhrase(kpi.id),
      normalizeKpiPhrase(kpi.label),
      ...(KPI_ALIASES[kpi.id] ?? []).map(normalizeKpiPhrase),
    ];
    return phrases.some((phrase) => phrase.length > 2 && containsPhrase(t, phrase));
  });
  if (specificHits.length > 0) return specificHits;

  const domainHits = kpis.filter((kpi) => {
    const domain = normalizeKpiPhrase(kpi.domain);
    return containsPhrase(t, domain) && /\b(kpi|kpis|metric|metrics|performance|dashboard)\b/.test(t);
  });
  if (domainHits.length > 0) return domainHits;

  return isBroadKpiQuestion(question) ? [...kpis] : [];
}

async function loadMonthly(year: number): Promise<Record<number, MonthDb>> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("nmac_master_monthly")
    .select("month_index, values")
    .eq("year", year)
    .order("month_index", { ascending: true });
  if (error) throw new Error(error.message);

  const out = emptyMonthDbs();
  for (const row of data ?? []) {
    const mi = Number((row as { month_index?: unknown }).month_index);
    if (!Number.isFinite(mi) || mi < 0 || mi > 11) continue;
    const values = (row as { values?: Record<string, unknown> | null }).values;
    out[mi] = normalizeMonthValues(values ?? undefined);
  }
  return out;
}

async function loadTargetPack(year: number): Promise<{
  fy: Record<string, number>;
  byMonth: Partial<Record<number, Record<string, number>>>;
}> {
  const supabase = createServiceRoleClient();
  const [fyRes, monthRes] = await Promise.all([
    supabase.from("nmac_master_targets").select("values").eq("year", year).maybeSingle(),
    supabase.from("nmac_master_target_months").select("month_index, values").eq("year", year),
  ]);
  if (fyRes.error) throw new Error(fyRes.error.message);

  const byMonth: Partial<Record<number, Record<string, number>>> = {};
  if (!monthRes.error) {
    for (const row of monthRes.data ?? []) {
      const m = Number((row as { month_index?: unknown }).month_index);
      if (!Number.isInteger(m) || m < 0 || m > 11) continue;
      byMonth[m] = normalizeTargets(
        (row as { values?: Record<string, unknown> }).values as Record<string, unknown>,
      );
    }
  }

  return {
    fy: normalizeTargets((fyRes.data?.values as Record<string, unknown> | undefined) ?? undefined),
    byMonth,
  };
}

function latestMonthWithData(monthly: Record<number, MonthDb>): number | null {
  for (let m = 11; m >= 0; m--) {
    const db = monthly[m];
    if (db && Object.values(db).some((p) => p.ty !== undefined || p.ly !== undefined)) {
      return m;
    }
  }
  return null;
}

function formatCount(value: number | null | undefined): string {
  return value == null ? "no data" : value.toLocaleString();
}

function formatAnswerRate(received: number | null | undefined, serviced: number | null | undefined): string {
  if (!received || serviced == null) return "no data";
  return `${Math.round((serviced / received) * 1000) / 10}%`;
}

function formatKpiLine(kpi: KpiRow, monthIndex: number, monthly: Record<number, MonthDb>): string {
  const val = getVal(monthly, monthIndex, kpi.id);
  const ly = monthly[monthIndex]?.[kpi.id]?.ly;
  const ok = meetsTarget(kpi, val);
  const status =
    ok === null ? "no data" : ok ? "on target" : "below target";
  const parts = [
    `**${kpi.label}** (${kpi.id})`,
    `actual: ${formatVal(kpi, val)}`,
    `target: ${formatVal(kpi, kpi.target)}`,
    `status: ${status}`,
  ];
  if (ly !== undefined) parts.push(`last year: ${formatVal(kpi, ly)}`);
  return `- ${parts.join(" | ")}`;
}

function wantsThreeCxDetail(question: string, focusKpis: readonly KpiRow[]): boolean {
  const t = question.toLowerCase();
  return (
    /\b(3cx|queue|queues?|call\s+performance|front\s+desk|virtual\s+staff|lab|received|serviced|unanswered|missed|answered|talk\s+time)\b/.test(
      t,
    ) || focusKpis.some((kpi) => kpi.domain === "Calls")
  );
}

function formatThreeCxQueueLine(row: ThreeCxReportRow): string {
  return [
    `- **${row.label}**`,
    `received: ${formatCount(row.received)}`,
    `serviced: ${formatCount(row.serviced)}`,
    `unanswered: ${formatCount(row.unanswered)}`,
    `answer rate: ${formatAnswerRate(row.received, row.serviced)}`,
  ].join(" | ");
}

function formatThreeCxExtensionLine(row: ThreeCxReportRow): string {
  return [
    `  - ${row.label}`,
    `serviced: ${formatCount(row.serviced)}`,
    `polls: ${formatCount(row.polls)}`,
    `talk time: ${row.talkTime || "00:00:00"}`,
    `average talk time: ${row.averageTalkTime || "00:00:00"}`,
  ].join(" | ");
}

async function loadThreeCxImportsForMonth(
  year: number,
  monthIndex: number,
): Promise<ThreeCxImportSummary[]> {
  const { startDate, endDate } = reportDateRangeForMonth(year, monthIndex, "month");
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("threecx_queue_report_imports")
    .select(
      [
        "source",
        "source_filename",
        "report_start_date",
        "report_end_date",
        "row_count",
        "extension_row_count",
        "imported_at",
      ].join(","),
    )
    .gte("report_start_date", startDate)
    .lte("report_end_date", endDate)
    .order("imported_at", { ascending: false })
    .limit(8);
  if (error) return [];
  return (data ?? []) as unknown as ThreeCxImportSummary[];
}

export async function buildNmacKpiContextForQuestion(question: string): Promise<string> {
  const year = parseKpiYearFromQuestion(question);
  const settings = await getAppDashboardSettings();
  const hiddenIds = settings?.hiddenNmacKpiIds ?? [];
  const [monthly, targetPack] = await Promise.all([loadMonthly(year), loadTargetPack(year)]);

  const requestedMonth = parseMonthIndexFromQuestion(question);
  const latestMonth = latestMonthWithData(monthly);
  const focusMonth =
    requestedMonth != null && monthly[requestedMonth]
      ? requestedMonth
      : latestMonth ?? new Date().getMonth();
  const kpisPerMonth = buildKpisPerMonth(targetPack.fy, targetPack.byMonth, hiddenIds);
  const visible = kpisPerMonth[focusMonth] ?? [];
  const focusKpis = matchKpisForQuestion(question, visible);
  const broadKpiQuestion = isBroadKpiQuestion(question);
  let aiConfirmationSnapshot: CrmAiConfirmationRateResponse | null = null;
  let aiConfirmationSnapshotUnavailable = false;
  if (focusKpis.some((kpi) => kpi.id === "ai_confirmation_rate")) {
    try {
      aiConfirmationSnapshot = await fetchCrmAiConfirmationRate(year, focusMonth + 1);
      if (
        typeof aiConfirmationSnapshot.rate_pct === "number" &&
        Number.isFinite(aiConfirmationSnapshot.rate_pct)
      ) {
        monthly[focusMonth] = {
          ...monthly[focusMonth],
          ai_confirmation_rate: {
            ...monthly[focusMonth]?.ai_confirmation_rate,
            ty: aiConfirmationSnapshot.rate_pct,
          },
        };
      }
    } catch {
      aiConfirmationSnapshotUnavailable = true;
    }
  }
  const threeCxRange = parseThreeCxRangeFromQuestion(question);
  const includeThreeCx = wantsThreeCxDetail(question, focusKpis);
  const [threeCxDetail, threeCxImports] = includeThreeCx
    ? await Promise.all([
        readDetailedReport({ year, monthIndex: focusMonth, range: threeCxRange }),
        loadThreeCxImportsForMonth(year, focusMonth),
      ])
    : [null, [] as ThreeCxImportSummary[]];

  const lines: string[] = [
    `# NMAC KPI data (${year})`,
    aiConfirmationSnapshot
      ? "Source: NMAC KPI dashboard (kpi.nmac.bm) - NMAC Master monthly actuals with the live CRM AI confirmation snapshot."
      : "Source: NMAC KPI dashboard (kpi.nmac.bm) - NMAC Master monthly actuals.",
    `Focus month: **${MONTHS[focusMonth]}** (index ${focusMonth}).`,
    "",
    "## Focus KPIs for this question",
  ];

  if (focusKpis.length === 0) {
    lines.push(
      "- No visible NMAC KPI label or recognized alias matched the metric in the question.",
      "- Do not substitute a different KPI. Ask the user to confirm the KPI name.",
      `- Visible KPI labels: ${visible.map((kpi) => kpi.label).join("; ")}.`,
    );
  } else {
    for (const kpi of focusKpis) {
      lines.push(formatKpiLine(kpi, focusMonth, monthly));
    }
  }

  if (aiConfirmationSnapshot) {
    lines.push(
      "",
      "## CRM AI confirmation snapshot",
      `- Period: ${aiConfirmationSnapshot.date_from} to ${aiConfirmationSnapshot.date_to}`,
      `- AI-confirmed appointments: ${aiConfirmationSnapshot.numerator.toLocaleString()}`,
      `- AI + phone-confirmed appointments: ${aiConfirmationSnapshot.denominator.toLocaleString()}`,
      `- Snapshot days: ${aiConfirmationSnapshot.snapshot_days.toLocaleString()}`,
      `- Rate: ${aiConfirmationSnapshot.rate_pct == null ? "no data" : `${aiConfirmationSnapshot.rate_pct}%`}`,
      "- Formula: AI confirmed / (AI confirmed + phone confirmed).",
    );
  } else if (aiConfirmationSnapshotUnavailable) {
    lines.push(
      "",
      "## CRM AI confirmation snapshot",
      "- The live CRM snapshot could not be loaded. Use the monthly actual above if one is recorded; otherwise say the actual is unavailable.",
    );
  }

  if (broadKpiQuestion) {
    lines.push("", "## All visible KPIs by domain (focus month)");
    const byDomain = new Map<string, KpiRow[]>();
    for (const kpi of visible) {
      const list = byDomain.get(kpi.domain) ?? [];
      list.push(kpi);
      byDomain.set(kpi.domain, list);
    }
    for (const [domain, rows] of byDomain) {
      lines.push(`### ${domain}`);
      for (const kpi of rows) {
        lines.push(formatKpiLine(kpi, focusMonth, monthly));
      }
    }
  }

  if (focusKpis.length > 0) {
    lines.push("", "## Monthly trend (focus KPIs, Jan-Dec actual TY)");
    for (const kpi of focusKpis.slice(0, 12)) {
      const monthVals = MONTHS.map((name, m) => {
        const monthKpi = kpisPerMonth[m]?.find((candidate) => candidate.id === kpi.id) ?? kpi;
        const v = getVal(monthly, m, kpi.id);
        return `${name}: ${formatVal(monthKpi, v)}`;
      });
      lines.push(`- **${kpi.label}**: ${monthVals.join("; ")}`);
    }
  }

  if (includeThreeCx) {
    const { startDate, endDate } = reportDateRangeForMonth(year, focusMonth, threeCxRange);
    lines.push(
      "",
      `## 3CX call queue performance (${MONTHS[focusMonth]} ${year}, ${threeCxRangeLabel(threeCxRange)}, ${startDate} to ${endDate})`,
    );
    if (threeCxDetail?.error) {
      lines.push(`- Could not load saved 3CX queue rows: ${threeCxDetail.error}`);
    } else if (threeCxDetail?.metrics && threeCxDetail.rows.length > 0) {
      lines.push(
        `- Totals: received ${threeCxDetail.metrics.received.toLocaleString()} | serviced ${threeCxDetail.metrics.answered.toLocaleString()} | unanswered/missed ${threeCxDetail.metrics.missed.toLocaleString()} | answer rate ${threeCxDetail.metrics.answeredRate}%`,
      );
      const queueRows = threeCxDetail.rows.filter((row) => row.level === "queue");
      const extensionRows = threeCxDetail.rows.filter((row) => row.level === "extension");
      lines.push("### Queue rows");
      for (const row of queueRows.slice(0, 20)) {
        lines.push(formatThreeCxQueueLine(row));
      }
      if (queueRows.length > 20) {
        lines.push(`- ${queueRows.length - 20} additional queue rows not shown in this context.`);
      }
      if (extensionRows.length > 0 && /extension|agent|talk\s+time|polls?/i.test(question)) {
        lines.push("### Extension rows");
        for (const row of extensionRows.slice(0, 30)) {
          lines.push(formatThreeCxExtensionLine(row));
        }
        if (extensionRows.length > 30) {
          lines.push(`- ${extensionRows.length - 30} additional extension rows not shown in this context.`);
        }
      }
    } else {
      lines.push("- No saved 3CX queue rows are recorded for this selected range.");
    }

    if (threeCxImports.length > 0) {
      lines.push("", "### Saved 3CX imports for this month");
      for (const row of threeCxImports) {
        const source = row.source_filename || row.source || "unknown source";
        lines.push(
          `- ${source}: ${row.report_start_date ?? "?"} to ${row.report_end_date ?? "?"} | queues: ${formatCount(row.row_count)} | extensions: ${formatCount(row.extension_row_count)} | imported: ${row.imported_at ?? "unknown"}`,
        );
      }
    }
  }

  lines.push(
    "",
    "Instructions for the assistant: Answer using only the figures above. If a KPI or 3CX range shows no data, say it is not recorded for that month/range. Targets use NMAC master dashboard settings. Do not answer NMAC KPI questions from Daily Work Log content.",
  );

  return lines.join("\n");
}
