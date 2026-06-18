// Alfred research agent (Vercel serverless function).
//
// Real mode: pulls live quotes + analyst recommendation trends from Finnhub and
// asks Claude (claude-opus-4-8) to produce ONE trade proposal that strictly
// respects the user's guardrails. Keys are read from env vars and never reach
// the browser:
//   ANTHROPIC_API_KEY  — required for the Claude reasoning step
//   FINNHUB_API_KEY    — required for live market + analyst data
//
// If either key is missing (or anything errors / times out), it falls back to a
// deterministic simulated engine so the $10k demo always returns an idea.

import Anthropic from '@anthropic-ai/sdk';

const UNIVERSE = [
  { symbol: 'SPY',  name: 'S&P 500 ETF',        type: 'etf',    sector: 'Broad Market',     mockPrice: 540, mockPe: 26 },
  { symbol: 'QQQ',  name: 'Nasdaq-100 ETF',     type: 'etf',    sector: 'Broad Market',     mockPrice: 470, mockPe: 30 },
  { symbol: 'VTI',  name: 'Total Market ETF',   type: 'etf',    sector: 'Broad Market',     mockPrice: 270, mockPe: 25 },
  { symbol: 'AAPL', name: 'Apple Inc.',         type: 'equity', sector: 'Technology',       mockPrice: 215, mockPe: 32 },
  { symbol: 'MSFT', name: 'Microsoft Corp.',    type: 'equity', sector: 'Technology',       mockPrice: 430, mockPe: 35 },
  { symbol: 'NVDA', name: 'NVIDIA Corp.',       type: 'equity', sector: 'Technology',       mockPrice: 125, mockPe: 45 },
  { symbol: 'JPM',  name: 'JPMorgan Chase',     type: 'equity', sector: 'Financials',       mockPrice: 205, mockPe: 12 },
  { symbol: 'KO',   name: 'Coca-Cola Co.',      type: 'equity', sector: 'Consumer Staples', mockPrice: 63,  mockPe: 26 },
  { symbol: 'XOM',  name: 'Exxon Mobil',        type: 'equity', sector: 'Energy',           mockPrice: 115, mockPe: 14 },
];

const PROPOSAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    symbol: { type: 'string' },
    name: { type: 'string' },
    action: { type: 'string', enum: ['buy', 'sell', 'hold'] },
    sizePct: { type: 'number' },
    confidence: { type: 'string', enum: ['Low', 'Medium', 'High'] },
    thesis: { type: 'string' },
    metrics: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { label: { type: 'string' }, value: { type: 'string' } },
        required: ['label', 'value'],
      },
    },
    withinRules: { type: 'boolean' },
    ruleNote: { type: 'string' },
  },
  required: ['symbol', 'name', 'action', 'sizePct', 'confidence', 'thesis', 'metrics', 'withinRules', 'ruleNote'],
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const guardrails = (body && body.guardrails) || {};
  const holdings = (body && body.holdings) || {};

  const universe = filterUniverse(guardrails);
  if (universe.length === 0) {
    res.status(200).json({
      symbol: '—', name: '—', action: 'hold', sizePct: 0, confidence: 'Low',
      thesis: 'Your current rules exclude every asset in Alfred\'s demo universe. Allow ETFs or US equities to receive ideas.',
      metrics: [], withinRules: false, ruleNote: 'No eligible assets under your rules', engine: 'rules', price: 0,
    });
    return;
  }

  try {
    const market = await withTimeout(buildMarketData(universe), 7000);
    let proposal;
    let engine;

    if (process.env.ANTHROPIC_API_KEY) {
      proposal = await withTimeout(askClaude(guardrails, holdings, market), 8500);
      engine = market.live ? 'claude + finnhub' : 'claude (simulated data)';
    } else {
      proposal = ruleBasedProposal(guardrails, holdings, market);
      engine = market.live ? 'rules + finnhub' : 'simulated';
    }

    const finalized = finalize(proposal, guardrails, market, engine);
    res.status(200).json(finalized);
  } catch (err) {
    // Any failure → deterministic simulated proposal so the demo never dead-ends.
    const market = await buildMarketData(universe, true).catch(function () { return mockMarket(universe); });
    const proposal = ruleBasedProposal(guardrails, holdings, market);
    res.status(200).json(finalize(proposal, guardrails, market, 'simulated', String((err && err.message) || err)));
  }
}

// ---------- universe + market data ----------

function filterUniverse(g) {
  const assets = Array.isArray(g.assets) ? g.assets : ['etf', 'equity'];
  const banned = Array.isArray(g.bannedSectors) ? g.bannedSectors : [];
  return UNIVERSE.filter(function (u) {
    return assets.indexOf(u.type) !== -1 && banned.indexOf(u.sector) === -1;
  });
}

async function buildMarketData(universe, forceMock) {
  const key = process.env.FINNHUB_API_KEY;
  if (forceMock || !key) { return mockMarket(universe); }

  const picks = universe.slice(0, 6);
  const rows = await Promise.all(picks.map(async function (u) {
    try {
      const [quote, recs] = await Promise.all([
        fetchJson('https://finnhub.io/api/v1/quote?symbol=' + u.symbol + '&token=' + key),
        fetchJson('https://finnhub.io/api/v1/stock/recommendation?symbol=' + u.symbol + '&token=' + key),
      ]);
      const price = quote && quote.c ? quote.c : u.mockPrice;
      const changePct = quote && typeof quote.dp === 'number' ? quote.dp : 0;
      const r = Array.isArray(recs) && recs.length ? recs[0] : null;
      return {
        symbol: u.symbol, name: u.name, type: u.type, sector: u.sector,
        price: round2(price), changePct: round2(changePct),
        rec: r ? { strongBuy: r.strongBuy, buy: r.buy, hold: r.hold, sell: r.sell, strongSell: r.strongSell } : null,
        pe: u.mockPe,
      };
    } catch (e) {
      return mockRow(u);
    }
  }));
  return { live: true, rows: rows };
}

function mockMarket(universe) {
  return { live: false, rows: universe.slice(0, 6).map(mockRow) };
}
function mockRow(u) {
  // Deterministic pseudo-trend so simulated output is stable per symbol.
  const seed = u.symbol.charCodeAt(0) + u.symbol.charCodeAt(u.symbol.length - 1);
  const changePct = round2(((seed % 9) - 3) * 0.6);
  return {
    symbol: u.symbol, name: u.name, type: u.type, sector: u.sector,
    price: u.mockPrice, changePct: changePct,
    rec: { strongBuy: (seed % 5), buy: (seed % 7), hold: (seed % 4), sell: (seed % 3), strongSell: (seed % 2) },
    pe: u.mockPe,
  };
}

// ---------- Claude reasoning ----------

async function askClaude(guardrails, holdings, market) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const system =
    'You are Alfred, a discipline-first investing co-pilot operating a $10,000 paper-trading demo account. ' +
    'Propose exactly ONE trade idea from the supplied market data. You MUST obey every guardrail: never exceed the max single position size, ' +
    'never use leverage if it is off, never propose a banned sector or a disallowed asset type. ' +
    'Base the idea on the supplied prices, day changes, P/E, and analyst recommendation trends. ' +
    'Give a clear, plain-language thesis (no hype). Set withinRules=true only if the idea fully complies, and explain the rule check in ruleNote. ' +
    'sizePct is the percent of the total portfolio to allocate (for buys) or trim (for sells) and must be <= the max single position. ' +
    'If nothing is compelling within the rules, return action="hold". The user approves or declines every idea — never assume approval.';

  const userPayload = {
    guardrails: {
      risk: guardrails.risk,
      horizon: guardrails.horizon,
      maxPositionPct: guardrails.maxPositionPct,
      leverage: guardrails.leverage,
      allowedAssets: guardrails.assets,
      bannedSectors: guardrails.bannedSectors,
    },
    currentHoldings: Object.keys(holdings || {}).map(function (s) {
      return { symbol: s, shares: holdings[s].shares, avgPrice: holdings[s].avgPrice };
    }),
    market: market.rows,
    marketDataIsLive: market.live,
  };

  const resp = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1500,
    system: system,
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: PROPOSAL_SCHEMA },
    },
    messages: [
      { role: 'user', content: 'Here is the account context and market data as JSON. Return one proposal.\n\n' + JSON.stringify(userPayload) },
    ],
  });

  const textBlock = (resp.content || []).find(function (b) { return b.type === 'text'; });
  if (!textBlock) throw new Error('No content from model');
  return JSON.parse(textBlock.text);
}

// ---------- rule-based fallback ----------

function ruleBasedProposal(guardrails, holdings, market) {
  // Score each row by analyst lean + momentum; pick the best buy candidate.
  const scored = market.rows.map(function (r) {
    const rec = r.rec || {};
    const lean = (rec.strongBuy || 0) * 2 + (rec.buy || 0) - (rec.sell || 0) - (rec.strongSell || 0) * 2;
    const score = lean + (r.changePct || 0);
    return { row: r, score: score };
  }).sort(function (a, b) { return b.score - a.score; });

  const best = scored[0].row;
  const size = Math.min(2, guardrails.maxPositionPct || 5);
  const conf = scored[0].score > 4 ? 'High' : (scored[0].score > 1 ? 'Medium' : 'Low');
  const rec = best.rec || {};
  return {
    symbol: best.symbol,
    name: best.name,
    action: 'buy',
    sizePct: size,
    confidence: conf,
    thesis: 'Analyst recommendation trend leans positive and the recent move (' + (best.changePct >= 0 ? '+' : '') + best.changePct +
      '%) supports a measured add. Sizing stays well inside your ' + (guardrails.maxPositionPct || 5) + '% single-position limit.',
    metrics: [
      { label: 'Day change', value: (best.changePct >= 0 ? '+' : '') + best.changePct + '%' },
      { label: 'Analyst buys', value: String((rec.strongBuy || 0) + (rec.buy || 0)) },
      { label: 'P/E', value: best.pe ? String(best.pe) : '—' },
    ],
    withinRules: true,
    ruleNote: 'Within your rules · max position ' + (guardrails.maxPositionPct || 5) + '% · ' +
      (guardrails.leverage ? 'leverage allowed' : 'no leverage') + ' · ' + best.sector,
  };
}

// ---------- finalize (clamp to rules, attach live price) ----------

function finalize(proposal, guardrails, market, engine, note) {
  const row = market.rows.find(function (r) { return r.symbol === proposal.symbol; });
  const maxPct = guardrails.maxPositionPct || 5;

  let withinRules = !!proposal.withinRules;
  let ruleNote = proposal.ruleNote || '';
  let sizePct = Number(proposal.sizePct) || 0;

  // Server-side enforcement, regardless of what the model said.
  if (proposal.action !== 'hold') {
    if (!row) { withinRules = false; ruleNote = 'Symbol not in your allowed universe'; }
    if (sizePct > maxPct) { sizePct = maxPct; }
    if (sizePct <= 0) { sizePct = Math.min(2, maxPct); }
  }

  return {
    symbol: proposal.symbol,
    name: proposal.name || (row && row.name) || proposal.symbol,
    action: proposal.action,
    sizePct: round2(sizePct),
    confidence: proposal.confidence || 'Medium',
    thesis: proposal.thesis || '',
    metrics: Array.isArray(proposal.metrics) ? proposal.metrics.slice(0, 3) : [],
    withinRules: withinRules,
    ruleNote: ruleNote,
    price: row ? row.price : 0,
    engine: engine,
    note: note || (market.live ? null : 'simulated market data — add FINNHUB_API_KEY for live data'),
  };
}

// ---------- helpers ----------

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('fetch ' + r.status);
  return r.json();
}
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise(function (_, reject) { setTimeout(function () { reject(new Error('timeout')); }, ms); }),
  ]);
}
function round2(n) { return Math.round(n * 100) / 100; }
