import { BadRequestException } from '@nestjs/common';
import { FormeJuridiqueSyscohada, Referentiel } from '@prisma/client';
import {
  immatriculationDesLivres,
  mentionImmatriculation,
  MENTION_ENTREPRENANT,
  numeroRegistreLiasse,
  type IdentiteImmatriculation,
} from './mentions-immatriculation';
import { mentionsEmetteur, mentionsRecopiees, type IdentiteSociete } from './mentions-societe';
import { TenantService } from './tenant.service';
import { ExportService } from '../exports/export.service';
import { segmentIdentification } from '../exports/classeur-en-flux';

/**
 * PASSE O2 · l'immatriculation que l'AUDCG fait imprimer, au-delà de la ligne
 * de l'AUSCGIE art. 17 · art. 14 (livres de commerce), 59 (pièces et
 * correspondance de toute personne immatriculée), 62 et 64 (entreprenant) et
 * 140 (locataire-gérant).
 */
const id = (forme: FormeJuridiqueSyscohada | null, extra: Partial<IdentiteImmatriculation> = {}): IdentiteImmatriculation => ({
  referentiel: Referentiel.SYSCOHADA,
  formeJuridiqueSyscohada: forme,
  rccm: null,
  ...extra,
});

describe('AUDCG art. 59 · toute personne immatriculée, pas les seules sociétés', () => {
  it('le commerçant personne physique porte son RCCM, ou le manque se dit', () => {
    expect(mentionImmatriculation(id(FormeJuridiqueSyscohada.ENTREPRISE_INDIVIDUELLE, { rccm: 'CD/KIN/RCCM/23-A-1' }))).toEqual({
      ligne: 'RCCM CD/KIN/RCCM/23-A-1',
      manquantes: [],
    });
    expect(mentionImmatriculation(id(FormeJuridiqueSyscohada.ENTREPRISE_INDIVIDUELLE)).manquantes.join(' ')).toContain('AUDCG art. 59');
    expect(mentionImmatriculation(id(FormeJuridiqueSyscohada.GROUPEMENT_INTERET_ECONOMIQUE)).manquantes).toHaveLength(1);
    expect(mentionImmatriculation(id(FormeJuridiqueSyscohada.SUCCURSALE)).manquantes).toHaveLength(1);
  });

  it('la coopérative n’est pas au RCCM, l’entité publique ne se voit rien reprocher, une ASBL rien du tout', () => {
    expect(mentionImmatriculation(id(FormeJuridiqueSyscohada.SOCIETE_COOPERATIVE, { rccm: 'X' }))).toEqual({ ligne: null, manquantes: [] });
    expect(mentionImmatriculation(id(FormeJuridiqueSyscohada.ENTITE_PUBLIQUE))).toEqual({ ligne: null, manquantes: [] });
    expect(mentionImmatriculation(id(FormeJuridiqueSyscohada.ENTITE_PUBLIQUE, { rccm: 'R1' })).ligne).toBe('RCCM R1');
    expect(mentionImmatriculation({ referentiel: Referentiel.SYCEBNL, formeJuridiqueSyscohada: null, rccm: 'R' })).toEqual({ ligne: null, manquantes: [] });
  });

  it('art. 62 et 64 · l’entreprenant porte sa déclaration d’activité et la mention littérale, jamais un RCCM', () => {
    const e = mentionImmatriculation(id(FormeJuridiqueSyscohada.ENTREPRENANT, { numeroDeclarationActivite: 'CD/KIN/D-7', rccm: 'IGNORÉ' }));
    expect(e.ligne).toBe(`N° de déclaration d’activité CD/KIN/D-7 (RCCM) · ${MENTION_ENTREPRENANT}`);
    expect(MENTION_ENTREPRENANT).toBe('Entreprenant dispensé d’immatriculation');
    expect(mentionImmatriculation(id(FormeJuridiqueSyscohada.ENTREPRENANT)).manquantes.join(' ')).toContain('art. 62');
    expect(numeroRegistreLiasse(id(FormeJuridiqueSyscohada.ENTREPRENANT, { numeroDeclarationActivite: 'D-7', rccm: 'R' }))).toContain('déclaration d’activité D-7');
    expect(numeroRegistreLiasse(id(FormeJuridiqueSyscohada.SOCIETE_ANONYME, { rccm: 'R' }))).toBe('R');
  });

  it('art. 140 · le locataire-gérant en tête, quelle que soit la forme', () => {
    expect(mentionImmatriculation(id(FormeJuridiqueSyscohada.ENTREPRISE_INDIVIDUELLE, { rccm: 'R', locataireGerantFonds: true })).ligne).toBe(
      'Locataire-gérant du fonds de commerce · RCCM R',
    );
    const societe: IdentiteSociete = {
      ...id(FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE, { rccm: 'R', locataireGerantFonds: true }),
      nom: 'SARL',
      capitalSocial: 1000,
      capitalVariable: false,
      adresse: 'Av. 1',
      ville: 'Kinshasa',
      devise: 'CDF',
    };
    expect(mentionsEmetteur(societe).ligne).toMatch(/^Locataire-gérant du fonds de commerce · Société à responsabilité limitée/);
    expect(mentionsRecopiees({ ...societe, formeJuridiqueSyscohada: FormeJuridiqueSyscohada.ENTREPRISE_INDIVIDUELLE, capitalSocial: null }).ligne).toContain('RCCM R');
  });
});

describe('AUDCG art. 14 · le numéro sur les livres de commerce', () => {
  it('le segment dit le numéro, ou le manque, jamais un blanc', () => {
    expect(immatriculationDesLivres(id(FormeJuridiqueSyscohada.SOCIETE_ANONYME, { rccm: 'R9' }))).toBe('RCCM R9');
    expect(immatriculationDesLivres(id(FormeJuridiqueSyscohada.SOCIETE_ANONYME))).toBe('RCCM non renseigné');
    expect(immatriculationDesLivres(id(FormeJuridiqueSyscohada.ENTREPRENANT))).toContain('N° de déclaration d’activité non renseigné');
    expect(segmentIdentification({ entite: 'E', nif: 'N1', periode: 'p', devise: 'CDF', immatriculation: 'RCCM R9' })).toBe('NIF N1 · RCCM R9');
  });

  it('le cartouche des livres le lit dans le dossier', async () => {
    const prisma = {
      tenant: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          nom: 'Ets Kabila',
          numeroImpot: 'A1',
          devise: 'CDF',
          referentiel: 'SYSCOHADA',
          formeJuridiqueSyscohada: 'ENTREPRISE_INDIVIDUELLE',
          rccm: 'CD/KIN/RCCM/24-A-5',
        }),
      },
      exercice: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const svc = new ExportService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    const identite = await (svc as unknown as { identiteEtat: (t: string, p: object) => Promise<{ immatriculation?: string }> }).identiteEtat('t', {});
    expect(identite.immatriculation).toBe('RCCM CD/KIN/RCCM/24-A-5');
  });
});

describe('TenantService.modifierIdentite · les refus des art. 62, 64 et 138', () => {
  const service = (forme: string | null, referentiel = 'SYSCOHADA') => {
    const appels: unknown[] = [];
    const prisma = {
      tenant: {
        findUnique: async () => ({ id: 't1', referentiel, formeJuridiqueSyscohada: forme }),
        update: async (args: unknown) => {
          appels.push(args);
          return { id: 't1' };
        },
      },
    };
    const s = new TenantService(prisma as never);
    (s as unknown as { parametres: () => Promise<null> }).parametres = async () => null;
    return { s, appels };
  };

  it('un RCCM refusé à l’entreprenant, une déclaration d’activité refusée aux autres', async () => {
    await expect(service('ENTREPRENANT').s.modifierIdentite('t1', { rccm: 'R' })).rejects.toThrow(/art\. 64/);
    await expect(service('SOCIETE_ANONYME').s.modifierIdentite('t1', { numeroDeclarationActivite: 'D' })).rejects.toThrow(BadRequestException);
    const ok = service('ENTREPRENANT');
    await ok.s.modifierIdentite('t1', { numeroDeclarationActivite: ' D-7 ' });
    expect(ok.appels[0]).toMatchObject({ data: { numeroDeclarationActivite: 'D-7' } });
  });

  it('la location-gérance · refusée à l’entreprenant (art. 138), trois réponses sinon', async () => {
    await expect(service('ENTREPRENANT').s.modifierIdentite('t1', { locataireGerantFonds: 'OUI' })).rejects.toThrow(/art\. 138/);
    await expect(service(null, 'SYCEBNL').s.modifierIdentite('t1', { locataireGerantFonds: 'OUI' })).rejects.toThrow(BadRequestException);
    const ok = service('ENTREPRISE_INDIVIDUELLE');
    await ok.s.modifierIdentite('t1', { locataireGerantFonds: 'OUI' });
    await ok.s.modifierIdentite('t1', { locataireGerantFonds: 'PAS_ENCORE_DIT' });
    expect(ok.appels).toMatchObject([{ data: { locataireGerantFonds: true } }, { data: { locataireGerantFonds: null } }]);
  });
});
