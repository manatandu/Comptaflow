import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LEXIQUE } from './lexique';

/**
 * CE QUE LE SERVEUR CALCULE ET QUE L'ÉCRAN NE MONTRE PAS.
 *
 * Deux vagues de corrections fiscales ont enrichi le serveur : exigibilité par
 * nature d'opération, avoirs de l'article 52, exclusions de l'article 41,
 * déchéance de l'article 37, crédit reporté de l'article 63, avertissements sur
 * les assiettes hors de portée, quotités de la petite entreprise. Chacune de
 * ces corrections a produit un CHIFFRE ou un TEXTE que le serveur rend
 * fidèlement · et dont plusieurs n'atteignaient aucun écran.
 *
 * Un défaut de RESTITUTION ne casse rien. Les types compilent, les tests
 * serveur passent, la donnée existe dans la réponse HTTP. Elle n'arrive
 * simplement jamais devant l'utilisateur, qui continue de décider sans elle.
 * C'est exactement le défaut que l'AUDCIF art. 22, 1° vise en exigeant que les
 * données « puissent être RESTITUÉES [...] sous une forme directement
 * intelligible » : la seconde moitié de la phrase est aussi normative que la
 * première.
 *
 * Ce fichier relit donc la SOURCE des écrans, seul endroit où le manque était
 * visible. Aucun import de `vitest` · convention du dépôt, describe/it/expect
 * arrivent par les globales, ce qui rend le fichier exécutable par les DEUX
 * lanceurs.
 */

const racine = join(__dirname, '..');
const source = (chemin: string) => readFileSync(join(racine, chemin), 'utf8');

describe('Restitution · la déclaration de TVA montre ce qui modifie le net', () => {
  const page = () => source('pages/DeclarationTvaPage.tsx');

  it('rend les sept montants que les corrections de l’article 41, 52 et 37 ont produits', () => {
    const s = page();
    for (const champ of [
      'recuperationArt52',
      'avoirsCollecteConstates',
      'avoirsCollecteNonImputes',
      'tvaExclueArt41',
      'tvaAVerifierArt41',
      'tvaDeductibleDechue',
      'tvaNatureDepenseIllisible',
    ]) {
      expect(`${champ}: ${s.includes(`declaration.${champ}`) ? 'rendu' : 'ABSENT DE L’ÉCRAN'}`).toBe(`${champ}: rendu`);
    }
  });

  it('ne cache plus le bouton de liquidation sur les deux cas que le serveur accepte', () => {
    const s = page();
    // Une période dont le seul mouvement est une récupération de l'art. 52.
    expect(s).toContain('declaration.recuperationArt52 > 0');
    // Une déduction admise NÉGATIVE · un avoir fournisseur qui dépasse le mois.
    expect(s).toContain('Math.abs(declaration.totalDeductibleAdmise)');
    // L'ancienne condition, qui rejetait les deux, ne doit plus être là.
    expect(s).not.toContain('declaration.totalDeductibleAdmise > 0 ');
  });
});

describe('Restitution · l’écran fiscal montre ce que le module refuse de chiffrer', () => {
  const page = () => source('pages/FiscalitePage.tsx');

  it('lit les avertissements de la route des propositions, au lieu de les jeter', () => {
    const s = page();
    expect(s).toContain('avertissementsPropositions');
    // Le motif est le coeur du message : il dit ce qu'il reste à établir.
    expect(s).toContain('a.motif');
  });

  it('ne réclame aucun montant que le module s’est abstenu de proposer', () => {
    const s = page();
    expect(s).toContain('AUCUN MONTANT N’EST PROPOSÉ');
  });
});

describe('Restitution · le registre des retenues distingue ses deux reversements', () => {
  const page = () => source('pages/RetenuesPage.tsx');

  it('affiche l’imputation ET la piste de l’écriture, qui ne sont plus le même chiffre', () => {
    const s = page();
    expect(s).toContain('REVERSÉ (IMPUTÉ)');
    expect(s).toContain('DÉBITÉ CE MOIS');
    expect(s).toContain('m.reverseEcritures');
  });

  it('annonce les reversements qu’aucune retenue de l’exercice n’absorbe', () => {
    expect(page()).toContain('n.reverseNonImpute');
  });
});

describe('Saisie guidée · la ligne de TVA au taux zéro, sans laquelle le prorata ment', () => {
  it('pose la ligne quand le TAUX est nul, pas seulement quand la taxe l’est', () => {
    const s = source('components/ModelesSaisie.tsx');
    expect(s).toContain('tauxEstZero');
    expect(s).toContain('tva > 0.005 || tauxEstZero');
    // Sans `tauxTvaId`, la ligne ne qualifie rien : c'est elle qui compte.
    expect(s).toContain('tauxTvaId: taux.id');
  });
});

describe('Lexique · l’exemption d’impôt ne se présume pas', () => {
  it('n’affirme plus qu’une entité à but non lucratif est exemptée, sans réserve', () => {
    const texte = LEXIQUE.resultatFiscal.texte;
    expect(texte).not.toContain('Une entité à but non lucratif est exemptée.');
    expect(texte).toContain('attestation'.toUpperCase());
    expect(texte).toContain('quatre conditions');
    expect(LEXIQUE.resultatFiscal.source).toContain('007/CAB/MIN/FINANCES/2025');
  });
});
