// Alfred dashboard — demo paper account, proposal flow, approve/decline.
(function () {
  'use strict';

  var A = window.Alfred;

  // Gate: must complete onboarding (answer all the mandatory questions) first.
  if (!A.isOnboarded()) {
    window.location.href = './onboarding.html';
    return;
  }

  var guardrails = A.getGuardrails();
  var portfolio = A.getPortfolio();
  var currentProposal = null;

  var el = {
    total: document.getElementById('sum-total'),
    cash: document.getElementById('sum-cash'),
    invested: document.getElementById('sum-invested'),
    pl: document.getElementById('sum-pl'),
    proposalsLeft: document.getElementById('proposals-left'),
    proposeBtn: document.getElementById('propose-btn'),
    loading: document.getElementById('propose-loading'),
    empty: document.getElementById('propose-empty'),
    mount: document.getElementById('proposal-mount'),
    holdings: document.getElementById('holdings-mount'),
    activity: document.getElementById('activity-mount'),
    guardrails: document.getElementById('guardrails-mount'),
    resetBtn: document.getElementById('reset-btn'),
  };

  function money(n) {
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function renderSummary() {
    var invested = A.holdingsValue(portfolio);
    var total = portfolio.cash + invested;
    var pl = total - A.STARTING_CASH;
    el.total.textContent = money(total);
    el.cash.textContent = money(portfolio.cash);
    el.invested.textContent = money(invested);
    var sign = pl >= 0 ? '+' : '−';
    el.pl.textContent = sign + money(Math.abs(pl)).slice(1);
    el.pl.style.color = pl > 0 ? 'var(--accent-d)' : (pl < 0 ? '#b4232a' : 'var(--ink)');

    var left = A.proposalsRemaining(portfolio, guardrails.dailyCap);
    el.proposalsLeft.textContent = left + ' of ' + guardrails.dailyCap + ' proposals left today';
    el.proposeBtn.disabled = left <= 0;
    el.proposeBtn.style.opacity = left <= 0 ? '0.5' : '1';
    el.proposeBtn.style.cursor = left <= 0 ? 'not-allowed' : 'pointer';
  }

  function renderHoldings() {
    var syms = Object.keys(portfolio.holdings);
    if (syms.length === 0) {
      el.holdings.innerHTML = '<p style="font-size:14px; color:var(--mut); margin:6px 0 0;">No positions yet. Approve a proposal to open your first.</p>';
      return;
    }
    var rows = syms.map(function (sym) {
      var h = portfolio.holdings[sym];
      var price = h.lastPrice || h.avgPrice;
      var value = h.shares * price;
      var cost = h.shares * h.avgPrice;
      var pl = value - cost;
      var plColor = pl >= 0 ? 'var(--accent-d)' : '#b4232a';
      return '<div style="display:flex; align-items:center; justify-content:space-between; padding:14px 0; border-bottom:1px solid var(--line);">' +
        '<div><div style="font-weight:700; font-size:15px;">' + esc(sym) + '</div>' +
        '<div style="font-size:13px; color:var(--mut);">' + esc(h.name || '') + ' · ' + h.shares + ' sh @ ' + money(h.avgPrice) + '</div></div>' +
        '<div style="text-align:right;"><div style="font-weight:700;">' + money(value) + '</div>' +
        '<div style="font-size:13px; color:' + plColor + ';">' + (pl >= 0 ? '+' : '−') + money(Math.abs(pl)).slice(1) + '</div></div>' +
        '</div>';
    }).join('');
    el.holdings.innerHTML = rows;
  }

  function renderActivity() {
    if (portfolio.activity.length === 0) {
      el.activity.innerHTML = '<p style="font-size:14px; color:var(--mut); margin:6px 0 0;">Nothing yet.</p>';
      return;
    }
    el.activity.innerHTML = portfolio.activity.map(function (a) {
      var color = a.kind === 'approve' ? 'var(--accent-d)' : (a.kind === 'decline' ? '#9AA197' : 'var(--mut)');
      var d = new Date(a.ts);
      var time = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return '<div style="display:flex; gap:10px; padding:10px 0; border-bottom:1px solid var(--line); font-size:14px;">' +
        '<span style="color:' + color + '; font-weight:800;">•</span>' +
        '<div><div>' + esc(a.text) + '</div><div style="font-size:12px; color:#9AA197;">' + time + '</div></div></div>';
    }).join('');
  }

  function renderGuardrails() {
    function row(label, value) {
      return '<div style="display:flex; align-items:center; justify-content:space-between; padding:12px 0; border-bottom:1px solid var(--line);">' +
        '<span style="font-size:14px; color:var(--mut);">' + label + '</span>' +
        '<span style="font-size:14px; font-weight:700;">' + value + '</span></div>';
    }
    var assets = guardrails.assets.map(function (a) { return a === 'etf' ? 'ETFs' : 'US equities'; }).join(', ');
    var banned = (guardrails.bannedSectors && guardrails.bannedSectors.length) ? guardrails.bannedSectors.join(', ') : 'None';
    el.guardrails.innerHTML =
      row('Risk tolerance', esc(guardrails.risk)) +
      row('Horizon', esc(guardrails.horizon)) +
      row('Max single position', guardrails.maxPositionPct + '%') +
      row('Leverage', guardrails.leverage ? 'Allowed' : 'Off') +
      row('Daily proposal cap', guardrails.dailyCap) +
      row('Allowed assets', esc(assets)) +
      row('Banned sectors', esc(banned)) +
      '<div style="display:flex; align-items:center; justify-content:space-between; padding:12px 0 0;">' +
      '<span style="font-size:14px; color:var(--mut);">Approval required</span>' +
      '<span style="font-size:14px; font-weight:700; color:var(--accent-d);">Always</span></div>';
  }

  function renderProposal(p) {
    currentProposal = p;
    el.empty.style.display = 'none';
    var actionLabel = p.action === 'sell' ? 'Trim' : (p.action === 'hold' ? 'Hold' : 'Add');
    var metrics = (p.metrics || []).map(function (m) {
      return '<div style="background:var(--bg); border:1px solid var(--line); border-radius:12px; padding:12px;">' +
        '<div style="font-size:12px; color:var(--mut);">' + esc(m.label) + '</div>' +
        '<div style="font-size:18px; font-weight:700;">' + esc(m.value) + '</div></div>';
    }).join('');
    var ruleBg = p.withinRules ? 'var(--tint)' : '#fdecec';
    var ruleColor = p.withinRules ? 'var(--accent-d)' : '#b4232a';
    var ruleMark = p.withinRules ? '✓' : '✕';
    var engineNote = p.engine ? '<div style="font-size:12px; color:#9AA197; margin-top:12px;">Engine: ' + esc(p.engine) + (p.note ? ' · ' + esc(p.note) : '') + '</div>' : '';

    var canApprove = p.action !== 'hold' && p.withinRules;

    el.mount.innerHTML =
      '<div style="border:1px solid var(--line); border-radius:18px; padding:22px; opacity:0; animation:a-rise .5s ease-out both;">' +
        '<div style="display:flex; align-items:center; justify-content:space-between;">' +
          '<div><div style="font-size:13px; color:var(--mut); font-weight:600;">' + esc(p.name || p.symbol) + ' · ' + esc(p.symbol) + '</div>' +
          '<div style="font-size:24px; font-weight:700; letter-spacing:-.02em; margin-top:2px;">' + actionLabel + ' ' + (p.sizePct ? p.sizePct + '% ' : '') + (p.action === 'sell' ? 'of position' : 'position') + '</div></div>' +
          '<div style="text-align:right;"><div style="font-size:13px; color:var(--mut);">Confidence</div>' +
          '<div style="font-size:20px; font-weight:700; color:var(--accent-d);">' + esc(p.confidence || '—') + '</div></div>' +
        '</div>' +
        '<p style="font-size:15px; line-height:1.55; color:#3C4338; margin:14px 0 0;">' + esc(p.thesis || '') + '</p>' +
        (metrics ? '<div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-top:16px;">' + metrics + '</div>' : '') +
        '<div style="display:flex; align-items:center; gap:8px; margin-top:16px; background:' + ruleBg + '; border-radius:10px; padding:10px 13px; font-size:13px; font-weight:600; color:' + ruleColor + ';">' +
          '<span style="font-weight:800;">' + ruleMark + '</span> ' + esc(p.ruleNote || (p.withinRules ? 'Within your rules' : 'Outside your rules')) + '</div>' +
        '<div style="display:flex; gap:12px; margin-top:18px;">' +
          '<button id="decline-btn" class="btn-decline" style="flex:1; font-family:inherit; font-size:15px; font-weight:600; color:var(--ink); background:#fff; border:1px solid var(--line); padding:14px; border-radius:12px; cursor:pointer; transition:background .2s, border-color .2s;">Decline</button>' +
          '<button id="approve-btn" class="btn-approve" style="flex:2; font-family:inherit; font-size:15px; font-weight:700; color:#fff; background:var(--accent); border:none; padding:14px; border-radius:12px; cursor:' + (canApprove ? 'pointer' : 'not-allowed') + '; opacity:' + (canApprove ? '1' : '.5') + '; box-shadow:0 2px 4px rgba(10,94,57,.25); transition:transform .15s, box-shadow .2s;">' + (p.action === 'sell' ? 'Approve trim' : 'Approve trade') + '</button>' +
        '</div>' +
        engineNote +
      '</div>';

    document.getElementById('decline-btn').addEventListener('click', onDecline);
    var ab = document.getElementById('approve-btn');
    if (canApprove) { ab.addEventListener('click', onApprove); } else { ab.disabled = true; }
  }

  function clearProposal() {
    currentProposal = null;
    el.mount.innerHTML = '';
    el.empty.style.display = 'block';
  }

  function onDecline() {
    if (!currentProposal) return;
    A.logActivity(portfolio, 'decline', 'Declined ' + currentProposal.action + ' ' + currentProposal.symbol);
    A.savePortfolio(portfolio);
    clearProposal();
    renderActivity();
  }

  function onApprove() {
    var p = currentProposal;
    if (!p || !p.withinRules || p.action === 'hold') return;
    var price = p.price > 0 ? p.price : 100;
    var total = portfolio.cash + A.holdingsValue(portfolio);

    if (p.action === 'buy') {
      var dollars = Math.min((p.sizePct / 100) * total, portfolio.cash);
      var shares = Math.floor(dollars / price);
      if (shares < 1) { alert('Not enough demo cash for this position size.'); return; }
      var cost = shares * price;
      portfolio.cash -= cost;
      var h = portfolio.holdings[p.symbol];
      if (h) {
        var newShares = h.shares + shares;
        h.avgPrice = (h.shares * h.avgPrice + cost) / newShares;
        h.shares = newShares;
        h.lastPrice = price;
      } else {
        portfolio.holdings[p.symbol] = { shares: shares, avgPrice: price, lastPrice: price, name: p.name || p.symbol };
      }
      A.logActivity(portfolio, 'approve', 'Approved: bought ' + shares + ' ' + p.symbol + ' @ ' + money(price));
    } else if (p.action === 'sell') {
      var held = portfolio.holdings[p.symbol];
      if (!held) { alert('You do not hold ' + p.symbol + '.'); return; }
      var sellShares = Math.max(1, Math.floor(held.shares * (p.sizePct / 100)));
      sellShares = Math.min(sellShares, held.shares);
      var proceeds = sellShares * price;
      portfolio.cash += proceeds;
      held.shares -= sellShares;
      held.lastPrice = price;
      if (held.shares <= 0) { delete portfolio.holdings[p.symbol]; }
      A.logActivity(portfolio, 'approve', 'Approved: sold ' + sellShares + ' ' + p.symbol + ' @ ' + money(price));
    }

    A.savePortfolio(portfolio);
    clearProposal();
    renderSummary();
    renderHoldings();
    renderActivity();
  }

  function askForProposal() {
    var left = A.proposalsRemaining(portfolio, guardrails.dailyCap);
    if (left <= 0) return;

    el.proposeBtn.disabled = true;
    el.empty.style.display = 'none';
    el.mount.innerHTML = '';
    el.loading.style.display = 'flex';

    fetch('/api/propose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guardrails: guardrails, holdings: portfolio.holdings }),
    })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (p) {
        A.noteProposalUsed(portfolio);
        A.logActivity(portfolio, 'propose', 'Alfred proposed ' + (p.action || 'an idea') + ' ' + (p.symbol || ''));
        A.savePortfolio(portfolio);
        el.loading.style.display = 'none';
        renderSummary();
        renderActivity();
        renderProposal(p);
      })
      .catch(function (err) {
        el.loading.style.display = 'none';
        el.empty.style.display = 'block';
        el.empty.innerHTML = '<span style="color:#b4232a;">Couldn\'t reach the research agent (' + esc(err.message) +
          '). The serverless endpoint <code>/api/propose</code> only runs once deployed on Vercel — locally it falls back to the demo engine there.</span>';
        el.proposeBtn.disabled = false;
      });
  }

  el.proposeBtn.addEventListener('click', askForProposal);
  el.resetBtn.addEventListener('click', function () {
    if (confirm('Reset the demo back to $10,000 and clear all positions?')) {
      portfolio = A.resetPortfolio();
      clearProposal();
      renderAll();
    }
  });

  function renderAll() {
    renderSummary();
    renderHoldings();
    renderActivity();
    renderGuardrails();
  }
  renderAll();
})();
