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
): number {
  drawBrand(doc, input.logoData, true);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  setText(doc, NAVY);
  doc.text(normalizePdfText(input.reportTitle ?? "Provider Experience Survey Report"), PAGE_WIDTH - MARGIN, 28, {
    align: "right",
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  setText(doc, MUTED);
  doc.text(normalizePdfText(input.periodLabel), PAGE_WIDTH - MARGIN, 42, { align: "right" });
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
      "Each patient response begins on a separate page. Long written answers continue on the next page without being clipped.",
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
): number {
  const y = drawCompactPageHeader(doc, input);
  const nameLines = splitLines(doc, review.patientName, CONTENT_WIDTH - 150).slice(0, 2);
  const titleHeight = nameLines.length > 1 ? 74 : 58;
  setFill(doc, NAVY);
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, titleHeight, 5, 5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  setText(doc, WHITE);
  doc.text(nameLines, MARGIN + 15, y + 24);
  doc.setFontSize(9);
  setText(doc, review.isTest ? GREEN : BLUE);
  doc.text(
    review.isTest ? "TEST RESPONSE" : "LIVE RESPONSE",
    MARGIN + 15,
    y + (nameLines.length > 1 ? 61 : 45),
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  setText(doc, WHITE);
  doc.text(`Response ${index + 1} of ${input.reviews.length}`, PAGE_WIDTH - MARGIN - 15, y + 28, {
    align: "right",
  });
  return y + titleHeight + 20;
}

type MetadataItem = { label: string; value: string };

function drawMetadataGrid(
  doc: jsPDF,
  startY: number,
  items: MetadataItem[],
  startContinuationPage: () => number,
): number {
  const gap = 18;
  const columnWidth = (CONTENT_WIDTH - gap) / 2;
  let y = startY;
  for (let index = 0; index < items.length; index += 2) {
    const pair = items.slice(index, index + 2);
    const lineSets = pair.map((item) => splitLines(doc, item.value, columnWidth - 4));
    const rowHeight = Math.max(35, ...lineSets.map((lines) => 17 + lines.length * 12));
    if (y + rowHeight > CONTENT_BOTTOM) y = startContinuationPage();
    pair.forEach((item, pairIndex) => {
      const x = MARGIN + pairIndex * (columnWidth + gap);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      setText(doc, TEAL);
      doc.text(normalizePdfText(item.label).toUpperCase(), x, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      setText(doc, NAVY);
      doc.text(lineSets[pairIndex], x, y + 14);
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
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 28, 4, 4, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  setText(doc, TEAL);
  doc.text(normalizePdfText(title), MARGIN + 11, y + 18);
  return y + 42;
}

function drawResponsePages(
  doc: jsPDF,
  input: AppointmentReviewPdfReportInput,
  review: AppointmentReviewDetail,
  index: number,
): void {
  doc.addPage();
  let y = drawResponseTitle(doc, input, review, index);
  const continuationLabel = `${review.patientName} - response continued`;
  const startContinuationPage = () => {
    doc.addPage();
    return drawCompactPageHeader(doc, input, continuationLabel);
  };
  const management = review.feedbackManagement;
  const metadata: MetadataItem[] = [
    { label: "Submitted", value: formatSubmittedAt(review.createdAt) },
    {
      label: "Appointment",
      value: `${formatPdfAppointmentDate(review.appointmentDate)} | ${formatPdfAppointmentTime(review.appointmentAt)}`,
    },
    { label: "Email", value: review.email },
    { label: "Response type", value: review.isTest ? "Test response" : "Live response" },
    { label: "Appointment provider(s)", value: joined(review.appointmentProviderNames) },
    { label: "Visit type(s)", value: joined(review.appointmentVisitTypes) },
    { label: "Handler", value: getAppointmentReviewHandler(review) },
    {
      label: "Handling resolution",
      value: management ? appointmentReviewActionStatusLabel(management.status) : "Needs review",
    },
  ];
  y = drawMetadataGrid(doc, y, metadata, startContinuationPage);
  y = drawSectionHeading(doc, y + 2, "Survey answers");

  const addContinuationPage = () => {
    y = startContinuationPage();
  };

  for (const answer of responseAnswers(review)) {
    if (y + 35 > CONTENT_BOTTOM) addContinuationPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    setText(doc, TEAL);
    doc.text(normalizePdfText(answer.label), MARGIN, y);
    y += 14;

    const lines = splitLines(doc, answer.value, CONTENT_WIDTH);
    let lineIndex = 0;
    while (lineIndex < lines.length) {
      const availableLines = Math.max(0, Math.floor((CONTENT_BOTTOM - y - 9) / 12));
      if (availableLines === 0) {
        addContinuationPage();
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        setText(doc, TEAL);
        doc.text(`${normalizePdfText(answer.label)} (continued)`, MARGIN, y);
        y += 14;
        continue;
      }
      const chunk = lines.slice(lineIndex, lineIndex + availableLines);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      setText(doc, NAVY);
      doc.text(chunk, MARGIN, y);
      y += chunk.length * 12;
      lineIndex += chunk.length;
      if (lineIndex < lines.length) addContinuationPage();
    }
    setDraw(doc, BORDER);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y + 6, PAGE_WIDTH - MARGIN, y + 6);
    y += 19;
  }

  if (management?.notes) {
    if (y + 75 > CONTENT_BOTTOM) addContinuationPage();
    y = drawSectionHeading(doc, y + 2, "Internal handling notes");
    const noteLines = splitLines(doc, management.notes, CONTENT_WIDTH);
    let lineIndex = 0;
    while (lineIndex < noteLines.length) {
      const availableLines = Math.max(0, Math.floor((CONTENT_BOTTOM - y) / 12));
      if (availableLines === 0) {
        addContinuationPage();
        continue;
      }
      const chunk = noteLines.slice(lineIndex, lineIndex + availableLines);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      setText(doc, NAVY);
      doc.text(chunk, MARGIN, y);
      y += chunk.length * 12;
      lineIndex += chunk.length;
      if (lineIndex < noteLines.length) addContinuationPage();
    }
  }
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

export function buildAppointmentReviewPdf(input: AppointmentReviewPdfReportInput): jsPDF {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
    compress: true,
    putOnlyUsedFonts: true,
  });
  doc.setDocumentProperties({
    title: normalizePdfText(input.reportTitle ?? "NMAC Provider Experience Survey Report"),
    subject: normalizePdfText(`Survey responses for ${input.periodLabel}`),
    author: "Northshore Medical & Aesthetics Center",
    creator: "NMAC KPI",
  });
  drawSummaryPage(doc, input);
  input.reviews.forEach((review, index) => drawResponsePages(doc, input, review, index));
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
