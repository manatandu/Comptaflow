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

/** Un compte rattaché à un poste, avec sa contribution — permet le drill-down. */
export interface CompteDuPoste {
  numero: string;
  intitule: string;
  montant: number;
}

/** Un poste du compte de résultat, calculé. */
export interface PosteCalcule {
  ref: string;
  libelle: string;
  montant: number;
  comptes: CompteDuPoste[];
}

/**
 * ⚠️ BILAN — Regroupement SIMPLIFIÉ classe de compte → poste ACTIF/PASSIF, à
 * but de démonstration MVP (calqué sur l'écran « États financiers » du
 * canevas de design). Ce n'est PAS le tableau de correspondance postes/comptes
 * officiel SYCEBNL (Partie 4, ch. 2 — voir le moteur `liasse/` du skill
 * `sycebnl`, bâti précisément pour ça et déjà vérifié contre le Journal
 * officiel).
 *
 * Ne pas présenter le résultat du bilan comme un bilan SYCEBNL conforme sans
 * être passé par ce tableau de correspondance réel — à remplacer avant toute
 * mise en production. La règle appliquée ici :
 *   - Classe 1 (fonds propres/durables) → PASSIF, en totalité
 *   - Classe 2/3 (immobilisations/stocks) → ACTIF, en totalité
 *   - Classe 4/5 (tiers/trésorerie) → ACTIF si le compte est débiteur,
 *     PASSIF si créditeur (un compte de tiers ou de trésorerie peut être
 *     l'un ou l'autre selon son solde, contrairement aux classes 1/2/3)
 *   - Classe 6/7/8 (charges/produits ordinaires ET H.A.O.) → jamais
 *     affichées comme postes de bilan ; leur solde net devient la ligne
 *     « Excédent / déficit de l'exercice » du passif (fonds propres), comme
 *     le fait le compte 13 officiel (voir sycebnl, COMPTE 13) à la clôture.
 *   - Classe 9 → hors bilan ET hors compte de résultat par construction de
 *     l'Acte uniforme (contributions volontaires en nature / comptabilité
 *     analytique) : volontairement ignorée, ce n'est pas un oubli.
 *
 * En revanche le COMPTE DE RÉSULTAT (`compteDeResultat()` plus bas) est, lui,
 * réellement adossé au tableau de correspondance officiel — voir
 * `correspondance-compte-resultat.ts`.
 */
@Injectable()
export class EtatsFinanciersService {
  constructor(private readonly ecritureService: EcritureService) {}

  async bilan(tenantId: string, exerciceId: string) {
    const { lignes } = await this.ecritureService.balance(tenantId, exerciceId);

    const actif: Array<{ numero: string; intitule: string; montant: number }> = [];
    const passif: Array<{ numero: string; intitule: string; montant: number }> = [];
    let resultatNet = 0;

    // Comptes Total (§3.1) exclus : leur solde n'est qu'un agrégat
    // d'affichage des comptes Détail de même racine, déjà comptés
    // individuellement ci-dessous — les inclure aussi doublerait le montant
    // (même raison que balance() qui les exclut déjà de ses totaux généraux).
    const lignesDetailSeules = lignes.filter((l) => l.typeCompte !== TypeCompteDetailTotal.TOTAL);

    for (const l of lignesDetailSeules) {
      switch (l.classe) {
        case ClasseCompte.CLASSE_2:
        case ClasseCompte.CLASSE_3:
          actif.push({ numero: l.numero, intitule: l.intitule, montant: l.solde });
          break;
        case ClasseCompte.CLASSE_1:
          passif.push({ numero: l.numero, intitule: l.intitule, montant: -l.solde });
          break;
        case ClasseCompte.CLASSE_4:
        case ClasseCompte.CLASSE_5:
          if (l.solde >= 0) {
            actif.push({ numero: l.numero, intitule: l.intitule, montant: l.solde });
          } else {
            passif.push({ numero: l.numero, intitule: l.intitule, montant: -l.solde });
          }
          break;
        case ClasseCompte.CLASSE_6:
        case ClasseCompte.CLASSE_7:
        case ClasseCompte.CLASSE_8:
          // Produits (7) : solde créditeur (négatif) → contribue positivement au résultat.
          // Charges (6) : solde débiteur (positif) → contribue négativement au résultat.
          // Classe 8 (H.A.O. — valeurs comptables et produits de cession,
          // charges/produits et dotations/reprises H.A.O., subventions
          // d'équilibre) : entre AUSSI dans le résultat, via XD au compte de
          // résultat officiel (postes TM/TN). L'omettre déséquilibrait le
          // bilan du montant exact des opérations H.A.O. — bug réel constaté
          // en testant une écriture de cession telle que le module
          // Immobilisations en poste (comptes 81/82) : actif 250 / passif 210
          // sur une écriture H.A.O. de 40. Voir docs/plan-de-construction.md.
          resultatNet -= l.solde;
          break;
        case ClasseCompte.CLASSE_9:
          // Contributions volontaires en nature et comptabilité analytique :
          // hors bilan ET hors compte de résultat par construction de l'Acte
          // uniforme SYCEBNL. Exclusion VOULUE, explicitée ici pour qu'elle
          // ne se confonde pas avec un oubli (c'est ce qui avait masqué le
          // cas de la classe 8 ci-dessus, noyée dans un `default`).
          break;
      }
    }

    // Seuil, pas une égalité stricte : `resultatNet` est une somme de
    // flottants, et sur un exercice clôturé (comptes de gestion soldés un à
    // un) elle laisse un résidu de l'ordre de 1e-13. Une comparaison exacte
    // ajoutait alors une ligne parasite « Excédent (déficit) — 0,00 », en
    // doublon du compte 131 réel déjà présent au passif via la classe 1 :
    // deux entrées de même numéro, donc une clé React dupliquée à l'écran.
    // Même tolérance que les contrôles d'équilibre plus bas.
    if (Math.abs(resultatNet) > 0.005) {
      passif.push({ numero: '13100000', intitule: "Excédent (déficit) de l'exercice", montant: resultatNet });
    }

    const totalActif = actif.reduce((s, l) => s + l.montant, 0);
    const totalPassif = passif.reduce((s, l) => s + l.montant, 0);

    return {
      actif,
      passif,
      totalActif,
      totalPassif,
      // Tolérance d'arrondi ; un écart réel signale un bug du moteur d'écritures,
      // pas de la présente répartition (voir le commentaire de classe ci-dessus).
      equilibre: Math.abs(totalActif - totalPassif) < 0.01,
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
