import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NOTES_PROJETS } from './correspondance-notes-projets';
import { NOTES_ASSOCIATIONS } from './correspondance-notes-associations';
import { codesDistincts, compteSeme, etiquette, toutesLesRubriques } from './notes-sycebnl.commun';

/**
 * NOTES ANNEXES DU JEU « PROJETS DE DÉVELOPPEMENT ET ASSIMILÉS ».
 *
 * Pendant du balayage des associations, sur la seconde table SYCEBNL : vingt-
 * six tableaux, deux cent soixante rubriques, et aucun garde-fou dédié
 * jusqu'ici. Les deux jeux se ressemblent assez pour qu'une correction faite
 * d'un côté paraisse valoir de l'autre · ils ne partagent pourtant ni les
 * mêmes notes, ni les mêmes comptes, ni les mêmes états (CLAUDE.md §6).
 *
 * Le balayage du 2026-09-03 n'a trouvé AUCUN défaut : pas de compte fantôme,
 * pas d'exclusion sans effet, couverture exacte de la liste officielle, et
 * la lacune du texte sur la note 22 correctement signalée plutôt que comblée.
 * Ces tests ne corrigent donc rien · ils verrouillent ce qui est juste.
 *
 * Liste officielle : Acte uniforme SYCEBNL, Partie 4, chapitre 3 (états
 * financiers des projets de développement et assimilés), vingt-six tableaux
 * pour vingt-quatre numéros de tête.
 */

/** Les 26 codes, dans l'ordre du texte. Transcrits, jamais déduits. */
const CODES_OFFICIELS = [
  '1', '2',
  '3A', '3B',
  '4', '5', '6', '7', '8', '9', '10', '11', '12', '13',
  '14', '15', '16', '17', '18', '19',
  '20A', '20B',
  '21', '22', '23', '24',
];

/**
 * Tableaux dont le contenu ne vient PAS de la balance · relevé du 2026-09-03,
 * chacun vérifié au chapitre 3.
 *
 *  · 1 et 2 · informations obligatoires et spécifiques du projet ;
 *  · 9 · les fonds du bailleur se présentent PAR BAILLEUR et sous-projet, en
 *    autant de colonnes qu'il y a de bailleurs · le plan de comptes ne porte
 *    pas cette ventilation ;
 *  · 20B · effectifs et masse salariale ;
 *  · 22 · le texte officiel ne donne ni colonnes ni rubriques (voir plus bas) ;
 *  · 24 · tableau d'exécution budgétaire, alimenté par le budget saisi.
 */
const HORS_BALANCE_RELEVES = [
  '1',
  '2',
  '20B / PERSONNEL EXTERIEUR ET BENEVOLE',
  '20B / PERSONNEL PROPRE',
  '22',
  '24',
  '9',
];

describe('couverture de la liste officielle', () => {
  it('porte les 26 tableaux du chapitre 3, ni un de plus ni un de moins', () => {
    const codes = codesDistincts(NOTES_PROJETS);
    expect(codes.filter((c) => !CODES_OFFICIELS.includes(c))).toEqual([]);
    expect(CODES_OFFICIELS.filter((c) => !codes.includes(c))).toEqual([]);
    expect(codes).toHaveLength(26);
  });

  it('les vingt-quatre numéros de tête sont tous représentés', () => {
    // 3A/3B et 20A/20B sont deux notes chacune sous un même numéro de tête ·
    // la fiche récapitulative compte les notes, pas les tableaux.
    const tetes = new Set(codesDistincts(NOTES_PROJETS).map((c) => /^(\d+)/.exec(c)![1]));
    expect(tetes.size).toBe(24);
  });

  it('un code partagé par plusieurs tableaux les NOMME tous', () => {
    const parCode = new Map<string, number>();
    for (const n of NOTES_PROJETS) parCode.set(n.code, (parCode.get(n.code) ?? 0) + 1);
    for (const n of NOTES_PROJETS) {
      if (parCode.get(n.code)! > 1) {
        expect([n.code, Boolean(n.sousTableau)]).toEqual([n.code, true]);
      }
    }
    // Relevé du 2026-09-03 · gelé pour qu'un tableau ajouté ou retiré se voie.
    const multiples = [...parCode].filter(([, n]) => n > 1).map(([c, n]) => `${c}×${n}`);
    expect(multiples.sort()).toEqual(['20B×2', '4×2']);
  });

  it('aucun tableau en double · une étiquette ne désigne qu’une chose', () => {
    const etiquettes = NOTES_PROJETS.map(etiquette);
    expect(etiquettes.filter((e, i) => etiquettes.indexOf(e) !== i)).toEqual([]);
  });
});

describe('les deux jeux SYCEBNL ne se contaminent pas', () => {
  it('aucun code propre aux associations n’a glissé chez les projets', () => {
    // Les deux tables se ressemblent assez pour qu'un copier-coller passe
    // inaperçu · 5A à 5H, 29A/29B, 30 à 35 n'existent QUE côté associations.
    const codesProjets = new Set(codesDistincts(NOTES_PROJETS));
    const propresAuxAssociations = codesDistincts(NOTES_ASSOCIATIONS).filter((c) => !CODES_OFFICIELS.includes(c));
    expect(propresAuxAssociations.filter((c) => codesProjets.has(c))).toEqual([]);
  });

  it('les deux tables ne partagent aucun OBJET · une retouche n’en touche qu’une', () => {
    // Les deux jeux portent des notes de MÊME TITRE sous des numéros
    // différents · « TRANSPORTS » est la note 25 côté associations et la 16
    // côté projets, chaque chapitre numérotant les siennes. C'est donc le
    // titre qui ne prouve rien, pas la table.
    //
    // Ce qui se surveille, c'est le partage d'objet : un tableau réutilisé
    // par référence d'une table à l'autre ferait qu'une correction faite
    // pour un jeu s'appliquerait en silence à l'autre, alors qu'ils ne
    // partagent ni poste, ni compte, ni libellé (CLAUDE.md §6).
    const partages = NOTES_PROJETS.filter((n) => (NOTES_ASSOCIATIONS as unknown[]).includes(n)).map(etiquette);
    expect(partages).toEqual([]);

    const rubriquesAssociations = new Set<unknown>(NOTES_ASSOCIATIONS.flatMap((n) => n.rubriques));
    const rubriquesPartagees = NOTES_PROJETS.flatMap((n) =>
      n.rubriques.filter((r) => rubriquesAssociations.has(r)).map((r) => `${etiquette(n)} · ${r.libelle}`),
    );
    expect(rubriquesPartagees).toEqual([]);
  });
});

describe('l’export ne peut pas perdre une note en silence', () => {
  /**
   * Le classeur suit sa propre liste, découpée en quatre parties. Une note
   * ajoutée à la table et oubliée là ne sortirait jamais au classeur, sans
   * qu'aucune erreur ne le dise.
   */
  function codesDeLExport(): string[] {
    const source = readFileSync(join(__dirname, '../exports/export.service.ts'), 'utf8');
    const debut = source.indexOf('PARTIES_NOTES_PROJETS: Array<[string, string[]]> = [');
    const bloc = source.slice(debut, source.indexOf('\n  ];', debut));
    return [...bloc.matchAll(/'([\w ]+)'/g)].map((m) => m[1]).filter((s) => !s.startsWith('Partie'));
  }

  it('les quatre parties couvrent exactement les 26 codes, chacun une fois', () => {
    const aLExport = codesDeLExport();
    expect(aLExport.filter((c, i) => aLExport.indexOf(c) !== i)).toEqual([]);
    expect(aLExport.sort()).toEqual([...CODES_OFFICIELS].sort());
  });

  it('les parties suivent le découpage officiel de la fiche récapitulative', () => {
    expect(codesDeLExport()).toEqual(CODES_OFFICIELS);
  });
});

describe('les comptes cités existent vraiment', () => {
  it('aucun préfixe de compte absent du plan SYCEBNL semé', () => {
    // LA GARDE QUI COMPTE. Un compte faux dans une note ne lève aucune erreur
    // et ne se découvre qu'au dépôt des états (CLAUDE.md §1).
    const fantomes: string[] = [];
    for (const { note, rubrique } of toutesLesRubriques(NOTES_PROJETS)) {
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
    const inutiles: string[] = [];
    for (const { note, rubrique } of toutesLesRubriques(NOTES_PROJETS)) {
      for (const e of rubrique.exclusions ?? []) {
        if (!(rubrique.comptes ?? []).some((p) => e.startsWith(p))) {
          inutiles.push(`${etiquette(note)} · ${rubrique.libelle} · exclut ${e}`);
        }
      }
    }
    expect(inutiles).toEqual([]);
  });
});

describe('cohérence de chaque rubrique', () => {
  it('une rubrique en attente de subdivision ne porte PAS de comptes', () => {
    for (const { note, rubrique } of toutesLesRubriques(NOTES_PROJETS)) {
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
    // C'est elle qui ancre le rattachement du dossier · s'appuyer sur le
    // libellé ferait tomber tous les rattachements à la première retouche.
    for (const { note, rubrique } of toutesLesRubriques(NOTES_PROJETS)) {
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
    for (const note of NOTES_PROJETS) {
      const cles = note.rubriques.map((r) => r.cle).filter(Boolean);
      expect([etiquette(note), cles.filter((c, i) => cles.indexOf(c) !== i)]).toEqual([etiquette(note), []]);
    }
  });

  it('un total ne renvoie qu’à des rubriques qui existent, et jamais à lui-même', () => {
    for (const note of NOTES_PROJETS) {
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
    for (const { note, rubrique } of toutesLesRubriques(NOTES_PROJETS)) {
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
    for (const note of NOTES_PROJETS) {
      expect([etiquette(note), note.titre.trim().length > 0]).toEqual([etiquette(note), true]);
      expect([etiquette(note), note.colonnes.length > 0]).toEqual([etiquette(note), true]);
      expect([etiquette(note), note.rubriques.length > 0]).toEqual([etiquette(note), true]);
      for (const r of note.rubriques) {
        expect([etiquette(note), r.libelle.trim().length > 0]).toEqual([etiquette(note), true]);
      }
    }
  });

  it('les colonnes d’un tableau ne se répètent pas', () => {
    for (const note of NOTES_PROJETS) {
      const signatures = note.colonnes.map((c) => `${c.type}·${c.libelle}`);
      expect([etiquette(note), signatures.filter((s, i) => signatures.indexOf(s) !== i)]).toEqual([etiquette(note), []]);
    }
  });
});

describe('une note hors balance ne chiffre rien', () => {
  it('aucune rubrique à comptes dans un tableau déclaré hors balance', () => {
    for (const note of NOTES_PROJETS) {
      if (!note.horsBalance) continue;
      const chiffrees = note.rubriques.filter((r) => (r.comptes ?? []).length > 0).map((r) => r.libelle);
      expect([etiquette(note), chiffrees]).toEqual([etiquette(note), []]);
    }
  });

  it('la liste des tableaux hors balance est GELÉE', () => {
    const horsBalance = NOTES_PROJETS.filter((n) => n.horsBalance).map(etiquette).sort();
    expect(horsBalance).toEqual(HORS_BALANCE_RELEVES);
  });
});

describe('la lacune de la note 22 reste une lacune', () => {
  const note22 = NOTES_PROJETS.find((n) => n.code === '22')!;

  it('le texte officiel ne donne ni colonnes ni rubriques · le code le DIT', () => {
    // Vérifié au chapitre 3 le 2026-09-03 : la NOTE 22 du jeu projets ne
    // porte qu'un commentaire, sans maquette. Le signaler sur place est la
    // règle du dépôt (CLAUDE.md §9) · une lacune tue est indiscernable d'un
    // oubli de développement.
    expect(note22.colonnes.some((c) => c.libelle.includes('[texte officiel]'))).toBe(true);
    expect(note22.rubriques.some((r) => r.libelle.includes('[texte officiel]'))).toBe(true);
  });

  it('elle n’est PAS comblée depuis la note 30 du jeu associations', () => {
    // Les deux notes traitent le même sujet, et c'est précisément le piège :
    // transposer donnerait une maquette plausible que CE jeu ne prévoit pas.
    // Les deux jeux ne partagent aucun poste (CLAUDE.md §6).
    const note30 = NOTES_ASSOCIATIONS.find((n) => n.code === '30');
    expect(note30).toBeDefined();
    expect(note22.rubriques.map((r) => r.libelle)).not.toEqual(note30!.rubriques.map((r) => r.libelle));
    expect(note22.rubriques.every((r) => (r.comptes ?? []).length === 0)).toBe(true);
  });
});
