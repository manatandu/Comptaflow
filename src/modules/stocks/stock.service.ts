import { BadRequestException, Injectable } from '@nestjs/common';
import { ClasseCompte, MethodeInventaireStocks, TypeCompteDetailTotal } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { EnregistrerVariationStocksDto } from './dto/stock.dto';
import {
  lignesDeLEcriture,
  proposerVariations,
  totaux,
  type CompteAVarier,
  type PropositionVariation,
} from './variation-stocks';

/**
 * LE MODULE DE STOCKS · ce qu'il sert, et ce qu'il refuse de servir.
 *
 * Il rend la proposition d'écriture de variation en INVENTAIRE INTERMITTENT,
 * que le compte de résultat attendait et que rien ne produisait. Le calcul
 * vit dans `variation-stocks.ts`, la nomenclature dans
 * `nomenclature-stocks.ts` · ce service ne fait que LIRE le dossier et poster
 * ce que le comptable a confirmé.
 *
 * IL EST COMMUN AUX DEUX RÉFÉRENTIELS, et ce n'est pas un oubli du
 * cloisonnement (CLAUDE.md § 6). Les deux textes ouvrent une classe 3, les
 * deux posent le même choix entre inventaire permanent et intermittent, et
 * les deux écrivent le même schéma de variation. Ce qui diffère est la
 * NOMENCLATURE, et elle est tranchée compte par compte dans la table.
 */
@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritureService: EcritureService,
  ) {}

  /**
   * L'état du dossier au regard des stocks, et la proposition quand elle a
   * lieu d'être.
   *
   * TROIS ÉTATS, ET DEUX D'ENTRE EUX NE SONT PAS DES ERREURS. Un dossier qui
   * n'a pas déclaré sa méthode doit la déclarer · on ne la devine pas. Un
   * dossier en inventaire PERMANENT n'a rien à passer à la clôture, ses
   * entrées et ses sorties étant déjà passées par le compte de variation :
   * lui servir la proposition compterait la variation DEUX FOIS, sur une
   * écriture parfaitement équilibrée. L'écran le DIT au lieu de rendre une
   * liste vide, qui se lirait comme « rien à faire ».
   */
  async proposer(tenantId: string, exerciceId: string) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { referentiel: true, methodeInventaireStocks: true },
    });

    if (tenant.methodeInventaireStocks === null) {
      return {
        methode: null,
        referentiel: tenant.referentiel,
        reserve:
          "Ce dossier n'a pas déclaré son mode de tenue des stocks. Les deux textes laissent le " +
          "choix à l'entité · « la comptabilisation des stocks repose sur la tenue soit d'un " +
          "inventaire permanent, soit d'un inventaire intermittent » (AUDCIF Titre VII ch. 3 " +
          'section 3 · SYCEBNL Partie 2 ch. 3 section 3). OmegaX ne le devine pas : le déclarer ' +
          'dans les paramètres du dossier ouvre cette fenêtre.',
        proposition: null,
      };
    }

    if (tenant.methodeInventaireStocks === MethodeInventaireStocks.PERMANENT) {
      return {
        methode: tenant.methodeInventaireStocks,
        referentiel: tenant.referentiel,
        reserve:
          'Ce dossier tient un inventaire PERMANENT : chaque entrée et chaque sortie de stock ' +
          'passent déjà par le compte de variation, en continu. Il n’y a donc AUCUNE écriture ' +
          "de variation à passer à la clôture · en passer une compterait la variation deux fois, " +
          "et l'écriture s'équilibrerait. Ce qui reste dû à la clôture est le rapprochement de " +
          "l'inventaire physique avec l'inventaire comptable, et la régularisation des différences " +
          "constatées en plus ou en moins · le module d'inventaire physique le porte.",
        proposition: null,
      };
    }

    const [comptes, balance, fiches] = await Promise.all([
      // LES COMPTES VIENNENT DU PLAN, PAS DE LA BALANCE. Un stock ouvert cette
      // année n'a aucun mouvement avant l'écriture de variation : la balance
      // l'écarte (elle ne rend que les comptes mouvementés), et il faut
      // pourtant pouvoir constater son stock final.
      this.prisma.compte.findMany({
        where: { tenantId, classe: ClasseCompte.CLASSE_3, typeCompte: TypeCompteDetailTotal.DETAIL },
        select: { id: true, numero: true, intitule: true },
        orderBy: { numero: 'asc' },
      }),
      this.ecritureService.balance(tenantId, exerciceId),
      this.stockFinalParCompte(tenantId, exerciceId),
    ]);

    const soldes = new Map(balance.lignes.map((l) => [l.compteId, l.solde]));

    const aVarier: CompteAVarier[] = comptes.map((c) => {
      const compte = fiches.get(c.id);
      return {
        numero: c.numero,
        intitule: c.intitule,
        soldeInitial: soldes.get(c.id) ?? 0,
        stockFinal: compte?.valeur ?? null,
        source: compte?.source ?? '',
      };
    });

    const proposition = proposerVariations(aVarier, tenant.referentiel);
    const lignes = lignesDeLEcriture(proposition);

    return {
      methode: tenant.methodeInventaireStocks,
      referentiel: tenant.referentiel,
      reserve: null,
      proposition: {
        ...proposition,
        lignes,
        totaux: totaux(lignes),
        // LE COMPTE EST RENDU AVEC SON IDENTIFIANT, pour que l'écran n'ait pas
        // à retrouver un compte par son numéro · deux dossiers peuvent porter
        // le même numéro, et c'est l'identifiant qui borne au dossier.
        comptes: comptes.map((c) => ({ id: c.id, numero: c.numero, intitule: c.intitule })),
      },
    };
  }

  /**
   * Le stock final constaté par la campagne d'inventaire de l'exercice.
   *
   * LA SOURCE EST RENDUE AVEC LE MONTANT, et elle nomme la campagne. Un
   * montant d'inventaire extra-comptable ne se vérifie que par le document
   * qui le porte · c'est lui que le réviseur demandera, pas le chiffre. Même
   * parti que la source d'un relevé d'unités d'œuvre.
   *
   * UNE FICHE NON VALORISÉE NE COMPTE PAS POUR ZÉRO · elle rend le compte
   * entier « pas encore compté ». Lue comme zéro, elle minorerait le stock
   * final du montant qu'on n'a pas encore su chiffrer, et la différence
   * partirait en charge.
   */
  private async stockFinalParCompte(tenantId: string, exerciceId: string) {
    const campagne = await this.prisma.campagneInventaire.findFirst({
      where: { tenantId, exerciceId },
      orderBy: { dateInventaire: 'desc' },
      select: { id: true, libelle: true, dateInventaire: true },
    });
    const parCompte = new Map<string, { valeur: number; source: string }>();
    if (!campagne) return parCompte;

    const fiches = await this.prisma.ficheInventaire.findMany({
      where: { tenantId, campagneId: campagne.id },
      select: { compteId: true, valeurInventaire: true },
    });

    const incomplets = new Set<string>();
    for (const f of fiches) {
      if (f.valeurInventaire === null) {
        incomplets.add(f.compteId);
        continue;
      }
      const actuel = parCompte.get(f.compteId);
      const valeur = Number(f.valeurInventaire) + (actuel?.valeur ?? 0);
      parCompte.set(f.compteId, {
        valeur,
        source: `${campagne.libelle} du ${campagne.dateInventaire.toISOString().slice(0, 10)}`,
      });
    }
    for (const compteId of incomplets) parCompte.delete(compteId);
    return parCompte;
  }

  /**
   * Passe l'écriture de variation que le comptable a confirmée.
   *
   * LE SERVEUR NE FAIT PAS CONFIANCE À CE QUE LE CLIENT RENVOIE · il REJOUE le
   * calcul à partir du dossier, et ne poste que ce que sa propre proposition
   * contient. Même discipline que la confirmation d'un pré-lettrage, et pour
   * la même raison : un client qui renverrait des montants retouchés ferait
   * passer, sous une écriture d'apparence automatique, des chiffres que
   * personne n'a constatés.
   */
  async enregistrer(tenantId: string, userId: string, dto: EnregistrerVariationStocksDto) {
    const etat = await this.proposer(tenantId, dto.exerciceId);
    if (!etat.proposition) {
      throw new BadRequestException(etat.reserve ?? 'Aucune variation de stocks à enregistrer.');
    }
    const lignes = etat.proposition.lignes;
    if (lignes.length === 0) {
      throw new BadRequestException(
        "Aucune variation à passer : aucun compte de stock de ce dossier n'a de stock final " +
          "constaté, ou tous sont restés sans mouvement. L'écriture serait vide.",
      );
    }

    const journal = await this.prisma.journal.findFirst({
      where: { id: dto.journalId, tenantId },
      select: { id: true },
    });
    if (!journal) throw new BadRequestException('Journal introuvable dans ce dossier');

    const comptes = await this.prisma.compte.findMany({
      where: { tenantId, numero: { in: [...new Set(lignes.map((l) => l.compte))] } },
      select: { id: true, numero: true, typeCompte: true },
    });
    const parNumero = new Map(comptes.map((c) => [c.numero, c]));

    // LE COMPTE DE VARIATION DOIT EXISTER ET ÊTRE IMPUTABLE DANS CE DOSSIER.
    // La table dit ce que le PLAN OFFICIEL ouvre ; un cabinet peut n'avoir pas
    // semé ce compte, ou l'avoir laissé en tête de division. Le refus nomme le
    // compte manquant plutôt que de faire échouer l'écriture sans motif.
    const manquants = lignes
      .map((l) => l.compte)
      .filter((numero) => !parNumero.has(numero) && !parNumero.has(numero.padEnd(8, '0')));
    if (manquants.length) {
      throw new BadRequestException(
        `Ces comptes ne sont pas ouverts en imputation dans ce dossier : ${[
          ...new Set(manquants),
        ].join(', ')}. Ouvrez-les au plan comptable avant de passer la variation.`,
      );
    }

    return this.ecritureService.creer(tenantId, userId, {
      exerciceId: dto.exerciceId,
      journalId: dto.journalId,
      date: dto.date,
      libelle: dto.libelle?.trim() || 'Variation des stocks · inventaire intermittent',
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

export type EtatStocks = Awaited<ReturnType<StockService['proposer']>>;
export type { PropositionVariation };
