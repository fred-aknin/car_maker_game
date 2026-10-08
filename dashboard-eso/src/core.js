/*
 * Dashboard ESO — logique métier pure (sans DOM).
 *
 * Ce module est partagé entre la page publiée (inliné par build.mjs) et les
 * tests Node (`node --test`). Il ne doit dépendre ni de `window` ni de `document`.
 *
 * Tout ce qui touche Zoho CRM est exprimé avec les noms d'API réels de
 * l'organisation ESO (voir ../docs/zoho-schema.md).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ESO = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MS_DAY = 86400000;

  /* ------------------------------------------------------------------ */
  /* 1. Référentiels Zoho CRM (valeurs de listes réelles)               */
  /* ------------------------------------------------------------------ */

  const SERVER = "Zoho CRM";

  /** Champs demandés à getRecords, par module. */
  const FIELDS = {
    Leads: [
      "Full_Name", "First_Name", "Last_Name", "Email", "Phone", "Phone_2",
      "Lead_Status", "Lead_Source", "Etapes_du_prospect", "R_le", "Owner",
      "Created_Time", "Modified_Time", "Last_Activity_Time", "Score", "City",
      "Ann_e_d_obtention_du_dipl_me", "Probabilit_de_conversion_222",
      "Type_du_Prospect", "Est_en_train_de_pourrir", "Campagne_UTM",
      "Converted__s", "Message_Nous_Contacter", "Motivations_Dossier",
      "Projet_Dossier", "Formation_Dossier", "Message_Candidature",
    ],
    Deals: [
      "Deal_Name", "Stage", "Pipeline", "Amount", "Acompte_ESO", "Closing_Date",
      "Contact_Name", "Owner", "Modified_Time", "Created_Time",
      "Last_Activity_Time", "Promotion", "R_sultat_appel_d_valuation_initiale",
      "Reason_For_Loss__s", "Type", "Probability", "Date_de_l_acompte",
      "Montant_des_paiements_re_us", "Montant_re_u_startbox", "Lead_Source",
      "Appr_ciation_ESO", "Type_de_paiement", "Date_d_envoi_du_lien",
    ],
    Tasks: [
      "Subject", "Due_Date", "Status", "Priority", "Who_Id", "What_Id", "Owner",
      "Description", "Created_Time", "Modified_Time", "Closed_Time",
    ],
    Calls: [
      "Subject", "Call_Type", "Call_Purpose", "Call_Result", "Call_Start_Time",
      "Call_Duration", "Call_Duration_in_seconds", "Who_Id", "What_Id", "Owner",
      "Outgoing_Call_Status", "Description", "Created_Time", "Modified_Time",
    ],
    Events: [
      "Event_Title", "Start_DateTime", "End_DateTime", "Who_Id", "What_Id",
      "Owner", "Venue", "Meeting_Venue__s", "R_sultat_de_la_r_union",
      "All_day", "Description", "Created_Time", "Modified_Time",
    ],
  };

  /** Nombre maximal de pages (200 enregistrements chacune) par module. */
  const PAGE_BUDGET = { Leads: 6, Deals: 5, Tasks: 3, Calls: 3, Events: 3 };

  /** Statuts de prospect, dans l'ordre du parcours de qualification. */
  const LEAD_STATUS_ORDER = [
    "Nouveau", "Non contacté", "Contacté", "Pré-qualifié", "Qualifié",
    "A convertir", "Contact à l'avenir",
  ];
  const LEAD_STATUS_DEAD = ["Non qualifié", "Lead perdu", "Spam"];
  const LEAD_STATUS_ALL = LEAD_STATUS_ORDER.concat(LEAD_STATUS_DEAD);
  const LEAD_TODO = ["Nouveau", "Non contacté"];

  /** Étapes du prospect (champ Etapes_du_prospect). */
  const LEAD_STEPS = [
    "Coup de fil Jérôme", "Coup fil sans réponse", "Rdv programmé Dr JJA",
    "Rdv Dr JJA réalisé", "Mail d'admission adressé", "Acompte payé",
  ];

  /** Étapes d'affaire, dans l'ordre du pipeline Recrutement. */
  const DEAL_STAGES = [
    "Évaluation initiale", "Qualification", "Prise de rendez-vous - Admissions",
    "RDV fixé", "Entretiens", "Value Proposition", "Identify Decision Makers",
    "Accord non contractuel", "En attente acompte", "Acompte partiel",
    "Paiement acompte reçu", "Acompte payé", "Engagement contractuel",
    "Gagné", "Closed Won", "Perdu", "Rejeté", "Closed-Lost to Competition",
  ];
  const DEAL_WON = ["Gagné", "Closed Won"];
  const DEAL_LOST = ["Perdu", "Rejeté", "Closed-Lost to Competition"];
  const DEAL_DEPOSIT_PENDING = ["En attente acompte", "Acompte partiel"];
  /** Étapes affichées en priorité dans le kanban (les autres n'apparaissent que si non vides). */
  const DEAL_STAGES_MAIN = [
    "Évaluation initiale", "Prise de rendez-vous - Admissions", "RDV fixé",
    "Entretiens", "Accord non contractuel", "En attente acompte",
    "Acompte partiel", "Acompte payé", "Engagement contractuel", "Gagné", "Perdu",
  ];
  const PIPELINES = ["Recrutement", "Startbox", "Standard (Standard)"];
  const LOSS_REASONS = [
    "A choisi la concurrence", "Problème financement", "Renonce au projet",
    "Internat", "Désistement après acompte", "Candidat non retenu",
    "Manque de réponse", "Autre",
  ];
  const EVAL_RESULTS = [
    "Candidat retenu", "Candidat non retenu", "Le candidat ne donne pas suite",
    "Appel infructueux",
  ];

  const CALL_RESULTS = [
    "Interested", "Not interested", "No response/Busy", "Requested more info",
    "Requested call back", "Invalid number", "Candidat retenu",
  ];
  const CALL_RESULT_FR = {
    "Interested": "Intéressé",
    "Not interested": "Pas intéressé",
    "No response/Busy": "Sans réponse / occupé",
    "Requested more info": "Demande d'infos",
    "Requested call back": "À rappeler",
    "Invalid number": "Numéro invalide",
    "Candidat retenu": "Candidat retenu",
  };
  const CALL_TYPE_FR = { Outbound: "Sortant", Inbound: "Entrant", Missed: "Manqué" };
  const TASK_STATUS_FR = {
    "Not Started": "À faire", "Deferred": "Reportée", "In Progress": "En cours",
    "Completed": "Terminée", "Waiting for input": "En attente",
  };
  const TASK_PRIORITIES = ["Highest", "High", "Normal", "Low", "Lowest"];
  const TASK_PRIORITY_FR = {
    Highest: "Très haute", High: "Haute", Normal: "Normale", Low: "Basse", Lowest: "Très basse",
  };
  const MEETING_RESULTS = ["Suite positive", "Suite négative", "Non aboutie"];

  /* ------------------------------------------------------------------ */
  /* 2. Normalisation des enregistrements Zoho                           */
  /* ------------------------------------------------------------------ */

  function ts(v) {
    if (!v) return null;
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  function dateOnly(v) {
    // "2026-10-07" -> midi local, pour éviter les décalages de fuseau.
    if (!v) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], 12).getTime();
    return ts(v);
  }
  function ref(v) {
    if (!v || typeof v !== "object") return null;
    return { id: v.id || null, name: v.name || v.email || "", email: v.email || null };
  }
  function num(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isNaN(n) ? null : n;
  }
  function yesNo(v) { return v === "Oui" ? true : v === "Non" ? false : null; }

  function normalizeLead(r) {
    const name = r.Full_Name || [r.First_Name, r.Last_Name].filter(Boolean).join(" ") || "(sans nom)";
    return {
      id: String(r.id),
      module: "Leads",
      name,
      firstName: r.First_Name || null,
      lastName: r.Last_Name || null,
      email: r.Email || null,
      phone: r.Phone || r.Phone_2 || null,
      status: r.Lead_Status || "—",
      source: r.Lead_Source || "Inconnue",
      step: r.Etapes_du_prospect || null,
      role: r.R_le || null,
      owner: ref(r.Owner),
      created: ts(r.Created_Time),
      modified: ts(r.Modified_Time),
      lastActivity: ts(r.Last_Activity_Time),
      score: num(r.Score) ?? 0,
      city: r.City || null,
      diplomaYear: num(r.Ann_e_d_obtention_du_dipl_me),
      probability: num(r.Probabilit_de_conversion_222),
      type: r.Type_du_Prospect || null,
      rotting: yesNo(r.Est_en_train_de_pourrir),
      campaign: r.Campagne_UTM || null,
      converted: r.Converted__s === true,
      message: r.Message_Nous_Contacter || r.Message_Candidature || null,
      motivations: r.Motivations_Dossier || null,
      project: r.Projet_Dossier || null,
      training: r.Formation_Dossier || null,
    };
  }

  function normalizeDeal(r) {
    return {
      id: String(r.id),
      module: "Deals",
      name: r.Deal_Name || "(sans nom)",
      stage: r.Stage || "—",
      pipeline: r.Pipeline || "Recrutement",
      amount: num(r.Amount),
      deposit: num(r.Acompte_ESO),
      closing: dateOnly(r.Closing_Date),
      contact: ref(r.Contact_Name),
      owner: ref(r.Owner),
      created: ts(r.Created_Time),
      modified: ts(r.Modified_Time),
      lastActivity: ts(r.Last_Activity_Time),
      promotion: ref(r.Promotion),
      evalResult: r.R_sultat_appel_d_valuation_initiale || null,
      lossReason: r.Reason_For_Loss__s || null,
      type: r.Type || null,
      probability: num(r.Probability),
      depositDate: dateOnly(r.Date_de_l_acompte),
      received: num(r.Montant_des_paiements_re_us) ?? 0,
      receivedStartbox: num(r.Montant_re_u_startbox) ?? 0,
      source: r.Lead_Source || null,
      appreciation: r.Appr_ciation_ESO || null,
      paymentType: r.Type_de_paiement || null,
      linkSent: dateOnly(r.Date_d_envoi_du_lien),
    };
  }

  function normalizeTask(r) {
    return {
      id: String(r.id),
      module: "Tasks",
      subject: r.Subject || "(sans objet)",
      due: dateOnly(r.Due_Date),
      status: r.Status || "Not Started",
      priority: r.Priority || "Normal",
      who: ref(r.Who_Id),
      what: ref(r.What_Id),
      relatedModule: r.$se_module || null,
      owner: ref(r.Owner),
      description: r.Description || null,
      created: ts(r.Created_Time),
      modified: ts(r.Modified_Time),
      closed: ts(r.Closed_Time),
    };
  }

  function normalizeCall(r) {
    return {
      id: String(r.id),
      module: "Calls",
      subject: r.Subject || "(appel)",
      type: r.Call_Type || "Outbound",
      purpose: r.Call_Purpose || null,
      result: r.Call_Result || null,
      start: ts(r.Call_Start_Time),
      duration: r.Call_Duration || null,
      seconds: num(r.Call_Duration_in_seconds) ?? 0,
      who: ref(r.Who_Id),
      what: ref(r.What_Id),
      relatedModule: r.$se_module || null,
      owner: ref(r.Owner),
      status: r.Outgoing_Call_Status || null,
      description: r.Description || null,
      created: ts(r.Created_Time),
      modified: ts(r.Modified_Time),
    };
  }

  function normalizeEvent(r) {
    return {
      id: String(r.id),
      module: "Events",
      title: r.Event_Title || "(réunion)",
      start: ts(r.Start_DateTime),
      end: ts(r.End_DateTime),
      allDay: r.All_day === true,
      who: ref(r.Who_Id),
      what: ref(r.What_Id),
      relatedModule: r.$se_module || null,
      owner: ref(r.Owner),
      venue: r.Venue || null,
      venueType: r.Meeting_Venue__s || null,
      result: r.R_sultat_de_la_r_union || null,
      description: r.Description || null,
      created: ts(r.Created_Time),
      modified: ts(r.Modified_Time),
    };
  }

  const NORMALIZERS = {
    Leads: normalizeLead, Deals: normalizeDeal, Tasks: normalizeTask,
    Calls: normalizeCall, Events: normalizeEvent,
  };

  /** Extrait la liste `data` d'une réponse getRecords / searchRecords. */
  function unwrapRecords(payload) {
    if (!payload) return { records: [], more: false };
    let p = payload;
    if (typeof p === "string") { try { p = JSON.parse(p); } catch (e) { return { records: [], more: false }; } }
    // Formes rencontrées : {status, data:{data:[...], info:{...}}} ou {data:[...], info:{...}}
    const inner = p && p.data && !Array.isArray(p.data) && p.data.data ? p.data : p;
    const records = Array.isArray(inner && inner.data) ? inner.data : [];
    const info = (inner && inner.info) || {};
    return { records, more: info.more_records === true, nextToken: info.next_page_token || null };
  }

  /** Arguments getRecords pour un module et une page. */
  function recordsArgs(module, page, extra) {
    const q = {
      fields: FIELDS[module].join(","),
      per_page: 200,
      page,
      sort_by: "Modified_Time",
      sort_order: "desc",
    };
    if (module === "Leads") q.converted = "false";
    return { path_variables: { module }, query_params: Object.assign(q, extra || {}) };
  }

  /* ------------------------------------------------------------------ */
  /* 3. Indicateurs et agrégations                                        */
  /* ------------------------------------------------------------------ */

  function isWon(d) { return DEAL_WON.includes(d.stage); }
  function isLost(d) { return DEAL_LOST.includes(d.stage); }
  function isOpenDeal(d) { return !isWon(d) && !isLost(d); }
  function isDeadLead(l) { return LEAD_STATUS_DEAD.includes(l.status) || l.converted; }
  function isTodoLead(l) { return LEAD_TODO.includes(l.status) && !l.converted; }
  function isQualifiedLead(l) { return ["Pré-qualifié", "Qualifié", "A convertir"].includes(l.status); }
  function isOpenTask(t) { return t.status !== "Completed"; }

  function startOfDay(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function endOfDay(t) { return startOfDay(t) + MS_DAY - 1; }
  function startOfWeek(t) {
    const d = new Date(startOfDay(t));
    const dow = (d.getDay() + 6) % 7; // lundi = 0
    return d.getTime() - dow * MS_DAY;
  }

  function byOwner(records, ownerId) {
    if (!ownerId || ownerId === "all") return records;
    return records.filter((r) => r.owner && r.owner.id === ownerId);
  }

  function countBy(arr, keyFn) {
    const m = new Map();
    for (const x of arr) {
      const k = keyFn(x);
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  }
  function sortedCounts(map, limit) {
    const out = [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
    return limit ? out.slice(0, limit) : out;
  }

  function pct(a, b) { return b > 0 ? Math.round((a / b) * 100) : 0; }
  function delta(cur, prev) {
    if (prev === 0) return cur === 0 ? 0 : null; // null = « nouveau » (pas de base)
    return Math.round(((cur - prev) / prev) * 100);
  }

  /**
   * Indicateurs du cockpit.
   * @param data {leads, deals, tasks, calls, events} normalisés
   * @param opts {now, days, owner}
   */
  function computeKpis(data, opts) {
    const now = opts.now;
    const days = opts.days || 30;
    const owner = opts.owner || "all";
    const from = now - days * MS_DAY;
    const prevFrom = from - days * MS_DAY;

    const leads = byOwner(data.leads, owner);
    const deals = byOwner(data.deals, owner);
    const tasks = byOwner(data.tasks, owner);
    const calls = byOwner(data.calls, owner);
    const events = byOwner(data.events, owner);

    const inPeriod = (t) => t !== null && t >= from && t <= now;
    const inPrev = (t) => t !== null && t >= prevFrom && t < from;

    const newLeads = leads.filter((l) => inPeriod(l.created));
    const newLeadsPrev = leads.filter((l) => inPrev(l.created));
    const todo = leads.filter(isTodoLead);
    const oldestTodo = todo.reduce((acc, l) => (l.created && (acc === null || l.created < acc) ? l.created : acc), null);
    const qualified = newLeads.filter(isQualifiedLead);
    const qualifiedPrev = newLeadsPrev.filter(isQualifiedLead);

    const recruit = deals.filter((d) => d.pipeline === "Recrutement");
    const open = recruit.filter(isOpenDeal);
    const weighted = open.reduce((s, d) => s + (d.amount || 0) * ((d.probability ?? 0) / 100), 0);
    const openAmount = open.reduce((s, d) => s + (d.amount || 0), 0);
    const depositPending = open.filter((d) => DEAL_DEPOSIT_PENDING.includes(d.stage));
    const won = recruit.filter((d) => isWon(d) && inPeriod(d.modified));
    const wonPrev = recruit.filter((d) => isWon(d) && inPrev(d.modified));
    const lost = recruit.filter((d) => isLost(d) && inPeriod(d.modified));
    const closedTotal = won.length + lost.length;

    const today0 = startOfDay(now);
    const overdueTasks = tasks.filter((t) => isOpenTask(t) && t.due !== null && t.due < today0);
    const todayTasks = tasks.filter((t) => isOpenTask(t) && t.due !== null && t.due >= today0 && t.due <= endOfDay(now));
    const upcomingEvents = events.filter((e) => e.start !== null && e.start >= now && e.start <= now + 7 * MS_DAY);
    const done = calls.filter((c) => c.status !== "Scheduled");
    const callsPeriod = done.filter((c) => inPeriod(c.start));
    const callsPrev = done.filter((c) => inPrev(c.start));
    const talkSeconds = callsPeriod.reduce((s, c) => s + (c.seconds || 0), 0);

    return {
      days,
      newLeads: newLeads.length,
      newLeadsDelta: delta(newLeads.length, newLeadsPrev.length),
      todo: todo.length,
      oldestTodoAgeDays: oldestTodo === null ? null : Math.floor((now - oldestTodo) / MS_DAY),
      qualified: qualified.length,
      qualifiedRate: pct(qualified.length, newLeads.length),
      qualifiedRatePrev: pct(qualifiedPrev.length, newLeadsPrev.length),
      openDeals: open.length,
      openAmount,
      weighted: Math.round(weighted),
      depositPending: depositPending.length,
      depositPendingAmount: depositPending.reduce((s, d) => s + (d.amount || 0), 0),
      won: won.length,
      wonDelta: delta(won.length, wonPrev.length),
      wonAmount: won.reduce((s, d) => s + (d.amount || 0), 0),
      winRate: pct(won.length, closedTotal),
      overdueTasks: overdueTasks.length,
      todayTasks: todayTasks.length,
      upcomingEvents: upcomingEvents.length,
      calls: callsPeriod.length,
      callsDelta: delta(callsPeriod.length, callsPrev.length),
      talkMinutes: Math.round(talkSeconds / 60),
    };
  }

  /** Prospects créés par semaine (semaines ISO commençant le lundi), les `weeks` dernières. */
  function leadsPerWeek(leads, weeks, now) {
    const thisWeek = startOfWeek(now);
    const buckets = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const start = thisWeek - i * 7 * MS_DAY;
      buckets.push({ start, end: start + 7 * MS_DAY, count: 0, qualified: 0 });
    }
    for (const l of leads) {
      if (l.created === null) continue;
      const b = buckets.find((x) => l.created >= x.start && l.created < x.end);
      if (b) { b.count++; if (isQualifiedLead(l) || l.converted) b.qualified++; }
    }
    return buckets;
  }

  /** Entonnoir de qualification sur un ensemble de prospects. */
  function leadFunnel(leads) {
    const counts = countBy(leads, (l) => l.status);
    const rows = LEAD_STATUS_ORDER.map((s) => ({ status: s, count: counts.get(s) || 0 }));
    const dead = LEAD_STATUS_DEAD.map((s) => ({ status: s, count: counts.get(s) || 0 }));
    const known = new Set(LEAD_STATUS_ALL);
    const other = [...counts.entries()].filter(([s]) => !known.has(s)).reduce((n, [, c]) => n + c, 0);
    return { rows, dead, other };
  }

  /** Synthèse pipeline : par étape, nombre et montant, dans l'ordre canonique. */
  function pipelineSummary(deals, pipeline) {
    const sel = deals.filter((d) => !pipeline || pipeline === "all" || d.pipeline === pipeline);
    const map = new Map();
    for (const d of sel) {
      const e = map.get(d.stage) || { stage: d.stage, count: 0, amount: 0, deals: [] };
      e.count++; e.amount += d.amount || 0; e.deals.push(d);
      map.set(d.stage, e);
    }
    const order = (s) => { const i = DEAL_STAGES.indexOf(s); return i === -1 ? 999 : i; };
    return [...map.values()].sort((a, b) => order(a.stage) - order(b.stage) || a.stage.localeCompare(b.stage));
  }

  /** Colonnes du kanban : étapes principales + étapes non vides, dans l'ordre. */
  function kanbanColumns(deals) {
    const present = new Set(deals.map((d) => d.stage));
    const cols = DEAL_STAGES.filter((s) => DEAL_STAGES_MAIN.includes(s) || present.has(s));
    for (const s of present) if (!cols.includes(s)) cols.push(s);
    return cols;
  }

  function daysSince(t, now) { return t === null ? null : Math.floor((now - t) / MS_DAY); }

  /** Affaires ouvertes sans activité depuis plus de `days` jours. */
  function stalledDeals(deals, now, days) {
    return deals
      .filter((d) => isOpenDeal(d))
      .map((d) => ({ deal: d, idle: daysSince(d.lastActivity || d.modified, now) }))
      .filter((x) => x.idle !== null && x.idle > days)
      .sort((a, b) => b.idle - a.idle);
  }

  /** Prospects chauds : qualifiés, non convertis, triés par score puis fraîcheur. */
  function hotLeads(leads, limit) {
    return leads
      .filter((l) => !isDeadLead(l) && (isQualifiedLead(l) || l.score >= 25))
      .sort((a, b) => b.score - a.score || (b.modified || 0) - (a.modified || 0))
      .slice(0, limit || 8);
  }

  /** Agenda du jour : tâches en retard / du jour, appels planifiés, réunions. */
  function todayAgenda(data, now) {
    const d0 = startOfDay(now), d1 = endOfDay(now);
    const overdue = data.tasks.filter((t) => isOpenTask(t) && t.due !== null && t.due < d0)
      .sort((a, b) => a.due - b.due);
    const today = data.tasks.filter((t) => isOpenTask(t) && t.due !== null && t.due >= d0 && t.due <= d1);
    const calls = data.calls.filter((c) => c.status === "Scheduled" && c.start !== null && c.start >= d0 && c.start <= d1)
      .sort((a, b) => a.start - b.start);
    const events = data.events.filter((e) => e.start !== null && e.start >= d0 && e.start <= d1)
      .sort((a, b) => a.start - b.start);
    return { overdue, today, calls, events };
  }

  /** Grille de planning : 7 jours à partir du lundi de la semaine de `anchor`. */
  function weekGrid(data, anchor) {
    const start = startOfWeek(anchor);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d0 = start + i * MS_DAY, d1 = d0 + MS_DAY - 1;
      const items = [];
      for (const e of data.events) if (e.start !== null && e.start >= d0 && e.start <= d1) items.push({ kind: "event", at: e.start, item: e });
      for (const c of data.calls) if (c.start !== null && c.start >= d0 && c.start <= d1 && (c.status === "Scheduled" || c.start >= Date.now())) items.push({ kind: "call", at: c.start, item: c });
      for (const t of data.tasks) if (t.due !== null && t.due >= d0 && t.due <= d1 && isOpenTask(t)) items.push({ kind: "task", at: t.due, item: t });
      items.sort((a, b) => a.at - b.at);
      days.push({ start: d0, items });
    }
    return { start, days };
  }

  /** Statistiques d'appels sur une période. */
  function callStats(calls, now, days) {
    const from = now - days * MS_DAY;
    const sel = calls.filter((c) => c.status !== "Scheduled" && c.start !== null && c.start >= from && c.start <= now);
    const byType = countBy(sel, (c) => c.type);
    const byResult = countBy(sel.filter((c) => c.result), (c) => c.result);
    const byOwnerMap = new Map();
    for (const c of sel) {
      const k = c.owner ? c.owner.name : "—";
      const e = byOwnerMap.get(k) || { owner: k, count: 0, seconds: 0, answered: 0 };
      e.count++; e.seconds += c.seconds || 0; if (c.seconds >= 60) e.answered++;
      byOwnerMap.set(k, e);
    }
    const answered = sel.filter((c) => c.seconds >= 60).length;
    const scheduled = calls.filter((c) => c.status === "Scheduled" && c.start !== null && c.start >= now);
    const overdueScheduled = calls.filter((c) => c.status === "Scheduled" && c.start !== null && c.start < now);
    return {
      total: sel.length,
      answered,
      answerRate: pct(answered, sel.length),
      minutes: Math.round(sel.reduce((s, c) => s + (c.seconds || 0), 0) / 60),
      byType: sortedCounts(byType),
      byResult: sortedCounts(byResult),
      byOwner: [...byOwnerMap.values()].sort((a, b) => b.count - a.count),
      scheduled: scheduled.sort((a, b) => a.start - b.start),
      overdueScheduled,
    };
  }

  /** Répartition des prospects par source (top N + « Autres »). */
  function sourceBreakdown(leads, limit) {
    const counts = sortedCounts(countBy(leads, (l) => l.source));
    const top = counts.slice(0, limit);
    const rest = counts.slice(limit).reduce((n, [, c]) => n + c, 0);
    if (rest > 0) top.push(["Autres", rest]);
    return top.map(([source, count]) => ({ source, count }));
  }

  /** Propriétaires distincts présents dans les données. */
  function owners(data) {
    const m = new Map();
    for (const k of ["leads", "deals", "tasks", "calls", "events"]) {
      for (const r of data[k] || []) if (r.owner && r.owner.id) m.set(r.owner.id, r.owner.name);
    }
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }

  /* ------------------------------------------------------------------ */
  /* 4. Filtrage et recherche                                            */
  /* ------------------------------------------------------------------ */

  function fold(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  function filterLeads(leads, f) {
    const q = fold(f.q || "").trim();
    return leads.filter((l) => {
      if (f.status && f.status !== "all") {
        if (f.status === "todo" && !isTodoLead(l)) return false;
        if (f.status === "hot" && !(isQualifiedLead(l) || l.score >= 25)) return false;
        if (f.status === "dead" && !isDeadLead(l)) return false;
        if (!["todo", "hot", "dead"].includes(f.status) && l.status !== f.status) return false;
      }
      if (f.source && f.source !== "all" && l.source !== f.source) return false;
      if (f.owner && f.owner !== "all" && !(l.owner && l.owner.id === f.owner)) return false;
      if (q) {
        const hay = fold([l.name, l.email, l.phone, l.city, l.source, l.status].join(" "));
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function sortLeads(leads, key, dir) {
    const m = dir === "asc" ? 1 : -1;
    const get = {
      name: (l) => fold(l.name), created: (l) => l.created || 0, modified: (l) => l.modified || 0,
      score: (l) => l.score || 0, status: (l) => { const i = LEAD_STATUS_ALL.indexOf(l.status); return i === -1 ? 99 : i; },
      source: (l) => fold(l.source),
    }[key] || ((l) => l.modified || 0);
    return leads.slice().sort((a, b) => { const x = get(a), y = get(b); return x < y ? -m : x > y ? m : 0; });
  }

  /* ------------------------------------------------------------------ */
  /* 5. Écriture Zoho (outils d'écriture optionnels du connecteur)       */
  /* ------------------------------------------------------------------ */

  const READ_TOOLS = ["ZohoCRM_getRecords", "ZohoCRM_getRecord", "ZohoCRM_searchRecords", "ZohoCRM_getNoteById"];
  /** Noms d'outils d'écriture reconnus, par ordre de préférence. */
  const WRITE_TOOL_CANDIDATES = {
    update: ["ZohoCRM_updateRecord", "ZohoCRM_updateRecords", "ZohoCRM_upsertRecords"],
    create: ["ZohoCRM_createRecords", "ZohoCRM_insertRecords", "ZohoCRM_createRecord"],
    convert: ["ZohoCRM_convertLead", "ZohoCRM_convertLeads"],
    note: ["ZohoCRM_createNotes", "ZohoCRM_createNote"],
  };
  const ALL_WRITE_TOOLS = Object.values(WRITE_TOOL_CANDIDATES).flat();

  /** Choisit, parmi les outils réellement exposés, ceux à utiliser pour chaque action. */
  function pickWriteTools(toolNames) {
    const set = new Set(toolNames || []);
    const out = {};
    for (const [action, cands] of Object.entries(WRITE_TOOL_CANDIDATES)) {
      out[action] = cands.find((n) => set.has(n)) || null;
    }
    out.any = Boolean(out.update || out.create || out.note || out.convert);
    return out;
  }

  /**
   * Construit les arguments d'un outil d'écriture à partir de son schéma JSON
   * (`describeTool`), ou d'une forme par défaut si le schéma est inconnu.
   *
   * @param schema  inputSchema de l'outil (peut être null)
   * @param op      {module, id?, record}
   */
  function buildWriteArgs(schema, op) {
    const props = (schema && schema.properties) || null;
    const record = Object.assign({}, op.record);
    const args = {};
    if (!props) {
      // Forme Zoho MCP par défaut : path_variables + body {data:[...]}
      const pv = { module: op.module };
      if (op.id) pv.recordId = op.id;
      args.path_variables = pv;
      args.body = { data: [record] };
      return args;
    }
    // Variables de chemin
    const pvKey = ["path_variables", "pathVariables", "path"].find((k) => props[k]);
    if (pvKey) {
      const pv = {};
      const sub = (props[pvKey].properties) || {};
      for (const k of Object.keys(sub)) {
        if (/module/i.test(k)) pv[k] = op.module;
        else if (op.id && /(record|^id$|_id$|Id$)/i.test(k)) pv[k] = op.id;
      }
      if (!Object.keys(pv).length) pv.module = op.module;
      args[pvKey] = pv;
    } else if (props.module) {
      args.module = op.module;
      if (op.id) { const idKey = ["recordId", "record_id", "id"].find((k) => props[k]); if (idKey) args[idKey] = op.id; }
    }
    // Si l'identifiant ne passe pas par le chemin, il voyage dans l'enregistrement
    const idInPath = pvKey && Object.keys((props[pvKey].properties) || {}).some((k) => op.id && /(record|^id$|_id$|Id$)/i.test(k));
    if (op.id && !idInPath && !args.recordId && !args.record_id && !args.id) record.id = op.id;
    // Corps
    const bodyKey = ["body", "request_body", "requestBody", "payload", "data", "input", "record", "records"].find((k) => props[k]);
    if (!bodyKey) { args.body = { data: [record] }; return args; }
    const bs = props[bodyKey] || {};
    if (bodyKey === "data" || bodyKey === "records") args[bodyKey] = bs.type === "array" ? [record] : (bs.properties && bs.properties.data ? { data: [record] } : record);
    else if (bodyKey === "record") args.record = record;
    else if (bs.properties && bs.properties.data) args[bodyKey] = { data: [record] };
    else if (bs.type === "array") args[bodyKey] = [record];
    else args[bodyKey] = { data: [record] };
    return args;
  }

  /** Enregistrement Zoho pour une tâche liée à un prospect ou une affaire. */
  function taskRecord(o) {
    const r = { Subject: o.subject, Status: o.status || "Not Started", Priority: o.priority || "Normal" };
    if (o.due) r.Due_Date = o.due;
    if (o.description) r.Description = o.description;
    if (o.parentModule === "Leads") { r.What_Id = o.parentId; r.$se_module = "Leads"; }
    else if (o.parentModule === "Deals") { r.What_Id = o.parentId; r.$se_module = "Deals"; if (o.contactId) r.Who_Id = o.contactId; }
    else if (o.parentModule === "Contacts") { r.Who_Id = o.parentId; }
    return r;
  }

  /** Enregistrement Zoho pour un appel planifié. */
  function callRecord(o) {
    const r = {
      Subject: o.subject, Call_Type: "Outbound", Outgoing_Call_Status: "Scheduled",
      Call_Start_Time: o.startIso, Call_Purpose: o.purpose || "Prospecting",
    };
    if (o.description) r.Description = o.description;
    if (o.parentModule === "Leads") { r.What_Id = o.parentId; r.$se_module = "Leads"; }
    else if (o.parentModule === "Deals") { r.What_Id = o.parentId; r.$se_module = "Deals"; if (o.contactId) r.Who_Id = o.contactId; }
    else if (o.parentModule === "Contacts") { r.Who_Id = o.parentId; }
    return r;
  }

  /** Enregistrement Zoho pour une réunion. */
  function eventRecord(o) {
    const r = { Event_Title: o.title, Start_DateTime: o.startIso, End_DateTime: o.endIso };
    if (o.venueType) r.Meeting_Venue__s = o.venueType;
    if (o.venue) r.Venue = o.venue;
    if (o.description) r.Description = o.description;
    if (o.parentModule === "Leads") { r.What_Id = o.parentId; r.$se_module = "Leads"; }
    else if (o.parentModule === "Deals") { r.What_Id = o.parentId; r.$se_module = "Deals"; if (o.contactId) r.Who_Id = o.contactId; }
    return r;
  }

  /** Enregistrement Zoho pour une note. */
  function noteRecord(o) {
    return { Note_Title: o.title || "Note", Note_Content: o.content, Parent_Id: o.parentId, se_module: o.parentModule };
  }

  /** Date ISO avec décalage local, au format attendu par Zoho (yyyy-MM-ddTHH:mm:ss+HH:mm). */
  function zohoDateTime(t) {
    const d = new Date(t);
    const p = (n) => String(n).padStart(2, "0");
    const off = -d.getTimezoneOffset();
    const sign = off >= 0 ? "+" : "-";
    const a = Math.abs(off);
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${sign}${p(Math.floor(a / 60))}:${p(a % 60)}`;
  }
  function zohoDate(t) {
    const d = new Date(t);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  /**
   * Instruction en français à coller dans Claude (mode lecture seule ou
   * action non couverte par le connecteur).
   */
  function claudeInstruction(action, o) {
    const who = o.name ? `« ${o.name} »` : "";
    const idPart = `(${o.module === "Deals" ? "affaire" : o.module === "Leads" ? "prospect" : "enregistrement"} Zoho CRM id ${o.id})`;
    switch (action) {
      case "status": return `Dans Zoho CRM, passe le prospect ${who} ${idPart} au statut « ${o.value} ».`;
      case "step": return `Dans Zoho CRM, mets l'étape du prospect ${who} ${idPart} à « ${o.value} ».`;
      case "stage": return `Dans Zoho CRM, passe l'affaire ${who} ${idPart} à l'étape « ${o.value} »${o.extra ? ` (${o.extra})` : ""}.`;
      case "note": return `Dans Zoho CRM, ajoute cette note sur ${who} ${idPart} :\n${o.value}`;
      case "task": return `Dans Zoho CRM, crée une tâche « ${o.value} » liée à ${who} ${idPart}${o.due ? `, échéance ${o.due}` : ""}${o.priority ? `, priorité ${o.priority}` : ""}.`;
      case "call": return `Dans Zoho CRM, planifie un appel sortant « ${o.value} » avec ${who} ${idPart} le ${o.when}.`;
      case "event": return `Dans Zoho CRM, crée une réunion « ${o.value} » avec ${who} ${idPart} le ${o.when}${o.extra ? ` (${o.extra})` : ""}.`;
      case "convert": return `Dans Zoho CRM, convertis le prospect ${who} ${idPart} en contact et crée l'affaire de recrutement associée (pipeline Recrutement, étape « Évaluation initiale »${o.extra ? `, promotion ${o.extra}` : ""}).`;
      case "taskDone": return `Dans Zoho CRM, marque la tâche ${who} ${idPart} comme terminée.`;
      case "callResult": return `Dans Zoho CRM, enregistre le résultat « ${o.value} » pour l'appel ${who} ${idPart}.`;
      case "eventResult": return `Dans Zoho CRM, enregistre le résultat « ${o.value} » pour la réunion ${who} ${idPart}.`;
      default: return `Dans Zoho CRM, sur ${who} ${idPart} : ${o.value || action}.`;
    }
  }

  /* ------------------------------------------------------------------ */
  /* 6. Formatage                                                         */
  /* ------------------------------------------------------------------ */

  const fmt = {
    money(n) {
      if (n === null || n === undefined) return "—";
      return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
    },
    moneyShort(n) {
      if (n === null || n === undefined) return "—";
      if (Math.abs(n) >= 1000) return `${(n / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k€`;
      return `${Math.round(n)} €`;
    },
    int(n) { return (n ?? 0).toLocaleString("fr-FR"); },
    date(t) { return t ? new Date(t).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) : "—"; },
    dateFull(t) { return t ? new Date(t).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "—"; },
    dateTime(t) { return t ? new Date(t).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"; },
    time(t) { return t ? new Date(t).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—"; },
    weekday(t) { return new Date(t).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }); },
    relative(t, now) {
      if (!t) return "—";
      const d = Math.round((now - t) / MS_DAY);
      if (d <= 0) { const h = Math.round((now - t) / 3600000); return h <= 0 ? "à l'instant" : h < 24 ? `il y a ${h} h` : "aujourd'hui"; }
      if (d === 1) return "hier";
      if (d < 30) return `il y a ${d} j`;
      if (d < 365) return `il y a ${Math.round(d / 30)} mois`;
      return `il y a ${Math.round(d / 365)} an${d >= 730 ? "s" : ""}`;
    },
    duration(sec) {
      if (!sec) return "—";
      const m = Math.floor(sec / 60), s = sec % 60;
      return m ? `${m} min ${String(s).padStart(2, "0")}` : `${s} s`;
    },
    delta(d) { return d === null ? "nouveau" : `${d > 0 ? "+" : ""}${d} %`; },
    initials(name) { return String(name || "?").split(/\s+/).map((x) => x[0]).filter(Boolean).slice(0, 2).join("").toUpperCase(); },
  };

  /* ------------------------------------------------------------------ */
  /* 7. Jeu de démonstration (fictif, déterministe)                      */
  /* ------------------------------------------------------------------ */

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function demoData(now) {
    const rnd = mulberry32(20261008);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const first = ["Camille", "Inès", "Léa", "Hugo", "Nadia", "Yanis", "Chloé", "Mehdi", "Sarah", "Thomas", "Amina", "Lucas", "Manon", "Rayan", "Jade", "Karim", "Élise", "Nicolas", "Lina", "Adam"];
    const last = ["Martin", "Bernard", "Dubois", "Moreau", "Laurent", "Garcia", "Roux", "Fournier", "Girard", "Lambert", "Benali", "Nguyen", "Petit", "Lefebvre", "Mercier", "Haddad", "Blanc", "Guerin", "Faure", "Rousseau"];
    const cities = ["Paris", "Lyon", "Marseille", "Lille", "Bordeaux", "Nantes", "Toulouse", "Bruxelles", "Nice", "Strasbourg"];
    const sources = ["Meta Ads", "Google Adwords", "WordPress", "Formulaire de contact", "Instagram", "Référent", "SEO", "WhatsApp - ESO"];
    const roles = ["Je suis chirurgien-dentiste", "Je suis étudiant en dentaire", "Je suis chirurgien-dentiste ou étudiant en dentaire"];
    const ownersList = [
      { id: "demo-owner-1", name: "Responsable commercial", email: "ventes@exemple.fr" },
      { id: "demo-owner-2", name: "Admissions ESO", email: "admissions@exemple.fr" },
    ];
    const statusWeights = [["Nouveau", 22], ["Non contacté", 8], ["Contacté", 14], ["Pré-qualifié", 10], ["Qualifié", 18], ["A convertir", 4], ["Contact à l'avenir", 6], ["Non qualifié", 10], ["Lead perdu", 5], ["Spam", 3]];
    const wStatus = () => { let r = rnd() * 100; for (const [s, w] of statusWeights) { r -= w; if (r <= 0) return s; } return "Nouveau"; };

    const leads = [];
    for (let i = 0; i < 140; i++) {
      const name = `${pick(first)} ${pick(last)}`;
      const age = Math.floor(Math.pow(rnd(), 1.6) * 120) * MS_DAY + rnd() * MS_DAY;
      const created = now - age;
      const status = wStatus();
      const score = status === "Qualifié" ? 25 + Math.floor(rnd() * 20) : status === "Pré-qualifié" ? 15 + Math.floor(rnd() * 15) : 5 + Math.floor(rnd() * 20);
      const owner = rnd() < 0.8 ? ownersList[0] : ownersList[1];
      leads.push(normalizeLead({
        id: `demo-lead-${i}`, Full_Name: name, Email: `${fold(name).replace(/\s+/g, ".")}@exemple.fr`,
        Phone: `06 ${String(10 + Math.floor(rnd() * 89))} ${String(10 + Math.floor(rnd() * 89))} ${String(10 + Math.floor(rnd() * 89))} ${String(10 + Math.floor(rnd() * 89))}`,
        Lead_Status: status, Lead_Source: pick(sources), R_le: rnd() < 0.7 ? pick(roles) : null,
        Owner: owner, Created_Time: new Date(created).toISOString(),
        Modified_Time: new Date(created + rnd() * Math.min(age, 10 * MS_DAY)).toISOString(),
        Last_Activity_Time: new Date(created + rnd() * Math.min(age, 10 * MS_DAY)).toISOString(),
        Score: score, City: rnd() < 0.6 ? pick(cities) : null,
        Ann_e_d_obtention_du_dipl_me: rnd() < 0.5 ? 2015 + Math.floor(rnd() * 11) : null,
        Etapes_du_prospect: status === "Qualifié" && rnd() < 0.5 ? pick(LEAD_STEPS.slice(0, 4)) : null,
        Message_Nous_Contacter: rnd() < 0.3 ? "Bonjour, je souhaite des informations sur la formation en orthodontie et les modalités d'admission." : null,
      }));
    }

    const deals = [];
    const promos = [{ name: "2026/2029", id: "demo-promo-1" }, { name: "2027/2030", id: "demo-promo-2" }];
    const openStages = ["Évaluation initiale", "Prise de rendez-vous - Admissions", "RDV fixé", "Entretiens", "Accord non contractuel", "En attente acompte", "Acompte partiel", "Acompte payé", "Engagement contractuel"];
    for (let i = 0; i < 48; i++) {
      const name = `${pick(first)} ${pick(last)}`;
      const r = rnd();
      const stage = r < 0.55 ? pick(openStages) : r < 0.85 ? "Gagné" : pick(DEAL_LOST);
      const promo = pick(promos);
      const created = now - Math.floor(rnd() * 200) * MS_DAY;
      const modified = created + rnd() * (now - created);
      const prob = { "Évaluation initiale": 10, "Prise de rendez-vous - Admissions": 30, "RDV fixé": 40, "Entretiens": 50, "Accord non contractuel": 60, "En attente acompte": 70, "Acompte partiel": 85, "Acompte payé": 95, "Engagement contractuel": 98, "Gagné": 100 }[stage] ?? 0;
      deals.push(normalizeDeal({
        id: `demo-deal-${i}`, Deal_Name: `${name} - Recrutement Scolarité ${promo.name}`, Stage: stage,
        Pipeline: "Recrutement", Amount: 38000, Closing_Date: zohoDate(created + 60 * MS_DAY),
        Contact_Name: { name, id: `demo-contact-${i}` }, Owner: ownersList[0],
        Created_Time: new Date(created).toISOString(), Modified_Time: new Date(modified).toISOString(),
        Last_Activity_Time: new Date(modified).toISOString(), Promotion: promo,
        R_sultat_appel_d_valuation_initiale: stage !== "Évaluation initiale" ? "Candidat retenu" : null,
        Reason_For_Loss__s: DEAL_LOST.includes(stage) ? pick(LOSS_REASONS) : null, Type: "Recrutement",
        Probability: prob, Montant_des_paiements_re_us: ["Acompte partiel"].includes(stage) ? 1000 : ["Acompte payé", "Engagement contractuel", "Gagné"].includes(stage) ? 3000 : null,
      }));
    }
    for (let i = 0; i < 10; i++) {
      const name = `${pick(first)} ${pick(last)}`;
      const created = now - Math.floor(rnd() * 90) * MS_DAY;
      deals.push(normalizeDeal({
        id: `demo-sb-${i}`, Deal_Name: `${name} - Acquisition Startbox 2026/2029`, Stage: rnd() < 0.6 ? "Gagné" : "Acompte payé",
        Pipeline: "Startbox", Amount: 4500, Contact_Name: { name, id: `demo-contact-sb-${i}` }, Owner: ownersList[0],
        Created_Time: new Date(created).toISOString(), Modified_Time: new Date(created + MS_DAY).toISOString(), Type: "Startbox", Probability: 100,
      }));
    }

    const tasks = [];
    const taskSubjects = ["Rappel de paiement", "Relance RDV admission", "Appel pour évaluation initiale", "Envoyer le dossier de candidature", "Relancer après devis"];
    for (let i = 0; i < 26; i++) {
      const d = deals[Math.floor(rnd() * 30)];
      const due = now + (Math.floor(rnd() * 14) - 6) * MS_DAY;
      tasks.push(normalizeTask({
        id: `demo-task-${i}`, Subject: `${pick(taskSubjects)} ${d.contact.name}`, Due_Date: zohoDate(due),
        Status: rnd() < 0.3 ? "Completed" : "Not Started", Priority: rnd() < 0.4 ? "High" : "Normal",
        Who_Id: { name: d.contact.name, id: d.contact.id }, What_Id: { name: d.name, id: d.id }, $se_module: "Deals",
        Owner: ownersList[0], Description: rnd() < 0.5 ? "Le lien de paiement Stripe a été envoyé il y a 15 jours sans paiement enregistré." : null,
        Created_Time: new Date(now - 10 * MS_DAY).toISOString(), Modified_Time: new Date(now - MS_DAY).toISOString(),
      }));
    }

    const calls = [];
    for (let i = 0; i < 60; i++) {
      const d = deals[Math.floor(rnd() * 30)];
      const start = now - Math.floor(rnd() * 45) * MS_DAY - rnd() * 8 * 3600000;
      const type = rnd() < 0.55 ? "Outbound" : rnd() < 0.8 ? "Inbound" : "Missed";
      const sec = type === "Missed" ? 0 : rnd() < 0.3 ? Math.floor(rnd() * 40) : 60 + Math.floor(rnd() * 1500);
      calls.push(normalizeCall({
        id: `demo-call-${i}`, Subject: type === "Inbound" ? "Appel entrant sur ESO - Admissions" : `Appel sortant à ${d.contact.name}`,
        Call_Type: type, Call_Result: sec >= 60 ? pick(CALL_RESULTS.slice(0, 5)) : null,
        Call_Start_Time: new Date(start).toISOString(), Call_Duration: `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`,
        Call_Duration_in_seconds: sec, Who_Id: { name: d.contact.name, id: d.contact.id }, What_Id: { name: d.name, id: d.id }, $se_module: "Deals",
        Owner: rnd() < 0.8 ? ownersList[0] : ownersList[1], Outgoing_Call_Status: type === "Outbound" ? "Completed" : null,
      }));
    }
    for (let i = 0; i < 5; i++) {
      const l = leads[i * 7];
      const start = startOfDay(now) + (9 + i * 2) * 3600000 + (i % 2) * 1800000 + (i > 2 ? MS_DAY : 0);
      calls.push(normalizeCall({
        id: `demo-call-sched-${i}`, Subject: `Appel de qualification ${l.name}`, Call_Type: "Outbound", Call_Start_Time: new Date(start).toISOString(),
        Call_Duration_in_seconds: 0, What_Id: { name: l.name, id: l.id }, $se_module: "Leads", Owner: ownersList[0], Outgoing_Call_Status: "Scheduled",
      }));
    }

    const events = [];
    for (let i = 0; i < 14; i++) {
      const d = deals[Math.floor(rnd() * 30)];
      const dayOff = Math.floor(rnd() * 14) - 5;
      const start = startOfDay(now) + dayOff * MS_DAY + (10 + Math.floor(rnd() * 9)) * 3600000;
      const phone = rnd() < 0.5;
      events.push(normalizeEvent({
        id: `demo-event-${i}`, Event_Title: `${d.contact.name} et ${phone ? "RDV téléphonique avec le Pr AKNIN" : "RDV administratif"}`,
        Start_DateTime: new Date(start).toISOString(), End_DateTime: new Date(start + (phone ? 25 : 60) * 60000).toISOString(),
        What_Id: { name: d.name, id: d.id }, $se_module: "Deals", Owner: phone ? ownersList[1] : ownersList[0],
        Venue: phone ? null : "École Supérieure d'Orthodontie, 4 rue Jacques-Cartier, 75018 Paris",
        Meeting_Venue__s: phone ? "En ligne" : "Bureau", R_sultat_de_la_r_union: dayOff < 0 && rnd() < 0.7 ? pick(MEETING_RESULTS) : null,
      }));
    }

    return { leads, deals, tasks, calls, events };
  }

  /* ------------------------------------------------------------------ */

  return {
    MS_DAY, SERVER, FIELDS, PAGE_BUDGET,
    LEAD_STATUS_ORDER, LEAD_STATUS_DEAD, LEAD_STATUS_ALL, LEAD_TODO, LEAD_STEPS,
    DEAL_STAGES, DEAL_WON, DEAL_LOST, DEAL_DEPOSIT_PENDING, DEAL_STAGES_MAIN, PIPELINES, LOSS_REASONS, EVAL_RESULTS,
    CALL_RESULTS, CALL_RESULT_FR, CALL_TYPE_FR, TASK_STATUS_FR, TASK_PRIORITIES, TASK_PRIORITY_FR, MEETING_RESULTS,
    READ_TOOLS, WRITE_TOOL_CANDIDATES, ALL_WRITE_TOOLS,
    normalizeLead, normalizeDeal, normalizeTask, normalizeCall, normalizeEvent, NORMALIZERS,
    unwrapRecords, recordsArgs,
    isWon, isLost, isOpenDeal, isDeadLead, isTodoLead, isQualifiedLead, isOpenTask,
    startOfDay, endOfDay, startOfWeek, daysSince, byOwner, countBy, sortedCounts, pct, delta,
    computeKpis, leadsPerWeek, leadFunnel, pipelineSummary, kanbanColumns, stalledDeals, hotLeads,
    todayAgenda, weekGrid, callStats, sourceBreakdown, owners,
    fold, filterLeads, sortLeads,
    pickWriteTools, buildWriteArgs, taskRecord, callRecord, eventRecord, noteRecord, zohoDateTime, zohoDate,
    claudeInstruction, fmt, demoData,
  };
});
