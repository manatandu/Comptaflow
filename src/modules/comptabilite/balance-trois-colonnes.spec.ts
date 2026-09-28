import { ClasseCompte, TypeCompteDetailTotal } from '@prisma/client';
import { EcritureService } from './ecriture.service';
import { avantSoldeDesComptesDeGestion, LigneDeBalance } from './balance-trois-colonnes';
import { chargerLignes } from '../etats-financiers/etats-financiers.communs';

/**
 * LA RÉGRESSION DE F4 · l'écriture qui solde les classes 6 à 8 sur le 13 entre
 * VALIDÉE depuis l'audit final F4. Les états, qui lisent le livre-journal,
 * prenaient donc des comptes de gestion SOLDÉS · le compte de résultat de
 * tout exercice clos valait zéro, colonne N-1 du suivant comprise, sur un
 * bilan qui tenait encore par le 13. Les tests unitaires ne l'ont pas vu, la
 * balance y étant une doublure qui ne portait pas la colonne de clôture.
 */
const MONTANT = 150_000;

function ligne(numero: string, classe: ClasseCompte, champs: Partial<LigneDeBalance>): LigneDeBalance {
  const l: LigneDeBalance = {
    compteId: `c-${numero}`,
    numero,
    intitule: numero,
    classe,
    typeCompte: TypeCompteDetailTotal.DETAIL,
    reportDebit: 0,
    reportCredit: 0,
    mouvementDebit: 0,
    mouvementCredit: 0,
    clotureDebit: 0,
    clotureCredit: 0,
    totalDebit: 0,
    totalCredit: 0,
    solde: 0,
    ...champs,
  };
  l.totalDebit = l.reportDebit + l.mouvementDebit + l.clotureDebit;
  l.totalCredit = l.reportCredit + l.mouvementCredit + l.clotureCredit;
  l.solde = l.totalDebit - l.totalCredit;
  return l;
}

/** Un exercice clos · une recette encaissée, puis le solde des comptes de gestion. */
const BALANCE_DU_CLOS = [
  ligne('52110000', ClasseCompte.CLASSE_5, { reportDebit: 20_000, mouvementDebit: MONTANT }),
  ligne('70110000', ClasseCompte.CLASSE_7, { mouvementCredit: MONTANT, clotureDebit: MONTANT }),
  ligne('13100000', ClasseCompte.CLASSE_1, { clotureCredit: MONTANT }),
];

describe('avantSoldeDesComptesDeGestion', () => {
  it('rend au compte de produit son solde d’avant la clôture', () => {
    const produit = avantSoldeDesComptesDeGestion(BALANCE_DU_CLOS).find((l) => l.numero === '70110000')!;
    expect([produit.totalDebit, produit.totalCredit, produit.solde]).toEqual([0, MONTANT, -MONTANT]);
    expect([produit.clotureDebit, produit.clotureCredit]).toEqual([0, 0]);
  });

  it('retire le 13 que seule la clôture a mouvementé, comme toute ligne sans mouvement', () => {
    expect(avantSoldeDesComptesDeGestion(BALANCE_DU_CLOS).map((l) => l.numero)).toEqual(['52110000', '70110000']);
  });

  it('laisse intacte une ligne de bilan, report compris', () => {
    const banque = avantSoldeDesComptesDeGestion(BALANCE_DU_CLOS).find((l) => l.numero === '52110000')!;
    expect([banque.totalDebit, banque.solde]).toEqual([20_000 + MONTANT, 20_000 + MONTANT]);
  });

  it('garde un 13 mouvementé hors clôture, avec son seul mouvement', () => {
    const cascade = ligne('13200000', ClasseCompte.CLASSE_1, { mouvementCredit: 500, clotureCredit: MONTANT });
    expect(avantSoldeDesComptesDeGestion([cascade]).map((l) => l.solde)).toEqual([-500]);
  });

  it('lit comme nulles les colonnes de clôture qu’une ligne ne porte pas', () => {
    const sansColonnes = { totalDebit: 10, totalCredit: 4, solde: 6 };
    expect(avantSoldeDesComptesDeGestion([sansColonnes])).toEqual([
      { totalDebit: 10, totalCredit: 4, solde: 6, clotureDebit: 0, clotureCredit: 0 },
    ]);
  });
});

describe('chargerLignes · les états se lisent avant le solde des comptes de gestion', () => {
  it('rend le compte de résultat d’un exercice clos au lieu de zéros', async () => {
    const balance = jest.fn().mockResolvedValue({ lignes: BALANCE_DU_CLOS, totaux: { debit: 0, credit: 0 } });
    const ecritures = { balance } as unknown as EcritureService;

    const lignes = await chargerLignes(ecritures, 't1', 'e2026');

    // Le livre-journal seul, comme avant · seule la colonne de clôture sort.
    expect(balance).toHaveBeenCalledWith('t1', 'e2026', false, undefined);
    const gestion = lignes.filter((l) => /^[678]/.test(l.numero));
    expect(gestion.reduce((s, l) => s - l.solde, 0)).toBe(MONTANT);
    expect(lignes.some((l) => l.numero.startsWith('13'))).toBe(false);
  });
});
