/* Where Estero Decides: live version.
   Maps come from the ArcGIS Maps SDK. Chapter 1 shows the EagleGIS web map itself.
   Points for the other chapters are queried live from the feature layer.
   data/decisions.json is a snapshot of all agenda items (including unmapped ones),
   used for totals, yearly counts, the council game, and as a fallback if the live layer is down. */

const CONFIG = {
  portalUrl: "https://eccl-swfl-safety.maps.arcgis.com",
  webmapId: "84a56d2f741d49f5a70c547923fb45d5",
  layerUrl: "https://services2.arcgis.com/UzlfiFv8kzq0Q4vo/arcgis/rest/services/" +
            encodeURIComponent("Estero_Board_Records_—_All_Categories") + "/FeatureServer/0",
  layerTitleHint: "Estero Board Records",
  center: [-81.795, 26.428],
  zoom: 12
};

// Outcome groups -> Status values in the layer
const OUT_STATUS = [["Approved"], ["Denied", "Failed"], ["Continued", "Tabled"], ["No Action"]];
const OUT_NAMES = ["Approved", "Denied or failed", "Continued or tabled", "No vote", "Other"];
const TYPE_SHORT = { "Village Council": "Council", "Planning Zoning & Design Board": "PZDB", "Public Hearing": "Public Hearing", "Workshop": "Workshop" };

// Simplified road lines (lat, lng), traced from geocoded records. Used for the drive.
const ROADS = {
  "US 41": [[26.392,-81.8085],[26.3985,-81.8095],[26.4106,-81.8128],[26.4252,-81.8119],[26.4326,-81.8095],[26.4420,-81.8085],[26.4490,-81.8095],[26.458,-81.8105]],
  "Corkscrew Rd": [[26.4316,-81.8150],[26.4316,-81.8090],[26.4305,-81.7953],[26.4312,-81.7885],[26.4320,-81.7836],[26.4343,-81.7740],[26.4380,-81.7620],[26.4439,-81.7500]],
  "Williams Rd": [[26.4202,-81.8170],[26.4204,-81.8066],[26.4204,-81.7975],[26.4204,-81.7884]],
  "Estero Pkwy": [[26.4490,-81.8095],[26.4488,-81.8034],[26.4492,-81.7963],[26.4494,-81.7889],[26.4494,-81.7745]],
  "Three Oaks Pkwy": [[26.4050,-81.7850],[26.4131,-81.7857],[26.4204,-81.7884],[26.4265,-81.7888],[26.4312,-81.7885],[26.4400,-81.7888],[26.4494,-81.7889]]
};

// Five real cases. Framed around the deciding body and the outcome only (no vote counts).
const CASES = [
  { rid: "vc:297", q: "A request to rezone part of Estero Town Center so a Firestone auto care shop could open.", ctx: "The request had been continued at earlier meetings before this one.", then: "The rezoning request was denied." },
  { rid: "pzdb:558", q: "A zoning amendment to allow new signage at Miromar Outlets.", ctx: "The board was asked to recommend the amendment.", then: "The motion did not pass at the board. The related ordinance later came to the Village Council, which adopted it in June 2022." },
  { rid: "vc:593", q: "An ordinance allowing a cell tower on Bella Terra Blvd, at its public hearing.", ctx: "This was the second reading of the ordinance.", then: "The item was continued to May 1, 2024, when it was approved with a condition that the tower has no lights unless another agency requires them." },
  { rid: "pzdb:224", q: "A request to expand the Walmart store on US 41.", ctx: "The store on S Tamiami Trl asked to expand its building.", then: "The expansion was approved, and the board asked Walmart to consider routing its trucks off US 41." },
  { rid: "vc:1044", q: "Mayfair Village, new homes between Broadway Ave E and Sandy Ln.", ctx: "Second reading for a residential planned development near the new downtown area.", then: "Approved, with added conditions including that the fence in the pattern book is maintained by the owner or HOA." }
];
const BODY_NAME = { "Village Council": "Village Council", "Planning Zoning & Design Board": "Planning, Zoning & Design Board", "Public Hearing": "Village Council", "Workshop": "Village Council" };

/* ---------- helpers ---------- */
const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const isDark = () => matchMedia("(prefers-color-scheme: dark)").matches;
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sqlStr = s => "'" + String(s).replace(/'/g, "''") + "'";
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmtDate = d => { if (!d) return ""; const [y, m, dd] = d.split("-"); return `${MONTHS[+m - 1]} ${+dd}, ${y}`; };
const toDateStr = v => {
  if (v == null) return "";
  if (typeof v === "number") return new Date(v).toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};
const outOf = status => { const i = OUT_STATUS.findIndex(g => g.includes(status)); return i < 0 ? 4 : i; };
const outColor = i => css(["--good", "--bad", "--wait", "--neutral", "--neutral"][i]);

function shortTitle(name, title) {
  let base = (name && !/^\W/.test(name) && name.length <= 140) ? name : (title || "");
  base = base.replace(/^[^\w$]+/, "").replace(/ofEstero/g, "of Estero");
  base = base.split(/\s+(?:An|A)\s+(?:Ordinance|Resolution)\s+of\s+the\s+Village/)[0].replace(/\s+/g, " ").trim().replace(/[ .;:-]+$/, "");
  if (base.length > 110) base = base.slice(0, 110).replace(/\s+\S*$/, "") + "…";
  return base || "Untitled item";
}
function cleanLoc(s) {
  if (!s) return "";
  return s.replace(/,?\s*Estero,?\s*(FL|Florida)?\s*(\d{5})?\s*$/i, "").replace(/\s+/g, " ").trim();
}
function trimAction(s) { s = (s || "").replace(/\s+/g, " ").trim(); return s.length > 200 ? s.slice(0, 200).replace(/\s+\S*$/, "") + "…" : s; }

function setBadge(state, text) { const b = $("liveBadge"); b.className = "live " + state; b.querySelector("span").textContent = text; }

const itemHTML = (r, link = true, door = false) => {
  const proj = door && r.rid ? window.WED.store.projectsForDecision(r.rid)[0] : null;
  return `<div class="item"><span class="d">${fmtDate(r.date)}</span><div class="t"><b>${esc(r.title)}</b><small>${esc(r.action)}</small><small>${esc(TYPE_SHORT[r.typeName] || r.typeName || "")}${r.loc ? " · " + esc(r.loc) : ""}</small>${proj ? `<small class="in-proj">Part of ${esc(proj.name)}</small>` : ""}${link && r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">Read the minutes${r.no ? ", item " + r.no : ""}</a>` : ""}${door && r.rid ? `<button class="door-sm" data-open-decision="${esc(r.rid)}">Open in contents →</button>` : ""}</div><span class="pill o${r.out}">${esc(r.status)}</span></div>`;
};

/* ---------- side doors: any section can hand a decision or project to the contents ---------- */
/** Buttons for the projects linked to a set of decision rows, most-linked first. */
function projectDoorsHTML(rows, max = 5, where = "here") {
  const S = window.WED.store, n = new Map();
  rows.forEach(r => r.rid && S.projectsForDecision(r.rid).forEach(p => n.set(p.project_id, (n.get(p.project_id) || 0) + 1)));
  return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([id, k]) => {
    const p = S.projectsById.get(id);
    return `<button class="door" data-open-project="${esc(id)}">${window.WED.sym.swatch({ group: p.sponsor_group, category: p.category, status: p.status, size: 14 })}<span>${esc(p.name)}</span><small>${k} ${esc(where)}</small><span aria-hidden="true">→</span></button>`;
  }).join("");
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-open-project],[data-open-decision]");
  if (!b || !window.WED.toc) return;
  e.preventDefault();
  window.WED.toc.focus(b.dataset.openProject ? { project: b.dataset.openProject } : { decision: b.dataset.openDecision }, { source: "side-door" });
});
const popupHTML = r => `<p style="margin:0 0 6px"><b>${fmtDate(r.date)}</b> · ${esc(TYPE_SHORT[r.typeName] || r.typeName || "")}${r.no ? " · item " + r.no : ""}</p><p style="margin:0 0 6px"><b>${esc(r.status)}</b>. ${esc(r.action)}</p><p style="margin:0 0 6px"><i>${esc(r.loc)}</i></p>${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">Read the minutes</a>` : ""}`;

/* ---------- data ---------- */
// Decisions + projects are loaded once by js/store.js; this keeps the original snapshot shape.
async function loadSnapshot() {
  const store = await window.WED.store.load();
  return store.snapshot;
}

async function loadLive() {
  const fields = ["ObjectId","ProjectName","ProjectTitle","LayerCategory","MeetingType","MeetingDate","MeetingYear","Status","ActionTaken","Outcome","LocationName","Latitude","Longitude","Document_Link","AgendaItemNumber"];
  const out = [];
  for (let offset = 0; offset < 20000; offset += 1000) {
    const p = new URLSearchParams({ where: "1=1", outFields: fields.join(","), returnGeometry: "false", orderByFields: "ObjectId", resultOffset: offset, resultRecordCount: 1000, f: "json" });
    const res = await fetch(CONFIG.layerUrl + "/query?" + p);
    const j = await res.json();
    if (j.error) throw new Error(j.error.message);
    const feats = j.features || [];
    feats.forEach(f => {
      const a = f.attributes;
      if (a.Latitude == null || a.Longitude == null) return;
      const date = toDateStr(a.MeetingDate);
      out.push({
        oid: a.ObjectId, date, year: a.MeetingYear || +date.slice(0, 4), catName: a.LayerCategory, out: outOf(a.Status),
        typeName: a.MeetingType, title: shortTitle(a.ProjectName, a.ProjectTitle), action: trimAction(a.ActionTaken || a.Outcome),
        loc: cleanLoc(a.LocationName), lat: a.Latitude, lng: a.Longitude, url: a.Document_Link, no: a.AgendaItemNumber, status: a.Status || "Unknown",
        rid: window.WED.store.ridFor(date, a.MeetingType, a.AgendaItemNumber)
      });
    });
    if (feats.length < 1000 && !j.exceededTransferLimit) break;
  }
  if (!out.length) throw new Error("No features returned");
  return out;
}

/* ---------- map factory ---------- */
let Esri;
function loadEsri() {
  return new Promise((resolve, reject) => {
    if (!window.require) return reject(new Error("ArcGIS SDK did not load"));
    require(["esri/config", "esri/Map", "esri/WebMap", "esri/views/MapView", "esri/Graphic", "esri/layers/GraphicsLayer",
             "esri/geometry/Point", "esri/geometry/Polyline", "esri/layers/FeatureLayer", "esri/geometry/Extent"],
      (esriConfig, Map, WebMap, MapView, Graphic, GraphicsLayer, Point, Polyline, FeatureLayer, Extent) => {
        esriConfig.portalUrl = CONFIG.portalUrl;
        resolve({ Map, WebMap, MapView, Graphic, GraphicsLayer, Point, Polyline, FeatureLayer, Extent });
      }, reject);
  });
}
function basicView(container, extra = {}) {
  const map = new Esri.Map({ basemap: isDark() ? "dark-gray-vector" : "gray-vector" });
  const layer = new Esri.GraphicsLayer();
  map.add(layer);
  const view = new Esri.MapView({ container, map, center: CONFIG.center, zoom: CONFIG.zoom, constraints: { snapToZoom: false }, navigation: { mouseWheelZoomEnabled: false }, ...extra });
  return { view, layer };
}
const dot = (r, color, size = 7) => new Esri.Graphic({
  geometry: new Esri.Point({ longitude: r.lng, latitude: r.lat }),
  symbol: { type: "simple-marker", color, size, outline: { color: css("--surface"), width: 1 } },
  attributes: { title: r.title },
  popupTemplate: { title: r.title.replace(/[{}]/g, ""), content: popupHTML(r).replace(/[{}]/g, "") }
});
// Build maps only when they scroll near the screen
function whenNear(el, fn) {
  const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); fn(); } }, { rootMargin: "400px" });
  io.observe(el);
}

/* ---------- main ---------- */
(async function main() {
  const snap = await loadSnapshot();
  let live = null, liveOk = false;
  try { live = await loadLive(); liveOk = true; setBadge("on", `Live from ArcGIS · ${live.length} mapped items`); }
  catch (e) { console.warn("Live layer failed, using snapshot", e); live = snap.rows.filter(r => r.lat != null); setBadge("off", "Live map unavailable · showing saved snapshot"); }

  const R = snap.rows;
  const years = [...new Set(R.map(r => r.year))].sort();
  $("facts").innerHTML = [[R.length.toLocaleString(), "agenda items"], [new Set(R.map(r => r.url)).size, "meetings"], [live.length, "mapped to a place"], [R.filter(r => r.out === 0).length.toLocaleString(), "approved"], [`${years[0]}–${String(years[years.length - 1]).slice(2)}`, "years covered"]]
    .map(f => `<div><b>${f[0]}</b><span>${f[1]}</span></div>`).join("");
  $("foot").textContent = `Snapshot through ${fmtDate(R[R.length - 1].date)}.`;
  if ($("mapKey")) $("mapKey").innerHTML = window.WED.sym.legendHTML();
  initYearRange();
  window.WED.toc.init({ tree: "toc", crumbs: "tocCrumbs", toggle: "tocToggle", panel: "tocPanel" });
  initTimeline(snap);
  initCouncil(snap);

  try { Esri = await loadEsri(); }
  catch (e) { document.querySelectorAll(".map").forEach(m => m.innerHTML = '<div class="map-loading">Map library could not load.</div>'); setBadge("off", "Maps could not load"); return; }

  whenNear($("mapExplore"), () => explore(snap));
  whenNear($("mapDrive"), () => drive(live));
  whenNear($("mapCouncil"), () => council());
  whenNear($("mapTime"), () => timeMachine(snap, live));
  whenNear($("mapGuess"), () => guess(live));
})();

/* ---------- shared year range (Explore selects; the timeline writes the same store values) ---------- */
function initYearRange() {
  const S = window.WED.store, fFrom = $("fFrom"), fTo = $("fTo");
  for (let y = S.yearSpan[0]; y <= S.yearSpan[1]; y++) { fFrom.add(new Option(y, y)); fTo.add(new Option(y, y)); }
  const sync = () => { fFrom.value = S.state.from; fTo.value = S.state.to; };
  sync();
  fFrom.onchange = () => { const f = +fFrom.value; S.set({ from: f, to: Math.max(f, S.state.to) }, "years"); };
  fTo.onchange = () => { const t = +fTo.value; S.set({ to: t, from: Math.min(t, S.state.from) }, "years"); };
  S.on("change", ({ state, prev }) => { if (state.from !== prev.from || state.to !== prev.to) sync(); });
}

/* ---------- 1 EXPLORE: the real web map + the Projects layers ---------- */
const PROJECT_FIELDS = [
  { name: "oid", type: "oid" }, { name: "project_id", type: "string" }, { name: "name", type: "string" },
  { name: "sponsor_group", type: "string" }, { name: "category", type: "string" }, { name: "status", type: "string" }, { name: "symkey", type: "string" }
];

function toEsriGeometry(g) {
  if (!g) return null;
  const sr = { wkid: 4326 };
  if (g.type === "Point") return ["point", { type: "point", longitude: g.coordinates[0], latitude: g.coordinates[1], spatialReference: sr }];
  if (g.type === "LineString") return ["polyline", { type: "polyline", paths: [g.coordinates], spatialReference: sr }];
  if (g.type === "MultiLineString") return ["polyline", { type: "polyline", paths: g.coordinates, spatialReference: sr }];
  if (g.type === "Polygon") return ["polygon", { type: "polygon", rings: g.coordinates, spatialReference: sr }];
  if (g.type === "MultiPolygon") return ["polygon", { type: "polygon", rings: g.coordinates.flat(1), spatialReference: sr }];
  return null;
}

function bboxOf(geoms) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const walk = c => { if (typeof c[0] === "number") { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]); } else c.forEach(walk); };
  geoms.filter(Boolean).forEach(g => walk(g.coordinates));
  return isFinite(x0) ? { x0, y0, x1, y1 } : null;
}

const projectPopupHTML = p => {
  if (!p) return "";
  const S = window.WED.store, decs = S.decisionsFor(p, { inRange: false }), last = p.latest;
  return `<p style="margin:0 0 6px">${esc(S.groupOf(p.sponsor_group)?.label || "")} · ${esc(p.category)}</p>` +
    `<p style="margin:0 0 6px"><b>${esc(S.statusLabel(p.status))}</b>${p.stage ? " · " + esc(p.stage) : ""}${p.sample ? " · <i>sample data</i>" : ""}</p>` +
    `<p style="margin:0 0 6px">${decs.length} linked decision${decs.length === 1 ? "" : "s"}${last ? `. Latest: ${fmtDate(last.date)}, ${esc(last.status)}` : ""}</p>` +
    `<p style="margin:0">Open it in the Contents panel for decisions and documents.</p>`;
};

function addProjectLayers(view) {
  const S = window.WED.store, sym = window.WED.sym;
  const byType = { polygon: [], polyline: [], point: [] };
  S.projects.forEach((p, i) => {
    const eg = toEsriGeometry(p.geometry); if (!eg) return;
    byType[eg[0]].push(new Esri.Graphic({ geometry: eg[1], attributes: {
      oid: i + 1, project_id: p.project_id, name: p.name, sponsor_group: p.sponsor_group, category: p.category, status: p.status,
      symkey: `${p.sponsor_group}|${p.category}|${p.status}` } }));
  });
  const statuses = g => g === "private" ? ["proposed", "under_construction", "complete"] : ["funded_this_fy", "planned_5yr", "not_in_plan"];
  const layers = [];
  ["polygon", "polyline", "point"].forEach(t => {
    if (!byType[t].length) return;
    const infos = [];
    S.TAXONOMY.groups.forEach(g => g.categories.forEach(c => statuses(g.id).forEach(st =>
      infos.push({ value: `${g.id}|${c}|${st}`, symbol: sym.arcgisSymbol({ sponsor_group: g.id, category: c, status: st }, t) }))));
    layers.push(new Esri.FeatureLayer({
      title: "Projects", source: byType[t], objectIdField: "oid", geometryType: t, spatialReference: { wkid: 4326 },
      fields: PROJECT_FIELDS, outFields: ["*"], listMode: "hide",
      renderer: { type: "unique-value", field: "symkey", uniqueValueInfos: infos,
        defaultSymbol: sym.arcgisSymbol({ sponsor_group: "village", category: "Other", status: "not_in_plan" }, t) },
      popupTemplate: { title: "{name}", content: f => projectPopupHTML(S.projectsById.get(f.graphic.attributes.project_id)) }
    }));
  });
  view.map.addMany(layers);
  const hl = new Esri.GraphicsLayer({ listMode: "hide" });
  view.map.add(hl);
  return { layers, hl };
}

async function explore(snap) {
  const cats = snap.cats, types = snap.types, S = window.WED.store;
  const webmap = new Esri.WebMap({ portalItem: { id: CONFIG.webmapId } });
  const view = new Esri.MapView({ container: "mapExplore", map: webmap, navigation: { mouseWheelZoomEnabled: false }, popup: { dockEnabled: false } });
  try { await view.when(); }
  catch (e) { $("mapExplore").innerHTML = '<div class="map-loading">The web map could not load. Check that it is shared publicly.</div>'; return; }
  await webmap.loadAll();
  const layer = webmap.allLayers.find(l => l.type === "feature" && (l.title || "").includes(CONFIG.layerTitleHint)) || webmap.allLayers.find(l => l.type === "feature");

  /* --- Projects: one dataset, filtered views (one layer per geometry type) --- */
  let proj = null;
  try { proj = addProjectLayers(view); } catch (e) { console.warn("[WED] Project layers failed", e); }
  window.WED.exploreView = view;

  function syncProjects(state, prev) {
    if (!proj) return;
    const vis = S.visibleProjects(), ids = vis.map(p => p.project_id);
    const where = ids.length ? `project_id IN (${ids.map(sqlStr).join(",")})` : "1=0";
    proj.layers.forEach(l => { l.definitionExpression = where; });
    if (layer) layer.effect = state.project ? "opacity(35%) grayscale(70%)" : null;
    proj.hl.removeAll();
    const p = state.project && S.projectsById.get(state.project);
    if (p) S.decisionsFor(p).filter(d => d.lat != null).forEach(d =>
      proj.hl.add(dot(d, outColor(d.out), d.rid === state.decision ? 15 : 10)));
    const lone = !p && state.decision && S.decisionsById.get(state.decision);
    if (lone && lone.lat != null) proj.hl.add(dot(lone, outColor(lone.out), 15));
    const moved = !prev || state.group !== prev.group || state.category !== prev.category || state.project !== prev.project || state.decision !== prev.decision;
    if (!moved) return;
    const d = state.decision && S.decisionsById.get(state.decision);
    if (d && d.lat != null) return view.goTo({ center: [d.lng, d.lat], zoom: 16 }).catch(() => {});
    const box = bboxOf(p ? [p.geometry, ...S.decisionsFor(p).filter(x => x.lat != null).map(x => ({ coordinates: [x.lng, x.lat] }))]
                         : (state.group || state.category) ? vis.map(v => v.geometry) : []);
    if (!box) return (state.group || state.category || p) ? null : view.goTo({ center: CONFIG.center, zoom: CONFIG.zoom }).catch(() => {});
    if (box.x1 - box.x0 < 0.002 && box.y1 - box.y0 < 0.002) return view.goTo({ center: [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2], zoom: 16 }).catch(() => {});
    view.goTo(new Esri.Extent({ xmin: box.x0, ymin: box.y0, xmax: box.x1, ymax: box.y1, spatialReference: { wkid: 4326 } }).expand(1.4)).catch(() => {});
  }
  S.on("change", ({ state, prev }) => syncProjects(state, prev));
  syncProjects(S.state, null);

  // clicking a project on the map opens it in the contents
  if (proj) view.on("click", async e => {
    try {
      const r = await view.hitTest(e, { include: proj.layers });
      const hit = r.results.find(x => x.graphic && x.graphic.attributes && x.graphic.attributes.project_id);
      if (hit) { const p = S.projectsById.get(hit.graphic.attributes.project_id); S.set({ group: p.sponsor_group, category: p.category, project: p.project_id }, "map"); }
    } catch (err) { /* hit test is a nicety */ }
  });

  /* --- Decisions layer filters (unchanged behavior; years now come from the shared store) --- */
  if (!layer) return;
  await layer.load();
  const catField = layer.fields.some(f => f.name === "LayerCategory") ? "LayerCategory" : null;

  const st = { cats: new Set(cats), out: "", type: "", q: "", shown: 15 };
  const fOut = $("fOut"), fType = $("fType"), fSearch = $("fSearch");
  OUT_NAMES.forEach((o, i) => fOut.add(new Option(o, i)));
  types.forEach(t => fType.add(new Option(t, t)));

  const legend = $("legend");
  cats.forEach((c, i) => {
    const l = document.createElement("label"); l.className = "tog";
    l.innerHTML = `<input type="checkbox" id="cat${i}" checked><span class="sw" style="background:var(--c${i})"></span><span>${esc(c)}</span><span class="cnt" id="cc${i}"></span><span class="bar"><i id="cb${i}" style="background:var(--c${i})"></i></span>`;
    l.querySelector("input").onchange = e => { e.target.checked ? st.cats.add(c) : st.cats.delete(c); apply(); };
    legend.appendChild(l);
  });

  function where(skipCats = false) {
    const w = [];
    if (catField && !skipCats) w.push(st.cats.size ? `${catField} IN (${[...st.cats].map(sqlStr).join(",")})` : "1=0");
    if (st.out !== "") {
      const i = +st.out;
      if (i < 4) w.push(`Status IN (${OUT_STATUS[i].map(sqlStr).join(",")})`);
      else w.push(`(Status IS NULL OR Status NOT IN (${OUT_STATUS.flat().map(sqlStr).join(",")}))`);
    }
    if (st.type) w.push(`MeetingType = ${sqlStr(st.type)}`);
    w.push(`MeetingYear >= ${S.state.from} AND MeetingYear <= ${S.state.to}`);
    if (st.q) { const q = sqlStr("%" + st.q.toUpperCase() + "%"); w.push(`(UPPER(ProjectTitle) LIKE ${q} OR UPPER(ProjectName) LIKE ${q} OR UPPER(LocationName) LIKE ${q} OR UPPER(ActionTaken) LIKE ${q})`); }
    return w.join(" AND ") || "1=1";
  }

  let seq = 0;
  async function apply() {
    const my = ++seq, w = where();
    layer.definitionExpression = w;
    try {
      const [count, stats, list] = await Promise.all([
        layer.queryFeatureCount({ where: w }),
        catField ? layer.queryFeatures({ where: where(true), groupByFieldsForStatistics: [catField], outStatistics: [{ statisticType: "count", onStatisticField: "ObjectId", outStatisticFieldName: "n" }] }) : null,
        layer.queryFeatures({ where: w, outFields: ["*"], orderByFields: ["MeetingDate DESC"], num: st.shown, returnGeometry: true })
      ]);
      if (my !== seq) return;
      $("fCount").textContent = count.toLocaleString();
      $("fSub").textContent = "decisions on the map"; $("fMeta").hidden = false;
      if (stats) {
        const cc = Object.fromEntries(stats.features.map(f => [f.attributes[catField], f.attributes.n]));
        const mx = Math.max(1, ...Object.values(cc));
        cats.forEach((c, i) => { $("cc" + i).textContent = cc[c] || 0; $("cb" + i).style.width = ((cc[c] || 0) / mx * 100) + "%"; });
      }
      const rows = list.features.map(f => {
        const a = f.attributes, date = toDateStr(a.MeetingDate);
        return { geom: f.geometry, date, typeName: a.MeetingType, title: shortTitle(a.ProjectName, a.ProjectTitle), action: trimAction(a.ActionTaken || a.Outcome), loc: cleanLoc(a.LocationName), url: a.Document_Link, no: a.AgendaItemNumber, status: a.Status || "Unknown", out: outOf(a.Status) };
      });
      const listEl = $("list");
      listEl.innerHTML = rows.map(r => itemHTML(r)).join("") || '<div class="item"><span></span><span class="muted">No items match. Try clearing a filter.</span><span></span></div>';
      [...listEl.children].forEach((el, i) => {
        const r = rows[i]; if (!r || !r.geom) return;
        const b = document.createElement("button"); b.textContent = "Show on map"; b.style.justifySelf = "start"; b.style.fontSize = ".8rem";
        b.onclick = () => { view.goTo({ target: r.geom, zoom: 16 }); $("mapExplore").scrollIntoView({ behavior: "smooth", block: "center" }); };
        el.querySelector(".t").appendChild(b);
      });
      $("lInfo").textContent = `Newest first · showing ${Math.min(st.shown, count)} of ${count.toLocaleString()}`;
      $("more").hidden = count <= st.shown;
    } catch (e) { console.warn(e); $("fSub").textContent = "Filter failed. Try again."; }
  }
  S.on("change", ({ state, prev }) => { if (state.from !== prev.from || state.to !== prev.to) { st.shown = 15; apply(); } });
  fOut.onchange = () => { st.out = fOut.value; st.shown = 15; apply(); };
  fType.onchange = () => { st.type = fType.value; st.shown = 15; apply(); };
  let qT; fSearch.oninput = () => { clearTimeout(qT); qT = setTimeout(() => { st.q = fSearch.value.trim(); st.shown = 15; apply(); }, 250); };
  $("more").onclick = () => { st.shown += 30; apply(); };
  $("fReset").onclick = () => {
    st.cats = new Set(cats); st.out = ""; st.type = ""; st.q = ""; st.shown = 15;
    fOut.value = ""; fType.value = ""; fSearch.value = "";
    legend.querySelectorAll("input").forEach(i => i.checked = true);
    S.reset("reset"); apply();
  };
  apply();
}
const years0 = s => Math.min(...s.rows.map(r => r.year));
const yearsN = s => Math.max(...s.rows.map(r => r.year));

/* ---------- 2 DRIVE ---------- */
function drive(live) {
  const { view, layer } = basicView("mapDrive");
  const routeLayer = new Esri.GraphicsLayer(); view.map.add(routeLayer, 0);
  const toXY = (lat, lng) => [lng * 111320 * Math.cos(26.43 * Math.PI / 180), lat * 110540];
  function along(route, p) {
    const P = toXY(p.lat, p.lng); let best = 1e9, pos = 0, acc = 0;
    for (let i = 0; i < route.length - 1; i++) {
      const A = toXY(...route[i]), B = toXY(...route[i + 1]), dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy);
      let t = ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / (len * len); t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(A[0] + t * dx - P[0], A[1] + t * dy - P[1]);
      if (d < best) { best = d; pos = acc + t * len; } acc += len;
    }
    return [best, pos, acc];
  }
  let route, hits = [], total = 0, car, anim = null;
  const feed = $("feed"), passedEl = $("passed"), stat = $("driveStatus"), go = $("goBtn");
  function pointAt(dist) {
    let acc = 0;
    for (let i = 0; i < route.length - 1; i++) {
      const A = toXY(...route[i]), B = toXY(...route[i + 1]), len = Math.hypot(B[0] - A[0], B[1] - A[1]);
      if (acc + len >= dist) { const t = (dist - acc) / len; return [route[i][0] + t * (route[i + 1][0] - route[i][0]), route[i][1] + t * (route[i + 1][1] - route[i][1])]; }
      acc += len;
    }
    return route[route.length - 1];
  }
  function setRoute(name) {
    if (anim) cancelAnimationFrame(anim); anim = null;
    $("routeBtns").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.textContent === name));
    route = ROADS[name]; layer.removeAll(); routeLayer.removeAll();
    const line = new Esri.Polyline({ paths: [route.map(([la, ln]) => [ln, la])] });
    routeLayer.add(new Esri.Graphic({ geometry: line, symbol: { type: "simple-line", color: css("--sun"), width: 5, cap: "round" } }));
    hits = [];
    live.forEach(r => { const [d, pos, tot] = along(route, r); total = tot; if (d < 230) hits.push({ r, pos }); });
    hits.sort((a, b) => a.pos - b.pos);
    hits.forEach(h => { h.g = dot(h.r, css("--neutral"), 6); layer.add(h.g); });
    car = new Esri.Graphic({ geometry: new Esri.Point({ longitude: route[0][1], latitude: route[0][0] }), symbol: { type: "simple-marker", color: css("--sun"), size: 14, outline: { color: css("--surface"), width: 2 } } });
    layer.add(car);
    view.when(() => view.goTo(line.extent.expand(1.3)));
    passedEl.textContent = "0"; $("passedSub").textContent = `of ${hits.length} decisions along ${name}`;
    stat.textContent = "Ready"; go.disabled = false;
    feed.innerHTML = '<p class="muted" style="padding-top:8px">Decisions show up here as you pass them. Newest pass on top.</p>';
    $("driveDoors").hidden = true;
  }
  function showDoors() {
    const name = $("routeBtns").querySelector('[aria-pressed="true"]')?.textContent || "this road";
    const html = projectDoorsHTML(hits.map(h => h.r));
    $("driveDoors").hidden = false;
    $("driveDoors").innerHTML = `<span class="eyebrow">Projects along ${esc(name)}</span>` +
      (html ? `<div class="doors">${html}</div>` : '<p class="muted">None of these decisions are linked to a project in the data yet. Open any decision above to see it in the contents.</p>');
  }
  const rb = $("routeBtns");
  Object.keys(ROADS).forEach(n => { const b = document.createElement("button"); b.textContent = n; b.onclick = () => setRoute(n); rb.appendChild(b); });
  go.onclick = () => {
    if (anim) cancelAnimationFrame(anim); go.disabled = true; stat.textContent = "Driving…"; feed.innerHTML = "";
    hits.forEach(h => { h.done = false; h.g.symbol = { type: "simple-marker", color: css("--neutral"), size: 6, outline: { color: css("--surface"), width: 1 } }; });
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches, dur = reduce ? 1 : 9000, t0 = performance.now(); let n = 0;
    const step = t => {
      const f = Math.min(1, (t - t0) / dur), dist = f * total, [la, ln] = pointAt(dist);
      car.geometry = new Esri.Point({ longitude: ln, latitude: la });
      hits.forEach(h => {
        if (!h.done && h.pos <= dist) {
          h.done = true; n++;
          h.g.symbol = { type: "simple-marker", color: outColor(h.r.out), size: 10, outline: { color: css("--surface"), width: 1 } };
          if (feed.children.length >= 6) feed.lastChild.remove();
          feed.insertAdjacentHTML("afterbegin", itemHTML(h.r, false, true));
        }
      });
      passedEl.textContent = n;
      if (f < 1) anim = requestAnimationFrame(step);
      else { anim = null; stat.textContent = "Trip done. Click any dot for details."; go.disabled = false; showDoors(); }
    };
    anim = requestAnimationFrame(step);
  };
  setRoute("US 41");
}

/* ---------- 3 COUNCIL: deciding body + outcome only ---------- */
// Guess choices map to outcome groups: 0 approved, 1 denied/failed, 2 continued/tabled.
const COUNCIL_CHOICES = [["Approved", 0], ["Denied or failed", 1], ["Continued", 2]];
const councilMap = { show: () => {}, all: () => {} };   // replaced by the map when ArcGIS loads

function initCouncil(snap) {
  const S = window.WED.store, byId = S.decisionsById;
  const cases = CASES.filter(c => byId.get(c.rid));
  let ci = 0;
  const box = $("caseBox"), prog = $("prog");
  cases.forEach(() => prog.appendChild(document.createElement("span")));
  const bodyOf = r => BODY_NAME[r.typeName] || r.typeName;
  const door = r => {
    const p = S.projectsForDecision(r.rid)[0];
    return `<button class="door-sm" data-open-decision="${esc(r.rid)}">${p ? `Open ${esc(p.name)} in contents` : "Open this decision in contents"} →</button>`;
  };
  function show() {
    [...prog.children].forEach((s, i) => s.className = i < ci ? "done" : i === ci ? "now" : "");
    if (ci >= cases.length) {
      councilMap.all(cases.map(c => byId.get(c.rid)));
      box.innerHTML = `<span class="eyebrow">The five cases</span>
        <ul class="case-sum">${cases.map(c => { const r = byId.get(c.rid); return `<li><span class="pill o${r.out}">${esc(r.status)}</span><div><b>${esc(bodyOf(r))}</b> · ${fmtDate(r.date)}<br><span class="muted">${esc(c.q)}</span><br>${door(r)}</div></li>`; }).join("")}</ul>
        <p class="muted">Public comment is open at Village Council and board meetings.</p>
        <div class="row"><button id="again">Start over</button></div>`;
      $("again").onclick = () => { ci = 0; show(); };
      return;
    }
    const c = cases[ci], r = byId.get(c.rid);
    councilMap.show(r);
    box.innerHTML = `<span class="eyebrow">Case ${ci + 1} of ${cases.length} · ${fmtDate(r.date)}</span><h3>${esc(c.q)}</h3><p class="muted">${esc(c.ctx)}</p><p class="mono" style="font-size:.8rem">${esc(r.loc)}</p><p><b>What do you think happened?</b></p><div class="row" id="vote"></div>`;
    const v = $("vote");
    COUNCIL_CHOICES.forEach(([lab]) => {
      const b = document.createElement("button"); b.textContent = lab;
      b.onclick = () => {
        v.querySelectorAll("button").forEach(x => { x.disabled = true; if (x === b) x.setAttribute("aria-pressed", "true"); });
        box.insertAdjacentHTML("beforeend", `<div class="verdict">
          <dl class="facts-dl"><dt>Deciding body</dt><dd>${esc(bodyOf(r))}</dd><dt>Outcome</dt><dd><span class="pill o${r.out}">${esc(r.status)}</span></dd></dl>
          <span>${esc(c.then)}</span>
          <a href="${esc(r.url)}" target="_blank" rel="noopener">Read the minutes, item ${r.no}</a>
          ${door(r)}
        </div><div class="row"><button class="primary" id="next">${ci < cases.length - 1 ? "Next case" : "See all five"}</button></div>`);
        $("next").onclick = () => { ci++; show(); };
      };
      v.appendChild(b);
    });
  }
  show();
}

function council() {
  const { view, layer } = basicView("mapCouncil");
  const ring = r => new Esri.Graphic({ geometry: new Esri.Point({ longitude: r.lng, latitude: r.lat }), symbol: { type: "simple-marker", color: [0, 0, 0, 0], size: 28, outline: { color: css("--sun"), width: 3 } } });
  councilMap.show = r => { layer.removeAll(); if (r.lat == null) return; layer.addMany([ring(r), dot(r, css("--sun"), 9)]); view.when(() => view.goTo({ center: [r.lng, r.lat], zoom: 15 })); };
  councilMap.all = rs => { layer.removeAll(); rs.filter(r => r.lat != null).forEach(r => layer.add(dot(r, outColor(r.out), 12))); view.when(() => view.goTo({ center: CONFIG.center, zoom: CONFIG.zoom })); };
  const cur = $("caseBox").querySelector(".eyebrow")?.textContent.match(/Case (\d+)/);
  const idx = cur ? +cur[1] - 1 : -1, list = CASES.map(c => window.WED.store.decisionsById.get(c.rid)).filter(Boolean);
  idx >= 0 ? councilMap.show(list[idx]) : councilMap.all(list);
}

/* ---------- 4 TIME: the slider writes the shared year range; everything else follows ---------- */
function initTimeline(snap) {
  const S = window.WED.store, [y0, y1] = S.yearSpan, all = [];
  for (let y = y0; y <= y1; y++) all.push(y);
  const yc = Object.fromEntries(all.map(y => [y, snap.rows.filter(r => r.year === y).length]));
  const ymax = Math.max(...Object.values(yc));
  const spark = $("spark"), yr = $("yr");
  spark.style.gridTemplateColumns = $("yearline").style.gridTemplateColumns = `repeat(${all.length},1fr)`;
  all.forEach(y => { const i = document.createElement("i"); i.style.height = (yc[y] / ymax * 100) + "%"; if (!yc[y]) i.className = "gap"; i.title = `${y}: ${yc[y]}`; spark.appendChild(i); });
  $("yearline").innerHTML = all.map(y => `<span>'${String(y).slice(2)}</span>`).join("");
  yr.min = y0; yr.max = y1;

  function render() {
    const { from, to } = S.state; let c = 0;
    all.forEach(y => { if (y >= from && y <= to) c += yc[y]; });
    yr.value = to;
    [...spark.children].forEach((b, i) => b.classList.toggle("on", all[i] >= from && all[i] <= to));
    $("tYear").textContent = from === to ? to : `${from}–${to}`;
    $("tCount").textContent = `${c.toLocaleString()} agenda items in this range · ${yc[to]} in ${to}`;
    const rowsY = snap.rows.filter(r => r.year === to), lc = {};
    rowsY.filter(r => r.lat != null).forEach(r => { lc[r.loc] = (lc[r.loc] || 0) + 1; });
    const top = Object.entries(lc).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const nProj = S.visibleProjects().length, doors = projectDoorsHTML(rowsY, 4, `in ${to}`);
    $("tTop").innerHTML = (!yc[to] ? `<strong>No records for ${to} in this dataset.</strong> That year's minutes still need to be added.`
      : top.length ? `<span class="eyebrow">Busiest places in ${to}</span><br>${top.map(t => `${esc(t[0])} <span class="mono">(${t[1]})</span>`).join("<br>")}` : "") +
      `<div class="doorbox"><span class="eyebrow">Projects with decisions in ${to}</span>${doors ? `<div class="doors">${doors}</div>` : '<p class="muted">None linked in the data yet.</p>'}` +
      `<button class="door-sm" id="tToToc">See all ${nProj} project${nProj === 1 ? "" : "s"} for ${from}–${to} in the contents →</button></div>`;
  }
  yr.oninput = () => { const v = +yr.value; S.set({ to: v, from: Math.min(S.state.from, v) }, "timeline"); };
  $("tTop").addEventListener("click", e => { if (e.target.id === "tToToc") $("explore").scrollIntoView({ behavior: "smooth", block: "start" }); });
  S.on("change", ({ state, prev }) => { if (state.from !== prev.from || state.to !== prev.to || state.off !== prev.off) render(); });
  render();

  let playT = null; const pb = $("playBtn");
  const stop = () => { clearInterval(playT); playT = null; pb.textContent = "Play the decade"; };
  pb.onclick = () => {
    if (playT) return stop();
    S.set({ from: y0, to: y0 }, "timeline"); pb.textContent = "Pause";
    playT = setInterval(() => { if (S.state.to >= y1) return stop(); S.set({ to: S.state.to + 1 }, "timeline"); }, 900);
  };
}

function timeMachine(snap, live) {
  const S = window.WED.store, { view, layer } = basicView("mapTime");
  const graphics = live.map(r => ({ r, g: dot(r, css("--bay"), 7) }));
  function upd() {
    const { from, to } = S.state;
    layer.removeAll();
    layer.addMany(graphics.filter(x => x.r.year >= from && x.r.year <= to).map(x => {
      x.g.symbol = { type: "simple-marker", color: x.r.year === to ? css("--sun") : css("--bay"), size: x.r.year === to ? 10 : 7, outline: { color: css("--surface"), width: 1 } };
      return x.g;
    }));
  }
  S.on("change", ({ state, prev }) => { if (state.from !== prev.from || state.to !== prev.to) upd(); });
  upd();
}

/* ---------- 5 GUESS ---------- */
/** Group mapped decisions into ~0.4-mile cells, busiest first. Each cell keeps its rows for the side doors. */
function hotspots(rows, cell = 0.006) {
  const grid = {};
  rows.forEach(r => { const k = Math.floor(r.lat / cell) + "|" + Math.floor(r.lng / cell); (grid[k] = grid[k] || []).push(r); });
  return Object.values(grid).map(g => {
    const lat = g.reduce((s, r) => s + r.lat, 0) / g.length, lng = g.reduce((s, r) => s + r.lng, 0) / g.length, lc = {};
    g.forEach(r => lc[r.loc] = (lc[r.loc] || 0) + 1);
    return { n: g.length, lat, lng, rows: g, name: Object.entries(lc).sort((a, b) => b[1] - a[1])[0][0] };
  }).sort((a, b) => b.n - a.n);
}
/** Links from the busiest spot into the contents: its projects, plus its latest decision. */
function hotspotDoorsHTML(h) {
  const doors = projectDoorsHTML(h.rows);
  const latest = h.rows.filter(r => r.rid).sort((a, b) => b.date.localeCompare(a.date))[0];
  return `<div class="doorbox"><span class="eyebrow">Explore this spot</span>` +
    (doors ? `<div class="doors">${doors}</div>` : '<p class="muted">No decisions here are linked to a project in the data yet.</p>') +
    (latest ? `<button class="door-sm" data-open-decision="${esc(latest.rid)}">Latest decision here: ${fmtDate(latest.date)} →</button>` : "") + `</div>`;
}
function guess(live) {
  const { view, layer } = basicView("mapGuess", { popupEnabled: false });
  const hots = hotspots(live);
  const top = hots[0], out = $("guessOut"); let guessed = false;
  view.on("click", e => {
    if (guessed || !e.mapPoint) return; guessed = true;
    const g = { lat: e.mapPoint.latitude, lng: e.mapPoint.longitude };
    layer.add(new Esri.Graphic({ geometry: e.mapPoint, symbol: { type: "simple-marker", color: css("--ink"), size: 12, outline: { color: css("--surface"), width: 2 } } }));
    hots.slice(0, 12).forEach((h, i) => setTimeout(() => {
      const pt = new Esri.Point({ longitude: h.lng, latitude: h.lat });
      layer.add(new Esri.Graphic({ geometry: pt, symbol: { type: "simple-marker", color: i === 0 ? css("--sun") : css("--bay"), size: Math.max(16, Math.sqrt(h.n) * 6), outline: { color: css("--surface"), width: 1.5 } } }));
      if (h.n >= 8) layer.add(new Esri.Graphic({ geometry: pt, symbol: { type: "text", text: String(h.n), color: "#ffffff", yoffset: -4, font: { size: 10, weight: "bold" } } }));
    }, i * 70));
    layer.add(new Esri.Graphic({ geometry: new Esri.Polyline({ paths: [[[g.lng, g.lat], [top.lng, top.lat]]] }), symbol: { type: "simple-line", color: css("--ink"), width: 1.5, style: "dash" } }));
    const toXY = (la, ln) => [ln * 111320 * Math.cos(26.43 * Math.PI / 180), la * 110540];
    const [ax, ay] = toXY(g.lat, g.lng), [bx, by] = toXY(top.lat, top.lng);
    const miles = Math.hypot(ax - bx, ay - by) / 1609.34;
    out.innerHTML = `<span class="eyebrow">${miles < .4 ? "Nailed it" : miles < 1.5 ? "Close" : "Not quite"}</span><div class="big">${miles.toFixed(1)} mi</div><p>from the busiest spot: <strong>${top.n} mapped items</strong> in one patch about 0.4 miles across, centered near <strong>${esc(top.name)}</strong>.</p><p class="muted">Next four busiest areas: ${hots.slice(1, 5).map(h => `${esc(h.name)} (${h.n})`).join(", ")}.</p>` + hotspotDoorsHTML(top);
  });
  $("guessReset").onclick = () => { guessed = false; layer.removeAll(); out.innerHTML = '<p class="muted">No guess yet. Tap anywhere on the map.</p>'; };
}
