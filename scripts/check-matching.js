#!/usr/bin/env node
/* Self-check for the matching engine in propstar-data.js.

   Why this file exists: the content JSON is rigorously validated by
   build-content.js, while the logic that consumes it had no check at all —
   which is backwards, because that is where the risk actually lives. In
   particular budgetAdj() treats NEIGHBOURING budget bands as a partial match by
   array position, so scoring is silently wrong unless content/quiz.json lists
   budgets cheapest-to-dearest. That constraint was enforced only by a sentence
   of prose in content/README.md. Reorder the bands and nothing breaks loudly —
   the quiz just starts recommending the wrong homes.

   Run: node scripts/check-matching.js
*/
'use strict';

var assert = require('assert');
var path = require('path');

var ROOT = path.join(__dirname, '..');
global.window = global.window || {};
require(path.join(ROOT, 'propstar-data.js'));
var P = global.window.PROPSTAR;

var catalogue = require(path.join(ROOT, 'content', 'catalogue.json'));
var quiz = require(path.join(ROOT, 'content', 'quiz.json'));
P.setContent({ projects: catalogue, quiz: quiz });

var checks = 0;
function check(what, fn) { fn(); checks++; console.log('  ok  ' + what); }

var CITY = quiz.locations[0].key;
var BANDS = quiz.budgets.map(function (b) { return b.key; });

/* ---- the ordering assumption budgetAdj depends on ---- */

check('budget bands are ordered cheapest to dearest', function () {
  /* Parse the leading figure out of each label and assert it ascends. Labels
     look like "₹1 – 3 Cr" or "₹50 L – 1 Cr", so normalise everything to lakhs. */
  var vals = quiz.budgets.map(function (b) {
    var m = String(b.label).match(/([\d.]+)\s*(L|Cr)/i);
    if (!m) return null;
    var n = parseFloat(m[1]);
    return /cr/i.test(m[2]) ? n * 100 : n;
  });
  if (vals.some(function (v) { return v === null; })) {
    console.log('  --  skipped: not every budget label has a parseable figure');
    return;
  }
  for (var i = 1; i < vals.length; i++) {
    assert.ok(vals[i] >= vals[i - 1],
      'content/quiz.json budgets must run cheapest to dearest — "' +
      quiz.budgets[i].label + '" (' + vals[i] + 'L) follows "' +
      quiz.budgets[i - 1].label + '" (' + vals[i - 1] + 'L). budgetAdj() treats ' +
      'neighbouring array positions as a partial match, so the order is load-bearing.');
  }
});

check('budgetAdj returns only true neighbours', function () {
  assert.deepStrictEqual(P.budgetAdj(BANDS[0]), [BANDS[1]],
    'the cheapest band has exactly one neighbour, the next one up');
  assert.deepStrictEqual(P.budgetAdj(BANDS[BANDS.length - 1]), [BANDS[BANDS.length - 2]],
    'the dearest band has exactly one neighbour, the one below');
  assert.deepStrictEqual(P.budgetAdj('no-such-band'), [],
    'an unknown band must yield no neighbours rather than throwing');
  if (BANDS.length >= 3) {
    assert.deepStrictEqual(P.budgetAdj(BANDS[1]), [BANDS[0], BANDS[2]],
      'a middle band has a neighbour on each side');
  }
});

/* ---- scoring order: exact beats adjacent beats distant ---- */

check('an exact budget match scores above an adjacent band', function () {
  if (BANDS.length < 3) { console.log('  --  need 3+ bands'); return; }
  var answers = { location: null, locality: null, budget: BANDS[0], purpose: null };
  var exact = P.scoreProperty({ budgetBands: [BANDS[0]] }, answers).score;
  var adjacent = P.scoreProperty({ budgetBands: [BANDS[1]] }, answers).score;
  var distant = P.scoreProperty({ budgetBands: [BANDS[BANDS.length - 1]] }, answers).score;
  assert.ok(exact > adjacent, 'exact (' + exact + ') must beat adjacent (' + adjacent + ')');
  assert.ok(adjacent > distant, 'adjacent (' + adjacent + ') must beat distant (' + distant + ')');
  assert.strictEqual(distant, 0, 'a non-neighbouring band must contribute nothing');
});

check('an exact city match scores above a nearby city', function () {
  var answers = { location: CITY, locality: null, budget: null, purpose: null };
  var exact = P.scoreProperty({ locationKey: CITY }, answers).score;
  var near = P.scoreProperty({ locationKey: 'elsewhere', nearbyKeys: [CITY] }, answers).score;
  var none = P.scoreProperty({ locationKey: 'elsewhere' }, answers).score;
  assert.ok(exact > near, 'exact city (' + exact + ') must beat nearby (' + near + ')');
  assert.ok(near > none, 'nearby (' + near + ') must beat unrelated (' + none + ')');
});

/* ---- the never-empty guarantee the results view relies on ---- */

check('match() never returns an empty list, even for nonsense input', function () {
  var m = P.match(catalogue, { location: 'no-such-city', locality: null, budget: 'no-such-band', purpose: null });
  assert.ok(m && Array.isArray(m.results), 'match() must return a results array');
  assert.ok(m.results.length > 0, 'match() returned nothing — the results view would render blank');
  assert.strictEqual(m.fallback, true, 'a zero-scoring match must be flagged as a fallback');
});

check('match() on an empty catalogue degrades without throwing', function () {
  var m = P.match([], { location: CITY });
  assert.deepStrictEqual(m.results, [], 'no properties means no results');
  assert.strictEqual(m.fallback, false, 'an empty catalogue is not a "fallback" case');
});

check('match() flags a real city match as not-fallback and ranks it first', function () {
  var m = P.match(catalogue, { location: CITY, locality: null, budget: null, purpose: null });
  assert.ok(m.results.length > 0, 'expected results for a real city');
  assert.strictEqual(m.fallback, false, 'a real city match must not be a fallback');
  var top = m.results[0].prop;
  assert.ok(top.locationKey === CITY || (top.nearbyKeys || []).indexOf(CITY) >= 0,
    'top result for ' + CITY + ' was ' + top.id + ', which neither sits in that city nor lists it as nearby');
  assert.ok(m.results[0].reasons.length > 0, 'a scoring match must explain itself on the card');
});

check('match() returns at most 6, sorted descending', function () {
  var m = P.match(catalogue, { location: CITY, locality: null, budget: BANDS[0], purpose: null });
  assert.ok(m.results.length <= 6, 'expected <= 6 results, got ' + m.results.length);
  for (var i = 1; i < m.results.length; i++) {
    assert.ok(m.results[i - 1].score >= m.results[i].score,
      'results must be sorted by score descending');
  }
});

/* ---- content-side invariant the UI depends on ---- */

check('every project sits in a city the quiz offers', function () {
  var cityKeys = quiz.locations.map(function (l) { return l.key; });
  catalogue.forEach(function (p) {
    assert.ok(cityKeys.indexOf(p.locationKey) >= 0,
      p.id + ' has locationKey "' + p.locationKey + '" which is not a known city — ' +
      'it could never be matched by the quiz');
  });
});

console.log('\nMatching engine OK: ' + checks + ' checks passed.');
