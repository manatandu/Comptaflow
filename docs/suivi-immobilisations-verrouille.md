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

## En cours

| # | Objet | État |
|---|---|---|
| E2 | Immobilisation en cours · case « Pas encore mis en service » DÉCOCHÉE par défaut (décision de Manasse), acquisition au compte en cours de la division (219, 229, 239, 249 au SYSCOHADA ; 239 et 249 au SYCEBNL), mise en service D compte définitif / C compte en cours ; renouvellement et remplacement d'une partie refusés tant que le bien est en cours | commité en local, suites et tests navigateur verts (28 sur 28) ; poussé après vérification de E1 |
| E3 | Barème · le compte proposé est POSÉ dès le choix de la nature quand il est unique, modifiable ensuite | commité avec E2 |
| E4 | Comptes retenus · toutes les listes de choix de comptes ne proposent que les comptes retenus et ceux déjà utilisés, gardé par un test | refusé deux fois en relecture (incomplet, conflits avec main, listes vides muettes dans les écrans d'immobilisation) · à refaire sur main à jour, après E2 |

| E5 | Notes 3A, 5A et 3A · la mise en service d'un bien en cours n'est ni une acquisition ni une cession, elle ne gonfle plus les mouvements (D6) | agent en cours |

## À faire, dans l'ordre

| # | Objet | Préalable |
|---|---|---|
| A1 | Écran Immobilisations rangé en onglets · Biens, Tableaux, Financements (subventions, fonds, legs), Opérations (prix global, échange), Lieux | E2 à E4 vérifiés (même écran) |
| A2 | Coûts d'emprunt aux Notes annexes · montants de l'exercice montrés à côté des rubriques libres de la note « Informations obligatoires », sans rien écrire à la place du cabinet | décision D1 ci-dessous |
| A3 | Lot 14 · réévaluation légale ou libre | A1 vérifié |
| A4 | Lot 15 · petits manques de faible valeur | A3 vérifié |

## Décisions en attente de Manasse

| # | Question | Proposition |
|---|---|---|
| D1 | Où imprimer les coûts d'emprunt incorporés et la justification d'une préparation courte, aucune rubrique officielle ne les portant (AUDCIF Titre VIII ch. 7 § 1.2 et section 3 ; Titre IX ch. 6) | les montrer à côté des rubriques libres B ou C (méthodes) et D (informations complémentaires), le cabinet rédigeant |
| D2 | Libellé « Réglé par » · la liste admet aussi un fournisseur, un apport ou un fonds | renommer « Contrepartie » |
| D3 | Refuser au serveur la sortie d'un bien de projet sur un compte de fonds en sommeil (aujourd'hui seulement retiré de la liste) | refuser, comme la liste |
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
