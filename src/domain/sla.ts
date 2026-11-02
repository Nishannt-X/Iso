// Response-time indicator for the inbox, computed from enquiries.created_at and, once there is one, the time of
// the first recorded staff reply.
//
// It measures elapsed clock time. The brief's "within an hour" goal is "in working hours", but it defines no working
// hours, so none are invented: night-time and weekends count. The two thresholds come from the brief (the one-hour
// goal, and the 12-hour delay its loss estimate is built on). This is a prompt for staff, not a promise to travellers.

export const TARGET_MINUTES = 60;
export const LATE_MINUTES = 12 * 60;

export type SlaState = 'within_target' | 'past_target' | 'late' | 'answered' | 'closed_unanswered';

export interface Sla {
  state: SlaState;
  /** Minutes the enquiry has waited, or waited before its first reply. Never negative. */
  elapsedMinutes: number;
  /** Short text for the inbox chip. */
  label: string;
  /** What the chip means, for the workspace and for screen readers. */
  detail: string;
}

/** "under 1 min", "12 min", "3 h 5 min", "2 days 4 h". */
export function formatElapsed(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  if (m < 1) return 'under 1 min';
  if (m < 60) return `${m} min`;
  if (m < 48 * 60) {
    const h = Math.floor(m / 60);
    return m % 60 === 0 ? `${h} h` : `${h} h ${m % 60} min`;
  }
  const days = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return h === 0 ? `${days} days` : `${days} days ${h} h`;
}

const minutesBetween = (fromIso: string, to: Date | string): number =>
  Math.max(0, Math.floor(((typeof to === 'string' ? Date.parse(to) : to.getTime()) - Date.parse(fromIso)) / 60_000));

export function slaFor(args: { createdAt: string; firstReplyAt: string | null; status: string; now: Date }): Sla {
  const { createdAt, firstReplyAt, status, now } = args;
  if (firstReplyAt) {
    const m = minutesBetween(createdAt, firstReplyAt);
    return {
      state: 'answered',
      elapsedMinutes: m,
      label: `First reply after ${formatElapsed(m)}`,
      detail: m <= TARGET_MINUTES ? 'The first reply was recorded within the 1-hour target.' : 'The first reply was recorded after the 1-hour target.',
    };
  }
  const m = minutesBetween(createdAt, now);
  if (status === 'closed') {
    return { state: 'closed_unanswered', elapsedMinutes: m, label: 'Closed, no reply recorded', detail: 'This enquiry was closed without a recorded reply.' };
  }
  if (m <= TARGET_MINUTES) {
    return { state: 'within_target', elapsedMinutes: m, label: `Waiting ${formatElapsed(m)}`, detail: 'Waiting for a first reply, within the 1-hour target.' };
  }
  if (m < LATE_MINUTES) {
    return { state: 'past_target', elapsedMinutes: m, label: `Waiting ${formatElapsed(m)}`, detail: 'Waiting for a first reply, past the 1-hour target.' };
  }
  return { state: 'late', elapsedMinutes: m, label: `Waiting ${formatElapsed(m)}`, detail: 'Waiting for a first reply for 12 hours or more.' };
}
