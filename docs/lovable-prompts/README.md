# Prompts Lovable

Ce dossier contient les prompts de référence pour faire évoluer uniquement le frontend de Paceday avec Lovable et une boucle de feedback courte et vérifiable. Lovable doit lire AGENTS.md à la racine avant de les utiliser.

## Ordre recommandé

1. `00-global-context.md` — contexte et règles d’architecture à fournir au début d’une session Lovable.
2. `01-real-api-first.md` — vérifier que le frontend utilise réellement l’API et que le fallback reste explicite.
3. `02-personal-calendars.md` — calendriers personnels, synchronisation, édition et aperçu.
4. `03-scheduling-links.md` — création, édition, partage et invitations des liens de planification.
5. `04-public-booking.md` — parcours public de consultation des créneaux et réservation.
6. `05-conferencing.md` — fournisseurs de visioconférence, OAuth et liens de réunion.
7. `06-audit-log.md` — écran d’audit et lecture des événements d’activité.
8. `07-manager-team.md` — manager, équipe, zones sans réunion, disponibilité et analytics.
9. `08-final-qa.md` — validation finale en ligne, hors ligne, tests et rapport de changement.

## Mode d’emploi

Dans Lovable, ouvrir le repository frontend puis :

1. Coller `00-global-context.md` au début d’une nouvelle session.
2. Coller un seul prompt fonctionnel à la fois.
3. Demander à Lovable de répondre avec les fichiers modifiés, les endpoints utilisés, les tests exécutés et les points non résolus.
4. Vérifier localement après chaque prompt avec `npm run lint`, `npm test` et `npm run build` depuis la racine du repository frontend.
5. Committer après chaque fonctionnalité validée.

Le backend et ses contrats sont considérés comme gelés pendant cette phase. Les prompts demandent donc à Lovable de ne modifier ni le backend, ni les migrations, ni la CI, ni les dépendances sans demande explicite.

## Règles communes

- Utiliser les modules de `frontend/src/api/` et React Query comme seule frontière réseau.
- Ne pas ajouter de `fetch` direct dans les composants.
- Ne pas utiliser `localStorage` comme source principale de vérité.
- Conserver le fallback local existant pour la preview Lovable, mais ne jamais masquer silencieusement une erreur de l’API en mode connecté.
- Respecter les réponses HTTP 204, 409, 410, 422 et 5xx.
- Ne pas inventer de champs ou d’endpoints : demander d’abord une adaptation dans l’adapter API si un besoin manque.
- Ne jamais afficher de secret, token OAuth ou contenu sensible dans l’interface ou les logs.
