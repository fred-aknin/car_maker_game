// Tests de la logique métier (node --test).
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../src/core.js");

const NOW = new Date(2026, 9, 8, 14, 0, 0).getTime(); // jeudi 8 octobre 2026, 14 h
const D = E.MS_DAY;
const iso = (t) => new Date(t).toISOString();

/* ---------- Normalisation ---------- */
test("normalizeLead lit les champs Zoho réels", () => {
  const l = E.normalizeLead({
    id: "327818000050853007", Full_Name: "Emma Durand", Email: "e@x.fr", Phone: "33 6 00 00 00 00",
    Lead_Status: "Qualifié", Lead_Source: "WordPress", R_le: "Je suis chirurgien-dentiste",
    Owner: { name: "Jérôme", id: "1", email: "j@x.fr" }, Created_Time: "2026-10-08T09:27:16+02:00",
    Modified_Time: "2026-10-08T09:31:01+02:00", Score: 35, City: "Toulouse", Est_en_train_de_pourrir: "Oui",
  });
  assert.equal(l.id, "327818000050853007");
  assert.equal(l.name, "Emma Durand");
  assert.equal(l.status, "Qualifié");
  assert.equal(l.score, 35);
  assert.equal(l.rotting, true);
  assert.equal(l.owner.id, "1");
  assert.equal(typeof l.created, "number");
  assert.equal(l.converted, false);
});

test("normalizeLead tolère les valeurs manquantes", () => {
  const l = E.normalizeLead({ id: "1", First_Name: "A", Last_Name: "B" });
  assert.equal(l.name, "A B");
  assert.equal(l.source, "Inconnue");
  assert.equal(l.score, 0);
  assert.equal(l.created, null);
  assert.equal(l.owner, null);
});

test("normalizeDeal convertit les dates et montants", () => {
  const d = E.normalizeDeal({ id: "9", Deal_Name: "X - Recrutement", Stage: "En attente acompte", Pipeline: "Recrutement", Amount: 38000, Closing_Date: "2026-11-01", Probability: 35, Montant_des_paiements_re_us: null });
  assert.equal(d.amount, 38000);
  assert.equal(d.received, 0);
  assert.equal(new Date(d.closing).getDate(), 1);
  assert.equal(new Date(d.closing).getMonth(), 10);
  assert.equal(E.isOpenDeal(d), true);
});

test("normalizeTask / Call / Event", () => {
  const t = E.normalizeTask({ id: "1", Subject: "Rappel", Due_Date: "2026-10-07", Status: "Not Started", $se_module: "Deals", What_Id: { id: "d1", name: "Deal" } });
  assert.equal(t.relatedModule, "Deals");
  assert.equal(E.isOpenTask(t), true);
  const c = E.normalizeCall({ id: "2", Call_Type: "Inbound", Call_Duration_in_seconds: 146, Call_Start_Time: "2026-09-21T17:46:13+02:00" });
  assert.equal(c.seconds, 146);
  assert.equal(c.type, "Inbound");
  const e = E.normalizeEvent({ id: "3", Event_Title: "RDV", Start_DateTime: "2026-10-06T20:00:00+02:00", End_DateTime: "2026-10-06T20:25:00+02:00" });
  assert.equal(e.end - e.start, 25 * 60000);
});

test("unwrapRecords accepte les enveloppes du connecteur", () => {
  const a = E.unwrapRecords({ status: "success", data: { data: [{ id: 1 }], info: { more_records: true, next_page_token: "abc" } } });
  assert.equal(a.records.length, 1);
  assert.equal(a.more, true);
  assert.equal(a.nextToken, "abc");
  const b = E.unwrapRecords({ data: [{ id: 1 }, { id: 2 }], info: { more_records: false } });
  assert.equal(b.records.length, 2);
  assert.equal(b.more, false);
  const c = E.unwrapRecords(JSON.stringify({ data: [{ id: 7 }] }));
  assert.equal(c.records[0].id, 7);
  assert.deepEqual(E.unwrapRecords(null).records, []);
  assert.deepEqual(E.unwrapRecords("pas du json").records, []);
});

test("recordsArgs construit la requête getRecords", () => {
  const a = E.recordsArgs("Leads", 2);
  assert.equal(a.path_variables.module, "Leads");
  assert.equal(a.query_params.page, 2);
  assert.equal(a.query_params.per_page, 200);
  assert.equal(a.query_params.converted, "false");
  assert.match(a.query_params.fields, /Lead_Status/);
  assert.equal(E.recordsArgs("Deals", 1).query_params.converted, undefined);
});

/* ---------- Indicateurs ---------- */
function sampleData() {
  const lead = (i, o) => E.normalizeLead(Object.assign({ id: `l${i}`, Full_Name: `Lead ${i}`, Lead_Status: "Nouveau", Lead_Source: "Meta Ads", Owner: { id: "o1", name: "Jérôme" }, Created_Time: iso(NOW - i * D), Modified_Time: iso(NOW - i * D), Score: 10 }, o));
  const deal = (i, o) => E.normalizeDeal(Object.assign({ id: `d${i}`, Deal_Name: `Deal ${i}`, Stage: "Évaluation initiale", Pipeline: "Recrutement", Amount: 38000, Probability: 10, Owner: { id: "o1", name: "Jérôme" }, Created_Time: iso(NOW - 40 * D), Modified_Time: iso(NOW - i * D), Last_Activity_Time: iso(NOW - i * D), Contact_Name: { id: `c${i}`, name: `Contact ${i}` } }, o));
  return {
    leads: [
      lead(1), lead(2, { Lead_Status: "Qualifié", Score: 35 }), lead(3, { Lead_Status: "Non contacté" }), lead(10, { Lead_Status: "Contacté" }),
      lead(35, { Lead_Status: "Qualifié" }), lead(40, { Lead_Status: "Spam" }), lead(50, { Lead_Status: "Nouveau", Owner: { id: "o2", name: "Xavier" } }),
    ],
    deals: [
      deal(1, { Stage: "En attente acompte", Probability: 70 }), deal(2, { Stage: "Gagné", Probability: 100 }), deal(3, { Stage: "Perdu", Reason_For_Loss__s: "Internat" }),
      deal(20, { Stage: "RDV fixé", Probability: 40 }), deal(45, { Stage: "Gagné" }), deal(5, { Stage: "Gagné", Pipeline: "Startbox", Amount: 4500 }),
    ],
    tasks: [
      E.normalizeTask({ id: "t1", Subject: "Retard", Due_Date: E.zohoDate(NOW - 2 * D), Status: "Not Started", Owner: { id: "o1", name: "Jérôme" } }),
      E.normalizeTask({ id: "t2", Subject: "Aujourd'hui", Due_Date: E.zohoDate(NOW), Status: "Not Started", Owner: { id: "o1", name: "Jérôme" } }),
      E.normalizeTask({ id: "t3", Subject: "Faite", Due_Date: E.zohoDate(NOW - 5 * D), Status: "Completed", Owner: { id: "o1", name: "Jérôme" } }),
    ],
    calls: [
      E.normalizeCall({ id: "c1", Call_Type: "Outbound", Call_Duration_in_seconds: 300, Call_Start_Time: iso(NOW - D), Owner: { id: "o1", name: "Jérôme" }, Call_Result: "Interested" }),
      E.normalizeCall({ id: "c2", Call_Type: "Inbound", Call_Duration_in_seconds: 10, Call_Start_Time: iso(NOW - 2 * D), Owner: { id: "o1", name: "Jérôme" } }),
      E.normalizeCall({ id: "c3", Call_Type: "Outbound", Call_Duration_in_seconds: 0, Call_Start_Time: iso(NOW + 3600000), Outgoing_Call_Status: "Scheduled", Owner: { id: "o1", name: "Jérôme" } }),
      E.normalizeCall({ id: "c4", Call_Type: "Outbound", Call_Duration_in_seconds: 0, Call_Start_Time: iso(NOW - 3 * D), Outgoing_Call_Status: "Scheduled", Owner: { id: "o1", name: "Jérôme" } }),
    ],
    events: [
      E.normalizeEvent({ id: "e1", Event_Title: "RDV demain", Start_DateTime: iso(NOW + D), End_DateTime: iso(NOW + D + 1800000), Owner: { id: "o1", name: "Jérôme" } }),
      E.normalizeEvent({ id: "e2", Event_Title: "RDV passé", Start_DateTime: iso(NOW - 3 * D), End_DateTime: iso(NOW - 3 * D + 1800000), R_sultat_de_la_r_union: "Suite positive", Owner: { id: "o1", name: "Jérôme" } }),
    ],
  };
}

test("computeKpis sur 30 jours", () => {
  const k = E.computeKpis(sampleData(), { now: NOW, days: 30, owner: "all" });
  assert.equal(k.newLeads, 4);          // l1, l2, l3, l10 (l35/l40/l50 hors période)
  assert.equal(k.todo, 3);              // l1, l3, l50
  assert.equal(k.oldestTodoAgeDays, 50);
  assert.equal(k.qualified, 1);         // l2
  assert.equal(k.qualifiedRate, 25);
  assert.equal(k.openDeals, 2);         // d1, d20
  assert.equal(k.openAmount, 76000);
  assert.equal(k.weighted, Math.round(38000 * 0.7 + 38000 * 0.4));
  assert.equal(k.depositPending, 1);
  assert.equal(k.won, 1);               // d2 (d45 hors période, d5 Startbox)
  assert.equal(k.winRate, 50);          // 1 gagnée / (1 gagnée + 1 perdue)
  assert.equal(k.overdueTasks, 1);
  assert.equal(k.todayTasks, 1);
  assert.equal(k.upcomingEvents, 1);
  assert.equal(k.calls, 2);             // c1, c2 (c3 et c4 sont planifiés, pas passés)
  assert.equal(k.talkMinutes, 5);
});

test("computeKpis filtre par responsable et calcule les deltas", () => {
  const k = E.computeKpis(sampleData(), { now: NOW, days: 30, owner: "o2" });
  assert.equal(k.newLeads, 0);
  assert.equal(k.todo, 1);
  assert.equal(k.newLeadsDelta, -100); // l50 (créé il y a 50 j) est dans la période précédente
  const k2 = E.computeKpis({ leads: [], deals: [], tasks: [], calls: [], events: [] }, { now: NOW, days: 7, owner: "all" });
  assert.equal(k2.newLeadsDelta, 0);
  assert.equal(k2.oldestTodoAgeDays, null);
});

test("delta et pct", () => {
  assert.equal(E.delta(12, 10), 20);
  assert.equal(E.delta(5, 10), -50);
  assert.equal(E.delta(3, 0), null);
  assert.equal(E.delta(0, 0), 0);
  assert.equal(E.pct(1, 4), 25);
  assert.equal(E.pct(1, 0), 0);
});

test("leadsPerWeek répartit par semaine ISO et compte les qualifiés", () => {
  const b = E.leadsPerWeek(sampleData().leads, 8, NOW);
  assert.equal(b.length, 8);
  const last = b[b.length - 1];
  assert.equal(new Date(last.start).getDay(), 1); // lundi
  assert.equal(last.count, 3);                    // l1, l2, l3 (lundi 5 → jeudi 8)
  assert.equal(last.qualified, 1);
  assert.equal(b.reduce((s, x) => s + x.count, 0), 7); // 8 semaines depuis le lundi 5 octobre couvrent jusqu'au 10 août
  assert.equal(E.leadsPerWeek(sampleData().leads, 4, NOW).reduce((s, x) => s + x.count, 0), 4); // l1 l2 l3 l10
});

test("leadFunnel ordonne les statuts et isole les inconnus", () => {
  const leads = sampleData().leads.concat([E.normalizeLead({ id: "x", Lead_Status: "Je suis chirurgien-dentiste" })]);
  const f = E.leadFunnel(leads);
  assert.equal(f.rows[0].status, "Nouveau");
  assert.equal(f.rows[0].count, 2); // l1, l50
  assert.equal(f.rows[1].status, "Non contacté");
  assert.equal(f.rows[1].count, 1);
  assert.equal(f.dead.find((r) => r.status === "Spam").count, 1);
  assert.equal(f.other, 1);
});

test("pipelineSummary et kanbanColumns respectent l'ordre canonique", () => {
  const ps = E.pipelineSummary(sampleData().deals, "Recrutement");
  assert.deepEqual(ps.map((s) => s.stage), ["Évaluation initiale", "RDV fixé", "En attente acompte", "Gagné", "Perdu"].filter((s) => ps.some((x) => x.stage === s)));
  assert.equal(ps.find((s) => s.stage === "Gagné").count, 2);
  const cols = E.kanbanColumns(sampleData().deals.concat([E.normalizeDeal({ id: "z", Stage: "Qualification" })]));
  assert.ok(cols.indexOf("Évaluation initiale") < cols.indexOf("Qualification"));
  assert.ok(cols.indexOf("Qualification") < cols.indexOf("Prise de rendez-vous - Admissions"));
  assert.ok(cols.includes("Gagné") && cols.includes("Perdu"));
});

test("stalledDeals, hotLeads, todayAgenda", () => {
  const d = sampleData();
  const st = E.stalledDeals(d.deals, NOW, 14);
  assert.deepEqual(st.map((x) => x.deal.id), ["d20"]);
  assert.equal(st[0].idle, 20);
  const hot = E.hotLeads(d.leads, 5);
  assert.deepEqual(hot.map((l) => l.id), ["l2", "l35"]);
  const ag = E.todayAgenda(d, NOW);
  assert.equal(ag.overdue.length, 1);
  assert.equal(ag.today.length, 1);
  assert.equal(ag.calls.length, 1);
  assert.equal(ag.events.length, 0);
});

test("weekGrid couvre 7 jours à partir du lundi", () => {
  const g = E.weekGrid(sampleData(), NOW);
  assert.equal(g.days.length, 7);
  assert.equal(new Date(g.start).getDay(), 1);
  const thu = g.days[3];
  assert.equal(new Date(thu.start).getDate(), 8);
  assert.ok(thu.items.some((i) => i.kind === "task"));
  assert.ok(thu.items.some((i) => i.kind === "call"));
  assert.ok(g.days[4].items.some((i) => i.kind === "event"));
});

test("callStats", () => {
  const s = E.callStats(sampleData().calls, NOW, 30);
  assert.equal(s.total, 2);            // les appels planifiés ne comptent pas
  assert.equal(s.answered, 1);
  assert.equal(s.answerRate, 50);
  assert.equal(s.minutes, 5);
  assert.equal(s.scheduled.length, 1);
  assert.equal(s.overdueScheduled.length, 1);
  assert.equal(s.byOwner[0].owner, "Jérôme");
});

test("sourceBreakdown regroupe en « Autres »", () => {
  const leads = ["A", "A", "B", "C", "D"].map((s, i) => E.normalizeLead({ id: i, Lead_Source: s }));
  const r = E.sourceBreakdown(leads, 2);
  assert.deepEqual(r, [{ source: "A", count: 2 }, { source: "B", count: 1 }, { source: "Autres", count: 2 }]);
});

test("owners liste les responsables distincts", () => {
  assert.deepEqual(E.owners(sampleData()), [{ id: "o1", name: "Jérôme" }, { id: "o2", name: "Xavier" }]);
});

/* ---------- Filtres ---------- */
test("filterLeads et sortLeads", () => {
  const leads = sampleData().leads;
  assert.equal(E.filterLeads(leads, { status: "todo" }).length, 3);
  assert.equal(E.filterLeads(leads, { status: "hot" }).length, 2);
  assert.equal(E.filterLeads(leads, { status: "dead" }).length, 1);
  assert.equal(E.filterLeads(leads, { status: "Qualifié" }).length, 2);
  assert.equal(E.filterLeads(leads, { owner: "o2" }).length, 1);
  assert.equal(E.filterLeads(leads, { q: "LEAD 1" }).length, 2); // Lead 1 et Lead 10
  assert.equal(E.filterLeads(leads, { q: "qualifie" }).length, 2); // accents ignorés
  const sorted = E.sortLeads(leads, "score", "desc");
  assert.equal(sorted[0].id, "l2");
  assert.equal(E.sortLeads(leads, "name", "asc")[0].name, "Lead 1");
});

/* ---------- Écriture ---------- */
test("pickWriteTools reconnaît les outils du connecteur", () => {
  const none = E.pickWriteTools(E.READ_TOOLS);
  assert.equal(none.any, false);
  assert.equal(none.update, null);
  const some = E.pickWriteTools(E.READ_TOOLS.concat(["ZohoCRM_updateRecords", "ZohoCRM_createRecords"]));
  assert.equal(some.any, true);
  assert.equal(some.update, "ZohoCRM_updateRecords");
  assert.equal(some.create, "ZohoCRM_createRecords");
  assert.equal(some.convert, null);
  const pref = E.pickWriteTools(["ZohoCRM_updateRecords", "ZohoCRM_updateRecord"]);
  assert.equal(pref.update, "ZohoCRM_updateRecord");
});

test("buildWriteArgs sans schéma : forme Zoho par défaut", () => {
  const a = E.buildWriteArgs(null, { module: "Leads", id: "42", record: { Lead_Status: "Qualifié" } });
  assert.deepEqual(a, { path_variables: { module: "Leads", recordId: "42" }, body: { data: [{ Lead_Status: "Qualifié" }] } });
  const c = E.buildWriteArgs(null, { module: "Tasks", record: { Subject: "X" } });
  assert.deepEqual(c, { path_variables: { module: "Tasks" }, body: { data: [{ Subject: "X" }] } });
});

test("buildWriteArgs suit le schéma décrit par le connecteur", () => {
  const schema = {
    type: "object",
    properties: {
      path_variables: { type: "object", properties: { module: { type: "string" }, record_id: { type: "string" } } },
      request_body: { type: "object", properties: { data: { type: "array" } } },
    },
  };
  const a = E.buildWriteArgs(schema, { module: "Deals", id: "7", record: { Stage: "Gagné" } });
  assert.deepEqual(a, { path_variables: { module: "Deals", record_id: "7" }, request_body: { data: [{ Stage: "Gagné" }] } });
  // Mise à jour en masse : pas d'identifiant dans le chemin → id dans l'enregistrement
  const bulk = { type: "object", properties: { path_variables: { properties: { module: {} } }, body: { properties: { data: { type: "array" } } } } };
  const b = E.buildWriteArgs(bulk, { module: "Leads", id: "9", record: { Lead_Status: "Contacté" } });
  assert.deepEqual(b, { path_variables: { module: "Leads" }, body: { data: [{ Lead_Status: "Contacté", id: "9" }] } });
  // Schéma plat
  const flat = { properties: { module: {}, recordId: {}, data: { type: "array" } } };
  const f = E.buildWriteArgs(flat, { module: "Calls", id: "3", record: { Call_Result: "Interested" } });
  assert.deepEqual(f, { module: "Calls", recordId: "3", data: [{ Call_Result: "Interested" }] });
});

test("enregistrements d'écriture : tâche, appel, réunion, note", () => {
  const t = E.taskRecord({ subject: "Relancer", due: "2026-10-09", priority: "High", parentModule: "Deals", parentId: "d1", contactId: "c1" });
  assert.deepEqual(t, { Subject: "Relancer", Status: "Not Started", Priority: "High", Due_Date: "2026-10-09", What_Id: "d1", $se_module: "Deals", Who_Id: "c1" });
  const tl = E.taskRecord({ subject: "Appeler", parentModule: "Leads", parentId: "l1" });
  assert.equal(tl.$se_module, "Leads");
  assert.equal(tl.Who_Id, undefined);
  const c = E.callRecord({ subject: "Appel", startIso: "2026-10-09T10:00:00+02:00", parentModule: "Leads", parentId: "l1" });
  assert.equal(c.Call_Type, "Outbound");
  assert.equal(c.Outgoing_Call_Status, "Scheduled");
  assert.equal(c.What_Id, "l1");
  const e = E.eventRecord({ title: "RDV", startIso: "a", endIso: "b", venueType: "En ligne", parentModule: "Deals", parentId: "d1", contactId: "c1" });
  assert.equal(e.Meeting_Venue__s, "En ligne");
  assert.equal(e.Who_Id, "c1");
  const n = E.noteRecord({ content: "Bonjour", parentId: "l1", parentModule: "Leads" });
  assert.deepEqual(n, { Note_Title: "Note", Note_Content: "Bonjour", Parent_Id: "l1", se_module: "Leads" });
});

test("zohoDateTime et zohoDate", () => {
  const t = new Date(2026, 9, 9, 10, 5, 0).getTime();
  assert.match(E.zohoDateTime(t), /^2026-10-09T10:05:00[+-]\d{2}:\d{2}$/);
  assert.equal(E.zohoDate(t), "2026-10-09");
});

test("claudeInstruction produit des consignes en français avec l'identifiant", () => {
  const s = E.claudeInstruction("status", { module: "Leads", id: "1", name: "Emma", value: "Qualifié" });
  assert.match(s, /prospect « Emma »/);
  assert.match(s, /id 1/);
  assert.match(s, /« Qualifié »/);
  assert.match(E.claudeInstruction("convert", { module: "Leads", id: "1", name: "Emma", extra: "2027/2030" }), /promotion 2027\/2030/);
  assert.match(E.claudeInstruction("task", { module: "Deals", id: "2", name: "D", value: "Relancer", due: "2026-10-09" }), /échéance 2026-10-09/);
});

/* ---------- Formatage ---------- */
test("fmt", () => {
  assert.equal(E.fmt.moneyShort(38000), "38 k€");
  assert.equal(E.fmt.moneyShort(500), "500 €");
  assert.equal(E.fmt.moneyShort(null), "—");
  assert.equal(E.fmt.duration(146), "2 min 26");
  assert.equal(E.fmt.duration(33), "33 s");
  assert.equal(E.fmt.relative(NOW - D, NOW), "hier");
  assert.equal(E.fmt.relative(NOW - 5 * D, NOW), "il y a 5 j");
  assert.equal(E.fmt.relative(NOW - 3 * 3600000, NOW), "il y a 3 h");
  assert.equal(E.fmt.initials("Jérôme Texier"), "JT");
  assert.equal(E.fmt.delta(null), "nouveau");
  assert.equal(E.fmt.delta(12), "+12 %");
});

/* ---------- Démonstration ---------- */
test("demoData est déterministe, fictif et cohérent", () => {
  const a = E.demoData(NOW), b = E.demoData(NOW);
  assert.deepEqual(a.leads.map((l) => l.id), b.leads.map((l) => l.id));
  assert.equal(a.leads.length, 140);
  assert.ok(a.deals.length > 40);
  assert.ok(a.leads.every((l) => l.email.endsWith("@exemple.fr")));
  assert.ok(a.leads.every((l) => l.id.startsWith("demo-")));
  const k = E.computeKpis(a, { now: NOW, days: 30, owner: "all" });
  assert.ok(k.newLeads > 0 && k.openDeals > 0);
  const ag = E.todayAgenda(a, NOW);
  assert.ok(ag.calls.length >= 1, "des appels planifiés aujourd'hui");
  assert.ok(E.owners(a).length === 2);
});
