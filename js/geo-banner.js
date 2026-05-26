/* =========================================================================
 * geo-banner.js
 * Geo-targeted authorized-dealer callouts.
 *
 * Two regions are configured:
 *
 *   1. "genesee"  -> Western New York / Finger Lakes  -> Genesee Reserve Supply
 *                    (porch flooring)
 *   2. "stonewood"-> Cape Cod / Southeastern Massachusetts -> Stonewood Products
 *                    (decking; specifically American Pro Legacy PVC decking)
 *
 * For a matched visitor, two surfaces render:
 *
 *   A. A slim, dismissible top-of-page banner on every page (per-region copy
 *      and accent color).
 *   B. A richer in-context callout card on relevant product pages, injected
 *      into <div data-geo-<region>-callout></div> slots if present. Pages
 *      without the slot simply show only the top banner.
 *
 * Detection strategy (privacy-light, no PII stored):
 *   - One HTTPS lookup to ipapi.co/json/ on first visit per browser session.
 *   - Result is cached in sessionStorage so the API is hit at most once.
 *   - For each configured region we test (in order) country/state/zip-prefix,
 *     falling back to a city-name allow-list. First match wins.
 *
 * Manual overrides (handy for previewing from any IP):
 *   ?geo=genesee    -> force the Genesee callouts to show
 *   ?geo=stonewood  -> force the Stonewood callouts to show
 *   ?geo=off        -> force everything to hide
 *
 * Dismissal: clicking the banner X stores a 30-day per-region suppression
 * flag in localStorage. The in-context cards are NOT suppressed by dismissal
 * because they sit in-context as part of the page.
 * ========================================================================= */
(function () {
  'use strict';

  // ---- config -----------------------------------------------------------
  var STORAGE_KEY_RESULT  = 'apbp:geo:v2';                  // sessionStorage (v2: now stores region id)
  var DISMISS_KEY_PREFIX  = 'apbp:geo:dismissed:';          // localStorage; ":<region>" appended
  var DISMISS_DAYS        = 30;
  var GEO_ENDPOINT        = 'https://ipapi.co/json/';

  /**
   * Region configs. Order matters: the first region a visitor matches wins.
   * Each region defines:
   *   id            : short slug used in storage keys, slot selectors, ?geo= override
   *   country       : required country_code (uppercase)
   *   state         : required region_code (uppercase) or array of acceptable codes
   *   zipPrefixes   : array of 3-char ZIP prefixes that count as in-territory
   *   cities        : lowercase city names that count as in-territory (fallback if no ZIP)
   *   banner        : { headline, subtext, ctaLabel, ctaHref, theme }
   *                   theme is 'gold' or 'sea' for accent color
   *   callout       : copy + branches + actions for the in-context card.
   *                   Rendered only if a matching slot exists on the page.
   */
  var REGIONS = [
    {
      id: 'genesee',
      country: 'US',
      state: ['NY', 'NEW YORK'],
      zipPrefixes: ['140', '141', '142', '143', '144', '145', '146', '147', '148', '149'],
      cities: [
        'rochester', 'buffalo', 'syracuse', 'batavia', 'geneva',
        'canandaigua', 'auburn', 'ithaca', 'corning', 'elmira',
        'olean', 'jamestown', 'niagara', 'lockport', 'amherst',
        'cheektowaga', 'tonawanda', 'henrietta', 'pittsford', 'webster',
        'fairport', 'penfield', 'irondequoit', 'greece', 'brockport'
      ],
      banner: {
        headline: 'Looking for porch in the Genesee region?',
        subtext: 'Genesee Reserve Supply stocks American Pro porch flooring in Rochester &amp; Buffalo.',
        ctaLabel: 'See where to buy',
        ctaHrefRel: 'pages/porch.html#where-to-buy',
        theme: 'gold'
      },
      callout: {
        slot: '[data-geo-porch-callout]',
        eyebrow: 'Western New York &middot; Local stock',
        title: 'You\u2019re in the <em>Genesee region.</em><br />American Pro porch is stocked near you.',
        blurb:
          'Across Western New York and the Finger Lakes, ' +
          '<strong>Genesee Reserve Supply</strong> is our authorized ' +
          'two-step wholesale distributor for porch flooring. They stock ' +
          'American Pro at both Rochester and Buffalo branches and ' +
          'route it through their independent lumberyard network ' +
          'across the region.',
        primary: { label: 'Call Genesee toll free 1-800-724-1000', href: 'tel:18007241000' },
        secondary: { label: 'See branches &amp; details', href: '#where-to-buy' },
        branches: [
          { label: 'Rochester', phoneText: '585-292-7040', phoneHref: 'tel:15852927040' },
          { label: 'Buffalo',   phoneText: '716-824-3116', phoneHref: 'tel:17168243116' }
        ],
        theme: 'gold'
      }
    },
    {
      id: 'stonewood',
      country: 'US',
      state: ['MA', 'MASSACHUSETTS'],
      // 025/026 = Cape Cod & Islands. 027 = Bristol County / South Coast
      // (New Bedford, Fall River, Taunton, Attleboro). 023 = Brockton +
      // southern Plymouth County (Plymouth, Bridgewater, Lakeville). These
      // are the prefixes where Stonewood realistically serves a yard.
      zipPrefixes: ['023', '025', '026', '027'],
      cities: [
        'harwich', 'mashpee', 'hyannis', 'barnstable', 'falmouth',
        'sandwich', 'bourne', 'yarmouth', 'dennis', 'chatham',
        'orleans', 'eastham', 'wellfleet', 'truro', 'provincetown',
        'brewster', 'plymouth', 'wareham', 'bridgewater', 'new bedford',
        'fall river', 'taunton', 'attleboro', 'dartmouth', 'westport',
        'fairhaven', 'mattapoisett', 'marion', 'rochester', 'middleboro',
        'lakeville', 'somerset', 'swansea', 'seekonk', 'rehoboth',
        'edgartown', 'oak bluffs', 'vineyard haven', 'nantucket', 'tisbury'
      ],
      banner: {
        headline: 'Looking for PVC decking on Cape Cod?',
        subtext: 'Stonewood Products stocks American Pro Legacy PVC decking in Harwich &amp; Mashpee.',
        ctaLabel: 'See where to buy',
        ctaHrefRel: 'pages/decking.html#where-to-buy',
        theme: 'sea'
      },
      callout: {
        slot: '[data-geo-decking-callout]',
        eyebrow: 'Cape Cod &amp; SE Massachusetts &middot; Local stock',
        title: 'You\u2019re on the <em>Cape.</em><br />American Pro Legacy decking is stocked near you.',
        blurb:
          'Across Cape Cod and Southeastern Massachusetts, ' +
          '<strong>Stonewood Products</strong> is our authorized dealer ' +
          'for American Pro Legacy PVC decking. They stock decking at the ' +
          'Harwich flagship and the Mashpee store, and ship nationally ' +
          'through their online team. Family-run, building-products people ' +
          'serving the Cape since 1997.',
        primary: { label: 'Call Stonewood Harwich 508-430-5020', href: 'tel:15084305020' },
        secondary: { label: 'Visit stonewoodproducts.com', href: 'https://www.stonewoodproducts.com', external: true },
        branches: [
          { label: 'Harwich Flagship', phoneText: '508-430-5020', phoneHref: 'tel:15084305020' },
          { label: 'Mashpee Store',    phoneText: '508-477-9950', phoneHref: 'tel:15084779950' }
        ],
        theme: 'sea'
      }
    }
  ];

  // ---- helpers ----------------------------------------------------------
  function qs(name) {
    try { return new URL(window.location.href).searchParams.get(name); }
    catch (e) { return null; }
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

  function isDismissed(regionId) {
    try {
      var raw = localStorage.getItem(DISMISS_KEY_PREFIX + regionId);
      if (!raw) return false;
      var until = parseInt(raw, 10);
      if (isNaN(until)) return false;
      if (Date.now() < until) return true;
      localStorage.removeItem(DISMISS_KEY_PREFIX + regionId);
      return false;
    } catch (e) { return false; }
  }

  function markDismissed(regionId) {
    try {
      var until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
      localStorage.setItem(DISMISS_KEY_PREFIX + regionId, String(until));
    } catch (e) { /* ignore */ }
  }

  function stateMatches(needle, hay) {
    if (!hay) return false;
    if (Array.isArray(needle)) {
      for (var i = 0; i < needle.length; i++) if (needle[i] === hay) return true;
      return false;
    }
    return needle === hay;
  }

  function matchRegion(data) {
    if (!data || typeof data !== 'object') return null;
    var country = (data.country_code || data.country || '').toUpperCase();
    var state   = (data.region_code  || data.region  || '').toUpperCase();
    var postal  = String(data.postal || '').trim();
    var city    = String(data.city   || '').toLowerCase();

    for (var r = 0; r < REGIONS.length; r++) {
      var R = REGIONS[r];
      if (country !== R.country) continue;
      if (!stateMatches(R.state, state)) continue;

      // Strongest signal: 3-char ZIP prefix
      var zip3 = postal.substring(0, 3);
      if (zip3 && R.zipPrefixes.indexOf(zip3) !== -1) return R.id;

      // Backup: city name
      if (city) {
        for (var c = 0; c < R.cities.length; c++) {
          if (city.indexOf(R.cities[c]) !== -1) return R.id;
        }
      }
    }
    return null;
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

  function findRegion(id) {
    for (var i = 0; i < REGIONS.length; i++) if (REGIONS[i].id === id) return REGIONS[i];
    return null;
  }

  // ---- markup -----------------------------------------------------------
  function buildBannerHTML(region, base) {
    var b = region.banner;
    var href = /^https?:|^tel:|^mailto:|^#/.test(b.ctaHrefRel) ? b.ctaHrefRel : (base + b.ctaHrefRel);
    return (
      '<div class="geo-banner geo-banner--' + b.theme + '" data-region="' + region.id + '" role="region" aria-label="Local availability notice">' +
        '<div class="geo-banner-inner">' +
          '<span class="geo-banner-pin" aria-hidden="true">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s-7-7.58-7-12a7 7 0 1 1 14 0c0 4.42-7 12-7 12Z"/><circle cx="12" cy="10" r="2.5"/></svg>' +
          '</span>' +
          '<p class="geo-banner-text">' +
            '<strong>' + b.headline + '</strong> ' +
            '<span class="geo-banner-sub">' + b.subtext + '</span>' +
          '</p>' +
          '<a class="geo-banner-cta" href="' + href + '">' + b.ctaLabel + '<span aria-hidden="true" class="geo-banner-arrow">\u2192</span></a>' +
          '<button type="button" class="geo-banner-close" aria-label="Dismiss local availability banner">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>'
    );
  }

  function actionHTML(a, cls) {
    if (!a) return '';
    var ext = a.external ? ' target="_blank" rel="noopener"' : '';
    return '<a href="' + a.href + '" class="' + cls + '"' + ext + '>' + a.label + '</a>';
  }

  function buildCalloutHTML(region) {
    var c = region.callout;
    var branchLis = c.branches.map(function (br) {
      return '<li><strong>' + br.label + '</strong><a href="' + br.phoneHref + '">' + br.phoneText + '</a></li>';
    }).join('');
    return (
      '<aside class="geo-porch-callout geo-porch-callout--' + c.theme + '" data-region="' + region.id + '" aria-label="Local stock notice">' +
        '<div class="container">' +
          '<div class="geo-porch-card">' +
            '<div class="geo-porch-card-body">' +
              '<span class="geo-porch-eyebrow">' +
                '<span class="geo-porch-dot" aria-hidden="true"></span>' + c.eyebrow +
              '</span>' +
              '<h2 class="geo-porch-title">' + c.title + '</h2>' +
              '<p class="geo-porch-blurb">' + c.blurb + '</p>' +
              '<div class="geo-porch-actions">' +
                actionHTML(c.primary,   'btn btn--primary btn--sm') +
                actionHTML(c.secondary, 'btn btn--ghost btn--sm') +
              '</div>' +
              '<ul class="geo-porch-branches" aria-label="Local branches">' + branchLis + '</ul>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</aside>'
    );
  }

  // ---- render -----------------------------------------------------------
  function renderBanner(region, base) {
    if (isDismissed(region.id)) return;
    if (document.querySelector('.geo-banner')) return; // already rendered
    var wrap = document.createElement('div');
    wrap.innerHTML = buildBannerHTML(region, base);
    var el = wrap.firstChild;
    document.body.insertBefore(el, document.body.firstChild);
    document.body.classList.add('has-geo-banner');
    var btn = el.querySelector('.geo-banner-close');
    if (btn) {
      btn.addEventListener('click', function () {
        el.classList.add('is-closing');
        markDismissed(region.id);
        setTimeout(function () {
          if (el && el.parentNode) el.parentNode.removeChild(el);
          document.body.classList.remove('has-geo-banner');
        }, 220);
      });
    }
    requestAnimationFrame(function () { el.classList.add('is-visible'); });
  }

  function renderCallout(region) {
    var slot = region.callout && region.callout.slot;
    if (!slot) return;
    var nodes = document.querySelectorAll(slot);
    if (!nodes.length) return;
    var html = buildCalloutHTML(region);
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.getAttribute('data-geo-hydrated') === '1') continue;
      n.innerHTML = html;
      n.setAttribute('data-geo-hydrated', '1');
    }
  }

  function render(region, base) {
    renderBanner(region, base);
    renderCallout(region);
  }

  // ---- main -------------------------------------------------------------
  function init() {
    var base = getProjectBase();
    var override = (qs('geo') || '').toLowerCase();

    if (override === 'off' || override === 'hide' || override === 'none') return;
    if (override) {
      var forced = findRegion(override);
      if (forced) { render(forced, base); return; }
      // legacy aliases
      if (override === 'on' || override === 'force') {
        render(REGIONS[0], base); return;
      }
    }

    var cached = readCachedResult();
    if (cached && typeof cached.regionId !== 'undefined') {
      if (cached.regionId) {
        var R = findRegion(cached.regionId);
        if (R) render(R, base);
      }
      return;
    }

    fetchGeo().then(function (data) {
      var regionId = matchRegion(data);
      writeCachedResult({ regionId: regionId, ts: Date.now() });
      if (regionId) {
        var R = findRegion(regionId);
        if (R) render(R, base);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
