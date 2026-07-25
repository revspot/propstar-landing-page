# Rewrites and redirects

> **This is the `beta` branch.** The rules here are for
> `beta.propstarsolution.com`, which is a single subdomain with no `www` variant —
> so the `www` → apex 301 that the `main` branch carries is deliberately **absent**
> here. Everything else is identical. Rules are applied per Amplify branch, so the
> two never interfere.
>
> Beta is also `noindex` + `Disallow: /` and ships **no GA4 tag** — all three derive
> from `SITE_ORIGIN` in `amplify.yml`. See "Beta specifics" at the end.

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

Rules apply **top-down**; the order in the file is the order that matters, and
the `404` must stay last.

## The one rule you must delete

**Amplify auto-adds `/<*> → /index.html` with status `200` when it detects a
single-page app.** That rule is an SEO bug in disguise: every typo, every stale
link and every crawler probe returns **200 with the home shell** — soft 404s and
duplicate content across the whole domain, with a green build and no error
anywhere to tell you.

Ours is a real `404`, not `404-200`. Delete Amplify's version if it appears, and
re-check after any framework re-detection. Assert it:

```bash
curl -o /dev/null -w '%{http_code}\n' https://propstarsolution.com/project/does-not-exist/
# must print 404
```

## No www rule on beta

`beta.propstarsolution.com` is one subdomain; `www.beta.…` is not a thing anyone
types. The `main` branch carries a `www` → apex 301 and this branch does not — that
is intentional, not an omission to be "fixed" during a merge.

When adding `beta.propstarsolution.com` in Amplify, add it as a **subdomain of the
existing `propstarsolution.com` domain** if that domain is already attached to the
app; otherwise add it as its own domain. Either way Amplify may still create a
default redirect pair — check **Rewrites and redirects** afterwards and remove
anything you did not put there.

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

## Beta specifics

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
