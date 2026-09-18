import { ordonnerLignes } from './ordre-ecriture';

// Pas d'import de « vitest » · convention du dépôt, describe/it/expect par les
// globales, pour que le fichier tourne sous les deux lanceurs.

/**
 * L'ORDRE D'UNE ÉCRITURE PROPOSÉE, MESURÉ CONTRE LE GUIDE.
 *
 * Les deux premiers tests reprennent les Applications 1 et 2 du Guide
 * d'application du SYSCOHADA révisé (Partie 1, chapitre 2) : ce ne sont pas
 * des cas inventés pour la circonstance, ce sont les écritures du texte, avec
 * leurs comptes et dans leur ordre. Si la fonction les rend autrement, c'est
 * elle qui a tort.
 */

const l = (numero: string, debit: number, credit: number) => ({ numero, debit, credit });
const numeros = (lignes: { numero: string }[]) => lignes.map((x) => x.numero);

describe('Ordre d’une écriture proposée · les débits, puis les crédits', () => {
  it('Application 1 du guide · achat, la TVA vient APRÈS les charges et le fournisseur au crédit', () => {
    // Guide, Partie 1 ch. 2, Application 1, variante frais séparés. Ordre
    // officiel : 2443, 6011, 6015, 6011, 6055, 6015, 4451, 4452 au débit ;
    // 4812 et 4011 au crédit. On le donne À L'ENVERS pour que le tri ait
    // quelque chose à faire.
    const melange = [
      l('40110000', 0, 3_025),
      l('44520000', 275, 0),
      l('60110000', 2_000, 0),
      l('44510000', 33, 0),
      l('24430000', 330, 0),
      l('60550000', 50, 0),
    ];
    expect(numeros(ordonnerLignes(melange))).toEqual([
      // Les comptes de nature d'abord, par numéro croissant…
      '24430000',
      '60110000',
      '60550000',
      // …puis la TVA, qu'un tri numérique nu aurait placée en tête…
      '44510000',
      '44520000',
      // …et le crédit en dernier.
      '40110000',
    ]);
  });

  it('Application 2 du guide · vente, le client au débit, les produits puis la TVA au crédit', () => {
    const melange = [
      l('44310000', 0, 308),
      l('70710000', 0, 280),
      l('41110000', 3_388, 0),
      l('70110000', 0, 800),
    ];
    expect(numeros(ordonnerLignes(melange))).toEqual([
      '41110000',
      '70110000',
      '70710000',
      '44310000',
    ]);
  });

  it('l’escompte obtenu se lit APRÈS le fournisseur qu’il solde', () => {
    // Règlement avec escompte · 401 au débit, trésorerie et 773 au crédit. Le
    // compte 40 « est débité […] des escomptes de règlement obtenus des
    // fournisseurs ; par le crédit du compte 773 Escomptes obtenus ».
    const melange = [l('77300000', 0, 50), l('52100000', 0, 950), l('40110000', 1_000, 0)];
    expect(numeros(ordonnerLignes(melange))).toEqual(['40110000', '52100000', '77300000']);
  });

  it('l’escompte accordé se lit APRÈS la trésorerie, dans la colonne des débits', () => {
    const melange = [l('67300000', 50, 0), l('41110000', 0, 1_000), l('52100000', 950, 0)];
    expect(numeros(ordonnerLignes(melange))).toEqual(['52100000', '67300000', '41110000']);
  });

  it('le 441 et le 447 ne sont PAS des accessoires · seules 443 à 446 le sont', () => {
    // La racine « 44 » entière emporterait l'impôt sur le résultat et les
    // impôts retenus à la source, qui ne sont pas les accessoires d'une
    // facture. Ils se rangent avec les comptes de nature, par leur numéro.
    const melange = [l('44520000', 100, 0), l('44100000', 500, 0), l('44700000', 0, 60), l('60110000', 1_000, 0)];
    expect(numeros(ordonnerLignes(melange))).toEqual(['44100000', '60110000', '44520000', '44700000']);
  });

  it('une ligne sans montant reste au débit · un modèle vierge ne s’inverse pas', () => {
    // Les modèles du dossier peuvent proposer des lignes que le comptable
    // chiffre ensuite. Les ranger au crédit au seul motif qu'elles ne portent
    // pas de débit retournerait la moitié de l'écriture.
    const melange = [l('40110000', 0, 0), l('60110000', 0, 0), l('44520000', 0, 0)];
    expect(numeros(ordonnerLignes(melange))).toEqual(['40110000', '60110000', '44520000']);
  });

  it('le tri est STABLE · deux lignes sur le même compte gardent leur ordre', () => {
    const a = { numero: '60110000', debit: 10, credit: 0, marque: 'premiere' };
    const b = { numero: '60110000', debit: 20, credit: 0, marque: 'seconde' };
    expect(ordonnerLignes([a, b]).map((x) => x.marque)).toEqual(['premiere', 'seconde']);
  });

  it('ne perd ni ne duplique aucune ligne', () => {
    const lignes = [l('40110000', 0, 100), l('60110000', 84, 0), l('44520000', 16, 0)];
    const rendu = ordonnerLignes(lignes);
    expect(rendu).toHaveLength(3);
    expect(new Set(rendu)).toEqual(new Set(lignes));
  });
});
