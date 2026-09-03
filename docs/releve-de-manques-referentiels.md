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

## Passe 2 · Cadre conceptuel · changements de méthode et corrections d'erreurs (2026-09-03)

Lu : SYCEBNL Partie 1 ch. 2 § 3.3.1 (postulat de permanence des méthodes,
a/ changements de méthodes, b/ changements d'estimation, c/ corrections
d'erreurs) et son pendant AUDCIF Titre V, plus l'AUDCIF Titre VIII ch. 16
§ 2.3 sur l'usage du compte de report à nouveau.

**Les deux textes disent EXACTEMENT la même chose**, jusqu'au vocabulaire :
la correspondance « bilan de clôture, bilan d'ouverture » souffre **DEUX
exceptions**, et deux seulement, où l'imputation se fait directement sur les
capitaux propres.

### Ce qui produit un état FAUX

**1 · La correction d'une erreur significative d'un exercice antérieur n'a
aucun chemin dans le logiciel.**

- **Ce que le texte exige** · SYCEBNL Partie 1 ch. 2 § 3.3.1 c), repris
  identiquement par l'AUDCIF Titre V : « La correction d'une erreur
  significative commise au cours d'un exercice antérieur doit être opérée par
  ajustement des capitaux propres d'ouverture (diminution ou augmentation du
  report à nouveau). Il s'agit là de la **seconde exception** à la convention
  de correspondance bilan de clôture, bilan d'ouverture. » L'AUDCIF Titre VIII
  ch. 16 § 2.3 le confirme côté compte : « À titre exceptionnel, le compte
  report à nouveau sera utilisé pour enregistrer les imputations sur les
  capitaux propres résultant des changements de méthodes et des corrections
  d'erreurs significatives. »
  Le texte distingue par ailleurs deux cas que le logiciel confond : l'erreur
  **de l'exercice en cours** se corrige « exclusivement par inscription en
  négatif » (art. 20), l'erreur **non significative** d'un exercice antérieur
  se corrige dans les comptes de l'exercice en cours, et l'erreur
  **significative** d'un exercice antérieur passe par le report à nouveau.
- **Ce que le logiciel fait** · il n'offre qu'une seule voie, l'inscription en
  négatif, et refuse toute écriture sur un exercice clôturé.
- **Fichiers** · `src/modules/comptabilite/ecriture.service.ts` (la correction
  par inscription en négatif, et le refus sur exercice clôturé).
- **Nature** · lacune du LOGICIEL, dans les DEUX référentiels.
- **Pourquoi c'est un état faux, et non un simple manque** · privé de ce
  chemin, le cabinet corrigera dans l'exercice en cours. Deux états deviennent
  alors faux d'un coup : le **résultat de l'exercice**, qui absorbe une erreur
  qui ne lui appartient pas, et le **report à nouveau**, qui reste erroné.
  L'erreur ne disparaît pas · elle change de ligne.
- **Comptes lus à la source** · SYCEBNL, compte 12 Report à nouveau
  (121 excédents, 128 résultat en instance d'affectation, 129 déficits) ·
  SYSCOHADA, compte 12 également (121 créditeur, 129 débiteur), tel que semé
  depuis le TSV officiel.

**2 · Le changement de méthode à impact fort significatif : même absence.**

- **Ce que le texte exige** · « L'impact du changement déterminé à l'ouverture
  est imputé en report à nouveau dès l'ouverture de l'exercice […]. Il s'agit
  là d'une **première exception** à la convention de correspondance. » Et,
  pour les exercices ultérieurs, « des informations **pro-forma** des exercices
  antérieurs présentés sont établies suivant la nouvelle méthode afin
  d'assurer la comparabilité ».
- **Ce que le logiciel fait** · rien pour l'imputation. La note 4
  « Changements de méthodes comptables » existe et est désormais **stockée**
  (depuis le 2026-09-03) : l'obligation d'INFORMATION en annexe est donc
  satisfaite. Ce qui manque est l'ÉCRITURE d'imputation, et les états
  pro-forma.
- **Nature** · lacune du LOGICIEL, dans les DEUX référentiels.

**3 · Le code énonce la règle SANS ses exceptions, et c'est ainsi que le
manque se perpétue.**

`ecriture.service.ts` refuse la correction d'une écriture de clôture au motif
que « le bilan d'ouverture d'un exercice doit correspondre au bilan de clôture
de l'exercice précédent (SYCEBNL art. 16, 4 ; AUDCIF art. 34) ». La citation
est exacte, mais **incomplète** : le cadre conceptuel des deux référentiels
ouvre deux exceptions à cette convention. Un développeur qui lit ce
commentaire conclut que la règle est absolue et n'ouvrira jamais le chemin
manquant. Le commentaire doit porter les deux exceptions, même tant que le
chemin n'existe pas.

### Ce qui est conforme, et vérifié

- **Changements d'estimation** (§ 3.3.1 b) · « n'ont qu'un effet sur l'exercice
  en cours et les exercices futurs », l'incidence est enregistrée dans les
  comptes de l'exercice. C'est exactement ce que fait le logiciel · une
  révision de durée d'amortissement ou de dépréciation joue en avant, sans
  retraitement. Aucun écart.
- **Erreur de l'exercice en cours** · corrigée exclusivement par inscription
  en négatif, puis enregistrement exact. Implémenté, et le service refuse
  explicitement de corriger une correction, ce que le texte impose sans le
  dire (« l'enregistrement exact sera ENSUITE opéré »).

---

## Passe 3 · le reste du cadre conceptuel

Lu à la source : SYCEBNL, Partie 1 ch. 2 § 3.3.1 en entier (les cinq postulats,
les cinq conventions, les quatre applications de la prééminence de la réalité
sur l'apparence) ; AUDCIF, Titre VIII ch. 31 « Évènements postérieurs à la
clôture de l'exercice », sections 1 à 3 ; AUDCIF, Titre IX ch. 1 § 2.4
« Dispositions communes à l'ensemble des états financiers » ; SYCEBNL, Partie 4
ch. 2, NOTE 3.

### Écart 3.1 · la date d'arrêté ne figure sur aucune page publiée

**Ce que le texte exige.** L'AUDCIF, Titre IX ch. 1 § 2.4, énumère quatre
mentions que les états financiers « doivent comporter obligatoirement » : le
nom de l'entité, **la date d'arrêté**, la période couverte, et l'unité
monétaire. Il ajoute que « ces informations doivent être indiquées dans chacune
des pages des états financiers publiés ». L'art. 23 exige la même mention dans
toute publication. La date d'arrêté n'est pas la date de clôture : le Titre VIII
ch. 31 § 1.3 la définit comme celle où les organes dirigeants arrêtent les
comptes, « postérieur de plusieurs semaines, voire plusieurs mois, à la date de
clôture », dans la limite de quatre mois. Côté SYCEBNL, la NOTE 3 la demande en
première ligne, avec l'organe ayant autorisé la publication.

**Ce que le logiciel fait.** `EnteteImpression` imprime le nom, l'identification,
« Exercice clos le », la durée en mois, la monnaie, le référentiel et le
système. Trois mentions sur quatre : « Exercice clos le » est la fin de la
période couverte, pas la date d'arrêté. Le modèle `Exercice` n'a aucun champ
pour la porter (le `dateArrete` du schéma est celui d'un arrêté interministériel
d'exonération, un homonyme sans rapport). La seule saisie qui existe est une
cellule de texte libre de la NOTE 3, dans le jeu SYCEBNL seulement : hors
d'atteinte de l'en-tête, et sans équivalent sur le chemin SYSCOHADA.

**Fichiers.** `client/src/components/chrome/EnteteImpression.tsx`,
`prisma/schema.prisma` (modèle `Exercice`), `src/modules/exports/theme-etafi.ts`.

**Lacune du logiciel**, pas du texte · les deux référentiels sont clairs et
concordants.

**Gravité · état incomplet.** Les chiffres sont justes ; il manque à chaque page
publiée une mention que le texte rend obligatoire, et le lecteur ne peut pas
savoir de quand datent les comptes qu'il lit.

**Ce qui a été fait ici.** Rien sur le fond : porter la date d'arrêté suppose un
champ, une saisie, une reprise dans les trois chemins de publication (écran,
PDF, Excel) et une décision sur ce qu'on imprime tant qu'elle est inconnue.
C'est la tâche 100. Ce qui est corrigé, c'est ce qui perpétuait le manque : le
commentaire de `EnteteImpression` citait le § 2.4 en entier juste avant de
n'implémenter que la monnaie, ce qui laissait croire les quatre mentions
servies. Il dit désormais laquelle manque et pourquoi ce n'est pas « Exercice
clos le ».

### Écart 3.2 · la fenêtre des événements postérieurs n'était nommée nulle part

**Ce que le texte exige.** Postulat de la spécialisation des exercices, SYCEBNL
§ 3.3.1.1.4 : l'entité « doit ajuster les montants comptabilisés dans ses états
financiers » pour les événements survenus entre la clôture et l'arrêté qui
« contribuent à confirmer des situations qui existaient à la clôture » ; ceux
qui indiquent des situations apparues après ne donnent pas lieu à ajustement.
L'AUDCIF Titre VIII ch. 31 dit la même chose en la détaillant : faillite d'un
client confirmant une perte sur créance, vente de stocks révélant leur valeur
nette de réalisation, litige tranché, fraude ou erreur découverte, du côté des
ajustements ; incendie, restructuration, cession de filiale du côté des
mentions ; et, dans tous les cas, valeurs liquidatives si la continuité est
remise en cause.

**Ce que le logiciel faisait.** Le planning de clôture, trente et quelques
jalons, menait de la révision des comptes (étape 8) à l'arrêté des états
financiers sans jamais nommer la fenêtre qui les sépare. Le dossier de révision
non plus. Côté SYCEBNL, la NOTE 3 recueille le récit une fois le tri fait ;
rien n'invitait à le faire. Côté SYSCOHADA, le rapport de gestion l'exige
(art. 16-3, servi par `rapport-activite.service.ts`), mais c'est le récit, pas
la comptabilisation.

**Fichier.** `src/modules/exercice/planning-cloture.ts`.

**Lacune du logiciel.**

**Gravité · état faux possible.** Une créance dont le débiteur fait faillite en
février reste à sa valeur nominale au bilan du 31 décembre si personne n'y
pense. Le logiciel n'affirmait rien de faux ; il n'invitait pas à regarder.

**Ce qui a été fait ici.** Le jalon est ajouté, un par référentiel, avec les
deux branches du tri et le cas de la continuité, échéance à quatre mois comme
l'arrêté qu'il précède. C'est une transcription, pas une invention. Le test qui
aurait attrapé l'absence part de la règle et exige les deux branches, pour les
deux référentiels · une table de références ne se teste pas seulement sur sa
cohérence interne.

### Lacune du texte officiel, pas du logiciel

- **Aucune note « événements postérieurs » au modèle SYSCOHADA.** Les 36 notes
  du Titre IX ch. 6 n'en comportent pas ; le jeu SYCEBNL, lui, a sa NOTE 3.
  L'information passe par la NOTE 2 « Informations obligatoires » et par le
  rapport de gestion (ch. 31 § 3.2), qui n'exige d'ailleurs ni le tri entre les
  deux catégories ni l'exhaustivité, seulement les événements importants. Le
  logiciel ne crée pas la note manquante : il ne lui appartient pas d'ajouter
  au modèle officiel.

### Ce qui est conforme, et vérifié

- **Les quatre applications de la prééminence de la réalité** (§ 3.3.1.1.6).
  Réserve de propriété, location-acquisition, effets escomptés non échus,
  personnel facturé par d'autres entités : les quatre ont leur compte au plan
  semé et leur poste aux états. Le compte 667 « Rémunération transférée de
  personnel extérieur » range bien la quatrième en charges de personnel, et non
  en services extérieurs ; les effets escomptés non échus ont leur rubrique à la
  note 16 et leur dette de trésorerie au 565. Aucun écart.
- **Convention de régularité et sincérité · non-compensation.** Contrôlée,
  sourcée (AUDCIF art. 34, SYCEBNL art. 16, 5°), avec sa spec.
- **Valeur d'entrée** (§ 3.3.1.2.1) · acquisition à titre onéreux, production,
  acquisition à titre gratuit, échange. L'écriture d'acquisition d'une
  immobilisation laisse la contrepartie au choix, ce qui permet le don en
  nature (crédit d'un compte 16 ou 167) aussi bien que l'achat. Le logiciel ne
  guide pas ce choix, mais il ne l'empêche ni ne le fausse.
- **Postulat de l'entité, comptabilité d'engagement.** Servis par construction ·
  cloisonnement par dossier, et comptabilisation à l'engagement partout sauf au
  Système minimal de trésorerie, où le texte le prévoit lui-même.

---

## Passe 4 · les six chapitres d'opérations spécifiques du SYCEBNL

Lu à la source : SYCEBNL, Partie 3, chapitres 1 à 6, section par section, plus
les 22 applications chiffrées du Guide d'application. Confronté à
`src/modules/operations-specifiques/catalogue-operations.ts` et
`catalogue-operations-dons.ts`, dix-neuf opérations mères (B1 à B19).

**Aucun écart d'état faux ni d'état incomplet.** C'est le résultat de la passe,
et il vaut d'être écrit : les six chapitres sont couverts, section par section,
et chaque opération porte sa source au chapitre et à l'application du guide.

Correspondance vérifiée une à une :

| Chapitre | Sections | Opérations |
|---|---|---|
| ch. 1 · fonds propres des associations | 2.1 dotation, 2.5 subventions d'investissement | B14, B15 |
| ch. 1 · 2.2 réserves, 2.3 report à nouveau, 2.4 résultat net | | module `affectation` (tâche 89) |
| ch. 2 · fonds affectés et reportés | 1, 2.2, 2.3 | B1, B16, B17, B18 |
| ch. 3 · projets de développement | tout le chapitre | B19 |
| ch. 4 · dons | 1 à 4 | B2, B3, B4, B5 |
| ch. 5 · cotisations et fondateurs | 1, 2, 3 | B6, B7, B8 |
| ch. 6 · autres opérations | 1 à 5 | B9, B10, B11, B12, B13 |

Les applications 21 et 22 du guide ne sont pas des écritures : ce sont les
tableaux de correspondance emplois-ressources et exécution budgétaire du ch. 7,
servis par les modules d'états, pas par le catalogue.

### Confort · les provisions réglementées ne sont pas au catalogue guidé

**Ce que le texte prévoit.** Partie 3 ch. 1 § 2.6 : dotation par le débit du 851
et le crédit du 15 ; reprise par le débit du 15 et le crédit du 861. La règle
qui compte est la raison : tout passe en classe 8 « pour éviter de perturber le
résultat d'exploitation », et le 15 reste au passif pour ne pas fausser la
valeur nette comptable des immobilisations.

**Ce que le logiciel fait.** Les comptes existent au plan semé (154, 158, 851,
861) et l'avertissement d'imputation du compte 15 sert son texte d'exclusions
officiel, qui renvoie au 19, au 29, au 39 et au 59. L'écriture est donc
passable et gardée ; elle n'est simplement pas proposée comme opération guidée.

**Gravité · confort.** Rien n'est faux, rien ne manque aux états. Ce qui manque
est l'aide : une entité qui doterait une provision réglementée par un 69 plutôt
qu'un 851 fausserait son résultat d'exploitation, et c'est précisément l'erreur
qu'une opération guidée éviterait. À verser au relevé des améliorations, pas des
manques.

### Pas une opération, et servi ailleurs

**Première année d'application** (ch. 6 § 6) · le texte demande un bilan
d'ouverture au premier jour, un inventaire complet reclassé au plan SYCEBNL, et
de ne pas comptabiliser ce que le référentiel n'autorise pas. C'est une
procédure de reprise, pas une écriture-type : elle est servie par l'import de
balance et de plan de comptes. La « déclaration explicite et sans réserve de
conformité » qui fait des états les « premiers états financiers » a sa ligne à
la NOTE 2 B, dans les deux jeux SYCEBNL.

---

## Passe 5 · AUDCIF, organisation comptable (art. 14 à 24)

Lu à la source : AUDCIF, Titre I ch. 2, articles 14 à 24, alinéa par alinéa.

### Écart 5.1 · le manuel des procédures comptables n'a aucune place

**Ce que le texte exige.** Art. 16 al. 1 : « toute entité établit un manuel
décrivant les procédures et l'organisation comptables. Ce manuel, mis à jour
périodiquement, est destiné à garantir le caractère définitif de
l'enregistrement des mouvements. Il est conservé aussi longtemps qu'est exigée
la présentation des états financiers successifs auxquels il se rapporte. »
L'art. 17, 3° y renvoie : les pièces sont classées « dans un ordre défini dans
le manuel ». Ce n'est donc pas un document de confort · c'est lui qui définit
l'ordre opposable du classement.

**Ce que le logiciel fait.** Rien. Le module `documents-obligatoires` tient le
livre d'inventaire et le rapport de gestion ou d'activité ; le registre des
donateurs a le sien. Le manuel, qui est le quatrième document obligatoire de
l'organisation comptable et le seul qui soit permanent plutôt qu'annuel, n'a ni
table, ni écran, ni jalon. Il n'est nommé que dans
`docs/organisation-comptable-cpcc.md`, une note de travail.

**Fichiers.** `src/modules/documents-obligatoires/`, `prisma/schema.prisma`,
`src/modules/exercice/planning-cloture.ts`.

**Lacune du logiciel**, pas du texte.

**Gravité · état incomplet, côté dossier permanent.** Les états financiers sont
justes ; c'est le dossier qui est incomplet, et l'entité n'a nulle part où tenir
un document dont l'art. 17 fait la référence du classement de ses pièces. Un
auditeur le demande le premier jour · voir la tâche 97.

**Ce qui a été fait ici.** Rien encore. Tâche 101 · une table versionnée, sur le
modèle du rapport de gestion (un manuel arrêté ne se réécrit pas, il se
remplace), et un jalon de mise à jour périodique.

### Constat 5.2 · la « clôture informatique » trimestrielle n'existe pas sous ce nom

**Ce que le texte exige.** Art. 22, 3° : « une procédure périodique dite
"clôture informatique" au moins trimestrielle est prévue, mise en œuvre au plus
tard à la fin du trimestre qui suit la fin de chaque période », afin que la
chronologie « écarte toute insertion intercalaire ou addition ultérieure ».

**Ce que le logiciel fait.** L'effet exigé est obtenu, et plus strictement que
le texte ne le demande : la validation du brouillard rend l'écriture
irréversible, et le retard de centralisation est signalé au-delà de sept jours
en SYCEBNL, d'un mois en SYSCOHADA (art. 22, 2°). Une insertion intercalaire est
donc impossible bien avant le trimestre. Ce qui n'existe pas, c'est la procédure
NOMMÉE et DATÉE : rien ne trace « clôture informatique du 1er trimestre,
effectuée le … ».

**Lacune du logiciel**, mais mineure · le fond est servi, la preuve ne l'est pas.

**Gravité · confort, versant preuve.** À un auditeur qui demande le journal des
clôtures informatiques, le logiciel n'a rien à montrer, alors qu'il fait mieux
que ce que la procédure garantit. C'est une trace manquante, pas un contrôle
manquant.

### Ce qui est conforme, et vérifié

- **Art. 17, 2°** · partie double, débit égal au crédit sur chaque écriture ·
  contrôlé au service, pas seulement à l'écran.
- **Art. 19** · les quatre livres obligatoires existent : livre-journal,
  grand-livre, balance générale (avec solde à l'ouverture, cumuls et solde à la
  date), livre d'inventaire.
- **Art. 20** · correction d'erreur de l'exercice en cours par inscription en
  négatif puis enregistrement exact · implémenté. L'alinéa 3 (erreur
  significative antérieure par ajustement du report à nouveau) reste la tâche 99,
  déjà relevée à la passe 2.
- **Art. 22, 6°** · reconstitution du chemin de révision · journal d'audit avec
  chaînage et route de vérification.
- **Art. 22, 7°** · états périodiques numérotés et datés · cartouche de pied de
  page « Page P / N · édité le … », avec sa spec.
- **Art. 23** · arrêté dans les quatre mois · jalon 13, les deux référentiels.
  La mention de la date d'arrêté dans toute transmission reste l'écart 3.1.
- **Art. 24** · conservation dix ans · portée par le jalon de clôture annuelle,
  pour les deux référentiels.

---

## Passe 6 · AUDCIF, articles 1 à 13 et 25 à 34

Lu à la source : AUDCIF, Titre I ch. 1 (art. 1 à 13, en notant que le 12 est
abrogé) et ch. 3 (art. 25 à 34, le 27 abrogé) ; SYCEBNL, art. 3 (liste
d'exclusion) et Partie 1 ch. 1, entrée EXERCICE du glossaire.

C'est la passe qui a rapporté les deux défauts les plus graves du relevé, tous
deux à la racine, tous deux muets.

### Écart 6.1 · l'exercice pouvait être n'importe quelle période

**Ce que le texte exige.** Art. 7 : « L'exercice coïncide avec l'année
civile. » Trois cas seulement s'en écartent, tous nommés dans l'article : le
premier exercice débutant au premier semestre, dont la durée « EST
exceptionnellement inférieure à douze mois » ; le premier exercice commencé au
deuxième semestre, dont la durée « PEUT être supérieure à douze mois » ; et la
liquidation, dont « la durée des opérations est comptée pour un seul
exercice ». L'art. 7 n'est pas dans la liste d'exclusion de l'art. 3 du
SYCEBNL, et le glossaire de celui-ci réécrit la règle mot pour mot : elle vaut
des deux côtés, sans transposition.

**Ce que le logiciel faisait.** `ExerciceService.creer` n'exigeait qu'une chose,
que la fin suive le début. Un exercice du 15 mars au 20 août était accepté, à la
création du dossier comme plus tard.

**Fichiers.** `src/modules/exercice/exercice.service.ts`,
`src/modules/exercice/dto/creer-exercice.dto.ts`.

**Lacune du logiciel.**

**Gravité · état faux, et silencieux.** Rien en aval ne pouvait rattraper la
racine, parce que tout en aval était cohérent avec elle : l'en-tête obligatoire
publiait « Exercice clos le 20-08 », le planning de clôture calculait ses
échéances depuis cette date, la liasse entière reposait sur une période que le
texte n'autorise pas. Aucun contrôle n'avait de raison de se déclencher.

**Ce qui a été fait ici.** Le garde-fou est posé, avec les trois cas de
l'article et l'échappatoire de liquidation en drapeau explicite du DTO, jamais
par défaut : un exercice hors année civile est une exception que le cabinet
déclare. Le message d'erreur cite l'article, parce qu'un refus sans son fondement
ressemble à un caprice de logiciel.

### Écart 6.2 · la clôture engendrait un exercice suivant faux une année sur deux

**Ce que le texte exige.** Le même art. 7.

**Ce que le logiciel faisait.** La clôture créait l'exercice suivant en
RECOPIANT la durée du précédent en millisecondes : début au lendemain de la
clôture, fin à début plus la durée écoulée. Sur deux années de même longueur le
compte tombait juste. Dès qu'une année bissextile entrait dans le calcul, il
tombait faux :

| Exercice clos | Exercice engendré | Attendu |
|---|---|---|
| 2023 | 01/01/2024 au **30/12/2024** | 31/12/2024 |
| 2024 | 01/01/2025 au **01/01/2026** | 31/12/2025 |
| 2027 | 01/01/2028 au **30/12/2028** | 31/12/2028 |

**Fichier.** `src/modules/exercice/exercice.service.ts`, dans la transaction de
clôture annuelle.

**Lacune du logiciel.**

**Gravité · état faux, et le plus silencieux de tous.** Un exercice qui finit le
30 décembre laisse une écriture du 31 sans exercice où aller. Un exercice qui
finit le 1er janvier mord sur le suivant. Et rien ne le signalait : l'en-tête
imprime la durée en mois entamés, qui restait douze dans les deux cas. Le défaut
ne pouvait apparaître que sur un dossier réel franchissant une année
bissextile, c'est-à-dire une fois sur quatre, plusieurs mois après.

**Ce qui a été fait ici.** Le calcul est sorti de la transaction de clôture,
qui fait plusieurs centaines de lignes, pour devenir une fonction pure
éprouvable seule · `exerciceSuivantApres`. L'exercice suivant part du lendemain
de la clôture et va au 31 décembre de son année, comme l'article le dit. Le
test parcourt six années consécutives, dont deux bissextiles ; il vérifie aussi
qu'un dossier repris portant un exercice illégal antérieur au garde-fou est
régularisé par la clôture plutôt que perpétué.

### Ce qui est conforme, et vérifié

- **Art. 5 al. 3** · les entités à but non lucratif ne sont pas assujetties au
  SYSCOHADA · c'est le cloisonnement des deux chemins, contrôlé aux deux bouts.
- **Art. 13** · seuils du Système minimal de trésorerie · 60 millions pour le
  négoce, 40 pour l'artisanat, 30 pour les services, servis par
  `EtatsFinanciersSmtSyscohadaService.eligibilite` ; côté SYCEBNL, les cinq
  seuils de 30 millions de l'art. 6 et la règle cumulée sur deux exercices.
- **Art. 8, 26, 28 à 33** · jeu complet indissociable, tracés du Système normal
  et du SMT, grandes masses du bilan, cascade des soldes du compte de résultat,
  structure du tableau des flux, notes annexes à référence croisée · tous servis
  par les modules d'états, avec leurs specs de correspondance.
- **Art. 34** · non-compensation, permanence de présentation, colonne de
  l'exercice précédent · contrôlés. Le dernier alinéa (poste non comparable,
  adaptation signalée aux notes) reste l'écart déjà relevé à la passe 1 sous
  l'art. 16 al. 2 du SYCEBNL, qui l'énonce dans les mêmes termes.

---

## Passe 7 · AUDCIF, articles 35 à 113

Lu à la source : AUDCIF, Titre I ch. 4 (art. 35 à 65, le 60 abrogé) et ch. 5
(art. 66 à 73-1) ; Titre II (art. 74 à 110) et Titres III-IV (art. 111 à 113).

Rappel de portée · l'art. 3 du SYCEBNL écarte pour les EBNL les articles 49,
69, 70, 71, 73 et 73 à 113. Tout le reste de cette plage, y compris les règles
d'évaluation des art. 35 à 48 et 50 à 65, leur est applicable.

### Écart 7.1 · rien ne signalait une dotation aux amortissements oubliée

**Ce que le texte exige.** Art. 45, dernier alinéa : « la constatation de la
dotation aux amortissements d'une immobilisation amortissable est OBLIGATOIRE
même en cas d'absence ou d'insuffisance de bénéfice ». La fiche du COMPTE 28 du
SYCEBNL dit la même chose, et l'art. 45 n'est pas dans la liste d'exclusion de
son art. 3.

**Ce que le logiciel faisait.** Le module d'immobilisations sait calculer et
passer les dotations. Rien ne vérifiait qu'elles l'avaient été. La clôture
annuelle refuse une écriture restée en brouillard, parce qu'elle serait perdue
du résultat ; elle ne disait rien d'une dotation jamais passée, qui l'est tout
autant.

**Fichier.** `src/modules/controles/controles.service.ts`.

**Lacune du logiciel.**

**Gravité · état faux, et muet.** Le résultat est surévalué du montant non
doté, la valeur nette comptable reste à la valeur brute, et aucun total ne
bouge : les écritures s'équilibrent, la balance boucle, le bilan boucle. Puis
la clôture rend l'oubli irréparable, l'exercice n'acceptant plus aucune
écriture.

**Ce qui a été fait ici.** Un treizième contrôle, `IMMO_SANS_DOTATION`, en
AVERTISSEMENT. Il liste les biens en service à la clôture, amortissables au
sens de l'art. 45 (valeur d'entrée moins valeur résiduelle prévisionnelle,
diminuée du cumul déjà amorti), et sans dotation sur l'exercice. Il se tait sur
les trois cas où l'absence est normale : bien pas encore en service, bien
intégralement amorti, dotation déjà passée.

**Pourquoi un avertissement et non un refus de clôturer.** Un cabinet peut
avoir passé ses dotations à la main, par une écriture directe 68 / 28, sans
passer par le module : la comptabilité est alors juste et la table des dotations
vide. Bloquer reviendrait à refuser une clôture régulière. Le logiciel signale
ce qu'il voit, dit ce que la clôture rendra irréparable, et laisse le comptable
trancher.

### Ce qui est conforme, et vérifié

- **Art. 36 et 37** · coût d'entrée · acquisition, apport, titre gratuit,
  échange, production. La contrepartie de l'écriture d'acquisition reste
  libre, ce qui couvre les cinq cas.
- **Art. 43 et 47** · valeur d'inventaire comparée à la valeur d'entrée,
  amoindrissement constaté en amortissement ou en dépréciation selon qu'il est
  définitif, les deux inscrits distinctement en diminution du brut.
- **Art. 45** · montant amortissable = valeur d'entrée moins valeur résiduelle
  prévisionnelle ; date de début à la mise en état de fonctionner, pas à
  l'acquisition ; prorata temporis. Tous portés par le module, avec le
  garde-fou qui interdit un amortissement antérieur supérieur à la base.
- **Art. 46, 48 et 49** · dépréciations et provisions, obligatoires même sans
  bénéfice · nommées au jalon 6 « Écritures d'inventaire », dans les deux
  référentiels.
- **Art. 50 à 58-4** · opérations en devises · le module `devises` couvre la
  conversion à la date d'accord, les écarts de conversion actif et passif (478
  et 479, avec la subdivision SYSCOHADA et la racine unique du SYCEBNL), la
  provision pour pertes de change (194), la position globale de change de
  l'art. 58 et l'étalement de l'art. 56, avec leurs specs.
- **Art. 59 et 61** · indépendance des exercices, et charges ou produits d'un
  exercice antérieur qui n'avaient pas pu être pris en compte, enregistrés dans
  l'exercice en cours avec mention aux notes. À ne pas confondre avec l'art. 20
  al. 3, qui vise l'ERREUR significative et l'impute au report à nouveau · la
  distinction est celle que la tâche 99 devra tenir.
- **Art. 66 et 67** · livre-journal et livre d'inventaire cotés, paraphés,
  numérotés ; tenus par informatique, identifiés, numérotés et datés dès leur
  établissement, avec garantie de chronologie, d'irréversibilité et
  d'intégrité · repris mot pour mot au jalon du livre d'inventaire.
- **Art. 70, 71 et 72** · opinion du commissaire aux comptes, rapport de
  gestion, transmission quarante-cinq jours au moins avant l'assemblée,
  approbation dans les six mois · tous portés par des jalons LÉGAUX.

### Hors du logiciel, et assumé

- **Art. 74 à 110 · consolidation et combinaison.** Exclus pour les EBNL par
  l'art. 3 du SYCEBNL. Côté SYSCOHADA, le module `groupe` agrège les balances
  des cellules et monte un dossier de combinaison, mais il ne fait PAS une
  consolidation au sens du Titre II : ni élimination des opérations
  réciproques, ni écarts d'acquisition, ni intérêts minoritaires, ni méthodes
  d'intégration proportionnelle et de mise en équivalence. Ce n'est pas un
  manque caché · c'est un périmètre, et il vaut d'être écrit ici pour que
  personne ne prenne la combinaison du module pour une consolidation.
- **Art. 8 al. 4, 73 et 73-1 · états IFRS des entités cotées.** Hors périmètre
  déclaré. Aucun dossier du cabinet n'est coté ni ne fait appel public à
  l'épargne, et un référentiel IFRS ne se transpose pas.
- **Art. 111 à 113 · dispositions pénales et finales.** Elles ne créent aucune
  obligation de tenue : elles sanctionnent le manquement à celles déjà relevées.

### Confort · les modes d'amortissement

L'art. 45 énumère le linéaire, le dégressif à taux décroissant, les unités de
production ou d'œuvre, « et tout autre mode mieux adapté », et interdit
expressément deux modes : celui fondé sur les revenus générés par l'actif, pour
les corporelles, et l'amortissement financier. Le logiciel n'offre que le
linéaire · le dégressif est écarté par un commentaire explicite du schéma, les
unités d'œuvre ne sont pas nommées. Aucun des deux modes interdits n'est
proposé, donc rien de faux ; ce qui manque est un choix, pour un dossier
industriel, minier ou de transport qui amortirait au kilomètre ou à l'heure de
fonctionnement. À verser au relevé des améliorations.

---

## Ce qui n'a pas encore été ouvert

À traiter dans les passes suivantes, dans cet ordre :

1. **AUDCIF Titre VIII** · les 41 chapitres d'opérations spécifiques, dont le
   ch. 31 déjà ouvert à la passe 3 et le ch. 16 à la passe 2.
