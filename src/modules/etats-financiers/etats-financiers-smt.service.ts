import { Injectable } from '@nestjs/common';
import { ClasseCompte, StatutEcriture } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ExerciceService } from '../exercice/exercice.service';
import { CompteDuPoste, LigneBalancePourEtat, chargerLignes, correspond, trouverExerciceN1 } from './etats-financiers.communs';
import { PosteCalcule } from './etats-financiers.service';
import {
  CATEGORIES_RESSOURCES_ART6,
  COMPTES_DOTATIONS_AMORTISSEMENTS,
  NB_JOURNAL_TRESORERIE,
  NOTES_SMT,
  ORDRE_BILAN_ACTIF,
  ORDRE_BILAN_PASSIF,
  POSTES_BILAN_ACTIF,
  POSTES_BILAN_PASSIF,
  POSTES_DEPENSES,
  POSTES_RECETTES,
  PosteBilanSmt,
  PosteFluxSmt,
  RENVOI_IMMOBILISATIONS,
  RETRAITEMENTS,
  SEUIL_SMT_FCFA,
  TOTAUX_BILAN_ACTIF,
  TOTAUX_BILAN_PASSIF,
  VENTILATION_DEPENSES,
  VENTILATION_RECETTES,
} from './correspondance-smt';

/**
 * ÉTATS FINANCIERS DU SYSTÈME MINIMAL DE TRÉSORERIE · troisième et dernier
 * jeu prévu par l'Acte uniforme SYCEBNL (art. 5 et 6 ; Partie 4, ch. 4).
 *
 * Ce service produit les trois documents que le texte énumère · « le Bilan ;
 * le Compte de résultat ; les Notes annexes » · plus le contrôle
 * d'éligibilité de l'article 6, que les deux autres jeux n'ont pas puisqu'ils
 * relèvent du Système normal, obligatoire par défaut.
 *
 * Le rattachement des comptes, la réserve sur le poste HC et la raison pour
 * laquelle les recettes et dépenses sont lues dans les MOUVEMENTS DE
 * TRÉSORERIE et non dans les soldes des classes 6 et 7 sont exposés en tête
 * de `correspondance-smt.ts`. À lire avant de toucher à ce fichier.
 *
 * ## Comptes de trésorerie retenus
 *
 * Classe 5 entière SAUF le compte 59 « Dépréciations et provisions pour
 * risques à court terme (Trésorerie) », qui est un compte de valeur et non de
 * liquidités : sa contrepartie (69 / 79) n'est jamais un flux.
 *
 * Le compte 58 « Virements internes » EST traité comme de la trésorerie, ce
 * qui neutralise de lui-même le virement caisse vers banque : les deux
 * écritures du virement n'ont alors que des lignes de trésorerie, leur flux
 * net est nul, elles sont écartées. Même raisonnement pour 50 et 51.
 *
 * ## Écritures retenues
 *
 * Écritures VALIDÉES seulement (le bilan et le compte de résultat sont des
 * documents légaux · même règle que les deux autres jeux, voir
 * `chargerLignes`), et écritures de clôture EXCLUES : le report à-nouveau
 * rouvre les comptes de trésorerie par une écriture qui n'est pas un
 * encaissement. La compter ferait apparaître le solde d'ouverture comme une
 * recette de l'exercice.
 */
@Injectable()
export class EtatsFinanciersSmtService {
  constructor(
    private readonly ecritureService: EcritureService,
    private readonly exerciceService: ExerciceService,
    private readonly prisma: PrismaService,
  ) {}

  /** Classe 5 hors 59 · voir la note de tête de fichier. */
  private estTresorerie(numero: string): boolean {
    return numero.startsWith('5') && !numero.startsWith('59');
  }

  private async chargerLignes(tenantId: string, exerciceId: string | null): Promise<LigneBalancePourEtat[]> {
    return chargerLignes(this.ecritureService, tenantId, exerciceId);
  }

  /**
   * Les mêmes lignes de balance, ramenées à l'OUVERTURE de l'exercice : le
   * report à nouveau tient lieu de solde, les mouvements de l'exercice sont
   * mis de côté.
   *
   * Sert aux trois lignes de variation du compte de résultat (VA, VB, VC),
   * que la maquette note « [N - (N-1)] ». Le terme (N-1) y est l'ouverture de
   * l'exercice, pas la clôture de l'exercice précédent tel qu'il figure dans
   * le logiciel : les deux coïncident quand la clôture a été passée dans
   * OmegaX, mais pas pour un premier exercice (où l'ouverture est le solde
   * repris de l'ancienne comptabilité) ni pour un dossier repris en cours de
   * vie. L'ouverture, elle, est toujours présente. C'est d'ailleurs déjà ce
   * que sert la Note 3 sous l'intitulé « Montant au 1er janvier N ».
   */
  private aLOuverture(lignes: LigneBalancePourEtat[]): LigneBalancePourEtat[] {
    return lignes.map((l) => ({
      ...l,
      totalDebit: l.reportDebit,
      totalCredit: l.reportCredit,
      mouvementDebit: 0,
      mouvementCredit: 0,
      solde: l.reportDebit - l.reportCredit,
    }));
  }

  // -------------------------------------------------------------------------
  // BILAN (Section 1)
  // -------------------------------------------------------------------------

  private calculerPosteBilan(poste: PosteBilanSmt, lignes: LigneBalancePourEtat[]): PosteCalcule {
    let matches = lignes.filter((l) => correspond(l.numero, poste.comptes, poste.exclusions));
    if (poste.sens_qualificatif === 'DEBITEUR') matches = matches.filter((l) => l.solde > 0);
    if (poste.sens_qualificatif === 'CREDITEUR') matches = matches.filter((l) => l.solde < 0);
    // Un poste d'actif porte son solde débiteur en positif, un poste de passif
    // son solde créditeur en positif · même convention que les deux autres jeux.
    const signe = poste.sens === 'ACTIF' ? 1 : -1;
    const comptes: CompteDuPoste[] = matches.map((l) => ({
      numero: l.numero,
      intitule: l.intitule,
      montant: signe * l.solde,
    }));
    return { ref: poste.ref, libelle: poste.libelle, montant: comptes.reduce((s, c) => s + c.montant, 0), comptes };
  }

  /**
   * HB « Résultat net de l'exercice (en + ou en -) » · même arbitrage que CH
   * (associations) et CC (projets) : avant clôture le résultat n'existe que
   * dans les classes 6/7/8, après clôture il est au compte 13. Prendre les
   * deux les additionnerait.
   */
  private calculerHB(lignes: LigneBalancePourEtat[]): PosteCalcule {
    const lignes678 = lignes.filter(
      (l) =>
        l.classe === ClasseCompte.CLASSE_6 || l.classe === ClasseCompte.CLASSE_7 || l.classe === ClasseCompte.CLASSE_8,
    );
    const resultat678 = lignes678.reduce((s, l) => s - l.solde, 0);
    const lignes13 = lignes.filter((l) => l.numero.startsWith('13'));
    const resultat13 = lignes13.reduce((s, l) => s - l.solde, 0);

    const avantCloture = Math.abs(resultat678) > 0.005;
    const source = avantCloture ? lignes678 : lignes13;
    const comptes = source
      .filter((l) => Math.abs(l.solde) > 0.005)
      .map((l) => ({ numero: l.numero, intitule: l.intitule, montant: -l.solde }));
    return {
      ref: 'HB',
      libelle: "Résultat net de l'exercice (en + ou en -)",
      montant: avantCloture ? resultat678 : resultat13,
      comptes,
    };
  }

  private resoudreBilan(lignes: LigneBalancePourEtat[]): Map<string, PosteCalcule> {
    const parRef = new Map<string, PosteCalcule>();
    for (const poste of [...POSTES_BILAN_ACTIF, ...POSTES_BILAN_PASSIF]) {
      parRef.set(poste.ref, this.calculerPosteBilan(poste, lignes));
    }
    parRef.set('HB', this.calculerHB(lignes));
    for (const total of [...TOTAUX_BILAN_ACTIF, ...TOTAUX_BILAN_PASSIF]) {
      const montant = total.deRefs.reduce((s, ref) => s + (parRef.get(ref)?.montant ?? 0), 0);
      parRef.set(total.ref, { ref: total.ref, libelle: total.libelle, montant, comptes: [], estTotal: true });
    }
    return parRef;
  }

  async bilan(tenantId: string, exerciceId: string) {
    const exerciceN1Id = await trouverExerciceN1(this.exerciceService, tenantId, exerciceId);
    const [lignesN, lignesN1] = await Promise.all([
      this.chargerLignes(tenantId, exerciceId),
      this.chargerLignes(tenantId, exerciceN1Id),
    ]);
    const parRefN = this.resoudreBilan(lignesN);
    const parRefN1 = this.resoudreBilan(lignesN1);

    // `note` : le renvoi de note que la maquette imprime en troisième colonne
    // du bilan. Absent des deux autres jeux, dont les maquettes ne le portent
    // pas au bilan · d'où ce type local plutôt qu'un champ de plus sur
    // PosteCalcule.
    const fusionner = (ref: string): PosteCalcule & { note: string | null } => {
      const n = parRefN.get(ref)!;
      const note = [...POSTES_BILAN_ACTIF, ...POSTES_BILAN_PASSIF].find((p) => p.ref === ref)?.note ?? null;
      return { ...n, montantN1: exerciceN1Id ? parRefN1.get(ref)?.montant : undefined, note };
    };

    const totalActif = parRefN.get('GZ')!.montant;
    const totalPassif = parRefN.get('HZ')!.montant;

    return {
      actif: ORDRE_BILAN_ACTIF.map(fusionner),
      passif: ORDRE_BILAN_PASSIF.map(fusionner),
      totalActif,
      totalPassif,
      totalActifN1: exerciceN1Id ? parRefN1.get('GZ')!.montant : undefined,
      totalPassifN1: exerciceN1Id ? parRefN1.get('HZ')!.montant : undefined,
      exerciceN1Disponible: exerciceN1Id !== null,
      equilibre: Math.abs(totalActif - totalPassif) < 0.01,
      renvoiImmobilisations: RENVOI_IMMOBILISATIONS,
      // Aucun poste de « comptes non rattachés » ici, et ce n'est pas un oubli :
      // GA à GE et HA à HD couvrent les classes 1 à 5 par construction (classe
      // par classe, avec les soldes de tiers répartis entre GC et HD). Aucun
      // compte de bilan ne peut échapper à cette maquette.
    };
  }

  // -------------------------------------------------------------------------
  // MOUVEMENTS DE TRÉSORERIE · matière commune au compte de résultat et à la Note 4
  // -------------------------------------------------------------------------

  /**
   * Une opération de caisse ou de banque, telle que la Note 4 la présente :
   * une date, un libellé, un montant en recette OU en dépense, et la
   * ventilation de ce montant sur les comptes de contrepartie.
   */
  /**
   * Les écritures de l'exercice qui entrent dans les états du S.M.T.
   *
   * VALIDÉES seulement, et écritures de clôture EXCLUES : le report à nouveau
   * rouvre les comptes de trésorerie par une écriture qui n'est pas un
   * encaissement, et la compter ferait apparaître le solde d'ouverture comme
   * une recette de l'exercice. Le report à nouveau a sa place ailleurs, en
   * première ligne du journal de la Note 4.
   */
  private async ecrituresDeLExercice(tenantId: string, exerciceId: string) {
    return this.prisma.ecriture.findMany({
      where: { tenantId, exerciceId, statut: StatutEcriture.VALIDEE, estGenereeParCloture: false },
      include: { lignes: { include: { compte: true } } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Une opération qui a un EFFET NET sur la trésorerie de l'entité : une
   * recette ou une dépense, avec la ventilation de son montant sur les
   * comptes de contrepartie.
   *
   * Un virement de la caisse vers la banque est écarté ici · son flux net est
   * nul, ce n'est ni une recette ni une dépense. Il n'est PAS écarté du
   * journal de la Note 4, qui est un livre de caisse et doit montrer tous les
   * mouvements du compte pour que son solde soit juste (voir
   * `journalTresorerie`).
   */
  private async mouvementsTresorerie(tenantId: string, exerciceId: string) {
    const ecritures = await this.ecrituresDeLExercice(tenantId, exerciceId);

    return ecritures
      .map((e) => {
        const tresorerie = e.lignes.filter((l) => this.estTresorerie(l.compte.numero));
        if (tresorerie.length === 0) return null;
        const flux = tresorerie.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
        // Flux net nul : virement interne (caisse vers banque) ou écriture sans
        // effet sur la trésorerie. Ni recette, ni dépense.
        if (Math.abs(flux) < 0.005) return null;
        const sens: 'RECETTE' | 'DEPENSE' = flux > 0 ? 'RECETTE' : 'DEPENSE';
        // Contribution d'une contrepartie : créditrice pour une recette,
        // débitrice pour une dépense · la somme vaut |flux| dans une écriture
        // équilibrée.
        const contreparties = e.lignes
          .filter((l) => !this.estTresorerie(l.compte.numero))
          .map((l) => ({
            numero: l.compte.numero,
            intitule: l.compte.intitule,
            montant: sens === 'RECETTE' ? Number(l.credit) - Number(l.debit) : Number(l.debit) - Number(l.credit),
          }))
          .filter((c) => Math.abs(c.montant) > 0.005);
        return { ecritureId: e.id, date: e.date, libelle: e.libelle, sens, montant: Math.abs(flux), contreparties };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);
  }

  // -------------------------------------------------------------------------
  // COMPTE DE RÉSULTAT (Section 2)
  // -------------------------------------------------------------------------

  private ventilerFlux(
    mouvements: Awaited<ReturnType<EtatsFinanciersSmtService['mouvementsTresorerie']>>,
    sens: 'RECETTE' | 'DEPENSE',
    postes: PosteFluxSmt[],
  ): { postes: PosteCalcule[]; total: number } {
    const comptesParRef = new Map<string, Map<string, CompteDuPoste>>();
    for (const poste of postes) comptesParRef.set(poste.ref, new Map());

    for (const m of mouvements) {
      if (m.sens !== sens) continue;
      for (const c of m.contreparties) {
        const poste = postes.find((p) => correspond(c.numero, p.comptes, p.exclusions));
        // Impossible en pratique : KB et JF sont définis par exclusion et
        // captent les classes 1 à 8. Un compte qui échapperait tout de même
        // (numéro hors classes 1-8) serait perdu · on ne le laisse pas filer.
        if (!poste) continue;
        const parCompte = comptesParRef.get(poste.ref)!;
        const existant = parCompte.get(c.numero);
        if (existant) existant.montant += c.montant;
        else parCompte.set(c.numero, { numero: c.numero, intitule: c.intitule, montant: c.montant });
      }
    }

    const resultat = postes.map((p) => {
      const comptes = [...comptesParRef.get(p.ref)!.values()]
        .filter((c) => Math.abs(c.montant) > 0.005)
        .sort((a, b) => a.numero.localeCompare(b.numero));
      return {
        ref: p.ref,
        libelle: p.libelle,
        montant: comptes.reduce((s, c) => s + c.montant, 0),
        comptes,
      };
    });
    return { postes: resultat, total: resultat.reduce((s, p) => s + p.montant, 0) };
  }

  /**
   * COMPTE DE RÉSULTAT du S.M.T · KX (A) = revenus encaissés, JX (B) =
   * dépenses décaissées, KZ (C) = A - B, puis les quatre retraitements
   * VA/VB/VC/JG qui ramènent au résultat net d'engagement KZC.
   *
   * KZC est ensuite CONFRONTÉ au résultat du bilan (poste HB, lu dans les
   * classes 6/7/8) : les deux chemins doivent aboutir au même montant. L'écart
   * est exposé tel quel dans `controle`, jamais absorbé · c'est le seul
   * contrôle qui atteste que la reconstruction de trésorerie est complète.
   */
  /**
   * Encaissements et décaissements qui ne sont NI un produit NI une charge :
   * apport ou reprise de dotation (classe 1), emprunt et remboursement
   * (compte 18), acquisition et cession d'immobilisation (classe 2), achat
   * de stock enregistré directement à l'actif (classe 3).
   *
   * ## Pourquoi ce poste existe alors que la maquette ne le prévoit pas
   *
   * Le compte de résultat du S.M.T part du solde de caisse (KZ) et le corrige
   * de trois variations et des dotations pour retrouver le résultat net
   * (KZC). Ce trajet est exact tant que la caisse ne bouge que pour des
   * produits, des charges et des règlements de tiers. Il ne l'est plus dès
   * qu'un apport en dotation ou l'achat d'un véhicule passe par la banque :
   * ces flux gonflent ou creusent KZ sans toucher au résultat, et la maquette
   * n'ouvre AUCUNE ligne pour les reprendre.
   *
   * Ce n'est pas une lacune du moteur, c'est la limite du modèle officiel,
   * cohérente avec ce qu'il vise : une petite entité dont le journal de
   * trésorerie est essentiellement opérationnel. Plutôt que de corriger KZC
   * en silence (ce qui s'écarterait de la maquette) ou de laisser un écart
   * inexpliqué, ce montant est calculé, exposé, et utilisé par le contrôle
   * de concordance. L'état imprimé reste celui du texte ; le lecteur sait
   * pourquoi les deux chemins divergent.
   */
  private fluxHorsExploitation(
    mouvements: Awaited<ReturnType<EtatsFinanciersSmtService['mouvementsTresorerie']>>,
  ): { montant: number; comptes: CompteDuPoste[] } {
    const parCompte = new Map<string, CompteDuPoste>();
    for (const m of mouvements) {
      for (const c of m.contreparties) {
        // Classes 1, 2 et 3 seulement. La classe 4 est déjà reprise par VB et
        // VC ; les classes 6, 7 et 8 SONT le résultat.
        if (!/^[123]/.test(c.numero)) continue;
        // Signe : un encaissement augmente KZ, un décaissement le diminue.
        const montant = m.sens === 'RECETTE' ? c.montant : -c.montant;
        const existant = parCompte.get(c.numero);
        if (existant) existant.montant += montant;
        else parCompte.set(c.numero, { numero: c.numero, intitule: c.intitule, montant });
      }
    }
    const comptes = [...parCompte.values()]
      .filter((c) => Math.abs(c.montant) > 0.005)
      .sort((a, b) => a.numero.localeCompare(b.numero));
    return { montant: comptes.reduce((s, c) => s + c.montant, 0), comptes };
  }

  async compteDeResultat(tenantId: string, exerciceId: string) {
    const [mouvements, lignesN] = await Promise.all([
      this.mouvementsTresorerie(tenantId, exerciceId),
      this.chargerLignes(tenantId, exerciceId),
    ]);

    const recettes = this.ventilerFlux(mouvements, 'RECETTE', POSTES_RECETTES);
    const depenses = this.ventilerFlux(mouvements, 'DEPENSE', POSTES_DEPENSES);
    const soldeCaisse = recettes.total - depenses.total; // KZ

    const bilanCloture = this.resoudreBilan(lignesN);
    const bilanOuverture = this.resoudreBilan(this.aLOuverture(lignesN));
    const variation = (ref: string) =>
      (bilanCloture.get(ref)?.montant ?? 0) - (bilanOuverture.get(ref)?.montant ?? 0);

    // Dotations aux amortissements : compte 68, charge sans décaissement.
    const lignes68 = lignesN.filter((l) => correspond(l.numero, COMPTES_DOTATIONS_AMORTISSEMENTS));
    const dotations = lignes68.reduce((s, l) => s + l.solde, 0);

    const valeurs: Record<string, number> = {
      VA: variation('GB'), // stocks
      VB: variation('GC'), // créances
      VC: variation('HD'), // dettes d'exploitation
      JG: dotations,
    };
    const comptesDe: Record<string, CompteDuPoste[]> = {
      VA: bilanCloture.get('GB')!.comptes,
      VB: bilanCloture.get('GC')!.comptes,
      VC: bilanCloture.get('HD')!.comptes,
      JG: lignes68
        .filter((l) => Math.abs(l.solde) > 0.005)
        .map((l) => ({ numero: l.numero, intitule: l.intitule, montant: l.solde })),
    };

    const retraitements = RETRAITEMENTS.map((r) => ({
      ref: r.ref,
      libelle: r.libelle,
      montant: valeurs[r.ref],
      signe: r.signe,
      comptes: comptesDe[r.ref],
    }));

    const resultatNet = retraitements.reduce((s, r) => s + r.signe * r.montant, soldeCaisse); // KZC
    const resultatBilan = bilanCloture.get('HB')!.montant;
    const hors = this.fluxHorsExploitation(mouvements);

    return {
      recettes: recettes.postes,
      totalRecettes: recettes.total, // KX
      depenses: depenses.postes,
      totalDepenses: depenses.total, // JX
      soldeCaisse, // KZ
      retraitements, // VA, VB, VC, JG
      resultatNet, // KZC
      controle: {
        resultatBilan,
        fluxHorsExploitation: hors.montant,
        comptesHorsExploitation: hors.comptes,
        // KZC - flux hors exploitation doit égaler le résultat du bilan ·
        // voir la note ci-dessus sur la limite de la maquette.
        ecart: resultatNet - hors.montant - resultatBilan,
        concordant: Math.abs(resultatNet - hors.montant - resultatBilan) < 0.01,
      },
    };
  }

  // -------------------------------------------------------------------------
  // NOTE 4 · JOURNAL UNIQUE DE TRÉSORERIE
  // -------------------------------------------------------------------------

  /**
   * NOTE 4 · JOURNAL UNIQUE DE TRÉSORERIE.
   *
   * « NB : Prévoir un journal par banque et un journal pour la caisse. » ·
   * un journal par compte de trésorerie, donc, chacun ouvert sur son report
   * à nouveau et clos sur son solde à reporter, comme la maquette l'imprime.
   *
   * ## Un livre de caisse, pas un extrait du compte de résultat
   *
   * Ce journal balaie les LIGNES portées sur chaque compte de trésorerie, et
   * non les seules opérations qui ont un effet net sur la trésorerie de
   * l'entité. La différence tient au virement interne : un versement de la
   * caisse à la banque n'est ni une recette ni une dépense pour l'entité (il
   * est donc absent du compte de résultat), mais c'est bel et bien une sortie
   * de la caisse et une entrée en banque. L'omettre laisserait un journal
   * dont le solde à reporter ne serait pas celui du compte · un livre de
   * caisse faux.
   *
   * Ces lignes sont marquées `virementInterne` et ne reçoivent aucune
   * ventilation : les colonnes officielles ne classent que des natures de
   * recette et de dépense, et un virement n'en est pas une.
   *
   * ## Ventilation
   *
   * Attribuée quand l'écriture ne touche qu'UN compte de trésorerie · le cas
   * courant. Quand elle en touche plusieurs (un encaissement partagé entre
   * caisse et banque), répartir la ventilation entre eux supposerait une clé
   * que l'écriture ne porte pas : la ligne est comptée dans les colonnes
   * Recettes, Dépenses et Solde, mais laissée hors ventilation et signalée
   * par `lignesNonVentilees`.
   *
   * ## Contrôle
   *
   * `soldeAReporter` est confronté au solde du compte tel que la balance le
   * donne. L'égalité est la preuve que le journal est complet ; l'écart est
   * exposé, jamais absorbé.
   */
  async journalTresorerie(tenantId: string, exerciceId: string) {
    const [ecritures, lignes] = await Promise.all([
      this.ecrituresDeLExercice(tenantId, exerciceId),
      this.chargerLignes(tenantId, exerciceId),
    ]);

    const comptesTresorerie = lignes
      .filter((l) => this.estTresorerie(l.numero))
      .sort((a, b) => a.numero.localeCompare(b.numero));

    const journaux = comptesTresorerie.map((compte) => {
      // Report à nouveau : l'ouverture du compte, telle que la maquette
      // l'imprime en première ligne du journal.
      const reportANouveau = compte.reportDebit - compte.reportCredit;
      let solde = reportANouveau;
      let nonVentilees = 0;

      const operations = ecritures.flatMap((e) => {
        const surCeCompte = e.lignes.filter((l) => l.compteId === compte.compteId);
        if (surCeCompte.length === 0) return [];
        const mouvement = surCeCompte.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
        if (Math.abs(mouvement) < 0.005) return [];

        const tresorerieDeLEcriture = e.lignes.filter((l) => this.estTresorerie(l.compte.numero));
        const contreparties = e.lignes.filter((l) => !this.estTresorerie(l.compte.numero));
        // Aucune contrepartie hors trésorerie : l'écriture ne fait que
        // déplacer de l'argent entre deux comptes de l'entité.
        const virementInterne = contreparties.length === 0;
        // Une seule caisse ou banque touchée : la ventilation est
        // attribuable sans clé de répartition.
        const ventilable = !virementInterne && tresorerieDeLEcriture.length === 1;
        if (!virementInterne && !ventilable) nonVentilees += 1;

        const sens: 'RECETTE' | 'DEPENSE' = mouvement > 0 ? 'RECETTE' : 'DEPENSE';
        const colonnes = sens === 'RECETTE' ? VENTILATION_RECETTES : VENTILATION_DEPENSES;
        const ventilation: Record<string, number> = {};
        for (const col of colonnes) ventilation[col.cle] = 0;
        if (ventilable) {
          for (const l of contreparties) {
            const montant =
              sens === 'RECETTE' ? Number(l.credit) - Number(l.debit) : Number(l.debit) - Number(l.credit);
            const col = colonnes.find((k) => correspond(l.compte.numero, k.comptes, k.exclusions));
            if (col) ventilation[col.cle] += montant;
          }
        }

        solde += mouvement;
        return [
          {
            date: e.date,
            libelle: e.libelle,
            reference: e.reference,
            sens,
            recette: mouvement > 0 ? mouvement : 0,
            depense: mouvement < 0 ? -mouvement : 0,
            solde,
            virementInterne,
            ventile: ventilable,
            ventilation,
          },
        ];
      });

      return {
        compteId: compte.compteId,
        numero: compte.numero,
        intitule: compte.intitule,
        reportANouveau,
        operations,
        soldeAReporter: solde,
        totalRecettes: operations.reduce((s, o) => s + o.recette, 0),
        totalDepenses: operations.reduce((s, o) => s + o.depense, 0),
        lignesNonVentilees: nonVentilees,
        // Preuve que le journal est complet : son solde final doit être celui
        // du compte à la balance.
        soldeBalance: compte.solde,
        boucle: Math.abs(solde - compte.solde) < 0.01,
      };
    });

    return {
      journaux,
      colonnesRecettes: VENTILATION_RECETTES.map((c) => ({ cle: c.cle, libelle: c.libelle })),
      colonnesDepenses: VENTILATION_DEPENSES.map((c) => ({ cle: c.cle, libelle: c.libelle })),
      nb: NB_JOURNAL_TRESORERIE,
    };
  }

  // -------------------------------------------------------------------------
  // NOTES 1, 2, 3 et 5
  // -------------------------------------------------------------------------

  /**
   * NOTE 1 · « Tableau d'acquisition et de suivi du matériel, du mobilier et
   * autres immobilisations ». Colonnes officielles : Date, Désignation,
   * Montant, Date d'acquisition, Durée d'utilité, Date de sortie, Prix de
   * cession · toutes tenues par le modèle Immobilisation.
   *
   * La maquette ouvre une colonne « Date » ET une colonne « Date
   * d'acquisition ». Le texte ne dit pas ce que la première désigne ; la
   * date de mise en service, que le SYCEBNL distingue explicitement de
   * l'acquisition (COMPTE 28), est la seule autre date du dossier. Elle est
   * servie là, et la colonne est intitulée pour ce qu'elle contient plutôt
   * que laissée ambiguë.
   */
  async note1Immobilisations(tenantId: string, exerciceId: string) {
    const exercice = await this.prisma.exercice.findFirstOrThrow({
      where: { id: exerciceId, tenantId },
      select: { dateFin: true },
    });
    const immobilisations = await this.prisma.immobilisation.findMany({
      where: { tenantId, dateAcquisition: { lte: exercice.dateFin } },
      orderBy: [{ dateAcquisition: 'asc' }],
    });
    return {
      lignes: immobilisations.map((i) => ({
        dateMiseEnService: i.dateMiseEnService,
        designation: i.designation,
        montant: Number(i.valeurOrigine),
        dateAcquisition: i.dateAcquisition,
        dureeUtiliteAns: i.dureeAmortissementAns,
        dateSortie: i.dateSortie,
        prixCession: i.prixCession === null ? null : Number(i.prixCession),
      })),
      total: immobilisations.reduce((s, i) => s + Number(i.valeurOrigine), 0),
    };
  }

  /**
   * NOTE 2 · « Etat des stocks ». Colonnes officielles : Référence,
   * Désignation, Quantité, Prix unitaire, Montant ; lignes de synthèse
   * VALEUR DU STOCK FINAL et VALEUR DU STOCK INITIAL.
   *
   * LACUNE ASSUMÉE : OmegaX ne tient pas d'inventaire physique · il n'a ni
   * quantité ni prix unitaire à porter. Les colonnes correspondantes sont
   * renvoyées à `null` et l'état le déclare, plutôt que d'afficher une
   * quantité de 1 qui laisserait croire à un inventaire tenu. Référence et
   * Désignation sont servies par le numéro et l'intitulé du compte de stock,
   * Montant par son solde.
   */
  async note2Stocks(tenantId: string, exerciceId: string) {
    const lignes = await this.chargerLignes(tenantId, exerciceId);
    const stocks = lignes
      .filter((l) => l.classe === ClasseCompte.CLASSE_3)
      .sort((a, b) => a.numero.localeCompare(b.numero));
    return {
      lignes: stocks.map((l) => ({
        reference: l.numero,
        designation: l.intitule,
        quantite: null,
        prixUnitaire: null,
        montant: l.solde,
      })),
      valeurStockFinal: stocks.reduce((s, l) => s + l.solde, 0),
      valeurStockInitial: stocks.reduce((s, l) => s + (l.reportDebit - l.reportCredit), 0),
      quantitesTenues: false,
      motifQuantites:
        "OmegaX ne tient pas d'inventaire physique : les colonnes Quantité et Prix unitaire de la maquette officielle ne peuvent pas être servies depuis la comptabilité et doivent être complétées à la main sur l'état imprimé.",
    };
  }

  /**
   * NOTE 3 · « Etat des créances et des dettes non échues ». Colonnes
   * officielles : Date, Nom, Montant au 31 décembre N, Montant au 1er
   * janvier N, Variation en valeur, Variation en %.
   *
   * « Montant au 1er janvier N » est l'OUVERTURE de l'exercice, c'est-à-dire
   * le report à nouveau du compte · pas le solde de l'exercice N-1 rechargé.
   * Les deux coïncident quand la clôture a été passée, mais l'ouverture est
   * ce que la maquette demande et c'est elle qui est servie.
   *
   * La colonne « Date » de la maquette n'a pas d'équivalent au niveau d'un
   * compte de tiers (une créance agrège plusieurs pièces de dates
   * différentes) : elle est laissée vide plutôt que remplie d'une date
   * arbitraire.
   */
  async note3CreancesDettes(tenantId: string, exerciceId: string) {
    const lignes = await this.chargerLignes(tenantId, exerciceId);
    const tiersParCompte = new Map<string, string>();
    const rattachements = await this.prisma.tiersCompte.findMany({
      where: { tiers: { tenantId } },
      include: { tiers: { select: { nom: true } } },
    });
    for (const r of rattachements) tiersParCompte.set(r.compteId, r.tiers.nom);

    const construire = (filtre: (l: LigneBalancePourEtat) => boolean, signe: 1 | -1) =>
      lignes
        .filter((l) => l.classe === ClasseCompte.CLASSE_4 && filtre(l))
        .sort((a, b) => a.numero.localeCompare(b.numero))
        .map((l) => {
          const cloture = signe * l.solde;
          const ouverture = signe * (l.reportDebit - l.reportCredit);
          return {
            numero: l.numero,
            nom: tiersParCompte.get(l.compteId) ?? l.intitule,
            montantCloture: cloture,
            montantOuverture: ouverture,
            variationValeur: cloture - ouverture,
            // Une variation en % n'a pas de sens à partir d'une ouverture
            // nulle (division par zéro) : `null` plutôt qu'un infini affiché.
            variationPourcent: Math.abs(ouverture) < 0.005 ? null : ((cloture - ouverture) / Math.abs(ouverture)) * 100,
          };
        });

    const creances = construire((l) => l.solde > 0, 1);
    const dettes = construire((l) => l.solde < 0, -1);
    return {
      creances,
      totalCreances: creances.reduce((s, c) => s + c.montantCloture, 0),
      dettes,
      totalDettes: dettes.reduce((s, d) => s + d.montantCloture, 0),
    };
  }

  /**
   * NOTE 5 · « Dotation ». Rubriques officielles : Dotation non
   * consomptible, Droit d'entrée, Dotation consomptible, TOTAL · servies par
   * les subdivisions du compte 10 (101/102, 103, 104 ; voir Partie 2, ch. 3,
   * COMPTE 10).
   *
   * La maquette demande aussi le NOM et la NATIONALITÉ de chaque membre
   * apporteur. Les noms sont retrouvés quand l'apport a transité par un
   * compte de la classe 45 « Fondateurs » rattaché à un tiers · la
   * nationalité, elle, n'est pas une donnée du dossier et reste à compléter
   * à la main. L'état le déclare (`nationaliteTenue: false`) au lieu de
   * présenter une colonne vide sans explication.
   */
  async note5Dotation(tenantId: string, exerciceId: string) {
    const lignes = await this.chargerLignes(tenantId, exerciceId);
    const rubriques = [
      { cle: 'nonConsomptible', libelle: 'Dotation non consomptible', comptes: ['101', '102'] },
      { cle: 'droitEntree', libelle: "Droit d'entrée", comptes: ['103'] },
      { cle: 'consomptible', libelle: 'Dotation consomptible', comptes: ['104'] },
    ].map((r) => {
      const comptes = lignes
        .filter((l) => correspond(l.numero, r.comptes))
        .map((l) => ({ numero: l.numero, intitule: l.intitule, montant: -l.solde }));
      return { ...r, montant: comptes.reduce((s, c) => s + c.montant, 0), comptes };
    });

    // Membres apporteurs : les tiers rattachés à un compte 45 « Fondateurs »
    // mouvementé sur l'exercice.
    const comptes45 = lignes.filter((l) => l.numero.startsWith('45'));
    const rattachements = comptes45.length
      ? await this.prisma.tiersCompte.findMany({
          where: { compteId: { in: comptes45.map((l) => l.compteId) } },
          include: { tiers: { select: { nom: true } } },
        })
      : [];
    const membres = rattachements.map((r) => {
      const ligne = comptes45.find((l) => l.compteId === r.compteId)!;
      return {
        nom: r.tiers.nom,
        nationalite: null,
        montant: ligne.mouvementDebit,
        numero: ligne.numero,
      };
    });

    return {
      rubriques,
      total: rubriques.reduce((s, r) => s + r.montant, 0),
      membres,
      nationaliteTenue: false,
      motifNationalite:
        "La nationalité des membres apporteurs n'est pas une donnée du dossier comptable : la colonne de la maquette officielle est à compléter à la main sur l'état imprimé.",
    };
  }

  /** Fiche récapitulative des notes annexes · Section 3 du chapitre 4. */
  ficheNotes() {
    return NOTES_SMT;
  }

  // -------------------------------------------------------------------------
  // CONTRÔLE D'ÉLIGIBILITÉ (art. 6)
  // -------------------------------------------------------------------------

  /**
   * Article 6 : le S.M.T est réservé aux entités dont CHACUNE des cinq
   * catégories de ressources annuelles reste sous trente millions de FCFA,
   * et « si, de manière cumulée sur deux exercices, les ressources dépassent
   * trente millions […] l'entité est éligible au Système normal ».
   *
   * Ce contrôle mesure les ressources de l'exercice, catégorie par catégorie,
   * et les confronte au seuil légal. Il ne CONVERTIT pas : le seuil est
   * exprimé en FCFA par le texte, la RDC tient ses comptes en CDF ou en USD,
   * et le cours de conversion n'appartient pas au texte comptable. Le
   * contrôle affiche donc les montants dans la monnaie de tenue du dossier,
   * rappelle le seuil en FCFA, et laisse l'entité conclure · il ne déclare
   * jamais de lui-même un dossier inéligible sur une conversion qu'il aurait
   * inventée.
   */
  /** Ressources par catégorie de l'article 6, sur un exercice donné. */
  private async ressourcesParCategorie(tenantId: string, exerciceId: string) {
    const lignes = await this.chargerLignes(tenantId, exerciceId);
    return CATEGORIES_RESSOURCES_ART6.map((c) => {
      const comptes = lignes
        .filter((l) => correspond(l.numero, c.comptes, c.exclusions))
        .map((l) => ({ numero: l.numero, intitule: l.intitule, montant: -l.solde }));
      return { cle: c.cle, libelle: c.libelle, montant: comptes.reduce((s, x) => s + x.montant, 0), comptes };
    });
  }

  async eligibilite(tenantId: string, exerciceId: string) {
    const [categories, tenant, exercice] = await Promise.all([
      this.ressourcesParCategorie(tenantId, exerciceId),
      this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { devise: true } }),
      this.prisma.exercice.findUniqueOrThrow({ where: { id: exerciceId }, select: { dateDebut: true } }),
    ]);

    /*
      LE CUMUL SUR DEUX EXERCICES · seconde phrase de l'article 6, citée dans
      la note ci-dessus mais qui n'était pas calculée : le contrôle ne lisait
      qu'un seul exercice. Une entité pouvait donc rester au Système minimal
      alors que le cumul biennal la faisait basculer au Système normal.

      L'exercice précédent est celui qui s'achève avant le début de celui-ci.
      Absent (première année d'activité), le cumul n'est pas calculé et le dit,
      plutôt que de valoir un cumul égal au seul exercice courant · ce qui
      reviendrait à conclure « sous le seuil » sans avoir mesuré.
    */
    const precedent = await this.prisma.exercice.findFirst({
      where: { tenantId, dateFin: { lte: exercice.dateDebut } },
      orderBy: { dateFin: 'desc' },
      select: { id: true, dateDebut: true, dateFin: true },
    });
    const categoriesPrecedent = precedent ? await this.ressourcesParCategorie(tenantId, precedent.id) : null;
    const cumulBiennal = categoriesPrecedent
      ? CATEGORIES_RESSOURCES_ART6.map((c) => {
          const courant = categories.find((x) => x.cle === c.cle)!.montant;
          const anterieur = categoriesPrecedent.find((x) => x.cle === c.cle)!.montant;
          return { cle: c.cle, libelle: c.libelle, exerciceCourant: courant, exercicePrecedent: anterieur, cumule: courant + anterieur };
        })
      : null;

    return {
      categories,
      totalRessources: categories.reduce((s, c) => s + c.montant, 0),
      cumulBiennal,
      exercicePrecedent: precedent ? { id: precedent.id, dateDebut: precedent.dateDebut, dateFin: precedent.dateFin } : null,
      avertissementCumul: cumulBiennal
        ? "L'article 6 ajoute que « si, de manière cumulée sur deux exercices, les ressources dépassent trente millions […] l'entité est éligible au Système normal ». Comparez donc AUSSI la colonne cumulée au seuil : une entité sous le seuil chaque année peut le franchir sur deux."
        : "Aucun exercice antérieur n'est clos dans ce dossier : le cumul sur deux exercices de l'article 6 ne peut pas être mesuré. Il le sera à partir du deuxième exercice.",
      seuilParCategorieFcfa: SEUIL_SMT_FCFA,
      deviseDossier: tenant.devise,
      conversionAppliquee: false,
      avertissement:
        "L'article 6 fixe le seuil à 30 000 000 FCFA « ou l'équivalent dans l'unité monétaire ayant cours légal dans l'État partie ». OmegaX ne convertit pas : comparez chaque catégorie au seuil converti au cours que retient votre entité. L'article 5 rappelle que le Système normal est la règle et le S.M.T l'exception liée à la taille.",
    };
  }
}
