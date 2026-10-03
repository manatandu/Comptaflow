import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { NatureBulletinPaie, Prisma, StatutBulletinPaie, StatutEcriture, TypeContratTravail } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import {
  ContratTravailDto,
  DecompteFinalDto,
  EmissionDecompteFinalDto,
  LivreDePaieDto,
  SalarieDto,
  SimulationPaieDto,
  TerminerContratDto,
} from './dto/personnel.dto';
import { assiettes, NATURES_FOURNIES_EN_NATURE, type ElementPaie, type NatureElementPaie } from './assiettes-paie';
import { RESERVE_REGIME_NON_DECLARE, baremeApplicableAuMois, regimeApplicable, retenueMensuelle } from './bareme-irpp';
import { cotisations, netAPayer, type NatureEmployeurInpp, type RegimeCnss } from './cotisations-paie';
import { NATURES_SANS_IMPUTATION, estVerseEnEspeces, passationPaie, type Referentiel } from './passation-paie';
import {
  LITTERA_ARTICLE_112,
  RESERVE_QUOTITE_AVANCES,
  motifRefusMoisSaisie,
  motifRefusRetenue,
  reserveQuotiteSaisies,
  soldeAvance,
  type CategoriePret,
  type TypeAvance,
} from './avances-salaire';
import { quotiteSaisissable } from './quotite-saisissable';
import { reserveIndemniteLogementKinshasa } from './indemnite-logement-kinshasa';
import {
  AVERTISSEMENT_ARTICLE_89,
  jourDeKinshasa,
  messageCoursManquant,
  usdEnFc,
} from './conversion-usd';
import { transactionJournalisee } from '../../common/audit/transaction-journalisee';

/** La trace d'une conversion USD vers FC · figée avec le bulletin émis. */
export interface ConversionUsd {
  devise: 'USD';
  /** Francs congolais pour un dollar, tel que saisi au dossier. */
  cours: number;
  /** AAAA-MM-JJ, jour de Kinshasa du calcul. */
  dateCours: string;
  sourceCours: string | null;
  elements: Array<{ libelle: string; montantUsd: number; montantFc: number }>;
  avertissement: string;
}
import {
  LIMITE_UN_BULLETIN_PAR_MOIS,
  RESERVE_MODELE,
  TEXTE_ARTICLE_103,
  enonciationsDuBulletin,
  TEXTE_INALTERABILITE,
  TEXTE_NUMEROTATION,
  chiffresFigeables,
  contratCouvrantLeMois,
  moisValide,
  motifRefusRemise,
  motifsRefusEmission,
  nomCompletMajuscules,
} from './bulletin-paie';
import {
  REPONSE_COTISATION_SYNDICALE,
  RESERVE_CESSION_SYNDICALE,
  RESERVE_LITTERAE_DATEES,
  RETENUES_ARTICLE_112,
  SANCTION_ARTICLE_112,
} from './retenues-autorisees';
import {
  ARRETE_DU_MODELE,
  DESTINATION_DES_DOUBLES,
  ECARTS_2008_2018,
  MENTIONS_ARRETE_142_2018,
  REFERENCE_ARRETE_142_2018,
  TEXTE_ARTICLE_2_SECOND_DOUBLE,
  DOUBLES_DETACHABLES_MINIMUM,
  FORMULES_DU_MODELE,
  MENTIONS_MODELE_2008,
  RESERVE_ARTICLE_104,
  SANCTION_ARTICLE_103,
  DECOMPTE_A_LA_RUPTURE,
  livreDePaie,
  type FormeDuDocument,
} from './livre-de-paie';
import { MULTIPLICATEURS_ARTICLE_7, allocationFamilialeJournaliere, type Annexe } from './bareme-smig';
import { BAREMES_SERVIS, annexesSmigDuDossier, versionsDuDossier, type LigneVersion } from './baremes-dossier';
import { effectifDuRegistre } from './effectif-registre';
import {
  RESERVE_ASSIETTE_SOCIALE_INDEMNITE,
  RESERVE_DU_PAR_LE_TRAVAILLEUR,
  RESERVE_EN_FRANCS,
  RESERVE_VERSEMENT_UNIQUE,
  arrieresDesElements,
  auCentime,
  avertissementsPassation,
  elementsDuDecompte,
  motifRefusMoisDeCessation,
  motifRefusTypeContrat,
  motifsDoubleCompte,
  motifsElementsNegatifs,
} from './decompte-final-emis';
import {
  decompteFinal,
  motifRefusDecompte,
  type ExecutionPreavis,
  type InitiativeRupture,
  type MotifRupture,
  type TypeContratDecompte,
} from './decompte-final';
import {
  CONTRAT_A_COMPLETER,
  aptitudeProvisoirePerimee,
  journeesJourLeJourAvant,
  declarationsDues,
  mentionsManquantes,
  motifMonnaieExigee,
  requalifications,
  verdictEssai,
  verdictRemunerationMinimale,
  type ContratPourControle,
} from './regles-contrat-travail';
import { lireParLots, pageApres, PremiersSelon } from '../../common/lecture-par-lots';
import { PLAFOND_CONTRATS_PAR_FICHE, PLAFOND_ENFANTS_PAR_FICHE, PLAFOND_GRILLES_SMIG } from './bornes-registre';
import type { GrillesSmigNonLues } from './regles-contrat-travail';

/**
 * LES BORNES DES LISTES DE TRAVAIL DU REGISTRE (audit final F259, § 8 bis).
 * Ce sont des tranches d'ÉCRAN, jamais des documents · une liste tronquée le
 * dit (`tronque`, `total`), et ce qu'elle compte se compte sur le registre
 * entier. Mille salariés à l'écran couvrent l'effectif d'une grande ONG ; la
 * confrontation, qui porte une fiche par contrat et le texte de chaque
 * manque, en rend cinq cents.
 */
export const PLAFOND_REGISTRE_PERSONNEL = 1000;
export const PLAFOND_CONFRONTATION = 500;
/**
 * Salariés lus par tranche pour la confrontation, chacun avec ses enfants et
 * ses contrats · la mémoire ne dépend plus de l'effectif du dossier.
 */
export const LOT_CONFRONTATION = 200;

/**
 * Un salarié tel que la confrontation le lit · ses contrats, et le seul
 * NOMBRE de ses enfants sans date de naissance, compté par la base (audit
 * final F259) · la confrontation n'en lit rien d'autre.
 */
type SalarieConfronte = Prisma.SalarieGetPayload<{
  include: { contrats: true; _count: { select: { enfants: true } } };
}>;

/**
 * UNE FICHE DU REGISTRE, ET CE QU'ELLE PORTE (audit final F259, reste). La
 * liste était bornée salarié par salarié, et chaque fiche rendait pourtant
 * TOUS ses enfants et TOUS ses contrats. Les deux collections sont désormais
 * des tranches, et le nombre de chacune est compté par la base (`_count`) ·
 * `nombreContrats` ne se lit plus sur la tranche, sans quoi « 100 » se lirait
 * comme le nombre de contrats du salarié.
 *
 * LES CONTRATS EN COURS D'ABORD, puis les plus récemment terminés · la
 * tranche garde toujours le contrat en cours, que la liste affiche en face de
 * chaque salarié. Ils sont ensuite RE-TRIÉS par entrée en vigueur
 * décroissante (`presenterFiche`), l'ordre qu'affichait la fiche · sous la
 * borne, rien ne change.
 */
const INCLURE_FICHE = Prisma.validator<Prisma.SalarieInclude>()({
  enfants: { orderBy: [{ dateNaissance: 'asc' }, { id: 'asc' }], take: PLAFOND_ENFANTS_PAR_FICHE },
  contrats: {
    orderBy: [{ dateFin: { sort: 'desc', nulls: 'first' } }, { dateEntreeEnVigueur: 'desc' }, { id: 'desc' }],
    take: PLAFOND_CONTRATS_PAR_FICHE,
  },
  _count: { select: { enfants: true, contrats: true } },
});
type FicheLue = Prisma.SalarieGetPayload<{ include: typeof INCLURE_FICHE }>;

/** Les enfants tels que la fiche les écrit · la clé qui dit si rien n'a changé. */
type EnfantEcrit = { nom: string; postNom: string | null; prenoms: string | null; dateNaissance: Date | null };
const cleEnfants = (enfants: readonly EnfantEcrit[]) =>
  enfants
    .map((e) => JSON.stringify([e.nom, e.postNom, e.prenoms, e.dateNaissance ? e.dateNaissance.toISOString() : null]))
    .sort()
    .join('\n');

/**
 * LE PERSONNEL · le registre (P1), puis la paie qui s'appuie sur lui.
 *
 * LE REGISTRE tient l'état civil et les engagements, et CONFRONTE chaque
 * contrat à l'article 212 et aux requalifications des articles 40 à 45. LA
 * PAIE est venue ensuite, passe par passe · simulation d'un mois (assiettes,
 * cotisations des deux côtés, retenue de l'art. 119, net, quotité de
 * l'art. 114), décompte final, livre de paie, bulletin émis et proposition
 * d'écriture. Chaque règle vit dans son fichier (`assiettes-paie.ts`,
 * `cotisations-paie.ts`, `bareme-irpp.ts`, `quotite-saisissable.ts`,
 * `bulletin-paie.ts`, `passation-paie.ts`) · ce service lit le dossier et les
 * appelle, il ne réécrit aucune règle (audit final F109).
 *
 * IL EST COMMUN AUX DEUX RÉFÉRENTIELS, et ce n'est pas un oubli du
 * cloisonnement (CLAUDE.md § 6). Le Code du travail ne connaît ni le SYCEBNL
 * ni le SYSCOHADA : une ASBL et une SARL embauchent sous le MÊME texte. Ce
 * qui diffère est la note annexe où l'effectif ressort (27B en SYSCOHADA,
 * 29B en SYCEBNL), et elle est tranchée dans les tables de correspondance,
 * pas ici.
 *
 * DONNÉES PERSONNELLES. C'est le premier module du dépôt à en détenir. Trois
 * conséquences, toutes tenues ailleurs et rappelées ici pour qu'on ne les
 * défasse pas par distraction :
 *  · les trois tables entrent au journal d'audit AVEC une liste d'exclusion
 *    nommée colonne par colonne (`champs-audites.ts`) ;
 *  · le cloisonnement est posé AUX DEUX BOUTS · `tenantId` dans le `where` de
 *    chaque lecture ET de chaque écriture, jamais déduit d'un identifiant
 *    fourni par le client ;
 *  · l'archive de restitution du dossier les emporte, et le test qui compte
 *    les modèles restituables tombe tant que quelqu'un ne les y a pas classés.
 */
/**
 * A8 (g) · UN REFUS PORTE SES MOTIFS DANS SON MESSAGE · l'écran lit le
 * message, et des motifs gardés dans un champ à part n'y arrivaient pas. Le
 * tableau `motifs` reste servi pour qui veut les lister un par un.
 */
function refusNomme(message: string, motifs: readonly string[]): BadRequestException {
  return new BadRequestException({ message: `${message} · ${motifs.join(' · ')}`, motifs: [...motifs] });
}

@Injectable()
export class PersonnelService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Le registre, salarié par salarié, avec le contrat EN COURS de chacun.
   *
   * UN SALARIÉ PARTI RESTE AU REGISTRE. Un registre qui efface les partants
   * ne peut plus servir ni le décompte final, ni la déclaration annuelle de
   * l'art. 218, ni un contrôle · c'est son CONTRAT qui se termine.
   *
   * UNE LISTE DE TRAVAIL, DONC BORNÉE ET QUI LE DIT (audit final F259, § 8
   * bis). Elle rendait tout le registre, enfants et contrats compris, à
   * chaque ouverture de la fenêtre · la mémoire du serveur dépendait de
   * l'effectif du dossier. Le total est COMPTÉ par la base sur le périmètre
   * entier, et `tronque` dit quand la tranche en rend moins · « 1 000 » ne
   * doit jamais se lire comme l'effectif. Le registre n'est pas un document
   * déposé : le livre de paie et la déclaration de l'art. 218 lisent leurs
   * propres données. L'identifiant départage deux homonymes, sans quoi la
   * frontière d'une tranche pleine changerait d'un appel à l'autre.
   */
  async lister(tenantId: string, inclureInactifs = false, aCompleter = false) {
    // LE FILTRE « À COMPLÉTER » VAUT TOUT LE REGISTRE, inactifs compris · le
    // décompte l'est, et un salarié parti dont le contrat attend sa monnaie
    // doit rester atteignable depuis la ligne qui l'annonce.
    const perimetre = aCompleter
      ? { contrats: { some: CONTRAT_A_COMPLETER } }
      : inclureInactifs
        ? {}
        : { actif: true };
    const [salaries, total, contratsACompleter] = await Promise.all([
      this.prisma.salarie.findMany({
        where: { tenantId, ...perimetre },
        orderBy: [{ nom: 'asc' }, { postNom: 'asc' }, { id: 'asc' }],
        take: PLAFOND_REGISTRE_PERSONNEL,
        include: INCLURE_FICHE,
      }),
      this.prisma.salarie.count({ where: { tenantId, ...perimetre } }),
      // LES CONTRATS À COMPLÉTER, COMPTÉS PAR LA BASE SUR LE DOSSIER ENTIER ·
      // un montant convenu saisi sans monnaie, que le contrôle du minimum ne
      // juge pas (`DEVISE_NON_RENSEIGNEE`). Rien n'est rempli d'office, le
      // cabinet complète chacun, et c'est ce nombre qui le lui dit.
      this.prisma.contratTravail.count({ where: { tenantId, ...CONTRAT_A_COMPLETER } }),
    ]);
    return {
      contratsACompleter,
      salaries: salaries.map((s) => this.presenterFiche(s)),
      total,
      plafond: PLAFOND_REGISTRE_PERSONNEL,
      tronque: total > salaries.length,
      plafondEnfantsParFiche: PLAFOND_ENFANTS_PAR_FICHE,
      plafondContratsParFiche: PLAFOND_CONTRATS_PAR_FICHE,
    };
  }

  /**
   * Une fiche lue, rendue à l'écran · les deux tranches, leur nombre compté
   * par la base et ce que la tranche ne montre pas. Le contrat en cours est le
   * plus récent des contrats sans date de fin, comme avant la borne.
   */
  private presenterFiche(s: FicheLue) {
    const { _count, ...fiche } = s;
    const contrats = [...s.contrats].sort(
      (a, b) =>
        b.dateEntreeEnVigueur.getTime() - a.dateEntreeEnVigueur.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
    );
    return {
      ...fiche,
      contrats,
      contratEnCours: contrats.find((c) => c.dateFin === null) ?? null,
      nombreContrats: _count.contrats,
      contratsTronques: _count.contrats > contrats.length,
      nombreEnfants: _count.enfants,
      enfantsTronques: _count.enfants > s.enfants.length,
    };
  }

  async creerSalarie(tenantId: string, userId: string, dto: SalarieDto) {
    await this.verifierMatriculeLibre(tenantId, dto.matricule, null);
    return this.prisma.salarie.create({
      data: {
        tenantId,
        createdBy: userId,
        ...this.champsSalarie(dto),
        ...(dto.enfants
          ? {
              enfants: {
                create: dto.enfants.map((e) => ({
                  tenantId,
                  nom: e.nom,
                  postNom: e.postNom ?? null,
                  prenoms: e.prenoms ?? null,
                  dateNaissance: e.dateNaissance ? new Date(e.dateNaissance) : null,
                })),
              },
            }
          : {}),
      },
      include: { enfants: true },
    });
  }

  /**
   * UNE FICHE SE MODIFIE PAR SON IDENTIFIANT, AU JOURNAL D'AUDIT AVANT ET
   * APRÈS (audit final F259, même doctrine que la monnaie et la fin du
   * contrat, F226). Elle s'écrivait par `updateMany`, dont le journal ne
   * recopie que le filtre et le compte · une nationalité, une date de
   * naissance ou une déclaration de départ corrigées après coup n'y laissaient
   * aucun état antérieur, alors que ce sont elles que la confrontation et
   * l'effectif lisent. `update` porte l'état avant et l'état après, et sa
   * condition garde le dossier au second bout.
   *
   * LES ENFANTS SE REMPLACENT EN BLOC, MAIS UN PAR UN. Même raison · un
   * `deleteMany` n'en laissait au journal que le compte, et l'enfant retiré
   * disparaissait sans trace. Chacun se supprime par son identifiant, et
   * seulement quand la liste a changé · une fiche enregistrée pour une
   * adresse ne réécrit pas ses enfants à l'identique.
   */
  async modifierSalarie(tenantId: string, salarieId: string, dto: SalarieDto) {
    // CLOISONNEMENT AU PREMIER BOUT · on vérifie que le salarié appartient au
    // dossier AVANT d'écrire, et jamais en faisant confiance à l'identifiant.
    const existant = await this.prisma.salarie.findFirst({
      where: { id: salarieId, tenantId },
      select: { id: true },
    });
    if (!existant) throw new NotFoundException('Salarié introuvable dans ce dossier.');
    await this.verifierMatriculeLibre(tenantId, dto.matricule, salarieId);

    return transactionJournalisee(this.prisma, async (tx) => {
      if (dto.enfants) {
        // Lus DANS la transaction · un enfant ajouté par un autre poste entre
        // la lecture et le remplacement resterait sinon en double. Un de plus
        // que la borne, pour savoir qu'elle est dépassée.
        const anciens = await tx.enfantACharge.findMany({
          where: { tenantId, salarieId },
          select: { id: true, nom: true, postNom: true, prenoms: true, dateNaissance: true },
          orderBy: { id: 'asc' },
          take: PLAFOND_ENFANTS_PAR_FICHE + 1,
        });
        // UNE FICHE QUE L'ÉCRAN N'A PAS PU MONTRER ENTIÈRE NE SE REMPLACE PAS
        // · la liste n'en rend que `PLAFOND_ENFANTS_PAR_FICHE`, et remplacer
        // en bloc effacerait ceux qui n'y paraissaient pas, en silence.
        if (anciens.length > PLAFOND_ENFANTS_PAR_FICHE) {
          throw new BadRequestException(
            `Cette fiche porte plus de ${PLAFOND_ENFANTS_PAR_FICHE} enfants à charge, plus que l'écran n'en montre · ` +
              'les remplacer en bloc effacerait ceux qui n’y paraissent pas. Enregistrez la fiche sans toucher à ses enfants.',
          );
        }
        const nouveaux: EnfantEcrit[] = dto.enfants.map((e) => ({
          nom: e.nom,
          postNom: e.postNom ?? null,
          prenoms: e.prenoms ?? null,
          dateNaissance: e.dateNaissance ? new Date(e.dateNaissance) : null,
        }));
        if (cleEnfants(anciens) !== cleEnfants(nouveaux)) {
          for (const e of anciens) await tx.enfantACharge.delete({ where: { id: e.id, tenantId } });
          for (const e of nouveaux) await tx.enfantACharge.create({ data: { tenantId, salarieId, ...e } });
        }
      }
      // CLOISONNEMENT AU SECOND BOUT · la condition porte le `tenantId`, pour
      // qu'aucun chemin ne puisse écrire hors du dossier, même si le contrôle
      // ci-dessus était un jour contourné.
      const fiche = await tx.salarie.update({
        where: { id: salarieId, tenantId },
        data: this.champsSalarie(dto),
        include: INCLURE_FICHE,
      });
      return this.presenterFiche(fiche);
    });
  }

  private champsSalarie(dto: SalarieDto) {
    return {
      matricule: dto.matricule?.trim() || null,
      nom: dto.nom.trim(),
      postNom: dto.postNom?.trim() || null,
      prenoms: dto.prenoms?.trim() || null,
      sexe: dto.sexe,
      numeroAffiliationCnss: dto.numeroAffiliationCnss?.trim() || null,
      dateNaissance: dto.dateNaissance ? new Date(dto.dateNaissance) : null,
      millesimeNaissance: dto.millesimeNaissance ?? null,
      lieuNaissance: dto.lieuNaissance?.trim() || null,
      nationalite: dto.nationalite?.trim() || null,
      nomConjoint: dto.nomConjoint?.trim() || null,
      aptitudeConstateeLe: dto.aptitudeConstateeLe ? new Date(dto.aptitudeConstateeLe) : null,
      aptitudeConstateePar: dto.aptitudeConstateePar?.trim() || null,
      aptitudeProvisoire: dto.aptitudeProvisoire ?? false,
      declarationEngagementLe: dto.declarationEngagementLe
        ? new Date(dto.declarationEngagementLe)
        : null,
      declarationDepartLe: dto.declarationDepartLe ? new Date(dto.declarationDepartLe) : null,
      actif: dto.actif ?? true,
    };
  }

  private async verifierMatriculeLibre(
    tenantId: string,
    matricule: string | undefined,
    sauf: string | null,
  ) {
    const valeur = matricule?.trim();
    if (!valeur) return;
    const autre = await this.prisma.salarie.findFirst({
      where: { tenantId, matricule: valeur, ...(sauf ? { NOT: { id: sauf } } : {}) },
      select: { nom: true, postNom: true },
    });
    if (autre) {
      throw new BadRequestException(
        `Le matricule « ${valeur} » est déjà porté par ${autre.nom} ${autre.postNom ?? ''}`.trim() +
          ". Le matricule est « éventuel » au sens de l'article 212, point 4 · laissez-le vide plutôt que de le dédoubler.",
      );
    }
  }

  async creerContrat(
    tenantId: string,
    userId: string,
    salarieId: string,
    dto: ContratTravailDto,
  ) {
    // UN MONTANT SANS MONNAIE EST REFUSÉ AVANT TOUTE LECTURE, au service
    // comme au DTO · un appel qui contournerait la validation du corps ne
    // doit pas écrire un contrat que le contrôle du minimum ne pourrait plus
    // jamais juger. Le motif et sa raison vivent dans `regles-contrat-travail.ts`.
    const monnaieManquante = motifMonnaieExigee(dto.remunerationBase, dto.deviseRemuneration);
    if (monnaieManquante) throw new BadRequestException(monnaieManquante);

    const salarie = await this.prisma.salarie.findFirst({
      where: { id: salarieId, tenantId },
      select: { id: true },
    });
    if (!salarie) throw new NotFoundException('Salarié introuvable dans ce dossier.');

    if (dto.renouvelleDeId) {
      // UN RENOUVELLEMENT SE RATTACHE À UN CONTRAT DU MÊME SALARIÉ, dans le
      // MÊME dossier. Sans ces deux bornes, la chaîne de renouvellements se
      // laisserait construire à travers deux dossiers, et le décompte de
      // l'art. 41 compterait des contrats qui ne sont pas les siens.
      const source = await this.prisma.contratTravail.findFirst({
        where: { id: dto.renouvelleDeId, tenantId, salarieId },
        select: { id: true },
      });
      if (!source) {
        throw new BadRequestException(
          "Le contrat renouvelé est introuvable pour ce salarié dans ce dossier. Un renouvellement se rattache au contrat qu'il prolonge, et à lui seul.",
        );
      }
    }

    return this.prisma.contratTravail.create({
      data: {
        tenantId,
        salarieId,
        createdBy: userId,
        type: dto.type,
        constateParEcrit: dto.constateParEcrit ?? true,
        dateEntreeEnVigueur: new Date(dto.dateEntreeEnVigueur),
        dateConclusion: dto.dateConclusion ? new Date(dto.dateConclusion) : null,
        lieuConclusion: dto.lieuConclusion?.trim() || null,
        dateFinPrevue: dto.dateFinPrevue ? new Date(dto.dateFinPrevue) : null,
        separeDeSaFamille: dto.separeDeSaFamille ?? false,
        ouvrageDetermine: dto.ouvrageDetermine?.trim() || null,
        motifRemplacement: dto.motifRemplacement?.trim() || null,
        emploiPermanent: dto.emploiPermanent ?? false,
        natureTravail: dto.natureTravail?.trim() || null,
        lieuExecution: dto.lieuExecution?.trim() || null,
        categorieProfessionnelle: dto.categorieProfessionnelle?.trim() || null,
        classeProfessionnelle: dto.classeProfessionnelle ?? null,
        periodiciteRemuneration: dto.periodiciteRemuneration ?? null,
        manoeuvreSansSpecialite: dto.manoeuvreSansSpecialite ?? false,
        remunerationBase: dto.remunerationBase ?? null,
        deviseRemuneration: dto.deviseRemuneration ?? null,
        avantagesConvenus: dto.avantagesConvenus?.trim() || null,
        clauseEssai: dto.clauseEssai ?? false,
        essaiConstateParEcrit: dto.essaiConstateParEcrit ?? false,
        essaiDureeJours: dto.essaiDureeJours ?? null,
        dureePreavisJours: dto.dureePreavisJours ?? null,
        viseParOnem: dto.viseParOnem ?? false,
        dateVisaOnem: dto.dateVisaOnem ? new Date(dto.dateVisaOnem) : null,
        renouvelleDeId: dto.renouvelleDeId ?? null,
      },
    });
  }

  /**
   * AUDIT FINAL F226 · LA MONNAIE D'UN CONTRAT SAISI SANS ELLE. Le registre
   * ne l'a pas toujours demandée, et le contrôle du minimum s'abstient tant
   * qu'elle manque · sans ce chemin, un contrat en francs saisi avant la
   * colonne n'aurait plus jamais été confronté au SMIG. La monnaie se
   * COMPLÈTE et ne se change pas : changer celle d'un montant convenu, c'est
   * changer la rémunération du contrat, que le registre ne modifie pas. La
   * condition « encore nulle » est reposée dans l'écriture même, pour qu'un
   * second clic ou un autre poste ne l'écrase pas entre la lecture et elle.
   *
   * UNE ÉCRITURE UNITAIRE, JAMAIS UN `updateMany` (relecture adverse de
   * F226). Le journal d'audit ne recopie d'une opération de masse que son
   * filtre et son compte (`extension-audit.ts`) · la monnaie déclarée n'y
   * paraissait pas, alors que la colonne y est ADMISE précisément parce
   * qu'un contrat en francs déclaré en dollars échappe au contrôle du
   * minimum. `update` porte l'état avant et l'état après ; sa condition
   * « encore nulle » rend P2025 quand un autre poste a déclaré entre-temps.
   */
  async declarerDeviseRemuneration(tenantId: string, contratId: string, devise: 'CDF' | 'USD') {
    const contrat = await this.prisma.contratTravail.findFirst({
      where: { id: contratId, tenantId },
      select: { id: true, deviseRemuneration: true },
    });
    if (!contrat) throw new NotFoundException('Contrat introuvable dans ce dossier.');
    const refus = (deja: string | null) =>
      new ConflictException(
        `La monnaie de la rémunération de ce contrat est déjà déclarée${deja ? ` (${deja})` : ''}. ` +
          'Elle se complète quand elle manque, elle ne se change pas · le registre ne modifie pas un contrat.',
      );
    if (contrat.deviseRemuneration !== null) throw refus(contrat.deviseRemuneration);
    try {
      return await this.prisma.contratTravail.update({
        where: { id: contratId, tenantId, deviseRemuneration: null },
        data: { deviseRemuneration: devise },
      });
    } catch (erreur) {
      if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === 'P2025') throw refus(null);
      throw erreur;
    }
  }

  async terminerContrat(tenantId: string, contratId: string, dto: TerminerContratDto) {
    const contrat = await this.prisma.contratTravail.findFirst({
      where: { id: contratId, tenantId },
      select: { id: true, dateEntreeEnVigueur: true, dateFin: true },
    });
    if (!contrat) throw new NotFoundException('Contrat introuvable dans ce dossier.');
    const fin = new Date(dto.dateFin);
    if (fin.getTime() < contrat.dateEntreeEnVigueur.getTime()) {
      throw new BadRequestException(
        "La date de fin est antérieure à l'entrée en vigueur du contrat.",
      );
    }
    // UNE ÉCRITURE UNITAIRE, pour la raison qui vaut à la monnaie (relecture
    // de cohérence du lot 5, audit final F226) · la date de fin choisit le
    // mois de référence du contrôle du minimum, et un `updateMany` n'en
    // laissait au journal d'audit que le filtre et le compte, jamais la date.
    return this.prisma.contratTravail.update({
      where: { id: contratId, tenantId },
      data: { dateFin: fin, motifFin: dto.motifFin?.trim() || null },
    });
  }

  /**
   * LA CONFRONTATION · ce qu'un inspecteur du travail lirait.
   *
   * Elle est RECALCULÉE à chaque appel et jamais stockée : un contrat complété
   * hier doit cesser d'être signalé aujourd'hui, et une colonne du dossier
   * remplie entre-temps (le numéro CNSS de l'employeur, par exemple) lève le
   * manque sur TOUS les contrats d'un coup.
   *
   * UNE LISTE DE TRAVAIL, LUE PAR TRANCHES ET BORNÉE EN SORTIE (audit final
   * F259, § 8 bis). Elle rapatriait tout le registre d'un coup, enfants et
   * contrats compris. Les salariés se lisent désormais par lots
   * (`lireParLots`), chacun avec TOUS ses contrats · le rang de CDD de
   * l'art. 41 et la chaîne des renouvellements se comptent par salarié, et un
   * lot ne coupe jamais un salarié en deux. Seules les `PLAFOND_CONFRONTATION`
   * premières fiches, dans l'ordre du nom, sont rendues ; le nombre de
   * contrats et celui des signalements sont comptés sur le registre ENTIER,
   * sans quoi « 12 signalements » se lirait comme le compte du dossier.
   */
  async confronter(tenantId: string, aujourdhui = new Date()) {
    const [tenant, grilles] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { nom: true, numeroAffiliationCnssEmployeur: true },
      }),
      // Les grilles SMIG du cabinet · le minimum d'une classe se lit sur elles.
      this.grillesSmigDeLaConfrontation(tenantId, aujourdhui),
    ]);

    const employeur = {
      nom: tenant.nom,
      numeroAffiliationCnssEmployeur: tenant.numeroAffiliationCnssEmployeur,
    };

    const fichesDe = (s: SalarieConfronte) => {
      const pourControle = {
        nom: s.nom,
        postNom: s.postNom,
        prenoms: s.prenoms,
        sexe: s.sexe as string,
        numeroAffiliationCnss: s.numeroAffiliationCnss,
        dateNaissance: s.dateNaissance,
        millesimeNaissance: s.millesimeNaissance,
        lieuNaissance: s.lieuNaissance,
        nationalite: s.nationalite,
        nomConjoint: s.nomConjoint,
        aptitudeConstateeLe: s.aptitudeConstateeLe,
        // Compté par la base (`_count` filtré) · la confrontation ne lit rien
        // d'autre des enfants, et les rapatrier un à un pour les compter
        // faisait dépendre la mémoire de la taille des familles.
        enfantsSansDateNaissance: s._count.enfants,
      };

      // LE DÉCOMPTE DE L'ART. 41 SE FAIT PAR SALARIÉ ET PAR RANG, pas en
      // masse : c'est le NOMBRE DE CDD DÉJÀ CONCLUS, celui-ci compris, qui
      // fait basculer le troisième. Compter tous les CDD du salarié pour
      // chacun d'eux ferait requalifier le premier rétroactivement.
      let rangCdd = 0;
      return s.contrats.map((c) => {
        if (c.type === TypeContratTravail.DUREE_DETERMINEE) rangCdd += 1;
        const contrat: ContratPourControle = {
          type: c.type,
          constateParEcrit: c.constateParEcrit,
          viseParOnem: c.viseParOnem,
          dateEntreeEnVigueur: c.dateEntreeEnVigueur,
          dateConclusion: c.dateConclusion,
          lieuConclusion: c.lieuConclusion,
          dateFinPrevue: c.dateFinPrevue,
          ouvrageDetermine: c.ouvrageDetermine,
          motifRemplacement: c.motifRemplacement,
          emploiPermanent: c.emploiPermanent,
          natureTravail: c.natureTravail,
          lieuExecution: c.lieuExecution,
          remunerationBase: c.remunerationBase === null ? null : Number(c.remunerationBase),
          avantagesConvenus: c.avantagesConvenus,
          dureePreavisJours: c.dureePreavisJours,
          separeDeSaFamille: c.separeDeSaFamille,
          manoeuvreSansSpecialite: c.manoeuvreSansSpecialite,
          clauseEssai: c.clauseEssai,
          essaiConstateParEcrit: c.essaiConstateParEcrit,
          essaiDureeJours: c.essaiDureeJours,
          classeProfessionnelle: c.classeProfessionnelle,
          periodiciteRemuneration: c.periodiciteRemuneration,
          // AUDIT FINAL F226 · la monnaie du montant, sans laquelle le
          // contrôle du minimum lisait des dollars comme des francs.
          deviseRemuneration: c.deviseRemuneration,
        };
        const nombreRenouvellements = this.longueurChaineRenouvellement(s.contrats, c.id);
        const journeesJourLeJour =
          c.type === TypeContratTravail.JOUR_LE_JOUR ? journeesJourLeJourAvant(s.contrats, c) : undefined;
        // LE MOIS DE RÉFÉRENCE DU CONTRÔLE DE MINIMUM. Un contrat TERMINÉ se
        // juge sur son dernier mois · le barème a pu changer depuis, et le
        // confronter au minimum d'aujourd'hui reprocherait à l'employeur une
        // revalorisation postérieure au départ du salarié. Un contrat EN
        // COURS se juge au mois courant, parce que c'est ce qu'un inspecteur
        // du travail regarde.
        const moisDeReference = (c.dateFin ?? aujourdhui).toISOString().slice(0, 7);
        return {
          salarieId: s.id,
          salarie: [s.nom, s.postNom, s.prenoms].filter(Boolean).join(' '),
          contratId: c.id,
          type: c.type,
          dateEntreeEnVigueur: c.dateEntreeEnVigueur,
          dateFin: c.dateFin,
          mentionsManquantes: mentionsManquantes(employeur, pourControle, contrat),
          requalifications: requalifications(contrat, {
            nombreCdd: rangCdd,
            nombreRenouvellements,
            journeesJourLeJour,
          }),
          // ART. 40 AL. 2 · null quand le registre ne dit pas les journées ·
          // l'écran le dit au lieu de laisser croire la règle servie.
          jourLeJourNonCompte:
            c.type === TypeContratTravail.JOUR_LE_JOUR && journeesJourLeJour === null
              ? "Engagement au jour le jour · les journées des deux mois précédents ne se comptent pas sur le registre (engagements de plusieurs jours ou sans fin), et la requalification de l'article 40, alinéa 2 n'est pas examinée."
              : null,
          essai: verdictEssai(contrat),
          declarations: declarationsDues(
            {
              dateEntreeEnVigueur: c.dateEntreeEnVigueur,
              declarationEngagementLe: s.declarationEngagementLe,
              dateFin: c.dateFin,
              declarationDepartLe: s.declarationDepartLe,
            },
            aujourdhui,
          ),
          aptitudeProvisoirePerimee: aptitudeProvisoirePerimee(
            { aptitudeProvisoire: s.aptitudeProvisoire },
            contrat,
            aujourdhui,
          ),
          // ART. 47 · le défaut de visa ouvre au travailleur la résiliation
          // sans préavis. Il n'est pas une requalification · il est rendu à
          // part pour ne pas se confondre avec elles. L'art. 47 vise le
          // CONTRAT DE TRAVAIL · le visa d'un apprentissage relève de l'art. 21,
          // dont l'effet est une présomption de contrat de travail, rendue
          // parmi les requalifications (passe D2).
          visaOnemManquant:
            c.type !== TypeContratTravail.APPRENTISSAGE && c.constateParEcrit && !c.viseParOnem,
          moisDeReference,
          remunerationMinimale: verdictRemunerationMinimale(contrat, moisDeReference, grilles.annexes, grilles.nonLues),
        };
      });
    };
    type FicheConfrontee = ReturnType<typeof fichesDe>[number];

    // L'ordre de l'écran · le nom du salarié, puis ses contrats dans l'ordre
    // de leur entrée en vigueur. L'identifiant du salarié départage deux
    // homonymes, pour que leurs contrats ne s'entrelacent pas.
    const fiches = new PremiersSelon<FicheConfrontee>(
      PLAFOND_CONFRONTATION,
      (a, b) =>
        a.salarie.localeCompare(b.salarie, 'fr') ||
        a.salarieId.localeCompare(b.salarieId) ||
        a.dateEntreeEnVigueur.getTime() - b.dateEntreeEnVigueur.getTime() ||
        a.contratId.localeCompare(b.contratId),
    );
    let totalSignalements = 0;
    await lireParLots(
      (curseur) =>
        this.prisma.salarie.findMany({
          where: { tenantId },
          include: {
            contrats: { orderBy: { dateEntreeEnVigueur: 'asc' } },
            _count: { select: { enfants: { where: { dateNaissance: null } } } },
          },
          ...pageApres(curseur, LOT_CONFRONTATION),
        }),
      (s) => {
        for (const f of fichesDe(s)) {
          totalSignalements +=
            f.mentionsManquantes.length +
            f.requalifications.length +
            f.declarations.filter((d) => d.enRetard).length +
            (f.remunerationMinimale.conforme === false ? 1 : 0);
          fiches.ajouter(f);
        }
      },
      LOT_CONFRONTATION,
    );

    return {
      employeur,
      // Un dossier qui n'a pas saisi son numéro CNSS d'employeur le voit UNE
      // fois, en tête, et non répété sur chaque contrat.
      manqueEmployeur: tenant.numeroAffiliationCnssEmployeur === null,
      fiches: fiches.elements(),
      totalFiches: fiches.nombre,
      plafond: PLAFOND_CONFRONTATION,
      tronque: fiches.tronquee,
      totalSignalements,
      // Les grilles SMIG du cabinet que la confrontation a lues · tronquée,
      // la liste le dit, et chaque contrat qu'une grille non lue régirait
      // s'abstient (motif GRILLES_SMIG_NON_LUES).
      grillesSmig: {
        lues: grilles.annexes.length,
        total: grilles.total,
        plafond: PLAFOND_GRILLES_SMIG,
        tronque: grilles.nonLues !== null,
      },
    };
  }

  /**
   * LES GRILLES SMIG QUE LA CONFRONTATION PEUT APPLIQUER, LUES PAR UNE BORNE
   * DÉCLARÉE (audit final F259, reste ; `PLAFOND_GRILLES_SMIG`).
   *
   * La grille d'un mois est la plus récente dont le mois d'effet est atteint
   * (`annexeApplicable`). Le plus tardif des mois de référence est connu
   * d'avance · le mois courant, ou la fin d'un contrat terminée plus tard ·
   * et une grille postérieure ne régit aucun contrat : elle n'est pas lue.
   * Les autres le sont des plus récentes aux plus anciennes · au-delà de la
   * borne, les plus anciennes restent en base, et l'intervalle qu'elles
   * couvrent est rendu (`nonLues`) pour que le contrôle s'abstienne sur les
   * seuls contrats qu'elles régiraient, jamais sur les autres.
   */
  private async grillesSmigDeLaConfrontation(tenantId: string, aujourdhui: Date) {
    const { _max } = await this.prisma.contratTravail.aggregate({
      where: { tenantId },
      _max: { dateFin: true },
    });
    // Même lecture du mois que `moisDeReference` · le jour UTC de la date.
    const dernierMois = [aujourdhui, _max.dateFin]
      .filter((d): d is Date => d !== null)
      .map((d) => d.toISOString().slice(0, 7))
      .sort()
      .pop()!;
    const [annee, mois] = dernierMois.split('-').map(Number);
    const moisSuivant = new Date(Date.UTC(annee, mois, 1)).toISOString().slice(0, 10);
    // `aPartirDu` est une date AAAA-MM-JJ écrite en chaîne · l'ordre des
    // chaînes est celui des dates. Le filtre est écrit DANS chaque appel, et
    // non dans une variable partagée · le balayage de `cloisonnement.spec.ts`
    // lit la borne du dossier dans le corps de l'appel, et une variable
    // l'obligerait à geler une exception de plus.
    const [lignes, decompte] = await Promise.all([
      this.prisma.versionBaremePaie.findMany({
        where: { tenantId, bareme: 'SMIG', aPartirDu: { lt: moisSuivant } },
        orderBy: { aPartirDu: 'desc' },
        take: PLAFOND_GRILLES_SMIG,
        select: { bareme: true, aPartirDu: true, reference: true, valeurs: true },
      }),
      this.prisma.versionBaremePaie.aggregate({
        where: { tenantId, bareme: 'SMIG', aPartirDu: { lt: moisSuivant } },
        _count: { _all: true },
        _min: { aPartirDu: true },
      }),
    ]);
    const total = decompte._count._all;
    const nonLues: GrillesSmigNonLues | null =
      total > lignes.length && decompte._min.aPartirDu !== null && lignes.length > 0
        ? { du: decompte._min.aPartirDu.slice(0, 7), avant: lignes[lignes.length - 1].aPartirDu.slice(0, 7) }
        : null;
    return { annexes: annexesSmigDuDossier(lignes), total, nonLues };
  }

  /**
   * LES VERSIONS DU CABINET QU'UN MOIS DE PAIE PEUT APPLIQUER, ET ELLES SEULES
   * (audit final F259, suite).
   *
   * La simulation lisait TOUTES les versions du dossier, à chaque calcul et
   * sans borne. Or chaque moteur n'en retient qu'une par barème · la plus
   * récente dont le MOIS d'effet est atteint (`baremeDuMois` pour la CNSS,
   * l'INPP et l'ONEM, `annexeApplicable` pour le SMIG), après fusion avec les
   * versions livrées, qu'elles départagent par la date d'effet. Une version
   * du cabinet plus ancienne que la plus récente du même barème ne peut donc
   * jamais être retenue, et une version postérieure au mois non plus · seule
   * la plus récente au plus tard du mois l'est. On lit celle-là, une par
   * barème servi, et c'est TOUT ce que le moteur lisait. Une version livrée
   * plus récente qu'elle l'emporte toujours, puisque la fusion se fait
   * après la lecture, exactement comme avant.
   *
   * « Au plus tard du mois » s'écrit « avant le premier jour du mois
   * suivant » · `aPartirDu` est une date AAAA-MM-JJ en chaîne, dont l'ordre
   * est celui des dates, et le moteur compare les MOIS · une version datée
   * du 15 régit déjà le mois qui la porte. Le filtre est écrit DANS chaque
   * appel, pour la raison dite plus haut (balayage du cloisonnement). Un
   * test rejoue la simulation sur toutes les versions et sur celles-ci, et
   * exige le même résultat au centime (`simulation-baremes-du-mois.spec.ts`).
   */
  private async versionsBaremesDuMois(tenantId: string, moisDePaie: string): Promise<LigneVersion[]> {
    // Le mois est déjà reconnu AAAA-MM (`moisValide`, en tête de simulerPaie).
    const [annee, mois] = moisDePaie.split('-').map(Number);
    const moisSuivant = new Date(Date.UTC(annee, mois, 1)).toISOString().slice(0, 10);
    const lignes = await Promise.all(
      BAREMES_SERVIS.map((bareme) =>
        this.prisma.versionBaremePaie.findFirst({
          where: { tenantId, bareme, aPartirDu: { lt: moisSuivant } },
          orderBy: { aPartirDu: 'desc' },
          select: { bareme: true, aPartirDu: true, reference: true, valeurs: true },
        }),
      ),
    );
    return lignes.filter((l): l is NonNullable<typeof l> => l !== null);
  }


  /**
   * LE « TAUX LÉGAL » DE L'ARTICLE 69, 1, ET POURQUOI IL EST CALCULÉ ICI.
   *
   * La colonne 19 des annexes du décret n° 25/22 donne un taux JOURNALIER par
   * enfant. L'immunité de l'article 69, 1 borne ce que l'employeur accorde
   * SUR LA PÉRIODE DE PAIE · on mensualise donc par le multiplicateur de
   * l'article 7 du décret, vingt-six, et on porte au nombre d'enfants
   * BÉNÉFICIAIRES. Rendre `null` n'est pas une panne : c'est ce qui déclenche
   * l'abstention en aval, et elle vaut mieux qu'un plafond inventé.
   */
  private tauxLegalAllocationsFamiliales(dto: SimulationPaieDto, annexesSmig: readonly Annexe[] = []): number | null {
    if (typeof dto.tauxLegalAllocationsFamilialesFc === 'number') {
      return dto.tauxLegalAllocationsFamilialesFc;
    }
    const enfants = dto.enfantsBeneficiairesAllocations;
    if (typeof enfants !== 'number') return null;
    const a = allocationFamilialeJournaliere(dto.moisDePaie, enfants, annexesSmig);
    if (!a.valeur) return null;
    // PASSE D2 · les jours qui OUVRENT DROIT (mention 28 du modèle de 2008),
    // quand ils sont déclarés · un mois incomplet mensualisé à 26 jours
    // plaçait le plafond trop haut, et l'excédent imposable n'était pas repris.
    return a.valeur.totalFc * (dto.joursAllocationsFamiliales ?? MULTIPLICATEURS_ARTICLE_7.MOIS);
  }

  /** La réserve du plafond calculé · sur quels jours, et ce qu'il faut déclarer. */
  private reserveTauxLegalAllocations(dto: SimulationPaieDto, tauxFc: number | null): string | null {
    if (typeof dto.tauxLegalAllocationsFamilialesFc === 'number' || tauxFc === null) return null;
    if (typeof dto.joursAllocationsFamiliales === 'number') {
      return `Plafond de l'article 69, 1 calculé sur ${dto.joursAllocationsFamiliales} jour(s) ouvrant droit aux allocations familiales (mention 28 de l'arrêté du 8 août 2008).`;
    }
    const incomplet = typeof dto.joursPayes === 'number' && dto.joursPayes < MULTIPLICATEURS_ARTICLE_7.MOIS;
    return (
      "Plafond de l'article 69, 1 mensualisé à 26 jours (décret n° 25/22, art. 7) · valable pour un mois entier. " +
      (incomplet
        ? `Le mois est déclaré incomplet (${dto.joursPayes} jours payés) : déclarez les jours ouvrant droit aux allocations (jours payés à 100 %, de congé payé et payés aux deux tiers, mention 28), sans quoi le plafond est trop haut.`
        : 'Sur un mois incomplet, déclarez les jours ouvrant droit aux allocations (mention 28).')
    );
  }

  /**
   * LE SALAIRE STIPULÉ EN DOLLARS, ramené en francs AVANT tout calcul · les
   * assiettes, les cotisations, l'IRPP et la passation ne connaissent que le
   * franc congolais, et c'est voulu : les textes ne libellent qu'en francs.
   * Voir conversion-usd.ts pour la règle (cours du JOUR, saisi au dossier,
   * jamais un autre) et sa source (décision du cabinet, faute de texte).
   *
   * Rend le DTO en francs et la trace de la conversion · la trace voyage avec
   * la simulation, donc avec le bulletin émis, qui fige le cours appliqué.
   */
  private async convertirEnFrancs(
    tenantId: string,
    dto: SimulationPaieDto,
    maintenant: Date,
  ): Promise<{ dtoFc: SimulationPaieDto; conversion: ConversionUsd | null }> {
    if ((dto.deviseStipulation ?? 'CDF') === 'CDF') {
      const sansFc = dto.elements.filter((e) => typeof e.montantFc !== 'number');
      if (sansFc.length > 0) {
        throw new BadRequestException(
          `Élément(s) sans montant en francs : ${sansFc.map((e) => e.libelle).join(', ')} · un montant en dollars ` +
            'suppose de déclarer la rémunération stipulée en USD.',
        );
      }
      return { dtoFc: dto, conversion: null };
    }
    const sansUsd = dto.elements.filter((e) => typeof e.montantUsd !== 'number');
    if (sansUsd.length > 0) {
      throw new BadRequestException(
        `Rémunération stipulée en USD · élément(s) sans montant en dollars : ${sansUsd.map((e) => e.libelle).join(', ')}.`,
      );
    }
    const jour = jourDeKinshasa(maintenant);
    const cote = await this.prisma.coursDevise.findFirst({
      where: { date: jour, devise: { tenantId, code: 'USD' } },
      select: { cours: true, source: true },
    });
    if (!cote) throw new BadRequestException(messageCoursManquant(jour));
    const cours = Number(cote.cours);
    return {
      dtoFc: {
        ...dto,
        elements: dto.elements.map((e) => ({ ...e, montantFc: usdEnFc(e.montantUsd!, cours) })),
      },
      conversion: {
        devise: 'USD',
        cours,
        dateCours: jour.toISOString().slice(0, 10),
        sourceCours: cote.source ?? null,
        elements: dto.elements.map((e) => ({
          libelle: e.libelle,
          montantUsd: e.montantUsd!,
          montantFc: usdEnFc(e.montantUsd!, cours),
        })),
        avertissement: AVERTISSEMENT_ARTICLE_89,
      },
    };
  }

  /**
   * LA SAISIE RELUE AU SERVEUR, avant tout calcul.
   *
   * (1) UNE RUBRIQUE DU CABINET IMPOSE SA NATURE · celle que le client envoie
   * est remplacée par la nature enregistrée (rubriques-paie.ts). Sans cela,
   * une prime conventionnelle renvoyée « INDEMNITE_DE_TRANSPORT » par un
   * navigateur sortirait de l'assiette sociale. Le DTO rendu est celui que le
   * bulletin fige, si bien que la passation de P9 relit la bonne nature.
   *
   * (2) UNE RETENUE D'AVANCE SE RELIT AU REGISTRE · elle doit viser une
   * avance DE CE SALARIÉ, de ce dossier, et ne pas dépasser ce qui reste dû.
   * Le type et la catégorie viennent du registre, jamais du client, parce
   * qu'ils choisissent le compte crédité (4211, 4212 ou 272).
   */
  async resoudreSaisie(tenantId: string, salarieId: string | null, dto: SimulationPaieDto) {
    const idsRubriques = [...new Set(dto.elements.map((e) => e.rubriqueId).filter((x): x is string => !!x))];
    let elements = dto.elements;
    if (idsRubriques.length) {
      const rubriques = await this.prisma.rubriquePaie.findMany({ where: { tenantId, id: { in: idsRubriques } } });
      elements = dto.elements.map((e) => {
        if (!e.rubriqueId) return e;
        const r = rubriques.find((x) => x.id === e.rubriqueId);
        if (!r) throw new BadRequestException('Rubrique de paie introuvable dans ce dossier.');
        if (!r.actif) throw new BadRequestException(`La rubrique ${r.code} est désactivée · réactivez-la ou retirez l'élément.`);
        return { ...e, nature: r.nature, libelle: e.libelle?.trim() ? e.libelle : r.libelle };
      });
    }

    const demandees = dto.retenuesAvances ?? [];
    const retenuesAvances: {
      avanceId: string;
      type: TypeAvance;
      categoriePret: CategoriePret | null;
      littera: 'c' | 'f' | 'g';
      libelle: string;
      montantFc: number;
      soldeAvantFc: number;
    }[] = [];
    if (demandees.length) {
      if (!salarieId) throw new BadRequestException("Une retenue d'avance se rapporte à un salarié · choisissez-le.");
      const ids = demandees.map((r) => r.avanceId);
      if (new Set(ids).size !== ids.length) throw new BadRequestException('Une même avance figure deux fois dans les retenues.');
      const avances = await this.prisma.avanceSalaire.findMany({
        where: { tenantId, id: { in: ids } },
        include: { retenues: { select: { montantFc: true, bulletin: { select: { statut: true } } } } },
      });
      for (const r of demandees) {
        const a = avances.find((x) => x.id === r.avanceId);
        if (!a || a.salarieId !== salarieId) {
          throw new BadRequestException("Avance introuvable pour ce salarié · une retenue ne vise que les avances du salarié payé.");
        }
        const solde = soldeAvance(
          Number(a.montantFc),
          a.retenues.map((x) => ({ montantFc: Number(x.montantFc), bulletinAnnule: x.bulletin.statut !== StatutBulletinPaie.EMIS })),
        );
        const libelle =
          a.type === 'SAISIE_ARRET'
            ? `Saisie-arrêt notifiée le ${a.dateOctroi.toISOString().slice(0, 10)} (acte ${a.referenceActe ?? '·'}) · ${a.objet}`
            : `${a.type === 'PRET' ? 'Prêt' : a.type === 'ACOMPTE' ? 'Acompte' : 'Avance'} du ${a.dateOctroi.toISOString().slice(0, 10)} · ${a.objet}`;
        const refus = motifRefusRetenue(r.montantFc, solde, libelle);
        if (refus) throw new BadRequestException(refus);
        // UNE SAISIE NE MORD QUE DE LA NOTIFICATION À LA MAINLEVÉE (AUPSRVE,
        // art. 187 et 201) · passe O4-C2.
        if (a.type === 'SAISIE_ARRET' && moisValide(dto.moisDePaie)) {
          const refusMois = motifRefusMoisSaisie(dto.moisDePaie, a.dateOctroi, a.dateFin);
          if (refusMois) throw new BadRequestException(refusMois);
        }
        retenuesAvances.push({
          avanceId: a.id,
          type: a.type as TypeAvance,
          categoriePret: (a.categoriePret as CategoriePret | null) ?? null,
          littera: LITTERA_ARTICLE_112[a.type as TypeAvance],
          libelle,
          montantFc: r.montantFc,
          soldeAvantFc: solde,
        });
      }
    }
    // Passe F5 · « fourni en nature » ne se dit que du logement, du transport
    // et des soins (loi n° 23/053, art. 69, 8°). Sur un salaire, il ferait
    // disparaître du net une somme versée ; l'avantage en nature, lui, l'est
    // déjà par sa nature.
    const horsChamp = elements.find(
      (e) => e.enNature === true && !NATURES_FOURNIES_EN_NATURE.includes(e.nature as NatureElementPaie),
    );
    if (horsChamp) {
      throw new BadRequestException(
        `« ${horsChamp.libelle} » · seuls le logement, le transport et les soins se déclarent fournis en nature.`,
      );
    }
    return { dto: { ...dto, elements }, retenuesAvances };
  }

  /**
   * LA SIMULATION DE PAIE D'UN MOIS · les deux assiettes, les cotisations des
   * deux côtés, la retenue de l'art. 119, le net, la quotité de l'art. 114 et
   * la proposition d'écriture.
   *
   * CE QU'ELLE N'EST PAS · un bulletin. Rien n'est stocké et rien n'est passé
   * au journal ; c'est l'ÉMISSION du bulletin qui fige ce calcul (art. 103),
   * et la paie du mois qui le passe (audit final F109 · cet en-tête disait
   * encore qu'aucune cotisation patronale n'était liquidée ni aucune écriture
   * proposée).
   *
   * POURQUOI ELLE EXISTE QUAND MÊME. Les deux assiettes d'un bulletin
   * congolais ne coïncident pas, et c'est l'erreur la plus coûteuse du
   * domaine : elle laisse un bulletin dont tous les totaux s'additionnent, un
   * net à payer plausible, et une retenue fausse. La rendre VISIBLE, élément
   * par élément, avec l'article qui décide de chacun, est ce qui permet à un
   * cabinet de vérifier avant de payer.
   *
   * LE NOMBRE DE PERSONNES À CHARGE EST PROPOSÉ, JAMAIS SUBSTITUÉ · même
   * parti que la part de main-d'œuvre nationale de l'effectif, et pour une
   * raison écrite dans le texte : l'article 124 ne compte les enfants et les
   * ascendants que « pour autant qu'ils n'aient pas bénéficié personnellement
   * […] des ressources nettes ne dépassant pas le revenu de la première
   * tranche », donnée qu'aucun livre du dossier ne porte. Et l'article 125
   * fige la situation de famille AU 1er JANVIER de l'année de réalisation des
   * revenus, non au jour de la paie · un enfant né en mars ne compte qu'en
   * janvier suivant.
   *
   * (Relecture de cohérence du lot 5 · ce commentaire était empilé sur celui
   * de `tauxLegalAllocationsFamiliales`, qu'il ne documentait pas, même
   * défaut que celui qu'a corrigé l'audit final F245 dans la console.)
   */
  async simulerPaie(
    tenantId: string,
    salarieId: string | null,
    dtoSaisi: SimulationPaieDto,
    maintenant: Date = new Date(),
  ) {
    // Le mois borne la lecture des barèmes du cabinet (`versionsBaremesDuMois`)
    // · illisible, il n'en bornerait aucun, et la simulation mêlerait des
    // barèmes que personne n'a demandés. Même refus, mot pour mot, que
    // l'émission du bulletin et la passation du mois.
    if (!moisValide(dtoSaisi.moisDePaie)) {
      throw new BadRequestException('Mois de paie illisible · la forme attendue est AAAA-MM.');
    }
    const { dto: dtoStipule, retenuesAvances } = await this.resoudreSaisie(tenantId, salarieId, dtoSaisi);
    const retenuesAvancesFc = retenuesAvances.reduce((s, r) => s + r.montantFc, 0);
    const { dtoFc: dto, conversion } = await this.convertirEnFrancs(tenantId, dtoStipule, maintenant);
    const borne = baremeApplicableAuMois(dto.moisDePaie);
    // Les versions de barème que le cabinet a ajoutées (baremes-dossier.ts) ·
    // taux de cotisation et grilles SMIG, pris à partir de leur mois d'effet,
    // et lues pour CE mois seulement (audit final F259, suite).
    const versionsBaremes = await this.versionsBaremesDuMois(tenantId, dto.moisDePaie);
    const annexesSmig = annexesSmigDuDossier(versionsBaremes);

    // Le salarié n'est lu QUE pour proposer un nombre de personnes à charge,
    // et il est borné au dossier de la session · un identifiant venu du client
    // ne désigne jamais à lui seul la ligne à lire.
    let propositionPersonnesACharge: number | null = null;
    let sourceProposition: string | null = null;
    // LE RÉGIME CNSS SE LIT SUR LE CONTRAT DU MOIS (passe D2) · un apprenti
    // n'est assujetti qu'aux risques professionnels (loi n° 16/009, art. 4).
    // Null sans salarié ou sans contrat couvrant le mois, et la réserve le dit.
    let regimeCnss: RegimeCnss | null = null;
    if (salarieId) {
      const salarie = await this.prisma.salarie.findFirst({
        where: { id: salarieId, tenantId },
        select: {
          nom: true,
          nomConjoint: true,
          _count: { select: { enfants: true } },
          contrats: { select: { id: true, type: true, dateEntreeEnVigueur: true, dateFin: true } },
        },
      });
      if (!salarie) throw new NotFoundException('Salarié introuvable dans ce dossier.');
      const contratDuMois = contratCouvrantLeMois(salarie.contrats ?? [], dto.moisDePaie);
      if (contratDuMois) {
        regimeCnss = contratDuMois.type === TypeContratTravail.APPRENTISSAGE ? 'APPRENTI' : 'TRAVAILLEUR';
      }
      // ANOMALIE DU TEXTE, signalée (passe F5) · l'art. 124, al. 2 écrit que
      // ne sont à charge que ceux qui « n'aient pas bénéficié [...] des
      // ressources nettes NE DÉPASSANT PAS » la première tranche · lue à la
      // lettre, la double négation écarterait ceux qui n'ont presque rien.
      // OmegaX retient la lecture de l'éditeur, les ressources SUPÉRIEURES
      // excluent, et la dit.
      const conjoint = salarie.nomConjoint ? 1 : 0;
      propositionPersonnesACharge = conjoint + salarie._count.enfants;
      sourceProposition =
        `Registre du personnel · ${conjoint} conjoint et ${salarie._count.enfants} enfant(s) à charge. ` +
        "L'article 124 y ajoute les ascendants des deux conjoints faisant partie du ménage, que le registre ne tient pas, " +
        "et il écarte les enfants et ascendants qui ont disposé, pendant l'année précédant celle de la réalisation des revenus, de ressources nettes supérieures à la première tranche du barème (1 944 000 FC). " +
        "L'article 125 fige la situation au 1er janvier de l'année. La lettre de l'art. 124, al. 2 est inversée (double négation) · la lecture retenue est celle de l'éditeur. Le nombre retenu appartient donc au cabinet.";
    }

    const elements: ElementPaie[] = dto.elements.map((e) => ({
      nature: e.nature as NatureElementPaie,
      libelle: e.libelle,
      montantFc: e.montantFc,
      remboursementDeDepenseProfessionnelleEffective:
        e.remboursementDeDepenseProfessionnelleEffective,
      conditionArticle69Attestee: e.conditionArticle69Attestee ?? null,
      enNature: e.enNature === true,
    }));

    // L'ORDRE DE CALCUL EST LE POINT DÉLICAT, ET IL EST DANS LES TEXTES.
    // L'assiette SOCIALE ne dépend d'aucune cotisation : on la prend d'abord,
    // à retenues nulles. Les cotisations s'y assoient. La quote-part ouvrière
    // qui en sort ENTRE ALORS dans les retenues de l'article 71, et c'est
    // seulement là que l'assiette fiscale nette se ferme. Calculer l'impôt
    // avant les cotisations le surestimerait de 5 % de l'assiette sociale.
    // ARTICLE 69, 1 · LE « TAUX LÉGAL » SE CALCULE, IL NE SE SAISIT PLUS.
    // Voir RESOLUTION_TAUX_LEGAL_ALLOCATIONS · c'est la colonne 19 du décret
    // n° 25/22, mensualisée par le multiplicateur de l'article 7 et portée au
    // nombre d'ENFANTS BÉNÉFICIAIRES, qui n'est pas le nombre de personnes à
    // charge de l'article 124. Un taux saisi PRIME, pour le mois qu'aucune
    // annexe ne couvre. Ni l'un ni l'autre, et l'assiette s'abstient.
    const tauxLegalAllocationsFamilialesFc = this.tauxLegalAllocationsFamiliales(dto, annexesSmig);

    const premierPassage = assiettes(elements, {
      tauxLegalAllocationsFamilialesFc,
    });
    const lesCotisations = cotisations(premierPassage.assietteSocialeFc, {
      moisDePaie: dto.moisDePaie,
      versionsDossier: versionsDuDossier(versionsBaremes),
      natureEmployeurInpp: (dto.natureEmployeurInpp as NatureEmployeurInpp | undefined) ?? null,
      effectif: dto.effectif ?? null,
      majorationRisquesProfessionnelsPourCent: dto.majorationRisquesProfessionnelsPourCent ?? null,
      regimeCnss,
      // Le plancher de la CNSS (audit final F112) · la grille SMIG du dossier
      // et les jours payés d'un mois incomplet.
      joursPayes: dto.joursPayes ?? null,
      annexesSmig,
    });

    // Le champ saisi porte les AUTRES versements de l'article 71 (une caisse
    // de pension complémentaire, une assurance-maladie souscrite sous le
    // patronage de l'employeur). La quote-part ouvrière de la CNSS, elle, est
    // calculée · la faire saisir en plus la compterait deux fois.
    const retenuesArticle71Fc =
      lesCotisations.totalTravailleurFc + Math.max(0, dto.retenuesArticle71Fc ?? 0);

    const deuxAssiettes = assiettes(elements, {
      tauxLegalAllocationsFamilialesFc,
      retenuesArticle71Fc,
    });

    // TROIS RAISONS DE NE PAS CHIFFRER LA RETENUE, et aucune n'est une panne.
    // Le barème hors de sa période, une assiette indéterminée, et c'est tout ·
    // un nombre de personnes à charge absent vaut ZÉRO réduction, ce qui est
    // le sens défavorable au contribuable et donc celui qu'on ne suppose pas
    // en sa faveur.
    // ARTICLE 121, ALINÉA 2 · un forfait libératoire n'est pas le barème. Il
    // s'abstient plutôt que de retenir l'article 118 (audit final F105).
    const regime = regimeApplicable(dto.regimeSalarial ?? 'BAREME_ARTICLE_118');
    const retenue =
      borne.applicable && regime.calculable && deuxAssiettes.assietteFiscaleNetteFc !== null
        ? retenueMensuelle(
            dto.moisDePaie,
            deuxAssiettes.assietteFiscaleNetteFc,
            dto.personnesACharge ?? 0,
          )
        : null;

    // Le TOTAL VERSÉ n'est pas l'assiette · les cinq exclusions de l'article 7
    // sortent de la rémunération, pas de ce que l'employeur paie.
    // L'avantage en nature entre dans les assiettes, pas dans ce qui est
    // versé (audit final F22, `estVerseEnEspeces`).
    const totalVerseFc = elements
      .filter((e) => estVerseEnEspeces(e.nature as NatureElementPaie, e.enNature))
      .reduce((n, e) => n + Math.max(0, e.montantFc), 0);
    const net = netAPayer(
      totalVerseFc,
      lesCotisations.totalTravailleurFc,
      retenue ? retenue.retenueFc : null,
      retenuesAvancesFc,
    );
    // UN NET NÉGATIF N'EST PAS PAYABLE · les retenues d'avance dépasseraient
    // ce qui est dû au travailleur ce mois-ci. Le ramener à zéro ferait
    // mentir le 422 de la passation ; la retenue se réduit, elle ne se force pas.
    if (net.netAPayerFc !== null && net.netAPayerFc < 0) {
      throw new BadRequestException(
        `Les retenues d'avance et de prêt (${retenuesAvancesFc.toFixed(2)} FC) dépassent ce qui reste dû au travailleur ce mois-ci · réduisez-les.`,
      );
    }

    // LA PASSATION LIT LE RÉFÉRENTIEL DU DOSSIER, et elle est la seule de ce
    // module à en dépendre · le Code du travail et la loi fiscale ne
    // connaissent ni le SYCEBNL ni le SYSCOHADA, le PLAN DE COMPTES si.
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { referentiel: true, ville: true },
    });
    const passation = passationPaie({
      referentiel: tenant.referentiel as Referentiel,
      elements: dto.elements.map((e) => ({
        nature: e.nature as NatureElementPaie,
        libelle: e.libelle,
        montantFc: e.montantFc,
        enNature: e.enNature === true,
      })),
      cotisations: lesCotisations.lignes.map((l) => ({
        cle: l.cle,
        charge: l.charge,
        montantFc: l.montantFc,
      })),
      abstentionsCotisations: lesCotisations.abstentions,
      irppFc: retenue ? retenue.retenueFc : null,
      netAPayerFc: net.netAPayerFc,
      retenuesAvances: retenuesAvances.map((r) => ({
        type: r.type,
        categoriePret: r.categoriePret,
        libelle: r.libelle,
        montantFc: r.montantFc,
      })),
    });

    // ARTICLE 114 · LA QUOTITÉ SAISISSABLE S'ASSIED SUR LA RÉMUNÉRATION AU
    // SENS DE L'ARTICLE 7, qui est exactement l'assiette SOCIALE, et sur les
    // retenues réellement liquidées ci-dessus. Elle s'abstient d'elle-même
    // quand la classe manque ou qu'un logement est fourni en nature.
    const quotite = quotiteSaisissable({
      moisDePaie: dto.moisDePaie,
      annexesSmig,
      remunerationFc: deuxAssiettes.assietteSocialeFc,
      classeProfessionnelle: dto.classeProfessionnelle ?? null,
      // Non chiffrées, elles valent null et la quotité s'abstient · lues
      // comme zéro, elles gonflaient la part saisissable (audit final F104).
      retenuesFiscalesFc: retenue ? retenue.retenueFc : null,
      retenuesSocialesFc: lesCotisations.lignes.some((l) => l.charge === 'TRAVAILLEUR')
        ? lesCotisations.totalTravailleurFc
        : null,
      logementFourniEnNature: dto.logementFourniEnNature,
      logementEnNatureDejaDefalque: dto.logementEnNatureDejaDefalque,
      // ARTICLE 138 · fournir et indemniser sont ALTERNATIFS. Les deux
      // déclarés ensemble n'est pas interdit, c'est inhabituel · on le dit.
      indemniteDeLogementVersee: elements.some(
        // Fourni en nature, le logement n'est pas une INDEMNITÉ (passe F5).
        (e) => e.nature === 'LOGEMENT_OU_SON_INDEMNITE' && e.montantFc > 0 && e.enNature !== true,
      ),
      obligationAlimentaireLegale: dto.obligationAlimentaireLegale,
    });

    return {
      moisDePaie: dto.moisDePaie,
      referentiel: tenant.referentiel,
      // null pour une rémunération en francs · sinon le cours, sa date et le
      // détail élément par élément, figés avec le bulletin émis.
      conversion,
      passation,
      quotite,
      // ARTICLE 112, c) ET f) · figées avec le bulletin, relues par P9.
      retenuesAvances,
      reserveRetenuesAvances: retenuesAvances.length ? RESERVE_QUOTITE_AVANCES : null,
      // « Sans excéder la portion saisissable » (AUPSRVE, art. 188) · confrontée,
      // jamais refusée (passe O4-C2). La plus large des quotités chiffrées ·
      // l'alimentaire et le cumul de l'alinéa 3 ne jouent que si déclarés.
      reserveSaisies: reserveQuotiteSaisies(
        retenuesAvances.filter((r) => r.type === 'SAISIE_ARRET').reduce((s, r) => s + r.montantFc, 0),
        quotite.quotiteCumuleeFc ?? quotite.quotiteAlimentaireFc ?? quotite.quotiteOrdinaireFc,
      ),
      // ARTICLE 112 · LA LISTE FERMÉE VOYAGE AVEC LA SIMULATION, parce
      // qu'une retenue illicite a exactement l'aspect d'une retenue licite
      // sur un bulletin, et qu'aucun contrôle ne la rattrape après coup.
      retenuesAutorisees: {
        liste: RETENUES_ARTICLE_112,
        sanction: SANCTION_ARTICLE_112,
        cotisationSyndicale: REPONSE_COTISATION_SYNDICALE,
        cessionSyndicale: RESERVE_CESSION_SYNDICALE,
        litteraeDatees: RESERVE_LITTERAE_DATEES,
      },
      tauxLegalAllocationsFamilialesFc,
      reserveTauxLegalAllocations: this.reserveTauxLegalAllocations(dto, tauxLegalAllocationsFamilialesFc),
      // Mention 29 du modèle de 2008 · le taux journalier PAR ENFANT, quand
      // le plafond a été calculé et non saisi (passe D2).
      tauxJournalierAllocationsFamilialesFc:
        typeof dto.tauxLegalAllocationsFamilialesFc !== 'number' && typeof dto.enfantsBeneficiairesAllocations === 'number'
          ? (allocationFamilialeJournaliere(dto.moisDePaie, 1, annexesSmig).valeur?.parEnfantFc ?? null)
          : null,
      // PASSE F11 · l'obligation de l'employeur qui verse une indemnité de
      // logement à Kinshasa (arrêté provincial n° 016/2023, art. 3 et 7).
      reserveIndemniteLogement: reserveIndemniteLogementKinshasa(elements, tenant.ville, dto.moisDePaie),
      cotisations: lesCotisations,
      net,
      baremeApplicable: borne.applicable,
      motifBaremeInapplicable: borne.motif,
      regimeSalarial: {
        regime: dto.regimeSalarial ?? 'BAREME_ARTICLE_118',
        declare: dto.regimeSalarial !== undefined,
        calculable: regime.calculable,
        motif: dto.regimeSalarial === undefined ? RESERVE_REGIME_NON_DECLARE : regime.motif,
      },
      assiettes: deuxAssiettes,
      personnesAChargeRetenues: dto.personnesACharge ?? 0,
      propositionPersonnesACharge,
      sourceProposition,
      retenue,
      avertissement:
        "Ceci n'est PAS un bulletin de paie et ne tient PAS lieu de livre de paie des articles 213 à 215. " +
        "OmegaX rend ici les deux assiettes, les cotisations des deux côtés, la retenue de l'article 119, " +
        "le net, la quotité saisissable de l'article 114 et une PROPOSITION d'écriture · il ne conserve " +
        "rien, ne poste rien et ne remet aucun décompte écrit au sens de l'article 103. " +
        "Le décompte écrit s'obtient en ÉMETTANT le bulletin, qui fige ce calcul et lui donne un numéro. " +
        "La retenue rendue est un ACOMPTE sur l'impôt annuel de l'article 116, jamais un solde.",
    };
  }


  /**
   * LE DÉCOMPTE FINAL · P4. LE CALCUL SEUL NE STOCKE RIEN · c'est
   * `emettreDecompteFinal` (A8) qui le fige, comme un bulletin.
   *
   * Aucune lecture Prisma non plus · tout ce dont le calcul a besoin est dans
   * le Code du travail et dans ce que le cabinet déclare. L'ancienneté et les
   * mois de service SE SAISISSENT, et ce n'est pas un raccourci : l'article
   * 141, alinéa 2, fait entrer dans le service les jours de repos, de congé
   * payé, les jours fériés et l'incapacité jusqu'à six mois par année, sans
   * cette limite pour un accident du travail. Reconstituer ce décompte depuis
   * les dates du contrat donnerait un chiffre plausible et faux.
   *
   * LE `tenantId` EST QUAND MÊME REÇU · la route est cloisonnée par le jeton,
   * et le garder en signature empêche qu'on l'oublie le jour où le décompte
   * lira le contrat.
   */
  /**
   * LE LIVRE DE PAIE · PUREMENT DÉCLARATIF, RIEN N'EST LU NI ÉCRIT.
   *
   * OmegaX ne tient pas le livre de paie et ne prétend pas en tenir lieu.
   * Il dit ce que les articles 213 à 215 exigent, il compte les trente-trois
   * énonciations de l'article 1er de l'arrêté n° 12/CAB.MIN/ETPS/042 du
   * 8 août 2008 qu'un document couvre, et il REFUSE toujours de certifier la
   * conformité AU MODÈLE ANNEXÉ, qui est une mise en forme et non une liste
   * (`RESERVE_MISE_EN_FORME`).
   */
  livreDePaie(_tenantId: string, dto: LivreDePaieDto) {
    return {
      ...livreDePaie({
        siegeDExploitation: dto.siegeDExploitation ?? null,
        formeDuDocument: (dto.formeDuDocument as FormeDuDocument | undefined) ?? null,
        autorisationInspecteurDuTravail: dto.autorisationInspecteurDuTravail ?? null,
        effectifHabituel: dto.effectifHabituel ?? null,
        exclusivementPersonnelDomestique: dto.exclusivementPersonnelDomestique,
        mentionsPortees: dto.mentionsPortees ?? [],
      }),
      mentions: MENTIONS_MODELE_2008,
      formules: FORMULES_DU_MODELE,
      destinationDesDoubles: DESTINATION_DES_DOUBLES,
      texteSecondDouble: TEXTE_ARTICLE_2_SECOND_DOUBLE,
      // PASSE D2 · le second texte du bulletin de paie, restitué à côté du
      // premier, ses écarts nommés et non tranchés.
      arrete1422018: {
        reference: REFERENCE_ARRETE_142_2018,
        mentions: MENTIONS_ARRETE_142_2018,
        ecarts: ECARTS_2008_2018,
      },
      arreteDuModele: ARRETE_DU_MODELE,
      doublesDetachablesMinimum: DOUBLES_DETACHABLES_MINIMUM,
      sanctionArticle103: SANCTION_ARTICLE_103,
      reserveArticle104: RESERVE_ARTICLE_104,
    };
  }

  /**
   * LE DÉCOMPTE FINAL · le moteur est pur (`decompte-final.ts`). Le service ne
   * fait que refuser les combinaisons que le texte exclut, et lire la colonne 19
   * de la grille du mois de cessation (décret n° 25/22, ou version du cabinet)
   * pour les allocations familiales · jamais un montant saisi pour elle.
   */
  async decompteFinal(tenantId: string, dto: DecompteFinalDto) {
    const initiative = dto.initiative as InitiativeRupture;
    const motif = dto.motif as MotifRupture;
    const typeContrat = dto.typeContrat as TypeContratDecompte;
    const refus = motifRefusDecompte({ initiative, motif, typeContrat });
    if (refus) throw new BadRequestException(refus);

    let allocationFamilialeParEnfantFc: number | null = null;
    let explicationAllocationFamiliale: string | null = null;
    if (dto.moisDeCessation !== undefined) {
      if (!moisValide(dto.moisDeCessation)) {
        throw new BadRequestException('Le mois de cessation doit être écrit AAAA-MM.');
      }
      const annexesSmig = annexesSmigDuDossier(await this.versionsBaremesDuMois(tenantId, dto.moisDeCessation));
      const a = allocationFamilialeJournaliere(dto.moisDeCessation, 1, annexesSmig);
      allocationFamilialeParEnfantFc = a.valeur?.parEnfantFc ?? null;
      explicationAllocationFamiliale = a.explication;
    }

    return decompteFinal({
      anneesAnciennete: dto.anneesAnciennete,
      moisNonCouvertsParUnConge: dto.moisNonCouvertsParUnConge,
      moinsDeDixHuitAns: dto.moinsDeDixHuitAns ?? false,
      initiative,
      motif,
      typeContrat,
      periodeDEssai: dto.periodeDEssai ?? false,
      joursDEssaiEcoules: dto.joursDEssaiEcoules ?? null,
      delegueSyndical: dto.delegueSyndical,
      dateNotification: dto.dateNotification ? dto.dateNotification.slice(0, 10) : null,
      preavisRetenuJours: dto.preavisRetenuJours ?? null,
      forceMajeureConstateeParInspecteur: dto.forceMajeureConstateeParInspecteur ?? false,
      deuxMoisDeSuspension: dto.deuxMoisDeSuspension ?? false,
      executionPreavis: (dto.executionPreavis as ExecutionPreavis | undefined) ?? null,
      joursPreavisNonObserves: dto.joursPreavisNonObserves ?? null,
      partieResponsable: (dto.partieResponsable as InitiativeRupture | undefined) ?? null,
      remunerationJournaliereFc: dto.remunerationJournaliereFc ?? null,
      moyenneMensuelleArticle66Fc: dto.moyenneMensuelleArticle66Fc ?? null,
      moyenneMensuelleArticle142Fc: dto.moyenneMensuelleArticle142Fc ?? null,
      avantagesPendantPreavisFc: dto.avantagesPendantPreavisFc ?? null,
      joursRestantsJusquAuTerme: dto.joursRestantsJusquAuTerme ?? null,
      avantagesJusquAuTermeFc: dto.avantagesJusquAuTermeFc ?? null,
      montantConvenuCommunAccordFc: dto.montantConvenuCommunAccordFc ?? null,
      arrieresFc: dto.arrieresFc ?? null,
      gratificationFc: dto.gratificationFc ?? null,
      enfantsBeneficiairesAllocations: dto.enfantsBeneficiairesAllocations ?? null,
      joursAllocationsFamiliales: dto.joursAllocationsFamiliales ?? null,
      allocationFamilialeParEnfantFc,
      explicationAllocationFamiliale,
    });
  }

  /** Le nombre de renouvellements qui MÈNENT à ce contrat, celui-ci compris. */
  private longueurChaineRenouvellement(
    contrats: Array<{ id: string; renouvelleDeId: string | null }>,
    id: string,
  ): number {
    const parId = new Map(contrats.map((c) => [c.id, c]));
    let n = 0;
    let courant = parId.get(id);
    // La chaîne est bornée par le nombre de contrats · une boucle
    // impossible en base (le lien est unique) ne doit pas pouvoir pendre ici.
    while (courant?.renouvelleDeId && n <= contrats.length) {
      n += 1;
      courant = parId.get(courant.renouvelleDeId);
    }
    return n;
  }

  /** L'effectif à une date · la règle vit dans `effectif-registre.ts`. */
  async effectif(tenantId: string, ala: Date) {
    return effectifDuRegistre(this.prisma, tenantId, ala);
  }

  // ──────────────────────────────────────────────────────────────────────
  // P8 · LE BULLETIN DE PAIE ÉMIS. Règles et textes dans `bulletin-paie.ts`.
  // ──────────────────────────────────────────────────────────────────────

  /**
   * ÉMETTRE, c'est rejouer la simulation CÔTÉ SERVEUR et figer ce qu'elle
   * rend. Le client n'envoie que ce qui a été saisi, jamais un montant
   * calculé · un bulletin qui recopierait un net venu de l'écran porterait le
   * chiffre que le navigateur a bien voulu envoyer.
   */
  async emettreBulletin(
    tenantId: string,
    userId: string,
    salarieId: string,
    dto: SimulationPaieDto,
    maintenant: Date = new Date(),
  ) {
    if (!moisValide(dto.moisDePaie)) {
      throw new BadRequestException('Mois de paie illisible · la forme attendue est AAAA-MM.');
    }
    const salarie = await this.prisma.salarie.findFirst({
      where: { id: salarieId, tenantId },
      select: {
        id: true,
        nom: true,
        postNom: true,
        prenoms: true,
        matricule: true,
        numeroAffiliationCnss: true,
        contrats: {
          select: {
            id: true,
            dateEntreeEnVigueur: true,
            dateFin: true,
            natureTravail: true,
            categorieProfessionnelle: true,
            // Mention 5 du modèle de 2008 · figée sur le bulletin (passe D2).
            remunerationBase: true,
            periodiciteRemuneration: true,
            deviseRemuneration: true,
          },
        },
      },
    });
    if (!salarie) throw new NotFoundException('Salarié introuvable dans ce dossier.');

    const contrat = contratCouvrantLeMois(salarie.contrats, dto.moisDePaie);
    if (!contrat) {
      throw new BadRequestException(
        `Aucun contrat de ce salarié n'est en cours en ${dto.moisDePaie} · la paie exécute un contrat, et le bulletin doit dire lequel.`,
      );
    }

    // Un salaire en dollars se convertit au cours du JOUR D'ÉMISSION · le
    // bulletin fige ce cours (calcul.conversion), et ne se recalcule plus.
    // Le bulletin FIGE la saisie RELUE · la nature des rubriques et les
    // retenues d'avance telles que le registre les donne, jamais telles que
    // le navigateur les a envoyées.
    const { dto: saisie } = await this.resoudreSaisie(tenantId, salarieId, dto);
    const simulation = await this.simulerPaie(tenantId, salarieId, saisie, maintenant);
    const motifs = motifsRefusEmission(simulation);
    if (motifs.length > 0) {
      throw new BadRequestException({
        message: `Bulletin non émis · ${motifs.length} montant(s) non calculé(s). ${TEXTE_ARTICLE_103}`,
        motifs,
      });
    }

    const cree = await this.figerBulletin(tenantId, userId, {
      salarieId,
      salarie,
      contrat,
      moisDePaie: dto.moisDePaie,
      nature: NatureBulletinPaie.MOIS,
      simulation,
      entree: saisie,
      calculEnPlus: {},
    });
    return this.lireBulletin(tenantId, cree.id);
  }

  /**
   * FIGER UN DOUBLE DU LIVRE DE PAIE · bulletin du mois ou décompte final
   * (A8), une seule écriture de la règle pour les deux. La séquence des
   * numéros est UNE (art. 214), et la limite « un seul actif par salarié et
   * par mois » vaut pour les deux natures ensemble · c'est elle qui fait que
   * le décompte REMPLACE le bulletin du mois de cessation (décision de Manasse
   * du 2026-10-02) · un bulletin actif refuse le décompte, et inversement.
   */
  private async figerBulletin(
    tenantId: string,
    userId: string,
    p: {
      salarieId: string;
      salarie: { nom: string; postNom: string | null; prenoms: string | null; matricule: string | null; numeroAffiliationCnss: string | null };
      contrat: {
        id: string;
        natureTravail: string | null;
        categorieProfessionnelle: string | null;
        remunerationBase: Prisma.Decimal | null;
        periodiciteRemuneration: string | null;
        deviseRemuneration: string | null;
      };
      moisDePaie: string;
      nature: NatureBulletinPaie;
      simulation: SimulationPaie;
      entree: unknown;
      calculEnPlus: Record<string, unknown>;
    },
  ) {
    const { salarieId, salarie, contrat, simulation } = p;
    // A8 (i) · LE DOUBLE NE SE FIGE PAS SUR UN ZÉRO QUE PERSONNE N'A CALCULÉ.
    // Les deux appelants refusent avant (`motifsRefusEmission`) ; la règle est
    // rejouée ICI, au seul endroit qui écrit, plutôt que d'y lire `?? 0` · un
    // troisième appelant qui l'oublierait figerait un net à zéro.
    const chiffres = chiffresFigeables(simulation);
    if ('motifs' in chiffres) {
      throw new BadRequestException({
        message: `Rien n'est émis · ${chiffres.motifs.join(' · ')}`,
        motifs: chiffres.motifs,
      });
    }
    const creer = () =>
      transactionJournalisee(this.prisma, async (tx) => {
        // A8 (h) · DEUX ÉMISSIONS DU MÊME SALARIÉ ET DU MÊME MOIS, en même
        // temps, liraient chacune « aucun actif » et figeraient deux doubles
        // actifs (le décompte ET le bulletin qu'il remplace). Le verrou du
        // dossier, pris EN TÊTE de la transaction et rendu à sa fin, range la
        // seconde derrière la première, qui la verra. Il ne retient la
        // connexion que le temps d'une émission (aucun calcul long dedans).
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`bulletins-paie:${tenantId}`}))`;
        const actif = await tx.bulletinPaie.findFirst({
          where: { tenantId, salarieId, moisDePaie: p.moisDePaie, statut: StatutBulletinPaie.EMIS },
          select: { numero: true, nature: true },
        });
        if (actif) {
          const quoi = actif.nature === NatureBulletinPaie.DECOMPTE_FINAL ? 'Le décompte final' : 'Le bulletin';
          const remplace =
            p.nature === NatureBulletinPaie.DECOMPTE_FINAL || actif.nature === NatureBulletinPaie.DECOMPTE_FINAL
              ? ' Le décompte final remplace le bulletin du mois de cessation · un seul des deux est actif.'
              : '';
          throw new BadRequestException(
            `${quoi} n° ${actif.numero} est déjà émis pour ce salarié en ${p.moisDePaie}. Annulez-le d'abord s'il est faux.${remplace} ${LIMITE_UN_BULLETIN_PAR_MOIS}`,
          );
        }
        const dernier = await tx.bulletinPaie.aggregate({ where: { tenantId }, _max: { numero: true } });
        const cree = await tx.bulletinPaie.create({
          data: {
            tenantId,
            salarieId,
            contratId: contrat.id,
            numero: (dernier._max.numero ?? 0) + 1,
            moisDePaie: p.moisDePaie,
            nature: p.nature,
            nomComplet: nomCompletMajuscules(salarie),
            matricule: salarie.matricule,
            emploi: contrat.natureTravail,
            categorieProfessionnelle: contrat.categorieProfessionnelle,
            numeroAffiliationCnss: salarie.numeroAffiliationCnss,
            totalVerseFc: simulation.net.totalVerseFc,
            assietteSocialeFc: chiffres.assietteSocialeFc,
            cotisationsTravailleurFc: simulation.cotisations.totalTravailleurFc,
            cotisationsEmployeurFc: simulation.cotisations.totalEmployeurFc,
            irppFc: chiffres.irppFc,
            netAPayerFc: chiffres.netAPayerFc,
            entree: JSON.parse(JSON.stringify(p.entree)) as Prisma.InputJsonValue,
            // Le salaire du contrat (mention 5 du modèle de 2008) est FIGÉ avec
            // le calcul · un bulletin remis ne change pas avec le contrat.
            calcul: JSON.parse(
              JSON.stringify({
                ...simulation,
                ...p.calculEnPlus,
                contrat: {
                  remunerationBase: contrat.remunerationBase === null ? null : Number(contrat.remunerationBase),
                  periodiciteRemuneration: contrat.periodiciteRemuneration,
                  deviseRemuneration: contrat.deviseRemuneration,
                },
              }),
            ) as Prisma.InputJsonValue,
            emisPar: userId,
          },
        });
        // Les retenues d'avance, RELUES DANS LA TRANSACTION · deux bulletins
        // émis en même temps sur la même avance la solderaient deux fois.
        for (const r of simulation.retenuesAvances) {
          const lignes = await tx.retenueAvanceBulletin.findMany({
            where: { tenantId, avanceId: r.avanceId },
            select: { montantFc: true, bulletin: { select: { statut: true } } },
          });
          const avance = await tx.avanceSalaire.findFirstOrThrow({ where: { id: r.avanceId, tenantId }, select: { montantFc: true } });
          const solde = soldeAvance(
            Number(avance.montantFc),
            lignes.map((x) => ({ montantFc: Number(x.montantFc), bulletinAnnule: x.bulletin.statut !== StatutBulletinPaie.EMIS })),
          );
          const refus = motifRefusRetenue(r.montantFc, solde, r.libelle);
          if (refus) throw new BadRequestException(refus);
          await tx.retenueAvanceBulletin.create({
            data: { tenantId, avanceId: r.avanceId, bulletinId: cree.id, montantFc: r.montantFc },
          });
        }
        return cree;
      });

    // DEUX ÉMISSIONS SIMULTANÉES prennent le même « dernier numéro ». L'index
    // unique (tenantId, numero) refuse la seconde · on la rejoue une fois, sur
    // le numéro suivant, plutôt que de laisser l'utilisateur recommencer.
    try {
      return await creer();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        try {
          return await creer();
        } catch (e2) {
          if (e2 instanceof Prisma.PrismaClientKnownRequestError && e2.code === 'P2002') {
            throw new ConflictException('Deux bulletins ont été émis au même instant · réessayez.');
          }
          throw e2;
        }
      }
      throw e;
    }
  }

  /**
   * A8 · ÉMETTRE LE DÉCOMPTE FINAL, et le figer comme un bulletin. Règles et
   * textes dans `decompte-final-emis.ts`.
   *
   * TOUT EST REJOUÉ ICI · le décompte (P4) sur les faits déclarés, puis la
   * simulation du mois de cessation (P2, P8) sur les éléments du mois ET les
   * rubriques du décompte, traduites en éléments de paie. Le client n'envoie
   * aucun montant calculé · ni indemnité, ni impôt, ni net.
   */
  async emettreDecompteFinal(
    tenantId: string,
    userId: string,
    salarieId: string,
    dto: EmissionDecompteFinalDto,
    maintenant: Date = new Date(),
  ) {
    const mois = dto.paie.moisDePaie;
    if (!moisValide(mois)) {
      throw new BadRequestException('Mois de paie illisible · la forme attendue est AAAA-MM.');
    }
    if (dto.decompte.moisDeCessation !== undefined && dto.decompte.moisDeCessation !== mois) {
      throw new BadRequestException(
        `Le mois de cessation (${dto.decompte.moisDeCessation}) et le mois de paie (${mois}) diffèrent · le décompte final remplace le bulletin du mois de cessation.`,
      );
    }
    if ((dto.paie.deviseStipulation ?? 'CDF') !== 'CDF') {
      throw new BadRequestException(RESERVE_EN_FRANCS);
    }

    const salarie = await this.prisma.salarie.findFirst({
      where: { id: salarieId, tenantId },
      select: {
        id: true,
        nom: true,
        postNom: true,
        prenoms: true,
        matricule: true,
        numeroAffiliationCnss: true,
        contrats: {
          select: {
            id: true,
            type: true,
            dateEntreeEnVigueur: true,
            dateFin: true,
            natureTravail: true,
            categorieProfessionnelle: true,
            remunerationBase: true,
            periodiciteRemuneration: true,
            deviseRemuneration: true,
          },
        },
      },
    });
    if (!salarie) throw new NotFoundException('Salarié introuvable dans ce dossier.');
    const contrat = contratCouvrantLeMois(salarie.contrats, mois);
    if (!contrat) {
      throw new BadRequestException(
        `Aucun contrat de ce salarié n'est en cours en ${mois} · le décompte final se rapporte au contrat résilié, et doit dire lequel.`,
      );
    }
    const refusContrat =
      motifRefusMoisDeCessation(contrat.dateFin, mois) ?? motifRefusTypeContrat(contrat.type, dto.decompte.typeContrat);
    if (refusContrat) throw new BadRequestException(refusContrat);

    // LES ÉLÉMENTS DU MOIS, relus comme ceux d'un bulletin (nature des
    // rubriques, retenues d'avance). Leur total versé TIENT LIEU des arriérés
    // du décompte (art. 100) · deux sources pour la même somme se
    // contrediraient tôt ou tard.
    const { dto: saisie } = await this.resoudreSaisie(tenantId, salarieId, dto.paie);
    // A8 (j) · un élément négatif ou illisible est REFUSÉ, jamais ramené à
    // zéro · un plancher silencieux ferait un arriéré plus grand que la paie.
    const negatifs = motifsElementsNegatifs(saisie.elements);
    if (negatifs.length > 0) throw refusNomme('Décompte final non émis', negatifs);
    const elementsDuMois = saisie.elements.map((e) => ({
      nature: e.nature as NatureElementPaie,
      montantFc: e.montantFc,
      enNature: e.enNature === true,
    }));
    if (elementsDuMois.length === 0 && dto.decompte.arrieresFc !== 0) {
      throw new BadRequestException(
        "Le décompte final remplace le bulletin du mois de cessation · saisissez les éléments du mois (salaire des jours prestés, sommes restant dues), ou déclarez zéro arriéré si rien n'est dû.",
      );
    }
    const arrieresFc = arrieresDesElements(elementsDuMois);
    if (typeof dto.decompte.arrieresFc === 'number' && Math.abs(dto.decompte.arrieresFc - arrieresFc) >= 0.005) {
      throw new BadRequestException(
        `Les arriérés déclarés (${dto.decompte.arrieresFc.toFixed(2)} FC) diffèrent des éléments du mois versés (${arrieresFc.toFixed(2)} FC) · au décompte émis, les arriérés SONT ces éléments.`,
      );
    }

    const faits: DecompteFinalDto = { ...dto.decompte, moisDeCessation: mois, arrieresFc };
    const verdict = await this.decompteFinal(tenantId, faits);
    const { elements: indemnites, refus } = elementsDuDecompte(verdict, dto.ventilationAvantages ?? []);
    if (refus.length > 0) {
      throw refusNomme(`Décompte final non émis · un solde partiel se lit comme un solde. ${TEXTE_ARTICLE_103}`, refus);
    }

    // A8 (m) · UNE MÊME NATURE NE SE PAIE PAS DEUX FOIS · congé, gratification
    // et allocations familiales ont leur rubrique au décompte.
    const doubles = motifsDoubleCompte(elementsDuMois, indemnites);
    if (doubles.length > 0) throw refusNomme('Décompte final non émis', doubles);

    // ARTICLE 69, 1 · LES ALLOCATIONS FAMILIALES DU DÉCOMPTE sont la colonne
    // 19 elle-même (enfants × jours × taux), donc exactement le « taux légal »
    // qui les immunise. Le mois n'en porte pas (refus du double compte
    // ci-dessus) · le plafond est donc leur seul montant. Un taux légal
    // DÉCLARÉ à côté serait ÉCRASÉ sans le dire (A8, j) · il est refusé, le
    // décompte le calcule.
    const allocationsDecompte = auCentime(
      indemnites.filter((e) => e.nature === 'ALLOCATIONS_FAMILIALES_LEGALES').reduce((n, e) => n + e.montantFc, 0),
    );
    let tauxLegalAllocationsFamilialesFc = saisie.tauxLegalAllocationsFamilialesFc;
    if (allocationsDecompte > 0) {
      if (typeof saisie.tauxLegalAllocationsFamilialesFc === 'number') {
        throw refusNomme('Décompte final non émis', [
          "Un taux légal des allocations familiales est déclaré alors que le décompte calcule ces allocations (colonne 19 du décret n° 25/22) · retirez le taux déclaré, le décompte le pose lui-même (article 69, 1).",
        ]);
      }
      tauxLegalAllocationsFamilialesFc = allocationsDecompte;
    }

    const paieComplete: SimulationPaieDto = {
      ...saisie,
      tauxLegalAllocationsFamilialesFc,
      elements: [
        ...saisie.elements,
        ...indemnites.map((e) => ({
          nature: e.nature,
          libelle: e.libelle,
          montantFc: e.montantFc,
          ...(typeof e.conditionArticle69Attestee === 'boolean' ? { conditionArticle69Attestee: e.conditionArticle69Attestee } : {}),
        })),
      ],
    };
    const simulation = await this.simulerPaie(tenantId, salarieId, paieComplete, maintenant);
    const motifs = motifsRefusEmission(simulation);
    if (motifs.length > 0) {
      throw refusNomme(`Décompte final non émis · ${motifs.length} montant(s) non calculé(s). ${TEXTE_ARTICLE_103}`, motifs);
    }
    // LES DEUX MOTEURS PARLENT DU MÊME DÉCOMPTE (A8, k) · chaque rubrique est
    // arrondie au centime AVANT d'être un élément, et le total versé de la
    // paie se compare à la somme de ces montants arrondis. Le total du
    // verdict, non arrondi, ne s'en écarte que des demi-centimes des rubriques.
    const duArrondi = auCentime(arrieresFc + indemnites.reduce((n, e) => n + e.montantFc, 0));
    const duAuTravailleur = verdict.totalDuAuTravailleurFc as number;
    const toleranceArrondi = 0.005 * (indemnites.length + 1) + 1e-9;
    if (Math.abs(duArrondi - duAuTravailleur) > toleranceArrondi || Math.abs(simulation.net.totalVerseFc - duArrondi) >= 0.005) {
      throw new BadRequestException(
        `Le décompte doit ${duArrondi.toFixed(2)} FC au travailleur et la paie en verserait ${simulation.net.totalVerseFc.toFixed(2)} FC · rien n'est émis.`,
      );
    }

    // A8 (n) · UNE NATURE SANS COMPTE se remet au travailleur, mais ne passera
    // pas au journal · l'émission le DIT, dans la réponse et sur le document.
    const avertissements = avertissementsPassation(indemnites, NATURES_SANS_IMPUTATION);
    const reservesDecompteEmis = [RESERVE_VERSEMENT_UNIQUE, RESERVE_DU_PAR_LE_TRAVAILLEUR, DECOMPTE_A_LA_RUPTURE];
    if (indemnites.some((e) => e.reserve === RESERVE_ASSIETTE_SOCIALE_INDEMNITE)) {
      reservesDecompteEmis.push(RESERVE_ASSIETTE_SOCIALE_INDEMNITE);
    }

    const cree = await this.figerBulletin(tenantId, userId, {
      salarieId,
      salarie,
      contrat,
      moisDePaie: mois,
      nature: NatureBulletinPaie.DECOMPTE_FINAL,
      simulation,
      entree: { ...paieComplete, decompte: faits, ventilationAvantages: dto.ventilationAvantages ?? [] },
      calculEnPlus: {
        decompte: verdict,
        reservesDecompteEmis,
        avertissementsDecompteEmis: avertissements,
      },
    });
    return { ...(await this.lireBulletin(tenantId, cree.id)), avertissements };
  }

  /**
   * Les bulletins d'un mois, ou les derniers émis. BORNÉ · aucune route ne
   * rend une collection sans borne (§ 8 bis), et la liste le DIT quand elle
   * est tronquée. Les totaux ne comptent que les bulletins ÉMIS : un bulletin
   * annulé n'a rien payé.
   */
  async listerBulletins(tenantId: string, moisDePaie?: string) {
    if (moisDePaie !== undefined && !moisValide(moisDePaie)) {
      throw new BadRequestException('Mois de paie illisible · la forme attendue est AAAA-MM.');
    }
    const PLAFOND = 500;
    // `undefined` n'est pas un filtre pour Prisma · sans mois, tout le dossier.
    // La borne `tenantId` est écrite DANS chaque appel, où le balayage du
    // cloisonnement la lit.
    const [lignes, total, sommes] = await Promise.all([
      this.prisma.bulletinPaie.findMany({
        where: { tenantId, moisDePaie },
        orderBy: { numero: 'desc' },
        take: PLAFOND,
        select: {
          id: true,
          numero: true,
          moisDePaie: true,
          statut: true,
          nature: true,
          nomComplet: true,
          matricule: true,
          salarieId: true,
          totalVerseFc: true,
          irppFc: true,
          netAPayerFc: true,
          emisLe: true,
          remisLe: true,
          annuleLe: true,
        },
      }),
      this.prisma.bulletinPaie.count({ where: { tenantId, moisDePaie } }),
      this.prisma.bulletinPaie.aggregate({
        where: { tenantId, moisDePaie, statut: StatutBulletinPaie.EMIS },
        _sum: {
          totalVerseFc: true,
          cotisationsTravailleurFc: true,
          cotisationsEmployeurFc: true,
          irppFc: true,
          netAPayerFc: true,
        },
        _count: true,
      }),
    ]);
    const n = (d: Prisma.Decimal | null) => (d === null ? 0 : Number(d));
    return {
      bulletins: lignes.map((b) => ({
        ...b,
        totalVerseFc: Number(b.totalVerseFc),
        irppFc: Number(b.irppFc),
        netAPayerFc: Number(b.netAPayerFc),
      })),
      total,
      tronque: total > lignes.length,
      totauxEmis: {
        nombre: sommes._count,
        totalVerseFc: n(sommes._sum.totalVerseFc),
        cotisationsTravailleurFc: n(sommes._sum.cotisationsTravailleurFc),
        cotisationsEmployeurFc: n(sommes._sum.cotisationsEmployeurFc),
        irppFc: n(sommes._sum.irppFc),
        netAPayerFc: n(sommes._sum.netAPayerFc),
      },
      textes: { numerotation: TEXTE_NUMEROTATION, inalterabilite: TEXTE_INALTERABILITE, article103: TEXTE_ARTICLE_103 },
    };
  }

  async lireBulletin(tenantId: string, id: string) {
    const b = await this.prisma.bulletinPaie.findFirst({ where: { id, tenantId } });
    if (!b) throw new NotFoundException('Bulletin introuvable dans ce dossier.');
    return {
      ...b,
      totalVerseFc: Number(b.totalVerseFc),
      assietteSocialeFc: Number(b.assietteSocialeFc),
      cotisationsTravailleurFc: Number(b.cotisationsTravailleurFc),
      cotisationsEmployeurFc: Number(b.cotisationsEmployeurFc),
      irppFc: Number(b.irppFc),
      netAPayerFc: Number(b.netAPayerFc),
      // PASSE D2 · ce que le bulletin porte des énonciations du modèle de
      // 2008, et ce qu'il ne porte pas, dit rang par rang.
      enonciations: enonciationsDuBulletin(b),
      reserves:
        b.nature === NatureBulletinPaie.DECOMPTE_FINAL
          ? [TEXTE_ARTICLE_103, TEXTE_INALTERABILITE, RESERVE_MODELE, DECOMPTE_A_LA_RUPTURE, RESERVE_VERSEMENT_UNIQUE, RESERVE_DU_PAR_LE_TRAVAILLEUR]
          : [TEXTE_ARTICLE_103, TEXTE_INALTERABILITE, RESERVE_MODELE],
    };
  }

  /**
   * ANNULER, jamais modifier ni supprimer (art. 4 de l'arrêté de 2008). La
   * ligne reste, avec son numéro, son motif, son auteur et sa date · c'est ce
   * qui permet de dire, six mois plus tard, pourquoi le travailleur a reçu
   * deux bulletins pour le même mois.
   */
  async annulerBulletin(tenantId: string, userId: string, id: string, motif: string) {
    const texte = (motif ?? '').trim();
    if (texte.length < 5) {
      throw new BadRequestException("Le motif d'annulation est obligatoire · il est la seule trace de la correction.");
    }
    const b = await this.prisma.bulletinPaie.findFirst({
      where: { id, tenantId },
      select: { statut: true, ecritureId: true },
    });
    if (!b) throw new NotFoundException('Bulletin introuvable dans ce dossier.');
    if (b.statut !== StatutBulletinPaie.EMIS) throw new BadRequestException('Ce bulletin est déjà annulé.');
    // P9 · UN BULLETIN PASSÉ AU BROUILLARD NE S'ANNULE PAS SEUL. L'écriture du
    // mois porterait encore son salaire, et rien ne le signalerait. On défait
    // d'abord la passation, qui se refait sans lui. Passé et VALIDÉ, il
    // s'annule, et la proposition du mois le signale comme salaire encore au
    // journal, à corriger par une écriture en négatif (AUDCIF art. 20).
    if (b.ecritureId) {
      const ecriture = await this.prisma.ecriture.findFirst({
        where: { id: b.ecritureId, tenantId },
        select: { statut: true, numeroPiece: true },
      });
      if (ecriture && ecriture.statut !== StatutEcriture.VALIDEE) {
        throw new BadRequestException(
          `Ce bulletin est passé dans l'écriture de paie n° ${ecriture.numeroPiece ?? ''}, encore au brouillard. ` +
            "Annulez d'abord la comptabilisation du mois, puis le bulletin, puis repassez la paie.",
        );
      }
    }
    await this.prisma.bulletinPaie.update({
      where: { id },
      data: { statut: StatutBulletinPaie.ANNULE, annuleLe: new Date(), annulePar: userId, motifAnnulation: texte },
    });
    return this.lireBulletin(tenantId, id);
  }

  /**
   * DÉCLARER LA REMISE au travailleur (art. 103). Une fois, jamais corrigée ·
   * une date de remise qui se déplace après coup est exactement ce qu'un
   * contentieux sur l'article 103 viendrait chercher.
   */
  async declarerRemise(tenantId: string, id: string, remisLe: string) {
    const b = await this.prisma.bulletinPaie.findFirst({
      where: { id, tenantId },
      select: { statut: true, remisLe: true, emisLe: true },
    });
    if (!b) throw new NotFoundException('Bulletin introuvable dans ce dossier.');
    if (b.statut !== StatutBulletinPaie.EMIS) throw new BadRequestException("Un bulletin annulé ne se remet pas.");
    if (b.remisLe) throw new BadRequestException('La remise de ce bulletin est déjà déclarée · elle ne se corrige pas.');
    const date = new Date(remisLe);
    const refus = motifRefusRemise(date, b.emisLe, new Date());
    if (refus) throw new BadRequestException(refus);
    await this.prisma.bulletinPaie.update({ where: { id }, data: { remisLe: date } });
    return this.lireBulletin(tenantId, id);
  }
}

export type Confrontation = Awaited<ReturnType<PersonnelService['confronter']>>;
export type Effectif = Awaited<ReturnType<PersonnelService['effectif']>>;
export type SimulationPaie = Awaited<ReturnType<PersonnelService['simulerPaie']>>;
export type DecompteFinal = Awaited<ReturnType<PersonnelService['decompteFinal']>>;
export type LivreDePaie = ReturnType<PersonnelService['livreDePaie']>;
export type BulletinPaieLu = Awaited<ReturnType<PersonnelService['lireBulletin']>>;
