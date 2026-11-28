/* Slim sitewide banner for upcoming industry events.
   Hidden automatically after the last event end date in America/New_York
   (falls back to 2026-12-10 if events.json cannot be loaded). */
(function () {
  'use strict';
  var TZ = 'America/New_York';
  var FALLBACK_END = '2026-12-10';

  function scriptRoot() {
    var el = document.currentScript || document.querySelector('script[src*="events-banner.js"]');
    var src = el && el.src ? el.src : '';
    var m = src.match(/^(.*\/)js\/events-banner\.js(?:\?.*)?$/);
    return m ? m[1] : '/';
  }

  function todayYmd() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  }

  function lastEnd(events) {
    var end = '';
    (events || []).forEach(function (ev) {
      var e = ev && ev.end;
      if (e && e > end) end = e;
    });
    return end || FALLBACK_END;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function phraseFor(ev) {
    if (!ev) return '';
    if (ev.id === 'nadra-northeast-networking-2026') {
      return 'the NADRA Northeast Networking Meeting on December 1';
    }
    if (ev.id === 'nrla-lbm-expo-2026') {
      return 'the NRLA LBM Expo on December 9 and 10, Booth 114, exhibiting with Patwin Plastics';
    }
    var name = ev.name || 'an upcoming event';
    var when = ev.datesLabel ? String(ev.datesLabel).replace(/,\s*20\d{2}\s*$/, '') : '';
    var extra = ev.booth ? ', Booth ' + ev.booth : '';
    return when ? 'the ' + name + ' on ' + when + extra : 'the ' + name + extra;
  }

  function messageFrom(events, today) {
    var parts = [];
    (events || []).forEach(function (ev) {
      if (ev && ev.end && ev.end >= today) {
        var phrase = phraseFor(ev);
        if (phrase) parts.push(phrase);
      }
    });
    if (!parts.length) return '';
    if (parts.length === 1) return 'Meet American Pro at ' + parts[0] + '.';
    return 'Meet American Pro at ' + parts.slice(0, -1).join(', ') + ', and at ' + parts[parts.length - 1] + '.';
  }

  function fallbackMessage(today) {
    if (today > FALLBACK_END) return '';
    if (today > '2026-12-01') {
      return 'Meet American Pro at the NRLA LBM Expo on December 9 and 10, Booth 114, exhibiting with Patwin Plastics.';
    }
    return 'Meet American Pro at the NADRA Northeast Networking Meeting on December 1, and at the NRLA LBM Expo on December 9 and 10, Booth 114, exhibiting with Patwin Plastics.';
  }

  function mobileMessageFrom(events, today) {
    var hasNadra = false;
    var hasLbm = false;
    (events || []).forEach(function (ev) {
      if (!ev || !ev.end || ev.end < today) return;
      if (ev.id === 'nadra-northeast-networking-2026') hasNadra = true;
      if (ev.id === 'nrla-lbm-expo-2026') hasLbm = true;
    });
    if (hasNadra && hasLbm) {
      return 'Meet us at NADRA on December 1 and the NRLA LBM Expo, Booth 114, December 9 and 10.';
    }
    if (hasLbm) {
      return 'Meet us at the NRLA LBM Expo, Booth 114, December 9 and 10.';
    }
    if (hasNadra) {
      return 'Meet us at NADRA on December 1.';
    }
    return '';
  }

  function fallbackMobileMessage(today) {
    if (today > FALLBACK_END) return '';
    if (today > '2026-12-01') {
      return 'Meet us at the NRLA LBM Expo, Booth 114, December 9 and 10.';
    }
    return 'Meet us at NADRA on December 1 and the NRLA LBM Expo, Booth 114, December 9 and 10.';
  }

  function mount(text, mobileText, root) {
    if (!text || document.querySelector('.events-banner')) return;
    var header = document.querySelector('.site-header');
    if (!header) return;
    var banner = document.createElement('div');
    banner.className = 'events-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Upcoming events');
    var href = root + 'pages/events.html';
    var mobile = mobileText || text;
    banner.innerHTML =
      '<div class="container events-banner-inner">' +
        '<p class="events-banner-text">' +
          '<span class="events-banner-text__desktop">' + esc(text) + '</span>' +
          '<span class="events-banner-text__mobile">' + esc(mobile) + '</span>' +
        '</p>' +
        '<a class="events-banner-cta" href="' + href + '">View Events</a>' +
      '</div>';
    header.insertAdjacentElement('afterend', banner);
  }

  var root = scriptRoot();
  var today = todayYmd();

  fetch(root + 'data/events.json', { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      var events = data && data.events;
      var end = lastEnd(events);
      if (today > end) return;
      var text = messageFrom(events, today) || fallbackMessage(today);
      var mobile = mobileMessageFrom(events, today) || fallbackMobileMessage(today) || text;
      mount(text, mobile, root);
    })
    .catch(function () {
      if (today > FALLBACK_END) return;
      mount(fallbackMessage(today), fallbackMobileMessage(today), root);
    });
})();
