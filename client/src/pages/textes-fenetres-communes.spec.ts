import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LES TEXTES DES FENÊTRES COMMUNES.
 *
 * Une fenêtre sans `referentielsApplicables` s'ouvre aux deux référentiels, et
 * tout ce qu'elle écrit à l'écran est lu par les deux. Une phrase qui nomme le
 * SYCEBNL, cite l'une de ses parties, ou prend une association pour exemple ne
 * casse rien : elle s'affiche, elle s'imprime, et elle se recopie dans un
 * rapport. C'est la catégorie d'erreur la moins visible et la plus durable.
 *
 * Ce spec tient une liste EXPLICITE des textes aiguillés, chacun avec les deux
 * versions qui doivent coexister dans le fichier. Il ne devine rien : une
 * heuristique sur le mot « SYCEBNL » se noierait dans les commentaires et dans
 * les écrans qui aiguillent déjà en interne (états financiers, notes annexes).
 * Ici, si quelqu'un supprime une branche, la paire n'est plus complète et le
 * test tombe en nommant la phrase perdue.
 */

const RACINE = join(__dirname, '..');
const lire = (p: string) => readFileSync(join(RACINE, p), 'utf8');

interface Paire {
  fichier: string;
  quoi: string;
  sycebnl: string;
  syscohada: string;
}

const PAIRES: Paire[] = [
  {
    fichier: 'pages/DevisesPage.tsx',
    quoi: 'la source de la séparation écart latent / écart réalisé',
    sycebnl: 'le SYCEBNL sépare',
    // AUDCIF art. 54 (écarts de conversion) et 57 (disponibilités en devises).
    syscohada: "l'AUDCIF sépare (art. 54 et 57)",
  },
  {
    fichier: 'pages/TauxTvaPage.tsx',
    quoi: "l'exemple d'opération exonérée de TVA",
    // O.-L. n° 10/001, art. 15, 2° · ventes conformes à l'objet d'une ASBL.
    sycebnl: "activité normale d'une ASBL",
    // Même ordonnance-loi, art. 15, 1° · bien meuble d'occasion.
    syscohada: "bien meuble d'occasion",
  },
  {
    fichier: 'pages/DashboardPage.tsx',
    quoi: 'le renvoi aux états financiers de référence',
    sycebnl: "'SYCEBNL'",
    syscohada: "'SYSCOHADA'",
  },
  {
    fichier: 'pages/RegularisationPage.tsx',
    quoi: "l'exemple de produit constaté d'avance",
    sycebnl: "cotisation appelée d'avance",
    syscohada: 'abonnement facturé au client',
  },
  {
    fichier: 'pages/RegularisationPage.tsx',
    quoi: "l'exemple d'abonnement",
    sycebnl: "convention de financement",
    syscohada: 'honoraires mensuels',
  },
];

describe('Textes des fenêtres communes aux deux référentiels', () => {
  for (const p of PAIRES) {
    it(`${p.fichier} · ${p.quoi} existe dans les deux versions`, () => {
      const source = lire(p.fichier);
      expect(source).toContain(p.sycebnl);
      expect(source).toContain(p.syscohada);
    });
  }

  it('le message de la fenêtre Devises ne suppose plus une association', () => {
    // « Une association qui encaisse en dollars… » était montré à une SARL.
    expect(lire('pages/DevisesPage.tsx')).not.toContain('Aucune devise. Une association');
  });

  it('nomme la DÉNOMINATION, jamais la « raison sociale »', () => {
    // Les deux textes disent « dénomination » · AUSCGIE art. 17 (« La
    // dénomination sociale doit figurer sur tous les actes et documents
    // émanant de la société ») et loi n° 004/2001 art. 7, 1° et art. 16
    // (« doivent mentionner la dénomination sociale »). La « raison sociale »
    // désigne en droit des sociétés le nom formé du nom des associés : elle
    // ne convient à aucun des deux référentiels. Aucune branche ici, donc ·
    // le terme est le même des deux côtés, c'est le mot choisi qui était faux.
    for (const fichier of ['pages/ParametresDossierPage.tsx', 'components/NouveauFichierWizard.tsx']) {
      const source = lire(fichier);
      expect(source).not.toMatch(/[Rr]aison sociale/);
      expect(source).toMatch(/[Dd]énomination/);
    }
  });

  it('la console de plateforme n’annonce pas le plan SYCEBNL quand SYSCOHADA est choisi', () => {
    // Le référentiel est choisi juste au-dessus dans le même formulaire · la
    // phrase doit le reprendre, pas l'écrire en dur.
    const source = lire('pages/PlateformePage.tsx');
    expect(source).not.toContain('plan de comptes SYCEBNL');
    expect(source).toContain('plan de comptes {referentielChoisi}');
  });
});
