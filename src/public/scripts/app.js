/* global document, window, IntersectionObserver */
// Progressive enhancement for the public site. Every page and form works without this file:
// it only adds reveal-on-scroll, the package stop inspector, the enquiry step highlight and a
// "sending" state on submit.
(function () {
  'use strict';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Reveal sections as they scroll into view. Content is visible by default; only with JS and
  // without reduced motion do [data-reveal] blocks start lowered, so nothing is hidden if this fails.
  function initReveal() {
    const items = document.querySelectorAll('[data-reveal]');
    if (reduce || !('IntersectionObserver' in window) || items.length === 0) return;
    document.documentElement.classList.add('reveal-on');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    items.forEach((el) => io.observe(el));
  }

  // Package page: show one stop panel at a time. Without this, every panel is visible and the
  // route strip links are plain in-page anchors. Panels are server-rendered; nothing is written here.
  function initStops() {
    const root = document.querySelector('[data-stops]');
    if (!root) return;
    const links = root.querySelectorAll('.route-node a');
    const panels = root.querySelectorAll('.stop-panel');
    if (panels.length < 2 || links.length !== panels.length) return;
    root.classList.add('is-inspector');
    function show(i, focus) {
      panels.forEach((p, j) => { p.hidden = j !== i; });
      links.forEach((a, j) => {
        if (j === i) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
      if (focus) panels[i].focus({ preventScroll: true });
    }
    links.forEach((a, i) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        show(i, true);
        window.history.pushState(null, '', a.hash);
      });
    });
    const indexOfHash = () => Array.prototype.findIndex.call(panels, (p) => `#${p.id}` === window.location.hash);
    // Deep links, the back button and #stop-N links elsewhere on the page also select a stop.
    const fromHash = () => {
      const i = indexOfHash();
      if (i >= 0) show(i, true);
    };
    window.addEventListener('hashchange', fromHash);
    window.addEventListener('popstate', fromHash);
    const start = indexOfHash();
    show(start >= 0 ? start : 0, false);
    // Hiding the other panels moves the deep-linked one, so bring it back into view.
    if (start >= 0) panels[start].scrollIntoView({ block: 'start' });
  }

  // Enquiry form: mark the step the visitor is working in, and show a sending state on submit.
  function initEnquiry() {
    const form = document.querySelector('form.stepped');
    if (!form) return;
    const steps = document.querySelectorAll('.steps a[href^="#"]');
    form.addEventListener('focusin', (e) => {
      const set = e.target.closest('fieldset[id]');
      if (!set) return;
      steps.forEach((a) => {
        if (a.getAttribute('href') === `#${set.id}`) a.setAttribute('aria-current', 'step');
        else a.removeAttribute('aria-current');
      });
    });
    const button = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', () => {
      if (!button) return;
      button.classList.add('is-sending');
      button.setAttribute('aria-disabled', 'true');
      button.textContent = 'Sending…';
    });
    // A page restored from the back/forward cache must not keep the sending state.
    window.addEventListener('pageshow', () => {
      if (!button || !button.classList.contains('is-sending')) return;
      button.classList.remove('is-sending');
      button.removeAttribute('aria-disabled');
      button.textContent = 'Send enquiry';
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initReveal();
    initStops();
    initEnquiry();
  });
})();
