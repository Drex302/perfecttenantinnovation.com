/*
 * Remembers a student referral code from a Student Sales Hub link (?pti_ref=PTI-XXXXXXXX) for 30 days on this
 * device, so it can be offered at web checkout. First valid code wins; nothing is sent anywhere until the visitor
 * signs in and chooses a plan. Only the code is stored (no visitor data).
 */
(function () {
  'use strict';
  var KEY = 'pti_ref', TTL_MS = 30 * 24 * 60 * 60 * 1000, CODE = /^PTI-[2-9A-HJKMNP-Z]{8}$/;
  function read() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (v && CODE.test(v.code) && Date.now() - v.at < TTL_MS) return v.code;
      localStorage.removeItem(KEY);
    } catch (e) { /* storage unavailable: nothing remembered */ }
    return null;
  }
  try {
    var incoming = (new URLSearchParams(location.search).get('pti_ref') || '').trim().toUpperCase();
    if (CODE.test(incoming) && !read()) localStorage.setItem(KEY, JSON.stringify({ code: incoming, at: Date.now() }));
  } catch (e) { /* ignore */ }
  window.PTI_REFERRAL = {
    get: read,
    clear: function () { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } },
  };
})();
