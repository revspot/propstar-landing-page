# Rewrites and redirects

> **This is the `main` branch** — rules for production, `propstarsolution.com`,
> including the `www` → apex 301. The `beta` branch deliberately omits that one rule
> (`www.beta.…` is not a thing anyone types) and is otherwise identical.
>
> **Rules are app-level, not per-branch.** Amplify has one "Rewrites and redirects"
> list for the whole app, shared by every branch — the two branch versions of this
> file do not each get applied. They coexist only because the `www` rule is
> *domain*-scoped, so it never fires for a beta host. A **path**-based rule added for
> one branch would hit every branch. Applying this file is a production action.
>
> How non-production branches differ is documented at the end.

`customRules.json` holds the Amplify rewrite/redirect rules. **It is not read at
build time.** Amplify has no file-based redirect config — `aws-amplify/amplify-hosting`
issue #18, "Saving rewrites and redirects to configuration file?", has been open
since July 2019. The file exists so the rules are reviewable in git.

Apply it deliberately:

```bash
aws amplify update-app --app-id <APP_ID> --custom-rules file://customRules.json
```

or paste the array into **Hosting → Rewrites and redirects → Open text editor**.
It is kept free of comments because AWS's `CustomRule` shape accepts only
`source`, `target`, `status` and `condition` — any extra key fails validation.

**`condition` is omitted, not `null`.** The CLI validates it as a string and rejects
the whole call on `"condition": null`, one error per rule and nothing applied:

```
Invalid type for parameter customRules[0].condition, value: None,
type: <class 'NoneType'>, valid types: <class 'str'>
```

The key is optional, so leaving it out is the fix. Do not "restore" it for symmetry —
that silently breaks the one command in this file.

Rules apply **top-down**; the order in the file is the order that matters. The legacy
`301`s sit above the no-trailing-slash `200` rewrites, and there is deliberately no
catch-all at the end — see below.

## The catch-all: there must not be one

**Amplify auto-adds `/<*> → /index.html` when it detects a single-page app.** That
rule is an SEO bug in disguise: every typo, every stale link and every crawler probe
resolves to the home shell — soft 404s and duplicate content across the whole domain,
with a green build and nothing anywhere to tell you.

Deleting it is not enough on its own, because the obvious replacement does not work.
**A custom rule with status `404` is still a redirect.** Amplify's `404` status means
"redirect to the target when the source is missing" — it does not emit a 404. Measured
on this app with `/<*> → /index.html` at status `404`:

```
GET /does-not-exist/   ->  302, location: /index.html
GET /index.html        ->  200
```

A crawler sees a 302 into a 200 home page. That is the same soft 404 the auto-added
rule causes, arrived at by a different route, which is why this file carries **no
catch-all of any kind**. With no rule matching, Amplify serves its own genuine 404 for
a missing object, which is exactly the wanted behaviour:

```bash
for p in /does-not-exist/ /project/nope/ /admin.html /cms/config.yml.template; do
  curl -o /dev/null -w "$p -> %{http_code}\n" -L https://propstarsolution.com$p
done
# all four must print 404
```

The cost of having none is that 404s are Amplify's unbranded page rather than ours. A
branded one would need `/<*> → /404.html` — and every status Amplify offers for that
either redirects or answers `200`, so it would reintroduce the bug. A real status code
is worth more than a styled page: it is what makes Google drop a dead URL instead of
indexing a duplicate home page under it.

Re-check after any framework re-detection — Amplify puts its rule back.

## Why the www rule has no path

The `www` → apex source is domain-only on purpose. Paths are appended
automatically, and **a path component in a domain-based source makes Amplify ignore
the rule without raising an error.**

Also: when you add a custom domain, Amplify creates a default **apex → www**
redirect — the opposite direction from what we want. Delete it first, or the two
rules fight.

The `beta` branch carries no www rule at all; that is intentional, not an omission
to be "fixed" during a merge.

## The legacy Framer 301s

`propstarsolution.com` ran on Framer before this site. Its sitemap advertised 14 URLs
and **none of them exist here** except `/privacy` and `/terms` — different slugs, a
different information architecture. Left alone they all 404 on cutover day, which
throws away the ranking those URLs already hold and dead-ends anyone following a link
from Google, a WhatsApp forward or an old ad.

So each one gets an explicit `301`:

| Framer URL | goes to | why |
|---|---|---|
| `/sobha-inizio-parel-mumbai` | `/project/sobha-inizio/` | the one project with a real successor |
| `/listing` | `/properties/` | same intent, new name |
| `/capitol-residences`, `/prestige-spring-heights-…`, `/prestige-vaishnaoi-…`, `/tvs-emerald-cascadia-…`, `/assetz-mizumi-…`, `/phoenix-kessaku-…` | `/properties/` | not in the 40-project catalogue |
| `/godrej/worli` | `/properties/` | not in the catalogue |
| `/thankyou-capitol`, `/godrej/worli/thank-you` | `/` | campaign thank-you pages, nothing to preserve |

They go to `/properties/` rather than `/` because a visitor who clicked a project link
wants projects. **Not** a wildcard — a blanket `/<*> → /properties/ 301` would turn
every typo into a redirect and destroy the real `404` above, which is the thing
Google uses to drop dead URLs from the index.

Re-check them after cutover:

```bash
for p in /listing /sobha-inizio-parel-mumbai /capitol-residences /godrej/worli; do
  curl -o /dev/null -w "$p -> %{http_code} %{redirect_url}\n" https://propstarsolution.com$p
done
```

Delete a row once Search Console shows no impressions for it — until then it is
carrying traffic.

## Why the five `200` rules exist

They only catch the **no-trailing-slash** forms, so a typed or legacy link does
not 404. Every real route is a directory index (`dist/properties/index.html`), so
`/properties/` and `/project/<id>/` already resolve with **zero rules** — which is
exactly why the router uses trailing slashes. Nothing is needed for `/`,
`/assets/*`, `/content/*`, `/cms/`, `/sitemap.xml` or `/robots.txt`.

## Deliberately absent: an `/api/lead` proxy

A 200-rewrite from `/api/lead` to the revspot lead endpoint would have avoided
CORS, and it is **not viable**. Amplify's reverse proxy is unreliable for a JSON
POST:

- **#527** — same use case; POSTs arrive at the origin as GETs. An AWS engineer
  labelled it a bug.
- **#3152** — POST returns `405` with `allow: HEAD, DELETE, GET, PUT`.
- **#925** — even for GET, a backend 404 comes back as a `301` with a truncated
  path. Reproduced in three regions.

The docs never mention HTTP methods or request bodies for rewrites at all.

Add CORS on `api.revspot.ai` and call it directly from the browser instead:

```
Access-Control-Allow-Origin: https://propstarsolution.com
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```
with a `204` on `OPTIONS`. `api.revspot.ai` is already in the CSP's `connect-src`.

---

## Non-production branches

One environment variable drives all of it — `SITE_ORIGIN` in `amplify.yml`:

```yaml
env:
  variables:
    SITE_ORIGIN: https://beta.propstarsolution.com
```

`scripts/prerender.js` treats **only** `https://propstarsolution.com` as production.
Anything else — beta, a PR preview, a typo — gets:

| | production | beta |
|---|---|---|
| `<meta name="robots">` | `index,follow,max-image-preview:large` | `noindex,nofollow` |
| `robots.txt` | `Allow: /` + sitemap | `Disallow: /`, no sitemap line |
| GA4 tag | present | **removed from the HTML** |
| canonical / `og:url` | `propstarsolution.com` | `beta.propstarsolution.com` |
| lead payload `environment` | `production` | `beta` |

The default is deliberately production-safe in the sense that matters: a new branch
or a mistyped origin is treated as *non*-production, so it gets `noindex` and no
analytics. The dangerous failure would be the reverse — a staging site quietly
indexing itself against the real one and splitting its ranking signals.

### Two things to do in the Amplify console for beta

1. **Turn on Access control** (App settings → Access control → Manage access →
   password-protect the `beta` branch). Amplify's basic auth is per-branch, which is
   exactly the shape this needs — it is the one case where that limitation is a
   feature. Belt and braces with `noindex`.
2. **Do not** connect `beta` to the production GA4 property or submit its sitemap to
   Search Console. The build already prevents the first; the second is on you.

### Leads from beta

Beta posts to the same endpoint as production, so the whole path is genuinely
exercised — but every payload carries `"environment": "beta"`. **Filter on that field
in the CRM**, or beta test submissions will look like real leads.

CORS applies per origin, so `api.revspot.ai` needs
`https://beta.propstarsolution.com` allowed too — either list both origins or
reflect any `*.propstarsolution.com`. Until then beta leads queue in `localStorage`
and flush when it works, same as production.
