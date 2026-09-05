import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LE DOSSIER DE SUBVENTION DOIT ATTEINDRE UN ÉCRAN.
 *
 * SYCEBNL, cadre conceptuel § 5.4.2.4 : le caractère de l'engagement commande
 * le TRAITEMENT · créance à recevoir d'un côté, mention de Notes annexes de
 * l'autre. C'est cette information, et elle seule, qui empêche le comptable de
 * se tromper de côté · un écran qui montrerait le montant sans le traitement
 * laisserait l'erreur entière.
 */

const page = readFileSync(join(__dirname, 'ConventionsFinancementPage.tsx'), 'utf8');
const fenetres = readFileSync(join(__dirname, '../lib/registre-fenetres.tsx'), 'utf8');
const shell = readFileSync(join(__dirname, '../components/chrome/AppShell.tsx'), 'utf8');

describe("l'écran du dossier de subvention", () => {
  it('affiche le TRAITEMENT que le texte autorise, pour chaque convention', () => {
    expect(page).toContain('CREANCE_A_RECEVOIR');
    expect(page).toContain('Créance à recevoir');
    expect(page).toContain('Mention en Notes annexes');
  });

  it("exige les conditions dès que l'engagement est déclaré conditionnel", () => {
    // Le champ n'apparaît QUE dans ce cas, et il est requis · « conditionnel »
    // sans ses conditions ne se mentionne pas en Notes annexes.
    const i = page.indexOf("caractere === 'CONDITIONNEL' && (");
    expect(i).toBeGreaterThan(0);
    expect(page.slice(i, i + 700)).toContain('required');
  });

  it("exige le signataire dès que l'écrit signé est coché", () => {
    // Le texte parle des « représentants HABILITÉS » du financeur.
    const i = page.indexOf('{ecritSigne && (');
    expect(i).toBeGreaterThan(0);
    expect(page.slice(i, i + 700)).toContain('required');
  });

  it('rend les mentions de Notes annexes, et non seulement les montants', () => {
    // Le § 5.4.2.4 dit « DOIT faire l'objet d'une mention » · une promesse
    // conditionnelle que rien ne mentionne disparaît des états.
    expect(page).toContain('/conventions-financement/mentions-notes-annexes');
    expect(page).toContain('MENTIONS À PORTER EN NOTES ANNEXES');
  });

  it('signale une convention expirée et une échéance en retard', () => {
    // Ce que le jalon 11 du planning de clôture demandait sans donnée.
    expect(page).toContain('EXPIRÉE');
    expect(page).toContain('EN RETARD');
  });

  it('demande son motif à la résiliation, pas à la clôture normale', () => {
    const i = page.indexOf("if (statut === 'RESILIEE')");
    expect(i).toBeGreaterThan(0);
    expect(page.slice(i, i + 300)).toContain('Motif de résiliation');
  });

  it('dit qu’il ne qualifie pas et ne passe aucune écriture', () => {
    // Porter d'office une créance à recevoir serait le logiciel qui tranche à
    // la place du cabinet.
    expect(page).toMatch(/ne passe aucune écriture/);
  });

  it('cite sa source', () => {
    expect(page).toContain('§ 5.4.2.4');
  });

  it("ne déborde pas horizontalement · sa grille large a son défilement", () => {
    const i = page.indexOf('min-w-[1120px]');
    expect(i).toBeGreaterThan(0);
    expect(page.slice(Math.max(0, i - 200), i)).toContain('overflow-x-auto');
  });
});

describe('le cloisonnement, aux deux bouts', () => {
  it('la fenêtre est réservée au SYCEBNL', () => {
    const i = fenetres.indexOf("motif: /^\\/conventions-financement$/");
    expect(i).toBeGreaterThan(0);
    expect(fenetres.slice(i, i + 420)).toContain("referentielsApplicables: ['SYCEBNL']");
  });

  it("l'entrée de menu suit celle du bailleur, masquée hors SYCEBNL", () => {
    const i = shell.indexOf("navigate('/conventions-financement')");
    expect(i).toBeGreaterThan(0);
    expect(shell.slice(Math.max(0, i - 600), i)).toContain('estSycebnl');
  });
});
