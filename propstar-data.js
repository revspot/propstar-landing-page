/* ============================================================
   Propstar — shared data layer
   Owns: catalogue store, quiz config store, matching engine,
   label lookups. Both the public site and the admin console
   depend on this file and never touch storage directly
   (except the lead + admin-session keys noted in the spec).
   Exposed as window.PROPSTAR.
   ============================================================ */
(function () {
  'use strict';

  var PROPS_KEY = 'propstar_properties_v4';
  var QUIZ_KEY = 'propstar_quiz_v5';

  /* ---------- helpers ---------- */

  function uid() {
    return Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 6);
  }

  function slug(s) {
    return String(s || '').toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- content source ----------
     The ONLY place that knows where content comes from. Today it is static
     JSON under content/; to move to a hosted CMS (Sanity, Supabase, a Sheets
     export) rewrite fetchContent() to resolve the same shape:
         { projects: [ ...property objects... ], quiz: { ...quiz config... } }
     Nothing else in the app changes. Field names are the contract — see
     content/README.md for the schema. */

  /* Root-absolute, not relative: the site is served at nested paths now
     (/properties/, /project/<id>/), where 'content/…' would resolve to
     /project/<id>/content/… and 404 the whole page into contentError. */
  var SOURCE = {
    catalogue: '/content/catalogue.json',
    quiz: '/content/quiz.json'
  };

  function fetchJSON(url) {
    /* no-cache so a freshly published edit is picked up on the next load
       rather than sitting behind a stale CDN copy */
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' returned HTTP ' + r.status);
      return r.json();
    });
  }

  function fetchContent() {
    return Promise.all([fetchJSON(SOURCE.catalogue), fetchJSON(SOURCE.quiz)])
      .then(function (res) { return { projects: res[0], quiz: res[1] }; });
  }

  /* In-memory content, filled once by boot(). Every read below stays
     synchronous against this cache, so the rest of the app is unchanged. */
  var CONTENT = { projects: null, quiz: null };

  function ready() { return !!(CONTENT.projects && CONTENT.quiz); }

  function boot() {
    if (ready()) return Promise.resolve(CONTENT);
    return fetchContent().then(function (c) {
      if (!Array.isArray(c.projects) || !c.quiz || !c.quiz.locations) {
        throw new Error('Content loaded but did not match the expected shape');
      }
      CONTENT.projects = c.projects;
      CONTENT.quiz = c.quiz;
      return CONTENT;
    });
  }

  /* The build-time prerender already holds the content in memory — it just
     wrote catalogue.json — so it seeds the cache directly instead of fetching.
     There is no fetch in Node, and re-reading the file we just wrote would be
     a second source of truth. */
  function setContent(c) {
    CONTENT.projects = c.projects;
    CONTENT.quiz = c.quiz;
    return CONTENT;
  }

  /* 'seed' now means 'as published', i.e. the content source without any
     local admin edits layered on top */
  function seedProps() { return clone(CONTENT.projects || []); }

  function seedQuiz() {
    return clone(CONTENT.quiz ||
      { questions: {}, locations: [], budgets: [], purposes: [] });
  }

  var ANY_LOCALITY = { key: 'any', label: 'Open to any area' };

  /* ---------- storage ---------- */

  function load() {
    try {
      var raw = localStorage.getItem(PROPS_KEY);
      if (raw) {
        var arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr;
      }
    } catch (e) { /* fall through to seed */ }
    return seedProps();
  }

  function save(arr) {
    localStorage.setItem(PROPS_KEY, JSON.stringify(arr));
    return arr;
  }

  function resetSeed() {
    localStorage.removeItem(PROPS_KEY);
    return seedProps();
  }

  function loadQuiz() {
    try {
      var raw = localStorage.getItem(QUIZ_KEY);
      if (raw) {
        var cfg = JSON.parse(raw);
        if (cfg && cfg.questions && cfg.locations) return cfg;
      }
    } catch (e) { /* fall through to seed */ }
    return seedQuiz();
  }

  function saveQuiz(cfg) {
    localStorage.setItem(QUIZ_KEY, JSON.stringify(cfg));
    return cfg;
  }

  function resetQuiz() {
    localStorage.removeItem(QUIZ_KEY);
    return seedQuiz();
  }

  /* ---------- config lookups ---------- */

  function quizConfig() { return clone(loadQuiz()); }
  function questions() { return clone(loadQuiz().questions); }

  function activeSteps() {
    var q = loadQuiz().questions;
    return ['city', 'locality', 'budget', 'purpose'].filter(function (k) { return q[k] && q[k].on; });
  }

  function localitiesFor(cityKey) {
    var city = loadQuiz().locations.find(function (l) { return l.key === cityKey; });
    var list = city && city.localities ? clone(city.localities) : [];
    list.push(clone(ANY_LOCALITY));
    return list;
  }

  function localityLabel(key) {
    if (!key) return '';
    if (key === 'any') return ANY_LOCALITY.label;
    var cfg = loadQuiz();
    for (var i = 0; i < cfg.locations.length; i++) {
      var hit = (cfg.locations[i].localities || []).find(function (l) { return l.key === key; });
      if (hit) return hit.label;
    }
    return key;
  }

  function labelFor(kind, key) {
    if (!key) return '';
    var cfg = loadQuiz();
    var list = kind === 'city' || kind === 'location' ? cfg.locations
             : kind === 'budget' ? cfg.budgets
             : kind === 'purpose' ? cfg.purposes
             : kind === 'locality' ? null : null;
    if (kind === 'locality') return localityLabel(key);
    if (!list) return key;
    var hit = list.find(function (o) { return o.key === key; });
    return hit ? hit.label : key;
  }

  /* ---------- matching engine ---------- */

  var WEIGHTS = {
    balanced: { loc: 50, locality: 25, bud: 30, pur: 20 },
    location: { loc: 65, locality: 35, bud: 20, pur: 15 },
    budget:   { loc: 30, locality: 20, bud: 50, pur: 20 }
  };

  function budgetAdj(key) {
    var order = loadQuiz().budgets.map(function (b) { return b.key; });
    var i = order.indexOf(key);
    if (i < 0) return [];
    var adj = [];
    if (i > 0) adj.push(order[i - 1]);
    if (i < order.length - 1) adj.push(order[i + 1]);
    return adj;
  }

  function scoreProperty(p, answers, weights) {
    var w = weights || WEIGHTS.balanced;
    var score = 0, reasons = [];

    if (answers.location) {
      if (p.locationKey === answers.location) { score += w.loc; reasons.push('Exact location match'); }
      else if ((p.nearbyKeys || []).indexOf(answers.location) >= 0) { score += w.loc * 0.4; reasons.push('Near your preferred city'); }
    }
    if (answers.locality && answers.locality !== 'any') {
      if (p.localityKey === answers.locality) { score += w.locality; reasons.push('In your preferred neighbourhood'); }
    }
    if (answers.budget) {
      if ((p.budgetBands || []).indexOf(answers.budget) >= 0) { score += w.bud; reasons.push('Within your range'); }
      else {
        var adj = budgetAdj(answers.budget);
        if ((p.budgetBands || []).some(function (b) { return adj.indexOf(b) >= 0; })) {
          score += w.bud * 0.5; reasons.push('Just outside your range');
        }
      }
    }
    if (answers.purpose) {
      if ((p.purposes || []).indexOf(answers.purpose) >= 0) { score += w.pur; reasons.push('Suits your goal'); }
    }
    return { score: score, reasons: reasons };
  }

  function match(props, answers, opts) {
    opts = opts || {};
    var weights = opts.weights || WEIGHTS.balanced;
    var limit = opts.limit || 6;
    var scored = (props || []).map(function (p) {
      var s = scoreProperty(p, answers || {}, weights);
      return { prop: p, score: s.score, reasons: s.reasons };
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    var top = scored.slice(0, limit);
    var fallback = props && props.length > 0 && top.every(function (t) { return t.score === 0; });
    return { results: top, fallback: fallback };
  }

  /* ---------- export ---------- */

  window.PROPSTAR = {
    boot: boot, ready: ready, setContent: setContent, SOURCE: SOURCE,
    uid: uid, slug: slug,
    load: load, save: save, resetSeed: resetSeed,
    loadQuiz: loadQuiz, saveQuiz: saveQuiz, resetQuiz: resetQuiz,
    quizConfig: quizConfig, questions: questions, seedQuiz: seedQuiz,
    activeSteps: activeSteps, localitiesFor: localitiesFor, localityLabel: localityLabel,
    labelFor: labelFor,
    match: match, scoreProperty: scoreProperty,
    WEIGHTS: WEIGHTS, budgetAdj: budgetAdj,
    get LOCATIONS() { return clone(loadQuiz().locations); },
    get BUDGETS() { return clone(loadQuiz().budgets); },
    get PURPOSES() { return clone(loadQuiz().purposes); },
    get QUIZ() { return quizConfig(); }
  };
})();
