// Test de rendu dans Chromium (Playwright) : charge la page autonome en mode
// démonstration, parcourt les cinq vues, ouvre les tiroirs et déclenche les
// actions simulées. Échoue sur toute erreur de console ou exception de page.
//
//   node test/browser.mjs            (nécessite playwright + Chromium)
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

// `require` respecte NODE_PATH : une installation globale de Playwright suffit
// (NODE_PATH=/chemin/vers/node_modules node test/browser.mjs).
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, "..", "dist", "dashboard-eso.standalone.html");
if (!existsSync(file)) { console.error("Lancez d'abord : node build.mjs"); process.exit(1); }

const errors = [];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" });
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
await page.goto("file://" + file);
await page.waitForSelector("#main .grid-kpi");

const expect = async (cond, label) => { if (!(await cond())) errors.push(`échec : ${label}`); else console.log("ok -", label); };

await expect(async () => (await page.textContent(".banner")).includes("démonstration"), "bannière de démonstration affichée");
await expect(async () => (await page.$$(".card.kpi")).length === 8, "8 indicateurs sur le cockpit");
await expect(async () => (await page.$$("svg.chart rect.bar")).length > 0, "graphique hebdomadaire dessiné");

// Prospects
await page.click("#nav .nav-btn:nth-child(3)");
await page.waitForSelector("table tbody tr");
await expect(async () => (await page.$$("table tbody tr")).length > 50, "tableau des prospects rempli");
await page.fill("#lead-search", "camille");
await page.waitForTimeout(100);
await expect(async () => (await page.$$("table tbody tr")).length > 0 && (await page.textContent("table tbody")).toLowerCase().includes("camille"), "recherche filtre le tableau");
await page.click("table tbody tr.clickable");
await page.waitForSelector(".drawer");
await expect(async () => (await page.$(".drawer #act-status")) !== null, "tiroir prospect avec sélecteur de statut");
await page.selectOption("#act-status", "Qualifié");
await page.click(".drawer .btn.primary");
await page.waitForSelector(".toast");
await expect(async () => (await page.textContent(".toast")).includes("simulation"), "changement de statut simulé");
await page.click(".drawer button[aria-label=Fermer]");

// Pipeline
await page.click("#nav .nav-btn:nth-child(4)");
await page.waitForSelector(".kanban .kcol");
await expect(async () => (await page.$$(".kanban .kcol")).length >= 8, "colonnes du kanban");
await page.click(".kanban .kcard");
await page.waitForSelector(".drawer #act-stage");
await page.click(".drawer .actions .btn:nth-child(1)"); // Planifier un RDV
await page.waitForSelector("#f-title");
await page.click("#form-host .btn.primary");
await page.waitForSelector(".toast");
await expect(async () => (await page.textContent(".toasts")).includes("Rendez-vous créé"), "création de RDV simulée");
await page.keyboard.press("Escape");

// Appels
await page.click("#nav .nav-btn:nth-child(5)");
await page.waitForSelector("table tbody tr");
await expect(async () => (await page.textContent("#main")).includes("Taux de conversation"), "vue appels");

// Planning
await page.click("#nav .nav-btn:nth-child(6)");
await page.waitForSelector(".week .day");
await expect(async () => (await page.$$(".week .day")).length === 7, "7 jours dans le planning");
await expect(async () => (await page.$(".week .day.today")) !== null, "jour courant mis en évidence");

// Mobile
await page.setViewportSize({ width: 400, height: 800 });
await page.click("#nav .nav-btn:nth-child(2)");
await page.waitForSelector("#main .grid-kpi");
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
await expect(async () => overflow <= 0, `pas de défilement horizontal à 400 px (débord ${overflow}px)`);

await browser.close();
if (errors.length) { console.error("\nERREURS :\n" + errors.join("\n")); process.exit(1); }
console.log("\nRendu navigateur : OK");
