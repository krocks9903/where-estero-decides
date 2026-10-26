/* Table of contents for the Explore map.
   Sponsor group > category > project > decisions > source documents.
   Reads and writes window.WED.store; the map listens to the same store.
   Checkboxes turn a group or category layer on/off. Clicking a name selects it (filters + zooms the map).
   Exposes window.WED.toc. */
(function () {
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const fmtDate = d => { if (!d) return ""; const [y, m, dd] = d.split("-"); return `${MONTHS[+m - 1]} ${+dd}, ${y}`; };
  const BODY = { "Village Council": "Village Council", "Planning Zoning & Design Board": "Planning, Zoning & Design Board", "Public Hearing": "Village Council (public hearing)", "Workshop": "Village Council (workshop)" };
  const wrapSlash = s => esc(s).replace(/\//g, "/<wbr>");
  /** What happened, in one short line: the recorded action, else the item title. */
  const what = d => { let s = (d.action || "").replace(/^No formal action recorded\.\s*/i, "") || d.title || ""; return s.length > 150 ? s.slice(0, 150).replace(/\s+\S*$/, "") + "…" : s; };
  const kindOf = g => !g ? null : g.type === "LineString" || g.type === "MultiLineString" ? "line" : g.type === "Polygon" || g.type === "MultiPolygon" ? "poly" : "point";

  const open = new Set();        // expanded nodes the user opened by hand
  const closed = new Set();      // nodes the user collapsed by hand (wins over auto-expand)
  let root, crumbs, store, sym;

  const keyG = g => "g:" + g, keyC = (g, c) => "c:" + g + "|" + c, keyP = p => "p:" + p;
  const isOff = k => store.state.off && store.state.off.has(k);

  function isExpanded(k, auto) { return closed.has(k) ? false : (open.has(k) || auto); }

  function decisionRow(d, selected) {
    const docs = store.docsFor(d).map(doc => `<a class="doc" href="${esc(doc.url)}" target="_blank" rel="noopener">${esc(doc.kind)}${d.no ? `, item ${d.no}` : ""} <span aria-hidden="true">↗</span></a>`).join("");
    return `<li class="tn tn-d${selected ? " sel" : ""}" role="treeitem" aria-level="4" aria-selected="${selected}">
      <button class="tn-label" data-act="decision" data-id="${esc(d.rid)}">
        <span class="d-meta">${fmtDate(d.date)} · ${esc(BODY[d.typeName] || d.typeName)}</span>
        <span class="pill o${d.out}">${esc(d.status)}</span>
        <span class="d-title">${esc(what(d))}</span>
      </button>
      ${docs ? `<div class="docs" role="group" aria-label="Source documents">${docs}</div>` : ""}
    </li>`;
  }

  function projectNode(p) {
    const st = store.state, k = keyP(p.project_id), sel = st.project === p.project_id;
    const exp = isExpanded(k, sel);
    const decs = store.decisionsFor(p);
    const hiddenDecs = p.decisions.length - decs.length;
    const kind = kindOf(p.geometry);
    const projDocs = (p.source_urls || []).map(u => `<a class="doc" href="${esc(u)}" target="_blank" rel="noopener">Project document <span aria-hidden="true">↗</span></a>`).join("");
    return `<li class="tn tn-p${sel ? " sel" : ""}" role="treeitem" aria-level="3" aria-expanded="${exp}" aria-selected="${sel}" data-key="${k}">
      <div class="tn-row">
        <button class="tn-caret" data-act="toggle" data-key="${k}" aria-label="${exp ? "Collapse" : "Expand"} ${esc(p.name)}">${exp ? "▾" : "▸"}</button>
        <button class="tn-label" data-act="project" data-id="${esc(p.project_id)}">
          ${sym.swatch({ group: p.sponsor_group, category: p.category, status: p.status, kind: kind || "point", size: 15 })}
          <span class="tn-name">${wrapSlash(p.name)}</span>
        </button>
        <span class="tn-count" title="Decisions in range">${decs.length}</span>
      </div>
      ${exp ? `<div class="tn-detail">
        <p class="p-meta">${esc(store.statusLabel(p.status))}${p.stage ? ` · ${esc(p.stage)}` : ""}${p.location_name ? ` · ${esc(p.location_name)}` : ""}${p.sample ? ' <span class="sample-tag">Sample data</span>' : ""}</p>
        ${!kind ? '<p class="p-note">No single location, so it isn\'t on the map.</p>' : ""}
        ${projDocs ? `<div class="docs">${projDocs}</div>` : ""}
        <ul role="group" class="tn-list">${decs.map(d => decisionRow(d, st.decision === d.rid)).join("") || '<li class="tn-empty">No decisions in this year range.</li>'}</ul>
        ${hiddenDecs ? `<p class="p-note">${hiddenDecs} more decision${hiddenDecs > 1 ? "s" : ""} outside ${st.from}–${st.to}.</p>` : ""}
      </div>` : ""}
    </li>`;
  }

  function render() {
    if (!root) return;
    const st = store.state, counts = store.counts(), T = store.TAXONOMY;
    const inTime = store.projects.filter(p => store.projectInTime(p));
    root.innerHTML = T.groups.map(g => {
      const gk = keyG(g.id), gSel = st.group === g.id, gExp = isExpanded(gk, gSel);
      const cats = g.categories.map(c => {
        const ck = keyC(g.id, c), cSel = gSel && st.category === c, n = counts[g.id + "|" + c] || 0;
        const total = store.projects.filter(p => p.sponsor_group === g.id && p.category === c).length;
        const cExp = isExpanded(ck, cSel || (gSel && !st.category && n > 0 && n <= 3));
        const projs = inTime.filter(p => p.sponsor_group === g.id && p.category === c).sort((a, b) => a.name.localeCompare(b.name));
        return `<li class="tn tn-c${cSel ? " sel" : ""}${n ? "" : " empty"}" role="treeitem" aria-level="2" aria-expanded="${cExp}" aria-selected="${cSel}">
          <div class="tn-row">
            <button class="tn-caret" data-act="toggle" data-key="${ck}" aria-label="${cExp ? "Collapse" : "Expand"} ${esc(c)}" ${n ? "" : "disabled"}>${n ? (cExp ? "▾" : "▸") : ""}</button>
            <input type="checkbox" class="tn-vis" data-key="${ck}" aria-label="Show ${esc(c)} on map" ${isOff(ck) || isOff(gk) ? "" : "checked"} ${isOff(gk) ? "disabled" : ""}>
            <button class="tn-label" data-act="category" data-group="${g.id}" data-id="${esc(c)}">${sym.dot(c, 11)}<span class="tn-name">${wrapSlash(c)}</span></button>
            <span class="tn-count">${n}${total && n !== total ? `<small>/${total}</small>` : ""}</span>
          </div>
          ${cExp && n ? `<ul role="group" class="tn-list">${projs.map(projectNode).join("")}</ul>` : ""}
          ${!total ? '<p class="tn-empty">No projects in the data yet.</p>' : ""}
        </li>`;
      }).join("");
      return `<li class="tn tn-g${gSel ? " sel" : ""}" role="treeitem" aria-level="1" aria-expanded="${gExp}" aria-selected="${gSel}">
        <div class="tn-row">
          <button class="tn-caret" data-act="toggle" data-key="${gk}" aria-label="${gExp ? "Collapse" : "Expand"} ${esc(g.label)}">${gExp ? "▾" : "▸"}</button>
          <input type="checkbox" class="tn-vis" data-key="${gk}" aria-label="Show ${esc(g.label)} on map" ${isOff(gk) ? "" : "checked"}>
          <button class="tn-label" data-act="group" data-id="${g.id}">${sym.swatch({ group: g.id, category: "Other", status: g.id === "private" ? "complete" : "funded_this_fy", size: 14 })}<span class="tn-name">${esc(g.label)}</span></button>
          <span class="tn-count">${counts[g.id] || 0}</span>
        </div>
        ${gExp ? `<ul role="group" class="tn-list">${cats}</ul>` : ""}
      </li>`;
    }).join("");
    renderCrumbs();
  }

  function renderCrumbs() {
    if (!crumbs) return;
    const st = store.state, parts = [`<button data-act="all">All projects</button>`];
    const g = st.group && store.groupOf(st.group);
    if (g) parts.push(`<button data-act="group" data-id="${g.id}">${esc(g.short)}</button>`);
    if (st.category) parts.push(`<button data-act="category" data-group="${st.group}" data-id="${esc(st.category)}">${esc(st.category)}</button>`);
    const p = st.project && store.projectsById.get(st.project);
    if (p) parts.push(`<span aria-current="true">${esc(p.name)}</span>`);
    const n = store.visibleProjects().length;
    crumbs.innerHTML = `<nav aria-label="Contents path">${parts.join('<span class="sep" aria-hidden="true">›</span>')}</nav><span class="crumb-count">${n} project${n === 1 ? "" : "s"} · ${st.from}–${st.to}</span>`;
  }

  /** Select a node. Clicking the current selection steps back up one level. */
  function select(act, el) {
    const st = store.state, id = el.dataset.id;
    if (act === "all") return store.set({ group: null }, "toc");
    if (act === "group") return store.set(st.group === id && !st.category && !st.project ? { group: null } : { group: id, category: null, project: null }, "toc");
    if (act === "category") {
      const g = el.dataset.group;
      return store.set(st.group === g && st.category === id && !st.project ? { category: null } : { group: g, category: id, project: null }, "toc");
    }
    if (act === "project") {
      const p = store.projectsById.get(id);
      return store.set(st.project === id && !st.decision ? { project: null } : { group: p.sponsor_group, category: p.category, project: id, decision: null }, "toc");
    }
    if (act === "decision") return store.set({ decision: st.decision === id ? null : id }, "toc");
  }

  function onClick(e) {
    const b = e.target.closest("button[data-act]"); if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === "toggle") {
      const k = b.dataset.key, li = b.closest("[aria-expanded]"), now = li && li.getAttribute("aria-expanded") === "true";
      if (now) { open.delete(k); closed.add(k); } else { closed.delete(k); open.add(k); }
      return render();
    }
    select(act, b);
  }

  function onVis(e) {
    const cb = e.target.closest("input.tn-vis"); if (!cb) return;
    const off = new Set(store.state.off || []);
    cb.checked ? off.delete(cb.dataset.key) : off.add(cb.dataset.key);
    store.set({ off }, "toc");
  }

  function init(opts) {
    store = window.WED.store; sym = window.WED.sym;
    root = document.getElementById(opts.tree); crumbs = document.getElementById(opts.crumbs);
    if (!store.state.off) store.state = { ...store.state, off: new Set() };
    root.addEventListener("click", onClick);
    root.addEventListener("change", onVis);
    crumbs && crumbs.addEventListener("click", e => { const b = e.target.closest("button[data-act]"); if (b) select(b.dataset.act, b); });
    store.on("change", ({ state, prev }) => {
      // a fresh selection re-opens its branch even if the user collapsed it earlier
      if (state.group !== prev.group && state.group) closed.delete(keyG(state.group));
      if (state.category !== prev.category && state.category) closed.delete(keyC(state.group, state.category));
      if (state.project !== prev.project && state.project) closed.delete(keyP(state.project));
      render();
      if (state.project && state.project !== prev.project) {
        const node = root.querySelector(`[data-key="${keyP(state.project).replace(/"/g, '\\"')}"]`);
        node && node.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      }
    });
    // mobile drawer toggle
    const tog = opts.toggle && document.getElementById(opts.toggle), panel = opts.panel && document.getElementById(opts.panel);
    if (tog && panel) tog.addEventListener("click", () => { const o = panel.classList.toggle("toc-open"); tog.setAttribute("aria-expanded", o); tog.textContent = o ? "Hide contents" : "Browse contents"; });
    render();
  }

  window.WED = window.WED || {};
  window.WED.toc = { init, render, kindOf };
})();
