// Shared header/footer partials injected client-side for the interior pages.
// Keeps prototypes DRY without a build step.
(function () {
  // Resolve project root relative to the including HTML page so absolute
  // paths in the injected markup also work when this site is mounted under
  // a sub-path (preview proxy, Wix Studio sub-page, GitHub Pages, etc.).
  //
  // Strategy: locate this script's own <script src="..."> URL and trim
  // the trailing 'pages/_partials.js...' from it to derive the project
  // root. This is robust to arbitrary proxy depth (the deploy preview
  // serves the site under /sites/proxy/<token>/web/.../americanprobp/),
  // unlike counting location.pathname segments which over-walks on the
  // preview proxy and breaks logo + thumb image paths.
  function _base() {
    try {
      const cs = document.currentScript;
      const src = cs && cs.src ? cs.src : '';
      // src looks like .../americanprobp/pages/_partials.js?v=5-staging
      const m = src.match(/^(.*\/)pages\/_partials\.js(?:\?.*)?$/);
      if (m) return m[1];
    } catch (e) { /* fall through */ }
    // Fallback: walk up from location.pathname (works on real domain root).
    const path = location.pathname.replace(/\/[^/]*$/, '/');
    const segments = path.split('/').filter(Boolean);
    if (segments.length === 0) return './';
    return '../'.repeat(segments.length);
  }
  const B = _base();

  // Single source of truth for the Products mega-menu. Used by both the
  // desktop dropdown panel and the mobile drawer accordion so the two stay
  // in sync. Each card has a thumb image, a name, and a one-line tagline.
  const PRODUCTS = [
    {
      name: 'TrueGrain Deck\u2122',
      tagline: 'Wood to touch, PVC to last. Six hardwood-inspired colors.',
      href: B + 'pages/truegrain-deck.html',
      img: B + 'images/truegrain_swatches/tropical_walnut.jpg',
      alt: 'TrueGrain Deck wood-grain PVC deck board, Tropical Walnut',
    },
    {
      name: 'InvisiClip\u2122',
      tagline: 'Hidden hardware. Honest deck.',
      href: B + 'pages/invisiclip.html',
      img: B + 'images/invisiclip/clip_macro_hero.png',
      alt: 'InvisiClip hidden fastener clip on stainless rail',
    },
    {
      name: 'Legacy PVC Decking',
      tagline: 'The workhorse. Same chemistry as TrueGrain, classic solid colors.',
      href: B + 'pages/legacy-pvc-decking.html',
      img: B + 'images/deck_swatches/driftwood.jpg',
      alt: 'American Pro Legacy PVC decking, Driftwood color',
    },
    {
      name: 'Porch Flooring',
      tagline: 'Tongue-and-groove cellular PVC, slip-resistant.',
      href: B + 'pages/porch.html',
      img: B + 'images/product_porch.jpg',
      alt: 'PVC tongue and groove porch flooring',
    },
    {
      name: 'Mouldings',
      tagline: 'Crowns, sills, brick mould, casing, and more.',
      href: B + 'pages/mouldings.html',
      img: B + 'images/product_moulding.jpg',
      alt: 'PVC architectural moulding profiles',
    },
  ];

  function productCardsHTML() {
    return PRODUCTS.map(function (p) {
      return (
        '<a class="mega-card" href="' + p.href + '" data-product-link>' +
          '<span class="mega-card__media">' +
            '<img src="' + p.img + '" alt="" loading="lazy" decoding="async" />' +
          '</span>' +
          '<span class="mega-card__body">' +
            '<span class="mega-card__name">' + p.name + '</span>' +
            '<span class="mega-card__tag">' + p.tagline + '</span>' +
          '</span>' +
        '</a>'
      );
    }).join('');
  }

  function mobileProductLinksHTML() {
    return PRODUCTS.map(function (p) {
      return '<li><a href="' + p.href + '" data-product-link>' + p.name + '</a></li>';
    }).join('');
  }

  const HEADER = `
  <header class="site-header">
    <div class="container header-inner">
      <a href="${B}index.html" class="logo" aria-label="American Pro Building Products, Home">
        <img src="${B}images/logo/americanpro-header.png" alt="American Pro Building Products" class="logo-img" width="660" height="306"/>
      </a>
      <nav class="nav" aria-label="Primary">
        <div class="nav-products" data-mega>
          <button type="button" class="nav-products-trigger" data-mega-trigger aria-haspopup="true" aria-expanded="false" aria-controls="mega-products">
            Products
            <svg class="nav-products-caret" width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="1 1 5 5 9 1"/></svg>
          </button>
          <div class="mega-panel" id="mega-products" data-mega-panel role="menu" aria-label="Products" hidden>
            <div class="container">
              <div class="mega-grid">
                ${productCardsHTML()}
              </div>
            </div>
          </div>
        </div>
        <a href="https://deckvisualizer.truegraindeck.com/" target="_blank" rel="noopener" class="nav-external nav-vis">Deck Visualizer<span aria-hidden="true" class="nav-external-arrow">↗</span></a>
        <a href="${B}pages/inspiration.html">Inspiration</a>
        <a href="${B}pages/blog/index.html">Blog</a>
        <a href="${B}pages/about.html">About</a>
      </nav>
      <div class="header-actions">
        <a href="tel:18774426776" class="header-phone">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          1-877-442-6776
        </a>
        <a href="${B}index.html#samples" class="btn btn--primary">Request Samples</a>
        <button class="menu-toggle" data-menu-toggle aria-label="Open menu" aria-expanded="false">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
      </div>
    </div>
    <div class="mobile-menu">
      <ul>
        <li class="mobile-products" data-mobile-products>
          <button type="button" class="mobile-products-trigger" data-mobile-products-trigger aria-expanded="false">
            Products
            <svg class="mobile-products-caret" width="12" height="8" viewBox="0 0 12 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="1 1 6 6 11 1"/></svg>
          </button>
          <ul class="mobile-products-list" data-mobile-products-list>
            ${mobileProductLinksHTML()}
          </ul>
        </li>
        <li><a href="https://deckvisualizer.truegraindeck.com/" target="_blank" rel="noopener">Deck Visualizer <span aria-hidden="true">↗</span></a></li>
        <li><a href="${B}pages/inspiration.html">Inspiration</a></li>
        <li><a href="${B}pages/blog/index.html">Blog</a></li>
        <li><a href="${B}pages/about.html">About</a></li>
      </ul>
      <div class="mobile-cta">
        <a href="${B}index.html#samples" class="btn btn--primary">Request Samples</a>
        <a href="tel:18774426776" class="btn btn--ghost">Call 1-877-442-6776</a>
      </div>
    </div>
  </header>`;

  const FOOTER = `
  <footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <a href="${B}index.html" class="logo">
            <img src="${B}images/logo/americanpro-header-white.png" alt="American Pro Building Products" class="logo-img logo-img--footer" width="660" height="306"/>
          </a>
          <p>American-made PVC building products. A division of Patwin Plastics, manufacturing precision profiles in the USA since 1971.</p>
        </div>
        <div class="footer-col">
          <h4>Products</h4>
          <ul>
            <li><a href="${B}pages/truegrain-deck.html">TrueGrain Deck\u2122</a></li>
            <li><a href="${B}pages/invisiclip.html">InvisiClip\u2122 Hidden Fastener</a></li>
            <li><a href="${B}pages/legacy-pvc-decking.html">Legacy PVC Decking</a></li>
            <li><a href="${B}pages/porch.html">Porch Flooring</a></li>
            <li><a href="${B}pages/mouldings.html">Mouldings</a></li>
            <li><a href="https://deckvisualizer.truegraindeck.com/" target="_blank" rel="noopener">Deck Visualizer <span aria-hidden="true">↗</span></a></li>
            <li><a href="${B}pages/inspiration.html">Inspiration Gallery</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>Company</h4>
          <ul>
            <li><a href="${B}pages/american-pro.html">About American Pro</a></li>
            <li><a href="${B}pages/about.html">About Patwin Plastics</a></li>
            <li><a href="${B}pages/blog/index.html">Blog</a></li>
            <li><a href="${B}pages/contact.html">Contact</a></li>
            <li><a href="${B}index.html#samples">Request Samples</a></li>
            <li><a href="${B}pages/contact.html">Get a Quote</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>Get In Touch</h4>
          <ul>
            <li><a href="tel:18774426776">1-877-442-6776</a></li>
            <li><a href="mailto:sales@americanprobp.com">sales@americanprobp.com</a></li>
            <li style="color:rgba(255,255,255,0.55); font-size:var(--text-xs); margin-top: var(--space-2);">Mon to Fri, 8am to 4pm ET</li>
          </ul>
        </div>
      </div>
      <div class="footer-bar">
        <span>\u00a9 2026 American Pro Building Products \u00b7 A Patwin Plastics Brand</span>
        <div class="footer-social">
          <a href="https://www.facebook.com/americanprobuilding/" target="_blank" rel="noopener" aria-label="American Pro on Facebook"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 8H6v4h3v12h5V12h3.642L18 8h-4V6.333C14 5.378 14.192 5 15.115 5H18V0h-3.808C10.596 0 9 1.583 9 4.615V8z"/></svg></a>
        </div>
      </div>
    </div>
  </footer>`;

  document.querySelectorAll('[data-include="header"]').forEach((el) => (el.outerHTML = HEADER));
  document.querySelectorAll('[data-include="footer"]').forEach((el) => (el.outerHTML = FOOTER));
})();
