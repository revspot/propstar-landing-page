# Propstar — Public Site & Content Console

A curated real-estate discovery platform ("Chosen, not chased") — explicitly **not a brokerage**.
Built per `Propstar_Build_Playbook_v1.2.pdf` (design system, copy rules, "no prices" rule) and
`Propstar Dev Handoff admin panel+main site.pdf` (architecture, data layer, matching engine).

Deployed on **AWS Amplify Hosting** at https://propstarsolution.com.

There is also a `beta` branch at https://beta.propstarsolution.com. It runs the same
code with `SITE_ORIGIN` pointed elsewhere, which makes it `noindex`, blocks crawling
and strips the GA4 tag. See "Deploying" and `customRules.md`.

## Files

| File | Role |
|---|---|
| `index.html` | The app shell: CSS, state, routing, modals, hero video, analytics |
| `propstar-views.js` | **All markup.** Pure string builders, shared by the browser and the prerender |
| `propstar-data.js` | Data layer (`window.PROPSTAR`) — content source, catalogue store, matching engine |
| `scripts/build-content.js` | Validates content, regenerates `catalogue.json` + `cms/config.yml`, then prerenders |
| `scripts/prerender.js` | Writes `dist/` — one real HTML file per route, plus sitemap and robots |
| `scripts/check-matching.js` | Self-check for the matching engine's load-bearing assumptions |
| `cms/` | Sveltia CMS — the console that publishes |
| `content/` | The content itself (see `content/README.md`) |
| `admin.html` | Legacy console. **Not deployed** — see "Two consoles" below |
| `amplify.yml`, `customHttp.yml`, `customRules.json` | Deploy config (see `customRules.md`) |

## Run locally

Two loops, because the site is now prerendered:

```bash
# 1. Verify real routes — /properties/, /project/<id>/, sitemap, meta tags.
#    This is what actually ships.
node scripts/build-content.js && npx serve dist -l 3030

# 2. Iterate on CSS or the shell quickly, home page only, no rebuild.
npx serve . -l 3030
```

Loop 2 serves the unbuilt `index.html`, so **only `/` works** — every other route is a file that
only exists in `dist/`. Use loop 1 before believing anything about a route other than home.

`dist/` is generated and gitignored. `python3 -m http.server 3030` works too, but the
scroll-scrubbed hero prefers a server with HTTP Range support (`npx serve` has it; the page
self-heals into an in-memory blob if absent). Opening `index.html` off disk does **not** work —
content is fetched over HTTP.

## How a change reaches the site

```
edit at /cms/  →  Sveltia commits to `main` via the GitHub API
               →  Amplify auto-builds
               →  node scripts/build-content.js validates, regenerates and prerenders
               →  a bad reference fails the build, so the site stays on the last good deploy
```

`scripts/build-content.js` is the single build command. It is zero-dependency ES5 CommonJS — there
is no `package.json` and nothing to install, deliberately.

## Content and routing

- **Content** lives in `content/` and is edited at `/cms/`. Full field contract in
  `content/README.md`. 40 projects across 9 cities.
- **Routing** is real URLs via the History API: `/`, `/properties/`, `/about/`, `/privacy/`,
  `/terms/`, `/project/<id>/`. Every one of those is a prerendered file with its own
  `<title>`, description, canonical, OG/Twitter tags and JSON-LD, so crawlers and social
  scrapers — which never run JavaScript — see real content. Old `#/...` links redirect
  automatically on load.
- **Trailing slashes matter.** They make directory-index resolution work identically on Amplify,
  S3 and any static server with zero rewrite rules.
- **The one rule:** no rupee figure ever appears on a property. Pricing always reads "On request".
  Budget bands are internal matching attributes only, and never rendered.
- **Lead capture:** four surfaces (quiz final step, contact, enquiry, shortlist), all routed
  through a single `sendLead()` in `index.html`. Project *content* is public; only the actions
  ask for details. See "Leads" below.
- **Matching:** location 50 / locality 25 / budget 30 (adjacent band ×0.5) / purpose 20, ranked,
  top 6, never-empty fallback. Weights in `PROPSTAR.WEIGHTS`. Guarded by
  `scripts/check-matching.js` — **the budget band order in `content/quiz.json` is load-bearing.**
- **Engagement capture (`window.Engage`):** the shortlist prompt auto-fires on 15s dwell, 30%
  scroll depth, or exit-intent — max 3 per session, 30s cooldown, never mid-quiz, never on a
  detail page (that has its own sticky CTA). Once a device has submitted anything, prompts stop.
  For demos, open with **`?demo=1`** to ignore the saved lead and session caps.

## Leads

`sendLead()` POSTs a flat JSON object to the revspot leadgen listener. Every surface goes through
it — a per-surface copy is how one of them quietly stops posting.

**This needs CORS on `api.revspot.ai` to work from the browser:**

```
Access-Control-Allow-Origin: https://propstarsolution.com         # and the beta origin
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

CORS is **per origin**, so production and beta both need allowing — list both, or reflect
any `*.propstarsolution.com`.
plus `204` on `OPTIONS`. Until those headers exist, every lead fails the preflight and lands in a
`localStorage` retry queue (`propstar_lead_queue`, capped at 20), which flushes on the next page
load. Nothing is lost, but nothing is delivered either.

Do **not** try to proxy this through an Amplify rewrite — it mangles POST. See `customRules.md`.

Payload: whatever the form captured, plus `source`, `page_url`, `submitted_at`, the project fields
on an enquiry, and the quiz answers as human-readable labels (`quiz_city`, `quiz_budget`, …).

A saved lead expires after 90 days.

## Analytics

GA4 (`G-DNDDSBZ5VS`), with `send_page_view: false` — `index.html` fires `page_view` itself from the
router so it stays in step with the per-route title. Events: `page_view`, `quiz_start`,
`quiz_complete`, `view_item`, `generate_lead`, `shortlist_prompt_shown`, `lead_delivery_failed`.

`generate_lead` fires on **submit**, not on delivery success — otherwise a broken endpoint would
look identical to "nobody is submitting anything". `lead_delivery_failed` is the delivery signal.

**No name, phone or email is ever sent to GA4.** That is a GA4 terms violation and grounds for
property termination. Consent Mode v2 defaults to denied for EU/UK/EEA regions only.

## Two consoles

`/cms/` is the one that publishes — it commits to `main` and triggers a deploy. The branch it
writes to is set in `cms/config.yml.template`, and differs on `beta`.

`admin.html` is the older console. Its edits only ever reach the current browser's `localStorage`,
and its passcode is an unsalted SHA-256 hash sitting in a publicly readable file. It is
**deliberately excluded from `dist/`**, so it is not reachable on any deployed branch. Amplify's access
control is per-branch and cannot protect a single path, so not shipping it *is* the security
control. Keep it for local JSON export if useful; never publish it.

Sign in to `/cms/` with **"Sign In Using Access Token"** and a GitHub PAT with repo scope.
"Sign In with GitHub" is shown but will not work — it needs an OAuth relay, and Sveltia's default
relay is Netlify's, which this site no longer uses. See `cms/config.yml.template`.

## Deploying

`SITE_ORIGIN` in `amplify.yml` decides which site is being built. Only
`https://propstarsolution.com` counts as production; anything else gets `noindex`,
`Disallow: /` and no analytics tag, so a new branch or a typo fails safe rather than
indexing a staging site against the real one.

`amplify.yml` and `customHttp.yml` are picked up from the repo. Rewrites are **not** —
Amplify has no file-based redirect config, so apply `customRules.json` by hand and
**delete Amplify's auto-added SPA catch-all**. `customRules.md` explains why that rule is an SEO
bug and how to assert it is gone.

### Cutting over to propstarsolution.com

App `d1zwtewdmh1sqp` in `ap-south-1`. Branch `main` is connected and building, and
`customRules.json` is applied. What is left is the domain, and one thing about it is
not obvious:

**The hosted zone for propstarsolution.com is in the same AWS account, so attaching
the domain in Amplify writes the Route 53 records itself.** There is no "attach now,
point DNS later" — attaching *is* the cutover. That is how `beta` got its ALIAS record.
Verify on `main.d1zwtewdmh1sqp.amplifyapp.com` first, because the next step is live.

```bash
aws amplify create-domain-association --app-id d1zwtewdmh1sqp \
  --domain-name propstarsolution.com \
  --sub-domain-settings 'prefix=,branchName=main' 'prefix=www,branchName=main'
```

Then wait for `domainStatus: AVAILABLE` (ACM issuance, ~15–30 min):

```bash
aws amplify get-domain-association --app-id d1zwtewdmh1sqp \
  --domain-name propstarsolution.com --query 'domainAssociation.domainStatus'
```

- The old Framer records are `propstarsolution.com A 31.43.160.6` and
  `www CNAME sites.framer.app`. **Note them down before starting** — restoring those two
  is the rollback, and TTL is 300s in both directions.
- `MX`/`SPF`/`DKIM` for Zoho sit on the apex as different record types, so Amplify's
  `A`-alias does not disturb them. Email keeps working. Re-check `dig MX` afterwards anyway.
- Amplify may add its own **apex → www** redirect, the opposite of ours. Check
  Rewrites and redirects afterwards and remove anything you did not put there.
- Leave `beta` alone. Its association is separate and unaffected.

After it is live, the whole checklist in `customRules.md` is the acceptance test — the
404 assertions and the legacy Framer 301s. Then submit
`https://propstarsolution.com/sitemap.xml` in Search Console.

Watch the running cost: the hero video ladder is roughly 23–30 MB per desktop visit, about
$4.50 per 1,000 visits in Amplify egress. `customHttp.yml` pins long cache lifetimes on the
`.mp4` files, which is the single biggest lever. Set a CloudWatch billing alarm.

## Known gaps

1. The four footer social links are dead placeholders (`href="#"`). Needs a real `wa.me` link and
   three profile URLs — this is also why the `Organization` JSON-LD omits `sameAs`.
2. Lead delivery is blocked until CORS lands on `api.revspot.ai` (above).
3. Photo uploads through the CMS go to `assets/projects` with un-hashed filenames, so replacing an
   image reuses its name — hence the deliberately shorter cache lifetime on that directory.
4. Adding a city also needs a cover image in `cityCovers` (`propstar-views.js`) — that map is code,
   not content, so a city added in the CMS renders without a cover until someone edits it.
