/**
 * LE CHOIX DE L'EXERCICE · les tests qui auraient attrapé le basculement
 * silencieux.
 *
 * `ExerciceProvider` prenait `exercices.find((e) => e.statut === 'OUVERT')` sur
 * une liste triée par date de début DÉCROISSANTE, c'est-à-dire le plus récent
 * des ouverts, sans rien dire. Le défaut se déclenche dans la situation la plus
 * ordinaire qui soit : le 1er janvier, un cabinet ouvre l'exercice suivant sans
 * avoir clôturé le précédent · l'arrêté des comptes se fait dans les quatre
 * mois (AUDCIF art. 23). Les trente-quatre écrans qui lisent le contexte
 * basculent alors sur le nouvel exercice, et le comptable qui saisit décembre
 * ne retrouve plus ses écritures à la balance.
 *
 * La règle de résolution est testée ici SANS React · c'est une fonction pure du
 * couple (liste, choix), et la sortir du composant est ce qui la rend
 * vérifiable. Le composant doit appeler celle-ci et rien d'autre.
 */
import { resoudreExercice } from './exercice-choix';

const ex = (id: string, debut: string, statut: 'OUVERT' | 'CLOTURE' = 'OUVERT') => ({
  id,
  tenantId: 't1',
  dateDebut: debut,
  dateFin: `${debut.slice(0, 4)}-12-31`,
  statut,
  // Le cartouche des états publiés porte cette date (AUDCIF Titre IX ch. 1
  // § 2.4) · elle n'entre pour rien dans le choix de l'exercice, mais le type
  // l'exige, et un objet partiel forcé par un cast masquerait le jour où un
  // champ VRAIMENT lu par la règle viendrait à manquer.
  dateArreteComptes: null,
});

describe('Résolution de l’exercice courant', () => {
  it('retient sans discussion le SEUL exercice ouvert', () => {
    const r = resoudreExercice([ex('b', '2027-01-01', 'CLOTURE'), ex('a', '2026-01-01')], null);
    expect(r.exerciceCourant?.id).toBe('a');
    expect(r.choixImplicite).toBe(false);
  });

  it('DÉCLARE le choix quand DEUX exercices sont ouverts et qu’aucun n’a été choisi', () => {
    // Le cas de janvier : 2027 ouvert, 2026 pas encore clôturé.
    const r = resoudreExercice([ex('b', '2027-01-01'), ex('a', '2026-01-01')], null);
    expect(r.exerciceCourant?.id).toBe('b');
    // C'EST TOUT LE CORRECTIF · l'exercice affiché n'a été décidé par personne,
    // et le contexte le dit pour que la barre de statut le signale.
    expect(r.choixImplicite).toBe(true);
  });

  it('le choix de l’utilisateur prime, et éteint l’avertissement', () => {
    const r = resoudreExercice([ex('b', '2027-01-01'), ex('a', '2026-01-01')], 'a');
    expect(r.exerciceCourant?.id).toBe('a');
    expect(r.choixImplicite).toBe(false);
  });

  it('un choix mémorisé qui ne correspond à RIEN ne fige pas le logiciel sur du vide', () => {
    // Exercice supprimé, dossier restauré, ou mémoire d'un autre dossier.
    const r = resoudreExercice([ex('a', '2026-01-01')], 'disparu');
    expect(r.exerciceCourant?.id).toBe('a');
  });

  it('sans aucun exercice ouvert, le plus récent sert de fenêtre · et ce n’est PAS un choix implicite', () => {
    const r = resoudreExercice(
      [ex('b', '2027-01-01', 'CLOTURE'), ex('a', '2026-01-01', 'CLOTURE')],
      null,
    );
    expect(r.exerciceCourant?.id).toBe('b');
    // Il n'y avait pas d'alternative · avertir ici ferait crier le bandeau sur
    // tout dossier dont les exercices sont clôturés, c'est-à-dire sur les
    // dossiers les plus sains.
    expect(r.choixImplicite).toBe(false);
  });

  it('un dossier sans aucun exercice ne casse pas', () => {
    expect(resoudreExercice([], null).exerciceCourant).toBeNull();
  });
});
