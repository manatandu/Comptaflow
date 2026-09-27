import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { MONNAIE_DE_TENUE } from '../../common/monnaie-de-tenue';

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

const SELECT_LIGNE = {
  debit: true,
  credit: true,
  montantDevise: true,
  devise: { select: { code: true } },
  ecriture: { select: { id: true, date: true } },
  compte: { select: { id: true, numero: true, intitule: true } },
} as const;

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
   */
  private async jeuFonctionnel(
    tenantId: string,
    exercice: { id: string; dateDebut: Date; dateFin: Date },
    fonctionnelle: string,
    cours: { date: Date; cours: number }[],
    profondeur: number,
  ): Promise<JeuFonctionnel> {
    const [mouvements, aNouveau] = await Promise.all([
      this.prisma.ligneEcriture.findMany({
        where: { ecriture: { tenantId, exerciceId: exercice.id, estGenereeParCloture: false } },
        select: SELECT_LIGNE,
      }),
      this.prisma.ligneEcriture.findMany({
        where: {
          ecriture: { tenantId, exerciceId: exercice.id, estGenereeParCloture: true, estSoldeDesComptesDeGestion: false },
        },
        select: SELECT_LIGNE,
      }),
    ]);

    const parCompte = new Map<string, CompteFonctionnel>();
    const compte = (id: string, numero: string, intitule: string) => {
      const c = parCompte.get(id) ?? { numero, intitule, ouvertureDebit: 0, ouvertureCredit: 0, debit: 0, credit: 0 };
      parCompte.set(id, c);
      return c;
    };

    const precedent =
      aNouveau.length > 0 && profondeur < PROFONDEUR_MAX
        ? await this.prisma.exercice.findFirst({
            where: { tenantId, dateFin: { lt: exercice.dateDebut } },
            orderBy: { dateFin: 'desc' },
            select: { id: true, dateDebut: true, dateFin: true },
          })
        : null;

    // Ce qui se convertit au cours de sa date · les mouvements, et l'à-nouveau
    // d'une reprise qui n'a aucun exercice précédent dans le dossier.
    const aConvertir = [
      ...mouvements.map((l) => ({ l, ouverture: false })),
      ...(aNouveau.length > 0 && !precedent ? aNouveau.map((l) => ({ l, ouverture: true })) : []),
    ];
    const datesParEcriture = new Map<string, Date>();
    for (const { l } of aConvertir) datesParEcriture.set(l.ecriture.id, l.ecriture.date);
    const sansCours: string[] = [];
    const coursParEcriture = new Map<string, number>();
    for (const [id, date] of datesParEcriture) {
      const c = BalanceFonctionnelleService.coursApplicable(cours, date);
      if (c === null || c <= 0) sansCours.push(date.toISOString().slice(0, 10));
      else coursParEcriture.set(id, c);
    }
    if (sansCours.length > 0) {
      const distinctes = [...new Set(sansCours)].sort();
      throw new BadRequestException(
        `Aucun cours ${fonctionnelle} connu à ${distinctes.length} date(s) d'écriture ` +
          `(${distinctes.slice(0, 10).join(', ')}${distinctes.length > 10 ? '…' : ''}). ` +
          "Le cours retenu est le dernier saisi à la date de l'écriture ou avant · l'état s'arrête ici plutôt que de prendre un cours postérieur ou celui de la clôture · une " +
          'balance convertie avec un cours inventé est plausible et fausse, et personne ne la vérifie.',
      );
    }

    let lignesExactes = 0;
    for (const { l, ouverture } of aConvertir) {
      const converti = BalanceFonctionnelleService.convertirLigne(
        {
          debit: Number(l.debit),
          credit: Number(l.credit),
          deviseCode: l.devise?.code ?? null,
          montantDevise: l.montantDevise === null ? null : Number(l.montantDevise),
        },
        fonctionnelle,
        coursParEcriture.get(l.ecriture.id) as number,
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

    let ouverture: OuvertureFonctionnelle = aNouveau.length === 0 ? 'AUCUNE' : 'CONVERTIE_A_SA_DATE';
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

    return {
      parCompte,
      lignes: aConvertir.length,
      lignesExactes,
      ecritures: datesParEcriture.size,
      ouverture,
    };
  }
}
