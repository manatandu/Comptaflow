import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  LONGUEUR_MAX_COMMENTAIRE,
  TAILLE_MAX_DOCUMENT,
  dispositionTelechargement,
  empreinteDocument,
  identifierType,
  motifRefusDocument,
  nettoyerNomFichier,
} from './documents-tiers';
import { DocumentsTiersService } from './documents-tiers.service';

const PDF = Buffer.from('%PDF-1.7\n%contenu');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1]);
const HTML = Buffer.from('<html><script>alert(1)</script></html>');

describe('Documents attachés aux tiers · le type se lit dans les octets', () => {
  it('admet chaque format de la liste quand signature et extension concordent', () => {
    expect(identifierType(PDF, 'statuts.pdf')).toEqual({ typeMime: 'application/pdf' });
    expect(identifierType(PNG, 'scan.PNG')).toEqual({ typeMime: 'image/png' });
    expect(identifierType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'photo.jpeg')).toEqual({ typeMime: 'image/jpeg' });
    expect(identifierType(ZIP, 'contrat.docx')).toEqual({
      typeMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    expect(identifierType(ZIP, 'grille.xlsx')).toEqual({
      typeMime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    expect(identifierType(OLE, 'ancien.doc')).toEqual({ typeMime: 'application/msword' });
    expect(identifierType(OLE, 'ancien.xls')).toEqual({ typeMime: 'application/vnd.ms-excel' });
  });

  it('refuse une page HTML renommée en .pdf · le nom ne fait pas le format', () => {
    const r = identifierType(HTML, 'contrat.pdf');
    expect('refus' in r && r.refus).toContain('ne correspond pas à son extension .pdf');
  });

  it('refuse un format hors liste et nomme les formats acceptés', () => {
    const r = identifierType(HTML, 'page.html');
    expect('refus' in r && r.refus).toContain('« .html » n\'est pas admis');
    expect('refus' in r && r.refus).toContain('.pdf');
    const sans = identifierType(PDF, 'sansextension');
    expect('refus' in sans && sans.refus).toContain('« .? »');
  });

  it('refuse un fichier plus court que la signature', () => {
    expect('refus' in identifierType(Buffer.from([0x25, 0x50]), 'court.pdf')).toBe(true);
  });
});

describe('Documents attachés aux tiers · les refus avant toute écriture', () => {
  it('refuse le vide, le trop gros, le commentaire trop long et le nom illisible', () => {
    expect(motifRefusDocument({ nom: 'a.pdf', contenu: Buffer.alloc(0) })).toBe('Le fichier est vide.');
    const gros = Buffer.alloc(TAILLE_MAX_DOCUMENT + 1, 0x25);
    expect(motifRefusDocument({ nom: 'a.pdf', contenu: gros })).toContain('dépasse 5 Mo');
    expect(
      motifRefusDocument({ nom: 'a.pdf', contenu: PDF, commentaire: 'x'.repeat(LONGUEUR_MAX_COMMENTAIRE + 1) }),
    ).toContain('69 caractères');
    expect(motifRefusDocument({ nom: '<>|', contenu: PDF })).toContain('pas de nom lisible');
  });

  it('admet exactement 5 Mo et exactement 69 caractères, bornes comprises', () => {
    const juste = Buffer.alloc(TAILLE_MAX_DOCUMENT, 0x20);
    PDF.copy(juste);
    expect(motifRefusDocument({ nom: 'a.pdf', contenu: juste, commentaire: 'x'.repeat(69) })).toBeNull();
  });

  it('les deux bornes sont celles décidées · 5 Mo, et les 69 caractères de Sage', () => {
    expect(TAILLE_MAX_DOCUMENT).toBe(5 * 1024 * 1024);
    expect(LONGUEUR_MAX_COMMENTAIRE).toBe(69);
  });
});

describe('Documents attachés aux tiers · le nom et le téléchargement', () => {
  it('ne garde que le dernier segment d’un chemin et retire les caractères interdits', () => {
    expect(nettoyerNomFichier('C:\\Users\\x\\Statuts "ASBL".pdf')).toBe('Statuts ASBL.pdf');
    expect(nettoyerNomFichier('/tmp/a/b/rccm.pdf')).toBe('rccm.pdf');
  });

  it('borne la longueur en gardant l’extension', () => {
    const nom = nettoyerNomFichier('x'.repeat(300) + '.pdf');
    expect(nom).toHaveLength(150);
    expect(nom.endsWith('.pdf')).toBe(true);
  });

  it('sert toujours en pièce jointe, nom accentué en UTF-8 et repli ASCII', () => {
    const d = dispositionTelechargement('Société Démo.pdf');
    expect(d.startsWith('attachment;')).toBe(true);
    expect(d).toContain('filename="Societe Demo.pdf"');
    expect(d).toContain("filename*=UTF-8''Soci%C3%A9t%C3%A9%20D%C3%A9mo.pdf");
  });

  it('l’empreinte est le SHA-256 du contenu', () => {
    expect(empreinteDocument(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('le contrôleur sert nosniff et la disposition calculée · jamais inline', () => {
    const source = readFileSync(join(__dirname, 'documents-tiers.controller.ts'), 'utf8');
    expect(source).toContain("'X-Content-Type-Options': 'nosniff'");
    expect(source).toContain("'Content-Disposition': dispositionTelechargement(document.nomFichier)");
    expect(source).toContain('limits: { fileSize: TAILLE_MAX_DOCUMENT');
  });
});

function prismaFactice(opts: { tiers?: boolean; conflit?: boolean; document?: boolean } = {}) {
  const appels: Record<string, any[]> = { findMany: [], create: [], update: [], delete: [], findFirst: [] };
  const prisma = {
    tiers: {
      findFirst: jest.fn(async (a: any) => (opts.tiers === false ? null : { id: a.where.id, code: 'F1' })),
    },
    documentTiers: {
      findMany: jest.fn(async (a: any) => {
        appels.findMany.push(a);
        return [];
      }),
      findFirst: jest.fn(async (a: any) => {
        appels.findFirst.push(a);
        return opts.document === false ? null : { id: 'doc', nomFichier: 'a.pdf', typeMime: 'application/pdf', contenu: PDF };
      }),
      create: jest.fn(async (a: any) => {
        appels.create.push(a);
        if (opts.conflit) throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });
        return { id: 'doc' };
      }),
      update: jest.fn(async (a: any) => {
        appels.update.push(a);
        return { id: 'doc' };
      }),
      delete: jest.fn(async (a: any) => {
        appels.delete.push(a);
        return { id: 'doc' };
      }),
    },
  };
  return { prisma, appels };
}

describe('Documents attachés aux tiers · le service', () => {
  it('une liste ne transporte jamais le contenu, et reste bornée au dossier', async () => {
    const { prisma, appels } = prismaFactice();
    await new DocumentsTiersService(prisma as never).lister('t', 'tiers-1');
    expect(appels.findMany[0].where).toEqual({ tenantId: 't', tiersId: 'tiers-1' });
    expect(appels.findMany[0].select.contenu).toBeUndefined();
    expect(appels.findMany[0].select.nomFichier).toBe(true);
    expect(prisma.tiers.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'tiers-1', tenantId: 't' } }));
  });

  it('refuse un tiers d’un autre dossier', async () => {
    const { prisma } = prismaFactice({ tiers: false });
    await expect(new DocumentsTiersService(prisma as never).lister('t', 'x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('dépose avec le type lu, l’empreinte, l’auteur, et rend la ligne sans contenu', async () => {
    const { prisma, appels } = prismaFactice();
    const nomLatin1 = Buffer.from('Société.pdf', 'utf8').toString('latin1');
    await new DocumentsTiersService(prisma as never).deposer(
      't',
      'tiers-1',
      { originalname: nomLatin1, buffer: PDF },
      '  RCCM 2024  ',
      'chef@cabinet.cd',
    );
    const { data, select } = appels.create[0];
    expect(data).toMatchObject({
      tenantId: 't',
      tiersId: 'tiers-1',
      nomFichier: 'Société.pdf',
      typeMime: 'application/pdf',
      taille: PDF.length,
      empreinte: empreinteDocument(PDF),
      commentaire: 'RCCM 2024',
      deposePar: 'chef@cabinet.cd',
    });
    expect(select.contenu).toBeUndefined();
  });

  it('refuse sans rien écrire une pièce dont le contenu contredit l’extension', async () => {
    const { prisma, appels } = prismaFactice();
    await expect(
      new DocumentsTiersService(prisma as never).deposer('t', 'tiers-1', { originalname: 'a.pdf', buffer: HTML }, undefined, 'x'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(appels.create).toHaveLength(0);
  });

  it('refuse l’envoi sans fichier', async () => {
    const { prisma } = prismaFactice();
    await expect(
      new DocumentsTiersService(prisma as never).deposer('t', 'tiers-1', undefined, undefined, 'x'),
    ).rejects.toThrow('Aucun fichier reçu.');
  });

  it('une même pièce attachée deux fois au même tiers est un conflit nommé', async () => {
    const { prisma } = prismaFactice({ conflit: true });
    await expect(
      new DocumentsTiersService(prisma as never).deposer('t', 'tiers-1', { originalname: 'a.pdf', buffer: PDF }, undefined, 'x'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('le téléchargement et la suppression cherchent la pièce DANS le dossier', async () => {
    const { prisma, appels } = prismaFactice();
    const s = new DocumentsTiersService(prisma as never);
    await s.telecharger('t', 'doc');
    expect(appels.findFirst[0].where).toEqual({ id: 'doc', tenantId: 't' });
    expect(appels.findFirst[0].select.contenu).toBe(true);
    await s.supprimer('t', 'doc');
    expect(appels.findFirst[1].where).toEqual({ id: 'doc', tenantId: 't' });
    expect(appels.delete).toHaveLength(1);
  });

  it('une pièce d’un autre dossier est introuvable, et rien n’est supprimé', async () => {
    const { prisma, appels } = prismaFactice({ document: false });
    const s = new DocumentsTiersService(prisma as never);
    await expect(s.telecharger('t', 'doc')).rejects.toBeInstanceOf(NotFoundException);
    await expect(s.supprimer('t', 'doc')).rejects.toBeInstanceOf(NotFoundException);
    expect(appels.delete).toHaveLength(0);
  });

  it('le commentaire se modifie, vidé il redevient null, trop long il est refusé', async () => {
    const { prisma, appels } = prismaFactice();
    const s = new DocumentsTiersService(prisma as never);
    await s.modifierCommentaire('t', 'doc', '   ');
    expect(appels.update[0].data).toEqual({ commentaire: null });
    expect(appels.update[0].select.contenu).toBeUndefined();
    await expect(s.modifierCommentaire('t', 'doc', 'x'.repeat(70))).rejects.toBeInstanceOf(BadRequestException);
    expect(appels.update).toHaveLength(1);
  });
});
