#!/usr/bin/env node
/* Builds the runtime content from the CMS-editable source files.

   content/projects/<id>.json  (one per project, edited in the CMS)
   content/quiz.json           (cities, budgets, purposes)
        |
        v
   content/catalogue.json      (what the site fetches)
   cms/config.yml              (CMS field options, derived from quiz.json)

   It also validates the cross-references between projects and the quiz.
   Sveltia has no true reference fields, so a project can point at a city
   or budget key that no longer exists; the site would keep working while
   quietly never matching that project. Here that fails the build instead.

   Run: node scripts/build-content.js
*/
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var PROJECTS_DIR = path.join(ROOT, 'content', 'projects');
var QUIZ_FILE = path.join(ROOT, 'content', 'quiz.json');
var CATALOGUE_FILE = path.join(ROOT, 'content', 'catalogue.json');
var CMS_CONFIG = path.join(ROOT, 'cms', 'config.yml');

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error('Could not read ' + path.relative(ROOT, file) + ': ' + e.message);
  }
}

/* ---------- load ---------- */

var quiz = readJSON(QUIZ_FILE);

var projects = fs.readdirSync(PROJECTS_DIR)
  .filter(function (f) { return f.endsWith('.json'); })
  .map(function (f) {
    var p = readJSON(path.join(PROJECTS_DIR, f));
    p._file = 'content/projects/' + f;
    return p;
  });

if (!projects.length) {
  console.error('No project files found in content/projects/');
  process.exit(1);
}

/* ---------- valid keys from the quiz ---------- */

var cityKeys = quiz.locations.map(function (l) { return l.key; });
var localityKeys = quiz.locations.reduce(function (acc, l) {
  return acc.concat((l.localities || []).map(function (x) { return x.key; }));
}, []);
var budgetKeys = quiz.budgets.map(function (b) { return b.key; });
var purposeKeys = quiz.purposes.map(function (p) { return p.key; });

/* ---------- validate ---------- */

var errors = [];
var seenIds = Object.create(null);

function checkOne(p, field, value, valid, whatItIs) {
  if (value === undefined || value === null || value === '') return;
  if (valid.indexOf(value) < 0) {
    errors.push(p._file + ': ' + field + ' "' + value + '" is not a known ' + whatItIs +
      '. Valid: ' + valid.join(', '));
  }
}

function checkMany(p, field, values, valid, whatItIs) {
  (values || []).forEach(function (v) { checkOne(p, field, v, valid, whatItIs); });
}

projects.forEach(function (p) {
  if (!p.id) { errors.push(p._file + ': missing "id"'); return; }
  if (seenIds[p.id]) errors.push(p._file + ': duplicate id "' + p.id + '" (also in ' + seenIds[p.id] + ')');
  seenIds[p.id] = p._file;

  var expected = path.basename(p._file, '.json');
  if (p.id !== expected) {
    errors.push(p._file + ': id "' + p.id + '" does not match the filename. ' +
      'The id is the shareable URL (#/project/' + p.id + '), so the two must agree.');
  }

  ['name', 'developer', 'location'].forEach(function (f) {
    if (!p[f]) errors.push(p._file + ': missing "' + f + '"');
  });

  if (!Array.isArray(p.images) || !p.images.length) {
    errors.push(p._file + ': needs at least one image (images[0] is the card and page hero)');
  } else {
    p.images.forEach(function (src) {
      var rel = String(src).replace(/^\//, '');
      if (!/^https?:/.test(rel) && !fs.existsSync(path.join(ROOT, rel))) {
        errors.push(p._file + ': image not found on disk: ' + src);
      }
    });
  }

  checkOne(p, 'locationKey', p.locationKey, cityKeys, 'city key');
  checkOne(p, 'localityKey', p.localityKey, localityKeys, 'locality key');
  checkMany(p, 'nearbyKeys', p.nearbyKeys, cityKeys, 'city key');
  checkMany(p, 'budgetBands', p.budgetBands, budgetKeys, 'budget key');
  checkMany(p, 'purposes', p.purposes, purposeKeys, 'purpose key');
});

if (errors.length) {
  console.error('\nContent validation failed (' + errors.length + ' problem' +
    (errors.length === 1 ? '' : 's') + '):\n');
  errors.forEach(function (e) { console.error('  - ' + e); });
  console.error('\nNothing was written. Fix the above and run again.\n');
  process.exit(1);
}

/* ---------- write the catalogue ---------- */

projects.sort(function (a, b) {
  var d = (a.order == null ? 1e9 : a.order) - (b.order == null ? 1e9 : b.order);
  return d !== 0 ? d : String(a.name).localeCompare(String(b.name));
});

/* The CMS writes image paths relative (public_folder: assets/projects), which
   breaks at a nested URL like /project/<id>/. Root-absolutise here rather than
   in the 40 source files, so Sveltia's media picker keeps working and editors
   never have to think about it. */
function absImage(src) {
  var s = String(src);
  return /^https?:/.test(s) ? s : '/' + s.replace(/^\/+/, '');
}

var catalogue = projects.map(function (p) {
  var out = {};
  Object.keys(p).forEach(function (k) {
    if (k !== '_file' && k !== 'order') out[k] = p[k];   // build-time only
  });
  if (Array.isArray(out.images)) out.images = out.images.map(absImage);
  return out;
});

fs.writeFileSync(CATALOGUE_FILE, JSON.stringify(catalogue, null, 1) + '\n');

/* ---------- regenerate the CMS field options ---------- */
/* Keeping these in step with quiz.json by hand is exactly how references rot,
   so the dropdowns are generated from the quiz every build. */

function yamlOptions(list, indent) {
  var pad = new Array(indent + 1).join(' ');
  return list.map(function (o) {
    return pad + '- { label: ' + JSON.stringify(o.label) + ', value: ' + JSON.stringify(o.value) + ' }';
  }).join('\n');
}

var cityOpts = quiz.locations.map(function (l) { return { label: l.label, value: l.key }; });
var localityOpts = quiz.locations.reduce(function (acc, l) {
  return acc.concat((l.localities || []).map(function (x) {
    return { label: l.label + ' — ' + x.label, value: x.key };
  }));
}, []);
var budgetOpts = quiz.budgets.map(function (b) { return { label: b.label, value: b.key }; });
var purposeOpts = quiz.purposes.map(function (p) { return { label: p.label, value: p.key }; });

var template = fs.readFileSync(CMS_CONFIG + '.template', 'utf8');

/* swap the template's own explanation for a warning aimed at whoever opens
   the generated file, so nobody edits the copy that gets overwritten */
var GENERATED_HEADER = [
  '# GENERATED FILE — do not edit.',
  '# Written by scripts/build-content.js from cms/config.yml.template.',
  '# Any change here is overwritten on the next build. Edit the template.',
  '', ''
].join('\n');

var config = (GENERATED_HEADER + template.replace(/^#[\s\S]*?(?=^backend:)/m, ''))
  .replace('#{CITY_OPTIONS}', yamlOptions(cityOpts, 12))
  .replace('#{LOCALITY_OPTIONS}', yamlOptions(localityOpts, 12))
  .replace('#{NEARBY_OPTIONS}', yamlOptions(cityOpts, 12))
  .replace('#{BUDGET_OPTIONS}', yamlOptions(budgetOpts, 12))
  .replace('#{PURPOSE_OPTIONS}', yamlOptions(purposeOpts, 12));

fs.writeFileSync(CMS_CONFIG, config);

console.log('Content OK: ' + catalogue.length + ' projects, ' +
  catalogue.reduce(function (n, p) { return n + (p.images || []).length; }, 0) + ' images.');
console.log('  wrote content/catalogue.json');
console.log('  wrote cms/config.yml (options from quiz.json)');

/* Prerender last, once the catalogue it renders from is on disk and validated.
   It throws on any problem, so a broken shell marker or a relative path fails
   the deploy the same way a dangling content reference does. */
require('./prerender.js')(catalogue, quiz);
