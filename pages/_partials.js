// Shared header/footer partials injected client-side for the interior pages.
// Keeps prototypes DRY without a build step.
(function () {
  // Resolve project root relative to the including HTML page so absolute
  // paths in the injected markup also work when this site is mounted under
  // a sub-path (preview proxy, Wix Studio sub-page, GitHub Pages, etc.).
  function _base() {
    const path = location.pathname;
    // If we're inside /pages/, root is one level up.
    return path.includes('/pages/') ? '../' : './';
  }
  const B = _base();

  const HEADER = `
  <header class="site-header">
    <div class="container header-inner">
      <a href="${B}index.html" class="logo" aria-label="American Pro Building Products, Home">
        <img src="${B}images/logo/americanpro-header.png" alt="American Pro Building Products" class="logo-img" width="431" height="200"/>
      </a>
      <nav class="nav" aria-label="Primary">
        <a href="${B}pages/decking.html">PVC Decking</a>
        <a href="${B}pages/porch.html">Porch Flooring</a>
        <a href="${B}pages/mouldings.html">Mouldings</a>
        <a href="${B}pages/inspiration.html">Inspiration</a>
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
        <li><a href="${B}pages/decking.html">PVC Decking</a></li>
        <li><a href="${B}pages/porch.html">Porch Flooring</a></li>
        <li><a href="${B}pages/mouldings.html">Mouldings</a></li>
        <li><a href="${B}pages/inspiration.html">Inspiration</a></li>
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
            <img src="${B}images/logo/americanpro-header-white.png" alt="American Pro Building Products" class="logo-img logo-img--footer" width="431" height="200"/>
          </a>
          <p>American-made PVC building products. A division of Patwin Plastics, manufacturing precision profiles in the USA since 1972.</p>
        </div>
        <div class="footer-col">
          <h4>Products</h4>
          <ul>
            <li><a href="${B}pages/decking.html">PVC Decking</a></li>
            <li><a href="${B}pages/porch.html">Porch Flooring</a></li>
            <li><a href="${B}pages/mouldings.html">Mouldings</a></li>
            <li><a href="${B}pages/inspiration.html">Inspiration Gallery</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>Company</h4>
          <ul>
            <li><a href="${B}pages/about.html">About Us</a></li>
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
            <li style="color:rgba(255,255,255,0.55); font-size:var(--text-xs); margin-top: var(--space-2);">Mon–Fri, 8am–5pm ET</li>
          </ul>
        </div>
      </div>
      <div class="footer-bar">
        <span>© 2026 American Pro Building Products · A Patwin Plastics Brand</span>
        <div class="footer-social">
          <a href="https://www.facebook.com/" aria-label="Facebook"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 8H6v4h3v12h5V12h3.642L18 8h-4V6.333C14 5.378 14.192 5 15.115 5H18V0h-3.808C10.596 0 9 1.583 9 4.615V8z"/></svg></a>
          <a href="https://www.instagram.com/" aria-label="Instagram"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg></a>
        </div>
      </div>
    </div>
  </footer>`;

  document.querySelectorAll('[data-include="header"]').forEach((el) => (el.outerHTML = HEADER));
  document.querySelectorAll('[data-include="footer"]').forEach((el) => (el.outerHTML = FOOTER));
})();
