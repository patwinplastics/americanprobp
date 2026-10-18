/* American Pro Profile Designer: free accounts
   Guests can draw and submit to American Pro. A free account adds saving and
   watermarked downloads. Talks to the designer API hosted with the dealer portal. */
(function () {
  'use strict';

  var app = document.querySelector('[data-pd]');
  var bar = document.querySelector('[data-pd-account]');
  if (!app || !bar) return;
  var API = (window.AP_DESIGNER_API || app.getAttribute('data-pd-api') || '').replace(/\/$/, '');
  var TOK = 'apDesignerToken';
  var user = null;

  function D() { return window.APProfileDesigner; }
  function token() { try { return localStorage.getItem(TOK); } catch (e) { return null; } }
  function setToken(t) { try { if (t) localStorage.setItem(TOK, t); else localStorage.removeItem(TOK); } catch (e) { /* ignore */ } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function track(name, extra) {
    try { if (window.fbq) window.fbq('trackCustom', name, extra || {}); (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: name }, extra || {})); } catch (e) { /* ignore */ }
  }

  function api(method, path, body) {
    var h = { 'Content-Type': 'application/json' };
    var t = token(); if (t) h.Authorization = 'Bearer ' + t;
    return fetch(API + path, { method: method, headers: h, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.status === 401 && t && path.indexOf('/auth/') !== 0) signOut(true);
          if (!r.ok) { var err = new Error(j.error || 'Something went wrong. Please try again.'); err.status = r.status; throw err; }
          return j;
        });
      }, function () { throw new Error('Can\u2019t reach the account server right now. Your drawing is safe in this tab.'); });
  }

  /* ---------------- Account bar ---------------- */
  function renderBar() {
    if (user) {
      var first = esc((user.name || user.email).split(' ')[0]);
      bar.innerHTML =
        '<div class="pd-acct__who"><span class="pd-acct__dot" aria-hidden="true"></span><span>Signed in as <strong>' + first + '</strong></span></div>' +
        '<div class="pd-acct__btns">' +
          '<button type="button" class="pd-btn" data-acct="save">' + (D() && D().designId() ? 'Save' : 'Save Design') + '</button>' +
          '<button type="button" class="pd-btn pd-btn--ghost" data-acct="designs">My Designs</button>' +
          '<button type="button" class="pd-btn pd-btn--ghost" data-acct="menu" aria-label="Account options">\u2026</button>' +
        '</div>';
    } else {
      bar.innerHTML =
        '<p class="pd-acct__pitch"><strong>Free account:</strong> save designs and download DXF, PDF and PNG files.</p>' +
        '<div class="pd-acct__btns">' +
          '<button type="button" class="pd-btn" data-acct="signup">Create Free Account</button>' +
          '<button type="button" class="pd-btn pd-btn--ghost" data-acct="signin">Sign In</button>' +
        '</div>';
    }
    app.querySelectorAll('[data-exp]').forEach(function (b) {
      b.classList.toggle('is-locked', !user);
      b.setAttribute('aria-label', (user ? 'Download ' : 'Create a free account to download ') + b.getAttribute('data-exp').toUpperCase());
    });
    var note = app.querySelector('[data-pd-files-note]');
    if (note) note.textContent = user
      ? 'Downloads include an American Pro watermark. Attach to My Request sends your drawing straight to our engineers.'
      : 'No account needed to send your drawing to American Pro. Guest drawings are not saved after you close this tab.';
  }
  bar.addEventListener('click', function (e) {
    var b = e.target.closest('[data-acct]'); if (!b) return;
    var a = b.getAttribute('data-acct');
    if (a === 'signup') open('signup');
    if (a === 'signin') open('signin');
    if (a === 'designs') open('designs');
    if (a === 'menu') open('menu');
    if (a === 'save') saveDesign(false);
  });

  /* ---------------- Modal ---------------- */
  var modal = document.createElement('div');
  modal.className = 'pd-modal'; modal.hidden = true;
  modal.innerHTML = '<div class="pd-modal__scrim" data-close></div><div class="pd-modal__card" role="dialog" aria-modal="true" aria-labelledby="pd-modal-title"><button type="button" class="pd-modal__x" data-close aria-label="Close">\u00d7</button><div data-body></div></div>';
  document.body.appendChild(modal);
  var body = modal.querySelector('[data-body]'), lastFocus = null;
  modal.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', function (e) { if (!modal.hidden && e.key === 'Escape') { e.stopPropagation(); close(); } }, true);
  function close() { modal.hidden = true; document.documentElement.classList.remove('pd-modal-open'); if (lastFocus) try { lastFocus.focus(); } catch (e) { /* ignore */ } }
  function show(html) {
    lastFocus = document.activeElement;
    body.innerHTML = html; modal.hidden = false;
    document.documentElement.classList.add('pd-modal-open');
    var f = body.querySelector('input, button'); if (f) setTimeout(function () { f.focus(); }, 30);
  }
  function err(msg) { var el = body.querySelector('[data-err]'); if (el) { el.textContent = msg; el.hidden = !msg; } }
  function busy(form, on) { form.querySelectorAll('button, input, select').forEach(function (x) { x.disabled = on; }); }
  function inp(label, name, type, extra) {
    return '<label class="pd-field"><span>' + label + '</span><input name="' + name + '" type="' + (type || 'text') + '" ' + (extra || '') + '/></label>';
  }

  var REASONS = {
    download: 'Create a free account to download your drawing. Every download includes an American Pro watermark.',
    save: 'Create a free account to save designs and open them on any device.'
  };

  function open(view, reason) {
    if (!API) { D() && D().toast('Accounts are not available yet'); return; }
    if ((view === 'download' || view === 'save') && !user) { reason = view; view = 'signup'; }
    if (view === 'signup') return show(
      '<h2 id="pd-modal-title">Create Your Free Account</h2>' +
      '<p class="pd-modal__lead">' + esc(REASONS[reason] || 'Save your profile designs and download DXF, PDF and PNG files. Free for architects, contractors and homeowners.') + '</p>' +
      '<form class="pd-modal__form" data-form="signup" novalidate>' +
        '<div class="pd-row">' + inp('Name *', 'name', 'text', 'autocomplete="name" required') + inp('Company', 'company', 'text', 'autocomplete="organization"') + '</div>' +
        inp('Email *', 'email', 'email', 'autocomplete="email" required') +
        '<div class="pd-row">' +
          '<label class="pd-field"><span>I Am A *</span><select name="role" required><option value="">Select</option><option>Architect / Designer</option><option>Contractor / Builder</option><option>Restoration Contractor</option><option>Dealer</option><option>Distributor</option><option>Homeowner</option><option>Other</option></select></label>' +
          inp('ZIP Code', 'zip', 'text', 'inputmode="numeric" autocomplete="postal-code" maxlength="10"') +
        '</div>' +
        inp('Password * (8+ characters)', 'password', 'password', 'autocomplete="new-password" minlength="8" required') +
        '<p class="pd-modal__err" data-err hidden></p>' +
        '<button type="submit" class="pd-attach">Create Free Account</button>' +
        '<p class="pd-modal__alt">Already have an account? <button type="button" class="pd-link" data-go="signin">Sign in</button></p>' +
      '</form>');
    if (view === 'signin') return show(
      '<h2 id="pd-modal-title">Sign In</h2>' +
      '<p class="pd-modal__lead">' + esc(REASONS[reason] || 'Open your saved profile designs.') + '</p>' +
      '<form class="pd-modal__form" data-form="signin" novalidate>' +
        inp('Email', 'email', 'email', 'autocomplete="email" required') +
        inp('Password', 'password', 'password', 'autocomplete="current-password" required') +
        '<p class="pd-modal__err" data-err hidden></p>' +
        '<button type="submit" class="pd-attach">Sign In</button>' +
        '<p class="pd-modal__alt">New here? <button type="button" class="pd-link" data-go="signup">Create a free account</button></p>' +
        '<p class="pd-modal__alt">Forgot your password? Call <a href="tel:18774426776">1-877-442-6776</a> and we\u2019ll reset it.</p>' +
      '</form>');
    if (view === 'password') return show(
      '<h2 id="pd-modal-title">Set a New Password</h2>' +
      '<p class="pd-modal__lead">' + (reason === 'forced' ? 'Your password was reset by American Pro. Choose a new one to continue.' : 'Change the password for ' + esc(user && user.email) + '.') + '</p>' +
      '<form class="pd-modal__form" data-form="password" novalidate>' +
        inp('Current Password', 'current', 'password', 'autocomplete="current-password" required') +
        inp('New Password (8+ characters)', 'next', 'password', 'autocomplete="new-password" minlength="8" required') +
        '<p class="pd-modal__err" data-err hidden></p>' +
        '<button type="submit" class="pd-attach">Update Password</button>' +
      '</form>');
    if (view === 'menu') return show(
      '<h2 id="pd-modal-title">Your Account</h2>' +
      '<p class="pd-modal__lead">' + esc(user.name) + '<br>' + esc(user.email) + (user.company ? '<br>' + esc(user.company) : '') + '</p>' +
      '<div class="pd-btns"><button type="button" class="pd-btn pd-btn--ghost" data-go="saveas">Save As New Design</button><button type="button" class="pd-btn pd-btn--ghost" data-go="password">Change Password</button><button type="button" class="pd-btn pd-btn--danger" data-go="signout">Sign Out</button></div>');
    if (view === 'designs') {
      show('<h2 id="pd-modal-title">My Designs</h2><p class="pd-modal__lead">Loading your designs\u2026</p>');
      return api('GET', '/designs').then(function (j) {
        var cur = D().designId();
        var rows = j.designs.map(function (d) {
          return '<li class="pd-dl__item' + (d.id === cur ? ' is-cur' : '') + '"><div><strong>' + esc(d.name || 'Untitled profile') + '</strong><small>' + esc(d.project || '') + (d.project ? ' \u00b7 ' : '') + new Date(d.updatedAt).toLocaleDateString() + (d.closed ? '' : ' \u00b7 open outline') + '</small></div>' +
            '<div class="pd-dl__act"><button type="button" class="pd-btn pd-btn--ghost" data-open="' + esc(d.id) + '">' + (d.id === cur ? 'Open Again' : 'Open') + '</button><button type="button" class="pd-btn pd-btn--danger" data-del="' + esc(d.id) + '" aria-label="Delete ' + esc(d.name || 'design') + '">Delete</button></div></li>';
        }).join('');
        show('<h2 id="pd-modal-title">My Designs</h2>' +
          (rows ? '<ul class="pd-dl">' + rows + '</ul>' : '<p class="pd-modal__lead">No saved designs yet. Draw a profile and click Save Design.</p>') +
          '<div class="pd-btns"><button type="button" class="pd-btn" data-go="new">Start a New Design</button></div>');
      }).catch(function (e) { show('<h2 id="pd-modal-title">My Designs</h2><p class="pd-modal__err">' + esc(e.message) + '</p>'); });
    }
  }

  body.addEventListener('click', function (e) {
    var g = e.target.closest('[data-go]');
    if (g) {
      var v = g.getAttribute('data-go');
      if (v === 'signout') { signOut(); close(); return; }
      if (v === 'saveas') { close(); saveDesign(true); return; }
      if (v === 'new') { close(); D().act('clear'); return; }
      open(v); return;
    }
    var o = e.target.closest('[data-open]');
    if (o) {
      o.disabled = true;
      api('GET', '/designs/' + encodeURIComponent(o.getAttribute('data-open'))).then(function (j) {
        D().setDesign(j.design, j.design.id); close(); renderBar(); D().toast('Opened ' + (j.design.name || 'design'));
      }).catch(function (x) { o.disabled = false; D().toast(x.message); });
      return;
    }
    var d = e.target.closest('[data-del]');
    if (d) {
      if (!confirm('Delete this saved design? This can\u2019t be undone.')) return;
      var did = d.getAttribute('data-del');
      api('DELETE', '/designs/' + encodeURIComponent(did)).then(function () {
        if (D().designId() === did) D().setDesignId(null);
        open('designs'); renderBar();
      }).catch(function (x) { D().toast(x.message); });
    }
  });

  body.addEventListener('submit', function (e) {
    var form = e.target.closest('[data-form]'); if (!form) return;
    e.preventDefault();
    var kind = form.getAttribute('data-form');
    var v = {}; new FormData(form).forEach(function (val, k) { v[k] = String(val).trim(); });
    if (kind !== 'password') v.password = form.elements.password.value; // keep spaces in passwords
    if (kind === 'signup') {
      if (!v.name) return err('Enter your name.');
      if (!/^\S+@\S+\.\S+$/.test(v.email)) return err('Enter a valid email address.');
      if (!v.role) return err('Tell us your role.');
      if ((v.password || '').length < 8) return err('Use a password with at least 8 characters.');
    }
    if (kind === 'signin' && (!v.email || !v.password)) return err('Enter your email and password.');
    if (kind === 'password') { v.current = form.elements.current.value; v.next = form.elements.next.value; if (v.next.length < 8) return err('Use at least 8 characters.'); }
    err(''); busy(form, true);
    var req = kind === 'signup' ? api('POST', '/auth/signup', v)
      : kind === 'signin' ? api('POST', '/auth/login', { email: v.email, password: v.password })
      : api('POST', '/me/password', { current: v.current, next: v.next });
    req.then(function (j) {
      if (j.token) setToken(j.token);
      if (kind === 'password') { if (user) user.mustChange = false; close(); D().toast('Password updated'); return; }
      signedIn(j.user);
      track(kind === 'signup' ? 'ProfileDesignerSignup' : 'ProfileDesignerLogin', { role: j.user.role || '' });
      if (kind === 'signup') track('CompleteRegistration', { content_name: 'Profile Designer' });
      if (j.mustChange) open('password', 'forced'); else { close(); D().toast(kind === 'signup' ? 'Account created. Your downloads are unlocked.' : 'Welcome back, ' + (j.user.name || '').split(' ')[0]); }
    }).catch(function (x) { busy(form, false); err(x.message); });
  });

  /* ---------------- Session ---------------- */
  function signedIn(u) {
    user = u;
    if (D()) D().setAccount(u);
    renderBar();
  }
  function signOut(expired) {
    setToken(null); user = null;
    if (D()) D().setAccount(null);
    renderBar();
    if (expired && D()) D().toast('Please sign in again');
  }
  function saveDesign(asNew) {
    if (!user) return open('save');
    if (!D().hasShape()) return D().toast('Draw your profile first');
    var d = D().design();
    if (!d.name) {
      var n = prompt('Name this design', 'Custom profile');
      if (n === null) return;
      d.name = String(n).trim().slice(0, 80) || 'Custom profile';
      D().state.name = d.name; var nameIn = document.getElementById('pd-name'); if (nameIn) nameIn.value = d.name;
    }
    var id = asNew ? null : D().designId();
    var btn = bar.querySelector('[data-acct="save"]'); if (btn) { btn.disabled = true; btn.textContent = 'Saving\u2026'; }
    (id ? api('PUT', '/designs/' + encodeURIComponent(id), { design: d }) : api('POST', '/designs', { design: d }))
      .then(function (j) { D().setDesignId(j.design.id); D().toast('Saved \u201c' + (j.design.name || 'design') + '\u201d'); track('ProfileDesignerSave', {}); })
      .catch(function (x) {
        if (x.status === 404 && id) { D().setDesignId(null); return saveDesign(true); }
        D().toast(x.message);
      })
      .then(function () { renderBar(); });
  }

  // Ctrl/Cmd+S saves
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S') && modal.hidden) { e.preventDefault(); saveDesign(false); }
  });

  window.APProfileAccount = { open: open, user: function () { return user; }, token: token, api: api, save: saveDesign };

  renderBar();
  if (token() && API) {
    api('GET', '/me').then(function (j) { signedIn(j.user); if (j.mustChange) open('password', 'forced'); })
      .catch(function (e) { if (e.status === 401) signOut(); else { renderBar(); } });
  }
})();
