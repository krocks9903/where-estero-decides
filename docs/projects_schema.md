# Projects data layer

One dataset for every sponsor: `data/projects.geojson`. Each map layer, sidebar branch and story section is a filtered view of this one file.

> **The current file is sample data.** Project names and linked decisions are real records from Village minutes. Sponsor group, category, status, stage and fiscal years are placeholders so the layout and symbology can be built and reviewed. No costs are filled in. Every feature has `sample: true` and `verified: false`.

## Hierarchy

1. **Sponsor group** (`sponsor_group`)
2. **Category** (`category`)
3. **Project** (one feature)
4. **Decisions** (`decision_ids` → `RecordId` in `data/decisions.json`)
5. **Source documents** (`source_urls` on the project, plus the minutes link on each decision)

## Fields

| Field | Type | Notes |
|---|---|---|
| `project_id` | string | Unique. Pattern `VOE-…`, `PVT-…`, `CS-…`. Also the feature `id`. |
| `name` | string | Display name. |
| `sponsor_group` | enum | `private`, `village`, `county_state` |
| `category` | enum | Depends on group, see below. |
| `dev_type` | enum or null | Private only. Same values as private `category`. |
| `status` | enum | Drives the map style. Depends on group, see below. |
| `stage` | string or null | Free text, for example `design`, `construction`, `approved`, `denied`. |
| `total_cost` | number or null | Dollars. Leave null until sourced. |
| `budget_5yr` | number or null | Dollars in the current 5-year CIP. Leave null until sourced. |
| `fiscal_years` | string[] | For example `["FY2026","FY2027"]`. |
| `funding_sources` | string[] | For example `["General Fund","Impact fees"]`. |
| `units` | number or null | Private residential units. |
| `nonres_sqft` | number or null | Private non-residential square feet. |
| `deciding_body` | string | Main body for the project. Each decision also carries its own body. |
| `decision_ids` | string[] | `RecordId`s from `data/decisions.json`, like `vc:297` or `pzdb:224`. One project usually has several. |
| `source_urls` | string[] | Agendas, ordinances, staff reports for the project as a whole. |
| `location_name` | string or null | Plain-language place. |
| `sample` | boolean | `true` for placeholder rows. Shown as a "Sample data" tag. |
| `verified` | boolean | `true` once checked against a source. |
| `geometry_approx` | boolean | `true` when the shape is a rough outline, not a parcel boundary. |
| geometry | Point, LineString, Polygon, or null | Null means "no single place", like a Village-wide study. It still shows in the sidebar and story, just not on the map. |

`decision_id` from the original brief became `decision_ids` (a list), since one project usually has several decisions. When this is published to ArcGIS Online, flatten lists to `;`-separated strings.

## Categories

**Private development** (`category` = `dev_type`):
Residential · Commercial/retail · Mixed use · Hospitality · Medical/institutional/education · Recreation/entertainment · Other

**Village of Estero** (CIP category):
Roadway · Intersection · Bicycle and Pedestrian · Landscaping and Beautification · Parks and Recreation · Stormwater · Utility · Land Acquisition · Building Facilities

**Lee County & state** (program):
County roads · FDOT · Conservation 20/20 · Other county/state

## Status values

| Group | `status` | Map style |
|---|---|---|
| Village, County/state | `funded_this_fy` | Solid |
| | `planned_5yr` | Dashed |
| | `not_in_plan` | Gray |
| Private | `proposed` | Outline |
| | `under_construction` | Hatched |
| | `complete` | Solid |

## Adding or fixing a project

1. Add or edit a feature in `data/projects.geojson`.
2. Put real `RecordId`s in `decision_ids`. The page warns in the browser console about any ID it can't find.
3. Set `sample` to `false` and `verified` to `true` once the row is checked.
4. Update `meta.updated`. The "Current story" view shows this date.
