import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TypeCompteDetailTotal } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { moisCouverts } from '../etats-financiers/comparabilite-exercices';
import { SimulationBudgetaireDto } from './dto/simulation.dto';
import {
  montantsParRacine,
  motifRefusSimulation,
  prorataTemporis,
  simuler,
  type Hypotheses,
} from './simulateur-budgetaire';

/**
 * SIMULATIONS BUDGÉTAIRES · voir simulateur-budgetaire.ts pour les règles.
 * Les montants ne sont jamais stockés · chaque lecture relit la balance.
 */
@Injectable()
export class SimulationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritures: EcritureService,
  ) {}

  lister(tenantId: string) {
    return this.prisma.simulationBudgetaire.findMany({
      where: { tenantId },
      orderBy: { nom: 'asc' },
      include: {
        exerciceReference: { select: { dateDebut: true, dateFin: true } },
        exerciceCible: { select: { dateDebut: true, dateFin: true } },
      },
    });
  }

  /** La référence précède la cible · simuler une année sur elle-même ne compare rien. */
  private async verifier(tenantId: string, dto: SimulationBudgetaireDto) {
    const refus = motifRefusSimulation(
      { croissanceProduitsPct: dto.croissanceProduitsPct, variations: dto.variations },
      { orangePct: dto.seuilOrangePct, rougePct: dto.seuilRougePct },
    );
    if (refus) throw new BadRequestException(refus);
    const [ref, cible] = await Promise.all([
      this.prisma.exercice.findFirst({ where: { id: dto.exerciceReferenceId, tenantId } }),
      this.prisma.exercice.findFirst({ where: { id: dto.exerciceCibleId, tenantId } }),
    ]);
    if (!ref || !cible) throw new NotFoundException('Exercice introuvable dans ce dossier.');
    if (cible.dateDebut <= ref.dateDebut) {
      throw new BadRequestException("L'exercice simulé suit l'exercice de référence · simuler une année sur elle-même ou sur une année passée ne compare rien.");
    }
  }

  private donnees(dto: SimulationBudgetaireDto, tenantId: string, auteur: string) {
    return {
      tenantId,
      nom: dto.nom.trim(),
      exerciceReferenceId: dto.exerciceReferenceId,
      exerciceCibleId: dto.exerciceCibleId,
      hypotheses: { croissanceProduitsPct: dto.croissanceProduitsPct, variations: dto.variations } as Prisma.InputJsonValue,
      seuilOrangePct: dto.seuilOrangePct,
      seuilRougePct: dto.seuilRougePct,
      creePar: auteur,
    };
  }

  private conflit(e: unknown, nom: string): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ConflictException(`Une simulation « ${nom.trim()} » existe déjà.`);
    }
    throw e;
  }

  async creer(tenantId: string, auteur: string, dto: SimulationBudgetaireDto) {
    await this.verifier(tenantId, dto);
    try {
      return await this.prisma.simulationBudgetaire.create({ data: this.donnees(dto, tenantId, auteur) });
    } catch (e) {
      this.conflit(e, dto.nom);
    }
  }

  async modifier(tenantId: string, auteur: string, id: string, dto: SimulationBudgetaireDto) {
    const s = await this.prisma.simulationBudgetaire.findFirst({ where: { id, tenantId } });
    if (!s) throw new NotFoundException('Simulation introuvable dans ce dossier.');
    await this.verifier(tenantId, dto);
    try {
      return await this.prisma.simulationBudgetaire.update({ where: { id: s.id }, data: this.donnees(dto, tenantId, auteur) });
    } catch (e) {
      this.conflit(e, dto.nom);
    }
  }

  async supprimer(tenantId: string, id: string) {
    const s = await this.prisma.simulationBudgetaire.findFirst({ where: { id, tenantId } });
    if (!s) throw new NotFoundException('Simulation introuvable dans ce dossier.');
    await this.prisma.simulationBudgetaire.delete({ where: { id: s.id } });
    return { supprime: true };
  }

  /**
   * LE CALCUL · réalisé de référence et réalisé de la cible, lus sur la MÊME
   * balance que la balance générale (mouvements, clôture exclue), brouillard
   * compris ou non selon la demande. La cible est arrêtée à la date donnée,
   * bornée à son exercice.
   */
  async calculer(tenantId: string, id: string, options: { arreteAu?: string; inclureBrouillard?: boolean } = {}) {
    const s = await this.prisma.simulationBudgetaire.findFirst({
      where: { id, tenantId },
      include: { exerciceReference: true, exerciceCible: true },
    });
    if (!s) throw new NotFoundException('Simulation introuvable dans ce dossier.');
    const cible = s.exerciceCible;
    let arrete = options.arreteAu ? new Date(`${options.arreteAu}T23:59:59.999Z`) : new Date();
    if (Number.isNaN(arrete.getTime())) throw new BadRequestException("La date d'arrêté est une date (AAAA-MM-JJ).");
    if (arrete > cible.dateFin) arrete = cible.dateFin;
    const avantDebut = arrete < cible.dateDebut;
    const brouillard = options.inclureBrouillard ?? true;

    const [balRef, balCible, totaux] = await Promise.all([
      this.ecritures.balance(tenantId, s.exerciceReferenceId, brouillard),
      avantDebut ? Promise.resolve(null) : this.ecritures.balance(tenantId, s.exerciceCibleId, brouillard, arrete),
      this.prisma.compte.findMany({
        where: { tenantId, typeCompte: TypeCompteDetailTotal.TOTAL, numero: { in: [...'0123456789'].flatMap((d) => [`6${d}`, `7${d}`]) } },
        select: { numero: true, intitule: true },
      }),
    ]);
    const prorata = avantDebut ? 0 : cible.statut === 'CLOTURE' ? 1 : prorataTemporis(cible.dateDebut, cible.dateFin, arrete);
    const resultat = simuler({
      reference: montantsParRacine(balRef.lignes),
      realise: balCible ? montantsParRacine(balCible.lignes) : null,
      intitules: new Map(totaux.map((c) => [c.numero, c.intitule])),
      hypotheses: s.hypotheses as unknown as Hypotheses,
      seuils: { orangePct: Number(s.seuilOrangePct), rougePct: Number(s.seuilRougePct) },
      prorata,
    });

    // La durée compte · un exercice de référence de neuf mois simulerait une
    // année entière au rythme de neuf. Signalé, jamais corrigé d'office (même
    // parti que la comparabilité de la colonne N-1).
    const moisRef = moisCouverts(s.exerciceReference);
    const moisCible = moisCouverts(cible);
    const reserves: string[] = [];
    if (moisRef !== moisCible) {
      reserves.push(
        `L'exercice de référence couvre ${moisRef} mois et l'exercice simulé ${moisCible} · le prévu reprend le réalisé tel quel, sans l'adapter à la durée. Ajustez les taux en conséquence.`,
      );
    }
    return {
      simulation: { id: s.id, nom: s.nom, hypotheses: s.hypotheses, seuils: { orangePct: Number(s.seuilOrangePct), rougePct: Number(s.seuilRougePct) } },
      arreteAu: avantDebut ? null : arrete.toISOString().slice(0, 10),
      prorata,
      reserves,
      ...resultat,
    };
  }
}
