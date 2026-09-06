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
 * ET LE MODULE REFUSE PLUTÔT QUE D'INVENTER UN COURS. Une date sans cours
 * connu arrête l'état et la liste des dates manquantes est rendue. Prendre le
 * cours le plus proche, ou celui de la clôture, produirait une balance
 * plausible et fausse · exactement le défaut que le § 10 bis interdit.
 */
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
      const montant = Math.abs(ligne.montantDevise);
      return ligne.debit > ligne.credit
        ? { debit: montant, credit: 0, exacte: true }
        : { debit: 0, credit: montant, exacte: true };
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
    `${MONNAIE_DE_TENUE} qui fait foi. Cet état convertit chaque écriture au cours de SA date pour rendre compte ` +
    "dans la monnaie où l'entité vit réellement. Aucun texte lu ne régit ce second jeu.";

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

    const lignes = await this.prisma.ligneEcriture.findMany({
      where: { ecriture: { tenantId, exerciceId } },
      select: {
        debit: true,
        credit: true,
        montantDevise: true,
        devise: { select: { code: true } },
        ecriture: { select: { id: true, date: true } },
        compte: { select: { id: true, numero: true, intitule: true } },
      },
    });

    // Un cours par ÉCRITURE, jamais par ligne · c'est ce qui garde l'écriture
    // équilibrée après conversion.
    const datesParEcriture = new Map<string, Date>();
    for (const l of lignes) datesParEcriture.set(l.ecriture.id, l.ecriture.date);

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
          "L'état s'arrête ici plutôt que de prendre le cours le plus proche ou celui de la clôture · une " +
          'balance convertie avec un cours inventé est plausible et fausse, et personne ne la vérifie.',
      );
    }

    const parCompte = new Map<string, { numero: string; intitule: string; debit: number; credit: number }>();
    let debitTotal = 0;
    let creditTotal = 0;
    let lignesExactes = 0;
    for (const l of lignes) {
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
      const acc = parCompte.get(l.compte.id) ?? {
        numero: l.compte.numero,
        intitule: l.compte.intitule,
        debit: 0,
        credit: 0,
      };
      acc.debit += converti.debit;
      acc.credit += converti.credit;
      parCompte.set(l.compte.id, acc);
      debitTotal += converti.debit;
      creditTotal += converti.credit;
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
      lignes: [...parCompte.entries()]
        .map(([compteId, v]) => ({
          compteId,
          numero: v.numero,
          intitule: v.intitule,
          debit: arrondir(v.debit),
          credit: arrondir(v.credit),
          solde: arrondir(v.debit - v.credit),
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
      },
      origine: {
        lignes: lignes.length,
        /** Prises à leur montant d'origine, sans division par un cours. */
        lignesExactes,
        lignesConverties: lignes.length - lignesExactes,
        ecritures: datesParEcriture.size,
      },
    };
  }
}
