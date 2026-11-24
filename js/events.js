/* Render upcoming and past trade shows from data/events.json.
   After an event's end date (inclusive, America/New_York unless
   the file sets another timezone), it moves to Past Events and
   leaves the homepage teaser. Add new shows in data/events.json. */
(function () {
  var THIS = document.currentScript;

  function base() {
    try {
      var src = THIS && THIS.src ? THIS.src : '';
      var m = src.match(/^(.*\/)js\/events\.js(?:\?.*)?$/);
      if (m) return m[1];
    } catch (e) { /* fall through */ }
    return '/';
  }

  var B = base();

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

  function cardHtml(ev, opts) {
    opts = opts || {};
    var past = !!opts.past;
    var heading = opts.heading || 'h2';
    var detailsHref = B + 'pages/events.html#' + encodeURIComponent(ev.id);
    var samplesHref = B + 'index.html#samples';
    var dealerHref = B + 'pages/for-the-pros.html?inquiry=dealer#inquiry';
    var html = '<article class="event-card' + (past ? ' event-card--past' : '') + '" id="' + esc(ev.id) + '" data-event-id="' + esc(ev.id) + '" data-event-end="' + esc(ev.end) + '">';
    html += '<div class="event-card__body">';
    if (past) html += '<span class="event-card__status">Past Event</span>';
    html += '<' + heading + ' class="event-card__name">' + esc(ev.name) + '</' + heading + '>';
    if (ev.datesLabel) html += '<p class="event-card__dates">' + esc(ev.datesLabel) + '</p>';
    if (ev.venue || ev.city) {
      html += '<p class="event-card__venue">';
      if (ev.venue) html += esc(ev.venue);
      if (ev.venue && ev.city) html += ', ';
      if (ev.city) html += esc(ev.city);
      html += '</p>';
    }
    if (ev.hoursLabel) html += '<p class="event-card__hours">' + esc(ev.hoursLabel) + '</p>';
    if (ev.summary) html += '<p class="event-card__summary">' + esc(ev.summary) + '</p>';
    html += '</div>';
    html += '<div class="event-card__actions">';
    if (opts.teaser) {
      html += '<a class="btn btn--primary" href="' + esc(detailsHref) + '">Event Details</a>';
    }
    html += '<a class="btn ' + (opts.teaser ? 'btn--ghost' : 'btn--primary') + '" href="' + esc(samplesHref) + '">Request Free Samples</a>';
    html += '<a class="btn btn--secondary" href="' + esc(dealerHref) + '">Become a Dealer</a>';
    if (ev.url) {
      html += '<a class="event-card__ext" href="' + esc(ev.url) + '" target="_blank" rel="noopener">' + esc(ev.urlLabel || 'Visit the Expo Website') + ' <span aria-hidden="true">↗</span></a>';
    }
    html += '</div></article>';
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
    var upcoming = events.filter(function (ev) { return isUpcoming(ev, today); });
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
    var upcoming = ((data && data.events) || []).filter(function (ev) { return isUpcoming(ev, today); });
    if (!upcoming.length) {
      section.hidden = true;
      return;
    }
    list.innerHTML = upcoming.map(function (ev) { return cardHtml(ev, { heading: 'h3', teaser: true }); }).join('');
    section.hidden = false;
  }

  fetch(B + 'data/events.json', { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (!data) return;
      renderPage(data);
      renderTeaser(data);
    })
    .catch(function () { /* keep static fallback markup */ });
})();
