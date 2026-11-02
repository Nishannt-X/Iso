// Placeholder photography with licence provenance. Every photo is a Creative Commons image from
// Wikimedia Commons, fetched on 2026-11-02, resized to two widths and credited beside each use.
// These are NOT Company A's photographs. Company A must supply licensed images before launch.
//
// ponytail: the photo-to-package mapping lives here, in code, keyed by package code. Ceiling: staff cannot
// change it. Upgrade path: a media table and an image picker in the package editor (slice S6).

export interface Photo {
  id: string;
  /** Describes what the image shows, for people who cannot see it. */
  alt: string;
  /** Short place label shown in the credit line. */
  place: string;
  author: string;
  licence: string;
  licenceUrl: string;
  /** Commons file page the image came from. */
  sourceUrl: string;
  /** Pixel size of the 2000px-wide file. The 900px file keeps the same aspect ratio. */
  width: number;
  height: number;
}

export const PHOTO_FILE_PATTERN = /^[a-z0-9-]+-(900|2000)\.jpg$/;

export function photoSrc(photo: Photo, size: 900 | 2000): string {
  return `/assets/images/${photo.id}-${size}.jpg`;
}

const commons = (file: string): string => `https://commons.wikimedia.org/wiki/File:${file}`;

export const PHOTOS = {
  'alleppey-houseboat': {
    id: 'alleppey-houseboat',
    alt: 'A woven-roof houseboat gliding across calm water, palm trees behind it',
    place: 'Alleppey backwaters',
    author: 'Paul Arps',
    licence: 'CC BY 2.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/2.0',
    sourceUrl: commons('Houseboat_on_Alleppey_backwaters_(Kerala,_India_2023)_(52704809623).jpg'),
    width: 2000,
    height: 1306,
  },
  'alleppey-houseboats': {
    id: 'alleppey-houseboats',
    alt: 'A line of moored houseboats on green water under a bright sky',
    place: 'Alleppey backwaters',
    author: 'Paul Arps',
    licence: 'CC BY 2.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/2.0',
    sourceUrl: commons('Houseboat_on_Alleppey_backwaters_(Kerala,_India_2023)_(52703799657).jpg'),
    width: 2000,
    height: 1310,
  },
  'alleppey-sunset': {
    id: 'alleppey-sunset',
    alt: 'A houseboat tied up at the water’s edge in low evening light',
    place: 'Alleppey backwaters at dusk',
    author: 'Sravanbaddi',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
    sourceUrl: commons('Sunset_at_Alleppey_backwaters.3.jpg'),
    width: 2000,
    height: 1125,
  },
  'munnar-tea': {
    id: 'munnar-tea',
    alt: 'Terraced tea bushes on a hillside above a small town',
    place: 'Munnar tea country',
    author: 'Ingo Mehling',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
    sourceUrl: commons('Munnar_-_Tea_Plantations.jpg'),
    width: 2000,
    height: 744,
  },
  'periyar-lake': {
    id: 'periyar-lake',
    alt: 'Still lake reflecting forested green hills, one small boat in the distance',
    place: 'Periyar Lake, Thekkady',
    author: 'Adhyaru19',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0',
    sourceUrl: commons('Periyar_Tiger_Reserve,_Periyar_Lake,_Kerala.JPG'),
    width: 2000,
    height: 1337,
  },
  'fort-kochi-nets': {
    id: 'fort-kochi-nets',
    alt: 'Chinese fishing nets silhouetted against a low sun over the water',
    place: 'Fort Kochi',
    author: 'Rangan Datta Wiki',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
    sourceUrl: commons('Sunset_with_Chinese_Fishing_Nets,_Fort_Kochi_1.jpg'),
    width: 2000,
    height: 1324,
  },
  'goa-vagator': {
    id: 'goa-vagator',
    alt: 'A palm tree on a green headland above a long grey-sand beach',
    place: 'Vagator Beach, Goa',
    author: 'Vyacheslav Argenberg',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0',
    sourceUrl: commons('Vagator_Beach,_Goa,_India.jpg'),
    width: 2000,
    height: 1333,
  },
  'kovalam-lighthouse': {
    id: 'kovalam-lighthouse',
    alt: 'A red-and-white lighthouse rising above palms on a rocky headland',
    place: 'Kovalam',
    author: 'Honeybee44',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
    sourceUrl: commons('Kovalam_Beach,_Lighthouse.jpg'),
    width: 2000,
    height: 1333,
  },
} as const satisfies Record<string, Photo>;

export type PhotoId = keyof typeof PHOTOS;

const BY_PACKAGE: Record<string, { hero: PhotoId; band?: PhotoId }> = {
  'PKG-KL-07': { hero: 'alleppey-houseboats', band: 'munnar-tea' },
  'SYN-KL-01': { hero: 'fort-kochi-nets', band: 'periyar-lake' },
  'SYN-KL-02': { hero: 'munnar-tea', band: 'periyar-lake' },
  'SYN-KL-03': { hero: 'alleppey-sunset', band: 'kovalam-lighthouse' },
  'SYN-KL-04': { hero: 'periyar-lake' },
  'SYN-GA-01': { hero: 'goa-vagator' },
};

/** Photos for a package, or nulls when none is assigned. Pages must cope with both. */
export function photosFor(packageCode: string): { hero: Photo | null; band: Photo | null } {
  const entry = BY_PACKAGE[packageCode];
  return { hero: entry ? PHOTOS[entry.hero] : null, band: entry?.band ? PHOTOS[entry.band] : null };
}

/** The photo used on the home page hero. */
export const HOME_HERO: Photo = PHOTOS['alleppey-houseboat'];
