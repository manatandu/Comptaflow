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

## Ce qui n'a pas encore été ouvert

À traiter dans les passes suivantes, dans cet ordre :

1. **SYCEBNL Partie 3** · les six chapitres d'opérations spécifiques, contre le
   catalogue `catalogue-operations*.ts`.
2. **AUDCIF** · articles 1 à 113, en particulier l'organisation comptable
   (art. 14 à 24) et les délais.
3. **AUDCIF Titre VIII** · les 41 chapitres d'opérations spécifiques.
