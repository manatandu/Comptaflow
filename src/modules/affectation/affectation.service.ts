import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  FormeJuridiqueSyscohada,
  Prisma,
  Referentiel,
  StatutEcriture,
  StatutExercice,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { EnregistrerAffectationDto } from './dto/affectation.dto';
import { REGLES, dotationReserveLegale, racineCapital } from './regles-affectation';

const EPSILON = 0.005;

/**
 * AFFECTATION DU RÉSULTAT · le geste qui manquait.
 *
 * La clôture solde les classes 6, 7 et 8 sur le compte 13, puis reporte les
 * comptes de bilan dans l'exercice suivant. Le compte 13, lui, restait plein.
 * Rien ne le vidait, et il s'empilait : au bout de trois exercices, les fonds
 * propres du bilan portaient trois résultats côte à côte au lieu d'un résultat
 * et de deux reports. Le TOTAL restait juste · sa décomposition, non, et c'est
 * elle que lit un bailleur.
 *
 * ── OÙ L'ÉCRITURE SE PASSE, ET POURQUOI PAS AILLEURS ─────────────────────────
 *
 * « L'affectation du résultat d'un exercice est décidée par les organes
 * compétents AU COURS DE L'EXERCICE SUIVANT » (AUDCIF, Titre VII, COMPTE 13).
 * L'écriture appartient donc à l'exercice suivant, à la date de la décision ·
 * et c'est aussi la seule place matériellement possible, un exercice clôturé
 * n'acceptant plus d'écriture (EcritureService.creer le refuse).
 *
 * ── QUEL MONTANT AFFECTER ────────────────────────────────────────────────────
 *
 * Le résultat PROPRE de l'exercice clos, et lui seul · c'est-à-dire le
 * MOUVEMENT du compte 131 ou 139 sur cet exercice, jamais son solde.
 *
 * La distinction n'est pas théorique, elle est la conséquence directe du
 * défaut que ce module répare : quand l'exercice précédent n'a pas été affecté
 * (le cas de tous les dossiers existants), son résultat a été reporté à
 * l'ouverture et le SOLDE du 131 vaut deux exercices cumulés. Affecter le
 * solde ferait donc affecter deux fois le résultat de l'année d'avant.
 * `EcritureService.balance` sépare déjà report et mouvement · on lit le
 * mouvement.
 */
@Injectable()
export class AffectationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritureService: EcritureService,
  ) {}

  /**
   * Ce qu'il faut savoir AVANT de décider : le montant à affecter, ce que le
   * référentiel autorise, et la dotation à la réserve légale que la loi impose.
   */
  async preparer(tenantId: string, exerciceId: string) {
    const { exercice, referentiel, forme } = await this.contexte(tenantId, exerciceId);
    const regles = REGLES[referentiel];
    const soldes = await this.soldesDuBilan(tenantId, exerciceId, referentiel, forme);

    const reserveLegale = dotationReserveLegale({
      referentiel,
      forme,
      benefice: soldes.estBenefice ? soldes.montant : 0,
      pertesAnterieures: soldes.pertesAnterieures,
      reserveExistante: soldes.reserveLegale,
      capitalSocial: soldes.capitalSocial,
    });

    // Les comptes RÉELLEMENT ouverts dans le plan du dossier, sous les racines
    // que le référentiel autorise · proposer un compte absent du plan
    // renverrait une erreur à la validation, ce qui se découvre trop tard.
    const destinations = await this.prisma.compte.findMany({
      where: {
        tenantId,
        estActif: true,
        typeCompte: 'DETAIL',
        OR: regles.destinations.map((r) => ({ numero: { startsWith: r } })),
      },
      select: { id: true, numero: true, intitule: true },
      orderBy: { numero: 'asc' },
    });

    const existante = await this.prisma.affectationResultat.findUnique({
      where: { exerciceId },
      include: { lignes: { include: { compte: { select: { numero: true, intitule: true } } } } },
    });

    return {
      exercice: { id: exercice.id, dateDebut: exercice.dateDebut, dateFin: exercice.dateFin },
      referentiel,
      // La forme juridique et la racine où SON capital a été lu · servies à
      // l'écran, parce qu'un capital affiché sans dire d'où il vient se prend
      // pour le 101 de tout le monde, et que c'est précisément l'erreur qui a
      // fait réclamer sans fin une dotation à une entreprise individuelle.
      formeJuridiqueSyscohada: forme,
      capitalRacine: soldes.capitalRacine,
      montant: soldes.montant,
      estBenefice: soldes.estBenefice,
      pertesAnterieures: soldes.pertesAnterieures,
      capitalSocial: soldes.capitalSocial,
      reserveLegaleExistante: soldes.reserveLegale,
      reserveLegale,
      destinations,
      existante,
    };
  }

  async lister(tenantId: string) {
    return this.prisma.affectationResultat.findMany({
      where: { tenantId },
      orderBy: { dateDecision: 'desc' },
      include: {
        exercice: { select: { id: true, dateDebut: true, dateFin: true } },
        ecriture: { select: { id: true, numeroPiece: true, date: true, statut: true } },
        lignes: { include: { compte: { select: { numero: true, intitule: true } } } },
      },
    });
  }

  /**
   * Enregistre la décision ET passe l'écriture qui solde le compte 13.
   *
   * Les deux vont ensemble : une décision sans écriture laisserait le compte 13
   * plein, ce qui est exactement le défaut de départ.
   */
  async enregistrer(tenantId: string, createdBy: string, dto: EnregistrerAffectationDto) {
    const { exercice, referentiel, forme } = await this.contexte(tenantId, dto.exerciceId);
    const regles = REGLES[referentiel];

    const dejaFaite = await this.prisma.affectationResultat.findUnique({
      where: { exerciceId: dto.exerciceId },
    });
    if (dejaFaite) {
      throw new ConflictException(
        `Le résultat de cet exercice a déjà été affecté le ${dejaFaite.dateDecision.toISOString().slice(0, 10)}. ` +
          'Une seconde décision modifie la première : supprimez l’affectation existante avant de la refaire.',
      );
    }

    const soldes = await this.soldesDuBilan(tenantId, dto.exerciceId, referentiel, forme);
    if (soldes.montant < EPSILON) {
      throw new BadRequestException(
        "Cet exercice ne dégage aucun résultat à affecter : le compte 13 n'a pas bougé.",
      );
    }

    // --- L'exercice d'accueil : le suivant, ouvert ----------------------------
    const suivant = await this.prisma.exercice.findFirst({
      where: { tenantId, dateDebut: { gt: exercice.dateFin } },
      orderBy: { dateDebut: 'asc' },
    });
    if (!suivant) {
      throw new BadRequestException(
        "Aucun exercice ne suit celui-ci. L'affectation se décide « au cours de l'exercice suivant » " +
          "(AUDCIF, Titre VII, compte 13) et son écriture s'y enregistre : ouvrez-le d'abord.",
      );
    }
    if (suivant.statut === StatutExercice.CLOTURE) {
      throw new BadRequestException(
        "L'exercice qui doit recevoir l'écriture d'affectation est clôturé : elle ne peut plus y être passée.",
      );
    }
    const dateDecision = new Date(dto.dateDecision);
    if (dateDecision < suivant.dateDebut || dateDecision > suivant.dateFin) {
      throw new BadRequestException(
        `La date de décision doit tomber dans l'exercice qui reçoit l'écriture ` +
          `(${suivant.dateDebut.toISOString().slice(0, 10)} au ${suivant.dateFin.toISOString().slice(0, 10)}).`,
      );
    }

    // --- Les destinations, comptes réels du dossier --------------------------
    const comptes = await this.prisma.compte.findMany({
      where: { tenantId, id: { in: dto.lignes.map((l) => l.compteId) } },
      select: { id: true, numero: true, intitule: true, typeCompte: true },
    });
    const parId = new Map(comptes.map((c) => [c.id, c]));
    for (const ligne of dto.lignes) {
      const compte = parId.get(ligne.compteId);
      if (!compte) throw new BadRequestException('Compte de destination introuvable dans ce dossier.');
      if (compte.typeCompte === 'TOTAL') {
        throw new BadRequestException(
          `Le compte ${compte.numero} est un compte de totalisation : il ne reçoit jamais d'écriture.`,
        );
      }
      const interdit = regles.interdits.find((i) => compte.numero.startsWith(i.racine));
      if (interdit) throw new BadRequestException(interdit.motif);
      if (!regles.destinations.some((r) => compte.numero.startsWith(r))) {
        throw new BadRequestException(
          `Le compte ${compte.numero} « ${compte.intitule} » n'est pas une destination admise du résultat. ` +
            `Le texte solde le compte 13 par les comptes ${regles.destinations.join(', ')} ` +
            '(AUDCIF, Titre VII, compte 13 · SYCEBNL, Partie 2 ch. 3, compte 13).',
        );
      }
    }

    // --- La somme doit épuiser le résultat, au centime -----------------------
    const total = Math.round(dto.lignes.reduce((s, l) => s + l.montant, 0) * 100) / 100;
    if (Math.abs(total - soldes.montant) > EPSILON) {
      throw new BadRequestException(
        `L'affectation porte ${total.toFixed(2)} alors que le résultat à affecter est de ` +
          `${soldes.montant.toFixed(2)}. Le compte 13 doit être SOLDÉ par l'affectation : ` +
          `il reste ${(soldes.montant - total).toFixed(2)} à affecter.`,
      );
    }

    // --- La réserve légale, sanctionnée par la nullité -----------------------
    if (soldes.estBenefice && regles.reserveLegale) {
      const exigee = dotationReserveLegale({
        referentiel,
        forme,
        benefice: soldes.montant,
        pertesAnterieures: soldes.pertesAnterieures,
        reserveExistante: soldes.reserveLegale,
        capitalSocial: soldes.capitalSocial,
      });
      if (exigee.dotation !== null) {
        const dotee = dto.lignes
          .filter((l) => parId.get(l.compteId)!.numero.startsWith(regles.reserveLegale!))
          .reduce((s, l) => s + l.montant, 0);
        if (dotee + EPSILON < exigee.dotation) {
          throw new BadRequestException(
            `La réserve légale doit recevoir au moins ${exigee.dotation.toFixed(2)} et n'en reçoit que ` +
              `${dotee.toFixed(2)}. ${exigee.motif} Une délibération contraire est NULLE : le logiciel ne peut ` +
              'pas l’enregistrer.',
          );
        }
      }
    }

    // --- L'écriture qui solde le compte 13 -----------------------------------
    //
    // Bénéfice : le 131 est créditeur, on le DÉBITE et on crédite les
    // destinations. Perte : le 139 est débiteur, on le CRÉDITE et on débite les
    // destinations qui l'absorbent (report à nouveau, réserves, capital).
    const compteResultat = await this.compteResultat(tenantId, soldes.estBenefice);
    const journal = await this.journalGeneral(tenantId);
    const lignesEcriture = [
      soldes.estBenefice
        ? { compteId: compteResultat.id, debit: soldes.montant, libelle: 'Affectation du résultat' }
        : { compteId: compteResultat.id, credit: soldes.montant, libelle: 'Imputation de la perte' },
      ...dto.lignes.map((l) => ({
        compteId: l.compteId,
        ...(soldes.estBenefice ? { credit: l.montant } : { debit: l.montant }),
        libelle: l.libelle || undefined,
      })),
    ];

    // L'ÉCRITURE D'ABORD, LA DÉCISION ENSUITE · EcritureService.creer ne
    // participe pas à une transaction extérieure (il numérote la pièce et
    // contrôle l'équilibre, le journal et l'exercice pour son propre compte).
    // On la passe donc en premier : c'est elle qui peut encore refuser, et un
    // refus laisse alors la base intacte. Si l'enregistrement de la décision
    // échoue après coup, l'écriture est effacée · une écriture d'affectation
    // sans décision serait un mouvement que rien n'explique.
    const ecriture = await this.ecritureService.creer(tenantId, createdBy, {
      exerciceId: suivant.id,
      journalId: journal.id,
      date: dto.dateDecision,
      libelle: `Affectation du résultat de l'exercice ${exercice.dateFin.getUTCFullYear()} · ${dto.organe}`,
      reference: dto.reference,
      lignes: lignesEcriture,
    });
    try {
      return await this.prisma.affectationResultat.create({
        data: {
          tenantId,
          exerciceId: dto.exerciceId,
          dateDecision,
          organe: dto.organe,
          reference: dto.reference,
          montant: new Prisma.Decimal(soldes.montant),
          estBenefice: soldes.estBenefice,
          ecritureId: ecriture.id,
          createdBy,
          lignes: {
            create: dto.lignes.map((l) => ({
              compteId: l.compteId,
              montant: new Prisma.Decimal(l.montant),
              libelle: l.libelle,
            })),
          },
        },
        include: {
          lignes: { include: { compte: { select: { numero: true, intitule: true } } } },
          ecriture: { select: { id: true, numeroPiece: true, date: true, statut: true } },
        },
      });
    } catch (erreur) {
      await this.prisma.ligneEcriture.deleteMany({ where: { ecritureId: ecriture.id } });
      await this.prisma.ecriture.delete({ where: { id: ecriture.id } });
      throw erreur;
    }
  }

  /**
   * Défait une affectation · possible tant que son écriture est au brouillard.
   *
   * Une fois l'écriture validée, elle est entrée au livre-journal : seule
   * l'inscription en négatif la corrige (AUDCIF art. 20), et supprimer la
   * décision laisserait l'écriture orpheline.
   */
  async supprimer(tenantId: string, id: string) {
    const affectation = await this.prisma.affectationResultat.findFirst({
      where: { id, tenantId },
      include: { ecriture: { select: { id: true, statut: true, numeroPiece: true } } },
    });
    if (!affectation) throw new NotFoundException('Affectation introuvable pour ce dossier');
    if (affectation.ecriture && affectation.ecriture.statut !== StatutEcriture.BROUILLARD) {
      throw new BadRequestException(
        `L'écriture d'affectation (pièce n° ${affectation.ecriture.numeroPiece ?? '·'}) est validée : elle est ` +
          "entrée au livre-journal. Corrigez-la par inscription en négatif (AUDCIF art. 20) plutôt que de " +
          'supprimer la décision.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.affectationResultat.delete({ where: { id } });
      if (affectation.ecriture) {
        await tx.ligneEcriture.deleteMany({ where: { ecritureId: affectation.ecriture.id } });
        await tx.ecriture.delete({ where: { id: affectation.ecriture.id } });
      }
    });
    return { supprime: true };
  }

  // --- Lectures -------------------------------------------------------------

  private async contexte(tenantId: string, exerciceId: string) {
    const exercice = await this.prisma.exercice.findFirst({ where: { id: exerciceId, tenantId } });
    if (!exercice) throw new NotFoundException('Exercice introuvable pour ce dossier');
    if (exercice.statut !== StatutExercice.CLOTURE) {
      throw new BadRequestException(
        "Le résultat ne s'affecte qu'après la clôture de l'exercice : c'est elle qui le porte au compte 13.",
      );
    }
    // LA FORME JURIDIQUE SE LIT ICI, ET PAS SEULEMENT LE RÉFÉRENTIEL. Le
    // référentiel commande le PLAN DE COMPTES ; la réserve légale, elle, est
    // une règle du droit des sociétés, que l'AUSCGIE n'impose qu'à la SARL
    // (art. 346) et à la SA (art. 546, 2°). Ne lire que le référentiel
    // revenait à l'imposer aux douze formes · voir regles-affectation.ts.
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { referentiel: true, formeJuridiqueSyscohada: true },
    });
    return {
      exercice,
      referentiel: tenant.referentiel as Referentiel,
      // `null` a deux sens (sans objet en SYCEBNL, non renseignée en
      // SYSCOHADA) et les deux conduisent à ne rien exiger : aucune forme n'est
      // présumée, la forme se lit dans les statuts.
      forme: (tenant.formeJuridiqueSyscohada ?? null) as FormeJuridiqueSyscohada | null,
    };
  }

  /**
   * Les quatre chiffres dont l'affectation a besoin, lus dans la balance de
   * l'exercice clos · résultat PROPRE de l'exercice (mouvement du 13, pas son
   * solde), pertes antérieures, réserve légale déjà constituée, et CAPITAL, lu
   * sur la racine que la forme juridique commande (voir `racineCapital`).
   */
  private async soldesDuBilan(
    tenantId: string,
    exerciceId: string,
    referentiel: Referentiel,
    forme: FormeJuridiqueSyscohada | null,
  ) {
    // Brouillard exclu : un exercice clôturé n'a plus d'écriture en attente, et
    // une affectation se décide sur des comptes arrêtés.
    const balance = await this.ecritureService.balance(tenantId, exerciceId, false);
    const parRacine = (racine: string) =>
      balance.lignes.filter((l) => l.numero.startsWith(racine));

    const mouvement = (racine: string) =>
      parRacine(racine).reduce((s, l) => s + l.mouvementDebit - l.mouvementCredit, 0);
    const solde = (racine: string) => parRacine(racine).reduce((s, l) => s + l.solde, 0);

    const racine = racineCapital(referentiel, forme);

    // 131 bénéfice (créditeur) · 139 perte (débiteur). Les deux numéros sont les
    // mêmes dans les deux plans, seuls les intitulés diffèrent.
    const beneficeMouvement = Math.round(-mouvement('131') * 100) / 100;
    const perteMouvement = Math.round(mouvement('139') * 100) / 100;
    const net = Math.round((beneficeMouvement - perteMouvement) * 100) / 100;

    return {
      montant: Math.abs(net),
      estBenefice: net >= 0,
      // Report à nouveau DÉBITEUR · les pertes antérieures de l'AUSCGIE.
      pertesAnterieures: Math.max(0, Math.round(solde('12') * 100) / 100),
      reserveLegale: Math.max(0, Math.round(-solde('111') * 100) / 100),
      // LE CAPITAL SE LIT LÀ OÙ LA FORME LE PORTE · 101 Capital social pour
      // les sociétés, 102 Capital par dotation pour une entité publique, 103
      // Capital personnel pour une entité individuelle (AUDCIF, Titre VII,
      // COMPTE 101, 102 et 103). Le lire au seul 101 donnait un capital NUL à
      // une entreprise individuelle : le plafond du cinquième n'était alors
      // jamais atteint et la dotation était réclamée indéfiniment.
      capitalRacine: racine,
      capitalSocial: racine ? Math.max(0, Math.round(-solde(racine) * 100) / 100) : 0,
    };
  }

  private async compteResultat(tenantId: string, estBenefice: boolean) {
    const racine = estBenefice ? '131' : '139';
    const compte = await this.prisma.compte.findFirst({
      where: { tenantId, numero: { startsWith: racine }, typeCompte: 'DETAIL' },
      orderBy: { numero: 'asc' },
    });
    if (!compte) {
      throw new BadRequestException(
        `Aucun compte ${racine} dans le plan de ce dossier · l'affectation ne peut pas solder le résultat.`,
      );
    }
    return compte;
  }

  private async journalGeneral(tenantId: string) {
    const journal =
      (await this.prisma.journal.findFirst({ where: { tenantId, code: 'OD' } })) ??
      (await this.prisma.journal.findFirst({ where: { tenantId, type: 'GENERAL' } }));
    if (!journal) {
      throw new BadRequestException(
        "Aucun journal général (code OD) pour recevoir l'écriture d'affectation.",
      );
    }
    return journal;
  }
}
