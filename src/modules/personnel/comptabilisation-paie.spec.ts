import {
  dernierJourDuMois,
  propositionPaieDuMois,
  type BulletinAComptabiliser,
} from './comptabilisation-paie';

/**
 * P9 · LA PAIE DU MOIS EN UNE ÉCRITURE. Chaque test porte un défaut qui
 * laisserait l'écriture équilibrée et la balance bouclée.
 */

const bulletin = (numero: number, over: Partial<BulletinAComptabiliser> = {}, irppFc: number | null = 100_000): BulletinAComptabiliser => ({
  id: `b${numero}`,
  numero,
  nomComplet: `SALARIE ${numero}`,
  statut: 'EMIS',
  ecritureId: null,
  netAPayerFc: 1_250_000,
  entree: {
    elements: [
      { nature: 'SALAIRE_OU_TRAITEMENT', libelle: 'Salaire', montantFc: 1_000_000 },
      { nature: 'LOGEMENT_OU_SON_INDEMNITE', libelle: 'Logement', montantFc: 400_000 },
    ],
  },
  calcul: {
    cotisations: {
      lignes: [
        { cle: 'cnss-pf', charge: 'EMPLOYEUR', montantFc: 65_000 },
        { cle: 'cnss-pension-employeur', charge: 'EMPLOYEUR', montantFc: 50_000 },
        { cle: 'cnss-pension-travailleur', charge: 'TRAVAILLEUR', montantFc: 50_000 },
        { cle: 'cnss-rp', charge: 'EMPLOYEUR', montantFc: 15_000 },
        { cle: 'inpp', charge: 'EMPLOYEUR', montantFc: 35_000 },
        { cle: 'onem', charge: 'EMPLOYEUR', montantFc: 5_000 },
      ],
      abstentions: [],
    },
    retenue: irppFc === null ? null : { retenueFc: irppFc },
    net: { netAPayerFc: 1_250_000 },
  },
  ...over,
});

const ligne = (p: ReturnType<typeof propositionPaieDuMois>, bloc: string, compte: string, sens: string) =>
  p.lignes.filter((l) => l.bloc === bloc && l.compte === compte && l.sens === sens);

describe('une écriture pour tout le mois', () => {
  const p = propositionPaieDuMois('2026-03', 'SYSCOHADA', [bulletin(1), bulletin(2)]);

  it("additionne les bulletins par compte, et s'équilibre", () => {
    expect(p.refus).toEqual([]);
    expect(p.equilibree).toBe(true);
    // Deux fois (1 400 000 + 150 000 + 170 000)
    expect(p.totalDebitFc).toBe(3_440_000);
    expect(p.totalCreditFc).toBe(3_440_000);
    expect(ligne(p, 'BRUT', '66110000', 'DEBIT')[0].montantFc).toBe(2_000_000);
  });

  it('garde les trois temps du Guide, dans leur ordre', () => {
    expect([...new Set(p.lignes.map((l) => l.bloc))]).toEqual(['BRUT', 'RETENUES', 'PATRONALES']);
  });

  it('crédite le 422 du brut, le débite des retenues, et le solde est la somme des nets', () => {
    expect(ligne(p, 'BRUT', '42200000', 'CREDIT')[0].montantFc).toBe(2_800_000);
    expect(ligne(p, 'RETENUES', '42200000', 'DEBIT')[0].montantFc).toBe(300_000);
    expect(p.solde422Fc).toBe(2_500_000);
    expect(p.sommeDesNetsFc).toBe(2_500_000);
  });

  it("porte l'impôt retenu au 447, jamais en charge", () => {
    expect(ligne(p, 'RETENUES', '44720000', 'CREDIT')[0].montantFc).toBe(200_000);
    const charges = p.lignes.filter((l) => l.sens === 'DEBIT' && l.compte.startsWith('6'));
    expect(charges.reduce((n, l) => n + l.montantFc, 0)).toBe(2 * (1_400_000 + 170_000));
  });

  it('ne réunit pas la part ouvrière et la part patronale de la même caisse', () => {
    expect(ligne(p, 'RETENUES', '43130000', 'CREDIT')[0].montantFc).toBe(100_000);
    expect(ligne(p, 'PATRONALES', '43130000', 'CREDIT')[0].montantFc).toBe(100_000);
  });

  it('prend les numéros du référentiel du dossier', () => {
    const syc = propositionPaieDuMois('2026-03', 'SYCEBNL', [bulletin(1)]);
    expect(syc.lignes.some((l) => l.compte === '43210000')).toBe(true);
    expect(syc.lignes.some((l) => l.compte === '43130000')).toBe(false);
  });
});

describe('ce qui ne se passe pas, ou pas deux fois', () => {
  it('ne repasse jamais un bulletin déjà porté par une écriture', () => {
    const p = propositionPaieDuMois('2026-03', 'SYSCOHADA', [bulletin(1, { ecritureId: 'e1' }), bulletin(2)]);
    expect(p.aPasser.map((b) => b.numero)).toEqual([2]);
    expect(p.dejaPasses.map((b) => b.numero)).toEqual([1]);
    expect(p.totalDebitFc).toBe(1_720_000);
  });

  it('ignore un bulletin annulé, et signale celui annulé APRÈS avoir été passé', () => {
    const p = propositionPaieDuMois('2026-03', 'SYSCOHADA', [
      bulletin(1, { statut: 'ANNULE' }),
      bulletin(2, { statut: 'ANNULE', ecritureId: 'e9' }),
      bulletin(3),
    ]);
    expect(p.aPasser.map((b) => b.numero)).toEqual([3]);
    expect(p.annulesApresPassation.map((b) => b.numero)).toEqual([2]);
    expect(p.reserves.join(' ')).toContain('n° 2');
  });

  it('refuse le mois ENTIER quand un seul bulletin ne se passe pas, et le nomme', () => {
    const p = propositionPaieDuMois('2026-03', 'SYSCOHADA', [bulletin(1), bulletin(2, {}, null)]);
    expect(p.lignes).toEqual([]);
    expect(p.refus.map((r) => r.numero)).toEqual([2]);
    expect(p.refus[0].motifs.join(' ')).toContain('IMPOT_INDETERMINE');
  });

  it('refuse un bulletin illisible au lieu de le compléter', () => {
    const p = propositionPaieDuMois('2026-03', 'SYSCOHADA', [bulletin(1, { entree: {} })]);
    expect(p.refus[0].motifs.join(' ')).toContain('illisible');
    expect(p.lignes).toEqual([]);
  });

  it('ne propose rien quand aucun bulletin n’est à passer', () => {
    const p = propositionPaieDuMois('2026-03', 'SYSCOHADA', []);
    expect(p.lignes).toEqual([]);
    expect(p.refus).toEqual([]);
  });
});

describe('au centime', () => {
  it('reste équilibrée quand l’impôt porte des décimales, et montre l’écart', () => {
    // Un impôt mensuel de 130 560,333… FC, comme en rend le barème ÷ 12.
    const irpp = 130_560 + 1 / 3;
    const b = (n: number) => {
      const x = bulletin(n, { netAPayerFc: 1_219_439.67 }, irpp);
      // Le net figé dans le calcul est brut, la colonne le garde au centime.
      (x.calcul as { net: { netAPayerFc: number } }).net.netAPayerFc = 1_400_000 - 50_000 - irpp;
      return x;
    };
    // DEUX bulletins, pas trois · trois tiers retombent sur un entier, et le
    // test ne prouverait plus rien (vu à la réinjection).
    const p = propositionPaieDuMois('2026-03', 'SYSCOHADA', [b(1), b(2)]);
    expect(p.refus).toEqual([]);
    expect(p.equilibree).toBe(true);
    // Chaque montant est un nombre de centimes entier.
    for (const l of p.lignes) expect(Math.round(l.montantFc * 100)).toBe(l.montantFc * 100);
    expect(Math.abs(p.solde422Fc - p.sommeDesNetsFc)).toBeLessThanOrEqual(0.02);
  });

  it('refuse un écart qui n’est plus un arrondi', () => {
    const p = propositionPaieDuMois('2026-03', 'SYSCOHADA', [bulletin(1, { netAPayerFc: 1_000_000 })]);
    expect(p.lignes).toEqual([]);
    expect(p.reserves.join(' ')).toContain('défaut du moteur');
  });

  it('date par défaut au dernier jour du mois', () => {
    expect(dernierJourDuMois('2026-02')).toBe('2026-02-28');
    expect(dernierJourDuMois('2028-02')).toBe('2028-02-29');
    expect(dernierJourDuMois('2026-12')).toBe('2026-12-31');
  });
});
