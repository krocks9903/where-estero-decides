# Where Estero Decides: ArcGIS setup

## Files
- `estero_decisions_mapped.csv`: the 712 items with coordinates. Upload this one as your map layer.
- `estero_decisions_all_clean.csv`: all 2,618 items, including ones without a location. Use it as a table for the dashboard list and charts.

New fields added in the clean files:

| Field | What it is |
|---|---|
| `ShortTitle` | Readable title. Legal preambles cut, junk characters removed (like the leading "="), max 110 characters |
| `OutcomeGroup` | Approved / Denied or failed / Continued or tabled / No vote / Other |
| `Category` | Display name of `LandUseCategory` (same names your current map uses) |
| `Action` | What happened, trimmed to 200 characters |
| `LocationClean` | Address with ", Estero, FL" removed, suffixes standardized, title case (193 names down to 185) |

## 1. Upload the layer
1. ArcGIS Online → **Content → New item → CSV** → pick `estero_decisions_mapped.csv`.
2. Choose **Create a hosted feature layer**. Location fields: **Latitude** and **Longitude**.
3. Make sure `MeetingDate` is typed as **Date**.
4. Share it publicly (needed for StoryMaps and Dashboards).

## 2. Layers (Map Viewer)
Add the layer 3 times and rename each copy. Set a filter on each (Properties → Filter).

| Layer name | Filter |
|---|---|
| Development decisions | `Category` is any of Commercial & Mixed-Use Development, Residential Development |
| Roads & infrastructure | `Category` is any of Transportation & Mobility, Utilities, Stormwater & Environment |
| Everything else | `Category` is not any of the four above |

Or keep one layer and style it by `Category` like you have now.

## 3. Style
- **Styles → Types (unique symbols)** on `OutcomeGroup`.
- Colors: Approved `#2d7c39`, Denied or failed `#b33939`, Continued or tabled `#977610`, No vote and Other `#7c8b95`.
- Clustering on. In Clustering → **Cluster fields**, add `ShortTitle`, `MeetingDate`, `OutcomeGroup` so your existing cluster popup's "most recent" section fills in.
- Labels on clusters: show the count.

## 4. Popup (Arcade, Text element)
Add an Arcade element and paste:

```
var color = Decode($feature.OutcomeGroup,
  "Approved", "#2d7c39",
  "Denied or failed", "#b33939",
  "Continued or tabled", "#977610",
  "#7c8b95");
var d = Text($feature.MeetingDate, "MMM D, Y");
return {
  type: "text",
  text: "<b>" + $feature.ShortTitle + "</b><br>" +
        d + " · " + $feature.MeetingType + "<br>" +
        "<span style='color:" + color + "'><b>" + $feature.Status + "</b></span> " + $feature.Action + "<br>" +
        "<i>" + $feature.LocationClean + "</i><br>" +
        "<a href='" + $feature.PrimarySourceUrl + "'>Read the minutes</a>"
};
```

## 5. Time slider
Layer properties → **Time** → enable on `MeetingDate`. Save the map. In StoryMaps, check the map block settings for the time slider.

## 6. Dashboard
Use the all-items table as the source so unmapped items count too.

| Element | Setup |
|---|---|
| Indicator | Count of records. Title "Decisions" |
| Serial chart (replaces the pie) | Category field `MeetingType` or `Category`, horizontal, sort by count descending |
| Category selector 1 | `OutcomeGroup`, button style |
| Category selector 2 | `MeetingType`, dropdown |
| Date selector | `MeetingDate`, range |
| List | Sort `MeetingDate` descending, use the Arcade below |
| Map | Your web map, filtered by all selectors |

List Arcade (Advanced formatting):

```
var c = Decode($datapoint.OutcomeGroup, "Approved", "#2d7c39",
  "Denied or failed", "#b33939", "Continued or tabled", "#977610", "#7c8b95");
return {
  textColor: "",
  backgroundColor: "",
  separatorColor: "",
  selectionColor: "",
  selectionTextColor: "",
  attributes: { color: c, date: Text($datapoint.MeetingDate, "MMM D, Y") }
};
```

List item template:
`<b>{ShortTitle}</b><br>{expression/date} · {MeetingType} · <span style="color:{expression/color}">{Status}</span>`

Rename the 4 chart tabs to what they show.

## Data issues to fix upstream
- **No 2018 records.** The yearly counts jump from 2017 to 2019, so 2018 minutes are missing from the scrape.
- 2026 only goes through June 17.
- Some geocodes are off. Example: "Coconut Point - Waypoint Residences" (Jan 14, 2026) is placed at Shadow Wood.
- Vote counts (`VoteYes`, `VoteNo`) look unreliable (lots of 1–1), so the page uses `Status` instead.
- 744 items are "No Action" (presentations, staff updates). Filter them out if you only want real decisions.
