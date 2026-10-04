/*
 * Landlord web subscription checkout (Stripe), the cheaper-than-IAP path.
 *
 * Gated: does nothing unless window.PTI_WEB_CHECKOUT_ENABLED === true. While the
 * flag is off, the page keeps showing the launch waitlist and NO subscribe UI is
 * revealed — this mirrors the backend's off-by-default WEB_LANDLORD_CHECKOUT_ENABLED
 * flag, so the web and server sides are flipped on together after Stripe test-mode
 * verification.
 *
 * Auth must match the iOS app so a web purchase attaches to the same Firebase UID:
 * email/password, Google, and (once the web Services ID is configured) Apple.
 *
 * The callable createLandlordCheckoutSession lives in us-central1 and requires a
 * signed-in user + App Check. It returns { url } — a Stripe Checkout URL we redirect
 * the browser to. Success/cancel return to /pricing/success/ and /pricing/cancel/.
 */
(function () {
  'use strict';

  if (window.PTI_WEB_CHECKOUT_ENABLED !== true) return; // hard gate — waitlist stays

  var FIREBASE_CONFIG = {
    apiKey: 'AIzaSyBaOnRBpdRvU-6qvZJHiqfwTnWnxVt8nh8',
    authDomain: 'perfect-tenant-app-bfaf7.firebaseapp.com',
    projectId: 'perfect-tenant-app-bfaf7',
    storageBucket: 'perfect-tenant-app-bfaf7.firebasestorage.app',
    messagingSenderId: '637835334506',
    appId: '1:637835334506:web:676b3a1802f32229c1cb13',
  };
  var RECAPTCHA_ENTERPRISE_KEY = '6LfMfv4sAAAAAI1lKWCQFfxYjdoCQIhOmGQFCLnF';
  var FUNCTIONS_REGION = 'us-central1';
  var ORIGIN = 'https://www.perfecttenantinnovation.com';
  var SUCCESS_URL = ORIGIN + '/pricing/success/?session_id={CHECKOUT_SESSION_ID}';
  var CANCEL_URL = ORIGIN + '/pricing/cancel/';
  // Apple sign-in on the web needs a Services ID + domain config in Apple/Firebase.
  // Leave false until that is set up, or the Apple button will error.
  var APPLE_WEB_ENABLED = window.PTI_APPLE_WEB_SIGNIN === true;

  var auth, functions;
  try {
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    try {
      firebase.appCheck().activate(
        new firebase.appCheck.ReCaptchaEnterpriseProvider(RECAPTCHA_ENTERPRISE_KEY),
        true
      );
    } catch (e) { /* already activated by waitlist.js — fine */ }
    auth = firebase.auth();
    functions = firebase.app().functions(FUNCTIONS_REGION);
  } catch (e) {
    console.error('[checkout] Firebase init failed', e);
    return;
  }

  var state = { interval: 'month', pendingPlan: null };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function show(el) { if (el) el.hidden = false; }
  function hide(el) { if (el) el.hidden = true; }

  // ---- Billing interval toggle + price display ------------------------------
  function applyInterval(interval) {
    state.interval = interval === 'year' ? 'year' : 'month';
    document.querySelectorAll('[data-interval-btn]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.dataset.intervalBtn === state.interval));
    });
    document.querySelectorAll('[data-price]').forEach(function (el) {
      var monthly = el.getAttribute('data-price-monthly');
      var annual = el.getAttribute('data-price-annual');
      var suffix = el.querySelector('span');
      if (state.interval === 'year' && annual) {
        el.firstChild.nodeValue = annual;
        if (suffix) suffix.textContent = ' / year';
      } else if (monthly) {
        el.firstChild.nodeValue = monthly;
        if (suffix) suffix.textContent = ' / month';
      }
    });
  }

  // ---- Auth modal -----------------------------------------------------------
  function openModal(planId) {
    state.pendingPlan = planId;
    show($('#checkout-modal'));
    var status = $('#checkout-modal [data-auth-status]');
    if (status) status.textContent = '';
    var emailInput = $('#checkout-email');
    if (emailInput) emailInput.focus();
  }
  function closeModal() { hide($('#checkout-modal')); state.pendingPlan = null; }

  function authError(err) {
    var status = $('#checkout-modal [data-auth-status]');
    if (status) status.textContent = (err && err.message) ? err.message : 'Sign-in failed. Please try again.';
  }

  // ---- Checkout -------------------------------------------------------------
  var starting = false;
  async function startCheckout(planId) {
    if (starting) return;
    if (!auth.currentUser) { openModal(planId); return; }
    starting = true;
    var btn = document.querySelector('[data-subscribe="' + planId + '"]');
    var original = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Redirecting…'; }
    try {
      var callable = functions.httpsCallable('createLandlordCheckoutSession');
      var res = await callable({
        planId: planId,
        interval: state.interval,
        successUrl: SUCCESS_URL,
        cancelUrl: CANCEL_URL,
      });
      var url = res && res.data && res.data.url;
      if (!url) throw new Error('No checkout URL returned.');
      window.ptiTrack && window.ptiTrack('begin_checkout', { plan: planId, interval: state.interval });
      window.location.assign(url);
    } catch (err) {
      console.error('[checkout] createLandlordCheckoutSession failed', err);
      if (btn) { btn.disabled = false; btn.textContent = original; }
      starting = false;
      alert((err && err.message) ? err.message : 'Could not start checkout. Please try again or email hello@perfecttenantinnovation.com.');
    }
  }

  async function afterSignIn() {
    var plan = state.pendingPlan;
    closeModal();
    if (plan) startCheckout(plan);
  }

  // ---- Wire up once DOM is ready --------------------------------------------
  function init() {
    document.body.classList.add('checkout-enabled');
    applyInterval('month');

    document.querySelectorAll('[data-interval-btn]').forEach(function (btn) {
      btn.addEventListener('click', function () { applyInterval(btn.dataset.intervalBtn); });
    });

    document.querySelectorAll('[data-subscribe]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        startCheckout(btn.getAttribute('data-subscribe'));
      });
    });

    var modalClose = $('#checkout-modal [data-modal-close]');
    if (modalClose) modalClose.addEventListener('click', closeModal);

    var emailForm = $('#checkout-auth-form');
    if (emailForm) {
      emailForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        var email = $('#checkout-email').value.trim();
        var pass = $('#checkout-password').value;
        var mode = emailForm.getAttribute('data-mode') || 'signin';
        try {
          if (mode === 'signup') await auth.createUserWithEmailAndPassword(email, pass);
          else await auth.signInWithEmailAndPassword(email, pass);
          await afterSignIn();
        } catch (err) { authError(err); }
      });
    }

    var toggleMode = $('#checkout-toggle-mode');
    if (toggleMode) {
      toggleMode.addEventListener('click', function () {
        var form = $('#checkout-auth-form');
        var signup = form.getAttribute('data-mode') === 'signup';
        form.setAttribute('data-mode', signup ? 'signin' : 'signup');
        $('#checkout-auth-submit').textContent = signup ? 'Sign in' : 'Create account';
        toggleMode.textContent = signup ? 'New here? Create an account' : 'Already have an account? Sign in';
      });
    }

    var googleBtn = $('#checkout-google');
    if (googleBtn) {
      googleBtn.addEventListener('click', async function () {
        try {
          await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
          await afterSignIn();
        } catch (err) { authError(err); }
      });
    }

    var appleBtn = $('#checkout-apple');
    if (appleBtn) {
      if (!APPLE_WEB_ENABLED) { hide(appleBtn); }
      else {
        appleBtn.addEventListener('click', async function () {
          try {
            await auth.signInWithPopup(new firebase.auth.OAuthProvider('apple.com'));
            await afterSignIn();
          } catch (err) { authError(err); }
        });
      }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
