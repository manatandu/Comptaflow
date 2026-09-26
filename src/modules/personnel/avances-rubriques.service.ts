import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StatutBulletinPaie } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { AvanceSalaireDto, ModifierRubriquePaieDto, RubriquePaieDto } from './dto/personnel.dto';
import { NATURES_DES_RUBRIQUES, motifRefusRubrique } from './rubriques-paie';
import { LITTERA_ARTICLE_112, compteDeLAvance, motifRefusAvance, soldeAvance, type CategoriePret, type TypeAvance } from './avances-salaire';

/**
 * RUBRIQUES DU CABINET ET REGISTRE DES AVANCES · voir rubriques-paie.ts et
 * avances-salaire.ts pour les règles et leurs sources.
 */
@Injectable()
export class AvancesRubriquesService {
  constructor(private readonly prisma: PrismaService) {}

  listerRubriques(tenantId: string) {
    return this.prisma.rubriquePaie
      .findMany({ where: { tenantId }, orderBy: { code: 'asc' } })
      .then((rubriques) => ({ rubriques, naturesPermises: NATURES_DES_RUBRIQUES }));
  }

  async creerRubrique(tenantId: string, dto: RubriquePaieDto) {
    const refus = motifRefusRubrique(dto);
    if (refus) throw new BadRequestException(refus);
    try {
      return await this.prisma.rubriquePaie.create({
        data: { tenantId, code: dto.code.trim().toUpperCase(), libelle: dto.libelle.trim(), nature: dto.nature, fondement: dto.fondement.trim() },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Le code ${dto.code.trim().toUpperCase()} est déjà pris dans ce dossier.`);
      }
      throw e;
    }
  }

  /**
   * LE CODE ET LA NATURE NE CHANGENT PAS · changer la nature d'une rubrique
   * changerait les assiettes et le compte de tous les bulletins à venir sans
   * que personne ne le voie sur un bulletin. Une autre nature, c'est une autre
   * rubrique. Les bulletins déjà émis ne bougent pas de toute façon · ils ont
   * figé la nature relue.
   */
  async modifierRubrique(tenantId: string, id: string, dto: ModifierRubriquePaieDto) {
    const r = await this.prisma.rubriquePaie.findFirst({ where: { id, tenantId } });
    if (!r) throw new NotFoundException('Rubrique introuvable dans ce dossier.');
    const refus = motifRefusRubrique({ code: r.code, nature: r.nature, libelle: dto.libelle ?? r.libelle, fondement: dto.fondement ?? r.fondement });
    if (refus) throw new BadRequestException(refus);
    return this.prisma.rubriquePaie.update({
      where: { id: r.id },
      data: {
        ...(dto.libelle !== undefined ? { libelle: dto.libelle.trim() } : {}),
        ...(dto.fondement !== undefined ? { fondement: dto.fondement.trim() } : {}),
        ...(dto.actif !== undefined ? { actif: dto.actif } : {}),
      },
    });
  }

  /** Le registre, avec le SOLDE calculé et le compte que chaque retenue crédite. */
  async listerAvances(tenantId: string, salarieId?: string) {
    const avances = await this.prisma.avanceSalaire.findMany({
      where: { tenantId, ...(salarieId ? { salarieId } : {}) },
      orderBy: { dateOctroi: 'desc' },
      include: {
        salarie: { select: { nom: true, postNom: true, prenoms: true, matricule: true } },
        retenues: { select: { montantFc: true, bulletin: { select: { numero: true, moisDePaie: true, statut: true } } } },
      },
    });
    return avances.map((a) => {
      const retenues = a.retenues.map((r) => ({
        montantFc: Number(r.montantFc),
        numero: r.bulletin.numero,
        moisDePaie: r.bulletin.moisDePaie,
        bulletinAnnule: r.bulletin.statut !== StatutBulletinPaie.EMIS,
      }));
      return {
        id: a.id,
        salarieId: a.salarieId,
        salarie: [a.salarie.nom, a.salarie.postNom, a.salarie.prenoms].filter(Boolean).join(' '),
        matricule: a.salarie.matricule,
        type: a.type,
        categoriePret: a.categoriePret,
        littera: LITTERA_ARTICLE_112[a.type as TypeAvance],
        compte: compteDeLAvance(a.type as TypeAvance, (a.categoriePret as CategoriePret | null) ?? null),
        dateOctroi: a.dateOctroi,
        montantFc: Number(a.montantFc),
        retenueMensuelleFc: a.retenueMensuelleFc === null ? null : Number(a.retenueMensuelleFc),
        objet: a.objet,
        pieceJustificative: a.pieceJustificative,
        retenues,
        soldeFc: soldeAvance(Number(a.montantFc), retenues),
      };
    });
  }

  /**
   * L'AVANCE S'INSCRIT, ELLE NE SE COMPTABILISE PAS ICI · son versement est
   * une écriture de trésorerie (D/4211 ou 272, C/52 ou 57, fiche du compte 42
   * des deux plans), que le cabinet passe au journal. Le registre en tient le
   * remboursement, bulletin après bulletin.
   */
  async creerAvance(tenantId: string, email: string, salarieId: string, dto: AvanceSalaireDto) {
    const salarie = await this.prisma.salarie.findFirst({ where: { id: salarieId, tenantId }, select: { id: true } });
    if (!salarie) throw new NotFoundException('Salarié introuvable dans ce dossier.');
    const refus = motifRefusAvance(dto);
    if (refus) throw new BadRequestException(refus);
    return this.prisma.avanceSalaire.create({
      data: {
        tenantId,
        salarieId,
        type: dto.type,
        categoriePret: dto.type === 'PRET' ? dto.categoriePret : null,
        dateOctroi: new Date(dto.dateOctroi),
        montantFc: dto.montantFc,
        retenueMensuelleFc: dto.retenueMensuelleFc ?? null,
        objet: dto.objet.trim(),
        pieceJustificative: dto.pieceJustificative.trim(),
        creePar: email,
      },
    });
  }

  /** Une avance saisie par erreur se retire tant qu'aucun bulletin n'y a retenu · après, elle est l'histoire des bulletins. */
  async supprimerAvance(tenantId: string, id: string) {
    const a = await this.prisma.avanceSalaire.findFirst({ where: { id, tenantId }, include: { _count: { select: { retenues: true } } } });
    if (!a) throw new NotFoundException('Avance introuvable dans ce dossier.');
    if (a._count.retenues > 0) {
      throw new ConflictException(
        `Cette avance porte ${a._count.retenues} retenue(s) de bulletin · elle ne se supprime plus. Annulez les bulletins si les retenues sont fausses.`,
      );
    }
    await this.prisma.avanceSalaire.delete({ where: { id: a.id } });
    return { supprime: true };
  }
}
