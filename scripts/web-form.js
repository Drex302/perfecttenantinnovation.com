/*
 * Website forms → PTI's validated form endpoint (submitWebForm).
 *
 * Pages build the same payload as before ({ source, role, email, … }); this sends it to the
 * server, which checks every field, throttles bursts and verifies App Check, instead of
 * writing to the database straight from the browser.
 */
(function () {
  'use strict';
  var ENDPOINT = 'https://us-central1-perfect-tenant-app-bfaf7.cloudfunctions.net/submitWebForm';
  var LANDLORD_FORMS = { landlord_form: 1, audit_gate_form: 1 };

  async function appCheckToken() {
    try {
      if (window.firebase && firebase.appCheck) {
        var t = await firebase.appCheck().getToken(false);
        return (t && t.token) || '';
      }
    } catch (e) { /* the server records an unverified request; it may still accept it */ }
    return '';
  }

  window.ptiSubmitWebForm = async function (payload) {
    var form = payload && payload.source;
    var fields = {};
    Object.keys(payload || {}).forEach(function (k) {
      if (k === 'source' || k === 'createdAt') return;
      if (k === 'role' && LANDLORD_FORMS[form]) return;   // landlord forms are always role "landlord"
      var v = payload[k];
      if (v === null || v === undefined || v === '') return;
      fields[k] = v;
    });
    var headers = { 'Content-Type': 'application/json' };
    var token = await appCheckToken();
    if (token) headers['X-Firebase-AppCheck'] = token;
    var res = await fetch(ENDPOINT, { method: 'POST', headers: headers, body: JSON.stringify({ form: form, fields: fields, website: '' }) });
    if (!res.ok) {
      var msg = 'Your signup was not saved. Please try again.';
      try { var j = await res.json(); if (j && j.error) msg = j.error; } catch (e) { /* keep default */ }
      throw new Error(msg);
    }
    return true;
  };
})();
