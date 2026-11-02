import type { RawForm } from '../domain/enquiries.js';
import type { PackageVersion } from '../domain/packages.js';
import type { PageContext } from './pages.js';
import { CsrfField, StaffShell, type Viewer } from './staff-pages.js';

export function IntakePage({ ctx, viewer, packages, fields, packageSlug, channel, error }: { ctx: PageContext; viewer: Viewer; packages: PackageVersion[]; fields: RawForm; packageSlug: string; channel: string; error?: string }) {
  return <StaffShell ctx={ctx} viewer={viewer} title="Log external enquiry" path="/staff/intake/new" section="inbox"><div class="wrap staff-page cms"><a class="link back" href="/staff/inbox">Back to inbox</a><h1>Log an external enquiry</h1><p class="lede">Bring a chat, email, WhatsApp message or phone call into the same queue. External connectors are mocked in this demo; staff enter the original details here.</p>
    {error ? <p class="error-summary" role="alert">{error}</p> : null}
    <form method="post" action="/staff/intake/new" class="form cms-form"><CsrfField token={viewer.csrfToken} />
      <section class="panel"><h2>Source</h2><div class="cms-fields"><div class="field"><label for="intake-channel">Channel</label><select id="intake-channel" name="channel" required>{(['email','chat','whatsapp','phone'] as const).map((x) => <option value={x} selected={channel === x}>{x === 'whatsapp' ? 'WhatsApp' : x[0]!.toUpperCase() + x.slice(1)}</option>)}</select></div>
      <div class="field"><label for="intake-package">Package</label><select id="intake-package" name="package" required>{packages.map((p) => <option value={p.packageSlug} selected={packageSlug === p.packageSlug}>{p.title}</option>)}</select></div></div></section>
      <section class="panel"><h2>Traveller details</h2><div class="cms-fields"><div class="field"><label for="intake-name">Name</label><input id="intake-name" name="name" value={fields.name} maxlength={120} required /></div>
        <div class="field"><label for="intake-email">Email</label><input id="intake-email" name="email" type="email" value={fields.email} maxlength={254} /></div>
        <div class="field"><label for="intake-phone">Phone</label><input id="intake-phone" name="phone" type="tel" value={fields.phone} /></div>
        <div class="field"><label for="intake-date">Preferred start date</label><input id="intake-date" name="travelStart" type="date" value={fields.travelStart} /></div>
        <div class="field"><label for="intake-adults">Adults</label><input id="intake-adults" name="adults" type="number" min="1" max="50" value={fields.adults} required /></div>
        <div class="field"><label for="intake-children">Children</label><input id="intake-children" name="children" type="number" min="0" max="20" value={fields.children} required /></div>
        <div class="field"><label for="intake-ages">Child ages (comma separated)</label><input id="intake-ages" name="childAges" value={fields.childAges} /></div>
        <div class="field"><label for="intake-destination">Destination</label><input id="intake-destination" name="destination" value={fields.destination} maxlength={120} /></div>
        <div class="field"><label for="intake-budget">Budget in ₹</label><input id="intake-budget" name="budget" type="number" min="1000" value={fields.budget} /></div>
        <div class="field"><label for="intake-basis">Budget basis</label><select id="intake-basis" name="budgetBasis"><option value="total" selected={fields.budgetBasis === 'total'}>Whole group</option><option value="per_person" selected={fields.budgetBasis === 'per_person'}>Per person</option></select></div>
        <div class="field full"><label for="intake-message">Original message or call notes</label><textarea id="intake-message" name="message" rows={7} maxlength={2000}>{fields.message}</textarea></div></div>
        <div class="check"><input id="intake-consent" type="checkbox" name="whatsappConsent" value="on" checked={fields.whatsappConsent === 'on'} /><label for="intake-consent">The traveller explicitly agreed to WhatsApp follow-ups. Leave unchecked without recorded consent.</label></div>
      </section><p class="hint">Use synthetic data in this demo. A fixed acknowledgement is recorded in the mock outbox; no message is actually sent.</p><button class="btn" type="submit">Add to inbox</button>
    </form>
  </div></StaffShell>;
}
