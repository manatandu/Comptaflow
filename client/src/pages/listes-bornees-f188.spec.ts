import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AUDIT FINAL F188 · la facturation, les devis et le registre des exonérations
 * demandent une période, et disent la tranche que le serveur rend. Chaque test
 * découpe le bloc qui porte la propriété, jamais une distance fixe.
 */
const lire = (f: string) => readFileSync(join(__dirname, f), 'utf8');

function bloc(page: string, debut: string, fin: string): string {
  const i = page.indexOf(debut);
  expect(i).toBeGreaterThan(0);
  const j = page.indexOf(fin, i + debut.length);
  expect(j).toBeGreaterThan(i);
  return page.slice(i, j);
}

describe('Facturation · la liste demande une période, et dit sa tranche', () => {
  const page = lire('FacturationPage.tsx');

  it('la lecture envoie la période, l’exercice du sélecteur par défaut', () => {
    const lecture = bloc(page, 'const recharger = () =>', 'useEffect(');
    expect(lecture).toContain('`/facturation${requetePeriode(periodeListe)}`');
    expect(page).toContain('periodeParDefaut(exerciceCourant, new Date())');
    expect(page).toContain('}, [chargementExercice, periodeListe.du, periodeListe.au]);');
  });

  it('la section des factures dit la période et la tranche', () => {
    const section = bloc(page, 'Factures enregistrées', 'etat.factures.length === 0 ?');
    expect(section).toContain('{libellePeriode(periodeListe, originePeriode)}');
    expect(section).toContain('>{libelleTranche(etat, etat.factures.length)}</p>');
    expect(section).toContain('{erreurListe && ');
  });

  it('seule la DERNIÈRE lecture demandée s’affiche, succès comme échec', () => {
    const lecture = bloc(page, 'const recharger = () =>', 'useEffect(');
    expect(lecture).toContain('const numero = ++lectureListe.current;');
    // Les deux issues de la lecture écartent une réponse dépassée.
    expect(lecture.split('if (numero !== lectureListe.current) return;')).toHaveLength(3);
  });

  it('une lecture refusée ne laisse pas les lignes d’avant sous la période demandée', () => {
    const section = bloc(page, 'Factures enregistrées', '{etat.factures.map((f) =>');
    expect(section).toContain('{!erreurListe && libelleTranche(etat, etat.factures.length) && (');
    expect(section).toContain('{erreurListe ? null : etat.factures.length === 0 ? (');
  });

  it('une note de crédit datée hors de la période se signale comme une pièce', () => {
    const emission = bloc(page, 'async function emettreNoteDeCredit(', 'async function produireEtatDetaille(');
    expect(emission).toContain('horsPeriode(noteDate, periodeListe)');
  });

  it('un échec de lecture se dit au lieu de laisser « Chargement… »', () => {
    const attente = bloc(page, 'if (!etat) {', 'return (');
    expect(attente).toContain('erreurListe ?');
  });
});

describe('Devis · la liste demande une période, et dit sa tranche', () => {
  const page = lire('DevisPage.tsx');

  it('la lecture envoie la période, l’exercice du sélecteur par défaut', () => {
    const lecture = bloc(page, 'const recharger = () =>', 'useEffect(');
    expect(lecture).toContain('`/commercial/devis${requetePeriode(periodeListe)}`');
    expect(page).toContain('periodeParDefaut(exerciceCourant, new Date())');
  });

  it('la section des devis dit la période et la tranche', () => {
    const section = bloc(page, 'Devis émis et reçus', 'etat.devis.length === 0 ?');
    expect(section).toContain('{libellePeriode(periodeListe, originePeriode)}');
    expect(section).toContain('>{libelleTranche(etat, etat.devis.length)}</p>');
  });

  it('seule la DERNIÈRE lecture demandée s’affiche, succès comme échec', () => {
    const lecture = bloc(page, 'const recharger = () =>', 'useEffect(');
    expect(lecture).toContain('const numero = ++lectureListe.current;');
    expect(lecture.split('if (numero !== lectureListe.current) return;')).toHaveLength(3);
  });

  it('une lecture refusée ne laisse pas les lignes d’avant sous la période demandée', () => {
    const section = bloc(page, 'Devis émis et reçus', '{etat.devis.map((d) =>');
    expect(section).toContain('{!erreurListe && libelleTranche(etat, etat.devis.length) && (');
    expect(section).toContain('{erreurListe ? null : etat.devis.length === 0 ? (');
  });
});

describe('Exonérations · le registre demande une période, et dit sa tranche', () => {
  const page = lire('ExonerationsPage.tsx');

  it('la lecture envoie la période, les douze derniers mois par défaut', () => {
    const lecture = bloc(page, 'const charger = () => {', 'useEffect(');
    expect(lecture).toContain('`/exonerations${requetePeriode(periodeListe)}`');
    expect(page).toContain('periodeParDefaut(null, new Date())');
  });

  it('la barre de période dit la période, la tranche et l’échec de lecture', () => {
    const barre = bloc(page, 'Ouverts du', '{/* --- Liste des dossiers');
    expect(barre).toContain('{libellePeriode(periodeListe, originePeriode)}');
    expect(barre).toContain('>{libelleTranche(registre, registre.dossiers.length)}</span>');
    expect(barre).toContain('{erreurListe && ');
  });

  it('le libellé imprimé dit que les titres en alerte sont listés hors de la période', () => {
    const barre = bloc(page, 'Ouverts du', '{/* --- Liste des dossiers');
    expect(barre).toContain("{(periodeListe.du || periodeListe.au) && ' · arrêtés en alerte compris'}");
  });

  it('seule la DERNIÈRE lecture demandée s’affiche, succès comme échec', () => {
    const lecture = bloc(page, 'const charger = () => {', 'useEffect(');
    expect(lecture).toContain('const numero = ++lectureListe.current;');
    expect(lecture.split('if (numero !== lectureListe.current) return;')).toHaveLength(3);
  });

  it('une lecture refusée ne laisse pas les dossiers d’avant sous la période demandée', () => {
    const liste = bloc(page, '{/* --- Liste des dossiers', '{/* --- Dossier sélectionné');
    expect(liste).toContain('{!erreurListe && registre?.dossiers.length === 0 && (');
    expect(liste).toContain('{!erreurListe && registre?.dossiers.map((d) => (');
  });
});
