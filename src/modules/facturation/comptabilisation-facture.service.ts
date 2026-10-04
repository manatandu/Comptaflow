import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SensFacture, TypeJournal } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ecritureDeFacture } from './ecriture-facture';
import { avertissementExerciceDeLaFacture, dateDeValeurComptable, motifRefusDateReception } from './date-reception';
import { jourDeKinshasa } from '../../common/echeance';
import { compteTvaCollectee, compteTvaPourContrepartie, compteTvaRecuperable, estTauxZero } from '../tva/routage-tva';

export interface DemandeComptabilisation {
  journalId: string;
  compteGestionId: string | null;
  /** Compte de gestion par ligne de la facture (identifiant de ligne → compte), s'il diffère. */
  comptesParLigne?: Record<string, string>;
  /**
   * Date de réception d'une facture d'achat enregistrée SANS elle (pièce
   * antérieure à la ligne A21) · déclarée ici, une fois, et gardée sur la
   * facture avec le lien de l'écriture. Jamais déduite (AUDCIF art. 16, al. 2).
   */
  dateReception?: string | null;
}

/**
 * PASSER L'ÉCRITURE D'UNE FACTURE · au brouillard, par le chemin de saisie
 * ordinaire (`EcritureService.creer`), si bien que la numérotation du
 * journal, la date dans l'exercice, les clôtures et le double regard
 * s'appliquent comme à toute écriture. La facture est ensuite LIÉE à
 * l'écriture, un pour un · une facture déjà liée ne se passe pas deux fois.
 */
@Injectable()
export class ComptabilisationFactureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritures: EcritureService,
  ) {}

  async comptabiliser(tenantId: string, userId: string, factureId: string, d: DemandeComptabilisation) {
    const f = await this.prisma.facture.findFirst({
      where: { id: factureId, tenantId },
      include: {
        lignes: { orderBy: { ordre: 'asc' }, include: { tauxTva: { select: { tenantId: true, taux: true, compteCollecteId: true, compteDeductibleId: true } } } },
        tiers: { select: { comptesRattaches: { where: { estPrincipal: true }, select: { compteId: true }, take: 1 } } },
      },
    });
    if (!f) throw new NotFoundException('Facture introuvable dans ce dossier.');
    if (f.ecritureId) throw new BadRequestException('Cette facture est déjà liée à une écriture · elle ne se passe pas deux fois.');
    // Le taux d'une ligne se relit à son dossier (audit final F120) · une pièce
    // enregistrée avant la vérification ne passerait pas le compte d'un voisin.
    if (f.lignes.some((l) => l.tauxTva && l.tauxTva.tenantId !== tenantId)) {
      throw new NotFoundException('Taux de taxe introuvable dans ce dossier.');
    }

    const journal = await this.prisma.journal.findFirst({ where: { id: d.journalId, tenantId }, select: { type: true } });
    const typeAttendu = f.sens === SensFacture.VENTE ? TypeJournal.VENTES : TypeJournal.ACHATS;
    if (!journal) throw new NotFoundException('Journal introuvable dans ce dossier.');
    if (journal.type !== typeAttendu) {
      throw new BadRequestException(`Une facture ${f.sens === SensFacture.VENTE ? 'de vente' : 'd’achat'} se passe dans un journal ${f.sens === SensFacture.VENTE ? 'de ventes' : 'd’achats'}.`);
    }

    // Le compte de gestion doit être de la classe que le sens appelle · un
    // produit sur une vente, une charge ou une immobilisation sur un achat.
    const choisis = [d.compteGestionId, ...Object.values(d.comptesParLigne ?? {})].filter((x): x is string => !!x);
    const comptes = await this.prisma.compte.findMany({ where: { id: { in: choisis }, tenantId }, select: { id: true, numero: true } });
    for (const id of choisis) {
      const c = comptes.find((x) => x.id === id);
      if (!c) throw new NotFoundException('Compte introuvable dans ce dossier.');
      const ok = f.sens === SensFacture.VENTE ? c.numero.startsWith('7') : c.numero.startsWith('6') || c.numero.startsWith('2');
      if (!ok) {
        throw new BadRequestException(
          `Le compte ${c.numero} n’est pas ${f.sens === SensFacture.VENTE ? 'un compte de produit (classe 7)' : 'un compte de charge (classe 6) ni d’immobilisation (classe 2)'}.`,
        );
      }
    }

    // LE COMPTE DE TVA SE ROUTE COMME À LA SAISIE (audit final F116) · sur la
    // contrepartie de chaque ligne, parmi les subdivisions que le dossier a
    // ouvertes, à défaut le compte du taux. Même règle que la grille
    // (`tva/routage-tva.ts`, parité gelée).
    const { referentiel } = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { referentiel: true } });
    const sensTva = f.sens === SensFacture.VENTE ? 'recette' : 'depense';
    const numeroDe = new Map(comptes.map((c) => [c.id, c.numero]));
    const candidats = [
      ...new Set(
        f.lignes
          .map((l) => numeroDe.get(d.comptesParLigne?.[l.id] ?? d.compteGestionId ?? ''))
          .filter((n): n is string => !!n)
          .map((n) => (sensTva === 'recette' ? compteTvaCollectee(n) : compteTvaRecuperable(n)))
          .filter((n): n is string => !!n),
      ),
    ];
    const ouverts = candidats.length
      ? await this.prisma.compte.findMany({ where: { tenantId, numero: { in: candidats } }, select: { id: true, numero: true } })
      : [];
    const idDuNumero = new Map(ouverts.map((c) => [c.numero, c.id]));
    const numerosDuPlan = new Set(ouverts.map((c) => c.numero));
    const compteTvaDe = (l: (typeof f.lignes)[number]): string | null => {
      const gestion = numeroDe.get(d.comptesParLigne?.[l.id] ?? d.compteGestionId ?? '');
      const route = gestion ? compteTvaPourContrepartie(referentiel, sensTva, gestion, numerosDuPlan) : null;
      return (route ? idDuNumero.get(route) : undefined) ?? (f.sens === SensFacture.VENTE ? l.tauxTva?.compteCollecteId : l.tauxTva?.compteDeductibleId) ?? null;
    };

    const p = ecritureDeFacture(
      {
        sens: f.sens,
        nature: f.nature,
        numeroSerie: f.numeroSerie,
        dateFacture: f.dateFacture,
        // LE TIERS DE LA PIÈCE · sur un achat, c'est l'ÉMETTEUR (le
        // fournisseur) ; la contrepartie y est le dossier lui-même, et le
        // libellé nommait le dossier comme son propre fournisseur (relevé au
        // rejeu sur vraie base de la ligne A21).
        contrepartieNom: f.sens === SensFacture.ACHAT ? f.emetteurNom : f.contrepartieNom,
        compteTiersId: f.tiers?.comptesRattaches[0]?.compteId ?? null,
        autresImpotsEtTaxes: f.autresImpotsEtTaxes === null ? null : Number(f.autresImpotsEtTaxes),
        lignes: f.lignes.map((l) => ({
          designation: l.designation,
          montantHT: Number(l.montantHT),
          montantTva: Number(l.montantTva),
          tauxTvaId: l.tauxTvaId,
          compteTvaId: compteTvaDe(l),
          tauxZero: l.imposable && l.tauxTva !== null && estTauxZero(Number(l.tauxTva.taux)),
          compteGestionId: d.comptesParLigne?.[l.id] ?? null,
        })),
      },
      d.compteGestionId,
    );
    if ('refus' in p) throw new BadRequestException(p.refus);

    // LA DATE DE VALEUR COMPTABLE (AUDCIF art. 16, al. 2, ligne A21) · celle
    // de l'émission pour une vente, celle de la RÉCEPTION pour une facture
    // reçue. Une réception déjà portée par la facture ne se réécrit pas ici ·
    // la déclarer autrement à chaque passage ferait de la date de l'écriture
    // un choix du moment.
    const declaree = d.dateReception ? new Date(d.dateReception) : null;
    if (declaree && Number.isNaN(declaree.getTime())) throw new BadRequestException('Date de réception illisible.');
    if (declaree && f.dateReception && declaree.toISOString().slice(0, 10) !== f.dateReception.toISOString().slice(0, 10)) {
      throw new BadRequestException(
        `La facture porte déjà sa date de réception (${f.dateReception.toISOString().slice(0, 10)}) · elle ne se change pas au passage de l’écriture.`,
      );
    }
    const nouvelleReception = declaree && !f.dateReception ? declaree : null;
    const piece = { sens: f.sens, dateFacture: f.dateFacture, dateReception: f.dateReception ?? nouvelleReception };
    const motif = motifRefusDateReception(piece, jourDeKinshasa(new Date()));
    if (motif) throw new BadRequestException(motif);
    const valeur = dateDeValeurComptable(piece);
    if ('refus' in valeur) throw new BadRequestException(valeur.refus);

    const date = valeur.date.toISOString().slice(0, 10);
    const exercice = await this.prisma.exercice.findFirst({
      where: { tenantId, dateDebut: { lte: valeur.date }, dateFin: { gte: valeur.date } },
      select: { id: true },
    });
    if (!exercice) {
      throw new BadRequestException(
        `Aucun exercice ne couvre le ${date}, ${f.sens === SensFacture.VENTE ? 'date de la facture' : 'date de réception de la facture'}.`,
      );
    }
    // La facture d'un exercice reçue dans le suivant · dit, jamais corrigé
    // (fiche du compte 60, factures non parvenues).
    const exerciceDeLaFacture =
      valeur.date.getTime() === f.dateFacture.getTime()
        ? null
        : await this.prisma.exercice.findFirst({
            where: { tenantId, dateDebut: { lte: f.dateFacture }, dateFin: { gte: f.dateFacture } },
            select: { dateDebut: true, dateFin: true },
          });
    const avertissement = avertissementExerciceDeLaFacture(f.dateFacture, valeur.date, exerciceDeLaFacture);

    const e = (await this.ecritures.creer(tenantId, userId, {
      exerciceId: exercice.id,
      journalId: d.journalId,
      date,
      libelle: p.libelle,
      reference: f.numeroSerie,
      lignes: p.lignes,
    })) as { id: string };

    // Le lien se pose SUR une facture encore libre · un second clic entre la
    // lecture et ici retire l'écriture qu'il vient de créer.
    // La réception déclarée ici se pose avec le lien, sur une facture qui ne
    // l'a toujours pas · une déclaration concurrente ne s'écrase pas.
    const lien: Prisma.FactureUpdateManyArgs = nouvelleReception
        ? { where: { id: f.id, tenantId, ecritureId: null, dateReception: null }, data: { ecritureId: e.id, dateReception: nouvelleReception } }
        : { where: { id: f.id, tenantId, ecritureId: null }, data: { ecritureId: e.id } };
    const { count } = await this.prisma.facture.updateMany(lien);
    if (count === 0) {
      // Lignes puis tête (F1) · la tête seule levait P2003, un 500 brut, et
      // laissait l'écriture du second clic orpheline au journal.
      await this.ecritures.retirerCompensation(tenantId, e.id);
      throw new BadRequestException('Cette facture vient d’être liée à une autre écriture · rien n’a été passé.');
    }
    return { ecritureId: e.id, lignes: p.lignes.length, date, ...(avertissement ? { avertissement } : {}) };
  }
}
