# Restitution du dossier

Fichier → Restituer le dossier complet… Une archive ZIP contenant une table par
fichier CSV, un manifeste, et un relevé de contrôle. Réservée à
l'ADMIN_CABINET. Route `GET /restitution/archive`.

## Ce qui la fonde, et ce qui ne la fonde pas

L'AUDCIF art. 22, 1° veut que les données « puissent être restituées sur papier
ou sous une forme directement intelligible ». L'art. 22, 6° veut que
l'organisation permette « la reconstitution du chemin de révision » · c'est ce
qui justifie le maillon d'audit `EXTRACTION`, qui dit qui a emporté quoi et
quand. L'art. 3 du SYCEBNL, qui énumère les articles écartés pour les entités à
but non lucratif, ne cite pas l'art. 22 : l'obligation vaut des deux côtés, et
la route ne porte donc aucun décorateur de référentiel.

En revanche, **aucun texte lu n'impose la restitution d'un dossier complet à un
successeur, n'en fixe le format, ne dit qui a qualité pour la demander, ni ce
que doit contenir un manifeste.** Le ZIP, le périmètre des 54 tables, le rôle
ADMIN_CABINET et le contenu du manifeste sont des décisions d'OmegaX. Le
manifeste les présente comme telles.

## Les cinq réserves, écrites à l'écran et dans le manifeste

1. **Elle ne remplace pas la conservation** · aucune colonne du schéma ne
   stocke de pièce justificative numérisée, alors que l'art. 17, 3° les veut
   datées, conservées et classées, et que l'art. 24 les vise expressément.
2. **Elle n'a pas la valeur probante du papier en RDC** · CPCC, § 1.5.3 b),
   première phrase.
3. **Ce n'est pas une réversibilité** · trois imports existent (plan de
   comptes, balance, écritures), les autres tables se lisent sans se recharger.
4. **Ce n'est pas un instantané** · les tables sont lues l'une après l'autre,
   sans transaction commune. `controles.txt` compare, table par table,
   l'inventaire annoncé aux lignes réellement écrites.
5. **Les CSV ne sont pas le livre-journal** · chaque table est lue dans l'ordre
   de sa clé, qui n'est pas chronologique. Seul `EvenementAudit` fait
   exception et se lit par son rang.

Aucun délai de conservation n'est affiché · le CPCC constate expressément
« l'absence de délai fixe unique ».

## La borne de lecture, et pourquoi elle est le point dur

La garde de cloisonnement commence par
`if (!MODELES_CLOISONNES.has(model)) return query(args)`. Les quinze modèles
portés par leur parent n'ont pas de `tenantId` : **la garde ne les regarde pas**.
Un `ligneEcriture.findMany({})` écrit dans l'extracteur rendrait les lignes de
tous les cabinets, sans erreur et sans trace, dans une archive parfaitement
bien formée.

L'extracteur ne construit donc jamais son propre `where` · il le demande à
`borneDuModele`, et `lecture-bornee.spec.ts` vérifie chaque borne avec
`filtreBorne`, la fonction que le moteur consulte lui-même. Les bornes des
modèles portés passent toutes par une relation **obligatoire** : une relation
facultative perdrait en silence les lignes où elle est nulle.

## Ce qui n'est pas derrière la garde de licence

Le contrôleur d'exports porte `LicenceGuard`. La restitution a son propre
contrôleur, sans lui. Une restitution derrière `LicenceGuard` ne serait
disponible que tant que le client paie, donc pas dans le seul cas où elle sert :
suspendre, archiver, restituer, purger. **Décision de VMG**, pas règle de droit ·
elle se défait en ajoutant le garde à cette ligne.

## Ce qui reste ouvert

Le navigateur bufferise l'archive entière (`api.telecharger` fait
`await res.blob()`), et le service Cloud Run tourne au plafond de durée de
requête par défaut · aucun `--timeout` n'est passé au déploiement. Sur un très
gros dossier, l'extraction peut donc buter sur ce plafond avant d'aboutir. Rien
ne le masque : l'écran prévient que l'opération est longue.
