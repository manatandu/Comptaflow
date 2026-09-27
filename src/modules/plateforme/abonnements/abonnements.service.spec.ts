import { AbonnementsService } from './abonnements.service';

const EDITEUR = 'vmg';
const F = (code: string, type: 'FORMULE' | 'OPTION', m: number | null, a: number | null = null) => ({
  id: `f-${code}`, code, libelle: code, type, prixMensuelUsd: m === null ? null : { toString: () => String(m), valueOf: () => m }, prixAnnuelUsd: a,
});

function monde(o: { assujetti?: boolean; cours?: number | null; dejaFacture?: boolean; numeros?: string[]; courriels?: unknown } = {}) {
  const factures: Record<string, unknown>[] = [];
  const liens: Record<string, unknown>[] = [];
  const prisma = {
    licence: { findFirst: jest.fn(async () => ({ tenantId: EDITEUR })) },
    tenant: { findUniqueOrThrow: jest.fn(async () => ({ assujettiTva: o.assujetti ?? false })) },
    tauxTva: { findFirst: jest.fn(async ({ where }: { where: { id: string } }) => (where.id === 't16' ? { id: 't16', taux: 16 } : null)) },
    coursDevise: { findFirst: jest.fn(async () => (o.cours === null ? null : { cours: o.cours ?? 2800 })) },
    abonnementCabinet: {
      findMany: jest.fn(async () => [
        {
          id: 'a1', tiersId: 'cli', cabinet: { nom: 'ASBL Un' }, formule: F('ESSENTIEL', 'FORMULE', 20),
          options: [{ formule: F('PAIE', 'OPTION', 10) }], dossiersSupplementaires: 0, periodicite: 'MENSUELLE',
          debut: new Date('2026-10-01T00:00:00Z'), finEssai: null, actif: true, factures: o.dejaFacture ? [{ id: 'x' }] : [],
        },
        {
          id: 'a2', tiersId: 'cli2', cabinet: { nom: 'ASBL Deux' }, formule: F('STANDARD', 'FORMULE', null),
          options: [], dossiersSupplementaires: 0, periodicite: 'MENSUELLE',
          debut: new Date('2026-10-01T00:00:00Z'), finEssai: null, actif: true, factures: [],
        },
      ]),
    },
    facture: { findMany: jest.fn(async () => (o.numeros ?? []).map((numeroSerie) => ({ numeroSerie }))) },
    factureAbonnement: { create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: `fa-${liens.push(data)}` })) },
  };
  const facturation = {
    enregistrer: jest.fn(async (_t: string, dto: Record<string, unknown>) => {
      factures.push(dto);
      return { id: `fac-${factures.length}` };
    }),
    supprimer: jest.fn(),
  };
  return { s: new AbonnementsService(prisma as never, facturation as never, {} as never, o.courriels as never), factures, liens, facturation };
}

describe('facturation des abonnements · service', () => {
  it('facture dans le dossier de l’éditeur, en francs au cours du jour, sans TVA tant qu’il n’est pas assujetti', async () => {
    const m = monde({ numeros: ['VMG-2026-0003'] });
    const r = await m.s.facturer(EDITEUR, '2026-10', '2026-10-31', null);
    expect(m.facturation.enregistrer).toHaveBeenCalledWith(EDITEUR, expect.anything());
    const f = m.factures[0] as { numeroSerie: string; lignes: { prixUnitaire: number; montantTva: number; imposable: boolean }[] };
    expect(f.numeroSerie).toBe('VMG-2026-0004');
    expect(f.lignes.map((l) => l.prixUnitaire)).toEqual([56000, 28000]);
    expect(f.lignes.every((l) => l.montantTva === 0 && l.imposable === false)).toBe(true);
    expect(m.liens[0]).toMatchObject({ abonnementId: 'a1', periode: '2026-10' });
    expect(r.resultats.find((x) => x.cabinet === 'ASBL Deux')).toMatchObject({ statut: 'NON_DU' });
  });

  it('assujetti, la TVA du taux choisi porte sur chaque ligne, et sans taux la facturation est refusée', async () => {
    await expect(monde({ assujetti: true }).s.facturer(EDITEUR, '2026-10', '2026-10-31', null)).rejects.toThrow(/choisissez le taux/);
    const m = monde({ assujetti: true });
    await m.s.facturer(EDITEUR, '2026-10', '2026-10-31', 't16');
    const f = m.factures[0] as { lignes: { montantTva: number; tauxApplique: number }[] };
    expect(f.lignes[0]).toMatchObject({ montantTva: 8960, tauxApplique: 16 });
  });

  it('refuse sans cours du jour, et hors du dossier de l’éditeur', async () => {
    await expect(monde({ cours: null }).s.facturer(EDITEUR, '2026-10', '2026-10-31', null)).rejects.toThrow(/Aucun cours/);
    await expect(monde().s.facturer('autre', '2026-10', '2026-10-31', null)).rejects.toThrow(/dossier de l’éditeur/);
  });

  it('ne facture jamais deux fois la même période', async () => {
    const m = monde({ dejaFacture: true });
    const r = await m.s.facturer(EDITEUR, '2026-10', '2026-10-31', null);
    expect(m.facturation.enregistrer).not.toHaveBeenCalled();
    expect(r.resultats[0]).toMatchObject({ statut: 'DEJA_FACTURE' });
  });
});

describe('le paiement déclaré prolonge la licence', () => {
  const monte = (o: { payee?: boolean; echeance?: string; libre?: boolean } = {}) => {
    const plateforme = { echeanceAbonnement: jest.fn(async (_c: string, e: string) => e) };
    const prisma = {
      factureAbonnement: {
        findUnique: jest.fn(async () => ({
          id: 'fa', periode: '2026-08', payeeLe: o.payee ? new Date('2026-08-05T00:00:00Z') : null,
          facture: { dateFacture: new Date('2026-08-01T00:00:00Z') },
          abonnement: { cabinetId: 'c1', periodicite: 'MENSUELLE', cabinet: { licence: { dateExpiration: o.echeance ? new Date(`${o.echeance}T23:59:59Z`) : null } } },
        })),
        updateMany: jest.fn(async () => ({ count: o.libre === false ? 0 : 1 })),
      },
    };
    return { s: new AbonnementsService(prisma as never, {} as never, plateforme as never), plateforme, prisma };
  };

  it('fin de la période payée plus quinze jours, posée sur la licence du client', async () => {
    const m = monte({ echeance: '2026-08-15' });
    await expect(m.s.marquerPayee('fa', '2026-08-10')).resolves.toEqual({ echeanceLicence: '2026-09-15' });
    expect(m.plateforme.echeanceAbonnement).toHaveBeenCalledWith('c1', '2026-09-15');
  });

  it('refuse un double paiement, une date future ou antérieure à la facture', async () => {
    await expect(monte({ payee: true }).s.marquerPayee('fa', '2026-08-10')).rejects.toThrow(/déjà déclarée payée/);
    await expect(monte().s.marquerPayee('fa', '2999-01-01')).rejects.toThrow(/futur/);
    await expect(monte().s.marquerPayee('fa', '2026-07-01')).rejects.toThrow(/précéder/);
    const m = monte({ libre: false });
    await expect(m.s.marquerPayee('fa', '2026-08-10')).rejects.toThrow(/vient d’être/);
    expect(m.plateforme.echeanceAbonnement).not.toHaveBeenCalled();
  });
});

describe('le paiement ne se note que sur une facture encore impayée', () => {
  it('filtre la mise à jour sur payeeLe nul', async () => {
    const plateforme = { echeanceAbonnement: jest.fn(async (_c: string, e: string) => e) };
    const updateMany = jest.fn(async () => ({ count: 1 }));
    const prisma = {
      factureAbonnement: {
        findUnique: jest.fn(async () => ({
          id: 'fa', periode: '2026-08', payeeLe: null,
          facture: { dateFacture: new Date('2026-08-01T00:00:00Z') },
          abonnement: { cabinetId: 'c1', periodicite: 'MENSUELLE', cabinet: { licence: null } },
        })),
        updateMany,
      },
    };
    await new AbonnementsService(prisma as never, {} as never, plateforme as never).marquerPayee('fa', '2026-08-10');
    expect(updateMany).toHaveBeenCalledWith({ where: { id: 'fa', payeeLe: null }, data: { payeeLe: new Date('2026-08-10T00:00:00Z') } });
  });
});

describe('enregistrer un abonnement pose d’abord la licence', () => {
  const monte = (refus = false) => {
    const plateforme = {
      echeanceAbonnement: jest.fn(async () => {
        if (refus) throw new Error('Ce dossier a une licence perpétuelle');
        return 'x';
      }),
    };
    const prisma = {
      licence: { findFirst: jest.fn(async () => ({ tenantId: 'editeur' })) },
      tenant: { findUnique: jest.fn(async () => ({ id: 'c1' })) },
      tiers: { findFirst: jest.fn(async () => ({ id: 't1' })) },
      formuleAbonnement: {
        findUnique: jest.fn(async () => ({ id: 'f1', type: 'FORMULE' })),
        findMany: jest.fn(async () => []),
      },
      abonnementCabinet: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async () => ({ id: 'a1' })),
        update: jest.fn(),
      },
      optionAbonnement: { deleteMany: jest.fn(async () => ({})), createMany: jest.fn() },
    };
    const s = new AbonnementsService(prisma as never, {} as never, plateforme as never);
    const d = { cabinetId: 'c1', formuleCode: 'ESSENTIEL', options: [], dossiersSupplementaires: 0, periodicite: 'MENSUELLE', debut: '2026-09-10', essai: true, tiersId: 't1' };
    return { s, d, plateforme, prisma };
  };

  it('échéance = fin de l’essai plus quinze jours', async () => {
    const m = monte();
    await m.s.enregistrer(m.d as never);
    expect(m.plateforme.echeanceAbonnement).toHaveBeenCalledWith('c1', '2026-10-25');
    expect(m.prisma.abonnementCabinet.create).toHaveBeenCalled();
  });

  it('une licence refusée n’écrit aucun abonnement', async () => {
    const m = monte(true);
    await expect(m.s.enregistrer(m.d as never)).rejects.toThrow(/perpétuelle/);
    expect(m.prisma.abonnementCabinet.create).not.toHaveBeenCalled();
    expect(m.prisma.abonnementCabinet.update).not.toHaveBeenCalled();
  });
});

describe('facturer puis envoyer', () => {
  it('chaque facture émise part au client, et un échec d’envoi ne défait pas la facture', async () => {
    const courriels = { envoyerFacture: jest.fn(async () => ({ id: 'm', statut: 'ENVOYE', erreur: null })) };
    const m = monde({ courriels });
    const r = await m.s.facturer(EDITEUR, '2026-10', '2026-10-31', null, { userId: 'u1' });
    expect(courriels.envoyerFacture).toHaveBeenCalledWith({ tenantId: EDITEUR, userId: 'u1' }, 'fa-1');
    expect(r.resultats[0]).toMatchObject({ statut: 'FACTURE', courriel: 'Envoyée par courriel' });

    const refus = { envoyerFacture: jest.fn(async () => { throw new Error('pas d’adresse de courriel'); }) };
    const m2 = monde({ courriels: refus });
    const r2 = await m2.s.facturer(EDITEUR, '2026-10', '2026-10-31', null, { userId: 'u1' });
    expect(r2.resultats[0]).toMatchObject({ statut: 'FACTURE', courriel: expect.stringContaining('pas d’adresse') });
    expect(m2.liens).toHaveLength(1);
  });

  it('sans la case, rien ne part', async () => {
    const courriels = { envoyerFacture: jest.fn() };
    const r = await monde({ courriels }).s.facturer(EDITEUR, '2026-10', '2026-10-31', null);
    expect(courriels.envoyerFacture).not.toHaveBeenCalled();
    expect(r.resultats[0]).not.toHaveProperty('courriel');
  });
});
