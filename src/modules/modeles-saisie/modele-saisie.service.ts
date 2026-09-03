import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SensModeleSaisie } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { CreerModeleSaisieDto, LigneModeleSaisieDto, ModifierModeleSaisieDto } from './dto/modele-saisie.dto';

/**
 * MODÈLES DE SAISIE · les « opérations courantes » d'un journal.
 *
 * Sage pose, dans la fenêtre du journal, une barre « Appeler un modèle ·
 * [modèle] · Appliquer » qui remplit la grille d'un squelette nommé : les
 * comptes et les libellés sont là, les montants restent au comptable.
 *
 * Ce que ce service change par rapport aux écritures-types déjà présentes :
 * celles-ci sont ÉCRITES DANS LE CODE et les mêmes pour tous les dossiers.
 * Une ONG qui passe chaque mois la même écriture de subvention bailleur ne
 * pouvait pas se la fabriquer. Ici, le modèle est une donnée du dossier,
 * rattachée à un journal.
 */
@Injectable()
export class ModeleSaisieService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Les modèles proposés dans un journal donné · les siens PLUS ceux qui ne
   * visent aucun journal en particulier.
   *
   * Sans `journalId`, la liste complète · c'est l'écran de gestion.
   */
  async lister(tenantId: string, journalId?: string, inclureInactifs = false) {
    const modeles = await this.prisma.modeleSaisie.findMany({
      where: {
        tenantId,
        ...(inclureInactifs ? {} : { estActif: true }),
        ...(journalId ? { OR: [{ journalId }, { journalId: null }] } : {}),
      },
      include: {
        journal: { select: { id: true, code: true, intitule: true } },
        lignes: {
          orderBy: { ordre: 'asc' },
          include: { compte: { select: { id: true, numero: true, intitule: true } } },
        },
      },
      orderBy: { intitule: 'asc' },
    });

    return modeles.map((m) => ({
      id: m.id,
      intitule: m.intitule,
      journalId: m.journalId,
      journalCode: m.journal?.code ?? null,
      journalIntitule: m.journal?.intitule ?? null,
      estActif: m.estActif,
      lignes: m.lignes.map((l) => ({
        ordre: l.ordre,
        compteId: l.compteId,
        compteNumero: l.compte.numero,
        compteIntitule: l.compte.intitule,
        sens: l.sens,
        libelle: l.libelle,
        montant: l.montant === null ? null : Number(l.montant),
      })),
    }));
  }

  async creer(tenantId: string, userId: string, dto: CreerModeleSaisieDto) {
    await this.verifierLignes(tenantId, dto.lignes);
    if (dto.journalId) await this.verifierJournal(tenantId, dto.journalId);

    const modele = await this.prisma.modeleSaisie.create({
      data: {
        tenantId,
        intitule: dto.intitule.trim(),
        journalId: dto.journalId ?? null,
        createdBy: userId,
        lignes: { create: dto.lignes.map((l, ordre) => this.versLigne(l, ordre)) },
      },
      select: { id: true },
    });
    return modele;
  }

  async modifier(tenantId: string, modeleId: string, dto: ModifierModeleSaisieDto) {
    const existant = await this.prisma.modeleSaisie.findFirst({ where: { id: modeleId, tenantId } });
    if (!existant) throw new NotFoundException('Modèle de saisie introuvable');
    if (dto.lignes) await this.verifierLignes(tenantId, dto.lignes);
    if (dto.journalId) await this.verifierJournal(tenantId, dto.journalId);

    // Les lignes sont REMPLACÉES en bloc, dans une transaction · les
    // modifier une à une laisserait, entre deux requêtes, un modèle
    // déséquilibré qu'un autre utilisateur pourrait appliquer.
    return this.prisma.$transaction(async (tx) => {
      if (dto.lignes) {
        await tx.ligneModeleSaisie.deleteMany({ where: { modeleId } });
        await tx.ligneModeleSaisie.createMany({
          data: dto.lignes.map((l, ordre) => ({ modeleId, ...this.versLigne(l, ordre) })),
        });
      }
      return tx.modeleSaisie.update({
        where: { id: modeleId },
        data: {
          ...(dto.intitule !== undefined ? { intitule: dto.intitule.trim() } : {}),
          ...(dto.journalId !== undefined ? { journalId: dto.journalId } : {}),
          ...(dto.estActif !== undefined ? { estActif: dto.estActif } : {}),
        },
        select: { id: true },
      });
    });
  }

  async supprimer(tenantId: string, modeleId: string) {
    const existant = await this.prisma.modeleSaisie.findFirst({ where: { id: modeleId, tenantId } });
    if (!existant) throw new NotFoundException('Modèle de saisie introuvable');
    // Suppression franche · un modèle n'est pas une écriture, rien ne s'y
    // rattache et le supprimer ne défait aucun acte comptable. Pour le
    // retirer des listes sans le perdre, `estActif` est là.
    await this.prisma.modeleSaisie.delete({ where: { id: modeleId } });
    return { supprime: true };
  }

  private versLigne(l: LigneModeleSaisieDto, ordre: number): Prisma.LigneModeleSaisieCreateWithoutModeleInput &
    Prisma.LigneModeleSaisieUncheckedCreateWithoutModeleInput {
    return {
      ordre,
      compteId: l.compteId,
      sens: l.sens,
      libelle: l.libelle?.trim() || null,
      montant: l.montant === undefined ? null : new Prisma.Decimal(l.montant),
    } as never;
  }

  private async verifierJournal(tenantId: string, journalId: string) {
    const journal = await this.prisma.journal.findFirst({ where: { id: journalId, tenantId } });
    if (!journal) throw new BadRequestException('Journal introuvable dans ce dossier');
  }

  /**
   * Les comptes existent, appartiennent au dossier, et sont IMPUTABLES.
   *
   * Un compte TOTAL est un en-tête de division du plan (CLAUDE.md §7) : il ne
   * reçoit jamais d'écriture. Un modèle qui en poserait un ferait échouer
   * l'enregistrement de la pièce APRÈS la saisie des montants, c'est-à-dire
   * au pire moment.
   *
   * Le modèle doit aussi porter au moins un débit ET un crédit · un squelette
   * qui ne propose qu'un sens laisse la grille déséquilibrée à coup sûr.
   */
  private async verifierLignes(tenantId: string, lignes: LigneModeleSaisieDto[]) {
    const ids = [...new Set(lignes.map((l) => l.compteId))];
    const comptes = await this.prisma.compte.findMany({
      where: { id: { in: ids }, tenantId },
      select: { id: true, numero: true, typeCompte: true },
    });
    const manquants = ids.filter((id) => !comptes.some((c) => c.id === id));
    if (manquants.length) throw new BadRequestException('Un compte du modèle est introuvable dans ce dossier');

    const totaux = comptes.filter((c) => c.typeCompte === 'TOTAL').map((c) => c.numero);
    if (totaux.length) {
      throw new BadRequestException(
        `Un modèle ne peut pas viser un compte de totalisation : ${totaux.join(', ')}. ` +
          "Choisissez un compte d'imputation.",
      );
    }

    const aDebit = lignes.some((l) => l.sens === SensModeleSaisie.DEBIT);
    const aCredit = lignes.some((l) => l.sens === SensModeleSaisie.CREDIT);
    if (!aDebit || !aCredit) {
      throw new BadRequestException('Un modèle doit poser au moins un débit et un crédit.');
    }
  }
}
