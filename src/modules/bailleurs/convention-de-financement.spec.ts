import { ConventionFinancementService } from './convention-financement.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * CONVENTIONS DE FINANCEMENT · le dossier de subvention.
 *
 * SYCEBNL, cadre conceptuel § 5.4.2.4 : « Un engagement de financement est
 * comptabilisé dans les créances à recevoir de l'entité bénéficiaire s'il
 * correspond à un engagement FERME ET INCONDITIONNEL et a fait l'objet d'un
 * ÉCRIT SIGNÉ par les représentants habilités des tiers financeurs. Un
 * engagement CONDITIONNEL doit faire l'objet d'une mention dans les Notes
 * annexes et ne sera comptabilisé que lorsque les conditions sont remplies. »
 *
 * Ce que ces tests gardent est la CONJONCTION : ferme ET écrit signé. Les deux
 * erreurs qu'elle prévient sont muettes · une promesse conditionnelle portée
 * en créance gonfle l'actif, un engagement ferme laissé hors bilan le
 * sous-évalue, et dans les deux cas l'écriture s'équilibre et la balance
 * boucle.
 */

const BAILLEUR = { id: 'b1', code: 'UE-01', nom: 'Union européenne' };

type Faux = Record<string, unknown>;

function service(options: { bailleur?: unknown; convention?: unknown; conventions?: unknown[]; doublon?: unknown; tranche?: unknown } = {}) {
  const prisma = {
    bailleur: { findFirst: jest.fn().mockResolvedValue(options.bailleur === undefined ? BAILLEUR : options.bailleur) },
    conventionFinancement: {
      findFirst: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve('reference' in where ? (options.doublon ?? null) : (options.convention ?? null)),
      ),
      findMany: jest.fn().mockResolvedValue(options.conventions ?? []),
      create: jest.fn().mockImplementation(({ data }: { data: unknown }) => Promise.resolve({ id: 'c1', ...(data as object) })),
      update: jest.fn().mockImplementation(({ data }: { data: unknown }) => Promise.resolve({ id: 'c1', ...(data as object) })),
    },
    trancheFinancement: {
      findFirst: jest.fn().mockResolvedValue(options.tranche ?? null),
      create: jest.fn().mockImplementation(({ data }: { data: unknown }) => Promise.resolve({ id: 't1', ...(data as object) })),
      update: jest.fn().mockImplementation(({ data }: { data: unknown }) => Promise.resolve({ id: 't1', ...(data as object) })),
      delete: jest.fn().mockResolvedValue({}),
    },
    rapportBailleur: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }: { data: unknown }) => Promise.resolve({ id: 'r1', ...(data as object) })),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
  } as Faux;
  return { service: new ConventionFinancementService(prisma as unknown as PrismaService), prisma };
}

const DTO = {
  bailleurId: 'b1',
  reference: 'UE-2026-001',
  objet: 'Programme de santé communautaire',
  ecritSigne: true,
  signataire: 'Chef de délégation',
  dateSignature: '2026-01-15',
  dateDebut: '2026-01-01',
  dateFin: '2028-12-31',
  montantAccorde: 500_000_000,
  caractere: 'FERME_INCONDITIONNEL' as const,
};

describe('§ 5.4.2.4 · ce qui devient une créance, et ce qui reste une mention', () => {
  it('ferme ET écrit signé donne une créance à recevoir', () => {
    expect(
      ConventionFinancementService.traitement({ caractere: 'FERME_INCONDITIONNEL', ecritSigne: true }),
    ).toBe('CREANCE_A_RECEVOIR');
  });

  it("ferme SANS écrit signé ne donne PAS de créance", () => {
    // Le texte pose DEUX conditions et non une · un accord verbal ferme ne se
    // comptabilise pas, si sûr que le cabinet en soit.
    expect(
      ConventionFinancementService.traitement({ caractere: 'FERME_INCONDITIONNEL', ecritSigne: false }),
    ).toBe('MENTION_NOTES_ANNEXES');
  });

  it("conditionnel ne donne PAS de créance, même avec un écrit signé", () => {
    // Signer un engagement conditionnel ne le rend pas inconditionnel · la
    // condition reste, et l'argent peut ne jamais venir.
    expect(
      ConventionFinancementService.traitement({ caractere: 'CONDITIONNEL', ecritSigne: true }),
    ).toBe('MENTION_NOTES_ANNEXES');
  });
});

describe('les mentions de Notes annexes que le texte impose', () => {
  it("rend une phrase par engagement conditionnel, avec ses conditions et son reste", async () => {
    const { service: s } = service({
      conventions: [
        {
          reference: 'UE-2026-002',
          objet: 'Volet nutrition',
          montantAccorde: 200_000_000,
          conditions: 'Rapport d’évaluation à mi-parcours jugé satisfaisant',
          statut: 'EN_COURS',
          bailleur: { code: 'UE-01', nom: 'Union européenne' },
          tranches: [{ montantEncaisse: 50_000_000 }],
        },
      ],
    });
    const [mention] = await s.mentionsEngagementsConditionnels('t1');
    expect(mention).toContain('CONDITIONNEL');
    expect(mention).toContain('Rapport d’évaluation à mi-parcours');
    expect(mention).toContain((150_000_000).toLocaleString('fr-FR'));
    expect(mention).toContain('§ 5.4.2.4');
  });

  it("ne lit que les CONDITIONNELS non résiliés", async () => {
    const { service: s, prisma } = service({ conventions: [] });
    await s.mentionsEngagementsConditionnels('t1');
    const where = (prisma.conventionFinancement as { findMany: jest.Mock }).findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe('t1');
    expect(where.caractere).toBe('CONDITIONNEL');
    expect(where.statut).toEqual({ not: 'RESILIEE' });
  });
});

describe('les créances à recevoir', () => {
  it("ne retient que les fermes AVEC écrit signé, et pour leur reste", async () => {
    const { service: s, prisma } = service({
      conventions: [
        {
          reference: 'UE-2026-001',
          montantAccorde: 500_000_000,
          statut: 'EN_COURS',
          bailleur: { code: 'UE-01', nom: 'Union européenne' },
          tranches: [{ montantEncaisse: 200_000_000 }],
        },
      ],
    });
    const creances = await s.creancesARecevoir('t1');
    expect(creances[0].resteARecevoir).toBe(300_000_000);
    const where = (prisma.conventionFinancement as { findMany: jest.Mock }).findMany.mock.calls[0][0].where;
    expect(where.caractere).toBe('FERME_INCONDITIONNEL');
    expect(where.ecritSigne).toBe(true);
    expect(where.statut).toBe('EN_COURS');
  });

  it("écarte une convention entièrement encaissée", async () => {
    const { service: s } = service({
      conventions: [
        {
          reference: 'UE-2026-001',
          montantAccorde: 100_000,
          statut: 'EN_COURS',
          bailleur: { code: 'UE-01', nom: 'UE' },
          tranches: [{ montantEncaisse: 100_000 }],
        },
      ],
    });
    expect(await s.creancesARecevoir('t1')).toEqual([]);
  });
});

describe('ce que la création refuse', () => {
  it("refuse un engagement CONDITIONNEL sans ses conditions", async () => {
    // « conditionnel » sans dire à quoi ne se mentionne pas en Notes annexes,
    // et le texte impose la mention.
    const { service: s } = service();
    await expect(
      s.creer('t1', 'u1', { ...DTO, caractere: 'CONDITIONNEL' }),
    ).rejects.toThrow(/doit dire à quoi il est conditionné/i);
  });

  it("refuse un écrit signé sans signataire nommé", async () => {
    // Le texte dit « représentants HABILITÉS » · un écrit signé par quelqu'un
    // d'autre n'engage pas le financeur.
    const { service: s } = service();
    await expect(s.creer('t1', 'u1', { ...DTO, signataire: '  ' })).rejects.toThrow(/signataire/i);
  });

  it('refuse une date de fin antérieure au début', async () => {
    const { service: s } = service();
    await expect(s.creer('t1', 'u1', { ...DTO, dateFin: '2025-01-01' })).rejects.toThrow(/précède sa date de début/i);
  });

  it('refuse un montant nul', async () => {
    const { service: s } = service();
    await expect(s.creer('t1', 'u1', { ...DTO, montantAccorde: 0 })).rejects.toThrow(/strictement positif/i);
  });

  it('refuse deux exemplaires de la même convention chez le même bailleur', async () => {
    // Le doublon doublerait le montant accordé, et donc la créance à recevoir.
    const { service: s } = service({ doublon: { id: 'deja' } });
    await expect(s.creer('t1', 'u1', DTO)).rejects.toThrow(/porte déjà une convention/i);
  });

  it('accepte une convention ordinaire et la borne au dossier', async () => {
    const { service: s, prisma } = service();
    await s.creer('t1', 'u1', DTO);
    expect((prisma.conventionFinancement as { create: jest.Mock }).create.mock.calls[0][0].data).toMatchObject({
      tenantId: 't1',
      bailleurId: 'b1',
      reference: 'UE-2026-001',
      caractere: 'FERME_INCONDITIONNEL',
      ecritSigne: true,
      createdBy: 'u1',
    });
  });
});

describe('la modification vérifie la FUSION, pas le seul envoi', () => {
  it("refuse de passer une convention à CONDITIONNEL sans joindre ses conditions", async () => {
    // Le piège : l'envoi ne porte que `caractere`, et les conditions absentes
    // sont celles de la convention existante, elles aussi nulles. Vérifier le
    // seul envoi laisserait passer un engagement conditionnel sans mention
    // possible.
    const { service: s } = service({
      convention: {
        id: 'c1',
        caractere: 'FERME_INCONDITIONNEL',
        conditions: null,
        ecritSigne: true,
        signataire: 'Chef de délégation',
        montantAccorde: 500_000,
        dateDebut: new Date('2026-01-01'),
        dateFin: new Date('2028-12-31'),
      },
    });
    await expect(s.modifier('t1', 'c1', { caractere: 'CONDITIONNEL' })).rejects.toThrow(
      /doit dire à quoi il est conditionné/i,
    );
  });
});

describe('la clôture et la résiliation', () => {
  it('exige un motif à la RÉSILIATION', async () => {
    // Elle fait tomber le reste à recevoir · un actif ne disparaît pas sans
    // que personne ne puisse dire pourquoi.
    const { service: s } = service({ convention: { id: 'c1', statut: 'EN_COURS' } });
    await expect(s.clore('t1', 'c1', { statut: 'RESILIEE', motif: ' ' })).rejects.toThrow(/motif de résiliation/i);
  });

  it("n'exige pas de motif à la clôture normale", async () => {
    const { service: s } = service({ convention: { id: 'c1', statut: 'EN_COURS' } });
    await expect(s.clore('t1', 'c1', { statut: 'CLOTUREE' })).resolves.toMatchObject({ statut: 'CLOTUREE' });
  });
});

describe('les tranches', () => {
  const CONVENTION = { id: 'c1', montantAccorde: 500_000, tranches: [{ numero: 1, montant: 300_000 }] };

  it('refuse un total de tranches supérieur au montant accordé', async () => {
    // Sinon l'échéancier annoncerait au bailleur un versement qu'aucune
    // convention ne fonde, et le reste à recevoir deviendrait négatif.
    const { service: s } = service({ convention: CONVENTION });
    await expect(
      s.ajouterTranche('t1', 'c1', { numero: 2, libelle: 'Solde', montant: 300_000, datePrevue: '2027-06-30' }),
    ).rejects.toThrow(/dépasserait le montant accordé/i);
  });

  it('accepte une tranche qui tient dans le montant accordé', async () => {
    const { service: s } = service({ convention: CONVENTION });
    await expect(
      s.ajouterTranche('t1', 'c1', { numero: 2, libelle: 'Solde', montant: 200_000, datePrevue: '2027-06-30' }),
    ).resolves.toMatchObject({ numero: 2, montant: 200_000 });
  });

  it('refuse un numéro de tranche déjà pris', async () => {
    const { service: s } = service({ convention: CONVENTION });
    await expect(
      s.ajouterTranche('t1', 'c1', { numero: 1, libelle: 'Doublon', montant: 100_000, datePrevue: '2027-06-30' }),
    ).rejects.toThrow(/existe déjà/i);
  });

  it("refuse d'effacer une tranche encaissée", async () => {
    // Un encaissement effacé ferait remonter le reste à recevoir sans qu'aucun
    // remboursement ne l'explique.
    const { service: s } = service({ tranche: { id: 't1', dateEncaissement: new Date('2026-03-01') } });
    await expect(s.supprimerTranche('t1', 'c1', 't1')).rejects.toThrow(/ne s'efface pas/i);
  });

  it('refuse de ré-encaisser une tranche déjà encaissée', async () => {
    const { service: s } = service({ tranche: { id: 't1', dateEncaissement: new Date('2026-03-01') } });
    await expect(
      s.encaisserTranche('t1', 'c1', 't1', { dateEncaissement: '2026-04-01', montantEncaisse: 10 }),
    ).rejects.toThrow(/déjà encaissée/i);
  });
});

describe('la validité, que le jalon 11 du planning demandait sans donnée', () => {
  it("marque expirée une convention EN COURS dont la date de fin est passée", async () => {
    const { service: s } = service({
      conventions: [
        {
          id: 'c1',
          bailleur: BAILLEUR,
          reference: 'UE-2026-001',
          objet: 'Programme',
          ecritSigne: true,
          signataire: 'X',
          dateSignature: new Date('2024-01-01'),
          dateDebut: new Date('2024-01-01'),
          dateFin: new Date('2025-12-31'),
          montantAccorde: 100_000,
          caractere: 'FERME_INCONDITIONNEL',
          conditions: null,
          statut: 'EN_COURS',
          motifCloture: null,
          tranches: [],
          rapports: [],
        },
      ],
    });
    const [c] = await s.lister('t1', new Date('2026-09-05'));
    expect(c.expiree).toBe(true);
  });

  it('signale une tranche non encaissée dont la date prévue est passée', async () => {
    const { service: s } = service({
      conventions: [
        {
          id: 'c1',
          bailleur: BAILLEUR,
          reference: 'UE-2026-001',
          objet: 'Programme',
          ecritSigne: true,
          signataire: 'X',
          dateSignature: new Date('2026-01-01'),
          dateDebut: new Date('2026-01-01'),
          dateFin: new Date('2028-12-31'),
          montantAccorde: 100_000,
          caractere: 'FERME_INCONDITIONNEL',
          conditions: null,
          statut: 'EN_COURS',
          motifCloture: null,
          tranches: [
            { id: 't1', numero: 1, libelle: 'Première', montant: 50_000, datePrevue: new Date('2026-03-31'), dateEncaissement: null, montantEncaisse: null },
          ],
          rapports: [
            { id: 'r1', intitule: 'Rapport financier S1', nature: 'FINANCIER', dateEcheance: new Date('2026-07-31'), dateTransmission: null, observation: null },
          ],
        },
      ],
    });
    const [c] = await s.lister('t1', new Date('2026-09-05'));
    expect(c.tranches[0].enRetard).toBe(true);
    expect(c.rapports[0].enRetard).toBe(true);
    expect(c.resteARecevoir).toBe(100_000);
    expect(c.traitement).toBe('CREANCE_A_RECEVOIR');
  });

  it("une convention RÉSILIÉE n'attend plus rien", async () => {
    const { service: s } = service({
      conventions: [
        {
          id: 'c1',
          bailleur: BAILLEUR,
          reference: 'UE-2026-001',
          objet: 'Programme',
          ecritSigne: true,
          signataire: 'X',
          dateSignature: new Date('2026-01-01'),
          dateDebut: new Date('2026-01-01'),
          dateFin: new Date('2028-12-31'),
          montantAccorde: 100_000,
          caractere: 'FERME_INCONDITIONNEL',
          conditions: null,
          statut: 'RESILIEE',
          motifCloture: 'Programme interrompu',
          tranches: [],
          rapports: [],
        },
      ],
    });
    const [c] = await s.lister('t1', new Date('2026-09-05'));
    expect(c.resteARecevoir).toBe(0);
    // Résiliée, donc plus « en cours » : l'avertissement d'expiration ne
    // s'ajoute pas à une convention déjà sortie.
    expect(c.expiree).toBe(false);
  });
});
