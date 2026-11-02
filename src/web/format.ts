import { SYNTHETIC_MARKER, type PackageVersion } from '../domain/packages.js';
import type { Season } from '../domain/seasons.js';

// Display helpers for the public pages. Prices are shown exactly as stored: no GST, child or
// single-supplement figure is ever computed here, because the brief gives none.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Indian digit grouping: 32500 -> "₹32,500", 120000 -> "₹1,20,000". */
export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

function monthName(md: string): string {
  return MONTHS[Number(md.slice(0, 2)) - 1] ?? md;
}

function dayMonth(md: string): string {
  return `${Number(md.slice(3, 5))} ${monthName(md).slice(0, 3)}`;
}

/**
 * Season dates as the reader should see them. The brief gives months only, so a range whose day
 * boundaries are assumed (rangeAssumed) is shown by month; exact days appear only when they are known.
 */
export function seasonDates(season: Season): string {
  if (season.startMd === '01-01' && season.endMd === '12-31') return 'All year';
  if (season.rangeAssumed) return `${monthName(season.startMd)} to ${monthName(season.endMd)}`;
  return `${dayMonth(season.startMd)} to ${dayMonth(season.endMd)}`;
}

/** The lowest per-person season price, or null when the package has no priced season. */
export function fromPrice(seasons: readonly Season[]): number | null {
  return seasons.length === 0 ? null : Math.min(...seasons.map((s) => s.pricePpTwinInr));
}

/** The one sentence that states what every displayed price means. */
export const PRICE_BASIS = 'per person, twin sharing';
export const GST_NOTE = 'GST pending';

export function starLabel(stars: number | null): string | null {
  return stars === null ? null : `${stars}-star`;
}

export function pluralise(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "6 days, 5 nights" */
export function duration(v: Pick<PackageVersion, 'days' | 'nights'>): string {
  return `${pluralise(v.days, 'day')}, ${pluralise(v.nights, 'night')}`;
}

/** The summary without the seed's synthetic marker (the page shows a visible demo label instead). */
export function cleanSummary(summary: string): string {
  return summary.startsWith(SYNTHETIC_MARKER) ? summary.slice(SYNTHETIC_MARKER.length) : summary;
}

/** A search-result length description: whole words, no mid-word cut. */
export function metaDescription(text: string, max = 155): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

/** "2 Nov 2026, 3:35 pm IST" from a stored UTC timestamp. India has no daylight saving, so IST is always right. */
export function formatReceived(iso: string): string {
  const when = new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `${when} IST`;
}
