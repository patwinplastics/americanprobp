/* Homepage phone enhancements: swipe dots + footer accordions. */
(function () {
  var mq = window.matchMedia('(max-width: 720px)');

  function addDots(track) {
    if (track.__mDots) return;
    var items = Array.prototype.slice.call(track.children);
    if (items.length < 2) return;
    var dots = document.createElement('div');
    dots.className = 'm-dots';
    dots.setAttribute('aria-hidden', 'true');
    items.forEach(function () { dots.appendChild(document.createElement('span')); });
    track.insertAdjacentElement('afterend', dots);
    track.__mDots = dots;
    function update() {
      var left = track.scrollLeft, best = 0, bestD = Infinity;
      items.forEach(function (el, i) {
        var d = Math.abs(el.offsetLeft - track.offsetLeft - left - parseFloat(getComputedStyle(track).paddingLeft || 0));
        if (d < bestD) { bestD = d; best = i; }
      });
      if (track.scrollLeft + track.clientWidth >= track.scrollWidth - 4) best = items.length - 1;
      Array.prototype.forEach.call(dots.children, function (s, i) { s.classList.toggle('is-active', i === best); });
    }
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
