import { HOME_HERO, PHOTOS, photosFor, type PhotoId } from '../domain/photos.js';
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

/** A photograph of the place itself, only where the credited library has one. Other places get a plain tile. */
const DESTINATION_PHOTO: Record<string, PhotoId> = {
  alleppey: 'alleppey-sunset', goa: 'goa-vagator', kochi: 'fort-kochi-nets', kovalam: 'kovalam-lighthouse', munnar: 'munnar-tea', thekkady: 'periyar-lake',
};

function PageHead(props: { eyebrow: string; title: string; lede: string; back?: { href: string; text: string } }) {
  return (
    <header class="page-head">
      {props.back ? <a class="link back" href={props.back.href}>{props.back.text}</a> : null}
      <p class="micro rise">{props.eyebrow}</p>
      <h1 class="rise d1">{props.title}</h1>
      <p class="lede rise d2">{props.lede}</p>
    </header>
  );
}

export function DestinationIndexPage({ packages, ctx }: { packages: PackageVersion[]; ctx: PageContext }) {
  const names = [...new Set(packages.flatMap((p) => p.destinations))].sort((a, b) => a.localeCompare(b));
  return (
    <Layout meta={{ title: 'Destinations | Kochi Tours', description: 'Find tours by place across Kerala and South India.', path: '/destinations', siteUrl: ctx.siteUrl }}>
      <section class="section"><div class="wrap">
        <PageHead eyebrow="Places" title="Travel by destination" lede="Choose a place, then see the journeys that include it." />
        {names.length ? (
          <ul class="dest-tiles" data-reveal>
            {names.map((name) => {
              const id = DESTINATION_PHOTO[destinationSlug(name)];
              const photo = id ? PHOTOS[id] : null;
              const count = packages.filter((p) => p.destinations.includes(name)).length;
              return (
                <li class={photo ? 'dest-tile' : 'dest-tile plain'}>
                  <figure>
                    <div class="dest-media">
                      {photo ? <Picture photo={photo} sizes="(min-width: 64rem) 22rem, (min-width: 40rem) 45vw, 100vw" /> : null}
                      <div class="dest-label">
                        <h2><a href={destinationPath(name)}>{name}</a></h2>
                        <p>{pluralise(count, 'journey')}<span aria-hidden="true">→</span></p>
                      </div>
                    </div>
                    {photo ? <figcaption class="credit-below"><Credit photo={photo} /></figcaption> : null}
                  </figure>
                </li>
              );
            })}
          </ul>
        ) : <p class="empty">No destinations are published yet.</p>}
      </div></section>
    </Layout>
  );
}

export function DestinationPage({ name, packages, origins, ctx }: { name: string; packages: PackageVersion[]; origins: Map<number, DataOrigin>; ctx: PageContext }) {
  return (
    <Layout meta={{ title: `${name} tours | Kochi Tours`, description: `Published holiday packages that include ${name}.`, path: destinationPath(name), siteUrl: ctx.siteUrl }}>
      <section class="section"><div class="wrap">
        <PageHead back={{ href: '/destinations', text: 'All destinations' }} eyebrow="Destination" title={name} lede={`Journeys that include ${name}. Compare each itinerary, hotel category and seasonal price.`} />
        <p class="map-action"><a class="ghost" href={mapPath(name)} target="_blank" rel="noopener noreferrer">Open {name} on OpenStreetMap ↗</a></p>
        <div class="section-head"><h2>Journeys</h2><p class="count">{pluralise(packages.length, 'journey')}</p></div>
        <ul class="cards" data-reveal>{packages.map((p) => <PackageRow v={p} origin={origins.get(p.packageId)} />)}</ul>
      </div></section>
    </Layout>
  );
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
    <li class="pcard">
      <figure class="shot">
        <div class={hero ? 'thumb' : 'thumb none'}>
          {hero ? <Picture photo={hero} sizes="(min-width: 64rem) 22rem, (min-width: 40rem) 45vw, 100vw" /> : <span>Photo to come</span>}
          <span class="pcard-len">{duration(v)}</span>
        </div>
        {hero ? <figcaption class="credit-below"><Credit photo={hero} /></figcaption> : null}
      </figure>
      <div class="pcard-body">
        <p class="micro"><span class="mono">{v.packageCode}</span> · {v.region}</p>
        <h2><a href={packagePath(v.packageSlug)}>{v.title}</a></h2>
        <p class="facts">{[stars ? `${stars} stays` : null, v.destinations.join(' · ')].filter(Boolean).join(' · ')}</p>
        <p class="summary">{cleanSummary(v.summary)}</p>
        <PriceLine seasons={v.seasons} />
        <DemoLabel origin={origin} />
        <span class="pcard-go" aria-hidden="true">View journey</span>
      </div>
    </li>
  );
}

function Journey({ v, origin }: { v: PackageVersion; origin: DataOrigin | undefined }) {
  const stars = starLabel(v.starRating);
  return (
    <li class="trip" data-origin={origin}>
      <p class="cell code mono"><span class="legend">Code</span>{v.packageCode}</p>
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
    <section class="theme" aria-labelledby={id} data-reveal>
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
              <h1 id="home-title" class="rise">Kerala and South India, from Kochi</h1>
              <p class="lede rise d1">Holiday packages for families, honeymooners and groups, with every day laid out and every price stated per person.</p>
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
              <form action="/packages" method="get" class="hero-search" role="search">
                <label for="home-search" class="micro">Find a place or experience</label>
                <div><input id="home-search" name="q" type="search" maxlength={80} placeholder="Try Munnar or houseboat" /><button class="btn" type="submit">Search</button></div>
              </form>
              <a class="go-link" href="#packages">Or browse all journeys</a>
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
          {groups.length > 1 ? (
            <nav class="theme-jump" aria-label="Jump to a theme">
              <span class="micro">Jump to</span>
              <ul>
                {groups.map(({ theme }) => (
                  <li><a href={`#${theme ? `theme-${theme.id}` : 'theme-more'}`}>{theme ? theme.title : 'More journeys'}</a></li>
                ))}
              </ul>
            </nav>
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

      <section class="section how" id="how" aria-labelledby="how-title" data-reveal>
        <div class="wrap">
          <p class="micro">Three steps</p>
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
      <PageHead eyebrow="Explore" title="Find your next journey" lede="Search by place or experience. Every fare is per person on twin sharing, with GST pending." />
      <form action="/packages" method="get" class="package-search" role="search"><label for="package-search">Destination or experience</label><div><input id="package-search" name="q" type="search" value={query} maxlength={80} placeholder="Try Munnar or houseboat" /><button class="btn" type="submit">Search</button></div></form>
      <div class="section-head"><h2>{query ? `Results for “${query}”` : 'All packages'}</h2><p class="count">{matches.length} {matches.length === 1 ? 'package' : 'packages'}</p></div>
      {matches.length ? <ul class="cards" data-reveal>{matches.map((v) => <PackageRow v={v} origin={origins.get(v.packageId)} />)}</ul> : <div class="empty-state"><p class="micro">No matches</p><p>No published package matches that search. Try a place such as Munnar, or a word such as houseboat.</p><a class="ghost" href="/packages">See all packages</a></div>}
    </div></section>
  </Layout>;
}

/**
 * The stops of a package, in itinerary order. The route strip is a schematic, not a map: no coordinates,
 * distances or travel times exist in the data, so none are drawn. Each stop panel uses only package data:
 * the itinerary days whose title or text names the stop, a library photo of that place when one exists
 * (credited beside it), and links. Every panel is in the HTML; app.js only shows one at a time.
 */
function RouteStops({ v, linkDestinations }: { v: PackageVersion; linkDestinations: boolean }) {
  return (
    <section class="route-map" aria-labelledby="route-map-title" data-reveal data-stops>
      <p class="micro">Route at a glance</p>
      <h2 id="route-map-title">The stops, in order</h2>
      <p class="hint">A schematic in itinerary order, not to scale. Distances and travel times are not listed. OpenStreetMap links open in a new tab and show places, not a promised route.</p>
      <ol class="route-strip">
        {v.destinations.map((place, i) => (
          <li class="route-node"><a href={`#stop-${i + 1}`}><span class="node-no mono" aria-hidden="true">{i + 1}</span><span class="node-name">{place}</span></a></li>
        ))}
      </ol>
      <div class="stop-panels">
        {v.destinations.map((place, i) => {
          const needle = place.toLocaleLowerCase('en-IN');
          const days = v.itinerary.filter((d) => `${d.title} ${d.description}`.toLocaleLowerCase('en-IN').includes(needle));
          const photoId = DESTINATION_PHOTO[destinationSlug(place)];
          const photo = photoId ? PHOTOS[photoId] : null;
          return (
            <article class="stop-panel" id={`stop-${i + 1}`} tabindex={-1} aria-labelledby={`stop-${i + 1}-title`}>
              {photo ? (
                <figure class="stop-photo">
                  <Picture photo={photo} sizes="(min-width: 62rem) 18rem, 100vw" />
                  <figcaption class="credit-below"><Credit photo={photo} /></figcaption>
                </figure>
              ) : null}
              <div class="stop-body">
                <p class="micro">Stop {i + 1} of {v.destinations.length}</p>
                <h3 id={`stop-${i + 1}-title`}>{place}</h3>
                {days.length ? (
                  <ul class="stop-days">
                    {days.map((d) => <li><a href={`#day-${d.day}`}><span class="mono">Day {d.day}</span> {d.title}</a></li>)}
                  </ul>
                ) : <p class="stop-days-all"><a href="#itinerary">Explore the full itinerary</a></p>}
                <p class="stop-links">
                  <a class="ghost" href={mapPath(place)} target="_blank" rel="noopener noreferrer">{place} on OpenStreetMap ↗</a>
                  {linkDestinations ? <a class="go-link" href={destinationPath(place)}>All journeys to {place}</a> : null}
                </p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
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
    <Layout meta={meta} overImage={hero !== null} hasBook extraCss={previewPackageId === undefined ? undefined : STAFF_CSS}>
      {previewPackageId === undefined ? null : <div class="preview-banner" role="status"><strong>Private preview · version {v.versionNo}</strong><span>This draft is not public.</span><a href={`/staff/packages/${previewPackageId}/edit`}>Back to editor</a></div>}
      {hero ? (
        <section class="hero short has-credit" aria-labelledby="pkg-title">
          <Picture photo={hero} sizes="100vw" eager />
          <div class="wrap">
            <p class="kicker"><span class="kicker-region">{v.region}</span><span class="sep" aria-hidden="true"> · </span><span class="kicker-code mono">{v.packageCode}</span></p>
            <h1 id="pkg-title" class="rise">{v.title}</h1>
            {v.destinations.length > 0 ? <p class="lede rise d1">{v.destinations.join(' · ')}</p> : null}
          </div>
          <p class="credit"><Credit photo={hero} /></p>
        </section>
      ) : (
        <section class="wrap plain-heading" aria-labelledby="pkg-title">
          <div class="message">
            <p class="kicker"><span class="kicker-region">{v.region}</span><span class="sep" aria-hidden="true"> · </span><span class="kicker-code mono">{v.packageCode}</span></p>
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
              <dd class="glance-value mono">{v.packageCode}</dd>
            </div>
          </dl>

          <section class="detail-section" aria-labelledby="itinerary">
            <h2 id="itinerary">Day by day</h2>
            <ol class="itinerary" aria-labelledby="itinerary">
              {v.itinerary.map((d) => (
                <li class="itinerary-day" id={`day-${d.day}`}>
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

          <section class="detail-section" aria-labelledby="included" data-reveal>
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

          <section class="detail-section" aria-labelledby="stays" data-reveal>
            <h2 id="stays">Where you stay</h2>
            <p class="stays">
              {stars ? `${stars} hotels throughout. ` : 'Hotel category not listed. '}
              {v.hotelNames?.length ? v.hotelNames.join(' · ') : 'Hotel names are not listed for this package yet.'}
            </p>
          </section>

          {v.destinations.length ? <RouteStops v={v} linkDestinations={previewPackageId === undefined} /> : null}

          <section class="detail-section" aria-labelledby="prices" data-reveal>
            <h2 id="prices">Prices by season</h2>
            {v.seasons.length === 0 ? (
              <p class="fineprint">Prices for this package are not published yet.</p>
            ) : (
              <>
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
          <p class="micro rise">{SITE_NAME}</p>
          <h1 class="rise d1">{props.title}</h1>
          <p class="rise d2">{props.body}</p>
          <a class="ghost" href={props.linkHref ?? '/#packages'}>{props.linkText ?? 'See all packages'}</a>
        </div>
      </div>
    </Layout>
  );
}
