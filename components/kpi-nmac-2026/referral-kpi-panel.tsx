"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { orderReferralStatusCards } from "@/lib/ardts/referral-display";
import type { ArdtsStatusCountsResponse } from "@/lib/ardts/types";
import { MONTHS } from "@/lib/kpi-nmac-2026/model";
import { MonthTabs } from "./nmac-master-entry-panel";
import { ReferralWorkstreamSections } from "./referral-workstream-sections";
import "./nk26.css";

type Props = {
  selectedYear: number;
  selectedMonth: number;
  onSelectMonth: (monthIndex: number) => void;
};

function buildMonthQuery(year: number, monthIndex: number): string {
  return new URLSearchParams({
    year: String(year),
    month: String(monthIndex + 1),
    item_type: "all",
    delivery_workstream: "all",
    operational_type: "all",
  }).toString();
}

export function ReferralKpiPanel({ selectedYear, selectedMonth, onSelectMonth }: Props) {
  const [data, setData] = useState<ArdtsStatusCountsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);

  const query = useMemo(
    () => buildMonthQuery(selectedYear, selectedMonth),
    [selectedYear, selectedMonth],
  );

  const loadPeriod = useCallback(async () => {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/referrals/status-counts?${query}`, {
        cache: "no-store",
        signal: controller.signal,
      });
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
      if (controller.signal.aborted) return;
      setData(null);
      setError(e instanceof Error ? e.message : "Could not load referral counts.");
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
        setLoading(false);
      }
    }
  }, [query]);

  const refresh = useCallback(() => {
    void loadPeriod();
  }, [loadPeriod]);

  useEffect(() => {
    void loadPeriod();
    return () => {
      const controller = requestControllerRef.current;
      requestControllerRef.current = null;
      controller?.abort();
    };
  }, [loadPeriod]);

  const periodLabel = useMemo(() => {
    if (data?.metadata?.period_label) {
      const tz = data.metadata.timezone.replace(/_/g, " ");
      return `Period: ${data.metadata.period_label} (${tz})`;
    }
    if (!data?.range) return null;
    const tz = data.range.timezone.replace(/_/g, " ");
    return `Period: ${data.range.from} to ${data.range.to} (${tz})`;
  }, [data]);

  const statusCards = useMemo(
    () => orderReferralStatusCards(data?.all_statuses_in_period?.cards ?? []),
    [data],
  );

  return (
    <div key="referrals-content" className="nk26-route-enter">
      <MonthTabs selectedMonth={selectedMonth} onSelect={onSelectMonth} />

      <div className="nk26-referral-actions">
        <button type="button" className="nk26-btn nk26-btn-sec" onClick={refresh}>
          Refresh
        </button>
        {fetchedAt ? (
          <p className="nk26-referral-period">
            As of {fetchedAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" })}
          </p>
        ) : null}
      </div>

      <div className="nk26-referral-meta">
        <p className="nk26-referral-note">
          All referral and diagnostic workstreams sent in {MONTHS[selectedMonth]} {selectedYear} by{" "}
          <strong>date sent</strong>. Counts, rates, and comparisons are calculated by ARDTS.
        </p>
        {periodLabel ? <p className="nk26-referral-period">{periodLabel}</p> : null}
      </div>

      {loading ? <p className="nk26-referral-status">Loading referral data from ARDTS…</p> : null}
      {error ? (
        <div className="nk26-referral-error" role="alert">
          {error}
        </div>
      ) : null}

      {!loading && !error && data ? (
        <>
          <div className="nk26-section-sub nk26-overview-more-intro">All statuses in period</div>
          <div className="nk26-stats nk26-referral-cards">
            {statusCards.map((card) => {
              return (
                <div
                  key={card.key}
                  className={"nk26-stat" + (card.key === "total" ? " nk26-referral-total" : "")}
                >
                  <div className="nk26-slab">{card.label}</div>
                  <div className="nk26-sval">{card.count}</div>
                  <div className="nk26-ssub">
                    {card.description ??
                      (card.key === "total" ? "All tracked referrals in period" : `${card.percent}% of period total`)}
                  </div>
                </div>
              );
            })}
          </div>

          <ReferralWorkstreamSections
            comparison={data.workstream_comparison}
            trends={data.workstream_trends}
            yearToDate={data.year_to_date}
            selectedMonth={selectedMonth}
          />
        </>
      ) : null}
    </div>
  );
}
