import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import {
  LONGUEUR_MAX_COMMENTAIRE,
  decoderNomMultipart,
  empreinteDocument,
  identifierType,
  motifRefusDocument,
  nettoyerNomFichier,
} from './documents-tiers';

/**
 * Ce qu'une LISTE rend d'un document · jamais `contenu`. Une fiche qui porte
 * dix scans de 5 Mo ferait sinon transiter 50 Mo pour afficher dix lignes.
 * La pièce elle-même ne sort que par `telecharger`, une à la fois.
 */
const SANS_CONTENU = {
  id: true,
  tiersId: true,
  nomFichier: true,
  typeMime: true,
  taille: true,
  empreinte: true,
  commentaire: true,
  deposePar: true,
  createdAt: true,
} as const;

@Injectable()
export class DocumentsTiersService {
  constructor(private readonly prisma: PrismaService) {}

  private async tiersDuDossier(tenantId: string, tiersId: string) {
    const tiers = await this.prisma.tiers.findFirst({ where: { id: tiersId, tenantId }, select: { id: true, code: true } });
    if (!tiers) throw new NotFoundException('Tiers introuvable pour ce dossier.');
    return tiers;
  }

  async lister(tenantId: string, tiersId: string) {
    await this.tiersDuDossier(tenantId, tiersId);
    return this.prisma.documentTiers.findMany({
      where: { tenantId, tiersId },
      orderBy: { createdAt: 'desc' },
      select: SANS_CONTENU,
    });
  }

  async deposer(
    tenantId: string,
    tiersId: string,
    fichier: { originalname: string; buffer: Buffer } | undefined,
    commentaire: string | undefined,
    auteur: string,
  ) {
    await this.tiersDuDossier(tenantId, tiersId);
    if (!fichier) throw new BadRequestException('Aucun fichier reçu.');
    // Multer lit le nom en latin1 · voir `decoderNomMultipart`.
    const nomRecu = decoderNomMultipart(fichier.originalname);
    const refus = motifRefusDocument({ nom: nomRecu, contenu: fichier.buffer, commentaire });
    if (refus) throw new BadRequestException(refus);
    const nomFichier = nettoyerNomFichier(nomRecu);
    const type = identifierType(fichier.buffer, nomFichier);
    if ('refus' in type) throw new BadRequestException(type.refus);
    const empreinte = empreinteDocument(fichier.buffer);
    try {
      return await this.prisma.documentTiers.create({
        data: {
          tenantId,
          tiersId,
          nomFichier,
          typeMime: type.typeMime,
          taille: fichier.buffer.length,
          empreinte,
          commentaire: commentaire?.trim() || null,
          contenu: fichier.buffer,
          deposePar: auteur,
        },
        select: SANS_CONTENU,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ce fichier est déjà attaché à ce tiers (même contenu).');
      }
      throw e;
    }
  }

  async modifierCommentaire(tenantId: string, id: string, commentaire: string | null | undefined) {
    const texte = (commentaire ?? '').trim();
    if (texte.length > LONGUEUR_MAX_COMMENTAIRE) {
      throw new BadRequestException(`Le commentaire dépasse ${LONGUEUR_MAX_COMMENTAIRE} caractères (${texte.length}).`);
    }
    await this.trouver(tenantId, id);
    return this.prisma.documentTiers.update({
      where: { id },
      data: { commentaire: texte || null },
      select: SANS_CONTENU,
    });
  }

  private async trouver(tenantId: string, id: string) {
    const document = await this.prisma.documentTiers.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!document) throw new NotFoundException('Document introuvable pour ce dossier.');
    return document;
  }

  /** La seule lecture qui porte `contenu` · une pièce, du dossier de la session. */
  async telecharger(tenantId: string, id: string) {
    const document = await this.prisma.documentTiers.findFirst({
      where: { id, tenantId },
      select: { nomFichier: true, typeMime: true, contenu: true },
    });
    if (!document) throw new NotFoundException('Document introuvable pour ce dossier.');
    return document;
  }

  async supprimer(tenantId: string, id: string) {
    await this.trouver(tenantId, id);
    await this.prisma.documentTiers.delete({ where: { id }, select: { id: true } });
    return { supprime: true };
  }
}
