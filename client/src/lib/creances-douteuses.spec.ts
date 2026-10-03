import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  annonceRevue,
  compte416Initial,
  motifAnnulationValide,
  motifListe651Vide,
  annonceTvaNonExigible,
  mouvementAAnnulerParDefaut,
  piecesAEnvoyer,
} from './creances-douteuses';
import { montant } from './montants';

const page = readFileSync(join(__dirname, '../pages/CreancesDouteusesPage.tsx'), 'utf8');

describe('créances douteuses · écran (ligne A7)', () => {
  it('annonce l’écart seul, dotation, reprise ou maintien, montants écrits par lib/montants', () => {
    expect(annonceRevue(0, 400_000)).toBe(`Dotation de ${montant(400_000)} · D 6594 / C 491, au dernier jour de l'exercice.`);
    expect(annonceRevue(400_000, 250_000)).toBe(`Reprise de ${montant(150_000)} · D 491 / C 7594, au dernier jour de l'exercice.`);
    expect(annonceRevue(400_000, 400_000)).toContain('aucune écriture');
    // Un champ vide n'annonce rien · vide n'est pas zéro.
    expect(annonceRevue(400_000, null)).toBeNull();
  });

  it('présélectionne le 416 proposé, sinon le seul compte, sinon rien', () => {
    const c = [
      { id: 'a', numero: '41610000' },
      { id: 'b', numero: '41620000' },
    ];
    expect(compte416Initial({ DOUTEUSE: '4162' }, 'DOUTEUSE', c)).toBe('b');
    expect(compte416Initial({ DOUTEUSE: null }, 'DOUTEUSE', c)).toBe('');
    expect(compte416Initial({ DOUTEUSE: null }, 'DOUTEUSE', [c[0]])).toBe('a');
  });

  it('n’envoie que les pièces qui ont une nature et une référence', () => {
    expect(piecesAEnvoyer([{ nature: 'Mise en demeure', reference: 'LR-1', date: '' }, { nature: '', reference: 'x', date: '' }])).toEqual([
      { nature: 'Mise en demeure', reference: 'LR-1' },
    ]);
  });

  it('M8 · une liste 651 vide dit pourquoi et quoi faire ; non lue, elle ne dit rien', () => {
    expect(motifListe651Vide(null)).toBeNull();
    expect(motifListe651Vide([{}])).toBeNull();
    expect(motifListe651Vide([])).toContain('Plan comptable');
    expect(page).toContain('motifListe651Vide(comptes651)');
  });

  it('B2 · l’annulation d’une revue exige un motif de 3 à 500 caractères, dans sa modale', () => {
    expect(motifAnnulationValide('ab')).toBe(false);
    expect(motifAnnulationValide('Erreur')).toBe(true);
    expect(motifAnnulationValide('x'.repeat(501))).toBe(false);
    const corps = page.slice(page.indexOf('async function annuler'));
    expect(corps).toContain('/annuler`');
    expect(page).toContain('Annuler la revue de la dépréciation');
  });

  it('la dépréciation se saisit en montant, jamais en taux · l’écran envoie le montant déclaré', () => {
    const corps = page.slice(page.indexOf('async function envoyer'));
    expect(corps).toContain('depreciationNecessaire: necessaire');
  });

  it('M8 · gestes réservés à peutValider, formulaire gardé à la fermeture, aucun formatage de montant recopié', () => {
    expect(page).toContain('peutValider &&');
    expect(page).not.toMatch(/\bpeutEcrire\b/);
    expect(page).toContain('useGardeFermeture(');
    expect(page).not.toMatch(/toFixed\(/);
  });
});

describe('créances douteuses · E2 à l’écran', () => {
  it('la récupération de la TVA se demande (case décochée), proposée par le serveur, et le mois civil qui suit est dit', () => {
    expect(page).toContain('recupererTva: false,');
    expect(page).toContain('/tva-origine`');
    expect(page).toContain('au plus tôt dans la déclaration du mois civil qui suit la constatation');
    expect(page).toContain('décret n° 011/42, art. 96, 126 et 127');
  });
});

describe('créances douteuses · E1 à l’écran', () => {
  it('la bulle d’aide de la revue dit que la base est le TTC inscrit au 416', () => {
    expect(page).toContain('Base de la dépréciation · le montant TTC inscrit au 416');
  });
});

describe('créances douteuses · E2 dans la déclaration de TVA', () => {
  const declaration = readFileSync(join(__dirname, '../pages/DeclarationTvaPage.tsx'), 'utf8');
  it('la récupération sur créance irrécouvrable a sa ligne propre, et ouvre la liquidation', () => {
    expect(declaration).toContain('Récupération sur créance irrécouvrable, art. 52');
    expect(declaration).toContain('declaration.recuperationCreancesIrrecouvrables > 0) && (');
  });
});

describe('créances douteuses · seconde relecture à l’écran (K2, K3, K4, M-c, M-e)', () => {
  it('K2 · la TVA facturée n’est plus saisie · elle s’affiche, lue sur les ventes d’origine, et se renvoie telle quelle', () => {
    expect(page).not.toContain("champ('tvaFacturee'");
    const corps = page.slice(page.indexOf('async function envoyer'));
    expect(corps).toContain('const facturee = tvaOrigine?.proposition?.tvaFactureeCreance;');
  });

  it('K3 · le reclassement et la déclaration envoient les ventes d’origine, présélectionnées sur la proposition du serveur', () => {
    expect(page).toContain('/creances-douteuses/ventes-origine?');
    expect(page).toContain('ventesOrigineIds: v.proposees');
    expect(page.match(/ventesOrigineIds: form\.ventesOrigineIds\.length > 0/g)).toHaveLength(2);
  });

  it('K4 · un mouvement s’annule dans sa modale, motif exigé · le plus récent est proposé', () => {
    expect(mouvementAAnnulerParDefaut([])).toBeNull();
    expect(mouvementAAnnulerParDefaut([{ id: 'b', date: '2026-12-20' }, { id: 'a', date: '2026-12-10' }])).toBe('b');
    const corps = page.slice(page.indexOf('async function annuler'));
    expect(corps).toContain('/mouvements/${annulation.mouvementId}/annuler`');
    expect(page).toContain('Annuler une perte ou un recouvrement');
  });

  it('M-c et M-e · le mouvement sans revue se dit ; la créance déclarée sans vente tenue n’ouvre aucune récupération, et c’est dit', () => {
    expect(page).toContain('mouvement(s) sans revue');
    expect(page).toContain("une créance déclarée à l'ouverture sans vente tenue dans OmegaX n'ouvre donc aucune récupération dans le module");
  });
});

describe('créances douteuses · troisième relecture à l’écran (B-1)', () => {
  it('la part jamais exigible s’annonce au prorata de la perte, sortie sans taux, et ne se saisit pas', () => {
    expect(annonceTvaNonExigible(160_000, 580_000, 1_160_000)).toBe(
      `TVA jamais exigible · ${montant(80_000)} sortent d'office du 443, sans taux, hors de toute déclaration.`,
    );
    expect(annonceTvaNonExigible(0, 580_000, 1_160_000)).toBeNull();
    expect(annonceTvaNonExigible(160_000, null, 1_160_000)).toBeNull();
    expect(page).toContain('Dont déjà exigible :');
    expect(page).not.toContain("champ('tvaNonExigible'");
  });
});
