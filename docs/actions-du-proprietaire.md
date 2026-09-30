# Ce qui attend une action de Manasse, et ce que ça bloque

Établi le 2026-09-03. **Chaque point a été rouvert dans le code ou dans un
journal d'exécution ce jour-là**, pas recopié d'un plan antérieur · deux
d'entre eux s'étaient d'ailleurs révélés plus graves que ce que le plan en
disait, et un troisième était déjà réglé.

**Refait contre le code le 2026-09-28 (audit final F199).** La liste avait
vieilli dans les deux sens. Quatre points y figuraient encore comme ouverts
alors qu'ils étaient réglés · le heartbeat de la licence sur site, la tenue en
devise, l'écriture tombant dans une période close, l'OCR du Code du numérique ;
trois autres, marqués réglés sur place (sauvegardes, mécénat, module groupe),
restaient rangés parmi les points ouverts. Et le seul geste du propriétaire
qui bloque aujourd'hui une livraison sur site n'y était pas · la clé publique
des licences, qui vaut encore `null`. Les
points réglés sont rangés en fin de document, chacun avec sa date et son
fichier ; ceux qui restent ont été vérifiés un par un.

Aucun développement ne débloque cette liste. Elle est classée par ce que
l'inaction coûte, pas par la difficulté du geste. L'ORDRE dans lequel attaquer
l'ensemble des restes, ceux-ci compris, est celui de
`docs/plan-ordonne-2026-09.md`, table « LES RESTES, VERROUILLÉS DU MOINS LOURD
AU PLUS LOURD » (rangs 10, 16, 17 et 18 pour ceux des points ci-dessous qui y
figurent) et section « Décisions qui n'appartiennent pas au logiciel ». Au
2026-09-28, l'item « Licence PERPETUEL_ONPREMISE » de cette section donne
encore pour ouverte la décision de livrer une installation qui émette le
heartbeat · elle est prise, et le heartbeat n'a pas été retenu (voir « Ce qui
est déjà réglé »).

---

## 1. Ce qui empêche une vente

### La paire de clés des licences sur site n'est pas posée · le paquet refuse de se construire

**Constat, vérifié le 2026-09-28.** `src/modules/sur-site/cle-publique-editeur.ts:18`
porte `export const CLE_PUBLIQUE_EDITEUR: string | null = null;`, et le
commentaire du même fichier le dit (l. 6 à 13) : « `null` TANT QUE MANASSE NE
L'A PAS POSÉE ». Trois conséquences, chacune lue dans le code :

- **le paquet d'installation ne se construit pas.** Juste après la
  récupération du code, le workflow « Paquet sur site (Windows) » passe l'étape
  « Exiger la clé publique de l'éditeur »
  (`.github/workflows/paquet-sur-site.yml:34-39`), qui relit ce fichier
  et lève une erreur s'il ne contient pas la chaîne `BEGIN PUBLIC KEY`. Aucun
  `.exe` ne sort, et rien d'autre dans le workflow n'attend un geste du
  propriétaire ;
- **la console refuse d'émettre une licence** · « Cette version ne porte pas la
  clé publique de VMG · une licence émise ne pourrait être vérifiée nulle part »
  (`src/modules/plateforme/licences-sur-site.service.ts:84-86`) ;
- **une version sans clé ne s'ouvrirait jamais chez un client** · le poste rend
  `CLE_EDITEUR_ABSENTE` avant même d'examiner le fichier de licence
  (`src/modules/sur-site/licence-signee.ts:147-149`).

La console exige en plus la clé PRIVÉE, que le déploiement passe au service
depuis le secret de dépôt `API_CLE_PRIVEE_LICENCE`
(`.github/workflows/deploy-cloud-run.yml:338` et `:417-418`, facultatif) ;
absente, l'émission est refusée en nommant ce secret
(`licences-sur-site.service.ts:80-83`). Que ce secret soit déjà posé ne se
vérifie pas d'ici · la console le dira à la première émission.

**Ce que ça bloque.** Toute installation sur site · ni paquet, ni licence.
L'installation elle-même est livrée depuis le 2026-09-26
(`docs/installation-sur-site.md`) ; c'est le seul geste du propriétaire que le
code attend encore pour elle.

**Ce qui est attendu de vous.** Une seule fois, chez VMG et jamais dans la CI,
la marche de `docs/installation-sur-site.md` § 2 « Une seule fois chez VMG · la
paire de clés » (le commentaire du code renvoie à ce titre depuis le
2026-09-28, audit final F199 ; il nommait une section « Clés de licence »
qui n'existe pas). Les
gestes sont ceux de la fiche ; seul l'ordre diffère, le secret étant posé
AVANT de pousser la clé publique pour qu'un seul déploiement porte les deux :

```bash
openssl genpkey -algorithm ed25519 -out omegax-licences-privee.pem
openssl pkey -in omegax-licences-privee.pem -pubout -out omegax-licences-publique.pem
```

1. Ranger la clé PRIVÉE hors du dépôt, en deux exemplaires (coffre de mots de
   passe et support hors ligne). Perdue, plus aucune licence ne peut être émise
   pour les installations existantes ; volée, n'importe qui en émet. Elle ne va
   jamais dans le code.
2. La poser en secret de dépôt `API_CLE_PRIVEE_LICENCE` (contenu entier du
   fichier `.pem`).
3. Coller le contenu entier de `omegax-licences-publique.pem`, lignes
   `BEGIN PUBLIC KEY` et `END PUBLIC KEY` comprises, à la place de `null` dans
   `src/modules/sur-site/cle-publique-editeur.ts`, en chaîne de caractères
   (entre accents graves, lignes non indentées : la constante est typée
   `string | null`, et un PEM collé nu ne compilerait pas), puis committer et pousser
   sur `main`. La clé publique ne sait pas signer, sa publication ne coûte rien
   (même fichier, l. 2 à 4). Le fichier est sous `src/**` · le push redéploie
   le service, qui porte alors la clé publique ET, le secret étant posé avant,
   la clé privée. Relire le résultat du déploiement.

La clé publique NE SE LIT JAMAIS dans l'environnement (même fichier, l. 13 et
14) : une clé réglable sur le poste laisserait le client se signer ses propres
licences. C'est pour cela qu'elle se pose par un commit, et non par une
variable.

**Comment vérifier.** Lancer le workflow « Paquet sur site (Windows) » (onglet
Actions, « Run workflow ») · l'étape « Exiger la clé publique de l'éditeur »
passe, et l'artefact `OmegaX-installation-<date>-<commit>` est produit. Dans la
console, cadre « Licences sur site », une émission n'est plus refusée ; la
console vérifie chaque licence avec la clé publique du code avant de
l'enregistrer, si bien qu'une clé privée qui ne correspond pas est refusée et
que rien n'est émis (`docs/installation-sur-site.md` § 2).

### L'homologation d'OmegaX comme système de facturation (SFE)

**Constat, vérifié le 2026-09-28.** `src/modules/facturation/mentions-facture.ts:119`
porte `omegaxHomologue: false`. Le décret n° 23/10 du 3 mars 2023 fait
d'OmegaX un « Système de Facturation d'Entreprise » (art. 3, 7°), utilisable
seulement après une attestation de conformité de l'Administration fiscale
(art. 22), et ajoute que « seuls les SFE homologués sont proposés à la vente
aux contribuables et utilisés en République Démocratique du Congo pour
produire les factures normalisées » (art. 20, lu au corpus fiscal ; le même
fichier le cite l. 111 à 116 avec l'art. 21, sans ses derniers mots). La
procédure est renvoyée à un arrêté du Ministre des Finances (art. 23) qui
n'est dans aucune source lue.

**Ce qui est attendu de vous.** Une démarche auprès de la DGI, qui peut
s'engager dès aujourd'hui, en parallèle de tout le reste. Rang 18 du plan
ordonné · c'est la plus longue, et elle conditionne la VENTE en RDC.

---

## 2. Ce qui laisse passer une erreur comptable

### Engagements de retraite · quels dossiers en portent un ?

**Toujours ouvert, vérifié le 2026-09-28** · aucun contrôle ne signale
l'absence de provision pour pensions (19600000 au SYCEBNL, 19610000 au
SYSCOHADA) ; le seul fichier de `src/modules/controles/` qui nomme ces comptes
est la table engendrée des schémas d'écriture du Guide
(`schemas-guide-syscohada.ts`), qu'aucun contrôle ne consulte encore (en-tête
du même fichier).

**Ce qui est certain.** L'AUDCIF, art. 48 et Titre VIII ch. 21, oblige les
entités à « évaluer et comptabiliser SOUS FORME DE PROVISIONS à inscrire au
passif externe du bilan les engagements de retraite », ET à en porter mention
aux notes annexes. Ce n'est pas une mention au choix : c'est une provision plus
une mention. La méthode est graduée · actuarielle obligatoire pour les entités
faisant appel public à l'épargne, actuarielle sur option ou simplifiée pour les
autres.

**Ce qui ne l'est pas, et qui vous revient.** Le texte suppose une indemnité de
fin de carrière due par l'employeur, née « de dispositions législatives, d'une
convention collective, d'un accord d'entité ou d'une clause du contrat de
travail ». La source de droit du travail congolais dont dispose le logiciel ne
mentionne la retraite que sous l'angle des cotisations CNSS du décompte final ·
elle n'établit aucune indemnité de fin de carrière générale à la charge de
l'employeur, et un régime de cotisations n'est pas un engagement de l'entité.

**La question.** Parmi vos dossiers, lesquels portent effectivement un
engagement de retraite au sens du ch. 21, par leur convention collective, leur
accord d'entité ou leurs contrats de travail ?

**Ce que la réponse débloque.** Un contrôle qui signalerait l'absence de
provision sur les dossiers concernés. Tant que le champ n'est pas établi, aucun
contrôle n'est écrit : il crierait à tort sur la majorité des dossiers, et un
avertissement qui se trompe souvent est un avertissement qu'on apprend à
ignorer.

Relevé : docs/releve-de-manques-referentiels.md, passe 15, écart 15.1.

---

## 3. Ce qui demande un juriste, pas un développeur

- **Code du numérique congolais** · autorisation de transfert hors RDC, et
  articulation des art. 201 et 202. **La qualification par un juriste reste
  due.** Ce qui a changé depuis le 2026-09-03, lu dans
  `docs/code-du-numerique-et-omegax.md` : le corpus n'est plus un OCR (réglé,
  voir plus bas) et le numéro est confirmé sur le texte intégral ·
  ordonnance-loi n° 23/10 du 13 mars 2023 (`docs/hebergement-en-rdc.md:17`
  l'écrit 23/010). La règle du dépôt est de la citer avec sa date (CLAUDE.md),
  le même numéro 23/10 portant aussi le décret du 3 mars 2023 sur la facture
  normalisée. Le traitement mis en œuvre pour la tenue d'une comptabilité
  générale est dispensé de déclaration préalable (art. 189, 5°, même
  document). La notification des violations (art. 244) ne relève pas du
  juriste : le § 3 du même document la dit intenable tant qu'aucune procédure
  n'est écrite et qu'aucune messagerie n'est posée (`SMTP_HOST`). Aucun
  document du dépôt ne porte encore cette procédure ; que la messagerie soit
  posée ne se vérifie pas d'ici. La politique de confidentialité est écrite
  (`client/src/pages/ConfidentialitePage.tsx`) : elle cite les art. 201, 202
  et 244 sans affirmer aucune conformité, et ne dit pas que l'autorisation de
  l'art. 201 n'a été ni demandée ni obtenue, décision laissée à VMG après
  l'avis du juriste. La question est concrète : l'art. 201 veut les données
  personnelles « stockées et/ou hébergées en République Démocratique du
  Congo », et la version en ligne d'OmegaX est hébergée hors de RDC (rang 17
  du plan ordonné, `docs/hebergement-en-rdc.md`). Depuis la passe D4
  (2026-09-30), la page ne fonde plus le transfert sur l'art. 202, 2° · ce 2°
  vise un contrat « entre la personne concernée et le responsable du
  traitement », que le contrat de VMG avec un cabinet ne remplit pas, et
  l'art. 229 réserve au responsable l'instruction des transferts · elle dit la
  base « en cours de qualification ».
- **Code du numérique, Livre I · le régime de VMG lui-même** (passe D4,
  D4-A5). Ordonnance-loi n° 23/10 du 13 mars 2023, art. 13 · « nul ne peut
  exercer une activité dans le secteur du numérique en République
  Démocratique du Congo, sans se soumettre à l'un des régimes juridiques
  prévus » (autorisation, déclaration ou homologation), le Livre régissant les
  services exercés « à partir ou à destination » de la RDC, par toute
  personne quel que soit son statut (art. 3). Deux hypothèses à qualifier,
  aucune tranchée · l'autorisation de l'art. 15, 4° (« les fournisseurs des
  services d'hébergement d'applications »), alors que VMG exploite sa propre
  application hébergée chez Google ; et l'homologation de l'art. 19 (« les
  fournisseurs des services numériques à l'État ou à toute autre entité
  publique »), situation concrète dès qu'un dossier de forme ENTITE_PUBLIQUE
  est tenu en ligne. Les listes se complètent par décret et arrêté (art. 13,
  19), textes qui ne sont pas au corpus. Rien n'est codé ni affiché avant la
  qualification.
- **Code du numérique, Livre IV · la cryptologie** (passe D4, D4-D3).
  Art. 300 · « La fourniture ou l'importation de moyens de cryptologie
  n'assurant pas exclusivement des fonctions d'authentification ou de
  contrôle d'intégrité est soumise à une déclaration préalable auprès de la
  Commission de cryptologie de l'Agence Nationale de Cybersecurité » ;
  art. 301, description technique tenue à sa disposition ; art. 341 et 342,
  amende de cinq à dix millions de francs congolais. Quatre questions ·
  (1) la fourniture du paquet sur site, qui chiffre la copie externe en
  AES-256-GCM à clé dérivée par scrypt
  (`src/modules/sur-site/chiffrement-sauvegarde.ts`), relève-t-elle des
  art. 300 et 301 ? (2) l'art. 298, al. 2 (confidentialité libre « uniquement
  si les moyens s'appuient sur des conventions gérées par un prestataire
  agréé ») pèse-t-il sur l'usage qu'en fait le client ? (3) le chiffrement
  `age` des sauvegardes en ligne (`.github/workflows/sauvegarde-base.yml`)
  entre-t-il dans l'exception de l'art. 298, al. 3, « sauf dans le cas où le
  cryptage est fait pour ses propres données », s'agissant de données
  confiées ? (4) la Commission de cryptologie et l'arrêté de l'art. 299
  existent-ils ? Ni l'ordonnance d'organisation de l'ANCY (art. 275) ni cet
  arrêté ne sont au corpus. Le chiffrement ne se retire pas · il protège les
  données. La description technique de l'art. 301 est déjà écrite dans le
  code (format OMXSAV01, AES-256-GCM, scrypt N=2^15, r=8, p=1 ; `age`).
- **Code du numérique, Livre IV · certificat de conformité et vulnérabilités**
  (passe D4, D4-D4). Art. 294 · le vendeur de produits ou fournisseur de
  services TIC « est tenu de solliciter, auprès du Ministre ayant le numérique
  dans ses attributions, un certificat de conformité après analyse de la
  vulnérabilité », et « d'informer les consommateurs de toutes les
  vulnérabilités décelées […] ainsi que des solutions déployées pour y
  remédier » ; art. 295, systèmes qualifiés de détection ; art. 296,
  contrôles de l'ANCY aux frais du fournisseur. VMG vend un paquet sur site et
  un abonnement en ligne, et l'audit final a corrigé des failles réelles
  (F160, F238, F240). À qualifier · la soumission de VMG à ces articles, et la
  procédure du certificat, dont l'agrément des experts n'est pas au corpus.
  Si elle est retenue, l'information de l'al. 2 se sert sans règle inventée ·
  une note des corrections de sécurité par version, rattachée à la version
  que « À propos » affiche.
- **Code du numérique, Livre IV · la notification à l'ANCY** (passe D4,
  D4-D5). La procédure de notification encore à écrire doit porter DEUX
  textes · l'art. 244 (Autorité de protection des données) et l'art. 276,
  al. 3 et 4 (voir `docs/code-du-numerique-et-omegax.md` § 3).
- **Formulaire de déclaration DGI** · toujours ouvert (rang 10 du plan
  ordonné). L'impôt est calculé, l'imprimé se remplit à la main faute d'en
  détenir le modèle officiel (`src/modules/fiscalite/fiscalite.service.ts:44-45`).
- **Forfait micro-entreprise** · toujours ouvert. La branche rend `impotDu:
  null` (`src/modules/fiscalite/fiscalite.service.ts:1467-1475`) : la
  contre-valeur en francs du forfait libellé en dollars dépend d'une circulaire
  de perception que le logiciel ne détient pas.

---

## 4. Ce qui n'est qu'un confort

- **Confirmation du régime de connexion dans les journaux Cloud Run** ·
  console Google Cloud → IAM → compte `github-deploy` → rôle « Lecteur de
  journaux » (`roles/logging.viewer`, `.github/workflows/deploy-cloud-run.yml:474`
  et `:496`). Depuis le 2026-09-03 le déploiement affirme déjà le régime à
  l'envoi, ce qui suffit. **Ne bloque rien.**
- **Règle de cycle de vie sur le bucket des sauvegardes** · facultative, pour
  en borner le coût (`docs/sauvegardes-et-restauration.md`, « Copie durable
  sur Cloud Storage », point 4). **Ne bloque rien.**

---

## 5. Ce que je ne peux pas vérifier d'ici

Ces points ne relèvent pas d'une action mais d'une **lecture depuis un poste
sans mandataire réseau** · l'environnement de développement ne les atteint
pas :

les règles de Google Play (suppression de compte, formulaire Sécurité des
données, fonctionnalités financières) · l'éligibilité de la RDC au compte
développeur Windows · l'obtention d'un D-U-N-S pour une entité congolaise ·
l'état d'installation de l'autorité congolaise de protection des données · le
chiffrement au repos chez Neon, documenté nulle part dans le dépôt · la
position de l'ONEC sur les outils informatiques, son site étant bloqué.

---

## Ce qui est déjà réglé, pour mémoire

### Réglé depuis l'établissement de la liste, retiré des points ouverts le 2026-09-28

- **Licence « Perpétuelle (sur site) » et heartbeat** · la liste disait que la
  console proposait ce type et qu'un dossier vendu ainsi était coupé à sa
  première requête, `enregistrerHeartbeat()` n'ayant aucun appelant. Fermé en
  deux temps. Constaté le 2026-09-24 au plan ordonné : la console n'attribue
  plus ce type, à la création comme au changement (`PlateformeService.refuserAttributionSurSite`,
  `src/modules/plateforme/plateforme.service.ts:141-144`, appelée l. 211 et
  419) ; le sélecteur ne le montre plus que grisé, sur une licence qui le porte
  déjà (`client/src/pages/PlateformePage.tsx:536-540`). Le 2026-09-26, Manasse
  choisit une licence en FICHIER SIGNÉ vérifiée sans internet, et le heartbeat
  n'est pas retenu (`src/modules/licence/licence.service.ts:16-23`) ; le motif
  de refus est corrigé le 2026-09-27 (audit final F171). Ce qui reste est la
  paire de clés, § 1.
- **Tenue en devise étrangère** · la liste demandait un avis de praticien sur
  les cas où elle serait admise. Les textes n'en admettent aucun (loi
  n° 23/053, art. 141, 1° · AUDCIF art. 17, 1°). Réglé par le chantier M1,
  déjà cité comme fait dans `docs/audit-citations-2026-09-06.md`, et constaté
  au plan ordonné le 2026-09-24 ; la reprise des dossiers est portée par la
  migration `20260918120000_monnaie_fonctionnelle`. La monnaie de tenue est le franc
  congolais (`src/common/monnaie-de-tenue.ts:39`), `Tenant.devise`
  n'est dans aucun DTO, n'est écrite par aucun service et ne se modifie plus à
  l'écran (`src/common/monnaie-de-tenue.spec.ts`). La monnaie fonctionnelle
  commande un second jeu sans valeur légale.
- **Écriture tombant dans une période close** · réglé le 2026-09-24, sur la
  lecture de l'AUDCIF art. 22, 4° que Manasse a confirmée. Le report se
  demande à la saisie (`reporterAuPremierJourOuvert`,
  `src/modules/comptabilite/ecriture.service.ts:707`), l'écriture prend le
  premier jour ouvert et garde sa date réelle en `Ecriture.dateValeur`
  (`prisma/schema.prisma:1376`), la règle vivant dans
  `src/modules/exercice/report-periode-close.ts`. Jamais d'office, jamais
  au-delà de l'exercice, jamais sur un journal clôturé totalement.
- **Mécénat · 4571 ou 475** · tranché le 2026-09-24 pour le 475, le 4751 du
  texte étant lu comme sa subdivision. Le modèle portait alors le 4571 et le
  tableau des flux cherchait la créance au 475 ; les deux sont alignés
  (`src/modules/operations-specifiques/catalogue-operations-dons.ts:397-409`,
  gelé par `operation-specifique.service.spec.ts:469`).
- **Sauvegardes limitées à 90 jours** · fait le 2026-09-24. Bucket créé,
  droit d'écriture accordé à `github-deploy`, variable de dépôt
  `BUCKET_SAUVEGARDES` posée ; le run n° 28, lancé à la main le même jour, a
  copié la sauvegarde chiffrée vers Cloud Storage
  (`.github/workflows/sauvegarde-base.yml:334-343`). Reste le confort du § 4.
- **Module groupe en SYSCOHADA** · tranché le 2026-09-24, ouvert au siège et
  aux succursales d'une même société, liaison par les comptes 184 à 187
  (`src/modules/groupe/groupe.service.ts`, gelé par
  `liaison-etablissements-syscohada.spec.ts`).
- **OCR du Code du numérique** · le corpus a été réextrait du PDF natif et lu
  sur le texte intégral le 2026-09-05, et le numéro du texte confirmé
  (`docs/code-du-numerique-et-omegax.md`, en tête) ; constat reporté au plan
  ordonné le 2026-09-23. Reste la qualification par un juriste, § 3.

### Réglé dès l'établissement de la liste

- **Réévaluation · les coefficients** · tranché par Manasse le 2026-09-03. Le
  Ministre des Finances publie le coefficient CHAQUE ANNÉE, et pour l'exercice
  en cours il n'y a pas eu de réévaluation. Il n'y a donc rien à coder tant
  qu'un arrêté n'est pas publié : la réévaluation reste une opération
  possible, jamais une obligation à rappeler. Le contrôle
  `REEVALUATION_IMMO_HORS_MODULE` continue de signaler un écart porté à la
  main, ce qui est le bon niveau. À rouvrir le jour où un coefficient paraît.
- **Notes 54 et 55 de la liasse fiscale** · tranché par Manasse le 2026-09-03.
  Elles se remplissent en EXTRA-COMPTABLE, hors du jeu d'états. Rien à ajouter
  aux notes annexes du logiciel, qui s'arrêtent légitimement à la 44. Manasse
  fournira les modèles plus tard si un besoin apparaît.
- **Clé de chiffrement des sauvegardes** (`CLE_AGE_SAUVEGARDES`) · posée. La
  sauvegarde nocturne du 2026-09-03 est verte de bout en bout.
- **Endpoint Neon poolé** (`API_DATABASE_URL_POOLED`) · posé. Le déploiement
  du 2026-09-03 affiche « Base · endpoint POOLÉ, plafond de connexions 10 par
  instance ». Conséquence pour une restauration · c'est LUI que le service
  lit, et une bascule change les DEUX secrets, jamais le seul
  `API_DATABASE_URL` (`docs/sauvegardes-et-restauration.md`, étapes 4 et 5).
- **Limitation de débit par instance** · le compteur reste par conteneur,
  mais `--max-instances 4` borne désormais le dépassement à un facteur connu
  au lieu d'un facteur inconnu. Redis n'est plus une urgence. Tranché le
  2026-09-24 · assumé, sans Redis (`docs/connexions-et-plafonds.md` § 7).
