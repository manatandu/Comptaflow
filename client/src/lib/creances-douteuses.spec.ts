import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  annonceRevue,
  bornesExercice,
  ecartsRapprochement,
  etatRapprochement,
  libelleSoldesProvisoires,
  messageLettrage416,
  montantPourChamp,
  compte491Initial,
  comptes491DeLaNature,
  racine491,
  compte416Initial,
  motifAnnulationValide,
  motifListe651Vide,
  mouvementAAnnulerParDefaut,
  piecesAEnvoyer,
} from './creances-douteuses';
import { montant } from './montants';
import { montantSaisi } from './montant-saisi';

const page = readFileSync(join(__dirname, '../pages/CreancesDouteusesPage.tsx'), 'utf8');

describe('créances douteuses · écran (ligne A7)', () => {
  it('annonce l’écart seul, dotation, reprise ou maintien, sur les comptes et la date SERVIS pour la créance (relecture « écran », 12)', () => {
    const comptes = { compte491: '49120000', dotation: '6594', reprise: '7594' };
    expect(annonceRevue(0, 400_000, comptes, '2026-12-31')).toBe(`Dotation de ${montant(400_000)} · D 6594 / C 49120000, au 31/12/2026.`);
    expect(annonceRevue(400_000, 250_000, comptes, '2026-12-31')).toBe(`Reprise de ${montant(150_000)} · D 49120000 / C 7594, au 31/12/2026.`);
    expect(annonceRevue(400_000, 400_000, comptes, '2026-12-31')).toContain('aucune écriture');
    // Un champ vide n'annonce rien · vide n'est pas zéro.
    expect(annonceRevue(400_000, null, comptes, '2026-12-31')).toBeNull();
    // Le 491 d'une créance litigieuse est le sien, jamais un 491 générique.
    expect(annonceRevue(0, 1, { ...comptes, compte491: '49110000' }, '2027-06-30')).toBe(`Dotation de ${montant(1)} · D 6594 / C 49110000, au 30/06/2027.`);
    expect(page).toContain('proposition.comptes, proposition.dateRevue');
  });

  it('11 · le montant prérempli est arrondi au centime à deux décimales, et une absence laisse le champ vide', () => {
    expect(montantPourChamp(0.1 + 0.2)).toBe('0.30');
    expect(montantPourChamp(1_160_000)).toBe('1160000.00');
    expect(montantPourChamp(null)).toBe('');
    expect(montantPourChamp(undefined)).toBe('');
    expect(montantSaisi(montantPourChamp(1234.565))).toBe(1234.57);
    expect(page).toContain('montantPourChamp(creance?.resteALaCloture)');
    expect(page).toContain('montantPourChamp(c.solde)');
    expect(page).not.toMatch(/String\(creance\?\.resteALaCloture/);
  });

  it('13 · la date d’un geste est bornée à l’exercice', () => {
    expect(bornesExercice({ dateDebut: '2026-01-01T00:00:00.000Z', dateFin: '2026-12-31T00:00:00.000Z' })).toEqual({ min: '2026-01-01', max: '2026-12-31' });
    expect(bornesExercice(null)).toEqual({});
    expect(page).toContain('min={bornes.min}');
    expect(page).toContain('max={bornes.max}');
  });

  it('M6 · un rapprochement non calculé sur une liste tronquée se dit, jamais lu comme un écart nul', () => {
    expect(etatRapprochement({ tronque: true, rapprochement: null })).toBe('non-calcule-tronque');
    expect(etatRapprochement({ tronque: false, rapprochement: null })).toBe('absent');
    expect(etatRapprochement({ tronque: false, rapprochement: { solde416: 0 } })).toBe('calcule');
    expect(page).toContain('Rapprochement avec le 416 et le 491 non calculé · liste tronquée.');
  });

  it('M4 et M5 · la liste des comptes tronquée donne son issue, les annulations tronquées disent leur total', () => {
    expect(page).toContain('tapez le début du numéro du compte du client pour la restreindre');
    expect(page).toContain('&numero=${encodeURIComponent(numero.trim())}');
    expect(page).toContain('liste.annulations.revues.total');
    expect(page).toContain('les plus anciens ne sont pas montrés');
  });

  it('présélectionne le 416 proposé, sinon le seul compte, sinon rien', () => {
    const c = [
      { id: 'a', numero: '41610000' },
      { id: 'b', numero: '41620000' },
    ];
    expect(compte416Initial({ DOUTEUSE: '4162' }, 'DOUTEUSE', c)).toBe('b');
    expect(compte416Initial({ DOUTEUSE: null }, 'DOUTEUSE', c)).toBe('');
    expect(compte416Initial({ DOUTEUSE: null }, 'DOUTEUSE', [c[0]])).toBe('a');
  });

  it('n’envoie que les pièces qui ont une nature et une référence', () => {
    expect(piecesAEnvoyer([{ nature: 'Mise en demeure', reference: 'LR-1', date: '' }, { nature: '', reference: 'x', date: '' }])).toEqual([
      { nature: 'Mise en demeure', reference: 'LR-1' },
    ]);
  });

  it('M8 · une liste 651 vide dit pourquoi et quoi faire ; non lue, elle ne dit rien', () => {
    expect(motifListe651Vide(null)).toBeNull();
    expect(motifListe651Vide([{}])).toBeNull();
    expect(motifListe651Vide([])).toContain('Plan comptable');
    expect(page).toContain('motifListe651Vide(comptes651)');
  });

  it('B2 · l’annulation d’une revue exige un motif de 3 à 500 caractères, dans sa modale', () => {
    expect(motifAnnulationValide('ab')).toBe(false);
    expect(motifAnnulationValide('Erreur')).toBe(true);
    expect(motifAnnulationValide('x'.repeat(501))).toBe(false);
    const corps = page.slice(page.indexOf('async function annuler'));
    expect(corps).toContain('/annuler`');
    expect(page).toContain('Annuler la revue de la dépréciation');
  });

  it('la dépréciation se saisit en montant, jamais en taux · l’écran envoie le montant déclaré', () => {
    const corps = page.slice(page.indexOf('async function envoyer'));
    expect(corps).toContain('depreciationNecessaire: necessaire');
  });

  it('9 · les boutons suivent les droits du serveur · revue, perte et annulations à peutValider, le reste à peutEcrire', () => {
    expect(page).toContain('useGardeFermeture(');
    expect(page).not.toMatch(/toFixed\(/);
    // Chaque ouverture est lue dans le bloc conditionnel qui la porte.
    const garde = (appel: string) => {
      const i = page.indexOf(appel);
      expect(i).toBeGreaterThan(-1);
      // La condition JSX qui précède l'appel · `{… && (`, jusqu'au bouton.
      const condition = page.lastIndexOf('&& (', i);
      return page.slice(page.lastIndexOf('{', condition), condition);
    };
    expect(garde("ouvrir('revue', c)")).toContain('peutValider && ouvert');
    expect(garde("ouvrir('perte', c)")).toContain('peutValider && ouvert');
    expect(garde("ouvrir('recouvrement', c)")).not.toContain('peutValider');
    expect(garde("ouvrir('reclasser', null)")).not.toContain('peutValider');
    expect(page).toMatch(/\{peutEcrire && \(\s*<button[^]*?ouvrir\('reclasser', null\)/);
    expect(page).toMatch(/\{peutValider && annulation && \(/);
    expect(page).toMatch(/\{peutEcrire && form && \(/);
  });

  it('10 · les deux « Retirer » ne s’offrent que dans un exercice ouvert', () => {
    for (const libelle of ['Retirer le dernier mouvement', '>\n                                Retirer\n']) {
      const i = page.indexOf(libelle);
      expect(i).toBeGreaterThan(-1);
      expect(page.slice(page.lastIndexOf('ouvert &&', i), i)).toMatch(/^ouvert && c\./);
    }
  });

  it('A7 ter, m6 et m7 · le retrait d’une créance suit le verdict SERVI ; le retrait d’un mouvement est au comptable', () => {
    const creance = page.indexOf('>\n                                Retirer\n');
    expect(page.slice(page.lastIndexOf('{', page.lastIndexOf('&& (', creance)), creance)).toContain('{ouvert && c.retirable && (');
    const mouvement = page.indexOf('Retirer le dernier mouvement');
    expect(page.slice(page.lastIndexOf('{', page.lastIndexOf('&& (', mouvement)), mouvement)).toContain('{peutValider && ouvert && c.mouvements.length > 0 && (');
    // Plus aucune règle de retrait recalculée à l'écran.
    expect(page).not.toContain('c.revuesAnnulees.length === 0 && c.mouvements.length === 0');
  });

  it('1, 6 · modales en dialogue, Échap par la couche, envoi unique et fermeture tenue pendant l’envoi', () => {
    expect(page.match(/role="dialog"/g)).toHaveLength(2);
    expect(page.match(/aria-modal="true"/g)).toHaveLength(2);
    expect(page.match(/aria-label="Fermer"/g)).toHaveLength(2);
    expect(page).toContain('return ecouterEchap(() => {');
    expect(page).toContain('premierChamp(refFormulaire.current)?.focus({ preventScroll: true })');
    const envoyer = page.slice(page.indexOf('async function envoyer'), page.indexOf('async function annuler'));
    expect(envoyer).toMatch(/ev\.preventDefault\(\);\s*if \(!form \|\| envoi\) return;/);
    const annuler = page.slice(page.indexOf('async function annuler'), page.indexOf('async function retirer'));
    expect(annuler).toMatch(/ev\.preventDefault\(\);\s*if \(!annulation \|\| envoi\) return;/);
    const fermer = page.slice(page.indexOf('function fermerFormulaire'), page.indexOf('function fermerAnnulation'));
    expect(fermer).toContain('if (envoi) return;');
  });

  it('2, 14 · libellés reliés à leurs champs, pièces nommées, en-têtes de colonne', () => {
    const libelles = page.match(/<label\b[^>]*>/g) ?? [];
    expect(libelles.length).toBeGreaterThan(10);
    for (const l of libelles) expect(l).toMatch(/htmlFor=/);
    expect(page).toContain('aria-label={`Nature de la pièce ${i + 1}`}');
    expect(page).toContain('aria-label={`Date de la pièce ${i + 1}`}');
    const entetes = page.match(/<th\b[^>]*>/g) ?? [];
    expect(entetes.length).toBeGreaterThan(0);
    for (const t of entetes) expect(t).toContain('scope="col"');
    expect(page.match(/>Créance :</g) ?? []).toHaveLength(1);
  });

  it('3, 4, 5, 7 · motifs au clavier, liste vidée au changement d’exercice, réponses périmées jetées, journaux illisibles dits', () => {
    expect(page).toContain('aria-expanded={deplie}');
    expect(page).not.toMatch(/title=\{c\.motif\}/);
    const effet = page.slice(page.indexOf('useEffect(() => {\n    setListe(null);'));
    expect(effet).toMatch(/^useEffect\(\(\) => \{\n\s*setListe\(null\);\n\s*setErreur\(null\);\n\s*if \(!exerciceId\) return;\n\s*let perimee = false;/);
    expect(page).toContain('Aucun exercice choisi');
    expect(page).toContain('if (jeton.current === j && jetonComptes.current === k) setComptes(c);');
    expect(page).toContain('if (courant()) setProposition(p);');
    expect(page).toContain("if (courant()) setComptes651(l.filter((c) => c.numero.startsWith('651')));");
    expect(page).toContain('Lecture des journaux impossible · {erreurJournaux}');
  });
});

describe('créances douteuses · E1 à l’écran', () => {
  it('la bulle d’aide de la revue dit que la base est le TTC inscrit au 416', () => {
    expect(page).toContain('Base de la dépréciation · le montant TTC inscrit au 416');
  });
});

describe('créances douteuses · seconde relecture à l’écran (K4, M-c)', () => {
  it('K4 · un mouvement s’annule dans sa modale, motif exigé · le plus récent est proposé', () => {
    expect(mouvementAAnnulerParDefaut([])).toBeNull();
    expect(mouvementAAnnulerParDefaut([{ id: 'b', date: '2026-12-20' }, { id: 'a', date: '2026-12-10' }])).toBe('b');
    const corps = page.slice(page.indexOf('async function annuler'));
    expect(corps).toContain('/mouvements/${annulation.mouvementId}/annuler`');
    expect(page).toContain('Annuler une perte ou un recouvrement');
  });

  it('M-c · le mouvement sans revue se dit', () => {
    expect(page).toContain('mouvement(s) sans revue');
  });
});

describe('créances douteuses · A7 scindée à l’écran', () => {
  it('la perte s’envoie sans aucun champ de TVA, au TTC entier, et la bulle dit la récupération par imputation avec ses articles', () => {
    const corps = page.slice(page.indexOf('async function envoyer'), page.indexOf('async function annuler'));
    expect(corps).toContain('comptePerteId: form.comptePerteId || undefined,');
    expect(page).toContain('Perte au TTC entier · D 651 / C 416');
    expect(page).toContain('source="O.-L. n° 10/001, art. 52 ; décret n° 011/42, art. 126 et 127"');
    expect(page).toContain('Pour l\'instant, le cabinet la déclare lui-même.');
  });

  it('le reclassement dit, dans sa bulle, de ne pas lettrer la facture avec lui', () => {
    expect(page).toContain('Ne lettrez pas la facture avec le reclassement');
    expect(page).toContain('Ne lettrez pas la facture avec la pièce du reclassement');
  });
});

describe('créances douteuses · cinquième relecture à l’écran (m2, m3, m5)', () => {
  it('m5 · le 491 se propose sous la racine de la nature, présélectionné s’il est seul', () => {
    const comptes = [
      { id: 'a', numero: '49110000' },
      { id: 'b', numero: '49120000' },
      { id: 'c', numero: '49121000' },
    ];
    expect(racine491('LITIGIEUSE')).toBe('4911');
    expect(compte491Initial('LITIGIEUSE', comptes)).toBe('a');
    expect(comptes491DeLaNature('DOUTEUSE', comptes).map((c) => c.id)).toEqual(['b', 'c']);
    expect(compte491Initial('DOUTEUSE', comptes)).toBe('');
    expect(page).toContain('compte491Id: form.compte491Id || undefined,');
  });

  it('m2 et m3 · le reclassement s’annule dans sa modale ; la liste tronquée dit lesquelles manquent', () => {
    const corps = page.slice(page.indexOf('async function annuler'));
    expect(corps).toContain('`/creances-douteuses/${annulation.creance.id}/annuler`');
    expect(page).toContain('Annuler le reclassement');
    expect(page).toContain('les plus anciennes ne sont pas montrées');
  });
});

describe('A7 ter · le rapprochement et le lettrage de la créance éteinte, dits à l’écran', () => {
  const r = { provisoire: false, solde416: 1_160_000, resteModule: 1_160_000, solde491: 550_000, depreciationModule: 400_000 };

  it('m8 · l’écart du 491 se décompose · la part hors module, et le reste', () => {
    expect(ecartsRapprochement({ ...r, horsModule491: 150_000 })).toEqual({ ecart416: 0, ecart491: 150_000, horsModule491: 150_000, reste491: 0 });
    expect(ecartsRapprochement({ ...r, horsModule491: 100_000 })).toMatchObject({ horsModule491: 100_000, reste491: 50_000 });
    // Sans la part servie, tout l'écart reste à expliquer, jamais zéro.
    expect(ecartsRapprochement(r)).toMatchObject({ ecart491: 150_000, horsModule491: 0, reste491: 150_000 });
  });

  it('B1 · les soldes provisoires disent pourquoi · à-nouveau absent, ou report provisoire', () => {
    expect(libelleSoldesProvisoires(r)).toBeNull();
    expect(libelleSoldesProvisoires({ ...r, provisoire: true })).toMatch(/à-nouveau non passé/);
    expect(libelleSoldesProvisoires({ ...r, provisoire: true, reportProvisoire: true })).toMatch(/report à-nouveau provisoire, à relancer/);
  });

  it('B2 · l’issue du lettrage du 416 se dit, posée ou non, et l’écran l’affiche après le geste', () => {
    expect(messageLettrage416(null)).toBeNull();
    expect(messageLettrage416({ pose: true, code: 'C' })).toBe('Créance éteinte · ses lignes du 416 sont lettrées (C).');
    expect(messageLettrage416({ pose: false, motif: 'Créance éteinte · deux exercices.' })).toBe('Créance éteinte · deux exercices.');
    const envoyer = page.slice(page.indexOf('async function envoyer'), page.indexOf('async function annuler'));
    expect(envoyer.match(/setInfo\(messageLettrage416\(r\?\.lettrage416\)\)/g)).toHaveLength(2);
    expect(envoyer).toContain('setInfo(r?.avertissement ?? null)');
  });
});
