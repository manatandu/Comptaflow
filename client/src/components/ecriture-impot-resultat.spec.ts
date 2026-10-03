import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { messageAnnulation, messageEcart } from '../lib/ecriture-impot';

/**
 * Ligne A11 · l'écran de l'écriture de l'impôt. Ce qui se tromperait en
 * silence · un écart affiché négatif sans sens, une annulation sans compte
 * rendu, une case d'imputation envoyée cochée alors que le serveur la refuse,
 * une fenêtre masquée sur le régime qui enfermerait un constat passé.
 */

const source = readFileSync(join(__dirname, 'EcritureImpotResultat.tsx'), 'utf8');
const page = readFileSync(join(__dirname, '..', 'pages', 'FiscalitePage.tsx'), 'utf8');

describe('écart du constat · valeur absolue et sens', () => {
  it('dit supérieur ou inférieur, jamais un montant négatif', () => {
    expect(messageEcart(200, 20)).toMatch(/supérieur de 20,00/);
    expect(messageEcart(160, -20)).toMatch(/inférieur de 20,00/);
    expect(messageEcart(160, -20)).not.toMatch(/-20/);
  });
});

describe('compte rendu de l’annulation', () => {
  it('nomme le traitement appliqué par le serveur', () => {
    expect(messageAnnulation({ traitement: 'SUPPRIMEE', numeroPiece: 7 })).toMatch(/pièce n° 7.*supprimée/);
    expect(messageAnnulation({ traitement: 'INSCRITE_EN_NEGATIF', numeroPiece: 7, negatifNumeroPiece: 9 })).toMatch(/négatif \(pièce n° 9\)/);
  });
});

describe('câblage de l’écran', () => {
  it('l’imputation n’est envoyée que si le serveur ne la refuse pas', () => {
    expect(source).toContain('imputerAcomptes: imputer && motifRefusImputation === null');
  });

  it('la longueur de l’attestation est servie, jamais écrite en dur', () => {
    expect(source).toContain('proposition.longueurMinAttestation');
  });

  it('la fenêtre se montre sur l’exercice seul, pas sous condition du régime', () => {
    // La condition qui ouvre le composant est l'exercice, et elle seule.
    expect(page).toMatch(/\{exerciceId && \(\s*<EcritureImpotResultat/);
    expect(page.match(/<EcritureImpotResultat/g)).toHaveLength(1);
  });
});
