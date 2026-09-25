import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { ibanValide, motifRefusJournalBanque, normaliserIban } from './banques';
import { BanqueDto, LibelleDto, ModifierBanqueDto, ModifierLibelleDto, RibDto } from './dto/banques.dto';

/** Chaîne vide = effacement (`null`), absent = inchangé. */
const vide = (v: string | undefined) => (v === undefined ? undefined : v.trim() === '' ? null : v.trim());

/**
 * BANQUES ET LIBELLÉS (point 19, Sage i7 · Structure / Banque, Structure /
 * Libellé). Voir `banques.ts` pour les règles. Un doublon d'intitulé, d'abrégé
 * ou de code est refusé par la contrainte de la base, et le refus le nomme.
 */
@Injectable()
export class BanquesService {
  constructor(private readonly prisma: PrismaService) {}

  lister(tenantId: string) {
    return this.prisma.banque.findMany({
      where: { tenantId },
      orderBy: { intitule: 'asc' },
      include: { ribs: { orderBy: { abrege: 'asc' }, include: { journal: { select: { id: true, code: true, intitule: true } } } } },
    });
  }

  private async doublon<T>(promesse: Promise<T>, message: string): Promise<T> {
    try {
      return await promesse;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(message);
      throw e;
    }
  }

  private async banqueDuDossier(tenantId: string, id: string) {
    const b = await this.prisma.banque.findFirst({ where: { id, tenantId } });
    if (!b) throw new NotFoundException('Banque introuvable');
    return b;
  }

  creer(tenantId: string, dto: BanqueDto) {
    return this.doublon(
      this.prisma.banque.create({
        data: {
          tenantId,
          intitule: dto.intitule.trim(),
          adresse: vide(dto.adresse),
          codePostal: vide(dto.codePostal),
          ville: vide(dto.ville),
          pays: vide(dto.pays),
          telephone: vide(dto.telephone),
          email: vide(dto.email),
          contact: vide(dto.contact),
        },
      }),
      `Une banque « ${dto.intitule.trim()} » existe déjà dans ce dossier.`,
    );
  }

  async modifier(tenantId: string, id: string, dto: ModifierBanqueDto) {
    await this.banqueDuDossier(tenantId, id);
    return this.doublon(
      this.prisma.banque.update({
        where: { id },
        data: {
          intitule: dto.intitule?.trim(),
          adresse: vide(dto.adresse),
          codePostal: vide(dto.codePostal),
          ville: vide(dto.ville),
          pays: vide(dto.pays),
          telephone: vide(dto.telephone),
          email: vide(dto.email),
          contact: vide(dto.contact),
        },
      }),
      `Une banque « ${dto.intitule?.trim()} » existe déjà dans ce dossier.`,
    );
  }

  /** Supprimer la banque emporte ses RIB · aucune écriture ne les référence. */
  async supprimer(tenantId: string, id: string) {
    await this.banqueDuDossier(tenantId, id);
    await this.prisma.banque.delete({ where: { id } });
    return { supprime: true };
  }

  /**
   * Les champs d'un RIB, vérifiés · IBAN au contrôle ISO 13616, journal de
   * banque de ce dossier, pas déjà rattaché à un autre RIB.
   */
  private async champsRib(tenantId: string, dto: RibDto, ribId?: string) {
    let iban: string | null | undefined = vide(dto.iban);
    if (iban) {
      if (!ibanValide(iban)) throw new BadRequestException(`IBAN « ${iban} » invalide · la clé de contrôle ne correspond pas (ISO 13616).`);
      iban = normaliserIban(iban);
    }
    let journalId: string | null | undefined = vide(dto.journalId);
    if (journalId) {
      const journal = await this.prisma.journal.findFirst({
        where: { id: journalId, tenantId },
        select: { code: true, type: true, compteTresorerie: { select: { numero: true } } },
      });
      const motif = motifRefusJournalBanque(journal);
      if (motif) throw new BadRequestException(motif);
      const pris = await this.prisma.ribBanque.findFirst({
        where: { tenantId, journalId, ...(ribId ? { id: { not: ribId } } : {}) },
        select: { abrege: true },
      });
      if (pris) throw new ConflictException(`Le journal ${journal!.code} porte déjà le RIB ${pris.abrege} · un journal de banque n'a qu'un RIB.`);
    }
    return {
      abrege: dto.abrege?.trim(),
      devise: vide(dto.devise)?.toUpperCase() ?? (dto.devise === undefined ? undefined : null),
      codeBic: vide(dto.codeBic)?.toUpperCase() ?? (dto.codeBic === undefined ? undefined : null),
      codeBanque: vide(dto.codeBanque),
      codeGuichet: vide(dto.codeGuichet),
      numeroCompte: vide(dto.numeroCompte),
      cle: vide(dto.cle),
      iban,
      commentaire: vide(dto.commentaire),
      journalId,
    };
  }

  async creerRib(tenantId: string, banqueId: string, dto: RibDto) {
    await this.banqueDuDossier(tenantId, banqueId);
    if (!dto.abrege?.trim()) throw new BadRequestException("L'abrégé du RIB est obligatoire · c'est lui qui le désigne.");
    const champs = await this.champsRib(tenantId, dto);
    return this.doublon(
      this.prisma.ribBanque.create({ data: { ...champs, abrege: dto.abrege.trim(), tenantId, banqueId } }),
      `Un RIB « ${dto.abrege.trim()} » existe déjà dans ce dossier.`,
    );
  }

  async modifierRib(tenantId: string, ribId: string, dto: RibDto) {
    const rib = await this.prisma.ribBanque.findFirst({ where: { id: ribId, tenantId } });
    if (!rib) throw new NotFoundException('RIB introuvable');
    const champs = await this.champsRib(tenantId, dto, ribId);
    return this.doublon(
      this.prisma.ribBanque.update({ where: { id: ribId }, data: champs }),
      `Un RIB « ${dto.abrege?.trim()} » existe déjà dans ce dossier.`,
    );
  }

  async supprimerRib(tenantId: string, ribId: string) {
    const rib = await this.prisma.ribBanque.findFirst({ where: { id: ribId, tenantId } });
    if (!rib) throw new NotFoundException('RIB introuvable');
    await this.prisma.ribBanque.delete({ where: { id: ribId } });
    return { supprime: true };
  }

  // ---- Libellés -------------------------------------------------------

  listerLibelles(tenantId: string) {
    return this.prisma.libelleEcriture.findMany({ where: { tenantId }, orderBy: { code: 'asc' } });
  }

  creerLibelle(tenantId: string, dto: LibelleDto) {
    const code = dto.code.trim().toUpperCase();
    return this.doublon(
      this.prisma.libelleEcriture.create({ data: { tenantId, code, intitule: dto.intitule.trim() } }),
      `Un libellé de code ${code} existe déjà dans ce dossier.`,
    );
  }

  async modifierLibelle(tenantId: string, id: string, dto: ModifierLibelleDto) {
    const l = await this.prisma.libelleEcriture.findFirst({ where: { id, tenantId } });
    if (!l) throw new NotFoundException('Libellé introuvable');
    const code = dto.code?.trim().toUpperCase();
    return this.doublon(
      this.prisma.libelleEcriture.update({ where: { id }, data: { code, intitule: dto.intitule?.trim() } }),
      `Un libellé de code ${code} existe déjà dans ce dossier.`,
    );
  }

  async supprimerLibelle(tenantId: string, id: string) {
    const l = await this.prisma.libelleEcriture.findFirst({ where: { id, tenantId } });
    if (!l) throw new NotFoundException('Libellé introuvable');
    await this.prisma.libelleEcriture.delete({ where: { id } });
    return { supprime: true };
  }
}
