# Where Estero Decides

Interactive map of Village of Estero decisions, built for Engage Estero by the EagleGIS team.

The map works as a table of contents:

1. **Sponsor group**: Private development, Village of Estero, Lee County & state
2. **Category**: private `dev_type`, Village CIP category, or county/state program
3. **Project**
4. **Decisions**: deciding body and outcome
5. **Source documents**: minutes today, plus agendas and ordinances when added to a project

## Sections
1. **Explore the map**: the live EagleGIS web map plus the Projects layers, with the contents tree, a shared year range, layer checkboxes and the original decision filters
2. **Current story**: a plain summary generated from the data, in the same hierarchy, with source links
3. **Take the drive**: pick a road; decisions along it open in the contents
4. **You're on the council**: five real cases, framed by deciding body and outcome
5. **Guess the hotspot**: find the busiest spot, then open its projects and latest decision
6. **A look back**: the year slider; it sets the year range for the whole page

Drive, council, hotspot and timeline are side doors: their results open the matching project or decision in the contents.

## How it works
- Static site, no build step. GitHub Pages serves it as is.
- Maps use the ArcGIS Maps SDK for JavaScript 4.31.
- Explore loads web map `84a56d2f741d49f5a70c547923fb45d5` (decisions layer, symbols, clusters and popups come from ArcGIS) and adds the Projects as client-side feature layers, one per geometry type, each filtered from the one dataset.
- Drive, hotspot and timeline maps query the decisions feature layer live. If it's down, they fall back to the snapshot.
- Live rows are matched to `RecordId`s by date + board + item number.

### Code
| File | What it does |
|---|---|
| `js/store.js` | Loads `data/projects.geojson` + `data/decisions.json`, joins them by `decision_ids`, holds the shared filter state (group, category, project, decision, year range, hidden layers) |
| `js/symbology.js` | Category colors, sponsor shapes, status styles; ArcGIS symbols and SVG swatches from one config; map key |
| `js/toc.js` | Contents tree, breadcrumb, deep links (`#project=VOE-RD-01`, `#decision=vc:297`), `WED.toc.focus()` |
| `js/story.js` | Current story. `WED.story.setProvider(fn)` is the hook for Ask EagleGIS to write it |
| `app.js` | Maps and the chapter sections |

### Data
- `data/projects.geojson`: one schema for all sponsors. See `docs/projects_schema.md`. **Currently sample data.**
- `data/decisions.json`: snapshot of all 2,618 agenda items. Header totals, the contents, the story and the fallback for the maps.
- `data/estero_decisions_*.csv`: cleaned exports. `docs/arcgis_setup.md` has the ArcGIS setup notes.

## Run locally
```
python3 -m http.server 8000
```
Then open http://localhost:8000. Opening `index.html` straight from disk won't work because the page fetches its data files.

## Publish
Settings → Pages → Deploy from a branch. The live site currently deploys from `live-webmap`; this work is on `toc-hierarchy`.

## Known data gaps
- No 2018 records in the decisions snapshot.
- Snapshot ends June 17, 2026.
- Some geocodes are off (see `docs/arcgis_setup.md`).
- Project data is sample data until replaced with verified records.
