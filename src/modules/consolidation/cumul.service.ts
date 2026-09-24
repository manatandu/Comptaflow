import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { lireFichier, lireMontant } from '../import/lecture-fichier';
import {
  AcquisitionDeclaree,
  cumulerConsolidation,
  EntiteACumuler,
  OperationReciproque,
  RefusConsolidation,
} from './cumul-consolidation';
import { PerimetreService } from './perimetre.service';
import { AcquisitionDto, ImporterBalanceEntiteDto, OperationReciproqueDto } from './dto/perimetre.dto';

const n = (v: unknown) => (v == null ? null : Number(v));

/**
 * Repère une colonne du canevas par son en-tête · le même canevas que la
 * balance agrégée du groupe (Numéro, Intitulé, Débit, Crédit), accents et
 * casse ignorés.
 */
function colonne(colonnes: string[], motif: RegExp): number {
  return colonnes.findIndex((c) =>
    motif.test(
      c
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase(),
    ),
  );
}

/**
 * CUMUL ET ÉLIMINATIONS · la persistance autour du moteur pur de la tranche 2.
 *
 * DEUX SOURCES DE BALANCE, décision du 2026-09-24. La consolidante est le
 * dossier, et sa balance est celle du grand livre (`EcritureService.balance`,
 * la même que la balance agrégée du groupe). Une filiale arrive par une
 * balance importée au canevas de la balance agrégée. Le dossier OmegaX relié
 * par la console, seconde source décidée, n'est pas encore servi · il suppose
 * de lire un autre dossier, ce que la garde de cloisonnement refuse hors d'un
 * périmètre nommé, et ce périmètre-là reste à construire.
 */
@Injectable()
export class CumulService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritures: EcritureService,
    private readonly perimetre: PerimetreService,
  ) {}

  private async entite(tenantId: string, id: string) {
    const e = await this.prisma.entitePerimetreConsolidation.findFirst({ where: { id, tenantId } });
    if (!e) throw new NotFoundException('Entité introuvable dans ce dossier.');
    return e;
  }

  /**
   * La balance importée remplace la précédente d'un bloc · deux imports
   * cumulés compteraient deux fois la filiale. Elle doit être ÉQUILIBRÉE, et
   * elle ne porte aucune ligne de classe 9, qui est la comptabilité analytique
   * au SYSCOHADA et n'appartient à aucune balance générale.
   */
  async importerBalance(tenantId: string, entiteId: string, dto: ImporterBalanceEntiteDto) {
    await this.entite(tenantId, entiteId);
    const tableau = await lireFichier(dto.nomFichier, dto.contenuBase64);
    const iNum = colonne(tableau.colonnes, /num|compte|code/);
    const iInt = colonne(tableau.colonnes, /intitul|libell/);
    const iDeb = colonne(tableau.colonnes, /debit/);
    const iCre = colonne(tableau.colonnes, /credit/);
    if (iNum < 0 || iDeb < 0 || iCre < 0) {
      throw new BadRequestException(
        'Le fichier ne suit pas le canevas de la balance agrégée · il faut au moins les colonnes Numéro, Débit et Crédit.',
      );
    }
    const soldes = new Map<string, { intitule: string; solde: number }>();
    const anomalies: string[] = [];
    tableau.lignes.forEach((l, i) => {
      const numero = (l[iNum] ?? '').trim();
      if (!numero) return;
      if (!/^\d+$/.test(numero)) return void anomalies.push(`ligne ${i + 2} · numéro de compte illisible « ${numero} »`);
      if (numero.startsWith('9')) return void anomalies.push(`ligne ${i + 2} · compte ${numero} de classe 9, hors balance générale`);
      const d = lireMontant(l[iDeb] ?? '');
      const c = lireMontant(l[iCre] ?? '');
      if (d === null || c === null) return void anomalies.push(`ligne ${i + 2} · montant illisible sur le compte ${numero}`);
      if (d === 0 && c === 0) return;
      const prec = soldes.get(numero);
      soldes.set(numero, {
        intitule: prec?.intitule || (iInt >= 0 ? (l[iInt] ?? '').trim() : '') || numero,
        solde: Math.round(((prec?.solde ?? 0) + d - c) * 100) / 100,
      });
    });
    if (anomalies.length > 0) {
      throw new BadRequestException(`Balance refusée, rien n’est enregistré · ${anomalies.slice(0, 10).join(' ; ')}.`);
    }
    const ecart = Math.round([...soldes.values()].reduce((s, l) => s + l.solde, 0) * 100) / 100;
    if (Math.abs(ecart) > 0.005) {
      throw new BadRequestException(`La balance n’est pas équilibrée (écart de ${ecart}) · rien n’est enregistré.`);
    }
    await this.prisma.$transaction([
      this.prisma.ligneBalanceConsolidation.deleteMany({ where: { tenantId, entiteId } }),
      this.prisma.ligneBalanceConsolidation.createMany({
        data: [...soldes.entries()].map(([numero, l]) => ({ tenantId, entiteId, numero, intitule: l.intitule, solde: l.solde })),
      }),
      this.prisma.entitePerimetreConsolidation.update({
        where: { id: entiteId },
        data: { balanceImporteeLe: new Date(), fichierBalance: dto.nomFichier },
      }),
    ]);
    return { lignes: soldes.size };
  }

  async declarerAcquisition(tenantId: string, lienId: string, dto: AcquisitionDto) {
    const lien = await this.prisma.lienParticipationConsolidation.findFirst({ where: { id: lienId, tenantId }, select: { id: true } });
    if (!lien) throw new NotFoundException('Participation introuvable dans ce dossier.');
    if (dto.modeDureeEcart === 'LIMITEE' && !dto.dureeEcartAnnees) {
      throw new BadRequestException('Une durée d’utilité limitée se déclare avec sa durée · sinon, choisissez « non déterminable » (dix ans).');
    }
    if ((dto.dividendesExercice ?? 0) > 0 && !dto.compteDividendes) {
      throw new BadRequestException('Des dividendes se déclarent avec le compte qui les porte chez la détentrice.');
    }
    return this.prisma.lienParticipationConsolidation.update({
      where: { id: lienId },
      data: {
        coutAcquisition: dto.coutAcquisition,
        compteTitres: dto.compteTitres,
        dateEntree: new Date(dto.dateEntree),
        capitauxPropresEntree: dto.capitauxPropresEntree,
        modeDureeEcart: dto.modeDureeEcart,
        dureeEcartAnnees: dto.modeDureeEcart === 'LIMITEE' ? dto.dureeEcartAnnees : null,
        depreciationEcartOuverture: dto.depreciationEcartOuverture ?? 0,
        depreciationEcartCloture: dto.depreciationEcartCloture ?? 0,
        dividendesExercice: dto.dividendesExercice ?? 0,
        compteDividendes: dto.compteDividendes ?? null,
        obligationNonDesengagement: dto.obligationNonDesengagement ?? false,
      },
    });
  }

  async ajouterReciproque(tenantId: string, dto: OperationReciproqueDto) {
    for (const id of [dto.entiteAId, dto.entiteBId]) if (id) await this.entite(tenantId, id);
    if ((dto.entiteAId ?? null) === (dto.entiteBId ?? null)) {
      throw new BadRequestException('Une opération réciproque relie deux entités DIFFÉRENTES du périmètre.');
    }
    return this.prisma.operationReciproqueConsolidation.create({
      data: {
        tenantId,
        exerciceId: dto.exerciceId,
        entiteAId: dto.entiteAId ?? null,
        compteA: dto.compteA,
        entiteBId: dto.entiteBId ?? null,
        compteB: dto.compteB,
        montant: dto.montant,
        libelle: dto.libelle.trim(),
      },
    });
  }

  async supprimerReciproque(tenantId: string, id: string) {
    const o = await this.prisma.operationReciproqueConsolidation.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!o) throw new NotFoundException('Opération réciproque introuvable dans ce dossier.');
    await this.prisma.operationReciproqueConsolidation.delete({ where: { id } });
    return { supprime: true };
  }

  async cumul(tenantId: string, exerciceId: string) {
    const etat = await this.perimetre.etat(tenantId, exerciceId);
    const ex = await this.prisma.exercice.findFirst({ where: { id: exerciceId, tenantId }, select: { dateDebut: true, dateFin: true } });
    const retenus = etat.resultats.filter((r) => r.estConsolidante || r.methode === 'IG' || r.methode === 'IP' || r.methode === 'ME');
    const idsRetenus = new Set(retenus.map((r) => r.id));
    const consolidanteId = etat.consolidante.id;
    const versMoteur = (id: string | null) => id ?? consolidanteId;

    // Une entité retenue ne se détient pas par une entité EXCLUE · les titres
    // resteraient au coût dans une entité qu'on ne consolide pas, pendant que
    // les actifs de la détenue seraient cumulés · double compte.
    const exclues = new Set(etat.resultats.filter((r) => r.methode === 'EXCLUE').map((r) => r.id));
    for (const l of etat.liens) {
      if (idsRetenus.has(l.detenueId) && l.detentriceId && exclues.has(l.detentriceId)) {
        const nom = (id: string) => etat.resultats.find((r) => r.id === id)?.nom ?? id;
        throw new BadRequestException(
          `« ${nom(l.detenueId)} » est retenue mais détenue par « ${nom(l.detentriceId)} », exclue (art. 96) · aucun texte lu ne dit ` +
            'comment intégrer une entité dont la détentrice n’est pas consolidée.',
        );
      }
    }

    const liensUtiles = etat.liens.filter(
      (l) => idsRetenus.has(l.detenueId) && idsRetenus.has(versMoteur(l.detentriceId)) && l.detenueId !== consolidanteId,
    );
    const liensBruts = await this.prisma.lienParticipationConsolidation.findMany({ where: { tenantId, exerciceId } });
    const parLien = new Map(liensBruts.map((l) => [l.id, l]));
    const sansAcquisition = liensUtiles.filter((l) => parLien.get(l.id)?.coutAcquisition == null);
    if (sansAcquisition.length > 0) {
      const nom = (id: string) => etat.resultats.find((r) => r.id === id)?.nom ?? id;
      throw new BadRequestException(
        'Coût d’acquisition non déclaré pour · ' +
          sansAcquisition.map((l) => `${nom(versMoteur(l.detentriceId))} → ${nom(l.detenueId)}`).join(', ') +
          ' · sans lui, les titres ne se substituent pas et l’écart d’acquisition ne se calcule pas (art. 81 et 82).',
      );
    }

    const lignesImportees = await this.prisma.ligneBalanceConsolidation.findMany({
      where: { tenantId, entiteId: { in: retenus.filter((r) => !r.estConsolidante).map((r) => r.id) } },
    });
    const balanceDossier = await this.ecritures.balance(tenantId, exerciceId);

    const entites: EntiteACumuler[] = retenus.map((r) => {
      const balance = r.estConsolidante
        ? balanceDossier.lignes.map((l) => ({ numero: l.numero, intitule: l.intitule, solde: Number(l.solde) }))
        : lignesImportees.filter((l) => l.entiteId === r.id).map((l) => ({ numero: l.numero, intitule: l.intitule, solde: Number(l.solde) }));
      return {
        id: r.id,
        nom: r.nom,
        estConsolidante: r.estConsolidante,
        methode: r.estConsolidante ? 'IG' : (r.methode as 'IG' | 'IP' | 'ME'),
        pctInteret: r.pctInteret,
        balance: balance.length > 0 ? balance : null,
      };
    });

    const acquisitions: AcquisitionDeclaree[] = liensUtiles.map((l) => {
      const b = parLien.get(l.id)!;
      return {
        detentriceId: versMoteur(l.detentriceId),
        detenueId: l.detenueId,
        pctCapital: Number(b.pctCapital),
        coutAcquisition: n(b.coutAcquisition)!,
        compteTitres: b.compteTitres ?? '',
        dateEntree: b.dateEntree!,
        capitauxPropresEntree: n(b.capitauxPropresEntree)!,
        modeDureeEcart: b.modeDureeEcart ?? 'NON_DETERMINABLE',
        dureeEcartAnnees: b.dureeEcartAnnees,
        depreciationEcartOuverture: Number(b.depreciationEcartOuverture),
        depreciationEcartCloture: Number(b.depreciationEcartCloture),
        dividendesExercice: Number(b.dividendesExercice),
        compteDividendes: b.compteDividendes,
        obligationNonDesengagement: b.obligationNonDesengagement,
      };
    });

    const operations = await this.prisma.operationReciproqueConsolidation.findMany({ where: { tenantId, exerciceId } });
    const reciproques: OperationReciproque[] = operations.map((o) => ({
      entiteAId: versMoteur(o.entiteAId),
      compteA: o.compteA,
      entiteBId: versMoteur(o.entiteBId),
      compteB: o.compteB,
      montant: Number(o.montant),
      libelle: o.libelle,
    }));

    try {
      return {
        ...cumulerConsolidation({ dateDebut: ex!.dateDebut, dateFin: ex!.dateFin }, entites, acquisitions, reciproques),
        reserves: [
          'Les balances des filiales sont réputées RETRAITÉES aux règles du groupe (D4C, ch. XII-3) · OmegaX ne fait ni l’homogénéisation ni les éliminations de nature fiscale.',
          'Les écarts d’évaluation (ch. XII-6 § 1) et leurs impôts différés viennent avec la tranche 4 · l’écart de consolidation est ici tout entier porté en écart d’acquisition.',
          'Les résultats internes inclus dans les stocks et les immobilisations (art. 86, 4°) ne sont pas éliminés · le texte ne dit pas qui, du groupe ou des minoritaires du vendeur, supporte l’élimination.',
          'Amortissement de l’écart · prorata au mois, du premier jour du mois d’entrée, convention reprise du module des immobilisations · le D4C dit « linéairement » sans fixer de prorata.',
        ],
      };
    } catch (e) {
      if (e instanceof RefusConsolidation) throw new BadRequestException(e.message);
      throw e;
    }
  }
}
