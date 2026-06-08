"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  monthDateBounds,
  REFERRAL_RANGE_OPTIONS,
  REFERRAL_STATUS_CARDS,
  referralBookingRate,
  referralCountForCard,
  type ReferralRangeMode,
} from "@/lib/ardts/referral-display";
import type { ArdtsStatusCountsResponse } from "@/lib/ardts/types";
import { MONTHS } from "@/lib/kpi-nmac-2026/model";
import { MonthTabs } from "./nmac-master-entry-panel";
import "./nk26.css";

type Props = {
  selectedYear: number;
  selectedMonth: number;
  onSelectMonth: (monthIndex: number) => void;
};

function buildQuery(rangeMode: ReferralRangeMode, year: number, monthIndex: number): string {
  if (rangeMode === "month") {
    const { from, to } = monthDateBounds(year, monthIndex);
    return new URLSearchParams({ range: "custom", from, to }).toString();
  }
  return new URLSearchParams({ range: rangeMode }).toString();
}

export function ReferralKpiPanel({ selectedYear, selectedMonth, onSelectMonth }: Props) {
  const [rangeMode, setRangeMode] = useState<ReferralRangeMode>("month");
  const [data, setData] = useState<ArdtsStatusCountsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  const query = useMemo(
    () => buildQuery(rangeMode, selectedYear, selectedMonth),
    [rangeMode, selectedYear, selectedMonth],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/referrals/status-counts?${query}`, { cache: "no-store" });
      const body = (await res.json()) as ArdtsStatusCountsResponse | { error?: string };
      if (!res.ok) {
        throw new Error(
          typeof body === "object" && body && "error" in body && typeof body.error === "string"
            ? body.error
            : "Could not load referral counts.",
        );
      }
      setData(body as ArdtsStatusCountsResponse);
      setFetchedAt(new Date());
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Could not load referral counts.");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  const periodLabel = useMemo(() => {
    if (!data?.range) return null;
    const tz = data.range.timezone.replace(/_/g, " ");
    return `Period: ${data.range.from} to ${data.range.to} (${tz})`;
  }, [data]);

  const bookingRate = referralBookingRate(data?.total ?? 0, data?.counts.booked ?? 0);
  const backlog = (data?.counts.booking_pending ?? 0) + (data?.counts.need_help ?? 0);

  return (
    <div key="referrals-content" className="nk26-route-enter">
      <div className="nk26-referral-range-bar">
        {REFERRAL_RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={"nk26-tab" + (rangeMode === opt.id ? " nk26-tab-active" : "")}
            onClick={() => setRangeMode(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {rangeMode === "month" ? (
        <MonthTabs selectedMonth={selectedMonth} onSelect={onSelectMonth} />
      ) : null}

      <div className="nk26-referral-meta">
        <p className="nk26-referral-note">
          Counts are based on <strong>date sent</strong> during company business hours — activity in the
          selected period, not the live pipeline backlog in ARDTS.
        </p>
        {periodLabel ? <p className="nk26-referral-period">{periodLabel}</p> : null}
        {rangeMode === "month" ? (
          <p className="nk26-referral-period">
            Reporting month: {MONTHS[selectedMonth]} {selectedYear}
          </p>
        ) : null}
        {fetchedAt ? (
          <p className="nk26-referral-period">
            As of {fetchedAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" })}
          </p>
        ) : null}
      </div>

      {loading ? <p className="nk26-referral-status">Loading referral counts…</p> : null}
      {!loading && error ? (
        <div className="nk26-referral-error" role="alert">
          {error}
        </div>
      ) : null}

      {!loading && !error && data ? (
        <>
          <div className="nk26-referral-summary">
            <div className="nk26-stat">
              <div className="nk26-slab">Booking rate</div>
              <div className="nk26-sval">{bookingRate}</div>
              <div className="nk26-ssub">Booked ÷ total sent in period</div>
            </div>
            <div className="nk26-stat">
              <div className="nk26-slab">Needs action</div>
              <div className="nk26-sval">{backlog}</div>
              <div className="nk26-ssub">Booking pending + help needed</div>
            </div>
            {data.range.business_hours_applied ? (
              <div className="nk26-stat">
                <div className="nk26-slab">Business hours</div>
                <div className="nk26-sval" style={{ fontSize: "1.1rem" }}>
                  {data.range.company_hours.start_time}–{data.range.company_hours.end_time}
                </div>
                <div className="nk26-ssub">Weekdays only · {data.range.timezone.replace(/_/g, " ")}</div>
              </div>
            ) : null}
          </div>

          <div className="nk26-section-sub nk26-overview-more-intro">Referrals sent in period</div>
          <div className="nk26-stats nk26-referral-cards">
            {REFERRAL_STATUS_CARDS.map((card) => {
              const count = referralCountForCard(card.key, data.total, data.counts);
              const highlight = card.key === "total" || count > 0;
              return (
                <div
                  key={card.key}
                  className={"nk26-stat" + (highlight && card.key === "total" ? " nk26-referral-total" : "")}
                >
                  <div className="nk26-slab">{card.label}</div>
                  <div className="nk26-sval">{count}</div>
                  <div className="nk26-ssub">{card.sub}</div>
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
