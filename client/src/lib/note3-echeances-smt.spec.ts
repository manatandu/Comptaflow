import { lacuneEcheancesNote3 } from './note3-echeances-smt';
import type { NotesSmt } from './types';

// Pas d'import de « vitest » · convention du dépôt (voir calcul.spec.ts) :
// describe/it/expect arrivent par les globales, ce qui rend le fichier
// exécutable par les DEUX lanceurs.

/**
 * CE QUI CASSERAIT EN SILENCE SANS CES TESTS.
 *
 * La maquette officielle intitule la Note 3 du S.M.T « ETAT DES CREANCES ET
 * DES DETTES NON ECHUES » (SYCEBNL, Partie 4, ch. 4, section 3). Le serveur
 * ventile chaque solde en part non échue, part échue et RESTE non daté. Si
 * l'écran additionne ce reste avec les autres, ou l'affiche en valeur absolue,
 * ou le tait quand il est nul d'un côté seulement, rien ne lève d'erreur :
 * la note reste équilibrée au centime et continue d'affirmer, sous son titre,
 * une qualité d'échéance que personne n'a saisie.
 *
 * Aucune règle comptable n'est réécrite ici : les tests figent le TRI et la
 * FORME, la ventilation elle-même appartient au serveur.
 */

/** Note 3 dont toutes les échéances sont datées · l'état d'un dossier bien tenu. */
const NOTE3_TENUE: NotesSmt['note3'] = {
  creances: [],
  totalCreances: 1000,
  totalCreancesNonEchues: 700,
  totalCreancesEchues: 300,
  totalCreancesNonVentilees: 0,
  dettes: [],
  totalDettes: 400,
  totalDettesNonEchues: 400,
  totalDettesEchues: 0,
  totalDettesNonVentilees: 0,
  echeancesTenues: true,
  motifEcheances: null,
};

const note3 = (partiel: Partial<NotesSmt['note3']>): NotesSmt['note3'] => ({
  ...NOTE3_TENUE,
  echeancesTenues: false,
  motifEcheances: 'motif servi par le serveur',
  ...partiel,
});

describe('lacuneEcheancesNote3', () => {
  it('ne dit RIEN quand toutes les échéances sont datées', () => {
    // Un dossier bien tenu ne doit pas voir apparaître un bandeau de plus.
    expect(lacuneEcheancesNote3(NOTE3_TENUE)).toBeNull();
  });

  it('suit le verdict du SERVEUR, seul à avoir vu ligne à ligne', () => {
    // Deux lacunes de signes contraires ne doivent pas s'annuler : le total
    // des deux côtés peut être nul alors que la ventilation est trouée.
    const rendu = lacuneEcheancesNote3(note3({ totalCreancesNonVentilees: 500, totalDettesNonVentilees: -500 }));
    expect(rendu).not.toBeNull();
    expect(rendu!.creances).toBe(500);
    expect(rendu!.dettes).toBe(-500);
  });

  it('rend les deux parts TELLES QUELLES · aucune somme, aucune valeur absolue', () => {
    const rendu = lacuneEcheancesNote3(note3({ totalCreancesNonVentilees: 12_500.75, totalDettesNonVentilees: 300 }))!;
    expect(rendu.creances).toBe(12_500.75);
    expect(rendu.dettes).toBe(300);
  });

  it('rappelle le titre de la note et dit que le manque n’est pas un montant', () => {
    const rendu = lacuneEcheancesNote3(note3({ totalCreancesNonVentilees: 900 }))!;
    expect(rendu.phrase).toContain('NON ÉCHUES');
    expect(rendu.phrase).toContain('ni échus ni non échus');
    // Les montants restent au bilan · la lacune porte sur le TERME, pas sur
    // la somme, et l'écran ne doit pas laisser croire à un montant perdu.
    expect(rendu.phrase).toContain('restent');
    expect(rendu.phrase).toContain('leur terme');
  });

  it('demande le geste qui ferme la lacune, mode de report compris', () => {
    // Un compte de tiers reporté en mode SOLDE arrive en une ligne agrégée qui
    // ne peut porter aucune échéance · saisir les dates ne suffirait pas.
    const rendu = lacuneEcheancesNote3(note3({ totalCreancesNonVentilees: 900 }))!;
    expect(rendu.geste).toContain('date d’échéance');
    expect(rendu.geste).toContain('DÉTAIL');
  });

  it('ne parle de lettrage QUE si une part non datée est négative', () => {
    expect(lacuneEcheancesNote3(note3({ totalCreancesNonVentilees: 900, totalDettesNonVentilees: 100 }))!.resteNegatif).toBeNull();
  });

  it('signale le lettrage quand la part des CRÉANCES est négative', () => {
    const rendu = lacuneEcheancesNote3(note3({ totalCreancesNonVentilees: -900, totalDettesNonVentilees: 0 }))!;
    expect(rendu.resteNegatif).toContain('non lettré');
  });

  it('signale le lettrage quand la part des DETTES est négative, créances saines', () => {
    // Le test qui attrape un « et » mis à la place d'un « ou » : une seule des
    // deux parts suffit à rendre le règlement non lettré visible.
    const rendu = lacuneEcheancesNote3(note3({ totalCreancesNonVentilees: 0, totalDettesNonVentilees: -50 }))!;
    expect(rendu.resteNegatif).toContain('non lettré');
  });

  it('se tait sur la foi du serveur, même quand les totaux ne sont pas exactement nuls', () => {
    // Le serveur dit les échéances tenues · l'écran n'a pas à rouvrir le
    // dossier parce qu'il reste des poussières dans les totaux. Poser ici une
    // seconde règle pour la même question, c'est comme cela qu'un écran finit
    // par dire autre chose que le classeur exporté.
    expect(
      lacuneEcheancesNote3({ ...NOTE3_TENUE, totalCreancesNonVentilees: 0.001, totalDettesNonVentilees: -0.001 }),
    ).toBeNull();
  });
});
