import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AUDIT FINAL · la fenêtre Devis. Chaque test découpe le bloc qui porte la
 * propriété, jamais une distance fixe.
 */
const page = readFileSync(join(__dirname, 'DevisPage.tsx'), 'utf8');

function bloc(debut: string, fin: string): string {
  const i = page.indexOf(debut);
  expect(i).toBeGreaterThan(0);
  return page.slice(i, page.indexOf(fin, i));
}

describe('F118 · une réponse tardive s’enregistre, et l’offre reste caduque', () => {
  it('les boutons de réponse s’ouvrent aussi sur une offre caduque sans réponse, pas la révocation', () => {
    const reponses = bloc('{peutEcrire && (d.etat.etat', 'Acceptation reçue');
    expect(reponses).toContain("(d.etat.etat === 'CADUC' && !d.natureReponse)");
    const revocation = bloc('d.revocabilite.revocable && (', 'Révoquer l’offre');
    expect(page.slice(page.lastIndexOf('{', page.indexOf(revocation)), page.indexOf(revocation))).toContain("d.etat.etat === 'EN_ATTENTE'");
  });

  it('l’étiquette ne dit pas « sans réponse » quand une réponse est parvenue', () => {
    const cellule = bloc('audit final F118) · « sans réponse » y serait faux.', '</td>');
    expect(cellule).toContain("d.etat.etat === 'CADUC' && d.natureReponse ? 'Caduc · réponse tardive'");
  });
});

describe('F124 · la contre-proposition a son geste', () => {
  it('un devis rejeté substantiellement, sans suite encore, propose de l’enregistrer', () => {
    const garde = bloc("d.etat.etat === 'CONTRE_PROPOSITION' &&", 'Enregistrer la contre-proposition');
    expect(garde).toContain('!etat.devis.some((x) => x.contrePropositionDeId === d.id)');
    expect(garde).toContain('onClick={() => preparerContreProposition(d)}');
  });

  it('l’émission rattache l’offre nouvelle à son origine', () => {
    const envoi = bloc('async function emettre()', 'lignes: [');
    expect(envoi).toContain('...(contrePropositionDe ? { contrePropositionDeId: contrePropositionDe.id } : {})');
  });
});

