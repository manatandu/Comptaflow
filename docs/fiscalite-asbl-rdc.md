# Fiscalité des ASBL en RDC · ce qu'OmegaX doit en savoir

Note de recherche, 29 août 2026. Elle sert deux choses : donner au logiciel la
matière fiscale qui manque à côté du référentiel comptable, et fixer par écrit
ce qui est vérifié, ce qui ne l'est pas, et ce qu'il ne faut surtout pas coder
en dur.

## 0. Où ces informations ont été prises

Le corps de la note vient des référentiels congolais encodés et disponibles
dans cet environnement, cités fichier par fichier :

| Source | Ce qu'elle fonde ici |
|---|---|
| skill `fiscalite-rdc-socle`, `parametres-2026.md` | Loi 23/053, entrée en vigueur, abrogations, barème IRPP, échéances |
| skill `fiscalite-rdc-socle`, `am-007-2025-...-ong.md` | Conditions d'exemption d'IS des EUP et ONG |
| skill `fiscalite-rdc`, `impots-reels-cedulaires/NOTES.md` | Ce qui reste en vigueur et ce qui ne l'est plus |
| skill `fiscalite-rdc`, `tva/references/02-exonerations.md` | Exonérations de TVA propres aux ASBL |
| skill `fiscalite-rdc`, `parafiscalite-sociale/...inpp...` | Taux INPP 2006 et 2025 |
| skill `cnss-cotisations-sociales-rdc`, décret 18/041 | Taux CNSS |
| skill `precis-droit-fiscal-congolais-kalonji`, section 7 | Régime historique et obligations civiles |
| skill `sycebnl`, note circulaire n° 003/2013 | Enregistrement de l'ASBL, facilités par arrêté interministériel |

Des recherches web ont été menées en parallèle (avocats.cd, taxenrdc.com,
legavox.fr, MonRespro, HNK). **Elles ont servi à mesurer l'écart entre le droit
et la pratique, pas à établir le droit** : voir la section 1, qui est le point
le plus important de cette note. Les textes primaires eux-mêmes (leganet.cd,
dgi.gouv.cd, legalrdc.com, icnl.org) sont inaccessibles depuis cet
environnement, ce qui est dit ici plutôt que masqué.

---

## 1. Le point qui change tout : le régime a basculé au 1er janvier 2026

La **loi n° 23/053 du 30 novembre 2023** (JO, numéro spécial du 29 décembre
2023) est entrée en vigueur le **1er janvier 2026**, son article 153 fixant
l'échéance à vingt-quatre mois après le 31 décembre de l'année de promulgation.

Son article 152 abroge notamment les **titres III et IV de l'ordonnance-loi
n° 69/009 du 10 février 1969** ainsi que l'ordonnance-loi n° 69/007.

Conséquence, écrite noir sur blanc dans `parametres-2026.md` :

> « **L'IPR et l'IBP n'existent plus.** Toute réponse qui les mobilise pour un
> exercice à compter de 2026 est fausse. »

Ils sont remplacés par l'**IS** (personnes morales) et l'**IRPP** (personnes
physiques). L'impôt mobilier disparaît lui aussi.

**Or la quasi-totalité de la documentation congolaise accessible en ligne
décrit encore le régime abrogé.** Les articles de vulgarisation fiscale
consultés parlent d'IPR, d'IBP et d'exonérations d'impôts cédulaires ; le
skill note même que « les pages IERE et IPR de la DGI n'ont pas été mises à
jour et décrivent encore le régime abrogé, barème et plancher de 1 500 FC
compris. Elles induisent en erreur. »

C'est une raison suffisante pour ne mettre **aucun barème fiscal en dur dans
OmegaX**. Voir la section 9.

---

## 2. Ce qui fait qu'une ASBL est une ASBL

Statut civil : **loi n° 004/2001 du 20 juillet 2001** portant dispositions
générales applicables aux associations sans but lucratif et aux établissements
d'utilité publique. La personnalité juridique vient d'un arrêté du Ministre de
la Justice (ASBL et EUP de droit national) ou d'une ordonnance présidentielle
(ONG étrangère).

La **note circulaire n° 003/CAB/MIN/PL.SMRM/COFAF/2013 du 24 janvier 2013** du
Ministère du Plan, déjà encodée dans le skill `sycebnl`, énumère les pièces de
l'enregistrement et celles des demandes de facilités administratives, fiscales
et douanières (arrêté interministériel Finances et Plan).

Deux obligations civiles à connaître, qui ne sont pas fiscales mais que le
fisc regarde : **interdiction de procurer un gain matériel aux membres**, et
**déclaration écrite au Ministre de la Justice, copie au Ministre des
Finances, dans les trois mois, des acquisitions et aliénations immobilières**.

---

## 3. Impôt sur les Sociétés · l'exemption n'est ni automatique ni définitive

L'**article 5, point 5 de la loi 23/053** exempte d'IS les associations sans
but lucratif, les établissements d'utilité publique et les ONG. Son texte
d'application est l'**arrêté ministériel n° 007/CAB/MIN/FINANCES/2025 du
19 février 2025**, en vigueur au 1er janvier 2026.

C'est le texte central de la fiscalité des ASBL aujourd'hui, et il est plus
exigeant que la réputation d'immunité qu'on prête aux associations.

### 3.1 Une attestation, pas un statut acquis (art. 2)

« Le bénéfice de l'exemption n'est pas automatique » : il passe par une
**attestation d'exemption** délivrée par l'Administration des Impôts, sur
demande adressée au Directeur Général des Impôts.

| Demandeur | Pièces |
|---|---|
| EUP de droit national | Arrêté du Ministre de la Justice accordant la personnalité juridique |
| ONG de droit congolais | Le même arrêté **et** l'acte d'enregistrement auprès du Ministère du secteur d'activité |
| ONG étrangère | Ordonnance présidentielle, justification d'une représentation en RDC, **accord-cadre avec le Ministère du Plan** |

Une ONG étrangère sans accord-cadre ne peut pas obtenir l'attestation, même
si elle a la personnalité juridique à l'étranger.

### 3.2 Quatre conditions cumulatives de fond (art. 3)

1. activités exercées dans un but non lucratif ;
2. gestion désintéressée ;
3. en cas d'activités lucratives, le produit **doit être réinvesti** dans le
   programme d'activités philanthropique, scientifique, culturel, artistique,
   pédagogique, éducatif ou sportif qui fait l'objet de la structure ;
4. la vente des produits de ces activités ne doit pas entraîner de
   **distorsion de concurrence**, appréciée au regard du public et de l'espace
   visés par l'objet.

Le texte dit que l'exemption n'est « **effectivement** » acquise que si les
quatre conditions sont réunies : l'attestation ne fige rien, elle reste
soumise à vérification continue.

### 3.3 Gestion désintéressée n'égale pas bénévolat total (art. 4)

La gestion est désintéressée lorsqu'elle est assurée à titre bénévole et
qu'aucune distribution directe ou indirecte de gains n'a lieu. **Mais les
statuts peuvent prévoir une rémunération des dirigeants**, à condition qu'elle
soit comparable à celle versée pour des responsabilités similaires. Ce n'est
donc pas l'existence de la rémunération qui pose problème, c'est son niveau.

### 3.4 Sanction (art. 5)

En cas de manquement aux articles 3 et 4, **l'IS est dû au titre de l'exercice
concerné**. Le taux de droit commun est de 30 % du bénéfice net imposable
(art. 56), avec un impôt minimum de 1 % du chiffre d'affaires déclaré
(art. 57) lorsque le résultat est déficitaire ou trop faible.

Le texte ne dit pas si la remise en cause peut remonter au-delà de l'exercice
visé. Le skill signale ce silence sans le trancher ; cette note fait de même.

---

## 4. Impôts réels et impôt locatif · ce qui subsiste

La réforme de 2026 n'a pas touché les impôts réels, de compétence provinciale
(Constitution, art. 204, point 16). Y subsistent des exonérations propres aux
ASBL, toutes formulées de la même façon : institutions religieuses,
scientifiques ou philanthropiques et associations assimilées.

| Impôt | Base | Exonération ASBL |
|---|---|---|
| Impôt foncier | O.-L. n° 69-006, art. 2, 2° | Oui, institutions et ASBL à œuvres religieuses, sociales, scientifiques ou philanthropiques dotées de la personnalité civile |
| Impôt sur les véhicules | O.-L. n° 69-006, art. 39 | Oui, mêmes catégories (attestation d'exemption délivrée par le Receveur des Impôts) |
| Taxe spéciale de circulation routière | O.-L. n° 88-029, art. 3 bis | Oui, mêmes catégories |
| Impôt sur les revenus locatifs | O.-L. n° 69/009, art. 12, 2° à 5° | Oui, mêmes catégories |

L'**impôt sur les revenus locatifs reste en vigueur** : la loi 23/053 l'exclut
explicitement des revenus catégoriels de l'IRPP tout en organisant une retenue
à la source. Taux national de référence : **22 %** (art. 11, D.-L. 109/2000).
À Kinshasa, un barème provincial différencié 22 % / 17 % par rang de localité
s'applique depuis le 1er janvier 2024 (arrêtés provinciaux n° 015 à 017 du
7 décembre 2023). **Propre à Kinshasa, à ne pas extrapoler.**

Attention au sens de l'exonération : elle vise l'ASBL **bailleresse**. Une
ASBL **locataire** reste tenue de la retenue à la source sur le loyer qu'elle
paie (section 6).

---

## 5. TVA · un régime entièrement distinct

L'arrêté 007/2025 le dit lui-même : il ne traite pas de TVA, et « un
établissement d'utilité publique exempté d'IS n'est pas automatiquement
exonéré de TVA sur ses achats ou ses ventes : les deux régimes s'apprécient
séparément ».

Base : ordonnance-loi n° 10/001 du 20 août 2010, décret n° 011/42 du
22 novembre 2011.

- **Article 15, 2°** : sont exonérées « les ventes et importations réalisées
  par les ASBL légalement constituées, à caractère social, sportif, culturel,
  religieux, éducatif ou philanthropique **conforme à leur objet** ».
- **Article 17, 8°** : sont exonérées « les prestations des ASBL légalement
  constituées **dans leurs activités normales**, si le non-assujettissement
  n'entraîne pas de distorsion de concurrence ».
- **Article 20** : la liste des articles 15 à 19 est **limitative**. Aucune
  exonération de TVA ne peut être accordée par un texte particulier en dehors
  d'elle. Un arrêté interministériel de facilités ne crée donc pas
  d'exonération de TVA.

Deux conditions se répètent d'un régime à l'autre, et c'est le vrai fil rouge
de la fiscalité associative congolaise : **conformité à l'objet** et **absence
de distorsion de concurrence**. Une ASBL qui vend hors de son objet, ou qui
vend dans les conditions d'un opérateur privé, sort de l'exonération, en TVA
comme en IS.

---

## 6. Ce dont une ASBL n'est jamais dispensée · le rôle de collecteur

L'exonération porte sur les impôts **dont l'ASBL est redevable pour
elle-même**. Elle ne dispense d'aucun impôt qu'elle **retient pour le compte
d'autrui**. C'est la source d'erreur la plus fréquente, et la plus coûteuse.

| Prélèvement | Taux | Échéance de reversement |
|---|---|---|
| Retenue IRPP sur revenus salariaux | barème progressif (section 7) | le 15 du mois suivant le versement (art. 18 LPF) |
| Retenue sur revenus locatifs (loyer payé) | 22 % de référence | dans les 10 jours du mois suivant le paiement (art. 57 LPF) |
| Prélèvement sur sommes payées aux prestataires non-résidents | 14 % du brut des factures (art. 144) | le 15 du mois suivant le paiement (art. 22 bis LPF) |
| Prélèvement exceptionnel sur personnel expatrié | 25 % du brut (art. 148) | dans les 15 jours suivant le mois du versement (art. 19 LPF) |
| TVA collectée sur une opération non exonérée | 16 % (taux normal) | le 15 du mois suivant |

### Un angle mort à signaler, pas à trancher

L'article 145 assied le prélèvement expatriés sur « les entreprises
individuelles ou sociétaires ». `parametres-2026.md` relève qu'une ASBL ou un
EUP n'est ni l'une ni l'autre, et que la lettre du texte ne les atteint pas,
là où l'ancien article 7 de l'O.-L. 69/007 exemptait expressément certains
employeurs. Le skill conclut à une « probable inadvertance de rédaction » et
demande de signaler la tension sans la trancher. **Une ASBL employant un
expatrié doit poser la question à son conseil, pas se fier à cette note.**

---

## 7. Barème IRPP et parafiscalité sociale

### 7.1 Barème IRPP (art. 118, loi 23/053)

Appliqué au revenu net global arrondi au **millier de FC inférieur** :

| Tranche annuelle (FC) | Taux |
|---|---|
| 0 à 1 944 000 | 3 % |
| 1 944 001 à 21 600 000 | 15 % |
| 21 600 001 à 43 200 000 | 30 % |
| au-delà de 43 200 000 | 40 % |

**Plafond** : en aucun cas l'impôt total ne peut excéder 30 % du revenu
imposable. Le skill note la tension apparente avec le taux marginal de 40 %,
et que le plafond finit toujours par mordre. Ce barème a été confirmé « au
franc près » par la page IRPP de la DGI le 10 juillet 2026.

Réduction pour charge de famille : 2 % par personne, 9 personnes au maximum
(art. 123), sans effet au-delà de la troisième tranche.

Arrondi de l'impôt : à la centaine de FC la plus proche, la tranche de 50 FC
basculant vers le haut (art. 150). **Deux arrondis différents, l'un en entrée
sur le revenu, l'autre en sortie sur l'impôt : ne pas les confondre.**

### 7.2 CNSS (décret n° 18/041 du 24 novembre 2018)

| Branche | Taux | Charge |
|---|---|---|
| Prestations aux familles | 6,5 % | employeur seul |
| Pensions | 10 % | 5 % employeur, 5 % travailleur |
| Risques professionnels | 1,5 % | employeur seul |

Soit **13 % à charge de l'employeur et 5 % à charge du travailleur**. Le taux
risques professionnels peut être majoré jusqu'au double pour un employeur non
conforme (art. 5). Les sources web qui annoncent « CNSS 10 %, 5 % et 5 % »
omettent les branches familles et risques professionnels.

### 7.3 INPP

| Effectif | Taux 2006 | Taux 2025 |
|---|---|---|
| Établissements publics | 3 % | 4 % |
| 1 à 50 travailleurs | 3 % | 3,5 % |
| 51 à 300 travailleurs | 2 % | 3 % |
| plus de 300 travailleurs | 1 % | 2 % |

Le taux dépend de l'effectif, il change dans le temps, et il a été relevé en
2025. C'est exactement le genre de valeur qui ne doit pas vivre dans le code.

### 7.4 ONEM

La cotisation ONEM (0,2 % couramment citée) n'est couverte par aucun des
référentiels encodés ici. **Non vérifiée, donc non retenue.**

---

## 8. Obligations formelles, même exonérée

- **Numéro Impôt** : demande dans les **15 jours** suivant le début des
  activités (art. 1er, loi n° 004/2003 portant réforme des procédures
  fiscales).
- **Déclarer même exonéré** : l'exonération dispense du paiement, pas de la
  déclaration aux échéances prévues. C'est le point sur lequel toutes les
  sources consultées, anciennes comme récentes, convergent.
- **Tenir une comptabilité régulière** : depuis le 1er janvier 2024, c'est le
  **SYCEBNL** (Acte uniforme OHADA, Niamey, 22 décembre 2022), et non plus le
  Plan Comptable Général Congolais que citait la doctrine antérieure.
  L'article 140 de la loi 23/053 renvoie d'ailleurs les entités à but non
  lucratif à des règles comptables particulières.
- **Sanctions** : Titre IV de la loi n° 004/2003 en cas d'inexécution des
  obligations déclaratives ou de paiement.

### Calendrier des principales échéances (loi 23/052 modifiant la LPF)

| Obligation | Échéance |
|---|---|
| Déclaration IS | 30 avril de l'année suivante |
| Déclaration IRPP | 30 avril |
| Retenue IRPP salariale | 15 du mois suivant le versement |
| Retenue sur revenus locatifs | 10 jours du mois suivant le paiement |
| Prélèvement prestataires non-résidents | 15 du mois suivant le paiement |
| Prélèvement expatriés | 15 jours suivant le mois du versement |
| Acomptes provisionnels IS (30 / 30 / 20 %) | 25 juillet, 25 septembre, 25 novembre |

Les échéances d'acomptes sont celles de l'article 57 bis LPF **tel que modifié
par la loi de finances n° 25/060 du 29 décembre 2025**. La rédaction de 2023
(1er août, 1er octobre, 1er décembre) est périmée. Une loi de finances change
ces dates presque chaque année.

---

## 9. Ce que cela veut dire pour OmegaX

### 9.1 Ce qui est déjà en place et reste juste

- Le **plan de comptes SYCEBNL** porte le compte **64 Impôts et taxes**, le
  compte **44 État et collectivités publiques** et le compte **43 Organismes
  sociaux** : la matière comptable de tout ce qui précède existe déjà.
- Le module **TVA** (taux, registre, déclaration) est adossé au skill
  `fiscalite-rdc/tva`, dont l'article 15 fonde justement l'exonération des
  ASBL. Le taux normal de 16 % y est paramétrable et non figé.
- Les **taux de TVA sont des données du dossier**, pas des constantes du code.
  C'est la bonne architecture, et c'est celle qu'il faut étendre.

### 9.2 Ce qu'il ne faut PAS faire

**Ne pas coder de barème fiscal en dur.** Ni l'IRPP, ni la CNSS, ni l'INPP, ni
les échéances d'acomptes. Trois raisons, toutes documentées ci-dessus : les
seuils et le barème sont réajustables par arrêté du Ministre des Finances
(art. 107, 109, 128 de la loi 23/053) ; l'INPP a été relevé en 2025 ; les
échéances d'acomptes ont changé avec la loi de finances 2026. Un logiciel qui
fige ces valeurs devient faux sans prévenir, et la personne qui s'y fie ne le
saura qu'au contrôle.

**Ne pas présenter l'exonération comme un statut.** L'arrêté 007/2025 en fait
une attestation révocable soumise à quatre conditions continues. Un écran qui
afficherait « dossier exonéré » serait un contresens.

**Ne pas confondre exemption d'IS et exonération de TVA.** Deux bases légales,
deux appréciations, dit l'arrêté lui-même.

### 9.3 Ce que le logiciel pourrait porter, et qui manque

Par ordre d'utilité décroissante pour une ASBL congolaise :

1. **Un échéancier fiscal du dossier.** Les dates ci-dessus, paramétrables,
   rappelées sur le tableau de bord. C'est le besoin le plus concret : une
   ASBL exonérée oublie de déclarer précisément parce qu'elle ne paie rien.
2. **Un registre des retenues à la source** (IRPP salarial, locatif,
   prestataires non-résidents), adossé aux comptes 44, sur le modèle du
   registre de TVA déjà construit. Ce sont les sommes dont l'ASBL répond même
   exonérée.
3. **Une fiche « statut fiscal du dossier »** dans les paramètres :
   attestation d'exemption d'IS (numéro, date, échéance de renouvellement),
   numéro impôt, arrêté interministériel de facilités, accord-cadre pour une
   ONG étrangère. Aujourd'hui rien de tout cela n'est tenu.
4. **Un contrôle « activité lucrative accessoire »** : un état qui isole les
   produits de la classe 70 ne relevant pas de l'objet (ventes, manifestations)
   et les met en regard du total des ressources. Ce n'est pas un calcul
   d'impôt, c'est le signal qui doit conduire l'entité à consulter.
5. **Le rapprochement des charges sociales** : comptes 43 contre 66, pour que
   la déclaration unifiée soit contrôlable depuis la comptabilité.

Aucun de ces cinq points ne demande à OmegaX de calculer un impôt. Ils
demandent qu'il tienne, présente et rappelle. C'est la ligne à garder : un
logiciel comptable qui liquide de l'impôt sur un barème qu'il ne contrôle pas
rend un mauvais service.

---

## 10. Ce qui reste incertain, et qu'il ne faut pas affirmer

1. **Persistance de la loi n° 004/2001** : non recensée comme abrogée, mais sa
   persistance n'est confirmée par aucune source disponible ici.
2. **Portée rétroactive de la déchéance d'exemption d'IS** : l'arrêté 007/2025
   vise « l'exercice concerné » sans exclure explicitement une remise en cause
   plus large.
3. **Prélèvement expatriés applicable à une ASBL** : l'article 145 ne vise que
   les entreprises individuelles ou sociétaires. Tension non tranchée.
4. **Première déclaration sous le régime IS** : vraisemblablement l'exercice
   2026 souscrit au plus tard le 30 avril 2027, mais le texte ne le dit pas.
5. **Taux ONEM** : non couvert par les référentiels encodés.
6. **Barème locatif hors Kinshasa** : les arrêtés provinciaux encodés sont
   ceux de Kinshasa seulement.
7. **Circulaire fixant le taux de change** du forfait micro-entreprises
   (30 USD) : inconnue. Sans objet pour une ASBL, mais signalée parce qu'elle
   montre le degré de dépendance des chiffres à des textes non publiés.

Chacun de ces sept points doit être vérifié auprès d'un conseil fiscal avant
d'être opposé à l'administration. Cette note n'est pas un avis fiscal.
