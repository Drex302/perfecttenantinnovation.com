/* Deliberately exclude email, field values, query strings and full URLs from events. */
(function () {
  'use strict';
  window.ptiTrack = function (name, fields) {
    try { if (typeof window.gtag === 'function') window.gtag('event', name, Object.assign({page_path:location.pathname}, fields)); } catch (error) {}
  };
  function observeForms() {
    document.querySelectorAll('form').forEach(function (form) {
      var id = form.id || 'waitlist';
      if ('IntersectionObserver' in window) {
        var observer = new IntersectionObserver(function (entries) {
          if (entries.some(function (entry) {return entry.isIntersecting;})) {
            window.ptiTrack('form_seen', {form_id:id}); observer.disconnect();
          }
        }, {threshold:0.2});
        observer.observe(form);
      }
      var started = false;
      function start() { if (!started) { started = true; window.ptiTrack('form_started', {form_id:id}); } }
      form.addEventListener('input',start); form.addEventListener('change',start);
    });
    document.addEventListener('click', function (event) {
      var link = event.target.closest('a');
      if (!link) return;
      var url = new URL(link.href, location.href);
      if (url.origin !== location.origin) return;
      if (/landlord-hours-audit|pricing|tenants|merchants|swarm-boss|service-providers/.test(url.pathname) || /waitlist/.test(url.hash)) {
        window.ptiTrack('funnel_cta_clicked',{destination_path:url.pathname,plan:link.dataset.interestPlan || ''});
      }
    });
  }
  // Header CTA matches the page audience. Tenant pages (data-audience="tenant" on
  // <body>) show "Join free" → the inline signup on the page if present, else the
  // tenant waitlist. Landlord/home pages keep their existing "Free Audit" CTA.
  function setupAudienceCta() {
    if (!document.body || document.body.getAttribute('data-audience') !== 'tenant') return;
    var cta = document.querySelector('#nav .nav-cta');
    if (!cta) return;
    cta.textContent = 'Join free';
    cta.setAttribute('href', document.querySelector('[data-tenant-signup]') ? '#tenant-signup' : '/tenants/#tenant-waitlist');
  }
  function start() { observeForms(); setupAudienceCta(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start); else start();
})();
