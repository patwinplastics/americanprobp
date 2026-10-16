/* Homepage phone enhancements: swipe dots + footer accordions. */
(function () {
  var mq = window.matchMedia('(max-width: 720px)');

  var ARROW_L = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>';
  var ARROW_R = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';

  function addDots(track) {
    if (track.__mDots) return;
    var items = Array.prototype.slice.call(track.children);
    if (items.length < 2) return;
    var pager = document.createElement('div');
    pager.className = 'm-pager';
    var prev = document.createElement('button');
    prev.type = 'button'; prev.className = 'm-arrow m-arrow--prev';
    prev.setAttribute('aria-label', 'Previous'); prev.innerHTML = ARROW_L;
    var next = document.createElement('button');
    next.type = 'button'; next.className = 'm-arrow m-arrow--next';
    next.setAttribute('aria-label', 'Next'); next.innerHTML = ARROW_R;
    var dots = document.createElement('div');
    dots.className = 'm-dots'; dots.setAttribute('aria-hidden', 'true');
    items.forEach(function () { dots.appendChild(document.createElement('span')); });
    pager.appendChild(prev); pager.appendChild(dots); pager.appendChild(next);
    track.insertAdjacentElement('afterend', pager);
    track.__mDots = pager;
    var current = 0;
    function step() { return items.length > 1 ? items[1].offsetLeft - items[0].offsetLeft : track.clientWidth; }
    function update() {
      var s = step();
      current = Math.max(0, Math.min(items.length - 1, Math.round(track.scrollLeft / (s || 1))));
      Array.prototype.forEach.call(dots.children, function (d, i) { d.classList.toggle('is-active', i === current); });
      prev.disabled = current === 0;
      next.disabled = current === items.length - 1;
      dots.setAttribute('aria-label', (current + 1) + ' of ' + items.length);
      fit();
    }
    function fit() {
      if (!mq.matches) { track.style.height = ''; return; }
      var cs = getComputedStyle(track);
      var h = items[current].offsetHeight + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      track.style.height = h + 'px';
    }
    window.addEventListener('resize', fit);
    window.addEventListener('load', fit);
    function go(i) {
      i = Math.max(0, Math.min(items.length - 1, i));
      track.scrollTo({ left: i * step(), behavior: 'smooth' });
    }
    prev.addEventListener('click', function () { go(current - 1); });
    next.addEventListener('click', function () { go(current + 1); });
    track.addEventListener('scroll', function () { window.requestAnimationFrame(update); }, { passive: true });
    update();
  }

  function scan() {
    if (!mq.matches) return;
    document.querySelectorAll('.home-main .m-track, #samples .kit-grid').forEach(addDots);
  }

  function initFooter() {
    var footer = document.querySelector('.site-footer');
    if (!footer) return;
    function apply() {
      footer.classList.toggle('footer-acc', mq.matches);
    }
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
    // Kit grid is re-rendered by sample-kits.js when a filter chip is tapped.
    var kits = document.querySelector('#samples [data-sample-kits]');
    if (kits && 'MutationObserver' in window) {
      new MutationObserver(function () { scan(); }).observe(kits, { childList: true, subtree: true });
    }
    mq.addEventListener ? mq.addEventListener('change', scan) : mq.addListener(scan);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
