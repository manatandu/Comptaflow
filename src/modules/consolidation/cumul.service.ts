import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { chargerLignes, LigneBalancePourEtat } from '../etats-financiers/etats-financiers.communs';
import { lireFichier, lireMontant } from '../import/lecture-fichier';
import {
  AcquisitionDeclaree,
  ConversionIndividuelle,
  cumulerConsolidation,
  FAMILLES_PROVISION_CHANGE,
  EcartEvaluation,
  EntiteACumuler,
  FiscaliteEntite,
  MonnaieEntite,
  motifRefusEcartEvaluation,
  OperationReciproque,
  RefusConsolidation,
  ResultatInterne,
} from './cumul-consolidation';
import { PerimetreService } from './perimetre.service';
import {
  AcquisitionDto,
  EcartEvaluationDto,
  FiscaliteEntiteDto,
  ImporterBalanceEntiteDto,
  MonnaieEntiteDto,
  OperationReciproqueDto,
  ProvisionChangeDto,
  ResultatInterneDto,
} from './dto/perimetre.dto';

const n = (v: unknown) => (v == null ? null : Number(v));
const diff = (d: number | null, c: number | null) => (d === null || c === null ? null : d - c);

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
    // DEUX FORMES DE CANEVAS. Quatre colonnes (Numéro, Intitulé, Débit,
    // Crédit) · les deux montants sont les TOTAUX, dont on ne tire que le
    // solde. Six colonnes (report, mouvements, solde, chacun en débit et
    // crédit) · les MOUVEMENTS PROPRES de l'exercice sont conservés, et c'est
    // ce que le tableau des flux consolidé exige (D4C ch. XII-8 § 4, flux
    // « bruts en principe »). Une colonne se reconnaît à son en-tête · jamais
    // à son rang, qui change d'un logiciel à l'autre.
    const norm = tableau.colonnes.map((c) =>
      c
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase(),
    );
    const trouver = (sens: RegExp, qualif: RegExp | null) =>
      norm.findIndex((c) => sens.test(c) && (qualif ? qualif.test(c) : !/mouvement|solde|report|ouverture|nouveau/.test(c)));
    const iMvtDeb = trouver(/debit/, /mouvement/);
    const iMvtCre = trouver(/credit/, /mouvement/);
    const iSolDeb = trouver(/debit/, /solde/);
    const iSolCre = trouver(/credit/, /solde/);
    const iRepDeb = trouver(/debit/, /report|ouverture|nouveau/);
    const iRepCre = trouver(/credit/, /report|ouverture|nouveau/);
    const iDeb = trouver(/debit/, null);
    const iCre = trouver(/credit/, null);
    const avecMouvements = iMvtDeb >= 0 && iMvtCre >= 0;
    const lireSolde: ((l: string[]) => number | null) | null =
      iSolDeb >= 0 && iSolCre >= 0
        ? (l) => diff(lireMontant(l[iSolDeb] ?? ''), lireMontant(l[iSolCre] ?? ''))
        : iDeb >= 0 && iCre >= 0
          ? (l) => diff(lireMontant(l[iDeb] ?? ''), lireMontant(l[iCre] ?? ''))
          : avecMouvements && iRepDeb >= 0 && iRepCre >= 0
            ? (l) => {
                const r = diff(lireMontant(l[iRepDeb] ?? ''), lireMontant(l[iRepCre] ?? ''));
                const m = diff(lireMontant(l[iMvtDeb] ?? ''), lireMontant(l[iMvtCre] ?? ''));
                return r === null || m === null ? null : r + m;
              }
            : null;
    if (iNum < 0 || !lireSolde) {
      throw new BadRequestException(
        'Le fichier ne suit pas le canevas de la balance agrégée · il faut au moins les colonnes Numéro, Débit et Crédit, ' +
          'ou une balance à six colonnes (report, mouvements, solde).',
      );
    }
    const soldes = new Map<string, { intitule: string; solde: number; mouvementDebit: number | null; mouvementCredit: number | null }>();
    const anomalies: string[] = [];
    tableau.lignes.forEach((l, i) => {
      const numero = (l[iNum] ?? '').trim();
      if (!numero) return;
      if (!/^\d+$/.test(numero)) return void anomalies.push(`ligne ${i + 2} · numéro de compte illisible « ${numero} »`);
      if (numero.startsWith('9')) return void anomalies.push(`ligne ${i + 2} · compte ${numero} de classe 9, hors balance générale`);
      const solde = lireSolde(l);
      const md = avecMouvements ? lireMontant(l[iMvtDeb] ?? '') : 0;
      const mc = avecMouvements ? lireMontant(l[iMvtCre] ?? '') : 0;
      if (solde === null || md === null || mc === null) return void anomalies.push(`ligne ${i + 2} · montant illisible sur le compte ${numero}`);
      if (solde === 0 && md === 0 && mc === 0) return;
      if (avecMouvements && iRepDeb >= 0 && iRepCre >= 0 && (iSolDeb >= 0 || iDeb >= 0)) {
        const r = diff(lireMontant(l[iRepDeb] ?? ''), lireMontant(l[iRepCre] ?? ''));
        if (r !== null && Math.abs(r + md - mc - solde) > 0.005) {
          return void anomalies.push(`ligne ${i + 2} · sur le compte ${numero}, report + mouvements ne donnent pas le solde`);
        }
      }
      const prec = soldes.get(numero);
      soldes.set(numero, {
        intitule: prec?.intitule || (iInt >= 0 ? (l[iInt] ?? '').trim() : '') || numero,
        solde: Math.round(((prec?.solde ?? 0) + solde) * 100) / 100,
        mouvementDebit: avecMouvements ? Math.round(((prec?.mouvementDebit ?? 0) + md) * 100) / 100 : null,
        mouvementCredit: avecMouvements ? Math.round(((prec?.mouvementCredit ?? 0) + mc) * 100) / 100 : null,
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
        data: [...soldes.entries()].map(([numero, l]) => ({
          tenantId,
          entiteId,
          numero,
          intitule: l.intitule,
          solde: l.solde,
          mouvementDebit: l.mouvementDebit,
          mouvementCredit: l.mouvementCredit,
        })),
      }),
      this.prisma.entitePerimetreConsolidation.update({
        where: { id: entiteId },
        data: { balanceImporteeLe: new Date(), fichierBalance: dto.nomFichier },
      }),
    ]);
    return { lignes: soldes.size, avecMouvements };
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

  /**
   * Art. 86, 4° · la marge se DÉCLARE, avec ce qui en reste à l'ouverture.
   * Les refus de fond (mise en équivalence, marge au-delà du solde de
   * l'actif) sont ceux du moteur, joués au calcul · ici seulement ce qui se
   * voit sans lui.
   */
  async ajouterResultatInterne(tenantId: string, dto: ResultatInterneDto) {
    for (const id of [dto.vendeuseId, dto.acheteuseId]) if (id) await this.entite(tenantId, id);
    if ((dto.vendeuseId ?? null) === (dto.acheteuseId ?? null)) {
      throw new BadRequestException('Un résultat interne relie une vendeuse et une acheteuse DIFFÉRENTES du périmètre.');
    }
    const classe = dto.nature === 'STOCK' ? '3' : '2';
    if (!dto.compteActif.startsWith(classe)) {
      throw new BadRequestException(`${dto.nature === 'STOCK' ? 'Un stock' : 'Une immobilisation'} s’inscrit en classe ${classe}.`);
    }
    return this.prisma.resultatInterneConsolidation.create({
      data: {
        tenantId,
        exerciceId: dto.exerciceId,
        vendeuseId: dto.vendeuseId ?? null,
        acheteuseId: dto.acheteuseId ?? null,
        nature: dto.nature,
        compteActif: dto.compteActif,
        margeOuverture: dto.margeOuverture,
        margeCloture: dto.margeCloture,
        libelle: dto.libelle.trim(),
      },
    });
  }

  async supprimerResultatInterne(tenantId: string, id: string) {
    const o = await this.prisma.resultatInterneConsolidation.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!o) throw new NotFoundException('Résultat interne introuvable dans ce dossier.');
    await this.prisma.resultatInterneConsolidation.delete({ where: { id } });
    return { supprime: true };
  }

  async ajouterEcartEvaluation(tenantId: string, lienId: string, dto: EcartEvaluationDto) {
    const lien = await this.prisma.lienParticipationConsolidation.findFirst({
      where: { id: lienId, tenantId },
      select: { id: true, exerciceId: true, dateEntree: true },
    });
    if (!lien) throw new NotFoundException('Participation introuvable dans ce dossier.');
    const ev: EcartEvaluation = {
      compte: dto.compte.trim(),
      compteAmortissement: dto.compteAmortissement?.trim() || null,
      libelle: dto.libelle.trim(),
      montant: dto.montant,
      mode: dto.mode,
      dureeAnnees: dto.dureeAnnees ?? null,
      dateRealisation: dto.dateRealisation ? new Date(dto.dateRealisation) : null,
    };
    const refus = motifRefusEcartEvaluation(ev, lien.dateEntree);
    if (refus) throw new BadRequestException(refus);
    return this.prisma.ecartEvaluationConsolidation.create({
      data: { tenantId, exerciceId: lien.exerciceId, lienId: lien.id, ...ev },
    });
  }

  async supprimerEcartEvaluation(tenantId: string, id: string) {
    const o = await this.prisma.ecartEvaluationConsolidation.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!o) throw new NotFoundException('Écart d’évaluation introuvable dans ce dossier.');
    await this.prisma.ecartEvaluationConsolidation.delete({ where: { id } });
    return { supprime: true };
  }

  /**
   * La provision pour pertes de change d'une entité · refusée à la porte hors
   * des trois comptes que le Titre VIII ch. 22 § 2.3 lui donne, et quand
   * l'ouverture qu'elle implique (clôture − dotation + reprise) serait négative.
   */
  async ajouterProvisionChange(tenantId: string, dto: ProvisionChangeDto) {
    const ex = await this.prisma.exercice.findFirst({ where: { id: dto.exerciceId, tenantId }, select: { id: true } });
    if (!ex) throw new NotFoundException('Exercice introuvable dans ce dossier.');
    if (dto.entiteId) {
      const e = await this.prisma.entitePerimetreConsolidation.findFirst({ where: { id: dto.entiteId, tenantId, exerciceId: ex.id }, select: { id: true } });
      if (!e) throw new NotFoundException('Entité introuvable dans ce périmètre.');
    }
    const compte = dto.compteProvision.trim();
    if (!FAMILLES_PROVISION_CHANGE.some((f) => compte.startsWith(f.provision))) {
      throw new BadRequestException('La provision pour pertes de change se loge au 194, au 4991 ou au 4997 (AUDCIF Titre VIII ch. 22 § 2.3).');
    }
    if (dto.cloture - dto.dotation + dto.reprise < -0.005) {
      throw new BadRequestException('Clôture − dotation + reprise donne une provision d’ouverture négative · vérifiez les trois montants.');
    }
    return this.prisma.provisionChangeConsolidation.create({
      data: { tenantId, exerciceId: ex.id, entiteId: dto.entiteId ?? null, compteProvision: compte, cloture: dto.cloture, dotation: dto.dotation, reprise: dto.reprise },
    });
  }

  async supprimerProvisionChange(tenantId: string, id: string) {
    const o = await this.prisma.provisionChangeConsolidation.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!o) throw new NotFoundException('Provision introuvable dans ce dossier.');
    await this.prisma.provisionChangeConsolidation.delete({ where: { id } });
    return { supprime: true };
  }

  /**
   * La fiscalité d'une entité, ou de la consolidante (`entiteId` absent), qui
   * n'est pas une ligne d'entité · elle vit avec les faits de l'exercice. Deux
   * refus à la porte, les mêmes que le moteur · un taux sans source, et un
   * impôt différé actif sans le motif qui le rend probable.
   */
  async enregistrerFiscalite(tenantId: string, dto: FiscaliteEntiteDto) {
    const ex = await this.prisma.exercice.findFirst({ where: { id: dto.exerciceId, tenantId }, select: { id: true } });
    if (!ex) throw new NotFoundException('Exercice introuvable dans ce dossier.');
    if (dto.tauxImpotDiffere != null && !dto.sourceTauxImpot?.trim()) {
      throw new BadRequestException(
        'Le taux d’impôt se déclare AVEC sa source · c’est celui « en vigueur à la clôture » (D4C ch. XII-3 § 3), et OmegaX n’en écrit aucun.',
      );
    }
    if (((dto.idaOuverture ?? 0) > 0 || (dto.idaCloture ?? 0) > 0) && !dto.justificationIda?.trim()) {
      throw new BadRequestException(
        'Un impôt différé actif n’est comptabilisé que s’il est probable qu’un bénéfice imposable permettra de l’imputer (D4C ch. XII-3 § 3) · écrivez pourquoi.',
      );
    }
    const data = {
      tauxImpotDiffere: dto.tauxImpotDiffere ?? null,
      sourceTauxImpot: dto.sourceTauxImpot?.trim() || null,
      idaOuverture: dto.idaOuverture ?? null,
      idaCloture: dto.idaCloture ?? null,
      idpOuverture: dto.idpOuverture ?? null,
      idpCloture: dto.idpCloture ?? null,
      justificationIda: dto.justificationIda?.trim() || null,
      ecartConversionActifN1: dto.ecartConversionActifN1 ?? null,
      ecartConversionPassifN1: dto.ecartConversionPassifN1 ?? null,
    };
    if (dto.entiteId) {
      const e = await this.prisma.entitePerimetreConsolidation.findFirst({ where: { id: dto.entiteId, tenantId, exerciceId: ex.id }, select: { id: true } });
      if (!e) throw new NotFoundException('Entité introuvable dans ce périmètre.');
      return this.prisma.entitePerimetreConsolidation.update({ where: { id: e.id }, data });
    }
    const faits = await this.prisma.faitsConsolidationExercice.findFirst({ where: { tenantId, exerciceId: ex.id }, select: { id: true } });
    return faits
      ? this.prisma.faitsConsolidationExercice.update({ where: { id: faits.id }, data })
      : this.prisma.faitsConsolidationExercice.create({ data: { tenantId, exerciceId: ex.id, ...data } });
  }

  /**
   * La monnaie de la balance d'une entité, et ce qu'il faut pour la convertir
   * (tranche 4c). La consolidante n'en a pas · ses états sont dans la monnaie
   * de présentation. Refus à la porte · une monnaie étrangère sans les
   * facteurs qui en font la monnaie fonctionnelle (D4C ch. XII-4 § 1).
   */
  async enregistrerMonnaie(tenantId: string, entiteId: string, dto: MonnaieEntiteDto) {
    const e = await this.prisma.entitePerimetreConsolidation.findFirst({ where: { id: entiteId, tenantId }, select: { id: true } });
    if (!e) throw new NotFoundException('Entité introuvable dans ce dossier.');
    const presentation = await this.monnaiePresentation(tenantId);
    const monnaie = dto.monnaieBalance?.trim().toUpperCase() || null;
    if (monnaie && monnaie !== presentation && !dto.justificationMonnaie?.trim()) {
      throw new BadRequestException(
        `Une balance en ${monnaie} quand les états sont présentés en ${presentation} · dites ce qui en fait la monnaie FONCTIONNELLE de l’entité ` +
          '(monnaie des prix de vente, des coûts, du financement, D4C ch. XII-4 § 1). Une comptabilité tenue dans une autre monnaie se convertit ' +
          'd’abord par la méthode temporelle (§ 2), avant l’import.',
      );
    }
    for (const [k, v] of [['cours de clôture', dto.coursCloture], ['cours des charges et produits', dto.coursProduitsCharges], ['cours d’entrée', dto.coursEntree]] as const) {
      if (v != null && !(v > 0)) throw new BadRequestException(`Le ${k} se déclare strictement positif.`);
    }
    return this.prisma.entitePerimetreConsolidation.update({
      where: { id: e.id },
      data: {
        monnaieBalance: monnaie,
        justificationMonnaie: dto.justificationMonnaie?.trim() || null,
        hyperinflation: dto.hyperinflation ?? false,
        coursCloture: dto.coursCloture ?? null,
        coursProduitsCharges: dto.coursProduitsCharges ?? null,
        coursEntree: dto.coursEntree ?? null,
        capitauxPropresHistoriques: dto.capitauxPropresHistoriques ?? null,
      },
    });
  }

  /** La monnaie des états consolidés · celle de tenue de la consolidante, « unité monétaire ayant cours légal » (art. 87). */
  private async monnaiePresentation(tenantId: string) {
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { devise: true } });
    return (t.devise ?? 'CDF').trim().toUpperCase();
  }

  async supprimerReciproque(tenantId: string, id: string) {
    const o = await this.prisma.operationReciproqueConsolidation.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!o) throw new NotFoundException('Opération réciproque introuvable dans ce dossier.');
    await this.prisma.operationReciproqueConsolidation.delete({ where: { id } });
    return { supprime: true };
  }

  /**
   * Les comptes propres de la consolidante, tels que ses états individuels les
   * lisent · le tableau des flux consolidé y prend ses opérations avec SES
   * actionnaires (capital, prélèvements, dividendes), qu'aucune clé du cumul ne
   * sépare des mêmes opérations des filiales.
   */
  async lignesConsolidante(tenantId: string, exerciceId: string | null): Promise<LigneBalancePourEtat[]> {
    return chargerLignes(this.ecritures, tenantId, exerciceId);
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
    // `false` · le livre-journal seul, comme les états individuels
    // (`chargerLignes`). Un état consolidé bâti sur le brouillard de la
    // consolidante n'engagerait personne, et le tableau des flux, qui relit ses
    // comptes propres par `lignesConsolidante`, ne bouclerait plus avec lui.
    const balanceDossier = await this.ecritures.balance(tenantId, exerciceId, false);

    const entites: EntiteACumuler[] = retenus.map((r) => {
      const balance = r.estConsolidante
        ? balanceDossier.lignes.map((l) => ({
            numero: l.numero,
            intitule: l.intitule,
            solde: Number(l.solde),
            mouvementDebit: n(l.mouvementDebit),
            mouvementCredit: n(l.mouvementCredit),
          }))
        : lignesImportees
            .filter((l) => l.entiteId === r.id)
            .map((l) => ({
              numero: l.numero,
              intitule: l.intitule,
              solde: Number(l.solde),
              mouvementDebit: n(l.mouvementDebit),
              mouvementCredit: n(l.mouvementCredit),
            }));
      return {
        id: r.id,
        nom: r.nom,
        estConsolidante: r.estConsolidante,
        methode: r.estConsolidante ? 'IG' : (r.methode as 'IG' | 'IP' | 'ME'),
        pctInteret: r.pctInteret,
        balance: balance.length > 0 ? balance : null,
      };
    });

    const ecartsStockes = await this.prisma.ecartEvaluationConsolidation.findMany({ where: { tenantId, exerciceId } });
    const acquisitions: AcquisitionDeclaree[] = liensUtiles.map((l) => {
      const b = parLien.get(l.id)!;
      return {
        ecartsEvaluation: ecartsStockes
          .filter((e) => e.lienId === l.id)
          .map((e) => ({
            compte: e.compte,
            compteAmortissement: e.compteAmortissement,
            libelle: e.libelle,
            montant: Number(e.montant),
            mode: e.mode,
            dureeAnnees: e.dureeAnnees,
            dateRealisation: e.dateRealisation,
          })),
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

    const internes = await this.prisma.resultatInterneConsolidation.findMany({ where: { tenantId, exerciceId } });
    const resultatsInternes: ResultatInterne[] = internes.map((o) => ({
      vendeuseId: versMoteur(o.vendeuseId),
      acheteuseId: versMoteur(o.acheteuseId),
      nature: o.nature,
      compteActif: o.compteActif,
      margeOuverture: Number(o.margeOuverture),
      margeCloture: Number(o.margeCloture),
      libelle: o.libelle,
    }));

    // Fiscalité · la consolidante la tient dans les faits de l'exercice, les
    // autres entités sur leur ligne. `n` rend null pour null · jamais zéro.
    const fisc = (id: string, f: Record<string, unknown> | null | undefined): FiscaliteEntite => ({
      entiteId: id,
      tauxImpot: n(f?.tauxImpotDiffere),
      idaOuverture: n(f?.idaOuverture),
      idaCloture: n(f?.idaCloture),
      idpOuverture: n(f?.idpOuverture),
      idpCloture: n(f?.idpCloture),
      justificationIda: (f?.justificationIda as string | null | undefined) ?? null,
    });
    const fiscalites: FiscaliteEntite[] = [
      fisc(consolidanteId, etat.faits as Record<string, unknown> | null),
      ...etat.entites.map((e) => fisc(e.id, e as unknown as Record<string, unknown>)),
    ];

    // Écarts de conversion individuels · retraités pour les seules entités qui
    // ont déclaré leur position N-1 (478 ET 479, zéro compris).
    const provisionsChange = await this.prisma.provisionChangeConsolidation.findMany({ where: { tenantId, exerciceId } });
    const declarationConversion = (id: string, stockId: string | null, f: Record<string, unknown> | null | undefined): ConversionIndividuelle | null => {
      const actif = n(f?.ecartConversionActifN1);
      const passif = n(f?.ecartConversionPassifN1);
      if (actif === null || passif === null) return null;
      return {
        entiteId: id,
        actifN1: actif,
        passifN1: passif,
        provisions: provisionsChange
          .filter((p) => p.entiteId === stockId)
          .map((p) => ({ compteProvision: p.compteProvision, cloture: Number(p.cloture), dotation: Number(p.dotation), reprise: Number(p.reprise) })),
      };
    };
    const conversions = [
      declarationConversion(consolidanteId, null, etat.faits as Record<string, unknown> | null),
      ...etat.entites.map((e) => declarationConversion(e.id, e.id, e as unknown as Record<string, unknown>)),
    ].filter((c): c is ConversionIndividuelle => c !== null);

    const presentation = await this.monnaiePresentation(tenantId);
    const monnaies: MonnaieEntite[] = etat.entites.map((e) => ({
      entiteId: e.id,
      monnaie: e.monnaieBalance,
      hyperinflation: e.hyperinflation,
      coursCloture: n(e.coursCloture),
      coursProduitsCharges: n(e.coursProduitsCharges),
      coursEntree: n(e.coursEntree),
      capitauxPropresHistoriques: n(e.capitauxPropresHistoriques),
    }));

    try {
      return {
        ...cumulerConsolidation(
          { dateDebut: ex!.dateDebut, dateFin: ex!.dateFin },
          entites,
          acquisitions,
          reciproques,
          resultatsInternes,
          fiscalites,
          conversions,
          { presentation, entites: monnaies },
        ),
        reserves: [
          'Les balances des filiales sont réputées RETRAITÉES aux règles du groupe (D4C, ch. XII-3) · OmegaX ne fait ni l’homogénéisation ni les éliminations de nature fiscale.',
          'Écarts d’évaluation (art. 82, ch. XII-6) · DÉCLARÉS élément par élément, ils passent en priorité et l’écart d’acquisition n’est que le reste. Chacun porte son impôt différé, au taux déclaré de la détenue · jamais l’écart d’acquisition (ch. XII-3 § 3).',
          'Impôts différés (art. 92) · écarts d’évaluation, marges internes éliminées (au taux de la vendeuse) et impôts différés DÉCLARÉS des comptes individuels. Actif et passif ne sont pas compensés, le D4C n’en disant rien, et aucune actualisation n’est faite (ch. XII-3 § 3).',
          'Éliminations de nature fiscale (art. 86, 3°, D4C ch. XII-3 § 2) · provisions réglementées (15) contre-passées, l’exercice au résultat (851 et 861) et l’antérieur aux réserves, avec leur impôt différé passif. Écarts de conversion individuels (478, 479) retraités sur DÉCLARATION de la position N-1 et de la provision pour pertes de change · leur impôt différé éventuel se déclare avec ceux de l’entité. Les subventions d’investissement restent sur leur ligne, hors capitaux propres (ch. XII-8 § 2).',
          'Résultats internes inclus dans les stocks et immobilisations (art. 86, 4°) · éliminés sur DÉCLARATION de la marge, totalement entre entités intégrées globalement, au produit des pourcentages avec une entité intégrée proportionnellement (D4C ch. XII-5). Le texte ne dit pas qui la supporte · OmegaX retraite le résultat de la VENDEUSE, qui se partage à son pourcentage d’intérêt (art. 85, résultat consolidé bâti des éléments du résultat de chaque entité). Une marge d’incidence négligeable peut ne pas être déclarée (art. 86, dernier alinéa).',
          `Conversion des entités étrangères (art. 87, D4C ch. XII-4 § 3) · méthode du COURS DE CLÔTURE vers la monnaie de présentation (${presentation}), aux cours DÉCLARÉS · actifs et passifs au cours de clôture, charges et produits au cours déclaré pour eux, capitaux propres au cours historique déclaré en montant. L’écart se partage au pourcentage d’intérêt et reste sur sa ligne. La balance importée doit être dans la monnaie FONCTIONNELLE · la méthode temporelle (§ 2) et le retraitement d’une monnaie hyperinflationniste (§ 4) ne sont pas joués. Les montants déclarés ailleurs (coût et capitaux propres d’entrée, marges internes, impôts différés, 478 et 479, opérations réciproques) le sont en monnaie de présentation.`,
          'Amortissement de l’écart · prorata au mois, du premier jour du mois d’entrée, convention reprise du module des immobilisations · le D4C dit « linéairement » sans fixer de prorata.',
        ],
      };
    } catch (e) {
      if (e instanceof RefusConsolidation) throw new BadRequestException(e.message);
      throw e;
    }
  }
}
