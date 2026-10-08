# Publier et mettre à jour l'artefact

Artefact publié le 8 octobre 2026 : <https://claude.ai/artifact/VvJDdnVrSUsHpVh49hdWHs>
(privé : à partager avec le responsable commercial depuis le menu Partager).

## Première publication

1. `cd dashboard-eso && npm run check` (syntaxe, tests, build).
2. Publier `dist/dashboard-eso.html` avec l'outil **Artifact** de Claude Code,
   en déclarant les capacités :

   ```json
   {
     "mcp": {
       "servers": [
         {
           "server": "Zoho CRM",
           "tools": [
             "ZohoCRM_getRecords", "ZohoCRM_getRecord", "ZohoCRM_searchRecords", "ZohoCRM_getNoteById",
             "ZohoCRM_updateRecord", "ZohoCRM_updateRecords", "ZohoCRM_upsertRecords",
             "ZohoCRM_createRecords", "ZohoCRM_insertRecords", "ZohoCRM_createRecord",
             "ZohoCRM_createNotes", "ZohoCRM_createNote",
             "ZohoCRM_convertLead", "ZohoCRM_convertLeads"
           ]
         }
       ]
     },
     "sample": {}
   }
   ```

   Le nom `Zoho CRM` est le nom d'affichage du connecteur dans claude.ai. Les
   outils d'écriture listés ne sont utilisés que s'ils existent réellement sur
   le connecteur du lecteur ; sinon la page reste en lecture seule et propose
   des instructions à coller dans Claude.
3. Partager l'URL de l'artefact avec le responsable commercial. À la première
   ouverture, Claude lui demande d'autoriser le connecteur Zoho CRM pour cette
   page, puis l'accès à Claude pour les briefings.

## Mise à jour

Modifier `src/`, relancer `npm run check`, puis republier `dist/dashboard-eso.html`
sur la **même URL** (paramètre `url` de l'outil Artifact). Les lecteurs qui ont
la page ouverte reçoivent la nouvelle version automatiquement.

## Épingler dans Claude Desktop

Dans l'application Claude, ouvrir l'artefact puis l'épingler dans la barre
latérale : il devient accessible en un clic, avec les données Zoho CRM du
compte connecté.

## Dépannage

| Symptôme | Cause | Remède |
| --- | --- | --- |
| Bannière « Données de démonstration » | page ouverte hors de Claude, ou connecteurs non servis | ouvrir l'artefact dans Claude (web ou desktop) |
| « Connecteur Zoho CRM absent » | le lecteur n'a pas le connecteur | l'ajouter dans claude.ai → Paramètres → Connecteurs |
| « Reconnectez Zoho CRM » | jeton expiré | reconnecter le connecteur |
| « Autorisation requise » | la demande d'accès a été ignorée | cliquer sur « Autoriser et réessayer » |
| « Lecture seule » | le connecteur n'expose pas d'outil d'écriture | activer les outils d'écriture côté Zoho MCP, reconnecter, actualiser |
