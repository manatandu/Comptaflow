import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * DEUX CORRECTIONS SERVIES PAR L'API QUE NUL ÉCRAN NE LISAIT.
 *
 * L'agrégat du groupe élimine désormais les opérations réciproques au-delà du
 * seul compte 58, et la Note 3 du S.M.T ventile les créances et les dettes
 * entre échues et non échues. Les deux corrections vivaient entières dans la
 * charge utile de l'API : aucun écran ne les lisait, et le comptable
 * continuait de décider sans elles.
 *
 * L'AUDCIF art. 22, 1° exige des données qu'elles « puissent être restituées
 * sur papier ou sous une forme directement intelligible ». La seconde moitié
 * de la phrase est aussi normative que la première · un calcul juste qui
 * n'atteint pas un écran n'est pas livré.
 *
 * Ces restitutions vivent dans du JSX, qu'aucun lanceur du dépôt ne rend
 * (pas de jsdom, pas de bibliothèque de rendu). Rien ne les fait tomber sauf
 * une lecture des fichiers, d'où ce spec · même parti que
 * `portes-des-trois-donnees.spec.ts`. La logique, elle, est testée pour de
 * bon dans `controles-agregat-groupe.spec.ts` et `note3-echeances-smt.spec.ts`.
 */

const lire = (p: string) => readFileSync(join(__dirname, p), 'utf8');

describe('fenêtre du groupe · la forme du retour vient du serveur', () => {
  const page = lire('GroupePage.tsx');
  const types = lire('../lib/types.ts');

  it('lit le type partagé au lieu d’en redéclarer un sur place', () => {
    // L'écran portait sa propre interface, tronquée : elle ignorait six champs
    // sur onze, et rien ne pouvait le signaler puisqu'une interface plus
    // étroite compile parfaitement contre une réponse plus large.
    expect(page).toContain('BalanceAgregeeGroupe');
    expect(page).not.toContain('interface BalanceAgregee {');
  });

  it('décrit dans types.ts tout ce que balanceAgregee rend', () => {
    expect(types).toContain('export interface BalanceAgregeeGroupe');
    expect(types).toContain('eliminations: EliminationReciproqueGroupe[];');
    expect(types).toContain('totauxEliminations: { debit: number; credit: number };');
    expect(types).toContain('ecartsReciprocite: EcartReciprociteGroupe[];');
    expect(types).toContain('rattachementsRefuses: RattachementRefuseGroupe[];');
    expect(types).toContain('avertissements: string[];');
    expect(types).toContain('controles: ControlesAgregatGroupe;');
  });

  it('cite le fondement de l’élimination sur le type lui-même', () => {
    expect(types).toContain('élimination des comptes réciproques');
    expect(types).toContain('ch. XIII-4');
    expect(types).toContain('confirmation de solde');
  });
});

describe('fenêtre du groupe · ce que l’agrégat montre désormais', () => {
  const page = lire('GroupePage.tsx');

  it('affiche les six contrôles, montés par la fonction éprouvée', () => {
    expect(page).toContain('controlesDeLAgregat(agregat)');
    expect(page).toContain("CONTRÔLES DE L'AGRÉGAT");
  });

  it('montre CE QUI A ÉTÉ RETIRÉ, ligne à ligne, et son total', () => {
    // Un agrégat dont on ne voit pas ce qui a été retiré ne se vérifie pas :
    // agrégat = cumul des balances moins ces lignes.
    expect(page).toContain('agregat.eliminations.map(');
    expect(page).toContain('OPÉRATIONS RÉCIPROQUES ÉLIMINÉES');
    expect(page).toContain('montant(agregat.totauxEliminations.debit)');
    expect(page).toContain('montant(agregat.totauxEliminations.credit)');
    // Le libellé ne promet la déduction que lorsqu'il y a eu élimination · un
    // groupe sans tiers-cellule lit exactement ce qu'il lisait hier.
    expect(page).toContain("agregat.eliminations.length > 0 ? 'TOTAL AGRÉGÉ, ÉLIMINATIONS DÉDUITES' : 'TOTAL AGRÉGÉ'");
  });

  it('affiche l’écart de réciprocité AVEC LES DEUX SOLDES qui divergent', () => {
    // Le seul écart ne dit pas lequel des deux dossiers a enregistré · les
    // deux soldes le disent, et le logiciel ne tranche pas.
    expect(page).toContain('agregat.ecartsReciprocite.map(');
    expect(page).toContain('ÉCARTS DE RÉCIPROCITÉ');
    expect(page).toContain('montant(e.solde)');
    expect(page).toContain('montant(e.soldeContrepartie)');
    expect(page).toContain("d'un seul côté, ou pour deux montants différents");
  });

  it('nomme les rattachements ignorés et dit que rien n’a été éliminé sur leur foi', () => {
    expect(page).toContain('agregat.rattachementsRefuses.map(');
    expect(page).toContain('RATTACHEMENTS IGNORÉS');
    expect(page).toContain("Rien n'a été éliminé sur leur foi");
  });

  it('sort les avertissements du D4C que l’agrégat ne sait pas calculer', () => {
    // Cession interne d'immobilisation et marge interne en stock · le service
    // avertit au lieu d'inventer, encore faut-il que l'avertissement se lise.
    expect(page).toContain('agregat?.avertissements.map(');
  });
});

describe('Note 3 du S.M.T · la ventilation par échéance atteint l’écran', () => {
  const page = lire('EtatsSmtPage.tsx');
  const types = lire('../lib/types.ts');

  it('garde le titre officiel de la maquette', () => {
    // SYCEBNL, Partie 4, ch. 4, section 3 · « ETAT DES CREANCES ET DES DETTES
    // NON ECHUES ». Le titre n'est pas négociable, c'est le contenu qui doit
    // le rejoindre.
    expect(page).toContain('NOTE 3 · ÉTAT DES CRÉANCES ET DES DETTES NON ÉCHUES');
  });

  it('ventile chaque ligne, au lieu d’un seul solde sous ce titre', () => {
    expect(page).toContain('montant(l.montantNonEchu)');
    expect(page).toContain('montant(l.montantEchu)');
    expect(page).toContain('montant(l.montantNonVentile)');
    expect(page).toContain('DONT NON ÉCHU');
    expect(page).toContain('DONT ÉCHU');
  });

  it('totalise les trois parts, colonne par colonne', () => {
    // Les trois totaux doivent être RENDUS, pas seulement lus : une ligne
    // TOTAL qui ne porte que le solde entier remet sous le titre « non
    // échues » le total mêlé que la ventilation venait de défaire.
    expect(page).toContain('{montant(totalNonEchu)}');
    expect(page).toContain('{montant(totalEchu)}');
    expect(page).toContain('{montant(totalNonDate)}');
    expect(page).toContain('notes.note3.totalCreancesNonEchues');
    expect(page).toContain('notes.note3.totalCreancesEchues');
    expect(page).toContain('notes.note3.totalCreancesNonVentilees');
    expect(page).toContain('notes.note3.totalDettesNonEchues');
    expect(page).toContain('notes.note3.totalDettesEchues');
    expect(page).toContain('notes.note3.totalDettesNonVentilees');
  });

  it('dit que la colonne officielle reste le solde ENTIER', () => {
    // La ventilation s'ajoute à la maquette, elle ne l'ampute pas : la note
    // justifie les postes GC et HD du bilan, pris sur le solde.
    expect(page).toContain('porte le solde ENTIER du compte');
    expect(page).toContain('Les trois parts la totalisent toujours');
  });

  it('sert la part non datée par la fonction éprouvée, en tête de la note', () => {
    // Aucun dossier ne saisit encore les échéances : c'est la première chose
    // que tous liront, et elle passe AVANT les tableaux.
    expect(page).toContain('lacuneEcheancesNote3(notes.note3)');
    expect(page).toContain('ÉCHÉANCES NON RENSEIGNÉES');
    expect(page).toContain('lacuneEcheances.phrase');
    expect(page).toContain('lacuneEcheances.geste');
    expect(page).toContain('lacuneEcheances.resteNegatif');
    expect(page.indexOf('ÉCHÉANCES NON RENSEIGNÉES')).toBeLessThan(page.indexOf('DONT NON ÉCHU'));
  });

  it('sépare la part non datée des deux parts mesurées, jusque dans le type', () => {
    expect(types).toContain('montantNonEchu: number;');
    expect(types).toContain('montantEchu: number;');
    expect(types).toContain('montantNonVentile: number;');
    expect(types).toContain('echeancesTenues: boolean;');
    expect(types).toContain('art. 15 al. 3');
  });
});

/**
 * LE JUMEAU SYSCOHADA · le même titre, la même exigence, et un écran qui
 * l'affirmait encore sur un total mêlé.
 *
 * Les deux référentiels ont chacun leur Note 3, et les deux textes portent le
 * MÊME intitulé : « État des créances et des dettes non échues au 31 décembre »
 * (AUDCIF, Titre X, ch. 3, ligne 150 · maquette SYCEBNL, Partie 4, ch. 4). La
 * correction du moteur a été faite des deux côtés, mais un seul écran l'a
 * reçue : celui du SYSCOHADA continuait d'imprimer le titre au-dessus d'un
 * solde entier, ce qui est la forme la plus littérale du défaut de restitution
 * de l'AUDCIF art. 22, 1°.
 *
 * Ces assertions valent pour les DEUX pages, et c'est le point : une parité de
 * texte doit se traduire par une parité d'écran, sans quoi un cabinet qui tient
 * les deux référentiels lit deux vérités différentes sous le même titre.
 */
describe('Note 3 du S.M.T · parité des deux écrans', () => {
  const PAGES = ['EtatsSmtPage.tsx', 'EtatsSmtSyscohadaPage.tsx'] as const;

  it('les deux écrans ventilent, aucun ne se contente du solde entier', () => {
    for (const nom of PAGES) {
      const s = lire(nom);
      for (const champ of ['montantNonEchu', 'montantEchu', 'montantNonVentile']) {
        expect(`${nom} · ${champ}: ${s.includes(champ) ? 'rendu' : 'ABSENT'}`).toBe(`${nom} · ${champ}: rendu`);
      }
    }
  });

  it('les deux écrans nomment la part non datée pour ce qu’elle est', () => {
    for (const nom of PAGES) {
      const s = lire(nom);
      expect(`${nom}`).toBe(`${nom}`);
      expect(s).toContain('NON DATÉ');
      // Une part non datée qui compte doit se voir · elle est un signal de
      // tenue, pas une colonne de plus.
      expect(s).toContain('text-warning');
    }
  });

  it('les deux écrans disent que la colonne officielle reste le solde ENTIER', () => {
    for (const nom of PAGES) {
      const s = lire(nom);
      expect(s).toContain('solde ENTIER');
      expect(s).toContain('motifEcheances');
    }
  });

  it('les deux écrans totalisent les trois parts sous chaque tableau', () => {
    for (const nom of PAGES) {
      const s = lire(nom);
      for (const total of ['NonEchues', 'Echues', 'NonVentilees']) {
        expect(`${nom} · total${total}`).toBe(
          s.includes(`Creances${total}`) && s.includes(`Dettes${total}`) ? `${nom} · total${total}` : `${nom} · MANQUANT`,
        );
      }
    }
  });
});
