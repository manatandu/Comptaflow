import { NOTES_ASSOCIATIONS } from './correspondance-notes-associations';
import {
  POSTES_ACTIF,
  POSTES_PASSIF,
  TOTAUX_ACTIF,
  TOTAUX_PASSIF,
} from '../etats-financiers/correspondance-bilan';
import { TOUS_LES_POSTES as POSTES_CR } from '../etats-financiers/correspondance-compte-resultat';
import { PLAN_COMPTES_SYCEBNL } from '../comptes/compte-seed';
import type { SpecificationNote } from './note-annexe.types';

/**
 * RECOUPEMENT NOTE ↔ POSTE · SYCEBNL, jeu associations.
 *
 * L'article 15 de l'Acte uniforme veut que « les Notes annexes soient
 * organisées par une référence croisée avec l'information liée ». Chaque poste
 * du bilan et du compte de résultat porte donc, dans la colonne « Note » de la
 * maquette, le numéro de la note qui le détaille · et chaque note doit savoir
 * d'où elle est renvoyée.
 *
 * Ce balayage, passé côté SYSCOHADA, ne l'avait jamais été côté SYCEBNL. Il a
 * trouvé, le 2026-09-02, que VINGT-CINQ des trente-deux renvois étaient faux,
 * dont SEIZE pointant vers des codes qui n'existent PAS dans le modèle SYCEBNL
 * des associations · AP, BH, DJ, DK, DL, DM, DN, TQ, TR, TS, TT, UD, UF, UG,
 * UH, UI. Ce sont des codes du modèle SYSCOHADA. Le reste était décalé d'un
 * cran dans la série T (note 25 renvoyée depuis TH « Impôts et taxes » au lieu
 * de TF « Transports », et ainsi de suite jusqu'à la note 29A).
 *
 * CE QUE CE DÉFAUT NE TOUCHAIT PAS, et il faut le dire : les RUBRIQUES, donc
 * les montants. Le balayage le montre · la note 25 captait bien les comptes 61
 * de transport, elle disait seulement venir du mauvais poste. Le défaut était
 * de RÉFÉRENCE CROISÉE, pas de calcul. Mais `renvoyeeDepuis` est montré au
 * lecteur : il cherchait « BH » au bilan SYCEBNL, où ce code n'existe pas.
 *
 * Deux gardes, donc. La première : tout renvoi doit désigner un code réel du
 * modèle. La seconde : la table complète, transcrite de la colonne « Note »
 * des maquettes officielles (partie4-ch2, sections 1 et 2).
 */

/** La colonne « Note » des deux maquettes, transcrite note par note. */
const RENVOIS_OFFICIELS: Record<string, string[]> = {
  // Bilan · actif
  '5A': ['AA', 'AD', 'AH'],
  '5F': ['AE', 'CE'],
  '6': ['AO'],
  '8': ['BB', 'TB', 'TE'],
  '10': ['BE'],
  '11': ['BU'],
  '12': ['BV'],
  '13': ['BW'],
  '14': ['BY', 'DY'],
  '19': ['BC', 'DH'],
  // Bilan · passif
  '15': ['CA', 'CB', 'CC', 'CD'],
  '16': ['CF', 'CG'],
  '17A': ['CI', 'CJ'],
  '17B': ['CW', 'CX'],
  '18A': ['DA', 'DB', 'DC'],
  '20': ['DI'],
  '21': ['DI'],
  '22': ['DW'],
  // Compte de résultat
  '23': ['RA', 'RB', 'RC', 'RD', 'RE', 'RF', 'RG'],
  '24': ['TA', 'TC', 'TD'],
  '25': ['TF'],
  '26': ['TG'],
  '27': ['TH'],
  '28': ['TI'],
  '29A': ['TJ'],
  '31': ['TK'],
  '32': ['TM', 'TN'],
  '5D': ['RH', 'TL'],
  '30': ['RH', 'TL'],
};

/** Codes REF qui existent réellement dans le modèle SYCEBNL des associations. */
const REFS_DU_MODELE = new Set<string>([
  ...POSTES_ACTIF.map((p) => p.ref),
  ...POSTES_PASSIF.map((p) => p.ref),
  ...TOTAUX_ACTIF.map((t) => t.ref),
  ...TOTAUX_PASSIF.map((t) => t.ref),
  ...POSTES_CR.map((p) => p.ref),
  // Le résultat net et les soldes du compte de résultat, calculés hors table.
  'CH',
  'XA',
  'XB',
  'XC',
  'XD',
  'XE',
]);

const COMPTES_SEMIS = PLAN_COMPTES_SYCEBNL.filter((c) => c.typeCompte !== 'TOTAL').map((c) => c.numero);

function capte(o: { comptes?: string[]; exclusions?: string[] }, n: string): boolean {
  return (o.comptes ?? []).some((p) => n.startsWith(p)) && !(o.exclusions ?? []).some((e) => n.startsWith(e));
}

function etiquette(n: SpecificationNote): string {
  return n.sousTableau ? `${n.code}/${n.sousTableau}` : n.code;
}

describe('SYCEBNL · référence croisée note ↔ poste (art. 15)', () => {
  it('aucun renvoi ne désigne un code absent du modèle SYCEBNL', () => {
    // C'est LA garde contre la contamination par l'autre référentiel : seize
    // renvois pointaient vers des codes du modèle SYSCOHADA. Le lecteur les
    // cherchait au bilan SYCEBNL et ne les trouvait pas.
    const inconnus: string[] = [];
    for (const n of NOTES_ASSOCIATIONS) {
      for (const ref of n.renvoyeeDepuis ?? []) {
        if (!REFS_DU_MODELE.has(ref)) inconnus.push(`${etiquette(n)} -> ${ref}`);
      }
    }
    expect(inconnus).toEqual([]);
  });

  it('chaque note renvoyée l’est depuis les postes que la maquette lui donne', () => {
    for (const [code, attendus] of Object.entries(RENVOIS_OFFICIELS)) {
      const notes = NOTES_ASSOCIATIONS.filter((n) => n.code === code);
      expect([code, notes.length > 0]).toEqual([code, true]);
      // Sur une note à plusieurs sous-tableaux, le renvoi est porté par celui
      // qui documente le poste · la réunion des sous-tableaux doit couvrir la
      // liste officielle, sans y ajouter.
      const declares = new Set(notes.flatMap((n) => n.renvoyeeDepuis ?? []));
      for (const ref of attendus) {
        expect([code, ref, declares.has(ref)]).toEqual([code, ref, true]);
      }
      for (const ref of declares) {
        expect([code, ref, attendus.includes(ref)]).toEqual([code, ref, true]);
      }
    }
  });

  it('les sous-tableaux 5B et 5E ne portent AUCUN renvoi · le texte ne leur en donne pas', () => {
    // La maquette renvoie « 5 » depuis AA, AD et AH, sans distinguer les
    // sous-tableaux, et nomme explicitement 5D et 5F ailleurs. Attribuer un
    // renvoi à 5B ou 5E inventerait une référence croisée · c'est ce que
    // faisait la table, avec neuf postes chacun.
    for (const code of ['5B', '5E']) {
      const notes = NOTES_ASSOCIATIONS.filter((n) => n.code === code);
      expect([code, notes.length > 0]).toEqual([code, true]);
      for (const n of notes) expect([code, n.renvoyeeDepuis ?? []]).toEqual([code, []]);
    }
  });

  it('un poste ne renvoie jamais vers deux notes qui se contrediraient', () => {
    // DI « Autres dettes » renvoie vers 20 ET 21 · le texte l'écrit
    // (« 20 & 21 »), et les deux notes se partagent le poste. C'est le seul
    // cas, et il est voulu : le vérifier empêche qu'un renvoi soit dupliqué
    // par inadvertance ailleurs.
    const parPoste = new Map<string, string[]>();
    for (const [code, refs] of Object.entries(RENVOIS_OFFICIELS)) {
      for (const ref of refs) parPoste.set(ref, [...(parPoste.get(ref) ?? []), code]);
    }
    const partages = [...parPoste]
      .filter(([, codes]) => codes.length > 1)
      .map(([ref, codes]) => `${ref}:${[...codes].sort().join(',')}`);
    expect(partages.sort()).toEqual(['DI:20,21', 'RH:30,5D', 'TL:30,5D']);
  });
});

describe('SYCEBNL · les comptes d’une note et ceux de son poste', () => {
  /**
   * Le balayage se fait par COMPOSANTE, pas par note ni par poste. Une note peut
   * être renvoyée depuis plusieurs postes (la note 23 depuis RA jusqu'à RG) et un
   * poste peut être documenté par plusieurs notes (DI par les notes 20 et 21).
   * Compter par note, ou par poste, fait apparaître deux fois le même écart :
   * balayé par poste, chacun des sept postes de la note 23 déclare « hors poste »
   * les comptes des six autres. On réunit donc les notes et les postes qui se
   * tiennent, et on compare les deux réunions.
   *
   * Les écarts ne sont PAS tous des défauts, et c'est pourquoi ce test les mesure
   * plutôt que de les interdire. Les trois plus gros sont structurels et tiennent
   * au texte officiel lui-même :
   *
   *  - [5D, 30] <- RH, TL · la note 5D est le tableau des AMORTISSEMENTS (comptes
   *    28 et 29), renvoyée depuis des postes du compte de résultat qui portent les
   *    DOTATIONS (comptes 68 et 69). Les deux faces d'une même opération, jamais
   *    les mêmes comptes ;
   *  - [5F] <- AE, CE · même dissymétrie sur les dépréciations ;
   *  - [20, 21] <- DI · les notes 20 « Dettes fiscales et sociales » et 21 ne
   *    couvrent pas toute l'étendue du poste « Autres dettes », qui ramasse aussi
   *    les comptes 42, 45 et 47 que ces deux notes ne détaillent pas.
   *
   * Ce que le test verrouille est le TOTAL. Un chiffre qui monte veut dire qu'un
   * compte a cessé d'être rattaché quelque part.
   */
  it('le volume des écarts poste ↔ note reste sous contrôle', () => {
    const postes = new Map<string, { comptes?: string[]; exclusions?: string[]; comptesAmortissement?: string[] }>();
    for (const p of [...POSTES_ACTIF, ...POSTES_PASSIF]) postes.set(p.ref, p);
    for (const p of POSTES_CR) postes.set(p.ref, p);

    // Composantes connexes du graphe biparti note <-> poste, par union-find.
    const parent = new Map<string, string>();
    const racine = (x: string): string => {
      const p = parent.get(x);
      if (!p || p === x) {
        parent.set(x, x);
        return x;
      }
      const r = racine(p);
      parent.set(x, r);
      return r;
    };
    const relier = (a: string, b: string) => parent.set(racine(a), racine(b));

    const notes = NOTES_ASSOCIATIONS.filter(
      (n) => !n.horsBalance && (n.renvoyeeDepuis ?? []).some((r) => postes.has(r)),
    );
    for (const n of notes) {
      const cle = `N:${etiquette(n)}`;
      racine(cle);
      for (const ref of n.renvoyeeDepuis ?? []) if (postes.has(ref)) relier(cle, `P:${ref}`);
    }

    const composantes = new Map<string, { notes: SpecificationNote[]; refs: string[] }>();
    for (const n of notes) {
      const g = racine(`N:${etiquette(n)}`);
      const e = composantes.get(g) ?? { notes: [], refs: [] };
      e.notes.push(n);
      composantes.set(g, e);
    }
    for (const ref of postes.keys()) {
      if (!parent.has(`P:${ref}`)) continue;
      composantes.get(racine(`P:${ref}`))?.refs.push(ref);
    }

    let horsPoste = 0;
    let sansLigne = 0;
    for (const { notes: groupe, refs } of composantes.values()) {
      const auxPostes = new Set(
        COMPTES_SEMIS.filter((num) =>
          refs.some((r) => {
            const p = postes.get(r)!;
            return capte(p, num) || capte({ comptes: p.comptesAmortissement }, num);
          }),
        ),
      );
      const rubriques = groupe.flatMap((n) => n.rubriques).filter((r) => (r.comptes ?? []).length > 0);
      const dansNotes = new Set(COMPTES_SEMIS.filter((num) => rubriques.some((r) => capte(r, num))));
      horsPoste += [...dansNotes].filter((x) => !auxPostes.has(x)).length;
      sansLigne += [...auxPostes].filter((x) => !dansNotes.has(x)).length;
    }
    // Relevé du 2026-09-02, une fois les trente-deux renvois remis d'aplomb. Ces
    // écarts sont ceux que le référentiel porte lui-même · ils sont mesurés, pas
    // approuvés.
    expect({ horsPoste, sansLigne }).toEqual({ horsPoste: 165, sansLigne: 119 });
  });

  it('le nombre de comptes qu’aucune note ne chiffre reste sous contrôle', () => {
    // Trouvé par le même balayage : 47 comptes du plan semé n'apparaissent dans
    // la rubrique d'aucune note. Une partie est normale · le résultat de
    // l'exercice (131, 139) se lit au bilan, les virements internes (585, 588)
    // se soldent en cours d'exercice. Le reste est de la matière pour la suite
    // (cessions 81 et 82, dotations 681 et 691, reprises 79). Le chiffre est
    // gelé ici pour qu'aucun compte ne le rejoigne en silence.
    const rubriques = NOTES_ASSOCIATIONS.filter((n) => !n.horsBalance)
      .flatMap((n) => n.rubriques)
      .filter((r) => (r.comptes ?? []).length > 0);
    const orphelins = COMPTES_SEMIS.filter((num) => !rubriques.some((r) => capte(r, num)));
    expect(orphelins.length).toBe(47);
  });
});
