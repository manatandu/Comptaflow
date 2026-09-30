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

Le maillon a un SECOND fondement, pour les données à caractère personnel que
l'archive emporte (tiers, registre du personnel, utilisateurs) · le Code du
numérique (ordonnance-loi n° 23/10 du 13 mars 2023), art. 219, 14°, charge le
responsable du traitement de « Garantir que soit vérifiée et constatée à
posteriori l'identité des personnes ayant eu accès au système […], la nature
des données qui ont été […] copiées […] le moment auquel ces données ont été
manipulées ». Il vise le responsable du traitement et les seules données
personnelles, et ne fixe pas la forme de la trace. Le commentaire de
`ActionAudit.EXTRACTION` au schéma, qui écrit qu'« aucun texte lu n'impose de
journaliser une extraction », est donc à reprendre (passe D4, D4-C3).

En revanche, **aucun texte lu n'impose la restitution d'un dossier complet à un
successeur, n'en fixe le format, ne dit qui a qualité pour la demander, ni ce
que doit contenir un manifeste.** Le ZIP, le périmètre des tables, le rôle
ADMIN_CABINET et le contenu du manifeste sont des décisions d'OmegaX. Le
manifeste les présente comme telles.

## Les cinq réserves, écrites à l'écran et dans le manifeste

1. **Elle ne remplace pas la conservation** · OmegaX ne tient pas les pièces
   justificatives des écritures, alors que l'art. 17, 3° les veut datées,
   conservées et classées, et que l'art. 24 les vise expressément. Seuls les
   documents attachés aux tiers (`DocumentTiers.contenu`, la seule colonne
   binaire du schéma) sont archivés, à côté des CSV, dans `documents-tiers/`.
2. **Elle n'a pas la force probante de l'écrit papier légalisé** · le Code du
   numérique (ordonnance-loi n° 23/10 du 13 mars 2023, en vigueur à sa
   promulgation, art. 390) donne à l'écrit électronique « la même valeur
   juridique que l'écrit sur papier » (art. 89), et la force probante de
   l'écrit papier légalisé à date certaine à celui qui est horodaté et porte
   une signature électronique certifiée (art. 91). L'archive n'a ni l'un ni
   l'autre. Son admission en preuve (art. 95) suppose l'identification de son
   auteur et une conservation intègre selon la législation des archives ; le
   décret de l'art. 44 n'est pas au corpus, et la qualification revient à un
   juriste. La réserve citait jusqu'au 2026-09-30 les notes du CPCC de
   novembre 2020 (§ 1.5.3 b), antérieures au Code (passe D4).
3. **Ce n'est pas une réversibilité** · l'import général recharge un plan de
   comptes, une balance et des écritures, trois imports ciblés lisent un relevé
   bancaire, la balance d'une entité consolidée et le canevas d'une cellule ;
   les autres tables se lisent sans se recharger.
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
`if (!MODELES_CLOISONNES.has(model)) return query(args)`. Les modèles
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
