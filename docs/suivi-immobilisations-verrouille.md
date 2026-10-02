# Liste verrouillée de traitement · immobilisations

Arrêtée le 2026-10-01 à la demande de Manasse. Elle tient, en un seul
endroit, ce qui est FAIT et ce qui RESTE, dans l'ordre où cela se traite. Le
détail de chaque lot (périmètre, sources, décisions D-1 à D-28) reste dans
`docs/plan-immobilisations-verrouille.md`, dont les règles s'appliquent ici.

## Règles de la liste

1. **L'ordre est fixe.** Une ligne « À faire » ne commence que lorsque la
   précédente est poussée ET vérifiée en production (Cloud Run, Hosting,
   tests navigateur verts).
2. **Une ligne ne passe à « Fait » que vérifiée en production**, avec le
   numéro des trois exécutions. Poussé n'est pas fait.
3. **Rien ne s'ajoute en cours de route.** Ce qu'on découvre va en
   « Relevés en attente » ; Manasse décide s'il entre dans la liste, et où.
4. **Une décision en attente bloque sa ligne**, jamais les suivantes qui
   n'en dépendent pas.
5. **Tout travail d'agent est relu par un relecteur adverse, repris sur ses
   refus, relu par l'intégrateur, puis passe les suites complètes et les
   tests navigateur** avant d'être poussé.

## Fait · vérifié en production

| # | Objet | Vérification |
|---|---|---|
| F1 | Lot 1 · défauts (change 21 à 26, 7951, citation sécurité, projets sans dotation) | journal du plan |
| F2 | Lot 2 · amortissement exceptionnel (art. 36 à 38) | journal du plan |
| F3 | Lot 3 · fin de projet de développement, sortie par le 162, 163 ou 164 | journal du plan |
| F4 | Lot 4 · reprises des fonds (14, 167, 171, 172) | Cloud Run 460, Hosting 583, tests 228 |
| F5 | Lot 5 · subvention en numéraire rattachée au bien | Cloud Run 461, Hosting 584, tests 229 |
| F6 | Lot 6 · barème de l'arrêté n° 013/2025 et comptes, proposés dans les deux sens | Cloud Run 462, Hosting 585, tests 230 |
| F7 | Lot 7 · legs grevé de dettes | Cloud Run 463, Hosting 586, tests 231 |
| F8 | Lot 8 · prix global et partie non identifiée | Cloud Run 464, Hosting 588, tests 233 |
| F9 | Lot 9 · voies parallèles du catalogue, division 20 du SYCEBNL | Cloud Run 465, Hosting 589, tests 234 |
| F10 | Lot 10 · incorporels à durée non limitée | Cloud Run 466, Hosting 590, tests 235 |
| F11 | Lot 11 · révision du plan d'amortissement, dégressif comptable SYCEBNL | Cloud Run 467, Hosting 591, tests 236 |
| F12 | Lot 12 · plafond de reprise d'une dépréciation | Cloud Run 468, Hosting 593, tests 238 |
| F13 | Correctif « Rattacher une subvention » (octroi proposé au choix du 14) et listes vides de la même famille | Cloud Run 469, Hosting 595, tests 240 |
| F14 | Lot 13 · coûts d'emprunt incorporés | Cloud Run 470, Hosting 596, tests 241 |
| F15 | Listes de choix · provisions, fonds 162 à 164 de la sortie de projet, « Réglé par » (ex-E1) | Cloud Run 471, Hosting 598, tests 243 |
| F16 | Immobilisation en cours (219, 229, 239, 249 aux deux référentiels, case décochée par défaut, mise en service D définitif / C en cours) et compte posé au choix de la nature du barème (ex-E2, E3, D5) | Cloud Run 472, Hosting 599, tests 244 |
| F17 | Notes 3A et 3B (SYSCOHADA), 5B et 3A (SYCEBNL) · la mise en service d'un bien en cours n'est ni une acquisition ni une cession · reconnue par `ecritureMiseEnServiceId`, elle va aux colonnes « Virements de poste à poste » (en plus sur le définitif, en moins sur l'en-cours, D inchangé) ; TFT SYCEBNL, crédit lié du 219 et du 229 retranché de FI (ex-E5, D6) | Cloud Run 473, Hosting 601, tests 246 |
| F18 | Coûts d'emprunt incorporés montrés aux Notes annexes en lecture seule (ex-A2, D1), « Réglé par » devenu « Contrepartie » (D2), fonds de projet en sommeil refusé au serveur (D3) | Cloud Run 474, Hosting 603, tests 248 |
| F19 | Comptes retenus · toutes les listes de choix de comptes ne proposent que les comptes retenus et ceux déjà utilisés, un compte prescrit seul jamais retiré (octroi, affectation, 12, 167 et 4861, 29 de la division, 4739 du remboursement), gardé des deux côtés par une table unique (ex-E4) | Cloud Run 475, Hosting 605, tests 250 |
| F20 | Écran Immobilisations rangé en onglets · Biens, Tableaux, Financements, Opérations, Lieux, sans changement de comportement ; ce qui porte sur un bien reste sur sa ligne (échange compris) (ex-A1) | Hosting 607, tests 252 (client seul, Cloud Run non déclenché) |

## En cours

| # | Objet | État |
|---|---|---|

## À faire, dans l'ordre

| # | Objet | Préalable |
|---|---|---|
| A3 | Lot 14 · réévaluation légale ou libre | A1 vérifié |
| A4 | Lot 15 · petits manques de faible valeur | A3 vérifié |

## Décisions en attente de Manasse

| # | Question | Proposition |
|---|---|---|
| D1 | Où imprimer les coûts d'emprunt incorporés et la justification d'une préparation courte, aucune rubrique officielle ne les portant (AUDCIF Titre VIII ch. 7 § 1.2 et section 3 ; Titre IX ch. 6) | RÉGLÉE le 2026-10-02, faite (F18) · encadré en lecture seule sous la note « Informations obligatoires » (NOTE 2 SYSCOHADA et associations, NOTE 1 projets), rien écrit dans la saisie |
| D2 | Libellé « Réglé par » · la liste admet aussi un fournisseur, un apport ou un fonds | RÉGLÉE le 2026-10-02 · libellé « Contrepartie », noms de code gardés |
| D3 | Refuser au serveur la sortie d'un bien de projet sur un compte de fonds en sommeil (aujourd'hui seulement retiré de la liste) | RÉGLÉE le 2026-10-02 · refus nommé au serveur (`motifRefusSortieProjet`, `compteFondsEnSommeil`) |
| D4 | Brancher Resend pour que la file de courrier parte réellement | le transport SMTP existe déjà · Manasse pose les six secrets API_SMTP_* et API_COURRIER_EXPEDITEUR dans GitHub, aucun code |
| D5 | Au SYCEBNL, offrir le 219 et le 229 pour un bien en cours | TRANCHÉ OUI par Manasse le 2026-10-01 · fait |
| D6 | Notes 3A (SYSCOHADA), 5A et 3A (SYCEBNL) · la mise en service comptée en augmentation ET en diminution | TRANCHÉ OUI (corriger) par Manasse le 2026-10-01 · ligne E5 |

## Relevés en attente (hors liste tant que Manasse ne les y met pas)

- Immobilisation en cours · dépréciation au 29x9 (2919 à 2949) permise par les
  textes, ni proposée ni virée au 29x définitif à la mise en service, faute de
  texte.

- Prix global avec fonds de commerce · l'écran vise toujours le 21500000,
  alors que le serveur ne crée le fonds que s'il reste un reliquat.
- Guide SYSCOHADA Partie 1 ch. 5 · 787 à côté du 72 pour les intérêts
  immobilisés, contre l'AUDCIF (fiches 67 et 78) · le module suit l'AUDCIF.
- Hors plan · bailleur, sous-location, cession-bail, concessions et PPP,
  première application du SYSCOHADA révisé, groupe d'actifs, cession
  partielle de titres.
- Pour A3 (lot 14), lu le 2026-10-02 · séminaire CPCC « Arrêté des comptes
  2024 », Jour 2, réévaluation des immobilisations (compétence
  `audcif-acte-uniforme`, `pratique-redressements-comptes-patrimoine-cpcc.md`,
  § II). Un TÉMOIN, pas une source · il propose la méthode indiciaire (VBR =
  VO × coefficient, ER = CV moins CA), la contrepartie au 106 dans son
  schéma général puis au 154 dans son cas chiffré, et la reprise du 154 au
  861 à hauteur du supplément d'amortissement. Deux points à ne pas
  reprendre tels quels · (1) les « innovations de la loi de finances 2023 »
  qu'il cite (déclaration avant le 30 avril, astreinte de 100 000 CDF par
  jour) sont celles de l'O.-L. n° 89/017, abrogée au 1er janvier 2026 (loi
  n° 23/053, art. 136 et 138 · au plus tard le 30 avril, 300 000 FC par
  jour) ; (2) le cumul « amorti avant réévaluation » de
  l'imprimante (308 969,10) ne rejoint pas celui du fichier n° 3
  (299 970,00). Les sommes des deux écritures (15 697 000,00 et
  7 855 950,86) se vérifient. Numéros de compte à sept chiffres de cabinet,
  à relire au plan. AUDCIF Titre VIII ch. 28 à lire avant tout code.

- 2026-10-02 · D1, D2 et D3 réglées selon la proposition écrite (Manasse ·
  « exécuter tout ») · D1, encadré « Coûts d'emprunt incorporés de
  l'exercice » aux Notes annexes des deux référentiels, en lecture seule
  (`CoutsEmpruntEnNote`, `lib/couts-emprunt-en-note.ts`), ce qui fait aussi
  A2 ; D2, « Réglé par » devenu « Contrepartie » ; D3, fonds de projet en
  sommeil refusé au serveur. À vérifier en production avant de passer en
  « Fait ».
- 2026-10-02 · séminaires du CPCC confrontés à OmegaX · dix-sept manques et un écart à trancher, au relevé `docs/releve-seminaires-cpcc-2026-10-02.md` (hors liste tant que Manasse ne les y met pas) ; les deux défauts du lot 14 (réévaluations successives) sont corrigés dans le lot.
