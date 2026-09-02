import { PLAN_COMPTES_SYSCOHADA } from '../comptes/compte-seed-syscohada';
import { correspond } from '../etats-financiers/etats-financiers.communs';
import {
  COMPTES_BILAN_A_SOLDER_A_LA_CLOTURE,
  COMPTES_BILAN_SANS_POSTE_JUSTIFIES,
  COMPTES_RESULTAT_SYSCOHADA,
  COMPTES_TRESORERIE_PASSIF_SI_CREDITEUR_SYSCOHADA,
  ORDRE_AFFICHAGE_ACTIF_SYSCOHADA,
  ORDRE_AFFICHAGE_PASSIF_SYSCOHADA,
  POSTES_ACTIF_SYSCOHADA,
  POSTES_PASSIF_SYSCOHADA,
  REF_RESULTAT_SYSCOHADA,
  REF_TRESORERIE_PASSIF_SYSCOHADA,
  TOTAUX_ACTIF_SYSCOHADA,
  TOTAUX_PASSIF_SYSCOHADA,
  trouvePosteActifSyscohada,
  trouvePostePassifSyscohada,
} from './correspondance-bilan-syscohada';

/**
 * Intégrité structurelle du tableau de correspondance du bilan SYSCOHADA.
 * Ces tests relisent la SOURCE (le modèle du ch. 3, le plan semé) plutôt que
 * d'affirmer que la table est juste : un REF oublié, un compte cité qui
 * n'existe pas au plan, un compte du plan qu'aucun poste ne capte, un
 * amortissement déduit deux fois · autant d'erreurs qui ne lèvent aucune
 * exception à l'exécution et ne se verraient qu'au dépôt des états.
 */

/** Codes du modèle de bilan, ch. 3 section 2, dans l'ordre du texte (lus, pas déduits). */
const MODELE_CH3_ACTIF = [
  'AD', 'AE', 'AF', 'AG', 'AH', 'AI', 'AJ', 'AK', 'AL', 'AM', 'AN', 'AP', 'AQ', 'AR', 'AS', 'AZ',
  'BA', 'BB', 'BG', 'BH', 'BI', 'BJ', 'BK', 'BQ', 'BR', 'BS', 'BT', 'BU', 'BZ',
];
const MODELE_CH3_PASSIF = [
  'CA', 'CB', 'CD', 'CE', 'CF', 'CG', 'CH', 'CJ', 'CL', 'CM', 'CP',
  'DA', 'DB', 'DC', 'DD', 'DF', 'DH', 'DI', 'DJ', 'DK', 'DM', 'DN', 'DP', 'DQ', 'DR', 'DT', 'DV', 'DZ',
];

/**
 * Renvois de notes du modèle du ch. 3 section 2, colonne « Note », lus
 * ligne à ligne (les REF absents de cette table n'ont pas de renvoi). Un
 * mauvais numéro s'imprimerait sur le bilan sans lever d'erreur.
 */
const NOTES_MODELE_CH3: Record<string, string> = {
  AD: '3', AI: '3', AP: '3', AQ: '4', BA: '5', BB: '6', BH: '17', BI: '7', BJ: '8', BQ: '9', BR: '10', BS: '11', BU: '12',
  CA: '13', CB: '13', CD: '14', CE: '3e', CF: '14', CG: '14', CH: '14', CL: '15', CM: '15',
  DA: '16', DB: '16', DC: '16', DH: '5', DI: '7', DJ: '17', DK: '18', DM: '19', DN: '19', DQ: '20', DR: '20', DV: '12',
};

/** Comptes d'imputation (feuilles) du semis, classes de bilan 1 à 5 seulement. */
const COMPTES_BILAN_SEMIS = PLAN_COMPTES_SYSCOHADA.filter((c) => c.typeCompte !== 'TOTAL' && /^[1-5]/.test(c.numero));

/** Tous les préfixes qu'un poste cite, par rôle · pour vérifier qu'ils existent au plan. */
function prefixesCites(): { prefixe: string; ref: string; role: string }[] {
  const out: { prefixe: string; ref: string; role: string }[] = [];
  for (const p of [...POSTES_ACTIF_SYSCOHADA, ...POSTES_PASSIF_SYSCOHADA]) {
    p.comptes.forEach((c) => out.push({ prefixe: c, ref: p.ref, role: 'comptes' }));
    p.exclusions?.forEach((c) => out.push({ prefixe: c, ref: p.ref, role: 'exclusions' }));
    p.comptesAmortissement?.forEach((c) => out.push({ prefixe: c, ref: p.ref, role: 'comptesAmortissement' }));
    p.exclusionsAmortissement?.forEach((c) => out.push({ prefixe: c, ref: p.ref, role: 'exclusionsAmortissement' }));
    p.comptesTransferesSiCrediteur?.forEach((c) => out.push({ prefixe: c, ref: p.ref, role: 'comptesTransferesSiCrediteur' }));
  }
  COMPTES_TRESORERIE_PASSIF_SI_CREDITEUR_SYSCOHADA.forEach((c) => out.push({ prefixe: c, ref: 'DR', role: 'tresoreriePassif' }));
  COMPTES_RESULTAT_SYSCOHADA.forEach((c) => out.push({ prefixe: c, ref: 'CJ', role: 'resultat' }));
  COMPTES_BILAN_SANS_POSTE_JUSTIFIES.forEach((c) => out.push({ prefixe: c.prefixe, ref: 'orphelin', role: 'sansPoste' }));
  COMPTES_BILAN_A_SOLDER_A_LA_CLOTURE.forEach((c) => out.push({ prefixe: c.prefixe, ref: 'aSolder', role: 'aSolderALaCloture' }));
  return out;
}

/** Un compte du semis est-il capté par au moins un poste (brut, amortissement, résultat ou trésorerie passif) ? */
function estCapte(numero: string): boolean {
  for (const p of [...POSTES_ACTIF_SYSCOHADA, ...POSTES_PASSIF_SYSCOHADA]) {
    if (correspond(numero, p.comptes, p.exclusions)) return true;
    if (p.comptesAmortissement && correspond(numero, p.comptesAmortissement, p.exclusionsAmortissement)) return true;
  }
  return correspond(numero, COMPTES_RESULTAT_SYSCOHADA) || correspond(numero, COMPTES_TRESORERIE_PASSIF_SI_CREDITEUR_SYSCOHADA);
}

describe('correspondance bilan SYSCOHADA (AUDCIF Titre IX ch. 3 et ch. 7)', () => {
  it("l'ordre d'affichage reprend EXACTEMENT les codes du modèle du ch. 3, dans l'ordre du texte", () => {
    expect(ORDRE_AFFICHAGE_ACTIF_SYSCOHADA).toEqual(MODELE_CH3_ACTIF);
    expect(ORDRE_AFFICHAGE_PASSIF_SYSCOHADA).toEqual(MODELE_CH3_PASSIF);
  });

  it('ne comporte aucune ref en double, postes, totaux et résultat confondus', () => {
    const toutes = [
      ...POSTES_ACTIF_SYSCOHADA.map((p) => p.ref),
      ...POSTES_PASSIF_SYSCOHADA.map((p) => p.ref),
      ...TOTAUX_ACTIF_SYSCOHADA.map((t) => t.ref),
      ...TOTAUX_PASSIF_SYSCOHADA.map((t) => t.ref),
      REF_RESULTAT_SYSCOHADA,
    ];
    expect(new Set(toutes).size).toBe(toutes.length);
  });

  it("l'ordre d'affichage couvre les postes de détail + totaux + CJ, rien de plus, rien de moins", () => {
    const refsActif = new Set([...POSTES_ACTIF_SYSCOHADA.map((p) => p.ref), ...TOTAUX_ACTIF_SYSCOHADA.map((t) => t.ref)]);
    expect(new Set(ORDRE_AFFICHAGE_ACTIF_SYSCOHADA)).toEqual(refsActif);
    const refsPassif = new Set([
      ...POSTES_PASSIF_SYSCOHADA.map((p) => p.ref),
      ...TOTAUX_PASSIF_SYSCOHADA.map((t) => t.ref),
      REF_RESULTAT_SYSCOHADA,
    ]);
    expect(new Set(ORDRE_AFFICHAGE_PASSIF_SYSCOHADA)).toEqual(refsPassif);
  });

  it('CJ (résultat) et DR (trésorerie passif) sont bien les refs annoncées, CJ hors POSTES_PASSIF, DR dedans', () => {
    expect(REF_RESULTAT_SYSCOHADA).toBe('CJ');
    expect(trouvePostePassifSyscohada('CJ')).toBeUndefined();
    expect(REF_TRESORERIE_PASSIF_SYSCOHADA).toBe('DR');
    expect(trouvePostePassifSyscohada('DR')?.comptes).toEqual(['561', '566']);
    expect(COMPTES_TRESORERIE_PASSIF_SI_CREDITEUR_SYSCOHADA).toEqual(['52', '53']);
  });

  it('chaque total ne référence que des refs qui existent (détail, total imbriqué ou CJ)', () => {
    const connues = new Set([
      ...POSTES_ACTIF_SYSCOHADA.map((p) => p.ref),
      ...POSTES_PASSIF_SYSCOHADA.map((p) => p.ref),
      ...TOTAUX_ACTIF_SYSCOHADA.map((t) => t.ref),
      ...TOTAUX_PASSIF_SYSCOHADA.map((t) => t.ref),
      REF_RESULTAT_SYSCOHADA,
    ]);
    for (const total of [...TOTAUX_ACTIF_SYSCOHADA, ...TOTAUX_PASSIF_SYSCOHADA]) {
      for (const ref of total.deRefs) expect(connues.has(ref)).toBe(true);
    }
  });

  it('un total ne référence jamais une ref définie APRÈS lui · le calcul en une passe lirait 0 en silence', () => {
    const resolues = new Set([
      ...POSTES_ACTIF_SYSCOHADA.map((p) => p.ref),
      ...POSTES_PASSIF_SYSCOHADA.map((p) => p.ref),
      REF_RESULTAT_SYSCOHADA,
    ]);
    for (const total of [...TOTAUX_ACTIF_SYSCOHADA, ...TOTAUX_PASSIF_SYSCOHADA]) {
      for (const ref of total.deRefs) expect(resolues.has(ref)).toBe(true);
      resolues.add(total.ref);
    }
  });

  it('les deux TOTAL GÉNÉRAL (BZ, DZ) reposent chacun sur toutes les grandes masses, écart de conversion compris', () => {
    // Ch. 3 section 1 : six grandes masses plus les écarts de conversion.
    expect(TOTAUX_ACTIF_SYSCOHADA.find((t) => t.ref === 'BZ')?.deRefs).toEqual(['AZ', 'BK', 'BT', 'BU']);
    expect(TOTAUX_PASSIF_SYSCOHADA.find((t) => t.ref === 'DZ')?.deRefs).toEqual(['DF', 'DP', 'DT', 'DV']);
    // Et chaque poste de détail est atteint par le total général de son côté (aucun poste hors somme).
    const atteint = (totaux: typeof TOTAUX_ACTIF_SYSCOHADA, racine: string): Set<string> => {
      const vus = new Set<string>();
      const visite = (ref: string) => {
        vus.add(ref);
        totaux.find((t) => t.ref === ref)?.deRefs.forEach(visite);
      };
      visite(racine);
      return vus;
    };
    const depuisBZ = atteint(TOTAUX_ACTIF_SYSCOHADA, 'BZ');
    for (const p of POSTES_ACTIF_SYSCOHADA) expect(depuisBZ.has(p.ref)).toBe(true);
    const depuisDZ = atteint(TOTAUX_PASSIF_SYSCOHADA, 'DZ');
    for (const p of POSTES_PASSIF_SYSCOHADA) expect(depuisDZ.has(p.ref)).toBe(true);
    expect(depuisDZ.has(REF_RESULTAT_SYSCOHADA)).toBe(true);
  });

  it('chaque préfixe de compte cité correspond à au moins un compte d’imputation du semis SYSCOHADA', () => {
    const absents = prefixesCites().filter(({ prefixe }) => !COMPTES_BILAN_SEMIS.some((c) => c.numero.startsWith(prefixe)));
    expect(absents).toEqual([]);
  });

  it('chaque préfixe cité reste dans les classes 1 à 5 · la classe 8 n’apparaît pas au bilan (ch. 7, clés de lecture)', () => {
    for (const { prefixe } of prefixesCites()) expect(prefixe).toMatch(/^[1-5]/);
  });

  it('aucun compte de bilan du semis ne reste orphelin, hors la liste justifiée · et cette liste est exactement l’ensemble des orphelins', () => {
    const orphelins = COMPTES_BILAN_SEMIS.filter((c) => !estCapte(c.numero)).map((c) => c.numero);
    const justifies = COMPTES_BILAN_SANS_POSTE_JUSTIFIES.map((j) => j.prefixe);
    // Chaque orphelin réel est justifié…
    const nonJustifies = orphelins.filter((n) => !justifies.some((j) => n.startsWith(j)));
    expect(nonJustifies).toEqual([]);
    // … et chaque justification vise un compte réellement orphelin (sinon
    // elle masquerait un compte qu'un poste capte déjà, ou un compte disparu).
    const justificationsInutiles = justifies.filter((j) => !orphelins.some((n) => n.startsWith(j)));
    expect(justificationsInutiles).toEqual([]);
    expect(justifies.sort()).toEqual(['130', '186', '187', '188', '585', '588']);
  });

  it('les comptes « à solder à la clôture » existent au plan, et chacun est soit capté par un poste (104 → CA) soit orphelin justifié', () => {
    const orphelinsJustifies = new Set(COMPTES_BILAN_SANS_POSTE_JUSTIFIES.map((j) => j.prefixe));
    for (const { prefixe } of COMPTES_BILAN_A_SOLDER_A_LA_CLOTURE) {
      const feuilles = COMPTES_BILAN_SEMIS.filter((c) => c.numero.startsWith(prefixe));
      expect(feuilles.length).toBeGreaterThan(0);
      // Un compte à solder n'est jamais dans deux listes de statut contradictoire :
      // soit un poste l'imprime (et le service le signale seulement), soit il est orphelin.
      const capte = feuilles.every((c) => estCapte(c.numero));
      const orphelin = orphelinsJustifies.has(prefixe);
      expect(capte !== orphelin).toBe(true);
    }
    expect(COMPTES_BILAN_A_SOLDER_A_LA_CLOTURE.map((c) => c.prefixe).sort()).toEqual(['104', '130', '585', '588']);
    // 104 est le seul à avoir un poste : CA (anomalie n° 10).
    expect(correspond('10470000', trouvePostePassifSyscohada('CA')!.comptes)).toBe(true);
  });

  it('aucun compte BRUT n’est réclamé par DEUX postes d’ACTIF à la fois (à sens de solde égal)', () => {
    for (const c of COMPTES_BILAN_SEMIS) {
      const postes = POSTES_ACTIF_SYSCOHADA.filter((p) => correspond(c.numero, p.comptes, p.exclusions));
      expect(postes.length).toBeLessThanOrEqual(1);
    }
  });

  it('aucun compte d’AMORTISSEMENT/DÉPRÉCIATION n’est déduit par DEUX postes d’actif · anomalie n° 1 (suffixe « p »)', () => {
    for (const c of COMPTES_BILAN_SEMIS) {
      const postes = POSTES_ACTIF_SYSCOHADA.filter(
        (p) => p.comptesAmortissement && correspond(c.numero, p.comptesAmortissement, p.exclusionsAmortissement),
      );
      expect(postes.length).toBeLessThanOrEqual(1);
    }
    // Les cinq comptes « p » du ch. 7, chacun sous UN SEUL poste, celui documenté en tête du fichier.
    const posteDe = (numero: string) => POSTES_ACTIF_SYSCOHADA.filter((p) => correspond(numero, p.comptesAmortissement ?? [], p.exclusionsAmortissement)).map((p) => p.ref);
    expect(posteDe('28180000')).toEqual(['AH']);
    expect(posteDe('29180000')).toEqual(['AH']);
    expect(posteDe('29190000')).toEqual(['AH']);
    expect(posteDe('29390000')).toEqual(['AL']);
    expect(posteDe('29490000')).toEqual(['AM']);
  });

  it('un compte de PASSIF n’est réclamé que par un seul poste de passif', () => {
    for (const c of COMPTES_BILAN_SEMIS) {
      const postes = POSTES_PASSIF_SYSCOHADA.filter((p) => correspond(c.numero, p.comptes, p.exclusions));
      expect(postes.length).toBeLessThanOrEqual(1);
    }
  });

  it('un compte réclamé à l’ACTIF et au PASSIF porte un qualificatif de sens des DEUX côtés · sinon il serait compté deux fois (anomalie n° 12)', () => {
    const partages: string[] = [];
    for (const c of COMPTES_BILAN_SEMIS) {
      const actif = POSTES_ACTIF_SYSCOHADA.filter((p) => correspond(c.numero, p.comptes, p.exclusions));
      const passif = POSTES_PASSIF_SYSCOHADA.filter((p) => correspond(c.numero, p.comptes, p.exclusions));
      if (actif.length === 0 || passif.length === 0) continue;
      partages.push(c.numero);
      for (const p of actif) expect({ numero: c.numero, ref: p.ref, sens: p.sens_qualificatif }).toEqual({ numero: c.numero, ref: p.ref, sens: 'DEBITEUR' });
      for (const p of passif) expect({ numero: c.numero, ref: p.ref, sens: p.sens_qualificatif }).toEqual({ numero: c.numero, ref: p.ref, sens: 'CREDITEUR' });
    }
    // Le partage existe bel et bien (BJ/DK/DM) : le test ne passe pas à vide.
    expect(partages.length).toBeGreaterThan(0);
    // Les écarts de conversion n'ont chacun qu'un poste : 478 → BU, 479 → DV.
    const postesDe = (numero: string) =>
      [...POSTES_ACTIF_SYSCOHADA, ...POSTES_PASSIF_SYSCOHADA].filter((p) => correspond(numero, p.comptes, p.exclusions)).map((p) => p.ref);
    for (const c of COMPTES_BILAN_SEMIS.filter((c) => c.numero.startsWith('478'))) expect(postesDe(c.numero)).toEqual(['BU']);
    for (const c of COMPTES_BILAN_SEMIS.filter((c) => c.numero.startsWith('479'))) expect(postesDe(c.numero)).toEqual(['DV']);
    // 52/53 ne sont partagés que par le transfert : DR ne les porte pas dans
    // `comptes`, BS les déclare transférables, et les deux listes coïncident.
    const bs = trouvePosteActifSyscohada('BS')!;
    expect(bs.comptesTransferesSiCrediteur).toEqual(COMPTES_TRESORERIE_PASSIF_SI_CREDITEUR_SYSCOHADA);
    for (const prefixe of COMPTES_TRESORERIE_PASSIF_SI_CREDITEUR_SYSCOHADA) {
      expect(POSTES_PASSIF_SYSCOHADA.some((p) => p.comptes.some((c) => c.startsWith(prefixe) || prefixe.startsWith(c)))).toBe(false);
    }
  });

  it('les renvois de notes de chaque poste et total reprennent la colonne Note du modèle du ch. 3', () => {
    const lignes = [...POSTES_ACTIF_SYSCOHADA, ...POSTES_PASSIF_SYSCOHADA, ...TOTAUX_ACTIF_SYSCOHADA, ...TOTAUX_PASSIF_SYSCOHADA];
    for (const l of lignes) expect({ ref: l.ref, note: l.note }).toEqual({ ref: l.ref, note: NOTES_MODELE_CH3[l.ref] });
    // Et aucun renvoi du modèle ne vise une ligne inconnue de la table.
    for (const ref of Object.keys(NOTES_MODELE_CH3)) expect(lignes.some((l) => l.ref === ref)).toBe(true);
  });

  it('BJ (créances) porte « débiteur », DK et DM (dettes) portent « créditeur », sur des préfixes disjoints entre DK et DM', () => {
    const bj = trouvePosteActifSyscohada('BJ')!;
    const dk = trouvePostePassifSyscohada('DK')!;
    const dm = trouvePostePassifSyscohada('DM')!;
    expect(bj.sens_qualificatif).toBe('DEBITEUR');
    expect(dk.sens_qualificatif).toBe('CREDITEUR');
    expect(dm.sens_qualificatif).toBe('CREDITEUR');
    // Ch. 7 : 42, 43, 44 → BJ/DK ; 185, 45, 46, 47 → BJ/DM. L'union DK + DM
    // doit valoir BJ (sinon un solde créditeur n'aurait pas de poste).
    expect([...dk.comptes, ...dm.comptes].sort()).toEqual([...bj.comptes].sort());
    expect(dk.comptes.filter((c) => dm.comptes.includes(c))).toEqual([]);
    // 478 et 479 sortent de BJ ET de DM (→ BU, → DV), au-delà de la lettre
    // du ch. 7 qui n'en retire qu'un de chaque côté (anomalie n° 12).
    expect(bj.exclusions).toEqual(['478', '479']);
    expect(dm.exclusions).toEqual(['478', '479']);
    // 41 n'est dans aucun des deux : il est entièrement en BI/DI.
    expect(bj.comptes).not.toContain('41');
    expect(dm.comptes).not.toContain('41');
  });

  it('les clauses « sauf » du ch. 7 renvoient chacune vers le poste qui reçoit le compte retiré', () => {
    expect(trouvePostePassifSyscohada('DJ')!.exclusions).toEqual(['409']);
    expect(trouvePosteActifSyscohada('BH')!.comptes).toEqual(['409']);
    expect(trouvePosteActifSyscohada('BI')!.exclusions).toEqual(['419']);
    expect(trouvePostePassifSyscohada('DI')!.comptes).toEqual(['419']);
    expect(trouvePosteActifSyscohada('AH')!.exclusions).toEqual(['2181']);
    expect(trouvePosteActifSyscohada('AE')!.comptes).toContain('2181');
    expect(trouvePosteActifSyscohada('AM')!.exclusions).toEqual(['245', '2495']);
    expect(trouvePosteActifSyscohada('AN')!.comptes).toEqual(['245', '2495']);
    expect(trouvePostePassifSyscohada('DN')!.exclusions).toEqual(['4998']);
    expect(trouvePostePassifSyscohada('DH')!.comptes).toContain('4998');
  });

  it('BS transfère ses 52/53 CRÉDITEURS vers DR et garde 54/55/57/581/582 visibles · anomalie n° 3', () => {
    const bs = trouvePosteActifSyscohada('BS')!;
    expect(bs.comptesTransferesSiCrediteur).toEqual(['52', '53']);
    expect(bs.sens_qualificatif).toBeUndefined();
    expect(bs.comptes).toEqual(['52', '53', '54', '55', '57', '581', '582']);
    // 585/588 n'y sont pas (anomalie n° 4).
    expect(bs.comptes).not.toContain('58');
  });

  it('2394, 2395, 2398 (absents du ch. 7) sont rattachés à AL · anomalie n° 2', () => {
    const al = trouvePosteActifSyscohada('AL')!;
    for (const numero of ['23940000', '23950000', '23980000']) {
      expect(correspond(numero, al.comptes, al.exclusions)).toBe(true);
    }
    // Et 2391 reste en AK, pas en AL.
    expect(correspond('23910000', al.comptes, al.exclusions)).toBe(false);
    expect(correspond('23910000', trouvePosteActifSyscohada('AK')!.comptes)).toBe(true);
  });

  it('CB (109) et CH (12) sont des postes de passif ordinaires · leur signe vient du solde, pas d’un traitement spécial', () => {
    expect(trouvePostePassifSyscohada('CB')!.comptes).toEqual(['109']);
    expect(trouvePostePassifSyscohada('CH')!.comptes).toEqual(['12']);
    // Le 13 n'est réclamé par AUCUN poste de passif (anomalie n° 7) : 131 à
    // 139 n'appartiennent qu'à CJ ; 130 (résultat N-1 en instance
    // d'affectation) n'est NI dans CJ ni ailleurs, il est orphelin justifié.
    for (const c of COMPTES_BILAN_SEMIS.filter((c) => c.numero.startsWith('13'))) {
      expect(POSTES_PASSIF_SYSCOHADA.some((p) => correspond(c.numero, p.comptes, p.exclusions))).toBe(false);
      expect({ numero: c.numero, cj: correspond(c.numero, COMPTES_RESULTAT_SYSCOHADA) }).toEqual({ numero: c.numero, cj: !c.numero.startsWith('130') });
    }
    expect(COMPTES_RESULTAT_SYSCOHADA).toEqual(['131', '132', '133', '134', '135', '136', '137', '138', '139']);
    expect(COMPTES_BILAN_SANS_POSTE_JUSTIFIES.find((j) => j.prefixe === '130')?.anomalie).toBe(7);
  });

  it('chaque poste de l’actif a des comptes d’amortissement sauf BU (écart de conversion) · ch. 7, colonne vide', () => {
    for (const p of POSTES_ACTIF_SYSCOHADA) {
      if (p.ref === 'BU') expect(p.comptesAmortissement).toBeUndefined();
      else expect(p.comptesAmortissement?.length).toBeGreaterThan(0);
    }
    // Et aucun poste de passif n'en porte (pas de colonne Amort. côté passif).
    for (const p of POSTES_PASSIF_SYSCOHADA) expect(p.comptesAmortissement).toBeUndefined();
  });

  it('aucun cadratin dans les libellés ni les renvois (CLAUDE.md §4)', () => {
    for (const p of [...POSTES_ACTIF_SYSCOHADA, ...POSTES_PASSIF_SYSCOHADA, ...TOTAUX_ACTIF_SYSCOHADA, ...TOTAUX_PASSIF_SYSCOHADA]) {
      expect(p.libelle).not.toMatch(/\u2014/); // le caractère est écrit échappé pour ne pas le réintroduire dans le dépôt
    }
  });
});
