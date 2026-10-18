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

  /* ============ Units & formatting ============ */
  var MM = 25.4;
  function isMM() { return S.units === 'mm'; }
  function gcd(a, b) { return b ? gcd(b, a % b) : a; }
  function fmtLen(v, opts) {
    opts = opts || {};
    var neg = v < 0; v = Math.abs(v);
    var mark = opts.noMark ? '' : (isMM() ? ' mm' : '"');
    if (isMM()) {
      var mm = v * MM;
      return (neg ? '-' : '') + (Math.round(mm * 10) / 10).toFixed(mm < 100 ? 1 : 0).replace(/\.0$/, '') + mark;
    }
    if (S.units === 'frac') {
      var n64 = v * 64, r = Math.round(n64);
      if (Math.abs(n64 - r) < 0.08) {
        var whole = Math.floor(r / 64), num = r % 64;
        var out = '';
        if (num) { var g = gcd(num, 64); out = (num / g) + '/' + (64 / g); }
        var str = whole && out ? whole + '-' + out : (whole ? String(whole) : (out || '0'));
        return (neg ? '-' : '') + str + mark;
      }
    }
    return (neg ? '-' : '') + v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + mark;
  }
  function fmtNum(v) { return fmtLen(v, { noMark: true }); }
  // Parse "1-5/8", "1 5/8", "5/8", "1.625", "41.3", with optional " or mm
  function parseLen(str) {
    if (str == null) return NaN;
    var s = String(str).trim().toLowerCase().replace(/["\u2033]|in(ch(es)?)?$/g, '').trim();
    var mm = isMM();
    if (/mm$/.test(s)) { mm = true; s = s.replace(/mm$/, '').trim(); }
    var neg = false;
    if (s.charAt(0) === '-' && /^-\s*\d/.test(s)) { neg = true; s = s.slice(1).trim(); }
    var m, v = NaN;
    if ((m = s.match(/^(\d+)\s*[- ]\s*(\d+)\s*\/\s*(\d+)$/))) v = +m[1] + (+m[2]) / (+m[3]);
    else if ((m = s.match(/^(\d+)\s*\/\s*(\d+)$/))) v = (+m[1]) / (+m[2]);
    else if (/^\d*\.?\d+$/.test(s)) v = parseFloat(s);
    if (!isFinite(v)) return NaN;
    if (neg) v = -v;
    return mm ? v / MM : v;
  }
  function fmtAng(a) { var d = Math.round(a * 10) / 10; return (d === -0 ? 0 : d) + '\u00b0'; }

  /* ============ Geometry ============ */
  function segCount() { var n = S.pts.length; return S.closed ? n : Math.max(0, n - 1); }
  function segEnds(i) { var n = S.pts.length; return [S.pts[i], S.pts[(i + 1) % n]]; }
  function arcInfo(p1, p2, b) {
    var dx = p2.x - p1.x, dy = p2.y - p1.y, c = Math.hypot(dx, dy);
    var th = 4 * Math.atan(b);
    var mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
    var off = c * (1 - b * b) / (4 * b);
    var nx = -dy / c, ny = dx / c;
    var cx = mx + nx * off, cy = my + ny * off;
    var r = Math.hypot(p1.x - cx, p1.y - cy);
    var a1 = Math.atan2(p1.y - cy, p1.x - cx);
    return { cx: cx, cy: cy, r: r, a1: a1, th: th, chord: c, len: Math.abs(th) * r };
  }
  function segPoints(i) {
    var e = segEnds(i), b = S.bul[i] || 0;
    if (!b || Math.abs(b) < 1e-9) return [e[0], e[1]];
    var A = arcInfo(e[0], e[1], b);
    var steps = Math.max(8, Math.ceil(Math.abs(A.th) / (Math.PI / 48)));
    var out = [];
    for (var k = 0; k <= steps; k++) {
      var a = A.a1 + A.th * k / steps;
      out.push({ x: A.cx + A.r * Math.cos(a), y: A.cy + A.r * Math.sin(a) });
    }
    out[0] = e[0]; out[out.length - 1] = e[1];
    return out;
  }
  function segMid(i) {
    var e = segEnds(i), b = S.bul[i] || 0;
    if (!b) return { x: (e[0].x + e[1].x) / 2, y: (e[0].y + e[1].y) / 2 };
    var A = arcInfo(e[0], e[1], b), a = A.a1 + A.th / 2;
    return { x: A.cx + A.r * Math.cos(a), y: A.cy + A.r * Math.sin(a) };
  }
  function segLen(i) {
    var e = segEnds(i), b = S.bul[i] || 0;
    return b ? arcInfo(e[0], e[1], b).len : Math.hypot(e[1].x - e[0].x, e[1].y - e[0].y);
  }
  function segAngle(i) {
    var e = segEnds(i);
    return Math.atan2(e[1].y - e[0].y, e[1].x - e[0].x) * 180 / Math.PI;
  }
  function outline() {
    var out = [];
    for (var i = 0; i < segCount(); i++) {
      var p = segPoints(i);
      if (out.length) p = p.slice(1);
      out = out.concat(p);
    }
    if (!out.length && S.pts.length) out = S.pts.slice();
    return out;
  }
  function bbox(pts) {
    pts = pts || outline();
    if (!pts.length) return null;
    var b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    pts.forEach(function (p) { b.x0 = Math.min(b.x0, p.x); b.y0 = Math.min(b.y0, p.y); b.x1 = Math.max(b.x1, p.x); b.y1 = Math.max(b.y1, p.y); });
    b.w = b.x1 - b.x0; b.h = b.y1 - b.y0;
    return b;
  }
  function area() {
    if (!S.closed) return 0;
    var p = outline(), a = 0;
    for (var i = 0; i < p.length; i++) { var q = p[(i + 1) % p.length]; a += p[i].x * q.y - q.x * p[i].y; }
    return Math.abs(a / 2);
  }
  // Labels: segment dims positioned outward from the shape centre
  function signedArea() {
    var p = outline(), a = 0;
    for (var i = 0; i < p.length; i++) { var q = p[(i + 1) % p.length]; a += p[i].x * q.y - q.x * p[i].y; }
    return a / 2;
  }
  function dimLabels() {
    var out = [], bb = bbox();
    if (!bb) return out;
    var cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
    var orient = S.closed ? (signedArea() >= 0 ? 1 : -1) : 0;
    for (var i = 0; i < segCount(); i++) {
      var e = segEnds(i), b = S.bul[i] || 0, m = segMid(i), tp = segPoints(i);
      var k = Math.floor((tp.length - 1) / 2), t0 = tp[k], t1 = tp[Math.min(tp.length - 1, k + 1)];
      var tx = t1.x - t0.x, ty = t1.y - t0.y, tl = Math.hypot(tx, ty) || 1;
      var nx, ny;
      if (orient) {
        // outward normal from winding: right-hand side for counter-clockwise outlines
        nx = orient * ty / tl; ny = -orient * tx / tl;
      } else {
        nx = -ty / tl; ny = tx / tl;
        if ((m.x - cx) * nx + (m.y - cy) * ny < 0) { nx = -nx; ny = -ny; }
      }
      var c = Math.hypot(e[1].x - e[0].x, e[1].y - e[0].y);
      var text = b ? 'R ' + fmtLen(arcInfo(e[0], e[1], b).r) : fmtLen(c);
      out.push({ i: i, x: m.x, y: m.y, nx: nx, ny: ny, text: text });
    }
    return out;
  }

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
  var saveT;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(function () {
      try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* storage full or blocked */ }
    }, 250);
  }
  function load() {
    try {
      var o = JSON.parse(localStorage.getItem(STORE) || 'null');
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
    commit(); S.pts = []; S.bul = []; S.closed = false; sel = null; drawing = false; changed(); fit();
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

  /* ============ Export: DXF ============ */
  function slug() {
    var base = (S.name || 'custom-profile').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return 'american-pro-' + (base || 'custom-profile');
  }
  function dxf() {
    var k = isMM() ? MM : 1; // export in the user's units
    var L = [];
    function g(c, v) { L.push(String(c), String(v)); }
    function num(v) { return (Math.round(v * k * 1e6) / 1e6).toString(); }
    var bb = bbox() || { x0: 0, y0: 0, x1: 1, y1: 1 };
    g(0, 'SECTION'); g(2, 'HEADER');
    g(9, '$ACADVER'); g(1, 'AC1009');
    g(9, '$INSUNITS'); g(70, isMM() ? 4 : 1);
    g(9, '$EXTMIN'); g(10, num(bb.x0)); g(20, num(bb.y0));
    g(9, '$EXTMAX'); g(10, num(bb.x1)); g(20, num(bb.y1));
    g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'TABLES');
    g(0, 'TABLE'); g(2, 'LAYER'); g(70, 2);
    g(0, 'LAYER'); g(2, 'PROFILE'); g(70, 0); g(62, 5); g(6, 'CONTINUOUS');
    g(0, 'LAYER'); g(2, 'NOTES'); g(70, 0); g(62, 8); g(6, 'CONTINUOUS');
    g(0, 'ENDTAB');
    g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'ENTITIES');
    for (var i = 0; i < segCount(); i++) {
      var e = segEnds(i), b = S.bul[i] || 0;
      if (!b) {
        g(0, 'LINE'); g(8, 'PROFILE');
        g(10, num(e[0].x)); g(20, num(e[0].y)); g(30, 0);
        g(11, num(e[1].x)); g(21, num(e[1].y)); g(31, 0);
      } else {
        var A = arcInfo(e[0], e[1], b);
        var a1 = A.a1, a2 = A.a1 + A.th;
        var s = A.th > 0 ? a1 : a2, en = A.th > 0 ? a2 : a1;
        var deg = function (r) { var d = r * 180 / Math.PI; d = ((d % 360) + 360) % 360; return Math.round(d * 1e6) / 1e6; };
        g(0, 'ARC'); g(8, 'PROFILE');
        g(10, num(A.cx)); g(20, num(A.cy)); g(30, 0);
        g(40, num(A.r)); g(50, deg(s)); g(51, deg(en));
      }
    }
    var th = (isMM() ? 3 : 0.125) / k;
    var ty = bb.y0 - th * 4;
    var notes = [
      (S.name || 'Custom profile') + (S.project ? ' / ' + S.project : ''),
      'Overall ' + fmtLen(bb.w) + ' W x ' + fmtLen(bb.h) + ' H, units: ' + (isMM() ? 'mm' : 'inches') + ', scale 1:1',
      'American Pro Building Products Profile Designer, ' + new Date().toISOString().slice(0, 10)
    ];
    notes.forEach(function (t, n) {
      g(0, 'TEXT'); g(8, 'NOTES'); g(10, num(bb.x0)); g(20, num(ty - n * th * 1.8)); g(30, 0); g(40, num(th)); g(1, t.replace(/\u00d7/g, 'x'));
    });
    g(0, 'ENDSEC'); g(0, 'EOF');
    return L.join('\r\n') + '\r\n';
  }

  /* ============ Export: PNG ============ */
  function drawToCanvas(ctx, W, H, opts) {
    opts = opts || {};
    var bb = bbox();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    if (!bb) return;
    var pad = opts.pad || 140;
    var s = Math.min((W - pad * 2) / Math.max(bb.w, 0.1), (H - pad * 2) / Math.max(bb.h, 0.1));
    var ox = W / 2 - (bb.x0 + bb.x1) / 2 * s, oy = H / 2 + (bb.y0 + bb.y1) / 2 * s;
    var T = function (p) { return { x: ox + p.x * s, y: oy - p.y * s }; };
    var out = outline();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    out.forEach(function (p, k) { var q = T(p); k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
    if (S.closed) { ctx.closePath(); ctx.fillStyle = '#e8edf5'; ctx.fill(); }
    ctx.strokeStyle = '#0e1f3a'; ctx.lineWidth = opts.lw || 4; ctx.stroke();
    var fs = opts.fs || 22;
    ctx.font = '600 ' + fs + 'px Helvetica, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    dimLabels().forEach(function (d) {
      var w = ctx.measureText(d.text).width + 14;
      var q = T({ x: d.x, y: d.y }), px = q.x + d.nx * (fs * 0.7 + Math.abs(d.nx) * w / 2), py = q.y - d.ny * fs * 1.2;
      ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fillRect(px - w / 2, py - fs * 0.7, w, fs * 1.4);
      ctx.fillStyle = S.bul[d.i] ? '#b91c2c' : '#0e1f3a'; ctx.fillText(d.text, px, py);
    });
    // overall dims
    var A = T({ x: bb.x0, y: bb.y0 }), B = T({ x: bb.x1, y: bb.y1 });
    ctx.strokeStyle = '#5b6478'; ctx.fillStyle = '#5b6478'; ctx.lineWidth = Math.max(1.5, (opts.lw || 4) / 2.5);
    var yb = A.y + fs * 3, xl = A.x - fs * 3;
    line(ctx, A.x, A.y + 8, A.x, yb + 8); line(ctx, B.x, A.y + 8, B.x, yb + 8); line(ctx, A.x, yb, B.x, yb);
    line(ctx, A.x - 8, A.y, xl - 8, A.y); line(ctx, A.x - 8, B.y, xl - 8, B.y); line(ctx, xl, A.y, xl, B.y);
    ctx.fillStyle = '#0e1f3a';
    var tw = 'W ' + fmtLen(bb.w), thh = 'H ' + fmtLen(bb.h);
    var w1 = ctx.measureText(tw).width + 16;
    ctx.fillStyle = '#fff'; ctx.fillRect((A.x + B.x) / 2 - w1 / 2, yb - fs * 0.7, w1, fs * 1.4); ctx.fillStyle = '#0e1f3a'; ctx.fillText(tw, (A.x + B.x) / 2, yb);
    ctx.save(); ctx.translate(xl, (A.y + B.y) / 2); ctx.rotate(-Math.PI / 2);
    var w2 = ctx.measureText(thh).width + 16; ctx.fillStyle = '#fff'; ctx.fillRect(-w2 / 2, -fs * 0.7, w2, fs * 1.4); ctx.fillStyle = '#0e1f3a'; ctx.fillText(thh, 0, 0); ctx.restore();
  }
  function line(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
  function png() {
    var c = document.createElement('canvas'); c.width = 2000; c.height = 1300;
    var ctx = c.getContext('2d');
    drawToCanvas(ctx, c.width, c.height, { pad: 190, fs: 30, lw: 5 });
    ctx.font = '600 30px Helvetica, Arial, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#0e1f3a';
    ctx.fillText((S.name || 'Custom profile') + (S.project ? '  \u00b7  ' + S.project : ''), 60, 64);
    ctx.font = '400 22px Helvetica, Arial, sans-serif'; ctx.fillStyle = '#5b6478';
    ctx.fillText('American Pro Profile Designer  \u00b7  ' + (isMM() ? 'mm' : 'inches') + '  \u00b7  ' + new Date().toLocaleDateString(), 60, 102);
    return new Promise(function (res) { c.toBlob(res, 'image/png'); });
  }

  /* ============ Export: PDF ============ */
  function pdf() {
    var J = window.jspdf && window.jspdf.jsPDF;
    if (!J) { toast('PDF tool is still loading. Try again in a moment.'); return null; }
    var doc = new J({ orientation: 'landscape', unit: 'in', format: 'letter' });
    var W = 11, H = 8.5, m = 0.4;
    var navy = [14, 31, 58], red = [185, 28, 44], gray = [91, 100, 120];
    doc.setDrawColor.apply(doc, navy); doc.setLineWidth(0.02);
    doc.rect(m, m, W - 2 * m, H - 2 * m);
    // title block
    var tbH = 1.25, tbY = H - m - tbH;
    doc.line(m, tbY, W - m, tbY);
    var cols = [m, m + 3.1, m + 5.6, m + 7.6, W - m];
    for (var c = 1; c < cols.length - 1; c++) doc.line(cols[c], tbY, cols[c], H - m);
    var bb = bbox() || { w: 0, h: 0, x0: 0, y0: 0, x1: 0, y1: 0 };
    // drawing area
    var ax = m + 0.9, ay = m + 0.6, aw = W - 2 * m - 1.8, ah = tbY - ay - 0.9;
    var scales = [1, 0.5, 0.25, 0.2, 0.125, 0.1, 0.0625, 0.05];
    var sc = 0.02;
    for (var k = 0; k < scales.length; k++) { if (bb.w * scales[k] <= aw && bb.h * scales[k] <= ah) { sc = scales[k]; break; } }
    if (bb.w && bb.h && bb.w * 2 <= aw && bb.h * 2 <= ah && bb.w < 2.5 && bb.h < 1.6) sc = 2; // small profiles enlarge 2:1
    var ox = ax + aw / 2 - (bb.x0 + bb.x1) / 2 * sc, oy = ay + ah / 2 + (bb.y0 + bb.y1) / 2 * sc;
    var T = function (p) { return [ox + p.x * sc, oy - p.y * sc]; };
    var out = outline();
    if (out.length > 1) {
      if (S.closed) {
        doc.setFillColor(232, 237, 245);
        var segs = [];
        for (var i = 1; i < out.length; i++) { var a = T(out[i - 1]), b = T(out[i]); segs.push([b[0] - a[0], b[1] - a[1]]); }
        var st = T(out[0]);
        doc.lines(segs, st[0], st[1], [1, 1], 'FD', true);
      } else {
        for (var j = 1; j < out.length; j++) { var p1 = T(out[j - 1]), p2 = T(out[j]); doc.setLineWidth(0.018); doc.line(p1[0], p1[1], p2[0], p2[1]); }
      }
      doc.setLineWidth(0.018); doc.setDrawColor.apply(doc, navy);
      for (var j2 = 1; j2 < out.length; j2++) { var q1 = T(out[j2 - 1]), q2 = T(out[j2]); doc.line(q1[0], q1[1], q2[0], q2[1]); }
      if (S.closed) { var z1 = T(out[out.length - 1]), z2 = T(out[0]); doc.line(z1[0], z1[1], z2[0], z2[1]); }
      // segment labels
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      dimLabels().forEach(function (d) {
        var q = T({ x: d.x, y: d.y }), w = doc.getTextWidth(d.text); var px = q[0] + d.nx * (0.14 + Math.abs(d.nx) * w / 2), py = q[1] - d.ny * 0.17 + 0.03;
        doc.setTextColor.apply(doc, S.bul[d.i] ? red : navy);
        doc.text(d.text.replace(/\u00d7/g, 'x'), px, py, { align: 'center' });
      });
      // overall dims
      var A = T({ x: bb.x0, y: bb.y0 }), B = T({ x: bb.x1, y: bb.y1 });
      doc.setDrawColor.apply(doc, gray); doc.setLineWidth(0.008);
      var yb = A[1] + 0.45, xl = A[0] - 0.45;
      doc.line(A[0], A[1] + 0.06, A[0], yb + 0.06); doc.line(B[0], A[1] + 0.06, B[0], yb + 0.06); doc.line(A[0], yb, B[0], yb);
      doc.line(A[0] - 0.06, A[1], xl - 0.06, A[1]); doc.line(A[0] - 0.06, B[1], xl - 0.06, B[1]); doc.line(xl, A[1], xl, B[1]);
      tri(doc, A[0], yb, 0); tri(doc, B[0], yb, 180); tri(doc, xl, A[1], 270); tri(doc, xl, B[1], 90);
      doc.setTextColor.apply(doc, navy); doc.setFontSize(9);
      doc.text('W ' + fmtLen(bb.w), (A[0] + B[0]) / 2, yb - 0.06, { align: 'center' });
      doc.text('H ' + fmtLen(bb.h), xl - 0.08, (A[1] + B[1]) / 2, { align: 'center', angle: 90 });
    }
    // header strip
    doc.setTextColor.apply(doc, red); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('CUSTOM PROFILE SHOP DRAWING', m + 0.2, m + 0.3);
    doc.setTextColor.apply(doc, gray); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text(S.closed ? 'Closed outline' : 'Open outline (not yet a closed shape)', W - m - 0.2, m + 0.3, { align: 'right' });
    // title block text
    var cell = function (x, label, value, big) {
      doc.setTextColor.apply(doc, gray); doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5);
      doc.text(label.toUpperCase(), x + 0.12, tbY + 0.22);
      doc.setTextColor.apply(doc, navy); doc.setFont('helvetica', big ? 'bold' : 'normal'); doc.setFontSize(big ? 13 : 10);
      var lines = doc.splitTextToSize(value || '\u2014'.replace('\u2014', '-'), (big ? 2.8 : 1.8));
      doc.text(lines.slice(0, 3), x + 0.12, tbY + 0.5);
    };
    cell(cols[0], 'Profile', S.name || 'Custom profile', true);
    cell(cols[1], 'Project', S.project || '-');
    cell(cols[2], 'Overall size', fmtLen(bb.w) + ' W x ' + fmtLen(bb.h) + ' H');
    var scaleTxt = sc >= 1 ? sc + ':1' : '1:' + Math.round(1 / sc);
    doc.setTextColor.apply(doc, gray); doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5);
    doc.text('UNITS / SCALE / DATE', cols[3] + 0.12, tbY + 0.22);
    doc.setTextColor.apply(doc, navy); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text([(isMM() ? 'Millimeters' : 'Inches'), 'Scale ' + scaleTxt + ' on letter at 100%', new Date().toLocaleDateString()], cols[3] + 0.12, tbY + 0.45);
    doc.setFontSize(6.5); doc.setTextColor.apply(doc, gray);
    doc.text('American Pro Building Products / Patwin Plastics, Linden, NJ. Customer sketch for quoting; final die geometry is confirmed by Patwin engineering.', m + 0.2, tbY - 0.12);
    return doc.output('blob');
  }
  function tri(doc, x, y, deg) {
    var r = deg * Math.PI / 180, L = 0.08, w = 0.03;
    var p = function (dx, dy) { return [x + dx * Math.cos(r) - dy * Math.sin(r), y + dx * Math.sin(r) + dy * Math.cos(r)]; };
    var a = p(0, 0), b = p(L, -w), c = p(L, w);
    doc.setFillColor(91, 100, 120);
    doc.triangle(a[0], a[1], b[0], b[1], c[0], c[1], 'F');
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
    if (t === 'dxf') download(new Blob([dxf()], { type: 'application/dxf' }), slug() + '.dxf');
    if (t === 'pdf') { var p = pdf(); if (p) download(p, slug() + '.pdf'); }
    if (t === 'png') png().then(function (blob) { download(blob, slug() + '.png'); });
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
        sessionStorage.setItem('apDesignerAttach', JSON.stringify({ files: files, summary: summary, project: S.project, t: Date.now() }));
      } catch (e) {
        btn.disabled = false; btn.textContent = 'Attach to My Request';
        toast('Could not hand off the files. Download them and upload on the request form.');
        return;
      }
      track('ProfileDesignerAttach', { segments: segCount(), closed: S.closed });
      location.href = app.getAttribute('data-pd-form') || './custom-historic-profiles.html#start';
    });
  });

  /* ============ Init ============ */
  load();
  renderPanel();
  setTool('draw');
  var ro = new ResizeObserver(function () { render(); });
  ro.observe(stage);
  requestAnimationFrame(function () { fit(); });
  window.APProfileDesigner = { state: S, dxf: dxf, pdf: pdf, png: png, fit: fit, addByLenAng: addByLenAng, closeShape: closeShape, select: function (s) { sel = s; renderPanel(); render(); }, act: act, parseLen: parseLen, fmtLen: fmtLen };
})();
