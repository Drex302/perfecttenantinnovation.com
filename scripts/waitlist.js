/* A saved lead is the conversion. Email delivery is a separate best-effort step. */
(function () {
  'use strict';
  var db;
  try {
    if (!firebase.apps.length) { firebase.initializeApp({apiKey:'AIzaSyBaOnRBpdRvU-6qvZJHiqfwTnWnxVt8nh8',authDomain:'perfect-tenant-app-bfaf7.firebaseapp.com',projectId:'perfect-tenant-app-bfaf7',storageBucket:'perfect-tenant-app-bfaf7.firebasestorage.app',messagingSenderId:'637835334506',appId:'1:637835334506:web:676b3a1802f32229c1cb13'});
    firebase.appCheck().activate(new firebase.appCheck.ReCaptchaEnterpriseProvider('6LfMfv4sAAAAAI1lKWCQFfxYjdoCQIhOmGQFCLnF'),true); }
    db = firebase.firestore();
  } catch (error) { /* The form stays usable and explains failure on submission. */ }
  document.querySelectorAll('form[data-waitlist]').forEach(function (form) {
    var busy = false;
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (busy || !form.reportValidity()) return;
      var button = form.querySelector('button[type="submit"]');
      var status = form.querySelector('[data-form-status]');
      var original = button.textContent;
      status.textContent = ''; busy = true; button.disabled = true; button.textContent = 'Saving…';
      var values = new FormData(form);
      var plan = values.get('plan') || '';
      if (!['', 'ascent', 'summit', 'pinnacle'].includes(plan)) plan = '';
      var payload = {source:form.dataset.source || 'landlord_form',role:'landlord',firstName:'',lastName:'',email:String(values.get('email')).trim(),units:values.get('units'),pagePath:location.pathname,selectedPlan:plan};
      try {
        if (!db) throw new Error('Signup service unavailable');
        payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await db.collection('waitlist_submissions').add(payload);
      } catch (error) {
        status.textContent = 'Your signup was not saved. Please try again, or email hello@perfecttenantinnovation.com.';
        button.disabled = false; button.textContent = original; busy = false; status.focus(); return;
      }
      button.textContent = 'You’re on the list';
      status.textContent = 'Your signup is saved. We’ll email you about launch and onboarding. No payment has been taken.';
      status.focus();
      form.querySelectorAll('input,select').forEach(function (field) { field.disabled = true; });
      window.ptiTrack && window.ptiTrack('signed_up', {form_id:form.id,plan:plan});
      try {
        if (window.emailjs) await window.emailjs.send('service_8fnn74u','template_0d7m7le',{to_email:payload.email,to_name:'Landlord',first_name:'there'});
      } catch (error) { /* Saving succeeded; do not invite a duplicate submission. */ }
    });
    form.querySelector('button[type="submit"]').disabled = false;
  });
})();
