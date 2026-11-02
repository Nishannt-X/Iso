// Season ranges are MM-DD, inclusive, and may wrap past Dec 31 (e.g. 10-01..03-31).
// All maths uses day-of-year ordinals in the leap year 2000, so 02-29 is always representable
// and no timezone-dependent Date parsing is involved.

export interface Season {
  name: string;
  startMd: string;
  endMd: string;
  pricePpTwinInr: number;
  /** True when the date range is an assumption of this build, not a fact from the brief. */
  rangeAssumed: boolean;
}

const MONTH_DAYS_LEAP = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MD_PATTERN = /^(\d{2})-(\d{2})$/;
export const DAYS_IN_YEAR = 366;

/** Day-of-year (1..366) for a valid MM-DD, or null. */
export function mdOrdinal(md: string): number | null {
  const m = MD_PATTERN.exec(md);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > MONTH_DAYS_LEAP[month - 1]) return null;
  return MONTH_DAYS_LEAP.slice(0, month - 1).reduce((a, b) => a + b, 0) + day;
}

/** Ordinal of an ISO date (YYYY-MM-DD) ignoring the year, or null if malformed. */
export function isoOrdinal(isoDate: string): number | null {
  const m = /^\d{4}-(\d{2}-\d{2})$/.exec(isoDate);
  if (!m) return null;
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== isoDate) return null;
  return mdOrdinal(m[1]);
}

function covers(season: Season, ordinal: number): boolean {
  const start = mdOrdinal(season.startMd);
  const end = mdOrdinal(season.endMd);
  if (start === null || end === null) return false;
  return start <= end ? ordinal >= start && ordinal <= end : ordinal >= start || ordinal <= end;
}

/** Index of the season covering the ordinal, or -1. Seasons are assumed non-overlapping. */
function seasonIndexAt(seasons: readonly Season[], ordinal: number): number {
  return seasons.findIndex((s) => covers(s, ordinal));
}

/** Human-readable problems with a season set: bad MM-DD, bad price, overlaps (incl. wrap-around). */
export function validateSeasons(seasons: readonly Season[]): string[] {
  const issues: string[] = [];
  if (seasons.length === 0) issues.push('at least one season is required');
  const owner = new Map<number, string>();
  for (const s of seasons) {
    const label = s.name || '(unnamed season)';
    if (mdOrdinal(s.startMd) === null) issues.push(`${label}: start "${s.startMd}" is not a valid MM-DD date`);
    if (mdOrdinal(s.endMd) === null) issues.push(`${label}: end "${s.endMd}" is not a valid MM-DD date`);
    if (!Number.isInteger(s.pricePpTwinInr) || s.pricePpTwinInr <= 0) {
      issues.push(`${label}: price must be a positive whole number of rupees`);
    }
    if (mdOrdinal(s.startMd) === null || mdOrdinal(s.endMd) === null) continue;
    for (let d = 1; d <= DAYS_IN_YEAR; d++) {
      if (!covers(s, d)) continue;
      const other = owner.get(d);
      if (other !== undefined && other !== label) {
        const pair = [other, label].sort().join('" and "');
        const msg = `seasons "${pair}" overlap`;
        if (!issues.includes(msg)) issues.push(msg);
      } else {
        owner.set(d, label);
      }
    }
  }
  return issues;
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type SeasonResolution =
  | { kind: 'single'; season: Season }
  /** Dates fall in more than one season, or partly outside every season. `candidates` are the covered seasons. */
  | { kind: 'ambiguous'; reason: 'ambiguous_month' | 'season_straddle'; candidates: Season[] }
  | { kind: 'none'; reason: 'no_season_for_date' };

function resolve(
  seasons: readonly Season[],
  ordinals: number[],
  ambiguousReason: 'ambiguous_month' | 'season_straddle',
): SeasonResolution {
  const hits = ordinals.map((o) => seasonIndexAt(seasons, o));
  const covered = [...new Set(hits.filter((i) => i >= 0))];
  if (covered.length === 0) return { kind: 'none', reason: 'no_season_for_date' };
  if (covered.length === 1 && !hits.includes(-1)) return { kind: 'single', season: seasons[covered[0]] };
  return { kind: 'ambiguous', reason: ambiguousReason, candidates: covered.map((i) => seasons[i]) };
}

/**
 * Season for a stay. The start date decides: if it has no season the stay is unavailable.
 * If later days of the stay fall in another season (or a gap), the result is ambiguous
 * (`season_straddle`) so the caller prices only a lower bound.
 */
export function resolveStay(seasons: readonly Season[], startDate: string, days: number): SeasonResolution {
  const startOrdinal = isoOrdinal(startDate);
  if (startOrdinal === null) throw new RangeError(`invalid start date "${startDate}", expected YYYY-MM-DD`);
  if (seasonIndexAt(seasons, startOrdinal) < 0) return { kind: 'none', reason: 'no_season_for_date' };
  const ordinals: number[] = [];
  for (let i = 0; i < days; i++) {
    const o = isoOrdinal(addDays(startDate, i));
    if (o !== null) ordinals.push(o);
  }
  return resolve(seasons, ordinals, 'season_straddle');
}

/** Season when only a month (1..12) is known. A month spanning two seasons is `ambiguous_month`. */
export function resolveMonth(seasons: readonly Season[], month: number): SeasonResolution {
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new RangeError(`invalid month ${month}`);
  const first = MONTH_DAYS_LEAP.slice(0, month - 1).reduce((a, b) => a + b, 0) + 1;
  const ordinals = Array.from({ length: MONTH_DAYS_LEAP[month - 1] }, (_, i) => first + i);
  return resolve(seasons, ordinals, 'ambiguous_month');
}
