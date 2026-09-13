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
