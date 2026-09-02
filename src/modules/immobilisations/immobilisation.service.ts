import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ModeAmortissement, Prisma, Referentiel, StatutImmobilisation } from '@prisma/client';
import { FAMILLES_IMMOBILISATION_DEFAUT, FAMILLES_IMMOBILISATION_DEFAUT_SYSCOHADA } from './famille-immobilisation-seed';
import {
  CreerFamilleDto,
  CreerImmobilisationDto,
  ModifierFamilleDto,
  PasserDotationDto,
  SortirImmobilisationDto,
  TypeSortie,
} from './dto/immobilisation.dto';

const EPSILON = 0.005;

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
function versImmobilisation<T extends { valeurOrigine: unknown; valeurResiduelle: unknown; prixCession: unknown; dotations?: unknown[] }>(
  immo: T,
) {
  return {
    ...immo,
    valeurOrigine: Number(immo.valeurOrigine),
    valeurResiduelle: Number(immo.valeurResiduelle),
    prixCession: immo.prixCession === null || immo.prixCession === undefined ? null : Number(immo.prixCession),
    dotations: (immo.dotations ?? []).map((d) => versDotation(d as { montant: unknown })),
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
  ): number {
    const base = this.baseAmortissable(valeurOrigine, valeurResiduelle);
    const annuitePleine = base / dureeAns;
    const cumulAnterieur =
      dotationsAnterieures.reduce((s, d) => s + d.montant, 0) + Math.max(0, amortissementAnterieur);
    const reliquat = Math.max(0, base - cumulAnterieur);
    if (reliquat <= EPSILON) return 0;

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

    const valeurComptableNette = Math.max(0, Number(immo.valeurOrigine) - cumulAmorti);

    const lignesSortie: Array<{ compteId: string; debit: number; credit: number }> = [
      { compteId: immo.compteImmobilisationId, debit: 0, credit: Number(immo.valeurOrigine) },
    ];
    if (cumulAmorti > EPSILON) {
      lignesSortie.push({ compteId: immo.compteAmortissementId, debit: cumulAmorti, credit: 0 });
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
