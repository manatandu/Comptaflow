import { Injectable } from '@nestjs/common';
import { ClasseCompte } from '@prisma/client';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ExerciceService } from '../exercice/exercice.service';
import { CompteDuPoste, LigneBalancePourEtat, chargerLignes, correspond, trouverExerciceN1 } from './etats-financiers.communs';
import { PosteCalcule } from './etats-financiers.service';
import { POSTES_CHARGES, POSTES_REVENUS, PosteCompteExploitation, posteDuCompte } from './correspondance-projet-compte-exploitation';
import {
  COMPTES_TRESORERIE_PASSIF_SI_CREDITEUR,
  ORDRE_AFFICHAGE_ACTIF,
  ORDRE_AFFICHAGE_PASSIF,
  POSTES_ACTIF,
  POSTES_PASSIF,
  PosteBilanProjetDeBase,
  TOTAUX_ACTIF,
  TOTAUX_PASSIF,
} from './correspondance-projet-bilan';

/**
 * BILAN et COMPTE D'EXPLOITATION du jeu SYCEBNL « projets de développement
 * et assimilés », Système normal — adossés aux tableaux de correspondance
 * OFFICIELS transcrits dans `correspondance-projet-bilan.ts` et
 * `correspondance-projet-compte-exploitation.ts` (Journal officiel OHADA,
 * Partie 4, ch. 3). Construit le 2026-08-28
 * (docs/plan-de-construction.md, item 13), en miroir de
 * `EtatsFinanciersService` (jeu « associations et ordres professionnels »)
 * dont il réutilise les mêmes conventions Brut/Amortissement/Net côté
 * actif et le même comparatif N-1 — voir `etats-financiers.communs.ts`
 * pour les aides partagées entre les deux services.
 *
 * Hors périmètre de ce service, documenté et non simulé (règle §2.6) :
 * - **Tableau d'exécution budgétaire** : la maquette officielle (Section 2)
 *   suit un budget PAR PROJET selon une nomenclature budgétaire propre au
 *   projet, que Compta Flow n'a aucun modèle de données pour représenter
 *   (pas de notion de "ligne budgétaire" ni d'"engagement" distincte d'une
 *   écriture comptée). Construire ce tableau à partir de la seule balance
 *   inventerait des montants "Budget"/"Engagement" qu'aucune donnée ne
 *   porte — un mur de périmètre réel, pas un oubli.
 * - **Tableau emplois-ressources (TER)** et **Tableau de réconciliation de
 *   trésorerie (TRC)** : le texte officiel ne fournit, pour ces deux
 *   tableaux, AUCUN tableau de correspondance poste→comptes (contrairement
 *   au Bilan et au Compte d'exploitation, Section 4-correspondance) — leurs
 *   REF (FA-GZ, A-I) ne sont définis que par leur libellé. Les construire
 *   quand même exigerait d'inventer un rattachement aux comptes, ce que la
 *   règle §2.6 interdit explicitement. Restent donc non construits ici ;
 *   à reprendre si/quand le texte officiel (ou une note annexe encore non
 *   transcrite) fournit ce rattachement.
 */
@Injectable()
export class EtatsFinanciersProjetService {
  constructor(
    private readonly ecritureService: EcritureService,
    private readonly exerciceService: ExerciceService,
  ) {}

  private async trouverExerciceN1(tenantId: string, exerciceId: string): Promise<string | null> {
    return trouverExerciceN1(this.exerciceService, tenantId, exerciceId);
  }

  private async chargerLignes(tenantId: string, exerciceId: string | null): Promise<LigneBalancePourEtat[]> {
    return chargerLignes(this.ecritureService, tenantId, exerciceId);
  }

  /** Poste ACTIF de détail : brut, amortissement (magnitude positive) et net — même logique que le jeu associations. */
  private calculerPosteActif(poste: PosteBilanProjetDeBase, lignes: LigneBalancePourEtat[]): PosteCalcule {
    let lignesBrut = lignes.filter((l) => correspond(l.numero, poste.comptes, poste.exclusions));
    if (poste.sens_qualificatif === 'DEBITEUR') {
      lignesBrut = lignesBrut.filter((l) => l.solde > 0);
    }
    const comptesBrut: CompteDuPoste[] = lignesBrut.map((l) => ({ numero: l.numero, intitule: l.intitule, montant: l.solde }));
    const brut = comptesBrut.reduce((s, c) => s + c.montant, 0);

    const lignesAmort = poste.comptesAmortissement
      ? lignes.filter((l) => correspond(l.numero, poste.comptesAmortissement!, poste.exclusionsAmortissement))
      : [];
    // Même convention de signe que EtatsFinanciersService.calculerPosteActif
    // (voir son commentaire pour le piège de signe déjà rencontré et testé).
    const comptesAmort: CompteDuPoste[] = lignesAmort.map((l) => ({ numero: l.numero, intitule: l.intitule, montant: l.solde }));
    const amortissement = -comptesAmort.reduce((s, c) => s + c.montant, 0) || 0;

    return {
      ref: poste.ref,
      libelle: poste.libelle,
      montant: brut - amortissement,
      brut,
      amortissement,
      comptes: [...comptesBrut, ...comptesAmort],
    };
  }

  private calculerPostePassif(poste: PosteBilanProjetDeBase, lignes: LigneBalancePourEtat[]): PosteCalcule {
    let matches = lignes.filter((l) => correspond(l.numero, poste.comptes, poste.exclusions));
    if (poste.sens_qualificatif === 'CREDITEUR') {
      matches = matches.filter((l) => l.solde < 0);
    }
    const comptes: CompteDuPoste[] = matches.map((l) => ({ numero: l.numero, intitule: l.intitule, montant: -l.solde }));
    return { ref: poste.ref, libelle: poste.libelle, montant: comptes.reduce((s, c) => s + c.montant, 0), comptes };
  }

  /** DW — même mécanisme de découvert bancaire que le jeu associations (voir correspondance-projet-bilan.ts). */
  private calculerDW(lignes: LigneBalancePourEtat[]): PosteCalcule {
    const posteDW = POSTES_PASSIF.find((p) => p.ref === 'DW')!;
    const base = this.calculerPostePassif(posteDW, lignes);
    const decouverts = lignes.filter((l) => correspond(l.numero, COMPTES_TRESORERIE_PASSIF_SI_CREDITEUR) && l.solde < 0);
    const comptes = [...base.comptes, ...decouverts.map((l) => ({ numero: l.numero, intitule: l.intitule, montant: -l.solde }))];
    return { ref: 'DW', libelle: posteDW.libelle, montant: comptes.reduce((s, c) => s + c.montant, 0), comptes };
  }

  /**
   * CC (Solde des opérations de l'exercice) — contrairement à CH côté
   * associations, ce poste ne s'arbitre pas entre classes 6/7/8 et compte
   * 13 : il vient UNIQUEMENT du compte 13 (voir la note de tête de fichier
   * de `correspondance-projet-compte-exploitation.ts` — ce jeu est construit
   * pour boucler le compte d'exploitation à XC = 0, pas pour porter un
   * résultat net au sens associatif).
   */
  private calculerCC(lignes: LigneBalancePourEtat[]): PosteCalcule {
    const lignes13 = lignes.filter((l) => l.numero.startsWith('13'));
    const montant = lignes13.reduce((s, l) => s - l.solde, 0);
    const comptes = lignes13
      .filter((l) => Math.abs(l.solde) > 0.005)
      .map((l) => ({ numero: l.numero, intitule: l.intitule, montant: -l.solde }));
    return { ref: 'CC', libelle: "Solde des opérations de l'exercice", montant, comptes };
  }

  private resoudreTousLesPostesBilan(lignes: LigneBalancePourEtat[]): Map<string, PosteCalcule> {
    const parRef = new Map<string, PosteCalcule>();
    for (const poste of POSTES_ACTIF) {
      parRef.set(poste.ref, this.calculerPosteActif(poste, lignes));
    }
    for (const poste of POSTES_PASSIF) {
      if (poste.ref === 'DW') continue;
      parRef.set(poste.ref, this.calculerPostePassif(poste, lignes));
    }
    parRef.set('DW', this.calculerDW(lignes));
    parRef.set('CC', this.calculerCC(lignes));

    for (const total of TOTAUX_ACTIF) {
      const montant = total.deRefs.reduce((s, ref) => s + (parRef.get(ref)?.montant ?? 0), 0);
      const brut = total.deRefs.reduce((s, ref) => {
        const p = parRef.get(ref);
        return s + (p?.brut ?? p?.montant ?? 0);
      }, 0);
      const amortissement = total.deRefs.reduce((s, ref) => s + (parRef.get(ref)?.amortissement ?? 0), 0);
      parRef.set(total.ref, { ref: total.ref, libelle: total.libelle, montant, brut, amortissement, comptes: [] });
    }
    for (const total of TOTAUX_PASSIF) {
      const montant = total.deRefs.reduce((s, ref) => s + (parRef.get(ref)?.montant ?? 0), 0);
      parRef.set(total.ref, { ref: total.ref, libelle: total.libelle, montant, comptes: [] });
    }

    return parRef;
  }

  async bilan(tenantId: string, exerciceId: string) {
    const exerciceN1Id = await this.trouverExerciceN1(tenantId, exerciceId);
    const [lignesN, lignesN1] = await Promise.all([
      this.chargerLignes(tenantId, exerciceId),
      this.chargerLignes(tenantId, exerciceN1Id),
    ]);

    const parRefN = this.resoudreTousLesPostesBilan(lignesN);
    const parRefN1 = this.resoudreTousLesPostesBilan(lignesN1);

    const refsTotaux = new Set([...TOTAUX_ACTIF, ...TOTAUX_PASSIF].map((t) => t.ref));
    const fusionnerN1 = (ref: string): PosteCalcule => {
      const n = parRefN.get(ref)!;
      const n1 = exerciceN1Id ? parRefN1.get(ref) : undefined;
      return {
        ...n,
        estTotal: refsTotaux.has(ref),
        montantN1: n1?.montant,
        brutN1: n.brut !== undefined ? (n1?.brut ?? 0) : undefined,
        amortissementN1: n.amortissement !== undefined ? (n1?.amortissement ?? 0) : undefined,
      };
    };
    const actif = ORDRE_AFFICHAGE_ACTIF.map(fusionnerN1);
    const passif = ORDRE_AFFICHAGE_PASSIF.map(fusionnerN1);

    // Comptes de bilan (classes 1-5) qu'aucun poste ne capte — jamais
    // absorbés en silence (même discipline que le jeu associations).
    const comptesRattaches = new Set<string>();
    for (const poste of [...POSTES_ACTIF, ...POSTES_PASSIF]) {
      for (const l of lignesN) {
        if (
          correspond(l.numero, poste.comptes, poste.exclusions) ||
          (poste.comptesAmortissement && correspond(l.numero, poste.comptesAmortissement, poste.exclusionsAmortissement))
        ) {
          comptesRattaches.add(l.compteId);
        }
      }
    }
    for (const l of lignesN) {
      if (correspond(l.numero, COMPTES_TRESORERIE_PASSIF_SI_CREDITEUR) || l.numero.startsWith('13')) {
        comptesRattaches.add(l.compteId);
      }
    }
    const CLASSES_DE_BILAN = new Set<ClasseCompte>([
      ClasseCompte.CLASSE_1,
      ClasseCompte.CLASSE_2,
      ClasseCompte.CLASSE_3,
      ClasseCompte.CLASSE_4,
      ClasseCompte.CLASSE_5,
    ]);
    const comptesNonRattaches: CompteDuPoste[] = lignesN
      .filter((l) => CLASSES_DE_BILAN.has(l.classe) && !comptesRattaches.has(l.compteId))
      .map((l) => ({ numero: l.numero, intitule: l.intitule, montant: l.solde }));

    const totalActif = parRefN.get('BZ')!.montant;
    const totalPassif = parRefN.get('DZ')!.montant;
    const totalActifN1 = exerciceN1Id ? parRefN1.get('BZ')!.montant : undefined;
    const totalPassifN1 = exerciceN1Id ? parRefN1.get('DZ')!.montant : undefined;

    return {
      actif,
      passif,
      totalActif,
      totalPassif,
      totalActifN1,
      totalPassifN1,
      exerciceN1Disponible: exerciceN1Id !== null,
      equilibre: Math.abs(totalActif - totalPassif) < 0.01,
      comptesNonRattaches,
    };
  }

  private resoudreTousLesPostesCE(lignes: LigneBalancePourEtat[]): {
    revenus: PosteCalcule[];
    charges: PosteCalcule[];
    comptesNonRattaches: CompteDuPoste[];
  } {
    const comptesParCle = new Map<string, CompteDuPoste[]>();
    const comptesNonRattaches: CompteDuPoste[] = [];

    for (const l of lignes) {
      const poste = posteDuCompte(l.numero);
      if (!poste) {
        const estCompteDeGestion =
          l.classe === ClasseCompte.CLASSE_6 || l.classe === ClasseCompte.CLASSE_7 || l.classe === ClasseCompte.CLASSE_8;
        if (estCompteDeGestion) {
          comptesNonRattaches.push({ numero: l.numero, intitule: l.intitule, montant: l.totalCredit - l.totalDebit });
        }
        continue;
      }
      const montant = poste.sens === 'PRODUIT' ? l.totalCredit - l.totalDebit : l.totalDebit - l.totalCredit;
      const existants = comptesParCle.get(poste.cle) ?? [];
      existants.push({ numero: l.numero, intitule: l.intitule, montant });
      comptesParCle.set(poste.cle, existants);
    }

    const calculer = (poste: PosteCompteExploitation): PosteCalcule => {
      const comptes = comptesParCle.get(poste.cle) ?? [];
      return { ref: poste.ref, libelle: poste.libelle, montant: comptes.reduce((s, c) => s + c.montant, 0), comptes };
    };

    return {
      revenus: POSTES_REVENUS.map(calculer),
      charges: POSTES_CHARGES.map(calculer),
      comptesNonRattaches,
    };
  }

  /**
   * COMPTE D'EXPLOITATION — voir `correspondance-projet-compte-exploitation.ts`
   * pour les 3 anomalies du texte officiel reproduites/corrigées ici (RC
   * restituée, RE inclus dans XA, doublon REF TJ/TK conservé via `cle`).
   * XA = Σrevenus, XB = Σcharges (au sens officiel, TK_PRODUITS_HAO inclus
   * malgré son signe +), XC = XA − XB — voir la note de tête de fichier du
   * service pour ce que XC ≠ 0 signale (pas une erreur du moteur).
   */
  async compteExploitation(tenantId: string, exerciceId: string) {
    const exerciceN1Id = await this.trouverExerciceN1(tenantId, exerciceId);
    const [lignesN, lignesN1] = await Promise.all([
      this.chargerLignes(tenantId, exerciceId),
      this.chargerLignes(tenantId, exerciceN1Id),
    ]);

    const resN = this.resoudreTousLesPostesCE(lignesN);
    const resN1 = this.resoudreTousLesPostesCE(lignesN1);
    // Les `cle` de POSTES_REVENUS/POSTES_CHARGES sont uniques (contrairement
    // aux `ref` dupliqués TJ/TK) : on fusionne N1 en reparcourant les deux
    // tableaux dans le même ordre plutôt que par une Map indexée sur `ref`.
    const fusionnerN1 = (n: PosteCalcule, n1: PosteCalcule): PosteCalcule => ({
      ...n,
      montantN1: exerciceN1Id ? n1.montant : undefined,
    });

    const revenus = resN.revenus.map((p, i) => fusionnerN1(p, resN1.revenus[i]));
    const charges = resN.charges.map((p, i) => fusionnerN1(p, resN1.charges[i]));

    const totalRevenus = revenus.reduce((s, p) => s + p.montant, 0); // XA
    const totalCharges = charges.reduce((s, p) => s + p.montant, 0); // XB
    const solde = totalRevenus - totalCharges; // XC

    const totalRevenusN1 = exerciceN1Id ? revenus.reduce((s, p) => s + (p.montantN1 ?? 0), 0) : undefined;
    const totalChargesN1 = exerciceN1Id ? charges.reduce((s, p) => s + (p.montantN1 ?? 0), 0) : undefined;
    const soldeN1 = totalRevenusN1 !== undefined && totalChargesN1 !== undefined ? totalRevenusN1 - totalChargesN1 : undefined;

    return {
      revenus,
      totalRevenus, // XA
      totalRevenusN1,
      charges,
      totalCharges, // XB
      totalChargesN1,
      solde, // XC
      soldeN1,
      exerciceN1Disponible: exerciceN1Id !== null,
      comptesNonRattaches: resN.comptesNonRattaches,
      controle: {
        // XC doit valoir 0 en régime normal (voir note de tête de fichier) —
        // exposé, jamais forcé à zéro artificiellement.
        boucleAZero: Math.abs(solde) < 0.01,
      },
    };
  }
}
