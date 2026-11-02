// One stylesheet, inlined into every page so first paint needs no extra request.
// World: backwater light. Cool white ground, deep-water ink and one teal for the single action.
// Type: Hanken Grotesk (OFL, self-hosted) at light weights for headings. Docs: docs/DESIGN_DECISIONS.md.

export const CSS = `
@font-face{font-family:"Hanken Grotesk";font-style:normal;font-weight:300 700;font-display:swap;
  src:url(/assets/fonts/hanken-grotesk-latin-ext.woff2) format("woff2");
  unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF}
@font-face{font-family:"Hanken Grotesk";font-style:normal;font-weight:300 700;font-display:swap;
  src:url(/assets/fonts/hanken-grotesk-latin.woff2) format("woff2");
  unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}

:root{
  --bg:#f8f9f7;--surface:#fff;--ink:#12201d;--muted:#52615d;--line:#dbe1de;
  --teal:#0b5a55;--teal-dark:#07413d;--on-teal:#fff;
  --scrim:rgba(7,22,20,.62);
  --ease:cubic-bezier(.22,1,.36,1);
  --pad:clamp(1.25rem,4vw,3rem);--max:72rem;
  color-scheme:light;
}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;display:flex;flex-direction:column;min-height:100svh;background:var(--bg);color:var(--ink);font:400 1.0625rem/1.6 "Hanken Grotesk",system-ui,-apple-system,"Segoe UI",sans-serif;
  font-synthesis:none;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;accent-color:var(--teal);caret-color:var(--teal)}
::selection{background:var(--teal);color:#fff}
main{flex:1}
img{display:block;max-width:100%;height:auto}
a{color:inherit;text-underline-offset:.2em;text-decoration-thickness:1px}
:focus-visible{outline:2px solid var(--teal);outline-offset:3px;border-radius:2px}
.onimage :focus-visible,.hero :focus-visible{outline-color:#fff}
h1,h2,h3,p,ul,ol,dl,dd,figure,table{margin:0}
ul,ol{padding:0;list-style:none}
h1,h2,h3{font-weight:300;letter-spacing:-.02em;line-height:1.08;text-wrap:balance}
p{text-wrap:pretty}
.num{font-variant-numeric:tabular-nums}
.wrap{width:100%;max-width:calc(var(--max) + var(--pad)*2);margin-inline:auto;padding-inline:var(--pad)}
.skip{position:absolute;left:var(--pad);top:-4rem;background:var(--surface);color:var(--ink);padding:.6rem 1rem;z-index:20}
.skip:focus{top:.75rem}

/* header */
.site-head{position:relative;z-index:5;padding-block:1.25rem}
.site-head .wrap{display:flex;justify-content:space-between;align-items:baseline;gap:1rem}
.brand{font-weight:500;letter-spacing:-.01em;text-decoration:none;font-size:1.125rem}
.site-head nav a{font-size:.9375rem;text-decoration:none;padding:.5rem 0}
.site-head nav a:hover{text-decoration:underline}
.onimage{position:absolute;inset:0 0 auto 0;color:#fff;background:linear-gradient(to bottom,rgba(7,22,20,.62),transparent)}
.onimage .wrap{padding-top:0}

/* hero */
.hero{position:relative;color:#fff;background:#14302c;display:flex;align-items:flex-end;min-height:min(84svh,52rem);isolation:isolate}
.hero.short{min-height:min(68svh,42rem)}
.hero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2}
.hero::after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(to top,var(--scrim) 0%,rgba(7,22,20,.25) 45%,transparent 75%),linear-gradient(to right,rgba(7,22,20,.4),transparent 65%)}
.hero img.low{object-position:50% 100%}
.hero .wrap{padding-bottom:clamp(2.25rem,6vw,4.5rem);padding-top:7rem}
.hero h1{font-size:clamp(2.25rem,4.9vw,3.75rem);max-width:21ch}
.hero .lede{margin-top:1.1rem;max-width:36rem;font-size:clamp(1.0625rem,1.6vw,1.25rem);line-height:1.5;color:rgba(255,255,255,.92)}
.hero .go{display:inline-block;margin-top:1.75rem;color:#fff;font-weight:500;text-decoration:none;border-bottom:1px solid rgba(255,255,255,.7);padding-bottom:.2rem;transition:border-color .2s var(--ease)}
.hero .go:hover{border-color:#fff}
.credit{position:absolute;right:var(--pad);bottom:.75rem;font-size:.75rem;color:rgba(255,255,255,.88);max-width:calc(100% - 2*var(--pad));text-align:right}
.credit a{color:inherit}
.hero .wrap{position:relative}
.hero.has-credit .wrap{padding-bottom:clamp(4.75rem,7vw,5rem)}
figcaption.credit-below{font-size:.75rem;color:var(--muted);margin-top:.5rem;text-align:right}
figcaption.credit-below a{color:inherit}

/* home: package rows */
.section{padding-block:clamp(3.5rem,8vw,6.5rem)}
.section-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:.5rem 2rem;margin-bottom:1rem}
.section-head h2{font-size:clamp(1.75rem,3vw,2.25rem)}
.count{color:var(--muted);font-size:.9375rem}
.notice{max-width:46rem;color:var(--muted);font-size:.9375rem;margin-bottom:clamp(2.5rem,6vw,4rem)}
.rows{display:grid;gap:clamp(3rem,7vw,5.5rem)}
.row{position:relative;display:grid;gap:1.25rem 3rem;align-items:center}
@media(min-width:56rem){.row{grid-template-columns:minmax(0,7fr) minmax(0,5fr)}.row:nth-child(even) .shot{order:2}}
.shot{margin:0}
.row .credit-below{text-align:left}
.row .credit-below a{position:relative;z-index:1}
.thumb{overflow:hidden;background:#d9e0dd;aspect-ratio:3/2}
.thumb.none{display:grid;place-items:center;color:var(--muted);font-size:.9375rem}
.thumb img{width:100%;height:100%;object-fit:cover;transition:transform .6s var(--ease)}
.row h2{font-size:clamp(1.5rem,2.6vw,2rem)}
.row h2 a{text-decoration:none}
.row h2 a::after{content:"";position:absolute;inset:0}
.row:hover h2 a{text-decoration:underline;text-decoration-thickness:1px}
@media(hover:hover){.row:hover .thumb img{transform:scale(1.025)}}
.facts{color:var(--muted);font-size:.9375rem;margin-top:.6rem}
.row .summary{margin-top:1rem;max-width:34rem}
.price{margin-top:1.25rem;display:flex;flex-wrap:wrap;align-items:baseline;gap:.15rem .6rem}
.price .from{color:var(--muted);font-size:.9375rem}
.price strong{font-size:1.625rem;font-weight:400;letter-spacing:-.01em}
.basis{color:var(--muted);font-size:.875rem}
.demo{display:inline-block;margin-top:1rem;font-size:.8125rem;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:.15rem .7rem;background:var(--surface);position:relative;z-index:1}

/* empty, error and message pages */
.message{padding-block:clamp(4rem,12vw,9rem);max-width:40rem}
.message h1{font-size:clamp(2rem,4.5vw,3.25rem)}
.message p{margin-top:1.25rem;color:var(--muted)}
.message .link{display:inline-block;margin-top:2rem;color:var(--ink);font-weight:500}
.empty{padding-block:2rem;color:var(--muted)}

/* button: one style, one action */
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:3rem;padding:.75rem 1.75rem;background:var(--teal);color:var(--on-teal);
  font:500 1rem/1 "Hanken Grotesk",system-ui,sans-serif;text-decoration:none;border-radius:.25rem;border:0;cursor:pointer;
  transition:background-color .2s var(--ease),transform .16s var(--ease)}
.btn:hover{background:var(--teal-dark)}
.btn:active{transform:scale(.98)}

/* package detail */
.detail{display:grid;gap:0 clamp(2.5rem,6vw,5rem);padding-block:clamp(2.5rem,6vw,4.5rem) clamp(3rem,7vw,5rem)}
@media(min-width:62rem){.detail{grid-template-columns:minmax(0,1fr) 19rem;align-items:start}}
.detail .lead{font-size:clamp(1.125rem,1.8vw,1.375rem);line-height:1.55;max-width:38rem}
.at-a-glance{display:grid;grid-template-columns:repeat(auto-fit,minmax(9.5rem,1fr));gap:1.25rem 2rem;margin-top:2.25rem;padding-block:1.5rem;border-block:1px solid var(--line)}
.at-a-glance dt{font-size:.875rem;color:var(--muted)}
.at-a-glance dd{margin-top:.15rem;font-weight:500}
.detail h2{font-size:clamp(1.5rem,2.6vw,2rem);margin:clamp(3rem,6vw,4.5rem) 0 1.25rem}
.itinerary{border-top:1px solid var(--line)}
.itinerary li{display:grid;grid-template-columns:4.5rem minmax(0,1fr);gap:.25rem 1rem;padding-block:1.25rem;border-bottom:1px solid var(--line)}
.itinerary .day{color:var(--muted);font-size:.9375rem;padding-top:.2rem}
.itinerary h3{font-size:1.1875rem;font-weight:500;letter-spacing:-.005em;line-height:1.3}
.itinerary p{margin-top:.35rem;max-width:36rem;color:var(--muted)}
.band{margin-block:clamp(3rem,6vw,4.5rem) 0}
.band img{width:100%;aspect-ratio:21/8;object-fit:cover}
@media(max-width:40rem){.band img{aspect-ratio:3/2}}
.two-col{display:grid;gap:2rem 3rem}
@media(min-width:44rem){.two-col{grid-template-columns:1fr 1fr}}
.two-col h3{font-size:1.0625rem;font-weight:500;letter-spacing:0;margin-bottom:.75rem}
.list li{padding-block:.55rem;border-bottom:1px solid var(--line)}
.list li:first-child{border-top:1px solid var(--line)}
.prices{width:100%;border-collapse:collapse}
.prices caption{text-align:left;color:var(--muted);font-size:.9375rem;padding-bottom:.75rem}
.prices th,.prices td{text-align:left;padding:.9rem 0;border-bottom:1px solid var(--line);font-weight:400;vertical-align:baseline}
.prices thead th{color:var(--muted);font-size:.875rem;border-bottom-color:var(--ink)}
.prices td:last-child,.prices th:last-child{text-align:right}
.prices td:last-child{font-size:1.25rem}
.fineprint{margin-top:1rem;color:var(--muted);font-size:.9375rem;max-width:38rem}
.fineprint+.fineprint{margin-top:.4rem}
.stays{max-width:38rem}

/* booking panel: sticky column on desktop, bottom bar on phones. One element, one Enquire button. */
.book{background:var(--surface);border:1px solid var(--line);padding:1.5rem}
.book .from{color:var(--muted);font-size:.9375rem}
.book .amount{font-size:2.25rem;font-weight:300;letter-spacing:-.02em;line-height:1.1;margin-top:.15rem}
.book .basis{margin-top:.35rem}
.book .btn{width:100%;margin-top:1.25rem}
@media(min-width:62rem){.book{position:sticky;top:1.5rem;margin-top:0}}
@media(max-width:61.99rem){
  .detail{padding-bottom:7rem}
  .book{position:fixed;inset:auto 0 0 0;z-index:10;display:grid;grid-template-columns:1fr auto;align-items:center;gap:.5rem 1rem;
    padding:.75rem var(--pad) calc(.75rem + env(safe-area-inset-bottom));border-width:1px 0 0}
  .book .amount{font-size:1.5rem;margin:0}
  .book .btn{width:auto;margin:0;grid-row:1/span 2;grid-column:2;padding-inline:1.25rem}
  .book .from{display:inline}
  .book .basis{margin:0;font-size:.75rem;grid-column:1}
  .book .head{grid-column:1}
}
.book .head{display:block}

/* footer */
.site-foot{border-top:1px solid var(--line);padding-block:2.5rem 3rem;color:var(--muted);font-size:.875rem}
.site-foot p{max-width:44rem}
.site-foot p+p{margin-top:.6rem}
@media(max-width:61.99rem){.has-book .site-foot{padding-bottom:7.5rem}}

/* enquiry form and acknowledgement */
.enquiry{max-width:40rem;padding-block:clamp(2.5rem,7vw,5rem) clamp(3rem,8vw,6rem)}
.enquiry h1{font-size:clamp(2rem,4.2vw,3rem)}
.enquiry .crumb{font-size:.9375rem;margin-bottom:1.5rem}
.enquiry .facts{margin-top:.75rem}
.enquiry .price{margin-top:.75rem}
.enquiry .lead-in{margin-top:1rem;font-size:1.1875rem;line-height:1.5}
.demo-note{margin-top:1.25rem;padding:.75rem 1rem;border-left:3px solid var(--teal);background:var(--surface);color:var(--muted);font-size:.9375rem}
.error-summary{--err:#a31d1d;margin-top:1.75rem;padding:1rem 1.25rem;border:2px solid var(--err);background:var(--surface)}
.error-summary:focus{outline:2px solid var(--err);outline-offset:2px}
.error-summary h2{font-size:1.125rem;font-weight:500;letter-spacing:0;color:var(--err)}
.error-summary p{margin-top:.5rem}
.error-summary ul{margin-top:.5rem;list-style:disc;padding-left:1.25rem}
.error-summary li{padding-block:.15rem}
.error-summary a{color:var(--err)}
.form{margin-top:2rem}
.form fieldset{border:0;border-top:1px solid var(--line);margin:0 0 2rem;padding:1.5rem 0 0;min-width:0}
.form legend{font-size:1.375rem;font-weight:300;letter-spacing:-.02em;padding:0;float:left;width:100%;margin-bottom:1.25rem}
.form legend+*{clear:both}
.field{margin-bottom:1.25rem}
.field label,.check label{font-weight:500;font-size:1rem;display:block}
.field .opt{font-weight:400;color:var(--muted)}
.hint{color:var(--muted);font-size:.9375rem;margin-top:.15rem}
.field input,.field select,.field textarea{display:block;width:100%;margin-top:.4rem;min-height:3rem;padding:.65rem .8rem;font:400 1rem/1.4 "Hanken Grotesk",system-ui,sans-serif;
  color:var(--ink);background:var(--surface);border:1px solid #6b7a76;border-radius:.25rem;appearance:none}
.field select{background-image:linear-gradient(45deg,transparent 50%,var(--ink) 50%),linear-gradient(135deg,var(--ink) 50%,transparent 50%);background-position:calc(100% - 1.1rem) 52%,calc(100% - .8rem) 52%;background-size:.3rem .3rem;background-repeat:no-repeat;padding-right:2.25rem}
.field textarea{min-height:8rem;resize:vertical}
.field input:focus-visible,.field select:focus-visible,.field textarea:focus-visible{outline:2px solid var(--teal);outline-offset:1px;border-color:var(--teal)}
.field [aria-invalid=true]{border:2px solid #a31d1d}
.error{color:#a31d1d;font-size:.9375rem;margin-top:.4rem;font-weight:500}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:0 1rem}
@media(min-width:34rem){.budget{grid-template-columns:3fr 2fr}}
@media(max-width:33.99rem){.budget{grid-template-columns:1fr}}
.consent{border-top:1px solid var(--line)}
.check{display:grid;grid-template-columns:1.5rem 1fr;gap:.75rem;align-items:start}
.check input{width:1.5rem;height:1.5rem;margin:.1rem 0 0;accent-color:var(--teal)}
.check label{font-weight:400}
.check:has(input:focus-visible){outline:2px solid var(--teal);outline-offset:4px;border-radius:2px}
.check input:focus-visible{outline:0}
.privacy{margin-bottom:1.75rem;padding:1rem 1.25rem;border:1px solid var(--line);background:var(--surface);font-size:.9375rem}
.privacy h2{font-size:1.0625rem;font-weight:500;letter-spacing:0;margin-bottom:.5rem}
.privacy p+p{margin-top:.5rem}
.privacy .fineprint{margin-top:.75rem}
.form .btn{width:100%}
@media(min-width:34rem){.form .btn{width:auto;min-width:14rem}}
.hp{position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden}
.enquiry .sub{font-size:1.375rem;margin:2.5rem 0 1rem}
.ack{margin:0;padding:1.25rem;border:1px solid var(--line);background:var(--surface)}
.ack blockquote{margin:0}
.ack figcaption{margin-top:.9rem;color:var(--muted);font-size:.875rem}
.enquiry .back{display:inline-block;margin-top:2rem;font-weight:500}

@media(prefers-reduced-motion:reduce){*,*::before,*::after{transition-duration:.01ms!important;scroll-behavior:auto!important}}
`;
