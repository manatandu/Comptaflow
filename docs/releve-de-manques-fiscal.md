# Relevé de manques fiscal · journal des passes F

Journal du bloc F de `docs/plan-confrontations.md`. Chaque passe dit ce qu'elle
a lu, contre quoi, et avec quel verdict. **Ce n'est pas une déclaration de
conformité** · c'est un relevé.

---

## Passe F1 · Décret n° 23/10 du 3 mars 2023 (2026-09-13)

**Texte.** Décret n° 23/10 du 3 mars 2023 portant réglementation de la facture
normalisée et fixation des modalités de mise en œuvre des dispositifs
électroniques fiscaux, art. 1 à 29, cinq chapitres. Source lue :
`fiscalite-rdc/code-general-2026/references/14-tva-arrete-dispositifs-electroniques-facture-normalisee.md`.

**Conduite.** Première passe menée en workflow d'agents, selon la méthode
arrêtée au § 4 bis du plan. Cinq lecteurs (un par chapitre, **sans accès au
code**), cinq confronteurs, puis un agent adverse par constat.

| | |
|---|---|
| Obligations extraites du texte | **57** (9, 10, 15, 19, 4 par chapitre) |
| Constats ABSENT ou PARTIEL | **30** |
| Réfutés par l'étape adverse | **25** |
| **Retenus** | **5** |
| Agents, jetons, durée | 40 · 4,36 M · 66 min |

Le taux de réfutation (83 %) est la mesure la plus utile de cette passe : sans
l'étape adverse, vingt-cinq faux manques seraient entrés au relevé, et
certains auraient été « corrigés ».

### Les cinq constats retenus, tous corrigés le jour même

**1 · L'ADRESSE EXACTE, art. 26 a) et b) · gravité FAUX.** Le texte écrit « les
nom, post-nom et prénom ou raison sociale, L'ADRESSE EXACTE, le numéro impôt du
vendeur ou prestataire », et de même pour le client. Le module avait été bâti
sur l'art. 100 du décret n° 011/42 de 2011, qui n'écrit que « identité et n°
impôt » · l'adresse n'était vérifiée nulle part.

Ce n'était pas un champ de moins : `verifierMentions` rendait `conforme: true`
sur une pièce qui omet une mention obligatoire, et l'écran l'affichait comme
conforme, sans amende, quand l'art. 97 bis en punit chaque omission de 750 000
FC pour une personne morale. **Le logiciel rassurait à tort sur exactement ce
qu'il a été construit pour surveiller.** Corrigé : `Facture.emetteurAdresse` et
`contrepartieAdresse`, recopiées à la date de la pièce comme le nom.

**2 · LE BORNAGE À L'ENTRÉE EN VIGUEUR, art. 29 · gravité CALENDRIER.** « Le
présent Décret […] entre en vigueur à la date de sa signature », soit le 3 mars
2023, sans vacatio legis. Le module l'appliquait à toute date. Une facture de
2022 reprise dans un dossier se voyait reprocher l'adresse exacte au nom d'un
décret qui n'existait pas encore, avec une amende chiffrée sur ce reproche.

Le dépôt connaissait sa propre doctrine et ne l'avait pas appliquée ici ·
`controles.service.ts` écrit « LE BORNAGE N'EST PAS UNE PRÉCAUTION, C'EST LE
CONTRÔLE LUI-MÊME ». Corrigé : `texteApplicable(dateFacture)` choisit les neuf
groupes de l'art. 100 avant le 3 mars 2023, les dix de l'art. 26 après, et
l'écran dit lequel il applique. L'art. 28 n'abroge que les dispositions
« contraires », et les neuf ne le sont pas · ils sont le noyau des douze.

**3 · L'ART. 25 RENDU EXCLUSIF · gravité INCOMPLET.** Le module écrivait « la
TVA n'est déductible QUE SI elle figure sur une facture normalisée ou un
document en tenant lieu ». Le texte dit « DE FAÇON GÉNÉRALE » pour ce cas, et
en nomme deux autres : la déclaration de mise à la consommation en cas
d'importation (2°), la facture à soi-même (3°). Un cabinet lisant cet écran
pouvait croire qu'une TVA d'importation portée au 445 n'ouvrait pas droit à
déduction · le logiciel l'aurait dissuadé d'une déduction que le texte lui
accorde. Corrigé : les trois supports sont rendus, avec ceux qu'OmegaX ne tient
pas.

**4 · LE VOLET IMPORTATION, NOMMÉ À MOITIÉ · gravité INCOMPLET.** La lacune
était déclarée, mais seulement au titre de l'imprimé de l'art. 134. Or la même
déclaration en douane est, par l'art. 25, 2°, LE SUPPORT de la déduction. Ne
nommer que l'imprimé laissait croire qu'il ne manquait qu'une ligne de tableau.

**5 · L'ARRÊTÉ DE L'ART. 25, SECONDE LACUNE HORS CORPUS · gravité INCOMPLET.**
C'est le constat le plus fin, et **la même faute que celle corrigée le matin
même, commise une seconde fois au paragraphe suivant**. Le module se range dans
la catégorie « document en tenant lieu » et en tire une DISPENSE des points k)
et l) de l'art. 26. Or c'est un arrêté qui définit cette catégorie (art. 25,
dernière phrase), et il n'est dans aucune source lue, exactement comme celui de
l'art. 23. La qualification est désormais écrite comme une HYPOTHÈSE.

**Anomalie du texte source, signalée et non tranchée** · dans la compilation
lue, cette phrase est typographiquement placée à l'intérieur du point 3 de
l'art. 25 (livraisons à soi-même), à l'indentation de continuation, alors
qu'elle définit un terme employé au point 1. Le scan ne permet pas de dire si
elle est un alinéa autonome. Ne pas la « corriger » sans le Journal officiel.

### Vérification

Chaque constat a été **relu à la source par la session principale** avant
correction · aucun n'est entré au code sur la foi du rapport d'un agent.
Quatre défauts réinjectés, quatre détectés, dont celui que F1 avait trouvé.
Serveur : 229 suites, 3 446 tests.

### Les vingt-cinq constats écartés, et pourquoi

Ils sont consignés parce qu'un manque écarté sans motif se rouvre à chaque
relecture.

| Article | Constat | Motif de la réfutation |
|---|---|---|
| art. 2 | Délimite le champ d'application : le Décret régit les transactions des personnes physiques ou m | Le constat tombe sur les trois angles. 1) L'ARTICLE 2 N'EST PAS UNE OBLIGATION, ET IL N'ÉNONCE AUCUN CRITÈRE. Lu verbatim (references/14-…-facture-normalisee.md, l. 21-25) : « Le présent Décret s'applique aux transactions effectué |
| art. 3, 3° | Définition opérante et commandante : une facture n'est « normalisée » que si elle est (a) trans | Le « manquant » repose sur un grep aveugle, sur une confusion entre l'article de définitions et l'article opérant, et sur une obligation qui ne pèse pas sur un SFE. Trois coups. 1) LE GREP A MANQUÉ SA CIBLE PAR LE VOCABULAIRE, PAS |
| art. 3, 4° | Définition opérante : la qualité de fournisseur de SFE suppose deux éléments · un acte de conce | RÉFUTÉ sur les trois angles. 1) CE N'EST PAS UNE OBLIGATION, C'EST UNE ENTRÉE DE DICTIONNAIRE. Le point 4° est dans « CHAPITRE 2 : DES DEFINITIONS » (14-tva-...md:33) et s'ouvre verbatim par « Article 3 : Au sens du présent Décret |
| art. 3, 7° | Définition qui porte une obligation expresse : un SFE ne peut émettre une facture normalisée qu | REFUTÉ · la preuve centrale du constat est fausse : l'écran ne se limite pas aux quatre champs qu'il lui prête, et il porte la seconde condition, dans le terme générique du décret lui-même, deux fois de plus. 1) L'OBLIGATION EXIST |
| art. 4 (alinéa 2) | Classification fermée en deux formes seulement : « Les dispositifs électroniques fiscaux existe | REFUTE SUR LES TROIS ANGLES. Tout ce qui suit a ete lu a l'instant dans /root/.claude/skills/synced/80921ba8-2ca0-4a8a-b7c1-4d4972fcb762_a1cd7539-5871-4b3d-820b-8de8737ca38b/fiscalite-rdc/code-general-2026/references/14-tva-arrete |
| art. 5 | Les DEF physiques comprennent une Unité de Facturation (UF) et un Module de Contrôle de Factura | REFUTE sur trois plans : la citation est infidèle, l'article n'est pas une obligation, et l'article ne s'adresse pas à ce logiciel. La recherche dans le dépôt est exacte (0 occurrence des sigles développés) mais elle mesure la mau |
| art. 6 | L'Unité de Facturation est un appareil électronique de facturation HOMOLOGUÉ par l'Administrati | REFUTE sur les trois angles. Tout ce qui suit est lu a l'instant, dans le fichier de reference et dans le depot. 1) L'ARTICLE 6 N'EST PAS UNE OBLIGATION, ET LE CONSTAT EN FABRIQUE UNE. Verbatim, l. 92-98 du fichier 14-tva-arrete-d |
| art. 7 | Le MCF est un appareil électronique homologué par l'Administration fiscale, CONNECTÉ à un Systè | REFUTE · angle 3 (destinataire), confirme par l'angle 1 (lecture du texte). Le constat est depose SUR L'ART. 7, mais l'art. 7 ne dit rien a OmegaX ; la phrase qui porte la condition invoquee est dans un AUTRE article, que le depot |
| art. 8 | Les DEF dématérialisés comprennent une Unité de Facturation dématérialisée (e-UF) et un Module  | Le constat tombe sur les trois angles. 1) L'OBLIGATION N'EXISTE PAS, ET LA CITATION N'EST PAS FIDÈLE. Voici l'art. 8 en entier, VERBATIM (fichier .../references/14-tva-arrete-dispositifs-electroniques-facture-normalisee.md:108-111 |
| art. 9 (alinéa 1) | L'e-UF est une application ou un logiciel DÉVELOPPÉ PAR L'ADMINISTRATION FISCALE et mis à dispo | ANGLE 1 · CE N'EST PAS UNE OBLIGATION, C'EST UNE DÉFINITION, ET LE CONSTAT LUI AJOUTE UN MOT QU'ELLE N'A PAS. Art. 9, al. 1er, lu verbatim (fichier 14-..., lignes 114-119) : « L'Unité de Facturation dématérialisée est une applicat |
| art. 9 (alinéa 2) | Critère de répartition : « Le « e-UF » est destiné aux entreprises qui ne disposent pas de syst | REFUTE SUR DEUX MOTIFS INDEPENDANTS. CE QUI TIENT D'ABORD (angle 1, honnêteté) : la citation est FIDELE. Le fichier /root/.claude/skills/synced/80921ba8-2ca0-4a8a-b7c1-4d4972fcb762_a1cd7539-5871-4b3d-820b-8de8737ca38b/fiscalite-rd |
| art. 10 (alinéa 1) | L'e-MCF est une application ou un logiciel CONÇU PAR L'ADMINISTRATION FISCALE pour collecter le | CONSTAT REFUTE SUR LES TROIS ANGLES. ═══ 1) L'OBLIGATION N'EXISTE PAS TELLE QUE LE CONSTAT L'ENONCE ═══ a) L'art. 10 n'est pas une obligation, c'est une DEFINITION DE CATEGORIE. Il siege sous « CHAPITRE 3 : DES DISPOSITIFS ELECTRO |
| art. 10 (alinéa 2) | Critère de répartition symétrique : « Le « e-MCF » est destiné aux entreprises qui disposent dé | REFUTE sur trois points, dont deux sont dirimants. 1) CE N'EST PAS UNE OBLIGATION, ET LE CONSTAT LE SAIT (il l'appelle lui-meme « critere de repartition »). Lu a l'instant, art. 10 du decret n° 23/10, dans 14-tva-arrete-dispositif |
| art. 11 | Seuls des UF et MCF physiques homologués peuvent être proposés à la vente et utilisés en RDC po | REFUTE sur les trois angles. Le constat impute a OmegaX une obligation qui, dans le decret lui-meme, a un jumeau explicite adresse aux logiciels · et ce jumeau, lui, est deja servi et affiche. 1) ANGLE 3 (decisif) · L'ART. 11 NE V |
| art. 12 | Canal d'acquisition exclusif : les éligibles ne peuvent acquérir des UF et MCF homologués qu'au | REFUTE sur trois points, dont deux suffisent seuls. 1) LE CONSTAT CITE L'ARTICLE A PEU PRES FIDELEMENT, MAIS AMPUTE SON OBJET. Texte lu, l. 145-148 du fichier de reference, VERBATIM : « Article 12 : Les personnes physiques ou mora |
| art. 14 | Les personnes morales de droit congolais immatriculées au RCCM qui fabriquent, importent, assem | CONSTAT REFUTE. Il vise le mauvais article : pour un SFE, l'article qui vise l'editeur est l'art. 24, pas l'art. 14. 1) LE DECRET DEDOUBLE, ET LE CONSTAT N'A LU QU'UNE MOITIE. Le chapitre 3 a deux sections paralleles. Section 2 (a |
| art. 18 | Les DEF dématérialisés sont mis à la disposition des personnes éligibles par l'Administration f | REFUTE sur les angles 1 et 3 ; l'angle 2 est concede au constat. 1) LE CONSTAT AJOUTE AU TEXTE UNE INTERDICTION QUI N'Y EST PAS. Art. 18, lu verbatim (fichier de reference, l. 185-189) : « Les dispositifs electroniques fiscaux dem |
| art. 19 | Qualification opérante : les DEF dématérialisés constituent le système de facturation normalisé | REFUTE · le constat cite l'art. 19 tronqué, et la qualification qu'il en tire ne vise ni OmegaX ni son utilisateur. 1) CITATION TRONQUEE (angle 1). Le constat dit « Texte lu : fichier de référence, l. 191-193 ». Or l'article ne s' |
| art. 19 | L'Administration fiscale rend disponible sur une plateforme le « e-UF » et le « e-MCF ». | Le fait brut survit, le raisonnement qui en fait un défaut tombe. Trois coups portent. 1) LA NÉCESSITÉ AVANCÉE EST FAUSSE. L'explication écrit : « voilà où se trouve l'e-MCF sans lequel un SFE, même homologué, n'émet pas de factur |
| art. 24 | Obligation générale de respect de leurs obligations pour les personnes morales de droit congola | REFUTE · le constat est exact sur les greps, mais mal fondé sur les trois angles. 1) LE TEXTE. Art. 24 lu à l'instant (fichier de référence, l. 219-223), VERBATIM : « Les personnes morales de droit congolais dûment immatriculées a |
| art. 25 | Règle de recevabilité générale : pour être admise en déduction, la TVA doit figurer sur l'un de | CONSTAT MAL FONDÉ SUR DEUX DE SES TROIS PILIERS · l'énoncé de l'obligation, et la preuve « jamais comme contrôle ». 1 · L'OBLIGATION N'EST PAS CELLE QUI EST ÉCRITE DANS LE CONSTAT. Lu à l'instant, fichier .../fiscalite-rdc/code-ge |
| art. 25 | Cas de droit commun : la TVA déductible doit figurer sur une facture normalisée ou un document  | Le constat tombe sur ses deux jambes : sa prémisse juridique est contredite par le texte supérieur, et son constat de fait sur le dépôt est faux. 1) LA PRÉMISSE JURIDIQUE EST CONTREDITE PAR LA LOI QUE LE DÉCRET APPLIQUE. Tout le c |
| art. 25 | Cas des livraisons et prestations à soi-même : la TVA n'est déductible que si elle figure sur u | CONSTAT REFUTE sur trois points, dont deux touchent au texte lui-meme. 1) LE CONSTAT FAIT DIRE AU TEXTE PLUS QU'IL NE DIT, ET EN AMPUTE UN RENVOI. Article 25 du decret n° 23/10, lu ce jour dans le fichier, point 3 VERBATIM et COMP |
| art. 27 | Interdiction d'accepter, lors de leurs transactions de biens et services, toute facture autre q | REFUTÉ sur trois plans : la citation de l'obligation est tronquée d'une restriction décisive, le manque reproché n'est exigé par aucun texte lu, et l'affirmation « aucun contrôle ne s'attache à la pièce reçue » est démentie par le |
| art. 27 | Condition cumulative d'acceptation : la facture doit (1) être normalisée et (2) émise par une p | REFUTE. Le constat s'effondre sur sa prémisse centrale : il declare une lacune du texte qui n'existe pas, et c'est exactement la faute que le depot a corrigee le 2026-09-13 et que le constat invoque contre le code. 1) LA PREMISSE  |

### Ce que cette passe apprend sur la méthode

- **L'indépendance du lecteur paie.** Les cinq constats retenus portent sur des
  articles que la session principale avait LUS la veille et l'avant-veille, en
  construisant le module. Trois lui avaient échappé parce qu'elle lisait le
  texte à travers le code qu'elle écrivait.
- **L'étape adverse est le cœur du dispositif**, pas un supplément. Vingt-cinq
  constats sur trente ne survivent pas. Un relevé sans elle serait à 83 % du
  bruit, et le bruit se corrige.
- **Un agent réfutateur peut renforcer un constat au lieu de le tuer.** Sur
  l'art. 25, il a trouvé un passage que le confronteur avait manqué, et qui
  AGGRAVE le constat au lieu de l'invalider. C'est un comportement à conserver.

## Passe F2a · Ordonnance-loi n° 10/001 sur la TVA, chapitres I à IV (2026-09-13)

**Corpus** · `fiscalite-rdc/code-general-2026/references/10-tva-ol10-001-loi-base-ch1-10.md`,
1 754 lignes, dix chapitres. Chapitre I (objet et définitions), chapitre II
(champ d'application, 500 lignes à lui seul), chapitre III (fait générateur et
exigibilité), chapitre IV (base d'imposition et taux).

**L'EXÉCUTION DE F2 A ÉTÉ SCINDÉE EN DEUX RUNS, ET LE PLAN N'A PAS BOUGÉ.** F1
avait rendu 30 constats sur 57 obligations pour 306 lignes de source ; à
1 754 lignes, F2 en produisait plus d'une centaine, donc autant d'agents
réfutateurs à `xhigh`. F2a couvre les chapitres I à IV, F2b couvrira les
chapitres V à X (déductions, obligations des redevables, liquidation et
remboursement, procédures, pénalités, dispositions finales). C'est la conduite
de la passe qui est en deux temps, pas la passe : F2 ne sera close qu'une fois
les deux runs dépouillés.

**Volumétrie** · 159 agents, 19,0 M de jetons, 5 h 52. Cinq blocs de lecture
(agents sans aucun accès au dépôt), cinq confrontations (agents sans accès au
texte autrement que par le rapport de lecture), puis **un réfutateur à `xhigh`
par constat**, chargé de le démolir sur trois angles : le texte dit-il vraiment
cela et sous ce numéro d'article, le dépôt ne le sert-il pas déjà par un autre
chemin, l'obligation pèse-t-elle bien sur le redevable et non sur
l'Administration.

**Résultat** · 149 constats soumis à réfutation, **93 écartés**, **56 retenus**.
Le taux de réfutation tombe de 83 % (F1) à 62 % : la différence tient au corpus,
une loi de champ d'application produisant des constats moins spéculatifs qu'un
décret de procédure.

### Ce qui est corrigé dans le code, et testé

#### 1 · La nature fiscale se lisait au compte de TVA, qui ne la porte pas (art. 6 et 8)

C'est le constat le plus lourd de la passe, et il se lisait sur deux lignes de
routage. `client/src/lib/tva-syscohada.ts` envoie toute la racine **707** au
44310000 « TVA facturée sur ventes », que le service classait BIENS. Or le plan
SYSCOHADA sème sous 707 le **70720000 « Commissions et courtages »**, le
**70730000 « Locations »**, le **70750000 « Mise à disposition de personnel »**
et le **70760000 « Redevances pour brevets, logiciels, marques »**. L'article 8
range expressément parmi les prestations de services « les locations de biens
meubles », « les opérations portant sur des biens meubles incorporels » et « les
opérations d'entremise », et son alinéa 1er tient pour telles « toutes les
opérations autres que les livraisons de biens meubles corporels ». L'article 25,
2° les rend exigibles à l'encaissement : **une commission facturée en mars et
encaissée en juin était déclarée et payée en mars.**

Symétriquement, toute la racine **60** partait au 44520000, classé BIENS, alors
que le 60510000 est « Eau », le 60520000 « Électricité », le 60530000 « Autres
énergies » et le 60570000 « Achats d'études et prestations de services » ·
l'article 8 nomme en toutes lettres « la fourniture d'eau, d'électricité, de
gaz, d'énergie thermique et des biens similaires » et « les travaux d'études, de
conseil, d'expertise et de recherche ». Le droit à déduction naissait dès la
facture au lieu de naître à l'exigibilité chez le fournisseur (art. 37 al. 1,
décret n° 011/42 art. 96) : **une facture d'électricité de mars réglée en juin
était déduite en mars.** Déduction anticipée, réintégrable.

L'erreur de conception est nommable en une phrase : **le routage 443/445 suit la
nomenclature comptable, les articles 6 et 8 qualifient l'opération, et le module
tenait le premier pour la seconde.** La nature se lit désormais à la
CONTREPARTIE de l'écriture (classe 7 sur une vente, classes 6 et 2 sur un
achat), le compte de TVA ne servant que de repli quand aucune contrepartie n'est
lisible. La plus longue racine l'emporte, de sorte que le 7073 prime le 707 et
le 6051 prime le 60.

**Ce qui porte deux sens n'est pas tranché.** Le 60580000 « Achats de travaux,
matériels et équipements » porte des travaux (services) et des matériels (biens)
sous un seul numéro ; le 70710000 « Ports, emballages perdus et autres frais
facturés » porte un transport et des emballages ; le 70780000 « Autres produits
accessoires » ne dit rien. Ces comptes rendent INDETERMINEE, et la déclaration
annonce le repli avec son montant. Une écriture dont les contreparties ne disent
pas toutes la même chose rend elle aussi INDETERMINEE : mélanger une vente de
marchandises et une commission sur la même pièce ne donne pas le droit d'en
choisir une.

La requête de la déclaration ne chargeait pas les contreparties de classe 7 et
2 ; elle les charge désormais.

#### 2 · L'article 26, alinéa 3, était servi du seul côté où il n'était pas dû

Verbatim : « Elle ne dispense pas le redevable de s'acquitter de la taxe sur la
valeur ajoutée au moment de l'encaissement du prix ou de l'acompte si celui-ci
intervient avant les débits. » L'alinéa vise ce que le redevable **acquitte**,
donc sa TVA COLLECTÉE. Le module le servait sur la seule branche où il n'y était
pas tenu, la déduction, et l'enjambait sur l'autre. Le schéma portait
l'hypothèse qui le dispensait : « la date de facture étant la plus précoce des
deux **dans le cas usuel** » · la réserve était l'aveu. L'avance sur marché de
travaux, l'acompte à la commande et le dépôt de garantie imputable, que
l'article 25, 2° nomme d'ailleurs (« des acomptes ou avances »), sont
précisément le cas que l'alinéa réserve.

OmegaX **ne peut pas** l'établir : un acompte encaissé avant la facture
s'enregistre en avance reçue (compte 419), sans ligne de taxe et sans
rattachement à la facture qui suivra. La correction n'est donc pas un calcul,
c'est une **déclaration chiffrée** : sous le régime des débits, le montant de
TVA collectée sur services et travaux daté de la facture est annoncé sur la
déclaration avec l'alinéa 3 cité, le sens de l'écart (daté au plus tard, jamais
au plus tôt) et la consigne de reprise acompte par acompte. L'hypothèse fausse
du schéma est supprimée.

#### 3 · Un hors-scope annonçait tout l'article 25, et un test interdisait de le corriger

Le module déclarait couvrir « l'exigibilité par NATURE d'opération (art. 25 et
26) », sans réserve de point. Seuls les **points 1 et 2** le sont. Ne le sont
pas : le point 3 (déclaration de mise à la consommation, biens importés, régimes
suspensifs, zone franche), le point 4 (échéance de l'effet en cas d'escompte),
le point 5 (échéance des intérêts ou loyers, crédit à la consommation et
crédit-bail des établissements financiers), le point 6 (livraison des produits
ou perception du **préfinancement**, cultures pérennes) et le point 7 (date de
mutation d'immeuble, avec l'exception de l'habitat social et des locations de
promoteurs immobiliers, exigibles à chaque échéance).

Et `hors-scope-tva.spec.ts` **bannissait la chaîne « art. 25 »** de la liste des
manques, pour prouver que l'article était traité : écrire la lacune au bon
endroit faisait tomber le test. C'est la doctrine du dépôt prise à revers · une
lacune déclarée à tort est aussi fausse qu'une règle inventée, et une lacune
qu'un test interdit de déclarer l'est deux fois. Le spec n'interdit plus un
numéro : il exige la réserve exacte, à l'annonce du périmètre comme dans la
liste des manques, et il exige que les cinq points non servis soient nommés.

#### 4 · Quatre lacunes désormais nommées, aucune comblée de mémoire

- **Territorialité et client rendu redevable (art. 22 et 23).** L'art. 22, 3°
  rattache à la RDC les prestations « lorsque le service rendu, le droit cédé ou
  l'objet loué, sont utilisés ou exploités au pays » : une étude, une redevance
  ou un logiciel facturés depuis l'étranger et utilisés en RDC sont DANS le
  champ. L'art. 23, alinéa 2, met la taxe **et les pénalités** à la charge de
  « la personne cliente » quand le redevable étranger n'a pas désigné de
  représentant agréé. OmegaX enregistre ces achats en charges ordinaires, sans
  taxe et sans signal · alors qu'il voit le fournisseur non-résident pour un
  autre impôt, le prélèvement de 14 % de l'art. 144.
- **Bases particulières des art. 27 point 10, 31, 32, 33 et 34** · régime de la
  marge des négociants de biens d'occasion, d'œuvres d'art, d'objets de
  collection ou d'antiquité ; régime des agences de voyages et organisateurs de
  circuits touristiques, avec l'interdiction de déduction de l'art. 33 ; régime
  des transitaires et commissionnaires en douane. Le chemin guidé applique
  `ht × taux` au prix entier. **RÉSERVE DE LECTURE NON TRANCHÉE** : l'art. 27,
  point 10 retient « la différence entre le prix de vente et le prix d'achat de
  chaque bien » sans condition de fournisseur, quand l'art. 31 retient « la
  différence entre le prix de vente et le prix de revient » et seulement pour
  les biens acquis auprès de non-assujettis. Les deux règles ne disent pas la
  même chose dans le même chapitre ; le logiciel n'en invente aucune.
- **TVA collectée sur les cessions d'éléments d'actifs (art. 6).** L'article
  range « les cessions d'éléments d'actifs » parmi les livraisons de biens
  meubles corporels. Le module `immobilisations` pose l'écriture de cession sans
  une ligne de taxe ni un taux proposé. C'est une question **antérieure** aux
  régularisations des art. 50 et 51 déjà déclarées hors scope : celles-ci
  portent sur la taxe DÉDUITE en amont, celle-ci sur la taxe à COLLECTER sur le
  prix de cession.
- **Fait générateur des opérations des promoteurs immobiliers (art. 24, points 6
  et 7)**, faute d'un modèle qui porte cette qualité.

### Vérification

- **6 réinjections de défaut, 6 attrapées.** Contrepartie ignorée (7 tests
  tombent), 6058 tranché à tort, garde des contreparties mêlées retirée, mention
  de l'art. 26 al. 3 retirée, hors-scope ramené à son état antérieur (4 tests
  tombent).
- **La septième réinjection n'a d'abord RIEN cassé, et c'est elle qui a servi.**
  Retirer la classe 7 du filtre de la requête de production laissait passer les
  douze tests : la doublure de `findMany` rend ce qu'on lui donne sans jamais
  appliquer le `where`. En production, la contrepartie n'aurait pas été chargée
  et la nature serait retombée sur le compte de TVA, c'est-à-dire exactement sur
  le défaut corrigé. Un test lit désormais le `where` que le service DEMANDE, et
  non ce que la doublure lui rend · il tombe quand la classe 7 disparaît.
- 230 suites / 3 462 tests serveur, 41 fichiers / 468 tests client, verts.

### Les quarante-six autres constats retenus, portés au relevé sans correction

Aucun de ceux-ci n'est corrigeable sans une donnée que le modèle ne porte pas
(qualité de promoteur immobilier, secteur d'activité, position tarifaire
douanière, date de constatation d'une baisse de chiffre d'affaires) ou sans un
chantier qui excède la passe. Ils sont listés ici pour être repris, avec leur
gravité telle que le confronteur l'a qualifiée.

| Article | Ce que le texte impose | Gravité |
|---|---|---|
| Article 2 (définition : Promoteur immobilier) | Définition du promoteur immobilier : personne physique ou morale effectuant, de manière habituelle, des opérations de construction et/ou de rachat d'immeubles ainsi que de terrain en vue de  | INCOMPLET |
| Article 3 | Soumettre à la TVA les opérations relevant d'une activité économique effectuées à titre onéreux par un assujetti agissant en tant que tel (livraisons de biens meubles corporels et prestation | INCOMPLET |
| Article 10 (complété par la L.F. n° 25/060 du 29 décembre 2025, art. 45) | Livraison de biens à soi-même = prélèvements et affectations effectués par les assujettis pour des besoins d'exploitation en cas de production d'immobilisations ou de biens exclus du droit à | INCOMPLET |
| Article 10, alinéa 2 (ajouté par la L.F. n° 25/060 du 29 décembre 2025, art. 45) | Définition nouvelle de la production d'immobilisations : « l'opération par laquelle un assujetti fabrique ses propres actifs, incorporels ou corporels, en investissant ses ressources, son te | INCOMPLET |
| Article 13, alinéa 3 | NON-ASSUJETTISSEMENT des personnes morales de droit public pour l'activité de leurs services administratifs, sociaux, éducatifs, culturels et sportifs, à la CONDITION que ce non-assujettisse | INCOMPLET |
| Article 14, alinéa 1 (modifié par l'O.-L. n° 13/007, la L.F. n° 14/002 et la L.F. n° 15/021 du 31 décembre 2015) | Assujettissement de plein droit dès un chiffre d'affaires annuel ÉGAL OU SUPÉRIEUR à 80.000.000 de Francs congolais ; en deçà, faculté d'option pour le régime de la TVA. | INCOMPLET |
| Article 14, alinéa 2 | L'option est accordée sur demande EXPRESSE adressée à l'Administration des Impôts suivant les modalités fixées par voie réglementaire. Elle est DÉFINITIVE PENDANT DEUX ANS suivant l'exercice | CALENDRIER |
| Article 14, alinéa 3 | Lorsque le chiffre d'affaires devient inférieur au seuil, l'assujetti CONSERVE sa qualité les deux années suivant celle de la constatation de la diminution · il continue à déclarer et à fact | CALENDRIER |
| Article 15, 1° | Exonérer les ventes de biens meubles d'occasion effectuées par les personnes qui les ont utilisés pour les besoins de leur exploitation, à la CONDITION que ces biens n'aient pas ouvert droit | INCOMPLET |
| Article 15, 3° | Exonérer les ventes et cessions effectuées par l'État, les provinces, les ETD et les organismes publics n'ayant pas le caractère industriel et commercial, dans les conditions définies à l'ar | INCOMPLET |
| Article 15, 10° | Exonérer l'importation et l'acquisition des produits pharmaceutiques destinés à la prévention, au diagnostic et au traitement des maladies, des emballages et intrants pharmaceutiques (liste  | INCOMPLET |
| Article 15, 12° | Exonérer l'importation et l'acquisition des équipements, matériels, réactifs et autres produits chimiques destinés EXCLUSIVEMENT à la prospection, l'exploration, la recherche et la construct | INCOMPLET |
| Article 15, point 17 | Ne pas taxer la vente locale de cinq produits : blé, PAIN, maïs, farine de froment, farine de maïs. | INCOMPLET |
| Article 15, point 20 | Exonérer à l'importation les biens d'équipements des entreprises nouvelles destinés aux investissements de création, dans les conditions déterminées par voie réglementaire. | INCOMPLET |
| Article 16 | Définition opérante des « œuvres d'art originales » commandant l'exonération de l'art. 15, point 14 : réalisation entièrement exécutée de la main de l'artiste, dans une liste fermée. | INCOMPLET |
| Article 16, tirets 1 à 6 (liste des œuvres d'art originales) | Liste limitative de six catégories, avec un seuil chiffré : gravures, estampes et lithographies tirées en un nombre ne dépassant pas 50 exemplaires directement de planches ; conditions de fo | INCOMPLET |
| Article 16, exclusions | Exclure impérativement du régime des œuvres d'art originales l'orfèvrerie, l'horlogerie, la bijouterie, la joaillerie, et les objets manufacturés d'artisans ou industriels dits « d'art » : c | INCOMPLET |
| Article 17, chapeau | Tenir une liste fermée d'exonérations portant exclusivement sur des PRESTATIONS DE SERVICES, distincte de la liste de l'art. 15 (livraisons de biens et importations). | CALENDRIER |
| Article 17, point 4 | Exonérer les frais de scolarité et de pension perçus dans le cadre normal de l'activité des établissements d'enseignement national régulièrement autorisés par le Ministre compétent selon le  | INCOMPLET |
| Article 17, point 5 | Exonérer les examens, consultations, soins, hospitalisation, travaux d'analyse et de biologie médicale, pour les humains seulement. | INCOMPLET |
| Article 17, point 9 | Exonérer douze catégories de prestations aéronautiques, à la condition que la compagnie destinataire réalise au moins 80 % de ses services à destination ou en provenance de l'étranger. | INCOMPLET |
| Article 17, point 10 | Exonérer en totalité le transport aérien de personnes ou de marchandises à destination ou en provenance de l'étranger. | INCOMPLET |
| Article 17, point 11 | N'exonérer le transport terrestre, lacustre, fluvial, maritime et ferroviaire QUE pour la partie du trajet accomplie hors des limites du territoire national, la portion nationale restant tax | INCOMPLET |
| Article 17, point 12 | Exonérer les prestations de contrôle technique portant sur le poids et la qualité des marchandises destinées à l'exportation, effectuées par un organisme public. | INCOMPLET |
| Article 17, point 19 | Exonérer les locations de locaux NUS à usage d'HABITATION par des assujettis AUTRES que les promoteurs immobiliers. | INCOMPLET |
| Article 17, point 20 | Exonérer quatre primes limitativement énumérées : assurance-vie, assurance-maladie, assurance directe à l'étranger AUTORISÉE par le Ministre ayant le secteur des assurances dans ses attribut | INCOMPLET |
| Article 18, chapeau | N'accorder les quatre exonérations de l'article 18 QUE si les activités et prestations sont effectivement soumises à des taxations spécifiques exclusives de toute taxation sur le chiffre d'a | INCOMPLET |
| Article 18, point 2 | Exonérer les droits d'entrée dans une manifestation culturelle, sous la condition du chapeau. | INCOMPLET |
| Article 18, point 3 | Exonérer les transmissions de propriété ou d'usufruit d'immeubles, de fonds de commerce, de clientèle et de droit au bail, ainsi que les ventes publiques aux enchères, soumises aux droits d' | INCOMPLET |
| Article 23, alinéa 1 | Pour tout redevable établi ou domicilié hors de RDC : désigner par lettre légalisée ou notariée, adressée à l'Administration des Impôts, un représentant agréé résidant sur le territoire nati | INCOMPLET |
| Article 24, point 6 | Pour les opérations immobilières réalisées par les promoteurs immobiliers, le fait générateur est l'acte de mutation ou de transfert de propriété ; à défaut d'acte, l'entrée en jouissance. | INCOMPLET |
| Article 24, point 7 | Pour les locations de terrains non aménagés ou de locaux nus effectuées par des promoteurs immobiliers, le fait générateur est l'acte de mutation ou de jouissance ; à défaut d'acte de mutati | INCOMPLET |
| Article 24, point 9 | Pour les livraisons de biens, prestations de services et travaux immobiliers donnant lieu à décomptes ou paiements successifs, le fait générateur est l'expiration des périodes auxquelles se  | INCOMPLET |
| Article 25, point 6 | Pour les opérations liées aux cultures pérennes, la TVA est exigible à la livraison des produits ou, s'il en existe, à l'occasion de la perception du préfinancement. | INCOMPLET |
| Article 25, point 7 | Pour les mutations de propriété d'immeuble, la TVA est exigible à la date de mutation ou de transfert de propriété. Exception : pour les locations-ventes en habitat social, les locations de  | INCOMPLET |
| Art. 27, point 8 | Livraisons de biens à soi-même : base = prix de revient des biens livrés. | INCOMPLET |
| Art. 27, point 9 | Prestations de services à soi-même : base = dépenses engagées pour leur exécution. | INCOMPLET |
| Art. 28, point 2 | Inclusion dans la base des indemnités n'ayant pas le caractère de dommages-intérêts. | INCOMPLET |
| Art. 29, point 2 | Exclusion de la base des débours qui ne sont que des remboursements de frais et qui sont facturés pour leur montant exact au client. | INCOMPLET |
| Art. 29, point 8 | Exclusion de la base des sommes perçues à titre de consignation d'emballages identifiables, récupérables et réutilisables ; au terme des délais en usage dans la profession sans restitution,  | CALENDRIER |
| Art. 30 | Interdiction de déduire de la base, chez le créancier ou le vendeur, les réductions de l'art. 29 point 1 qui rémunèrent en réalité une prestation du débiteur ou qui ne bénéficient pas effect | INCOMPLET |
| Art. 34 | Transitaires, commissionnaires de transports et commissionnaires en douane, même traitant à forfait : base = rémunération brute (totalité des sommes encaissées), déduction faite de la seule  | INCOMPLET |
| Art. 35 · taux réduit de 1 % sur une liste tarifaire de produits | Taux réduit de 1 % applicable à une liste limitative de 24 positions tarifaires (viandes, abats, volailles, poissons congelés, séchés et salés, riz, sucres, préparations lactées, lait et crè | CALENDRIER |
| Art. 35 · taux réduit de 1 % sur les matières premières pour la valorisation de l'industrie locale | Taux réduit de 1 % applicable au cuivre (74.01/74.02), à l'étain (80.01/80.01.10.00), au plomb (78.01), à l'aluminium (76.01/76.01.10.00) et au zinc (79.01/79.03), sous forme de produit brut | CALENDRIER |
| Art. 35 · taux réduit de 1 % sur les produits agricoles bruts et intrants agro-industriels | Taux réduit de 1 % à l'acquisition des produits agricoles bruts et intrants destinés à l'agro-industrie, y compris engrais et équipements agricoles. | INCOMPLET |
| Art. 35 · taux réduit de 1 % sur les matériaux et services de construction des projets publics d'infrastructures d'intérêt national | Taux réduit de 1 % à l'acquisition des matériaux ET des services de construction relatifs aux projets publics d'infrastructures d'intérêt national. | INCOMPLET |
Trois d'entre eux méritent d'être signalés à part, parce qu'ils touchent la
méthode plutôt que la règle.

- **Onzième et douzième occurrences du piège « un mot, deux sens ».**
  « Promoteur » désigne dans le dépôt le signataire d'une requête d'ONG au
  Ministre du Plan (`correspondance-exonerations.ts`), jamais le promoteur
  immobilier de l'art. 2, dont dépendent les art. 8, 15 point 7, 17 point 19,
  18 point 3, 24 points 6 et 7 et 25 point 7. Et « tempérament » désigne la
  vente à tempérament de l'art. 24 point 9 comme l'atténuation d'une règle dans
  `mentions-facture.ts`.
- **L'article 10 figurait dans une liste que le dépôt avait lui-même écrite.**
  Le module cite trois fois les articles que la L.F. n° 25/060 touche · « les
  art. 10, 35, 42 point 4, 60, 62 et 74 ». Il a appliqué la modification de
  l'art. 35 (les taux) et n'a jamais ouvert l'art. 10, en tête de sa propre
  liste, dont l'alinéa 2 nouveau définit la production d'immobilisations, y
  compris incorporelles. Dater un texte sert à écarter ce qui n'est plus en
  vigueur ; ce n'est pas une dispense de lire ce qui l'est.
- **Le compte 72 est semé et personne ne le lit.** La production immobilisée et
  la production auto-consommée sont exactement les prélèvements et affectations
  que l'art. 10 taxe en livraison à soi-même ; aucune règle ne relie un crédit
  de 72 à une ligne de TVA au 44340000.

### Les quatre-vingt-treize constats écartés

| Article | Obligation alléguée | Motif de la réfutation (extrait) |
|---|---|---|
| Article 2 (définition : Activités économiques) | Définition du périmètre des activités économiques : production, importation, prestation de services, distribut | CONSTAT RÉFUTÉ sur les angles 1 et 2, et sur son signalement adjacent. 1) L'ARTICLE 2 N'EST PAS UNE OBLIGATION, ET SON ÉNUMÉRATION N'A QU'UN EFFET ANTI-EXCLUSION. C'est une définition lexicale sous chapeau « Au sens de la présente |
| Article 2 (définition : Association momentanée) | Définition de l'association momentanée : groupement de personnes physiques ou morales pour réaliser une ou plu | L'article 2 ne porte AUCUNE obligation : c'est un glossaire. Le fichier source le dit en toutes lettres, l. 38-40 : « SECTION 2 : DES DEFINITIONS / Article 2 : / Au sens de la présente Ordonnance-Loi, on entend par : ». Ce qui sui |
| Article 2 (définition : Biens d'occasion) | Définition des biens d'occasion : biens ayant fait l'objet d'une utilisation ET susceptibles de réemploi en l' | REFUTÉ · pas sur le fait (le dépôt ignore bien la notion), mais sur le fondement : le constat rattache à l'article 2 une obligation que l'article 2 ne porte pas, et cite l'article porteur sous un numéro qui porte autre chose. 1) L |
| Article 2 (définition : Exportation) | Définition de l'exportation : sortie du territoire de la RDC d'un bien OU d'un service · les services sont exp | CONSTAT MAL ANCRÉ. L'article 2 ne porte aucune obligation : il ouvre par « Au sens de la présente Ordonnance-Loi, on entend par : » (l. 40) sous l'intitulé « SECTION 2 : DES DEFINITIONS » (l. 38). Aucun « doit », aucun destinatair |
| Article 2 (définition : Importation) | Définition de l'importation : entrée en RDC d'un bien OU d'un service · les services importés sont expressémen | REFUTÉ sur trois motifs indépendants, dont les deux premiers suffisent seuls. 1) ANGLE 1 · L'OBLIGATION N'EST PAS PORTÉE PAR L'ARTICLE VISÉ. L'art. 2 est un article de DÉFINITIONS : il s'ouvre par « Au sens de la présente Ordonnan |
| Article 2 (définition : Mise à la consommation) | Définition de la mise à la consommation : régime douanier subordonné à l'accomplissement de TOUTES les formali | Le constat tombe sur les trois angles à la fois. 1) L'OBLIGATION N'EXISTE PAS DANS CES TERMES · l'art. 2 est une DÉFINITION, et le constat la réécrit en condition. Texte lu (fichier 10-tva-ol10-001-loi-base-ch1-10.md, l. 43-44 pui |
| Article 2 (définition : République Démocratique du Congo) | Définition territoriale du champ de la taxe : territoire terrestre, espace aérien, eaux territoriales et autre | CONSTAT MAL FONDÉ SUR L'ARTICLE VISÉ, ET REMÈDE CONTRAIRE AU TEXTE INVOQUÉ. 1) L'article 2 ne porte pas l'obligation énoncée. L'article 2 est un lexique : il s'ouvre verbatim sur « Au sens de la présente Ordonnance-Loi, on entend  |
| Article 2 (définition : Taxe sur la valeur ajoutée) | Définition de la TVA : impôt indirect qui touche tous les biens et services de toutes origines consommés OU UT | CONSTAT REFUTE · trois vices cumulés : mauvais article, obligation inexistante, fait matériel faux. 1) MAUVAIS ARTICLE. L'article 2 n'énonce aucun rattachement : c'est un lexique. Son chapeau, lu dans le fichier (l. 40) : « Au sen |
| Article 2 (définition : Zone franche) | Définition de la zone franche : étendue de la RDC considérée au point de vue douanier comme hors frontières, d | Le constat tombe sur les trois angles à la fois, et le plus lourd est le troisième. 1) L'ARTICLE 2 NE PORTE AUCUNE OBLIGATION. Son chapeau, lu à la ligne 40 du fichier source, est « Au sens de la présente Ordonnance-Loi, on entend |
| Article 4 | L'opération n'est imposable que si elle est effectuée entre deux personnes distinctes et moyennant une contrep | RÉFUTÉ sur les angles 1 et 2. Tout ce qui suit a été lu à l'instant. ANGLE 1 · L'OBLIGATION N'EST PAS CELLE QUE LE CONSTAT ÉNONCE. Le constat vise le bon article (l'art. 4 porte bien ce contenu), mais il le durcit sur deux points, |
| Article 5 | Définition des personnes distinctes : personnes juridiques différentes si toutes les parties sont établies en  | Constat mal fondé sur trois plans indépendants, chacun suffisant. (1) MAUVAIS ARTICLE · l'art. 5 ne porte pas l'obligation qu'on lui prête. Lu à l'instant dans 10-tva-ol10-001-loi-base-ch1-10.md, il s'ouvre VERBATIM par « Au sens  |
| Article 5, in fine | Traiter l'association momentanée comme une personne distincte de ses membres, dans tous les cas où il y a cont | Le constat tombe sur les trois angles, et deux de ses affirmations de fait sont fausses, vérification faite à l'instant. 1) L'article 5 n'est pas une obligation : c'est une règle de qualification introduite par « Au sens de l'arti |
| Article 7 (L.F. n° 14/027 du 31 décembre 2014), 1. | Assimiler aux exportations les opérations de construction, transformation, réparation, entretien et affrètemen | Le constat tombe sur les trois angles. 1) LE TEXTE NE DIT PAS CE QUE LE CONSTAT LUI FAIT DIRE. L'article 7 est LU (lignes 126-136 du fichier de référence) : il est conforme sur le fond, mais le constat INVERSE le rapport et en eff |
| Article 7 (L.F. n° 14/027 du 31 décembre 2014), 2. | Assimiler aux exportations les livraisons de marchandises ou objets destinés à l'avitaillement des aéronefs du | Le constat cite l'article fidèlement mais se trompe sur ce que l'assimilation produit. L'article 7 n'impose aucun traitement propre à l'avitaillement : il range l'opération dans une catégorie que la loi elle-même nomme collectivem |
| Article 7 (L.F. n° 14/027 du 31 décembre 2014), 3. | Assimiler aux exportations les opérations de construction, transformation, réparation, entretien et affrètemen | REFUTE sur l'angle 2 (le depot sert deja l'obligation), pas sur les angles 1 et 3. ANGLE 1 · echoue, et je le dis franchement. Le constat vise le BON article et le BON alinea. Le fichier porte bien « Article 7 : » (l. 126) surmont |
| Article 7 (L.F. n° 14/027 du 31 décembre 2014), 4. | Assimiler aux exportations la livraison d'engins et filets de pêche et la fourniture de tous articles et produ | Le constat est réfuté sur l'angle 2 : sa preuve est un grep de mots-clés produits (« filets de pêche », « engins de pêche ») là où l'obligation est une règle de QUALIFICATION, servie dans OmegaX par un mécanisme générique qui ne n |
| Article 7 (L.F. n° 14/027 du 31 décembre 2014), 5. | Assimiler aux exportations les opérations de manutention, de magasinage et d'aconage portant sur les marchandi | REFUTE sur deux plans : la preuve avancée est matériellement fausse, et l'obligation est servie par le mécanisme même que la loi lui assigne. 1) LA PREUVE EST FAUSSE. Le constat affirme que « manutention » n'apparaît que dans les  |
| Article 7 (L.F. n° 14/027 du 31 décembre 2014), 6. | Assimiler aux exportations les livraisons de biens effectuées sous un régime suspensif de droits de douane ou  | Le constat tombe sur l'angle 2 (déjà servi) et, accessoirement, sur une erreur de fait dans sa preuve. 1) IL CHERCHE LA MAUVAISE CHOSE. L'article 7 n'est pas une obligation autonome : son chapeau, lu l. 128-129 du fichier, dit « L |
| Article 7 (L.F. n° 14/027 du 31 décembre 2014), 7. | Assimiler aux exportations le transport des marchandises destinées à l'exportation. | Le constat cite fidèlement l'article 7, 7°, mais il échoue sur les deux autres angles. (a) Ses deux preuves portent sur la TVA RÉCUPÉRABLE (amont, transport ACHETÉ), alors que l'assimilation de l'article 7 qualifie une opération d |
| Article 8 (modifié par l'O.-L. n° 13/007 du 23 février 2013) | Définition résiduelle : les prestations de services sont TOUTES les opérations autres que les livraisons de bi | Le constat cite l'article 8 fidèlement mais lui fait produire une règle qu'il ne contient pas, et il ne vise pas le bon article pour le grief qu'il formule. 1) L'ARTICLE 8 EST UNE RÈGLE DE QUALIFICATION, PAS UNE PRÉSOMPTION EN CAS |
| Article 9 | Sont également imposables, sans préjudice de l'article 3 : 1. les livraisons de biens à soi-même ; 2. les pres | CONSTAT REFUTE sur les trois angles. Il se trompe d'article, il vise pour son 3° une opération que la loi confie expressément aux Douanes, et son affirmation centrale (« aucun chemin de saisie ne l'atteint », « aucune n'y est prod |
| Article 11 | Les prestations de services à soi-même consistent en des services que les assujettis réalisent soit pour les b | CONSTAT REFUTE sur les trois angles. Deux de ses affirmations centrales sont fausses a la lecture faite a l'instant, et la troisieme grade le logiciel contre une entree de dictionnaire. 1) ANGLE 1 · CE N'EST PAS UNE OBLIGATION, C' |
| Article 12 | Sans préjudice des dispositions de l'article 14, les importations sont soumises à la TVA QUELLE QUE SOIT LEUR  | CONSTAT RÉFUTÉ, sur deux fondements indépendants, plus une erreur d'analyse du renvoi. 1) L'ARTICLE EST CITÉ FIDÈLEMENT MAIS N'IMPOSE AUCUN ACTE AU REDEVABLE DANS SES LIVRES (angle 3, décisif). Le texte lu ligne 218-220 dit bien,  |
| Article 13, alinéas 1 et 2 | Sont assujetties les personnes physiques ou morales, Y COMPRIS l'État, les provinces, les ETD et les organisme | Le constat cite l'article fidèlement mais ses trois griefs ne tiennent pas, et deux d'entre eux sont contredits par les fichiers qu'il invoque lui-même. GRIEF 3 · FAUX DE FAIT, ET C'EST DÉCISIF. Le constat affirme que « L'État, le |
| Article 14, alinéa 4 | Le Ministre ayant les Finances dans ses attributions peut, par voie d'Arrêté, modifier le seuil d'assujettisse | L'alinéa 4 de l'article 14 n'est PAS une obligation, et il ne s'adresse pas au redevable. C'est une norme d'habilitation ("peut"), dont l'unique destinataire est le Ministre ayant les Finances dans ses attributions. Un logiciel de |
| Article 15, chapeau (modifié par huit textes, de l'O.-L. n°  | Ne pas taxer les opérations énumérées · champ EXPRESSÉMENT limité aux opérations de LIVRAISON DE BIENS et d'IM | CONSTAT MAL FONDÉ : il grade INCOMPLET sur deux exigences que le chapeau de l'article 15 ne porte pas, après avoir lui-même admis que l'obligation qu'il porte est servie. 1) L'OBLIGATION EST CITÉE FIDÈLEMENT · ET LE CONSTAT LA DIT |
| Article 15, 2° | Exonérer les ventes et importations des associations sans but lucratif LÉGALEMENT CONSTITUÉES lorsque ces opér | Le constat est réfuté sur son affirmation porteuse, celle qui seule justifie la gravité INCOMPLET : « aucune des trois conditions cumulatives n'est vérifiable dans le logiciel · ni la constitution légale de l'association ». C'est  |
| Article 15, 4° | Exonérer les ventes et les importations de timbres officiels ou de papiers timbrés. | Le constat est réfuté sur son affirmation centrale, pas sur sa lecture du texte. ANGLE 1 · RIEN À REDIRE, et je le dis franchement. L'article est cité fidèlement et sous le bon numéro. Dans 10-tva-ol10-001-loi-base-ch1-10.md, la S |
| Article 15, 5° | Exonérer l'importation des billets de banque, intrants, équipements servant à la fabrication des signes monéta | Le constat tombe sur l'angle 3 (destinataire) et, accessoirement, sur l'angle 2 (« PAS DU TOUT » surévalué). Sa citation, elle, est fidèle : je ne l'attaque pas là-dessus. 1) CE N'EST PAS UNE OBLIGATION DU REDEVABLE SERVI PAR LE L |
| Article 15, 6° | Exonérer les ventes et importations d'intrants agricoles destinés à l'agriculture, sur base d'une liste déterm | Le constat est réfuté sur ses DEUX piliers, et sur sa qualification. 1) SA PREUVE EMPIRIQUE EST FAUSSE, Y COMPRIS DANS SON PROPRE PÉRIMÈTRE. Le constat écrit : « Recherche "intrant agricole", "intrants" sur src/, client/src/, pris |
| Article 15, 7° | Exonérer les opérations ayant pour objet la cession d'immeubles par des personnes AUTRES que les promoteurs im | Le constat tombe sur les trois angles à la fois. (1) IL FAIT DIRE AU TEXTE PLUS QU'IL NE DIT. Lu à l'instant dans /root/.claude/skills/synced/80921ba8-2ca0-4a8a-b7c1-4d4972fcb762_a1cd7539-5871-4b3d-820b-8de8737ca38b/fiscalite-rdc/ |
| Article 15, 8° | Exonérer l'importation et la livraison des organes et du sang humains par les institutions médicales ou organi | Le constat est REFUTE sur l'angle 2 (obligation deja servie), avec un appoint sur l'angle 3 et une reserve sur l'angle 1. 1) ANGLE 1 · le texte est bien la, et cite fidelement, mais le constat comble une ambiguite qu'il aurait du  |
| Article 15, 9° | Exonérer l'importation et la vente de bateaux et de filets de pêche. | REFUTÉ sur deux fondements indépendants, l'un factuel (angle 2), l'autre juridique (angle 1 sur le raisonnement, pas sur la citation). 1) « PAS DU TOUT » est faux : l'exonération de l'art. 15, 9° est servie par le mécanisme GÉNÉRI |
| Article 15, 11° | Exonérer l'importation et la vente de moustiquaires. | Le constat est bien fondé en droit et mal fondé en fait : il teste la mauvaise chose. 1) ANGLE 1 · je concède. L'article est cité fidèlement. Le fichier porte, l. 310 : « 11. l'importation et la vente de moustiquaires ; », sans «  |
| Article 15, 13° | Exonérer huit catégories d'importations, chacune assortie de conditions propres : échantillons sans valeur com | Le constat tombe sur trois points, dont deux sont fatals. 1) SA GRAVITÉ « PARTIEL » EST FABRIQUÉE. Le seul élément positif qu'il produit est la lettre l de l'article 339, 1° du code des douanes · et il écrit lui-même que « c'est u |
| Article 15, 14° | Exonérer les ventes d'œuvres d'art originales par l'ARTISTE CRÉATEUR · condition de qualité du vendeur, une re | Le constat tombe sur deux angles à la fois. (1) IL FAIT DIRE À L'ARTICLE MOINS QU'IL NE DIT. Il réduit l'art. 15, 14° à « une condition de qualité du VENDEUR », et c'est sur cette réduction · et sur elle seule · qu'il fonde sa gra |
| Article 15, 15° | Exonérer l'importation et la vente de cercueils. | REFUTÉ sur l'angle 2 (l'obligation est déjà servie, par un canal que le grep du constat ne pouvait pas voir), et partiellement affaibli sur l'angle 3. L'angle 1 ne donne rien : le constat cite fidèlement. 1) TEXTE · rien à redire, |
| Article 15, point 15 | Ne pas taxer l'importation et la vente de cercueils, sans condition de qualité du vendeur ni de destination. | Le constat tombe sur deux points, l'un juridique, l'autre matériel. 1) L'OBLIGATION EXISTE, MAIS ELLE EST ENTIÈREMENT SERVIE · ET LE CONSTAT LE CONCÈDE. L'article est bien lu : /root/.claude/skills/synced/80921ba8-2ca0-4a8a-b7c1-4 |
| Article 15, point 16 | Ne pas percevoir la TVA à l'IMPORTATION de quatre produits limitativement énumérés : blé, maïs, farine de from | CONSTAT RÉFUTÉ sur les angles 1 et 3, l'angle 2 étant concédé pour partie mais sans effet sur la gravité annoncée. La citation du point 16 est fidèle et la vérification du dépôt est exacte ; c'est la QUALIFICATION du point 16 en « |
| Article 15, point 18 | Ne pas taxer la vente LOCALE de bêtes SUR PIED (ni l'importation, ni la viande abattue n'étant visées). | Angle 1 ne donne rien et je le concède : la citation est exacte, l'article est le bon, le point est en vigueur. Angle 3 ne donne rien non plus : ne pas collecter la TVA sur une opération exonérée est bien une obligation du redevab |
| Article 15, point 21 | Ne pas taxer les livraisons de Fuel Oil Marché Intérieur (les livraisons seules, non l'importation). | CONSTAT REFUTE · sur quatre points, dont un erreur de fait dans sa propre preuve. 1) LA PREUVE AVANCEE COMPTE FAUX. Le constat affirme deux fois que l'en-tete de l'art. 15 « enumere sept textes modificatifs ». Les lignes 266-269 e |
| Article 17, point 1 | Exonérer la composition, l'impression, l'importation et la vente des journaux, livres et périodiques, À L'EXCL | CONSTAT REFUTE, sur trois plans independants, dont deux sont des erreurs de fait verifiables. 1) L'ARTICLE 17, POINT 1 NE PORTE AUCUNE OBLIGATION. Lu a l'instant (l. 379-392), son chapeau est : « Sont exonerees de la taxe sur la v |
| Article 17, point 2 | Exonérer la location de livres, périodiques et autres supports magnétiques à contenu scientifique, éducatif, c | CONSTAT RÉFUTÉ, mais pas sur son fait brut : sur sa qualification (« PAS DU TOUT ») et sur sa gravité. Trois points, tous lus à l'instant. 1) ANGLE 1 · LE TEXTE. L'article est bien le bon et le point bien le 2. VERBATIM, fichier . |
| Article 17, point 3 | Exonérer les recettes liées aux visites des monuments historiques et musées NATIONAUX, des parcs zoologiques e | La preuve avancée sonde la mauvaise couche. Le constat cherche « musée », « monument », « zoologique », « botanique » et conclut de leur absence que l'exonération n'est « PAS DU TOUT » servie. Or OmegaX ne code pas les exonération |
| Article 17, point 6 | Exonérer le transport des malades et des blessés par des moyens de transport spécialement équipés à ces fins. | Le constat est refute sur son affirmation centrale · « ne servirait PAS DU TOUT cette obligation » · parce que sa preuve est un grep lexical sur un mecanisme que le logiciel a delibérément choisi de ne PAS nommer point par point.  |
| Article 17, point 7 | Exonérer les prestations faites par les pompes funèbres et le transport de corps. | Le constat cite le texte fidèlement (angle 1 ne donne rien : l. 408 du fichier lu porte bien, verbatim, « 7. les prestations faites par les pompes funèbres et le transport de corps ; » sous l'Article 17, chapeauté par « Sont exoné |
| Article 17, point 8 | Exonérer les prestations des ASBL légalement constituées effectuées dans le cadre de leurs ACTIVITÉS NORMALES, | La preuve avancée est fausse sur son point décisif. Le constat affirme : « La condition de concurrence n'apparaît NULLE PART côté TVA : grep -rn -i "distorsion" ne rend, hors groupe, que /home/user/comptaflow/src/modules/fiscalite |
| Article 17, point 13 | Exonérer treize catégories de prestations maritimes et portuaires effectuées pour les BESOINS DIRECTS des navi | Le constat est exact sur le TEXTE et faux sur le LOGICIEL. Angle 1 : rien à redire. J'ai relu l'article dans `/root/.claude/skills/synced/80921ba8-2ca0-4a8a-b7c1-4d4972fcb762_a1cd7539-5871-4b3d-820b-8de8737ca38b/fiscalite-rdc/code |
| Article 17, point 14 | Exonérer les seuls INTÉRÊTS relatifs aux crédits bancaires à l'investissement, aux crédits-bails, aux crédits  | Le constat cite le texte fidèlement · sur ce point il est irréprochable · mais il se trompe de REDEVABLE, et son accroche comptable est à l'envers. 1) LE DESTINATAIRE. Le chapeau de l'article 17 (l. 382) énonce : « Sont exonérées  |
| Article 17, point 15 | Exonérer les intérêts rémunérant les dépôts effectués auprès des établissements de crédit par des NON-PROFESSI | Angle 3 · l'obligation est HORS PÉRIMÈTRE, et non « incomplète ». L'exonération de l'art. 17, point 15 s'applique dans les livres de celui qui rend la prestation exonérée, c'est-à-dire l'ÉTABLISSEMENT DE CRÉDIT qui reçoit le dépôt |
| Article 17, point 16 | Exonérer les intérêts rémunérant les emprunts extérieurs. | RÉFUTÉ sur l'angle 3 (destinataire), avec renfort de l'angle 2 (la conséquence est déjà produite) et de la contradiction interne du constat. L'angle 1 est CONCÉDÉ au constat : l'article visé est le bon, et la citation est fidèle a |
| Article 17, point 17 | Exonérer les OPÉRATIONS de crédit social ou agricole effectuées par les caisses de crédit mutuel, les coopérat | Le constat est mal dirigé : l'article 17, point 17 ne pèse que sur des redevables que ce logiciel ne peut, par construction légale, pas servir · et le constat s'appuie précisément sur le fichier qui le dit. 1) L'obligation existe  |
| Article 17, point 18 | Exonérer les prestations se rapportant directement aux opérations pétrolières, réalisées par des prestataires  | Le constat cite bien le bon article et le cite fidèlement, mais il tombe sur les angles 2 et 3 : l'obligation EST servie, par un mécanisme générique, documenté et testé, que le grep du constat ne pouvait pas atteindre ; et ce qui  |
| Article 18, point 1 | Exonérer les ventes de billets d'accès aux manifestations de loisirs dans les installations sportives, sous la | ANGLE 1 · rien à prendre : le constat cite fidèlement. L'article visé est le bon (Article 18, l. 497), le chapeau est reproduit sans forçage, le point 1 est exact, et le constat signale honnêtement que le texte de la taxation spéc |
| Article 18, point 4 | Exonérer les GAINS DES PARIEURS dans le cadre des jeux de hasard, sous la condition du chapeau. | REFUTE sur les angles 3 et 2. L'angle 1 est concédé : la citation est fidèle et l'article est le bon. 1) ANGLE 1 · RIEN À REPROCHER À LA CITATION, MAIS LE POINT N'EST PAS UNE OBLIGATION. Lecture faite à l'instant dans le fichier d |
| Article 19, alinéa 1 | Exonérer, sous réserve de réciprocité, les biens et services destinés à l'USAGE OFFICIEL des missions diplomat | Le constat tombe sur les trois angles à la fois. 1) MAUVAIS ARTICLE. L'art. 19, al. 1 de l'O.-L. n° 10/001 porte UNE seule obligation : ne pas taxer. « Sous réserve de réciprocité, les biens et services destinés à l'usage officiel |
| Article 19, alinéa 2 | Facturer la TVA aux fonctionnaires internationaux, agents diplomatiques et assimilés en poste en RDC : ils son | Le constat transforme un ÉNONCÉ DE SITUATION en OBLIGATION D'ACTION, et en tire un manque là où le logiciel produit déjà le résultat légal. 1) La citation n'est pas fidèle. Texte lu à l'instant, fichier `.../fiscalite-rdc/code-gen |
| Article 20 | Écarter toute exonération ou exemption de TVA fondée sur un texte particulier en dehors des articles 15 à 19 : | L'article est cité fidèlement, mais il ne porte pas l'obligation qu'on lui prête, et le verrou qu'il pose est déjà respecté par construction dans OmegaX. Trois défauts cumulés. (1) DESTINATAIRE. L'art. 20 verbatim (fichier skill ` |
| Article 21 (Section 4 : De la territorialité) | Soumettre à la TVA congolaise toutes les opérations réalisées en RDC, même lorsque le domicile, la résidence o | RÉFUTÉ, sur trois fronts convergents · la fidélité du texte tient, mais l'inférence qui fonde le grief ne tient pas, et la prémisse de fait est fausse. 1) L'ARTICLE EST BIEN CITÉ, MAIS CE N'EST PAS UNE OBLIGATION CODABLE. Lu à l'i |
| Article 22, alinéa 2 | Réputer perçues en RDC les commissions des agences de voyage et entreprises assimilées sur les ventes de titre | REFUTE, principalement sur l'angle 1 (l'obligation n'existe pas dans les termes du constat) et sur l'angle 2 (ce que le constat reclame est deja porte par le depot, sous un autre nom). 1) L'ARTICLE 22, ALINEA 2 NE PORTE PAS L'OBLI |
| Article 23 bis (Section 5 : Des achats en franchise de taxe  | Aucun contenu opérant : l'unique article de la Section 5 est supprimé, et plus aucun achat en franchise de TVA | Le constat se réfute sur l'angle 1, et accessoirement sur l'angle 3. 1) IL N'Y A PAS D'OBLIGATION · LE CONSTAT L'ÉCRIT LUI-MÊME. L'article 23 bis, lu à l'instant (l. 569-570), se compose en tout et pour tout de son intitulé et de  |
| Article 24, point 1 | Pour les ventes de biens meubles corporels, le fait générateur est constitué par la LIVRAISON du bien. | REFUTE. Le constat repose sur une lecture PHYSIQUE de la « livraison » que l'ordonnance-loi elle-même et son décret d'application excluent en toutes lettres : la livraison y est le TRANSFERT DU POUVOIR DE DISPOSER, « effectif même |
| Article 24, point 2 | Pour les prestations de services, y compris les travaux à façon et les travaux immobiliers, le fait générateur | Constat mal fondé sur l'article invoqué, et théorie du préjudice contredite par le texte. (a) L'article 24, 2° ne porte qu'une QUALIFICATION (« Le fait générateur … est défini comme l'événement qui donne naissance à la créance fis |
| Article 24, point 3 | Pour les importations et les exportations, le fait générateur est le franchissement des frontières de la Répub | REFUTE sur les trois angles a la fois. (1) MAUVAIS ARTICLE POUR LA CONSEQUENCE VISEE. L'art. 24 ne fait que DEFINIR : « Le fait generateur de la taxe sur la valeur ajoutee est defini comme l'evenement qui donne naissance a la crea |
| Article 24, point 4 | Pour les marchandises placées sous régimes douaniers suspensifs, le fait générateur est la mise à la consommat | Le constat est mal fondé sur deux plans. (1) Il loge sous l'art. 24, point 4 une règle de DATATION qui n'y est pas : l'art. 24 ne fait que définir « l'événement qui donne naissance à la créance fiscale » ; la date qui oblige le re |
| Article 24, point 5 | Pour les marchandises en zone franche, le fait générateur est la sortie des marchandises de la zone franche en | CONSTAT REFUTE. Les greps sont exacts · « zone franche » ne figure nulle part dans /home/user/comptaflow (vérifié : `grep -rni "franche"` ne rend que « franchement / suppression franche » et le champ `franchiseDouaniere`, sans rap |
| Article 24, point 8 | Pour les livraisons à soi-même de biens ou de services, le fait générateur est la première utilisation ou la p | Le constat cite l'article fidèlement (angle 1 ne donne rien : art. 24, point 8, lu à la l. 602-603 du fichier, sans crochet de modification, sans « peut », sans renvoi à décret), et l'obligation pèse bien sur le redevable (angle 3 |
| Article 24, point 10 | Règle balai : pour toutes les autres opérations imposables non visées aux points 1 à 9, le fait générateur est | CONSTAT RÉFUTÉ · il applique un article de FAIT GÉNÉRATEUR à un champ d'EXIGIBILITÉ, et confond une catégorie résiduelle de la loi avec une indétermination du plan de comptes. 1) MAUVAIS ARTICLE POUR LE CHAMP ATTAQUÉ. La fonction  |
| Article 25, point 4 | En cas d'escompte d'un effet de commerce, la TVA est exigible à la date de l'échéance de l'effet, et non à la  | L'obligation est bien citée fidèlement (art. 25, point 4 existe dans ces termes), et elle pèse bien sur le redevable : le constat tombe sur l'angle 2. Sa « preuve avancée » affirme un fait sur le code qui est structurellement impo |
| Article 25, point 5 | Pour les opérations de crédit à la consommation ou de crédit-bail réalisées par les établissements financiers, | CONSTAT RÉFUTÉ. La citation de l'art. 25, point 5 est fidèle et le numéro d'article est le bon (angle 1 concédé sur ce point), et le code n'implémente effectivement que les points 1° et 2° de l'art. 25 (angle 2 concédé : `baseExig |
| Article 26, alinéa 1 | Option pour les débits, sous conditions cumulatives (qualité, demande, circonstances particulières, décision d | CONSTAT RÉFUTÉ · il impute à l'art. 26, al. 1 une borne temporelle que l'alinéa ne porte pas, et il complète son grief par deux exigences hors périmètre. 1) ANGLE 1 · L'ALINÉA 1 NE PORTE AUCUNE RÈGLE DE DATE. Lu à l'instant dans / |
| Article 26, alinéa 2 | L'autorisation d'acquitter d'après les débits reste valable jusqu'à demande ÉCRITE du redevable de revenir au  | La preuve avancée repose sur une affirmation de fait vérifiable et FAUSSE · « Cet article [décret n° 011/42, art. 63] n'est cité nulle part dans le dépôt » · alors qu'il est cité DEUX FOIS, avec sa substance entre guillemets, dans |
| Art. 27, alinéa 1er | La base comprend tout ce qui est perçu en contrepartie, subventions comprises, ainsi que tous frais, impôts, d | REFUTÉ sur quatre plans. Le constat vise le bon article · l'art. 27 al. 1er de l'O.-L. n° 10/001 est bien la base d'imposition de la TVA, et c'est bien une obligation du redevable, donc dans le périmètre · et ses trois citations d |
| Art. 27, point 1 | Produits importés : base = valeur CIF majorée des droits d'entrée et, le cas échéant, des droits de consommati | REFUTÉ sur l'angle 3 (destinataire de l'obligation), confirmé par l'angle 1 (le constat requalifie le texte en une obligation qu'il ne porte pas). 1) LA CITATION EST FIDÈLE, MAIS LE CONSTAT LUI FAIT DIRE AUTRE CHOSE. L'art. 27 est |
| Art. 27, point 2 | Exportations de marchandises : base = valeur FOB. | REFUTE sur le canal d'effet, sur la nature du grief et sur la lecture du code · la citation de l'article, elle, est exacte. 1) L'OBLIGATION EXISTE ET EST CITEE FIDELEMENT, MAIS ELLE EST ILLUSTRATIVE, PAS AUTONOME. Fichier /root/.c |
| Art. 27, point 3 | Sorties de zone franche : base = valeur des produits au moment de leur sortie de la zone franche. | CONSTAT RÉFUTÉ sur trois de ses quatre appuis. Le grep est exact · « zone franche » ne figure nulle part dans le dépôt · mais aucune des trois inférences que le constat en tire ne tient : (1) il isole le point 3 de l'art. 27 de so |
| Art. 27, point 4 | Livraisons de biens : base = toutes sommes ou valeurs, tous avantages, biens ou services reçus ou à recevoir p | Le constat cite l'article fidèlement et vise bien une règle d'assiette qui pèse sur le redevable (angles 1-fidélité et 3 échouent), mais il s'effondre sur trois points. (1) LA PREUVE NE PORTE PAS SUR L'ART. 27. Les deux extraits d |
| Art. 27, point 5 | Prestations de services : base = tout ce qui est reçu ou à recevoir en contrepartie et, le cas échéant, la val | REFUTÉ, mais pas sur les faits : sur la QUALIFICATION. Le constat est exact quand il dit que « biens consomptibles » n'apparaît nulle part dans le dépôt (vérifié : les seules occurrences de « consomptible » sont la dotation SYCEBN |
| Art. 27, point 6 | Échanges : base = valeur des produits reçus en paiement du bien livré, augmentée le cas échéant de la soulte. | REFUTÉ sur deux plans : le constat érige en « régime » ce que le texte donne comme simple illustration, et sa prémisse sur le code est fausse. 1 · LE TEXTE NE CRÉE AUCUN « RÉGIME D'ÉCHANGE ». Lu à l'instant dans `10-tva-ol10-001-l |
| Art. 27, point 7 | Travaux immobiliers : base = montant des marchés, mémoires ou factures. | REFUTE. L'obligation existe bien et vise le redevable, mais le constat se trompe sur ce que le texte prescrit ET sur ce que le logiciel fait. Trois plans. 1) LE TEXTE NE PORTE PAS DE « REGLE PROPRE » A CHERCHER DANS LE LOGICIEL. L |
| Art. 27, point 11 | Opérations de crédit-bail : base = montant des loyers facturés par la société de crédit-bail. | REFUTÉ sur la qualification. Le constat cite le point 11 exact, mais amputé du chapeau qui le gouverne, et c'est ce mot retranché qui décide de tout : l'article 27 introduit ses douze points par « Elle est notamment constituée par |
| Art. 27, point 12 | Marchés publics : base = prix du marché, toutes taxes comprises. | Le constat est mal fondé sur les deux plans où il se juge lui-même : il lit le point 12 contre l'alinéa qui le gouverne, et il en tire un dommage qui n'existe pas ; correctement lu, le point 12 EST déjà servi par le chemin de calc |
| Art. 28, point 1 | Inclusion dans la base des compléments de prix acquittés à titre divers par l'acquéreur ou le client. | Le constat cite fidèlement l'article et vise le bon numéro : il n'est pas mal fondé sur le texte. Il tombe sur son raisonnement de gravité, dont deux des trois affirmations empiriques sont démenties par le code. 1) L'ARTICLE EST B |
| Art. 28, point 3 | Inclusion dans la base des subventions qui sont l'unique contrepartie d'une opération imposable, qui en consti | Le constat repose sur une citation infidèle de l'art. 28, point 3, qui transforme une condition CUMULATIVE en trois branches autonomes, puis tire de cette troisième branche inventée la conclusion que la déclaration serait « insuff |
| Art. 28, point 4 | Inclusion dans la base des frais accessoires aux livraisons de biens (commissions, intérêts, emballage, gardie | REFUTE sur les angles 1 et 3. (1) Le constat fait dire à l'art. 28, point 4 une interdiction qu'il ne porte pas · il en tire que « rien n'empêche de la porter [...] sur une facture séparée. Or c'est précisément ce que l'article in |
| Art. 29, point 1 | Exclusion de la base des escomptes, remises, rabais, ristournes et autres réductions de prix, à deux condition | Le constat tombe sur son propre pivot : sa gravité est CALENDRIER, et le calendrier qu'il oppose au logiciel n'est écrit dans aucun des textes lus. Trois ruptures. 1) LA DATE « DUE TOUT DE SUITE » N'EST DANS AUCUN TEXTE. L'art. 29 |
| Art. 29, point 4 | Exclusion de la base des indemnités ayant le caractère de dommages-intérêts. | RÉFUTÉ · non sur l'existence de l'obligation, mais sur son imputation et sur sa note. ANGLE 1 (l'obligation existe-t-elle, dans ces termes, sous ce numéro ?) · LE CONSTAT TIENT, et je le dis. Lu à l'instant dans `10-tva-ol10-001-l |
| Art. 29, point 5 | Exclusion de la base des primes et subventions d'équipement, à condition qu'elles soient affectées au financem | REFUTÉ sur deux plans, dont chacun suffit à faire tomber la gravité INCOMPLET. 1) LA PREUVE AVANCÉE NE PORTE PAS SUR L'OBLIGATION CITÉE. Le constat produit `taux-tva.service.ts` l. 147-153 et 132-136, qui sont du pur art. 43 · et  |
| Art. 29, point 6 | Exclusion de la base des sommes remboursées aux intermédiaires, hors agents de voyage et organisateurs de circ | Le constat vise le bon article et le paraphrase à peu près fidèlement, mais il s'effondre sur ses trois affirmations opérantes · « PAS DU TOUT », « le seul point d'accroche possible », « ni servies ni signalées » · et sur sa remar |
| Art. 29, point 7 | Exclusion de la base des intérêts perçus ayant le caractère d'intérêts moratoires. | Le constat est mal fondé sur l'article qu'il invoque, et il qualifie de « partiel » un service qui est complet. 1) L'article 29, point 7 est cité fidèlement, mais il ne porte PAS l'obligation reprochée. Lu à l'instant (fichier de  |
| Art. 31, alinéa 2 | Biens d'occasion importés : base déterminée conformément à la législation douanière. | REFUTÉ SUR L'ANGLE 3 (destinataire), avec un vice de preuve surajouté. L'obligation existe et est citée fidèlement, mais elle ne s'exécute ni dans les livres du redevable ni dans un logiciel de comptabilité : c'est une règle d'ass |
| Art. 35 · taux réduit de 5 % sur les billets d'avion | Taux réduit de 5 % applicable à la vente des billets d'avion sur le trafic aérien national · seul cas de taux  | Le constat est REFUTE sur son seul fondement gradé (CALENDRIER), et ses deux réserves résiduelles ne portent pas. 1) LA CITATION DE L'OBLIGATION EST FIDÈLE · ce point-là survit. L'article visé est le bon. /root/.claude/skills/.../ |
| Art. 35 · taux réduit de 1 % sur les intrants du ciment | Taux réduit de 1 % à l'acquisition des intrants nécessaires à la fabrication locale du ciment. | Le constat vise le BON article et le cite fidèlement · cet angle-là échoue, je le dis franchement. Mais il s'effondre sur trois autres : (1) il se contredit lui-même · on ne peut pas noter un logiciel « INCOMPLET » contre un stand |
### Ce que cette passe apprend sur la méthode

- **La réfutation a encore écarté six constats sur dix**, mais elle a aussi
  renforcé plusieurs de ceux qu'elle a laissés vivre : sur l'art. 2, le
  réfutateur a trouvé quatre règles opérantes que le confronteur avait manquées
  et a corrigé au passage trois renvois de ligne faux, sans toucher au fond.
  Un réfutateur qui vérifie le NUMÉRO d'article et les LIGNES autant que le fond
  produit un relevé qu'on peut ouvrir devant un inspecteur.
- **Un test peut interdire de déclarer une lacune.** C'est la découverte de
  méthode de cette passe. `hors-scope-tva.spec.ts` avait été écrit pour prouver
  une couverture ; il a fini par en garantir la surestimation. Un test qui
  bannit un numéro d'article d'une liste de manques doit désormais être lu comme
  suspect : il faut exiger la réserve exacte, jamais interdire le mot.
- **Une doublure qui ne filtre pas valide un code qui ne charge pas.** Même
  famille de défaut que la doublure de `findFirst` de la passe I2, qui répondait
  la même chose à deux questions différentes. Quand un correctif dépend de ce
  que la requête RAMÈNE, il faut un test sur la requête elle-même, pas seulement
  sur son résultat simulé.
- **Le corpus change le rendement de la passe.** Une loi de champ d'application
  (définitions, exonérations, fait générateur) produit des constats plus
  vérifiables qu'un décret de procédure : 62 % de réfutation contre 83 %. À
  budget égal, F2b sur les déductions et les obligations devrait se rapprocher
  du régime de F1.
