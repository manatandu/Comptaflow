import { lireReleve, memeReference, montantVuDuCompte, proposerCorrespondances, reconnaitreColonnes } from './releve-bancaire';

/**
 * RELEVÉ BANCAIRE · les propriétés qui casseraient en silence. Chaque défaut
 * ci-dessous produirait un rapprochement qui s'équilibre à l'écran et qui
 * pointe la mauvaise opération.
 */

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const releve = (id: string, date: string, debit: number, credit: number, reference: string | null = null) => ({
  id,
  rang: 1,
  date: d(date),
  libelle: id,
  reference,
  debit,
  credit,
});
const compte = (id: string, date: string, debit: number, credit: number, reference: string | null = null) => ({
  id,
  date: d(date),
  reference,
  debit,
  credit,
});

describe('le sens · un crédit du relevé est un débit du compte 52', () => {
  it('montant vu du compte', () => {
    expect(montantVuDuCompte({ debit: 0, credit: 500 })).toBe(500);
    expect(montantVuDuCompte({ debit: 300, credit: 0 })).toBe(-300);
  });

  it('un encaissement du relevé ne se propose jamais face à un décaissement du même montant', () => {
    const p = proposerCorrespondances([releve('r', '2026-03-10', 0, 1000)], [compte('sortie', '2026-03-10', 0, 1000)]);
    expect(p).toEqual([]);
    const q = proposerCorrespondances([releve('r', '2026-03-10', 0, 1000)], [compte('entree', '2026-03-10', 1000, 0)]);
    expect(q).toEqual([{ ligneReleveId: 'r', ligneEcritureIds: ['entree'], motif: 'MONTANT_DATE' }]);
  });
});

describe('aucune tolérance, aucune devinette', () => {
  it('deux montants voisins ne se proposent pas', () => {
    expect(proposerCorrespondances([releve('r', '2026-03-10', 0, 1000)], [compte('c', '2026-03-10', 999.8, 0)])).toEqual([]);
  });

  it('trois loyers identiques · aucune proposition, même au plus proche', () => {
    const p = proposerCorrespondances(
      [releve('r', '2026-03-05', 500, 0)],
      [compte('a', '2026-03-01', 0, 500), compte('b', '2026-03-04', 0, 500), compte('c', '2026-03-12', 0, 500)],
    );
    expect(p).toEqual([]);
  });

  it('une écriture convoitée par deux lignes du relevé n’est proposée à aucune', () => {
    const p = proposerCorrespondances(
      [releve('r1', '2026-03-05', 500, 0), releve('r2', '2026-03-06', 500, 0)],
      [compte('a', '2026-03-05', 0, 500)],
    );
    expect(p).toEqual([]);
  });

  it('hors de la fenêtre de dates, rien', () => {
    expect(proposerCorrespondances([releve('r', '2026-03-01', 0, 80)], [compte('c', '2026-04-20', 80, 0)], 15)).toEqual([]);
    expect(proposerCorrespondances([releve('r', '2026-03-01', 0, 80)], [compte('c', '2026-04-20', 80, 0)], 60)).toHaveLength(1);
  });
});

describe('la référence départage ce que le montant ne départage pas', () => {
  it('trois chèques de même montant · le numéro désigne le bon', () => {
    const p = proposerCorrespondances(
      [releve('r', '2026-03-20', 250, 0, 'CHQ 0042')],
      [compte('a', '2026-03-01', 0, 250, '0041'), compte('b', '2026-03-02', 0, 250, 'chq0042'), compte('c', '2026-03-03', 0, 250, '0043')],
    );
    expect(p).toEqual([{ ligneReleveId: 'r', ligneEcritureIds: ['b'], motif: 'REFERENCE' }]);
  });

  it('le numéro du chèque fait foi · « CHQ 0042 » désigne la pièce « 0042 »', () => {
    expect(memeReference('CHQ 0042', '0042')).toBe(true);
    expect(memeReference('VIR77', 'vir 77')).toBe(true);
    expect(memeReference('CHQ 0042', '0043')).toBe(false);
    // Sous trois chiffres, rien · « 7 » se rapprocherait de n'importe quoi.
    expect(memeReference('FACT 7', 'CHQ 7')).toBe(false);
    expect(memeReference(null, '0042')).toBe(false);
  });

  it('une même référence au mauvais montant ne se propose pas', () => {
    expect(
      proposerCorrespondances([releve('r', '2026-03-20', 250, 0, '42')], [compte('b', '2026-03-02', 0, 260, '42')]),
    ).toEqual([]);
  });
});

describe('lecture du fichier', () => {
  it('reconnaît Débit et Crédit, et ne prend pas la date de valeur pour la date d’opération', () => {
    const idx = reconnaitreColonnes(['Date valeur', 'Date opération', 'Libellé', 'Débit', 'Crédit']);
    expect(idx).toMatchObject({ date: 1, libelle: 2, debit: 3, credit: 4 });
  });

  it('un montant signé · négatif = sortie', () => {
    const idx = reconnaitreColonnes(['Date', 'Libellé', 'Montant']);
    const { lignes, anomalies } = lireReleve(
      { colonnes: ['Date', 'Libellé', 'Montant'], lignes: [['05/03/2026', 'Frais', '-1 500,00'], ['06/03/2026', 'Virement', '20 000']] },
      idx,
    );
    expect(anomalies).toEqual([]);
    expect(lignes.map((l) => [l.debit, l.credit])).toEqual([[1500, 0], [0, 20000]]);
  });

  it('une cellule illisible arrête l’import, avec son numéro de ligne', () => {
    const idx = reconnaitreColonnes(['Date', 'Libellé', 'Débit', 'Crédit']);
    const { anomalies } = lireReleve(
      { colonnes: ['Date', 'Libellé', 'Débit', 'Crédit'], lignes: [['05/03/2026', 'x', 'douze', '']] },
      idx,
    );
    expect(anomalies).toEqual(['Ligne 2 : montant illisible.']);
  });

  it('une ligne portant débit et crédit est refusée, une ligne à zéro est ignorée', () => {
    const idx = reconnaitreColonnes(['Date', 'Libellé', 'Débit', 'Crédit']);
    const r = lireReleve(
      {
        colonnes: ['Date', 'Libellé', 'Débit', 'Crédit'],
        lignes: [['05/03/2026', 'Solde reporté', '', ''], ['06/03/2026', 'x', '10', '5']],
      },
      idx,
    );
    expect(r.lignes).toEqual([]);
    expect(r.anomalies).toEqual(['Ligne 3 : une opération porte à la fois un débit et un crédit.']);
  });

  it('sans colonne de date ni de montant, rien ne se lit', () => {
    expect(lireReleve({ colonnes: ['A', 'B'], lignes: [] }, reconnaitreColonnes(['A', 'B'])).anomalies).toHaveLength(2);
  });
});
