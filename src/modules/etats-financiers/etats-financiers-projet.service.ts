import { Injectable } from '@nestjs/common';
import { ClasseCompte } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
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
 * et assimilés », Système normal · adossés aux tableaux de correspondance
 * OFFICIELS transcrits dans `correspondance-projet-bilan.ts` et
 * `correspondance-projet-compte-exploitation.ts` (Journal officiel OHADA,
 * Partie 4, ch. 3). Construit le 2026-08-28
 * (docs/plan-de-construction.md, item 13), en miroir de
 * `EtatsFinanciersService` (jeu « associations et ordres professionnels »)
 * dont il réutilise le comparatif N-1 et les aides partagées
 * (`etats-financiers.communs.ts`) · mais PAS ses colonnes
 * Brut/Amortissement/Net : le texte de CE jeu n'en prévoit pas, et son
 * tableau de correspondance ne cite aucun compte 28x/29x. Voir l'en-tête de
 * `correspondance-projet-bilan.ts`, section « PAS de colonnes Brut /
 * Amortissement / Net dans ce jeu ».
 *
 * Hors périmètre de ce service, documenté et non simulé (règle §2.6) :
 * - **Tableau d'exécution budgétaire** : la maquette officielle (Section 2)
 *   suit un budget PAR PROJET selon une nomenclature budgétaire propre au
 *   projet, que Compta Flow n'a aucun modèle de données pour représenter
 *   (pas de notion de "ligne budgétaire" ni d'"engagement" distincte d'une
 *   écriture comptée). Construire ce tableau à partir de la seule balance
 *   inventerait des montants "Budget"/"Engagement" qu'aucune donnée ne
 *   porte · un mur de périmètre réel, pas un oubli.
 * - **Tableau emplois-ressources (TER)** et **Tableau de réconciliation de
 *   trésorerie (TRC)** : le texte officiel ne fournit, pour ces deux
 *   tableaux, AUCUN tableau de correspondance poste→comptes (contrairement
 *   au Bilan et au Compte d'exploitation, Section 4-correspondance) · leurs
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
    private readonly prisma: PrismaService,
  ) {}

  private async trouverExerciceN1(tenantId: string, exerciceId: string): Promise<string | null> {
    return trouverExerciceN1(this.exerciceService, tenantId, exerciceId);
  }

  private async chargerLignes(tenantId: string, exerciceId: string | null): Promise<LigneBalancePourEtat[]> {
    return chargerLignes(this.ecritureService, tenantId, exerciceId);
  }

  /**
   * Poste ACTIF de détail · UNE seule valeur, pas de Brut/Amortissement/Net :
   * le texte officiel de ce jeu ne prévoit que « EXERCICE AU 31/12/N » et
   * « EXERCICE AU 31/12/N-1 », et son tableau de correspondance ne cite aucun
   * compte 28x/29x (voir l'en-tête de `correspondance-projet-bilan.ts`).
   */
  private calculerPosteActif(poste: PosteBilanProjetDeBase, lignes: LigneBalancePourEtat[]): PosteCalcule {
    let matches = lignes.filter((l) => correspond(l.numero, poste.comptes, poste.exclusions));
    if (poste.sens_qualificatif === 'DEBITEUR') {
      matches = matches.filter((l) => l.solde > 0);
    }
    // Découverts bancaires : un 52/53 créditeur appartient à DW (passif). Le
    // garder ici le compterait deux fois · négatif à l'actif, positif au
    // passif · et déséquilibrerait le bilan du double du découvert.
    if (poste.comptesTransferesSiCrediteur) {
      matches = matches.filter((l) => !(correspond(l.numero, poste.comptesTransferesSiCrediteur!) && l.solde < 0));
    }
    const comptes: CompteDuPoste[] = matches.map((l) => ({ numero: l.numero, intitule: l.intitule, montant: l.solde }));
    return { ref: poste.ref, libelle: poste.libelle, montant: comptes.reduce((s, c) => s + c.montant, 0), comptes };
  }

  private calculerPostePassif(poste: PosteBilanProjetDeBase, lignes: LigneBalancePourEtat[]): PosteCalcule {
    let matches = lignes.filter((l) => correspond(l.numero, poste.comptes, poste.exclusions));
    if (poste.sens_qualificatif === 'CREDITEUR') {
      matches = matches.filter((l) => l.solde < 0);
    }
    const comptes: CompteDuPoste[] = matches.map((l) => ({ numero: l.numero, intitule: l.intitule, montant: -l.solde }));
    return { ref: poste.ref, libelle: poste.libelle, montant: comptes.reduce((s, c) => s + c.montant, 0), comptes };
  }

  /** DW · même mécanisme de découvert bancaire que le jeu associations (voir correspondance-projet-bilan.ts). */
  private calculerDW(lignes: LigneBalancePourEtat[]): PosteCalcule {
    const posteDW = POSTES_PASSIF.find((p) => p.ref === 'DW')!;
    const base = this.calculerPostePassif(posteDW, lignes);
    const decouverts = lignes.filter((l) => correspond(l.numero, COMPTES_TRESORERIE_PASSIF_SI_CREDITEUR) && l.solde < 0);
    const comptes = [...base.comptes, ...decouverts.map((l) => ({ numero: l.numero, intitule: l.intitule, montant: -l.solde }))];
    return { ref: 'DW', libelle: posteDW.libelle, montant: comptes.reduce((s, c) => s + c.montant, 0), comptes };
  }

  /**
   * CC (Solde des opérations de l'exercice) · contrairement à CH côté
   * associations, ce poste ne s'arbitre pas entre classes 6/7/8 et compte
   * 13 : il vient UNIQUEMENT du compte 13 (voir la note de tête de fichier
   * de `correspondance-projet-compte-exploitation.ts` · ce jeu est construit
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
      parRef.set(total.ref, { ref: total.ref, libelle: total.libelle, montant, comptes: [] });
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
      return { ...n, estTotal: refsTotaux.has(ref), montantN1: n1?.montant };
    };
    const actif = ORDRE_AFFICHAGE_ACTIF.map(fusionnerN1);
    const passif = ORDRE_AFFICHAGE_PASSIF.map(fusionnerN1);

    // Comptes de bilan (classes 1-5) qu'aucun poste ne capte · jamais
    // absorbés en silence (même discipline que le jeu associations).
    const comptesRattaches = new Set<string>();
    for (const poste of [...POSTES_ACTIF, ...POSTES_PASSIF]) {
      for (const l of lignesN) {
        if (correspond(l.numero, poste.comptes, poste.exclusions)) {
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
   * COMPTE D'EXPLOITATION · voir `correspondance-projet-compte-exploitation.ts`
   * pour les 3 anomalies du texte officiel reproduites/corrigées ici (RC
   * restituée, RE inclus dans XA, doublon REF TJ/TK conservé via `cle`).
   * XA = Σrevenus, XB = Σcharges (au sens officiel, TK_PRODUITS_HAO inclus
   * malgré son signe +), XC = XA − XB · voir la note de tête de fichier du
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
        // XC doit valoir 0 en régime normal (voir note de tête de fichier) ·
        // exposé, jamais forcé à zéro artificiellement.
        boucleAZero: Math.abs(solde) < 0.01,
      },
    };
  }

  /**
   * NOTE 9 : FONDS DU BAILLEUR · Partie 4, ch. 3, Section 6 du texte
   * officiel. Colonnes officielles : « Date des décaissements | BAILLEUR/
   * SOUS PROJET 1 (Montant décaissé ; Montant consommé ; Solde restant) |
   * BAILLEUR/SOUS PROJET 2 (…) | … », en deux blocs de rubriques : Fonds
   * d'investissement (comptes 162 à 164) puis Fonds d'administration
   * (comptes 462 à 464). Docs/plan-de-construction.md, item 14
   * (comptabilité analytique par projet/bailleur, ajouté le 2026-08-28).
   *
   * Le mécanisme de suivi PAR bailleur est déjà celui du texte officiel
   * (Partie 3, ch. 3, § 1.2) : les bailleurs se distinguent par LEURS
   * PROPRES sous-comptes 162x/163x/164x et 462x/463x/464x · rien à
   * inventer. Ce service se contente de grouper ces sous-comptes par
   * `Bailleur` (voir `Compte.bailleurId`) pour produire la note
   * automatiquement plutôt qu'à la main.
   *
   * ## Une note de PROJET, pas d'exercice · cumul depuis l'origine
   *
   * La Note 9 suit le cycle de vie du PROJET, pas l'exercice comptable :
   * ses rubriques sont « Date des décaissements » et « TOTAL DES FONDS DU
   * BAILLEUR », et son objet est le niveau d'utilisation des fonds affectés
   * « en pourcentage par catégorie de fonds et de façon globale »
   * (commentaire officiel, Section 6). Les trois colonnes sont donc
   * calculées EN CUMUL depuis l'origine du dossier, toutes périodes
   * confondues · `exerciceId` ne restreint pas les montants (il ne sert
   * qu'à nommer le fichier exporté).
   *
   * Une première version (2026-08-28, matin) calculait décaissé et consommé
   * sur le seul exercice courant tout en affichant un solde cumulé : dès le
   * 2ᵉ exercice les trois colonnes ne se réconciliaient plus (une ligne
   * pouvait afficher « 0 | 0 | 100 000 »). Corrigé à l'audit du même jour.
   *
   * ## Convention retenue pour Montant décaissé / Montant consommé
   *
   * Le texte officiel ne donne le compte source QUE pour « Montant
   * consommé » côté Fonds d'administration : « le solde du compte 702 [...]
   * qu'il convient de subdiviser par nature de projet » (note (2), Section
   * 6). Rien n'est précisé pour Fonds d'investissement, ni pour Montant
   * décaissé des deux côtés `[texte officiel]` · ambiguïté non comblée par
   * une invention, mais résolue par la lecture directe des ÉCRITURES déjà
   * documentées Partie 3 ch. 3 § 2.1/2.2/2.5, qui ne laisse qu'une seule
   * lecture possible :
   *   - Montant décaissé = mouvements CRÉDIT sur les comptes 162-164
   *     (investissement) ou 462-464 (administration) rattachés au bailleur
   *     (§ 2.1 : mise à disposition, toujours au crédit) ;
   *   - Montant consommé  = mouvements DÉBIT sur ces mêmes comptes (§ 2.2
   *     pour l'administration · mécaniquement le solde du 702, par
   *     construction de l'écriture · et § 2.5 pour l'investissement :
   *     sortie d'immobilisation en fin de projet) ;
   *   - Solde restant = décaissé − consommé, ce qui est exactement le solde
   *     créditeur cumulé du compte : les trois colonnes se réconcilient par
   *     construction, à tout moment de la vie du projet.
   *
   * Les écritures de report à-nouveau (`Ecriture.estGenereeParCloture`)
   * restent EXCLUES, et c'est indispensable ici : le report rejoue au crédit
   * le solde de clôture de l'exercice précédent, qui compterait donc une
   * deuxième fois le même décaissement dans un cumul multi-exercices.
   *
   * Les comptes 162-164/462-464 SANS bailleur rattaché ne sont jamais
   * absorbés en silence dans un total : ils ressortent sous `nonAffecte`
   * (même discipline que `comptesNonRattaches` sur le bilan/compte
   * d'exploitation).
   */
  async noteBailleur(tenantId: string, exerciceId: string) {
    const PREFIXES_INVESTISSEMENT = ['162', '163', '164'];
    const PREFIXES_ADMINISTRATION = ['462', '463', '464'];

    const comptes = await this.prisma.compte.findMany({
      where: { tenantId, OR: [{ numero: { startsWith: '16' } }, { numero: { startsWith: '46' } }] },
      include: { bailleur: true },
    });
    const comptesInvestissement = comptes.filter((c) => PREFIXES_INVESTISSEMENT.some((p) => c.numero.startsWith(p)));
    const comptesAdministration = comptes.filter((c) => PREFIXES_ADMINISTRATION.some((p) => c.numero.startsWith(p)));

    const compteIds = [...comptesInvestissement, ...comptesAdministration].map((c) => c.id);
    // PAS de filtre `exerciceId` : cumul depuis l'origine du projet (voir
    // « Une note de PROJET, pas d'exercice » en tête de méthode).
    const lignes = compteIds.length
      ? await this.prisma.ligneEcriture.findMany({
          // `VALIDEE` seulement : la note 9 est un état financier, elle ne
          // lit pas le brouillard (voir StatutEcriture dans le schéma).
          where: { compteId: { in: compteIds }, ecriture: { tenantId, statut: 'VALIDEE' } },
          select: { compteId: true, debit: true, credit: true, ecriture: { select: { estGenereeParCloture: true } } },
        })
      : [];
    const lignesReelles = lignes.filter((l) => !l.ecriture.estGenereeParCloture);

    const mouvements = (comptesGroupe: typeof comptesInvestissement) => {
      const parCompte = new Map(comptesGroupe.map((c) => [c.id, { decaisse: 0, consomme: 0, soldeRestant: 0 }]));
      for (const l of lignesReelles) {
        const acc = parCompte.get(l.compteId);
        if (!acc) continue;
        acc.decaisse += Number(l.credit);
        acc.consomme += Number(l.debit);
      }
      // Solde restant = décaissé − consommé : c'est exactement le solde
      // créditeur cumulé du compte, et les trois colonnes se réconcilient
      // par construction (pas de solde de balance lu à côté).
      for (const c of comptesGroupe) {
        const acc = parCompte.get(c.id)!;
        acc.soldeRestant = acc.decaisse - acc.consomme;
      }
      return parCompte;
    };

    const agregerParBailleur = (comptesGroupe: typeof comptesInvestissement) => {
      const parCompte = mouvements(comptesGroupe);
      const parBailleur = new Map<string, { bailleur: { id: string; code: string; nom: string }; decaisse: number; consomme: number; soldeRestant: number }>();
      const nonAffecte = { decaisse: 0, consomme: 0, soldeRestant: 0 };
      for (const c of comptesGroupe) {
        const m = parCompte.get(c.id)!;
        if (!c.bailleur) {
          nonAffecte.decaisse += m.decaisse;
          nonAffecte.consomme += m.consomme;
          nonAffecte.soldeRestant += m.soldeRestant;
          continue;
        }
        const existant = parBailleur.get(c.bailleur.id) ?? {
          bailleur: { id: c.bailleur.id, code: c.bailleur.code, nom: c.bailleur.nom },
          decaisse: 0,
          consomme: 0,
          soldeRestant: 0,
        };
        existant.decaisse += m.decaisse;
        existant.consomme += m.consomme;
        existant.soldeRestant += m.soldeRestant;
        parBailleur.set(c.bailleur.id, existant);
      }
      return { parBailleur: [...parBailleur.values()].sort((a, b) => a.bailleur.code.localeCompare(b.bailleur.code)), nonAffecte };
    };

    const investissement = agregerParBailleur(comptesInvestissement);
    const administration = agregerParBailleur(comptesAdministration);

    const totalInvestissement = investissement.parBailleur.reduce(
      (s, b) => ({
        decaisse: s.decaisse + b.decaisse,
        consomme: s.consomme + b.consomme,
        soldeRestant: s.soldeRestant + b.soldeRestant,
      }),
      { decaisse: 0, consomme: 0, soldeRestant: 0 },
    );
    const totalAdministration = administration.parBailleur.reduce(
      (s, b) => ({
        decaisse: s.decaisse + b.decaisse,
        consomme: s.consomme + b.consomme,
        soldeRestant: s.soldeRestant + b.soldeRestant,
      }),
      { decaisse: 0, consomme: 0, soldeRestant: 0 },
    );

    return {
      investissement: investissement.parBailleur,
      investissementNonAffecte: investissement.nonAffecte,
      totalInvestissement,
      administration: administration.parBailleur,
      administrationNonAffecte: administration.nonAffecte,
      totalAdministration,
      totalFondsDuBailleur: {
        decaisse: totalInvestissement.decaisse + totalAdministration.decaisse,
        consomme: totalInvestissement.consomme + totalAdministration.consomme,
        soldeRestant: totalInvestissement.soldeRestant + totalAdministration.soldeRestant,
      },
    };
  }
}
