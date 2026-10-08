# Champs Zoho CRM utilisés (organisation ESO)

Relevé le 8 octobre 2026 via les outils de métadonnées du connecteur
(`ZohoCRM_getModules`, `ZohoCRM_getFields`). Seuls les champs exploités par le
tableau de bord sont listés ; les noms sont les `api_name` exacts.

## Modules

| api_name | Libellé | Usage |
| --- | --- | --- |
| `Leads` | Prospects | vue Prospects, entonnoir, prospects chauds |
| `Contacts` | Contacts | cible de conversion (non chargé) |
| `Deals` | Affaires | pipeline Recrutement / Startbox |
| `Tasks` | Tâches | agenda, retards |
| `Calls` | Appels | journal, appels planifiés |
| `Events` | Réunions | planning, issue des RDV |
| `Products` | Promotions | référencées par `Deals.Promotion` (ex. 2026/2029, 2027/2030) |
| `Dossier_etudiant`, `tudiants` | Dossiers / Étudiants | post-inscription (hors périmètre) |

## Leads (prospects)

| Champ | Type | Valeurs |
| --- | --- | --- |
| `Full_Name`, `First_Name`, `Last_Name`, `Email`, `Phone`, `Phone_2`, `City` | texte | |
| `Lead_Status` | liste | Nouveau · Non contacté · Contacté · Pré-qualifié · Qualifié · A convertir · Contact à l'avenir · Non qualifié · Lead perdu · Spam |
| `Lead_Source` | liste | Meta Ads, Google Adwords, WordPress, Formulaire de contact, Instagram, Référent, SEO, WhatsApp - ESO, FB …, MN - LP ESO …, etc. |
| `Etapes_du_prospect` | liste | Coup de fil Jérôme · Coup fil sans réponse · Rdv programmé Dr JJA · Rdv Dr JJA réalisé · Mail d'admission adressé · Acompte payé |
| `R_le` | liste | Je suis chirurgien-dentiste · Je suis étudiant en dentaire · Je suis chirurgien-dentiste ou étudiant en dentaire · Libéral · Salarié · … |
| `Score` | entier | score des règles de notation |
| `Probabilit_de_conversion_222` | entier | |
| `Est_en_train_de_pourrir` | liste | Oui / Non |
| `Ann_e_d_obtention_du_dipl_me` | entier | |
| `Type_du_Prospect` | liste | Prospect froid · Partenaire |
| `Campagne_UTM`, `Mots_cl_s_UTM` | texte | |
| `Message_Nous_Contacter`, `Message_Candidature`, `Motivations_Dossier`, `Projet_Dossier`, `Formation_Dossier` | texte long | |
| `Converted__s` | booléen | |
| `Owner`, `Created_Time`, `Modified_Time`, `Last_Activity_Time` | système | |

## Deals (affaires)

| Champ | Type | Valeurs |
| --- | --- | --- |
| `Deal_Name` | texte | « Prénom Nom - Recrutement Scolarité 2027/2030 » |
| `Pipeline` | liste | Standard (Standard) · Recrutement · Startbox |
| `Stage` | liste | Évaluation initiale · Prise de rendez-vous - Admissions · RDV fixé · Entretiens · Accord non contractuel · En attente acompte · Acompte partiel · Paiement acompte reçu · Acompte payé · Engagement contractuel · Gagné · Perdu · Rejeté (+ étapes héritées : Qualification, Value Proposition, Identify Decision Makers, Closed Won, Closed-Lost to Competition) |
| `Type` | liste | Recrutement · Startbox · Renouvellement · Autre |
| `Amount` | devise | 38 000 € (scolarité), 4 500 € (Startbox) |
| `Acompte_ESO` | devise | |
| `Probability` | entier | |
| `Closing_Date`, `Date_de_l_acompte`, `Date_d_envoi_du_lien` | date | |
| `Reason_For_Loss__s` | liste | A choisi la concurrence · Problème financement · Renonce au projet · Internat · Désistement après acompte · Candidat non retenu · Manque de réponse · Autre |
| `R_sultat_appel_d_valuation_initiale` | liste | Candidat retenu · Candidat non retenu · Le candidat ne donne pas suite · Appel infructueux |
| `Appr_ciation_ESO` | liste | Très positif · Positif · Neutre · Négatif · Très négatif · Non concerné |
| `Type_de_paiement` | liste | Prêt - Créfident · Prêt · Virement Annuel · Prélèvement SEPA trimestriel · Virement trimestriel · Prélèvement SEPA mensuel |
| `Montant_des_paiements_re_us`, `Montant_re_u_startbox` | cumul | |
| `Contact_Name`, `Promotion`, `Parrain_par` | référence | |

## Tasks (tâches)

`Subject`, `Due_Date` (date), `Status` (Not Started · Deferred · In Progress ·
Completed · Waiting for input), `Priority` (Highest · High · Normal · Low ·
Lowest), `Who_Id` (contact), `What_Id` + `$se_module` (Leads / Deals),
`Description`, `Closed_Time`.

## Calls (appels)

`Subject`, `Call_Type` (Outbound · Inbound · Missed), `Call_Purpose`
(Prospecting · Administrative · Negotiation · Demo · Project · Desk),
`Call_Result` (Interested · Not interested · No response/Busy · Requested more
info · Requested call back · Invalid number · Candidat retenu),
`Call_Start_Time`, `Call_Duration`, `Call_Duration_in_seconds`,
`Outgoing_Call_Status` (Scheduled · Completed · Overdue · Cancelled), `Who_Id`,
`What_Id` + `$se_module`, `Description`, `Transcription`, `Transcription_entrante`.

## Events (réunions)

`Event_Title`, `Start_DateTime`, `End_DateTime`, `All_day`, `Venue`,
`Meeting_Venue__s` (Bureau · Emplacement du client · En ligne),
`R_sultat_de_la_r_union` (Suite positive · Suite négative · Non aboutie),
`Who_Id`, `What_Id` + `$se_module`, `Participants`, `Description`.

## Requêtes

* Lecture : `ZohoCRM_getRecords` avec `path_variables.module` et
  `query_params` `{fields, per_page: 200, page, sort_by: "Modified_Time",
  sort_order: "desc", converted: "false" (Leads)}`. Réponse :
  `{status, data: {data: [...], info: {more_records, next_page_token}}}`.
* Recherche : `ZohoCRM_searchRecords` avec `criteria`, par exemple
  `((Created_Time:greater_equal:2026-10-01T00:00:00+02:00)and(Lead_Status:equals:Nouveau))`.
* Écriture (si les outils sont activés) : enregistrement `{data: [{...}]}`
  avec les champs ci-dessus ; les activités liées utilisent `What_Id` et
  `$se_module` ; une note utilise `Note_Title`, `Note_Content`, `Parent_Id`,
  `se_module`.
