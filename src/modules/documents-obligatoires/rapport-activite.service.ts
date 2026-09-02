import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RapportActivite, Referentiel } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EtatsFinanciersService } from '../etats-financiers/etats-financiers.service';
import { DonationService } from '../registre-donateurs/donation.service';
import { SECTIONS_RAPPORT_ACTIVITE } from './correspondance-inventaire';
import { regleRapportGestion } from './correspondance-inventaire-syscohada';
import { EtablirRapportActiviteDto } from './dto/documents-obligatoires.dto';

/**
 * Chiffres de trésorerie figés au rapport. Ils viennent du Tableau des flux
 * de trésorerie · le seul état qui décompose « l'évolution de la situation de
 * trésorerie » qu'exige l'art. 16-3.
 */
export interface TresorerieDuRapport {
  ouverture: number;
  variation: number;
  cloture: number;
  /** `true` si les deux égalités de contrôle du TFT concordent (Partie 4 ch. 1 §4). */
  boucle: boolean;
}

/**
 * RAPPORT D'ACTIVITÉ · article 16, point 3, de l'Acte uniforme SYCEBNL.
 *
 * « à la clôture de chaque exercice, les organes d'administration ou de
 * direction […] établissent un rapport d'activité ; le rapport d'activité
 * expose la situation de l'entité durant l'exercice écoulé, ses perspectives
 * de développement ou son évolution prévisible et l'évolution de la situation
 * de trésorerie ; les événements importants, survenus entre la date de
 * clôture de l'exercice et la date à laquelle il est établi, doivent
 * également y être mentionnés. »
 *
 * L'article 24 sanctionne pénalement les dirigeants qui n'ont pas établi ce
 * rapport, au même titre que l'inventaire et les états financiers.
 *
 * Ce que le logiciel apporte, et ce qu'il n'apporte pas :
 *
 *  - il ne RÉDIGE pas. Les quatre contenus sont narratifs et relèvent des
 *    organes de direction ; les remplir d'office ferait signer aux dirigeants
 *    un texte qu'ils n'ont pas écrit, sur un document pénalement sanctionné ;
 *  - il STRUCTURE selon les quatre contenus du texte, ni plus ni moins, et
 *    signale une section vide · un rapport amputé d'un contenu exigé n'est
 *    pas « établi » au sens de l'article ;
 *  - il CHIFFRE la troisième section. « L'évolution de la situation de
 *    trésorerie » est précisément ce que décompose le Tableau des flux de
 *    trésorerie : ouverture, variation, clôture, et le bouclage. La narration
 *    l'expose, ces chiffres la datent et la rendent vérifiable ;
 *  - il NOMME la fenêtre de la quatrième section. Les événements à mentionner
 *    sont ceux « survenus entre la date de clôture de l'exercice et la date à
 *    laquelle il est établi » : c'est la date d'établissement qui la ferme,
 *    d'où son caractère obligatoire.
 */
@Injectable()
export class RapportActiviteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly etatsFinanciers: EtatsFinanciersService,
    private readonly donationService: DonationService,
  ) {}

  async lister(tenantId: string, exerciceId: string) {
    await this.exercice(tenantId, exerciceId);
    return this.prisma.rapportActivite.findMany({ where: { tenantId, exerciceId }, orderBy: { version: 'desc' } });
  }

  async courant(tenantId: string, exerciceId: string) {
    await this.exercice(tenantId, exerciceId);
    return this.prisma.rapportActivite.findFirst({ where: { tenantId, exerciceId }, orderBy: { version: 'desc' } });
  }

  /**
   * Établit une version du rapport. Comme la transcription d'inventaire, un
   * rapport arrêté ne s'écrase pas : une reprise crée la version suivante et
   * l'ancienne reste lisible.
   */
  /**
   * Sous quel texte ce dossier rend-il compte, et de quoi.
   *
   * Trois régimes, jamais transposés l'un sur l'autre · SYCEBNL art. 16-3
   * (quatre sections), AUSCGIE art. 138 (six), AUSCOOP art. 108 (six autres,
   * dont l'état de promotion des coopérateurs, et SANS les événements
   * postérieurs à la clôture que les deux premiers exigent).
   */
  private async regimeRapport(tenantId: string) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { referentiel: true, formeJuridiqueSyscohada: true },
    });
    if (tenant.referentiel !== Referentiel.SYSCOHADA) {
      return { syscohada: false as const, regle: null };
    }
    return { syscohada: true as const, regle: regleRapportGestion(tenant.formeJuridiqueSyscohada) };
  }

  async etablir(tenantId: string, userId: string, dto: EtablirRapportActiviteDto) {
    const exercice = await this.exercice(tenantId, dto.exerciceId);
    const etabliLe = new Date(dto.etabliLe);

    // La date d'établissement ferme la fenêtre des événements postérieurs
    // (art. 16-3) : antérieure à la clôture, cette fenêtre serait vide par
    // construction et la quatrième section n'aurait littéralement rien à
    // mentionner. Ce n'est pas une préférence de saisie, c'est la définition
    // même du contenu exigé.
    if (etabliLe < exercice.dateFin) {
      throw new BadRequestException(
        `La date d'établissement (${etabliLe.toLocaleDateString('fr-FR')}) est antérieure à la clôture de l'exercice (${exercice.dateFin.toLocaleDateString('fr-FR')}). L'article 16-3 définit les événements à mentionner comme ceux « survenus entre la date de clôture de l'exercice et la date à laquelle il est établi » : cette période serait vide.`,
      );
    }

    const regime = await this.regimeRapport(tenantId);
    if (regime.syscohada && regime.regle!.genre === 'AUCUNE_REGLE_LUE') {
      // Une règle absente est déclarée absente, jamais remplacée par la plus
      // proche · même discipline que regles-auditeur.ts. Établir ici un
      // rapport reviendrait à inventer des sections que le texte ne demande
      // pas à cette forme juridique.
      throw new BadRequestException(regime.regle!.motif);
    }

    const tresorerie = await this.tresorerieDuTft(tenantId, exercice.id);
    const dernier = await this.prisma.rapportActivite.findFirst({
      where: { tenantId, exerciceId: exercice.id },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    return this.prisma.rapportActivite.create({
      data: {
        tenantId,
        exerciceId: exercice.id,
        version: (dernier?.version ?? 0) + 1,
        etabliLe,
        etabliPar: userId,
        situationExerciceEcoule: dto.situationExerciceEcoule?.trim() || null,
        perspectivesDeveloppement: dto.perspectivesDeveloppement?.trim() || null,
        evolutionTresorerie: dto.evolutionTresorerie?.trim() || null,
        evenementsPosterieurs: dto.evenementsPosterieurs?.trim() || null,
        entiteAvecAuditeur: dto.entiteAvecAuditeur ?? false,
        declarationDirigeants: dto.declarationDirigeants?.trim() || null,
        // Chemin SYSCOHADA · les sections vont en JSON, et l'article qui les
        // fonde est FIGÉ avec elles : un dossier peut changer de forme
        // juridique, le rapport déjà arrêté garde le sien.
        sections: regime.syscohada ? ((dto.sections ?? {}) as Prisma.InputJsonValue) : Prisma.DbNull,
        sourceRegle: regime.syscohada && regime.regle!.genre === 'EXIGE' ? regime.regle!.source : null,
        tresorerie: tresorerie as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * RAPPORT DE GESTION · chemin SYSCOHADA, constatations section par section.
   *
   * Méthode SÉPARÉE de `conformite`, et non une branche à l'intérieur : le
   * rapport d'activité du SYCEBNL (art. 16-3) et le rapport de gestion de
   * l'AUSCGIE (art. 138) ou de l'AUSCOOP (art. 108) ne sont pas deux formes
   * d'un même document. Ils n'ont ni le même nombre de sections, ni le même
   * organe qui les établit, et le premier porte en plus la déclaration de
   * l'art. 18 sur le registre des donateurs, qui n'a aucun sens en société
   * commerciale. Les fondre aurait obligé à des champs facultatifs partout,
   * et c'est ainsi qu'un document finit par réclamer ce que son texte
   * n'exige pas.
   */
  async conformiteRapportGestion(tenantId: string, exerciceId: string) {
    const exercice = await this.exercice(tenantId, exerciceId);
    const courant = await this.courant(tenantId, exerciceId);
    const regle = regleRapportGestion(
      (
        await this.prisma.tenant.findUniqueOrThrow({
          where: { id: tenantId },
          select: { formeJuridiqueSyscohada: true },
        })
      ).formeJuridiqueSyscohada,
    );

    if (regle.genre === 'AUCUNE_REGLE_LUE') {
      // Aucune règle lue · on le DIT. Le livre d'inventaire, lui, reste dû
      // (AUDCIF art. 19) et se contrôle ailleurs.
      return {
        exercice: { id: exercice.id, dateDebut: exercice.dateDebut, dateFin: exercice.dateFin },
        regleLue: false,
        motif: regle.motif,
        exigence: null as string | null,
        etabli: courant !== null,
        version: null as number | null,
        etabliLe: null as Date | null,
        sections: [] as Array<{ cle: string; titre: string; exigence: string; renseignee: boolean }>,
        fenetreEvenementsPosterieurs: null as { du: Date; au: Date } | null,
        tresorerie: null as TresorerieDuRapport | null,
        complet: false,
      };
    }

    const enregistrees = (courant?.sections ?? {}) as Record<string, string | undefined>;
    const sections = regle.sections.map((section) => ({
      ...section,
      renseignee: Boolean(enregistrees[section.cle]?.trim()),
    }));

    return {
      exercice: { id: exercice.id, dateDebut: exercice.dateDebut, dateFin: exercice.dateFin },
      regleLue: true,
      motif: null as string | null,
      exigence: `${regle.source} · établi par ${regle.organe}.`,
      etabli: courant !== null,
      version: courant?.version ?? null,
      etabliLe: courant?.etabliLe ?? null,
      sections,
      // La fenêtre n'a de sens que là où le texte demande les événements
      // postérieurs · l'AUSCOOP art. 108 ne les demande pas.
      fenetreEvenementsPosterieurs:
        courant && regle.sections.some((s) => s.cle === 'evenementsPosterieurs')
          ? { du: exercice.dateFin, au: courant.etabliLe }
          : null,
      tresorerie: (courant?.tresorerie ?? null) as TresorerieDuRapport | null,
      complet: courant !== null && sections.every((s) => s.renseignee),
    };
  }

  /**
   * Constatations sur le rapport de l'exercice · section par section, avec la
   * citation qui fonde chacune. Comme partout ailleurs sur ces documents
   * pénalement sanctionnés, ce sont des constatations et non un avis.
   */
  async conformite(tenantId: string, exerciceId: string) {
    const exercice = await this.exercice(tenantId, exerciceId);
    const courant = await this.courant(tenantId, exerciceId);
    const registre = await this.donationService.rapportConformite(tenantId, exerciceId);

    const sections = SECTIONS_RAPPORT_ACTIVITE.map((s) => ({
      ...s,
      renseignee: Boolean((courant?.[s.cle as keyof RapportActivite] as string | null)?.trim()),
    }));

    return {
      exercice: { id: exercice.id, dateDebut: exercice.dateDebut, dateFin: exercice.dateFin },
      exigence:
        "Art. 16-3 : « à la clôture de chaque exercice, les organes d'administration ou de direction, selon le cas, dressent l'inventaire et les états financiers […] et établissent un rapport d'activité ». Art. 24 : sanction pénale à défaut.",
      etabli: courant !== null,
      version: courant?.version ?? null,
      etabliLe: courant?.etabliLe ?? null,
      sections,
      /**
       * La fenêtre de la 4ᵉ section, nommée plutôt que sous-entendue : sans
       * elle, « les événements importants » ne désigne rien de précis.
       */
      fenetreEvenementsPosterieurs: courant
        ? { du: exercice.dateFin, au: courant.etabliLe }
        : null,
      tresorerie: (courant?.tresorerie ?? null) as TresorerieDuRapport | null,
      /**
       * Art. 18 · la déclaration des dirigeants n'est attendue QUE faute
       * d'auditeur. La réclamer à une entité qui en a un inventerait une
       * obligation ; la taire à celle qui n'en a pas laisserait passer un
       * manquement.
       */
      declarationRegistreDonateurs: {
        exigence:
          "Art. 18 : « S'il n'existe pas d'auditeur, une déclaration des dirigeants attestant de la tenue conforme du registre des donateurs est annexée audit rapport ou soumise à l'assemblée générale ou l'instance qui en tient lieu. »",
        remarque:
          "[texte officiel] « audit rapport » est ambigu : la phrase figure dans la branche « s'il n'existe pas d'auditeur », où aucun rapport d'auditeur n'existe. Le seul autre rapport prévu par le texte est celui de l'art. 16-3, d'où son rattachement ici.",
        entiteAvecAuditeur: courant?.entiteAvecAuditeur ?? false,
        attendue: courant !== null && !courant.entiteAvecAuditeur,
        renseignee: Boolean(courant?.declarationDirigeants?.trim()),
        /**
         * Ce que la déclaration attesterait : le registre est-il seulement en
         * état de l'être ? Attester d'une « tenue conforme » démentie par le
         * rapport de l'art. 18 exposerait les dirigeants au second tiret de
         * l'article 24 (états sciemment non fidèles) en plus du troisième.
         */
        registreConforme:
          registre.numerotation.continue &&
          registre.signature.lignesNonSignees.length === 0 &&
          registre.completude.lignesIncompletes.length === 0 &&
          registre.rapprochement.rapproche,
      },
      complet:
        courant !== null &&
        sections.every((s) => s.renseignee) &&
        (courant.entiteAvecAuditeur || Boolean(courant.declarationDirigeants?.trim())),
    };
  }

  /**
   * Reprend l'évolution de trésorerie du TFT. Sur un dossier dont le tableau
   * ne boucle pas, `boucle: false` est FIGÉ avec les chiffres : un rapport
   * d'activité qui exposerait une trésorerie non bouclée sans le dire serait
   * précisément l'état « non fidèle » du deuxième tiret de l'article 24.
   */
  private async tresorerieDuTft(tenantId: string, exerciceId: string): Promise<TresorerieDuRapport> {
    const tft = await this.etatsFinanciers.tableauFluxTresorerie(tenantId, exerciceId);
    return {
      ouverture: tft.controle.tresorerieOuverture,
      variation: tft.controle.variation,
      cloture: tft.controle.tresorerieClotureParBilan,
      boucle: tft.controle.coherent,
    };
  }

  private async exercice(tenantId: string, exerciceId: string) {
    const exercice = await this.prisma.exercice.findFirst({ where: { id: exerciceId, tenantId } });
    if (!exercice) throw new NotFoundException('Exercice introuvable pour ce dossier.');
    return exercice;
  }
}
