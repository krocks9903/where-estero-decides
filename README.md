# Where Estero Decides

Interactive story of ten years of Village of Estero decisions, built for Engage Estero by the EagleGIS team.

## Chapters
1. **Explore**: the live EagleGIS web map with category, outcome, board, year and search filters
2. **Take the drive**: pick a road and watch real decisions light up as you pass
3. **You're on the council**: vote on five real cases, then see what the Village did
4. **Time machine**: scrub 2015 to 2026
5. **Guess the hotspot**: tap where you think the most decisions landed

## How it works
- Maps use the ArcGIS Maps SDK for JavaScript (4.31).
- Chapter 1 loads web map `84a56d2f741d49f5a70c547923fb45d5` from the Engage Estero ArcGIS org, so its symbols, clusters and popups come from ArcGIS. Filters set the layer's definition expression.
- Chapters 2, 4 and 5 query the feature layer live, so data fixes in ArcGIS show up here.
- `data/decisions.json` is a snapshot of all 2,618 agenda items (including ones without a location). It powers the header totals, yearly counts and the council game, and is the fallback if the live layer is down.
- The web map and layer must be shared publicly.

## Files
- `index.html`, `style.css`, `app.js`: the site
- `data/decisions.json`: page snapshot
- `data/estero_decisions_mapped.csv`, `data/estero_decisions_all_clean.csv`: cleaned exports
- `docs/arcgis_setup.md`: layer, filter, popup and dashboard setup

## Run locally
```
python3 -m http.server 8000
```
Then open http://localhost:8000. Opening `index.html` straight from disk won't work because it fetches `data/decisions.json`.

## Publish
Settings → Pages → Deploy from a branch → `main`, `/ (root)`.

## Known data gaps
- No 2018 records in the snapshot.
- Snapshot ends June 17, 2026.
- Some geocodes are off (see `docs/arcgis_setup.md`).
