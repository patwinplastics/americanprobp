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
  var exterior = hero.querySelector('[data-house-exterior]');
  var zones = {}, dots = {}, chips = {};
  hero.querySelectorAll('.house-zone').forEach(function (z) { zones[z.dataset.zone] = z; });
  hero.querySelector('[data-house-dots]').querySelectorAll('.house-dot').forEach(function (d) { dots[d.dataset.dot] = d; });
  hero.querySelectorAll('.house-chip').forEach(function (c) { chips[c.dataset.chip] = c; });

  var zoneFor = { deck: 'deck', porch: 'porch', trim: 'trim', ceiling: 'ceiling' };
  var canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var phone = window.matchMedia('(max-width: 719px)');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var current = null, pinned = false, closeTimer = null, interacted = false, lastTrigger = null;
  var cardAnchorEl = null;
  var view = 'house';
  var walking = false;
  var WALK_MS = 900;
  var scenes = {};
  hero.querySelectorAll('[data-house-scene]').forEach(function (s) { scenes[s.dataset.houseScene] = s; });

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

  function anchorPos(key) {
    var el = cardAnchorEl && cardAnchorEl.isConnected ? cardAnchorEl : (dots[key] || null);
    if (!el) return dots[key] && dots[key]._pos;
    var sr = stage.getBoundingClientRect();
    var dr = el.getBoundingClientRect();
    return { x: dr.left - sr.left + dr.width / 2, y: dr.top - sr.top + dr.height / 2 };
  }

  function placeCard(key) {
    if (phone.matches) { card.style.left = ''; card.style.top = ''; return; }
    var p = anchorPos(key);
    if (!p) return;
    var W = stage.clientWidth, H = stage.clientHeight;
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
    hero.querySelectorAll('[data-house-open]').forEach(function (d) {
      var on = !!(key && d === cardAnchorEl && d.getAttribute('data-house-open') === key);
      d.classList.toggle('is-active', on);
      d.setAttribute('aria-expanded', on && !card.hidden ? 'true' : 'false');
    });
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
      card.classList.toggle('house-card--plain', !cardBody.querySelector('img'));
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
    cardAnchorEl = null;
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
      g.addEventListener('mouseenter', function () {
        if (!pinned || current === z) { cardAnchorEl = dots[z]; open(z); }
      });
      g.addEventListener('mouseleave', scheduleClose);
      g.addEventListener('click', function () {
        track(z, 'zone-click');
        window.location.href = g.dataset.href;
      });
    } else {
      g.addEventListener('click', function (e) {
        e.stopPropagation();
        lastTrigger = dots[z];
        cardAnchorEl = dots[z];
        if (current === z && pinned) close(false); else open(z, { pin: true });
      });
    }
  });

  /* ---------- Dots + chips ---------- */
  function wireTrigger(el, key) {
    function aim() { cardAnchorEl = dots[key] || el; }
    if (canHover) {
      el.addEventListener('mouseenter', function () { if (!pinned) { aim(); open(key); } });
      el.addEventListener('mouseleave', scheduleClose);
    }
    el.addEventListener('focus', function () { if (!pinned && canHover) { aim(); open(key); } });
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      lastTrigger = el;
      aim();
      var keyboard = e.detail === 0;
      if (current === key && pinned) close(false);
      else open(key, { pin: true, focus: keyboard });
      if (phone.matches && el.classList.contains('house-chip')) {
        stage.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
      }
    });
  }
  Object.keys(dots).forEach(function (k) { if (k !== 'door') wireTrigger(dots[k], k); });
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
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (current) { close(true); return; }
      if (walking) return;
      if (view === 'entry') walk('door');
      else if (view === 'house') return;
      else if (view === 'door') showHouse();
      return;
    }
    if (e.key !== 'Enter' || view !== 'door' || walking) return;
    var t = e.target;
    if (t && t.closest && t.closest('form, a, button, input, textarea, select')) return;
    e.preventDefault();
    walk('entry');
  });

  /* ---------- Front door walk-in (house → door instantly, door → entry dolly) ---------- */
  var WALK_ORIGIN = {
    'door>entry': { x: '50%', y: '32%' },
    'entry>door': { x: '16%', y: '50%' }
  };

  function focusEl(el) {
    if (el && el.focus) el.focus({ preventScroll: true });
  }

  function setExteriorActive(active) {
    if (!exterior) return;
    exterior.setAttribute('aria-hidden', active ? 'false' : 'true');
    exterior.inert = !active;
  }

  function clearWalkClasses(el) {
    el.classList.remove('is-walk-out', 'is-walk-in', 'is-walk-back-out', 'is-walk-back-in', 'is-hiding-ui');
  }

  function showHouse() {
    if (walking) return;
    close(false);
    Object.keys(scenes).forEach(function (id) {
      clearWalkClasses(scenes[id]);
      scenes[id].classList.remove('is-on');
      scenes[id].setAttribute('aria-hidden', 'true');
    });
    view = 'house';
    hero.classList.remove('is-inside');
    hero.setAttribute('data-house-view', 'house');
    setExteriorActive(true);
    focusEl(dots.door);
    track('door', 'back-house');
  }

  function showDoorInstant() {
    if (walking || view === 'door') return;
    markInteracted();
    close(false);
    Object.keys(scenes).forEach(function (id) {
      clearWalkClasses(scenes[id]);
      scenes[id].classList.remove('is-on');
      scenes[id].setAttribute('aria-hidden', id === 'door' ? 'false' : 'true');
    });
    scenes.door.classList.add('is-on');
    view = 'door';
    hero.classList.add('is-inside');
    hero.setAttribute('data-house-view', 'door');
    setExteriorActive(false);
    focusEl(scenes.door.querySelector('.house-enter__btn'));
    track('door', 'arrive');
  }

  function walk(to) {
    if (walking || !scenes[to] || to === view) return;
    var fromId = view;
    var dir = (fromId === 'entry' && to === 'door') ? 'back' : 'forward';
    if (reduceMotion) {
      markInteracted();
      close(false);
      clearWalkClasses(scenes[fromId]);
      scenes[fromId].classList.remove('is-on');
      scenes[fromId].setAttribute('aria-hidden', 'true');
      scenes[to].classList.add('is-on');
      scenes[to].setAttribute('aria-hidden', 'false');
      view = to;
      hero.setAttribute('data-house-view', to);
      focusEl(to === 'door' ? scenes.door.querySelector('.house-enter__btn') : scenes[to].querySelector('.house-back'));
      track(to, dir === 'back' ? 'back' : 'arrive');
      return;
    }
    walking = true;
    markInteracted();
    close(false);
    var fromEl = scenes[fromId];
    var toEl = scenes[to];
    var origin = WALK_ORIGIN[fromId + '>' + to] || { x: '50%', y: '50%' };
    fromEl.style.setProperty('--ox', origin.x);
    fromEl.style.setProperty('--oy', origin.y);
    toEl.style.setProperty('--ox', '50%');
    toEl.style.setProperty('--oy', '50%');
    var outClass = dir === 'back' ? 'is-walk-back-out' : 'is-walk-out';
    var inClass = dir === 'back' ? 'is-walk-back-in' : 'is-walk-in';
    fromEl.classList.add('is-hiding-ui');
    toEl.classList.add('is-hiding-ui');
    fromEl.offsetWidth;
    fromEl.classList.add(outClass);
    fromEl.classList.remove('is-on');
    fromEl.setAttribute('aria-hidden', 'true');
    toEl.classList.add('is-on', inClass);
    toEl.setAttribute('aria-hidden', 'false');
    hero.setAttribute('data-house-view', to);
    window.setTimeout(function () { toEl.classList.remove('is-hiding-ui'); }, 650);
    window.setTimeout(function () {
      fromEl.classList.remove(outClass, 'is-hiding-ui');
      toEl.classList.remove(inClass);
      view = to;
      walking = false;
      focusEl(to === 'door' ? scenes.door.querySelector('.house-enter__btn') : toEl.querySelector('.house-back'));
      track(to, dir === 'back' ? 'back' : 'arrive');
    }, WALK_MS);
  }

  if (dots.door) {
    dots.door.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      lastTrigger = dots.door;
      showDoorInstant();
    });
  }

  hero.querySelectorAll('[data-house-open]').forEach(function (el) {
    var key = el.getAttribute('data-house-open');
    if (canHover) {
      el.addEventListener('mouseenter', function () {
        if (walking || pinned) return;
        cardAnchorEl = el;
        open(key);
      });
      el.addEventListener('mouseleave', scheduleClose);
    }
    el.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (walking) return;
      lastTrigger = el;
      var keyboard = e.detail === 0;
      var already = current === key && pinned && cardAnchorEl === el;
      cardAnchorEl = el;
      if (already) close(false);
      else open(key, { pin: true, focus: keyboard });
    });
  });

  hero.querySelectorAll('[data-house-back]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (walking) return;
      var dest = btn.getAttribute('data-house-back');
      if (dest === 'house') showHouse();
      else walk(dest);
    });
  });

  hero.querySelectorAll('[data-house-walk-to]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (walking || view !== 'door') return;
      walk(btn.getAttribute('data-house-walk-to'));
    });
  });

  function preloadScenes() {
    hero.querySelectorAll('.house-scene__img').forEach(function (img) {
      if (img.decode) img.decode().catch(function () {});
    });
  }
  if (dots.door) dots.door.addEventListener('pointerenter', preloadScenes, { once: true });
  if ('requestIdleCallback' in window) requestIdleCallback(preloadScenes);
  else window.addEventListener('load', preloadScenes);

  /* ---------- Layout ---------- */
  if ('ResizeObserver' in window) new ResizeObserver(layoutDots).observe(stage);
  else window.addEventListener('resize', layoutDots);
  layoutDots();

  /* ---------- One-time intro tour: glow each area once if visitor is idle ---------- */
  if (!reduceMotion) {
    var order = ['deck', 'porch', 'ceiling', 'trim'];
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
