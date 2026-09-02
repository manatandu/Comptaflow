import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LES TRANCHES GLISSANTES DE TRENTE JOURS NE SONT PAS UNE BALANCE ÂGÉE.
 *
 * L'état ventilait « 1 à 30 j / 31 à 60 j / 61 à 90 j / + 90 » depuis une date
 * de référence. Personne ne travaille comme ça : pour retrouver la facture
 * derrière un montant, il faut refaire les dates de tête. Les dossiers de
 * révision réels titrent par PÉRIODE CALENDAIRE et rappellent l'âge au-dessus.
 *
 * Deux autres défauts, tout aussi silencieux, étaient dans le même état :
 * la ligne était un COMPTE (un tiers portant deux comptes rattachés voyait son
 * exposition coupée en deux), et les soldes de sens contraire étaient ventilés
 * comme les autres (un client créditeur n'a pas d'antériorité de créance, et
 * il polluait chaque colonne).
 *
 * Ce spec lit le source : il verrouille le modèle, pas un jeu de données.
 */

const service = readFileSync(join(__dirname, 'ecriture.service.ts'), 'utf8');
const page = readFileSync(
  join(__dirname, '..', '..', '..', 'client', 'src', 'pages', 'BalanceAgeePage.tsx'),
  'utf8',
);

describe('balance âgée · le modèle du dossier de révision', () => {
  it('ne ventile plus par tranches glissantes de trente jours', () => {
    for (const ancien of ['nonEchu', 'j1a30', 'j31a60', 'j61a90', 'plus90']) {
      expect(service).not.toContain(`${ancien}:`);
      expect(page).not.toContain(ancien);
    }
  });

  it('titre chaque tranche DEUX fois · période calendaire et âge', () => {
    expect(service).toContain('libellePeriode');
    expect(service).toContain('libelleAge');
    expect(service).toContain('Moins de ${age} jours');
    expect(service).toContain('Du ${jour(debut)} au ${jour(dernierJour)}');
    // Les deux en-têtes sont rendus à l'écran, pas seulement calculés.
    expect(page).toContain('t.libelleAge');
    expect(page).toContain('t.libellePeriode');
  });

  it('groupe par TIERS, et retombe sur le compte à défaut', () => {
    // « 410038 - CREC 8 » · code du tiers puis son nom, comme dans le modèle.
    expect(service).toContain('`${tiers.code} - ${tiers.nom}`');
    expect(service).toContain('`${l.compte.numero} - ${l.compte.intitule}`');
    expect(service).toContain("`tiers:${tiers.id}`");
  });

  it('ne ventile pas les soldes de sens contraire', () => {
    // Les vider est délibéré : rendus, ils seraient additionnés par colonne.
    expect(service).toContain("montants: [] as number[]");
    expect(service).toContain('const crediteurs = toutes');
    expect(page).toContain('non ventilés par antériorité');
  });

  it('rend les trois totaux, dont le net qui recoupe la balance auxiliaire', () => {
    expect(service).toContain('debiteurs: totalDebiteurs');
    expect(service).toContain('crediteurs: totalCrediteurs');
    expect(service).toContain('net: arrondir(totalDebiteurs + totalCrediteurs)');
    expect(page).toContain('SOLDE NET');
  });

  it('n’invente pas un bloc « reste de l’exercice » quand il serait vide', () => {
    // Sur un exercice plus court que la fenêtre mensuelle, une colonne
    // « du début de l'exercice à la veille de la fenêtre » couvrirait une
    // période inexistante et afficherait toujours zéro.
    expect(service).toContain('if (exercice.dateDebut < debutFenetre)');
  });

  it('borne la date de référence à la fin de l’exercice', () => {
    // Au-delà, les colonnes mensuelles n'auraient plus d'écriture à recevoir.
    expect(service).toContain('demande > exercice.dateFin ? exercice.dateFin : demande');
  });

  it('n’aligne pas la grille de l’écran sur un nombre de colonnes figé', () => {
    // Le nombre de tranches varie avec la longueur de l'exercice · figer la
    // grille décalerait les montants sous les mauvais en-têtes, en silence.
    expect(page).toContain('repeat(${nbTranches + 1}, 116px)');
  });
});
