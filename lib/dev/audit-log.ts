import { appendDevLog } from "@/lib/dev/logs";
import type { AppRole } from "@/lib/auth/types";
import { MONTHS } from "@/lib/kpi-nmac-2026/model";

type AuditActor = {
  email: string;
  role: AppRole;
};

function fire(input: Parameters<typeof appendDevLog>[0]) {
  void appendDevLog(input).then((result) => {
    if (result.setupRequired) {
      console.error("[audit-log] app_dev_logs table missing — run supabase/add-dev-logs.sql");
    } else if (result.error) {
      console.error("[audit-log]", result.error);
    }
  });
}

export function auditAuthSignedIn(
  actor: AuditActor,
  method: "email_otp" | "bitrix",
  context?: Record<string, unknown>,
) {
  const via = method === "bitrix" ? "Bitrix24" : "email code";
  fire({
    level: "info",
    source: "auth",
    message: `Signed in via ${via}`,
    createdByEmail: actor.email,
    context: { role: actor.role, method, ...context },
  });
}

export function auditAuthSignedOut(actor: AuditActor) {
  fire({
    level: "info",
    source: "auth",
    message: "Signed out",
    createdByEmail: actor.email,
    context: { role: actor.role },
  });
}

export function auditWeeklyKpiSaved(
  actor: AuditActor,
  input: { kpiSlug: string; year: number; rowCount: number; weekIndices: number[] },
) {
  const weeks =
    input.weekIndices.length <= 6
      ? input.weekIndices.join(", ")
      : `${input.weekIndices.slice(0, 5).join(", ")}… (+${input.weekIndices.length - 5} more)`;

  fire({
    level: "info",
    source: "kpi.weekly",
    message: `Saved weekly KPI “${input.kpiSlug}” for ${input.year} (${input.rowCount} week${input.rowCount === 1 ? "" : "s"})`,
    createdByEmail: actor.email,
    context: {
      role: actor.role,
      kpiSlug: input.kpiSlug,
      year: input.year,
      rowCount: input.rowCount,
      weekIndices: input.weekIndices,
      weeks,
    },
  });
}

export function auditNmacMasterMonthSaved(
  actor: AuditActor,
  input: { year: number; monthIndex: number; kpiCount: number },
) {
  const month = MONTHS[input.monthIndex] ?? `Month ${input.monthIndex + 1}`;
  fire({
    level: "info",
    source: "kpi.nmac",
    message: `Saved NMAC master actuals for ${month} ${input.year}`,
    createdByEmail: actor.email,
    context: {
      role: actor.role,
      year: input.year,
      monthIndex: input.monthIndex,
      month,
      kpiCount: input.kpiCount,
    },
  });
}

export function auditNmacTargetsSaved(actor: AuditActor, input: { year: number; targetCount: number }) {
  fire({
    level: "info",
    source: "kpi.nmac",
    message: `Updated NMAC FY targets for ${input.year}`,
    createdByEmail: actor.email,
    context: {
      role: actor.role,
      year: input.year,
      targetCount: input.targetCount,
    },
  });
}

export function auditNmacTargetMonthSaved(
  actor: AuditActor,
  input: { year: number; monthIndex: number; targetCount: number },
) {
  const month = MONTHS[input.monthIndex] ?? `Month ${input.monthIndex + 1}`;
  fire({
    level: "info",
    source: "kpi.nmac",
    message: `Updated NMAC targets for ${month} ${input.year}`,
    createdByEmail: actor.email,
    context: {
      role: actor.role,
      year: input.year,
      monthIndex: input.monthIndex,
      month,
      targetCount: input.targetCount,
    },
  });
}

export function auditNmacTargetMonthCleared(actor: AuditActor, input: { year: number; monthIndex: number }) {
  const month = MONTHS[input.monthIndex] ?? `Month ${input.monthIndex + 1}`;
  fire({
    level: "info",
    source: "kpi.nmac",
    message: `Cleared NMAC month targets for ${month} ${input.year}`,
    createdByEmail: actor.email,
    context: {
      role: actor.role,
      year: input.year,
      monthIndex: input.monthIndex,
      month,
    },
  });
}

export function auditAdminUserAdded(
  actor: AuditActor,
  input: { email: string; role: AppRole },
) {
  fire({
    level: "info",
    source: "admin.users",
    message: `Added user ${input.email} as ${input.role}`,
    createdByEmail: actor.email,
    context: { role: actor.role, userEmail: input.email, userRole: input.role },
  });
}

export function auditAdminUserUpdated(
  actor: AuditActor,
  input: { email: string; changes: Record<string, unknown> },
) {
  const parts = Object.keys(input.changes);
  fire({
    level: "info",
    source: "admin.users",
    message: `Updated user ${input.email}${parts.length ? ` (${parts.join(", ")})` : ""}`,
    createdByEmail: actor.email,
    context: { role: actor.role, userEmail: input.email, changes: input.changes },
  });
}

export function auditAdminUserRemoved(actor: AuditActor, input: { email: string }) {
  fire({
    level: "warn",
    source: "admin.users",
    message: `Removed user ${input.email}`,
    createdByEmail: actor.email,
    context: { role: actor.role, userEmail: input.email },
  });
}

export function auditRoleNmacNavUpdated(actor: AuditActor, input: { roles: AppRole[] }) {
  fire({
    level: "info",
    source: "admin.access",
    message: `Updated Master KPI access for ${input.roles.join(", ")}`,
    createdByEmail: actor.email,
    context: { role: actor.role, updatedRoles: input.roles },
  });
}
