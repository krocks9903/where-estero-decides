/* "Current story": a plain, source-first summary of the data, organized by the same hierarchy
   as the contents (sponsor group > category > project > decisions > sources).

   HOOK FOR ASK EAGLEGIS
   ---------------------
   The page gets its story from one provider function. Today it's generateFromData(), which builds the
   story from data/projects.geojson + data/decisions.json on load. To let the chatbot write it instead:

     WED.story.setProvider(async (ctx) => {
       // ctx = { projects, state, meta, store }   (projects already filtered by year range and layers)
       const res = await fetch("https://<eaglegis-endpoint>/story", { method: "POST", body: JSON.stringify(...) });
       return await res.json();   // must match the STORY MODEL below
     });

   If a custom provider throws or returns nothing, the page falls back to generateFromData().

   STORY MODEL
   { generatedBy: string, updated: "YYYY-MM-DD", latestDecision: "YYYY-MM-DD", range: [from, to], sample: bool,
     intro: string,
     groups: [{ id, label, summary,
       categories: [{ name, summary,
         projects: [{ id, name, group, category, status, statusLabel, summary,
           sources: [{ label, url }], moreSources: number }] }] }] }
   Every summary is plain text. Every claim about a decision should come with a source in `sources`.

   Exposes window.WED.story. */
(function () {
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const fmtDate = d => { if (!d) return ""; const [y, m, dd] = d.split("-"); return `${MONTHS[+m - 1]} ${+dd}, ${y}`; };
  const BODY = { "Village Council": "the Village Council", "Planning Zoning & Design Board": "the Planning, Zoning & Design Board", "Public Hearing": "the Village Council", "Workshop": "the Village Council" };
  const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
  const listJoin = a => a.length <= 1 ? (a[0] || "") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
  const OUTCOME = { Approved: "approved by", Denied: "denied by", Failed: "did not pass at", Continued: "continued by", Tabled: "tabled by", "No Action": "discussed with no formal action at", Withdrawn: "withdrawn at", Cancelled: "cancelled at", Unknown: "recorded with no clear outcome at" };

  /** Default provider: builds the story model straight from the data files. No interpretation beyond counting and dates. */
  function generateFromData({ projects, state, meta, store }) {
    const latestDecision = store.decisions.reduce((m, d) => d.date > m ? d.date : m, "");
    const groups = store.TAXONOMY.groups.map(g => {
      const gp = projects.filter(p => p.sponsor_group === g.id);
      if (!gp.length) return null;
      const categories = g.categories.map(c => {
        const cp = gp.filter(p => p.category === c).sort((a, b) => (b.lastDate || "").localeCompare(a.lastDate || ""));
        if (!cp.length) return null;
        return {
          name: c,
          summary: plural(cp.length, "project") + ".",
          projects: cp.map(p => {
            const decs = store.decisionsFor(p);
            const bodies = [...new Set(decs.map(d => BODY[d.typeName] || d.typeName))];
            const last = decs[decs.length - 1];
            let summary;
            if (!decs.length) summary = `No decisions recorded between ${state.from} and ${state.to}.`;
            else {
              summary = `${plural(decs.length, "decision")} ${decs.length === 1 ? `on ${fmtDate(decs[0].date)}` : `from ${fmtDate(decs[0].date)} to ${fmtDate(last.date)}`}, by ${listJoin(bodies)}. ` +
                `Most recent: ${fmtDate(last.date)}, ${OUTCOME[last.status] || last.status.toLowerCase() + " at"} ${BODY[last.typeName] || last.typeName}.`;
            }
            const recent = decs.slice().reverse();
            const sources = recent.slice(0, 3).flatMap(d => store.docsFor(d).map(doc => ({ label: `${doc.kind}, ${fmtDate(d.date)}${d.no ? `, item ${d.no}` : ""}`, url: doc.url })))
              .concat((p.source_urls || []).map(u => ({ label: "Project document", url: u })));
            return { id: p.project_id, name: p.name, group: g.id, category: c, status: p.status, statusLabel: store.statusLabel(p.status),
              stage: p.stage, sample: !!p.sample, summary, sources, moreSources: Math.max(0, recent.length - 3) };
          })
        };
      }).filter(Boolean);
      const nDec = gp.reduce((s, p) => s + store.decisionsFor(p).length, 0);
      return { id: g.id, label: g.label,
        summary: `${plural(gp.length, "project")} in ${plural(categories.length, "category", "categories")}, with ${plural(nDec, "linked decision")} between ${state.from} and ${state.to}.`,
        categories };
    }).filter(Boolean);
    const nDec = projects.reduce((s, p) => s + store.decisionsFor(p).length, 0);
    return {
      generatedBy: "Generated from the data files",
      updated: meta.updated || null, latestDecision, range: [state.from, state.to], sample: !!meta.sample,
      intro: projects.length
        ? `${plural(projects.length, "project")} and ${plural(nDec, "linked decision")} between ${state.from} and ${state.to}, grouped by who sponsors each project.`
        : `No projects match the current year range and layers.`,
      groups
    };
  }

  let provider = generateFromData, root, store, sym, seq = 0, timer;

  function render(model) {
    const m = model;
    const head = `<header class="story-head">
      <p class="story-meta">${esc(m.generatedBy)} · Data last updated ${esc(fmtDate(m.updated) || "unknown")} · Latest decision in the records ${esc(fmtDate(m.latestDecision))} · Showing ${m.range[0]}–${m.range[1]}${m.sample ? ' · <span class="sample-tag">Sample project data</span>' : ""}</p>
      <p class="story-intro">${esc(m.intro)}</p>
    </header>`;
    const body = m.groups.map(g => `<section class="story-g">
      <h3>${sym.swatch({ group: g.id, category: "Other", status: g.id === "private" ? "complete" : "funded_this_fy", size: 16 })} ${esc(g.label)}</h3>
      <p class="story-sum">${esc(g.summary)}</p>
      ${g.categories.map(c => `<div class="story-c">
        <h4>${sym.dot(c.name, 11)} ${esc(c.name)} <span class="muted">· ${esc(c.summary)}</span></h4>
        <ul class="story-p">${c.projects.map(p => `<li>
          <div class="sp-head">${sym.swatch({ group: p.group, category: p.category, status: p.status, size: 14 })}
            <button class="sp-name" data-open-project="${esc(p.id)}">${esc(p.name)}</button>
            <span class="sp-status">${esc(p.statusLabel)}${p.stage ? ` · ${esc(p.stage)}` : ""}</span></div>
          <p>${esc(p.summary)}</p>
          ${p.sources.length ? `<p class="sp-src"><span class="muted">Sources:</span> ${p.sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>`).join(" · ")}${p.moreSources ? ` · <button class="linkish" data-open-project="${esc(p.id)}">${p.moreSources} more in the contents</button>` : ""}</p>` : ""}
        </li>`).join("")}</ul>
      </div>`).join("")}
    </section>`).join("");
    root.innerHTML = head + (body || "");
  }

  async function refresh() {
    if (!root || !store.ready) return;
    const my = ++seq, state = { ...store.state, project: null, decision: null };
    const ctx = { projects: store.visibleProjects(state), state, meta: store.meta, store };
    let model = null;
    try { model = await provider(ctx); } catch (e) { console.warn("[WED] Story provider failed, using data-generated story", e); }
    if (!model || !Array.isArray(model.groups)) model = generateFromData(ctx);
    if (my === seq) render(model);
  }

  function init(id) {
    store = window.WED.store; sym = window.WED.sym; root = document.getElementById(id);
    if (!root) return;
    store.on("change", ({ state, prev }) => {
      if (state.from !== prev.from || state.to !== prev.to || state.off !== prev.off || state.group !== prev.group || state.category !== prev.category) {
        clearTimeout(timer); timer = setTimeout(refresh, 120);
      }
    });
    refresh();
  }

  window.WED = window.WED || {};
  window.WED.story = { init, refresh, generateFromData, setProvider(fn) { provider = typeof fn === "function" ? fn : generateFromData; return refresh(); } };
})();
