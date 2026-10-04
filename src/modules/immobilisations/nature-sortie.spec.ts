import { Referentiel, SystemeComptableSyscohada, JeuEtatsFinanciersSycebnl } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ImmobilisationService } from './immobilisation.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { SortirImmobilisationDto } from './dto/immobilisation.dto';
import { NATURES_SORTIE, libelleSortie, motifRefusNatureSortie, motifRefusPieceSortie } from './nature-sortie';

/**
 * LIGNE A14 · la sortie porte sa nature et sa pièce (relevé CPCC C11).
 * Fiche du compte 81 (« vente, échange, mise au rebut ou destruction ») ;
 * AUDCIF Titre V § 5.8 et SYCEBNL cadre conceptuel § 5.5 (« vol,
 * disparition ») ; SYCEBNL Partie 3 ch. 3 § 2.5 (remise gratuite,
 * restitution) ; AUDCIF art. 17, 3° et 5° (pièce datée, référence).
 */

const ctx = (o: Partial<Parameters<typeof motifRefusNatureSortie>[0]>) =>
  motifRefusNatureSortie({ nature: 'VOL', type: 'MISE_HORS_SERVICE', projetDeveloppement: false, usufruit: false, ...o });

describe('A14 · la liste fermée des natures', () => {
  it('huit natures, chacune nommée par un texte lu, et aucun « pillage »', () => {
    expect([...NATURES_SORTIE]).toEqual([
      'VENTE', 'ECHANGE', 'MISE_AU_REBUT', 'DESTRUCTION', 'VOL', 'DISPARITION', 'REMISE_GRATUITE', 'RESTITUTION',
    ]);
    // Le schéma porte la même énumération, valeur pour valeur.
    const schema = readFileSync(join(__dirname, '../../../prisma/schema.prisma'), 'utf8');
    const bloc = /enum NatureSortieImmobilisation \{([^}]*)\}/.exec(schema)![1];
    expect(bloc.split(/\s+/).filter((m) => /^[A-Z_]+$/.test(m))).toEqual([...NATURES_SORTIE]);
  });

  it('une cession avec prix est une vente, et une vente se déclare en cession', () => {
    expect(ctx({ type: 'CESSION', nature: 'VENTE' })).toBeNull();
    expect(ctx({ type: 'CESSION', nature: 'VOL' })).toMatch(/mise hors service, sans prix/);
    expect(ctx({ type: 'MISE_HORS_SERVICE', nature: 'VENTE' })).toMatch(/déclarez-la en cession/);
  });

  it('l’échange n’entre que par son geste', () => {
    expect(ctx({ type: 'CESSION', nature: 'ECHANGE' })).toMatch(/Échanger/);
    expect(ctx({ type: 'CESSION', nature: 'ECHANGE', depuisEchange: true })).toBeNull();
  });

  it('mise au rebut, destruction, vol, disparition · partout', () => {
    for (const nature of ['MISE_AU_REBUT', 'DESTRUCTION', 'VOL', 'DISPARITION'] as const) expect(ctx({ nature })).toBeNull();
  });

  it('remise gratuite · fin de projet seule ; restitution · fin de projet ou usufruit', () => {
    expect(ctx({ nature: 'REMISE_GRATUITE' })).toMatch(/§ 2.5.2/);
    expect(ctx({ nature: 'REMISE_GRATUITE', projetDeveloppement: true })).toBeNull();
    expect(ctx({ nature: 'RESTITUTION' })).toMatch(/§ 2.5.3/);
    expect(ctx({ nature: 'RESTITUTION', usufruit: true })).toBeNull();
    expect(ctx({ nature: 'RESTITUTION', projetDeveloppement: true })).toBeNull();
  });

  it('la pièce · référence et date exigées', () => {
    expect(motifRefusPieceSortie('', new Date('2026-09-30'))).toMatch(/art\. 17, 3° et 5°/);
    expect(motifRefusPieceSortie('PV 12', null)).toMatch(/datée/);
    expect(motifRefusPieceSortie('PV 12', new Date('2026-09-30'))).toBeNull();
  });

  it('le libellé de l’écriture nomme la nature', () => {
    expect(libelleSortie({ projet: false, type: 'MISE_HORS_SERVICE', nature: 'VOL', designation: 'Camion' })).toBe('Mise hors service (vol) · Camion');
    expect(libelleSortie({ projet: true, type: 'MISE_HORS_SERVICE', nature: 'RESTITUTION', designation: 'Jeep' })).toBe(
      'Fin de projet · Mise hors service (restitution) · Jeep',
    );
    // Une sortie interne sans nature garde l'ancien libellé.
    expect(libelleSortie({ projet: false, type: 'CESSION', nature: null, designation: 'Camion' })).toBe('Cession · Camion');
  });

  it('la route exige nature, référence et date de la pièce', () => {
    const base = { dateSortie: '2026-09-30', type: 'MISE_HORS_SERVICE', exerciceId: '6f1a4c1e-1d2b-4c3d-8e4f-5a6b7c8d9e0f', journalId: '6f1a4c1e-1d2b-4c3d-8e4f-5a6b7c8d9e0f' };
    const champs = (o: object) => validateSync(plainToInstance(SortirImmobilisationDto, o)).map((e) => e.property).sort();
    expect(champs(base)).toEqual(['datePieceSortie', 'natureSortie', 'referencePieceSortie']);
    expect(champs({ ...base, natureSortie: 'PILLAGE', referencePieceSortie: 'PV', datePieceSortie: '2026-09-30' })).toEqual(['natureSortie']);
    expect(champs({ ...base, natureSortie: 'VOL', referencePieceSortie: 'PV', datePieceSortie: '2026-09-30' })).toEqual([]);
  });
});

type Ligne = { compteId: string; debit: number; credit: number };

function harnais(jeu: JeuEtatsFinanciersSycebnl | null = null, referentiel: Referentiel = Referentiel.SYSCOHADA) {
  const postees: Array<{ libelle: string; reference?: string; lignes: Ligne[] }> = [];
  const immo = {
    id: 'i1',
    designation: 'Camion',
    statut: 'EN_SERVICE',
    valeurOrigine: 12_000,
    valeurResiduelle: 0,
    dureeAmortissementAns: 5,
    dateMiseEnService: new Date('2024-01-01'),
    dateAcquisition: new Date('2023-06-01'),
    amortissementAnterieur: 0,
    modeAmortissement: 'LINEAIRE',
    compteImmobilisationId: 'cimmo',
    compteImmobilisation: { id: 'cimmo', numero: '24500000', intitule: 'Matériel de transport' },
    compteDotationId: 'cd',
    compteAmortissementId: 'ca',
    dotations: [2_400, 2_400].map((m, i) => ({ montant: m, exerciceId: `exAnt${i}` })),
    depreciations: [],
  };
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel, systemeComptableSyscohada: SystemeComptableSyscohada.NORMAL, jeuEtatsFinanciersSycebnl: jeu }),
    },
    immobilisation: {
      findFirst: jest.fn().mockResolvedValue(immo),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany,
      update: jest.fn().mockResolvedValue(immo),
    },
    exercice: { findFirst: jest.fn().mockResolvedValue({ id: 'exN', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') }) },
    compte: {
      findUnique: jest.fn().mockImplementation(({ where }: { where: { tenantId_numero: { numero: string } } }) =>
        Promise.resolve({ id: `n${where.tenantId_numero.numero}`, numero: where.tenantId_numero.numero }),
      ),
      findFirst: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve({ id: where.id, numero: '48520000' })),
    },
    dotationAmortissement: { create: jest.fn().mockResolvedValue({ id: 'dot1' }), delete: jest.fn() },
    // Ligne A15 · aucun bien réévalué ici · la sortie ne lit aucun écart.
    ligneReevaluationBilan: { findMany: jest.fn().mockResolvedValue([]) },
    ligneEcriture: { deleteMany: jest.fn() },
    ecriture: { delete: jest.fn() },
  };
  let n = 0;
  const ecritures = {
    creer: jest.fn().mockImplementation((_t: string, _u: string, dto: { libelle: string; reference?: string; lignes: Ligne[] }) => {
      n += 1;
      postees.push(dto);
      return Promise.resolve({ id: `e${n}` });
    }),
  } as unknown as EcritureService;
  return { svc: new ImmobilisationService(prisma as unknown as PrismaService, ecritures), postees, updateMany };
}

const sortie = (o: object = {}) => ({
  dateSortie: '2026-09-30',
  type: 'MISE_HORS_SERVICE',
  exerciceId: 'exN',
  journalId: 'j1',
  natureSortie: 'VOL',
  referencePieceSortie: 'PV de constat n° 4',
  datePieceSortie: '2026-10-02',
  ...o,
});

describe('A14 · la sortie porte nature et pièce jusqu’à son écriture', () => {
  it('le bien garde nature, référence et date de la pièce ; les écritures portent la référence', async () => {
    const { svc, postees, updateMany } = harnais();
    await svc.sortir('t1', 'u1', 'i1', sortie() as never);
    expect(updateMany.mock.calls[0][0].data).toMatchObject({
      natureSortie: 'VOL',
      referencePieceSortie: 'PV de constat n° 4',
      datePieceSortie: new Date('2026-10-02'),
    });
    const sortieEcr = postees.find((e) => e.libelle.startsWith('Mise hors service'))!;
    expect(sortieEcr.libelle).toBe('Mise hors service (vol) · Camion');
    expect(postees.every((e) => e.reference === 'PV de constat n° 4')).toBe(true);
    // Les montants ne bougent pas · 12 000 - 6 600 au 812.
    expect(sortieEcr.lignes.find((l) => l.compteId === 'n81200000')!.debit).toBe(5_400);
  });

  it('une nature qui ne convient pas refuse AVANT le verrou', async () => {
    const { svc, postees, updateMany } = harnais();
    await expect(svc.sortir('t1', 'u1', 'i1', sortie({ natureSortie: 'REMISE_GRATUITE' }) as never)).rejects.toThrow(/§ 2.5.2/);
    expect(updateMany).not.toHaveBeenCalled();
    expect(postees).toEqual([]);
  });

  it('une pièce sans référence refuse AVANT le verrou', async () => {
    const { svc, updateMany } = harnais();
    await expect(svc.sortir('t1', 'u1', 'i1', sortie({ referencePieceSortie: '  ' }) as never)).rejects.toThrow(/art\. 17/);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('une sortie interne sans nature (renouvellement) passe comme avant, sans référence', async () => {
    const { svc, postees, updateMany } = harnais();
    await svc.sortir('t1', 'u1', 'i1', { dateSortie: '2026-09-30', type: 'MISE_HORS_SERVICE', exerciceId: 'exN', journalId: 'j1' } as never);
    expect(updateMany.mock.calls[0][0].data).toMatchObject({ natureSortie: null, referencePieceSortie: null, datePieceSortie: null });
    expect(postees.find((e) => e.libelle === 'Mise hors service · Camion')!.reference).toBeUndefined();
  });

  it('l’échange déclare sa nature par son propre geste', () => {
    const source = readFileSync(join(__dirname, 'immobilisation.service.ts'), 'utf8');
    const echanger = source.slice(source.indexOf('async echanger('), source.indexOf('async sortir('));
    expect(echanger).toMatch(/natureSortie: 'ECHANGE'/);
    expect(echanger).toMatch(/\{ depuisEchange: true \}/);
  });
});
