import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import {
  CRITERES_ISA_240,
  ROLES_NON_SAISISSEURS,
  SEUILS_ISA_240,
} from './test-ecritures-journal';

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

  async selection(tenantId: string, exerciceId: string) {
    const exercice = await this.prisma.exercice.findFirst({ where: { id: exerciceId, tenantId } });
    if (!exercice) throw new NotFoundException('Exercice introuvable pour ce dossier.');

    const ecritures = await this.prisma.ecriture.findMany({
      where: { tenantId, exerciceId },
      include: { lignes: { include: { compte: { select: { numero: true, intitule: true } } } }, journal: true },
      orderBy: [{ date: 'asc' }, { numeroPiece: 'asc' }],
    });

    // L'auteur est un identifiant en base · un auditeur ne lit pas un uuid.
    // Le courriel et le rôle sont résolus ici, une fois, plutôt qu'écriture
    // par écriture.
    const auteurs = await this.prisma.user.findMany({
      where: { tenantId },
      select: { id: true, email: true, role: true },
    });
    const parId = new Map(auteurs.map((u) => [u.id, u]));

    // Combien de fois chaque compte a bougé · sert le critère « rarement
    // utilisés » (§ A44 a)).
    const mouvementsParCompte = new Map<string, number>();
    for (const e of ecritures) {
      for (const l of e.lignes) {
        const n = l.compte.numero;
        mouvementsParCompte.set(n, (mouvementsParCompte.get(n) ?? 0) + 1);
      }
    }

    const debutFinDePeriode = new Date(exercice.dateFin);
    debutFinDePeriode.setUTCDate(debutFinDePeriode.getUTCDate() - (SEUILS_ISA_240.joursFinDePeriode - 1));

    const retenues = ecritures.map((e) => {
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
    });

    const selection = retenues.filter((e) => e.criteres.length > 0);
    return {
      exercice: { dateDebut: exercice.dateDebut, dateFin: exercice.dateFin, dateArreteComptes: exercice.dateArreteComptes },
      criteres: CRITERES_ISA_240,
      seuils: SEUILS_ISA_240,
      totalEcritures: ecritures.length,
      // Le dénombrement par critère · une sélection qui retiendrait TOUT le
      // journal n'aide personne, et c'est ce chiffre qui le dit.
      parCritere: CRITERES_ISA_240.map((c) => ({
        cle: c.cle,
        titre: c.titre,
        nombre: selection.filter((e) => e.criteres.includes(c.cle)).length,
      })),
      selection,
    };
  }
}
