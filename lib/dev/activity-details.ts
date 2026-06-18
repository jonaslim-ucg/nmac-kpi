import type { CustomRole } from "@/lib/auth/custom-roles";
import type { DevLogEntry } from "@/lib/dev/logs";
import { formatRoleLabel } from "@/lib/auth/types";

export type ActivityDetail = {
  label: string;
  value: string;
};

const FIELD_LABELS: Record<string, string> = {
  role: "Role",
  email: "Email",
  first_name: "First name",
  last_name: "Last name",
};

function roleLabel(value: unknown, customRoles: CustomRole[] = []): string {
  if (typeof value !== "string") return String(value ?? "—");
  return formatRoleLabel(value, customRoles) || value;
}

function formatChangeField(
  field: string,
  value: unknown,
  customRoles: CustomRole[] = [],
): ActivityDetail | null {
  const label = FIELD_LABELS[field] ?? field.replace(/_/g, " ");

  if (value && typeof value === "object" && "from" in value && "to" in value) {
    const from = (value as { from: unknown }).from;
    const to = (value as { to: unknown }).to;
    if (field === "role") {
      return {
        label: `${label} changed`,
        value: `${roleLabel(from, customRoles)} → ${roleLabel(to, customRoles)}`,
      };
    }
    return {
      label: `${label} changed`,
      value: `${String(from ?? "—")} → ${String(to ?? "—")}`,
    };
  }

  if (field === "role" && typeof value === "string") {
    return { label: `${label} set to`, value: roleLabel(value, customRoles) };
  }

  if (value == null || value === "") return null;
  return { label, value: String(value) };
}

function pushDetail(details: ActivityDetail[], label: string, value: unknown) {
  if (value == null || value === "") return;
  details.push({ label, value: String(value) });
}

export function getActivityDetails(row: DevLogEntry, customRoles: CustomRole[] = []): ActivityDetail[] {
  const ctx = row.context;
  if (!ctx || typeof ctx !== "object") return [];

  const details: ActivityDetail[] = [];
  const source = row.source?.trim() ?? "";

  if (typeof ctx.role === "string") {
    details.push({
      label: "Performed by",
      value: `${row.created_by_email ?? "Unknown"} (${roleLabel(ctx.role, customRoles)})`,
    });
  } else if (row.created_by_email) {
    details.push({ label: "Performed by", value: row.created_by_email });
  }

  if (source === "auth") {
    if (typeof ctx.method === "string") {
      const method =
        ctx.method === "bitrix" ? "Bitrix24" : ctx.method === "email_otp" ? "Email code" : ctx.method;
      pushDetail(details, "Sign-in method", method);
    }
    return details;
  }

  if (source === "kpi.weekly") {
    pushDetail(details, "KPI", ctx.kpiSlug);
    pushDetail(details, "Year", ctx.year);
    pushDetail(details, "Weeks updated", ctx.weeks ?? ctx.rowCount);
    return details;
  }

  if (source === "kpi.nmac") {
    pushDetail(details, "Year", ctx.year);
    if (ctx.month) pushDetail(details, "Month", ctx.month);
    if (ctx.kpiCount != null) pushDetail(details, "KPIs saved", ctx.kpiCount);
    if (ctx.targetCount != null) pushDetail(details, "Targets saved", ctx.targetCount);
    return details;
  }

  if (source === "admin.users") {
    if (typeof ctx.userEmail === "string") pushDetail(details, "User", ctx.userEmail);
    if (typeof ctx.userRole === "string") {
      pushDetail(details, "Role assigned", roleLabel(ctx.userRole, customRoles));
    }

    const changes = ctx.changes;
    if (changes && typeof changes === "object") {
      for (const [field, value] of Object.entries(changes as Record<string, unknown>)) {
        const detail = formatChangeField(field, value, customRoles);
        if (detail) details.push(detail);
      }
    }
    return details;
  }

  if (source === "admin.access" || source === "admin.roles") {
    if (Array.isArray(ctx.updatedRoles)) {
      pushDetail(
        details,
        "Roles updated",
        ctx.updatedRoles.map((r) => roleLabel(r, customRoles)).join(", "),
      );
    }
    if (typeof ctx.label === "string") pushDetail(details, "Role name", ctx.label);
    if (typeof ctx.maintenanceMode === "boolean") {
      pushDetail(details, "Maintenance mode", ctx.maintenanceMode ? "Turned on" : "Turned off");
    }
    return details;
  }

  for (const [key, value] of Object.entries(ctx)) {
    if (key === "role" || value == null || typeof value === "object") continue;
    pushDetail(details, key.replace(/_/g, " "), value);
  }

  return details;
}

export function hasActivityDetails(row: DevLogEntry, customRoles: CustomRole[] = []): boolean {
  return getActivityDetails(row, customRoles).length > 0;
}
