import { FormeJuridiqueEbnl, Referentiel } from '@prisma/client';
import { JALONS_CLOTURE, dateJalon, jalonsApplicables , obligationsEvenementiellesApplicables, OBLIGATIONS_EVENEMENTIELLES } from './planning-cloture';

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

  // Les jalons se visent par LIBELLÉ, jamais par numéro d'étape : le numéro
  // n'est qu'un rang dans la liste, et insérer un jalon au milieu décale tous
  // les suivants · un test ancré au numéro mesurerait la renumérotation
  // plutôt que la date qu'il prétend vérifier.
  const parLibelle = (fragment: string) =>
    JALONS_CLOTURE.find((j) => j.libelle.includes(fragment))!;

  it('cale les dépôts congolais sur les mois annoncés par le cours, pour un exercice civil', () => {
    const echeance = (fragment: string) =>
      iso(dateJalon(finExerciceCivil, parLibelle(fragment).echeance));

    // « au courant du mois de janvier » (compte annuel au Ministère de la Justice)
    expect(echeance('Ministère de la Justice')).toBe('2027-01-31');
    expect(echeance('Déclarations fiscales')).toBe('2027-04-30');
    // « au plus tard 15 juin » (Ministère de l'Économie)
    expect(echeance('Économie nationale')).toBe('2027-06-15');
    // « au plus tard fin juin » (approbation des comptes, puis dépôt au CPCC)
    expect(echeance('approbation des comptes')).toBe('2027-06-30');
    expect(echeance('CPCC')).toBe('2027-06-30');
    // « au plus tard fin juillet » (RCCM, dossiers SYSCOHADA seulement)
    expect(echeance('RCCM')).toBe('2027-07-31');
  });

  it("décale tout le planning quand l'exercice ne se clôt pas au 31 décembre", () => {
    // Exercice clos au 30 juin : le dépôt DGI n'est plus en avril mais en
    // octobre. Coder « fin avril » en dur aurait donné une échéance déjà
    // passée le jour de la clôture.
    const finJuin = new Date(Date.UTC(2026, 5, 30));
    expect(iso(dateJalon(finJuin, parLibelle('Déclarations fiscales').echeance))).toBe('2026-10-31');
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
    // mais aucun chiffre MONÉTAIRE ne doit apparaître : un taux d'astreinte
    // de 2013 non revérifié n'a rien à faire dans un logiciel de 2026.
    //
    // Le pourcentage est admis à UNE condition, et le test la vérifie : que
    // le jalon cite l'article qui le fixe. La distinction n'est pas de
    // confort · un quota légal invariable et sourcé (la proportion de
    // main-d'œuvre nationale de l'article 37) n'est pas de même nature qu'un
    // taux financier susceptible de changer à chaque loi de finances. Sans
    // cette nuance, la règle interdirait de citer la loi elle-même.
    const texte = JALONS_CLOTURE.map((j) => `${j.libelle} ${j.detail} ${j.source}`).join(' ');
    expect(texte).not.toMatch(/\bFC\b|FCFA|\bCDF\b|franc/i);
    expect(texte).not.toMatch(/\d[\d\s.]*,\d{2}\b/);
    for (const j of JALONS_CLOTURE) {
      if (/%/.test(`${j.libelle} ${j.detail}`)) {
        expect(j.source).toMatch(/art\.|article/i);
      }
    }
  });

  it('marque comme LEGALE toute échéance opposable à un tiers', () => {
    const legaux = JALONS_CLOTURE.filter((j) => j.nature === 'LEGALE').map((j) => j.libelle);
    // Visés par LIBELLÉ et non par numéro d'étape : le numéro n'est qu'un
    // rang dans la liste, et insérer un jalon au milieu décalait tous les
    // suivants · le test mesurait alors la renumérotation, pas la nature.
    expect(legaux).toEqual([
      'Compte annuel et liste des membres effectifs au Ministère de la Justice',
      'Déclaration semestrielle relative aux ressources',
      'Livre d’inventaire',
      'Budget et comptes annuels au ministre du secteur (établissement d’utilité publique)',
      'Accord-cadre et main-d’œuvre nationale (ONG de droit étranger)',
      'Registre des donateurs arrêté',
      'Déclarations fiscales annuelles',
      'Rapport d’activité au Ministère du Plan et au ministère du secteur',
      'Dépôt au Ministère de l’Économie nationale',
      'Dépôt des états financiers SYCEBNL au CPCC',
      'Dépôt au RCCM',
    ]);
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
    const fiscal = JALONS_CLOTURE.find((j) => j.libelle.includes('Déclarations fiscales'))!;
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

/**
 * LES MANQUES COMBLÉS PAR L'AUDIT DU 29/08/2026 · trois obligations de la loi
 * 004/2001 que le planning ignorait, dont celle dont la sanction est la
 * dissolution de l'association.
 */
describe('obligations de la loi 004/2001 réintégrées', () => {
  const asbl = {
    referentiel: Referentiel.SYCEBNL,
    formeJuridique: FormeJuridiqueEbnl.ASSOCIATION,
    droitEtranger: false,
  };
  const eup = { ...asbl, formeJuridique: FormeJuridiqueEbnl.ETABLISSEMENT_UTILITE_PUBLIQUE };
  const ongEtrangere = {
    ...asbl,
    formeJuridique: FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE,
    droitEtranger: true,
  };
  const libelles = (c: Parameters<typeof jalonsApplicables>[0]) => jalonsApplicables(c).map((j) => j.libelle);

  it('donne enfin un jalon à l’établissement d’utilité publique (art. 66)', () => {
    // Le défaut corrigé : FORMES_ASBL omettait cette forme, si bien que la
    // SEULE que la loi vise explicitement n'affichait AUCUN dépôt.
    expect(libelles(eup).some((l) => l.includes('ministre du secteur'))).toBe(true);
  });

  it('ne sert pas le jalon EUP à une association ordinaire', () => {
    expect(libelles(asbl).some((l) => l.includes('ministre du secteur'))).toBe(false);
  });

  it('porte la déclaration SEMESTRIELLE des ressources, sanctionnée par la dissolution', () => {
    const jalon = jalonsApplicables(asbl).find((j) => j.libelle.includes('semestrielle'))!;
    expect(jalon).toBeDefined();
    expect(jalon.detail).toContain('chaque semestre');
    expect(jalon.source).toContain('art. 4, e');
  });

  it('n’active le jalon des ONG étrangères que pour un dossier de droit étranger', () => {
    expect(libelles(ongEtrangere).some((l) => l.includes('Accord-cadre'))).toBe(true);
    expect(libelles(asbl).some((l) => l.includes('Accord-cadre'))).toBe(false);
  });
});

/**
 * OBLIGATIONS ÉVÉNEMENTIELLES · elles ne suivent aucun calendrier de clôture,
 * et c'est pour cela qu'elles échappaient au logiciel. Les ranger parmi les
 * jalons annuels leur aurait donné une échéance fausse.
 */
describe('obligations déclenchées par un événement', () => {
  it('porte le changement d’administrateur (art. 11) et le mouvement d’immeuble (art. 15)', () => {
    const cles = OBLIGATIONS_EVENEMENTIELLES.map((o) => o.cle);
    expect(cles).toContain('changementAdministrateur');
    expect(cles).toContain('mouvementImmeuble');
  });

  it('rattache le mouvement d’immeuble à l’écran qui le constate', () => {
    const o = OBLIGATIONS_EVENEMENTIELLES.find((x) => x.cle === 'mouvementImmeuble')!;
    expect(o.ecranDeclencheur).toContain('Immobilisations');
    // La copie au Ministre des Finances est la moitié oubliée de l'article 15.
    expect(o.destinataire).toContain('FINANCES');
  });

  it('cite une source et un délai pour chaque obligation', () => {
    for (const o of OBLIGATIONS_EVENEMENTIELLES) {
      expect(o.source.length).toBeGreaterThan(10);
      expect(o.delai.length).toBeGreaterThan(5);
    }
  });

  it('filtre selon la forme juridique, comme les jalons', () => {
    const cles = obligationsEvenementiellesApplicables({
      formeJuridique: FormeJuridiqueEbnl.UNITE_GESTION_PROJET,
      droitEtranger: false,
    }).map((o) => o.cle);
    // Une unité de gestion de projet n'est pas une ASBL au sens de la loi
    // 004/2001 : ses articles 11 et 15 ne la visent pas.
    expect(cles).not.toContain('changementAdministrateur');
    expect(cles).toContain('numeroImpot');
  });
});
