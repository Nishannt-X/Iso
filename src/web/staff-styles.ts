// Extra CSS for the staff area, appended to the public stylesheet (same tokens, same type, same form controls).
// Operate register: plain lists, hairlines and text before colour. Status and waiting time always carry words, so
// colour is never the only signal. Docs: docs/DESIGN_DECISIONS.md.

export const STAFF_CSS = `
:root{--amber-bg:#fff4d6;--amber-ink:#5f4300;--red-bg:#fde8e8;--red-ink:#8a1616;--ok-bg:#e6f1ef;--ok-ink:#07413d}
.site-head:has(.staff-nav){border-bottom:1px solid var(--line);padding-block:.9rem}
.site-head:has(.staff-nav) .wrap{align-items:center}
.staff-nav{display:flex;flex-wrap:wrap;align-items:center;gap:.25rem 1.25rem;justify-content:flex-end}
.staff-nav a,.linkbtn{font:inherit;font-size:.9375rem;color:var(--ink);text-decoration:none;padding:.5rem 0;background:none;border:0;cursor:pointer;min-height:2.75rem;display:inline-flex;align-items:center}
.staff-nav a:hover,.linkbtn:hover{text-decoration:underline}
.staff-nav a[aria-current=page]{text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:.4em}
.staff-nav .who{font-size:.875rem;color:var(--muted)}
.staff-nav form{margin:0}
.staff-tag{font-size:.75rem;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);margin-left:.5rem}

.staff-page{padding-block:clamp(1.75rem,4vw,3rem) clamp(3rem,6vw,5rem)}
.staff-page h1{font-size:clamp(1.75rem,3.4vw,2.5rem)}
.staff-page .lede{margin-top:.5rem;color:var(--muted);max-width:44rem;font-size:1rem}
.login{max-width:26rem;padding-block:clamp(2.5rem,8vw,5rem)}
.login .form{margin-top:1.5rem}
.login .field input{max-width:none}

.banner{margin-top:1.25rem;padding:.75rem 1rem;border-left:3px solid var(--teal);background:var(--surface);font-size:.9375rem}
.banner.mock{border-left-color:#8a6100;background:#fff9e8;color:#3d2c00}

/* inbox */
.tabs{display:flex;flex-wrap:wrap;gap:.25rem 1.5rem;margin-top:1.75rem;border-bottom:1px solid var(--line)}
.tabs a{display:inline-flex;gap:.4rem;align-items:baseline;padding:.65rem 0;min-height:2.75rem;text-decoration:none;border-bottom:2px solid transparent;margin-bottom:-1px;font-size:.9375rem}
.tabs a:hover{border-bottom-color:var(--line)}
.tabs a[aria-current=page]{border-bottom-color:var(--teal);font-weight:500}
.tabs .n{color:var(--muted);font-variant-numeric:tabular-nums}
.filters{display:grid;gap:.75rem 1rem;margin-top:1.25rem;grid-template-columns:minmax(0,1fr)}
@media(min-width:48rem){.filters{grid-template-columns:minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) auto;align-items:end}}
.filters .field{margin:0}
.filters .actions{display:flex;gap:1rem;align-items:center;min-height:3rem}
.filters .btn{min-height:3rem}
.legend{margin-top:1rem;color:var(--muted);font-size:.875rem;max-width:46rem}
.queue{margin-top:1rem;border-top:1px solid var(--line)}
.q-row{display:grid;gap:.5rem 1.5rem;padding:1rem .25rem;border-bottom:1px solid var(--line);text-decoration:none;color:inherit;grid-template-columns:minmax(0,1fr)}
.q-row:hover{background:var(--surface)}
.q-row:focus-visible{outline-offset:-2px}
@media(min-width:56rem){.q-row{grid-template-columns:10rem minmax(0,1fr) 12rem 12rem;align-items:start;padding-inline:.75rem}}
.q-ref{font-weight:500;font-variant-numeric:tabular-nums;letter-spacing:.02em}
.q-when{display:block;color:var(--muted);font-size:.8125rem}
.q-name{font-weight:500}
.q-sub{display:block;color:var(--muted);font-size:.9375rem;overflow-wrap:anywhere}
.q-who{font-size:.9375rem;margin-top:.35rem;color:var(--muted)}
.q-sla strong{display:block;font-weight:500;font-size:.9375rem}
.q-sla small{display:block;font-size:.8125rem;color:var(--muted)}
.chip{display:inline-block;padding:.1rem .65rem;border:1px solid var(--line);border-radius:999px;background:var(--surface);font-size:.8125rem;line-height:1.5;white-space:nowrap}
.chip.s-new{background:var(--ok-bg);border-color:#b9d6d2;color:var(--ok-ink)}
.chip.s-in_progress{border-color:var(--ink)}
.chip.s-replied,.chip.s-closed{color:var(--muted)}
.chip.sample{color:var(--muted);margin-left:.4rem}
.sla-past_target strong{color:var(--amber-ink)}
.sla-late strong{color:var(--red-ink)}
.mark{display:inline-block;width:.6rem;height:.6rem;border-radius:50%;margin-right:.4rem;vertical-align:baseline;background:var(--muted)}
.sla-within_target .mark{background:var(--teal)}
.sla-past_target .mark{background:#b07a00;border-radius:1px;transform:rotate(45deg) scale(.85)}
.sla-late .mark{background:#a31d1d;border-radius:0}
.pager{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:.75rem 1.5rem;margin-top:1.5rem;font-size:.9375rem}
.pager a{font-weight:500}
.pager .off{color:var(--muted)}
.empty-state{margin-top:1.5rem;padding:2rem 1.25rem;border:1px dashed var(--line);background:var(--surface);color:var(--muted)}
.empty-state h2{font-size:1.25rem;color:var(--ink);font-weight:400}
.empty-state p{margin-top:.5rem;max-width:36rem}
.empty-state a{color:var(--ink);font-weight:500}

/* workspace */
.ws-head{margin-top:.5rem}
.ws-head h1{overflow-wrap:anywhere}
.ws-sub{margin-top:.5rem;color:var(--muted);font-size:.9375rem}
.ws-state{display:flex;flex-wrap:wrap;gap:.5rem 1.25rem;align-items:center;margin-top:1rem}
.ws-state .sla-text{font-size:.9375rem}
.handle{display:grid;grid-template-columns:minmax(0,1fr);gap:1rem 2rem;margin-top:1.5rem;padding:1.25rem;border:1px solid var(--line);background:var(--surface)}
@media(min-width:48rem){.handle{grid-template-columns:1fr 1fr}}
.handle h2{font-size:1rem;font-weight:500;letter-spacing:0;margin-bottom:.5rem}
.inline-form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.5rem;align-items:end}
.inline-form .field{margin:0}
.inline-form .btn{min-height:3rem}
@media(max-width:30rem){.inline-form{grid-template-columns:minmax(0,1fr)}.inline-form .btn{width:100%}}
.ws-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:1.5rem 2rem;margin-top:1.5rem}
@media(min-width:64rem){.ws-grid{grid-template-columns:minmax(0,1.7fr) minmax(0,1fr);align-items:start}}
.panel{border:1px solid var(--line);background:var(--surface);padding:1.25rem 1.5rem;margin-bottom:1.25rem}
.panel>h2{font-size:1.125rem;font-weight:500;letter-spacing:0;line-height:1.3}
.panel>.hint{margin-top:.25rem}
.orig{margin:1rem 0 0;padding:.25rem 0 .25rem 1rem;border-left:3px solid var(--teal);white-space:pre-wrap;overflow-wrap:anywhere;font-size:1.0625rem;max-width:42rem}
.orig.none{color:var(--muted);white-space:normal}
.fields{margin-top:1rem;display:grid;grid-template-columns:minmax(0,1fr)}
.fields div{display:grid;gap:.1rem 1.5rem;padding:.6rem 0;border-bottom:1px solid var(--line)}
.fields div:last-child{border-bottom:0}
@media(min-width:40rem){.fields div{grid-template-columns:11rem minmax(0,1fr)}}
.fields dt{color:var(--muted);font-size:.9375rem}
.fields dd{overflow-wrap:anywhere}
.fields .none{color:var(--muted)}
.analysis{border-style:dashed}
.analysis h2 .chip{margin-left:.5rem;vertical-align:middle}
.analysis p{margin-top:.5rem;color:var(--muted);max-width:40rem;font-size:.9375rem}
.compose .field textarea{min-height:11rem}
.compose .actions{display:flex;flex-wrap:wrap;gap:.75rem 1rem;align-items:center;margin-top:1rem}
.compose .check{margin-top:.5rem}
.btn.secondary{background:transparent;color:var(--teal);border:1px solid var(--teal)}
.btn.secondary:hover{background:var(--ok-bg)}
.draft-info{margin-top:.5rem;color:var(--muted);font-size:.875rem}
.msgs{margin-top:1rem;display:grid;gap:1rem}
.msg{border:1px solid var(--line);padding:.9rem 1rem;background:var(--bg)}
.msg header{display:flex;flex-wrap:wrap;gap:.25rem .75rem;align-items:baseline;font-size:.875rem;color:var(--muted)}
.msg header strong{color:var(--ink);font-weight:500;font-size:.9375rem}
.msg .subject{margin-top:.5rem;font-weight:500;font-size:.9375rem}
.msg .text{margin-top:.5rem;white-space:pre-wrap;overflow-wrap:anywhere;font-size:.9375rem}
.notes-list,.activity-list{margin-top:1rem;border-top:1px solid var(--line)}
.notes-list li,.activity-list li{padding:.75rem 0;border-bottom:1px solid var(--line);font-size:.9375rem}
.notes-list .meta,.activity-list .meta{display:block;color:var(--muted);font-size:.8125rem}
.notes-list .text{white-space:pre-wrap;overflow-wrap:anywhere;margin-top:.15rem}
.note-form .field textarea{min-height:6rem}
.note-form .btn{margin-top:.25rem}
.muted{color:var(--muted)}
.mt{margin-top:.75rem}

/* activity (admin) */
.log{margin-top:1.5rem;border-top:1px solid var(--line)}
.log li{display:grid;gap:.15rem 1.5rem;padding:.7rem 0;border-bottom:1px solid var(--line);font-size:.9375rem}
@media(min-width:48rem){.log li{grid-template-columns:12rem minmax(0,1fr)}}
.log .when{color:var(--muted);font-size:.875rem}
`;
