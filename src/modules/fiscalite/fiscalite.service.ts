import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  FormeJuridiqueSyscohada,
  NatureActiviteFiscale,
  Referentiel,
  SensRetraitementFiscal,
  StatutEcriture,
  TypeCompteDetailTotal,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { CATALOGUE_RETRAITEMENTS, CODE_LIBRE, RETRAITEMENT_PAR_CODE } from './catalogue-retraitements';
import {
  DERNIERE_VERIFICATION_FISCALE,
  EXERCICES_OBSERVES_REGIME,
  IMPOT_REVENU_PERSONNES_PHYSIQUES,
  IMPOT_SOCIETES,
  QUOTITES_PETITE_ENTREPRISE,
} from './parametres-fiscaux';
import { CreerRetraitementDto, ModifierDossierFiscalDto, ModifierRetraitementDto } from './dto/fiscalite.dto';
import { qualifierExemptionIs } from './exemption-is-ebnl';
// Le chiffre d'affaires n'est plus écrit ici : il se DÉRIVE du poste XB du
// modèle du ch. 4 (voir correspondance-compte-resultat-syscohada.ts). Une
// liste officielle recopiée dans deux modules est une divergence en attente.
import { PREFIXES_CHIFFRE_AFFAIRES_SYSCOHADA as PREFIXES_CHIFFRE_AFFAIRES } from '../etats-financiers-syscohada/correspondance-compte-resultat-syscohada';

/**
 * DÉTERMINATION DU RÉSULTAT FISCAL ET DE L'IMPÔT SUR LES BÉNÉFICES ·
 * dossiers SYSCOHADA uniquement.
 *
 * Loi n° 23/053 du 30 novembre 2023, art. 9 : « le bénéfice imposable est
 * […] l'excédent des produits sur les charges en application de la
 * législation comptable, sous réserve des dispositions fiscales
 * contraires ». Le premier terme vient de la balance, le second des
 * retraitements saisis depuis le catalogue (catalogue-retraitements.ts).
 *
 * Ce que ce service NE FAIT PAS, et pourquoi · il ne qualifie aucune charge
 * de non déductible à partir de son compte. Le 6582 « Dons » reçoit des
 * versements déductibles dans la limite de l'article 44 et des libéralités
 * qui ne le sont pas ; un tri automatique se
 * tromperait en silence sur tous les dossiers. Il ne produit pas non plus le
 * formulaire de déclaration de la DGI, dont le modèle n'est pas en main.
 *
 * CE QUE CE SERVICE NE DIT PLUS · il refusait tout dossier SYCEBNL avec la
 * phrase « Une entité à but non lucratif est exemptée d'impôt sur les
 * sociétés (loi n° 23/053, art. 5) », qui affirmait un droit à partir du seul
 * RÉFÉRENTIEL COMPTABLE. L'art. 5 porte trois exemptions distinctes (points
 * 3, 4 et 5) et le point 5, celui des établissements d'utilité publique et
 * des ONG, renvoie « aux conditions définies par voie réglementaire » que
 * l'arrêté n° 007/2025 a fixées. Le refus du module demeure, sa raison ne
 * change pas (ce module lit une balance SYSCOHADA), mais la qualification est
 * désormais posée par exemption-is-ebnl.ts à partir de la FORME JURIDIQUE et
 * de l'attestation du dossier, et non plus supposée.
 *
 * Le contrôleur refuse les dossiers SYCEBNL, et le service le revérifie, la
 * double barrière étant la règle du dépôt.
 */


const arrondir = (n: number) => Math.round(n * 100) / 100;

/**
 * ARRONDI LÉGAL DE L'IMPÔT · art. 150 de la loi n° 23/053, TITRE VI,
 * chapitre 1 « DES DISPOSITIONS RELATIVES AUX ARRONDIS » :
 *
 *   « Lorsque le montant de l'Impôt sur les Sociétés, de l'Impôt minimum, de
 *   l'Impôt sur le Revenu des Personnes Physiques et de tous autres
 *   prélèvements prévus dans la présente Loi comprend une décimale, cette
 *   fraction est arrondie à l'unité supérieure si la première décimale est
 *   supérieure ou égale à 5. Dans le cas contraire, elle est ramenée à
 *   l'unité inférieure.
 *   Lorsque le montant arrondi comprend une tranche supérieure ou égale à 50
 *   Francs congolais, celle-ci est ramenée à la centaine de Francs congolais
 *   supérieure.
 *   Lorsque cette tranche est inférieure à 50 Francs congolais, elle est
 *   ramenée à la centaine de Francs congolais inférieure. »
 *
 * CE N'EST PAS `arrondir`, ET C'EST TOUT L'ÉCART. `arrondir` est l'arrondi
 * COMPTABLE au centime, celui d'un solde ou d'un retraitement ; l'art. 150
 * est l'arrondi FISCAL, en deux temps, et il finit à la centaine de francs.
 * Le module liquidait au centime : sur un chiffre d'affaires de
 * 123 456 789 FC, l'impôt minimum de 1 % vaut 1 234 567,89 FC au centime et
 * 1 234 600 FC selon la loi. L'écart est borné à moins de cent francs, mais
 * le montant affiché n'était pas celui qui se déclare, et il servait ensuite
 * d'assiette aux acomptes de l'exercice suivant.
 *
 * PORTÉE VOLONTAIREMENT ÉTROITE · l'article vise « l'Impôt sur les Sociétés,
 * l'Impôt minimum, l'Impôt sur le Revenu des Personnes Physiques et tous
 * autres prélèvements prévus dans la présente Loi ». Les acomptes
 * provisionnels et les quotités ne sont pas prévus par cette loi-ci mais par
 * la loi de procédures fiscales (art. 57 bis et 57 quater) : ils restent au
 * centime, et leur base est l'impôt DÉJÀ arrondi.
 */
export function arrondirImpotArt150(montant: number): number {
  if (!Number.isFinite(montant)) return montant;
  const entier = Math.floor(montant);
  // La « première décimale », littéralement · l'epsilon protège du cas où la
  // représentation binaire rend 0,5 sous la forme 0,4999999999999999.
  const premiereDecimale = Math.floor((montant - entier) * 10 + 1e-9);
  const unite = premiereDecimale >= 5 ? entier + 1 : entier;
  // « La tranche » est ce qui reste sous la centaine · le modulo est ramené
  // dans [0, 100[ pour qu'un montant négatif ne remonte pas la centaine du
  // mauvais côté. Un impôt n'est jamais négatif ici, mais la fonction est
  // exportée et sera appelée ailleurs.
  const tranche = ((unite % 100) + 100) % 100;
  return tranche >= 50 ? unite - tranche + 100 : unite - tranche;
}

type RegimeImposition =
  | 'IMPOT_SOCIETES'
  | 'IRPP_MICRO_ENTREPRISE'
  | 'IRPP_PETITE_ENTREPRISE'
  | 'IRPP_REGIME_REEL';

/**
 * Ce que la condition de l'art. 44 a besoin de lire · le résultat fiscal
 * BRUT et les retraitements déjà saisis, rien de plus.
 */
type LectureFiscaleBrute = {
  resultatFiscalBrut: number;
  retraitements: { code: string; sens: SensRetraitementFiscal; montant: unknown }[];
};

/** Les trois régimes d'une personne physique, du plus bas au plus haut. */
type RegimePhysique = 'IRPP_MICRO_ENTREPRISE' | 'IRPP_PETITE_ENTREPRISE' | 'IRPP_REGIME_REEL';

/**
 * L'ÉCHELLE DES RÉGIMES, dans l'ordre où la loi les gravit et les redescend ·
 * art. 106 à 112 de la loi n° 23/053. Son ordre est ce qui donne un sens au
 * « régime d'imposition immédiatement inférieur » de l'art. 113 : on ne
 * descend que d'un cran à la fois.
 */
const ECHELLE_REGIMES_PHYSIQUES: RegimePhysique[] = [
  'IRPP_MICRO_ENTREPRISE',
  'IRPP_PETITE_ENTREPRISE',
  'IRPP_REGIME_REEL',
];

@Injectable()
export class FiscaliteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritureService: EcritureService,
  ) {}

  /** Le catalogue seul · pour l'écran de saisie, avant même tout calcul. */
  catalogue() {
    return { retraitements: CATALOGUE_RETRAITEMENTS, derniereVerification: DERNIERE_VERIFICATION_FISCALE };
  }

  /**
   * LE REFUS DU MODULE, ET LA PHRASE QUI L'ACCOMPAGNE.
   *
   * Le refus reste entier : ce service lit une balance SYSCOHADA (préfixes de
   * chiffre d'affaires 701 à 707 du modèle du ch. 4, catalogue de
   * retraitements de la loi n° 23/053) et un dossier SYCEBNL n'en a pas.
   *
   * Ce qui change est la phrase servie avec lui. Elle affirmait l'exemption
   * de l'art. 5 pour TOUT dossier SYCEBNL. Or l'exemption d'un établissement
   * d'utilité publique ou d'une ONG relève du point 5, « dans les conditions
   * définies par voie réglementaire », et l'arrêté n° 007/2025 subordonne son
   * bénéfice à une attestation (art. 2) et à quatre conditions de fond
   * (art. 3), l'impôt étant dû « au titre de l'exercice concerné » en cas de
   * manquement (art. 5). Affirmer l'exemption à un tel dossier, c'est lui
   * dire qu'il est en règle sans en rien savoir.
   */
  private async tenantSyscohada(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Dossier introuvable');
    if (tenant.referentiel !== Referentiel.SYSCOHADA) {
      const qualification = qualifierExemptionIs(tenant);
      throw new BadRequestException(
        `La détermination du résultat fiscal ne concerne que les dossiers tenus en SYSCOHADA. ${qualification.enonce}`,
      );
    }
    return tenant;
  }

  /**
   * LE STATUT D'EXEMPTION D'IS D'UN DOSSIER NON LUCRATIF · la seule route de
   * ce module ouverte au SYCEBNL, et elle ne calcule rien.
   *
   * Elle existe parce que fermer une fenêtre n'avertit personne. Le dossier
   * porte déjà la forme juridique (loi n° 004/2001), l'acte de personnalité
   * juridique et l'attestation d'exemption de l'art. 2 de l'arrêté
   * n° 007/2025 ; jusqu'ici le module fiscal ne les lisait pas. Ils sont lus
   * ici pour poser la qualification et les avertissements dus, sans jamais en
   * tirer un impôt : les quatre conditions de l'art. 3 sont des faits de
   * gestion et de marché, hors de portée d'une comptabilité.
   */
  async exemptionIs(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Dossier introuvable');
    if (tenant.referentiel !== Referentiel.SYCEBNL) {
      throw new BadRequestException(
        "Le statut d'exemption d'impôt sur les sociétés de l'article 5 de la loi n° 23/053 ne concerne que les dossiers tenus en SYCEBNL.",
      );
    }
    return {
      formeJuridique: tenant.formeJuridique ?? null,
      droitEtranger: tenant.droitEtranger ?? false,
      ...qualifierExemptionIs(tenant),
    };
  }

  private async exerciceDuDossier(tenantId: string, exerciceId: string) {
    const exercice = await this.prisma.exercice.findFirst({ where: { id: exerciceId, tenantId } });
    if (!exercice) throw new NotFoundException('Exercice introuvable');
    return exercice;
  }

  /**
   * Résultat comptable et chiffre d'affaires lus dans la balance.
   *
   * Même règle que EtatsFinanciersService.calculerCH : avant clôture le
   * résultat vit dans les classes 6, 7 et 8 ; après, dans le compte 13 qui
   * les a soldées. L'une OU l'autre source, jamais les deux. Comptes Détail
   * seulement · un compte Total n'est qu'un agrégat d'affichage de ses
   * enfants, l'additionner compterait deux fois les mêmes mouvements.
   */
  private async lireBalance(tenantId: string, exerciceId: string) {
    const balance = await this.ecritureService.balance(tenantId, exerciceId);
    // GARDE-FOU CONSERVÉ, ET REDONDANT PAR CONSTRUCTION · la balance ne rend
    // plus que des comptes de détail depuis qu'elle a cessé de sous-totaliser
    // par compte principal. Le filtre reste parce qu'un agrégat compté en plus
    // de ses enfants double des montants EN SILENCE · une assurance d'une ligne
    // contre la catégorie de bug que ce projet ne peut pas se permettre.
    const details = balance.lignes.filter((l) => l.typeCompte !== TypeCompteDetailTotal.TOTAL);
    const gestion = details.filter((l) => /^[678]/.test(l.numero));
    const resultatClasses678 = gestion.reduce((s, l) => s - l.solde, 0);
    // 131 « Résultat net : bénéfice » et 139 « Résultat net : perte », et EUX
    // SEULS. Le raccourci « tout ce qui commence par 13 » vient du SYCEBNL,
    // dont le compte 13 n'a que ces deux subdivisions. Le plan SYSCOHADA en
    // porte neuf de plus, et deux familles y feraient des dégâts opposés :
    //
    //  · 130 / 1301 / 1309 « Résultat en instance d'affectation » tient le
    //    résultat de l'exercice PRÉCÉDENT tant que l'assemblée n'a pas
    //    statué · l'additionner ferait payer l'impôt deux fois sur le même
    //    bénéfice ;
    //  · 132 à 138 sont les soldes intermédiaires de gestion (marge
    //    commerciale, valeur ajoutée, EBE, résultat d'exploitation,
    //    financier, des activités ordinaires, hors activités ordinaires) ·
    //    ce sont des étapes du MÊME résultat, et les cumuler le compterait
    //    autant de fois qu'il y a d'étapes.
    //
    // Aucun de ces deux dégâts ne se voit : le résultat fiscal sort d'un
    // calcul qui a l'air normal, et c'est l'impôt qui est faux.
    const resultatCompte13 = details.filter((l) => /^13[19]/.test(l.numero)).reduce((s, l) => s - l.solde, 0);
    const avantCloture = Math.abs(resultatClasses678) > 0.005;
    // Un produit est un solde créditeur, donc négatif dans la convention
    // `solde = débit - crédit` de la balance · d'où le signe.
    const chiffreAffaires = details
      .filter((l) => PREFIXES_CHIFFRE_AFFAIRES.some((p) => l.numero.startsWith(p)))
      .reduce((s, l) => s - l.solde, 0);
    return {
      resultatComptable: arrondir(avantCloture ? resultatClasses678 : resultatCompte13),
      sourceResultat: avantCloture ? ('CLASSES_6_7_8' as const) : ('COMPTE_13' as const),
      chiffreAffaires: arrondir(chiffreAffaires),
    };
  }

  /**
   * Résultat fiscal AVANT imputation des déficits antérieurs · c'est cette
   * valeur qui dit si un exercice est bénéficiaire ou déficitaire, « abstraction
   * faite des déficits reportables antérieurs » (art. 52 in fine).
   */
  /**
   * PROPOSITIONS DE RETRAITEMENT, tirées des comptes que le cabinet a
   * qualifiés lui-même (`Compte.codeRetraitementFiscal`).
   *
   * Le catalogue explique pourquoi le logiciel ne DÉDUIT pas la qualification
   * fiscale d'un numéro de compte : le 6582 « Dons » reçoit des versements
   * déductibles dans la limite de l'article 44 et d'autres qui ne le sont
   * pas. Cette règle reste vraie du plan NORMALISÉ, et rien ici ne la défait.
   *
   * Ce que fait cette méthode est autre chose : un cabinet qui a ouvert son
   * propre sous-compte « Amendes fiscales » a déjà tranché, une fois. Le
   * logiciel lui REPROPOSE chaque exercice le montant et l'article, au lieu
   * de le lui faire ressaisir. Il ne qualifie pas · il se souvient.
   *
   * ET IL NE CRÉE RIEN. La méthode rend des PROPOSITIONS : le comptable les
   * reprend, les corrige ou les ignore. Une réintégration inscrite d'office
   * serait exactement le « logiciel qui tranche seul » que le catalogue
   * refuse.
   */
  async propositionsRetraitements(tenantId: string, exerciceId: string) {
    await this.tenantSyscohada(tenantId);
    await this.exerciceDuDossier(tenantId, exerciceId);

    const comptes = await this.prisma.compte.findMany({
      where: { tenantId, codeRetraitementFiscal: { not: null } },
      select: { id: true, numero: true, intitule: true, codeRetraitementFiscal: true },
      orderBy: { numero: 'asc' },
    });
    if (!comptes.length) return { propositions: [], avertissements: [], chiffreAffaires: 0 };

    const [mouvements, brut] = await Promise.all([
      this.prisma.ligneEcriture.groupBy({
        by: ['compteId'],
        where: {
          compteId: { in: comptes.map((c) => c.id) },
          // LE LIVRE-JOURNAL SEUL · une écriture restée en brouillard n'est
          // pas entrée en comptabilité, et un impôt ne se calcule pas sur du
          // provisoire.
          ecriture: { tenantId, exerciceId, statut: StatutEcriture.VALIDEE },
        },
        _sum: { debit: true, credit: true },
      }),
      // PAS `lireBalance` MAIS `resultatFiscalBrut` · la condition d'ouverture
      // de l'art. 44 se juge sur le RÉSULTAT NET IMPOSABLE, donc après les
      // réintégrations et déductions déjà saisies, et non sur le seul
      // chiffre d'affaires. C'est le seul plafond du Titre II dont l'assiette
      // dépend de l'ordre des opérations.
      this.resultatFiscalBrut(tenantId, exerciceId),
    ]);
    const parCompte = new Map(mouvements.map((m) => [m.compteId, m]));

    // PREMIER PASSAGE · le mouvement net de chaque compte qualifié, sans
    // encore aucun plafond. Le mouvement est pris dans son sens naturel, une
    // charge étant débitrice ; un compte qui finit créditeur (avoir supérieur
    // à la charge) ne porte plus rien à réintégrer.
    const lignes = comptes.flatMap((c) => {
      const definition = CATALOGUE_RETRAITEMENTS.find((d) => d.code === c.codeRetraitementFiscal);
      // Un code devenu inconnu (catalogue remanié) est IGNORÉ, pas rendu ·
      // proposer un retraitement sans article ni libellé ne veut rien dire.
      if (!definition) return [];
      const m = parCompte.get(c.id);
      const mouvement = arrondir(Number(m?._sum.debit ?? 0) - Number(m?._sum.credit ?? 0));
      if (mouvement <= 0) return [];
      return [{ compte: c, definition, mouvement }];
    });

    // CE QUI NE SE PROPOSE PAS, ET POURQUOI ON LE DIT QUAND MÊME.
    //
    // Pour un code sans plafond, le service posait `montant = mouvement` :
    // tout le mouvement se réintègre. C'est juste pour une amende (art. 50,
    // 3°), dont la charge entière est non déductible. Ce l'est exactement
    // A REBOURS pour l'amortissement : l'art. 28 admet en déduction toute
    // dotation conforme au barème de l'arrêté n° 013/CAB/MIN/FINANCES/2025,
    // et seul l'EXCÉDENT se réintègre. Un cabinet qui taguait son 6813 ·
    // geste naturel, c'est le compte où vit l'écart, et rien ne l'en
    // empêchait · se voyait proposer la dotation ENTIÈRE.
    //
    // L'annuité fiscale ne se lit pas dans une balance. Plutôt que de
    // proposer un montant faux, le module N'EN PROPOSE AUCUN et rend la
    // ligne comme un avertissement, avec son article et ce que le comptable
    // doit établir lui-même. S'abstenir en disant pourquoi vaut mieux que
    // deviner : un montant repris sans réflexion se retrouve dans une
    // déclaration.
    const horsPortee = lignes.filter((l) => l.definition.assietteHorsPortee);
    const proposables = lignes.filter((l) => !l.definition.assietteHorsPortee);
    const avertissements = horsPortee.map((l) => ({
      compteId: l.compte.id,
      numero: l.compte.numero,
      intitule: l.compte.intitule,
      code: l.definition.code,
      libelle: l.definition.libelle,
      source: l.definition.source,
      mouvement: l.mouvement,
      motif: l.definition.assietteHorsPortee!,
    }));

    // CUMUL PAR NATURE DE CHARGE · c'est lui, et non le mouvement d'un
    // compte, que les plafonds assis sur le chiffre d'affaires viennent
    // limiter (voir `repartirExcedentPlafonne` et le commentaire de
    // `AssiettePlafond`).
    const cumulParCode = new Map<string, number>();
    for (const l of proposables) {
      if (l.definition.plafond?.assiette !== 'CHIFFRE_AFFAIRES') continue;
      cumulParCode.set(l.definition.code, arrondir((cumulParCode.get(l.definition.code) ?? 0) + l.mouvement));
    }
    // ART. 44, AL. 2, 2° · le plafond ne joue que si le droit à déduction est
    // OUVERT. Ici, et ici seulement, les deux termes de la condition sont
    // connus : les versements sont le cumul de la nature, et ce qui en a déjà
    // été réintégré se lit dans les retraitements saisis.
    const plafondsFermes = new Set<string>();
    for (const [code, cumul] of cumulParCode) {
      const definition = RETRAITEMENT_PAR_CODE.get(code);
      if (!definition?.conditionResultatNetPositif) continue;
      if (!this.droitADeductionOuvert(brut, code, cumul).ouvert) plafondsFermes.add(code);
    }
    const excedentsRepartis = this.repartirExcedentPlafonne(
      proposables,
      cumulParCode,
      brut.chiffreAffaires,
      plafondsFermes,
    );

    const propositions = proposables.flatMap((l) => {
      const plafond = l.definition.plafond;
      const cumulNature = cumulParCode.get(l.definition.code) ?? null;
      const conditionFermee = plafondsFermes.has(l.definition.code);
      // Sans plafond, tout le mouvement se retraite. Avec plafond, SEUL
      // L'EXCÉDENT · réintégrer la charge entière ferait payer l'impôt sur
      // une somme que la loi admet en déduction. Condition d'ouverture non
      // remplie, en revanche, il n'y a PAS d'excédent : il n'y a aucune
      // déduction, et le versement entier se réintègre.
      const montant = !plafond
        ? l.mouvement
        : plafond.assiette === 'CHIFFRE_AFFAIRES'
          ? (excedentsRepartis.get(l.compte.id) ?? 0)
          : arrondir(Math.max(l.mouvement - arrondir(plafond.part * l.mouvement), 0));
      if (montant <= 0) return [];
      const partagee = plafond?.assiette === 'CHIFFRE_AFFAIRES' && cumulNature !== null && cumulNature > l.mouvement;
      return [
        {
          compteId: l.compte.id,
          numero: l.compte.numero,
          intitule: l.compte.intitule,
          code: l.definition.code,
          sens: l.definition.sens,
          libelle: l.definition.libelle,
          source: l.definition.source,
          mouvement: l.mouvement,
          // L'ÉNONCÉ EST LE SEUL CANAL QUI ATTEIGNE L'ÉCRAN AUJOURD'HUI · la
          // condition d'ouverture y est donc jointe, plutôt que servie dans
          // un champ que la page de saisie ne lit pas encore.
          plafondEnonce: !plafond
            ? null
            : [
                conditionFermee
                  ? `${plafond.enonce} · SANS EFFET ICI`
                  : partagee
                    ? `${plafond.enonce} · plafond commun à ${cumulNature!.toLocaleString('fr-FR')} de charges de cette nature, réparti au prorata`
                    : plafond.enonce,
                conditionFermee ? this.enonceConditionFermee(l.definition.code, brut, cumulNature ?? 0) : null,
              ]
                .filter(Boolean)
                .join(' · '),
          // Ce que la ligne conserve en déduction. Pour un plafond global
          // réparti, c'est sa quote-part du plafond, pas le plafond entier ·
          // afficher le plafond entier sur chaque ligne serait exactement
          // l'erreur que cette répartition corrige.
          montantAdmis: !plafond ? null : arrondir(l.mouvement - montant),
          /** Cumul de la nature, quand le plafond est global. Null sinon. */
          mouvementNature: plafond?.assiette === 'CHIFFRE_AFFAIRES' ? cumulNature : null,
          /** Plafond légal de la NATURE, avant répartition entre ses comptes. */
          montantAdmisNature:
            plafond?.assiette === 'CHIFFRE_AFFAIRES'
              ? conditionFermee
                ? 0
                : arrondir(plafond.part * brut.chiffreAffaires)
              : null,
          montant,
        },
      ];
    });

    return { propositions, avertissements, chiffreAffaires: brut.chiffreAffaires };
  }

  /**
   * CONDITION D'OUVERTURE DU DROIT À DÉDUCTION · art. 44, al. 2, 2° de la loi
   * n° 23/053 : « le résultat net imposable avant déduction de ces versements
   * soit positif ».
   *
   * L'article pose DEUX choses et le module n'en connaissait qu'une. Le
   * plafond de 0,5 % du chiffre d'affaires dit COMBIEN est admis ; cette
   * condition dit SI quelque chose l'est. Sur un dossier déficitaire, la loi
   * n'admet AUCUN versement en déduction : le module offrait 0,5 % du chiffre
   * d'affaires, et le contribuable déclarait un déficit reportable trop élevé
   * d'autant · un report fictif qui ne se découvre qu'à l'exercice où il
   * s'impute, deux ou trois ans plus tard.
   *
   * LE CALCUL, ET POURQUOI IL EST CE QU'IL EST. Les versements sont en charge
   * dans le résultat comptable, donc déjà déduits ; ce que la loi veut, c'est
   * le résultat AVANT cette déduction. On les rajoute donc · moins ce qui en
   * a déjà été réintégré par une ligne saisie sous le même code, faute de
   * quoi cette réintégration compterait deux fois.
   *
   * Le résultat pris est le résultat fiscal BRUT, réintégrations et
   * déductions saisies comprises, et non le résultat comptable : c'est le
   * « résultat net IMPOSABLE » que l'article nomme. Il est pris avant
   * imputation des déficits antérieurs, comme l'art. 52, 2° le commande pour
   * apprécier le caractère bénéficiaire d'un exercice.
   */
  private droitADeductionOuvert(
    brut: LectureFiscaleBrute,
    code: string,
    versements: number,
  ): { ouvert: boolean; resultatAvantVersements: number; dejaReintegre: number } {
    const dejaReintegre = arrondir(
      brut.retraitements
        .filter((r) => r.code === code && r.sens === SensRetraitementFiscal.REINTEGRATION)
        .reduce((somme, r) => somme + Number(r.montant), 0),
    );
    const resultatAvantVersements = arrondir(brut.resultatFiscalBrut + versements - dejaReintegre);
    return { ouvert: resultatAvantVersements > 0.005, resultatAvantVersements, dejaReintegre };
  }

  /**
   * LA CONDITION DE L'ART. 44 VUE DEPUIS L'ÉCRAN DE SAISIE, où le montant des
   * versements N'EST PAS ENCORE CONNU · le comptable est en train de le
   * taper. Le serveur ne peut donc pas trancher comme il le fait pour une
   * proposition, où le cumul des comptes qualifiés lui donne le montant.
   *
   * CE QU'IL PEUT DIRE, EN REVANCHE, EST EXACT. La condition s'écrit
   * `résultat fiscal brut + versements − déjà réintégré > 0`, soit
   * `versements > déjà réintégré − résultat fiscal brut`. Le membre de droite
   * ne dépend pas des versements : c'est un SEUIL, et il se calcule.
   *
   *  · seuil négatif ou nul · la condition est remplie quel que soit le
   *    montant saisi, le plafond joue normalement ;
   *  · seuil positif · elle ne l'est qu'au-dessus de ce seuil. Le plafond est
   *    alors servi à ZÉRO, et le seuil est dit. Ce sens-là est celui de la
   *    loi : la déduction est SUBORDONNÉE à la condition, elle n'est pas
   *    acquise tant que la condition n'est pas établie. L'écran affiche donc
   *    la réintégration totale, et la phrase dit exactement à partir de quel
   *    montant de versements il faut la corriger à la main.
   *
   * La première branche de la double condition · le relevé joint à la
   * déclaration · n'est jamais calculée : une pièce jointe à un imprimé ne se
   * lit dans aucune comptabilité. Elle est RAPPELÉE, ce qui est tout ce qu'un
   * logiciel peut honnêtement en faire.
   */
  private conditionPlafondPourEcran(
    definition: { code: string; conditionResultatNetPositif?: { enonce: string; source: string } },
    brut: LectureFiscaleBrute,
  ): { ouverte: boolean; enonce: string | null } {
    const condition = definition.conditionResultatNetPositif;
    if (!condition) return { ouverte: true, enonce: null };
    const { dejaReintegre } = this.droitADeductionOuvert(brut, definition.code, 0);
    const seuilVersements = arrondir(dejaReintegre - brut.resultatFiscalBrut);
    if (seuilVersements < 0.005) {
      return {
        ouverte: true,
        enonce: `${condition.source} : « ${condition.enonce} » La condition de résultat (2°) est remplie sur cet exercice. Celle du relevé (1°) ne se lit dans aucune comptabilité · OmegaX ne peut pas la vérifier, elle reste à joindre à la déclaration.`,
      };
    }
    return {
      ouverte: false,
      enonce: `${condition.source} : « ${condition.enonce} » Le résultat fiscal de cet exercice, retraitements saisis compris, est de ${brut.resultatFiscalBrut.toLocaleString('fr-FR')} : la déduction n'est ouverte que si ces versements dépassent ${seuilVersements.toLocaleString('fr-FR')}. Au-dessous, AUCUN n'est déductible et la totalité se réintègre · le plafond est servi à zéro pour cette raison.`,
    };
  }

  /** La phrase servie au comptable quand la condition de l'art. 44 est fermée. */
  private enonceConditionFermee(
    code: string,
    brut: LectureFiscaleBrute,
    versements: number,
  ): string {
    const definition = RETRAITEMENT_PAR_CODE.get(code);
    const condition = definition?.conditionResultatNetPositif;
    const { resultatAvantVersements } = this.droitADeductionOuvert(brut, code, versements);
    return `${condition?.source ?? 'Loi n° 23/053, art. 44, al. 2'} : « ${condition?.enonce ?? ''} » Le résultat net imposable avant déduction de ces versements est de ${resultatAvantVersements.toLocaleString('fr-FR')} : la condition n'est PAS remplie, aucun versement n'est déductible et la totalité se réintègre. Le plafond ne joue pas.`;
  }

  /**
   * RÉPARTITION DE L'EXCÉDENT D'UN PLAFOND GLOBAL entre les comptes qui
   * portent la même nature de charge.
   *
   * Les plafonds assis sur le chiffre d'affaires sont des plafonds de NATURE,
   * pas de compte · l'art. 44 admet les versements « dans la limite de 0,5 %
   * du chiffre d'affaires de l'exercice », l'art. 49, 1° les cadeaux « dans
   * les limites de deux pour mille (2 ‰) du chiffre d'affaires hors taxes »,
   * l'art. 43 les redevances à des entités liées « dans la limite de 3,5 % du
   * chiffre d'affaires hors taxes ». Aucun de ces textes ne parle de compte.
   *
   * CE QUE L'APPLICATION COMPTE PAR COMPTE FAISAIT · un cabinet qui tient
   * deux sous-comptes de dons obtenait deux fois 0,5 % du chiffre d'affaires,
   * trois sous-comptes trois fois, et ainsi de suite. La charge déduite
   * dépassait le plafond d'autant, sans qu'aucun total ne le montre : le
   * calcul avait l'air normal, seul l'impôt était faux.
   *
   * L'excédent est calculé UNE FOIS sur le cumul de la nature, puis réparti
   * entre les comptes au prorata de leur mouvement · le dernier compte de la
   * nature absorbe le centime d'arrondi, pour que la somme des lignes soit
   * exactement l'excédent dû.
   *
   * Les plafonds assis sur la CHARGE (frais de représentation, 60 % de leur
   * montant, art. 49, 2° ; frais de communication, 50 %, art. 49, 7°) ne
   * passent pas ici : une fraction est linéaire, la calculer compte par
   * compte donne le même total qu'en une fois.
   */
  private repartirExcedentPlafonne(
    lignes: { compte: { id: string }; definition: { code: string; plafond?: { part: number; assiette: string } }; mouvement: number }[],
    cumulParCode: Map<string, number>,
    chiffreAffaires: number,
    /**
     * Codes dont la CONDITION D'OUVERTURE n'est pas remplie · art. 44, al. 2,
     * 2°. Leur plafond en francs vaut zéro : la loi n'admet aucun versement
     * en déduction, l'excédent est donc le versement entier.
     */
    plafondsFermes: Set<string> = new Set(),
  ): Map<string, number> {
    const excedents = new Map<string, number>();
    for (const [code, cumul] of cumulParCode) {
      const definition = RETRAITEMENT_PAR_CODE.get(code);
      if (!definition?.plafond) continue;
      const admisNature = plafondsFermes.has(code) ? 0 : arrondir(definition.plafond.part * chiffreAffaires);
      const excedentNature = arrondir(Math.max(cumul - admisNature, 0));
      const comptes = lignes.filter((l) => l.definition.code === code);
      let reparti = 0;
      comptes.forEach((l, index) => {
        const dernier = index === comptes.length - 1;
        // Le dernier prend le reste · sans quoi la somme des quotes-parts
        // arrondies s'écarterait de l'excédent réellement dû.
        const part = dernier || cumul <= 0 ? arrondir(excedentNature - reparti) : arrondir((excedentNature * l.mouvement) / cumul);
        reparti = arrondir(reparti + part);
        excedents.set(l.compte.id, Math.max(part, 0));
      });
    }
    return excedents;
  }

  private async resultatFiscalBrut(tenantId: string, exerciceId: string) {
    const [lecture, retraitements] = await Promise.all([
      this.lireBalance(tenantId, exerciceId),
      this.prisma.retraitementFiscal.findMany({ where: { tenantId, exerciceId }, orderBy: { createdAt: 'asc' } }),
    ]);
    const somme = (sens: SensRetraitementFiscal) =>
      retraitements.filter((r) => r.sens === sens).reduce((s, r) => s + Number(r.montant), 0);
    const totalReintegrations = arrondir(somme(SensRetraitementFiscal.REINTEGRATION));
    const totalDeductions = arrondir(somme(SensRetraitementFiscal.DEDUCTION));
    return {
      ...lecture,
      retraitements,
      totalReintegrations,
      totalDeductions,
      resultatFiscalBrut: arrondir(lecture.resultatComptable + totalReintegrations - totalDeductions),
    };
  }

  /**
   * Déficits reportables des exercices précédents, art. 51 · une perte est
   * déductible de l'exercice suivant puis reportable, dans la limite de
   * TROIS exercices après celui qui l'a subie. Chaque déficit s'impute sur
   * les bénéfices intermédiaires avant d'arriver ici, dans l'ordre des
   * exercices, le plus ancien d'abord · un déficit non consommé dans sa
   * fenêtre est perdu, pas reporté plus loin.
   */
  private async deficitsAnterieursCalcules(tenantId: string, exercice: { id: string; dateDebut: Date }) {
    const precedents = await this.prisma.exercice.findMany({
      where: { tenantId, dateFin: { lt: exercice.dateDebut } },
      orderBy: { dateDebut: 'desc' },
      take: IMPOT_SOCIETES.exercicesReportDeficit,
    });
    // Du plus ancien au plus récent, pour consommer chaque déficit sur les
    // bénéfices qui l'ont suivi.
    const chronologiques = [...precedents].reverse();
    const fenetre: { exerciceId: string; dateFin: Date; restant: number }[] = [];
    for (const ex of chronologiques) {
      const brut = (await this.resultatFiscalBrut(tenantId, ex.id)).resultatFiscalBrut;
      if (brut < 0) {
        fenetre.push({ exerciceId: ex.id, dateFin: ex.dateFin, restant: -brut });
        continue;
      }
      let benefice = brut;
      for (const d of fenetre) {
        const impute = Math.min(d.restant, benefice);
        d.restant -= impute;
        benefice -= impute;
        if (benefice <= 0) break;
      }
    }
    const detail = fenetre
      .filter((d) => d.restant > 0.005)
      .map((d) => ({ exerciceId: d.exerciceId, dateFin: d.dateFin, montant: arrondir(d.restant) }));
    return { total: arrondir(detail.reduce((s, d) => s + d.montant, 0)), detail };
  }

  /**
   * TRANCHE commandée par le seul chiffre d'affaires d'un exercice · art. 107
   * (micro-entreprise, au plus 25 000 000 FC), art. 109 (petite entreprise,
   * de 25 000 001 à 300 000 000 FC) et art. 112 (régime réel, au-delà).
   *
   * Ce n'est PAS le régime applicable · c'est seulement la tranche où tombe
   * l'exercice. Le régime, lui, se lit dans l'art. 113, qui regarde deux
   * exercices et non un seul.
   */
  private trancheSelonChiffreAffaires(chiffreAffaires: number): RegimePhysique {
    const p = IMPOT_REVENU_PERSONNES_PHYSIQUES;
    if (chiffreAffaires <= p.seuilMicroEntreprise) return 'IRPP_MICRO_ENTREPRISE';
    if (chiffreAffaires <= p.seuilPetiteEntreprise) return 'IRPP_PETITE_ENTREPRISE';
    return 'IRPP_REGIME_REEL';
  }

  /**
   * RÉGIME EFFECTIF D'UNE PERSONNE PHYSIQUE · art. 113 de la loi n° 23/053 :
   *
   *   « Les entreprises dont le chiffre d'affaires hors taxes devient
   *   inférieur à la limite de leur régime d'imposition ne sont soumises au
   *   régime d'imposition immédiatement inférieur que lorsque leur chiffre
   *   d'affaires est resté en dessous de cette limite pendant deux exercices
   *   consécutifs.
   *   Toutefois, les entreprises dont le chiffre d'affaires hors taxes devient
   *   supérieur à la limite de leur régime d'imposition sont soumises
   *   immédiatement au régime supérieur conformément aux articles 109 et 112
   *   ci-dessus. »
   *
   * L'ARTICLE N'EST PAS SYMÉTRIQUE, et c'est tout son intérêt · la montée est
   * immédiate, la descente attend DEUX exercices consécutifs sous le seuil,
   * et elle ne va que d'UN CRAN, vers le régime « immédiatement inférieur ».
   * Une entreprise au régime réel dont le chiffre d'affaires s'effondre à
   * 20 000 000 FC deux années de suite passe aux petites entreprises, pas aux
   * micro-entreprises : il lui faudra deux exercices de plus sous le seuil de
   * 25 000 000 FC pour descendre encore.
   *
   * Trancher sur le seul chiffre d'affaires de l'exercice en cours, comme le
   * faisait ce service, déclassait dès la première mauvaise année · avec, à
   * la clé, un impôt assis sur le chiffre d'affaires là où le régime réel
   * s'appliquait encore, et un calendrier de paiement qui n'était pas le bon.
   *
   * `chiffresAffaires` est chronologique, du plus ancien au plus récent, le
   * dernier étant l'exercice calculé. Le régime de départ est celui que
   * commande le chiffre d'affaires du plus ancien exercice connu · au-delà de
   * la fenêtre observée, le dépôt n'a pas d'historique, et l'observation le
   * dit plutôt que de le taire.
   */
  private regimePhysiqueSelonHistorique(chiffresAffaires: number[]): {
    regime: RegimePhysique;
    trancheExercice: RegimePhysique;
    maintenu: boolean;
    exercicesSousLeSeuil: number;
  } {
    const trancheExercice = this.trancheSelonChiffreAffaires(chiffresAffaires[chiffresAffaires.length - 1]);
    let regime = this.trancheSelonChiffreAffaires(chiffresAffaires[0]);
    let exercicesSousLeSeuil = 0;
    for (const ca of chiffresAffaires.slice(1)) {
      const tranche = this.trancheSelonChiffreAffaires(ca);
      const rang = ECHELLE_REGIMES_PHYSIQUES.indexOf(regime);
      const rangTranche = ECHELLE_REGIMES_PHYSIQUES.indexOf(tranche);
      if (rangTranche > rang) {
        // Art. 113, al. 2 · la montée est immédiate, sans condition de durée.
        regime = tranche;
        exercicesSousLeSeuil = 0;
      } else if (rangTranche < rang) {
        exercicesSousLeSeuil += 1;
        if (exercicesSousLeSeuil >= 2) {
          // Art. 113, al. 1 · deux exercices consécutifs sous la limite DU
          // RÉGIME EN COURS, et un seul cran de descente. Le compteur repart
          // à zéro : la limite à surveiller est désormais celle du nouveau
          // régime, et elle exige à son tour deux exercices.
          regime = ECHELLE_REGIMES_PHYSIQUES[rang - 1];
          exercicesSousLeSeuil = 0;
        }
      } else {
        exercicesSousLeSeuil = 0;
      }
    }
    return { regime, trancheExercice, maintenu: regime !== trancheExercice, exercicesSousLeSeuil };
  }

  /**
   * Ce que le logiciel doit DIRE au comptable sur le régime retenu, et qu'il
   * ne peut pas calculer.
   *
   * L'OPTION DE L'ART. 110 N'EST PAS OBSERVABLE. « Les Petites Entreprises
   * peuvent opter pour l'imposition selon le régime réel d'imposition […] à
   * condition d'informer par écrit le service gestionnaire compétent de
   * l'Administration des Impôts de cette option avant le 1er février de
   * l'année d'imposition. L'option est valable pour ladite année et pour les
   * deux années suivantes. Pendant cette période, elle demeure irrévocable. »
   * Cette lettre au service gestionnaire ne laisse aucune trace comptable :
   * aucun compte ne la porte, aucune écriture ne la révèle. Le logiciel ne
   * peut donc pas la deviner, et un régime deviné serait pire qu'un régime
   * signalé · d'où un AVERTISSEMENT, jamais un calcul.
   */
  private observationsRegimePhysique(
    regime: RegimePhysique,
    suivi: { trancheExercice: RegimePhysique; maintenu: boolean; exercicesSousLeSeuil: number },
    nombreExercicesAnterieurs: number,
  ): string[] {
    const observations: string[] = [];
    const nom: Record<RegimePhysique, string> = {
      IRPP_MICRO_ENTREPRISE: 'des micro-entreprises',
      IRPP_PETITE_ENTREPRISE: 'des petites entreprises',
      IRPP_REGIME_REEL: 'réel',
    };
    if (suivi.maintenu) {
      observations.push(
        `Art. 113 : le chiffre d'affaires de cet exercice relève de la tranche ${nom[suivi.trancheExercice]}, mais le régime ${nom[regime]} est MAINTENU. Le déclassement « n'intervient que lorsque leur chiffre d'affaires est resté en dessous de cette limite pendant deux exercices consécutifs », et d'un seul cran vers le régime immédiatement inférieur. ${suivi.exercicesSousLeSeuil === 1 ? "Premier exercice sous le seuil : un second, consécutif, ouvrira le déclassement." : ''}`.trim(),
      );
    }
    if (nombreExercicesAnterieurs >= EXERCICES_OBSERVES_REGIME) {
      observations.push(
        `Art. 113 : le régime est reconstitué sur les ${EXERCICES_OBSERVES_REGIME} exercices antérieurs tenus dans ce dossier, le plus ancien d'entre eux étant supposé relever de la tranche que commande son chiffre d'affaires. Si l'entreprise est plus ancienne que cette fenêtre, contrôler cette hypothèse de départ avant de conclure.`,
      );
    }
    if (nombreExercicesAnterieurs === 0) {
      observations.push(
        "Aucun exercice antérieur n'est tenu dans ce dossier : le régime est déterminé sur le seul chiffre d'affaires de l'exercice. Si l'entreprise était suivie ailleurs, vérifier l'art. 113 avant de conclure · un déclassement suppose deux exercices consécutifs sous le seuil, une montée de régime est en revanche immédiate.",
      );
    }
    if (regime === 'IRPP_MICRO_ENTREPRISE') {
      // ART. 64, 3° ET ART. 108 · ce n'est pas une nuance de régime, c'est une
      // EXEMPTION. Le module classait tout dossier de personne physique à
      // faible chiffre d'affaires en micro-entreprise et lui annonçait le
      // forfait de l'art. 128 ; pour les cinq figures que l'art. 108 énumère,
      // la loi ne pose aucun impôt du tout.
      //
      // La dispense de patente est un FAIT ADMINISTRATIF · elle se lit dans la
      // législation sur le petit commerce et dans la situation du redevable,
      // jamais dans une balance. Le logiciel ne la devine donc pas : il la
      // rappelle, avec la liste limitative du texte, qui est elle-même la
      // meilleure réponse (aucune de ces cinq figures ne tient une
      // comptabilité en partie double).
      observations.push(
        "Art. 64, 3° et art. 108 : sont EXEMPTÉS de l'Impôt sur le Revenu des Personnes Physiques, et exclus du régime des micro-entreprises, « les contribuables dispensés de l'obligation d'obtenir la patente conformément à la législation sur le petit commerce ». L'art. 108 les énumère : petits cultivateurs et petits éleveurs qui viennent occasionnellement vendre sur les marchés publics, petits marchands ambulants de produits de consommation courante, cireurs de chaussures, vendeurs de journaux à la criée, petits vendeurs à domicile. Cette dispense est un fait administratif qu'aucune écriture ne porte · OmegaX ne peut pas la connaître. Si le dossier relève de l'une de ces figures, il n'y a ni régime ni impôt, et le forfait annoncé ici ne lui est pas dû.",
      );
    }
    if (regime === 'IRPP_PETITE_ENTREPRISE') {
      observations.push(
        "Art. 110 et 111 : si l'entreprise a opté par écrit pour le régime réel auprès de son service gestionnaire avant le 1er février, cette option prime · elle vaut pour l'année et les deux suivantes et demeure irrévocable pendant cette période. OmegaX ne peut pas la connaître, aucune écriture ne la porte : dans ce cas, ni l'impôt ci-dessous ni le calendrier de paiement ne sont ceux du dossier. En cas de non-respect des obligations du régime réel, l'art. 111 ramène d'office au régime des petites entreprises.",
      );
    }
    return observations;
  }

  /**
   * Chiffres d'affaires des exercices précédents, du plus ancien au plus
   * récent · matière première de l'art. 113. Lecture bornée à
   * EXERCICES_OBSERVES_REGIME exercices : au-delà, le dossier n'a plus
   * d'historique en base, et l'observation servie au comptable le dit.
   */
  private async chiffresAffairesAnterieurs(tenantId: string, exercice: { dateDebut: Date }) {
    const precedents = await this.prisma.exercice.findMany({
      where: { tenantId, dateFin: { lt: exercice.dateDebut } },
      orderBy: { dateDebut: 'desc' },
      take: EXERCICES_OBSERVES_REGIME,
    });
    const chronologiques = [...precedents].reverse();
    const lectures = await Promise.all(chronologiques.map((e) => this.lireBalance(tenantId, e.id)));
    return lectures.map((l) => l.chiffreAffaires);
  }

  /**
   * Régime d'imposition commandé par la forme juridique OHADA du dossier ·
   * loi 23/053 art. 3 à 6 pour les personnes morales, art. 107 à 113 pour
   * les personnes physiques. La forme se lit dans les Paramètres du dossier.
   */
  private regimeSelonForme(
    forme: FormeJuridiqueSyscohada | null,
    chiffreAffaires: number,
    chiffresAffairesAnterieurs: number[],
  ): { regime: RegimeImposition; observations: string[] } {
    const observations: string[] = [];
    const physique =
      forme === FormeJuridiqueSyscohada.ENTREPRISE_INDIVIDUELLE || forme === FormeJuridiqueSyscohada.ENTREPRENANT;
    if (physique) {
      const p = IMPOT_REVENU_PERSONNES_PHYSIQUES;
      const suivi = this.regimePhysiqueSelonHistorique([...chiffresAffairesAnterieurs, chiffreAffaires]);
      const regime = suivi.regime;
      if (regime === 'IRPP_MICRO_ENTREPRISE') {
        observations.push(
          `Régime des micro-entreprises (art. 107) : chiffre d'affaires hors taxes au plus égal à ${p.seuilMicroEntreprise.toLocaleString('fr-FR')} FC. Impôt forfaitaire annuel fixé par arrêté (art. 128), non redevable du minimum de perception (art. 122).`,
        );
      } else if (regime === 'IRPP_PETITE_ENTREPRISE') {
        observations.push(
          `Régime des petites entreprises (art. 109) : chiffre d'affaires hors taxes de ${(p.seuilMicroEntreprise + 1).toLocaleString('fr-FR')} à ${p.seuilPetiteEntreprise.toLocaleString('fr-FR')} FC. Impôt assis sur le chiffre d'affaires, 1 % pour la vente et 2 % pour les prestations (art. 127).`,
        );
      } else {
        observations.push(
          `Régime réel (art. 112) : chiffre d'affaires hors taxes supérieur à ${p.seuilPetiteEntreprise.toLocaleString('fr-FR')} FC. Le résultat fiscal déterminé ici est le bénéfice professionnel catégoriel ; le barème progressif de l'art. 118 s'applique au REVENU NET GLOBAL du contribuable, que ce dossier ne détient pas. Le minimum de perception de 1 % du chiffre d'affaires reste dû (art. 122).`,
        );
      }
      observations.push(...this.observationsRegimePhysique(regime, suivi, chiffresAffairesAnterieurs.length));
      return { regime, observations };
    }

    switch (forme) {
      case FormeJuridiqueSyscohada.SOCIETE_NOM_COLLECTIF:
      case FormeJuridiqueSyscohada.SOCIETE_COMMANDITE_SIMPLE:
        observations.push(
          "Société de personnes : l'impôt sur les sociétés ne s'applique que SUR OPTION, irrévocable, levée en assemblée générale et notifiée dans les trois mois du début de l'exercice (art. 4). Sans option, les bénéfices sont imposés dans le chef des associés. Le calcul ci-dessous suppose l'option levée.",
        );
        break;
      case FormeJuridiqueSyscohada.GROUPEMENT_INTERET_ECONOMIQUE:
        observations.push(
          "Groupement d'intérêt économique : exonéré pour la quote-part de bénéfice distribuée à ses membres personnes physiques (art. 6). Le calcul ci-dessous porte sur la totalité du résultat · retrancher cette quote-part par une déduction, avec le relevé des membres en commentaire.",
        );
        break;
      case FormeJuridiqueSyscohada.SOCIETE_COOPERATIVE:
        observations.push(
          "Société coopérative : soumise à l'impôt sur les sociétés à raison de son activité (art. 3), SAUF les coopératives agricoles, d'élevage et de pêche revêtant la forme civile, qui en sont exemptées (art. 5). Les ristournes font partie du bénéfice imposable (art. 11).",
        );
        break;
      case FormeJuridiqueSyscohada.ENTITE_PUBLIQUE:
        observations.push(
          "Entité publique : imposable si elle se livre à une exploitation lucrative (art. 3) ; exemptés, l'État, les Provinces, les ETD, les établissements publics en vertu de leurs statuts et les organismes dont les ressources proviennent uniquement de subventions budgétaires (art. 5).",
        );
        break;
      case FormeJuridiqueSyscohada.SUCCURSALE:
        observations.push(
          "Succursale d'une société non-résidente : établissement stable imposable en RDC (art. 7 et 8). Les frais généraux du siège à l'étranger ne sont pas déductibles (art. 50, 7°) · voir la réintégration correspondante.",
        );
        break;
      case null:
        observations.push(
          "La forme juridique OHADA du dossier n'est pas renseignée (Structure > Paramètres du dossier > Forme juridique). Le calcul suppose une personne morale à l'impôt sur les sociétés · une entreprise individuelle ou un entreprenant relève d'un autre régime.",
        );
        break;
      default:
        break;
    }
    return { regime: 'IMPOT_SOCIETES', observations };
  }

  /**
   * DÉCHÉANCES DU REPORT DÉFICITAIRE · art. 51, al. 2 et art. 52, 1° de la
   * loi n° 23/053. CE SONT DES AVERTISSEMENTS, PAS UN CALCUL, et la raison
   * tient en une phrase : aucune des deux déchéances ne se lit dans une
   * comptabilité.
   *
   * Art. 51, al. 2 : « L'absence de déclaration après une mise en demeure de
   * déclarer pour un exercice fiscal déterminé exclut toute possibilité de
   * faire admettre postérieurement la déduction de la perte éprouvée pendant
   * l'année se rapportant à cet exercice fiscal. » La mise en demeure est un
   * acte de l'Administration des Impôts : elle arrive par courrier, elle
   * n'entre dans aucun journal, et OmegaX n'en saura jamais rien. Un logiciel
   * qui rayerait le déficit de lui-même se tromperait dans un sens (le
   * contribuable a déclaré, et perd un report auquel il a droit) ; un
   * logiciel qui se tait laisse imputer un déficit déjà déchu. La seule
   * réponse honnête est de poser la question au comptable.
   *
   * Art. 52, 1° : « l'exercice du report déficitaire n'est pas applicable par
   * le nouvel exploitant lors de l'achat d'une entreprise déficitaire. Il en
   * est de même lorsque l'entreprise change complètement d'activité ou
   * lorsqu'elle a subi des transformations telles, dans sa composition et son
   * activité, que tout en ayant conservé sa personnalité juridique, elle
   * n'est plus en réalité la même. » Un changement d'exploitant, un
   * changement complet d'activité, une transformation de fond : rien de tout
   * cela n'est un solde de compte. Même avertissement, même raison.
   *
   * L'art. 52, 2°, lui, est bien appliqué et non signalé · le caractère
   * bénéficiaire ou déficitaire d'un exercice s'apprécie sur le résultat
   * fiscal « abstraction faite des déficits reportables des exercices
   * antérieurs », ce que fait `resultatFiscalBrut`.
   */
  private avertissementsReportDeficitaire(deficitAnterieur: number): string[] {
    if (deficitAnterieur <= 0.005) return [];
    return [
      "Art. 51, al. 2 : le report est PERDU pour un exercice dont la déclaration n'a pas été souscrite après une mise en demeure de déclarer. Une mise en demeure est un acte de l'Administration, qu'aucune écriture ne porte · OmegaX ne peut pas la connaître. Vérifier, exercice par exercice, qu'aucun des déficits imputés ci-dessus ne tombe sous cette déchéance.",
      "Art. 52, 1° : le report déficitaire n'est pas applicable au nouvel exploitant qui a acheté une entreprise déficitaire, ni lorsque l'entreprise a changé complètement d'activité ou subi des transformations telles qu'elle n'est plus en réalité la même. Ces faits ne se lisent pas davantage dans la comptabilité : si l'un d'eux s'est produit, ramener le déficit antérieur à zéro par la saisie manuelle.",
    ];
  }

  /**
   * LE CALENDRIER DE PAIEMENT, DIT AVEC SON ARTICLE · art. 57 de la loi de
   * procédures fiscales, dont les alinéas 2 et 3 ne visent pas les mêmes
   * contribuables.
   *
   * Servir les trois acomptes de l'art. 57 bis à une petite entreprise, comme
   * le faisait ce service, donnait un total juste et trois dates fausses :
   * l'impôt était annoncé aux 25 juillet, 25 septembre et 25 novembre alors
   * que la loi veut 60 % au plus tard le 31 janvier et 40 % ensuite. La
   * première échéance de l'année, la plus précoce de tout le calendrier de ce
   * contribuable, était donc la première à être manquée.
   */
  private observationsCalendrierPaiement(
    regime: RegimeImposition,
    impotDu: number | null,
    contexte: { acomptesDus: boolean; sansExerciceAnterieur: boolean },
  ): string[] {
    // LES DEUX BRANCHES D'ASSIETTE QUE LE MODULE NE SERT PAS · art. 57 bis,
    // al. 1er, dans sa rédaction issue de la L.F. n° 25/060 du 29 décembre
    // 2025. L'article en pose trois : l'impôt déclaré de l'exercice
    // précédent, ce même impôt augmenté des suppléments de l'Administration,
    // « ou, en cas d'absence de déclaration, [l']impôt reconstitué d'office ».
    // Le module sert les deux premières · la troisième REMPLACE l'impôt
    // déclaré au lieu de s'y ajouter, et rien dans une comptabilité ne dit
    // qu'un exercice n'a pas été déclaré. Elle est donc DITE, pas calculée :
    // inventer la base d'un acompte, c'est inventer un versement.
    const acomptes: string[] = [];
    if (contexte.acomptesDus && impotDu !== null) {
      if (contexte.sansExerciceAnterieur) {
        acomptes.push(
          "Art. 57 bis, al. 1er : les acomptes sont « calculés sur base de l'impôt déclaré au titre de l'exercice précédent ». Aucun exercice antérieur n'est tenu dans ce dossier · à défaut d'exercice précédent, cette base n'existe pas et AUCUN acompte n'est dû au titre de la présente année. Les trois montants ci-dessous sont ceux du PROCHAIN exercice. Si l'entreprise était suivie ailleurs, l'exercice précédent existe hors du dossier et ses acomptes restent dus : le vérifier avant de conclure. La fenêtre Retenues et déclarations présente pour sa part les trois échéances d'acompte à tout dossier SYSCOHADA, sans montant · ce sont des dates de calendrier, pas une somme à verser.",
        );
      }
      acomptes.push(
        "Art. 57 bis, al. 1er : la base des acomptes est l'impôt déclaré au titre de l'exercice précédent, augmenté des suppléments établis par l'Administration, « ou, en cas d'absence de déclaration, [de] l'impôt reconstitué d'office, que ces sommes fassent ou non l'objet de contestation ». La base servie ci-dessous est la première branche · l'impôt liquidé ici, plus les suppléments saisis. SI L'EXERCICE PRÉCÉDENT N'A PAS ÉTÉ DÉCLARÉ, la base légale est l'impôt reconstitué d'office par l'Administration, qui REMPLACE l'impôt déclaré au lieu de s'y ajouter : OmegaX ne peut pas le connaître, aucune écriture ne le porte, et le champ « suppléments » est additif. Dans ce cas, calculer les acomptes sur l'impôt reconstitué hors du logiciel · l'art. 98 bis punit « le défaut ou l'insuffisance de paiement de l'acompte provisionnel » d'une amende de 50 % de l'acompte non versé.",
      );
    }
    if (regime === 'IRPP_PETITE_ENTREPRISE') {
      const [premiere, seconde] = QUOTITES_PETITE_ENTREPRISE;
      return [
        `Art. 57, al. 3 et 57 quater : l'impôt d'une petite entreprise est payé en DEUX QUOTITÉS, ${premiere.quotite * 100} % et ${seconde.quotite * 100} % de l'impôt dû, et non par acomptes provisionnels. La première est payée à la souscription de la déclaration auto liquidative, au plus tard le ${premiere.echeance} de l'année qui suit celle de la réalisation des revenus. Les acomptes des 25 juillet, 25 septembre et 25 novembre (art. 57 bis) ne visent que l'alinéa 2 de l'art. 57, c'est-à-dire l'impôt sur les sociétés et l'IRPP au régime réel : ils ne sont pas dus ici.`,
        ...(seconde.reserve ? [seconde.reserve] : []),
        ...acomptes,
      ];
    }
    if (regime === 'IRPP_MICRO_ENTREPRISE') {
      return [
        "Art. 57 : une micro-entreprise acquitte le forfait annuel de l'art. 128 et ne verse ni acompte provisionnel (art. 57, al. 2) ni quotité (art. 57, al. 3), ces deux modes visant d'autres régimes.",
        ...acomptes,
      ];
    }
    if (regime === 'IRPP_REGIME_REEL' && impotDu === null) {
      return [
        ...acomptes,
        "Art. 57, al. 2 et 57 bis : l'IRPP au régime réel se paie bien par acomptes provisionnels, mais leur base est l'impôt DÉCLARÉ de l'exercice précédent, augmenté des suppléments établis par l'Administration. Cet impôt dépend du barème progressif appliqué au revenu net global du contribuable, que ce dossier ne détient pas · les trois montants ne sont donc pas calculés ici, seule leur date est certaine (25 juillet, 25 septembre, 25 novembre).",
      ];
    }
    return acomptes;
  }

  /** L'état complet · lecture, retraitements, report, impôt, solde. */
  async resultatFiscal(tenantId: string, exerciceId: string) {
    const tenant = await this.tenantSyscohada(tenantId);
    const exercice = await this.exerciceDuDossier(tenantId, exerciceId);
    const [brut, dossier] = await Promise.all([
      this.resultatFiscalBrut(tenantId, exerciceId),
      this.prisma.dossierFiscalExercice.findUnique({ where: { exerciceId } }),
    ]);
    const acomptesVerses = Number(dossier?.acomptesVerses ?? 0);
    const supplementsAdministration = Number(dossier?.supplementsAdministration ?? 0);
    const deficitSaisi = dossier?.deficitAnterieurSaisi === null || dossier?.deficitAnterieurSaisi === undefined
      ? null
      : Number(dossier.deficitAnterieurSaisi);

    // UN SEUL EXERCICE ANTÉRIEUR SUFFIT À RÉPONDRE · art. 57 bis, al. 1er, dont
    // la base est « l'impôt déclaré au titre de l'exercice PRÉCÉDENT ». Sans
    // exercice précédent dans le dossier, il n'y a pas de base, et le dire
    // vaut mieux que laisser un échéancier annoncer des versements.
    const anterieurs = await this.prisma.exercice.findMany({
      where: { tenantId, dateFin: { lt: exercice.dateDebut } },
      orderBy: { dateDebut: 'desc' },
      take: 1,
    });

    const calcules = deficitSaisi === null ? await this.deficitsAnterieursCalcules(tenantId, exercice) : null;
    const deficitAnterieur = deficitSaisi ?? calcules!.total;
    // Un déficit ne s'impute que sur un bénéfice, et jamais au-delà.
    const deficitImpute = arrondir(Math.min(deficitAnterieur, Math.max(brut.resultatFiscalBrut, 0)));
    const resultatFiscal = arrondir(brut.resultatFiscalBrut - deficitImpute);

    // ART. 113 · le régime d'une personne physique ne se lit pas dans le seul
    // chiffre d'affaires de l'exercice. La lecture des exercices antérieurs
    // coûte une balance chacun : elle n'est faite que pour les formes qui en
    // relèvent, une personne morale étant à l'impôt sur les sociétés quel que
    // soit son chiffre d'affaires.
    const physique =
      tenant.formeJuridiqueSyscohada === FormeJuridiqueSyscohada.ENTREPRISE_INDIVIDUELLE ||
      tenant.formeJuridiqueSyscohada === FormeJuridiqueSyscohada.ENTREPRENANT;
    const chiffresAffairesAnterieurs = physique ? await this.chiffresAffairesAnterieurs(tenantId, exercice) : [];
    const { regime, observations } = this.regimeSelonForme(
      tenant.formeJuridiqueSyscohada,
      brut.chiffreAffaires,
      chiffresAffairesAnterieurs,
    );
    observations.push(...this.avertissementsReportDeficitaire(deficitAnterieur));

    // Plafonds exprimés en francs pour cet exercice · l'écran s'en sert pour
    // calculer l'excédent à réintégrer à partir de la charge engagée.
    // LES PLAFONDS SERVIS À L'ÉCRAN DE SAISIE · c'est à partir d'eux que la
    // page calcule l'excédent à réintégrer depuis la charge que le comptable
    // vient de taper. Un plafond dont la CONDITION D'OUVERTURE n'est pas
    // remplie doit donc valoir zéro ici, sans quoi l'écran continuerait
    // d'offrir 0,5 % du chiffre d'affaires à un dossier déficitaire.
    const plafonds = CATALOGUE_RETRAITEMENTS.filter((r) => r.plafond).map((r) => {
      const condition = this.conditionPlafondPourEcran(r, brut);
      return {
        code: r.code,
        // La condition est jointe à l'énoncé · c'est le seul champ que la
        // page de saisie affiche aujourd'hui (« Plafond : … »).
        enonce: condition.enonce ? `${r.plafond!.enonce} · ${condition.enonce}` : r.plafond!.enonce,
        assiette: r.plafond!.assiette,
        part: r.plafond!.part,
        montantAdmis:
          r.plafond!.assiette !== 'CHIFFRE_AFFAIRES'
            ? null
            : condition.ouverte
              ? arrondir(r.plafond!.part * brut.chiffreAffaires)
              : 0,
        /** Null quand le code ne porte aucune condition d'ouverture. */
        conditionOuverte: r.conditionResultatNetPositif ? condition.ouverte : null,
      };
    });

    const impot = this.calculerImpot(regime, resultatFiscal, brut.chiffreAffaires, dossier?.natureActivite ?? null);

    // ALINÉA 2 CONTRE ALINÉA 3 DE L'ART. 57 LPF · l'alinéa 2 range dans les
    // acomptes provisionnels « l'Impôt sur les Sociétés et l'Impôt sur le
    // Revenu des Personnes Physiques […] suivant le régime réel d'imposition ».
    // L'alinéa 3 donne aux petites entreprises un mode de paiement à part, en
    // deux quotités, et les micro-entreprises acquittent un forfait annuel
    // (art. 128) : ni les unes ni les autres ne versent d'acompte.
    const acomptesDus = regime === 'IMPOT_SOCIETES' || regime === 'IRPP_REGIME_REEL';
    observations.push(
      ...this.observationsCalendrierPaiement(regime, impot.impotDu, {
        acomptesDus,
        sansExerciceAnterieur: anterieurs.length === 0,
      }),
    );

    return {
      exerciceId,
      dateDebut: exercice.dateDebut,
      dateFin: exercice.dateFin,
      derniereVerification: DERNIERE_VERIFICATION_FISCALE,
      formeJuridiqueSyscohada: tenant.formeJuridiqueSyscohada,
      devise: tenant.devise ?? 'CDF',
      regime,
      observations,
      natureActivite: dossier?.natureActivite ?? null,
      resultatComptable: brut.resultatComptable,
      sourceResultat: brut.sourceResultat,
      chiffreAffaires: brut.chiffreAffaires,
      retraitements: brut.retraitements.map((r) => ({
        id: r.id,
        code: r.code,
        sens: r.sens,
        libelle: r.libelle,
        montant: Number(r.montant),
        commentaire: r.commentaire,
        source: RETRAITEMENT_PAR_CODE.get(r.code)?.source ?? null,
      })),
      totalReintegrations: brut.totalReintegrations,
      totalDeductions: brut.totalDeductions,
      resultatFiscalBrut: brut.resultatFiscalBrut,
      deficitAnterieur: { montant: deficitAnterieur, saisi: deficitSaisi !== null, detail: calcules?.detail ?? [] },
      deficitImpute,
      resultatFiscal,
      plafonds,
      ...impot,
      acomptesVerses,
      soldeAPayer: impot.impotDu === null ? null : arrondir(impot.impotDu - acomptesVerses),
      // BASE DES ACOMPTES · art. 57 bis LPF, tel que modifié par la loi de
      // finances n° 25/060 : « l'impôt déclaré au titre de l'exercice
      // précédent, AUGMENTÉ des suppléments éventuels établis par
      // l'Administration des Impôts […] que ces sommes fassent ou non l'objet
      // de contestation ». L'impôt calculé ici est le premier terme ; le
      // second ne se lit dans aucun compte, il naît d'un avis de
      // redressement, d'où sa saisie. L'assoir sur le seul impôt déclaré
      // proposerait trois acomptes insuffisants à tout dossier redressé, et
      // l'insuffisance de versement se paie même quand le redressement est
      // contesté.
      supplementsAdministration,
      baseAcomptes: acomptesDus && impot.impotDu !== null ? arrondir(impot.impotDu + supplementsAdministration) : null,
      // LES ACOMPTES NE SONT PAS SERVIS À TOUT LE MONDE · art. 57 bis LPF,
      // « les acomptes provisionnels visés à l'article 57, ALINÉA 2 ». Cet
      // alinéa 2 vise l'impôt sur les sociétés et l'IRPP au RÉGIME RÉEL, et
      // eux seuls. Une petite entreprise relève de l'alinéa 3 : elle paie en
      // deux quotités, ci-dessous, et le tableau des acomptes reste vide.
      acomptesProchainExercice:
        !acomptesDus || impot.impotDu === null
          ? []
          : IMPOT_SOCIETES.acomptes.map((a) => ({
              ...a,
              montant: arrondir(a.quotite * (impot.impotDu! + supplementsAdministration)),
            })),
      // ART. 57, AL. 3 ET 57 QUATER · les deux quotités de 60 % et 40 % de
      // l'impôt DE CET EXERCICE, la première au plus tard le 31 janvier de
      // l'année qui suit celle de la réalisation des revenus. Ce n'est pas un
      // acompte sur l'exercice suivant : c'est le paiement de cet impôt-ci.
      quotitesPetiteEntreprise:
        regime !== 'IRPP_PETITE_ENTREPRISE' || impot.impotDu === null
          ? []
          : QUOTITES_PETITE_ENTREPRISE.map((q) => ({
              rang: q.rang,
              quotite: q.quotite,
              echeance: q.echeance,
              source: q.source,
              reserve: q.reserve,
              montant: arrondir(q.quotite * impot.impotDu!),
            })),
    };
  }

  /**
   * Liquidation de l'impôt selon le régime. `impotDu` vaut null quand le
   * montant ne PEUT pas être calculé ici, et l'explication dit pourquoi :
   * un zéro affiché à la place d'un impôt inconnu serait une faute.
   */
  private calculerImpot(
    regime: RegimeImposition,
    resultatFiscal: number,
    chiffreAffaires: number,
    natureActivite: NatureActiviteFiscale | null,
  ): {
    impotTheorique: number | null;
    impotMinimum: number | null;
    impotDu: number | null;
    baseImpot: string;
    minimumApplique: boolean;
    explication: string;
  } {
    const is = IMPOT_SOCIETES;
    const pp = IMPOT_REVENU_PERSONNES_PHYSIQUES;
    switch (regime) {
      case 'IMPOT_SOCIETES': {
        // ART. 150 · l'arrondi légal s'applique aux montants d'impôt
        // eux-mêmes, DONC AVANT la comparaison de l'art. 57 : c'est le
        // montant arrondi qui est dû, et c'est lui qui doit être comparé.
        const theorique = arrondirImpotArt150(is.taux * Math.max(resultatFiscal, 0));
        const minimum = arrondirImpotArt150(is.tauxMinimum * chiffreAffaires);
        const minimumApplique = minimum > theorique;
        return {
          impotTheorique: theorique,
          impotMinimum: minimum,
          impotDu: Math.max(theorique, minimum),
          baseImpot: `${is.taux * 100} % du bénéfice net imposable (art. 56)`,
          minimumApplique,
          explication: minimumApplique
            ? `L'impôt minimum de ${is.tauxMinimum * 100} % du chiffre d'affaires déclaré (art. 57) est supérieur à l'impôt sur le bénéfice : c'est lui qui est dû.`
            : `Impôt sur le bénéfice net imposable au taux de ${is.taux * 100} % (art. 56), supérieur à l'impôt minimum de ${is.tauxMinimum * 100} % du chiffre d'affaires (art. 57).`,
        };
      }
      case 'IRPP_MICRO_ENTREPRISE':
        return {
          impotTheorique: null,
          impotMinimum: null,
          impotDu: null,
          baseImpot: `Forfait annuel de ${pp.forfaitMicroEntrepriseUsd} dollars américains, converti en francs (arrêté n° 015/CAB/MIN/FINANCES/2025)`,
          minimumApplique: false,
          explication: `Le forfait est libellé en dollars et sa contre-valeur dépend du taux fixé par la circulaire de perception, que le logiciel ne détient pas · ${pp.forfaitMicroEntrepriseUsd} USD, payable au plus tard le 30 avril de l'année suivante. Aucun minimum de perception (art. 122).`,
        };
      case 'IRPP_PETITE_ENTREPRISE': {
        if (!natureActivite) {
          return {
            impotTheorique: null,
            impotMinimum: null,
            impotDu: null,
            baseImpot: "1 % du chiffre d'affaires pour la vente, 2 % pour les prestations (art. 127)",
            minimumApplique: false,
            explication:
              "La nature de l'activité principale n'est pas renseignée : le taux ne se devine pas. Indiquez vente ou prestations de services · en cas d'activité mixte, la loi cumule les chiffres d'affaires et impose suivant l'activité principale.",
          };
        }
        const taux = pp.tauxPetiteEntreprise[natureActivite];
        // Art. 150 · l'IRPP est nommément visé par l'arrondi légal.
        const du = arrondirImpotArt150(taux * chiffreAffaires);
        return {
          impotTheorique: du,
          impotMinimum: null,
          impotDu: du,
          baseImpot: `${taux * 100} % du chiffre d'affaires annuel réalisé, activité de ${natureActivite === 'VENTE' ? 'vente' : 'prestations de services'} (art. 127)`,
          minimumApplique: false,
          explication:
            "Impôt assis sur le chiffre d'affaires, indépendant du résultat : les retraitements ci-dessus ne le modifient pas. Ils restent utiles si l'entreprise opte pour le régime réel.",
        };
      }
      case 'IRPP_REGIME_REEL': {
        // Art. 150 · « l'Impôt minimum » est nommé par l'article.
        const minimum = arrondirImpotArt150(pp.tauxMinimumRegimeReel * chiffreAffaires);
        return {
          impotTheorique: null,
          impotMinimum: minimum,
          impotDu: null,
          baseImpot: 'Barème progressif de l’art. 118 sur le revenu net global du contribuable',
          minimumApplique: false,
          explication: `Le bénéfice professionnel déterminé ici (${resultatFiscal.toLocaleString('fr-FR')}) entre dans le revenu net global du contribuable avec ses autres revenus catégoriels ; le barème progressif s'applique à ce total, que ce dossier ne détient pas. Le minimum de perception de ${pp.tauxMinimumRegimeReel * 100} % du chiffre d'affaires (art. 122) est en revanche connu.`,
        };
      }
    }
  }

  // --- Retraitements --------------------------------------------------------

  async ajouterRetraitement(tenantId: string, exerciceId: string, dto: CreerRetraitementDto) {
    await this.tenantSyscohada(tenantId);
    await this.exerciceDuDossier(tenantId, exerciceId);
    const definition = RETRAITEMENT_PAR_CODE.get(dto.code);
    if (!definition) throw new BadRequestException(`Code de retraitement inconnu : ${dto.code}`);
    const libre = dto.code === CODE_LIBRE;
    if (libre && !dto.libelle?.trim()) {
      throw new BadRequestException('Une ligne libre doit porter un libellé');
    }
    if (libre && !dto.commentaire?.trim()) {
      // Sans fondement écrit, la ligne est indéfendable devant le vérificateur.
      throw new BadRequestException('Une ligne libre doit indiquer son fondement en commentaire');
    }
    await this.prisma.retraitementFiscal.create({
      data: {
        tenantId,
        exerciceId,
        code: dto.code,
        // Le sens d'un code du catalogue est celui du catalogue · seule la
        // ligne libre peut aller dans les deux directions.
        sens: libre ? (dto.sens ?? definition.sens) : definition.sens,
        libelle: libre ? dto.libelle!.trim() : definition.libelle,
        montant: arrondir(dto.montant),
        commentaire: dto.commentaire?.trim() || null,
      },
    });
    return this.resultatFiscal(tenantId, exerciceId);
  }

  async modifierRetraitement(tenantId: string, id: string, dto: ModifierRetraitementDto) {
    await this.tenantSyscohada(tenantId);
    const existant = await this.prisma.retraitementFiscal.findFirst({ where: { id, tenantId } });
    if (!existant) throw new NotFoundException('Retraitement introuvable');
    await this.prisma.retraitementFiscal.update({
      where: { id },
      data: {
        ...(dto.montant === undefined ? {} : { montant: arrondir(dto.montant) }),
        ...(dto.commentaire === undefined ? {} : { commentaire: dto.commentaire.trim() || null }),
      },
    });
    return this.resultatFiscal(tenantId, existant.exerciceId);
  }

  async supprimerRetraitement(tenantId: string, id: string) {
    await this.tenantSyscohada(tenantId);
    const existant = await this.prisma.retraitementFiscal.findFirst({ where: { id, tenantId } });
    if (!existant) throw new NotFoundException('Retraitement introuvable');
    await this.prisma.retraitementFiscal.delete({ where: { id } });
    return this.resultatFiscal(tenantId, existant.exerciceId);
  }

  // --- Dossier fiscal de l'exercice ----------------------------------------

  async modifierDossier(tenantId: string, exerciceId: string, dto: ModifierDossierFiscalDto) {
    await this.tenantSyscohada(tenantId);
    await this.exerciceDuDossier(tenantId, exerciceId);
    const data = {
      ...(dto.acomptesVerses === undefined ? {} : { acomptesVerses: arrondir(dto.acomptesVerses) }),
      ...(dto.supplementsAdministration === undefined
        ? {}
        : { supplementsAdministration: arrondir(dto.supplementsAdministration) }),
      ...(dto.deficitAnterieurSaisi === undefined
        ? {}
        : { deficitAnterieurSaisi: dto.deficitAnterieurSaisi === null ? null : arrondir(dto.deficitAnterieurSaisi) }),
      ...(dto.natureActivite === undefined ? {} : { natureActivite: dto.natureActivite }),
    };
    await this.prisma.dossierFiscalExercice.upsert({
      where: { exerciceId },
      create: { tenantId, exerciceId, ...data },
      update: data,
    });
    return this.resultatFiscal(tenantId, exerciceId);
  }
}
