import { Injectable } from '@nestjs/common';
import { Referentiel, StatutEcriture } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { REGLES_COMPTES_SYCEBNL, RegleCompte } from './regles-comptes-sycebnl';
import { REGLES_COMPTES_SYSCOHADA } from './regles-comptes-syscohada';

/**
 * DOSSIER DE RÉVISION · ce que le référentiel du dossier dit de chaque compte,
 * appliqué au dossier réel (le SYCEBNL ou l'AUDCIF, voir plus bas).
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
 * LES DEUX RÉFÉRENTIELS ONT LEUR TABLE, extraite de LEUR texte · SYCEBNL
 * Partie 2 ch. 3 (78 fiches), SYSCOHADA AUDCIF Titre VII (115 fiches). Elles
 * ne se transposent pas : les deux textes n'écrivent même pas la règle de la
 * même façon, le SYCEBNL disant « (utiliser 104) » là où l'AUDCIF écrit
 * « → 481 » (CLAUDE.md §6).
 */
@Injectable()
export class DossierRevisionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * La fiche qui gouverne un numéro de compte · la PLUS PRÉCISE qui le
   * préfixe.
   *
   * Les fiches sont à deux chiffres, et descendent plus bas là où le texte y
   * descend · 603, 659 et 759 dans les deux tables, et dans celle de l'AUDCIF
   * aussi les subdivisions du compte 10, à trois chiffres, et les engagements
   * de la classe 9, à quatre (audit final F209 · « sauf trois » ne valait que
   * pour le SYCEBNL). Un compte 65910000 relève donc de la fiche 659 et non de la
   * fiche 65 : prendre la première trouvée afficherait la règle du compte
   * père, qui dit autre chose.
   */
  static regleDe(numero: string, table: RegleCompte[]): RegleCompte | null {
    let choisie: RegleCompte | null = null;
    for (const r of table) {
      if (!numero.startsWith(r.numero)) continue;
      if (!choisie || r.numero.length > choisie.numero.length) choisie = r;
    }
    return choisie;
  }

  /** Toutes les fiches · servies au client pour l'avertissement de saisie. */
  regles(referentiel: string | undefined): RegleCompte[] {
    // Servir les fiches SYCEBNL à un dossier SYSCOHADA ferait avertir sur un
    // plan qui n'est pas le sien · les numéros se ressemblent sans se
    // recouvrir (CLAUDE.md §6). Un référentiel inconnu ne rend RIEN plutôt
    // que le jeu par défaut.
    if (referentiel === Referentiel.SYCEBNL) return REGLES_COMPTES_SYCEBNL;
    if (referentiel === Referentiel.SYSCOHADA) return REGLES_COMPTES_SYSCOHADA;
    return [];
  }

  /**
   * Le dossier de révision d'un exercice · un bloc par compte MOUVEMENTÉ.
   *
   * Les comptes sans mouvement en sont absents : un dossier de révision qui
   * listerait tout le plan semé ne se lit pas, et la révision ne porte que
   * sur ce qui a bougé. (Le décompte du plan est tenu par ses specs de semis,
   * et nulle part ailleurs · audit final F209.)
   */
  async dossier(tenantId: string, exerciceId: string, referentiel?: string) {
    const table = this.regles(referentiel);
    const mouvements = await this.prisma.ligneEcriture.groupBy({
      by: ['compteId'],
      // SANS LE SOLDE DE CLÔTURE (régression de l'audit final F4) · l'écriture
      // qui solde les classes 6 à 8 sur le 13 entre VALIDÉE. Lue avec elle,
      // chaque charge et chaque produit d'un exercice clos affichait un solde
      // nul sous des débits et des crédits doublés, et le réviseur n'y voyait
      // plus le montant de l'année. Même lecture que les états
      // (`avantSoldeDesComptesDeGestion`) · ce n'est ni une ouverture ni une
      // activité de l'exercice.
      where: { ecriture: { tenantId, exerciceId, statut: StatutEcriture.VALIDEE, estSoldeDesComptesDeGestion: false } },
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
        const regle = DossierRevisionService.regleDe(c.numero, table);
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
