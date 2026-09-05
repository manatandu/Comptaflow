# Le Code du numérique congolais et OmegaX

Ordonnance-loi **n° 23/10 du 13 mars 2023** portant Code du numérique, Livre III
(contenus numériques), titre relatif à la protection des données à caractère
personnel. Lecture faite le 2026-09-05 sur le texte intégral, 172 pages,
extraction depuis un PDF natif · la réserve « OCR non collationné » du relevé
du 2026-09-03 ne tient plus, et le numéro du texte est confirmé.

## 1. Une bonne nouvelle que personne n'avait relevée

**Article 189, 5°** · « Sont dispensés des formalités de déclaration
préalable : […] **le traitement des données à caractère personnel mis en œuvre
par les organismes et entreprises publics ou privés pour la tenue de leur
comptabilité générale**. »

C'est exactement l'usage que vos clients font d'OmegaX. Un cabinet ou une ASBL
qui tient sa comptabilité **n'a aucune déclaration à faire** auprès de
l'Autorité de protection des données pour ce traitement-là.

Le principe, lui, est bien la déclaration · **art. 186**, tout traitement y est
soumis, avec récépissé, et le silence de l'Autorité au-delà de trente jours
vaut acceptation. Certains traitements vont plus loin et demandent une
**autorisation préalable** (art. 187 · données génétiques, médicales, recherche
scientifique dans ces domaines, entre autres). Rien de cela ne concerne la
comptabilité.

**Art. 189, 4°** dispense aussi le responsable qui a désigné un délégué à la
protection des données · **sauf lorsqu'un transfert vers un pays tiers est
envisagé**. Ce qui nous ramène au point dur.

## 2. Le point dur · l'hébergement hors RDC

**Article 201, alinéa 1**, sans détour · « **Les données personnelles sont
stockées et/ou hébergées en République Démocratique du Congo.** »

L'alinéa 2 ouvre la porte : le transfert vers « une ambassade digitale, un
hébergeur se trouvant dans un État tiers ou une organisation internationale »
est possible **lorsque l'Autorité de protection des données constate** que cet
État assure un niveau de protection adéquat et suffisant.

Et l'avant-dernier alinéa la referme à demi · « **Avant tout transfert
effectif** de données à caractère personnel vers un État tiers […] le
responsable du traitement doit **préalablement obtenir l'autorisation de
l'Autorité de protection des données** ». Le transfert fait ensuite « l'objet
d'un contrôle régulier ».

**Où en est OmegaX.** La base PostgreSQL est chez Neon, le serveur sur Google
Cloud Run en région us-east1. Les données sont donc hébergées hors RDC, et
aucune autorisation de l'Autorité n'a été demandée ni obtenue.

**Article 202** prévoit les cas où le transfert reste possible vers un État
n'assurant pas un niveau adéquat. Le plus proche de la situation d'un logiciel
en abonnement est le **2°** · « le transfert est nécessaire à l'exécution d'un
contrat entre la personne concernée et le responsable du traitement ». Le 1°
(consentement exprès après information des risques) peut s'y ajouter.

**Ce que je ne tranche pas, et qui vous revient.** Ces dérogations de l'art. 202
dispensent-elles de l'autorisation préalable de l'art. 201, ou s'y
ajoutent-elles ? Le texte ne le dit pas explicitement, et la réponse commande
la conduite à tenir. Deux autres faits manquent et ne se lisent pas d'ici ·
l'Autorité de protection des données est-elle installée et délivre-t-elle des
autorisations, et les États-Unis figurent-ils sur une liste d'adéquation
congolaise. **C'est le seul point de ce document qui demande un juriste.**

Les issues, par ordre de coût croissant : demander l'autorisation de
l'art. 201 ; s'appuyer sur l'art. 202, 2° en le documentant dans le contrat de
licence ; rapatrier l'hébergement en RDC.

## 3. La notification des violations · une obligation qu'OmegaX ne peut pas tenir aujourd'hui

**Article 244** · « Le responsable du traitement doit notifier, **sans délai**,
à l'Autorité de protection des données **et à la personne concernée** toute
violation des données à caractère personnel ayant affecté les données à
caractère personnel de la personne concernée. Le sous-traitant doit avertir,
sans délai, le responsable du traitement de toute rupture de la sécurité ayant
affecté les données à caractère personnel qu'il traite pour le compte et au nom
du responsable du traitement. »

Deux obstacles concrets, tous deux vérifiés dans le dépôt :

- **OmegaX n'envoie aucun courriel** tant que `SMTP_HOST` n'est pas posé · le
  transport refuse d'expédier. Une notification « sans délai » ne partirait
  donc pas.
- **Aucune procédure de notification n'est écrite** · ni destinataire, ni
  délai interne, ni modèle de message.

Ce n'est pas un développement lourd : c'est une page du manuel des procédures
et deux variables d'environnement. Mais tant que ce n'est pas fait, l'art. 244
ne peut pas être respecté.

## 4. Ce qui est déjà en règle

- **Minimisation** (art. 243) · le journal d'audit masque les champs sensibles
  par une heuristique de nom ET par une liste fermée par colonne, et l'archive
  de restitution ne recopie ni `motDePasse` ni `estOperateurPlateforme`.
- **Droit d'accès et de portabilité** (art. 6 de la politique) · la restitution
  complète du dossier existe et sort en un fichier, sans passer par une demande.
- **Sécurité** · chiffrement en transit, cloisonnement vérifié par le moteur,
  mots de passe jamais en clair, révocation de session immédiate, sauvegarde
  chiffrée quotidienne.

## 5. Ce que la page publique dit, et ce qu'elle ne dit pas

La politique de confidentialité énonce l'hébergement hors RDC et la base légale
invoquée. Elle **ne dit pas** que l'autorisation de l'art. 201 n'a pas été
obtenue · publier un aveu de non-conformité sur une page publique est une
décision de VMG, pas un geste de développement, et elle se prend après l'avis
du juriste, pas avant.
