# § 8 · Sécurité

> Détail déplacé de CLAUDE.md (jusque-là chargé à chaque session). Les règles JAMAIS de CLAUDE.md priment ; lire ce fichier quand on touche au sujet.

## 8. Sécurité

- Session en **cookie httpOnly** `__session` + jeton CSRF apparié rejoué
  en en-tête `X-CSRF-Token`. Le jeton de session n'est jamais exposé au
  JavaScript. **L'API EST SERVIE SOUS L'ADRESSE DU SITE** (2026-09-26) ·
  Firebase Hosting relaie `oomega.web.app/api/**` vers Cloud Run
  (`client/firebase.json`), le serveur retire le préfixe
  (`retirerPrefixeApi`). Sans cela le cookie était TIERS, et tous les
  navigateurs de l'iPhone le jettent · la connexion « réussissait » et la
  session était perdue aussitôt. Le nom `__session` est imposé par Firebase,
  qui retire tout autre cookie des requêtes relayées · ne pas le renommer.
  **UNE SESSION PERDUE SE RECONNAÎT** (audit final F164) · `JwtAuthGuard`
  rend un 401 en français marqué `session: 'perdue'`, que l'interface lit
  (`lib/session-perdue.ts`) pour fermer la session et ramener à la connexion
  avec le motif. Un 401 sans ce drapeau (mot de passe actuel faux) ne
  déconnecte personne.
- **L'ADRESSE DU CLIENT EST `requete.ip`, ET RIEN D'AUTRE** (audit final
  F160). La tête de `X-Forwarded-For` s'écrit par le client. Le nombre de
  relais de confiance vient de `common/sauts-de-confiance.ts` · DEUX en ligne
  (Firebase Hosting, puis Cloud Run), AUCUN sur site, `SAUTS_PROXY_CONFIANCE`
  prime. Avec un seul, le journal d'audit et la limitation de débit voyaient
  l'adresse du relais Firebase pour tout le monde. Un appel direct à
  `*.run.app` reste possible, et se ferme dans l'infrastructure.
- **Auto-inscription fermée** · `POST /auth/register` refuse sauf si
  `INSCRIPTION_PUBLIQUE=true`. Un dossier naît depuis la console VMG ou par le
  siège d'un groupe. `AuthService.register` reste le pipeline commun de toutes
  les créations : ne pas en écrire un second.
- `estOperateurPlateforme` n'apparaît dans **aucun** DTO. Il s'accorde au
  démarrage depuis `OPERATEURS_PLATEFORME`, en accord seulement, jamais en
  retrait.
  **Par égalité EXACTE** sur l'adresse normalisée (2026-09-27, audit final
  F43) · la recherche insensible à la casse promouvait tout compte
  « ADMIN@… » de n'importe quel dossier. Toute adresse de COMPTE est
  normalisée à la porte (`@CourrielNormalise`) et dans les services
  (`normaliserCourriel`), et la base refuse le reste (contrainte
  `users_email_normalise`).
- Mot de passe transmis par un tiers (console, siège, admin du dossier) :
  `doitChangerMotDePasse` force le changement à la première connexion, et
  `MotDePasseAChangerGuard` FERME le serveur jusque-là · trois routes de
  sortie seulement, marquées `@SortieMotDePasseProvisoire()`, liste figée par
  `cycle-de-vie-acces.spec.ts`, lue sur la MÉTADONNÉE que la garde lit, route
  par route et jamais sur une distance dans la source ; aucun autre fichier du
  serveur ne nomme le décorateur ni sa clé. Le client seul ne suffisait pas.
  **LA GARDE EST APPELÉE PAR `JwtAuthGuard`, JAMAIS EN GARDE GLOBALE.** Nest exécute les gardes globales
  AVANT celles du contrôleur, donc avant que `JwtAuthGuard` ne pose
  `request.user` · posée en `APP_GUARD` de la phase 1a au 2026-09-24, elle
  lisait un utilisateur absent et ne refusait RIEN en production, sous des
  tests verts qui l'appelaient à la main avec un utilisateur déjà posé. Vu en
  montant un serveur Nest réel. **Tout contrôle qui a besoin de l'utilisateur
  vit dans `JwtAuthGuard`** (ou une garde de contrôleur après lui), et
  `roles-cantonnes.spec.ts` fige à la fois le fait (une garde globale laisse
  passer) et la règle (aucune `APP_GUARD` hors `ThrottlerGuard`).
- **Cinq rôles** (`common/guards/roles-cantonnes.ts`, décision du
  2026-09-24). Les trois d'origine, plus deux CANTONNÉS, et leurs défauts sont
  INVERSES. L'AIDE-COMPTABLE hérite du comptable et de la lecture seule
  partout où une route ne le refuse pas (`@ReserveAuComptable()` · valider,
  corriger, affecter, liasse du groupe, passer la paie au journal) et le
  personnel lui est fermé. Le GESTIONNAIRE DE PAIE n'a RIEN tant qu'une route
  ne l'ouvre pas (`@AccesRolesCantonnes({ gestionnairePaie: true })` · le
  personnel, se voir, tenir son propre compte (mot de passe, adresse, double
  authentification, sessions), lister les exercices, et depuis F247 lire les
  devises et coter le cours de l'USD du jour de Kinshasa
  (`motifRefusCotationGestionnairePaie`), en CRÉATION seule, un cours déjà
  coté refusé en 409 et jamais réécrit (`ajouterCours`) · une liste FERMÉE, que
  `roles-cantonnes.spec.ts` gèle route par route et fichier par fichier) · un
  défaut ouvert lui aurait donné tout le grand livre, la plupart des lectures
  ne portant aucun `@Roles`. Aucun `@Roles` existant ne nomme ces rôles : ils
  se lisent comme le COMPTABLE ou la LECTURE SEULE qu'ils remplacent, là où la
  route le leur permet. Côté écran, `peutValider` (admin, comptable) est
  distinct de `peutEcrire` (qui inclut les deux rôles cantonnés).
- **Révocation de session** · `User.sessionsInvalidesAvant`. Tout jeton
  AUTHENTIFIÉ avant cet instant est refusé par `JwtStrategy`. Posé au
  changement de mot de passe et d'adresse, à la réinitialisation, à la
  désactivation, au changement de rôle, de profil de fonctions ou de journaux
  autorisés, à l'activation et au retrait de la double authentification, par
  « Fermer toutes mes sessions » et par « Déconnecter mes autres appareils » ·
  sans cela un mot de passe volé restait utile jusqu'à l'échéance du jeton. La
  comparaison porte sur la dernière authentification explicite (claim
  `authentification` · la connexion, ou la réémission qui suit un acte
  présentant le mot de passe ou le code), que la prolongation d'une session
  longue RECOPIE · sans quoi un jeton prolongé dans la seconde d'une
  révocation lui échappait (audit final F270). Un jeton plus ancien retombe
  sur son `iat`. Elle tronque à la SECONDE · sans quoi le titulaire est
  éjecté par son propre geste.
- **« Rester connecté sur cet appareil »** (`src/modules/auth/session-longue.ts`,
  audit final F270, décision de Manasse). La case est DÉCOCHÉE par défaut.
  Décochée · cookie DE SESSION, sans `maxAge` ni `expires`, fermé avec le
  navigateur, et jeton de huit heures (`JWT_EXPIRES_IN`) ; une réémission
  garde son échéance. Cochée · trente jours au plus depuis la connexion
  d'ORIGINE (claim `origine`, que toute réémission recopie) et sept jours sans
  usage · `JwtStrategy` prolonge à l'usage, au plus une fois par jour, jeton
  CSRF recopié, et `JwtAuthGuard` ne pose le cookie prolongé qu'une fois la
  requête admise. UNE seule écriture de la charge (`emettreSession`), UNE
  seule pose du cookie (`poserCookieSession`). JAMAIS POUR LA CONSOLE · la
  session d'un opérateur s'ouvre courte, et `JwtStrategy` refuse un jeton long
  à un compte promu opérateur après coup. `/auth/me` rend le jeton CSRF de la
  session en cours, le stockage local de l'écran pouvant disparaître avant le
  cookie. « Déconnecter mes autres appareils » (`POST
  /auth/deconnecter-autres-appareils`) exige le mot de passe actuel, ferme
  toutes les sessions et repose aussitôt celle de l'appareil, qui garde son
  régime · ce n'est PAS une sortie de mot de passe provisoire. Les routes qui
  éprouvent un secret portent `@Throttle` (vingt par minute) et
  `JwtAuthGuard`, gelés route par route par `session-longue.spec.ts`. Une
  session demandée longue et ouverte courte le dit à l'écran
  (`motifSessionCourte`, `lib/connexion.ts`), et la déconnexion attend
  `POST /auth/logout` avant qu'une connexion reparte (`lib/deconnexion.ts`).
- **Double authentification** (`src/modules/auth/double-authentification.ts`,
  2026-09-26) · TOTP, RFC 6238, écrit ici et figé par les vecteurs des RFC,
  vérifiable hors ligne donc aussi sur site. OUVERTE À TOUS, EXIGÉE POUR LA
  CONSOLE (`OperateurPlateformeGuard`, relu par `JwtStrategy`) · l'exiger de
  chaque administrateur fermerait des cabinets entiers le jour du déploiement.
  Quatre règles. (1) Le mot de passe seul ne rend AUCUNE session, seulement
  `deuxiemeFacteurRequis` · le mot de passe est redemandé avec le code, aucun
  état intermédiaire n'est gardé. (2) Un code faux compte comme un mot de
  passe faux (verrou), et un code ne resert pas (`dernierPasDoubleAuth`, un
  pas de trente secondes de part et d'autre). (3) Huit codes de secours,
  montrés UNE fois, gardés en empreinte, chacun à usage unique · activer ferme
  les autres sessions, retirer exige mot de passe ET code. (4) Une
  RÉINITIALISATION de mot de passe (administrateur du dossier, opérateur) lève
  aussi le second facteur (`SANS_DOUBLE_AUTH`) · celui qui réinitialise tient
  déjà l'entrée, et un téléphone perdu avec ses codes fermerait le compte pour
  de bon. Secret, pas et empreintes n'entrent ni au journal d'audit ni à la
  restitution ; la date d'activation, si.
- **Le dernier administrateur actif ne se retire pas** (audit final F157) ·
  rétrogradé ou désactivé, il laissait un dossier que personne ne gère, et
  la console, qui ne réinitialise que les administrateurs, ne le rattrapait
  pas. Décompte et écriture se font sous un verrou par dossier, dans la
  transaction.
- **Verrouillage par compte** temporaire (`src/modules/auth/verrouillage.ts`),
  vérifié APRÈS bcrypt depuis le 2026-09-28 (audit final F238) · un verrou
  qui répondait sans hachage se reconnaissait à sa rapidité. Une adresse
  INCONNUE compare le mot de passe à une empreinte factice du même coût
  (`EMPREINTE_FACTICE`), et adresse inconnue, mot de passe faux et compte
  verrouillé rendent le MÊME message (`MOTIF_IDENTIFIANTS_INVALIDES`). Le bon
  mot de passe pendant le verrou est refusé comme un faux, et un essai pendant
  le verrou ne le prolonge pas. Jamais définitif : un verrou définitif se
  retourne en refus de service.
  **LE COMPTEUR S'OUBLIE DOUZE HEURES APRÈS LE DERNIER ÉCHEC, JAMAIS À
  L'ÉCHÉANCE DU VERROU** (2026-09-28, décision de Manasse). Il repartait de
  zéro dès qu'un verrou expirait · l'attaquant qui attendait chaque échéance
  restait au palier d'une minute, environ sept mille essais par jour et par
  compte, et les paliers (1, 5, 15, 30, 60 minutes) ne jouaient jamais. Il
  tombe dans trois cas seulement · une connexion réussie (NIST SP 800-63B-4,
  Rate Limiting, « SHOULD disregard any previous failed attempts »), un mot de
  passe changé ou réinitialisé ou un déverrouillage par l'administrateur, et le
  délai d'oubli compté depuis le dernier échec (`User.dernierEchecLe`,
  `DELAI_OUBLI_ECHECS_HEURES`), valeur par défaut du « Failure Reset Time » de
  Keycloak, qui exige qu'il dépasse le verrou le plus long, sinon le plafond
  n'est jamais atteint (`verrouillage.spec.ts` le tient et rejoue l'attaquant
  patient). Une seule remise à zéro (`DECOMPTE_REMIS_A_ZERO`), un seul
  décompte (`decompteApresEchec`).
- **ACTIVER LE SECOND FACTEUR EXIGE LE MOT DE PASSE, ET LE TITULAIRE EST AVERTI
  HORS DE LA SESSION** (2026-09-28, décision de Manasse). OWASP ASVS 5.0,
  exigence 7.5.1 (« full re-authentication » avant de modifier la
  configuration du second facteur), NIST SP 800-63B-4 (un authentificateur ne
  se lie qu'après authentification). Une session « Rester connecté » peut
  dater de trente jours · volée, elle installerait SA propre application et
  fermerait la porte au titulaire. L'activation et la régénération des codes
  de secours (le « sudo mode » de GitHub) prennent `motDePasseActuel`, vérifié
  par bcrypt AVANT le code, même refus que le retrait, sans compter au verrou.
  Activer, retirer ou renouveler les codes met en file un courriel au
  titulaire, sans aucun secret (`avis-double-authentification.ts`) · un échec
  de mise en file ne défait jamais l'acte. `AuthModule` importe
  `CourrierModule`, un test le fige.
- Toute requête est filtrée par `tenantId`. Une requête Prisma sans `tenantId`
  sur une table multi-locataire est un défaut de cloisonnement. Ce n'est plus
  seulement une règle de discipline : `src/common/cloisonnement/` porte une
  extension Prisma qui REFUSE une collection non bornée, refuse d'écrire sur
  la ligne d'un autre dossier, et rend inexistante la ligne lue d'un autre
  dossier. Elle ne réécrit jamais une requête · réécrire masquerait le défaut.
  La borne se vérifie par sa VALEUR, pas par sa présence · jusqu'au 2026-09-17,
  `filtreBorne` rendait `true` dès qu'un `tenantId` figurait au filtre, quel
  qu'en soit le dossier. Ce n'était pas seulement une collection servie de
  travers : les règles A et B se court-circuitent sur cette fonction, si bien
  qu'un `tenantId` étranger DÉSACTIVAIT la garde au lieu de la déclencher.
  `{ tenantId: { not: null } }` et `{ OR: [{ tenantId: d }, {}] }` passaient
  pour des bornes. LA LIGNE OBTENUE SE VÉRIFIE COMME LA LIGNE VISÉE
  (2026-09-28, audit final F240) · une mise à jour dont les données
  porteraient la ligne dans un autre dossier est refusée, et une forme qui
  touche au dossier sans le nommer lisiblement l'est aussi. Toute table
  cloisonnée porte un index qui commence par `tenantId` (F261,
  `index-du-dossier.spec.ts`) · sans lui, chaque lecture bornée balaie la
  table de tous les cabinets.
  Deux échappatoires, et deux seulement :
  `horsCloisonnement('raison', ...)`, qui sort TOTALEMENT de la garde et dont
  la liste des utilisateurs est gelée par un test ; et
  `perimetreDeGroupe([...], ...)`, qui ne sort de rien · la garde continue de
  tourner et accepte, en plus du dossier de la session, les dossiers NOMMÉS.
  C'est par elle que le siège d'un groupe lit ses cellules. La liste est
  toujours construite à partir du seul dossier de la session, jamais reçue
  d'un appelant · sans quoi le client nommerait ses propres voisins.
- **Monnaie de tenue** (`src/common/monnaie-de-tenue.ts`) · elle ne se
  choisit pas. Loi n° 23/053 art. 141, 1° (« Cette comptabilité est exprimée
  en Franc congolais ») et AUDCIF art. 17, 1° (« l'unité monétaire ayant cours
  légal dans l'État partie »), sans option ni dérogation. `Tenant.devise` ne
  convertissait rien · elle ÉTIQUETAIT le cartouche (« montants en X »), si
  bien qu'un dossier basculé en USD imprimait une unité fausse sur sa liasse
  entière. Le champ n'est plus dans aucun DTO et n'est écrit par aucun
  service · un test le vérifie. `Tenant.deviseFonctionnelle` nomme la monnaie
  où l'entité vit réellement et commande un SECOND jeu de documents, à côté du
  jeu légal et sans valeur légale · aucun texte lu ne le régit, c'est une
  décision d'OmegaX et le document doit le dire.
- **Restitution du dossier** (`src/modules/exports/restitution/`) · une
  archive ZIP d'un CSV par table, sur son PROPRE contrôleur, sans
  `LicenceGuard` : derrière lui elle serait indisponible dans le seul cas où
  elle sert. L'extracteur ne construit jamais son `where` · les modèles
  portés par leur parent échappent à la garde de cloisonnement, et un filtre
  écrit à la main les rendrait pour tous les cabinets. Il le demande à
  `borneDuModele`, et le spec vérifie chaque borne avec `filtreBorne`. Le
  manifeste écrit les cinq réserves plutôt que de les taire (voir
  docs/restitution-du-dossier.md) · une archive qui se présente pour plus
  qu'elle ne vaut est plus dangereuse que pas d'archive. UNE TABLE ILLISIBLE
  ARRÊTE L'ARCHIVE (2026-09-27, audit final F96) · l'échec est consigné et la
  sortie DÉTRUITE, jamais une restitution amputée qui se dirait complète ; une
  PIÈCE illisible, elle, est nommée dans `controles.txt`. Les documents des
  tiers sont archivés dans `documents-tiers/` et le manifeste le dit (F97).
- **Journal d'audit** (`src/common/audit/`) · posé sur le client Prisma par
  une extension, pas par des appels dans les services : un contrôle qu'on peut
  oublier d'appeler n'est pas un contrôle. Il couvre les modèles de
  `MODELES_AUDITES` (accès, configuration, actes d'exercice) et jamais les
  lignes engendrées en masse. Chaque événement porte l'empreinte du précédent
  (chaîne par dossier) · c'est ce qui rend une retouche visible, AUDCIF
  art. 22, 5° et 6°. Deux règles à ne pas défaire : aucune route d'écriture
  sur `/journal-audit`, et aucun champ sensible recopié. Le filtre de l'écran
  est SERVI (`GET /journal-audit/objets`, `libelles-objets-audites.ts`), un
  libellé par modèle de `MODELES_AUDITES` et un test qui l'y tient exact
  (audit final F182) · la table recopiée à l'écran en couvrait vingt-six. Le masquage a DEUX
  moitiés · une heuristique sur le NOM (`FRAGMENTS_SENSIBLES`), qui n'attrape
  que ce qui s'annonce, et une liste FERMÉE par colonne
  (`COLONNES_EXCLUES_PAR_MODELE`) pour ce qui ne s'annonce pas. La seconde est
  née de `User.estOperateurPlateforme`, dont le schéma dit « jamais renvoyé
  par /utilisateurs » et que le journal rendait pourtant en clair à tout
  utilisateur du dossier. Un test tient la liste fermée · une colonne ajoutée
  à `User` le fait tomber tant qu'elle n'est pas classée. (`masquer()` remplace
  mot de passe, jeton et secret par un marqueur). **LA CRÉATION D'UN DOSSIER
  SE JOURNALISE DANS SA TRANSACTION** (2026-09-26, `journaliserDansTransaction`)
  · écrit par la connexion à part, chaque maillon désignait un dossier que
  cette connexion ne voyait pas encore, et la clé étrangère le refusait : aucune
  création de dossier n'était journalisée. Le dossier est sa propre chaîne (sa
  création en est le rang 1), et `register` sème AU NOM du dossier qui naît ·
  depuis la console, la garde de cloisonnement tenait sinon le semis pour une
  écriture chez un voisin, et la création d'un cabinet échouait (reproduit sur
  une base réelle avant correction). **TOUTE TRANSACTION PASSE PAR
  `transactionJournalisee`** (`common/audit/transaction-journalisee.ts`, audit
  final F159) · écrit par la connexion à part, le maillon d'un acte annulé
  survivait, et chaque écriture auditée prenait une seconde connexion pendant
  que la transaction tenait la première. Un test de source refuse un
  `$transaction(` écrit ailleurs, forme TABLEAU comprise (elle n'a pas de
  contexte asynchrone).

- **Le dossier de l'éditeur ne se coupe jamais** · `TypeLicence.PROPRIETAIRE`.
  C'est un verrou de sûreté avant d'être une formule commerciale : VMG
  Consulting possède le logiciel, ne paie rien, et c'est depuis SON dossier que
  les licences des autres se rouvrent. Un dossier d'éditeur coupé, par une
  échéance ou par une suspension posée par mégarde, verrouille l'opérateur hors
  de la console qui sert à déverrouiller · panne sans issue, silencieuse
  jusqu'à la première connexion refusée, et dont le motif (« Abonnement
  expiré ») serait techniquement exact.
  Trois règles à ne pas défaire. Le court-circuit de `LicenceService` passe
  AVANT le test de suspension, sans quoi il serait exact et inutile dans le seul
  cas qui compte. `PlateformeService.modifierLicence` refuse de toucher à cette
  licence, et refuse aussi d'attribuer ce type · le retrait du type est le seul
  geste que le court-circuit ne peut pas absorber, puisqu'il le retire. Et le
  type se pose par un geste NOMMÉ (`designerDossierEditeur`), une fois, tous
  cabinets confondus · pas par un choix dans une liste déroulante à côté
  d'« Abonnement ». Aucune porte de création ne le donne · `register`, pipeline
  commun de la console, du siège et de l'inscription, le refuse avant toute
  écriture (audit final F161).

