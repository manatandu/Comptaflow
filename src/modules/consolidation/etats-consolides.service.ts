import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EtatsFinanciersSyscohadaService } from '../etats-financiers-syscohada/etats-financiers-syscohada.service';
import { CumulService } from './cumul.service';
import { apparierN1, construireEtatsConsolides, EtatsConsolides, Resolveurs } from './etats-consolides';
import {
  changementsDuPerimetre,
  construireTableauFluxConsolide,
  construireVariationCapitauxPropres,
  TableauFluxConsolide,
  VariationCapitauxPropres,
  variationsDuPerimetre,
} from './flux-capitaux-consolides';
import { noteDuPerimetre } from './note-perimetre';
import { PerimetreService } from './perimetre.service';

/**
 * ÉTATS CONSOLIDÉS, tranches 3a et 3b · bilan, compte de résultat, note du
 * périmètre, tableau des flux de trésorerie et variation des capitaux propres.
 *
 * LE COMPARATIF EST UNE SECONDE CONSOLIDATION, jamais une relecture · le
 * cumul de l'exercice précédent est rejoué sur SON périmètre et SES balances.
 * Quand il ne se joue pas (premier exercice, aucun périmètre déclaré, ou un
 * refus du moteur), la colonne reste VIDE et le motif est rendu · une colonne
 * N-1 remplie de zéros se lirait comme un groupe qui n'existait pas.
 */
/**
 * D4C ch. XII-8 § 6 · les Notes annexes consolidées que cette version ne
 * produit pas. Seule la note du périmètre est servie · le dire est la seule
 * manière de ne pas laisser croire le jeu complet.
 */
export const NOTES_D4C_NON_PRODUITES =
  'Notes annexes consolidées non produites hormis la note du périmètre (D4C ch. XII-8 § 6) · déclaration de conformité, résumé des méthodes, ' +
  'information sectorielle, informations sur les postes (dont la note sur l’impôt · composantes, preuve d’impôt, changements de taux, ' +
  'déficits non activés, ch. XII-3 § 3), autres informations, acquisitions et cessions de l’exercice.';

@Injectable()
export class EtatsConsolidesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cumuls: CumulService,
    private readonly perimetre: PerimetreService,
    private readonly etatsIndividuels: EtatsFinanciersSyscohadaService,
  ) {}

  private resolveurs(): Resolveurs {
    return {
      bilan: (l) => this.etatsIndividuels.resoudreBilanSurLignes(l),
      compteResultat: (l) => this.etatsIndividuels.resoudreCompteResultatSurLignes(l),
    };
  }

  async etats(tenantId: string, exerciceId: string) {
    const cumulN = await this.cumuls.cumul(tenantId, exerciceId);
    const etatN = await this.perimetre.etat(tenantId, exerciceId);
    const n = construireEtatsConsolides(cumulN, this.resolveurs());

    const ex = await this.prisma.exercice.findFirst({ where: { id: exerciceId, tenantId }, select: { dateDebut: true } });
    const precedent = ex
      ? await this.prisma.exercice.findFirst({
          where: { tenantId, dateDebut: { lt: ex.dateDebut } },
          orderBy: { dateDebut: 'desc' },
          select: { id: true },
        })
      : null;

    let n1: EtatsConsolides | null = null;
    let cumulN1: Awaited<ReturnType<CumulService['cumul']>> | null = null;
    let resultatsN1: Awaited<ReturnType<PerimetreService['etat']>>['resultats'] | null = null;
    let motifSansComparatif: string | null = null;
    if (!precedent) {
      motifSansComparatif = 'Premier exercice du dossier · aucun comparatif.';
    } else {
      const etatN1 = await this.perimetre.etat(tenantId, precedent.id);
      if (etatN1.entites.length === 0) {
        motifSansComparatif = 'Aucun périmètre déclaré pour l’exercice précédent · la colonne N-1 ne se déduit pas des comptes de la seule consolidante.';
      } else {
        resultatsN1 = etatN1.resultats;
        try {
          cumulN1 = await this.cumuls.cumul(tenantId, precedent.id);
          n1 = construireEtatsConsolides(cumulN1, this.resolveurs());
        } catch (e) {
          if (!(e instanceof BadRequestException)) throw e;
          motifSansComparatif = `L’exercice précédent ne se consolide pas · ${e.message}`;
        }
      }
    }

    // TABLEAU DES FLUX ET VARIATION DES CAPITAUX PROPRES · tous deux partent
    // des capitaux propres et de la trésorerie d'OUVERTURE, que seule la
    // consolidation N-1 donne. Sans elle, ils ne s'établissent pas, et le motif
    // est celui de la colonne comparative.
    let tft: TableauFluxConsolide;
    let tvcp: VariationCapitauxPropres | null = null;
    if (!cumulN1 || !precedent || !resultatsN1) {
      tft = { lignes: null, obstacles: [motifSansComparatif ?? 'Aucune consolidation de l’exercice précédent.'], controle: null };
    } else {
      const [consolidanteN, consolidanteN1] = await Promise.all([
        this.cumuls.lignesConsolidante(tenantId, exerciceId),
        this.cumuls.lignesConsolidante(tenantId, precedent.id),
      ]);
      tft = construireTableauFluxConsolide(
        { cumulN, cumulN1, consolidanteN, consolidanteN1, variationsPerimetre: variationsDuPerimetre(etatN.resultats, resultatsN1) },
        (ln, ln1) => this.etatsIndividuels.resoudreFluxSurLignes(ln, ln1),
      );
      tvcp = construireVariationCapitauxPropres(cumulN, cumulN1, consolidanteN);
    }

    // LE JEU EST UN TOUT INDISSOCIABLE (D4C ch. XII-8 § 1) · bilan, compte de
    // résultat, tableau des flux, variation des capitaux propres et Notes
    // annexes. « Publiable » se dit du jeu, jamais du seul bilan · et la
    // déclaration de conformité ne s'affirme « que si tout le dispositif est
    // respecté » (§ 6).
    const motifsJeu: string[] = [];
    if (resultatsN1) {
      // Ch. XII-7 · une acquisition complémentaire, une cession ou un
      // changement de méthode ne se jouent pas ici · l'entrée, elle, l'est
      // (première consolidation à la date d'entrée).
      for (const c of changementsDuPerimetre(etatN.resultats, resultatsN1).filter((x) => x.nature !== 'ENTREE')) {
        motifsJeu.push(
          `Variation de périmètre ou de pourcentage d’intérêt non jouée (D4C ch. XII-7) · ${c.motif} Transaction entre actionnaires, ` +
            'résultat de cession sur la dernière valeur consolidée et virement des écarts de conversion ne sont pas calculés.',
        );
      }
    }
    if (!tft.lignes) motifsJeu.push('Tableau consolidé des flux de trésorerie non établi · le jeu complet est indissociable (D4C ch. XII-8 § 1).');
    if (!tvcp) motifsJeu.push('Tableau de variation des capitaux propres consolidés non établi (D4C ch. XII-8 § 1 et § 5).');
    motifsJeu.push(NOTES_D4C_NON_PRODUITES);

    const secteurs = new Map<string, string | null>(etatN.entites.map((e) => [e.id, e.secteurActivite ?? null]));
    return {
      bilan: {
        actif: apparierN1(n.bilan.actif, n1?.bilan.actif ?? null),
        passif: apparierN1(n.bilan.passif, n1?.bilan.passif ?? null),
      },
      compteDeResultat: apparierN1(n.compteDeResultat, n1?.compteDeResultat ?? null),
      controles: n.controles,
      publiable: n.publiable && motifsJeu.length === 0,
      /** Bilan et compte de résultat seuls · le jeu, lui, se lit dans `publiable`. */
      bilanEtResultatPubliables: n.publiable,
      motifsNonPubliable: [...n.motifsNonPubliable, ...motifsJeu],
      comparatif: { disponible: n1 != null, motif: motifSansComparatif },
      tableauDesFlux: tft,
      variationCapitauxPropres: tvcp,
      notePerimetre: noteDuPerimetre(etatN.resultats, secteurs, resultatsN1, etatN.faits?.entitesControleHorsOhada ?? null),
      avertissements: cumulN.avertissements,
      reserves: cumulN.reserves,
    };
  }
}
