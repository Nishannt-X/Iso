import type { Child } from 'hono/jsx';
import { inboxQueryString, PAGE_SIZE, STATUS_LABEL, STATUSES, type ActivityRow, type InboxPage, type InboxQuery, type InboxRow, type Status } from '../domain/triage.js';
import type { Sla } from '../domain/sla.js';
import { TARGET_MINUTES } from '../domain/sla.js';
import type { Role, StaffUser } from '../domain/staff.js';
import { formatReceived, pluralise } from './format.js';
import { Layout, SITE_NAME, type PageMeta } from './layout.js';
import type { PageContext } from './pages.js';
import { STAFF_CSS } from './staff-styles.js';

// Server-rendered staff pages. Every page is noindex and every state-changing form carries the session's CSRF token.
// JSX output is escaped by Hono, so names, messages and notes typed by travellers or staff cannot inject markup.

export interface Viewer {
  id: number;
  name: string;
  role: Role;
  csrfToken: string;
}

export type StaffSection = 'inbox' | 'packages' | 'blogs' | 'activity' | null;

export const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', agent: 'Consultant', editor: 'Content editor' };

export function CsrfField({ token }: { token: string }) {
  return <input type="hidden" name="_csrf" value={token} />;
}

/** The staff page shell: a header with navigation and sign-out, no public footer, noindex. */
export function StaffShell(props: { ctx: PageContext; viewer: Viewer | null; title: string; path: string; section?: StaffSection; children: Child }) {
  const { viewer } = props;
  const meta: PageMeta = {
    title: `${props.title} | Staff | ${SITE_NAME}`,
    description: 'Staff area.',
    path: props.path,
    siteUrl: props.ctx.siteUrl,
    noindex: true,
  };
  const nav = viewer ? (
    <nav class="staff-nav" aria-label="Staff">
      {viewer.role !== 'editor' ? <a href="/staff/inbox" aria-current={props.section === 'inbox' ? 'page' : undefined}>Inbox</a> : null}
      {viewer.role === 'admin' ? <a href="/staff/packages" aria-current={props.section === 'packages' ? 'page' : undefined}>Packages</a> : null}
      {viewer.role !== 'agent' ? <a href="/staff/blogs" aria-current={props.section === 'blogs' ? 'page' : undefined}>Journal</a> : null}
      {viewer.role === 'admin' ? <a href="/staff/activity" aria-current={props.section === 'activity' ? 'page' : undefined}>Activity</a> : null}
      <span class="who">{viewer.name} · {ROLE_LABEL[viewer.role]}</span>
      <form method="post" action="/staff/logout">
        <CsrfField token={viewer.csrfToken} />
        <button class="linkbtn" type="submit">Sign out</button>
      </form>
    </nav>
  ) : (
    <nav class="staff-nav" aria-label="Staff">
      <a href="/">Public site</a>
    </nav>
  );
  return (
    <Layout meta={meta} nav={nav} footer={null} extraCss={STAFF_CSS} brandHref={viewer?.role === 'editor' ? '/staff/blogs' : viewer ? '/staff/inbox' : '/'}>
      {props.children}
    </Layout>
  );
}

export function StaffMessage(props: { ctx: PageContext; viewer: Viewer | null; title: string; body: string; linkHref?: string; linkText?: string; path?: string }) {
  return (
    <StaffShell ctx={props.ctx} viewer={props.viewer} title={props.title} path={props.path ?? '/staff'}>
      <div class="wrap staff-page">
        <h1>{props.title}</h1>
        <p class="lede">{props.body}</p>
        {props.linkHref ? <p><a class="link back" href={props.linkHref}>{props.linkText ?? 'Back'}</a></p> : null}
      </div>
    </StaffShell>
  );
}

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------

export function LoginPage(props: { ctx: PageContext; error?: string; email?: string; next?: string }) {
  return (
    <StaffShell ctx={props.ctx} viewer={null} title={props.error ? 'Error: Sign in' : 'Sign in'} path="/staff/login">
      <div class="wrap">
        <div class="login">
          <h1>Staff sign in</h1>
          <p class="lede">For Company A consultants and admins.</p>
          {props.error ? (
            <div class="error-summary" id="error-summary" tabindex={-1} autofocus role="group" aria-labelledby="error-summary-title">
              <h2 id="error-summary-title">Could not sign you in</h2>
              <p>{props.error}</p>
            </div>
          ) : null}
          <form method="post" action="/staff/login" class="form" accept-charset="utf-8">
            {props.next ? <input type="hidden" name="next" value={props.next} /> : null}
            <div class="field">
              <label for="email">Email</label>
              <input type="email" id="email" name="email" value={props.email ?? ''} autocomplete="username" inputmode="email" required maxlength={254} />
            </div>
            <div class="field">
              <label for="password">Password</label>
              <input type="password" id="password" name="password" autocomplete="current-password" required maxlength={256} />
            </div>
            <button class="btn" type="submit">Sign in</button>
          </form>
          <p class="demo-note">
            Demo build with synthetic staff accounts. The README lists the demo sign-ins. Nothing done here is sent to any real traveller.
          </p>
        </div>
      </div>
    </StaffShell>
  );
}

// ---------------------------------------------------------------------------
// Waiting-time indicator (shared by the inbox and the workspace)
// ---------------------------------------------------------------------------

/** A short phrase that repeats what the colour means, so the indicator never relies on colour alone. */
export function slaNote(sla: Sla): string {
  switch (sla.state) {
    case 'within_target': return 'Within the 1-hour target';
    case 'past_target': return 'Past the 1-hour target';
    case 'late': return '12 hours or more';
    case 'answered': return sla.elapsedMinutes <= TARGET_MINUTES ? 'Within the 1-hour target' : 'After the 1-hour target';
    case 'closed_unanswered': return '';
  }
}

export function SlaCell({ sla }: { sla: Sla }) {
  const note = slaNote(sla);
  return (
    <div class={`q-sla sla-${sla.state}`}>
      <strong><span class="mark" aria-hidden="true" />{sla.label}</strong>
      {note ? <small>{note}</small> : null}
    </div>
  );
}

export const StatusChip = ({ status }: { status: Status }) => <span class={`chip s-${status}`}>{STATUS_LABEL[status]}</span>;

export const partyText = (adults: number, children: number): string =>
  children > 0 ? `${pluralise(adults, 'adult')}, ${pluralise(children, 'child', 'children')}` : pluralise(adults, 'adult');

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

const TABS: { status: InboxQuery['status']; label: string }[] = [
  { status: 'open', label: 'Open' },
  ...STATUSES.map((s) => ({ status: s as InboxQuery['status'], label: STATUS_LABEL[s] })),
  { status: 'all', label: 'All' },
];

function Row({ r, viewerId }: { r: InboxRow; viewerId: number }) {
  return (
    <li>
      <a class="q-row" href={`/staff/enquiries/${r.id}`}>
        <div>
          <span class="q-ref">{r.reference}</span>
          <span class="q-when">{formatReceived(r.createdAt)}</span>
        </div>
        <div>
          <span class="q-name">{r.name}{r.isSample ? <span class="chip sample">Sample from brief</span> : null}</span>
          <span class="q-sub">{partyText(r.adults, r.children)} · {r.packageTitle} · {r.intakeChannel === 'web' ? 'Website' : r.intakeChannel}</span>
        </div>
        <div>
          <StatusChip status={r.status} />
          <div class="q-who">{r.assigneeName ? (r.assigneeId === viewerId ? `${r.assigneeName} (you)` : r.assigneeName) : 'Unassigned'}</div>
        </div>
        <SlaCell sla={r.sla} />
      </a>
    </li>
  );
}

export function InboxPageView(props: { ctx: PageContext; viewer: Viewer; data: InboxPage; query: InboxQuery; staff: StaffUser[] }) {
  const { data, query, viewer } = props;
  const filtered = query.q !== '' || query.assignee !== 'any';
  const first = (data.page - 1) * PAGE_SIZE + 1;
  const last = Math.min(data.total, first + data.rows.length - 1);
  const href = (over: Partial<InboxQuery>) => `/staff/inbox${inboxQueryString({ ...query, page: 1, ...over })}`;
  return (
    <StaffShell ctx={props.ctx} viewer={viewer} title="Enquiries" path="/staff/inbox" section="inbox">
      <div class="wrap staff-page">
        <div class="cms-head"><div><h1>Enquiries</h1><p class="lede">Website and staff-logged external enquiries share one queue. Open one to assign it, add notes and record a reply.</p></div><a class="btn secondary" href="/staff/intake/new">Log external enquiry</a></div>

        <nav class="tabs" aria-label="Status">
          {TABS.map((t) => (
            <a href={href({ status: t.status })} aria-current={query.status === t.status ? 'page' : undefined}>
              {t.label} <span class="n">{data.counts[t.status]}</span>
            </a>
          ))}
        </nav>

        <form class="filters" method="get" action="/staff/inbox" role="search">
          {query.status !== 'open' ? <input type="hidden" name="status" value={query.status} /> : null}
          <div class="field">
            <label for="q">Search</label>
            <input type="search" id="q" name="q" value={query.q} maxlength={100} placeholder="Reference, name, email, phone or package" autocomplete="off" />
          </div>
          <div class="field">
            <label for="assignee">Assigned to</label>
            <select id="assignee" name="assignee">
              <option value="any" selected={query.assignee === 'any'}>Anyone</option>
              <option value="me" selected={query.assignee === 'me'}>Me</option>
              <option value="unassigned" selected={query.assignee === 'unassigned'}>Unassigned</option>
              {props.staff.map((u) => <option value={String(u.id)} selected={query.assignee === u.id}>{u.name}</option>)}
            </select>
          </div>
          <div class="field">
            <label for="sort">Order</label>
            <select id="sort" name="sort">
              <option value="oldest" selected={query.sort === 'oldest'}>Oldest first</option>
              <option value="newest" selected={query.sort === 'newest'}>Newest first</option>
            </select>
          </div>
          <div class="actions">
            <button class="btn" type="submit">Apply</button>
            {filtered || query.sort !== 'oldest' ? <a href={`/staff/inbox${query.status !== 'open' ? `?status=${query.status}` : ''}`}>Clear</a> : null}
          </div>
        </form>

        <p class="legend">
          Waiting time is elapsed clock time since the enquiry arrived, set against the 1-hour reply target in the client brief. No working
          hours are applied, and it is a prompt for staff, not a promise to travellers.
        </p>

        {data.total === 0 ? (
          data.counts.all === 0 && !filtered ? (
            <div class="empty-state">
              <h2>No enquiries yet</h2>
              <p>They appear here as soon as a traveller sends the form on a package page.</p>
            </div>
          ) : (
            <div class="empty-state">
              <h2>No enquiries match</h2>
              <p>Nothing has this status and these filters. <a href={href({ status: 'all', assignee: 'any', q: '' })}>Show all enquiries</a>.</p>
            </div>
          )
        ) : data.rows.length === 0 ? (
          <div class="empty-state">
            <h2>No enquiries on this page</h2>
            <p>There are {data.total} in this view, on {pluralise(data.pageCount, 'page')}. <a href={href({ page: 1 })}>Go to the first page</a>.</p>
          </div>
        ) : (
          <>
            <ul class="queue" aria-label="Enquiries">
              {data.rows.map((r) => <Row r={r} viewerId={viewer.id} />)}
            </ul>
            <div class="pager">
              <span>Showing {first}–{last} of {data.total}</span>
              <span>
                {data.page > 1 ? <a href={href({ page: data.page - 1 })} rel="prev">Previous</a> : <span class="off">Previous</span>}
                {' · '}
                Page {data.page} of {data.pageCount}
                {' · '}
                {data.page < data.pageCount ? <a href={href({ page: data.page + 1 })} rel="next">Next</a> : <span class="off">Next</span>}
              </span>
            </div>
          </>
        )}
      </div>
    </StaffShell>
  );
}

// ---------------------------------------------------------------------------
// Activity log (admin only)
// ---------------------------------------------------------------------------

const ACTION_TEXT: Record<string, string> = {
  'auth.login': 'signed in',
  'auth.logout': 'signed out',
  'auth.login_failed': 'had a failed sign-in attempt',
  'enquiry.assign': 'changed the assignment of',
  'enquiry.status': 'changed the status of',
  'enquiry.note': 'added a note to',
  'enquiry.reply_draft': 'saved a reply draft for',
  'enquiry.reply_recorded': 'approved and recorded a mock reply for',
};

function activityTarget(r: ActivityRow): Child {
  if (r.enquiryReference) return <a href={`/staff/enquiries/${r.entityId}`}>enquiry {r.enquiryReference}</a>;
  if (r.entity === 'staff_user') return 'their account';
  if (r.entity === 'package_version') return `package version ${r.entityId}`;
  return `${r.entity} ${r.entityId}`;
}

export function ActivityPage(props: { ctx: PageContext; viewer: Viewer; rows: ActivityRow[]; limit: number }) {
  return (
    <StaffShell ctx={props.ctx} viewer={props.viewer} title="Activity" path="/staff/activity" section="activity">
      <div class="wrap staff-page">
        <h1>Activity</h1>
        <p class="lede">The latest {props.limit} recorded changes, newest first. Entries hold identifiers and statuses only, never message or note text.</p>
        {props.rows.length === 0 ? (
          <div class="empty-state"><h2>Nothing recorded yet</h2></div>
        ) : (
          <ul class="log">
            {props.rows.map((r) => (
              <li>
                <span class="when">{formatReceived(r.at)}</span>
                <span>
                  {r.actorName ?? 'The system'} {ACTION_TEXT[r.action] ?? r.action} {activityTarget(r)}
                  {r.action === 'enquiry.status' ? <> ({String(r.meta.from)} to {String(r.meta.to)})</> : null}
                  {r.action === 'enquiry.reply_recorded' ? <> via {String(r.meta.channel)}</> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </StaffShell>
  );
}
