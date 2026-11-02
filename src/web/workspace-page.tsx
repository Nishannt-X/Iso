import type { Child } from 'hono/jsx';
import type { Channel } from '../domain/enquiries.js';
import { suggestedReply, type Analysis } from '../domain/analysis.js';
import { SETTABLE_STATUSES, STATUS_LABEL, TRIAGE_LIMITS, type Workspace } from '../domain/triage.js';
import type { StaffUser } from '../domain/staff.js';
import type { StoredQuote } from '../domain/package-quotes.js';
import { formatInr, formatReceived, pluralise } from './format.js';
import { packagePath, type PageContext } from './pages.js';
import { CsrfField, partyText, SlaCell, StaffShell, StatusChip, type Viewer } from './staff-pages.js';

// The enquiry workspace (screen 7): the immutable original beside the structured fields, handling controls,
// the mock reply composer, notes and the activity trail. JSX escapes every value, including the traveller's message.

export type ProblemArea = 'status' | 'assign' | 'note' | 'reply' | 'analysis';
export interface Problem {
  area: ProblemArea;
  message: string;
}

/** Text typed into a form that failed, put back so nothing is lost. */
export interface Retained {
  note?: string;
  reply?: { channel: string; subject: string; body: string };
}

export interface WorkspaceView {
  ctx: PageContext;
  viewer: Viewer;
  ws: Workspace;
  staff: StaffUser[];
  problem?: Problem;
  /** Confirmation shown after a redirect from a successful change. */
  saved?: string;
  retained?: Retained;
  analysis: Analysis | null;
  quotes: StoredQuote[];
}

/** Keys accepted in the ?done= parameter after a successful change, with the sentence shown for each. */
export const DONE_TEXT: Record<string, string> = {
  assigned: 'Assignment saved.',
  status: 'Status saved.',
  nochange: 'Nothing to change: it was already set that way.',
  note: 'Note added.',
  draft: 'Draft saved. Nothing has been recorded or sent.',
  recorded: 'Reply approved and recorded in the mock outbox. Nothing was sent to the traveller.',
  analysed: 'Analysis proposed. Check its evidence and correct it before accepting.',
  accepted: 'Corrected analysis accepted. The suggested reply is now editable below.',
};

const CHANNEL_LABEL: Record<Channel, string> = { email: 'Email', sms: 'SMS', whatsapp: 'WhatsApp' };
const MOCK_NOTE = 'Mock outbox: recorded in this demo, not sent.';

const None = () => <span class="none">Not given</span>;
const Item = ({ label, children }: { label: string; children: Child }) => (
  <div>
    <dt>{label}</dt>
    <dd>{children}</dd>
  </div>
);

function activityText(a: Workspace['activity'][number], names: Map<number, string>): string {
  const who = a.actorName ?? 'The system';
  const name = (id: unknown) => (typeof id === 'number' ? (names.get(id) ?? 'a former colleague') : null);
  switch (a.action) {
    case 'enquiry.assign': {
      const to = name(a.meta.to);
      return to ? `${who} assigned this to ${to}.` : `${who} released the assignment.`;
    }
    case 'enquiry.status': return `${who} changed the status from ${STATUS_LABEL[a.meta.from as keyof typeof STATUS_LABEL] ?? '?'} to ${STATUS_LABEL[a.meta.to as keyof typeof STATUS_LABEL] ?? '?'}.`;
    case 'enquiry.note': return `${who} added a note.`;
    case 'enquiry.reply_draft': return `${who} saved a reply draft.`;
    case 'enquiry.reply_recorded': return `${who} approved and recorded a ${CHANNEL_LABEL[a.meta.channel as Channel] ?? ''} reply (mock, not sent).`;
    default: return `${who}: ${a.action}.`;
  }
}

function AssignForm({ v }: { v: WorkspaceView }) {
  const { ws, viewer } = v;
  const action = `/staff/enquiries/${ws.enquiry.id}/assign`;
  const hidden = (
    <>
      <CsrfField token={viewer.csrfToken} />
      <input type="hidden" name="lock" value={String(ws.lockVersion)} />
    </>
  );
  if (viewer.role === 'admin') {
    return (
      <form method="post" action={action} class="inline-form">
        {hidden}
        <div class="field">
          <label for="assignee">Assigned to</label>
          <select id="assignee" name="assignee" aria-describedby={v.problem?.area === 'assign' ? 'error-summary' : undefined}>
            <option value="none" selected={ws.assigneeId === null}>Unassigned</option>
            {v.staff.map((u) => <option value={String(u.id)} selected={ws.assigneeId === u.id}>{u.name}{u.role === 'admin' ? ' (admin)' : ''}</option>)}
          </select>
        </div>
        <button class="btn secondary" type="submit">Save assignment</button>
      </form>
    );
  }
  if (ws.assigneeId !== null && ws.assigneeId !== viewer.id) {
    return (
      <>
        <p>Assigned to <strong>{ws.assigneeName}</strong>.</p>
        <p class="hint">Only an admin can reassign it.</p>
      </>
    );
  }
  const mine = ws.assigneeId === viewer.id;
  return (
    <form method="post" action={action} class="inline-form">
      {hidden}
      <div class="field">
        <label for="assignee">Assigned to</label>
        <select id="assignee" name="assignee" aria-describedby={v.problem?.area === 'assign' ? 'error-summary' : undefined}>
          <option value={String(viewer.id)} selected={mine}>Me ({viewer.name})</option>
          <option value="none" selected={!mine}>Unassigned</option>
        </select>
      </div>
      <button class="btn secondary" type="submit">Save assignment</button>
    </form>
  );
}

function StatusForm({ v }: { v: WorkspaceView }) {
  const { ws, viewer } = v;
  return (
    <form method="post" action={`/staff/enquiries/${ws.enquiry.id}/status`} class="inline-form">
      <CsrfField token={viewer.csrfToken} />
      <input type="hidden" name="lock" value={String(ws.lockVersion)} />
      <div class="field">
        <label for="status">Status</label>
        <select id="status" name="status" aria-describedby={v.problem?.area === 'status' ? 'error-summary' : undefined}>
          {ws.status === 'replied' ? <option value="" selected disabled>Replied (set by recording a reply)</option> : null}
          {SETTABLE_STATUSES.map((s) => <option value={s} selected={ws.status === s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>
      <button class="btn secondary" type="submit">Save status</button>
    </form>
  );
}

function ReplyComposer({ v }: { v: WorkspaceView }) {
  const { ws, viewer } = v;
  const e = ws.enquiry;
  if (ws.status === 'closed') {
    return <p class="muted">This enquiry is closed. Set it back to New or In progress to draft or record a reply.</p>;
  }
  if (ws.channels.length === 0) return <p class="muted">There is no way to reach this traveller.</p>;
  const retained = v.retained?.reply;
  const channel = retained?.channel ?? ws.draft?.channel ?? ws.channels[0]?.channel;
  const subject = retained?.subject ?? ws.draft?.subject ?? `Your enquiry about ${ws.package.title} (${e.reference})`.slice(0, TRIAGE_LIMITS.subject);
  const body = retained?.body ?? ws.draft?.body ?? (v.analysis?.status === 'accepted' ? suggestedReply(v.analysis) : '');
  const described = v.problem?.area === 'reply' ? 'error-summary' : undefined;
  return (
    <form method="post" action={`/staff/enquiries/${e.id}/reply/record`} class="form compose">
      <CsrfField token={viewer.csrfToken} />
      <input type="hidden" name="lock" value={String(ws.lockVersion)} />
      <div class="field">
        <label for="channel">Send to</label>
        <select id="channel" name="channel" aria-describedby={described}>
          {ws.channels.map((c) => (
            <option value={c.channel} selected={channel === c.channel}>
              {CHANNEL_LABEL[c.channel]}: {c.recipient}{c.channel === 'whatsapp' ? ' (consent given)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div class="field">
        <label for="subject">Subject <span class="opt">(email only)</span></label>
        <input type="text" id="subject" name="subject" value={subject} maxlength={TRIAGE_LIMITS.subject} autocomplete="off" />
      </div>
      <div class="field">
        <label for="body">Reply</label>
        <p class="hint" id="body-hint">Up to {TRIAGE_LIMITS.reply} characters. Quote prices only from the package price table; this build has no GST or child fare rule.</p>
        <textarea id="body" name="body" rows={9} maxlength={TRIAGE_LIMITS.reply} aria-describedby={`body-hint${described ? ` ${described}` : ''}`}>{body}</textarea>
      </div>
      <div class="check">
        <input type="checkbox" id="approve" name="approve" value="yes" required />
        <label for="approve">I have read this reply and approve recording it. It is saved in the mock outbox and is not sent to the traveller.</label>
      </div>
      <div class="actions">
        <button class="btn" type="submit">Approve and record reply</button>
        <button class="btn secondary" type="submit" formaction={`/staff/enquiries/${e.id}/reply/draft`} formnovalidate>Save draft</button>
      </div>
      {ws.draft ? <p class="draft-info">Draft last saved by {ws.draft.updatedByName}, {formatReceived(ws.draft.updatedAt)}.</p> : null}
    </form>
  );
}

export function WorkspacePage(v: WorkspaceView) {
  const { ws, viewer } = v;
  const e = ws.enquiry;
  const names = new Map(v.staff.map((u) => [u.id, u.name]));
  return (
    <StaffShell ctx={v.ctx} viewer={viewer} title={`${v.problem ? 'Error: ' : ''}Enquiry ${e.reference}`} path={`/staff/enquiries/${e.id}`} section="inbox">
      <div class="wrap staff-page">
        <p class="crumb"><a href="/staff/inbox">Back to the inbox</a></p>

        {v.problem ? (
          <div class="error-summary" id="error-summary" tabindex={-1} autofocus role="group" aria-labelledby="error-summary-title">
            <h2 id="error-summary-title">That was not saved</h2>
            <p>{v.problem.message}</p>
          </div>
        ) : v.saved ? (
          <p class="banner" role="status">{v.saved}</p>
        ) : null}

        <header class="ws-head">
          <h1>{e.name}</h1>
          <p class="ws-sub">
            Reference <span class="num">{e.reference}</span> · {ws.package.title} · received {formatReceived(e.createdAt)}
            {e.origin === 'seed_sample' ? ' · sample enquiry from the client brief' : ''}
          </p>
          <div class="ws-state">
            <StatusChip status={ws.status} />
            <span>{ws.assigneeName ? `Assigned to ${ws.assigneeId === viewer.id ? 'you' : ws.assigneeName}` : 'Unassigned'}</span>
            <SlaCell sla={ws.sla} />
          </div>
          <p class="hint mt">{ws.sla.detail} Elapsed clock time, no working hours applied.</p>
        </header>

        <section class="handle" id="handling" aria-label="Handling">
          <div>
            <h2>Status</h2>
            <StatusForm v={v} />
          </div>
          <div>
            <h2>Assignment</h2>
            <AssignForm v={v} />
          </div>
        </section>

        <div class="ws-grid">
          <div>
            <section class="panel" aria-labelledby="quotes-title"><h2 id="quotes-title">Quotes</h2><p class="hint">Build from a published package. Each quote keeps its own price snapshot and requires approval before sharing.</p><p><a class="btn secondary" href={`/staff/quotes/new?enquiry=${e.id}`}>Build a quote</a></p>{v.quotes.length ? <ul class="cms-list">{v.quotes.map((q) => <li><a href={`/staff/quotes/${q.id}`}>Quote #{q.id} · {q.snapshot.title}</a><span class="chip">{q.status === 'mock_recorded' ? 'Mock sent' : q.status}</span></li>)}</ul> : <p class="empty-state">No quotes yet.</p>}</section>
            <section class="panel" aria-labelledby="orig-title">
              <h2 id="orig-title">Original enquiry</h2>
              <p class="hint">Exactly as the traveller sent it. It is a permanent record and cannot be edited.</p>
              {e.message ? <blockquote class="orig">{e.message}</blockquote> : <p class="orig none">The traveller left the message blank and used only the form fields.</p>}
            </section>

            <section class="panel" aria-labelledby="fields-title">
              <h2 id="fields-title">Form fields</h2>
              <p class="hint">What the traveller typed into the structured fields.</p>
              <dl class="fields">
                <Item label="Name">{e.name}</Item>
                <Item label="Email">{e.email ?? <None />}</Item>
                <Item label="Phone">{e.phone ?? <None />}</Item>
                <Item label="Travellers">
                  {partyText(e.adults, e.children)}
                  {e.childAges.length > 0 ? ` (ages ${e.childAges.join(', ')})` : ''}
                </Item>
                <Item label="Preferred start date">{e.travelStart ?? <None />}</Item>
                <Item label="Destination">{e.destination ?? <None />}</Item>
                <Item label="Budget">
                  {e.budgetInr !== null ? `${formatInr(e.budgetInr)} ${e.budgetBasis === 'per_person' ? 'per person' : 'for the whole group'}` : <None />}
                </Item>
                <Item label="Package">
                  {ws.package.isLive ? <a href={packagePath(ws.package.slug)}>{ws.package.title}</a> : ws.package.title}
                  {' '}({ws.package.code}, version {ws.package.versionNo}{ws.package.isLive ? '' : ', no longer live'})
                </Item>
                <Item label="WhatsApp consent">
                  {e.whatsappConsent ? `Given on ${formatReceived(e.whatsappConsentAt ?? e.createdAt)}` : 'Not given'}
                </Item>
                <Item label="Source">{e.origin === 'seed_sample' ? 'Sample enquiry from the client brief (seed data)' : e.intakeChannel === 'web' ? 'Website enquiry form' : `${e.intakeChannel} (staff logged, mock external intake)`}</Item>
                <Item label="Privacy notice">{e.privacyNoticeVersion} (draft wording)</Item>
              </dl>
            </section>

            <section class="panel analysis" id="analysis" aria-labelledby="analysis-title">
              <h2 id="analysis-title">Analysis <span class="chip">{v.analysis ? v.analysis.status === 'accepted' ? 'Accepted' : 'Needs review' : 'Not analysed'}</span></h2>
              <p class="hint">The original message is above. Gemini extracts text when configured; local rules are used if it is unavailable. Suggestions and prices come from published packages. Nothing is sent automatically.</p>
              {v.analysis ? <>
                <p class="hint">Source: {v.analysis.source === 'gemini' ? 'Google Gemini API' : 'Local rules fallback'} · {formatReceived(v.analysis.analysedAt)}</p>
                <p role="status">{v.analysis.uncertainty}</p>
                {v.analysis.fields.evidence.length ? <p class="hint">Evidence from message: {v.analysis.fields.evidence.map((x) => `“${x}”`).join(' · ')}</p> : <p class="hint">No exact phrase was extracted. Check the original message.</p>}
                <form method="post" action={`/staff/enquiries/${e.id}/analysis/accept`} class="form cms-form">
                  <CsrfField token={viewer.csrfToken} />
                  <div class="cms-fields">
                    <div class="field"><label for="analysis-date">Start date (YYYY-MM-DD)</label><input id="analysis-date" name="date" type="date" value={v.analysis.fields.date ?? ''} /></div>
                    <div class="field"><label for="analysis-month">Month (1–12)</label><input id="analysis-month" name="month" type="number" min="1" max="12" value={v.analysis.fields.month ?? ''} /></div>
                    <div class="field"><label for="analysis-adults">Adults</label><input id="analysis-adults" name="adults" type="number" min="1" max="50" value={v.analysis.fields.adults ?? ''} /></div>
                    <div class="field"><label for="analysis-children">Children</label><input id="analysis-children" name="children" type="number" min="0" max="20" value={v.analysis.fields.children ?? ''} /></div>
                    <div class="field"><label for="analysis-destination">Destination</label><input id="analysis-destination" name="destination" value={v.analysis.fields.destination ?? ''} maxlength={120} /></div>
                    <div class="field"><label for="analysis-must">Must have</label><input id="analysis-must" name="mustHave" value={v.analysis.fields.mustHave ?? ''} maxlength={120} /></div>
                    <div class="field"><label for="analysis-budget">Budget in ₹</label><input id="analysis-budget" name="budgetInr" type="number" min="1000" value={v.analysis.fields.budgetInr ?? ''} /></div>
                    <div class="field"><label for="analysis-basis">Budget basis</label><select id="analysis-basis" name="budgetBasis"><option value="" selected={!v.analysis.fields.budgetBasis}>Unknown</option><option value="total" selected={v.analysis.fields.budgetBasis === 'total'}>Whole group</option><option value="per_person" selected={v.analysis.fields.budgetBasis === 'per_person'}>Per person</option></select></div>
                  </div>
                  <button class="btn secondary" type="submit">Accept corrected details and refresh suggestions</button>
                </form>
                <h3>Three package suggestions</h3>
                <ul class="cms-list">{v.analysis.suggestions.map((s) => <li><div><strong>{s.title}</strong><p>{s.reason}</p><p>{s.pricePpTwinInr === null ? 'Price to confirm' : `${formatInr(s.pricePpTwinInr)} per person, twin sharing · GST to confirm`}</p><small>{s.priceNote}</small></div></li>)}</ul>
                <h3>Draft reply opening</h3><p>{v.analysis.replyOpening}</p><p class="hint">After accepting the details, edit the full suggestion in the Reply section and approve it there.</p>
              </> : <p class="muted">No analysis yet. Run it when you are ready to review the proposed details.</p>}
              <form method="post" action={`/staff/enquiries/${e.id}/analyse`}><CsrfField token={viewer.csrfToken} /><button class="btn secondary" type="submit">{v.analysis ? 'Run analysis again' : 'Analyse enquiry'}</button></form>
            </section>

            <section class="panel" aria-labelledby="reply-title">
              <h2 id="reply-title">Reply</h2>
              <p class="banner mock"><strong>Mock reply.</strong> Approving records the reply in this demo&rsquo;s outbox. No email, SMS or WhatsApp message is sent.</p>
              <ReplyComposer v={v} />
            </section>

            <section class="panel" aria-labelledby="msgs-title">
              <h2 id="msgs-title">Messages</h2>
              <ul class="msgs">
                {ws.messages.map((m) => (
                  <li class="msg">
                    <header>
                      <strong>{m.kind === 'acknowledgement' ? 'Automatic acknowledgement' : `Reply approved by ${m.approvedByName ?? 'staff'}`}</strong>
                      <span>{CHANNEL_LABEL[m.channel]} to {m.recipient}</span>
                      <span>{formatReceived(m.createdAt)}</span>
                      <span class="chip">{MOCK_NOTE}</span>
                    </header>
                    {m.subject ? <p class="subject">{m.subject}</p> : null}
                    <p class="text">{m.body}</p>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <aside aria-label="Notes and activity">
            <section class="panel" aria-labelledby="notes-title">
              <h2 id="notes-title">Internal notes</h2>
              <p class="hint">For staff only. Travellers never see these.</p>
              <form method="post" action={`/staff/enquiries/${e.id}/notes`} class="form note-form">
                <CsrfField token={viewer.csrfToken} />
                <div class="field">
                  <label for="note">Add a note</label>
                  <textarea id="note" name="body" rows={4} maxlength={TRIAGE_LIMITS.note} required aria-describedby={v.problem?.area === 'note' ? 'error-summary' : undefined}>{v.retained?.note ?? ''}</textarea>
                </div>
                <button class="btn secondary" type="submit">Add note</button>
              </form>
              {ws.notes.length === 0 ? (
                <p class="muted mt">No notes yet.</p>
              ) : (
                <ul class="notes-list">
                  {ws.notes.map((n) => (
                    <li>
                      <span class="meta">{n.authorName}, {formatReceived(n.createdAt)}</span>
                      <p class="text">{n.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section class="panel" aria-labelledby="activity-title">
              <h2 id="activity-title">Activity</h2>
              {ws.activity.length === 0 ? (
                <p class="muted mt">Nothing has been changed yet. Received {formatReceived(e.createdAt)}.</p>
              ) : (
                <ul class="activity-list">
                  {ws.activity.map((a) => (
                    <li>
                      <span class="meta">{formatReceived(a.at)}</span>
                      {activityText(a, names)}
                    </li>
                  ))}
                </ul>
              )}
              <p class="hint mt">{pluralise(ws.notes.length, 'note')} · {pluralise(ws.messages.length, 'message')} recorded</p>
            </section>
          </aside>
        </div>
      </div>
    </StaffShell>
  );
}
