# Rewrites and redirects

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

## Why the www rule has no path

The `www` → apex source is domain-only on purpose. Paths are appended
automatically, and **a path component in a domain-based source makes Amplify
ignore the rule without raising an error.**

Also: when you add a custom domain, Amplify creates a default **apex → www**
redirect — the opposite direction from what we want. Delete it first, or the two
rules fight.

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
