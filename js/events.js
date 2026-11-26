/* Render upcoming and past trade shows from data/events.json.
   After an event's end date (inclusive, America/New_York unless
   the file sets another timezone), it moves to Past Events and
   leaves the homepage teaser. Add new shows in data/events.json. */
(function () {
  var THIS = document.currentScript;
  var eventsById = {};

  function base() {
    try {
      var src = THIS && THIS.src ? THIS.src : '';
      var m = src.match(/^(.*\/)js\/events\.js(?:\?.*)?$/);
      if (m) return m[1];
    } catch (e) { /* fall through */ }
    return '/';
  }

  var B = base();
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function todayYmd(tz) {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: tz || 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());
    } catch (e) {
      var d = new Date();
      var m = String(d.getMonth() + 1).padStart(2, '0');
      var day = String(d.getDate()).padStart(2, '0');
      return d.getFullYear() + '-' + m + '-' + day;
    }
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isUpcoming(ev, today) {
    return ev && ev.end && ev.end >= today;
  }

  function ymdParts(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return null;
    return { y: +m[1], mo: +m[2], d: +m[3] };
  }

  function dateBlockHtml(ev) {
    var start = ymdParts(ev.start);
    if (!start) return '';
    var end = ymdParts(ev.end) || start;
    var ranged = !(start.y === end.y && start.mo === end.mo && start.d === end.d);
    var html = '<div class="event-card__date' + (ranged ? ' event-card__date--range' : '') + '" aria-hidden="true">';
    html += '<span class="event-card__month">' + esc(MONTHS[start.mo - 1] || '') + '</span>';
    if (!ranged) {
      html += '<span class="event-card__day">' + start.d + '</span>';
    } else if (start.y === end.y && start.mo === end.mo) {
      html += '<span class="event-card__day-range">' + start.d + '<span class="event-card__day-and">and</span>' + end.d + '</span>';
    } else {
      var endMonth = MONTHS[end.mo - 1] || '';
      html += '<span class="event-card__day-range">' + start.d + '<span class="event-card__day-and">to ' + esc(endMonth) + '</span>' + end.d + '</span>';
    }
    html += '<span class="event-card__year">' + start.y + '</span>';
    html += '</div>';
    return html;
  }

  function metaRow(label, value) {
    if (!value) return '';
    return '<p class="event-card__meta"><span class="event-card__label">' + esc(label) + '</span>' + esc(value) + '</p>';
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function icsEscape(s) {
    return String(s == null ? '' : s)
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;');
  }

  function foldLine(line) {
    if (line.length <= 75) return line;
    var out = line.slice(0, 75);
    var rest = line.slice(75);
    while (rest.length) {
      out += '\r\n ' + rest.slice(0, 74);
      rest = rest.slice(74);
    }
    return out;
  }

  function utcStamp(date) {
    return date.getUTCFullYear().toString()
      + pad2(date.getUTCMonth() + 1)
      + pad2(date.getUTCDate())
      + 'T'
      + pad2(date.getUTCHours())
      + pad2(date.getUTCMinutes())
      + pad2(date.getUTCSeconds())
      + 'Z';
  }

  /* Convert a civil date and HH:MM in America/New_York to a UTC ICS stamp.
     December dates are EST (UTC-5); July dates are EDT (UTC-4). A short
     offset table covers the years this page is likely to list. */
  function nyOffsetMinutes(y, mo, d) {
    /* Second Sunday in March 02:00 to first Sunday in November 02:00 is EDT. */
    function nthSunday(year, month, n) {
      var dt = new Date(Date.UTC(year, month - 1, 1));
      var dow = dt.getUTCDay();
      var first = 1 + ((7 - dow) % 7);
      return first + (n - 1) * 7;
    }
    var march = nthSunday(y, 3, 2);
    var nov = nthSunday(y, 11, 1);
    var md = mo * 100 + d;
    if (md > (3 * 100 + march) && md < (11 * 100 + nov)) return 240;
    if (md === (3 * 100 + march) || md === (11 * 100 + nov)) {
      /* Boundary days: treat local evening hours as already in the new offset
         after 02:00. Events on these dates should set explicit UTC if needed. */
      return md === (3 * 100 + march) ? 240 : 300;
    }
    return 300;
  }

  function localToUtcStamp(y, mo, d, hh, mm) {
    var offset = nyOffsetMinutes(y, mo, d);
    var utcMs = Date.UTC(y, mo - 1, d, hh, mm, 0) + offset * 60 * 1000;
    return utcStamp(new Date(utcMs));
  }

  function parseHm(s) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(s || '');
    if (!m) return null;
    return { h: +m[1], m: +m[2] };
  }

  function nextDateYmd(y, mo, d) {
    var dt = new Date(Date.UTC(y, mo - 1, d + 1));
    return {
      y: dt.getUTCFullYear(),
      mo: dt.getUTCMonth() + 1,
      d: dt.getUTCDate()
    };
  }

  function locationLine(ev) {
    var parts = [];
    if (ev.venue) parts.push(ev.venue);
    if (ev.city) parts.push(ev.city);
    return parts.join(', ');
  }

  function buildIcs(ev) {
    var start = ymdParts(ev.start);
    var end = ymdParts(ev.end) || start;
    if (!start) return '';
    var startHm = parseHm(ev.startTime);
    var endHm = parseHm(ev.endTime);
    var timed = start.y === end.y && start.mo === end.mo && start.d === end.d && startHm && endHm;
    var lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//American Pro Building Products//Events//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + ev.id + '@americanprobp.com',
      'DTSTAMP:' + utcStamp(new Date())
    ];
    if (timed) {
      lines.push('DTSTART:' + localToUtcStamp(start.y, start.mo, start.d, startHm.h, startHm.m));
      lines.push('DTEND:' + localToUtcStamp(end.y, end.mo, end.d, endHm.h, endHm.m));
    } else {
      var excl = nextDateYmd(end.y, end.mo, end.d);
      lines.push('DTSTART;VALUE=DATE:' + start.y + pad2(start.mo) + pad2(start.d));
      lines.push('DTEND;VALUE=DATE:' + excl.y + pad2(excl.mo) + pad2(excl.d));
    }
    lines.push(foldLine('SUMMARY:' + icsEscape(ev.name || '')));
    var loc = locationLine(ev);
    if (loc) lines.push(foldLine('LOCATION:' + icsEscape(loc)));
    var desc = [];
    if (ev.summary) desc.push(ev.summary);
    if (ev.hoursLabel) desc.push(ev.hoursLabel);
    if (ev.booth) desc.push('Booth ' + ev.booth);
    if (ev.url) desc.push(ev.url);
    if (desc.length) lines.push(foldLine('DESCRIPTION:' + icsEscape(desc.join('\n'))));
    if (ev.url) lines.push(foldLine('URL:' + ev.url));
    lines.push('END:VEVENT', 'END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  function downloadIcs(ev) {
    var ics = buildIcs(ev);
    if (!ics) return;
    var blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (ev.id || 'event') + '.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function cardHtml(ev, opts) {
    opts = opts || {};
    var past = !!opts.past;
    var heading = opts.heading || 'h2';
    var detailsHref = opts.teaser
      ? B + 'pages/events.html#' + encodeURIComponent(ev.id)
      : (ev.url || B + 'pages/events.html#' + encodeURIComponent(ev.id));
    var detailsLabel = opts.teaser ? 'Event Details' : (ev.urlLabel || 'Event Details');
    var detailsExternal = !opts.teaser && !!ev.url;
    var loc = locationLine(ev);
    var html = '<article class="event-card' + (past ? ' event-card--past' : '') + '" id="' + esc(ev.id) + '" data-event-id="' + esc(ev.id) + '" data-event-end="' + esc(ev.end) + '">';
    html += dateBlockHtml(ev);
    html += '<div class="event-card__body">';
    if (past) html += '<span class="event-card__status">Past Event</span>';
    else if (ev.tag) html += '<span class="event-card__status event-card__status--sponsor">' + esc(ev.tag) + '</span>';
    html += '<' + heading + ' class="event-card__name">' + esc(ev.name) + '</' + heading + '>';
    if (ev.datesLabel) html += '<p class="event-card__dates">' + esc(ev.datesLabel) + '</p>';
    html += metaRow('Location', loc);
    html += metaRow('Hours', ev.hoursLabel);
    html += metaRow('Booth', ev.booth);
    if (ev.summary) html += '<p class="event-card__summary">' + esc(ev.summary) + '</p>';
    html += '<div class="event-card__actions">';
    if (ev.url || opts.teaser) {
      html += '<a class="btn btn--primary" href="' + esc(detailsHref) + '"'
        + (detailsExternal ? ' target="_blank" rel="noopener"' : '')
        + '>' + esc(detailsLabel)
        + (detailsExternal ? ' <span aria-hidden="true">↗</span>' : '')
        + '</a>';
    }
    if (!past) {
      html += '<button type="button" class="btn btn--ghost" data-add-to-calendar="' + esc(ev.id) + '">Add to Calendar</button>';
    }
    html += '</div></div></article>';
    return html;
  }

  function renderPage(data) {
    var upcomingRoot = document.querySelector('[data-events-upcoming]');
    var pastRoot = document.querySelector('[data-events-past]');
    var pastWrap = document.querySelector('[data-events-past-wrap]');
    var empty = document.querySelector('[data-events-empty]');
    if (!upcomingRoot) return;
    var tz = (data && data.timezone) || 'America/New_York';
    var today = todayYmd(tz);
    var events = (data && data.events) || [];
    var upcoming = events.filter(function (ev) { return isUpcoming(ev, today); })
      .slice()
      .sort(function (a, b) { return (a.start || '').localeCompare(b.start || ''); });
    var past = events.filter(function (ev) { return !isUpcoming(ev, today); })
      .slice()
      .sort(function (a, b) { return (b.end || '').localeCompare(a.end || ''); });

    if (upcoming.length) {
      upcomingRoot.innerHTML = upcoming.map(function (ev) { return cardHtml(ev, { heading: 'h3' }); }).join('');
      if (empty) empty.hidden = true;
    } else {
      upcomingRoot.innerHTML = '';
      if (empty) empty.hidden = false;
    }

    if (pastRoot) {
      pastRoot.innerHTML = past.map(function (ev) { return cardHtml(ev, { heading: 'h3', past: true }); }).join('');
    }
    if (pastWrap) pastWrap.hidden = past.length === 0;
  }

  function renderTeaser(data) {
    var section = document.querySelector('[data-events-teaser]');
    var list = document.querySelector('[data-events-teaser-list]');
    if (!section || !list) return;
    var tz = (data && data.timezone) || 'America/New_York';
    var today = todayYmd(tz);
    var upcoming = ((data && data.events) || []).filter(function (ev) { return isUpcoming(ev, today); })
      .slice()
      .sort(function (a, b) { return (a.start || '').localeCompare(b.start || ''); });
    if (!upcoming.length) {
      section.hidden = true;
      return;
    }
    list.innerHTML = upcoming.map(function (ev) { return cardHtml(ev, { heading: 'h3', teaser: true }); }).join('');
    section.hidden = false;
  }

  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest && e.target.closest('[data-add-to-calendar]');
    if (!btn) return;
    var id = btn.getAttribute('data-add-to-calendar');
    var ev = eventsById[id];
    if (!ev) return;
    e.preventDefault();
    downloadIcs(ev);
  });

  fetch(B + 'data/events.json', { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (!data) return;
      ((data && data.events) || []).forEach(function (ev) {
        if (ev && ev.id) eventsById[ev.id] = ev;
      });
      renderPage(data);
      renderTeaser(data);
    })
    .catch(function () { /* keep static fallback markup */ });
})();
