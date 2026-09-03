import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ModeAmortissement, Prisma, Referentiel, SensDepreciation, StatutImmobilisation } from '@prisma/client';
import { FAMILLES_IMMOBILISATION_DEFAUT, FAMILLES_IMMOBILISATION_DEFAUT_SYSCOHADA } from './famille-immobilisation-seed';
import {
  CreerFamilleDto,
  CreerImmobilisationDto,
  DepreciationDto,
  ModifierFamilleDto,
  PasserDotationDto,
  SortirImmobilisationDto,
  TypeSortie,
} from './dto/immobilisation.dto';

const EPSILON = 0.005;

/** Une ligne du tableau des immobilisations · six colonnes, comme le modèle. */
export interface LigneTableauImmo {
  id: string;
  designation: string;
  numeroInventaire: string;
  dateAcquisition: string;
  dureeAns: number;
  valeurBrute: number;
  amortissements: number;
  valeurNette: number;
  statut: StatutImmobilisation;
  dateSortie: string | null;
}

/** Une ligne du tableau des amortissements · douze colonnes mensuelles. */
export interface LigneTableauAmortissement {
  id: string;
  designation: string;
  dateAcquisition: string;
  valeurBrute: number;
  taux: number;
  base: number;
  parMois: number[];
  dotation: number;
  cumulN1: number;
  cumulN: number;
  valeurNette: number;
  /** Vraie quand la dotation est COMPTABILISÉE, fausse quand elle est calculée. */
  dotationPassee: boolean;
}

/**
 * Les champs Decimal de Prisma (valeurOrigine, valeurResiduelle,
 * prixCession, montant) sérialisent en CHAÎNES sur le JSON de réponse ·
 * jamais renvoyés bruts ici, jamais laissés au frontend à deviner. Même
 * discipline que LettrageService.lister() (`Number(l.debit)`) : trouvé en
 * testant l'écran (pas en curl, où tout s'affiche comme du texte de toute
 * façon) · le cumul amorti "0120240" au lieu de 360 venait d'une
 * concaténation de chaînes ("120" + "240"), la V.N.C. affichée -119040 au
 * lieu de 840.
 */
function versDotation<T extends { montant: unknown }>(d: T) {
  return { ...d, montant: Number(d.montant) };
}
function versImmobilisation<
  T extends {
    valeurOrigine: unknown;
    valeurResiduelle: unknown;
    prixCession: unknown;
    dotations?: unknown[];
    depreciations?: unknown[];
  },
>(immo: T) {
  return {
    ...immo,
    valeurOrigine: Number(immo.valeurOrigine),
    valeurResiduelle: Number(immo.valeurResiduelle),
    prixCession: immo.prixCession === null || immo.prixCession === undefined ? null : Number(immo.prixCession),
    dotations: (immo.dotations ?? []).map((d) => versDotation(d as { montant: unknown })),
    // Servies à l'écran pour que la valeur nette affichée soit celle du bilan.
    // Une VCN calculée sans elles se lirait comme un désaccord entre la fiche
    // du bien et la balance, sans qu'on sache lequel des deux a tort.
    depreciations: (immo.depreciations ?? []).map((d) => {
      const dep = d as { id: string; sens: SensDepreciation; montant: unknown; exerciceId: string; indice: string };
      return { id: dep.id, sens: dep.sens, montant: Number(dep.montant), exerciceId: dep.exerciceId, indice: dep.indice };
    }),
  };
}

const CODE_CONTRAINTE_UNIQUE = 'P2002';

function estConflitUnicite(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === CODE_CONTRAINTE_UNIQUE;
}

/**
 * Immobilisations (§3.3, docs/plan-de-construction.md) · CE MODULE SERT LES
 * DEUX RÉFÉRENTIELS, et sa documentation ne connaissait que l'un des deux.
 *
 * Mécanique d'acquisition, d'amortissement et de cession :
 *  · dossier SYCEBNL · skill `sycebnl`, COMPTE 21 à 29, Partie 2 ch. 3 § 2 ;
 *  · dossier SYSCOHADA · AUDCIF, Titre VII classes 2 et 8 (COMPTE 28 pour
 *    l'amortissement, COMPTE 81 et COMPTE 82 pour la sortie), et art. 45 pour
 *    la date de début d'amortissement. Les deux rédactions sont identiques sur
 *    ce point, ce qui est la raison pour laquelle le code est commun.
 *
 * Durées d'amortissement par défaut des familles semées : skill
 * `fiscalite-rdc/socle`, arrêté n° 013/2025 · voir famille-immobilisation-seed.ts
 * pour le détail des citations.
 */
/**
 * Nature d'une immobilisation, lue sur la RACINE de son compte d'actif · elle
 * décide du compte de classe 8 servi à la sortie.
 *
 * Le PCGO (AUDCIF Titre VII ch. 3, section 8) subdivise les deux comptes de
 * sortie de la même façon, et les deux semis les portent :
 *
 *   81 Valeurs comptables des cessions · 811 incorporelles
 *                                        812 corporelles
 *                                        816 financières
 *   82 Produits des cessions           · 821 incorporelles
 *                                        822 corporelles
 *                                        826 financières
 *
 * Le code servait 812 et 822 à TOUTE sortie, en assumant le cas le plus
 * fréquent. La cession d'un logiciel (compte 2131, incorporel) sortait donc
 * sur « immobilisations corporelles ». L'écriture reste équilibrée et le
 * résultat exact · seule la ventilation des cessions dans les notes annexes
 * est fausse, ce que rien ne signale.
 */
export type NatureImmobilisation = 'INCORPORELLE' | 'CORPORELLE' | 'FINANCIERE';

export const COMPTES_SORTIE: Record<NatureImmobilisation, { valeurComptable: string; produitCession: string }> = {
  INCORPORELLE: { valeurComptable: '81100000', produitCession: '82100000' },
  CORPORELLE: { valeurComptable: '81200000', produitCession: '82200000' },
  FINANCIERE: { valeurComptable: '81600000', produitCession: '82600000' },
};

/**
 * CESSION COURANTE · LE NIVEAU H.A.O. N'EST PAS TOUJOURS LE BON, ET LE
 * LOGICIEL N'OFFRAIT AUCUN CHOIX.
 *
 * L'AUDCIF exclut expressément du niveau H.A.O. les cessions « considérées
 * comme courantes (fréquentes et récurrentes) » et les impute en exploitation :
 * « exemples : transporteurs, loueurs de matériels » (Titre VII, COMPTE 81,
 * Exclusions ; COMPTE 82, Commentaires). Un transporteur qui renouvelle sa
 * flotte voyait donc chaque cession en hors activités ordinaires, ce qui
 * déplace du résultat d'exploitation vers le résultat H.A.O. un flux qui est
 * précisément son activité.
 *
 * DEUX REFUS, POUR DEUX RAISONS DIFFÉRENTES, ET AUCUN N'EST COSMÉTIQUE :
 *
 *  · en SYCEBNL, le compte 654 est « Dons en nature courants reçus à
 *    distribuer » et le 7542 son pendant (Partie 2 ch. 3, COMPTE 65). Y porter
 *    une valeur comptable de cession écrirait une cession dans le compte des
 *    dons reçus · l'option est refusée pour ce référentiel ;
 *  · les comptes 654 et 754 n'ont que deux subdivisions, 6541/7541
 *    incorporelles et 6542/7542 corporelles. Il n'existe AUCUNE subdivision
 *    financière : une immobilisation financière reste en 816/826, quelle que
 *    soit la fréquence des cessions.
 */
export const COMPTES_CESSION_COURANTE: Partial<
  Record<NatureImmobilisation, { valeurComptable: string; produitCession: string }>
> = {
  INCORPORELLE: { valeurComptable: '65410000', produitCession: '75410000' },
  CORPORELLE: { valeurComptable: '65420000', produitCession: '75420000' },
};

export function natureImmobilisation(numeroCompte: string): NatureImmobilisation {
  // Classe 2 : 20 et 21 incorporelles, 22 à 24 corporelles, 26 et 27
  // financières. 25 (avances sur immobilisations) ne se cède pas · il se
  // solde à la réception du bien, il n'atteint donc jamais cette sortie.
  if (/^2[01]/.test(numeroCompte)) return 'INCORPORELLE';
  if (/^2[67]/.test(numeroCompte)) return 'FINANCIERE';
  return 'CORPORELLE';
}

@Injectable()
export class ImmobilisationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritureService: EcritureService,
  ) {}

  /** Appelé une fois à la création du tenant (voir AuthService.register). */
  /**
   * `client` reçoit la transaction de `AuthService.register` quand le semis
   * fait partie d'une création de dossier · hors de ce cas il vaut
   * `this.prisma` et rien ne change pour les autres appelants.
   */
  async seedFamillesDefaut(tenantId: string, referentiel: Referentiel, client: Prisma.TransactionClient = this.prisma) {
    const familles =
      referentiel === Referentiel.SYSCOHADA ? FAMILLES_IMMOBILISATION_DEFAUT_SYSCOHADA : FAMILLES_IMMOBILISATION_DEFAUT;
    for (const f of familles) {
      const [compteImmo, compteAmort, compteDotation] = await Promise.all([
        client.compte.findUnique({ where: { tenantId_numero: { tenantId, numero: f.numeroCompteImmobilisation } } }),
        client.compte.findUnique({ where: { tenantId_numero: { tenantId, numero: f.numeroCompteAmortissement } } }),
        client.compte.findUnique({ where: { tenantId_numero: { tenantId, numero: f.numeroCompteDotation } } }),
      ]);
      // Défensif plutôt que silencieux : si le plan de comptes du tenant ne
      // contient pas (encore) ces numéros · dossier créé avant l'import
      // complet du plan SYCEBNL, ou compte supprimé entre-temps · on saute
      // cette famille plutôt que de planter tout le seed de l'inscription.
      if (!compteImmo || !compteAmort || !compteDotation) continue;
      await client.familleImmobilisation.upsert({
        where: { tenantId_code: { tenantId, code: f.code } },
        update: {},
        create: {
          tenantId,
          code: f.code,
          intitule: f.intitule,
          compteImmobilisationId: compteImmo.id,
          compteAmortissementId: compteAmort.id,
          compteDotationId: compteDotation.id,
          dureeAmortissementAns: f.dureeAmortissementAns,
        },
      });
    }
  }

  async listerFamilles(tenantId: string) {
    return this.prisma.familleImmobilisation.findMany({
      where: { tenantId },
      include: { compteImmobilisation: true, compteAmortissement: true, compteDotation: true },
      orderBy: { intitule: 'asc' },
    });
  }

  /**
   * Vérifie que chaque compte de la famille est de la bonne nature · trouvé
   * en approfondissant (règle §2.6) : rien n'empêchait jusqu'ici de créer
   * une famille avec, par exemple, un compte de trésorerie comme "compte
   * d'amortissement". `ClasseCompte.CLASSE_2` seul ne suffit pas à
   * distinguer immobilisation (20-27) d'amortissement (28-29), qui
   * partagent la même classe · d'où la vérification sur le préfixe
   * numérique en plus de la classe.
   */
  /**
   * Compte de classe 8 de la sortie · absent du plan, on le NOMME plutôt que
   * de retomber en silence sur un compte voisin.
   */
  private async compteDeSortie(tenantId: string, numero: string) {
    const compte = await this.prisma.compte.findUnique({ where: { tenantId_numero: { tenantId, numero } } });
    if (!compte) {
      throw new BadRequestException(
        `Compte ${numero} introuvable pour ce dossier · nécessaire pour enregistrer la sortie de cette immobilisation.`,
      );
    }
    return compte;
  }

  private async verifierComptesFamille(tenantId: string, dto: { compteImmobilisationId: string; compteAmortissementId: string; compteDotationId: string }) {
    const [compteImmo, compteAmort, compteDotation] = await Promise.all([
      this.prisma.compte.findFirst({ where: { id: dto.compteImmobilisationId, tenantId } }),
      this.prisma.compte.findFirst({ where: { id: dto.compteAmortissementId, tenantId } }),
      this.prisma.compte.findFirst({ where: { id: dto.compteDotationId, tenantId } }),
    ]);
    if (!compteImmo) throw new BadRequestException('Compte introuvable pour ce tenant (compteImmobilisationId)');
    if (!compteAmort) throw new BadRequestException('Compte introuvable pour ce tenant (compteAmortissementId)');
    if (!compteDotation) throw new BadRequestException('Compte introuvable pour ce tenant (compteDotationId)');

    if (compteImmo.classe !== 'CLASSE_2' || compteImmo.numero.startsWith('28') || compteImmo.numero.startsWith('29')) {
      throw new BadRequestException(
        `Le compte d'immobilisation ${compteImmo.numero} doit être un compte de classe 2, hors amortissements/dépréciations (20-27)`,
      );
    }
    if (compteAmort.classe !== 'CLASSE_2' || !compteAmort.numero.startsWith('28')) {
      throw new BadRequestException(`Le compte d'amortissement ${compteAmort.numero} doit être un compte de classe 28`);
    }
    if (compteDotation.classe !== 'CLASSE_6' || !compteDotation.numero.startsWith('68')) {
      throw new BadRequestException(`Le compte de dotation ${compteDotation.numero} doit être un compte de dotations aux amortissements (68)`);
    }
  }

  async creerFamille(tenantId: string, dto: CreerFamilleDto) {
    await this.verifierComptesFamille(tenantId, dto);
    const existant = await this.prisma.familleImmobilisation.findUnique({
      where: { tenantId_code: { tenantId, code: dto.code } },
    });
    if (existant) {
      throw new ConflictException(`Une famille de code "${dto.code}" existe déjà pour ce tenant`);
    }
    return this.prisma.familleImmobilisation.create({ data: { ...dto, tenantId } });
  }

  async modifierFamille(tenantId: string, id: string, dto: ModifierFamilleDto) {
    const famille = await this.prisma.familleImmobilisation.findFirst({ where: { id, tenantId } });
    if (!famille) throw new NotFoundException('Famille introuvable pour ce tenant');
    return this.prisma.familleImmobilisation.update({ where: { id }, data: dto });
  }

  async lister(tenantId: string, statut?: StatutImmobilisation) {
    const immobilisations = await this.prisma.immobilisation.findMany({
      where: { tenantId, ...(statut ? { statut } : {}) },
      include: {
        famille: true,
        compteImmobilisation: true,
        compteAmortissement: true,
        dotations: true,
        depreciations: true,
      },
      orderBy: { dateAcquisition: 'desc' },
    });
    return immobilisations.map(versImmobilisation);
  }

  /**
   * Compensation : `EcritureService.creer` gère sa propre transaction
   * (numéro de pièce inclus) et commet réellement l'écriture, indépendamment
   * de ce qui suit · l'envelopper dans la transaction sérialisable de
   * l'appelant ne protégerait donc PAS contre une course sur la contrainte
   * d'unicité DotationAmortissement (le retry ne rejoue pas l'écriture déjà
   * commise). Seule option sans réécrire EcritureService : poster, puis en
   * cas de conflit avéré sur DotationAmortissement, supprimer l'écriture que
   * CETTE requête vient de créer (jamais celle du concurrent gagnant).
   *
   * Trouvé et corrigé lors de l'approfondissement post-livraison de cette
   * brique (règle §2.6) : 12 requêtes de dotation simultanées sur la même
   * immobilisation/exercice produisaient 12 écritures réelles au grand
   * livre (toutes équilibrées, donc invisibles à un simple contrôle de
   * balance) pour une seule ligne DotationAmortissement effectivement
   * conservée · 11 postes fantômes gonflant silencieusement le compte
   * d'amortissement cumulé, plus une 500 brute renvoyée aux 11 requêtes
   * perdantes au lieu d'un 409 propre.
   */
  private async annulerEcritureOrpheline(ecritureId: string) {
    await this.prisma.ligneEcriture.deleteMany({ where: { ecritureId } });
    await this.prisma.ecriture.delete({ where: { id: ecritureId } });
  }

  private async trouver(tenantId: string, id: string) {
    const immo = await this.prisma.immobilisation.findFirst({
      where: { id, tenantId },
      // `compteImmobilisation` est chargé pour sa NATURE : c'est son numéro
      // qui décide du compte de classe 8 à servir à la sortie (811 / 812 / 816).
      include: {
        famille: true,
        compteImmobilisation: true,
        dotations: { orderBy: { exercice: { dateDebut: 'asc' } }, include: { exercice: true } },
        // Chargées systématiquement · la dépréciation change la base
        // amortissable ET la valeur comptable nette de sortie. Les charger à
        // la demande aurait laissé un chemin où le module continue de
        // raisonner au coût historique sans que rien ne le signale.
        depreciations: { orderBy: { exercice: { dateDebut: 'asc' } }, include: { exercice: true } },
      },
    });
    if (!immo) throw new NotFoundException('Immobilisation introuvable pour ce tenant');
    return immo;
  }

  /**
   * Base amortissable = valeur d'origine - valeur résiduelle (skill
   * sycebnl, COMPTE 28). Cumul déjà amorti = somme des dotations déjà
   * passées (jamais recalculé depuis le compte 28 lui-même, qui pourrait
   * porter d'autres écritures manuelles · la source de vérité du cumul
   * "généré par ce module" est la table DotationAmortissement).
   */
  private baseAmortissable(valeurOrigine: number, valeurResiduelle: number) {
    return Math.max(0, valeurOrigine - valeurResiduelle);
  }

  /**
   * Cumul net des dépréciations · dotations moins reprises. Positif ou nul :
   * une reprise ne peut jamais dépasser ce qui a été doté (voir
   * `enregistrerDepreciation`), sans quoi le compte 29 deviendrait débiteur,
   * ce qui n'a pas de sens pour une correction d'actif « de sens négatif »
   * (SYCEBNL, fiche du COMPTE 29).
   */
  private cumulDepreciation(depreciations: Array<{ sens: SensDepreciation; montant: number }>) {
    return depreciations.reduce(
      (total, d) => total + (d.sens === SensDepreciation.DOTATION ? d.montant : -d.montant),
      0,
    );
  }

  /**
   * ANNÉES DÉJÀ ÉCOULÉES du plan, comptées depuis le premier jour du mois de
   * mise en service · la même origine que le prorata de la première annuité
   * (loi n° 23/053, art. 34). Sert à connaître la durée RESTANT À COURIR, sur
   * laquelle le plan se ré-étale après une perte de valeur.
   *
   * Comptées sur les DATES et non sur le nombre de dotations enregistrées : un
   * bien repris porte un amortissement antérieur sans qu'aucune dotation ne
   * figure ici, et un exercice sauté ne rallonge pas la durée d'utilité.
   */
  private anneesEcoulees(dateMiseEnService: Date, debutExercice: Date) {
    const origine = new Date(
      Date.UTC(dateMiseEnService.getUTCFullYear(), dateMiseEnService.getUTCMonth(), 1),
    );
    if (debutExercice <= origine) return 0;
    const mois =
      (debutExercice.getUTCFullYear() - origine.getUTCFullYear()) * 12 +
      (debutExercice.getUTCMonth() - origine.getUTCMonth());
    return Math.max(0, Math.floor(mois / 12));
  }

  async creer(tenantId: string, userId: string, dto: CreerImmobilisationDto) {
    const famille = await this.prisma.familleImmobilisation.findFirst({ where: { id: dto.familleId, tenantId } });
    if (!famille) throw new BadRequestException('Famille introuvable pour ce tenant');

    const compteContrepartie = await this.prisma.compte.findFirst({ where: { id: dto.compteContrepartieId, tenantId } });
    if (!compteContrepartie) throw new BadRequestException('Compte de contrepartie introuvable pour ce tenant');

    const dateAcquisition = new Date(dto.dateAcquisition);
    const dateMiseEnService = new Date(dto.dateMiseEnService);
    if (dateMiseEnService < dateAcquisition) {
      throw new BadRequestException("La date de mise en service ne peut pas précéder la date d'acquisition");
    }

    // Écriture d'acquisition : débit du compte d'immobilisation (skill
    // sycebnl, COMPTE 21-27, "utilisation au débit" · apport, acquisition ou
    // création) ; crédit du compte de contrepartie choisi par l'utilisateur
    // selon le mode de financement réel.
    //
    // Les contreparties ne sont pas les mêmes de part et d'autre, et le
    // commentaire n'en connaissait qu'une famille. Communes : trésorerie,
    // fournisseur d'investissement, emprunt, capital par dotation (le compte
    // 102 existe dans les deux plans). Propres au SYCEBNL : les fonds affectés
    // du compte 16, qui n'ont pas d'équivalent au plan SYSCOHADA, dont le 17
    // porte des dettes de location acquisition.
    //
    // Le compte n'est pas contraint ici : EcritureService valide déjà qu'il
    // est mouvementable et qu'il appartient au dossier.
    // L'AMORTISSEMENT ANTÉRIEUR NE PEUT PAS DÉPASSER CE QU'IL Y A À AMORTIR ·
    // au-delà, le bien serait plus qu'amorti, la valeur nette comptable
    // deviendrait négative et la sortie créditerait un 28 supérieur au 2.
    const baseAmortissable = this.baseAmortissable(dto.valeurOrigine, dto.valeurResiduelle ?? 0);
    if ((dto.amortissementAnterieur ?? 0) - baseAmortissable > EPSILON) {
      throw new BadRequestException(
        `L'amortissement antérieur (${(dto.amortissementAnterieur ?? 0).toFixed(2)}) dépasse la base ` +
          `amortissable du bien (${baseAmortissable.toFixed(2)}, soit la valeur d'origine diminuée de la valeur ` +
          'résiduelle) : un bien ne peut pas être amorti au-delà de ce qu’il y a à amortir.',
      );
    }

    const ecritureAcquisition = await this.ecritureService.creer(tenantId, userId, {
      exerciceId: dto.exerciceId,
      journalId: dto.journalId,
      date: dto.dateAcquisition,
      libelle: `Acquisition · ${dto.designation}`,
      lignes: [
        { compteId: famille.compteImmobilisationId, debit: dto.valeurOrigine, credit: 0 },
        { compteId: dto.compteContrepartieId, debit: 0, credit: dto.valeurOrigine },
      ],
    });

    const immobilisation = await this.prisma.immobilisation.create({
      data: {
        tenantId,
        familleId: famille.id,
        designation: dto.designation,
        numeroInventaire: dto.numeroInventaire,
        compteImmobilisationId: famille.compteImmobilisationId,
        compteAmortissementId: famille.compteAmortissementId,
        compteDotationId: famille.compteDotationId,
        dateAcquisition,
        dateMiseEnService,
        valeurOrigine: dto.valeurOrigine,
        valeurResiduelle: dto.valeurResiduelle ?? 0,
        dureeAmortissementAns: dto.dureeAmortissementAns ?? famille.dureeAmortissementAns,
        amortissementAnterieur: dto.amortissementAnterieur ?? 0,
        modeAmortissement: ModeAmortissement.LINEAIRE,
        ecritureAcquisitionId: ecritureAcquisition.id,
        createdBy: userId,
      },
      include: { dotations: true },
    });
    return versImmobilisation(immobilisation);
  }

  /**
   * Annuité de dotation pour `exercice`, compte tenu du cumul déjà passé.
   *
   * Première dotation (aucune dotation antérieure) : prorata temporis à
   * compter du premier jour du mois de mise en service.
   *
   * CITATION CORRIGÉE · la règle vient de la LOI n° 23/053, article 34 (« la
   * première annuité est calculée prorata temporis à compter du premier jour
   * du mois de mise en service »), l'article 30 posant seulement le linéaire
   * comme régime de droit commun. L'arrêté n° 013/2025 ne porte ni l'un ni
   * l'autre : il fixe les taux linéaires par famille (art. 2), les taux
   * dérogatoires (art. 4) et le plancher de location-acquisition (art. 5).
   *
   * La date COMPTABLE de début d'amortissement est celle où l'actif est en
   * état de fonctionner · AUDCIF art. 45 pour un dossier SYSCOHADA, skill
   * `sycebnl` COMPTE 28 pour un dossier SYCEBNL, en termes identiques. Le
   * calcul est donc le même des deux côtés.
   *
   * Borné à 12 mois pour CET exercice · limite du
   * MVP assumée : si la mise en service est antérieure au début de
   * l'exercice choisi pour la première dotation (dotation en retard, jamais
   * passée pour l'exercice réel de mise en service), le calcul ne rattrape
   * pas les mois antérieurs à cet exercice, il les ignore silencieusement.
   * Documenté ici plutôt que caché (règle §2.6).
   *
   * Dotations suivantes : annuité pleine (base / durée), plafonnée par le
   * reliquat (base - cumul déjà amorti) pour ne jamais dépasser la base
   * amortissable · un bien totalement amorti reste inscrit au bilan
   * (COMPTE 20-29, dernier paragraphe) mais ne génère plus de dotation.
   */
  /**
   * LE CUMUL AMORTI N'EST PAS SEULEMENT CE QUE LE LOGICIEL A DOTÉ.
   *
   * `amortissementAnterieur` porte ce qui a été amorti AVANT l'entrée du bien
   * dans OmegaX. Un bien mis en service en 2020 et repris dans un dossier
   * ouvert en 2026 porte déjà six annuités au compte 28 ; sans ce chiffre, le
   * calcul repartait de zéro et l'amortissait cinq ans de plus, pendant que la
   * valeur nette comptable des états s'écartait du solde du 28 repris par le
   * bilan d'ouverture.
   *
   * Il compte aussi pour savoir si l'annuité doit être PRORATISÉE : la
   * proratisation ne vaut que pour la PREMIÈRE annuité du bien, et un bien
   * repris a déjà passé la sienne, ailleurs. Se fier au seul nombre de
   * dotations enregistrées ici lui aurait fait subir un second prorata.
   */
  private calculerDotation(
    valeurOrigine: number,
    valeurResiduelle: number,
    dureeAns: number,
    dateMiseEnService: Date,
    dotationsAnterieures: Array<{ montant: number }>,
    exercice: { dateDebut: Date; dateFin: Date },
    amortissementAnterieur = 0,
    cumulDepreciation = 0,
  ): number {
    const base = this.baseAmortissable(valeurOrigine, valeurResiduelle);
    const cumulAnterieur =
      dotationsAnterieures.reduce((s, d) => s + d.montant, 0) + Math.max(0, amortissementAnterieur);
    // Le reliquat tient compte de la dépréciation : ce qui a été déprécié n'a
    // plus à être amorti, sans quoi le bien s'amortirait au-delà de sa valeur.
    const reliquat = Math.max(0, base - cumulAnterieur - Math.max(0, cumulDepreciation));
    if (reliquat <= EPSILON) return 0;

    /*
      LE PLAN SE RÉ-ÉTALE APRÈS UNE PERTE DE VALEUR.

      AUDCIF, Titre VIII ch. 12 § 2.4.1 · « après la comptabilisation d'une
      perte de valeur, le plan d'amortissement de l'actif doit être ajusté pour
      les exercices suivants, afin que la valeur comptable révisée, diminuée de
      sa valeur résiduelle, puisse être répartie de façon systématique sur sa
      durée d'utilité restant à courir ». Le § 2.3.2 le chiffre : un matériel
      de 10 000 000 amorti linéairement sur 5 ans, déprécié de 1 600 000 à la
      fin de la 3e année, porte une VNC de 2 400 000 « qui constitue la
      nouvelle base amortissable, amortie sur la durée restant à courir (deux
      ans) » · 1 200 000 par an, et non plus 2 000 000.

      SANS DÉPRÉCIATION, RIEN NE CHANGE · l'annuité reste base / durée. C'est
      volontaire : la ré-étalement n'a de sens qu'après une perte de valeur, et
      l'appliquer partout modifierait le plan de tous les biens du parc.
    */
    let annuitePleine: number;
    if (cumulDepreciation > EPSILON) {
      const restantes = Math.max(1, dureeAns - this.anneesEcoulees(dateMiseEnService, exercice.dateDebut));
      annuitePleine = reliquat / restantes;
    } else {
      annuitePleine = base / dureeAns;
    }

    const premiereAnnuite = dotationsAnterieures.length === 0 && amortissementAnterieur <= EPSILON;
    let montant: number;
    if (premiereAnnuite) {
      const premierJourMoisMES = new Date(Date.UTC(dateMiseEnService.getUTCFullYear(), dateMiseEnService.getUTCMonth(), 1));
      const debutProrata = premierJourMoisMES < exercice.dateDebut ? exercice.dateDebut : premierJourMoisMES;
      const moisEcoules =
        (exercice.dateFin.getUTCFullYear() - debutProrata.getUTCFullYear()) * 12 +
        (exercice.dateFin.getUTCMonth() - debutProrata.getUTCMonth()) +
        1;
      const mois = Math.min(12, Math.max(0, moisEcoules));
      montant = annuitePleine * (mois / 12);
    } else {
      montant = annuitePleine;
    }
    return Math.min(montant, reliquat);
  }

  /**
   * TABLEAU DES IMMOBILISATIONS · l'état que le cabinet classe en tête du
   * cycle immobilisations, et que le logiciel ne produisait pas.
   *
   * Présentation relevée sur le dossier de révision ouvert sur le Drive
   * (« Fichier immos et AMORTIS », feuille « TABLEAU DES IMMOBILISATIONS ») :
   * une ligne par bien, GROUPÉE PAR COMPTE D'IMPUTATION avec un sous-total par
   * groupe, et un total général. Le groupement n'est pas décoratif · c'est lui
   * qui permet de recouper le tableau avec la balance compte par compte, ce
   * qu'une liste à plat ne permet pas.
   *
   * Six colonnes : libellé, date d'acquisition, durée, valeur brute,
   * amortissements cumulés, valeur nette.
   *
   * L'AMORTISSEMENT ANTÉRIEUR ENTRE DANS LE CUMUL. Un bien repris d'un dossier
   * antérieur porte un cumul que nos dotations ne contiennent pas ; l'omettre
   * afficherait une valeur nette égale au brut sur un matériel de vingt ans.
   */
  async tableauImmobilisations(tenantId: string, params: { dateArret?: string } = {}) {
    const arret = params.dateArret ? new Date(params.dateArret) : null;
    const immos = await this.prisma.immobilisation.findMany({
      where: {
        tenantId,
        ...(arret ? { dateAcquisition: { lte: arret } } : {}),
      },
      include: {
        compteImmobilisation: { select: { id: true, numero: true, intitule: true } },
        dotations: {
          select: { montant: true, exercice: { select: { dateFin: true } } },
        },
      },
      orderBy: [{ compteImmobilisation: { numero: 'asc' } }, { dateAcquisition: 'asc' }],
    });

    const arrondir = (x: number) => Math.round(x * 100) / 100;
    const groupes = new Map<
      string,
      { numero: string; intitule: string; lignes: LigneTableauImmo[]; brut: number; amortissements: number; net: number }
    >();

    for (const immo of immos) {
      // Les dotations POSTÉRIEURES à la date d'arrêté sont écartées · un
      // tableau au 30/09 ne peut pas porter la dotation de décembre.
      const cumulDotations = immo.dotations
        .filter((d) => !arret || d.exercice.dateFin <= arret)
        .reduce((t, d) => t + Number(d.montant), 0);
      const amortissements = arrondir(cumulDotations + Math.max(0, Number(immo.amortissementAnterieur ?? 0)));
      const brut = Number(immo.valeurOrigine);
      const cle = immo.compteImmobilisation.id;
      const groupe =
        groupes.get(cle) ??
        {
          numero: immo.compteImmobilisation.numero,
          intitule: immo.compteImmobilisation.intitule,
          lignes: [] as LigneTableauImmo[],
          brut: 0,
          amortissements: 0,
          net: 0,
        };
      const net = arrondir(brut - amortissements);
      groupe.lignes.push({
        id: immo.id,
        designation: immo.designation,
        numeroInventaire: immo.numeroInventaire ?? '',
        dateAcquisition: immo.dateAcquisition.toISOString().slice(0, 10),
        dureeAns: immo.dureeAmortissementAns,
        valeurBrute: brut,
        amortissements,
        valeurNette: net,
        statut: immo.statut,
        dateSortie: immo.dateSortie ? immo.dateSortie.toISOString().slice(0, 10) : null,
      });
      groupe.brut = arrondir(groupe.brut + brut);
      groupe.amortissements = arrondir(groupe.amortissements + amortissements);
      groupe.net = arrondir(groupe.net + net);
      groupes.set(cle, groupe);
    }

    const listeGroupes = [...groupes.values()].sort((a, b) => a.numero.localeCompare(b.numero));
    return {
      dateArret: arret ? arret.toISOString().slice(0, 10) : null,
      groupes: listeGroupes,
      totaux: {
        brut: arrondir(listeGroupes.reduce((t, g) => t + g.brut, 0)),
        amortissements: arrondir(listeGroupes.reduce((t, g) => t + g.amortissements, 0)),
        net: arrondir(listeGroupes.reduce((t, g) => t + g.net, 0)),
      },
    };
  }

  /**
   * TABLEAU DES AMORTISSEMENTS DE L'EXERCICE · douze colonnes mensuelles.
   *
   * Modèle relevé sur la seconde feuille du même fichier (« TABLEAU DES
   * AMORTISSEMENTS 2025 ») : libellé, date d'acquisition, valeur brute, TAUX,
   * puis JANV à DÉCEMBRE, puis dotation de l'exercice, cumul N-1, cumul N et
   * valeur nette. Groupé par compte avec sous-totaux, comme le premier.
   *
   * POURQUOI DOUZE COLONNES ET PAS UN CHIFFRE ANNUEL. Le logiciel calcule une
   * dotation d'exercice, ce qui suffit à l'écriture mais pas au dossier. Le
   * découpage mensuel montre trois choses qu'un total annuel cache : le mois
   * d'ENTRÉE du bien (une acquisition de juin ne porte que sept douzièmes), le
   * mois de SORTIE (un bien cédé en septembre s'arrête là), et le mois où un
   * bien ACHÈVE de s'amortir (sa dernière colonne est un reliquat, pas une
   * mensualité pleine). C'est aussi ce qui permet de recouper la dotation avec
   * les écritures mensuelles quand le dossier dote au mois.
   *
   * LA RÉPARTITION EST CALCULÉE, PAS INVENTÉE : la dotation de l'exercice,
   * telle que `calculerDotation` la produit, est répartie sur les mois pendant
   * lesquels le bien est effectivement en service dans l'exercice · le
   * reliquat d'arrondi tombe sur le dernier mois servi, pour que la somme des
   * douze colonnes soit EXACTEMENT la dotation, au centime.
   */
  async tableauAmortissements(tenantId: string, exerciceId: string) {
    const exercice = await this.prisma.exercice.findFirstOrThrow({
      where: { id: exerciceId, tenantId },
      select: { id: true, dateDebut: true, dateFin: true },
    });
    const immos = await this.prisma.immobilisation.findMany({
      where: { tenantId, dateAcquisition: { lte: exercice.dateFin } },
      include: {
        compteImmobilisation: { select: { id: true, numero: true, intitule: true } },
        dotations: { select: { montant: true, exerciceId: true, exercice: { select: { dateFin: true } } } },
        // La dépréciation change l'annuité de tous les exercices SUIVANTS ·
        // un tableau qui l'ignorerait annoncerait une dotation que
        // passerDotation refuserait ensuite de poster.
        depreciations: {
          select: { sens: true, montant: true, exercice: { select: { dateFin: true } } },
        },
      },
      orderBy: [{ compteImmobilisation: { numero: 'asc' } }, { dateAcquisition: 'asc' }],
    });

    const arrondir = (x: number) => Math.round(x * 100) / 100;
    const moisDeLExercice: Array<{ annee: number; mois: number }> = [];
    for (
      let d = new Date(Date.UTC(exercice.dateDebut.getUTCFullYear(), exercice.dateDebut.getUTCMonth(), 1));
      d <= exercice.dateFin;
      d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
    ) {
      moisDeLExercice.push({ annee: d.getUTCFullYear(), mois: d.getUTCMonth() });
    }

    const groupes = new Map<
      string,
      { numero: string; intitule: string; lignes: LigneTableauAmortissement[]; parMois: number[]; dotation: number; cumulN1: number; cumulN: number; net: number }
    >();

    for (const immo of immos) {
      const dotationsAnterieures = immo.dotations.filter((d) => d.exercice.dateFin < exercice.dateFin);
      const cumulN1 = arrondir(
        dotationsAnterieures.reduce((t, d) => t + Number(d.montant), 0) +
          Math.max(0, Number(immo.amortissementAnterieur ?? 0)),
      );

      // La dotation retenue est celle DÉJÀ PASSÉE si elle l'a été · un tableau
      // qui recalculerait ce qui est comptabilisé afficherait autre chose que
      // les comptes, et c'est le tableau qu'on croirait.
      const dejaPassee = immo.dotations.find((d) => d.exerciceId === exercice.id);
      const dotation = dejaPassee
        ? Number(dejaPassee.montant)
        : this.calculerDotation(
            Number(immo.valeurOrigine),
            Number(immo.valeurResiduelle),
            immo.dureeAmortissementAns,
            immo.dateMiseEnService,
            dotationsAnterieures.map((d) => ({ montant: Number(d.montant) })),
            exercice,
            Number(immo.amortissementAnterieur ?? 0),
            this.cumulDepreciation(
              immo.depreciations
                .filter((d) => d.exercice.dateFin < exercice.dateFin)
                .map((d) => ({ sens: d.sens, montant: Number(d.montant) })),
            ),
          );

      // Mois effectivement servis : depuis le mois de mise en service (ou le
      // début de l'exercice si elle est antérieure) jusqu'au mois de sortie
      // (ou la fin de l'exercice).
      const finService = immo.dateSortie && immo.dateSortie < exercice.dateFin ? immo.dateSortie : exercice.dateFin;
      const servis = moisDeLExercice.map(({ annee, mois }) => {
        const premierJour = new Date(Date.UTC(annee, mois, 1));
        const dernierJour = new Date(Date.UTC(annee, mois + 1, 0));
        const debutService = new Date(
          Date.UTC(immo.dateMiseEnService.getUTCFullYear(), immo.dateMiseEnService.getUTCMonth(), 1),
        );
        return debutService <= dernierJour && premierJour <= finService;
      });
      const nbServis = servis.filter(Boolean).length;

      const parMois = moisDeLExercice.map(() => 0);
      if (nbServis > 0 && Math.abs(dotation) > EPSILON) {
        const mensualite = arrondir(dotation / nbServis);
        let cumul = 0;
        let dernierServi = -1;
        servis.forEach((sert, i) => {
          if (!sert) return;
          parMois[i] = mensualite;
          cumul = arrondir(cumul + mensualite);
          dernierServi = i;
        });
        // Le reliquat d'arrondi tombe sur le dernier mois servi · sans quoi la
        // somme des douze colonnes ne serait pas la dotation, et le tableau
        // afficherait un écart que personne ne saurait expliquer.
        if (dernierServi >= 0) parMois[dernierServi] = arrondir(parMois[dernierServi] + (dotation - cumul));
      }

      const cumulN = arrondir(cumulN1 + dotation);
      const net = arrondir(Number(immo.valeurOrigine) - cumulN);
      const base = this.baseAmortissable(Number(immo.valeurOrigine), Number(immo.valeurResiduelle));

      const cle = immo.compteImmobilisation.id;
      const groupe =
        groupes.get(cle) ??
        {
          numero: immo.compteImmobilisation.numero,
          intitule: immo.compteImmobilisation.intitule,
          lignes: [] as LigneTableauAmortissement[],
          parMois: moisDeLExercice.map(() => 0),
          dotation: 0,
          cumulN1: 0,
          cumulN: 0,
          net: 0,
        };
      groupe.lignes.push({
        id: immo.id,
        designation: immo.designation,
        dateAcquisition: immo.dateAcquisition.toISOString().slice(0, 10),
        valeurBrute: Number(immo.valeurOrigine),
        // Le taux, pas seulement la durée · c'est ce que leur tableau affiche,
        // et c'est ce qu'on relit pour vérifier une annuité de tête.
        taux: immo.dureeAmortissementAns > 0 ? arrondir(100 / immo.dureeAmortissementAns) : 0,
        base: arrondir(base),
        parMois,
        dotation: arrondir(dotation),
        cumulN1,
        cumulN,
        valeurNette: net,
        dotationPassee: Boolean(dejaPassee),
      });
      parMois.forEach((m, i) => {
        groupe.parMois[i] = arrondir(groupe.parMois[i] + m);
      });
      groupe.dotation = arrondir(groupe.dotation + dotation);
      groupe.cumulN1 = arrondir(groupe.cumulN1 + cumulN1);
      groupe.cumulN = arrondir(groupe.cumulN + cumulN);
      groupe.net = arrondir(groupe.net + net);
      groupes.set(cle, groupe);
    }

    const listeGroupes = [...groupes.values()].sort((a, b) => a.numero.localeCompare(b.numero));
    const NOMS_MOIS = ['Janv.', 'Févr.', 'Mars', 'Avril', 'Mai', 'Juin', 'Juill.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];
    return {
      exercice: {
        dateDebut: exercice.dateDebut.toISOString().slice(0, 10),
        dateFin: exercice.dateFin.toISOString().slice(0, 10),
      },
      mois: moisDeLExercice.map(({ annee, mois }) => ({ cle: `${annee}-${String(mois + 1).padStart(2, '0')}`, libelle: NOMS_MOIS[mois] })),
      groupes: listeGroupes,
      totaux: {
        parMois: moisDeLExercice.map((_, i) => arrondir(listeGroupes.reduce((t, g) => t + g.parMois[i], 0))),
        dotation: arrondir(listeGroupes.reduce((t, g) => t + g.dotation, 0)),
        cumulN1: arrondir(listeGroupes.reduce((t, g) => t + g.cumulN1, 0)),
        cumulN: arrondir(listeGroupes.reduce((t, g) => t + g.cumulN, 0)),
        net: arrondir(listeGroupes.reduce((t, g) => t + g.net, 0)),
      },
    };
  }

  async passerDotation(tenantId: string, userId: string, id: string, dto: PasserDotationDto) {
    const immo = await this.trouver(tenantId, id);
    if (immo.statut !== StatutImmobilisation.EN_SERVICE) {
      throw new BadRequestException("Cette immobilisation n'est plus en service · aucune dotation possible");
    }
    const exercice = await this.prisma.exercice.findFirst({ where: { id: dto.exerciceId, tenantId } });
    if (!exercice) throw new BadRequestException('Exercice introuvable pour ce tenant');

    const dejaPassee = await this.prisma.dotationAmortissement.findUnique({
      where: { immobilisationId_exerciceId: { immobilisationId: id, exerciceId: dto.exerciceId } },
    });
    if (dejaPassee) {
      throw new ConflictException('Une dotation a déjà été passée pour cette immobilisation sur cet exercice');
    }

    const montant = this.calculerDotation(
      Number(immo.valeurOrigine),
      Number(immo.valeurResiduelle),
      immo.dureeAmortissementAns,
      immo.dateMiseEnService,
      immo.dotations.map((d) => ({ montant: Number(d.montant) })),
      exercice,
      Number(immo.amortissementAnterieur ?? 0),
      // Les dépréciations ANTÉRIEURES à cet exercice · celle de l'exercice en
      // cours, si elle existe, se constate à la clôture après la dotation et
      // ne peut donc pas déjà ré-étaler le plan de la même annuité.
      this.cumulDepreciation(
        immo.depreciations
          .filter((d) => d.exercice.dateFin < exercice.dateFin)
          .map((d) => ({ sens: d.sens, montant: Number(d.montant) })),
      ),
    );
    if (montant <= EPSILON) {
      throw new BadRequestException('Aucun montant à doter · le bien est déjà entièrement amorti ou hors période');
    }

    // Utilisation au crédit du compte 28 (skill sycebnl, COMPTE 28) · par le
    // débit du compte 681 (dotations aux amortissements d'exploitation).
    const ecriture = await this.ecritureService.creer(tenantId, userId, {
      exerciceId: dto.exerciceId,
      journalId: dto.journalId,
      date: exercice.dateFin.toISOString().slice(0, 10),
      libelle: `Dotation aux amortissements · ${immo.designation}`,
      lignes: [
        { compteId: immo.compteDotationId, debit: montant, credit: 0 },
        { compteId: immo.compteAmortissementId, debit: 0, credit: montant },
      ],
    });

    try {
      const dotation = await this.prisma.dotationAmortissement.create({
        data: { immobilisationId: id, exerciceId: dto.exerciceId, montant, ecritureId: ecriture.id },
      });
      return versDotation(dotation);
    } catch (err) {
      if (estConflitUnicite(err)) {
        await this.annulerEcritureOrpheline(ecriture.id);
        throw new ConflictException('Une dotation a déjà été passée pour cette immobilisation sur cet exercice');
      }
      throw err;
    }
  }


  /**
   * DÉPRÉCIATION D'UNE IMMOBILISATION · dotation ou reprise.
   *
   * Le module tenait le bien au coût historique et ne savait rien des comptes
   * 29, pourtant semés et mouvementables à la main. Un dossier qui dépréciait
   * installait alors deux divergences muettes, et le contrôle
   * DEPRECIATION_IMMO_HORS_MODULE ne pouvait que les signaler :
   * la base amortissable ignorait la perte de valeur, et la sortie du bien ne
   * soldait pas le 29. Aucune écriture ne se déséquilibrait.
   *
   * CE QUE LE LOGICIEL NE DÉCIDE PAS. Ni la valeur actuelle, ni l'existence
   * d'un indice. Le ch. 12 § 2.1 est explicite : « s'il n'existe pas d'indice
   * de perte de valeur, aucun test de dépréciation n'est requis ». Le montant
   * et l'indice sont donc saisis ; le logiciel vérifie ce qui est vérifiable.
   */
  async enregistrerDepreciation(tenantId: string, userId: string, id: string, dto: DepreciationDto) {
    const immo = await this.trouver(tenantId, id);
    if (immo.statut !== StatutImmobilisation.EN_SERVICE) {
      throw new BadRequestException("Cette immobilisation n'est plus en service · aucune dépréciation possible");
    }
    const exercice = await this.prisma.exercice.findFirst({ where: { id: dto.exerciceId, tenantId } });
    if (!exercice) throw new BadRequestException('Exercice introuvable pour ce tenant');

    const [compte29, contrepartie] = await Promise.all([
      this.prisma.compte.findFirst({ where: { id: dto.compteDepreciationId, tenantId } }),
      this.prisma.compte.findFirst({ where: { id: dto.compteContrepartieId, tenantId } }),
    ]);
    if (!compte29) throw new BadRequestException('Compte de dépréciation introuvable pour ce tenant');
    if (!contrepartie) throw new BadRequestException('Compte de contrepartie introuvable pour ce tenant');
    // La seule règle de compte que les DEUX textes écrivent · le 29 et rien
    // d'autre. La fiche du COMPTE 29 énumère ses exclusions : 39 pour les
    // stocks, 49 pour les tiers, 59 pour la trésorerie. Le sous-compte exact
    // reste libre, il dépend du plan que le dossier a ouvert.
    if (!compte29.numero.startsWith('29')) {
      throw new BadRequestException(
        "La dépréciation d'une immobilisation s'inscrit au compte 29. Le compte 39 est celui des stocks, le 49 " +
          'celui des tiers et le 59 celui de la trésorerie.',
      );
    }

    const cumul = this.cumulDepreciation(
      immo.depreciations.map((d) => ({ sens: d.sens, montant: Number(d.montant) })),
    );
    if (dto.sens === SensDepreciation.REPRISE && dto.montant > cumul + EPSILON) {
      // Une reprise supérieure au cumul rendrait le compte 29 DÉBITEUR, ce qui
      // ferait de la correction d'actif « de sens négatif » (fiche du COMPTE
      // 29) une majoration de valeur déguisée. Le ch. 12 § 2.4.2 pose en outre
      // un plafond plus fin, que ce contrôle n'atteint pas : la valeur
      // comptable après reprise ne doit pas dépasser celle qui aurait existé
      // sans dépréciation. Le reconstituer supposerait de rejouer le plan
      // d'origine exercice par exercice · non fait, et dit ici plutôt que
      // laissé croire.
      throw new BadRequestException(
        `La reprise ne peut pas dépasser la dépréciation encore inscrite (${cumul.toFixed(2)})`,
      );
    }
    if (dto.sens === SensDepreciation.DOTATION) {
      // Une dépréciation ne peut pas descendre la valeur nette sous zéro.
      const cumulAmorti =
        immo.dotations.reduce((t, d) => t + Number(d.montant), 0) + Math.max(0, Number(immo.amortissementAnterieur ?? 0));
      const valeurNette = Number(immo.valeurOrigine) - cumulAmorti - cumul;
      if (dto.montant > valeurNette + EPSILON) {
        throw new BadRequestException(
          `La dépréciation ne peut pas dépasser la valeur comptable nette du bien (${Math.max(0, valeurNette).toFixed(2)})`,
        );
      }
    }

    // Fiche du COMPTE 29, « fonctionnement » · la dotation CRÉDITE le 29 par le
    // débit du 69 ; la reprise le DÉBITE par le crédit du 79.
    const dotation = dto.sens === SensDepreciation.DOTATION;
    const ecriture = await this.ecritureService.creer(tenantId, userId, {
      exerciceId: dto.exerciceId,
      journalId: dto.journalId,
      date: exercice.dateFin.toISOString().slice(0, 10),
      libelle: `${dotation ? 'Dotation' : 'Reprise'} de dépréciation · ${immo.designation}`,
      lignes: dotation
        ? [
            { compteId: contrepartie.id, debit: dto.montant, credit: 0 },
            { compteId: compte29.id, debit: 0, credit: dto.montant },
          ]
        : [
            { compteId: compte29.id, debit: dto.montant, credit: 0 },
            { compteId: contrepartie.id, debit: 0, credit: dto.montant },
          ],
    });

    try {
      return await this.prisma.depreciationImmobilisation.create({
        data: {
          immobilisationId: id,
          exerciceId: dto.exerciceId,
          sens: dto.sens,
          montant: dto.montant,
          compteDepreciationId: compte29.id,
          compteContrepartieId: contrepartie.id,
          indice: dto.indice,
          ecritureId: ecriture.id,
          createdBy: userId,
        },
      });
    } catch (err) {
      // Même compensation que passerDotation · l'écriture existe déjà quand la
      // contrainte d'unicité tombe, et une écriture orpheline au grand livre
      // gonflerait le compte 29 sans qu'aucune ligne ne la porte.
      if (estConflitUnicite(err)) {
        await this.annulerEcritureOrpheline(ecriture.id);
        throw new ConflictException(
          'Une dépréciation a déjà été enregistrée pour cette immobilisation sur cet exercice',
        );
      }
      throw err;
    }
  }

  /**
   * Sortie (cession ou mise hors service) · skill sycebnl, COMPTE 21-27
   * "utilisation au crédit" : le compte d'immobilisation est crédité pour
   * solde, en contrepartie du débit du compte 81 (V.C.N., pour la valeur
   * nette restante) et du débit du compte 28 (pour solde des amortissements
   * cumulés). Si cession avec un prix, le produit est comptabilisé
   * SÉPARÉMENT au crédit du compte 82 (skill sycebnl ne mélange jamais VCN
   * et produit de cession dans la même ligne).
   */
  async sortir(tenantId: string, userId: string, id: string, dto: SortirImmobilisationDto) {
    const immo = await this.trouver(tenantId, id);
    if (immo.statut !== StatutImmobilisation.EN_SERVICE) {
      throw new BadRequestException('Cette immobilisation est déjà sortie');
    }
    const exercice = await this.prisma.exercice.findFirst({ where: { id: dto.exerciceId, tenantId } });
    if (!exercice) throw new BadRequestException('Exercice introuvable pour ce tenant');
    const dateSortie = new Date(dto.dateSortie);

    if (dateSortie < immo.dateMiseEnService) {
      throw new BadRequestException('La date de sortie ne peut pas précéder la date de mise en service');
    }
    if (dateSortie < exercice.dateDebut || dateSortie > exercice.dateFin) {
      throw new BadRequestException("La date de sortie doit se situer dans l'exercice indiqué");
    }

    if (dto.type === TypeSortie.CESSION && (dto.prixCession === undefined || !dto.compteContrepartieId)) {
      throw new BadRequestException('Une cession nécessite un prix et un compte de contrepartie (trésorerie ou tiers)');
    }

    // CESSION COURANTE · exploitation (654 / 754) au lieu de H.A.O. (81 / 82).
    // Les deux refus ci-dessous sont posés côté SERVEUR : l'écran peut cacher
    // la case, un appel direct la poserait quand même.
    const nature = natureImmobilisation(immo.compteImmobilisation.numero);
    let comptes = COMPTES_SORTIE[nature];
    if (dto.cessionCourante) {
      const { referentiel } = await this.prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { referentiel: true },
      });
      if (referentiel !== Referentiel.SYSCOHADA) {
        throw new BadRequestException(
          "La cession courante impute la sortie aux comptes 654 et 754, qui portent au plan SYCEBNL les dons en " +
            "nature courants reçus à distribuer. Sur un dossier SYCEBNL, une cession se comptabilise en hors " +
            'activités ordinaires (comptes 81 et 82).',
        );
      }
      const courants = COMPTES_CESSION_COURANTE[nature];
      if (!courants) {
        throw new BadRequestException(
          "Les comptes 654 et 754 n'ont que deux subdivisions, incorporelles et corporelles : une immobilisation " +
            'financière se cède en hors activités ordinaires (comptes 816 et 826), quelle que soit la fréquence ' +
            'des cessions.',
        );
      }
      comptes = courants;
    }

    // Verrou par écriture conditionnelle AVANT tout effet de bord (même
    // risque de course que passerDotation, trouvé en l'approfondissant ·
    // deux sorties simultanées sur le même bien liraient toutes deux
    // EN_SERVICE et posteraient chacune leurs écritures). Un UPDATE Postgres
    // filtré sur le statut prend un verrou de ligne : seule une requête à la
    // fois peut faire passer `statut` de EN_SERVICE à sa valeur finale ; la
    // perdante voit `count: 0` et s'arrête avant d'avoir rien posté au grand
    // livre · pas de compensation nécessaire ici, contrairement à
    // passerDotation (où la première écriture existe déjà avant que la
    // contrainte d'unicité ne puisse être testée).
    const statutFinal = dto.type === TypeSortie.CESSION ? StatutImmobilisation.CEDEE : StatutImmobilisation.MISE_HORS_SERVICE;
    const verrou = await this.prisma.immobilisation.updateMany({
      where: { id, tenantId, statut: StatutImmobilisation.EN_SERVICE },
      data: { statut: statutFinal, dateSortie, prixCession: dto.prixCession },
    });
    if (verrou.count === 0) {
      throw new ConflictException('Cette immobilisation vient déjà d\'être sortie par une autre opération');
    }

    // Dotation complémentaire de l'exercice de sortie (skill sycebnl, COMPTE
    // 28 : "la dotation complémentaire en cas de cession"), seulement si
    // aucune dotation n'a déjà été passée sur cet exercice pour ce bien ·
    // sinon le cumul est déjà à jour, pas de complément à ajouter.
    // L'AMORTISSEMENT ANTÉRIEUR COMPTE DANS LA VALEUR COMPTABLE NETTE. Sans
    // lui, la sortie d'un bien repris sortirait une VCN gonflée de tout ce qui
    // avait été amorti avant l'entrée dans le logiciel · et le compte 28 soldé
    // à la sortie ne correspondrait pas à ce que le bilan portait.
    let cumulAmorti =
      immo.dotations.reduce((s, d) => s + Number(d.montant), 0) + Number(immo.amortissementAnterieur ?? 0);
    const dejaDoteCetExercice = immo.dotations.some((d) => d.exerciceId === dto.exerciceId);
    if (!dejaDoteCetExercice) {
      const montantComplement = this.calculerDotation(
        Number(immo.valeurOrigine),
        Number(immo.valeurResiduelle),
        immo.dureeAmortissementAns,
        immo.dateMiseEnService,
        immo.dotations.map((d) => ({ montant: Number(d.montant) })),
        { dateDebut: exercice.dateDebut, dateFin: dateSortie },
        Number(immo.amortissementAnterieur ?? 0),
        this.cumulDepreciation(
          immo.depreciations
            .filter((d) => d.exercice.dateFin < exercice.dateFin)
            .map((d) => ({ sens: d.sens, montant: Number(d.montant) })),
        ),
      );
      if (montantComplement > EPSILON) {
        const ecritureComplement = await this.ecritureService.creer(tenantId, userId, {
          exerciceId: dto.exerciceId,
          journalId: dto.journalId,
          date: dto.dateSortie,
          libelle: `Dotation complémentaire (sortie) · ${immo.designation}`,
          lignes: [
            { compteId: immo.compteDotationId, debit: montantComplement, credit: 0 },
            { compteId: immo.compteAmortissementId, debit: 0, credit: montantComplement },
          ],
        });
        // Conflit théorique seulement ici : le verrou ci-dessus garantit déjà
        // qu'aucune autre sortie ne peut être en cours sur ce bien, mais
        // passerDotation() reste appelable en parallèle sur le même
        // exercice · même compensation par cohérence, au cas où.
        try {
          await this.prisma.dotationAmortissement.create({
            data: { immobilisationId: id, exerciceId: dto.exerciceId, montant: montantComplement, ecritureId: ecritureComplement.id },
          });
        } catch (err) {
          if (estConflitUnicite(err)) {
            await this.annulerEcritureOrpheline(ecritureComplement.id);
            throw new ConflictException('Une dotation a été passée entre-temps pour cette immobilisation sur cet exercice · réessayez la sortie');
          }
          throw err;
        }
        cumulAmorti += montantComplement;
      }
    }

    /*
      LA DÉPRÉCIATION SORT AVEC LE BIEN.

      Les deux textes rangent le compte 29 « distinctement à l'actif, EN
      DIMINUTION DE LA VALEUR BRUTE des biens correspondants pour donner leur
      valeur comptable nette » (SYCEBNL, fiche du COMPTE 29 · AUDCIF art. 46 et
      Titre VIII ch. 12). Le sortir suppose donc de le solder comme le 28, et
      de retrancher son cumul de la valeur comptable nette.

      C'ÉTAIT LA SECONDE DIVERGENCE MUETTE. Un 29 laissé au bilan après la
      sortie du bien qu'il corrigeait est une correction d'actif sans actif ; et
      la valeur comptable nette portée au 81 était surévaluée du même montant,
      ce qui transformait une moins-value en plus-value sans qu'aucune écriture
      ne se déséquilibre.
    */
    const cumulDepreciation = this.cumulDepreciation(
      immo.depreciations.map((d) => ({ sens: d.sens, montant: Number(d.montant) })),
    );
    const compteDepreciationSortie = immo.depreciations.at(-1)?.compteDepreciationId ?? null;

    const valeurComptableNette = Math.max(0, Number(immo.valeurOrigine) - cumulAmorti - cumulDepreciation);

    const lignesSortie: Array<{ compteId: string; debit: number; credit: number }> = [
      { compteId: immo.compteImmobilisationId, debit: 0, credit: Number(immo.valeurOrigine) },
    ];
    if (cumulAmorti > EPSILON) {
      lignesSortie.push({ compteId: immo.compteAmortissementId, debit: cumulAmorti, credit: 0 });
    }
    if (cumulDepreciation > EPSILON && compteDepreciationSortie) {
      lignesSortie.push({ compteId: compteDepreciationSortie, debit: cumulDepreciation, credit: 0 });
    }
    if (valeurComptableNette > EPSILON) {
      const compteVNC = await this.compteDeSortie(tenantId, comptes.valeurComptable);
      lignesSortie.push({ compteId: compteVNC.id, debit: valeurComptableNette, credit: 0 });
    }

    const ecritureSortie = await this.ecritureService.creer(tenantId, userId, {
      exerciceId: dto.exerciceId,
      journalId: dto.journalId,
      date: dto.dateSortie,
      libelle: `${dto.type === TypeSortie.CESSION ? 'Cession' : 'Mise hors service'} · ${immo.designation}`,
      lignes: lignesSortie,
    });

    // Produit de cession · écriture séparée, jamais mélangée à la sortie de
    // l'actif (skill sycebnl distingue clairement 81 "valeur comptable" et
    // 82 "produit de cession").
    if (dto.type === TypeSortie.CESSION && dto.prixCession && dto.compteContrepartieId) {
      const compteProduit = await this.compteDeSortie(tenantId, comptes.produitCession);
      await this.ecritureService.creer(tenantId, userId, {
        exerciceId: dto.exerciceId,
        journalId: dto.journalId,
        date: dto.dateSortie,
        libelle: `Produit de cession · ${immo.designation}`,
        lignes: [
          { compteId: dto.compteContrepartieId, debit: dto.prixCession, credit: 0 },
          { compteId: compteProduit.id, debit: 0, credit: dto.prixCession },
        ],
      });
    }

    // statut/dateSortie/prixCession déjà posés par le verrou ci-dessus ;
    // il ne reste que l'écriture de sortie, connue seulement une fois postée.
    const immobilisation = await this.prisma.immobilisation.update({
      where: { id },
      data: { ecritureSortieId: ecritureSortie.id },
      include: { dotations: true },
    });
    return versImmobilisation(immobilisation);
  }
}
