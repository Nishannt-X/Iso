/* global document, window, IntersectionObserver */
// Progressive enhancement for the public site. Every page and form works without this file:
// it only adds reveal-on-scroll, the enquiry step highlight and a "sending" state on submit.
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
    initEnquiry();
  });
})();
