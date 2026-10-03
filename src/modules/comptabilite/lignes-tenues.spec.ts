import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { motifLignesTenues } from './lignes-tenues';

/**
 * Septième relecture, m2 · le refus nomme les ISSUES RÉELLES · le geste de
 * réouverture d'un rapprochement clos existe (administrateur, dernier clos du
 * compte) ; une clôture totale ou de période ne s'annule pas, on ne promet
 * donc pas de « rouvrir la période ». Les deux faits sont relus dans le code.
 */
describe('les issues d’une ligne lettrée ou pointée', () => {
  const libre = { lettre: null, lettrageId: null, rapprochementId: null };

  it('pointée · dépointer en cours, sinon la réouverture par l’administrateur, le dernier clos seulement', () => {
    const motif = motifLignesTenues([{ ...libre, rapprochementId: 'r' }], 'cette écriture', 'corriger');
    expect(motif).toMatch(/clos, seul l’administrateur le rouvre \(« Rouvrir le rapprochement », le dernier clos du compte seulement, motif exigé\)/);
  });

  it('lettrée · délettrer, et une ligne figée par une clôture définitive ne se délettre plus', () => {
    const motif = motifLignesTenues([{ ...libre, lettre: 'A', lettrageId: 'g' }], 'cette écriture', 'corriger');
    expect(motif).toMatch(/Délettrez-les d’abord\. Une ligne figée par une clôture totale, de période ou d’exercice ne se délettre plus/);
  });

  // Second tour d'A7 ter, B-1 · « l'erreur relève alors du report à nouveau »
  // était faux d'un exercice OUVERT, figé par une clôture de période seulement.
  it('B-1 · l’issue d’un lettrage figé distingue l’exercice clôturé de l’exercice encore ouvert', () => {
    const motif = motifLignesTenues([{ ...libre, lettre: 'A', lettrageId: 'g' }], 'cette écriture', 'corriger')!;
    expect(motif).toMatch(/Exercice clôturé · l’erreur relève du report à nouveau \(AUDCIF art\. 20, al\. 3\)/);
    expect(motif).toMatch(/Exercice encore ouvert · l’inscription en négatif reste due dans l’exercice \(art\. 20, al\. 2\), au premier jour non clôturé \(art\. 22, 4°\)/);
    expect(motif).not.toMatch(/l’erreur relève alors du report à nouveau/);
  });

  it('A7 ter, B2b · seul le groupe TOLÉRÉ est ignoré · toute autre ligne lettrée ou pointée refuse comme avant', () => {
    const module = { ...libre, lettre: 'A', lettrageId: 'g-A' };
    expect(motifLignesTenues([module, libre], 'cette écriture', 'annuler', '', 'g-A')).toBeNull();
    expect(motifLignesTenues([module, { ...libre, lettre: 'B', lettrageId: 'g-B' }], 'cette écriture', 'annuler', '', 'g-A')).toMatch(/1 ligne\(s\) .*lettrées \(B\)/);
    expect(motifLignesTenues([module, { ...libre, rapprochementId: 'r' }], 'cette écriture', 'annuler', '', 'g-A')).toMatch(/pointées/);
    expect(motifLignesTenues([module], 'cette écriture', 'annuler')).toMatch(/lettrées \(A\)/);
  });

  it('les gestes cités existent tels qu’ils sont décrits', () => {
    const rapprochement = readFileSync(join(__dirname, '../rapprochement/rapprochement.controller.ts'), 'utf8');
    expect(rapprochement).toContain("@Post(':id/rouvrir')");
    const service = readFileSync(join(__dirname, '../rapprochement/rapprochement.service.ts'), 'utf8');
    expect(service).toContain('Seul le dernier rapprochement clos du compte se rouvre');
    const exercice = readFileSync(join(__dirname, '../exercice/exercice.service.ts'), 'utf8');
    expect(exercice).toContain('Cette clôture est définitive et ne peut pas être annulée (Totale/Période)');
  });
});
