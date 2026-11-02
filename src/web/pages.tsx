import { HOME_HERO, photosFor } from '../domain/photos.js';
import type { DataOrigin, PackageVersion } from '../domain/packages.js';
import { Credit, Layout, Picture, SITE_NAME, type PageMeta } from './layout.js';
import { groupByTheme, themePhoto, type ThemeGroup } from './themes.js';
import { cleanSummary, duration, formatInr, fromPrice, GST_NOTE, metaDescription, PRICE_BASIS, pluralise, seasonDates, starLabel } from './format.js';

// Server-rendered public pages. JSX output is escaped by Hono; nothing here builds HTML from strings.

export interface PageContext {
  siteUrl: string;
}

export const packagePath = (slug: string): string => `/packages/${slug}`;
export const enquirePath = (slug: string): string => `/enquire?package=${encodeURIComponent(slug)}`;

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
function catalogueFacts(packages: PackageVersion[]) {
  const days = packages.map((v) => v.days);
  const fares = packages.map((v) => fromPrice(v.seasons)).filter((n): n is number => n !== null);
  const [shortest, longest] = [Math.min(...days), Math.max(...days)];
  return {
    count: packages.length,
    length: shortest === longest ? pluralise(shortest, 'day') : `${shortest} to ${pluralise(longest, 'day')}`,
    lowestFare: fares.length > 0 ? Math.min(...fares) : null,
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
  const facts = packages.length > 0 ? catalogueFacts(packages) : null;
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
                    <div><dt>Fares from</dt><dd class="num">{formatInr(facts.lowestFare)}</dd></div>
                  ) : null}
                </dl>
              ) : null}
              {facts ? <p class="stub-basis">{PRICE_BASIS} · {GST_NOTE}</p> : null}
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
              <div><h3>Send an enquiry</h3><p>Tell us who is travelling, when, and your budget. A Company A consultant will read it and reply to you personally.</p></div>
            </li>
          </ol>
          <p class="fineprint">Demo build: an enquiry sent here is saved in a mock outbox, and nothing is sent to any email address or phone.</p>
        </div>
      </section>
    </Layout>
  );
}

export function PackagePage({ v, origin, ctx }: { v: PackageVersion; origin: DataOrigin | undefined; ctx: PageContext }) {
  const { hero, band } = photosFor(v.packageCode);
  const stars = starLabel(v.starRating);
  const from = fromPrice(v.seasons);
  const summary = cleanSummary(v.summary);
  const assumedDates = v.seasons.some((s) => s.rangeAssumed);
  const meta: PageMeta = {
    title: `${v.title}, ${duration(v)} | ${SITE_NAME}`,
    description: metaDescription(summary),
    path: packagePath(v.packageSlug),
    siteUrl: ctx.siteUrl,
    image: hero,
  };
  const heading = (
    <>
      <h1 id="pkg-title">{v.title}</h1>
      {v.destinations.length > 0 ? <p class="lede">{v.destinations.join(' · ')}</p> : null}
    </>
  );
  return (
    <Layout meta={meta} overImage={hero !== null} hasBook>
      {hero ? (
        <section class="hero short has-credit" aria-labelledby="pkg-title">
          <Picture photo={hero} sizes="100vw" eager />
          <div class="wrap">{heading}</div>
          <p class="credit"><Credit photo={hero} /></p>
        </section>
      ) : (
        <section class="wrap" aria-labelledby="pkg-title">
          <div class="message">{heading}</div>
        </section>
      )}
      <div class="wrap detail">
        <article>
          <p class="lead">{summary}</p>
          <DemoLabel origin={origin} />
          <dl class="at-a-glance">
            <div><dt>Duration</dt><dd>{duration(v)}</dd></div>
            <div><dt>Stays</dt><dd>{stars ? `${stars} hotels` : 'Hotel category not listed'}</dd></div>
            <div><dt>Region</dt><dd>{v.region}</dd></div>
            <div><dt>Package code</dt><dd class="num">{v.packageCode}</dd></div>
          </dl>

          <h2 id="itinerary">Day by day</h2>
          <ol class="itinerary" aria-labelledby="itinerary">
            {v.itinerary.map((d) => (
              <li>
                <span class="day num">Day {d.day}</span>
                <div>
                  <h3>{d.title}</h3>
                  {d.description ? <p>{d.description}</p> : null}
                </div>
              </li>
            ))}
          </ol>

          {band ? (
            <figure class="band">
              <Picture photo={band} sizes="(min-width: 62rem) 46rem, 100vw" />
              <figcaption class="credit-below"><Credit photo={band} /></figcaption>
            </figure>
          ) : null}

          <h2 id="included">Included and not included</h2>
          <div class="two-col">
            <div>
              <h3>Included</h3>
              {v.inclusions.length > 0 ? (
                <ul class="list">{v.inclusions.map((x) => <li>{x}</li>)}</ul>
              ) : (
                <p class="fineprint">Not listed yet.</p>
              )}
            </div>
            <div>
              <h3>Not included</h3>
              {v.exclusions.length > 0 ? (
                <ul class="list">{v.exclusions.map((x) => <li>{x}</li>)}</ul>
              ) : (
                <p class="fineprint">Not listed yet.</p>
              )}
            </div>
          </div>

          <h2 id="stays">Where you stay</h2>
          <p class="stays">
            {stars ? `${stars} hotels throughout. ` : 'Hotel category not listed. '}
            Hotel names are not listed for this package yet.
          </p>

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
          <a class="btn" href={enquirePath(v.packageSlug)}>Enquire</a>
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
