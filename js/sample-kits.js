/* =========================================================================
 * sample-kits.js
 * Curated sample kits for American Pro decking.
 *
 * Two jobs:
 *   1. Render kit cards into any <div data-sample-kits></div> container
 *      (variant "full" on the homepage, "compact" on product pages).
 *   2. On a product page opened with ?kit=<id>, pre-check the matching
 *      product lines and colors in the existing Formspree sample form,
 *      tag the submission with hidden kit fields, and show a small notice
 *      so the visitor knows what was loaded and that they can add or
 *      remove anything. No new form and no new backend.
 *
 * Kits are a starting point, not a cap. The form still lets a visitor
 * request as many colors and pieces as they want.
 *
 * Load after js/site.js (both deferred) so the color-picker sync logic in
 * site.js has already initialised before kits touch the form.
 * ========================================================================= */
(function () {
  'use strict';

  // Resolve asset and page paths relative to the site root whether we are
  // on / or /pages/.
  var inPages = /\/pages\//.test(location.pathname);
  var ROOT = inPages ? '../' : './';

  var SWATCH = {
    truegrain: {
      'New England Birch': 'images/truegrain_swatches/new_england_birch.jpg',
      'Coastal Driftwood': 'images/truegrain_swatches/coastal_driftwood.jpg',
      'Aged Oak': 'images/truegrain_swatches/aged_oak.jpg',
      'Embered Taupe': 'images/truegrain_swatches/embered_taupe.jpg',
      'Royal IPE': 'images/truegrain_swatches/royal_ipe.jpg',
      'Tropical Walnut': 'images/truegrain_swatches/tropical_walnut.jpg'
    },
    legacy: {
      'Driftwood': 'images/deck_swatches/driftwood.jpg',
      'Khaki': 'images/deck_swatches/khaki.jpg',
      'Hazelnut': 'images/deck_swatches/hazelnut.jpg',
      'Beachwood': 'images/deck_swatches/beachwood.jpg',
      'Chestnut': 'images/deck_swatches/chestnut.jpg',
      'Redwood': 'images/deck_swatches/redwood.jpg'
    },
    invisiclip: {
      'InvisiClip clip and rail section': 'images/invisiclip/clip_macro_hero-600.jpg'
    }
  };

  var LINE_LABEL = {
    truegrain: 'TrueGrain Deck',
    legacy: 'Legacy PVC',
    invisiclip: 'InvisiClip'
  };

  /**
   * Kit definitions.
   *   id        : slug used in ?kit= and analytics
   *   name      : display name
   *   tagline   : one line on the card
   *   audience  : who it is for
   *   page      : which product page hosts the form we pre-fill
   *   lines     : product-line checkboxes to tick (data-line values)
   *   colors    : { line: [color values exactly as in the form] }
   *   extras    : hardware pieces that ship with the kit (shown, not form fields)
   *   note      : hidden kit_contents detail for fulfillment
   */
  var KITS = [
    {
      id: 'coastal-greys',
      name: 'Coastal Greys',
      tagline: 'Silver, driftwood, and soft grey tones that sit right with white and grey exteriors.',
      audience: 'Shore homes, white and grey siding',
      page: 'truegrain-deck',
      lines: ['truegrain', 'legacy'],
      colors: {
        truegrain: ['New England Birch', 'Coastal Driftwood'],
        legacy: ['Driftwood']
      },
      extras: [],
      note: 'Coastal Greys kit: TrueGrain New England Birch, TrueGrain Coastal Driftwood, Legacy PVC Driftwood.'
    },
    {
      id: 'warm-hardwoods',
      name: 'Warm Hardwoods',
      tagline: 'The three TrueGrain tones closest to oiled ipe, mahogany, and golden oak.',
      audience: 'Replacing ipe, cedar, or mahogany',
      page: 'truegrain-deck',
      lines: ['truegrain'],
      colors: {
        truegrain: ['Aged Oak', 'Royal IPE', 'Tropical Walnut']
      },
      extras: [],
      note: 'Warm Hardwoods kit: TrueGrain Aged Oak, Royal IPE, Tropical Walnut.'
    },
    {
      id: 'modern-neutrals',
      name: 'Modern Neutrals',
      tagline: 'Taupe, tan, and sand tones for transitional homes and earth-tone siding.',
      audience: 'Tan and taupe exteriors',
      page: 'legacy-pvc-decking',
      lines: ['legacy', 'truegrain'],
      colors: {
        legacy: ['Khaki', 'Beachwood', 'Hazelnut'],
        truegrain: ['Embered Taupe']
      },
      extras: [],
      note: 'Modern Neutrals kit: Legacy PVC Khaki, Beachwood, Hazelnut; TrueGrain Embered Taupe.'
    },
    {
      id: 'rich-browns',
      name: 'Rich Browns',
      tagline: 'Deep chestnut, redwood, and walnut for traditional and craftsman exteriors.',
      audience: 'Traditional and craftsman homes',
      page: 'legacy-pvc-decking',
      lines: ['legacy', 'truegrain'],
      colors: {
        legacy: ['Chestnut', 'Redwood'],
        truegrain: ['Tropical Walnut']
      },
      extras: [],
      note: 'Rich Browns kit: Legacy PVC Chestnut, Redwood; TrueGrain Tropical Walnut.'
    },
    {
      id: 'full-truegrain',
      name: 'Full TrueGrain Palette',
      tagline: 'All six TrueGrain colors side by side, for when you want to see the whole range.',
      audience: 'Still deciding on a direction',
      page: 'truegrain-deck',
      lines: ['truegrain'],
      colors: {
        truegrain: ['New England Birch', 'Coastal Driftwood', 'Aged Oak', 'Embered Taupe', 'Royal IPE', 'Tropical Walnut']
      },
      extras: [],
      note: 'Full TrueGrain Palette kit: all six TrueGrain colors.'
    },
    {
      id: 'invisiclip-starter',
      name: 'InvisiClip Starter',
      tagline: 'One TrueGrain and one Legacy board in the Grooved for InvisiClip profile, with a clip and short rail to test the snap.',
      audience: 'Contractors evaluating the fastening system',
      page: 'truegrain-deck',
      lines: ['truegrain', 'legacy', 'invisiclip'],
      colors: {
        truegrain: ['Tropical Walnut'],
        legacy: ['Driftwood']
      },
      extras: ['InvisiClip clip and rail section'],
      note: 'InvisiClip Starter kit: TrueGrain Tropical Walnut and Legacy PVC Driftwood, both in the Grooved for InvisiClip profile, plus one InvisiClip clip and a short aluminum rail section.'
    }
  ];

  function kitById(id) {
    for (var i = 0; i < KITS.length; i++) if (KITS[i].id === id) return KITS[i];
    return null;
  }

  function pieceCount(kit) {
    var n = 0;
    Object.keys(kit.colors).forEach(function (line) { n += kit.colors[line].length; });
    return n + (kit.extras ? kit.extras.length : 0);
  }

  function kitHref(kit) {
    return ROOT + 'pages/' + kit.page + '.html?kit=' + encodeURIComponent(kit.id) + '#samples';
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---- 1. Render cards --------------------------------------------------
  function swatchStrip(kit) {
    var html = '';
    Object.keys(kit.colors).forEach(function (line) {
      kit.colors[line].forEach(function (color) {
        var src = SWATCH[line] && SWATCH[line][color];
        if (!src) return;
        html += '<li class="kit-swatch" title="' + esc(LINE_LABEL[line] + ' ' + color) + '">' +
          '<img src="' + ROOT + src + '" alt="' + esc(LINE_LABEL[line] + ' ' + color + ' sample') + '" loading="lazy" decoding="async" width="72" height="72" />' +
          '<span>' + esc(color) + '</span></li>';
      });
    });
    (kit.extras || []).forEach(function (x) {
      var src = SWATCH.invisiclip[x];
      html += '<li class="kit-swatch kit-swatch--hardware" title="' + esc(x) + '">' +
        '<img src="' + ROOT + src + '" alt="' + esc(x) + '" loading="lazy" decoding="async" width="72" height="72" />' +
        '<span>Clip + rail</span></li>';
    });
    return html;
  }

  function cardHtml(kit, variant) {
    var pieces = pieceCount(kit);
    var lines = kit.lines.map(function (l) { return LINE_LABEL[l]; }).join(' + ');
    return '' +
      '<article class="kit-card kit-card--' + variant + '" data-kit-id="' + esc(kit.id) + '">' +
        '<div class="kit-card__head">' +
          '<span class="kit-card__count">' + pieces + ' pieces</span>' +
          '<span class="kit-card__lines">' + esc(lines) + '</span>' +
        '</div>' +
        '<h3 class="kit-card__name">' + esc(kit.name) + '</h3>' +
        '<p class="kit-card__tagline">' + esc(kit.tagline) + '</p>' +
        '<ul class="kit-swatches" aria-label="' + esc(kit.name + ' kit contents') + '">' + swatchStrip(kit) + '</ul>' +
        '<p class="kit-card__audience"><b>For:</b> ' + esc(kit.audience) + '</p>' +
        '<a class="btn btn--primary kit-card__cta" href="' + kitHref(kit) + '" data-kit-link="' + esc(kit.id) + '">Request This Kit</a>' +
      '</article>';
  }

  function renderContainers() {
    var containers = document.querySelectorAll('[data-sample-kits]');
    if (!containers.length) return;
    containers.forEach(function (el) {
      var variant = el.getAttribute('data-kits-variant') || 'full';
      var only = (el.getAttribute('data-kits-only') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      var list = only.length ? KITS.filter(function (k) { return only.indexOf(k.id) !== -1; }) : KITS;
      el.innerHTML = '<div class="kit-grid kit-grid--' + variant + '">' + list.map(function (k) { return cardHtml(k, variant); }).join('') + '</div>';
    });

    // Light analytics hook: custom pixel event per kit click, if the pixel is present.
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('[data-kit-link]') : null;
      if (!a) return;
      try {
        if (typeof window.fbq === 'function') {
          window.fbq('trackCustom', 'SampleKitSelected', { kit: a.getAttribute('data-kit-link') });
        }
      } catch (_) { /* no-op */ }
    });
  }

  // ---- 2. Pre-fill the sample form from ?kit= ---------------------------
  function setHidden(form, name, value) {
    var input = form.querySelector('input[type="hidden"][name="' + name + '"]');
    if (!input) {
      input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      form.insertBefore(input, form.firstChild);
    }
    input.value = value;
  }

  function fire(el) {
    var ev;
    try { ev = new Event('change', { bubbles: true }); }
    catch (_) { ev = document.createEvent('Event'); ev.initEvent('change', true, true); }
    el.dispatchEvent(ev);
  }

  function applyKitToForm(kit, form) {
    // Lines first so site.js reveals the right color blocks and clears the rest.
    var lineBoxes = form.querySelectorAll('input[name="samples[]"][data-line]');
    if (!lineBoxes.length) return false;
    var firstBox = null;
    lineBoxes.forEach(function (cb) {
      var l = cb.getAttribute('data-line');
      cb.checked = kit.lines.indexOf(l) !== -1;
      if (!firstBox) firstBox = cb;
    });
    fire(firstBox);

    // Then the colors.
    Object.keys(kit.colors).forEach(function (line) {
      kit.colors[line].forEach(function (color) {
        var cb = form.querySelector('input[name="colors_' + line + '[]"][value="' + color.replace(/"/g, '\\"') + '"]');
        if (cb) cb.checked = true;
      });
    });
    fire(firstBox); // refresh the submit label after colors are in

    // Tag the submission for fulfillment and attribution.
    setHidden(form, 'kit', kit.name);
    setHidden(form, 'kit_id', kit.id);
    setHidden(form, 'kit_contents', kit.note);
    var subj = form.querySelector('input[name="_subject"]');
    if (subj && subj.value.indexOf('kit') === -1) {
      subj.value = kit.name + ' kit request (' + subj.value.replace(/^Sample request from\s*/i, '') + ')';
    }
    var next = form.querySelector('input[name="_next"]');
    if (next && next.value.indexOf('kit=') === -1) {
      next.value += (next.value.indexOf('?') === -1 ? '?' : '&') + 'kit=' + encodeURIComponent(kit.id);
    }

    // Notice above the form.
    var notice = document.createElement('div');
    notice.className = 'kit-notice';
    notice.setAttribute('role', 'status');
    notice.innerHTML =
      '<span class="kit-notice__badge">Kit loaded</span>' +
      '<p><b>' + esc(kit.name) + '</b> (' + pieceCount(kit) + ' pieces) is pre-selected below. ' +
      'Add or remove any color you like, then fill in your shipping details.' +
      (kit.extras && kit.extras.length ? ' Both boards ship in the Grooved for InvisiClip profile with a clip and rail section.' : '') +
      '</p>' +
      '<button type="button" class="kit-notice__clear">Start from scratch</button>';
    form.insertBefore(notice, form.firstChild);
    notice.querySelector('.kit-notice__clear').addEventListener('click', function () {
      form.querySelectorAll('input[type="checkbox"]').forEach(function (c) { c.checked = false; });
      ['kit', 'kit_id', 'kit_contents'].forEach(function (n) {
        var h = form.querySelector('input[type="hidden"][name="' + n + '"]');
        if (h) h.parentNode.removeChild(h);
      });
      fire(firstBox);
      notice.parentNode.removeChild(notice);
      try { history.replaceState(null, '', location.pathname + '#samples'); } catch (_) { /* no-op */ }
    });
    return true;
  }

  function prefillFromQuery() {
    var id;
    try { id = new URLSearchParams(location.search).get('kit'); } catch (_) { id = null; }
    if (!id) return;
    var kit = kitById(id);
    if (!kit) return;
    var form = document.querySelector('form[data-color-picker-form]');
    if (!form) return;
    if (!applyKitToForm(kit, form)) return;
    // Make sure the visitor lands on the form even if the hash was lost.
    var target = document.getElementById('samples');
    if (target && location.hash !== '#samples') {
      try { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) { target.scrollIntoView(); }
    }
  }

  function init() {
    renderContainers();
    prefillFromQuery();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for debugging and future pages.
  window.AmericanProSampleKits = { kits: KITS, kitById: kitById };
})();
