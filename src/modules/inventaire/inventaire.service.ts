import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DecisionEcartInventaire,
  MethodeInventaireStocks,
  ModeComparaisonCaisse,
  Prisma,
  Referentiel,
  RoleMembreInventaire,
  StatutCampagneInventaire,
  StatutEcriture,
  StatutImmobilisation,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import {
  AjouterMembreDto,
  AjouterSousCommissionDto,
  ArbitrerEcartDto,
  CreerCampagneDto,
  CreerFicheDto,
  EtablirProcesVerbalDto,
  EtablirPvCaisseDto,
  ModifierCampagneDto,
  SaisirComptageDto,
} from './dto/inventaire.dto';
import { decrireLigne, lignesManquantes, type LigneAttendue } from '../comptabilite/rattachement-ecriture';
import { transactionJournalisee } from '../../common/audit/transaction-journalisee';
import { compteInscritALaDate } from '../immobilisations/immobilisation-en-cours';
import {
  compteApresLaCloture,
  especesReconstitueesALaCloture,
  exercicesDuComptage,
  fenetresDuComptage,
  filtreExercicesSuivants,
  FORMAT_DATE_COMPTAGE,
  lireSoldeCaisseAuComptage,
  luesParLePv,
  mentionsDuPv,
  sommesDansLUnite,
  type UniteComparaison,
  valideesDepuisLePv,
} from './solde-caisse-au-comptage';

/**
 * INVENTAIRE PHYSIQUE · l'obligation qu'OmegaX ne portait pas.
 *
 * LE FONDEMENT, identique des deux côtés. AUDCIF art. 42 : « À la clôture de
 * chaque exercice, l'entité doit procéder au RECENSEMENT et à l'ÉVALUATION de
 * ses biens, créances et dettes à leur valeur effective du moment, dite valeur
 * actuelle. » L'art. 3 du SYCEBNL n'écarte pas l'art. 42 · sa liste
 * d'exclusion saute de 34 à 49. Le module est donc ouvert aux deux
 * référentiels, sans `@ReferentielsAutorises`.
 *
 * L'EXPOSITION PÉNALE, elle, ne passe pas par le même article, et les deux ne
 * se servent JAMAIS l'un pour l'autre · voir `sanctionApplicable()`.
 *
 * CE QUE LE MODULE NE FAIT PAS, et qu'il ne faut pas lui ajouter par
 * commodité :
 *
 *  1. IL NE TIENT PAS DE STOCK PERMANENT. OmegaX n'a aucun magasin, aucune
 *     fiche de stock, aucun mouvement d'entrée-sortie. Une campagne organise
 *     le comptage d'UNE date, le rapproche de la balance et arbitre les
 *     écarts. Entre deux campagnes, le logiciel ne sait rien des quantités.
 *  2. IL NE PASSE AUCUNE ÉCRITURE D'OFFICE. L'étape 6 du CPCC dit que
 *     « l'inventaire extracomptable doit DÉCIDER de la comptabilisation des
 *     écarts constatés » · la décision appartient à la commission, le montant
 *     et le journal au comptable. Le module propose, il ne poste pas.
 *  3. IL NE COMPTABILISE JAMAIS UN EXCÉDENT. AUDCIF art. 43 : « Si la valeur
 *     d'inventaire est SUPÉRIEURE à la valeur d'entrée, cette dernière est
 *     MAINTENUE dans les comptes, sauf cas expressément prévus par la
 *     législation. » Un écart positif se documente et se porte au résumé de
 *     l'opération d'inventaire · il ne devient pas un produit. C'est le refus
 *     le plus important du fichier, parce qu'une écriture d'excédent
 *     s'équilibre parfaitement et gonfle le résultat sans que rien ne bronche.
 *
 * ET UNE CORRECTION DU 2026-09-06, SUR CE TROISIÈME REFUS : L'ART. 43 NE
 * RÉGIT PAS LA CAISSE. Il oppose la « valeur d'inventaire » à la « valeur
 * d'entrée » DU MÊME BIEN, et ses deux branches débouchent sur un
 * amortissement ou une dépréciation · il traite d'une variation de VALEUR.
 * Un excédent de caisse n'est pas une monnaie qui vaut plus, c'est un billet
 * de plus : une variation de QUANTITÉ. Et la fiche du compte 57 dit
 * l'inverse dans les DEUX plans (AUDCIF Titre VII et SYCEBNL Partie 2 ch. 3,
 * même phrase) : « Le solde du compte caisse doit TOUJOURS correspondre
 * EXACTEMENT à la somme disponible réellement. »
 *
 * Les deux textes pointent donc dans des directions opposées sur les
 * espèces, et AUCUNE source lue ne dit ce qu'il faut faire d'un excédent de
 * caisse · ni produit, ni dette, ni compte d'attente, et aucun plan ne porte
 * de compte « écart de caisse ». Le module garde donc son refus de poster
 * d'office, qui reste juste, mais il cesse de le motiver par un article qui
 * ne s'applique pas : sur un compte 57, il NOMME LA TENSION et laisse la
 * commission trancher. Citer l'art. 43 sur une caisse, c'était fabriquer une
 * règle · le défaut du § 10 bis de CLAUDE.md dans sa forme la plus discrète,
 * un message plausible et sourcé sur le mauvais texte.
 */
@Injectable()
export class InventaireService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritures: EcritureService,
  ) {}

  /**
   * LE CHEMIN PÉNAL DU DOSSIER, et il n'y en a qu'un par référentiel.
   *
   * SYSCOHADA · AUDCIF art. 111 : « Encourent une sanction pénale les
   * dirigeants d'entités […] qui n'auront pas, pour chaque exercice, dressé
   * l'inventaire et établi les états financiers annuels […] ».
   *
   * SYCEBNL · cet article est ÉCARTÉ (art. 3 exclut les art. 73 à 113), et
   * c'est l'art. 24, premier tiret, qui prend le relais avec la même phrase :
   * « n'ont pas, pour un exercice, dressé l'inventaire et établi les états
   * financiers annuels, ainsi que le rapport d'activité ».
   *
   * Servir l'un pour l'autre ferait citer à une association un article qui ne
   * la régit pas, et à une SARL un Acte uniforme qui ne lui est pas
   * applicable. C'est la même discipline que pour le livre d'inventaire
   * (art. 19 quatrième tiret, écarté, contre art. 14 SYCEBNL).
   */
  /**
   * LE MOTIF DU REFUS D'EXCÉDENT, ET IL N'EST PAS LE MÊME SUR UNE CAISSE.
   *
   * Sur un compte de stock ou d'immobilisation, l'art. 43 s'applique
   * directement : la valeur d'inventaire supérieure à la valeur d'entrée ne
   * se comptabilise pas, la valeur d'entrée est maintenue.
   *
   * Sur un compte 57, il ne s'applique PAS. L'art. 43 oppose deux VALEURS du
   * même bien et débouche sur un amortissement ou une dépréciation ; un
   * excédent d'espèces est une variation de QUANTITÉ, à laquelle ni l'un ni
   * l'autre ne convient. Et la fiche du compte 57 dit l'inverse, dans les
   * deux plans, mot pour mot : « Le solde du compte caisse doit toujours
   * correspondre exactement à la somme disponible réellement. »
   *
   * Le refus de poster d'office reste, parce qu'aucune source lue ne dit ce
   * qu'il faut CRÉDITER · aucun des deux plans ne porte de compte « écart de
   * caisse », et le corpus ne traite l'excédent d'espèces nulle part. Mais le
   * message nomme la tension au lieu d'invoquer un article qui ne régit pas
   * le cas.
   */
  /**
   * LA CONTREPARTIE D'UN MANQUANT · « le référentiel n'en impose aucune »
   * ÉTAIT TROP LARGE, et corrigé le 2026-09-19.
   *
   * La phrase est vraie d'une caisse, d'une immobilisation, d'un tiers : rien
   * dans le corpus ne dit quel compte de charge reçoit le manquant, cela
   * dépend de sa nature. Elle est FAUSSE d'un compte de classe 3 tenu en
   * inventaire PERMANENT, où les deux textes nomment la contrepartie · c'est
   * le compte de VARIATION du stock. AUDCIF Titre VII, compte 603 : « à la
   * clôture, DÉBITÉ des différences en MOINS constatées entre l'inventaire
   * comptable et l'inventaire physique, par le crédit des stocks concernés ».
   * SYCEBNL Partie 2 ch. 3 : « en cas d'existence d'un MALI D'INVENTAIRE […]
   * par le débit du compte 6031 ».
   *
   * LE COÛT DE LA LACUNE DÉCLARÉE À TORT · un cabinet qui suit la note
   * imputait le manquant en charge diverse. L'écriture s'équilibre, la
   * balance boucle, et la ligne « Variation des stocks » du compte de
   * résultat reste fausse du montant de l'écart, sous une nature de charge
   * qui n'est pas la bonne. Rien en aval ne peut le dire.
   *
   * CE QUI RESTE VRAI, ET QUI EST DIT · sur un compte de classe 3, un écart
   * de valeur peut aussi venir d'une baisse de valeur à quantité égale, qui
   * relève de la DÉPRÉCIATION (compte 39) et non de la variation. Le module
   * ne tranche pas entre les deux · il nomme les deux voies avec leur
   * article, et la qualification appartient à la sous-commission.
   */
  static noteContrepartieManquant(
    numeroCompte: string,
    modeInventaireStocks?: MethodeInventaireStocks | null,
  ): string {
    if (numeroCompte.startsWith('3') && modeInventaireStocks === MethodeInventaireStocks.PERMANENT) {
      return (
        "Sur un STOCK tenu en inventaire PERMANENT, la contrepartie n'est pas libre, et elle " +
        "dépend de la QUALIFICATION de l'écart. Si la quantité comptée est inférieure à celle des " +
        "livres, c'est un MALI D'INVENTAIRE : la contrepartie est le compte de VARIATION du stock, " +
        'que les deux textes désignent (AUDCIF Titre VII, compte 603 · SYCEBNL Partie 2 ch. 3, ' +
        "comptes 31 à 36), et la fenêtre Magasin le chiffre article par article. Si c'est la " +
        "VALEUR qui a baissé à quantité égale, c'est une DÉPRÉCIATION (compte 39), et non une " +
        'variation. Les deux voies ne se remplacent pas : porter un mali en charge diverse ' +
        "laisserait la ligne « Variation des stocks » du compte de résultat fausse du montant de " +
        "l'écart, sur une écriture parfaitement équilibrée."
      );
    }
    return "Contrepartie à choisir selon la nature du manquant · le référentiel n'en impose aucune.";
  }

  static motifRefusExcedent(
    numeroCompte: string,
    modeInventaireStocks?: MethodeInventaireStocks | null,
  ): string {
    // SUR UN STOCK TENU EN INVENTAIRE PERMANENT, L'ART. 43 NE COUVRE QUE LA
    // MOITIÉ DU CAS, et l'affirmer seul fabrique une DISPENSE.
    //
    // Un écart de valeur sur un compte de classe 3 a deux origines, et les
    // deux textes ne les traitent pas pareil. Si la VALEUR a baissé à
    // quantité égale, l'art. 43 s'applique en effet et l'excédent ne
    // s'inscrit pas. Mais si la QUANTITÉ comptée dépasse la quantité des
    // livres, c'est un BONI D'INVENTAIRE, et les deux textes disent
    // expressément de le comptabiliser · AUDCIF Titre VII, compte 603, « à la
    // clôture, CRÉDITÉ des différences en PLUS constatées entre l'inventaire
    // comptable et l'inventaire physique, par le débit des comptes de stocks
    // concernés » ; SYCEBNL Partie 2 ch. 3, fiches des comptes 31 à 36, « en
    // cas d'existence d'un BONI D'INVENTAIRE […] est débité le compte 31 […]
    // par le crédit du compte 6031 ».
    //
    // C'est la même distinction VALEUR / QUANTITÉ que sur la caisse, avec
    // cette différence que la caisse n'a AUCUNE contrepartie dans le corpus,
    // alors que le stock en a une, nommée. Refuser tout excédent sur un 3 au
    // nom de l'art. 43 était donc une lacune déclarée à tort.
    if (numeroCompte.startsWith('3') && modeInventaireStocks === MethodeInventaireStocks.PERMANENT) {
      return (
        "Sur un STOCK tenu en inventaire PERMANENT, l'art. 43 ne couvre que la moitié du cas. Il " +
        "s'applique bien à une baisse de VALEUR à quantité égale : « si la valeur d'inventaire est " +
        "supérieure à la valeur d'entrée, cette dernière est maintenue dans les comptes ». Mais si " +
        "c'est la QUANTITÉ comptée qui dépasse celle des livres, il s'agit d'un BONI " +
        "D'INVENTAIRE, et les deux textes disent de le comptabiliser · le compte de stock est " +
        'débité par le crédit de son compte de VARIATION (AUDCIF Titre VII, compte 603 · SYCEBNL ' +
        'Partie 2 ch. 3, comptes 31 à 36). La qualification décide, et elle appartient à la ' +
        "sous-commission : c'est la fenêtre Magasin qui chiffre un boni, article par article, " +
        "parce qu'elle seule connaît les quantités."
      );
    }
    if (numeroCompte.startsWith('57')) {
      return (
        "Sur une CAISSE, l'AUDCIF art. 43 ne tranche pas : il oppose deux VALEURS du même bien et débouche sur " +
        "un amortissement ou une dépréciation, là où un excédent d'espèces est une variation de QUANTITÉ. La " +
        'fiche du compte 57 dit même l\'inverse, dans les deux plans : « le solde du compte caisse doit toujours ' +
        'correspondre exactement à la somme disponible réellement ». Aucune source ne dit pour autant ce qu\'il ' +
        "faut créditer · ni produit, ni dette, ni compte d'attente, et aucun plan ne porte de compte « écart de " +
        "caisse ». La décision et la contrepartie appartiennent donc à la commission (CPCC, étape 5 : l'excédent " +
        "s'explique devant la sous-commission, qui propose à la commission principale)."
      );
    }
    return (
      "AUDCIF art. 43 : « si la valeur d'inventaire est supérieure à la valeur d'entrée, cette dernière est " +
      'maintenue dans les comptes, sauf cas expressément prévus par la législation ».'
    );
  }

  static sanctionApplicable(referentiel: Referentiel): { texte: string; article: string } {
    return referentiel === Referentiel.SYCEBNL
      ? {
          texte: 'Acte uniforme SYCEBNL',
          article:
            "art. 24, premier tiret · « n'ont pas, pour un exercice, dressé l'inventaire et établi les états financiers annuels, ainsi que le rapport d'activité »",
        }
      : {
          texte: 'AUDCIF',
          article:
            "art. 111 · « n'auront pas, pour chaque exercice, dressé l'inventaire et établi les états financiers annuels, consolidés ou combinés ainsi que le rapport de gestion »",
        };
  }

  private async campagneOuverte(tenantId: string, id: string, statutsAdmis: StatutCampagneInventaire[]) {
    const campagne = await this.prisma.campagneInventaire.findFirst({ where: { id, tenantId } });
    if (!campagne) throw new NotFoundException("Campagne d'inventaire introuvable.");
    if (!statutsAdmis.includes(campagne.statut)) {
      throw new ForbiddenException(
        `Cette campagne est au statut ${campagne.statut} · l'opération demandée n'est possible qu'en ${statutsAdmis.join(' ou ')}.`,
      );
    }
    return campagne;
  }

  async creer(tenantId: string, userId: string, dto: CreerCampagneDto) {
    const exercice = await this.prisma.exercice.findFirst({ where: { id: dto.exerciceId, tenantId } });
    if (!exercice) throw new NotFoundException('Exercice introuvable.');
    if (exercice.statut === 'CLOTURE') {
      throw new ForbiddenException(
        "L'exercice est clos · l'inventaire se dresse AVANT les écritures d'inventaire, pas après (CPCC, étape 4 : la comparaison se fait sur la balance provisoire).",
      );
    }
    const dateInventaire = new Date(dto.dateInventaire);
    if (dateInventaire < exercice.dateDebut) {
      throw new BadRequestException("La date d'inventaire est antérieure à l'ouverture de l'exercice.");
    }
    return this.prisma.campagneInventaire.create({
      data: {
        tenantId,
        exerciceId: dto.exerciceId,
        dateInventaire,
        libelle: dto.libelle.trim(),
        instructions: dto.instructions?.trim() || null,
        createdBy: userId,
      },
    });
  }

  async modifier(tenantId: string, id: string, dto: ModifierCampagneDto) {
    await this.campagneOuverte(tenantId, id, [
      StatutCampagneInventaire.PREPARATION,
      StatutCampagneInventaire.RECENSEMENT,
    ]);
    return this.prisma.campagneInventaire.update({
      where: { id },
      data: {
        ...(dto.libelle !== undefined ? { libelle: dto.libelle.trim() } : {}),
        ...(dto.instructions !== undefined ? { instructions: dto.instructions?.trim() || null } : {}),
      },
    });
  }

  async ajouterSousCommission(tenantId: string, campagneId: string, dto: AjouterSousCommissionDto) {
    await this.campagneOuverte(tenantId, campagneId, [
      StatutCampagneInventaire.PREPARATION,
      StatutCampagneInventaire.RECENSEMENT,
    ]);
    return this.prisma.sousCommissionInventaire.create({
      data: { tenantId, campagneId, nom: dto.nom.trim(), perimetre: dto.perimetre?.trim() || null },
    });
  }

  async ajouterMembre(tenantId: string, sousCommissionId: string, dto: AjouterMembreDto) {
    const sc = await this.prisma.sousCommissionInventaire.findFirst({
      where: { id: sousCommissionId, tenantId },
      include: { campagne: true },
    });
    if (!sc) throw new NotFoundException('Sous-commission introuvable.');
    if (sc.campagne.statut === StatutCampagneInventaire.CLOTUREE) {
      throw new ForbiddenException('La campagne est close · sa composition ne se modifie plus.');
    }
    return this.prisma.membreSousCommission.create({
      data: {
        tenantId,
        sousCommissionId,
        nom: dto.nom.trim(),
        fonction: dto.fonction?.trim() || null,
        role: dto.role,
      },
    });
  }

  /**
   * ÉTAPE 1, DERNIER GESTE · engendrer les fiches du parc immobilisé.
   *
   * « Sélectionner quelques entrées au niveau du fichier des biens
   * immobilisés, vérifier si toutes les conditions ont été remplies » (CPCC,
   * checklist Immobilisations) : le fichier existe déjà dans OmegaX, il n'y a
   * aucune raison de le ressaisir pour aller compter.
   *
   * Seuls les biens EN SERVICE sont fichés · un bien cédé ou mis hors service
   * n'est plus au bilan, le compter reviendrait à fabriquer un manquant sur
   * toutes les lignes du parc renouvelé.
   */
  async engendrerFichesImmobilisations(tenantId: string, campagneId: string) {
    const campagne = await this.campagneOuverte(tenantId, campagneId, [
      StatutCampagneInventaire.PREPARATION,
      StatutCampagneInventaire.RECENSEMENT,
    ]);
    const [biens, dejaFichees] = await Promise.all([
      this.prisma.immobilisation.findMany({
        where: { tenantId, statut: StatutImmobilisation.EN_SERVICE },
        orderBy: { designation: 'asc' },
      }),
      this.prisma.ficheInventaire.findMany({
        where: { tenantId, campagneId, immobilisationId: { not: null } },
        select: { immobilisationId: true },
      }),
    ]);
    const connues = new Set(dejaFichees.map((f) => f.immobilisationId));
    const aCreer = biens.filter((b) => !connues.has(b.id));
    if (aCreer.length === 0) return { creees: 0, deja: connues.size };

    // Le compte d'imputation du bien est celui contre lequel son écart se
    // mesurera · c'est lui qui porte la valeur d'entrée au bilan. À la date
    // de l'inventaire, un bien non achevé est inscrit à son 2x9
    // (immobilisation-en-cours.ts), jamais à un compte définitif vide.
    await this.prisma.ficheInventaire.createMany({
      data: aCreer.map((b) => ({
        tenantId,
        campagneId,
        compteId: compteInscritALaDate(b, campagne.dateInventaire),
        immobilisationId: b.id,
        designation: b.numeroInventaire ? `${b.numeroInventaire} · ${b.designation}` : b.designation,
        uniteMesure: 'unité',
      })),
    });
    return { creees: aCreer.length, deja: connues.size };
  }

  async creerFiche(tenantId: string, campagneId: string, dto: CreerFicheDto) {
    await this.campagneOuverte(tenantId, campagneId, [
      StatutCampagneInventaire.PREPARATION,
      StatutCampagneInventaire.RECENSEMENT,
    ]);
    const compte = await this.prisma.compte.findFirst({ where: { id: dto.compteId, tenantId } });
    if (!compte) throw new NotFoundException('Compte introuvable.');
    if (compte.typeCompte === 'TOTAL') {
      throw new BadRequestException(
        `Le compte ${compte.numero} est un compte Total · il n'a pas de solde propre à rapprocher. Choisir un compte d'imputation.`,
      );
    }
    if (dto.sousCommissionId) await this.sousCommissionDeLaCampagne(tenantId, campagneId, dto.sousCommissionId);
    return this.prisma.ficheInventaire.create({
      data: {
        tenantId,
        campagneId,
        compteId: dto.compteId,
        sousCommissionId: dto.sousCommissionId ?? null,
        designation: dto.designation.trim(),
        emplacement: dto.emplacement?.trim() || null,
        uniteMesure: dto.uniteMesure?.trim() || null,
      },
    });
  }

  /**
   * LA SOUS-COMMISSION D'UNE FICHE EST CELLE DE SA CAMPAGNE (audit final F136)
   * · reçue du client et seulement validée comme identifiant, elle pouvait
   * désigner celle d'une autre campagne, voire d'un autre dossier. Le PV de
   * caisse lit les signataires de SA sous-commission · une fiche rattachée
   * ailleurs serait comptée par des gens qui n'ont pas signé cet inventaire.
   */
  private async sousCommissionDeLaCampagne(tenantId: string, campagneId: string, sousCommissionId: string) {
    const sc = await this.prisma.sousCommissionInventaire.findFirst({
      where: { id: sousCommissionId, tenantId, campagneId },
      select: { id: true },
    });
    if (!sc) throw new BadRequestException("Cette sous-commission n'appartient pas à la campagne de la fiche.");
  }

  /** Étapes 2 et 3 · le comptage, puis la valorisation avec sa pièce. */
  async saisirComptage(tenantId: string, ficheId: string, dto: SaisirComptageDto) {
    const fiche = await this.prisma.ficheInventaire.findFirst({
      where: { id: ficheId, tenantId },
      include: { campagne: true },
    });
    if (!fiche) throw new NotFoundException('Fiche introuvable.');
    if (
      fiche.campagne.statut === StatutCampagneInventaire.ARBITRAGE ||
      fiche.campagne.statut === StatutCampagneInventaire.CLOTUREE
    ) {
      throw new ForbiddenException(
        "Les écarts de cette campagne sont déjà figés · rouvrir le comptage après le rapprochement ferait porter l'arbitrage sur un chiffre périmé.",
      );
    }
    if (dto.sousCommissionId) await this.sousCommissionDeLaCampagne(tenantId, fiche.campagneId, dto.sousCommissionId);
    const miseAJour = await this.prisma.ficheInventaire.update({
      where: { id: ficheId },
      data: {
        ...(dto.quantiteComptee !== undefined ? { quantiteComptee: dto.quantiteComptee } : {}),
        ...(dto.valeurInventaire !== undefined ? { valeurInventaire: dto.valeurInventaire } : {}),
        ...(dto.referencePiece !== undefined ? { referencePiece: dto.referencePiece?.trim() || null } : {}),
        ...(dto.emplacement !== undefined ? { emplacement: dto.emplacement?.trim() || null } : {}),
        ...(dto.sousCommissionId !== undefined ? { sousCommissionId: dto.sousCommissionId } : {}),
      },
    });
    // UN COMPTAGE SAISI OUVRE LE RECENSEMENT (audit final F134) · le statut
    // n'était jamais atteint, et le PV, qui se signe après le comptage et
    // avant le rapprochement, ne pouvait s'établir qu'une fois les écarts
    // figés. Seul un chiffre compté ou valorisé le fait · un emplacement ou
    // une pièce corrigés ne sont pas un comptage.
    if (dto.quantiteComptee !== undefined || dto.valeurInventaire !== undefined) {
      await this.entrerEnRecensement(tenantId, fiche.campagneId);
    }
    return miseAJour;
  }

  /** PRÉPARATION → RECENSEMENT, une fois, sur la seule campagne encore en préparation. */
  private async entrerEnRecensement(tenantId: string, campagneId: string) {
    await this.prisma.campagneInventaire.updateMany({
      where: { id: campagneId, tenantId, statut: StatutCampagneInventaire.PREPARATION },
      data: { statut: StatutCampagneInventaire.RECENSEMENT },
    });
  }

  /**
   * RETIRER UNE FICHE (audit final F135) · le refus de rapprocher dit « les
   * valoriser ou les supprimer », et aucune route ne supprimait. La valoriser
   * à zéro pour passer aurait FABRIQUÉ un manquant. Elle se retire tant que
   * rien n'est figé · après le rapprochement, l'écart par compte porte son
   * nombre de fiches, et la retirer le ferait mentir.
   */
  async supprimerFiche(tenantId: string, ficheId: string) {
    const fiche = await this.prisma.ficheInventaire.findFirst({
      where: { id: ficheId, tenantId },
      include: { campagne: { select: { statut: true } } },
    });
    if (!fiche) throw new NotFoundException('Fiche introuvable.');
    if (
      fiche.campagne.statut !== StatutCampagneInventaire.PREPARATION &&
      fiche.campagne.statut !== StatutCampagneInventaire.RECENSEMENT
    ) {
      throw new ForbiddenException(
        "Les écarts de cette campagne sont déjà figés · retirer une fiche après le rapprochement ferait mentir l'écart du compte, qui en porte le nombre.",
      );
    }
    await this.prisma.ficheInventaire.deleteMany({ where: { id: fiche.id, tenantId } });
    return { supprimee: true };
  }

  /**
   * ÉTAPE 4 · LE RAPPROCHEMENT, la fonction qui n'existait nulle part.
   *
   * « Comparer les chiffres d'inventaire obtenus par l'évaluation avec les
   * données comptables (solde de chaque compte sur la balance PROVISOIRE de
   * vérification, AVANT les écritures d'inventaire). »
   *
   * TROIS CHOIX DE MÉTHODE, chacun avec sa raison :
   *
   *  1. LE SOLDE EST FIGÉ, pas relu à chaque affichage. Une écriture de
   *     redressement passée après le rapprochement déplacerait la cible :
   *     l'écart se refermerait tout seul et l'arbitrage porterait sur un
   *     chiffre que personne n'a jamais vu.
   *  2. LA BALANCE EST CELLE DU LIVRE-JOURNAL, ET LE BROUILLARD DES COMPTES
   *     COMPTÉS BLOQUE. « Provisoire », chez le CPCC, veut dire AVANT les
   *     écritures d'inventaire, pas « brouillard compris ». Le solde est figé
   *     (choix 1) et l'écart fonde un mali passé en écriture : pris sur une
   *     écriture au brouillard que personne n'a validée, et qui peut encore
   *     être modifiée ou supprimée, il ferait constater un manquant contre un
   *     chiffre qui n'est jamais entré en comptabilité (AUDCIF art. 22, 2° ·
   *     audit du serveur du 2026-09-27, F6). L'ancienne lecture « brouillard
   *     compris » répondait à un vrai risque, un écart fabriqué que la
   *     validation du lendemain aurait effacé ; il est tenu ici par un REFUS
   *     nommé plutôt que par une lecture du provisoire · on valide, puis on
   *     rapproche.
   *  3. UNE FICHE NON VALORISÉE BLOQUE. Traiter une valeur d'inventaire
   *     absente comme un zéro transformerait « pas encore compté » en
   *     « manquant total », et le manquant serait à la charge de
   *     l'entreprise (CPCC, étape 5).
   */
  async rapprocher(tenantId: string, campagneId: string) {
    const campagne = await this.campagneOuverte(tenantId, campagneId, [
      StatutCampagneInventaire.PREPARATION,
      StatutCampagneInventaire.RECENSEMENT,
    ]);
    const fiches = await this.prisma.ficheInventaire.findMany({
      where: { tenantId, campagneId },
      include: { compte: { select: { numero: true, intitule: true } } },
    });
    if (fiches.length === 0) throw new BadRequestException('Aucune fiche à rapprocher.');

    const nonValorisees = fiches.filter((f) => f.valeurInventaire === null);
    if (nonValorisees.length > 0) {
      throw new BadRequestException(
        `${nonValorisees.length} fiche(s) sans valeur d'inventaire · les valoriser, ou retirer celles qui n'ont pas lieu d'être, avant de rapprocher. ` +
          "Une fiche non valorisée comptée pour zéro produirait un manquant que personne n'a constaté.",
      );
    }

    const lignesAuBrouillard = await this.prisma.ligneEcriture.count({
      where: {
        compteId: { in: [...new Set(fiches.map((f) => f.compteId))] },
        ecriture: { tenantId, exerciceId: campagne.exerciceId, statut: StatutEcriture.BROUILLARD },
      },
    });
    if (lignesAuBrouillard > 0) {
      throw new BadRequestException(
        `${lignesAuBrouillard} ligne(s) au brouillard sur les comptes inventoriés · les valider ou les supprimer avant de rapprocher. ` +
          "L'écart se mesure contre le livre-journal, et un solde figé sur du provisoire ferait constater un écart que personne n'a enregistré.",
      );
    }

    const { lignes } = await this.ecritures.balance(tenantId, campagne.exerciceId, false);
    const soldeParCompte = new Map(lignes.map((l) => [l.compteId, l.solde]));

    const parCompte = new Map<string, { valeur: number; nombre: number }>();
    for (const f of fiches) {
      const cumul = parCompte.get(f.compteId) ?? { valeur: 0, nombre: 0 };
      cumul.valeur += Number(f.valeurInventaire);
      cumul.nombre += 1;
      parCompte.set(f.compteId, cumul);
    }

    const maintenant = new Date();
    await transactionJournalisee(this.prisma, async (tx) => {
      await tx.ecartInventaire.deleteMany({ where: { tenantId, campagneId } });
      for (const [compteId, { valeur, nombre }] of parCompte.entries()) {
        // Un compte d'actif a un solde débiteur ; la balance le rend positif.
        // Un compte de passif (dettes comptées à l'inventaire documentaire)
        // le rend négatif. On compare donc la valeur d'inventaire à la
        // VALEUR ABSOLUE du solde, et l'écart garde le sens « inventaire
        // moins comptabilité » que le CPCC lui donne.
        const solde = Math.abs(soldeParCompte.get(compteId) ?? 0);
        await tx.ecartInventaire.create({
          data: {
            tenantId,
            campagneId,
            compteId,
            valeurInventaire: valeur,
            soldeComptable: solde,
            ecart: Number((valeur - solde).toFixed(2)),
            nombreFiches: nombre,
            rapprocheLe: maintenant,
          },
        });
      }
      await tx.campagneInventaire.update({
        where: { id: campagneId },
        data: { statut: StatutCampagneInventaire.ARBITRAGE },
      });
    });
    return this.consulter(tenantId, campagneId);
  }

  /**
   * ÉTAPE 5 · LA DÉCISION, et les deux sens que le CPCC lui donne.
   *
   * « Les écarts négatifs sont à la charge de l'entreprise et le rôle de la
   * sous-commission consistera à déterminer le RESPONSABLE de chaque type
   * d'écart relevé. Pour les écarts positifs, le responsable concerné sera
   * INVITÉ À S'EXPLIQUER devant la sous-commission. »
   *
   * D'où le refus le plus utile de ce service : on ne classe pas un écart
   * sans dire QUI en répond ou POURQUOI il n'est pas redressé. Un écart
   * arbitré sans motif est un écart effacé, et c'est exactement ce qu'un
   * réviseur cherche.
   */
  async arbitrer(tenantId: string, ecartId: string, userId: string, dto: ArbitrerEcartDto) {
    const ecart = await this.prisma.ecartInventaire.findFirst({
      where: { id: ecartId, tenantId },
      include: { campagne: true, compte: { select: { numero: true, intitule: true } } },
    });
    if (!ecart) throw new NotFoundException('Écart introuvable.');
    if (ecart.campagne.statut !== StatutCampagneInventaire.ARBITRAGE) {
      throw new ForbiddenException("L'arbitrage n'est ouvert qu'après le rapprochement et avant la clôture de la campagne.");
    }

    // Le mode de tenue des stocks décide du motif sur un compte de classe 3 ·
    // un boni d'inventaire n'existe qu'en inventaire permanent.
    const { methodeInventaireStocks: modeStocks } = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { methodeInventaireStocks: true },
    });
    const montant = Number(ecart.ecart);
    if (dto.decision === DecisionEcartInventaire.A_REDRESSER && montant > 0) {
      throw new BadRequestException(
        `L'écart du compte ${ecart.compte.numero} est un EXCÉDENT (+${montant}) · il ne se redresse pas. ` +
          InventaireService.motifRefusExcedent(ecart.compte.numero, modeStocks) +
          ' Le classer en EXCEDENT_NON_COMPTABILISE, ou le renvoyer à la commission principale.',
      );
    }
    if (dto.decision === DecisionEcartInventaire.EXCEDENT_NON_COMPTABILISE && montant < 0) {
      throw new BadRequestException(
        `L'écart du compte ${ecart.compte.numero} est un MANQUANT (${montant}) · il n'y a pas d'excédent à laisser au bilan.`,
      );
    }
    if (dto.decision === DecisionEcartInventaire.A_REDRESSER && !dto.responsable?.trim()) {
      throw new BadRequestException(
        "Un écart négatif est à la charge de l'entité : la sous-commission doit désigner le responsable (CPCC, étape 5).",
      );
    }
    if (dto.decision !== DecisionEcartInventaire.A_REDRESSER && !dto.explication?.trim()) {
      throw new BadRequestException(
        "Un écart non redressé doit porter son explication · sans elle, il est indiscernable d'un écart effacé.",
      );
    }

    return this.prisma.ecartInventaire.update({
      where: { id: ecartId },
      data: {
        decision: dto.decision,
        responsable: dto.responsable?.trim() || null,
        explication: dto.explication?.trim() || null,
        arbitreLe: new Date(),
        arbitrePar: userId,
      },
    });
  }

  /**
   * ÉTAPE 6 · CE QUE LE MODULE PROPOSE, ET CE QU'IL REFUSE DE PROPOSER.
   *
   * Il rend le SQUELETTE de l'écriture de redressement d'un manquant : le
   * compte inventorié au crédit du montant manquant, et la contrepartie
   * LAISSÉE VIDE. Le référentiel ne dit nulle part quel compte de charge
   * reçoit un manquant d'inventaire · cela dépend de sa nature (perte sur
   * stock, mise au rebut, vol constaté, erreur d'imputation), et c'est
   * précisément ce que la commission a tranché à l'étape 5.
   *
   * Il ne propose RIEN sur un excédent, art. 43. Une écriture d'excédent
   * s'équilibre parfaitement, boucle la balance, et gonfle le résultat de la
   * plus-value latente que le texte interdit d'inscrire.
   */
  async propositionRedressement(tenantId: string, ecartId: string) {
    const ecart = await this.prisma.ecartInventaire.findFirst({
      where: { id: ecartId, tenantId },
      include: { compte: { select: { numero: true, intitule: true } } },
    });
    if (!ecart) throw new NotFoundException('Écart introuvable.');
    const { methodeInventaireStocks: modeStocks } = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { methodeInventaireStocks: true },
    });
    const montant = Number(ecart.ecart);
    if (montant >= 0) {
      return {
        proposable: false as const,
        motif:
          "Aucune écriture proposée : l'écart n'est pas un manquant. AUDCIF art. 43 · une valeur d'inventaire supérieure à la valeur d'entrée laisse cette dernière au bilan, elle ne devient pas un produit.",
      };
    }
    if (ecart.decision !== DecisionEcartInventaire.A_REDRESSER) {
      return {
        proposable: false as const,
        motif:
          "L'écart n'a pas été arbitré en « à redresser » · la comptabilisation suit la décision de la sous-commission (CPCC, étape 6), elle ne la précède pas.",
      };
    }
    return {
      proposable: true as const,
      lignes: [
        {
          compte: null,
          libelle: `Manquant d'inventaire · ${ecart.compte.numero} ${ecart.compte.intitule}`,
          sens: 'DEBIT' as const,
          montant: Math.abs(montant),
          note: InventaireService.noteContrepartieManquant(ecart.compte.numero, modeStocks),
        },
        {
          compte: ecart.compte.numero,
          libelle: `Manquant d'inventaire · ${ecart.compte.intitule}`,
          sens: 'CREDIT' as const,
          montant: Math.abs(montant),
        },
      ],
      responsable: ecart.responsable,
    };
  }

  /**
   * ÉTAPE 6, SECONDE MOITIÉ · l'écriture de redressement une fois passée.
   *
   * Audit du serveur de 2026-09, I2 · `EcartInventaire.ecritureId` n'était
   * écrit nulle part. Le module ne POSTE jamais le redressement (la
   * contrepartie est la décision de la sous-commission, et aucun texte ne la
   * nomme) : le comptable le passe au journal, et le lien ne peut naître que
   * de ce geste-ci, qui désigne la pièce après coup. Sans lui, le registre ne
   * pouvait pas dire quels manquants étaient passés, et la pièce se
   * supprimait au journal sans que rien ne la retienne.
   *
   * CE QUI EST VÉRIFIÉ, ET CE QUI NE L'EST PAS. L'écart doit être arbitré
   * « à redresser » (un manquant, donc) et l'écriture, de ce dossier et de
   * l'exercice de la campagne, doit CRÉDITER le compte inventorié du montant
   * manquant · la seule ligne que le module propose. Sa contrepartie n'est
   * PAS contrôlée, le module l'ayant laissée vide à dessein : le logiciel qui
   * refuserait une contrepartie refuserait une décision qu'il ne connaît pas.
   */
  private async ecartARattacher(tenantId: string, ecartId: string) {
    const ecart = await this.prisma.ecartInventaire.findFirst({
      where: { id: ecartId, tenantId },
      include: {
        campagne: { select: { exerciceId: true } },
        compte: { select: { numero: true } },
      },
    });
    if (!ecart) throw new NotFoundException('Écart introuvable.');
    if (ecart.decision !== DecisionEcartInventaire.A_REDRESSER) {
      throw new BadRequestException(
        "Seul un écart arbitré « à redresser » porte une écriture de redressement · l'arbitrage de la " +
          'sous-commission précède la comptabilisation (CPCC, étape 6), et un excédent ne se comptabilise ' +
          "pas d'office (AUDCIF art. 43).",
      );
    }
    const attendue: LigneAttendue = { compte: ecart.compte.numero, sens: 'CREDIT', montant: Math.abs(Number(ecart.ecart)) };
    return { ecart, attendue };
  }

  /** Les écritures de l'exercice qui créditent le compte du montant manquant. */
  async ecrituresCandidatesRedressement(tenantId: string, ecartId: string) {
    const { ecart, attendue } = await this.ecartARattacher(tenantId, ecartId);
    const lignes = await this.prisma.ligneEcriture.findMany({
      where: {
        ecriture: { tenantId, exerciceId: ecart.campagne.exerciceId, estGenereeParCloture: false },
        // Même lecture du compte que `lignesManquantes` (le compte ou ses
        // subdivisions) · le sélecteur ne propose que ce que le rattachement
        // accepte.
        compte: { numero: { startsWith: attendue.compte } },
        credit: attendue.montant,
      },
      select: { ecritureId: true },
      take: 200,
    });
    const ids = [...new Set(lignes.map((l) => l.ecritureId))];
    if (ids.length === 0) return [];
    const [ecritures, prises] = await Promise.all([
      this.prisma.ecriture.findMany({
        where: { tenantId, id: { in: ids } },
        orderBy: [{ date: 'desc' }],
        select: { id: true, date: true, numeroPiece: true, libelle: true, statut: true },
      }),
      this.prisma.ecartInventaire.findMany({
        where: { tenantId, compteId: ecart.compteId, ecritureId: { in: ids } },
        select: { ecritureId: true },
      }),
    ]);
    const dejaPrises = new Set(prises.map((p) => p.ecritureId));
    return ecritures
      .filter((e) => !dejaPrises.has(e.id))
      .map((e) => ({ ...e, date: e.date.toISOString().slice(0, 10) }));
  }

  /**
   * Pose le lien, sur une colonne encore libre (`updateMany` conditionné à
   * null, comme les marqueurs posés après `creer`). Aucune compensation · le
   * geste ne crée aucune écriture, il en désigne une qui reste au journal.
   *
   * UNE PIÈCE PEUT REDRESSER PLUSIEURS COMPTES d'une même campagne (tous les
   * manquants en une écriture), mais pas deux fois le MÊME compte · sa ligne
   * de crédit ne justifie qu'un seul manquant.
   */
  async rattacherEcritureRedressement(tenantId: string, ecartId: string, ecritureId: string) {
    const { ecart, attendue } = await this.ecartARattacher(tenantId, ecartId);
    if (ecart.ecritureId !== null) {
      throw new BadRequestException(
        "Une écriture de redressement est déjà rattachée à cet écart · détachez-la d'abord.",
      );
    }
    const ecriture = await this.prisma.ecriture.findFirst({
      where: { id: ecritureId, tenantId },
      select: {
        exerciceId: true,
        estGenereeParCloture: true,
        lignes: { select: { debit: true, credit: true, compte: { select: { numero: true } } } },
      },
    });
    if (!ecriture) throw new NotFoundException("L'écriture indiquée n'existe pas dans ce dossier.");
    if (ecriture.exerciceId !== ecart.campagne.exerciceId || ecriture.estGenereeParCloture) {
      throw new BadRequestException(
        "L'écriture de redressement appartient à l'exercice inventorié, et ce n'est pas une écriture de " +
          'clôture · le manquant constaté à la clôture grève le résultat de cet exercice-là (AUDCIF art. 42).',
      );
    }
    const manquantes = lignesManquantes(
      [attendue],
      ecriture.lignes.map((l) => ({ numero: l.compte.numero, debit: Number(l.debit), credit: Number(l.credit) })),
    );
    if (manquantes.length > 0) {
      throw new BadRequestException(
        `Cette écriture ne redresse pas le manquant · il lui manque ${manquantes.map(decrireLigne).join(', ')}. ` +
          'Rattachée quand même, le registre dirait le manquant passé sur une pièce qui passe autre chose.',
      );
    }
    const autre = await this.prisma.ecartInventaire.count({
      where: { tenantId, compteId: ecart.compteId, ecritureId },
    });
    if (autre > 0) {
      throw new BadRequestException(
        `Cette écriture redresse déjà un autre écart du compte ${ecart.compte.numero} · sa ligne de crédit ` +
          'ne justifie pas deux manquants.',
      );
    }
    const { count } = await this.prisma.ecartInventaire.updateMany({
      where: { id: ecartId, tenantId, ecritureId: null },
      data: { ecritureId },
    });
    if (count === 0) {
      throw new BadRequestException("Une écriture vient d'être rattachée à cet écart par une autre demande.");
    }
    return { rattache: true, ecritureId };
  }

  /**
   * Détacher, TANT QUE L'ÉCRITURE EST AU BROUILLARD · une pièce rattachée par
   * erreur resterait sinon bloquée au journal. Validée, elle est entrée au
   * livre-journal (AUDCIF art. 22, 2°) et le lien est la trace du
   * redressement.
   */
  async detacherEcritureRedressement(tenantId: string, ecartId: string) {
    const ecart = await this.prisma.ecartInventaire.findFirst({
      where: { id: ecartId, tenantId },
      select: { ecritureId: true },
    });
    if (!ecart) throw new NotFoundException('Écart introuvable.');
    if (ecart.ecritureId === null) {
      throw new BadRequestException("Aucune écriture de redressement n'est rattachée à cet écart.");
    }
    const ecriture = await this.prisma.ecriture.findFirst({
      where: { id: ecart.ecritureId, tenantId },
      select: { statut: true },
    });
    if (ecriture && ecriture.statut !== StatutEcriture.BROUILLARD) {
      throw new BadRequestException(
        "L'écriture de redressement est validée · elle est entrée au livre-journal (AUDCIF art. 22, 2°), " +
          'et son lien est la trace du redressement. Il ne se défait plus.',
      );
    }
    const { count } = await this.prisma.ecartInventaire.updateMany({
      where: { id: ecartId, tenantId, ecritureId: ecart.ecritureId },
      data: { ecritureId: null },
    });
    if (count === 0) throw new BadRequestException("Le lien a changé entre-temps · rechargez la campagne.");
    return { detache: true };
  }

  /**
   * LE PV D'INVENTAIRE · « L'établissement du PV d'inventaire physique est
   * nécessaire avec signatures de ceux qui ont inventorié ET assisté à cet
   * inventaire » (CPCC, étape 2).
   *
   * Le module REFUSE d'établir un PV sans les deux listes. C'est tout l'objet
   * du document : un PV signé des seuls comptables ne prouve rien, et un PV
   * signé des seuls témoins ne dit pas qui a compté.
   */
  async etablirProcesVerbal(tenantId: string, campagneId: string, userId: string, dto: EtablirProcesVerbalDto) {
    const campagne = await this.campagneOuverte(tenantId, campagneId, [
      StatutCampagneInventaire.RECENSEMENT,
      StatutCampagneInventaire.ARBITRAGE,
    ]);
    const membres = await this.prisma.membreSousCommission.findMany({
      where: { tenantId, sousCommission: { campagneId } },
      select: { role: true },
    });
    const aCompte = membres.some((m) => m.role === RoleMembreInventaire.INVENTORIANT);
    const aAssiste = membres.some((m) => m.role === RoleMembreInventaire.TEMOIN);
    if (!aCompte || !aAssiste) {
      throw new BadRequestException(
        "Le procès-verbal se signe par ceux qui ont inventorié ET par ceux qui ont assisté (CPCC, étape 2). " +
          `Il manque ${!aCompte ? 'un inventoriant' : ''}${!aCompte && !aAssiste ? ' et ' : ''}${!aAssiste ? 'un témoin' : ''}.`,
      );
    }
    return this.prisma.campagneInventaire.update({
      where: { id: campagne.id },
      data: { procesVerbalEtabliLe: dto.dateEtablissement ? new Date(dto.dateEtablissement) : new Date(), procesVerbalPar: userId },
    });
  }

  /**
   * LE PROCÈS-VERBAL DE COMPTAGE D'UNE CAISSE · un par caisse, et un seul.
   *
   * Le PV de la CAMPAGNE porte l'inventaire physique dans son ensemble. Il ne
   * peut pas porter le comptage des espèces : le CPCC demande « A-t-on tenu
   * compte de la caisse SIÈGE, de la caisse AGENCE, de la caisse DE
   * SECOURS ? », trois caisses comptées à trois endroits, chacune par sa
   * sous-commission et chacune à son heure. Un seul PV pour les trois ne dit
   * plus laquelle a été comptée ni par qui.
   *
   * QUATRE REFUS.
   *
   *  1. LA CAISSE EST UN 57. Les deux plans logent la caisse au 57 et nulle
   *     part ailleurs · un PV de comptage d'espèces sur un 52 compterait une
   *     banque, qui ne se compte pas, elle se circularise.
   *  2. LE PV SE SIGNE PAR CEUX QUI ONT COMPTÉ ET PAR CEUX QUI ONT ASSISTÉ,
   *     et ce sont les membres de SA sous-commission, pas ceux de la campagne
   *     (CPCC, étape 2 · « signatures de ceux qui ont inventorié ET assisté à
   *     cet inventaire »). Le PV de campagne vérifie déjà les deux listes ; les
   *     vérifier à nouveau ici n'est pas une redite, c'est le même refus posé
   *     sur l'opération qu'il concerne.
   *  3. LA VENTILATION PAR COUPURE DOIT ÉGALER LE TOTAL qu'elle détaille.
   *     Sans quoi le détail contredit le montant qu'il est censé justifier, et
   *     c'est le détail qu'on croira.
   *  4. L'ATTESTATION NE S'ÉTABLIT PAS SANS COMPTAGE · le CPCC chaîne les deux
   *     questions (« Le comptage des espèces a-t-il eu lieu au 31 décembre ? »
   *     puis « SI OUI, une attestation a-t-elle été établie ? »).
   *
   * ET LE SOLDE COMPARÉ N'EST PAS SAISI (ligne A10, relevé CPCC C6) · c'est
   * celui du livre-journal à la DATE DU COMPTAGE, lu par le serveur et figé ;
   * compté après la clôture, le PV fige aussi sa reconstitution vers la
   * clôture. Un solde non calculable (brouillard sur la caisse, exercice
   * suivant non ouvert, à-nouveau provisoire, date hors de l'exercice ou
   * future) REFUSE le PV avec son motif, jamais à zéro · voir
   * `solde-caisse-au-comptage.ts`.
   *
   * ET CE QUE LE MODULE NE FAIT PAS : il ne dit pas ce que l'attestation
   * contient. Aucune source lue ne la définit · le module en enregistre
   * l'existence, sa date et son signataire, et laisse le document au cabinet.
   * Inventer ses mentions produirait un modèle qui aurait l'air officiel sans
   * l'être.
   */
  async etablirPvCaisse(tenantId: string, campagneId: string, userId: string, dto: EtablirPvCaisseDto) {
    // Compter une caisse EST recenser (audit final F134) · une campagne qui ne
    // porte que des caisses n'a aucune fiche dont le comptage l'aurait
    // ouverte. Admise en préparation, elle passe au recensement ci-dessous.
    const campagne = await this.campagneOuverte(tenantId, campagneId, [
      StatutCampagneInventaire.PREPARATION,
      StatutCampagneInventaire.RECENSEMENT,
      StatutCampagneInventaire.ARBITRAGE,
    ]);

    const compte = await this.prisma.compte.findFirst({ where: { id: dto.compteId, tenantId } });
    if (!compte) throw new NotFoundException('Compte introuvable pour ce dossier.');
    if (!compte.numero.startsWith('57')) {
      throw new BadRequestException(
        `Le compte ${compte.numero} n'est pas une caisse · les deux plans logent la caisse au 57 et nulle part ` +
          "ailleurs. Un solde de banque ne se compte pas, il se confirme auprès de la banque (circularisation).",
      );
    }

    const sousCommission = await this.prisma.sousCommissionInventaire.findFirst({
      where: { id: dto.sousCommissionId, tenantId, campagneId },
      include: { membres: { select: { role: true } } },
    });
    if (!sousCommission) {
      throw new NotFoundException('Sous-commission introuvable sur cette campagne.');
    }
    const manque = InventaireService.signaturesManquantes(sousCommission.membres);
    if (manque) {
      throw new BadRequestException(
        `Le procès-verbal de comptage se signe par ceux qui ont inventorié ET par ceux qui ont assisté ` +
          `(CPCC, étape 2). Dans la sous-commission « ${sousCommission.nom} », il manque ${manque}.`,
      );
    }

    const coupures = dto.coupures ?? [];
    const totalCoupures = coupures.reduce((t, c) => t + c.valeurUnitaire * c.nombre, 0);
    if (coupures.length > 0 && Math.abs(totalCoupures - dto.especesComptees) > 0.005) {
      throw new BadRequestException(
        `La ventilation par coupure totalise ${totalCoupures.toFixed(2)} alors que le comptage annonce ` +
          `${dto.especesComptees.toFixed(2)}. Le détail doit égaler le montant qu'il justifie · autrement c'est ` +
          'le détail que le lecteur croira, et le total sera faux sans que rien ne le dise.',
      );
    }

    if (dto.attestationEtablieLe && !dto.attestationPar?.trim()) {
      throw new BadRequestException(
        "Une attestation est signée par quelqu'un · nommez-le. Le CPCC demande si « une attestation a-t-elle été " +
          "établie », et une attestation sans signataire n'atteste de rien.",
      );
    }

    // LE SOLDE COMPARÉ EST LU PAR LE SERVEUR, jamais reçu de l'écran (ligne
    // A10). Saisi à la main, il laissait figer n'importe quel chiffre, et le
    // solde proposé était celui de l'exercice entier, brouillard compris · une
    // caisse comptée le 10 janvier se comparait au 31 décembre, et chaque
    // mouvement de janvier devenait un écart. Voir `solde-caisse-au-comptage.ts`.
    // LECTURE ET CRÉATION DANS UNE SEULE TRANSACTION (b) · le PV ne naît pas
    // si la lecture échoue, et rien d'une lecture faite ailleurs n'est figé.
    // Ce que la transaction NE GARANTIT PAS · en lecture validée (le niveau
    // par défaut de PostgreSQL), une écriture validée par un autre poste
    // pendant la lecture peut ne pas avoir été lue. `etabliLe` est donc posé
    // par l'application JUSTE APRÈS la lecture (jamais `now()`, l'heure du
    // DÉBUT de la transaction), et une pièce validée dans cet intervalle
    // n'est pas tue · relue par `mouvementsReconstitution`, elle fait dire
    // « ne concorde pas » au PV.
    const exercice = await this.prisma.exercice.findFirst({
      where: { id: campagne.exerciceId, tenantId },
      select: { id: true, dateDebut: true, dateFin: true },
    });
    if (!exercice) throw new NotFoundException("Exercice de la campagne introuvable.");
    const dateComptage = InventaireService.lireDateComptage(dto.dateComptage);

    try {
      return await transactionJournalisee(this.prisma, async (tx) => {
        const lecture = await lireSoldeCaisseAuComptage(tx, tenantId, compte.id, exercice, dateComptage);
        if (!lecture.lisible) throw new BadRequestException(lecture.motif);
        const etabliLe = new Date();
        const deviseLue = lecture.unite.devise?.id ?? null;
        if (dto.modeComparaison !== lecture.unite.mode || (dto.deviseId ?? null) !== deviseLue) {
          throw new ConflictException(
            "La caisse a changé depuis l'aperçu, relisez · l'aperçu annonçait une comparaison " +
              `${InventaireService.unitePourMessage(dto.modeComparaison)}, le livre-journal en rend une ` +
              `${InventaireService.unitePourMessage(lecture.unite.mode, lecture.unite.devise?.code)}. Les espèces ` +
              "comptées s'entendent dans l'unité de l'aperçu · figées contre un solde d'une autre unité, l'écart serait faux.",
          );
        }
        const r = lecture.reconstitution;
        // Espèces, écart et coupures sont dans l'UNITÉ du PV · la devise de la
        // caisse quand toutes ses lignes la portent (B1).
        const ecart = Number((dto.especesComptees - lecture.soldeComptable).toFixed(2));
        const pv = await tx.procesVerbalComptageCaisse.create({
          data: {
            tenantId,
            campagneId: campagne.id,
            compteId: dto.compteId,
            sousCommissionId: dto.sousCommissionId,
            dateComptage,
            heureComptage: dto.heureComptage?.trim() || null,
            soldeComptableFige: lecture.soldeComptable,
            modeComparaison: lecture.unite.mode,
            deviseId: lecture.unite.devise?.id ?? null,
            // Ensemble, ou aucun · un comptage au plus tard à la clôture n'a
            // rien à reconstituer.
            soldeALaCloture: r ? r.soldeALaCloture : null,
            mouvementsValeurAvantCloture: r ? r.mouvementsValeurAvantCloture : null,
            encaissementsPosterieurs: r ? r.encaissementsPosterieurs : null,
            decaissementsPosterieurs: r ? r.decaissementsPosterieurs : null,
            mouvementsPosterieurs: r ? r.mouvementsPosterieurs : null,
            especesComptees: dto.especesComptees,
            ecart,
            attestationEtablieLe: dto.attestationEtablieLe ? new Date(dto.attestationEtablieLe) : null,
            attestationPar: dto.attestationPar?.trim() || null,
            observations: dto.observations?.trim() || null,
            etabliPar: userId,
            etabliLe,
            coupures: {
              create: coupures.map((c) => ({
                tenantId,
                valeurUnitaire: c.valeurUnitaire,
                nombre: c.nombre,
              })),
            },
          },
          include: {
            coupures: true,
            compte: { select: { numero: true, intitule: true } },
            devise: { select: { code: true } },
          },
        });
        await tx.campagneInventaire.updateMany({
          where: { id: campagne.id, tenantId, statut: StatutCampagneInventaire.PREPARATION },
          data: { statut: StatutCampagneInventaire.RECENSEMENT },
        });
        return pv;
      });
    } catch (e) {
      // Index unique [campagneId, compteId] · le PV d'une caisse est unique
      // et définitif ; un second envoi ne doit pas sortir en 500.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(
          'Un procès-verbal existe déjà pour cette caisse dans cette campagne · il est unique et définitif.',
        );
      }
      throw e;
    }
  }

  /** `dateComptage` · une date civile AAAA-MM-JJ, sinon 400 nommé (e). */
  static lireDateComptage(texte: string): Date {
    if (!FORMAT_DATE_COMPTAGE.test(texte ?? '') || Number.isNaN(new Date(`${texte}T00:00:00.000Z`).getTime())) {
      throw new BadRequestException('La date du comptage s’écrit AAAA-MM-JJ, sans heure ni fuseau.');
    }
    return new Date(`${texte}T00:00:00.000Z`);
  }

  /**
   * L'APERÇU AVANT DE FIGER (a) · ce que le PV figera pour cette caisse à
   * cette date (solde, unité, reconstitution), ou le motif du refus · rien
   * n'est écrit. Le PV est unique et définitif, le cabinet voit le chiffre
   * avant de signer.
   */
  async apercuPvCaisse(tenantId: string, campagneId: string, compteId: string, dateComptageTexte: string) {
    const campagne = await this.prisma.campagneInventaire.findFirst({
      where: { id: campagneId, tenantId },
      select: { exerciceId: true },
    });
    if (!campagne) throw new NotFoundException("Campagne d'inventaire introuvable.");
    const compte = await this.prisma.compte.findFirst({
      where: { id: compteId, tenantId },
      select: { id: true, numero: true },
    });
    if (!compte) throw new NotFoundException('Compte introuvable pour ce dossier.');
    if (!compte.numero.startsWith('57')) throw new BadRequestException(`Le compte ${compte.numero} n'est pas une caisse.`);
    const exercice = await this.prisma.exercice.findFirst({
      where: { id: campagne.exerciceId, tenantId },
      select: { id: true, dateDebut: true, dateFin: true },
    });
    if (!exercice) throw new NotFoundException("Exercice de la campagne introuvable.");
    const dateComptage = InventaireService.lireDateComptage(dateComptageTexte);
    const lecture = await lireSoldeCaisseAuComptage(this.prisma, tenantId, compte.id, exercice, dateComptage);
    if (!lecture.lisible) return { lisible: false as const, motif: lecture.motif };
    const r = lecture.reconstitution;
    return {
      lisible: true as const,
      soldeComptable: lecture.soldeComptable,
      modeComparaison: lecture.unite.mode,
      // Renvoyée avec le PV · le serveur refuse en 409 si l'unité a changé.
      deviseId: lecture.unite.devise?.id ?? null,
      devise: lecture.unite.devise?.code ?? null,
      dateCloture: exercice.dateFin,
      reconstitution: r,
      mentions: mentionsDuPv({
        dateComptage,
        dateCloture: exercice.dateFin,
        mode: lecture.unite.mode,
        soldeComptable: lecture.soldeComptable,
        soldeALaCloture: r ? r.soldeALaCloture : null,
        mouvementsValeurAvantCloture: r ? r.mouvementsValeurAvantCloture : null,
        especesReconstituees: null,
      }),
    };
  }

  /**
   * Ce qui manque aux signatures d'une sous-commission · null quand rien ne
   * manque. CPCC, étape 2 : le PV se signe par « ceux qui ont inventorié ET
   * assisté ». Un PV signé des seuls comptables ne prouve rien ; un PV signé
   * des seuls témoins ne dit pas qui a compté.
   */
  static signaturesManquantes(membres: { role: RoleMembreInventaire }[]): string | null {
    const aCompte = membres.some((m) => m.role === RoleMembreInventaire.INVENTORIANT);
    const aAssiste = membres.some((m) => m.role === RoleMembreInventaire.TEMOIN);
    if (aCompte && aAssiste) return null;
    if (!aCompte && !aAssiste) return 'un inventoriant et un témoin';
    return aCompte ? 'un témoin' : 'un inventoriant';
  }

  /**
   * LES CAISSES QUI N'ONT PAS ÉTÉ COMPTÉES · la question composite du CPCC,
   * rendue mécanique.
   *
   * « A-t-on tenu compte de la caisse siège, de la caisse agence, de la caisse
   * de secours ? » se répond par un « oui » global sur une checklist, et ce
   * « oui » ne dit rien de la caisse qu'on a oubliée. Ici la liste des comptes
   * 57 du dossier est confrontée aux PV établis, un par un.
   *
   * LES CAISSES À SOLDE NUL NE SONT PAS RÉCLAMÉES · une caisse fermée n'a rien
   * à compter, et l'exiger ferait du bruit sur chaque dossier qui a soldé une
   * caisse d'agence. C'est un choix, et il est ici plutôt que caché.
   */
  async caissesNonComptees(tenantId: string, campagneId: string) {
    const campagne = await this.prisma.campagneInventaire.findFirst({
      where: { id: campagneId, tenantId },
      select: { id: true, exerciceId: true },
    });
    if (!campagne) throw new NotFoundException('Campagne introuvable.');

    const lignes = await this.prisma.ligneEcriture.findMany({
      where: {
        compte: { tenantId, numero: { startsWith: '57' } },
        ecriture: { tenantId, exerciceId: campagne.exerciceId },
      },
      select: { debit: true, credit: true, compte: { select: { id: true, numero: true, intitule: true } } },
    });
    const soldes = new Map<string, { numero: string; intitule: string; solde: number }>();
    for (const l of lignes) {
      const acc = soldes.get(l.compte.id) ?? { numero: l.compte.numero, intitule: l.compte.intitule, solde: 0 };
      acc.solde += Number(l.debit) - Number(l.credit);
      soldes.set(l.compte.id, acc);
    }
    const pv = await this.prisma.procesVerbalComptageCaisse.findMany({
      where: { tenantId, campagneId },
      select: { compteId: true },
    });
    const comptees = new Set(pv.map((p) => p.compteId));

    return [...soldes.entries()]
      .filter(([id, v]) => Math.abs(v.solde) > 0.005 && !comptees.has(id))
      .map(([compteId, v]) => ({ compteId, numero: v.numero, intitule: v.intitule, solde: Number(v.solde.toFixed(2)) }))
      .sort((a, b) => a.numero.localeCompare(b.numero));
  }

  /**
   * CLÔTURE · plus rien ne bouge. Refusée tant qu'un écart n'est pas arbitré :
   * un écart laissé sans décision est la seule chose que l'étape 5 interdit,
   * et c'est aussi celle qui se perd le plus facilement.
   */
  async clore(tenantId: string, campagneId: string, userId: string) {
    await this.campagneOuverte(tenantId, campagneId, [StatutCampagneInventaire.ARBITRAGE]);
    const enSuspens = await this.prisma.ecartInventaire.count({
      where: { tenantId, campagneId, decision: null },
    });
    if (enSuspens > 0) {
      throw new ForbiddenException(
        `${enSuspens} écart(s) sans décision · la sous-commission doit trancher chacun avant la clôture (CPCC, étape 5).`,
      );
    }
    const caissesOubliees = await this.caissesNonComptees(tenantId, campagneId);
    if (caissesOubliees.length > 0) {
      throw new ForbiddenException(
        `${caissesOubliees.length} caisse(s) à solde non nul sans procès-verbal de comptage ` +
          `(${caissesOubliees.map((c) => c.numero).join(', ')}). Le CPCC demande « a-t-on tenu compte de la ` +
          'caisse siège, de la caisse agence, de la caisse de secours ? » · un « oui » global ne dit rien de ' +
          "celle qu'on a oubliée, et une caisse non comptée à la clôture ne se recompte plus jamais.",
      );
    }
    return this.prisma.campagneInventaire.update({
      where: { id: campagneId },
      data: { statut: StatutCampagneInventaire.CLOTUREE, clotureeLe: new Date(), clotureePar: userId },
    });
  }

  async lister(tenantId: string, exerciceId?: string) {
    return this.prisma.campagneInventaire.findMany({
      where: { tenantId, ...(exerciceId ? { exerciceId } : {}) },
      orderBy: { dateInventaire: 'desc' },
      include: { _count: { select: { fiches: true, ecarts: true, sousCommissions: true } } },
    });
  }

  async consulter(tenantId: string, campagneId: string) {
    const campagne = await this.prisma.campagneInventaire.findFirst({
      where: { id: campagneId, tenantId },
      include: {
        exercice: { select: { dateFin: true } },
        pvComptageCaisse: {
          include: {
            compte: { select: { numero: true, intitule: true } },
            coupures: true,
            devise: { select: { code: true } },
          },
          orderBy: { dateComptage: 'asc' },
        },
        sousCommissions: { include: { membres: true }, orderBy: { nom: 'asc' } },
        fiches: {
          include: { compte: { select: { numero: true, intitule: true } } },
          orderBy: { designation: 'asc' },
        },
        ecarts: {
          include: { compte: { select: { numero: true, intitule: true } } },
          orderBy: { compte: { numero: 'asc' } },
        },
      },
    });
    if (!campagne) throw new NotFoundException("Campagne d'inventaire introuvable.");
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { referentiel: true },
    });
    const { exercice, pvComptageCaisse, ...reste } = campagne;
    return {
      ...reste,
      pvComptageCaisse: pvComptageCaisse.map((pv) => InventaireService.presenterPvCaisse(pv, exercice.dateFin)),
      sanction: InventaireService.sanctionApplicable(tenant.referentiel),
    };
  }

  /**
   * Un PV de caisse tel que l'écran le montre · la reconstitution FIGÉE, les
   * espèces existant à la clôture qu'elle reconstitue, l'unité de la
   * comparaison et les MENTIONS que le serveur écrit (`mentionsDuPv`).
   * Compté après la clôture sans reconstitution figée (PV d'avant la ligne
   * A10), le PV le DIT (`reconstitutionManquante`) au lieu de se présenter
   * comme un comptage du 31 décembre.
   */
  static presenterPvCaisse<
    T extends {
      dateComptage: Date;
      especesComptees: unknown;
      soldeComptableFige: unknown;
      soldeALaCloture: unknown;
      mouvementsValeurAvantCloture: unknown;
      encaissementsPosterieurs: unknown;
      decaissementsPosterieurs: unknown;
      mouvementsPosterieurs: number | null;
      modeComparaison: ModeComparaisonCaisse;
      devise?: { code: string } | null;
    },
  >(pv: T, dateCloture: Date) {
    const apres = compteApresLaCloture(pv.dateComptage, dateCloture);
    const figee =
      pv.soldeALaCloture != null && pv.encaissementsPosterieurs != null && pv.decaissementsPosterieurs != null
        ? {
            soldeALaCloture: Number(pv.soldeALaCloture),
            encaissementsPosterieurs: Number(pv.encaissementsPosterieurs),
            decaissementsPosterieurs: Number(pv.decaissementsPosterieurs),
          }
        : null;
    const especesReconstituees = figee ? especesReconstitueesALaCloture(Number(pv.especesComptees), figee) : null;
    return {
      ...pv,
      dateCloture,
      unite: pv.modeComparaison === ModeComparaisonCaisse.DEVISE && pv.devise ? pv.devise.code : null,
      compteApresLaCloture: apres,
      reconstitutionManquante: apres && figee === null,
      especesReconstitueesALaCloture: especesReconstituees,
      mentions: mentionsDuPv({
        dateComptage: pv.dateComptage,
        dateCloture,
        mode: pv.modeComparaison,
        soldeComptable: Number(pv.soldeComptableFige),
        soldeALaCloture: figee ? figee.soldeALaCloture : null,
        mouvementsValeurAvantCloture: pv.mouvementsValeurAvantCloture != null ? Number(pv.mouvementsValeurAvantCloture) : null,
        especesReconstituees,
      }),
    };
  }

  /**
   * LES MOUVEMENTS DE CAISSE ENTRE LA CLÔTURE ET LE COMPTAGE, ligne à ligne ·
   * le chemin de révision de la reconstitution (AUDCIF art. 22, 6° ; art. 16,
   * al. 5). Lus tels que le PV les a lus (`luesParLePv`), dans l'unité du PV,
   * en tranche bornée qui dit son total. Les totaux RELUS (solde à la clôture,
   * opérations à date de valeur antérieure, encaissements, décaissements) sont
   * confrontés aux totaux FIGÉS · une différence se dit (`concorde: false`),
   * elle ne réécrit jamais le PV (c). Ce qui a été validé DEPUIS le PV, daté au
   * plus tard du comptage, est servi à part (`saisiesDepuisLePv`).
   */
  async mouvementsReconstitution(tenantId: string, pvId: string) {
    const pv = await this.prisma.procesVerbalComptageCaisse.findFirst({
      where: { id: pvId, tenantId },
      include: { campagne: { select: { exerciceId: true } }, devise: { select: { id: true, code: true } } },
    });
    if (!pv) throw new NotFoundException('Procès-verbal de comptage introuvable.');
    const exercice = await this.prisma.exercice.findFirst({
      where: { id: pv.campagne.exerciceId, tenantId },
      select: { id: true, dateDebut: true, dateFin: true },
    });
    if (!exercice) throw new NotFoundException("Exercice de la campagne introuvable.");
    if (!compteApresLaCloture(pv.dateComptage, exercice.dateFin)) {
      return { applicable: false as const, motif: 'Comptage au plus tard à la clôture · rien à reconstituer.' };
    }
    const suivants = await this.prisma.exercice.findMany({
      where: filtreExercicesSuivants(tenantId, exercice.dateFin, pv.dateComptage),
      select: { id: true, dateDebut: true, dateFin: true },
      orderBy: { dateDebut: 'asc' },
    });
    const couverture = exercicesDuComptage(exercice.dateFin, pv.dateComptage, suivants);
    if ('motif' in couverture) return { applicable: false as const, motif: couverture.motif };

    const unite: UniteComparaison = { mode: pv.modeComparaison, devise: pv.devise ?? null };
    const enDevise = unite.mode === ModeComparaisonCaisse.DEVISE;
    const f = fenetresDuComptage(tenantId, exercice, pv.dateComptage, couverture.ids);
    if (!f.intercales || !f.valeurAvantCloture || !f.suivants) {
      return { applicable: false as const, motif: 'Comptage au plus tard à la clôture · rien à reconstituer.' };
    }
    const lus = (e: Prisma.EcritureWhereInput) => luesParLePv(e, pv.etabliLe);
    const where = { compteId: pv.compteId, ecriture: lus(f.intercales) };
    const [lignes, total, intercales, avant, cloture, depuisExercice, depuisSuivants] = await Promise.all([
      this.prisma.ligneEcriture.findMany({
        where,
        select: {
          id: true,
          libelle: true,
          debit: true,
          credit: true,
          montantDevise: true,
          ecriture: {
            select: { id: true, date: true, dateValeur: true, numeroPiece: true, libelle: true, journal: { select: { code: true } } },
          },
        },
        orderBy: [{ ecriture: { date: 'asc' } }, { id: 'asc' }],
        take: InventaireService.PLAFOND_MOUVEMENTS_RECONSTITUTION,
      }),
      this.prisma.ligneEcriture.count({ where }),
      sommesDansLUnite(this.prisma, pv.compteId, lus(f.intercales), unite),
      sommesDansLUnite(this.prisma, pv.compteId, lus(f.valeurAvantCloture), unite),
      sommesDansLUnite(this.prisma, pv.compteId, lus(f.exercice), unite),
      sommesDansLUnite(this.prisma, pv.compteId, valideesDepuisLePv(f.exercice, pv.etabliLe), unite),
      sommesDansLUnite(this.prisma, pv.compteId, valideesDepuisLePv(f.suivants, pv.etabliLe), unite),
    ]);
    const a = (n: number) => Number(n.toFixed(2));
    const relus = {
      soldeALaCloture: a(cloture.debit - cloture.credit),
      mouvementsValeurAvantCloture: a(avant.debit - avant.credit),
      encaissements: a(intercales.debit),
      decaissements: a(intercales.credit),
    };
    const figes =
      pv.soldeALaCloture != null && pv.encaissementsPosterieurs != null && pv.decaissementsPosterieurs != null
        ? {
            soldeALaCloture: Number(pv.soldeALaCloture),
            mouvementsValeurAvantCloture: Number(pv.mouvementsValeurAvantCloture ?? 0),
            encaissements: Number(pv.encaissementsPosterieurs),
            decaissements: Number(pv.decaissementsPosterieurs),
          }
        : null;
    return {
      applicable: true as const,
      unite: enDevise && unite.devise ? unite.devise.code : null,
      lignes: lignes.map((l) => {
        // Dans l'unité du PV, et dans la colonne de SON côté · une inscription
        // en négatif (AUDCIF art. 20, `lignesEnNegatif`) porte un débit ou un
        // crédit NÉGATIF et un montant en devise SANS signe. Elle reste dans sa
        // colonne, en négatif, comme `sommesDansLUnite` la compte (débit
        // effectif = débits positifs moins débits négatifs) · lue sur
        // `debit > 0`, une correction d'encaissement passait en décaissement,
        // et en francs elle y entrait même négative. Le sens net reste celui de
        // `positionDesLignes` (débit moins crédit). Une ligne sans devise
        // (écart de réévaluation) vaut zéro dans l'unité de la devise.
        const debit = Number(l.debit);
        const credit = Number(l.credit);
        const auDebit = debit !== 0;
        const brut = auDebit ? debit : credit;
        const montant = enDevise ? Math.sign(brut) * Number(l.montantDevise ?? 0) : brut;
        return {
          id: l.id,
          date: l.ecriture.dateValeur ?? l.ecriture.date,
          journal: l.ecriture.journal.code,
          numeroPiece: l.ecriture.numeroPiece,
          libelle: l.libelle ?? l.ecriture.libelle,
          encaissement: auDebit ? montant : 0,
          decaissement: auDebit ? 0 : montant,
        };
      }),
      total,
      tronque: total > lignes.length,
      ...relus,
      // null quand le PV n'a rien figé (établi avant la ligne A10) · rien à
      // confronter, et ce n'est pas un accord.
      concorde: figes
        ? figes.soldeALaCloture === relus.soldeALaCloture &&
          figes.mouvementsValeurAvantCloture === relus.mouvementsValeurAvantCloture &&
          figes.encaissements === relus.encaissements &&
          figes.decaissements === relus.decaissements
        : null,
      saisiesDepuisLePv: {
        nombre: depuisExercice.nombre + depuisSuivants.nombre,
        net: a(depuisExercice.debit - depuisExercice.credit + depuisSuivants.debit - depuisSuivants.credit),
      },
    };
  }

  /** L'unité d'un PV de caisse, dite dans un refus. */
  static unitePourMessage(mode: ModeComparaisonCaisse, code?: string | null): string {
    if (mode === ModeComparaisonCaisse.DEVISE) return code ? `en ${code}` : 'en devise';
    if (mode === ModeComparaisonCaisse.FRANCS_COURS_HISTORIQUES) return 'en francs au cours historique';
    return 'en francs';
  }

  /** Une tranche de travail qui se dit (§ 8 bis) · total et `tronque` servis. */
  static readonly PLAFOND_MOUVEMENTS_RECONSTITUTION = 500;

  /**
   * LE RÉSUMÉ DE L'OPÉRATION D'INVENTAIRE · ce que le livre d'inventaire
   * attend et que personne ne pouvait lui donner.
   *
   * AUDCIF art. 19, quatrième tiret, et SYCEBNL art. 14 exigent tous deux que
   * le livre d'inventaire porte « le RÉSUMÉ DE L'OPÉRATION D'INVENTAIRE ».
   * Ni l'un ni l'autre n'en définit le contenu · le champ reste donc une
   * saisie libre du dossier. Ce que le module apporte est la MATIÈRE : les
   * chiffres qu'un rédacteur aurait dû recompter à la main, et qu'un réviseur
   * demandera de toute façon.
   */
  async resumePourLivreInventaire(tenantId: string, exerciceId: string) {
    const campagnes = await this.prisma.campagneInventaire.findMany({
      where: { tenantId, exerciceId },
      include: { ecarts: { include: { compte: { select: { numero: true, intitule: true } } } }, _count: { select: { fiches: true } } },
      orderBy: { dateInventaire: 'asc' },
    });
    return campagnes.map((c) => {
      const ecarts = c.ecarts.map((e) => Number(e.ecart));
      return {
        campagneId: c.id,
        libelle: c.libelle,
        dateInventaire: c.dateInventaire,
        statut: c.statut,
        procesVerbalEtabliLe: c.procesVerbalEtabliLe,
        fiches: c._count.fiches,
        comptesRapproches: c.ecarts.length,
        manquants: ecarts.filter((m) => m < 0).length,
        excedents: ecarts.filter((m) => m > 0).length,
        sansEcart: ecarts.filter((m) => m === 0).length,
        totalManquants: Number(ecarts.filter((m) => m < 0).reduce((s, m) => s + m, 0).toFixed(2)),
        totalExcedents: Number(ecarts.filter((m) => m > 0).reduce((s, m) => s + m, 0).toFixed(2)),
        ecartsSansDecision: c.ecarts.filter((e) => e.decision === null).length,
      };
    });
  }
}
