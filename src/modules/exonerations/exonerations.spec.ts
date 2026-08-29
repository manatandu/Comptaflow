import { ExonerationsService } from './exonerations.service';
import { PrismaService } from '../../common/prisma.service';
import { MODELES_DEMANDE, JOURS_ALERTE_RENOUVELLEMENT } from './correspondance-exonerations';

/**
 * REGISTRE DES EXONÉRATIONS · le logiciel n'accorde rien et ne calcule aucun
 * droit. Ce qu'il doit faire juste, c'est compter les pièces qui manquent et
 * la date à laquelle le titre tombe · les deux seules choses qui, manquées,
 * laissent la marchandise au port.
 */

function dossier(o: {
  type: 'PONCTUEL' | 'PREVISIONNEL' | 'RENOUVELLEMENT';
  statut?: 'EN_PREPARATION' | 'DEPOSE' | 'ACCORDE' | 'REJETE' | 'EXPIRE';
  dateFinValidite?: string | null;
  piecesFournies?: string[];
}) {
  return {
    id: `d-${o.type}`,
    tenantId: 't1',
    type: o.type,
    statut: o.statut ?? 'EN_PREPARATION',
    objet: 'Lot de médicaments',
    referenceArrete: null,
    dateArrete: null,
    dateDebutValidite: null,
    dateFinValidite: o.dateFinValidite === undefined ? null : o.dateFinValidite ? new Date(o.dateFinValidite) : null,
    lettreTransport: null,
    valeurBiens: null,
    franchiseDouaniere: null,
    piecesFournies: o.piecesFournies ?? [],
    observations: null,
    createdAt: new Date('2026-01-01'),
    createdBy: 'u1',
    updatedAt: new Date('2026-01-01'),
  };
}

function service(dossiers: unknown[], creation?: jest.Mock) {
  const prisma = {
    exoneration: {
      findMany: jest.fn().mockResolvedValue(dossiers),
      create: creation ?? jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
      findFirst: jest.fn().mockResolvedValue(dossiers[0] ?? null),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
      delete: jest.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;
  return new ExonerationsService(prisma);
}

describe('Référentiel des demandes (note circulaire n° 003/2013)', () => {
  it('porte les trois dossiers du texte, avec le nombre de pièces de chacun', () => {
    const types = MODELES_DEMANDE.map((m) => m.type);
    expect(types).toEqual(['PONCTUEL', 'PREVISIONNEL', 'RENOUVELLEMENT']);
    // Section B.I : treize pièces. B.II : onze. B.III : quatre.
    expect(MODELES_DEMANDE[0].pieces).toHaveLength(13);
    expect(MODELES_DEMANDE[1].pieces).toHaveLength(11);
    expect(MODELES_DEMANDE[2].pieces).toHaveLength(4);
  });

  it('seul l’arrêté prévisionnel (et son renouvellement) a une durée de validité', () => {
    expect(MODELES_DEMANDE.find((m) => m.type === 'PONCTUEL')!.validiteMois).toBeNull();
    expect(MODELES_DEMANDE.find((m) => m.type === 'PREVISIONNEL')!.validiteMois).toBe(24);
    expect(MODELES_DEMANDE.find((m) => m.type === 'RENOUVELLEMENT')!.validiteMois).toBe(24);
  });

  it('rappelle qu’aucune franchise ne se présume (code des douanes, art. 338)', () => {
    const r = service([]).referentiel();
    expect(r.avertissement).toContain('art. 338');
    expect(r.avertissement).toContain('ne se présume');
  });
});

describe('Pièces manquantes', () => {
  it('un dossier vide manque toutes les pièces NON conditionnelles', async () => {
    const r = await service([dossier({ type: 'RENOUVELLEMENT' })]).lister('t1', '2026-06-01');
    expect(r.dossiers[0].complet).toBe(false);
    expect(r.dossiers[0].piecesManquantes).toHaveLength(4);
    expect(r.incomplets).toBe(1);
  });

  it('une pièce CONDITIONNELLE non fournie ne rend pas le dossier incomplet', async () => {
    // L'autorisation du Ministère de la Santé ne vaut que pour les produits
    // pharmaceutiques, l'accord-cadre que pour les ONG internationales. Les
    // compter comme manquantes ferait afficher « incomplet » à un dossier
    // complet · l'indicateur serait ignoré dès la deuxième fois.
    const toutesSaufConditionnelles = MODELES_DEMANDE.find((m) => m.type === 'PONCTUEL')!
      .pieces.filter((p) => !p.conditionnelle)
      .map((p) => p.cle);
    const r = await service([
      dossier({ type: 'PONCTUEL', piecesFournies: toutesSaufConditionnelles }),
    ]).lister('t1', '2026-06-01');
    expect(r.dossiers[0].complet).toBe(true);
    expect(r.dossiers[0].piecesManquantes).toHaveLength(0);
    // Mais elles restent RAPPELÉES, avec leur condition · le logiciel ne sait
    // pas si ce dossier porte des médicaments, l'utilisateur si.
    expect(r.dossiers[0].conditionnellesAVerifier).toHaveLength(2);
    expect(r.dossiers[0].conditionnellesAVerifier[0].condition).toBeTruthy();
  });
});

describe('Échéance de renouvellement', () => {
  it('alerte soixante jours avant l’expiration, pas trente', async () => {
    // Le renouvellement exige un rapport d'évaluation SUR TERRAIN, donc une
    // descente à organiser : à trente jours, l'échéance est déjà manquée.
    expect(JOURS_ALERTE_RENOUVELLEMENT).toBe(60);
    const r = await service([
      dossier({ type: 'PREVISIONNEL', statut: 'ACCORDE', dateFinValidite: '2026-07-15' }),
    ]).lister('t1', '2026-06-01');
    expect(r.dossiers[0].alerte).toBe('A_RENOUVELER');
    expect(r.dossiers[0].joursAvantExpiration).toBe(44);
    expect(r.aRenouveler).toBe(1);
  });

  it('un arrêté encore loin de son terme ne déclenche rien', async () => {
    const r = await service([
      dossier({ type: 'PREVISIONNEL', statut: 'ACCORDE', dateFinValidite: '2027-01-15' }),
    ]).lister('t1', '2026-06-01');
    expect(r.dossiers[0].alerte).toBeNull();
    expect(r.aRenouveler).toBe(0);
  });

  it('un arrêté périmé est signalé comme tel, avec un compte à rebours négatif', async () => {
    const r = await service([
      dossier({ type: 'PREVISIONNEL', statut: 'ACCORDE', dateFinValidite: '2026-05-01' }),
    ]).lister('t1', '2026-06-01');
    expect(r.dossiers[0].alerte).toBe('EXPIRE');
    expect(r.dossiers[0].joursAvantExpiration).toBeLessThan(0);
    expect(r.expires).toBe(1);
  });

  it('un dossier NON ACCORDÉ n’a pas d’échéance · il n’y a pas de titre à renouveler', async () => {
    // Tant qu'il n'est pas accordé, il n'existe aucune exonération : le
    // signaler « à renouveler » laisserait croire qu'un titre existe.
    const r = await service([
      dossier({ type: 'PREVISIONNEL', statut: 'DEPOSE', dateFinValidite: '2026-06-10' }),
    ]).lister('t1', '2026-06-01');
    expect(r.dossiers[0].alerte).toBeNull();
    expect(r.dossiers[0].joursAvantExpiration).toBeNull();
  });
});

describe('Création', () => {
  it('déduit la fin de validité du début et de la durée du texte (deux ans)', async () => {
    const create = jest.fn().mockImplementation(({ data }) => Promise.resolve(data));
    const s = service([], create);
    await s.creer('t1', 'u1', {
      type: 'PREVISIONNEL' as never,
      objet: 'Importations récurrentes 2026',
      dateDebutValidite: '2026-03-01',
    });
    const data = create.mock.calls[0][0].data;
    expect(data.dateFinValidite.toISOString().slice(0, 10)).toBe('2028-03-01');
  });

  it('un arrêté ponctuel n’a pas de fin de validité · il s’épuise avec son opération', async () => {
    const create = jest.fn().mockImplementation(({ data }) => Promise.resolve(data));
    await service([], create).creer('t1', 'u1', {
      type: 'PONCTUEL' as never,
      objet: 'Conteneur de vivres',
      dateDebutValidite: '2026-03-01',
    });
    expect(create.mock.calls[0][0].data.dateFinValidite).toBeNull();
  });
});
