import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DecisionEcartInventaire,
  Referentiel,
  RoleMembreInventaire,
  StatutCampagneInventaire,
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
  static motifRefusExcedent(numeroCompte: string): string {
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
    await this.campagneOuverte(tenantId, campagneId, [
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
    // mesurera · c'est lui qui porte la valeur d'entrée au bilan.
    await this.prisma.ficheInventaire.createMany({
      data: aCreer.map((b) => ({
        tenantId,
        campagneId,
        compteId: b.compteImmobilisationId,
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
    return this.prisma.ficheInventaire.update({
      where: { id: ficheId },
      data: {
        ...(dto.quantiteComptee !== undefined ? { quantiteComptee: dto.quantiteComptee } : {}),
        ...(dto.valeurInventaire !== undefined ? { valeurInventaire: dto.valeurInventaire } : {}),
        ...(dto.referencePiece !== undefined ? { referencePiece: dto.referencePiece?.trim() || null } : {}),
        ...(dto.emplacement !== undefined ? { emplacement: dto.emplacement?.trim() || null } : {}),
        ...(dto.sousCommissionId !== undefined ? { sousCommissionId: dto.sousCommissionId } : {}),
      },
    });
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
   *  2. LA BALANCE EST PRISE BROUILLARD COMPRIS. C'est la balance de
   *     vérification que le comptable a sous les yeux au moment de compter,
   *     pas la seule partie validée · exclure le brouillard fabriquerait des
   *     écarts que la validation du lendemain effacerait.
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
        `${nonValorisees.length} fiche(s) sans valeur d'inventaire · les valoriser ou les supprimer avant de rapprocher. ` +
          "Une fiche non valorisée comptée pour zéro produirait un manquant que personne n'a constaté.",
      );
    }

    const { lignes } = await this.ecritures.balance(tenantId, campagne.exerciceId, true);
    const soldeParCompte = new Map(lignes.map((l) => [l.compteId, l.solde]));

    const parCompte = new Map<string, { valeur: number; nombre: number }>();
    for (const f of fiches) {
      const cumul = parCompte.get(f.compteId) ?? { valeur: 0, nombre: 0 };
      cumul.valeur += Number(f.valeurInventaire);
      cumul.nombre += 1;
      parCompte.set(f.compteId, cumul);
    }

    const maintenant = new Date();
    await this.prisma.$transaction([
      this.prisma.ecartInventaire.deleteMany({ where: { tenantId, campagneId } }),
      ...[...parCompte.entries()].map(([compteId, { valeur, nombre }]) => {
        // Un compte d'actif a un solde débiteur ; la balance le rend positif.
        // Un compte de passif (dettes comptées à l'inventaire documentaire)
        // le rend négatif. On compare donc la valeur d'inventaire à la
        // VALEUR ABSOLUE du solde, et l'écart garde le sens « inventaire
        // moins comptabilité » que le CPCC lui donne.
        const solde = Math.abs(soldeParCompte.get(compteId) ?? 0);
        return this.prisma.ecartInventaire.create({
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
      }),
      this.prisma.campagneInventaire.update({
        where: { id: campagneId },
        data: { statut: StatutCampagneInventaire.ARBITRAGE },
      }),
    ]);
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

    const montant = Number(ecart.ecart);
    if (dto.decision === DecisionEcartInventaire.A_REDRESSER && montant > 0) {
      throw new BadRequestException(
        `L'écart du compte ${ecart.compte.numero} est un EXCÉDENT (+${montant}) · il ne se redresse pas. ` +
          InventaireService.motifRefusExcedent(ecart.compte.numero) +
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
          note: "Contrepartie à choisir selon la nature du manquant · le référentiel n'en impose aucune.",
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
   * ET CE QUE LE MODULE NE FAIT PAS : il ne dit pas ce que l'attestation
   * contient. Aucune source lue ne la définit · le module en enregistre
   * l'existence, sa date et son signataire, et laisse le document au cabinet.
   * Inventer ses mentions produirait un modèle qui aurait l'air officiel sans
   * l'être.
   */
  async etablirPvCaisse(tenantId: string, campagneId: string, userId: string, dto: EtablirPvCaisseDto) {
    const campagne = await this.campagneOuverte(tenantId, campagneId, [
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

    const ecart = Number((dto.especesComptees - dto.soldeComptable).toFixed(2));
    return this.prisma.procesVerbalComptageCaisse.create({
      data: {
        tenantId,
        campagneId: campagne.id,
        compteId: dto.compteId,
        sousCommissionId: dto.sousCommissionId,
        dateComptage: new Date(dto.dateComptage),
        heureComptage: dto.heureComptage?.trim() || null,
        soldeComptableFige: dto.soldeComptable,
        especesComptees: dto.especesComptees,
        ecart,
        attestationEtablieLe: dto.attestationEtablieLe ? new Date(dto.attestationEtablieLe) : null,
        attestationPar: dto.attestationPar?.trim() || null,
        observations: dto.observations?.trim() || null,
        etabliPar: userId,
        coupures: {
          create: coupures.map((c) => ({
            tenantId,
            valeurUnitaire: c.valeurUnitaire,
            nombre: c.nombre,
          })),
        },
      },
      include: { coupures: true, compte: { select: { numero: true, intitule: true } } },
    });
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
    return { ...campagne, sanction: InventaireService.sanctionApplicable(tenant.referentiel) };
  }

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
