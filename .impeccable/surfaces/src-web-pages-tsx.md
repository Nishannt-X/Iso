---
version: 1
slug: "src-web-pages-tsx"
primary_target: "src/web/pages.tsx"
related_targets: ["src/web/layout.tsx","src/web/styles.ts","src/web/themes.ts"]
---

# Surface brief: home (landing)

Scope: public home page `/` and the shared site header, navigation and footer. Mode: Persuade. Build path: code-led (no image generation available).

## Audience, job, action, proof, constraints
Visitor: foreign couples and groups planning a Kerala / South India trip from abroad (PRODUCT.md). Job: understand what Company A offers, what a day looks like, what it costs and on what basis, and send an informed enquiry. Action: open a package or start an enquiry. Proof available: real itineraries, per-person prices with basis, credited placeholder photography. Not available, never invent: testimonials, ratings, awards, hotel names, accreditation, phone, address. Constraints: server-rendered, no new dependencies, works without JavaScript, 4G under 2.5 s, every photo credited beside its use.

## Direction contract
THESIS: The page is one journey ticket and its timetable, seen once, with full-bleed photography. It refuses the category arrangement of hero banner, row of equal cards and a testimonial strip.
OWN-WORLD: Ticket stock and timetable ruling. Photographs bleed edge to edge; between them sit ruled departure-board rows (Day, From, To, What) in a condensed grotesque set in small-cap legends, tabular numerals for fares. Ground is cool off-white with near-black ink; the existing deep teal is the single accent, reserved for the one primary action per screen (Sol review A, UX-10: no unreviewed change of the established action colour; crimson dropped). Display and legends use Hanken Grotesk (no new font asset); legends are small caps, numerals tabular. State is drawn by rule pattern (solid, dashed, perforated), not by hue.
STORY: The visitor sees where they would go, reads a real day-by-day route, sees the fare with its basis, and understands that anything unconfirmed is marked. They believe the operator is straightforward because nothing is hidden. They open a package or enquire.
FIRST VIEWPORT: Full-bleed credited photograph; a ticket panel at the left third carries the headline "Kerala and South India, from Kochi" and, below a perforated seam, a stub of true facts computed from the live packages (journey count, shortest to longest stay, lowest fare with its basis, GST pending) and one teal action, "See the journeys". The credit sits on a hairline strip at the foot of the photograph. The When/Who/Budget planner is NOT in this slice (Sol review A, UX-1): it ships with search in slice 2, never as non-working fields.
FORM: Assigned direction, candidate 6 of the grounded list: Indian Railways reservation ticket and timetable. seed: 106cbe19f900161e
Journeys are grouped by supported themes derived from package tags (on the water, heritage, hills, coast), never by traveller type (Sol review A, UX-5). The trust section states only pricing and process facts already on the site (Sol review A, UX-2). Nav targets must all resolve (UX-4, UX-6). Raises kept from declined challengers: one decisive full-bleed beat per page that breaks the grid (manga); one reserved accent for the live action (paper menagerie); state by line pattern not colour, so confirmed and placeholder are visibly different (jackfield); the same figure always shown with the same basis (instrument cross-check).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved
- Planner strip (When, Who, Budget): deferred to slice 2.
- Copy for Hindi/German width: leave slack.
