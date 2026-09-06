import { RoleMembreInventaire, StatutCampagneInventaire } from '@prisma/client';
import { InventaireService } from './inventaire.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * LE PROCÈS-VERBAL DE COMPTAGE D'UNE CAISSE · un par caisse, et un seul.
 *
 * CE QUI MANQUAIT. Le PV de la CAMPAGNE porte l'inventaire physique dans son
 * ensemble. Il ne peut pas porter le comptage des espèces : le CPCC demande
 * « A-t-on tenu compte de la caisse SIÈGE, de la caisse AGENCE, de la caisse
 * DE SECOURS ? », trois caisses comptées à trois endroits, chacune par sa
 * sous-commission et chacune à son heure. Un seul PV pour les trois ne dit
 * plus laquelle a été comptée ni par qui, et la caisse d'agence oubliée passe
 * la clôture sans que rien ne l'arrête.
 *
 * CE QUE LE MODULE NE DIT PAS, ET NE DIRA PAS. Aucune source lue ne définit le
 * contenu de l'« attestation » que le CPCC réclame après le comptage. Le
 * module en enregistre l'existence, sa date et son signataire, et laisse le
 * document au cabinet · inventer ses mentions produirait un modèle qui aurait
 * l'air officiel sans l'être. Le dernier bloc de ce fichier fige cette
 * abstention.
 */

type Etat = {
  campagne?: Record<string, unknown>;
  /** Les sous-commissions de la campagne · le faux HONORE le filtre par id. */
  sousCommissions?: Record<string, unknown>[];
  sousCommission?: Record<string, unknown> | null;
  compte?: Record<string, unknown> | null;
  lignesCaisse?: { debit: number; credit: number; compte: { id: string; numero: string; intitule: string } }[];
  pvCaisse?: { compteId: string }[];
  ecartsSansDecision?: number;
};

function service(etat: Etat = {}) {
  const creerPv = jest.fn().mockImplementation((a: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'pv1', ...a.data }),
  );
  const prisma = {
    campagneInventaire: {
      findFirst: jest.fn().mockResolvedValue(etat.campagne ?? null),
      update: jest.fn().mockImplementation((a: { data: unknown }) => Promise.resolve({ id: 'camp1', ...(a.data as object) })),
    },
    sousCommissionInventaire: {
      // Le faux HONORE `where.id` · sans cela, un service qui cesserait de
      // filtrer sur la sous-commission demandée passerait inaperçu, et le PV
      // d'une caisse s'appuierait sur les signatures d'une autre.
      findFirst: jest.fn().mockImplementation((args: { where?: { id?: string } }) => {
        const toutes = etat.sousCommissions ?? (etat.sousCommission ? [etat.sousCommission] : []);
        const voulue = args?.where?.id;
        return Promise.resolve(voulue ? (toutes.find((sc) => sc.id === voulue) ?? null) : (toutes[0] ?? null));
      }),
    },
    compte: { findFirst: jest.fn().mockResolvedValue(etat.compte ?? null) },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue(etat.lignesCaisse ?? []) },
    procesVerbalComptageCaisse: {
      findMany: jest.fn().mockResolvedValue(etat.pvCaisse ?? []),
      create: creerPv,
    },
    ecartInventaire: { count: jest.fn().mockResolvedValue(etat.ecartsSansDecision ?? 0) },
  } as unknown as PrismaService;
  return { svc: new InventaireService(prisma, {} as unknown as EcritureService), creerPv };
}

const CAMPAGNE = {
  id: 'camp1',
  tenantId: 't1',
  exerciceId: 'ex1',
  statut: StatutCampagneInventaire.RECENSEMENT,
};
const CAISSE = { id: 'c57', numero: '57100000', intitule: 'Caisse siège' };
const COMMISSION_COMPLETE = {
  id: 'sc1',
  nom: 'Caisses',
  membres: [{ role: RoleMembreInventaire.INVENTORIANT }, { role: RoleMembreInventaire.TEMOIN }],
};

const pv = (extra: Record<string, unknown> = {}) => ({
  compteId: 'c57',
  sousCommissionId: 'sc1',
  dateComptage: '2026-12-31',
  soldeComptable: 1_250_000,
  especesComptees: 1_250_000,
  ...extra,
});

describe('la caisse est un 57, et rien d’autre', () => {
  it('refuse un compte de banque · une banque ne se compte pas, elle se circularise', async () => {
    const { svc } = service({
      campagne: CAMPAGNE,
      compte: { id: 'c52', numero: '52100000', intitule: 'Banque' },
      sousCommission: COMMISSION_COMPLETE,
    });
    await expect(svc.etablirPvCaisse('t1', 'camp1', 'u1', pv({ compteId: 'c52' }) as never)).rejects.toThrow(
      /circularisation/,
    );
  });

  it('accepte un 57', async () => {
    const { svc, creerPv } = service({ campagne: CAMPAGNE, compte: CAISSE, sousCommission: COMMISSION_COMPLETE });
    await svc.etablirPvCaisse('t1', 'camp1', 'u1', pv() as never);
    expect(creerPv.mock.calls[0][0].data.compteId).toBe('c57');
  });
});

describe('le PV se signe par ceux qui ont compté ET par ceux qui ont assisté', () => {
  const cas = [
    { membres: [], manque: 'un inventoriant et un témoin' },
    { membres: [{ role: RoleMembreInventaire.INVENTORIANT }], manque: 'un témoin' },
    { membres: [{ role: RoleMembreInventaire.TEMOIN }], manque: 'un inventoriant' },
  ];

  it('nomme ce qui manque, cas par cas', () => {
    for (const c of cas) {
      expect({ n: c.membres.length, manque: InventaireService.signaturesManquantes(c.membres) }).toEqual({
        n: c.membres.length,
        manque: c.manque,
      });
    }
    expect(InventaireService.signaturesManquantes(COMMISSION_COMPLETE.membres)).toBeNull();
  });

  it('refuse le PV et cite la sous-commission concernée', async () => {
    const { svc } = service({
      campagne: CAMPAGNE,
      compte: CAISSE,
      sousCommission: { id: 'sc1', nom: 'Caisses agences', membres: [{ role: RoleMembreInventaire.INVENTORIANT }] },
    });
    await expect(svc.etablirPvCaisse('t1', 'camp1', 'u1', pv() as never)).rejects.toThrow(/Caisses agences/);
    await expect(svc.etablirPvCaisse('t1', 'camp1', 'u1', pv() as never)).rejects.toThrow(/un témoin/);
  });

  it('vérifie les signatures de SA sous-commission, pas de la campagne', async () => {
    // Deux sous-commissions sur la même campagne. La PREMIÈRE est complète ;
    // la seconde n'a personne. Un service qui cesserait de filtrer sur la
    // sous-commission demandée trouverait la première et laisserait passer.
    const { svc } = service({
      campagne: CAMPAGNE,
      compte: CAISSE,
      sousCommissions: [
        COMMISSION_COMPLETE,
        { id: 'sc2', nom: 'Caisse de secours', membres: [] },
      ],
    });
    await expect(svc.etablirPvCaisse('t1', 'camp1', 'u1', pv({ sousCommissionId: 'sc2' }) as never)).rejects.toThrow(
      /Caisse de secours/,
    );
  });
});

describe('la ventilation par coupure doit égaler le total qu’elle justifie', () => {
  it('refuse un détail qui ne totalise pas le comptage', async () => {
    const { svc } = service({ campagne: CAMPAGNE, compte: CAISSE, sousCommission: COMMISSION_COMPLETE });
    await expect(
      svc.etablirPvCaisse(
        't1',
        'camp1',
        'u1',
        pv({
          especesComptees: 1_250_000,
          coupures: [
            { valeurUnitaire: 20_000, nombre: 50 },
            { valeurUnitaire: 5_000, nombre: 40 },
          ],
        }) as never,
      ),
    ).rejects.toThrow(/Le détail doit égaler le montant qu’il justifie|détail doit égaler/);
  });

  it('accepte un détail qui tombe juste', async () => {
    const { svc, creerPv } = service({ campagne: CAMPAGNE, compte: CAISSE, sousCommission: COMMISSION_COMPLETE });
    await svc.etablirPvCaisse(
      't1',
      'camp1',
      'u1',
      pv({
        especesComptees: 1_250_000,
        coupures: [
          { valeurUnitaire: 20_000, nombre: 60 },
          { valeurUnitaire: 5_000, nombre: 10 },
        ],
      }) as never,
    );
    expect(creerPv).toHaveBeenCalled();
  });

  it('n’exige aucune ventilation · c’est un ajout de l’éditeur, pas une règle', async () => {
    const { svc, creerPv } = service({ campagne: CAMPAGNE, compte: CAISSE, sousCommission: COMMISSION_COMPLETE });
    await svc.etablirPvCaisse('t1', 'camp1', 'u1', pv() as never);
    expect(creerPv).toHaveBeenCalled();
  });
});

describe('l’écart est figé sur le PV', () => {
  it('calcule espèces comptées moins solde comptable', async () => {
    const { svc, creerPv } = service({ campagne: CAMPAGNE, compte: CAISSE, sousCommission: COMMISSION_COMPLETE });
    await svc.etablirPvCaisse(
      't1',
      'camp1',
      'u1',
      pv({ soldeComptable: 1_250_000, especesComptees: 1_180_000 }) as never,
    );
    expect(creerPv.mock.calls[0][0].data.ecart).toBe(-70_000);
    // Le solde comptable est COPIÉ sur le PV, jamais relu · un règlement passé
    // le lendemain déplacerait la cible et refermerait l'écart tout seul.
    expect(creerPv.mock.calls[0][0].data.soldeComptableFige).toBe(1_250_000);
  });
});

describe('l’attestation, et ce que le corpus n’en dit pas', () => {
  it('refuse une attestation sans signataire', async () => {
    const { svc } = service({ campagne: CAMPAGNE, compte: CAISSE, sousCommission: COMMISSION_COMPLETE });
    await expect(
      svc.etablirPvCaisse('t1', 'camp1', 'u1', pv({ attestationEtablieLe: '2026-12-31' }) as never),
    ).rejects.toThrow(/atteste de rien/);
  });

  it('enregistre son existence, sa date et son signataire · et rien d’autre', async () => {
    const { svc, creerPv } = service({ campagne: CAMPAGNE, compte: CAISSE, sousCommission: COMMISSION_COMPLETE });
    await svc.etablirPvCaisse(
      't1',
      'camp1',
      'u1',
      pv({ attestationEtablieLe: '2026-12-31', attestationPar: 'Mme la caissière principale' }) as never,
    );
    const data = creerPv.mock.calls[0][0].data;
    expect(data.attestationPar).toBe('Mme la caissière principale');
    // AUCUNE MENTION DE CONTENU. Le corpus ne définit pas ce que l'attestation
    // porte · si un champ de contenu apparaît un jour ici, il aura été
    // inventé, et il aura l'air officiel.
    expect(Object.keys(data).filter((k) => k.startsWith('attestation')).sort()).toEqual([
      'attestationEtablieLe',
      'attestationPar',
    ]);
  });
});

describe('la couverture des caisses · la question composite rendue mécanique', () => {
  const ligne = (id: string, numero: string, debit: number) => ({
    debit,
    credit: 0,
    compte: { id, numero, intitule: `Caisse ${numero}` },
  });

  it('liste les caisses à solde non nul sans PV', async () => {
    const { svc } = service({
      campagne: CAMPAGNE,
      lignesCaisse: [ligne('c1', '57100000', 900_000), ligne('c2', '57200000', 400_000)],
      pvCaisse: [{ compteId: 'c1' }],
    });
    const manquantes = await svc.caissesNonComptees('t1', 'camp1');
    expect(manquantes.map((c) => c.numero)).toEqual(['57200000']);
  });

  it('ne réclame rien d’une caisse à solde nul · une caisse fermée n’a rien à compter', async () => {
    const { svc } = service({
      campagne: CAMPAGNE,
      lignesCaisse: [{ debit: 500_000, credit: 500_000, compte: { id: 'c3', numero: '57300000', intitule: 'Caisse soldée' } }],
      pvCaisse: [],
    });
    expect(await svc.caissesNonComptees('t1', 'camp1')).toEqual([]);
  });

  it('refuse la clôture tant qu’une caisse n’est pas comptée', async () => {
    const { svc } = service({
      campagne: { ...CAMPAGNE, statut: StatutCampagneInventaire.ARBITRAGE },
      lignesCaisse: [ligne('c2', '57200000', 400_000)],
      pvCaisse: [],
    });
    await expect(svc.clore('t1', 'camp1', 'u1')).rejects.toThrow(/57200000/);
    await expect(svc.clore('t1', 'camp1', 'u1')).rejects.toThrow(/ne se recompte plus jamais/);
  });

  it('laisse clore quand chaque caisse a son PV', async () => {
    const { svc } = service({
      campagne: { ...CAMPAGNE, statut: StatutCampagneInventaire.ARBITRAGE },
      lignesCaisse: [ligne('c2', '57200000', 400_000)],
      pvCaisse: [{ compteId: 'c2' }],
    });
    await expect(svc.clore('t1', 'camp1', 'u1')).resolves.toBeDefined();
  });

  it('laisse passer l’écart non arbitré en PREMIER · c’est le refus le plus ancien', async () => {
    const { svc } = service({
      campagne: { ...CAMPAGNE, statut: StatutCampagneInventaire.ARBITRAGE },
      lignesCaisse: [ligne('c2', '57200000', 400_000)],
      pvCaisse: [],
      ecartsSansDecision: 2,
    });
    await expect(svc.clore('t1', 'camp1', 'u1')).rejects.toThrow(/sans décision/);
  });
});
