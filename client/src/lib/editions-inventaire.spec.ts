import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EditionInventaireImprimee } from '../components/EditionsInventaire';
import { cheminEdition, jourImprime, LIBELLE_DECISION_ECART, LIBELLE_SENS_ECART, quantiteImprimee } from './editions-inventaire';
import type { CampagneEdition, EditionFichesVierges, EditionPvCaisse, EditionPvInventaire } from './types';

/**
 * LIGNE A19 · LES ÉDITIONS DE L'INVENTAIRE À L'ÉCRAN.
 *
 * Ce qui casserait en silence. (1) Une quantité ou une valeur absente
 * imprimée « 0 » · le PV dirait « compté, rien trouvé ». (2) Une fiche
 * vierge qui imprime une quantité déjà saisie · la feuille de recomptage
 * dicterait le chiffre à retrouver. (3) Le PV de caisse imprimé avec des
 * mentions recomposées à l'écran · l'écran et le papier diraient deux choses
 * (ligne A10). (4) Une signature préremplie. (5) L'impression de la fenêtre
 * entière au lieu de l'édition · `avec-edition` n'est posé que pendant
 * qu'une édition est préparée, et l'édition est un enfant direct.
 */

const CAMPAGNE: CampagneEdition = {
  id: 'camp1',
  libelle: 'Inventaire de clôture 2026',
  dateInventaire: '2026-12-31T00:00:00.000Z',
  statut: 'ARBITRAGE',
  instructions: null,
  exercice: { dateDebut: '2026-01-01T00:00:00.000Z', dateFin: '2026-12-31T00:00:00.000Z', dateArreteComptes: null },
};

const SC = {
  id: 'sc1',
  nom: 'Magasin',
  perimetre: 'Magasin central',
  inventoriants: [{ nom: 'Kabila', fonction: 'Magasinier' }],
  temoins: [{ nom: 'Mutombo', fonction: null }],
};

const rendu = (e: Parameters<typeof EditionInventaireImprimee>[0]['edition']) =>
  renderToStaticMarkup(createElement(EditionInventaireImprimee, { edition: e }));

/** Le texte des cellules d'un rendu, dans l'ordre. */
const cellules = (html: string) => [...html.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''));

describe('chemins, libellés et formats', () => {
  it('les trois routes de lecture, sous-commission encodée', () => {
    expect(cheminEdition({ nature: 'FICHES_DE_COMPTAGE', campagneId: 'c1' })).toBe('/inventaire/c1/editions/fiches-de-comptage');
    expect(cheminEdition({ nature: 'FICHES_DE_COMPTAGE', campagneId: 'c1', sousCommissionId: 's 1' })).toBe(
      '/inventaire/c1/editions/fiches-de-comptage?sousCommissionId=s%201',
    );
    expect(cheminEdition({ nature: 'PROCES_VERBAL_INVENTAIRE', campagneId: 'c1' })).toBe('/inventaire/c1/editions/proces-verbal');
    expect(cheminEdition({ nature: 'PROCES_VERBAL_CAISSE', pvId: 'pv1' })).toBe('/inventaire/pv-caisse/pv1/edition');
  });

  it('une quantité garde sa précision, absente elle se dit « · », jamais « 0 »', () => {
    expect(quantiteImprimee(null)).toBe('·');
    expect(quantiteImprimee(undefined)).toBe('·');
    expect(quantiteImprimee(0)).toBe('0');
    expect(quantiteImprimee(2.125)).toBe('2,125');
    expect(jourImprime('2026-12-31T00:00:00.000Z')).toBe('31/12/2026');
    expect(jourImprime(null)).toBe('·');
  });

  it('les quatre décisions et les trois sens · un libellé chacun', () => {
    expect(Object.keys(LIBELLE_DECISION_ECART).sort()).toEqual(
      ['A_REDRESSER', 'EXCEDENT_NON_COMPTABILISE', 'EXPLIQUE', 'RENVOYE_COMMISSION_PRINCIPALE'].sort(),
    );
    expect(LIBELLE_SENS_ECART).toEqual({ MANQUANT: 'Manquant', EXCEDENT: 'Excédent', SANS_ECART: 'Aucun écart' });
  });
});

describe('fiches de comptage vierges', () => {
  const e: EditionFichesVierges = {
    nature: 'FICHES_DE_COMPTAGE',
    titre: 'Fiches de comptage',
    campagne: CAMPAGNE,
    perimetre: 'Toutes les sous-commissions · 2 fiches',
    colonnesARemplir: ['Quantité comptée', "Valeur d'inventaire", 'Pièce de référence'],
    sections: [
      {
        sousCommission: SC,
        lignes: [
          { ficheId: 'f1', designation: 'Bureau', compte: '24410000 · Mobilier', lieu: 'B2 · Direction', unite: 'unité' },
          { ficheId: 'f2', designation: 'Riz', compte: '31100000 · Marchandises', lieu: 'Lieu non renseigné', unite: null },
        ],
      },
    ],
    nombreFiches: 2,
    dejaComptees: 0,
  };

  it('chaque ligne porte désignation, compte, lieu, unité, puis trois cases VIDES', () => {
    const html = rendu(e);
    expect(cellules(html)).toEqual([
      '1', 'Bureau', '24410000 · Mobilier', 'B2 · Direction', 'unité', '', '', '',
      '2', 'Riz', '31100000 · Marchandises', 'Lieu non renseigné', '·', '', '', '',
    ]);
    expect(html).toContain('Toutes les sous-commissions · 2 fiches');
    expect(html).toContain('Inventoriants · Kabila, Magasinier');
    expect(html).toContain('Témoins · Mutombo');
    // Seule imprimée · la fenêtre ne s'imprime pas avec elle.
    expect(html.startsWith('<div class="impression-seul')).toBe(true);
  });
});

describe('procès-verbal d’inventaire physique', () => {
  const e: EditionPvInventaire = {
    nature: 'PROCES_VERBAL_INVENTAIRE',
    titre: "Procès-verbal d'inventaire physique",
    campagne: CAMPAGNE,
    etabli: null,
    sousCommissions: [SC],
    releve: [
      { designation: 'Riz', compte: '31100000 · Marchandises', lieu: 'Magasin', unite: 'sac', quantite: null, valeur: null, piece: null, sousCommission: 'Magasin' },
    ],
    totauxParCompte: [{ compte: '31100000 · Marchandises', nombreFiches: 1, valeurInventaire: null, nonValorisees: 1 }],
    rapprochee: true,
    ecarts: [
      {
        compte: '31100000 · Marchandises',
        valeurInventaire: 900,
        soldeComptable: 1000,
        ecart: -100,
        sens: 'MANQUANT',
        nombreFiches: 1,
        rapprocheLe: '2027-01-05T00:00:00.000Z',
        decision: 'A_REDRESSER',
        responsable: 'Magasinier',
        explication: null,
        arbitreLe: null,
      },
    ],
    caisses: [],
    signataires: { inventoriants: [{ nom: 'Kabila', fonction: 'Magasinier', sousCommission: 'Magasin' }], temoins: [] },
    mentions: ['Procès-verbal non établi dans OmegaX · document de travail.', '1 fiche sans quantité comptée.'],
  };

  it('null s’imprime « · », le total d’un compte non valorisé le dit, l’écart a son sens et sa décision', () => {
    const html = rendu(e);
    const c = cellules(html);
    expect(c.slice(0, 8)).toEqual(['Riz', '31100000 · Marchandises', 'Magasin', 'sac', '·', '·', '·', 'Magasin']);
    expect(c).toContain('1 fiche(s) non valorisée(s)');
    expect(c).toContain('Manquant');
    expect(c).toContain('À redresser');
    expect(html).toContain('Procès-verbal non établi');
    for (const m of e.mentions) expect(html).toContain(m);
    // Aucun « 0,00 » dans une ligne qui n'a rien de compté.
    expect(c.slice(0, 8)).not.toContain('0,00');
    // Le témoin manquant se dit, la signature reste une case vide.
    expect(html).toContain('Aucun enregistré.');
    expect(html).toContain('<div class="flex-1 h-7 border-b border-black"></div>');
  });
});

describe('procès-verbal de comptage de caisse', () => {
  const e: EditionPvCaisse = {
    nature: 'PROCES_VERBAL_CAISSE',
    titre: 'Procès-verbal de comptage de caisse',
    campagne: CAMPAGNE,
    pvId: 'pv1',
    caisse: '57110000 · Caisse siège',
    sousCommission: SC,
    dateComptage: '2027-01-10T00:00:00.000Z',
    heureComptage: '08:30',
    unite: null,
    modeComparaison: 'FRANCS',
    especesComptees: 140000,
    soldeComptable: 150000,
    ecart: -10000,
    reconstitution: {
      dateCloture: '2026-12-31T00:00:00.000Z',
      soldeALaCloture: 100000,
      mouvementsValeurAvantCloture: 0,
      encaissementsPosterieurs: 80000,
      decaissementsPosterieurs: 30000,
      mouvementsPosterieurs: 3,
      especesReconstitueesALaCloture: 90000,
    },
    compteApresLaCloture: true,
    reconstitutionManquante: false,
    coupures: [],
    totalCoupures: null,
    attestation: null,
    observations: null,
    etabli: { le: '2027-01-10T00:00:00.000Z', par: 'chef@cabinet.cd' },
    mentions: ['Mention écrite par le serveur, reprise telle quelle.'],
  };

  it('reprend les chiffres et les mentions servis, sans rien recomposer', () => {
    const html = rendu(e);
    expect(html).toContain('Mention écrite par le serveur, reprise telle quelle.');
    const c = cellules(html);
    expect(c[0]).toBe('Solde à la clôture du 31/12/2026');
    expect(c).toContain('Espèces reconstituées à la clôture');
    expect(html).toContain('Aucune attestation enregistrée');
    expect(html).toContain('manquant');
    expect(html).not.toContain('Ventilation par coupure');
  });

  const source = readFileSync(join(__dirname, '../components/EditionsInventaire.tsx'), 'utf8');
  it('l’édition n’importe ni le calcul des mentions ni un formatage de montant à elle', () => {
    expect(source).toContain("from '../lib/montants'");
    expect(source).not.toMatch(/mentionsDuPv|toFixed\(/);
  });
});

describe('la fenêtre Inventaire imprime l’édition, et elle seule', () => {
  const page = readFileSync(join(__dirname, '../pages/InventairePage.tsx'), 'utf8');

  it('`avec-edition` n’est posé que pendant qu’une édition existe, l’édition est un enfant direct', () => {
    expect(page).toContain("className={`p-2 ${edition ? 'avec-edition' : ''}`}");
    expect(page).toMatch(/\{edition && <EditionInventaireImprimee edition=\{edition\} \/>\}/);
    // L'en-tête porte l'exercice DE LA CAMPAGNE, pas celui du sélecteur.
    expect(page).toContain('exercice={edition?.campagne.exercice}');
  });

  it('les éditions sont des lectures · leurs boutons ne sont pas sous `peutEcrire`', () => {
    // Le bloc des deux boutons, découpé par ses balises (structure, jamais une
    // distance) · il ne lit pas `peutEcrire`, et rien au-dessus ne l'enferme
    // dans un `{peutEcrire && (` (son parent direct est l'en-tête de la campagne).
    const debut = page.indexOf('<div className="flex gap-1.5 items-center">');
    expect(debut).toBeGreaterThan(-1);
    let profondeur = 0;
    let fin = -1;
    for (const m of page.slice(debut).matchAll(/<div\b|<\/div>/g)) {
      profondeur += m[0] === '</div>' ? -1 : 1;
      if (profondeur === 0) {
        fin = debut + (m.index ?? 0);
        break;
      }
    }
    const bloc = page.slice(debut, fin);
    expect(bloc).toContain("nature: 'FICHES_DE_COMPTAGE', campagneId: detail.id }");
    expect(bloc).toContain("nature: 'PROCES_VERBAL_INVENTAIRE', campagneId: detail.id }");
    expect(bloc).not.toContain('peutEcrire');
    // Le bloc suit immédiatement le titre de la campagne, hors de tout `{peutEcrire && (`.
    const precedent = page.slice(0, debut).trimEnd();
    expect(precedent.endsWith('</div>')).toBe(true);
    expect(page).toContain("cheminEdition({ nature: 'PROCES_VERBAL_CAISSE', pvId })");
    expect(page).toContain("cheminEdition({ nature: 'FICHES_DE_COMPTAGE', campagneId: detail.id, sousCommissionId })");
  });
});
