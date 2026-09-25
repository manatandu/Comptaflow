import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AUDCIF art. 22, 4° · le report d'une opération hors d'une période clôturée
 * se DEMANDE, il n'est jamais fait d'office. Le piège est réel : un
 * `onClick={enregistrerPiece}` passerait l'événement du clic comme premier
 * argument, lu comme « reporter », et chaque pièce serait reportée sans que
 * personne ne l'ait voulu. Le typage l'a attrapé à l'écriture ; ce test le
 * garde.
 */
const source = readFileSync(join(__dirname, 'SaisiePage.tsx'), 'utf8');

describe('saisie · le report de l’art. 22, 4° est une demande expresse', () => {
  it('le bouton Enregistrer appelle sans argument', () => {
    expect(source).toContain('onClick={() => enregistrerPiece()}');
  });

  it('le report n’est proposé qu’après le refus qui cite l’article', () => {
    expect(source).toContain("erreur.includes('art. 22, 4°')");
    expect(source).toContain('onClick={() => enregistrerPiece({ reporterAuPremierJourOuvert: true })}');
  });
});
