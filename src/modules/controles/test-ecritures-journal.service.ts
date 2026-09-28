import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { LOT_ECRITURES, lireParLots, pageApres } from '../../common/lecture-par-lots';
import {
  CRITERES_ISA_240,
  ROLES_NON_SAISISSEURS,
  SEUILS_ISA_240,
} from './test-ecritures-journal';

type EcritureLue = Prisma.EcritureGetPayload<{
  include: { lignes: { include: { compte: { select: { numero: true; intitule: true } } } }; journal: true };
}>;

/**
 * PLAFOND DE LA SÉLECTION GARDÉE (audit final F185) · celui d'un classeur bâti
 * en mémoire. Au-delà, la sélection se DIT tronquée, et le classeur la refuse
 * plutôt que de remettre à l'auditeur une liste amputée.
 */
export const PLAFOND_SELECTION_ISA_240 = 50_000;

/**
 * LE REGARD DU RÉVISEUR · ce qu'un auditeur demande le premier jour.
 *
 * Il demande le journal, et il le demande AVEC SA PISTE : qui a saisi chaque
 * écriture, et QUAND, la date de saisie n'étant pas la date comptable. OmegaX
 * capturait les deux depuis toujours (`createdBy`, `createdAt`, `valideeBy`,
 * `valideeAt`) et n'en restituait AUCUN · ni à l'écran, ni dans le classeur
 * remis. C'est un manque de restitution, pas de collecte, et il se lit dans
 * l'AUDCIF art. 22, 1° : les données « comprennent, LORS DE LEUR ENTRÉE,
 * l'indication de l'ORIGINE, du contenu et de l'imputation, et puissent être
 * RESTITUÉES sur papier ou sous une forme directement intelligible ». La
 * seconde moitié de la phrase est aussi normative que la première. L'article
 * 22 n'est pas dans la liste d'exclusion de l'art. 3 du SYCEBNL, donc il vaut
 * des deux côtés.
 *
 * Ce service rend la sélection de l'ISA 240 § 33 a). Il SÉLECTIONNE, il ne
 * conclut pas · voir le commentaire de `test-ecritures-journal.ts`.
 */
@Injectable()
export class TestEcrituresJournalService {
  constructor(private readonly prisma: PrismaService) {}

  async selection(tenantId: string, exerciceId: string, plafond = PLAFOND_SELECTION_ISA_240) {
    const exercice = await this.prisma.exercice.findFirst({ where: { id: exerciceId, tenantId } });
    if (!exercice) throw new NotFoundException('Exercice introuvable pour ce dossier.');

    // L'auteur est un identifiant en base · un auditeur ne lit pas un uuid.
    // Le courriel et le rôle sont résolus ici, une fois, plutôt qu'écriture
    // par écriture.
    const auteurs = await this.prisma.user.findMany({
      where: { tenantId },
      select: { id: true, email: true, role: true },
    });
    const parId = new Map(auteurs.map((u) => [u.id, u]));

    // Combien de fois chaque compte a bougé · sert le critère « rarement
    // utilisés » (§ A44 a)). PAR AGRÉGAT (audit final F185) · le décompte se
    // faisait sur toutes les lignes chargées en mémoire.
    const [comptes, mouvements] = await Promise.all([
      this.prisma.compte.findMany({ where: { tenantId }, select: { id: true, numero: true } }),
      this.prisma.ligneEcriture.groupBy({
        by: ['compteId'],
        // LES ÉCRITURES QUE LA CLÔTURE ENGENDRE NE SONT PAS UN USAGE · le
        // report à-nouveau recopie un solde, le solde des comptes de gestion
        // les vire au 13, validé depuis l'audit final F4. Comptées, elles
        // ajoutaient un mouvement à chaque compte touché, et un compte de
        // charge servi deux fois cessait d'être « rarement utilisé » sur tout
        // exercice clos.
        where: { ecriture: { tenantId, exerciceId, estGenereeParCloture: false } },
        _count: { _all: true },
      }),
    ]);
    const numeroDe = new Map(comptes.map((c) => [c.id, c.numero]));
    const mouvementsParCompte = new Map<string, number>();
    for (const g of mouvements) {
      const n = numeroDe.get(g.compteId);
      if (n !== undefined) mouvementsParCompte.set(n, g._count._all);
    }

    const debutFinDePeriode = new Date(exercice.dateFin);
    debutFinDePeriode.setUTCDate(debutFinDePeriode.getUTCDate() - (SEUILS_ISA_240.joursFinDePeriode - 1));

    // PAR TRANCHES (audit final F185) · seules les écritures RETENUES sont
    // gardées, jusqu'au plafond ; les autres ne sont que comptées.
    let totalEcritures = 0;
    let totalRetenues = 0;
    const parCritere = new Map<string, number>();
    const selection: ReturnType<typeof retenir>[] = [];
    const retenir = (e: EcritureLue) => {
      const montant = e.lignes.reduce((s, l) => s + Number(l.debit), 0);
      const auteur = parId.get(e.createdBy);
      const comptesRares = e.lignes
        .map((l) => l.compte.numero)
        .filter((n) => (mouvementsParCompte.get(n) ?? 0) <= SEUILS_ISA_240.mouvementsCompteRare);

      const criteres: string[] = [];
      if (e.date >= debutFinDePeriode && e.date <= exercice.dateFin) criteres.push('FIN_DE_PERIODE');
      if (e.createdAt > exercice.dateFin) criteres.push('SAISIE_APRES_CLOTURE');
      if (e.libelle.trim().length < SEUILS_ISA_240.longueurLibelleCourt || !e.reference?.trim()) {
        criteres.push('SANS_JUSTIFICATION');
      }
      // Un auteur INTROUVABLE compte aussi · un utilisateur supprimé du
      // dossier laisse des écritures dont plus personne ne répond, et c'est
      // exactement ce que le § A44 b) demande de regarder.
      if (!auteur || ROLES_NON_SAISISSEURS.includes(auteur.role)) criteres.push('AUTEUR_INATTENDU');
      if (
        montant >= SEUILS_ISA_240.planckMontantRond &&
        Math.abs(montant % SEUILS_ISA_240.pasMontantRond) < 0.005
      ) {
        criteres.push('MONTANT_ROND');
      }
      if (comptesRares.length > 0) criteres.push('COMPTE_RARE');

      return {
        id: e.id,
        date: e.date,
        journal: e.journal.code,
        numeroPiece: e.numeroPiece,
        reference: e.reference,
        libelle: e.libelle,
        montant,
        statut: e.statut,
        // LA PISTE, restituée · art. 22, 1°.
        saisieLe: e.createdAt,
        saisiePar: auteur?.email ?? 'utilisateur retiré du dossier',
        roleAuteur: auteur?.role ?? null,
        valideeLe: e.valideeAt,
        valideePar: e.valideeBy ? (parId.get(e.valideeBy)?.email ?? 'utilisateur retiré du dossier') : null,
        /** Écart entre la date comptable et la date de saisie, en jours. */
        joursEntreDateEtSaisie: Math.round(
          (e.createdAt.getTime() - e.date.getTime()) / (24 * 3600 * 1000),
        ),
        comptesRares,
        criteres,
      };
    };

    await lireParLots(
      (curseur) =>
        this.prisma.ecriture.findMany({
          where: { tenantId, exerciceId },
          include: { lignes: { include: { compte: { select: { numero: true, intitule: true } } } }, journal: true },
          ...pageApres(curseur, LOT_ECRITURES),
        }),
      (e) => {
        totalEcritures++;
        const r = retenir(e);
        if (r.criteres.length === 0) return;
        totalRetenues++;
        for (const c of r.criteres) parCritere.set(c, (parCritere.get(c) ?? 0) + 1);
        if (selection.length < plafond) selection.push(r);
      },
      LOT_ECRITURES,
    );
    // L'ordre du journal · lu par identifiant, rendu par date et numéro de pièce.
    selection.sort(
      (a, b) => a.date.getTime() - b.date.getTime() || (a.numeroPiece ?? Number.MAX_SAFE_INTEGER) - (b.numeroPiece ?? Number.MAX_SAFE_INTEGER),
    );

    return {
      exercice: { dateDebut: exercice.dateDebut, dateFin: exercice.dateFin, dateArreteComptes: exercice.dateArreteComptes },
      criteres: CRITERES_ISA_240,
      seuils: SEUILS_ISA_240,
      totalEcritures,
      // TRONQUÉE SE DIT (audit final F185) · le classeur refuse alors, la
      // sélection remise à un auditeur ne s'ampute pas en silence.
      totalRetenues,
      tronque: totalRetenues > selection.length,
      // Le dénombrement par critère · une sélection qui retiendrait TOUT le
      // journal n'aide personne, et c'est ce chiffre qui le dit.
      parCritere: CRITERES_ISA_240.map((c) => ({
        cle: c.cle,
        titre: c.titre,
        nombre: parCritere.get(c.cle) ?? 0,
      })),
      selection,
    };
  }
}
