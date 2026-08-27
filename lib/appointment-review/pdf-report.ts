import { jsPDF } from "jspdf";
import type { AppointmentReviewDetail } from "./display.ts";
import {
  getAppointmentReviewAverageRating,
  getAppointmentReviewHandler,
} from "./filters.ts";
import { appointmentReviewActionStatusLabel } from "./management.ts";

type PdfColor = readonly [number, number, number];

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_Y = PAGE_HEIGHT - 30;
const CONTENT_BOTTOM = PAGE_HEIGHT - 52;
const TOC_ENTRIES_PER_PAGE = 34;
const CONTINUATION_ANSWER_START_Y = 131;

const NAVY: PdfColor = [7, 23, 51];
const TEAL: PdfColor = [8, 117, 125];
const BLUE: PdfColor = [42, 169, 224];
const GREEN: PdfColor = [141, 198, 64];
const PALE_TEAL: PdfColor = [232, 245, 246];
const PALE_BLUE: PdfColor = [242, 246, 252];
const BORDER: PdfColor = [216, 226, 240];
const MUTED: PdfColor = [91, 107, 128];
const WHITE: PdfColor = [255, 255, 255];

export type AppointmentReviewPdfReportInput = {
  reviews: AppointmentReviewDetail[];
  periodLabel: string;
  reportTitle?: string;
  filterSummary?: string[];
  sortLabel?: string;
  generatedAt?: Date;
  logoData?: Uint8Array | string | null;
  showPeriodInHeader?: boolean;
};

function setFill(doc: jsPDF, color: PdfColor): void {
  doc.setFillColor(color[0], color[1], color[2]);
}

function setDraw(doc: jsPDF, color: PdfColor): void {
  doc.setDrawColor(color[0], color[1], color[2]);
}

function setText(doc: jsPDF, color: PdfColor): void {
  doc.setTextColor(color[0], color[1], color[2]);
}

export function normalizePdfText(value: unknown): string {
  const source = String(value ?? "")
    .replaceAll("\u2018", "'")
    .replaceAll("\u2019", "'")
    .replaceAll("\u201c", '"')
    .replaceAll("\u201d", '"')
    .replaceAll("\u2013", "-")
    .replaceAll("\u2014", "-")
    .replaceAll("\u2022", "-")
    .replaceAll("\u00a0", " ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "")
    .replace(/\r\n?/g, "\n")
    .trim();
  return source || "Not provided";
}

function formatGeneratedAt(date: Date): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "Atlantic/Bermuda",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function formatSubmittedAt(value: string): string {
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "Atlantic/Bermuda",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date);
  } catch {
    return value;
  }
}

function formatPdfAppointmentDate(value: string | null | undefined): string {
  if (!value) return "Not available";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
  } catch {
    return value;
  }
}

function formatPdfAppointmentTime(value: string | null | undefined): string {
  if (!value) return "Not available";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not available";
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "Atlantic/Bermuda",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date);
  } catch {
    return "Not available";
  }
}

function formatPdfYesNo(value: boolean | null): string {
  return value === null ? "Not answered" : value ? "Yes" : "No";
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "selected-period";
}

export function appointmentReviewPdfFileName(periodLabel: string): string {
  return `nmac-survey-report-${slug(periodLabel)}.pdf`;
}

function splitLines(doc: jsPDF, value: unknown, width: number): string[] {
  const result = doc.splitTextToSize(normalizePdfText(value), width) as string[] | string;
  return Array.isArray(result) ? result : [result];
}

function average(values: Array<number | null | undefined>): number | null {
  const valid = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  if (valid.length === 0) return null;
  return Math.round((valid.reduce((sum, value) => sum + value, 0) / valid.length) * 10) / 10;
}

function rating(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value}/5` : "Not answered";
}

function joined(values: string[]): string {
  return values.map((value) => value.trim()).filter(Boolean).join(", ") || "Not provided";
}

function drawBrand(doc: jsPDF, logoData: AppointmentReviewPdfReportInput["logoData"], compact: boolean): void {
  const x = MARGIN;
  const y = compact ? 15 : 22;
  const width = compact ? 118 : 198;
  const height = width * (721 / 2000);
  if (logoData) {
    try {
      doc.addImage(logoData, "PNG", x, y, width, height, "nmac-report-logo", "FAST");
      return;
    } catch {
      // A readable text brand keeps the report usable if an image cannot be decoded.
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(compact ? 12 : 18);
  setText(doc, BLUE);
  doc.text("NORTHSHORE", x, y + (compact ? 18 : 27));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(compact ? 7 : 10);
  doc.text("MEDICAL & AESTHETICS CENTER", x, y + (compact ? 29 : 42));
}

function drawCompactPageHeader(
  doc: jsPDF,
  input: AppointmentReviewPdfReportInput,
  continuation?: string,
  contentsPage?: number,
): number {
  drawBrand(doc, input.logoData, true);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  setText(doc, NAVY);
  doc.text(normalizePdfText(input.reportTitle ?? "Provider Experience Survey Report"), PAGE_WIDTH - MARGIN, 28, {
    align: "right",
  });
  if (input.showPeriodInHeader !== false) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setText(doc, MUTED);
    doc.text(normalizePdfText(input.periodLabel), PAGE_WIDTH - MARGIN, 42, { align: "right" });
  }
  if (contentsPage) {
    const linkText = "Back to contents";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    setText(doc, TEAL);
    const linkWidth = doc.getTextWidth(linkText);
    const linkX = PAGE_WIDTH - MARGIN - linkWidth;
    doc.text(linkText, linkX, 57);
    doc.link(linkX, 47, linkWidth, 13, { pageNumber: contentsPage });
  }
  setDraw(doc, BORDER);
  doc.setLineWidth(0.8);
  doc.line(MARGIN, 65, PAGE_WIDTH - MARGIN, 65);
  if (continuation) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    setText(doc, TEAL);
    doc.text(normalizePdfText(continuation), MARGIN, 83);
    return 101;
  }
  return 84;
}

function drawSummaryCard(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
): void {
  setFill(doc, PALE_BLUE);
  setDraw(doc, BORDER);
  doc.roundedRect(x, y, width, 62, 5, 5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  setText(doc, NAVY);
  doc.text(normalizePdfText(value), x + 12, y + 27);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  setText(doc, MUTED);
  doc.text(normalizePdfText(label).toUpperCase(), x + 12, y + 47);
}

function drawRatingBar(doc: jsPDF, y: number, label: string, score: number | null): void {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  setText(doc, NAVY);
  doc.text(normalizePdfText(label), MARGIN, y);
  doc.setFont("helvetica", "bold");
  doc.text(score === null ? "N/A" : `${score.toFixed(1)}/5`, PAGE_WIDTH - MARGIN, y, { align: "right" });

  const trackX = 180;
  const trackY = y - 7;
  const trackWidth = PAGE_WIDTH - MARGIN - trackX - 45;
  setFill(doc, BORDER);
  doc.roundedRect(trackX, trackY, trackWidth, 6, 3, 3, "F");
  if (score !== null) {
    setFill(doc, score >= 4 ? GREEN : score >= 3 ? BLUE : TEAL);
    doc.roundedRect(trackX, trackY, Math.max(3, trackWidth * Math.min(1, score / 5)), 6, 3, 3, "F");
  }
}

function drawSummaryPage(doc: jsPDF, input: AppointmentReviewPdfReportInput): void {
  const reviews = input.reviews;
  const liveCount = reviews.filter((review) => !review.isTest).length;
  const testCount = reviews.length - liveCount;
  const writtenCount = reviews.filter((review) => review.hasComments).length;
  const averageRating = average(reviews.map(getAppointmentReviewAverageRating));
  const generatedAt = input.generatedAt ?? new Date();

  drawBrand(doc, input.logoData, false);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  setText(doc, TEAL);
  doc.text("CONFIDENTIAL - INTERNAL REPORT", PAGE_WIDTH - MARGIN, 34, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  setText(doc, MUTED);
  doc.text(`Generated ${normalizePdfText(formatGeneratedAt(generatedAt))}`, PAGE_WIDTH - MARGIN, 49, {
    align: "right",
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  setText(doc, NAVY);
  doc.text(normalizePdfText(input.reportTitle ?? "Provider Experience Survey Report"), MARGIN, 120);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  setText(doc, MUTED);
  doc.text(splitLines(doc, input.periodLabel, CONTENT_WIDTH), MARGIN, 141);
  setFill(doc, BLUE);
  doc.rect(MARGIN, 169, CONTENT_WIDTH * 0.68, 3, "F");
  setFill(doc, GREEN);
  doc.rect(MARGIN + CONTENT_WIDTH * 0.68, 169, CONTENT_WIDTH * 0.32, 3, "F");

  const gap = 9;
  const cardWidth = (CONTENT_WIDTH - gap * 3) / 4;
  drawSummaryCard(doc, MARGIN, 190, cardWidth, "Total responses", String(reviews.length));
  drawSummaryCard(doc, MARGIN + cardWidth + gap, 190, cardWidth, "Live responses", String(liveCount));
  drawSummaryCard(doc, MARGIN + (cardWidth + gap) * 2, 190, cardWidth, "Written responses", String(writtenCount));
  drawSummaryCard(
    doc,
    MARGIN + (cardWidth + gap) * 3,
    190,
    cardWidth,
    "Average rating",
    averageRating === null ? "N/A" : `${averageRating.toFixed(1)}/5`,
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  setText(doc, NAVY);
  doc.text("Report scope", MARGIN, 288);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  setText(doc, MUTED);
  const scope = [
    `Period: ${input.periodLabel}`,
    `Responses included: ${liveCount} live${testCount > 0 ? ` and ${testCount} test` : ""}`,
    `Sort order: ${input.sortLabel ?? "Submitted: newest"}`,
    `Filters: ${input.filterSummary?.length ? input.filterSummary.join("; ") : "No additional filters"}`,
  ];
  let scopeY = 307;
  for (const line of scope) {
    const wrapped = splitLines(doc, line, CONTENT_WIDTH);
    doc.text(wrapped, MARGIN, scopeY);
    scopeY += wrapped.length * 12 + 2;
  }

  const providerScores = reviews.flatMap((review) => review.providerRatings.map((item) => item.rating));
  const summaryRatings = [
    ["Scheduling ease", average(reviews.map((review) => review.appointmentEase))],
    ["Overall visit", average(reviews.map((review) => review.visitRating))],
    ["Provider rating", average(providerScores)],
    ["Health improvement", average(reviews.map((review) => review.healthRating))],
    ["Likelihood to recommend", average(reviews.map((review) => review.recommendationRating))],
    ["Front desk", average(reviews.map((review) => review.frontDeskRating))],
  ] as const;

  const ratingsStart = Math.max(397, scopeY + 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  setText(doc, NAVY);
  doc.text("Average ratings", MARGIN, ratingsStart);
  summaryRatings.forEach(([label, score], index) => {
    drawRatingBar(doc, ratingsStart + 26 + index * 29, label, score);
  });

  const noteY = ratingsStart + 226;
  setFill(doc, PALE_TEAL);
  doc.roundedRect(MARGIN, noteY, CONTENT_WIDTH, 62, 5, 5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  setText(doc, TEAL);
  doc.text("Detailed responses", MARGIN + 14, noteY + 21);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  setText(doc, NAVY);
  doc.text(
    splitLines(
      doc,
      "Use the patient directory to jump directly to any review. Each response is formatted as a one-page record whenever its written answers fit; longer answers continue without being clipped.",
      CONTENT_WIDTH - 28,
    ),
    MARGIN + 14,
    noteY + 39,
  );
}

function drawResponseTitle(
  doc: jsPDF,
  input: AppointmentReviewPdfReportInput,
  review: AppointmentReviewDetail,
  index: number,
  contentsPage?: number,
): number {
  const y = drawCompactPageHeader(doc, input, undefined, contentsPage);
  const nameLines = splitLines(doc, review.patientName, CONTENT_WIDTH - 150).slice(0, 2);
  const titleHeight = nameLines.length > 1 ? 62 : 50;
  setFill(doc, NAVY);
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, titleHeight, 5, 5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  setText(doc, WHITE);
  doc.text(
    nameLines,
    MARGIN + 15,
    y + (review.isTest ? 21 : nameLines.length > 1 ? 22 : 29),
  );
  if (review.isTest) {
    doc.setFontSize(9);
    setText(doc, GREEN);
    doc.text("TEST RESPONSE", MARGIN + 15, y + (nameLines.length > 1 ? 51 : 39));
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  setText(doc, WHITE);
  doc.text(
    input.reviews.length > 1
      ? `Response ${index + 1} of ${input.reviews.length}`
      : "Individual patient review",
    PAGE_WIDTH - MARGIN - 15,
    y + 25,
    { align: "right" },
  );
  return y + titleHeight + 12;
}

type MetadataItem = { label: string; value: string };

function drawMetadataGrid(
  doc: jsPDF,
  startY: number,
  items: MetadataItem[],
  startContinuationPage: () => number,
): number {
  const gap = 16;
  const columnWidth = (CONTENT_WIDTH - gap) / 2;
  let y = startY;
  for (let index = 0; index < items.length; index += 2) {
    const pair = items.slice(index, index + 2);
    const itemWidth = pair.length === 1 ? CONTENT_WIDTH : columnWidth;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const lineSets = pair.map((item) => splitLines(doc, item.value, itemWidth - 4));
    const rowHeight = Math.max(31, ...lineSets.map((lines) => 21.5 + lines.length * 9.5));
    if (y + rowHeight > CONTENT_BOTTOM) y = startContinuationPage();
    pair.forEach((item, pairIndex) => {
      const x = MARGIN + pairIndex * (columnWidth + gap);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.4);
      setText(doc, TEAL);
      doc.text(normalizePdfText(item.label).toUpperCase(), x, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      setText(doc, NAVY);
      doc.text(lineSets[pairIndex], x, y + 11);
      setDraw(doc, BORDER);
      doc.setLineWidth(0.35);
      doc.line(x, y + rowHeight - 10, x + itemWidth, y + rowHeight - 10);
    });
    y += rowHeight;
  }
  return y;
}

type AnswerItem = { label: string; value: string };

function responseAnswers(review: AppointmentReviewDetail): AnswerItem[] {
  const selectedProviderRatings = review.providerRatings
    .map(({ providerLabel, rating: providerScore }) => `${providerLabel}: ${rating(providerScore)}`)
    .join("; ");
  const healthAnswer = [rating(review.healthRating), review.healthImprovementComment]
    .filter(Boolean)
    .join("\n");
  const recommendationAnswer = [rating(review.recommendationRating), review.recommendationMessage]
    .filter(Boolean)
    .join("\n");
  const testimonialAnswer = review.testimonialText
    ? `${review.testimonialText}\nPermission: ${review.testimonialPermissionLabel}`
    : "No testimonial provided";
  const providerTimeAnswer = [formatPdfYesNo(review.providerTimeAdequate), review.providerTimeComment]
    .filter(Boolean)
    .join("\n");

  return [
    { label: "1. Ease of scheduling an appointment", value: rating(review.appointmentEase) },
    { label: "2. Overall visit with the practice", value: rating(review.visitRating) },
    { label: "3. Provider(s) selected by the patient", value: review.serviceTypeLabel },
    { label: "4. Provider rating(s)", value: selectedProviderRatings || rating(review.providerRating) },
    { label: "5. Improvement in overall health", value: healthAnswer },
    { label: "6. Likelihood to recommend NMAC", value: recommendationAnswer },
    { label: "7. Testimonial", value: testimonialAnswer },
    { label: "8. Wait time", value: review.waitTimeLabel },
    { label: "9. Provider spent enough time", value: providerTimeAnswer },
    { label: "10. Front desk rating", value: rating(review.frontDeskRating) },
    { label: "11. Time as an NMAC patient", value: review.patientDurationLabel },
    { label: "12. Referral source(s)", value: review.referralSourcesLabel ?? "Not applicable" },
    { label: "Exceptional staff response", value: review.exceptionalStaffComment || "Not provided" },
  ];
}

function drawSectionHeading(doc: jsPDF, y: number, title: string): number {
  setFill(doc, PALE_TEAL);
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 22, 4, 4, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  setText(doc, TEAL);
  doc.text(normalizePdfText(title), MARGIN + 10, y + 15);
  return y + 30;
}

type AnswerLayoutStyle = {
  labelFontSize: number;
  labelLineHeight: number;
  valueFontSize: number;
  valueLineHeight: number;
  blockGap: number;
};

type PreparedAnswer = AnswerItem & {
  labelLines: string[];
  valueLines: string[];
  height: number;
};

type PreparedAnswerRow = {
  items: PreparedAnswer[];
  height: number;
};

const ANSWER_STYLE_OPTIONS: AnswerLayoutStyle[] = [
  { labelFontSize: 7.2, labelLineHeight: 8.7, valueFontSize: 8.2, valueLineHeight: 9.8, blockGap: 7 },
  { labelFontSize: 6.9, labelLineHeight: 8.2, valueFontSize: 7.8, valueLineHeight: 9.2, blockGap: 6 },
  { labelFontSize: 6.6, labelLineHeight: 7.8, valueFontSize: 7.3, valueLineHeight: 8.6, blockGap: 5 },
];

function prepareAnswer(
  doc: jsPDF,
  answer: AnswerItem,
  width: number,
  style: AnswerLayoutStyle,
): PreparedAnswer {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(style.labelFontSize);
  const labelLines = splitLines(doc, answer.label, width);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(style.valueFontSize);
  const valueLines = splitLines(doc, answer.value, width);
  return {
    ...answer,
    labelLines,
    valueLines,
    height: labelLines.length * style.labelLineHeight
      + 2
      + valueLines.length * style.valueLineHeight
      + style.blockGap,
  };
}

function prepareAnswerRows(
  doc: jsPDF,
  answers: AnswerItem[],
  style: AnswerLayoutStyle,
): PreparedAnswerRow[] {
  const columnGap = 18;
  const columnWidth = (CONTENT_WIDTH - columnGap) / 2;
  const rows: PreparedAnswerRow[] = [];
  for (let index = 0; index < answers.length; index += 2) {
    const pair = answers.slice(index, index + 2);
    const cellWidth = pair.length === 1 ? CONTENT_WIDTH : columnWidth;
    const items = pair.map((answer) => prepareAnswer(doc, answer, cellWidth - 4, style));
    rows.push({ items, height: Math.max(...items.map((item) => item.height)) + 4 });
  }
  return rows;
}

function chooseAnswerStyle(
  doc: jsPDF,
  answers: AnswerItem[],
  availableHeight: number,
  managementNotes?: string,
): AnswerLayoutStyle {
  for (const style of ANSWER_STYLE_OPTIONS) {
    const rowsHeight = prepareAnswerRows(doc, answers, style)
      .reduce((sum, row) => sum + row.height, 0);
    const notesHeight = managementNotes
      ? 30 + prepareAnswer(
        doc,
        { label: "Staff-only follow-up notes", value: managementNotes },
        CONTENT_WIDTH - 4,
        style,
      ).height
      : 0;
    if (rowsHeight + notesHeight <= availableHeight) return style;
  }
  return ANSWER_STYLE_OPTIONS[ANSWER_STYLE_OPTIONS.length - 1];
}

function drawPreparedAnswer(
  doc: jsPDF,
  item: PreparedAnswer,
  x: number,
  y: number,
  style: AnswerLayoutStyle,
): void {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(style.labelFontSize);
  setText(doc, TEAL);
  doc.text(item.labelLines, x, y);
  const valueY = y + item.labelLines.length * style.labelLineHeight + 2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(style.valueFontSize);
  setText(doc, NAVY);
  doc.text(item.valueLines, x, valueY);
}

function drawPreparedAnswerRow(
  doc: jsPDF,
  row: PreparedAnswerRow,
  y: number,
  style: AnswerLayoutStyle,
): number {
  const columnGap = 18;
  const columnWidth = (CONTENT_WIDTH - columnGap) / 2;
  row.items.forEach((item, index) => {
    const x = row.items.length === 1
      ? MARGIN
      : MARGIN + index * (columnWidth + columnGap);
    drawPreparedAnswer(doc, item, x, y, style);
  });
  setDraw(doc, BORDER);
  doc.setLineWidth(0.35);
  doc.line(MARGIN, y + row.height - 3, PAGE_WIDTH - MARGIN, y + row.height - 3);
  return y + row.height;
}

function drawPaginatedAnswer(
  doc: jsPDF,
  answer: AnswerItem,
  startY: number,
  style: AnswerLayoutStyle,
  startContinuationPage: () => number,
): number {
  let y = startY;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(style.labelFontSize);
  const labelLines = splitLines(doc, answer.label, CONTENT_WIDTH - 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(style.valueFontSize);
  const valueLines = splitLines(doc, answer.value, CONTENT_WIDTH - 4);
  let valueIndex = 0;
  let continued = false;

  while (valueIndex < valueLines.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(style.labelFontSize);
    const activeLabel = continued
      ? splitLines(doc, `${answer.label} (continued)`, CONTENT_WIDTH - 4)
      : labelLines;
    const labelHeight = activeLabel.length * style.labelLineHeight + 2;
    if (y + labelHeight + style.valueLineHeight > CONTENT_BOTTOM) {
      y = startContinuationPage();
      continued = valueIndex > 0;
      continue;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(style.labelFontSize);
    setText(doc, TEAL);
    doc.text(activeLabel, MARGIN, y);
    y += labelHeight;

    const availableLines = Math.max(
      1,
      Math.floor((CONTENT_BOTTOM - y - style.blockGap) / style.valueLineHeight),
    );
    const chunk = valueLines.slice(valueIndex, valueIndex + availableLines);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(style.valueFontSize);
    setText(doc, NAVY);
    doc.text(chunk, MARGIN, y);
    y += chunk.length * style.valueLineHeight;
    valueIndex += chunk.length;

    if (valueIndex < valueLines.length) {
      y = startContinuationPage();
      continued = true;
    }
  }

  setDraw(doc, BORDER);
  doc.setLineWidth(0.35);
  doc.line(MARGIN, y + style.blockGap - 3, PAGE_WIDTH - MARGIN, y + style.blockGap - 3);
  return y + style.blockGap;
}

type ReviewPageEntry = {
  review: AppointmentReviewDetail;
  responseIndex: number;
  pageNumber: number;
};

function fitSingleLine(doc: jsPDF, value: string, maxWidth: number): string {
  const normalized = normalizePdfText(value);
  if (doc.getTextWidth(normalized) <= maxWidth) return normalized;
  let shortened = normalized;
  while (shortened.length > 1 && doc.getTextWidth(`${shortened}...`) > maxWidth) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened.trimEnd()}...`;
}

function drawContentsPages(
  doc: jsPDF,
  input: AppointmentReviewPdfReportInput,
  entries: ReviewPageEntry[],
  pageCount: number,
): void {
  const sortedEntries = [...entries].sort((first, second) => (
    first.review.patientName.localeCompare(second.review.patientName, "en", { sensitivity: "base" })
    || (first.review.appointmentDate ?? "").localeCompare(second.review.appointmentDate ?? "")
    || first.responseIndex - second.responseIndex
  ));

  for (let tocIndex = 0; tocIndex < pageCount; tocIndex += 1) {
    const pageNumber = 2 + tocIndex;
    doc.setPage(pageNumber);
    const headerY = drawCompactPageHeader(doc, input);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    setText(doc, NAVY);
    doc.text("Patient review directory", MARGIN, headerY + 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    setText(doc, MUTED);
    doc.text(
      `Select a patient name to open their review. Contents ${tocIndex + 1} of ${pageCount}.`,
      MARGIN,
      headerY + 29,
    );

    const tableY = headerY + 53;
    setFill(doc, NAVY);
    doc.roundedRect(MARGIN, tableY - 15, CONTENT_WIDTH, 22, 3, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    setText(doc, WHITE);
    doc.text("PATIENT", MARGIN + 9, tableY);
    doc.text("APPOINTMENT", PAGE_WIDTH - MARGIN - 115, tableY);
    doc.text("PAGE", PAGE_WIDTH - MARGIN - 9, tableY, { align: "right" });

    const pageEntries = sortedEntries.slice(
      tocIndex * TOC_ENTRIES_PER_PAGE,
      (tocIndex + 1) * TOC_ENTRIES_PER_PAGE,
    );
    let y = tableY + 22;
    if (pageEntries.length === 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      setText(doc, MUTED);
      doc.text("No patient reviews match the selected report filters.", MARGIN, y);
      continue;
    }

    for (const entry of pageEntries) {
      const rowTop = y - 11;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.2);
      setText(doc, NAVY);
      doc.text(fitSingleLine(doc, entry.review.patientName, CONTENT_WIDTH - 190), MARGIN + 9, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      setText(doc, MUTED);
      doc.text(
        formatPdfAppointmentDate(entry.review.appointmentDate),
        PAGE_WIDTH - MARGIN - 115,
        y,
      );
      doc.setFont("helvetica", "bold");
      setText(doc, TEAL);
      doc.text(String(entry.pageNumber), PAGE_WIDTH - MARGIN - 9, y, { align: "right" });
      doc.link(MARGIN, rowTop, CONTENT_WIDTH, 16, { pageNumber: entry.pageNumber });
      setDraw(doc, BORDER);
      doc.setLineWidth(0.3);
      doc.line(MARGIN, y + 7, PAGE_WIDTH - MARGIN, y + 7);
      y += 18;
    }
  }
}

function drawResponsePages(
  doc: jsPDF,
  input: AppointmentReviewPdfReportInput,
  review: AppointmentReviewDetail,
  index: number,
  options: { addInitialPage?: boolean; contentsPage?: number } = {},
): number {
  if (options.addInitialPage !== false) doc.addPage();
  const startPage = doc.getNumberOfPages();
  let y = drawResponseTitle(doc, input, review, index, options.contentsPage);
  const continuationLabel = `${review.patientName} - response continued`;
  const startContinuationPage = () => {
    doc.addPage();
    return drawCompactPageHeader(doc, input, continuationLabel, options.contentsPage);
  };
  const startAnswerContinuationPage = () => (
    drawSectionHeading(doc, startContinuationPage(), "Survey answers continued")
  );
  const management = review.feedbackManagement;
  const metadata: MetadataItem[] = [
    { label: "Submitted", value: formatSubmittedAt(review.createdAt) },
    {
      label: "Appointment",
      value: `${formatPdfAppointmentDate(review.appointmentDate)} | ${formatPdfAppointmentTime(review.appointmentAt)}`,
    },
    { label: "Email", value: review.email },
    { label: "Handler", value: getAppointmentReviewHandler(review) },
    { label: "Appointment provider(s)", value: joined(review.appointmentProviderNames) },
    { label: "Visit type(s)", value: joined(review.appointmentVisitTypes) },
    {
      label: "Handling resolution",
      value: management ? appointmentReviewActionStatusLabel(management.status) : "Needs review",
    },
  ];
  y = drawMetadataGrid(doc, y, metadata, startContinuationPage);
  y = drawSectionHeading(doc, y + 2, "Survey answers");

  const answers = responseAnswers(review);
  const style = chooseAnswerStyle(
    doc,
    answers,
    CONTENT_BOTTOM - y,
    management?.notes,
  );
  const rows = prepareAnswerRows(doc, answers, style);
  let singleColumn = false;

  for (const row of rows) {
    if (singleColumn) {
      for (const answer of row.items) {
        y = drawPaginatedAnswer(doc, answer, y, style, startAnswerContinuationPage);
      }
      continue;
    }

    if (y + row.height <= CONTENT_BOTTOM) {
      y = drawPreparedAnswerRow(doc, row, y, style);
      continue;
    }

    if (row.height <= CONTENT_BOTTOM - CONTINUATION_ANSWER_START_Y) {
      y = startAnswerContinuationPage();
      y = drawPreparedAnswerRow(doc, row, y, style);
      continue;
    }

    singleColumn = true;
    for (const answer of row.items) {
      y = drawPaginatedAnswer(doc, answer, y, style, startAnswerContinuationPage);
    }
  }

  if (management?.notes) {
    const notesAnswer = {
      label: "Staff-only follow-up notes",
      value: management.notes,
    };
    const notesHeight = prepareAnswer(doc, notesAnswer, CONTENT_WIDTH - 4, style).height;
    if (y + 30 + notesHeight > CONTENT_BOTTOM) {
      y = drawSectionHeading(doc, startContinuationPage(), "Internal handling notes");
    } else {
      y = drawSectionHeading(doc, y + 2, "Internal handling notes");
    }
    const startNotesContinuationPage = () => (
      drawSectionHeading(doc, startContinuationPage(), "Internal handling notes continued")
    );
    y = drawPaginatedAnswer(doc, notesAnswer, y, style, startNotesContinuationPage);
  }

  return startPage;
}

function addPageFooters(doc: jsPDF): void {
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    setDraw(doc, BORDER);
    doc.setLineWidth(0.6);
    doc.line(MARGIN, FOOTER_Y - 12, PAGE_WIDTH - MARGIN, FOOTER_Y - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    setText(doc, MUTED);
    doc.text("Confidential - Internal NMAC use only", MARGIN, FOOTER_Y);
    doc.text(`Page ${page} of ${pageCount}`, PAGE_WIDTH - MARGIN, FOOTER_Y, { align: "right" });
  }
}

function createPdfDocument(): jsPDF {
  return new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
    compress: true,
    putOnlyUsedFonts: true,
  });
}

function setDocumentProperties(
  doc: jsPDF,
  title: string,
  subject: string,
): void {
  doc.setDocumentProperties({
    title: normalizePdfText(title),
    subject: normalizePdfText(subject),
    author: "Northshore Medical & Aesthetics Center",
    creator: "NMAC KPI",
  });
}

export function buildAppointmentReviewPdf(input: AppointmentReviewPdfReportInput): jsPDF {
  const doc = createPdfDocument();
  setDocumentProperties(
    doc,
    input.reportTitle ?? "NMAC Provider Experience Survey Report",
    `Survey responses for ${input.periodLabel}`,
  );
  drawSummaryPage(doc, input);
  const contentsPageCount = Math.max(
    1,
    Math.ceil(input.reviews.length / TOC_ENTRIES_PER_PAGE),
  );
  for (let page = 0; page < contentsPageCount; page += 1) doc.addPage();

  const entries = input.reviews.map((review, index) => ({
    review,
    responseIndex: index,
    pageNumber: drawResponsePages(doc, input, review, index, { contentsPage: 2 }),
  }));
  drawContentsPages(doc, input, entries, contentsPageCount);
  addPageFooters(doc);
  return doc;
}

export type AppointmentReviewSinglePdfOptions = {
  generatedAt?: Date;
  logoData?: Uint8Array | string | null;
};

export function singleAppointmentReviewPdfFileName(review: AppointmentReviewDetail): string {
  const appointmentDate = review.appointmentDate?.slice(0, 10)
    || review.createdAt.slice(0, 10)
    || "undated";
  return `nmac-survey-review-${slug(review.patientName)}-${slug(appointmentDate)}.pdf`;
}

export function buildSingleAppointmentReviewPdf(
  review: AppointmentReviewDetail,
  options: AppointmentReviewSinglePdfOptions = {},
): jsPDF {
  const input: AppointmentReviewPdfReportInput = {
    reviews: [review],
    periodLabel: formatPdfAppointmentDate(review.appointmentDate),
    reportTitle: "Patient Survey Review",
    generatedAt: options.generatedAt,
    logoData: options.logoData,
    showPeriodInHeader: false,
  };
  const doc = createPdfDocument();
  setDocumentProperties(
    doc,
    `${review.patientName} - Patient Survey Review`,
    `Patient survey response submitted ${formatSubmittedAt(review.createdAt)}`,
  );
  drawResponsePages(doc, input, review, 0, { addInitialPage: false });
  addPageFooters(doc);
  return doc;
}

async function loadReportLogo(): Promise<Uint8Array | null> {
  try {
    const response = await fetch("/nmac-email-logo.png", { cache: "force-cache" });
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

export async function downloadAppointmentReviewPdf(
  input: Omit<AppointmentReviewPdfReportInput, "logoData">,
): Promise<void> {
  const logoData = await loadReportLogo();
  const doc = buildAppointmentReviewPdf({ ...input, logoData });
  doc.save(appointmentReviewPdfFileName(input.periodLabel));
}

export async function downloadSingleAppointmentReviewPdf(
  review: AppointmentReviewDetail,
): Promise<void> {
  const logoData = await loadReportLogo();
  const doc = buildSingleAppointmentReviewPdf(review, { logoData });
  doc.save(singleAppointmentReviewPdfFileName(review));
}
