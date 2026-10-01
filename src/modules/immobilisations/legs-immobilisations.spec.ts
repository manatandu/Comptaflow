import { BadRequestException } from '@nestjs/common';
import { motifRefusLegs, repartirDettesLegs } from './legs-immobilisations';
import { proposerReprise } from './reprise-subvention';
import { ImmobilisationService } from './immobilisation.service';
import { PLAN_COMPTES_SYCEBNL } from '../comptes/compte-seed';

/**
 * LOT 7 · LE LEGS D'IMMOBILISATIONS GREVÉ DE DETTES (SYCEBNL Partie 3 ch. 2
 * § 1.2.2, Application 5). Décisions de Manasse du 2026-10-01 · D-15
 * (reprise du 167 à la quote-part 167 ÷ valeur), D-16 (une pièce par bien).
 */
// Application 5 · bâtiment, matériel informatique, mobilier, automobile.
const VALEURS = [400_000_000, 10_000_000, 25_000_000, 12_000_000];
const DETTES = 25_000_000;

describe('répartition des dettes du legs', () => {
  it('Application 5 · 25 000 000 au prorata de 447 000 000, au centime, totaux de l’acte', () => {
    const parts = repartirDettesLegs(VALEURS, DETTES);
    expect(parts.reduce((t, p) => Math.round((t + p) * 100) / 100, 0)).toBe(25_000_000);
    expect(parts[0]).toBe(22_371_364.65);
    expect(parts[1]).toBe(559_284.12);
    // Le 167 total reste celui du Guide · 422 000 000.
    const fonds = VALEURS.reduce((t, v, i) => t + v - parts[i], 0);
    expect(Math.round(fonds * 100) / 100).toBe(422_000_000);
  });

  it('le dernier bien prend le reste au centime', () => {
    expect(repartirDettesLegs([1, 1, 1], 100)).toEqual([33.33, 33.33, 33.34]);
  });

  it('sans dettes, aucune part', () => {
    expect(repartirDettesLegs([10, 20], 0)).toEqual([0, 0]);
  });
});

describe('refus du legs', () => {
  const base = { referentiel: 'SYCEBNL' as const, numeroFonds: '16710000', numeroDettes: '48610000', dettes: DETTES, valeurs: VALEURS };
  it('admis tel que l’Application 5', () => {
    expect(motifRefusLegs(base)).toBeNull();
  });
  it('propre au SYCEBNL', () => {
    expect(motifRefusLegs({ ...base, referentiel: 'SYSCOHADA' })).toMatch(/propre au SYCEBNL/);
  });
  it('le fonds est un 167, jamais le 1679 de l’engagement', () => {
    expect(motifRefusLegs({ ...base, numeroFonds: '16790000' })).toMatch(/1679/);
    expect(motifRefusLegs({ ...base, numeroFonds: '14170000' })).toMatch(/167/);
  });
  it('les dettes vont au 4861, et restent sous la valeur des biens', () => {
    expect(motifRefusLegs({ ...base, numeroDettes: '40110000' })).toMatch(/4861/);
    expect(motifRefusLegs({ ...base, numeroDettes: null })).toMatch(/4861/);
    expect(motifRefusLegs({ ...base, dettes: 447_000_000 })).toMatch(/actif net/);
    expect(motifRefusLegs({ ...base, dettes: 0, numeroDettes: null })).toBeNull();
  });
  it('les comptes nommés existent au semis SYCEBNL', () => {
    const numeros = new Set(PLAN_COMPTES_SYCEBNL.map((c) => c.numero));
    expect(['16710000', '16790000', '48610000', '79230000'].filter((n) => !numeros.has(n))).toEqual([]);
  });
});

describe('reprise du 167 à la quote-part · décision D-15', () => {
  it('Application 5 · la reprise suit 167 ÷ valeur, et reprend le 167 au terme exact du plan', () => {
    const parts = repartirDettesLegs(VALEURS, DETTES);
    // Dotations de N du Guide (prorata 9/12).
    const dotations = [10_000_000, 3_750_000, 1_875_000, 3_000_000];
    const reprises = VALEURS.map((v, i) =>
      proposerReprise({ subvention: v - parts[i], valeurOrigine: v, amortissable: true, dotationExercice: dotations[i], cumulRepris: 0, sorti: false, regle: 'DONS_LEGS' }).montant,
    );
    const total = Math.round(reprises.reduce((t, r) => t + r, 0) * 100) / 100;
    // 18 625 000 × 422 / 447, à l'arrondi par bien près · et non les 18 625 000 du Guide.
    expect(Math.abs(total - (18_625_000 * 422) / 447)).toBeLessThan(0.05);
    expect(total).toBeLessThan(18_625_000);
    // Sur toute la durée d'un bien, la reprise totale égale son 167.
    const fondsBatiment = VALEURS[0] - parts[0];
    let repris = 0;
    for (let k = 0; k < 30; k++) {
      repris += proposerReprise({
        subvention: fondsBatiment,
        valeurOrigine: VALEURS[0],
        amortissable: true,
        dotationExercice: VALEURS[0] / 30,
        cumulRepris: repris,
        sorti: false,
        regle: 'DONS_LEGS',
      }).montant;
    }
    expect(Math.abs(repris - fondsBatiment)).toBeLessThan(1);
  });

  it('sans dettes, la dotation entière, comme avant', () => {
    expect(proposerReprise({ subvention: 600_000, valeurOrigine: 600_000, amortissable: true, dotationExercice: 20_000, depreciationExercice: 5_000, cumulRepris: 0, sorti: false, regle: 'DONS_LEGS' }).montant).toBe(25_000);
  });
});

describe('le service · une pièce par bien, tout ou rien', () => {
  function monter(o: { echecAuBien?: number } = {}) {
    const comptes: Record<string, string> = { fonds: '16710000', dettes: '48610000', c2313: '23130000', c2442: '24420000' };
    const prisma = {
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: 'SYCEBNL' }) },
      compte: {
        findFirst: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve(comptes[where.id] ? { id: where.id, numero: comptes[where.id] } : null),
        ),
      },
      immobilisation: { delete: jest.fn().mockResolvedValue({}) },
      ligneEcriture: { deleteMany: jest.fn().mockResolvedValue({}) },
      ecriture: { delete: jest.fn().mockResolvedValue({}) },
    };
    const svc = new ImmobilisationService(prisma as never, {} as never);
    let n = 0;
    const creer = jest.spyOn(svc, 'creer').mockImplementation(() => {
      n += 1;
      if (o.echecAuBien === n) return Promise.reject(new BadRequestException('refus propre au bien'));
      return Promise.resolve({ id: `b${n}`, ecritureAcquisitionId: `e${n}` } as never);
    });
    return { svc, creer, prisma };
  }
  const dto = {
    exerciceId: 'ex',
    journalId: 'od',
    dateActe: '2026-04-01',
    referenceActe: 'Acte 12/2026',
    compteFondsId: 'fonds',
    compteDettesId: 'dettes',
    dettes: 25_000_000,
    biens: [
      { compteImmobilisationId: 'c2313', designation: 'Bâtiment', valeurOrigine: 400_000_000, dureeAmortissementAns: 30 },
      { compteImmobilisationId: 'c2442', designation: 'Informatique', valeurOrigine: 10_000_000, dureeAmortissementAns: 2 },
    ],
  };

  it('chaque bien · C 4861 sa part, C 167 le reste, libellé de l’acte', async () => {
    const { svc, creer } = monter();
    const r = await svc.recevoirLegs('t', 'u', dto);
    const parts = repartirDettesLegs([400_000_000, 10_000_000], 25_000_000);
    expect(creer.mock.calls[0][3]).toEqual({
      lignesCredit: [
        { compteId: 'dettes', montant: parts[0] },
        { compteId: 'fonds', montant: 400_000_000 - parts[0] },
      ],
      libelle: 'Legs Acte 12/2026 · Bâtiment',
    });
    expect(creer.mock.calls[1][2]).toMatchObject({ dateAcquisition: '2026-04-01', valeurOrigine: 10_000_000, exerciceId: 'ex', journalId: 'od' });
    expect(r.biens.map((b) => b.dettes)).toEqual(parts);
  });

  it('un bien refusé · les fiches déjà créées et leurs écritures sont retirées', async () => {
    const { svc, prisma } = monter({ echecAuBien: 2 });
    await expect(svc.recevoirLegs('t', 'u', dto)).rejects.toThrow('refus propre au bien');
    expect(prisma.immobilisation.delete).toHaveBeenCalledWith({ where: { id: 'b1' } });
    expect(prisma.ecriture.delete).toHaveBeenCalledWith({ where: { id: 'e1' } });
  });

  it('refus commun avant la première fiche · fonds 1679, compte de bien inconnu', async () => {
    const a = monter();
    await expect(a.svc.recevoirLegs('t', 'u', { ...dto, compteFondsId: 'inconnu' })).rejects.toThrow(/fonds introuvable/);
    const b = monter();
    await expect(
      b.svc.recevoirLegs('t', 'u', { ...dto, biens: [...dto.biens, { compteImmobilisationId: 'inconnu', designation: 'X', valeurOrigine: 1 }] }),
    ).rejects.toThrow(/introuvable/);
    expect(b.creer).not.toHaveBeenCalled();
  });
});
