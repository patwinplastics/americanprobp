/* American Pro site search
   - Adds a search button to .site-header .header-actions on every page
   - Opens with the button, Ctrl/Cmd+K, "/" or a #search link
   - Runs fully in the browser against data/search-index.json (built by
     tools/build_search_index.py). No server, no cost.
   - Logs searches to the Meta Pixel (standard "Search" event) and dataLayer. */
(function () {
  'use strict';
  if (window.__apSearch) return;
  window.__apSearch = true;

  var me = document.currentScript || document.querySelector('script[src*="site-search.js"]');
  var ROOT = me ? new URL('../', me.src).href : '/';
  var INDEX_URL = ROOT + 'data/search-index.json';

  /* ---------------- Vocabulary helpers ---------------- */
  var STOP = {};
  'a an and are as at be by can do does for from how i in is it me my of on or our that the this to what when where which who why will with you your vs'.split(' ').forEach(function (w) { STOP[w] = 1; });

  // Domain synonyms: visitor words -> words used on the site
  var SYN = {
    molding: ['moulding'], moldings: ['mouldings', 'moulding'], mold: ['mould'], trim: ['moulding', 'casing'],
    hidden: ['invisiclip', 'fastener'], clip: ['invisiclip', 'clips'], clips: ['invisiclip'],
    fastener: ['invisiclip', 'fasteners'], fasteners: ['invisiclip', 'fastener'], screw: ['screws', 'fastener'],
    screwless: ['invisiclip', 'hidden'], plugs: ['plug', 'screws'],
    composite: ['pvc'], wood: ['woodgrain', 'grain', 'hardwood'], ipe: ['royal'], hardwood: ['woodgrain', 'grain'],
    color: ['colors', 'swatch'], colors: ['color', 'swatch'], colour: ['color', 'colors'], colours: ['colors'],
    gray: ['grey'], grey: ['gray'],
    price: ['quote', 'cost', 'pricing'], prices: ['quote', 'cost'], cost: ['quote', 'estimator', 'price'], pricing: ['quote', 'price'],
    buy: ['dealer', 'dealers', 'where'], purchase: ['dealer', 'buy'], store: ['dealer', 'dealers'], stores: ['dealers'],
    dealer: ['dealers', 'buy'], distributor: ['dealer', 'distributors'], lumberyard: ['dealer', 'lumberyards'],
    sample: ['samples', 'free'], samples: ['sample', 'free'], swatch: ['sample', 'colors'],
    install: ['installation', 'instructions', 'installing'], installation: ['install', 'instructions'], installing: ['installation'],
    instructions: ['installation', 'guide'], guide: ['instructions'],
    warranty: ['warranted', 'guarantee'], guarantee: ['warranty'],
    hot: ['heat', 'cool'], heat: ['cool', 'hot'], cool: ['heat', 'cooler'], barefoot: ['cool', 'heat'],
    waterproof: ['moisture', 'water'], rot: ['rotting', 'moisture'],
    porch: ['porches'], tongue: ['groove', 'porch'], groove: ['grooved'], tg: ['tongue', 'groove'],
    deck: ['decking', 'decks'], decks: ['deck', 'decking'], boards: ['board', 'decking'], board: ['boards', 'decking'],
    crown: ['crowns'], casing: ['casings'], sill: ['sills'], baseboard: ['base'], railing: ['rail'],
    contractor: ['pros', 'contractors', 'builder'], builder: ['pros', 'builders'], pro: ['pros'], architect: ['specifiers', 'architects'],
    custom: ['historic', 'profile'], historic: ['custom', 'restoration'], restoration: ['historic', 'custom'],
    pvc: ['cellular'], cellular: ['pvc'], spec: ['specs', 'specification'], specs: ['specification', 'spec'],
    phone: ['contact', 'call'], email: ['contact'], contact: ['quote'], quote: ['contact'],
    stairs: ['stair', 'steps'], fascia: ['trim'], joist: ['joists', 'spacing'], spacing: ['joist'],
    truegrained: ['truegrain'], 'true': ['truegrain']
  };

  function norm(s) {
    return (s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[\u2122\u00ae\u00a9]/g, '')
      .replace(/&/g, ' and ')
      .replace(/[\u2019']/g, '')
      .replace(/[^a-z0-9\s]/g, ' ');
  }
  function stem(t) {
    // light plural folding: fasteners -> fastener, colors -> color, porches -> porch, accessories -> accessory
    if (t.length > 4 && /ies$/.test(t)) return t.slice(0, -3) + 'y';
    if (t.length > 4 && /(ches|shes|xes)$/.test(t)) return t.slice(0, -2);
    if (t.length > 3 && /[^su]s$/.test(t)) return t.slice(0, -1);
    return t;
  }
  function tokens(s) {
    return norm(s).split(/\s+/).filter(function (t) { return t && !STOP[t]; }).map(stem);
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  // Bounded Damerau-Levenshtein (optimal string alignment)
  function within(a, b, max) {
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return false;
    var prev2 = null, prev = [], cur, i, j;
    for (j = 0; j <= lb; j++) prev[j] = j;
    for (i = 1; i <= la; i++) {
      cur = [i];
      var rowMin = i;
      for (j = 1; j <= lb; j++) {
        var cost = a[i - 1] === b[j - 1] ? 0 : 1;
        var v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
        cur[j] = v;
        if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return false;
      prev2 = prev; prev = cur;
    }
    return prev[lb] <= max;
  }

  /* ---------------- Index ---------------- */
  var DOCS = null, VOCAB = null, loading = null;
  var FIELDS = [['t', 10], ['h', 4], ['k', 4], ['p', 2], ['d', 2.5], ['b', 1]];
  var TYPE_BOOST = { Product: 1.7, Tools: 1.25, Profile: 1.2, FAQ: 0.95, Guide: 1, Section: 0.95, Page: 1, Blog: 0.85, Local: 0.75, Dealer: 0.9, Legal: 0.25 };

  function load() {
    if (loading) return loading;
    loading = fetch(INDEX_URL, { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (data) {
      VOCAB = Object.create(null);
      DOCS = data.docs.map(function (d) {
        var f = {};
        FIELDS.forEach(function (fw) {
          var set = Object.create(null);
          tokens(d[fw[0]] || '').forEach(function (t) { set[t] = 1; VOCAB[t] = 1; });
          f[fw[0]] = set;
        });
        d._f = f;
        d._title = norm(d.t);
        d._sku = d.s ? norm(d.s).replace(/\s+/g, '') : '';
        return d;
      });
      VOCAB = Object.keys(VOCAB);
      return DOCS;
    });
    return loading;
  }

  var fuzzyCache = Object.create(null);
  function expand(q) {
    // Returns [{term, w, mode}] candidates for a query token
    if (fuzzyCache[q]) return fuzzyCache[q];
    var out = [{ term: q, w: 1, mode: 'exact' }];
    (SYN[q] || SYN[q + 's'] || []).forEach(function (s) { out.push({ term: stem(s), w: 0.7, mode: 'exact' }); });
    if (q.length >= 4) {
      var max = q.length >= 8 ? 2 : 1;
      for (var i = 0; i < VOCAB.length; i++) {
        var v = VOCAB[i];
        if (v === q || v.charAt(0) !== q.charAt(0) && max === 1) continue;
        if (within(q, v, max)) out.push({ term: v, w: 0.6, mode: 'exact' });
      }
    }
    fuzzyCache[q] = out;
    return out;
  }

  // Single-word searches that should always lead with a specific page
  var PIN = {
    moulding: 'pages/mouldings.html', mould: 'pages/mouldings.html', molding: 'pages/mouldings.html', trim: 'pages/mouldings.html',
    deck: 'pages/decking.html', decking: 'pages/decking.html', porch: 'pages/porch.html', invisiclip: 'pages/invisiclip.html',
    truegrain: 'pages/truegrain-deck.html', legacy: 'pages/legacy-pvc-decking.html', dealer: 'pages/dealers.html',
    contact: 'pages/contact.html', quote: 'pages/contact.html', custom: 'pages/custom-historic-profiles.html'
  };

  function search(query) {
    if (!DOCS) return [];
    var raw = norm(query).trim();
    var qs = tokens(query);
    if (!qs.length) return [];
    var compact = raw.replace(/\s+/g, '');
    var scored = [];
    var exp = qs.map(expand);
    for (var di = 0; di < DOCS.length; di++) {
      var d = DOCS[di], total = 0, matched = 0;
      for (var qi = 0; qi < qs.length; qi++) {
        var q = qs[qi], best = 0, cands = exp[qi];
        for (var fi = 0; fi < FIELDS.length; fi++) {
          var name = FIELDS[fi][0], fw = FIELDS[fi][1], set = d._f[name];
          for (var ci = 0; ci < cands.length; ci++) {
            if (set[cands[ci].term]) { best = Math.max(best, fw * cands[ci].w); }
          }
          // prefix match while typing (last token)
          if (best < fw * 0.75 && q.length >= 2 && qi === qs.length - 1) {
            for (var tk in set) { if (tk.length > q.length && tk.indexOf(q) === 0) { best = Math.max(best, fw * 0.75); break; } }
          }
        }
        if (best > 0) matched++;
        total += best;
      }
      if (!matched) continue;
      var coverage = matched / qs.length;
      if (qs.length > 1 && coverage < 0.5) continue;
      var score = total * coverage * coverage;
      if (raw.length > 3 && d._title.indexOf(raw) !== -1) score += 12;
      if (d._sku && compact.length >= 3 && d._sku.indexOf(compact) === 0) score += 40;
      if (qs.length === 1 && PIN[qs[0]] === d.u) score += 30;
      score *= TYPE_BOOST[d.c] || 1;
      scored.push([score, d]);
    }
    scored.sort(function (a, b) { return b[0] - a[0]; });
    // De-duplicate: max 2 sub-entries (section/FAQ) per page, and skip sub-entries of a page already shown above them
    var out = [], perPage = Object.create(null);
    for (var i = 0; i < scored.length && out.length < 9; i++) {
      var doc = scored[i][1], page = doc.u.split('#')[0];
      if (doc.c === 'Section' || doc.c === 'FAQ') {
        perPage[page] = (perPage[page] || 0) + 1;
        if (perPage[page] > 2) continue;
      }
      out.push(doc);
    }
    return out;
  }

  function snippet(d, qs) {
    var text = d.d || d.b || '';
    if (!text) return '';
    var lower = text.toLowerCase(), pos = -1;
    for (var i = 0; i < qs.length && pos === -1; i++) pos = lower.indexOf(qs[i]);
    var start = pos > 60 ? text.lastIndexOf(' ', pos - 50) + 1 : 0;
    var s = text.slice(start, start + 150);
    if (start + 150 < text.length) s = s.replace(/\s+\S*$/, '') + '\u2026';
    if (start > 0) s = '\u2026' + s;
    return highlight(s, qs);
  }
  function highlight(s, qs) {
    var h = esc(s);
    var terms = qs.filter(function (q) { return q.length >= 3; }).sort(function (a, b) { return b.length - a.length; });
    if (!terms.length) return h;
    var re = new RegExp('(' + terms.map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')', 'gi');
    return h.replace(re, '<mark>$1</mark>');
  }

  /* ---------------- Logging ---------------- */
  var logged = Object.create(null), logTimer = null;
  function logSearch(q, n) {
    q = q.trim();
    if (q.length < 2 || logged[q.toLowerCase()]) return;
    logged[q.toLowerCase()] = 1;
    try {
      if (window.fbq) {
        window.fbq('track', 'Search', { search_string: q, content_category: 'Site search', num_results: n });
        if (!n) window.fbq('trackCustom', 'SiteSearchNoResults', { search_string: q });
      }
      (window.dataLayer = window.dataLayer || []).push({ event: 'site_search', search_term: q, results: n, page: location.pathname });
    } catch (e) { /* never block search */ }
  }
  function logClick(q, d, rank) {
    try {
      if (window.fbq) window.fbq('trackCustom', 'SiteSearchClick', { search_string: q.trim(), result: d.u, result_title: d.t, rank: rank + 1 });
      (window.dataLayer = window.dataLayer || []).push({ event: 'site_search_click', search_term: q.trim(), result: d.u, rank: rank + 1 });
    } catch (e) { /* ignore */ }
  }

  /* ---------------- UI ---------------- */
  var CSS = [
    '.ap-search-btn{display:inline-flex;align-items:center;justify-content:center;gap:.45rem;height:40px;min-width:40px;padding:0 .7rem;border:1px solid var(--color-divider,#e2ddd3);border-radius:999px;background:transparent;color:inherit;cursor:pointer;font:600 .85rem/1 var(--font-body,inherit);transition:border-color .15s,background .15s}',
    '.ap-search-btn svg{flex:none;width:18px;height:18px}.ap-search-btn{flex:none;white-space:nowrap}',
    '.ap-search-btn:hover,.ap-search-btn:focus-visible{border-color:var(--color-primary,#0e1f3a);background:rgba(14,31,58,.04);outline:none}',
    '.ap-search-btn kbd{white-space:nowrap;font:600 .7rem/1 var(--font-body,inherit);color:#6b7280;border:1px solid #e2ddd3;border-radius:5px;padding:.2rem .35rem;background:#fff}',
    '.ap-search-btn .ap-sb-label{display:none}',
    '.ap-search-btn kbd{display:none}.ap-search-btn{padding:0;width:40px}',
    '.ap-search{position:fixed;inset:0;z-index:5000;display:none}',
    '.ap-search.is-open{display:block}',
    '.ap-search__backdrop{position:absolute;inset:0;background:rgba(9,20,40,.55);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}',
    '.ap-search__panel{position:relative;margin:8vh auto 0;width:min(680px,calc(100% - 2rem));max-height:80vh;display:flex;flex-direction:column;background:#fff;border-radius:16px;box-shadow:0 30px 70px rgba(6,18,42,.4);overflow:hidden;color:#0e1f3a;font-family:var(--font-body,system-ui,sans-serif)}',
    '.ap-search__bar{display:flex;align-items:center;gap:.7rem;padding:.9rem 1rem;border-bottom:1px solid #ece8e0}',
    '.ap-search__bar svg{flex:none;color:#b91c2c}',
    '.ap-search__input{flex:1;min-width:0;border:0;outline:0;font:500 1.1rem/1.3 var(--font-body,inherit);color:#0e1f3a;background:transparent;padding:.35rem 0}',
    '.ap-search__input::placeholder{color:#8a8f9c}',
    '.ap-search__input::-webkit-search-cancel-button{display:none}',
    '.ap-search__close{flex:none;border:1px solid #e2ddd3;background:#fff;border-radius:8px;padding:.35rem .55rem;font:600 .72rem/1 var(--font-body,inherit);color:#5b6478;cursor:pointer}',
    '.ap-search__body{overflow-y:auto;overscroll-behavior:contain;padding:.5rem}',
    '.ap-search__label{font:700 .68rem/1 var(--font-body,inherit);letter-spacing:.16em;text-transform:uppercase;color:#8a8f9c;padding:.8rem .7rem .5rem}',
    '.ap-search__chips{display:flex;flex-wrap:wrap;gap:.45rem;padding:0 .7rem .6rem}',
    '.ap-search__chip{border:1px solid #e2ddd3;background:#faf8f4;border-radius:999px;padding:.5rem .8rem;font:600 .82rem/1 var(--font-body,inherit);color:#0e1f3a;cursor:pointer}',
    '.ap-search__chip:hover,.ap-search__chip:focus-visible{border-color:#b91c2c;background:#fbe9eb;outline:none}',
    '.ap-search__list{list-style:none;margin:0;padding:0}',
    '.ap-search__item a{display:flex;gap:.8rem;align-items:flex-start;padding:.7rem;border-radius:10px;text-decoration:none;color:inherit}',
    '.ap-search__item a:hover,.ap-search__item.is-active a{background:#f4f1eb}',
    '.ap-search__item.is-active a{box-shadow:inset 3px 0 0 #b91c2c}',
    '.ap-search__thumb{flex:none;width:46px;height:46px;border-radius:8px;background:#f4f1eb center/cover no-repeat;border:1px solid #ece8e0}',
    '.ap-search__thumb--icon{display:grid;place-items:center;color:#0e1f3a;background:#eef1f6;border-color:#e3e8f0}',
    '.ap-search__thumb--contain{background-size:contain;background-color:#fff}',
    '.ap-search__txt{min-width:0;flex:1}',
    '.ap-search__top{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}',
    '.ap-search__title{font:600 .98rem/1.3 var(--font-body,inherit);color:#0e1f3a}',
    '.ap-search__badge{font:700 .62rem/1 var(--font-body,inherit);letter-spacing:.1em;text-transform:uppercase;padding:.28rem .45rem;border-radius:5px;background:#eef1f6;color:#3a4a66}',
    '.ap-search__badge--Product{background:#fbe9eb;color:#b91c2c}',
    '.ap-search__badge--Profile{background:#f3efe6;color:#6b5a35}',
    '.ap-search__parent{font-size:.76rem;color:#8a8f9c;margin-top:.15rem}',
    '.ap-search__snip{font-size:.83rem;line-height:1.45;color:#5b6478;margin-top:.25rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
    '.ap-search mark{background:#fde7a8;color:inherit;border-radius:3px;padding:0 .1em}',
    '.ap-search__empty{padding:1.4rem .9rem;color:#5b6478;font-size:.92rem}',
    '.ap-search__empty strong{color:#0e1f3a}',
    '.ap-search__empty a{color:#b91c2c;font-weight:600}',
    '.ap-search__foot{display:flex;justify-content:space-between;gap:1rem;padding:.6rem 1rem;border-top:1px solid #ece8e0;font-size:.74rem;color:#8a8f9c}',
    '.ap-search__foot kbd{font:600 .68rem/1 var(--font-body,inherit);border:1px solid #e2ddd3;border-radius:4px;padding:.15rem .3rem;background:#faf8f4;color:#5b6478}',
    '.ap-search__foot a{color:#b91c2c;font-weight:600;text-decoration:none}',
    '@media (max-width:640px){.ap-search__panel{margin:0;width:100%;height:100%;max-height:none;border-radius:0}.ap-search__keys{display:none}.ap-search__input{font-size:16px}}',
    'html.ap-search-lock{overflow:hidden}'
  ].join('\n');

  var ICON_SEARCH = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
  var ICONS = {
    Guide: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    Blog: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    FAQ: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    Section: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    Local: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    Dealer: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    Tools: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
    Page: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    Legal: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>'
  };
  var LABEL = { Product: 'Product', Profile: 'Profile', FAQ: 'FAQ', Guide: 'Guide', Section: 'On Page', Blog: 'Blog', Local: 'Local', Dealer: 'Dealer', Tools: 'Tools', Page: 'Page', Legal: 'Legal' };

  var QUICK = [
    ['Request Free Samples', 'index.html#samples'], ['Find a Dealer', 'pages/dealers.html'],
    ['TrueGrain Deck\u2122', 'pages/truegrain-deck.html'], ['Legacy PVC Decking', 'pages/legacy-pvc-decking.html'],
    ['Porch Flooring', 'pages/porch.html'], ['PVC Mouldings', 'pages/mouldings.html'],
    ['InvisiClip\u2122 Hidden Fasteners', 'pages/invisiclip.html'], ['Installation & Resources', 'pages/resources.html'],
    ['Get a Quote', 'pages/contact.html']
  ];
  var POPULAR = ['Hidden fasteners', 'Porch colors', 'Warranty', 'Installation', 'Crown moulding', 'Cool underfoot', 'Custom profiles'];

  var root, input, body, results = [], active = -1, lastFocus = null, typingTimer = null;

  function build() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    root = document.createElement('div');
    root.className = 'ap-search';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Search americanprobp.com');
    root.innerHTML =
      '<div class="ap-search__backdrop" data-close></div>' +
      '<div class="ap-search__panel">' +
        '<div class="ap-search__bar">' + ICON_SEARCH +
          '<input class="ap-search__input" type="search" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search" placeholder="Search products, colors, profiles, guides\u2026" aria-label="Search the site" aria-controls="ap-search-results" aria-autocomplete="list" role="combobox" aria-expanded="true" />' +
          '<button type="button" class="ap-search__close" data-close aria-label="Close search">Esc</button>' +
        '</div>' +
        '<div class="ap-search__body" id="ap-search-results"></div>' +
        '<div class="ap-search__foot"><span class="ap-search__keys"><kbd>\u2191</kbd> <kbd>\u2193</kbd> to move &nbsp; <kbd>Enter</kbd> to open</span><span>Can\u2019t find it? <a href="' + ROOT + 'pages/contact.html">Ask our team</a></span></div>' +
      '</div>';
    document.body.appendChild(root);
    input = root.querySelector('.ap-search__input');
    body = root.querySelector('.ap-search__body');
    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) close();
      var chip = e.target.closest('[data-q]');
      if (chip) { input.value = chip.getAttribute('data-q'); input.focus(); run(); }
      var a = e.target.closest('a[data-rank]');
      if (a) { var i = +a.getAttribute('data-rank'); if (results[i]) logClick(input.value, results[i], i); }
    });
    input.addEventListener('input', function () {
      run();
      clearTimeout(logTimer);
      logTimer = setTimeout(function () { logSearch(input.value, results.length); }, 1200);
    });
    input.addEventListener('keydown', onKey);
    renderEmpty();
  }

  function renderEmpty() {
    results = []; active = -1;
    body.innerHTML =
      '<div class="ap-search__label">Popular Searches</div>' +
      '<div class="ap-search__chips">' + POPULAR.map(function (p) { return '<button type="button" class="ap-search__chip" data-q="' + esc(p) + '">' + esc(p) + '</button>'; }).join('') + '</div>' +
      '<div class="ap-search__label">Quick Links</div>' +
      '<ul class="ap-search__list">' + QUICK.map(function (q) {
        return '<li class="ap-search__item"><a href="' + ROOT + q[1] + '"><span class="ap-search__thumb ap-search__thumb--icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span><span class="ap-search__txt"><span class="ap-search__title">' + esc(q[0]) + '</span></span></a></li>';
      }).join('') + '</ul>';
  }

  function thumb(d) {
    if (d.i) {
      var cls = d.c === 'Profile' ? ' ap-search__thumb--contain' : '';
      return '<span class="ap-search__thumb' + cls + '" style="background-image:url(\'' + ROOT + esc(d.i) + '\')" aria-hidden="true"></span>';
    }
    var path = ICONS[d.c] || ICONS.Section;
    return '<span class="ap-search__thumb ap-search__thumb--icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg></span>';
  }

  function run() {
    var q = input.value;
    if (!q.trim()) { renderEmpty(); return; }
    if (!DOCS) { body.innerHTML = '<div class="ap-search__empty">Loading\u2026</div>'; load().then(run); return; }
    results = search(q);
    active = results.length ? 0 : -1;
    var qs = tokens(q);
    if (!results.length) {
      body.innerHTML = '<div class="ap-search__empty"><strong>No matches for \u201c' + esc(q.trim()) + '\u201d.</strong><br />Try a product name like TrueGrain, Porch or Crown, or <a href="' + ROOT + 'pages/contact.html">ask our team</a> and we\u2019ll point you the right way.</div>' +
        '<div class="ap-search__label">Popular Searches</div><div class="ap-search__chips">' + POPULAR.map(function (p) { return '<button type="button" class="ap-search__chip" data-q="' + esc(p) + '">' + esc(p) + '</button>'; }).join('') + '</div>';
      return;
    }
    body.innerHTML = '<ul class="ap-search__list" role="listbox">' + results.map(function (d, i) {
      var parent = d.p ? '<div class="ap-search__parent">' + esc(d.p) + '</div>' : '';
      var snip = d.c === 'Section' ? '' : snippet(d, qs);
      return '<li class="ap-search__item' + (i === active ? ' is-active' : '') + '" role="option" id="ap-sr-' + i + '" aria-selected="' + (i === active) + '">' +
        '<a href="' + ROOT + esc(d.u) + '" data-rank="' + i + '">' + thumb(d) +
        '<span class="ap-search__txt"><span class="ap-search__top"><span class="ap-search__title">' + highlight(d.t, qs) + '</span><span class="ap-search__badge ap-search__badge--' + d.c + '">' + LABEL[d.c] + '</span></span>' +
        parent + (snip ? '<div class="ap-search__snip">' + snip + '</div>' : '') + '</span></a></li>';
    }).join('') + '</ul>';
    input.setAttribute('aria-activedescendant', 'ap-sr-0');
  }

  function setActive(i) {
    var items = body.querySelectorAll('.ap-search__item');
    if (!items.length) return;
    active = (i + items.length) % items.length;
    items.forEach(function (el, k) { el.classList.toggle('is-active', k === active); el.setAttribute('aria-selected', k === active); });
    items[active].scrollIntoView({ block: 'nearest' });
    input.setAttribute('aria-activedescendant', items[active].id || '');
  }

  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Enter') {
      var items = body.querySelectorAll('.ap-search__item a');
      var a = items[active >= 0 ? active : 0];
      if (a) { e.preventDefault(); logSearch(input.value, results.length); a.click(); }
    } else if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') {
      // keep focus inside the dialog
      var f = root.querySelectorAll('input, button, a[href]');
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  function open(prefill) {
    if (!root) build();
    lastFocus = document.activeElement;
    root.classList.add('is-open');
    document.documentElement.classList.add('ap-search-lock');
    input.value = typeof prefill === 'string' ? prefill : '';
    run();
    input.focus();
    load().then(function () { if (input.value) run(); });
  }
  function close() {
    if (!root) return;
    if (input.value) logSearch(input.value, results.length);
    root.classList.remove('is-open');
    document.documentElement.classList.remove('ap-search-lock');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  // close on link navigation within same page (hash links)
  document.addEventListener('click', function (e) {
    if (!root || !root.classList.contains('is-open')) return;
    var a = e.target.closest('.ap-search a[href]');
    if (a) setTimeout(close, 0);
  });

  /* ---------------- Header button ---------------- */
  function addButton() {
    var headers = document.querySelectorAll('.site-header .header-actions');
    headers.forEach(function (h) {
      if (h.querySelector('.ap-search-btn')) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ap-search-btn';
      b.setAttribute('aria-label', 'Search the site');
      b.title = 'Search (' + (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '\u2318' : 'Ctrl') + ' K)';
      b.setAttribute('aria-haspopup', 'dialog');
      var mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
      b.innerHTML = ICON_SEARCH + '<span class="ap-sb-label">Search</span><kbd>' + (mac ? '\u2318' : 'Ctrl') + ' K</kbd>';
      b.addEventListener('click', function () { open(); });
      b.addEventListener('mouseenter', load, { once: true });
      b.addEventListener('focus', load, { once: true });
      var phone = h.querySelector('.header-phone');
      h.insertBefore(b, phone || h.firstChild);
    });
    if (!document.querySelector('.ap-search-style-btn')) {
      var s = document.createElement('style');
      s.className = 'ap-search-style-btn';
      s.textContent = CSS.split('\n').filter(function (l) { return l.indexOf('.ap-search-btn') !== -1 || l.indexOf('ap-sb-label') !== -1; }).join('\n');
      document.head.appendChild(s);
    }
  }

  document.addEventListener('keydown', function (e) {
    var t = e.target, typing = t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName));
    if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); open(); }
    else if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); open(); }
  });
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href="#search"]');
    if (a) { e.preventDefault(); open(); }
  });

  function init() {
    addButton();
    // Header may be injected after this script runs; watch briefly for it
    if (!document.querySelector('.ap-search-btn')) {
      var mo = new MutationObserver(function () { if (document.querySelector('.site-header .header-actions')) { addButton(); mo.disconnect(); } });
      mo.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(function () { mo.disconnect(); }, 8000);
    }
    var params = new URLSearchParams(location.search);
    if (location.hash === '#search') open();
    else if (params.get('search')) open(params.get('search'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  window.apSiteSearch = { open: open, close: close, search: function (q) { return load().then(function () { return search(q); }); } };
})();
