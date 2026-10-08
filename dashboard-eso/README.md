# Dashboard ESO — tableau de bord Recrutement connecté à Zoho CRM

Artefact Claude (page HTML publiée sur claude.ai) qui donne au responsable
commercial de l'École Supérieure d'Orthodontie une vue de pilotage de la
prospection et du recrutement des étudiants, alimentée en direct par Zoho CRM
via le connecteur « Zoho CRM » de son compte Claude.

Cinq vues, reprises du prototype Claude Design (`Dashboard ESO.html`) :

| Vue | Contenu | Actions |
| --- | --- | --- |
| **Cockpit** | 8 indicateurs (nouveaux prospects, à traiter, taux de qualification, affaires en cours et montant pondéré, acomptes en attente, inscriptions gagnées, tâches en retard, appels), prospects par semaine, origines, parcours de qualification, synthèse du pipeline, agenda du jour, prospects chauds, affaires à relancer, briefing du jour rédigé par Claude. | Ouvrir une fiche depuis chaque liste |
| **Prospects** | Table des prospects non convertis avec filtres rapides (à traiter, chauds, perdus), statut, origine, recherche (accents ignorés), tri. | Changer le statut et l'étape, planifier un appel, créer une tâche, ajouter une note, convertir en candidat, préparer l'appel avec Claude |
| **Pipeline** | Kanban des affaires par étape (pipeline Recrutement / Startbox, filtre par promotion), raisons de perte, résultats de l'appel d'évaluation. | Glisser-déposer entre étapes, changer l'étape et la raison de perte, résultat d'évaluation, planifier un RDV ou un appel, tâche, note, prochaine action conseillée par Claude |
| **Appels** | Volume, taux de conversation, minutes, résultats, répartition par responsable, appels planifiés (et dépassés), journal des 40 derniers appels. | Enregistrer le résultat d'un appel |
| **Planning** | Semaine (RDV, appels planifiés, tâches), tâches en retard, prochains rendez-vous, issue des RDV sur 30 jours. | Marquer une tâche terminée, enregistrer l'issue d'un RDV |

Les filtres globaux (responsable, période 7/30/90 jours) s'appliquent à toutes
les vues. La vue et les filtres sont mémorisés dans le navigateur de chaque
utilisateur.

## Comment ça marche

```
┌──────────────────────┐   claude.use("mcp")    ┌──────────────────────┐
│  Artefact (page)     │ ─────────────────────▶ │ Connecteur Zoho CRM  │ ──▶ Zoho CRM
│  dist/dashboard-eso  │   callTool(...)        │ (compte du lecteur)  │
└──────────────────────┘                        └──────────────────────┘
           │ claude.use("sample")
           ▼
   Claude (briefings, préparation d'appel)
```

* La page déclare la capacité `mcp` avec le serveur **Zoho CRM** et appelle
  `ZohoCRM_getRecords` sur les modules `Leads`, `Deals`, `Tasks`, `Calls`,
  `Events` (200 enregistrements par page, pages bornées par module, cache
  60 s, actualisation automatique toutes les 5 minutes quand la page est
  visible). Les appels se font avec les identifiants du lecteur : aucune clé
  n'est stockée dans la page.
* La capacité `sample` permet de demander à Claude un briefing du jour, la
  préparation d'un appel de qualification ou la prochaine action sur une
  affaire, à partir des données affichées.
* Hors de Claude (fichier ouvert dans un navigateur, connecteur absent), la
  page bascule en **mode démonstration** avec un jeu de données fictif et
  déterministe, clairement signalé par une bannière.

### Lecture et écriture

Le connecteur « Zoho CRM » tel qu'il est configuré aujourd'hui n'expose que
des outils de lecture (`ZohoCRM_getRecords`, `ZohoCRM_getRecord`,
`ZohoCRM_searchRecords`, `ZohoCRM_getNoteById`). Dans ce cas chaque action du
tableau de bord (changer un statut, créer une tâche, planifier un appel…)
copie dans le presse-papiers une **instruction en français** à coller dans la
conversation Claude, qui effectue la modification dans Zoho CRM.

Pour une écriture directe depuis la page, ajoutez au serveur MCP « Zoho CRM »
(console MCP de Zoho, puis reconnexion du connecteur dans claude.ai) les outils
de création et de mise à jour d'enregistrements. La page les détecte au
chargement, parmi ces noms (par ordre de préférence) :

| Action | Outils reconnus |
| --- | --- |
| Mise à jour (statut, étape, résultat, tâche terminée) | `ZohoCRM_updateRecord`, `ZohoCRM_updateRecords`, `ZohoCRM_upsertRecords` |
| Création (tâche, appel, RDV, note) | `ZohoCRM_createRecords`, `ZohoCRM_insertRecords`, `ZohoCRM_createRecord` |
| Note (sinon créée via l'outil de création, module `Notes`) | `ZohoCRM_createNotes`, `ZohoCRM_createNote` |
| Conversion d'un prospect | `ZohoCRM_convertLead`, `ZohoCRM_convertLeads` |

La page lit le schéma de chaque outil (`describeTool`) et construit la requête
en conséquence (`path_variables` + corps `{data:[…]}` par défaut). Après une
écriture réussie, le cache est invalidé et les données rechargées. En cas
d'échec, l'instruction pour Claude est proposée en repli. Si un autre nom
d'outil est exposé, ajoutez-le dans `WRITE_TOOL_CANDIDATES` (`src/core.js`)
et dans le manifeste `mcp.servers[].tools` au moment de la publication.

Les enregistrements écrits suivent les champs réels de l'organisation
(voir [docs/zoho-schema.md](docs/zoho-schema.md)) : `Lead_Status`,
`Etapes_du_prospect`, `Stage`, `Reason_For_Loss__s`,
`R_sultat_appel_d_valuation_initiale`, `Call_Result`,
`R_sultat_de_la_r_union`, tâches/appels/réunions liés par `What_Id` +
`$se_module`.

## Structure du dépôt

```
dashboard-eso/
├── src/
│   ├── core.js      logique métier pure (normalisation Zoho, indicateurs, filtres,
│   │                construction des écritures, instructions Claude, jeu de démo)
│   ├── ui.js        interface (vues, tiroir, formulaires, connexion mcp/sample)
│   ├── styles.css   thème clair/sombre (tokens), mise en page, mobile
│   └── page.html    gabarit assemblé par build.mjs
├── build.mjs        assemble dist/dashboard-eso.html (+ version autonome)
├── dist/            page publiable (générée, versionnée pour republication)
├── docs/
│   ├── zoho-schema.md   champs et listes de valeurs Zoho CRM utilisés
│   └── publication.md   procédure de publication / mise à jour de l'artefact
└── test/
    ├── core.test.js     tests unitaires (node --test)
    └── browser.mjs      test de rendu Chromium (Playwright)
```

## Développement

```bash
cd dashboard-eso
npm test                 # tests unitaires de la logique métier
npm run build            # génère dist/
npm run check            # vérification syntaxique + tests + build
# test de rendu (Playwright et Chromium installés) :
NODE_PATH=$(npm root -g) node test/browser.mjs
```

`dist/dashboard-eso.standalone.html` s'ouvre dans un navigateur pour une
revue visuelle en mode démonstration (aucune donnée réelle).

## Publication

Voir [docs/publication.md](docs/publication.md) : la page est publiée avec
l'outil Artefact de Claude Code, avec le manifeste de capacités
(`mcp` : serveur « Zoho CRM », `sample`). Toute modification de `src/` se
republie sur la même URL après `npm run check`.
