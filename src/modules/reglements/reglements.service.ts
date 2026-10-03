import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { StatutLettrage, TypeJournal } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { LettrageService } from '../lettrage/lettrage.service';
import { refuserSiLignesFigees } from '../exercice/gel-cloture';
import { EnregistrerReglementsDto, PasserEcartChangeDto, type ReglementTiersDto } from './reglements.dto';
import { contrevaleurAdmise } from '../comptabilite/ligne-en-devise';
import { MONNAIE_DE_TENUE } from '../../common/monnaie-de-tenue';
import {
  coursEtFrancsDuReglement,
  coutHistoriqueRegle,
  ecartSigne,
  libelleEcartRealise,
  motifRefusTresorerieEnDevise,
  lignesDuReglementEnDevise,
  lignesEcartDuGroupe,
  natureDuCompte,
  type Referentiel,
} from './ecart-change-realise';
import { compteDeLEcart, referentielDuDossier } from './compte-ecart-change';
import { avertissementExtourneManquante, issueReevaluationDejaPassee, motifReglementDejaReevalue } from './reevaluation-et-ecart-realise';
import { OrdresVirementService, type LigneAOrdonner } from './ordres-virement.service';
import {
  estEcheanceAReglerSur,
  lignesDuReglement,
  montantDu,
  motifRefusMontant,
  type SensReglement,
} from './reglement-tiers';

/**
 * RÈGLEMENT DES TIERS · voir reglement-tiers.ts pour les règles et leurs
 * sources. Ce service lit les échéances ouvertes, passe UNE pièce de
 * trésorerie par tiers, et LETTRE aussitôt la facture et son règlement.
 *
 * Le lettrage est posé par la même action, et ce n'est pas une présomption
 * comme celle du lettrage automatique · le comptable a CHOISI les factures
 * qu'il paie, et le règlement a été calculé sur elles. D'où l'origine
 * MANUEL, qui dit qu'un humain a apparié ces lignes.
 */
@Injectable()
export class ReglementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritures: EcritureService,
    private readonly lettrage: LettrageService,
    private readonly ordres: OrdresVirementService,
  ) {}

  /**
   * ÉCHÉANCES OUVERTES de l'exercice, dues au plus tard à `jusquau`. Une
   * ligne sans échéance est due à sa date d'écriture, la même lecture que
   * l'échéancier et la balance âgée. Seules les lignes JAMAIS lettrées sont
   * rendues · un groupe partiel se complète depuis l'interrogation et
   * lettrage, qui connaît son reste à solder.
   */
  async echeances(tenantId: string, exerciceId: string, sens: SensReglement, jusquau?: string) {
    const exercice = await this.prisma.exercice.findFirst({ where: { id: exerciceId, tenantId } });
    if (!exercice) throw new NotFoundException('Exercice introuvable pour ce dossier.');
    const limite = jusquau ? new Date(jusquau) : null;
    const lignes = await this.prisma.ligneEcriture.findMany({
      where: {
        ecriture: { tenantId, exerciceId },
        lettrageId: null,
        compte: { tenantId, numero: { startsWith: sens === 'FOURNISSEUR' ? '40' : '41' } },
        ...(sens === 'FOURNISSEUR' ? { credit: { gt: 0 } } : { debit: { gt: 0 } }),
      },
      include: {
        ecriture: { select: { date: true, libelle: true, reference: true, numeroPiece: true, journal: { select: { code: true } } } },
        compte: { select: { id: true, numero: true, intitule: true, tiersCompte: { select: { tiers: { select: { nom: true, code: true } } } } } },
        devise: { select: { code: true } },
      },
      orderBy: [{ compteId: 'asc' }, { ecriture: { date: 'asc' } }],
    });

    const retenues = lignes
      .filter((l) => estEcheanceAReglerSur(l.compte.numero, sens))
      .map((l) => ({
        id: l.id,
        compteId: l.compteId,
        echeance: l.dateEcheance ?? l.ecriture.date,
        date: l.ecriture.date,
        journalCode: l.ecriture.journal.code,
        numeroPiece: l.ecriture.numeroPiece,
        reference: l.ecriture.reference,
        libelle: l.libelle ?? l.ecriture.libelle,
        montant: montantDu({ debit: Number(l.debit), credit: Number(l.credit) }, sens),
        // La facture en devise se règle dans sa devise (ligne A6) · l'écran
        // demande alors le montant en devise et le cours du jour.
        deviseId: l.deviseId ?? null,
        deviseCode: l.devise?.code ?? null,
        montantDevise: l.montantDevise === null || l.montantDevise === undefined ? null : Number(l.montantDevise),
        coursApplique: l.coursApplique === null || l.coursApplique === undefined ? null : Number(l.coursApplique),
      }))
      .filter((l) => !limite || l.echeance.getTime() <= limite.getTime());

    const parCompte = new Map<string, { compteId: string; numero: string; intitule: string; tiers: string | null; lignes: typeof retenues }>();
    for (const l of retenues) {
      const c = lignes.find((x) => x.id === l.id)!.compte;
      if (!parCompte.has(c.id)) {
        parCompte.set(c.id, {
          compteId: c.id,
          numero: c.numero,
          intitule: c.intitule,
          tiers: c.tiersCompte ? `${c.tiersCompte.tiers.code} · ${c.tiersCompte.tiers.nom}` : null,
          lignes: [],
        });
      }
      parCompte.get(c.id)!.lignes.push(l);
    }
    return [...parCompte.values()];
  }

  /**
   * ENREGISTRE les règlements · une pièce par tiers, au journal de trésorerie
   * choisi, puis le lettrage. Tout est VÉRIFIÉ avant la première écriture ·
   * un lot de dix règlements ne doit pas s'arrêter au sixième en laissant
   * cinq pièces passées et cinq non.
   */
  async enregistrer(tenantId: string, userId: string, dto: EnregistrerReglementsDto, email: string = userId) {
    const journal = await this.prisma.journal.findFirst({ where: { id: dto.journalId, tenantId } });
    if (!journal) throw new NotFoundException('Journal introuvable pour ce dossier.');
    if (journal.type !== TypeJournal.TRESORERIE || !journal.compteTresorerieId) {
      throw new BadRequestException(
        `Le journal ${journal.code} n'est pas un journal de trésorerie rattaché à un compte de banque ou de caisse · ` +
          'un règlement se passe au journal du moyen de paiement.',
      );
    }
    const compteTresorerieId = journal.compteTresorerieId;

    const idsComptes = dto.reglements.map((r) => r.compteId);
    if (new Set(idsComptes).size !== idsComptes.length) {
      throw new BadRequestException('Un même tiers figure deux fois · ses factures se règlent en une seule pièce.');
    }
    const toutesLignes = dto.reglements.flatMap((r) => r.ligneIds);
    if (new Set(toutesLignes).size !== toutesLignes.length) {
      throw new BadRequestException('Une même facture figure dans deux règlements.');
    }

    const lignes = await this.prisma.ligneEcriture.findMany({
      where: { id: { in: toutesLignes }, ecriture: { tenantId } },
      include: {
        compte: {
          select: { numero: true, intitule: true, lettrable: true, tiersCompte: { select: { tiers: { select: { nom: true } } } } },
        },
        ecriture: { select: { exerciceId: true, date: true } },
      },
    });
    if (lignes.length !== toutesLignes.length) {
      throw new NotFoundException('Une ou plusieurs factures sont introuvables.');
    }

    const plan = dto.reglements.map((r) => {
      const siennes = lignes.filter((l) => r.ligneIds.includes(l.id));
      for (const l of siennes) {
        if (l.compteId !== r.compteId) {
          throw new BadRequestException('Toutes les factures d\'un règlement doivent être sur le compte du tiers réglé.');
        }
        if (!estEcheanceAReglerSur(l.compte.numero, dto.sens)) {
          throw new BadRequestException(`Le compte ${l.compte.numero} ne porte pas d'échéance à régler dans ce sens.`);
        }
        if (l.lettrageId) {
          throw new BadRequestException(`Une facture du compte ${l.compte.numero} est déjà lettrée · elle n'est plus due.`);
        }
        // LE LETTRAGE SE VÉRIFIE AVEC LE RESTE (audit final F56) · refusé
        // après la pièce, il laissait un règlement passé et des factures
        // encore dues, qu'un second clic payait deux fois.
        if (!l.compte.lettrable) {
          throw new BadRequestException(
            `Le compte ${l.compte.numero} n'est pas déclaré lettrable · le règlement lettre ses factures. ` +
              'Ouvrez-le au lettrage depuis le plan comptable avant de régler.',
          );
        }
        if (l.ecriture.exerciceId !== dto.exerciceId) {
          throw new BadRequestException('Les factures réglées doivent appartenir à l\'exercice du règlement.');
        }
      }
      const du = Math.round(siennes.reduce((s, l) => s + montantDu({ debit: Number(l.debit), credit: Number(l.credit) }, dto.sens), 0) * 100) / 100;
      if (!(du > 0)) {
        throw new BadRequestException(`Rien n'est dû sur les factures choisies du compte ${siennes[0].compte.numero}.`);
      }
      return { r, compte: siennes[0].compte, siennes, du };
    });

    // LES RÈGLEMENTS EN DEVISE (ligne A6) se préparent ICI, avec le reste ·
    // cours, dû en devise et compte d'écart sont vérifiés avant la première
    // pièce, comme tout le lot.
    let referentiel: Referentiel | null = null;
    const prepares: Array<{ r: ReglementTiersDto; compte: (typeof plan)[number]['compte']; du: number; montant: number; enDevise: ReglementEnDevise | null }> = [];
    for (const p of plan) {
      const numero = p.compte.numero;
      if (!p.siennes.some((l) => (l.deviseId ?? null) !== null)) {
        if (p.r.montantDevise !== undefined || p.r.coursReglement !== undefined || p.r.compteEcartChangeId !== undefined) {
          throw new BadRequestException(
            `${numero} · les factures choisies sont en francs · ni montant en devise, ni cours, ni compte d'écart de change.`,
          );
        }
        // `undefined` seul vaut « le dû entier » · un `null` venu d'un appelant
        // qui aurait sauté le DTO tombe sous le refus du montant (A6 bis, B1).
        const montant = p.r.montant === undefined ? p.du : p.r.montant;
        const refus = motifRefusMontant(montant, p.du);
        if (refus) throw new BadRequestException(`${numero} · ${refus}`);
        prepares.push({ r: p.r, compte: p.compte, du: p.du, montant, enDevise: null });
        continue;
      }
      if (referentiel === null) referentiel = await referentielDuDossier(this.prisma, tenantId);
      const enDevise = await this.preparerEnDevise(tenantId, referentiel, dto.sens, p.r, numero, p.siennes);
      prepares.push({ r: p.r, compte: p.compte, du: p.du, montant: enDevise.francsPayes, enDevise });
    }

    // LA DEVISE DU MOYEN DE PAIEMENT (ligne A6) · déclarée, jamais prise sur
    // la facture, et confrontée au lot et au RIB du journal avant la
    // première pièce (`motifRefusTresorerieEnDevise`).
    const lotEnDevise = prepares.some((x) => x.enDevise !== null);
    if (dto.tresorerieEnDevise === true || dto.deviseTresorerieId !== undefined || lotEnDevise) {
      const idsDevises = [
        ...new Set([...prepares.flatMap((x) => (x.enDevise ? [x.enDevise.deviseId] : [])), ...(dto.deviseTresorerieId ? [dto.deviseTresorerieId] : [])]),
      ];
      const devisesLues = idsDevises.length
        ? await this.prisma.devise.findMany({ where: { tenantId, id: { in: idsDevises } }, select: { id: true, code: true } })
        : [];
      const code = (id: string) => devisesLues.find((d) => d.id === id)?.code ?? '?';
      if (dto.deviseTresorerieId !== undefined && !devisesLues.some((d) => d.id === dto.deviseTresorerieId)) {
        throw new NotFoundException('Devise du moyen de paiement introuvable pour ce dossier.');
      }
      if (dto.deviseTresorerieId !== undefined && dto.tresorerieEnDevise !== true) {
        throw new BadRequestException('Une devise de moyen de paiement ne se déclare qu’avec « Moyen de paiement en devise ».');
      }
      const rib = await this.prisma.ribBanque.findFirst({ where: { tenantId, journalId: journal.id }, select: { devise: true } });
      const motif = motifRefusTresorerieEnDevise({
        tresorerieEnDevise: dto.tresorerieEnDevise === true,
        devisesDuLot: prepares.map((x) => (x.enDevise ? { id: x.enDevise.deviseId, code: code(x.enDevise.deviseId) } : null)),
        deviseTresorerie: dto.deviseTresorerieId ? { id: dto.deviseTresorerieId, code: code(dto.deviseTresorerieId) } : null,
        deviseRib: rib?.devise ?? null,
        monnaieDeTenue: MONNAIE_DE_TENUE,
        journalCode: journal.code,
      });
      if (motif) throw new BadRequestException(motif);
    }

    // UNE FACTURE DÉJÀ RÉÉVALUÉE NE SE RÈGLE PAS EN PASSANT SON RÉALISÉ
    // (relecture adverse, bloquant 1) · la réévaluation de l'exercice qui l'a
    // lue a porté son écart au 478 et en provision ; le 656 du règlement
    // recompterait la perte. Refus avant la première pièce.
    const avertissements: string[] = [];
    for (const x of prepares) {
      if (!x.enDevise) continue;
      const motif = await motifReglementDejaReevalue(this.prisma, {
        tenantId,
        exerciceId: dto.exerciceId,
        compteId: x.r.compteId,
        compteNumero: x.compte.numero,
        ligneIds: x.r.ligneIds,
      });
      if (motif) throw new ConflictException(motif);
      const avertissement = await avertissementExtourneManquante(this.prisma, {
        tenantId,
        exerciceId: dto.exerciceId,
        compteId: x.r.compteId,
        compteNumero: x.compte.numero,
        ligneIds: x.r.ligneIds,
      });
      if (avertissement) avertissements.push(avertissement);
    }

    // Le lettrage vient APRÈS la pièce · une facture figée par une clôture
    // (exercice/gel-cloture.ts) le ferait refuser une fois la pièce passée.
    // Vérifiée ici, avec le reste, avant la première écriture.
    await refuserSiLignesFigees(this.prisma, tenantId, toutesLignes, 'régler');

    // L'ORDRE DE VIREMENT se prépare ICI, avec le reste · un tiers sans RIB
    // découvert après la cinquième pièce laisserait cinq règlements passés
    // sans l'ordre qui devait les exécuter. Un virement PAIE un fournisseur ·
    // l'encaissement d'un client ne s'ordonne pas à sa banque.
    let preparation = null;
    if (dto.ordreVirement) {
      if (dto.sens !== 'FOURNISSEUR') {
        throw new BadRequestException("Un ordre de virement paie un fournisseur · l'encaissement d'un client ne s'ordonne pas.");
      }
      preparation = await this.ordres.preparer(tenantId, dto.journalId, idsComptes);
    }

    const resultats = [];
    const aOrdonner: LigneAOrdonner[] = [];
    for (const { r, compte, du, montant, enDevise } of prepares) {
      const libelle = `Règlement ${compte.tiersCompte?.tiers.nom ?? compte.intitule}`.slice(0, 190);
      const ecriture = await this.ecritures.creer(tenantId, userId, {
        exerciceId: dto.exerciceId,
        journalId: dto.journalId,
        date: dto.date,
        libelle,
        reference: r.reference || undefined,
        lignes: enDevise
          ? lignesDuReglementEnDevise({
              sens: dto.sens,
              compteTiersId: r.compteId,
              compteTresorerieId,
              compteEcartId: enDevise.compteEcartId,
              historique: enDevise.historique,
              francsPayes: enDevise.francsPayes,
              deviseId: enDevise.deviseId,
              montantDevise: enDevise.montantDevise,
              coursReglement: enDevise.coursReglement,
              tresorerieEnDevise: dto.tresorerieEnDevise === true,
              libelle,
            })
          : lignesDuReglement({ sens: dto.sens, compteTiersId: r.compteId, compteTresorerieId, montant, libelle }),
      });
      const ligneTiers = ecriture.lignes.find((l) => l.compteId === r.compteId)!;
      // En devise, le partiel se lit DANS LA DEVISE · la contrevaleur payée au
      // cours du jour peut dépasser le dû en francs sans solder la facture.
      const partiel = enDevise ? enDevise.partiel : Math.round(montant * 100) < Math.round(du * 100);
      // Un lettrage refusé malgré tout (une facture lettrée entre-temps par un
      // autre clic) retire la pièce qu'il devait accompagner · jamais un
      // règlement sans le lettrage qui dit ce qu'il a payé (audit final F56).
      let lettre: Awaited<ReturnType<LettrageService['lettrerManuel']>>;
      try {
        lettre = await this.lettrage.lettrerManuel(tenantId, r.compteId, [...r.ligneIds, ligneTiers.id], userId, {
          autoriserPartiel: partiel,
          // Le tiers est soldé au coût historique · l'écart réalisé est sur
          // sa propre ligne, hors du compte du tiers, et le groupe le garde,
          // partiel compris · le solde passé ensuite s'y AJOUTE, et le groupe
          // soldé porte le réalisé TOTAL (42 000 + 123 200 au séminaire).
          ...(enDevise ? { ecartChangeRealise: enDevise.ecart } : {}),
        });
      } catch (e) {
        await this.ecritures.retirerCompensation(tenantId, ecriture.id);
        throw e;
      }
      resultats.push({
        compte: compte.numero,
        ecritureId: ecriture.id,
        montant,
        partiel,
        lettre: lettre.lettre,
        ...(enDevise ? { montantDevise: enDevise.montantDevise, ecartChange: enDevise.ecart } : {}),
      });
      aOrdonner.push({
        compteId: r.compteId,
        montant,
        reference: r.reference || null,
        ecritureId: ecriture.id,
        pieceReglement: [journal.code, ecriture.numeroPiece].filter((v) => v !== null && v !== undefined).join(' '),
      });
    }
    const ordre = preparation
      ? await this.ordres.creer(tenantId, email, dto.journalId, dto.date, preparation, aOrdonner)
      : null;
    return { reglements: resultats, ordre, avertissements };
  }

  /**
   * UN RÈGLEMENT EN DEVISE, vérifié et chiffré avant toute pièce (ligne A6,
   * règles dans ecart-change-realise.ts). Une seule devise, des factures
   * toutes en devise et toutes dans le sens de l'échéance, le cours du jour
   * du règlement fourni, jamais plus que le dû DANS LA DEVISE.
   */
  private async preparerEnDevise(
    tenantId: string,
    referentiel: Referentiel,
    sens: SensReglement,
    r: ReglementTiersDto,
    numero: string,
    siennes: Array<{ id: string; debit: unknown; credit: unknown; deviseId?: string | null; montantDevise?: unknown; ecriture: { date?: Date } }>,
  ): Promise<ReglementEnDevise> {
    if (siennes.some((l) => (l.deviseId ?? null) === null)) {
      throw new BadRequestException(
        `${numero} · des factures en francs et des factures en devise ne se règlent pas dans la même pièce · réglez-les séparément.`,
      );
    }
    const devises = new Set(siennes.map((l) => l.deviseId));
    if (devises.size !== 1) {
      throw new BadRequestException(`${numero} · les factures choisies sont en plusieurs devises · une pièce par devise.`);
    }
    const factures = siennes.map((l) => ({
      id: l.id,
      francs: montantDu({ debit: Number(l.debit), credit: Number(l.credit) }, sens),
      montantDevise: Number(l.montantDevise),
      date: l.ecriture.date ?? new Date(0),
    }));
    if (factures.some((f) => !(f.francs > 0) || !(f.montantDevise > 0))) {
      throw new BadRequestException(
        `${numero} · un avoir en devise ne se règle pas ici · lettrez-le avec sa facture depuis Interrogation et lettrage.`,
      );
    }
    // DES FRANCS SANS LEUR DEVISE NE DISENT PAS CE QUI EST RÉGLÉ (relecture
    // adverse, mineur 2) · le dû entier en devise serait présumé, et un
    // acompte en francs solderait la facture avec un gain absurde.
    if (r.montant !== undefined && r.montantDevise === undefined) {
      throw new BadRequestException(
        `${numero} · le montant payé en francs ne dit pas ce qu'il règle d'une facture en devise · saisissez aussi le montant réglé en devise.`,
      );
    }
    const duDevise = Math.round(factures.reduce((s, f) => s + f.montantDevise, 0) * 100) / 100;
    const montantDevise = r.montantDevise === undefined ? duDevise : r.montantDevise;
    if (Math.round(montantDevise * 100) > Math.round(duDevise * 100)) {
      throw new BadRequestException(
        `${numero} · le montant réglé (${montantDevise.toFixed(2)}) dépasse le dû en devise des factures choisies ` +
          `(${duDevise.toFixed(2)}) · l'excédent est une avance ou un trop-perçu, à comptabiliser à part.`,
      );
    }
    // Le débit RÉEL saisi en francs prime, le cours s'en déduit · même règle
    // que toute ligne en devise (comptabilite/ligne-en-devise.ts).
    const lu = coursEtFrancsDuReglement({
      montantDevise,
      cours: r.coursReglement,
      francs: r.montant,
      tolerance: contrevaleurAdmise,
    });
    if ('motif' in lu) throw new BadRequestException(`${numero} · ${lu.motif}`);
    const francsPayes = lu.francs;
    const historique = coutHistoriqueRegle(factures, montantDevise);
    const ecart = ecartSigne(sens, historique, francsPayes);
    const compteEcart =
      ecart === 0
        ? null
        : await compteDeLEcart(this.prisma, {
            tenantId,
            referentiel,
            nature: natureDuCompte(numero, referentiel),
            ecart: ecart > 0 ? 'PERTE' : 'GAIN',
            choisiId: r.compteEcartChangeId,
          });
    return {
      deviseId: [...devises][0]!,
      montantDevise,
      coursReglement: lu.cours,
      francsPayes,
      historique,
      ecart,
      compteEcartId: compteEcart?.id ?? null,
      partiel: Math.round(montantDevise * 100) < Math.round(duDevise * 100),
    };
  }

  /**
   * PASSER L'ÉCART DE CHANGE d'un lettrage soldé dans sa devise et non en
   * francs (ligne A6) · la proposition est REJOUÉE ici depuis le groupe,
   * jamais reçue du client, puis la ligne du tiers complète le lettrage, qui
   * passe SOLDE. Rien n'est posté sans ce geste · le lettrage PROPOSE
   * (`LettrageService.propositionEcartChange`), le comptable confirme.
   */
  async passerEcartChange(tenantId: string, userId: string, dto: PasserEcartChangeDto) {
    const proposition = await this.lettrage.propositionEcartChange(tenantId, dto.lettrageId);
    if (proposition.ecart === null || proposition.ecart === 0) {
      throw new BadRequestException(proposition.motif ?? "Ce lettrage n'a aucun écart de change à passer.");
    }
    // LA DATE ET L'EXERCICE DU DÉNOUEMENT (ch. 22 § 2.3, « à la date
    // d'encaissement ou de règlement ») · l'écart appartient à l'exercice où
    // la position s'est dénouée, et ne se constate pas avant elle. Passé
    // ailleurs, le résultat d'un exercice porterait la perte d'un autre.
    if (dto.exerciceId !== proposition.exerciceId) {
      throw new BadRequestException(
        `L'écart de change de ce lettrage s'est réalisé dans l'exercice de son dernier règlement · passez-le dans cet exercice (AUDCIF, Titre VIII ch. 22 § 2.3).`,
      );
    }
    const dateDenouement = new Date(proposition.date!).toISOString().slice(0, 10);
    if (dto.date.slice(0, 10) < dateDenouement) {
      throw new BadRequestException(
        `L'écart de change se constate à la date du règlement qui dénoue la position, le ${dateDenouement}, ou après · ` +
          `pas le ${dto.date.slice(0, 10)} (AUDCIF, Titre VIII ch. 22 § 2.3).`,
      );
    }
    const journal = await this.prisma.journal.findFirst({ where: { id: dto.journalId, tenantId } });
    if (!journal) throw new NotFoundException('Journal introuvable pour ce dossier.');
    if (journal.type === TypeJournal.TRESORERIE) {
      throw new BadRequestException(
        `Le journal ${journal.code} est un journal de trésorerie · l'écart de change réalisé ne mouvemente aucune trésorerie, ` +
          "il se passe au journal des opérations diverses.",
      );
    }
    const referentiel = await referentielDuDossier(this.prisma, tenantId);
    const compteEcart = await compteDeLEcart(this.prisma, {
      tenantId,
      referentiel,
      nature: natureDuCompte(proposition.compteNumero, referentiel),
      ecart: proposition.ecart > 0 ? 'PERTE' : 'GAIN',
      choisiId: dto.compteEcartChangeId,
    });
    // PAS DEUX FOIS LA MÊME PERTE (relecture adverse B1) · une réévaluation
    // qui a déjà lu ces lignes les a portées au 478 ou 479 et en provision.
    // Refus seulement si la réévaluation concorde avec le groupe LU ;
    // inexplicable, l'écart passe avec un avertissement, jamais un faux 409.
    const dejaReevalue = await issueReevaluationDejaPassee(this.prisma, {
      tenantId,
      exerciceId: proposition.exerciceId!,
      compteId: proposition.compteId,
      compteNumero: proposition.compteNumero,
      lettrageId: dto.lettrageId,
    });
    if (dejaReevalue && 'refus' in dejaReevalue) throw new ConflictException(dejaReevalue.refus);
    // L'à-nouveau du groupe, si la réévaluation de l'exercice précédent n'a
    // pas été contre-passée (cinquième relecture, M-C) · un avertissement.
    const lignesDuGroupe = await this.prisma.ligneEcriture.findMany({
      where: { lettrageId: dto.lettrageId, ecriture: { tenantId } },
      select: { id: true },
    });
    const extourne = await avertissementExtourneManquante(this.prisma, {
      tenantId,
      exerciceId: proposition.exerciceId!,
      compteId: proposition.compteId,
      compteNumero: proposition.compteNumero,
      ligneIds: lignesDuGroupe.map((l) => l.id),
    });
    const avertissement =
      [dejaReevalue && 'avertissement' in dejaReevalue ? dejaReevalue.avertissement : null, extourne].filter((x): x is string => x !== null).join(' ') ||
      null;
    const libelle = `${libelleEcartRealise(proposition.ecart)} · ${proposition.compteNumero} ${proposition.code}`;
    const ecriture = await this.ecritures.creer(tenantId, userId, {
      exerciceId: dto.exerciceId,
      journalId: dto.journalId,
      date: dto.date,
      libelle,
      lignes: lignesEcartDuGroupe({
        compteTiersId: proposition.compteId,
        compteEcartId: compteEcart.id,
        ecart: proposition.ecart,
        libelle,
      }),
    });
    const ligneTiers = ecriture.lignes.find((l) => l.compteId === proposition.compteId)!;
    let lettre: Awaited<ReturnType<LettrageService['completer']>>;
    try {
      lettre = await this.lettrage.completer(tenantId, dto.lettrageId, [ligneTiers.id]);
    } catch (e) {
      await this.ecritures.retirerCompensation(tenantId, ecriture.id);
      throw e;
    }
    // L'ÉCART SOLDE LE GROUPE, OU IL N'EST PAS PASSÉ · un groupe resté
    // partiel (une ligne ajoutée ou retirée entre la proposition et le clic)
    // garderait un écart passé sur une position qui n'est plus celle mesurée.
    if (lettre.statut !== StatutLettrage.SOLDE) {
      // Le groupe reprend son reste SANS la ligne retirée, dans la même
      // transaction que le retrait de la pièce.
      await this.ecritures.retirerCompensation(tenantId, ecriture.id, async (tx) => {
        await tx.ligneEcriture.updateMany({ where: { ecritureId: ecriture.id }, data: { lettrageId: null } });
        const restes = await tx.ligneEcriture.findMany({ where: { lettrageId: dto.lettrageId }, select: { debit: true, credit: true } });
        const reste = Math.round(restes.reduce((t, l) => t + Number(l.debit) - Number(l.credit), 0) * 100) / 100;
        await tx.lettrage.updateMany({ where: { id: dto.lettrageId, tenantId }, data: { solde: reste } });
      });
      throw new ConflictException(
        `Le lettrage ${proposition.code} n'est pas soldé par cet écart (reste ${Number(lettre.solde).toFixed(2)}) · ` +
          "il a changé depuis la proposition. Relisez l'écart proposé.",
      );
    }
    return {
      ecritureId: ecriture.id,
      ecart: proposition.ecart,
      compte: compteEcart.numero,
      lettre: lettre.lettre,
      statut: lettre.statut,
      avertissement,
    };
  }
}

/** Ce que le règlement en devise a vérifié et chiffré avant la pièce. */
interface ReglementEnDevise {
  deviseId: string;
  montantDevise: number;
  coursReglement: number;
  francsPayes: number;
  historique: number;
  /** Signé · positif pour une perte, négatif pour un gain. */
  ecart: number;
  compteEcartId: string | null;
  partiel: boolean;
}
