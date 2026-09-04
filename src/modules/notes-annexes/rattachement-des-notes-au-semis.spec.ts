import { PLAN_COMPTES_SYCEBNL } from '../comptes/compte-seed';
import { correspond } from '../etats-financiers/etats-financiers.communs';
import { POSTES_CHARGES } from '../etats-financiers/correspondance-compte-resultat';
import { NOTES_ASSOCIATIONS } from './correspondance-notes-associations';
import { NOTES_PROJETS } from './correspondance-notes-projets';
import { etiquette } from './notes-sycebnl.commun';
import type { SpecificationNote } from './note-annexe.types';

/**
 * LE PRÉFIXE D'UNE NOTE ATTEINT-IL VRAIMENT UN COMPTE DU SEMIS ?
 *
 * Les deux tables de notes SYCEBNL portent déjà un contrôle « les comptes
 * cités existent vraiment » (`correspondance-notes-*.spec.ts`). Il s'appuie
 * sur `compteSeme`, qui compare DANS LES DEUX SENS · `n.startsWith(prefixe)
 * || prefixe.startsWith(n)`. Cette tolérance est voulue là où elle est : elle
 * empêche de rejeter un préfixe court comme `52` sur un plan complété à huit
 * chiffres.
 *
 * Mais LE CALCUL, LUI, NE TOLÈRE RIEN. `NoteAnnexeService.calculerRubrique`
 * appelle `correspond` (`etats-financiers.communs.ts`), qui ne va que dans un
 * sens : `numero.startsWith(prefixe)`. Un préfixe PLUS LONG que le compte semé
 * passe donc le contrôle et ne capte rien · `'65100000'.startsWith('6512')`
 * est faux. La garde valide un rattachement que le moteur rejette, et la
 * rubrique sort à zéro sans que rien ne soit levé.
 *
 * Ce balayage referme l'écart : il applique la règle DU CALCUL aux préfixes
 * des deux tables, et gèle nommément ce qui ne joint pas. Un préfixe mort
 * n'est pas toujours une faute de transcription · le plus souvent, c'est le
 * SEMIS qui s'arrête au divisionnaire là où le texte descend au sous-compte.
 * Dans les deux cas la note publie un zéro faux, et dans les deux cas le
 * silence est le vrai défaut.
 */

const COMPTES_DETAIL_SEMES = PLAN_COMPTES_SYCEBNL.filter((c) => c.typeCompte !== 'TOTAL').map((c) => c.numero);

/** Le préfixe atteint-il au moins un compte Détail semé, AU SENS DU CALCUL ? */
function atteintUnCompteSeme(prefixe: string): boolean {
  return COMPTES_DETAIL_SEMES.some((numero) => correspond(numero, [prefixe]));
}

function prefixesMorts(table: SpecificationNote[]): string[] {
  const morts = new Set<string>();
  for (const n of table) {
    for (const r of n.rubriques) {
      for (const p of r.comptes ?? []) if (!atteintUnCompteSeme(p)) morts.add(p);
    }
  }
  return [...morts].sort();
}

function rubriquesMortes(table: SpecificationNote[]): string[] {
  const morts: string[] = [];
  for (const n of table) {
    for (const r of n.rubriques) {
      const cites = r.comptes ?? [];
      if (cites.length > 0 && cites.every((p) => !atteintUnCompteSeme(p))) {
        morts.push(`${etiquette(n)} · ${r.libelle} · [${cites.join(', ')}]`);
      }
    }
  }
  return morts.sort();
}

describe('SYCEBNL · un préfixe de note qui ne joint aucun compte semé', () => {
  /*
   * RELEVÉ GELÉ. Chaque entrée est un défaut CONNU, pas un cas admis : la
   * liste est là pour qu'aucun autre ne la rejoigne en silence, et pour que
   * celle-ci se vide au fur et à mesure des corrections.
   *
   *  · 6511 / 6512 / 6515 et 6641 / 6642 · LE SEMIS MANQUE, pas les notes.
   *    Le texte ouvre bien ces sous-comptes (Partie 2, ch. 3 · compte 65 :
   *    « 651 Pertes sur créances adhérents clients et autres débiteurs (6511
   *    Clients - usagers, 6512 Adhérents, 6515 Autres débiteurs) » · compte
   *    66 : « 664 Charges sociales (6641 Charges sociales sur rémunération du
   *    personnel national, 6642 Charges sociales sur rémunération du personnel
   *    non national) »), et les maquettes des notes 28 et 29A (associations)
   *    comme 19 et 20A (projets) séparent les rubriques exactement là. C'est
   *    `compte-seed.ts` qui s'arrête au divisionnaire · il n'ouvre que
   *    65100000 et 66400000. Les rubriques sont donc JUSTES et ne doivent PAS
   *    être rabattues sur '651' ou '664' : ce serait ranger d'office des
   *    pertes indifférenciées chez les adhérents, et des charges sociales
   *    indifférenciées chez le personnel national. Le texte ne le dit nulle
   *    part, et une note annexe n'est pas l'endroit où le deviner.
   *
   *  · 832 et 842 (notes 32 et 23) · préfixes morts VOULUS, et les seuls. Le
   *    référentiel numérote les subdivisions du 832 en 8311 / 8315, c'est-à-dire
   *    dans la plage du 831 (anomalie signalée sur place dans les deux tables) ;
   *    les rubriques citent donc 832 ET 8311 / 8315, de sorte qu'elles restent
   *    chiffrées sur le semis d'aujourd'hui et le resteraient sur un dossier
   *    qui ouvrirait un vrai 832. Même construction au 842. Ils figurent ici
   *    parce que le balayage les voit, pas parce qu'ils sont fautifs.
   *
   *  · 417 (note 9 · « Adhérents, créances litigieuses ou douteuses ») ·
   *    relevé par ce balayage, HORS du périmètre corrigé ici, et signalé tel
   *    quel. Le plan ne connaît pas de compte 417 (Partie 2, ch. 3, compte 41 :
   *    « 411 Adhérents ; 412 Clients-usagers ; 413 Adhérents clients-usagers,
   *    chèques, effets et autres valeurs impayés […] ; 416 Créances adhérents,
   *    clients-usagers litigieuses ou douteuses ; 418 […] ; 419 […] »), et la
   *    rubrique voisine « chèques, effets et autres valeurs impayés » cite 416
   *    quand le texte l'attribue au 413. Les deux lignes paraissent décalées
   *    d'un cran. Ce n'est PAS corrigé ici · l'écart traité dans ce fichier
   *    porte sur les notes 28 et 29A, et une correction de rattachement se
   *    fait contre le texte, pas par ressemblance avec un défaut voisin.
   */
  const MORTS_ASSOCIATIONS = ['417', '6511', '6512', '6515', '6641', '6642', '832', '842'];
  const MORTS_PROJETS = ['6511', '6515', '6641', '6642', '832', '842'];

  it('jeu associations · la liste des préfixes qui ne joignent rien ne s’allonge pas', () => {
    expect(prefixesMorts(NOTES_ASSOCIATIONS)).toEqual(MORTS_ASSOCIATIONS);
  });

  it('jeu projets de développement · même relevé, gelé lui aussi', () => {
    expect(prefixesMorts(NOTES_PROJETS)).toEqual(MORTS_PROJETS);
  });

  it('les rubriques qu’aucun compte semé ne peut chiffrer sont nommées, une à une', () => {
    // La liste des PRÉFIXES ne dit pas combien de lignes de note sortent à
    // zéro : une rubrique qui cite deux préfixes morts ne compte qu'une fois,
    // et une rubrique dont un seul préfixe sur deux est mort reste chiffrée.
    // Ce sont ces lignes-là que le réviseur lit, d'où le relevé nominatif.
    expect(rubriquesMortes(NOTES_ASSOCIATIONS)).toEqual([
      '28 · Pertes sur Clients et autres débiteurs · [6511, 6515]',
      '28 · Pertes sur créances adhérents · [6512]',
      '29A · Charges sociales (personnel national) · [6641]',
      '29A · Charges sociales (personnel non national) · [6642]',
      '9 · Adhérents, créances litigieuses ou douteuses · [417]',
    ]);
    expect(rubriquesMortes(NOTES_PROJETS)).toEqual([
      '19 · Pertes sur autres débiteurs · [6515]',
      '19 · Pertes sur créances · [6511]',
      '20A · Charges sociales (personnel national) · [6641]',
      '20A · Charges sociales (personnel non national) · [6642]',
    ]);
  });
});

describe('SYCEBNL · les comptes 65 et 66 semés que les notes 28 et 29A perdent', () => {
  it('la note contredit le poste du compte de résultat qu’elle détaille', () => {
    // LE DÉFAUT DANS SA FORME LA PLUS PARLANTE. Le compte de résultat prend
    // TOUT le 65 en TI « Autres charges » et TOUT le 66 en TJ « Charges de
    // personnel » (`correspondance-compte-resultat.ts`, maquette Partie 4,
    // ch. 2). Les notes 28 et 29A se déclarent renvoyées depuis ces deux
    // postes (art. 15, référence croisée). Une charge portée au seul compte
    // que le semis ouvre est donc COMPTÉE au compte de résultat et PERDUE
    // dans la note qui prétend le détailler · un écart qu'aucun total ne
    // signale, puisque le TOTAL de la note est la somme de ses propres
    // rubriques, toutes vides.
    const rubriques = [...NOTES_ASSOCIATIONS, ...NOTES_PROJETS]
      .filter((n) => !n.horsBalance)
      .flatMap((n) => n.rubriques)
      .filter((r) => (r.comptes ?? []).length > 0);

    const perdus = COMPTES_DETAIL_SEMES.filter(
      (numero) =>
        /^6[56]/.test(numero) && !rubriques.some((r) => correspond(numero, r.comptes!, r.exclusions)),
    );
    // Relevé gelé · 65100000 « Pertes sur créances adhérents/clients-usagers
    // et autres débiteurs » et 66400000 « Charges sociales », les deux comptes
    // que `compte-seed.ts` ouvre au divisionnaire au lieu des sous-comptes du
    // texte. Cette liste doit se VIDER, jamais s'allonger.
    expect(perdus).toEqual(['65100000', '66400000']);

    // Et la contrepartie : ces mêmes comptes sont bien pris par TI et TJ.
    const poste = (ref: string) => POSTES_CHARGES.find((p) => p.ref === ref)!;
    for (const numero of perdus) {
      const pris = ['TI', 'TJ'].some((ref) => correspond(numero, poste(ref).comptes ?? []));
      expect({ numero, prisAuCompteDeResultat: pris }).toEqual({ numero, prisAuCompteDeResultat: true });
    }
  });
});

describe('SYCEBNL · les rubriques des notes 28, 29A, 19 et 20A restent celles du texte', () => {
  /**
   * GEL DE TRANSCRIPTION. La tentation, devant les quatre rubriques qui
   * sortent à zéro, est de les rabattre sur '651' et '664' pour « que ça
   * tombe quelque part ». Ce serait inventer une ventilation que ni la
   * maquette ni le plan ne donnent · les deux lignes de la note 28 séparent
   * les adhérents (6512) des clients-usagers et autres débiteurs (6511,
   * 6515), et celles de la note 29A séparent le personnel national (6641) du
   * personnel non national (6642). Un solde porté au compte indifférencié ne
   * dit ni l'un ni l'autre. Tant que le semis n'ouvre pas les sous-comptes,
   * la voie ouverte au dossier est le rattachement propre (`RattachementNote`)
   * ou la création de ses sous-comptes · pas une répartition d'office.
   */
  const attendu = (table: SpecificationNote[], code: string) =>
    table
      .filter((n) => n.code === code)
      .flatMap((n) => n.rubriques)
      .filter((r) => (r.comptes ?? []).length > 0)
      .map((r) => [r.libelle, (r.comptes ?? []).join('+')] as [string, string]);

  it('note 28 · deux lignes, deux sous-comptes du 651, transcrits du texte', () => {
    expect(attendu(NOTES_ASSOCIATIONS, '28').slice(0, 2)).toEqual([
      ['Pertes sur créances adhérents', '6512'],
      ['Pertes sur Clients et autres débiteurs', '6511+6515'],
    ]);
  });

  it('note 29A · les charges sociales restent ventilées national / non national', () => {
    const lignes = new Map(attendu(NOTES_ASSOCIATIONS, '29A'));
    expect(lignes.get('Charges sociales (personnel national)')).toBe('6641');
    expect(lignes.get('Charges sociales (personnel non national)')).toBe('6642');
  });

  it('jeu projets · notes 19 et 20A, même exigence', () => {
    const n19 = new Map(attendu(NOTES_PROJETS, '19'));
    expect(n19.get('Pertes sur créances')).toBe('6511');
    expect(n19.get('Pertes sur autres débiteurs')).toBe('6515');
    const n20a = new Map(attendu(NOTES_PROJETS, '20A'));
    expect(n20a.get('Charges sociales (personnel national)')).toBe('6641');
    expect(n20a.get('Charges sociales (personnel non national)')).toBe('6642');
  });
});
