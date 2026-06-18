// Alfred Landing — interactive behaviour.
// Ported verbatim from the Claude Design prototype's DCLogic component
// (spinning 3D coin + scroll-triggered stat counters), minus the framework.
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function init() {
    startCoin(reduce);
    setupCounters(reduce);
  }

  // ---- Stat counters (count up when the trust band scrolls into view) ----
  function setupCounters(reduce) {
    var s1 = document.getElementById('s1');
    var s3 = document.getElementById('s3');
    if (!s1 || !s3) return;

    function runCounts() {
      animateStat(s1, 100, 1300);
      animateStat(s3, 24, 1300);
    }

    if (reduce) {
      s1.textContent = '100';
      s3.textContent = '24';
      return;
    }

    var el = document.getElementById('trust');
    if (!el || typeof IntersectionObserver === 'undefined') {
      runCounts();
      return;
    }

    var counted = false;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting && !counted) {
          counted = true;
          runCounts();
          io.disconnect();
        }
      });
    }, { threshold: 0.25 });
    io.observe(el);
  }

  function animateStat(node, to, dur) {
    var t0 = performance.now();
    function tick(now) {
      var p = Math.min((now - t0) / dur, 1);
      var e = 1 - Math.pow(1 - p, 3);
      node.textContent = String(Math.round(to * e));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ---- Spinning 3D coin (canvas) ----
  function startCoin(reduce) {
    var canvas = document.getElementById('coin');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var size = 320;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.scale(dpr, dpr);

    var cx = size / 2, cy = size / 2, R = 112, T = 30;

    var draw = function (a) {
      ctx.clearRect(0, 0, size, size);
      var cosA = Math.cos(a), sinA = Math.sin(a);
      var rx = Math.abs(R * cosA);
      var faceCx = cx + (T / 2) * sinA;
      var backCx = cx - (T / 2) * sinA;
      var showFront = cosA >= 0;

      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = '#0A5E39';
      ctx.filter = 'blur(7px)';
      ctx.beginPath();
      ctx.ellipse(cx, cy + R + 36, rx * 0.7 + 24, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      var edgeGrad = ctx.createLinearGradient(0, cy - R, 0, cy + R);
      edgeGrad.addColorStop(0, '#0d7a49');
      edgeGrad.addColorStop(0.5, '#0a5e39');
      edgeGrad.addColorStop(1, '#073f27');
      ctx.fillStyle = edgeGrad;
      ctx.beginPath();
      ctx.ellipse(backCx, cy, Math.max(rx, 1.5), R, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(faceCx, cy, Math.max(rx, 1.5), R, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(Math.min(faceCx, backCx), cy - R, Math.abs(faceCx - backCx) || 0.5, R * 2);

      var fg = ctx.createLinearGradient(faceCx - rx, cy - R, faceCx + rx, cy + R);
      if (showFront) {
        fg.addColorStop(0, '#27c882');
        fg.addColorStop(0.45, '#13a163');
        fg.addColorStop(1, '#0a6a40');
      } else {
        fg.addColorStop(0, '#0a6a40');
        fg.addColorStop(0.55, '#0d7a49');
        fg.addColorStop(1, '#073f27');
      }
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.ellipse(faceCx, cy, Math.max(rx, 0.5), R, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(faceCx, cy, Math.max(rx - 9, 0.5), R - 9, 0, 0, Math.PI * 2);
      ctx.stroke();

      var ticks = 48;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1.4;
      for (var i = 0; i < ticks; i++) {
        var ph = (i / ticks) * Math.PI * 2;
        var x1 = faceCx + Math.cos(ph) * (rx - 4);
        var y1 = cy + Math.sin(ph) * (R - 4);
        var x2 = faceCx + Math.cos(ph) * (rx - 11);
        var y2 = cy + Math.sin(ph) * (R - 11);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      ctx.restore();

      if (rx > 6) {
        ctx.save();
        ctx.translate(faceCx, cy);
        ctx.scale(Math.max(rx / R, 0.05), 1);
        ctx.font = '800 110px "Helvetica Neue", Helvetica, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var mark = showFront ? 'A' : '$';
        ctx.fillStyle = 'rgba(7,63,39,0.55)';
        ctx.fillText(mark, 0, 6);
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillText(mark, 0, 2);
        ctx.restore();
      }

      ctx.save();
      ctx.globalAlpha = 0.5;
      var hl = ctx.createRadialGradient(faceCx - rx * 0.35, cy - R * 0.4, 2, faceCx - rx * 0.35, cy - R * 0.4, R * 0.9);
      hl.addColorStop(0, 'rgba(255,255,255,0.6)');
      hl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hl;
      ctx.beginPath();
      ctx.ellipse(faceCx, cy, Math.max(rx, 0.5), R, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    if (reduce) { draw(-0.5); return; }
    var start = performance.now();
    var raf;
    var loop = function (now) {
      draw((now - start) * 0.00085);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
