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

## Passe 8 · AUDCIF Titre VIII, l'approche par composants (ch. 4 à 6)

Lu à la source : AUDCIF, Titre VIII ch. 4 « Approche par composants »
(sections 1 à 3), et son pendant SYCEBNL, Partie 2 ch. 3, introduction de la
classe 2, qui reprend la règle mot pour mot. Croisé avec les ch. 5 (révisions
majeures) et 6 (démantèlement), et avec l'art. 38-1 déjà lu à la passe 7.

**Ce n'est pas un manque caché · c'est un périmètre déclaré, mais déclaré trop
étroitement.** Le schéma porte depuis l'origine un commentaire « hors scope
MVP » qui nomme la gestion des composants et donne la bonne liste de catégories
éligibles. J'ai vérifié cette liste contre les deux textes avant d'écrire quoi
que ce soit : elle est exacte, et l'attribution au texte SYCEBNL l'est aussi.

### Ce que le commentaire disait trop peu

**Premier point · « autorisé » n'est pas le bon mot.** Le texte écrit : « une
entité VENTILE le montant d'une immobilisation corporelle en ses parties
significatives DÈS LORS QUE » les quatre conditions sont réunies (éléments
dissociables, utilisations différentes, durées d'utilité différentes, coût
évaluable de façon fiable et significatif), et « chaque élément DOIT être
comptabilisé séparément dès son acquisition ou son remplacement ». La liste
limite le CHAMP ; à l'intérieur du champ, la décomposition est une obligation,
pas une option. Et le champ n'est pas une niche de transporteurs : un bâtiment
y entre, et le plan SYCEBNL en porte plusieurs, dont le 231 et le 2381
« édifices religieux » · c'est-à-dire le patrimoine ordinaire d'une bonne part
des ASBL du cabinet.

**Second point, plus concret · trois mécanismes obligatoires reposent sur le
sous-compte composant, et le commentaire n'en nommait aucun.**

1. **Coûts de démantèlement, d'enlèvement et de remise en état du site.** Ils
   entrent dans la valeur d'entrée et sont « comptabilisés dans un sous-compte
   composant de l'immobilisation principale », la provision 1984 étant dotée
   par le 6914 (Titre VIII ch. 6 ; SYCEBNL, valeur d'entrée des
   immobilisations). Le tableau des flux SYSCOHADA les connaît déjà, jusqu'à
   la désactualisation de la provision · le module qui devrait les produire,
   non.
2. **Révisions majeures.** Sous-compte composant amorti sur la durée séparant
   deux révisions, la valeur comptable résiduelle de la précédente étant
   décomptabilisée (Titre VIII ch. 5).
3. **Pièces de rechange principales et de sécurité.** Immobilisations
   corporelles dès lors qu'elles servent plus d'un exercice, avec deux départs
   d'amortissement distincts : dès l'acquisition de l'immobilisation
   principale pour les pièces de sécurité, à la date d'intégration pour celles
   destinées à remplacer un composant.

**Fichiers.** `prisma/schema.prisma` (modèle `Immobilisation`, sans relation
sur elle-même), `src/modules/immobilisations/`.

**Lacune du logiciel**, assumée quant au principe, sous-évaluée quant à sa
portée.

**Gravité · état incomplet, et état faux au remplacement.** Tant qu'aucun
composant n'est remplacé, un bâtiment amorti d'un seul tenant produit une
dotation approximative, pas fausse au sens strict. Le jour où le composant est
remplacé, le texte impose de sortir de l'actif la valeur nette comptable du
composant remplacé : sans composants, cette valeur reste au bilan et le
remplacement s'ajoute par-dessus · l'actif est alors surévalué du reliquat de
ce qui n'existe plus.

**Ce qui a été fait ici.** Rien sur le fond · une relation d'une immobilisation
sur elle-même, la ventilation du coût d'entrée, les plans d'amortissement par
composant et la décomptabilisation au remplacement forment un module, et le
seuil de significativité qui déclenche la décomposition appartient au cabinet.
C'est la tâche 102. Ce qui est corrigé, c'est ce qui perpétuait la
sous-évaluation : le commentaire du schéma dit maintenant que la règle est une
obligation dans son champ, que ce champ inclut un simple bâtiment, et nomme les
trois mécanismes qui n'ont aujourd'hui aucune place.

### Portée de cette passe

Trois chapitres sur quarante et un. Les chapitres 1 à 3 (frais de recherche et
développement, brevets et logiciels, prospection minière), 7 (coûts d'emprunts)
et 8 à 11 (contrat de location, réserve de propriété, immeubles de placement,
constructions sur sol d'autrui et rentes viagères) n'ont pas été ouverts et ne
sont pas couverts par ce qui précède.

---

## Passe 9 · Titre VIII, les trois autres applications de la prééminence (ch. 8, 9, 27)

Lu à la source : AUDCIF, Titre VIII ch. 8 « Contrat de location » (sections 1
et 2), ch. 9 « Réserve de propriété », ch. 27 « Personnel intérimaire » ; et,
côté SYCEBNL, les fiches des COMPTES 63 et 66 de la Partie 2 ch. 3.

Cette passe revient sur une affirmation de la passe 3. J'y avais conclu que les
quatre applications de la prééminence de la réalité sur l'apparence étaient
conformes. Cette conclusion reposait sur l'existence des comptes et des postes,
ce qui est vrai mais ne dit rien du TRAITEMENT. Vérification faite, l'une des
quatre manquait bel et bien.

### Écart 9.1 · le virement 637 vers 667 n'était ni fait, ni signalé

**Ce que les deux textes exigent, chacun dans le sien.** Ce n'est pas une
transposition d'un référentiel vers l'autre : chaque texte l'écrit.

- SYCEBNL, Partie 2 ch. 3, fiche du COMPTE 63 : « en cours d'exercice, l'entité
  utilisatrice enregistre les factures reçues […] au débit du compte 637
  Rémunérations de personnel extérieur à l'entité ; à la clôture de l'exercice,
  le compte 637 est viré, POUR SOLDE, au débit du compte 667 Rémunération
  transférée de personnel extérieur. » La fiche du COMPTE 66 le redit : « ce
  virement solde le compte 637 ».
- AUDCIF, Titre VIII ch. 27 § 2 : « à la clôture de l'exercice, les comptes
  6371 et 6372 sont virés, pour solde, au débit du compte 667 ».

La raison est la prééminence elle-même : la facture d'un intérimaire est
juridiquement un service extérieur, économiquement du travail. « L'apparence
juridique des prestations de services masque la réalité économique d'un apport
de travail. »

**Ce que le logiciel faisait.** Les comptes existent des deux côtés et portent
les bons intitulés (6371, 6372, 6671, 6672 au plan SYSCOHADA ; 637 et 667 au
plan SYCEBNL). La clôture annuelle solde les classes 6 et 7 sur le compte 13
sans passer par ce virement, et aucun contrôle ne le réclamait.

**Fichiers.** `src/modules/controles/controles.service.ts`,
`src/modules/exercice/exercice.service.ts`.

**Lacune du logiciel.**

**Gravité · état faux, sur la présentation, et parfaitement muet.** Le résultat
net ne bouge pas d'un franc : 637 et 667 sont tous deux en classe 6. La balance
boucle, le bilan boucle, aucun contrôle d'équilibre ne peut se déclencher. Ce
qui est faux est la ventilation du compte de résultat · la charge s'imprime sur
« Services extérieurs » (TG au SYCEBNL, RH au SYSCOHADA) au lieu de « Charges
de personnel ». Au SYSCOHADA s'y ajoute la cascade des soldes intermédiaires
que l'art. 31 de l'AUDCIF impose de faire apparaître : la valeur ajoutée se
calcule après les services extérieurs et avant les charges de personnel, elle
est donc minorée du montant non viré.

**Ce qui a été fait ici.** Un quatorzième contrôle,
`PERSONNEL_EXTERIEUR_NON_VIRE`, en AVERTISSEMENT : il additionne les soldes des
sous-comptes 637 sur l'exercice, cite le texte DU RÉFÉRENTIEL DU DOSSIER, et
rappelle la mention aux notes annexes que le ch. 27 demande « afin de ne pas
fausser l'assiette des taxes, impôts ou cotisations calculés à partir de la
masse salariale ». Avertissement et non virement automatique, ni refus de
clôturer : le montant, sa date et son journal appartiennent au comptable, et un
virement passé d'office serait exactement le logiciel qui décide. Le test vérifie
aussi qu'un dossier SYCEBNL ne se voit jamais citer le texte SYSCOHADA, ni
l'inverse.

### Ce qui est conforme, et vérifié

- **Ch. 9 · réserve de propriété.** Le principe directeur est que « malgré
  l'existence de la clause, l'achat-vente est enregistré comme une vente
  ordinaire et en produit tous les effets ». Le suivi en comptes ad hoc (un
  4116 « Clients, réserve de propriété ») est présenté comme utile, jamais
  obligatoire, et le plan de comptes du logiciel permet de les ouvrir. Rien ne
  manque.

### Confort · la qualification d'un contrat de location n'est pas outillée

**Ce que le texte prévoit.** Le ch. 8 § 1.5 distingue la location acquisition
(crédit-bail, location-vente, tout contrat avec option d'achat dont le preneur
est raisonnablement certain de lever l'option) de la location simple, définie
par trois cas précis : durée inférieure ou égale à douze mois ; levée d'option
hypothétique, le texte citant l'exemple d'un prix de levée à 30 % du prix
d'achat ; montant non significatif, la faible valeur s'appréciant sur la valeur
À NEUF, contrat par contrat et indépendamment de la taille de l'entité · le
texte tranche lui-même deux cas, l'ordinateur de bureau en faible valeur,
l'automobile jamais. Une location acquisition se comptabilise ensuite comme une
acquisition financée par emprunt, la dette étant évaluée à la valeur actualisée
des paiements locatifs au taux implicite du contrat.

**Ce que le logiciel fait.** Les comptes 172 à 178 et leurs intérêts courus
sont semés, la note 3B « Biens pris en location acquisition » existe, et le
tableau des flux neutralise correctement le crédit du 17. Ce qui n'existe pas
est l'aide : rien ne guide la qualification, rien ne calcule l'actualisation ni
le tableau d'amortissement de la dette. Tout se passe en écritures manuelles.

**Gravité · confort.** Aucun état n'est faux du fait du logiciel, et la
qualification relève du jugement du comptable. Mais les critères sont
inhabituellement précis et directement citables · c'est exactement la matière
d'un avertissement d'imputation, sur le modèle des fiches par compte déjà en
place.

### Portée de cette passe

Trois chapitres de plus. Restent notamment les ch. 1 à 3, 7, 10 à 15, 17 à 21,
23 à 26, 28 à 30 et 32 à 41.

---

## Passe 10 · Titre VIII, stocks (ch. 14, 29) et abonnement (ch. 24)

Lu à la source : AUDCIF, Titre VIII ch. 24 « Abonnement des charges et des
produits » (sections 1 et 2) ; art. 44 (évaluation des stocks) déjà lu à la
passe 7 ; et, côté logiciel, `docs/plan-de-construction.md` § 16 et le module
`regularisation`.

### Périmètre déclaré · les stocks

Le logiciel n'a **aucun module de stocks** : ni modèle Prisma, ni service, ni
écran. Ce n'est pas un oubli · le plan de construction range **Stocks** au
point 16, dans la liste des briques « au choix selon opportunité business »,
aux côtés de la trésorerie avancée et de la paie. Vérifié avant d'écrire.

Ce qui existe malgré tout, et qui rend le périmètre tenable : la classe 3 est
semée dans les deux plans (86 comptes au SYSCOHADA, 13 au SYCEBNL), le compte
de résultat sait recevoir la variation de stocks (6031 des deux côtés, 73 au
SYSCOHADA), et les notes de stocks existent dans les deux jeux. Une entité qui
tient des stocks peut donc passer ses écritures d'inventaire à la main et
obtenir des états justes.

**Ce qu'il faut avoir en tête, et qui n'est écrit nulle part près du code.**
Sans module, rien ne rappelle l'inventaire de fin d'exercice, et une variation
de stocks oubliée ne se signale jamais : la balance boucle, puisque le compte
de charge porte les ACHATS de la période au lieu des CONSOMMATIONS. Le résultat
est faux du montant de la variation, et aucun total ne le trahit. Le jalon 6
« Écritures d'inventaire » du planning de clôture nomme bien les écarts
d'inventaire, ce qui est le rappel minimal ; il n'y a pas de contrôle. À
mesurer si un dossier à stocks entre au portefeuille.

**Gravité · périmètre, pas manque.** Écrit ici pour que la prochaine passe ne
le rouvre pas comme une découverte.

### Confort · « abonnement » désigne deux techniques, le logiciel n'en fait qu'une

**Ce que le texte prévoit.** Le ch. 24 appelle « abonnement des charges et des
produits » une technique de RÉPARTITION : étaler une charge ou un produit
annuel connu d'avance « par fractions égales entre les périodes comptables de
l'exercice », afin que les situations intermédiaires soient justes. Elle passe
par le compte 474, subdivisé en **4746** pour les charges et **4747** pour les
produits. À la fin de chaque période, le 4746 est crédité de la fraction
abonnée par le débit du compte de charge ; à réception de la facture réelle, il
est débité par le crédit du tiers. Le 4747 fonctionne symétriquement. Les
dotations aux amortissements peuvent s'y abonner de la même manière.

**Ce que le logiciel fait.** Le module `regularisation` porte des
« abonnements » au sens des progiciels : des MODÈLES d'écriture récurrente,
engendrés à chaque échéance d'un contrat. C'est un confort de saisie, utile,
mais ce n'est pas la technique du ch. 24. Les comptes 4746 et 4747 sont semés
dans les deux plans et **aucun code ne les mouvemente**.

**Lacune du logiciel · mais sur une option, pas sur une obligation.** Le texte
écrit que le Système comptable OHADA « préconise LA POSSIBILITÉ » d'y recourir,
et la réserve aux entités qui établissent des comptes de résultat périodiques.

**Gravité · confort.** Aucun état n'est faux. Le risque est de vocabulaire :
lire « Abonnement » dans le menu et croire la technique du ch. 24 servie.

**Ce qui a été fait ici.** Le module dit désormais en tête laquelle des deux
techniques il implémente, décrit l'autre avec ses comptes, et précise qu'elle
est offerte et non imposée.

### Portée de cette passe

Restent notamment les ch. 1 à 3, 7, 10 à 13, 15, 17 à 21, 23, 25, 26, 28, 30 et
32 à 41.

---

## Passe 11 · Titre VIII, subventions (ch. 17) et provisions (ch. 18)

Lu à la source : AUDCIF, Titre VIII ch. 17 « Subventions et aides publiques »
(sections 1 à 3) et ch. 18 « Provisions, passifs éventuels et actifs
éventuels » (sections 1 et 2).

**Aucun écart.** Les deux chapitres sont servis, et par un mécanisme déjà en
place plutôt que par du code écrit pour eux : les avertissements d'imputation
engendrés depuis les rubriques « Exclusions » du texte officiel.

### Ch. 17 · la distinction des trois destinations est déjà opposable

Le chapitre range les subventions reçues selon leur DESTINATION : compte 14
(investissement), 71 (exploitation), 88 (équilibre). Il met en garde contre
deux voisins qui n'en sont pas : le 163 « Avances reçues de l'État », qui est
remboursable, et le 102 « Capital par dotation », qui a pour une entité
publique « le même caractère que le capital social dans les entités privées »
et arrive « parfois d'ailleurs sous une fausse dénomination de subventions ».

Vérifié dans le fichier engendré : la fiche du compte 14 porte ses exclusions
officielles, « le compte 14 ne sert pas à enregistrer : les subventions
d'exploitation reçues → 71 ; les subventions d'équilibre reçues → 88 ». Le
comptable qui impute au 14 une subvention d'exploitation voit donc le texte
lui-même, cité, pas une paraphrase.

Ce que le logiciel ne fait pas, et ne doit pas faire : trancher la nature du
versement. Le texte le dit lui-même · « il est indispensable pour les entités
de se référer aux décisions notifiées par l'autorité publique pour déterminer
la nature, l'objet et les conditions d'emploi des biens et fonds attribués ».
C'est une lecture de convention, pas un calcul.

Côté SYCEBNL, les subventions ont leur propre traitement, déjà vérifié à la
passe 4 (opérations B15, B9, B12 du catalogue).

### Ch. 18 · les trois conditions relèvent du jugement, l'imputation est gardée

Les trois conditions cumulatives de comptabilisation d'une provision
(obligation actuelle née d'un événement passé, sortie de ressources probable,
montant estimable de façon fiable) sont un jugement, et le texte pousse même
jusqu'au seuil de 50 % pour l'existence de l'obligation. Rien de tout cela ne
s'automatise, et un logiciel qui prétendrait le faire déciderait à la place du
comptable.

Ce qui est automatisable est l'imputation, et elle est gardée :

- la distinction entre provision à PLUS d'un an (compte de dotation aux
  provisions) et risque à MOINS d'un an (« charges pour provisions pour risques
  à court terme », traitées comme charges décaissables) passe par les
  exclusions officielles des comptes concernés, déjà servies ;
- l'interdiction de comptabiliser un ACTIF ÉVENTUEL, qui « fera l'objet d'une
  note en annexe lorsque l'entrée d'avantages économiques est probable et le
  montant significatif », est servie par la note « Actifs et passifs
  éventuels », présente dans les deux jeux et en saisie.

### Vérification de non-revendication

Une passe a été faite sur les chapitres de niche pour s'assurer qu'aucun n'est
faussement revendiqué par le logiciel : fusions (ch. 38), liquidation (ch. 40),
concessions de service public (ch. 25), franchise (ch. 35), affacturage et
titrisation (ch. 15), immeubles de placement (ch. 10), groupement d'intérêt
économique (ch. 26). Aucun module ne les implémente et aucun écran ne les
annonce · les occurrences trouvées dans le code sont des homonymes (une
fonction `fusionner` de postes du SMT, la « liquidation de l'impôt » du module
fiscal, le drapeau d'exercice de liquidation posé à la passe 6). C'est le
contrôle qui comptait : une fonction absente est un périmètre, une fonction
annoncée et absente serait un mensonge.

### Portée de cette passe

Restent, tous non ouverts : les ch. 1 à 3, 7, 10 à 13, 15, 19 à 21, 23, 25, 26,
28, 30 et 32 à 41.

---

## Passe 12 · Titre VIII, ch. 1, 2, 23 et 30 (choisis avec Manasse)

Quatre chapitres ouverts sur demande, retenus parce qu'ils ont une chance
réelle de concerner un dossier du cabinet. Lu à la source : ch. 1 « Frais de
recherche et de développement », ch. 2 « Brevets, licences, marques, logiciels,
sites internet », ch. 23 « Contrats pluri-exercices » (sections 1 à 3), ch. 30
« Engagements financiers et passifs éventuels ».

Un seul écart, au ch. 23. Les trois autres sont servis.

### Écart 12.1 · les contrats pluri-exercices n'ont ni module ni mention

**Ce que le texte exige.** La règle n'est pas une préférence, et c'est ce qui la
rend importante : « l'entité doit EN PRINCIPE utiliser la méthode à
l'avancement dès lors qu'elle est en mesure d'évaluer le résultat à terminaison
de manière fiable. Lorsqu'elle n'est pas en mesure de l'évaluer de manière
fiable, elle DOIT utiliser la méthode à l'achèvement. Par conséquent,
l'application de la méthode à l'achèvement NE RÉSULTE PAS D'UN CHOIX OPÉRÉ PAR
L'ENTITÉ MAIS D'UNE OBLIGATION. » L'avancement est « la principale méthode de
comptabilisation des contrats pluri-exercices retenue par le Système comptable
OHADA ».

S'y ajoute une règle que la conjugaison des art. 49 et 59 impose : « toute
perte probable sur un contrat pluri-exercices doit être provisionnée POUR SA
TOTALITÉ. Le montant de cette provision n'est pas lié à celui des travaux ou
services effectivement réalisés à la date de l'arrêté des comptes, mais à la
connaissance de la perte probable qui peut résulter de l'exécution totale du
contrat. »

**Ce que le logiciel fait.** Rien, et il ne le dit nulle part. Le mot
« pluri-exercices » n'apparaît ni dans `src/`, ni dans le plan de construction.
Contrairement aux stocks, qui sont un périmètre écrit au point 16 du plan, cette
absence n'est déclarée nulle part.

**Lacune du logiciel**, non déclarée.

**Gravité · état faux possible, sur un dossier concerné.** Sans module et sans
rappel, le comptable enregistre les factures à mesure qu'il les émet · le
produit est alors rattaché à la facturation et non à l'avancement, ce que
l'art. 59 interdit. Et rien ne rappelle la provision intégrale d'une perte
probable, dont le texte prend soin de préciser qu'elle ne se proratise pas.
Aucun dossier du portefeuille n'est aujourd'hui concerné à ma connaissance ·
c'est ce qui distingue cet écart d'un défaut actif.

**Ce qui a été fait ici.** Le relevé, et rien d'autre. Construire la
reconnaissance à l'avancement suppose de tenir des contrats, leur budget à
terminaison et leur pourcentage d'avancement · c'est un module, et il ne se
décide qu'au vu du portefeuille. À trier avec les stocks plutôt qu'à ouvrir
d'office.

### Ch. 1 et 2 · servis, et par le mécanisme des exclusions

La règle centrale du ch. 1 est que les dépenses de RECHERCHE « ne peuvent être
immobilisées », doivent être « systématiquement comptabilisées en charges » et
« ne peuvent être activées à une date ultérieure » ; que la phase de
DÉVELOPPEMENT s'immobilise au compte 211 si six critères sont réunis
simultanément ; et que si la distinction entre les deux phases est impossible,
tout part en charges.

Vérifié dans le fichier engendré : la fiche du compte 21 porte ses exclusions
officielles, « le compte 21 ne sert pas à enregistrer : les frais
d'établissement, les frais de recherche, les frais de pré-exploitation →
charges de la classe 6 ». Le comptable qui tenterait d'activer des frais de
recherche voit donc le texte lui-même. Les comptes de la chaîne sont tous semés :
211, 2121 brevets, 2122 licences, 213 logiciels et sites internet, 721
production immobilisée incorporelle, 2811 et 6812 pour l'amortissement.

Les six critères, la frontière entre les deux phases et l'évaluation de la part
variable d'une redevance de licence sont des jugements. Le logiciel n'a pas à
les rendre.

### Ch. 30 · servi, et le cloisonnement l'était déjà

Le point décisif est dans le texte : « le Système comptable OHADA N'IMPOSE PAS
la tenue d'une comptabilité des engagements. » Il n'y a donc aucune obligation
à laquelle le logiciel manquerait. Ce qui est obligatoire est la MENTION, et
elle est servie : les rubriques « Engagements donnés » et « Engagements reçus »
existent en saisie dans les deux jeux.

Les comptes d'engagement de la classe 9 sont semés côté SYSCOHADA (901
financement obtenus, 902 garantie obtenus, 906 garantie accordés et leurs
subdivisions). Et le contrôle `CLASSE_9_MOUVEMENTEE` distingue déjà les deux
référentiels, ce qui n'est pas anodin : la classe 9 du SYCEBNL porte les
contributions volontaires en nature, celle du SYSCOHADA les engagements et
l'analytique. Le commentaire du code garde la trace de la version qui annonçait
des « contributions volontaires » à une entreprise venant d'enregistrer une
caution, et la renvoyait à une note absente de sa liasse.

**Anomalie du texte officiel, signalée.** La typologie du ch. 30 annonce quatre
catégories d'engagements et n'en développe que deux : les engagements de
FINANCEMENT sont listés puis jamais traités, le § 1.2 confirmant que le
chapitre ne propose que « les règles de comptabilisation des engagements de
garantie ». Lacune du texte, pas du logiciel.

---

## Passe 13 · Titre VIII ch. 12 · la dépréciation que le module ignore

Lu à la source : AUDCIF, Titre VIII ch. 12 « Dépréciation des immobilisations »
(sections 1 et 2) et art. 46 ; SYCEBNL, Partie 2 ch. 3, fiche du COMPTE 29.

### Écart 13.1 · « hors périmètre » ne voulait pas dire « sans conséquence »

**Ce que les deux textes exigent**, chacun dans le sien, en termes très
proches. SYCEBNL, fiche du compte 29 : « à la clôture de chaque exercice une
entité doit apprécier s'il existe un quelconque indice qu'un actif a subi une
perte de valeur […] l'actif doit être déprécié lorsque la valeur nette
comptable est supérieure à la valeur actuelle […] même en cas d'absence ou
d'insuffisance d'excédent, il doit être procédé aux dotations nécessaires ». Et
surtout : « les dépréciations sont inscrites distinctement à l'actif, EN
DIMINUTION DE LA VALEUR BRUTE des biens correspondants pour donner leur valeur
comptable nette ». L'AUDCIF ajoute la règle de recalcul (art. 46) : après une
perte de valeur, l'amortissement se calcule sur la valeur brute diminuée de la
valeur résiduelle, des amortissements cumulés ET DE LA DÉPRÉCIATION.

Le déclenchement, lui, reste un jugement : « s'il n'existe pas d'indice de
perte de valeur, aucun test de dépréciation n'est requis ». Un logiciel ne peut
pas connaître un indice · ni la valeur de marché, ni l'obsolescence.

**Ce que le logiciel fait.** Le schéma déclare la dépréciation hors périmètre du
module, ce qui est un choix assumé et écrit. Mais les comptes 29 sont semés dans
les deux plans et parfaitement mouvementables, et le texte OBLIGE à doter dès
qu'un indice existe. Le cabinet qui le fait à la main installe alors deux
divergences que rien ne signale :

1. `baseAmortissable` reste « valeur d'origine moins valeur résiduelle » · elle
   ignore la dépréciation, et le plan d'amortissement s'écarte de la règle de
   recalcul dès l'exercice suivant ;
2. `sortir` crédite le compte d'immobilisation pour sa valeur d'origine et
   débite l'amortissement cumulé **sans jamais solder le 29**. La valeur
   comptable nette portée au compte 81 est alors surévaluée du montant
   déprécié, la plus ou moins-value de cession est fausse d'autant, et le
   compte 29 garde un solde pour un bien qui n'existe plus.

**Fichiers.** `src/modules/immobilisations/immobilisation.service.ts`
(`baseAmortissable`, `sortir`), `prisma/schema.prisma` (modèle
`Immobilisation`, sans champ de dépréciation).

**Lacune du logiciel.** Le périmètre était déclaré ; sa conséquence ne l'était
pas.

**Gravité · état faux à la cession, et muet.** L'écriture de sortie reste
équilibrée et la balance boucle · c'est la répartition entre le 81 et le 82 qui
est fausse, donc le résultat H.A.O. Rien ne peut s'en apercevoir.

**Ce qui a été fait ici.** Un quinzième contrôle,
`DEPRECIATION_IMMO_HORS_MODULE`, en AVERTISSEMENT. Il ne se déclenche que si le
dossier fait LES DEUX : porter un solde créditeur sur un compte 29 et tenir des
immobilisations dans le module · une dépréciation de titres dans un dossier sans
module ne diverge de rien. Il cite le texte du référentiel du dossier, nomme les
deux divergences et donne la manœuvre de contournement : reprendre la
dépréciation à la main avant de sortir le bien. Le commentaire du schéma, qui
disait seulement « non couverte », porte désormais la conséquence. Le module
lui-même est la tâche 103 · accueillir la dépréciation, jamais la décider.

### Portée de cette passe

Restent les ch. 3, 7, 10, 11, 13, 15, 19 à 21, 25, 26, 28 et 32 à 41.

---

## Passe 14 · Titre VIII ch. 7 et 28 · la réévaluation, même mécanisme qu'à la passe 13

Lu à la source : AUDCIF, Titre VIII ch. 7 « Coûts d'emprunts » (sections 1 et
2) et ch. 28 « Réévaluation des bilans » (sections 1, 2 et 6), avec les
art. 62 à 65 déjà lus à la passe 7 ; SYCEBNL, cadre conceptuel § 3.3.1.2.1 et
fiche du COMPTE 106.

### Écart 14.1 · l'écart de réévaluation subit le même sort que la dépréciation

**Le mécanisme est celui de la passe 13**, et c'est ce qui le rend intéressant :
le module range la valeur d'entrée dans `valeurOrigine`, et rien d'extérieur ne
peut la mettre à jour. Une réévaluation passée à la main augmente la valeur au
bilan (débit du compte 2x, crédit du 106) sans que le module en sache rien · il
continue d'amortir et de sortir le bien au coût historique.

**Ce que chaque texte dit, et seulement lui** · c'est le point délicat.

- SYCEBNL · le cadre conceptuel prévoit « le recours à la réévaluation qui peut
  être libre ou légale », portant « exclusivement sur les immobilisations
  corporelles et financières », et la fiche du compte 106 en fait « la
  contrepartie au passif du bilan des augmentations de valeur d'éléments
  actifs ».
- AUDCIF · art. 62 à 65 et Titre VIII ch. 28, qui ajoutent DEUX règles que le
  texte SYCEBNL n'écrit pas : « la valeur réévaluée des immobilisations
  amortissables sert de base au calcul des amortissements sur la durée
  d'utilité restant à courir depuis l'ouverture de l'exercice de réévaluation »
  (art. 64) ; et « le solde de l'écart de réévaluation d'un bien cédé ou mis
  hors service doit faire l'objet d'un transfert à un poste de réserve non
  distribuable » (ch. 28 § 6).

Les prêter au SYCEBNL serait exactement la transposition que le dépôt
s'interdit · un test le vérifie dans les deux sens.

**Gravité · état faux, et muet.** Le bilan porte la valeur réévaluée, le module
la valeur ancienne. La dotation de l'exercice suivant et la valeur comptable
nette de sortie divergent, sans qu'aucune écriture ne se déséquilibre.

**Ce qui a été fait ici.** Un seizième contrôle,
`REEVALUATION_IMMO_HORS_MODULE`, sur le même patron que le quinzième : il ne se
déclenche que si le dossier porte un solde créditeur au 106 ET tient des biens
dans le module, cite le texte du référentiel du dossier, et rappelle dans son
action l'interdiction de la réévaluation partielle, qui est le piège le plus
courant du chapitre. Le portage dans le module rejoint la tâche 103, dont c'est
le même correctif de fond.

### Ch. 7 · rien à corriger, une nuance à ne pas gommer

Le chapitre définit l'actif qualifié (celui qui « exige une longue période de
préparation »), donne le seuil indicatif d'un an, et détaille le calcul des
coûts incorporables selon que l'emprunt est spécifique ou général, avec un
plafond : « le montant des coûts incorporés au cours d'un exercice ne doit
toutefois pas excéder le total des coûts d'emprunt supportés au cours de ce
même exercice ».

Rien de cela ne tombe sur le logiciel : la valeur d'entrée d'une immobilisation
est saisie, pas calculée · le comptable y incorpore ce qu'il a déterminé.

**Une nuance de rédaction, signalée et non tranchée.** L'AUDCIF, art. 37, écrit
que les coûts d'emprunt d'un actif qualifié « FONT PARTIE du coût du bien
lorsqu'ils concernent la période de production » ; le SYCEBNL, Partie 2 ch. 3,
introduction de la classe 2, écrit qu'ils « PEUVENT être inclus dans le coût du
bien ». Obligation d'un côté, faculté de l'autre, sur la même opération. Aucun
code ne dépend aujourd'hui de cette lecture · elle est notée ici pour qu'elle
soit tranchée le jour où un module de valorisation en dépendra, et surtout pour
qu'elle ne soit pas harmonisée en silence.

### Portée de cette passe

Restent les ch. 3, 10, 11, 13, 15, 19 à 21, 25, 26 et 32 à 41.

---

## Passe 15 · Titre VIII ch. 21 (engagements de retraite) et ch. 13 (portefeuille-titres)

Lu à la source : AUDCIF, Titre VIII ch. 21 (sections 1 et 2) et art. 48 ;
ch. 13 « Portefeuille-titres » ; SYCEBNL, Partie 2 ch. 3, fiche du COMPTE 29
(règles d'évaluation des titres) et plan des comptes, compte 196.

### Écart 15.1 · les engagements de retraite se PROVISIONNENT, et rien ne le porte

**Ce que le texte exige, et ce n'est pas une mention.** Art. 48 : « les entités
doivent évaluer et comptabiliser sous forme de provisions à inscrire au passif
externe du bilan les engagements de retraite ». Le ch. 21 § 1.2 le répète et
ajoute la mention aux notes : les deux, pas l'une ou l'autre. Le texte précise
aussi que « les indemnités de fin de carrière que doit verser l'entité lorsque
le salarié part à la retraite CONCERNENT TOUTES LES ENTITÉS ».

La MÉTHODE, elle, est graduée : actuarielle obligatoire pour les entités
faisant appel public à l'épargne ; pour les autres, méthode actuarielle sur
option ou méthodes simplifiées, qui « font abstraction des hypothèses
démographiques et/ou financières » · ne pas tenir compte de la probabilité de
départ ou de décès avant l'âge, négliger la croissance des rémunérations à
condition d'en tenir compte dans le taux d'actualisation.

**Ce que le logiciel fait.** Les comptes existent des deux côtés : 1961
« Provisions pour pensions et obligations similaires · engagement de retraite »
et 1962 « Actif du régime de retraite » au plan SYSCOHADA, 196 « Provisions
pour pensions et obligations similaires » au plan SYCEBNL. Le bilan et le
tableau des flux SYSCOHADA les traitent correctement, et la NOTE 16B recueille
la variation de l'engagement en saisie. Ce qui n'existe nulle part, c'est un
rappel que la PROVISION est due, ni un contrôle de son absence.

**Lacune du logiciel**, mais avec une réserve que je ne peux pas lever seul.

**Ce que je n'ai PAS pu établir, et qui commande la suite.** Une règle qui
vaudrait « toute entité ayant du personnel doit porter une provision » ferait
un contrôle simple · je ne l'ai pas écrite, parce que je ne peux pas la fonder.
Le texte OHADA suppose l'existence d'une indemnité de fin de carrière due par
l'employeur, née « de dispositions législatives, d'une convention collective,
d'un accord d'entité ou d'une clause du contrat de travail ». Or la source de
droit du travail congolais dont je dispose ne mentionne la retraite que sous
l'angle des cotisations CNSS du décompte final · elle n'établit aucune
indemnité de fin de carrière générale à la charge de l'employeur. Un régime de
cotisations n'est pas un engagement de l'entité.

Il en résulte qu'un contrôle qui se déclencherait sur tout dossier ayant des
charges de personnel reposerait sur une prémisse non vérifiée, et crierait à
tort sur la majorité des dossiers. **La question à trancher avec Manasse** est
donc : en RDC, quels dossiers portent effectivement un engagement de retraite
au sens du ch. 21 · par leur convention collective, leur accord d'entité ou
leurs contrats de travail ? La réponse conditionne le contrôle, et elle
n'appartient pas au logiciel.

**Gravité · état incomplet pour les dossiers concernés.** Un engagement non
provisionné laisse le passif externe minoré et le résultat majoré. Mais tant
que le champ n'est pas établi, le relevé s'arrête à la règle et à la question.

### Ch. 13 · les règles d'évaluation des titres sont déjà citées, là où il faut

Le chapitre traite l'évaluation du portefeuille-titres. Ses règles pratiques
sont reprises mot pour mot dans la fiche du COMPTE 29 du SYCEBNL, que le
logiciel sert déjà en avertissement d'imputation : « les titres cotés sont
évalués au cours moyen boursier du dernier mois ; les titres non cotés sont
estimés à leur valeur probable de négociation. Les plus-values apparaissant à
la suite de cette estimation ne sont pas comptabilisées. En revanche, les
moins-values sont inscrites au compte de dépréciations […] aucune compensation
n'étant établie avec les plus-values des titres en hausse. […] La dépréciation
éventuelle doit en outre être calculée sur la base de la valeur libérée des
titres. »

La non-compensation entre titres en hausse et titres en baisse est le piège du
chapitre, et c'est précisément ce que la citation porte. Les comptes de
dépréciation des titres (296, 297 pour les immobilisations financières, 590
pour les titres de placement) sont semés, et le contrôle
`DEPRECIATION_IMMO_HORS_MODULE` posé à la passe 13 couvre ceux des
immobilisations financières · il se tait, à raison, sur un dossier qui déprécie
des titres sans tenir d'immobilisations dans le module, puisque rien ne diverge
alors.

**Aucun écart.**

### Portée de cette passe

Restent les ch. 3, 10, 11, 15, 19, 20, 25, 26 et 32 à 41.

---

## Passe 16 · Titre VIII ch. 32, 34, 36 et 39 · les quatre chapitres d'organisation

Lu à la source : AUDCIF, Titre VIII ch. 32 « Opérations faites pour le compte
de tiers », ch. 34 « Comptabilité autonome par établissement », ch. 36
« Comptabilité pluri monétaire », ch. 39 « Comptes intermédiaires » ; Titre VII,
classe 4, nomenclature du compte 471.

Ces quatre chapitres ne portent pas une opération mais une ORGANISATION. Leur
point commun est qu'ils supposent une structure que le logiciel n'a pas : un
mandat, un établissement, une seconde monnaie de tenue, une date d'arrêté qui
n'est pas la clôture.

### Ch. 32 · servi, et le plan est plus fin que le texte

Le chapitre distingue le MANDATAIRE, qui agit « pour son compte et en son
nom » et dont « seule la rémunération est comptabilisée dans le résultat », du
COMMISSIONNAIRE, qui agit « en son propre nom » et chez qui « la
comptabilisation des achats et des ventes est simultanée, montrant ainsi que
l'intermédiaire n'est pas le propriétaire des marchandises (pas de stocks) ».

L'incidence est un CHIFFRE D'AFFAIRES : le principal comptabilise « le montant
total du prix attendu », l'agent « la commission à laquelle elle a droit ». Un
dossier qui se trompe de qualification publie un chiffre d'affaires faux d'un
ordre de grandeur, sans qu'aucun total ne bouge · les deux traitements
s'équilibrent.

Le logiciel sert ce chapitre par le plan : le 473 est semé ET SUBDIVISÉ en
47310000 Mandants, 47320000 Mandataires et 47330000 Commettants
(`compte-seed-syscohada.ts` l. 818-821), ce que le chapitre exige expressément
puisque « le mandataire peut être amené à enregistrer à la fois des créances et
des dettes vis-à-vis du mandant ». Les comptes de rémunération sont là aussi :
706 Services vendus, 7072 Commissions et courtages, 632 et 63220000
Commissions et courtages sur ventes.

La QUALIFICATION, elle, n'appartient pas au logiciel. Le chapitre en fait un
faisceau de cinq indicateurs (responsabilité première de l'exécution, risque de
stock, latitude sur les prix, forme de la rémunération, risque de crédit
client) qui ne se lisent dans aucun solde. **Aucun écart.**

### Anomalie du texte officiel · le ch. 32 renvoie à des numéros qui portent autre chose

Le § 2.2.1.1 fait enregistrer les opérations du mandataire au « crédit 4719
Autres créditeurs divers, ouvert au nom de chaque fournisseur » et au « débit
4718 Autres débiteurs divers, ouvert au nom de chaque client ».

Or le plan des comptes du même Acte uniforme (Titre VII, classe 4) nomme
« 4711 débiteurs divers · 4712 créditeurs divers » et réserve « 4718 apport,
compte de fusion et opérations assimilées · 4719 bons de souscription
d'actions et d'obligations ». Le plan semé suit le Titre VII, comme il le doit
(`compte-seed-syscohada.ts` l. 806-814).

Le chapitre porte donc les NUMÉROS d'une nomenclature et les INTITULÉS d'une
autre. Signalé, non corrigé : un comptable qui suivrait le ch. 32 à la lettre
logerait des créances de mandat dans le compte des apports de fusion.

### Ch. 34 · le logiciel n'a pas d'établissement, et le numéro piège

Le chapitre organise la comptabilité d'une entité dont les divisions tiennent
leurs propres comptes. Il ouvre pour cela quatre comptes de liaison, tous semés
au SYSCOHADA (`compte-seed-syscohada.ts` l. 206-209) : 184 Comptes permanents
bloqués, 185 Comptes permanents non bloqués, 186 Comptes de liaison charges,
187 Comptes de liaison produits. Le 188 des sociétés en participation est là
aussi (l. 210).

**LE NUMÉRO NE VEUT PAS DIRE LA MÊME CHOSE DES DEUX CÔTÉS**, et c'est le
piège de ce chapitre. Au plan SYCEBNL, 1851 et 1852 sont « Dépôts et
cautionnements reçus », 186x « Intérêts courus », 187x « Dettes de
location-acquisition » (`compte-seed.ts` l. 158-167). Un contrôle qui
signalerait « le compte 185 n'est pas soldé à la clôture » crierait donc sur
toute association qui détient un cautionnement reçu, ce qui est une situation
parfaitement normale. Tout contrôle né de ce chapitre doit être
SYSCOHADA seulement.

**Ce que le texte exige, et que rien ne vérifie.** Le § 3.4 est impératif sur
l'issue : à la réincorporation, « les comptes 185, 186 et 187 sont soldés et le
résultat provenant de l'activité de l'établissement se trouve compris dans le
résultat global de l'entité ». Le logiciel ne connaît pas la notion
d'établissement et ne vérifie pas ce solde. Un dossier qui laisse un solde sur
un compte de liaison publie un bilan portant une créance ou une dette envers
lui-même : le total boucle, l'unicité de la comptabilité de l'entité, elle, est
rompue. C'est exactement la forme de défaut que le § 10 bis de CLAUDE.md
décrit.

**Et le module Groupe n'est PAS le remède**, contrairement à ce qu'un lecteur
pressé conclurait. Le chapitre le dit lui-même : l'intégration des
établissements « ne constitue qu'une contraction comptable, différente de la
consolidation des comptes, appellation réservée à l'établissement de comptes
uniques pour un ensemble de sociétés liées par un lien de participation ». Un
établissement « n'a jamais la personnalité morale, ce qui la différencie de la
filiale ». Le module Groupe agrège des DOSSIERS, c'est-à-dire des entités
juridiques distinctes ; s'en servir pour des succursales d'une même société
donnerait un agrégat juste par accident et faux dès qu'un contrôle de
réciprocité s'appliquerait.

**Gravité · état faux, pour les dossiers concernés seulement.** Portée
restreinte : aucun dossier du portefeuille actuel ne tient de comptabilité
autonome par établissement, à confirmer par Manasse. Le remède minimal, si le
cas se présente, tient en un contrôle SYSCOHADA de trois comptes.

### Ch. 36 · la méthode que le logiciel sert est celle que le texte conseille

Le chapitre offre trois organisations. L'INTÉGRATION DIRECTE, « utilisée
lorsqu'il n'y a qu'un petit nombre d'opérations réalisées dans une seule
monnaie étrangère », tient la comptabilité en unités monétaires légales et
convertit à l'opération. L'INTÉGRATION DIFFÉRÉE est « conseillée dès que les
opérations avec l'étranger prennent une certaine ampleur » et fait tenir
« autant de comptabilités auxiliaires distinctes qu'il y a de catégories de
monnaies étrangères », reliées par des sous-comptes de 185. L'INTÉGRATION
MIXTE tient les devises en partie simple, hors bilan.

OmegaX sert la première, et c'est la bonne pour le portefeuille : le module
devises cote un cours à une date (`devises.controller.ts` l. 37-38, « en RDC,
celui de la Banque Centrale du Congo ») et la réévaluation de clôture ajuste le
solde au dernier cours, ce que le § 1 exige dans les deux cas. Les comptes 676
et 776 que le chapitre nomme sont servis par le module.

**Deux options du texte ne sont pas offertes, et ce sont des conforts.** Le
« cours fixe, choisi pour toute une période (cours standard) » n'existe pas :
tout passe par le cours coté. Le texte prend soin de dire que le choix « est
neutre sur le résultat de l'opération, mais il ne l'est pas quant à la
répartition de la valeur sur les éléments composants du résultat » · aucun
montant n'est donc faux, seule la ventilation entre achats et différence de
change diffère. Et l'intégration différée n'est pas outillée : un dossier qui
la voudrait tiendrait autant de dossiers OmegaX que de monnaies, sans compte de
liaison pour les relier. **Aucun écart bloquant.**

### Ch. 39 · la matière première d'une situation intermédiaire n'existe pas

Le chapitre « RECOMMANDE aux entités qui établissent des comptes
intermédiaires de préparer un jeu complet de comptes ». Le verbe compte : il
« ne précise pas les catégories d'entités qui doivent publier des comptes
intermédiaires » et « n'indique pas non plus la fréquence ni le délai ». Ce
n'est donc pas une obligation d'OmegaX, c'est une règle DE FORME qui
s'applique si le dossier publie.

**Ce que le logiciel ne peut pas faire.** Aucun état ne prend de date : bilan,
compte de résultat et tableau des flux prennent un `exerciceId` et rien d'autre
(`etats-financiers-syscohada.service.ts` l. 589, 740, 1126 ·
`etats-financiers-smt-syscohada.service.ts` l. 304, 753). Et la balance
elle-même est bornée à l'exercice (`ecriture.service.ts` l. 2008) : il n'existe
donc aucun chemin, même manuel, pour obtenir une situation arrêtée au 30 juin.
Un cabinet à qui une banque ou un conseil d'administration demande une
situation semestrielle doit la monter hors du logiciel.

**Ce que le chapitre exigerait si on l'ouvrait un jour**, et qui est plus
lourd que l'état lui-même : le § 2.1.2 réclame quatre comparatifs (bilan de
clôture de l'exercice précédent, compte de résultat cumulé, celui de la même
période de l'exercice précédent, celui de l'exercice précédent entier), et le
§ 2.1.1 une « déclaration indiquant que les méthodes comptables et les
modalités de calcul adoptées sont identiques à celles utilisées dans les
comptes de l'exercice les plus récents ». Une situation intermédiaire servie
sans ces mentions serait un état INCOMPLET au sens du chapitre, pas un service
rendu.

**Anomalie du texte officiel, déjà signalée dans la compétence** : le § 2.1.2
exige un « tableau des variations de capitaux propres » qui ne figure ni dans
le jeu complet énuméré au § 2.1 du même chapitre, ni dans celui du Système
normal.

**Gravité · confort, au sens du texte ; gêne réelle en cabinet.** À arbitrer
avec Manasse : une balance bornée par une date d'arrêté est un chantier de
quelques heures et débloquerait la situation intermédiaire manuelle ; le jeu
complet du ch. 39, avec ses quatre comparatifs, est un chantier entier.

### Portée de cette passe

Les ch. 32, 34, 36 et 39 sont clos. Les quatorze autres chapitres restants
(3, 10, 11, 15, 19, 20, 25, 26, 33, 35, 37, 38, 40, 41) sont traités dans les
passes qui suivent.

---

## Passes 17 à 21 · les quatorze derniers chapitres du Titre VIII (2026-09-05)

Ces cinq passes ont été conduites en parallèle, un lecteur par groupe de
chapitres, chacun lisant le texte à la source et le confrontant au code. Tous
les écarts consignés ici ont été RELUS et vérifiés dans le fichier avant
d'être écrits, et quatre d'entre eux sont corrigés dans le même commit. Ce qui
ne l'est pas est dit avec sa raison.

Chapitres couverts : 3, 10, 11 (passe 17) · 15, 19, 20 (passe 18) · 25, 26, 33
(passe 19) · 35, 37 (passe 20) · 38, 40, 41 (passe 21).

### CORRIGÉ · Le contrôle 22 criait sur l'affectation du résultat

**Le défaut.** `IMPUTATION_REPORT_A_NOUVEAU_NON_DECLAREE` relevait toute ligne
sur un compte 12 hors clôture et hors motif déclaré. Or l'affectation du
résultat passe par le chemin ordinaire (`affectation.service.ts`, appel à
`ecritureService.creer` sans drapeau) et vire au 12 dans les deux plans · le
SYCEBNL le rend même obligatoire (fiche du COMPTE 13 : « le résultat net de
l'exercice précédent non affecté à un compte de réserves sera viré au compte
12 »).

**Pourquoi c'est grave.** Le faux n'était pas produit par le contrôle, il
n'était plus ATTRAPÉ par lui. Tout dossier recevait l'avertissement dès son
premier exercice affecté, c'est-à-dire sur l'opération la plus banale de
l'année. Un avertissement présent partout est un avertissement qu'on apprend à
ignorer : le contrôle 22 est le SEUL garde-fou du compte 12, et le jour où une
OD manuelle l'aurait vraiment mouvementé, elle se serait noyée dans la même
ligne. C'était donc le garde-fou lui-même que le bruit détruisait.

**Le remède.** L'exclusion passe par la RELATION (`AffectationResultat.ecritureId`,
`@unique`), jamais par un drapeau : un drapeau se recopie à la main dans une OD,
la relation n'existe que si une décision d'affectation a été enregistrée. Le
test inspecte le FILTRE, le faux Prisma de ce fichier ignorant le `where`.

**Reste ouvert, et ce n'est pas la même famille.** Le ch. 19 § 2.2 autorise un
second débit licite du 12 : le prélèvement sur le report à nouveau pour
constituer la réserve d'attribution gratuite d'actions (1132). Il ne passe pas
par le module d'affectation, donc par une OD, et l'avertissement est alors
justifié. Lui donner un chemin déclaré, comme les deux exceptions d'ouverture,
demande un arbitrage : ce prélèvement ne rompt PAS la correspondance clôture /
ouverture (il est daté de l'exercice, décidé par l'assemblée), ce n'est donc
pas la même famille que les deux exceptions existantes.

### CORRIGÉ · Un immeuble entrait sans ventilation du terrain, et s'amortissait en entier

**Ce que les deux textes exigent**, chacun dans le sien et à l'impératif.
AUDCIF, Titre VIII ch. 11 § 1.7.1 : « La ventilation du coût d'acquisition
d'un immeuble entre le terrain et la construction doit être effectuée dès
l'origine, à la date d'inscription à l'actif du bilan. » SYCEBNL, Partie 2
ch. 3, fiche du COMPTE 23 : « La valeur des terrains n'est pas comprise dans
celle des bâtiments. Les terrains et les bâtiments doivent faire l'objet
d'évaluation distincte. » L'art. 38 de l'AUDCIF, qui donne la méthode quand
l'acte ne détaille pas la ventilation, n'est pas exclu par l'art. 3 du SYCEBNL.

**Ce que rien ne voyait.** `verifierComptesFamille` ne contrôle que les
CLASSES (classe 2 hors 28/29, amortissement en 28, dotation en 68) · un
bâtiment porté pour le prix global de l'ensemble immobilier passait, et aucun
des vingt-six contrôles ne regardait ce cas. Un immeuble acheté 200 000 000
dont 60 000 000 de terrain, entré comme un seul bien pour vingt ans, produit
une dotation de 10 000 000 au lieu de 7 000 000 : le résultat est minoré de
3 000 000 par exercice, et au terme du plan le bilan porte zéro pour un terrain
qui vaut toujours son prix. L'écriture s'équilibre, la balance boucle, rien ne
le trahit, et l'erreur se répète à l'identique chaque année. Au SYSCOHADA,
la dotation excédentaire n'est de surcroît pas déductible.

**Le remède, et le piège que j'ai corrigé moi-même.** Contrôle 23
`BATIMENT_SANS_VENTILATION_TERRAIN`, en AVERTISSEMENT : le logiciel ne connaît
pas la part du terrain et une saisie imposée la ferait inventer. Il se
déclenche quand l'écriture d'acquisition d'un bien ne touche aucun compte 22.

Le relevé initial visait « 231, 232 ou 233 ». C'est faux, et c'eût été un faux
positif permanent : les deux plans distinguent **231 « sur sol propre »** et
**232 « sur sol d'autrui »**, et un bâtiment sur sol d'autrui n'a par
définition aucun terrain à ventiler · c'est le sujet propre de la section 1 du
ch. 11. Le contrôle ne vise donc que le 231, les ouvrages d'infrastructure
(233) étant écartés par la même prudence. Un test garde chacune des deux
bornes.

### CORRIGÉ · Le drapeau de liquidation court-circuitait l'unicité de la période

**Ce que le texte permet.** AUDCIF art. 7 al. 4 : « En cas de cessation
d'activité, pour quelque cause que ce soit, la durée des opérations de
liquidation est comptée pour un seul exercice. » L'exception porte sur la
DURÉE, et sur elle seule.

**Ce que le code faisait.** `if (liquidation) return;` était posé en tête de
`validerArticle7`, donc avant la règle du 31 décembre mais AUSSI avant la
recherche d'un exercice couvrant déjà la période · c'est-à-dire l'un des quatre
refus posés le 2026-09-03 (CLAUDE.md § 10 bis), rouvert au moment où le dossier
est le plus fragile, la liquidation étant le seul cas où un exercice long
chevauche mécaniquement une année civile déjà ouverte. Le comptable voyait deux
exercices dans son sélecteur, chaque bilan bouclait, et il fallait additionner
deux liasses pour voir que l'année était coupée en deux.

**Le remède, borné, et POURQUOI il l'est.** Le refus ne porte que sur le
chevauchement d'un exercice **déjà CLÔTURÉ** : celui-là a sa liasse, et rien ne
justifie d'en produire une seconde sur les mêmes mois. Un exercice encore
OUVERT est le cas ordinaire de la cessation en cours d'année, et **OmegaX n'a
aucune route pour raccourcir un exercice à la date de cessation** (aucun
`update` sur `dateDebut`/`dateFin`). Refuser là aurait bloqué la liquidation
sans issue · j'ai préféré une correction qui ferme le silence sans créer de
cul-de-sac.

**À trancher avec Manasse** : faut-il ouvrir une route de raccourcissement de
l'exercice en cours à la date de cessation, réservée à l'ADMIN_CABINET et
tracée comme l'imputation d'ouverture ? Sans elle, un dossier qui cesse son
activité un 15 mars n'a pas de chemin propre.

### CORRIGÉ · La CAFG avait perdu les deux quotes-parts sur opérations en commun

Le ch. 33 § 7.2 fait sortir le 652 et le 752 des postes ordinaires pour les
loger dans « un poste supplémentaire de charges et un de produits, à la fin du
niveau "Exploitation" ». Ces deux postes (RQP, TQP) sont servis par le compte
de résultat depuis leur mise en service · ils ont donc quitté XD, et la CAFG,
qui part de XD, les avait perdus. Or leur contrepartie de bilan, le compte 463
« Associés, opérations faites en commun » (§ 3.2), continue d'être lue par la
variation des créances et des dettes (FD et FE, qui n'excluent pas le 46).

Le flux opérationnel d'un coparticipant était donc décalé du montant de la
quote-part. L'écart de bouclage s'imprimait, le tableau disant son propre trou ·
mais **la ligne CAFG, elle, était fausse sans que rien ne la marque**, et la
note 34 la reprend sans contrôle de bouclage à elle. Le remède était rédigé
dans le dépôt lui-même (point 14 a du commentaire d'en-tête de la
correspondance du compte de résultat) et n'avait pas été écrit : ce sont deux
termes. Le coefficient est +1 des deux côtés, la valeur d'un poste portant
déjà son signe.

### Ce que les cinq passes ont trouvé et que je n'ai PAS corrigé

Classé par gravité. Chaque ligne dit pourquoi elle attend.

**FAUX, en attente d'un arbitrage ou d'un chantier**
- **Une immobilisation ne peut jamais changer de compte.** Le ch. 10 § 2.4
  organise le transfert d'un immeuble d'exploitation vers les immeubles de
  placement, sans incidence sur la valeur comptable ; le ch. 3 impose un
  reclassement après dépréciation. Le modèle fige ses trois comptes à la
  création et aucune route ne les modifie. Deux issues, toutes deux muettes :
  sans reclassement, les notes 3A et 3C affichent zéro pour une entité qui tire
  des loyers ; avec un reclassement passé à la main, la SORTIE du bien créditera
  l'ancien compte. Remède : une opération `reclasser` sur le modèle de
  `renouveler`, environ deux jours.
- **Rien ne garde le compte 1681 après l'extinction d'une rente viagère.** Le
  contrat est aléatoire ; le comptable qui poursuit les versements au-delà du
  terme rend le compte débiteur, une dette financière à solde d'actif, et la
  charge HAO du § 2.4 n'est jamais constatée. Un contrôle de sens sur le 1681
  suffirait (une demi-journée). SYSCOHADA seulement : au SYCEBNL le 168 est
  « Autres fonds affectés », le 1681 SYSCOHADA n'y existe pas.
- **La contrepassation des intérêts courus d'un emprunt obligataire à
  l'ouverture n'est ni faite ni contrôlée**, alors que son jumeau exact sur le
  476/477 l'est. Dépend de la question ci-dessous sur les EBNL.
- **Un dossier repris entre avec ses comptes abolis** (ch. 41) : l'import crée
  les comptes absents à la volée, la classe déduite du premier chiffre, et le
  seul filet posé sur l'intitulé ne connaît que l'AUTRE référentiel, jamais
  l'ANCIEN plan. Chantier de reprise, à cadrer.
- **Le mode d'amortissement par unités de production n'existe pas**, là où le
  ch. 3 § 3.4 en fait la règle pour l'actif de découverture. Aucun dossier
  minier au portefeuille · le geste à coût nul est de corriger le commentaire
  de périmètre du schéma, qui sous-déclare aujourd'hui ce qui manque.

**INCOMPLET, le plus souvent une note ou un état qui n'existe pas**
- Le renvoi « dont Placement en Net » du bilan est imprimé sans chiffre.
- Un immeuble de placement en cours de construction est compté en « hors
  placement ».
- Les deux postes de quote-part ne sont pas analysés en composantes (6521 /
  6525, 7521 / 7525) dans les notes 26 et 21, alors que la section 7.3 l'exige
  et que les quatre comptes sont semés. C'est l'information qui dit DE QUEL
  CÔTÉ l'entité se trouve : une quote-part en charges peut être un bénéfice
  reversé ou une perte imputée, même montant, lecture inverse. Deux à trois
  heures.
- Quatre des cinq mentions du ch. 19 § 3 (attribution gratuite d'actions) n'ont
  ni ligne, ni champ, ni rappel.
- Aucun module d'emprunt : ni tableau d'amortissement, ni échéancier, alors que
  la fiche du compte 16 les réclame au réviseur.
- L'état comptable de moins de trois mois exigé pour une fusion (ch. 38) et les
  situations annuelles provisoires que l'art. 7 al. 4 pose en CONDITION de
  l'exercice unique de liquidation ne sont pas produisibles · même cause que le
  ch. 39 de la passe 16, aucun état ne prend de date.
- L'exercice de liquidation n'est atteignable par aucun écran.
- Le compte 475 est semé et mouvementable, sans garde-fou ni étalement (ch. 41).
- Un dossier repris publie un compte de résultat sans comparatif, et
  l'information pro-forma n'a aucun canal.
- Plantations pérennes sur sol d'autrui (ch. 37) : aucun compte déclaré, aucun
  solde à l'expiration du bail. Le bilan et le compte de résultat agricoles de
  la section 2, le détail du poste TF et les deux informations de la section 4
  n'ont aucune rubrique.
- Les frais de lancement des établissements franchisés (ch. 35) n'ont aucune
  ligne de note.

**UN TROU DANS LE PLAN SEMÉ, qui appartient à Manasse**
Le compte **6388 « Charges externes diverses »** n'est pas semé côté SYSCOHADA,
et la cause est la SOURCE, pas la transcription : le TSV de la compétence
`syscohada` passe de « 6385 Charges de copropriété » directement à « 64 Impôts
et taxes ». Ce n'est pas une convention du TSV, son parallèle exact « 6638
Autres indemnités et avantages divers » y étant bien. Comme le 638 est semé en
type TOTAL, la saisie y est refusée : le comptable qui suit le ch. 33 § 6.1 à
la lettre n'a aucun compte disponible, et toute charge externe hors des cinq
rubriques nommées va se ranger dans une rubrique qui ne lui correspond pas,
faussant la note 24 sans qu'aucun total ne bouge.

Le plan SYCEBNL est hors de cause, et pour une raison propre : son texte
arrête la classe 6 aux comptes à trois chiffres, et le semis suit cette lecture
en faisant du 638 un compte d'imputation. L'asymétrie vient des deux textes,
pas d'une transposition.

**Le remède appartient à Manasse** (CLAUDE.md § 7 et § 11) : ajouter la ligne
au TSV de la compétence, puis régénérer le semis · le TSV n'est déployable que
par lui. À faire précéder d'un balayage des autres comptes terminaux en 8, que
cette passe n'a pas mené.

**CONTRADICTION ENTRE DEUX FENÊTRES, à trancher**
Le jalon 16 « Rapport de gestion » du planning de clôture est servi en
`nature: 'LEGALE'` avec la source « AUSCGIE, art. 138 » à toute forme
SYSCOHADA, GIE compris. La fenêtre des documents obligatoires dit exactement
l'inverse pour le GIE : « Aucun texte lu n'impose de rapport de gestion au
groupement d'intérêt économique ». Un planning est un document sur lequel un
cabinet organise sa campagne, et `LEGALE` y signifie « opposable à un tiers ».
La contradiction est invisible tant qu'on ne consulte pas les deux fenêtres, et
elle se résout pour l'utilisateur en faveur du plus affirmatif. Le remède
propre est de faire citer au jalon la même fonction que la fenêtre des
documents obligatoires, plus un test qui interdit aux deux de diverger · une à
deux heures. Je ne l'ai pas fait parce qu'il suppose de relire l'AUSCGIE
art. 138, qu'aucune de ces passes n'a ouvert.

### Les questions qui appartiennent à Manasse

1. **Une EBNL peut-elle émettre un emprunt obligataire en RDC ?** Le plan
   SYCEBNL porte 181, 1861, 5187, 4423, 4719 et 6316, mais le corpus SYCEBNL
   n'a aucun chapitre sur l'emprunt obligataire et ne renvoie pas au ch. 20 du
   SYSCOHADA. L'AUSCGIE art. 780, cité par ce chapitre, réserve l'émission
   « essentiellement à la société anonyme ou au groupement d'intérêt économique
   constitué de sociétés anonymes ». Ou bien ces comptes sont un décalque sans
   objet, et il n'y a rien à faire ; ou bien un ordre professionnel ou une
   fondation peut lever de la dette sous un régime que je n'ai pas lu, et il
   faut alors décider quelle règle comptable lui appliquer.
2. **Un dossier du cabinet exploite-t-il une carrière, un gisement ou une
   mine ?** La réponse commande tout le ch. 3 : si non, il se règle en
   corrigeant un commentaire de périmètre.
3. **Quels dossiers portent un engagement de retraite** au sens du ch. 21 (question
   déjà posée à la passe 15, toujours ouverte).
4. **Faut-il une route de raccourcissement de l'exercice en cours** à la date de
   cessation d'activité ?
5. **Un dossier tient-il une comptabilité autonome par établissement** (passe 16,
   ch. 34) ?

### Portée de ces passes

**Le Titre VIII est intégralement ouvert.** Les quarante et un chapitres ont
été lus et confrontés au code, sur dix-neuf passes. Aucun chapitre ne reste à
ouvrir.

---

## Ce qui reste, et ce qui n'est plus un manque

**Le relevé est refermé le 2026-09-05.** Les vingt-huit articles de l'Acte
uniforme SYCEBNL, le cadre conceptuel, l'organisation comptable de l'AUDCIF
(art. 1 à 113) et les QUARANTE ET UN chapitres du Titre VIII ont été lus à la
source et confrontés au code, sur vingt et une passes. Il n'y a plus de
chapitre à ouvrir.

Ce qui subsiste n'est plus un relevé à faire mais un carnet de travaux, et il
est tenu dans les passes elles-mêmes :

- **ce qui est corrigé** est dit passe par passe, avec le test qui l'aurait
  attrapé ;
- **ce qui attend un arbitrage de Manasse** est rassemblé en fin de passes 17
  à 21, avec la question exacte à trancher · cinq questions, dont deux
  (l'emprunt obligataire des EBNL, l'engagement de retraite en RDC) supposent
  une lecture de droit congolais qu'aucune source du dépôt ne porte ;
- **ce qui appartient matériellement à Manasse** est le compte 6388 manquant
  au TSV de la compétence `syscohada`, les compétences n'étant déployables que
  par lui.

Deux chantiers du relevé restent entiers et devraient être des tâches à part
entière plutôt que des lignes ici : l'opération de RECLASSEMENT d'une
immobilisation (ch. 3 et 10), et la SITUATION INTERMÉDIAIRE (ch. 39, avec les
états à date que les ch. 38 et 40 réclament aussi). Ce sont les deux seuls
manques du Titre VIII dont un dossier ordinaire du cabinet peut avoir besoin.
