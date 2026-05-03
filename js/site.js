/* American Pro site behaviors */
(function () {
  // Sticky header shadow on scroll
  const header = document.querySelector('.site-header');
  if (header) {
    const setScrolled = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
    setScrolled();
    window.addEventListener('scroll', setScrolled, { passive: true });
  }

  // Mobile menu toggle
  const menuToggle = document.querySelector('[data-menu-toggle]');
  const mobileMenu = document.querySelector('.mobile-menu');
  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener('click', () => {
      const open = mobileMenu.classList.toggle('is-open');
      menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.style.overflow = open ? 'hidden' : '';
    });
    mobileMenu.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') {
        mobileMenu.classList.remove('is-open');
        menuToggle.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      }
    });
  }

  // Reveal-on-scroll. The CSS only hides items when <html> has the
  // `reveal-ready` class, so a JS/observer failure leaves content visible.
  const items = document.querySelectorAll('[data-reveal]');
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (items.length && 'IntersectionObserver' in window && !reduceMotion) {
    document.documentElement.classList.add('reveal-ready');
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -60px 0px', threshold: 0.05 }
    );
    items.forEach((el) => io.observe(el));
    // Safety net: if anything still hasn't revealed after 1.5s (e.g. lazy
    // images on slow networks delaying paint), force-reveal everything.
    setTimeout(() => items.forEach((el) => el.classList.add('is-visible')), 1500);
  } else {
    items.forEach((el) => el.classList.add('is-visible'));
  }

  // Form: prevent default, show success state
  document.querySelectorAll('form[data-demo]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const card = form.closest('.form-card');
      if (!card) return;
      card.innerHTML = `
        <div style="text-align:center; padding: 2rem 0;">
          <div style="width:64px;height:64px;border-radius:50%;background:var(--color-success);display:flex;align-items:center;justify-content:center;margin:0 auto 1.5rem;color:#fff;">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h3 style="font-family:var(--font-display);font-size:var(--text-xl);margin-bottom:.75rem;">Thank you</h3>
          <p style="color:var(--color-text-muted);max-width:36ch;margin:0 auto;">We received your request. A specialist will reach out within one business day with the next steps.</p>
        </div>
      `;
    });
  });

  // Active nav link by current path
  const path = location.pathname.replace(/\/+$/, '') || '/';
  document.querySelectorAll('.nav a').forEach((a) => {
    const href = a.getAttribute('href').replace(/\/+$/, '') || '/';
    if (href === path) a.classList.add('is-active');
  });
})();
