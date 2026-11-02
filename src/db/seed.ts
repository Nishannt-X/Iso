import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { createEnquiry } from '../domain/enquiries.js';
import { createPackage, publish, SYNTHETIC_MARKER, type DataOrigin, type VersionContent } from '../domain/packages.js';
import { get, initSchema, isInitialised, openDb, run, type DatabaseSync } from './db.js';
import type { Season } from '../domain/seasons.js';

// Demo data. Facts from the client brief (docs/CLIENT_BRIEF.md, sample table):
//   PKG-KL-07 'Munnar, Thekkady and Alleppey houseboat', 6 days, 4-star, published;
//     Peak (Oct-Mar) Rs 32,500 and Monsoon (Jun-Sep) Rs 24,900 per person.
//   PKG-SI-12 'Madurai, Rameswaram and Kanyakumari', 5 days, 3-star, All year, Rs 18,750 per person, DRAFT.
// ASSUMED by this build, not brief facts: the exact day boundaries inside the brief's month ranges (Oct 1,
// Mar 31, Jun 1, Sep 30; rangeAssumed = true), nights = days - 1, and the region labels.
// SYNTHETIC: itineraries, inclusions, tags, summaries and the five SYN-* packages.
// child_pct, single_supp_inr and gst_rate_bp are deliberately left unset: the brief gives no such rule.

const KL07_PEAK_INR = 32500;
const KL07_MONSOON_INR = 24900;
const SI12_PRICE_INR = 18750;

const PEAK = (price: number): Season => ({ name: 'Peak', startMd: '10-01', endMd: '03-31', pricePpTwinInr: price, rangeAssumed: true });
const MONSOON = (price: number): Season => ({ name: 'Monsoon', startMd: '06-01', endMd: '09-30', pricePpTwinInr: price, rangeAssumed: true });

type Stop = [title: string, description: string];

function pkg(
  c: Pick<VersionContent, 'title' | 'summary' | 'nights' | 'region' | 'starRating' | 'destinations' | 'tags' | 'seasons'> &
    { stops: Stop[]; inclusions?: string[] },
): VersionContent {
  return {
    title: c.title,
    summary: SYNTHETIC_MARKER + c.summary,
    days: c.stops.length,
    nights: c.nights,
    starRating: c.starRating,
    region: c.region,
    childPct: null,
    childRuleNote: null,
    singleSuppInr: null,
    itinerary: c.stops.map(([title, description], i) => ({ day: i + 1, title, description })),
    inclusions: c.inclusions ?? ['Accommodation on twin sharing', 'Daily breakfast', 'Private vehicle for transfers and sightseeing'],
    exclusions: ['Flights and train fares', 'Personal expenses', 'Tips', 'Anything not listed under inclusions'],
    destinations: c.destinations,
    tags: c.tags,
    seasons: c.seasons,
  };
}

interface SeedPackage {
  code: string;
  slug: string;
  dataOrigin: DataOrigin;
  publish: boolean;
  note: string;
  content: VersionContent;
}

const BRIEF_NOTE = 'Seed: code, title, duration, star rating, season months and listed prices are from the client brief; day boundaries and nights are assumed; itinerary, inclusions and tags are synthetic placeholders.';
const SYNTH_NOTE = 'Seed: synthetic demo package.';

const SEED_PACKAGES: SeedPackage[] = [
  {
    code: 'PKG-KL-07', slug: 'munnar-thekkady-and-alleppey-houseboat-6-days', dataOrigin: 'brief', publish: true,
    note: BRIEF_NOTE,
    content: pkg({
      title: 'Munnar, Thekkady and Alleppey houseboat', nights: 5, region: 'Kerala', starRating: 4,
      summary: 'Six days from Kochi through the tea hills of Munnar and the wildlife of Thekkady to a night on a houseboat in the Alleppey backwaters.',
      destinations: ['Munnar', 'Thekkady', 'Alleppey'], tags: ['houseboat', 'backwaters', 'hills', 'family'],
      seasons: [PEAK(KL07_PEAK_INR), MONSOON(KL07_MONSOON_INR)],
      inclusions: ['Accommodation on twin sharing', 'Daily breakfast', 'One night on a houseboat with meals', 'Private vehicle for transfers and sightseeing'],
      stops: [
        ['Arrive in Kochi', 'Airport pickup and an evening at Fort Kochi.'],
        ['Kochi to Munnar', 'Drive into the hills past waterfalls and spice plantations.'],
        ['Munnar tea country', 'Tea estates, viewpoints and a tea museum visit.'],
        ['Munnar to Thekkady', 'Spice garden walk and an evening cultural show.'],
        ['Thekkady to Alleppey', 'Board the houseboat for a night on the backwaters.'],
        ['Alleppey to Kochi', 'Cruise ends after breakfast; transfer to the airport.'],
      ],
    }),
  },
  {
    code: 'PKG-SI-12', slug: 'madurai-rameswaram-and-kanyakumari-5-days', dataOrigin: 'brief', publish: false,
    note: `${BRIEF_NOTE} DRAFT in the brief, so it is kept unpublished.`,
    content: pkg({
      title: 'Madurai, Rameswaram and Kanyakumari', nights: 4, region: 'South India', starRating: 3,
      summary: 'Five days linking the temple towns of Madurai and Rameswaram with the southern tip at Kanyakumari.',
      destinations: ['Madurai', 'Rameswaram', 'Kanyakumari'], tags: ['temples', 'culture'],
      seasons: [{ name: 'All year', startMd: '01-01', endMd: '12-31', pricePpTwinInr: SI12_PRICE_INR, rangeAssumed: false }],
      stops: [
        ['Arrive in Madurai', 'Airport pickup and an evening at the Meenakshi temple.'], ['Madurai', 'Temple and market visits.'],
        ['Madurai to Rameswaram', 'Temple town and the sea bridge.'], ['Rameswaram to Kanyakumari', 'Coastal drive.'],
        ['Kanyakumari', 'Sunrise point and Vivekananda Rock, then departure.'],
      ],
    }),
  },
  {
    code: 'SYN-KL-01', slug: 'kerala-heritage-and-spice-trail', dataOrigin: 'synthetic', publish: true, note: SYNTH_NOTE,
    content: pkg({
      title: 'Kerala Heritage & Spice Trail (no houseboat)', nights: 4, region: 'Kerala', starRating: 3,
      summary: 'Five days of Kochi heritage and Thekkady spice country. No houseboat stay.',
      destinations: ['Kochi', 'Thekkady'], tags: ['heritage', 'wildlife', 'spices'],
      seasons: [PEAK(28000), MONSOON(21000)],
      stops: [
        ['Arrive in Kochi', 'Pickup and evening harbour walk.'], ['Kochi heritage', 'Synagogue, palace and old town.'],
        ['Kochi to Thekkady', 'Drive to spice country.'], ['Thekkady', 'Spice plantation and wildlife boat ride.'], ['Departure', 'Transfer to Kochi airport.'],
      ],
    }),
  },
  {
    code: 'SYN-KL-02', slug: 'kerala-hills-retreat', dataOrigin: 'synthetic', publish: true, note: SYNTH_NOTE,
    content: pkg({
      title: 'Kerala Hills Retreat', nights: 3, region: 'Kerala', starRating: 4,
      summary: 'Four relaxed days among the tea gardens of Munnar and Thekkady.',
      destinations: ['Munnar', 'Thekkady'], tags: ['hills', 'tea-gardens'],
      seasons: [PEAK(25000), MONSOON(19000)],
      stops: [
        ['Arrive in Munnar', 'Transfer from Kochi and a tea garden walk.'], ['Munnar', 'Viewpoints and a tea factory visit.'],
        ['Munnar to Thekkady', 'Drive and spice garden visit.'], ['Departure', 'Transfer to Kochi airport.'],
      ],
    }),
  },
  {
    code: 'SYN-KL-03', slug: 'kerala-backwaters-and-houseboat-escape-7-nights', dataOrigin: 'synthetic', publish: true, note: SYNTH_NOTE,
    content: pkg({
      title: 'Kerala Backwaters & Houseboat Escape (7 nights)', nights: 7, region: 'Kerala', starRating: 5,
      summary: 'Eight days from the hills to the backwaters, with a houseboat night and a beach finish at Kovalam.',
      destinations: ['Kochi', 'Munnar', 'Alleppey', 'Kovalam'], tags: ['houseboat', 'backwaters', 'beach'],
      seasons: [PEAK(46000), MONSOON(35000)],
      inclusions: ['Accommodation on twin sharing', 'Daily breakfast', 'One night on a houseboat with meals', 'Private vehicle for transfers and sightseeing'],
      stops: [
        ['Arrive in Kochi', 'Pickup and evening at leisure.'], ['Kochi', 'Fort Kochi sightseeing.'], ['Kochi to Munnar', 'Drive into the hills.'],
        ['Munnar', 'Tea estates and viewpoints.'], ['Munnar to Alleppey', 'Board the houseboat.'], ['Alleppey to Kovalam', 'Disembark and drive south.'],
        ['Kovalam', 'Beach day.'], ['Departure', 'Transfer to Trivandrum airport.'],
      ],
    }),
  },
  {
    code: 'SYN-GA-01', slug: 'goa-beach-break', dataOrigin: 'synthetic', publish: true, note: SYNTH_NOTE,
    content: pkg({
      title: 'Goa Beach Break', nights: 4, region: 'Goa', starRating: 4,
      summary: 'Five easy days on the Goa coast.',
      destinations: ['Goa'], tags: ['beach'],
      seasons: [
        { name: 'Season', startMd: '11-01', endMd: '02-29', pricePpTwinInr: 22000, rangeAssumed: true },
        { name: 'Monsoon', startMd: '06-01', endMd: '09-30', pricePpTwinInr: 14000, rangeAssumed: true },
      ],
      stops: [
        ['Arrive in Goa', 'Airport pickup.'], ['North Goa', 'Beaches and a fort visit.'], ['South Goa', 'Quiet beaches.'],
        ['Old Goa', 'Churches and spice market.'], ['Departure', 'Airport transfer.'],
      ],
    }),
  },
  {
    code: 'SYN-KL-04', slug: 'kerala-summer-ayurveda-retreat', dataOrigin: 'synthetic', publish: true,
    note: `${SYNTH_NOTE} Summer-only package, so it has no season for December.`,
    content: pkg({
      title: 'Kerala Summer Ayurveda Retreat', nights: 4, region: 'Kerala', starRating: 4,
      summary: 'A summer-only wellness stay. Priced for April and May only.',
      destinations: ['Kochi', 'Kumarakom'], tags: ['ayurveda', 'wellness'],
      seasons: [{ name: 'Summer', startMd: '04-01', endMd: '05-31', pricePpTwinInr: 30000, rangeAssumed: true }],
      stops: [
        ['Arrive in Kochi', 'Transfer to the retreat.'], ['Consultation and treatments', 'Wellness consultation and first treatments.'],
        ['Treatment day', 'Treatments and yoga.'], ['Kumarakom', 'Backwater morning.'], ['Departure', 'Transfer to Kochi airport.'],
      ],
    }),
  },
];

/** Placeholder staff user that owns seeded versions. Its password hash is not a valid hash, so nobody can log in as it. */
const SEED_USER_EMAIL = 'seed@system.invalid';

/** Inserts the demo catalogue into an initialised, empty database. */
export function seedDatabase(db: DatabaseSync): { packages: number; published: number } {
  const actorId = Number(
    run(db, "INSERT INTO staff_users (email, name, role, password_hash) VALUES (?, 'Seed (system)', 'admin', 'LOGIN-DISABLED')", SEED_USER_EMAIL).lastInsertRowid,
  );
  let published = 0;
  for (const p of SEED_PACKAGES) {
    // Order: package, draft version with its children, then publish. There is no FK cycle to work around.
    const { versionId } = createPackage(db, { code: p.code, slug: p.slug, dataOrigin: p.dataOrigin, actorId, content: p.content, changeNote: p.note });
    if (p.publish) {
      publish(db, { draftId: versionId, actorId, note: p.note });
      published++;
    }
  }
  seedSampleEnquiry(db);
  return { packages: SEED_PACKAGES.length, published };
}

/**
 * The brief's sample enquiry, verbatim, as if sent from the PKG-KL-07 form. ASSUMED by this build: the traveller's
 * name and contact (synthetic, on the reserved .invalid domain), and that only the fields the form requires
 * (adults, children) were filled in. Destination, budget and dates are left blank because the message holds them,
 * so the later AI extraction has something to extract. No budget figure or date is invented from the message.
 */
const SAMPLE_ENQUIRY_MESSAGE = 'Hi, 2 adults and 1 kid, Kerala 5-6 nights in December, budget around 1.2 lakh total, houseboat a must';

function seedSampleEnquiry(db: DatabaseSync): void {
  const live = get<{ id: number }>(
    db, "SELECT v.id FROM live_versions v JOIN packages p ON p.id = v.package_id WHERE p.code = 'PKG-KL-07'",
  );
  if (!live) return;
  createEnquiry(db, {
    versionId: live.id,
    submissionKey: 'seed-sample-brief-enquiry-1',
    origin: 'seed_sample',
    input: {
      name: 'Sample Traveller (synthetic)', email: 'sample.traveller@example.invalid', phone: null, travelStart: null,
      adults: 2, children: 1, childAges: [], destination: null, budgetInr: null, budgetBasis: null,
      message: SAMPLE_ENQUIRY_MESSAGE, whatsappConsent: false,
    },
  });
}

function isAppDatabase(path: string): boolean {
  try {
    const probe = openDb(path);
    const initialised = isInitialised(probe);
    probe.close();
    return initialised;
  } catch {
    return false; // not a SQLite file at all
  }
}

function assertSafeToReplace(path: string): void {
  if (existsSync(path) && !isAppDatabase(path)) {
    throw new Error(`Refusing to replace "${path}": it is not a database created by this app. Point DB_PATH somewhere else.`);
  }
}

/** Deletes and rebuilds the database at `path` with the schema and demo data. Running it twice gives the same result. */
export function resetDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') {
    assertSafeToReplace(path);
    mkdirSync(dirname(path), { recursive: true });
    for (const suffix of ['', '-wal', '-shm']) rmSync(path + suffix, { force: true });
  }
  const db = openDb(path);
  initSchema(db);
  seedDatabase(db);
  return db;
}
