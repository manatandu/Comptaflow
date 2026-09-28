import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { MONNAIE_DE_TENUE } from '../../common/monnaie-de-tenue';
import { LOT_ECRITURES, lireParLots, pageApres } from '../../common/lecture-par-lots';

/**
 * LA BALANCE EN MONNAIE FONCTIONNELLE · le second jeu, et ce qu'il n'est pas.
 *
 * M1 a posé la règle et elle ne bouge pas : la monnaie de TENUE ne se choisit
 * pas. Loi n° 23/053 art. 141, 1° · la comptabilité « est exprimée en Franc
 * congolais » ; AUDCIF art. 17, 1° · elle se tient « dans l'unité monétaire
 * ayant cours légal dans l'État partie ». Les livres et les états déposés
 * restent en francs, sans option ni dérogation.
 *
 * ET POURTANT beaucoup d'ASBL et de sociétés congolaises encaissent, dépensent
 * et rendent compte à leur bailleur en dollars. Ce second jeu existe pour
 * elles. AUCUN TEXTE LU NE LE RÉGIT · l'AUDCIF ne connaît la devise que pour
 * convertir une opération VERS l'unité légale (art. 36 et suivants, Titre VIII
 * ch. 22), jamais pour en sortir. Le produire est une décision de l'éditeur, et
 * chaque état porte la mention qui le dit.
 *
 * LA MÉTHODE, ET POURQUOI CELLE-LÀ.
 *
 * Convertir la BALANCE au cours de clôture serait plus simple, et faux : le
 * coût historique d'un bâtiment acheté il y a six ans se retrouverait exprimé
 * au cours d'aujourd'hui, et la balance cesserait d'équilibrer sans qu'on
 * ajoute une ligne de bouclage inventée. La conversion se fait donc LIGNE À
 * LIGNE, au cours de la DATE DE L'ÉCRITURE · le cours historique de
 * l'opération elle-même.
 *
 * TOUTES LES LIGNES D'UNE MÊME ÉCRITURE PRENNENT LE MÊME COURS, celui de sa
 * date. C'est ce qui garde chaque écriture équilibrée après conversion, et
 * donc la balance entière · une écriture dont le débit et le crédit
 * emprunteraient deux cours différents produirait un déséquilibre par pure
 * arithmétique.
 *
 * UNE LIGNE DÉJÀ LIBELLÉE DANS LA MONNAIE FONCTIONNELLE N'EST PAS CONVERTIE ·
 * elle porte son montant d'origine. Un virement de 10 000 USD doit apparaître
 * pour 10 000 USD, pas pour sa contrevaleur en francs redivisée par un cours,
 * qui rendrait 9 999,97 sans qu'aucun centime n'ait bougé.
 *
 * D'OÙ L'ÉCART DE CONVERSION, ET IL EST MONTRÉ. Une écriture qui mêle une
 * ligne prise à son montant d'origine et une ligne convertie ne s'équilibre
 * plus dans la monnaie fonctionnelle. Ce n'est pas un défaut de calcul, c'est
 * un fait : les deux côtés de l'opération n'ont pas la même origine. L'écart
 * est porté sur sa propre ligne, nommé, jamais absorbé dans un compte.
 *
 * LE COURS D'UNE ÉCRITURE EST CELUI EN VIGUEUR À SA DATE · le dernier saisi à
 * cette date ou avant (`coursApplicable`), jamais un postérieur. Une règle,
 * trois endroits qui la disent pareil (audit final F155) · ce commentaire, la
 * mention imprimée et CLAUDE.md, qui parlaient l'un de « SA date », l'autre
 * d'une « date sans cours » qui arrête l'état.
 *
 * ET LE MODULE REFUSE PLUTÔT QUE D'INVENTER UN COURS. Une écriture ANTÉRIEURE
 * à tout cours saisi arrête l'état, et la liste de ses dates est rendue.
 * Prendre un cours postérieur, ou celui de la clôture, produirait une balance
 * plausible et fausse · exactement le défaut que le § 10 bis interdit.
 */
/**
 * D'OÙ VIENT L'OUVERTURE DU JEU (audit final F42).
 *
 *  · `AUCUNE` · l'exercice n'a pas d'à-nouveau ;
 *  · `EXERCICE_PRECEDENT` · la clôture du jeu fonctionnel de l'exercice
 *    précédent, compte par compte, le résultat porté au compte 13 que la
 *    clôture en francs a mouvementé ;
 *  · `CONVERTIE_A_SA_DATE` · aucun exercice précédent dans le dossier (bilan
 *    d'ouverture d'une reprise), l'à-nouveau est converti au cours de sa date,
 *    faute d'aucun autre cours historique.
 */
export type OuvertureFonctionnelle = 'AUCUNE' | 'EXERCICE_PRECEDENT' | 'CONVERTIE_A_SA_DATE';

interface CompteFonctionnel {
  numero: string;
  intitule: string;
  ouvertureDebit: number;
  ouvertureCredit: number;
  debit: number;
  credit: number;
}

interface JeuFonctionnel {
  parCompte: Map<string, CompteFonctionnel>;
  lignes: number;
  lignesExactes: number;
  ecritures: number;
  ouverture: OuvertureFonctionnelle;
}

/**
 * Au-delà, l'enchaînement des exercices n'est plus remonté · dix ans de
 * conservation (AUDCIF art. 24), le double pour les dossiers longs.
 */
const PROFONDEUR_MAX = 20;

/**
 * Ce que le jeu lit d'une écriture (audit final F189) · sa date, qui donne le
 * cours de TOUTES ses lignes, et de chaque ligne ce que la conversion demande,
 * rien d'autre. L'écriture arrive entière dans sa tranche · ses lignes ne sont
 * jamais séparées du cours qu'elles partagent.
 */
const SELECT_ECRITURE = {
  id: true,
  date: true,
  lignes: {
    select: {
      debit: true,
      credit: true,
      montantDevise: true,
      devise: { select: { code: true } },
      compte: { select: { id: true, numero: true, intitule: true } },
    },
  },
} satisfies Prisma.EcritureSelect;

type EcritureLue = Prisma.EcritureGetPayload<{ select: typeof SELECT_ECRITURE }>;

/** Les mouvements de l'exercice · tout ce que la clôture n'a pas engendré. */
const MOUVEMENTS = { estGenereeParCloture: false } as const;

/** L'à-nouveau · engendré par la clôture, sans être le solde des comptes de gestion. */
const A_NOUVEAU = { estGenereeParCloture: true, estSoldeDesComptesDeGestion: false } as const;

@Injectable()
export class BalanceFonctionnelleService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * LE COURS APPLICABLE À UNE DATE · le dernier connu à cette date ou avant.
   *
   * JAMAIS UN COURS POSTÉRIEUR. Un cours publié le 15 ne s'applique pas à une
   * opération du 3 : ce serait convertir avec une information que personne
   * n'avait au moment de l'opération, et le second jeu cesserait d'être
   * historique pour devenir rétrospectif.
   */
  static coursApplicable(cours: { date: Date; cours: number }[], date: Date): number | null {
    let retenu: { date: Date; cours: number } | null = null;
    for (const c of cours) {
      if (c.date.getTime() > date.getTime()) continue;
      if (!retenu || c.date.getTime() > retenu.date.getTime()) retenu = c;
    }
    return retenu?.cours ?? null;
  }

  /**
   * LA CONVERSION D'UNE LIGNE · exacte quand la ligne est déjà dans la monnaie
   * fonctionnelle, convertie au cours de l'écriture sinon.
   *
   * Le cours dit combien vaut UNE unité de la devise dans la monnaie de tenue
   * (modèle `CoursDevise`). Passer des francs à la monnaie fonctionnelle se
   * fait donc en DIVISANT par ce cours.
   */
  static convertirLigne(
    ligne: { debit: number; credit: number; deviseCode: string | null; montantDevise: number | null },
    monnaieFonctionnelle: string,
    coursDeLEcriture: number,
  ): { debit: number; credit: number; exacte: boolean } {
    if (ligne.deviseCode === monnaieFonctionnelle && ligne.montantDevise !== null) {
      // Le montant d'origine porte la valeur absolue de l'opération · c'est le
      // sens de la ligne en monnaie de tenue qui dit de quel côté il tombe.
      // Une ligne INSCRITE EN NÉGATIF garde son côté et son signe · la
      // porter de l'autre côté en positif en ferait une contre-passation, qui
      // gonflerait les deux cumuls (AUDCIF art. 20).
      const montant = Math.abs(ligne.montantDevise);
      if (ligne.debit !== 0) return { debit: Math.sign(ligne.debit) * montant, credit: 0, exacte: true };
      return { debit: 0, credit: Math.sign(ligne.credit) * montant, exacte: true };
    }
    return {
      debit: ligne.debit / coursDeLEcriture,
      credit: ligne.credit / coursDeLEcriture,
      exacte: false,
    };
  }

  /**
   * LA MENTION QUE CHAQUE PAGE DE CE JEU PORTE.
   *
   * Elle n'est pas une précaution de style : un document qui ressemble à une
   * balance et qui n'est pas la balance légale doit dire lequel des deux il
   * est, sur la page et non dans un manuel.
   */
  static readonly MENTION_SANS_VALEUR_LEGALE =
    "Document de gestion · SANS VALEUR LÉGALE. La comptabilité de ce dossier est tenue et arrêtée en " +
    `${MONNAIE_DE_TENUE} (loi n° 23/053, art. 141, 1° ; AUDCIF, art. 17, 1°), et c'est la balance en ` +
    `${MONNAIE_DE_TENUE} qui fait foi. Cet état convertit chaque écriture de l'exercice au cours en vigueur à sa date (le dernier saisi à cette date ou avant, jamais un postérieur) pour ` +
    "rendre compte dans la monnaie où l'entité vit réellement, et reprend à l'ouverture la clôture du même jeu " +
    "pour l'exercice précédent. Aucun texte lu ne régit ce second jeu.";

  /**
   * LA BALANCE DU SECOND JEU.
   *
   * Trois refus avant tout calcul, et le troisième est le plus important :
   * une date sans cours arrête l'état plutôt que de le remplir d'un chiffre
   * inventé.
   */
  async balance(tenantId: string, exerciceId: string) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { devise: true, deviseFonctionnelle: true },
    });
    const monnaieTenue = tenant.devise ?? MONNAIE_DE_TENUE;
    const fonctionnelle = tenant.deviseFonctionnelle;

    if (!fonctionnelle) {
      throw new BadRequestException(
        "Aucune monnaie fonctionnelle n'est nommée pour ce dossier · renseignez-la dans les paramètres du " +
          'dossier. Elle ne déplace pas la tenue, qui reste en ' +
          `${monnaieTenue} : elle nomme la monnaie dans laquelle l'entité encaisse, dépense et rend compte à son ` +
          'bailleur.',
      );
    }
    if (fonctionnelle === monnaieTenue) {
      throw new BadRequestException(
        `La monnaie fonctionnelle de ce dossier est déjà sa monnaie de tenue (${monnaieTenue}) · le second jeu ` +
          "n'aurait rien à convertir, et la balance légale suffit.",
      );
    }

    const exercice = await this.prisma.exercice.findFirst({
      where: { id: exerciceId, tenantId },
      select: { id: true, dateDebut: true, dateFin: true },
    });
    if (!exercice) throw new NotFoundException('Exercice introuvable pour ce dossier.');

    const devise = await this.prisma.devise.findFirst({
      where: { tenantId, code: fonctionnelle },
      include: { cours: { select: { date: true, cours: true }, orderBy: { date: 'asc' } } },
    });
    if (!devise) {
      throw new BadRequestException(
        `La devise ${fonctionnelle} n'existe pas au plan des devises de ce dossier · créez-la et alimentez ses ` +
          'cours avant de produire le second jeu.',
      );
    }
    const cours = devise.cours.map((c) => ({ date: c.date, cours: Number(c.cours) }));

    const jeu = await this.jeuFonctionnel(tenantId, exercice, fonctionnelle, cours, 0);
    let debitTotal = 0;
    let creditTotal = 0;
    let ouvertureDebitTotal = 0;
    let ouvertureCreditTotal = 0;
    for (const v of jeu.parCompte.values()) {
      debitTotal += v.ouvertureDebit + v.debit;
      creditTotal += v.ouvertureCredit + v.credit;
      ouvertureDebitTotal += v.ouvertureDebit;
      ouvertureCreditTotal += v.ouvertureCredit;
    }

    const arrondir = (v: number) => Math.round(v * 100) / 100;
    return {
      monnaie: fonctionnelle,
      monnaieTenue,
      exercice: {
        dateDebut: exercice.dateDebut.toISOString().slice(0, 10),
        dateFin: exercice.dateFin.toISOString().slice(0, 10),
      },
      mention: BalanceFonctionnelleService.MENTION_SANS_VALEUR_LEGALE,
      lignes: [...jeu.parCompte.entries()]
        .map(([compteId, v]) => ({
          compteId,
          numero: v.numero,
          intitule: v.intitule,
          ouvertureDebit: arrondir(v.ouvertureDebit),
          ouvertureCredit: arrondir(v.ouvertureCredit),
          debit: arrondir(v.ouvertureDebit + v.debit),
          credit: arrondir(v.ouvertureCredit + v.credit),
          solde: arrondir(v.ouvertureDebit + v.debit - v.ouvertureCredit - v.credit),
        }))
        .sort((a, b) => a.numero.localeCompare(b.numero)),
      totaux: {
        debit: arrondir(debitTotal),
        credit: arrondir(creditTotal),
        /**
         * L'ÉCART DE CONVERSION · montré, jamais absorbé.
         *
         * Il naît des lignes prises à leur montant d'origine face à des lignes
         * converties : les deux côtés d'une même opération n'ont alors pas la
         * même origine. Le loger dans un compte de bouclage ferait équilibrer
         * l'état et disparaître l'information.
         */
        ecartDeConversion: arrondir(debitTotal - creditTotal),
        /** La part de l'écart reprise à l'ouverture, née des exercices précédents. */
        dontOuverture: arrondir(ouvertureDebitTotal - ouvertureCreditTotal),
      },
      origine: {
        lignes: jeu.lignes,
        /** Prises à leur montant d'origine, sans division par un cours. */
        lignesExactes: jeu.lignesExactes,
        lignesConverties: jeu.lignes - jeu.lignesExactes,
        ecritures: jeu.ecritures,
        ouverture: jeu.ouverture,
      },
    };
  }

  /**
   * LE JEU FONCTIONNEL D'UN EXERCICE · ses MOUVEMENTS convertis, plus son
   * ouverture (audit final F42).
   *
   * LES ÉCRITURES DE CLÔTURE NE SE CONVERTISSENT PAS. L'à-nouveau converti au
   * cours du premier jour de l'exercice faisait mentir l'en-tête (« chaque
   * écriture au cours de SA date ») · un bâtiment acquis il y a six ans entrait
   * au cours du 1er janvier. Et l'écriture qui solde les comptes de gestion,
   * convertie au cours du 31 décembre, laissait un reliquat sur des comptes
   * dont chaque charge avait pris le cours de sa propre date. L'ouverture est
   * donc la clôture du MÊME jeu pour l'exercice précédent, et la clôture de
   * l'exercice n'est pas rejouée · le jeu s'arrête avant elle.
   *
   * L'EXERCICE SE LIT PAR TRANCHES, ET SE CONVERTIT AU FIL DE L'EAU (audit
   * final F189). Le jeu chargeait d'un coup toutes les lignes de l'exercice,
   * puis toutes celles de chaque exercice précédent en remontant, alors qu'il
   * ne rend qu'un cumul par compte · le motif même qui a fait tomber le banc
   * d'un million de lignes. Les écritures arrivent désormais par tranches de
   * LOT_ECRITURES, chacune avec toutes ses lignes, et seuls restent en mémoire
   * les cumuls par compte, le cours de chaque date déjà vue et les dates sans
   * cours. Rien du calcul ne change : tous les cours de la devise sont connus
   * avant la première tranche, si bien que chaque ligne se convertit au cours
   * de SON écriture dès qu'elle est lue, exactement comme avant, et qu'aucune
   * ligne n'a besoin d'être gardée pour attendre son cours.
   *
   * LE REFUS NE TOMBE QU'APRÈS LA DERNIÈRE TRANCHE · il rend la liste de
   * TOUTES les dates sans cours, et s'arrêter à la première n'en montrerait
   * qu'une, le cabinet découvrant les autres une par une.
   */
  private async jeuFonctionnel(
    tenantId: string,
    exercice: { id: string; dateDebut: Date; dateFin: Date },
    fonctionnelle: string,
    cours: { date: Date; cours: number }[],
    profondeur: number,
  ): Promise<JeuFonctionnel> {
    const bornes = { tenantId, exerciceId: exercice.id };
    // UNE LIGNE SUFFIT À DIRE QU'IL Y A UN À-NOUVEAU (audit final F189) · il
    // était lu en entier pour être compté, et il ne se relit plus que s'il
    // faut le convertir. Une écriture d'à-nouveau sans ligne ne comptait pas
    // plus hier qu'aujourd'hui.
    const aUnANouveau =
      (await this.prisma.ligneEcriture.findFirst({
        where: { ecriture: { ...bornes, ...A_NOUVEAU } },
        select: { id: true },
      })) !== null;

    const parCompte = new Map<string, CompteFonctionnel>();
    const compte = (id: string, numero: string, intitule: string) => {
      const c = parCompte.get(id) ?? { numero, intitule, ouvertureDebit: 0, ouvertureCredit: 0, debit: 0, credit: 0 };
      parCompte.set(id, c);
      return c;
    };

    const precedent =
      aUnANouveau && profondeur < PROFONDEUR_MAX
        ? await this.prisma.exercice.findFirst({
            where: { tenantId, dateFin: { lt: exercice.dateDebut } },
            orderBy: { dateFin: 'desc' },
            select: { id: true, dateDebut: true, dateFin: true },
          })
        : null;

    // LE COURS SE CHERCHE UNE FOIS PAR DATE, PAS UNE FOIS PAR ÉCRITURE (audit
    // final F189) · `coursApplicable` parcourt tous les cours de la devise, et
    // cent mille écritures tombées sur trois cents dates le rejouaient cent
    // mille fois. La clé est l'instant exact, celui que `coursApplicable`
    // compare.
    const coursParDate = new Map<number, number | null>();
    const sansCours = new Set<string>();
    let lignes = 0;
    let lignesExactes = 0;
    let ecritures = 0;
    const convertir = (ouverture: boolean) => (e: EcritureLue) => {
      // Une écriture sans ligne n'a rien à convertir · la lecture partait des
      // lignes, et ne la voyait ni pour la compter ni pour dater son cours.
      if (e.lignes.length === 0) return;
      ecritures += 1;
      lignes += e.lignes.length;
      const instant = e.date.getTime();
      if (!coursParDate.has(instant)) {
        coursParDate.set(instant, BalanceFonctionnelleService.coursApplicable(cours, e.date));
      }
      const coursDeLEcriture = coursParDate.get(instant) ?? null;
      if (coursDeLEcriture === null || coursDeLEcriture <= 0) {
        // Rien n'est converti pour cette écriture · l'état s'arrêtera après la
        // dernière tranche, avec toutes les dates sans cours.
        sansCours.add(e.date.toISOString().slice(0, 10));
        return;
      }
      // Toutes les lignes de l'écriture prennent le même cours, celui de sa
      // date · c'est ce qui la garde équilibrée après conversion.
      for (const l of e.lignes) {
        const converti = BalanceFonctionnelleService.convertirLigne(
          {
            debit: Number(l.debit),
            credit: Number(l.credit),
            deviseCode: l.devise?.code ?? null,
            montantDevise: l.montantDevise === null ? null : Number(l.montantDevise),
          },
          fonctionnelle,
          coursDeLEcriture,
        );
        if (converti.exacte) lignesExactes += 1;
        const c = compte(l.compte.id, l.compte.numero, l.compte.intitule);
        if (ouverture) {
          c.ouvertureDebit += converti.debit;
          c.ouvertureCredit += converti.credit;
        } else {
          c.debit += converti.debit;
          c.credit += converti.credit;
        }
      }
    };

    // Ce qui se convertit au cours de sa date · les mouvements, et l'à-nouveau
    // d'une reprise qui n'a aucun exercice précédent dans le dossier.
    await this.lireEcritures({ ...bornes, ...MOUVEMENTS }, convertir(false));
    if (aUnANouveau && !precedent) await this.lireEcritures({ ...bornes, ...A_NOUVEAU }, convertir(true));

    if (sansCours.size > 0) {
      const distinctes = [...sansCours].sort();
      throw new BadRequestException(
        `Aucun cours ${fonctionnelle} connu à ${distinctes.length} date(s) d'écriture ` +
          `(${distinctes.slice(0, 10).join(', ')}${distinctes.length > 10 ? '…' : ''}) ` +
          // L'EXERCICE EST NOMMÉ · l'ouverture reprend la clôture du même jeu
          // pour l'exercice précédent, qui exige aussi ses cours. Sans le dire,
          // le cabinet lisait des dates de l'an passé sous la balance de cette
          // année et croyait l'état en panne.
          `dans l'exercice du ${exercice.dateDebut.toISOString().slice(0, 10)} au ${exercice.dateFin.toISOString().slice(0, 10)}` +
          (profondeur > 0 ? ", exercice antérieur dont la clôture sert d'ouverture au second jeu" : '') +
          '. ' +
          "Le cours retenu est le dernier saisi à la date de l'écriture ou avant · l'état s'arrête ici plutôt que de prendre un cours postérieur ou celui de la clôture · une " +
          'balance convertie avec un cours inventé est plausible et fausse, et personne ne la vérifie.',
      );
    }

    let ouverture: OuvertureFonctionnelle = aUnANouveau ? 'CONVERTIE_A_SA_DATE' : 'AUCUNE';
    if (precedent) {
      ouverture = 'EXERCICE_PRECEDENT';
      const jeuPrecedent = await this.jeuFonctionnel(tenantId, precedent, fonctionnelle, cours, profondeur + 1);
      // Les comptes de bilan (classes 1 à 5) reportent leur solde ; ceux de
      // gestion (6 à 8) font le résultat, porté au compte 13 que la clôture en
      // francs a mouvementé, comme l'à-nouveau en francs le porte.
      let resultat = 0;
      const reporter = (id: string, numero: string, intitule: string, solde: number) => {
        const c = compte(id, numero, intitule);
        if (solde >= 0) c.ouvertureDebit += solde;
        else c.ouvertureCredit += -solde;
      };
      for (const [id, v] of jeuPrecedent.parCompte) {
        const solde = v.ouvertureDebit + v.debit - v.ouvertureCredit - v.credit;
        if (['1', '2', '3', '4', '5'].includes(v.numero[0])) {
          if (Math.abs(solde) > 0.000001) reporter(id, v.numero, v.intitule, solde);
        } else resultat += solde;
      }
      if (Math.abs(resultat) > 0.000001) {
        const ligneResultat = await this.prisma.ligneEcriture.findFirst({
          where: {
            ecriture: { tenantId, exerciceId: precedent.id, estSoldeDesComptesDeGestion: true },
            compte: { numero: { startsWith: '13' } },
          },
          select: { compte: { select: { id: true, numero: true, intitule: true } } },
        });
        // Sans clôture en francs (à-nouveau provisoire), aucun compte 13 n'a
        // encore été choisi · le résultat reste sur sa propre ligne, nommée,
        // plutôt que sur un compte que la clôture n'a pas désigné.
        if (ligneResultat) {
          reporter(ligneResultat.compte.id, ligneResultat.compte.numero, ligneResultat.compte.intitule, resultat);
        } else {
          reporter(
            `resultat-${precedent.id}`,
            '13',
            "Résultat de l'exercice précédent, converti (exercice non clôturé)",
            resultat,
          );
        }
      }
    }

    return { parCompte, lignes, lignesExactes, ecritures, ouverture };
  }

  /**
   * Toutes les écritures d'un filtre, une tranche de LOT_ECRITURES à la fois
   * (audit final F189). Le filtre porte toujours le dossier par sa valeur · la
   * garde de cloisonnement refuse une collection d'écritures qui ne l'a pas,
   * et le balayage du code (`cloisonnement.spec.ts`) exige de la LIRE dans
   * l'appel même.
   */
  private lireEcritures(
    { tenantId, ...filtre }: { tenantId: string; exerciceId: string; estGenereeParCloture: boolean; estSoldeDesComptesDeGestion?: boolean },
    traiter: (e: EcritureLue) => void,
  ): Promise<void> {
    return lireParLots(
      (curseur) =>
        this.prisma.ecriture.findMany({ where: { tenantId, ...filtre }, select: SELECT_ECRITURE, ...pageApres(curseur, LOT_ECRITURES) }),
      traiter,
      LOT_ECRITURES,
    );
  }
}
