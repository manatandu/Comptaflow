import { PLAN_COMPTES_SYSCOHADA } from '../comptes/compte-seed-syscohada';
import { correspond } from '../etats-financiers/etats-financiers.communs';
import { RubriqueNote, SpecificationNote } from '../notes-annexes/note-annexe.types';
import {
  POSTES_ACTIF_SYSCOHADA,
  POSTES_PASSIF_SYSCOHADA,
  TOTAUX_ACTIF_SYSCOHADA,
  TOTAUX_PASSIF_SYSCOHADA,
} from './correspondance-bilan-syscohada';
import { POSTES_COMPTE_RESULTAT_SYSCOHADA, SOLDES_INTERMEDIAIRES } from './correspondance-compte-resultat-syscohada';
import {
  CODE_PAYS_OHADA_RDC,
  CODES_FORME_JURIDIQUE_SYSCOHADA,
  CODES_NOTES_SYSCOHADA_3,
  CODES_PAYS_OHADA_SYSCOHADA,
  CODES_PAYS_SIEGE_SYSCOHADA,
  CODES_REGIME_FISCAL_SYSCOHADA,
  FICHE_SYNTHESE_SYSCOHADA,
  GROUPES_ACTIVITES_SYSCOHADA,
  MARQUE_HORS_MAQUETTE_NOTE_34,
  NOTES_SYSCOHADA_3,
  SEUILS_NOTE_35,
} from './correspondance-notes-syscohada-3';
import { TOTAUX_FLUX_SYSCOHADA, TOUS_LES_POSTES_FLUX_SYSCOHADA } from './correspondance-tft-syscohada';

/**
 * Intégrité structurelle des notes annexes SYSCOHADA, troisième tranche
 * (notes 28 à 36). Ces tests relisent la SOURCE (le plan semé, les postes du
 * ch. 7, les états déjà codés) plutôt que d'affirmer que la table est
 * juste : une provision du bilan absente de la note 28, un compte 67 ou 8x
 * que les notes 29 et 30 laisseraient tomber, un terme de la fiche de
 * synthèse qui viserait un poste inexistant, une table de codes tronquée ·
 * autant d'erreurs qui ne lèvent aucune exception.
 */

const FEUILLES = PLAN_COMPTES_SYSCOHADA.filter((c) => c.typeCompte !== 'TOTAL');

const COLONNES_CONNUES = [
  'EXERCICE_N', 'EXERCICE_N1', 'VARIATION_VALEUR', 'VARIATION_POURCENT', 'VARIATION_VALEUR_ABSOLUE',
  'OUVERTURE', 'AUGMENTATIONS', 'DIMINUTIONS', 'CLOTURE',
  'AUGMENTATION_EXPLOITATION', 'AUGMENTATION_FINANCIERE', 'AUGMENTATION_HAO',
  'DIMINUTION_EXPLOITATION', 'DIMINUTION_FINANCIERE', 'DIMINUTION_HAO',
  'ECHEANCE_1AN', 'ECHEANCE_2ANS', 'ECHEANCE_PLUS_2ANS', 'LIBRE',
];

const etiquette = (spec: SpecificationNote) => `${spec.code}${spec.sousTableau ? ` · ${spec.sousTableau}` : ''}`;

const noteUnique = (code: string) => {
  const s = NOTES_SYSCOHADA_3.find((n) => n.code === code);
  if (!s) throw new Error(`note ${code} absente`);
  return s;
};

const chiffrees = (spec: SpecificationNote): RubriqueNote[] => spec.rubriques.filter((r) => (r.comptes?.length ?? 0) > 0);
const capteParRubriques = (numero: string, rubriques: RubriqueNote[]) =>
  rubriques.filter((r) => correspond(numero, r.comptes ?? [], r.exclusions));
const feuillesDe = (prefixes: string[], exclusions: string[] = []) =>
  FEUILLES.filter((c) => correspond(c.numero, prefixes, exclusions)).map((c) => c.numero);

/** Feuilles du plan captées par un ensemble de rubriques, chacune une fois exactement (sinon l'assertion échoue). */
function feuillesCapteesUneFois(spec: SpecificationNote, rubriques: RubriqueNote[]): string[] {
  const out: string[] = [];
  for (const c of FEUILLES) {
    const captantes = capteParRubriques(c.numero, rubriques);
    expect({ note: etiquette(spec), compte: c.numero, fois: Math.min(captantes.length, 2) }).toEqual(
      { note: etiquette(spec), compte: c.numero, fois: Math.min(captantes.length, 1) },
    );
    if (captantes.length) out.push(c.numero);
  }
  return out.sort();
}

const posteCr = (ref: string) => POSTES_COMPTE_RESULTAT_SYSCOHADA.find((p) => p.ref === ref);

describe('correspondance des notes annexes SYSCOHADA · tranche 3 (AUDCIF Titre IX ch. 6 et ch. 7)', () => {
  it('transcrit exactement les codes de la tranche, ni un de plus ni un de moins', () => {
    const transcrits = [...new Set(NOTES_SYSCOHADA_3.map((n) => n.code))];
    expect([...transcrits].sort()).toEqual([...CODES_NOTES_SYSCOHADA_3].sort());
    // Liste du ch. 6 section 2, lue : de la 28 à la 36 sans subdivision.
    expect(CODES_NOTES_SYSCOHADA_3).toEqual(['28', '29', '30', '31', '32', '33', '34', '35', '36']);
  });

  it('aucun tableau en double', () => {
    const cles = NOTES_SYSCOHADA_3.map((n) => `${n.code}::${n.sousTableau ?? ''}`);
    expect(new Set(cles).size).toBe(cles.length);
  });

  it('un total ne référence jamais une rubrique qui vient APRÈS lui · sinon le calcul en une passe lirait 0', () => {
    for (const spec of NOTES_SYSCOHADA_3) {
      spec.rubriques.forEach((r, i) => {
        for (const idx of [...(r.totalDeRubriques ?? []), ...(r.moinsRubriques ?? [])]) {
          expect({ note: etiquette(spec), rubrique: r.libelle, avant: idx < i }).toEqual(
            { note: etiquette(spec), rubrique: r.libelle, avant: true },
          );
        }
        // `moinsRubriques` seul n'a pas de sens pour le moteur.
        expect({ note: etiquette(spec), rubrique: r.libelle, orphelin: !!r.moinsRubriques && !r.totalDeRubriques }).toEqual(
          { note: etiquette(spec), rubrique: r.libelle, orphelin: false },
        );
      });
    }
  });

  it('un total ne compte jamais deux fois la même ligne, ni directement ni par un sous-total', () => {
    for (const spec of NOTES_SYSCOHADA_3) {
      const feuillesDuTotal = (i: number, vues = new Set<number>()): Set<number> => {
        const r = spec.rubriques[i];
        if (!r.totalDeRubriques) return vues.add(i);
        for (const j of [...r.totalDeRubriques, ...(r.moinsRubriques ?? [])]) feuillesDuTotal(j, vues);
        return vues;
      };
      spec.rubriques.forEach((r) => {
        if (!r.totalDeRubriques) return;
        const feuilles = [...r.totalDeRubriques, ...(r.moinsRubriques ?? [])].flatMap((j) => [...feuillesDuTotal(j)]);
        expect({ note: etiquette(spec), total: r.libelle, doublons: feuilles.length - new Set(feuilles).size }).toEqual(
          { note: etiquette(spec), total: r.libelle, doublons: 0 },
        );
      });
    }
  });

  it('une rubrique porte soit des comptes, soit un total, soit une subdivision attendue, soit une saisie · jamais rien', () => {
    for (const spec of NOTES_SYSCOHADA_3) {
      for (const r of spec.rubriques) {
        const definie =
          (r.comptes?.length ?? 0) > 0 || r.totalDeRubriques !== undefined || r.subdivisionAttendue !== undefined || r.saisie === true;
        expect({ note: etiquette(spec), rubrique: r.libelle, definie }).toEqual({ note: etiquette(spec), rubrique: r.libelle, definie: true });
        expect({ note: etiquette(spec), rubrique: r.libelle, cumul: !!(r.saisie && (r.comptes?.length || r.subdivisionAttendue)) }).toEqual(
          { note: etiquette(spec), rubrique: r.libelle, cumul: false },
        );
      }
    }
  });

  it('les notes hors balance sont exactement 31 à 36, et ne citent aucun compte', () => {
    const horsBalance = NOTES_SYSCOHADA_3.filter((n) => n.horsBalance).map(etiquette).sort();
    expect(horsBalance).toEqual(['31', '32', '33', '34', '35', '36']);
    for (const spec of NOTES_SYSCOHADA_3.filter((n) => n.horsBalance)) {
      expect({ note: etiquette(spec), comptes: spec.rubriques.some((r) => (r.comptes?.length ?? 0) > 0) }).toEqual(
        { note: etiquette(spec), comptes: false },
      );
      expect(spec.rubriques.length).toBeGreaterThan(0);
      expect(spec.rubriques.every((r) => r.saisie === true)).toBe(true);
    }
  });

  it('toute colonne déclarée est d’un type connu du moteur, les libellés sont uniques, chaque note a un titre', () => {
    for (const spec of NOTES_SYSCOHADA_3) {
      expect(spec.colonnes.length).toBeGreaterThan(0);
      expect(spec.titre.trim().length).toBeGreaterThan(0);
      for (const c of spec.colonnes) {
        expect({ note: etiquette(spec), colonne: c.libelle, connue: COLONNES_CONNUES.includes(c.type) }).toEqual(
          { note: etiquette(spec), colonne: c.libelle, connue: true },
        );
      }
      const libelles = spec.colonnes.map((c) => c.libelle);
      expect(new Set(libelles).size).toBe(libelles.length);
    }
  });

  it('chaque compte cité existe au plan SYSCOHADA semé et atteint une feuille · un préfixe fantôme ne capterait rien', () => {
    for (const spec of NOTES_SYSCOHADA_3) {
      for (const r of spec.rubriques) {
        for (const prefixe of [...(r.comptes ?? []), ...(r.exclusions ?? [])]) {
          const feuille = FEUILLES.some((c) => c.numero.startsWith(prefixe));
          expect({ note: etiquette(spec), rubrique: r.libelle, prefixe, feuille }).toEqual(
            { note: etiquette(spec), rubrique: r.libelle, prefixe, feuille: true },
          );
        }
      }
    }
  });

  it('aucun tiret cadratin dans les libellés, titres et renvois (CLAUDE.md §4)', () => {
    const textes = NOTES_SYSCOHADA_3.flatMap((n) => [
      n.titre, n.commentaire ?? '', n.renvoiOfficiel ?? '',
      ...n.colonnes.map((c) => c.libelle),
      ...n.rubriques.flatMap((r) => [r.libelle, r.renvoi ?? '']),
    ]);
    expect(textes.filter((t) => t.includes('\u2014'))).toEqual([]);
  });

  describe('NOTE 28 · provisions et dépréciations inscrites au bilan', () => {
    const n28 = noteUnique('28');

    it('est un tableau de mouvements au crédit, ventilé par nature en B et C, sans natureCreditrice sur ses rubriques', () => {
      expect(n28.sensAccroissement).toBe('CREDIT');
      expect(n28.colonnes.map((c) => c.type)).toEqual([
        'OUVERTURE',
        'AUGMENTATION_EXPLOITATION', 'AUGMENTATION_FINANCIERE', 'AUGMENTATION_HAO',
        'DIMINUTION_EXPLOITATION', 'DIMINUTION_FINANCIERE', 'DIMINUTION_HAO',
        'CLOTURE',
      ]);
      // Une double orientation (natureCreditrice + sensAccroissement) fausserait l'écart de clôture.
      expect(n28.rubriques.some((r) => r.natureCreditrice || r.sens || r.presenterEnNegatif)).toBe(false);
      expect(n28.renvoyeeDepuis).toEqual(['XD', 'TJ', 'RL', 'TL', 'RN']);
    });

    it('anomalie n° 1 : « Dépréciations fournisseurs » n’est portée qu’une fois, et 490 n’est capté qu’une fois', () => {
      expect(n28.rubriques.filter((r) => r.libelle === 'Dépréciations fournisseurs')).toHaveLength(1);
      expect(n28.renvoiOfficiel).toContain('numérotation du second bloc est corrompue');
      expect(capteParRubriques('49000000', chiffrees(n28))).toHaveLength(1);
    });

    it('anomalie n° 2 : « TOTAL : DOTATIONS » ne totalise que les trois premières lignes, et le total général les deux blocs', () => {
      const dotations = n28.rubriques.findIndex((r) => r.libelle === 'TOTAL : DOTATIONS');
      expect(n28.rubriques[dotations].totalDeRubriques).toEqual([0, 1, 2]);
      const courtTerme = n28.rubriques.findIndex((r) => r.libelle.startsWith('TOTAL : CHARGES POUR DÉPRÉCIATIONS'));
      expect(n28.rubriques[courtTerme].totalDeRubriques).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
      expect(n28.rubriques.at(-1)).toEqual({ libelle: 'TOTAL PROVISIONS ET DÉPRÉCIATIONS', totalDeRubriques: [dotations, courtTerme] });
    });

    it('capte chaque compte 15, 19, 29, 39, 49, 59 du plan exactement une fois, et rien d’autre', () => {
      const captees = feuillesCapteesUneFois(n28, chiffrees(n28));
      const attendues = FEUILLES.filter((c) => /^(15|19|29|39|49|59)/.test(c.numero)).map((c) => c.numero).sort();
      expect(captees).toEqual(attendues);
    });

    it('recoupe le bilan (ch. 7) : dépréciations de tous les postes d’actif, CM (15), DC (19), DN (499 sauf 4998, 599) et le 4998 de DH', () => {
      const duBilan = new Set<string>();
      for (const p of POSTES_ACTIF_SYSCOHADA) {
        if (p.comptesAmortissement) {
          // Les 28x (amortissements) relèvent de la note 3C, pas de la 28.
          feuillesDe(p.comptesAmortissement, p.exclusionsAmortissement)
            .filter((n) => !n.startsWith('28'))
            .forEach((n) => duBilan.add(n));
        }
      }
      for (const ref of ['CM', 'DC', 'DN']) {
        const p = POSTES_PASSIF_SYSCOHADA.find((x) => x.ref === ref);
        if (!p) throw new Error(`poste ${ref} absent`);
        feuillesDe(p.comptes, p.exclusions).forEach((n) => duBilan.add(n));
      }
      const dh = POSTES_PASSIF_SYSCOHADA.find((x) => x.ref === 'DH');
      feuillesDe(dh?.comptes ?? []).filter((n) => n.startsWith('4998')).forEach((n) => duBilan.add(n));
      expect(feuillesCapteesUneFois(n28, chiffrees(n28))).toEqual([...duBilan].sort());
    });

    it('anomalie n° 3 : 594 en disponibilités, 4997 avec 599 (financier), 4998 avec 498 (HAO)', () => {
      const ligne = (libelle: string) => n28.rubriques.find((r) => r.libelle === libelle)?.comptes;
      expect(ligne('Dépréciations disponibilité')).toEqual(['592', '593', '594']);
      expect(ligne('Dépréciations et provisions pour risques à court termes à caractère financier')).toEqual(['4997', '599']);
      expect(ligne('Dépréciations et provisions pour risques à court termes exploitation')).toEqual(['4991']);
      expect(ligne('Dépréciations actif circulant HAO')).toEqual(['498', '4998']);
    });

    it('le 4997 est sourcé par le Titre VIII ch. 22, et la contradiction du Titre VII COMPTE 49 est dite sur la ligne', () => {
      // Le seul intitulé de la subdivision (« 4997 sur opérations financières »)
      // ne suffit pas : le FONCTIONNEMENT du compte 49 ne connaît que 659 et
      // 839. C'est le ch. 22 § 2.3 (débit 6791 · crédit 4997) qui tranche, et
      // la contradiction doit se lire sur la rubrique, pas seulement en tête.
      const r = n28.rubriques.find((x) => x.libelle.endsWith('à caractère financier'));
      expect(r?.renvoi).toContain('[texte officiel]');
      expect(r?.renvoi).toContain('Titre VIII ch. 22');
      expect(r?.renvoi).toContain('6791');
      expect(r?.renvoi).toContain('659');
      expect(r?.renvoi).toContain('839');
      // La divergence avec le moteur Python (4997 rangé en exploitation) est dite.
      expect(r?.renvoi).toContain('4991');
    });

    it('anomalies n° 13 et 14 : les libellés plus étroits que leurs comptes (15 et 19) sont signalés sur place', () => {
      const reglementees = n28.rubriques.find((x) => x.libelle === 'Provisions réglementées');
      expect(reglementees?.renvoi).toContain('[texte officiel]');
      expect(reglementees?.renvoi).toContain('153');
      const provisions19 = n28.rubriques.find((x) => x.libelle === 'Provisions financières pour risques et charges');
      expect(provisions19?.renvoi).toContain('1962');
      expect(provisions19?.renvoi).toContain('DÉBITEUR');
      // Le 4998, provision de passif portée sur une ligne de dépréciation d'actif.
      const hao = n28.rubriques.find((x) => x.libelle === 'Dépréciations actif circulant HAO');
      expect(hao?.renvoi).toContain('4998');
      expect(hao?.renvoi).toContain('DH');
    });
  });

  describe('NOTE 29 · charges et revenus financiers', () => {
    const n29 = noteUnique('29');
    const iFrais = n29.rubriques.findIndex((r) => r.libelle === 'SOUS TOTAL : FRAIS FINANCIERS');
    const iRevenus = n29.rubriques.findIndex((r) => r.libelle === 'SOUS TOTAL : REVENUS FINANCIERS');
    const frais = n29.rubriques.slice(0, iFrais);
    const revenus = n29.rubriques.slice(iFrais + 1, iRevenus);

    it('le bloc des frais est le poste RM (67 en bloc) et le bloc des revenus le poste TK (77 en bloc), chaque feuille une fois', () => {
      expect(feuillesCapteesUneFois(n29, frais)).toEqual(feuillesDe(posteCr('RM')!.comptes).sort());
      expect(feuillesCapteesUneFois(n29, revenus)).toEqual(feuillesDe(posteCr('TK')!.comptes).sort());
      expect(n29.renvoyeeDepuis).toEqual(['TK', 'RM']);
    });

    it('les revenus sont lus à leur nature créditrice, les frais non ; le TOTAL est revenus moins frais (anomalie n° 7)', () => {
      expect(frais.every((r) => !r.natureCreditrice)).toBe(true);
      expect(revenus.every((r) => r.natureCreditrice === true)).toBe(true);
      expect(n29.rubriques[iFrais].totalDeRubriques).toEqual(frais.map((_, i) => i));
      expect(n29.rubriques[iRevenus].totalDeRubriques).toEqual(revenus.map((_, i) => iFrais + 1 + i));
      expect(n29.rubriques.at(-1)).toEqual({ libelle: 'TOTAL', totalDeRubriques: [iRevenus], moinsRubriques: [iFrais] });
    });

    it('anomalie n° 4 : 775 est rangé avec 771 ; les lignes « voir note 28 » portent le renvoi', () => {
      expect(n29.rubriques.find((r) => r.libelle === 'Intérêts de prêts et créances diverses')?.comptes).toEqual(['771', '775']);
      const renvois = n29.rubriques.filter((r) => r.libelle.includes('(voir note 28)'));
      expect(renvois.map((r) => [r.comptes, r.renvoi])).toEqual([[['679'], '28'], [['779'], '28']]);
    });
  });

  describe('NOTE 30 · autres charges et produits HAO', () => {
    const n30 = noteUnique('30');
    const iCharges = n30.rubriques.findIndex((r) => r.libelle === 'SOUS TOTAL : AUTRES CHARGES HAO');
    const iProduits = n30.rubriques.findIndex((r) => r.libelle === 'SOUS TOTAL : AUTRES PRODUITS HAO');
    const charges = n30.rubriques.slice(0, iCharges);
    const produits = n30.rubriques.slice(iCharges + 1, iProduits);

    it('anomalie n° 5 : le bloc des charges est RP + RQ + 88, le bloc des produits TO sans 88 · chaque feuille une fois', () => {
      const rp = feuillesDe(posteCr('RP')!.comptes);
      const rq = feuillesDe(posteCr('RQ')!.comptes);
      const to = feuillesDe(posteCr('TO')!.comptes);
      const c88 = to.filter((n) => n.startsWith('88'));
      expect(c88.length).toBeGreaterThan(0);
      expect(feuillesCapteesUneFois(n30, charges)).toEqual([...rp, ...rq, ...c88].sort());
      expect(feuillesCapteesUneFois(n30, produits)).toEqual(to.filter((n) => !n.startsWith('88')).sort());
      // Ensemble : exactement TO ∪ RP ∪ RQ, une fois chacun.
      expect(feuillesCapteesUneFois(n30, chiffrees(n30))).toEqual([...rp, ...rq, ...to].sort());
      expect(n30.renvoyeeDepuis).toEqual(['TO', 'RP', 'RQ']);
    });

    it('88 est présenté en négatif dans le bloc des charges et signalé ; 87 s’y ajoute comme le texte le veut', () => {
      const sub = n30.rubriques.find((r) => r.libelle === "Subventions d'équilibre");
      expect(sub).toEqual(expect.objectContaining({ comptes: ['88'], presenterEnNegatif: true }));
      expect(sub?.renvoi).toContain('[texte officiel]');
      // La divergence avec le moteur Python (88 déplacé chez les produits) est
      // dite sur la ligne : l'en-tête promet que toute divergence l'est.
      expect(sub?.renvoi).toContain('bloc des produits');
      expect(n30.rubriques.find((r) => r.libelle === 'Participation des travailleurs')).toEqual({ libelle: 'Participation des travailleurs', comptes: ['87'] });
      expect(n30.renvoiOfficiel).toContain('compte 88');
      expect(n30.renvoiOfficiel).toContain('compte 87');
      expect(charges.filter((r) => r.natureCreditrice)).toEqual([]);
      expect(produits.every((r) => r.natureCreditrice === true)).toBe(true);
    });

    it('anomalie n° 6 : les comptes sans ligne vont dans les lignes « (1) à détailler » ; le TOTAL est produits moins charges', () => {
      expect(n30.rubriques[0]).toEqual(expect.objectContaining({ libelle: 'Charges HAO constatées (1)', comptes: ['831', '833', '837'] }));
      expect(n30.rubriques[iCharges + 1]).toEqual(
        expect.objectContaining({ libelle: 'Produits HAO constatés (1)', comptes: ['841', '843', '844', '847'] }),
      );
      expect(n30.rubriques.at(-1)).toEqual({ libelle: 'TOTAL', totalDeRubriques: [iProduits], moinsRubriques: [iCharges] });
    });
  });

  describe('NOTE 31 · cinq derniers exercices (anomalie n° 8)', () => {
    const n31 = noteUnique('31');
    const renvoi = (fragment: string) => n31.rubriques.find((r) => r.libelle.includes(fragment))?.renvoi;

    it('cinq colonnes libres N à N-4, la marque (¹) portée où le texte l’imprime · sur N-4', () => {
      // Ch. 6 : « `N` · `N-1` · `N-2` · `N-3` · `N-4` (¹) ». La marque est sur
      // la dernière colonne ; la porter ailleurs, ou nulle part, serait une
      // correction silencieuse du texte.
      expect(n31.colonnes.map((c) => [c.type, c.libelle])).toEqual([
        ['LIBRE', 'N'], ['LIBRE', 'N-1'], ['LIBRE', 'N-2'], ['LIBRE', 'N-3'], ['LIBRE', 'N-4 (¹)'],
      ]);
      expect(n31.renvoiOfficiel).toContain('(¹)');
    });

    it('chaque renvoi appelé par une rubrique porte son TEXTE, jamais sa seule marque', () => {
      // L'export rend `renvoi` en commentaire de cellule : un « (²) » isolé
      // n'y apprendrait rien. Présentation uniforme de (²) à (⁹).
      expect(renvoi('STRUCTURE DU CAPITAL')).toBe(
        '(²) Indication, en cas de libération partielle du capital, du montant du capital non appelé.',
      );
      expect(renvoi('OPÉRATIONS ET RÉSULTATS')).toBe(
        '(³) Les éléments de cette rubrique sont ceux figurant au compte de résultat.',
      );
      expect(renvoi('Résultat net')).toContain('entre parenthèses');
      expect(renvoi('Résultat distribué')).toContain('dividende proposé');
      expect(renvoi('Effectif moyen des travailleurs')).toBe('(⁶) Personnel propre.');
      expect(renvoi('Masse salariale')).toContain('661, 662, 663');
      expect(renvoi('Avantages sociaux')).toContain('664, 668');
      expect(renvoi('Personnel extérieur facturé')).toContain('667');
      // Aucune rubrique ne se contente de la marque nue.
      const nus = n31.rubriques.filter((r) => r.renvoi !== undefined && r.renvoi.trim().length <= 4);
      expect(nus.map((r) => r.libelle)).toEqual([]);
    });
  });

  describe('NOTE 34 · fiche de synthèse (anomalie n° 10)', () => {
    const cles = FICHE_SYNTHESE_SYSCOHADA.map((l) => l.cle);
    const refsBilan = [...POSTES_ACTIF_SYSCOHADA, ...POSTES_PASSIF_SYSCOHADA, ...TOTAUX_ACTIF_SYSCOHADA, ...TOTAUX_PASSIF_SYSCOHADA].map((p) => p.ref);
    const refsCr = [...POSTES_COMPTE_RESULTAT_SYSCOHADA, ...SOLDES_INTERMEDIAIRES].map((p) => p.ref);
    const refsFlux = [...TOUS_LES_POSTES_FLUX_SYSCOHADA, ...TOTAUX_FLUX_SYSCOHADA].map((p) => p.ref);

    it('chaque ligne a une clé unique, et la note 34 les reprend une à une, en saisie', () => {
      expect(new Set(cles).size).toBe(cles.length);
      const n34 = noteUnique('34');
      expect(n34.rubriques.map((r) => r.cle)).toEqual(cles);
      expect(n34.horsBalance).toBe(true);
    });

    it('chaque terme vise un poste qui existe dans les états SYSCOHADA codés, une feuille du plan, ou une ligne ANTÉRIEURE', () => {
      FICHE_SYNTHESE_SYSCOHADA.forEach((l, i) => {
        const termes = [...(l.termes ?? []), ...(l.ratio?.numerateur ?? []), ...(l.ratio?.denominateur ?? [])];
        expect({ cle: l.cle, definie: termes.length > 0 }).toEqual({ cle: l.cle, definie: true });
        for (const t of termes) {
          let ok = false;
          if (t.source === 'COMPTE_RESULTAT') ok = refsCr.includes(t.ref);
          else if (t.source === 'BILAN') ok = refsBilan.includes(t.ref);
          else if (t.source === 'FLUX_TRESORERIE') ok = refsFlux.includes(t.ref);
          else if (t.source === 'COMPTE') ok = FEUILLES.some((c) => c.numero.startsWith(t.ref)) && t.solde !== undefined;
          else if (t.source === 'LIGNE') ok = cles.indexOf(t.ref) >= 0 && cles.indexOf(t.ref) < i;
          expect({ cle: l.cle, terme: `${t.source}:${t.ref}`, ok }).toEqual({ cle: l.cle, terme: `${t.source}:${t.ref}`, ok: true });
        }
      });
    });

    it('« Dettes financières* » = DA + DB seulement, partout où la fiche les emploie · DC exclu', () => {
      const dettes = FICHE_SYNTHESE_SYSCOHADA.find((l) => l.cle === 'dettes-financieres');
      expect(dettes?.termes?.map((t) => [t.signe, t.ref])).toEqual([[1, 'DA'], [1, 'DB']]);
      expect(dettes?.renvoi).toContain('(DA + DB)');
      expect(dettes?.renvoi).toContain('(b)');
      const brut = FICHE_SYNTHESE_SYSCOHADA.find((l) => l.cle === 'endettement-financier-brut');
      expect(brut?.termes?.map((t) => t.ref)).toEqual(['DA', 'DB', 'DT']);
      const eco = FICHE_SYNTHESE_SYSCOHADA.find((l) => l.cle === 'rentabilite-economique');
      expect(eco?.ratio?.denominateur.map((t) => t.ref)).toEqual(['CP', 'DA', 'DB']);
      const refs = FICHE_SYNTHESE_SYSCOHADA.flatMap((l) => (l.termes ?? []).map((t) => t.ref));
      expect(refs).not.toContain('DC');
      expect(refs).not.toContain('DD');
      expect(refs).not.toContain('DF');
    });

    it('la variation de trésorerie suit le modèle du TFT (+ ZC), le « – » de la note restant en texte', () => {
      const inv = FICHE_SYNTHESE_SYSCOHADA.find((l) => l.cle === 'flux-investissement');
      expect(inv?.termes).toEqual([expect.objectContaining({ signe: 1, source: 'FLUX_TRESORERIE', ref: 'ZC' })]);
      expect(inv?.formuleOfficielle).toContain('[texte officiel]');
      expect(inv?.libelle.startsWith('–')).toBe(true);
    });

    it('la seule ligne hors maquette est « autres charges HAO » de la CAFG, et le contrôle de trésorerie vise la trésorerie nette', () => {
      expect(FICHE_SYNTHESE_SYSCOHADA.filter((l) => l.horsMaquette).map((l) => l.cle)).toEqual(['caf-autres-charges-hao']);
      const controle = FICHE_SYNTHESE_SYSCOHADA.find((l) => l.controleDe);
      expect(controle).toEqual(expect.objectContaining({ cle: 'controle-tresorerie-nette', controleDe: 'tresorerie-nette' }));
      expect(controle?.termes?.map((t) => [t.signe, t.ref])).toEqual([[1, 'BT'], [-1, 'DT']]);
    });

    it('le terme hors maquette de la CAFG est marqué SUR LE TERME · une somme naïve ne peut plus diverger en silence', () => {
      // Sans ce marqueur, additionner `termes` donnerait une CAFG différente
      // de `formuleOfficielle` sans que rien ne le signale au service.
      const cafg = FICHE_SYNTHESE_SYSCOHADA.find((l) => l.cle === 'cafg');
      const hors = (cafg?.termes ?? []).filter((t) => t.horsMaquette);
      expect(hors.map((t) => t.ref)).toEqual(['caf-autres-charges-hao']);
      expect(hors[0].motif).toBeDefined();
      // Le reste de la fiche ne porte aucun terme hors maquette.
      const tous = FICHE_SYNTHESE_SYSCOHADA.flatMap((l) => [
        ...(l.termes ?? []), ...(l.ratio?.numerateur ?? []), ...(l.ratio?.denominateur ?? []),
      ]);
      expect(tous.filter((t) => t.horsMaquette)).toHaveLength(1);
      // Et la ligne elle-même reste reconnaissable APRÈS le map de la note 34,
      // que `horsMaquette` ne traverse pas.
      const n34 = noteUnique('34');
      const rubrique = n34.rubriques.find((r) => r.cle === 'caf-autres-charges-hao');
      expect(rubrique?.renvoi).toContain(MARQUE_HORS_MAQUETTE_NOTE_34);
      expect(n34.rubriques.filter((r) => r.renvoi?.includes('[hors maquette]'))).toHaveLength(1);
    });

    it('la ligne de contrôle annonce son écart structurel de DC · sinon il passerait pour un défaut de calcul', () => {
      // (5) = (BT – DT) + (BU – DV) – DC : « Dettes financières* » exclut DC
      // que DF inclut. Le renvoi (b) élimine BU et DV, jamais DC.
      const controle = FICHE_SYNTHESE_SYSCOHADA.find((l) => l.cle === 'controle-tresorerie-nette');
      expect(controle?.renvoi).toContain('[texte officiel]');
      expect(controle?.renvoi).toContain('DC');
      expect(controle?.renvoi).toContain('STRUCTUREL');
    });

    it('la rentabilité économique dit que l’astérisque manque à cet endroit du texte, au lieu de l’assimiler en silence', () => {
      const eco = FICHE_SYNTHESE_SYSCOHADA.find((l) => l.cle === 'rentabilite-economique');
      expect(eco?.formuleOfficielle).not.toContain('*');
      const da = eco?.ratio?.denominateur.find((t) => t.ref === 'DA');
      expect(da?.motif).toContain('[texte officiel]');
      expect(da?.motif).toContain('SANS astérisque');
      expect(da?.motif).toContain('DD');
      expect(eco?.ratio?.denominateur.find((t) => t.ref === 'DB')?.motif).toBeDefined();
    });

    it('les lignes (b) portent le renvoi sur les écarts de conversion', () => {
      const avecB = FICHE_SYNTHESE_SYSCOHADA.filter((l) => l.libelle.includes('(b)'));
      expect(avecB.length).toBe(6);
      expect(avecB.every((l) => l.renvoi?.includes('écarts de conversion'))).toBe(true);
    });
  });

  describe('NOTE 35 · seuil (anomalie n° 11)', () => {
    it('porte les deux seuils du texte sans trancher', () => {
      expect(SEUILS_NOTE_35).toEqual({ effectifNote35TitreIX: 250, effectifTitreVIIIChapitre30: 500 });
      const n35 = noteUnique('35');
      expect(n35.renvoiOfficiel).toContain('250 salariés');
      expect(n35.renvoiOfficiel).toContain('500');
      expect(n35.rubriques.filter((r) => r.libelle.startsWith('INFORMATIONS')).map((r) => r.libelle)).toEqual([
        'INFORMATIONS SOCIALES',
        'INFORMATIONS ENVIRONNEMENTALES',
        'INFORMATIONS RELATIVES AUX ENGAGEMENTS SOCIÉTAUX EN FAVEUR DU DÉVELOPPEMENT DURABLE',
      ]);
    });
  });

  describe('NOTE 36 · tables des codes (anomalie n° 12)', () => {
    const codesUniques = (table: { code: string }[]) => expect(new Set(table.map((t) => t.code)).size).toBe(table.length);

    it('dix formes juridiques, quatre régimes fiscaux, neuf zones de siège, dix-sept pays OHADA dont la RDC en 17', () => {
      expect(CODES_FORME_JURIDIQUE_SYSCOHADA).toHaveLength(10);
      expect(CODES_FORME_JURIDIQUE_SYSCOHADA.map((c) => c.code)).toEqual(['00', '01', '02', '03', '04', '05', '06', '07', '08', '09']);
      expect(CODES_REGIME_FISCAL_SYSCOHADA.map((c) => c.code)).toEqual(['1', '2', '3', '4']);
      expect(CODES_PAYS_SIEGE_SYSCOHADA.map((c) => c.code)).toEqual(['00', '21', '23', '39', '40', '41', '49', '50', '99']);
      expect(CODES_PAYS_OHADA_SYSCOHADA).toHaveLength(17);
      expect(CODES_PAYS_OHADA_SYSCOHADA.find((c) => c.code === CODE_PAYS_OHADA_RDC)?.libelle).toBe('Congo RDC');
      [CODES_FORME_JURIDIQUE_SYSCOHADA, CODES_REGIME_FISCAL_SYSCOHADA, CODES_PAYS_SIEGE_SYSCOHADA, CODES_PAYS_OHADA_SYSCOHADA].forEach(codesUniques);
    });

    it('quarante-quatre groupes d’activités numérotés 001 à 044 sans trou', () => {
      expect(GROUPES_ACTIVITES_SYSCOHADA).toHaveLength(44);
      expect(GROUPES_ACTIVITES_SYSCOHADA.map((g) => g.code)).toEqual(
        Array.from({ length: 44 }, (_, i) => String(i + 1).padStart(3, '0')),
      );
      expect(GROUPES_ACTIVITES_SYSCOHADA.every((g) => g.libelle.trim().length > 0)).toBe(true);
    });

    it('la note renvoie aux codes des fiches R1 et R2 (ZE, ZK, ZL, ZM) et signale la table 3 lacunaire', () => {
      const n36 = noteUnique('36');
      expect(n36.renvoyeeDepuis).toEqual(['ZK', 'ZL', 'ZM', 'ZE']);
      expect(n36.renvoiOfficiel).toContain('lacunaire');
      expect(n36.renvoiOfficiel).toContain('NOTE 34');
    });
  });
});
