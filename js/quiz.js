// Find-your-deck quiz. Three weighted questions pick between TrueGrain Deck and
// Legacy PVC Decking. Winner only is shown as an expanded result card with a
// hero swatch, a one-line reason, three "why this fits you" bullets, two color
// picks, and two CTAs. Pure client-side, vanilla JS, no deps.
(function () {
  var root = document.querySelector('[data-quiz]');
  if (!root) return;

  var resultEl = root.querySelector('[data-quiz-result]');
  var resetEl = root.querySelector('[data-quiz-reset]');
  var options = root.querySelectorAll('.quiz-option');

  var state = { 1: null, 2: null, 3: null };

  // Detect whether we sit on a product page so the samples CTA can use an
  // in-page anchor when the winning line matches the current page.
  var path = location.pathname;
  var onTrueGrainPage = /truegrain-deck\.html$/.test(path);
  var onLegacyPage = /legacy-pvc-decking\.html$/.test(path);

  // Image and cross-page paths are written relative to a product page (../).
  var SWATCH = {
    truegrain: {
      'New England Birch': '../images/truegrain_swatches/new_england_birch.jpg',
      'Aged Oak': '../images/truegrain_swatches/aged_oak.jpg',
      'Coastal Driftwood': '../images/truegrain_swatches/coastal_driftwood.jpg',
      'Embered Taupe': '../images/truegrain_swatches/embered_taupe.jpg',
      'Royal IPE': '../images/truegrain_swatches/royal_ipe.jpg',
      'Tropical Walnut': '../images/truegrain_swatches/tropical_walnut.jpg'
    },
    legacy: {
      'Driftwood': '../images/deck_swatches/driftwood.jpg',
      'Khaki': '../images/deck_swatches/khaki.jpg',
      'Beachwood': '../images/deck_swatches/beachwood.jpg',
      'Hazelnut': '../images/deck_swatches/hazelnut.jpg',
      'Chestnut': '../images/deck_swatches/chestnut.jpg',
      'Redwood': '../images/deck_swatches/redwood.jpg'
    }
  };

  var PRODUCTS = {
    truegrain: {
      key: 'truegrain',
      name: 'TrueGrain Deck™',
      eyebrow: 'Your match',
      hero: '../images/truegrain_swatches/tropical_walnut.jpg',
      heroAlt: 'TrueGrain Deck PVC decking color swatch',
      page: '../pages/truegrain-deck.html',
      samplesCross: '../pages/truegrain-deck.html#samples'
    },
    legacy: {
      key: 'legacy',
      name: 'Legacy PVC Decking',
      eyebrow: 'Your match',
      hero: '../images/deck_swatches/driftwood.jpg',
      heroAlt: 'Legacy PVC Decking color swatch',
      page: '../pages/legacy-pvc-decking.html',
      samplesCross: '../pages/legacy-pvc-decking.html#samples'
    }
  };

  // Weighted scoring table. Higher total wins; ties go to TrueGrain.
  var SCORES = {
    1: {
      wood:      { tg: 1, lg: 1 },
      composite: { tg: 2, lg: 0 },
      pvc:       { tg: 1, lg: 2 },
      newbuild:  { tg: 1, lg: 1 }
    },
    2: {
      look:  { tg: 3, lg: 0 },
      heat:  { tg: 1, lg: 2 },
      price: { tg: 0, lg: 3 },
      ease:  { tg: 1, lg: 2 }
    },
    3: {
      very:     { tg: 3, lg: 0 },
      somewhat: { tg: 1, lg: 1 },
      not:      { tg: 0, lg: 2 },
      clean:    { tg: 0, lg: 3 }
    }
  };

  // One-line reason, keyed by Q2 (and by winner for the two heat variants).
  var REASONS = {
    look: 'The most realistic hardwood look in capped PVC that never fades, rots, or splinters.',
    heat_tg: 'Cool underfoot and capped on four sides to shrug off heat, fade, and weather.',
    heat_lg: 'Solid, capped PVC that runs cool and resists heat cycling year after year.',
    price: 'The value workhorse: same PVC chemistry in classic solid colors at a friendlier price.',
    ease: 'Installer friendly: top-fasten or hidden-clip ready and Pro Plug compatible.'
  };

  // Bullet pools keyed by question then answer, gated by which line won.
  var BULLETS = {
    3: {
      very:     { win: 'truegrain', text: 'Real hardwood grain that reads authentic close up and from the yard.' },
      somewhat: { win: 'truegrain', text: 'The grain is there when you want it, quieter when you don’t.' },
      not:      { win: 'legacy',    text: 'A clean, honest finish with the same premium PVC chemistry.' },
      clean:    { win: 'legacy',    text: 'Uniform color, uniform texture, board to board consistency.' }
    },
    2: {
      look:  { win: 'truegrain', text: 'Six hardwood tones from birch to ipe, laminated for depth.' },
      heat:  { win: 'either',    tg: 'Capped cellular PVC runs cooler than composite in summer sun.', lg: 'Solid PVC extrusion with a cool-touch surface in real heat.' },
      price: { win: 'legacy',    text: 'Cellular PVC value without cutting corners on chemistry.' },
      ease:  { win: 'legacy',    text: 'Grooved or square edge, top-fasten or hidden clip, contractor tested.' }
    },
    1: {
      wood:      { win: 'either', text: 'A no-splinter, no-sealing upgrade over the wood you’re removing.' },
      composite: { win: 'either', text: 'No organic fill to stain, mold, or fade like composite.' },
      pvc:       { win: 'either', text: 'A clean color and realism step up from older PVC boards.' },
      newbuild:  { win: 'either', text: 'Preview it on your plans in the 3D Deck Builder before you order.' }
    }
  };

  var FILLER = [
    'Fully capped PVC, will not rot, splinter, or feed mold.',
    'Backed by a lifetime limited warranty.',
    'Made in the USA by Patwin Plastics since 1971.'
  ];

  // Two top color picks based on winner and Q2/Q3.
  function colorPicks(winner, q2, q3) {
    if (winner === 'truegrain') {
      if (q2 === 'look' || q3 === 'very') return ['New England Birch', 'Aged Oak'];
      if (q2 === 'heat') return ['Coastal Driftwood', 'Embered Taupe'];
      if (q2 === 'price' || q3 === 'clean') return ['Aged Oak', 'Coastal Driftwood'];
      return ['Royal IPE', 'Tropical Walnut'];
    }
    if (q2 === 'heat') return ['Driftwood', 'Khaki'];
    if (q2 === 'price' || q3 === 'clean') return ['Khaki', 'Beachwood'];
    if (q2 === 'ease') return ['Hazelnut', 'Chestnut'];
    return ['Driftwood', 'Beachwood'];
  }

  function reasonFor(winner, q2) {
    if (q2 === 'heat') return winner === 'truegrain' ? REASONS.heat_tg : REASONS.heat_lg;
    return REASONS[q2] || REASONS.look;
  }

  // Pick up to three bullets in priority order Q3, Q2, Q1, gated by winner,
  // then top up from the generic filler pool.
  function bulletsFor(winner) {
    var picks = [];
    var order = [3, 2, 1];
    for (var i = 0; i < order.length; i++) {
      var q = order[i];
      var answer = state[q];
      var pool = BULLETS[q];
      var entry = answer ? pool[answer] : null;
      if (!entry) continue;
      if (entry.win === 'either') {
        picks.push(entry.text || (winner === 'truegrain' ? entry.tg : entry.lg));
      } else if (entry.win === winner) {
        picks.push(entry.text);
      }
      if (picks.length === 3) break;
    }
    for (var j = 0; j < FILLER.length && picks.length < 3; j++) {
      if (picks.indexOf(FILLER[j]) === -1) picks.push(FILLER[j]);
    }
    return picks.slice(0, 3);
  }

  function samplesHref(winner) {
    if (winner === 'truegrain' && onTrueGrainPage) return '#samples';
    if (winner === 'legacy' && onLegacyPage) return '#samples';
    return PRODUCTS[winner].samplesCross;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function render() {
    if (!state[1] || !state[2] || !state[3]) return;

    var tg = 0, lg = 0;
    for (var q = 1; q <= 3; q++) {
      var s = SCORES[q][state[q]];
      if (s) { tg += s.tg; lg += s.lg; }
    }
    var winner = tg >= lg ? 'truegrain' : 'legacy';
    var product = PRODUCTS[winner];

    var reason = reasonFor(winner, state[2]);
    var bullets = bulletsFor(winner);
    var picks = colorPicks(winner, state[2], state[3]);
    var swatches = SWATCH[winner];

    var bulletsHtml = '';
    for (var b = 0; b < bullets.length; b++) {
      bulletsHtml += '<li>' + esc(bullets[b]) + '</li>';
    }

    var colorsHtml = '';
    for (var c = 0; c < picks.length; c++) {
      var name = picks[c];
      var img = swatches[name];
      if (!img) continue;
      colorsHtml +=
        '<span class="quiz-result-color">' +
          '<img src="' + esc(img) + '" alt="' + esc(product.name + ' ' + name + ' color swatch') + '" loading="lazy" decoding="async" />' +
          '<small>' + esc(name) + '</small>' +
        '</span>';
    }

    resultEl.innerHTML =
      '<div class="quiz-result-card">' +
        '<span class="quiz-result-media"><img src="' + esc(product.hero) + '" alt="' + esc(product.heroAlt) + '" loading="lazy" decoding="async" /></span>' +
        '<div class="quiz-result-copy">' +
          '<span class="quiz-result-eyebrow">' + esc(product.eyebrow) + '</span>' +
          '<h3 class="quiz-result-title">' + product.name + '</h3>' +
          '<p class="quiz-result-reason">' + esc(reason) + '</p>' +
          '<ul class="quiz-result-bullets">' + bulletsHtml + '</ul>' +
          '<div class="quiz-result-colors">' + colorsHtml + '</div>' +
          '<div class="quiz-result-actions">' +
            '<a class="btn btn--primary" href="' + esc(samplesHref(winner)) + '" data-product-link>Get free samples</a>' +
            '<a class="btn btn--secondary" href="https://deckbuilder.americanprobp.com/" target="_blank" rel="noopener">See it on your house</a>' +
          '</div>' +
        '</div>' +
      '</div>';

    resultEl.hidden = false;
    resetEl.hidden = false;

    if (typeof resultEl.scrollIntoView === 'function') {
      resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function select(q, value, btn) {
    state[q] = value;
    var group = root.querySelectorAll('.quiz-option[data-quiz-q="' + q + '"]');
    for (var i = 0; i < group.length; i++) {
      group[i].setAttribute('aria-pressed', group[i] === btn ? 'true' : 'false');
    }
    render();
  }

  for (var i = 0; i < options.length; i++) {
    (function (btn) {
      btn.addEventListener('click', function () {
        select(btn.getAttribute('data-quiz-q'), btn.getAttribute('data-quiz-value'), btn);
      });
    })(options[i]);
  }

  if (resetEl) {
    resetEl.addEventListener('click', function () {
      state = { 1: null, 2: null, 3: null };
      for (var k = 0; k < options.length; k++) options[k].setAttribute('aria-pressed', 'false');
      resultEl.innerHTML = '';
      resultEl.hidden = true;
      resetEl.hidden = true;
    });
  }
})();
