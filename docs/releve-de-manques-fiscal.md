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

## Passe F2b · Ordonnance-loi n° 10/001 sur la TVA, chapitres V à X (2026-09-13)

**Corpus** · même fichier, lignes 960 à 1754. Chapitre V (régime des
déductions, avec ses quatre sections), chapitre VI (obligations des
redevables), chapitre VII (liquidation, recouvrement, remboursement), chapitre
VIII (procédures), chapitre IX (pénalités), le bloc intercalé intitulé
« CHAPITRE III : DES MESURES RELATIVES AUX RECETTES NON… » et chapitre X
(dispositions transitoires et finales).

**Volumétrie** · 137 agents, 16,1 M de jetons, 4 h 50. Six blocs de lecture,
six confrontations, un réfutateur à `xhigh` par constat.

**Résultat** · 125 constats soumis à réfutation, **46 écartés**, **79 retenus**,
dont **17 de gravité FAUX**. Le taux de réfutation tombe à 37 %, contre 62 % en
F2a et 83 % en F1 · la moitié « déductions, obligations, pénalités » d'une loi
fiscale est faite d'obligations vérifiables, là où le champ d'application est
fait de définitions.

**F2 est close.** Ses deux runs sont dépouillés.

### Ce qui est corrigé dans le code, et testé

#### L'article 41 était fermé au SYCEBNL sur une affirmation FAUSSE

Le module portait en commentaire, et un spec gelait, la phrase suivante :
« SYSCOHADA SEUL. Le plan SYCEBNL n'a ni 6383 ni 6384 ni 6181 : ses charges
externes sont agrégées en 61800000 et 63800000 (compte-seed.ts l. 765 et 782). »
**Les trois comptes y sont, sous les mêmes intitulés que le SYSCOHADA** ·
`compte-seed.ts` l. 824 « Voyages et déplacements », l. 887 « Réceptions »,
l. 888 « Missions », plus l. 822 « Transports du personnel ». Et les deux
renvois de ligne donnés à l'appui ne portent rien de tel : la l. 765 est une
provision de classe 5, la l. 782 un compte d'achats.

Le coût était double. Un dossier SYCEBNL assujetti · **une ASBL ou une ONG
taxée sur une activité accessoire, c'est-à-dire le public même du logiciel** ·
déduisait 100 % de la TVA sur ses réceptions, ses missions et ses voyages, mois
après mois. Et la déclaration lui donnait une **raison fausse de ne pas
regarder**, en annonçant « un plan qui agrège ses charges externes ». C'est la
doctrine du dépôt retournée contre lui : une lacune déclarée à tort est aussi
fausse qu'une règle inventée, et celle-ci empêchait d'appliquer une règle que
le dépôt savait déjà écrire.

`partExclueArt41` ne prend plus de référentiel en paramètre · **c'est le numéro
semé qui décide**, et une racine qui ne rencontre aucun compte du plan ne
déclenche rien. C'est exactement le cas du 62760000 « Cadeaux à la clientèle »,
semé au seul SYSCOHADA : il reste sans effet ailleurs, et s'appliquerait de
lui-même si un plan l'ouvrait un jour sous le même intitulé.

La discipline, elle, ne bouge pas · on ne retient un compte que si l'intitulé
semé reprend les mots de l'article, et les cinq numéros ont été relus **dans
les deux semis** avant d'ouvrir la table.

#### Les produits pétroliers sont comptés et nommés, jamais amputés

Le 60420000 « Matières combustibles » est semé aux deux plans et l'article le
frappe sur **trois points qui ne disent pas la même chose** · le 3° exclut les
produits pétroliers sauf revente par grossistes ou production d'électricité
revendue, le 3° bis les exclut sauf carburants d'appareils fixes industriels ou
d'aéronefs, le 3° ter les limite à 50 % « pour les cas autres que ceux visés
aux points 3 et 3bis ». Aucun pourcentage n'est appliqué : les exceptions des
deux premiers points se recouvrent, le règlement auquel le 3° bis renvoie est
absent du corpus, et l'articulation des trois points n'est pas tranchée par le
texte lu. Le montant est donc **compté, nommé sur la déclaration avec ses trois
points, et laissé déduit** · appliquer 50 % au jugé serait inventer une règle.

#### Un test qui bannit un mot, troisième occurrence

`hors-scope-tva.spec.ts` bannissait « art. 25 » ; F2a l'a corrigé. Il bannissait
aussi « art. 63 », et cette interdiction a bloqué **une déclaration de manque
parfaitement fondée** : pour dire que le crédit dont le remboursement a été
demandé ne peut donner lieu à imputation (art. 66), il faut nommer l'imputation
de l'art. 63 que le module opère. Une interdiction de MOT est trop large par
construction. Le test lit désormais **la tête de chaque puce** et exige
qu'aucune ne prenne pour SUJET un article couvert · citer un article servi dans
la description d'un manque voisin reste permis.

#### Onze lacunes nommées, aucune comblée de mémoire

Portées au hors-scope avec leur règle écrite, jamais seulement leur numéro :
la **retenue à la source** de l'art. 53 al. 2 et sa sanction (art. 74 ter,
amende égale au montant de la retenue) ; le **crédit dont le remboursement a
été demandé** (art. 66) ; la perte du droit à déduction après **taxation
d'office** (art. 69 ter) et après manquement au **paiement scriptural** au
seuil de 1 000 000 FC (art. 59 bis et 74 bis) ; la **taxe due du seul fait de
sa mention** et les trois amendes du triple (art. 59, 70, 71, 74 al. 2), qui
supposent toutes de rapprocher deux gisements que le dépôt tient en parallèle,
la FACTURE et l'ÉCRITURE ; l'**art. 40 al. 2** (les immobilisations détenues à
l'entrée dans le champ n'ouvrent pas droit à déduction) ; l'**art. 42 point 1**
pour ses dépenses accessoires, avec ses trois contre-exceptions écrites ; les
**points 3 et 4 de l'art. 42**, dont le premier réserve lui-même son
application à un arrêté non paru ; l'**art. 43 al. 3** (les ventes aux missions
diplomatiques et aux organisations internationales vont au numérateur, et
faute de compte elles font baisser le prorata, toujours au détriment du
dossier) ; l'**art. 45 al. 1** pour le nouvel assujetti, qui est le seul à
déclarer douze proratas différents faute d'un champ de prévisionnel ; et
l'**art. 36 point 4**, dont la fiche d'immobilisation engendre une écriture à
deux lignes sans place pour la taxe.

### Vérification

Cinq réinjections de défaut, cinq attrapées · l'article 41 refermé sur le seul
SYSCOHADA (10 tests tombent), les produits pétroliers retirés de la liste, la
puce de l'art. 66 effacée, le semis SYCEBNL privé de son intitulé
« Réceptions », et le paragraphe de correction privé de la trace de ce qu'il
corrige. 231 suites / 3 474 tests serveur, 41 fichiers / 468 tests client.

### Les soixante et un autres constats retenus, portés au relevé sans correction

| Article | Ce que le texte impose | Gravité |
|---|---|---|
| Article 36, point 4 (quatrième phrase) | Les amortissements de ces biens sont, pour l'assiette de l'impôt sur les bénéfices, calculés sur base du coût d'achat ou de revient hors TVA déductible. | INCOMPLET |
| Article 38, point 1 (modifié par l'O.-L. n° 13/007 et par la L.F. n° 22/071) | Pour être déductible, la TVA doit figurer sur une facture normalisée ou un document en tenant lieu, dûment délivré par un assujetti et mentionnant son numéro impôt · trois conditions cu | INCOMPLET |
| Article 38, point 2 | À l'importation, le support justificatif de la déduction est exclusivement la déclaration de mise à la consommation établie par la douane. | INCOMPLET |
| Article 39 (modifié par l'O.-L. n° 13/007 et par la L.F. n° 20/020) | Les déductions afférentes aux exportations ne sont définitivement acquises que lorsque l'effectivité de l'exportation est établie par les documents douaniers ET par ceux relatifs au rap | INCOMPLET |
| Article 40, première phrase | Déduction du stock d'entrée : la TVA sur les biens non immobilisés en stock à la date d'assujettissement est déductible si les biens sont destinés EXCLUSIVEMENT à des opérations ouvrant | INCOMPLET |
| Article 41, point 2 | EXCLUSION pour les biens et services acquis par l'entreprise mais utilisés par des tiers, les dirigeants ou le personnel, sauf vêtements de travail ou de protection, locaux et matériel  | INCOMPLET |
| Article 41, point 3 | EXCLUSION pour les produits pétroliers, sauf ceux destinés à la revente par les grossistes ou acquis pour la production d'électricité devant être revendue. | INCOMPLET |
| Article 41, point 3bis | EXCLUSION des produits pétroliers, sauf carburants utilisés par des appareils fixes comme combustibles dans les entreprises industrielles (dans les conditions fixées par voie réglementa | INCOMPLET |
| Article 41, point 4 | EXCLUSION par accessoire : les services de toute nature, notamment la location, l'entretien et la réparation, afférents à des biens, produits ou marchandises eux-mêmes exclus du droit à | INCOMPLET |
| Article 41, point 5 | EXCLUSION pour les objets mobiliers autres que ceux utilisés par l'assujetti pour son exploitation. | INCOMPLET |
| Article 41, point 6 | EXCLUSION pour les immeubles autres que les bâtiments et locaux à usage professionnel. | INCOMPLET |
| Article 42, point 2 | EXCLUSION pour les transports de personnes et les opérations accessoires, sauf transports réalisés pour le compte d'une entreprise de transport public de voyageurs ou en vertu d'un CONT | INCOMPLET |
| Article 42, point 4 | EXCLUSION pour la TVA sur une facture émise par une personne physique ou morale introuvable à l'adresse communiquée à l'Administration des Impôts, ou sur une facture dont l'adresse rens | INCOMPLET |
| Article 43, al. 2, 1er tiret (l. 1115) · numérateur annuel, exportations incluse | Numérateur : montant ANNUEL des recettes afférentes aux opérations ouvrant droit à déduction, y compris les exportations et opérations assimilées. | INCOMPLET |
| Article 43, al. 2, 2e tiret (l. 1118) · dénominateur et ses quatre exclusions | Dénominateur : recettes annuelles de toute nature, à l'exclusion des cessions d'éléments de l'actif immobilisé, des subventions d'équipements, des indemnités d'assurance non contreparti | INCOMPLET |
| Article 43, al. 4 (l. 1127) · définition des recettes | Les recettes s'entendent tous frais, droits et taxes compris, à l'exclusion de la TVA · règle de valorisation des DEUX termes du rapport. | INCOMPLET |
| Article 43, al. 5 (l. 1129) · livraisons et prestations à soi-même | Le montant des livraisons et prestations à soi-même est exclu des DEUX termes du rapport. | INCOMPLET |
| Article 45, al. 2 (l. 1150) · prorata définitif au 31 mars et régularisation | Arrêter le prorata définitif au plus tard le 31 mars de l'année suivante, puis régulariser les déductions opérées à l'échéance qui suit. | CALENDRIER |
| Article 46, al. 1 (l. 1158) · variation de plus de 10 % sur quatre ans, immobili | Sur chacune des quatre années suivant l'acquisition ou la première utilisation d'une immobilisation, comparer le prorata définitif au précédent et, si l'écart excède 10 %, reverser ou d | INCOMPLET |
| Article 49, al. 2, 2e et 3e phrases (l. 1186) · comptabilité séparée et déductio | L'option est subordonnée à la tenue d'une comptabilité séparée par secteur ; la TVA est alors intégralement déductible ou non selon le secteur. | INCOMPLET |
| Article 50, al. 1 (l. 1202) · fait générateur du reversement et délais de 4 et 1 | Reverser une fraction de la TVA antérieurement déduite en cas de sortie d'actif d'un bien immobilisé déduit, ou, sans sortie, de modification de sa situation au regard du droit à déduct | INCOMPLET |
| Article 50, al. 2 (l. 1210) · formule du cinquième ou du vingtième | Fraction à reverser = montant de la déduction diminué, selon le cas, d'un cinquième ou d'un vingtième par année OU FRACTION D'ANNÉE depuis l'acquisition. | INCOMPLET |
| Article 50, al. 3 (l. 1213) · droit à déduction de l'acquéreur | En cas de cession, l'acquéreur peut déduire la TVA correspondant au montant reversé par le vendeur, à deux conditions cumulatives : le bien constitue une immobilisation pour lui, et il  | INCOMPLET |
| Article 50, al. 4 (l. 1217) · attestation du vendeur | La déduction de l'acquéreur est subordonnée à la délivrance par le vendeur d'une attestation mentionnant le montant de la taxe reversée. | INCOMPLET |
| Article 50, al. 5 (l. 1219) · reversement INTÉGRAL sur biens non immobilisés et  | Reversement intégral, sans fractionnement, de la TVA initialement déduite sur les services et biens ne constituant pas des immobilisations, lorsqu'ils ont été utilisés à des opérations  | INCOMPLET |
| Article 51, al. 1 (l. 1225) · vente à perte | En cas de vente à perte, la déduction de la TVA d'amont est limitée au montant de la TVA due sur la vente ; la déduction initiale doit être régularisée à due concurrence. | INCOMPLET |
| Article 51, al. 2 (l. 1229) · disparition et changement d'affectation | Reversement obligatoire de la TVA déduite en cas de disparition ou de changement d'affectation des biens ou produits destinés à l'exploitation. | INCOMPLET |
| Article 52, al. 1 (l. 1234) · récupération par voie d'imputation | La TVA acquittée sur des ventes ou services ultérieurement résiliés, annulés ou restés impayés peut être récupérée, par voie d'imputation seulement, sur l'impôt dû pour les opérations f | INCOMPLET |
| Article 54, alinéa 1er (modifié par la L.F. n° 18/025 du 13 décembre 2018) | Toute personne assujettie à la TVA est identifiée par un NUMÉRO TVA, dont les modalités d'attribution sont déterminées par un Arrêté du Ministre ayant les Finances dans ses attributions | INCOMPLET |
| Article 54, alinéa 2 (modifié par la L.F. n° 18/025 du 13 décembre 2018) | Souscrire une déclaration d'assujettissement auprès de l'Administration des Impôts AVANT LE DÉBUT de ses activités. Le délai est préalable au démarrage de l'activité. | CALENDRIER |
| Article 55 | Toute personne morale ou physique dont le chiffre d'affaires cumulé atteint en cours d'année le seuil d'assujettissement de l'article 14 doit souscrire une déclaration d'assujettissemen | CALENDRIER |
| Article 56, alinéa 1er (modifié par la L.F. n° 14/027 du 31 décembre 2014 et par | CONDITION DE FORME DU DROIT À DÉDUCTION : joindre un état détaillé à la déclaration MENSUELLE de TVA, dont le modèle est déterminé par voie réglementaire. | INCOMPLET |
| Article 57, alinéa 1er | Tenir une comptabilité régulière comportant SEPT documents : livre-journal, grand livre des comptes, balance des comptes, journal de ventes, journal d'achats, livre d'inventaire, livre  | CONFORT |
| Article 57, alinéa 2 | La comptabilité doit être DISPONIBLE EN RÉPUBLIQUE DÉMOCRATIQUE DU CONGO, au siège social ou au principal établissement. En cas de désignation d'un représentant agréé, les documents et  | INCOMPLET |
| Article 57, alinéa 3 | Les pièces justificatives relatives à des opérations OUVRANT DROIT À DÉDUCTION doivent être des documents ORIGINAUX. Selon la lettre du texte, une copie, une photocopie ou un duplicata  | INCOMPLET |
| Article 59, alinéa 4 | Cumul : l'obligation de reversement n'exclut pas l'application des sanctions liées à la facturation illégale de la TVA prévues par la présente Ordonnance-Loi. | INCOMPLET |
| Article 59 ter, alinéa 1er (créé par la L.F. n° 17/005 du 23 juin 2017 et modifi | Se faire enregistrer auprès de l'Administration des Impôts comme utilisateur des dispositifs électroniques fiscaux, dans les conditions précisées par voie réglementaire · obligation dis | INCOMPLET |
| Article 59 quater, 1) (créé par la L.F. n° 17/005 du 23 juin 2017 et modifié par | Double obligation : (a) utiliser des dispositifs électroniques fiscaux CONNECTÉS au système informatique de l'Administration des Impôts pour la collecte et la gestion des données de TVA | INCOMPLET |
| Article 59 quater, 2) | CONDITION PRÉALABLE : un système de facturation d'entreprise acquis ou développé pour son propre compte doit satisfaire aux spécifications techniques de l'Administration des Impôts ET ê | INCOMPLET |
| Article 59 quater, 3) | Droit conditionnel au remboursement forfaitaire des frais d'acquisition, ouvert aux seules personnes ayant acquis des dispositifs électroniques fiscaux PHYSIQUES, sur demande adressée a | CONFORT |
| Article 59 quater, 3), alinéa suivant | MODALITÉ ET CONDITIONS : le remboursement est accordé sous forme de crédit imputable sur l'impôt sur les bénéfices et profits, sur la base d'un engagement d'utilisation permanente du di | INCOMPLET |
| Article 60, alinéa 1er (mod. L.F. n° 23/056 art. 22 et L.F. n° 25/060 art. 48) | Souscrire chaque mois, au plus tard le quinze du mois qui suit celui de la réalisation des opérations, une déclaration conforme au modèle prescrit par l'Administration des Impôts. | CALENDRIER |
| Article 60, alinéa 2 (mod. L.F. n° 23/056 art. 22 et L.F. n° 25/060 art. 48) | La déclaration est souscrite en DOUBLE EXEMPLAIRE et accompagnée du PAIEMENT de la TVA (déclaration-paiement, à l'échéance de l'alinéa 1er). | INCOMPLET |
| Article 60, alinéa 3 (mod. L.F. n° 23/056 art. 22 et L.F. n° 25/060 art. 48) | La déclaration est due MÊME si aucune opération imposable n'a été réalisée au cours du mois, et doit alors porter la mention « Néant ». | CALENDRIER |
| Article 62, alinéa 3 (mod. L.F. n° 21/029, L.F. n° 22/071 et L.F. n° 25/060 art. | Régime dérogatoire minier : la TVA due à l'importation de marchandises ou sur les acquisitions locales de produits manufacturés localement destinés à l'exploitation, par les entreprises | INCOMPLET |
| Article 62 bis (créé par l'O.-L. n° 13/007 du 23 février 2013) | Les modalités de perception de la TVA concernant les activités de distribution des produits pétroliers sont déterminées par voie réglementaire. | AUCUNE |
| Article 63, alinéa 2 | Double interdiction impérative : le crédit d'impôt ne peut pas faire l'objet d'un remboursement au profit de l'assujetti, et ne peut être cédé. | INCOMPLET |
| Article 64, alinéa 1er (mod. O.-L. n° 13/007, L.F. n° 14/002, L.F. n° 17/005, L. | Liste limitative de six catégories pouvant, SUR DEMANDE EXPRESSE adressée à l'Administration des Impôts, obtenir le remboursement de leur crédit de TVA résultant de l'acquisition des bi | INCOMPLET |
| Article 64, alinéa 2 (mod. O.-L. n° 13/007, L.F. n° 14/002, L.F. n° 17/005, L.F. | Définition de l'investissement lourd, à trois conditions cumulatives (immobilisations CORPORELLES, acquises à l'état NEUF, nécessaires à l'exploitation) et un seuil : valeur du projet a | INCOMPLET |
| Article 64, alinéa 3 (mod. O.-L. n° 13/007, L.F. n° 14/002, L.F. n° 17/005, L.F. | Plafond de remboursement : le montant remboursable est limité au montant de TVA calculé au TAUX NORMAL sur le montant des exportations réalisées au cours du mois. | INCOMPLET |
| Article 68, alinéa 1 (Chapitre VIII : des procédures) | L'assiette, le contrôle, le recouvrement, le contentieux et la prescription de la TVA obéissent au droit fiscal commun en vigueur, sauf procédures propres à l'Ordonnance-Loi TVA. | INCOMPLET |
| Article 69 (Chapitre IX) · modifié par la L.F. n° 24/011 du 20 décembre 2024, ar | Amende fixe de 5.000.000,00 FC pour absence de déclaration d'assujettissement à la TVA dans le délai. | CALENDRIER |
| Article 69 bis (Chapitre IX) · créé par la L.F. n° 21/029 du 31 décembre 2021 | Défaut de souscription d'une déclaration de TVA CRÉDITRICE dans le délai : amende de 1.500.000,00 FC ET perte d'une quotité de 10 % du montant du crédit. | CALENDRIER |
| Article 72, alinéa 1 (Chapitre IX) | Amende fiscale égale au DOUBLE du montant des droits compromis pour l'absence de facture ou de document en tenant lieu, en cas de livraison de biens et de prestations de services effect | INCOMPLET |
| Article 74, alinéa 1 (Chapitre IX) · complété par la L.F. n° 25/060 du 29 décemb | Amende fiscale égale au montant des droits indûment déduits, pour toute déduction ne correspondant pas, en partie ou en totalité, à une acquisition de biens ou à une prestation de servi | INCOMPLET |
| Article 74 quater · créé par la L.F. n° 17/005 du 23 juin 2017 | Amende de 10.000.000,00 FC pour le défaut d'utilisation, par l'assujetti, du dispositif électronique fiscal lors de ses transactions. | INCOMPLET |
| Article 74 sexies, alinéa 1 · créé par la L.F. n° 22/071 du 28 décembre 2022 | Toute personne soumise à l'obligation d'utiliser les dispositifs électroniques fiscaux qui effectue une transaction sans délivrer une facture normalisée établie dans les conditions de l | INCOMPLET |
| Article 74 sexies, alinéa 2 · créé par la L.F. n° 22/071 du 28 décembre 2022 | Récidive : amende égale à 10 fois « le montant pour lequel la facture normalisée n'a pas été délivrée », plancher de 50.000.000 FC par facture ; cumul possible avec une fermeture admini | INCOMPLET |
| Article 74 septies · créé par la L.F. n° 22/071 du 28 décembre 2022 | Les sanctions de l'article 74 quater s'appliquent aussi à qui a) délivre une facture normalisée de valeur ou de quantité minorée, b) cause un dysfonctionnement au dispositif électroniqu | INCOMPLET |
| Article 74 nonies, alinéa 1 · créé par la L.F. n° 22/071 du 28 décembre 2022 | Les fournisseurs de système de facturation d'entreprises et les éditeurs de logiciels de facturation qui ne satisfont pas à l'obligation d'homologation de leurs logiciels sont passibles | INCOMPLET |
| Article 74 nonies, alinéa 2 · créé par la L.F. n° 22/071 du 28 décembre 2022 | Même sanction pour les entreprises qui ont développé leur propre système de facturation électronique sans avoir satisfait à l'obligation d'homologation. | INCOMPLET |
### Les quarante-six constats écartés

| Article | Obligation alléguée | Motif de la réfutation (extrait) |
|---|---|---|
| Article 36, point 1 | Ouvre droit à déduction la TVA sur les matières premières, biens intermédiaires et consommables entrant d | Le texte est bien cité (art. 36, point 1), mais le constat lui prête un régime que son propre décret d'application contredit : le décret n° 011/42 interdit à son art. 97 la vérification réclamée (« La déduction est opéré |
| Article 36, point 2 | Ouvre droit à déduction la TVA sur les biens destinés à être revendus dans le cadre d'une opération impos | Le constat cite l'art. 36, point 2 fidèlement, mais il lui fait dire ce qu'il ne dit pas : il transforme une ÉNUMÉRATION de ce qui ouvre droit à déduction en une OBLIGATION DE VÉRIFICATION BIEN PAR BIEN au moment de la d |
| Article 36, point 3 | Ouvre droit à déduction la TVA sur les services entrant dans le prix de revient d'opérations ouvrant elle | Le constat reproche à OmegaX de ne pas coder une condition que l'Ordonnance-Loi n'édicte pas, et qu'elle règle elle-même · de plein droit · par le prorata que le logiciel applique déjà. Article 36 est une ÉNUMÉRATION de  |
| Article 36, point 4 (première phrase) | Ouvre droit à déduction la TVA sur les biens meubles, immeubles et services acquis POUR LES BESOINS DE L' | MAUVAIS RATTACHEMENT D'ARTICLE ET DOUBLE COMPTAGE. L'art. 36, point 4, première phrase est une norme ATTRIBUTIVE de droit, et OmegaX l'ouvre exactement là où le texte l'ouvre (investissements et frais généraux). Le manqu |
| Article 36, point 4 (deuxième phrase) | La TVA afférente aux livraisons de biens à soi-même et prestations de services à soi-même est déductible, | CONSTAT REFUTE. Son anomalie collaterale est FAUSSE sur le point meme qu'elle accuse (« les DEUX termes »), et sa preuve du cote DEDUIT ne demontre pas un manque sur l'article 36 mais sur l'article 38, point 3, que le de |
| Article 38, point 3 | Pour les livraisons de biens et prestations de services à soi-même, la déduction suppose une facture norm | CONSTAT REFUTE. Sa premisse factuelle decisive est fausse : la facture a soi-meme EST representable dans le modele `Facture` et EST reprise dans le volet deductions de l'etat detaille. Accessoirement, sa preuve renvoie a |
| Article 41, point 7 | EXCLUSION pour les biens cédés et services rendus gratuitement ou à un prix inférieur au prix de revient, | Le noyau factuel du constat est exact (le 6276 est bien le seul compte porteur du point 7, en mode avertissement, et rien dans le dépôt ne traite la cession sous le prix de revient), mais les DEUX « réserves à porter » q |
| Article 42, point 3 (avec la mention entre crochets) | EXCLUSION pour la TVA reprise sur une facture émise en dehors des dispositifs électroniques fiscaux par u | Le texte est bien cité (art. 42, point 3, crochet compris) mais le constat s'effondre sur deux points. D'une part il se réfute lui-même : il reconnaît que « ne pas appliquer l'exclusion est aujourd'hui le comportement co |
| Article 43, al. 1 (l. 1109) · limitation par prorata | L'assujetti qui ne réalise pas exclusivement des opérations ouvrant droit à déduction voit sa déduction l | Le constat est réfuté sur ses deux jambes. (1) Sa jambe FACTUELLE est fausse : il affirme que la question « n'est nulle part posée dans le code, ni dans le hors-scope, ni sur l'écran ». Or les montants qu'il vise (781, 7 |
| Article 45, al. 3 (l. 1152) · justification du prorata pré | Le prorata prévisionnel n'est accepté que sur justification : prorata définitif de l'exercice antérieur ( | Le constat est faux sur les faits, et sa preuve est techniquement nulle. (1) Sa preuve n°1 repose sur un grep syntaxiquement invalide : `grep -rn "previsionnel/prévisionnel"` sans `-E` cherche la chaîne LITTÉRALE `previs |
| Article 46, al. 2 (l. 1164) · aucune régularisation si la  | Lorsque la variation du prorata est inférieure ou égale à 10 %, aucun reversement ni déduction complément | Le constat est refute sur trois plans cumulatifs. (1) L'art. 46, al. 2 n'est pas une obligation autonome : c'est la moitie negative de la meme regle que l'al. 1, dont il est la contraposee exacte (« varie de plus de 10%  |
| Article 47 (modifié conformément à l'O.-L. n° 13/007) · ce | Les dispositions de l'article 43 s'appliquent également aux redevables qui cessent leur activité ou perde | L'article 47 ne porte pas l'obligation pour laquelle le constat note INCOMPLET. Son renvoi est limité par son propre texte à UN seul article, et le constat concède lui-même que cet article-là est servi sans condition. Ve |
| Article 48 (modifié conformément à l'O.-L. n° 13/007) · l' | Pour l'application des articles 43 et 45, l'année d'acquisition ou de cession des biens, de début ou cess | L'article 48 est une règle de DÉCOMPTE D'ANNÉES (« est comptée pour une année entière »), pas une règle sur la fenêtre d'observation d'une estimation provisoire. Partout où les art. 43 et 45 comptent une année, OmegaX la |
| Article 49, al. 1 (l. 1180) · option pour les secteurs dis | Possibilité (non obligation) de tenir compte de secteurs distincts d'activités lorsque l'assujetti exerce | L'article 49 n'impose aucune obligation au redevable : son al. 1 ouvre une simple faculté (« il peut être tenu compte »), dont le bénéfice « doit être expressément demandé à l'Administration des Impôts », et dont l'al. 3 |
| Article 49, al. 2, 1re phrase (l. 1183) · délai et forme d | Demande expresse à l'Administration des Impôts avant le 31 janvier de l'exercice de l'option, ou au plus  | L'article 49, al. 2 ne porte PAS une « obligation déclarative du redevable » assortie d'une « date opposable » : il fixe la modalité de demande d'une OPTION facultative, dont le seul effet du non-respect est le retour au |
| Article 49, al. 3 (l. 1189) · irrévocabilité et remise en  | L'option est irrévocable ; le non-respect des conditions la remet en cause et le prorata est applicable d | Le constat se contredit et se trompe sur les faits du dépôt. Il affirme dans sa preuve qu'il n'existe « ni bascule vers le prorata », alors que sa propre explication reconnaît que « le régime servi est déjà celui vers le |
| Article 52, al. 2 (l. 1237) · facture nouvelle ou note de  | Pour les opérations annulées ou résiliées, la récupération est subordonnée à l'établissement ET à l'envoi | Le constat est REFUTE sur son fait central. L'obligation existe bien dans les termes cites (angle 1 ne donne rien contre lui), mais le reproche repose sur une premisse fausse · « le module n'emettant que la facture norma |
| Article 52, al. 3 (l. 1240) · opérations impayées et dupli | Pour les impayés, la créance doit être réellement et définitivement irrécouvrable ; la rectification cons | Le constat est réfuté sur deux plans. (1) Il est mal calibré : l'alinéa 3 de l'art. 52 a DEUX jambes · celle du vendeur (duplicata surchargé, irrécouvrabilité prouvée) et celle du client (« la TVA correspondante […] qui  |
| Article 53 · Circulaire ministérielle n° 003 du 7 octobre  | Rattacher la retenue de l'art. 53 al. 2 à l'article 33 de la L.F. n° 17/005, et porter la divergence de c | L'obligation est mal formulée : le confronteur a construit son constat sur les deux seules phrases NON normatives de la circulaire (une reformulation liminaire et un risque de rétroactivité) et a laissé tomber l'objet mê |
| Article 53 · Circulaire ministérielle n° 003 du 7 octobre  | La retenue minière s'applique « à partir du 7 octobre 2017 et concerne toutes les factures relatives aux  | REFUTE comme constat autonome, sur quatre points dont deux dirimants. Le FAIT matériel est exact (rien dans le dépôt ne sert cette règle · vérifié autrement que le constat, cf. contre-preuve), mais sa QUALIFICATION est f |
| Article 56, alinéa 3 (modifié par la L.F. n° 14/027 du 31  | FORME DE LA MISE EN DEMEURE : pli recommandé avec accusé de réception, OU remise en mains propres sous bo | L'alinéa 3 de l'article 56 ne met AUCUNE obligation à la charge du redevable : il régit l'acte d'ENVOI de l'Administration des Impôts (« La mise en demeure susvisée EST ENVOYÉE AU REDEVABLE, soit sous pli recommandé... » |
| Article 58, alinéa 1er (modifié par la L.F. n° 18/025 du 1 | Délivrer au client une facture normalisée produite par les dispositifs électroniques fiscaux, ou un docum | Constat mal fondé sous l'article 58. Deux raisons cumulatives. (1) L'article 58 n'impose QU'UNE SEULE CHOSE : délivrer un document unique, portant des mentions uniques, dans trois hypothèses d'émission. Ni l'art. 58, ni  |
| Article 59, alinéa 2 | Payer la TVA même lorsque son montant n'a pas été inclus, pour quelque cause que ce soit, dans le prix de | Le constat cite l'article fidèlement mais lui fait produire une exigence qu'il ne contient pas, et sa seconde preuve est factuellement fausse. (1) L'art. 59, al. 2 ne prescrit AUCUN mode de calcul : il dit que la non-inc |
| Article 59 bis, alinéa 2 | Le seuil de 1.000.000,00 FC n'est pas figé : le Ministre ayant les Finances dans ses attributions peut le | L'alinéa 2 de l'art. 59 bis n'est pas une obligation : c'est une HABILITATION donnée au Ministre des Finances (« le Ministre […] PEUT, par voie d'Arrêté, modifier le montant »). Elle ne pèse ni sur le redevable ni sur so |
| Article 59 bis, alinéa final (entre crochets) | DÉLAI D'ENTRÉE EN APPLICATION : les dispositions de l'art. 59 bis sont appliquées dans un délai de trois  | Le constat cite le texte fidèlement mais il n'a pas d'objet propre : il reproche au logiciel l'absence de la BORNE d'un article qu'il constate lui-même absent du dépôt. Sans règle de l'art. 59 bis dans le code, il n'y a  |
| Article 60, alinéa 4 (mod. L.F. n° 23/056 art. 22 et L.F.  | Sont également soumises à déclaration les opérations de livraison de biens et de prestations de services  | CONSTAT RÉFUTÉ sur les angles 1 et 2. L'angle 3 échoue, et je le dis franchement : l'art. 60 al. 4 est bien une obligation du REDEVABLE, pas de l'Administration ni de la Douane · le grief est dans le périmètre d'un logic |
| Article 61 (mod. O.-L. n° 13/007 du 23 février 2013) | En cas d'importation, la TVA doit être DÉCLARÉE et VERSÉE avant l'enlèvement de la marchandise. L'enlèvem | CONSTAT RÉFUTÉ sur l'angle 2 (son affirmation centrale sur le code est fausse), avec l'appui de l'angle 3 ; sa citation de l'art. 61, elle, est fidèle et je ne l'attaque pas là-dessus. Le constat fait reposer toute sa gr |
| Article 62, alinéa 1er (mod. L.F. n° 21/029, L.F. n° 22/07 | Le recouvrement de la TVA est assuré par l'Administration des Impôts. Règle de compétence : elle détermin | Le constat reproche au logiciel de ne pas servir une règle qui ne s'adresse pas à lui, et il y parvient en ajoutant au texte une portée que le texte n'a pas. Art. 62 al. 1 (l. 1469-1470) : « Le recouvrement de la taxe su |
| Article 62, alinéa 2 (mod. L.F. n° 21/029, L.F. n° 22/071  | À l'importation, la TVA est perçue par l'Administration des Douanes, et non par l'Administration des Impô | RÉFUTÉ sur les trois angles, dont deux suffisent seuls. 1) ANGLE 1 · L'OBLIGATION N'EST PAS CITÉE FIDÈLEMENT, ET LE MOT AJOUTÉ EST CONTREDIT PAR L'ALINÉA SUIVANT DU MÊME ARTICLE. Le texte lu (fichier 10-tva-ol10-001-loi- |
| Article 62, alinéa 4 (mod. L.F. n° 21/029, L.F. n° 22/071  | Les modalités de mise en œuvre du mécanisme minier de l'alinéa 3 seront fixées par arrêté du Ministre aya | Le constat s'effondre sur son affirmation centrale. Son « explication » repose entièrement sur ceci : « RENVOI À UN TEXTE ABSENT DU FICHIER […] l'arrêté n'est ni identifié (aucun numéro, aucune date) ni reproduit ; je ne |
| Article 64, alinéa 4 (mod. O.-L. n° 13/007, L.F. n° 14/002 | Investissements lourds d'EXTENSION et de MODERNISATION : la demande de remboursement doit intervenir DANS | Le constat est fondé sur une qualification que le texte ne porte pas. L'art. 64 al. 4 dit « peuvent demander », jamais « doivent » : c'est une FACULTÉ de remboursement ouverte à une catégorie d'assujettis, pas une obliga |
| Article 64, alinéa 5 (mod. O.-L. n° 13/007, L.F. n° 14/002 | Le Ministre ayant les Finances dans ses attributions peut, lorsque les circonstances l'exigent, réajuster | Le constat échoue sur les trois angles. (1) Il ne cite pas l'alinéa verbatim : il en réécrit l'ordre des mots et remplace « par voie d'Arrêté » par « par arrêté ». (2) Sa preuve porte une négative universelle FAUSSE : «  |
| Article 65 | Lorsqu'un redevable perd la qualité d'assujetti, son crédit de TVA est IMPUTÉ sur les sommes dont il est  | Le constat cite l'article 65 fidèlement et son observation brute est exacte (rien dans OmegaX ne réagit au basculement de `assujettiTva`), mais sa qualification juridique · celle qui fonde la gravité, l'« aggravation » r |
| Article 67 | Les modalités pratiques de remboursement du crédit de TVA sont déterminées par voie réglementaire. | Le constat tombe sur les trois angles. (1) Citation non verbatim : l'art. 67 dit « du crédit de la taxe sur la valeur ajoutée », pas « du crédit de TVA ». (2) Sa preuve avancée se donne pour un relevé exhaustif de « remb |
| Article 68, alinéa 2 (Chapitre VIII) | À l'importation, la liquidation et le recouvrement de la TVA relèvent de la législation douanière, non de | CONSTAT RÉFUTÉ sur l'angle 3 (destinataire), de façon décisive, et affaibli sur l'angle 1 (la reformulation dit plus que le texte). L'angle 2 est concédé pour le mot, mais non pour la substance. 1) ANGLE 3, DÉCISIF · L'A |
| Article 69 bis, seconde phrase (Chapitre IX) · créé par la | Amende réduite de 500.000,00 FC lorsque le défaut de souscription dans le délai porte sur une déclaration | La jambe décisive de la preuve est fausse. Le constat conclut « PAS DU TOUT » et grade CALENDRIER en affirmant que « La même doctrine n'a pas été portée au module TVA ». Elle l'a été : l'échéancier fiscal porte une natur |
| Article 72, alinéa 2 (Chapitre IX) | Aggravation en cas de récidive : l'amende de l'alinéa 1 est triplée. Le texte ne définit ni la récidive n | Le constat est refute sur son MOTIF, non sur son fait materiel. Son assertion operative · « Le texte ne definit ni la recidive ni son delai de constatation » · est fausse au regard du corpus applicable, et le second « bl |
| Article 73 (Chapitre IX) | Tout remboursement de crédits de TVA obtenu sur la base de fausses factures donne lieu à restitution immé | Le constat est mal fondé SOUS LE NUMÉRO 73. L'article existe bien (Chapitre IX : DES PENALITES, l. 1614-1617 du fichier de loi) et il est cité presque fidèlement, mais son fait générateur est DOUBLE et CUMULATIF : un « r |
| Article 74 quinquies · créé par la L.F. n° 18/025 du 13 dé | Amende de 5.000.000,00 FC pour l'assujetti qui corrompt DÉLIBÉRÉMENT le fonctionnement du dispositif élec | CONSTAT REFUTE. L'article vise un acte personnel delibere contre un objet qui n'existe pas dans le perimetre, il ne porte pas l'obligation qu'on lui prete, et DEUX des citations que le constat fait du depot sont fausses, |
| Article 74 sexies, alinéa 3 · créé par la L.F. n° 22/071 d | Lorsque les dirigeants de l'entreprise sont de nationalité étrangère, interdiction de séjour en RDC cumul | Le constat est mal fondé sur deux plans. (1) PÉRIMÈTRE : l'alinéa 3 de l'art. 74 sexies ne met AUCUNE obligation à la charge du redevable. Lu verbatim, il institue une sanction accessoire de police des étrangers, frappan |
| Article 74 octies · créé par la L.F. n° 22/071 du 28 décem | Amende de 10.000.000,00 FC PAR FACTURE pour toute modification du système de facturation d'entreprise ou  | L'article 74 octies ne porte pas l'obligation que le constat lui prête. Lu à l'instant (fichier `.../fiscalite-rdc/code-general-2026/references/10-tva-ol10-001-loi-base-ch1-10.md`, l. 1698-1703), il dit VERBATIM : « Arti |
| Article 74 decies, alinéa 1 · créé par la L.F. n° 22/071 d | Sanction balai : tout manquement non spécifié à la réglementation relative à l'utilisation des dispositif | Le constat appelle « obligation » ce qui est une clause de sanction résiduelle, puis, constatant lui-même qu'elle n'impose rien de déterminé, lui substitue un devoir qu'il écrit à sa place · et ce devoir substitué est dé |
| Article 74 decies, alinéa 2 · créé par la L.F. n° 22/071 d | Règle de non-substitution : l'amende de l'alinéa 1 se cumule avec le paiement de la TVA éludée, avec les  | Le texte existe et le numéro d'article est exact, mais le constat le détache de son objet et lui prête un destinataire qu'il n'a pas. Deux motifs, plus une erreur de renvoi. 1) L'ALINÉA S'ADRESSE À L'ADMINISTRATION, PAS  |
| Article 75 (Chapitre IX) | Les infractions en matière de TVA découlant de l'importation des marchandises sont constatées, poursuivie | L'article 75 ne crée aucune obligation à la charge du redevable : ses trois verbes ("constatées, poursuivies et sanctionnées") désignent exclusivement des actes de l'Administration, et l'article se borne à répartir la co |
| Article 76 (Chapitre IX) | Application supplétive du régime général des pénalités prévu par la Loi n° 004/2003 du 13 mars 2003 porta | Constat mal ancré et mal cité. (1) L'article 76 n'est PAS une obligation : c'est une clause de désignation de norme applicable, adressée à l'Administration et au juge. Elle ne porte ni acte du redevable, ni assiette, ni  |
| Article 78 (Chapitre X) | La présente Ordonnance-Loi entre en vigueur endéans dix-huit mois à dater de sa signature (texte signé le | L'article 78 est cité fidèlement et correctement numéroté, mais ce n'est pas une obligation : c'est la clause d'entrée en vigueur de la loi elle-même, une disposition finale sans sujet ni destinataire, épuisée au plus ta |
### Ce que cette passe apprend sur la méthode

- **Le test qui gèle une affirmation sur le dépôt doit être relu contre le
  dépôt.** Deux specs, en deux passes, gardaient une phrase fausse :
  `hors-scope-tva.spec.ts` gardait un hors-scope surestimé, et
  `tva-exclusions-art41.spec.ts` gardait « un dossier SYCEBNL n'exclut rien ·
  son plan agrège ses charges externes ». Dans les deux cas le test couvrait
  bien le code ; dans les deux cas la PRÉMISSE était fausse, et personne ne la
  vérifiait. D'où le nouveau spec `exclusions-art41-semees.spec.ts`, qui relit
  les deux fichiers de semis et exige que chaque racine reconnue y soit
  réellement ouverte sous l'intitulé qui la justifie.
- **Une interdiction de mot est toujours trop large.** Troisième occurrence de
  la même faute, et la règle est maintenant écrite : on exige la réserve
  exacte, on ne bannit jamais un numéro d'article.
- **Le rendement d'une passe suit la nature du chapitre.** 83 % de réfutation
  sur un décret de procédure, 62 % sur un chapitre de champ d'application,
  37 % sur les déductions et les pénalités. Le budget d'une passe doit se
  calibrer là-dessus, pas sur le nombre de lignes du texte.
- **Un réfutateur qui vérifie les numéros de ligne rend un relevé opposable.**
  Sur l'art. 36 point 4, il a laissé le constat vivre tout en corrigeant trois
  renvois faux, en démentant deux affirmations de la preuve avancée, et en
  trouvant une quatrième phrase de l'article que le confronteur avait manquée ·
  celle qui assoit les amortissements déductibles à l'impôt sur les bénéfices
  sur le coût hors TVA déductible.

## Passe F3a · Décret n° 011/42 d'application de la TVA, chapitres I à III (2026-09-16)

**Corpus** · `fiscalite-rdc/code-general-2026/references/11-tva-decret-application-ch1-4.md`,
1 807 lignes. Chapitre 1er (objet), chapitre II (champ d'application ·
opérations imposables, assujettis, seuil, et une section d'exonérations de plus
de mille lignes), chapitre III (fait générateur et exigibilité).

**L'exécution de F3 est scindée en deux runs**, comme F2 et pour la même
raison · 3 525 lignes au total. F3b couvrira les chapitres IV à XII.

**Volumétrie** · 134 agents, 15,5 M de jetons, 5 h 57.

**Résultat** · 124 constats soumis à réfutation, **106 écartés**, **18 retenus**,
dont 7 de gravité FAUX. Le taux de réfutation remonte à **85 %**, le plus haut
des quatre passes · c'est l'effet de la consigne nouvelle, qui donnait aux
confronteurs le journal des trois passes précédentes et le hors-scope du module
en leur interdisant de resignaler un manque déjà nommé. Ce qui survit est donc
du neuf, et non de la redite.

### Trois réglages de méthode, et ce qu'ils ont rapporté

- **Les lecteurs pouvaient ouvrir la loi, pour une seule question** · quel
  article de l'ordonnance-loi chaque disposition applique, et où le décret
  AJOUTE. C'est de là que sortent les art. 55 et 57, qui n'ont pas d'équivalent
  dans la loi.
- **Les confronteurs lisaient le journal avant de conclure.** D'où 85 % de
  réfutation, et des constats qui commencent par « le manque est déjà nommé ·
  je ne le resignale pas. Ce qui est neuf, c'est que… ».
- **Le quatrième piège est devenu une consigne de chasse** · toute phrase du
  code qui dit « le plan ne porte pas X » ou « ce cas n'existe pas » est un
  constat de gravité FAUX dès qu'elle est démontrable comme inexacte. Elle a
  rapporté trois des sept FAUX.

### Ce qui est corrigé dans le code, et testé

#### 1 · Le référentiel fermait la lecture de la contrepartie, sur un motif périmé

`natureOperation` commençait par écarter tout dossier non SYSCOHADA, au motif
que « le plan SYCEBNL ne subdivise ni 443 ni 445 ». **Le motif était vrai et la
conclusion a cessé de l'être** le jour où la passe F2a a déplacé la lecture de
la nature du compte de TVA vers la CONTREPARTIE : les classes 6 des deux plans
portent les mêmes numéros sous les mêmes intitulés, le 60510000 est « Eau » et
le 60570000 « Achats d'études et prestations de services » dans les deux semis.
Un dossier SYCEBNL assujetti déduisait donc sa TVA d'électricité dès la facture
au lieu du paiement du fournisseur · déduction anticipée, réintégrable. Et la
déclaration lui en donnait pour raison que « aucune nature n'y est lisible »,
ce qui n'était plus exact.

**Troisième fois que le dépôt écarte une règle sur une affirmation périmée ou
fausse** · la première fut l'homologation de la facture (F1), la deuxième les
exclusions de l'article 41 (F2b), celle-ci est la troisième.

#### 2 · Ce qui reste fermé, et pourquoi · la classe 7

C'est le point où la correction pouvait CRÉER le défaut qu'elle corrigeait. Le
**70510000 est « Dans la Région »** au SYSCOHADA, sous 705 « Travaux
facturés », donc un SERVICE ; il est **« Ventes de marchandises »** au SYCEBNL.
Ouvrir la table des produits aux deux plans aurait daté une vente de
marchandises à l'encaissement et **minoré la déclaration**. Treizième occurrence
du premier piège du dépôt, et la seule qui aurait été fabriquée par un
correctif. La table des produits reste donc propre au SYSCOHADA, et la raison
écrite est désormais la vraie.

Une divergence réelle est traitée à part : le **601** est « Achats de
marchandises » au SYSCOHADA, « Achats de biens ET SERVICES liés à l'activité »
au SYCEBNL. Un seul numéro, deux natures : sur ce plan-là, le compte ne tranche
pas, et on ne tranche pas à sa place.

#### 3 · La location-vente est une livraison de biens (art. 10)

Le décret la nomme **trois fois** · l'art. 10 la range parmi les livraisons de
biens meubles corporels, l'art. 51 l'EXCLUT expressément de la règle des
décomptes et paiements successifs, l'art. 52 la date « lors du transfert du
pouvoir de disposer d'un bien comme propriétaire ». Le compte 62340000
« Location-vente » est semé aux deux plans, et la table classait toute la
racine 62 en SERVICES. La taxe d'amont était datée de l'encaissement au lieu du
fait générateur · déduction différée, jusqu'à risquer la déchéance de l'art. 37
al. 2 que le module calcule par ailleurs. La racine la plus longue l'emporte :
`6234` prime `62`, et une location simple de matériel reste un service.

#### 4 · La mention de l'article 60 n'était pas contrôlée

« La mention "Autorisation d'acquitter la TVA d'après les débits" doit figurer
sur toutes les factures délivrées par le prestataire de services ou
l'entrepreneur de travaux publics ou de travaux immobiliers. » Le champ
existait sur la pièce et personne ne le lisait : `verifierMentions` rendait
`conforme: true` sur une vente qui l'omet. **C'est la répétition exacte du
défaut que la passe F1 a corrigé sur l'adresse exacte.** Deux limites tenues ·
la mention ne pèse que sur celui qui DÉLIVRE la facture et qui est AUTORISÉ, et
l'amende de l'art. 97 bis ne lui est PAS étendue, ce barème visant les mentions
du décret n° 23/10 quand le décret n° 011/42 n'énonce aucune sanction.

#### 5 · « Une association ne l'est pas de plein droit » était faux, et affiché

L'écran des paramètres affichait cette phrase à tout dossier SYCEBNL. **Aucune
source lue ne la porte.** L'art. 42 du décret soumet « les personnes physiques
ET MORALES » dont le chiffre d'affaires atteint le seuil, sans écarter les
associations, et le dépôt écrit lui-même ailleurs qu'une ASBL dotée de la
personnalité juridique est une personne morale. Ce qui est propre à une
association tient aux EXONÉRATIONS, non au seuil · ses ventes et importations
conformes à son objet sont exonérées (art. 15, 2°), comme ses prestations
d'activité normale tant qu'elles ne faussent pas la concurrence (art. 17, 8°),
de sorte qu'elles ne produisent pas de chiffre d'affaires taxable. Une activité
accessoire taxable, elle, compte. La phrase est remplacée par la règle, avec le
chiffre d'affaires **hors TVA** de l'art. 42 et la mesure de l'art. 43 (année
précédente, ou prévisionnel pour une entité nouvelle).

#### 6 · Trois lacunes nommées, dont une qui l'était avec un déclencheur faux

- **Art. 41 · la dette du client.** Le hors-scope faisait dépendre la dette de
  l'absence de représentant **AGRÉÉ**. Les deux textes la font dépendre de
  l'absence de **DÉSIGNATION**. Entre les deux s'écoule un délai, et le silence
  de l'Administration vaut agrément : un fournisseur étranger qui a désigné un
  représentant non encore agréé a satisfait à l'obligation, et son client
  congolais n'est pas redevable. **Une lacune déclarée avec un déclencheur faux
  invite à supporter une taxe qui n'est pas due.**
- **Art. 55 et 56 · les contrats d'abonnement.** Le décret étend à
  l'EXIGIBILITÉ ce que l'art. 24, point 9 de la loi ne disait que du fait
  générateur : pour une fourniture sous abonnement à décomptes proportionnels à
  la consommation, les deux interviennent à l'expiration de la période. Rien
  dans une écriture ne dit qu'une fourniture relève d'un abonnement.
- **Art. 57, alinéa 2, 4e tiret · les effets de commerce.** L'encaissement
  intervient « à la date de l'échéance de la traite, MÊME SI ELLE A ÉTÉ REMISE
  À L'ESCOMPTE ». Le module date l'encaissement de l'écriture qui solde le
  tiers · sur un effet, c'est l'acceptation, antérieure. Le même alinéa règle
  aussi l'affacturage. La phrase rendue à l'écran énonçait la règle de
  l'encaissement **sans ces deux réserves** : elle affirmait au cabinet quelque
  chose que le décret contredit. Elle les porte désormais.

S'y ajoute la mesure du seuil (art. 42 et 43), écrite partout et calculée nulle
part.

### Vérification

**Six réinjections de défaut, six attrapées** · la location-vente redevenue un
service, le référentiel refermé sur la contrepartie, la classe 7 ouverte au
SYCEBNL (le défaut que la correction aurait créé), le 601 du SYCEBNL tranché à
tort, la mention de l'art. 60 retirée de `conforme`, et le service qui oublie
de passer le régime à `verifierMentions`.

Cette dernière est la leçon de F2a appliquée d'avance : la fonction pure peut
être juste et le service ne pas l'appeler ainsi. Un spec lit le service
lui-même · la requête doit ramener le régime, et les DEUX appels doivent passer
le contexte.

232 suites / 3 489 tests serveur, 41 fichiers / 468 tests client.

### Les onze autres constats retenus

| Article | Ce que le texte impose | Gravité |
|---|---|---|
| Article 26 | La livraison de biens à soi-même se réalise lorsque l'entreprise fabrique elle-même les biens et se les livre en l'état ; elle se réalise également lorsque des biens acquis par l'entreprise ET QUI ONT | INCOMPLET |
| Article 31, alinéa 2 (Décret n° 011/42) | Exclusion du champ : la personne liée par un contrat de travail ou tout autre rapport de subordination (conditions de travail, modalités de rémunération, responsabilité de l'employeur) n'est pas assuj | INCOMPLET |
| Article 35 (Décret n° 011/42) | Test opérant de la distorsion de concurrence, en trois critères à comparer au secteur privé : le public visé, les prix pratiqués, les moyens publicitaires utilisés. | INCOMPLET |
| Article 38 · texte inséré de l'A.M. n° 067 du 29 novembre 2011 (délai  | DÉLAI IMPÉRATIF, deux points de départ : entreprises nouvelles, au plus tard le QUINZIÈME JOUR suivant le début des activités ; entreprises existantes, dans les QUINZE JOURS suivant la réception de l' | CALENDRIER |
| Article 38 · texte inséré de l'A.M. n° 067 du 29 novembre 2011 (pièces | Cinq pièces à joindre à la lettre de désignation, condition de l'agrément : lettre d'acceptation du mandat sur modèle de l'Administration ; attestation de résidence si le représentant est une personne | INCOMPLET |
| Article 43 (Décret n° 011/42) | Base de référence pour apprécier le seuil : pour les entreprises EXISTANTES, le chiffre d'affaires de l'ANNÉE PRÉCÉDENTE ; pour les entreprises NOUVELLES, le chiffre d'affaires PRÉVISIONNEL. | INCOMPLET |
| Article 48, alinéa 1 (décret, adapté conformément à l'O.-L. n° 13/007  | L'exonération pharmaceutique de l'art. 15, point 10, « ne concerne que les produits destinés à la prévention, au diagnostic et au traitement des maladies » · restriction par la DESTINATION du produit. | AUCUNE |
| Article 51, 9e tiret | Opérations à décomptes ou paiements successifs : fait générateur à l'expiration de la période à laquelle le décompte ou l'encaissement se rapporte, sauf vente à tempérament, location ou location-vente | INCOMPLET |
| Article 57, alinéa 1er | L'encaissement s'entend de la perception des sommes, à quelque titre que ce soit, notamment avances, acomptes et règlement pour solde, du fait de la réalisation de l'opération ou de l'exécution des tr | AUCUNE |
| Article 57, alinéa 2, 2e tiret | Paiement par chèque : l'encaissement est daté de la REMISE du chèque, et non de son encaissement bancaire ni de sa date d'émission. | CALENDRIER |
| Article 57, alinéa 3 | Affacturage : l'encaissement coïncide avec la date du PAIEMENT EFFECTIF DE LA CRÉANCE PAR LE DÉBITEUR, et non avec le versement du factor. | CALENDRIER |
### Les cent six constats écartés

| Article | Obligation alléguée | Motif de la réfutation (extrait) |
|---|---|---|
| Article 1er (Décret n° 011/42 du 22 novembre 2011) | Norme d'objet : « Le présent Décret a pour objet de fixer les mesures d'exécution de l'Ordonnan | CONSTAT RÉFUTÉ, sur les angles 1, 3 et 4 à la fois · et il se détruit lui-même dans sa propre réserve. 1) ANGLE 1 · L'ARTICLE 1er NE PORTE AUCUNE OBLIGATION, ET PAS UNE LIGNE DU GRIEF N'EN SORT. Lu à  |
| Article 2, alinéa 1er | Champ matériel : la TVA frappe tous les biens et services de toutes origines, consommés ou util | CONSTAT RÉFUTÉ sur trois angles indépendants, dont chacun suffit · et son signalement adjacent est, lui, démontrablement faux. 1) ANGLE 1 · L'ARTICLE VISÉ NE PORTE AUCUNE OBLIGATION, ET LE CONSTAT LUI |
| Article 3, alinéa 1er | La TVA vise toutes les opérations qui relèvent d'une activité économique. | Doublon avéré, preuve calibrée sur le mauvais texte, et grep faux. (1) Le constat est LE MÊME que celui déjà porté au relevé sous l'O.-L., avec la même gravité : /home/user/comptaflow/docs/releve-de-m |
| Article 3, alinéa 2 | Énumération non limitative des activités économiques, y compris extractives, agricoles, foresti | CONSTAT RÉFUTÉ sur les angles 1 et 3, et corrigé sur l'angle 2. 1) LE TEXTE VISÉ NE PORTE AUCUNE OBLIGATION. L'art. 3, al. 2 du Décret n° 011/42 (fichier `11-tva-decret-application-ch1-4.md`, l. 104-1 |
| Article 4, alinéa 1er | Grille de qualification en cinq catégories : livraisons de biens à des tiers, prestations à des | CONSTAT REFUTE. Sa qualification du texte est inventee, son affirmation centrale est fausse a la lecture faite a l'instant sur trois points independants, et pour trois de ses cinq cases le releve a de |
| Article 4, alinéa 2 | Conditions cumulatives : deux personnes distinctes et une contrepartie · le but lucratif ou non | Constat réfuté sur l'angle 3, et son ressort juridique (l'« ajout » propre au Décret) est faux. (1) DÉJÀ JUGÉ, ET DEUX FOIS. Le contenu de l'art. 4 al. 2 du Décret n'est pas une règle du Décret : c'es |
| Article 4, alinéa 3 | La contrepartie correspond au prix convenu et peut s'effectuer en espèces, par chèque, virement | RÉFUTÉ sur les angles 1, 2 et 3 (l'angle 4 est concédé : l'art. 4 vise bien les opérations du redevable). L'art. 4, alinéa 3 du Décret n'est pas une obligation mais la seconde phrase d'une règle de CH |
| Article 4, alinéa 4 | Condition de LIEN DIRECT : la contrepartie doit avoir un lien direct avec le bien livré ou le s | RÉFUTÉ · non sur l'existence de l'alinéa, qui est réelle et bien placée, mais sur les DEUX jambes qui portent le constat : sa conséquence chiffrée et son fait matériel. Les deux tombent, et chacune su |
| Article 5, alinéa 1er | Les livraisons de biens corporels ET les prestations de services faites à des tiers restent imp | L'art. 5, al. 1er du Décret n° 011/42 n'est pas une obligation mais une règle d'imposabilité ANTI-EXCLUSION, déjà portée mot pour mot par la loi habilitante (O.-L. art. 6) pour les biens et par ses ar |
| Article 5, alinéa 2 | Définition de la réquisition de l'autorité publique : acte par lequel les autorités civiles ou  | CONSTAT REFUTE sur l'angle 1 et sur l'angle 3, chacun suffisant. (1) La citation est AMPUTEE, et l'amputation est exactement ce qui fait tenir le raisonnement : la definition de l'alinea 2 porte DEUX  |
| Article 6, tirets 1 et 2 | Personnes distinctes : personnes juridiques différentes si toutes les parties sont établies en  | RÉFUTÉ sur trois plans indépendants, chacun suffisant. Tout ce qui suit a été lu à l'instant. ANGLE 1 · L'ARTICLE 6 DU DÉCRET NE PORTE AUCUNE OBLIGATION : C'EST UN CHAPEAU DE DÉFINITION. Lu verbatim à |
| Article 6, alinéa final | L'association momentanée est considérée comme une personne distincte de ses membres lorsqu'elle | REFUTE sur trois motifs independants, dont le premier suffit seul. 1) ANGLE 3 · LE MANQUE EST DEJA AU JOURNAL, ET IL Y EST DEJA ECARTE. Le decret n'invente rien : son art. 6 in fine RECOPIE l'O.-L. ar |
| Article 7 | La livraison d'un bien meuble corporel est le transfert du pouvoir de disposer du bien comme pr | L'article 7 du Décret n° 011/42 ne porte aucune obligation : c'est une définition de champ d'application, et le constat l'admet en l'invoquant comme EXCUSE du comportement du logiciel (« l'alinéa 2 du |
| Article 8 | Vente sous condition RÉSOLUTOIRE : le transfert du droit de disposer intervient dès la conclusi | Constat déposé sous un article qui ne porte pas la gravité invoquée, et gravité CALENDRIER vide : l'art. 8 du Décret est une règle de QUALIFICATION (chapitre du champ d'application), la règle de date  |
| Article 9 | Vente sous condition SUSPENSIVE : le transfert du droit de disposer intervient à la réalisation | REFUTE sur l'angle 1, et sur la mécanique du code que le constat cite lui-même. L'article 9 du Décret est une règle de QUALIFICATION (il dit QUAND le transfert du droit de disposer intervient), pas un |
| Article 11 | L'apport en société de l'article 10 ne concerne QUE l'apport en nature dont la contrepartie rés | Article 11 n'est pas une obligation mais une DÉFINITION SOUSTRACTIVE, et le constat le grade INCOMPLET sur un manque qu'il reconnaît lui-même ne pas venir de cet article. Art. 11 ne taxe rien : il RET |
| Article 12, tirets 1 à 7 et 9 | Liste des opérations assimilées aux exportations de marchandises : aéronefs (construction, tran | REFUTE sur l'angle 3 (le manque est deja nomme, et deja ECARTE sept fois, sur le texte qui le porte vraiment), avec un appui sur l'angle 1 (le constat se trompe sur ce que le Decret « ajoute ») et une |
| Article 12, tiret 8 | Sont assimilées aux exportations les livraisons de biens ET les prestations de services effectu | REFUTE sur l'angle 3, qui est décisif, et entamé sur les angles 1 et 2. 1) LE TIRET N'EST PAS UNE OBLIGATION, C'EST UNE RÈGLE DE QUALIFICATION · et le constat la cite de mémoire, pas verbatim. Fichier |
| Article 13 | Les opérations sur aéronefs du premier tiret de l'article 12 ne sont assimilées aux exportation | REFUTE, principalement sur l'angle 3 (le manque est deja nomme et deja ecarte), accessoirement sur les angles 1 et 4 · la citation de l'article, elle, est exacte. 1) ANGLE 3 · LE CONSTAT EST DEJA JUGE |
| Article 14 | Les opérations des quatrième et cinquième tirets de l'article 12 ne sont assimilées aux exporta | RÉFUTÉ sur trois fondements indépendants : la citation n'est pas fidèle et son durcissement contredit la loi (angle 1), la disposition excède la loi habilitante et le constat le dit lui-même avant de  |
| Article 15 | Par engins et filets de pêche, il faut entendre les produits et objets susceptibles d'attirer,  | CONSTAT RÉFUTÉ sur trois fondements indépendants, dont deux sont fatals. Sa seule partie exacte · le grep · n'est pas contestée : je l'ai rejoué mot pour mot (`grep -rniE "filets de pêche/hameçon/rali |
| Article 16 | Constituent des prestations de services TOUTES les opérations autres que les livraisons de bien | REFUTE sur les quatre angles. Tout ce qui suit a ete lu a l'instant. 1) L'ARTICLE 16 NE PORTE PAS LE GRIEF QU'ON LUI PRETE. Texte integral, VERBATIM (11-tva-decret-application-ch1-4.md, l. 250-258) :  |
| Article 18 | Les « biens meubles incorporels » recouvrent les droits d'utilisation d'actifs industriels, la  | RÉFUTÉ sur les quatre angles. (1) L'ARTICLE EST BIEN LU, MAIS CE N'EST PAS UNE OBLIGATION. Art. 18 du Décret, fichier `code-general-2026/references/11-tva-decret-application-ch1-4.md`, l. 282-302, ver |
| Article 19 | Le crédit-bail est une technique de financement par laquelle UNE BANQUE OU UNE SOCIÉTÉ FINANCIÈ | CONSTAT RÉFUTÉ sur quatre fondements indépendants, dont deux erreurs de fait vérifiables dans sa propre preuve. (1) ANGLE 3, DÉCISIF · l'affirmation centrale « Le logiciel ne pose jamais la question [ |
| Article 22 | Le travail à façon consiste à transformer ou adapter des matières ou des pièces en produit fini | CONSTAT RÉFUTÉ sur les trois angles, et de façon décisive sur l'angle 3 : le critère que le constat dit introuvable est EXACTEMENT celui qui décide du compte SYSCOHADA, et la table lit le compte. 1) A |
| Article 23 | Les services électroniques fournis en ligne PAR DES ENTREPRISES RÉSIDENTES ET NON RÉSIDENTES co | RÉFUTÉ SUR LES QUATRE ANGLES, et d'abord sur le fait : l'affirmation centrale du constat · « Le Décret ne dit PAS, dans le périmètre lu, comment la taxe est collectée auprès d'un fournisseur non résid |
| Article 25 | La livraison de biens à soi-même s'entend des prélèvements et affectations effectués, à partir  | CONSTAT REFUTE. Son fait matériel est vrai mais DÉJÀ CONSIGNÉ, et la seule chose qu'il revendique comme neuve est démentie par le Décret lui-même, à l'article suivant, plus une erreur de fait vérifiab |
| Article 27 | Les prestations de services à soi-même consistent en des services que les assujettis réalisent  | CONSTAT REFUTE sur trois plans, dont deux suffisent seuls. (1) LA PREUVE EST MATERIELLEMENT FAUSSE : le grep que le constat dit avoir executé, relancé verbatim a l'instant, rend DEUX resultats, et AUC |
| Article 28 | Il y a prestation de services à soi-même : en cas d'utilisation d'un bien affecté à l'entrepris | Le constat ne tient sur aucun de ses trois piliers. (1) Il n'est pas cité verbatim : l'art. 28 du Décret n° 011/42 ampute DEUX FOIS les mots « par l'assujetti » et remplace le troisième tiret par une  |
| Article 29 | L'importation est l'entrée en RDC d'un bien ou d'un service. Pour un bien, elle est réalisée pa | L'article 29 du Décret est un article de DÉFINITION du champ (« signifie », « est réalisée », « vise »), pas une obligation documentaire du redevable : le constat convertit une clause de qualification |
| Article 30 (Décret n° 011/42) | Définition opérante de l'assujetti : personne physique ou morale, de droit public ou de droit p | CONSTAT RÉFUTÉ sur les quatre angles. 1) L'article 30 n'est pas une obligation : il est placé, dans le fichier lu à l'instant, sous « SECTION 2 : DES ASSUJETTIS » (l. 418) puis « Paragraphe 1er : De l |
| Article 31, alinéa 1er (Décret n° 011/42) | Double test cumulatif de l'indépendance : exercice sous sa propre responsabilité ET totale libe | CONSTAT RÉFUTÉ, sur trois fondements dont deux suffisent seuls. Je concède d'emblée l'angle 1 sur la forme : la citation est VERBATIM exacte, le numéro d'article est le bon, les renvois de ligne sont  |
| Article 32 (Décret n° 011/42) | Définition des deux modalités : habituel = effectué de manière répétitive ; occasionnel = non r | CONSTAT RÉFUTÉ sur l'angle 1 (deux fois), sur l'angle 2 retourné contre lui, et sur l'angle 3. Ses renvois de ligne sont exacts · je les ai vérifiés et je ne corrige rien de ce côté · mais l'article q |
| Article 33 (Décret n° 011/42) | Définition limitative, en quatre catégories, des personnes morales de droit public : l'Etat, le | CONSTAT RÉFUTÉ sur les angles 3 et 1, avec une réserve d'angle 2 qui retourne sa conclusion contre lui. Les citations du constat sont, elles, exactes : l'article 33 du décret n° 011/42 du 22 novembre  |
| Article 34 (Décret n° 011/42) | Principe : les personnes morales de droit public sont assujetties. Exception à double condition | CONSTAT RÉFUTÉ · il n'a plus d'objet propre une fois vérifié, et les DEUX apports qu'il revendique sont faux. 1) L'APPORT REVENDIQUÉ N°1 EST DÉMONTRABLEMENT FAUX. Le constat écrit : « l'AFFIRMATION LI |
| Article 36 (Décret n° 011/42) | Double définition : membre d'une profession libérale = personne exerçant une activité libérale  | ARTICLE 36 N'EST PAS UNE OBLIGATION : C'EST UNE ENTRÉE DE DICTIONNAIRE AUTO-LIMITÉE, DONT LE SEUL ATTACHEMENT OPÉRANT EST DÉSUET. Lu à l'instant dans /root/.claude/skills/synced/80921ba8-2ca0-4a8a-b7c |
| Article 37 (Décret n° 011/42) | Obligation, pour tout assujetti établi ou domicilié hors de RDC, de désigner un représentant RÉ | RÉFUTÉ sur l'angle 3 (déjà servi/déjà nommé), et la preuve avancée contient une affirmation de fait vérifiable et FAUSSE qui contredit le constat lui-même. 1) DÉJÀ NOMMÉ, DEUX FOIS. L'obligation de l' |
| Article 38, alinéa 1er (Décret n° 011/42) | Formalisme : la désignation se fait par lettre LÉGALISÉE OU NOTARIÉE adressée à l'Administratio | MANQUE DÉJÀ NOMMÉ · doublon du journal, sans apport propre du décret. Le constat est exact sur la lettre (art. 38, al. 1er, bien aux l. 494-495 : « La désignation du représentant se fait par lettre lé |
| Article 38, alinéa 2 (Décret n° 011/42) | Le représentant désigné doit être AGRÉÉ par l'Administration des Impôts, dans les conditions fi | CONSTAT RÉFUTÉ sur trois motifs cumulatifs : (1) il n'est pas neuf · l'obligation d'un « représentant AGRÉÉ » est portée par la LOI elle-même (O.-L. art. 23, al. 1) et elle est DÉJÀ au journal des man |
| Article 38 · texte inséré de l'A.M. n° 067 du 29 nov | IMPRIMÉ OBLIGATOIRE : la lettre de désignation doit suivre un MODÈLE déterminé par l'Administra | Le constat est réfuté sur trois jambes, dont aucune ne tient à l'absence elle-même (elle est réelle). (1) MAUVAIS RATTACHEMENT : l'obligation d'imprimé n'est PAS dans l'article 38 du décret. Lu à l'in |
| Article 38 · texte inséré de l'A.M. n° 067 du 29 nov | Délai à la charge de l'Administration : DIX JOURS OUVRABLES à compter de la réception de la let | CONSTAT RÉFUTÉ SUR L'ANGLE 4 (destinataire), confirmé par l'angle 3 (manque déjà déclaré), et sa preuve porte deux inexactitudes à corriger. 1) LE DÉLAI NE PÈSE SUR PERSONNE QUE LE CONSTAT PUISSE CODE |
| Article 38 · texte inséré de l'A.M. n° 067 du 29 nov | AGRÉMENT TACITE : le silence de l'Administration pendant dix jours ouvrables VAUT AGRÉMENT. Obl | CONSTAT RÉFUTÉ sur l'angle 4 (dirimant) et sur l'angle 3 (dirimant lui aussi), avec une réserve de numérotation sur l'angle 1. 1) AUCUN DES DEUX MEMBRES N'EST UNE OBLIGATION DU REDEVABLE. Le premier · |
| Article 39 (Décret n° 011/42) | Responsabilité solidaire du représentant avec l'assujetti, à triple assiette : la DÉCLARATION,  | Le constat n'est pas neuf, et sa preuve est factuellement fausse sur le dépôt. Le texte est bien cité (angle 1 tient, à un renvoi de ligne près), et l'excès du décret sur sa loi habilitante est réel · |
| Article 40 (Décret n° 011/42) | Unicité : l'assujetti ne peut désigner qu'UN SEUL représentant pour l'ensemble des opérations q | CONSTAT RÉFUTÉ sur trois angles, dont deux dirimants, et sa citation du dépôt est inexistante. 1) ANGLE 1 · LE CONSTAT AMPUTE L'ARTICLE DE LA SEULE CHOSE QUI EN FIXE LA PORTÉE. La citation verbatim es |
| Article 45 (Décret n° 011/42) | Les importations sont soumises à la TVA quelle que soit leur valeur : aucune franchise de valeu | CONSTAT RÉFUTÉ sur trois fondements indépendants, dont deux suffisent seuls. Je concède d'emblée l'angle 1 sur la citation : l'article est cité VERBATIM et sous le bon numéro · décret, l. 577-579 : «  |
| Article 46, première phrase (Décret, Chapitre II, Se | Principe de stricte limitation : seules les opérations énumérées aux articles 15 à 19 de l'O.-L | CONSTAT RÉFUTÉ sur quatre plans cumulatifs, dont deux sont des erreurs d'adresse vérifiables. Tout ce qui suit a été lu à l'instant. 1) L'ARTICLE 46 NE PORTE PAS L'OBLIGATION QUE LE CONSTAT Y FAIT ENT |
| Article 46, seconde phrase (Décret, Chapitre II, Sec | Interdiction d'étendre une exonération « en vertu des similitudes ou analogies entre les opérat | CONSTAT RÉFUTÉ. L'angle 1 est concédé sur la lettre : l'article, la section et les lignes sont exacts. Le constat tombe sur l'angle 3 (deux affirmations de fait fausses, dont celle qui porte toute la  |
| Article 47, alinéa 1 (Décret) | L'exonération des intrants agricoles de l'art. 15, point 6 de l'O.-L. ne vaut que pour les intr | CONSTAT RÉFUTÉ sur les angles 1, 2 et 3. Il coupe l'article 47 en deux et jette la moitié opérante, il invente une obligation probatoire que le texte ne porte pas, il affirme une thèse juridique que s |
| Article 47, alinéa 2 (Décret) | L'exonération est subordonnée à l'inscription du bien sur une liste fixée par Arrêté conjoint d | L'alinéa 2 de l'article 47 ne porte pas l'obligation énoncée : c'est une norme d'habilitation dont les seuls destinataires sont deux Ministres, et la « subordination » que le constat lui prête est dan |
| Article 47 · annexe (liste, structure en positions t | L'exonération se vérifie par CLASSEMENT TARIFAIRE : un bien n'est exonéré que si sa position ta | REFUTE sur les angles 1 et 3, chacun suffisant. (1) L'ARTICLE 47 NE PORTE PAS L'OBLIGATION ÉNONCÉE. Lu à l'instant (11-tva-decret-application-ch1-4.md, l. 589-596), l'art. 47 ne contient pas un mot su |
| Article 47 · annexe, n° 01 à 03, 18, 20, 21 (positio | Sont exonérés au titre des intrants agricoles des articles de PÊCHE : flotteurs pour la pêche,  | CONSTAT RÉFUTÉ sur quatre fondements indépendants. (1) Son affirmation centrale et prétendument « neuve » · « l'art. 15, 9° ne vise ni les flotteurs, ni les cannes, ni les hameçons, ni les moulinets,  |
| Article 47 · annexe, n° 04 (position 73.14, sous-pos | Seuil technique cumulatif conditionnant l'exonération des grillages et treillis soudés : fils d | Le « seuil technique cumulatif conditionnant l'exonération » n'existe pas : les 3 mm et 100 cm2 ne conditionnent RIEN. La citation du constat s'arrête au milieu de la ligne 644, juste avant les mots « |
| Article 47 · annexe, n° 05 (position 73.26, sous-pos | L'exonération des ouvrages en fer ou en acier est limitée aux batteries pour élevage et aux mat | Le constat rejoue, vu du côté de l'arrêté-annexe, un manque DÉJÀ confronté et DÉJÀ ÉCARTÉ à une passe précédente (art. 15, 6° de l'O.-L. n° 10/001, journal l. 419, section « Les quatre-vingt-treize co |
| Article 47 · annexe, n° 06 (position 82.01) | Exonération de l'outillage agricole, horticole ou forestier À MAIN, décliné en sous-positions 1 | CONSTAT RÉFUTÉ sur les angles 1, 2 et 3. (1) L'obligation est placée sous un numéro qui ne la porte pas : l'Article 47 du Décret ne compte que deux alinéas et ne nomme aucun outil ; il DÉLÈGUE la list |
| Article 47 · annexe, n° 07 (position 84.13, sous-pos | Les pompes pour liquides et les élévateurs à liquides ne sont exonérés que dans leurs sous-posi | RÉFUTÉ sur les quatre angles, dont deux sont fatals à eux seuls : (a) le constat attribue au DÉCRET une liste que le décret lui-même déclare fixée par un ARRÊTÉ interministériel, et son renvoi de lign |
| Article 47 · annexe, n° 08 (position 84.24, sous-pos | Les appareils mécaniques à projeter, disperser ou pulvériser ne sont exonérés que dans la sous- | Constat mal ancré et non neuf. Le renvoi de ligne est faux (n° 08 tient l. 706-716, la l. 717 ouvre le n° 09, position 84.32) ; la norme attaquée n'est pas le Décret mais l'A. Inter. n° 606 et n° 028  |
| Article 47 · annexe, n° 09 et 10 (positions 84.32 et | Exonération du machinisme de préparation du sol et de culture (84.32 : 10.00, 21.00, 29.00, 30. | Constat réfuté sur les quatre angles. (1) Il se trompe de source normative : l'article 47 du Décret n'édicte AUCUNE liste · il restreint l'exonération de l'art. 15, 6° aux « intrants destinés à l'usag |
| Article 47 · annexe, n° 11, 12, 13 (positions 84.34, | Exonération des machines à traire et appareils de laiterie (84.34 : 10.00 et 20.00), des presse | RÉFUTÉ sur quatre points indépendants, dont trois sont des erreurs de fait vérifiables. (1) ANGLE 1 · LE RENVOI DE LIGNES EST FAUX AUX DEUX BOUTS, et le numéro d'article ne porte pas ce qu'on lui prêt |
| Article 47 · annexe, n° 14 (position 84.37, sous-pos | Exonération des machines de nettoyage, triage ou criblage des grains et des légumes secs (10.00 | CONSTAT RÉFUTÉ sur quatre fondements indépendants, dont deux sont des erreurs de lecture du texte lui-même. 1) LA RÈGLE QU'IL ÉNONCE EST L'INVERSE DE CE QUE LE TEXTE DIT (angle 1, décisif). Le constat |
| Article 47 · annexe, n° 15 (position 85.39, sous-pos | Seules les lampes et tubes à rayons ultraviolets et infrarouges destinés à l'ÉLEVAGE (85.39.49. | Le constat impute au DÉCRET un item qui n'en est pas un (la liste est « fixée par l'A. Inter. n° 606 et n° 028 du 10 novembre 2012 », art. 47 al. 2 renvoyant à un arrêté), son renvoi de lignes est fau |
| Article 47 · annexe, n° 16 (position 87.01, sous-pos | Exonération des motoculteurs (10.00) et des tracteurs agricoles (90.00), à l'EXCLUSION expresse | Constat mal fondé sur trois angles, et non neuf sur le quatrième. (1) NUMÉRO. L'article 47 du décret ne porte PAS l'item n° 16. Verbatim, l. 589-596, il ne contient que deux choses : une restriction e |
| Article 47 · annexe, n° 17 (position 87.16, sous-pos | Exonération des remorques et semi-remorques autochargeuses ou autodéchargeuses pour usages agri | CONSTAT RÉFUTÉ sur son affirmation porteuse (« PAS DU TOUT »), et fragilisé sur trois autres points dont deux sont des erreurs de fait vérifiables. 1) ANGLE 3, DÉCISIF · L'EXONÉRATION EST SERVIE, PAR  |
| Article 47 · annexe, n° 19 (position 90.18, sous-pos | Parmi les instruments de médecine, chirurgie, art dentaire ou art vétérinaire, seule la sous-po | CONSTAT RÉFUTÉ sur quatre plans indépendants, dont trois sont des erreurs de fait vérifiables. Je concède d'emblée ce qui tient : la preuve empirique du confronteur est EXACTE · `grep -rniI "vétérinai |
| Article 47 · annexe, n° 22, 23, 24, 25 (positions 01 | Condition de qualité zootechnique : les animaux vivants ne sont exonérés que s'ils sont « repro | Le constat se trompe de fondement légal (la liste où figurent les n° 22-25 applique l'art. 15, point 6 · intrants agricoles · et non le point 18 sur les bêtes sur pied), invente une « condition de qua |
| Article 47 · annexe, n° 26 (position 01.05, sous-pos | Seuil de poids : la volaille vivante domestique n'est exonérée que dans la sous-position 01.05. | Le constat cite fidèlement et ses renvois de lignes sont exacts (je le concède), mais il s'effondre sur son affirmation porteuse, qui est une affirmation de DROIT vérifiable et fausse : « la volaille  |
| Article 47 · annexe, n° 27 (position 04.07, sous-pos | Condition de destination : seuls les œufs FERTILISÉS DESTINÉS À L'INCUBATION sont exonérés (11. | Le constat est réfuté sur son affirmation porteuse, sur sa source et sur sa nouveauté. (1) SA SOURCE EST MAL DÉSIGNÉE : l'Article 47 du décret ne contient ni liste tarifaire ni œuf ; il délègue « la l |
| Article 47 · annexe, n° 28 à 32 (positions 07.01, 07 | Condition « de semence » : pommes de terre (07.01.10.00), légumes à cosse secs (07.13, sous-pos | Constat mal adressé (angle 1) et déjà nommé (angle 3). L'article 47 du décret, lu verbatim, ne porte AUCUNE condition « de semence » ni aucune sous-position tarifaire : il pose une condition de DESTIN |
| Article 47 · annexe, n° 33, 34, 35 (positions 23.01, | Exonération des aliments pour animaux : farines et poudres de viandes, d'abats et cretons (23.0 | Le constat se trompe d'instrument, d'intitulé et de condition, sa citation entre guillemets n'est pas fidèle, et le manque qu'il décrit est déjà porté au journal · deux fois. (1) La liste des n° 33-35 |
| Article 47 · annexe, n° 36 (position 29.36) | Exonération des provitamines et vitamines non mélangées et de leurs dérivés : A (21.00), B1 (22 | Le constat impute au DÉCRET une norme que le décret refuse expressément de poser, ampute la seule condition qui gouverne l'exonération, se trompe de bornes de lignes, et rejoue un manque déjà examiné  |
| Article 47 · annexe, n° 37, 38, 39 (positions 30.02, | Exonération des vaccins pour la médecine VÉTÉRINAIRE (30.02.30.00), des médicaments non conditi | CONSTAT RÉFUTÉ sur les quatre angles. (1) Il se trompe d'INSTRUMENT : l'annexe n'est pas du décret, elle est fixée par un arrêté interministériel (l. 598-600), le décret se bornant à la déléguer. (2)  |
| Article 47 · annexe, n° 40, 41, 42, 43 (positions 31 | Exonération des engrais limitée aux sous-positions listées : urée même en solution aqueuse (31. | RÉFUTÉ sur les angles 1, 2 et 3. Le fait matériel est exact (le dépôt ne porte aucune liste tarifaire d'engrais exonérés), mais le constat est mal ancré, il repose sur une lecture fausse du libellé ta |
| Article 47 · annexe, n° 44 (position 38.08) | Exonération des produits phytosanitaires du 38.08 : fongicides (92.00), herbicides, inhibiteurs | Constat réfuté sur trois plans indépendants, chacun suffisant. (1) MAUVAIS INSTRUMENT : l'item n° 44 n'appartient pas au Décret. L'article 47 du Décret tient en deux alinéas (l. 589-596) qui ne nommen |
| Liste des équipements agricoles exonérés (annexée à  | L'exonération n'est acquise que si la marchandise figure dans la liste annexée, identifiée par  | Le critère que le constat impute au décret n'existe dans aucun article : « position tarifaire » n'apparaît dans 11-tva-decret-application-ch1-4.md qu'en EN-TÊTE DE COLONNE de tableaux, et zéro fois da |
| Article 48, alinéa 2 (décret, adapté conformément à  | « L'exonération des emballages des produits pharmaceutiques et des intrants pharmaceutiques ne  | Angle 3 · le manque est déjà nommé, deux fois, et la preuve avancée repose sur un grep accent-aveugle qui produit un faux négatif. (a) `docs/releve-de-manques-fiscal.md` porte déjà la ligne 328 « Arti |
| Article 48, alinéa 3 (décret) | « Un Arrêté conjoint des Ministres de la Santé et des Finances fixe la liste des intrants pharm | Le constat est fidèle au texte (la citation de l'art. 48, al. 3 est exacte au mot près, l. 1153-1154), mais il tombe sur trois autres angles. (4) L'alinéa 3 s'adresse aux DEUX MINISTRES, pas au redeva |
| Liste des intrants pharmaceutiques exonérés (A. Inte | L'exonération des intrants pharmaceutiques suppose l'inscription du produit dans une liste nomi | Le constat est réfuté sur l'angle 3 (le manque est déjà consigné au journal, avec le même article et la même gravité, et la donnée manquante y est déjà nommée), sur l'angle 1 (il met entre guillemets  |
| Article 49 (décret) | « Sous réserve de réciprocité, les biens et services destinés à l'usage officiel des missions d | Le constat tronque sa citation À L'INTÉRIEUR de la plage de lignes qu'il déclare lui-même (l. 1613-1617) : il coupe la seconde phrase de l'art. 49, « Les modalités d'application de la présente exonéra |
| Modalités d'application de l'exonération diplomatiqu | « Pour le bénéfice de l'exonération de la taxe sur la valeur ajoutée en régime intérieur, l'Adm | RÉFUTÉ sur l'angle 4 (destinataire), avec renfort de l'angle 3 (le seul volet de ce terrain qui touche le redevable est DÉJÀ au hors-scope et au journal) et deux corrections dues sur les angles 1 et 2 |
| Modalités d'application de l'exonération diplomatiqu | « La mission diplomatique et consulaire ou la représentation de l'organisation internationale e | Le constat tombe sur l'angle 4 (destinataire), qui est fatal, et sur l'angle 1 (fidélité de la citation pivot), qui est grave. L'angle 2 ne donne rien et je le concède franchement. 1) L'A.M. n° 009 NO |
| Modalités d'application de l'exonération diplomatiqu | « L'application de l'exonération de la taxe sur la valeur ajoutée au moment de l'IMPORTATION de | CONSTAT RÉFUTÉ sur les quatre angles, dont trois suffisent seuls. Sa citation, elle, est fidèle et je ne l'attaque pas là-dessus. 1) ANGLE 1 · LE TEXTE N'EST PAS CELUI QU'ON LUI PRÊTE, ET LE RENVOI DE |
| Article 50 (décret) | « Les exonérations à la taxe sur la valeur ajoutée entraînent la perte du droit à déduction de  | RÉFUTÉ. Le constat est exact sur le texte (citation verbatim fidèle, bon numéro, bonne place : l'art. 50 ferme bien la SECTION 4 : DES EXONERATIONS, l. 581-1651, avant le CHAPITRE III, l. 1652) et exa |
| Article 51, 1er tiret | Ventes de biens meubles corporels : le fait générateur est la livraison du bien, ni la facturat | CONSTAT RÉFUTÉ. Il demande au logiciel un « champ de date de livraison » que le décret qu'il invoque interdit lui-même de concevoir comme un événement physique (art. 7, l. 156-159 : la livraison « con |
| Article 51, 2e tiret | Prestations de services, travaux à façon et travaux immobiliers : fait générateur à l'exécution | Doublon d'un constat déjà réfuté, sur un tiret qui ne porte pas d'obligation. L'art. 51, 2e tiret du décret reproduit MOT POUR MOT l'art. 24, point 2 de l'O.-L. n° 10/001 · déjà confronté et réfuté en |
| Article 51, 3e tiret | Importations et exportations : fait générateur au franchissement des frontières de la RDC. | Constat réfuté sur l'angle 3 (déjà confronté et déjà écarté), avec une preuve matériellement fausse et une conséquence juridiquement impossible. (1) DÉJÀ JUGÉ. L'art. 51, 3e tiret du décret est la cop |
| Article 51, 4e tiret | Marchandises sous régime douanier suspensif : fait générateur repoussé à la mise à la consommat | Le constat charge l'article 51, 4e tiret (FAIT GÉNÉRATEUR) mais le prouve avec un hors-scope qui porte sur l'article 25, point 3 de la loi (EXIGIBILITÉ) · soit, côté décret, l'article 52, 5e tiret. Ma |
| Article 51, 5e tiret | Zone franche : fait générateur à la sortie des marchandises en vue de la mise à la consommation | Doublon exact d'un constat déjà jugé, sur un article qui ne porte aucune obligation. Le 5e tiret de l'art. 51 du décret recopie MOT POUR MOT le point 5 de l'art. 24 de l'O.-L. n° 10/001 · même phrase, |
| Article 51, 6e tiret | Opérations immobilières des promoteurs immobiliers : fait générateur à l'acte de mutation ou de | Constat non neuf (angle 3). La règle du 6e tiret de l'art. 51 du décret est MOT POUR MOT celle de l'art. 24, point 6 de l'ordonnance-loi n° 10/001, déjà déclarée hors scope en tête de `taux-tva.servic |
| Article 51, 7e tiret | Locations de terrains nus non aménagés ou de locaux nus réalisées par des PERSONNES ASSUJETTIES | CONSTAT RÉFUTÉ sur son affirmation centrale · « le motif inscrit au code est inexact pour ce tiret » · et sur sa nouveauté. Le repère d'article et les numéros de ligne du constat sont exacts (j'ai com |
| Article 51, 8e tiret | Biens ou prestations de services que les redevables se livrent à eux-mêmes : fait générateur à  | CONSTAT RÉFUTÉ sur l'angle 2 (le décret n'ajoute RIEN ici) et sur l'angle 3 (« PAS DU TOUT » est faux, et le manque résiduel est déjà nommé quatre fois comme constat RETENU). Trois des cinq renvois de |
| Article 51, 10e tiret | Règle balai : pour les autres opérations imposables, le fait générateur est l'encaissement du p | CONSTAT RÉFUTÉ, et non neuf. Angle 1 : le numéro est bon mais le constat loge sous un article de FAIT GÉNÉRATEUR un grief qui porte sur un champ d'EXIGIBILITÉ. L'art. 51 du décret dit quand naît la cr |
| Article 52, 1er tiret | Livraisons de biens faites à des tiers : exigibilité au transfert du pouvoir de disposer du bie | Le constat traite comme un « critère du décret » ce qui n'est qu'une substitution de la DÉFINITION LÉGALE au mot défini : le décret n° 011/42 définit lui-même, à son art. 7, la livraison à des tiers c |
| Article 52, 2e tiret | Livraisons de biens à soi-même : exigibilité à la première utilisation ou à la première mise en | CONSTAT RÉFUTÉ sur l'angle 3 (déjà nommé, et déjà confronté), avec renfort de l'angle 2 (le décret n'ajoute rien à la loi) et deux renvois de ligne faux dans sa propre preuve. Sa citation du 2e tiret  |
| Article 52, 4e tiret | Prestations de services à soi-même : exigibilité à la date de l'exécution du service. | CONSTAT MAL ANCRÉ ET DÉJÀ PORTÉ AILLEURS. Le 4e tiret de l'art. 52 du décret est une règle de DATE, et cette règle-là est servie ET testée par le dépôt : le 4434 classé 'BIENS' route vers `base: 'FAIT |
| Article 52, 5e tiret | Biens importés directement, placés sous régime suspensif ou sortis de zone franche : exigibilit | Constat REFUTE sur l'angle 3 (doublon), de façon decisive. La citation est fidele et le numero de tiret est bon · je ne l'attaque ni sur l'angle 1 ni sur l'angle 2 ·, mais le 5e tiret de l'art. 52 du  |
| Article 52, 6e tiret | Escompte d'un effet de commerce : exigibilité à la date de l'échéance de l'effet. | CONSTAT RÉFUTÉ, sur l'angle 3 principalement, et par un vice de doublon que le confronteur concède lui-même dans son explication. 1) ANGLE 1 · JE CONCÈDE TOUT, ET JE LE DIS FRANCHEMENT. Lu à l'instant |
| Article 52, 7e tiret | Crédit à la consommation et crédit-bail des établissements financiers : exigibilité à chaque éc | CONSTAT RÉFUTÉ, non sur les faits bruts mais sur la NOUVEAUTÉ et sur la gravité. Je concède trois choses : (angle 1) l'article et le rang sont bons · le 7e tiret de l'art. 52 du Décret n° 011/42 porte |
| Article 52, 8e tiret | Opérations liées aux cultures pérennes : exigibilité à la livraison des produits ou à la percep | RÉFUTÉ comme constat NEUF, sur trois jambes, aucune tenant à l'angle 1 (l'article et le rang du tiret sont exacts) ni à l'angle 4 (c'est bien une obligation du redevable). 1) DÉJÀ AU JOURNAL DES PASSE |
| Article 52, 9e tiret | Mutations de propriété d'immeuble : exigibilité à la date de mutation ou de transfert. Exceptio | REFUTE sur trois des quatre piliers du constat : sa GRAVITE (« FAUX »), sa NOUVEAUTE (« CONSTAT NEUF ») et l'ATTRIBUTION du motif qu'il attaque. (1) La phrase qu'il accuse d'être une affirmation fauss |
| Article 53 | Vente sous condition SUSPENSIVE : fait générateur ET exigibilité reportés au moment de la réali | Réfuté sur les angles 1 et 3. (1) La citation de l'art. 53 est fidèle, mais le constat lui prête une exigence qu'il ne porte pas : l'article ne réclame aucune donnée nouvelle, il fixe une DATE, et cet |
| Article 54 | Vente sous condition RÉSOLUTOIRE : fait générateur ET exigibilité dès la conclusion du contrat. | CONSTAT RÉFUTÉ sur les angles 1 et 3. La citation de l'article est fidèle et le numéro est bon, mais le constat fabrique la seule chose qui justifie sa gravité : une « lacune du texte » qui n'existe p |
| Article 56 | Définition opérante du décompte : sommes correspondant à des consommations ou prestations de pé | Doublon d'un manque DÉJÀ PORTÉ AU JOURNAL sous l'article porteur, avec la gravité identique : docs/releve-de-manques-fiscal.md l. 350 retient « Article 24, point 9 · Pour les livraisons de biens, pres |
| Article 57, alinéa 2, 3e tiret | Virement, ordre de paiement ou tout autre moyen y compris électronique ayant pouvoir libératoir | Le constat s'effondre sur l'angle 3, et il s'auto-réfute sur l'angle 1. Le 3e tiret est précisément celui des quatre où le substitut comptable ne substitue RIEN : « l'inscription au crédit du compte d |
| Article 58 | Option pour les débits : ouverte aux entrepreneurs de travaux publics et immobiliers et aux pre | CONSTAT RÉFUTÉ sur les angles 1, 2 et 3, et trois de ses quatre renvois au code sont inexacts. L'article existe et le constat en cite le corps fidèlement · c'est le seul point concédé. 0) CE QUI EST C |
| Article 59 | La décision intervient dans les DIX JOURS suivant la réception de la demande ; l'absence de déc | Sa preuve centrale est factuellement fausse · le dépôt porte déjà, mot pour mot, le délai de dix jours ET l'autorisation tacite de l'art. 59 (tiers.dto.ts l. 102-108) · et son grief le plus grave (bor |
| Article 62 | L'autorisation d'acquitter d'après les débits ne dispense pas de la taxe au moment de l'encaiss | Doublon sans contenu normatif propre. L'article 62 du décret ne fait que recopier l'article 26, alinéa 3, de l'O.-L. n° 10/001 : lu côte à côte, il n'ajoute ni modalité, ni condition, ni renvoi. Or ce |
| Article 63 | Sortie du régime des débits : l'autorisation est révocable sur SIMPLE DEMANDE ÉCRITE du contrib | CONSTAT RÉFUTÉ, sur les angles 1, 3 et 4 réunis · la citation de l'article est fidèle (c'est le seul point concédé), mais le constat (a) impute à l'art. 63 un grief que l'article ne porte pas et qu'il |
### Ce que cette passe apprend sur la méthode

- **Donner aux confronteurs ce qui est déjà déclaré multiplie le rendement.**
  85 % de réfutation, contre 37 % à 83 % pour les passes précédentes, et
  pourtant sept constats de gravité FAUX · le bruit tombe, le signal reste.
- **Un décret d'application rapporte ce que sa loi ne peut pas donner.** Les
  art. 55, 56 et 57 n'ont aucun équivalent dans l'ordonnance-loi : ils datent
  l'encaissement moyen de paiement par moyen de paiement, et c'est exactement
  le niveau de détail qu'un logiciel de comptabilité peut manquer sans que la
  lecture de la loi ne le révèle jamais.
- **Une correction peut créer le défaut qu'elle corrige.** Le constat qui
  demandait d'ouvrir la lecture de la contrepartie au SYCEBNL avait raison pour
  les CHARGES et tort pour les PRODUITS, et suivre sa conclusion en bloc aurait
  minoré les déclarations de tous les dossiers SYCEBNL vendeurs de
  marchandises. La règle n° 1 du dépôt vaut aussi contre un constat retenu ·
  relire le plan avant d'élargir une table.

## Passe F3b · Décret n° 011/42, chapitres IV à XII (2026-09-17)

**Corpus** · les deux derniers fichiers du décret, 1 718 lignes · base
d'imposition et taux, régime des déductions (principes, conditions,
exclusions, limitation, régularisations), obligations des redevables,
liquidation et recouvrement, remboursement du crédit de taxe, procédures,
infractions et pénalités, dispositions transitoires et finales, plus le début
d'un arrêté d'application qui suit dans le même fichier.

**Volumétrie** · 183 agents, 20,1 M de jetons, 7 h 03.

**LE CONTENEUR A REDÉMARRÉ EN COURS DE ROUTE, ET LA REPRISE N'A PAS REJOUÉ LE
CACHE.** Le premier lancement avait rendu 155 résultats sur 157 agents ; la
relance par `resumeFromRunId` a refait le travail au lieu de le rejouer, 183
agents pour 20,1 M de jetons. La reprise est documentée comme valable dans la
même session, et le conteneur avait changé sous elle. À retenir pour les 28
passes qui restent · **une passe longue doit être découpée assez court pour
tenir dans une vie de conteneur**, la reprise n'étant pas un filet.

**Résultat** · 227 constats, dont 171 soumis à réfutation. **134 écartés**,
**37 retenus**, dont 8 de gravité FAUX. 78 % de réfutation.

### Ce qui est corrigé dans le code, et testé

#### 1 · L'article 100 réclame l'adresse exacte, et c'est MA correction de F1 qui l'avait niée

C'est le constat le plus lourd de la passe, et le plus désagréable · **le
défaut que F1 avait corrigé est revenu par l'autre porte, introduit par la
correction elle-même**.

F1 avait ajouté l'adresse exacte aux mentions du décret n° 23/10 (art. 26) et,
pour borner le texte à son entrée en vigueur, **dérivé** la branche antérieure
en retirant cette mention, avec cette phrase à l'écran : « Ni l'adresse exacte
ni le montant des autres impôts et taxes ne lui sont réclamés. » Le décret
n° 011/42, art. 100, lu ce jour, dit le contraire à ses deux premiers tirets ·
« les noms, post-nom, prénom ou raison sociale, **l'adresse exacte**, le numéro
impôt du vendeur ou prestataire » et « les noms, post-nom et prénom ou raison
sociale, **l'adresse exacte** du client et son numéro impôt ».

`verifierMentions` rendait donc `conforme: true` sur une facture de 2022 qui
omet deux mentions obligatoires · exactement le défaut de F1, sur la branche la
plus difficile à voir, celle des pièces anciennes reprises dans un dossier.

**Et il y coûte plus cher qu'ailleurs.** L'art. 104 du même décret : « Les biens
et services qui ne remplissent pas les conditions visées aux articles 95, 98 et
100 ci-dessus sont **exclus du droit à déduction**. » Une facture d'achat sans
adresse n'ouvre pas droit à déduction, et le logiciel l'affichait conforme. La
sanction ne se limite pas à l'amende de l'art. 97 bis : elle atteint la taxe.

Ce qui distingue réellement les deux textes, et c'est tout : l'art. 100 compte
**neuf** groupes, l'art. 26 en compte **dix**, le dixième étant le montant des
autres impôts et taxes. C'est la seule mention que la branche antérieure
retire désormais.

**La leçon, et c'est la quatrième du même genre** · quand une correction DÉRIVE
une branche d'une autre, il faut **lire le texte de la branche dérivée**, et non
déduire son contenu de la différence entre deux dates.

#### 2 · Le seuil de l'objet publicitaire existait, chiffré, et le module le déclarait introuvable

Le module écrivait que « la valeur UNITAIRE n'est nulle part dans le modèle ».
Inexact depuis l'item I1 · `LigneFacture` porte `quantite` et `prixUnitaire`.
Et le décret chiffre ce que la loi laissait indéterminé · art. 107 : « Par objet
publicitaire de faible valeur, il faut entendre le bien dont la valeur unitaire
est **inférieure à 10.000,00 Francs congolais** », le Ministre des Finances
étant habilité à réajuster ce montant, sans qu'aucun réajustement figure au
corpus lu.

Ce qui reste vrai est maintenant dit à la bonne place : **cette déclaration ne
lit pas les factures, elle lit les écritures**, et une ligne d'écriture ne porte
qu'un montant global. Le montant reste donc déduit, la mention porte le seuil
avec son article, et elle dit **où** la condition se vérifie au lieu d'affirmer
que la donnée n'existe pas.

### Vérification

Trois réinjections de défaut, trois attrapées · l'adresse exacte retirée de
nouveau de l'art. 100, l'exclusion de déduction de l'art. 104 effacée de la
source rendue à l'écran, le seuil chiffré de l'art. 107 retiré de la mention.

233 suites / 3 490 tests serveur, 41 fichiers / 468 tests client.

### Les trente-cinq autres constats retenus

| Article | Ce que le texte impose | Gravité |
|---|---|---|
| Article 74 | Les subventions sont dans la base imposable lorsqu'elles représentent l'unique contrepartie d'une opération imposable ou le complément du prix d'une telle opération ; définition · aides pécuniair | INCOMPLET |
| Article 75 | Grille de qualification à deux caractéristiques : subvention accordée au fournisseur ou prestataire EN RELATION avec ses ventes ou prestations imposables au profit de ses clients, ET versée pour  | INCOMPLET |
| Article 76 | Les dons, les abandons de créances et les aides interentreprises sont soumis aux MÊMES RÈGLES que les subventions (donc aux conditions des art. 74 et 75). | INCOMPLET |
| Article 78 | Les pièces détachées employées dans une prestation NE sont PAS comprises dans la base de la prestation et sont imposées DISTINCTEMENT comme livraison de biens. Définition à trois critères cumulat | FAUX |
| Article 81 | SEUIL CHIFFRÉ : les distributions gratuites de biens à des fins de publicité ou de promotion commerciale sortent de la base à condition que leur montant n'excède pas 1 % du chiffre d'affaires DE  | INCOMPLET |
| Article 102 (décret n° 011/42) | IMPUTATION MENSUELLE GLOBALE : l'assujetti qui effectue uniquement des opérations ouvrant droit à déduction exerce globalement son droit en imputant sur le total de taxes collectées POUR LE MOIS  | INCOMPLET |
| Article 96, 2e et 3e phrases (décret n° 011/42) | DÉLAI : le droit à déduction est exercé jusqu'au 31 décembre de l'année qui suit celle au cours de laquelle la taxe est devenue exigible. À l'expiration de ce délai, la TVA non déduite est acquis | FAUX |
| Article 98, 1re phrase (décret n° 011/42) | CONDITION D'AFFECTATION : ouvrent droit à déduction les biens fournis et les services rendus à l'assujetti qu'il destine EFFECTIVEMENT à l'exercice de l'activité économique qui lui donne la quali | INCOMPLET |
| Article 103, alinéa 2 (décret n° 011/42) | EXCLUSION : la TVA ayant grevé les immobilisations détenues par un assujetti qui entre nouvellement dans le champ de la TVA n'ouvre pas droit à déduction. | AUCUNE |
| Article 105, 2e tiret (Décret) | Exclusion des biens et services acquis par l'entreprise mais utilisés par des tiers, les dirigeants ou le personnel · contre-exceptions : vêtements de travail ou de protection, locaux et matériel | AUCUNE |
| Article 106 (Décret) | Définition opérante : « Par véhicules de tourisme, il faut entendre les véhicules destinés au transport de personnes ou faisant l'objet d'un usage mixte. » Le seul usage mixte suffit à faire basc | INCOMPLET |
| Article 108, alinéa 1er (Décret) | Bascule tout-ou-rien à 50 % : si l'utilisation pour les besoins privés de l'assujetti, ceux de son personnel ou plus généralement à des fins étrangères à l'entreprise dépasse 50 % de l'utilisatio | INCOMPLET |
| Article 108, alinéa 2 (Décret) | Méthode de calcul du pourcentage d'utilisation privée : l'assujetti peut appliquer soit un critère physique, soit un critère relatif au chiffre d'affaires, À CONDITION DE LE JUSTIFIER · obligatio | INCOMPLET |
| Article 111, alinéas 1 et 2 (Décret) | Formule du prorata · NUMÉRATEUR : recettes annuelles des opérations ouvrant droit à déduction, y compris celles rendues aux missions diplomatiques et consulaires et aux organisations internationa | AUCUNE |
| Article 130 (al. 2 à 4) | Souscrire la déclaration d'assujettissement auprès du Service gestionnaire compétent, sur formulaire fourni par l'Administration, au plus tard le QUINZIÈME JOUR qui suit le début des activités (e | FAUX |
| Article 134 (al. 1er, points 1 et 2) | Joindre à la déclaration mensuelle un état détaillé comportant huit indications par ligne pour les livraisons de biens et prestations de services, et trois pour les importations. | FAUX |
| Article 121 (al. 2 et 3) | Le vendeur doit délivrer à l'acquéreur une attestation portant le montant de la taxe reversée, l'identification du cédant ou de l'apporteur et de l'acquéreur, la nature du bien, le prix, la date  | INCOMPLET |
| Article 124 (al. 2) | Dispense de reversement lorsque la disparition résulte d'un cas de force majeure, à la condition que la disparition soit établie au moyen d'un procès-verbal dressé par un officier de police judic | INCOMPLET |
| Article 123 | La perte de la qualité d'assujetti ou la cessation des opérations soumises à la TVA donne lieu au reversement de la taxe initialement déduite, conformément aux articles 117, 118, 120 et 122 du dé | INCOMPLET |
| Article 129 (al. 2) | Formule de la régularisation annuelle du prorata sur immobilisation : un cinquième de la différence entre le produit de la taxe ayant grevé le bien par le prorata définitif de l'année d'acquisiti | INCOMPLET |
| Article 127 (al. 1er) | Opérations annulées ou résiliées : établir ET envoyer au client une facture nouvelle ou une note de crédit annulant et remplaçant la facture initiale ; barrer celle-ci et la conserver dans le fac | INCOMPLET |
| Article 127 (al. 2) | Créance irrécouvrable : envoyer au client un duplicata de la facture impayée surchargé d'une mention à formule imposée ; à réception, le client est tenu de reverser la taxe déduite. | INCOMPLET |
| Article 135 | Délivrer une facture normalisée ou un document en tenant lieu pour les biens livrés et services rendus à un autre redevable, ainsi que pour les acomptes perçus donnant lieu à exigibilité de la ta | INCOMPLET |
| Article 137, alinea 1 | Le montant net de TVA a reverser comprenant une decimale est arrondi a l'unite superieure si la premiere decimale est superieure ou egale a 5, a l'unite inferieure dans le cas contraire. | FAUX |
| Article 137, alineas 2 et 3 | Second niveau d'arrondi : tranche du montant arrondi superieure ou egale a 50 FC, centaine de Francs congolais superieure ; tranche inferieure a 50,00 FC, centaine inferieure. Le montant a payer  | FAUX |
| Article 142 | Une entreprise dissoute est consideree en cessation d'activites a la date a laquelle elle a vendu la totalite de son stock de marchandises ou a cesse toute prestation ; les taxes supportees sur l | INCOMPLET |
| Article 145, en cas d'exportation | Joindre a la demande, en cas d'exportation, la copie du document bancaire etablissant la preuve du paiement par le client de l'exportateur et la copie du titre de transport, ainsi que les copies  | INCOMPLET |
| Article 145, en cas d'importation | Joindre a la demande, en cas d'importation, les copies des declarations de mise a la consommation et les copies des preuves de paiement des droits de douane. | INCOMPLET |
| Article 145, en cas de cessation d'activites | Joindre la copie de la declaration de cessation d'activites prescrite a l'article 2 de la Loi n° 004/2003 du 13 mars 2003 portant reforme des procedures fiscales. | INCOMPLET |
| Article 145, dans tous les cas | Joindre dans tous les cas la copie de la derniere declaration mensuelle de TVA faisant apparaitre le credit, l'etat recapitulatif des factures fournisseurs comportant les numeros des factures, le | INCOMPLET |
| A.M. n° 018 (investissements lourds · dossier de certification pré | « tous les investissements lourds, à l'exception des investissements des entreprises dont les projets sont agréés au Code des Investissements, doivent faire l'objet d'un dossier présenté préalabl | INCOMPLET |
| Décret, art. 154 (définition de la mention abusive) | « La mention abusive de la taxe sur la valeur ajoutée sur une facture ou un document en tenant lieu vise notamment les cas ci-après : - le fait pour un contribuable de facturer la taxe sur la val | FAUX |
| A.M. n° 008, art. 3 (demande écrite, autorité, formulaire) | « Pour être assujetti à la taxe sur la valeur ajoutée par option, le contribuable est tenu de formuler sa demande par écrit auprès du Directeur Urbain ou Provincial des Impôts dont il relève, au  | INCOMPLET |
| A.M. n° 015, art. 4 al. 4 (formule du bloc IV) | « L'entreprise minière a également l'obligation de reprendre dans le bloc IV de la même déclaration, relatif aux déductions, le montant de cette taxe diminué de la taxe sur la valeur ajoutée ayan | INCOMPLET |
| A.M. n° 015, art. 8 | « Les nouvelles entreprises minières entrant en phase d'exploitation après l'entrée en vigueur du présent Arrêté sont tenues de se faire enregistrer auprès de l'Administration douanière. » | INCOMPLET |
### Les cent trente-quatre constats écartés

| Article | Obligation alléguée | Motif de la réfutation (extrait) |
|---|---|---|
| Article 64 (alinéa 1er) | Base = tout ce qui est perçu en contrepartie, subventions et tous frais/impôts/droits/taxe | Angle 3, décisif : le constat n'a pas d'objet propre. L'art. 64, al. 1er du décret n'est pas une reprise « quasi littérale » de l'art. 27, al. 1er de l'O.-L. n° 10/001 · c'est le MÊME TEXTE, |
| Article 64, points 4 à 9 | Bases par nature d'opération interne : livraisons, prestations (y compris valeur des biens | Doublon intégral d'un manque déjà jugé. L'article 64 du décret, en ses points 4 à 9, est une recopie MOT POUR MOT de l'article 27 de l'O.-L. n° 10/001, points 4 à 9 (diff exécuté : aucune di |
| Article 64, points 10 à 12 | Marge bien par bien pour les négociants de biens d'occasion, d'œuvres d'art, d'objets de c | CONSTAT RÉFUTÉ sur trois plans indépendants, dont deux sont des faits vérifiables et faux. 1) SON AFFIRMATION PORTEUSE EST FAUSSE. Le constat écrit que le point 12 « est le constat neuf de c |
| Article 65 | Agréger quatre blocs pour former la base : prix de base + impôts, taxes et autres prélèvem | Le constat requalifie un chapeau de plan en formule d'agrégation, et ses deux « conséquences mesurables » reposent toutes deux sur une prémisse que l'article même qu'il invoque contredit · q |
| Article 66 | Définition du prix de base : prix des marchandises ou services, ou valeur des biens ou ser | CONSTAT RÉFUTÉ sur quatre plans indépendants, dont deux erreurs de fait vérifiables dans sa propre preuve. 1) ANGLE 1 · IL N'Y A PAS D'OBLIGATION, ET LE CONSTAT L'ÉCRIT LUI-MÊME. Lu à l'inst |
| Article 67 | Inclure dans la base les impôts directs et indirects et toutes les taxes qui constituent d | CONSTAT RÉFUTÉ sur les quatre angles, et d'abord sur la lecture de l'article qu'il invoque. 1) ANGLE 1 · L'ARTICLE 67 N'EST PAS UNE OBLIGATION, C'EST UNE ENTRÉE DE DICTIONNAIRE. Lu à l'insta |
| Article 68 | Liste non limitative des frais accessoires à inclure dans la base : transport, emballage,  | REFUTE sur les angles 1 et 2, et affaibli sur l'angle 3. (1) L'article 68 du décret ne porte AUCUNE obligation : c'est une définition, sans sujet obligé ni verbe d'obligation. Lu verbatim (f |
| Article 69 | Vente franco domicile : les frais de transport supportés par le vendeur sont compris dans  | Constat mal ancré et dommage inexistant. L'article 69 est une règle à SENS UNIQUE (« sont compris dans la base ») : aucune des deux données réclamées n'est nécessaire pour atteindre le résul |
| Article 70 | Vente départ magasin : frais de transport ajoutés à la base, SAUF deux cas · (1) transport | CONSTAT RÉFUTÉ. J'accorde d'emblée l'angle 4 (l'art. 70 vise bien une opération du redevable, donc dans le périmètre) et l'exactitude des deux renvois au dépôt (taux-tva.service.ts:175 porte |
| Article 71 | Emballages perdus : facturés globalement avec la marchandise, ils sont un élément de son p | RÉFUTÉ sur les angles 1, 2 et 3, avec en outre une prémisse de droit démontrablement fausse et une preuve dont les trois quarts ne portent pas sur l'article invoqué. ANGLE 1 · L'ARTICLE EST  |
| Article 72 | Emballages consignés non rendus dans le DÉLAI CONVENU ou en usage dans la profession : req | REFUTE sur l'angle 3, avec une reserve dirimante sur l'angle 2 et trois preuves mal qualifiees sur l'angle 1. Le constat concede lui-meme que le fond est deja journalise (docs/releve-de-manq |
| Article 73 | Les indemnités sont dans la base, sauf caractère de dommages-intérêts ; elles ne l'ont pas | Constat réfuté sur sa GRAVITÉ et sur sa PREUVE, non sur le texte. L'article 73 est cité fidèlement et l'angle 2 ne donne rien. Mais les deux propositions qui portent le « AUCUNE » sont fauss |
| Article 77 | Les fournitures employées dans une prestation de services sont comprises dans la base impo | CONSTAT RÉFUTÉ sur les angles 1, 2 et 3. L'angle 4 est concédé (l'art. 77 vise bien la base imposable du redevable). Quatre vices, dont deux sont dirimants. 1) LA PREUVE CENTRALE EST FACTUEL |
| Article 79 | Trois conditions CUMULATIVES pour exclure une réduction de prix de la base : bénéficier ef | Constat réfuté sur l'angle 3 et sur son propre pivot de nouveauté. L'affirmation de droit qui le fonde · « Aucun des deux ne dit que l'exclusion est SUBORDONNÉE à l'inscription de la réducti |
| Article 80 | Trois conditions CUMULATIVES pour exclure les débours de la base : mandat PRÉALABLE ET EXP | REFUTE sur quatre plans indépendants, dont trois sont des erreurs de fait vérifiables. (1) ANGLE 2 · le décret excède sa loi habilitante sur la SEULE condition que le constat revendique comm |
| Article 85 | Liste LIMITATIVE des trois régimes particuliers de base : ventes de biens d'occasion par l | Constat mal fonde sur les angles 1 et 2, et sa preuve est inexacte sur deux points verifiables. (1) Le mot LIMITATIVE, qui porte tout le raisonnement, n'est PAS dans l'article 85 : le texte  |
| Article 86 | Base des ventes de biens d'occasion : régime de l'art. 64 en principe ; par exception, lor | Constat réfuté sur l'angle 3 (le manque est déjà nommé, et verrouillé par un test) et sur l'angle 2 (la « nouveauté » qu'il invoque n'en est pas une : le prélèvement « en dedans » n'est pas  |
| Article 88 | Définitions délimitant le régime : négociant en biens d'occasion = assujetti qui, dans le  | CONSTAT RÉFUTÉ sur les angles 1, 3 et 4, et sa preuve matérielle est fausse sur trois points vérifiables. 1) ANGLE 1 · L'ARTICLE NE PORTE AUCUNE OBLIGATION, ET LE CONSTAT LE CONCÈDE. Lu à l' |
| Article 89 | Agences de voyage et organisateurs de circuits touristiques : base = prix total TTC payé p | CONSTAT RÉFUTÉ, principalement sur l'angle 3, avec renfort de l'angle 2. Je concède d'emblée l'angle 1 sur le fond : l'article 89 existe, il est bien à cet endroit, et le constat le restitue |
| Article 90 | Définition de l'agence de voyage : personne dont l'activité consiste soit à organiser et v | CONSTAT RÉFUTÉ sur trois angles indépendants, dont deux sont des erreurs de fait vérifiables. Le constat s'auto-annule d'ailleurs (« gravité : AUCUNE », « Elle ne porte pas d'obligation auto |
| Article 91 | OBLIGATION COMPTABLE EXPRESSE : l'agence de voyage doit ventiler CHAQUE mouvement de fonds | Le texte est fidèlement cité et le numéro d'article est bon, mais le constat s'effondre sur ses trois affirmations opérantes. (1) ANGLE 3 · LE MANQUE EST DÉJÀ NOMMÉ. Le constat affirme qu'il |
| Article 92 | Transitaires, commissionnaires de transport et commissionnaires en douane : base = rémunér | La seule nouveauté revendiquée · la condition « LORSQU'ILS SONT JUSTIFIÉS » que le décret « ajouterait » · n'est pas ajoutée par le décret : elle figure déjà, mot pour mot en substance, dans |
| Article 103, alinéa 1er (décret n° 011/42) | STOCK D'ENTRÉE : la TVA sur les biens non immobilisés détenus en stock à la date à laquell | Manque déjà nommé deux fois (journal l. 621 + hors-scope l. 510-516), et le seul « apport » revendiqué du décret ne survit pas à la lecture : la sanction « non régularisable / perdu sans rec |
| Article 101 (décret n° 011/42) | TROIS CONDITIONS CUMULATIVES DE FOND : la TVA doit grever le prix d'un bien ou d'un servic | RÉFUTÉ. Le constat cite bien son texte (angle 1 ne donne rien sur les mots) et vise bien une obligation du redevable (angle 4 concédé), mais il tombe sur l'angle 3, il porte une affirmation  |
| Article 98, 2e phrase (décret n° 011/42) | INTERDICTION : aucun droit à déduction n'est ouvert aux assujettis qui effectuent des opér | Les deux « trous » tombent chacun pour une raison distincte, et aucun ne tient sur l'article 98, 2e phrase. (1) Le premier fait dire à l'article 98 ce qu'il ne dit pas · il interdit la déduc |
| Article 95, dernière phrase (décret n° 011/42) | Autorisation expresse de déduire la TVA afférente aux livraisons de biens à soi-même et au | CONSTAT RÉFUTÉ sur l'angle 3 (déjà nommé ET déjà écarté), avec trois éléments de preuve matériellement faux dans sa propre démonstration. (1) LE MÊME CONSTAT A DÉJÀ ÉTÉ CONFRONTÉ ET ÉCARTÉ.  |
| Article 99 (décret n° 011/42) | PIÈCE JUSTIFICATIVE OBLIGATOIRE : la TVA doit figurer (1) en général sur une facture norma | CONSTAT RÉFUTÉ. Sa pièce maîtresse · « la réserve exacte de ce qui n'est pas tenu » (reserveSupports, l. 212-215) · n'est pas exacte : elle est fausse sur son troisième volet, et le dépôt l' |
| Article 95 (décret n° 011/42) | ÉNUMÉRATION des acquisitions et importations dont la TVA amont est déductible : matières p | Constat non fondé sur trois plans cumulatifs. (1) L'article 95 n'édicte aucune obligation de qualification ligne par ligne : c'est une norme ATTRIBUTIVE (« Est déductible la taxe sur la vale |
| Article 104, alinéa 1er (Décret n° 011/42, ch. V,  | Tout bien ou service qui ne remplit pas les conditions des art. 95, 98 et 100 du Décret es | CONSTAT RÉFUTÉ sur trois plans cumulatifs, alors même que sa citation est verbatim-exacte et ses lignes 438-439 justes. (1) L'ARTICLE 104, ALINÉA 1er N'EST PAS UNE OBLIGATION AUTONOME : c'es |
| Article 105, 1er tiret (Décret) | Exclusion de la TVA sur logement, hébergement, restauration, réception, spectacles, locati | Le constat ne porte aucune obligation qui lui soit propre : le 1er tiret de l'art. 105 du Décret est CARACTÈRE POUR CARACTÈRE le point 1 de l'art. 41 de la loi, et la source elle-même le dit |
| Article 105, 3e tiret (Décret) | Exclusion des produits pétroliers, sauf ceux destinés à la revente par les grossistes ou a | Constat écarté sur les angles 2 et 3. ANGLE 3 (décisif) : le manque n'est pas neuf, et il n'est même pas seulement « nommé » · il est écrit, motivé, journalisé et GELÉ PAR DEUX TESTS. Le jou |
| Article 105, 4e tiret (Décret) | Déductibilité des carburants utilisés par des appareils fixes comme combustibles dans les  | RÉFUTÉ sur l'angle 3 à titre principal, avec un appui sur l'angle 1. 3) Le manque est DÉJÀ NOMMÉ, déjà retenu au journal et déjà servi en avertissement dans le code : le Décret, art. 105, 4e |
| Article 105, 5e tiret (Décret) | Régime résiduel des produits pétroliers : exclusion limitée à 50 % pour les cas autres que | Réfuté sur l'angle 3, qui suffit seul : le manque n'existe pas et il est DÉJÀ CONSIGNÉ. Le constat concède lui-même gravité AUCUNE, admet que le refus d'appliquer le pourcentage est « écrit  |
| Article 105, 6e tiret (Décret) | Règle d'accessoire : tout service portant sur un bien, produit ou marchandise lui-même exc | DÉJÀ NOMMÉ · doublon exact du relevé F2b. Le 6e tiret de l'article 105 du Décret est la reprise verbatim de l'article 41, point 4 de l'Ordonnance-loi, et « Article 41, point 4 » figure déjà  |
| Article 105, 7e tiret (Décret) | Exclusion des objets mobiliers autres que ceux utilisés par l'assujetti pour son exploitat | CONSTAT RÉFUTÉ sur l'angle 3 (il n'est pas neuf : il est déjà au journal, nommé, depuis la passe F2b) et sur l'angle 2 (le décret n'ajoute strictement rien à la loi qu'il applique). Les angl |
| Article 105, 8e tiret (Décret) | Exclusion des immeubles autres que les bâtiments et locaux à usage professionnel. | REFUTE sur DEUX piliers : la NOUVEAUTE et la PREUVE AVANCEE. Le fond du texte, lui, tient (citation fidele, renvoi l. 478 exact, 8e tiret exact, obligation bien du redevable), mais un consta |
| Article 105, 9e et dernier tiret (Décret) | Exclusion des biens cédés et services rendus gratuitement ou à un prix inférieur au prix d | CONSTAT RÉFUTÉ · il est le DOUBLON d'un constat déjà instruit et déjà écarté, sur un tiret du Décret qui ne porte RIEN de plus que la loi dont il est le décalque, et il porte deux renvois de |
| Article 107, alinéa 2 (Décret) | « Le Ministre ayant les Finances dans ses attributions est habilité à réajuster ce montant | Le constat s'effondre sur trois plans cumulatifs, dont deux suffisent chacun. (1) CE N'EST PAS UNE OBLIGATION, ET ELLE NE S'ADRESSE PAS AU REDEVABLE (angle 4). L'article 107, alinéa 2 du Déc |
| Article 109, point 1 (Décret) | Exclusion de la TVA sur les véhicules ou engins, quelle que soit leur nature, conçus ou am | CONSTAT RÉFUTÉ sur l'angle 3 (dirimant : le manque est déjà nommé TROIS fois, dont une au JOURNAL des passes précédentes) et sur l'angle 1 (l'obligation telle qu'énoncée ampute le texte de s |
| Article 109, point 1, exceptions (Décret) | Trois exceptions rendant la taxe déductible, à conditions cumulatives vérifiables : véhicu | Constat réfuté sur les angles 3 et 1, et son fondement textuel est le plus faible des deux disponibles (angle 2). (3) DÉJÀ NOMMÉ, ET LE CONSTAT LE CONCÈDE LUI-MÊME · les trois contre-excepti |
| Article 109, point 2 (Décret) | Exclusion de la TVA sur les transports de personnes et les opérations accessoires, sauf tr | CONSTAT RÉFUTÉ · DOUBLON D'UN MANQUE DÉJÀ PORTÉ AU RELEVÉ, ET AUTO-RÉFUTÉ PAR SA PROPRE GRAVITÉ « AUCUNE ». 1) L'angle 3 suffit à l'écarter. La règle visée est DÉJÀ INSCRITE au journal des p |
| Article 109, point 3 (Décret) | Exclusion de la TVA reprise sur une facture émise en dehors des dispositifs électroniques  | RÉFUTÉ sur l'angle 3 (manque déjà nommé), confirmé par l'angle 2 (le décret ne peut pas rendre applicable ce que la loi diffère). Les angles 1 et 4 ne le sauvent pas : le texte existe bien e |
| Article 111, dernier alinéa (Décret) | Trois règles cumulatives : les livraisons de biens à soi-même ET les prestations de servic | CONSTAT RÉFUTÉ sur l'angle 3, et il se réfute lui-même. Des trois règles qu'il découpe, deux (rapport exprimé en pourcentage, arrondi à l'unité supérieure) sont servies, affichées à l'écran  |
| Article 113, alinéa 1er (Décret) | Les déductions en cours d'année s'opèrent sur base d'un prorata provisoire CORRESPONDANT A | CONSTAT RÉFUTÉ sur quatre fondements, dont trois suffisent seuls. (1) ANGLE 3 · NON NEUF : la correction que le constat réclame · « arrêter, stocker et dater le prorata définitif de N-1 » ·  |
| Article 113, alinéa 2 (Décret) | Le prorata définitif est arrêté au plus tard le 31 MARS de l'année suivante, ET les déduct | REFUTE sur l'angle 3 d'abord (manque deja nomme au journal), sur la veracite de la preuve ensuite (affirmation de fait fausse), et sous reserve dirimante de l'angle 2 (le Decret excede sa lo |
| Article 113, alinéa 3 (Décret) | Pièce justificative exigée pour l'acceptation du prorata prévisionnel · pour les entrepris | DOUBLON D'UN CONSTAT DÉJÀ JUGÉ ET ÉCARTÉ, RE-DÉPOSÉ SOUS UN AUTRE NUMÉRO D'ARTICLE. (1) L'art. 113, al. 3 du Décret est, caractère pour caractère, l'art. 45, al. 3 de l'Ordonnance-Loi n° 10/ |
| Article 114 (Décret) | Pour l'application des articles 110, 111 et 113, l'année au cours de laquelle a eu lieu l' | CONSTAT RÉFUTÉ, sur trois plans cumulatifs. (1) ANGLE 3 · DÉJÀ NOMMÉ, DEUX FOIS. La seule dérogation que le constat lui-même identifie (le repli du nouvel assujetti dans `prorataApplicable`) |
| Article 115, alinéa 1er (Décret) | Option dérogatoire au prorata : tenue de comptabilités séparées par secteurs distincts d'a | CONSTAT RÉFUTÉ sur les angles 1, 2 et 3 · chacun suffit seul. 1) L'art. 115, al. 1er ne porte AUCUNE obligation : lu à l'instant, il dit « il peut opter », et l'al. 2 ajoute que « Le bénéfic |
| Article 115, alinéa 2 (Décret) | Formalité et double délai : l'option doit être EXPRESSÉMENT demandée à l'Administration de | CONSTAT RÉFUTÉ sur deux plans, dont un fatal. ANGLE 1 · rien contre lui, et je le dis. Le texte est cité fidèlement et les renvois sont justes. `12-tva-decret-application-ch5-8.md` l. 590 po |
| Article 115, alinéa 3 (Décret) | « L'option est irrévocable. » L'assujetti ne peut pas revenir au prorata de sa propre init | Constat REFUTE sur les angles 3 et 4, et une affirmation de son explication est textuellement fausse. (A) Le manque n'est pas neuf : il est DECLARE hors scope à trois endroits du dépôt (comm |
| Article 115, alinéa 4 (Décret) | Condition résolutoire : en cas de NON TENUE EFFECTIVE de comptabilité séparée par secteurs | CONSTAT DÉJÀ JUGÉ, ET DÉJÀ ÉCARTÉ. Angle 1 ne donne rien contre lui (citation, numéro d'article, numéro d'alinéa et renvoi de lignes sont tous exacts), mais l'angle 3 le tue : la règle qu'il |
| Article 117 | Reverser une fraction de la TVA antérieurement déduite lorsqu'une immobilisation déduite e | CONSTAT RÉFUTÉ sur les angles 2 et 3, et sa seule nouveauté revendiquée est surestimée de moitié. (1) DÉJÀ NOMMÉ, et le constat le concède lui-même : docs/releve-de-manques-fiscal.md l. 637  |
| Article 116 (al. 3) | Les régularisations s'opèrent sur la déclaration du mois au titre duquel elles ont été eff | CONSTAT RÉFUTÉ sur trois fondements indépendants, dont deux suffisent seuls. Je concède d'abord l'angle 1 sur la citation et sur les renvois : l'article est cité VERBATIM, sous le bon numéro |
| Article 116 (al. 2) | Toute régularisation prend l'une de deux formes exclusives : reversement de la taxe antéri | REFUTÉ sur quatre plans cumulatifs, dont deux sont des faits du dépôt démontrablement faux. (1) LE TEXTE NE DIT PAS « TOUTE RÉGULARISATION ». L'al. 2 est lu verbatim (fichier 12-tva-decret-a |
| Article 119 | Définitions opérantes des trois événements de l'article 118 : modification de la situation | Réfuté sur l'angle 3 (le manque est déjà nommé DEUX FOIS dans le dépôt, dont une fois par le hors-scope déclaré que le constat prétend avoir consulté), avec renfort de l'angle 1 (l'art. 119  |
| Article 118 | Reverser une fraction de la taxe déduite lorsque, dans les délais de l'article 117, survie | Manque déjà déclaré DEUX FOIS dans le dépôt, avec la même gravité, et dont la seule « nouveauté » offerte (le point de branchement `ReclassementImmobilisation`) est erronée en droit parce qu |
| Article 120 | Fraction à reverser = taxe déduite, diminuée d'un cinquième ou d'un vingtième par année ou | Manque déjà nommé, et preuve avancée fausse. Le reversement fractionné par cinquièmes/vingtièmes est déjà déclaré hors scope EN TOUTES LETTRES dans src/modules/tva/taux-tva.service.ts (l. 58 |
| Article 121 (al. 1er) | L'acquéreur d'une immobilisation cédée peut déduire la taxe correspondant au montant rever | Manque déjà nommé DEUX FOIS dans le dépôt, et la seule nouveauté revendiquée (la « divergence » loi/décret) n'en est pas une. (a) Le hors-scope déclaré de `src/modules/tva/taux-tva.service.t |
| Article 125 | En cas de vente à perte, taxe à reverser = TVA initialement déduite moins TVA collectée su | CONSTAT RÉFUTÉ sur l'angle 3 d'abord (le manque est déjà nommé trois fois, et la preuve avancée est matériellement fausse), puis sur l'angle 1/2 (la « formule » revendiquée comme apport du d |
| Article 132 (al. 2) | La comptabilité doit être disponible en République Démocratique du Congo, au siège social  | CONSTAT RÉFUTÉ sur l'angle 3 (doublon intégral d'un manque déjà nommé) et sur l'angle 4/1 (la seule chose qu'il présente comme neuve est une proposition que l'article ne porte pas). Sa citat |
| Article 133 | Déclaration mensuelle en régime intérieur, sur modèle de l'Administration, en double exemp | Angle 3 (déjà nommé) + une affirmation de fait FAUSSE. L'art. 133 du Décret est la reprise quasi mot pour mot de l'art. 60 de l'O.-L. n° 10/001 : il n'y ajoute que « En régime intérieur » et |
| Article 134 (al. sur la mise en demeure) | La mise en demeure est envoyée au redevable sous pli recommandé avec accusé de réception,  | CONSTAT RÉFUTÉ sur les angles 4, 1 et 3, chacun suffisant à lui seul. (1) ANGLE 4, DIRIMANT · l'alinéa de l'art. 134 ne met AUCUNE obligation à la charge du redevable : son sujet grammatical |
| Article 130 (al. 1er) | Toute personne assujettie est identifiée par un numéro TVA, dont les modalités d'attributi | Constat écarté sur les angles 1, 3 et 4, et sur un doublon que le constat reconnaît lui-même. (a) DOUBLON EXACT DÉJÀ AU JOURNAL : docs/releve-de-manques-fiscal.md l. 645 porte déjà, mot pour |
| Article 131 | Redevable dont le chiffre d'affaires cumulé atteint le seuil en cours d'année : souscrire  | Angle 3 dirimant : l'obligation de l'art. 131 du décret est, mot pour mot, celle de l'art. 55 de l'Ordonnance-Loi, DÉJÀ portée au journal docs/releve-de-manques-fiscal.md l. 647 avec la MÊME |
| Article 122 | Reversement INTÉGRAL de la taxe déduite sur les biens non immobilisés et les services init | Constat non recevable comme constat : il redouble un manque déjà porté au journal, et il se fonde sur un article du décret qui n'ajoute AUCUNE obligation à la loi · il la RESTREINT. Le const |
| Article 124 (al. 1er) | Reverser la TVA antérieurement déduite en cas de disparition des biens ou produits destiné | ANGLE 3, fatal, et le constat le concède lui-même : le manque est déjà nommé deux fois dans le dépôt · au hors-scope de `taux-tva.service.ts` (l. 589-595, qui écrit « de disparition » l. 591 |
| Article 127 (al. 3) | La preuve de la créance irrécouvrable incombe à l'assujetti. | La gradation « PAS DU TOUT » est fausse. Le constat n'a interrogé que les modèles `Tiers` et `Ecriture` et en a conclu que « la créance reste au 411 » : le dépôt porte en réalité tout le che |
| Article 132 (al. 3) | Les pièces justificatives des opérations ouvrant droit à déduction doivent être des docume | CONSTAT NON NEUF (angle 3) : l'obligation est déjà portée au relevé, mot pour mot, et le constat le concède lui-même sans en tirer la conséquence. docs/releve-de-manques-fiscal.md l. 651, so |
| Article 132 (al. 4) | Les documents comptables doivent être conservés conformément à la législation fiscale. | REFUTÉ sur la prémisse qui porte tout le constat : le renvoi de l'art. 132 al. 4 EST résolu par le corpus, et il se résout exactement là où le dépôt se tient déjà. 1) ANGLE 1 · le texte est  |
| Article 129 (al. 1er et 3) | Sur chacune des quatre années suivant l'acquisition ou la première utilisation d'une immob | CONSTAT RÉFUTÉ sur l'angle 3, et il se réfute lui-même. Le fond factuel est exact · rien dans le dépôt ne suit le prorata année par année sur une immobilisation · mais un manque déjà nommé n |
| Article 116 (al. 1er) | Les déductions régulièrement opérées sont définitives ; elles ne peuvent être régularisées | Constat réfuté sur l'angle 3 (décisif, trois fois) et sur l'angle 1. Sa citation n'est pas verbatim et retourne la modalité du texte ; son affirmation porteuse · « Aucune notion de déduction |
| Article 136 | Formule operante de la liquidation : sur la taxe collectee augmentee le cas echeant des re | ANGLE 3 · LE MANQUE EST DÉJÀ NOMMÉ, DEUX FOIS, ET LE CONSTAT NE LE DIT PAS. Le fond du constat (« OmegaX chiffre la régularisation du prorata définitif, l'affiche, et ne la fait entrer dans  |
| Article 138 | En regime interieur, la TVA nette a reverser est acquittee directement et spontanement par | Doublon sans contenu normatif propre, deja porte au journal · et le constat s'auto-disqualifie. L'art. 138 du decret recopie l'art. 60, alinea 2, de l'O.-L. n° 10/001, deja inscrit au releve |
| Article 139, alinea 1 | A l'importation, la TVA est liquidee et recouvree par l'Administration douaniere sur la de | CONSTAT REFUTE sur l'angle 3 (deja juge), de facon dirimante, avec l'appui de l'angle 1 (la « nouveaute » revendiquee repose sur une assimilation de pieces que le texte ne fait pas, et sur l |
| Article 139, alinea 2 (ajoute conformement a la L. | Regime derogatoire minier : la TVA due a l'importation de marchandises pour les besoins de | REFUTE sur l'angle 3, que le constat concede lui-meme, et sur DEUX affirmations demontrablement fausses qui portent son explication. 1) ANGLE 3, DIRIMANT ET AVOUE. Le constat ecrit noir sur  |
| Mesures complementaires · Circ. M. n° 001 du 10 ja | Les ventes operees par les boutiques hors taxes ne sont soumises ni aux droits de douane n | REFUTE sur les quatre angles, et le premier motif est dirimant : la disposition invoquee ne PEUT PAS porter l'exoneration de TVA que le constat lui prete, la loi habilitante l'interdisant no |
| Mesures complementaires · Circ. M. n° 001 du 10 ja | Les boutiques hors taxes ne recoivent des marchandises qu'en importation directe ou en tra | Le constat range sous « point 4.4 du DÉCRET » une règle qui n'est pas dans le décret et qui ne porte pas l'obligation qu'on lui prête. (1) Le point 4.4 appartient à la Circulaire Ministériel |
| Mesures complementaires · Circ. M. n° 001 du 10 ja | Fiche de stock distincte pour chaque marchandise destinee a la vente, suivant sa nature et | Le constat tombe sur les angles 1, 2 et 4, et sa gravité est fabriquée. (1) ANGLE 1 · L'INSTRUMENT EST MAL NOMMÉ, ET C'EST DIRIMANT. Le constat écrit « point 4.6 du DECRET portant mesures d' |
| Mesures complementaires · Circ. M. n° 001 du 10 ja | Vente a degustation ou a l'essai : consommation possible a l'interieur de la boutique en f | CONSTAT RÉFUTÉ sur les quatre angles, dont trois suffisent seuls. ANGLE 1 · LE TEXTE N'EST PAS OÙ LE CONSTAT LE LOGE, ET SON PREMIER VERBE EST UN « PEUVENT ». Le point 4.7 n'est PAS « du DÉC |
| Mesures complementaires · Circ. M. n° 001 du 10 ja | Affichage des prix des articles a la vente, tenant compte de ce qu'ils sont francs de droi | CONSTAT REFUTE sur les angles 1, 2 et 4. Le fait materiel (rien dans le depot ne sert cette regle) est exact, et l'angle 3 est concede : le releve ne porte aucune entree sur cette circulaire |
| Mesures complementaires · Circ. M. n° 001 du 10 ja | Pour toute operation de vente, exiger de l'acheteur le passeport, le billet de voyage et l | Le constat se trompe d'instrument et de régime de facture. Le point 4.9 n'est pas un point « du DÉCRET portant mesures d'application de l'O.-L. n° 10/001 » : c'est une CIRCULAIRE MINISTÉRIEL |
| Mesures complementaires · Circ. M. n° 001 du 10 ja | Enregistrement dans un registre secondaire de la sortie des marchandises des depots vers l | REFUTE sur l'angle 4 (destinataire), decisif, avec renfort des angles 1, 2 et 3, et deux affirmations du constat demontrablement fausses. 1) ANGLE 1 · MAUVAIS INSTRUMENT, ET LE CONSTAT LE NO |
| Mesures complementaires · Circ. M. n° 001 du 10 ja | Sous reserve de certaines specificites, les marchandises de meme nature sont exposees a la | Le constat tombe sur les angles 1, 2 et 4, et chacun suffit seul. (1) IL SE TROMPE DE TEXTE ET DE NATURE D'ACTE. Le point 4.11 n'est pas un point « du DECRET portant mesures d'application de |
| Mesures complementaires · Circ. M. n° 001 du 10 ja | Produire, sur exigence de la douane, tout document commercial ou administratif susceptible | CONSTAT REFUTE sur trois angles indépendants, dont le premier est dirimant. (1) LA CITATION EST TRONQUEE, ET LA TRONCATURE CHANGE TOUT LE PERIMETRE. Le constat énonce l'obligation ainsi : «  |
| Mesures complementaires · Circ. M. n° 001 du 10 ja | Regime de sanction : la violation des dispositions de la circulaire peut entrainer la susp | CONSTAT RÉFUTÉ sur les angles 1, 2 et 4 · chacun suffisant à lui seul. (1) Le point 4.13 n'est PAS « du DÉCRET portant mesures d'application » : le fichier le présente, l. 910-912, comme « M |
| Article 141 (adapte conformement a l'O.-L. n° 13/0 | Liste limitative des beneficiaires du droit au remboursement du credit de TVA (exportateur | Constat refute sur les angles 1 et 3. Le confronteur concede lui-meme qu'il ne s'agit pas d'un constat neuf (releve l. 664, art. 64 al. 1 de la loi) ; sa seule valeur ajoutee annoncee tient  |
| Article 143 (adapte conformement a la L.F. n° 15/0 | Deux cas de perte de la qualite d'assujetti : le redevable n'effectue plus de maniere habi | REFUTE sur trois angles, dont deux dirimants. 1) ANGLE 1 · LA MOITIE DE L'APPORT REVENDIQUE N'EST PAS DANS L'ARTICLE. Le constat fonde sa gravite sur « deux modalites » ajoutees par l'art. 1 |
| Article 144 | Le credit doit faire l'objet d'une demande adressee par l'assujetti au Directeur ou au Che | CONSTAT RÉFUTÉ sur l'angle 3 (déjà nommé, deux fois, dont une gelée par un spec), sur l'angle 1 (art. 144 n'est pas une obligation mais la CONDITION d'une faculté, d'où l'effondrement de la  |
| Article 145, en cas de perte de la qualite d'assuj | Joindre la copie de la declaration modificative prescrite a l'article 2 de la Loi n° 004/2 | CONSTAT REFUTE sur trois angles cumulatifs, dont deux dirimants. Les angles 2 et 4 ne donnent rien contre lui, et je le dis franchement. 1) LA PREUVE CENTRALE EST MATERIELLEMENT FAUSSE, ET C |
| Article 145, alinea final | La demande presentee sans les documents requis ou avec des documents ne respectant pas l'o | CONSTAT RÉFUTÉ sur les angles 4, 3 et 1, dont deux suffisent seuls. Je concède d'emblée le fait brut : OmegaX ne sert rien de la procédure de remboursement de crédit de TVA. Mais ce fait n'e |
| Article 146 (adapte conformement a l'O.-L n° 13/00 | Lorsqu'un assujetti effectue concurremment des operations d'exportation et d'autres operat | L'article 146 ne porte aucune norme autonome : ses deux seuls composants sont (a) la definition meme du credit, deja posee par l'art. 140 al. 1 du MEME decret et par l'art. 63 al. 1 de la lo |
| Article 147 | Apres instruction par le Service gestionnaire de l'Administration des Impots, la decision  | CONSTAT RÉFUTÉ, principalement sur l'ANGLE 4 (destinataire), avec l'appui de l'ANGLE 1 (citation tronquée sur le mot qui décide) et de l'ANGLE 3 (manque déjà nommé dans le dépôt). Je dis fra |
| Décret, art. 148 (recours administratif, deux mois | « La décision de rejet total ou partiel de la demande de remboursement de crédit peut fair | CONSTAT RÉFUTÉ sur les angles 1, 2 et 4, avec une preuve d'angle 3 démontrablement fausse. L'art. 148 du Décret n° 011/42 n'impose RIEN au redevable : il écrit « peut faire l'objet », c'est  |
| Décret, art. 148 (silence de l'Administration) | « L'Administration est tenue de répondre dans un délai de deux mois. L'absence de décision | RÉFUTÉ sur l'angle 4 (dirimant), sur l'angle 1 (la citation est verbatim mais AMPUTÉE de sa phrase-mère, qui dit « peut » et change le sujet de l'obligation) et sur l'angle 3 (le manque que  |
| Décret, art. 148 (épuisement préalable) | « Le recours auprès de la juridiction compétente ne peut intervenir qu'après l'épuisement  | Le constat cite fidèlement l'alinéa 2, mais lui fait porter une règle générale de contentieux fiscal qu'il ne contient pas : l'art. 148 est dans le CHAPITRE VIII « DU REMBOURSEMENT DE CREDIT |
| Décret, art. 149 | « Les remboursements des crédits de taxe sur la valeur ajoutée sont effectués par virement | RÉFUTÉ sur l'angle 4, de façon dirimante, et sur l'angle 1 (mauvais rattachement d'article) ; sa preuve avancée est de surcroît littéralement fausse. (1) DESTINATAIRE. L'art. 149 du Décret n |
| A.M. n° 018 du 18 mars 2016 (compétence d'instruct | « Les demandes de remboursement des crédits de taxe sur la valeur ajoutée introduites par  | Angle 4, dirimant : la phrase citée n'est pas une obligation du redevable, c'est une règle de répartition de compétence INTERNE à la DGI, rédigée au passif avec l'Administration pour agent ( |
| A.M. n° 018 (classification en trois catégories de | « Selon le degré de risques qu'elles présentent, les entreprises sont classées en trois ca | CONSTAT RÉFUTÉ, principalement sur l'ANGLE 4 (destinataire), qui est dirimant, et sur l'ANGLE 3 (l'affirmation opérante sur le dépôt est matériellement fausse). L'angle 1 donne une erreur de |
| A.M. n° 018 (catégorie A · contrôle formel, trente | « Les demandes de remboursement des crédits de taxe sur la valeur ajoutée introduites par  | CONSTAT RÉFUTÉ sur l'angle 4 (destinataire, dirimant) et sur l'angle 3 (manque déjà déclaré ET verrouillé par un spec, dirimant lui aussi). L'angle 2 est concédé franchement. L'angle 1 laiss |
| A.M. n° 018 (catégorie B · contrôle sur pièces, so | « Pour les entreprises à risque moyen, les demandes de remboursement des crédits de taxe s | CONSTAT RÉFUTÉ sur l'angle 4 (destinataire), de façon dirimante, avec l'appui de l'angle 1 (le constat fait dire au passage cité une obligation qu'un AUTRE article porte) et de l'angle 3 (le |
| A.M. n° 018 (contrôle a posteriori semestriel) | « La Direction Générale des Impôts procède, a posteriori et chaque semestre, au contrôle s | RÉFUTÉ sur l'angle 4 (destinataire), de façon décisive, et confirmé sur l'angle 3 (manque déjà nommé) ; l'angle 1 corrige en outre la qualification du texte et deux restrictions omises. L'an |
| A.M. n° 018 (catégorie C · contrôle sur place syst | « Les demandes de remboursement des crédits de taxe sur la valeur ajoutée introduites par  | RÉFUTÉ sur l'angle 4, décisif, avec deux appuis (ancrage faux, gravité mal posée). L'angle 3 échoue et je le dis : rien dans le dépôt ne sert cette règle, le fait matériel du constat est exa |
| A.M. n° 018 (autorité de décision et notification) | « La décision de remboursement […] ou de rejet de la demande […] est prise par le Ministre | CONSTAT RÉFUTÉ sur l'angle 4 (dirimant) et sur l'angle 1 (mauvais rattachement du contenu opérant, plus gravité mal placée). L'angle 2 ne donne rien et je le concède ; l'angle 3 ne donne qu' |
| A.M. n° 018 (compte en Franc congolais, sous-compt | « Le remboursement des crédits de taxe sur la valeur ajoutée s'effectue par voie bancaire  | CONSTAT RÉFUTÉ, principalement sur l'angle 4 (destinataire), qui est dirimant, avec l'appui de l'angle 3 et une réserve d'ancrage sur l'angle 1. L'angle 2 ne donne rien et je le concède fran |
| A.M. n° 018 (pièces du dossier de certification) | Lettre de demande de certification adressée au DGI avec copie au DGDA ; copie des statuts  | RÉFUTÉ sur l'angle 3 (manque déjà nommé) et sur la fausseté intégrale de la preuve avancée. L'obligation existe et est correctement rattachée · je ne la conteste pas ·, mais le constat tel q |
| Décret, art. 151 al. 1 (Chapitre IX : des procédur | « les dispositions fiscales en vigueur en matière d'assiette, de contrôle, de recouvrement | CONSTAT RÉFUTÉ sur l'angle 3 (déjà nommé, de façon décisive), l'angle 1 (la citation est amputée de sa tête, et c'est précisément l'amputation qui fabrique la « nouveauté » annoncée) et l'an |
| Décret, art. 151 al. 2 (TVA à l'importation) | « Toutefois, la liquidation, le recouvrement et le contentieux de la taxe sur la valeur aj | CONSTAT RÉFUTÉ sur l'angle 4 (destinataire), de façon décisive, avec l'appui de l'angle 2 (le décret excède son article habilitant sur le SEUL point qui faisait la nouveauté du constat) et d |
| Décret, art. 152 (Chapitre X : des infractions et  | « Les règles concernant les pénalités d'assiette, de recouvrement, les amendes administrat | CONSTAT RÉFUTÉ sur les angles 1, 2, 3 et 4 · et le constat se réfute lui-même dans son « explication ». 1) L'ARTICLE N'EST PAS UNE OBLIGATION, ET LE CONSTAT L'ADMET. Lu à l'instant (`.../fis |
| Décret, art. 153, chapeau | « Sont sanctionnées conformément aux articles 69 à 74 quinquies de l'Ordonnance-Loi n° 10/ | CONSTAT RÉFUTÉ : sa preuve centrale est démontrablement fausse, et l'obligation qu'il invoque est déjà nommée, tiret par tiret, dans le dépôt. 1) LE TEXTE EST BIEN CITÉ, ET IL EST BIEN À CE  |
| Décret, art. 153, tiret 1 | « l'absence de déclaration d'assujettissement dans le délai » | Trois raisons cumulatives. (1) L'art. 153 ne porte aucune obligation : son chapeau est un pur renvoi de sanction vers la loi, et le tiret 1 nomme un manquement déjà sanctionné, pas un devoir |
| Décret, art. 153, tiret 2 | « [le défaut de souscription, dans le délai, d'une déclaration de la taxe sur la valeur aj | Le constat tombe sur trois angles, dont deux dirimants. (1) ANGLE 1 · l'« obligation » citée n'en est pas une : l'art. 153 du décret est un article de RENVOI dont le chapeau, tronqué par le  |
| Décret, art. 153, tiret 3 | « la mention abusive de la taxe sur la valeur ajoutée sur une facture ou un document en te | RÉFUTÉ sur trois angles indépendants, dont chacun suffit à faire tomber la gravité INCOMPLET. (1) ANGLE 1 · L'ARTICLE 153 NE PORTE AUCUNE OBLIGATION, ET SON TIRET 3 N'EN EST PAS UNE. La cita |
| Décret, art. 153, tiret 4 | « l'émission d'une fausse facture comprenant la taxe sur la valeur ajoutée » | REFUTE sur les angles 2, 3 et 4. L'angle 1 ne donne rien, et je le concede d'emblee. 1) ANGLE 1 · RIEN A REPROCHER, ET JE LE VERIFIE. Fichier `/root/.claude/skills/synced/80921ba8-2ca0-4a8a- |
| Décret, art. 153, tiret 5 | « la falsification d'une facture présentée en justification d'une déduction » | CONSTAT REFUTE sur trois angles convergents, dont deux suffisent seuls. L'angle 1 (fidelite) ne donne rien contre lui et je ne l'attaque pas la : verification faite a l'instant dans /root/.c |
| Décret, art. 153, tiret 6 | « l'absence de facture ou de document en tenant lieu » | RÉFUTÉ sur les angles 1 et 3, et le constat se réfute d'ailleurs lui-même. 1) L'ARTICLE NE PORTE AUCUNE OBLIGATION : l'art. 153 est un chapeau de RENVOI, pas une norme de comportement. Lu à  |
| Décret, art. 153, tiret 7 | « l'utilisation d'une fausse facture pour le remboursement de crédit de taxe sur la valeur | CONSTAT RÉFUTÉ, sur quatre plans dont chacun suffit à faire tomber la gravité INCOMPLET. 1) L'ARTICLE NE PORTE AUCUNE OBLIGATION · IL PORTE UNE SANCTION. Lu à l'instant (`.../fiscalite-rdc/c |
| Décret, art. 153, tiret 8 | « toute déduction effectuée et ne correspondant pas, en partie ou en totalité, à une acqui | Le tiret 8 de l'art. 153 du Décret n° 011/42 n'est pas une obligation posée par le décret : c'est un renvoi de sanction qui recopie mot pour mot l'art. 74, alinéa 1 de l'O.-L. n° 10/001, leq |
| Décret, art. 153, tiret 9 | « [le manquement à l'obligation de régler, par voie bancaire, toute transaction assujettie | CONSTAT RÉFUTÉ sur les angles 1, 2 et 3. La « divergence de périmètre » qui fonde à elle seule la nouveauté du constat n'existe pas en droit : elle est tranchée par le texte même auquel l'ar |
| Décret, art. 153, tiret 10 | « [le défaut de retenue à la source de la taxe sur la valeur ajoutée par les entreprises m | RÉFUTÉ sur l'angle 3 (manque déjà nommé) et sur l'angle 1 (la disposition citée ne porte aucune obligation neuve pour le logiciel), chacun suffisant. ANGLE 1 · LA DISPOSITION N'AJOUTE RIEN.  |
| Décret, art. 153, tiret 11 | « [le défaut d'utilisation, par l'assujetti à la taxe sur la valeur ajoutée, du dispositif | RÉFUTÉ sur quatre plans, dont les trois premiers suffisent chacun. (1) LA DISPOSITION CITÉE NE PORTE AUCUNE OBLIGATION. L'art. 153 du décret est un pur renvoi de sanction, pas une norme de c |
| Décret, art. 155 (définition de la fausse facture) | « Par fausse facture, il faut entendre la facture qui ne correspond pas, en partie ou en t | CONSTAT RÉFUTÉ sur son affirmation centrale, et sur deux motifs indépendants dont chacun suffit. (1) ANGLE 2 · LA « SECONDE BRANCHE » N'EST PAS AJOUTÉE PAR LE DÉCRET. Le constat fait reposer |
| Décret, art. 156 | « La restitution des sommes indues invoquée à l'article 73 de l'Ordonnance-Loi n° 10/001 [ | CONSTAT RÉFUTÉ sur l'angle 3, de façon décisive, et affaibli sur l'angle 1. L'angle 2 ne donne rien et je le dis : l'art. 156 ne dépasse pas sa loi habilitante, il fixe le dies a quo que l'a |
| Décret, art. 164 (Chapitre XII : dispositions fina | « Le présent Décret entre en vigueur à la même date que l'Ordonnance-Loi n° 10/001 du 20 a | CONSTAT RÉFUTÉ sur les angles 1/4 et 3, et sa « réserve décisive » est factuellement FAUSSE. Le fait matériel qu'il décrit (la branche antérieure de `texteApplicable` n'a pas de borne basse) |
| A.M. n° 008, art. 2 (chiffre d'affaires de référen | « le chiffre d'affaires visé à l'alinéa 1er ci-dessus s'entend du chiffre d'affaires hors  | CONSTAT RÉFUTÉ sur trois motifs cumulatifs, dont deux décisifs. 1) ANGLE 2 · SA RÉSERVE EST FAUSSE, ET UNE FOIS LEVÉE ELLE RETOURNE LE CONSTAT. Le confronteur écrit que « les articles 42 et  |
| A.M. n° 008, art. 4 (conditions de capacité) | Le contribuable « doit donner la preuve de sa capacité de : - tenir une comptabilité régul | L'article existe et son corps est cité fidèlement, mais le constat échoue sur les angles 2, 3 et 4, et quatre de ses renvois sont inexacts. 1) Il n'est PAS NEUF : le régime de l'option est d |
| A.M. n° 008, art. 5 (quinze jours, silence-accepta | « Le Directeur Urbain ou Provincial des Impôts compétent est tenu de répondre au contribua | RÉFUTÉ sur l'angle 4 (dirimant) et sur l'angle 3 (dirimant lui aussi), avec une réserve de rattachement sur l'angle 1. (1) ANGLE 4 · L'article 5 ne porte AUCUNE obligation du redevable. Ses  |
| A.M. n° 008, art. 6 (date d'effet, durée, révocati | « L'option […] prend effet à compter du 1er jour du mois qui suit celui de l'acceptation.  | CONSTAT RÉFUTÉ. Sa preuve repose sur une négative universelle DÉMONTRABLEMENT FAUSSE : « Tenant.assujettiTva est un booléen sans date ». Le dépôt porte, à la ligne suivante du même modèle, u |
| A.M. n° 015, art. 2 | « Sous réserve des exonérations prévues par l'Ordonnance-Loi n° 10/001 […], l'importation  | REFUTE sur les quatre angles, dont trois suffisent seuls. (1) LE TEXTE EST BIEN CITE · je le concede d'emblee · MAIS IL EST MAL RATTACHE ET NE PORTE AUCUNE OBLIGATION. L'article 2 vise n'app |
| A.M. n° 015, art. 3 al. 1 | « La taxe sur la valeur ajoutée à l'importation due par les entreprises minières […] est c | Constat réfuté sur trois angles, dont deux dirimants. 1) DESTINATAIRE : l'art. 3 al. 1 de l'A.M. n° 015 ne pose aucune obligation du redevable · il décrit un acte du RECEVEUR DES DOUANES. Le |
| A.M. n° 015, art. 3 al. 2 (mainlevée sans paiement | « La mainlevée des marchandises est accordée par le Receveur des Douanes sans paiement de  | Le constat vise un alinéa dont le SEUL acteur est le Receveur des Douanes, et dont le même article confie expressément la comptabilisation au Directeur Général des Douanes et Accises : ce n' |
| A.M. n° 015, art. 4 al. 1 | « La taxe sur la valeur ajoutée à l'importation des marchandises due par les entreprises m | CONSTAT RÉFUTÉ sur l'angle 3 (manque déjà nommé), de façon décisive, et affaibli sur l'angle 1 (l'alinéa visé ne porte pas le grief mesuré, et le texte est mal qualifié). Les angles 2 et 4 n |
| A.M. n° 015, art. 4 al. 2 (échéance et pièces join | « La déclaration mensuelle de la taxe sur la valeur ajoutée est souscrite par l'entreprise | REFUTE sur l'angle 3 (manque déjà nommé) et sur l'angle 1 (source mal identifiée, renvois faux), le fond ne survivant que par un résidu que le constat n'a pas su isoler. 1) LA MOITIÉ CALENDR |
| A.M. n° 015, art. 4 al. 3 (bloc II) | « l'entreprise minière est tenue de mentionner le montant de la taxe sur la valeur ajoutée | CONSTAT RÉFUTÉ, principalement sur l'angle 3 (le manque est DÉJÀ NOMMÉ au journal, donc le constat n'est pas neuf), avec l'appui de deux erreurs de fait dans sa preuve et de trois renvois fa |
| A.M. n° 015, art. 5 (bloc VI et paiement concomita | « Le montant de la taxe sur la valeur ajoutée ayant grevé les marchandises concernées par  | RÉFUTÉ, sur trois fondements indépendants dont deux suffisent seuls · mais je concède d'entrée l'angle 1 : la citation est VERBATIM, l'article est le bon, et le logiciel ne sert effectivemen |
### Ce que cette passe apprend sur la méthode

- **Une correction peut réintroduire ailleurs le défaut qu'elle corrige.**
  Quatrième forme de la doctrine du §10 bis, et la plus insidieuse : ici ce
  n'est ni une lacune déclarée à tort, ni une lacune qu'un test interdit de
  déclarer, ni un déclencheur faux · c'est une branche DÉRIVÉE d'une autre par
  soustraction, sans que le texte de la branche dérivée ait été ouvert.
- **Un test écrit dans la foulée d'une correction gèle ses erreurs.** Le spec
  de F1 portait « l'art. 100 ne réclame NI l'adresse NI les autres impôts ». Il
  couvrait bien le code ; sa prémisse sur le texte n'avait été vérifiée par
  personne. Troisième occurrence, après le hors-scope surestimé et
  l'affirmation sur le plan de comptes.
- **La reprise d'un workflow n'est pas un filet.** Sept heures de travail
  refaites parce que le conteneur avait changé. Les passes suivantes seront
  découpées plus court.
- **Le rendement se stabilise autour de 78 à 85 % de réfutation** dès lors que
  les confronteurs reçoivent le journal et le hors-scope. Ce qui survit est
  presque entièrement du neuf.
