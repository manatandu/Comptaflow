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

## Ce qui n'a pas encore été ouvert

À traiter dans les passes suivantes, dans cet ordre :

1. **SYCEBNL Partie 1 ch. 2** · le reste du cadre conceptuel · les cinq
   postulats hors permanence des méthodes, les cinq conventions, et les quatre
   applications de la prééminence de la réalité sur l'apparence.
2. **SYCEBNL Partie 3** · les six chapitres d'opérations spécifiques, contre le
   catalogue `catalogue-operations*.ts`.
3. **AUDCIF** · articles 1 à 113, en particulier l'organisation comptable
   (art. 14 à 24) et les délais.
4. **AUDCIF Titre VIII** · les 41 chapitres d'opérations spécifiques.
