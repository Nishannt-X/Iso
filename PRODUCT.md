# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Primary visitor (confirmed with the owner of this build):** foreign groups and couples planning a Kerala / South India trip from abroad. Long lead time, comparing operators, needs to know exactly what is included, how pricing works, and that the operator is real. English only for now (Hindi and German are later).
- **Secondary visitors (from the client brief):** Indian families and honeymooners.
- **Staff (48 at Company A):** edit packages and prices, triage enquiries, build quotes. Today a package or price change costs ₹3,000 and 3 days through a freelancer.

## Product Purpose
Company A, a Kochi tour operator (about 4,300 bookings a year across 60 packages), needs a site where visitors can understand a package and its price, and send an enquiry that staff can act on, and where staff can change packages without an agency. Success: a visitor reaches an informed enquiry quickly, and staff publish a price change in minutes.

## Positioning
Every price is stated per person, twin sharing, with the GST position stated; every day of every itinerary is laid out. Honesty about what is and is not known is part of the position (no invented ratings, hotels or tax rates).

## Operating Context
Enquiries currently arrive by web form, chat, WhatsApp, email and phone and are logged in Excel. Quotes are Word files saved as PDF. Pages must load in under 2.5 s on 4G, be server-rendered with clean URLs, and traveller data is personal data under the DPDP Act 2023 (WhatsApp follow-up needs consent).

## Capabilities and Constraints
- Server-rendered Hono + JSX, SQLite, no client framework, no new npm dependencies without approval. Small progressive-enhancement JavaScript only.
- v1 (tag `v1`): package list, package page, credited placeholder photography, seasonal per-person prices.
- GST rate: unknown, always shown as "pending". No child-fare rule is known. No hotel names exist (star category only).
- Only 6 live packages; 4 are synthetic demo packages and are labelled as such.
- Deferred by the brief: maps, blog, redirects from 140 old URLs, Hindi/German, traveller accounts.
- Photography is Creative Commons placeholder imagery from Wikimedia Commons and must be credited beside each use; Company A must supply licensed photography before launch.

## Brand Commitments
- Public name: **"Kochi Tours"**, a placeholder kept until Company A supplies its real name, logo and legal details. No logo exists.

## Evidence on Hand
- Two packages and one sample enquiry from the client brief (`docs/CLIENT_BRIEF.md`); the rest is synthetic and labelled.
- Absent, and not to be fabricated: testimonials, ratings, awards, press, customer counts shown to visitors, real hotel names, a licence or accreditation number, staff photos, a phone number or address.

## Product Principles
1. Say only what the data supports; label placeholders and unknowns instead of smoothing them over.
2. A price is never shown without its basis (per person, twin sharing) and its GST position.
3. The path from "interested" to "enquiry sent" is short and works without JavaScript.
4. Every photograph is credited beside its use.
5. Fast on 4G beats rich on a fast laptop.

## Accessibility & Inclusion
Keyboard and screen-reader usable; visible focus; sufficient contrast over photography; respects reduced-motion. English now, with copy and layout that leave room for longer Hindi and German strings later.
