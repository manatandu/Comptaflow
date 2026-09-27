import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parametrePaiementsEnInstance } from './paiements-en-instance';

describe('Repère H · la saisie suit l’état jusqu’au fichier (audit final F13)', () => {
  it('un champ vide n’envoie rien, un montant s’envoie tel quel, zéro compris', () => {
    expect([parametrePaiementsEnInstance(''), parametrePaiementsEnInstance(' 1500 '), parametrePaiementsEnInstance('0')]).toEqual([
      '',
      '&paiementsEnInstance=1500',
      '&paiementsEnInstance=0',
    ]);
  });

  it('l’écran, l’export du tableau et la liasse complète envoient tous trois la saisie', () => {
    const page = readFileSync(join(__dirname, '..', 'pages', 'EtatsFinanciersPage.tsx'), 'utf8');
    const liasse = page.slice(page.indexOf('const exporterLiasse'), page.indexOf('const exporter = async'));
    const unitaire = page.slice(page.indexOf('const exporter = async'), page.indexOf('api.telecharger(', page.indexOf('const exporter = async')) + 200);
    const etablir = page.slice(page.indexOf('/etats-financiers/projet/reconciliation-tresorerie?'), page.indexOf('.then(setReconciliation'));
    expect([liasse, unitaire, etablir].map((s) => s.includes('parametrePaiementsEnInstance(paiementsEnInstance)'))).toEqual([true, true, true]);
  });
});
