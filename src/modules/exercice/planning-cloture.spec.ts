import { FormeJuridiqueEbnl, Referentiel } from '@prisma/client';
import { JALONS_CLOTURE, dateJalon, jalonsApplicables } from './planning-cloture';

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

    // « au courant du mois de janvier » (compte annuel au Ministère de la Justice)
    expect(echeance(4)).toBe('2027-01-31');
    // Déclarations fiscales annuelles
    expect(echeance(11)).toBe('2027-04-30');
    // « au plus tard 15 juin » (Ministère de l'Économie)
    expect(echeance(14)).toBe('2027-06-15');
    // « au plus tard fin juin » (approbation des comptes, puis dépôt au CPCC)
    expect(echeance(15)).toBe('2027-06-30');
    expect(echeance(16)).toBe('2027-06-30');
    // « au plus tard fin juillet » (RCCM, dossiers SYSCOHADA seulement)
    expect(echeance(17)).toBe('2027-07-31');
  });

  it("décale tout le planning quand l'exercice ne se clôt pas au 31 décembre", () => {
    // Exercice clos au 30 juin : le dépôt DGI n'est plus en avril mais en
    // octobre. Coder « fin avril » en dur aurait donné une échéance déjà
    // passée le jour de la clôture.
    const finJuin = new Date(Date.UTC(2026, 5, 30));
    const dgi = JALONS_CLOTURE.find((j) => j.etape === 11)!;
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
    // Compte annuel à la Justice, livre d'inventaire, registre des donateurs,
    // déclarations fiscales, rapport d'activité au Plan, Économie, CPCC, RCCM.
    expect(legaux).toEqual([4, 8, 10, 11, 13, 14, 16, 17]);
  });
});

/**
 * APPLICABILITÉ · le point de la correction du 29/08/2026. Servir à une
 * association le dépôt au RCCM, ou à une entreprise le dépôt du compte annuel
 * au Ministère de la Justice, c'est afficher une obligation qui n'existe pas.
 */
describe('jalons applicables selon la forme juridique', () => {
  const libelles = (c: Parameters<typeof jalonsApplicables>[0]) =>
    jalonsApplicables(c).map((j) => j.libelle);

  const asbl = {
    referentiel: Referentiel.SYCEBNL,
    formeJuridique: FormeJuridiqueEbnl.ASSOCIATION,
    droitEtranger: false,
  };

  it("ne propose jamais le RCCM à une ASBL : elle n'est pas commerçante", () => {
    expect(libelles(asbl).some((l) => l.includes('RCCM'))).toBe(false);
  });

  it('donne à une ASBL le dépôt du compte annuel au Ministère de la Justice', () => {
    expect(libelles(asbl).some((l) => l.includes('Ministère de la Justice'))).toBe(true);
  });

  it("ne présente aucun jalon comme un dépôt d'états financiers à la DGI", () => {
    // Le seul jalon fiscal parle de DÉCLARATIONS, jamais d'un dépôt de liasse.
    const fiscal = JALONS_CLOTURE.find((j) => j.etape === 11)!;
    expect(fiscal.libelle).toBe('Déclarations fiscales annuelles');
    expect(fiscal.detail).toContain('N’EST PAS un dépôt d’états financiers');
    const depots = JALONS_CLOTURE.filter((j) => j.libelle.toLowerCase().startsWith('dépôt'));
    expect(depots.some((j) => /DGI|fiscal|impôts/i.test(j.libelle))).toBe(false);
  });

  it('réserve le rapport au Ministère du Plan aux ONG', () => {
    expect(libelles(asbl).some((l) => l.includes('Ministère du Plan'))).toBe(false);
    const ong = { ...asbl, formeJuridique: FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE };
    expect(libelles(ong).some((l) => l.includes('Ministère du Plan'))).toBe(true);
  });

  it('bascule sur le circuit commercial pour un dossier SYSCOHADA', () => {
    const entreprise = { ...asbl, referentiel: Referentiel.SYSCOHADA };
    const l = libelles(entreprise);
    expect(l.some((x) => x.includes('RCCM'))).toBe(true);
    // Ni compte annuel à la Justice, ni livre d'inventaire ou registre des
    // donateurs SYCEBNL : ce sont des obligations d'EBNL.
    expect(l.some((x) => x.includes('Ministère de la Justice'))).toBe(false);
    expect(l.some((x) => x.includes('donateurs'))).toBe(false);
  });

  it('garde les jalons internes pour toutes les formes', () => {
    for (const forme of Object.values(FormeJuridiqueEbnl)) {
      const l = libelles({ ...asbl, formeJuridique: forme });
      expect(l).toContain('Balance de vérification');
      expect(l).toContain('Clôture et réouverture des livres');
    }
  });
});
