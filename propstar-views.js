/* ============================================================
   Propstar — view builders.

   Shared by the browser SPA (index.html) and the build-time prerender
   (scripts/prerender.js). Everything here is a PURE STRING FUNCTION: given the
   data layer and the app state, it returns markup. No DOM, no storage, no
   fetch — that is precisely what lets Node render the same HTML a visitor
   gets, so what Google indexes cannot drift from what the app shows.

   Keep it that way. If a builder ever needs document/window, it belongs in
   index.html instead, and the prerender loses that part of the page.

   Moved verbatim out of index.html; the only edits were turning the three
   DOM-writing functions (renderNav/renderFooter/renderSticky) into
   navHTML()/footerHTML()/stickyHTML() that return strings, and making asset
   paths root-absolute so they resolve at nested URLs like /project/<id>/.
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PROPSTAR_VIEWS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ctx.P is the data layer (window.PROPSTAR), ctx.S the app state object.
     S is closed over BY REFERENCE — index.html only ever mutates its
     properties, never reassigns it, so the builders always see current state. */
  return function createViews(ctx) {
    var P = ctx.P, S = ctx.S;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ============ svg icons (inline only) ============ */
  var I = {
    arrow: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>',
    back: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
    lock: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    tick: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    ticksm: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    chev: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    photos: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
    x: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    ig: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none"/></svg>',
    fb: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M14 8h3V5h-3a4 4 0 0 0-4 4v2H7v3h3v7h3v-7h3l1-3h-4V9a1 1 0 0 1 1-1z"/></svg>',
    li: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4.98 3.5A2.5 2.5 0 1 1 5 8.48a2.5 2.5 0 0 1-.02-4.98zM3 9.5h4V21H3zM10 9.5h3.8v1.6h.05c.53-1 1.83-2.06 3.77-2.06 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.2c0-1.24-.02-2.84-1.73-2.84-1.73 0-2 1.35-2 2.75V21h-4z"/></svg>',
    wa: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.4-.7-2.9-1.1-4.7-4-4.9-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.4l.9 2.1c.1.2.1.4 0 .6l-.4.6-.5.5c-.2.2-.3.4-.1.7.2.3.9 1.5 2 2.4 1.4 1.2 2.5 1.6 2.9 1.7.3.2.5.1.7-.1l1-1.2c.2-.3.4-.2.7-.1l2.1 1c.3.2.5.3.6.4 0 .2 0 .7-.2 1.2z"/></svg>',
    dia: '◆'
  };

  /* ============ nav ============ */
  function navHTML() {
    return '<div class="nav-brand" onclick="App.goHome()">' +
        '<img src="/assets/propstar-mark-96.png" alt="Propstar">' +
        '<span>Propstar</span></div>' +
      '<div class="nav-links">' +
        '<button class="' + (S.view === 'home' ? 'on' : '') + '" onclick="App.goHome()">Home</button>' +
        '<button class="' + (S.view === 'properties' ? 'on' : '') + '" onclick="App.goProperties()">Properties</button>' +
        '<button class="' + (S.view === 'about' ? 'on' : '') + '" onclick="App.goAbout()">About</button>' +
      '</div>' +
      '<button class="btn" onclick="App.openContact()">Contact us</button>';
  }

  /* ============ wizard ============ */
  function wizardHTML() {
    var steps = P.activeSteps();
    var total = steps.length;
    var qs = P.questions();
    var pct, stepLbl, body;

    if (S.complete) {
      pct = 100; stepLbl = 'Matches ready';
      body =
        '<div class="wiz-step" style="text-align:center;padding:12px 0 4px">' +
          '<div class="done-tick">' + I.tick + '</div>' +
          '<div class="wiz-q">Your shortlist is ready' + (S.lead ? ', ' + esc(firstName(S.lead.name)) : '') + '.</div>' +
          '<div class="wiz-hint" style="margin-top:8px">Handpicked from every project on Propstar. No prices on display, no pressure.</div>' +
          '<button class="btn" onclick="App.scrollToResults()">View my matches ' + I.arrow + '</button>' +
          '<div class="privacy-line" style="justify-content:center">' + I.lock + ' Your advisor steps in only when you ask.</div>' +
          '<div style="text-align:center;margin-top:10px"><button class="start-over" onclick="App.restartQuiz()">Change my answers</button></div>' +
        '</div>';
    } else if (S.step <= total) {
      var id = steps[S.step - 1];
      var q = qs[id];
      pct = Math.round((S.step / (total + 2)) * 100);
      stepLbl = 'Step ' + S.step + ' of ' + total;
      var opts = '', grid = '';
      if (id === 'city') {
        grid = 'two';
        opts = P.LOCATIONS.map(function (o) {
          return optRow('city', o.key, o.label, o.hint, S.answers.location === o.key);
        }).join('');
      } else if (id === 'locality') {
        grid = 'two';
        opts = P.localitiesFor(S.answers.location).map(function (o) {
          return optRow('locality', o.key, o.label, '', S.answers.locality === o.key);
        }).join('');
      } else if (id === 'budget') {
        opts = P.BUDGETS.map(function (o) {
          return optRow('budget', o.key, o.label, '', S.answers.budget === o.key);
        }).join('');
      } else {
        opts = P.PURPOSES.map(function (o) {
          return optRow('purpose', o.key, o.label, o.hint, S.answers.purpose === o.key);
        }).join('');
      }
      body =
        '<div class="wiz-step" data-step="' + S.step + '">' +
          '<div class="wiz-q">' + esc(q.q) + '</div>' +
          '<div class="wiz-hint">' + esc(q.h) + '</div>' +
          '<div class="opts ' + grid + '">' + opts + '</div>' +
        '</div>';
    } else {
      /* gate step */
      pct = 92; stepLbl = 'Final step';
      if (S.lead) {
        body =
          '<div class="wiz-step" style="text-align:center;padding:12px 0 4px">' +
            '<div class="done-tick">' + I.tick + '</div>' +
            '<div class="wiz-q">Welcome back, ' + esc(firstName(S.lead.name)) + '.</div>' +
            '<div class="wiz-hint" style="margin-top:8px">We remember you. No forms this time.</div>' +
            '<button class="btn" onclick="App.finish()">Show my matches ' + I.arrow + '</button>' +
            '<div class="privacy-line" style="justify-content:center"><button style="color:var(--muted);font-size:12px;text-decoration:underline" onclick="App.resetLead()">Not you? Start fresh</button></div>' +
          '</div>';
      } else {
        body =
          '<div class="wiz-step">' +
            '<div class="wiz-q">Where should we send your matches?</div>' +
            '<div class="wiz-hint">One time only. We never ask twice.</div>' +
            '<form onsubmit="App.submitLead(event)">' +
              '<div class="field"><label>Full name</label><input id="lead-name" type="text" placeholder="Your name" autocomplete="name"></div>' +
              '<div class="field"><label>Phone</label><div class="phone-wrap"><span class="cc">+91</span>' +
                '<input id="lead-phone" type="tel" inputmode="tel" placeholder="98xxxxxxxx" autocomplete="tel" style="flex:1"></div></div>' +
              '<div class="field"><label>Email <span style="opacity:.55;text-transform:none;letter-spacing:0">(optional)</span></label>' +
                '<input id="lead-email" type="email" placeholder="you@example.com" autocomplete="email"></div>' +
              '<div id="lead-err"></div>' +
              '<button class="btn" type="submit">Show my matches ' + I.arrow + '</button>' +
            '</form>' +
            '<div class="privacy-line">' + I.lock + ' We respect your privacy. No spam, ever.</div>' +
          '</div>';
      }
    }

    var canBack = !S.complete && S.step > 1;
    return '<div class="wiz" id="wizcard">' +
      '<div class="wiz-bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="wiz-body">' +
        '<div class="wiz-head">' +
          (canBack ? '<button class="wiz-back" onclick="App.wizBack()">' + I.back + ' Back</button>'
                   : '<span class="eyebrow" style="color:var(--muted)">Find my Propstar match</span>') +
        '<span class="step-lbl">' + stepLbl + '</span></div>' + body +
      '</div></div>';
  }

  function optRow(kind, key, label, hint, on) {
    return '<button class="opt' + (on ? ' on' : '') + '" data-optkey="' + esc(key) + '" onclick="App.pick(\'' + kind + '\',\'' + key + '\')">' +
      '<span><span class="t">' + esc(label) + '</span>' +
      (hint ? '<div class="h">' + esc(hint) + '</div>' : '') + '</span>' +
      '<span class="dot"></span></button>';
  }

  function firstName(n) { return String(n || '').trim().split(/\s+/)[0]; }

  /* ============ cards ============ */
  /* content/README.md nominated photoDescription as alt text and nothing ever
     used it — so every image on a detail page shared alt="<project name>",
     which is useless to a screen reader and to image search alike. */
  function altFor(p, i, n) {
    var base = p.photoDescription || (p.name + ', ' + p.location);
    if (i == null) return base;
    return base + ' — ' + p.name + ' (' + (i + 1) + ' of ' + n + ')';
  }

  function photoOr(p, cls) {
    var src = p.images && p.images[0];
    if (src) return '<img' + (cls ? ' class="' + cls + '"' : '') + ' src="' + esc(src) + '" alt="' + esc(altFor(p)) + '" loading="lazy" decoding="async">';
    return '<div class="ph-fallback"' + (cls ? ' style="position:absolute;inset:0"' : '') + '><span>' + esc((p.name || '?').charAt(0)) + '</span></div>';
  }

  function cardHTML(p, reveal, reason) {
    return '<article class="card' + (reveal ? ' rv' : '') + '" onclick="App.openProp(\'' + p.id + '\')">' +
      '<div class="ph">' +
        (p.status ? '<span class="status-pill">' + esc(p.status) + '</span>' : '') +
        photoOr(p) +
      '</div>' +
      '<div class="bd">' +
        '<button class="go" aria-label="Open ' + esc(p.name) + '">' + I.arrow + '</button>' +
        '<div class="dev">' + esc(p.developer) + '</div>' +
        '<div class="nm">' + esc(p.name) + '</div>' +
        '<div class="lc">' + esc(p.location) + '</div>' +
        (reason ? '<div class="match-why"><span>✦</span>' + esc(reason) + '</div>' : '') +
        (p.tags && p.tags.length ? '<div class="tags">' + p.tags.slice(0, 3).map(function (t) {
          return '<span class="tag">' + esc(t) + '</span>';
        }).join('') + '</div>' : '') +
      '</div></article>';
  }

  /* ============ views ============ */
  function homeHTML() {
    var html =
      '<section class="hero"><div class="wrap hero-grid">' +
        '<div class="hero-copy">' +
          '<div class="eyebrow">India\'s trusted luxury real estate consultants</div>' +
          '<h1>No pitches.<br>Just <em>possibilities.</em></h1>' +
          '<p class="sub">Propstar Solution curates handpicked homes from India\'s most reputable developers, then pairs you with a luxury consultant who guides you 1-on-1. You set the pace. We bring the expertise.</p>' +
          '<div class="stats">' +
            '<div><div class="num" data-count="1500" data-suffix="+">0</div><div class="lbl">Families matched</div></div>' +
            '<div><div class="num" data-count="40" data-suffix="+">0</div><div class="lbl">Developers onboarded</div></div>' +
            '<div><div class="num" data-count="4" data-suffix="x">0</div><div class="lbl">Faster discovery</div></div>' +
          '</div>' +
          '<div class="trust-line"><span class="dia">' + I.dia + '</span> White-glove support from shortlist to keys, private site visits included.</div>' +
        '</div>' +
        '<div id="wizmount">' + wizardHTML() + '</div>' +
      '</div></section>' +
      '<div class="chev" style="margin-top:-46px;position:relative;z-index:2">' + I.chev + '</div>' +

      /* everything below the hero sits on a solid sheet so the fixed hero video
         only shows through the hero itself — body text is never over the video */
      '<div class="home-sheet">' +
      '<section class="marquee-sec"><div class="lbl">Partnered with 40+ of India\'s leading developers</div>' +
        '<div class="marquee"><div class="track">' + marqueeImgs() + marqueeImgs() + '</div></div>' +
      '</section>';

    if (S.complete) html += resultsHTML();

    html += '<section class="standards"><div class="wrap">' +
      '<div class="sec-head"><div class="eyebrow">The Propstar standard</div>' +
        '<h2>Why so <em style="font-style:italic">few</em> projects?</h2>' +
        '<p>We\'re not a listings portal. Every project here clears three bars first, and most don\'t make it.</p></div>' +
      '<div class="grid3">' +
        '<div class="std rv"><span class="dia">' + I.dia + '</span><h3>A developer worth trusting</h3><p>Handpicked projects from India\'s most reputable developers, with delivery records we\'ve verified ourselves. If we wouldn\'t stake our name on theirs, it isn\'t listed.</p></div>' +
        '<div class="std rv"><span class="dia">' + I.dia + '</span><h3>A home that holds its value</h3><p>We evaluate every property not just as a home but as a long-term asset, researching the corridor like an analyst, not a salesperson.</p></div>' +
        '<div class="std rv"><span class="dia">' + I.dia + '</span><h3>An advisor on your side</h3><p>A luxury consultant guides you 1-on-1: private site visits, walkthroughs, documentation, legal support, and access to exclusive offers.</p></div>' +
      '</div>' +
    '</div></section>';

    /* explore by city — editorial band */
    var cityCovers = { bengaluru: '/assets/projects/godrej-aveline-01.webp', mumbai: '/assets/projects/godrej-trilogy-01.webp',
                       navimumbai: '/assets/projects/godrej-varanya-01.webp', pune: '/assets/projects/sobha-nesara-01.webp',
                       hyderabad: '/assets/projects/prestige-golden-grove-01.webp', ncr: '/assets/projects/godrej-crown-01.webp',
                       chennai: '/assets/projects/tvs-emerald-verde-vista-01.webp', kerala: '/assets/projects/prestige-ocean-pearl-01.webp',
                       giftcity: '/assets/projects/sobha-elysia-01.webp' };
    html += '<section class="cities"><div class="wrap">' +
      '<div class="sec-head"><div class="eyebrow">Explore by city</div>' +
        '<h2>Where do you see <em style="font-style:italic">yourself</em>?</h2></div>' +
      '<div class="grid4">' +
      P.LOCATIONS.map(function (l) {
        var n = S.props.filter(function (p) { return p.locationKey === l.key; }).length;
        var cover = cityCovers[l.key];
        return '<div class="citycard rv" onclick="App.exploreCity(\'' + l.key + '\')">' +
          (cover ? '<img src="' + cover + '" alt="' + esc(l.label) + '" loading="lazy" decoding="async">'
                 : '<div class="ph-fallback" style="position:absolute;inset:0"><span>' + esc(l.label.charAt(0)) + '</span></div>') +
          '<div class="veil"></div>' +
          '<span class="go2">' + I.arrow + '</span>' +
          '<div class="txt"><div class="nm">' + esc(l.label) + '</div>' +
          '<div class="ct">' + n + ' curated project' + (n === 1 ? '' : 's') + '</div></div>' +
        '</div>';
      }).join('') +
      '</div>' +
    '</div></section>';

    /* closing pull-quote */
    html += '<section class="quote-band"><div class="wrap">' +
      '<div class="eyebrow">The whole idea</div>' +
      '<h2 class="rv">Chosen, <em>not chased.</em></h2>' +
      '<p class="rv">A few quick questions, a handpicked shortlist, and an advisor who listens before showing you anything.</p>' +
      '<button class="btn rv" onclick="App.toQuiz()">Find my match ' + I.arrow + '</button>' +
    '</div></section>' +
    '</div>';   /* close .home-sheet */
    return html;
  }

  function marqueeImgs() {
    var names = ['Shriram Properties','Provident','White Lotus','Isprava','Puravankara','L&T Realty','DivyaSree','Sumadhura','Brigade','SBP','Oberoi Realty','Krishvi','Century','Godrej Properties','Sobha Realty','Assetz'];
    var s = '';
    for (var i = 1; i <= 16; i++) {
      s += '<img src="/assets/logos/logo-' + (i < 10 ? '0' + i : i) + '.avif" alt="' + esc(names[i-1]) + '" loading="lazy" decoding="async">';
    }
    return s;
  }

  function resultsHTML() {
    var m = P.match(S.props, S.answers, { limit: 6 });
    var pills = [];
    if (S.answers.location) pills.push(P.labelFor('city', S.answers.location));
    if (S.answers.locality && S.answers.locality !== 'any') pills.push(P.localityLabel(S.answers.locality));
    if (S.answers.budget) pills.push(P.labelFor('budget', S.answers.budget));
    if (S.answers.purpose) pills.push(P.labelFor('purpose', S.answers.purpose));

    var sub = m.fallback
      ? 'Nothing matched your answers exactly, so here are the projects our curators rate highest right now.'
      : 'Based on your preferences, here are the projects we\'ve handpicked for you.';

    return '<section class="results-sec" id="results"><div class="wrap">' +
      '<div class="sec-head"><div class="eyebrow">' + (S.lead ? 'Welcome back, here are your matches' : 'Curated for you') + '</div>' +
        '<h2>Your curated collection</h2><p>' + sub + '</p></div>' +
      (pills.length ? '<div class="pills">' + pills.map(function (t) { return '<span class="pill">' + esc(t) + '</span>'; }).join('') + '</div>' : '') +
      '<div class="grid2">' + m.results.map(function (r) {
        return cardHTML(r.prop, true, !m.fallback && r.reasons && r.reasons[0]);
      }).join('') + '</div>' +
      '<div class="grid-foot"><div class="cnt">Showing ' + m.results.length + ' of ' + S.props.length + ' curated projects</div>' +
        '<button class="btn ghost" onclick="App.goProperties()">View all projects ' + I.arrow + '</button></div>' +
    '</div></section>';
  }

  function propertiesHTML() {
    var list = S.pf ? S.props.filter(function (p) { return p.locationKey === S.pf; }) : S.props;
    var shown = list.slice(0, S.pcount);
    var countFor = function (key) {
      return S.props.filter(function (p) { return p.locationKey === key; }).length;
    };
    return '<div class="props-bg"><section class="page"><div class="wrap">' +
      '<div class="page-head"><div class="eyebrow">The collection</div>' +
        '<h1>All properties</h1>' +
        '<p>Browse freely and connect when you\'re ready. No prices on display, no pressure, and an advisor on call the moment you want one.</p></div>' +
      '<div class="filters">' +
        '<button class="fbtn' + (!S.pf ? ' on' : '') + '" onclick="App.filter(\'\')">All cities <i>' + S.props.length + '</i></button>' +
        P.LOCATIONS.map(function (l) {
          return '<button class="fbtn' + (S.pf === l.key ? ' on' : '') + '" onclick="App.filter(\'' + l.key + '\')">' + esc(l.label) + ' <i>' + countFor(l.key) + '</i></button>';
        }).join('') +
      '</div>' +
      (shown.length
        ? '<div class="grid2">' + shown.map(function (p) { return cardHTML(p, true); }).join('') + '</div>' +
          '<div class="grid-foot"><div class="cnt">Showing ' + shown.length + ' of ' + list.length + ' project' + (list.length === 1 ? '' : 's') + '</div>' +
          (list.length > shown.length
            ? '<button class="btn ghost" onclick="App.showMore()">Show more projects</button>'
            : '<div style="font-size:12.5px;color:var(--faint)">That\'s the whole collection. We list less so you can choose better.</div>') +
          '</div>'
        : '<p style="text-align:center;color:var(--muted);padding:60px 0">No projects in this city yet. Our curators are on it.</p>') +
    '</div></section></div>';
  }

  function aboutHTML() {
    return '<section class="page"><div class="wrap about-wrap">' +
      '<div class="page-head" style="margin-bottom:34px"><div class="eyebrow">About Propstar Solution</div>' +
        '<h1>Luxury real estate, with an expert on your side of the table.</h1></div>' +
      '<p class="lede rv">Propstar Solution is a luxury real estate advisory, operated by Revspot. We curate handpicked projects from India\'s most reputable developers, then pair you with a consultant who guides you 1-on-1, from first shortlist to final paperwork. So far, 1,500+ families have found their home this way.</p>' +
      '<p class="lede rv" style="margin-top:18px">A listings portal shows you everything and leaves you on your own. Propstar deliberately shows you less, and stays beside you for the part that actually matters: understanding your lifestyle, evaluating each property as a long-term asset, and arranging private site visits when you\'re ready.</p>' +
      '<div class="steps">' +
        '<div class="stepc rv"><div class="n">1</div><h3>Tell us what you\'re looking for</h3><p>A few quick questions: city, range, and what matters to you. No account needed.</p></div>' +
        '<div class="stepc rv"><div class="n">2</div><h3>See a handpicked shortlist</h3><p>We match your answers against projects from 40+ vetted developers and show you only what fits.</p></div>' +
        '<div class="stepc rv"><div class="n">3</div><h3>Meet your advisor</h3><p>A luxury consultant walks you through your options, schedules private viewings, and helps with evaluation, documentation, and legal steps.</p></div>' +
      '</div>' +
      '<p class="lede rv">Every project on Propstar comes from an established developer with a verifiable track record, the kind of names whose work you already know. We list less so you can choose better.</p>' +
      '<div class="closing rv">Chosen, not chased. <em>That\'s the whole idea.</em></div>' +
    '</div></section>';
  }

  function privacyHTML() {
    return '<section class="page"><div class="wrap legal">' +
      '<div class="eyebrow">Legal</div>' +
      '<h1 style="font-size:clamp(34px,4vw,48px);line-height:1.08;margin:12px 0 10px">Privacy Policy</h1>' +
      '<p class="updated">Effective date: August 6, 2025</p>' +
      '<h2>1. Information we collect</h2>' +
      '<p>When you use Propstar Solution, we collect personal information you share with us, such as your name, phone number, email address, and details about your real estate interests. We also collect non-personal information such as browser type, device details, and usage patterns through cookies and similar tracking technologies.</p>' +
      '<h2>2. How we use your information</h2>' +
      '<p>We use your information to help you explore luxury properties, offer recommendations tailored to your preferences, answer your queries, send newsletters and promotional content you can opt out of at any time, and improve how the site performs.</p>' +
      '<p>We may also use SMS, WhatsApp, RCS, and phone calls to share service updates and promotional messages with you.</p>' +
      '<h2>3. How we share your information</h2>' +
      '<p>We do not sell your personal information. We share it only with our real estate advisors, partner developers, and service providers who help us serve you, and when the law requires us to.</p>' +
      '<h2>4. Cookies and tracking</h2>' +
      '<p>We use cookies to enhance your experience, analyse traffic, and support our marketing. You can disable cookies in your browser settings, though some parts of the site may not work as intended without them.</p>' +
      '<h2>5. Data security</h2>' +
      '<p>We apply industry-standard security measures to protect your information against unauthorised access or compromise.</p>' +
      '<h2>6. Your choices and rights</h2>' +
      '<p>You can request access to or correction of your information, opt out of marketing using the unsubscribe link in any message, and request deletion of your data, subject to legal requirements.</p>' +
      '<h2>7. Third-party links</h2>' +
      '<p>Our site may link to external websites. We are not responsible for their privacy practices, so please review their policies separately.</p>' +
      '<h2>8. Children\'s privacy</h2>' +
      '<p>Our services are meant for adults. We do not knowingly collect information from minors.</p>' +
      '<h2>9. Updates to this policy</h2>' +
      '<p>We may update this policy from time to time. Changes are posted on this page with a revised effective date.</p>' +
      '<h2>10. Partnerships</h2>' +
      '<p>Propstar Solution ("we," "us," "our") maintains a business partnership with Livspace Home Interior Solution ("Livspace"), pursuant to which certain promotional offers and discounts on select properties are made available exclusively to users through this arrangement. By submitting an enquiry form or otherwise expressing interest in a property in respect of which Livspace is offering a promotion, you expressly consent to the disclosure of your personal information — including but not limited to your name, contact number, email address, and stated property preference — to Livspace, for the limited purpose of enabling Livspace to contact you and extend the applicable offer. Such disclosure shall be limited to properties covered under the Propstar–Livspace partnership and shall not extend to any other property or purpose.</p>' +
      '<h2>11. Contact us</h2>' +
      '<p>Questions about this policy? <button class="start-over" style="font-size:15px" onclick="App.openContact()">Contact us</button> and we\'ll help.</p>' +
    '</div></section>';
  }

  function termsHTML() {
    return '<section class="page"><div class="wrap legal">' +
      '<div class="eyebrow">Legal</div>' +
      '<h1 style="font-size:clamp(34px,4vw,48px);line-height:1.08;margin:12px 0 10px">Terms &amp; Conditions</h1>' +
      '<p class="updated">Effective date: August 6, 2025</p>' +
      '<h2>1. Acceptance of terms</h2>' +
      '<p>By accessing this website you confirm that you have read, understood, and agreed to these terms. If you do not agree with them, please do not use the site.</p>' +
      '<h2>2. Services</h2>' +
      '<p>Propstar Solution matches buyers with curated luxury homes and connects users with expert advisors for India\'s premium residential properties. Information on this site is provided for general guidance only.</p>' +
      '<h2>3. Lead form submissions</h2>' +
      '<p>By submitting a lead form, including forms on Meta platforms, you authorise Propstar to access and retrieve additional information about you from trusted third-party vendors or data partners so we can tailor our services and follow-ups to you.</p>' +
      '<h2>4. User responsibilities</h2>' +
      '<ul>' +
        '<li>You must be at least 18 years old to use our services.</li>' +
        '<li>You agree to provide accurate and truthful information.</li>' +
        '<li>You are responsible for ensuring your use of the site complies with applicable laws.</li>' +
      '</ul>' +
      '<h2>5. Intellectual property</h2>' +
      '<p>All content on this website belongs to Propstar Solution or its licensors. Reproducing, distributing, modifying, or creating derivative works from it without written consent is prohibited.</p>' +
      '<h2>6. Third-party links</h2>' +
      '<p>We do not endorse and are not responsible for the content or practices of third-party websites linked from this site.</p>' +
      '<h2>7. Disclaimer</h2>' +
      '<p>Listings and information on this site are informational only and are not financial or investment advice. We make no warranties, express or implied, regarding the accuracy, completeness, or suitability of the information.</p>' +
      '<h2>8. Limitation of liability</h2>' +
      '<p>Propstar Solution is not liable for direct, indirect, incidental, consequential, or punitive damages arising from your use of this website.</p>' +
      '<h2>9. Changes to these terms</h2>' +
      '<p>We may update these terms from time to time without prior notice. The revised version appears on this page with an updated date.</p>' +
      '<h2>10. Privacy</h2>' +
      '<p>How we handle your personal information is governed by our <button class="start-over" style="font-size:15px" onclick="App.goPrivacy()">Privacy Policy</button>.</p>' +
      '<h2>11. Contact us</h2>' +
      '<p>Questions about these terms? <button class="start-over" style="font-size:15px" onclick="App.openContact()">Contact us</button> and we\'ll help.</p>' +
    '</div></section>';
  }

  function detailHTML() {
    var p = S.opened;
    if (!p) return '';
    var imgs = (p.images || []).slice();   /* real photos only — never pad with repeats */
    var related = S.props.filter(function (o) {
      return o.id !== p.id && (o.locationKey === p.locationKey ||
        (o.budgetBands || []).some(function (b) { return (p.budgetBands || []).indexOf(b) >= 0; }));
    }).slice(0, 3);

    return '<div class="d-hero">' +
        (imgs[0] ? '<img src="' + esc(imgs[0]) + '" alt="' + esc(altFor(p)) + '">'
                 : '<div class="ph-fallback" style="position:absolute;inset:0"><span style="font-size:120px">' + esc((p.name || '?').charAt(0)) + '</span></div>') +
        '<div class="grad"></div>' +
        '<button class="back-chip" onclick="App.detailBack()">' + I.back + ' Back to collection</button>' +
        ((p.images || []).length ? '<span class="photos-chip">' + I.photos + '&nbsp; ' + p.images.length + ' photo' + (p.images.length === 1 ? '' : 's') + '</span>' : '') +
        '<div class="inner"><div class="wrap">' +
          '<div class="eyebrow">' + esc(p.developer) + '</div>' +
          '<h1>' + esc(p.name) + '</h1>' +
          '<div class="lc">' + esc(p.location) + '</div>' +
        '</div></div>' +
      '</div>' +

      '<div class="wrap"><div class="d-stats">' +
        dStat('Configurations', p.config) + dStat('Sizes', p.sizes) +
        dStat('Status', p.status) + dStat('Possession', p.possession) +
        '<div class="d-stat hi"><div class="k">Pricing</div><div class="v">On request</div></div>' +
      '</div></div>' +

      (p.curation && p.curation.length ?
      '<section class="d-sec"><div class="wrap">' +
        '<div class="eyebrow">Why this project</div><h2>Our honest take</h2>' +
        '<div class="cur-grid">' + p.curation.map(function (c) {
          return '<div class="cur rv"><span class="dia">' + I.dia + '</span><span>' + esc(c) + '</span></div>';
        }).join('') + '</div>' +
      '</div></section>' : '') +

      (imgs.length ?
      '<section class="d-sec"><div class="wrap">' +
        '<div class="eyebrow">Gallery</div><h2>A closer look</h2>' +
        '<div class="gallery">' + imgs.map(function (src, i) {
          return '<img src="' + esc(src) + '" alt="' + esc(altFor(p, i, imgs.length)) +
            '" loading="lazy" decoding="async">';
        }).join('') + '</div>' +
      '</div></section>' : '') +

      '<section class="d-sec"><div class="wrap about-grid">' +
        '<div class="txt"><div class="eyebrow">About</div><h2>About ' + esc(p.name) + '</h2>' +
          '<p>' + esc(p.description || '') + '</p>' +
          (p.developerNote ? '<p>' + esc(p.developerNote) + '</p>' : '') +
        '</div>' +
        '<aside class="hl rv"><h3>Key highlights</h3>' +
          hlRow('Developer', p.developer) + hlRow('Location', p.location) +
          hlRow('Type', p.config) + hlRow('Status', p.status) + hlRow('Possession', p.possession) +
          '<button class="btn" onclick="App.openEnquiry()">Register interest</button>' +
          '<div class="privacy-line" style="justify-content:center">' + I.lock + ' Handled personally by your Propstar advisor.</div>' +
        '</aside>' +
      '</div></section>' +

      (p.amenities && p.amenities.length ?
      '<section class="d-sec"><div class="wrap">' +
        '<div class="eyebrow">Amenities</div><h2>Curated, not exhaustive</h2>' +
        '<div class="amen-grid">' + p.amenities.map(function (a) {
          return '<div class="amen rv"><span class="dia">' + I.dia + '</span><span>' + esc(a) + '</span></div>';
        }).join('') + '</div>' +
      '</div></section>' : '') +

      (p.connectivity && p.connectivity.length ?
      '<section class="d-sec"><div class="wrap">' +
        '<div class="eyebrow">Neighbourhood</div><h2>Getting around</h2>' +
        '<div class="conn">' + p.connectivity.map(function (c) {
          return '<span class="pill">' + esc(c) + '</span>';
        }).join('') + '</div>' +
      '</div></section>' : '') +

      (related.length ?
      '<section class="d-sec"><div class="wrap">' +
        '<div class="eyebrow">Keep exploring</div><h2>You may also like</h2>' +
        '<div class="grid2">' + related.map(function (r) { return cardHTML(r, true); }).join('') + '</div>' +
      '</div></section>' : '') +

      '<div class="d-pad-bottom"></div>';
  }

  function dStat(k, v) {
    return '<div class="d-stat"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v || '—') + '</div></div>';
  }
  function hlRow(k, v) {
    return v ? '<div class="row"><span class="k">' + esc(k) + '</span><span class="v">' + esc(v) + '</span></div>' : '';
  }

  function footerHTML() {
    /* Shown on detail pages too. Project pages are the main organic landing
       surface now, and arriving with no About link, no legal links and no
       crawl path out is a real cost. .d-pad-bottom clears the sticky bar. */
    return '<div class="in">' +
      '<div class="top"><div>' +
        '<div class="brand"><img src="/assets/propstar-mark-96.png" alt=""><span>Propstar</span></div>' +
        '<p class="tagline">India\'s trusted luxury real estate consultants. Chosen, not chased.</p>' +
      '</div>' +
      /* TODO(propstar): these four are dead placeholders — href="#" with the
         click swallowed. On a lead-generation site a WhatsApp icon that does
         nothing is worse than no icon, and the missing profile URLs are also
         why the Organization JSON-LD in scripts/prerender.js omits `sameAs`
         (inventing them would be worse). Needs real values from the owner:
         a wa.me link with the advisory number, and the three profile URLs.
         Until then they are visibly present but inert. */
      '<div class="socials">' +
        '<a href="#" aria-label="Instagram" onclick="return false">' + I.ig + '</a>' +
        '<a href="#" aria-label="Facebook" onclick="return false">' + I.fb + '</a>' +
        '<a href="#" aria-label="LinkedIn" onclick="return false">' + I.li + '</a>' +
        '<a href="#" aria-label="WhatsApp" onclick="return false">' + I.wa + '</a>' +
      '</div></div>' +
      '<div class="bottom"><div class="links">' +
        '<button onclick="App.goAbout()">About</button>' +
        '<button onclick="App.openContact()">Contact</button>' +
        '<button onclick="App.goPrivacy()">Privacy</button>' +
        '<button onclick="App.goTerms()">Terms</button>' +
      '</div><span>© 2026 Propstar Solution · By Revspot.ai · All rights reserved.</span></div>' +
    '</div>';
  }

  function stickyHTML() {
    if (S.view !== 'detail' || !S.opened) return '';
    var p = S.opened;
    return '<div class="sticky-bar"><div class="in">' +
      '<div><div class="nm">' + esc(p.name) + '</div>' +
      '<div class="sub">' + esc(p.developer) + ' · ' + esc(p.location) + '</div></div>' +
      '<button class="btn" onclick="App.openEnquiry()">Know more ' + I.arrow + '</button>' +
    '</div></div>';
  }

    /* ============ page titles ============ */
    /* Shared with scripts/prerender.js on purpose. Two copies of this rule
       means the prerendered <title> and the one the SPA sets on navigation
       drift apart — the tab visibly retitles itself after boot and the
       analytics page_title stops matching what Google indexed. */
    var TITLES = {
      home: "Propstar Solution | India's Trusted Luxury Real Estate Consultants",
      properties: 'Curated Luxury Properties in India | Propstar Solution',
      about: 'About Propstar Solution | Luxury Real Estate Advisory by Revspot',
      privacy: 'Privacy Policy | Propstar Solution',
      terms: 'Terms & Conditions | Propstar Solution'
    };

    function titleFor(view, prop) {
      if (view !== 'detail' || !prop) return TITLES[view] || TITLES.home;
      /* Drop "by <developer>" when the whole thing runs long enough that Google
         would truncate the project name itself. */
      var full = prop.name + ' by ' + prop.developer + ', ' + prop.location + ' | Propstar Solution';
      return full.length > 70
        ? prop.name + ', ' + prop.location + ' | Propstar Solution'
        : full;
    }

    return {
      esc: esc, I: I, titleFor: titleFor,
      navHTML: navHTML, footerHTML: footerHTML, stickyHTML: stickyHTML,
      wizardHTML: wizardHTML, cardHTML: cardHTML, resultsHTML: resultsHTML,
      homeHTML: homeHTML, propertiesHTML: propertiesHTML, aboutHTML: aboutHTML,
      privacyHTML: privacyHTML, termsHTML: termsHTML, detailHTML: detailHTML
    };
  };
});
