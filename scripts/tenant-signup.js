/*
 * Reusable inline tenant signup box for tenant blog posts.
 *
 * Renders into any <div data-tenant-signup> placeholder, reusing the site's
 * existing form styles (.waitlist-section / .waitlist-form / .btn-primary).
 * Submits through the SAME handler as /tenants/ (window.ptiSubmitWebForm →
 * the submitWebForm endpoint, form type "ecosystem_form", role "tenant") so
 * leads keep saving to Firebase exactly as before. Fires the same GA4 events
 * (form_started, signed_up, waitlist_tenant_sub) via ptiTrack.
 *
 * First name + Last name + Email (last name required by the backend).
 */
(function () {
  'use strict';

  // Match the existing tenant form: init Firebase + App Check so submissions are
  // verified. Best-effort — the form still works if this fails (server accepts
  // unverified requests), and web-form.js handles a missing token.
  try {
    if (window.firebase && firebase.apps && !firebase.apps.length) {
      firebase.initializeApp({
        apiKey: 'AIzaSyBaOnRBpdRvU-6qvZJHiqfwTnWnxVt8nh8',
        authDomain: 'perfect-tenant-app-bfaf7.firebaseapp.com',
        projectId: 'perfect-tenant-app-bfaf7',
        storageBucket: 'perfect-tenant-app-bfaf7.firebasestorage.app',
        messagingSenderId: '637835334506',
        appId: '1:637835334506:web:676b3a1802f32229c1cb13'
      });
    }
    if (window.firebase && firebase.appCheck) {
      firebase.appCheck().activate(
        new firebase.appCheck.ReCaptchaEnterpriseProvider('6LfMfv4sAAAAAI1lKWCQFfxYjdoCQIhOmGQFCLnF'),
        true
      );
    }
  } catch (e) { /* form still submits without App Check */ }

  var MARKUP =
    '<section class="waitlist-section" style="margin-top:28px">' +
      '<h2 class="section-title" style="font-size:clamp(1.25rem,3vw,1.7rem);margin-bottom:6px">Get early access to Perfect Tenant</h2>' +
      '<p class="section-body" style="margin:0;max-width:640px">Build your rental history and earn rewards for responsible renting. Free for tenants.</p>' +
      '<form class="waitlist-form" novalidate>' +
        '<div class="form-row">' +
          '<div class="form-field"><label for="FID-fn">First Name</label><input type="text" id="FID-fn" name="firstName" autocomplete="given-name" placeholder="First Name" required></div>' +
          '<div class="form-field"><label for="FID-ln">Last Name</label><input type="text" id="FID-ln" name="lastName" autocomplete="family-name" placeholder="Last Name" required></div>' +
        '</div>' +
        '<div class="form-field"><label for="FID-em">Email Address</label><input type="email" id="FID-em" name="email" autocomplete="email" placeholder="Email Address" required></div>' +
        '<div data-err role="alert" aria-live="assertive" style="display:none;color:#F87171;font-size:.82rem;padding:10px 14px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:8px"></div>' +
        '<button type="submit" class="btn-primary btn-full">Join the tenant waitlist</button>' +
        '<p class="form-disclaimer">Free to join · No credit card · Not emergency assistance</p>' +
      '</form>' +
      '<div class="form-success" role="alert" aria-live="assertive" style="display:none">' +
        "<strong>You're on the list.</strong> We'll email your onboarding details soon. Not emergency assistance — if you need help now, call or text 211." +
      '</div>' +
    '</section>';

  function wire(container, idx) {
    container.id = container.id || 'tenant-signup';
    container.innerHTML = MARKUP.replace(/FID/g, 'its' + idx);
    var form = container.querySelector('form');
    var success = container.querySelector('.form-success');
    var errEl = container.querySelector('[data-err]');
    var formId = 'inlineTenantForm';
    var started = false;

    function fire(name, extra) { if (window.ptiTrack) window.ptiTrack(name, Object.assign({ form_id: formId }, extra || {})); }
    form.addEventListener('input', function () { if (!started) { started = true; fire('form_started'); } });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
      if (!form.reportValidity()) return;
      var fd = new FormData(form);
      var firstName = String(fd.get('firstName') || '').trim();
      var lastName = String(fd.get('lastName') || '').trim();
      var email = String(fd.get('email') || '').trim();
      if (!firstName || !lastName) { showErr('Please enter your first and last name.'); return; }
      if (!email) { showErr('Please enter your email address.'); return; }
      if (typeof window.ptiSubmitWebForm !== 'function') { showErr('Signup is temporarily unavailable. Please try again or email hello@perfecttenantinnovation.com.'); return; }

      var btn = form.querySelector('button[type=submit]');
      if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }

      window.ptiSubmitWebForm({ source: 'ecosystem_form', role: 'tenant', firstName: firstName, lastName: lastName, email: email })
        .then(function () {
          form.style.display = 'none';
          if (success) success.style.display = 'block';
          fire('signed_up');
          fire('waitlist_tenant_sub', { event_category: 'conversion', event_label: 'tenant_waitlist' });
        })
        .catch(function (err) {
          showErr((err && err.message) || 'Your signup was not saved. Please try again.');
          if (btn) { btn.disabled = false; btn.textContent = 'Join the tenant waitlist'; }
        });

      function noop() {}
    });

    function showErr(msg) { if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; errEl.focus && errEl.focus(); } }
  }

  function init() {
    var nodes = document.querySelectorAll('[data-tenant-signup]');
    for (var i = 0; i < nodes.length; i++) { if (!nodes[i].dataset.wired) { nodes[i].dataset.wired = '1'; wire(nodes[i], i); } }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
