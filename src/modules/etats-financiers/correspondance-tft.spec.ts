import {
  ORDRE_AFFICHAGE_FLUX,
  POSTES_FONDS_ETRANGERS,
  POSTES_FONDS_PROPRES,
  POSTES_INVESTISSEMENT,
  POSTES_OPERATIONNELS,
  TOTAUX_FLUX,
  TOUS_LES_POSTES_FLUX,
  trouvePosteFlux,
} from './correspondance-tft';
import { PLAN_COMPTES_SYCEBNL } from '../comptes/compte-seed';

/**
 * TABLEAU DE FLUX DE TRÉSORERIE SYCEBNL · 599 lignes de correspondance que
 * rien ne vérifiait.
 *
 * Le moteur avait ses tests : ils attrapent une table CASSÉE (un poste absent,
 * un total qui ne somme rien), pas une table FAUSSE (un compte rangé sous le
 * mauvais poste, un sens inversé, un libellé qui ne dit pas ce que le modèle
 * dit). Sur un état de flux, un sens inversé ne casse rien du tout : le
 * tableau boucle toujours, puisque ZG se contrôle par la trésorerie du bilan ·
 * seule la VENTILATION est fausse, et c'est elle que le bailleur lit.
 *
 * Ce spec confronte la table au modèle officiel transcrit ci-dessous
 * (`sycebnl`, partie4-ch2, section 3, Journal officiel OHADA du 22/02/2023),
 * et non à elle-même.
 */

/** Le modèle officiel, REF par REF, dans l'ordre du texte. Rep. = colonne « Rep. ». */
const MODELE_OFFICIEL: Array<{ ref: string; libelle: string; signe?: '+' | '-'; repere?: string }> = [
  { ref: 'ZA', libelle: 'Trésorerie nette au 1er janvier', repere: 'A' },
  { ref: 'FA', libelle: 'Encaissement des cotisations', signe: '+' },
  { ref: 'FB', libelle: "Encaissement des subventions d'exploitation et d'équilibre", signe: '+' },
  { ref: 'FC', libelle: 'Encaissement des revenus liés à la générosité', signe: '+' },
  { ref: 'FD', libelle: 'Encaissement des revenus des manifestations', signe: '+' },
  { ref: 'FE', libelle: 'Encaissement des autres revenus', signe: '+' },
  { ref: 'FF', libelle: 'Décaissement des sommes versées aux fournisseurs', signe: '-' },
  { ref: 'FG', libelle: 'Décaissement des sommes versées au personnel', signe: '-' },
  { ref: 'FH', libelle: 'Autres décaissements', signe: '-' },
  { ref: 'ZB', libelle: 'Flux de trésorerie provenant des activités opérationnelles', repere: 'B' },
  { ref: 'FI', libelle: "Décaissements liés aux acquisitions d'immobilisations incorporelles et corporelles", signe: '-' },
  { ref: 'FJ', libelle: "Décaissements liés aux acquisitions d'immobilisations financières", signe: '-' },
  { ref: 'FK', libelle: "Encaissements liés aux cessions d'immobilisations incorporelles et corporelles", signe: '+' },
  { ref: 'FL', libelle: "Encaissements liés aux cessions d'immobilisations financières", signe: '+' },
  { ref: 'ZC', libelle: "Flux de trésorerie provenant des activités d'investissement", repere: 'C' },
  { ref: 'FM', libelle: 'Encaissement des dotations et autres fonds propres', signe: '+' },
  { ref: 'FN', libelle: "Subventions d'investissement reçues", signe: '+' },
  { ref: 'FO', libelle: 'Décaissement des dotations et autres fonds propres', signe: '-' },
  { ref: 'ZD', libelle: 'Flux de trésorerie provenant des fonds propres', repere: 'D' },
  { ref: 'FP', libelle: 'Encaissement provenant des emprunts et des autres dettes financières', signe: '+' },
  { ref: 'FQ', libelle: 'Remboursements des emprunts et autres dettes financières', signe: '-' },
  { ref: 'ZE', libelle: 'Trésorerie provenant des fonds étrangers', repere: 'E' },
  // La ligne « activités de financement (D+E) » du modèle n'a NI code REF NI
  // repère · voir l'anomalie sur le repère F plus bas.
  { ref: '', libelle: 'Flux de trésorerie provenant des activités de financement (D+E)' },
  { ref: 'ZF', libelle: 'VARIATION DE LA TRÉSORERIE NETTE DE LA PÉRIODE', repere: 'G' },
  { ref: 'ZG', libelle: 'Trésorerie nette au 31 Décembre', repere: 'H' },
];

const COMPTES_IMPUTATION = PLAN_COMPTES_SYCEBNL.filter((c) => c.typeCompte !== 'TOTAL');

function existeAuPlan(prefixe: string): boolean {
  return COMPTES_IMPUTATION.some((c) => c.numero.startsWith(prefixe));
}

describe('correspondance TFT SYCEBNL · confrontation au modèle officiel', () => {
  it("l'ordre d'affichage reprend EXACTEMENT les codes du modèle, dans l'ordre du texte", () => {
    const refsAffichees = ORDRE_AFFICHAGE_FLUX.filter((e): e is { ref: string } => 'ref' in e).map((e) => e.ref);
    expect(refsAffichees).toEqual(MODELE_OFFICIEL.map((m) => m.ref));
  });

  it('intercale les quatre en-têtes de section du modèle, aux bons endroits', () => {
    // Le modèle pose un intitulé de rubrique avant chaque bloc · les omettre
    // donnerait vingt lignes d'affilée sans dire à quelle activité elles se
    // rattachent, ce qui est précisément la lecture que le TFT doit servir.
    const sections = ORDRE_AFFICHAGE_FLUX.filter((e): e is { section: string } => 'section' in e);
    expect(sections).toHaveLength(4);
    const positionsSections = ORDRE_AFFICHAGE_FLUX.map((e, i) => ('section' in e ? i : -1)).filter((i) => i >= 0);
    const positionZA = ORDRE_AFFICHAGE_FLUX.findIndex((e) => 'ref' in e && e.ref === 'ZA');
    expect(positionsSections[0]).toBe(positionZA + 1);
  });

  it('ne comporte aucune ref en double, postes et totaux confondus', () => {
    const refs = [...TOUS_LES_POSTES_FLUX.map((p) => p.ref), ...TOTAUX_FLUX.map((t) => t.ref)].filter((r) => r !== '');
    expect(new Set(refs).size).toBe(refs.length);
  });

  it('les vingt et un libellés de postes reprennent ceux du modèle', () => {
    for (const attendu of MODELE_OFFICIEL.filter((m) => m.ref.startsWith('F'))) {
      const poste = trouvePosteFlux(attendu.ref);
      expect(poste).toBeDefined();
      expect(poste!.libelle).toBe(attendu.libelle);
    }
  });

  it('le SENS de chaque poste suit le signe du modèle · un sens inversé ne casse rien et fausse tout', () => {
    // ZG se contrôlant par la trésorerie du bilan, un « + » lu « - » laisse le
    // tableau boucler : seule la ventilation ment, et c'est elle qu'on lit.
    for (const attendu of MODELE_OFFICIEL.filter((m) => m.signe)) {
      const poste = trouvePosteFlux(attendu.ref)!;
      expect([attendu.ref, poste.sens]).toEqual([
        attendu.ref,
        attendu.signe === '+' ? 'ENCAISSEMENT' : 'DECAISSEMENT',
      ]);
    }
  });

  it('porte les repères A à H du modèle, F compris dans son absence', () => {
    // ANOMALIE DU TEXTE : le modèle numérote A, B, C, D, E, puis saute
    // directement à G pour ZF. Le repère F n'est attribué à rien · il devrait
    // logiquement désigner la ligne « activités de financement (D+E) », que le
    // texte laisse elle aussi sans code REF. Transcrit tel quel.
    const reperes = TOTAUX_FLUX.map((t) => t.repere).filter(Boolean);
    expect(reperes).toEqual(['B', 'C', 'D', 'E', 'G']);
    expect(reperes).not.toContain('F');
  });

  it('ZF somme bien B + C + D + E, comme l’écrit le modèle', () => {
    const zf = TOTAUX_FLUX.find((t) => t.ref === 'ZF')!;
    expect(zf.deRefs).toEqual(['ZB', 'ZC', 'ZD', 'ZE']);
  });

  it('chaque total ne somme que les postes de SON bloc, ni plus ni moins', () => {
    const attendus: Array<[string, string[]]> = [
      ['ZB', POSTES_OPERATIONNELS.map((p) => p.ref)],
      ['ZC', POSTES_INVESTISSEMENT.map((p) => p.ref)],
      ['ZD', POSTES_FONDS_PROPRES.map((p) => p.ref)],
      ['ZE', POSTES_FONDS_ETRANGERS.map((p) => p.ref)],
    ];
    for (const [ref, postes] of attendus) {
      expect(TOTAUX_FLUX.find((t) => t.ref === ref)!.deRefs).toEqual(postes);
    }
  });

  it('un total ne référence jamais une ref définie APRÈS lui · le calcul en une passe lirait 0', () => {
    const rangDefinition = new Map<string, number>();
    TOUS_LES_POSTES_FLUX.forEach((p, i) => rangDefinition.set(p.ref, i));
    TOTAUX_FLUX.forEach((t, i) => rangDefinition.set(t.ref, 1000 + i));
    TOTAUX_FLUX.forEach((t, i) => {
      for (const de of t.deRefs) {
        expect([t.ref, de, rangDefinition.get(de)! < 1000 + i]).toEqual([t.ref, de, true]);
      }
    });
  });
});

describe('correspondance TFT SYCEBNL · cohérence avec le plan de comptes', () => {
  it('chaque préfixe cité correspond à au moins un compte d’imputation du semis', () => {
    for (const p of TOUS_LES_POSTES_FLUX) {
      for (const prefixe of [...p.comptesFlux, ...(p.comptesContrepartie ?? [])]) {
        expect([p.ref, prefixe, existeAuPlan(prefixe)]).toEqual([p.ref, prefixe, true]);
      }
    }
  });

  it('chaque exclusion porte sur un préfixe que le poste capte réellement', () => {
    // Une exclusion qui ne mord sur rien est un vestige : elle laisse croire
    // qu'un compte est écarté alors qu'il n'était pas pris.
    for (const p of TOUS_LES_POSTES_FLUX) {
      for (const ex of p.exclusionsFlux ?? []) {
        expect([p.ref, ex, p.comptesFlux.some((c) => ex.startsWith(c))]).toEqual([p.ref, ex, true]);
      }
      for (const ex of p.exclusionsContrepartie ?? []) {
        expect([p.ref, ex, (p.comptesContrepartie ?? []).some((c) => ex.startsWith(c))]).toEqual([p.ref, ex, true]);
      }
    }
  });

  it('deux postes ne captent le même compte que par des lectures DISJOINTES', () => {
    /*
     * Un compte partagé n'est pas en soi un double comptage · tout dépend de
     * la lecture. Le modèle officiel pose lui-même des paires symétriques :
     * FM « + Encaissement des dotations » lit le compte 10 en CRÉDITS SEULS,
     * FO « - Décaissement des dotations » lit le MÊME 10 en DÉBITS SEULS.
     * Chaque mouvement ne tombe que d'un côté, et la ventilation est juste.
     *
     * Ce qui serait faux, c'est deux postes lisant le même compte du MÊME
     * côté, ou l'un en solde net et l'autre en débits seuls · le montant
     * partirait alors deux fois. C'est cela que ce test interdit, et il est
     * plus strict que « pas de compte partagé » : il laisse passer le cas
     * légitime et attrape exactement le cas dangereux.
     */
    const disjointes = (a: string, b: string) =>
      (a === 'DEBIT_SEUL' && b === 'CREDIT_SEUL') || (a === 'CREDIT_SEUL' && b === 'DEBIT_SEUL');

    for (const [nom, postes] of [
      ['opérationnels', POSTES_OPERATIONNELS],
      ['investissement', POSTES_INVESTISSEMENT],
      ['fonds propres', POSTES_FONDS_PROPRES],
      ['fonds étrangers', POSTES_FONDS_ETRANGERS],
    ] as Array<[string, typeof POSTES_OPERATIONNELS]>) {
      const vus = new Map<string, { ref: string; lecture: string }>();
      for (const p of postes) {
        for (const c of COMPTES_IMPUTATION) {
          const capte =
            p.comptesFlux.some((pref) => c.numero.startsWith(pref)) &&
            !(p.exclusionsFlux ?? []).some((ex) => c.numero.startsWith(ex));
          if (!capte) continue;
          const deja = vus.get(c.numero);
          if (deja) {
            expect([nom, c.numero, `${deja.ref}/${p.ref}`, disjointes(deja.lecture, p.lectureFlux)]).toEqual([
              nom,
              c.numero,
              `${deja.ref}/${p.ref}`,
              true,
            ]);
          }
          vus.set(c.numero, { ref: p.ref, lecture: p.lectureFlux });
        }
      }
    }
  });

  it('la lecture d’un poste correspond à ce qu’il enregistre', () => {
    // Une acquisition se lit en DÉBITS SEULS : un crédit sur le même compte
    // est une cession, qui relève d'un autre poste. Lire le solde net mêlerait
    // les deux et afficherait une acquisition minorée de la cession.
    expect(trouvePosteFlux('FI')!.lectureFlux).toBe('DEBIT_SEUL');
    expect(trouvePosteFlux('FJ')!.lectureFlux).toBe('DEBIT_SEUL');
    // Un apport de ressource durable se lit en CRÉDITS SEULS, un débit étant
    // un remboursement · d'où FP en crédits et FQ en débits.
    expect(trouvePosteFlux('FM')!.lectureFlux).toBe('CREDIT_SEUL');
    expect(trouvePosteFlux('FN')!.lectureFlux).toBe('CREDIT_SEUL');
    expect(trouvePosteFlux('FP')!.lectureFlux).toBe('CREDIT_SEUL');
    expect(trouvePosteFlux('FQ')!.lectureFlux).toBe('DEBIT_SEUL');
  });

  it('les postes d’encaissement de revenus portent une contrepartie de créance', () => {
    // Méthode directe : « Encaissements = Revenus (N) + Créances (N-1) −
    // Créances (N) » (Partie 4 ch. 1 § 4). Sans contrepartie, le poste
    // déclarerait encaissé tout ce qui a été facturé.
    for (const ref of ['FA', 'FB', 'FC', 'FE']) {
      const p = trouvePosteFlux(ref)!;
      expect([ref, (p.comptesContrepartie ?? []).length > 0]).toEqual([ref, true]);
      for (const c of p.comptesContrepartie!) expect([ref, c.startsWith('4')]).toEqual([ref, true]);
    }
  });

  it('aucun cadratin dans les libellés ni les notes (CLAUDE.md §4)', () => {
    for (const p of TOUS_LES_POSTES_FLUX) {
      expect(p.libelle).not.toContain('—');
      if (p.note) expect(p.note).not.toContain('—');
    }
    for (const t of TOTAUX_FLUX) expect(t.libelle).not.toContain('—');
  });
});
