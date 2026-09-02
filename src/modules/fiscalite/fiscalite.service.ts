import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  FormeJuridiqueSyscohada,
  NatureActiviteFiscale,
  Referentiel,
  SensRetraitementFiscal,
  TypeCompteDetailTotal,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { CATALOGUE_RETRAITEMENTS, CODE_LIBRE, RETRAITEMENT_PAR_CODE } from './catalogue-retraitements';
import {
  DERNIERE_VERIFICATION_FISCALE,
  IMPOT_REVENU_PERSONNES_PHYSIQUES,
  IMPOT_SOCIETES,
} from './parametres-fiscaux';
import { CreerRetraitementDto, ModifierDossierFiscalDto, ModifierRetraitementDto } from './dto/fiscalite.dto';

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
 * de non déductible à partir de son compte. Le 6581 reçoit des dons
 * déductibles et des libéralités qui ne le sont pas ; un tri automatique se
 * tromperait en silence sur tous les dossiers. Il ne produit pas non plus le
 * formulaire de déclaration de la DGI, dont le modèle n'est pas en main.
 *
 * Une entité à but non lucratif est EXEMPTÉE d'impôt sur les sociétés
 * (art. 5) · le contrôleur refuse les dossiers SYCEBNL, et le service le
 * revérifie, la double barrière étant la règle du dépôt.
 */

/** Comptes qui composent le chiffre d'affaires · postes TA à TD du compte de résultat, AUDCIF Titre IX ch. 7. */
const PREFIXES_CHIFFRE_AFFAIRES = ['701', '702', '703', '704', '705', '706', '707'];

const arrondir = (n: number) => Math.round(n * 100) / 100;

type RegimeImposition =
  | 'IMPOT_SOCIETES'
  | 'IRPP_MICRO_ENTREPRISE'
  | 'IRPP_PETITE_ENTREPRISE'
  | 'IRPP_REGIME_REEL';

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

  private async tenantSyscohada(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Dossier introuvable');
    if (tenant.referentiel !== Referentiel.SYSCOHADA) {
      throw new BadRequestException(
        "La détermination du résultat fiscal ne concerne que les dossiers tenus en SYSCOHADA. Une entité à but non lucratif est exemptée d'impôt sur les sociétés (loi n° 23/053, art. 5).",
      );
    }
    return tenant;
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
   * Régime d'imposition commandé par la forme juridique OHADA du dossier ·
   * loi 23/053 art. 3 à 6 pour les personnes morales, art. 107 à 113 pour
   * les personnes physiques. La forme se lit dans les Paramètres du dossier.
   */
  private regimeSelonForme(
    forme: FormeJuridiqueSyscohada | null,
    chiffreAffaires: number,
  ): { regime: RegimeImposition; observations: string[] } {
    const observations: string[] = [];
    const physique =
      forme === FormeJuridiqueSyscohada.ENTREPRISE_INDIVIDUELLE || forme === FormeJuridiqueSyscohada.ENTREPRENANT;
    if (physique) {
      const p = IMPOT_REVENU_PERSONNES_PHYSIQUES;
      if (chiffreAffaires <= p.seuilMicroEntreprise) {
        observations.push(
          `Régime des micro-entreprises (art. 107) : chiffre d'affaires hors taxes au plus égal à ${p.seuilMicroEntreprise.toLocaleString('fr-FR')} FC. Impôt forfaitaire annuel fixé par arrêté (art. 128), non redevable du minimum de perception (art. 122).`,
        );
        return { regime: 'IRPP_MICRO_ENTREPRISE', observations };
      }
      if (chiffreAffaires <= p.seuilPetiteEntreprise) {
        observations.push(
          `Régime des petites entreprises (art. 109) : chiffre d'affaires hors taxes de ${(p.seuilMicroEntreprise + 1).toLocaleString('fr-FR')} à ${p.seuilPetiteEntreprise.toLocaleString('fr-FR')} FC. Impôt assis sur le chiffre d'affaires, 1 % pour la vente et 2 % pour les prestations (art. 127). Option possible pour le régime réel avant le 1er février, irrévocable pour trois ans (art. 110).`,
        );
        return { regime: 'IRPP_PETITE_ENTREPRISE', observations };
      }
      observations.push(
        `Régime réel (art. 112) : chiffre d'affaires hors taxes supérieur à ${p.seuilPetiteEntreprise.toLocaleString('fr-FR')} FC. Le résultat fiscal déterminé ici est le bénéfice professionnel catégoriel ; le barème progressif de l'art. 118 s'applique au REVENU NET GLOBAL du contribuable, que ce dossier ne détient pas. Le minimum de perception de 1 % du chiffre d'affaires reste dû (art. 122).`,
      );
      return { regime: 'IRPP_REGIME_REEL', observations };
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

  /** L'état complet · lecture, retraitements, report, impôt, solde. */
  async resultatFiscal(tenantId: string, exerciceId: string) {
    const tenant = await this.tenantSyscohada(tenantId);
    const exercice = await this.exerciceDuDossier(tenantId, exerciceId);
    const [brut, dossier] = await Promise.all([
      this.resultatFiscalBrut(tenantId, exerciceId),
      this.prisma.dossierFiscalExercice.findUnique({ where: { exerciceId } }),
    ]);
    const acomptesVerses = Number(dossier?.acomptesVerses ?? 0);
    const deficitSaisi = dossier?.deficitAnterieurSaisi === null || dossier?.deficitAnterieurSaisi === undefined
      ? null
      : Number(dossier.deficitAnterieurSaisi);

    const calcules = deficitSaisi === null ? await this.deficitsAnterieursCalcules(tenantId, exercice) : null;
    const deficitAnterieur = deficitSaisi ?? calcules!.total;
    // Un déficit ne s'impute que sur un bénéfice, et jamais au-delà.
    const deficitImpute = arrondir(Math.min(deficitAnterieur, Math.max(brut.resultatFiscalBrut, 0)));
    const resultatFiscal = arrondir(brut.resultatFiscalBrut - deficitImpute);

    const { regime, observations } = this.regimeSelonForme(tenant.formeJuridiqueSyscohada, brut.chiffreAffaires);

    // Plafonds exprimés en francs pour cet exercice · l'écran s'en sert pour
    // calculer l'excédent à réintégrer à partir de la charge engagée.
    const plafonds = CATALOGUE_RETRAITEMENTS.filter((r) => r.plafond).map((r) => ({
      code: r.code,
      enonce: r.plafond!.enonce,
      assiette: r.plafond!.assiette,
      part: r.plafond!.part,
      montantAdmis: r.plafond!.assiette === 'CHIFFRE_AFFAIRES' ? arrondir(r.plafond!.part * brut.chiffreAffaires) : null,
    }));

    const impot = this.calculerImpot(regime, resultatFiscal, brut.chiffreAffaires, dossier?.natureActivite ?? null);

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
      acomptesProchainExercice:
        impot.impotDu === null
          ? []
          : IMPOT_SOCIETES.acomptes.map((a) => ({ ...a, montant: arrondir(a.quotite * impot.impotDu!) })),
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
        const theorique = arrondir(is.taux * Math.max(resultatFiscal, 0));
        const minimum = arrondir(is.tauxMinimum * chiffreAffaires);
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
        const du = arrondir(taux * chiffreAffaires);
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
        const minimum = arrondir(pp.tauxMinimumRegimeReel * chiffreAffaires);
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
