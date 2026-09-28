import { readFileSync } from 'fs';
import { join } from 'path';
import {
  aideDateReprise,
  estRattachement,
  exercicesDeReprise,
  momentDeReprise,
  naturesTiersProposees,
  porteUneCharge,
} from './regularisation-types';
import type { Referentiel, TypeRegularisation } from './types';

/**
 * AUDIT FINAL F67 · l'écran des régularisations sert les cinq types du
 * serveur, et la nature du tiers que la table du serveur ouvre pour chacun.
 */
const racine = join(__dirname, '../../..');
const service = readFileSync(join(racine, 'src/modules/regularisation/regularisation.service.ts'), 'utf8');
const schema = readFileSync(join(racine, 'prisma/schema.prisma'), 'utf8');
const page = readFileSync(join(__dirname, '../pages/RegularisationPage.tsx'), 'utf8');

describe('F67 · les régularisations à l’écran', () => {
  it('l’écran propose chacun des types du serveur', () => {
    const bloc = /enum TypeRegularisation \{([\s\S]*?)\n\}/.exec(schema)![1];
    const types = bloc
      .split('\n')
      .map((l) => /^\s*([A-Z_]+)\b/.exec(l)?.[1])
      .filter((t): t is string => !!t);
    expect(types).toHaveLength(5);
    for (const t of types) expect([t, page.includes(`valeur: '${t}'`)]).toEqual([t, true]);
  });

  it('les natures proposées sont celles que la table du serveur ouvre, type par type', () => {
    const table = /const RATTACHEMENT[\s\S]*?= \{([\s\S]*?)\n\};/.exec(service)![1];
    const lignes = [...table.matchAll(/(\w+): \{ charge: '(\d*)', produit: '(\d*)'/g)];
    expect(lignes).toHaveLength(5);
    const ouvertes = (colonne: 2 | 3) => lignes.filter((l) => l[colonne] !== '').map((l) => l[1]).sort();
    expect([...naturesTiersProposees('CHARGE_A_PAYER')].sort()).toEqual(ouvertes(2));
    expect([...naturesTiersProposees('PRODUIT_A_RECEVOIR')].sort()).toEqual(ouvertes(3));
    expect(naturesTiersProposees('CHARGE_CONSTATEE_AVANCE')).toEqual([]);
  });

  it('le compte de gestion suit le type · charge en classe 6, produit en classe 7', () => {
    expect(porteUneCharge('CHARGE_A_PAYER')).toBe(true);
    expect(porteUneCharge('CHARGE_CONSTATEE_AVANCE')).toBe(true);
    expect(porteUneCharge('PRODUIT_A_RECEVOIR')).toBe(false);
    expect(porteUneCharge('SUBVENTION_PLURIANNUELLE')).toBe(false);
    expect(estRattachement('PRODUIT_A_RECEVOIR')).toBe(true);
    expect(estRattachement('PRODUIT_CONSTATE_AVANCE')).toBe(false);
  });

  it('la nature du tiers part avec la demande, et l’aperçu d’un rattachement n’est pas un prorata', () => {
    expect(page).toContain('...(estRattachement(type) && natureTiers ? { natureTiers } : {})');
    expect(page).toMatch(/simulation\?\.rattachement && \([\s\S]*?Rattaché entièrement à cet exercice/);
  });
});

describe('F79 · les exercices de reprise', () => {
  const ex = (id: string, debut: string, statut: 'OUVERT' | 'CLOTURE' = 'OUVERT') => ({ id, dateDebut: debut, statut });
  const exercices = [ex('n0', '2025-01-01'), ex('n', '2026-01-01'), ex('n1', '2027-01-01'), ex('n2', '2028-01-01', 'CLOTURE')];

  it('ne propose que les exercices ouverts postérieurs à la constatation', () => {
    expect(exercicesDeReprise(exercices, 'n').map((e) => e.id)).toEqual(['n1']);
  });

  it('la fenêtre propose ces exercices-là, et confirme avant de passer la reprise', () => {
    const i = page.indexOf('Reprendre sur…');
    expect(i).toBeGreaterThan(0);
    const select = page.slice(page.lastIndexOf('<select', i), page.indexOf('</select>', i));
    expect(select).toContain('exercicesDeReprise(exercices, r.exerciceId)');
    // Le choix ne passe l'écriture qu'à travers la confirmation.
    expect(select).toMatch(/window\.confirm\([\s\S]*\)\s*\) \{\s*reprendre\(r\.id, cible\.id\);/);
  });
});

describe('F208 · la date de reprise dite type par type', () => {
  const REFERENTIELS: Referentiel[] = ['SYCEBNL', 'SYSCOHADA'];
  const TYPES: TypeRegularisation[] = [
    'CHARGE_CONSTATEE_AVANCE',
    'PRODUIT_CONSTATE_AVANCE',
    'SUBVENTION_PLURIANNUELLE',
    'CHARGE_A_PAYER',
    'PRODUIT_A_RECEVOIR',
  ];

  // La même matrice que `dateReprise` du serveur (regularisation.spec.ts) ·
  // tout se reprend à l'ouverture des DEUX côtés, sauf la subvention
  // pluriannuelle, reprise à la fin. Le 476 et le 477 SYCEBNL allaient à la
  // fin jusqu'au 2026-09-28, sur la règle de la seule subvention.
  const ATTENDU: Record<Referentiel, Record<TypeRegularisation, 'OUVERTURE' | 'FIN'>> = {
    SYCEBNL: {
      CHARGE_CONSTATEE_AVANCE: 'OUVERTURE',
      PRODUIT_CONSTATE_AVANCE: 'OUVERTURE',
      SUBVENTION_PLURIANNUELLE: 'FIN',
      CHARGE_A_PAYER: 'OUVERTURE',
      PRODUIT_A_RECEVOIR: 'OUVERTURE',
    },
    SYSCOHADA: {
      CHARGE_CONSTATEE_AVANCE: 'OUVERTURE',
      PRODUIT_CONSTATE_AVANCE: 'OUVERTURE',
      SUBVENTION_PLURIANNUELLE: 'FIN',
      CHARGE_A_PAYER: 'OUVERTURE',
      PRODUIT_A_RECEVOIR: 'OUVERTURE',
    },
  };

  it('le moment de la reprise suit la règle du serveur, dans les deux référentiels', () => {
    for (const ref of REFERENTIELS) {
      for (const t of TYPES) expect([ref, t, momentDeReprise(t)]).toEqual([ref, t, ATTENDU[ref][t]]);
    }
  });

  it('le 476 d’un dossier SYCEBNL se reprend à l’ouverture, sur le Guide d’application', () => {
    // Application 10 · le 476 « extourné au début de l'exercice suivant ».
    const aide = aideDateReprise('SYCEBNL', 'CHARGE_CONSTATEE_AVANCE');
    expect(aide.texte).toContain("À L'OUVERTURE");
    expect(aide.source).toContain('Application 10');
  });

  it('la charge à payer d’un dossier SYCEBNL se dit à l’ouverture, pas à la fin', () => {
    // Le défaut relevé · la bulle de la colonne disait « À LA FIN » à toute
    // ligne d'un dossier SYCEBNL, rattachement compris.
    expect(aideDateReprise('SYCEBNL', 'CHARGE_A_PAYER').texte).toContain("À L'OUVERTURE");
    expect(aideDateReprise('SYCEBNL', 'PRODUIT_A_RECEVOIR').texte).toContain("À L'OUVERTURE");
  });

  it('le texte de chaque bulle dit le moment que la règle retient', () => {
    for (const ref of REFERENTIELS) {
      for (const t of TYPES) {
        const attendu = momentDeReprise(t) === 'OUVERTURE' ? "À L'OUVERTURE" : 'À LA FIN';
        expect([ref, t, aideDateReprise(ref, t).texte.includes(attendu)]).toEqual([ref, t, true]);
      }
    }
  });

  it('le rattachement cite la fiche du compte de SON référentiel', () => {
    expect(aideDateReprise('SYCEBNL', 'CHARGE_A_PAYER').source).toMatch(/^SYCEBNL.*compte 40/);
    expect(aideDateReprise('SYSCOHADA', 'CHARGE_A_PAYER').source).toMatch(/^AUDCIF.*compte 40/);
    expect(aideDateReprise('SYCEBNL', 'PRODUIT_A_RECEVOIR').source).toMatch(/^SYCEBNL.*compte 41/);
    expect(aideDateReprise('SYSCOHADA', 'PRODUIT_A_RECEVOIR').source).toMatch(/^AUDCIF.*compte 41/);
  });

  it('chaque ligne à reprendre porte la bulle de SON type, et la colonne un résumé par type', () => {
    const debut = page.indexOf('{regularisations?.map((r) =>');
    expect(debut).toBeGreaterThan(0);
    const fin = page.indexOf('{regularisations?.length === 0', debut);
    expect(fin).toBeGreaterThan(debut);
    const lignes = page.slice(debut, fin);
    // Les deux branches sans reprise (qui peut écrire, qui consulte).
    expect(lignes.split('aideDateReprise(utilisateur?.tenant.referentiel, r.type)')).toHaveLength(3);
    const entete = page.slice(page.lastIndexOf('<span>Période</span>', debut), debut);
    expect(entete).toContain('resumeDatesDeReprise(utilisateur?.tenant.referentiel)');
    const resume = /function resumeDatesDeReprise[\s\S]*?\n\}/.exec(page)![0];
    expect(resume).toContain('momentDeReprise(t.valeur)');
  });
});

/**
 * La liste des régularisations disait « Aucune régularisation sur cet
 * exercice » sur un échec de lecture, et gardait à l'écran la liste de
 * l'exercice précédent pendant la lecture du suivant. « Aucune » ne se dit
 * que sur une liste LUE (CLAUDE.md, § 9 ter).
 */
describe('la liste des régularisations · « aucune » sur une liste lue', () => {
  it('la liste part de null, et un échec la remet à null avec son motif', () => {
    expect(page).toContain('useState<Regularisation[] | null>(null)');
    const debut = page.indexOf('const chargerRegularisations = async () => {');
    expect(debut).toBeGreaterThan(0);
    const corps = page.slice(debut, page.indexOf('\n  };', debut));
    const echec = corps.slice(corps.indexOf('} catch'));
    expect(echec).toContain('setRegularisations(null);');
    expect(echec).toContain('setErreurLecture(');
  });

  it('le changement d’exercice n’affiche pas la liste de l’ancien', () => {
    const effet = page.indexOf("if (onglet === 'regularisation') {");
    expect(effet).toBeGreaterThan(0);
    const bloc = page.slice(effet, page.indexOf('} else chargerAbonnements();', effet));
    expect(bloc.indexOf('setRegularisations(null);')).toBeGreaterThan(-1);
    expect(bloc.indexOf('setRegularisations(null);')).toBeLessThan(bloc.indexOf('chargerRegularisations();'));
  });

  it('le motif s’affiche, et « aucune » ne se dit que sur une liste non nulle', () => {
    const vide = page.indexOf('Aucune régularisation sur cet exercice.');
    expect(vide).toBeGreaterThan(0);
    const garde = page.slice(page.lastIndexOf('{', page.lastIndexOf('&& (', vide)), vide);
    expect(garde).toContain('{regularisations?.length === 0 && (');
    expect(page).toContain('Liste des régularisations illisible · {erreurLecture}');
  });
});
