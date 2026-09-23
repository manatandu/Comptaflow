# Héberger OmegaX en RDC · recherche du 2026-09-23

Question de Manasse : peut-on trouver un hébergeur fiable au Congo ?

> **À lire avec `code-du-numerique-et-omegax.md`** (2026-09-05), qui avait
> déjà lu l'art. 201, les dérogations de l'art. 202 et la dispense de
> déclaration de l'art. 189, 5°, et posé les trois issues (autorisation,
> art. 202, 2°, rapatriement). Le message de commit de cette note disait la
> question « posée par personne » : c'était faux, elle l'était depuis le
> 5 septembre, et je ne l'avais pas cherchée avant d'écrire. Ce document-ci
> apporte deux choses nouvelles · QUI délivre aujourd'hui l'autorisation
> (l'ARPTC, à titre transitoire), et CE QUI EXISTE à Kinshasa pour la
> troisième issue.

## 1. Pourquoi la question n'est pas seulement technique

**Ordonnance-loi n° 23/010 du 13 mars 2023 portant Code du numérique, art. 201**
(corpus `droit-numerique-ua-rdc-corpus`, partie 2, page source 86, extrait du
PDF natif le 05/09/2026, sans passage par un OCR) :

> « Les données personnelles sont stockées et/ou hébergées en République
> Démocratique du Congo.
> Toutefois, pour des besoins de souveraineté numérique et de sécurité, les
> données à caractère personnel peuvent être transférées vers une ambassade
> digitale, un hébergeur se trouvant dans un État tiers ou une organisation
> internationale lorsque l'Autorité de protection des données constate que
> l'État ou l'Organisation Internationale en question assure un niveau de
> protection adéquat et suffisant […]
> Avant tout transfert effectif de données à caractère personnel vers un État
> tiers ou une organisation internationale, le responsable du traitement doit
> préalablement obtenir l'autorisation de l'Autorité de protection des données
> à caractère personnel. »

L'art. 202 prévoit des cas de transfert admis même sans niveau adéquat, dont le
consentement exprès de la personne concernée et la nécessité à l'exécution d'un
contrat. Ils ne sont pas analysés ici.

OmegaX traite des données personnelles : courriels des utilisateurs, registre
du personnel (date de naissance, rémunération), identité des tiers. Aujourd'hui
la base est chez Neon et le serveur sur Google Cloud Run, **hors de RDC**.

**L'autorité compétente.** Le Code prévoit une Autorité de protection des
données qui n'est pas encore créée. Depuis l'arrêté ministériel
n° CAB/MIN/PT&NTIC/AKIM/KL/Kbs/051/2024 du 17 août 2024, ses missions sont
exercées à titre transitoire par l'ARPTC (sources web ci-dessous, texte de
l'arrêté non lu).

**Ce que cela veut dire, sous réserve d'un juriste congolais :** soit héberger
en RDC, soit obtenir l'autorisation de transfert de l'ARPTC, soit s'appuyer sur
un cas de l'art. 202. Rester hors de RDC sans l'un des trois n'est pas une
option neutre.

> **Correction au passage.** `plan-ordonne-2026-09.md` dit du Code du numérique
> que « le corpus lu est un OCR non collationné, le numéro apparaît sous deux
> formes ». Le README du corpus dit l'inverse depuis le 05/09/2026 : extraction
> du PDF natif, sans erreur de reconnaissance. La réserve sur l'OCR est
> périmée ; celle sur la qualification par un juriste demeure.

## 2. Ce qui existe à Kinshasa

| Acteur | Ce que c'est | Certification annoncée | Ce qu'il vend |
|---|---|---|---|
| **OADC Texaf Digital** · Silikin Village, av. Colonel Mondjiba | Centre neutre, ~550 baies, 2 MW | Tier III Uptime Institute ; ISO 27001, 9001, 14001, 45001, 50001, PCI DSS listés | **Colocation**, interconnexion, peering. Accueille des fournisseurs cloud, n'en est pas un |
| **Raxio DRC1** · 12e rue, Limete industriel | ~400 baies, 1,5 MW, 30 M$ | Tier III Uptime Institute | **Colocation**. Cité dans un appel d'offres public 2026 pour un « cloud souverain » |
| **Liquid Intelligent Technologies** (Africa Data Centres) | Opérateur fibre et hébergement présent à Kinshasa | Tier III/IV et ISO dans d'autres pays du groupe | Hébergement et services cloud annoncés ; offre locale à confirmer |
| **Congo Hosting** | Hébergeur web et VPS | Aucune annoncée | VPS de 25 000 à 75 000 FCFA/mois, sauvegardes incluses. Son site liste Kinshasa, Brazzaville et New York **sans dire où tournent les serveurs** |
| **Cloudstore Africa, Africloud** | VPS « Afrique » | · | Serveurs à **Johannesburg** pour Africloud · ce n'est pas la RDC |

## 3. Ce qui manque, et c'est le point dur

**Aucune source trouvée ne décrit à Kinshasa un cloud géré équivalent à ce
qu'OmegaX utilise** : une base PostgreSQL gérée (sauvegardes, bascule, mises à
jour) et un service de conteneurs qui redémarre seul. Les deux centres Tier III
louent de l'espace et de l'électricité ; ce qu'on y installe, il faut
l'exploiter soi-même.

Concrètement, héberger en RDC aujourd'hui veut dire :

1. **Louer des serveurs** en colocation chez OADC ou Raxio, ou des machines
   virtuelles chez un revendeur qui y est installé ;
2. **Exploiter soi-même** PostgreSQL (réplication, sauvegardes, correctifs) et
   le serveur d'application ;
3. **Garder hors de RDC ce qui peut l'être** sans donnée personnelle, par
   exemple le site statique du client.

Le chiffrement des sauvegardes (`age`, voir `sauvegardes-et-restauration.md`)
et la restauration éprouvée chaque nuit sont déjà écrits pour ne dépendre
d'aucun fournisseur · ils se transportent.

## 4. Questions à poser aux hébergeurs, dans cet ordre

1. Les serveurs sont-ils **physiquement en RDC**, et dans quel centre ?
2. Proposez-vous des **machines virtuelles** (pas seulement de la colocation) ?
3. Une **base PostgreSQL gérée**, ou seulement des machines nues ?
4. Quelle **alimentation de secours** et quelle **double connectivité**
   (fibre terrestre et câble sous-marin) ?
5. Quel **engagement de disponibilité** écrit, et quelle pénalité ?
6. Une **sauvegarde hors site**, et où ?
7. Pouvez-vous fournir une **attestation d'hébergement en RDC** à produire à
   l'ARPTC ?

## 5. Ce qui n'a pas pu être vérifié d'ici

Les sites d'Infoset, d'OADC et de Congo Hosting sont bloqués par le proxy de cet
environnement, ou n'ont pas répondu. Aucun tarif de colocation n'a été
trouvé. L'arrêté du 17 août 2024 n'a pas été lu.

## Sources

- [OADC launches data center in DR Congo · DCD](https://www.datacenterdynamics.com/en/news/oadc-launches-data-center-in-dr-congo/)
- [DRC's first Tier 3 data center is live · Connecting Africa](https://www.connectingafrica.com/data-centers/drc-s-first-tier-3-data-center-is-live)
- [Open Access Data Centers: Kinshasa (DRC 1)](https://www.datacenters.com/open-access-kinshasa-drc-1)
- [Raxio inaugurates $30M DRC data center](https://www.connectingafrica.com/data-centers/raxio-inaugurates-30m-drc-data-center)
- [Fourniture d'équipements de data center, cloud souverain · Congo Quotidien](https://www.congoquotidien.com/2026/04/05/actualite-rdc-fourniture-equipements-data-center-ptn/)
- [Liquid Intelligent Technologies · RDC](https://liquid.tech/local-offices/country/drc/)
- [Congo Hosting · VPS](https://www.congohosting.com/hebergement-vps-congo/)
- [Africloud · VPS Congo, Johannesburg](https://africloud.com/cg)
- [ARPTC investie des missions de l'Autorité de protection des données · Droit-Numérique.cd](https://droitnumerique.cd/arptic-arptc-investie-des-missions-de-lautorite-de-protection-des-donnees-en-rd-congo/)
- [Autorité de protection des données · Droit-Numérique.cd](https://droitnumerique.cd/autorite-de-protection-des-donnees/)
