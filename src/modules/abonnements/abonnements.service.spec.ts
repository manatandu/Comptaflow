import { AbonnementsService } from './abonnements.service';

const EDITEUR = 'vmg';
const F = (code: string, type: 'FORMULE' | 'OPTION', m: number | null, a: number | null = null) => ({
  id: `f-${code}`, code, libelle: code, type, prixMensuelUsd: m === null ? null : { toString: () => String(m), valueOf: () => m }, prixAnnuelUsd: a,
});

function monde(o: { assujetti?: boolean; cours?: number | null; dejaFacture?: boolean; numeros?: string[] } = {}) {
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
    factureAbonnement: { create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => liens.push(data)) },
  };
  const facturation = {
    enregistrer: jest.fn(async (_t: string, dto: Record<string, unknown>) => {
      factures.push(dto);
      return { id: `fac-${factures.length}` };
    }),
    supprimer: jest.fn(),
  };
  return { s: new AbonnementsService(prisma as never, facturation as never), factures, liens, facturation };
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
