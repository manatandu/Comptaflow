import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  cheminEdition,
  jourImprime,
  LIBELLE_DECISION_ECART,
  LIBELLE_SENS_ECART,
  lignesPvCaisse,
  quantiteImprimee,
  tableCaisses,
  tableCoupures,
  tableEcarts,
  tableFichesVierges,
  tableReleve,
  tableTotauxParCompte,
} from './editions-inventaire';
import { montant } from './montants';
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
 *
 * Les cellules sont relues telles qu'elles seront imprimées, construites par
 * `editions-inventaire.ts` · le composant ne fait que les poser, et le spec
 * ne monte pas React (`specs-sans-react.spec.ts`).
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
    expect(tableFichesVierges(e.sections[0], e.colonnesARemplir)).toEqual({
      colonnes: ['N°', 'Désignation', 'Compte', 'Lieu', 'Unité', 'Quantité comptée', "Valeur d'inventaire", 'Pièce de référence'],
      lignes: [
        ['1', 'Bureau', '24410000 · Mobilier', 'B2 · Direction', 'unité', '', '', ''],
        ['2', 'Riz', '31100000 · Marchandises', 'Lieu non renseigné', '·', '', '', ''],
      ],
    });
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
      { designation: 'Bureau', compte: '24410000 · Mobilier', lieu: 'B2', unite: 'unité', quantite: 1, valeur: 1150000, piece: 'FA-31', sousCommission: null },
    ],
    totauxParCompte: [
      { compte: '24410000 · Mobilier', nombreFiches: 1, valeurInventaire: 1150000, nonValorisees: 0 },
      { compte: '31100000 · Marchandises', nombreFiches: 1, valeurInventaire: null, nonValorisees: 1 },
    ],
    rapprochee: true,
    ecarts: [
      {
        compte: '24410000 · Mobilier',
        valeurInventaire: 1150000,
        soldeComptable: 1200000,
        ecart: -50000,
        sens: 'MANQUANT',
        nombreFiches: 1,
        rapprocheLe: '2027-01-05T00:00:00.000Z',
        decision: 'A_REDRESSER',
        responsable: 'Intendant',
        explication: null,
        arbitreLe: null,
      },
    ],
    caisses: [
      {
        pvId: 'pv1',
        caisse: '57110000 · Caisse siège',
        dateComptage: '2027-01-10T00:00:00.000Z',
        heureComptage: '08:30',
        sousCommission: 'Magasin',
        unite: 'USD',
        especesComptees: 1400,
        soldeComptable: 1500,
        ecart: -100,
      },
    ],
    signataires: { inventoriants: [{ nom: 'Kabila', fonction: 'Magasinier', sousCommission: 'Magasin' }], temoins: [] },
    mentions: ['Procès-verbal non établi dans OmegaX · document de travail.'],
  };

  it('null s’imprime « · », jamais « 0,00 » · le reste passe par lib/montants.ts', () => {
    expect(tableReleve(e).lignes).toEqual([
      ['Riz', '31100000 · Marchandises', 'Magasin', 'sac', '·', '·', '·', 'Magasin'],
      ['Bureau', '24410000 · Mobilier', 'B2', 'unité', '1', montant(1150000), 'FA-31', '·'],
    ]);
  });

  it('le total d’un compte non valorisé dit son manque au lieu d’un chiffre', () => {
    expect(tableTotauxParCompte(e).lignes).toEqual([
      ['24410000 · Mobilier', '1', montant(1150000)],
      ['31100000 · Marchandises', '1', '1 fiche(s) non valorisée(s)'],
    ]);
  });

  it('l’écart a son sens et sa décision en mots, la caisse son unité', () => {
    expect(tableEcarts(e).lignes).toEqual([
      ['24410000 · Mobilier', montant(1150000), montant(1200000), montant(-50000), 'Manquant', 'À redresser', 'Intendant', '·'],
    ]);
    expect(tableCaisses(e).lignes).toEqual([
      ['57110000 · Caisse siège', '10/01/2027 à 08:30', 'Magasin', `${montant(1400)} USD`, `${montant(1500)} USD`, `${montant(-100)} USD`],
    ]);
  });
});

describe('procès-verbal de comptage de caisse', () => {
  const base: EditionPvCaisse = {
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
    especesComptees: 519000,
    soldeComptable: 520000,
    ecart: -1000,
    reconstitution: {
      dateCloture: '2026-12-31T00:00:00.000Z',
      soldeALaCloture: 500000,
      mouvementsValeurAvantCloture: 0,
      encaissementsPosterieurs: 30000,
      decaissementsPosterieurs: 10000,
      mouvementsPosterieurs: 2,
      especesReconstitueesALaCloture: 499000,
    },
    compteApresLaCloture: true,
    reconstitutionManquante: false,
    coupures: [
      { valeurUnitaire: 20000, nombre: 25, total: 500000 },
      { valeurUnitaire: 1000, nombre: 19, total: 19000 },
    ],
    totalCoupures: 519000,
    attestation: null,
    observations: null,
    etabli: { le: '2027-01-10T00:00:00.000Z', par: 'chef@cabinet.cd' },
    mentions: ['Mention écrite par le serveur, reprise telle quelle.'],
  };

  it('compté après la clôture · la reconstitution figée, dans l’ordre de l’écran', () => {
    expect(lignesPvCaisse(base)).toEqual([
      ['Solde à la clôture du 31/12/2026', montant(500000)],
      ['+ Encaissements jusqu’au comptage (2 ligne(s) au total)', montant(30000)],
      ['− Paiements jusqu’au comptage', montant(10000)],
      ['Solde au livre-journal au jour du comptage', montant(520000)],
      ['Espèces comptées', montant(519000)],
      ['Espèces reconstituées à la clôture', montant(499000)],
      ['Écart', `${montant(-1000)} · manquant`],
    ]);
    expect(tableCoupures(base)?.lignes).toEqual([
      [montant(20000), '25', montant(500000)],
      [montant(1000), '19', montant(19000)],
      ['Total', '', montant(519000)],
    ]);
  });

  it('compté à la clôture, sans coupures · ni reconstitution ni tableau de coupures', () => {
    const e = { ...base, reconstitution: null, compteApresLaCloture: false, coupures: [], totalCoupures: null, ecart: 0, unite: 'USD' };
    expect(lignesPvCaisse(e)).toEqual([
      ['Solde au livre-journal au jour du comptage', `${montant(520000)} USD`],
      ['Espèces comptées', `${montant(519000)} USD`],
      ['Écart', `${montant(0)} USD · aucun écart`],
    ]);
    expect(tableCoupures(e)).toBeNull();
  });

  it('le composant pose les mentions servies et ne recalcule rien', () => {
    const source = readFileSync(join(__dirname, '../components/EditionsInventaire.tsx'), 'utf8');
    expect(source).toContain('<Mentions mentions={e.mentions} />');
    expect(source).not.toMatch(/mentionsDuPv|toFixed\(|toLocaleString\(/);
    // Les signatures restent des cases blanches · aucun nom n'y est écrit.
    expect(source).toContain('<div className="flex-1 h-7 border-b border-black" />');
  });
});

describe('la fenêtre Inventaire imprime l’édition, et elle seule', () => {
  const page = readFileSync(join(__dirname, '../pages/InventairePage.tsx'), 'utf8');

  it('`avec-edition` n’est posé que pendant qu’une édition existe, l’édition est un enfant direct', () => {
    expect(page).toContain("className={`p-2 ${edition ? 'avec-edition' : ''}`}");
    expect(page).toMatch(/\{edition && <EditionInventaireImprimee edition=\{edition\} \/>\}/);
    // L'en-tête porte l'exercice DE LA CAMPAGNE, pas celui du sélecteur.
    expect(page).toContain('exercice={edition?.campagne.exercice}');
    const composant = readFileSync(join(__dirname, '../components/EditionsInventaire.tsx'), 'utf8');
    expect(composant).toContain('<div className="impression-seul edition-inventaire');
  });

  it('les éditions sont des lectures · leurs boutons ne sont pas sous `peutEcrire`', () => {
    // Le bloc des deux boutons, découpé par ses balises (structure, jamais une
    // distance) · il ne lit pas `peutEcrire`, et le bloc qui le précède est
    // refermé (son parent direct est l'en-tête de la campagne).
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
    expect(page.slice(0, debut).trimEnd().endsWith('</div>')).toBe(true);
    expect(page).toContain("cheminEdition({ nature: 'PROCES_VERBAL_CAISSE', pvId })");
    expect(page).toContain("cheminEdition({ nature: 'FICHES_DE_COMPTAGE', campagneId: detail.id, sousCommissionId })");
  });
});
