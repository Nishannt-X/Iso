import type { Child } from 'hono/jsx';
import { photoSrc, type Photo } from '../domain/photos.js';
import { CSS } from './styles.js';

export const SITE_NAME = 'Kochi Tours';

export interface PageMeta {
  title: string;
  description: string;
  /** Path of the canonical URL, e.g. "/packages/foo". */
  path: string;
  siteUrl: string;
  /** Photo for the social preview, when the page has one. */
  image?: Photo | null;
  noindex?: boolean;
}

/** Photo credit line. CC licences require the author, licence and source to stay with the image. */
export function Credit({ photo }: { photo: Photo }) {
  return (
    <>
      {photo.place}. Photo: {photo.author},{' '}
      <a href={photo.licenceUrl} rel="noopener noreferrer">{photo.licence}</a>,{' '}
      <a href={photo.sourceUrl} rel="noopener noreferrer">via Wikimedia Commons</a>
    </>
  );
}

/** A responsive photo. `eager` is for the one image above the fold. */
export function Picture(props: { photo: Photo; sizes: string; eager?: boolean; class?: string }) {
  const { photo } = props;
  return (
    <img
      class={props.class}
      src={photoSrc(photo, 900)}
      srcset={`${photoSrc(photo, 900)} 900w, ${photoSrc(photo, 2000)} 2000w`}
      sizes={props.sizes}
      width={photo.width}
      height={photo.height}
      alt={photo.alt}
      loading={props.eager ? 'eager' : 'lazy'}
      decoding="async"
      fetchpriority={props.eager ? 'high' : 'auto'}
    />
  );
}

const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%230b5a55'/%3E%3Cpath d='M9 24V8m0 9 9-9m-6 6 7 10' stroke='%23fff' stroke-width='2.4' fill='none' stroke-linecap='round'/%3E%3C/svg%3E";

/**
 * The page shell. The public site uses the defaults. The staff area passes its own `nav` (the header's right-hand
 * side), `footer` (null for none) and `extraCss`, and a `brandHref`, so both share one head, font and stylesheet.
 */
export function Layout(props: { meta: PageMeta; overImage?: boolean; hasBook?: boolean; nav?: Child; footer?: Child | null; extraCss?: string; brandHref?: string; packageSlug?: string; packageTitle?: string; children: Child }) {
  const { meta } = props;
  const url = `${meta.siteUrl}${meta.path}`;
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{meta.title}</title>
        <meta name="description" content={meta.description} />
        {meta.noindex ? <meta name="robots" content="noindex" /> : <link rel="canonical" href={url} />}
        <meta name="theme-color" content="#0b5a55" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={SITE_NAME} />
        <meta property="og:title" content={meta.title} />
        <meta property="og:description" content={meta.description} />
        <meta property="og:url" content={url} />
        {meta.image ? <meta property="og:image" content={`${meta.siteUrl}${photoSrc(meta.image, 2000)}`} /> : null}
        <link rel="icon" href={FAVICON} />
        <link rel="preload" href="/assets/fonts/hanken-grotesk-latin.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
        <style dangerouslySetInnerHTML={{ __html: props.extraCss ? CSS + props.extraCss : CSS }} />
        <script src="/assets/scripts/app.js" defer></script>
      </head>
      <body class={props.hasBook ? 'has-book' : undefined}>
        <a class="skip" href="#main">Skip to content</a>
        <header class={`site-head${props.overImage ? ' onimage' : ''}`}>
          <div class="wrap">
            <a class="brand" href={props.brandHref ?? '/'}>{SITE_NAME}</a>
            {props.nav ?? (
              <nav aria-label="Primary">
                <a href="/packages">Journeys</a>
                <a href="/destinations">Destinations</a>
                <a href="/journal">Journal</a>
                <a href="/#how">How it works</a>
                <a href="/staff/login" class="nav-staff-link">Staff portal</a>
              </nav>
            )}
          </div>
        </header>
        <main id="main">{props.children}</main>
        {props.footer === null ? null : (
          props.footer ?? (
            <footer class="site-foot">
              <div class="wrap">
                <div class="foot-top">
                  <a class="brand" href="/">{SITE_NAME}</a>
                  <nav aria-label="Footer">
                    <a href="/packages">Journeys</a>
                    <a href="/destinations">Destinations</a>
                    <a href="/journal">Journal</a>
                    <a href="/#how">How it works</a>
                    <a href="/staff/login" rel="nofollow">Staff sign in →</a>
                  </nav>
                </div>
                <p>
                  Demo build. Package codes, titles, durations, star ratings and the PKG-KL-07 prices come from Company A&rsquo;s brief.
                  Itineraries, inclusions, the other packages and all photography are synthetic or placeholder content.
                </p>
                <p>Photographs are Creative Commons images from Wikimedia Commons, credited beside each use. They are not Company A&rsquo;s own.</p>
              </div>
            </footer>
          )
        )}
        {props.hasBook ? (
          <aside id="enquiry-drawer" class="drawer" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
            <div class="drawer-backdrop" data-close-drawer tabindex={-1} />
            <div class="drawer-panel">
              <div class="drawer-header">
                <div>
                  <span class="drawer-kicker">Custom Journey Enquiry</span>
                  <h2 id="drawer-title" class="drawer-pkg-title">{props.packageTitle ? `Enquire: ${props.packageTitle}` : 'Enquire About This Journey'}</h2>
                </div>
                <button type="button" class="drawer-close" data-close-drawer aria-label="Close enquiry drawer">✕</button>
              </div>

              <div class="drawer-summary-card">
                <div class="summary-line">
                  <span class="summary-label">Selected Season &amp; Rate:</span>
                  <strong class="drawer-summary-fare">—</strong>
                </div>
                <div class="summary-line">
                  <span class="summary-label">Estimated Party Total:</span>
                  <strong class="drawer-summary-total">—</strong>
                </div>
              </div>

              <form method="post" action="/enquire" class="drawer-form" id="drawer-enquiry-form">
                <input type="hidden" name="package" id="drawer-input-package" value={props.packageSlug ?? ''} />
                <input type="hidden" name="season" id="drawer-input-season" value="" />
                <input type="hidden" name="adults" id="drawer-input-adults" value="2" />
                <input type="hidden" name="children" id="drawer-input-children" value="0" />

                <div style="display:none;" aria-hidden="true">
                  <label for="drawer-company_tax_pin">Leave blank</label>
                  <input type="text" id="drawer-company_tax_pin" name="company_tax_pin" tabindex={-1} autocomplete="off" />
                </div>

                <div class="field">
                  <label for="drawer-name">Your Full Name</label>
                  <input type="text" id="drawer-name" name="name" required maxlength={120} placeholder="e.g. Priya Sharma" />
                </div>

                <div class="field">
                  <label for="drawer-email">Email Address</label>
                  <input type="email" id="drawer-email" name="email" required maxlength={254} placeholder="you@example.com" />
                </div>

                <div class="field">
                  <label for="drawer-phone">Phone / WhatsApp (Optional)</label>
                  <input type="tel" id="drawer-phone" name="phone" maxlength={40} placeholder="+91 98765 43210" />
                </div>

                <div class="check">
                  <input type="checkbox" id="drawer-whatsapp" name="whatsapp_consent" value="1" />
                  <label for="drawer-whatsapp">I consent to WhatsApp messages regarding this enquiry (DPDP Act compliant).</label>
                </div>

                <div class="field">
                  <label for="drawer-message">Special Notes or Questions (Optional)</label>
                  <textarea id="drawer-message" name="message" rows={3} placeholder="Dietary requirements, honeymoon celebrations, private transfers..."></textarea>
                </div>

                <button type="submit" class="btn drawer-submit">Submit Enquiry &amp; Lock In 1-Hour SLA →</button>
                <p class="drawer-footnote">Guaranteed response within 1 hour during working hours · No payment required</p>
              </form>
            </div>
          </aside>
        ) : null}
      </body>
    </html>
  );
}
