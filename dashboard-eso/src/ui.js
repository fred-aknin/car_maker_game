/*
 * Dashboard ESO — interface (DOM) et connexion Zoho CRM.
 * Dépend de `ESO` (core.js), inliné avant ce script dans la page publiée.
 */
(function () {
  "use strict";
  const E = window.ESO;
  const { fmt, MS_DAY } = E;

  /* ------------------------------------------------------------------ */
  /* État                                                                 */
  /* ------------------------------------------------------------------ */
  const state = {
    view: "cockpit",
    days: 30,
    owner: "all",
    pipeline: "Recrutement",
    promo: "all",
    leadFilter: { q: "", status: "all", source: "all", sort: "modified", dir: "desc" },
    callDays: 30,
    weekAnchor: Date.now(),
    data: { leads: [], deals: [], tasks: [], calls: [], events: [] },
    loaded: false,
    loading: false,
    demo: false,
    mcp: null,          // namespace de la capacité
    sample: null,       // capacité « demander à Claude »
    connected: false,   // le connecteur Zoho CRM répond
    write: { update: null, create: null, convert: null, note: null, any: false },
    schemas: {},        // inputSchema par outil d'écriture
    errors: {},         // erreurs par module
    pageError: null,    // erreur globale {code, message}
    updatedAt: null,
    drawer: null,       // {module, id}
    toolNames: [],
  };

  const $ = (sel, root) => (root || document).querySelector(sel);
  const h = (tag, attrs, ...children) => {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat(Infinity)) {
      if (c === null || c === undefined || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  };
  const svgEl = (tag, attrs, ...children) => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    for (const c of children.flat(Infinity)) if (c !== null && c !== undefined) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return el;
  };

  const ICONS = {
    cockpit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 13a9 9 0 1 1 18 0"/><path d="M12 13l4-4"/><path d="M5 20h14"/></svg>',
    leads: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M17 8h4M19 6v4"/></svg>',
    pipeline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="6" rx="1"/></svg>',
    calls: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
    planning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/></svg>',
    arrowL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 5l-7 7 7 7"/></svg>',
    arrowR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l5 5L20 7"/></svg>',
  };
  const icon = (name) => { const s = h("span", { class: "ico", html: ICONS[name] }); s.style.display = "contents"; return s; };

  const VIEWS = [
    { id: "cockpit", label: "Cockpit" },
    { id: "leads", label: "Prospects" },
    { id: "pipeline", label: "Pipeline" },
    { id: "calls", label: "Appels" },
    { id: "planning", label: "Planning" },
  ];

  /* ------------------------------------------------------------------ */
  /* Préférences locales (confort par utilisateur)                       */
  /* ------------------------------------------------------------------ */
  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem("eso-dashboard-prefs") || "{}");
      if (VIEWS.some((v) => v.id === p.view)) state.view = p.view;
      if ([7, 30, 90].includes(p.days)) state.days = p.days;
      if (typeof p.owner === "string") state.owner = p.owner;
      if (typeof p.pipeline === "string") state.pipeline = p.pipeline;
    } catch (e) { /* stockage indisponible : on garde les valeurs par défaut */ }
    const hash = (location.hash || "").slice(1);
    if (VIEWS.some((v) => v.id === hash)) state.view = hash;
  }
  function savePrefs() {
    try { localStorage.setItem("eso-dashboard-prefs", JSON.stringify({ view: state.view, days: state.days, owner: state.owner, pipeline: state.pipeline })); } catch (e) { /* ignoré */ }
  }

  /* ------------------------------------------------------------------ */
  /* Toasts                                                               */
  /* ------------------------------------------------------------------ */
  function toast(msg, kind) {
    const box = $("#toasts");
    const t = h("div", { class: `toast ${kind || ""}`, role: "status" }, msg);
    box.append(t);
    setTimeout(() => t.remove(), kind === "crit" ? 7000 : 3500);
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toast("Copié dans le presse-papiers", "good"); return true; }
    catch (e) {
      const ta = h("textarea", { class: "input", readonly: true }, text);
      document.body.append(ta); ta.select();
      toast("Sélectionnez le texte et copiez-le (Ctrl/Cmd+C)");
      setTimeout(() => ta.remove(), 8000);
      return false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Connexion Zoho CRM                                                   */
  /* ------------------------------------------------------------------ */
  const ERROR_COPY = {
    needs_reauth: { title: "Reconnectez Zoho CRM", text: "La connexion à Zoho CRM a expiré. Reconnectez le connecteur « Zoho CRM » dans claude.ai → Paramètres → Connecteurs, puis actualisez." },
    server_not_connected: { title: "Connecteur Zoho CRM absent", text: "Ajoutez le connecteur « Zoho CRM » dans claude.ai → Paramètres → Connecteurs pour afficher les données réelles." },
    selection_required: { title: "Choisissez un connecteur", text: "Plusieurs connecteurs s'appellent « Zoho CRM ». Choisissez celui à utiliser dans l'invite de Claude, puis actualisez." },
    not_in_manifest: { title: "Accès refusé pour cette page", text: "Le connecteur Zoho CRM a été refusé pour ce tableau de bord. Autorisez-le dans le menu Permissions de l'artefact." },
    blocked_by_policy: { title: "Bloqué par la politique de l'organisation", text: "Un administrateur a bloqué cet outil Zoho CRM pour votre compte." },
    approval_required: { title: "Autorisation requise", text: "Claude attend votre accord pour interroger Zoho CRM. Cliquez sur « Autoriser et réessayer »." },
    server_unavailable: { title: "Zoho CRM indisponible", text: "Zoho CRM ne répond pas pour le moment. Nouvelle tentative dans quelques secondes." },
    tool_error: { title: "Zoho CRM a renvoyé une erreur", text: "" },
    not_granted: { title: "Connecteurs non accordés", text: "Cette vue n'a pas accès aux connecteurs. Ouvrez le tableau de bord depuis Claude pour afficher les données réelles." },
    capability_disabled: { title: "Connecteurs indisponibles dans cette vue", text: "Ouvrez le tableau de bord dans l'application Claude pour afficher les données réelles." },
  };
  function errorCopy(err) {
    const code = (err && err.code) || "upstream_error";
    const c = ERROR_COPY[code] || { title: "Erreur de connexion", text: "" };
    const detail = err && err.message ? String(err.message).slice(0, 300) : "";
    return { code, title: c.title, text: c.text || detail, detail };
  }

  async function callZoho(tool, input, opts) {
    const res = await state.mcp.callTool(E.SERVER, tool, input, opts);
    return res && res.payload !== undefined ? res.payload : res;
  }

  /** Charge toutes les pages d'un module (budget de pages borné). */
  async function fetchModule(module, refresh) {
    const out = [];
    const budget = E.PAGE_BUDGET[module];
    const norm = E.NORMALIZERS[module];
    for (let page = 1; page <= budget; page++) {
      let payload;
      try {
        payload = await callZoho("ZohoCRM_getRecords", E.recordsArgs(module, page), { cache: { staleTime: 60000, refresh: Boolean(refresh) } });
      } catch (err) {
        if (err && err.retryable && page === 1 && !refresh) {
          await new Promise((r) => setTimeout(r, Math.min(err.retryAfterMs || 1500, 8000) + Math.random() * 500));
          payload = await callZoho("ZohoCRM_getRecords", E.recordsArgs(module, page), { cache: { staleTime: 60000 } });
        } else throw err;
      }
      const { records, more } = E.unwrapRecords(payload);
      for (const r of records) out.push(norm(r));
      if (!more || records.length === 0) break;
    }
    return out;
  }

  async function loadAll(refresh) {
    if (!state.mcp || state.demo) return;
    state.loading = true; state.pageError = null; render();
    const modules = ["Leads", "Deals", "Tasks", "Calls", "Events"];
    const results = await Promise.allSettled(modules.map((m) => fetchModule(m, refresh)));
    const errors = {};
    let okCount = 0;
    results.forEach((r, i) => {
      const key = modules[i].toLowerCase();
      if (r.status === "fulfilled") { state.data[key] = r.value; okCount++; }
      else errors[modules[i]] = r.reason || { code: "upstream_error", message: "inconnue" };
    });
    state.errors = errors;
    const codes = new Set(Object.values(errors).map((e) => e.code));
    if (okCount === 0 && codes.size === 1) state.pageError = Object.values(errors)[0];
    if (okCount > 0) { state.loaded = true; state.updatedAt = Date.now(); state.connected = true; }
    state.loading = false;
    render();
  }

  /** Découvre les outils (lecture / écriture) réellement exposés par le connecteur. */
  async function discoverTools() {
    try {
      const lt = await state.mcp.listTools(E.SERVER);
      const srv = (lt.servers || []).find((s) => s.server === E.SERVER);
      state.toolNames = srv ? srv.tools.map((t) => t.name) : [];
      state.serverListed = Boolean(srv);
      state.authStatus = srv ? srv.authStatus : "absent";
    } catch (e) { state.toolNames = []; state.serverListed = false; }
    state.write = E.pickWriteTools(state.toolNames);
  }
  async function ensureSchema(tool) {
    if (!tool || tool in state.schemas) return state.schemas[tool] || null;
    try { const d = await state.mcp.describeTool(E.SERVER, tool); state.schemas[tool] = (d && d.inputSchema) || null; }
    catch (e) { state.schemas[tool] = null; }
    return state.schemas[tool];
  }

  /** Exécute une écriture : {kind: update|create|note, module, id?, record}. */
  async function writeZoho(kind, op) {
    const tool = state.write[kind] || (kind === "note" ? state.write.create : null);
    if (!tool) throw { code: "read_only", message: "Aucun outil d'écriture disponible" };
    const schema = await ensureSchema(tool);
    const module = kind === "note" && !state.write.note ? "Notes" : op.module;
    const args = E.buildWriteArgs(schema, { module, id: op.id, record: op.record });
    const payload = await callZoho(tool, args, { cache: false });
    // Zoho répond {data:[{code:"SUCCESS"|..., details:{id}}]}
    const inner = payload && payload.data && !Array.isArray(payload.data) ? payload.data : payload;
    const rows = inner && Array.isArray(inner.data) ? inner.data : [];
    const bad = rows.find((r) => r.code && r.code !== "SUCCESS");
    if (bad) throw { code: "tool_error", message: `${bad.code} : ${bad.message || JSON.stringify(bad.details || {})}` };
    const id = rows[0] && rows[0].details && rows[0].details.id;
    try { await state.mcp.invalidate(E.SERVER, "ZohoCRM_getRecords"); } catch (e) { /* rien en cache */ }
    return { id: id || op.id };
  }

  async function boot() {
    loadPrefs();
    render();
    if (!window.claude || typeof window.claude.use !== "function") { enterDemo("Ouvert hors de Claude"); return; }
    const [mcp, sample] = await Promise.all([window.claude.use("mcp"), window.claude.use("sample")]);
    state.sample = sample;
    if (!mcp) { enterDemo("Connecteurs indisponibles dans cette vue"); return; }
    state.mcp = mcp;
    await discoverTools();
    if (state.serverListed === false) { state.pageError = { code: "server_not_connected" }; state.loaded = false; render(); return; }
    await loadAll(false);
    // Rafraîchissement périodique (page visible uniquement)
    setInterval(() => { if (document.visibilityState === "visible" && !state.demo && !state.loading) loadAll(true); }, 5 * 60 * 1000);
  }

  function enterDemo(reason) {
    state.demo = true; state.demoReason = reason;
    state.data = E.demoData(Date.now());
    state.loaded = true; state.updatedAt = Date.now();
    state.write = { update: "demo", create: "demo", convert: "demo", note: "demo", any: true };
    render();
  }
  function exitDemo() {
    state.demo = false; state.data = { leads: [], deals: [], tasks: [], calls: [], events: [] }; state.loaded = false;
    state.write = E.pickWriteTools(state.toolNames);
    if (state.mcp) loadAll(true); else render();
  }

  /* ------------------------------------------------------------------ */
  /* Rendu principal                                                      */
  /* ------------------------------------------------------------------ */
  function render() {
    renderNav();
    const main = $("#main");
    main.replaceChildren();
    main.append(renderTopbar());
    const banner = renderBanner();
    if (banner) main.append(banner);
    if (!state.loaded) { main.append(renderSkeleton()); return; }
    const fn = { cockpit: renderCockpit, leads: renderLeads, pipeline: renderPipeline, calls: renderCalls, planning: renderPlanning }[state.view];
    main.append(fn());
    renderDrawer();
  }

  function renderNav() {
    const nav = $("#nav");
    nav.replaceChildren();
    nav.append(h("div", { class: "brand" },
      h("div", { class: "brand-mark" }, "ESO"),
      h("div", null, h("div", { class: "brand-title" }, "Dashboard ESO"), h("div", { class: "brand-sub" }, "Recrutement des étudiants"))));
    const counts = navCounts();
    for (const v of VIEWS) {
      nav.append(h("button", {
        class: "nav-btn", "aria-current": state.view === v.id ? "page" : null,
        onclick: () => { state.view = v.id; state.drawer = null; savePrefs(); try { history.replaceState(null, "", "#" + v.id); } catch (e) { /* ignoré */ } render(); },
      }, icon(v.id), v.label, counts[v.id] ? h("span", { class: `badge ${counts[v.id].kind}` }, counts[v.id].n) : null));
    }
    const foot = h("div", { class: "nav-foot" });
    foot.append(h("span", null, state.demo ? "Données de démonstration" : state.connected ? "Connecté à Zoho CRM" : "Non connecté"));
    if (state.updatedAt) foot.append(h("span", null, `Actualisé ${fmt.time(state.updatedAt)}`));
    foot.append(h("span", null, state.write.any ? (state.demo ? "Écriture simulée" : "Écriture activée") : "Lecture seule"));
    nav.append(foot);
  }
  function navCounts() {
    if (!state.loaded) return {};
    const now = Date.now();
    const d = filteredData();
    const todo = d.leads.filter(E.isTodoLead).length;
    const ag = E.todayAgenda(d, now);
    const overdueCalls = d.calls.filter((c) => c.status === "Scheduled" && c.start !== null && c.start < now).length;
    return {
      leads: todo ? { n: todo, kind: "accent" } : null,
      planning: ag.overdue.length ? { n: ag.overdue.length, kind: "crit" } : null,
      calls: overdueCalls ? { n: overdueCalls, kind: "warn" } : null,
    };
  }

  function filteredData() {
    const o = state.owner;
    return {
      leads: E.byOwner(state.data.leads, o), deals: E.byOwner(state.data.deals, o),
      tasks: E.byOwner(state.data.tasks, o), calls: E.byOwner(state.data.calls, o), events: E.byOwner(state.data.events, o),
    };
  }

  function renderTopbar() {
    const title = { cockpit: "Cockpit", leads: "Prospects", pipeline: "Pipeline de recrutement", calls: "Appels", planning: "Planning" }[state.view];
    const bar = h("div", { class: "topbar" });
    bar.append(h("div", null, h("h1", null, title), h("div", { class: "sub" }, fmt.dateFull(Date.now()))));
    const ownersList = E.owners(state.data);
    const ownerSel = h("select", { class: "select", id: "owner-select", "aria-label": "Responsable", onchange: (e) => { state.owner = e.target.value; savePrefs(); render(); } },
      h("option", { value: "all" }, "Toute l'équipe"),
      ownersList.map((o) => h("option", { value: o.id, selected: state.owner === o.id ? true : null }, o.name)));
    const period = h("div", { class: "seg", role: "group", "aria-label": "Période" },
      [7, 30, 90].map((d) => h("button", { "aria-pressed": state.days === d ? "true" : "false", onclick: () => { state.days = d; savePrefs(); render(); } }, `${d} j`)));
    const refresh = h("button", { class: "btn", id: "refresh-btn", disabled: state.loading || state.demo ? true : null, onclick: () => loadAll(true) },
      h("span", { class: state.loading ? "spin" : "", style: { display: "inline-flex" }, html: ICONS.refresh }), state.loading ? "Chargement…" : "Actualiser");
    bar.append(h("div", { class: "toolbar" }, ownerSel, period, refresh));
    return bar;
  }

  function renderBanner() {
    if (state.demo) {
      return h("div", { class: "banner warn" }, h("div", { class: "grow" },
        h("strong", null, "Données de démonstration (fictives)"),
        h("span", null, `${state.demoReason || ""}. Ouvrez ce tableau de bord depuis Claude avec le connecteur Zoho CRM pour voir les prospects réels.`)),
        state.mcp ? h("button", { class: "btn sm", onclick: exitDemo }, "Revenir aux données Zoho") : null);
    }
    if (state.pageError) {
      const c = errorCopy(state.pageError);
      const b = h("div", { class: `banner ${c.code === "approval_required" ? "warn" : "crit"}` }, h("div", { class: "grow" }, h("strong", null, c.title), h("span", null, c.text || c.detail)));
      const actions = h("div", { class: "actions" });
      actions.append(h("button", { class: "btn sm", onclick: () => loadAll(true) }, c.code === "approval_required" ? "Autoriser et réessayer" : "Réessayer"));
      actions.append(h("button", { class: "btn sm ghost", onclick: () => enterDemo("Mode démonstration choisi") }, "Voir la démonstration"));
      b.append(actions);
      return b;
    }
    const errs = Object.entries(state.errors);
    if (errs.length) {
      const names = { Leads: "prospects", Deals: "affaires", Tasks: "tâches", Calls: "appels", Events: "réunions" };
      return h("div", { class: "banner warn" }, h("div", { class: "grow" },
        h("strong", null, "Certaines données n'ont pas pu être chargées"),
        h("span", null, errs.map(([m, e]) => `${names[m]} : ${errorCopy(e).title}`).join(" · "))),
        h("button", { class: "btn sm", onclick: () => loadAll(true) }, "Réessayer"));
    }
    if (state.loaded && !state.write.any) {
      return h("div", { class: "banner" }, h("div", { class: "grow" },
        h("strong", null, "Lecture seule"),
        h("span", null, "Le connecteur Zoho CRM n'expose que des outils de lecture. Chaque action propose une instruction à coller dans Claude, qui effectuera la modification. Pour une écriture directe, ajoutez les outils de création et de mise à jour d'enregistrements au serveur MCP « Zoho CRM » (voir la documentation).")));
    }
    return null;
  }

  function renderSkeleton() {
    const wrap = h("div", { class: "stack" });
    wrap.append(h("div", { class: "grid-kpi" }, [1, 2, 3, 4, 5, 6].map(() => h("div", { class: "card kpi" }, h("div", { class: "skeleton", style: { width: "50%" } }), h("div", { class: "skeleton", style: { height: "28px", width: "35%" } }), h("div", { class: "skeleton", style: { width: "70%" } })))));
    wrap.append(h("div", { class: "grid-2" }, [1, 2].map(() => h("div", { class: "card" }, h("div", { class: "skeleton", style: { width: "40%" } }), h("div", { class: "skeleton", style: { height: "140px", marginTop: "12px" } })))));
    wrap.append(h("p", { class: "empty" }, state.loading ? "Chargement des données Zoho CRM…" : state.pageError ? "" : "En attente du connecteur Zoho CRM…"));
    return wrap;
  }

  /* ------------------------------------------------------------------ */
  /* Composants                                                           */
  /* ------------------------------------------------------------------ */
  function statusBadge(status) {
    const k = E.LEAD_TODO.includes(status) ? "accent" : ["Qualifié", "A convertir"].includes(status) ? "good" : ["Pré-qualifié", "Contacté"].includes(status) ? "info" : E.LEAD_STATUS_DEAD.includes(status) ? "crit" : "";
    return h("span", { class: `badge ${k}` }, status);
  }
  function stageBadge(stage) {
    const k = E.isWon({ stage }) ? "good" : E.isLost({ stage }) ? "crit" : E.DEAL_DEPOSIT_PENDING.includes(stage) ? "gold" : "accent";
    return h("span", { class: `badge ${k}` }, stage);
  }
  function avatar(name) { return h("span", { class: "avatar", title: name || "" }, fmt.initials(name)); }

  function kpiCard(o) {
    const c = h("div", { class: `card kpi ${o.kind || ""}` });
    c.append(h("div", { class: "label" }, o.label));
    c.append(h("div", { class: `value ${o.gold ? "gold" : ""}` }, o.value));
    const foot = h("div", { class: "foot" });
    if (o.delta !== undefined && o.delta !== null) foot.append(h("span", { class: `badge ${o.delta > 0 ? (o.invert ? "crit" : "good") : o.delta < 0 ? (o.invert ? "good" : "crit") : ""}` }, fmt.delta(o.delta)));
    else if (o.delta === null) foot.append(h("span", { class: "badge" }, "nouveau"));
    if (o.foot) foot.append(h("span", null, o.foot));
    c.append(foot);
    return c;
  }

  function hbars(rows, opts) {
    const max = Math.max(1, ...rows.map((r) => r.value));
    const wrap = h("div", null);
    for (const r of rows) {
      wrap.append(h("div", { class: "hbar" },
        h("span", { class: "ellipsis", title: r.label }, r.label),
        h("div", { class: "track" }, h("div", { class: `fill ${r.kind || (opts && opts.kind) || ""}`, style: { width: `${Math.round((r.value / max) * 100)}%` } })),
        h("span", { class: "num small" }, r.display || fmt.int(r.value))));
    }
    return wrap;
  }

  /** Graphique en barres hebdomadaire (SVG à l'échelle). */
  function weekBars(buckets) {
    const W = 600, H = 170, padL = 34, padB = 26, padT = 12, padR = 8;
    const max = Math.max(1, ...buckets.map((b) => b.count));
    const step = niceStep(max);
    const top = Math.ceil(max / step) * step;
    const svg = svgEl("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Prospects créés par semaine" });
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const y = (v) => padT + innerH - (v / top) * innerH;
    for (let v = 0; v <= top; v += step) {
      svg.append(svgEl("line", { class: "axis", x1: padL, x2: W - padR, y1: y(v), y2: y(v), "stroke-width": 1 }));
      svg.append(svgEl("text", { x: padL - 6, y: y(v) + 3, "text-anchor": "end" }, v));
    }
    const bw = innerW / buckets.length;
    buckets.forEach((b, i) => {
      const x = padL + i * bw + bw * 0.15;
      const w = bw * 0.7;
      svg.append(svgEl("rect", { class: "bar soft", x, y: y(b.count), width: w, height: Math.max(0, innerH + padT - y(b.count)), rx: 3 }));
      svg.append(svgEl("rect", { class: "bar", x, y: y(b.qualified), width: w, height: Math.max(0, innerH + padT - y(b.qualified)), rx: 3 }));
      const last = i === buckets.length - 1;
      if (b.count) svg.append(svgEl("text", { x: x + w / 2, y: y(b.count) - 4, "text-anchor": "middle", class: last ? "label-strong" : "" }, b.count));
      if (i % 2 === buckets.length % 2 || buckets.length <= 8) svg.append(svgEl("text", { x: x + w / 2, y: H - 8, "text-anchor": "middle" }, fmt.date(b.start)));
    });
    return svg;
  }
  function niceStep(max) {
    const raw = max / 4;
    const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
    for (const m of [1, 2, 5, 10]) if (raw <= m * p) return m * p;
    return 10 * p;
  }

  /* ------------------------------------------------------------------ */
  /* Vue Cockpit                                                          */
  /* ------------------------------------------------------------------ */
  function renderCockpit() {
    const now = Date.now();
    const d = filteredData();
    const k = E.computeKpis(state.data, { now, days: state.days, owner: state.owner });
    const root = h("div", { class: "stack", style: { gap: "14px" } });

    root.append(h("div", { class: "grid-kpi" },
      kpiCard({ label: `Nouveaux prospects (${k.days} j)`, value: fmt.int(k.newLeads), delta: k.newLeadsDelta, foot: "vs période précédente" }),
      kpiCard({ label: "À traiter maintenant", value: fmt.int(k.todo), kind: k.todo > 15 ? "alert" : k.todo > 5 ? "watch" : "", foot: k.oldestTodoAgeDays !== null ? `le plus ancien attend depuis ${k.oldestTodoAgeDays} j` : "statut Nouveau ou Non contacté" }),
      kpiCard({ label: "Taux de qualification", value: `${k.qualifiedRate} %`, foot: `${k.qualified} qualifiés · ${k.qualifiedRatePrev} % avant` }),
      kpiCard({ label: "Affaires en cours", value: fmt.int(k.openDeals), foot: `${fmt.moneyShort(k.openAmount)} · pondéré ${fmt.moneyShort(k.weighted)}` }),
      kpiCard({ label: "Acomptes en attente", value: fmt.int(k.depositPending), gold: true, kind: k.depositPending > 0 ? "watch" : "", foot: `${fmt.moneyShort(k.depositPendingAmount)} de scolarité engagée` }),
      kpiCard({ label: `Inscriptions gagnées (${k.days} j)`, value: fmt.int(k.won), delta: k.wonDelta, foot: `${fmt.moneyShort(k.wonAmount)} · taux ${k.winRate} %` }),
      kpiCard({ label: "Tâches en retard", value: fmt.int(k.overdueTasks), kind: k.overdueTasks > 0 ? "alert" : "", foot: `${k.todayTasks} à faire aujourd'hui` }),
      kpiCard({ label: `Appels (${k.days} j)`, value: fmt.int(k.calls), delta: k.callsDelta, foot: `${k.talkMinutes} min de conversation` }),
    ));

    // Graphiques
    const weeks = E.leadsPerWeek(d.leads, 12, now);
    const chartCard = h("div", { class: "card" },
      h("div", { class: "card-head" }, h("h2", null, "Prospects créés par semaine"), h("span", { class: "hint" }, "barre pleine : qualifiés ou convertis")),
      weekBars(weeks));
    const srcRows = E.sourceBreakdown(d.leads.filter((l) => l.created !== null && l.created >= now - state.days * MS_DAY), 7).map((s) => ({ label: s.source, value: s.count }));
    const srcCard = h("div", { class: "card" },
      h("div", { class: "card-head" }, h("h2", null, `Origine des prospects (${state.days} j)`)),
      srcRows.length ? hbars(srcRows) : h("p", { class: "empty" }, "Aucun prospect sur la période"));
    root.append(h("div", { class: "grid-2" }, chartCard, srcCard));

    // Entonnoir + pipeline
    const f = E.leadFunnel(d.leads);
    const fmax = Math.max(1, ...f.rows.map((r) => r.count), ...f.dead.map((r) => r.count));
    const funnel = h("div", { class: "funnel" });
    for (const r of f.rows.concat(f.dead.map((x) => Object.assign({ dead: true }, x)))) {
      funnel.append(h("div", { class: `funnel-row ${r.dead ? "dead" : ""}` }, h("span", { class: "ellipsis" }, r.status), h("div", { class: "bar", style: { width: `${Math.max(1, (r.count / fmax) * 100)}%` } }), h("span", { class: "num small" }, fmt.int(r.count))));
    }
    if (f.other) funnel.append(h("div", { class: "funnel-row dead" }, h("span", null, "Autre statut"), h("div", null), h("span", { class: "num small" }, fmt.int(f.other))));
    const funnelCard = h("div", { class: "card" }, h("div", { class: "card-head" }, h("h2", null, "Parcours des prospects"), h("span", { class: "hint" }, "non convertis, tous statuts")), funnel);

    const ps = E.pipelineSummary(d.deals.filter(E.isOpenDeal), "Recrutement");
    const pipeCard = h("div", { class: "card" },
      h("div", { class: "card-head" }, h("h2", null, "Pipeline Recrutement"), h("button", { class: "btn sm ghost", onclick: () => { state.view = "pipeline"; render(); } }, "Ouvrir", icon("arrowR"))),
      ps.length ? hbars(ps.map((s) => ({ label: s.stage, value: s.count, display: `${s.count} · ${fmt.moneyShort(s.amount)}`, kind: E.DEAL_DEPOSIT_PENDING.includes(s.stage) ? "gold" : "" }))) : h("p", { class: "empty" }, "Aucune affaire ouverte"));
    root.append(h("div", { class: "grid-2" }, funnelCard, pipeCard));

    // Listes d'action
    const ag = E.todayAgenda(d, now);
    const todayCard = h("div", { class: "card" }, h("div", { class: "card-head" }, h("h2", null, "Aujourd'hui"), h("span", { class: "hint" }, `${ag.overdue.length} en retard`)));
    const todayList = h("div", { class: "list" });
    for (const t of ag.overdue.slice(0, 6)) todayList.append(agendaRow("task", t, now, true));
    for (const c of ag.calls) todayList.append(agendaRow("call", c, now));
    for (const e of ag.events) todayList.append(agendaRow("event", e, now));
    for (const t of ag.today) todayList.append(agendaRow("task", t, now));
    if (!todayList.children.length) todayList.append(h("p", { class: "empty" }, "Rien de planifié aujourd'hui, ni de retard."));
    todayCard.append(todayList);

    const hot = E.hotLeads(d.leads, 8);
    const hotCard = h("div", { class: "card" }, h("div", { class: "card-head" }, h("h2", null, "Prospects chauds"), h("span", { class: "hint" }, "score et qualification")));
    const hotList = h("div", { class: "list" });
    for (const l of hot) hotList.append(h("div", { class: "list-item clickable", onclick: () => openDrawer("Leads", l.id) }, avatar(l.name),
      h("div", { class: "grow" }, h("div", { class: "ellipsis" }, h("strong", null, l.name)), h("div", { class: "small faint ellipsis" }, `${l.source} · ${fmt.relative(l.modified, now)}`)),
      statusBadge(l.status), h("span", { class: "badge num" }, l.score)));
    if (!hot.length) hotList.append(h("p", { class: "empty" }, "Aucun prospect qualifié pour le moment."));
    hotCard.append(hotList);

    const stalled = E.stalledDeals(d.deals.filter((x) => x.pipeline === "Recrutement"), now, 14).slice(0, 8);
    const stallCard = h("div", { class: "card" }, h("div", { class: "card-head" }, h("h2", null, "Affaires à relancer"), h("span", { class: "hint" }, "sans activité depuis 14 j")));
    const stallList = h("div", { class: "list" });
    for (const { deal, idle } of stalled) stallList.append(h("div", { class: "list-item clickable", onclick: () => openDrawer("Deals", deal.id) }, avatar(deal.contact ? deal.contact.name : deal.name),
      h("div", { class: "grow" }, h("div", { class: "ellipsis" }, h("strong", null, deal.contact ? deal.contact.name : deal.name)), h("div", { class: "small faint ellipsis" }, deal.promotion ? `Promo ${deal.promotion.name}` : deal.name)),
      stageBadge(deal.stage), h("span", { class: `badge ${idle > 30 ? "crit" : "warn"}` }, `${idle} j`)));
    if (!stalled.length) stallList.append(h("p", { class: "empty" }, "Toutes les affaires ouvertes ont eu une activité récente."));
    stallCard.append(stallList);
    root.append(h("div", { class: "grid-3" }, todayCard, hotCard, stallCard));

    // Brief Claude
    if (state.sample || state.demo) {
      const brief = h("div", { class: "card" });
      const head = h("div", { class: "card-head" }, h("h2", null, "Briefing du jour par Claude"), h("span", { class: "hint" }, "priorités déduites des données affichées"));
      const out = h("div", { class: "ai", hidden: true });
      const btn = h("button", { class: "btn primary", onclick: () => runSample(btn, out, dailyBriefPrompt(k, ag, hot, stalled)) }, icon("spark"), "Générer le briefing");
      brief.append(head, btn, out);
      root.append(brief);
    }
    return root;
  }

  function agendaRow(kind, item, now, late) {
    const label = kind === "task" ? item.subject : kind === "call" ? item.subject : item.title;
    const when = kind === "task" ? fmt.date(item.due) : fmt.time(item.start);
    const who = (item.who && item.who.name) || (item.what && item.what.name) || "";
    const tag = kind === "task" ? h("span", { class: `badge ${late ? "crit" : "warn"}` }, late ? "en retard" : "tâche") : kind === "call" ? h("span", { class: "badge gold" }, "appel") : h("span", { class: "badge accent" }, "RDV");
    const target = relatedTarget(item);
    return h("div", { class: "list-item clickable", onclick: () => target ? openDrawer(target.module, target.id) : openDrawer(item.module, item.id) },
      h("span", { class: "num small faint", style: { width: "48px", flex: "none" } }, when),
      h("div", { class: "grow" }, h("div", { class: "ellipsis" }, label), who ? h("div", { class: "small faint ellipsis" }, who) : null), tag);
  }
  function relatedTarget(item) {
    if (item.what && item.what.id && (item.relatedModule === "Deals" || item.relatedModule === "Leads")) return { module: item.relatedModule, id: item.what.id };
    const byName = state.data.deals.find((d) => item.what && d.id === item.what.id) || (item.what && state.data.leads.find((l) => l.id === item.what.id));
    if (byName) return { module: byName.module, id: byName.id };
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* Vue Prospects                                                        */
  /* ------------------------------------------------------------------ */
  function renderLeads() {
    const now = Date.now();
    const f = state.leadFilter;
    const all = filteredData().leads;
    const rows = E.sortLeads(E.filterLeads(all, f), f.sort, f.dir);
    const root = h("div", { class: "stack", style: { gap: "12px" } });

    const sources = E.sortedCounts(E.countBy(all, (l) => l.source));
    const quick = h("div", { class: "seg", role: "group", "aria-label": "Filtre rapide" },
      [["all", "Tous"], ["todo", "À traiter"], ["hot", "Chauds"], ["dead", "Perdus / spam"]].map(([v, l]) => h("button", { "aria-pressed": f.status === v ? "true" : "false", onclick: () => { f.status = v; render(); } }, l)));
    const statusSel = h("select", { class: "select", id: "lead-status", "aria-label": "Statut", onchange: (e) => { f.status = e.target.value; render(); } },
      h("option", { value: "all" }, "Tous les statuts"), E.LEAD_STATUS_ALL.map((s) => h("option", { value: s, selected: f.status === s ? true : null }, s)));
    const srcSel = h("select", { class: "select", id: "lead-source", "aria-label": "Origine", onchange: (e) => { f.source = e.target.value; render(); } },
      h("option", { value: "all" }, "Toutes les origines"), sources.map(([s, n]) => h("option", { value: s, selected: f.source === s ? true : null }, `${s} (${n})`)));
    const search = h("input", { class: "input", id: "lead-search", type: "search", placeholder: "Rechercher nom, e-mail, téléphone, ville…", value: f.q, style: { maxWidth: "320px" },
      oninput: (e) => { f.q = e.target.value; renderLeadTable(tableWrap, now); } });
    root.append(h("div", { class: "toolbar" }, quick, statusSel, srcSel, search, h("span", { class: "muted small", id: "lead-count" }, `${rows.length} prospect${rows.length > 1 ? "s" : ""}`)));

    const tableWrap = h("div", { class: "card table-wrap", style: { padding: "0" } });
    renderLeadTable(tableWrap, now);
    root.append(tableWrap);
    return root;
  }
  function renderLeadTable(wrap, now) {
    const f = state.leadFilter;
    const rows = E.sortLeads(E.filterLeads(filteredData().leads, f), f.sort, f.dir).slice(0, 400);
    const cnt = $("#lead-count"); if (cnt) cnt.textContent = `${rows.length} prospect${rows.length > 1 ? "s" : ""}`;
    const th = (key, label, cls) => h("th", { class: cls || "" }, h("button", { "data-active": f.sort === key ? "true" : "false", onclick: () => { if (f.sort === key) f.dir = f.dir === "asc" ? "desc" : "asc"; else { f.sort = key; f.dir = key === "name" ? "asc" : "desc"; } render(); } }, label, f.sort === key ? (f.dir === "asc" ? " ↑" : " ↓") : ""));
    const table = h("table", null, h("thead", null, h("tr", null, th("name", "Prospect"), th("status", "Statut"), th("source", "Origine"), h("th", null, "Profil"), th("score", "Score", "num"), th("created", "Créé"), th("modified", "Activité"), h("th", null, "Responsable"))));
    const tb = h("tbody");
    for (const l of rows) {
      tb.append(h("tr", { class: "clickable", onclick: () => openDrawer("Leads", l.id) },
        h("td", null, h("div", null, h("strong", null, l.name)), h("div", { class: "small faint" }, [l.city, l.email].filter(Boolean).join(" · "))),
        h("td", null, statusBadge(l.status), l.step ? h("div", { class: "small faint" }, l.step) : null),
        h("td", null, l.source),
        h("td", { class: "small" }, l.role ? l.role.replace("Je suis ", "").replace(/^./, (c) => c.toUpperCase()) : "—", l.diplomaYear ? h("div", { class: "faint" }, `Diplôme ${l.diplomaYear}`) : null),
        h("td", { class: "num" }, l.score),
        h("td", { class: "num small" }, fmt.date(l.created)),
        h("td", { class: "small" }, fmt.relative(l.lastActivity || l.modified, now)),
        h("td", { class: "small" }, l.owner ? l.owner.name : "—")));
    }
    if (!rows.length) tb.append(h("tr", null, h("td", { colspan: 8, class: "empty" }, "Aucun prospect ne correspond à ces filtres.")));
    table.append(tb);
    wrap.replaceChildren(table);
  }

  /* ------------------------------------------------------------------ */
  /* Vue Pipeline                                                         */
  /* ------------------------------------------------------------------ */
  function renderPipeline() {
    const now = Date.now();
    const all = filteredData().deals;
    const promos = E.sortedCounts(E.countBy(all.filter((d) => d.promotion), (d) => d.promotion.name));
    const sel = all.filter((d) => (state.pipeline === "all" || d.pipeline === state.pipeline) && (state.promo === "all" || (d.promotion && d.promotion.name === state.promo)));
    const open = sel.filter(E.isOpenDeal);
    const root = h("div", { class: "stack", style: { gap: "12px" } });

    const pipeSeg = h("div", { class: "seg", role: "group", "aria-label": "Pipeline" },
      [["Recrutement", "Recrutement"], ["Startbox", "Startbox"], ["all", "Tous"]].map(([v, l]) => h("button", { "aria-pressed": state.pipeline === v ? "true" : "false", onclick: () => { state.pipeline = v; savePrefs(); render(); } }, l)));
    const promoSel = h("select", { class: "select", id: "promo-select", "aria-label": "Promotion", onchange: (e) => { state.promo = e.target.value; render(); } },
      h("option", { value: "all" }, "Toutes les promotions"), promos.map(([p, n]) => h("option", { value: p, selected: state.promo === p ? true : null }, `${p} (${n})`)));
    const totals = h("span", { class: "muted small" }, `${open.length} ouvertes · ${fmt.moneyShort(open.reduce((s, d) => s + (d.amount || 0), 0))} · ${sel.filter(E.isWon).length} gagnées · ${sel.filter(E.isLost).length} perdues`);
    root.append(h("div", { class: "toolbar" }, pipeSeg, promoSel, totals));

    const cols = E.kanbanColumns(sel).filter((s) => !E.isLost({ stage: s }) || sel.some((d) => d.stage === s));
    const board = h("div", { class: "kanban" });
    const canDrag = Boolean(state.write.update);
    for (const stage of cols) {
      const deals = sel.filter((d) => d.stage === stage).sort((a, b) => (b.modified || 0) - (a.modified || 0));
      const shown = E.isWon({ stage }) || E.isLost({ stage }) ? deals.slice(0, 12) : deals;
      const col = h("div", { class: "kcol", dataset: { stage } });
      col.append(h("div", { class: "kcol-head" }, h("h3", null, stage), h("span", { class: "sum num" }, `${deals.length} · ${fmt.moneyShort(deals.reduce((s, d) => s + (d.amount || 0), 0))}`)));
      if (canDrag) {
        col.addEventListener("dragover", (e) => { e.preventDefault(); col.classList.add("over"); });
        col.addEventListener("dragleave", () => col.classList.remove("over"));
        col.addEventListener("drop", (e) => { e.preventDefault(); col.classList.remove("over"); const id = e.dataTransfer.getData("text/plain"); if (id) changeStage(id, stage); });
      }
      for (const d of shown) {
        const idle = E.daysSince(d.lastActivity || d.modified, now);
        const card = h("div", { class: `kcard ${E.isWon(d) ? "won" : E.isLost(d) ? "lost" : idle > 14 ? "stale" : ""}`, draggable: canDrag && E.isOpenDeal(d) ? "true" : null, onclick: () => openDrawer("Deals", d.id) },
          h("div", { class: "name ellipsis" }, d.contact ? d.contact.name : d.name),
          h("div", { class: "meta" }, d.promotion ? h("span", null, d.promotion.name) : null, h("span", { class: "num" }, fmt.moneyShort(d.amount)), d.closing ? h("span", null, `clôture ${fmt.date(d.closing)}`) : null),
          h("div", { class: "meta" }, h("span", null, d.owner ? d.owner.name : ""), E.isOpenDeal(d) ? h("span", { class: idle > 14 ? "badge warn" : "" }, `${idle ?? "?"} j sans activité`) : d.lossReason ? h("span", { class: "badge crit" }, d.lossReason) : null));
        if (canDrag) card.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", d.id); e.dataTransfer.effectAllowed = "move"; });
        col.append(card);
      }
      if (deals.length > shown.length) col.append(h("div", { class: "small faint", style: { textAlign: "center" } }, `+ ${deals.length - shown.length} autres`));
      board.append(col);
    }
    root.append(board);
    if (canDrag) root.append(h("p", { class: "small faint" }, "Glissez une carte vers une autre colonne pour changer l'étape de l'affaire dans Zoho CRM."));

    // Raisons de perte
    const lost = sel.filter(E.isLost);
    if (lost.length) {
      const reasons = E.sortedCounts(E.countBy(lost, (d) => d.lossReason || "Non renseignée"));
      root.append(h("div", { class: "grid-2" },
        h("div", { class: "card" }, h("div", { class: "card-head" }, h("h2", null, "Raisons de perte"), h("span", { class: "hint" }, `${lost.length} affaires`)), hbars(reasons.map(([l, n]) => ({ label: l, value: n, kind: "crit" })))),
        h("div", { class: "card" }, h("div", { class: "card-head" }, h("h2", null, "Résultat de l'appel d'évaluation"), h("span", { class: "hint" }, "affaires du pipeline sélectionné")),
          hbars(E.sortedCounts(E.countBy(sel.filter((d) => d.evalResult), (d) => d.evalResult)).map(([l, n]) => ({ label: l, value: n }))))));
    }
    return root;
  }

  async function changeStage(dealId, stage, extra) {
    const deal = state.data.deals.find((d) => d.id === dealId);
    if (!deal || deal.stage === stage) return;
    const record = Object.assign({ Stage: stage }, extra || {});
    await performWrite({ kind: "update", module: "Deals", id: dealId, record, label: `Étape → ${stage}`,
      instruction: E.claudeInstruction("stage", { module: "Deals", id: dealId, name: deal.name, value: stage, extra: extra && extra.Reason_For_Loss__s }),
      apply: () => { deal.stage = stage; deal.modified = Date.now(); if (extra && extra.Reason_For_Loss__s) deal.lossReason = extra.Reason_For_Loss__s; } });
  }

  /* ------------------------------------------------------------------ */
  /* Vue Appels                                                           */
  /* ------------------------------------------------------------------ */
  function renderCalls() {
    const now = Date.now();
    const d = filteredData();
    const s = E.callStats(d.calls, now, state.callDays);
    const root = h("div", { class: "stack", style: { gap: "12px" } });
    const seg = h("div", { class: "seg", role: "group", "aria-label": "Période des appels" },
      [7, 30, 90].map((n) => h("button", { "aria-pressed": state.callDays === n ? "true" : "false", onclick: () => { state.callDays = n; render(); } }, `${n} j`)));
    root.append(h("div", { class: "toolbar" }, seg, h("span", { class: "muted small" }, "Appels Aircall et appels planifiés dans Zoho CRM")));
    root.append(h("div", { class: "grid-kpi" },
      kpiCard({ label: `Appels (${state.callDays} j)`, value: fmt.int(s.total), foot: `${s.byType.map(([t, n]) => `${E.CALL_TYPE_FR[t] || t} ${n}`).join(" · ")}` }),
      kpiCard({ label: "Taux de conversation", value: `${s.answerRate} %`, foot: `${s.answered} appels ≥ 1 min` }),
      kpiCard({ label: "Temps de conversation", value: `${fmt.int(s.minutes)} min`, foot: s.total ? `${Math.round(s.minutes / s.total * 10) / 10} min en moyenne` : "" }),
      kpiCard({ label: "Appels planifiés", value: fmt.int(s.scheduled.length), kind: s.overdueScheduled.length ? "alert" : "", foot: s.overdueScheduled.length ? `${s.overdueScheduled.length} planifiés dépassés` : "à venir" }),
    ));

    const resCard = h("div", { class: "card" }, h("div", { class: "card-head" }, h("h2", null, "Résultats d'appel")),
      s.byResult.length ? hbars(s.byResult.map(([r, n]) => ({ label: E.CALL_RESULT_FR[r] || r, value: n }))) : h("p", { class: "empty" }, "Aucun résultat renseigné sur la période."));
    const ownCard = h("div", { class: "card" }, h("div", { class: "card-head" }, h("h2", null, "Par responsable")),
      h("div", { class: "table-wrap" }, h("table", null, h("thead", null, h("tr", null, h("th", null, "Responsable"), h("th", { class: "num" }, "Appels"), h("th", { class: "num" }, "Conversations"), h("th", { class: "num" }, "Minutes"))),
        h("tbody", null, s.byOwner.map((o) => h("tr", null, h("td", null, o.owner), h("td", { class: "num" }, o.count), h("td", { class: "num" }, o.answered), h("td", { class: "num" }, Math.round(o.seconds / 60))))))));
    root.append(h("div", { class: "grid-2" }, resCard, ownCard));

    const sched = h("div", { class: "card" }, h("div", { class: "card-head" }, h("h2", null, "Appels planifiés"), h("span", { class: "hint" }, "à passer")));
    const sl = h("div", { class: "list" });
    for (const c of s.overdueScheduled.concat(s.scheduled).slice(0, 20)) {
      const late = c.start < now;
      sl.append(h("div", { class: "list-item clickable", onclick: () => openDrawer("Calls", c.id) }, h("span", { class: "num small faint", style: { width: "92px", flex: "none" } }, fmt.dateTime(c.start)),
        h("div", { class: "grow" }, h("div", { class: "ellipsis" }, c.subject), h("div", { class: "small faint ellipsis" }, (c.who && c.who.name) || (c.what && c.what.name) || "")), late ? h("span", { class: "badge crit" }, "dépassé") : h("span", { class: "badge gold" }, "planifié")));
    }
    if (!sl.children.length) sl.append(h("p", { class: "empty" }, "Aucun appel planifié."));
    sched.append(sl);

    const recent = d.calls.filter((c) => c.start !== null && c.start <= now).sort((a, b) => b.start - a.start).slice(0, 40);
    const log = h("div", { class: "card table-wrap", style: { padding: 0 } }, h("table", null,
      h("thead", null, h("tr", null, h("th", null, "Date"), h("th", null, "Type"), h("th", null, "Contact"), h("th", null, "Objet"), h("th", { class: "num" }, "Durée"), h("th", null, "Résultat"), h("th", null, "Par"))),
      h("tbody", null, recent.map((c) => h("tr", { class: "clickable", onclick: () => openDrawer("Calls", c.id) },
        h("td", { class: "num small" }, fmt.dateTime(c.start)), h("td", null, h("span", { class: `badge ${c.type === "Missed" ? "crit" : c.type === "Inbound" ? "info" : ""}` }, E.CALL_TYPE_FR[c.type] || c.type)),
        h("td", null, (c.who && c.who.name) || (c.what && c.what.name) || "—"), h("td", { class: "small ellipsis", style: { maxWidth: "260px" } }, c.subject),
        h("td", { class: "num" }, fmt.duration(c.seconds)), h("td", null, c.result ? h("span", { class: `badge ${c.result === "Interested" || c.result === "Candidat retenu" ? "good" : c.result === "Not interested" ? "crit" : ""}` }, E.CALL_RESULT_FR[c.result] || c.result) : h("span", { class: "faint" }, "—")),
        h("td", { class: "small" }, c.owner ? c.owner.name : "—"))))));
    root.append(h("div", { class: "grid-2" }, sched, h("div", { class: "card" }, h("div", { class: "card-head" }, h("h2", null, "Journal des appels"), h("span", { class: "hint" }, "40 derniers")), log)));
    return root;
  }

  /* ------------------------------------------------------------------ */
  /* Vue Planning                                                         */
  /* ------------------------------------------------------------------ */
  function renderPlanning() {
    const now = Date.now();
    const d = filteredData();
    const grid = E.weekGrid(d, state.weekAnchor);
    const root = h("div", { class: "stack", style: { gap: "12px" } });
    const nav = h("div", { class: "toolbar" },
      h("button", { class: "btn sm", onclick: () => { state.weekAnchor -= 7 * MS_DAY; render(); }, "aria-label": "Semaine précédente" }, icon("arrowL")),
      h("button", { class: "btn sm", onclick: () => { state.weekAnchor = Date.now(); render(); } }, "Cette semaine"),
      h("button", { class: "btn sm", onclick: () => { state.weekAnchor += 7 * MS_DAY; render(); }, "aria-label": "Semaine suivante" }, icon("arrowR")),
      h("strong", { style: { fontFamily: "var(--font-display)" } }, `Semaine du ${new Date(grid.start).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`),
      h("span", { class: "small faint" }, "RDV (bleu), appels planifiés (or), tâches (ambre, rouge si en retard)"));
    root.append(nav);
    const week = h("div", { class: "week" });
    const today0 = E.startOfDay(now);
    for (const day of grid.days) {
      const col = h("div", { class: `day ${day.start === today0 ? "today" : day.start < today0 ? "past" : ""}` });
      col.append(h("div", { class: "day-head" }, h("strong", null, fmt.weekday(day.start)), h("span", { class: "faint" }, `${day.items.length || ""}`)));
      for (const it of day.items) {
        const late = it.kind === "task" && it.at < today0;
        const label = it.kind === "event" ? it.item.title : it.kind === "call" ? it.item.subject : it.item.subject;
        const target = relatedTarget(it.item);
        col.append(h("div", { class: `ev ${it.kind} ${late ? "late" : ""}`, onclick: () => target ? openDrawer(target.module, target.id) : openDrawer(it.item.module, it.item.id) },
          h("span", { class: "t" }, it.kind === "task" ? (late ? "retard" : "tâche") : fmt.time(it.at)), h("span", { class: "n", title: label }, label)));
      }
      if (!day.items.length) col.append(h("span", { class: "small faint" }, "—"));
      week.append(col);
    }
    root.append(week);

    const ag = E.todayAgenda(d, now);
    const overdueCard = h("div", { class: "card" }, h("div", { class: "card-head" }, h("h2", null, "Tâches en retard"), h("span", { class: "hint" }, `${ag.overdue.length}`)));
    const ol = h("div", { class: "list" });
    for (const t of ag.overdue.slice(0, 25)) {
      ol.append(h("div", { class: "list-item" }, h("span", { class: "num small faint", style: { width: "56px", flex: "none" } }, fmt.date(t.due)),
        h("div", { class: "grow clickable", onclick: () => openDrawer("Tasks", t.id) }, h("div", { class: "ellipsis" }, t.subject), h("div", { class: "small faint ellipsis" }, (t.who && t.who.name) || (t.what && t.what.name) || "")),
        t.priority === "High" || t.priority === "Highest" ? h("span", { class: "badge crit" }, E.TASK_PRIORITY_FR[t.priority]) : null,
        h("button", { class: "btn sm", title: "Marquer terminée", onclick: () => completeTask(t) }, icon("check"), "Terminée")));
    }
    if (!ol.children.length) ol.append(h("p", { class: "empty" }, "Aucune tâche en retard."));
    overdueCard.append(ol);

    const upcoming = d.events.filter((e) => e.start !== null && e.start >= now).sort((a, b) => a.start - b.start).slice(0, 15);
    const upCard = h("div", { class: "card" }, h("div", { class: "card-head" }, h("h2", null, "Prochains rendez-vous")));
    const ul = h("div", { class: "list" });
    for (const e of upcoming) ul.append(h("div", { class: "list-item clickable", onclick: () => openDrawer("Events", e.id) }, h("span", { class: "num small faint", style: { width: "92px", flex: "none" } }, fmt.dateTime(e.start)),
      h("div", { class: "grow" }, h("div", { class: "ellipsis" }, e.title), h("div", { class: "small faint ellipsis" }, [e.venueType, e.owner && e.owner.name].filter(Boolean).join(" · ")))));
    if (!ul.children.length) ul.append(h("p", { class: "empty" }, "Aucun rendez-vous à venir."));
    upCard.append(ul);

    const past = d.events.filter((e) => e.start !== null && e.start < now && e.start > now - 30 * MS_DAY);
    const results = E.sortedCounts(E.countBy(past, (e) => e.result || "Sans résultat"));
    const resCard = h("div", { class: "card" }, h("div", { class: "card-head" }, h("h2", null, "Issue des rendez-vous (30 j)"), h("span", { class: "hint" }, `${past.length} RDV`)),
      past.length ? hbars(results.map(([l, n]) => ({ label: l, value: n, kind: l === "Suite positive" ? "" : l === "Suite négative" ? "crit" : "muted" }))) : h("p", { class: "empty" }, "Aucun RDV passé sur 30 jours."));
    root.append(h("div", { class: "grid-3" }, overdueCard, upCard, resCard));
    return root;
  }

  async function completeTask(t) {
    await performWrite({ kind: "update", module: "Tasks", id: t.id, record: { Status: "Completed" }, label: "Tâche terminée",
      instruction: E.claudeInstruction("taskDone", { module: "Tasks", id: t.id, name: t.subject }),
      apply: () => { t.status = "Completed"; t.closed = Date.now(); } });
  }

  /* ------------------------------------------------------------------ */
  /* Tiroir de détail et actions                                          */
  /* ------------------------------------------------------------------ */
  function openDrawer(module, id) { state.drawer = { module, id }; renderDrawer(); }
  function closeDrawer() { state.drawer = null; renderDrawer(); }

  function renderDrawer() {
    const host = $("#drawer-host");
    host.replaceChildren();
    if (!state.drawer) return;
    const { module, id } = state.drawer;
    const key = module.toLowerCase();
    const rec = (state.data[key] || []).find((r) => r.id === id);
    if (!rec) { state.drawer = null; return; }
    const backdrop = h("div", { class: "drawer-backdrop", onclick: closeDrawer });
    const drawer = h("aside", { class: "drawer", role: "dialog", "aria-modal": "true", "aria-label": "Détail" });
    const body = h("div", { class: "drawer-body" });
    const title = module === "Leads" ? rec.name : module === "Deals" ? (rec.contact ? rec.contact.name : rec.name) : module === "Tasks" ? rec.subject : module === "Calls" ? rec.subject : rec.title;
    const sub = module === "Leads" ? `Prospect · ${rec.source}` : module === "Deals" ? rec.name : module === "Tasks" ? "Tâche" : module === "Calls" ? "Appel" : "Réunion";
    drawer.append(h("div", { class: "drawer-head" }, avatar(title), h("div", { class: "grow", style: { minWidth: 0 } }, h("h2", null, title), h("div", { class: "small muted" }, sub)),
      h("button", { class: "btn ghost sm", "aria-label": "Fermer", onclick: closeDrawer }, icon("close"))));
    ({ Leads: leadDetail, Deals: dealDetail, Tasks: taskDetail, Calls: callDetail, Events: eventDetail })[module](rec, body);
    drawer.append(body);
    host.append(backdrop, drawer);
    const onKey = (e) => { if (e.key === "Escape") { closeDrawer(); document.removeEventListener("keydown", onKey); } };
    document.addEventListener("keydown", onKey);
  }

  function prop(k, v) { return h("div", { class: "prop" }, h("div", { class: "k" }, k), h("div", { class: "v" }, v === null || v === undefined || v === "" ? h("span", { class: "faint" }, "—") : v)); }
  function copyable(text) { return text ? h("span", { class: "row", style: { gap: "6px" } }, h("span", { class: "ellipsis" }, text), h("button", { class: "btn ghost sm", title: "Copier", onclick: () => copyText(text) }, icon("copy"))) : null; }

  function activityFor(module, id) {
    const now = Date.now();
    const items = [];
    for (const t of state.data.tasks) if (t.what && t.what.id === id) items.push({ at: t.due || t.modified, text: `${E.isOpenTask(t) ? "Tâche" : "Tâche terminée"} · ${t.subject}`, kind: E.isOpenTask(t) && t.due && t.due < E.startOfDay(now) ? "crit" : "" });
    for (const c of state.data.calls) if ((c.what && c.what.id === id) || (c.who && c.who.id === id)) items.push({ at: c.start, text: `${E.CALL_TYPE_FR[c.type] || c.type} ${fmt.duration(c.seconds)}${c.result ? ` · ${E.CALL_RESULT_FR[c.result] || c.result}` : ""}${c.status === "Scheduled" ? " · planifié" : ""}` });
    for (const e of state.data.events) if (e.what && e.what.id === id) items.push({ at: e.start, text: `RDV · ${e.title}${e.result ? ` · ${e.result}` : ""}` });
    return items.filter((x) => x.at).sort((a, b) => b.at - a.at).slice(0, 12);
  }
  function timeline(items) {
    if (!items.length) return h("p", { class: "small faint" }, "Aucune activité liée chargée.");
    return h("div", { class: "timeline" }, items.map((i) => h("div", { class: "tl" }, h("span", { class: "when" }, fmt.date(i.at)), h("span", { class: i.kind ? `badge ${i.kind}` : "" }, i.text))));
  }

  function leadDetail(l, body) {
    const now = Date.now();
    body.append(h("div", { class: "row", style: { flexWrap: "wrap" } }, statusBadge(l.status), l.step ? h("span", { class: "badge info" }, l.step) : null, h("span", { class: "badge num" }, `score ${l.score}`), l.rotting ? h("span", { class: "badge crit" }, "en train de pourrir") : null, l.converted ? h("span", { class: "badge good" }, "converti") : null));
    body.append(h("div", { class: "props" },
      prop("E-mail", copyable(l.email)), prop("Téléphone", copyable(l.phone)), prop("Ville", l.city), prop("Statut professionnel", l.role),
      prop("Diplôme", l.diplomaYear), prop("Origine", l.source), prop("Campagne", l.campaign), prop("Responsable", l.owner && l.owner.name),
      prop("Créé", fmt.dateTime(l.created)), prop("Dernière activité", `${fmt.dateTime(l.lastActivity || l.modified)} (${fmt.relative(l.lastActivity || l.modified, now)})`)));
    if (l.message) body.append(h("div", null, h("div", { class: "eyebrow" }, "Message"), h("div", { class: "quote" }, l.message)));
    if (l.motivations || l.project || l.training) body.append(h("div", { class: "stack" }, l.motivations ? h("div", null, h("div", { class: "eyebrow" }, "Motivations"), h("div", { class: "quote" }, l.motivations)) : null, l.project ? h("div", null, h("div", { class: "eyebrow" }, "Projet professionnel"), h("div", { class: "quote" }, l.project)) : null, l.training ? h("div", null, h("div", { class: "eyebrow" }, "Formation"), h("div", { class: "quote" }, l.training)) : null));

    // Actions
    const act = h("div", { class: "panel" }, h("h3", null, "Actions"));
    const statusSel = h("select", { class: "select", id: "act-status" }, E.LEAD_STATUS_ALL.map((s) => h("option", { value: s, selected: s === l.status ? true : null }, s)));
    act.append(h("div", { class: "row" }, h("div", { class: "field grow" }, h("label", { for: "act-status" }, "Statut du prospect"), statusSel),
      h("button", { class: "btn primary", style: { alignSelf: "flex-end" }, onclick: () => performWrite({ kind: "update", module: "Leads", id: l.id, record: { Lead_Status: statusSel.value }, label: `Statut → ${statusSel.value}`, instruction: E.claudeInstruction("status", { module: "Leads", id: l.id, name: l.name, value: statusSel.value }), apply: () => { l.status = statusSel.value; l.modified = Date.now(); } }) }, "Appliquer")));
    const stepSel = h("select", { class: "select", id: "act-step" }, h("option", { value: "" }, "— aucune —"), E.LEAD_STEPS.map((s) => h("option", { value: s, selected: s === l.step ? true : null }, s)));
    act.append(h("div", { class: "row" }, h("div", { class: "field grow" }, h("label", { for: "act-step" }, "Étape du prospect"), stepSel),
      h("button", { class: "btn", style: { alignSelf: "flex-end" }, onclick: () => performWrite({ kind: "update", module: "Leads", id: l.id, record: { Etapes_du_prospect: stepSel.value || null }, label: `Étape → ${stepSel.value || "aucune"}`, instruction: E.claudeInstruction("step", { module: "Leads", id: l.id, name: l.name, value: stepSel.value || "aucune" }), apply: () => { l.step = stepSel.value || null; } }) }, "Appliquer")));
    act.append(h("div", { class: "actions" },
      h("button", { class: "btn", onclick: () => showForm(body, "call", l) }, "Planifier un appel"),
      h("button", { class: "btn", onclick: () => showForm(body, "task", l) }, "Créer une tâche"),
      h("button", { class: "btn", onclick: () => showForm(body, "note", l) }, "Ajouter une note"),
      h("button", { class: "btn", onclick: () => showForm(body, "convert", l) }, "Convertir en candidat")));
    body.append(act);
    body.append(h("div", { id: "form-host" }));
    if (state.sample || state.demo) {
      const out = h("div", { class: "ai", hidden: true });
      const btn = h("button", { class: "btn", onclick: () => runSample(btn, out, leadBriefPrompt(l)) }, icon("spark"), "Préparer l'appel avec Claude");
      body.append(h("div", { class: "stack" }, btn, out));
    }
    body.append(h("div", null, h("div", { class: "eyebrow", style: { marginBottom: "6px" } }, "Activité liée"), timeline(activityFor("Leads", l.id))));
    body.append(h("div", { class: "small faint" }, `Zoho CRM · Leads · ${l.id}`));
  }

  function dealDetail(d, body) {
    const now = Date.now();
    const idle = E.daysSince(d.lastActivity || d.modified, now);
    body.append(h("div", { class: "row", style: { flexWrap: "wrap" } }, stageBadge(d.stage), h("span", { class: "badge" }, d.pipeline), d.promotion ? h("span", { class: "badge info" }, `Promo ${d.promotion.name}`) : null, E.isOpenDeal(d) && idle > 14 ? h("span", { class: "badge warn" }, `${idle} j sans activité`) : null));
    body.append(h("div", { class: "props" },
      prop("Montant", h("span", { class: "num" }, fmt.money(d.amount))), prop("Reçu scolarité", h("span", { class: "num" }, fmt.money(d.received))), prop("Probabilité", d.probability !== null ? `${d.probability} %` : null),
      prop("Clôture prévue", fmt.date(d.closing)), prop("Contact", d.contact && d.contact.name), prop("Responsable", d.owner && d.owner.name),
      prop("Appel d'évaluation", d.evalResult), prop("Appréciation ESO", d.appreciation), prop("Type de paiement", d.paymentType), prop("Lien acompte envoyé", fmt.date(d.linkSent)),
      prop("Raison de perte", d.lossReason), prop("Créée", fmt.date(d.created)), prop("Dernière activité", fmt.relative(d.lastActivity || d.modified, now))));

    const act = h("div", { class: "panel" }, h("h3", null, "Actions"));
    const stageSel = h("select", { class: "select", id: "act-stage" }, E.DEAL_STAGES.map((s) => h("option", { value: s, selected: s === d.stage ? true : null }, s)));
    const lossSel = h("select", { class: "select", id: "act-loss", hidden: !E.isLost(d) }, h("option", { value: "" }, "Raison de perte…"), E.LOSS_REASONS.map((r) => h("option", { value: r, selected: r === d.lossReason ? true : null }, r)));
    stageSel.addEventListener("change", () => { lossSel.hidden = !E.isLost({ stage: stageSel.value }); });
    act.append(h("div", { class: "row", style: { flexWrap: "wrap" } }, h("div", { class: "field grow" }, h("label", { for: "act-stage" }, "Étape de l'affaire"), stageSel), lossSel,
      h("button", { class: "btn primary", style: { alignSelf: "flex-end" }, onclick: () => changeStage(d.id, stageSel.value, lossSel.value ? { Reason_For_Loss__s: lossSel.value } : null) }, "Appliquer")));
    const evalSel = h("select", { class: "select", id: "act-eval" }, h("option", { value: "" }, "—"), E.EVAL_RESULTS.map((r) => h("option", { value: r, selected: r === d.evalResult ? true : null }, r)));
    act.append(h("div", { class: "row" }, h("div", { class: "field grow" }, h("label", { for: "act-eval" }, "Résultat de l'appel d'évaluation initiale"), evalSel),
      h("button", { class: "btn", style: { alignSelf: "flex-end" }, onclick: () => performWrite({ kind: "update", module: "Deals", id: d.id, record: { R_sultat_appel_d_valuation_initiale: evalSel.value || null }, label: "Résultat d'évaluation enregistré", instruction: E.claudeInstruction("generic", { module: "Deals", id: d.id, name: d.name, value: `résultat de l'appel d'évaluation initiale = « ${evalSel.value} »` }), apply: () => { d.evalResult = evalSel.value || null; } }) }, "Appliquer")));
    act.append(h("div", { class: "actions" },
      h("button", { class: "btn", onclick: () => showForm(body, "event", d) }, "Planifier un RDV"),
      h("button", { class: "btn", onclick: () => showForm(body, "call", d) }, "Planifier un appel"),
      h("button", { class: "btn", onclick: () => showForm(body, "task", d) }, "Créer une tâche"),
      h("button", { class: "btn", onclick: () => showForm(body, "note", d) }, "Ajouter une note")));
    body.append(act);
    body.append(h("div", { id: "form-host" }));
    if (state.sample || state.demo) {
      const out = h("div", { class: "ai", hidden: true });
      const btn = h("button", { class: "btn", onclick: () => runSample(btn, out, dealBriefPrompt(d)) }, icon("spark"), "Prochaine action conseillée par Claude");
      body.append(h("div", { class: "stack" }, btn, out));
    }
    body.append(h("div", null, h("div", { class: "eyebrow", style: { marginBottom: "6px" } }, "Activité liée"), timeline(activityFor("Deals", d.id))));
    body.append(h("div", { class: "small faint" }, `Zoho CRM · Deals · ${d.id}`));
  }

  function taskDetail(t, body) {
    body.append(h("div", { class: "row" }, h("span", { class: `badge ${t.status === "Completed" ? "good" : t.due && t.due < E.startOfDay(Date.now()) ? "crit" : "warn"}` }, E.TASK_STATUS_FR[t.status] || t.status), h("span", { class: "badge" }, E.TASK_PRIORITY_FR[t.priority] || t.priority)));
    body.append(h("div", { class: "props" }, prop("Échéance", fmt.dateFull(t.due)), prop("Contact", t.who && t.who.name), prop("Relatif à", t.what && t.what.name), prop("Responsable", t.owner && t.owner.name), prop("Créée", fmt.dateTime(t.created))));
    if (t.description) body.append(h("div", { class: "quote" }, t.description));
    const target = relatedTarget(t);
    body.append(h("div", { class: "actions" },
      E.isOpenTask(t) ? h("button", { class: "btn primary", onclick: () => completeTask(t) }, icon("check"), "Marquer terminée") : null,
      target ? h("button", { class: "btn", onclick: () => openDrawer(target.module, target.id) }, `Ouvrir ${target.module === "Deals" ? "l'affaire" : "le prospect"}`) : null));
    body.append(h("div", { class: "small faint" }, `Zoho CRM · Tasks · ${t.id}`));
  }

  function callDetail(c, body) {
    body.append(h("div", { class: "row" }, h("span", { class: "badge" }, E.CALL_TYPE_FR[c.type] || c.type), c.status ? h("span", { class: `badge ${c.status === "Scheduled" ? "gold" : ""}` }, c.status === "Scheduled" ? "planifié" : c.status) : null, c.result ? h("span", { class: "badge info" }, E.CALL_RESULT_FR[c.result] || c.result) : null));
    body.append(h("div", { class: "props" }, prop("Début", fmt.dateTime(c.start)), prop("Durée", fmt.duration(c.seconds)), prop("Contact", c.who && c.who.name), prop("Relatif à", c.what && c.what.name), prop("Objectif", c.purpose), prop("Responsable", c.owner && c.owner.name)));
    if (c.description) body.append(h("div", { class: "quote" }, c.description));
    const resSel = h("select", { class: "select", id: "act-callres" }, h("option", { value: "" }, "Résultat de l'appel…"), E.CALL_RESULTS.map((r) => h("option", { value: r, selected: r === c.result ? true : null }, E.CALL_RESULT_FR[r] || r)));
    const target = relatedTarget(c);
    body.append(h("div", { class: "panel" }, h("h3", null, "Enregistrer le résultat"),
      h("div", { class: "row" }, resSel, h("button", { class: "btn primary", onclick: () => performWrite({ kind: "update", module: "Calls", id: c.id, record: Object.assign({ Call_Result: resSel.value }, c.status === "Scheduled" ? { Outgoing_Call_Status: "Completed" } : {}), label: "Résultat enregistré", instruction: E.claudeInstruction("callResult", { module: "Calls", id: c.id, name: c.subject, value: E.CALL_RESULT_FR[resSel.value] || resSel.value }), apply: () => { c.result = resSel.value; if (c.status === "Scheduled") c.status = "Completed"; } }) }, "Enregistrer")),
      target ? h("button", { class: "btn", onclick: () => openDrawer(target.module, target.id) }, `Ouvrir ${target.module === "Deals" ? "l'affaire" : "le prospect"}`) : null));
    body.append(h("div", { class: "small faint" }, `Zoho CRM · Calls · ${c.id}`));
  }

  function eventDetail(e, body) {
    body.append(h("div", { class: "row" }, h("span", { class: "badge accent" }, e.venueType || "Réunion"), e.result ? h("span", { class: `badge ${e.result === "Suite positive" ? "good" : e.result === "Suite négative" ? "crit" : ""}` }, e.result) : null));
    body.append(h("div", { class: "props" }, prop("Début", fmt.dateTime(e.start)), prop("Fin", fmt.time(e.end)), prop("Lieu", e.venue), prop("Contact", e.who && e.who.name), prop("Relatif à", e.what && e.what.name), prop("Hôte", e.owner && e.owner.name)));
    if (e.description) body.append(h("div", { class: "quote" }, e.description));
    const resSel = h("select", { class: "select", id: "act-evres" }, h("option", { value: "" }, "Issue du rendez-vous…"), E.MEETING_RESULTS.map((r) => h("option", { value: r, selected: r === e.result ? true : null }, r)));
    const target = relatedTarget(e);
    body.append(h("div", { class: "panel" }, h("h3", null, "Issue du rendez-vous"),
      h("div", { class: "row" }, resSel, h("button", { class: "btn primary", onclick: () => performWrite({ kind: "update", module: "Events", id: e.id, record: { R_sultat_de_la_r_union: resSel.value }, label: "Issue enregistrée", instruction: E.claudeInstruction("eventResult", { module: "Events", id: e.id, name: e.title, value: resSel.value }), apply: () => { e.result = resSel.value; } }) }, "Enregistrer")),
      target ? h("button", { class: "btn", onclick: () => openDrawer(target.module, target.id) }, `Ouvrir ${target.module === "Deals" ? "l'affaire" : "le prospect"}`) : null));
    body.append(h("div", { class: "small faint" }, `Zoho CRM · Events · ${e.id}`));
  }

  /* ---- Formulaires d'action ---- */
  function showForm(body, kind, rec) {
    const host = $("#form-host", body);
    host.replaceChildren();
    const isDeal = rec.module === "Deals";
    const parent = { parentModule: rec.module, parentId: rec.id, contactId: isDeal && rec.contact ? rec.contact.id : null };
    const name = isDeal ? (rec.contact ? rec.contact.name : rec.name) : rec.name;
    const panel = h("div", { class: "panel" });
    const tomorrow10 = (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d; })();
    const localIso = (d) => { const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

    if (kind === "task") {
      const subj = h("input", { class: "input", id: "f-subject", value: `Relancer ${name}` });
      const due = h("input", { class: "input", id: "f-due", type: "date", value: E.zohoDate(Date.now() + MS_DAY) });
      const prio = h("select", { class: "select", id: "f-prio" }, E.TASK_PRIORITIES.map((p) => h("option", { value: p, selected: p === "Normal" ? true : null }, E.TASK_PRIORITY_FR[p])));
      const desc = h("textarea", { class: "input", id: "f-desc", placeholder: "Détails (facultatif)" });
      panel.append(h("h3", null, "Nouvelle tâche"), h("div", { class: "form-grid" }, h("div", { class: "field" }, h("label", { for: "f-subject" }, "Objet"), subj), h("div", { class: "field" }, h("label", { for: "f-due" }, "Échéance"), due), h("div", { class: "field" }, h("label", { for: "f-prio" }, "Priorité"), prio)), desc,
        h("div", { class: "actions" }, h("button", { class: "btn primary", onclick: () => performWrite({ kind: "create", module: "Tasks", record: E.taskRecord(Object.assign({ subject: subj.value, due: due.value, priority: prio.value, description: desc.value }, parent)), label: "Tâche créée",
          instruction: E.claudeInstruction("task", { module: rec.module, id: rec.id, name, value: subj.value, due: due.value, priority: E.TASK_PRIORITY_FR[prio.value] }),
          apply: (res) => { state.data.tasks.unshift(E.normalizeTask({ id: res.id || `local-${Date.now()}`, Subject: subj.value, Due_Date: due.value, Status: "Not Started", Priority: prio.value, What_Id: { id: rec.id, name }, $se_module: rec.module, Owner: rec.owner, Description: desc.value })); } }) }, "Créer la tâche"), h("button", { class: "btn ghost", onclick: () => host.replaceChildren() }, "Annuler")));
    } else if (kind === "call") {
      const subj = h("input", { class: "input", id: "f-subject", value: `Appel ${name}` });
      const when = h("input", { class: "input", id: "f-when", type: "datetime-local", value: localIso(tomorrow10) });
      const desc = h("textarea", { class: "input", id: "f-desc", placeholder: "Sujets à aborder (facultatif)" });
      panel.append(h("h3", null, "Planifier un appel sortant"), h("div", { class: "form-grid" }, h("div", { class: "field" }, h("label", { for: "f-subject" }, "Objet"), subj), h("div", { class: "field" }, h("label", { for: "f-when" }, "Date et heure"), when)), desc,
        h("div", { class: "actions" }, h("button", { class: "btn primary", onclick: () => { const t = new Date(when.value).getTime(); if (!t) return toast("Indiquez une date et une heure", "crit"); performWrite({ kind: "create", module: "Calls", record: E.callRecord(Object.assign({ subject: subj.value, startIso: E.zohoDateTime(t), description: desc.value }, parent)), label: "Appel planifié",
          instruction: E.claudeInstruction("call", { module: rec.module, id: rec.id, name, value: subj.value, when: fmt.dateTime(t) }),
          apply: (res) => { state.data.calls.unshift(E.normalizeCall({ id: res.id || `local-${Date.now()}`, Subject: subj.value, Call_Type: "Outbound", Call_Start_Time: new Date(t).toISOString(), Outgoing_Call_Status: "Scheduled", What_Id: { id: rec.id, name }, $se_module: rec.module, Owner: rec.owner, Description: desc.value })); } }); } }, "Planifier"), h("button", { class: "btn ghost", onclick: () => host.replaceChildren() }, "Annuler")));
    } else if (kind === "event") {
      const title = h("input", { class: "input", id: "f-title", value: `${name} and RDV téléphonique avec le Pr AKNIN` });
      const when = h("input", { class: "input", id: "f-when", type: "datetime-local", value: localIso(tomorrow10) });
      const dur = h("select", { class: "select", id: "f-dur" }, [[25, "25 min"], [30, "30 min"], [60, "1 h"]].map(([v, l]) => h("option", { value: v }, l)));
      const venue = h("select", { class: "select", id: "f-venue" }, ["En ligne", "Bureau", "Emplacement du client"].map((v) => h("option", { value: v }, v)));
      panel.append(h("h3", null, "Planifier un rendez-vous"), h("div", { class: "form-grid" }, h("div", { class: "field" }, h("label", { for: "f-title" }, "Titre"), title), h("div", { class: "field" }, h("label", { for: "f-when" }, "Début"), when), h("div", { class: "field" }, h("label", { for: "f-dur" }, "Durée"), dur), h("div", { class: "field" }, h("label", { for: "f-venue" }, "Lieu"), venue)),
        h("div", { class: "actions" }, h("button", { class: "btn primary", onclick: () => { const t = new Date(when.value).getTime(); if (!t) return toast("Indiquez une date et une heure", "crit"); const end = t + Number(dur.value) * 60000; performWrite({ kind: "create", module: "Events", record: E.eventRecord(Object.assign({ title: title.value, startIso: E.zohoDateTime(t), endIso: E.zohoDateTime(end), venueType: venue.value, venue: venue.value === "Bureau" ? "École Supérieure d'Orthodontie, 4 rue Jacques-Cartier, 75018 Paris" : null }, parent)), label: "Rendez-vous créé",
          instruction: E.claudeInstruction("event", { module: rec.module, id: rec.id, name, value: title.value, when: fmt.dateTime(t), extra: `${dur.options[dur.selectedIndex].text}, ${venue.value}` }),
          apply: (res) => { state.data.events.unshift(E.normalizeEvent({ id: res.id || `local-${Date.now()}`, Event_Title: title.value, Start_DateTime: new Date(t).toISOString(), End_DateTime: new Date(end).toISOString(), Meeting_Venue__s: venue.value, What_Id: { id: rec.id, name }, $se_module: rec.module, Owner: rec.owner })); } }); } }, "Créer le RDV"), h("button", { class: "btn ghost", onclick: () => host.replaceChildren() }, "Annuler")));
    } else if (kind === "note") {
      const content = h("textarea", { class: "input", id: "f-note", placeholder: "Compte rendu, points abordés, prochaine étape…" });
      panel.append(h("h3", null, "Ajouter une note"), content,
        h("div", { class: "actions" }, h("button", { class: "btn primary", onclick: () => { if (!content.value.trim()) return toast("La note est vide", "crit"); performWrite({ kind: "note", module: "Notes", record: E.noteRecord({ title: `Note du ${fmt.date(Date.now())}`, content: content.value.trim(), parentId: rec.id, parentModule: rec.module }), label: "Note ajoutée",
          instruction: E.claudeInstruction("note", { module: rec.module, id: rec.id, name, value: content.value.trim() }), apply: () => { host.replaceChildren(); } }); } }, "Enregistrer la note"), h("button", { class: "btn ghost", onclick: () => host.replaceChildren() }, "Annuler")));
    } else if (kind === "convert") {
      const promo = h("input", { class: "input", id: "f-promo", placeholder: "ex. 2027/2030", value: "" });
      const info = h("p", { class: "small muted" }, "La conversion crée le contact et l'affaire « Recrutement Scolarité » (pipeline Recrutement, étape Évaluation initiale). Cette action passe par Claude ou par l'outil de conversion du connecteur s'il est activé.");
      panel.append(h("h3", null, "Convertir en candidat"), info, h("div", { class: "field" }, h("label", { for: "f-promo" }, "Promotion visée"), promo),
        h("div", { class: "actions" }, h("button", { class: "btn primary", onclick: () => {
          const instruction = E.claudeInstruction("convert", { module: "Leads", id: rec.id, name, extra: promo.value || null });
          if (state.write.convert && !state.demo) {
            performWrite({ kind: "convert", module: "Leads", id: rec.id, record: { Deals: { Deal_Name: `${name} - Recrutement Scolarité${promo.value ? " " + promo.value : ""}`, Stage: "Évaluation initiale", Pipeline: "Recrutement", Type: "Recrutement" }, overwrite: true, notify_lead_owner: false }, label: "Prospect converti", instruction, apply: () => { rec.converted = true; } });
          } else if (state.demo) { rec.converted = true; rec.status = "A convertir"; toast("Conversion simulée (démonstration)", "good"); render(); }
          else { copyText(instruction); showInstruction(body, instruction, "La conversion n'est pas disponible directement depuis ce tableau de bord."); }
        } }, "Convertir"), h("button", { class: "btn ghost", onclick: () => host.replaceChildren() }, "Annuler")));
    }
    host.append(panel);
    panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function showInstruction(body, instruction, why) {
    const host = $("#form-host", body) || body;
    host.replaceChildren(h("div", { class: "panel" }, h("h3", null, "Instruction pour Claude"), why ? h("p", { class: "small muted" }, why) : null,
      h("p", { class: "small muted" }, "Collez cette instruction dans la conversation Claude : elle effectuera la modification dans Zoho CRM."), h("div", { class: "quote", id: "instruction-text" }, instruction),
      h("div", { class: "actions" }, h("button", { class: "btn primary", onclick: () => copyText(instruction) }, icon("copy"), "Copier l'instruction"))));
    host.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  /**
   * Chemin unique d'écriture : outil d'écriture du connecteur si disponible,
   * simulation en démonstration, sinon instruction à coller dans Claude.
   */
  async function performWrite(o) {
    const body = $(".drawer-body");
    if (state.demo) { o.apply && o.apply({ id: `demo-${Date.now()}` }); toast(`${o.label} (simulation)`, "good"); render(); return; }
    const toolKind = o.kind === "note" ? (state.write.note ? "note" : "create") : o.kind;
    if (!state.write[toolKind]) {
      copyText(o.instruction);
      if (body) showInstruction(body, o.instruction, "Le connecteur Zoho CRM est en lecture seule.");
      return;
    }
    const btns = body ? [...body.querySelectorAll("button")] : [];
    btns.forEach((b) => (b.disabled = true));
    try {
      const res = await writeZoho(o.kind === "note" && !state.write.note ? "create" : o.kind, { module: o.module, id: o.id, record: o.record });
      o.apply && o.apply(res);
      toast(o.label, "good");
      render();
      setTimeout(() => loadAll(true), 1500);
    } catch (err) {
      btns.forEach((b) => (b.disabled = false));
      const c = errorCopy(err);
      if (["server_unavailable", "upstream_error"].includes(c.code)) toast(`${c.title}. Vérifiez dans Zoho CRM si la modification a été appliquée avant de réessayer.`, "crit");
      else if (c.code === "tool_error" || c.code === "bad_request") { toast(`Zoho CRM a refusé l'écriture : ${c.detail || c.title}`, "crit"); if (body) showInstruction(body, o.instruction, "L'écriture directe a échoué ; Claude peut effectuer la modification."); }
      else { toast(`${c.title} ${c.text}`.trim(), "crit"); if (body) showInstruction(body, o.instruction, c.text); }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Demander à Claude (capacité sample)                                  */
  /* ------------------------------------------------------------------ */
  async function runSample(btn, out, prompt) {
    out.hidden = false;
    if (state.demo && !state.sample) { out.textContent = "En démonstration hors de Claude, le briefing n'est pas généré. Ouvrez l'artefact dans Claude pour l'activer."; return; }
    btn.disabled = true; out.textContent = "Claude réfléchit…";
    try {
      const r = await state.sample(prompt, { onText: ({ text }) => { out.textContent = text; }, modelTier: "default", cache: false });
      out.textContent = r.text || out.textContent;
    } catch (err) {
      const code = err && err.code;
      out.textContent = code === "not_granted" ? "Vous avez refusé l'accès à Claude pour cette page." : code === "rate_limited" ? "Trop de demandes : réessayez dans un instant." : `Impossible de générer le texte (${code || "erreur"}).`;
    } finally { btn.disabled = false; }
  }
  const CONTEXT = "Tu es l'assistant du responsable commercial de l'École Supérieure d'Orthodontie (ESO), école privée parisienne qui forme des chirurgiens-dentistes à l'orthodontie sur 3 ans (scolarité 38 000 €, acompte à verser pour valider l'inscription, option Startbox de matériel). Les prospects sont des chirurgiens-dentistes ou étudiants en dentaire. Réponds en français, de façon concrète et brève, sans formules de politesse inutiles.";
  function dailyBriefPrompt(k, ag, hot, stalled) {
    return `${CONTEXT}\n\nVoici l'état du jour (${fmt.dateFull(Date.now())}) :\n- Nouveaux prospects (${k.days} j) : ${k.newLeads} (${fmt.delta(k.newLeadsDelta)})\n- Prospects à traiter (Nouveau / Non contacté) : ${k.todo}, le plus ancien attend depuis ${k.oldestTodoAgeDays ?? 0} j\n- Taux de qualification : ${k.qualifiedRate} %\n- Affaires ouvertes : ${k.openDeals} (${fmt.money(k.openAmount)}), acomptes en attente : ${k.depositPending}\n- Inscriptions gagnées (${k.days} j) : ${k.won}, taux de gain ${k.winRate} %\n- Tâches en retard : ${k.overdueTasks} ; aujourd'hui : ${ag.calls.length} appels planifiés, ${ag.events.length} RDV, ${ag.today.length} tâches\n\nTâches en retard : ${ag.overdue.slice(0, 8).map((t) => `${t.subject} (échéance ${fmt.date(t.due)})`).join(" ; ") || "aucune"}\nProspects chauds : ${hot.slice(0, 6).map((l) => `${l.name} (${l.status}, score ${l.score}, ${l.source})`).join(" ; ") || "aucun"}\nAffaires sans activité : ${stalled.slice(0, 6).map((s) => `${s.deal.contact ? s.deal.contact.name : s.deal.name} (${s.deal.stage}, ${s.idle} j)`).join(" ; ") || "aucune"}\n\nRédige un briefing de 6 à 10 lignes : les 3 priorités du jour (avec les noms), un point de vigilance, et une action pour améliorer le taux de qualification. Format : liste à puces.`;
  }
  function leadBriefPrompt(l) {
    const acts = activityFor("Leads", l.id).map((a) => `${fmt.date(a.at)} : ${a.text}`).join("\n") || "aucune";
    return `${CONTEXT}\n\nPrépare l'appel de qualification avec ce prospect :\n- Nom : ${l.name}\n- Statut : ${l.status}${l.step ? ` (étape ${l.step})` : ""}, score ${l.score}\n- Statut professionnel : ${l.role || "inconnu"}${l.diplomaYear ? `, diplômé en ${l.diplomaYear}` : ""}\n- Ville : ${l.city || "inconnue"}\n- Origine : ${l.source}${l.campaign ? ` (campagne ${l.campaign})` : ""}\n- Créé ${fmt.relative(l.created, Date.now())}, dernière activité ${fmt.relative(l.lastActivity || l.modified, Date.now())}\n- Message : ${l.message || "aucun"}\n- Motivations : ${l.motivations || "non renseignées"}\n- Projet : ${l.project || "non renseigné"}\n- Activité liée :\n${acts}\n\nDonne : (1) l'objectif de l'appel en une phrase, (2) 4 questions de qualification adaptées à ce profil, (3) les 2 objections probables et comment y répondre, (4) la prochaine étape à proposer. Liste à puces, 12 lignes maximum.`;
  }
  function dealBriefPrompt(d) {
    const acts = activityFor("Deals", d.id).map((a) => `${fmt.date(a.at)} : ${a.text}`).join("\n") || "aucune";
    return `${CONTEXT}\n\nAffaire de recrutement :\n- Candidat : ${d.contact ? d.contact.name : d.name}\n- Étape : ${d.stage} (pipeline ${d.pipeline})${d.promotion ? `, promotion ${d.promotion.name}` : ""}\n- Montant : ${fmt.money(d.amount)}, reçu : ${fmt.money(d.received)}, probabilité ${d.probability ?? "?"} %\n- Clôture prévue : ${fmt.date(d.closing)}\n- Appel d'évaluation : ${d.evalResult || "non renseigné"} ; appréciation ESO : ${d.appreciation || "non renseignée"}\n- Lien d'acompte envoyé : ${fmt.date(d.linkSent)}\n- Sans activité depuis ${E.daysSince(d.lastActivity || d.modified, Date.now())} j\n- Activité liée :\n${acts}\n\nIndique la prochaine action la plus utile (une phrase), le message à envoyer au candidat (4 lignes maximum, ton chaleureux et professionnel) et le risque principal sur ce dossier.`;
  }

  /* ------------------------------------------------------------------ */
  document.addEventListener("DOMContentLoaded", boot);
  window.ESO_UI = { state, render, openDrawer, loadAll };
})();
