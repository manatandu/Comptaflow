import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AUDIT FINAL · la fenêtre Facturation. Chaque test découpe le bloc qui porte
 * la propriété, jamais une distance fixe.
 */
const page = readFileSync(join(__dirname, 'FacturationPage.tsx'), 'utf8');

function bloc(debut: string, fin: string): string {
  const i = page.indexOf(debut);
  expect(i).toBeGreaterThan(0);
  return page.slice(i, page.indexOf(fin, i));
}

describe('F114 · la pièce imprimée lit le TTC du serveur, autres taxes comprises', () => {
  it('le total imprimé après les autres impôts et taxes est celui du serveur', () => {
    const pied = bloc('Autres impôts et taxes</td>', '</tbody>');
    expect(pied).toContain('<td className="pr-4">Montant TTC</td><td className="text-right">{montantImprime(f.totaux.montantTTC)}</td>');
  });
});

describe('F117 · les factures barrées se lisent à part sur l’état détaillé', () => {
  it('l’écran montre chaque facture barrée, avec ce qu’elle devient dans les totaux', () => {
    const cadre = bloc('Factures barrées par une note de crédit', '</ul>');
    expect(cadre).toContain("{a.ecarteeDesTotaux ? 'hors des totaux' : 'comprise dans les totaux'}");
    expect(cadre).toContain('{a.motif}');
  });
});

describe('F119 · une note de crédit ne se propose pas à la suppression', () => {
  it('le bouton Supprimer exige une FACTURE ni passée ni barrée', () => {
    const garde = bloc('crédit, qui débarrerait la facture', 'onClick={() => void supprimer(');
    expect(garde).toContain("{peutEcrire && !f.ecritureId && !f.barree && f.nature === 'FACTURE' && (");
  });
});

describe('F229 · la colonne des mentions ne nomme plus l’art. 100', () => {
  it('l’en-tête de la liste s’intitule « Mentions obligatoires »', () => {
    // La liste appliquée dépend de la date de la pièce (décret n° 23/10,
    // art. 26, ou décret n° 011/42, art. 100 avant le 3 mars 2023) · la ligne
    // « Texte appliqué » dit laquelle, l'en-tête ne la tranche pas.
    const entete = bloc('<th className="py-1 pr-2">Sens</th>', '</tr>');
    expect(entete).toContain('<th className="py-1">Mentions obligatoires</th>');
  });

  it('la distinction imposable renvoie à l’art. 26 e), et à l’art. 100 pour les pièces anciennes', () => {
    const aide = bloc('titre="Ligne imposable"', '/>');
    expect(aide).toContain('source="Décret n° 23/10 du 3 mars 2023, art. 26 e) · décret n° 011/42, art. 100"');
  });
});

describe('F228 · la mention de l’art. 60 se saisit aussi sur une facture reçue', () => {
  it('le formulaire envoie la mention quel que soit le sens', () => {
    const envoi = bloc("await api.post('/facturation', {", "setNumeroSerie('');");
    expect(envoi).toContain('        mentionTvaDebits: mentionDebitsCochee,\n');
  });

  it('sur un achat, la case dit ce qu’elle lit et suit la même valeur', () => {
    const cases = bloc("{sens === 'VENTE' ? (", 'Ligne imposable');
    const [vente, achat] = cases.split(') : (');
    expect([
      vente.includes('checked={mentionDebitsCochee}'),
      achat.includes('checked={mentionDebitsCochee}'),
      achat.includes('La pièce porte « Autorisation d’acquitter la TVA d’après les débits »'),
    ]).toEqual([true, true, true]);
  });

  it('une facture reçue qui porte la mention le montre sur sa ligne', () => {
    const cellule = bloc('Hors de portée sans dispositif électronique fiscal', 'Texte appliqué');
    expect(cellule).toContain("{f.sens === 'ACHAT' && f.mentionTvaDebits && (");
  });
});

describe('facturation · portée du verdict des mentions (passe F14, constat A1)', () => {
  it('le verdict « tous servis » porte sa réserve du Code des accises en bulle Aide, avec les deux articles', () => {
    const source = readFileSync(join(__dirname, 'FacturationPage.tsx'), 'utf8');
    const verdict = source.indexOf('Tous les groupes exigibles sont servis.');
    const aide = source.indexOf('texte={RESERVE_ACCISES_VERDICT}', verdict);
    expect(verdict).toBeGreaterThan(-1);
    // L'Aide suit le verdict dans le même élément · jamais un paragraphe à l'écran.
    expect(aide).toBeGreaterThan(verdict);
    expect(source.indexOf('</td>', verdict)).toBeGreaterThan(aide);
    expect(source).toContain("droits d'accises et le droit d'accises spécial");
    expect(source).toContain('Code des accises, art. 19, 3 et art. 20, 4');
  });
});
