import {
  COMPTES_TRESORERIE_PROJET,
  LIBELLES_CALCULES,
  ORDRE_AFFICHAGE,
  POSTES_CHARGES,
  POSTES_IMMOBILISATIONS,
  POSTES_RESSOURCES,
  TOTAUX,
} from './correspondance-projet-emplois-ressources';
import { PLAN_COMPTES_SYCEBNL } from '../comptes/compte-seed';

/**
 * TABLEAU EMPLOIS-RESSOURCES · 402 lignes que rien ne vérifiait, et l'état
 * que le BAILLEUR lit avant tous les autres.
 *
 * C'est lui qui dit ce que le projet a reçu et ce qu'il en a fait. Sa
 * particularité : il se termine par un CONTRÔLE inscrit dans le modèle
 * lui-même, « VII. CONTRÔLE : TOTAL V = TOTAL VI » · l'encaisse calculée doit
 * égaler les fonds disponibles constatés. Un rattachement faux ne casse donc
 * pas l'état en silence comme ailleurs · il fait sauter GZ. Mais seulement si
 * les deux branches du contrôle sont bien indépendantes, ce que ce spec
 * vérifie : GX descend des ressources et des emplois, GY se lit dans la
 * trésorerie. Les faire dépendre des mêmes comptes rendrait le contrôle
 * toujours vrai, donc inutile.
 *
 * Source : `sycebnl`, partie4-ch3, section 1 (maquette FA à GZ).
 */

/** La maquette officielle, REF par REF, dans l'ordre du texte. */
const MODELE: Array<[string, string]> = [
  ['FA', 'Fonds reçus, Bailleurs'],
  ['FB', 'Fonds reçus, Bailleurs'],
  ['FC', 'Fonds contrepartie Etat'],
  ['FD', 'Autres fonds reçus'],
  ['GR', 'I. RESSOURCES'],
  ['FE', 'Immobilisations incorporelles'],
  ['FF', 'Terrains'],
  ['FG', 'Bâtiments'],
  ['FH', 'Aménagements, agencements et installations'],
  ['FI', 'Matériel, mobilier et actifs biologiques'],
  ['FJ', 'Matériel de transport'],
  ['FK', 'Avances et acomptes sur immobilisations'],
  ['FL', 'Immobilisations financières'],
  ['GS', 'A- TOTAL DES IMMOBILISATIONS'],
  ['FM', 'Achats de biens et services'],
  ['FN', 'Transports'],
  ['FO', 'Services extérieurs'],
  ['FP', 'Impôts et taxes'],
  ['FQ', 'Autres charges'],
  ['FR', 'Charges de personnel'],
  ['FS', 'Charges financières'],
  ['FT', 'Avances sur charges (à justifier)'],
  ['GT', 'B- TOTAL DES CHARGES DE FONCTIONNEMENT'],
  ['GU', 'II. EMPLOIS (A+B)'],
  ['GV', 'III. EXCEDENT / DEFICIT DES FONDS RECUS SUR LES EMPLOIS (I-II)'],
  ['FU', 'Fonds Bailleur en début exercice N'],
  ['FV', 'Fonds de contrepartie État en début exercice N'],
  ['FW', 'Autres fonds en début exercice N'],
  ['GW', 'IV. FONDS DISPONIBLE EN DEBUT EXERCICE'],
  ['GX', "V. MONTANT NET DE L'ENCAISSE DISPONIBLE (III+IV)"],
  ['FX', 'Fonds Bailleur en fin exercice N'],
  ['FY', 'Fonds de contrepartie État en fin exercice N'],
  ['FZ', 'Autres fonds en fin exercice N'],
  ['GY', 'VI. FONDS DISPONIBLE EN FIN EXERCICE'],
  ['GZ', 'VII. CONTRÔLE : TOTAL V = TOTAL VI'],
];

const TOUS_LES_POSTES = [...POSTES_RESSOURCES, ...POSTES_IMMOBILISATIONS, ...POSTES_CHARGES];
const COMPTES_IMPUTATION = PLAN_COMPTES_SYCEBNL.filter((c) => c.typeCompte !== 'TOTAL');

describe('emplois-ressources · conformité à la maquette officielle', () => {
  it("l'ordre d'affichage reprend EXACTEMENT les REF du modèle, dans l'ordre", () => {
    expect(ORDRE_AFFICHAGE).toEqual(MODELE.map(([ref]) => ref));
  });

  it('chaque REF affichée est soit un poste, soit un total, soit une ligne calculée', () => {
    // Une ref qui n'est nulle part imprimerait une ligne vide sans que rien
    // ne le signale · le bailleur lirait un poste à zéro au lieu d'un défaut.
    const connues = new Set([
      ...TOUS_LES_POSTES.map((p) => p.ref),
      ...TOTAUX.map((t) => t.ref),
      ...Object.keys(LIBELLES_CALCULES),
    ]);
    for (const ref of ORDRE_AFFICHAGE) expect([ref, connues.has(ref)]).toEqual([ref, true]);
  });

  it('les libellés des postes rattachés reprennent ceux du modèle', () => {
    /*
     * ACCENTUATION DES CAPITALES · le Journal officiel est un scan, et ses
     * capitales perdent leurs accents : le modèle écrit « Fonds contrepartie
     * Etat », « EXCEDENT », « CONTRÔLE » (celui-là accentué, d'ailleurs, ce
     * qui montre bien que l'absence ailleurs est un artefact et non une
     * graphie voulue). Nos libellés rétablissent l'accent.
     *
     * Ce n'est pas une divergence de fond, et la comparaison la neutralise
     * plutôt que de figer l'une des deux graphies · figer celle du scan
     * imprimerait « Etat » à un bailleur, figer la nôtre casserait au
     * prochain relevé de la source.
     */
    const sansAccent = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const attendus = new Map(MODELE);
    for (const p of TOUS_LES_POSTES) {
      // FB et les fonds disponibles portent leur libellé dans
      // LIBELLES_CALCULES · les autres le portent sur le poste.
      if (LIBELLES_CALCULES[p.ref]) continue;
      expect([p.ref, sansAccent(p.libelle)]).toEqual([p.ref, sansAccent(attendus.get(p.ref)!)]);
    }
  });

  it('les six totaux somment exactement ce que le modèle annonce', () => {
    const attendus: Record<string, string[]> = {
      GR: ['FA', 'FB', 'FC', 'FD'],
      GS: ['FE', 'FF', 'FG', 'FH', 'FI', 'FJ', 'FK', 'FL'],
      GT: ['FM', 'FN', 'FO', 'FP', 'FQ', 'FR', 'FS', 'FT'],
      GU: ['GS', 'GT'],
      GW: ['FU', 'FV', 'FW'],
      GY: ['FX', 'FY', 'FZ'],
    };
    for (const t of TOTAUX) expect([t.ref, t.deRefs]).toEqual([t.ref, attendus[t.ref]]);
    expect(TOTAUX.map((t) => t.ref).sort()).toEqual(Object.keys(attendus).sort());
  });

  it('GU somme les deux SOUS-TOTAUX, pas de nouveau les postes · « EMPLOIS (A+B) »', () => {
    // Le modèle écrit A+B. Refaire la somme des seize postes donnerait le même
    // chiffre, et masquerait une divergence entre les deux niveaux.
    expect(TOTAUX.find((t) => t.ref === 'GU')!.deRefs).toEqual(['GS', 'GT']);
  });

  it('les trois lignes de calcul (GV, GX, GZ) ne sont PAS des totaux de postes', () => {
    // III = I - II, V = III + IV, VII = contrôle. Ce sont des relations entre
    // totaux, pas des additions de rattachements · les mettre dans TOTAUX
    // reviendrait à leur inventer des comptes.
    for (const ref of ['GV', 'GX', 'GZ']) {
      expect([ref, TOTAUX.some((t) => t.ref === ref)]).toEqual([ref, false]);
      expect(LIBELLES_CALCULES[ref]).toBeDefined();
    }
  });
});

describe('emplois-ressources · le contrôle GZ doit pouvoir échouer', () => {
  it('les fonds disponibles se lisent en SOLDE de trésorerie, pas en mouvement', () => {
    // GY est la branche INDÉPENDANTE du contrôle. La calculer depuis les
    // mêmes mouvements que GX rendrait « TOTAL V = TOTAL VI » toujours vrai,
    // donc muet · un contrôle qui ne peut pas échouer ne contrôle rien.
    for (const ref of ['FU', 'FV', 'FW', 'FX', 'FY', 'FZ']) {
      const p = TOUS_LES_POSTES.find((x) => x.ref === ref);
      if (!p) continue;
      expect([ref, p.lectureSolde]).not.toEqual([ref, undefined]);
    }
    expect(COMPTES_TRESORERIE_PROJET).toEqual(['51', '52', '53', '55', '57']);
  });

  it('la trésorerie du projet ne comprend ni le 54 ni le 58', () => {
    // 58 « Virements internes » est un compte de passage : l'inclure ferait
    // apparaître deux fois un transfert de banque à caisse. Le 54 n'existe pas
    // comme compte de trésorerie disponible dans ce jeu.
    expect(COMPTES_TRESORERIE_PROJET).not.toContain('58');
    expect(COMPTES_TRESORERIE_PROJET).not.toContain('54');
  });

  it('chaque compte de trésorerie cité existe au plan SYCEBNL', () => {
    for (const prefixe of COMPTES_TRESORERIE_PROJET) {
      expect([prefixe, COMPTES_IMPUTATION.some((c) => c.numero.startsWith(prefixe))]).toEqual([prefixe, true]);
    }
  });
});

describe('emplois-ressources · cohérence des rattachements', () => {
  it('chaque préfixe cité correspond à au moins un compte du semis', () => {
    for (const p of TOUS_LES_POSTES) {
      for (const prefixe of p.comptes) {
        expect([p.ref, prefixe, COMPTES_IMPUTATION.some((c) => c.numero.startsWith(prefixe))]).toEqual([
          p.ref,
          prefixe,
          true,
        ]);
      }
    }
  });

  it('aucun compte n’est capté par deux postes de la même section', () => {
    for (const [nom, postes] of [
      ['ressources', POSTES_RESSOURCES],
      ['immobilisations', POSTES_IMMOBILISATIONS],
      ['charges', POSTES_CHARGES],
    ] as Array<[string, typeof POSTES_RESSOURCES]>) {
      const vus = new Map<string, string>();
      for (const p of postes) {
        for (const c of COMPTES_IMPUTATION) {
          const capte =
            p.comptes.some((pref) => c.numero.startsWith(pref)) &&
            !(p.exclusions ?? []).some((e) => c.numero.startsWith(e));
          if (!capte) continue;
          expect([nom, c.numero, vus.get(c.numero) ?? null]).toEqual([nom, c.numero, null]);
          vus.set(c.numero, p.ref);
        }
      }
    }
  });

  it('le sens de chaque section suit sa nature · ressources au crédit, emplois au débit', () => {
    // Une ressource reçue crédite le compte de fonds ; une immobilisation
    // acquise ou une charge engagée le débite. Un sens inversé ne casse rien,
    // il déplace le montant de l'autre côté du tableau.
    for (const p of POSTES_RESSOURCES) expect([p.ref, p.sens]).toEqual([p.ref, 'CREDIT']);
    for (const p of [...POSTES_IMMOBILISATIONS, ...POSTES_CHARGES]) {
      // FT « Avances sur charges » se lit en solde, pas en mouvement.
      if (p.lectureSolde) continue;
      expect([p.ref, p.sens]).toEqual([p.ref, 'DEBIT']);
    }
  });

  it('chaque section déclarée sur un poste correspond au bloc qui le porte', () => {
    for (const p of POSTES_RESSOURCES) expect([p.ref, p.section]).toEqual([p.ref, 'RESSOURCES']);
    for (const p of POSTES_IMMOBILISATIONS) expect([p.ref, p.section]).toEqual([p.ref, 'IMMOBILISATIONS']);
    for (const p of POSTES_CHARGES) expect([p.ref, p.section]).toEqual([p.ref, 'CHARGES']);
  });

  it('chaque déduction cite le renvoi du guide dont elle vient', () => {
    // Les corrections ne sont pas des ajustements maison : elles viennent du
    // guide d'application. Sans le renvoi, personne ne peut les rediscuter.
    for (const p of TOUS_LES_POSTES) {
      for (const d of p.deductions ?? []) {
        expect([p.ref, d.renvoi.length > 5]).toEqual([p.ref, true]);
        expect(['AJOUTER_VARIATION', 'RETRANCHER_MOUVEMENT']).toContain(d.operation);
      }
    }
  });

  it('chaque poste dit POURQUOI il capte ces comptes-là', () => {
    for (const p of TOUS_LES_POSTES) expect([p.ref, (p.fondement ?? '').length > 40]).toEqual([p.ref, true]);
  });

  it('aucun cadratin dans les libellés ni les fondements (CLAUDE.md §4)', () => {
    for (const p of TOUS_LES_POSTES) {
      expect(p.libelle).not.toContain('—');
      expect(p.fondement).not.toContain('—');
    }
    for (const t of TOTAUX) expect(t.libelle).not.toContain('—');
    for (const l of Object.values(LIBELLES_CALCULES)) expect(l).not.toContain('—');
  });
});
