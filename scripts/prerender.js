#!/usr/bin/env node
/* Prerenders the site into dist/.

   Why this exists: index.html ships a <body> with no text in it. Every view is
   a JavaScript string injected into #view, and routing used to be hash-based,
   so all 40 project pages lived at #/project/<id>. To a search crawler that is
   one thin page, and to a social scraper — which never runs JavaScript at all —
   every shared link looked identical. This writes a real HTML file per route
   with the content already in the bytes.

   It renders through propstar-views.js, the same builders the browser uses, so
   what Google indexes cannot drift from what a visitor sees. The SPA then boots
   on top and adopts the DOM rather than re-rendering it (see `adopt` in
   index.html) — which works because every handler is an inline on*= attribute,
   so the prerendered markup is interactive the moment the script parses.

   Called at the end of scripts/build-content.js so `node scripts/build-content.js`
   stays the one build command and inherits its hard-fail behaviour.
*/
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var DIST = path.join(ROOT, 'dist');
var ORIGIN = 'https://propstarsolution.com';

/* Exactly what the public site is made of. Everything absent here is
   unreachable on the web, which is the point — it is how admin.html,
   hero-scroll-demo.html, scripts/, content/projects/ and the READMEs stay
   private. Amplify's artifacts.files globs are positive-match only, so an
   explicit copy list is the only reliable way to express an exclusion.

   admin.html is deliberately NOT here. Its passcode is an unsalted SHA-256 in
   a public file, and Amplify's access control is per-branch, so it cannot be
   protected by a path rule. /cms/ supersedes it and is the surface that
   actually publishes. */
var COPY = [
  'assets',
  'cms',
  'propstar-data.js',
  'propstar-views.js',
  'content/catalogue.json',
  'content/quiz.json'
];

/* ---------- small helpers ---------- */

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/* Every substitution goes through here. Two reasons, both of which are silent
   corruption rather than a crash if you skip them:

   1. A bare string replacement interprets $&, $1 and $` in the REPLACEMENT.
      Project descriptions and amenity names are free text and do contain $.
      Passing a function makes the replacement literal.
   2. If a future CSS tweak reformats one of these markers, the substitution
      would quietly no-op and the page would ship empty with a green build. */
function sub(html, re, value, what) {
  if (!re.test(html)) {
    throw new Error('prerender: could not find ' + what + ' in index.html. ' +
      'The shell markers must stay intact — see scripts/prerender.js.');
  }
  return html.replace(re, function () { return value; });
}

/* JSON-LD sits inside <script>, so a '<' anywhere in the data would end the
   element early and dump the rest of the graph into the page as text. */
function jsonld(obj) {
  return '<script type="application/ld+json">' +
    JSON.stringify(obj).replace(/</g, '\\u003c') + '</script>';
}

/* Truncate on a word boundary. Meta descriptions get cut at roughly 155
   characters in results, and a sentence severed mid-word reads as broken. */
function clamp(s, n) {
  var t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  return t.slice(0, t.lastIndexOf(' ', n - 1)).replace(/[,;:.]$/, '') + '…';
}

function abs(u) {
  if (!u) return '';
  return /^https?:/.test(u) ? u : ORIGIN + '/' + String(u).replace(/^\/+/, '');
}

/* ---------- head block ---------- */

function headFor(page) {
  var img = abs(page.image || '/assets/hero-poster.jpg');
  var url = ORIGIN + page.path;
  var t = [
    '<title>' + esc(page.title) + '</title>',
    '<meta name="description" content="' + esc(page.desc) + '">',
    '<link rel="canonical" href="' + url + '">',
    '<meta name="robots" content="index,follow,max-image-preview:large">',
    '<meta property="og:type" content="' + (page.view === 'detail' ? 'article' : 'website') + '">',
    '<meta property="og:site_name" content="Propstar Solution">',
    '<meta property="og:locale" content="en_IN">',
    '<meta property="og:url" content="' + url + '">',
    '<meta property="og:title" content="' + esc(page.ogTitle || page.title) + '">',
    '<meta property="og:description" content="' + esc(page.desc) + '">',
    '<meta property="og:image" content="' + img + '">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="' + esc(page.ogTitle || page.title) + '">',
    '<meta name="twitter:description" content="' + esc(page.desc) + '">',
    '<meta name="twitter:image" content="' + img + '">'
  ];
  if (page.imageAlt) {
    t.push('<meta property="og:image:alt" content="' + esc(page.imageAlt) + '">');
  }
  /* The detail hero is the LCP element on the pages search traffic lands on. */
  if (page.view === 'detail' && page.image) {
    t.push('<link rel="preload" as="image" href="' + page.image + '" fetchpriority="high">');
  }
  (page.jsonld || []).forEach(function (g) { t.push(jsonld(g)); });
  return t.join('\n');
}

/* ---------- structured data ---------- */
/* Deliberately NOT RealEstateAgent: Propstar is explicitly not a brokerage.
   Deliberately NOT RealEstateListing: it is brokerage-flavoured and Google's
   treatment of it expects offers/price. ApartmentComplex is a Residence
   subtype describing a multi-unit development and carries no price obligation,
   so the site's "no prices, ever" rule holds in the structured data too. */

function organization() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORIGIN + '/#organization',
    name: 'Propstar Solution',
    url: ORIGIN + '/',
    logo: ORIGIN + '/assets/propstar-mark.png',
    description: "India's trusted luxury real estate consultants. Curated, not listed.",
    parentOrganization: { '@type': 'Organization', name: 'Revspot' }
    /* No sameAs: the footer's four social links are href="#" placeholders, and
       inventing profile URLs would be worse than omitting the property. */
  };
}

function website() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': ORIGIN + '/#website',
    url: ORIGIN + '/',
    name: 'Propstar Solution',
    publisher: { '@id': ORIGIN + '/#organization' }
    /* No SearchAction: there is no site search to point it at. */
  };
}

function bedrooms(config) {
  /* "3 & 4 BHK" -> 3..4. Omit the property entirely when nothing parses —
     a guessed bedroom count is worse than an absent one. */
  var nums = String(config || '').match(/\d+/g);
  if (!nums || !nums.length) return null;
  var ns = nums.map(Number).filter(function (n) { return n > 0 && n < 20; });
  if (!ns.length) return null;
  var min = Math.min.apply(null, ns), max = Math.max.apply(null, ns);
  return min === max
    ? { '@type': 'QuantitativeValue', value: min }
    : { '@type': 'QuantitativeValue', minValue: min, maxValue: max };
}

function projectGraph(p, cityLabel) {
  var g = {
    '@context': 'https://schema.org',
    '@type': 'ApartmentComplex',
    '@id': ORIGIN + '/project/' + p.id + '/#project',
    name: p.name,
    url: ORIGIN + '/project/' + p.id + '/',
    description: clamp(p.description, 500),
    image: (p.images || []).map(abs),
    address: {
      '@type': 'PostalAddress',
      addressLocality: p.location,
      addressCountry: 'IN'
    }
  };
  if (cityLabel) g.address.addressRegion = cityLabel;
  var beds = bedrooms(p.config);
  if (beds) g.numberOfBedrooms = beds;
  if ((p.amenities || []).length) {
    g.amenityFeature = p.amenities.map(function (a) {
      return { '@type': 'LocationFeatureSpecification', name: a, value: true };
    });
  }
  return g;
}

function breadcrumbs(p) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: ORIGIN + '/' },
      { '@type': 'ListItem', position: 2, name: 'Properties', item: ORIGIN + '/properties/' },
      { '@type': 'ListItem', position: 3, name: p.name }
    ]
  };
}

/* ---------- route table ---------- */

function routes(catalogue, quiz, V) {
  var cityLabels = (quiz.locations || []).map(function (l) { return l.label; });
  var cityByKey = {};
  (quiz.locations || []).forEach(function (l) { cityByKey[l.key] = l.label; });

  var list = [
    {
      view: 'home', path: '/', out: 'index.html',
      title: V.titleFor('home'),
      ogTitle: 'Propstar Solution | Chosen, not chased.',
      desc: 'Propstar Solution curates handpicked luxury projects from 40+ of India\'s most reputable developers. See your shortlist and get 1-on-1 guidance from a luxury consultant.',
      image: '/assets/hero-poster.jpg',
      jsonld: [organization(), website()]
    },
    {
      view: 'properties', path: '/properties/', out: 'properties/index.html',
      title: V.titleFor('properties'),
      /* Built from live content so it cannot go stale as the catalogue grows. */
      desc: clamp('Browse ' + catalogue.length + ' handpicked luxury residential projects across ' +
        cityLabels.join(', ') + '. No prices on display, no pressure — just an expert on your side.', 158),
      image: (catalogue[0] && catalogue[0].images && catalogue[0].images[0]) || '/assets/hero-poster.jpg',
      /* pcount is handed to the SPA so all 40 cards are crawlable from one page
         and the adopted DOM matches what render() would produce. */
      pcount: catalogue.length,
      jsonld: [{
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        '@id': ORIGIN + '/properties/#page',
        name: 'Curated Luxury Properties',
        url: ORIGIN + '/properties/',
        isPartOf: { '@id': ORIGIN + '/#website' },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: catalogue.length,
          itemListElement: catalogue.map(function (p, i) {
            return {
              '@type': 'ListItem', position: i + 1, name: p.name,
              url: ORIGIN + '/project/' + p.id + '/'
            };
          })
        }
      }]
    },
    {
      view: 'about', path: '/about/', out: 'about/index.html',
      title: V.titleFor('about'),
      desc: 'Propstar is a curated luxury real estate advisory, not a listings portal and not a brokerage. Expert eyes on every project, an advisor on your side of the table.',
      image: '/assets/hero-poster.jpg',
      jsonld: [{
        '@context': 'https://schema.org', '@type': 'AboutPage',
        '@id': ORIGIN + '/about/#page', url: ORIGIN + '/about/',
        name: 'About Propstar Solution',
        isPartOf: { '@id': ORIGIN + '/#website' },
        about: { '@id': ORIGIN + '/#organization' }
      }, organization()]
    },
    {
      view: 'privacy', path: '/privacy/', out: 'privacy/index.html',
      title: V.titleFor('privacy'),
      desc: 'How Propstar Solution collects, uses and protects your information, and the choices you have over it.',
      image: '/assets/hero-poster.jpg'
    },
    {
      view: 'terms', path: '/terms/', out: 'terms/index.html',
      title: V.titleFor('terms'),
      desc: 'The terms that govern your use of the Propstar Solution website and advisory services.',
      image: '/assets/hero-poster.jpg'
    }
  ];

  catalogue.forEach(function (p) {
    var bits = [p.config, p.sizes].filter(Boolean).join(', ');
    var status = [p.status, p.possession && ('possession ' + p.possession)].filter(Boolean).join(', ');
    var desc = clamp([
      bits ? bits + ' in ' + p.location + '.' : p.location + '.',
      status ? status + '.' : '',
      (p.curation && p.curation[0]) || p.description || ''
    ].filter(Boolean).join(' '), 158);

    list.push({
      view: 'detail', path: '/project/' + p.id + '/',
      out: 'project/' + p.id + '/index.html',
      prop: p, title: V.titleFor('detail', p),
      ogTitle: p.name + ' — ' + p.developer,
      desc: desc,
      image: (p.images && p.images[0]) || '/assets/hero-poster.jpg',
      imageAlt: p.photoDescription || (p.name + ', ' + p.location),
      jsonld: [projectGraph(p, cityByKey[p.locationKey]), breadcrumbs(p)]
    });
  });

  return list;
}

/* ---------- shell injection ---------- */

/* .rv starts at opacity:0 and only gains .in when the IntersectionObserver
   sees it. Prerendered content that ships at opacity 0 is in the DOM — so a
   naive `curl | grep '<h1>'` passes — while being invisible to anything that
   does not run our JavaScript, and blank for anyone whose JS is slow. Ship it
   settled. observeReveals() selects '.rv:not(.in)', so hydration skips these
   and client-side navigation still animates normally. */
function settleReveals(html) {
  return html.replace(/class="((?:[^"]*\s)?)rv((?:\s[^"]*)?)"/g, 'class="$1rv in$2"');
}

function buildPage(shell, page, V, S) {
  S.view = page.view;
  S.opened = page.prop || null;
  S.pcount = page.pcount || 6;

  var view = page.view === 'home' ? V.homeHTML()
    : page.view === 'properties' ? V.propertiesHTML()
    : page.view === 'about' ? V.aboutHTML()
    : page.view === 'privacy' ? V.privacyHTML()
    : page.view === 'terms' ? V.termsHTML()
    : V.detailHTML();

  var html = shell;

  html = sub(html, /<!-- ssg:head -->[\s\S]*?<!-- \/ssg:head -->/,
    '<!-- ssg:head -->\n' + headFor(page) + '\n<!-- /ssg:head -->', 'the ssg:head markers');

  html = sub(html, /<!-- ssg:route -->/,
    '<script>window.__PS_ROUTE__=' + JSON.stringify({
      view: page.view,
      id: page.prop ? page.prop.id : null,
      pcount: page.pcount || null
    }).replace(/</g, '\\u003c') + ';</script>', 'the ssg:route marker');

  /* No .view-in wrapper on a prerendered page: it is a 600ms opacity 0->1
     entrance, and delaying paint for content already in the bytes is the
     opposite of what this whole exercise is for. */
  html = sub(html, /<main id="view">[\s\S]*?<\/main>/,
    '<main id="view"><div>' + settleReveals(view) + '</div></main>', '<main id="view">');

  html = sub(html, /<nav class="nav" id="nav">[\s\S]*?<\/nav>/,
    '<nav class="nav" id="nav">' + V.navHTML() + '</nav>', '<nav id="nav">');

  html = sub(html, /<footer id="footer">[\s\S]*?<\/footer>/,
    '<footer id="footer">' + settleReveals(V.footerHTML()) + '</footer>', '<footer id="footer">');

  html = sub(html, /<div id="sticky-root"><\/div>/,
    '<div id="sticky-root">' + V.stickyHTML() + '</div>', '#sticky-root');

  /* Match what render() sets on first paint, so there is no colour flash or
     hero fade on a prerendered page. */
  if (page.view === 'properties') {
    html = sub(html, /<body>/, '<body style="background:#F6F8FB">', '<body>');
  }
  if (page.view !== 'home') {
    html = sub(html, /<div id="bg">/, '<div id="bg" style="opacity:0">', '#bg');
  }

  return html;
}

/* ---------- sitemap / robots ---------- */

function sitemap(pages) {
  /* No <lastmod>: the only timestamp available is file mtime, which in a fresh
     CI clone is checkout time — "everything changed today", every deploy. Google
     discounts an obviously bogus lastmod and it can count against you.
     <changefreq> and <priority> are ignored outright. */
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    pages.map(function (p) {
      return '  <url><loc>' + ORIGIN + p.path + '</loc></url>';
    }).join('\n') + '\n</urlset>\n';
}

function robots() {
  /* No Disallow for /content/ or /assets/: Google's renderer honours robots.txt
     for subresources, so blocking catalogue.json would make every page render
     as the contentError panel inside Googlebot. And no mention of admin.html —
     robots.txt is public, so listing it would advertise the URL. It is simply
     not deployed. */
  return 'User-agent: *\nAllow: /\n\nSitemap: ' + ORIGIN + '/sitemap.xml\n';
}

/* ---------- fs ---------- */

function write(rel, body) {
  var full = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
}

function copyInto(rel) {
  var from = path.join(ROOT, rel);
  if (!fs.existsSync(from)) throw new Error('prerender: cannot copy missing ' + rel);
  fs.cpSync(from, path.join(DIST, rel), { recursive: true });
}

/* ---------- entry ---------- */

module.exports = function prerender(catalogue, quiz) {
  global.window = global.window || {};
  require('../propstar-data.js');
  var P = global.window.PROPSTAR;
  P.setContent({ projects: catalogue, quiz: quiz });

  /* index.html's initial state, matched field for field, so the markup we emit
     is what render() would have produced on first paint. */
  var S = {
    view: 'home', step: 1, complete: false, pf: '', pcount: 6,
    modal: null, opened: null, openedFrom: 'properties', lead: null,
    answers: { location: null, locality: null, budget: null, purpose: null },
    props: catalogue, toastTimer: null
  };
  var V = require('../propstar-views.js')({ P: P, S: S });

  var shell = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  var pages = routes(catalogue, quiz, V);

  fs.rmSync(DIST, { recursive: true, force: true });

  pages.forEach(function (page) {
    var html = buildPage(shell, page, V, S);

    /* A relative src/href would resolve against /project/<id>/ and 404. Fail
       the build rather than ship a page with a broken image or, worse, a broken
       catalogue.json fetch that turns the whole page into contentError. */
    var loose = html.match(/(?:src|href|poster)="(?!https?:|\/\/|\/|#|data:|mailto:|tel:)[^"]*"/g);
    if (loose) {
      throw new Error('prerender: ' + page.path + ' has relative path(s) that break at a ' +
        'nested URL: ' + loose.slice(0, 5).join(', '));
    }
    write(page.out, html);
  });

  write('sitemap.xml', sitemap(pages));
  write('robots.txt', robots());
  COPY.forEach(copyInto);

  /* cms/config.yml.template is build-time input; the generated config.yml is
     what the CMS reads. */
  fs.rmSync(path.join(DIST, 'cms', 'config.yml.template'), { force: true });

  console.log('  prerendered ' + pages.length + ' pages into dist/ ' +
    '(' + catalogue.length + ' projects + ' + (pages.length - catalogue.length) + ' routes)');
  console.log('  wrote dist/sitemap.xml, dist/robots.txt');
};
