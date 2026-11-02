import { get, type DatabaseSync } from '../db/db.js';
import { resolveMonth, resolveStay, type Season, type SeasonResolution } from './seasons.js';

// Pricing is computed on the server only. All amounts are whole rupees (INR).
// The brief gives no GST, child or single-supplement rule, so none is assumed here:
// a missing rule makes the quote `partial` (a lower bound) and is listed in `unpriced`.

export interface PricingVersion {
  days: number;
  seasons: readonly Season[];
  /** Child fare as a percentage of the adult fare, or null when staff have not set a rule. */
  childPct: number | null;
  childRuleNote?: string | null;
  /** One-off supplement for an unpaired adult, or null when staff have not set one. */
  singleSuppInr: number | null;
}

export type When = { startDate: string } | { month: number };

export interface QuoteInput {
  when: When;
  adults: number;
  children: readonly { age?: number }[];
  /** GST in basis points (500 = 5%). Null/undefined means no rate is configured. */
  gstRateBp?: number | null;
}

export interface QuoteLine {
  code: 'adults' | 'children' | 'single_supplement';
  label: string;
  quantity: number;
  unit_inr: number;
  amount_inr: number;
}

export type UnpricedReason =
  | 'child_rule_missing'
  | 'single_supp_missing'
  | 'ambiguous_month'
  | 'season_straddle'
  | 'no_season_for_date';

export interface Unpriced {
  kind: 'child' | 'single_supplement' | 'season';
  reason: UnpricedReason;
  message: string;
}

/** Persisted as quote_json on a suggestion, so later price edits never change a sent quote. */
export interface Quote {
  status: 'complete' | 'partial' | 'unavailable';
  lines: QuoteLine[];
  unpriced: Unpriced[];
  /** Null when the status is `unavailable`. For `partial` it is a lower bound. */
  subtotal_inr: number | null;
  gst?: { rate_bp: number; amount_inr: number };
  total_inr?: number;
  season_name: string | null;
  assumptions: string[];
}

const NO_GST_NOTE = 'All figures are before GST; tax treatment to be confirmed by Company A.';

/** round(n / d) with halves rounded up, for non-negative integers. */
function divRoundHalfUp(n: number, d: number): number {
  return Math.floor((2 * n + d) / (2 * d));
}

function describeSeason(s: Season): string {
  return `${s.name} (${s.startMd} to ${s.endMd})`;
}

export function quote(version: PricingVersion, input: QuoteInput): Quote {
  const { adults, children, gstRateBp } = input;
  if (!Number.isInteger(adults) || adults < 1) throw new RangeError('adults must be a whole number of at least 1');
  for (const c of children) {
    if (c.age !== undefined && (!Number.isInteger(c.age) || c.age < 0 || c.age > 120)) {
      throw new RangeError(`invalid child age ${c.age}`);
    }
  }
  if (gstRateBp != null && (!Number.isInteger(gstRateBp) || gstRateBp < 0 || gstRateBp > 10000)) {
    throw new RangeError('gstRateBp must be a whole number of basis points between 0 and 10000');
  }

  const resolution: SeasonResolution =
    'startDate' in input.when
      ? resolveStay(version.seasons, input.when.startDate, version.days)
      : resolveMonth(version.seasons, input.when.month);

  const assumptions: string[] = ['Adult fare is the listed per-person rate for twin sharing.'];
  const unpriced: Unpriced[] = [];

  if (resolution.kind === 'none') {
    unpriced.push({
      kind: 'season',
      reason: 'no_season_for_date',
      message: 'No price is listed for these dates, so no fare can be quoted.',
    });
    assumptions.push(gstRateBp == null ? NO_GST_NOTE : `GST rate configured at ${gstRateBp / 100}%.`);
    return { status: 'unavailable', lines: [], unpriced, subtotal_inr: null, season_name: null, assumptions };
  }

  let unitInr: number;
  let seasonName: string | null;
  if (resolution.kind === 'single') {
    unitInr = resolution.season.pricePpTwinInr;
    seasonName = resolution.season.name;
    if (resolution.season.rangeAssumed) {
      assumptions.push(`Season ${describeSeason(resolution.season)} uses an ASSUMED date range, not one from the brief.`);
    }
  } else {
    const cheapest = resolution.candidates.reduce((a, b) => (b.pricePpTwinInr < a.pricePpTwinInr ? b : a));
    unitInr = cheapest.pricePpTwinInr;
    seasonName = null;
    const names = resolution.candidates.map(describeSeason).join(' and ');
    const what = resolution.reason === 'ambiguous_month' ? 'month spans' : 'stay spans';
    unpriced.push({
      kind: 'season',
      reason: resolution.reason,
      message: `The ${what} more than one season (${names}); priced at the lowest listed fare as a lower bound.`,
    });
    if (resolution.candidates.some((s) => s.rangeAssumed)) {
      assumptions.push('Season date ranges involved are ASSUMED, not from the brief.');
    }
  }

  const lines: QuoteLine[] = [
    { code: 'adults', label: 'Adults (twin share)', quantity: adults, unit_inr: unitInr, amount_inr: adults * unitInr },
  ];

  if (adults % 2 === 1) {
    if (version.singleSuppInr != null) {
      lines.push({
        code: 'single_supplement',
        label: 'Single supplement',
        quantity: 1,
        unit_inr: version.singleSuppInr,
        amount_inr: version.singleSuppInr,
      });
    } else {
      unpriced.push({
        kind: 'single_supplement',
        reason: 'single_supp_missing',
        message: 'An odd number of adults may need a single supplement; no supplement is set, so the fare is a lower bound.',
      });
    }
  }

  if (children.length > 0) {
    if (version.childPct == null) {
      unpriced.push({
        kind: 'child',
        reason: 'child_rule_missing',
        message: 'No child fare rule is set for this package, so the child fare is not included.',
      });
    } else {
      const childUnit = divRoundHalfUp(unitInr * version.childPct, 100);
      lines.push({
        code: 'children',
        label: 'Children',
        quantity: children.length,
        unit_inr: childUnit,
        amount_inr: children.length * childUnit,
      });
      assumptions.push(
        `Child fare is ${version.childPct}% of the adult fare, rounded to the nearest rupee` +
          (version.childRuleNote ? ` (${version.childRuleNote})` : '') +
          '.',
      );
    }
    if (children.some((c) => c.age !== undefined)) {
      assumptions.push('Child ages are recorded but no age band is applied.');
    }
  }

  const subtotal = lines.reduce((sum, l) => sum + l.amount_inr, 0);
  const result: Quote = {
    status: unpriced.length > 0 ? 'partial' : 'complete',
    lines,
    unpriced,
    subtotal_inr: subtotal,
    season_name: seasonName,
    assumptions,
  };
  if (unpriced.length > 0) assumptions.push('Partial quote: the figure is a lower bound, not a final price.');

  if (gstRateBp == null) {
    assumptions.push(NO_GST_NOTE);
  } else {
    const gst = divRoundHalfUp(subtotal * gstRateBp, 10000);
    result.gst = { rate_bp: gstRateBp, amount_inr: gst };
    result.total_inr = subtotal + gst;
    assumptions.push(`GST at ${gstRateBp / 100}% is added and rounded to the nearest rupee.`);
  }
  return result;
}

/** GST rate from pricing_config, or null if staff have not configured one. Throws on a malformed value. */
export function getGstRateBp(db: DatabaseSync): number | null {
  const row = get<{ value: string }>(db, "SELECT value FROM pricing_config WHERE key = 'gst_rate_bp'");
  if (!row) return null;
  const n = Number(row.value);
  if (!/^\d+$/.test(row.value) || n > 10000) throw new Error(`pricing_config.gst_rate_bp is malformed: "${row.value}"`);
  return n;
}
