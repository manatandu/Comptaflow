import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NOTES_ASSOCIATIONS } from './correspondance-notes-associations';
import { codesDistincts, compteSeme, etiquette, toutesLesRubriques } from './notes-sycebnl.commun';

/**
 * NOTES ANNEXES DU JEU « ASSOCIATIONS ET ORDRES PROFESSIONNELS ».
 *
 * Mille neuf cent vingt lignes de table, quarante-cinq tableaux, cinq cent
 * dix-huit rubriques, et AUCUN garde-fou dédié jusqu'au 2026-09-03. Côté
 * SYSCOHADA, les mêmes tables en portent cent sept. C'est le référentiel qui
 * tourne chez les clients qui était le moins gardé.
 *
 * Le balayage du 2026-09-03 n'a trouvé AUCUN défaut : pas de compte fantôme,
 * pas d'exclusion inutile, pas de contradiction, couverture exacte de la
 * liste officielle. Ces tests ne corrigent donc rien · ils VERROUILLENT ce
 * qui est juste aujourd'hui et que rien n'empêchait de dériver demain.
 *
 * Liste officielle : Acte uniforme SYCEBNL, Partie 4, chapitre 2 (états
 * financiers des associations et ordres professionnels), quarante-cinq
 * tableaux pour trente-cinq numéros de tête.
 */

/** Les 45 codes, dans l'ordre du texte. Transcrits, jamais déduits. */
const CODES_OFFICIELS = [
  '1', '2', '3', '4',
  '5A', '5B', '5C', '5D', '5E', '5F', '5G', '5H',
  '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16',
  '17A', '17B', '18A', '18B',
  '19', '20', '21', '22', '23', '24', '25', '26', '27', '28',
  '29A', '29B',
  '30', '31', '32', '33', '34', '35',
];

/**
 * Tableaux dont le contenu ne vient PAS de la balance · relevé du 2026-09-03.
 * Informations générales du dossier, effectifs, engagements, informations
 * sociales et environnementales, tableaux de mouvements saisis.
 */
const HORS_BALANCE_RELEVES = [
  '1 / ENGAGEMENTS FINANCIERS',
  '18B',
  '2',
  '29B / PERSONNEL EXTERIEUR ET BENEVOLE',
  '29B / PERSONNEL PROPRE',
  '3',
  '33',
  '34',
  '35',
  '4',
  '5G',
  '5H',
];

describe('couverture de la liste officielle', () => {
  it('porte les 45 tableaux du chapitre 2, ni un de plus ni un de moins', () => {
    const codes = codesDistincts(NOTES_ASSOCIATIONS);
    expect(codes.filter((c) => !CODES_OFFICIELS.includes(c))).toEqual([]);
    expect(CODES_OFFICIELS.filter((c) => !codes.includes(c))).toEqual([]);
    expect(codes).toHaveLength(45);
  });

  it('les trente-cinq numéros de tête sont tous représentés', () => {
    // 5A à 5H sont huit tableaux d'UNE note · la fiche récapitulative compte
    // les notes officielles, pas les tableaux. Confondre les deux fausserait
    // le décompte qu'un réviseur rapproche du texte.
    const tetes = new Set(codesDistincts(NOTES_ASSOCIATIONS).map((c) => /^(\d+)/.exec(c)![1]));
    expect(tetes.size).toBe(35);
  });

  it('un code partagé par plusieurs tableaux les NOMME tous', () => {
    // Le texte n'attribue un code propre (5A à 5H) que là où il veut des
    // notes séparées. Là où il ne le fait pas, plusieurs tableaux cohabitent
    // sous un code · sans `sousTableau` ils seraient indistinguables, et le
    // second écraserait le premier à l'affichage comme à l'export.
    const parCode = new Map<string, number>();
    for (const n of NOTES_ASSOCIATIONS) parCode.set(n.code, (parCode.get(n.code) ?? 0) + 1);
    for (const n of NOTES_ASSOCIATIONS) {
      if (parCode.get(n.code)! > 1) {
        expect([n.code, Boolean(n.sousTableau)]).toEqual([n.code, true]);
      }
    }
    // Relevé du 2026-09-03 · gelé pour qu'un tableau ajouté ou retiré se voie.
    const multiples = [...parCode].filter(([, n]) => n > 1).map(([c, n]) => `${c}×${n}`);
    expect(multiples.sort()).toEqual(['1×3', '29B×2', '7×2']);
  });

  it('aucun tableau en double · une étiquette ne désigne qu’une chose', () => {
    const etiquettes = NOTES_ASSOCIATIONS.map(etiquette);
    expect(etiquettes.filter((e, i) => etiquettes.indexOf(e) !== i)).toEqual([]);
  });
});

describe('l’export ne peut pas perdre une note en silence', () => {
  /**
   * Le classeur Excel ne suit PAS l'ordre de déclaration de la table : il a sa
   * propre liste, découpée selon les quatre parties de la fiche
   * récapitulative. Une note ajoutée ici et oubliée là ne sortirait donc
   * jamais au classeur, sans qu'aucune erreur ne le dise · c'est la panne
   * silencieuse type de ce module.
   */
  function codesDeLExport(): string[] {
    const source = readFileSync(join(__dirname, '../exports/export.service.ts'), 'utf8');
    const debut = source.indexOf('PARTIES_NOTES_ASSOCIATIONS: Array<[string, string[]]> = [');
    const bloc = source.slice(debut, source.indexOf('\n  ];', debut));
    return [...bloc.matchAll(/'([\w ]+)'/g)].map((m) => m[1]).filter((s) => !s.startsWith('Partie'));
  }

  it('les quatre parties couvrent exactement les 45 codes, chacun une fois', () => {
    const aLExport = codesDeLExport();
    expect(aLExport.filter((c, i) => aLExport.indexOf(c) !== i)).toEqual([]);
    expect(aLExport.sort()).toEqual([...CODES_OFFICIELS].sort());
  });

  it('les parties suivent le découpage officiel de la fiche récapitulative', () => {
    // Informations générales, bilan, compte de résultat, autres · l'ordre du
    // texte, qui est celui dans lequel un réviseur feuillette la liasse.
    expect(codesDeLExport()).toEqual(CODES_OFFICIELS);
  });
});

describe('les comptes cités existent vraiment', () => {
  it('aucun préfixe de compte absent du plan SYCEBNL semé', () => {
    // LA GARDE QUI COMPTE. Un compte faux dans une note ne lève aucune erreur,
    // ne casse aucun test, et ne se découvre qu'au dépôt des états
    // (CLAUDE.md §1). Le risque le plus probable est la contamination par le
    // plan SYSCOHADA, dont les numéros se ressemblent sans se recouvrir.
    const fantomes: string[] = [];
    for (const { note, rubrique } of toutesLesRubriques(NOTES_ASSOCIATIONS)) {
      for (const p of rubrique.comptes ?? []) {
        if (!compteSeme(p)) fantomes.push(`${etiquette(note)} · ${rubrique.libelle} · ${p}`);
      }
      for (const e of rubrique.exclusions ?? []) {
        if (!compteSeme(e)) fantomes.push(`${etiquette(note)} · ${rubrique.libelle} · exclusion ${e}`);
      }
    }
    expect(fantomes).toEqual([]);
  });

  it('aucune exclusion qui n’exclut rien', () => {
    // Une exclusion hors du périmètre qu'elle prétend restreindre est sans
    // effet · et une exclusion sans effet est presque toujours le signe qu'on
    // a visé le mauvais compte.
    const inutiles: string[] = [];
    for (const { note, rubrique } of toutesLesRubriques(NOTES_ASSOCIATIONS)) {
      for (const e of rubrique.exclusions ?? []) {
        if (!(rubrique.comptes ?? []).some((p) => e.startsWith(p))) {
          inutiles.push(`${etiquette(note)} · ${rubrique.libelle} · exclut ${e} hors de [${(rubrique.comptes ?? []).join(', ')}]`);
        }
      }
    }
    expect(inutiles).toEqual([]);
  });
});

describe('cohérence de chaque rubrique', () => {
  it('une rubrique en attente de subdivision ne porte PAS de comptes', () => {
    // Les deux se contrediraient : ou le plan normalisé détermine le
    // rattachement, ou il ne le porte pas et le dossier doit créer ses
    // sous-comptes. Porter les deux ferait afficher un montant tout en
    // réclamant un rattachement.
    for (const { note, rubrique } of toutesLesRubriques(NOTES_ASSOCIATIONS)) {
      if (rubrique.subdivisionAttendue) {
        expect([etiquette(note), rubrique.libelle, rubrique.comptes ?? []]).toEqual([
          etiquette(note),
          rubrique.libelle,
          [],
        ]);
      }
    }
  });

  it('une rubrique en attente de subdivision porte une CLÉ', () => {
    // C'est elle qui ancre le rattachement du dossier (RattachementNote).
    // S'appuyer sur le libellé serait fragile · une apostrophe typée
    // autrement, et tous les rattachements tomberaient en silence.
    for (const { note, rubrique } of toutesLesRubriques(NOTES_ASSOCIATIONS)) {
      if (rubrique.subdivisionAttendue) {
        expect([etiquette(note), rubrique.libelle, Boolean(rubrique.cle)]).toEqual([
          etiquette(note),
          rubrique.libelle,
          true,
        ]);
      }
    }
  });

  it('les clés sont uniques à l’intérieur d’un même tableau', () => {
    // Deux rubriques de même clé feraient pointer un rattachement sur la
    // mauvaise ligne, sans erreur visible.
    for (const note of NOTES_ASSOCIATIONS) {
      const cles = note.rubriques.map((r) => r.cle).filter(Boolean);
      expect([etiquette(note), cles.filter((c, i) => cles.indexOf(c) !== i)]).toEqual([etiquette(note), []]);
    }
  });

  it('un total ne renvoie qu’à des rubriques qui existent, et jamais à lui-même', () => {
    // Un index hors bornes donnerait un total silencieusement faux ; un
    // renvoi sur soi une récursion.
    for (const note of NOTES_ASSOCIATIONS) {
      note.rubriques.forEach((r, i) => {
        for (const index of [...(r.totalDeRubriques ?? []), ...(r.moinsRubriques ?? [])]) {
          expect([etiquette(note), r.libelle, index >= 0 && index < note.rubriques.length && index !== i]).toEqual([
            etiquette(note),
            r.libelle,
            true,
          ]);
        }
      });
    }
  });

  it('« moins » ne s’emploie qu’avec un total', () => {
    // `moinsRubriques` retranche du total ; sans total il ne retrancherait de
    // rien et la ligne serait muette.
    for (const { note, rubrique } of toutesLesRubriques(NOTES_ASSOCIATIONS)) {
      if (rubrique.moinsRubriques?.length) {
        expect([etiquette(note), rubrique.libelle, Boolean(rubrique.totalDeRubriques?.length)]).toEqual([
          etiquette(note),
          rubrique.libelle,
          true,
        ]);
      }
    }
  });

  it('aucun libellé vide, aucun titre vide', () => {
    for (const note of NOTES_ASSOCIATIONS) {
      expect([etiquette(note), note.titre.trim().length > 0]).toEqual([etiquette(note), true]);
      expect([etiquette(note), note.colonnes.length > 0]).toEqual([etiquette(note), true]);
      expect([etiquette(note), note.rubriques.length > 0]).toEqual([etiquette(note), true]);
      for (const r of note.rubriques) {
        expect([etiquette(note), r.libelle.trim().length > 0]).toEqual([etiquette(note), true]);
      }
    }
  });

  it('les colonnes d’un tableau ne se répètent pas', () => {
    // Une colonne porte un TYPE et un LIBELLÉ, pas de clé · deux colonnes
    // identiques sur les deux seraient une duplication de la maquette.
    for (const note of NOTES_ASSOCIATIONS) {
      const signatures = note.colonnes.map((c) => `${c.type}·${c.libelle}`);
      expect([etiquette(note), signatures.filter((s, i) => signatures.indexOf(s) !== i)]).toEqual([etiquette(note), []]);
    }
  });
});

describe('une note hors balance ne chiffre rien', () => {
  it('aucune rubrique à comptes dans un tableau déclaré hors balance', () => {
    // Effectifs, informations sociales et environnementales, engagements : la
    // balance ne les porte pas. Y rattacher un compte ferait sortir un chiffre
    // là où le texte attend une saisie.
    for (const note of NOTES_ASSOCIATIONS) {
      if (!note.horsBalance) continue;
      const chiffrees = note.rubriques.filter((r) => (r.comptes ?? []).length > 0).map((r) => r.libelle);
      expect([etiquette(note), chiffrees]).toEqual([etiquette(note), []]);
    }
  });

  it('la liste des tableaux hors balance est GELÉE', () => {
    // Un tableau qui basculerait hors balance cesserait d'être calculé sans
    // qu'aucun test ne tombe · l'écran afficherait une saisie vide au lieu
    // d'un montant. La liste est donc nommée, pas comptée.
    const horsBalance = NOTES_ASSOCIATIONS.filter((n) => n.horsBalance).map(etiquette).sort();
    expect(horsBalance).toEqual(HORS_BALANCE_RELEVES);
  });
});
