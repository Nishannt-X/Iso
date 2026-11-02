import { HOME_HERO, photosFor } from '../domain/photos.js';
import type { DataOrigin, PackageVersion } from '../domain/packages.js';
import { Credit, Layout, Picture, SITE_NAME, type PageMeta } from './layout.js';
import { cleanSummary, duration, formatInr, fromPrice, GST_NOTE, metaDescription, PRICE_BASIS, seasonDates, starLabel } from './format.js';
import { STAFF_CSS } from './staff-styles.js';

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

function PackageRow({ v, origin }: { v: PackageVersion; origin: DataOrigin | undefined }) {
  const { hero } = photosFor(v.packageCode);
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

export function HomePage({ packages, origins, ctx }: { packages: PackageVersion[]; origins: Map<number, DataOrigin>; ctx: PageContext }) {
  const meta: PageMeta = {
    title: 'Kerala and South India holiday packages | Kochi Tours',
    description: 'Tour packages from Kochi across Kerala and South India for families, honeymooners and groups, with day-wise itineraries and seasonal per-person prices.',
    path: '/',
    siteUrl: ctx.siteUrl,
    image: HOME_HERO,
  };
  return (
    <Layout meta={meta} overImage>
      <section class="hero has-credit" aria-labelledby="home-title">
        <Picture photo={HOME_HERO} sizes="100vw" eager class="low" />
        <div class="wrap">
          <h1 id="home-title">Kerala and South India, from Kochi</h1>
          <p class="lede">Holiday packages for families, honeymooners and groups, with every day laid out and every price stated per person.</p>
          <a class="go" href="#packages">See the packages</a>
        </div>
        <p class="credit"><Credit photo={HOME_HERO} /></p>
      </section>
      <section class="section" id="packages" aria-labelledby="packages-title">
        <div class="wrap">
          <div class="section-head">
            <h2 id="packages-title">Packages</h2>
            {packages.length > 0 ? <p class="count">{packages.length} available</p> : null}
          </div>
          <form action="/packages" method="get" class="package-search"><label for="home-search">Find a place or experience</label><div><input id="home-search" name="q" type="search" maxlength={80} placeholder="Try Munnar or houseboat" /><button class="btn" type="submit">Search</button></div></form>
          {packages.length === 0 ? (
            <p class="empty">No packages are published yet. Please check back soon.</p>
          ) : (
            <>
              <p class="notice">
                Prices are per person on twin sharing. GST is pending: Company A has not yet confirmed whether it is included or how it is charged.
              </p>
              <ul class="rows">
                {packages.map((v) => (
                  <PackageRow v={v} origin={origins.get(v.packageId)} />
                ))}
              </ul>
            </>
          )}
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
  const { hero, band } = photosFor(v.packageCode);
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
  const heading = (
    <>
      <h1 id="pkg-title">{v.title}</h1>
      {v.destinations.length > 0 ? <p class="lede">{v.destinations.join(' · ')}</p> : null}
    </>
  );
  return (
    <Layout meta={meta} overImage={hero !== null} hasBook extraCss={previewPackageId === undefined ? undefined : STAFF_CSS}>
      {previewPackageId === undefined ? null : <div class="preview-banner" role="status"><strong>Private preview · version {v.versionNo}</strong><span>This draft is not public.</span><a href={`/staff/packages/${previewPackageId}/edit`}>Back to editor</a></div>}
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
