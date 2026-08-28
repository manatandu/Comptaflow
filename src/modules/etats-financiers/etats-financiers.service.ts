import { Injectable } from '@nestjs/common';
import { ClasseCompte, TypeCompteDetailTotal } from '@prisma/client';
import { EcritureService } from '../comptabilite/ecriture.service';
import {
  POSTES_CHARGES,
  POSTES_HAO,
  POSTES_PRODUITS,
  PosteCompteResultat,
  posteDuCompte,
} from './correspondance-compte-resultat';
import {
  COMPTES_TRESORERIE_PASSIF_SI_CREDITEUR,
  ORDRE_AFFICHAGE_ACTIF,
  ORDRE_AFFICHAGE_PASSIF,
  POSTES_ACTIF,
  POSTES_PASSIF,
  PosteBilanDeBase,
  TOTAUX_ACTIF,
  TOTAUX_PASSIF,
} from './correspondance-bilan';

/** Un compte rattaché à un poste, avec sa contribution — permet le drill-down. */
export interface CompteDuPoste {
  numero: string;
  intitule: string;
  montant: number;
}

/** Un poste du compte de résultat OU du bilan, calculé. */
export interface PosteCalcule {
  ref: string;
  libelle: string;
  montant: number;
  comptes: CompteDuPoste[];
  /** Bilan uniquement : ligne de sous-total ou de total, pas un poste de détail. */
  estTotal?: boolean;
}

/** Une ligne de balance déjà agrégée par compte (voir EcritureService.balance()). */
interface LigneBalancePourBilan {
  compteId: string;
  numero: string;
  intitule: string;
  classe: ClasseCompte;
  typeCompte: TypeCompteDetailTotal;
  totalDebit: number;
  totalCredit: number;
  solde: number;
}

/**
 * Un compte correspond à un poste si son numéro commence par l'un des
 * préfixes du poste ET par aucun de ses préfixes exclus (§ convention de
 * lecture, `correspondance-bilan.ts`).
 */
function correspond(numero: string, prefixes: string[], exclusions: string[] = []): boolean {
  return prefixes.some((p) => numero.startsWith(p)) && !exclusions.some((e) => numero.startsWith(e));
}

/**
 * BILAN — adossé au tableau de correspondance OFFICIEL SYCEBNL
 * (`correspondance-bilan.ts`, transcrit du Journal officiel OHADA,
 * Partie 4 ch. 2 section 6) — remplace, depuis le 2026-08-28, le
 * regroupement simplifié classe→poste qui servait de MVP. Comme pour le
 * compte de résultat, les anomalies du texte officiel sont signalées et
 * corrigées explicitement dans `correspondance-bilan.ts` (mêmes
 * corrections que le moteur `liasse/` du skill `sycebnl`), jamais
 * masquées ni devinées.
 */
@Injectable()
export class EtatsFinanciersService {
  constructor(private readonly ecritureService: EcritureService) {}

  /** Poste ACTIF de détail : brut (sens naturel) moins amortissements/dépréciations (soustractifs). */
  private calculerPosteActif(poste: PosteBilanDeBase, lignes: LigneBalancePourBilan[]): PosteCalcule {
    let lignesBrut = lignes.filter((l) => correspond(l.numero, poste.comptes, poste.exclusions));
    if (poste.sens_qualificatif === 'DEBITEUR') {
      lignesBrut = lignesBrut.filter((l) => l.solde > 0);
    }
    const comptes: CompteDuPoste[] = lignesBrut.map((l) => ({ numero: l.numero, intitule: l.intitule, montant: l.solde }));

    const lignesAmort = poste.comptesAmortissement
      ? lignes.filter((l) => correspond(l.numero, poste.comptesAmortissement!, poste.exclusionsAmortissement))
      : [];
    for (const l of lignesAmort) {
      // PAS de négation ici : un compte d'amortissement/dépréciation bien
      // formé porte un solde (débit − crédit) déjà négatif (créditeur), ce
      // qui le soustrait naturellement du brut dès qu'on l'additionne dans
      // la même somme — brut(5000) + amort(-1500) = net(3500). Le signer en
      // positif aurait ADDITIONNÉ l'amortissement au lieu de le déduire :
      // piège repéré en dérivant un cas de test à la main avant livraison,
      // pas constaté en production. La valeur reste donc négative dans le
      // drill-down (feuille « Détail par poste »), ce qui est le signe
      // honnête de sa contribution au total, pas une erreur d'affichage.
      comptes.push({ numero: l.numero, intitule: l.intitule, montant: l.solde });
    }

    return { ref: poste.ref, libelle: poste.libelle, montant: comptes.reduce((s, c) => s + c.montant, 0), comptes };
  }

  /** Poste PASSIF de détail : solde créditeur net dans son sens naturel de lecture. */
  private calculerPostePassif(poste: PosteBilanDeBase, lignes: LigneBalancePourBilan[]): PosteCalcule {
    let matches = lignes.filter((l) => correspond(l.numero, poste.comptes, poste.exclusions));
    if (poste.sens_qualificatif === 'CREDITEUR') {
      matches = matches.filter((l) => l.solde < 0);
    }
    const comptes: CompteDuPoste[] = matches.map((l) => ({ numero: l.numero, intitule: l.intitule, montant: -l.solde }));
    return { ref: poste.ref, libelle: poste.libelle, montant: comptes.reduce((s, c) => s + c.montant, 0), comptes };
  }

  /**
   * DW (banques… crédits de trésorerie) — anomalie n° 5 : capte 564/565
   * comme un poste normal, PLUS les comptes 52/53 (les mêmes numéros que BW
   * à l'actif) mais SEULEMENT pour ceux dont le solde est créditeur (une
   * banque à découvert). Traité à part : ce n'est pas un poste de détail
   * ordinaire, il partage ses comptes avec un poste de l'ACTIF.
   */
  private calculerDW(lignes: LigneBalancePourBilan[]): PosteCalcule {
    const posteDW = POSTES_PASSIF.find((p) => p.ref === 'DW')!;
    const base = this.calculerPostePassif(posteDW, lignes);
    const decouverts = lignes.filter((l) => correspond(l.numero, COMPTES_TRESORERIE_PASSIF_SI_CREDITEUR) && l.solde < 0);
    const comptes = [...base.comptes, ...decouverts.map((l) => ({ numero: l.numero, intitule: l.intitule, montant: -l.solde }))];
    return { ref: 'DW', libelle: posteDW.libelle, montant: comptes.reduce((s, c) => s + c.montant, 0), comptes };
  }

  /**
   * CH (Résultat net de l'exercice) — n'est PAS listé dans
   * `correspondance-bilan.ts` : le compte 13 officiel (voir sycebnl,
   * COMPTE 13) n'est mouvementé qu'À LA CLÔTURE, par transfert des soldes
   * des classes 6/7/8. Avant clôture, le résultat vit dans ces classes ;
   * après, il vit dans le compte 13, qui les solde à zéro. Utiliser l'une
   * OU l'autre source, jamais les deux (voir `controle` du retour de
   * `bilan()` — double comptage possible et signalé, pas deviné).
   */
  private calculerCH(
    lignes: LigneBalancePourBilan[],
  ): { poste: PosteCalcule; resultatClasses678: number; resultatCompte13: number } {
    const lignes678 = lignes.filter(
      (l) => l.classe === ClasseCompte.CLASSE_6 || l.classe === ClasseCompte.CLASSE_7 || l.classe === ClasseCompte.CLASSE_8,
    );
    const resultatClasses678 = lignes678.reduce((s, l) => s - l.solde, 0);

    const lignes13 = lignes.filter((l) => l.numero.startsWith('13'));
    const resultatCompte13 = lignes13.reduce((s, l) => s - l.solde, 0);

    const avantCloture = Math.abs(resultatClasses678) > 0.005;
    const montant = avantCloture ? resultatClasses678 : resultatCompte13;
    const source = avantCloture ? lignes678 : lignes13;
    const comptes = source
      .filter((l) => Math.abs(l.solde) > 0.005)
      .map((l) => ({ numero: l.numero, intitule: l.intitule, montant: -l.solde }));

    return {
      poste: { ref: 'CH', libelle: "Résultat net de l'exercice (excédent + ou déficit -)", montant, comptes },
      resultatClasses678,
      resultatCompte13,
    };
  }

  async bilan(tenantId: string, exerciceId: string) {
    const { lignes: toutes } = await this.ecritureService.balance(tenantId, exerciceId);
    // Comptes Total (§3.1) exclus : leur solde n'est qu'un agrégat
    // d'affichage des comptes Détail de même racine, déjà comptés
    // individuellement ci-dessous — les inclure doublerait le montant.
    const lignes = toutes.filter((l) => l.typeCompte !== TypeCompteDetailTotal.TOTAL);

    const parRef = new Map<string, PosteCalcule>();
    for (const poste of POSTES_ACTIF) {
      parRef.set(poste.ref, this.calculerPosteActif(poste, lignes));
    }
    for (const poste of POSTES_PASSIF) {
      if (poste.ref === 'DW') continue; // traité à part (calculerDW)
      parRef.set(poste.ref, this.calculerPostePassif(poste, lignes));
    }
    parRef.set('DW', this.calculerDW(lignes));

    const { poste: posteCH, resultatClasses678, resultatCompte13 } = this.calculerCH(lignes);
    parRef.set('CH', posteCH);

    // Totaux : chaque total additionne des refs déjà résolues (détail OU
    // total imbriqué) — TOTAUX_ACTIF/PASSIF sont déjà dans un ordre où une
    // ref n'est jamais utilisée avant d'avoir été calculée.
    for (const total of [...TOTAUX_ACTIF, ...TOTAUX_PASSIF]) {
      const montant = total.deRefs.reduce((s, ref) => s + (parRef.get(ref)?.montant ?? 0), 0);
      parRef.set(total.ref, { ref: total.ref, libelle: total.libelle, montant, comptes: [] });
    }

    const refsTotaux = new Set([...TOTAUX_ACTIF, ...TOTAUX_PASSIF].map((t) => t.ref));
    const actif = ORDRE_AFFICHAGE_ACTIF.map((ref) => ({ ...parRef.get(ref)!, estTotal: refsTotaux.has(ref) }));
    const passif = ORDRE_AFFICHAGE_PASSIF.map((ref) => ({ ...parRef.get(ref)!, estTotal: refsTotaux.has(ref) }));

    // Comptes de bilan (classes 1-5) qu'AUCUN poste ne capte — signalés,
    // jamais absorbés en silence (règle §2.6, même discipline qu'au compte
    // de résultat). Un plan de comptes personnalisé qui s'écarterait des
    // préfixes officiels ferait apparaître ses comptes ici.
    const comptesRattaches = new Set<string>();
    for (const poste of [...POSTES_ACTIF, ...POSTES_PASSIF]) {
      for (const l of lignes) {
        if (
          correspond(l.numero, poste.comptes, poste.exclusions) ||
          (poste.comptesAmortissement && correspond(l.numero, poste.comptesAmortissement, poste.exclusionsAmortissement))
        ) {
          comptesRattaches.add(l.compteId);
        }
      }
    }
    for (const l of lignes) {
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
    const comptesNonRattaches: CompteDuPoste[] = lignes
      .filter((l) => CLASSES_DE_BILAN.has(l.classe) && !comptesRattaches.has(l.compteId))
      .map((l) => ({ numero: l.numero, intitule: l.intitule, montant: l.solde }));

    const totalActif = parRef.get('BZ')!.montant;
    const totalPassif = parRef.get('DZ')!.montant;

    return {
      actif,
      passif,
      totalActif,
      totalPassif,
      // Tolérance d'arrondi ; un écart réel signale un bug du moteur
      // d'écritures OU un compte non rattaché (voir comptesNonRattaches),
      // pas un défaut de cette répartition.
      equilibre: Math.abs(totalActif - totalPassif) < 0.01,
      comptesNonRattaches,
      controle: {
        resultatClasses678,
        resultatCompte13,
        // Les deux sources sont non nulles à la fois : risque de double
        // comptage (balance transmise à un moment ambigu de la clôture).
        // Voir COMPTE 13, sycebnl — le compte 13 ne se mouvemente qu'À la
        // clôture, en soldant justement les classes 6/7/8 à zéro.
        doubleComptageProbable: Math.abs(resultatClasses678) > 0.005 && Math.abs(resultatCompte13) > 0.005,
      },
    };
  }

    /**
   * COMPTE DE RÉSULTAT — adossé au tableau de correspondance OFFICIEL
   * (`correspondance-compte-resultat.ts`, transcrit du Journal officiel
   * OHADA, Partie 4 ch. 2 section 6), contrairement au bilan ci-dessus qui
   * reste sur un regroupement simplifié MVP.
   *
   * Les postes portent leur montant dans leur sens naturel de lecture
   * (charges en positif), de sorte que les formules officielles s'appliquent
   * littéralement : XA = ΣR, XB = ΣT, XC = XA − XB, XD = TM − TN, XE = XC + XD.
   */
  async compteDeResultat(tenantId: string, exerciceId: string) {
    const { lignes } = await this.ecritureService.balance(tenantId, exerciceId);

    // Comptes Total exclus, même raison qu'au bilan (agrégat d'affichage).
    const lignesDetailSeules = lignes.filter((l) => l.typeCompte !== TypeCompteDetailTotal.TOTAL);

    const comptesParPoste = new Map<string, CompteDuPoste[]>();
    // Comptes de gestion (classes 6/7/8) qu'aucun poste du tableau officiel
    // ne réclame : signalés, jamais rattachés d'office à un poste voisin
    // (règle §2.6 — une non-conformité se déclare, elle ne se devine pas).
    const comptesNonRattaches: CompteDuPoste[] = [];
    // Résultat « brut » — tous les comptes de gestion, indépendamment des
    // postes : c'est exactement la base sur laquelle le bilan calcule sa
    // ligne « Excédent (déficit) de l'exercice ». Sert de contrôle croisé
    // ci-dessous.
    let resultatToutesClassesDeGestion = 0;

    for (const l of lignesDetailSeules) {
      if (
        l.classe === ClasseCompte.CLASSE_6 ||
        l.classe === ClasseCompte.CLASSE_7 ||
        l.classe === ClasseCompte.CLASSE_8
      ) {
        resultatToutesClassesDeGestion += l.totalCredit - l.totalDebit;
      }
    }

    for (const l of lignesDetailSeules) {
      const poste = posteDuCompte(l.numero);

      if (!poste) {
        const estCompteDeGestion =
          l.classe === ClasseCompte.CLASSE_6 ||
          l.classe === ClasseCompte.CLASSE_7 ||
          l.classe === ClasseCompte.CLASSE_8;
        if (estCompteDeGestion) {
          comptesNonRattaches.push({
            numero: l.numero,
            intitule: l.intitule,
            montant: l.totalCredit - l.totalDebit,
          });
        }
        // Classes 1-5 (bilan) et classe 9 (hors états) : exclusion normale.
        continue;
      }

      const montant = poste.sens === 'PRODUIT' ? l.totalCredit - l.totalDebit : l.totalDebit - l.totalCredit;
      const existants = comptesParPoste.get(poste.ref) ?? [];
      existants.push({ numero: l.numero, intitule: l.intitule, montant });
      comptesParPoste.set(poste.ref, existants);
    }

    const calculer = (poste: PosteCompteResultat): PosteCalcule => {
      const comptes = comptesParPoste.get(poste.ref) ?? [];
      return {
        ref: poste.ref,
        libelle: poste.libelle,
        montant: comptes.reduce((s, c) => s + c.montant, 0),
        comptes,
      };
    };

    const produits = POSTES_PRODUITS.map(calculer);
    const charges = POSTES_CHARGES.map(calculer);
    const [produitsHao, chargesHao] = POSTES_HAO.map(calculer);

    // XA inclut RH — voir l'anomalie n° 4 documentée dans
    // correspondance-compte-resultat.ts (le libellé officiel dit « Somme RA à
    // RG », ce qui romprait l'égalité résultat/bilan dès qu'il y a reprises).
    const totalProduits = produits.reduce((s, p) => s + p.montant, 0);
    const totalCharges = charges.reduce((s, p) => s + p.montant, 0);
    const resultatActivitesOrdinaires = totalProduits - totalCharges;
    const resultatHao = produitsHao.montant - chargesHao.montant;
    const resultatNet = resultatActivitesOrdinaires + resultatHao;

    // Contrôle croisé : le résultat obtenu en additionnant les postes
    // officiels (XE) doit être identique au résultat obtenu en soldant tous
    // les comptes de gestion — celui que le bilan loge en « Excédent
    // (déficit) de l'exercice ». Tout écart vaut exactement la somme des
    // comptes non rattachés : un compte de gestion hors poste disparaît des
    // totaux de l'état, et le compte de résultat cesse alors de boucler avec
    // le bilan. Exposé plutôt que masqué, et repris tel quel en feuille
    // « Anomalies » de l'export : un état qui ne boucle pas doit se voir.
    const ecartControle = resultatToutesClassesDeGestion - resultatNet;

    return {
      produits,
      totalProduits, // XA
      charges,
      totalCharges, // XB
      resultatActivitesOrdinaires, // XC
      produitsHao, // TM
      chargesHao, // TN
      resultatHao, // XD
      resultatNet, // XE
      comptesNonRattaches,
      controle: {
        resultatToutesClassesDeGestion,
        ecart: ecartControle,
        coherent: Math.abs(ecartControle) < 0.01,
      },
    };
  }
}
