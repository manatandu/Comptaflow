import { Referentiel } from '@prisma/client';
import { ControlesService } from './controles.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * LE CONTRÔLE DU BROUILLARD NE RÉCLAME PAS UNE VALIDATION IMPOSSIBLE.
 *
 * Audit du serveur du 2026-09-27, F12 · l'écriture de clôture d'un exercice
 * clôturé reste au brouillard (`valider` refuse tout exercice clos), et le
 * report à-nouveau provisoire y reste par construction. Le contrôle 4 les
 * signalait quand même, avec « validez-les » · une action que personne ne
 * peut faire, donc une anomalie fabriquée (§ 10 bis).
 */

type Faux = Record<string, unknown>;
const ANCIEN = new Date('2025-01-10');

const ecriture = (id: string, drapeaux: Faux = {}) => ({
  id,
  date: new Date('2026-12-31'),
  libelle: id,
  reference: 'REF',
  numeroPiece: 1,
  statut: 'BROUILLARD',
  createdAt: ANCIEN,
  createdBy: 'u',
  valideeBy: null,
  secondRegardNom: null,
  estGenereeParCloture: false,
  estANouveauProvisoire: false,
  journal: { code: 'OD' },
  lignes: [],
  ...drapeaux,
});

function analyser(statutExercice: 'OUVERT' | 'CLOTURE', ecritures: Faux[]) {
  const prisma = {
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ex', statut: statutExercice, dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31'),
        dateArreteComptes: new Date('2027-04-28'),
      }),
    },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 't', nom: 'Dossier', referentiel: Referentiel.SYCEBNL }) },
    ecriture: { findMany: jest.fn().mockResolvedValue(ecritures) },
    compte: { findMany: jest.fn().mockResolvedValue([]) },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
    exoneration: { findMany: jest.fn().mockResolvedValue([]) },
    manuelProcedures: { findFirst: jest.fn().mockResolvedValue(null) },
    conventionFinancement: { findMany: jest.fn().mockResolvedValue([]) },
    mandatAuditeur: { findMany: jest.fn().mockResolvedValue([]) },
    // Le contrôle 30 lit les rapprochements qui tiennent un à-nouveau · aucun ici.
    rapprochementBancaire: { findMany: jest.fn().mockResolvedValue([]) },
    dotationAmortissement: { findMany: jest.fn().mockResolvedValue([]) },
    depreciationImmobilisation: { findMany: jest.fn().mockResolvedValue([]) },
    reclassementImmobilisation: { findMany: jest.fn().mockResolvedValue([]) },
    amortissementDerogatoire: { findMany: jest.fn().mockResolvedValue([]) },
    clotureLocationAcquisition: { findMany: jest.fn().mockResolvedValue([]) },
    immobilisation: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  } as Faux;
  return new ControlesService(prisma as unknown as PrismaService).analyser('t', 'ex');
}

const retard = async (statut: 'OUVERT' | 'CLOTURE', ecritures: Faux[]) =>
  (await analyser(statut, ecritures)).anomalies.find((a) => a.code === 'BROUILLARD_EN_RETARD');

describe('brouillard en retard et écritures invalidables', () => {
  it('l’écriture de clôture d’un exercice clôturé n’est pas signalée', async () => {
    expect(await retard('CLOTURE', [ecriture('cloture', { estGenereeParCloture: true })])).toBeUndefined();
  });

  it('le report à-nouveau provisoire n’est pas signalé', async () => {
    expect(await retard('OUVERT', [ecriture('ran-provisoire', { estGenereeParCloture: true, estANouveauProvisoire: true })])).toBeUndefined();
  });

  it('une écriture ordinaire en retard l’est toujours, seule', async () => {
    const a = await retard('OUVERT', [ecriture('achat'), ecriture('ran-provisoire', { estANouveauProvisoire: true })]);
    expect(a?.occurrences.map((o) => o.detail?.split(' · ')[0])).toEqual(['achat']);
  });

  it('le report définitif d’un exercice OUVERT reste signalé · lui se valide', async () => {
    const a = await retard('OUVERT', [ecriture('ran', { estGenereeParCloture: true })]);
    expect(a?.occurrences.map((o) => o.detail?.split(' · ')[0])).toEqual(['ran']);
  });
});
