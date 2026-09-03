# Ce qui attend une action de Manasse, et ce que ça bloque

Établi le 2026-09-03. **Chaque point a été rouvert dans le code ou dans un
journal d'exécution ce jour-là**, pas recopié d'un plan antérieur · deux
d'entre eux se sont d'ailleurs révélés plus graves que ce que le plan en
disait, et un troisième était déjà réglé.

Aucun développement ne débloque cette liste. Elle est classée par ce que
l'inaction coûte, pas par la difficulté du geste.

---

## 1. Ce qui casse une vente le jour où elle se fait

### La licence « Perpétuelle (sur site) » est vendable et ne marche pas

**Constat, vérifié.** `PlateformePage.tsx` propose le type
`PERPETUEL_ONPREMISE` dans la liste déroulante de la console. Et
`LicenceService.verifier()` refuse ce type tant que `dernierHeartbeatAt` est
antérieur au délai de grâce · or `enregistrerHeartbeat()` **n'a aucun
appelant dans tout le dépôt**, et le champ vaut `null` à la création. Un
dossier vendu sous cette licence est donc **coupé à sa toute première
requête**.

**Ce que ça bloque.** Une vente, et de la pire manière : le client paie, se
connecte, et rien ne s'ouvre.

**Ce qui est attendu de vous.** Un arbitrage, pas un geste technique · ce
type de licence fait-il partie de l'offre ?

- **Non** · je retire l'option de la console en dix minutes. C'est le choix
  que je recommande tant qu'aucun client ne l'a demandée.
- **Oui** · il faut construire le heartbeat (route côté serveur, appel
  périodique côté installation, et la décision du délai de grâce). Un ou deux
  jours, et ça n'a de sens que si une vente sur site est réellement en vue.

**En attendant : ne proposez pas cette licence.**

---

## 2. Ce qui coûte des données le jour où ça tourne mal

### Les sauvegardes ne vivent que 90 jours

**Constat, vérifié.** Sur l'exécution nocturne du 2026-09-03, les deux étapes
*S'authentifier sur Google Cloud* et *Copier vers Cloud Storage* sont
**SKIPPED** : la variable de dépôt `BUCKET_SAUVEGARDES` n'est pas posée. Tout
le reste est vert · l'export, la restauration d'épreuve, le chiffrement, la
vérification qu'aucun fichier en clair ne subsiste.

**Ce que ça bloque.** Rien aujourd'hui. Dans 91 jours, la plus ancienne
sauvegarde disparaît, et il n'existe plus aucune copie hors de GitHub. Un
cabinet qui découvre une erreur de saisie datant de quatre mois n'a plus rien
à restaurer.

**Ce qui est attendu de vous.** Trois gestes dans le compte Google, décrits
dans `docs/sauvegardes-et-restauration.md` : créer un bucket Cloud Storage,
autoriser le compte de service à y écrire, poser le nom du bucket en variable
de dépôt `BUCKET_SAUVEGARDES`. Le workflow s'en sert dès qu'elle existe, sans
que je touche à rien.

---

## 3. Ce qui laisse passer une erreur comptable

### Un dossier peut s'ouvrir en devise étrangère sans un mot

**Constat, vérifié.** L'écran des paramètres laisse choisir la devise du
dossier, modifiable tant qu'aucune écriture n'existe. Aucun avertissement, à
aucun endroit, sur l'article 141 de la loi n° 23/053.

**Ce que ça bloque.** Rien mécaniquement. Mais un dossier tenu en USD produit
des états dont la recevabilité dépend d'une règle que le logiciel ne dit pas.

**Ce qui est attendu de vous.** Un avis de praticien : dans quels cas la tenue
en devise est-elle admise, et que faut-il alors afficher ? Dès que la règle est
établie, je la pose en avertissement ou en refus, selon ce qu'elle dit.

### L'écriture qui tombe dans une période close est refusée, pas reportée

**Constat, vérifié.** `ecriture.service.ts` lève
`Impossible d'enregistrer une écriture sur un exercice clôturé`. L'AUDCIF
art. 22 prévoit autre chose : l'enregistrer **au premier jour de la période
ouverte**, avec mention distincte de sa date de valeur.

**Ce que ça bloque.** Une opération légitime, arrivée en retard, n'a aucun
chemin dans le logiciel. À ma lecture c'est un écart de conception, pas un
excès de rigueur · mais c'est votre métier, pas le mien.

**Ce qui est attendu de vous.** Confirmer la lecture. Si elle tient, je
construis le report avec sa mention.

### Mécénat · 4571 ou 475

Les deux comptes sont semés, le catalogue n'utilise que le **475** (le modèle
note lui-même que « le texte écrit 4751 · subdivision du 475 »). Arbitrage de
doctrine ouvert depuis l'audit d'août. **Ce que ça bloque :** rien, jusqu'au
jour où un réviseur demande pourquoi ce compte-là.

---

## 4. Ce qui demande un juriste, pas un développeur

- **Code du numérique congolais** · déclaration des traitements, autorisation
  de transfert hors RDC, notification des violations. Le corpus dont je
  dispose est un OCR non collationné et le numéro du texte apparaît sous deux
  formes selon les sources. **À faire qualifier avant tout usage**, et
  certainement avant d'écrire une politique de confidentialité.
- **Formulaire de déclaration DGI** · l'impôt est calculé, l'imprimé se
  remplit à la main faute d'en détenir le modèle officiel.
- **Forfait micro-entreprise** · la branche rend `null` : la contre-valeur du
  forfait en dollars dépend d'une circulaire de perception que le logiciel ne
  détient pas.

---

## 5. Ce qui n'est qu'un confort

- **Confirmation du régime de connexion dans les journaux Cloud Run** ·
  console Google Cloud → IAM → compte `github-deploy` → rôle « Lecteur de
  journaux ». Depuis le 2026-09-03 le déploiement affirme déjà le régime à
  l'envoi, ce qui suffit. **Ne bloque rien.**
- **Module groupe en SYSCOHADA** · le refus est posé aux deux portes, les
  moteurs existent. Ce n'est plus technique, c'est un arbitrage commercial.

---

## 6. Ce que je ne peux pas vérifier d'ici

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

- **Clé de chiffrement des sauvegardes** (`CLE_AGE_SAUVEGARDES`) · posée. La
  sauvegarde nocturne du 2026-09-03 est verte de bout en bout.
- **Endpoint Neon poolé** (`API_DATABASE_URL_POOLED`) · posé. Le déploiement
  du 2026-09-03 affiche « Base · endpoint POOLÉ, plafond de connexions 10 par
  instance ».
- **Limitation de débit par instance** · le compteur reste par conteneur,
  mais `--max-instances 4` borne désormais le dépassement à un facteur connu
  au lieu d'un facteur inconnu. Redis n'est plus une urgence.
