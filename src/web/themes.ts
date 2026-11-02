import { PHOTOS, type PhotoId } from '../domain/photos.js';

// Journey themes for the home page. A package belongs to the FIRST theme (in this order) that shares
// one of its tags, so each package appears once. The grouping is only as good as the package tags,
// which are synthetic placeholders in this demo; it never claims a traveller type (the data has none).

export interface Theme {
  id: string;
  title: string;
  /** Says only what the tags mean. No claim about hotels, guides or experiences. */
  blurb: string;
  tags: readonly string[];
  photo: PhotoId;
}

export const THEMES: readonly Theme[] = [
  { id: 'backwaters', title: 'On the water', blurb: 'Houseboats and the Kerala backwaters.', tags: ['backwaters', 'houseboat'], photo: 'alleppey-houseboats' },
  { id: 'heritage', title: 'Heritage and culture', blurb: 'Old ports, temples and the spice trade.', tags: ['heritage', 'culture', 'temples'], photo: 'fort-kochi-nets' },
  { id: 'hills', title: 'Hills and wildlife', blurb: 'Tea country and the Western Ghats.', tags: ['hills', 'tea-gardens', 'wildlife'], photo: 'munnar-tea' },
  { id: 'coast', title: 'Coast and wellness', blurb: 'Beaches, and rest at the shore.', tags: ['beach', 'ayurveda', 'wellness'], photo: 'goa-vagator' },
];

export interface ThemeGroup<T> {
  /** null collects packages whose tags match no theme; it renders without a photo. */
  theme: Theme | null;
  items: T[];
}

/** Groups items by theme in THEMES order; empty themes are dropped; unmatched items come last. */
export function groupByTheme<T extends { tags: readonly string[] }>(items: readonly T[]): ThemeGroup<T>[] {
  const groups = new Map<Theme | null, T[]>();
  for (const item of items) {
    const theme = THEMES.find((t) => t.tags.some((tag) => item.tags.includes(tag))) ?? null;
    groups.set(theme, [...(groups.get(theme) ?? []), item]);
  }
  return [...THEMES, null].flatMap((theme) => {
    const grouped = groups.get(theme);
    return grouped ? [{ theme, items: grouped }] : [];
  });
}

export const themePhoto = (theme: Theme) => PHOTOS[theme.photo];
