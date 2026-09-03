import { Injectable } from '@nestjs/common';
import { Referentiel, StatutEcriture } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { REGLES_COMPTES_SYCEBNL, RegleCompte } from './regles-comptes-sycebnl';

/**
 * DOSSIER DE RÉVISION · ce que le SYCEBNL dit de chaque compte, appliqué au
 * dossier réel.
 *
 * Le référentiel décrit chaque compte par une fiche, dont deux rubriques ne
 * servaient à RIEN dans le logiciel alors qu'elles sont, pour un cabinet, la
 * matière même de la révision :
 *
 *  · « Éléments de contrôle » · les pièces à partir desquelles le solde se
 *    justifie. Rapprochées des comptes RÉELLEMENT mouvementés, elles font le
 *    dossier de révision : compte par compte, son solde et ce qu'il faut
 *    demander pour le justifier.
 *  · « Exclusions » · ce que le compte ne doit pas enregistrer. Servi à la
 *    saisie, c'est un avertissement d'imputation.
 *
 * Le texte est CITÉ, jamais reformulé · un avertissement qui paraphrase la
 * règle cesse d'être opposable devant un réviseur.
 *
 * Propre au SYCEBNL pour l'instant. L'AUDCIF porte les mêmes rubriques pour
 * le SYSCOHADA (Titre VII) · même travail d'extraction à faire, et surtout
 * pas une transposition (CLAUDE.md §6).
 */
@Injectable()
export class DossierRevisionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * La fiche qui gouverne un numéro de compte · la PLUS PRÉCISE qui le
   * préfixe.
   *
   * Les fiches sont à deux chiffres, sauf trois qui descendent à trois (603,
   * 659, 759) parce que le texte y descend. Un compte 65910000 relève donc de
   * la fiche 659 et non de la fiche 65 : prendre la première trouvée
   * afficherait la règle du compte père, qui dit autre chose.
   */
  static regleDe(numero: string): RegleCompte | null {
    let choisie: RegleCompte | null = null;
    for (const r of REGLES_COMPTES_SYCEBNL) {
      if (!numero.startsWith(r.numero)) continue;
      if (!choisie || r.numero.length > choisie.numero.length) choisie = r;
    }
    return choisie;
  }

  /** Toutes les fiches · servies au client pour l'avertissement de saisie. */
  regles(referentiel: string | undefined): RegleCompte[] {
    // Rendre les fiches SYCEBNL à un dossier SYSCOHADA ferait avertir sur un
    // plan qui n'est pas le sien · les numéros se ressemblent sans se
    // recouvrir (CLAUDE.md §6).
    return referentiel === Referentiel.SYCEBNL ? REGLES_COMPTES_SYCEBNL : [];
  }

  /**
   * Le dossier de révision d'un exercice · un bloc par compte MOUVEMENTÉ.
   *
   * Les comptes sans mouvement en sont absents : un dossier de révision qui
   * listerait les 1 400 comptes du plan ne se lit pas, et la révision ne
   * porte que sur ce qui a bougé.
   */
  async dossier(tenantId: string, exerciceId: string) {
    const mouvements = await this.prisma.ligneEcriture.groupBy({
      by: ['compteId'],
      where: { ecriture: { tenantId, exerciceId, statut: StatutEcriture.VALIDEE } },
      _sum: { debit: true, credit: true },
    });
    if (!mouvements.length) return { comptes: [] };

    const comptes = await this.prisma.compte.findMany({
      where: { tenantId, id: { in: mouvements.map((m) => m.compteId) } },
      select: { id: true, numero: true, intitule: true },
      orderBy: { numero: 'asc' },
    });
    const parId = new Map(mouvements.map((m) => [m.compteId, m]));

    return {
      comptes: comptes.map((c) => {
        const m = parId.get(c.id)!;
        const debit = Number(m._sum.debit ?? 0);
        const credit = Number(m._sum.credit ?? 0);
        const regle = DossierRevisionService.regleDe(c.numero);
        return {
          compteId: c.id,
          numero: c.numero,
          intitule: c.intitule,
          debit,
          credit,
          solde: debit - credit,
          /** Le numéro de la fiche du texte qui gouverne ce compte. */
          ficheNumero: regle?.numero ?? null,
          elementsDeControle: regle?.elementsDeControle ?? null,
          exclusions: regle?.exclusions ?? null,
        };
      }),
    };
  }
}
