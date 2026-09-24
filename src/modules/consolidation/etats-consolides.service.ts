import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EtatsFinanciersSyscohadaService } from '../etats-financiers-syscohada/etats-financiers-syscohada.service';
import { CumulService } from './cumul.service';
import { apparierN1, construireEtatsConsolides, EtatsConsolides, Resolveurs } from './etats-consolides';
import { noteDuPerimetre } from './note-perimetre';
import { PerimetreService } from './perimetre.service';

/**
 * ÉTATS CONSOLIDÉS, tranche 3a · bilan, compte de résultat et note du
 * périmètre, avec leur colonne N-1.
 *
 * LE COMPARATIF EST UNE SECONDE CONSOLIDATION, jamais une relecture · le
 * cumul de l'exercice précédent est rejoué sur SON périmètre et SES balances.
 * Quand il ne se joue pas (premier exercice, aucun périmètre déclaré, ou un
 * refus du moteur), la colonne reste VIDE et le motif est rendu · une colonne
 * N-1 remplie de zéros se lirait comme un groupe qui n'existait pas.
 */
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
          n1 = construireEtatsConsolides(await this.cumuls.cumul(tenantId, precedent.id), this.resolveurs());
        } catch (e) {
          if (!(e instanceof BadRequestException)) throw e;
          motifSansComparatif = `L’exercice précédent ne se consolide pas · ${e.message}`;
        }
      }
    }

    const secteurs = new Map<string, string | null>(etatN.entites.map((e) => [e.id, e.secteurActivite ?? null]));
    return {
      bilan: {
        actif: apparierN1(n.bilan.actif, n1?.bilan.actif ?? null),
        passif: apparierN1(n.bilan.passif, n1?.bilan.passif ?? null),
      },
      compteDeResultat: apparierN1(n.compteDeResultat, n1?.compteDeResultat ?? null),
      controles: n.controles,
      publiable: n.publiable,
      motifsNonPubliable: n.motifsNonPubliable,
      comparatif: { disponible: n1 != null, motif: motifSansComparatif },
      notePerimetre: noteDuPerimetre(etatN.resultats, secteurs, resultatsN1),
      avertissements: cumulN.avertissements,
      reserves: cumulN.reserves,
    };
  }
}
