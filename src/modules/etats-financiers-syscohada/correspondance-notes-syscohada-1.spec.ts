import { PLAN_COMPTES_SYSCOHADA } from '../comptes/compte-seed-syscohada';
import { correspond } from '../etats-financiers/etats-financiers.communs';
import { RubriqueNote, SpecificationNote } from '../notes-annexes/note-annexe.types';
import {
  COMPTES_BILAN_SANS_POSTE_JUSTIFIES,
  ORDRE_AFFICHAGE_ACTIF_SYSCOHADA,
  ORDRE_AFFICHAGE_PASSIF_SYSCOHADA,
  POSTES_ACTIF_SYSCOHADA,
  POSTES_PASSIF_SYSCOHADA,
} from './correspondance-bilan-syscohada';
import { ORDRE_AFFICHAGE_COMPTE_RESULTAT } from './correspondance-compte-resultat-syscohada';
import { CODES_NOTES_SYSCOHADA_1, NOTES_SYSCOHADA_1 } from './correspondance-notes-syscohada-1';

/**
 * Intégrité structurelle des notes annexes SYSCOHADA, première tranche.
 * Ces tests relisent la SOURCE (la liste du ch. 6, le plan semé, les postes
 * du ch. 7) plutôt que d'affirmer que la table est juste : une note oubliée,
 * un total qui lit une ligne postérieure (donc 0), un compte cité qui
 * n'existe pas au plan, une note qui ne recoupe plus le poste qu'elle
 * documente · autant d'erreurs qui ne lèvent aucune exception et ne se
 * verraient qu'au dépôt des états.
 */

/** Comptes d'imputation (feuilles) du semis, toutes classes · la note 12 cite des produits (781, 787). */
const FEUILLES = PLAN_COMPTES_SYSCOHADA.filter((c) => c.typeCompte !== 'TOTAL');
/** Les mêmes, classes de bilan 1 à 5 seulement · pour les recoupements avec les postes du ch. 7. */
const FEUILLES_BILAN = FEUILLES.filter((c) => /^[1-5]/.test(c.numero));

/** Types de colonnes que `NoteAnnexeService` sait calculer ou présenter (une LIBRE est une saisie assumée). */
const COLONNES_CONNUES = [
  'EXERCICE_N', 'EXERCICE_N1', 'VARIATION_VALEUR', 'VARIATION_POURCENT', 'VARIATION_VALEUR_ABSOLUE',
  'OUVERTURE', 'AUGMENTATIONS', 'DIMINUTIONS', 'CLOTURE',
  'AUGMENTATION_EXPLOITATION', 'AUGMENTATION_FINANCIERE', 'AUGMENTATION_HAO',
  'DIMINUTION_EXPLOITATION', 'DIMINUTION_FINANCIERE', 'DIMINUTION_HAO',
  'ECHEANCE_1AN', 'ECHEANCE_2ANS', 'ECHEANCE_PLUS_2ANS', 'LIBRE',
];

const etiquette = (spec: SpecificationNote) => `${spec.code}${spec.sousTableau ? ` · ${spec.sousTableau}` : ''}`;

/** Tous les préfixes qu'une note cite, avec leur rôle, pour vérifier qu'ils existent au plan. */
function prefixesCites(): { note: string; rubrique: string; prefixe: string; role: string }[] {
  const out: { note: string; rubrique: string; prefixe: string; role: string }[] = [];
  for (const spec of NOTES_SYSCOHADA_1) {
    for (const r of spec.rubriques) {
      r.comptes?.forEach((p) => out.push({ note: etiquette(spec), rubrique: r.libelle, prefixe: p, role: 'comptes' }));
      r.exclusions?.forEach((p) => out.push({ note: etiquette(spec), rubrique: r.libelle, prefixe: p, role: 'exclusions' }));
    }
  }
  return out;
}

const noteUnique = (code: string, sousTableau?: string) => {
  const s = NOTES_SYSCOHADA_1.find((n) => n.code === code && (sousTableau === undefined || n.sousTableau === sousTableau));
  if (!s) throw new Error(`note ${code} ${sousTableau ?? ''} absente`);
  return s;
};

const poste = (ref: string) => {
  const p = [...POSTES_ACTIF_SYSCOHADA, ...POSTES_PASSIF_SYSCOHADA].find((x) => x.ref === ref);
  if (!p) throw new Error(`poste ${ref} absent du bilan SYSCOHADA`);
  return p;
};

/** Rubriques d'une note qui portent des comptes, séparées en « brut » et « dépréciations » (presenterEnNegatif). */
const rubriquesChiffrees = (spec: SpecificationNote, negatives: boolean): RubriqueNote[] =>
  spec.rubriques.filter((r) => (r.comptes?.length ?? 0) > 0 && !!r.presenterEnNegatif === negatives);

const capteParRubriques = (numero: string, rubriques: RubriqueNote[]) =>
  rubriques.some((r) => correspond(numero, r.comptes ?? [], r.exclusions));

describe('correspondance des notes annexes SYSCOHADA · tranche 1 (AUDCIF Titre IX ch. 6 et ch. 7)', () => {
  it('transcrit exactement les codes de la tranche, ni un de plus ni un de moins', () => {
    const transcrits = [...new Set(NOTES_SYSCOHADA_1.map((n) => n.code))];
    expect([...transcrits].sort()).toEqual([...CODES_NOTES_SYSCOHADA_1].sort());
    // La liste du ch. 6 section 2 est lue, pas déduite : 3A à 3F, pas de
    // 3G, 15A et 15B, pas de 15C. Et surtout AUCUNE « 8A » (anomalie n° 1).
    expect(CODES_NOTES_SYSCOHADA_1).toEqual([
      '1', '2', '3A', '3B', '3C', '3D', '3E', '3F', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15A', '15B',
    ]);
    expect(NOTES_SYSCOHADA_1.some((n) => n.code === '8A')).toBe(false);
  });

  it('aucun tableau en double · un code seul, ou un code et son sous-tableau', () => {
    const cles = NOTES_SYSCOHADA_1.map((n) => `${n.code}::${n.sousTableau ?? ''}`);
    expect(new Set(cles).size).toBe(cles.length);
  });

  it('une note à plusieurs tableaux les nomme TOUS · sinon deux tableaux se confondent', () => {
    const parCode = new Map<string, number>();
    for (const n of NOTES_SYSCOHADA_1) parCode.set(n.code, (parCode.get(n.code) ?? 0) + 1);
    for (const n of NOTES_SYSCOHADA_1) {
      const multiple = (parCode.get(n.code) ?? 0) > 1;
      expect({ code: n.code, nomme: !multiple || !!n.sousTableau }).toEqual({ code: n.code, nomme: true });
    }
    // Les notes bicéphales du texte : 1 (sûretés, engagements), 4
    // (immobilisations financières, filiales), 5 (BA, DH), 12 (écarts,
    // transferts de charges).
    for (const code of ['1', '4', '5', '12']) expect(parCode.get(code)).toBe(2);
  });

  it('un total ne référence jamais une rubrique qui vient APRÈS lui · sinon le calcul en une passe lirait 0', () => {
    for (const spec of NOTES_SYSCOHADA_1) {
      spec.rubriques.forEach((r, i) => {
        for (const idx of [...(r.totalDeRubriques ?? []), ...(r.moinsRubriques ?? [])]) {
          expect({ note: etiquette(spec), rubrique: r.libelle, avant: idx < i }).toEqual(
            { note: etiquette(spec), rubrique: r.libelle, avant: true },
          );
        }
      });
    }
  });

  it('un total ne compte jamais deux fois la même ligne, ni directement ni par un sous-total', () => {
    // Un TOTAL GÉNÉRAL qui additionne un sous-total ET une de ses lignes
    // doublerait cette ligne sans qu'aucune exception ne le dise.
    for (const spec of NOTES_SYSCOHADA_1) {
      const feuillesDe = (i: number, vues = new Set<number>()): Set<number> => {
        const r = spec.rubriques[i];
        if (!r.totalDeRubriques) return vues.add(i);
        for (const j of r.totalDeRubriques) feuillesDe(j, vues);
        return vues;
      };
      spec.rubriques.forEach((r, i) => {
        if (!r.totalDeRubriques) return;
        const feuilles = r.totalDeRubriques.flatMap((j) => [...feuillesDe(j)]);
        expect({ note: etiquette(spec), total: r.libelle, doublons: feuilles.length - new Set(feuilles).size }).toEqual(
          { note: etiquette(spec), total: r.libelle, doublons: 0 },
        );
        expect(i).toBeGreaterThan(Math.max(...r.totalDeRubriques));
      });
    }
  });

  it('une rubrique porte soit des comptes, soit un total, soit une subdivision attendue, soit une saisie · jamais rien', () => {
    for (const spec of NOTES_SYSCOHADA_1) {
      for (const r of spec.rubriques) {
        const definie =
          (r.comptes?.length ?? 0) > 0 || r.totalDeRubriques !== undefined || r.subdivisionAttendue !== undefined || r.saisie === true;
        expect({ note: etiquette(spec), rubrique: r.libelle, definie }).toEqual({ note: etiquette(spec), rubrique: r.libelle, definie: true });
      }
    }
  });

  it('toute rubrique en attente de rattachement porte une clé stable, unique dans sa note', () => {
    const parCode = new Map<string, string[]>();
    for (const spec of NOTES_SYSCOHADA_1) {
      for (const r of spec.rubriques) {
        if (r.subdivisionAttendue) {
          expect({ note: etiquette(spec), libelle: r.libelle, cle: r.cle ?? null }).toEqual(
            expect.objectContaining({ cle: expect.any(String) }),
          );
        }
        if (r.cle) parCode.set(spec.code, [...(parCode.get(spec.code) ?? []), r.cle]);
      }
    }
    // Unicité par CODE de note (tous sous-tableaux confondus) : c'est le code
    // qui ancre le rattachement par dossier.
    for (const [code, cles] of parCode) {
      expect({ code, uniques: new Set(cles).size === cles.length }).toEqual({ code, uniques: true });
    }
  });

  it('une rubrique en SAISIE n’est jamais confondue avec une rubrique en attente de rattachement, et ne porte pas de comptes', () => {
    for (const spec of NOTES_SYSCOHADA_1) {
      for (const r of spec.rubriques) {
        expect({ note: etiquette(spec), r: r.libelle, cumul: !!(r.saisie && r.subdivisionAttendue) }).toEqual(
          { note: etiquette(spec), r: r.libelle, cumul: false },
        );
        expect({ note: etiquette(spec), r: r.libelle, comptes: !!(r.saisie && r.comptes?.length) }).toEqual(
          { note: etiquette(spec), r: r.libelle, comptes: false },
        );
      }
    }
  });

  it('une note hors balance ne cite aucun compte · sinon elle serait calculée et la mention « à renseigner » fausse', () => {
    for (const spec of NOTES_SYSCOHADA_1.filter((n) => n.horsBalance)) {
      expect({ note: etiquette(spec), comptes: spec.rubriques.some((r) => (r.comptes?.length ?? 0) > 0) }).toEqual(
        { note: etiquette(spec), comptes: false },
      );
      expect(spec.rubriques.length).toBeGreaterThan(0);
    }
    // Les notes déclaratives de la tranche, lues au ch. 6 : 2, 3D, 3E, 3F,
    // et les seconds tableaux des notes 1 et 4.
    const horsBalance = NOTES_SYSCOHADA_1.filter((n) => n.horsBalance).map(etiquette).sort();
    expect(horsBalance).toEqual(
      ['1 · ENGAGEMENTS FINANCIERS', '2', '3D', '3E', '3F', '4 · LISTE DES FILIALES ET PARTICIPATIONS'].sort(),
    );
  });

  it('sens et natureCreditrice ne se cumulent jamais : l’un filtre, l’autre non', () => {
    for (const spec of NOTES_SYSCOHADA_1) {
      for (const r of spec.rubriques) {
        expect({ note: etiquette(spec), r: r.libelle, cumul: !!(r.sens && r.natureCreditrice) }).toEqual(
          { note: etiquette(spec), r: r.libelle, cumul: false },
        );
      }
    }
  });

  it('toute colonne déclarée est d’un type que le moteur calcule ou présente, et chaque note a un titre', () => {
    for (const spec of NOTES_SYSCOHADA_1) {
      expect(spec.colonnes.length).toBeGreaterThan(0);
      expect(spec.titre.trim().length).toBeGreaterThan(0);
      for (const c of spec.colonnes) {
        expect({ note: etiquette(spec), colonne: c.libelle, connue: COLONNES_CONNUES.includes(c.type) }).toEqual(
          { note: etiquette(spec), colonne: c.libelle, connue: true },
        );
      }
      // Deux colonnes du même libellé seraient indistinguables à l'écran
      // (les deux « Virements de poste à poste » de la 3A sont préfixées).
      const libelles = spec.colonnes.map((c) => c.libelle);
      expect(new Set(libelles).size).toBe(libelles.length);
    }
  });

  it('un tableau de situations et mouvements déclare A, B, C et D ensemble, et le sens d’accroissement des amortissements', () => {
    for (const spec of NOTES_SYSCOHADA_1) {
      const types = spec.colonnes.map((c) => c.type);
      const mouvement = ['OUVERTURE', 'AUGMENTATIONS', 'DIMINUTIONS', 'CLOTURE'].filter((t) => types.includes(t as never));
      expect({ note: etiquette(spec), colonnes: mouvement.length === 0 || mouvement.length === 4 }).toEqual(
        { note: etiquette(spec), colonnes: true },
      );
    }
    expect(noteUnique('3A').sensAccroissement).toBeUndefined();
    expect(noteUnique('3B').sensAccroissement).toBeUndefined();
    expect(noteUnique('3C').sensAccroissement).toBe('CREDIT');
  });

  it('chaque compte cité existe au plan SYSCOHADA semé · un préfixe fantôme ne capterait rien, en silence', () => {
    for (const cite of prefixesCites()) {
      const existe = PLAN_COMPTES_SYSCOHADA.some((c) => c.numero.startsWith(cite.prefixe));
      expect({ ...cite, existe }).toEqual({ ...cite, existe: true });
      // Un préfixe doit atteindre au moins UN compte d'imputation : un jeton
      // qui ne toucherait qu'un compte TOTAL ne verrait aucune ligne de
      // balance.
      const feuille = FEUILLES.some((c) => c.numero.startsWith(cite.prefixe));
      expect({ ...cite, feuille }).toEqual({ ...cite, feuille: true });
    }
  });

  it('une exclusion est toujours contenue dans un préfixe de la même rubrique · sinon elle est lettre morte', () => {
    for (const spec of NOTES_SYSCOHADA_1) {
      for (const r of spec.rubriques) {
        for (const e of r.exclusions ?? []) {
          const couverte = (r.comptes ?? []).some((p) => e.startsWith(p));
          expect({ note: etiquette(spec), rubrique: r.libelle, exclusion: e, couverte }).toEqual(
            { note: etiquette(spec), rubrique: r.libelle, exclusion: e, couverte: true },
          );
        }
      }
    }
  });

  it('dans une même note, une feuille du plan n’est captée que par UNE rubrique chiffrée · sinon elle serait comptée deux fois', () => {
    for (const spec of NOTES_SYSCOHADA_1) {
      const chiffrees = spec.rubriques.filter((r) => (r.comptes?.length ?? 0) > 0);
      for (const c of FEUILLES_BILAN) {
        const captantes = chiffrees.filter((r) => correspond(c.numero, r.comptes ?? [], r.exclusions));
        // Les tiers polyvalents peuvent figurer dans deux rubriques de SENS
        // opposé (note 7 : 419 n'est pas concerné ; note 1 : aucun
        // doublon) ; deux rubriques de même sens sur la même feuille sont
        // un double comptage.
        const sens = new Set(captantes.map((r) => r.sens ?? (r.natureCreditrice ? 'CREDITEUR' : 'DEBITEUR')));
        expect({ note: etiquette(spec), compte: c.numero, doublon: captantes.length > sens.size }).toEqual(
          { note: etiquette(spec), compte: c.numero, doublon: false },
        );
      }
    }
  });

  describe('recoupement note ↔ poste de bilan (ch. 7) · une note documente un poste, elle doit en couvrir les comptes', () => {
    /**
     * Chaque paire (note, postes) avec ses exceptions DOCUMENTÉES : les
     * préfixes que la note capte au-delà du poste (anomalie n° 6 : 186 à
     * 188 en note 8) et ceux que le poste capte sans la note (aucun attendu).
     */
    const paires: { note: SpecificationNote; brut: string[]; deprec: string[]; horsPoste?: string[] }[] = [
      // La 3A est la seule note de la tranche qui couvre TOUTE l'immobilisé
      // (classes 21 à 27) : sans ce recoupement, une ligne oubliée ferait
      // diverger le TOTAL GÉNÉRAL de la note du total AZ du bilan en silence.
      // Elle n'a pas de colonne de dépréciation (c'est la 3C, puis la 28).
      {
        note: noteUnique('3A'),
        brut: ['AE', 'AF', 'AG', 'AH', 'AJ', 'AK', 'AL', 'AM', 'AN', 'AP', 'AR', 'AS'],
        deprec: [],
      },
      { note: noteUnique('4', 'IMMOBILISATIONS FINANCIÈRES'), brut: ['AR', 'AS'], deprec: ['AR', 'AS'] },
      { note: noteUnique('5', 'ACTIF CIRCULANT HAO'), brut: ['BA'], deprec: ['BA'] },
      { note: noteUnique('5', 'DETTES CIRCULANTES HAO'), brut: ['DH'], deprec: [] },
      { note: noteUnique('6'), brut: ['BB'], deprec: ['BB'] },
      // Note 7 : 41 sauf 419 (BI) PUIS 419 (DI) dans le même tableau.
      { note: noteUnique('7'), brut: ['BI', 'DI'], deprec: ['BI'] },
      { note: noteUnique('8'), brut: ['BJ'], deprec: ['BJ'], horsPoste: ['186', '187', '188'] },
      { note: noteUnique('9'), brut: ['BQ'], deprec: ['BQ'] },
      { note: noteUnique('10'), brut: ['BR'], deprec: ['BR'] },
      { note: noteUnique('11'), brut: ['BS'], deprec: ['BS'] },
      { note: noteUnique('12', 'ÉCARTS DE CONVERSION'), brut: ['BU', 'DV'], deprec: [] },
      { note: noteUnique('13'), brut: ['CA', 'CB'], deprec: [] },
      { note: noteUnique('14'), brut: ['CD', 'CF', 'CG', 'CH'], deprec: [] },
      { note: noteUnique('15A'), brut: ['CL', 'CM'], deprec: [] },
      { note: noteUnique('1', 'DETTES GARANTIES PAR DES SÛRETÉS RÉELLES'), brut: ['DA', 'DB', 'DJ', 'DI', 'DK', 'DM'], deprec: [] },
    ];

    it.each(paires.map((p) => [etiquette(p.note), p] as const))('note %s', (_, { note, brut, deprec, horsPoste }) => {
      const postesBrut = brut.map(poste);
      const postesDeprec = deprec.map(poste);
      // Une note sans poste de dépréciation (13 : 109 « en moins » comme CB)
      // présente ses lignes négatives comme du brut du poste.
      const rubBrut = deprec.length ? rubriquesChiffrees(note, false) : note.rubriques.filter((r) => (r.comptes?.length ?? 0) > 0);
      const rubDeprec = deprec.length ? rubriquesChiffrees(note, true) : [];
      for (const c of FEUILLES_BILAN) {
        const dansPosteBrut = postesBrut.some((p) => correspond(c.numero, p.comptes, p.exclusions));
        const dansPosteDeprec = postesDeprec.some(
          (p) => p.comptesAmortissement !== undefined && correspond(c.numero, p.comptesAmortissement, p.exclusionsAmortissement),
        );
        const dansNoteBrut = capteParRubriques(c.numero, rubBrut);
        const dansNoteDeprec = capteParRubriques(c.numero, rubDeprec);
        const tolere = (horsPoste ?? []).some((p) => c.numero.startsWith(p));
        // Tout compte du poste est dans la note (sinon la note diverge du
        // poste qu'elle documente, sans qu'aucun total ne le dise).
        expect({ compte: c.numero, posteBrut: dansPosteBrut, noteBrut: dansNoteBrut || !dansPosteBrut }).toEqual(
          { compte: c.numero, posteBrut: dansPosteBrut, noteBrut: true },
        );
        expect({ compte: c.numero, posteDeprec: dansPosteDeprec, noteDeprec: dansNoteDeprec || !dansPosteDeprec }).toEqual(
          { compte: c.numero, posteDeprec: dansPosteDeprec, noteDeprec: true },
        );
        // Tout compte de la note est dans le poste, sauf exception documentée.
        expect({ compte: c.numero, noteBrut: dansNoteBrut, posteBrut: dansPosteBrut || tolere || !dansNoteBrut }).toEqual(
          { compte: c.numero, noteBrut: dansNoteBrut, posteBrut: true },
        );
        expect({ compte: c.numero, noteDeprec: dansNoteDeprec, posteDeprec: dansPosteDeprec || !dansNoteDeprec }).toEqual(
          { compte: c.numero, noteDeprec: dansNoteDeprec, posteDeprec: true },
        );
      }
    });

    it('les comptes que la note 8 capte hors de BJ sont exactement les orphelins justifiés du bilan (186, 187, 188)', () => {
      const justifies = COMPTES_BILAN_SANS_POSTE_JUSTIFIES.map((c) => c.prefixe).filter((p) => p.startsWith('18'));
      expect(justifies.sort()).toEqual(['186', '187', '188']);
    });
  });

  describe('lettre du texte officiel, vérifiée ligne à ligne', () => {
    it('la note 1 renvoie chaque dette à la note qui la détaille (article 15, référence croisée)', () => {
      const n1 = noteUnique('1', 'DETTES GARANTIES PAR DES SÛRETÉS RÉELLES');
      const chiffrees = n1.rubriques.filter((r) => (r.comptes?.length ?? 0) > 0);
      for (const r of chiffrees) expect({ r: r.libelle, renvoi: r.renvoi }).toEqual(expect.objectContaining({ renvoi: expect.any(String) }));
      expect(n1.rubriques.at(-1)?.libelle).toBe('TOTAL (1) + (2) + (3)');
    });

    it('la note 3A distingue les immeubles de placement que le bilan ne montre qu’en renvoi', () => {
      const n3a = noteUnique('3A');
      const placement = n3a.rubriques.filter((r) => r.libelle.endsWith('immeuble de placement') && !r.libelle.includes('hors'));
      expect(placement.map((r) => r.comptes)).toEqual([['2281'], ['2315', '2325']]);
      // Et les lignes « hors placement » les EXCLUENT, sinon double comptage.
      const horsPlacement = n3a.rubriques.filter((r) => r.libelle.includes('hors immeuble de placement'));
      expect(horsPlacement.map((r) => r.exclusions)).toEqual([['2281'], ['2315', '2325']]);
    });

    it('anomalie n° 3 : les lignes incorporelles de la note 3B sont en saisie, jamais rattachées ni en attente', () => {
      const n3b = noteUnique('3B');
      const incorporelles = n3b.rubriques.slice(0, 3);
      expect(incorporelles.every((r) => r.saisie === true && !r.comptes && !r.subdivisionAttendue)).toBe(true);
      // Les divisionnaires de location-acquisition du Titre VII, et rien
      // d'autre (aucun actif biologique : 246 exclu par Titre VIII ch. 8).
      const cites = n3b.rubriques.flatMap((r) => r.comptes ?? []).sort();
      expect(cites).toEqual(['2286', '2316', '2326', '2416', '2426', '2446', '2456']);
    });

    it('la note 3C ne prend que les amortissements (28x) · les dépréciations (29x) relèvent de la note 28', () => {
      const cites = noteUnique('3C').rubriques.flatMap((r) => [...(r.comptes ?? []), ...(r.exclusions ?? [])]);
      expect(cites.every((p) => p.startsWith('28'))).toBe(true);
      // Chaque 28x du plan est capté une fois : le total général de la note
      // doit recouper la colonne « amortissements » du bilan.
      const rub = rubriquesChiffrees(noteUnique('3C'), false);
      for (const c of FEUILLES_BILAN.filter((c) => c.numero.startsWith('28'))) {
        expect({ compte: c.numero, capte: capteParRubriques(c.numero, rub) }).toEqual({ compte: c.numero, capte: true });
      }
    });

    it('anomalie n° 10 : les deux lignes « immeuble de placement » de la 3C sont en SAISIE, jamais rattachables', () => {
      // Le service AJOUTE les comptes rattachés aux préfixes officiels : un
      // sous-compte de 2831 rattaché à la ligne « placement » serait aussi
      // capté par le préfixe 2831 de la ligne « hors placement », donc compté
      // deux fois dans le sous-total et le TOTAL GÉNÉRAL. Les mettre en
      // attente de rattachement rendrait ce double comptage possible.
      const placement = noteUnique('3C').rubriques.filter(
        (r) => r.libelle.endsWith('immeuble de placement') && !r.libelle.includes('hors'),
      );
      expect(placement.map((r) => r.libelle)).toEqual([
        'Terrains - immeuble de placement',
        'Bâtiments - immeuble de placement',
      ]);
      for (const r of placement) {
        expect({ r: r.libelle, saisie: r.saisie, attente: r.subdivisionAttendue, comptes: r.comptes }).toEqual({
          r: r.libelle,
          saisie: true,
          attente: undefined,
          comptes: undefined,
        });
        // Le motif est porté SUR la ligne, pas seulement dans le code.
        expect(r.renvoi).toContain('compté deux fois');
      }
      expect(noteUnique('3C').rubriques.some((r) => r.subdivisionAttendue)).toBe(false);
    });

    it('anomalie n° 7 : TOUS les 52x et 53x de la note 11 sont filtrés au débit, comme le bilan les transfère en DR', () => {
      // Le NB officiel fait suivre 526 et 536 le sens de leur compte
      // PRINCIPAL, que la balance ne porte pas. Le ch. 7 tranche : « 52, 53 →
      // BS si débiteur, DR si créditeur », sans exception. Laisser 526 ou 536
      // sans filtre les ferait compter DEUX fois · en négatif ici, en positif
      // à la note 20 qui les prend au crédit. Le NB reste affiché.
      const n11 = noteUnique('11');
      const interets = n11.rubriques.filter((r) => r.libelle.includes('intérêts courus'));
      expect(interets.map((r) => [r.comptes, r.sens])).toEqual([
        [['526'], 'DEBITEUR'],
        [['536'], 'DEBITEUR'],
      ]);
      const bancaires = n11.rubriques.filter((r) => (r.comptes ?? []).some((p) => /^5[23]/.test(p)));
      expect(bancaires.every((r) => r.sens === 'DEBITEUR')).toBe(true);
      expect(bancaires.flatMap((r) => r.comptes ?? []).sort()).toEqual(['52', '521', '522', '525', '526', '53', '531', '536']);
      expect(n11.renvoiOfficiel).toContain('en négatif si le compte principal attaché est débiteur');
    });

    it('la note 8 isole le compte transitoire 475 et exclut LES DEUX écarts de conversion, comme le poste BJ', () => {
      const n8 = noteUnique('8');
      const transitoire = n8.rubriques.find((r) => r.libelle.startsWith('Compte transitoire'));
      expect(transitoire?.comptes).toEqual(['475']);
      const divers = n8.rubriques.find((r) => r.libelle === 'Autres débiteurs divers');
      // La lettre du ch. 7 ne retire que 478 de BJ. Le poste BJ retire aussi
      // 479 (anomalie n° 12 : 479 n'a qu'un poste, DV) et la note doit suivre
      // le poste qu'elle documente, sans quoi elle annoncerait un montant que
      // BJ ne porte pas. Ce test disait « à la lettre de BJ » et attendait
      // ['475','478'] : il contredisait le recoupement note ↔ poste du même
      // fichier, qui a trouvé l'écart. C'est lui qui avait raison.
      expect(divers?.exclusions).toEqual(['475', '478', '479']);
      expect(n8.rubriques.filter((r) => r.comptes && !r.presenterEnNegatif).every((r) => r.sens === 'DEBITEUR')).toBe(true);
    });

    it('la note 15A renvoie la provision spéciale de réévaluation à la note 3E', () => {
      const ligne = noteUnique('15A').rubriques.find((r) => r.libelle === 'Provision spéciale de réévaluation');
      expect(ligne).toEqual(expect.objectContaining({ comptes: ['154'], renvoi: '3E' }));
    });

    it('anomalie n° 8 : la note 15B ne rattache que 167 et 1613, le reste attend un sous-compte du dossier', () => {
      const n15b = noteUnique('15B');
      const cites = n15b.rubriques.flatMap((r) => r.comptes ?? []).sort();
      expect(cites).toEqual(['1613', '167']);
      const enAttente = n15b.rubriques.filter((r) => r.subdivisionAttendue).map((r) => r.cle);
      expect(enAttente).toEqual(['titres-participatifs', 'titres-subordonnes-duree-indeterminee', 'autres-fonds-propres']);
    });

    it('les renvois croisés couvrent tous les postes du bilan du ch. 3 qui renvoient à une note de la tranche', () => {
      // Colonne « Note » du modèle du ch. 3, lue : AD/AI/AP → 3, AQ → 4,
      // BA → 5, BB → 6, BI → 7, BJ → 8, BQ → 9, BR → 10, BS → 11, BU → 12,
      // CA/CB → 13, CD/CF/CG/CH → 14, CE → 3e, CL/CM → 15, DH → 5, DI → 7,
      // DV → 12. (BH → 17, DA à DR → 16 à 20 sont dans la seconde tranche.)
      const attendus = [
        'AD', 'AI', 'AP', 'AQ', 'BA', 'BB', 'BI', 'BJ', 'BQ', 'BR', 'BS', 'BU',
        'CA', 'CB', 'CD', 'CE', 'CF', 'CG', 'CH', 'CL', 'CM', 'DH', 'DI', 'DV',
      ];
      const renvoyes = new Set(NOTES_SYSCOHADA_1.flatMap((n) => n.renvoyeeDepuis ?? []));
      for (const ref of attendus) expect({ ref, renvoye: renvoyes.has(ref) }).toEqual({ ref, renvoye: true });
    });

    it('tout code de renvoi croisé existe au bilan ou au compte de résultat SYSCOHADA', () => {
      // Sans ce contrôle, un REF mal typé (« RL » écrit « RI », un code du
      // SYCEBNL recopié par mégarde) s'afficherait tel quel sous le titre de
      // la note, « Renvoyée depuis les postes : … », sans rien casser.
      const connus = new Set([
        ...ORDRE_AFFICHAGE_ACTIF_SYSCOHADA,
        ...ORDRE_AFFICHAGE_PASSIF_SYSCOHADA,
        ...ORDRE_AFFICHAGE_COMPTE_RESULTAT,
      ]);
      for (const spec of NOTES_SYSCOHADA_1) {
        for (const ref of spec.renvoyeeDepuis ?? []) {
          expect({ note: etiquette(spec), ref, connu: connus.has(ref) }).toEqual({ note: etiquette(spec), ref, connu: true });
        }
      }
    });

    it('anomalie n° 16 : aucun renvoi croisé INVENTÉ · seuls ceux du ch. 3 et des gloses du ch. 6', () => {
      // Le test précédent vérifie que chaque note attendue est renvoyée, pas
      // qu'aucune ne l'est de trop. Or `renvoyeeDepuis` est affiché à
      // l'utilisateur : écrire « note 1 · renvoyée depuis DA » serait faux,
      // le ch. 3 renvoyant DA à la NOTE 16. La liste est donc close et
      // justifiée note par note.
      const attendu: Record<string, string[]> = {
        // Colonne « Note » du bilan, ch. 3 (titre-9-ch1-5).
        '3A': ['AD', 'AI', 'AP'],
        // Idem, plus la glose du ch. 6 « note appelée par RL et RN ».
        '3C': ['AD', 'AI', 'AP', 'RL', 'RN'],
        '3D': ['TN', 'RO'],
        '3E': ['CE'],
        '4': ['AQ'],
        '5': ['BA', 'DH'],
        '6': ['BB', 'RB', 'TE', 'RD', 'RF'],
        '7': ['BI', 'DI'],
        '8': ['BJ'],
        '9': ['BQ'],
        '10': ['BR'],
        '11': ['BS'],
        '12': ['BU', 'DV', 'TI', 'TM'],
        '13': ['CA', 'CB'],
        '14': ['CD', 'CF', 'CG', 'CH'],
        '15A': ['CL', 'CM'],
      };
      const parCode = new Map<string, string[]>();
      for (const spec of NOTES_SYSCOHADA_1) {
        parCode.set(spec.code, [...(parCode.get(spec.code) ?? []), ...(spec.renvoyeeDepuis ?? [])]);
      }
      for (const [code, refs] of parCode) {
        expect({ code, refs: [...refs].sort() }).toEqual({ code, refs: [...(attendu[code] ?? [])].sort() });
      }
      // Les deux notes que le bilan NE renvoie PAS, malgré la tentation :
      // le ch. 3 envoie DA, DB et DC à la note 16.
      for (const spec of NOTES_SYSCOHADA_1.filter((n) => n.code === '1' || n.code === '15B')) {
        expect({ note: etiquette(spec), renvois: spec.renvoyeeDepuis }).toEqual(
          { note: etiquette(spec), renvois: undefined },
        );
      }
    });

    it('anomalie n° 5 : « Variation en valeur absolue » est la variation en MONTANT, pas un Math.abs', () => {
      // `VARIATION_VALEUR_ABSOLUE` est calculé `Math.abs(N − N-1)` par
      // NoteAnnexeService : une réserve qui baisse, un report à nouveau qui
      // passe de +100 à -50 ressortiraient POSITIFS. Dans le ch. 6, « valeur
      // absolue » s'oppose à « en % » (les notes 15A et 15B portent les deux
      // colonnes côte à côte) et désigne la variation en montant.
      for (const code of ['14', '15A', '15B']) {
        const colonne = noteUnique(code).colonnes.find((c) => c.libelle === 'Variation en valeur absolue');
        expect({ code, colonne: colonne?.type }).toEqual({ code, colonne: 'VARIATION_VALEUR' });
      }
      // Et le type Math.abs n'est employé nulle part dans la tranche.
      const absolues = NOTES_SYSCOHADA_1.flatMap((n) =>
        n.colonnes.filter((c) => c.type === 'VARIATION_VALEUR_ABSOLUE').map((c) => `${etiquette(n)} · ${c.libelle}`),
      );
      expect(absolues).toEqual([]);
    });

    it('anomalie n° 11 : le 109 de la note 13 est LU AU CRÉDIT, donc présenté en moins comme CB au bilan', () => {
      // Le service applique `presenterEnNegatif` en double négation (montant
      // par compte = -solde, puis total = -brut) : neutre sur un compte
      // créditeur, il rendrait le 109, débiteur, POSITIF · l'inverse du
      // « (-) » du modèle. `natureCreditrice` donne -solde, donc négatif.
      const n13 = noteUnique('13');
      const nonAppele = n13.rubriques.find((r) => r.libelle === 'Apporteurs, capital non appelé');
      expect(nonAppele).toEqual(
        expect.objectContaining({ comptes: ['109'], natureCreditrice: true, presenterEnNegatif: undefined }),
      );
      // Le poste CB est lu au PASSIF par le bilan : la note dit la même chose.
      expect(poste('CB').sens).toBe('PASSIF');
      expect(poste('CB').comptes).toEqual(['109']);
      // Le « TOTAL » de cette note n'est pas une addition des lignes
      // affichées (elles sont en saisie) : il porte CA. Dit sur la ligne.
      const total = n13.rubriques.find((r) => r.libelle === 'TOTAL');
      expect(total?.totalDeRubriques).toBeUndefined();
      expect(total?.comptes).toEqual(poste('CA').comptes);
      expect(total?.renvoi).toContain('n’est donc pas la somme arithmétique');
    });

    it('les lignes résiduelles sont écrites « préfixe sauf … » · un sous-compte créé par le dossier reste dans la note', () => {
      // Ch. 7, clés de lecture : « un numéro à deux chiffres englobe tous ses
      // divisionnaires ». Un poste écrit « 50 » prend un 507 que le dossier
      // créerait ; une note qui énumère 501 à 508 le perdrait, sans qu'aucun
      // total ne le dise et sans qu'aucun test sur le plan SEMÉ le voie.
      const cas: { note: SpecificationNote; ref: string; invente: string; rubrique: string }[] = [
        { note: noteUnique('4', 'IMMOBILISATIONS FINANCIÈRES'), ref: 'AS', invente: '27900000', rubrique: 'Prêts et créances' },
        { note: noteUnique('9'), ref: 'BQ', invente: '50700000', rubrique: 'Autres valeurs assimilés' },
        { note: noteUnique('10'), ref: 'BR', invente: '51600000', rubrique: 'Autres valeurs à encaisser' },
        { note: noteUnique('11'), ref: 'BS', invente: '52700000', rubrique: 'Autres banques' },
        { note: noteUnique('11'), ref: 'BS', invente: '53400000', rubrique: 'Autres établissement financiers' },
        { note: noteUnique('14'), ref: 'CD', invente: '10550000', rubrique: 'Autres primes' },
        { note: noteUnique('15A'), ref: 'CL', invente: '14200000', rubrique: 'Autres' },
      ];
      for (const { note, ref, invente, rubrique } of cas) {
        const p = poste(ref);
        // Le compte inventé appartient bien au poste (sinon le cas ne prouve rien).
        expect({ ref, invente, dansPoste: correspond(invente, p.comptes, p.exclusions) }).toEqual(
          { ref, invente, dansPoste: true },
        );
        const captantes = note.rubriques.filter((r) => (r.comptes?.length ?? 0) > 0 && correspond(invente, r.comptes!, r.exclusions));
        expect({ invente, captantes: captantes.map((r) => r.libelle) }).toEqual({ invente, captantes: [rubrique] });
      }
    });

    it('anomalie n° 6 : la note 4 SIGNALE sur la ligne les comptes que le modèle n’a pas de ligne pour recevoir', () => {
      const pretsEtCreances = noteUnique('4', 'IMMOBILISATIONS FINANCIÈRES').rubriques.find(
        (r) => r.libelle === 'Prêts et créances',
      );
      // 277 et 278 sont dans AS mais n'ont pas de ligne au modèle : captés
      // ici pour que la note recoupe le poste, et dits à l'écran.
      expect(correspond('27710000', pretsEtCreances!.comptes!, pretsEtCreances!.exclusions)).toBe(true);
      expect(correspond('27840000', pretsEtCreances!.comptes!, pretsEtCreances!.exclusions)).toBe(true);
      expect(pretsEtCreances?.renvoi).toContain('2784');
      expect(pretsEtCreances?.renvoi).toContain('2785');
    });

    it('anomalie n° 15 : la note 1 dit pourquoi les intérêts courus des deux blocs ne sont pas traités pareil', () => {
      const n1 = noteUnique('1', 'DETTES GARANTIES PAR DES SÛRETÉS RÉELLES');
      // Bloc DB : les quatre 176x suivent leur dette, il n'y a pas de ligne
      // résiduelle et le SOUS TOTAL (2) doit recouper DB = « 17 ».
      const locationAcquisition = n1.rubriques.filter((r) => (r.comptes ?? []).some((p) => p.startsWith('17')));
      expect(locationAcquisition.map((r) => r.comptes)).toEqual([
        ['172', '1762'],
        ['173', '1763'],
        ['174', '1764'],
        ['178', '1768'],
      ]);
      for (const c of FEUILLES_BILAN.filter((c) => c.numero.startsWith('17'))) {
        expect({ compte: c.numero, capte: capteParRubriques(c.numero, locationAcquisition) }).toEqual(
          { compte: c.numero, capte: true },
        );
      }
      // Bloc DA : 166 tombe dans la ligne résiduelle, 1661 ne pouvant pas
      // être partagé entre « convertibles » (1612) et « autres » (161 sauf 1612).
      const residuelle = n1.rubriques.find((r) => r.libelle === 'Autres dettes financières');
      expect(correspond('16610000', residuelle!.comptes!, residuelle!.exclusions)).toBe(true);
      expect(correspond('16620000', residuelle!.comptes!, residuelle!.exclusions)).toBe(true);
    });
  });
});
