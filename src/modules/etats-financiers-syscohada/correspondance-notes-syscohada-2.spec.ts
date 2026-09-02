import { PLAN_COMPTES_SYSCOHADA } from '../comptes/compte-seed-syscohada';
import { correspond } from '../etats-financiers/etats-financiers.communs';
import { RubriqueNote, SpecificationNote } from '../notes-annexes/note-annexe.types';
import {
  COMPTES_TRESORERIE_PASSIF_SI_CREDITEUR_SYSCOHADA,
  POSTES_ACTIF_SYSCOHADA,
  POSTES_PASSIF_SYSCOHADA,
  PosteBilanDeBase,
} from './correspondance-bilan-syscohada';
import { POSTES_COMPTE_RESULTAT_SYSCOHADA } from './correspondance-compte-resultat-syscohada';
import { NOTES_SYSCOHADA_1 } from './correspondance-notes-syscohada-1';
import {
  CODES_NOTES_SYSCOHADA_2,
  COMPTES_NOTES_2_HORS_POSTE_JUSTIFIES,
  NOTES_SYSCOHADA_2,
  RUBRIQUES_HORS_MAQUETTE_NOTES_2,
} from './correspondance-notes-syscohada-2';
import { NOTES_SYSCOHADA_3 } from './correspondance-notes-syscohada-3';

/**
 * Intégrité structurelle de la DEUXIÈME TRANCHE des notes SYSCOHADA (16A à
 * 27B). Ces tests relisent la SOURCE · le plan semé, le tableau de
 * correspondance du ch. 7 tel que transcrit pour le bilan et le compte de
 * résultat · plutôt que d'affirmer que la transcription est juste. Ce
 * qu'ils attrapent ne lève aucune exception à l'exécution : un compte cité
 * qui n'existe pas au plan, un compte du poste qu'aucune ligne ne capte (la
 * note ne recoupe plus son poste), un compte réclamé deux fois, un total qui
 * lit une ligne écrite après lui.
 */

/** Comptes d'imputation (feuilles) du semis, classes 1 à 7 · les seules que cette tranche cite. */
const COMPTES_SEMIS = PLAN_COMPTES_SYSCOHADA.filter((c) => c.typeCompte !== 'TOTAL' && /^[1-7]/.test(c.numero));

const noteDe = (code: string, sousTableau?: string): SpecificationNote =>
  NOTES_SYSCOHADA_2.find((n) => n.code === code && (sousTableau === undefined || n.sousTableau === sousTableau))!;

/** Rubriques chiffrées (ni total, ni saisie, ni attente). */
const rubriquesChiffrees = (spec: SpecificationNote): RubriqueNote[] =>
  spec.rubriques.filter((r) => (r.comptes?.length ?? 0) > 0);

/** Une rubrique capte-t-elle ce numéro ? */
const capte = (r: RubriqueNote, numero: string) => correspond(numero, r.comptes ?? [], r.exclusions);

/** Comptes du semis captés par un poste (brut, sans amortissement). */
const comptesDuPoste = (p: { comptes: string[]; exclusions?: string[] }) =>
  COMPTES_SEMIS.filter((c) => correspond(c.numero, p.comptes, p.exclusions)).map((c) => c.numero);

/** Libellés des lignes qu'une note ajoute à sa maquette (anomalies n° 16 et 17). */
const horsMaquette = (note: string) => RUBRIQUES_HORS_MAQUETTE_NOTES_2.filter((a) => a.note === note).map((a) => a.libelle);

const postePassif = (ref: string): PosteBilanDeBase => POSTES_PASSIF_SYSCOHADA.find((p) => p.ref === ref)!;
const posteActif = (ref: string): PosteBilanDeBase => POSTES_ACTIF_SYSCOHADA.find((p) => p.ref === ref)!;
const posteResultat = (ref: string) => POSTES_COMPTE_RESULTAT_SYSCOHADA.find((p) => p.ref === ref)!;

/**
 * Recoupement note ↔ postes, dans les deux sens : chaque compte du semis que
 * les postes captent a une ligne dans la note, et chaque compte que la note
 * cite appartient à l'un des postes (hors tolérances justifiées).
 */
function recoupe(
  spec: SpecificationNote,
  postes: { comptes: string[]; exclusions?: string[] }[],
  tolerances: string[] = [],
  sansLigneToleres: string[] = [],
) {
  const attendus = new Set(postes.flatMap(comptesDuPoste));
  const rubriques = rubriquesChiffrees(spec);
  const sansLigne = [...attendus]
    .filter((n) => !rubriques.some((r) => capte(r, n)))
    .filter((n) => !sansLigneToleres.some((t) => n.startsWith(t)));
  expect({ note: spec.code, sansLigne }).toEqual({ note: spec.code, sansLigne: [] });
  const horsPoste = COMPTES_SEMIS.map((c) => c.numero)
    .filter((n) => rubriques.some((r) => capte(r, n)))
    .filter((n) => !attendus.has(n) && !tolerances.some((t) => n.startsWith(t)));
  expect({ note: spec.code, horsPoste }).toEqual({ note: spec.code, horsPoste: [] });
}

describe('notes SYSCOHADA, tranche 2 · intégrité des spécifications', () => {
  it('transcrit exactement les notes 16A à 27B de la liste officielle (ch. 6 section 2), ni une de plus ni une de moins', () => {
    const transcrites = [...new Set(NOTES_SYSCOHADA_2.map((n) => n.code))];
    expect(transcrites).toEqual(CODES_NOTES_SYSCOHADA_2);
    expect(CODES_NOTES_SYSCOHADA_2).toEqual([
      '16A', '16B', '16B bis', '16C', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27A', '27B',
    ]);
  });

  it('aucun tableau en double · un code seul, ou un code et son sous-tableau', () => {
    const cles = NOTES_SYSCOHADA_2.map((n) => `${n.code}::${n.sousTableau ?? ''}`);
    expect(new Set(cles).size).toBe(cles.length);
  });

  it('une note à plusieurs tableaux les nomme TOUS (16B, 16B bis, 27B)', () => {
    const parCode = new Map<string, number>();
    for (const n of NOTES_SYSCOHADA_2) parCode.set(n.code, (parCode.get(n.code) ?? 0) + 1);
    for (const n of NOTES_SYSCOHADA_2) {
      const multiple = (parCode.get(n.code) ?? 0) > 1;
      expect({ code: n.code, nomme: !multiple || !!n.sousTableau }).toEqual({ code: n.code, nomme: true });
    }
    expect(parCode.get('16B')).toBe(3);
    expect(parCode.get('16B bis')).toBe(2);
    // Anomalie n° 29 : les deux blocs « actif éventuel » et « passif
    // éventuel » de la maquette deviennent deux sous-tableaux, le moteur
    // n'ayant pas de rubrique d'en-tête de bloc.
    expect(parCode.get('16C')).toBe(2);
    expect(parCode.get('27B')).toBe(2);
  });

  it('16C rend les six lignes de la maquette, « litiges » puis deux lignes à compléter par bloc (anomalie n° 29)', () => {
    const blocs = NOTES_SYSCOHADA_2.filter((n) => n.code === '16C');
    expect(blocs.map((n) => n.sousTableau)).toEqual(['ACTIF ÉVENTUEL', 'PASSIF ÉVENTUEL']);
    for (const b of blocs) {
      expect(b.rubriques.map((r) => r.libelle)).toEqual(['Litiges', '…', '…']);
      expect(b.rubriques.every((r) => r.saisie)).toBe(true);
    }
    // La 16C n'est appelée par aucun poste (ch. 6) · anomalie n° 25.
    for (const b of blocs) expect(b.renvoyeeDepuis).toBeUndefined();
  });

  it('un total ne référence jamais une rubrique qui vient APRÈS lui · le calcul en une passe lirait 0', () => {
    for (const spec of NOTES_SYSCOHADA_2) {
      spec.rubriques.forEach((r, i) => {
        for (const idx of [...(r.totalDeRubriques ?? []), ...(r.moinsRubriques ?? [])]) {
          expect({ note: spec.code, rubrique: r.libelle, avant: idx < i }).toEqual(
            { note: spec.code, rubrique: r.libelle, avant: true },
          );
        }
      });
    }
  });

  it('une rubrique porte soit des comptes, soit un total, soit une subdivision attendue, soit une saisie · jamais rien', () => {
    for (const spec of NOTES_SYSCOHADA_2) {
      for (const r of spec.rubriques) {
        const definie =
          (r.comptes?.length ?? 0) > 0 || r.totalDeRubriques !== undefined || r.subdivisionAttendue !== undefined || r.saisie === true;
        expect({ note: spec.code, rubrique: r.libelle, definie }).toEqual({ note: spec.code, rubrique: r.libelle, definie: true });
      }
    }
  });

  it('sens et natureCreditrice ne se cumulent jamais ; saisie ne se cumule ni avec des comptes ni avec une attente', () => {
    for (const spec of NOTES_SYSCOHADA_2) {
      for (const r of spec.rubriques) {
        expect({ note: spec.code, r: r.libelle, cumul: !!(r.sens && r.natureCreditrice) }).toEqual({ note: spec.code, r: r.libelle, cumul: false });
        expect({ note: spec.code, r: r.libelle, cumul: !!(r.saisie && (r.comptes?.length || r.subdivisionAttendue)) }).toEqual(
          { note: spec.code, r: r.libelle, cumul: false },
        );
      }
    }
  });

  it('toute rubrique en attente porte une clé ; les clés sont uniques dans une note', () => {
    for (const spec of NOTES_SYSCOHADA_2) {
      for (const r of spec.rubriques) {
        if (r.subdivisionAttendue) expect(typeof r.cle).toBe('string');
      }
      const cles = spec.rubriques.map((r) => r.cle).filter(Boolean);
      expect(new Set(cles).size).toBe(cles.length);
    }
  });

  it('chaque note déclare des colonnes connues du moteur et un titre non vide', () => {
    const CALCULEES = [
      'EXERCICE_N', 'EXERCICE_N1', 'VARIATION_VALEUR', 'VARIATION_POURCENT', 'VARIATION_VALEUR_ABSOLUE',
      'OUVERTURE', 'AUGMENTATIONS', 'DIMINUTIONS', 'CLOTURE',
      'AUGMENTATION_EXPLOITATION', 'AUGMENTATION_FINANCIERE', 'AUGMENTATION_HAO',
      'DIMINUTION_EXPLOITATION', 'DIMINUTION_FINANCIERE', 'DIMINUTION_HAO',
      'ECHEANCE_1AN', 'ECHEANCE_2ANS', 'ECHEANCE_PLUS_2ANS', 'LIBRE',
    ];
    for (const spec of NOTES_SYSCOHADA_2) {
      expect(spec.colonnes.length).toBeGreaterThan(0);
      expect(spec.titre.trim().length).toBeGreaterThan(0);
      for (const c of spec.colonnes) expect(CALCULEES).toContain(c.type);
    }
  });

  it('les échéances de dettes sont portées par 16A, 17, 18 et 19 et par elles seules (maquettes du ch. 6)', () => {
    const avecEcheances = NOTES_SYSCOHADA_2.filter((n) =>
      n.colonnes.some((c) => c.type === 'ECHEANCE_1AN' || c.type === 'ECHEANCE_2ANS' || c.type === 'ECHEANCE_PLUS_2ANS'),
    ).map((n) => n.code);
    expect(avecEcheances).toEqual(['16A', '17', '18', '19']);
    // 16A, 18, 19 : les deux variations ; 17 : le % seul.
    const aValeurAbsolue = (code: string) =>
      noteDe(code).colonnes.some((c) => c.libelle === 'Variation en valeur absolue');
    expect(['16A', '18', '19'].map(aValeurAbsolue)).toEqual([true, true, true]);
    expect(aValeurAbsolue('17')).toBe(false);
  });

  it('« Variation en valeur absolue » est calculée SIGNÉE (anomalie n° 33) · |N − N-1| perdrait le sens de la variation', () => {
    for (const spec of NOTES_SYSCOHADA_2) {
      for (const c of spec.colonnes) {
        if (c.libelle === 'Variation en valeur absolue') expect({ note: spec.code, type: c.type }).toEqual({ note: spec.code, type: 'VARIATION_VALEUR' });
      }
      // Et aucune colonne de la tranche ne prend la valeur absolue mathématique.
      expect(spec.colonnes.some((c) => c.type === 'VARIATION_VALEUR_ABSOLUE')).toBe(false);
    }
  });

  it('aucun cadratin dans un titre, un libellé, un commentaire ou un renvoi (CLAUDE.md §4)', () => {
    const cadratin = /\u2014/; // écrit échappé pour ne pas réintroduire le caractère dans le dépôt
    for (const spec of NOTES_SYSCOHADA_2) {
      const textes = [
        spec.titre, spec.sousTableau ?? '', spec.commentaire ?? '', spec.renvoiOfficiel ?? '',
        ...spec.colonnes.map((c) => c.libelle),
        ...spec.rubriques.flatMap((r) => [r.libelle, r.renvoi ?? '', r.subdivisionAttendue ?? '']),
      ];
      for (const t of textes) expect(t).not.toMatch(cadratin);
    }
  });

  it('chaque préfixe cité (comptes et exclusions) correspond à au moins un compte d’imputation du semis SYSCOHADA', () => {
    const absents: { note: string; prefixe: string }[] = [];
    for (const spec of NOTES_SYSCOHADA_2) {
      for (const r of spec.rubriques) {
        for (const p of [...(r.comptes ?? []), ...(r.exclusions ?? [])]) {
          if (!COMPTES_SEMIS.some((c) => c.numero.startsWith(p))) absents.push({ note: spec.code, prefixe: p });
        }
      }
    }
    expect(absents).toEqual([]);
  });

  it('une note hors balance n’a que des rubriques en saisie, et une note chiffrée n’en a aucune', () => {
    for (const spec of NOTES_SYSCOHADA_2) {
      const saisies = spec.rubriques.filter((r) => r.saisie).length;
      if (spec.horsBalance) expect({ note: spec.code, toutes: saisies === spec.rubriques.length }).toEqual({ note: spec.code, toutes: true });
      else expect({ note: spec.code, saisies }).toEqual({ note: spec.code, saisies: 0 });
    }
    expect(NOTES_SYSCOHADA_2.filter((n) => n.horsBalance).map((n) => n.code)).toEqual([
      '16B', '16B', '16B', '16B bis', '16B bis', '16C', '16C', '27B', '27B',
    ]);
  });

  it('aucune rubrique en attente de rattachement : les notes 16A à 27A descendent au divisionnaire du plan', () => {
    for (const spec of NOTES_SYSCOHADA_2) {
      expect(spec.rubriques.filter((r) => r.subdivisionAttendue).map((r) => r.libelle)).toEqual([]);
    }
  });

  it('les seules clés de la tranche sont celles documentées, et AUCUNE n’ouvre un rattachement', () => {
    // `note-annexe.service.ts` pose la convention qu'une rubrique déterminée
    // par le plan ne porte pas de clé ; cette tranche en pose deux fois hors
    // attente (en-tête, section « Une note sur le champ `cle` »). Ce qui
    // doit rester vrai, et que ce test verrouille : aucune de ces clés ne
    // porte `subdivisionAttendue`, donc `rubriqueRattachable` les refuse
    // toutes · une clé n'est jamais une porte ouverte sur le rattachement.
    const avecCle = NOTES_SYSCOHADA_2.flatMap((n) => n.rubriques.filter((r) => r.cle).map((r) => ({ note: n.code, r })));
    expect(avecCle.map((x) => `${x.note}:${x.r.cle}`)).toEqual([
      '16A:interets-courus-emprunts', '16A:interets-courus-location',
      '27B:YA', '27B:YB', '27B:YC', '27B:YD', '27B:YE', '27B:YF', '27B:YG',
      '27B:YH', '27B:YI', '27B:YJ', '27B:YK', '27B:YL', '27B:YM', '27B:YN', '27B:YO',
    ]);
    for (const x of avecCle) expect({ cle: x.r.cle, attendue: x.r.subdivisionAttendue }).toEqual({ cle: x.r.cle, attendue: undefined });
  });

  it('le champ `renvoi` ne porte QUE des renvois du texte officiel · les lignes hors maquette sont listées à part', () => {
    // Anomalies n° 16 et 17 : les sept lignes ajoutées aux notes 21 et 22
    // sont désignées par `RUBRIQUES_HORS_MAQUETTE_NOTES_2`, jamais par
    // `renvoi`, que `note-annexe.types.ts` réserve au texte officiel.
    const renvois = NOTES_SYSCOHADA_2.flatMap((n) => n.rubriques.filter((r) => r.renvoi).map((r) => `${n.code}:${r.renvoi}`));
    expect(renvois).toEqual(['19:28', '26:28']);
    // Et chaque ligne annoncée hors maquette existe vraiment, sous ce libellé.
    for (const a of RUBRIQUES_HORS_MAQUETTE_NOTES_2) {
      expect({ ...a, presente: noteDe(a.note).rubriques.some((r) => r.libelle === a.libelle) }).toEqual({ ...a, presente: true });
    }
    expect(RUBRIQUES_HORS_MAQUETTE_NOTES_2).toHaveLength(7);
  });
});

describe('notes SYSCOHADA, tranche 2 · recoupement avec les postes du bilan (ch. 7)', () => {
  it('chaque `renvoyeeDepuis` de bilan est relu dans la colonne « Note » du modèle (ch. 3), pas affirmé', () => {
    // Le modèle renvoie au NUMÉRO DE TÊTE : « 16 » pour DA, DB et DC, « 17 »,
    // « 18 »… (anomalie n° 25). Relire la colonne plutôt que d'écrire la
    // valeur attendue : sans ça, une correction du bilan laisserait ici un
    // renvoi périmé, muet à l'exécution.
    const tete = (code: string) => /^\d+/.exec(code)![0];
    const posteBilan = (ref: string) =>
      POSTES_PASSIF_SYSCOHADA.find((p) => p.ref === ref) ?? POSTES_ACTIF_SYSCOHADA.find((p) => p.ref === ref);
    const REFS_RESULTAT = new Set(POSTES_COMPTE_RESULTAT_SYSCOHADA.map((p) => p.ref));
    for (const spec of NOTES_SYSCOHADA_2) {
      for (const ref of spec.renvoyeeDepuis ?? []) {
        if (REFS_RESULTAT.has(ref)) continue; // vérifié par le describe du compte de résultat
        const poste = posteBilan(ref);
        expect({ note: spec.code, ref, note_du_poste: poste?.note }).toEqual({
          note: spec.code, ref, note_du_poste: tete(spec.code),
        });
      }
    }
  });

  it('16A couvre DA, DB et DC compte par compte, en lecture créditrice sans filtre', () => {
    const n = noteDe('16A');
    expect(n.renvoyeeDepuis).toEqual(['DA', 'DB', 'DC']);
    recoupe(n, [postePassif('DA'), postePassif('DB'), postePassif('DC')]);
    for (const r of rubriquesChiffrees(n)) expect({ r: r.libelle, nc: r.natureCreditrice, sens: r.sens }).toEqual({ r: r.libelle, nc: true, sens: undefined });
    // Anomalie n° 3 : 1962 est présenté avec la même lecture, donc en négatif.
    expect(rubriquesChiffrees(n).find((r) => capte(r, '19620000'))?.libelle).toBe('Actif du régime de retraite');
    // Anomalie n° 4 : 183 avec 166.
    expect(rubriquesChiffrees(n).find((r) => capte(r, '18300000'))?.cle).toBe('interets-courus-emprunts');
    // Les trois totaux du texte, sur des blocs disjoints qui épuisent la note.
    const totaux = n.rubriques.filter((r) => r.totalDeRubriques);
    expect(totaux.map((t) => t.libelle)).toEqual([
      'TOTAL EMPRUNTS ET DETTES FINANCIÈRES', 'TOTAL DETTES DE LOCATION ACQUISITION', 'TOTAL PROVISIONS POUR RISQUES ET CHARGES',
    ]);
    const couverts = totaux.flatMap((t) => t.totalDeRubriques!);
    const chiffrees = n.rubriques.map((r, i) => (r.comptes ? i : -1)).filter((i) => i >= 0);
    expect([...couverts].sort((a, b) => a - b)).toEqual(chiffrees);
  });

  it('17 couvre DJ (dettes) et BH (fournisseurs débiteurs) · le 404 est éclaté par le plan (anomalie n° 6)', () => {
    const n = noteDe('17');
    expect(n.renvoyeeDepuis).toEqual(['DJ', 'BH']);
    recoupe(n, [postePassif('DJ'), posteActif('BH')]);
    const ligne = (numero: string) => rubriquesChiffrees(n).find((r) => capte(r, numero))?.libelle;
    expect(ligne('40410000')).toBe('Fournisseurs dettes en compte (hors groupe)');
    expect(ligne('40460000')).toBe('Fournisseurs effets à payer (hors groupe)');
    expect(ligne('40120000')).toBe('Fournisseurs, dettes et effets à payer groupe');
    expect(ligne('40820000')).toBe('Fournisseurs factures non parvenues groupe');
    expect(ligne('40930000')).toBe('Fournisseurs, avances et acomptes (hors groupe)');
    // Le bloc débiteurs (409) se lit au débit, le bloc dettes au crédit sans filtre (DJ n'est pas qualifié).
    for (const r of rubriquesChiffrees(n)) {
      const debiteur = r.comptes!.every((c) => c.startsWith('409'));
      expect({ r: r.libelle, nc: !!r.natureCreditrice }).toEqual({ r: r.libelle, nc: !debiteur });
      expect(r.sens).toBeUndefined();
    }
  });

  it('18 couvre DK, et toutes ses lignes filtrent le sens CRÉDITEUR comme le ch. 7 (anomalie n° 7 sur le 421)', () => {
    const n = noteDe('18');
    expect(n.renvoyeeDepuis).toEqual(['DK']);
    expect(postePassif('DK').sens_qualificatif).toBe('CREDITEUR');
    recoupe(n, [postePassif('DK')]);
    for (const r of rubriquesChiffrees(n)) expect({ r: r.libelle, sens: r.sens }).toEqual({ r: r.libelle, sens: 'CREDITEUR' });
    const ligne = (numero: string) => rubriquesChiffrees(n).find((r) => capte(r, numero))?.libelle;
    expect(ligne('42110000')).toBe('Personnel avances et acomptes');
    expect(ligne('43130000')).toBe('Caisse de sécurité sociale'); // anomalie n° 8
    expect(ligne('43200000')).toBe('Caisse de retraite');
    expect(ligne('44600000')).toBe('Autres dettes État'); // anomalie n° 9
    expect(ligne('44520000')).toBe('État, TVA');
  });

  it('19 couvre DM et DN · 186 à 188 sont la seule tolérance (anomalie n° 11), 4998 reste à DH', () => {
    const n = noteDe('19');
    expect(n.renvoyeeDepuis).toEqual(['DM', 'DN']);
    expect(postePassif('DM').sens_qualificatif).toBe('CREDITEUR');
    // Le 478 créditeur est le seul compte de DM que la note ne reprend pas
    // (anomalie n° 12) : il est déjà à la note 12, sans filtre.
    recoupe(n, [postePassif('DM'), postePassif('DN')], COMPTES_NOTES_2_HORS_POSTE_JUSTIFIES.map((j) => j.prefixe), ['478']);
    // Chaque tolérance est réellement hors poste (sinon elle masquerait un compte capté ailleurs).
    for (const j of COMPTES_NOTES_2_HORS_POSTE_JUSTIFIES) {
      const dansUnPoste = [...POSTES_ACTIF_SYSCOHADA, ...POSTES_PASSIF_SYSCOHADA].some((p) => correspond(`${j.prefixe}00000`, p.comptes, p.exclusions));
      expect({ prefixe: j.prefixe, dansUnPoste }).toEqual({ prefixe: j.prefixe, dansUnPoste: false });
      expect(rubriquesChiffrees(noteDe(j.note)).some((r) => capte(r, `${j.prefixe}00000`))).toBe(true);
    }
    const provisions = rubriquesChiffrees(n).find((r) => r.renvoi === '28')!;
    expect(capte(provisions, '49980000')).toBe(false);
    expect(capte(provisions, '49910000')).toBe(true);
    expect(capte(provisions, '59900000')).toBe(true);
    expect(provisions.natureCreditrice).toBe(true);
    // Tout le reste (DM) filtre le sens créditeur.
    for (const r of rubriquesChiffrees(n).filter((r) => r !== provisions)) expect({ r: r.libelle, sens: r.sens }).toEqual({ r: r.libelle, sens: 'CREDITEUR' });
    // Anomalie n° 10 : le total associés ne couvre que le 46, organismes internationaux entre au total autres dettes.
    const idx = (libelle: string) => n.rubriques.findIndex((r) => r.libelle === libelle);
    expect(n.rubriques[idx('TOTAL DETTES ASSOCIÉS')].totalDeRubriques).not.toContain(idx('Organismes internationaux'));
    expect(n.rubriques[idx('TOTAL AUTRES DETTES')].totalDeRubriques).toEqual([
      idx('Organismes internationaux'), idx('TOTAL DETTES ASSOCIÉS'), idx('TOTAL CRÉDITEURS DIVERS'), idx('TOTAL COMPTES DE LIAISON'),
    ]);
    // Anomalie n° 12 : les 47 sans ligne vont aux autres créditeurs divers ; 478 et 479 (écarts de conversion) non.
    const autres = n.rubriques[idx('Autres créditeurs divers')];
    for (const numero of ['47110000', '47210000', '47310000', '47460000', '47600000', '47700000']) expect(capte(autres, numero)).toBe(true);
    expect(capte(autres, '47810000')).toBe(false);
    expect(capte(autres, '47910000')).toBe(false);
  });

  it('20 couvre DQ et DR, y compris les 52/53 créditeurs que BS transfère (anomalies n° 14 et 15)', () => {
    const n = noteDe('20');
    expect(n.renvoyeeDepuis).toEqual(['DQ', 'DR']);
    recoupe(n, [postePassif('DQ'), postePassif('DR'), { comptes: COMPTES_TRESORERIE_PASSIF_SI_CREDITEUR_SYSCOHADA }]);
    const rubrique = (numero: string) => rubriquesChiffrees(n).find((r) => capte(r, numero))!;
    // 52 et 53 filtrés CRÉDITEUR ; 564, 565, 561, 566 sans filtre.
    for (const c of COMPTES_SEMIS.filter((c) => /^5[23]/.test(c.numero))) expect({ c: c.numero, sens: rubrique(c.numero).sens }).toEqual({ c: c.numero, sens: 'CREDITEUR' });
    for (const numero of ['56100000', '56400000', '56500000', '56600000']) {
      expect({ numero, sens: rubrique(numero).sens, nc: rubrique(numero).natureCreditrice }).toEqual({ numero, sens: undefined, nc: true });
    }
    expect(rubrique('53100000').libelle).toBe('Autres banques');
    // Anomalie n° 14 : 536 (intérêts courus des établissements financiers)
    // tombe dans « autres banques » par le jeton « 53 », pas dans la ligne
    // d'intérêts courus, qui ne vaut que pour les BANQUES (le 52).
    expect(rubrique('53600000').libelle).toBe('Autres banques');
    expect(rubrique('52610000').libelle).toBe('Banques intérêts courus');
    expect(rubrique('56600000').libelle).toBe('Crédit de trésorerie');
    // Le total général est la somme des deux sous-totaux, DQ + DR = DT.
    expect(n.rubriques[n.rubriques.length - 1].totalDeRubriques).toEqual([2, 8]);
  });
});

describe('notes SYSCOHADA, tranche 2 · recoupement avec les postes du compte de résultat (ch. 7)', () => {
  it.each([
    ['21', ['TA', 'TB', 'TC', 'TD', 'TF', 'TG', 'TH']],
    ['22', ['RA', 'RC', 'RE']],
    ['23', ['RG']],
    ['24', ['RH']],
    ['25', ['RI']],
    ['26', ['RJ']],
    ['27A', ['RK']],
  ])('la note %s couvre exactement ses postes %j, compte par compte', (code, refs) => {
    const n = noteDe(code);
    expect(n.renvoyeeDepuis).toEqual(refs);
    // Et le modèle du ch. 4 renvoie bien vers cette note depuis chacun de ces postes (« 27 » pour RK).
    for (const ref of refs) expect(posteResultat(ref).notes.some((x) => x === code || x === code.replace(/[AB]$/, ''))).toBe(true);
    recoupe(n, refs.map(posteResultat));
  });

  it('21 : chaque bloc de ventes recoupe son poste (TA, TB, TC) et le chiffre d’affaires est la somme des quatre (anomalie n° 16)', () => {
    const n = noteDe('21');
    const bloc = (total: string, ref: string) => {
      const t = n.rubriques.find((r) => r.libelle === total)!;
      const lignes = t.totalDeRubriques!.map((i) => n.rubriques[i]);
      const attendus = comptesDuPoste(posteResultat(ref));
      const captes = COMPTES_SEMIS.map((c) => c.numero).filter((x) => lignes.some((r) => capte(r, x)));
      expect({ total, captes: captes.sort() }).toEqual({ total, captes: attendus.sort() });
      // Une seule ligne ajoutée hors maquette par bloc, et c'est celle des RRR.
      const ajoutees = lignes.filter((r) => horsMaquette('21').includes(r.libelle)).map((r) => r.libelle);
      expect(ajoutees.length).toBe(1);
      expect(ajoutees[0]).toMatch(/^Rabais, remises et ristournes accordés/);
    };
    bloc('TOTAL : VENTES MARCHANDISES', 'TA');
    bloc('TOTAL : VENTES DE PRODUITS FABRIQUÉS', 'TB');
    bloc('TOTAL : VENTES DE TRAVAUX ET SERVICES VENDUS', 'TC');
    // Les 70x5 « sur internet » ont chacun leur ligne.
    const internet = rubriquesChiffrees(n).filter((r) => r.libelle.endsWith('sur internet'));
    expect(internet.flatMap((r) => r.comptes!).sort()).toEqual(['7015', '7025', '7035', '7045', '7055', '7065']);
    for (const r of rubriquesChiffrees(n)) expect({ r: r.libelle, nc: r.natureCreditrice }).toEqual({ r: r.libelle, nc: true });
    const idx = (libelle: string) => n.rubriques.findIndex((r) => r.libelle === libelle);
    expect(n.rubriques[idx("TOTAL : CHIFFRES D'AFFAIRES")].totalDeRubriques).toEqual([
      idx('TOTAL : VENTES MARCHANDISES'), idx('TOTAL : VENTES DE PRODUITS FABRIQUÉS'),
      idx('TOTAL : VENTES DE TRAVAUX ET SERVICES VENDUS'), idx('Produits accessoires'),
    ]);
    expect(n.rubriques[idx('TOTAL')].totalDeRubriques).toEqual([idx("TOTAL : CHIFFRES D'AFFAIRES"), idx('TOTAL : AUTRES PRODUITS')]);
    // Anomalie n° 30 : TH remonte « 75 » en bloc, donc le 759 (reprises)
    // entre dans « autres produits », là où la note 26 isole le 659
    // symétrique. Asymétrie voulue par les deux maquettes, verrouillée ici.
    expect(rubriquesChiffrees(n).find((r) => capte(r, '75900000'))?.libelle).toBe('Autres produits');
    expect(rubriquesChiffrees(noteDe('26')).find((r) => capte(r, '65900000'))?.renvoi).toBe('28');
  });

  it('22 : les trois totaux d’achats recoupent RA, RC et RE, frais et RRR compris (anomalies n° 17 à 19)', () => {
    const n = noteDe('22');
    const bloc = (total: string, ref: string, ajoutees: number) => {
      const t = n.rubriques.find((r) => r.libelle === total)!;
      const lignes = t.totalDeRubriques!.map((i) => n.rubriques[i]);
      const attendus = comptesDuPoste(posteResultat(ref));
      const captes = COMPTES_SEMIS.map((c) => c.numero).filter((x) => lignes.some((r) => capte(r, x)));
      expect({ total, captes: captes.sort() }).toEqual({ total, captes: attendus.sort() });
      expect(lignes.filter((r) => horsMaquette('22').includes(r.libelle)).length).toBe(ajoutees);
    };
    bloc('TOTAL : ACHATS DE MARCHANDISES', 'RA', 2);
    bloc('TOTAL : ACHATS MATIÈRES PREMIÈRES ET FOURNITURES LIÉES', 'RC', 2);
    bloc('TOTAL : AUTRES ACHATS', 'RE', 0);
    const ligne = (numero: string) => rubriquesChiffrees(n).find((r) => capte(r, numero))?.libelle;
    expect(ligne('60460000')).toBe("Fournitures d'atelier, d'usine et de magasin");
    expect(ligne('60470000')).toBe('Fourniture de bureau');
    expect(ligne('60550000')).toBe('Fourniture de bureau');
    expect(ligne('60580000')).toBe('Achats études, prestations de services, de travaux matériels et équipements');
    expect(ligne('60850000')).toBe('Frais sur achats');
    expect(ligne('60890000')).toBe('Remises rabais, remises et ristournes');
    // Un compte de charge se lit au débit : aucune lecture créditrice, aucun filtre.
    for (const r of rubriquesChiffrees(n)) expect({ r: r.libelle, nc: r.natureCreditrice, sens: r.sens }).toEqual({ r: r.libelle, nc: undefined, sens: undefined });
  });

  it('24 et 26 : les comptes sans ligne vont à la ligne résiduelle (anomalies n° 21 et 22)', () => {
    const l24 = (numero: string) => rubriquesChiffrees(noteDe('24')).find((r) => capte(r, numero))?.libelle;
    expect(l24('63710000')).toBe('Autres charges externes');
    expect(l24('63810000')).toBe('Autres charges externes');
    expect(l24('63510000')).toBe('Cotisations');
    const l26 = (numero: string) => rubriquesChiffrees(noteDe('26')).find((r) => capte(r, numero))?.libelle;
    expect(l26('65600000')).toBe('Autres charges diverses');
    expect(l26('65700000')).toBe('Autres charges diverses');
    expect(l26('65880000')).toBe('Autres charges diverses');
    expect(l26('65910000')).toMatch(/voir note 28/);
    // 647 (fiscal) à la note 25, 657 (pénal) à la note 26 : jamais l'inverse.
    expect(rubriquesChiffrees(noteDe('25')).find((r) => capte(r, '64710000'))?.libelle).toBe('Pénalités et amendes fiscales');
    expect(rubriquesChiffrees(noteDe('25')).some((r) => capte(r, '65700000'))).toBe(false);
  });

  it('27A : 661 et 662 sur une seule ligne, 667 sur la sienne ; 27B porte les codes YA à YO dans l’ordre', () => {
    const l = (numero: string) => rubriquesChiffrees(noteDe('27A')).find((r) => capte(r, numero))?.libelle;
    expect(l('66110000')).toBe('Rémunérations directes versées au personnel');
    expect(l('66210000')).toBe('Rémunérations directes versées au personnel');
    expect(l('66710000')).toBe('Rémunération transférée de personnel extérieur');
    const codes = NOTES_SYSCOHADA_2.filter((n) => n.code === '27B').flatMap((n) => n.rubriques.map((r) => r.cle));
    expect(codes).toEqual(['YA', 'YB', 'YC', 'YD', 'YE', 'YF', 'YG', 'YH', 'YI', 'YJ', 'YK', 'YL', 'YM', 'YN', 'YO']);
    for (const n of NOTES_SYSCOHADA_2.filter((n) => n.code === '27B')) expect(n.colonnes.length).toBe(16);
    expect(noteDe('27B', '2. Personnel extérieur').colonnes.some((c) => c.libelle.startsWith("FACTURATION À L'ENTITÉ"))).toBe(true);
  });
});

describe('notes SYSCOHADA, tranche 2 · anti double comptage', () => {
  it('à l’intérieur de la tranche, aucun compte du semis n’est capté par deux rubriques', () => {
    const doublons: { numero: string; notes: string[] }[] = [];
    for (const c of COMPTES_SEMIS) {
      const notes = NOTES_SYSCOHADA_2.filter((n) => rubriquesChiffrees(n).some((r) => capte(r, c.numero))).map((n) => n.code);
      if (notes.length > 1) doublons.push({ numero: c.numero, notes });
    }
    expect(doublons).toEqual([]);
  });

  it('avec la première tranche, un compte de bilan n’est réclamé deux fois que dans des sens OPPOSÉS, hors chevauchements signalés', () => {
    // Un compte de tiers ou de banque figure au DÉBIT dans une note de
    // créances (tranche 1) et au CRÉDIT dans une note de dettes (ici) : c'est
    // l'éclatement par le sens du ch. 7, pas un double compte. Une rubrique
    // de la première tranche qui RENVOIE à une note d'ici se déclare
    // elle-même comme reprise (note 1, récapitulatif des dettes garanties ;
    // note 15B, détail du 16 de DA : 167 et 1613, `renvoi: '16A'`) : elle
    // est écartée du balayage. Tout autre chevauchement doit être l'une des
    // anomalies documentées :
    //   526 et 536 · note 11 sans filtre et note 20 filtrée CRÉDITEUR (ici, anomalie n° 15).
    const CHEVAUCHEMENTS_SIGNALES = ['526', '536'];
    const codes2 = new Set(NOTES_SYSCOHADA_2.map((n) => n.code));
    const lecture = (r: RubriqueNote) => r.sens ?? 'SANS_FILTRE';
    const suspects: { numero: string; lectures: string[] }[] = [];
    for (const c of COMPTES_SEMIS.filter((c) => /^[1-5]/.test(c.numero))) {
      const ici = NOTES_SYSCOHADA_2.flatMap((n) => rubriquesChiffrees(n).filter((r) => capte(r, c.numero)).map((r) => `${n.code}:${lecture(r)}`));
      if (ici.length === 0) continue;
      const ailleurs = NOTES_SYSCOHADA_1.flatMap((n) =>
        rubriquesChiffrees(n)
          .filter((r) => capte(r, c.numero) && !(r.renvoi && codes2.has(r.renvoi)))
          .map((r) => `${n.code}:${lecture(r)}`),
      );
      if (ailleurs.length === 0) continue;
      const lectures = [...ailleurs, ...ici];
      const opposes = lectures.length === 2 && ailleurs[0].endsWith(':DEBITEUR') && ici[0].endsWith(':CREDITEUR');
      if (!opposes && !CHEVAUCHEMENTS_SIGNALES.some((p) => c.numero.startsWith(p))) suspects.push({ numero: c.numero, lectures });
    }
    expect(suspects).toEqual([]);
    // Et chaque chevauchement signalé existe réellement (sinon la liste masquerait un compte disparu d'une note).
    for (const p of CHEVAUCHEMENTS_SIGNALES) {
      const numero = COMPTES_SEMIS.find((c) => c.numero.startsWith(p))!.numero;
      const dansT1 = NOTES_SYSCOHADA_1.some((n) => rubriquesChiffrees(n).some((r) => capte(r, numero) && !(r.renvoi && codes2.has(r.renvoi))));
      const dansT2 = NOTES_SYSCOHADA_2.some((n) => rubriquesChiffrees(n).some((r) => capte(r, numero)));
      expect({ p, dansT1, dansT2 }).toEqual({ p, dansT1: true, dansT2: true });
    }
  });

  it('avec la troisième tranche, le seul recouvrement est la NOTE 28, tableau des mouvements des provisions', () => {
    // Le titre du test précédent ne parle que de la première tranche : le
    // chevauchement avec la troisième n'était contrôlé que du côté du spec de
    // la tranche 3. Il l'est ici aussi, et il est CARACTÉRISÉ : la note 28
    // reprend en MOUVEMENTS (A/B/C/D) les provisions et dépréciations que
    // cette tranche présente en SOLDE, ce qui n'est pas un double comptage
    // mais la maquette même du ch. 6 · les 19x du poste DC (note 16A) et les
    // 499/599 du poste DN, ces derniers portant en plus le renvoi officiel
    // « (voir note 28) ». Tout autre recouvrement serait un défaut.
    const attendu = new Map<string, string>();
    for (const c of COMPTES_SEMIS.filter((c) => /^19/.test(c.numero))) attendu.set(c.numero, '2/16A + 3/28');
    for (const c of COMPTES_SEMIS.filter((c) => /^(499|599)/.test(c.numero) && !c.numero.startsWith('4998'))) attendu.set(c.numero, '2/19 + 3/28');
    const observe = new Map<string, string>();
    for (const c of COMPTES_SEMIS) {
      const ici = NOTES_SYSCOHADA_2.filter((n) => rubriquesChiffrees(n).some((r) => capte(r, c.numero))).map((n) => `2/${n.code}`);
      const laBas = NOTES_SYSCOHADA_3.filter((n) => rubriquesChiffrees(n).some((r) => capte(r, c.numero))).map((n) => `3/${n.code}`);
      if (ici.length && laBas.length) observe.set(c.numero, [...ici, ...laBas].join(' + '));
    }
    expect([...observe.entries()].sort()).toEqual([...attendu.entries()].sort());
    // Et le renvoi officiel est bien porté par la ligne des 499/599, seule.
    const provisions = rubriquesChiffrees(noteDe('19')).find((r) => r.renvoi === '28')!;
    expect(capte(provisions, '49910000')).toBe(true);
  });
});
