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

  // Formspree form submit handler.
  // Posts via fetch (so the page does not flash a Formspree-hosted screen),
  // then redirects to the form's _next URL on success. If fetch fails for any
  // reason (network, CORS, Formspree outage), the form is allowed to submit
  // natively as a hard fallback so the lead is never silently lost.
  document.querySelectorAll('form[data-formspree]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      // Honeypot: if the hidden _gotcha field has any value, the submitter is
      // a bot. Pretend success, do nothing.
      const honey = form.querySelector('input[name="_gotcha"]');
      if (honey && honey.value) {
        e.preventDefault();
        return;
      }

      // Only intercept if we have fetch. Otherwise let the browser submit
      // natively and Formspree will redirect via _next.
      if (typeof fetch !== 'function') return;

      e.preventDefault();

      const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
      const originalLabel = submitBtn ? submitBtn.textContent : null;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending…';
      }

      const data = new FormData(form);
      const next = form.querySelector('input[name="_next"]');
      const nextUrl = next ? next.value : null;

      try {
        const res = await fetch(form.action, {
          method: form.method || 'POST',
          headers: { Accept: 'application/json' },
          body: data,
        });
        if (res.ok) {
          if (nextUrl) {
            window.location.href = nextUrl;
          } else {
            renderInlineThanks(form);
          }
          return;
        }
        // Formspree returned 4xx/5xx. Show an error inline.
        let detail = '';
        try {
          const j = await res.json();
          if (j && j.errors && j.errors.length) {
            detail = j.errors.map((er) => er.message).join(' ');
          }
        } catch (_) {}
        showFormError(form, detail || 'We could not submit your request. Please try again, or call 1-877-442-6776.');
      } catch (_) {
        // Network failure. Fall back to native submit so the lead still lands
        // in Formspree and the user sees the redirect.
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalLabel;
        }
        form.submit();
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      }
    });
  });

  function renderInlineThanks(form) {
    const card = form.closest('.form-card') || form;
    card.innerHTML = `
      <div style="text-align:center; padding: 2rem 0;">
        <div style="width:64px;height:64px;border-radius:50%;background:var(--color-success);display:flex;align-items:center;justify-content:center;margin:0 auto 1.5rem;color:#fff;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h3 style="font-family:var(--font-display);font-size:var(--text-xl);margin-bottom:.75rem;">Thank you</h3>
        <p style="color:var(--color-text-muted);max-width:36ch;margin:0 auto;">We received your request. A specialist will reach out within one business day.</p>
      </div>
    `;
  }

  function showFormError(form, message) {
    let banner = form.querySelector('.form-error-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'form-error-banner';
      banner.setAttribute('role', 'alert');
      banner.style.cssText = 'background:#fdecea;color:#a01b1b;border:1px solid #f3c2c2;border-radius:var(--radius-md);padding:.75rem 1rem;margin:0 0 1rem;font-size:var(--text-sm);';
      form.insertBefore(banner, form.firstChild);
    }
    banner.textContent = message;
  }

  // Active nav link by current path
  const path = location.pathname.replace(/\/+$/, '') || '/';
  document.querySelectorAll('.nav a').forEach((a) => {
    const href = a.getAttribute('href').replace(/\/+$/, '') || '/';
    if (href === path) a.classList.add('is-active');
  });

  // Hero crossfade slider
  (function initHeroSlider() {
    const slider = document.querySelector('[data-hero-slider]');
    if (!slider) return;
    const slides = Array.from(slider.querySelectorAll('.hero-slide'));
    const dots = Array.from(slider.querySelectorAll('.hero-dot'));
    if (slides.length < 2 || dots.length !== slides.length) return;

    const INTERVAL_MS = 11000;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let current = slides.findIndex((s) => s.classList.contains('is-active'));
    if (current < 0) current = 0;
    let timer = null;
    // Once the user manually picks a slide, stop auto-advance for the rest of the session.
    let userTookControl = false;

    function setActive(idx) {
      const next = ((idx % slides.length) + slides.length) % slides.length;
      slides.forEach((slide, i) => {
        const active = i === next;
        slide.classList.toggle('is-active', active);
        slide.setAttribute('aria-hidden', active ? 'false' : 'true');
      });
      dots.forEach((dot, i) => {
        const active = i === next;
        dot.classList.toggle('is-active', active);
        dot.setAttribute('aria-selected', active ? 'true' : 'false');
        dot.setAttribute('tabindex', active ? '0' : '-1');
      });
      // Restart progress fill animation by reflowing the active dot's fill node
      const activeFill = dots[next].querySelector('.hero-dot-fill');
      if (activeFill) {
        activeFill.style.animation = 'none';
        // force reflow
        // eslint-disable-next-line no-unused-expressions
        activeFill.offsetWidth;
        activeFill.style.animation = '';
      }
      current = next;
    }

    function advance() { setActive(current + 1); }

    function startTimer() {
      if (reduceMotion) return;
      if (userTookControl) return;
      stopTimer();
      timer = window.setInterval(advance, INTERVAL_MS);
      slider.classList.remove('is-paused');
    }
    function stopTimer() {
      if (timer) { window.clearInterval(timer); timer = null; }
    }
    function pauseTimer() {
      stopTimer();
      slider.classList.add('is-paused');
    }

    function lockToManual() {
      userTookControl = true;
      stopTimer();
      slider.classList.add('is-manual');
      // Freeze the progress fill so it doesn't keep animating after lock
      dots.forEach((d) => {
        const fill = d.querySelector('.hero-dot-fill');
        if (fill) {
          fill.style.animation = 'none';
          fill.style.width = d.classList.contains('is-active') ? '100%' : '0';
        }
      });
    }

    dots.forEach((dot, i) => {
      dot.addEventListener('click', () => {
        setActive(i);
        lockToManual();
      });
      dot.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); setActive(current + 1); lockToManual(); dots[current].focus(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); setActive(current - 1); lockToManual(); dots[current].focus(); }
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActive(i); lockToManual(); }
      });
    });

    slider.addEventListener('mouseenter', pauseTimer);
    slider.addEventListener('mouseleave', startTimer);
    slider.addEventListener('focusin', pauseTimer);
    slider.addEventListener('focusout', (e) => {
      if (!slider.contains(e.relatedTarget)) startTimer();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopTimer(); else startTimer();
    });

    // Kick off
    setActive(current);
    startTimer();
  })();
})();
