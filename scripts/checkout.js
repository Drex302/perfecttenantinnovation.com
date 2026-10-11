/*
 * Landlord web subscription checkout (Stripe), the cheaper-than-IAP path.
 *
 * Gated: does nothing unless window.PTI_WEB_CHECKOUT_ENABLED === true. While the
 * flag is off, the page keeps showing the launch waitlist and NO subscribe UI is
 * revealed — mirrors the backend WEB_LANDLORD_CHECKOUT_ENABLED flag so both sides
 * flip on together after Stripe test-mode verification.
 *
 * Flow: Subscribe → (create account / sign in, matching the iOS app so the Firebase
 * UID links) → choose how to start:
 *   • Reserve for free — no card; records a plan_reservations doc. Pay at launch.
 *   • Lock in now — Stripe Checkout with a server-set $0 trial until launch.
 * The customer is never charged before app access begins (launch date).
 *
 * Auth matches the app: email/password, Google, and (once the web Services ID is
 * configured, PTI_APPLE_WEB_SIGNIN) Apple. The callable createLandlordCheckoutSession
 * lives in us-central1 and needs a signed-in user + App Check; it returns { url }.
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
  var APPLE_WEB_ENABLED = window.PTI_APPLE_WEB_SIGNIN === true;
  var LAUNCH_DATE = (window.PTI_LAUNCH_DATE || '').trim();
  var LAUNCH_SUFFIX = LAUNCH_DATE ? ' on ' + LAUNCH_DATE : '';
  // Reservation confirmation email (EmailJS, same account as the waitlist). Only
  // sent when a dedicated template is configured — otherwise we skip it rather
  // than send waitlist-worded copy. Create the template in EmailJS and set
  // window.PTI_RESERVE_EMAIL_TEMPLATE to turn it on.
  var EMAILJS_SERVICE = window.PTI_EMAILJS_SERVICE || 'service_8fnn74u';
  var RESERVE_EMAIL_TEMPLATE = (window.PTI_RESERVE_EMAIL_TEMPLATE || '').trim();

  // Display-only labels/prices (source of truth for amounts is the backend).
  var PLANS = {
    ascent: { name: 'Ascent', monthly: '$56.89', annual: '$682.68' },
    summit: { name: 'Summit', monthly: '$123.48', annual: '$1,481.76' },
  };

  // Local dry-run against the Firebase emulator (Phase 4). Off in production.
  var USE_EMULATOR = window.PTI_USE_EMULATOR === true;

  var auth, functions, db;
  try {
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    if (!USE_EMULATOR) {
      try {
        firebase.appCheck().activate(
          new firebase.appCheck.ReCaptchaEnterpriseProvider(RECAPTCHA_ENTERPRISE_KEY),
          true
        );
      } catch (e) { /* already activated by waitlist.js — fine */ }
    }
    auth = firebase.auth();
    functions = firebase.app().functions(FUNCTIONS_REGION);
    db = firebase.firestore();
    if (USE_EMULATOR) {
      // Point every SDK at the local emulator (ports from firebase.json).
      auth.useEmulator('http://localhost:9099', { disableWarnings: true });
      functions.useEmulator('localhost', 5001);
      db.useEmulator('localhost', 8080);
      console.info('[checkout] using Firebase emulator (dry-run mode)');
    }
  } catch (e) {
    console.error('[checkout] Firebase init failed', e);
    return;
  }

  var state = { interval: 'month', plan: null };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function show(el) { if (el) el.hidden = false; }
  function hide(el) { if (el) el.hidden = true; }
  function priceStr(plan) {
    var p = PLANS[plan]; if (!p) return '';
    return state.interval === 'year' ? p.annual + ' / year' : p.monthly + ' / month';
  }

  // ---- Billing interval toggle + price display ------------------------------
  function applyInterval(interval) {
    state.interval = interval === 'year' ? 'year' : 'month';
    all('[data-interval-btn]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.dataset.intervalBtn === state.interval));
    });
    all('[data-price]').forEach(function (el) {
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

  // ---- Modal view switching -------------------------------------------------
  var MODAL = null;
  function setView(name) {
    all('[data-view]', MODAL).forEach(function (v) { v.hidden = v.getAttribute('data-view') !== name; });
    var title = $('#checkout-modal-title');
    if (title) {
      if (name === 'auth') title.textContent = ($('#checkout-auth-form').getAttribute('data-mode') === 'signup')
        ? 'Create your Perfect Tenant account' : 'Sign in to your account';
      else if (name === 'choice') title.textContent = 'Start your ' + (PLANS[state.plan] ? PLANS[state.plan].name : '') + ' plan';
      else if (name === 'done') title.textContent = "You're all set";
    }
  }
  function statusMsg(text) { var s = $('[data-auth-status]', MODAL); if (s) s.textContent = text || ''; }

  function openModal(plan, view) {
    state.plan = plan;
    show(MODAL);
    statusMsg('');
    setView(view);
    if (view === 'auth') { var e = $('#checkout-email'); if (e) e.focus(); }
  }
  function closeModal() { hide(MODAL); }

  function openForPlan(plan) {
    // Already signed in → skip straight to the reserve/lock-in choice.
    if (auth.currentUser) openModal(plan, 'choice');
    else openModal(plan, 'auth');
  }

  // ---- Reserve (no card) ----------------------------------------------------
  async function reservePlan(plan) {
    var user = auth.currentUser;
    if (!user) { openModal(plan, 'auth'); return; }
    statusMsg('');
    try {
      await db.collection('plan_reservations').doc(user.uid).set({
        planId: plan,
        interval: state.interval,
        email: user.email || '',
        source: 'web_pricing',
        status: 'reserved',
        reservedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      window.ptiTrack && window.ptiTrack('plan_reserved', { plan: plan, interval: state.interval });
      var msg = $('[data-done-msg]', MODAL);
      if (msg) msg.textContent = 'Your ' + (PLANS[plan] ? PLANS[plan].name : '') + ' plan is reserved — no charge today. '
        + "We'll email you to complete payment when app access begins" + LAUNCH_SUFFIX + '. '
        + 'Download the app and sign in with the same account to pick up right where you left off.';
      setView('done');
      // Best-effort confirmation email — never blocks or fails the reservation.
      if (RESERVE_EMAIL_TEMPLATE && window.emailjs) {
        try {
          window.emailjs.send(EMAILJS_SERVICE, RESERVE_EMAIL_TEMPLATE, {
            to_email: user.email || '',
            plan: PLANS[plan] ? PLANS[plan].name : plan,
            interval: state.interval === 'year' ? 'annual' : 'monthly',
            price: priceStr(plan),
            launch_date: LAUNCH_DATE || 'launch',
          });
        } catch (e) { /* on-screen confirmation already shown */ }
      }
    } catch (err) {
      console.error('[checkout] reservation failed', err);
      statusMsg((err && err.message) || 'Could not save your reservation. Please try again or email hello@perfecttenantinnovation.com.');
    }
  }

  // ---- Lock in (Stripe checkout with server-set trial) ----------------------
  var starting = false;
  async function startCheckout(plan) {
    if (starting) return;
    if (!auth.currentUser) { openModal(plan, 'auth'); return; }
    starting = true;
    statusMsg('Redirecting to secure checkout…');
    try {
      var callable = functions.httpsCallable('createLandlordCheckoutSession');
      var res = await callable({ planId: plan, interval: state.interval, successUrl: SUCCESS_URL, cancelUrl: CANCEL_URL });
      var url = res && res.data && res.data.url;
      if (!url) throw new Error('No checkout URL returned.');
      window.ptiTrack && window.ptiTrack('begin_checkout', { plan: plan, interval: state.interval });
      window.location.assign(url);
    } catch (err) {
      console.error('[checkout] createLandlordCheckoutSession failed', err);
      starting = false;
      statusMsg((err && err.message) || 'Could not start checkout. Please try again or email hello@perfecttenantinnovation.com.');
    }
  }

  function toChoice() {
    var el;
    el = $('[data-choice-plan]', MODAL); if (el) el.textContent = PLANS[state.plan] ? PLANS[state.plan].name : '';
    el = $('[data-choice-price]', MODAL); if (el) el.textContent = priceStr(state.plan);
    el = $('[data-referral-code]', MODAL);
    if (el && !el.value && window.PTI_REFERRAL) el.value = window.PTI_REFERRAL.get() || '';
    statusMsg(''); // clear any earlier sign-in error once signed in
    setView('choice');
  }

  async function afterSignIn() { toChoice(); }

  // Same backend call as the app's signup "Referral Code" field, with the same rules (accepted only before the
  // customer's first paid subscription; the Sales Hub verifies the student). Never blocks checkout.
  async function sendReferralCode() {
    var el = $('[data-referral-code]', MODAL), user = auth.currentUser;
    var code = el ? el.value.trim().toUpperCase() : '';
    if (!code || !user) return;
    var sentKey = 'pti_ref_sent:' + user.uid;
    try { if (localStorage.getItem(sentKey) === code) return; } catch (e) { /* ignore */ }
    try {
      await functions.httpsCallable('attributeReferralSignup')({ promoCode: code });
      try { localStorage.setItem(sentKey, code); } catch (e) { /* ignore */ }
      if (window.PTI_REFERRAL) window.PTI_REFERRAL.clear();
    } catch (err) {
      console.warn('[checkout] referral code not applied', err && err.code);
    }
  }

  // ---- Wire up --------------------------------------------------------------
  function init() {
    MODAL = $('#checkout-modal');
    document.body.classList.add('checkout-enabled');
    applyInterval('month');
    all('[data-launch-suffix]').forEach(function (el) { el.textContent = LAUNCH_SUFFIX; });

    all('[data-interval-btn]').forEach(function (btn) {
      btn.addEventListener('click', function () { applyInterval(btn.dataset.intervalBtn); });
    });
    all('[data-subscribe]').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.preventDefault(); openForPlan(btn.getAttribute('data-subscribe')); });
    });
    all('[data-modal-close]', MODAL).forEach(function (btn) { btn.addEventListener('click', closeModal); });

    var emailForm = $('#checkout-auth-form');
    if (emailForm) emailForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      var email = $('#checkout-email').value.trim();
      var pass = $('#checkout-password').value;
      var mode = emailForm.getAttribute('data-mode') || 'signup';
      try {
        if (mode === 'signup') await auth.createUserWithEmailAndPassword(email, pass);
        else await auth.signInWithEmailAndPassword(email, pass);
        await afterSignIn();
      } catch (err) { statusMsg((err && err.message) || 'Sign-in failed. Please try again.'); }
    });

    var toggleMode = $('#checkout-toggle-mode');
    if (toggleMode) toggleMode.addEventListener('click', function () {
      var form = $('#checkout-auth-form');
      var wasSignup = form.getAttribute('data-mode') === 'signup';
      form.setAttribute('data-mode', wasSignup ? 'signin' : 'signup');
      $('#checkout-auth-submit').textContent = wasSignup ? 'Sign in' : 'Create account';
      toggleMode.textContent = wasSignup ? 'New here? Create an account' : 'Already have an account? Sign in';
      $('#checkout-modal-title').textContent = wasSignup ? 'Sign in to your account' : 'Create your Perfect Tenant account';
      var pw = $('#checkout-password');
      if (pw) pw.setAttribute('autocomplete', wasSignup ? 'current-password' : 'new-password');
    });

    var googleBtn = $('#checkout-google');
    if (googleBtn) googleBtn.addEventListener('click', async function () {
      try { await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); await afterSignIn(); }
      catch (err) { statusMsg((err && err.message) || 'Google sign-in failed.'); }
    });

    var appleBtn = $('#checkout-apple');
    if (appleBtn) {
      if (!APPLE_WEB_ENABLED) hide(appleBtn);
      else appleBtn.addEventListener('click', async function () {
        try { await auth.signInWithPopup(new firebase.auth.OAuthProvider('apple.com')); await afterSignIn(); }
        catch (err) { statusMsg((err && err.message) || 'Apple sign-in failed.'); }
      });
    }

    all('[data-choice]', MODAL).forEach(function (btn) {
      btn.addEventListener('click', async function () {
        await sendReferralCode();
        if (btn.getAttribute('data-choice') === 'reserve') reservePlan(state.plan);
        else startCheckout(state.plan);
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
