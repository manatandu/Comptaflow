# Connexions à la base et plafonds du service

Ce document répond à une seule question : **combien de connexions le logiciel
ouvre-t-il vers la base, et que se passe-t-il quand plusieurs cabinets
travaillent en même temps ?**

Il s'adresse à qui exploite OmegaX, pas à qui le développe. La marche à suivre
de la section 4 est celle que Manasse applique lui-même : aucune chaîne de
connexion ne transite par une session de développement.

---

## 1. Le risque, en une phrase

Cloud Run **multiplie les instances** du serveur sous la charge, et **chaque
instance ouvre son propre pool de connexions Prisma**. Sans plafond, cent
instances peuvent exister à la fois, chacune tenant une poignée de connexions :
la base atteint sa limite, refuse les suivantes, et le service tombe **pour
tous les cabinets à la fois**.

Cette panne ne vient d'aucun bug. Aucun test ne la voit, aucun contrôle de
santé ne l'annonce : elle arrive le jour où le logiciel commence à marcher.

---

## 2. Les deux chaînes de connexion, et pourquoi elles ne sont pas interchangeables

Neon donne deux adresses pour la même base.

| | Endpoint **direct** | Endpoint **poolé** (hôte suffixé `-pooler`) |
|---|---|---|
| Ce que c'est | une connexion Postgres ordinaire | un PgBouncer en mode **transaction** devant la base |
| Connexions clientes | limitées, comptées | multiplexées, des milliers possibles |
| Sessions longues, verrous, DDL | oui | **non** |
| Sert à | `prisma migrate deploy`, `pg_dump` | **le service en production** |

Un pooling en mode transaction rend la connexion au bout de **chaque
transaction**. Il ne peut donc pas tenir :

- un **verrou consultatif de session**, que `prisma migrate deploy` pose pour
  qu'une seule migration coure à la fois ;
- une **session de sauvegarde cohérente**, que `pg_dump` tient de bout en bout ;
- les **requêtes préparées** de Prisma, d'où le paramètre `pgbouncer=true` (voir
  section 3).

D'où la répartition, déjà en place dans les workflows :

- `secrets.API_DATABASE_URL` · la chaîne **directe** · migrations et `pg_dump` ;
- `secrets.API_DATABASE_URL_POOLED` · la chaîne **poolée** · ce que le service
  reçoit dans sa variable `DATABASE_URL`.

**Tant que le second secret n'existe pas, le premier sert** et tout se comporte
comme avant : c'est un repli voulu, pour qu'un déploiement ne coupe pas le
service en attendant un secret.

---

## 3. Les deux paramètres que le déploiement pose lui-même

`.github/workflows/deploy-cloud-run.yml` complète la chaîne poolée avant de la
donner à Cloud Run, **sans jamais l'afficher** :

- `pgbouncer=true` · PgBouncer en mode transaction ne conserve pas les requêtes
  préparées d'une transaction à l'autre. Sans ce drapeau, Prisma les réutilise
  et la base répond « prepared statement already exists » **à la deuxième
  requête** · donc en production, jamais au premier essai.
- `connection_limit=10` · borne le pool de **chaque instance**. Sans elle,
  Prisma prend un défaut lié au nombre de cœurs, et le total dépend du hasard du
  dimensionnement.

Un paramètre **déjà présent** dans le secret n'est jamais écrasé : c'est le
choix de l'exploitant, et il prime. Rien n'est ajouté à une chaîne directe, où
ces deux réglages n'auraient pas de sens.

---

## 4. Marche à suivre · créer le secret (à faire par Manasse)

1. Ouvrir la **console Neon**, projet de la base OmegaX, onglet *Connection
   details*.
2. Choisir **Connection pooling** (ou cocher « Pooled connection ») : l'hôte
   affiché se termine alors par **`-pooler`**. C'est la seule différence
   visible avec la chaîne directe · même utilisateur, même mot de passe, même
   base.
3. Copier la chaîne entière.
4. Sur GitHub : dépôt `manatandu/Comptaflow` → **Settings** → *Secrets and
   variables* → **Actions** → **New repository secret**.
   - Nom · `API_DATABASE_URL_POOLED` (exactement, majuscules comprises)
   - Valeur · la chaîne copiée
5. **Ne pas toucher** à `API_DATABASE_URL` : il reste la chaîne directe, et les
   migrations comme les sauvegardes en dépendent.
6. Relancer le workflow *Déployer le serveur sur Cloud Run* (onglet **Actions**
   → le workflow → **Run workflow**), ou pousser n'importe quel changement du
   serveur.

### Vérifier que le secret a bien pris

Le serveur écrit **au démarrage** une ligne qui dit son régime de connexion,
sans jamais montrer la chaîne :

```
Base · endpoint POOLÉ, plafond de connexions 10 par instance
```

Elle se lit dans les journaux Cloud Run du service `comptaflow-api`. Avant la
bascule, elle dit `endpoint DIRECT (non poolé)`. Si elle porte
`ATTENTION : pgbouncer=true absent`, la chaîne copiée n'est pas la bonne :
reprendre l'étape 2.

---

## 5. Les plafonds du service

Posés dans le workflow, donc reproductibles à chaque déploiement · **une valeur
posée à la main dans la console Google est effacée au push suivant**
(`--env-vars-file` remplace toutes les variables du service).

| Réglage | Valeur | Pourquoi |
|---|---|---|
| `--min-instances` | 1 | une instance chaude · sans elle, la première page ouverte attend le démarrage complet de NestJS et l'ouverture d'une connexion |
| `--max-instances` | 4 | **le plafond qui compte ici** · borne le nombre de pools ouverts vers la base |
| `--concurrency` | 80 | valeur par défaut de Cloud Run, posée explicitement pour qu'elle cesse d'être implicite |
| `--cpu-boost` | oui | accélère la phase de démarrage |

Quatre instances à quatre-vingts requêtes chacune font **trois cent vingt
requêtes simultanées**, très au-delà de ce qu'un cabinet et ses dossiers
produisent. Ce qui est borné ici n'est pas le trafic : ce sont les
**connexions**.

### Ce qui n'est PAS touché, et pourquoi

La **mémoire** du service reste à sa valeur actuelle. Les plafonds de fenêtre du
logiciel (journal, grand livre, exports) ont été **mesurés** sur un tas de
460 Mio, valeur consignée dans `docs/capacite-mesuree.md`. Les relever demande
de refaire le banc, pas de changer un drapeau : sans cela, ce document
mentirait, et ses plafonds seraient calibrés pour une machine qui n'existe plus.

---

## 6. Quand faudra-t-il revenir sur ces valeurs

- **Plus de quatre instances saturées durablement** (Cloud Run le montre dans
  ses métriques) · relever `--max-instances`, en vérifiant d'abord que la base
  suit. Avec l'endpoint poolé, c'est PgBouncer qui absorbe, pas la base.
- **Des erreurs `too many connections`** malgré le poolé · abaisser
  `connection_limit`, en le posant explicitement dans le secret (il prime).
- **Des exports qui butent sur leurs plafonds** · c'est une question de
  mémoire, pas de connexions : refaire le banc de `docs/capacite-mesuree.md`
  avec le nouveau tas, puis relever les constantes du code.
