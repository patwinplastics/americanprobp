// Homepage "What are you replacing?" micro-quiz.
// Pure client-side, no form submit. Q2 picks the product line; Q1 refines the
// supporting copy. Renders one recommended product card with a reason and a
// direct "Get Free Samples" CTA. Vanilla JS, no deps.
(function () {
  var root = document.querySelector('[data-quiz]');
  if (!root) return;

  var resultEl = root.querySelector('[data-quiz-result]');
  var resetEl = root.querySelector('[data-quiz-reset]');
  var options = root.querySelectorAll('.quiz-option');

  var state = { 1: null, 2: null };

  var PRODUCTS = {
    truegrain: {
      name: 'TrueGrain Deck™',
      eyebrow: 'Your match',
      image: './images/truegrain_swatches/tropical_walnut.jpg',
      imageAlt: 'TrueGrain Deck Tropical Walnut PVC decking color swatch',
      url: './pages/truegrain-deck.html',
      samples: './pages/truegrain-deck.html#samples'
    },
    legacy: {
      name: 'Legacy PVC Decking',
      eyebrow: 'Your match',
      image: './images/deck_swatches/driftwood.jpg',
      imageAlt: 'Legacy PVC Decking Driftwood color swatch',
      url: './pages/legacy-pvc-decking.html',
      samples: './pages/legacy-pvc-decking.html#samples'
    }
  };

  // Q2 drives the product recommendation and the one-line reason.
  var Q2 = {
    look: { product: 'truegrain', reason: 'The most realistic hardwood look in capped PVC that never fades, rots, or splinters.' },
    heat: { product: 'truegrain', reason: 'Cool underfoot and capped on four sides to shrug off heat, fade, and weather.' },
    price: { product: 'legacy', reason: 'The value workhorse: the same PVC chemistry in classic solid colors at a friendlier price.' },
    ease:  { product: 'legacy', reason: 'Installer-friendly: top-fasten or hidden-clip ready and Pro Plug compatible.' }
  };

  // Q1 refines the supporting copy under the reason.
  var Q1 = {
    wood:     'No sanding, no sealing, no splinters, unlike the wood you’re replacing.',
    composite:'Runs cooler than composite, with no organic fill to fade, stain, or feed mold.',
    pvc:      'A clear realism and color upgrade over your existing PVC boards.',
    newbuild: 'Perfect for a new build: preview it on your plans in the 3D Deck Builder before you order.'
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function render() {
    if (!state[1] || !state[2]) return;

    var q2 = Q2[state[2]];
    var product = PRODUCTS[q2.product];
    var support = Q1[state[1]] || '';

    var vizCta = state[1] === 'newbuild'
      ? '<a class="btn btn--ghost" href="https://deckbuilder.americanprobp.com/" target="_blank" rel="noopener">Open the 3D Deck Builder <span aria-hidden="true">↗</span></a>'
      : '';

    resultEl.innerHTML =
      '<div class="quiz-result-card">' +
        '<span class="quiz-result-media"><img src="' + esc(product.image) + '" alt="' + esc(product.imageAlt) + '" loading="lazy" decoding="async" /></span>' +
        '<div class="quiz-result-copy">' +
          '<span class="quiz-result-eyebrow">' + esc(product.eyebrow) + '</span>' +
          '<h3 class="quiz-result-title">' + product.name + '</h3>' +
          '<p class="quiz-result-reason">' + esc(q2.reason) + '</p>' +
          '<p class="quiz-result-support">' + esc(support) + '</p>' +
          '<div class="quiz-result-actions">' +
            '<a class="btn btn--primary" href="' + esc(product.samples) + '" data-product-link>Get Free Samples</a>' +
            '<a class="btn btn--secondary" href="' + esc(product.url) + '">Explore ' + product.name + '</a>' +
            vizCta +
          '</div>' +
        '</div>' +
      '</div>';

    resultEl.hidden = false;
    resetEl.hidden = false;
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
      state = { 1: null, 2: null };
      for (var i = 0; i < options.length; i++) options[i].setAttribute('aria-pressed', 'false');
      resultEl.innerHTML = '';
      resultEl.hidden = true;
      resetEl.hidden = true;
    });
  }
})();
