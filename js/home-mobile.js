/* Homepage phone enhancements: swipe carousels + footer accordions. */
(function () {
  var mq = window.matchMedia('(max-width: 720px)');

  var ARROW_L = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>';
  var ARROW_R = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';

  function initCarousel(track) {
    if (track.__mCarousel) return;
    var items = Array.prototype.slice.call(track.children);
    if (items.length < 2) return;
    track.__mCarousel = true;
    track.classList.add('m-swipe');

    var pager = document.createElement('div');
    pager.className = 'm-pager';
    var prev = document.createElement('button');
    prev.type = 'button'; prev.className = 'm-arrow m-arrow--prev';
    prev.setAttribute('aria-label', 'Previous'); prev.innerHTML = ARROW_L;
    var next = document.createElement('button');
    next.type = 'button'; next.className = 'm-arrow m-arrow--next';
    next.setAttribute('aria-label', 'Next'); next.innerHTML = ARROW_R;
    var dots = document.createElement('div');
    dots.className = 'm-dots';
    items.forEach(function () { dots.appendChild(document.createElement('span')); });
    pager.appendChild(prev); pager.appendChild(dots); pager.appendChild(next);
    track.insertAdjacentElement('afterend', pager);

    var index = 0;
    var last = items.length - 1;

    function step() { return items[1].offsetLeft - items[0].offsetLeft; }
    function setX(px) { track.style.setProperty('--m-x', px + 'px'); }
    function fit() {
      if (!mq.matches) { track.style.height = ''; return; }
      var cs = getComputedStyle(track);
      track.style.height = (items[index].offsetHeight + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)) + 'px';
    }
    function render() {
      setX(-index * step());
      Array.prototype.forEach.call(dots.children, function (d, i) { d.classList.toggle('is-active', i === index); });
      prev.disabled = index === 0;
      next.disabled = index === last;
      dots.setAttribute('aria-label', (index + 1) + ' of ' + items.length);
      fit();
    }
    function go(i) { index = Math.max(0, Math.min(last, i)); render(); }

    prev.addEventListener('click', function () { go(index - 1); });
    next.addEventListener('click', function () { go(index + 1); });

    /* Touch / pointer drag with axis lock. Vertical gestures go to the page. */
    var startX = 0, startY = 0, dx = 0, t0 = 0, samples = [], active = false, axis = null, moved = false;
    function onDown(e) {
      if (!mq.matches) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      active = true; axis = null; moved = false; dx = 0;
      startX = e.clientX; startY = e.clientY; t0 = Date.now(); samples = [[t0, e.clientX]];
    }
    function onMove(e) {
      if (!active) return;
      var mx = e.clientX - startX, my = e.clientY - startY;
      if (!axis) {
        if (Math.abs(mx) < 6 && Math.abs(my) < 6) return;
        axis = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
        if (axis === 'x') {
          track.classList.add('is-dragging');
          if (e.pointerType === 'mouse') { try { track.setPointerCapture(e.pointerId); } catch (err) {} }
        }
      }
      if (axis !== 'x') return;
      moved = true;
      dx = mx;
      var now = Date.now();
      samples.push([now, e.clientX]);
      while (samples.length > 2 && now - samples[0][0] > 120) samples.shift();
      /* Resist past the first and last card */
      if ((index === 0 && dx > 0) || (index === last && dx < 0)) dx = dx * 0.3;
      setX(-index * step() + dx);
    }
    function onUp() {
      if (!active) return;
      active = false;
      track.classList.remove('is-dragging');
      if (axis !== 'x') return;
      var w = step();
      /* Release velocity over the last ~120ms, px per ms */
      var a = samples[0], b = samples[samples.length - 1];
      var v = Math.abs(b[1] - a[1]) / Math.max(16, b[0] - a[0]);
      var target = index;
      var far = Math.min(60, Math.max(36, w * 0.14));
      if (dx < -far || (dx < -20 && v > 0.3)) target = index + 1;
      else if (dx > far || (dx > 20 && v > 0.3)) target = index - 1;
      go(target);
    }
    track.addEventListener('pointerdown', onDown);
    track.addEventListener('pointermove', onMove);
    track.addEventListener('pointerup', onUp);
    track.addEventListener('pointercancel', onUp);

    /* A drag should never count as a tap on a card link */
    track.addEventListener('click', function (e) {
      if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; }
    }, true);

    /* Keyboard: focusing a card brings it into view */
    items.forEach(function (el, i) {
      el.addEventListener('focusin', function () { if (mq.matches && i !== index) go(i); });
    });

    window.addEventListener('resize', render);
    window.addEventListener('load', fit);
    items.forEach(function (el) {
      el.querySelectorAll('img').forEach(function (img) {
        img.setAttribute('draggable', 'false');
        if (!img.complete) img.addEventListener('load', fit, { once: true });
      });
    });
    render();
  }

  function scan() {
    if (!mq.matches) return;
    document.querySelectorAll('.home-main .m-track, #samples .kit-grid').forEach(initCarousel);
  }

  function initFooter() {
    var footer = document.querySelector('.site-footer');
    if (!footer) return;
    function apply() { footer.classList.toggle('footer-acc', mq.matches); }
    footer.querySelectorAll('.footer-col h4').forEach(function (h) {
      h.setAttribute('role', 'button');
      h.setAttribute('tabindex', '0');
      h.setAttribute('aria-expanded', 'false');
      function toggle() {
        if (!footer.classList.contains('footer-acc')) return;
        var col = h.parentElement, open = !col.classList.contains('is-open');
        col.classList.toggle('is-open', open);
        h.setAttribute('aria-expanded', String(open));
      }
      h.addEventListener('click', toggle);
      h.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });
    });
    apply();
    mq.addEventListener ? mq.addEventListener('change', apply) : mq.addListener(apply);
  }

  function init() {
    scan();
    initFooter();
    /* sample-kits.js re-renders the kit grid when a filter chip is tapped */
    var kits = document.querySelector('#samples [data-sample-kits]');
    if (kits && 'MutationObserver' in window) {
      new MutationObserver(scan).observe(kits, { childList: true, subtree: true });
    }
    mq.addEventListener ? mq.addEventListener('change', scan) : mq.addListener(scan);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
