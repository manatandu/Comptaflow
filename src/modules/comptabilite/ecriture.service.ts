import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Prisma, StatutExercice, TypeCompteDetailTotal } from '@prisma/client';
import { CreerEcritureDto } from './dto/creer-ecriture.dto';
import { JournalService } from '../journaux/journal.service';
import { ExerciceService } from '../exercice/exercice.service';
import { avecRetrySerialisable } from '../../common/prisma-retry.util';

/**
 * Règle non négociable du moteur comptable : une écriture n'existe que si
 * total(débit) === total(crédit), et un exercice clôturé n'accepte plus
 * aucune écriture (piste d'audit + intégrité légale). Ces deux contrôles
 * vivent ici, pas côté client, pour rester valables quel que soit le canal
 * d'entrée (UI web, import CSV, API partenaire...).
 */
@Injectable()
export class EcritureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journalService: JournalService,
    private readonly exerciceService: ExerciceService,
  ) {}

  async creer(tenantId: string, createdBy: string, dto: CreerEcritureDto) {
    const exercice = await this.prisma.exercice.findFirst({
      where: { id: dto.exerciceId, tenantId },
    });
    if (!exercice) {
      throw new BadRequestException('Exercice introuvable pour ce tenant');
    }
    if (exercice.statut === StatutExercice.CLOTURE) {
      throw new ForbiddenException("Impossible d'enregistrer une écriture sur un exercice clôturé");
    }

    const journal = await this.journalService.trouver(tenantId, dto.journalId);
    if (!journal.estActif) {
      throw new BadRequestException(`Le journal ${journal.code} est en sommeil`);
    }

    const totalDebit = dto.lignes.reduce((s, l) => s + (l.debit ?? 0), 0);
    const totalCredit = dto.lignes.reduce((s, l) => s + (l.credit ?? 0), 0);
    if (dto.lignes.length < 2 || Math.abs(totalDebit - totalCredit) > 0.005) {
      throw new BadRequestException(
        `Écriture déséquilibrée : débit=${totalDebit} crédit=${totalCredit}`,
      );
    }

    // Les tauxTvaId ne participent pas à l'équilibre (informatifs, posés sur
    // la ligne de TVA par la saisie guidée "Achat/Vente avec TVA") mais
    // doivent rester scopés au tenant — sans ce contrôle, un appel API direct
    // pourrait rattacher une ligne au taux d'un autre tenant (la FK Prisma ne
    // vérifie que l'existence de l'id, pas son tenant).
    const tauxTvaIds = [...new Set(dto.lignes.map((l) => l.tauxTvaId).filter((id): id is string => !!id))];
    if (tauxTvaIds.length > 0) {
      const tauxTrouves = await this.prisma.tauxTva.findMany({ where: { id: { in: tauxTvaIds }, tenantId } });
      if (tauxTrouves.length !== tauxTvaIds.length) {
        throw new BadRequestException('Un ou plusieurs taux de TVA sont introuvables pour ce tenant');
      }
    }

    // Comptes Total (regroupement par racine, §3.1) : jamais mouvementables
    // directement — leur solde n'est qu'une agrégation des comptes Détail de
    // même préfixe numérique (voir balance() plus bas). Un appel API direct
    // pourrait sinon y poster une écriture, brisant l'invariant du moteur de
    // mapping futur (§3.5) qui suppose que seuls les comptes Détail portent
    // des mouvements réels.
    const compteIds = [...new Set(dto.lignes.map((l) => l.compteId))];
    const comptes = await this.prisma.compte.findMany({ where: { id: { in: compteIds }, tenantId } });
    if (comptes.length !== compteIds.length) {
      throw new BadRequestException('Un ou plusieurs comptes sont introuvables pour ce tenant');
    }
    const comptesTotal = comptes.filter((c) => c.typeCompte === TypeCompteDetailTotal.TOTAL);
    if (comptesTotal.length > 0) {
      throw new BadRequestException(
        `Impossible de saisir sur un compte Total (${comptesTotal.map((c) => c.numero).join(', ')}) — ` +
          'ce sont des comptes de regroupement, saisissez sur le compte Détail concerné',
      );
    }

    const date = new Date(dto.date);

    // Clôtures Partielle/Totale (par journal) et Période (tous journaux) :
    // verrouillage de saisie indépendant du statut CLOTURE de l'exercice —
    // voir ExerciceService.verifierEcritureAutorisee.
    await this.exerciceService.verifierEcritureAutorisee(tenantId, dto.journalId, date);

    // Le calcul du numéro de pièce (lire le max actuel, l'incrémenter) et la
    // création de l'écriture doivent former une seule opération atomique :
    // sans ça, deux écritures créées au même instant sur le même journal
    // pourraient lire le même max et recevoir le même numeroPiece. Voir
    // avecRetrySerialisable pour le détail (transaction Serializable +
    // reprise automatique). Testé jusqu'à 12 écritures envoyées en parfaite
    // simultanéité sur le même journal/mois : aucun doublon de numeroPiece.
    return avecRetrySerialisable(
      this.prisma,
      async (tx) => {
        const numeroPiece = await this.journalService.prochainNumeroPiece(tenantId, journal, dto.exerciceId, date, tx);
        return tx.ecriture.create({
          data: {
            tenantId,
            exerciceId: dto.exerciceId,
            journalId: dto.journalId,
            numeroPiece,
            date,
            libelle: dto.libelle,
            reference: dto.reference,
            createdBy,
            lignes: {
              create: dto.lignes.map((l) => ({
                compteId: l.compteId,
                libelle: l.libelle,
                debit: l.debit ?? 0,
                credit: l.credit ?? 0,
                tauxTvaId: l.tauxTvaId,
              })),
            },
          },
          include: { lignes: true, journal: true },
        });
      },
      `Trop d'écritures enregistrées au même instant sur le journal ${journal.code} — veuillez réessayer.`,
    );
  }

  /** Journal : liste chronologique des écritures, filtrable par exercice/journal/période/recherche. */
  async lister(
    tenantId: string,
    filtres: { exerciceId?: string; journalId?: string; dateDebut?: string; dateFin?: string; recherche?: string },
  ) {
    const ecritures = await this.prisma.ecriture.findMany({
      where: {
        tenantId,
        ...(filtres.exerciceId ? { exerciceId: filtres.exerciceId } : {}),
        ...(filtres.journalId ? { journalId: filtres.journalId } : {}),
        ...(filtres.dateDebut || filtres.dateFin
          ? {
              date: {
                ...(filtres.dateDebut ? { gte: new Date(filtres.dateDebut) } : {}),
                ...(filtres.dateFin ? { lte: new Date(filtres.dateFin) } : {}),
              },
            }
          : {}),
        ...(filtres.recherche ? { libelle: { contains: filtres.recherche, mode: 'insensitive' as const } } : {}),
      },
      include: { lignes: { include: { compte: true } }, journal: true },
      orderBy: { date: 'asc' },
    });

    const totalDebit = ecritures.reduce((s, e) => s + e.lignes.reduce((s2, l) => s2 + Number(l.debit), 0), 0);
    const totalCredit = ecritures.reduce((s, e) => s + e.lignes.reduce((s2, l) => s2 + Number(l.credit), 0), 0);
    return { ecritures, totaux: { debit: totalDebit, credit: totalCredit } };
  }

  /**
   * Compte(s) contrepartie d'une ligne — voir docs/plan-de-construction.md
   * (« Export Excel — compte contrepartie ») : comptes DISTINCTS de sens
   * opposé dans la même écriture. Exact et non ambigu dans les cas usuels
   * (2 lignes, N débits/1 crédit, 1 débit/M crédits) ; dans le cas rare
   * d'une écriture à débits ET crédits multiples simultanés (N×M), la liste
   * porte plusieurs comptes candidats plutôt qu'un choix arbitraire
   * faussement précis.
   *
   * Filtrer par sens opposé écarte aussi, par construction, la ligne
   * elle-même et toute autre ligne portant le même compte du même côté —
   * inutile d'y ajouter un « sauf soi-même » ad hoc.
   *
   * Factorisé ici pour rester unique entre `grandLivre()` (un compte),
   * `grandLivreComplet()` (tous) et l'export Excel qui les consomme.
   */
  private static contrepartieDe(
    ligne: { id: string; debit: Prisma.Decimal | number },
    lignesDeLEcriture: Array<{ id: string; debit: Prisma.Decimal | number; compte: { numero: string } }>,
  ): string[] {
    const sensDeLaLigne = Number(ligne.debit) > 0 ? 'DEBIT' : 'CREDIT';
    return [
      ...new Set(
        lignesDeLEcriture
          .filter((autre) => autre.id !== ligne.id)
          .filter((autre) => (Number(autre.debit) > 0 ? 'DEBIT' : 'CREDIT') !== sensDeLaLigne)
          .map((autre) => autre.compte.numero),
      ),
    ];
  }

  /** Mise en forme d'une ligne de grand livre, solde progressif fourni par l'appelant. */
  private static versLigneGrandLivre(
    l: {
      id: string;
      libelle: string | null;
      debit: Prisma.Decimal;
      credit: Prisma.Decimal;
      lettre: string | null;
      ecriture: {
        date: Date;
        libelle: string;
        reference: string | null;
        numeroPiece: number | null;
        journal: { code: string };
        lignes: Array<{ id: string; debit: Prisma.Decimal; compte: { numero: string } }>;
      };
    },
    soldeProgressif: number,
  ) {
    return {
      id: l.id,
      date: l.ecriture.date,
      journalCode: l.ecriture.journal.code,
      numeroPiece: l.ecriture.numeroPiece,
      libelle: l.libelle ?? l.ecriture.libelle,
      reference: l.ecriture.reference,
      debit: Number(l.debit),
      credit: Number(l.credit),
      lettre: l.lettre,
      soldeProgressif,
      contrepartie: EcritureService.contrepartieDe(l, l.ecriture.lignes),
    };
  }

  /** Grand livre d'un compte : ses lignes avec solde progressif. */
  async grandLivre(tenantId: string, compteId: string, exerciceId?: string) {
    const compte = await this.prisma.compte.findFirst({ where: { id: compteId, tenantId } });
    if (!compte) {
      throw new BadRequestException('Compte introuvable pour ce tenant');
    }

    const lignes = await this.prisma.ligneEcriture.findMany({
      where: {
        compteId,
        ecriture: { tenantId, ...(exerciceId ? { exerciceId } : {}) },
      },
      include: {
        ecriture: {
          include: { journal: true, lignes: { include: { compte: true } } },
        },
      },
      orderBy: { ecriture: { date: 'asc' } },
    });

    let solde = 0;
    const lignesAvecSolde = lignes.map((l) => {
      solde += Number(l.debit) - Number(l.credit);
      return EcritureService.versLigneGrandLivre(l, solde);
    });

    return { compte, lignes: lignesAvecSolde, soldeFinal: solde };
  }

  /**
   * Grand livre COMPLET : tous les comptes mouvementés de l'exercice, chacun
   * avec ses lignes et son solde progressif propre. C'est la forme
   * réellement exploitable pour un audit — un auditeur veut le grand livre
   * entier d'un coup, pas compte par compte.
   *
   * Une seule requête, puis regroupement en mémoire : appeler `grandLivre()`
   * en boucle sur chaque compte aurait produit autant de requêtes que de
   * comptes mouvementés (N+1).
   *
   * Les comptes Total (§3.1) n'apparaissent jamais : ils ne portent aucun
   * mouvement propre par construction (imposé par `creer()`), donc aucune
   * ligne ne les référence.
   */
  async grandLivreComplet(tenantId: string, exerciceId?: string) {
    const lignes = await this.prisma.ligneEcriture.findMany({
      where: { ecriture: { tenantId, ...(exerciceId ? { exerciceId } : {}) } },
      include: {
        compte: true,
        ecriture: {
          include: { journal: true, lignes: { include: { compte: true } } },
        },
      },
      // Tri par compte puis par date : le regroupement ci-dessous s'appuie
      // dessus pour que chaque compte reçoive ses lignes déjà chronologiques
      // (le solde progressif n'aurait aucun sens sinon).
      orderBy: [{ compte: { numero: 'asc' } }, { ecriture: { date: 'asc' } }],
    });

    const parCompte = new Map<
      string,
      { compte: { id: string; numero: string; intitule: string }; lignes: ReturnType<typeof EcritureService.versLigneGrandLivre>[]; solde: number }
    >();

    for (const l of lignes) {
      let entree = parCompte.get(l.compteId);
      if (!entree) {
        entree = {
          compte: { id: l.compte.id, numero: l.compte.numero, intitule: l.compte.intitule },
          lignes: [],
          solde: 0,
        };
        parCompte.set(l.compteId, entree);
      }
      entree.solde += Number(l.debit) - Number(l.credit);
      entree.lignes.push(EcritureService.versLigneGrandLivre(l, entree.solde));
    }

    return [...parCompte.values()].map((e) => ({
      compte: e.compte,
      lignes: e.lignes,
      soldeFinal: e.solde,
      totalDebit: e.lignes.reduce((s, l) => s + l.debit, 0),
      totalCredit: e.lignes.reduce((s, l) => s + l.credit, 0),
    }));
  }

  /** Balance : solde débit/crédit cumulé par compte sur l'exercice. */
  async balance(tenantId: string, exerciceId: string) {
    const comptes = await this.prisma.compte.findMany({
      where: { tenantId },
      orderBy: { numero: 'asc' },
      include: {
        lignesEcriture: { where: { ecriture: { tenantId, exerciceId } } },
      },
    });

    const soldeDirectParCompte = new Map(
      comptes.map((c) => [
        c.id,
        {
          totalDebit: c.lignesEcriture.reduce((s, l) => s + Number(l.debit), 0),
          totalCredit: c.lignesEcriture.reduce((s, l) => s + Number(l.credit), 0),
        },
      ]),
    );

    const lignesBalance = comptes
      .map((c) => {
        let totalDebit: number;
        let totalCredit: number;
        if (c.typeCompte === TypeCompteDetailTotal.TOTAL) {
          // Comptes Total (§3.1) : jamais de mouvement propre (imposé par
          // EcritureService.creer) — leur solde agrège tous les comptes
          // DÉTAIL de même préfixe numérique (jamais les comptes Total
          // imbriqués eux-mêmes, pour ne pas compter deux fois les mêmes
          // mouvements en cas de hiérarchie à plusieurs niveaux).
          const enfantsDetail = comptes.filter(
            (autre) => autre.id !== c.id && autre.numero.startsWith(c.numero) && autre.typeCompte === TypeCompteDetailTotal.DETAIL,
          );
          totalDebit = enfantsDetail.reduce((s, e) => s + soldeDirectParCompte.get(e.id)!.totalDebit, 0);
          totalCredit = enfantsDetail.reduce((s, e) => s + soldeDirectParCompte.get(e.id)!.totalCredit, 0);
        } else {
          ({ totalDebit, totalCredit } = soldeDirectParCompte.get(c.id)!);
        }
        return {
          compteId: c.id,
          numero: c.numero,
          intitule: c.intitule,
          classe: c.classe,
          typeCompte: c.typeCompte,
          totalDebit,
          totalCredit,
          solde: totalDebit - totalCredit,
        };
      })
      .filter((l) => l.totalDebit !== 0 || l.totalCredit !== 0);

    // Les comptes Total n'entrent pas dans les totaux généraux : leur solde
    // n'est qu'un agrégat d'affichage des comptes Détail déjà comptés à côté
    // — les additionner aussi doublerait les montants.
    const lignesDetailSeules = lignesBalance.filter((l) => l.typeCompte !== TypeCompteDetailTotal.TOTAL);

    return {
      lignes: lignesBalance,
      totaux: {
        debit: lignesDetailSeules.reduce((s, l) => s + l.totalDebit, 0),
        credit: lignesDetailSeules.reduce((s, l) => s + l.totalCredit, 0),
      },
    };
  }
}
