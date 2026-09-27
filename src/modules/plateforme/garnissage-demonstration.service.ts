import { BadRequestException, Injectable } from '@nestjs/common';
import { StatutExercice } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { TiersService } from '../tiers/tiers.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { LigneDemo, scenarioDemonstration } from './scenario-demonstration';

/**
 * GARNIR UN DOSSIER DE DÉMONSTRATION · le scénario de
 * `scenario-demonstration.ts`, joué par les chemins ORDINAIRES du logiciel :
 * les tiers par `TiersService.creer` (qui pose leur compte individuel), les
 * écritures par `EcritureService.creer` (numérotation du journal, date dans
 * l'exercice, équilibre), puis la validation. Aucune ligne n'est écrite à la
 * main en base · une vitrine qui passerait à côté des contrôles montrerait un
 * logiciel qui n'existe pas.
 *
 * Les écritures sont VALIDÉES · les états financiers ne lisent que le
 * livre-journal, et une vitrine au brouillard montrerait un bilan vide.
 *
 * Appelé par la console, dans une sortie de cloisonnement déclarée
 * (`PlateformeService.preparerDossierDemonstration`) · le dossier garni n'est
 * pas celui de la session de l'opérateur.
 *
 * IL SE REPREND (audit final F174) · un garnissage interrompu laissait une
 * vitrine marquée, à moitié garnie, que la console refusait ensuite de
 * refaire (« un seul dossier de démonstration »). Rejoué, il retrouve ce qui
 * existe · le tiers par son code, l'écriture par son journal, sa date et son
 * libellé · et ne crée que le reste. `crees` dit ce qui a été ajouté.
 */
@Injectable()
export class GarnissageDemonstrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tiers: TiersService,
    private readonly ecritures: EcritureService,
  ) {}

  async garnir(tenantId: string, auteurId: string) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { referentiel: true } });
    const scenario = scenarioDemonstration(tenant.referentiel);
    const exercice = await this.prisma.exercice.findFirst({
      where: { tenantId, statut: StatutExercice.OUVERT },
      orderBy: { dateDebut: 'desc' },
    });
    if (!exercice) throw new BadRequestException('Le dossier de démonstration n’a pas d’exercice ouvert.');
    const annee = exercice.dateDebut.toISOString().slice(0, 4);

    const journaux = await this.prisma.journal.findMany({ where: { tenantId }, select: { id: true, code: true, compteTresorerieId: true } });
    const journal = (code: string) => {
      const j = journaux.find((x) => x.code === code);
      if (!j) throw new BadRequestException(`Journal ${code} absent du dossier de démonstration.`);
      return j;
    };
    const banque = journal('BQ').compteTresorerieId;
    if (!banque) throw new BadRequestException('Le journal BQ n’a pas de compte de trésorerie.');

    const numeros = [...new Set(scenario.operations.flatMap((o) => o.lignes.flatMap((l) => ('nature' in l ? [l.nature] : []))))];
    const comptes = await this.prisma.compte.findMany({ where: { tenantId, numero: { in: numeros } }, select: { id: true, numero: true } });
    let crees = 0;
    const compteTiers = new Map<string, string>();
    for (const t of scenario.tiers) {
      const deja = await this.prisma.tiers.findUnique({
        where: { tenantId_code: { tenantId, code: t.code } },
        select: { comptesRattaches: { where: { estPrincipal: true }, select: { compteId: true } } },
      });
      if (deja) {
        const principal = deja.comptesRattaches[0]?.compteId;
        if (!principal) throw new BadRequestException(`Le tiers ${t.code} existe sans compte principal · la vitrine ne se complète pas.`);
        compteTiers.set(t.code, principal);
        continue;
      }
      const cree = await this.tiers.creer(tenantId, { code: t.code, nom: t.nom, type: t.type });
      if (!cree.compteIndividuel) throw new BadRequestException(`Le tiers ${t.code} n’a pas reçu de compte individuel.`);
      compteTiers.set(t.code, cree.compteIndividuel.id);
      crees++;
    }
    const compteDe = (l: LigneDemo): string => {
      if ('tresorerie' in l) return banque;
      if ('tiers' in l) return compteTiers.get(l.tiers)!;
      const c = comptes.find((x) => x.numero === l.nature);
      if (!c) throw new BadRequestException(`Le compte ${l.nature} n’existe pas dans le plan de ce dossier.`);
      return c.id;
    };

    const ids: string[] = [];
    for (const op of scenario.operations) {
      const date = `${annee}-${op.jour}`;
      const deja = await this.prisma.ecriture.findFirst({
        where: { tenantId, exerciceId: exercice.id, journalId: journal(op.journal).id, date: new Date(`${date}T00:00:00Z`), libelle: op.libelle },
        select: { id: true },
      });
      if (deja) {
        ids.push(deja.id);
        continue;
      }
      const e = await this.ecritures.creer(tenantId, auteurId, {
        exerciceId: exercice.id,
        journalId: journal(op.journal).id,
        date,
        libelle: op.libelle,
        reference: op.reference,
        lignes: op.lignes.map((l) => ({
          compteId: compteDe(l),
          libelle: op.libelle,
          debit: l.sens === 'DEBIT' ? l.montant : 0,
          credit: l.sens === 'CREDIT' ? l.montant : 0,
        })),
      });
      ids.push(e.id);
      crees++;
    }
    await this.ecritures.valider(tenantId, auteurId, ids);
    return { tiers: scenario.tiers.length, ecritures: ids.length, crees };
  }
}
