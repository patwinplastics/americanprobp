/* Interactive House Hero
   Desktop (hover): hovering a zone, dot or chip glows the zone and previews
   its card. Clicking a zone goes straight to that product page. Clicking a
   dot or chip pins the card open.
   Touch: tapping a zone, dot or chip glows the zone and opens the card as a
   bottom sheet on phones. Buttons inside the card navigate.
   Coordinates use a 1200 x 675 space that matches the house image. */
(function () {
  'use strict';
  var hero = document.querySelector('[data-house-hero]');
  if (!hero) return;
  var main = hero.closest('[data-hero-mode]');
  if (main && main.getAttribute('data-hero-mode') !== 'house') return;

  var VB_W = 1200, VB_H = 675;
  var stage = hero.querySelector('[data-house-stage]');
  var card = hero.querySelector('[data-house-card]');
  var cardBody = hero.querySelector('[data-house-card-body]');
  var closeBtn = hero.querySelector('[data-house-close]');
  var hint = hero.querySelector('[data-house-hint]');
  var zones = {}, dots = {}, chips = {};
  hero.querySelectorAll('.house-zone').forEach(function (z) { zones[z.dataset.zone] = z; });
  hero.querySelectorAll('.house-dot').forEach(function (d) { dots[d.dataset.dot] = d; });
  hero.querySelectorAll('.house-chip').forEach(function (c) { chips[c.dataset.chip] = c; });

  // InvisiClip lives on the deck, so it lights the deck zone.
  var zoneFor = { deck: 'deck', invisiclip: 'deck', porch: 'porch', trim: 'trim' };
  var canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var phone = window.matchMedia('(max-width: 719px)');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var current = null, pinned = false, closeTimer = null, interacted = false, lastTrigger = null;

  /* ---------- Geometry: object-fit cover + right/center alignment ---------- */
  function map(x, y) {
    var W = stage.clientWidth, H = stage.clientHeight;
    var s = Math.max(W / VB_W, H / VB_H);
    return { x: (W - VB_W * s) + x * s, y: (H - VB_H * s) / 2 + y * s };
  }
  function layoutDots() {
    Object.keys(dots).forEach(function (k) {
      var d = dots[k], p = map(+d.dataset.x, +d.dataset.y);
      d.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px)';
      d._pos = p;
    });
    if (current) placeCard(current);
    hero.classList.add('is-ready');
  }

  function placeCard(key) {
    if (phone.matches) { card.style.left = ''; card.style.top = ''; return; }
    var p = dots[key]._pos, W = stage.clientWidth, H = stage.clientHeight;
    var cw = card.offsetWidth, ch = card.offsetHeight, gap = 30, pad = 16;
    var left = p.x + gap;
    if (left + cw > W - pad) left = p.x - gap - cw;   // flip to the left of the dot
    left = Math.max(pad, Math.min(left, W - cw - pad));
    var top = p.y - ch / 2;
    top = Math.max(pad, Math.min(top, H - ch - pad));
    card.style.left = left + 'px';
    card.style.top = top + 'px';
  }

  /* ---------- Highlight + card ---------- */
  function setActive(key) {
    Object.keys(zones).forEach(function (z) { zones[z].classList.toggle('is-active', key && zoneFor[key] === z); });
    Object.keys(dots).forEach(function (d) {
      var on = d === key;
      dots[d].classList.toggle('is-active', on);
      dots[d].setAttribute('aria-expanded', on && !card.hidden ? 'true' : 'false');
    });
    Object.keys(chips).forEach(function (c) { chips[c].classList.toggle('is-active', c === key); });
  }

  function open(key, opts) {
    opts = opts || {};
    clearTimeout(closeTimer);
    markInteracted();
    if (current !== key) {
      var tpl = document.getElementById('house-tpl-' + key);
      if (!tpl) return;
      cardBody.innerHTML = '';
      cardBody.appendChild(tpl.content.cloneNode(true));
      current = key;
      track(key, opts.pin ? 'open' : 'preview');
    }
    pinned = !!opts.pin || pinned && current === key;
    card.hidden = false;
    hero.classList.add('has-card');
    document.body.classList.add('house-card-open');
    setActive(key);
    placeCard(key);
    requestAnimationFrame(function () { card.classList.add('is-open'); placeCard(key); });
    if (opts.focus) {
      var first = card.querySelector('a, button:not([data-house-close])');
      if (first) first.focus({ preventScroll: true });
    }
  }

  function close(returnFocus) {
    clearTimeout(closeTimer);
    card.classList.remove('is-open');
    hero.classList.remove('has-card');
    document.body.classList.remove('house-card-open');
    var was = current;
    current = null; pinned = false;
    setActive(null);
    card.hidden = true;
    if (returnFocus && lastTrigger) lastTrigger.focus({ preventScroll: true });
    return was;
  }

  function scheduleClose() {
    if (pinned) return;
    clearTimeout(closeTimer);
    closeTimer = setTimeout(function () { close(false); }, 260);
  }

  function markInteracted() {
    if (interacted) return;
    interacted = true;
    hero.querySelectorAll('.is-preview').forEach(function (el) { el.classList.remove('is-preview'); });
    if (hint) hint.classList.add('is-gone');
  }

  function track(key, action) {
    try {
      if (window.fbq) window.fbq('trackCustom', 'HouseHotspot', { product: key, action: action });
      (window.dataLayer = window.dataLayer || []).push({ event: 'house_hotspot', product: key, action: action });
    } catch (e) { /* analytics never blocks UI */ }
  }

  /* ---------- Zones ---------- */
  Object.keys(zones).forEach(function (z) {
    var g = zones[z];
    if (canHover) {
      g.addEventListener('mouseenter', function () { if (!pinned || current === z) open(z); });
      g.addEventListener('mouseleave', scheduleClose);
      g.addEventListener('click', function () {
        track(z, 'zone-click');
        window.location.href = g.dataset.href;
      });
    } else {
      g.addEventListener('click', function (e) {
        e.stopPropagation();
        lastTrigger = dots[z];
        if (current === z && pinned) close(false); else open(z, { pin: true });
      });
    }
  });

  /* ---------- Dots + chips ---------- */
  function wireTrigger(el, key) {
    if (canHover) {
      el.addEventListener('mouseenter', function () { if (!pinned) open(key); });
      el.addEventListener('mouseleave', scheduleClose);
    }
    el.addEventListener('focus', function () { if (!pinned && canHover) open(key); });
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      lastTrigger = el;
      var keyboard = e.detail === 0;
      if (current === key && pinned) close(false);
      else open(key, { pin: true, focus: keyboard });
      if (phone.matches && el.classList.contains('house-chip')) {
        stage.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
      }
    });
  }
  Object.keys(dots).forEach(function (k) { wireTrigger(dots[k], k); });
  Object.keys(chips).forEach(function (k) { wireTrigger(chips[k], k); });

  /* ---------- Card ---------- */
  card.addEventListener('mouseenter', function () { clearTimeout(closeTimer); });
  card.addEventListener('mouseleave', scheduleClose);
  card.addEventListener('click', function (e) {
    e.stopPropagation();
    var a = e.target.closest('a');
    if (a && current) track(current, 'cta:' + a.getAttribute('href'));
  });
  closeBtn.addEventListener('click', function (e) { e.stopPropagation(); close(true); });
  document.addEventListener('click', function () { if (current) close(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && current) close(true); });

  /* ---------- Layout ---------- */
  if ('ResizeObserver' in window) new ResizeObserver(layoutDots).observe(stage);
  else window.addEventListener('resize', layoutDots);
  layoutDots();

  /* ---------- One-time intro tour: glow each area once if visitor is idle ---------- */
  if (!reduceMotion) {
    var order = ['deck', 'porch', 'trim', 'invisiclip'];
    var i = 0;
    var tour = function () {
      if (interacted) return clearPreview();
      clearPreview();
      if (i >= order.length) return;
      var k = order[i++];
      zones[zoneFor[k]].classList.add('is-preview');
      dots[k].classList.add('is-preview');
      setTimeout(tour, 1100);
    };
    var clearPreview = function () {
      hero.querySelectorAll('.is-preview').forEach(function (el) { el.classList.remove('is-preview'); });
    };
    setTimeout(tour, 1400);
  }
})();
