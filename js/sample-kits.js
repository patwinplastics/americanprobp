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
    porch: {
      'Driftwood': 'images/porch_swatches/driftwood.jpg',
      'Slate': 'images/porch_swatches/slate.jpg',
      'Beachwood': 'images/porch_swatches/beachwood.jpg',
      'Tuscany': 'images/porch_swatches/tuscany.jpg',
      'Chestnut': 'images/porch_swatches/chestnut.jpg',
      'Redwood': 'images/porch_swatches/redwood.jpg'
    },
    // Mouldings are keyed by SKU. `value` must match the form checkbox exactly.
    mouldings: {
      'WM53PVC':  { label: '2-5/8" Crown',      value: 'WM53PVC - 2-5/8" Crown',      img: 'images/mouldings_profiles/wm53pvc.webp' },
      'LWM49PVC': { label: '3-5/8" Crown',      value: 'LWM49PVC - 3-5/8" Crown',     img: 'images/mouldings_profiles/crown_3_625.jpg' },
      'WM47PVC':  { label: '4-5/8" Crown',      value: 'WM47PVC - 4-5/8" Crown',      img: 'images/mouldings_profiles/crown_4_625.jpg' },
      'L8027PVC': { label: '5-1/4" Crown',      value: 'L8027PVC - 5-1/4" Crown',     img: 'images/mouldings_profiles/crown_5_25.jpg' },
      'WM180PVC': { label: 'Brickmould',        value: 'WM180PVC - Brickmould',       img: 'images/mouldings_profiles/brick.jpg' },
      'WC1CTPVC': { label: 'Windsor Casing',    value: 'WC1CTPVC - Windsor Casing',   img: 'images/mouldings_profiles/wc1ctpvc.webp' },
      '138BBPVC': { label: 'Backband',          value: '138BBPVC - Backband',         img: 'images/mouldings_profiles/138bbpvc.webp' },
      'SILL7650PVC': { label: 'Historical Sill', value: 'SILL7650PVC - Historical Sill', img: 'images/mouldings_profiles/historic_sill.jpg' },
      'WM197PVC': { label: 'Drip Cap',          value: 'WM197PVC - Drip Cap',         img: 'images/mouldings_profiles/drip_cap.jpg' },
      'WATERTABLEPVC': { label: 'Water Table',  value: 'WATERTABLEPVC - Water Table', img: 'images/mouldings_profiles/watertablepvc.webp' },
      'RAKEPVC':  { label: 'Rake Mould',        value: 'RAKEPVC - Rake Mould',        img: 'images/mouldings_profiles/rake_mold.jpg' },
      'WM210PVC': { label: 'Shingle Mould',     value: 'WM210PVC - Shingle Mould',    img: 'images/mouldings_profiles/shingle.jpg' },
      'ES11PVC':  { label: 'Rab Panel',         value: 'ES11PVC - Rab Panel',         img: 'images/mouldings_profiles/es11pvc.webp' },
      'ECB6PVC':  { label: '6" Beadboard',      value: 'ECB6PVC - 6" E&CB Beadboard', img: 'images/mouldings_profiles/ecb6pvc.webp' },
      'ECBCAPPVC': { label: 'ECB Cap',          value: 'ECBCAPPVC - ECB Cap',         img: 'images/mouldings_profiles/bead_cap.jpg' },
      'WM164PVC': { label: 'Base Cap',          value: 'WM164PVC - Base Cap',         img: 'images/mouldings_profiles/base_cap.jpg' },
      '8065PVC':  { label: 'Quarter Round',     value: '8065PVC - Quarter Round',     img: 'images/mouldings_profiles/quarter_round.jpg' },
      'WM93PVC':  { label: 'Cove Mould',        value: 'WM93PVC - Cove Mould',        img: 'images/mouldings_profiles/wm93pvc.webp' }
    },
    invisiclip: {
      'InvisiClip clip and rail section': 'images/invisiclip/clip_macro_hero-600.jpg'
    }
  };

  // Porch thickness options. Values must match the porch form checkboxes.
  var PORCH_THICKNESS = {
    '3/4': { label: '3/4"', value: '3/4" (joists up to 12" O.C.)' },
    '1':   { label: '1" nominal (7/8" actual)', value: '1" nominal, 7/8" actual (joists up to 16" O.C.)' }
  };

  var LINE_LABEL = {
    truegrain: 'TrueGrain Deck',
    legacy: 'Legacy PVC',
    porch: 'Porch Flooring',
    mouldings: 'PVC Mouldings',
    invisiclip: 'InvisiClip'
  };

  var CATEGORY_LABEL = {
    decking: 'Decking',
    porch: 'Porch Flooring',
    mouldings: 'Mouldings & Trim',
    fastening: 'Hidden Fastening'
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
      category: 'decking',
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
      category: 'decking',
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
      category: 'decking',
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
      category: 'decking',
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
      category: 'decking',
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
      category: 'fastening',
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
    },
    {
      id: 'full-legacy',
      category: 'decking',
      name: 'Full Legacy Palette',
      tagline: 'All six Legacy PVC solid colors side by side, from Driftwood to Redwood.',
      audience: 'Comparing the full solid-color range',
      page: 'legacy-pvc-decking',
      lines: ['legacy'],
      colors: {
        legacy: ['Driftwood', 'Khaki', 'Hazelnut', 'Beachwood', 'Chestnut', 'Redwood']
      },
      extras: [],
      note: 'Full Legacy Palette kit: all six Legacy PVC colors.'
    },

    /* ---- Porch flooring. Two thicknesses: 3/4" (joists to 12" O.C.) and
       1" nominal, 7/8" actual (joists to 16" O.C.). Kits ship one piece per
       color per selected thickness so the visitor can feel both. ---- */
    {
      id: 'porch-coastal-greys',
      category: 'porch',
      name: 'Porch Coastal Greys',
      tagline: 'Driftwood, Slate, and Beachwood tongue-and-groove boards in both thicknesses.',
      audience: 'White, grey, and blue exteriors',
      page: 'porch',
      colors: { porch: ['Driftwood', 'Slate', 'Beachwood'] },
      thickness: ['3/4', '1'],
      extras: [],
      note: 'Porch Coastal Greys kit: Driftwood, Slate, Beachwood porch flooring, one piece of each color in 3/4" and in 1" nominal (7/8" actual).'
    },
    {
      id: 'porch-warm-woods',
      category: 'porch',
      name: 'Porch Warm Woods',
      tagline: 'Tuscany, Chestnut, and Redwood tongue-and-groove boards in both thicknesses.',
      audience: 'Painted-wood porches going maintenance-free',
      page: 'porch',
      colors: { porch: ['Tuscany', 'Chestnut', 'Redwood'] },
      thickness: ['3/4', '1'],
      extras: [],
      note: 'Porch Warm Woods kit: Tuscany, Chestnut, Redwood porch flooring, one piece of each color in 3/4" and in 1" nominal (7/8" actual).'
    },
    {
      id: 'porch-thickness-compare',
      category: 'porch',
      name: 'Porch 3/4" vs 1" Side by Side',
      tagline: 'Two colors, both thicknesses, so you can settle joist spacing and feel the difference in hand.',
      audience: 'Deciding between 12" and 16" O.C. framing',
      page: 'porch',
      colors: { porch: ['Driftwood', 'Chestnut'] },
      thickness: ['3/4', '1'],
      extras: [],
      note: 'Porch thickness comparison kit: Driftwood and Chestnut porch flooring, each in 3/4" and in 1" nominal (7/8" actual).'
    },
    {
      id: 'porch-full-palette',
      category: 'porch',
      name: 'Full Porch Palette',
      tagline: 'All six porch colors in both thicknesses, the complete porch flooring range.',
      audience: 'Dealers, builders, and the undecided',
      page: 'porch',
      colors: { porch: ['Driftwood', 'Slate', 'Beachwood', 'Tuscany', 'Chestnut', 'Redwood'] },
      thickness: ['3/4', '1'],
      extras: [],
      note: 'Full Porch Palette kit: all six porch flooring colors, one piece of each in 3/4" and in 1" nominal (7/8" actual).'
    },

    /* ---- Mouldings. Keyed by SKU; the form value is resolved from SWATCH.mouldings. ---- */
    {
      id: 'crown-sizing',
      category: 'mouldings',
      name: 'Crown Sizing Kit',
      tagline: 'Four crown sizes from 2-5/8" to 5-1/4" so you can hold each one against the room or the eave.',
      audience: 'Choosing crown scale before you order',
      page: 'mouldings',
      colors: { mouldings: ['WM53PVC', 'LWM49PVC', 'WM47PVC', 'L8027PVC'] },
      extras: [],
      note: 'Crown Sizing kit: WM53PVC 2-5/8" Crown, LWM49PVC 3-5/8" Crown, WM47PVC 4-5/8" Crown, L8027PVC 5-1/4" Crown.'
    },
    {
      id: 'window-door-trim',
      category: 'mouldings',
      name: 'Window & Door Trim Kit',
      tagline: 'Brickmould, Windsor casing, backband, historical sill, and drip cap: a full opening in one mailer.',
      audience: 'Trimming out windows and doors',
      page: 'mouldings',
      colors: { mouldings: ['WM180PVC', 'WC1CTPVC', '138BBPVC', 'SILL7650PVC', 'WM197PVC'] },
      extras: [],
      note: 'Window & Door Trim kit: WM180PVC Brickmould, WC1CTPVC Windsor Casing, 138BBPVC Backband, SILL7650PVC Historical Sill, WM197PVC Drip Cap.'
    },
    {
      id: 'exterior-trim',
      category: 'mouldings',
      name: 'Exterior Trim Kit',
      tagline: 'Water table, rake mould, shingle mould, and rab panel for the siding-to-trim details that take weather.',
      audience: 'Siding transitions, gables, and water tables',
      page: 'mouldings',
      colors: { mouldings: ['WATERTABLEPVC', 'RAKEPVC', 'WM210PVC', 'ES11PVC'] },
      extras: [],
      note: 'Exterior Trim kit: WATERTABLEPVC Water Table, RAKEPVC Rake Mould, WM210PVC Shingle Mould, ES11PVC Rab Panel.'
    },
    {
      id: 'porch-ceiling-finish',
      category: 'mouldings',
      name: 'Porch Ceiling & Finish Kit',
      tagline: 'Beadboard, ECB cap, base cap, quarter round, and cove: everything that finishes a porch after the floor goes down.',
      audience: 'Finishing a porch ceiling and perimeter',
      page: 'mouldings',
      colors: { mouldings: ['ECB6PVC', 'ECBCAPPVC', 'WM164PVC', '8065PVC', 'WM93PVC'] },
      extras: [],
      note: 'Porch Ceiling & Finish kit: ECB6PVC 6" E&CB Beadboard, ECBCAPPVC ECB Cap, WM164PVC Base Cap, 8065PVC Quarter Round, WM93PVC Cove Mould.'
    }
  ];

  function kitById(id) {
    for (var i = 0; i < KITS.length; i++) if (KITS[i].id === id) return KITS[i];
    return null;
  }

  function pieceCount(kit) {
    var n = 0;
    Object.keys(kit.colors).forEach(function (line) { n += kit.colors[line].length; });
    if (kit.thickness && kit.thickness.length) n = n * kit.thickness.length;
    return n + (kit.extras ? kit.extras.length : 0);
  }

  // Normalise a SWATCH entry (string path or {img,label,value}) to an item.
  function swatchItem(line, key) {
    var entry = SWATCH[line] && SWATCH[line][key];
    if (!entry) return null;
    if (typeof entry === 'string') return { img: entry, label: key, value: key };
    return { img: entry.img, label: entry.label || key, value: entry.value || key };
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
      kit.colors[line].forEach(function (key) {
        var it = swatchItem(line, key);
        if (!it) return;
        html += '<li class="kit-swatch" title="' + esc(LINE_LABEL[line] + ' ' + it.label) + '">' +
          '<img src="' + ROOT + it.img + '" alt="' + esc(LINE_LABEL[line] + ' ' + it.label + ' sample') + '" loading="lazy" decoding="async" width="72" height="72" />' +
          '<span>' + esc(it.label) + '</span></li>';
      });
    });
    (kit.extras || []).forEach(function (x) {
      var it = swatchItem('invisiclip', x);
      if (!it) return;
      html += '<li class="kit-swatch kit-swatch--hardware" title="' + esc(x) + '">' +
        '<img src="' + ROOT + it.img + '" alt="' + esc(x) + '" loading="lazy" decoding="async" width="72" height="72" />' +
        '<span>Clip + rail</span></li>';
    });
    return html;
  }

  function thicknessLabel(kit) {
    if (!kit.thickness || !kit.thickness.length) return '';
    return kit.thickness.map(function (k) { return PORCH_THICKNESS[k] ? PORCH_THICKNESS[k].label : k; }).join(' and ');
  }

  function cardHtml(kit, variant) {
    var pieces = pieceCount(kit);
    var lineKeys = kit.lines || Object.keys(kit.colors);
    var lines = lineKeys.map(function (l) { return LINE_LABEL[l] || l; }).join(' + ');
    var thick = thicknessLabel(kit);
    return '' +
      '<article class="kit-card kit-card--' + variant + '" data-kit-id="' + esc(kit.id) + '">' +
        '<div class="kit-card__head">' +
          '<span class="kit-card__count">' + pieces + ' pieces</span>' +
          '<span class="kit-card__lines">' + esc(lines) + '</span>' +
        '</div>' +
        '<h3 class="kit-card__name">' + esc(kit.name) + '</h3>' +
        '<p class="kit-card__tagline">' + esc(kit.tagline) + '</p>' +
        '<ul class="kit-swatches" aria-label="' + esc(kit.name + ' kit contents') + '">' + swatchStrip(kit) + '</ul>' +
        (thick ? '<p class="kit-card__thickness"><b>Thickness:</b> ' + esc(thick) + '</p>' : '') +
        '<p class="kit-card__audience"><b>For:</b> ' + esc(kit.audience) + '</p>' +
        '<a class="btn btn--primary kit-card__cta" href="' + kitHref(kit) + '" data-kit-link="' + esc(kit.id) + '">Request This Kit</a>' +
      '</article>';
  }

  function gridHtml(list, variant) {
    return '<div class="kit-grid kit-grid--' + variant + '">' + list.map(function (k) { return cardHtml(k, variant); }).join('') + '</div>';
  }

  function renderContainers() {
    var containers = document.querySelectorAll('[data-sample-kits]');
    if (!containers.length) return;
    containers.forEach(function (el) {
      var variant = el.getAttribute('data-kits-variant') || 'full';
      var only = (el.getAttribute('data-kits-only') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      var list = only.length ? KITS.filter(function (k) { return only.indexOf(k.id) !== -1; }) : KITS;
      var filter = el.hasAttribute('data-kits-filter');

      if (!filter) {
        el.innerHTML = gridHtml(list, variant);
        return;
      }

      // Category chips. Default to the first category present (decking).
      var cats = [];
      list.forEach(function (k) { if (cats.indexOf(k.category) === -1) cats.push(k.category); });
      var order = Object.keys(CATEGORY_LABEL);
      cats.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
      var initial = el.getAttribute('data-kits-default') || cats[0];
      var chips = cats.map(function (c) {
        var n = list.filter(function (k) { return k.category === c; }).length;
        return '<button type="button" class="kit-chip' + (c === initial ? ' is-active' : '') + '" data-kit-cat="' + esc(c) + '" aria-pressed="' + (c === initial) + '">' +
          esc(CATEGORY_LABEL[c] || c) + ' <span class="kit-chip__n">' + n + '</span></button>';
      }).join('');
      el.innerHTML = '<div class="kit-chips" role="group" aria-label="Filter kits by product line">' + chips + '</div>' +
        '<div class="kit-grid-host">' + gridHtml(list.filter(function (k) { return k.category === initial; }), variant) + '</div>';

      el.addEventListener('click', function (e) {
        var chip = e.target && e.target.closest ? e.target.closest('.kit-chip') : null;
        if (!chip) return;
        var cat = chip.getAttribute('data-kit-cat');
        el.querySelectorAll('.kit-chip').forEach(function (c) {
          var on = c === chip;
          c.classList.toggle('is-active', on);
          c.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        el.querySelector('.kit-grid-host').innerHTML = gridHtml(list.filter(function (k) { return k.category === cat; }), variant);
      });
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

  function checkByValue(form, name, value) {
    var hit = false;
    form.querySelectorAll('input[type="checkbox"][name="' + name + '"]').forEach(function (cb) {
      if (cb.value === value) { cb.checked = true; hit = true; }
    });
    return hit;
  }

  function applyKitToForm(kit, form) {
    var lineBoxes = form.querySelectorAll('input[name="samples[]"][data-line]');
    var firstBox = lineBoxes.length ? lineBoxes[0] : null;
    var applied = false;

    if (kit.lines && lineBoxes.length) {
      // Decking color-picker form: lines first so site.js reveals the right
      // color blocks and clears the rest, then the colors.
      lineBoxes.forEach(function (cb) {
        cb.checked = kit.lines.indexOf(cb.getAttribute('data-line')) !== -1;
      });
      fire(firstBox);
      Object.keys(kit.colors).forEach(function (line) {
        kit.colors[line].forEach(function (color) {
          if (checkByValue(form, 'colors_' + line + '[]', color)) applied = true;
        });
      });
      fire(firstBox); // refresh the submit label after colors are in
    } else {
      // Generic form (porch, mouldings): everything is a samples[] checkbox,
      // plus thickness[] on porch.
      Object.keys(kit.colors).forEach(function (line) {
        kit.colors[line].forEach(function (key) {
          var it = swatchItem(line, key);
          if (it && checkByValue(form, 'samples[]', it.value)) applied = true;
        });
      });
      (kit.thickness || []).forEach(function (k) {
        var opt = PORCH_THICKNESS[k];
        if (opt) checkByValue(form, 'thickness[]', opt.value);
      });
    }
    if (!applied) return false;

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
    var thick = thicknessLabel(kit);
    var notice = document.createElement('div');
    notice.className = 'kit-notice';
    notice.setAttribute('role', 'status');
    notice.innerHTML =
      '<span class="kit-notice__badge">Kit loaded</span>' +
      '<p><b>' + esc(kit.name) + '</b> (' + pieceCount(kit) + ' pieces) is pre-selected below. ' +
      'Add or remove anything you like, then fill in your shipping details.' +
      (thick ? ' One piece per color in each thickness: ' + esc(thick) + '.' : '') +
      (kit.extras && kit.extras.length ? ' Both boards ship in the Grooved for InvisiClip profile with a clip and rail section.' : '') +
      '</p>' +
      '<button type="button" class="kit-notice__clear">Start from scratch</button>';
    var anchor = form.querySelector('.form-grid') || form.firstChild;
    form.insertBefore(notice, anchor);
    notice.querySelector('.kit-notice__clear').addEventListener('click', function () {
      form.querySelectorAll('input[type="checkbox"]').forEach(function (c) { c.checked = false; });
      ['kit', 'kit_id', 'kit_contents'].forEach(function (n) {
        var h = form.querySelector('input[type="hidden"][name="' + n + '"]');
        if (h) h.parentNode.removeChild(h);
      });
      if (firstBox) fire(firstBox);
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
    var form = document.querySelector('form[data-color-picker-form]') ||
               document.querySelector('#samples form[data-formspree]');
    if (!form) return;
    if (!applyKitToForm(kit, form)) return;
    // Land the visitor on the form itself, not the top of the #samples
    // section (which on product pages starts with the kit strip). Run once
    // now and again after load, because the browser's own #hash scroll and
    // late image layout can both move the page after we scroll.
    scrollToForm(form);
    window.addEventListener('load', function () { setTimeout(function () { scrollToForm(form); }, 250); });
  }

  function stickyOffset() {
    var h = 0;
    var header = document.querySelector('.site-header');
    var subnav = document.querySelector('.subnav');
    if (header) h += header.getBoundingClientRect().height;
    if (subnav) h += subnav.getBoundingClientRect().height;
    return h + 16;
  }

  function scrollToForm(form) {
    var target = form.closest('.form-card') || form;
    var top = target.getBoundingClientRect().top + window.pageYOffset - stickyOffset();
    try { window.scrollTo({ top: top, behavior: 'smooth' }); } catch (_) { window.scrollTo(0, top); }
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
