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

const CASES = [
  { rid: "vc:297", q: "Rezone part of Estero Town Center so a Firestone auto care shop can open?", ctx: "The request would amend the zoning for the Estero Town Center planned development. It had already been continued twice.", ans: 1, then: "Denied. Council rejected the zoning change for the Firestone shop." },
  { rid: "pzdb:558", q: "Change the zoning rules to allow new signage at Miromar Outlets?", ctx: "The Planning Zoning & Design Board weighed a zoning amendment for the outlet mall's signs.", ans: 1, then: "The motion failed on a 4–4 tie. The Council later passed the related ordinance in June 2022." },
  { rid: "vc:593", q: "Approve a cell tower on Bella Terra Blvd at its public hearing?", ctx: "Second reading and public hearing for the ordinance that would allow the tower.", ans: 2, then: "Continued to May 1, 2024. It was then approved with a condition that the tower has no lights unless another agency requires them." },
  { rid: "pzdb:224", q: "Approve the Walmart expansion on US 41?", ctx: "The store on S Tamiami Trl asked to expand its building.", ans: 0, then: "Approved, and the board asked Walmart to consider routing its trucks off US 41." },
  { rid: "vc:1044", q: "Approve Mayfair Village, new homes between Broadway Ave E and Sandy Ln?", ctx: "Second reading for a residential planned development near the new downtown area.", ans: 0, then: "Approved, with added conditions including that the fence in the pattern book must be maintained by the owner or HOA." }
];

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

const itemHTML = (r, link = true) => `<div class="item"><span class="d">${fmtDate(r.date)}</span><div class="t"><b>${esc(r.title)}</b><small>${esc(r.action)}</small><small>${esc(TYPE_SHORT[r.typeName] || r.typeName || "")}${r.loc ? " · " + esc(r.loc) : ""}</small>${link && r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">Read the minutes${r.no ? ", item " + r.no : ""}</a>` : ""}</div><span class="pill o${r.out}">${esc(r.status)}</span></div>`;
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
        loc: cleanLoc(a.LocationName), lat: a.Latitude, lng: a.Longitude, url: a.Document_Link, no: a.AgendaItemNumber, status: a.Status || "Unknown"
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
             "esri/geometry/Point", "esri/geometry/Polyline"],
      (esriConfig, Map, WebMap, MapView, Graphic, GraphicsLayer, Point, Polyline) => {
        esriConfig.portalUrl = CONFIG.portalUrl;
        resolve({ Map, WebMap, MapView, Graphic, GraphicsLayer, Point, Polyline });
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

  try { Esri = await loadEsri(); }
  catch (e) { document.querySelectorAll(".map").forEach(m => m.innerHTML = '<div class="map-loading">Map library could not load.</div>'); setBadge("off", "Maps could not load"); return; }

  whenNear($("mapExplore"), () => explore(snap));
  whenNear($("mapDrive"), () => drive(live));
  whenNear($("mapCouncil"), () => council(snap));
  whenNear($("mapTime"), () => timeMachine(snap, live));
  whenNear($("mapGuess"), () => guess(live));
})();

/* ---------- 1 EXPLORE: the real web map ---------- */
async function explore(snap) {
  const cats = snap.cats, types = snap.types;
  const webmap = new Esri.WebMap({ portalItem: { id: CONFIG.webmapId } });
  const view = new Esri.MapView({ container: "mapExplore", map: webmap, navigation: { mouseWheelZoomEnabled: false }, popup: { dockEnabled: false } });
  try { await view.when(); }
  catch (e) { $("mapExplore").innerHTML = '<div class="map-loading">The web map could not load. Check that it is shared publicly.</div>'; return; }
  await webmap.loadAll();
  const layer = webmap.allLayers.find(l => l.type === "feature" && (l.title || "").includes(CONFIG.layerTitleHint)) || webmap.allLayers.find(l => l.type === "feature");
  if (!layer) return;
  await layer.load();
  const catField = layer.fields.some(f => f.name === "LayerCategory") ? "LayerCategory" : null;

  const st = { cats: new Set(cats), out: "", type: "", from: years0(snap), to: yearsN(snap), q: "", shown: 15 };
  const fOut = $("fOut"), fType = $("fType"), fFrom = $("fFrom"), fTo = $("fTo"), fSearch = $("fSearch");
  OUT_NAMES.forEach((o, i) => fOut.add(new Option(o, i)));
  types.forEach(t => fType.add(new Option(t, t)));
  for (let y = st.from; y <= st.to; y++) { fFrom.add(new Option(y, y)); fTo.add(new Option(y, y)); }
  fFrom.value = st.from; fTo.value = st.to;

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
    w.push(`MeetingYear >= ${st.from} AND MeetingYear <= ${st.to}`);
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
      $("fSub").textContent = "mapped items match";
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
  fOut.onchange = () => { st.out = fOut.value; st.shown = 15; apply(); };
  fType.onchange = () => { st.type = fType.value; st.shown = 15; apply(); };
  fFrom.onchange = () => { st.from = +fFrom.value; if (st.from > st.to) { st.to = st.from; fTo.value = st.to; } apply(); };
  fTo.onchange = () => { st.to = +fTo.value; if (st.to < st.from) { st.from = st.to; fFrom.value = st.from; } apply(); };
  let qT; fSearch.oninput = () => { clearTimeout(qT); qT = setTimeout(() => { st.q = fSearch.value.trim(); st.shown = 15; apply(); }, 250); };
  $("more").onclick = () => { st.shown += 30; apply(); };
  $("fReset").onclick = () => {
    st.cats = new Set(cats); st.out = ""; st.type = ""; st.from = years0(snap); st.to = yearsN(snap); st.q = ""; st.shown = 15;
    fOut.value = ""; fType.value = ""; fFrom.value = st.from; fTo.value = st.to; fSearch.value = "";
    legend.querySelectorAll("input").forEach(i => i.checked = true); apply();
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
          feed.insertAdjacentHTML("afterbegin", itemHTML(h.r, false));
        }
      });
      passedEl.textContent = n;
      if (f < 1) anim = requestAnimationFrame(step);
      else { anim = null; stat.textContent = "Trip done. Click any dot for details."; go.disabled = false; }
    };
    anim = requestAnimationFrame(step);
  };
  setRoute("US 41");
}

/* ---------- 3 COUNCIL ---------- */
function council(snap) {
  const byId = Object.fromEntries(snap.rows.map(r => [r.rid, r]));
  const cases = CASES.filter(c => byId[c.rid] && byId[c.rid].lat != null);
  const { view, layer } = basicView("mapCouncil");
  let ci = 0, score = [];
  const box = $("caseBox"), prog = $("prog");
  cases.forEach(() => prog.appendChild(document.createElement("span")));
  const choices = [["Approve", 0], ["Deny", 1], ["Push it back", 2]];
  const ring = r => new Esri.Graphic({ geometry: new Esri.Point({ longitude: r.lng, latitude: r.lat }), symbol: { type: "simple-marker", color: [0, 0, 0, 0], size: 28, outline: { color: css("--sun"), width: 3 } } });
  function show() {
    [...prog.children].forEach((s, i) => s.className = i < score.length ? (score[i] ? "hit" : "miss") : (i === ci ? "now" : ""));
    layer.removeAll();
    if (ci >= cases.length) {
      const s = score.filter(Boolean).length;
      cases.forEach(c => layer.add(dot(byId[c.rid], css("--sun"), 12)));
      view.when(() => view.goTo({ center: CONFIG.center, zoom: CONFIG.zoom }));
      box.innerHTML = `<span class="eyebrow">Your result</span><div class="big">${s} / ${cases.length}</div><p>You made the same call as the Village on ${s} of ${cases.length} cases. ${s >= 4 ? "You'd fit right in on the dais." : "Plenty of residents would side with you. Public comment is open at every meeting."}</p><div class="row"><button id="again">Play again</button></div>`;
      $("again").onclick = () => { ci = 0; score = []; show(); };
      return;
    }
    const c = cases[ci], r = byId[c.rid];
    layer.addMany([ring(r), dot(r, css("--sun"), 9)]);
    view.when(() => view.goTo({ center: [r.lng, r.lat], zoom: 15 }));
    box.innerHTML = `<span class="eyebrow">Case ${ci + 1} of ${cases.length} · ${fmtDate(r.date)} · ${esc(TYPE_SHORT[r.typeName])}</span><h3>${esc(c.q)}</h3><p class="muted">${esc(c.ctx)}</p><p class="mono" style="font-size:.8rem">${esc(r.loc)}</p><div class="row" id="vote"></div>`;
    const v = $("vote");
    choices.forEach(([lab, val]) => {
      const b = document.createElement("button"); b.textContent = lab;
      b.onclick = () => {
        const hit = val === c.ans; score.push(hit);
        v.querySelectorAll("button").forEach(x => { x.disabled = true; if (x === b) x.setAttribute("aria-pressed", "true"); });
        [...prog.children][ci].className = hit ? "hit" : "miss";
        box.insertAdjacentHTML("beforeend", `<div class="verdict"><strong>${hit ? "Same call as the Village." : "The Village went another way."}</strong><span><span class="pill o${r.out}">${esc(r.status)}</span></span><span>${esc(c.then)}</span><a href="${esc(r.url)}" target="_blank" rel="noopener">Read the minutes, item ${r.no}</a></div><div class="row"><button class="primary" id="next">${ci < cases.length - 1 ? "Next case" : "See my result"}</button></div>`);
        $("next").onclick = () => { ci++; show(); };
      };
      v.appendChild(b);
    });
  }
  show();
}

/* ---------- 4 TIME ---------- */
function timeMachine(snap, live) {
  const { view, layer } = basicView("mapTime");
  const all = []; for (let y = 2015; y <= 2026; y++) all.push(y);
  const yc = Object.fromEntries(all.map(y => [y, snap.rows.filter(r => r.year === y).length]));
  const ymax = Math.max(...Object.values(yc));
  const spark = $("spark");
  all.forEach(y => { const i = document.createElement("i"); i.style.height = (yc[y] / ymax * 100) + "%"; if (!yc[y]) i.className = "gap"; i.title = `${y}: ${yc[y]}`; spark.appendChild(i); });
  $("yearline").innerHTML = all.map(y => `<span>'${String(y).slice(2)}</span>`).join("");
  const graphics = live.map(r => ({ r, g: dot(r, css("--bay"), 7) }));
  const yr = $("yr");
  function upd() {
    const v = +yr.value; let c = 0;
    layer.removeAll();
    layer.addMany(graphics.filter(x => x.r.year <= v).map(x => {
      x.g.symbol = { type: "simple-marker", color: x.r.year === v ? css("--sun") : css("--bay"), size: x.r.year === v ? 10 : 7, outline: { color: css("--surface"), width: 1 } };
      return x.g;
    }));
    all.forEach(y => { if (y <= v) c += yc[y]; });
    [...spark.children].forEach((b, i) => b.classList.toggle("on", all[i] <= v));
    $("tYear").textContent = v;
    $("tCount").textContent = `${c.toLocaleString()} agenda items through ${v} · ${yc[v]} in ${v}`;
    const lc = {}; live.filter(r => r.year === v).forEach(r => { lc[r.loc] = (lc[r.loc] || 0) + 1; });
    const top = Object.entries(lc).sort((a, b) => b[1] - a[1]).slice(0, 3);
    $("tTop").innerHTML = !yc[v] ? `<strong>No records for ${v} in this dataset.</strong> That year's minutes still need to be added.`
      : top.length ? `<span class="eyebrow">Busiest places in ${v}</span><br>${top.map(t => `${esc(t[0])} <span class="mono">(${t[1]})</span>`).join("<br>")}` : "";
  }
  yr.oninput = upd; upd();
  let playT = null; const pb = $("playBtn");
  pb.onclick = () => {
    if (playT) { clearInterval(playT); playT = null; pb.textContent = "Play the decade"; return; }
    yr.value = 2015; upd(); pb.textContent = "Pause";
    playT = setInterval(() => { if (+yr.value >= 2026) { clearInterval(playT); playT = null; pb.textContent = "Play the decade"; return; } yr.value = +yr.value + 1; upd(); }, 900);
  };
}

/* ---------- 5 GUESS ---------- */
function guess(live) {
  const { view, layer } = basicView("mapGuess", { popupEnabled: false });
  const cell = 0.006, grid = {};
  live.forEach(r => { const k = Math.floor(r.lat / cell) + "|" + Math.floor(r.lng / cell); (grid[k] = grid[k] || []).push(r); });
  const hots = Object.values(grid).map(g => {
    const lat = g.reduce((s, r) => s + r.lat, 0) / g.length, lng = g.reduce((s, r) => s + r.lng, 0) / g.length, lc = {};
    g.forEach(r => lc[r.loc] = (lc[r.loc] || 0) + 1);
    return { n: g.length, lat, lng, name: Object.entries(lc).sort((a, b) => b[1] - a[1])[0][0] };
  }).sort((a, b) => b.n - a.n);
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
    out.innerHTML = `<span class="eyebrow">${miles < .4 ? "Nailed it" : miles < 1.5 ? "Close" : "Not quite"}</span><div class="big">${miles.toFixed(1)} mi</div><p>from the busiest spot: <strong>${top.n} mapped items</strong> in one patch about 0.4 miles across, centered near <strong>${esc(top.name)}</strong>.</p><p class="muted">Next four busiest areas: ${hots.slice(1, 5).map(h => `${esc(h.name)} (${h.n})`).join(", ")}.</p>`;
  });
  $("guessReset").onclick = () => { guessed = false; layer.removeAll(); out.innerHTML = '<p class="muted">No guess yet. Tap anywhere on the map.</p>'; };
}
