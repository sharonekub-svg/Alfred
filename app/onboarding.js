// Onboarding questionnaire — collects the mandatory rules, then unlocks the dashboard.
(function () {
  'use strict';

  var form = document.getElementById('rules-form');
  var errBox = document.getElementById('form-error');

  // Live slider read-outs
  var maxPos = document.getElementById('maxPos');
  var maxPosVal = document.getElementById('maxPosVal');
  var dailyCap = document.getElementById('dailyCap');
  var dailyCapVal = document.getElementById('dailyCapVal');
  maxPos.addEventListener('input', function () { maxPosVal.textContent = maxPos.value; });
  dailyCap.addEventListener('input', function () { dailyCapVal.textContent = dailyCap.value; });

  // Pre-fill if the user is editing existing rules
  var existing = window.Alfred.getGuardrails();
  if (existing) {
    setRadio('risk', existing.risk);
    setRadio('horizon', existing.horizon);
    setRadio('leverage', existing.leverage ? 'on' : 'off');
    maxPos.value = existing.maxPositionPct || 5; maxPosVal.textContent = maxPos.value;
    dailyCap.value = existing.dailyCap || 3; dailyCapVal.textContent = dailyCap.value;
    setChecks('assets', existing.assets || []);
    setChecks('banned', existing.bannedSectors || []);
  }

  function setRadio(name, value) {
    if (!value) return;
    var el = form.querySelector('input[name="' + name + '"][value="' + value + '"]');
    if (el) el.checked = true;
  }
  function setChecks(name, values) {
    form.querySelectorAll('input[name="' + name + '"]').forEach(function (el) {
      el.checked = values.indexOf(el.value) !== -1;
    });
  }
  function getRadio(name) {
    var el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : null;
  }
  function getChecks(name) {
    return Array.prototype.slice
      .call(form.querySelectorAll('input[name="' + name + '"]:checked'))
      .map(function (el) { return el.value; });
  }

  function showError(msg) {
    errBox.textContent = msg;
    errBox.style.display = 'block';
    errBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errBox.style.display = 'none';

    var risk = getRadio('risk');
    var horizon = getRadio('horizon');
    var leverage = getRadio('leverage');
    var assets = getChecks('assets');

    // Every required question must be answered before Alfred can trade.
    if (!risk) { return showError('Please answer question 1 — risk tolerance.'); }
    if (!horizon) { return showError('Please answer question 2 — investment horizon.'); }
    if (!leverage) { return showError('Please answer question 4 — leverage.'); }
    if (assets.length === 0) { return showError('Please pick at least one allowed asset type (question 6).'); }

    var guardrails = {
      completed: true,
      risk: risk,
      horizon: horizon,
      maxPositionPct: parseInt(maxPos.value, 10),
      leverage: leverage === 'on',
      dailyCap: parseInt(dailyCap.value, 10),
      assets: assets,
      bannedSectors: getChecks('banned'),
      requireApproval: true, // locked on
      updatedAt: Date.now(),
    };

    window.Alfred.setGuardrails(guardrails);
    if (!window.Alfred.getPortfolio()) { window.Alfred.resetPortfolio(); }
    window.location.href = './dashboard.html';
  });
})();
