import { JeuEtatsFinanciersSycebnl } from '@prisma/client';
import { ControlesService } from './controles.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * LE PASSAGE PAR LE TIERS · SYCEBNL, Partie 3, ch. 3, § 2.2 et 2.4.
 *
 * Une charge se constate contre un tiers, puis le tiers se solde contre la
 * trésorerie. Ce contrôle repère l'écriture qui court-circuite le tiers, sans
 * crier à tort sur les trois cas où le référentiel ne l'exige pas : les
 * produits, le Système minimal de trésorerie, et l'écriture où le tiers est
 * bien présent.
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

function service(
  ecritures: ReturnType<typeof ecriture>[],
  jeu: JeuEtatsFinanciersSycebnl = JeuEtatsFinanciersSycebnl.ASSOCIATIONS_ORDRES_PROFESSIONNELS,
) {
  const prisma = {
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ex',
        dateDebut: new Date('2026-01-01'),
        dateFin: new Date('2026-12-31'),
      }),
    },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 't', jeuEtatsFinanciersSycebnl: jeu }) },
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
  } as unknown as PrismaService;
  return new ControlesService(prisma);
}

const trouver = async (svc: ControlesService) =>
  (await svc.analyser('t', 'ex')).anomalies.find((a) => a.code === 'CHARGE_SANS_TIERS');

describe('charge imputée directement sur la trésorerie', () => {
  it('signale le cas que l’utilisateur a relevé : D/622 par C/521', async () => {
    const svc = service([ecriture('Loyer mai', [ligne('62210000', 300_000), ligne('52110000', 0, 300_000)])]);
    const a = await trouver(svc);
    expect(a).toBeDefined();
    expect(a!.gravite).toBe('AVERTISSEMENT');
    expect(a!.occurrences).toHaveLength(1);
    expect(a!.occurrences[0].montant).toBe(300_000);
  });

  it('laisse passer le schéma correct : la charge contre le tiers', async () => {
    // § 2.2 : 6 ou 8 au débit, 4 comptes de tiers au crédit.
    const svc = service([ecriture('Loyer mai', [ligne('62210000', 300_000), ligne('40110000', 0, 300_000)])]);
    expect(await trouver(svc)).toBeUndefined();
  });

  it('laisse passer le règlement du tiers : le tiers contre la trésorerie', async () => {
    // § 2.4 : 4 au débit, 5 au crédit · aucune charge dans cette écriture.
    const svc = service([ecriture('Règlement bailleur', [ligne('40110000', 300_000), ligne('52110000', 0, 300_000)])]);
    expect(await trouver(svc)).toBeUndefined();
  });

  it('absout l’écriture composée où le tiers est nommé', async () => {
    // Facture et règlement partiel en une écriture : le fournisseur y figure,
    // on sait à qui l'on paie. C'est tout ce que le contrôle cherche.
    const svc = service([
      ecriture('Facture et acompte', [
        ligne('62210000', 300_000),
        ligne('40110000', 0, 100_000),
        ligne('52110000', 0, 200_000),
      ]),
    ]);
    expect(await trouver(svc)).toBeUndefined();
  });

  it('ne dit rien des produits encaissés directement', async () => {
    // Le guide encaisse 57 Caisse par le crédit de 706 et de 7041 : un don
    // reçu en espèces n'a pas de tiers. La règle est asymétrique.
    const svc = service([
      ecriture('Recettes manifestation', [ligne('57100000', 25_000_000), ligne('70600000', 0, 25_000_000)]),
      ecriture('Dons en espèces', [ligne('57100000', 7_000_000), ligne('70410000', 0, 7_000_000)]),
    ]);
    expect(await trouver(svc)).toBeUndefined();
  });

  it('se tait entièrement sur un dossier au Système minimal de trésorerie', async () => {
    // Le postulat de la comptabilité d'engagement réserve lui-même « les
    // dispositions spécifiques concernant le Système Minimal de Trésorerie ».
    const svc = service(
      [ecriture('Loyer mai', [ligne('62210000', 300_000), ligne('52110000', 0, 300_000)])],
      JeuEtatsFinanciersSycebnl.SYSTEME_MINIMAL_TRESORERIE,
    );
    expect(await trouver(svc)).toBeUndefined();
  });

  it('couvre aussi les charges H.A.O. de la classe 8', async () => {
    // Le § 2.2 vise « 6 ou 8 Charges par nature », pas la seule classe 6.
    const svc = service([ecriture('Charge HAO', [ligne('83100000', 500_000), ligne('52110000', 0, 500_000)])]);
    expect(await trouver(svc)).toBeDefined();
  });

  it('ignore les dépréciations de trésorerie (59), qui ne sont pas un décaissement', async () => {
    const svc = service([ecriture('Dépréciation', [ligne('67900000', 50_000), ligne('59000000', 0, 50_000)])]);
    expect(await trouver(svc)).toBeUndefined();
  });

  it('ne se déclenche pas sur un virement interne entre deux trésoreries', async () => {
    const svc = service([ecriture('Virement banque vers caisse', [ligne('57100000', 100_000), ligne('52110000', 0, 100_000)])]);
    expect(await trouver(svc)).toBeUndefined();
  });
});
