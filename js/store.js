/* Shared data + filter state for Where Estero Decides.
   Loads data/projects.geojson and data/decisions.json once, joins them by decision_ids,
   and holds one filter state that the sidebar, maps, side doors and story all read.
   Plain script (no build step). Exposes window.WED.store. */
(function () {
  const TAXONOMY = {
    groups: [
      { id: "private", label: "Private development", short: "Private",
        categories: ["Residential", "Commercial/retail", "Mixed use", "Hospitality", "Medical/institutional/education", "Recreation/entertainment", "Other"] },
      { id: "village", label: "Village of Estero", short: "Village",
        categories: ["Roadway", "Intersection", "Bicycle and Pedestrian", "Landscaping and Beautification", "Parks and Recreation", "Stormwater", "Utility", "Land Acquisition", "Building Facilities"] },
      { id: "county_state", label: "Lee County & state", short: "County/state",
        categories: ["County roads", "FDOT", "Conservation 20/20", "Other county/state"] }
    ],
    status: {
      funded_this_fy: "Funded this fiscal year",
      planned_5yr: "Later in 5-year plan",
      not_in_plan: "Not in plan",
      proposed: "Proposed",
      under_construction: "Under construction",
      complete: "Complete"
    }
  };

  const listeners = {};
  const emit = (evt, payload) => (listeners[evt] || []).forEach(fn => { try { fn(payload); } catch (e) { console.error(e); } });

  const store = {
    TAXONOMY,
    ready: false,
    meta: {},
    projects: [],
    projectsById: new Map(),
    decisions: [],
    decisionsById: new Map(),
    projectsByDecision: new Map(),
    snapshot: null,        // same shape the original app.js used: { cats, types, rows }
    yearSpan: [2015, 2026],
    state: { group: null, category: null, project: null, decision: null, from: null, to: null, off: new Set() },  // off: hidden layer keys "g:<group>" / "c:<group>|<category>"

    on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); return () => { listeners[evt] = listeners[evt].filter(f => f !== fn); }; },

    /** Merge a patch into the filter state and notify listeners. Clearing a level clears the levels below it. */
    set(patch, source) {
      const s = { ...this.state, ...patch };
      if ("group" in patch && patch.group !== this.state.group) { if (!("category" in patch)) s.category = null; if (!("project" in patch)) s.project = null; }
      if ("category" in patch && patch.category !== this.state.category && !("project" in patch)) s.project = null;
      if ("project" in patch && patch.project !== this.state.project && !("decision" in patch)) s.decision = null;
      const changed = Object.keys(s).some(k => s[k] !== this.state[k]);
      if (!changed) return;
      const prev = this.state; this.state = s;
      emit("change", { state: s, prev, source });
    },

    reset(source) { this.set({ group: null, category: null, project: null, decision: null, from: this.yearSpan[0], to: this.yearSpan[1], off: new Set() }, source); },

    async load(base = "") {
      const [pj, dj] = await Promise.all([
        fetch(base + "data/projects.geojson").then(r => { if (!r.ok) throw new Error("projects " + r.status); return r.json(); }),
        fetch(base + "data/decisions.json").then(r => { if (!r.ok) throw new Error("decisions " + r.status); return r.json(); })
      ]);
      this.ingest(pj, dj);
      return this;
    },

    ingest(pj, dj) {
      // decisions (same parsing as the original app.js loadSnapshot)
      const rows = dj.rows.map(r => ({
        date: r[0], year: +r[0].slice(0, 4), catName: dj.cats[r[1]], out: r[2], typeName: dj.types[r[3]],
        title: r[4], action: r[5], loc: r[6], lat: r[7], lng: r[8], url: dj.urls[r[9]], no: r[10], status: r[11], rid: r[12]
      }));
      this.snapshot = { cats: dj.cats, types: dj.types, rows };
      this.decisions = rows;
      this.decisionsById = new Map(rows.map(d => [d.rid, d]));
      this.ridByKey = new Map(rows.map(d => [`${d.date}|${d.typeName}|${d.no}`, d.rid]));
      const ys = rows.map(r => r.year);
      this.yearSpan = [Math.min(...ys), Math.max(...ys)];

      // projects
      this.meta = pj.meta || {};
      const missing = [];
      this.projects = (pj.features || []).map(f => {
        const p = { ...f.properties, geometry: f.geometry || null };
        p.decisionIds = (p.decision_ids || []).filter(id => {
          if (this.decisionsById.has(id)) return true;
          missing.push(`${p.project_id} → ${id}`); return false;
        });
        p.decisions = p.decisionIds.map(id => this.decisionsById.get(id)).sort((a, b) => a.date.localeCompare(b.date));
        p.fyYears = (p.fiscal_years || []).map(fy => +String(fy).replace(/\D/g, "")).filter(Boolean);
        p.firstDate = p.decisions[0]?.date || null;
        p.lastDate = p.decisions[p.decisions.length - 1]?.date || null;
        p.latest = p.decisions[p.decisions.length - 1] || null;
        return p;
      });
      this.projectsById = new Map(this.projects.map(p => [p.project_id, p]));
      this.projectsByDecision = new Map();
      this.projects.forEach(p => p.decisionIds.forEach(id => {
        if (!this.projectsByDecision.has(id)) this.projectsByDecision.set(id, []);
        this.projectsByDecision.get(id).push(p);
      }));

      // sanity checks, reported once in the console
      const badGroup = this.projects.filter(p => !TAXONOMY.groups.some(g => g.id === p.sponsor_group)).map(p => p.project_id);
      const badCat = this.projects.filter(p => { const g = TAXONOMY.groups.find(g => g.id === p.sponsor_group); return g && !g.categories.includes(p.category); }).map(p => p.project_id);
      if (missing.length) console.warn(`[WED] ${missing.length} decision id(s) in projects.geojson not found in decisions.json:`, missing);
      if (badGroup.length) console.warn("[WED] Unknown sponsor_group on:", badGroup);
      if (badCat.length) console.warn("[WED] Category not in taxonomy on:", badCat);
      console.info(`[WED] ${this.projects.length} projects, ${this.decisions.length} decisions, ${this.projectsByDecision.size} decisions linked to a project${this.meta.sample ? " (sample project data)" : ""}.`);

      this.state = { ...this.state, from: this.yearSpan[0], to: this.yearSpan[1] };
      this.ready = true;
      emit("ready", this);
    },

    /* ---------- queries (all read the current state unless told otherwise) ---------- */

    yearInRange(y, st = this.state) { return y >= st.from && y <= st.to; },

    /** Project passes the time filter if any linked decision or fiscal year falls in range. Projects with neither always pass. */
    projectInTime(p, st = this.state) {
      if (!p.decisions.length && !p.fyYears.length) return true;
      return p.decisions.some(d => this.yearInRange(d.year, st)) || p.fyYears.some(y => this.yearInRange(y, st));
    },

    /** Layer switched off in the sidebar? */
    isHidden(p, st = this.state) { return !!st.off && (st.off.has("g:" + p.sponsor_group) || st.off.has("c:" + p.sponsor_group + "|" + p.category)); },

    /** Projects that match group / category / project selection, layer visibility and the time filter. */
    visibleProjects(st = this.state) {
      return this.projects.filter(p =>
        !this.isHidden(p, st) &&
        (!st.group || p.sponsor_group === st.group) &&
        (!st.category || p.category === st.category) &&
        (!st.project || p.project_id === st.project) &&
        this.projectInTime(p, st));
    },

    /** Decisions for a project, optionally limited to the current year range. */
    decisionsFor(p, { inRange = true } = {}, st = this.state) {
      const proj = typeof p === "string" ? this.projectsById.get(p) : p;
      if (!proj) return [];
      return inRange ? proj.decisions.filter(d => this.yearInRange(d.year, st)) : proj.decisions.slice();
    },

    /** Source documents for a decision (minutes today; agendas/ordinances when the data has them). */
    docsFor(d) {
      if (!d) return [];
      const docs = [];
      if (d.url) docs.push({ kind: "Minutes", url: d.url, label: `${d.typeName} minutes, ${d.date}${d.no ? `, item ${d.no}` : ""}` });
      return docs;
    },

    /** Project-level documents plus every linked decision's documents, de-duplicated. */
    docsForProject(p) {
      const proj = typeof p === "string" ? this.projectsById.get(p) : p;
      if (!proj) return [];
      const seen = new Set(), out = [];
      (proj.source_urls || []).forEach(u => { if (!seen.has(u)) { seen.add(u); out.push({ kind: "Project document", url: u, label: u.split("/").pop() }); } });
      proj.decisions.forEach(d => this.docsFor(d).forEach(doc => { if (!seen.has(doc.url)) { seen.add(doc.url); out.push(doc); } }));
      return out;
    },

    /** Counts for the sidebar: {group: n, "group|category": n}, after the time filter only. */
    counts(st = this.state) {
      const c = {};
      this.projects.filter(p => this.projectInTime(p, st)).forEach(p => {
        c[p.sponsor_group] = (c[p.sponsor_group] || 0) + 1;
        const k = p.sponsor_group + "|" + p.category; c[k] = (c[k] || 0) + 1;
      });
      return c;
    },

    /** RecordId for a live-layer row (date + board + item number is unique in the records). */
    ridFor(date, type, no) { return this.ridByKey.get(`${date}|${type}|${no}`) || null; },

    groupOf(id) { return TAXONOMY.groups.find(g => g.id === id) || null; },
    statusLabel(s) { return TAXONOMY.status[s] || s || "Unknown"; },
    projectsForDecision(rid) { return this.projectsByDecision.get(rid) || []; }
  };

  window.WED = window.WED || {};
  window.WED.store = store;
})();
