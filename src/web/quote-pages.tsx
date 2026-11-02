import type { PackageVersion } from '../domain/packages.js';
import type { StoredQuote } from '../domain/package-quotes.js';
import { formatInr } from './format.js';
import { Layout } from './layout.js';
import type { PageContext } from './pages.js';
import { CsrfField, StaffShell, type Viewer } from './staff-pages.js';

export function QuoteBuilderPage({ ctx, viewer, enquiryId, versions, defaults, error }: { ctx: PageContext; viewer: Viewer; enquiryId: number; versions: PackageVersion[]; defaults: { slug: string; date: string; adults: number; children: number }; error?: string }) {
  return <StaffShell ctx={ctx} viewer={viewer} title="Build a quote" path="/staff/quotes/new" section="inbox"><div class="wrap staff-page cms"><a class="link back" href={`/staff/enquiries/${enquiryId}`}>Back to enquiry</a><h1>Build a quote</h1><p class="lede">Select a published package and travel date. The fare is calculated from that package’s current price table and saved as a snapshot.</p>
    {error ? <p class="error-summary" role="alert">{error}</p> : null}
    <form class="form cms-form" method="post" action="/staff/quotes/new"><CsrfField token={viewer.csrfToken} /><input type="hidden" name="enquiryId" value={enquiryId} />
      <section class="panel"><h2>Journey and party</h2><div class="cms-fields">
        <div class="field full"><label for="quote-package">Package</label><select id="quote-package" name="slug" required>{versions.map((v) => <option value={v.packageSlug} selected={v.packageSlug === defaults.slug}>{v.title} · {v.packageCode}</option>)}</select></div>
        <div class="field"><label for="quote-date">Start date</label><input id="quote-date" name="date" type="date" value={defaults.date} required /></div>
        <div class="field"><label for="quote-adults">Adults</label><input id="quote-adults" name="adults" type="number" min="1" max="50" value={defaults.adults} required /></div>
        <div class="field"><label for="quote-children">Children</label><input id="quote-children" name="children" type="number" min="0" max="20" value={defaults.children} required /></div>
      </div></section><p class="hint">GST and child fare are shown as unpriced when Company A has not supplied rules. A quote with missing rules is a partial estimate.</p><button class="btn" type="submit">Create private quote</button>
    </form>
  </div></StaffShell>;
}

export function QuoteSummary({ row }: { row: StoredQuote }) {
  const s = row.snapshot;
  return <><p class="eyebrow">{s.code} · {s.days} days · {s.hotels}</p><h1>{s.title}</h1><p class="lede">Starting {s.startDate} · {s.adults} adults · {s.children} children</p>
    <section class="panel"><h2>{s.pricing.status === 'partial' ? 'Partial fare estimate' : 'Fare estimate'}</h2><p class="hint">Per person, twin sharing. Amounts are based on package version {s.versionNo} at the time this quote was created.</p>
      <dl class="fields">{s.pricing.lines.map((l) => <div><dt>{l.label} × {l.quantity}</dt><dd>{formatInr(l.amount_inr)}</dd></div>)}<div><dt>Subtotal</dt><dd><strong>{formatInr(s.pricing.subtotal_inr ?? 0)}</strong></dd></div><div><dt>GST</dt><dd>{s.pricing.gst ? formatInr(s.pricing.gst.amount_inr) : 'To be confirmed; not included'}</dd></div>{s.pricing.total_inr !== undefined ? <div><dt>Total</dt><dd><strong>{formatInr(s.pricing.total_inr)}</strong></dd></div> : null}</dl>
      {s.pricing.unpriced.length ? <div class="error-summary"><strong>Needs confirmation</strong><ul>{s.pricing.unpriced.map((x) => <li>{x.message}</li>)}</ul></div> : null}
      <ul class="hint">{s.pricing.assumptions.map((a) => <li>{a}</li>)}</ul>
    </section></>;
}

export function StaffQuotePage({ ctx, viewer, row, error }: { ctx: PageContext; viewer: Viewer; row: StoredQuote; error?: string }) {
  const publicPath = `/quote/${row.token}`;
  return <StaffShell ctx={ctx} viewer={viewer} title={`Quote ${row.id}`} path={`/staff/quotes/${row.id}`} section="inbox"><div class="wrap staff-page cms"><a class="link back" href={`/staff/enquiries/${row.enquiryId}`}>Back to enquiry</a><p class="eyebrow">Quote #{row.id} · {row.status === 'draft' ? 'Private draft' : row.status === 'approved' ? 'Approved' : 'Mock delivery recorded'}</p>
    {error ? <p class="error-summary" role="alert">{error}</p> : null}<QuoteSummary row={row} />
    {row.status === 'draft' ? <form method="post" action={`/staff/quotes/${row.id}/approve`}><CsrfField token={viewer.csrfToken} /><div class="check"><input id="quote-review" type="checkbox" name="review" value="yes" required /><label for="quote-review">I have checked the fare, missing rules and date. This approval makes the link visible to anyone who has it.</label></div><button class="btn" type="submit">Approve quote</button></form> : <><p><a class="btn secondary" href={publicPath} target="_blank" rel="noopener noreferrer">Open shareable quote</a> <a class="btn secondary" href={`${publicPath}/download`}>Download PDF</a></p><p class="hint">Shareable link: {ctx.siteUrl}{publicPath}</p>
      {row.status === 'approved' ? <form method="post" action={`/staff/quotes/${row.id}/record`}><CsrfField token={viewer.csrfToken} /><button class="btn" type="submit">Record mock send</button><p class="hint">This only records an action. It does not send a message.</p></form> : <p class="banner">Mock send recorded. No external message was sent.</p>}</>}
  </div></StaffShell>;
}

export function PublicQuotePage({ ctx, row }: { ctx: PageContext; row: StoredQuote }) {
  return <Layout meta={{ title: `Quote ${row.id} | Kochi Tours`, description: `Fare estimate for ${row.snapshot.title}`, path: `/quote/${row.token}`, siteUrl: ctx.siteUrl, noindex: true }}><main class="section"><div class="wrap cms"><p class="eyebrow">Your journey, considered</p><QuoteSummary row={row} /><p><a class="btn secondary" href={`/quote/${row.token}/download`}>Download PDF</a></p><p class="hint">This demo quote does not confirm availability or a booking. Please ask a consultant to confirm the final fare and GST.</p></div></main></Layout>;
}
