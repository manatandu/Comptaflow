import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StatutBulletinPaie, StatutEcriture, TypeContratTravail } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import {
  ContratTravailDto,
  DecompteFinalDto,
  LivreDePaieDto,
  SalarieDto,
  SimulationPaieDto,
  TerminerContratDto,
} from './dto/personnel.dto';
import { assiettes, type ElementPaie, type NatureElementPaie } from './assiettes-paie';
import { baremeApplicableAuMois, retenueMensuelle } from './bareme-irpp';
import { cotisations, netAPayer, type NatureEmployeurInpp } from './cotisations-paie';
import { passationPaie, type Referentiel } from './passation-paie';
import {
  LITTERA_ARTICLE_112,
  RESERVE_QUOTITE_AVANCES,
  motifRefusRetenue,
  soldeAvance,
  type CategoriePret,
  type TypeAvance,
} from './avances-salaire';
import { quotiteSaisissable } from './quotite-saisissable';
import {
  AVERTISSEMENT_ARTICLE_89,
  jourDeKinshasa,
  messageCoursManquant,
  usdEnFc,
} from './conversion-usd';

/** La trace d'une conversion USD vers FC · figée avec le bulletin émis. */
export interface ConversionUsd {
  devise: 'USD';
  /** Francs congolais pour un dollar, tel que saisi au dossier. */
  cours: number;
  /** AAAA-MM-JJ, jour de Kinshasa du calcul. */
  dateCours: string;
  sourceCours: string | null;
  elements: Array<{ libelle: string; montantUsd: number; montantFc: number }>;
  avertissement: string;
}
import {
  LIMITE_UN_BULLETIN_PAR_MOIS,
  RESERVE_MODELE,
  TEXTE_ARTICLE_103,
  TEXTE_INALTERABILITE,
  TEXTE_NUMEROTATION,
  contratCouvrantLeMois,
  moisValide,
  motifRefusRemise,
  motifsRefusEmission,
  nomCompletMajuscules,
} from './bulletin-paie';
import {
  REPONSE_COTISATION_SYNDICALE,
  RESERVE_CESSION_SYNDICALE,
  RESERVE_LITTERAE_DATEES,
  RETENUES_ARTICLE_112,
  SANCTION_ARTICLE_112,
} from './retenues-autorisees';
import {
  ARRETE_DU_MODELE,
  DESTINATION_DES_DOUBLES,
  DOUBLES_DETACHABLES_MINIMUM,
  FORMULES_DU_MODELE,
  MENTIONS_MODELE_2008,
  RESERVE_ARTICLE_104,
  SANCTION_ARTICLE_103,
  livreDePaie,
  type FormeDuDocument,
} from './livre-de-paie';
import { MULTIPLICATEURS_ARTICLE_7, allocationFamilialeJournaliere } from './bareme-smig';
import {
  decompteFinal,
  type InitiativeRupture,
  type MotifRupture,
} from './decompte-final';
import {
  aptitudeProvisoirePerimee,
  declarationsDues,
  mentionsManquantes,
  requalifications,
  verdictEssai,
  verdictRemunerationMinimale,
  type ContratPourControle,
} from './regles-contrat-travail';

/**
 * LE REGISTRE DU PERSONNEL · P1 de la paie.
 *
 * CE QU'IL FAIT : il tient l'état civil et les engagements, et il CONFRONTE
 * chaque contrat à l'article 212 et aux requalifications des articles 40 à
 * 45. CE QU'IL NE FAIT PAS : aucun bulletin, aucune assiette, aucun montant.
 * P0 a établi que le moteur bute sur des textes absents du corpus, et le
 * registre ne les contourne pas.
 *
 * IL EST COMMUN AUX DEUX RÉFÉRENTIELS, et ce n'est pas un oubli du
 * cloisonnement (CLAUDE.md § 6). Le Code du travail ne connaît ni le SYCEBNL
 * ni le SYSCOHADA : une ASBL et une SARL embauchent sous le MÊME texte. Ce
 * qui diffère est la note annexe où l'effectif ressort (27B en SYSCOHADA,
 * 29B en SYCEBNL), et elle est tranchée dans les tables de correspondance,
 * pas ici.
 *
 * DONNÉES PERSONNELLES. C'est le premier module du dépôt à en détenir. Trois
 * conséquences, toutes tenues ailleurs et rappelées ici pour qu'on ne les
 * défasse pas par distraction :
 *  · les trois tables entrent au journal d'audit AVEC une liste d'exclusion
 *    nommée colonne par colonne (`champs-audites.ts`) ;
 *  · le cloisonnement est posé AUX DEUX BOUTS · `tenantId` dans le `where` de
 *    chaque lecture ET de chaque écriture, jamais déduit d'un identifiant
 *    fourni par le client ;
 *  · l'archive de restitution du dossier les emporte, et le test qui compte
 *    les modèles restituables tombe tant que quelqu'un ne les y a pas classés.
 */
@Injectable()
export class PersonnelService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Le registre, salarié par salarié, avec le contrat EN COURS de chacun.
   *
   * UN SALARIÉ PARTI RESTE AU REGISTRE. Un registre qui efface les partants
   * ne peut plus servir ni le décompte final, ni la déclaration annuelle de
   * l'art. 218, ni un contrôle · c'est son CONTRAT qui se termine.
   */
  async lister(tenantId: string, inclureInactifs = false) {
    const salaries = await this.prisma.salarie.findMany({
      where: { tenantId, ...(inclureInactifs ? {} : { actif: true }) },
      orderBy: [{ nom: 'asc' }, { postNom: 'asc' }],
      include: {
        enfants: { orderBy: { dateNaissance: 'asc' } },
        contrats: { orderBy: { dateEntreeEnVigueur: 'desc' } },
      },
    });
    return salaries.map((s) => ({
      ...s,
      contratEnCours: s.contrats.find((c) => c.dateFin === null) ?? null,
      nombreContrats: s.contrats.length,
    }));
  }

  async creerSalarie(tenantId: string, userId: string, dto: SalarieDto) {
    await this.verifierMatriculeLibre(tenantId, dto.matricule, null);
    return this.prisma.salarie.create({
      data: {
        tenantId,
        createdBy: userId,
        ...this.champsSalarie(dto),
        ...(dto.enfants
          ? {
              enfants: {
                create: dto.enfants.map((e) => ({
                  tenantId,
                  nom: e.nom,
                  postNom: e.postNom ?? null,
                  prenoms: e.prenoms ?? null,
                  dateNaissance: e.dateNaissance ? new Date(e.dateNaissance) : null,
                })),
              },
            }
          : {}),
      },
      include: { enfants: true },
    });
  }

  async modifierSalarie(tenantId: string, salarieId: string, dto: SalarieDto) {
    // CLOISONNEMENT AU PREMIER BOUT · on vérifie que le salarié appartient au
    // dossier AVANT d'écrire, et jamais en faisant confiance à l'identifiant.
    const existant = await this.prisma.salarie.findFirst({
      where: { id: salarieId, tenantId },
      select: { id: true },
    });
    if (!existant) throw new NotFoundException('Salarié introuvable dans ce dossier.');
    await this.verifierMatriculeLibre(tenantId, dto.matricule, salarieId);

    return this.prisma.$transaction(async (tx) => {
      if (dto.enfants) {
        // Les enfants sont remplacés en bloc · la fiche les rend tous, et
        // une mise à jour partielle laisserait un enfant supprimé à l'écran
        // revenir au prochain chargement.
        await tx.enfantACharge.deleteMany({ where: { tenantId, salarieId } });
        for (const e of dto.enfants) {
          await tx.enfantACharge.create({
            data: {
              tenantId,
              salarieId,
              nom: e.nom,
              postNom: e.postNom ?? null,
              prenoms: e.prenoms ?? null,
              dateNaissance: e.dateNaissance ? new Date(e.dateNaissance) : null,
            },
          });
        }
      }
      // CLOISONNEMENT AU SECOND BOUT · `updateMany` porte le `tenantId` dans
      // son `where`, pour qu'aucun chemin ne puisse écrire hors du dossier,
      // même si le contrôle ci-dessus était un jour contourné.
      await tx.salarie.updateMany({
        where: { id: salarieId, tenantId },
        data: this.champsSalarie(dto),
      });
      return tx.salarie.findFirst({
        where: { id: salarieId, tenantId },
        include: { enfants: true, contrats: true },
      });
    });
  }

  private champsSalarie(dto: SalarieDto) {
    return {
      matricule: dto.matricule?.trim() || null,
      nom: dto.nom.trim(),
      postNom: dto.postNom?.trim() || null,
      prenoms: dto.prenoms?.trim() || null,
      sexe: dto.sexe,
      numeroAffiliationCnss: dto.numeroAffiliationCnss?.trim() || null,
      dateNaissance: dto.dateNaissance ? new Date(dto.dateNaissance) : null,
      millesimeNaissance: dto.millesimeNaissance ?? null,
      lieuNaissance: dto.lieuNaissance?.trim() || null,
      nationalite: dto.nationalite?.trim() || null,
      nomConjoint: dto.nomConjoint?.trim() || null,
      aptitudeConstateeLe: dto.aptitudeConstateeLe ? new Date(dto.aptitudeConstateeLe) : null,
      aptitudeConstateePar: dto.aptitudeConstateePar?.trim() || null,
      aptitudeProvisoire: dto.aptitudeProvisoire ?? false,
      declarationEngagementLe: dto.declarationEngagementLe
        ? new Date(dto.declarationEngagementLe)
        : null,
      declarationDepartLe: dto.declarationDepartLe ? new Date(dto.declarationDepartLe) : null,
      actif: dto.actif ?? true,
    };
  }

  private async verifierMatriculeLibre(
    tenantId: string,
    matricule: string | undefined,
    sauf: string | null,
  ) {
    const valeur = matricule?.trim();
    if (!valeur) return;
    const autre = await this.prisma.salarie.findFirst({
      where: { tenantId, matricule: valeur, ...(sauf ? { NOT: { id: sauf } } : {}) },
      select: { nom: true, postNom: true },
    });
    if (autre) {
      throw new BadRequestException(
        `Le matricule « ${valeur} » est déjà porté par ${autre.nom} ${autre.postNom ?? ''}`.trim() +
          ". Le matricule est « éventuel » au sens de l'article 212, point 4 · laissez-le vide plutôt que de le dédoubler.",
      );
    }
  }

  async creerContrat(
    tenantId: string,
    userId: string,
    salarieId: string,
    dto: ContratTravailDto,
  ) {
    const salarie = await this.prisma.salarie.findFirst({
      where: { id: salarieId, tenantId },
      select: { id: true },
    });
    if (!salarie) throw new NotFoundException('Salarié introuvable dans ce dossier.');

    if (dto.renouvelleDeId) {
      // UN RENOUVELLEMENT SE RATTACHE À UN CONTRAT DU MÊME SALARIÉ, dans le
      // MÊME dossier. Sans ces deux bornes, la chaîne de renouvellements se
      // laisserait construire à travers deux dossiers, et le décompte de
      // l'art. 41 compterait des contrats qui ne sont pas les siens.
      const source = await this.prisma.contratTravail.findFirst({
        where: { id: dto.renouvelleDeId, tenantId, salarieId },
        select: { id: true },
      });
      if (!source) {
        throw new BadRequestException(
          "Le contrat renouvelé est introuvable pour ce salarié dans ce dossier. Un renouvellement se rattache au contrat qu'il prolonge, et à lui seul.",
        );
      }
    }

    return this.prisma.contratTravail.create({
      data: {
        tenantId,
        salarieId,
        createdBy: userId,
        type: dto.type,
        constateParEcrit: dto.constateParEcrit ?? true,
        dateEntreeEnVigueur: new Date(dto.dateEntreeEnVigueur),
        dateConclusion: dto.dateConclusion ? new Date(dto.dateConclusion) : null,
        lieuConclusion: dto.lieuConclusion?.trim() || null,
        dateFinPrevue: dto.dateFinPrevue ? new Date(dto.dateFinPrevue) : null,
        separeDeSaFamille: dto.separeDeSaFamille ?? false,
        ouvrageDetermine: dto.ouvrageDetermine?.trim() || null,
        motifRemplacement: dto.motifRemplacement?.trim() || null,
        emploiPermanent: dto.emploiPermanent ?? false,
        natureTravail: dto.natureTravail?.trim() || null,
        lieuExecution: dto.lieuExecution?.trim() || null,
        categorieProfessionnelle: dto.categorieProfessionnelle?.trim() || null,
        classeProfessionnelle: dto.classeProfessionnelle ?? null,
        periodiciteRemuneration: dto.periodiciteRemuneration ?? null,
        manoeuvreSansSpecialite: dto.manoeuvreSansSpecialite ?? false,
        remunerationBase: dto.remunerationBase ?? null,
        avantagesConvenus: dto.avantagesConvenus?.trim() || null,
        clauseEssai: dto.clauseEssai ?? false,
        essaiConstateParEcrit: dto.essaiConstateParEcrit ?? false,
        essaiDureeJours: dto.essaiDureeJours ?? null,
        dureePreavisJours: dto.dureePreavisJours ?? null,
        viseParOnem: dto.viseParOnem ?? false,
        dateVisaOnem: dto.dateVisaOnem ? new Date(dto.dateVisaOnem) : null,
        renouvelleDeId: dto.renouvelleDeId ?? null,
      },
    });
  }

  async terminerContrat(tenantId: string, contratId: string, dto: TerminerContratDto) {
    const contrat = await this.prisma.contratTravail.findFirst({
      where: { id: contratId, tenantId },
      select: { id: true, dateEntreeEnVigueur: true, dateFin: true },
    });
    if (!contrat) throw new NotFoundException('Contrat introuvable dans ce dossier.');
    const fin = new Date(dto.dateFin);
    if (fin.getTime() < contrat.dateEntreeEnVigueur.getTime()) {
      throw new BadRequestException(
        "La date de fin est antérieure à l'entrée en vigueur du contrat.",
      );
    }
    await this.prisma.contratTravail.updateMany({
      where: { id: contratId, tenantId },
      data: { dateFin: fin, motifFin: dto.motifFin?.trim() || null },
    });
    return this.prisma.contratTravail.findFirst({ where: { id: contratId, tenantId } });
  }

  /**
   * LA CONFRONTATION · ce qu'un inspecteur du travail lirait.
   *
   * Elle est RECALCULÉE à chaque appel et jamais stockée : un contrat complété
   * hier doit cesser d'être signalé aujourd'hui, et une colonne du dossier
   * remplie entre-temps (le numéro CNSS de l'employeur, par exemple) lève le
   * manque sur TOUS les contrats d'un coup.
   */
  async confronter(tenantId: string, aujourdhui = new Date()) {
    const [tenant, salaries] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { nom: true, numeroAffiliationCnssEmployeur: true },
      }),
      this.prisma.salarie.findMany({
        where: { tenantId },
        include: { enfants: true, contrats: { orderBy: { dateEntreeEnVigueur: 'asc' } } },
        orderBy: [{ nom: 'asc' }],
      }),
    ]);

    const employeur = {
      nom: tenant.nom,
      numeroAffiliationCnssEmployeur: tenant.numeroAffiliationCnssEmployeur,
    };

    const fiches = salaries.flatMap((s) => {
      const pourControle = {
        nom: s.nom,
        postNom: s.postNom,
        prenoms: s.prenoms,
        sexe: s.sexe as string,
        numeroAffiliationCnss: s.numeroAffiliationCnss,
        dateNaissance: s.dateNaissance,
        millesimeNaissance: s.millesimeNaissance,
        lieuNaissance: s.lieuNaissance,
        nationalite: s.nationalite,
        nomConjoint: s.nomConjoint,
        aptitudeConstateeLe: s.aptitudeConstateeLe,
        enfantsSansDateNaissance: s.enfants.filter((e) => e.dateNaissance === null).length,
      };

      // LE DÉCOMPTE DE L'ART. 41 SE FAIT PAR SALARIÉ ET PAR RANG, pas en
      // masse : c'est le NOMBRE DE CDD DÉJÀ CONCLUS, celui-ci compris, qui
      // fait basculer le troisième. Compter tous les CDD du salarié pour
      // chacun d'eux ferait requalifier le premier rétroactivement.
      let rangCdd = 0;
      return s.contrats.map((c) => {
        if (c.type === TypeContratTravail.DUREE_DETERMINEE) rangCdd += 1;
        const contrat: ContratPourControle = {
          type: c.type,
          constateParEcrit: c.constateParEcrit,
          dateEntreeEnVigueur: c.dateEntreeEnVigueur,
          dateConclusion: c.dateConclusion,
          lieuConclusion: c.lieuConclusion,
          dateFinPrevue: c.dateFinPrevue,
          ouvrageDetermine: c.ouvrageDetermine,
          motifRemplacement: c.motifRemplacement,
          emploiPermanent: c.emploiPermanent,
          natureTravail: c.natureTravail,
          lieuExecution: c.lieuExecution,
          remunerationBase: c.remunerationBase === null ? null : Number(c.remunerationBase),
          avantagesConvenus: c.avantagesConvenus,
          dureePreavisJours: c.dureePreavisJours,
          separeDeSaFamille: c.separeDeSaFamille,
          manoeuvreSansSpecialite: c.manoeuvreSansSpecialite,
          clauseEssai: c.clauseEssai,
          essaiConstateParEcrit: c.essaiConstateParEcrit,
          essaiDureeJours: c.essaiDureeJours,
          classeProfessionnelle: c.classeProfessionnelle,
          periodiciteRemuneration: c.periodiciteRemuneration,
        };
        const nombreRenouvellements = this.longueurChaineRenouvellement(s.contrats, c.id);
        // LE MOIS DE RÉFÉRENCE DU CONTRÔLE DE MINIMUM. Un contrat TERMINÉ se
        // juge sur son dernier mois · le barème a pu changer depuis, et le
        // confronter au minimum d'aujourd'hui reprocherait à l'employeur une
        // revalorisation postérieure au départ du salarié. Un contrat EN
        // COURS se juge au mois courant, parce que c'est ce qu'un inspecteur
        // du travail regarde.
        const moisDeReference = (c.dateFin ?? aujourdhui).toISOString().slice(0, 7);
        return {
          salarieId: s.id,
          salarie: [s.nom, s.postNom, s.prenoms].filter(Boolean).join(' '),
          contratId: c.id,
          type: c.type,
          dateEntreeEnVigueur: c.dateEntreeEnVigueur,
          dateFin: c.dateFin,
          mentionsManquantes: mentionsManquantes(employeur, pourControle, contrat),
          requalifications: requalifications(contrat, {
            nombreCdd: rangCdd,
            nombreRenouvellements,
          }),
          essai: verdictEssai(contrat),
          declarations: declarationsDues(
            {
              dateEntreeEnVigueur: c.dateEntreeEnVigueur,
              declarationEngagementLe: s.declarationEngagementLe,
              dateFin: c.dateFin,
              declarationDepartLe: s.declarationDepartLe,
            },
            aujourdhui,
          ),
          aptitudeProvisoirePerimee: aptitudeProvisoirePerimee(
            { aptitudeProvisoire: s.aptitudeProvisoire },
            contrat,
            aujourdhui,
          ),
          // ART. 47 · le défaut de visa ouvre au travailleur la résiliation
          // sans préavis. Il n'est pas une requalification · il est rendu à
          // part pour ne pas se confondre avec elles.
          visaOnemManquant: c.constateParEcrit && !c.viseParOnem,
          moisDeReference,
          remunerationMinimale: verdictRemunerationMinimale(contrat, moisDeReference),
        };
      });
    });

    return {
      employeur,
      // Un dossier qui n'a pas saisi son numéro CNSS d'employeur le voit UNE
      // fois, en tête, et non répété sur chaque contrat.
      manqueEmployeur: tenant.numeroAffiliationCnssEmployeur === null,
      fiches,
      totalSignalements: fiches.reduce(
        (n, f) =>
          n +
          f.mentionsManquantes.length +
          f.requalifications.length +
          f.declarations.filter((d) => d.enRetard).length +
          (f.remunerationMinimale.conforme === false ? 1 : 0),
        0,
      ),
    };
  }


  /**
   * LA SIMULATION DE PAIE · P2a. DEUX ASSIETTES ET UNE RETENUE, RIEN DE PLUS.
   *
   * CE QU'ELLE N'EST PAS, ET L'ÉCRAN LE DIT AVANT LES CHIFFRES. Ce n'est pas
   * un bulletin de paie · rien n'est stocké, aucune écriture n'est proposée,
   * aucune cotisation patronale n'est liquidée. Le bulletin, le livre de paie
   * des articles 213 à 215 et la passation comptable sont de P2b et de P3.
   *
   * POURQUOI ELLE EXISTE QUAND MÊME. Les deux assiettes d'un bulletin
   * congolais ne coïncident pas, et c'est l'erreur la plus coûteuse du
   * domaine : elle laisse un bulletin dont tous les totaux s'additionnent, un
   * net à payer plausible, et une retenue fausse. La rendre VISIBLE, élément
   * par élément, avec l'article qui décide de chacun, est ce qui permet à un
   * cabinet de vérifier avant de payer.
   *
   * LE NOMBRE DE PERSONNES À CHARGE EST PROPOSÉ, JAMAIS SUBSTITUÉ · même
   * parti que la part de main-d'œuvre nationale de l'effectif, et pour une
   * raison écrite dans le texte : l'article 124 ne compte les enfants et les
   * ascendants que « pour autant qu'ils n'aient pas bénéficié personnellement
   * […] des ressources nettes ne dépassant pas le revenu de la première
   * tranche », donnée qu'aucun livre du dossier ne porte. Et l'article 125
   * fige la situation de famille AU 1er JANVIER de l'année de réalisation des
   * revenus, non au jour de la paie · un enfant né en mars ne compte qu'en
   * janvier suivant.
   */
  /**
   * LE « TAUX LÉGAL » DE L'ARTICLE 69, 1, ET POURQUOI IL EST CALCULÉ ICI.
   *
   * La colonne 19 des annexes du décret n° 25/22 donne un taux JOURNALIER par
   * enfant. L'immunité de l'article 69, 1 borne ce que l'employeur accorde
   * SUR LA PÉRIODE DE PAIE · on mensualise donc par le multiplicateur de
   * l'article 7 du décret, vingt-six, et on porte au nombre d'enfants
   * BÉNÉFICIAIRES. Rendre `null` n'est pas une panne : c'est ce qui déclenche
   * l'abstention en aval, et elle vaut mieux qu'un plafond inventé.
   */
  private tauxLegalAllocationsFamiliales(dto: SimulationPaieDto): number | null {
    if (typeof dto.tauxLegalAllocationsFamilialesFc === 'number') {
      return dto.tauxLegalAllocationsFamilialesFc;
    }
    const enfants = dto.enfantsBeneficiairesAllocations;
    if (typeof enfants !== 'number') return null;
    const a = allocationFamilialeJournaliere(dto.moisDePaie, enfants);
    if (!a.valeur) return null;
    return a.valeur.totalFc * MULTIPLICATEURS_ARTICLE_7.MOIS;
  }

  /**
   * LE SALAIRE STIPULÉ EN DOLLARS, ramené en francs AVANT tout calcul · les
   * assiettes, les cotisations, l'IRPP et la passation ne connaissent que le
   * franc congolais, et c'est voulu : les textes ne libellent qu'en francs.
   * Voir conversion-usd.ts pour la règle (cours du JOUR, saisi au dossier,
   * jamais un autre) et sa source (décision du cabinet, faute de texte).
   *
   * Rend le DTO en francs et la trace de la conversion · la trace voyage avec
   * la simulation, donc avec le bulletin émis, qui fige le cours appliqué.
   */
  private async convertirEnFrancs(
    tenantId: string,
    dto: SimulationPaieDto,
    maintenant: Date,
  ): Promise<{ dtoFc: SimulationPaieDto; conversion: ConversionUsd | null }> {
    if ((dto.deviseStipulation ?? 'CDF') === 'CDF') {
      const sansFc = dto.elements.filter((e) => typeof e.montantFc !== 'number');
      if (sansFc.length > 0) {
        throw new BadRequestException(
          `Élément(s) sans montant en francs : ${sansFc.map((e) => e.libelle).join(', ')} · un montant en dollars ` +
            'suppose de déclarer la rémunération stipulée en USD.',
        );
      }
      return { dtoFc: dto, conversion: null };
    }
    const sansUsd = dto.elements.filter((e) => typeof e.montantUsd !== 'number');
    if (sansUsd.length > 0) {
      throw new BadRequestException(
        `Rémunération stipulée en USD · élément(s) sans montant en dollars : ${sansUsd.map((e) => e.libelle).join(', ')}.`,
      );
    }
    const jour = jourDeKinshasa(maintenant);
    const cote = await this.prisma.coursDevise.findFirst({
      where: { date: jour, devise: { tenantId, code: 'USD' } },
      select: { cours: true, source: true },
    });
    if (!cote) throw new BadRequestException(messageCoursManquant(jour));
    const cours = Number(cote.cours);
    return {
      dtoFc: {
        ...dto,
        elements: dto.elements.map((e) => ({ ...e, montantFc: usdEnFc(e.montantUsd!, cours) })),
      },
      conversion: {
        devise: 'USD',
        cours,
        dateCours: jour.toISOString().slice(0, 10),
        sourceCours: cote.source ?? null,
        elements: dto.elements.map((e) => ({
          libelle: e.libelle,
          montantUsd: e.montantUsd!,
          montantFc: usdEnFc(e.montantUsd!, cours),
        })),
        avertissement: AVERTISSEMENT_ARTICLE_89,
      },
    };
  }

  /**
   * LA SAISIE RELUE AU SERVEUR, avant tout calcul.
   *
   * (1) UNE RUBRIQUE DU CABINET IMPOSE SA NATURE · celle que le client envoie
   * est remplacée par la nature enregistrée (rubriques-paie.ts). Sans cela,
   * une prime conventionnelle renvoyée « INDEMNITE_DE_TRANSPORT » par un
   * navigateur sortirait de l'assiette sociale. Le DTO rendu est celui que le
   * bulletin fige, si bien que la passation de P9 relit la bonne nature.
   *
   * (2) UNE RETENUE D'AVANCE SE RELIT AU REGISTRE · elle doit viser une
   * avance DE CE SALARIÉ, de ce dossier, et ne pas dépasser ce qui reste dû.
   * Le type et la catégorie viennent du registre, jamais du client, parce
   * qu'ils choisissent le compte crédité (4211, 4212 ou 272).
   */
  async resoudreSaisie(tenantId: string, salarieId: string | null, dto: SimulationPaieDto) {
    const idsRubriques = [...new Set(dto.elements.map((e) => e.rubriqueId).filter((x): x is string => !!x))];
    let elements = dto.elements;
    if (idsRubriques.length) {
      const rubriques = await this.prisma.rubriquePaie.findMany({ where: { tenantId, id: { in: idsRubriques } } });
      elements = dto.elements.map((e) => {
        if (!e.rubriqueId) return e;
        const r = rubriques.find((x) => x.id === e.rubriqueId);
        if (!r) throw new BadRequestException('Rubrique de paie introuvable dans ce dossier.');
        if (!r.actif) throw new BadRequestException(`La rubrique ${r.code} est désactivée · réactivez-la ou retirez l'élément.`);
        return { ...e, nature: r.nature, libelle: e.libelle?.trim() ? e.libelle : r.libelle };
      });
    }

    const demandees = dto.retenuesAvances ?? [];
    const retenuesAvances: {
      avanceId: string;
      type: TypeAvance;
      categoriePret: CategoriePret | null;
      littera: 'c' | 'f';
      libelle: string;
      montantFc: number;
      soldeAvantFc: number;
    }[] = [];
    if (demandees.length) {
      if (!salarieId) throw new BadRequestException("Une retenue d'avance se rapporte à un salarié · choisissez-le.");
      const ids = demandees.map((r) => r.avanceId);
      if (new Set(ids).size !== ids.length) throw new BadRequestException('Une même avance figure deux fois dans les retenues.');
      const avances = await this.prisma.avanceSalaire.findMany({
        where: { tenantId, id: { in: ids } },
        include: { retenues: { select: { montantFc: true, bulletin: { select: { statut: true } } } } },
      });
      for (const r of demandees) {
        const a = avances.find((x) => x.id === r.avanceId);
        if (!a || a.salarieId !== salarieId) {
          throw new BadRequestException("Avance introuvable pour ce salarié · une retenue ne vise que les avances du salarié payé.");
        }
        const solde = soldeAvance(
          Number(a.montantFc),
          a.retenues.map((x) => ({ montantFc: Number(x.montantFc), bulletinAnnule: x.bulletin.statut !== StatutBulletinPaie.EMIS })),
        );
        const libelle = `${a.type === 'PRET' ? 'Prêt' : a.type === 'ACOMPTE' ? 'Acompte' : 'Avance'} du ${a.dateOctroi.toISOString().slice(0, 10)} · ${a.objet}`;
        const refus = motifRefusRetenue(r.montantFc, solde, libelle);
        if (refus) throw new BadRequestException(refus);
        retenuesAvances.push({
          avanceId: a.id,
          type: a.type as TypeAvance,
          categoriePret: (a.categoriePret as CategoriePret | null) ?? null,
          littera: LITTERA_ARTICLE_112[a.type as TypeAvance],
          libelle,
          montantFc: r.montantFc,
          soldeAvantFc: solde,
        });
      }
    }
    return { dto: { ...dto, elements }, retenuesAvances };
  }

  async simulerPaie(
    tenantId: string,
    salarieId: string | null,
    dtoSaisi: SimulationPaieDto,
    maintenant: Date = new Date(),
  ) {
    const { dto: dtoStipule, retenuesAvances } = await this.resoudreSaisie(tenantId, salarieId, dtoSaisi);
    const retenuesAvancesFc = retenuesAvances.reduce((s, r) => s + r.montantFc, 0);
    const { dtoFc: dto, conversion } = await this.convertirEnFrancs(tenantId, dtoStipule, maintenant);
    const borne = baremeApplicableAuMois(dto.moisDePaie);

    // Le salarié n'est lu QUE pour proposer un nombre de personnes à charge,
    // et il est borné au dossier de la session · un identifiant venu du client
    // ne désigne jamais à lui seul la ligne à lire.
    let propositionPersonnesACharge: number | null = null;
    let sourceProposition: string | null = null;
    if (salarieId) {
      const salarie = await this.prisma.salarie.findFirst({
        where: { id: salarieId, tenantId },
        select: {
          nom: true,
          nomConjoint: true,
          _count: { select: { enfants: true } },
        },
      });
      if (!salarie) throw new NotFoundException('Salarié introuvable dans ce dossier.');
      const conjoint = salarie.nomConjoint ? 1 : 0;
      propositionPersonnesACharge = conjoint + salarie._count.enfants;
      sourceProposition =
        `Registre du personnel · ${conjoint} conjoint et ${salarie._count.enfants} enfant(s) à charge. ` +
        "L'article 124 y ajoute les ascendants des deux conjoints faisant partie du ménage, que le registre ne tient pas, " +
        "et il écarte les enfants et ascendants qui disposent de ressources propres supérieures à la première tranche du barème. " +
        "L'article 125 fige la situation au 1er janvier de l'année. Le nombre retenu appartient donc au cabinet.";
    }

    const elements: ElementPaie[] = dto.elements.map((e) => ({
      nature: e.nature as NatureElementPaie,
      libelle: e.libelle,
      montantFc: e.montantFc,
      remboursementDeDepenseProfessionnelleEffective:
        e.remboursementDeDepenseProfessionnelleEffective,
      conditionArticle69Attestee: e.conditionArticle69Attestee ?? null,
    }));

    // L'ORDRE DE CALCUL EST LE POINT DÉLICAT, ET IL EST DANS LES TEXTES.
    // L'assiette SOCIALE ne dépend d'aucune cotisation : on la prend d'abord,
    // à retenues nulles. Les cotisations s'y assoient. La quote-part ouvrière
    // qui en sort ENTRE ALORS dans les retenues de l'article 71, et c'est
    // seulement là que l'assiette fiscale nette se ferme. Calculer l'impôt
    // avant les cotisations le surestimerait de 5 % de l'assiette sociale.
    // ARTICLE 69, 1 · LE « TAUX LÉGAL » SE CALCULE, IL NE SE SAISIT PLUS.
    // Voir RESOLUTION_TAUX_LEGAL_ALLOCATIONS · c'est la colonne 19 du décret
    // n° 25/22, mensualisée par le multiplicateur de l'article 7 et portée au
    // nombre d'ENFANTS BÉNÉFICIAIRES, qui n'est pas le nombre de personnes à
    // charge de l'article 124. Un taux saisi PRIME, pour le mois qu'aucune
    // annexe ne couvre. Ni l'un ni l'autre, et l'assiette s'abstient.
    const tauxLegalAllocationsFamilialesFc = this.tauxLegalAllocationsFamiliales(dto);

    const premierPassage = assiettes(elements, {
      tauxLegalAllocationsFamilialesFc,
    });
    const lesCotisations = cotisations(premierPassage.assietteSocialeFc, {
      moisDePaie: dto.moisDePaie,
      natureEmployeurInpp: (dto.natureEmployeurInpp as NatureEmployeurInpp | undefined) ?? null,
      effectif: dto.effectif ?? null,
      majorationRisquesProfessionnels: dto.majorationRisquesProfessionnels,
    });

    // Le champ saisi porte les AUTRES versements de l'article 71 (une caisse
    // de pension complémentaire, une assurance-maladie souscrite sous le
    // patronage de l'employeur). La quote-part ouvrière de la CNSS, elle, est
    // calculée · la faire saisir en plus la compterait deux fois.
    const retenuesArticle71Fc =
      lesCotisations.totalTravailleurFc + Math.max(0, dto.retenuesArticle71Fc ?? 0);

    const deuxAssiettes = assiettes(elements, {
      tauxLegalAllocationsFamilialesFc,
      retenuesArticle71Fc,
    });

    // TROIS RAISONS DE NE PAS CHIFFRER LA RETENUE, et aucune n'est une panne.
    // Le barème hors de sa période, une assiette indéterminée, et c'est tout ·
    // un nombre de personnes à charge absent vaut ZÉRO réduction, ce qui est
    // le sens défavorable au contribuable et donc celui qu'on ne suppose pas
    // en sa faveur.
    const retenue =
      borne.applicable && deuxAssiettes.assietteFiscaleNetteFc !== null
        ? retenueMensuelle(
            dto.moisDePaie,
            deuxAssiettes.assietteFiscaleNetteFc,
            dto.personnesACharge ?? 0,
          )
        : null;

    // Le TOTAL VERSÉ n'est pas l'assiette · les cinq exclusions de l'article 7
    // sortent de la rémunération, pas de ce que l'employeur paie.
    const totalVerseFc = elements.reduce((n, e) => n + Math.max(0, e.montantFc), 0);
    const net = netAPayer(
      totalVerseFc,
      lesCotisations.totalTravailleurFc,
      retenue ? retenue.retenueFc : null,
      retenuesAvancesFc,
    );
    // UN NET NÉGATIF N'EST PAS PAYABLE · les retenues d'avance dépasseraient
    // ce qui est dû au travailleur ce mois-ci. Le ramener à zéro ferait
    // mentir le 422 de la passation ; la retenue se réduit, elle ne se force pas.
    if (net.netAPayerFc !== null && net.netAPayerFc < 0) {
      throw new BadRequestException(
        `Les retenues d'avance et de prêt (${retenuesAvancesFc.toFixed(2)} FC) dépassent ce qui reste dû au travailleur ce mois-ci · réduisez-les.`,
      );
    }

    // LA PASSATION LIT LE RÉFÉRENTIEL DU DOSSIER, et elle est la seule de ce
    // module à en dépendre · le Code du travail et la loi fiscale ne
    // connaissent ni le SYCEBNL ni le SYSCOHADA, le PLAN DE COMPTES si.
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { referentiel: true },
    });
    const passation = passationPaie({
      referentiel: tenant.referentiel as Referentiel,
      elements: dto.elements.map((e) => ({
        nature: e.nature as NatureElementPaie,
        libelle: e.libelle,
        montantFc: e.montantFc,
      })),
      cotisations: lesCotisations.lignes.map((l) => ({
        cle: l.cle,
        charge: l.charge,
        montantFc: l.montantFc,
      })),
      abstentionsCotisations: lesCotisations.abstentions,
      irppFc: retenue ? retenue.retenueFc : null,
      netAPayerFc: net.netAPayerFc,
      retenuesAvances: retenuesAvances.map((r) => ({
        type: r.type,
        categoriePret: r.categoriePret,
        libelle: r.libelle,
        montantFc: r.montantFc,
      })),
    });

    // ARTICLE 114 · LA QUOTITÉ SAISISSABLE S'ASSIED SUR LA RÉMUNÉRATION AU
    // SENS DE L'ARTICLE 7, qui est exactement l'assiette SOCIALE, et sur les
    // retenues réellement liquidées ci-dessus. Elle s'abstient d'elle-même
    // quand la classe manque ou qu'un logement est fourni en nature.
    const quotite = quotiteSaisissable({
      moisDePaie: dto.moisDePaie,
      remunerationFc: deuxAssiettes.assietteSocialeFc,
      classeProfessionnelle: dto.classeProfessionnelle ?? null,
      retenuesFiscalesFc: retenue ? retenue.retenueFc : 0,
      retenuesSocialesFc: lesCotisations.totalTravailleurFc,
      logementFourniEnNature: dto.logementFourniEnNature,
      logementEnNatureDejaDefalque: dto.logementEnNatureDejaDefalque,
      // ARTICLE 138 · fournir et indemniser sont ALTERNATIFS. Les deux
      // déclarés ensemble n'est pas interdit, c'est inhabituel · on le dit.
      indemniteDeLogementVersee: elements.some(
        (e) => e.nature === 'LOGEMENT_OU_SON_INDEMNITE' && e.montantFc > 0,
      ),
      obligationAlimentaireLegale: dto.obligationAlimentaireLegale,
    });

    return {
      moisDePaie: dto.moisDePaie,
      referentiel: tenant.referentiel,
      // null pour une rémunération en francs · sinon le cours, sa date et le
      // détail élément par élément, figés avec le bulletin émis.
      conversion,
      passation,
      quotite,
      // ARTICLE 112, c) ET f) · figées avec le bulletin, relues par P9.
      retenuesAvances,
      reserveRetenuesAvances: retenuesAvances.length ? RESERVE_QUOTITE_AVANCES : null,
      // ARTICLE 112 · LA LISTE FERMÉE VOYAGE AVEC LA SIMULATION, parce
      // qu'une retenue illicite a exactement l'aspect d'une retenue licite
      // sur un bulletin, et qu'aucun contrôle ne la rattrape après coup.
      retenuesAutorisees: {
        liste: RETENUES_ARTICLE_112,
        sanction: SANCTION_ARTICLE_112,
        cotisationSyndicale: REPONSE_COTISATION_SYNDICALE,
        cessionSyndicale: RESERVE_CESSION_SYNDICALE,
        litteraeDatees: RESERVE_LITTERAE_DATEES,
      },
      tauxLegalAllocationsFamilialesFc,
      cotisations: lesCotisations,
      net,
      baremeApplicable: borne.applicable,
      motifBaremeInapplicable: borne.motif,
      assiettes: deuxAssiettes,
      personnesAChargeRetenues: dto.personnesACharge ?? 0,
      propositionPersonnesACharge,
      sourceProposition,
      retenue,
      avertissement:
        "Ceci n'est PAS un bulletin de paie et ne tient PAS lieu de livre de paie des articles 213 à 215. " +
        "OmegaX rend ici les deux assiettes, les cotisations des deux côtés, la retenue de l'article 119, " +
        "le net, la quotité saisissable de l'article 114 et une PROPOSITION d'écriture · il ne conserve " +
        "rien, ne poste rien et ne remet aucun décompte écrit au sens de l'article 103. " +
        "Le décompte écrit s'obtient en ÉMETTANT le bulletin, qui fige ce calcul et lui donne un numéro. " +
        "La retenue rendue est un ACOMPTE sur l'impôt annuel de l'article 116, jamais un solde.",
    };
  }


  /**
   * LE DÉCOMPTE FINAL · P4. PUREMENT CALCULÉ, RIEN N'EST STOCKÉ.
   *
   * Aucune lecture Prisma non plus · tout ce dont le calcul a besoin est dans
   * le Code du travail et dans ce que le cabinet déclare. L'ancienneté et les
   * mois de service SE SAISISSENT, et ce n'est pas un raccourci : l'article
   * 141, alinéa 2, fait entrer dans le service les jours de repos, de congé
   * payé, les jours fériés et l'incapacité jusqu'à six mois par année, sans
   * cette limite pour un accident du travail. Reconstituer ce décompte depuis
   * les dates du contrat donnerait un chiffre plausible et faux.
   *
   * LE `tenantId` EST QUAND MÊME REÇU · la route est cloisonnée par le jeton,
   * et le garder en signature empêche qu'on l'oublie le jour où le décompte
   * lira le contrat.
   */
  /**
   * LE LIVRE DE PAIE · PUREMENT DÉCLARATIF, RIEN N'EST LU NI ÉCRIT.
   *
   * OmegaX ne tient pas le livre de paie et ne prétend pas en tenir lieu.
   * Il dit ce que les articles 213 à 215 exigent, il compte les mentions de
   * l'article 25 de l'arrêté n° 146/2018 qu'un document couvre, et il REFUSE
   * toujours de certifier la conformité au modèle : l'arrêté de 2008 qui fixe
   * ce modèle est identifié mais pas lu.
   */
  livreDePaie(_tenantId: string, dto: LivreDePaieDto) {
    return {
      ...livreDePaie({
        siegeDExploitation: dto.siegeDExploitation ?? null,
        formeDuDocument: (dto.formeDuDocument as FormeDuDocument | undefined) ?? null,
        autorisationInspecteurDuTravail: dto.autorisationInspecteurDuTravail ?? null,
        effectifHabituel: dto.effectifHabituel ?? null,
        exclusivementPersonnelDomestique: dto.exclusivementPersonnelDomestique,
        mentionsPortees: dto.mentionsPortees ?? [],
      }),
      mentions: MENTIONS_MODELE_2008,
      formules: FORMULES_DU_MODELE,
      destinationDesDoubles: DESTINATION_DES_DOUBLES,
      arreteDuModele: ARRETE_DU_MODELE,
      doublesDetachablesMinimum: DOUBLES_DETACHABLES_MINIMUM,
      sanctionArticle103: SANCTION_ARTICLE_103,
      reserveArticle104: RESERVE_ARTICLE_104,
    };
  }

  decompteFinal(_tenantId: string, dto: DecompteFinalDto) {
    return decompteFinal({
      anneesAnciennete: dto.anneesAnciennete,
      moisEntiersDeService: dto.moisEntiersDeService,
      moinsDeDixHuitAns: dto.moinsDeDixHuitAns ?? false,
      initiative: dto.initiative as InitiativeRupture,
      motif: dto.motif as MotifRupture,
      delegueSyndical: dto.delegueSyndical,
      remunerationJournaliereFc: dto.remunerationJournaliereFc ?? null,
      arrieresFc: dto.arrieresFc ?? null,
      moyenneDouzeMoisFc: dto.moyenneDouzeMoisFc ?? null,
      gratificationFc: dto.gratificationFc ?? null,
    });
  }

  /** Le nombre de renouvellements qui MÈNENT à ce contrat, celui-ci compris. */
  private longueurChaineRenouvellement(
    contrats: Array<{ id: string; renouvelleDeId: string | null }>,
    id: string,
  ): number {
    const parId = new Map(contrats.map((c) => [c.id, c]));
    let n = 0;
    let courant = parId.get(id);
    // La chaîne est bornée par le nombre de contrats · une boucle
    // impossible en base (le lien est unique) ne doit pas pouvoir pendre ici.
    while (courant?.renouvelleDeId && n <= contrats.length) {
      n += 1;
      courant = parId.get(courant.renouvelleDeId);
    }
    return n;
  }

  /**
   * L'EFFECTIF À UNE DATE, et la part de main-d'œuvre nationale.
   *
   * ELLE EST PROPOSÉE, JAMAIS SUBSTITUÉE. `AccordCadrePlan.partMainOeuvreLocale`
   * reste une valeur SAISIE, avec sa source et sa date · c'est la règle posée
   * quand ce champ a été créé, et le registre ne la renverse pas. Ce que le
   * registre apporte est une PROPOSITION chiffrée, avec sa source nommée
   * (« le registre du personnel au JJ/MM/AAAA »), que le dossier confirme.
   *
   * POURQUOI NE PAS LA SUBSTITUER. Un registre incomplet donnerait une part
   * fausse d'apparence calculée, sur un engagement d'accord-cadre dont le
   * manquement se sanctionne. Une source saisie et assumée vaut mieux qu'un
   * calcul qui ne sait pas ce qu'il ignore.
   */
  async effectif(tenantId: string, ala: Date) {
    const contrats = await this.prisma.contratTravail.findMany({
      where: {
        tenantId,
        dateEntreeEnVigueur: { lte: ala },
        OR: [{ dateFin: null }, { dateFin: { gte: ala } }],
      },
      select: {
        salarieId: true,
        type: true,
        salarie: { select: { sexe: true, nationalite: true } },
      },
    });

    // UN SALARIÉ, PAS UN CONTRAT. Deux contrats simultanés pour la même
    // personne (rare, mais possible) ne font pas deux personnes à l'effectif.
    const parSalarie = new Map<string, (typeof contrats)[number]>();
    for (const c of contrats) if (!parSalarie.has(c.salarieId)) parSalarie.set(c.salarieId, c);
    const uniques = [...parSalarie.values()];

    const nationalite = (n: string | null) => (n ?? '').trim().toLowerCase();
    const estCongolaise = (n: string | null) =>
      ['congolaise', 'congolais', 'rdc', 'rd congo'].includes(nationalite(n));

    const nationaux = uniques.filter((c) => estCongolaise(c.salarie.nationalite)).length;
    const sansNationalite = uniques.filter((c) => nationalite(c.salarie.nationalite) === '').length;

    return {
      ala,
      effectif: uniques.length,
      hommes: uniques.filter((c) => c.salarie.sexe === 'MASCULIN').length,
      femmes: uniques.filter((c) => c.salarie.sexe === 'FEMININ').length,
      permanents: uniques.filter((c) => c.type === TypeContratTravail.DUREE_INDETERMINEE).length,
      nationaux,
      sansNationalite,
      /**
       * NULLE TANT QU'UNE SEULE NATIONALITÉ MANQUE. Une part calculée sur un
       * registre incomplet est un chiffre faux d'apparence exacte, et c'est
       * précisément l'engagement de l'art. 37, point 4 de la loi n° 004/2001
       * (60 % de main-d'œuvre locale) qu'elle servirait.
       */
      partMainOeuvreNationale:
        uniques.length === 0 || sansNationalite > 0 ? null : (nationaux / uniques.length) * 100,
      source: `Registre du personnel au ${ala.toISOString().slice(0, 10)}`,
      reserve:
        sansNationalite > 0
          ? `${sansNationalite} salarié(s) de l'effectif n'ont pas de nationalité au registre. La part de main-d'œuvre nationale n'est pas calculée : un pourcentage tiré d'un registre incomplet serait faux sous une apparence de calcul, et c'est l'engagement des 60 % de l'article 37, point 4 de la loi n° 004/2001 qu'il servirait.`
          : null,
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // P8 · LE BULLETIN DE PAIE ÉMIS. Règles et textes dans `bulletin-paie.ts`.
  // ──────────────────────────────────────────────────────────────────────

  /**
   * ÉMETTRE, c'est rejouer la simulation CÔTÉ SERVEUR et figer ce qu'elle
   * rend. Le client n'envoie que ce qui a été saisi, jamais un montant
   * calculé · un bulletin qui recopierait un net venu de l'écran porterait le
   * chiffre que le navigateur a bien voulu envoyer.
   */
  async emettreBulletin(
    tenantId: string,
    userId: string,
    salarieId: string,
    dto: SimulationPaieDto,
    maintenant: Date = new Date(),
  ) {
    if (!moisValide(dto.moisDePaie)) {
      throw new BadRequestException('Mois de paie illisible · la forme attendue est AAAA-MM.');
    }
    const salarie = await this.prisma.salarie.findFirst({
      where: { id: salarieId, tenantId },
      select: {
        id: true,
        nom: true,
        postNom: true,
        prenoms: true,
        matricule: true,
        numeroAffiliationCnss: true,
        contrats: {
          select: {
            id: true,
            dateEntreeEnVigueur: true,
            dateFin: true,
            natureTravail: true,
            categorieProfessionnelle: true,
          },
        },
      },
    });
    if (!salarie) throw new NotFoundException('Salarié introuvable dans ce dossier.');

    const contrat = contratCouvrantLeMois(salarie.contrats, dto.moisDePaie);
    if (!contrat) {
      throw new BadRequestException(
        `Aucun contrat de ce salarié n'est en cours en ${dto.moisDePaie} · la paie exécute un contrat, et le bulletin doit dire lequel.`,
      );
    }

    // Un salaire en dollars se convertit au cours du JOUR D'ÉMISSION · le
    // bulletin fige ce cours (calcul.conversion), et ne se recalcule plus.
    // Le bulletin FIGE la saisie RELUE · la nature des rubriques et les
    // retenues d'avance telles que le registre les donne, jamais telles que
    // le navigateur les a envoyées.
    const { dto: saisie } = await this.resoudreSaisie(tenantId, salarieId, dto);
    const simulation = await this.simulerPaie(tenantId, salarieId, saisie, maintenant);
    const motifs = motifsRefusEmission(simulation);
    if (motifs.length > 0) {
      throw new BadRequestException({
        message: `Bulletin non émis · ${motifs.length} montant(s) non calculé(s). ${TEXTE_ARTICLE_103}`,
        motifs,
      });
    }

    const creer = () =>
      this.prisma.$transaction(async (tx) => {
        const actif = await tx.bulletinPaie.findFirst({
          where: { tenantId, salarieId, moisDePaie: dto.moisDePaie, statut: StatutBulletinPaie.EMIS },
          select: { numero: true },
        });
        if (actif) {
          throw new BadRequestException(
            `Le bulletin n° ${actif.numero} est déjà émis pour ce salarié en ${dto.moisDePaie}. Annulez-le d'abord s'il est faux. ${LIMITE_UN_BULLETIN_PAR_MOIS}`,
          );
        }
        const dernier = await tx.bulletinPaie.aggregate({ where: { tenantId }, _max: { numero: true } });
        const cree = await tx.bulletinPaie.create({
          data: {
            tenantId,
            salarieId,
            contratId: contrat.id,
            numero: (dernier._max.numero ?? 0) + 1,
            moisDePaie: dto.moisDePaie,
            nomComplet: nomCompletMajuscules(salarie),
            matricule: salarie.matricule,
            emploi: contrat.natureTravail,
            categorieProfessionnelle: contrat.categorieProfessionnelle,
            numeroAffiliationCnss: salarie.numeroAffiliationCnss,
            totalVerseFc: simulation.net.totalVerseFc,
            assietteSocialeFc: simulation.assiettes.assietteSocialeFc ?? 0,
            cotisationsTravailleurFc: simulation.cotisations.totalTravailleurFc,
            cotisationsEmployeurFc: simulation.cotisations.totalEmployeurFc,
            irppFc: simulation.retenue?.retenueFc ?? 0,
            netAPayerFc: simulation.net.netAPayerFc ?? 0,
            entree: JSON.parse(JSON.stringify(saisie)) as Prisma.InputJsonValue,
            calcul: JSON.parse(JSON.stringify(simulation)) as Prisma.InputJsonValue,
            emisPar: userId,
          },
        });
        // Les retenues d'avance, RELUES DANS LA TRANSACTION · deux bulletins
        // émis en même temps sur la même avance la solderaient deux fois.
        for (const r of simulation.retenuesAvances) {
          const lignes = await tx.retenueAvanceBulletin.findMany({
            where: { tenantId, avanceId: r.avanceId },
            select: { montantFc: true, bulletin: { select: { statut: true } } },
          });
          const avance = await tx.avanceSalaire.findFirstOrThrow({ where: { id: r.avanceId, tenantId }, select: { montantFc: true } });
          const solde = soldeAvance(
            Number(avance.montantFc),
            lignes.map((x) => ({ montantFc: Number(x.montantFc), bulletinAnnule: x.bulletin.statut !== StatutBulletinPaie.EMIS })),
          );
          const refus = motifRefusRetenue(r.montantFc, solde, r.libelle);
          if (refus) throw new BadRequestException(refus);
          await tx.retenueAvanceBulletin.create({
            data: { tenantId, avanceId: r.avanceId, bulletinId: cree.id, montantFc: r.montantFc },
          });
        }
        return cree;
      });

    // DEUX ÉMISSIONS SIMULTANÉES prennent le même « dernier numéro ». L'index
    // unique (tenantId, numero) refuse la seconde · on la rejoue une fois, sur
    // le numéro suivant, plutôt que de laisser l'utilisateur recommencer.
    let cree;
    try {
      cree = await creer();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        try {
          cree = await creer();
        } catch (e2) {
          if (e2 instanceof Prisma.PrismaClientKnownRequestError && e2.code === 'P2002') {
            throw new ConflictException('Deux bulletins ont été émis au même instant · réessayez.');
          }
          throw e2;
        }
      } else {
        throw e;
      }
    }
    return this.lireBulletin(tenantId, cree.id);
  }

  /**
   * Les bulletins d'un mois, ou les derniers émis. BORNÉ · aucune route ne
   * rend une collection sans borne (§ 8 bis), et la liste le DIT quand elle
   * est tronquée. Les totaux ne comptent que les bulletins ÉMIS : un bulletin
   * annulé n'a rien payé.
   */
  async listerBulletins(tenantId: string, moisDePaie?: string) {
    if (moisDePaie !== undefined && !moisValide(moisDePaie)) {
      throw new BadRequestException('Mois de paie illisible · la forme attendue est AAAA-MM.');
    }
    const PLAFOND = 500;
    // `undefined` n'est pas un filtre pour Prisma · sans mois, tout le dossier.
    // La borne `tenantId` est écrite DANS chaque appel, où le balayage du
    // cloisonnement la lit.
    const [lignes, total, sommes] = await Promise.all([
      this.prisma.bulletinPaie.findMany({
        where: { tenantId, moisDePaie },
        orderBy: { numero: 'desc' },
        take: PLAFOND,
        select: {
          id: true,
          numero: true,
          moisDePaie: true,
          statut: true,
          nomComplet: true,
          matricule: true,
          salarieId: true,
          totalVerseFc: true,
          irppFc: true,
          netAPayerFc: true,
          emisLe: true,
          remisLe: true,
          annuleLe: true,
        },
      }),
      this.prisma.bulletinPaie.count({ where: { tenantId, moisDePaie } }),
      this.prisma.bulletinPaie.aggregate({
        where: { tenantId, moisDePaie, statut: StatutBulletinPaie.EMIS },
        _sum: {
          totalVerseFc: true,
          cotisationsTravailleurFc: true,
          cotisationsEmployeurFc: true,
          irppFc: true,
          netAPayerFc: true,
        },
        _count: true,
      }),
    ]);
    const n = (d: Prisma.Decimal | null) => (d === null ? 0 : Number(d));
    return {
      bulletins: lignes.map((b) => ({
        ...b,
        totalVerseFc: Number(b.totalVerseFc),
        irppFc: Number(b.irppFc),
        netAPayerFc: Number(b.netAPayerFc),
      })),
      total,
      tronque: total > lignes.length,
      totauxEmis: {
        nombre: sommes._count,
        totalVerseFc: n(sommes._sum.totalVerseFc),
        cotisationsTravailleurFc: n(sommes._sum.cotisationsTravailleurFc),
        cotisationsEmployeurFc: n(sommes._sum.cotisationsEmployeurFc),
        irppFc: n(sommes._sum.irppFc),
        netAPayerFc: n(sommes._sum.netAPayerFc),
      },
      textes: { numerotation: TEXTE_NUMEROTATION, inalterabilite: TEXTE_INALTERABILITE, article103: TEXTE_ARTICLE_103 },
    };
  }

  async lireBulletin(tenantId: string, id: string) {
    const b = await this.prisma.bulletinPaie.findFirst({ where: { id, tenantId } });
    if (!b) throw new NotFoundException('Bulletin introuvable dans ce dossier.');
    return {
      ...b,
      totalVerseFc: Number(b.totalVerseFc),
      assietteSocialeFc: Number(b.assietteSocialeFc),
      cotisationsTravailleurFc: Number(b.cotisationsTravailleurFc),
      cotisationsEmployeurFc: Number(b.cotisationsEmployeurFc),
      irppFc: Number(b.irppFc),
      netAPayerFc: Number(b.netAPayerFc),
      reserves: [TEXTE_ARTICLE_103, TEXTE_INALTERABILITE, RESERVE_MODELE],
    };
  }

  /**
   * ANNULER, jamais modifier ni supprimer (art. 4 de l'arrêté de 2008). La
   * ligne reste, avec son numéro, son motif, son auteur et sa date · c'est ce
   * qui permet de dire, six mois plus tard, pourquoi le travailleur a reçu
   * deux bulletins pour le même mois.
   */
  async annulerBulletin(tenantId: string, userId: string, id: string, motif: string) {
    const texte = (motif ?? '').trim();
    if (texte.length < 5) {
      throw new BadRequestException("Le motif d'annulation est obligatoire · il est la seule trace de la correction.");
    }
    const b = await this.prisma.bulletinPaie.findFirst({
      where: { id, tenantId },
      select: { statut: true, ecritureId: true },
    });
    if (!b) throw new NotFoundException('Bulletin introuvable dans ce dossier.');
    if (b.statut !== StatutBulletinPaie.EMIS) throw new BadRequestException('Ce bulletin est déjà annulé.');
    // P9 · UN BULLETIN PASSÉ AU BROUILLARD NE S'ANNULE PAS SEUL. L'écriture du
    // mois porterait encore son salaire, et rien ne le signalerait. On défait
    // d'abord la passation, qui se refait sans lui. Passé et VALIDÉ, il
    // s'annule, et la proposition du mois le signale comme salaire encore au
    // journal, à corriger par une écriture en négatif (AUDCIF art. 20).
    if (b.ecritureId) {
      const ecriture = await this.prisma.ecriture.findFirst({
        where: { id: b.ecritureId, tenantId },
        select: { statut: true, numeroPiece: true },
      });
      if (ecriture && ecriture.statut !== StatutEcriture.VALIDEE) {
        throw new BadRequestException(
          `Ce bulletin est passé dans l'écriture de paie n° ${ecriture.numeroPiece ?? ''}, encore au brouillard. ` +
            "Annulez d'abord la comptabilisation du mois, puis le bulletin, puis repassez la paie.",
        );
      }
    }
    await this.prisma.bulletinPaie.update({
      where: { id },
      data: { statut: StatutBulletinPaie.ANNULE, annuleLe: new Date(), annulePar: userId, motifAnnulation: texte },
    });
    return this.lireBulletin(tenantId, id);
  }

  /**
   * DÉCLARER LA REMISE au travailleur (art. 103). Une fois, jamais corrigée ·
   * une date de remise qui se déplace après coup est exactement ce qu'un
   * contentieux sur l'article 103 viendrait chercher.
   */
  async declarerRemise(tenantId: string, id: string, remisLe: string) {
    const b = await this.prisma.bulletinPaie.findFirst({
      where: { id, tenantId },
      select: { statut: true, remisLe: true, emisLe: true },
    });
    if (!b) throw new NotFoundException('Bulletin introuvable dans ce dossier.');
    if (b.statut !== StatutBulletinPaie.EMIS) throw new BadRequestException("Un bulletin annulé ne se remet pas.");
    if (b.remisLe) throw new BadRequestException('La remise de ce bulletin est déjà déclarée · elle ne se corrige pas.');
    const date = new Date(remisLe);
    const refus = motifRefusRemise(date, b.emisLe, new Date());
    if (refus) throw new BadRequestException(refus);
    await this.prisma.bulletinPaie.update({ where: { id }, data: { remisLe: date } });
    return this.lireBulletin(tenantId, id);
  }
}

export type Confrontation = Awaited<ReturnType<PersonnelService['confronter']>>;
export type Effectif = Awaited<ReturnType<PersonnelService['effectif']>>;
export type SimulationPaie = Awaited<ReturnType<PersonnelService['simulerPaie']>>;
export type DecompteFinal = ReturnType<PersonnelService['decompteFinal']>;
export type LivreDePaie = ReturnType<PersonnelService['livreDePaie']>;
export type BulletinPaieLu = Awaited<ReturnType<PersonnelService['lireBulletin']>>;
