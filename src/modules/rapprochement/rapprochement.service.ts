import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import {
  ClasseCompte,
  GranulariteCloture,
  Prisma,
  StatutEcriture,
  StatutExercice,
  StatutRapprochement,
  TypeCompteDetailTotal,
} from '@prisma/client';
import {
  ConfirmerCorrespondancesDto,
  DeclarerDepartDto,
  DeclarerEncoursDto,
  ImporterReleveDto,
  OuvrirRapprochementDto,
} from './dto/rapprochement.dto';
import { lireFichier } from '../import/lecture-fichier';
import {
  arrondi,
  FENETRE_JOURS_DEFAUT,
  lireReleve,
  montantVuDuCompte,
  proposerCorrespondances,
  reconnaitreColonnes,
  type ChampReleve,
} from './releve-bancaire';
import { avecRetrySerialisable } from '../../common/prisma-retry.util';
import { transactionJournalisee } from '../../common/audit/transaction-journalisee';
import { motifLigneFigee, type ClotureActive } from '../exercice/gel-cloture';

const EPSILON = 0.005;

const JOUR_MS = 86_400_000;

const jour = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Plafond des lignes qu'une fenêtre de rapprochement montre (audit final
 * F185) · au-delà, la tranche se dit, et soldes et correspondances restent
 * pris sur le compte entier.
 */
export const PLAFOND_LIGNES_RAPPROCHEMENT = 5000;

/**
 * L'À-NOUVEAU N'EST PAS UNE OPÉRATION DE LA BANQUE (audit final F205).
 *
 * L'état de rapprochement vérifie « la concordance entre le compte "Banques"
 * tenu par une entité et le relevé bancaire », et ses différences
 * s'expliquent « par des erreurs, des omissions, ou des enregistrements à des
 * dates différentes dans deux comptabilités » (AUDCIF Titre VI, RAPPROCHEMENT
 * (État de)) · il apparie des OPÉRATIONS. Le report à-nouveau n'en est pas
 * une : il recopie le solde de clôture de l'exercice précédent (le bilan
 * d'ouverture correspond au bilan de clôture · AUDCIF art. 34 au SYSCOHADA,
 * SYCEBNL art. 16, 4° pour une EBNL, dont l'art. 3 écarte l'art. 34). Pointé,
 * il comptait l'ouverture deux fois.
 *
 * UNE SEULE OUVERTURE PAR CHAÎNE, ET ELLE VIENT DE LA BANQUE (2026-09-28).
 * L'écart est le solde de départ plus ce qui est pointé, moins le solde du
 * relevé (`depart`) :
 *
 *  · un rapprochement clos précède · son solde de relevé sert de départ, il
 *    contient déjà tout ce qui le précède ;
 *  · aucun ne précède · c'est le PREMIER rapprochement du compte, et il porte
 *    un SOLDE DE DÉPART DÉCLARÉ, lu sur le relevé avec sa date. Il partait de
 *    zéro et pointait l'à-nouveau du premier exercice · un bilan d'ouverture
 *    importé dans un autre exercice devenait impointable, et le rapprochement
 *    ne pouvait plus s'équilibrer. Les éditeurs relus font de même : Odoo fait
 *    saisir le solde bancaire à la date où l'on commence, Xero et Sage 100
 *    partent du solde lu sur le relevé de la veille.
 *
 * Le solde de départ ne se DEVINE JAMAIS depuis l'à-nouveau · un solde
 * comptable n'est pas un solde de banque, et c'est leur différence que le
 * rapprochement existe pour expliquer. D'où deux conséquences :
 *
 *  · AUCUN À-NOUVEAU N'EST POINTABLE, premier exercice compris ;
 *  · les lignes du compte datées AVANT la date de départ sont fondues dans le
 *    solde de départ, sur toute la chaîne · celles que la banque n'avait pas
 *    encore passées ce jour-là se DÉCLARENT en en-cours d'ouverture et se
 *    pointent comme une écriture (`EncoursOuvertureRapprochement`).
 *
 * Écarter plutôt que montrer à part · une ligne montrée resterait pointable,
 * et c'est le pointage qui compte deux fois. Une ligne déjà pointée sur un
 * rapprochement reste montrée sur LUI, pointée · c'est par là qu'un pointage
 * fait avant cette règle se défait, et le contrôle
 * `RAPPROCHEMENT_A_NOUVEAU_POINTE` le signale.
 *
 * Un dossier dont la chaîne a commencé avant la règle (premier rapprochement
 * clos sans solde déclaré) ne voit rien changer · sa tête n'a pas de date de
 * départ, aucune ligne n'est fondue, et l'à-nouveau était déjà écarté après
 * un rapprochement clos.
 */
export interface RegleOuverture {
  /** Un rapprochement clos précède celui-ci sur le même compte. */
  ancre: boolean;
  /** La date de départ déclarée sur la tête de la chaîne · null avant la règle. */
  dateDepart: Date | null;
}

/**
 * L'écriture est-elle un à-nouveau ? L'à-nouveau est l'écriture de la colonne
 * « report » de la balance (`filtresDesTroisColonnes`) · jamais l'écriture qui
 * solde les comptes de gestion, qui n'ouvre rien.
 */
export function estANouveauEcarte(ecriture: { estGenereeParCloture: boolean; estSoldeDesComptesDeGestion: boolean }): boolean {
  return ecriture.estGenereeParCloture && !ecriture.estSoldeDesComptesDeGestion;
}

/** La même règle en filtre d'écriture · les lectures l'écartent en base, les écritures la rejouent ligne à ligne. */
export function filtreANouveauEcarte(): Prisma.EcritureWhereInput {
  return { estGenereeParCloture: true, estSoldeDesComptesDeGestion: false };
}

/** La ligne précède-t-elle la date de départ de la chaîne, donc fondue dans le solde de départ ? */
export function estFondueDansLeDepart(ecriture: { date: Date }, regle: RegleOuverture): boolean {
  return regle.dateDepart !== null && ecriture.date.getTime() < regle.dateDepart.getTime();
}

/** À-nouveau ou fondue · ce que la chaîne ne pointe pas. */
export function estEcarteeDuPointage(
  ecriture: { estGenereeParCloture: boolean; estSoldeDesComptesDeGestion: boolean; date: Date },
  regle: RegleOuverture,
): boolean {
  return estANouveauEcarte(ecriture) || estFondueDansLeDepart(ecriture, regle);
}

/** La même règle en filtre, pour que la liste, le décompte et les propositions ne puissent pas diverger du refus. */
export function filtreEcarteDuPointage(regle: RegleOuverture): Prisma.EcritureWhereInput {
  return regle.dateDepart === null
    ? filtreANouveauEcarte()
    : { OR: [filtreANouveauEcarte(), { date: { lt: regle.dateDepart } }] };
}

/** Le refus nomme la raison du cas · l'ouverture déjà dans le solde de départ, repris ou déclaré. */
export function motifRefusANouveau(regle: RegleOuverture): string {
  return regle.ancre
    ? "Un report à-nouveau n'est pas une opération de la banque · le solde de départ, repris du rapprochement précédent, le contient déjà, et le pointer compterait l'ouverture deux fois."
    : "Un report à-nouveau n'est pas une opération de la banque · le premier rapprochement part du solde de départ lu sur le relevé, et le pointer compterait l'ouverture deux fois. Ce que la banque n'avait pas encore passé à la date de départ se déclare en en-cours d'ouverture.";
}

/** Le refus d'une ligne antérieure à la date de départ. */
export function motifRefusFondue(date: Date, dateDepart: Date): string {
  return (
    `La ligne du ${jour(date)} précède la date de départ du ${jour(dateDepart)} · elle est fondue dans le solde de départ, ` +
    "et la pointer compterait l'ouverture deux fois. Si la banque ne l'avait pas encore passée ce jour-là, déclarez-la en en-cours d'ouverture."
  );
}

/** Le motif d'une ligne écartée, ou null si elle se pointe. */
export function motifRefusPointage(
  ecriture: { estGenereeParCloture: boolean; estSoldeDesComptesDeGestion: boolean; date: Date },
  regle: RegleOuverture,
): string | null {
  if (estANouveauEcarte(ecriture)) return motifRefusANouveau(regle);
  if (regle.dateDepart !== null && estFondueDansLeDepart(ecriture, regle)) return motifRefusFondue(ecriture.date, regle.dateDepart);
  return null;
}

/**
 * L'ÉCART D'OUVERTURE, formule de Sage 50 Canada · solde comptable
 * d'ouverture moins (en-cours d'ouverture + solde d'ouverture du relevé). Le
 * solde du livre à la veille de la date de départ doit valoir ce que la
 * banque portait ce jour-là, plus ce que le livre porte et la banque pas
 * encore. Tout est vu du compte 52 · le solde déclaré est dans le sens de
 * `soldeReleve` (positif = avoir), les en-cours en débit moins crédit.
 */
export function ecartDOuverture(soldeLivre: number, soldeDepart: number, encours: number): number {
  return arrondi(soldeLivre - (soldeDepart + encours));
}

/**
 * UN À-NOUVEAU POINTÉ EN TROP, à la place qu'il occupe dans la chaîne ·
 * lecture du contrôle `RAPPROCHEMENT_A_NOUVEAU_POINTE`. Sur un premier
 * rapprochement d'avant la règle, parti de zéro sans solde déclaré, pointer
 * l'à-nouveau du PREMIER exercice était le seul moyen de faire entrer
 * l'ouverture, et ne la comptait qu'une fois · le signaler serait une anomalie
 * fabriquée (§ 10 bis). Partout ailleurs, l'ouverture est déjà dans le départ.
 */
export function aNouveauEnTrop(
  ecriture: { estGenereeParCloture: boolean; estSoldeDesComptesDeGestion: boolean; exerciceId: string },
  place: { ancre: boolean; departDeclare: boolean; premierExerciceId: string | null },
): boolean {
  if (!estANouveauEcarte(ecriture)) return false;
  if (place.ancre || place.departDeclare) return true;
  return ecriture.exerciceId !== place.premierExerciceId;
}

/** Ce que rend la lecture de l'ouverture du premier rapprochement. */
export interface OuvertureRapprochement {
  soldeDepart: number | null;
  dateDepart: Date | null;
  /** Solde du compte au livre-journal à la veille de la date de départ. */
  soldeLivre: number | null;
  /** Somme des en-cours déclarés, vus du compte (débit moins crédit). */
  encours: number;
  ecart: number | null;
  /** Pourquoi l'écart ne se calcule pas · null quand il se calcule. */
  motif: string | null;
}

/**
 * Rapprochement bancaire manuel (§3.4 · cf. docs/plan-de-construction.md) :
 * pointage écriture par écriture d'un compte de trésorerie face à un relevé
 * bancaire, distinct du lettrage (qui rapproche des écritures entre elles,
 * pas contre une source externe). Un seul rapprochement EN_COURS par compte
 * à la fois ; le solde de clôture du précédent sert de solde de départ au
 * suivant, écart affiché en continu, clôture bloquée tant qu'il n'est pas
 * nul · même discipline que LettrageService (solde de sélection nul avant
 * de lettrer).
 */
@Injectable()
export class RapprochementService {
  constructor(private readonly prisma: PrismaService) {}

  private async trouverCompteTresorerie(tenantId: string, compteId: string) {
    const compte = await this.prisma.compte.findFirst({ where: { id: compteId, tenantId } });
    if (!compte) {
      throw new NotFoundException('Compte introuvable pour ce tenant');
    }
    if (compte.classe !== ClasseCompte.CLASSE_5) {
      throw new BadRequestException(
        `Le compte ${compte.numero} n'est pas un compte de trésorerie (classe 5) · le rapprochement bancaire ne porte que sur ces comptes`,
      );
    }
    // Même garde-fou qu'EcritureService.creer pour les écritures directes :
    // un compte Total (§3.1) ne reçoit jamais de mouvement · un rapprochement
    // ouvert dessus n'aurait structurellement aucune ligne à pointer et se
    // clôturerait trivialement à 0/0, un faux "rapproché" silencieux. Trouvé
    // en testant délibérément ce cas limite (pas de bug spontané observé).
    if (compte.typeCompte === TypeCompteDetailTotal.TOTAL) {
      throw new BadRequestException(
        `Le compte ${compte.numero} est un compte Total (regroupement) · il ne reçoit jamais d'écriture directement, le rapprochement bancaire ne porte que sur un compte Détail`,
      );
    }
    return compte;
  }

  /**
   * Solde de départ et règle d'ouverture d'un rapprochement.
   *
   * Le solde de clôture du dernier rapprochement CLOTURE de ce compte
   * STRICTEMENT AVANT lui (sa date de clôture s'il est déjà clôturé, ou
   * "maintenant" s'il est encore en cours). Un simple `id: { not: ... }`
   * (exclure seulement le rapprochement affiché lui-même) NE SUFFIT PAS pour la
   * RELECTURE d'un rapprochement déjà clôturé : la requête reste triée par
   * `clotureAt desc` et remonterait alors le rapprochement clôturé APRÈS lui,
   * pas celui d'AVANT · deux bugs réels trouvés en testant à l'écran juste
   * après une clôture.
   *
   * SANS RAPPROCHEMENT CLOS AVANT LUI, c'est le premier du compte, et son
   * départ est le solde DÉCLARÉ, lu sur le relevé · null tant qu'il ne l'est
   * pas, jamais zéro. Zéro se lirait « la banque ne portait rien », et
   * l'écart se calculerait sur une ouverture que personne n'a lue.
   *
   * La date de départ est celle de la TÊTE de la chaîne, le plus ancien
   * rapprochement clos · c'est elle qui fond les lignes antérieures, pour
   * tous les rapprochements qui la suivent.
   */
  private async depart(
    tenantId: string,
    r: { compteId: string; clotureAt: Date | null; soldeDepartDeclare?: Prisma.Decimal | number | null; dateDepart?: Date | null },
  ): Promise<{ soldeDepart: number | null; regle: RegleOuverture; premier: boolean }> {
    const dernier = await this.prisma.rapprochementBancaire.findFirst({
      where: { tenantId, compteId: r.compteId, statut: StatutRapprochement.CLOTURE, clotureAt: { lt: r.clotureAt ?? new Date() } },
      orderBy: { clotureAt: 'desc' },
    });
    if (!dernier) {
      return {
        soldeDepart: r.soldeDepartDeclare == null ? null : Number(r.soldeDepartDeclare),
        regle: { ancre: false, dateDepart: r.dateDepart ?? null },
        premier: true,
      };
    }
    const tete = await this.prisma.rapprochementBancaire.findFirst({
      where: { tenantId, compteId: r.compteId, statut: StatutRapprochement.CLOTURE },
      orderBy: { clotureAt: 'asc' },
      select: { dateDepart: true },
    });
    return {
      soldeDepart: Number(dernier.soldeReleve),
      regle: { ancre: true, dateDepart: tete?.dateDepart ?? null },
      premier: false,
    };
  }

  /**
   * L'OUVERTURE DU PREMIER RAPPROCHEMENT · le solde du livre à la veille de la
   * date de départ, confronté au solde déclaré et aux en-cours.
   *
   * LE LIVRE-JOURNAL SEUL, et UN SEUL EXERCICE · celui qui couvre la veille.
   * Additionner les lignes de tous les exercices compterait chaque ouverture
   * une fois par report à-nouveau qui la recopie. Dans cet exercice, son
   * à-nouveau porte ce qui précède, et ses lignes datées avant la date de
   * départ le reste. Quand la date de départ est le premier jour du premier
   * exercice, aucun exercice ne couvre la veille · on prend celui qui couvre la
   * date de départ, dont l'à-nouveau, daté de ce jour, est l'ouverture même.
   * Un à-nouveau encore provisoire (au brouillard) n'est pas au livre-journal,
   * et l'écart le montre au lieu de le deviner.
   */
  private async ouverture(
    tenantId: string,
    r: { id: string; compteId: string; soldeDepartDeclare?: Prisma.Decimal | number | null; dateDepart?: Date | null },
  ): Promise<OuvertureRapprochement> {
    const declares = await this.prisma.encoursOuvertureRapprochement.findMany({
      where: { tenantId, declareSurId: r.id },
      select: { debit: true, credit: true },
    });
    const encours = arrondi(declares.reduce((acc, e) => acc + Number(e.debit) - Number(e.credit), 0));
    const soldeDepart = r.soldeDepartDeclare == null ? null : Number(r.soldeDepartDeclare);
    const dateDepart = r.dateDepart ?? null;
    const base = { soldeDepart, dateDepart, encours };
    if (soldeDepart === null || dateDepart === null) {
      return { ...base, soldeLivre: null, ecart: null, motif: 'Solde de départ non déclaré.' };
    }
    const veille = new Date(dateDepart.getTime() - JOUR_MS);
    const exercice =
      (await this.prisma.exercice.findFirst({ where: { tenantId, dateDebut: { lte: veille }, dateFin: { gte: veille } } })) ??
      (await this.prisma.exercice.findFirst({ where: { tenantId, dateDebut: { lte: dateDepart }, dateFin: { gte: dateDepart } } }));
    if (!exercice) {
      return { ...base, soldeLivre: null, ecart: null, motif: `Aucun exercice du dossier ne couvre le ${jour(dateDepart)}.` };
    }
    const livre = await this.prisma.ligneEcriture.aggregate({
      where: {
        compteId: r.compteId,
        ecriture: {
          tenantId,
          exerciceId: exercice.id,
          statut: StatutEcriture.VALIDEE,
          estSoldeDesComptesDeGestion: false,
          OR: [{ date: { lt: dateDepart } }, { estGenereeParCloture: true }],
        },
      },
      _sum: { debit: true, credit: true },
    });
    const soldeLivre = arrondi(Number(livre._sum.debit ?? 0) - Number(livre._sum.credit ?? 0));
    return { ...base, soldeLivre, ecart: ecartDOuverture(soldeLivre, soldeDepart, encours), motif: null };
  }

  private async trouverRapprochement(tenantId: string, id: string) {
    const r = await this.prisma.rapprochementBancaire.findFirst({ where: { id, tenantId } });
    if (!r) {
      throw new NotFoundException('Rapprochement introuvable pour ce tenant');
    }
    return r;
  }

  async lister(tenantId: string, compteId?: string) {
    return this.prisma.rapprochementBancaire.findMany({
      where: { tenantId, ...(compteId ? { compteId } : {}) },
      include: { compte: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async ouvrir(tenantId: string, userId: string, dto: OuvrirRapprochementDto) {
    await this.trouverCompteTresorerie(tenantId, dto.compteId);

    // Lecture (aucun EN_COURS existant) puis écriture (création) · même
    // risque de condition de course que le numéro de pièce des journaux et
    // la prochaine lettre de lettrage (voir prisma-retry.util.ts) : deux
    // ouvertures simultanées sur le même compte pourraient toutes deux lire
    // "aucun EN_COURS" et créer chacune leur rapprochement, violant la
    // règle "un seul EN_COURS par compte" sans qu'aucune ne le remarque.
    return avecRetrySerialisable(
      this.prisma,
      async (tx) => {
        const enCours = await tx.rapprochementBancaire.findFirst({
          where: { tenantId, compteId: dto.compteId, statut: StatutRapprochement.EN_COURS },
        });
        if (enCours) {
          throw new ConflictException(
            `Un rapprochement est déjà en cours sur ce compte (ouvert le ${enCours.createdAt.toISOString().slice(0, 10)}, id ${enCours.id}) · clôturez-le ou annulez-le avant d'en ouvrir un nouveau`,
          );
        }
        return tx.rapprochementBancaire.create({
          data: {
            tenantId,
            compteId: dto.compteId,
            dateReleve: new Date(dto.dateReleve),
            soldeReleve: dto.soldeReleve,
            createdBy: userId,
          },
        });
      },
      'Trop d\'ouvertures de rapprochement simultanées sur ce compte · veuillez réessayer.',
    );
  }

  /** Détail d'un rapprochement : lignes déjà pointées ici + lignes encore pointables sur ce compte. */
  async obtenir(tenantId: string, id: string) {
    const rapprochement = await this.trouverRapprochement(tenantId, id);
    const { soldeDepart, regle, premier } = await this.depart(tenantId, rapprochement);

    // UNE TRANCHE QUI SE DIT, DES SOLDES ENTIERS (audit final F185) · un
    // compte jamais rapproché portait toutes ses lignes non pointées, tous
    // exercices confondus, en une seule lecture. Le solde pointé se prend
    // par agrégat, et les correspondances du relevé par leurs propres liens.
    // Les lignes libres, moins celles que la chaîne ne pointe pas (à-nouveaux,
    // lignes fondues dans le départ) · celles pointées sur LUI restent, pour se défaire.
    const ecartees = filtreEcarteDuPointage(regle);
    const whereLignes: Prisma.LigneEcritureWhereInput = {
      compteId: rapprochement.compteId,
      ecriture: { tenantId },
      OR: [{ rapprochementId: id }, { rapprochementId: null, NOT: { ecriture: ecartees } }],
    };
    const [lignes, total, pointe, aNouveauEcartes, fonduesDansLeDepart, encours] = await Promise.all([
      this.prisma.ligneEcriture.findMany({
        where: whereLignes,
        include: { ecriture: { include: { journal: true } } },
        orderBy: [{ ecriture: { date: 'asc' } }, { id: 'asc' }],
        take: PLAFOND_LIGNES_RAPPROCHEMENT,
      }),
      this.prisma.ligneEcriture.count({ where: whereLignes }),
      this.prisma.ligneEcriture.aggregate({
        where: { compteId: rapprochement.compteId, ecriture: { tenantId }, rapprochementId: id },
        _sum: { debit: true, credit: true },
      }),
      this.prisma.ligneEcriture.count({
        where: { compteId: rapprochement.compteId, rapprochementId: null, ecriture: { tenantId, ...filtreANouveauEcarte() } },
      }),
      regle.dateDepart === null
        ? Promise.resolve(0)
        : this.prisma.ligneEcriture.count({
            where: {
              compteId: rapprochement.compteId,
              rapprochementId: null,
              ecriture: { tenantId, date: { lt: regle.dateDepart }, NOT: filtreANouveauEcarte() },
            },
          }),
      // Les en-cours d'ouverture de la chaîne encore libres, et ceux pointés ici.
      this.prisma.encoursOuvertureRapprochement.findMany({
        where: { tenantId, declareSur: { compteId: rapprochement.compteId }, OR: [{ pointeSurId: id }, { pointeSurId: null }] },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
      }),
    ]);

    const encoursPointes = encours
      .filter((e) => e.pointeSurId === id)
      .reduce((acc, e) => acc + Number(e.debit) - Number(e.credit), 0);
    const soldePointe =
      soldeDepart === null
        ? null
        : arrondi(soldeDepart + Number(pointe._sum.debit ?? 0) - Number(pointe._sum.credit ?? 0) + encoursPointes);
    const ecart = soldePointe === null ? null : arrondi(soldePointe - Number(rapprochement.soldeReleve));

    const releve = await this.prisma.ligneReleveBancaire.findMany({
      where: { tenantId, rapprochementId: id },
      orderBy: { rang: 'asc' },
    });
    const correspondances =
      releve.length === 0
        ? []
        : await this.prisma.ligneEcriture.findMany({
            where: { ecriture: { tenantId }, ligneReleveId: { in: releve.map((r) => r.id) } },
            select: { id: true, ligneReleveId: true },
          });
    // CONTRÔLE DU RELEVÉ LUI-MÊME · solde de départ plus ses mouvements doit
    // donner le solde imprimé. Un écart dit que le fichier ne couvre pas toute
    // la période (lignes manquantes, export tronqué) ou que le solde de départ
    // n'est pas celui de la banque · il se lit AVANT de rapprocher, sinon on
    // rapproche un relevé incomplet. Sans solde de départ, il ne se lit pas.
    const ecartReleve =
      releve.length === 0 || soldeDepart === null
        ? null
        : arrondi(
            soldeDepart +
              releve.reduce((acc, r) => acc + Number(r.credit) - Number(r.debit), 0) -
              Number(rapprochement.soldeReleve),
          );

    return {
      rapprochement,
      /** Premier rapprochement du compte · il porte le solde de départ déclaré et les en-cours. */
      premier,
      soldeDepart,
      soldePointe,
      ecart,
      equilibre: ecart !== null && Math.abs(ecart) < EPSILON,
      ecartReleve,
      /** L'écart d'ouverture du premier rapprochement · null sur un rapprochement suivant. */
      ouverture: premier ? await this.ouverture(tenantId, rapprochement) : null,
      releve: releve.map((r) => ({
        id: r.id,
        rang: r.rang,
        date: r.date,
        libelle: r.libelle,
        reference: r.reference,
        debit: Number(r.debit),
        credit: Number(r.credit),
        ligneEcritureIds: correspondances.filter((l) => l.ligneReleveId === r.id).map((l) => l.id),
        encoursIds: encours.filter((e) => e.ligneReleveId === r.id).map((e) => e.id),
      })),
      /** Vrai quand la liste ne montre qu'une tranche des lignes · les soldes restent entiers. */
      tronque: total > lignes.length,
      totalLignes: total,
      /**
       * Les à-nouveaux libres que ce rapprochement ne propose pas (audit final
       * F205) · comptés par la base, pour que leur absence se dise à l'écran.
       * Le NOMBRE seul, jamais leur somme · chaque report recopie un solde qui
       * contient le précédent, et additionner les reports de deux exercices
       * compterait la première ouverture deux fois, le défaut même que cette
       * règle écarte.
       */
      aNouveauEcartes,
      /** Les lignes libres antérieures à la date de départ, fondues dans le solde de départ · le nombre seul. */
      fonduesDansLeDepart,
      lignes: lignes.map((l) => ({
        id: l.id,
        date: l.ecriture.date,
        journalCode: l.ecriture.journal.code,
        libelle: l.libelle ?? l.ecriture.libelle,
        reference: l.ecriture.reference,
        debit: Number(l.debit),
        credit: Number(l.credit),
        pointee: l.rapprochementId === id,
        ligneReleveId: l.ligneReleveId,
      })),
      encours: encours.map((e) => ({
        id: e.id,
        date: e.date,
        libelle: e.libelle,
        debit: Number(e.debit),
        credit: Number(e.credit),
        pointee: e.pointeSurId === id,
        ligneReleveId: e.ligneReleveId,
        declareIci: e.declareSurId === id,
      })),
    };
  }

  private async assurerEnCours(tenantId: string, id: string) {
    const rapprochement = await this.trouverRapprochement(tenantId, id);
    if (rapprochement.statut !== StatutRapprochement.EN_COURS) {
      throw new BadRequestException('Ce rapprochement est déjà clôturé · plus aucun pointage possible');
    }
    return rapprochement;
  }

  async pointer(tenantId: string, id: string, ligneIds: string[]) {
    const rapprochement = await this.assurerEnCours(tenantId, id);

    const lignes = await this.prisma.ligneEcriture.findMany({
      where: { id: { in: ligneIds } },
      include: { ecriture: true },
    });
    if (lignes.length !== ligneIds.length) {
      throw new NotFoundException('Une ou plusieurs lignes sont introuvables');
    }
    for (const l of lignes) {
      if (l.compteId !== rapprochement.compteId || l.ecriture.tenantId !== tenantId) {
        throw new BadRequestException('Toutes les lignes doivent appartenir au compte rapproché et au tenant indiqué');
      }
      if (l.rapprochementId && l.rapprochementId !== id) {
        throw new BadRequestException('Une des lignes est déjà pointée sur un autre rapprochement');
      }
    }
    // LE REFUS AU SERVEUR, PAS SEULEMENT L'ABSENCE À L'ÉCRAN (audit final
    // F205) · un appel direct pointerait sinon ce que la liste écarte.
    const libres = lignes.filter((l) => l.rapprochementId !== id);
    if (libres.length > 0) {
      const { regle } = await this.depart(tenantId, rapprochement);
      for (const l of libres) {
        const motif = motifRefusPointage(l.ecriture, regle);
        if (motif) throw new BadRequestException(motif);
      }
    }

    await this.prisma.ligneEcriture.updateMany({ where: { id: { in: ligneIds } }, data: { rapprochementId: id } });
    return { nombreLignes: ligneIds.length };
  }

  async depointer(tenantId: string, id: string, ligneIds: string[]) {
    await this.assurerEnCours(tenantId, id);
    const resultat = await this.prisma.ligneEcriture.updateMany({
      where: { id: { in: ligneIds }, rapprochementId: id, ecriture: { tenantId } },
      // Dépointer dénoue aussi la correspondance avec le relevé · une ligne
      // dépointée restée rattachée à une ligne du relevé la ferait passer pour
      // rapprochée à l'écran sans compter dans le solde pointé.
      data: { rapprochementId: null, ligneReleveId: null },
    });
    return { nombreLignes: resultat.count };
  }

  // =========================================================================
  // OUVERTURE DU PREMIER RAPPROCHEMENT (2026-09-28) · solde de départ déclaré
  // et en-cours d'ouverture. Voir `RegleOuverture`.
  // =========================================================================

  /** Le rapprochement est-il EN_COURS et premier de son compte ? Refuse sinon, en disant pourquoi. */
  private async assurerPremierEnCours(tenantId: string, id: string) {
    const r = await this.assurerEnCours(tenantId, id);
    const { premier } = await this.depart(tenantId, r);
    if (!premier) {
      throw new BadRequestException(
        "Un rapprochement clos précède celui-ci sur ce compte · son solde de relevé sert de départ, et l'ouverture ne se déclare que sur le premier rapprochement du compte.",
      );
    }
    return r;
  }

  /**
   * DÉCLARE le solde de départ du premier rapprochement, lu sur le relevé.
   * Refusé si une ligne pointée ici précède la nouvelle date (elle serait
   * fondue ET pointée, l'ouverture comptée deux fois), ou si un en-cours
   * déclaré ne la précède pas (un en-cours est antérieur au départ, par
   * définition).
   */
  async declarerDepart(tenantId: string, id: string, dto: DeclarerDepartDto) {
    const r = await this.assurerPremierEnCours(tenantId, id);
    const dateDepart = new Date(dto.dateDepart);
    if (dateDepart.getTime() > r.dateReleve.getTime()) {
      throw new BadRequestException(
        `La date de départ (${jour(dateDepart)}) est postérieure à la date du relevé (${jour(r.dateReleve)}) · le relevé couvre la période qui suit le départ.`,
      );
    }
    const [anterieuresPointees, encoursTardifs] = await Promise.all([
      this.prisma.ligneEcriture.count({
        where: { compteId: r.compteId, rapprochementId: id, ecriture: { tenantId, date: { lt: dateDepart } } },
      }),
      this.prisma.encoursOuvertureRapprochement.count({ where: { tenantId, declareSurId: id, date: { gte: dateDepart } } }),
    ]);
    if (anterieuresPointees > 0) {
      throw new BadRequestException(
        `${anterieuresPointees} ligne(s) pointée(s) sur ce rapprochement précèdent le ${jour(dateDepart)} · elles seraient fondues dans le solde de départ et comptées deux fois. Dépointez-les, et déclarez en en-cours d'ouverture celles que la banque n'avait pas encore passées.`,
      );
    }
    if (encoursTardifs > 0) {
      throw new BadRequestException(
        `${encoursTardifs} en-cours d'ouverture ne précède(nt) pas le ${jour(dateDepart)} · un en-cours est une opération du livre antérieure au départ. Retirez-le ou choisissez une date de départ plus tardive.`,
      );
    }
    return this.prisma.rapprochementBancaire.update({
      where: { id: r.id },
      data: { soldeDepartDeclare: dto.soldeDepart, dateDepart },
    });
  }

  /** DÉCLARE un en-cours d'ouverture · aucune écriture n'est créée. */
  async declarerEncours(tenantId: string, userId: string, id: string, dto: DeclarerEncoursDto) {
    const r = await this.assurerPremierEnCours(tenantId, id);
    if (!r.dateDepart) {
      throw new BadRequestException("Déclarez d'abord le solde de départ et sa date · un en-cours se situe avant elle.");
    }
    const date = new Date(dto.date);
    if (date.getTime() >= r.dateDepart.getTime()) {
      throw new BadRequestException(
        `L'en-cours du ${jour(date)} ne précède pas la date de départ du ${jour(r.dateDepart)} · une opération postérieure se pointe comme une écriture du compte.`,
      );
    }
    const libelle = dto.libelle.trim();
    if (!libelle) throw new BadRequestException("Le libellé de l'en-cours est obligatoire.");
    if (!(dto.montant > 0)) throw new BadRequestException("Le montant de l'en-cours doit être positif · le sens dit s'il entre ou sort.");
    return this.prisma.encoursOuvertureRapprochement.create({
      data: {
        tenantId,
        declareSurId: id,
        libelle,
        date,
        debit: dto.sens === 'DEBIT' ? dto.montant : 0,
        credit: dto.sens === 'CREDIT' ? dto.montant : 0,
        createdBy: userId,
      },
    });
  }

  /** RETIRE un en-cours déclaré sur ce rapprochement, s'il n'est pas pointé. */
  async retirerEncours(tenantId: string, id: string, encoursId: string) {
    await this.assurerEnCours(tenantId, id);
    const e = await this.prisma.encoursOuvertureRapprochement.findFirst({ where: { id: encoursId, tenantId, declareSurId: id } });
    if (!e) throw new NotFoundException("En-cours d'ouverture introuvable sur ce rapprochement.");
    if (e.pointeSurId) throw new BadRequestException("Cet en-cours est pointé · dépointez-le avant de le retirer.");
    await this.prisma.encoursOuvertureRapprochement.delete({ where: { id: e.id } });
    return { supprime: true };
  }

  /** POINTE des en-cours d'ouverture de la chaîne, comme des lignes du compte. */
  async pointerEncours(tenantId: string, id: string, encoursIds: string[]) {
    const r = await this.assurerEnCours(tenantId, id);
    const encours = await this.prisma.encoursOuvertureRapprochement.findMany({
      where: { id: { in: encoursIds }, tenantId, declareSur: { compteId: r.compteId } },
    });
    if (encours.length !== encoursIds.length) {
      throw new NotFoundException("Un en-cours d'ouverture est introuvable sur ce compte.");
    }
    if (encours.some((e) => e.pointeSurId && e.pointeSurId !== id)) {
      throw new BadRequestException("Un des en-cours est déjà pointé sur un autre rapprochement.");
    }
    await this.prisma.encoursOuvertureRapprochement.updateMany({
      where: { id: { in: encoursIds }, tenantId, pointeSurId: null },
      data: { pointeSurId: id },
    });
    return { nombreEncours: encoursIds.length };
  }

  async depointerEncours(tenantId: string, id: string, encoursIds: string[]) {
    await this.assurerEnCours(tenantId, id);
    const r = await this.prisma.encoursOuvertureRapprochement.updateMany({
      where: { id: { in: encoursIds }, tenantId, pointeSurId: id },
      data: { pointeSurId: null, ligneReleveId: null },
    });
    return { nombreEncours: r.count };
  }

  async cloturer(tenantId: string, id: string) {
    const rapprochement = await this.assurerEnCours(tenantId, id);
    const { ecart, equilibre, premier, ouverture } = await this.obtenir(tenantId, id);
    // LE PREMIER RAPPROCHEMENT NE SE CLÔT QUE SUR UNE OUVERTURE COHÉRENTE ·
    // décision d'éditeur, comme QuickBooks qui bloque la continuité. Un écart
    // d'ouverture non nul dit que le solde déclaré, les en-cours ou le livre
    // ne racontent pas la même ouverture · clos quand même, chaque
    // rapprochement suivant en hériterait sans que rien ne le dise.
    if (premier && ouverture) {
      if (ouverture.soldeDepart === null || ouverture.dateDepart === null) {
        throw new BadRequestException(
          "Premier rapprochement de ce compte · déclarez le solde de départ lu sur le relevé et sa date avant de clôturer. Il ne se déduit pas de l'à-nouveau, qui est un solde comptable.",
        );
      }
      if (ouverture.ecart === null) {
        throw new BadRequestException(`L'écart d'ouverture ne se calcule pas · ${ouverture.motif ?? ''}`.trim());
      }
      if (Math.abs(ouverture.ecart) >= EPSILON) {
        throw new BadRequestException(
          `L'écart d'ouverture n'est pas nul (${ouverture.ecart.toFixed(2)}) · le solde du compte au livre-journal à la veille du ${jour(ouverture.dateDepart)} ` +
            `(${(ouverture.soldeLivre ?? 0).toFixed(2)}) doit valoir le solde de départ déclaré (${ouverture.soldeDepart.toFixed(2)}) plus les en-cours d'ouverture (${ouverture.encours.toFixed(2)}).`,
        );
      }
    }
    if (!equilibre || ecart === null) {
      throw new BadRequestException(
        `L'écart n'est pas nul (${(ecart ?? 0).toFixed(2)}) · pointez ou dépointez des lignes jusqu'à ce que le solde pointé corresponde exactement au solde du relevé avant de clôturer`,
      );
    }
    return this.prisma.rapprochementBancaire.update({
      where: { id: rapprochement.id },
      data: { statut: StatutRapprochement.CLOTURE, clotureAt: new Date() },
    });
  }

  /**
   * Annule un rapprochement EN_COURS ouvert par erreur : dépointe ses
   * lignes puis le supprime. Deux annulations simultanées du même
   * rapprochement passeraient toutes deux `assurerEnCours` (aucune n'a
   * encore supprimé la ligne au moment où l'autre la lit) ; la seconde
   * `delete` échouerait alors sur un enregistrement déjà supprimé · capturé
   * ici pour ne jamais renvoyer une erreur Prisma brute (P2025) à
   * l'utilisateur, même principe que le reste de l'API (jamais de 500 nu).
   *
   * UN RAPPROCHEMENT ROUVERT NE S'ANNULE PAS · il a été clos, son solde de
   * relevé a servi de départ, et le supprimer effacerait un état arrêté sous
   * couvert d'une erreur d'ouverture. Il se reclôt.
   */
  async annuler(tenantId: string, id: string) {
    const rapprochement = await this.assurerEnCours(tenantId, id);
    if (rapprochement.rouvertAt) {
      throw new BadRequestException(
        "Ce rapprochement a été clos puis rouvert · il ne s'annule pas, il se reclôt une fois corrigé.",
      );
    }
    await this.prisma.ligneEcriture.updateMany({
      where: { rapprochementId: rapprochement.id },
      data: { rapprochementId: null, ligneReleveId: null },
    });
    await this.prisma.encoursOuvertureRapprochement.updateMany({
      where: { tenantId, pointeSurId: rapprochement.id },
      data: { pointeSurId: null, ligneReleveId: null },
    });
    try {
      await this.prisma.rapprochementBancaire.delete({ where: { id: rapprochement.id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundException('Ce rapprochement a déjà été annulé');
      }
      throw err;
    }
    return { supprime: true };
  }

  /**
   * ROUVRE un rapprochement clos (2026-09-28). Aucun éditeur relu ne rouvre
   * d'office · QuickBooks permet de défaire un rapprochement passé, ce qui
   * défait les suivants. OmegaX ne défait rien en cascade, et c'est pourquoi
   * seul le DERNIER rapprochement clos du compte se rouvre · un plus ancien
   * changerait le solde de départ des suivants sous eux, sans qu'ils le
   * sachent. Administrateur seul (le contrôleur), motif obligatoire, au
   * journal d'audit par le modèle lui-même.
   *
   * UNE RÉOUVERTURE NE FRANCHIT PAS UNE CLÔTURE (§ 8, `gel-cloture.ts`) · ni un
   * exercice clôturé, ni une clôture de période, ni la clôture totale d'un
   * journal de ce compte qui couvre la date du relevé. Un rapprochement
   * rouvert se dépointe par le chemin ordinaire, et redevient la tête de la
   * chaîne s'il était le seul · il lui faut alors un solde de départ déclaré
   * pour se reclore.
   */
  async rouvrir(tenantId: string, userId: string, id: string, motif: string) {
    const m = (motif ?? '').trim();
    if (!m) throw new BadRequestException('Le motif de la réouverture est obligatoire · il reste sur le rapprochement.');
    return avecRetrySerialisable(
      this.prisma,
      async (tx) => {
        const r = await tx.rapprochementBancaire.findFirst({ where: { id, tenantId } });
        if (!r) throw new NotFoundException('Rapprochement introuvable pour ce tenant');
        if (r.statut !== StatutRapprochement.CLOTURE) {
          throw new BadRequestException('Seul un rapprochement clos se rouvre.');
        }
        const suivant = await tx.rapprochementBancaire.findFirst({
          where: {
            tenantId,
            compteId: r.compteId,
            statut: StatutRapprochement.CLOTURE,
            clotureAt: { gt: r.clotureAt ?? new Date(0) },
          },
        });
        if (suivant) {
          throw new BadRequestException(
            `Seul le dernier rapprochement clos du compte se rouvre · celui du relevé du ${jour(suivant.dateReleve)} le suit, et part de son solde de relevé. Rouvrez d'abord le plus récent.`,
          );
        }
        const enCours = await tx.rapprochementBancaire.findFirst({
          where: { tenantId, compteId: r.compteId, statut: StatutRapprochement.EN_COURS },
        });
        if (enCours) {
          throw new ConflictException(
            "Un rapprochement est en cours sur ce compte · il part du solde de celui-ci. Annulez-le ou clôturez-le avant de rouvrir.",
          );
        }
        const gel = await this.motifGel(tx, tenantId, r);
        if (gel) throw new BadRequestException(`Réouverture impossible : ${gel}.`);
        return tx.rapprochementBancaire.update({
          where: { id: r.id },
          data: { statut: StatutRapprochement.EN_COURS, clotureAt: null, rouvertAt: new Date(), rouvertBy: userId, motifReouverture: m },
        });
      },
      'Trop de réouvertures simultanées sur ce compte · veuillez réessayer.',
    );
  }

  /** Pourquoi la date du relevé est figée par une clôture, ou null · la même règle que le lettrage. */
  private async motifGel(
    tx: Prisma.TransactionClient,
    tenantId: string,
    r: { compteId: string; dateReleve: Date },
  ): Promise<string | null> {
    const [exercice, clotures, journaux] = await Promise.all([
      tx.exercice.findFirst({ where: { tenantId, dateDebut: { lte: r.dateReleve }, dateFin: { gte: r.dateReleve } } }),
      tx.cloture.findMany({
        where: { tenantId, annuleeAt: null, granularite: { not: GranulariteCloture.PARTIELLE } },
        select: { granularite: true, journalId: true, dateLimite: true },
      }) as Promise<ClotureActive[]>,
      tx.journal.findMany({ where: { tenantId, compteTresorerieId: r.compteId }, select: { id: true, code: true } }),
    ]);
    if (exercice?.statut === StatutExercice.CLOTURE) {
      return motifLigneFigee({ journalId: '', date: r.dateReleve, exerciceClos: true }, []);
    }
    // Une clôture de période fige tous les journaux · un journal sans nom suffit à la lire.
    for (const j of [{ id: '', code: '' }, ...journaux]) {
      const motif = motifLigneFigee({ journalId: j.id, journalCode: j.code || undefined, date: r.dateReleve, exerciceClos: false }, clotures);
      if (motif) return motif;
    }
    return null;
  }

  // =========================================================================
  // RELEVÉ IMPORTÉ ET CORRESPONDANCES (2026-09-25) · voir releve-bancaire.ts
  // =========================================================================

  /** Les lignes du relevé de ce rapprochement déjà rapprochées, écritures et en-cours d'ouverture. */
  private async correspondancesDuReleve(tenantId: string, id: string) {
    const [lignes, encours] = await Promise.all([
      this.prisma.ligneEcriture.count({ where: { ecriture: { tenantId }, ligneReleve: { rapprochementId: id, tenantId } } }),
      this.prisma.encoursOuvertureRapprochement.count({ where: { tenantId, ligneReleve: { rapprochementId: id, tenantId } } }),
    ]);
    return lignes + encours;
  }

  /**
   * IMPORTE le relevé du rapprochement. Refusé dès qu'une anomalie est lue,
   * et quand une ligne est datée APRÈS la date du relevé · elle appartient au
   * relevé suivant, et la prendre ici ferait rapprocher une opération que le
   * solde imprimé ne contient pas. Un relevé déjà importé se REMPLACE tant
   * qu'aucune de ses lignes n'est rapprochée ; après, il faut dissocier
   * d'abord, pour qu'aucune correspondance confirmée ne disparaisse sans geste.
   */
  async importerReleve(tenantId: string, id: string, dto: ImporterReleveDto) {
    const rapprochement = await this.assurerEnCours(tenantId, id);
    const tableau = await lireFichier(dto.nomFichier, dto.contenuBase64);
    const index = reconnaitreColonnes(tableau.colonnes, (dto.colonnes ?? {}) as Partial<Record<ChampReleve, string>>);
    const { lignes, anomalies } = lireReleve(tableau, index);
    const fin = rapprochement.dateReleve.getTime();
    lignes.forEach((l) => {
      if (l.date.getTime() > fin) {
        anomalies.push(
          `Opération du ${l.date.toISOString().slice(0, 10)} (« ${l.libelle} ») postérieure à la date du relevé · elle appartient au relevé suivant.`,
        );
      }
    });
    if (anomalies.length > 0) {
      // Les dix premières seulement, et le compte du reste · un relevé mal
      // lu d'un bout à l'autre rendrait sinon un message de trois écrans.
      const reste = anomalies.length > 10 ? ` Et ${anomalies.length - 10} autre(s).` : '';
      throw new BadRequestException(
        `Relevé non importé · ${anomalies.slice(0, 10).join(' ')}${reste} Colonnes du fichier : ${tableau.colonnes.join(', ')}.`,
      );
    }
    if (lignes.length === 0) {
      throw new BadRequestException('Le relevé ne contient aucune opération.');
    }
    if ((await this.correspondancesDuReleve(tenantId, id)) > 0) {
      throw new ConflictException(
        'Des lignes du relevé actuel sont déjà rapprochées · dissociez-les avant de réimporter le relevé.',
      );
    }
    await transactionJournalisee(this.prisma, async (tx) => {
      await tx.ligneReleveBancaire.deleteMany({ where: { tenantId, rapprochementId: id } });
      await tx.ligneReleveBancaire.createMany({
        data: lignes.map((l) => ({
          tenantId,
          rapprochementId: id,
          rang: l.rang,
          date: l.date,
          libelle: l.libelle,
          reference: l.reference,
          debit: l.debit,
          credit: l.credit,
        })),
      });
    });
    return { nombreLignes: lignes.length };
  }

  /** Retire le relevé importé, s'il n'a encore aucune ligne rapprochée. */
  async retirerReleve(tenantId: string, id: string) {
    await this.assurerEnCours(tenantId, id);
    if ((await this.correspondancesDuReleve(tenantId, id)) > 0) {
      throw new ConflictException('Des lignes du relevé sont rapprochées · dissociez-les avant de retirer le relevé.');
    }
    const r = await this.prisma.ligneReleveBancaire.deleteMany({ where: { tenantId, rapprochementId: id } });
    return { nombreLignes: r.count };
  }

  /**
   * PROPOSE les correspondances, sans rien écrire. Recalculée à chaque appel,
   * elle ne peut pas être périmée · même parti que le pré-lettrage. Les
   * en-cours d'ouverture libres sont candidats comme les lignes du compte, par
   * les mêmes passes · leurs identifiants sont rendus à part.
   */
  async proposer(tenantId: string, id: string, fenetreJours = FENETRE_JOURS_DEFAUT) {
    const rapprochement = await this.assurerEnCours(tenantId, id);
    const releve = await this.prisma.ligneReleveBancaire.findMany({
      where: { tenantId, rapprochementId: id, lignesEcriture: { none: {} }, encoursOuverture: { none: {} } },
      orderBy: { rang: 'asc' },
    });
    // BORNÉES PAR LA FENÊTRE DE DATES (audit final F185) · les deux passes de
    // `proposerCorrespondances` l'exigent de toute candidate, si bien qu'une
    // ligne hors de [première date du relevé − fenêtre, dernière + fenêtre]
    // ne peut rien proposer. Lire tout le compte libre ne changeait rien au
    // résultat, et chargeait des années de lignes jamais rapprochées.
    const instants = releve.map((r) => r.date.getTime());
    // Ni ce que la chaîne écarte (audit final F205) · proposé, un report du
    // même montant qu'une ligne du relevé se confirmerait.
    const regle = releve.length === 0 ? null : (await this.depart(tenantId, rapprochement)).regle;
    const fenetre =
      regle === null
        ? null
        : {
            gte: new Date(instants.reduce((a, b) => Math.min(a, b)) - fenetreJours * JOUR_MS),
            lte: new Date(instants.reduce((a, b) => Math.max(a, b)) + fenetreJours * JOUR_MS),
          };
    const [compte, encours] =
      regle === null || fenetre === null
        ? [[], []]
        : await Promise.all([
            this.prisma.ligneEcriture.findMany({
              where: {
                compteId: rapprochement.compteId,
                ecriture: {
                  tenantId,
                  NOT: filtreEcarteDuPointage(regle),
                  date: fenetre,
                },
                rapprochementId: null,
                ligneReleveId: null,
              },
              include: { ecriture: { select: { date: true, reference: true } } },
            }),
            this.prisma.encoursOuvertureRapprochement.findMany({
              where: {
                tenantId,
                declareSur: { compteId: rapprochement.compteId },
                pointeSurId: null,
                ligneReleveId: null,
                date: fenetre,
              },
            }),
          ]);
    const idsEncours = new Set(encours.map((e) => e.id));
    const propositions = proposerCorrespondances(
      releve.map((r) => ({
        id: r.id,
        rang: r.rang,
        date: r.date,
        libelle: r.libelle,
        reference: r.reference,
        debit: Number(r.debit),
        credit: Number(r.credit),
      })),
      [
        ...compte.map((l) => ({
          id: l.id,
          date: l.ecriture.date,
          reference: l.ecriture.reference,
          debit: Number(l.debit),
          credit: Number(l.credit),
        })),
        ...encours.map((e) => ({ id: e.id, date: e.date, reference: null, debit: Number(e.debit), credit: Number(e.credit) })),
      ],
      fenetreJours,
    ).map((p) => ({
      ...p,
      ligneEcritureIds: p.ligneEcritureIds.filter((x) => !idsEncours.has(x)),
      encoursIds: p.ligneEcritureIds.filter((x) => idsEncours.has(x)),
    }));
    return {
      fenetreJours,
      propositions,
      // Ce qui n'a PAS été rapproché est compté · une proposition qui ne
      // montrerait que ses trouvailles laisserait croire que le reste l'est.
      lignesReleveSansProposition: releve.length - propositions.length,
    };
  }

  /**
   * CONFIRME des correspondances, proposées ou composées à la main. Rien de ce
   * que le client renvoie n'est cru · chaque groupe est REJOUÉ : ligne du
   * relevé de CE rapprochement et libre, lignes du compte rapproché (ou
   * en-cours d'ouverture de sa chaîne), du dossier, libres, et somme vue du
   * compte ÉGALE au montant du relevé, au centime. Puis la ligne est pointée ·
   * une correspondance confirmée EST un pointage, et c'est lui que l'écart et
   * la clôture lisent déjà.
   */
  async confirmer(tenantId: string, id: string, dto: ConfirmerCorrespondancesDto) {
    const rapprochement = await this.assurerEnCours(tenantId, id);
    const idsReleve = dto.correspondances.map((c) => c.ligneReleveId);
    const idsCompte = dto.correspondances.flatMap((c) => c.ligneEcritureIds ?? []);
    const idsEncours = dto.correspondances.flatMap((c) => c.encoursIds ?? []);
    if (dto.correspondances.some((c) => (c.ligneEcritureIds ?? []).length + (c.encoursIds ?? []).length === 0)) {
      throw new BadRequestException('Une correspondance réunit au moins une ligne du compte ou un en-cours d’ouverture.');
    }
    if (
      new Set(idsReleve).size !== idsReleve.length ||
      new Set(idsCompte).size !== idsCompte.length ||
      new Set(idsEncours).size !== idsEncours.length
    ) {
      throw new BadRequestException('Une même ligne figure dans deux correspondances.');
    }
    const releve = await this.prisma.ligneReleveBancaire.findMany({
      where: { tenantId, rapprochementId: id, id: { in: idsReleve } },
      include: { lignesEcriture: { select: { id: true } }, encoursOuverture: { select: { id: true } } },
    });
    if (releve.length !== idsReleve.length) {
      throw new NotFoundException('Une ligne du relevé est introuvable dans ce rapprochement.');
    }
    const compte =
      idsCompte.length === 0
        ? []
        : await this.prisma.ligneEcriture.findMany({
            where: { id: { in: idsCompte }, ecriture: { tenantId } },
            include: {
              ecriture: { select: { estGenereeParCloture: true, estSoldeDesComptesDeGestion: true, exerciceId: true, date: true } },
            },
          });
    if (compte.length !== idsCompte.length) {
      throw new NotFoundException('Une ligne d\'écriture est introuvable.');
    }
    const encours =
      idsEncours.length === 0
        ? []
        : await this.prisma.encoursOuvertureRapprochement.findMany({
            where: { id: { in: idsEncours }, tenantId, declareSur: { compteId: rapprochement.compteId } },
          });
    if (encours.length !== idsEncours.length) {
      throw new NotFoundException("Un en-cours d'ouverture est introuvable sur ce compte.");
    }
    // Une correspondance composée à la main passe par la même règle que le
    // pointage (audit final F205) · confirmer, c'est pointer.
    const libres = compte.filter((l) => l.rapprochementId !== id);
    if (libres.length > 0) {
      const { regle } = await this.depart(tenantId, rapprochement);
      for (const l of libres) {
        const motif = motifRefusPointage(l.ecriture, regle);
        if (motif) throw new BadRequestException(motif);
      }
    }
    for (const c of dto.correspondances) {
      const r = releve.find((x) => x.id === c.ligneReleveId)!;
      if (r.lignesEcriture.length > 0 || (r.encoursOuverture ?? []).length > 0) {
        throw new BadRequestException(`La ligne du relevé « ${r.libelle} » est déjà rapprochée.`);
      }
      const lignes = compte.filter((l) => (c.ligneEcritureIds ?? []).includes(l.id));
      for (const l of lignes) {
        if (l.compteId !== rapprochement.compteId) {
          throw new BadRequestException('Toutes les lignes doivent appartenir au compte rapproché.');
        }
        if ((l.rapprochementId && l.rapprochementId !== id) || l.ligneReleveId) {
          throw new BadRequestException('Une des lignes est déjà pointée ou rapprochée.');
        }
      }
      const enc = encours.filter((e) => (c.encoursIds ?? []).includes(e.id));
      if (enc.some((e) => (e.pointeSurId && e.pointeSurId !== id) || e.ligneReleveId)) {
        throw new BadRequestException("Un des en-cours d'ouverture est déjà pointé ou rapproché.");
      }
      const attendu = montantVuDuCompte({ debit: Number(r.debit), credit: Number(r.credit) });
      const obtenu = arrondi(
        lignes.reduce((acc, l) => acc + Number(l.debit) - Number(l.credit), 0) +
          enc.reduce((acc, e) => acc + Number(e.debit) - Number(e.credit), 0),
      );
      if (Math.abs(attendu - obtenu) >= EPSILON) {
        throw new BadRequestException(
          `« ${r.libelle} » : le relevé porte ${attendu.toFixed(2)} vu du compte, les lignes choisies ${obtenu.toFixed(2)} · ` +
            'un écart ne se rapproche pas, il se comptabilise.',
        );
      }
    }
    await transactionJournalisee(this.prisma, async (tx) => {
      for (const c of dto.correspondances) {
        if ((c.ligneEcritureIds ?? []).length > 0) {
          await tx.ligneEcriture.updateMany({
            where: { id: { in: c.ligneEcritureIds }, ecriture: { tenantId }, ligneReleveId: null },
            data: { rapprochementId: id, ligneReleveId: c.ligneReleveId },
          });
        }
        if ((c.encoursIds ?? []).length > 0) {
          await tx.encoursOuvertureRapprochement.updateMany({
            where: { id: { in: c.encoursIds }, tenantId, ligneReleveId: null },
            data: { pointeSurId: id, ligneReleveId: c.ligneReleveId },
          });
        }
      }
    });
    return { nombreCorrespondances: dto.correspondances.length };
  }

  /** Dissocie une ligne du relevé de ses écritures et en-cours, et les dépointe. */
  async dissocier(tenantId: string, id: string, ligneReleveId: string) {
    await this.assurerEnCours(tenantId, id);
    const r = await this.prisma.ligneReleveBancaire.findFirst({ where: { id: ligneReleveId, tenantId, rapprochementId: id } });
    if (!r) throw new NotFoundException('Ligne du relevé introuvable dans ce rapprochement.');
    const res = await this.prisma.ligneEcriture.updateMany({
      where: { ligneReleveId, ecriture: { tenantId } },
      data: { ligneReleveId: null, rapprochementId: null },
    });
    const enc = await this.prisma.encoursOuvertureRapprochement.updateMany({
      where: { ligneReleveId, tenantId },
      data: { ligneReleveId: null, pointeSurId: null },
    });
    return { nombreLignes: res.count + enc.count };
  }
}
