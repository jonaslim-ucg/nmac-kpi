import type { SurveyOutreachStage } from "./types.ts";

export type TrackedBounceFailure = {
  graph_message_id: string;
  outreach_id: string | null;
  stage: SurveyOutreachStage | null;
};

export type TrackedPermanentSendFailure = {
  id: string;
  failed_stage: SurveyOutreachStage | null;
};

function outreachStageKey(outreachId: string | null, stage: SurveyOutreachStage | null): string | null {
  return outreachId && stage ? `${outreachId}:${stage}` : null;
}

/** Count every NDR plus permanent send failures that did not also produce an NDR. */
export function summarizeTrackedSurveyEmailFailures(
  bounces: readonly TrackedBounceFailure[],
  permanentFailures: readonly TrackedPermanentSendFailure[] = [],
) {
  const seenBounceMessages = new Set<string>();
  const bouncedStages = new Set<string>();

  for (const bounce of bounces) {
    seenBounceMessages.add(bounce.graph_message_id);
    const key = outreachStageKey(bounce.outreach_id, bounce.stage);
    if (key) bouncedStages.add(key);
  }

  const permanentKeys = new Set<string>();
  for (const failure of permanentFailures) {
    const key = outreachStageKey(failure.id, failure.failed_stage);
    if (key && !bouncedStages.has(key)) permanentKeys.add(key);
  }

  return {
    total: seenBounceMessages.size + permanentKeys.size,
    bounceReports: seenBounceMessages.size,
    permanentSendFailures: permanentKeys.size,
  };
}
