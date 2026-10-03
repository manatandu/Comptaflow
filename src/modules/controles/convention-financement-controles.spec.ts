import { Referentiel } from '@prisma/client';
import { ControlesService } from './controles.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * LE CONTRÔLE 24 · le dossier de subvention relu à la clôture.
 *
 * La date de fin, les tranches et les rapports promis au bailleur sont tenus
 * par le dossier de subvention, et ces contrôles les relisent. La convention
 * d'un bailleur n'est pas l'accord-cadre d'une ONG étrangère (loi n° 004/2001,
 * art. 37), que vise le jalon 11 du planning de clôture et que le module
 * accord-cadre tient (audit final F76, F231).
 *
 * Le troisième est le plus fin, et il vise l'erreur naturelle : le cabinet
 * SAIT l'engagement ferme, et croit que cela suffit. Le § 5.4.2.4 pose deux
 * conditions à la comptabilisation, pas une · « ferme et inconditionnel ET a
 * fait l'objet d'un écrit signé ».
 */

interface Conv {
  reference: string;
  dateFin: Date;
  caractere?: 'FERME_INCONDITIONNEL' | 'CONDITIONNEL';
  ecritSigne?: boolean;
  rapports?: { intitule: string; dateEcheance: Date; dateTransmission: Date | null }[];
}

function service(conventions: Conv[], referentiel: Referentiel = Referentiel.SYCEBNL) {
  const servies = conventions.map((c) => ({
    reference: c.reference,
    objet: 'Programme de santé',
    dateFin: c.dateFin,
    montantAccorde: 500_000_000,
    caractere: c.caractere ?? 'FERME_INCONDITIONNEL',
    ecritSigne: c.ecritSigne ?? true,
    bailleur: { code: 'UE-01', nom: 'Union européenne' },
    rapports: c.rapports ?? [],
  }));
  const prisma = {
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ex',
        dateDebut: new Date('2026-01-01'),
        dateFin: new Date('2026-12-31'),
        dateArreteComptes: new Date('2027-04-28'),
      }),
    },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 't', nom: 'Dossier', referentiel }) },
    ecriture: { findMany: jest.fn().mockResolvedValue([]) },
    compte: { findMany: jest.fn().mockResolvedValue([]) },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
    exoneration: { findMany: jest.fn().mockResolvedValue([]) },
    manuelProcedures: { findFirst: jest.fn().mockResolvedValue(null) },
    conventionFinancement: { findMany: jest.fn().mockResolvedValue(servies) },
    // Mandat du contrôleur des comptes · contrôle 28. Vide ici, ces specs ne
    // le testent pas ; une doublure muette sur une lecture réelle validerait
    // un service qui n'existe pas.
    mandatAuditeur: { findMany: jest.fn().mockResolvedValue([]) },
    // Le contrôle 30 lit les rapprochements qui tiennent un à-nouveau · aucun ici.
    // Le contrôle 34 lit les contre-passations de réévaluation de l'exercice · aucune ici.
    reevaluation: { findMany: jest.fn().mockResolvedValue([]) },
    rapprochementBancaire: { findMany: jest.fn().mockResolvedValue([]) },
    depreciationImmobilisation: { findMany: jest.fn().mockResolvedValue([]) },
    reevaluationImmobilisation: { findMany: jest.fn().mockResolvedValue([]) },
    dotationAmortissement: { findMany: jest.fn().mockResolvedValue([]) },
    reclassementImmobilisation: { findMany: jest.fn().mockResolvedValue([]) },
    amortissementDerogatoire: { findMany: jest.fn().mockResolvedValue([]) },
    clotureLocationAcquisition: { findMany: jest.fn().mockResolvedValue([]) },
    immobilisation: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
  } as Record<string, unknown>;
  return new ControlesService(prisma as unknown as PrismaService);
}

const anomalies = async (conventions: Conv[], referentiel: Referentiel = Referentiel.SYCEBNL) =>
  (await service(conventions, referentiel).analyser('t', 'ex')).anomalies;

const trouver = (as: Awaited<ReturnType<typeof anomalies>>, code: string) => as.find((a) => a.code === code);

const PASSEE = new Date('2025-12-31');
const FUTURE = new Date('2099-12-31');

describe('convention arrivée à terme et toujours en cours', () => {
  it('la signale, avec sa date échue', async () => {
    const a = trouver(await anomalies([{ reference: 'UE-2026-001', dateFin: PASSEE }]), 'CONVENTION_FINANCEMENT_EXPIREE');
    expect(a).toBeDefined();
    expect(a!.gravite).toBe('AVERTISSEMENT');
    expect(a!.occurrences[0].reference).toContain('UE-2026-001');
    // Ce qui est en jeu est le reste à recevoir · une convention de bailleur
    // n'est pas l'accord-cadre de l'art. 37, qui a son propre contrôle
    // (audit final F76). Le message ne vise donc que le bailleur.
    expect(a!.consequence).toMatch(/^Ces conventions portent une date de fin dépassée[\s\S]*rien ne le fonde plus\.$/);
    expect(a!.action).toContain('avenant de prorogation');
  });

  it('se tait sur une convention encore valide', async () => {
    expect(
      trouver(await anomalies([{ reference: 'UE-2026-001', dateFin: FUTURE }]), 'CONVENTION_FINANCEMENT_EXPIREE'),
    ).toBeUndefined();
  });
});

describe('rapport dû au bailleur, échu et non transmis', () => {
  it('le signale', async () => {
    const a = trouver(
      await anomalies([
        {
          reference: 'UE-2026-001',
          dateFin: FUTURE,
          rapports: [{ intitule: 'Rapport financier S1', dateEcheance: PASSEE, dateTransmission: null }],
        },
      ]),
      'RAPPORT_BAILLEUR_NON_TRANSMIS',
    );
    expect(a).toBeDefined();
    expect(a!.occurrences[0].detail).toContain('Rapport financier S1');
    // Ce n'est pas une omission administrative · c'est la tranche suivante.
    expect(a!.consequence).toContain('tranche suivante');
  });

  it('se tait sur un rapport transmis, même en retard', async () => {
    expect(
      trouver(
        await anomalies([
          {
            reference: 'UE-2026-001',
            dateFin: FUTURE,
            rapports: [{ intitule: 'Rapport S1', dateEcheance: PASSEE, dateTransmission: new Date('2026-08-01') }],
          },
        ]),
        'RAPPORT_BAILLEUR_NON_TRANSMIS',
      ),
    ).toBeUndefined();
  });
});

describe('engagement déclaré ferme, sans écrit signé', () => {
  it("le signale, et rappelle les DEUX conditions du § 5.4.2.4", async () => {
    const a = trouver(
      await anomalies([{ reference: 'UE-2026-001', dateFin: FUTURE, ecritSigne: false }]),
      'ENGAGEMENT_FERME_SANS_ECRIT_SIGNE',
    );
    expect(a).toBeDefined();
    expect(a!.gravite).toBe('INFORMATION');
    expect(a!.consequence).toContain('§ 5.4.2.4');
    expect(a!.consequence).toContain('écrit signé');
  });

  it("se tait sur un CONDITIONNEL sans écrit · il n'a jamais prétendu à une créance", async () => {
    expect(
      trouver(
        await anomalies([
          { reference: 'UE-2026-001', dateFin: FUTURE, caractere: 'CONDITIONNEL', ecritSigne: false },
        ]),
        'ENGAGEMENT_FERME_SANS_ECRIT_SIGNE',
      ),
    ).toBeUndefined();
  });
});

describe('cloisonnement du contrôle', () => {
  it("ne s'exécute pas sur un dossier SYSCOHADA", async () => {
    // La convention de financement suit le bailleur, notion de la division 46
    // du SYCEBNL. En SYSCOHADA le 46 porte les apporteurs et le groupe.
    const as = await anomalies([{ reference: 'UE-2026-001', dateFin: PASSEE }], Referentiel.SYSCOHADA);
    expect(trouver(as, 'CONVENTION_FINANCEMENT_EXPIREE')).toBeUndefined();
    expect(trouver(as, 'ENGAGEMENT_FERME_SANS_ECRIT_SIGNE')).toBeUndefined();
  });
});
