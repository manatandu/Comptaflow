import { NOTES_PROJETS } from './correspondance-notes-projets';
import { POSTES_ACTIF, POSTES_PASSIF, PosteBilanProjetDeBase } from '../etats-financiers/correspondance-projet-bilan';
import { TOUS_LES_POSTES as POSTES_CE } from '../etats-financiers/correspondance-projet-compte-exploitation';
import { CLE_ETAFI_PAR_CLE_PROJET, NOTE_PAR_CLE_PROJETS } from '../exports/etat-etafi';
import { PLAN_COMPTES_SYCEBNL } from '../comptes/compte-seed';
import type { RubriqueNote } from './note-annexe.types';

/**
 * RECOUPEMENT NOTE ↔ POSTE · SYCEBNL, jeu projets de développement.
 *
 * Pendant de `recoupement-notes-postes.spec.ts`, qui ne balaie que les
 * associations (passe R6, D7). Aucun balayage ne confrontait les notes des
 * projets aux postes du bilan et du compte d'exploitation de ce jeu : un
 * compte pris par un poste et chiffré par aucune ligne de la note qui le
 * détaille (art. 15, référence croisée) passait sans bruit.
 *
 * Les postes et les notes se rejoignent par la colonne Note de la liasse
 * (`NOTE_PAR_CLE_PROJETS`), indexée par CLÉ · c'est ce qui départage les deux
 * TJ et les deux TK du modèle. Le sens est lu comme au calcul : un poste
 * « soldes débiteurs » (BE) ou « soldes créditeurs » (DH) ne prend un compte
 * que dans ce sens, BW cède au passif (DW) les 52 et 53 créditeurs, et une
 * rubrique DEBITEUR ou CREDITEUR ne chiffre qu'un sens.
 *
 * Les écarts sont, pour l'essentiel, des lacunes du modèle de note officiel,
 * pas des erreurs de transcription. Ils sont GELÉS NOMMÉMENT, pour qu'un
 * compte qui rejoint la liste soit nommé, et chaque note concernée le dit au
 * lecteur (`precisionEditeur`).
 */

type Sens = 'D' | 'C';
const COMPTES_SEMIS = PLAN_COMPTES_SYCEBNL.filter((c) => c.typeCompte !== 'TOTAL').map((c) => c.numero);
const capte = (o: { comptes?: string[]; exclusions?: string[] }, n: string) =>
  (o.comptes ?? []).some((p) => n.startsWith(p)) && !(o.exclusions ?? []).some((e) => n.startsWith(e));

function sensDuPoste(p: PosteBilanProjetDeBase, n: string): Sens[] {
  if (p.ref === 'DW' && ['52', '53'].some((x) => n.startsWith(x))) return ['C'];
  if (!capte(p, n)) return [];
  if ((p.comptesTransferesSiCrediteur ?? []).some((x) => n.startsWith(x))) return ['D'];
  if (p.sens_qualificatif === 'DEBITEUR') return ['D'];
  if (p.sens_qualificatif === 'CREDITEUR') return ['C'];
  return ['D', 'C'];
}
function sensDeLaRubrique(r: RubriqueNote, n: string): Sens[] {
  if (!capte(r, n)) return [];
  if (r.sens === 'DEBITEUR') return ['D'];
  if (r.sens === 'CREDITEUR') return ['C'];
  return ['D', 'C'];
}

/** Clé de la liasse → captation (numéro, sens). */
const POSTES = new Map<string, (n: string) => Sens[]>();
for (const p of [...POSTES_ACTIF, ...POSTES_PASSIF]) POSTES.set(p.ref, (n) => sensDuPoste(p, n));
POSTES.set('DW', (n) => sensDuPoste(POSTES_PASSIF.find((p) => p.ref === 'DW')!, n));
for (const p of POSTES_CE) {
  POSTES.set(CLE_ETAFI_PAR_CLE_PROJET[p.cle] ?? p.cle, (n) => (capte(p, n) ? ['D', 'C'] : []));
}

/** Par note : les comptes qu'un poste qui la renvoie prend, et qu'aucune de ses lignes chiffrées ne reprend. */
function ecartsParNote(): Record<string, string[]> {
  const resultat: Record<string, string[]> = {};
  const codes = [...new Set(Object.values(NOTE_PAR_CLE_PROJETS).flatMap((v) => v.split(' et ')))];
  for (const code of codes) {
    const cles = Object.entries(NOTE_PAR_CLE_PROJETS)
      .filter(([, v]) => v.split(' et ').includes(code))
      .map(([k]) => k);
    const rubriques = NOTES_PROJETS.filter((n) => n.code === code && !n.horsBalance)
      .flatMap((n) => n.rubriques)
      .filter((r) => (r.comptes ?? []).length > 0);
    if (rubriques.length === 0) continue;
    const manquants = new Set<string>();
    for (const n of COMPTES_SEMIS) {
      for (const cle of cles) {
        if ((POSTES.get(cle)?.(n) ?? []).length === 0) continue;
        if (!rubriques.some((r) => sensDeLaRubrique(r, n).length > 0)) manquants.add(n);
      }
    }
    if (manquants.size) resultat[code] = [...manquants].sort();
  }
  return resultat;
}

/** Par note : les comptes qu'une ligne chiffrée lit et qu'aucun poste qui la renvoie ne prend. */
function horsPosteParNote(): Record<string, string[]> {
  const resultat: Record<string, string[]> = {};
  const codes = [...new Set(Object.values(NOTE_PAR_CLE_PROJETS).flatMap((v) => v.split(' et ')))];
  for (const code of codes) {
    const cles = Object.entries(NOTE_PAR_CLE_PROJETS)
      .filter(([, v]) => v.split(' et ').includes(code))
      .map(([k]) => k);
    const rubriques = NOTES_PROJETS.filter((n) => n.code === code && !n.horsBalance)
      .flatMap((n) => n.rubriques)
      .filter((r) => (r.comptes ?? []).length > 0);
    const hors = COMPTES_SEMIS.filter(
      (n) => rubriques.some((r) => capte(r, n)) && !cles.some((cle) => (POSTES.get(cle)?.(n) ?? []).length > 0),
    );
    if (hors.length) resultat[code] = hors.sort();
  }
  return resultat;
}

describe('SYCEBNL projets · les comptes d’un poste et ceux de la note qui le détaille', () => {
  it('les comptes qu’un poste prend et qu’aucune ligne chiffrée de sa note ne reprend sont GELÉS, un par un', () => {
    // Relevé de la passe R6 (D7), mesuré et non approuvé. Pour l'essentiel,
    // des lacunes du modèle de note : 4998 en note 4, 34 et 363 en note 5,
    // 181 et 192 en note 11, 47 créditeurs en note 12, 53 créditeurs en
    // note 13, 606 en note 15, 636 en note 17, 6512 et 652 en note 19, 665
    // en note 20A, 678 en note 21, 81, 838, 85, 87, 82 et 846 en note 23.
    // Les autres sont attendus : le 603 de TC n'est pas un stock (note 5),
    // et les sous-comptes de 602, 604, 605 et 705 que le plan ne rattache à
    // aucune ligne passent par les rubriques en attente des notes 14 et 15.
    expect(ecartsParNote()).toEqual({
      '4': ['49980000'],
      '5': ['34100000', '34500000', '36310000', '36320000', '36380000', '60310000', '60320000', '60330000', '60340000', '60350000'],
      '11': ['18100000', '19200000'],
      '12': [
        '42110000', '42120000', '42130000', '42870000', '43870000', '47110000', '47120000', '47130000', '47170000',
        '47190000', '47210000', '47260000', '47310000', '47320000', '47330000', '47380000', '47390000', '47460000',
        '47470000', '47500000', '47600000', '47700000',
      ],
      '13': ['53100000', '53200000', '53300000', '53610000', '53670000', '53800000'],
      '14': ['70520000', '70530000', '70540000', '70550000'],
      '15': [
        '60210000', '60220000', '60230000', '60250000', '60290000', '60450000', '60460000', '60470000', '60490000',
        '60550000', '60570000', '60580000', '60590000', '60610000', '60620000', '60630000', '60640000', '60680000',
      ],
      '16': ['61900000'],
      '17': ['63600000'],
      '19': ['65120000', '65200000'],
      '20A': ['66500000'],
      '21': ['67810000', '67820000'],
      '23': [
        '81100000', '81200000', '81600000', '81800000', '82100000', '82200000', '82600000', '82800000', '83800000',
        '84600000', '85100000', '85200000', '85300000', '85400000', '85800000', '87000000',
      ],
    });
  });

  it('en sens inverse · les comptes qu’une note lit et qu’aucun poste qui la renvoie ne prend', () => {
    // 488 et 498 en note 4 (BA ne lit que le 485), les dépréciations 39, 49
    // et 59 que le bilan de ce jeu ne présente pas (en-tête de
    // `correspondance-projet-bilan.ts`), et les revenus financiers de la note
    // 21, que RD renvoie à la note 14.
    expect(horsPosteParNote()).toEqual({
      '4': ['48810000', '49850000', '49880000'],
      '5': ['39100000', '39200000', '39300000', '39600000', '39700000'],
      '6': ['49000000', '49110000', '49120000', '49200000', '49300000', '49400000', '49700000'],
      '7': ['59200000', '59300000', '59500000'],
      '21': [
        '77120000', '77130000', '77210000', '77220000', '77300000', '77450000', '77460000', '77470000', '77480000',
        '77600000', '77700000', '77910000', '77950000', '77980000', '78700000',
      ],
    });
  });

  it('chaque lacune du modèle de note est DITE au lecteur, sur la note (precisionEditeur)', () => {
    // Le compte, cité dans la précision servie à l'écran et à l'export ·
    // jamais une ligne ajoutée au tableau.
    const attendu: Array<[string, string[]]> = [
      ['ACTIF CIRCULANT HAO', ['488']],
      ['DETTES CIRCULANTES HAO', ['4998']],
      ['STOCKS ET ENCOURS', ['34', '363']],
      ['DETTES FINANCIERES ET RESSOURCES ASSIMILEES', ['181', '192']],
      ['DETTES FOURNISSEURS ET ASSIMILEES, FISCALES ET SOCIALES', ['47']],
      ["BANQUES, CREDIT D'ESCOMPTE ET DE TRESORERIE", ['53']],
      ['ACHATS', ['606']],
      ['SERVICES EXTERIEURS', ['636']],
      ['AUTRES CHARGES', ['6512', '652']],
      ['CHARGES DE PERSONNEL', ['665']],
      ['CHARGES ET REVENUS FINANCIERS', ['678']],
      ['AUTRES CHARGES ET PRODUITS HAO', ['81', '838', '85', '87', '82', '846']],
    ];
    for (const [titre, comptes] of attendu) {
      const note = NOTES_PROJETS.find((n) => n.titre === titre)!;
      for (const c of comptes) {
        expect([titre, c, new RegExp(`\\b${c}\\b`).test(note.precisionEditeur ?? '')]).toEqual([titre, c, true]);
      }
    }
  });
});
