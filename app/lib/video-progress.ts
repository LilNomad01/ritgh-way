type PreviousVideoProgress = {
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
  updatedAt?: string | null;
} | null;

type VideoProgressEvent = {
  positionSeconds: number;
  durationSeconds: number;
  ended?: boolean;
};

export type ValidatedVideoProgress = {
  positionSeconds: number;
  durationSeconds: number;
  percentage: number;
  completed: boolean;
  status: "not_started" | "watching" | "completed";
};

const MAX_EVENT_ADVANCE_SECONDS = 12;
const CLOCK_TOLERANCE_SECONDS = 3;

export function validateVideoProgress(previous: PreviousVideoProgress, event: VideoProgressEvent, now: string | number | Date = new Date()): ValidatedVideoProgress {
  const reportedDuration = Math.max(1, Math.round(Number(event.durationSeconds) || 0));
  const durationSeconds = previous?.durationSeconds ? Math.max(previous.durationSeconds, reportedDuration) : reportedDuration;
  const reportedPosition = Math.max(0, Math.min(durationSeconds, Math.round(Number(event.positionSeconds) || 0)));
  const previousPosition = Math.max(0, Math.min(durationSeconds, previous?.positionSeconds ?? 0));

  if (previous?.completed) {
    return { positionSeconds: reportedPosition, durationSeconds, percentage: 100, completed: true, status: "completed" };
  }

  const elapsed = previous?.updatedAt
    ? Math.max(0, (new Date(now).getTime() - new Date(previous.updatedAt).getTime()) / 1000)
    : 5;
  const allowedAdvance = Math.min(MAX_EVENT_ADVANCE_SECONDS, Math.floor(elapsed) + CLOCK_TOLERANCE_SECONDS);
  const positionSeconds = Math.max(previousPosition, Math.min(reportedPosition, previousPosition + allowedAdvance));
  const reachedEndContinuously = Boolean(previous && event.ended && positionSeconds >= durationSeconds - 1 && previousPosition >= durationSeconds - MAX_EVENT_ADVANCE_SECONDS);
  const completed = reachedEndContinuously;
  const percentage = completed ? 100 : Math.min(99, Math.round((positionSeconds / durationSeconds) * 100));
  const status = completed ? "completed" : positionSeconds > 0 ? "watching" : "not_started";
  return { positionSeconds, durationSeconds, percentage, completed, status };
}
