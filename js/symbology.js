/* One place for project colors and status styles.
   Color = category (one color per category, used on the map, sidebar, legend and story).
   Shape = sponsor group (circle Village, square private, diamond county/state).
   Status = fill style:
     Village and county/state: solid = funded this FY, dashed = later in 5-yr plan, gray = not in plan
     Private: outline = proposed, hatched = under construction, solid = complete
   Points can't draw a dashed outline reliably, so "later in plan" points are a hollow ring.
   Exposes window.WED.sym. */
(function () {
  const COLORS = {
    // Village CIP categories
    "Roadway": "#3b6fb6",
    "Intersection": "#e07b24",
    "Bicycle and Pedestrian": "#2e9e6a",
    "Landscaping and Beautification": "#9a9a1f",
    "Parks and Recreation": "#178a8a",
    "Stormwater": "#5b4fc4",
    "Utility": "#c2477e",
    "Land Acquisition": "#8c5a2b",
    "Building Facilities": "#b8432f",
    // Private dev_type
    "Residential": "#d99a1e",
    "Commercial/retail": "#d1495b",
    "Mixed use": "#8e5bb5",
    "Hospitality": "#2b9fb3",
    "Medical/institutional/education": "#4d7c2f",
    "Recreation/entertainment": "#ee6c9b",
    "Other": "#6f7f8f",
    // County & state programs
    "County roads": "#4f6585",
    "FDOT": "#c98a1b",
    "Conservation 20/20": "#3f8f4f",
    "Other county/state": "#8a7f75"
  };
  const GRAY = "#9aa3a0";
  const SHAPES = { village: "circle", private: "square", county_state: "diamond" };
  const PUBLIC = new Set(["village", "county_state"]);

  const color = cat => COLORS[cat] || "#6f7f8f";
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a]; };

  /** Which visual treatment a project gets: "solid" | "dashed" | "gray" | "outline" | "hatched" */
  function treatment(group, status) {
    if (PUBLIC.has(group)) return status === "funded_this_fy" ? "solid" : status === "planned_5yr" ? "dashed" : "gray";
    return status === "under_construction" ? "hatched" : status === "complete" ? "solid" : "outline";
  }

  /* ---------- inline SVG swatches (sidebar, legend, story) ---------- */
  function hatchPattern(id, c) {
    return `<defs><pattern id="${id}" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="${c}" fill-opacity=".15"/><line x1="0" y1="0" x2="0" y2="4" stroke="${c}" stroke-width="2"/></pattern></defs>`;
  }
  let uid = 0;
  /** kind: "point" | "line" | "poly" */
  function swatch({ group, category, status, kind = "point", size = 16 }) {
    const t = treatment(group, status), c = t === "gray" ? GRAY : color(category), s = size, id = "h" + (++uid);
    const fill = t === "solid" || t === "gray" ? c : t === "hatched" ? `url(#${id})` : "none";
    const dash = t === "dashed" ? ' stroke-dasharray="3 2"' : "";
    const defs = t === "hatched" ? hatchPattern(id, c) : "";
    let shape;
    if (kind === "line") {
      shape = `<line x1="1" y1="${s / 2}" x2="${s - 1}" y2="${s / 2}" stroke="${c}" stroke-width="3.5" stroke-linecap="round"${t === "dashed" ? ' stroke-dasharray="4 3"' : ""}/>`;
    } else if (kind === "poly") {
      shape = `<rect x="1.5" y="1.5" width="${s - 3}" height="${s - 3}" rx="2" fill="${fill}" fill-opacity="${t === "solid" || t === "gray" ? .55 : 1}" stroke="${c}" stroke-width="1.8"${dash}/>`;
    } else {
      const sh = SHAPES[group] || "circle", sw = t === "solid" || t === "gray" ? 1.5 : 2.4;
      const stroke = t === "solid" || t === "gray" ? "#fff" : c;
      if (sh === "square") shape = `<rect x="2.5" y="2.5" width="${s - 5}" height="${s - 5}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      else if (sh === "diamond") shape = `<polygon points="${s / 2},1.5 ${s - 1.5},${s / 2} ${s / 2},${s - 1.5} 1.5,${s / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      else shape = `<circle cx="${s / 2}" cy="${s / 2}" r="${s / 2 - 2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
    }
    return `<svg class="sym" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" aria-hidden="true">${defs}${shape}</svg>`;
  }

  /** Simple color dot for a category heading. */
  const dot = (category, size = 12) => `<span class="cat-dot" style="background:${color(category)};width:${size}px;height:${size}px" aria-hidden="true"></span>`;

  /* ---------- ArcGIS symbols (autocast JSON) ---------- */
  function hatchMarkerSVG(c, shape) {
    const clip = shape === "diamond" ? '<polygon points="12,1 23,12 12,23 1,12"/>' : shape === "square" ? '<rect x="2" y="2" width="20" height="20"/>' : '<circle cx="12" cy="12" r="10"/>';
    const outline = clip.replace("/>", ` fill="none" stroke="${c}" stroke-width="2.5"/>`);
    return "data:image/svg+xml;base64," + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><defs><clipPath id="k">${clip}</clipPath><pattern id="p" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#fff" fill-opacity=".6"/><line x1="0" y1="0" x2="0" y2="5" stroke="${c}" stroke-width="2.4"/></pattern></defs><g clip-path="url(#k)"><rect width="24" height="24" fill="url(#p)"/></g>${outline}</svg>`);
  }

  function arcgisSymbol(p, geomType) {
    const t = treatment(p.sponsor_group, p.status), c = t === "gray" ? GRAY : color(p.category);
    if (geomType === "polyline") {
      return { type: "simple-line", color: c, width: 4.5, cap: "round", join: "round",
        style: t === "dashed" ? "dash" : t === "outline" ? "short-dot" : t === "hatched" ? "dash-dot" : "solid" };
    }
    if (geomType === "polygon") {
      const outline = { color: c, width: 2, style: t === "dashed" ? "dash" : "solid" };
      if (t === "hatched") return { type: "simple-fill", style: "backward-diagonal", color: rgba(c, 1), outline };
      if (t === "outline") return { type: "simple-fill", color: rgba(c, 0.04), outline: { ...outline, width: 2.5 } };
      if (t === "dashed") return { type: "simple-fill", color: rgba(c, 0.12), outline };
      return { type: "simple-fill", color: rgba(c, t === "gray" ? 0.3 : 0.45), outline };
    }
    const shape = SHAPES[p.sponsor_group] || "circle";
    if (t === "hatched") return { type: "picture-marker", url: hatchMarkerSVG(c, shape), width: 16, height: 16 };
    const filled = t === "solid" || t === "gray";
    return { type: "simple-marker", style: shape, size: shape === "diamond" ? 15 : 13,
      color: filled ? rgba(c, 1) : rgba("#ffffff", 0.35),
      outline: { color: filled ? "#ffffff" : c, width: filled ? 1.5 : 2.8 } };
  }

  /* ---------- legend (map key) ---------- */
  function legendHTML() {
    const store = window.WED.store, T = store.TAXONOMY;
    const row = (sw, label) => `<li>${sw}<span>${label}</span></li>`;
    const pubStatus = ["funded_this_fy", "planned_5yr", "not_in_plan"].map(s =>
      row(swatch({ group: "village", category: "Roadway", status: s, kind: "line" }) + swatch({ group: "village", category: "Roadway", status: s }), store.statusLabel(s))).join("");
    const pvtStatus = ["proposed", "under_construction", "complete"].map(s =>
      row(swatch({ group: "private", category: "Residential", status: s, kind: "poly" }) + swatch({ group: "private", category: "Residential", status: s }), store.statusLabel(s))).join("");
    const shapes = T.groups.map(g => row(swatch({ group: g.id, category: "Other", status: g.id === "private" ? "complete" : "funded_this_fy" }), g.label)).join("");
    const cats = T.groups.map(g => `<div class="key-cats"><b>${g.short}</b><ul>${g.categories.map(c => `<li>${dot(c)}<span>${c}</span></li>`).join("")}</ul></div>`).join("");
    return `<details class="mapkey"${matchMedia("(min-width: 860px)").matches ? " open" : ""}>
      <summary>Map key</summary>
      <div class="key-grid">
        <div><h4>Village &amp; county/state status</h4><ul>${pubStatus}</ul></div>
        <div><h4>Private development status</h4><ul>${pvtStatus}</ul></div>
        <div><h4>Who sponsors it</h4><ul>${shapes}</ul></div>
      </div>
      <div class="key-cat-wrap"><h4>Category colors</h4>${cats}</div>
      ${store.meta.sample ? '<p class="key-note"><span class="sample-tag">Sample data</span> Project status, category and fiscal years are placeholders. Linked decisions are real.</p>' : ""}
    </details>`;
  }

  window.WED = window.WED || {};
  window.WED.sym = { COLORS, GRAY, SHAPES, color, treatment, swatch, dot, arcgisSymbol, legendHTML };
})();
