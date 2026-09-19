import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ClasseCompte,
  MethodeInventaireStocks,
  SensMouvementStock,
  TypeCompteDetailTotal,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import {
  confronterInventaire,
  lignesDeLaRegularisation,
  type ArticleAConfronter,
} from './boni-mali-inventaire';
import {
  methodeCompatible,
  valoriser,
  type MethodeValorisation,
  type MouvementAValoriser,
} from './valorisation-stocks';
import {
  CreerArticleStockDto,
  EnregistrerMouvementStockDto,
  EnregistrerRegularisationInventaireDto,
} from './dto/magasin.dto';

/**
 * LE MAGASIN · la fiche de stock, article par article, et la confrontation au
 * comptage physique.
 *
 * CE QUE LE MAGASIN VEUT DIRE DÉPEND DU MODE DE TENUE, ET C'EST LA DÉCISION
 * CENTRALE DE CE SERVICE. En inventaire PERMANENT, la fiche est l'inventaire
 * COMPTABLE : son stock doit égaler le solde du compte, et l'écart avec le
 * comptage est un boni ou un mali. En inventaire INTERMITTENT, la fiche est
 * EXTRA-COMPTABLE : aucune écriture ne la suit, elle sert la gestion, et ce
 * qu'elle produit à la clôture est le stock final de l'écriture de variation.
 *
 * Le magasin est donc OUVERT AUX DEUX, et c'est `confronterInventaire` qui
 * refuse le boni et le mali au second, avec la phrase des textes.
 */
@Injectable()
export class MagasinService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritureService: EcritureService,
  ) {}

  private async modeDuDossier(tenantId: string) {
    return this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { referentiel: true, methodeInventaireStocks: true },
    });
  }

  async listerArticles(tenantId: string) {
    const [articles, dossier] = await Promise.all([
      this.prisma.articleStock.findMany({
        where: { tenantId },
        include: { compte: { select: { numero: true, intitule: true } }, _count: { select: { mouvements: true } } },
        orderBy: { code: 'asc' },
      }),
      this.modeDuDossier(tenantId),
    ]);
    return {
      referentiel: dossier.referentiel,
      modeInventaire: dossier.methodeInventaireStocks,
      // UNE LISTE VIDE NE SE LIT PAS SEULE. Un dossier qui n'a pas déclaré son
      // mode de tenue verra une fenêtre qui marche, et ne saura pas que la
      // confrontation lui sera refusée plus loin · on le dit ici.
      reserve:
        dossier.methodeInventaireStocks === null
          ? "Ce dossier n'a pas déclaré son mode de tenue des stocks. Le magasin fonctionne, mais " +
            "ni le boni ni le mali d'inventaire ne pourront être proposés : les deux textes les " +
            "bornent à l'inventaire PERMANENT. Le mode se déclare dans les paramètres du dossier."
          : null,
      articles: articles.map((a) => ({
        id: a.id,
        code: a.code,
        designation: a.designation,
        uniteMesure: a.uniteMesure,
        methodeValorisation: a.methodeValorisation,
        actif: a.actif,
        compte: a.compte,
        nombreMouvements: a._count.mouvements,
      })),
    };
  }

  /**
   * TROIS CONTRÔLES À LA CRÉATION, ET AUCUN N'EST DÉCORATIF.
   *
   * Le compte doit être de CLASSE 3 · une fiche de stock rattachée à un compte
   * de charge se rapprocherait d'un solde qui n'est pas un stock. Il doit être
   * IMPUTABLE · un en-tête de division ne reçoit jamais d'écriture (CLAUDE.md
   * § 7), et le boni finirait refusé à la saisie après le comptage. Et la
   * méthode doit être COMPATIBLE avec le mode de tenue du dossier · le
   * glossaire les apparie, « cette dernière méthode est compatible avec la
   * pratique de l'inventaire INTERMITTENT, alors que les deux autres reposent
   * sur celle de l'inventaire PERMANENT ».
   */
  async creerArticle(tenantId: string, userId: string, dto: CreerArticleStockDto) {
    const dossier = await this.modeDuDossier(tenantId);
    const compte = await this.prisma.compte.findFirst({
      where: { id: dto.compteId, tenantId },
      select: { id: true, numero: true, intitule: true, classe: true, typeCompte: true },
    });
    if (!compte) throw new NotFoundException('Compte introuvable dans ce dossier.');
    if (compte.classe !== ClasseCompte.CLASSE_3) {
      throw new BadRequestException(
        `Le compte ${compte.numero} n'est pas un compte de stock (classe 3). Une fiche de stock ` +
          'se rapproche du solde de son compte : rattachée ailleurs, elle se rapprocherait de ' +
          "quelque chose qui n'est pas un stock.",
      );
    }
    if (compte.typeCompte !== TypeCompteDetailTotal.DETAIL) {
      throw new BadRequestException(
        `Le compte ${compte.numero} est un en-tête de division, pas un compte d'imputation. Il ne ` +
          "reçoit jamais d'écriture : la régularisation d'inventaire serait refusée à la saisie, " +
          'après que le magasin a été compté.',
      );
    }
    if (
      dossier.methodeInventaireStocks !== null &&
      !methodeCompatible(
        dto.methodeValorisation as MethodeValorisation,
        dossier.methodeInventaireStocks,
      )
    ) {
      throw new BadRequestException(
        `La méthode ${dto.methodeValorisation} ne va pas avec un inventaire ` +
          `${dossier.methodeInventaireStocks}. Le glossaire de l'AUDCIF (Titre VI) les apparie : ` +
          'le P.E.P.S. et le C.M.P.A.C.E. valorisent CHAQUE SORTIE, ce qu\'un inventaire ' +
          'intermittent ne connaît pas ; le coût moyen de période de stockage valorise le STOCK ' +
          "FINAL, ce qui ne dit rien des sorties d'un inventaire permanent.",
      );
    }
    return this.prisma.articleStock.create({
      data: {
        tenantId,
        compteId: compte.id,
        code: dto.code.trim(),
        designation: dto.designation.trim(),
        uniteMesure: dto.uniteMesure.trim(),
        methodeValorisation: dto.methodeValorisation,
        createdBy: userId,
      },
    });
  }

  /**
   * LA FICHE DE STOCK · ce que le livre appelle une fiche, avec ses trois
   * blocs (entrées, sorties, stock) et sa vérification en deux dimensions.
   *
   * ELLE SE RECALCULE À CHAQUE APPEL, et rien n'en est stocké. Un stock
   * valorisé rangé en base périmerait au premier mouvement inséré avant lui ·
   * même parti que la proposition de pré-lettrage.
   */
  async ficheDeStock(tenantId: string, articleId: string) {
    const article = await this.prisma.articleStock.findFirst({
      where: { id: articleId, tenantId },
      include: { compte: { select: { numero: true, intitule: true } } },
    });
    if (!article) throw new NotFoundException('Article introuvable dans ce dossier.');

    const mouvements = await this.prisma.mouvementStock.findMany({
      where: { tenantId, articleId },
      orderBy: [{ date: 'asc' }, { ordre: 'asc' }],
      select: {
        id: true,
        date: true,
        ordre: true,
        sens: true,
        quantite: true,
        cout: true,
        piece: true,
        libelle: true,
        ecritureId: true,
      },
    });

    const bruts: MouvementAValoriser[] = mouvements.map((m) => ({
      ordre: m.ordre,
      date: m.date.toISOString().slice(0, 10),
      sens: m.sens === SensMouvementStock.ENTREE ? 'ENTREE' : 'SORTIE',
      quantite: Number(m.quantite),
      cout: m.cout === null ? null : Number(m.cout),
    }));
    const valorisation = valoriser(bruts, article.methodeValorisation as MethodeValorisation);
    const parOrdre = new Map(valorisation.mouvements.map((m) => [m.ordre, m]));
    const dossier = await this.modeDuDossier(tenantId);

    return {
      article: {
        id: article.id,
        code: article.code,
        designation: article.designation,
        uniteMesure: article.uniteMesure,
        methodeValorisation: article.methodeValorisation,
        compte: article.compte,
      },
      modeInventaire: dossier.methodeInventaireStocks,
      referentiel: dossier.referentiel,
      lignes: mouvements.map((m) => {
        const v = parOrdre.get(m.ordre);
        return {
          id: m.id,
          date: m.date.toISOString().slice(0, 10),
          ordre: m.ordre,
          sens: m.sens,
          piece: m.piece,
          libelle: m.libelle,
          quantite: Number(m.quantite),
          // Le coût d'une SORTIE est calculé, jamais celui qui a été saisi ·
          // il n'y en a pas.
          valeur: v?.valeur ?? null,
          coutUnitaire: v ? v.valeur / Number(m.quantite) : null,
          quantiteApres: v?.quantiteApres ?? null,
          valeurApres: v?.valeurApres ?? null,
          ecritureId: m.ecritureId,
          // EN INVENTAIRE PERMANENT, UN MOUVEMENT SANS ÉCRITURE EST UN TROU, et
          // il est DIT plutôt que tu : la fiche et le compte divergeraient, et
          // l'écart remonterait à la clôture sous la forme d'un faux mali.
          ecritureManquante:
            dossier.methodeInventaireStocks === MethodeInventaireStocks.PERMANENT &&
            m.ecritureId === null,
        };
      }),
      totaux: {
        quantiteFinale: valorisation.quantiteFinale,
        valeurFinale: valorisation.valeurFinale,
        totalEntrees: valorisation.totalEntrees,
        totalSorties: valorisation.totalSorties,
        quantiteEntree: bruts.filter((m) => m.sens === 'ENTREE').reduce((s, m) => s + m.quantite, 0),
        quantiteSortie: bruts.filter((m) => m.sens === 'SORTIE').reduce((s, m) => s + m.quantite, 0),
      },
      refus: valorisation.refus,
    };
  }

  /**
   * UNE SORTIE NE PORTE JAMAIS SON COÛT, ET LE REFUS EST ICI AUSSI.
   *
   * `valoriser()` le refuse déjà, mais un coût saisi serait alors STOCKÉ et
   * silencieusement ignoré à la lecture : la fiche afficherait un montant
   * calculé à côté d'un montant saisi, sans dire lequel fait foi. On refuse
   * donc à l'entrée, là où le comptable peut encore corriger.
   */
  async enregistrerMouvement(
    tenantId: string,
    userId: string,
    articleId: string,
    dto: EnregistrerMouvementStockDto,
  ) {
    const article = await this.prisma.articleStock.findFirst({
      where: { id: articleId, tenantId },
      select: { id: true, actif: true, code: true },
    });
    if (!article) throw new NotFoundException('Article introuvable dans ce dossier.');
    if (!article.actif) {
      throw new BadRequestException(
        `L'article ${article.code} est retiré du magasin : il ne reçoit plus de mouvement. Ses ` +
          "mouvements passés restent lisibles, ils font partie de la piste d'audit.",
      );
    }
    if (dto.sens === SensMouvementStock.SORTIE && dto.cout !== undefined && dto.cout !== null) {
      throw new BadRequestException(
        "La valeur d'une sortie se CALCULE, elle ne se saisit pas. Les trois méthodes admises " +
          'reposent sur « un correct raccordement des sorties aux entrées » (AUDCIF Titre VI) : ' +
          'un coût imposé à la main rompt ce raccordement, et le stock cesse d\'être la ' +
          "différence de ce qui est entré et de ce qui est sorti.",
      );
    }
    if (dto.sens === SensMouvementStock.ENTREE && !(Number(dto.cout) > 0)) {
      throw new BadRequestException(
        "Une entrée porte son coût d'acquisition · prix d'achat, droits de douane et taxes non " +
          'récupérables, transport et manutention, rabais et remises déduits (AUDCIF Titre VII ' +
          'ch. 3). Sans lui, aucune sortie ultérieure ne peut être valorisée.',
      );
    }

    // L'ORDRE EST POSÉ PAR LE SERVEUR, JAMAIS REÇU DU CLIENT · c'est lui qui
    // départage deux mouvements du même jour, et les deux méthodes ne les
    // valorisent pas pareil selon l'ordre.
    const dernier = await this.prisma.mouvementStock.aggregate({
      where: { tenantId, articleId },
      _max: { ordre: true },
    });
    return this.prisma.mouvementStock.create({
      data: {
        tenantId,
        articleId,
        date: new Date(dto.date),
        ordre: (dernier._max.ordre ?? 0) + 1,
        sens: dto.sens,
        quantite: dto.quantite,
        cout: dto.sens === SensMouvementStock.ENTREE ? dto.cout : null,
        piece: dto.piece.trim(),
        libelle: dto.libelle?.trim() || null,
        ecritureId: dto.ecritureId ?? null,
        createdBy: userId,
      },
    });
  }

  /**
   * LA CONFRONTATION AU COMPTAGE · le boni et le mali d'inventaire.
   *
   * Le comptage arrive du client parce qu'il vient du MAGASIN PHYSIQUE, et
   * qu'aucun livre ne le porte · même nature que le stock final d'une
   * variation ou qu'un relevé d'unités d'œuvre. Tout le reste (les
   * mouvements, la méthode, le compte, la contrepartie) est relu du dossier.
   */
  async confronter(tenantId: string, comptages: EnregistrerRegularisationInventaireDto['comptages']) {
    const dossier = await this.modeDuDossier(tenantId);
    if (dossier.methodeInventaireStocks === null) {
      return {
        modeInventaire: null,
        referentiel: dossier.referentiel,
        reserve:
          "Ce dossier n'a pas déclaré son mode de tenue des stocks. Le boni et le mali " +
          "d'inventaire n'existent qu'en inventaire PERMANENT · les deux textes les bornent dans " +
          'la phrase qui les pose. Déclarez le mode dans les paramètres du dossier.',
        confrontation: null,
      };
    }

    const parArticle = new Map(comptages.map((c) => [c.articleId, c]));
    const articles = await this.prisma.articleStock.findMany({
      where: { tenantId, actif: true, id: { in: [...parArticle.keys()] } },
      include: {
        compte: { select: { numero: true, intitule: true } },
        mouvements: { orderBy: [{ date: 'asc' }, { ordre: 'asc' }] },
      },
    });

    const aConfronter: ArticleAConfronter[] = articles.map((a) => {
      const comptage = parArticle.get(a.id);
      return {
        articleId: a.id,
        code: a.code,
        designation: a.designation,
        uniteMesure: a.uniteMesure,
        compteNumero: a.compte.numero,
        compteIntitule: a.compte.intitule,
        methode: a.methodeValorisation as MethodeValorisation,
        mouvements: a.mouvements.map((m) => ({
          ordre: m.ordre,
          date: m.date.toISOString().slice(0, 10),
          sens: m.sens === SensMouvementStock.ENTREE ? ('ENTREE' as const) : ('SORTIE' as const),
          quantite: Number(m.quantite),
          cout: m.cout === null ? null : Number(m.cout),
        })),
        quantitePhysique: comptage?.quantitePhysique ?? null,
        coutUnitaireBoni: comptage?.coutUnitaireBoni ?? null,
        sourceCoutBoni: comptage?.sourceCoutBoni ?? null,
      };
    });

    const confrontation = confronterInventaire(
      aConfronter,
      dossier.referentiel,
      dossier.methodeInventaireStocks,
    );
    return {
      modeInventaire: dossier.methodeInventaireStocks,
      referentiel: dossier.referentiel,
      reserve: null,
      confrontation: {
        ...confrontation,
        lignes: lignesDeLaRegularisation(confrontation.differences),
      },
    };
  }

  /**
   * Passe l'écriture de régularisation confirmée par le comptable.
   *
   * LE SERVEUR REJOUE LA CONFRONTATION · il ne poste que ce que son propre
   * calcul contient. Même discipline que la variation de stocks et que la
   * confirmation d'un pré-lettrage : des montants retouchés par le client
   * passeraient, sous une écriture d'apparence automatique, des chiffres que
   * personne n'a constatés.
   */
  async enregistrerRegularisation(
    tenantId: string,
    userId: string,
    dto: EnregistrerRegularisationInventaireDto,
  ) {
    const etat = await this.confronter(tenantId, dto.comptages);
    if (!etat.confrontation) {
      throw new BadRequestException(etat.reserve ?? 'Aucune régularisation à enregistrer.');
    }
    const lignes = etat.confrontation.lignes;
    if (lignes.length === 0) {
      throw new BadRequestException(
        "Aucune différence d'inventaire à régulariser : le magasin et le comptage concordent, ou " +
          "aucun article comptable n'a pu être confronté. L'écriture serait vide.",
      );
    }

    const journal = await this.prisma.journal.findFirst({
      where: { id: dto.journalId, tenantId },
      select: { id: true },
    });
    if (!journal) throw new BadRequestException('Journal introuvable dans ce dossier.');

    const numeros = [...new Set(lignes.map((l) => l.compte))];
    const comptes = await this.prisma.compte.findMany({
      where: {
        tenantId,
        numero: { in: [...numeros, ...numeros.map((n) => n.padEnd(8, '0'))] },
      },
      select: { id: true, numero: true },
    });
    const parNumero = new Map(comptes.map((c) => [c.numero, c]));
    const manquants = numeros.filter(
      (n) => !parNumero.has(n) && !parNumero.has(n.padEnd(8, '0')),
    );
    if (manquants.length) {
      throw new BadRequestException(
        `Ces comptes ne sont pas ouverts en imputation dans ce dossier : ${manquants.join(', ')}. ` +
          "Ouvrez-les au plan comptable avant de passer la régularisation d'inventaire.",
      );
    }

    return this.ecritureService.creer(tenantId, userId, {
      exerciceId: dto.exerciceId,
      journalId: dto.journalId,
      date: dto.date,
      libelle: dto.libelle?.trim() || "Régularisation des différences d'inventaire",
      reference: dto.reference,
      lignes: lignes.map((l) => {
        const compte = parNumero.get(l.compte) ?? parNumero.get(l.compte.padEnd(8, '0'));
        return {
          compteId: compte!.id,
          libelle: l.libelle,
          ...(l.sens === 'DEBIT' ? { debit: l.montant } : { credit: l.montant }),
        };
      }),
    });
  }
}
