import {
  CycleCircularisation,
  FormeConfirmation,
  NatureEcartConfirmation,
  StatutCampagneCircularisation,
  StatutDemandeConfirmation,
} from '@prisma/client';
import { CircularisationService } from './circularisation.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * CIRCULARISATION · CE QUI CASSERAIT EN SILENCE.
 *
 * Le défaut central de cette procédure ne produit aucune erreur : il produit
 * un DOSSIER PRÉSENTABLE. Quarante lettres parties, six revenues, et les
 * trente-quatre autres comptées comme « pas de désaccord ». La balance
 * auxiliaire est réputée confirmée, le taux de réponse n'est écrit nulle part,
 * et rien à l'écran ne dit que la procédure n'a rien établi.
 *
 * ISA 505 § 12 est catégorique : « in the case of EACH non-response, the
 * auditor shall perform ALTERNATIVE audit procedures ». C'est ce refus-là que
 * ce fichier fige, avec trois autres :
 *
 *  - un écart ne se solde pas, il se qualifie (§ 14 et § A22) ;
 *  - la demande négative est enfermée dans ses quatre conditions (§ 15) ;
 *  - une réponse parvenue par l'entité n'est pas revenue directement (§ 7 c).
 */

const EXERCICE = { id: 'ex1', tenantId: 't1', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };

type Etat = {
  campagne?: Record<string, unknown>;
  demandes?: Record<string, unknown>[];
  balance?: { compteId: string; numero: string; intitule: string; solde: number; typeCompte?: string }[];
};

function service(etat: Etat = {}) {
  const majCampagne = jest.fn().mockImplementation((a) => Promise.resolve({ ...(etat.campagne ?? {}), ...a.data }));
  const majDemande = jest.fn().mockImplementation((a) => Promise.resolve({ id: a.where.id, ...a.data }));
  const prisma = {
    exercice: { findFirst: jest.fn().mockResolvedValue(EXERCICE) },
    compte: { findFirst: jest.fn().mockResolvedValue({ id: 'c1', numero: '40110000' }) },
    campagneCircularisation: {
      findFirst: jest.fn().mockResolvedValue(etat.campagne ?? null),
      create: jest.fn().mockImplementation((a) => Promise.resolve({ id: 'camp1', ...a.data })),
      update: majCampagne,
      findMany: jest.fn().mockResolvedValue([]),
    },
    demandeConfirmation: {
      findFirst: jest.fn().mockResolvedValue(etat.demandes?.[0] ?? null),
      findMany: jest.fn().mockResolvedValue(etat.demandes ?? []),
      create: jest.fn().mockImplementation((a) => Promise.resolve({ id: 'd1', ...a.data })),
      update: majDemande,
      updateMany: jest.fn().mockResolvedValue({ count: (etat.demandes ?? []).length }),
      count: jest.fn().mockResolvedValue((etat.demandes ?? []).length),
    },
    $transaction: jest.fn().mockImplementation((ops: unknown[]) => Promise.all(ops)),
  } as unknown as PrismaService;
  const ecritures = {
    balance: jest.fn().mockResolvedValue({ lignes: etat.balance ?? [], totaux: { debit: 0, credit: 0 } }),
  } as unknown as EcritureService;
  return { svc: new CircularisationService(prisma, ecritures), majCampagne, majDemande, prisma };
}

const campagne = (statut: StatutCampagneCircularisation, extra: Record<string, unknown> = {}) => ({
  id: 'camp1',
  tenantId: 't1',
  exerciceId: 'ex1',
  cycle: CycleCircularisation.FOURNISSEURS,
  statut,
  ...extra,
});

const demande = (o: Partial<Record<string, unknown>> = {}) => ({
  id: 'd1',
  tenantId: 't1',
  campagneId: 'camp1',
  soldeAConfirmer: 1_000_000,
  statut: StatutDemandeConfirmation.ENVOYEE,
  proceduresAlternatives: null,
  ecart: null,
  natureEcart: null,
  reponseIndirecte: false,
  campagne: campagne(StatutCampagneCircularisation.ENVOYEE),
  ...o,
});

// ---------------------------------------------------------------------------
// § 15 · la demande négative est enfermée
// ---------------------------------------------------------------------------

describe('forme négative · ISA 505 § 15, quatre conditions cumulatives', () => {
  const base = {
    exerciceId: 'ex1',
    libelle: 'Fournisseurs 2026',
    dateArrete: '2026-12-31',
    cycle: CycleCircularisation.FOURNISSEURS,
  };

  it('REFUSE la forme négative sans les quatre conditions, et les nomme', async () => {
    const { svc } = service();
    await expect(
      svc.creer('t1', 'u1', { ...base, forme: FormeConfirmation.NEGATIVE, conditionsNegativeReunies: [] }),
    ).rejects.toThrow(/§ 15/);
  });

  it('REFUSE trois conditions sur quatre · elles sont cumulatives', async () => {
    const { svc } = service();
    await expect(
      svc.creer('t1', 'u1', {
        ...base,
        forme: FormeConfirmation.NEGATIVE,
        conditionsNegativeReunies: CircularisationService.CONDITIONS_NEGATIVE.slice(0, 3) as unknown as string[],
      }),
    ).rejects.toThrow(/AUCUNE_RAISON_DE_CROIRE_A_UN_REJET/);
  });

  it('accepte la forme négative quand les quatre sont déclarées', async () => {
    const { svc } = service();
    const c = await svc.creer('t1', 'u1', {
      ...base,
      forme: FormeConfirmation.NEGATIVE,
      conditionsNegativeReunies: [...CircularisationService.CONDITIONS_NEGATIVE],
    });
    expect(c.forme).toBe(FormeConfirmation.NEGATIVE);
  });

  it('la forme positive ne demande rien · c’est la plus probante', async () => {
    const { svc } = service();
    const c = await svc.creer('t1', 'u1', base);
    expect(c.forme).toBe(FormeConfirmation.POSITIVE);
  });
});

// ---------------------------------------------------------------------------
// § 14 et § A22 · un écart se qualifie, il ne se solde pas
// ---------------------------------------------------------------------------

describe('dépouillement · l’écart et son investigation', () => {
  it('REFUSE une réponse reçue sans solde confirmé · zéro EST une réponse', async () => {
    const { svc } = service({ demandes: [demande()] });
    await expect(
      svc.depouiller('t1', 'd1', { statut: StatutDemandeConfirmation.REPONSE_RECUE }),
    ).rejects.toThrow(/zéro EST une réponse/);
  });

  it('accepte un solde confirmé de ZÉRO · « je ne vous dois rien »', async () => {
    const { svc, majDemande } = service({ demandes: [demande()] });
    await svc.depouiller('t1', 'd1', {
      statut: StatutDemandeConfirmation.REPONSE_RECUE,
      soldeConfirme: 0,
      natureEcart: NatureEcartConfirmation.ANOMALIE_POTENTIELLE,
      investigation: 'Le fournisseur ne reconnaît aucune dette · facture à retrouver.',
    });
    expect(majDemande.mock.calls[0][0].data.ecart).toBe(-1_000_000);
  });

  it('REFUSE un écart non qualifié · § 14 impose de l’investiguer', async () => {
    const { svc } = service({ demandes: [demande()] });
    await expect(
      svc.depouiller('t1', 'd1', { statut: StatutDemandeConfirmation.REPONSE_RECUE, soldeConfirme: 900_000 }),
    ).rejects.toThrow(/§ 14/);
  });

  it('REFUSE un écart qualifié sans résultat d’investigation', async () => {
    const { svc } = service({ demandes: [demande()] });
    await expect(
      svc.depouiller('t1', 'd1', {
        statut: StatutDemandeConfirmation.REPONSE_RECUE,
        soldeConfirme: 900_000,
        natureEcart: NatureEcartConfirmation.DELAI,
      }),
    ).rejects.toThrow(/investigation/);
  });

  it('laisse passer une réponse SANS écart, sans rien exiger', async () => {
    const { svc, majDemande } = service({ demandes: [demande()] });
    await svc.depouiller('t1', 'd1', {
      statut: StatutDemandeConfirmation.REPONSE_RECUE,
      soldeConfirme: 1_000_000,
    });
    expect(majDemande.mock.calls[0][0].data).toMatchObject({ ecart: 0, natureEcart: null });
  });

  it('marque le doute quand la réponse est passée par l’entité · § 7 c) et § 10', async () => {
    const { svc, majDemande } = service({ demandes: [demande()] });
    await svc.depouiller('t1', 'd1', {
      statut: StatutDemandeConfirmation.REPONSE_RECUE,
      soldeConfirme: 1_000_000,
      reponseIndirecte: true,
    });
    // La réponse n'est pas disqualifiée · le doute est INSCRIT, ce qui n'est
    // pas la même chose que de le taire.
    expect(majDemande.mock.calls[0][0].data.doutefiabilite).toMatch(/§ 7 c\)/);
  });

  it('efface le solde et l’écart quand la demande bascule en non-réponse', async () => {
    const { svc, majDemande } = service({ demandes: [demande({ soldeConfirme: 900_000, ecart: -100_000 })] });
    await svc.depouiller('t1', 'd1', { statut: StatutDemandeConfirmation.SANS_REPONSE });
    // Un écart survivant à la bascule ferait passer une non-réponse pour une
    // réponse discordante · deux choses très différentes au dossier.
    expect(majDemande.mock.calls[0][0].data).toMatchObject({ soldeConfirme: null, ecart: null, natureEcart: null });
  });
});

// ---------------------------------------------------------------------------
// § 12 · une non-réponse n'est pas une confirmation
// ---------------------------------------------------------------------------

describe('clôture · le refus qui donne sa valeur au module', () => {
  it('REFUSE de clore sur une non-réponse sans procédure alternative', async () => {
    const { svc } = service({
      campagne: campagne(StatutCampagneCircularisation.RELANCEE),
      demandes: [
        demande({ statut: StatutDemandeConfirmation.REPONSE_RECUE }),
        demande({ id: 'd2', statut: StatutDemandeConfirmation.SANS_REPONSE }),
      ],
    });
    await expect(svc.clore('t1', 'camp1', 'u1', {})).rejects.toThrow(/§ 12/);
  });

  it('REFUSE aussi sur une lettre revenue NON DISTRIBUÉE · § 6 d) la range en non-réponse', async () => {
    const { svc } = service({
      campagne: campagne(StatutCampagneCircularisation.RELANCEE),
      demandes: [demande({ statut: StatutDemandeConfirmation.NON_DISTRIBUEE })],
    });
    await expect(svc.clore('t1', 'camp1', 'u1', {})).rejects.toThrow(/§ 12/);
  });

  it('REFUSE de clore sur une demande restée « envoyée » · ni confirmée ni traitée', async () => {
    const { svc } = service({
      campagne: campagne(StatutCampagneCircularisation.ENVOYEE),
      demandes: [demande({ statut: StatutDemandeConfirmation.ENVOYEE })],
    });
    await expect(svc.clore('t1', 'camp1', 'u1', {})).rejects.toThrow(/en attente/);
  });

  it('clôt quand chaque non-réponse porte sa procédure alternative', async () => {
    const { svc, majCampagne } = service({
      campagne: campagne(StatutCampagneCircularisation.RELANCEE),
      demandes: [
        demande({ statut: StatutDemandeConfirmation.REPONSE_RECUE }),
        demande({
          id: 'd2',
          statut: StatutDemandeConfirmation.SANS_REPONSE,
          proceduresAlternatives: 'Décaissements postérieurs examinés au 15/02, bons de réception rapprochés.',
        }),
      ],
    });
    await svc.clore('t1', 'camp1', 'u1', {});
    expect(majCampagne.mock.calls[0][0].data.statut).toBe(StatutCampagneCircularisation.CLOTUREE);
  });

  it('ne consigne des procédures alternatives que sur une non-réponse', async () => {
    const { svc } = service({ demandes: [demande({ statut: StatutDemandeConfirmation.REPONSE_RECUE })] });
    await expect(
      svc.consignerProceduresAlternatives('t1', 'd1', { proceduresAlternatives: 'Encaissements postérieurs' }),
    ).rejects.toThrow(/NON-RÉPONSE/);
  });
});

// ---------------------------------------------------------------------------
// L'échantillon et les deux taux
// ---------------------------------------------------------------------------

describe('échantillon proposé · une matière, pas une sélection', () => {
  it('retient les racines du cycle et écarte les soldes nuls', async () => {
    const { svc } = service({
      campagne: campagne(StatutCampagneCircularisation.PREPARATION),
      balance: [
        { compteId: 'a', numero: '40110000', intitule: 'Fournisseur A', solde: -3_000_000 },
        { compteId: 'b', numero: '40120000', intitule: 'Fournisseur B', solde: -1_000_000 },
        { compteId: 'c', numero: '40130000', intitule: 'Fournisseur C', solde: 0 },
        { compteId: 'd', numero: '41110000', intitule: 'Client', solde: -9_000_000 },
        { compteId: 'e', numero: '40', intitule: 'Fournisseurs', solde: -4_000_000, typeCompte: 'TOTAL' },
      ],
    });
    const r = await svc.echantillonPropose('t1', 'camp1');
    // Le client est d'un autre cycle, le solde nul ne confirme rien, et le
    // compte Total double le cycle entier.
    expect(r.candidats.map((c) => c.numero)).toEqual(['40110000', '40120000']);
    expect(r.totalCycle).toBe(4_000_000);
    expect(r.candidats[0].poids).toBe(75);
  });

  it('classe du plus gros au plus petit, en valeur absolue', async () => {
    const { svc } = service({
      campagne: campagne(StatutCampagneCircularisation.PREPARATION),
      balance: [
        { compteId: 'a', numero: '40110000', intitule: 'A', solde: -100 },
        { compteId: 'b', numero: '40120000', intitule: 'B', solde: -5_000 },
      ],
    });
    const r = await svc.echantillonPropose('t1', 'camp1');
    expect(r.candidats.map((c) => c.numero)).toEqual(['40120000', '40110000']);
  });

  it('les racines suivent le cycle du CPCC', () => {
    expect(CircularisationService.racinesDuCycle(CycleCircularisation.BANQUES)).toEqual(['52', '53']);
    expect(CircularisationService.racinesDuCycle(CycleCircularisation.FOURNISSEURS)).toEqual(['40']);
    expect(CircularisationService.racinesDuCycle(CycleCircularisation.CLIENTS_ADHERENTS)).toEqual(['41']);
    // « dettes sociales/fiscales/autres », « compte personnel », « débiteurs
    // divers » · le CPCC les demande tous en balance auxiliaire par âge.
    expect(CircularisationService.racinesDuCycle(CycleCircularisation.AUTRES_TIERS)).toEqual(['42', '43', '44', '47']);
  });
});

describe('synthèse · deux taux qui ne disent pas la même chose', () => {
  it('sépare le taux de réponse du taux de couverture', async () => {
    const demandes = [
      { id: '1', statut: StatutDemandeConfirmation.REPONSE_RECUE, soldeAConfirmer: 80_000_000, ecart: 0, natureEcart: null, reponseIndirecte: false, proceduresAlternatives: null },
      { id: '2', statut: StatutDemandeConfirmation.SANS_REPONSE, soldeAConfirmer: 5_000_000, ecart: null, natureEcart: null, reponseIndirecte: false, proceduresAlternatives: 'Encaissements postérieurs' },
      { id: '3', statut: StatutDemandeConfirmation.SANS_REPONSE, soldeAConfirmer: 5_000_000, ecart: null, natureEcart: null, reponseIndirecte: false, proceduresAlternatives: null },
      { id: '4', statut: StatutDemandeConfirmation.NON_DISTRIBUEE, soldeAConfirmer: 10_000_000, ecart: null, natureEcart: null, reponseIndirecte: false, proceduresAlternatives: null },
    ];
    const prisma = {
      campagneCircularisation: { findFirst: jest.fn().mockResolvedValue({ id: 'camp1', demandes }) },
    } as unknown as PrismaService;
    const svc = new CircularisationService(prisma, {} as unknown as EcritureService);
    const { synthese } = await svc.consulter('t1', 'camp1');
    // Une réponse sur quatre lettres, mais elle couvre 80 % du solde envoyé.
    // C'est le second chiffre qui dit si la procédure a établi quelque chose.
    expect(synthese).toMatchObject({
      envoyees: 4,
      reponses: 1,
      nonReponses: 3,
      nonReponsesSansProcedure: 2,
      tauxReponse: 25,
      tauxCouverture: 80,
    });
  });
});
