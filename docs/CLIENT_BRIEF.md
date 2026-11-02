# Client Brief: Company A, Kochi tour operator (Problem 2)

> Verbatim transcription of the full brief as given by the project owner. Section labels are the brief's own. Nothing in this file is inferred. The build's assumptions live in `docs/PROJECT_BRIEF.md` (table A1 onward) and are never recorded here.

## CLIENT
Company A, Kochi. Tour operator selling Kerala and South India holiday packages to families, honeymooners and foreign groups. 48 staff, revenue ₹28–34 crore a year, about 4,300 bookings a year across 60 packages.

## TODAY
The website was built by a freelancer 6 years ago, and every package or price change costs ₹3,000 and 3 days. Blogs sit on a free blogging platform with no link to packages. Enquiries arrive by web form, chat, WhatsApp, email and phone, and are logged in Excel. Quotes are Word files saved as PDF.

## THE PROBLEM
Assumptions: 2,400 web enquiries a month, 15% of which book. 25% (600) get a reply after 12 hours and convert at 7% instead of 15%: 600 × 8% = 48 bookings lost a month × ₹65,000 average package × 14% margin = ₹4.37 lakh a month, ₹52.42 lakh a year. 40 content changes a month × ₹3,000 = ₹14.4 lakh a year. Total ₹66.82 lakh a year.

## USERS
Travellers (mostly mobile), consultants who handle enquiries, and content staff. The founder-MD signs the deal.

## THE ASK
I want to add a package or change a price myself in five minutes without calling anyone. Our blogs should live on our own site and lead readers to the right package. Every enquiry, from any channel, should land in one admin inbox, go to a consultant and get a reply within the hour. The site must look as good as the places we sell.

## MUST HAVE
Public site: destination and package pages with day-wise itinerary, inclusions, hotels, seasonal pricing, photos and map, plus search
Package CMS: create, edit, duplicate, seasonal prices, schedule, preview and version history
Blog CMS: rich editor with images, categories, SEO fields and related packages on each post
Enquiry forms on every package and an admin inbox with status, assignment, notes and replies
Quote builder from a package, sent as a branded PDF and link
Admin, editor and consultant roles with an activity log

## CORE BUILD
Software Engineering candidates must ship this slice end to end, in about 6 to 8 screens: public package pages, package CMS with seasonal prices and preview, enquiry form, and admin enquiry inbox. Roles: traveller and staff admin. AI: enquiry extraction and package suggestions. Hard part: versioned CMS with preview and server-rendered pages. Mock payments, messages and outside systems, and seed from the sample data. The rest of MUST HAVE is optional depth.

## OUT OF SCOPE
Online payment and live hotel or flight inventory
Visa services
Native mobile apps

## AI OR AUTOMATION
Every enquiry gets an instant acknowledgement from a fixed template. AI extracts dates, travellers, destination and budget from each message, suggests the three best-fit packages and drafts a reply. When it is wrong: extracted fields sit beside the original message for correction; nothing is sent or published until a consultant or editor accepts it; prices in drafts come from the package price table, never from the AI.

## CONSTRAINTS
Prices must state the per-person basis, twin sharing and GST. Traveller data is personal data under the DPDP Act 2023; WhatsApp follow-ups need consent. Search matters: server-rendered pages, clean URLs, a sitemap, and redirects from 140 old URLs. Pages must load in under 2.5 seconds on 4G. English now; Hindi and German later.

## DESIGN
The client values good, minimal design: clean layouts, white space, a restrained palette and clear type, with nothing on screen that lacks a purpose. Design counts as much as features. Travel is sold by feeling: full-width photography, quiet type and one clear Enquire button on every package. The admin panel must be just as clean, so a non-technical editor can update a package without training.

## BUDGET AND TIME
₹8.5 lakh, 7 weeks. Success: package changes done in-house in under 10 minutes; 90% of enquiries answered within an hour in working hours; organic traffic up 40% in 9 months; enquiry-to-booking from 15% to 18%.

## SAMPLE DATA
```
PKG-KL-07 | Munnar, Thekkady and Alleppey houseboat | 6 days | Peak, Oct-Mar | 4 star | ₹32500 per person | Published
PKG-KL-07 | Munnar, Thekkady and Alleppey houseboat | 6 days | Monsoon, Jun-Sep | 4 star | ₹24900 per person | Published
PKG-SI-12 | Madurai, Rameswaram and Kanyakumari | 5 days | All year | 3 star | ₹18750 per person | Draft
```

Sample enquiry: Hi, 2 adults and 1 kid, Kerala 5-6 nights in December, budget around 1.2 lakh total, houseboat a must

---

## What the brief does not say (checked against the text above)

- **GST:** the brief requires prices to state GST but gives no rate and does not say whether the sample prices include it. The build shows "GST: pending" and invents no rate.
- **Child fares, single supplement:** no rule is given.
- **Season day boundaries:** only months are given ("Oct-Mar", "Jun-Sep"). Exact days, `nights = days − 1`, region labels, itineraries, inclusions, hotels and photographs are not in the brief.
- **Months with no price:** Apr–May has no season for PKG-KL-07.
- **Roles:** the CORE BUILD says "traveller and staff admin"; MUST HAVE lists admin, editor and consultant. How the build maps these is an assumption (`PROJECT_BRIEF.md`).
