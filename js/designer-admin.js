/* American Pro Profile Designer: admin console
   Staff sign in to review submitted drawings, manage visitor accounts and
   manage staff logins. Data comes from the designer API in the dealer portal. */
(function () {
  'use strict';
  var root = document.getElementById('admin');
  var API = (window.AP_DESIGNER_API || root.getAttribute('data-api') || '').replace(/\/$/, '');
  var KEY = 'apDesignerAdmin';
  var me = null, tab = 'submissions', data = { submissions: [], users: [], staff: [] }, selId = null, q = '', statusF = '';
  var STATUSES = ['new', 'reviewing', 'quoted', 'won', 'lost'];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function tok() { try { return sessionStorage.getItem(KEY); } catch (e) { return null; } }
  function setTok(t) { try { if (t) sessionStorage.setItem(KEY, t); else sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
  function when(iso) { if (!iso) return ''; var d = new Date(iso); return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  function day(iso) { return iso ? new Date(iso).toLocaleDateString() : ''; }

  function api(method, path, body) {
    var h = { 'Content-Type': 'application/json' }, t = tok();
    if (t) h.Authorization = 'Bearer ' + t;
    return fetch(API + path, { method: method, headers: h, body: body ? JSON.stringify(body) : undefined }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 && path !== '/admin/login' && path !== '/admin/me/password') { setTok(null); me = null; login('Your session ended. Please sign in again.'); throw new Error('signed out'); }
        if (!r.ok) throw new Error(j.error || 'Request failed (' + r.status + ')');
        return j;
      });
    }, function () { throw new Error('Can\u2019t reach the server. Check your connection.'); });
  }

  /* ---------------- Drawing helpers ---------------- */
  function eng(d) { return window.APProfileEngine.bind(d); }
  function thumb(d) {
    if (!d || !d.pts || d.pts.length < 2) return '<span class="thumb"></span>';
    var E = eng(d), out = E.outline(), bb = E.bbox();
    var W = 92, H = 48, p = 5, s = Math.min((W - 2 * p) / Math.max(bb.w, .01), (H - 2 * p) / Math.max(bb.h, .01));
    var ox = W / 2 - (bb.x0 + bb.x1) / 2 * s, oy = H / 2 + (bb.y0 + bb.y1) / 2 * s;
    var path = out.map(function (q, k) { return (k ? 'L' : 'M') + (ox + q.x * s).toFixed(1) + ' ' + (oy - q.y * s).toFixed(1); }).join('') + (d.closed ? 'Z' : '');
    return '<svg class="thumb" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true"><path d="' + path + '" fill="' + (d.closed ? '#e8edf5' : 'none') + '" stroke="#0e1f3a" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  }
  function size(d) { if (!d || !d.pts || d.pts.length < 2) return ''; var E = eng(d), bb = E.bbox(); return E.fmtLen(bb.w) + ' W x ' + E.fmtLen(bb.h) + ' H'; }
  function paintPreview(canvas, d) {
    var r = window.devicePixelRatio || 1, w = canvas.clientWidth || 400, h = canvas.clientHeight || 250;
    canvas.width = w * r * 2; canvas.height = h * r * 2;
    eng(d).drawToCanvas(canvas.getContext('2d'), canvas.width, canvas.height, { pad: 90 * r, fs: 15 * r * 2 * .55, lw: 2.2 * r * 2 * .6 });
  }
  function dl(blob, name) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function exportFile(d, kind, prefix) {
    var E = eng(d), base = (prefix ? prefix + '-' : '') + E.slug();
    if (kind === 'dxf') dl(new Blob([E.dxf()], { type: 'application/dxf' }), base + '.dxf');
    if (kind === 'pdf') { var p = E.pdf(); if (p) dl(p, base + '.pdf'); else alert('PDF library still loading. Try again.'); }
    if (kind === 'png') E.png().then(function (b) { dl(b, base + '.png'); });
  }
  function csv(rows, name) {
    var text = rows.map(function (r) { return r.map(function (c) { c = String(c == null ? '' : c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\r\n');
    dl(new Blob(['\ufeff' + text], { type: 'text/csv' }), name);
  }

  /* ---------------- Login ---------------- */
  function login(msg, forced) {
    root.innerHTML = '<div class="login"><form class="card" id="lf" novalidate>' +
      '<img src="../images/logo/americanpro-header.png" alt="American Pro Building Products" width="660" height="306" />' +
      '<h1>' + (forced ? 'Set a New Password' : 'Profile Designer Admin') + '</h1>' +
      '<p>' + (forced ? 'Choose a new password of at least 10 characters before continuing.' : 'Staff sign-in for submitted drawings, user accounts and staff logins.') + '</p>' +
      (msg ? '<div class="msg">' + esc(msg) + '</div>' : '') +
      (forced
        ? '<label class="f"><span>Current Password</span><input class="in" name="current" type="password" autocomplete="current-password" required></label><label class="f"><span>New Password</span><input class="in" name="next" type="password" autocomplete="new-password" minlength="10" required></label>'
        : '<label class="f"><span>Email</span><input class="in" name="email" type="email" autocomplete="username" required></label><label class="f"><span>Password</span><input class="in" name="password" type="password" autocomplete="current-password" required></label>') +
      '<button class="btn btn--red" type="submit">' + (forced ? 'Update Password' : 'Sign In') + '</button></form></div>';
    var f = document.getElementById('lf');
    f.querySelector('input').focus();
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var b = f.querySelector('button'); b.disabled = true;
      var req = forced
        ? api('POST', '/admin/me/password', { current: f.current.value, next: f.next.value }).then(function (j) { setTok(j.token); me.mustChange = false; })
        : api('POST', '/admin/login', { email: f.email.value.trim(), password: f.password.value }).then(function (j) { setTok(j.token); me = j.staff; me.mustChange = j.mustChange; });
      req.then(function () { if (me.mustChange) login('', true); else boot(); })
        .catch(function (x) { login(x.message, forced); });
    });
  }

  /* ---------------- Shell ---------------- */
  function shell() {
    var nNew = data.submissions.filter(function (s) { return s.status === 'new'; }).length;
    var tabs = [['submissions', 'Submitted Drawings', nNew], ['users', 'User Accounts'], ['staff', me.role === 'admin' ? 'Staff Logins' : null], ['account', 'My Password']];
    root.innerHTML = '<header class="top"><div class="top__in">' +
      '<img src="../images/logo/americanpro-header-white.png" alt="American Pro" width="660" height="306" />' +
      '<h1>Profile Designer Admin</h1>' +
      '<nav class="tabs" aria-label="Admin sections">' + tabs.filter(function (t) { return t[1]; }).map(function (t) {
        return '<button type="button" class="tab' + (tab === t[0] ? ' is-on' : '') + '" data-tab="' + t[0] + '">' + t[1] + (t[2] ? '<span class="count">' + t[2] + '</span>' : '') + '</button>';
      }).join('') + '<button type="button" class="tab" data-tab="signout">Sign Out</button></nav>' +
      '<span class="who">' + esc(me.email) + ' \u00b7 ' + esc(me.role) + '</span>' +
      '</div></header><main id="main"></main>';
    root.querySelector('.tabs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-tab]'); if (!b) return;
      var t = b.getAttribute('data-tab');
      if (t === 'signout') { setTok(null); me = null; login('Signed out.'); return; }
      tab = t; selId = null; q = ''; statusF = ''; refresh();
    });
  }
  function refresh() {
    var p = [api('GET', '/admin/submissions').then(function (j) { data.submissions = j.submissions; })];
    if (tab === 'users') p.push(api('GET', '/admin/users').then(function (j) { data.users = j.users; }));
    if (tab === 'staff') p.push(api('GET', '/admin/staff').then(function (j) { data.staff = j.staff; }));
    return Promise.all(p).then(function () { shell(); view(); }).catch(function (x) { if (x.message !== 'signed out') { shell(); main().innerHTML = '<div class="msg">' + esc(x.message) + '</div>'; } });
  }
  function main() { return document.getElementById('main'); }
  function view() {
    if (tab === 'submissions') return viewSubs();
    if (tab === 'users') return viewUsers();
    if (tab === 'staff') return viewStaff();
    return viewAccount();
  }

  /* ---------------- Submissions ---------------- */
  function viewSubs() {
    var all = data.submissions;
    var list = all.filter(function (s) {
      if (statusF && s.status !== statusF) return false;
      if (!q) return true;
      var c = s.contact || {};
      return [c.firstName, c.lastName, c.email, c.company, c.zip, c.role, c.projectType, s.design && s.design.name, s.design && s.design.project].join(' ').toLowerCase().indexOf(q) >= 0;
    });
    var count = function (st) { return all.filter(function (s) { return s.status === st; }).length; };
    var h = '<div class="stats">' +
      '<div class="card stat"><b>' + all.length + '</b><span>Total Drawings</span></div>' +
      STATUSES.map(function (st) { return '<div class="card stat"><b>' + count(st) + '</b><span>' + st + '</span></div>'; }).join('') + '</div>' +
      '<div class="bar"><h2>Submitted Drawings</h2>' +
      '<input class="in" type="search" placeholder="Search name, company, ZIP\u2026" value="' + esc(q) + '" data-q aria-label="Search submissions">' +
      '<select class="in" data-status aria-label="Filter by status"><option value="">All Statuses</option>' + STATUSES.map(function (s) { return '<option value="' + s + '"' + (statusF === s ? ' selected' : '') + '>' + s[0].toUpperCase() + s.slice(1) + '</option>'; }).join('') + '</select>' +
      '<button type="button" class="btn btn--ghost" data-csv>Export CSV</button></div>';
    if (!all.length) { main().innerHTML = h + '<div class="card empty">No drawings yet. They\u2019ll appear here when someone sends a profile from the Profile Designer.</div>'; return bindSubs(); }
    var sel = list.find(function (s) { return s.id === selId; }) || null;
    h += '<div class="split' + (sel ? '' : ' no-detail') + '"><div class="card table-wrap"><table><thead><tr><th>Profile</th><th>Contact</th><th class="hide-sm">Role</th><th class="hide-sm">Size</th><th>Status</th><th class="hide-sm">Received</th></tr></thead><tbody>' +
      (list.length ? list.map(function (s) {
        var c = s.contact || {};
        return '<tr class="row' + (s.id === selId ? ' is-sel' : '') + '" data-id="' + esc(s.id) + '" tabindex="0">' +
          '<td>' + thumb(s.design) + '<small>' + esc(s.design.name || 'Untitled') + '</small></td>' +
          '<td><strong>' + esc((c.firstName + ' ' + c.lastName).trim() || c.email) + '</strong><small>' + esc(c.company || c.email) + '</small></td>' +
          '<td class="hide-sm">' + esc(c.role) + (s.account ? '<small>Has account</small>' : '<small>Guest</small>') + '</td>' +
          '<td class="hide-sm">' + esc(size(s.design)) + '</td>' +
          '<td><span class="pill pill--' + esc(s.status) + '">' + esc(s.status) + '</span></td>' +
          '<td class="hide-sm">' + esc(day(s.createdAt)) + '</td></tr>';
      }).join('') : '<tr><td colspan="6" class="empty">No matches.</td></tr>') +
      '</tbody></table></div>' + (sel ? detail(sel) : '<div class="card detail"><p class="empty">Select a drawing to see the full profile, contact details and files.</p></div>') + '</div>';
    main().innerHTML = h;
    if (sel) paintPreview(main().querySelector('.preview'), sel.design);
    bindSubs();
  }
  function detail(s) {
    var c = s.contact || {};
    return '<aside class="card detail" aria-label="Drawing detail"><h3>' + esc(s.design.name || 'Untitled profile') + '</h3>' +
      '<small style="color:#5b6478">' + esc(size(s.design)) + ' \u00b7 ' + (s.design.closed ? 'Closed outline' : 'Open outline') + ' \u00b7 ' + s.design.pts.length + ' points</small>' +
      '<canvas class="preview" aria-label="Profile preview"></canvas>' +
      '<div class="btns"><button type="button" class="btn btn--sm" data-x="dxf">DXF</button><button type="button" class="btn btn--sm" data-x="pdf">PDF Shop Drawing</button><button type="button" class="btn btn--sm btn--ghost" data-x="png">PNG</button></div>' +
      '<span class="lbl">Contact</span><dl class="kv">' +
        '<dt>Name</dt><dd>' + esc((c.firstName + ' ' + c.lastName).trim()) + '</dd>' +
        '<dt>Email</dt><dd><a href="mailto:' + esc(c.email) + '?subject=' + encodeURIComponent('Your custom profile: ' + (s.design.name || 'American Pro')) + '">' + esc(c.email) + '</a></dd>' +
        (c.phone ? '<dt>Phone</dt><dd><a href="tel:' + esc(c.phone) + '">' + esc(c.phone) + '</a></dd>' : '') +
        (c.company ? '<dt>Company</dt><dd>' + esc(c.company) + '</dd>' : '') +
        '<dt>Role</dt><dd>' + esc(c.role) + '</dd><dt>ZIP</dt><dd>' + esc(c.zip) + '</dd>' +
        (c.projectType ? '<dt>Project Type</dt><dd>' + esc(c.projectType) + '</dd>' : '') +
        (c.application ? '<dt>Application</dt><dd>' + esc(c.application) + '</dd>' : '') +
        (c.linearFeet ? '<dt>Linear Feet</dt><dd>' + esc(c.linearFeet) + '</dd>' : '') +
        (s.design.project ? '<dt>Project</dt><dd>' + esc(s.design.project) + '</dd>' : '') +
        '<dt>Account</dt><dd>' + (s.account ? esc(s.account.name) + ' (' + esc(s.account.email) + ')' : 'Guest') + '</dd>' +
        '<dt>Received</dt><dd>' + esc(when(s.createdAt)) + '</dd>' +
      '</dl>' + (c.message ? '<span class="lbl">Message</span><p style="white-space:pre-wrap;font-size:.86rem;margin:0">' + esc(c.message) + '</p>' : '') +
      '<span class="lbl">Status &amp; Notes</span>' +
      '<select class="in" data-st style="width:100%;margin-bottom:.5rem">' + STATUSES.map(function (st) { return '<option value="' + st + '"' + (s.status === st ? ' selected' : '') + '>' + st[0].toUpperCase() + st.slice(1) + '</option>'; }).join('') + '</select>' +
      '<textarea class="in" data-notes placeholder="Internal notes (quote number, die number, follow-up)">' + esc(s.notes || '') + '</textarea>' +
      '<div class="btns" style="margin-top:.5rem"><button type="button" class="btn" data-savesub>Save</button>' + (me.role === 'admin' ? '<button type="button" class="btn btn--danger" data-delsub>Delete</button>' : '') + '</div>' +
      (s.updatedBy ? '<small style="display:block;margin-top:.5rem;color:#5b6478">Last updated by ' + esc(s.updatedBy) + ', ' + esc(when(s.updatedAt)) + '</small>' : '') +
      '</aside>';
  }
  function bindSubs() {
    var m = main();
    var qi = m.querySelector('[data-q]');
    if (qi) qi.addEventListener('input', function () { q = qi.value.trim().toLowerCase(); var pos = qi.selectionStart; viewSubs(); var n = main().querySelector('[data-q]'); n.focus(); n.setSelectionRange(pos, pos); });
    var sf = m.querySelector('[data-status]'); if (sf) sf.addEventListener('change', function () { statusF = sf.value; viewSubs(); });
    var cb = m.querySelector('[data-csv]');
    if (cb) cb.addEventListener('click', function () {
      csv([['Received', 'Status', 'First Name', 'Last Name', 'Email', 'Phone', 'Company', 'Role', 'ZIP', 'Project Type', 'Application', 'Linear Feet', 'Profile Name', 'Project', 'Size', 'Account', 'Notes', 'Message']].concat(data.submissions.map(function (s) {
        var c = s.contact || {};
        return [s.createdAt, s.status, c.firstName, c.lastName, c.email, c.phone, c.company, c.role, c.zip, c.projectType, c.application, c.linearFeet, s.design.name, s.design.project, size(s.design), s.account ? s.account.email : 'Guest', s.notes, c.message];
      })), 'profile-designer-submissions-' + new Date().toISOString().slice(0, 10) + '.csv');
    });
    m.querySelectorAll('tr.row').forEach(function (tr) {
      var go = function () { selId = tr.getAttribute('data-id'); viewSubs(); };
      tr.addEventListener('click', go); tr.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    });
    var s = data.submissions.find(function (x) { return x.id === selId; });
    if (!s) return;
    m.querySelectorAll('[data-x]').forEach(function (b) { b.addEventListener('click', function () { exportFile(s.design, b.getAttribute('data-x'), (s.contact.lastName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')); }); });
    m.querySelector('[data-savesub]').addEventListener('click', function () {
      var b = this; b.disabled = true;
      api('PATCH', '/admin/submissions/' + s.id, { status: m.querySelector('[data-st]').value, notes: m.querySelector('[data-notes]').value })
        .then(function (j) { Object.assign(s, j.submission); shell(); viewSubs(); }).catch(function (x) { alert(x.message); b.disabled = false; });
    });
    var del = m.querySelector('[data-delsub]');
    if (del) del.addEventListener('click', function () {
      if (!confirm('Delete this submission permanently?')) return;
      api('DELETE', '/admin/submissions/' + s.id).then(function () { selId = null; refresh(); }).catch(function (x) { alert(x.message); });
    });
  }

  /* ---------------- Users ---------------- */
  function viewUsers(flash) {
    var list = data.users.filter(function (u) { return !q || [u.name, u.email, u.company, u.role, u.zip].join(' ').toLowerCase().indexOf(q) >= 0; });
    var h = (flash || '') + '<div class="bar"><h2>User Accounts</h2>' +
      '<input class="in" type="search" placeholder="Search name, email, company\u2026" value="' + esc(q) + '" data-q aria-label="Search users">' +
      '<button type="button" class="btn btn--ghost" data-csv>Export CSV</button></div>';
    if (!data.users.length) { main().innerHTML = h + '<div class="card empty">No accounts yet. Visitors create free accounts in the Profile Designer to save designs and download files.</div>'; return bindUsers(); }
    h += '<div class="card table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th class="hide-sm">Company</th><th class="hide-sm">Role</th><th class="hide-sm">ZIP</th><th class="hide-sm">Joined</th><th class="hide-sm">Last Sign-In</th><th>Designs</th><th>Sent</th><th>Actions</th></tr></thead><tbody>' +
      list.map(function (u) {
        return '<tr data-id="' + esc(u.id) + '"><td><strong>' + esc(u.name) + '</strong>' + (u.disabled ? ' <span class="pill pill--off">Disabled</span>' : '') + '</td>' +
          '<td><a href="mailto:' + esc(u.email) + '" style="color:#b91c2c;font-weight:700">' + esc(u.email) + '</a>' + (u.phone ? '<small>' + esc(u.phone) + '</small>' : '') + '</td>' +
          '<td class="hide-sm">' + esc(u.company) + '</td><td class="hide-sm">' + esc(u.role) + '</td><td class="hide-sm">' + esc(u.zip) + '</td>' +
          '<td class="hide-sm">' + esc(day(u.createdAt)) + '</td><td class="hide-sm">' + esc(day(u.lastLoginAt)) + '</td>' +
          '<td>' + u.designs + '</td><td>' + u.submissions + '</td>' +
          '<td><div class="btns">' +
            (u.designs ? '<button type="button" class="btn btn--sm btn--ghost" data-ua="designs">View Designs</button>' : '') +
            '<button type="button" class="btn btn--sm btn--ghost" data-ua="reset">Reset Password</button>' +
            '<button type="button" class="btn btn--sm btn--ghost" data-ua="' + (u.disabled ? 'enable' : 'disable') + '">' + (u.disabled ? 'Enable' : 'Disable') + '</button>' +
            (me.role === 'admin' ? '<button type="button" class="btn btn--sm btn--danger" data-ua="delete">Delete</button>' : '') +
          '</div></td></tr>';
      }).join('') + '</tbody></table></div><div id="udesigns"></div>';
    main().innerHTML = h;
    bindUsers();
  }
  function bindUsers() {
    var m = main();
    var qi = m.querySelector('[data-q]');
    if (qi) qi.addEventListener('input', function () { q = qi.value.trim().toLowerCase(); var pos = qi.selectionStart; viewUsers(); var n = main().querySelector('[data-q]'); n.focus(); n.setSelectionRange(pos, pos); });
    var cb = m.querySelector('[data-csv]');
    if (cb) cb.addEventListener('click', function () {
      csv([['Name', 'Email', 'Phone', 'Company', 'Role', 'ZIP', 'Joined', 'Last Sign-In', 'Saved Designs', 'Drawings Sent', 'Disabled']].concat(data.users.map(function (u) {
        return [u.name, u.email, u.phone, u.company, u.role, u.zip, u.createdAt, u.lastLoginAt, u.designs, u.submissions, u.disabled ? 'yes' : ''];
      })), 'profile-designer-users-' + new Date().toISOString().slice(0, 10) + '.csv');
    });
    m.querySelectorAll('[data-ua]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.closest('tr').getAttribute('data-id'), u = data.users.find(function (x) { return x.id === id; }), a = b.getAttribute('data-ua');
        if (a === 'designs') return api('GET', '/admin/users/' + id + '/designs').then(function (j) { showDesigns(u, j.designs); }).catch(function (x) { alert(x.message); });
        if (a === 'reset' && !confirm('Reset the password for ' + u.email + '? You\u2019ll get a temporary password to give them.')) return;
        if (a === 'delete' && !confirm('Delete ' + u.email + ' and all their saved designs? Submitted drawings stay in Submitted Drawings.')) return;
        var req = a === 'delete' ? api('DELETE', '/admin/users/' + id)
          : api('PATCH', '/admin/users/' + id, a === 'reset' ? { resetPassword: true } : { disabled: a === 'disable' });
        req.then(function (j) {
          return api('GET', '/admin/users').then(function (k) {
            data.users = k.users;
            viewUsers(j.tempPassword ? '<div class="card sub" style="margin-bottom:1rem"><strong>Temporary password for ' + esc(u.email) + ':</strong> <span class="temp">' + esc(j.tempPassword) + '</span><p style="margin:.5rem 0 0;font-size:.84rem;color:#5b6478">Give this to the user. They\u2019ll be asked to choose a new password when they sign in. It won\u2019t be shown again.</p></div>' : '');
          });
        }).catch(function (x) { alert(x.message); });
      });
    });
  }
  function showDesigns(u, designs) {
    var box = document.getElementById('udesigns');
    box.innerHTML = '<div class="bar" style="margin-top:1.5rem"><h2>' + esc(u.name) + '\u2019s Saved Designs</h2></div><div class="card table-wrap"><table><thead><tr><th>Profile</th><th>Project</th><th>Size</th><th>Updated</th><th>Files</th></tr></thead><tbody>' +
      designs.map(function (d, i) {
        return '<tr data-i="' + i + '"><td>' + thumb(d) + '<small>' + esc(d.name || 'Untitled') + '</small></td><td>' + esc(d.project) + '</td><td>' + esc(size(d)) + '</td><td>' + esc(day(d.updatedAt)) + '</td>' +
          '<td><div class="btns"><button type="button" class="btn btn--sm" data-dx="dxf">DXF</button><button type="button" class="btn btn--sm" data-dx="pdf">PDF</button><button type="button" class="btn btn--sm btn--ghost" data-dx="png">PNG</button></div></td></tr>';
      }).join('') + '</tbody></table></div>';
    box.querySelectorAll('[data-dx]').forEach(function (b) { b.addEventListener('click', function () { exportFile(designs[+b.closest('tr').getAttribute('data-i')], b.getAttribute('data-dx')); }); });
    box.scrollIntoView({ behavior: 'smooth' });
  }

  /* ---------------- Staff ---------------- */
  function viewStaff(flash) {
    var h = (flash || '') + '<div class="bar"><h2>Staff Logins</h2></div>' +
      '<form class="card sub" data-add style="margin-bottom:1rem"><span class="lbl" style="margin-top:0">Add a Staff Login</span><div class="grid2">' +
        '<label class="f" style="margin:0"><span>Name</span><input class="in" name="name" required></label>' +
        '<label class="f" style="margin:0"><span>Email</span><input class="in" name="email" type="email" required></label>' +
        '<label class="f" style="margin:0"><span>Access</span><select class="in" name="role"><option value="staff">Staff: drawings and users</option><option value="admin">Admin: everything, including staff</option></select></label>' +
        '<button class="btn btn--red" type="submit" style="height:44px">Add Login</button></div></form>' +
      '<div class="card table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Access</th><th class="hide-sm">Added</th><th class="hide-sm">Last Sign-In</th><th>Actions</th></tr></thead><tbody>' +
      data.staff.map(function (s) {
        var self = s.id === me.id;
        return '<tr data-id="' + esc(s.id) + '"><td><strong>' + esc(s.name) + '</strong>' + (self ? ' <small>You</small>' : '') + '</td><td>' + esc(s.email) + '</td>' +
          '<td><span class="pill' + (s.role === 'admin' ? ' pill--admin' : '') + '">' + esc(s.role) + '</span></td>' +
          '<td class="hide-sm">' + esc(day(s.createdAt)) + '</td><td class="hide-sm">' + esc(day(s.lastLoginAt)) + '</td>' +
          '<td><div class="btns">' + (self ? '' :
            '<button type="button" class="btn btn--sm btn--ghost" data-sa="role">' + (s.role === 'admin' ? 'Make Staff' : 'Make Admin') + '</button>' +
            '<button type="button" class="btn btn--sm btn--ghost" data-sa="reset">Reset Password</button>' +
            '<button type="button" class="btn btn--sm btn--danger" data-sa="delete">Remove</button>') + '</div></td></tr>';
      }).join('') + '</tbody></table></div>';
    main().innerHTML = h;
    var f = main().querySelector('[data-add]');
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      api('POST', '/admin/staff', { name: f.name.value.trim(), email: f.email.value.trim(), role: f.role.value }).then(function (j) {
        return api('GET', '/admin/staff').then(function (k) { data.staff = k.staff; viewStaff(tempBox(j.staff.email, j.tempPassword)); });
      }).catch(function (x) { alert(x.message); });
    });
    main().querySelectorAll('[data-sa]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.closest('tr').getAttribute('data-id'), s = data.staff.find(function (x) { return x.id === id; }), a = b.getAttribute('data-sa');
        if (a === 'delete' && !confirm('Remove the login for ' + s.email + '?')) return;
        var req = a === 'delete' ? api('DELETE', '/admin/staff/' + id) : api('PATCH', '/admin/staff/' + id, a === 'reset' ? { resetPassword: true } : { role: s.role === 'admin' ? 'staff' : 'admin' });
        req.then(function (j) { return api('GET', '/admin/staff').then(function (k) { data.staff = k.staff; viewStaff(j.tempPassword ? tempBox(s.email, j.tempPassword) : ''); }); })
          .catch(function (x) { alert(x.message); });
      });
    });
  }
  function tempBox(email, pw) {
    return '<div class="card sub" style="margin-bottom:1rem"><strong>Temporary password for ' + esc(email) + ':</strong> <span class="temp">' + esc(pw) + '</span><p style="margin:.5rem 0 0;font-size:.84rem;color:#5b6478">Share it privately. They\u2019ll choose their own password at first sign-in at americanprobp.com/pages/designer-admin.html. It won\u2019t be shown again.</p></div>';
  }

  /* ---------------- My password ---------------- */
  function viewAccount(flash) {
    main().innerHTML = (flash || '') + '<div class="bar"><h2>My Password</h2></div><form class="card sub" data-pw style="max-width:460px">' +
      '<label class="f"><span>Current Password</span><input class="in" name="current" type="password" autocomplete="current-password" required></label>' +
      '<label class="f"><span>New Password (10+ characters)</span><input class="in" name="next" type="password" autocomplete="new-password" minlength="10" required></label>' +
      '<button class="btn btn--red" type="submit">Update Password</button></form>';
    var f = main().querySelector('[data-pw]');
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      api('POST', '/admin/me/password', { current: f.current.value, next: f.next.value }).then(function (j) { setTok(j.token); viewAccount('<div class="msg msg--ok">Password updated.</div>'); })
        .catch(function (x) { viewAccount('<div class="msg">' + esc(x.message) + '</div>'); });
    });
  }

  /* ---------------- Boot ---------------- */
  function boot() {
    if (!tok()) return login();
    api('GET', '/admin/me').then(function (j) {
      me = j.staff; me.mustChange = j.mustChange;
      if (me.mustChange) return login('', true);
      refresh();
    }).catch(function (x) { if (x.message !== 'signed out') login(x.message); });
  }
  boot();
})();
