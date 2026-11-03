import { HOME_HERO, photosFor } from '../domain/photos.js';
import type { DataOrigin, PackageVersion } from '../domain/packages.js';
import { Credit, Layout, Picture, SITE_NAME, type PageMeta } from './layout.js';
import { cleanSummary, duration, formatInr, fromPrice, GST_NOTE, metaDescription, PRICE_BASIS, pluralise, seasonDates, starLabel } from './format.js';
import { STAFF_CSS } from './staff-styles.js';
import { groupByTheme, themePhoto, type ThemeGroup } from './themes.js';

// Server-rendered public pages. JSX output is escaped by Hono; nothing here builds HTML from strings.

export interface PageContext {
  siteUrl: string;
}

export const packagePath = (slug: string): string => `/packages/${slug}`;
export const enquirePath = (slug: string): string => `/enquire?package=${encodeURIComponent(slug)}`;
export const destinationSlug = (name: string): string => name.toLocaleLowerCase('en-IN').normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const destinationPath = (name: string): string => `/destinations/${destinationSlug(name)}`;
const mapPath = (name: string): string => `https://www.openstreetmap.org/search?query=${encodeURIComponent(`${name}, India`)}`;

const DEST_COORDS: Record<string, { x: number; y: number }> = {
  kochi: { x: 230, y: 220 },
  cochin: { x: 230, y: 220 },
  munnar: { x: 430, y: 140 },
  thekkady: { x: 470, y: 260 },
  periyar: { x: 470, y: 260 },
  alleppey: { x: 220, y: 310 },
  alappuzha: { x: 220, y: 310 },
  kumarakom: { x: 280, y: 280 },
  kovalam: { x: 290, y: 420 },
  trivandrum: { x: 290, y: 410 },
  thiruvananthapuram: { x: 290, y: 410 },
  madurai: { x: 620, y: 180 },
  rameswaram: { x: 720, y: 250 },
  kanyakumari: { x: 370, y: 460 },
  wayanad: { x: 250, y: 80 },
  goa: { x: 160, y: 70 },
};

function getDestCoord(dest: string, index: number, total: number): { x: number; y: number } {
  const key = dest.trim().toLowerCase();
  if (DEST_COORDS[key]) return DEST_COORDS[key];
  const step = 500 / Math.max(total, 1);
  return { x: 160 + index * step, y: 160 + (index % 2) * 80 };
}

function generateRouteSvgPath(destinations: string[]): string {
  if (destinations.length < 2) return '';
  const pts = destinations.map((d, i) => getDestCoord(d, i, destinations.length));
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const cx = (prev.x + curr.x) / 2;
    const cy = (prev.y + curr.y) / 2 - 25;
    d += ` Q ${cx} ${cy} ${curr.x} ${curr.y}`;
  }
  return d;
}

export function DestinationIndexPage({ packages, ctx }: { packages: PackageVersion[]; ctx: PageContext }) {
  const names = [...new Set(packages.flatMap((p) => p.destinations))].sort((a, b) => a.localeCompare(b));
  return <Layout meta={{ title: 'Destinations | Kochi Tours', description: 'Find tours by place across Kerala and South India.', path: '/destinations', siteUrl: ctx.siteUrl }}><section class="section"><div class="wrap"><p class="eyebrow">Places</p><h1>Travel by destination</h1><p class="lede">Choose a place, then see the journeys that include it.</p>{names.length ? <ul class="destination-grid">{names.map((name) => <li><a href={destinationPath(name)}><strong>{name}</strong><span>{packages.filter((p) => p.destinations.includes(name)).length} journeys →</span></a></li>)}</ul> : <p class="empty">No destinations are published yet.</p>}</div></section></Layout>;
}

export function DestinationPage({ name, packages, origins, ctx }: { name: string; packages: PackageVersion[]; origins: Map<number, DataOrigin>; ctx: PageContext }) {
  return <Layout meta={{ title: `${name} tours | Kochi Tours`, description: `Published holiday packages that include ${name}.`, path: destinationPath(name), siteUrl: ctx.siteUrl }}><section class="section"><div class="wrap"><a class="link back" href="/destinations">All destinations</a><p class="eyebrow">Destination</p><h1>{name}</h1><p class="lede">Journeys that include {name}. Compare each itinerary, hotel category and seasonal price.</p><p class="map-action"><a class="link" href={mapPath(name)} target="_blank" rel="noopener noreferrer">Open {name} on OpenStreetMap ↗</a></p><ul class="rows">{packages.map((p) => <PackageRow v={p} origin={origins.get(p.packageId)} />)}</ul></div></section></Layout>;
}

function PriceLine({ seasons }: { seasons: PackageVersion['seasons'] }) {
  const from = fromPrice(seasons);
  if (from === null) return <p class="price"><span class="from">Price to be confirmed</span></p>;
  return (
    <p class="price">
      <span class="from">From</span> <strong class="num">{formatInr(from)}</strong>
      <span class="basis">{PRICE_BASIS} · {GST_NOTE}</span>
    </p>
  );
}

function DemoLabel({ origin }: { origin: DataOrigin | undefined }) {
  if (origin === undefined) return null;
  return <p class="demo">{origin === 'synthetic' ? 'Synthetic demo package' : 'Price from the brief; itinerary is placeholder'}</p>;
}

function PackageRow({ v, origin }: { v: PackageVersion; origin: DataOrigin | undefined }) {
  const { hero } = photosFor(v.packageCode, v.heroPhotoId, v.bandPhotoId);
  const stars = starLabel(v.starRating);
  return (
    <li class="row">
      <figure class="shot">
        <div class={hero ? 'thumb' : 'thumb none'}>
          {hero ? <Picture photo={hero} sizes="(min-width: 56rem) 58vw, 100vw" /> : <span>Photo to come</span>}
        </div>
        {hero ? <figcaption class="credit-below"><Credit photo={hero} /></figcaption> : null}
      </figure>
      <div>
        <h2><a href={packagePath(v.packageSlug)}>{v.title}</a></h2>
        <p class="facts">{[duration(v), stars ? `${stars} stays` : null, v.region].filter(Boolean).join(' · ')}</p>
        <p class="summary">{cleanSummary(v.summary)}</p>
        <PriceLine seasons={v.seasons} />
        <DemoLabel origin={origin} />
      </div>
    </li>
  );
}

function Journey({ v, origin }: { v: PackageVersion; origin: DataOrigin | undefined }) {
  const stars = starLabel(v.starRating);
  return (
    <li class="trip" data-origin={origin}>
      <p class="cell code num"><span class="legend">Code</span>{v.packageCode}</p>
      <div class="cell what">
        <h3><a href={packagePath(v.packageSlug)}>{v.title}</a></h3>
        <p class="route">{v.destinations.join(' · ')}</p>
        <p class="summary">{cleanSummary(v.summary)}</p>
        <DemoLabel origin={origin} />
      </div>
      <p class="cell len">
        <span class="legend">Length</span>
        <span>{duration(v)}</span>
        <span class="sub">{stars ? `${stars} stays` : 'Stay category not listed'}</span>
      </p>
      <div class="cell fare">
        <span class="legend">Fare</span>
        <PriceLine seasons={v.seasons} />
      </div>
      <p class="cell act"><a class="stub" href={enquirePath(v.packageSlug)}>Enquire<span class="sr"> about {v.title}</span></a></p>
    </li>
  );
}

function ThemeSection({ group, tall, origins }: { group: ThemeGroup<PackageVersion>; tall: boolean; origins: Map<number, DataOrigin> }) {
  const { theme, items } = group;
  const photo = theme ? themePhoto(theme) : null;
  const id = theme ? `theme-${theme.id}` : 'theme-more';
  return (
    <section class="theme" aria-labelledby={id}>
      {photo ? (
        <figure class={tall ? 'bleed tall' : 'bleed'}>
          <Picture photo={photo} sizes="100vw" />
          <figcaption class="credit-strip"><span class="wrap"><Credit photo={photo} /></span></figcaption>
        </figure>
      ) : null}
      <div class="wrap">
        <div class="theme-head">
          <h2 id={id}>{theme ? theme.title : 'More journeys'}</h2>
          {theme ? <p>{theme.blurb}</p> : null}
        </div>
        <ul class="board">
          <li class="board-head" aria-hidden="true">
            <span>Code</span><span>Journey</span><span>Length</span><span>Fare</span><span />
          </li>
          {items.map((v) => (
            <Journey v={v} origin={origins.get(v.packageId)} />
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Facts about the live packages for the ticket stub. Nothing here is invented: it is counted from the data. */
function catalogueFacts(packages: PackageVersion[], origins: Map<number, DataOrigin>) {
  const days = packages.map((v) => v.days);
  const faresWithOrigin = packages
    .map((v) => ({ fare: fromPrice(v.seasons), origin: origins.get(v.packageId) }))
    .filter((x): x is { fare: number; origin: DataOrigin | undefined } => x.fare !== null);
  const fares = faresWithOrigin.map((x) => x.fare);
  const [shortest, longest] = [Math.min(...days), Math.max(...days)];
  const lowestFare = fares.length > 0 ? Math.min(...fares) : null;
  const lowestItem = lowestFare !== null ? faresWithOrigin.find((x) => x.fare === lowestFare) : null;
  const isLowestFareSynthetic = lowestItem?.origin === 'synthetic';
  return {
    count: packages.length,
    length: shortest === longest ? pluralise(shortest, 'day') : `${shortest} to ${pluralise(longest, 'day')}`,
    lowestFare,
    isLowestFareSynthetic,
  };
}

export function HomePage({ packages, origins, ctx }: { packages: PackageVersion[]; origins: Map<number, DataOrigin>; ctx: PageContext }) {
  const meta: PageMeta = {
    title: 'Kerala and South India holiday packages | Kochi Tours',
    description: 'Tour packages from Kochi across Kerala and South India for families, honeymooners and groups, with day-wise itineraries and seasonal per-person prices.',
    path: '/',
    siteUrl: ctx.siteUrl,
    image: HOME_HERO,
  };
  const facts = packages.length > 0 ? catalogueFacts(packages, origins) : null;
  const groups = groupByTheme(packages);
  return (
    <Layout meta={meta} overImage>
      <section class="cover" aria-labelledby="home-title">
        <div class="cover-photo"><Picture photo={HOME_HERO} sizes="100vw" eager class="low" /></div>
        <div class="wrap cover-in">
          <div class="ticket">
            <div class="ticket-main">
              <h1 id="home-title">Kerala and South India, from Kochi</h1>
              <p class="lede">Holiday packages for families, honeymooners and groups, with every day laid out and every price stated per person.</p>
            </div>
            <div class="ticket-stub">
              {facts ? (
                <dl class="stub-facts">
                  <div><dt>Journeys</dt><dd class="num">{facts.count}</dd></div>
                  <div><dt>Length</dt><dd class="num">{facts.length}</dd></div>
                  {facts.lowestFare !== null ? (
                    <div>
                      <dt>Fares from</dt>
                      <dd class="num">{formatInr(facts.lowestFare)}</dd>
                      {facts.isLowestFareSynthetic ? (
                        <span class="stub-demo-tag">Synthetic demo fare</span>
                      ) : null}
                    </div>
                  ) : null}
                </dl>
              ) : null}
              {facts ? (
                <p class="stub-basis">
                  {PRICE_BASIS} · {GST_NOTE}
                  {facts.isLowestFareSynthetic ? ' · lowest fare is from a demo package' : ''}
                </p>
              ) : null}
              <a class="btn" href="#packages">See the journeys</a>
            </div>
          </div>
        </div>
        <p class="credit-strip"><span class="wrap"><Credit photo={HOME_HERO} /></span></p>
      </section>

      <section class="section" id="packages" aria-labelledby="packages-title">
        <div class="wrap">
          <div class="section-head">
            <h2 id="packages-title">Journeys</h2>
            {packages.length > 0 ? <p class="count">{packages.length} available</p> : null}
          </div>
          <form action="/packages" method="get" class="package-search"><label for="home-search">Find a place or experience</label><div><input id="home-search" name="q" type="search" maxlength={80} placeholder="Try Munnar or houseboat" /><button class="btn" type="submit">Search</button></div></form>
          {packages.length > 0 ? (
            <div id="catalog-filters" class="catalog-filters">
              <div class="filter-group">
                <span class="filter-label">Experience:</span>
                <div class="filter-pills">
                  <button type="button" class="pill active" data-filter="all">All Experiences</button>
                  <button type="button" class="pill" data-filter="houseboat">Houseboats &amp; Backwaters</button>
                  <button type="button" class="pill" data-filter="tea_plantations">Tea Hills &amp; Wildlife</button>
                  <button type="button" class="pill" data-filter="heritage">Heritage &amp; Temples</button>
                  <button type="button" class="pill" data-filter="beaches">Beaches &amp; Coast</button>
                </div>
              </div>
              <div class="filter-group">
                <span class="filter-label">Duration:</span>
                <div class="filter-pills">
                  <button type="button" class="pill active" data-duration="all">Any Length</button>
                  <button type="button" class="pill" data-duration="short">Quick (≤ 5 Days)</button>
                  <button type="button" class="pill" data-duration="medium">Standard (6 Days)</button>
                  <button type="button" class="pill" data-duration="long">Grand (7+ Days)</button>
                </div>
              </div>
            </div>
          ) : null}
          {packages.length === 0 ? (
            <p class="empty">No packages are published yet. Please check back soon.</p>
          ) : (
            <>
              <p class="notice">
                Prices are per person on twin sharing. GST is pending: Company A has not yet confirmed whether it is included or how it is charged.
              </p>
              <p class="notice rules">
                <span><span class="rule-sample solid" aria-hidden="true" />Solid rule: price from Company A&rsquo;s brief.</span>
                <span><span class="rule-sample dashed" aria-hidden="true" />Dashed rule: demo package with placeholder content.</span>
              </p>
            </>
          )}
        </div>
        {groups.map((group, i) => (
          <ThemeSection group={group} tall={i === 0} origins={origins} />
        ))}
      </section>

      <section class="section how" id="how" aria-labelledby="how-title">
        <div class="wrap">
          <h2 id="how-title">How it works</h2>
          <ol class="legs">
            <li>
              <span class="leg num">1</span>
              <div><h3>Choose a journey</h3><p>Every journey lists its days, what is included and what is not, and a price for each season.</p></div>
            </li>
            <li>
              <span class="leg num">2</span>
              <div><h3>Check what the price means</h3><p>Fares are per person on twin sharing. GST is pending. Rates for children and solo travellers are not listed.</p></div>
            </li>
            <li>
              <span class="leg num">3</span>
              <div><h3>Send an enquiry</h3><p>Tell us who is travelling, when, and your budget. In this demo build, enquiries are stored in a mock outbox for team review; no live emails or messages are sent.</p></div>
            </li>
          </ol>
          <p class="fineprint">Demo build: an enquiry sent here is saved in a mock outbox, and nothing is sent to any email address or phone.</p>
        </div>
      </section>
    </Layout>
  );
}

export function PackageSearchPage({ packages, origins, ctx, query }: { packages: PackageVersion[]; origins: Map<number, DataOrigin>; ctx: PageContext; query: string }) {
  const needle = query.toLocaleLowerCase('en-IN');
  const matches = needle ? packages.filter((v) => [v.title, v.region, v.summary, ...v.destinations, ...v.tags].some((x) => x.toLocaleLowerCase('en-IN').includes(needle))) : packages;
  const meta: PageMeta = { title: 'Explore holiday packages | Kochi Tours', description: 'Explore Kerala and South India holiday packages by destination and experience.', path: '/packages', siteUrl: ctx.siteUrl, noindex: Boolean(query) };
  return <Layout meta={meta}>
    <section class="section"><div class="wrap">
      <p class="eyebrow">Explore</p><h1 class="search-title">Find your next journey</h1>
      <form action="/packages" method="get" class="package-search"><label for="package-search">Destination or experience</label><div><input id="package-search" name="q" type="search" value={query} maxlength={80} placeholder="Try Munnar or houseboat" /><button class="btn" type="submit">Search</button></div></form>
      <div class="section-head"><h2>{query ? `Results for “${query}”` : 'All packages'}</h2><p class="count">{matches.length} {matches.length === 1 ? 'package' : 'packages'}</p></div>
      {matches.length ? <ul class="rows">{matches.map((v) => <PackageRow v={v} origin={origins.get(v.packageId)} />)}</ul> : <div class="empty"><p>No published package matches that search.</p><a class="link" href="/packages">See all packages</a></div>}
    </div></section>
  </Layout>;
}

export function PackagePage({ v, origin, ctx, previewPackageId }: { v: PackageVersion; origin: DataOrigin | undefined; ctx: PageContext; previewPackageId?: number }) {
  const { hero, band } = photosFor(v.packageCode, v.heroPhotoId, v.bandPhotoId);
  const stars = starLabel(v.starRating);
  const from = fromPrice(v.seasons);
  const summary = cleanSummary(v.summary);
  const assumedDates = v.seasons.some((s) => s.rangeAssumed);
  const meta: PageMeta = {
    title: `${v.title}, ${duration(v)} | ${SITE_NAME}`,
    description: metaDescription(summary),
    path: previewPackageId === undefined ? packagePath(v.packageSlug) : `/staff/packages/${previewPackageId}/preview`,
    siteUrl: ctx.siteUrl,
    image: hero,
    noindex: previewPackageId !== undefined,
  };

  return (
    <Layout meta={meta} overImage={hero !== null} hasBook packageSlug={v.packageSlug} packageTitle={v.title} extraCss={previewPackageId === undefined ? undefined : STAFF_CSS}>
      {previewPackageId === undefined ? null : <div class="preview-banner" role="status"><strong>Private preview · version {v.versionNo}</strong><span>This draft is not public.</span><a href={`/staff/packages/${previewPackageId}/edit`}>Back to editor</a></div>}
      {hero ? (
        <section class="hero short has-credit" aria-labelledby="pkg-title">
          <Picture photo={hero} sizes="100vw" eager />
          <div class="wrap">
            <p class="kicker"><span class="kicker-region">{v.region}</span><span class="sep" aria-hidden="true"> · </span><span class="kicker-code num">{v.packageCode}</span></p>
            <h1 id="pkg-title">{v.title}</h1>
            {v.destinations.length > 0 ? <p class="lede">{v.destinations.join(' · ')}</p> : null}
          </div>
          <p class="credit"><Credit photo={hero} /></p>
        </section>
      ) : (
        <section class="wrap plain-heading" aria-labelledby="pkg-title">
          <div class="message">
            <p class="kicker"><span class="kicker-region">{v.region}</span><span class="sep" aria-hidden="true"> · </span><span class="kicker-code num">{v.packageCode}</span></p>
            <h1 id="pkg-title">{v.title}</h1>
            {v.destinations.length > 0 ? <p class="lede">{v.destinations.join(' · ')}</p> : null}
          </div>
        </section>
      )}

      <div class="wrap detail">
        <article class="package-content">
          <p class="lead">{summary}</p>
          <DemoLabel origin={origin} />

          <dl class="at-a-glance">
            <div class="glance-item">
              <dt>Duration</dt>
              <dd class="glance-value">{duration(v)}</dd>
            </div>
            <div class="glance-item">
              <dt>Stays</dt>
              <dd class="glance-value">{stars ? `${stars} hotels` : 'Hotel category not listed'}</dd>
            </div>
            <div class="glance-item">
              <dt>Region</dt>
              <dd class="glance-value">{v.region}</dd>
            </div>
            <div class="glance-item">
              <dt>Package code</dt>
              <dd class="glance-value num">{v.packageCode}</dd>
            </div>
          </dl>

          <section class="detail-section" aria-labelledby="itinerary">
            <h2 id="itinerary">Day by day</h2>
            <ol class="itinerary" aria-labelledby="itinerary">
              {v.itinerary.map((d) => (
                <li class="itinerary-day">
                  <div class="day-col">
                    <span class="day num">Day {d.day}</span>
                  </div>
                  <div class="day-body">
                    <h3>{d.title}</h3>
                    {d.description ? <p>{d.description}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {band ? (
            <figure class="band">
              <Picture photo={band} sizes="(min-width: 62rem) 46rem, 100vw" />
              <figcaption class="credit-below"><Credit photo={band} /></figcaption>
            </figure>
          ) : null}

          <section class="detail-section" aria-labelledby="included">
            <h2 id="included">Included and not included</h2>
            <div class="two-col">
              <div class="col-group">
                <h3>Included</h3>
                {v.inclusions.length > 0 ? (
                  <ul class="list inclusions-list">
                    {v.inclusions.map((x) => (
                      <li>
                        <span class="item-icon" aria-hidden="true">✓</span>
                        <span>{x}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p class="fineprint">Not listed yet.</p>
                )}
              </div>
              <div class="col-group">
                <h3>Not included</h3>
                {v.exclusions.length > 0 ? (
                  <ul class="list exclusions-list">
                    {v.exclusions.map((x) => (
                      <li>
                        <span class="item-icon" aria-hidden="true">—</span>
                        <span>{x}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p class="fineprint">Not listed yet.</p>
                )}
              </div>
            </div>
          </section>

          <section class="detail-section" aria-labelledby="stays">
            <h2 id="stays">Where you stay</h2>
            <p class="stays">
              {stars ? `${stars} hotels throughout. ` : 'Hotel category not listed. '}
              {v.hotelNames?.length ? v.hotelNames.join(' · ') : 'Hotel names are not listed for this package yet.'}
            </p>
          </section>

          {v.destinations.length ? (
            <section class="route-map" aria-labelledby="route-map-title">
              <div class="route-map-header">
                <div>
                  <span class="route-kicker">Interactive Geographic Map</span>
                  <h2 id="route-map-title">Explore the stops on a map</h2>
                </div>
                <div class="route-stats-pill">
                  <span>{v.destinations.length} Key Stops</span>
                  <span class="sep">·</span>
                  <span>{v.days} Days Itinerary</span>
                </div>
              </div>
              <p class="hint">Click any stop on the map or timeline to view scenic transfers, highlights, and jump straight to that day's itinerary.</p>

              <div class="journey-timeline-bar" role="tablist" aria-label="Journey stops">
                {v.destinations.map((place, idx) => (
                  <button type="button" class={`timeline-step${idx === 0 ? ' is-active' : ''}`} data-dest={place} data-index={idx} role="tab">
                    <span class="step-num">{idx + 1}</span>
                    <span class="step-label">{place}</span>
                  </button>
                ))}
              </div>

              <div class="route-explorer-layout">
                <div class="map-viewport">
                  <svg class="journey-svg-map" viewBox="0 0 800 500" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label={`Route map illustration for ${v.title}`}>
                    <rect width="800" height="500" fill="#e8f3f6" />
                    <text x="65" y="270" fill="#9dbfc8" font-size="13" font-weight="600" letter-spacing="3" transform="rotate(-75 65 270)">ARABIAN SEA</text>
                    <text x="130" y="440" fill="#9dbfc8" font-size="11" font-weight="500" letter-spacing="2">Laccadive Sea</text>

                    <path d="M 120 0 L 800 0 L 800 500 L 370 500 C 350 480 300 450 280 420 C 250 370 210 330 220 300 C 225 280 240 250 235 220 C 230 190 180 150 160 110 C 145 80 140 40 120 0 Z" fill="#f8f5ee" stroke="#ded8cc" stroke-width="1.5" />

                    <path d="M 380 50 Q 420 120 450 190 Q 470 260 460 320 Q 430 380 370 440 Q 340 390 390 320 Q 400 250 370 180 Q 340 120 380 50 Z" fill="#e2ede6" opacity="0.85" />
                    <text x="495" y="90" fill="#8aa89b" font-size="11" font-weight="600" letter-spacing="1.5" transform="rotate(35 495 90)">WESTERN GHATS</text>

                    <path d="M 235 240 C 248 265 262 285 252 315 C 242 335 225 345 220 325 C 225 295 230 265 235 240 Z" fill="#cde5ea" stroke="#b2d7de" stroke-width="1.2" />
                    <text x="268" y="285" fill="#7ba3ab" font-size="10" font-weight="500">Vembanad Lake</text>

                    <path d="M 230 220 Q 330 180 430 140" stroke="#d5cebf" stroke-width="2" stroke-dasharray="3 3" />
                    <path d="M 430 140 Q 450 200 470 260" stroke="#d5cebf" stroke-width="2" stroke-dasharray="3 3" />
                    <path d="M 470 260 Q 350 290 220 310" stroke="#d5cebf" stroke-width="2" stroke-dasharray="3 3" />
                    <path d="M 220 310 Q 225 260 230 220" stroke="#d5cebf" stroke-width="2" stroke-dasharray="3 3" />

                    <path class="route-track-glow" d={generateRouteSvgPath(v.destinations)} stroke="rgba(164, 92, 50, 0.25)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" />
                    <path class="active-route-track" d={generateRouteSvgPath(v.destinations)} stroke="var(--copper)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="6 6" />

                    {v.destinations.map((place, idx) => {
                      const pt = getDestCoord(place, idx, v.destinations.length);
                      return (
                        <g class={`waypoint-pin${idx === 0 ? ' is-active' : ''}`} data-dest={place} data-index={idx} tabindex={0} role="button" aria-label={`Stop ${idx + 1}: ${place}`}>
                          <circle cx={pt.x} cy={pt.y} r="22" class="node-halo" fill="rgba(164,92,50,0.18)" />
                          <circle cx={pt.x} cy={pt.y} r="14" class="node-bg" fill="var(--forest)" stroke="#ffffff" stroke-width="2.5" />
                          <text x={pt.x} y={pt.y + 4.5} text-anchor="middle" class="node-num" fill="#ffffff" font-size="11" font-weight="700">{idx + 1}</text>
                          <rect x={pt.x - 44} y={pt.y + 20} width="88" height="22" rx="4" class="node-label-bg" fill="rgba(255,255,255,0.95)" stroke="var(--line)" />
                          <text x={pt.x} y={pt.y + 35} text-anchor="middle" class="node-label-text" fill="var(--ink)" font-size="11" font-weight="600">{place}</text>
                        </g>
                      );
                    })}
                  </svg>
                </div>

                <div class="stop-inspector-card" id="stop-inspector" aria-live="polite">
                  <div class="inspector-media">
                    <img class="inspector-img" src="/assets/images/munnar-tea-900.jpg" alt="Destination landscape preview" />
                    <span class="inspector-badge">Stop 1 of {v.destinations.length}</span>
                  </div>
                  <div class="inspector-body">
                    <span class="inspector-region">Kerala High Range</span>
                    <h3 class="inspector-title">{v.destinations[0]}</h3>
                    <p class="inspector-drive">Scenic transfer &amp; drive details</p>
                    <div class="inspector-highlights">
                      <strong class="highlights-title">Key Highlights:</strong>
                      <ul class="highlights-list">
                        <li>Scenic landscape and curated sightseeing</li>
                      </ul>
                    </div>
                    <div class="inspector-footer">
                      <button type="button" class="btn btn-jump-day" data-dest={v.destinations[0]}>View Itinerary Day Details ↓</button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          <section class="detail-section" aria-labelledby="prices">
            <h2 id="prices">Prices by season</h2>
            {v.seasons.length === 0 ? (
              <p class="fineprint">Prices for this package are not published yet.</p>
            ) : (
              <>
                <div id="fare-calculator" class="fare-calc-widget" data-seasons={JSON.stringify(v.seasons)}>
                  <div class="calc-header">
                    <span class="calc-kicker">Interactive Price &amp; Party Estimator</span>
                    <h3 class="calc-title">Customize your travel dates and group</h3>
                  </div>

                  <div class="calc-controls">
                    <div class="calc-group">
                      <span class="calc-label">1. Select Travel Season</span>
                      <div class="calc-season-picker">
                        {v.seasons.map((s, idx) => (
                          <button type="button" class={`calc-season-btn${idx === 0 ? ' active' : ''}`} data-index={idx}>
                            <strong>{s.name}</strong>
                            <span>{seasonDates(s)}</span>
                            <span class="calc-season-rate">{formatInr(s.pricePpTwinInr)} pp</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div class="calc-party-row">
                      <div class="calc-stepper">
                        <span class="calc-label">Adults (Twin Sharing)</span>
                        <div class="stepper-controls">
                          <button type="button" class="calc-dec-adults" aria-label="Decrease adults">−</button>
                          <span class="calc-val-adults num">2</span>
                          <button type="button" class="calc-inc-adults" aria-label="Increase adults">+</button>
                        </div>
                      </div>

                      <div class="calc-stepper">
                        <span class="calc-label">Children (with extra bed)</span>
                        <div class="stepper-controls">
                          <button type="button" class="calc-dec-kids" aria-label="Decrease children">−</button>
                          <span class="calc-val-children num">0</span>
                          <button type="button" class="calc-inc-kids" aria-label="Increase children">+</button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="calc-summary">
                    <div class="calc-total-box">
                      <span class="calc-total-label">Estimated Total for Party</span>
                      <span class="calc-total-fare num">—</span>
                      <span class="calc-per-person"></span>
                    </div>
                    <div class="calc-breakdown"></div>
                  </div>
                </div>

                <table class="prices">
                  <caption>All prices are {PRICE_BASIS}. {GST_NOTE}.</caption>
                  <thead>
                    <tr><th scope="col">Season</th><th scope="col">Travel dates</th><th scope="col">Price</th></tr>
                  </thead>
                  <tbody>
                    {v.seasons.map((s) => (
                      <tr>
                        <th scope="row">{s.name}</th>
                        <td>{seasonDates(s)}</td>
                        <td class="num">{formatInr(s.pricePpTwinInr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p class="fineprint">
                  GST: pending. Company A has not yet confirmed whether these prices include GST or how it is added.
                </p>
                {assumedDates ? (
                  <p class="fineprint">Season dates are given by month. Exact start and end dates are still to be confirmed.</p>
                ) : null}
                <p class="fineprint">Rates for children and solo travellers are not listed here.</p>
              </>
            )}
          </section>
        </article>

        <aside class="book" aria-label="Price and enquiry">
          <div class="head">
            {from !== null ? (
              <>
                <span class="from">From</span>
                <p class="amount num">{formatInr(from)}</p>
                <p class="basis">{PRICE_BASIS} · {GST_NOTE}</p>
              </>
            ) : (
              <p class="amount">Price to be confirmed</p>
            )}
          </div>
          {previewPackageId === undefined ? <a class="btn" href={enquirePath(v.packageSlug)}>Enquire</a> : <p class="fineprint">Enquiries open only on published pages.</p>}
        </aside>
      </div>
    </Layout>
  );
}

export function MessagePage(props: { title: string; body: string; ctx: PageContext; path: string; noindex?: boolean; linkText?: string; linkHref?: string }) {
  const meta: PageMeta = {
    title: `${props.title} | ${SITE_NAME}`,
    description: props.body,
    path: props.path,
    siteUrl: props.ctx.siteUrl,
    noindex: props.noindex ?? true,
  };
  return (
    <Layout meta={meta}>
      <div class="wrap">
        <div class="message">
          <h1>{props.title}</h1>
          <p>{props.body}</p>
          <a class="link" href={props.linkHref ?? '/#packages'}>{props.linkText ?? 'See all packages'}</a>
        </div>
      </div>
    </Layout>
  );
}
