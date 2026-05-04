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
  // Single clock: the CSS .hero-dot-fill animation IS the timer.
  // animationend on the active dot's fill triggers the slide advance,
  // so the progress bar and the slide change can never drift.
  (function initHeroSlider() {
    const slider = document.querySelector('[data-hero-slider]');
    if (!slider) return;
    const slides = Array.from(slider.querySelectorAll('.hero-slide'));
    const dots = Array.from(slider.querySelectorAll('.hero-dot'));
    if (slides.length < 2 || dots.length !== slides.length) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let current = slides.findIndex((s) => s.classList.contains('is-active'));
    if (current < 0) current = 0;
    // Once the user manually picks a slide, stop auto-advance for the rest of the session.
    let userTookControl = false;

    /* ----- Adaptive height ---------------------------------------------
       The two slides have very different natural heights: the American Pro
       slide is short (headline + 2 CTAs), the TrueGrain slide is tall (6
       swatches + 3 stat blocks + 2 CTAs). Without this logic the slider was
       sized to the taller slide on both, leaving a big empty deck-photo
       expanse below the short slide.

       Strategy: measure each slide's actual content wrapper (.hero-inner /
       .tg-feature-inner) and add the slide's own padding so the dot rail
       still has its reserved space. Then set slider.style.height = px on
       the active slide and let the CSS height transition animate the
       grow/shrink. */
    function measureSlide(slide) {
      if (!slide) return 0;
      // Pick the actual content container so absolutely-positioned background
      // photos (.hero-image / .tg-feature-image) don't poison the measurement.
      const inner = slide.querySelector('.hero-inner, .tg-feature-inner');
      if (!inner) return slide.scrollHeight;
      const innerStyles = window.getComputedStyle(inner);
      const slideStyles = window.getComputedStyle(slide);
      // inner.scrollHeight already includes the inner element's own padding,
      // so we only add the *slide-level* padding (which reserves the dot rail).
      const slidePadTop = parseFloat(slideStyles.paddingTop) || 0;
      const slidePadBottom = parseFloat(slideStyles.paddingBottom) || 0;
      // Inner's vertical margins (rare, but be safe).
      const innerMarginTop = parseFloat(innerStyles.marginTop) || 0;
      const innerMarginBottom = parseFloat(innerStyles.marginBottom) || 0;
      return Math.ceil(
        inner.scrollHeight +
        slidePadTop + slidePadBottom +
        innerMarginTop + innerMarginBottom
      );
    }

    function applyHeight() {
      const active = slides[current];
      if (!active) return;
      const h = measureSlide(active);
      if (h > 0) slider.style.height = h + 'px';
    }

    function restartFill(fillEl) {
      // Clear any inline freeze from a prior pause/lock and restart the CSS animation cleanly.
      fillEl.style.animation = 'none';
      fillEl.style.width = '';
      // force reflow so removing + re-adding the animation actually replays it
      // eslint-disable-next-line no-unused-expressions
      fillEl.offsetWidth;
      fillEl.style.animation = '';
    }

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
        const fill = dot.querySelector('.hero-dot-fill');
        if (!fill) return;
        if (active) {
          // Active dot: replay the progress animation from 0
          restartFill(fill);
        } else {
          // Inactive dots: ensure no stale animation or width hangs around
          fill.style.animation = 'none';
          fill.style.width = '0';
        }
      });
      current = next;
      // Resize the slider to match the new active slide's content height.
      // Runs after the active class swap so measurement uses the right slide.
      applyHeight();
    }

    function pause() {
      slider.classList.add('is-paused');
    }
    function resume() {
      if (userTookControl) return;
      slider.classList.remove('is-paused');
    }

    function lockToManual() {
      userTookControl = true;
      slider.classList.add('is-manual');
      // Freeze every fill: active stays full, others empty, no animation.
      dots.forEach((d) => {
        const fill = d.querySelector('.hero-dot-fill');
        if (!fill) return;
        fill.style.animation = 'none';
        fill.style.width = d.classList.contains('is-active') ? '100%' : '0';
      });
    }

    // The single clock: when the active dot's fill animation finishes one cycle, advance.
    // We attach to every fill and gate on .is-active so the listener survives slide changes.
    dots.forEach((dot) => {
      const fill = dot.querySelector('.hero-dot-fill');
      if (!fill) return;
      fill.addEventListener('animationend', (e) => {
        if (e.animationName !== 'hero-dot-progress') return;
        if (userTookControl) return;
        if (reduceMotion) return;
        if (!dot.classList.contains('is-active')) return;
        if (slider.classList.contains('is-paused')) return;
        setActive(current + 1);
      });
    });

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

    // Prev / Next arrow buttons. Same lock semantics as dot click and swipe.
    const arrows = slider.querySelectorAll('[data-hero-arrow]');
    arrows.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation(); // don't let it count as a swipe target click
        const dir = btn.getAttribute('data-hero-arrow');
        setActive(dir === 'next' ? current + 1 : current - 1);
        lockToManual();
      });
    });

    slider.addEventListener('mouseenter', pause);
    slider.addEventListener('mouseleave', resume);
    slider.addEventListener('focusin', pause);
    slider.addEventListener('focusout', (e) => {
      if (!slider.contains(e.relatedTarget)) resume();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) pause(); else resume();
    });

    // Touch swipe on mobile (and any pointer-coarse device).
    // Pointer Events fire after iOS native gesture arbitration, bubble cleanly past links and buttons,
    // and give us a single API that works for touch, pen, and mouse-drag. Pointer-events listeners
    // see gestures even when the user starts on an <a>, <button>, or <img> inside the slide, which
    // raw touchstart on the slider often does NOT reach because iOS preview/long-press/native edge
    // gestures will swallow the touch sequence before it bubbles.
    //
    // We capture-phase so we win against any child <a>/<button> that calls stopPropagation.
    // pointermove with a horizontal commit toggles touch-action to none mid-gesture so the browser
    // stops trying to scroll once we're sure the user is swiping.
    // The first qualifying swipe locks the slider for the rest of the session, same as a dot click.
    (function attachSwipe() {
      const SWIPE_PX = 40;            // minimum horizontal distance to count as a swipe
      const HORIZONTAL_RATIO = 1.2;   // |dx| must beat |dy| by this factor (rules out scroll gestures)
      const COMMIT_PX = 12;           // once horizontal travel passes this, we own the gesture
      let startX = 0, startY = 0, activeId = null, committed = false;

      const onDown = (e) => {
        // Only primary single-pointer interactions; ignore multi-touch (pinch/zoom).
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (activeId !== null) return;
        activeId = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
        committed = false;
      };

      const onMove = (e) => {
        if (e.pointerId !== activeId) return;
        if (committed) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.abs(dx) > COMMIT_PX && Math.abs(dx) > Math.abs(dy) * HORIZONTAL_RATIO) {
          committed = true;
          slider.style.touchAction = 'none'; // own the rest of the gesture
          // capture so we still get pointerup even if finger leaves the slider bounds
          try { slider.setPointerCapture(e.pointerId); } catch (_) {}
        }
      };

      const finish = (e) => {
        if (e.pointerId !== activeId) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        activeId = null;
        committed = false;
        slider.style.touchAction = ''; // restore CSS default for next gesture
        if (Math.abs(dx) < SWIPE_PX) return;
        if (Math.abs(dx) < Math.abs(dy) * HORIZONTAL_RATIO) return;
        // dx > 0 = swipe right = previous slide. dx < 0 = swipe left = next slide.
        if (dx < 0) setActive(current + 1);
        else        setActive(current - 1);
        lockToManual();
      };

      const cancel = (e) => {
        if (e.pointerId !== activeId) return;
        activeId = null;
        committed = false;
        slider.style.touchAction = '';
      };

      // Capture phase so child link/button click handlers can't preempt us.
      // setPointerCapture (called on commit) guarantees pointerup/cancel fire on the slider
      // even if the finger leaves the slider bounds, so we don't need a window-level fallback.
      slider.addEventListener('pointerdown', onDown, true);
      slider.addEventListener('pointermove', onMove, true);
      slider.addEventListener('pointerup',   finish, true);
      slider.addEventListener('pointercancel', cancel, true);
    })();

    // Kick off
    if (reduceMotion) {
      // No animation, no auto-advance: just show slide 0 statically.
      setActive(current);
      lockToManual();
    } else {
      setActive(current);
    }

    /* ----- Re-measure on layout changes -----------------------------
       Initial measurement may be off because web fonts are still loading or
       hero images haven't decoded yet. Re-run applyHeight when each of
       those resolves, when the viewport resizes (debounced so a drag-resize
       on desktop doesn't thrash), and once on the next animation frame so
       we catch any final layout pass after first paint. */
    requestAnimationFrame(applyHeight);

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(applyHeight, 150);
    });

    if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
      document.fonts.ready.then(applyHeight).catch(() => {});
    }

    slider.querySelectorAll('img').forEach((img) => {
      if (img.complete && img.naturalHeight !== 0) return;
      img.addEventListener('load', applyHeight, { once: true });
      img.addEventListener('error', applyHeight, { once: true });
    });
  })();
})();
