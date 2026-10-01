# § 10 bis et § 10 ter

> Détail déplacé de CLAUDE.md (jusque-là chargé à chaque session). Les règles JAMAIS de CLAUDE.md priment ; lire ce fichier quand on touche au sujet.

## 10 bis. Ce qui casse en silence

Un défaut qui laisse l'écriture ÉQUILIBRÉE et la balance BOUCLÉE ne se voit
nulle part en aval, parce que tout en aval est cohérent avec la mauvaise
racine. Il se refuse donc à la racine, par un message nommé · un contrôle en
aval arriverait toujours trop tard. Quatre refus posés le 2026-09-03, gelés
par `casse-en-silence.spec.ts` :

- **La date de l'écriture tombe dans son exercice.** `modifier` l'exigeait,
  `creer` non · une écriture datée de l'année précédente mais rattachée à
  l'exercice courant entrait au bilan et au compte de résultat de cet
  exercice, puisque tous les états filtrent sur `exerciceId`. C'est la faute
  de janvier. Postulat de spécialisation des exercices · SYCEBNL cadre
  conceptuel § 3.3.1.2.3, AUDCIF Titre I.
- **Toute écriture porte le numéro que son journal impose.** Quatre chemins
  de création n'appelaient pas la numérotation · les deux imports et les deux
  écritures du module Groupe. Le calcul vit maintenant dans
  `journaux/numerotation-piece.ts`, appelable sans injecter le service, et le
  spec découpe chaque `ecriture.create(` de tout `src/` et exige `numeroPiece`
  dans SON argument (audit du serveur C10).
- **Une écriture qu'un module tient ne se supprime pas depuis le journal.**
  Des tables la référencent (liste dans `detenteurs-ecriture.ts`), et sur un
  lien FACULTATIF Prisma pose
  `ON DELETE SET NULL` · le lien se dénoue sans erreur. La pire est
  l'affectation du résultat : elle resterait enregistrée sans son écriture, le
  report à nouveau n'aurait jamais bougé, et le contrôle 22 ne peut rien y
  voir puisque le défaut est une ABSENCE de mouvement.
- **Une période n'est couverte que par un seul exercice.** L'art. 7 impose la
  durée, pas l'unicité · deux exercices sur la même année passaient, chacun
  bouclant sa liasse de son côté.

La liste des modules qui retiennent une écriture est écrite à la main, jamais
déduite du schéma : une relation nouvelle doit obliger quelqu'un à décider si
son module retient l'écriture ou la laisse partir.

**Un cinquième défaut, d'une autre nature · le contrôle qui FABRIQUE une
anomalie.** Les quatre ci-dessus sont des données fausses. Celui-là est un
signalement faux, et il est pire à sa manière : le cabinet le corrige, et
personne ne saura jamais qu'il n'existait pas. Deux bornes à poser sur tout
contrôle nouveau, et le contrôle 25 (attestation d'exemption d'IS) les porte
toutes les deux :

- **le périmètre du texte.** L'arrêté n° 007/2025 ne vise que les
  établissements d'utilité publique et les ONG (art. 1er) · le réclamer à une
  association serait une exigence inventée ;
- **l'entrée en vigueur.** Les contrôles sont PAR EXERCICE. Un contrôle non
  borné reproche à un exercice 2024 une obligation entrée en vigueur au
  1er janvier 2026, au nom d'un texte qui n'était pas en vigueur. Le message
  est plausible, sourcé, et faux.

## 10 ter. Le regard du réviseur

Un auditeur demande le journal, et il le demande AVEC SA PISTE. OmegaX
capturait `createdBy`, `createdAt`, `valideeBy` et `valideeAt` depuis toujours
et n'en restituait aucun · ni à l'écran, ni dans le classeur remis. C'était un
manque de RESTITUTION, pas de collecte, et l'AUDCIF art. 22, 1° demande les
deux moitiés de la phrase : les données « comprennent, lors de leur entrée,
l'indication de l'ORIGINE, du contenu et de l'imputation, et puissent être
RESTITUÉES sur papier ou sous une forme directement intelligible ». L'article
22 n'est pas dans la liste d'exclusion de l'art. 3 du SYCEBNL : il vaut des
deux côtés.

La DATE DE SAISIE n'est pas la date comptable. L'écart entre les deux est ce
que l'art. 22, 4° appelle la date de valeur, « mentionnée distinctement », et
c'est l'axe du test de l'ISA 240. Le journal exporté porte donc désormais
Statut, Saisie le, Saisie par, Validée le, Validée par · l'auteur résolu en
COURRIEL, un auditeur ne lisant pas un uuid, et un utilisateur retiré du
dossier nommé comme tel plutôt que laissé en case vide.

**Le test des écritures de journal** (`controles/test-ecritures-journal.ts`)
rend la sélection de l'ISA 240 § 33 a), que l'auditeur conduit
« indépendamment de son évaluation des risques de contournement des contrôles
par la direction ». Les six critères sont ceux que la norme énumère elle-même
au § A44, cités et non paraphrasés. Deux règles tiennent ce module :

- **il sélectionne, il ne conclut pas.** Une écriture retenue n'est ni
  douteuse ni frauduleuse · le test reste celui de l'auditeur. Un logiciel qui
  écrirait « anomalie » sur un montant rond ferait dire à la norme le contraire
  de ce qu'elle dit ;
- **les seuils sont déclarés, jamais enfouis dans une requête.** La norme n'en
  fixe aucun : ce sont des conventions de lecture d'OmegaX, et le classeur les
  annonce comme telles, avec le dénombrement par critère.

**Double regard à la validation · une OPTION, et la lecture qui l'explique.**
`Tenant.doubleRegardValidation` (défaut FAUX) fait qu'une écriture n'est
validable que par un autre utilisateur que celui qui l'a saisie. C'est la
validation qui fait entrer la pièce au livre-journal, et l'AUDCIF art. 22, 2°
rend le franchissement irréversible (« l'irréversibilité des traitements
interdise toute suppression, addition ou modification ultérieure »). Aucun
chemin de dévalidation n'existe dans ce dépôt.

LE DÉFAUT FAUX N'EST PAS UNE PRUDENCE, c'est une lecture. Le MÊME art. 22, 2°
impose la validation et NE NOMME PERSONNE ; l'art. 69 la délègue expressément
(« L'entité détermine, sous sa responsabilité, les procédures nécessaires ») ;
et le CPCC décrit la division du travail comme une possibilité d'organisation
(§ 2.6.1, « le chef comptable PEUT se limiter à vérifier la conformité de
l'imputation ») tout en admettant la très petite entité « où la comptabilité
est tenue par une seule personne ». Aucun texte lu n'exige que le validateur
diffère de l'auteur : l'imposer d'office rendrait le logiciel inutilisable au
cabinet à un seul comptable, au nom d'une règle que personne n'a écrite.

L'OPTION ATTEINT LES DEUX RÉFÉRENTIELS PAR DEUX CHEMINS, et les messages ne se
servent jamais l'un pour l'autre : AUDCIF art. 69 côté SYSCOHADA, SYCEBNL
art. 16, 2) côté EBNL, puisque son art. 3 exclut justement l'art. 69. Ne jamais
invoquer l'art. 19 ni le mot « mensuelle » dans ces messages · c'est l'article
de la centralisation des journaux auxiliaires, il est conditionnel (« dans ce
cas »), et le délai du SYCEBNL est HEBDOMADAIRE.

LE REFUS ÉCARTE, IL NE JETTE PAS. L'art. 22, 2° veut la validation faite « au
terme de chaque période qui ne peut excéder un mois », donc par lots : jeter
sur le lot entier ferait qu'une seule pièce empêcherait de valider la période.
L'écriture n'entre pas au livre-journal, ce QUI EST le refus ; ce qui change
est sa forme.

DEUX EXCLUSIONS ÉCRITES, jamais omises. Les écritures `estGenereeParCloture`
(personne ne « saisit » un report à nouveau calculé à partir de soldes déjà
validés, et le laisser au brouillard ferait cesser la correspondance bilan de
clôture / bilan d'ouverture sans qu'aucun total ne bouge) et l'écriture de
combinaison du module Groupe (dossier technique, régénéré à chaque appel,
personne n'y saisit).

ET UN POINT AVEUGLE, à ne pas confondre avec une exclusion : le siège fait
naître des écritures dans le dossier d'une CELLULE avec le `createdBy` d'un
utilisateur du siège. Le double regard y est satisfait PAR CONSTRUCTION, et
personne dans la cellule n'a relu. Le logiciel ne contrôle que l'IDENTITÉ,
jamais l'INDÉPENDANCE.

Le contrôle `VALIDATION_PAR_SON_AUTEUR` (gravité INFORMATION, jamais
AVERTISSEMENT · aucun texte n'est enfreint) signale l'historique et les
dossiers qui n'ont pas activé l'option. Rien n'est dévalidé rétroactivement.

