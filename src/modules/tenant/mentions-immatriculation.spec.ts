import { BadRequestException } from '@nestjs/common';
import { FormeJuridiqueEbnl, FormeJuridiqueSyscohada, Referentiel, VarianteCooperative } from '@prisma/client';
import {
  immatriculationDesLivres,
  mentionImmatriculation,
  MENTION_ENTREPRENANT,
  numeroRegistreLiasse,
  type IdentiteImmatriculation,
} from './mentions-immatriculation';
import { MENTION_ASBL, mentionsEmetteur, mentionsRecopiees, type IdentiteSociete } from './mentions-societe';
import { FacturationService } from '../facturation/facturation.service';
import { CommercialService } from '../commercial/commercial.service';
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

  it('la coopérative n’est pas au RCCM (l’AUDCG se tait, l’AUSCOOP parle plus bas), l’entité publique ne se voit rien reprocher, une ASBL rien au titre de l’AUDCG', () => {
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

/**
 * PASSES O6 ET D1 · deux règles qui prennent le relais quand l'AUDCG et
 * l'AUSCGIE se taisent · AUSCOOP art. 19, 183, 205 et 268 pour la
 * coopérative, loi n° 004/2001, art. 16 pour l'ASBL de droit congolais.
 */
const cooperative = (extra: Partial<IdentiteSociete> = {}): IdentiteSociete => ({
  referentiel: Referentiel.SYSCOHADA,
  formeJuridiqueSyscohada: FormeJuridiqueSyscohada.SOCIETE_COOPERATIVE,
  nom: 'COOPEC Tujenge',
  capitalSocial: 500000,
  capitalVariable: false,
  adresse: '3, av. des Palmiers',
  ville: 'Bukavu',
  rccm: null,
  devise: 'CDF',
  numeroRegistreCooperatives: 'CD/BKV/RSC/24-0012',
  varianteCooperative: VarianteCooperative.COOP_CA,
  ...extra,
});

describe('AUSCOOP art. 19 · la ligne de la coopérative', () => {
  it('forme mot pour mot (art. 268), siège et numéro au Registre des Sociétés Coopératives · jamais le capital', () => {
    expect(mentionsEmetteur(cooperative())).toEqual({
      ligne:
        "Société Coopérative avec Conseil d'Administration · COOP-CA · siège social : 3, av. des Palmiers, Bukavu · Registre des Sociétés Coopératives n° CD/BKV/RSC/24-0012",
      manquantes: [],
    });
    expect(mentionsEmetteur(cooperative({ varianteCooperative: VarianteCooperative.SCOOPS })).ligne).toMatch(
      /^Société Coopérative Simplifiée · SCOOPS · /,
    );
  });

  it('chaque absence est NOMMÉE avec son article, un RCCM saisi n’y supplée pas', () => {
    const m = mentionsEmetteur(
      cooperative({ varianteCooperative: null, adresse: null, numeroRegistreCooperatives: null, rccm: 'CD/KIN/RCCM/1' }),
    );
    expect(m.ligne).toBe('siège social : Bukavu');
    expect(m.manquantes).toEqual([
      'forme de la société coopérative (AUSCOOP art. 19, 205 ou 268)',
      'adresse du siège social (AUSCOOP art. 19)',
      "numéro d'immatriculation au Registre des Sociétés Coopératives (AUSCOOP art. 19 et 74)",
    ]);
  });

  it('art. 183 · « société en liquidation » et le liquidateur sur les pièces datées de la dissolution ou après', () => {
    const dissoute = cooperative({ dateDissolution: new Date('2026-06-30'), liquidateurs: 'Me Kasongo' });
    expect(mentionsEmetteur(dissoute, new Date('2026-07-01')).ligne).toMatch(/^Société en liquidation · liquidateur : Me Kasongo · /);
    expect(mentionsEmetteur(dissoute, new Date('2026-06-29')).ligne).not.toBeNull();
    expect(mentionsEmetteur(dissoute, new Date('2026-06-29')).ligne).toMatch(/^Société Coopérative avec/);
    const sansNom = mentionsRecopiees(cooperative({ dateDissolution: new Date('2026-06-30') }), new Date('2026-08-01'));
    expect(sansNom.ligne).toMatch(/^Société en liquidation · /);
    expect(sansNom.manquantes).toContain('nom du ou des liquidateurs (AUSCOOP art. 183)');
  });

  it('la liasse porte le numéro de la coopérative NOMMÉ, jamais nu', () => {
    expect(
      numeroRegistreLiasse(id(FormeJuridiqueSyscohada.SOCIETE_COOPERATIVE, { rccm: 'R', numeroRegistreCooperatives: 'RSC-9' })),
    ).toBe('Registre des Sociétés Coopératives n° RSC-9');
    expect(numeroRegistreLiasse(id(FormeJuridiqueSyscohada.SOCIETE_COOPERATIVE, { rccm: 'R' }))).toBe('');
  });
});

describe('Loi n° 004/2001, art. 16 · la mention de l’ASBL', () => {
  const asbl = (extra: Partial<IdentiteSociete> = {}): IdentiteSociete => ({
    referentiel: Referentiel.SYCEBNL,
    formeJuridiqueSyscohada: null,
    nom: 'Mwinda',
    capitalSocial: null,
    capitalVariable: false,
    adresse: null,
    ville: null,
    rccm: null,
    devise: 'CDF',
    formeJuridique: FormeJuridiqueEbnl.ASSOCIATION,
    droitEtranger: false,
    ...extra,
  });

  it('l’association, l’ONG et l’association confessionnelle de droit congolais portent les mots et le sigle', () => {
    expect(MENTION_ASBL).toBe('Association sans but lucratif · A.S.B.L.');
    for (const f of [
      FormeJuridiqueEbnl.ASSOCIATION,
      FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE,
      FormeJuridiqueEbnl.ASSOCIATION_CONFESSIONNELLE,
    ]) {
      expect(mentionsEmetteur(asbl({ formeJuridique: f }))).toEqual({ ligne: MENTION_ASBL, manquantes: [] });
    }
    expect(mentionsRecopiees(asbl()).ligne).toBe(MENTION_ASBL);
  });

  it('rien à ajouter quand la dénomination les porte déjà', () => {
    expect(mentionsEmetteur(asbl({ nom: 'Mwinda ASBL' })).ligne).toBeNull();
    expect(mentionsEmetteur(asbl({ nom: 'Mwinda, A.S.B.L.' })).ligne).toBeNull();
    expect(mentionsEmetteur(asbl({ nom: 'Mwinda, association sans but lucratif' })).ligne).toBeNull();
  });

  it('hors de la Section I · ni l’EUP, ni l’unité de gestion de projet, ni l’entité de droit étranger', () => {
    expect(mentionsEmetteur(asbl({ formeJuridique: FormeJuridiqueEbnl.ETABLISSEMENT_UTILITE_PUBLIQUE })).ligne).toBeNull();
    expect(mentionsEmetteur(asbl({ formeJuridique: FormeJuridiqueEbnl.UNITE_GESTION_PROJET })).ligne).toBeNull();
    expect(mentionsEmetteur(asbl({ droitEtranger: true })).ligne).toBeNull();
  });
});

describe('Les pièces émises lisent ce que la règle demande', () => {
  it('la facture et le devis sélectionnent les champs de la coopérative et de l’ASBL', async () => {
    for (const Service of [FacturationService, CommercialService]) {
      let select: Record<string, unknown> = {};
      const prisma = {
        tenant: {
          findUniqueOrThrow: async (args: { select: Record<string, unknown> }) => {
            select = args.select;
            return {};
          },
        },
      };
      const svc = new (Service as unknown as new (...a: unknown[]) => { dossier: (t: string) => Promise<unknown> })(prisma, {}, {});
      await svc.dossier('t1');
      for (const champ of [
        'numeroRegistreCooperatives',
        'varianteCooperative',
        'dateDissolution',
        'liquidateurs',
        'formeJuridique',
        'droitEtranger',
      ]) {
        expect(select[champ]).toBe(true);
      }
    }
  });
});

describe('TenantService.modifierIdentite · la coopérative (AUSCOOP art. 74, 77, 183)', () => {
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

  it('le RCCM est refusé à la coopérative (art. 77 al. 1), son numéro au RSC accepté', async () => {
    await expect(service('SOCIETE_COOPERATIVE').s.modifierIdentite('t1', { rccm: 'R' })).rejects.toThrow(/art\. 77/);
    const ok = service('SOCIETE_COOPERATIVE');
    await ok.s.modifierIdentite('t1', {
      numeroRegistreCooperatives: ' RSC-1 ',
      varianteCooperative: 'SCOOPS',
      dateDissolution: '2026-06-30',
      liquidateurs: 'Me K.',
    });
    expect(ok.appels[0]).toMatchObject({
      data: { numeroRegistreCooperatives: 'RSC-1', varianteCooperative: 'SCOOPS', liquidateurs: 'Me K.' },
    });
    await ok.s.modifierIdentite('t1', { varianteCooperative: 'PAS_ENCORE_DIT', dateDissolution: '' });
    expect(ok.appels[1]).toMatchObject({ data: { varianteCooperative: null, dateDissolution: null } });
  });

  it('les champs de la coopérative sont refusés aux autres formes, l’effacement reste permis', async () => {
    await expect(service('SOCIETE_ANONYME').s.modifierIdentite('t1', { numeroRegistreCooperatives: 'X' })).rejects.toThrow(/AUSCOOP/);
    await expect(service(null, 'SYCEBNL').s.modifierIdentite('t1', { varianteCooperative: 'COOP_CA' })).rejects.toThrow(/AUSCOOP/);
    await expect(service('SOCIETE_ANONYME').s.modifierIdentite('t1', { liquidateurs: 'X' })).rejects.toThrow(BadRequestException);
    const ok = service('SOCIETE_ANONYME');
    await ok.s.modifierIdentite('t1', { numeroRegistreCooperatives: '', varianteCooperative: 'PAS_ENCORE_DIT' });
    expect(ok.appels).toHaveLength(1);
  });
});
