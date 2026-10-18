/* American Pro Profile Engine
   Shared geometry, formatting and DXF/PDF/PNG export for the Profile Designer
   and the designer admin. APProfileEngine.bind(design) returns functions bound
   to a design object {pts, bul, closed, name, project, units}. */
(function () {
  'use strict';
  function bind(S) {
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
  // Additional shapes (offsets, hollows) live in S.extra; the bound shape is the active one
  function shapes() {
    return [api].concat((S.extra || []).filter(function (sh) { return sh && sh.pts && sh.pts.length; }).map(function (sh) {
      return bind({ pts: sh.pts, bul: sh.bul || [], closed: !!sh.closed, units: S.units, name: S.name, project: S.project });
    }));
  }
  function bboxAll() {
    var b = null;
    shapes().forEach(function (E2) {
      var q = E2.bbox(); if (!q) return;
      if (!b) { b = Object.assign({}, q); return; }
      b.x0 = Math.min(b.x0, q.x0); b.y0 = Math.min(b.y0, q.y0); b.x1 = Math.max(b.x1, q.x1); b.y1 = Math.max(b.y1, q.y1);
    });
    if (b) { b.w = b.x1 - b.x0; b.h = b.y1 - b.y0; }
    return b;
  }
  function bulAt(i) { return S.bul[i] || 0; }
  function isClosed() { return !!S.closed; }
  function inside(pt, poly) {
    var c = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var a = poly[i], b = poly[j];
      if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < (b.x - a.x) * (pt.y - a.y) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  }
  // closed shapes with nesting depth (even = solid, odd = hollow)
  function fills() {
    var cl = shapes().filter(function (E2) { return E2.isClosed() && E2.outline().length > 2; });
    return cl.map(function (E2) {
      var o = E2.outline(), probe = o[0];
      var depth = cl.filter(function (F) { return F !== E2 && inside(probe, F.outline()); }).length;
      return { E: E2, out: o, depth: depth, area: E2.area() };
    }).sort(function (a, b) { return b.area - a.area; });
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

  /* ============ Export: DXF ============ */
  function slug() {
    var base = (S.name || 'custom-profile').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return 'american-pro-' + (base || 'custom-profile');
  }
  function dxf(opts) {
    opts = opts || {};
    var k = isMM() ? MM : 1; // export in the user's units
    var L = [];
    function g(c, v) { L.push(String(c), String(v)); }
    function num(v) { return (Math.round(v * k * 1e6) / 1e6).toString(); }
    var bb = bboxAll() || { x0: 0, y0: 0, x1: 1, y1: 1 };
    g(0, 'SECTION'); g(2, 'HEADER');
    g(9, '$ACADVER'); g(1, 'AC1009');
    g(9, '$INSUNITS'); g(70, isMM() ? 4 : 1);
    g(9, '$EXTMIN'); g(10, num(bb.x0)); g(20, num(bb.y0));
    g(9, '$EXTMAX'); g(10, num(bb.x1)); g(20, num(bb.y1));
    g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'TABLES');
    g(0, 'TABLE'); g(2, 'LAYER'); g(70, opts.watermark ? 3 : 2);
    g(0, 'LAYER'); g(2, 'PROFILE'); g(70, 0); g(62, 5); g(6, 'CONTINUOUS');
    g(0, 'LAYER'); g(2, 'NOTES'); g(70, 0); g(62, 8); g(6, 'CONTINUOUS');
    if (opts.watermark) { g(0, 'LAYER'); g(2, 'WATERMARK'); g(70, 0); g(62, 9); g(6, 'CONTINUOUS'); }
    g(0, 'ENDTAB');
    g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'ENTITIES');
    shapes().forEach(function (E2) {
    for (var i = 0; i < E2.segCount(); i++) {
      var e = E2.segEnds(i), b = E2.bulAt(i);
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
    });
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
    if (opts.watermark) {
      var wh = Math.max(th * 2.2, Math.min(bb.w, bb.h) * 0.18);
      [['AMERICAN PRO BUILDING PRODUCTS', 0], ['Created with the American Pro Profile Designer, americanprobp.com', 1]].forEach(function (w) {
        g(0, 'TEXT'); g(8, 'WATERMARK'); g(10, num(bb.x0)); g(20, num(bb.y1 + wh * (2.2 - w[1] * 1.4))); g(30, 0); g(40, num(w[1] ? wh * 0.45 : wh)); g(1, w[0]);
      });
    }
    g(0, 'ENDSEC'); g(0, 'EOF');
    return L.join('\r\n') + '\r\n';
  }

  /* ============ Export: PNG ============ */
  function drawToCanvas(ctx, W, H, opts) {
    opts = opts || {};
    var bb = bboxAll();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    if (!bb) return;
    var pad = opts.pad || 140;
    var s = Math.min((W - pad * 2) / Math.max(bb.w, 0.1), (H - pad * 2) / Math.max(bb.h, 0.1));
    var ox = W / 2 - (bb.x0 + bb.x1) / 2 * s, oy = H / 2 + (bb.y0 + bb.y1) / 2 * s;
    var T = function (p) { return { x: ox + p.x * s, y: oy - p.y * s }; };
    var all = shapes();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    all.forEach(function (E2) {
      if (!E2.isClosed()) return;
      E2.outline().forEach(function (p, k) { var q = T(p); k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
      ctx.closePath();
    });
    ctx.fillStyle = '#e8edf5'; ctx.fill('evenodd');
    ctx.strokeStyle = '#0e1f3a'; ctx.lineWidth = opts.lw || 4;
    all.forEach(function (E2) {
      ctx.beginPath();
      E2.outline().forEach(function (p, k) { var q = T(p); k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
      if (E2.isClosed()) ctx.closePath();
      ctx.stroke();
    });
    var fs = opts.fs || 22;
    ctx.font = '600 ' + fs + 'px Helvetica, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var placed = [];
    all.forEach(function (E2) {
      E2.dimLabels().forEach(function (d) {
        var w = ctx.measureText(d.text).width + 14;
        var q = T({ x: d.x, y: d.y }), px = q.x + d.nx * (fs * 0.7 + Math.abs(d.nx) * w / 2), py = q.y - d.ny * fs * 1.2;
        var box = { x0: px - w / 2, x1: px + w / 2, y0: py - fs * 0.7, y1: py + fs * 0.7 };
        if (placed.some(function (o) { return box.x0 < o.x1 && box.x1 > o.x0 && box.y0 < o.y1 && box.y1 > o.y0; })) return;
        placed.push(box);
        ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fillRect(px - w / 2, py - fs * 0.7, w, fs * 1.4);
        ctx.fillStyle = E2.bulAt(d.i) ? '#b91c2c' : '#0e1f3a'; ctx.fillText(d.text, px, py);
      });
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
  function png(opts) {
    opts = opts || {};
    var c = document.createElement('canvas'); c.width = 2000; c.height = 1300;
    var ctx = c.getContext('2d');
    drawToCanvas(ctx, c.width, c.height, { pad: 190, fs: 30, lw: 5 });
    ctx.font = '600 30px Helvetica, Arial, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#0e1f3a';
    ctx.fillText((S.name || 'Custom profile') + (S.project ? '  \u00b7  ' + S.project : ''), 60, 64);
    ctx.font = '400 22px Helvetica, Arial, sans-serif'; ctx.fillStyle = '#5b6478';
    ctx.fillText('American Pro Profile Designer  \u00b7  ' + (isMM() ? 'mm' : 'inches') + '  \u00b7  ' + new Date().toLocaleDateString(), 60, 102);
    if (opts.watermark) watermarkCanvas(ctx, c.width, c.height);
    return new Promise(function (res) { c.toBlob(res, 'image/png'); });
  }

  /* ============ Export: PDF ============ */
  function pdf(opts) {
    opts = opts || {};
    var J = window.jspdf && window.jspdf.jsPDF;
    if (!J) return null;
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
    var bb = bboxAll() || { w: 0, h: 0, x0: 0, y0: 0, x1: 0, y1: 0 };
    // drawing area
    var ax = m + 0.9, ay = m + 0.6, aw = W - 2 * m - 1.8, ah = tbY - ay - 0.9;
    var scales = [1, 0.5, 0.25, 0.2, 0.125, 0.1, 0.0625, 0.05];
    var sc = 0.02;
    for (var k = 0; k < scales.length; k++) { if (bb.w * scales[k] <= aw && bb.h * scales[k] <= ah) { sc = scales[k]; break; } }
    if (bb.w && bb.h && bb.w * 2 <= aw && bb.h * 2 <= ah && bb.w < 2.5 && bb.h < 1.6) sc = 2; // small profiles enlarge 2:1
    var ox = ax + aw / 2 - (bb.x0 + bb.x1) / 2 * sc, oy = ay + ah / 2 + (bb.y0 + bb.y1) / 2 * sc;
    var T = function (p) { return [ox + p.x * sc, oy - p.y * sc]; };
    var all = shapes();
    if (bboxAll() && (bb.w > 0 || bb.h > 0)) {
      // fills: outer shapes solid, nested shapes (hollows) white
      fills().forEach(function (f) {
        if (f.depth % 2) doc.setFillColor(255, 255, 255); else doc.setFillColor(232, 237, 245);
        var segs = [];
        for (var i = 1; i < f.out.length; i++) { var a = T(f.out[i - 1]), b = T(f.out[i]); segs.push([b[0] - a[0], b[1] - a[1]]); }
        var st = T(f.out[0]);
        doc.lines(segs, st[0], st[1], [1, 1], 'F', true);
      });
      doc.setLineWidth(0.018); doc.setDrawColor.apply(doc, navy);
      all.forEach(function (E2) {
        var o = E2.outline();
        for (var j2 = 1; j2 < o.length; j2++) { var q1 = T(o[j2 - 1]), q2 = T(o[j2]); doc.line(q1[0], q1[1], q2[0], q2[1]); }
        if (E2.isClosed() && o.length > 2) { var z1 = T(o[o.length - 1]), z2 = T(o[0]); doc.line(z1[0], z1[1], z2[0], z2[1]); }
      });
      // segment labels
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      var placed = [];
      all.forEach(function (E2) {
        E2.dimLabels().forEach(function (d) {
          var q = T({ x: d.x, y: d.y }), w = doc.getTextWidth(d.text); var px = q[0] + d.nx * (0.14 + Math.abs(d.nx) * w / 2), py = q[1] - d.ny * 0.17 + 0.03;
          var box = { x0: px - w / 2 - 0.02, x1: px + w / 2 + 0.02, y0: py - 0.12, y1: py + 0.03 };
          if (placed.some(function (o) { return box.x0 < o.x1 && box.x1 > o.x0 && box.y0 < o.y1 && box.y1 > o.y0; })) return;
          placed.push(box);
          doc.setTextColor.apply(doc, E2.bulAt(d.i) ? red : navy);
          doc.text(d.text.replace(/\u00d7/g, 'x'), px, py, { align: 'center' });
        });
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
    var nSh = shapes().length;
    doc.text((nSh > 1 ? nSh + ' shapes, ' : '') + (S.closed ? 'closed outline' : 'open outline (not yet a closed shape)'), W - m - 0.2, m + 0.3, { align: 'right' });
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
    if (opts.watermark) {
      try { doc.setGState(new doc.GState({ opacity: 0.09 })); } catch (e) { /* older viewers */ }
      doc.setTextColor.apply(doc, navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(54);
      doc.text('AMERICAN PRO', W / 2, (m + tbY) / 2 + 0.5, { align: 'center', angle: 18 });
      doc.setFontSize(20);
      doc.text('BUILDING PRODUCTS', W / 2 + 0.25, (m + tbY) / 2 + 1.05, { align: 'center', angle: 18 });
      try { doc.setGState(new doc.GState({ opacity: 1 })); } catch (e) { /* ignore */ }
      doc.setTextColor.apply(doc, red); doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
      doc.text('Created with the American Pro Profile Designer  |  americanprobp.com', W - m - 0.2, tbY - 0.12, { align: 'right' });
    }
    return opts.raw ? doc : doc.output('blob');
  }
  function tri(doc, x, y, deg) {
    var r = deg * Math.PI / 180, L = 0.08, w = 0.03;
    var p = function (dx, dy) { return [x + dx * Math.cos(r) - dy * Math.sin(r), y + dx * Math.sin(r) + dy * Math.cos(r)]; };
    var a = p(0, 0), b = p(L, -w), c = p(L, w);
    doc.setFillColor(91, 100, 120);
    doc.triangle(a[0], a[1], b[0], b[1], c[0], c[1], 'F');
  }

  function watermarkCanvas(ctx, W, H) {
    ctx.save();
    ctx.globalAlpha = 0.07; ctx.fillStyle = '#0e1f3a';
    ctx.font = '800 64px Helvetica, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.translate(W / 2, H / 2); ctx.rotate(-0.32);
    for (var y = -H; y <= H; y += 230) for (var x = -W; x <= W; x += 760) ctx.fillText('AMERICAN PRO', x + (y / 230 % 2 ? 380 : 0), y);
    ctx.restore();
    ctx.save();
    ctx.fillStyle = '#b91c2c'; ctx.font = '700 24px Helvetica, Arial, sans-serif'; ctx.textAlign = 'right';
    ctx.fillText('American Pro Building Products  \u00b7  americanprobp.com', W - 60, H - 50);
    ctx.restore();
  }
    var api = {
      shapes: shapes, bboxAll: bboxAll, bulAt: bulAt, isClosed: isClosed, fills: fills, inside: inside,
      MM: MM, isMM: isMM, fmtLen: fmtLen, fmtNum: fmtNum, parseLen: parseLen, fmtAng: fmtAng,
      segCount: segCount, segEnds: segEnds, arcInfo: arcInfo, segPoints: segPoints, segMid: segMid,
      segLen: segLen, segAngle: segAngle, outline: outline, bbox: bbox, area: area, signedArea: signedArea,
      dimLabels: dimLabels, slug: slug, dxf: dxf, pdf: pdf, png: png, drawToCanvas: drawToCanvas
    };
    return api;
  }
  window.APProfileEngine = { bind: bind, version: 2 };
})();
