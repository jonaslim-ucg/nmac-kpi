export const SURVEY_MONTHLY_REPORT_TIME_ZONE = "Atlantic/Bermuda" as const;

export type SurveyMonthlyReportRecipient = {
  id: string;
  name: string;
  title: string;
  department: string;
  email: string;
  enabled: boolean;
};

export type SurveyMonthlyReportConfig = {
  enabled: boolean;
  dayOfMonth: number;
  sendTime: string;
  timezone: typeof SURVEY_MONTHLY_REPORT_TIME_ZONE;
  recipients: SurveyMonthlyReportRecipient[];
};

export type SurveyMonthlyReportPeriod = {
  periodKey: string;
  label: string;
  dateStart: string;
  dateEnd: string;
  scheduledAt: string;
  due: boolean;
};

export const DEFAULT_SURVEY_MONTHLY_REPORT_RECIPIENTS: SurveyMonthlyReportRecipient[] = [
  {
    id: "sarah-wilkerson",
    name: "Sarah Wilkerson",
    title: "Claims and Billing Manager",
    department: "Claims and Billing Department",
    email: "",
    enabled: true,
  },
  {
    id: "dwayne-simpson",
    name: "Dwayne Simpson",
    title: "Medical Laboratory Manager",
    department: "Northshore Medical Laboratory",
    email: "",
    enabled: true,
  },
  {
    id: "vonettea-rowe",
    name: "Vonettea Rowe",
    title: "Practice Manager",
    department: "NMAC",
    email: "",
    enabled: true,
  },
  {
    id: "kennette-burgess",
    name: "Kennette Burgess",
    title: "Marketing Manager",
    department: "Group Marketing",
    email: "",
    enabled: true,
  },
  {
    id: "claudette-govender",
    name: "Claudette Govender",
    title: "Group HR Manager",
    department: "Group Human Resource Manager",
    email: "",
    enabled: true,
  },
  {
    id: "simon-coombes",
    name: "Simon Coombes",
    title: "Acting Group CFO",
    department: "Group Finance Department",
    email: "",
    enabled: true,
  },
  {
    id: "tonya-macphee",
    name: "Tonya MacPhee",
    title: "Business Development Manager",
    department: "UCG BDA",
    email: "",
    enabled: true,
  },
];

export const DEFAULT_SURVEY_MONTHLY_REPORT_CONFIG: SurveyMonthlyReportConfig = {
  enabled: false,
  dayOfMonth: 1,
  sendTime: "08:00",
  timezone: SURVEY_MONTHLY_REPORT_TIME_ZONE,
  recipients: DEFAULT_SURVEY_MONTHLY_REPORT_RECIPIENTS,
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function recipientId(value: unknown, name: string, index: number): string {
  const explicit = clean(value).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
  if (explicit) return explicit.slice(0, 80);
  const fromName = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return (fromName || `manager-${index + 1}`).slice(0, 80);
}

export function normalizeSurveyMonthlyReportConfig(input: unknown): SurveyMonthlyReportConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      ...DEFAULT_SURVEY_MONTHLY_REPORT_CONFIG,
      recipients: DEFAULT_SURVEY_MONTHLY_REPORT_RECIPIENTS.map((recipient) => ({ ...recipient })),
    };
  }

  const value = input as Record<string, unknown>;
  const rawRecipients = Array.isArray(value.recipients)
    ? value.recipients.slice(0, 50)
    : DEFAULT_SURVEY_MONTHLY_REPORT_RECIPIENTS;
  const usedIds = new Set<string>();
  const recipients = rawRecipients.flatMap((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const raw = item as Record<string, unknown>;
    const name = clean(raw.name).slice(0, 120);
    const baseId = recipientId(raw.id, name, index);
    let id = baseId;
    for (let suffix = 2; usedIds.has(id); suffix += 1) id = `${baseId}-${suffix}`;
    usedIds.add(id);
    return [{
      id,
      name,
      title: clean(raw.title).slice(0, 160),
      department: clean(raw.department).slice(0, 160),
      email: clean(raw.email).toLowerCase().slice(0, 254),
      enabled: raw.enabled !== false,
    }];
  });

  const dayOfMonth = Number(value.dayOfMonth);
  const sendTime = clean(value.sendTime);
  return {
    enabled: value.enabled === true,
    dayOfMonth: Number.isInteger(dayOfMonth) && dayOfMonth >= 1 && dayOfMonth <= 28
      ? dayOfMonth
      : DEFAULT_SURVEY_MONTHLY_REPORT_CONFIG.dayOfMonth,
    sendTime: TIME_PATTERN.test(sendTime)
      ? sendTime
      : DEFAULT_SURVEY_MONTHLY_REPORT_CONFIG.sendTime,
    timezone: SURVEY_MONTHLY_REPORT_TIME_ZONE,
    recipients,
  };
}

export function validateSurveyMonthlyReportConfig(config: SurveyMonthlyReportConfig): string | null {
  if (!Number.isInteger(config.dayOfMonth) || config.dayOfMonth < 1 || config.dayOfMonth > 28) {
    return "Send day must be between 1 and 28.";
  }
  if (!TIME_PATTERN.test(config.sendTime)) return "Choose a valid monthly report time.";
  if (config.recipients.length > 50) return "Monthly reports support up to 50 recipients.";

  const enabled = config.recipients.filter((recipient) => recipient.enabled);
  const emails = new Set<string>();
  for (const recipient of config.recipients) {
    if (!recipient.name) return "Every manager needs a name.";
    if (!recipient.enabled) continue;
    if (!recipient.email && !config.enabled) continue;
    if (!EMAIL_PATTERN.test(recipient.email)) {
      return `Enter a valid email for ${recipient.name}.`;
    }
    if (emails.has(recipient.email)) return `Duplicate recipient email: ${recipient.email}.`;
    emails.add(recipient.email);
  }
  if (config.enabled && enabled.length === 0) {
    return "Add at least one enabled recipient before turning on monthly reports.";
  }
  return null;
}

function clinicParts(now: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SURVEY_MONTHLY_REPORT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

function calendarDate(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function bermudaInstant(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wallClock = Date.UTC(year, month - 1, day, hour, minute);
  let instant = new Date(wallClock);
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const represented = clinicParts(instant);
    const representedUtc = Date.UTC(
      represented.year,
      represented.month - 1,
      represented.day,
      represented.hour,
      represented.minute,
    );
    instant = new Date(instant.getTime() + wallClock - representedUtc);
  }
  return instant;
}

export function surveyMonthlyReportPeriod(
  configInput: SurveyMonthlyReportConfig,
  now = new Date(),
): SurveyMonthlyReportPeriod {
  const config = normalizeSurveyMonthlyReportConfig(configInput);
  const clinic = clinicParts(now);
  const previousMonth = new Date(Date.UTC(clinic.year, clinic.month - 2, 1));
  const periodYear = previousMonth.getUTCFullYear();
  const periodMonthIndex = previousMonth.getUTCMonth();
  const dateStart = calendarDate(periodYear, periodMonthIndex, 1);
  const lastDay = new Date(Date.UTC(periodYear, periodMonthIndex + 1, 0)).getUTCDate();
  const dateEnd = calendarDate(periodYear, periodMonthIndex, lastDay);
  const scheduledDate = calendarDate(clinic.year, clinic.month - 1, config.dayOfMonth);
  const scheduledAt = bermudaInstant(scheduledDate, config.sendTime);
  const label = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(previousMonth);

  return {
    periodKey: `${periodYear}-${String(periodMonthIndex + 1).padStart(2, "0")}`,
    label,
    dateStart,
    dateEnd,
    scheduledAt: scheduledAt.toISOString(),
    due: now.getTime() >= scheduledAt.getTime(),
  };
}
