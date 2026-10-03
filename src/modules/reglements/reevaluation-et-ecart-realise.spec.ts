import type { PrismaService } from '../../common/prisma.service';
import { avertissementExtourneManquante, issueReevaluationDejaPassee, motifReglementDejaReevalue } from './reevaluation-et-ecart-realise';

/**
 * PAS DEUX FOIS LA MÊME PERTE, ET JAMAIS UN FAUX 409 (ligne A6, relectures
 * adverses). Le cas mixte du 401 · facture A de 1 160 USD à 1 680 au groupe L
 * (600 USD réglés au coût historique, 560 USD à 1 900), facture B de 500 USD à
 * 1 700 ouverte, réévaluation au 31 décembre à 1 850, saisie le 5 janvier.
 * Groupe lu · 198 200 passés ; groupe écarté · 75 000.
 *
 * LA DOUBLURE HONORE LA REQUÊTE · un filtre Prisma réduit (égalité, `lte`,
 * `gt`, `in`, `not`, `OR`, relations imbriquées), appliqué aux lignes · ce
 * qui dépend de ce qu'une requête ramène se teste sur la requête.
 */
type Objet = Record<string, unknown>;
function tient(obj: Objet, where: Objet): boolean {
  for (const [k, v] of Object.entries(where)) {
    if (v === undefined) continue;
    if (k === 'OR') {
      if (!(v as Objet[]).some((w) => tient(obj, w))) return false;
      continue;
    }
    const val = obj[k] as never;
    if (v instanceof Date) {
      if (!((val as unknown) instanceof Date) || (val as Date).getTime() !== v.getTime()) return false;
      continue;
    }
    if (v !== null && typeof v === 'object') {
      const op = v as { lte?: never; gt?: never; in?: unknown[]; not?: unknown };
      if ('lte' in op || 'gt' in op || 'in' in op || 'not' in op) {
        if ('lte' in op && !(val !== null && val <= op.lte!)) return false;
        if ('gt' in op && !(val !== null && val > op.gt!)) return false;
        if ('in' in op && !op.in!.includes(val)) return false;
        if ('not' in op && val === op.not) return false;
        continue;
      }
      if (val === null || typeof val !== 'object') return false;
      if (!tient(val as Objet, v as Objet)) return false;
      continue;
    }
    if (val !== v) return false;
  }
  return true;
}

const SAISIE = new Date('2026-12-31T10:00:00Z');
const AVANT = new Date('2026-05-15');
let n = 0;
function ligne(deviseId: string, debit: number, credit: number, montantDevise: number, groupe: { id: string; creeLe: Date; soldeLe?: Date } | null, ecriture: Objet = {}) {
  n += 1;
  return {
    id: `l${n}`,
    compteId: 'c401',
    deviseId,
    debit,
    credit,
    montantDevise,
    lettrageId: groupe?.id ?? null,
    lettre: groupe?.soldeLe ? groupe.id : null,
    lettrage: groupe ? { createdAt: groupe.creeLe, soldeAt: groupe.soldeLe ?? null } : null,
    ecriture: {
      tenantId: 't',
      exerciceId: 'ex',
      date: new Date('2026-06-01'),
      createdAt: SAISIE,
      estANouveauProvisoire: false,
      estGenereeParCloture: false,
      estSoldeDesComptesDeGestion: false,
      ...ecriture,
    },
  };
}
type Ligne = ReturnType<typeof ligne>;

const L = { id: 'L', creeLe: AVANT };
const groupeL = () => [ligne('usd', 0, 1_948_800, 1160, L), ligne('usd', 1_008_000, 0, 600, L), ligne('usd', 1_064_000, 0, 560, L)];
const factureB = (ecriture: Objet = {}, groupe: { id: string; creeLe: Date; soldeLe?: Date } | null = null) =>
  ligne('usd', 0, 850_000, 500, groupe, ecriture);

function monter(p: { lignes: Ligne[]; passe: number; cours?: Record<string, number>; dateReevaluation?: string }) {
  const creeeLe = new Date('2027-01-05T09:00:00Z');
  return {
    reevaluation: {
      findFirst: jest.fn(async () => ({
        dateReevaluation: new Date(p.dateReevaluation ?? '2026-12-31'),
        createdAt: creeeLe,
        // L'écriture des écarts sur le 401, SANS devise · une perte au crédit du tiers.
        ecritureEcarts: { lignes: [{ debit: p.passe > 0 ? p.passe : 0, credit: p.passe < 0 ? -p.passe : 0 }] },
      })),
    },
    exercice: { findFirst: jest.fn(async () => ({ dateDebut: new Date('2026-01-01') })) },
    ligneEcriture: { findMany: jest.fn(async ({ where }: { where: Objet }) => p.lignes.filter((l) => tient(l as unknown as Objet, where))) },
    coursDevise: {
      findFirst: jest.fn(async ({ where }: { where: { deviseId: string } }) => {
        const c = (p.cours ?? { usd: 1850, eur: 1100 })[where.deviseId];
        return c === undefined ? null : { cours: c };
      }),
    },
  } as unknown as PrismaService;
}

const params = { tenantId: 't', exerciceId: 'ex', compteId: 'c401', compteNumero: '40110000', lettrageId: 'L' };

describe('l’écart proposé et la réévaluation de l’exercice', () => {
  it('la réévaluation a lu le groupe (198 200) · refus nommé, honnête sur le retrait', async () => {
    const r = await issueReevaluationDejaPassee(monter({ lignes: [...groupeL(), factureB()], passe: -198_200 }), params);
    expect(r).toEqual({ refus: expect.stringMatching(/a lu ce dénouement du 40110000.*compterait la perte deux fois/) });
    expect((r as { refus: string }).refus).toMatch(/Aucun geste d’OmegaX ne retire aujourd’hui une réévaluation passée · la décision attendue de Manasse/);
  });

  it('la réévaluation a écarté le groupe (75 000) · rien ne s’oppose', async () => {
    expect(await issueReevaluationDejaPassee(monter({ lignes: [...groupeL(), factureB()], passe: -75_000 }), params)).toBeNull();
  });

  // Quatrième relecture · le retour anticipé sur la date du dénouement
  // laissait passer le réalisé d'un groupe dont la facture avait été lue par
  // une réévaluation datée AVANT la fin de l'exercice.
  it('une réévaluation antérieure au dénouement qui a lu ses lignes · refus', async () => {
    expect(
      await issueReevaluationDejaPassee(monter({ lignes: [...groupeL(), factureB()], passe: -198_200, dateReevaluation: '2026-06-30' }), params),
    ).toHaveProperty('refus');
  });

  it('le scénario de la relecture · facture 1 000 USD à 2 000, réévaluée le 30/09 à 2 100 (100 000), réglée le 15/11 à 2 150 · refus', async () => {
    const G = { id: 'G', creeLe: new Date('2026-11-15') };
    const lignes = [
      ligne('usd', 0, 2_000_000, 1000, G, { date: new Date('2026-06-01'), createdAt: new Date('2026-06-01') }),
      ligne('usd', 2_150_000, 0, 1000, G, { date: new Date('2026-11-15'), createdAt: new Date('2026-11-15') }),
    ];
    const prisma = monter({ lignes, passe: -100_000, dateReevaluation: '2026-09-30', cours: { usd: 2100 } });
    (prisma.reevaluation.findFirst as jest.Mock).mockResolvedValue({
      dateReevaluation: new Date('2026-09-30'),
      createdAt: new Date('2026-10-01'),
      ecritureEcarts: { lignes: [{ debit: 0, credit: 100_000 }] },
    });
    expect(await issueReevaluationDejaPassee(prisma, { ...params, lettrageId: 'G' })).toHaveProperty('refus');
  });

  it('une facture POSTÉRIEURE à la réévaluation · elle n’y était pas, l’écart passe', async () => {
    const G = { id: 'G', creeLe: new Date('2027-01-06') };
    const lignes = [
      factureB(),
      ligne('usd', 0, 1_700_000, 1000, G, { date: new Date('2026-10-15') }),
      ligne('usd', 1_800_000, 0, 1000, G, { date: new Date('2026-11-15') }),
    ];
    expect(await issueReevaluationDejaPassee(monter({ lignes, passe: -75_000, dateReevaluation: '2026-09-30' }), { ...params, lettrageId: 'G' })).toBeNull();
  });

  it('tiers à deux devises · 75 000 en USD et 10 000 en EUR passés · rien ne s’oppose, et 208 200 refusent', async () => {
    const eur = ligne('eur', 0, 100_000, 100, null);
    expect(await issueReevaluationDejaPassee(monter({ lignes: [...groupeL(), factureB(), eur], passe: -85_000 }), params)).toBeNull();
    expect(await issueReevaluationDejaPassee(monter({ lignes: [...groupeL(), factureB(), eur], passe: -208_200 }), params)).toHaveProperty('refus');
  });

  it('la facture B lettrée SOLDE après la réévaluation · elle était ouverte, rien ne s’oppose', async () => {
    const b = factureB({}, { id: 'LB', creeLe: new Date('2027-01-10'), soldeLe: new Date('2027-01-10') });
    expect(await issueReevaluationDejaPassee(monter({ lignes: [...groupeL(), b], passe: -75_000 }), params)).toBeNull();
  });

  it('une facture de décembre SAISIE après la réévaluation · elle n’y était pas, rien ne s’oppose', async () => {
    const c = ligne('usd', 0, 340_000, 200, null, { date: new Date('2026-12-20'), createdAt: new Date('2027-01-08') });
    expect(await issueReevaluationDejaPassee(monter({ lignes: [...groupeL(), factureB(), c], passe: -75_000 }), params)).toBeNull();
  });

  it('le cours du 31 décembre corrigé depuis · avertissement, jamais « déjà porté »', async () => {
    const r = await issueReevaluationDejaPassee(monter({ lignes: [...groupeL(), factureB()], passe: -75_000, cours: { usd: 1900 } }), params);
    expect(r).toEqual({ avertissement: expect.stringMatching(/^Des lettrages ou des écritures ont changé depuis la réévaluation des devises du 2026-12-31/) });
    expect((r as { avertissement: string }).avertissement).not.toMatch(/déjà porté/);
  });

  // Bloquant 2 · un groupe CRÉÉ APRÈS la réévaluation n'existait pas · ses
  // lignes étaient ouvertes et lues. Écarté comme dénoué d'aujourd'hui, il
  // donnait 75 000 et 198 200 contre 298 200 passés · un simple
  // avertissement, puis le réalisé de L et celui de M passés en double.
  it('L et M, décembre lettré en janvier · la réévaluation de 298 200 a lu les deux · refus pour L, puis pour M', async () => {
    const Lj = { id: 'L', creeLe: new Date('2027-01-06') };
    const M = { id: 'M', creeLe: new Date('2027-01-07') };
    const groupeLj = [ligne('usd', 0, 1_948_800, 1160, Lj), ligne('usd', 1_008_000, 0, 600, Lj), ligne('usd', 1_064_000, 0, 560, Lj)];
    const lignes = [...groupeLj, factureB(), ligne('usd', 0, 1_700_000, 1000, M), ligne('usd', 1_800_000, 0, 1000, M, { date: new Date('2026-12-15') })];
    expect(await issueReevaluationDejaPassee(monter({ lignes, passe: -298_200 }), params)).toHaveProperty('refus');
    expect(await issueReevaluationDejaPassee(monter({ lignes, passe: -298_200 }), { ...params, lettrageId: 'M' })).toHaveProperty('refus');
  });

  // M1 · l'à-nouveau provisoire se RECRÉE (`retirerANouveauProvisoire`), son
  // `createdAt` est postérieur à la réévaluation · il existait pourtant.
  it('un à-nouveau provisoire recréé après la réévaluation · lu comme à sa date, rien ne s’oppose', async () => {
    const b = factureB({ date: new Date('2026-01-01'), createdAt: new Date('2027-01-06'), estANouveauProvisoire: true });
    expect(await issueReevaluationDejaPassee(monter({ lignes: [...groupeL(), b], passe: -75_000 }), params)).toBeNull();
    // Une écriture ordinaire saisie après, même datée du 1er janvier, n'y était pas.
    const ordinaire = factureB({ date: new Date('2026-01-01'), createdAt: new Date('2027-01-06') });
    expect(await issueReevaluationDejaPassee(monter({ lignes: [...groupeL(), ordinaire], passe: -75_000 }), params)).toHaveProperty('avertissement');
  });
});

/**
 * BLOQUANT 1 · LE RÈGLEMENT D'UNE FACTURE DÉJÀ RÉÉVALUÉE. Facture B de 500
 * USD à 1 700 · la réévaluation au 31/12 à 1 850, passée le 05/01, porte
 * 75 000 au 478 et en provision ; le règlement du 28/12 saisi le 08/01 à
 * 1 860 passerait 80 000 au 656 · 155 000 de charges pour 80 000 de perte.
 */
describe('un règlement en devise d’une facture déjà réévaluée', () => {
  it('la facture choisie a été lue · refus nommé, honnête sur le retrait', async () => {
    const b = factureB();
    const motif = await motifReglementDejaReevalue(monter({ lignes: [b], passe: -75_000 }), { ...params, ligneIds: [b.id] });
    expect(motif).toMatch(/a lu une facture choisie du 40110000.*compterait la perte deux fois.*Rien n’est passé/);
    expect(motif).toMatch(/Aucun geste d’OmegaX ne retire aujourd’hui/);
  });

  // M1 · seules les devises RÉELLEMENT réévaluées · l'EUR porte 10 000.
  it('une facture au cours de clôture (écart nul) · rien ne s’oppose', async () => {
    const usd = ligne('usd', 0, 1_850_000, 1000, null);
    const eur = ligne('eur', 0, 100_000, 100, null);
    expect(await motifReglementDejaReevalue(monter({ lignes: [usd, eur], passe: -10_000 }), { ...params, ligneIds: [usd.id] })).toBeNull();
    expect(await motifReglementDejaReevalue(monter({ lignes: [usd, eur], passe: -10_000 }), { ...params, ligneIds: [eur.id] })).toMatch(/a lu une facture choisie/);
  });

  it('une devise dont la position était soldée pendant qu’une autre était réévaluée · rien ne s’oppose', async () => {
    const facture = ligne('usd', 0, 850_000, 500, null);
    const avance = ligne('usd', 900_000, 0, 500, null);
    const eur = ligne('eur', 0, 100_000, 100, null);
    expect(await motifReglementDejaReevalue(monter({ lignes: [facture, avance, eur], passe: -10_000 }), { ...params, ligneIds: [facture.id] })).toBeNull();
  });

  it('une facture saisie après la réévaluation, ou une devise sans cours · rien ne s’oppose', async () => {
    const tardive = factureB({ date: new Date('2026-12-20'), createdAt: new Date('2027-01-08') });
    expect(await motifReglementDejaReevalue(monter({ lignes: [tardive], passe: -75_000 }), { ...params, ligneIds: [tardive.id] })).toBeNull();
    const b = factureB();
    expect(await motifReglementDejaReevalue(monter({ lignes: [b], passe: -75_000, cours: {} }), { ...params, ligneIds: [b.id] })).toBeNull();
  });
});

/**
 * M3 (quatrième relecture) · le règlement en N+1 d'une facture réévaluée en
 * N, réévaluation de N non contre-passée · AVERTISSEMENT, jamais un refus.
 */
describe('la contre-passation de la réévaluation précédente oubliée', () => {
  function monterN1(p: { extournee: boolean; surLeCompte?: boolean; aNouveau?: boolean }) {
    return {
      exercice: { findFirst: jest.fn(async () => ({ dateDebut: new Date('2027-01-01') })) },
      reevaluation: {
        findFirst: jest.fn(async ({ where }: { where: { dateReevaluation: { lt: Date } } }) =>
          new Date('2026-12-31') < where.dateReevaluation.lt
            ? {
                dateReevaluation: new Date('2026-12-31'),
                ecritureExtourneId: p.extournee ? 'x' : null,
                ecritureEcarts: { lignes: p.surLeCompte === false ? [] : [{ id: 'r' }] },
              }
            : null,
        ),
      },
      ligneEcriture: {
        findMany: jest.fn(async ({ where }: { where: { ecriture: { date: Date } } }) =>
          (p.aNouveau ?? true) && where.ecriture.date.getTime() === new Date('2027-01-01').getTime() ? [{ id: 'an' }] : [],
        ),
      },
    } as unknown as PrismaService;
  }
  const n1 = { tenantId: 't', exerciceId: 'ex2', compteId: 'c401', compteNumero: '40110000', ligneIds: ['an'] };

  it('non contre-passée · l’avertissement nomme la réévaluation et le geste', async () => {
    expect(await avertissementExtourneManquante(monterN1({ extournee: false }), n1)).toMatch(
      /40110000 · la réévaluation des devises du 2026-12-31 n'a pas été contre-passée.*Passez la contre-passation/,
    );
  });

  it('contre-passée, rien sur le compte, ou une facture qui n’est pas l’à-nouveau · aucun avertissement', async () => {
    expect(await avertissementExtourneManquante(monterN1({ extournee: true }), n1)).toBeNull();
    expect(await avertissementExtourneManquante(monterN1({ extournee: false, surLeCompte: false }), n1)).toBeNull();
    expect(await avertissementExtourneManquante(monterN1({ extournee: false, aNouveau: false }), n1)).toBeNull();
  });
});
