import type { Child } from 'hono/jsx';
import type { AcknowledgementView, FieldErrors, FieldName, RawForm } from '../domain/enquiries.js';
import { LIMITS } from '../domain/enquiries.js';
import { DEMO_NOTICE, PRIVACY_DRAFT_NOTE, PRIVACY_NOTICE, WHATSAPP_CONSENT_TEXT } from '../domain/notices.js';
import type { PackageVersion } from '../domain/packages.js';
import { Layout, SITE_NAME, type PageMeta } from './layout.js';
import { duration, formatInr, formatReceived, fromPrice, GST_NOTE, PRICE_BASIS } from './format.js';
import { packagePath, type PageContext } from './pages.js';

// Server-rendered enquiry form and acknowledgement. JSX output is escaped by Hono, so values the
// traveller typed can be put back into the form safely. Both pages are noindex.

export interface FormView {
  version: PackageVersion;
  values: RawForm;
  errors: FieldErrors;
  /** A form-level problem (rate limit, save failure) shown in the same summary as field errors. */
  banner?: string;
  /** Idempotency key printed into the form. */
  submissionKey: string;
  /** Indian calendar date, YYYY-MM-DD, used for the date picker's min and max. */
  today: string;
  maxDate: string;
  ctx: PageContext;
}

const FIELD_ORDER: FieldName[] = ['travelStart', 'adults', 'children', 'childAges', 'destination', 'budget', 'budgetBasis', 'message', 'name', 'email', 'phone', 'whatsappConsent'];

function aria(name: FieldName, errors: FieldErrors, hasHint: boolean) {
  const described = [hasHint ? `${name}-hint` : '', errors[name] ? `${name}-error` : ''].filter(Boolean).join(' ');
  return { 'aria-describedby': described || undefined, 'aria-invalid': errors[name] ? ('true' as const) : undefined };
}

function Field(props: { name: FieldName; label: string; hint?: string; error?: string; optional?: boolean; class?: string; children: Child }) {
  return (
    <div class={`field${props.class ? ` ${props.class}` : ''}`}>
      <label for={props.name}>
        {props.label}
        {props.optional ? <span class="opt"> (optional)</span> : null}
      </label>
      {props.hint ? <p class="hint" id={`${props.name}-hint`}>{props.hint}</p> : null}
      {props.children}
      {props.error ? <p class="error" id={`${props.name}-error`}>{props.error}</p> : null}
    </div>
  );
}

export function EnquiryFormPage({ version: v, values, errors, banner, submissionKey, today, maxDate, ctx }: FormView) {
  const failed = FIELD_ORDER.filter((f) => errors[f]);
  const hasProblem = failed.length > 0 || Boolean(banner);
  const from = fromPrice(v.seasons);
  const meta: PageMeta = {
    title: `${hasProblem ? 'Error: ' : ''}Enquire about ${v.title} | ${SITE_NAME}`,
    description: `Send an enquiry about ${v.title}.`,
    path: '/enquire',
    siteUrl: ctx.siteUrl,
    noindex: true,
  };
  return (
    <Layout meta={meta}>
      <div class="wrap enquiry-layout">
        <div class="enquiry">
          <p class="crumb"><a href={packagePath(v.packageSlug)}>Back to the package</a></p>
          <p class="micro rise">Enquiry · <span class="mono">{v.packageCode}</span></p>
          <h1>Enquire about {v.title}</h1>
          <p class="facts">{duration(v)} · {v.region}</p>
          {from !== null ? (
            <p class="price">
              <span class="from">From</span> <strong class="num">{formatInr(from)}</strong>
              <span class="basis">{PRICE_BASIS} · {GST_NOTE}</span>
            </p>
          ) : null}
          <p class="demo-note">{DEMO_NOTICE}</p>

          {hasProblem ? (
            <div class="error-summary" id="error-summary" tabindex={-1} autofocus role="group" aria-labelledby="error-summary-title">
              <h2 id="error-summary-title">{banner ? 'Your enquiry was not sent' : 'Please fix the following'}</h2>
              {banner ? <p>{banner}</p> : null}
              {failed.length > 0 ? (
                <ul>
                  {failed.map((f) => (
                    <li><a href={`#${f}`}>{errors[f]}</a></li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <nav class="steps" aria-label="Form sections">
            <ol>
              <li><a href="#step-trip"><span class="step-no" aria-hidden="true">1</span>Your trip</a></li>
              <li><a href="#step-details"><span class="step-no" aria-hidden="true">2</span>Your details</a></li>
              <li><a href="#step-whatsapp"><span class="step-no" aria-hidden="true">3</span>WhatsApp</a></li>
              <li><a href="#step-send"><span class="step-no" aria-hidden="true">4</span>Send</a></li>
            </ol>
          </nav>

          <form method="post" action="/enquire" class="form stepped" accept-charset="utf-8">
            <input type="hidden" name="package" value={v.packageSlug} />
            <input type="hidden" name="key" value={submissionKey} />
            <div class="hp" aria-hidden="true">
              <label for="website">Leave this field empty</label>
              <input type="text" id="website" name="website" tabindex={-1} autocomplete="off" />
            </div>

            <fieldset id="step-trip">
              <legend><span class="step-no" aria-hidden="true">1</span>Your trip</legend>
              <Field name="travelStart" label="Preferred start date" optional error={errors.travelStart} hint="An approximate date is fine. You can also say the month in your message.">
                <input type="date" id="travelStart" name="travelStart" value={values.travelStart} min={today} max={maxDate} {...aria('travelStart', errors, true)} />
              </Field>
              <div class="pair">
                <Field name="adults" label="Adults" error={errors.adults}>
                  <input type="text" id="adults" name="adults" value={values.adults} inputmode="numeric" autocomplete="off" required {...aria('adults', errors, false)} />
                </Field>
                <Field name="children" label="Children" error={errors.children}>
                  <input type="text" id="children" name="children" value={values.children} inputmode="numeric" autocomplete="off" required {...aria('children', errors, false)} />
                </Field>
              </div>
              <Field name="childAges" label="Children’s ages" optional error={errors.childAges} hint="One age for each child, separated by commas, for example 4, 9.">
                <input type="text" id="childAges" name="childAges" value={values.childAges} inputmode="numeric" autocomplete="off" {...aria('childAges', errors, true)} />
              </Field>
              <Field name="destination" label="Where would you like to go?" optional error={errors.destination}>
                <input type="text" id="destination" name="destination" value={values.destination} maxlength={LIMITS.destination} autocomplete="off" {...aria('destination', errors, false)} />
              </Field>
              <div class="pair budget">
                <Field name="budget" label="Budget in rupees" optional error={errors.budget} hint="A number, for example 120000.">
                  <input type="text" id="budget" name="budget" value={values.budget} inputmode="numeric" autocomplete="off" {...aria('budget', errors, true)} />
                </Field>
                <Field name="budgetBasis" label="Budget is" error={errors.budgetBasis}>
                  <select id="budgetBasis" name="budgetBasis" {...aria('budgetBasis', errors, false)}>
                    <option value="total" selected={values.budgetBasis !== 'per_person'}>for the whole group</option>
                    <option value="per_person" selected={values.budgetBasis === 'per_person'}>per person</option>
                  </select>
                </Field>
              </div>
              <Field name="message" label="Anything else we should know?" optional error={errors.message} hint={`Up to ${LIMITS.message} characters. Tell us about your plans in your own words.`}>
                <textarea id="message" name="message" rows={6} {...aria('message', errors, true)}>{values.message}</textarea>
              </Field>
            </fieldset>

            <fieldset id="step-details">
              <legend><span class="step-no" aria-hidden="true">2</span>Your details</legend>
              <Field name="name" label="Your name" error={errors.name}>
                <input type="text" id="name" name="name" value={values.name} autocomplete="name" required {...aria('name', errors, false)} />
              </Field>
              <Field name="email" label="Email" optional error={errors.email} hint="Give an email address, a phone number, or both.">
                <input type="email" id="email" name="email" value={values.email} autocomplete="email" inputmode="email" {...aria('email', errors, true)} />
              </Field>
              <Field name="phone" label="Phone" optional error={errors.phone} hint="Include the country code if you are outside India, for example +44.">
                <input type="tel" id="phone" name="phone" value={values.phone} autocomplete="tel" inputmode="tel" {...aria('phone', errors, true)} />
              </Field>
            </fieldset>

            <fieldset class="consent" id="step-whatsapp">
              <legend><span class="step-no" aria-hidden="true">3</span>WhatsApp (optional)</legend>
              <div class="check">
                <input type="checkbox" id="whatsappConsent" name="whatsappConsent" value="on" checked={values.whatsappConsent === 'on'} {...aria('whatsappConsent', errors, false)} />
                <label for="whatsappConsent">{WHATSAPP_CONSENT_TEXT}</label>
              </div>
              {errors.whatsappConsent ? <p class="error" id="whatsappConsent-error">{errors.whatsappConsent}</p> : null}
            </fieldset>

            <section class="privacy" id="step-send" aria-labelledby="privacy-title">
              <h2 id="privacy-title">How we use your details</h2>
              {PRIVACY_NOTICE.map((p) => <p>{p}</p>)}
              <p class="fineprint">{PRIVACY_DRAFT_NOTE}</p>
            </section>

            <button class="btn" type="submit">Send enquiry</button>
          </form>
        </div>
        <aside class="next-panel" aria-labelledby="next-title">
          <p class="micro">After you send</p>
          <h2 id="next-title">What happens next</h2>
          <ol>
            <li><strong>Saved with a reference</strong><span>Your enquiry is stored as you sent it, and the next page gives you a reference and a private status link.</span></li>
            <li><strong>A fixed acknowledgement</strong><span>It appears on the next page straight away. In this demo build it is kept in a mock outbox; nothing is emailed or texted.</span></li>
            <li><strong>A consultant reads it</strong><span>A Company A consultant reads your enquiry and replies to you personally.</span></li>
          </ol>
          <p class="fineprint">No payment is taken on this site.</p>
        </aside>
      </div>
    </Layout>
  );
}

const CHANNEL_LABEL = { email: 'email', sms: 'SMS', whatsapp: 'WhatsApp' } as const;

/**
 * The public status page. It shows no name, email, phone, message or party details, so a link that
 * reaches the wrong person reveals only the package, the reference and the fixed acknowledgement.
 */
export function AcknowledgementPage({ ack, ctx }: { ack: AcknowledgementView; ctx: PageContext }) {
  const meta: PageMeta = {
    title: `Enquiry received | ${SITE_NAME}`,
    description: 'Your enquiry has been received.',
    // Not the tokenised URL: the secret link should not be copied into canonical or social metadata.
    path: '/enquiry/received',
    siteUrl: ctx.siteUrl,
    noindex: true,
  };
  return (
    <Layout meta={meta}>
      <div class="wrap">
        <div class="enquiry ack-page">
          <div class="ack-mark" aria-hidden="true"><svg viewBox="0 0 48 48" width="48" height="48"><circle cx="24" cy="24" r="22" /><path d="M14 25l7 7 13-15" /></svg></div>
          <p class="micro rise">Enquiry received</p>
          <h1 class="rise d1">We have received your enquiry</h1>
          <p class="lead-in">A Company A consultant will read it and reply to you personally.</p>
          <dl class="at-a-glance">
            <div><dt>Reference</dt><dd class="mono ref">{ack.reference}</dd></div>
            <div>
              <dt>Package</dt>
              <dd>{ack.packageIsLive ? <a href={packagePath(ack.packageSlug)}>{ack.packageTitle}</a> : ack.packageTitle}</dd>
            </div>
            <div><dt>Received</dt><dd>{formatReceived(ack.receivedAt)}</dd></div>
            <div><dt>Status</dt><dd><span class="status-dot" aria-hidden="true" />Received</dd></div>
          </dl>

          <h2 class="sub" id="ack-title">Acknowledgement</h2>
          <figure class="ack" aria-labelledby="ack-title">
            <blockquote>{ack.body}</blockquote>
            <figcaption>
              Recorded for {CHANNEL_LABEL[ack.channel]}. Demo build: this was saved in a mock outbox, and nothing was sent to any email address or phone.
            </figcaption>
          </figure>

          <h2 class="sub">About this page</h2>
          <p class="fineprint">
            Keep this link if you want to come back. Anyone who has it can see this page, which shows no contact details or message.
          </p>
          {ack.isSample ? <p class="fineprint">This is the sample enquiry from the client brief, added by the demo seed.</p> : null}
          <a class="link back" href="/#packages">See all packages</a>
        </div>
      </div>
    </Layout>
  );
}
