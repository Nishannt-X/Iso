import type { PackageForm } from '../domain/package-form.js';
import type { PackageAdminRow, PackageVersion } from '../domain/packages.js';
import type { PublicationSchedule } from '../domain/publication-schedule.js';
import type { PageContext } from './pages.js';
import { CsrfField, StaffShell, type Viewer } from './staff-pages.js';
import { PHOTOS } from '../domain/photos.js';

const path = (id: number): string => `/staff/packages/${id}`;

export function PackageListPage(props: { ctx: PageContext; viewer: Viewer; rows: PackageAdminRow[] }) {
  return <StaffShell ctx={props.ctx} viewer={props.viewer} title="Packages" path="/staff/packages" section="packages">
    <div class="wrap staff-page cms">
      <div class="cms-head"><div><h1>Packages</h1><p class="lede">Draft changes stay private until you preview and publish them.</p></div><a class="btn" href="/staff/packages/new">Create package</a></div>
      {props.rows.length === 0 ? <p class="empty-state">No packages yet. Create the first one.</p> : <ul class="cms-list">
        {props.rows.map((row) => <li>
          <a href={path(row.id)}><strong>{row.draft?.title || row.live?.title || row.code}</strong><span>{row.code} · {row.origin === 'synthetic' ? 'Synthetic demo data' : 'Brief sample'}</span></a>
          <span class="chip">{row.draft ? 'Draft waiting' : row.live ? 'Published' : 'No published version'}</span>
        </li>)}
      </ul>}
    </div>
  </StaffShell>;
}

export function PackageHistoryPage(props: {
  ctx: PageContext; viewer: Viewer; row: PackageAdminRow; history: PackageVersion[]; schedule: PublicationSchedule | null; problem?: string; done?: string;
}) {
  const { row, viewer } = props;
  return <StaffShell ctx={props.ctx} viewer={viewer} title={row.code} path={path(row.id)} section="packages">
    <div class="wrap staff-page cms">
      <a class="link back" href="/staff/packages">All packages</a>
      <h1>{row.draft?.title || row.live?.title || row.code}</h1>
      <p class="lede">{row.code} · /packages/{row.slug}</p>
      {props.problem ? <div class="error-summary" role="alert"><h2>Could not make that change</h2><p>{props.problem}</p></div> : null}
      {props.done ? <p class="banner" role="status">{props.done}</p> : null}
      <details class="panel cms-duplicate"><summary>Duplicate this package</summary><p class="hint">Create a separate private draft from the current public version. Give it a new code and URL.</p>
        <form method="post" action={`${path(row.id)}/duplicate`} class="form"><CsrfField token={viewer.csrfToken} />
          <div class="cms-fields"><div class="field"><label for="duplicate-code">New package code</label><input id="duplicate-code" name="code" maxlength={40} required placeholder="PKG-KL-09" /></div>
          <div class="field"><label for="duplicate-slug">New URL slug</label><input id="duplicate-slug" name="slug" maxlength={100} required placeholder="kerala-family-holiday" /></div></div>
          <button class="btn secondary" type="submit">Create private copy</button></form>
      </details>
      <section class="panel cms-actions" aria-labelledby="draft-title">
        <h2 id="draft-title">Working draft</h2>
        {row.draft ? <>
          <p>Version {row.draft.versionNo} is private. The published page will not change until you publish it.</p>
          <div class="actions"><a class="btn" href={`${path(row.id)}/edit`}>Edit draft</a><a class="btn secondary" href={`${path(row.id)}/preview`}>Preview draft</a></div>
          <form method="post" action={`${path(row.id)}/publish`} class="form cms-publish">
            <CsrfField token={viewer.csrfToken} /><input type="hidden" name="lock" value={row.draft.lockVersion} />
            <div class="field"><label for="publish-note">What changed?</label><input id="publish-note" name="note" maxlength={300} required placeholder="For example: updated monsoon price" /></div>
            <button class="btn" type="submit">Publish this version</button>
          </form>
          {props.schedule?.status === 'pending' ? <div class="banner" role="status"><p>Scheduled for {new Date(props.schedule.publishAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST. If this draft changes, the scheduled publication will fail safely.</p><form method="post" action={`${path(row.id)}/schedule/cancel`}><CsrfField token={viewer.csrfToken} /><button class="btn secondary" type="submit">Cancel schedule</button></form></div> : <form method="post" action={`${path(row.id)}/schedule`} class="form cms-publish">
            <CsrfField token={viewer.csrfToken} /><input type="hidden" name="lock" value={row.draft.lockVersion} />
            <div class="field"><label for="publish-at">Publish later (India time)</label><input id="publish-at" type="datetime-local" name="publishAt" required /></div>
            <div class="field"><label for="schedule-note">Publish note</label><input id="schedule-note" name="note" maxlength={300} required /></div>
            <button class="btn secondary" type="submit">Schedule publication</button>
          </form>}
          {props.schedule?.status === 'failed' ? <p class="error-summary" role="alert">Scheduled publication failed: {props.schedule.error}. Review and schedule again.</p> : null}
        </> : row.live ? <>
          <p>The current public version is {row.live.versionNo}. Start a private copy to make changes.</p>
          <form method="post" action={`${path(row.id)}/revise`}><CsrfField token={viewer.csrfToken} /><button class="btn" type="submit">Start a revision</button></form>
        </> : <p>No draft or published version is available.</p>}
      </section>
      <section class="panel" aria-labelledby="history-title"><h2 id="history-title">Version history</h2>
        <ol class="cms-history">{props.history.map((v) => <li>
          <div><strong>Version {v.versionNo}</strong> <span class="chip">{v.status}</span><p>{v.changeNote || 'No change note'}</p><small>{v.publishedAt ? `Published ${v.publishedAt.slice(0, 10)}` : `Updated ${v.updatedAt.slice(0, 10)}`}</small></div>
          {v.status !== 'draft' ? <form method="post" action={`${path(row.id)}/restore/${v.id}`}>
            <CsrfField token={viewer.csrfToken} />
            {row.draft ? <label class="check"><input type="checkbox" name="discard" value="yes" required /> Replace the current draft</label> : null}
            <button class="btn secondary" type="submit">Restore as draft</button>
          </form> : null}
        </li>)}</ol>
      </section>
    </div>
  </StaffShell>;
}

export function PackageEditorPage(props: {
  ctx: PageContext; viewer: Viewer; form: PackageForm; packageId?: number; lock?: number; error?: string; issues?: string[];
}) {
  const isNew = props.packageId === undefined;
  const action = isNew ? '/staff/packages/new' : `${path(props.packageId!)}/edit`;
  const f = props.form;
  return <StaffShell ctx={props.ctx} viewer={props.viewer} title={isNew ? 'Create package' : 'Edit package'} path={action} section="packages">
    <div class="wrap staff-page cms">
      <a class="link back" href={isNew ? '/staff/packages' : path(props.packageId!)}>Back to packages</a>
      <h1>{isNew ? 'Create a package' : 'Edit working draft'}</h1>
      <p class="lede">Save first, preview the public page, then publish when the content and prices are right.</p>
      {props.error ? <div class="error-summary" role="alert"><h2>That was not saved</h2><p>{props.error}</p>{props.issues?.length ? <ul>{props.issues.map((x) => <li>{x}</li>)}</ul> : null}</div> : null}
      <form method="post" action={action} class="form cms-form" accept-charset="utf-8">
        <CsrfField token={props.viewer.csrfToken} />
        {props.lock !== undefined ? <input type="hidden" name="lock" value={props.lock} /> : null}
        <section class="panel"><h2>Basics</h2><div class="cms-fields">
          {isNew ? <><div class="field"><label for="code">Package code</label><input id="code" name="code" value={f.code} maxlength={40} required placeholder="PKG-KL-08" /></div><div class="field"><label for="slug">URL slug</label><input id="slug" name="slug" value={f.slug} maxlength={100} required placeholder="kerala-family-holiday" /></div></> : <p class="hint">Code {f.code} · URL /packages/{f.slug}</p>}
          <div class="field"><label for="title">Title</label><input id="title" name="title" value={f.title} maxlength={200} required /></div>
          <div class="field"><label for="region">Region</label><input id="region" name="region" value={f.region} maxlength={100} required /></div>
          <div class="field full"><label for="summary">Short description</label><textarea id="summary" name="summary" rows={3} maxlength={1000} required>{f.summary}</textarea></div>
          <div class="field"><label for="days">Days</label><input id="days" name="days" type="number" min="1" max="60" value={f.days} required /></div>
          <div class="field"><label for="nights">Nights</label><input id="nights" name="nights" type="number" min="0" max="60" value={f.nights} required /></div>
          <div class="field"><label for="starRating">Hotel category (stars)</label><input id="starRating" name="starRating" type="number" min="1" max="5" value={f.starRating} /></div>
          <div class="field"><label for="destinations">Destinations, separated by commas</label><input id="destinations" name="destinations" value={f.destinations} maxlength={1000} /></div>
          <div class="field full"><label for="tags">Search tags, separated by commas</label><input id="tags" name="tags" value={f.tags} maxlength={1000} /></div>
        </div></section>
        <section class="panel"><h2>Photos and stays</h2><p class="hint">Choose from the credited demo image library. Company A should replace these with its licensed photography.</p><div class="cms-fields">
          <div class="field"><label for="heroPhotoId">Cover photo</label><select id="heroPhotoId" name="heroPhotoId"><option value="">None</option>{Object.entries(PHOTOS).map(([id, photo]) => <option value={id} selected={f.heroPhotoId === id}>{photo.place}</option>)}</select></div>
          <div class="field"><label for="bandPhotoId">Second photo</label><select id="bandPhotoId" name="bandPhotoId"><option value="">None</option>{Object.entries(PHOTOS).map(([id, photo]) => <option value={id} selected={f.bandPhotoId === id}>{photo.place}</option>)}</select></div>
          <div class="field full"><label for="hotelNames">Hotel names, one per line (optional)</label><textarea id="hotelNames" name="hotelNames" rows={4} placeholder="Add only properties Company A has confirmed">{f.hotelNames}</textarea></div>
        </div></section>
        <section class="panel"><h2>Day by day</h2><p class="hint">One line per day: title | description. The number of lines must equal Days before publishing.</p>
          <div class="field"><label for="itinerary">Itinerary</label><textarea id="itinerary" name="itinerary" rows={Math.max(5, Math.min(12, Number(f.days) || 5))} maxlength={120000} placeholder="Munnar arrival | Meet your driver and travel to Munnar.">{f.itinerary}</textarea></div>
          <div class="cms-fields"><div class="field"><label for="inclusions">Included, one per line</label><textarea id="inclusions" name="inclusions" rows={5}>{f.inclusions}</textarea></div><div class="field"><label for="exclusions">Not included, one per line</label><textarea id="exclusions" name="exclusions" rows={5}>{f.exclusions}</textarea></div></div>
        </section>
        <section class="panel"><h2>Seasonal prices</h2><p class="hint">One line per season: name | first date MM-DD | last date MM-DD | ₹ per person on twin sharing | assumed or confirmed. GST is shown separately as pending.</p>
          <div class="field"><label for="seasons">Seasons and prices</label><textarea id="seasons" name="seasons" rows={5} placeholder="Peak | 10-01 | 03-31 | 32500 | assumed">{f.seasons}</textarea></div>
          <div class="cms-fields"><div class="field"><label for="childPct">Child fare as % of adult fare (optional)</label><input id="childPct" name="childPct" type="number" min="0" max="100" value={f.childPct} /></div><div class="field"><label for="singleSuppInr">Single supplement ₹ (optional)</label><input id="singleSuppInr" name="singleSuppInr" type="number" min="1" value={f.singleSuppInr} /></div><div class="field full"><label for="childRuleNote">Child fare rule note</label><input id="childRuleNote" name="childRuleNote" value={f.childRuleNote} maxlength={300} /></div></div>
        </section>
        <div class="field"><label for="changeNote">Internal change note</label><input id="changeNote" name="changeNote" value={f.changeNote} maxlength={300} placeholder="What did you update?" /></div>
        <div class="actions"><button class="btn" type="submit">Save draft</button><a class="btn secondary" href={isNew ? '/staff/packages' : path(props.packageId!)}>Cancel</a></div>
      </form>
    </div>
  </StaffShell>;
}
