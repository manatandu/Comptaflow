# Relevé de manques, référentiel par référentiel

Méthode : relire le texte officiel dans les compétences, **article par
article**, et confronter chaque obligation au code. Rien n'est écrit ici qui
n'ait été lu à sa source puis vérifié dans un fichier.

Classement par gravité, dans cet ordre : ce qui produit un état **FAUX**, ce
qui le produit **INCOMPLET**, ce qui n'est qu'un **confort**. Une quatrième
catégorie s'est imposée à l'usage : les **obligations de calendrier**, qui ne
touchent pas un état mais une date opposable.

Ce document est tenu au fil des passes. Chaque passe dit ce qu'elle a couvert
et ce qu'elle n'a pas encore ouvert.

---

## Passe 1 · Acte uniforme SYCEBNL, articles 1 à 28 (2026-09-03)

Couvert : champ d'application (art. 2-3), jeux d'états par type d'entité
(art. 4), systèmes et seuils (art. 5-6), contenu des états (art. 7-13), livre
d'inventaire (art. 14), notes annexes (art. 15), règles de présentation
(art. 16), registre des donateurs (art. 17-18), auditeur (art. 19-22).

### Ce qui est conforme, et vérifié

Ces points ont été ouverts et refermés : ils ne sont pas des manques, et les
consigner évite de les rouvrir à chaque passe.

| Article | Vérification faite |
|---|---|
| **art. 6** · éligibilité au SMT | `EtatsFinanciersSmtService.eligibilite` reprend les cinq seuils de 30 000 000 un à un, ET la règle cumulée sur deux exercices. Route `GET /etats-financiers/smt/eligibilite`. |
| **art. 14** · livre d'inventaire | Les CINQ états du point 2 (projets) sont transcrits, **dans l'ordre du texte**, et un test porte sur l'ordre lui-même. Les trois du point 1 (associations) aussi. |
| **art. 16, 4** · bilan d'ouverture = bilan de clôture | Gardé aux deux portes : `ecriture.service.ts` refuse de corriger une écriture générée par la clôture, et l'import range une balance en à-nouveau plutôt qu'en mouvement. |
| **art. 17** · registre des donateurs | Le modèle `Donation` reprend le texte point par point : date, nom/prénoms/domicile, dénomination/immatriculation/NIF/siège, adresse électronique, montant et mode de libération, numérotation continue attribuée par le service, signature du représentant légal. |
| **art. 19** · seuils de désignation | `regles-auditeur.ts` porte les trois critères **alternatifs** et ne les confond pas avec les critères de l'AUSCGIE, qui en demandent deux sur trois. |

### Obligation de calendrier · CORRIGÉE dans cette passe

**Le délai de quarante-cinq jours de l'article 19 manquait au SYCEBNL.**

- **Ce que le texte exige** · art. 19 al. 4 : « Les états financiers et le
  rapport de gestion annuels sont transmis à l'auditeur s'il en a été désigné,
  QUARANTE-CINQ JOURS AU MOINS avant la date de l'assemblée générale ordinaire
  ou de l'instance qui en tient lieu […] ou la date de transmission du rapport
  de l'auditeur aux bailleurs de fonds et/ou à l'État bénéficiaire du Projet de
  développement. »
- **Ce que le logiciel faisait** · le jalon 17 « Mise à disposition de
  l'auditeur » vivait sur le calendrier du CPCC (« début mars au 15 mai ») et
  était classé `INTERNE`, comme un usage de cabinet. Le délai n'apparaissait
  nulle part.
- **Fichier** · `src/modules/exercice/planning-cloture.ts`.
- **Nature** · lacune du LOGICIEL, et **asymétrie** : le pendant SYSCOHADA
  (jalon 16, AUSCGIE art. 140) portait « QUARANTE-CINQ JOURS AU MOINS » en
  toutes lettres depuis le début. Une association lisait donc un jalon plus
  tiède que celui d'une SARL, sur une règle que son propre Acte uniforme
  énonce aussi nettement.
- **Corrigé le 2026-09-03** · le jalon porte le délai, dit qu'il se compte à
  rebours de l'assemblée et non de la clôture, prévoit le cas du projet de
  développement qui ne tient pas d'assemblée, et passe en `LEGALE`.
  L'échéance ne bouge pas : le 15 du cinquième mois EST quarante-cinq jours
  avant une assemblée tenue fin juin. Deux tests figent le délai dans les
  **deux** référentiels.

### Ce qui produit un état INCOMPLET

**1 · Les engagements donnés et reçus n'ont aucun suivi comptable.**

- **Ce que le texte exige** · art. 15 : les notes annexes comportent « tous les
  éléments à caractère significatif qui ne sont pas mis en évidence dans les
  autres états financiers […]. Il en est ainsi notamment pour **le montant des
  engagements donnés et reçus dont le SUIVI doit être assuré par l'entité dans
  le cadre de son organisation comptable**. »
- **Ce que le logiciel fait** · la note 1 « Engagements financiers » est une
  grille de saisie libre. Rien ne tient un registre d'engagements, et rien ne
  rapproche ce qui y est écrit d'une donnée du dossier.
- **Fichiers** · `correspondance-notes-associations.ts` (note 1),
  `etats-financiers-projet-budget.service.ts` (`engagementsHorsComptabilite`,
  valeur en dur).
- **Nature** · lacune du LOGICIEL. Elle a deux conséquences, pas une : la note
  1 n'est pas recoupable, et la colonne *Engagement* du tableau d'exécution
  budgétaire est structurellement incomplète · c'est le seul état livré qui
  s'auto-déclare partiel.
- **Ce que ça change au chiffrage** · le module « achats et engagements de
  dépense » était jusqu'ici justifié par un tableau budgétaire incomplet. Il
  l'est aussi par l'article 15, qui en fait une obligation d'organisation
  comptable.

**2 · L'absence de comparabilité n'est jamais signalée.**

- **Ce que le texte exige** · art. 16 al. 2 : « Lorsque l'un des postes chiffrés
  d'un état financier n'est pas comparable à celui de l'exercice précédent,
  c'est ce dernier qui doit être adapté. L'absence de comparabilité ou
  l'adaptation des chiffres est signalée dans les Notes annexes. »
- **Ce que le logiciel fait** · il sert la colonne N-1 telle qu'elle est, sans
  jamais se demander si elle est comparable, et sans offrir de porter une
  adaptation. La note 4 couvre les changements de MÉTHODE ; la non-comparabilité
  d'un poste est autre chose (changement de périmètre, exercice de durée
  inégale, poste créé ou supprimé).
- **Fichiers** · `etats-financiers.service.ts` et ses pendants, qui posent
  `montantN1` sans qualificatif.
- **Nature** · lacune du LOGICIEL, mineure en fréquence et sérieuse le jour où
  elle se produit · un lecteur compare deux colonnes qui ne se comparent pas.

### Confort, ou lacune déjà déclarée

**3 · La sortie de l'obligation d'auditeur n'est pas traitée.** Art. 19 al. 2 :
l'entité cesse d'être tenue « dès lors qu'elle ne remplit plus aucun des trois
critères pendant les DEUX exercices qui précèdent l'expiration du mandat ». Le
contrôle ne regarde qu'un exercice. **Ce n'est pas une découverte** :
`regles-auditeur.ts` le déclare noir sur blanc en en-tête, avec la même
réserve pour la SAS contrôlée, la SCS, le GIE, la coopérative et
l'entreprenant. Une règle absente y est déclarée absente, jamais remplacée par
la plus proche.

**4 · Le mandat de l'auditeur n'est pas suivi.** Art. 21 : nommé pour trois
exercices, renouvelable une fois ; art. 22 : prorogation de plein droit si
l'assemblée ne statue pas. Aucun modèle ne porte l'auditeur, sa date de
nomination ni son mandat · le logiciel ne peut donc pas dire « le mandat
expire à cette assemblée ». Lacune du LOGICIEL, sans effet sur les comptes.

---

## Ce qui n'a pas encore été ouvert

À traiter dans les passes suivantes, dans cet ordre :

1. **SYCEBNL Partie 1 ch. 2** · cadre conceptuel · les cinq postulats et les
   cinq conventions, et surtout le traitement des changements de méthode, des
   changements d'estimation et des corrections d'erreurs (§ 3.3.1), qui
   commandent des retraitements rétrospectifs.
2. **SYCEBNL Partie 3** · les six chapitres d'opérations spécifiques, contre le
   catalogue `catalogue-operations*.ts`.
3. **AUDCIF** · articles 1 à 113, en particulier l'organisation comptable
   (art. 14 à 24) et les délais.
4. **AUDCIF Titre VIII** · les 41 chapitres d'opérations spécifiques.
