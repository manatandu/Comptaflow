import { Injectable } from '@nestjs/common';
import { ClasseCompte } from '@prisma/client';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ExerciceService } from '../exercice/exercice.service';
import {
  CompteDuPoste,
  LigneBalancePourEtat,
  chargerLignes,
  correspond,
  trouverExerciceN1,
} from './etats-financiers.communs';
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

/**
 * Un poste du compte de résultat OU du bilan, calculé.
 *
 * `brut`/`amortissement` : BILAN ACTIF seulement — le texte officiel exige
 * trois colonnes côté actif (Brut, Amortissements et dépréciations, Net),
 * pas un seul montant net. `amortissement` est une magnitude POSITIVE (le
 * montant accumulé), `montant` (net) = `brut` − `amortissement`. Absents
 * (undefined) pour un poste de passif ou du compte de résultat, qui n'ont
 * qu'une colonne de valeur.
 *
 * `montantN1`/`brutN1`/`amortissementN1` : comparatif N-1, exigé par le
 * texte officiel sur les DEUX états (bilan ET compte de résultat). Calculé
 * depuis l'exercice immédiatement antérieur du même tenant ; `undefined`
 * (jamais 0 trompeur) quand il n'y en a aucun (premier exercice du dossier).
 */
export interface PosteCalcule {
  ref: string;
  libelle: string;
  montant: number;
  montantN1?: number;
  brut?: number;
  brutN1?: number;
  amortissement?: number;
  amortissementN1?: number;
  comptes: CompteDuPoste[];
  /** Bilan uniquement : ligne de sous-total ou de total, pas un poste de détail. */
  estTotal?: boolean;
}

/**
 * `LigneBalancePourBilan` = alias local historique de
 * `LigneBalancePourEtat` (`etats-financiers.communs.ts`, où `correspond` et
 * le chargement de balance ont été extraits le 2026-08-28 pour être
 * partagés avec le jeu « projets de développement »). Conservé pour ne pas
 * réécrire toutes les signatures ci-dessous.
 */
type LigneBalancePourBilan = LigneBalancePourEtat;

/**
 * BILAN et COMPTE DE RÉSULTAT — adossés au tableau de correspondance
 * OFFICIEL SYCEBNL (`correspondance-bilan.ts` et
 * `correspondance-compte-resultat.ts`, transcrits du Journal officiel
 * OHADA, Partie 4 ch. 2 section 6). Les deux exposent, comme le texte
 * officiel l'exige : le détail Brut/Amortissement/Net côté bilan actif
 * (voir `PosteCalcule`), et un comparatif N-1 sur les deux états — trouvé
 * en écart lors d'une relecture du 2026-08-28 (voir le commentaire de
 * `trouverExerciceN1`), corrigé dans la foulée. Anomalies du texte officiel
 * signalées et corrigées explicitement, jamais masquées ni devinées.
 */
@Injectable()
export class EtatsFinanciersService {
  constructor(
    private readonly ecritureService: EcritureService,
    private readonly exerciceService: ExerciceService,
  ) {}

  /**
   * Exercice « N-1 » d'un bilan/compte de résultat : celui du même tenant
   * dont la date de début est la plus récente PARMI celles antérieures à
   * l'exercice demandé. `null` si aucun (premier exercice du dossier) — le
   * comparatif reste alors simplement absent (`undefined`), jamais un faux
   * zéro qui laisserait croire à un exercice antérieur réel et vide.
   */
  private async trouverExerciceN1(tenantId: string, exerciceId: string): Promise<string | null> {
    return trouverExerciceN1(this.exerciceService, tenantId, exerciceId);
  }

  private async chargerLignes(tenantId: string, exerciceId: string | null): Promise<LigneBalancePourBilan[]> {
    return chargerLignes(this.ecritureService, tenantId, exerciceId);
  }

  /** Poste ACTIF de détail : brut, amortissement (magnitude positive) et net, chacun exposé séparément. */
  private calculerPosteActif(poste: PosteBilanDeBase, lignes: LigneBalancePourBilan[]): PosteCalcule {
    let lignesBrut = lignes.filter((l) => correspond(l.numero, poste.comptes, poste.exclusions));
    if (poste.sens_qualificatif === 'DEBITEUR') {
      lignesBrut = lignesBrut.filter((l) => l.solde > 0);
    }
    // Découverts bancaires : un compte 52/53 créditeur appartient à DW
    // (passif), pas à BW (actif). Le laisser ici l'aurait compté deux fois —
    // en négatif à l'actif ET en positif au passif — déséquilibrant le bilan
    // du double du découvert. Voir `comptesTransferesSiCrediteur`.
    if (poste.comptesTransferesSiCrediteur) {
      lignesBrut = lignesBrut.filter(
        (l) => !(correspond(l.numero, poste.comptesTransferesSiCrediteur!) && l.solde < 0),
      );
    }
    const comptesBrut: CompteDuPoste[] = lignesBrut.map((l) => ({ numero: l.numero, intitule: l.intitule, montant: l.solde }));
    const brut = comptesBrut.reduce((s, c) => s + c.montant, 0);

    const lignesAmort = poste.comptesAmortissement
      ? lignes.filter((l) => correspond(l.numero, poste.comptesAmortissement!, poste.exclusionsAmortissement))
      : [];
    // PAS de négation sur `montant` ici : un compte d'amortissement bien
    // formé porte déjà un solde (débit − crédit) négatif (créditeur), ce qui
    // le soustrait naturellement du brut par simple addition — brut(5000) +
    // solde(-1500) = net(3500). Le signer en positif dans CETTE somme
    // l'ADDITIONNERAIT au lieu de le déduire : piège de signe repéré en
    // dérivant un cas de test à la main avant livraison, jamais constaté en
    // production, verrouillé depuis par un test de régression dédié.
    // `amortissement` (exposé séparément, ligne suivante) reste lui la
    // magnitude POSITIVE attendue par la colonne officielle.
    const comptesAmort: CompteDuPoste[] = lignesAmort.map((l) => ({ numero: l.numero, intitule: l.intitule, montant: l.solde }));
    // `|| 0` normalise -0 en 0 (reduce sur un tableau vide renvoie 0, la
    // négation donne -0 : mathématiquement identique, mais Object.is(-0,0)
    // est faux — un simple souci de propreté de sortie, repéré par un test).
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

  /** Poste PASSIF de détail : solde créditeur net dans son sens naturel de lecture (pas de colonne Brut/Amort côté passif). */
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

  /**
   * Résout tous les postes du bilan (détail + totaux) pour UN jeu de lignes
   * de balance — appelée une fois pour l'exercice N, une fois pour N-1
   * (`bilan()` fusionne ensuite les deux résultats). `lignes: []` (aucun
   * exercice N-1) résout tout à zéro sans cas particulier : un poste sans
   * compte est légitimement à 0, pas une erreur.
   */
  private resoudreTousLesPostesBilan(lignes: LigneBalancePourBilan[]): {
    parRef: Map<string, PosteCalcule>;
    resultatClasses678: number;
    resultatCompte13: number;
  } {
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
    // ref n'est jamais utilisée avant d'avoir été calculée (vérifié par un
    // test dédié dans correspondance-bilan.spec.ts).
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

    return { parRef, resultatClasses678, resultatCompte13 };
  }

  async bilan(tenantId: string, exerciceId: string) {
    const exerciceN1Id = await this.trouverExerciceN1(tenantId, exerciceId);
    const [lignesN, lignesN1] = await Promise.all([
      this.chargerLignes(tenantId, exerciceId),
      this.chargerLignes(tenantId, exerciceN1Id),
    ]);

    const { parRef: parRefN, resultatClasses678, resultatCompte13 } = this.resoudreTousLesPostesBilan(lignesN);
    const { parRef: parRefN1 } = this.resoudreTousLesPostesBilan(lignesN1);

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

    // Comptes de bilan (classes 1-5) qu'AUCUN poste ne capte — signalés,
    // jamais absorbés en silence (règle §2.6, même discipline qu'au compte
    // de résultat). Un plan de comptes personnalisé qui s'écarterait des
    // préfixes officiels ferait apparaître ses comptes ici. Calculé sur N
    // seulement : N-1 n'est qu'un comparatif d'affichage, pas un état
    // audité par cet appel.
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
   * Résout tous les postes du compte de résultat pour UN jeu de lignes de
   * balance — même principe que `resoudreTousLesPostesBilan`, appelée une
   * fois pour N, une fois pour N-1.
   */
  private resoudreTousLesPostesCR(lignes: LigneBalancePourBilan[]): {
    produits: PosteCalcule[];
    charges: PosteCalcule[];
    produitsHao: PosteCalcule;
    chargesHao: PosteCalcule;
    comptesNonRattaches: CompteDuPoste[];
    resultatToutesClassesDeGestion: number;
  } {
    const comptesParPoste = new Map<string, CompteDuPoste[]>();
    // Comptes de gestion (classes 6/7/8) qu'aucun poste du tableau officiel
    // ne réclame : signalés, jamais rattachés d'office à un poste voisin
    // (règle §2.6 — une non-conformité se déclare, elle ne se devine pas).
    const comptesNonRattaches: CompteDuPoste[] = [];
    // Résultat « brut » — tous les comptes de gestion, indépendamment des
    // postes : c'est exactement la base sur laquelle le bilan calcule sa
    // ligne « Excédent (déficit) de l'exercice ». Sert de contrôle croisé.
    let resultatToutesClassesDeGestion = 0;

    for (const l of lignes) {
      if (l.classe === ClasseCompte.CLASSE_6 || l.classe === ClasseCompte.CLASSE_7 || l.classe === ClasseCompte.CLASSE_8) {
        resultatToutesClassesDeGestion += l.totalCredit - l.totalDebit;
      }
    }

    for (const l of lignes) {
      const poste = posteDuCompte(l.numero);

      if (!poste) {
        const estCompteDeGestion =
          l.classe === ClasseCompte.CLASSE_6 || l.classe === ClasseCompte.CLASSE_7 || l.classe === ClasseCompte.CLASSE_8;
        if (estCompteDeGestion) {
          comptesNonRattaches.push({ numero: l.numero, intitule: l.intitule, montant: l.totalCredit - l.totalDebit });
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
      return { ref: poste.ref, libelle: poste.libelle, montant: comptes.reduce((s, c) => s + c.montant, 0), comptes };
    };

    const produits = POSTES_PRODUITS.map(calculer);
    const charges = POSTES_CHARGES.map(calculer);
    const [produitsHao, chargesHao] = POSTES_HAO.map(calculer);

    return { produits, charges, produitsHao, chargesHao, comptesNonRattaches, resultatToutesClassesDeGestion };
  }

  /**
   * COMPTE DE RÉSULTAT — adossé au tableau de correspondance OFFICIEL
   * (`correspondance-compte-resultat.ts`, transcrit du Journal officiel
   * OHADA, Partie 4 ch. 2 section 6).
   *
   * Les postes portent leur montant dans leur sens naturel de lecture
   * (charges en positif), de sorte que les formules officielles s'appliquent
   * littéralement : XA = ΣR, XB = ΣT, XC = XA − XB, XD = TM − TN, XE = XC + XD
   * — sur N comme sur N-1 (le texte officiel exige les deux, colonne
   * « Net exercice au 31/12/N-1 »).
   */
  async compteDeResultat(tenantId: string, exerciceId: string) {
    const exerciceN1Id = await this.trouverExerciceN1(tenantId, exerciceId);
    const [lignesN, lignesN1] = await Promise.all([
      this.chargerLignes(tenantId, exerciceId),
      this.chargerLignes(tenantId, exerciceN1Id),
    ]);

    const resN = this.resoudreTousLesPostesCR(lignesN);
    const resN1 = this.resoudreTousLesPostesCR(lignesN1);
    const parRefN1 = new Map(
      [...resN1.produits, ...resN1.charges, resN1.produitsHao, resN1.chargesHao].map((p) => [p.ref, p]),
    );
    const fusionnerN1 = (p: PosteCalcule): PosteCalcule => ({
      ...p,
      montantN1: exerciceN1Id ? (parRefN1.get(p.ref)?.montant ?? 0) : undefined,
    });

    const produits = resN.produits.map(fusionnerN1);
    const charges = resN.charges.map(fusionnerN1);
    const produitsHao = fusionnerN1(resN.produitsHao);
    const chargesHao = fusionnerN1(resN.chargesHao);

    // XA inclut RH — voir l'anomalie n° 4 documentée dans
    // correspondance-compte-resultat.ts (le libellé officiel dit « Somme RA à
    // RG », ce qui romprait l'égalité résultat/bilan dès qu'il y a reprises).
    const totalProduits = produits.reduce((s, p) => s + p.montant, 0);
    const totalCharges = charges.reduce((s, p) => s + p.montant, 0);
    const resultatActivitesOrdinaires = totalProduits - totalCharges;
    const resultatHao = produitsHao.montant - chargesHao.montant;
    const resultatNet = resultatActivitesOrdinaires + resultatHao;

    const totalProduitsN1 = exerciceN1Id ? produits.reduce((s, p) => s + (p.montantN1 ?? 0), 0) : undefined;
    const totalChargesN1 = exerciceN1Id ? charges.reduce((s, p) => s + (p.montantN1 ?? 0), 0) : undefined;
    const resultatActivitesOrdinairesN1 =
      totalProduitsN1 !== undefined && totalChargesN1 !== undefined ? totalProduitsN1 - totalChargesN1 : undefined;
    const resultatHaoN1 = exerciceN1Id !== null ? (produitsHao.montantN1 ?? 0) - (chargesHao.montantN1 ?? 0) : undefined;
    const resultatNetN1 =
      resultatActivitesOrdinairesN1 !== undefined && resultatHaoN1 !== undefined
        ? resultatActivitesOrdinairesN1 + resultatHaoN1
        : undefined;

    // Contrôle croisé : le résultat obtenu en additionnant les postes
    // officiels (XE) doit être identique au résultat obtenu en soldant tous
    // les comptes de gestion — celui que le bilan loge en « Excédent
    // (déficit) de l'exercice ». Tout écart vaut exactement la somme des
    // comptes non rattachés : un compte de gestion hors poste disparaît des
    // totaux de l'état, et le compte de résultat cesse alors de boucler avec
    // le bilan. Exposé plutôt que masqué, et repris tel quel en feuille
    // « Anomalies » de l'export : un état qui ne boucle pas doit se voir.
    const ecartControle = resN.resultatToutesClassesDeGestion - resultatNet;

    return {
      produits,
      totalProduits, // XA
      totalProduitsN1,
      charges,
      totalCharges, // XB
      totalChargesN1,
      resultatActivitesOrdinaires, // XC
      resultatActivitesOrdinairesN1,
      produitsHao, // TM
      chargesHao, // TN
      resultatHao, // XD
      resultatHaoN1,
      resultatNet, // XE
      resultatNetN1,
      exerciceN1Disponible: exerciceN1Id !== null,
      comptesNonRattaches: resN.comptesNonRattaches,
      controle: {
        resultatToutesClassesDeGestion: resN.resultatToutesClassesDeGestion,
        ecart: ecartControle,
        coherent: Math.abs(ecartControle) < 0.01,
      },
    };
  }
}
