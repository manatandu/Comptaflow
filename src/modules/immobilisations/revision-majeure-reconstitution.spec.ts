import { ModeAmortissement, TypeComposant } from '@prisma/client';
import { ImmobilisationService } from './immobilisation.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * COMPOSANT « RÉVISIONS MAJEURES » · l'estimation que le référentiel autorise,
 * et la fiction qu'il n'autorise pas.
 *
 * AUDCIF, Titre VIII ch. 5 § 1 · c'est le seul endroit du référentiel qui
 * ouvre une ESTIMATION rétrospective : « Lorsque le composant "Révisions
 * majeures" n'a pas été comptabilisé séparément ou spécifiquement identifié
 * lors de la comptabilisation initiale […], sa valeur nette comptable PEUT
 * ÊTRE ESTIMÉE par référence au "coût de révision actuel amorti", COMME SI
 * cette révision avait été réalisée à la date d'acquisition. »
 *
 * LA PHRASE SE PLACE AVANT TOUTE RÉVISION, et c'est sa limite. Passé un
 * intervalle complet, l'amortissement fictif dépasse le coût et la valeur
 * nette deviendrait négative : le module réclame alors la date de la dernière
 * révision réellement réalisée, plutôt que de prolonger la fiction par un
 * modulo qui rendrait un chiffre plausible pour une révision dont personne ne
 * sait si elle a eu lieu.
 */

const AN = 365.25 * 24 * 3600 * 1000;

describe('l’estimation du ch. 5 § 1', () => {
  const base = {
    coutRevisionActuel: 10_000_000,
    intervalleRevisionsAns: 2,
    dateAcquisition: new Date('2025-01-01T00:00:00.000Z'),
  };

  it('amortit le coût ACTUEL sur l’intervalle, depuis l’acquisition', () => {
    // Un an écoulé sur un intervalle de deux ans · la moitié est amortie.
    const r = ImmobilisationService.reconstitutionRevisionMajeure({
      ...base,
      dateReconstitution: new Date(base.dateAcquisition.getTime() + AN),
    });
    expect(r.possible).toBe(true);
    if (!r.possible) return;
    expect(r.amortissementEstime).toBe(5_000_000);
    expect(r.valeurNetteEstimee).toBe(5_000_000);
  });

  it('rend le coût entier le jour de l’acquisition · rien n’est encore couru', () => {
    const r = ImmobilisationService.reconstitutionRevisionMajeure({
      ...base,
      dateReconstitution: base.dateAcquisition,
    });
    expect(r.possible).toBe(true);
    if (!r.possible) return;
    expect(r.amortissementEstime).toBe(0);
    expect(r.valeurNetteEstimee).toBe(10_000_000);
  });

  it('refuse au-delà d’un intervalle complet · la fiction ne se prolonge pas', () => {
    const r = ImmobilisationService.reconstitutionRevisionMajeure({
      ...base,
      dateReconstitution: new Date(base.dateAcquisition.getTime() + 3 * AN),
    });
    expect(r.possible).toBe(false);
    if (r.possible) return;
    expect(r.motif).toContain('dernière révision réalisée');
    expect(r.motif).toContain('modulo');
  });

  it('repart de la dernière révision RÉELLEMENT réalisée quand elle est donnée', () => {
    // Six ans après l'acquisition, mais révisée il y a six mois · un quart de
    // l'intervalle de deux ans est couru.
    const dateReconstitution = new Date(base.dateAcquisition.getTime() + 6 * AN);
    const r = ImmobilisationService.reconstitutionRevisionMajeure({
      ...base,
      dateReconstitution,
      derniereRevisionRealiseeLe: new Date(dateReconstitution.getTime() - AN / 2),
    });
    expect(r.possible).toBe(true);
    if (!r.possible) return;
    expect(r.amortissementEstime).toBe(2_500_000);
    expect(r.valeurNetteEstimee).toBe(7_500_000);
  });

  it('refuse sans le coût actuel ou sans l’intervalle · aucun ne se déduit d’une comptabilité', () => {
    for (const manque of [{ coutRevisionActuel: 0 }, { intervalleRevisionsAns: 0 }]) {
      const r = ImmobilisationService.reconstitutionRevisionMajeure({
        ...base,
        ...manque,
        dateReconstitution: new Date(base.dateAcquisition.getTime() + AN),
      });
      expect({ manque: Object.keys(manque)[0], possible: r.possible }).toEqual({
        manque: Object.keys(manque)[0],
        possible: false,
      });
    }
  });

  it('ne rend jamais une valeur nette négative', () => {
    for (const ans of [0, 0.5, 1, 1.5, 1.99]) {
      const r = ImmobilisationService.reconstitutionRevisionMajeure({
        ...base,
        dateReconstitution: new Date(base.dateAcquisition.getTime() + ans * AN),
      });
      if (r.possible) expect(r.valeurNetteEstimee).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('l’estimation servie sur un bien précis', () => {
  function service(composantsRevision: number) {
    const prisma = {
      immobilisation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'i1',
          designation: 'Matériel industriel',
          dateAcquisition: new Date('2025-01-01T00:00:00.000Z'),
          valeurOrigine: 190_000_000,
          valeurResiduelle: 0,
          dureeAmortissementAns: 6,
          dateMiseEnService: new Date('2025-01-01T00:00:00.000Z'),
          amortissementAnterieur: 0,
          modeAmortissement: ModeAmortissement.LINEAIRE,
          statut: 'EN_SERVICE',
          dotations: [],
          depreciations: [],
        }),
        count: jest.fn().mockResolvedValue(composantsRevision),
      },
    } as unknown as PrismaService;
    return new ImmobilisationService(prisma, {} as unknown as EcritureService);
  }

  it('rend le calcul avec son fondement et la suite à donner', async () => {
    const r = await service(0).estimerRevisionMajeure('t1', 'i1', {
      coutRevisionActuel: 10_000_000,
      intervalleRevisionsAns: 2,
      dateReconstitution: '2026-01-01',
    });
    expect(r.possible).toBe(true);
    expect(r.fondement).toContain('ch. 5 § 1');
    // La voie de rechange à la provision interdite est rappelée · c'est elle
    // qui rend l'opération nécessaire (ch. 18 § 4.11.2).
    expect(r.suite).toContain('aucune provision pour grosses réparations');
  });

  it('refuse sur un bien dont le composant a bien été identifié à l’origine', async () => {
    await expect(
      service(1).estimerRevisionMajeure('t1', 'i1', {
        coutRevisionActuel: 10_000_000,
        intervalleRevisionsAns: 2,
        dateReconstitution: '2026-01-01',
      }),
    ).rejects.toThrow(/porte déjà un composant/);
  });
});

describe('une révision majeure s’amortit sur l’intervalle, jamais sur la structure', () => {
  function service() {
    const prisma = {
      immobilisation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'p1',
          dateAcquisition: new Date('2025-01-01T00:00:00.000Z'),
          dureeAmortissementAns: 6,
          compteImmobilisation: { numero: '24100000', intitule: 'Matériel industriel' },
        }),
      },
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: 'SYSCOHADA' }) },
      familleImmobilisation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'f1',
          compteImmobilisationId: 'ci',
          compteAmortissementId: 'ca',
          compteDotationId: 'cd',
          dureeAmortissementAns: 2,
        }),
      },
      compte: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'c1', numero: '52100000', intitule: 'Banque', classe: 'CLASSE_5' }),
      },
    } as unknown as PrismaService;
    return new ImmobilisationService(prisma, {} as unknown as EcritureService);
  }

  const composant = (dureeAmortissementAns: number) => ({
    familleId: 'f1',
    designation: 'Révision majeure',
    dateAcquisition: '2025-01-01',
    dateMiseEnService: '2025-01-01',
    valeurOrigine: 10_000_000,
    dureeAmortissementAns,
    compteContrepartieId: 'c1',
    exerciceId: 'ex1',
    journalId: 'j1',
    immobilisationPrincipaleId: 'p1',
    typeComposant: TypeComposant.REVISION_MAJEURE,
    justificationDecomposition: 'Contrat de révision biennale.',
  });

  it('refuse une durée égale ou supérieure à celle de la structure', async () => {
    for (const duree of [6, 7]) {
      await expect(service().creer('t1', 'u1', composant(duree) as never)).rejects.toThrow(
        /intervalle qui sépare deux révisions/,
      );
    }
  });

  it('cite l’exemple officiel · 190 000 000 sur six ans, révision de 10 000 000 sur deux ans', async () => {
    await expect(service().creer('t1', 'u1', composant(6) as never)).rejects.toThrow(/190 000 000/);
    await expect(service().creer('t1', 'u1', composant(6) as never)).rejects.toThrow(/DEUX ans/);
  });

  it('laisse passer une durée strictement plus courte · elle va chercher la famille ensuite', async () => {
    // La création s'arrête plus loin, sur un faux incomplet · ce qui compte
    // est qu'elle ne s'arrête PLUS sur l'intervalle.
    const erreur = await service()
      .creer('t1', 'u1', composant(2) as never)
      .then(() => null, (e: Error) => e);
    expect(String(erreur)).not.toMatch(/intervalle qui sépare deux révisions/);
  });
});
