import { correspond } from '../etats-financiers/etats-financiers.communs';
import { NOTES_SYSCOHADA_1 } from '../etats-financiers-syscohada/correspondance-notes-syscohada-1';
import { NOTES_ASSOCIATIONS } from '../notes-annexes/correspondance-notes-associations';
import { PLAN_COMPTES_SYSCOHADA as SEMIS_SYSCOHADA } from '../comptes/compte-seed-syscohada';
import { PLAN_COMPTES_SYCEBNL as SEMIS_SYCEBNL } from '../comptes/compte-seed';
import {
  MOTIF_106_SYCEBNL,
  MOTIF_154_HORS_SERVICE,
  RACINES_RESERVE_NON_DISTRIBUABLE,
  lignesSortDeLEcart,
  motifRefusCompteReserve,
  posteDuBien,
  sortDesEcarts,
  supplementDeLaDotation,
  vueDeLExercice,
  type LigneEcartDuBien,
} from './reevaluation-suites';

/**
 * LIGNE A15 · les suites d'une réévaluation, règles pures. Chaque montant est
 * calculé à la main dans le test, jamais relu du code qu'il éprouve.
 */
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const ligne = (o: Partial<LigneEcartDuBien>): LigneEcartDuBien => ({
  id: 'l1',
  compteEcart: '10610000',
  ecart: 0,
  provisionReprise: 0,
  ecartImpute: 0,
  ecartTransfere: 0,
  ...o,
});

describe('supplementDeLaDotation · ch. 28 § 4.2.2, annuités multipliées par k', () => {
  it('l’exemple du texte · 150 au lieu de 100 (k = 1,5), supplément 50', () => {
    expect(supplementDeLaDotation(150, [1.5])).toBe(50);
  });
  it('k′ = 1,4 · dotation 140, supplément 40', () => {
    expect(supplementDeLaDotation(140, [1.4])).toBe(40);
  });
  it('deux réévaluations se chaînent · D × (1 − 1/∏k′), jamais la somme (Canon du séminaire, 175 500 · 25 500)', () => {
    expect(supplementDeLaDotation(175_500, [1.03, 1.17 / 1.03])).toBe(25_500);
  });
  it('aucune réévaluation antérieure · rien (la dotation de l’exercice de réévaluation se passe avant elle)', () => {
    expect(supplementDeLaDotation(100, [])).toBe(0);
    expect(supplementDeLaDotation(0, [1.5])).toBe(0);
  });
});

describe('sortDesEcarts · ch. 28 § 6 et loi n° 23/053, art. 133 al. 3', () => {
  it('SYSCOHADA, 106 · le solde (écart moins pertes imputées et déjà transféré) va à la réserve, cession ou non', () => {
    const lignes = [ligne({ id: 'a', compteEcart: '10610000', ecart: 50_000_000, ecartImpute: 2_000_000 })];
    for (const cession of [true, false]) {
      expect(sortDesEcarts({ referentiel: 'SYSCOHADA', cession, lignes })).toEqual([
        { ligneId: 'a', compteEcart: '10610000', montant: 48_000_000, traitement: 'RESERVE', motif: null },
      ]);
    }
  });
  it('154 à la cession · le reste non repris (écart moins reprises annuelles) au 861', () => {
    const lignes = [ligne({ id: 'b', compteEcart: '15400000', ecart: 50_000_000, provisionReprise: 2_000_000 })];
    expect(sortDesEcarts({ referentiel: 'SYSCOHADA', cession: true, lignes })).toEqual([
      { ligneId: 'b', compteEcart: '15400000', montant: 48_000_000, traitement: 'REPRISE_861', motif: null },
    ]);
    // Même règle au SYCEBNL · sa fiche du compte 15 réduit la provision par le 86.
    expect(sortDesEcarts({ referentiel: 'SYCEBNL', cession: true, lignes })[0].traitement).toBe('REPRISE_861');
  });
  it('154 hors cession · NON PASSÉ, motif dit (les textes ne tranchent pas)', () => {
    const lignes = [ligne({ id: 'b', compteEcart: '15400000', ecart: 1_000 })];
    expect(sortDesEcarts({ referentiel: 'SYSCOHADA', cession: false, lignes })).toEqual([
      { ligneId: 'b', compteEcart: '15400000', montant: 1_000, traitement: 'NON_PASSE', motif: MOTIF_154_HORS_SERVICE },
    ]);
  });
  it('SYCEBNL, 106 · NON PASSÉ (le § 6 de l’AUDCIF ne lui est pas prêté)', () => {
    const lignes = [ligne({ id: 'c', compteEcart: '10621000', ecart: 3_000 })];
    expect(sortDesEcarts({ referentiel: 'SYCEBNL', cession: true, lignes })).toEqual([
      { ligneId: 'c', compteEcart: '10621000', montant: 3_000, traitement: 'NON_PASSE', motif: MOTIF_106_SYCEBNL },
    ]);
  });
  it('un écart déjà soldé, ou une ligne sans écart, ne sort rien', () => {
    expect(
      sortDesEcarts({
        referentiel: 'SYSCOHADA',
        cession: true,
        lignes: [
          ligne({ id: 'a', compteEcart: '10610000', ecart: 100, ecartTransfere: 100 }),
          ligne({ id: 'b', compteEcart: '15400000', ecart: 100, provisionReprise: 100 }),
          ligne({ id: 'c', compteEcart: null, ecart: 0 }),
        ],
      }),
    ).toEqual([]);
  });
  it('les lignes de l’écriture · une paire par compte du 106, la reprise d’un seul tenant', () => {
    const sorts = sortDesEcarts({
      referentiel: 'SYSCOHADA',
      cession: true,
      lignes: [
        ligne({ id: 'a', compteEcart: '10610000', ecart: 100 }),
        ligne({ id: 'b', compteEcart: '10610000', ecart: 50 }),
        ligne({ id: 'c', compteEcart: '10620000', ecart: 7 }),
        ligne({ id: 'd', compteEcart: '15400000', ecart: 30, provisionReprise: 10 }),
      ],
    });
    expect(lignesSortDeLEcart(sorts)).toEqual({
      reserve: [
        { compteEcart: '10610000', montant: 150 },
        { compteEcart: '10620000', montant: 7 },
      ],
      reprise: 20,
    });
  });
});

describe('la réserve non distribuable · fiche du compte 11', () => {
  it('111, 112 et 1138 admises ; 1131 à 1134 (objet propre), 118 (réserves libres) et un autre compte refusés ; l’absence est nommée', () => {
    expect(motifRefusCompteReserve('11100000')).toBeNull();
    expect(motifRefusCompteReserve('11200000')).toBeNull();
    expect(motifRefusCompteReserve('11380000')).toBeNull();
    // Seconde relecture A15 · les 1131 à 1134 ont chacun leur objet (fiche du compte 11).
    for (const n of ['11310000', '11320000', '11330000', '11340000']) {
      expect(motifRefusCompteReserve(n)).toMatch(/a son propre objet.*va au 1138/);
    }
    expect(motifRefusCompteReserve('11810000')).toMatch(/118, qui porte les réserves libres/);
    expect(motifRefusCompteReserve('12100000')).toMatch(/n’est pas une réserve non distribuable/);
    expect(motifRefusCompteReserve(null)).toMatch(/Choisissez la réserve non distribuable/);
  });
  it('chaque racine est ouverte au plan SYSCOHADA semé, sous l’intitulé que la fiche lui donne', () => {
    const intitules: Record<string, RegExp> = { '111': /Réserve légale/, '112': /Réserves statutaires/, '1138': /Autres réserves réglementées/ };
    for (const r of RACINES_RESERVE_NON_DISTRIBUABLE) {
      const c = SEMIS_SYSCOHADA.find((x) => x.numero === r || x.numero === r.padEnd(8, '0'));
      expect({ r, intitule: c?.intitule ?? null }).toEqual({ r, intitule: expect.stringMatching(intitules[r]) });
    }
    // Le 118 est bien celui des réserves LIBRES (« Réserves facultatives »).
    expect(SEMIS_SYSCOHADA.find((x) => x.numero === '11810000')?.intitule).toMatch(/facultatives/);
  });
  it('le 861 et le 154 sont ouverts aux deux semis (la reprise de la cession)', () => {
    for (const semis of [SEMIS_SYSCOHADA, SEMIS_SYCEBNL]) {
      expect(semis.some((c) => c.numero === '86100000')).toBe(true);
      expect(semis.some((c) => c.numero === '15400000')).toBe(true);
    }
  });
});

describe('posteDuBien · la rubrique de la note des immobilisations brutes du jeu', () => {
  const rubriques3A = NOTES_SYSCOHADA_1.find((n) => n.code === '3A')!.rubriques;
  const rubriques5B = NOTES_ASSOCIATIONS.find((n) => n.code === '5B')!.rubriques;
  it('SYSCOHADA · un bâtiment industriel, un immeuble de placement, un terrain, des titres', () => {
    expect(posteDuBien('23110000', rubriques3A, correspond)).toBe('Bâtiments hors immeuble de placement');
    expect(posteDuBien('23150000', rubriques3A, correspond)).toBe('Bâtiments - immeuble de placement');
    expect(posteDuBien('22300000', rubriques3A, correspond)).toBe('Terrains hors immeuble de placement');
    expect(posteDuBien('26100000', rubriques3A, correspond)).toBe('Titres de participation');
  });
  it('SYCEBNL · le matériel de transport', () => {
    expect(posteDuBien('24500000', rubriques5B, correspond)).toBe('Matériel de transport');
  });
  it('un compte qu’aucune rubrique ne lit garde son numéro, jamais rangé ailleurs', () => {
    expect(posteDuBien('99999999', rubriques3A, correspond)).toMatch(/Compte 99999999/);
  });
});

describe('vueDeLExercice · le bien tel qu’il était à l’exercice lu', () => {
  // Application 99 · bâtiment 300 000 000, 50 000 000 amortis, k = 1,2 au 31/12/N ·
  // brut 360 000 000, cumul 60 000 000.
  const portee = {
    dateReevaluation: D('2026-12-31'),
    coefficientRetenu: 1.2,
    brutAvant: 300_000_000,
    brutApres: 360_000_000,
    amortissementsAvant: 50_000_000,
    amortissementsApres: 60_000_000,
  };
  it('exercice de la réévaluation · la hausse du cumul est de l’exercice (passée à sa clôture), rien d’antérieur', () => {
    expect(vueDeLExercice([portee], { dateDebut: D('2026-01-01'), dateFin: D('2026-12-31') })).toEqual({
      produitAnterieur: 1,
      produitPosterieur: 1,
      ajustementCumulExercice: 10_000_000,
      cumulPosterieur: 0,
      brutPosterieur: 0,
    });
  });
  it('exercice suivant · la réévaluation multiplie l’annuité (k = 1,2), plus d’ajustement', () => {
    expect(vueDeLExercice([portee], { dateDebut: D('2027-01-01'), dateFin: D('2027-12-31') })).toMatchObject({
      produitAnterieur: 1.2,
      ajustementCumulExercice: 0,
    });
  });
  it('exercice antérieur relu après coup · la réévaluation postérieure est retranchée du brut et du cumul', () => {
    expect(vueDeLExercice([portee], { dateDebut: D('2025-01-01'), dateFin: D('2025-12-31') })).toEqual({
      produitAnterieur: 1,
      produitPosterieur: 1.2,
      ajustementCumulExercice: 0,
      cumulPosterieur: 10_000_000,
      brutPosterieur: 60_000_000,
    });
  });
});
