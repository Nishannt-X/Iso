import { DomainError, type PackageVersion, type VersionContent } from './packages.js';
import { photosFor, type PhotoId } from './photos.js';

/** Plain form values are kept verbatim on validation errors; no client-side script is required. */
export interface PackageForm {
  code: string; slug: string; title: string; summary: string; region: string;
  days: string; nights: string; starRating: string; childPct: string; childRuleNote: string; singleSuppInr: string;
  itinerary: string; inclusions: string; exclusions: string; destinations: string; tags: string; seasons: string; changeNote: string;
  heroPhotoId: string; bandPhotoId: string; hotelNames: string;
}

export const emptyPackageForm = (): PackageForm => ({
  code: '', slug: '', title: '', summary: '', region: '', days: '1', nights: '0', starRating: '',
  childPct: '', childRuleNote: '', singleSuppInr: '', itinerary: '', inclusions: '', exclusions: '',
  destinations: '', tags: '', seasons: '', changeNote: '', heroPhotoId: '', bandPhotoId: '', hotelNames: '',
});

export function formFromVersion(v: PackageVersion): PackageForm {
  const photos = photosFor(v.packageCode, v.heroPhotoId, v.bandPhotoId);
  return {
    code: v.packageCode, slug: v.packageSlug, title: v.title, summary: v.summary, region: v.region,
    days: String(v.days), nights: String(v.nights), starRating: v.starRating === null ? '' : String(v.starRating),
    childPct: v.childPct === null ? '' : String(v.childPct), childRuleNote: v.childRuleNote ?? '',
    singleSuppInr: v.singleSuppInr === null ? '' : String(v.singleSuppInr),
    itinerary: v.itinerary.map((d) => `${d.title} | ${d.description}`).join('\n'),
    inclusions: v.inclusions.join('\n'), exclusions: v.exclusions.join('\n'),
    destinations: v.destinations.join(', '), tags: v.tags.join(', '),
    seasons: v.seasons.map((s) => `${s.name} | ${s.startMd} | ${s.endMd} | ${s.pricePpTwinInr} | ${s.rangeAssumed ? 'assumed' : 'confirmed'}`).join('\n'),
    changeNote: v.changeNote,
    heroPhotoId: photos.hero?.id ?? '', bandPhotoId: photos.band?.id ?? '', hotelNames: (v.hotelNames ?? []).join('\n'),
  };
}

export function formFromBody(body: Record<string, unknown>): PackageForm {
  const base = emptyPackageForm();
  for (const key of Object.keys(base) as (keyof PackageForm)[]) {
    const value = body[key];
    base[key] = typeof value === 'string' ? value : '';
  }
  return base;
}

function number(value: string, label: string, minimum: number, maximum: number, optional = false): number | null {
  const trimmed = value.trim();
  if (optional && trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) throw new DomainError('validation', `${label} must be a whole number.`);
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new DomainError('validation', `${label} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

const lines = (value: string): string[] => value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
const commaList = (value: string): string[] => value.split(',').map((s) => s.trim()).filter(Boolean);

/** Convert the small, editable text grids into validated package data. Publish adds completeness checks. */
export function parsePackageForm(f: PackageForm): VersionContent {
  const itinerary = lines(f.itinerary).map((line, i) => {
    const [title, ...description] = line.split('|');
    return { day: i + 1, title: title!.trim(), description: description.join('|').trim() };
  });
  const seasons = lines(f.seasons).map((line, i) => {
    const parts = line.split('|').map((s) => s.trim());
    if (parts.length !== 5 || !['assumed', 'confirmed'].includes(parts[4]!)) {
      throw new DomainError('validation', `Season line ${i + 1} needs: Name | MM-DD | MM-DD | price | assumed or confirmed.`);
    }
    return {
      name: parts[0]!, startMd: parts[1]!, endMd: parts[2]!,
      pricePpTwinInr: number(parts[3]!, `Season line ${i + 1} price`, 1, 100_000_000)!,
      rangeAssumed: parts[4] === 'assumed',
    };
  });
  return {
    title: f.title, summary: f.summary, region: f.region,
    days: number(f.days, 'Days', 1, 60)!, nights: number(f.nights, 'Nights', 0, 60)!,
    starRating: number(f.starRating, 'Hotel stars', 1, 5, true),
    childPct: number(f.childPct, 'Child percentage', 0, 100, true),
    childRuleNote: f.childRuleNote.trim() || null,
    singleSuppInr: number(f.singleSuppInr, 'Single supplement', 1, 100_000_000, true),
    itinerary, inclusions: lines(f.inclusions), exclusions: lines(f.exclusions),
    destinations: commaList(f.destinations), tags: commaList(f.tags), seasons,
    heroPhotoId: (f.heroPhotoId || null) as PhotoId | null, bandPhotoId: (f.bandPhotoId || null) as PhotoId | null,
    hotelNames: lines(f.hotelNames),
  };
}
