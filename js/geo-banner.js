/* =========================================================================
 * geo-banner.js
 * Geo-targeted Genesee Reserve Supply callout for the Western New York /
 * Finger Lakes region. Renders two surfaces when (and only when) the visitor
 * appears to be in territory served by Genesee Reserve:
 *
 *   1. A slim, dismissible top-of-page banner on every page.
 *   2. A richer in-context callout card on porch.html, injected into any
 *      <div data-geo-porch-callout></div> slot.
 *
 * Detection strategy (privacy-light, no PII stored):
 *   - One HTTPS lookup to ipapi.co/json/ on first visit per browser session.
 *   - Result is cached in sessionStorage so the API is hit at most once
 *     per session.
 *   - Visitor matches if: country_code === 'US' AND region_code === 'NY'
 *     AND postal starts with '14' (the Western NY / Finger Lakes / Rochester
 *     / Buffalo ZIP territory) OR the ipapi region/city contains a known
 *     Genesee-service city name.
 *
 * Manual overrides (handy for the owner to preview from anywhere):
 *   ?geo=genesee  -> force the callouts to show
 *   ?geo=off      -> force them to hide (and stop polling ipapi)
 *
 * Dismissal: clicking the × stores a 30-day suppression flag in
 * localStorage. The banner will not reappear until the flag expires.
 * The richer porch-page card is NOT suppressed by dismissal because it
 * sits in-context and is part of the page, not an overlay.
 * ========================================================================= */
(function () {
  'use strict';

  // ---- config -----------------------------------------------------------
  var STORAGE_KEY_RESULT   = 'apbp:geo:v1';             // sessionStorage
  var STORAGE_KEY_DISMISS  = 'apbp:geo:dismissed:v1';   // localStorage
  var DISMISS_DAYS         = 30;
  var GEO_ENDPOINT         = 'https://ipapi.co/json/';
  var GENESEE_CITIES = [
    'rochester', 'buffalo', 'syracuse', 'batavia', 'geneva',
    'canandaigua', 'auburn', 'ithaca', 'corning', 'elmira',
    'olean', 'jamestown', 'niagara', 'lockport', 'amherst',
    'cheektowaga', 'tonawanda', 'henrietta', 'pittsford', 'webster',
    'fairport', 'penfield', 'irondequoit', 'greece', 'brockport'
  ];

  // ---- helpers ----------------------------------------------------------
  function qs(name) {
    try {
      return new URL(window.location.href).searchParams.get(name);
    } catch (e) { return null; }
  }

  function getProjectBase() {
    // Mirrors _partials.js: derive the project root from this script's own
    // src so links work under proxies and sub-paths.
    try {
      var scripts = document.getElementsByTagName('script');
      for (var i = scripts.length - 1; i >= 0; i--) {
        var s = scripts[i].src || '';
        var m = s.match(/^(.*\/)js\/geo-banner\.js(?:\?.*)?$/);
        if (m) return m[1];
      }
    } catch (e) { /* fall through */ }
    var path = location.pathname.replace(/\/[^/]*$/, '/');
    var segments = path.split('/').filter(Boolean);
    if (segments.length === 0) return './';
    return '../'.repeat(segments.length);
  }

  function isDismissed() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY_DISMISS);
      if (!raw) return false;
      var until = parseInt(raw, 10);
      if (isNaN(until)) return false;
      if (Date.now() < until) return true;
      localStorage.removeItem(STORAGE_KEY_DISMISS);
      return false;
    } catch (e) { return false; }
  }

  function markDismissed() {
    try {
      var until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
      localStorage.setItem(STORAGE_KEY_DISMISS, String(until));
    } catch (e) { /* ignore */ }
  }

  function matchesGenesee(data) {
    if (!data || typeof data !== 'object') return false;
    var country = (data.country_code || data.country || '').toUpperCase();
    if (country !== 'US') return false;
    var region = (data.region_code || data.region || '').toUpperCase();
    var postal = String(data.postal || '').trim();
    var city   = String(data.city || '').toLowerCase();

    // Strongest signal: US + NY + 14xxx ZIP. The 140-149 ZIP prefixes blanket
    // Western NY, Rochester, Buffalo, and the Finger Lakes; exactly the
    // territory Genesee Reserve serves through its lumberyard network.
    if ((region === 'NY' || region === 'NEW YORK') && /^14\d{3}/.test(postal)) {
      return true;
    }

    // Backup signal: ipapi sometimes returns no postal; fall back to city.
    if ((region === 'NY' || region === 'NEW YORK') && city) {
      for (var i = 0; i < GENESEE_CITIES.length; i++) {
        if (city.indexOf(GENESEE_CITIES[i]) !== -1) return true;
      }
    }
    return false;
  }

  function readCachedResult() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY_RESULT);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function writeCachedResult(obj) {
    try { sessionStorage.setItem(STORAGE_KEY_RESULT, JSON.stringify(obj)); }
    catch (e) { /* ignore quota errors */ }
  }

  function fetchGeo() {
    return new Promise(function (resolve) {
      try {
        var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        var timer = setTimeout(function () { if (ctrl) ctrl.abort(); resolve(null); }, 3500);
        fetch(GEO_ENDPOINT, { signal: ctrl ? ctrl.signal : undefined, credentials: 'omit' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (data) { clearTimeout(timer); resolve(data); })
          .catch(function () { clearTimeout(timer); resolve(null); });
      } catch (e) { resolve(null); }
    });
  }

  // ---- markup -----------------------------------------------------------
  function buildBannerHTML(base) {
    return (
      '<div class="geo-banner" role="region" aria-label="Local availability notice">' +
        '<div class="geo-banner-inner">' +
          '<span class="geo-banner-pin" aria-hidden="true">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s-7-7.58-7-12a7 7 0 1 1 14 0c0 4.42-7 12-7 12Z"/><circle cx="12" cy="10" r="2.5"/></svg>' +
          '</span>' +
          '<p class="geo-banner-text">' +
            '<strong>Looking for porch in the Genesee region?</strong> ' +
            '<span class="geo-banner-sub">Genesee Reserve Supply stocks American Pro porch flooring in Rochester &amp; Buffalo.</span>' +
          '</p>' +
          '<a class="geo-banner-cta" href="' + base + 'pages/porch.html#where-to-buy">See where to buy<span aria-hidden="true" class="geo-banner-arrow">→</span></a>' +
          '<button type="button" class="geo-banner-close" aria-label="Dismiss local availability banner">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>'
    );
  }

  function buildPorchCalloutHTML(base) {
    return (
      '<aside class="geo-porch-callout" aria-label="Local stock for Western New York visitors">' +
        '<div class="container">' +
          '<div class="geo-porch-card">' +
            '<div class="geo-porch-card-body">' +
              '<span class="geo-porch-eyebrow">' +
                '<span class="geo-porch-dot" aria-hidden="true"></span>' +
                'Western New York &middot; Local stock' +
              '</span>' +
              '<h2 class="geo-porch-title">' +
                'You\u2019re in the <em>Genesee region.</em><br />' +
                'American Pro porch is stocked near you.' +
              '</h2>' +
              '<p class="geo-porch-blurb">' +
                'Across Western New York and the Finger Lakes, ' +
                '<strong>Genesee Reserve Supply</strong> is our authorized ' +
                'two-step wholesale distributor for porch flooring. They stock ' +
                'American Pro at both Rochester and Buffalo branches and ' +
                'route it through their independent lumberyard network ' +
                'across the region.' +
              '</p>' +
              '<div class="geo-porch-actions">' +
                '<a href="tel:18007241000" class="btn btn--primary btn--sm">Call Genesee toll free 1-800-724-1000</a>' +
                '<a href="#where-to-buy" class="btn btn--ghost btn--sm">See branches &amp; details</a>' +
              '</div>' +
              '<ul class="geo-porch-branches" aria-label="Local Genesee branches">' +
                '<li><strong>Rochester</strong><a href="tel:15852927040">585-292-7040</a></li>' +
                '<li><strong>Buffalo</strong><a href="tel:17168243116">716-824-3116</a></li>' +
              '</ul>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</aside>'
    );
  }

  // ---- render -----------------------------------------------------------
  function renderBanner(base) {
    if (isDismissed()) return;
    if (document.querySelector('.geo-banner')) return; // already rendered
    var wrap = document.createElement('div');
    wrap.innerHTML = buildBannerHTML(base);
    var el = wrap.firstChild;
    // Insert as the very first child of <body> so it sits above the header.
    document.body.insertBefore(el, document.body.firstChild);
    document.body.classList.add('has-geo-banner');
    var btn = el.querySelector('.geo-banner-close');
    if (btn) {
      btn.addEventListener('click', function () {
        el.classList.add('is-closing');
        markDismissed();
        setTimeout(function () {
          if (el && el.parentNode) el.parentNode.removeChild(el);
          document.body.classList.remove('has-geo-banner');
        }, 220);
      });
    }
    // Subtle reveal on next frame so the CSS transition fires.
    requestAnimationFrame(function () { el.classList.add('is-visible'); });
  }

  function renderPorchCallout(base) {
    var slots = document.querySelectorAll('[data-geo-porch-callout]');
    if (!slots.length) return;
    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];
      if (slot.getAttribute('data-geo-hydrated') === '1') continue;
      slot.innerHTML = buildPorchCalloutHTML(base);
      slot.setAttribute('data-geo-hydrated', '1');
    }
  }

  function render(base) {
    renderBanner(base);
    renderPorchCallout(base);
  }

  // ---- main -------------------------------------------------------------
  function init() {
    var base = getProjectBase();
    var override = (qs('geo') || '').toLowerCase();
    if (override === 'off' || override === 'hide' || override === 'none') {
      return; // hard suppress for testing / opt-out
    }
    if (override === 'genesee' || override === 'on' || override === 'force') {
      render(base);
      return;
    }

    // Use cached result if we already looked up this session.
    var cached = readCachedResult();
    if (cached && typeof cached.match === 'boolean') {
      if (cached.match) render(base);
      return;
    }

    fetchGeo().then(function (data) {
      var match = matchesGenesee(data);
      writeCachedResult({ match: match, ts: Date.now() });
      if (match) render(base);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
