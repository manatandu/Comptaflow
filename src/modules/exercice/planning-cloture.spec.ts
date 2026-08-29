import { JALONS_CLOTURE, dateJalon } from './planning-cloture';

/**
 * PLANNING DE CLÔTURE · trois choses doivent tenir.
 *
 * 1. Les dates se calculent SUR LA CLÔTURE DE L'EXERCICE, pas sur l'année
 *    civile : le cours du CPCC raisonne sur un 31 décembre (« au plus tard
 *    fin avril de l'année prochaine »), OmegaX autorise un exercice décalé.
 * 2. Le calcul de fin de mois doit tomber juste, y compris en février bissextile.
 * 3. La table ne porte AUCUN MONTANT : ni taux d'astreinte, ni pénalité.
 *    Même règle que correspondance-retenues.ts, et pour la même raison :
 *    les taux cités par les textes de 2010 et 2013 n'ont pas été revérifiés.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('planning de clôture', () => {
  const finExerciceCivil = new Date(Date.UTC(2026, 11, 31));

  it('cale les dépôts congolais sur les mois annoncés par le cours, pour un exercice civil', () => {
    const echeance = (etape: number) =>
      iso(dateJalon(finExerciceCivil, JALONS_CLOTURE.find((j) => j.etape === etape)!.echeance));

    // « au plus tard fin avril » (DGI)
    expect(echeance(10)).toBe('2027-04-30');
    // « au plus tard 15 juin » (Ministère de l'Économie)
    expect(echeance(12)).toBe('2027-06-15');
    // « au plus tard fin juin » (approbation des comptes, puis dépôt au CPCC)
    expect(echeance(13)).toBe('2027-06-30');
    expect(echeance(14)).toBe('2027-06-30');
    // « au plus tard fin juillet » (RCCM)
    expect(echeance(15)).toBe('2027-07-31');
  });

  it("décale tout le planning quand l'exercice ne se clôt pas au 31 décembre", () => {
    // Exercice clos au 30 juin : le dépôt DGI n'est plus en avril mais en
    // octobre. Coder « fin avril » en dur aurait donné une échéance déjà
    // passée le jour de la clôture.
    const finJuin = new Date(Date.UTC(2026, 5, 30));
    const dgi = JALONS_CLOTURE.find((j) => j.etape === 10)!;
    expect(iso(dateJalon(finJuin, dgi.echeance))).toBe('2026-10-31');
  });

  it('tombe sur le bon dernier jour de février, bissextile compris', () => {
    // Clôture au 31 octobre 2027 : quatre mois après, c'est février 2028,
    // année bissextile. Le 29, pas le 28, et pas le 1er mars.
    const finOctobre = new Date(Date.UTC(2027, 9, 31));
    expect(iso(dateJalon(finOctobre, { moisApres: 4, jour: 'FIN' }))).toBe('2028-02-29');
    expect(iso(dateJalon(new Date(Date.UTC(2026, 9, 31)), { moisApres: 4, jour: 'FIN' }))).toBe('2027-02-28');
  });

  it('classe les jalons par échéance croissante, comme un planning se lit', () => {
    const echeances = JALONS_CLOTURE.map((j) => dateJalon(finExerciceCivil, j.echeance).getTime());
    expect(echeances).toEqual([...echeances].sort((a, b) => a - b));
  });

  it('ordonne les jalons et fait tenir chaque échéance après son début', () => {
    const etapes = JALONS_CLOTURE.map((j) => j.etape);
    expect(etapes).toEqual([...etapes].sort((a, b) => a - b));
    expect(new Set(etapes).size).toBe(etapes.length);
    for (const j of JALONS_CLOTURE) {
      expect(dateJalon(finExerciceCivil, j.echeance).getTime()).toBeGreaterThanOrEqual(
        dateJalon(finExerciceCivil, j.debut).getTime(),
      );
    }
  });

  it('cite une source pour chaque jalon', () => {
    for (const j of JALONS_CLOTURE) {
      expect(j.source.length).toBeGreaterThan(10);
    }
  });

  it("ne contient aucun taux ni montant d'astreinte", () => {
    // Les deux arrêtés d'astreinte sont NOMMÉS (c'est utile au comptable),
    // mais aucun chiffre monétaire ne doit apparaître. Les nombres tolérés
    // sont les numéros et années des textes cités, jamais un montant : on
    // interdit donc les marqueurs monétaires et les pourcentages.
    const texte = JALONS_CLOTURE.map((j) => `${j.libelle} ${j.detail} ${j.source}`).join(' ');
    expect(texte).not.toMatch(/%/);
    expect(texte).not.toMatch(/\bFC\b|FCFA|\bCDF\b|franc/i);
    expect(texte).not.toMatch(/\d[\d\s.]*,\d{2}\b/);
  });

  it('marque comme LEGALE toute échéance opposable à un tiers', () => {
    const legaux = JALONS_CLOTURE.filter((j) => j.nature === 'LEGALE').map((j) => j.etape);
    // Livre d'inventaire, registre des donateurs, DGI, Économie, CPCC, RCCM.
    expect(legaux).toEqual([7, 9, 10, 12, 14, 15]);
  });
});
