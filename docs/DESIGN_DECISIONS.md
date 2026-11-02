# Design decisions (public site, slice S2)

Source of product claims is `docs/CLIENT_BRIEF.md` (DESIGN: minimal, white space, restrained palette, clear type, full-width photography, quiet type, one clear Enquire button on every package). Workflow: `docs/DESIGN_WORKFLOW.md`.

## References studied (Playwright, 2026-11-02)
| Site | What was measured | What was taken, what was refused |
|---|---|---|
| https://www.aman.com/resorts/amanbagh | H1 31px, weight 400, tracking 0.5px; body 14px; text `#313131`; ground `#F3EEE7`; a 4724×1261 panoramic hero | Taken: one dominant full-bleed image per page, small type, no decoration. Refused: warm cream ground with serif display. Impeccable lists that pairing as a default reached for without deciding. |
| https://www.blacktomato.com/destinations/india/ | H1 60px condensed uppercase display, 3px tracking, white on photo; body 17px, tracking 0.85px | Taken: headline set directly on the photograph with a scrim. Refused: loud condensed capitals, which are not "quiet type". |

The Impeccable skill had no PRODUCT.md to load and no one to interview in this non-interactive run, so the direction was inferred from the brief alone. This is stated here instead of being silently assumed.

## System
- **World:** backwater light. Cool white ground `#F8F9F7`, ink `#12201D`, muted `#52615D` (6:1 on the ground), hairlines `#DBE1DE`, one teal `#0B5A55` used for the primary button, the outlined Enquire stub on each journey row, the focus ring, text selection, scrollbar and the browser accent. White on teal is about 8:1.
- **Type:** Hanken Grotesk (SIL OFL 1.1, from Google Fonts, self-hosted as two woff2 subsets, 54 KB total; the latin-ext subset carries the ₹ sign). One family; headings at weight 300 with -0.02em tracking, body 17px/1.6, 62–72 characters per line. Tabular numerals for prices. The font was not chosen from Impeccable's "training-data defaults" list.
- **Layout:** 72rem content width, fluid side padding. Home: see "Landing page (v2 slice 1)" below. Detail: full-bleed hero, then a reading column and a sticky price panel.
- **One Enquire button:** the price panel is one element. Desktop: sticky right column. Phone: the same element becomes a fixed bottom bar showing "From ₹ …, per person, twin sharing · GST pending" beside the button. There is exactly one `Enquire` link in the markup per package page (tested).
- **Refused patterns:** eyebrows above headings, icon-card grids, gradient text, emoji or glyph icons, nested cards, decorative shadows, entrance animations.
- **Motion:** the home ticket settles into place once on load (14px, 800ms ease-out, no fade, content visible throughout); the primary button darkens and presses to 0.98×; the Enquire stub fills on hover. All motion is off under `prefers-reduced-motion`.
- **States:** empty list, 404, 500, a package whose tags match no theme (listed under "More journeys", no photo), no seasons, no star rating, no inclusions all render honestly. Keyboard focus is visible everywhere; a skip link is the first tab stop.
- **Performance choices:** inline CSS (no render-blocking request), font preload, photos in 900px and 2000px widths with `srcset`, explicit `width`/`height` (no layout shift), the single above-the-fold photo is eager and high priority, the rest lazy. Gzip/deflate through Hono `compress`. Measured on localhost only; 4G timing is not verified.

## Photography and licences
All photographs are Creative Commons images from Wikimedia Commons, fetched on 2026-11-02, used as **placeholders**. They are not Company A's photographs and do not show the exact itinerary stops. Author, licence, licence URL and Commons file page for each are in `src/domain/photos.ts` (tested for completeness) and shown beside every use. Licences used: CC BY 2.0, CC BY 4.0, CC BY-SA 4.0. Resized copies are in `src/public/images/`; CC BY-SA requires the same licence on adaptations of the images, which is why each resized file is credited as the original. Company A must replace them with licensed photography before launch.

## Visible labelling of non-brief content
Footer on every page; "Synthetic demo package" chip on the five synthetic packages; "Price from the brief; itinerary is placeholder" chip on PKG-KL-07. Prices state "per person, twin sharing" and "GST pending" wherever they appear (list, price panel, price table).

## Checked (Playwright, Chromium)
Desktop 1440×900 and phone 390×844: home, package detail (hero, itinerary, photo band, price table, bottom bar), 404, enquiry placeholder. Defects found and fixed: headline covering the houseboat; three-line hero title over a busy photo; photo credit colliding with hero text on phones; 404 text misaligned with the header; footer floating on short pages. No horizontal scroll at 390px. Impeccable's detector reports no findings for `src/web/*`. Not tested: Safari/Firefox, real 4G, screen reader, tablet widths.

## Enquiry form and acknowledgement (slice S3)
- **Form:** one reading column (40rem) on the same ground, ink and teal. Three groups (your trip, your details, WhatsApp) with a visible legend, not cards. Labels above fields, hints between label and field, errors under the field in a dark red (about 7:1) with the message text, so colour is never the only signal. Inputs are 48px high and 16px type (no iOS zoom). The one teal button is the only filled element. Native `required` and input types come first; server errors arrive as a focused summary whose links jump to each field.
- **Consent and privacy:** the WhatsApp checkbox is its own group, unchecked, with the exact wording beside it. The privacy text sits above the button, labelled a draft. A demo notice at the top says not to enter real details.
- **Acknowledgement:** states the facts (reference, package, time in IST, status) and shows the acknowledgement as a quoted block with its channel and the mock-outbox caveat. It shows no contact details.
- **Checked (Playwright, Chromium):** 390×844 and 1440×900: the form, the error state (focus lands on the summary, entries kept), and the acknowledgement; no horizontal scroll; all 12 controls have labels. Defects found and fixed: every real browser submit was refused with 403 (`Origin: null` under `Referrer-Policy: no-referrer`), and the budget input and select sat at different heights on desktop. Not tested: Safari/Firefox, screen reader, tablet widths, the 429 and 500 pages in a browser (covered by HTTP tests).


## Landing page (v2 slice 1): journey ticket and timetable
Direction contract and the reviewed deviations are in `.impeccable/surfaces/src-web-pages-tsx.md`; product truth in `PRODUCT.md`. The visitor it leads with is the foreign couple or group planning from abroad (owner's answer).
- **World:** an Indian Railways reservation ticket and timetable laid over full-bleed credited photography. The home hero is a ticket: headline and lede above a dotted perforation seam with punched notches, and below it a stub of facts counted from the live packages (journeys, shortest to longest stay, lowest fare with its basis, GST pending) and the one primary button. Nothing in the stub is typed in; with no priced package the fare is omitted.
- **Journeys** are a timetable (code, journey, length, fare, Enquire stub), grouped under four themes derived from package tags (`src/web/themes.ts`: on the water, heritage and culture, hills and wildlife, coast and wellness). A package sits in the first matching theme only; unmatched packages go under "More journeys". The grouping never claims a traveller type, because the data has none (Sol review A, UX-5).
- **State by line pattern, not colour:** a solid top rule marks a journey priced from the brief, a dashed rule a demo package with placeholder content. A legend on the page says so. The perforation uses dots, so dashes keep one meaning.
- **One grid-breaking beat:** the first theme's photograph is taller than the others. Each photograph has its credit on a hairline strip directly under it (tested for every image on the page).
- **Phones:** the photo comes first, its credit directly under it, then the ticket below it, so the ticket never hides the photo and the button is inside the first screen at 390×844. From 40rem up the ticket overlaps the photo.
- **Trust section:** "How it works" states only things the site already does: what each journey page lists, that fares are per person on twin sharing with GST pending and no child or solo rates, and that a consultant will read an enquiry. No testimonials, ratings, awards, vehicle or hotel claims (Sol review A, UX-2).
- **Deferred, on purpose:** the When/Who/Budget planner strip arrives with search in slice 2; shipping fields that do nothing would promise inventory the six packages cannot match (UX-1). Navigation lists only routes that exist (Journeys, How it works); a generic Enquire link cannot exist because `/enquire` needs a package (UX-4, UX-6).
- **Checked (Playwright, Chromium):** 1440×900 and 390×844: no horizontal scroll; all six Enquire stubs sit above the row's title link and click through, and the row body goes to the package; one eager image and four lazy 900px images on a phone. Impeccable's detector: no findings. Not tested: Safari/Firefox, tablet widths, screen reader, real 4G timing. Weight, from file sizes: the eager hero is 0.49 MB; all five 2000px files together are 2.3 MB on a wide desktop, and the five 900px files total 0.49 MB on a phone. The under-2.5 s-on-4G requirement is unverified.
