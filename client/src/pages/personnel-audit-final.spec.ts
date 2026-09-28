import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AUDIT FINAL F105 · le régime de la retenue se déclare à l'écran, et il part
 * au serveur. La liste des régimes vit au serveur (`RegimeSalarial`) · chaque
 * valeur doit être proposée, et le corps de la simulation doit la porter,
 * sans quoi un forfait choisi ne ferait rien et le barème de l'art. 118
 * resterait retenu sur un personnel domestique.
 */
const page = readFileSync(join(__dirname, 'PersonnelPage.tsx'), 'utf8');
const serveur = readFileSync(
  join(__dirname, '..', '..', '..', 'src', 'modules', 'personnel', 'bareme-irpp.ts'),
  'utf8',
);

/** Le bloc qui commence à `debut` et se ferme sur `fin`. */
function bloc(texte: string, debut: string, fin: string): string {
  const i = texte.indexOf(debut);
  expect(i).toBeGreaterThan(0);
  return texte.slice(i, texte.indexOf(fin, i));
}

describe('F105 · le régime de la retenue se choisit et part au serveur', () => {
  it('chaque régime du serveur est proposé', () => {
    const union = bloc(serveur, 'export type RegimeSalarial', ';');
    const regimes = [...union.matchAll(/'([A-Z0-9_]+)'/g)].map((m) => m[1]);
    expect(regimes.length).toBe(3);
    const choix = bloc(page, 'Régime de la retenue', '</select>');
    for (const r of regimes) expect(choix).toContain(`value="${r}"`);
    // Vide = non déclaré, jamais un régime présumé.
    expect(choix).toContain('<option value="">');
  });

  it('le corps de la simulation porte le régime choisi', () => {
    expect(bloc(page, 'retenuesArticle71Fc:', 'enfantsBeneficiairesAllocations')).toContain(
      "...(regimeSalarial === '' ? {} : { regimeSalarial })",
    );
  });

  it('le motif du régime est affiché quand il n’est pas déclaré ou pas calculable', () => {
    expect(bloc(page, 'simulation.regimeSalarial &&', '</')).toContain('simulation.regimeSalarial.motif');
  });
});

/**
 * AUDIT FINAL F106 · la bulle de la saisie disait qu'un logement fourni en
 * nature empêche de chiffrer la quotité. Depuis P6, il est défalqué (arrêté
 * de 2005, art. 10) · une garantie négative vieillit, et celle-ci faisait
 * renoncer à un calcul que le serveur rend.
 */
describe('F106 · la bulle de l’article 114 dit ce que le serveur fait', () => {
  it('le logement en nature est défalqué, pas une cause d’abstention', () => {
    const bulle = bloc(page, 'La classe place le seuil de l’article 114', '"');
    expect(bulle).toContain('art. 10');
    expect(bulle).toContain('quote-part ouvrière');
  });
});

/**
 * AUDIT FINAL F109 · la bulle de la saisie demandait d'y porter la quote-part
 * ouvrière de la CNSS, que la simulation calcule et déduit déjà · suivie, elle
 * la faisait déduire deux fois de l'assiette fiscale.
 */
describe('F109 · le champ de l’article 71 ne reçoit que les autres versements', () => {
  it('la bulle dit que la CNSS est déduite d’office', () => {
    const bulle = bloc(page, 'La quote-part ouvrière de la CNSS est calculée', '"');
    expect(bulle).toContain('déduite d’office');
    expect(bulle).toContain('AUTRES versements');
  });

  it('le libellé du champ le dit aussi', () => {
    expect(page).toContain('Autres retenues art. 71 (FC)');
  });
});

/**
 * AUDIT FINAL F111 · la retenue est arrondie selon l'art. 150 au serveur, et
 * l'écart se montre sur sa propre ligne · sans elle, la somme des lignes du
 * tableau ne rendrait plus la retenue affichée.
 */
describe('F111 · le tableau mensuel montre l’arrondi de l’art. 150', () => {
  const tableau = readFileSync(join(__dirname, 'BaremeMensuelIrpp.tsx'), 'utf8');
  it('une ligne porte l’écart, lu au serveur, avant la retenue', () => {
    const ligne = bloc(tableau, 'mensuel.arrondiArticle150Fc !== undefined', 'Retenue du mois');
    expect(ligne).toContain('Arrondi à la centaine (art. 150)');
    expect(ligne).toContain('fc(Math.abs(mensuel.arrondiArticle150Fc))');
  });
});

/**
 * AUDIT FINAL F112 · le plancher de la CNSS se mesure au SMIG des jours payés
 * d'un mois incomplet · le champ part au serveur, et la réserve revient.
 */
describe('F112 · les jours payés partent au serveur, la réserve du plancher s’affiche', () => {
  it('le corps de la simulation porte les jours payés', () => {
    expect(bloc(page, 'effectif: nombre(effectifInpp),', '\n      //')).toContain('joursPayes: nombre(joursPayes)');
  });

  it('les réserves des cotisations sont affichées', () => {
    expect(bloc(page, '(simulation.cotisations.reserves ?? []).length > 0', '</ul>')).toContain(
      '(simulation.cotisations.reserves ?? []).map',
    );
  });
});

/**
 * AUDIT FINAL F226 · la monnaie de la rémunération convenue. Le formulaire la
 * demande à côté du montant, la création la porte au serveur, et un contrat
 * saisi sans elle la reçoit par la route qui la complète · sans quoi le
 * contrôle du minimum s'abstiendrait pour toujours sur ce contrat.
 */
describe('F226 · la monnaie du montant convenu se dit et part au serveur', () => {
  const controleur = readFileSync(
    join(__dirname, '..', '..', '..', 'src', 'modules', 'personnel', 'personnel.controller.ts'),
    'utf8',
  );

  it('le formulaire du contrat propose les deux monnaies, et « non déclarée » d’abord', () => {
    const choix = bloc(page, 'Monnaie de la rémunération</span>', '</select>');
    expect(choix).toContain('<option value="">');
    expect(choix).toContain('value="CDF"');
    expect(choix).toContain('value="USD"');
  });

  it('la création du contrat porte la monnaie choisie', () => {
    expect(bloc(page, 'const creerContrat = async', "setSucces('Contrat enregistré.')")).toContain(
      'deviseRemuneration: contrat.deviseRemuneration || undefined',
    );
  });

  it('un contrat sans monnaie la reçoit par la route qui la complète', () => {
    expect(controleur).toContain("@Post('contrats/:contratId/devise-remuneration')");
    expect(bloc(page, 'const declarerDevise = async', 'const terminerContrat')).toContain(
      'api.post(`/personnel/contrats/${contratId}/devise-remuneration`, { deviseRemuneration: devise })',
    );
  });

  it('la liste des contrats dit la monnaie du montant, ou qu’elle manque', () => {
    expect(page).toContain("{fc(Number(c.remunerationBase))} {c.deviseRemuneration ?? 'monnaie non déclarée'}");
  });
});

/**
 * AUDIT FINAL F259 · les listes du registre sont bornées par le serveur, et
 * l'écran lit leur nouvelle forme · tranche, total et `tronque`.
 */
describe('F259 · les listes bornées se lisent et se disent', () => {
  const composant = readFileSync(join(__dirname, '..', 'components', 'RubriquesAvancesPaie.tsx'), 'utf8');

  it('le registre lit la tranche et ce qu’elle dit d’elle-même', () => {
    const charger = bloc(page, 'const charger = useCallback', '}, [tous]);');
    expect(charger).toContain('setSalaries(r.salaries);');
    expect(charger).toContain('setRegistre({ total: r.total, tronque: r.tronque });');
    expect(page).toContain("libelleListeBornee(registre, salaries.length, 'salariés')");
  });

  it('« Aucun salarié » ne se dit que sur une liste lue', () => {
    expect(page).toContain('{registre && salaries.length === 0 && (');
  });

  it('la confrontation compte les contrats sur le registre entier', () => {
    expect(page).toContain('sur ${confrontation.totalFiches} contrat(s).');
    expect(page).toContain('{ total: confrontation.totalFiches, tronque: confrontation.tronque }');
  });

  it('les listes de la simulation lisent leur nouvelle forme', () => {
    expect(page).toContain('setModeles(r.modeles);');
    expect(page).toContain('setAvancesSalarie(r.avances);');
  });

  it('un échec de lecture des listes de la simulation se dit, sur chacune des trois', () => {
    // Relecture adverse · avalé, l'échec laissait « aucune avance » et une
    // simulation passée sans la retenue d'une avance qui existe.
    const effet = bloc(page, "if (onglet !== 'simulation') return;", '}, [onglet, selection]);');
    for (const liste of ['setRubriques([]);', 'setModeles([]);', 'setAvancesSalarie([]);']) {
      const i = effet.indexOf(`(e: ApiError) => {\n        ${liste}`);
      expect(i).toBeGreaterThan(0);
      expect(effet.slice(i).split('\n')[2].trim()).toBe('setErreur(e.message);');
    }
  });

  it('rubriques et avances de l’onglet disent leur tranche, et « aucune » sur une liste lue', () => {
    expect(composant).toContain('setAvances(r.avances);');
    expect(composant).toContain("libelleListeBornee(trancheAvances, avances.length, 'avances')");
    expect(composant).toContain("libelleListeBornee(trancheRubriques, rubriques.length, 'rubriques')");
    expect(composant).toContain('{trancheAvances && avances.length === 0 && (');
    expect(composant).toContain('{trancheRubriques && rubriques.length === 0 && (');
  });
});
