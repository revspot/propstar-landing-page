# Content

The site's content lives here, separate from its code.

| Path | Holds | Edited by |
|---|---|---|
| `projects/<id>.json` | One file per property | Sveltia CMS at `/cms/` |
| `quiz.json` | Cities, localities, budget bands, purposes | Sveltia CMS at `/cms/` |
| `catalogue.json` | **Generated.** All projects merged, in display order | Nobody — do not edit |

## How a change reaches the site

1. Edit at **`/cms/`** (Sveltia CMS). Saving commits the changed file to `main`.
2. AWS Amplify runs `node scripts/build-content.js`, which validates everything,
   regenerates `catalogue.json` and `cms/config.yml`, then prerenders every page
   into `dist/`.
3. The site fetches `catalogue.json` and `quiz.json` at startup.

If a project points at a city, locality, budget band, or purpose that does not exist in
`quiz.json` — or at an image file that isn't in the repo — **the build fails and the
deploy stops**. That is deliberate: the site would otherwise keep working while quietly
never matching that project. Fix what the build names and push again.

Run the same check locally before pushing:

```bash
node scripts/build-content.js
```

`catalogue.json` is committed as well as generated, so the site still runs from a plain
`npx serve .` with no build step. If you edit a project file by hand, run the build so
the committed copy keeps up.

The old `/admin.html` console still has a quiz builder and JSON export, but its edits only
ever live in **your own browser**, and it is **not deployed** — it is excluded from the built
site on purpose (its passcode is a client-side hash, and Amplify cannot password-protect a
single path). `/cms/` is the one that publishes.

## Signing in to the CMS

Sveltia commits directly to GitHub, so it needs access to the repo. Three ways in,
easiest first:

- **Sign In Using Access Token** — no setup. Create a GitHub personal access token with
  repo scope (the sign-in dialog links straight to the pre-filled page) and paste it. The
  token is kept in your own browser. Best for one or two people.
- **Work with Local Repository** — no auth at all. Pick this clone's folder and edit the
  files on disk, then commit yourself. Good for local work.
- **Sign In with GitHub** — the real one-click flow, but it needs an OAuth relay because
  GitHub won't authorise a browser directly. Sveltia publish a Cloudflare Worker for
  this; once it's deployed, add its URL as `base_url` in `config.yml.template`. Worth
  doing when more than a couple of people edit.

Everyone who signs in needs write access to the repo, so their edits commit as them.

## Moving to a different CMS later

`fetchContent()` in `propstar-data.js` is the only function that knows where content
comes from. Point it at another source (Sanity, Supabase, a Sheets export) and have it
resolve the same shape, and nothing else in the app changes:

```js
{ projects: [ /* array of the objects described below */ ],
  quiz:     { /* the quiz object described below */ } }
```

Keep the field names — they are the contract between the content and the UI.

## Project fields

Required unless marked optional. Anything optional that is missing renders as `—`
or is skipped entirely, so a sparse project is safe to publish.

| Field | Type | Notes |
|---|---|---|
| `order` | number | Display order, lowest first. Existing projects step by 10 so one can be slotted between two others. Stripped from the built catalogue |
| `id` | string | Unique, and must match the filename. Used in the URL: `/project/<id>/` — changing it breaks shared links and loses that page's search ranking |
| `name` | string | Project name |
| `developer` | string | Shown above the name |
| `location` | string | Human-readable, e.g. `Yelahanka, Bengaluru` |
| `config` | string | e.g. `3 & 4 BHK` |
| `sizes` | string, optional | e.g. `1,380 – 2,609 sq.ft` |
| `status` | string, optional | e.g. `Under construction`, `New launch`, `Ready to move` |
| `possession` | string, optional | e.g. `May 2030` |
| `tags` | string[] | First three appear on the card |
| `description` | string | The "About" paragraph |
| `curation` | string[] | The "Our honest take" points |
| `amenities` | string[] | |
| `connectivity` | string[] | The "Getting around" list |
| `developerNote` | string, optional | Extra paragraph about the developer |
| `images` | string[] | Paths or URLs. **`images[0]` is the card and page hero**; the rest are the gallery |
| `photoDescription` | string, optional | **Rendered as image alt text** on the card, the detail hero and every gallery image, and as `og:image:alt`. Describe what the render shows — it is what a screen reader announces and what image search reads |
| `locationKey` | string | Must match a `locations[].key` in `quiz.json` |
| `localityKey` | string | Must match a locality key inside that city, or `""` |
| `nearbyKeys` | string[] | Other city keys to treat as "near" when matching |
| `budgetBands` | string[] | Must match `budgets[].key`. Drives matching only — **never displayed** |
| `purposes` | string[] | Must match `purposes[].key` |

**Prices are never shown.** Every project displays "On request" by design. Real prices map
to `budgetBands` so the quiz can match on them privately.

## Quiz fields

```jsonc
{
  "questions": {
    "city":     { "on": true,  "q": "…", "h": "…" },   // on = show this step
    "locality": { "on": false, "q": "…", "h": "…" },
    "budget":   { "on": true,  "q": "…", "h": "…" },
    "purpose":  { "on": false, "q": "…", "h": "…" }
  },
  "locations": [
    { "key": "bengaluru", "label": "Bengaluru", "hint": "Garden city, tech capital",
      "localities": [ { "key": "blr-yelahanka", "label": "Yelahanka" } ] }
  ],
  "budgets":  [ { "key": "b1", "label": "₹1 – 3 Cr" } ],
  "purposes": [ { "key": "live", "label": "To live in", "hint": "Your primary home" } ]
}
```

Two things to be careful with:

- **`budgets` order matters.** Matching treats neighbouring bands as a partial match, so
  the array must run cheapest to dearest.
- **Keys are referenced by every project.** Renaming or removing a location, budget, or
  purpose key silently unmatches every project pointing at it. Update both files together.

Adding a city also needs a cover image for the home page's "Explore by city" band —
that map is `cityCovers` in `index.html`.
