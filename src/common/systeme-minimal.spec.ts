import { Referentiel } from '@prisma/client';
import { EcritureService } from '../modules/comptabilite/ecriture.service';
import { ImmobilisationService } from '../modules/immobilisations/immobilisation.service';
import { PrismaService } from './prisma.service';
import { estSystemeMinimal, motifRefusAmortissementNonLineaireSmt, motifRefusDepreciationSmt } from './systeme-minimal';

/**
 * CE QUE LE SMT N'ADMET PAS · voir docs/audit-modules-par-profil.md. Deux
 * portées qui ne s'harmonisent pas : la dépréciation est refusée aux deux SMT
 * (aucun des deux modèles n'a de poste pour elle), le mode d'amortissement ne
 * l'est qu'au SMT SYSCOHADA (le Titre X écrit « linéaire » ; le SYCEBNL ne
 * prescrit rien).
 */

const SMT_SYCEBNL = { referentiel: Referentiel.SYCEBNL, jeuEtatsFinanciersSycebnl: 'SYSTEME_MINIMAL_TRESORERIE' as const };
const ASSOCIATIONS = { referentiel: Referentiel.SYCEBNL, jeuEtatsFinanciersSycebnl: 'ASSOCIATIONS_ORDRES_PROFESSIONNELS' as const };
const PROJETS = { referentiel: Referentiel.SYCEBNL, jeuEtatsFinanciersSycebnl: 'PROJETS_DEVELOPPEMENT' as const };
const SMT_SYSCOHADA = { referentiel: Referentiel.SYSCOHADA, systemeComptableSyscohada: 'MINIMAL_TRESORERIE' as const };
const NORMAL = { referentiel: Referentiel.SYSCOHADA, systemeComptableSyscohada: 'NORMAL' as const };

describe('estSystemeMinimal', () => {
  it('lit le jeu au SYCEBNL et le système au SYSCOHADA, jamais l’un pour l’autre', () => {
    expect(estSystemeMinimal(SMT_SYCEBNL)).toBe(true);
    expect(estSystemeMinimal(SMT_SYSCOHADA)).toBe(true);
    expect(estSystemeMinimal(ASSOCIATIONS)).toBe(false);
    expect(estSystemeMinimal(PROJETS)).toBe(false);
    expect(estSystemeMinimal(NORMAL)).toBe(false);
    // Un dossier SYCEBNL qui porterait un système SYSCOHADA résiduel n'est
    // pas au SMT pour autant · c'est son jeu qui décide.
    expect(estSystemeMinimal({ ...ASSOCIATIONS, systemeComptableSyscohada: 'MINIMAL_TRESORERIE' })).toBe(false);
  });
});

describe('la dépréciation, refusée aux deux SMT', () => {
  it('cite le modèle de CHAQUE texte', () => {
    expect(motifRefusDepreciationSmt(SMT_SYCEBNL)).toMatch(/SYCEBNL, Partie 4 ch\. 4/);
    expect(motifRefusDepreciationSmt(SMT_SYCEBNL)).not.toMatch(/AUDCIF/);
    expect(motifRefusDepreciationSmt(SMT_SYSCOHADA)).toMatch(/AUDCIF, Titre X ch\. 2/);
    expect(motifRefusDepreciationSmt(SMT_SYSCOHADA)).not.toMatch(/SYCEBNL/);
  });
  it('laisse passer les trois autres profils', () => {
    for (const t of [ASSOCIATIONS, PROJETS, NORMAL]) expect(motifRefusDepreciationSmt(t)).toBeNull();
  });
});

describe('le mode linéaire, au seul SMT SYSCOHADA', () => {
  it('refuse au SMT SYSCOHADA avec la phrase du Titre X', () => {
    expect(motifRefusAmortissementNonLineaireSmt(SMT_SYSCOHADA, 'X')).toMatch(/linéaire sans prorata temporis/);
  });
  it('ne transpose pas la règle au SMT SYCEBNL, qui ne prescrit aucun mode', () => {
    expect(motifRefusAmortissementNonLineaireSmt(SMT_SYCEBNL, 'X')).toBeNull();
    expect(motifRefusAmortissementNonLineaireSmt(NORMAL, 'X')).toBeNull();
  });
});

describe('le câblage · un bien aux unités d’œuvre à la création', () => {
  function harnais(regime: Record<string, unknown>) {
    const creations: unknown[] = [];
    const prisma = {
      familleImmobilisation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'f1',
          compteImmobilisationId: 'cimmo',
          compteAmortissementId: 'camort',
          compteDotationId: 'cdot',
          dureeAmortissementAns: 5,
        }),
      },
      compte: { findFirst: jest.fn().mockResolvedValue({ id: 'ctreso', numero: '52110000' }) },
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue(regime) },
      immobilisation: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          creations.push(data);
          return Promise.resolve({ ...data, valeurOrigine: 0, valeurResiduelle: 0, prixCession: null, dotations: [] });
        }),
      },
    };
    const ecritures = { creer: jest.fn().mockResolvedValue({ id: 'e1' }) } as unknown as EcritureService;
    return { svc: new ImmobilisationService(prisma as unknown as PrismaService, ecritures), creations };
  }
  const CAMION = {
    familleId: 'f1',
    designation: 'Camion',
    dateAcquisition: '2026-01-10',
    dateMiseEnService: '2026-01-10',
    valeurOrigine: 40_000_000,
    dureeAmortissementAns: 5,
    compteContrepartieId: 'ctreso',
    exerciceId: 'exN',
    journalId: 'j1',
    modeAmortissement: 'UNITES_DOEUVRE',
    unitesOeuvrePrevues: 400_000,
    uniteOeuvreLibelle: 'km',
  };

  it('refusé au SMT SYSCOHADA, rien n’est créé', async () => {
    const { svc, creations } = harnais(SMT_SYSCOHADA);
    await expect(svc.creer('t1', 'u1', CAMION as never)).rejects.toThrow(/Titre X ch\. 1 § 1/);
    expect(creations).toHaveLength(0);
  });

  it('admis au SMT SYCEBNL et au Système normal', async () => {
    for (const regime of [SMT_SYCEBNL, NORMAL]) {
      const { svc, creations } = harnais(regime);
      await svc.creer('t1', 'u1', CAMION as never).catch(() => undefined);
      expect(creations).toHaveLength(1);
    }
  });
});
