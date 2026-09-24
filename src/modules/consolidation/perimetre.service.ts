import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import {
  analyserPerimetre,
  EntitePerimetre,
  LIBELLE_MOTIF_EXCLUSION,
  LienParticipation,
  SEUIL_DISPENSE_FCFA,
  verdictObligation,
} from './perimetre-consolidation';
import {
  EntitePerimetreDto,
  FaitsConsolidationDto,
  LienParticipationDto,
  ModifierEntitePerimetreDto,
} from './dto/perimetre.dto';

type LienStocke = { id: string; detentriceId: string | null; detenueId: string; pctDroitsVote: unknown; pctCapital: unknown };

/**
 * PÉRIMÈTRE DE CONSOLIDATION · la persistance autour du moteur pur. Le service
 * ne calcule rien lui-même : il lit ce que le cabinet a déclaré, le passe à
 * `analyserPerimetre` et à `verdictObligation`, et rend les deux.
 *
 * LA CONSOLIDANTE EST LE DOSSIER, jamais une ligne de table · son identifiant
 * dans le moteur est celui du dossier, et une participation dont la détentrice
 * est NULL est une participation directe de la consolidante. Deux consolidantes
 * dans un même périmètre est un refus du moteur (art. 75) qu'aucune saisie ne
 * peut donc provoquer.
 *
 * TOUTE ÉCRITURE EST JOUÉE PAR LE MOTEUR AVANT D'ÊTRE ENREGISTRÉE. Une
 * participation croisée entre filiales, ou un total de droits de vote au-delà de
 * 100 %, serait sinon accepté en base et ferait tomber la lecture du périmètre
 * entier au prochain appel, sans que personne sache quelle saisie l'a cassé.
 */
@Injectable()
export class PerimetreService {
  constructor(private readonly prisma: PrismaService) {}

  private async exercice(tenantId: string, exerciceId: string) {
    const ex = await this.prisma.exercice.findFirst({
      where: { id: exerciceId, tenantId },
      select: { id: true, dateDebut: true, dateFin: true },
    });
    if (!ex) throw new NotFoundException('Exercice introuvable dans ce dossier.');
    return ex;
  }

  private async charger(tenantId: string, exerciceId: string) {
    const [tenant, ex, entites, liens, faits] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { id: true, nom: true } }),
      this.exercice(tenantId, exerciceId),
      this.prisma.entitePerimetreConsolidation.findMany({ where: { tenantId, exerciceId }, orderBy: { nom: 'asc' } }),
      this.prisma.lienParticipationConsolidation.findMany({ where: { tenantId, exerciceId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.faitsConsolidationExercice.findFirst({ where: { tenantId, exerciceId } }),
    ]);
    return { tenant, ex, entites, liens, faits };
  }

  private versMoteur(
    tenant: { id: string; nom: string },
    dateFin: Date,
    entites: Array<{
      id: string;
      nom: string;
      designationMajoriteDeuxExercices: boolean;
      aucunAutreAssocieSuperieur: boolean;
      controleContractuel: boolean;
      accordControleConjoint: boolean;
      influenceNotableDeclaree: boolean;
      motifExclusion: string | null;
      justificationExclusion: string | null;
      dateCloture: Date | null;
    }>,
    liens: LienStocke[],
  ): { entites: EntitePerimetre[]; liens: LienParticipation[] } {
    return {
      entites: [
        { id: tenant.id, nom: tenant.nom, estConsolidante: true, dateCloture: dateFin },
        ...entites.map((e) => ({
          id: e.id,
          nom: e.nom,
          estConsolidante: false,
          designationMajoriteDeuxExercices: e.designationMajoriteDeuxExercices,
          aucunAutreAssocieSuperieur: e.aucunAutreAssocieSuperieur,
          controleContractuel: e.controleContractuel,
          accordControleConjoint: e.accordControleConjoint,
          influenceNotableDeclaree: e.influenceNotableDeclaree,
          exclusion: e.motifExclusion
            ? { motif: e.motifExclusion as keyof typeof LIBELLE_MOTIF_EXCLUSION, justification: e.justificationExclusion ?? '' }
            : null,
          dateCloture: e.dateCloture,
        })),
      ],
      liens: liens.map((l) => ({
        detentriceId: l.detentriceId ?? tenant.id,
        detenueId: l.detenueId,
        pctDroitsVote: Number(l.pctDroitsVote),
        pctCapital: Number(l.pctCapital),
      })),
    };
  }

  /** Joue le moteur et rend son refus en 400, avec son message · jamais une 500 muette. */
  private jouer(entites: EntitePerimetre[], liens: LienParticipation[]) {
    try {
      return analyserPerimetre(entites, liens);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  /**
   * Un total au-delà de 100 % sur une même détenue n'est pas une saisie
   * approximative, c'est une impossibilité · le pourcentage de contrôle
   * dépasserait 100 et l'intérêt des minoritaires deviendrait négatif en
   * tranche 2, sur des états qui boucleraient quand même.
   */
  private verifierTotaux(liens: LienParticipation[], nomDe: (id: string) => string) {
    const parDetenue = new Map<string, { vote: number; capital: number }>();
    for (const l of liens) {
      const t = parDetenue.get(l.detenueId) ?? { vote: 0, capital: 0 };
      t.vote += l.pctDroitsVote;
      t.capital += l.pctCapital;
      parDetenue.set(l.detenueId, t);
    }
    for (const [id, t] of parDetenue) {
      if (t.vote > 100.00001 || t.capital > 100.00001) {
        throw new BadRequestException(
          `Les participations saisies sur « ${nomDe(id)} » dépassent 100 % (${t.vote.toFixed(2)} % des droits de vote, ` +
            `${t.capital.toFixed(2)} % du capital).`,
        );
      }
    }
  }

  async etat(tenantId: string, exerciceId: string) {
    const { tenant, ex, entites, liens, faits } = await this.charger(tenantId, exerciceId);
    const moteur = this.versMoteur(tenant, ex.dateFin, entites, liens);
    const resultats = this.jouer(moteur.entites, moteur.liens);
    const obligation = verdictObligation(resultats, {
      sousControleEntiteOhadaConsolidante: faits?.sousControleEntiteOhadaConsolidante,
      siegesDansDeuxRegions: faits?.siegesDansDeuxRegions,
      appelPublicEpargne: faits?.appelPublicEpargne,
      demandeAssociesDixieme: faits?.demandeAssociesDixieme,
      chiffreAffairesN: faits?.chiffreAffairesN == null ? null : Number(faits.chiffreAffairesN),
      chiffreAffairesN1: faits?.chiffreAffairesN1 == null ? null : Number(faits.chiffreAffairesN1),
      seuilEquivalentFc: faits?.seuilEquivalentFc == null ? null : Number(faits.seuilEquivalentFc),
      sourceSeuil: faits?.sourceSeuil ?? null,
    });
    const reciproques = await this.prisma.operationReciproqueConsolidation.findMany({
      where: { tenantId, exerciceId },
      orderBy: { createdAt: 'asc' },
    });
    const resultatsInternes = await this.prisma.resultatInterneConsolidation.findMany({
      where: { tenantId, exerciceId },
      orderBy: { createdAt: 'asc' },
    });
    return {
      consolidante: { id: tenant.id, nom: tenant.nom, dateCloture: ex.dateFin },
      resultatsInternes: resultatsInternes.map((o) => ({ ...o, margeOuverture: Number(o.margeOuverture), margeCloture: Number(o.margeCloture) })),
      reciproques: reciproques.map((o) => ({ ...o, montant: Number(o.montant) })),
      entites,
      liens: liens.map((l) => ({ ...l, pctDroitsVote: Number(l.pctDroitsVote), pctCapital: Number(l.pctCapital) })),
      faits: faits
        ? {
            ...faits,
            chiffreAffairesN: faits.chiffreAffairesN == null ? null : Number(faits.chiffreAffairesN),
            chiffreAffairesN1: faits.chiffreAffairesN1 == null ? null : Number(faits.chiffreAffairesN1),
            seuilEquivalentFc: faits.seuilEquivalentFc == null ? null : Number(faits.seuilEquivalentFc),
          }
        : null,
      resultats,
      obligation,
      motifsExclusion: LIBELLE_MOTIF_EXCLUSION,
      seuilDispenseFcfa: SEUIL_DISPENSE_FCFA,
    };
  }

  /**
   * Art. 96 · « justifiée dans les Notes annexes ». Un motif sans justification
   * est une exclusion que personne n'aura à défendre, et une justification sans
   * motif ne dit pas quelle cause de la liste fermée est invoquée.
   */
  private verifierExclusion(motif: string | null | undefined, justification: string | null | undefined) {
    const aMotif = !!motif;
    const aJustif = !!justification && justification.trim().length > 0;
    if (aMotif !== aJustif) {
      throw new BadRequestException(
        'Une exclusion du périmètre porte un motif de la liste de l’art. 96 ET sa justification, que les Notes annexes reprennent · ' +
          'l’un sans l’autre est refusé.',
      );
    }
  }

  async creerEntite(tenantId: string, dto: EntitePerimetreDto) {
    await this.exercice(tenantId, dto.exerciceId);
    this.verifierExclusion(dto.motifExclusion, dto.justificationExclusion);
    const existe = await this.prisma.entitePerimetreConsolidation.findFirst({
      where: { tenantId, exerciceId: dto.exerciceId, nom: dto.nom.trim() },
      select: { id: true },
    });
    if (existe) throw new BadRequestException(`« ${dto.nom.trim()} » figure déjà au périmètre de cet exercice.`);
    return this.prisma.entitePerimetreConsolidation.create({
      data: {
        tenantId,
        exerciceId: dto.exerciceId,
        nom: dto.nom.trim(),
        designationMajoriteDeuxExercices: dto.designationMajoriteDeuxExercices ?? false,
        aucunAutreAssocieSuperieur: dto.aucunAutreAssocieSuperieur ?? false,
        controleContractuel: dto.controleContractuel ?? false,
        accordControleConjoint: dto.accordControleConjoint ?? false,
        influenceNotableDeclaree: dto.influenceNotableDeclaree ?? false,
        motifExclusion: dto.motifExclusion ?? null,
        justificationExclusion: dto.justificationExclusion?.trim() || null,
        dateCloture: dto.dateCloture ? new Date(dto.dateCloture) : null,
        secteurActivite: dto.secteurActivite?.trim() || null,
      },
    });
  }

  async modifierEntite(tenantId: string, id: string, dto: ModifierEntitePerimetreDto) {
    const actuelle = await this.prisma.entitePerimetreConsolidation.findFirst({ where: { id, tenantId } });
    if (!actuelle) throw new NotFoundException('Entité introuvable dans ce dossier.');
    const motif = dto.motifExclusion !== undefined ? dto.motifExclusion : actuelle.motifExclusion;
    const justif = dto.justificationExclusion !== undefined ? dto.justificationExclusion : actuelle.justificationExclusion;
    this.verifierExclusion(motif, justif);
    return this.prisma.entitePerimetreConsolidation.update({
      where: { id },
      data: {
        nom: dto.nom?.trim(),
        designationMajoriteDeuxExercices: dto.designationMajoriteDeuxExercices,
        aucunAutreAssocieSuperieur: dto.aucunAutreAssocieSuperieur,
        controleContractuel: dto.controleContractuel,
        accordControleConjoint: dto.accordControleConjoint,
        influenceNotableDeclaree: dto.influenceNotableDeclaree,
        motifExclusion: motif ?? null,
        justificationExclusion: justif?.trim() || null,
        dateCloture: dto.dateCloture === undefined ? undefined : dto.dateCloture ? new Date(dto.dateCloture) : null,
        secteurActivite: dto.secteurActivite === undefined ? undefined : dto.secteurActivite?.trim() || null,
      },
    });
  }

  async supprimerEntite(tenantId: string, id: string) {
    const e = await this.prisma.entitePerimetreConsolidation.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!e) throw new NotFoundException('Entité introuvable dans ce dossier.');
    // Ses participations, détenues comme détentrices, partent avec elle (cascade déclarée au schéma).
    await this.prisma.entitePerimetreConsolidation.delete({ where: { id } });
    return { supprime: true };
  }

  async ajouterLien(tenantId: string, dto: LienParticipationDto) {
    const { tenant, ex, entites, liens } = await this.charger(tenantId, dto.exerciceId);
    const detentriceId = dto.detentriceId ?? null;
    const connues = new Set(entites.map((e) => e.id));
    if (!connues.has(dto.detenueId) || (detentriceId !== null && !connues.has(detentriceId))) {
      throw new BadRequestException('Les deux entités de la participation doivent figurer au périmètre de cet exercice.');
    }
    if (detentriceId === dto.detenueId) {
      throw new BadRequestException('Une entité ne se détient pas elle-même.');
    }
    if (liens.some((l) => l.detentriceId === detentriceId && l.detenueId === dto.detenueId)) {
      throw new BadRequestException('Cette participation est déjà saisie · modifiez-la plutôt que d’en ajouter une seconde.');
    }
    const candidat: LienStocke = {
      id: 'nouveau',
      detentriceId,
      detenueId: dto.detenueId,
      pctDroitsVote: dto.pctDroitsVote,
      pctCapital: dto.pctCapital,
    };
    const moteur = this.versMoteur(tenant, ex.dateFin, entites, [...liens, candidat]);
    const nomDe = (id: string) => moteur.entites.find((e) => e.id === id)?.nom ?? id;
    this.verifierTotaux(moteur.liens, nomDe);
    this.jouer(moteur.entites, moteur.liens);
    return this.prisma.lienParticipationConsolidation.create({
      data: {
        tenantId,
        exerciceId: dto.exerciceId,
        detentriceId,
        detenueId: dto.detenueId,
        pctDroitsVote: dto.pctDroitsVote,
        pctCapital: dto.pctCapital,
      },
    });
  }

  async supprimerLien(tenantId: string, id: string) {
    const l = await this.prisma.lienParticipationConsolidation.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!l) throw new NotFoundException('Participation introuvable dans ce dossier.');
    await this.prisma.lienParticipationConsolidation.delete({ where: { id } });
    return { supprime: true };
  }

  /**
   * Art. 95 · un seuil déclaré sans sa source ne vaut pas mieux qu'un seuil
   * inventé · personne ne pourrait dire d'où vient le cours.
   */
  async enregistrerFaits(tenantId: string, dto: FaitsConsolidationDto) {
    await this.exercice(tenantId, dto.exerciceId);
    const existant = await this.prisma.faitsConsolidationExercice.findFirst({
      where: { tenantId, exerciceId: dto.exerciceId },
      select: { id: true, seuilEquivalentFc: true, sourceSeuil: true },
    });
    const seuil = dto.seuilEquivalentFc !== undefined ? dto.seuilEquivalentFc : existant?.seuilEquivalentFc;
    const source = dto.sourceSeuil !== undefined ? dto.sourceSeuil : existant?.sourceSeuil;
    if (seuil != null && !(source && source.trim())) {
      throw new BadRequestException(
        'L’équivalent en francs congolais du seuil de 500 000 000 FCFA se déclare AVEC sa source (texte, cours et date) · ' +
          'aucune source lue ne le fixe (art. 95).',
      );
    }
    const data = {
      sousControleEntiteOhadaConsolidante: dto.sousControleEntiteOhadaConsolidante,
      siegesDansDeuxRegions: dto.siegesDansDeuxRegions,
      appelPublicEpargne: dto.appelPublicEpargne,
      demandeAssociesDixieme: dto.demandeAssociesDixieme,
      chiffreAffairesN: dto.chiffreAffairesN,
      chiffreAffairesN1: dto.chiffreAffairesN1,
      seuilEquivalentFc: dto.seuilEquivalentFc,
      sourceSeuil: dto.sourceSeuil === undefined ? undefined : dto.sourceSeuil?.trim() || null,
    };
    return existant
      ? this.prisma.faitsConsolidationExercice.update({ where: { id: existant.id }, data })
      : this.prisma.faitsConsolidationExercice.create({ data: { tenantId, exerciceId: dto.exerciceId, ...data } });
  }
}
