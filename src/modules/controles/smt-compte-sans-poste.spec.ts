import { ControlesService } from './controles.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * SMT_COMPTE_SANS_POSTE · docs/audit-modules-par-profil.md. Les modèles SMT
 * des deux textes n'ouvrent aucun poste pour les 15, 19 et 29. OmegaX refuse
 * de les proposer ; une écriture saisie à la main est SIGNALÉE, jamais
 * bloquée, et seulement au SMT.
 */

let idLigne = 0;
function ligne(numero: string, debit: number, credit = 0) {
  idLigne += 1;
  return { id: `l${idLigne}`, debit, credit, lettre: null, compte: { numero, intitule: `Compte ${numero}` } };
}

function ecriture(libelle: string, lignes: ReturnType<typeof ligne>[], date = '2026-05-10') {
  return {
    id: `e-${libelle}`,
    date: new Date(date),
    libelle,
    reference: 'PJ-1',
    numeroPiece: 1,
    createdAt: new Date(date),
    statut: 'VALIDEE',
    journal: { code: 'OD' },
    lignes,
  };
}

function service(ecritures: ReturnType<typeof ecriture>[], regime: Record<string, unknown>) {
  const prisma = {
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ex',
        dateDebut: new Date('2026-01-01'),
        dateFin: new Date('2026-12-31'),
      }),
    },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 't', ...regime }) },
    ecriture: { findMany: jest.fn().mockResolvedValue(ecritures) },
    compte: { findMany: jest.fn().mockResolvedValue([]) },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue([]) },
    // Aucun arrêté d'exonération dans ce dossier de test · le contrôle des
    // échéances douanières n'a rien à signaler, et n'interfère donc pas.
    // Aucun bien repris dans ce dossier de test · le contrôle des
    // immobilisations mises en service avant l'ouverture n'a rien à signaler.
    immobilisation: { findMany: jest.fn().mockResolvedValue([]) },
    exoneration: { findMany: jest.fn().mockResolvedValue([]) },
    // Le contrôle 21 lit le manuel des procédures (AUDCIF art. 16 al. 1) ·
    // sans ce faux, il croirait la table absente plutôt que le manuel.
    manuelProcedures: { findFirst: jest.fn().mockResolvedValue(null) },
    // Dossiers de subvention · vides ici, ces specs ne les testent pas. Sans
    // cette doublure, le contrôle 24 tomberait sur undefined.
    conventionFinancement: { findMany: jest.fn().mockResolvedValue([]) },
    // Mandat du contrôleur des comptes · contrôle 28. Vide ici, ces specs ne
    // le testent pas ; une doublure muette sur une lecture réelle validerait
    // un service qui n'existe pas.
    mandatAuditeur: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;
  return new ControlesService(prisma);
}

const trouver = async (svc: ControlesService) =>
  (await svc.analyser('t', 'ex')).anomalies.find((a) => a.code === 'SMT_COMPTE_SANS_POSTE');

const SMT_SYCEBNL = { referentiel: 'SYCEBNL', jeuEtatsFinanciersSycebnl: 'SYSTEME_MINIMAL_TRESORERIE' };
const SMT_SYSCOHADA = { referentiel: 'SYSCOHADA', systemeComptableSyscohada: 'MINIMAL_TRESORERIE' };
const ASSOCIATIONS = { referentiel: 'SYCEBNL', jeuEtatsFinanciersSycebnl: 'ASSOCIATIONS_ORDRES_PROFESSIONNELS' };
const NORMAL = { referentiel: 'SYSCOHADA', systemeComptableSyscohada: 'NORMAL' };

const provision = ecriture('Provision litige', [ligne('69110000', 500_000), ligne('19110000', 0, 500_000)]);
const depreciation = ecriture('Dépréciation matériel', [ligne('69130000', 200_000), ligne('29410000', 0, 200_000)]);
const reglementee = ecriture('Amortissement dérogatoire', [ligne('85100000', 80_000), ligne('15100000', 0, 80_000)]);
const ordinaire = ecriture('Loyer', [ligne('62220000', 100_000), ligne('52110000', 0, 100_000)]);

describe('un compte que le modèle SMT ne présente pas', () => {
  it.each([
    ['SYCEBNL', SMT_SYCEBNL, /Partie 4 ch\. 4/],
    ['SYSCOHADA', SMT_SYSCOHADA, /Titre X ch\. 2/],
  ])('%s · signale les 15, 19 et 29, avec le texte du référentiel', async (_r, regime, texte) => {
    const a = await trouver(service([provision, depreciation, reglementee, ordinaire], regime));
    expect(a?.gravite).toBe('AVERTISSEMENT');
    expect(a?.consequence).toMatch(texte);
    expect(a?.occurrences.map((o) => o.detail)).toEqual([
      'Provision litige · 19110000',
      'Dépréciation matériel · 29410000',
      'Amortissement dérogatoire · 15100000',
    ]);
    expect(a?.occurrences[0].montant).toBe(500_000);
  });

  it('ne dit rien hors du SMT', async () => {
    for (const regime of [ASSOCIATIONS, NORMAL]) {
      expect(await trouver(service([provision, depreciation], regime))).toBeUndefined();
    }
  });

  it('ne dit rien d’une écriture de clôture, qui reporte un solde', async () => {
    const report = { ...provision, estGenereeParCloture: true };
    expect(await trouver(service([report], SMT_SYSCOHADA))).toBeUndefined();
  });

  it('ne dit rien d’un dossier SMT sans ces comptes', async () => {
    expect(await trouver(service([ordinaire], SMT_SYCEBNL))).toBeUndefined();
  });
});
