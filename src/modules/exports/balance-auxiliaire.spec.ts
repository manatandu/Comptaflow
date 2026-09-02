import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LA BALANCE ÂGÉE N'EST PAS LA BALANCE AUXILIAIRE.
 *
 * Le logiciel produisait la première et se croyait couvert sur la seconde.
 * Elles répondent à deux questions différentes : l'âgée ventile un solde par
 * tranche de retard (risque de non-recouvrement), l'auxiliaire porte les
 * MOUVEMENTS de la période tiers par tiers et le solde qui en résulte (base
 * de circularisation et rapprochement avec la balance générale). Tout dossier
 * de révision réel porte les deux.
 *
 * Ce spec lit le source plutôt que le classeur produit : ce qu'il verrouille
 * est la présentation relevée sur les balances auxiliaires du dossier ouvert
 * sur le Drive, et le fait qu'un compte de tiers orphelin ne disparaisse pas.
 */

const service = readFileSync(join(__dirname, 'export.service.ts'), 'utf8');
const ecriture = readFileSync(
  join(__dirname, '..', 'comptabilite', 'ecriture.service.ts'),
  'utf8',
);

describe('balance auxiliaire · l’état qui manquait', () => {
  it('existe, et ne se confond pas avec la balance âgée', () => {
    expect(ecriture).toContain('async balanceAuxiliaire(');
    expect(ecriture).toContain('async balanceAgee(');
    expect(service).toContain('async balanceAuxiliaireExcel(');
  });

  it('n’écarte pas un compte de tiers sans tiers rattaché', () => {
    // C'est la ligne la plus utile de l'état : un 411 mouvementé que personne
    // ne réclame échappera à la circularisation. Le filtrer pour « faire
    // propre » supprimerait précisément l'anomalie que l'état doit révéler.
    expect(ecriture).toContain('sansTiers: !tiers');
    expect(ecriture).not.toContain('.filter((l) => parCompte.has(l.compteId))');
    expect(service).toContain('aucun tiers rattaché');
  });

  it('porte les deux colonnes de solde qui s’excluent, plus le solde signé', () => {
    expect(ecriture).toContain('soldeDebit: solde > 0 ? solde : 0');
    expect(ecriture).toContain('soldeCredit: solde < 0 ? -solde : 0');
    expect(service).toContain("{ header: 'SOLDE', key: 'solde'");
  });

  it('reprend la présentation relevée · horodatage en ligne 1, en-têtes en ligne 2', () => {
    // Le figeage et l'autofiltre doivent porter sur la ligne 2, pas la 1 :
    // sinon le filtre couvre l'horodatage et le tri emporte les en-têtes.
    expect(service).toContain('this.finaliserTableau(feuille, colonnes.length, derniereLigneDonnees, 2)');
    expect(service).toContain('feuille.getRow(2).values = colonnes.map((c) => c.header);');
  });

  it('suffixe chaque libellé de montant du code devise du dossier', () => {
    for (const entete of [
      'Solde débit avant période ${dev}',
      'Solde crédit avant période ${dev}',
      'Débit Période ${dev}',
      'Crédit Période ${dev}',
      'Solde Debit ${dev}',
      'Solde Credit ${dev}',
    ]) {
      expect(service).toContain(entete);
    }
  });

  it('nomme le 41 selon le référentiel du dossier', () => {
    // AUDCIF compte 41 « Clients » ; SYCEBNL 411 « Adhérents », 412
    // « Clients-usagers ». Servir « Clients » à une ASBL est une faute de
    // référentiel, pas une nuance de vocabulaire.
    expect(service).toContain("'Adhérents et clients-usagers' : 'Clients'");
    expect(service).toContain('Referentiel.SYCEBNL');
  });

  it('se termine sur une ligne SOLDE hors de l’autofiltre', () => {
    // Les totaux triés avec les tiers, c'est un état faux au premier clic.
    expect(service).toContain("numero: 'SOLDE',");
    expect(service).toContain('const derniereLigneDonnees = feuille.rowCount;');
  });
});
