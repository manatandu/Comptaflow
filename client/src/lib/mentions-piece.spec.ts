import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { avertissementArticle17, manquesDeLaPiece, mentionDebitsProposee, PIECE_ANTERIEURE } from './mentions-piece';

describe('AUSCGIE art. 17 sur la pièce imprimée', () => {
  it('une pièce complète ne signale rien', () => {
    expect(avertissementArticle17({ denomination: 'X', ligne: 'SARL · au capital de 1 000 000 CDF', manquantes: [] }, true)).toBeNull();
  });

  it('ce qui manquait À L’ÉTABLISSEMENT est dit, jamais comblé par le dossier d’aujourd’hui', () => {
    const a = avertissementArticle17({ denomination: 'X', ligne: 'SARL', manquantes: ['montant du capital social'] }, true);
    expect(a).toContain('montant du capital social');
  });

  it('hors des sociétés commerciales, rien n’est reproché', () => {
    // Une ASBL, une personne physique · la ligne est nulle, l'art. 17 ne les vise pas.
    expect(avertissementArticle17({ denomination: 'X', ligne: null, manquantes: [] }, false)).toBeNull();
  });

  it('AUDCG art. 59 · un commerçant sans RCCM n’a pas de ligne, et le manque se dit quand même (passe O2)', () => {
    const a = avertissementArticle17(
      { denomination: 'Ets X', ligne: null, manquantes: ['numéro et lieu d’immatriculation au RCCM (AUDCG art. 59)'] },
      true,
    );
    expect(a).toContain('AUDCG art. 59');
    expect(a).toMatch(/^Mentions de l’émetteur/);
  });

  it('une pièce antérieure à la recopie le DIT, chez une société seulement', () => {
    expect(avertissementArticle17(null, true)).toBe(PIECE_ANTERIEURE);
    expect(avertissementArticle17(null, false)).toBeNull();
  });
});

describe('Décret n° 011/42, art. 60 · la mention des débits (audit final F24)', () => {
  const debits = { texte: "Autorisation d'acquitter la TVA d'après les débits", article: 'décret n° 011/42, art. 60' };

  it('le manque de l’art. 60 est nommé, jamais une liste vide', () => {
    expect([
      manquesDeLaPiece({ manquantes: [], mentionDebitsManquante: true, mentionDebits: debits }),
      manquesDeLaPiece({ manquantes: [{ libelle: 'Adresse exacte' }], mentionDebitsManquante: false, mentionDebits: debits }),
    ]).toEqual([["« Autorisation d'acquitter la TVA d'après les débits » (décret n° 011/42, art. 60)"], ['Adresse exacte']]);
  });

  it('la case se propose cochée sur une vente au régime des débits, jamais sur un achat', () => {
    expect([
      mentionDebitsProposee('VENTE', 'DEBITS'),
      mentionDebitsProposee('VENTE', 'ENCAISSEMENTS'),
      mentionDebitsProposee('ACHAT', 'DEBITS'),
      mentionDebitsProposee('VENTE', null),
    ]).toEqual([true, false, false, false]);
  });
});

describe('Facturation · la pièce saisie se passe au journal (audit final F23)', () => {
  it('le formulaire envoie le tiers, le taux de chaque ligne et la mention de l’art. 60', () => {
    const page = readFileSync(join(__dirname, '..', 'pages', 'FacturationPage.tsx'), 'utf8');
    const envoi = page.slice(page.indexOf("await api.post('/facturation', {"), page.indexOf('setNumeroSerie(\'\');'));
    expect([
      envoi.includes('tiersId: tiersId || undefined'),
      envoi.includes('tauxTvaId: tauxTvaId || undefined'),
      envoi.includes('mentionTvaDebits: mentionDebitsCochee'),
      page.includes('manquesDeLaPiece(f.mentions)'),
    ]).toEqual([true, true, true, true]);
  });
});
