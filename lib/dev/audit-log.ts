import { summarizeChangeSet, type StoredAuditChanges } from "@/lib/dev/kpi-audit-diff";
import { appendDevLog } from "@/lib/dev/logs";
import { MONTHS } from "@/lib/kpi-nmac-2026/model";
type AuditActor = {
  email: string;
  role: string;
};

async function fire(input: Parameters<typeof appendDevLog>[0]): Promise<void> {
  const result = await appendDevLog(input);
  if (result.setupRequired) {
    console.error("[audit-log] app_dev_logs table missing — run supabase/add-dev-logs.sql");
  } else if (result.error) {
    console.error("[audit-log]", result.error);
  }
}

export function auditAuthSignedIn(
  actor: AuditActor,
  method: "email_otp" | "bitrix",
  context?: Record<string, unknown>,
) {
  const via = method === "bitrix" ? "Bitrix24" : "email code";
  return fire({
    level: "info",
    source: "auth",
    message: `Signed in via ${via}`,
    createdByEmail: actor.email,
    context: { role: actor.role, method, ...context },
  });
}

export function auditAuthSignedOut(actor: AuditActor) {
  return fire({
    level: "info",
    source: "auth",
    message: "Signed out",
    createdByEmail: actor.email,
    context: { role: actor.role },
  });
}

export function auditAppOpened(actor: AuditActor, via: "bitrix" | "browser") {
  const viaLabel = via === "bitrix" ? "Bitrix24" : "browser";
  return fire({
    level: "info",
    source: "auth",
    message: `Opened app via ${viaLabel}`,
    createdByEmail: actor.email,
    context: { role: actor.role, method: via },
  });
}

export function auditWeeklyKpiSaved(
  actor: AuditActor,
  input: {
    kpiSlug: string;
    year: number;
    rowCount: number;
    weekIndices: number[];
    changes: StoredAuditChanges;
  },
) {
  const weeks =
    input.weekIndices.length <= 6
      ? input.weekIndices.join(", ")
      : `${input.weekIndices.slice(0, 5).join(", ")}… (+${input.weekIndices.length - 5} more)`;
  const summary = summarizeChangeSet(input.changes);

  return fire({
    level: "info",
    source: "kpi.weekly",
    message: `Saved weekly KPI “${input.kpiSlug}” for ${input.year} (${summary})`,
    createdByEmail: actor.email,
    context: {
      role: actor.role,
      kpiSlug: input.kpiSlug,
      year: input.year,
      rowCount: input.rowCount,
      weekIndices: input.weekIndices,
      weeks,
      changes: input.changes,
    },
  });
}

export function auditNmacMasterMonthSaved(
  actor: AuditActor,
  input: { year: number; monthIndex: number; kpiCount: number; changes: StoredAuditChanges },
) {
  const month = MONTHS[input.monthIndex] ?? `Month ${input.monthIndex + 1}`;
  const summary = summarizeChangeSet(input.changes);
  return fire({
    level: "info",
    source: "kpi.nmac",
    message: `Saved NMAC master actuals for ${month} ${input.year} (${summary})`,
    createdByEmail: actor.email,
    context: {
      role: actor.role,
      year: input.year,
      monthIndex: input.monthIndex,
      month,
      kpiCount: input.kpiCount,
      changes: input.changes,
    },
  });
}

export function auditNmacTargetsSaved(
  actor: AuditActor,
  input: { year: number; targetCount: number; changes: StoredAuditChanges },
) {
  const summary = summarizeChangeSet(input.changes);
  return fire({
    level: "info",
    source: "kpi.nmac",
    message: `Updated NMAC FY targets for ${input.year} (${summary})`,
    createdByEmail: actor.email,
    context: {
      role: actor.role,
      year: input.year,
      targetCount: input.targetCount,
      changes: input.changes,
    },
  });
}

export function auditNmacTargetMonthSaved(
  actor: AuditActor,
  input: { year: number; monthIndex: number; targetCount: number; changes: StoredAuditChanges },
) {
  const month = MONTHS[input.monthIndex] ?? `Month ${input.monthIndex + 1}`;
  const summary = summarizeChangeSet(input.changes);
  return fire({
    level: "info",
    source: "kpi.nmac",
    message: `Updated NMAC targets for ${month} ${input.year} (${summary})`,
    createdByEmail: actor.email,
    context: {
      role: actor.role,
      year: input.year,
      monthIndex: input.monthIndex,
      month,
      targetCount: input.targetCount,
      changes: input.changes,
    },
  });
}

export function auditNmacTargetMonthCleared(
  actor: AuditActor,
  input: { year: number; monthIndex: number; changes: StoredAuditChanges },
) {
  const month = MONTHS[input.monthIndex] ?? `Month ${input.monthIndex + 1}`;
  const summary = summarizeChangeSet(input.changes);
  return fire({
    level: "info",
    source: "kpi.nmac",
    message: `Cleared NMAC month targets for ${month} ${input.year} (${summary})`,
    createdByEmail: actor.email,
    context: {
      role: actor.role,
      year: input.year,
      monthIndex: input.monthIndex,
      month,
      changes: input.changes,
    },
  });
}

export function auditAdminUserAdded(
  actor: AuditActor,
  input: { email: string; role: string },
) {
  return fire({
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
  return fire({
    level: "info",
    source: "admin.users",
    message: `Updated user ${input.email}${parts.length ? ` (${parts.join(", ")})` : ""}`,
    createdByEmail: actor.email,
    context: { role: actor.role, userEmail: input.email, changes: input.changes },
  });
}

export function auditAdminUserRemoved(actor: AuditActor, input: { email: string }) {
  return fire({
    level: "warn",
    source: "admin.users",
    message: `Removed user ${input.email}`,
    createdByEmail: actor.email,
    context: { role: actor.role, userEmail: input.email },
  });
}

export function auditRoleNmacNavUpdated(actor: AuditActor, input: { roles: string[] }) {
  return fire({
    level: "info",
    source: "admin.access",
    message: `Updated Master KPI access for ${input.roles.join(", ")}`,
    createdByEmail: actor.email,
    context: { role: actor.role, updatedRoles: input.roles },
  });
}

export function auditCustomRoleCreated(
  actor: AuditActor,
  input: { roleId: string; label: string },
) {
  return fire({
    level: "info",
    source: "admin.roles",
    message: `Created role “${input.label}”`,
    createdByEmail: actor.email,
    context: { role: actor.role, roleId: input.roleId, label: input.label },
  });
}

export function auditCustomRoleRemoved(
  actor: AuditActor,
  input: { roleId: string; label: string },
) {
  return fire({
    level: "warn",
    source: "admin.roles",
    message: `Removed role “${input.label}”`,
    createdByEmail: actor.email,
    context: { role: actor.role, roleId: input.roleId, label: input.label },
  });
}

export function auditMaintenanceModeUpdated(actor: AuditActor, input: { enabled: boolean }) {
  return fire({
    level: input.enabled ? "warn" : "info",
    source: "admin.access",
    message: input.enabled ? "Enabled maintenance mode" : "Disabled maintenance mode",
    createdByEmail: actor.email,
    context: { role: actor.role, maintenanceMode: input.enabled },
  });
}
