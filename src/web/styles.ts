// One stylesheet, inlined into every page so first paint needs no extra request.
// Palette: warm ivory ground, deep forest ink, rich forest green, and copper accents.
// Type: Hanken Grotesk (OFL, self-hosted) at light weights for headings. Docs: docs/DESIGN_DECISIONS.md.

export const CSS = `
@font-face{font-family:"Hanken Grotesk";font-style:normal;font-weight:300 700;font-display:swap;
  src:url(/assets/fonts/hanken-grotesk-latin-ext.woff2) format("woff2");
  unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF}
@font-face{font-family:"Hanken Grotesk";font-style:normal;font-weight:300 700;font-display:swap;
  src:url(/assets/fonts/hanken-grotesk-latin.woff2) format("woff2");
  unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}

:root{
  --bg:#faf8f5;--surface:#ffffff;--surface-warm:#f6f2ec;
  --ink:#131e1b;--muted:#53625e;--line:#e3ded6;--line-subtle:#eee9e1;
  --forest:#0b4e46;--forest-dark:#073832;--forest-deep:#052622;
  --teal:#0b4e46;--teal-dark:#073832;--on-teal:#ffffff;
  --copper:#a45c32;--copper-dark:#8a4923;--copper-tint:#f8efe8;--copper-line:#dfcbbd;
  --scrim:rgba(5,38,34,.78);
  --glass-bg:rgba(255,255,255,.92);
  --glass-border:rgba(255,255,255,.75);
  --glass-shadow:0 16px 36px -8px rgba(19,30,27,.08),0 2px 8px rgba(19,30,27,.03);
  --shadow-sm:0 2px 6px rgba(19,30,27,.04);
  --shadow-md:0 10px 24px -4px rgba(19,30,27,.07);
  --ease:cubic-bezier(.22,1,.36,1);
  --pad:clamp(1rem,4vw,3rem);--max:72rem;
  color-scheme:light;
}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth;scrollbar-color:var(--forest) var(--bg)}
body{margin:0;display:flex;flex-direction:column;min-height:100svh;background:var(--bg);color:var(--ink);
  font:400 1.0625rem/1.6 "Hanken Grotesk",system-ui,-apple-system,"Segoe UI",sans-serif;
  font-synthesis:none;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;accent-color:var(--forest);caret-color:var(--forest)}
::selection{background:var(--forest);color:#fff}
main{flex:1}
img{display:block;max-width:100%;height:auto}
a{color:inherit;text-underline-offset:.2em;text-decoration-thickness:1px}
:focus-visible{outline:2px solid var(--forest);outline-offset:3px;border-radius:2px}
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
.site-head nav{display:flex;gap:1.5rem}
.site-head nav a{font-size:.9375rem;text-decoration:none;padding:.5rem 0}
.site-head nav a:hover{text-decoration:underline}
@media(max-width:40rem){.site-head .wrap{flex-wrap:wrap;gap:.5rem}.site-head nav{width:100%;justify-content:space-between;gap:.5rem}.site-head nav a{font-size:.875rem}}
.onimage{position:absolute;inset:0 0 auto 0;color:#fff;background:linear-gradient(to bottom,rgba(5,38,34,.7),transparent)}
.onimage .wrap{padding-top:0}

/* hero */
.hero{position:relative;color:#fff;background:var(--forest-deep);display:flex;align-items:flex-end;min-height:min(84svh,52rem);isolation:isolate;overflow:hidden}
.hero.short{min-height:min(64svh,39rem)}
.hero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2}
.hero::after{content:"";position:absolute;inset:0;z-index:-1;
  background:linear-gradient(to top,rgba(5,38,34,.95) 0%,rgba(5,38,34,.45) 45%,rgba(5,38,34,.1) 75%),
             linear-gradient(to right,rgba(5,38,34,.65) 0%,transparent 65%)}
.hero img.low{object-position:50% 100%}
.hero .wrap{padding-bottom:clamp(2.5rem,6vw,4.5rem);padding-top:7rem;position:relative}
.hero.has-credit .wrap{padding-bottom:clamp(4.25rem,7vw,5.25rem)}
.kicker{font-size:.8125rem;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.9);margin-bottom:.85rem}
.kicker .sep{opacity:.6}
.plain-heading .kicker{color:var(--muted)}
.hero h1{font-size:clamp(2rem,4.5vw,3.5rem);font-weight:300;letter-spacing:-.025em;line-height:1.12;max-width:21ch;text-shadow:0 2px 12px rgba(0,0,0,.25);overflow-wrap:break-word}
.hero .lede{margin-top:1rem;max-width:36rem;font-size:clamp(1.0625rem,1.5vw,1.25rem);line-height:1.5;color:rgba(255,255,255,.92)}
.hero .go{display:inline-block;margin-top:1.75rem;color:#fff;font-weight:500;text-decoration:none;border-bottom:1px solid rgba(255,255,255,.7);padding-bottom:.2rem;transition:border-color .2s var(--ease)}
.hero .go:hover{border-color:#fff}
.credit{position:absolute;right:var(--pad);bottom:.75rem;font-size:.75rem;color:rgba(255,255,255,.9);max-width:calc(100% - 2*var(--pad));text-align:right;
  background:rgba(5,38,34,.6);backdrop-filter:blur(8px);padding:.25rem .65rem;border-radius:.25rem;border:1px solid rgba(255,255,255,.15);overflow-wrap:break-word}
.credit a{color:inherit}
figcaption.credit-below{font-size:.75rem;color:var(--muted);margin-top:.65rem;text-align:right}
figcaption.credit-below a{color:inherit}

/* home: package rows */
.section{padding-block:clamp(3.5rem,8vw,6.5rem)}
.section-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:.5rem 2rem;margin-bottom:1rem}
.section-head h2{font-size:clamp(1.75rem,3vw,2.25rem)}
.count{color:var(--muted);font-size:.9375rem}
.notice{max-width:46rem;color:var(--muted);font-size:.9375rem;margin-bottom:clamp(2.5rem,6vw,4rem)}
.package-search{margin:0 0 clamp(2.5rem,5vw,4rem);max-width:39rem}
.package-search label{display:block;font-size:.9rem;font-weight:500;margin-bottom:.5rem}
.package-search>div{display:flex;gap:.6rem}
.package-search input{min-width:0;flex:1;border:1px solid var(--line);background:var(--surface);border-radius:.25rem;padding:.7rem 1rem;font:inherit}
.package-search .btn{min-width:7rem}
.search-title{font-size:clamp(2.25rem,5vw,3.75rem);margin:.3rem 0 2rem}
.eyebrow{text-transform:uppercase;letter-spacing:.15em;color:var(--teal);font-size:.8rem;font-weight:600}
@media(max-width:28rem){.package-search>div{flex-direction:column}.package-search .btn{width:100%}}
.site-head nav{display:flex;gap:clamp(1rem,3vw,2.5rem)}
.journal h1{font-size:clamp(2.5rem,5vw,4rem);margin:.4rem 0 .8rem}.journal>.lede{color:var(--muted);max-width:36rem}
.journal-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr));gap:1px;background:var(--line);border:1px solid var(--line);margin-top:3rem}
.journal-list li{background:var(--surface)}.journal-list a{display:flex;flex-direction:column;min-height:17rem;padding:clamp(1.5rem,3vw,2.25rem);text-decoration:none}
.journal-list span{color:var(--teal);font-size:.8rem;text-transform:uppercase;letter-spacing:.12em}.journal-list strong{font-size:1.6rem;font-weight:400;letter-spacing:-.02em;line-height:1.2;margin:.9rem 0}
.journal-list p{color:var(--muted)}.journal-list small{margin-top:auto;padding-top:2rem;color:var(--teal);font-weight:600}
.journal-list a:hover strong{text-decoration:underline;text-underline-offset:.15em}
.article{max-width:calc(52rem + var(--pad)*2);padding-block:clamp(3rem,8vw,6rem)}
.article h1{font-size:clamp(2.8rem,6vw,5rem);margin:.5rem 0 1.2rem}.article-deck{font-size:clamp(1.15rem,2vw,1.45rem);color:var(--muted);max-width:42rem}
.article figure{margin:clamp(2.5rem,5vw,4rem) 0}.article figure img{width:100%;max-height:32rem;object-fit:cover}
.article-body{max-width:42rem;font-size:1.12rem;line-height:1.8}.article-body>*+*{margin-top:1.2rem}.article-body h2{font-size:clamp(1.7rem,3vw,2.2rem);margin-top:2.6rem}.article-body h3{font-size:1.4rem;margin-top:2rem}
.article-body ul,.article-body ol{padding-left:1.5rem;list-style:disc}.article-body ol{list-style:decimal}.article-body li+li{margin-top:.4rem}.article-body blockquote{border-left:3px solid var(--teal);padding-left:1.2rem;color:var(--muted)}
.destination-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(13rem,1fr));gap:1rem;margin-top:2.5rem}.destination-grid li{border:1px solid var(--line);background:var(--surface)}.destination-grid a{display:flex;flex-direction:column;justify-content:space-between;min-height:9rem;padding:1.25rem;text-decoration:none}.destination-grid strong{font-size:1.35rem;font-weight:400}.destination-grid span{color:var(--teal);font-size:.9rem}.destination-grid a:hover{background:#eef5f1}.route-map{margin-block:3rem}.route-map ol{display:flex;flex-wrap:wrap;gap:.65rem;margin-top:1rem}.route-map li a{display:block;padding:.6rem .85rem;border:1px solid var(--line);background:var(--surface);border-radius:.2rem;text-decoration:none}.route-map li a:hover{border-color:var(--teal)}.map-action{margin-top:1.5rem}
.article-body img{max-width:100%;height:auto}.related{border-top:1px solid var(--line);margin-top:4rem;padding-top:2rem}.related h2{font-size:1.5rem;margin-bottom:1rem}
.related li{border-bottom:1px solid var(--line)}.related a{display:flex;justify-content:space-between;gap:1rem;padding:1rem 0;text-decoration:none}.related a:hover{text-decoration:underline}.related span{color:var(--teal);white-space:nowrap}
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

/* home: journey ticket, photo bands and timetable */
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.cover{display:grid;grid-template-rows:minmax(min(88svh,56rem),auto) auto;background:var(--bg)}
.cover-photo{grid-area:1/1;position:relative;background:var(--forest-deep);isolation:isolate}
.cover-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.cover-photo img.low{object-position:50% 70%}
.cover-photo::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(5,38,34,.5),transparent 50%)}
.cover-in{grid-area:1/1;align-self:end;position:relative;z-index:1;padding-block:7rem clamp(1.5rem,4vw,3rem)}
.cover>.credit-strip{grid-area:2/1}
@media(max-width:39.99rem){
  .cover{grid-template-rows:auto auto auto}
  .cover-photo{min-height:42svh}
  .cover-photo::after{display:none}
  .cover-in{grid-area:3/1;align-self:start;padding-block:1.25rem 2rem}
}
.ticket{width:min(100%,27rem);animation:issue .8s var(--ease) both;filter:drop-shadow(0 8px 24px rgba(19,30,27,.18))}
@keyframes issue{from{transform:translateY(14px)}}
.ticket-main,.ticket-stub{--n:.7rem;background:var(--surface);padding:1.75rem}
.ticket-main{padding-bottom:1.5rem;border-bottom:2px dotted #8a9894;
  -webkit-mask:radial-gradient(circle var(--n) at 0 100%,#0000 97%,#000) left/51% 100% no-repeat,radial-gradient(circle var(--n) at 100% 100%,#0000 97%,#000) right/51% 100% no-repeat;
  mask:radial-gradient(circle var(--n) at 0 100%,#0000 97%,#000) left/51% 100% no-repeat,radial-gradient(circle var(--n) at 100% 100%,#0000 97%,#000) right/51% 100% no-repeat}
.ticket-stub{padding-top:1.5rem;
  -webkit-mask:radial-gradient(circle var(--n) at 0 0,#0000 97%,#000) left/51% 100% no-repeat,radial-gradient(circle var(--n) at 100% 0,#0000 97%,#000) right/51% 100% no-repeat;
  mask:radial-gradient(circle var(--n) at 0 0,#0000 97%,#000) left/51% 100% no-repeat,radial-gradient(circle var(--n) at 100% 0,#0000 97%,#000) right/51% 100% no-repeat}
.ticket h1{font-size:clamp(2rem,3.4vw,2.625rem);max-width:15ch}
.ticket .lede{margin-top:1rem;color:var(--muted);font-size:1.0625rem;line-height:1.5}
.stub-facts{display:flex;flex-wrap:wrap;justify-content:space-between;gap:.75rem 1.25rem}
.stub-facts dt,.legend,.board-head span{font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:600}
.stub-facts dd{margin:.1rem 0 0;font-size:1.25rem;line-height:1.25}
.stub-demo-tag{display:block;font-size:.6875rem;letter-spacing:.04em;text-transform:uppercase;color:var(--copper-dark);font-weight:600;margin-top:.2rem}
.stub-basis{margin-top:.75rem;color:var(--muted);font-size:.8125rem}
.ticket .btn{width:100%;margin-top:1.25rem}
.credit-strip{display:block;margin:0;padding-block:.55rem;border-top:1px solid var(--line);background:var(--bg);color:var(--muted);font-size:.75rem}
.credit-strip .wrap{display:block}
.credit-strip a{color:inherit}
.notice.rules{display:flex;flex-wrap:wrap;gap:.35rem 2rem;max-width:none;margin-top:-1.5rem;margin-bottom:0}
.rule-sample{display:inline-block;width:2rem;height:0;margin-right:.5rem;vertical-align:middle}
.rule-sample.solid{border-top:1px solid var(--ink)}
.rule-sample.dashed{border-top:1px dashed #6b7a76}
.theme{margin-top:clamp(3rem,7vw,5.5rem)}
.bleed{margin:0}
.bleed img{width:100%;height:clamp(15rem,32vw,24rem);object-fit:cover}
.bleed.tall img{height:clamp(20rem,52vw,38rem)}
.theme-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:.25rem 2rem;padding-top:clamp(1.75rem,4vw,2.75rem);margin-bottom:1.25rem}
.theme-head h2{font-size:clamp(1.5rem,2.6vw,2rem)}
.theme-head p{color:var(--muted)}
.board-head{display:none}
.trip{position:relative;display:grid;gap:.9rem 1.5rem;padding-block:1.5rem;border-top:1px solid var(--ink);grid-template-columns:.8fr 1.2fr}
.trip[data-origin=synthetic]{border-top:1px dashed #6b7a76}
.trip:last-child{border-bottom:1px solid var(--line)}
.trip .cell{margin:0;min-width:0}
.trip .code,.trip .what,.trip .act{grid-column:1/-1}
.trip .legend{display:block;margin-bottom:.15rem}
.trip .code{font-size:.9375rem;color:var(--muted)}
.what h3{font-size:clamp(1.25rem,2vw,1.5rem);font-weight:400;letter-spacing:-.015em;line-height:1.2}
.what h3 a{text-decoration:none}
.what h3 a::after{content:"";position:absolute;inset:0}
.trip:hover .what h3 a{text-decoration:underline}
.route{margin-top:.35rem;font-size:.9375rem;color:var(--muted)}
.trip .summary{margin-top:.6rem;max-width:36rem}
.len .sub{display:block;font-size:.9375rem;color:var(--muted)}
.trip .price{display:block;margin:0}
.trip .price strong{font-size:1.5rem}
.trip .price .basis{display:block;margin-top:.15rem;font-size:.8125rem}
.stub{position:relative;z-index:1;display:inline-flex;align-items:center;min-height:2.75rem;padding:.5rem 1.25rem;color:var(--forest);font-weight:500;text-decoration:none;
  border:1px solid var(--forest);border-radius:.25rem;transition:background-color .2s var(--ease),color .2s var(--ease)}
.stub:hover{background:var(--forest);color:var(--on-teal)}
@media(min-width:56rem){
  .board-head,.trip{grid-template-columns:7.5rem minmax(0,1fr) 10.5rem 11rem 6.75rem;column-gap:1.5rem;align-items:start}
  .board-head{display:grid;padding-bottom:.6rem}
  .trip .code,.trip .what,.trip .act{grid-column:auto}
  .trip .legend{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);margin:0}
  .trip .act{text-align:right}
}
@media(max-width:28rem){
  .trip{grid-template-columns:1fr}
}
.how{border-top:1px solid var(--line)}
.how h2{font-size:clamp(1.75rem,3vw,2.25rem);margin-bottom:1.5rem}
.legs{border-top:1px solid var(--ink)}
.legs li{display:grid;grid-template-columns:3rem minmax(0,1fr);gap:1rem;padding-block:1.4rem;border-bottom:1px solid var(--line)}
.leg{font-size:1.5rem;font-weight:300;line-height:1.2;color:var(--muted)}
.legs h3{font-size:1.1875rem;font-weight:500;letter-spacing:-.005em}
.legs p{margin-top:.3rem;max-width:40rem;color:var(--muted)}
.facts{color:var(--muted);font-size:.9375rem;margin-top:.6rem}
.price{margin-top:1.25rem;display:flex;flex-wrap:wrap;align-items:baseline;gap:.15rem .6rem}
.price .from{color:var(--muted);font-size:.9375rem}
.price strong{font-size:1.625rem;font-weight:400;letter-spacing:-.01em}
.basis{color:var(--muted);font-size:.875rem}
.demo{display:inline-flex;align-items:center;gap:.4rem;margin-top:1.25rem;font-size:.8125rem;font-weight:500;
  color:var(--copper-dark);border:1px solid var(--copper-line);border-radius:999px;padding:.25rem .85rem;background:var(--copper-tint);position:relative;z-index:1}

/* empty, error and message pages */
.message{padding-block:clamp(4rem,12vw,9rem);max-width:40rem}
.message h1{font-size:clamp(2rem,4.5vw,3.25rem)}
.message p{margin-top:1.25rem;color:var(--muted)}
.message .link{display:inline-block;margin-top:2rem;color:var(--ink);font-weight:500}
.empty{padding-block:2rem;color:var(--muted)}
.plain-heading{padding-top:2rem}

/* button: one style, one action */
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:3rem;padding:.75rem 1.75rem;background:var(--forest);color:var(--on-teal);
  font:500 1rem/1 "Hanken Grotesk",system-ui,sans-serif;text-decoration:none;border-radius:.375rem;border:0;cursor:pointer;
  box-shadow:var(--shadow-sm);transition:background-color .2s var(--ease),transform .16s var(--ease),box-shadow .2s var(--ease)}
.btn:hover{background:var(--forest-dark);box-shadow:var(--shadow-md)}
.btn:active{transform:scale(.98)}

/* ==========================================================================
   PACKAGE DETAIL EXPERIENCE (EDITORIAL REFINEMENT - CLEAN & MINIMAL)
   ========================================================================== */
.detail{display:grid;gap:0 clamp(2.5rem,5vw,4.5rem);padding-block:clamp(3rem,6vw,5rem) clamp(3.5rem,7vw,6rem)}
@media(min-width:62rem){
  .detail{grid-template-columns:minmax(0,1fr) 21rem;align-items:start}
}
.package-content{min-width:0}
.detail .lead{font-size:clamp(1.1875rem,1.8vw,1.375rem);font-weight:300;letter-spacing:-.015em;line-height:1.6;max-width:42rem;color:var(--ink)}

/* At a glance: clean editorial definition list with hairlines, no card clutter */
.at-a-glance{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1rem 1.5rem;margin-top:2rem;padding-block:1.5rem;border-block:1px solid var(--line)}
.glance-item dt{font-size:.75rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.glance-item dd,.glance-value{margin-top:.35rem;font-size:1.125rem;font-weight:500;color:var(--ink);letter-spacing:-.01em}
@media(max-width:44rem){
  .at-a-glance{grid-template-columns:repeat(2,minmax(0,1fr));gap:1.25rem 1rem}
}
@media(max-width:23rem){
  .at-a-glance{grid-template-columns:1fr}
}

/* Detail section titles: calm editorial headings with generous whitespace */
.detail-section{margin-top:clamp(3.5rem,6vw,5rem)}
.detail h2{font-size:clamp(1.625rem,2.5vw,2.125rem);font-weight:300;letter-spacing:-.02em;line-height:1.2;margin-bottom:1.5rem}

/* Itinerary: responsive timeline flow */
.itinerary{border-top:1px solid var(--line)}
.itinerary-day{display:grid;grid-template-columns:5rem minmax(0,1fr);gap:.5rem 1.5rem;padding-block:1.75rem;border-bottom:1px solid var(--line-subtle);position:relative}
.day-col{padding-top:.15rem}
.itinerary .day{display:inline-flex;align-items:center;justify-content:center;padding:.3rem .75rem;font-size:.875rem;font-weight:600;
  letter-spacing:.02em;color:var(--forest);background:rgba(11,78,70,.08);border-radius:.375rem}
.day-body h3{font-size:1.25rem;font-weight:500;letter-spacing:-.01em;line-height:1.35;color:var(--ink)}
.day-body p{margin-top:.5rem;max-width:38rem;color:var(--muted);line-height:1.6}
@media(max-width:32rem){
  .itinerary-day{grid-template-columns:1fr;gap:.5rem}
}

/* Editorial photo band */
.band{margin-block:clamp(3.5rem,6vw,5rem) 0}
.band img{width:100%;aspect-ratio:21/9;object-fit:cover;display:block;border-radius:.5rem}
@media(max-width:40rem){.band img{aspect-ratio:16/10}}

/* Inclusions & exclusions: clean two-column editorial typography */
.two-col{display:grid;gap:2rem 3rem}
@media(min-width:44rem){.two-col{grid-template-columns:1fr 1fr}}
.col-group h3{font-size:1.125rem;font-weight:600;letter-spacing:-.01em;margin-bottom:1rem;color:var(--ink)}
.list li{padding-block:.65rem;border-bottom:1px solid var(--line-subtle);display:flex;align-items:baseline;gap:.65rem;color:var(--ink);line-height:1.5}
.list li:first-child{border-top:1px solid var(--line-subtle)}
.item-icon{font-size:.875rem;font-weight:700;flex-shrink:0;color:var(--forest)}
.col-group:nth-child(2) .item-icon{color:var(--muted)}

/* Stays: truthful editorial paragraph */
.stays{max-width:38rem;font-size:1.0625rem;color:var(--ink);line-height:1.55}

/* Prices table: clean rules, responsive typography */
.prices{width:100%;border-collapse:collapse}
.prices caption{text-align:left;color:var(--muted);font-size:.9375rem;padding-bottom:1rem;font-weight:400}
.prices th,.prices td{text-align:left;padding:.85rem .25rem;border-bottom:1px solid var(--line-subtle);font-weight:400;vertical-align:baseline;font-size:.9375rem}
.prices th:first-child,.prices td:first-child{padding-left:0}
.prices th:last-child,.prices td:last-child{padding-right:0;text-align:right}
.prices thead th{color:var(--muted);font-size:.8125rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;border-bottom:1px solid var(--ink);padding-bottom:.75rem}
.prices td.num{font-size:1.25rem;font-weight:500;color:var(--ink);white-space:nowrap}
@media(min-width:40rem){
  .prices th,.prices td{padding:1rem .5rem;font-size:1rem}
  .prices td.num{font-size:1.375rem}
}
.fineprint{color:var(--muted);font-size:.875rem;line-height:1.5;max-width:38rem;margin-top:1.25rem}
.fineprint+.fineprint{margin-top:.4rem}

/* ONE STRONG ENQUIRE CTA & BOOKING PANEL: sticky column on desktop, fixed bottom bar on phones */
.book{background:var(--surface);border:1px solid var(--line);border-radius:.5rem;padding:1.5rem;box-shadow:var(--shadow-md);
  transition:transform .2s var(--ease),box-shadow .2s var(--ease)}
@supports (backdrop-filter:blur(12px)) or (-webkit-backdrop-filter:blur(12px)){
  .book{background:var(--glass-bg);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
}
@media(min-width:62rem){
  .book{position:sticky;top:2rem;margin-top:0;box-shadow:var(--glass-shadow)}
}
.book .head{display:block}
.book .from{display:block;font-size:.8125rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--copper)}
.book .amount{font-size:2.5rem;font-weight:300;letter-spacing:-.03em;line-height:1.1;margin-top:.3rem;color:var(--ink)}
.book .basis{margin-top:.5rem;font-size:.875rem;color:var(--muted);line-height:1.4}
.book .btn{width:100%;margin-top:1.5rem;min-height:3.25rem;font-size:1.0625rem;letter-spacing:.01em;box-shadow:0 4px 14px rgba(11,78,70,.25)}
.book .btn:hover{box-shadow:0 6px 20px rgba(11,78,70,.35);transform:translateY(-1px)}
.book .btn:active{transform:translateY(0) scale(.99)}

@media(max-width:61.99rem){
  .detail{padding-bottom:7.5rem}
  .book{position:fixed;inset:auto 0 0 0;z-index:10;display:flex;justify-content:space-between;align-items:center;gap:.75rem;
    padding:.75rem var(--pad) calc(.75rem + env(safe-area-inset-bottom));border-width:1px 0 0;border-radius:0;box-shadow:0 -4px 20px rgba(19,30,27,.09);
    background:rgba(250,248,245,.96);max-width:100vw}
  @supports (backdrop-filter:blur(14px)) or (-webkit-backdrop-filter:blur(14px)){
    .book{backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
  }
  .book .head{min-width:0;flex:1}
  .book .from{display:inline;margin-right:.35rem;font-size:.75rem}
  .book .amount{display:inline;font-size:1.375rem;font-weight:500;margin:0}
  .book .basis{margin-top:.15rem;font-size:.75rem;overflow-wrap:break-word}
  .book .btn{flex-shrink:0;width:auto;margin:0;padding:.65rem 1.25rem;min-height:2.75rem;font-size:.9375rem}
}

/* footer */
.site-foot{border-top:1px solid var(--line);padding-block:2.5rem 3rem;color:var(--muted);font-size:.875rem}
.foot-top{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:.5rem 1.5rem;margin-bottom:1.25rem}
.site-foot .brand{color:var(--ink)}
.site-foot nav{display:flex;gap:1.5rem}
.site-foot nav a{font-size:.9375rem;text-decoration:none;padding:.5rem 0}
.site-foot nav a:hover{text-decoration:underline}
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
.demo-note{margin-top:1.25rem;padding:.75rem 1rem;border-left:3px solid var(--forest);background:var(--surface);color:var(--muted);font-size:.9375rem}
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
.field input:focus-visible,.field select:focus-visible,.field textarea:focus-visible{outline:2px solid var(--forest);outline-offset:1px;border-color:var(--forest)}
.field [aria-invalid=true]{border:2px solid #a31d1d}
.error{color:#a31d1d;font-size:.9375rem;margin-top:.4rem;font-weight:500}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:0 1rem}
@media(min-width:34rem){.budget{grid-template-columns:3fr 2fr;align-items:end}}
@media(max-width:33.99rem){.budget{grid-template-columns:1fr}}
.consent{border-top:1px solid var(--line)}
.check{display:grid;grid-template-columns:1.5rem 1fr;gap:.75rem;align-items:start}
.check input{width:1.5rem;height:1.5rem;margin:.1rem 0 0;accent-color:var(--forest)}
.check label{font-weight:400}
.check:has(input:focus-visible){outline:2px solid var(--forest);outline-offset:4px;border-radius:2px}
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

/* interactive catalog filters */
.catalog-filters{margin-top:1.5rem;display:flex;flex-direction:column;gap:.9rem;padding:1.25rem;background:var(--surface);border:1px solid var(--line);border-radius:8px}
.filter-group{display:flex;flex-wrap:wrap;align-items:center;gap:.75rem}
.filter-label{font-size:.8125rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);min-width:6.5rem}
.filter-pills{display:flex;flex-wrap:wrap;gap:.5rem}
.pill{font-family:inherit;font-size:.875rem;padding:.4rem .85rem;border-radius:9999px;border:1px solid var(--line);background:var(--bg);color:var(--ink);cursor:pointer;transition:all .18s var(--ease)}
.pill:hover{border-color:var(--forest);background:var(--surface)}
.pill.active{background:var(--forest);color:#fff;border-color:var(--forest);font-weight:500}
.trip.is-hidden{display:none!important}

/* interactive fare & party calculator */
.fare-calc-widget{margin-top:1.5rem;margin-bottom:2rem;padding:1.5rem;background:var(--surface-warm);border:1px solid var(--line);border-radius:8px}
.calc-header{margin-bottom:1.25rem}
.calc-kicker{font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--copper);display:block;margin-bottom:.25rem}
.calc-title{font-size:1.25rem;font-weight:500;color:var(--ink)}
.calc-season-picker{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.75rem;margin-top:.5rem}
.calc-season-btn{text-align:left;background:var(--surface);border:1.5px solid var(--line);border-radius:6px;padding:.75rem;cursor:pointer;display:flex;flex-direction:column;gap:.2rem;transition:border-color .15s}
.calc-season-btn:hover{border-color:var(--forest)}
.calc-season-btn.active{border-color:var(--forest);background:#f0f7f5;box-shadow:0 0 0 1px var(--forest)}
.calc-season-btn strong{font-size:.9375rem;color:var(--forest-dark);font-weight:600}
.calc-season-btn span{font-size:.8125rem;color:var(--muted)}
.calc-season-btn .calc-season-rate{font-size:.875rem;font-weight:600;color:var(--copper);margin-top:.25rem}
.calc-party-row{display:flex;flex-wrap:wrap;gap:1.5rem;margin-top:1.25rem}
.calc-stepper{display:flex;flex-direction:column;gap:.4rem}
.calc-label{font-size:.8125rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
.stepper-controls{display:inline-flex;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:6px;overflow:hidden;width:fit-content}
.stepper-controls button{width:2.5rem;height:2.5rem;background:none;border:none;font-size:1.2rem;font-weight:600;color:var(--forest);cursor:pointer;transition:background .1s}
.stepper-controls button:hover{background:var(--surface-warm)}
.stepper-controls .num{width:2.75rem;text-align:center;font-weight:600;font-size:1.05rem}
.calc-summary{margin-top:1.5rem;padding-top:1.25rem;border-top:1px dashed var(--line);display:grid;gap:1rem}
@media(min-width:44rem){.calc-summary{grid-template-columns:1fr 1fr;align-items:center}}
.calc-total-box{display:flex;flex-direction:column;gap:.2rem}
.calc-total-label{font-size:.8125rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.calc-total-fare{font-size:2.125rem;font-weight:500;color:var(--forest-dark);letter-spacing:-.02em}
.calc-per-person{font-size:.875rem;color:var(--muted)}
.calc-breakdown{font-size:.875rem;display:flex;flex-direction:column;gap:.35rem}
.calc-row{display:flex;justify-content:space-between;color:var(--muted)}
.calc-row span:last-child{font-weight:500;color:var(--ink);font-variant-numeric:tabular-nums}

/* interactive svg route map */
.route-map-visual{margin-top:1.25rem;margin-bottom:1.5rem;background:var(--surface);border:1px solid var(--line);border-radius:8px;overflow:hidden}
.map-viewport{position:relative;width:100%;padding:1rem}
.journey-svg-map{width:100%;height:auto;max-height:380px;display:block}
.waypoint-pin{cursor:pointer;transition:transform .2s cubic-bezier(.34,1.56,.64,1);outline:none}
.waypoint-pin:hover,.waypoint-pin.is-active,.waypoint-pin:focus-visible{transform:scale(1.15)}
.pin-ring{transition:fill .2s,stroke .2s}
.waypoint-pin:hover .pin-ring,.waypoint-pin.is-active .pin-ring{fill:#f0f7f5;stroke:var(--copper);stroke-width:3.5px}
.pin-label{font-size:13px;font-weight:600;fill:var(--ink);pointer-events:none}
.waypoint-card{margin-top:1rem;padding:1rem;background:var(--surface-warm);border-radius:6px;border:1px solid var(--line);display:none}
.waypoint-card.is-open{display:block;animation:fadeIn .25s ease-out}
.card-dest-name{font-size:1.05rem;font-weight:600;color:var(--forest);margin-bottom:.25rem}
.card-dest-info{font-size:.875rem;color:var(--ink);margin-bottom:.5rem;line-height:1.45}
.card-dest-link{font-size:.8125rem;color:var(--forest);font-weight:500;text-decoration:underline}
.day-highlight{background:#fff8e8!important;border-left:3px solid var(--copper)!important;transition:background .3s ease}

/* slide-over enquiry drawer */
.drawer{position:fixed;inset:0;z-index:100;pointer-events:none;visibility:hidden;transition:visibility .3s}
.drawer.is-open{pointer-events:auto;visibility:visible}
.drawer-backdrop{position:absolute;inset:0;background:rgba(5,38,34,.65);opacity:0;transition:opacity .3s ease;backdrop-filter:blur(2px)}
.drawer.is-open .drawer-backdrop{opacity:1}
.drawer-panel{position:absolute;top:0;right:0;bottom:0;width:100%;max-width:30rem;background:var(--bg);box-shadow:-8px 0 24px rgba(0,0,0,.15);transform:translateX(100%);transition:transform .3s cubic-bezier(.22,1,.36,1);display:flex;flex-direction:column;overflow-y:auto;padding:2rem 1.75rem}
.drawer.is-open .drawer-panel{transform:translateX(0)}
.drawer-header{display:flex;justify-content:space-between;align-items:start;margin-bottom:1.25rem;padding-bottom:1rem;border-bottom:1px solid var(--line)}
.drawer-kicker{font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--copper);display:block}
.drawer-pkg-title{font-size:1.25rem;font-weight:500;color:var(--forest-dark);margin-top:.2rem}
.drawer-close{background:none;border:1px solid var(--line);border-radius:50%;width:2.25rem;height:2.25rem;font-size:1.1rem;cursor:pointer;color:var(--muted);display:inline-flex;align-items:center;justify-content:center;transition:all .15s}
.drawer-close:hover{background:var(--surface);color:var(--ink);border-color:var(--forest)}
.drawer-summary-card{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:.85rem 1rem;margin-bottom:1.5rem;display:flex;flex-direction:column;gap:.35rem;font-size:.875rem}
.summary-line{display:flex;justify-content:space-between;align-items:baseline}
.summary-label{color:var(--muted)}
.drawer-form{display:flex;flex-direction:column;gap:1.1rem}
.drawer-form .field{margin-top:0}
.drawer-submit{width:100%;margin-top:.5rem}
.drawer-footnote{font-size:.8125rem;color:var(--muted);text-align:center;margin-top:.5rem}

/* plain-english jargon tooltips */
.tip-wrap{position:relative;display:inline-block}
.tip-btn{background:none;border:none;font-size:.8125rem;color:var(--forest);text-decoration:underline dotted;cursor:pointer;padding:0 .2rem;font-weight:500}
.tip-box{position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);width:16rem;background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow-md);border-radius:6px;padding:.75rem .9rem;font-size:.8125rem;line-height:1.4;color:var(--ink);display:none;z-index:20;text-align:left}
.tip-open .tip-box{display:block;animation:fadeIn .2s ease-out}

@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}

@media(prefers-reduced-motion:reduce){*,*::before,*::after{transition-duration:.01ms!important;animation-duration:.01ms!important;scroll-behavior:auto!important}}
`;
