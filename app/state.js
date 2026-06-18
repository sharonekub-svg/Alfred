// Alfred demo state — shared across onboarding & dashboard.
// Everything lives in localStorage for the free demo (no backend account yet).
(function (global) {
  'use strict';

  var KEYS = {
    email: 'alfred_email',
    guardrails: 'alfred_guardrails',
    portfolio: 'alfred_portfolio',
  };

  var STARTING_CASH = 10000; // $10,000 free demo money

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  var Alfred = {
    STARTING_CASH: STARTING_CASH,

    // ---- email ----
    getEmail: function () { return read(KEYS.email, null); },
    setEmail: function (email) { write(KEYS.email, email); },

    // ---- guardrails (set during onboarding) ----
    getGuardrails: function () { return read(KEYS.guardrails, null); },
    setGuardrails: function (g) { write(KEYS.guardrails, g); },
    isOnboarded: function () {
      var g = read(KEYS.guardrails, null);
      return !!(g && g.completed);
    },

    // ---- portfolio (the demo paper account) ----
    getPortfolio: function () {
      var p = read(KEYS.portfolio, null);
      if (!p) { p = this.resetPortfolio(); }
      return p;
    },
    savePortfolio: function (p) { write(KEYS.portfolio, p); },
    resetPortfolio: function () {
      var p = {
        cash: STARTING_CASH,
        holdings: {},          // symbol -> { shares, avgPrice, lastPrice, name }
        activity: [],          // { ts, kind, text }
        proposalDay: today(),
        proposalsToday: 0,
      };
      write(KEYS.portfolio, p);
      return p;
    },

    holdingsValue: function (p) {
      var total = 0;
      Object.keys(p.holdings).forEach(function (sym) {
        var h = p.holdings[sym];
        total += h.shares * (h.lastPrice || h.avgPrice);
      });
      return total;
    },
    totalValue: function (p) { return p.cash + this.holdingsValue(p); },

    proposalsRemaining: function (p, cap) {
      if (p.proposalDay !== today()) { return cap; }
      return Math.max(0, cap - p.proposalsToday);
    },
    noteProposalUsed: function (p) {
      if (p.proposalDay !== today()) {
        p.proposalDay = today();
        p.proposalsToday = 0;
      }
      p.proposalsToday += 1;
    },

    logActivity: function (p, kind, text) {
      p.activity.unshift({ ts: Date.now(), kind: kind, text: text });
      if (p.activity.length > 50) { p.activity.length = 50; }
    },
  };

  global.Alfred = Alfred;
})(window);
