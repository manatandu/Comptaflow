# Passes de confrontation restantes · ordre et consignes

Préparé le 2026-09-28. L'ORDRE est celui que `docs/plan-confrontations.md`
§ 5 verrouille (volume croissant, décision du 2026-09-18) · ce document ne le
change pas, il le découpe en SESSIONS et donne pour chacune la consigne à
coller telle quelle.

**Pourquoi une session par passe.** Un run coûte 10 à 20 millions de jetons
et dure de 2 h 30 à 4 h (§ 5 bis du plan). Une session ne tient pas plus d'une
passe lourde, et un conteneur perdu en cours de run a déjà fait refaire sept
heures (F3b). Une passe de plusieurs runs se découpe en sessions d'un run.

**Faites :** F1, F2 (a, b), F3 (a, b), F4 (a, b), F6, F9, F10, F13, R4, O7, O2, F7, F5, F12, R3 ·
quinze passes sur trente et une.

---

## 1. La consigne commune, à coller en tête de chaque session

> Passe de confrontation **[CODE]** du plan `docs/plan-confrontations.md`
> (§ 4 méthode, § 5 ordre). Lance-la en workflow d'agents, j'autorise
> l'orchestration multi-agents pour cette passe.
>
> 1. **Lecture** · un agent par chapitre, SANS accès au code, effort `high`,
>    qui extrait chaque obligation avec citation exacte, fichier et ligne de
>    la compétence.
> 2. **Confrontation** · un agent par chapitre, effort `high`. Il reçoit le
>    journal des passes précédentes (`docs/releve-de-manques-*.md`) et le
>    hors-scope du module concerné, avec l'interdiction de resignaler un
>    manque déjà nommé. Il VÉRIFIE D'ABORD CE QUE LE DÉPÔT AFFIRME (messages,
>    dates, chiffres, citations à l'écran), puis cherche ce qui manque.
> 3. **Réfutation** · un agent par constat, effort `xhigh`, payé pour
>    démolir. Un constat non réfuté entre au relevé, un constat réfuté est
>    écrit comme écarté avec sa raison.
> 4. **Correction** · par la session principale seule, jamais par un agent.
>    Relire soi-même la ligne source avant d'écrire une ligne de code
>    (CLAUDE.md § 1). Chaque correction a son test, écrit en même temps que
>    celui de son POINT D'APPEL, et vu tomber par réinjection du défaut.
>
> Garde-fous vécus, à appliquer :
> - borner chaque règle à l'ENTRÉE EN VIGUEUR de son texte et à son
>   PÉRIMÈTRE (qualité de la personne, pas référentiel) ;
> - un manque se vérifie contre le CORPUS ENTIER avant d'être déclaré, une
>   lacune déclarée à tort coûte autant qu'une règle inventée ;
> - une correction qui dérive une branche d'une autre relit le texte de la
>   branche dérivée ;
> - un test gèle une présence, jamais une absence de mot dans un fichier ;
> - une doublure Prisma honore ses filtres, sinon elle valide une requête qui
>   ne charge pas ;
> - chercher le JUMEAU de chaque correction par la règle, pas par le fichier.
>
> Journal dans `docs/releve-de-manques-[fiscal|ohada|referentiels].md`, ligne
> de la passe mise à jour dans `docs/plan-confrontations.md` § 5. Commit
> signé sur `main`, et déploiement relu pas à pas quand `src/` ou `prisma/`
> est touché. Aucun run au-delà d'environ 4 h · découpe par chapitres si le
> corpus l'exige.

---

## 2. L'ordre, session par session

| Session | Passe | Corpus | Lignes | Journal |
|---|---|---|---|---|
| 1 | **R4** | AUDCIF Titres XII et XIII · comptes consolidés et combinés (D4C) | 612 | referentiels |
| 2 | **O7** run 1 | AUA · arbitrage, et AUM · médiation | ~460 | ohada |
| 3 | **O7** run 2 | AUCTMR · transport de marchandises par route | ~460 | ohada |
| 4 | **O2** run 1 | AUDCG Livres 1 à 3 · commerçant, RCCM, Fichiers, bail | ~460 | ohada |
| 5 | **O2** run 2 | AUDCG Livres 4 à 7 · fonds de commerce, intermédiaires | ~460 | ohada |
| 6 | **F7** run 1 | Procédures fiscales, Titre 1, première moitié | ~530 | fiscal |
| 7 | **F7** run 2 | Procédures fiscales, Titre 1, seconde moitié (dont l'art. 23) | ~530 | fiscal |
| 8 | **F5** run 1 | IRPP · loi n° 23/053, Titre 3 | ~600 | fiscal |
| 9 | **F5** run 2 | Les deux arrêtés de retenue (salaires, capitaux mobiliers) | ~600 | fiscal |
| 10-11 | **F12** | Le socle 2026 · sept arrêtés et `parametres-2026.md`, contre les constantes du code | 1 308 | fiscal |
| 12-13 | **R3** | AUDCIF Titre XI · NAEMA et NOPEMA | 1 493 | referentiels |
| 14-15 | **O3** | AUS · sûretés | 1 623 | ohada |
| 16-17 | **R6** | SYCEBNL Partie 4 · les trois jeux d'états et leurs notes | 1 715 | referentiels |
| 18-20 | **R2** | AUDCIF Titres IX et X · Système normal et SMT | 1 888 | referentiels |
| 21-23 | **F11** | Impôts réels et cédulaires | 1 987 | fiscal |
| 24-26 | **R5** | SYCEBNL Partie 2 · cadre comptable et plan des comptes | 2 203 | referentiels |
| 27-30 | **F8** | Procédures fiscales, Titres 2 et 3 · contrôle et recouvrement | 2 794 | fiscal |
| 31-34 | **O6** | AUSCOOP | 3 033 | ohada |
| 35-38 | **R1** | AUDCIF Titre VII · classes 1 à 9 | 3 296 | referentiels |
| 39-42 | **O5** | AUPCAP · procédures collectives | 3 341 | ohada |
| 43-46 | **O4** | AUPSRVE · recouvrement et voies d'exécution | 3 379 | ohada |
| 47-50 | **D1** | Loi n° 004/2001 et son appareil | 3 541 | referentiels |
| 51-57 | **D4** | Code du numérique · ordonnance-loi n° 23/10 du **13 mars 2023** | 5 425 | referentiels |
| 58-64 | **D2** | Droit du travail congolais + CNSS | 5 875 | referentiels |
| 65-72 | **D3** | ONEC | 6 622 | referentiels |
| 73-84 | **O1** | AUSCGIE, art. 1 à 920 | 10 359 | ohada |
| · | **F14** | Accises, TPI, recettes non fiscales · **BLOQUÉE** | 14 671 | fiscal |

Le découpage en runs des passes de plus de 1 000 lignes se fait au début de
la passe, par chapitres entiers, en visant 450 à 600 lignes par run (le seuil
mesuré où un run tient sans perdre le conteneur).

---

## 3. Ce que chaque passe doit savoir en plus

- **R4** · le module consolidation existe (tranches 1 à 4c et états IFRS
  consolidés, CLAUDE.md). Vérifier d'abord ce qu'il AFFIRME : écarts
  d'acquisition, conversion, impôts différés, périmètre de l'art. 74 à 98.
- **O7** · peu de choses dans le logiciel. Attendu surtout des « rien à
  faire » motivés ; ne pas fabriquer de fonctionnalité pour chaque article.
- **O2** · le Livre 8 (vente) a déjà été lu pour le devis. Ne pas le
  reconfronter ; le RCCM et la tenue des Fichiers touchent l'identité du
  dossier et les mentions de l'AUSCGIE art. 17.
- **F7** · l'art. 23 (facturation) a déjà été ouvert par F1 · vérifier sans
  refaire. Échéances déclaratives : `retenues/jour-ouvrable.ts` porte le
  report de l'art. 110 bis, ne pas le réécrire.
- **F5** · la paie a été construite en P0 à P9 (CLAUDE.md). Passe de
  VÉRIFICATION d'abord : barème de l'art. 118 et son plafond, art. 119 à 125,
  arrondi de l'art. 150, régime de l'art. 121.
- **F12** · confronter chaque CONSTANTE du code à son arrêté, avec sa date
  d'effet. C'est la passe où une date fausse coûte le plus.
- **R3** · FAITE. Les cinq nomenclatures du Titre XI n'ont aucune place (aucun
  document ne les sert) ; seul le code d'activité de la NOTE 36, au format du
  Titre IX, entre dans l'identité du dossier et la liasse.
- **R6, R2, R5, R1** · les tables de correspondance ont leurs specs de
  balayage ; la passe cherche ce que ces specs ne gèlent pas (renvois de
  notes, rubriques, intitulés). Les fichiers engendrés se corrigent à la
  source, jamais à la main. R2 reprend de R3 la FICHE R2 de la liasse du
  Système normal, jamais produite · forme juridique codée là où
  `formeJuridiqueSyscohada` est univoque, pays du siège, régime fiscal,
  établissements et contrôle DÉCLARÉS, jamais présumés, tableau des
  activités sans ventilation déduite de la balance.
- **F11** · l'O.-L. n° 69/009 n'est abrogée que pour ses Titres III et IV
  (loi n° 23/053, art. 152) ; le Titre II survit. Ne rien « nettoyer ».
- **O6** · le rapport de l'art. 108 est servi. Le reste touche le rapport de
  gestion et les coopératives agricoles de forme civile (IS, art. 5, 2°).
- **O4, O5** · le module des relances s'arrête à la lettre ; le texte
  commence là. Distinguer ce qui relève d'un logiciel comptable de ce qui
  relève d'un avocat.
- **D1** · constitution, accord-cadre et exemption sont servis. Vérifier les
  articles cités à l'écran, notamment art. 35 à 45.
- **D4** · toujours citer « ordonnance-loi n° 23/10 du 13 mars 2023 » EN
  ENTIER, jamais le numéro seul, et geler la distinction avec le décret
  n° 23/10 du 3 mars 2023 dans les deux sens. La qualification par un
  juriste reste due.
- **D2** · la paie est construite ; passe de vérification (art. 7, 112, 114,
  139, 141, 212, 215) et CNSS (décret n° 18/041, loi n° 16/009).
- **D3** · ce que l'Ordre impose à un cabinet qui TIENT les comptes, et ce
  que le logiciel prétend à sa place (aucune opinion d'audit ne sort
  d'OmegaX).
- **O1** · porte la contradiction en attente d'arbitrage (jalon 16 contre
  documents obligatoires, art. 138). La soumettre à Manasse AVANT la passe.

---

## 4. Ce qui attend Manasse avant de lancer

1. **F14 · trancher le périmètre** (§ 9, point 0 du plan) · accises, taxe de
   promotion de l'industrie et recettes non fiscales concernent-elles les
   clients d'OmegaX ? Tant que ce n'est pas dit, la passe ne part pas.
2. **O1 · arbitrer la contradiction** jalon 16 / art. 138 avant la passe,
   sinon elle la redécouvrira.
3. **Le budget** · une session par ligne du tableau, soit environ 84 sessions
   et de l'ordre du milliard de jetons pour tout finir. Les dix premières
   sessions (R4, O7, O2, F7, F5) referment cinq passes pour environ 8 000
   lignes lues.
