/* American Pro Profile Designer
   Browser-based 2D cross-section sketcher for custom PVC moulding profiles.
   - Straight segments and arcs (bulge/cove), grid snap, typed length + angle
   - Shop-drawing dimension labels and overall width/height
   - Exports DXF (LINE/ARC, true scale), PDF shop drawing (jsPDF), PNG
   - "Attach to My Request" hands the files to the Custom Profiles form
   Geometry is stored in inches, Y up (CAD convention). */
(function () {
  'use strict';

  var app = document.querySelector('[data-pd]');
  if (!app) return;

  /* ============ State ============ */
  var STORE = 'apProfileDesigner.v1';
  var S = {
    pts: [],        // [{x, y}] inches
    bul: [],        // bulge per segment i (pts[i] -> pts[i+1], last = closing)
    closed: false,
    name: '',
    project: '',
    units: 'frac',  // frac | dec | mm
    grid: 1 / 16,
    snap: true,
    dims: true
  };
  var V = { s: 160, ox: 0, oy: 0 };       // px per inch, screen origin
  var tool = 'draw';                      // draw | select | pan
  var sel = null;                         // {type:'pt'|'seg', i}
  var hover = null;
  var cursor = null;                      // snapped CAD point under cursor
  var drawing = false;                    // actively adding to an open chain
  var undo = [], redo = [];

  var svg = app.querySelector('[data-pd-svg]');
  var stage = app.querySelector('[data-pd-stage]');
  var panel = app.querySelector('[data-pd-panel]');
  var status = app.querySelector('[data-pd-status]');
  var hint = app.querySelector('[data-pd-hint]');

  /* ============ Shared engine (js/profile-engine.js) ============ */
  var E = window.APProfileEngine.bind(S);
  var MM = E.MM, isMM = E.isMM, fmtLen = E.fmtLen, fmtNum = E.fmtNum, parseLen = E.parseLen, fmtAng = E.fmtAng;
  var segCount = E.segCount, segEnds = E.segEnds, arcInfo = E.arcInfo, segPoints = E.segPoints, segMid = E.segMid;
  var segLen = E.segLen, segAngle = E.segAngle, outline = E.outline, bbox = E.bbox, area = E.area, signedArea = E.signedArea;
  var dimLabels = E.dimLabels, slug = E.slug, dxf = E.dxf, pdf = E.pdf, png = E.png;

  /* ============ View transforms ============ */
  function toScr(p) { return { x: V.ox + p.x * V.s, y: V.oy - p.y * V.s }; }
  function toCad(x, y) { return { x: (x - V.ox) / V.s, y: (V.oy - y) / V.s }; }
  function stageSize() { var r = stage.getBoundingClientRect(); return { w: r.width, h: r.height, l: r.left, t: r.top }; }
  function fit() {
    var sz = stageSize(), bb = bbox();
    if (!bb || (bb.w < 1e-6 && bb.h < 1e-6)) {
      V.s = Math.max(60, Math.min(220, sz.w / 7));
      V.ox = sz.w * 0.18; V.oy = sz.h * 0.78;
      return render();
    }
    var pad = Math.max(48, Math.min(110, sz.w * 0.11));
    var s = Math.min((sz.w - pad * 2) / Math.max(bb.w, 0.25), (sz.h - pad * 2) / Math.max(bb.h, 0.25));
    V.s = Math.max(20, Math.min(900, s));
    V.ox = sz.w / 2 - ((bb.x0 + bb.x1) / 2) * V.s;
    V.oy = sz.h / 2 + ((bb.y0 + bb.y1) / 2) * V.s;
    render();
  }
  function zoomAt(f, sx, sy) {
    var ns = Math.max(12, Math.min(1600, V.s * f));
    f = ns / V.s;
    V.ox = sx - (sx - V.ox) * f;
    V.oy = sy - (sy - V.oy) * f;
    V.s = ns;
    render();
  }

  /* ============ Snapping ============ */
  function gridStep() { return isMM() ? S.grid / MM : S.grid; }
  function snapPt(raw, opts) {
    opts = opts || {};
    // vertex snap first
    var best = null, bd = 11;
    S.pts.forEach(function (p, i) {
      if (opts.skip === i) return;
      var sp = toScr(p), rp = toScr(raw), d = Math.hypot(sp.x - rp.x, sp.y - rp.y);
      if (d < bd) { bd = d; best = { x: p.x, y: p.y, vi: i }; }
    });
    if (best) return best;
    var p = { x: raw.x, y: raw.y };
    if (opts.ortho && opts.from) {
      var dx = p.x - opts.from.x, dy = p.y - opts.from.y, L = Math.hypot(dx, dy);
      var a = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12);
      if (S.snap) { var g = gridStep(); L = Math.round(L / g) * g; }
      return { x: opts.from.x + Math.cos(a) * L, y: opts.from.y + Math.sin(a) * L };
    }
    if (S.snap) { var g2 = gridStep(); p.x = Math.round(p.x / g2) * g2; p.y = Math.round(p.y / g2) * g2; }
    return p;
  }

  /* ============ History & persistence ============ */
  function snapshot() { return JSON.stringify({ pts: S.pts, bul: S.bul, closed: S.closed }); }
  function commit() { undo.push(snapshot()); if (undo.length > 200) undo.shift(); redo = []; }
  function restore(js) { var o = JSON.parse(js); S.pts = o.pts; S.bul = o.bul; S.closed = o.closed; sel = null; drawing = !S.closed && S.pts.length > 0 && drawing; }
  function doUndo() { if (!undo.length) return; redo.push(snapshot()); restore(undo.pop()); changed(); }
  function doRedo() { if (!redo.length) return; undo.push(snapshot()); restore(redo.pop()); changed(); }
  /* Guests: drawing lives only in this browser tab (sessionStorage), no saving.
     Signed-in users: working draft kept in localStorage + named saves on the server. */
  var account = null, designId = null;
  function hasToken() { try { return !!localStorage.getItem('apDesignerToken'); } catch (e) { return false; } }
  function store() { try { return hasToken() ? localStorage : sessionStorage; } catch (e) { return null; } }
  var saveT;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(function () {
      var st = store();
      try { if (st) st.setItem(STORE, JSON.stringify(Object.assign({ _id: designId }, S))); } catch (e) { /* storage full or blocked */ }
    }, 250);
  }
  function load() {
    try {
      var st = store();
      var o = JSON.parse((st && st.getItem(STORE)) || 'null');
      if (o && o._id) designId = o._id;
      if (o && Array.isArray(o.pts)) Object.keys(S).forEach(function (k) { if (k in o) S[k] = o[k]; });
    } catch (e) { /* ignore */ }
  }
  function changed() { save(); render(); renderPanel(); }

  /* ============ Editing ops ============ */
  function addPoint(p) {
    commit();
    if (S.closed) return;
    if (p.vi === 0 && S.pts.length >= 3) { S.closed = true; S.bul[S.pts.length - 1] = 0; drawing = false; sel = null; changed(); toast('Shape closed'); return; }
    if (S.pts.length) { var l = S.pts[S.pts.length - 1]; if (Math.hypot(l.x - p.x, l.y - p.y) < 1e-6) { undo.pop(); return; } }
    S.pts.push({ x: round6(p.x), y: round6(p.y) });
    S.bul[S.pts.length - 1] = 0;
    drawing = true;
    changed();
  }
  function round6(v) { return Math.round(v * 1e6) / 1e6; }
  function closeShape() {
    if (S.closed || S.pts.length < 3) return toast('Add at least 3 points to close the shape');
    commit(); S.closed = true; S.bul[S.pts.length - 1] = 0; drawing = false; changed(); toast('Shape closed');
  }
  function finish() { drawing = false; cursor = null; render(); renderPanel(); }
  function deleteSel() {
    if (!sel) return;
    commit();
    if (sel.type === 'pt') {
      S.pts.splice(sel.i, 1); S.bul.splice(sel.i, 1);
      if (S.pts.length < 3) S.closed = false;
    } else if (sel.type === 'seg') {
      if (S.closed) {
        // open the shape at this segment: rotate so the segment becomes the gap
        var n = S.pts.length, k = (sel.i + 1) % n;
        S.pts = S.pts.slice(k).concat(S.pts.slice(0, k));
        S.bul = S.bul.slice(k).concat(S.bul.slice(0, k));
        S.closed = false;
      } else {
        S.bul[sel.i] = 0;
      }
    }
    sel = null; changed();
  }
  function insertPoint(i) {
    commit();
    var m = segMid(i), b = S.bul[i] || 0;
    var nb = b ? Math.tan(Math.atan(b) / 2) : 0; // each half keeps the same arc
    S.pts.splice(i + 1, 0, { x: round6(m.x), y: round6(m.y) });
    S.bul.splice(i, 1, nb, nb);
    sel = { type: 'pt', i: i + 1 }; changed();
  }
  function setArc(i, radius, dir) {
    var e = segEnds(i), c = Math.hypot(e[1].x - e[0].x, e[1].y - e[0].y);
    if (!(radius > 0)) return;
    if (radius < c / 2 - 1e-9) { toast('Radius must be at least half the segment span (' + fmtLen(c / 2) + ')'); return false; }
    var half = Math.asin(Math.min(1, c / (2 * radius)));       // half of included angle
    var b = Math.tan(half / 2) * (dir < 0 ? -1 : 1);
    commit(); S.bul[i] = b; changed(); return true;
  }
  function arcDir(i) {
    // +1 = bulges away from the shape centre (bead/convex), -1 = into the shape (cove)
    var b = S.bul[i] || 0; if (!b) return 1;
    var bb = bbox(), e = segEnds(i), m = segMid(i);
    var chordMid = { x: (e[0].x + e[1].x) / 2, y: (e[0].y + e[1].y) / 2 };
    var cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
    var out = (m.x - chordMid.x) * (chordMid.x - cx) + (m.y - chordMid.y) * (chordMid.y - cy);
    return out >= 0 ? 1 : -1;
  }
  function makeArc(i, wantDir, radius) {
    var e = segEnds(i), c = Math.hypot(e[1].x - e[0].x, e[1].y - e[0].y);
    radius = radius || c / 2;
    // try +, check direction relative to centre, flip if needed
    var half = Math.asin(Math.min(1, c / (2 * radius))), b = Math.tan(half / 2);
    commit();
    S.bul[i] = b;
    if (arcDir(i) !== wantDir) S.bul[i] = -b;
    changed();
  }
  function flipArc(i) { commit(); S.bul[i] = -(S.bul[i] || 0); changed(); }
  function setSegLenAng(i, L, angDeg) {
    var e = segEnds(i), a = angDeg * Math.PI / 180;
    var n = S.pts.length, j = (i + 1) % n;
    if (S.closed && j === 0) { toast('Edit the closing segment by moving its points'); return; }
    commit();
    S.pts[j] = { x: round6(e[0].x + Math.cos(a) * L), y: round6(e[0].y + Math.sin(a) * L) };
    changed();
  }
  function addByLenAng(L, angDeg) {
    if (S.closed) return toast('Shape is closed. Select a segment to edit it.');
    if (!S.pts.length) addPoint({ x: 0, y: 0 });
    var l = S.pts[S.pts.length - 1], a = angDeg * Math.PI / 180;
    addPoint({ x: l.x + Math.cos(a) * L, y: l.y + Math.sin(a) * L });
    drawing = true;
    fitIfOffscreen();
  }
  function fitIfOffscreen() {
    var bb = bbox(); if (!bb) return;
    var sz = stageSize(), a = toScr({ x: bb.x0, y: bb.y1 }), b = toScr({ x: bb.x1, y: bb.y0 });
    if (a.x < 30 || a.y < 30 || b.x > sz.w - 30 || b.y > sz.h - 30) fit();
  }
  function clearAll() {
    if (S.pts.length && !confirm('Clear the drawing and start over?')) return;
    commit(); designId = null; S.pts = []; S.bul = []; S.closed = false; sel = null; drawing = false; changed(); fit();
  }
  function arcRaw(i, dir, radius) {
    var e = segEnds(i), c = Math.hypot(e[1].x - e[0].x, e[1].y - e[0].y);
    var b = Math.tan(Math.asin(Math.min(1, c / (2 * radius))) / 2);
    S.bul[i] = b;
    if (arcDir(i) !== dir) S.bul[i] = -b;
  }
  function loadExample() {
    if (S.pts.length && !confirm('Replace your drawing with the example profile?')) return;
    commit();
    // 3-1/4" x 3/4" casing-style profile with two rounds and a cove
    S.pts = [
      { x: 0, y: 0 }, { x: 3.25, y: 0 }, { x: 3.25, y: 0.5 }, { x: 3.0, y: 0.75 },
      { x: 2.25, y: 0.75 }, { x: 1.5, y: 0.75 }, { x: 1.25, y: 0.625 }, { x: 0.5, y: 0.5 },
      { x: 0.25, y: 0.5 }, { x: 0, y: 0.25 }
    ];
    S.bul = S.pts.map(function () { return 0; });
    S.closed = true;
    arcRaw(2, 1, 0.25);
    arcRaw(4, -1, 0.5);
    arcRaw(8, 1, 0.25);
    if (!S.name) S.name = 'Example casing';
    sel = null; drawing = false;
    changed(); fit();
  }

  /* ============ Render (screen SVG) ============ */
  var NS = 'http://www.w3.org/2000/svg';
  function pathFrom(pts, close) {
    return pts.map(function (p, k) { var s = toScr(p); return (k ? 'L' : 'M') + s.x.toFixed(2) + ' ' + s.y.toFixed(2); }).join('') + (close ? 'Z' : '');
  }
  function render() {
    var sz = stageSize();
    svg.setAttribute('viewBox', '0 0 ' + sz.w + ' ' + sz.h);
    svg.setAttribute('width', sz.w); svg.setAttribute('height', sz.h);
    var h = [];
    // grid
    var g = gridStep(), minor = g;
    while (minor * V.s < 7) minor *= 2;
    var major = isMM() ? 10 / MM : 1;
    while (major * V.s < 40) major *= 2;
    var tl = toCad(0, 0), br = toCad(sz.w, sz.h);
    var lines = function (step, cls) {
      var d = '';
      for (var x = Math.ceil(tl.x / step) * step; x <= br.x; x += step) { var sx = V.ox + x * V.s; d += 'M' + sx.toFixed(1) + ' 0V' + sz.h; }
      for (var y = Math.ceil(br.y / step) * step; y <= tl.y; y += step) { var sy = V.oy - y * V.s; d += 'M0 ' + sy.toFixed(1) + 'H' + sz.w; }
      return '<path class="' + cls + '" d="' + d + '"/>';
    };
    h.push(lines(minor, 'pd-g1'), lines(major, 'pd-g2'));
    // axes
    h.push('<path class="pd-axis" d="M' + V.ox + ' 0V' + sz.h + 'M0 ' + V.oy + 'H' + sz.w + '"/>');
    // ruler labels on major lines
    var lab = '';
    for (var lx = Math.ceil(tl.x / major) * major; lx <= br.x; lx += major) { var sx2 = V.ox + lx * V.s; lab += '<text class="pd-rl" x="' + (sx2 + 3) + '" y="' + (sz.h - 6) + '">' + fmtNum(round6(lx)) + '</text>'; }
    for (var ly = Math.ceil(br.y / major) * major; ly <= tl.y; ly += major) { var sy2 = V.oy - ly * V.s; lab += '<text class="pd-rl" x="4" y="' + (sy2 - 3) + '">' + fmtNum(round6(ly)) + '</text>'; }
    h.push(lab);

    var out = outline();
    if (S.closed && out.length > 2) h.push('<path class="pd-fill" d="' + pathFrom(out, true) + '"/>');
    // segments
    for (var i = 0; i < segCount(); i++) {
      var cls = 'pd-seg' + (S.bul[i] ? ' is-arc' : '') + (sel && sel.type === 'seg' && sel.i === i ? ' is-sel' : '') + (hover && hover.type === 'seg' && hover.i === i ? ' is-hover' : '');
      h.push('<path class="' + cls + '" d="' + pathFrom(segPoints(i)) + '"/>');
    }
    // preview
    if (tool === 'draw' && drawing && cursor && S.pts.length && !S.closed) {
      var last = S.pts[S.pts.length - 1];
      h.push('<path class="pd-preview" d="' + pathFrom([last, cursor]) + '"/>');
      var L = Math.hypot(cursor.x - last.x, cursor.y - last.y);
      if (L > 1e-6) {
        var a = Math.atan2(cursor.y - last.y, cursor.x - last.x) * 180 / Math.PI;
        var cs = toScr(cursor);
        h.push('<g class="pd-tip" transform="translate(' + (cs.x + 14) + ' ' + (cs.y - 14) + ')"><rect x="0" y="-16" rx="5" width="' + (fmtLen(L).length * 7.4 + fmtAng(a).length * 7 + 22) + '" height="22"/><text x="8" y="0">' + esc(fmtLen(L)) + '  \u2220 ' + fmtAng(a) + '</text></g>');
      }
    }
    // dimension labels
    if (S.dims) {
      var placed = [];
      dimLabels().map(function (d) { d.L = segLen(d.i) * V.s; return d; })
        .sort(function (a, b) { return (S.bul[b.i] ? 1e6 : 0) + b.L - ((S.bul[a.i] ? 1e6 : 0) + a.L); })
        .forEach(function (d) {
        if (d.L < 14) return;
        var s = toScr({ x: d.x, y: d.y });
        var w = d.text.length * 6.6 + 10;
        var px = s.x + d.nx * (12 + Math.abs(d.nx) * w / 2), py = s.y - d.ny * 16;
        var box = { x0: px - w / 2 - 2, x1: px + w / 2 + 2, y0: py - 11, y1: py + 11 };
        if (placed.some(function (q) { return box.x0 < q.x1 && box.x1 > q.x0 && box.y0 < q.y1 && box.y1 > q.y0; })) return;
        placed.push(box);
        h.push('<g class="pd-dim' + (S.bul[d.i] ? ' is-arc' : '') + '" transform="translate(' + px.toFixed(1) + ' ' + py.toFixed(1) + ')"><rect x="' + (-w / 2) + '" y="-9" width="' + w + '" height="18" rx="4"/><text text-anchor="middle" y="4">' + esc(d.text) + '</text></g>');
      });
      var bb = bbox();
      if (bb && S.pts.length > 1 && (bb.w > 1e-6 || bb.h > 1e-6)) {
        var A = toScr({ x: bb.x0, y: bb.y0 }), B = toScr({ x: bb.x1, y: bb.y1 });
        var yb = A.y + 52, xl = A.x - 78;
        if (bb.w > 1e-6) h.push(dimLine(A.x, yb, B.x, yb, 'W ' + fmtLen(bb.w), A.y, 'h'));
        if (bb.h > 1e-6) h.push(dimLine(xl, A.y, xl, B.y, 'H ' + fmtLen(bb.h), A.x, 'v'));
      }
    }
    // vertices
    S.pts.forEach(function (p, k) {
      var s = toScr(p);
      var c = 'pd-pt' + (k === 0 ? ' is-first' : '') + (sel && sel.type === 'pt' && sel.i === k ? ' is-sel' : '') + (hover && hover.type === 'pt' && hover.i === k ? ' is-hover' : '');
      h.push('<circle class="' + c + '" cx="' + s.x.toFixed(2) + '" cy="' + s.y.toFixed(2) + '" r="' + (k === 0 && drawing && S.pts.length > 2 ? 7 : 5) + '"/>');
    });
    if (tool === 'draw' && cursor && !S.closed) {
      var cs2 = toScr(cursor);
      h.push('<circle class="pd-cursor' + (cursor.vi === 0 && S.pts.length > 2 ? ' is-close' : '') + '" cx="' + cs2.x + '" cy="' + cs2.y + '" r="' + (cursor.vi != null ? 9 : 4) + '"/>');
    }
    svg.innerHTML = h.join('');
    updateStatus();
    hint.hidden = S.pts.length > 0;
  }
  function dimLine(x1, y1, x2, y2, text, ext, dir) {
    var o = '<g class="pd-odim">';
    if (dir === 'h') {
      o += '<path d="M' + x1 + ' ' + (ext + 6) + 'V' + (y1 + 6) + 'M' + x2 + ' ' + (ext + 6) + 'V' + (y1 + 6) + 'M' + x1 + ' ' + y1 + 'H' + x2 + '"/>';
      o += arrow(x1, y1, 0) + arrow(x2, y1, 180);
      var w = text.length * 7 + 14, mx = (x1 + x2) / 2;
      o += '<rect x="' + (mx - w / 2) + '" y="' + (y1 - 10) + '" width="' + w + '" height="20" rx="4"/><text text-anchor="middle" x="' + mx + '" y="' + (y1 + 4) + '">' + esc(text) + '</text>';
    } else {
      o += '<path d="M' + (ext - 6) + ' ' + y1 + 'H' + (x1 - 6) + 'M' + (ext - 6) + ' ' + y2 + 'H' + (x1 - 6) + 'M' + x1 + ' ' + y1 + 'V' + y2 + '"/>';
      o += arrow(x1, y1, 270) + arrow(x1, y2, 90);
      var my = (y1 + y2) / 2, w2 = text.length * 7 + 14;
      o += '<g transform="translate(' + x1 + ' ' + my + ') rotate(-90)"><rect x="' + (-w2 / 2) + '" y="-10" width="' + w2 + '" height="20" rx="4"/><text text-anchor="middle" y="4">' + esc(text) + '</text></g>';
    }
    return o + '</g>';
  }
  function arrow(x, y, deg) {
    return '<path class="pd-arrow" transform="translate(' + x + ' ' + y + ') rotate(' + deg + ')" d="M0 0L9 -4L9 4Z"/>';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function updateStatus() {
    var bb = bbox();
    var parts = [];
    if (cursor) parts.push('X ' + fmtLen(cursor.x) + '  Y ' + fmtLen(cursor.y));
    if (bb && S.pts.length > 1) parts.push('Overall ' + fmtLen(bb.w) + ' W \u00d7 ' + fmtLen(bb.h) + ' H');
    parts.push(S.pts.length + ' point' + (S.pts.length === 1 ? '' : 's'));
    parts.push(S.closed ? 'Closed shape' : (S.pts.length ? 'Open shape' : 'Empty'));
    status.textContent = parts.join('   \u00b7   ');
    var closedEl = app.querySelector('[data-pd-closed]');
    if (closedEl) { closedEl.textContent = S.closed ? 'Closed' : 'Open'; closedEl.classList.toggle('is-ok', S.closed); }
  }

  /* ============ Inspector panel ============ */
  function field(label, id, val, extra) {
    return '<label class="pd-field"><span>' + label + '</span><input id="' + id + '" type="text" inputmode="decimal" value="' + esc(val) + '" ' + (extra || '') + '/></label>';
  }
  function renderPanel() {
    var unitWord = isMM() ? 'mm' : 'inches';
    var h = '';
    if (sel && sel.type === 'pt' && S.pts[sel.i]) {
      var p = S.pts[sel.i];
      h += '<div class="pd-sec"><h3>Point ' + (sel.i + 1) + '</h3>' +
        '<div class="pd-row">' + field('X (' + unitWord + ')', 'pd-px', fmtNum(p.x)) + field('Y (' + unitWord + ')', 'pd-py', fmtNum(p.y)) + '</div>' +
        '<div class="pd-btns"><button type="button" class="pd-btn" data-act="pt-apply">Move Point</button><button type="button" class="pd-btn pd-btn--danger" data-act="del">Delete Point</button></div></div>';
    } else if (sel && sel.type === 'seg' && sel.i < segCount()) {
      var i = sel.i, b = S.bul[i] || 0, e = segEnds(i);
      h += '<div class="pd-sec"><h3>Segment ' + (i + 1) + '</h3>' +
        '<div class="pd-seg-type" role="radiogroup" aria-label="Segment type">' +
          '<button type="button" class="pd-chip' + (!b ? ' is-on' : '') + '" data-act="to-line">Straight</button>' +
          '<button type="button" class="pd-chip' + (b && arcDir(i) > 0 ? ' is-on' : '') + '" data-act="to-bead">Round Out</button>' +
          '<button type="button" class="pd-chip' + (b && arcDir(i) < 0 ? ' is-on' : '') + '" data-act="to-cove">Cove In</button>' +
        '</div>';
      if (!b) {
        h += '<div class="pd-row">' + field('Length (' + unitWord + ')', 'pd-sl', fmtNum(segLen(i))) + field('Angle (\u00b0)', 'pd-sa', String(Math.round(segAngle(i) * 100) / 100)) + '</div>' +
          '<p class="pd-note">Angle: 0\u00b0 right, 90\u00b0 up, 180\u00b0 left, -90\u00b0 down. Changing these moves the segment\u2019s end point.</p>' +
          '<div class="pd-btns"><button type="button" class="pd-btn" data-act="seg-apply">Apply</button><button type="button" class="pd-btn pd-btn--ghost" data-act="insert">Add Point in Middle</button></div>';
      } else {
        var A = arcInfo(e[0], e[1], b);
        h += '<div class="pd-row">' + field('Radius (' + unitWord + ')', 'pd-ar', fmtNum(A.r)) + '<div class="pd-field pd-field--ro"><span>Arc length</span><output>' + fmtLen(A.len) + '</output></div></div>' +
          '<p class="pd-note">Smallest radius for this span: ' + fmtLen(A.chord / 2) + ' (half circle).</p>' +
          '<div class="pd-btns"><button type="button" class="pd-btn" data-act="arc-apply">Apply Radius</button><button type="button" class="pd-btn pd-btn--ghost" data-act="flip">Flip Curve</button><button type="button" class="pd-btn pd-btn--ghost" data-act="insert">Add Point</button></div>';
      }
      h += '<div class="pd-btns"><button type="button" class="pd-btn pd-btn--danger" data-act="del">' + (S.closed ? 'Open Shape Here' : 'Make Straight') + '</button></div></div>';
    } else {
      h += '<div class="pd-sec"><h3>' + (S.closed ? 'Shape Complete' : 'Add a Segment') + '</h3>';
      if (S.closed) {
        h += '<p class="pd-note">Click any segment to change its length or angle, or turn it into a round or cove. Drag points to adjust them.</p>';
      } else {
        h += '<p class="pd-note">' + (S.pts.length ? 'Type the next segment from the last point, or click on the grid.' : 'Click the grid to place your first point, or type a length to start at 0, 0.') + '</p>' +
          '<div class="pd-row">' + field('Length (' + unitWord + ')', 'pd-nl', '', 'placeholder="' + (isMM() ? 'e.g. 41.3' : 'e.g. 1-5/8') + '" enterkeyhint="next"') + field('Angle (\u00b0)', 'pd-na', '0', 'enterkeyhint="done"') + '</div>' +
          '<div class="pd-angles" aria-label="Angle shortcuts">' + [['\u2192', 0], ['\u2191', 90], ['\u2190', 180], ['\u2193', -90], ['\u2197', 45], ['\u2196', 135], ['\u2199', -135], ['\u2198', -45]].map(function (a) { return '<button type="button" class="pd-ang" data-ang="' + a[1] + '" title="' + a[1] + '\u00b0">' + a[0] + '</button>'; }).join('') + '</div>' +
          '<div class="pd-btns"><button type="button" class="pd-btn" data-act="add">Add Segment</button>' + (S.pts.length >= 3 ? '<button type="button" class="pd-btn pd-btn--ghost" data-act="close">Close Shape</button>' : '') + '</div>';
      }
      h += '</div>';
    }
    // drawing settings
    h += '<div class="pd-sec"><h3>Drawing</h3>' +
      '<label class="pd-field"><span>Profile name</span><input id="pd-name" type="text" maxlength="60" value="' + esc(S.name) + '" placeholder="e.g. Front porch crown" /></label>' +
      '<label class="pd-field"><span>Project</span><input id="pd-project" type="text" maxlength="60" value="' + esc(S.project) + '" placeholder="e.g. 1908 Victorian, Cape May" /></label>' +
      '<div class="pd-row">' +
        '<label class="pd-field"><span>Units</span><select id="pd-units"><option value="frac"' + (S.units === 'frac' ? ' selected' : '') + '>Inches (fractions)</option><option value="dec"' + (S.units === 'dec' ? ' selected' : '') + '>Inches (decimal)</option><option value="mm"' + (S.units === 'mm' ? ' selected' : '') + '>Millimeters</option></select></label>' +
        '<label class="pd-field"><span>Grid</span><select id="pd-grid">' + gridOptions() + '</select></label>' +
      '</div>' +
      '<label class="pd-check"><input type="checkbox" id="pd-snap"' + (S.snap ? ' checked' : '') + ' /> Snap to grid</label>' +
      '<label class="pd-check"><input type="checkbox" id="pd-dims"' + (S.dims ? ' checked' : '') + ' /> Show dimensions</label>' +
      '<div class="pd-btns"><button type="button" class="pd-btn pd-btn--ghost" data-act="example">Load Example</button><button type="button" class="pd-btn pd-btn--ghost" data-act="clear">Clear</button></div>' +
      '</div>';
    panel.innerHTML = h;
  }
  function gridOptions() {
    var opts = isMM() ? [[1, '1 mm'], [2, '2 mm'], [5, '5 mm'], [10, '10 mm']] : [[1 / 64, '1/64"'], [1 / 32, '1/32"'], [1 / 16, '1/16"'], [1 / 8, '1/8"'], [1 / 4, '1/4"']];
    return opts.map(function (o) { return '<option value="' + o[0] + '"' + (Math.abs(o[0] - S.grid) < 1e-9 ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('');
  }
  function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }

  panel.addEventListener('click', function (e) {
    var ang = e.target.closest('[data-ang]');
    if (ang) { var na = document.getElementById('pd-na'); if (na) na.value = ang.getAttribute('data-ang'); var nl = document.getElementById('pd-nl'); if (nl && nl.value) act('add'); else if (nl) nl.focus(); return; }
    var b = e.target.closest('[data-act]');
    if (b) act(b.getAttribute('data-act'));
  });
  panel.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    var id = e.target.id;
    if (id === 'pd-nl') { e.preventDefault(); document.getElementById('pd-na').focus(); document.getElementById('pd-na').select(); }
    else if (id === 'pd-na') { e.preventDefault(); act('add'); }
    else if (id === 'pd-px' || id === 'pd-py') { e.preventDefault(); act('pt-apply'); }
    else if (id === 'pd-sl' || id === 'pd-sa') { e.preventDefault(); act('seg-apply'); }
    else if (id === 'pd-ar') { e.preventDefault(); act('arc-apply'); }
  });
  panel.addEventListener('change', function (e) {
    var id = e.target.id;
    if (id === 'pd-units') {
      var was = isMM(); S.units = e.target.value;
      if (was !== isMM()) S.grid = isMM() ? 1 : 1 / 16;
      changed();
    } else if (id === 'pd-grid') { S.grid = parseFloat(e.target.value); changed(); }
    else if (id === 'pd-snap') { S.snap = e.target.checked; save(); }
    else if (id === 'pd-dims') { S.dims = e.target.checked; save(); render(); }
  });
  panel.addEventListener('input', function (e) {
    if (e.target.id === 'pd-name') { S.name = e.target.value; save(); }
    if (e.target.id === 'pd-project') { S.project = e.target.value; save(); }
  });

  function act(a) {
    var i = sel ? sel.i : -1;
    switch (a) {
      case 'add': {
        var L = parseLen(val('pd-nl')), an = parseFloat(val('pd-na'));
        if (!(L > 0)) { toast('Enter a length, for example ' + (isMM() ? '41.3' : '1-5/8')); var f = document.getElementById('pd-nl'); if (f) f.focus(); return; }
        addByLenAng(L, isFinite(an) ? an : 0);
        setTimeout(function () { var f2 = document.getElementById('pd-nl'); if (f2) { f2.focus(); } }, 0);
        break;
      }
      case 'close': closeShape(); break;
      case 'pt-apply': {
        var x = parseLen(val('pd-px')), y = parseLen(val('pd-py'));
        if (!isFinite(x) || !isFinite(y)) return toast('Enter X and Y values');
        commit(); S.pts[i] = { x: round6(x), y: round6(y) }; changed(); break;
      }
      case 'seg-apply': {
        var sl = parseLen(val('pd-sl')), sa = parseFloat(val('pd-sa'));
        if (!(sl > 0) || !isFinite(sa)) return toast('Enter a length and an angle');
        setSegLenAng(i, sl, sa); break;
      }
      case 'arc-apply': {
        var r = parseLen(val('pd-ar'));
        if (!(r > 0)) return toast('Enter a radius');
        var dir = (S.bul[i] || 0) < 0 ? -1 : 1;
        setArc(i, r, dir); break;
      }
      case 'to-line': if (S.bul[i]) { commit(); S.bul[i] = 0; changed(); } break;
      case 'to-bead': makeArc(i, 1, S.bul[i] ? arcInfo(segEnds(i)[0], segEnds(i)[1], S.bul[i]).r : 0); break;
      case 'to-cove': makeArc(i, -1, S.bul[i] ? arcInfo(segEnds(i)[0], segEnds(i)[1], S.bul[i]).r : 0); break;
      case 'flip': flipArc(i); break;
      case 'insert': insertPoint(i); break;
      case 'del': deleteSel(); break;
      case 'example': loadExample(); break;
      case 'clear': clearAll(); break;
    }
  }

  /* ============ Toolbar ============ */
  app.querySelector('[data-pd-tools]').addEventListener('click', function (e) {
    var b = e.target.closest('[data-tool],[data-cmd]');
    if (!b) return;
    if (b.hasAttribute('data-tool')) setTool(b.getAttribute('data-tool'));
    var c = b.getAttribute('data-cmd'), sz = stageSize();
    if (c === 'undo') doUndo();
    if (c === 'redo') doRedo();
    if (c === 'zin') zoomAt(1.25, sz.w / 2, sz.h / 2);
    if (c === 'zout') zoomAt(0.8, sz.w / 2, sz.h / 2);
    if (c === 'fit') fit();
    if (c === 'close') closeShape();
    if (c === 'finish') finish();
  });
  function setTool(t) {
    tool = t;
    if (t !== 'draw') { drawing = false; cursor = null; }
    else if (!S.closed && S.pts.length) drawing = true;
    app.querySelectorAll('[data-tool]').forEach(function (b) { b.classList.toggle('is-on', b.getAttribute('data-tool') === t); b.setAttribute('aria-pressed', b.getAttribute('data-tool') === t); });
    stage.setAttribute('data-mode', t);
    render();
  }

  /* ============ Pointer interaction ============ */
  var ptrs = new Map(), drag = null, pinch = null, downAt = null, moved = false;
  function local(e) { var r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function hitTest(sx, sy) {
    for (var k = S.pts.length - 1; k >= 0; k--) { var s = toScr(S.pts[k]); if (Math.hypot(s.x - sx, s.y - sy) < 11) return { type: 'pt', i: k }; }
    var best = null, bd = 9;
    for (var i = 0; i < segCount(); i++) {
      var pts = segPoints(i).map(toScr);
      for (var j = 0; j < pts.length - 1; j++) {
        var d = distSeg(sx, sy, pts[j], pts[j + 1]);
        if (d < bd) { bd = d; best = { type: 'seg', i: i }; }
      }
    }
    return best;
  }
  function distSeg(px, py, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy, t = L ? ((px - a.x) * dx + (py - a.y) * dy) / L : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
  }
  var spaceDown = false;
  stage.addEventListener('pointerdown', function (e) {
    stage.setPointerCapture(e.pointerId);
    var p = local(e);
    ptrs.set(e.pointerId, p);
    moved = false; downAt = p;
    if (ptrs.size === 2) {
      var a = Array.from(ptrs.values());
      pinch = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), mx: (a[0].x + a[1].x) / 2, my: (a[0].y + a[1].y) / 2 };
      drag = null; return;
    }
    if (e.button === 1 || tool === 'pan' || spaceDown) { drag = { type: 'pan', x: p.x, y: p.y, ox: V.ox, oy: V.oy }; e.preventDefault(); return; }
    if (tool === 'select') {
      var h = hitTest(p.x, p.y);
      sel = h; renderPanel();
      if (h && h.type === 'pt') { commit(); drag = { type: 'pt', i: h.i, committed: true }; }
      else if (!h) drag = { type: 'pan', x: p.x, y: p.y, ox: V.ox, oy: V.oy, soft: true };
      render();
    } else if (tool === 'draw') {
      var h2 = hitTest(p.x, p.y);
      if (S.closed || (!drawing && h2 && S.pts.length)) {
        // Shape finished: clicking edits instead of drawing
        if (h2) { setTool('select'); sel = h2; renderPanel(); if (h2.type === 'pt') { commit(); drag = { type: 'pt', i: h2.i }; } render(); }
        else drag = { type: 'pan', x: p.x, y: p.y, ox: V.ox, oy: V.oy, soft: true };
        return;
      }
      drag = { type: 'place' };
    }
  });
  stage.addEventListener('pointermove', function (e) {
    var p = local(e);
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, p);
    if (downAt && Math.hypot(p.x - downAt.x, p.y - downAt.y) > 4) moved = true;
    if (pinch && ptrs.size === 2) {
      var a = Array.from(ptrs.values());
      var d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), mx = (a[0].x + a[1].x) / 2, my = (a[0].y + a[1].y) / 2;
      V.ox += mx - pinch.mx; V.oy += my - pinch.my;
      zoomAt(d / pinch.d, mx, my);
      pinch = { d: d, mx: mx, my: my };
      return;
    }
    if (drag && drag.type === 'pan') { V.ox = drag.ox + (p.x - drag.x); V.oy = drag.oy + (p.y - drag.y); render(); return; }
    if (drag && drag.type === 'pt') {
      var sp = snapPt(toCad(p.x, p.y), { skip: drag.i });
      S.pts[drag.i] = { x: round6(sp.x), y: round6(sp.y) };
      cursor = sp; render(); return;
    }
    var raw = toCad(p.x, p.y);
    if (tool === 'draw' && !S.closed) {
      cursor = snapPt(raw, { ortho: e.shiftKey, from: S.pts[S.pts.length - 1] });
      render();
    } else {
      var hv = e.pointerType === 'mouse' ? hitTest(p.x, p.y) : null;
      var ch = JSON.stringify(hv) !== JSON.stringify(hover);
      hover = hv; cursor = snapPt(raw); 
      if (ch) render(); else updateStatus();
      stage.style.cursor = tool === 'select' && hv ? (hv.type === 'pt' ? 'move' : 'pointer') : '';
    }
  });
  function endPtr(e) {
    var p = local(e);
    ptrs.delete(e.pointerId);
    if (pinch) { if (ptrs.size < 2) pinch = null; drag = null; return; }
    if (drag && drag.type === 'place' && !moved) {
      var sp = snapPt(toCad(p.x, p.y), { ortho: e.shiftKey, from: S.pts[S.pts.length - 1] });
      addPoint(sp);
    } else if (drag && drag.type === 'pt') {
      if (!moved) undo.pop(); // click without move: no history entry
      changed();
    } else if (drag && drag.type === 'pan' && drag.soft && !moved && tool === 'select') {
      sel = null; renderPanel(); render();
    }
    drag = null; downAt = null;
  }
  stage.addEventListener('pointerup', endPtr);
  stage.addEventListener('pointercancel', function (e) { ptrs.delete(e.pointerId); pinch = null; drag = null; });
  stage.addEventListener('pointerleave', function () { if (!drag) { cursor = null; hover = null; render(); } });
  stage.addEventListener('dblclick', function (e) { if (tool === 'draw' && drawing) { e.preventDefault(); finish(); } });
  stage.addEventListener('wheel', function (e) {
    e.preventDefault();
    var p = local(e);
    if (e.ctrlKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), p.x, p.y);
    else { V.ox -= e.deltaX; render(); }
  }, { passive: false });
  stage.addEventListener('contextmenu', function (e) { if (tool === 'draw' && drawing) { e.preventDefault(); finish(); } });

  document.addEventListener('keydown', function (e) {
    var t = e.target, typing = t && /^(input|textarea|select)$/i.test(t.tagName);
    var mod = e.metaKey || e.ctrlKey;
    if (mod && (e.key === 'z' || e.key === 'Z')) { if (typing) return; e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
    if (mod && (e.key === 'y' || e.key === 'Y')) { if (typing) return; e.preventDefault(); doRedo(); return; }
    if (typing || mod || document.querySelector('.ap-search.is-open')) return;
    if (e.key === ' ') { spaceDown = true; stage.style.cursor = 'grab'; e.preventDefault(); }
    else if (e.key === 'Escape') { if (drawing) finish(); else { sel = null; renderPanel(); render(); } }
    else if (e.key === 'Enter') { if (drawing) finish(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { if (sel) { e.preventDefault(); deleteSel(); } else if (drawing && S.pts.length) { e.preventDefault(); commit(); S.pts.pop(); S.bul.pop(); if (!S.pts.length) drawing = false; changed(); } }
    else if (e.key === 'd' || e.key === 'D' || e.key === 'l' || e.key === 'L') setTool('draw');
    else if (e.key === 'v' || e.key === 'V' || e.key === 's' || e.key === 'S') setTool('select');
    else if (e.key === 'h' || e.key === 'H') setTool('pan');
    else if (e.key === 'f' || e.key === 'F') fit();
    else if (e.key === 'c' || e.key === 'C') closeShape();
  });
  document.addEventListener('keyup', function (e) { if (e.key === ' ') { spaceDown = false; stage.style.cursor = ''; } });

  /* ============ Toast ============ */
  var toastEl = app.querySelector('[data-pd-toast]'), toastT;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add('is-on');
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2600);
    return false;
  }

  /* ============ Downloads & hand-off ============ */
  function needShape() {
    if (S.pts.length < 2) { toast('Draw your profile first'); return false; }
    return true;
  }
  function download(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function track(name, extra) {
    try {
      if (window.fbq) window.fbq('trackCustom', name, extra || {});
      (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: name }, extra || {}));
    } catch (e) { /* ignore */ }
  }
  app.querySelector('[data-pd-export]').addEventListener('click', function (e) {
    var b = e.target.closest('[data-exp]');
    if (!b || !needShape()) return;
    var t = b.getAttribute('data-exp');
    if (!account) {
      if (window.APProfileAccount) window.APProfileAccount.open('download');
      else toast('Create a free account to download your drawing');
      return;
    }
    var W = { watermark: true };
    if (t === 'dxf') download(new Blob([dxf(W)], { type: 'application/dxf' }), slug() + '.dxf');
    if (t === 'pdf') { var p = pdf(W); if (p) download(p, slug() + '.pdf'); else toast('PDF tool is still loading. Try again in a moment.'); }
    if (t === 'png') png(W).then(function (blob) { download(blob, slug() + '.png'); });
    track('ProfileDesignerExport', { format: t });
  });
  function toB64(blob) {
    return new Promise(function (res) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(',')[1]); }; r.readAsDataURL(blob); });
  }
  app.querySelector('[data-pd-attach]').addEventListener('click', function () {
    if (!needShape()) return;
    if (!S.closed && !confirm('Your outline is still open. A closed outline is what we tool from. Attach it anyway?')) return;
    var btn = this; btn.disabled = true; btn.textContent = 'Preparing files\u2026';
    var bb = bbox();
    var pdfBlob = pdf();
    Promise.all([toB64(new Blob([dxf()], { type: 'application/dxf' })), pdfBlob ? toB64(pdfBlob) : Promise.resolve(null), png().then(toB64)]).then(function (r) {
      var files = [{ name: slug() + '.dxf', type: 'application/dxf', b64: r[0] }];
      if (r[1]) files.push({ name: slug() + '.pdf', type: 'application/pdf', b64: r[1] });
      files.push({ name: slug() + '.png', type: 'image/png', b64: r[2] });
      var summary = (S.name || 'Custom profile') + ': ' + fmtLen(bb.w) + ' W x ' + fmtLen(bb.h) + ' H, ' + (isMM() ? 'mm' : 'inches') + ', ' + segCount() + ' segments, ' + (S.closed ? 'closed' : 'open') + ' outline';
      try {
        sessionStorage.setItem('apDesignerAttach', JSON.stringify({ files: files, summary: summary, project: S.project, design: designData(), t: Date.now() }));
      } catch (e) {
        btn.disabled = false; btn.textContent = 'Send to American Pro';
        toast('Could not hand off the files. Download them and upload on the request form.');
        return;
      }
      track('ProfileDesignerAttach', { segments: segCount(), closed: S.closed });
      location.href = app.getAttribute('data-pd-form') || './custom-historic-profiles.html#start';
    });
  });

  /* ============ Account bridge (js/profile-account.js) ============ */
  function designData() {
    return { pts: S.pts.map(function (p) { return { x: p.x, y: p.y }; }), bul: S.pts.map(function (_, i) { return S.bul[i] || 0; }), closed: S.closed, name: S.name, project: S.project, units: S.units };
  }
  function setDesign(d, id) {
    commit();
    S.pts = d.pts.map(function (p) { return { x: +p.x, y: +p.y }; });
    S.bul = (d.bul || []).slice(); S.closed = !!d.closed;
    S.name = d.name || ''; S.project = d.project || ''; if (d.units) S.units = d.units;
    designId = id || null; sel = null; drawing = false;
    changed(); fit();
  }
  function setAccount(u) {
    var was = !!account;
    account = u || null;
    app.classList.toggle('is-member', !!account);
    if (!account && was) { designId = null; try { localStorage.removeItem(STORE); } catch (e) { /* ignore */ } }
    save();
  }

  /* ============ Init ============ */
  load();
  renderPanel();
  setTool('draw');
  var ro = new ResizeObserver(function () { render(); });
  ro.observe(stage);
  requestAnimationFrame(function () { fit(); });
  window.APProfileDesigner = { design: designData, setDesign: setDesign, setAccount: setAccount, designId: function () { return designId; }, setDesignId: function (v) { designId = v; save(); }, toast: toast, hasShape: function () { return S.pts.length >= 2; }, state: S, dxf: dxf, pdf: pdf, png: png, fit: fit, addByLenAng: addByLenAng, closeShape: closeShape, select: function (s) { sel = s; renderPanel(); render(); }, act: act, parseLen: parseLen, fmtLen: fmtLen };
})();
