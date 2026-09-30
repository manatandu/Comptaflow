import type { ReponseFait } from './dto/parametres-dossier.dto';
import { donneesAssujettissementTva, donneesVenteBiensServices, faitAssujettissementTva } from './faits-declares';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { siSycebnl } from '../../common/reponse-referentiel';
import { PrismaService } from '../../common/prisma.service';
import { MONNAIE_DE_TENUE } from '../../common/monnaie-de-tenue';
import { identiteSociete, mentionsEmetteur, motifRefusCapital, motifRefusCapitalVariable } from './mentions-societe';
import {
  avertissementCodeActivite,
  motifRefusCodeActivite,
  normaliserCodeActivite,
} from './code-activite-principale';
import { GROUPES_ACTIVITES_SYSCOHADA } from '../etats-financiers-syscohada/correspondance-notes-syscohada-3';
import { dateSaisieOuEffacement } from './date-effacable';
import { normaliserModules } from './modules-optionnels';
import { Prisma, ModuleOptionnel, FormeJuridiqueEbnl,
  FormeJuridiqueSyscohada, JeuEtatsFinanciersSycebnl, MethodeCotisations, Referentiel, RegimeExigibiliteTva, SystemeComptableSyscohada, TypeLicence,
  MethodeInventaireStocks,
} from '@prisma/client';

/**
 * Crée un tenant et sa licence en une transaction. Le référentiel comptable
 * (SYCEBNL / SYSCOHADA) et le type de licence sont fixés à la création :
 * changer de référentiel en cours de vie du tenant n'est pas supporté
 * (le plan de comptes et les états financiers en dépendent structurellement).
 *
 * Le JEU D'ÉTATS FINANCIERS SYCEBNL, lui, se choisit à la création et reste
 * modifiable tant que le dossier ne porte aucune écriture. L'article 4 de
 * l'Acte uniforme distingue trois jeux d'états selon le type d'entité :
 * associations et ordres professionnels, projets de développement et
 * assimilés, et Système Minimal de Trésorerie. Les trois sont construits.
 */
@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `client` reçoit la transaction de `AuthService.register` quand la
   * création fait partie d'une inscription · hors de ce cas il vaut
   * `this.prisma` et rien ne change pour les autres appelants.
   */
  async creerTenant(params: {
    /** Tiré par l'appelant qui doit agir au nom du dossier AVANT sa création · voir AuthService.register. */
    id?: string;
    nom: string;
    referentiel: Referentiel;
    typeLicence: TypeLicence;
    jeuEtatsFinanciersSycebnl?: JeuEtatsFinanciersSycebnl;
    systemeComptableSyscohada?: SystemeComptableSyscohada;
    dateExpiration?: Date;
    activite?: string;
    adresse?: string;
    ville?: string;
    pays?: string;
    telephone?: string;
  }, client: Prisma.TransactionClient = this.prisma) {
    return client.tenant.create({
      data: {
        ...(params.id ? { id: params.id } : {}),
        nom: params.nom,
        referentiel: params.referentiel,
        jeuEtatsFinanciersSycebnl: params.jeuEtatsFinanciersSycebnl,
        systemeComptableSyscohada: params.systemeComptableSyscohada,
        activite: params.activite,
        adresse: params.adresse,
        ville: params.ville,
        pays: params.pays,
        telephone: params.telephone,
        licence: {
          create: {
            type: params.typeLicence,
            dateExpiration: params.dateExpiration,
          },
        },
      },
      include: { licence: true },
    });
  }

  /**
   * Paramètres du dossier lus par la fenêtre Structure > Paramètres du
   * dossier. `nombreEcritures` sert à l'UI : au-delà de zéro, le jeu d'états
   * financiers est verrouillé (voir modifierJeuEtatsFinanciers).
   */
  /**
   * DÉMARRAGE GUIDÉ D'UN DOSSIER NEUF (décision de Manasse du 2026-09-28) ·
   * l'état de chaque étape se LIT dans le dossier, jamais dans une case cochée
   * à part : une étape faite ailleurs que dans l'assistant compte aussi, et
   * rien ne peut se dire fait sans l'être. Des comptes par la base, bornés au
   * dossier.
   */
  async demarrage(tenantId: string) {
    const [tenant, exercices, journaux, tiers, ecritures] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { modulesActives: true } }),
      this.prisma.exercice.count({ where: { tenantId } }),
      this.prisma.journal.count({ where: { tenantId } }),
      this.prisma.tiers.count({ where: { tenantId } }),
      this.prisma.ecriture.count({ where: { tenantId } }),
    ]);
    if (!tenant) {
      throw new NotFoundException('Dossier introuvable');
    }
    return { exercices, journaux, tiers, ecritures, modulesActives: normaliserModules(tenant.modulesActives) };
  }

  async parametres(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Dossier introuvable');
    }
    const nombreEcritures = await this.prisma.ecriture.count({ where: { tenantId } });
    // Le plancher de la longueur des comptes est servi AVEC le paramètre · un
    // écran qui proposerait 3 à 13 sans dire lesquelles sont impossibles ferait
    // découvrir le refus après le clic.
    const { plancher: longueurCompteMinimale, exemple: longueurCompteExemple } =
      await this.plancherLongueurCompte(tenantId);
    return {
      id: tenant.id,
      nom: tenant.nom,
      referentiel: tenant.referentiel,
      jeuEtatsFinanciersSycebnl: siSycebnl(tenant.referentiel, tenant.jeuEtatsFinanciersSycebnl),
      systemeComptableSyscohada: tenant.systemeComptableSyscohada,
      activite: tenant.activite,
      // Code activité principale (NOTE 36, passe R3) · l'avertissement est
      // RENDU à chaque lecture, pas seulement à l'enregistrement, et les 44
      // groupes sont servis au seul SYSCOHADA pour que l'écran les propose
      // sans en recopier la liste.
      codeActivitePrincipale: tenant.codeActivitePrincipale,
      avertissementCodeActivitePrincipale: avertissementCodeActivite(tenant.codeActivitePrincipale),
      groupesActivites: tenant.referentiel === Referentiel.SYSCOHADA ? GROUPES_ACTIVITES_SYSCOHADA : [],
      adresse: tenant.adresse,
      ville: tenant.ville,
      pays: tenant.pays,
      telephone: tenant.telephone,
      email: tenant.email,
      siteWeb: tenant.siteWeb,
      capitalSocial: tenant.capitalSocial === null ? null : Number(tenant.capitalSocial),
      capitalVariable: tenant.capitalVariable,
      // La ligne de l'art. 17 AUSCGIE telle qu'elle s'imprime, et ce qui y
      // manque · même calcul que l'en-tête d'impression (/auth/me).
      mentionsSociete: mentionsEmetteur(identiteSociete(tenant)),
      // MONNAIE DE TENUE · lecture seule côté écran. Elle ne se choisit pas
      // (loi n° 23/053 art. 141, 1° · AUDCIF art. 17, 1°) et elle n'a jamais
      // rien converti · elle étiquette le cartouche des états.
      devise: tenant.devise ?? MONNAIE_DE_TENUE,
      deviseFonctionnelle: tenant.deviseFonctionnelle,
      numeroImpot: tenant.numeroImpot,
      idNat: tenant.idNat,
      rccm: tenant.rccm,
      numeroDeclarationActivite: tenant.numeroDeclarationActivite,
      locataireGerantFonds: tenant.locataireGerantFonds,
      // AUSCOOP art. 19, 74, 183, 205 et 268 · la coopérative.
      numeroRegistreCooperatives: tenant.numeroRegistreCooperatives,
      varianteCooperative: tenant.varianteCooperative,
      dateDissolution: tenant.dateDissolution,
      liquidateurs: tenant.liquidateurs,
      // Identifiants propres aux entités à but non lucratif · voir
      // docs/identifiants-legaux-ebnl-rdc.md. Le RCCM ci-dessus ne concerne
      // qu'un dossier SYSCOHADA : l'AUDCG (art. 35, 1°) immatricule les
      // commerçants (art. 2), les sociétés, les GIE, les succursales et les
      // groupements que la loi y soumet · la loi n° 004/2001 n'y soumet pas
      // une ASBL, une ONG ou un projet de développement.
      actePersonnaliteJuridique: tenant.actePersonnaliteJuridique,
      dateActePersonnalite: tenant.dateActePersonnalite,
      numeroEnregistrementSecteur: tenant.numeroEnregistrementSecteur,
      certificatEnregistrementPlan: tenant.certificatEnregistrementPlan,
      // EN CLAIR, ET SANS `siSycebnl()`. Le champ voisin `methodeCotisations`
      // y passe, et un lecteur présumera la symétrie · elle serait fausse.
      // L'obligation d'organisation comptable existe des DEUX côtés, par deux
      // chemins (AUDCIF art. 69 · SYCEBNL art. 16, 2), l'art. 69 lui étant
      // exclu par l'art. 3). Servir `null` à un dossier SYSCOHADA ferait
      // disparaître de son écran une option qui le concerne.
      doubleRegardValidation: tenant.doubleRegardValidation,
      attestationExemptionIs: tenant.attestationExemptionIs,
      dateAttestationExemptionIs: tenant.dateAttestationExemptionIs,
      formeJuridique: siSycebnl(tenant.referentiel, tenant.formeJuridique),
      formeJuridiqueSyscohada: tenant.formeJuridiqueSyscohada,
      droitEtranger: siSycebnl(tenant.referentiel, tenant.droitEtranger),
      longueurCompte: tenant.longueurCompte,
      longueurCompteMinimale,
      longueurCompteExemple,
      assujettiTva: tenant.assujettiTva,
      // `null` = pas encore dit · voir `faits-declares.ts`.
      assujettissementTva: faitAssujettissementTva(tenant),
      venteBiensServices: tenant.venteBiensServices,
      modulesActives: normaliserModules(tenant.modulesActives ?? []),
      dateOptionTva: tenant.dateOptionTva,
      regimeExigibiliteTva: tenant.regimeExigibiliteTva,
      dateAutorisationDebitsTva: tenant.dateAutorisationDebitsTva,
      effectifPermanent: tenant.effectifPermanent,
      numeroAffiliationCnssEmployeur: tenant.numeroAffiliationCnssEmployeur,
      // Fait générateur des cotisations · SYCEBNL seulement (§ 5.4.2.1) ·
      // `null` pour un dossier SYSCOHADA veut dire « sans objet », et pour un
      // dossier SYCEBNL « pas encore tranché ». Le référentiel du dossier
      // distingue les deux, comme pour la forme juridique.
      methodeCotisations: siSycebnl(tenant.referentiel, tenant.methodeCotisations),
      // EN CLAIR, ET SANS `siSycebnl()` · les deux textes ouvrent une classe 3
      // et posent le même choix entre inventaire permanent et intermittent
      // (AUDCIF Titre VII ch. 3 section 3 · SYCEBNL Partie 2 ch. 3 section 3).
      // Le masquer à un dossier SYSCOHADA lui retirerait le réglage qui
      // commande son écriture de variation de stocks.
      methodeInventaireStocks: tenant.methodeInventaireStocks,
      nombreEcritures,
    };
  }

  /**
   * Change le jeu d'états financiers SYCEBNL du dossier. Refusé dès qu'une
   * écriture existe : le jeu détermine la structure du bilan, du compte de
   * résultat ou d'exploitation, du tableau de flux et des notes annexes (35
   * notes pour une association, 24 pour un projet de développement). Basculer
   * après coup rejouerait les mêmes soldes dans une autre présentation, sans
   * garantie que les rattachements de comptes aux notes suivent · autant
   * créer un nouveau dossier.
   */
  async modifierJeuEtatsFinanciers(tenantId: string, jeu: JeuEtatsFinanciersSycebnl) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Dossier introuvable');
    }
    if (tenant.referentiel !== Referentiel.SYCEBNL) {
      throw new BadRequestException(
        "Le jeu d'états financiers ne concerne que les dossiers tenus en référentiel SYCEBNL",
      );
    }
    if (tenant.jeuEtatsFinanciersSycebnl !== jeu) {
      const nombreEcritures = await this.prisma.ecriture.count({ where: { tenantId } });
      if (nombreEcritures > 0) {
        throw new BadRequestException(
          `Ce dossier porte déjà ${nombreEcritures} écriture(s) : le jeu d'états financiers ne peut plus être changé. Créez un nouveau dossier pour l'autre type d'entité.`,
        );
      }
    }
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { jeuEtatsFinanciersSycebnl: jeu },
    });
    return this.parametres(tenantId);
  }

  /**
   * Système comptable d'un dossier SYSCOHADA (AUDCIF art. 11 et 13).
   *
   * Pendant exact de `modifierJeuEtatsFinanciers`, et il manquait : le jeu
   * SYCEBNL se changeait tant qu'aucune écriture n'existait, le système
   * SYSCOHADA était figé à la création. Même raison de verrouiller ensuite :
   * le système commande la présentation des états, en changer après coup
   * rejouerait les mêmes soldes dans une autre forme.
   */
  async modifierSystemeSyscohada(tenantId: string, systeme: SystemeComptableSyscohada) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { _count: { select: { cellules: true } } },
    });
    if (!tenant) {
      throw new NotFoundException('Dossier introuvable');
    }
    if (tenant.referentiel !== Referentiel.SYSCOHADA) {
      throw new BadRequestException(
        'Le système comptable normal / minimal de trésorerie ne concerne que les dossiers tenus en SYSCOHADA',
      );
    }
    if (tenant.systemeComptableSyscohada !== systeme) {
      // LE SYSTÈME D'UN GROUPE SE TIENT AU SIÈGE (audit final F172) · la
      // cellule est un établissement de la même entité (AUDCIF, fiche du
      // COMPTE 18), et le système lui est imposé à ses deux portes
      // (`creerCellule`, `PlateformeService.verifierMere`). Changé ici, il
      // désaccordait après coup un siège et ses cellules, et la liasse du
      // groupe sortait sous le système du siège sur des cellules tenues dans
      // l'autre.
      if (tenant.dossierMereId !== null) {
        throw new BadRequestException(
          'Ce dossier est une cellule · il tient le système comptable de son siège. Détachez-le du groupe pour en changer.',
        );
      }
      if (tenant._count.cellules > 0) {
        throw new BadRequestException(
          `Ce dossier est le siège de ${tenant._count.cellules} cellule(s) · elles tiennent son système comptable, le changer les désaccorderait. Détachez-les d'abord.`,
        );
      }
      const nombreEcritures = await this.prisma.ecriture.count({ where: { tenantId } });
      if (nombreEcritures > 0) {
        throw new BadRequestException(
          `Ce dossier porte déjà ${nombreEcritures} écriture(s) : le système comptable ne peut plus être changé. Créez un nouveau dossier pour l'autre système.`,
        );
      }
    }
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { systemeComptableSyscohada: systeme },
    });
    return this.parametres(tenantId);
  }

  /**
   * Raison sociale et coordonnées · l'écran « Coordonnées » de l'assistant.
   *
   * DÉFAUT CORRIGÉ : ces champs n'avaient AUCUNE route de modification, alors
   * que l'assistant annonçait « modifiable plus tard ». Un cabinet qui
   * déménage restait à son ancienne adresse, imprimée en tête de chacun de
   * ses états financiers (`adresse + ville + pays`, voir
   * ExportService.identiteLiasse) · relevé en le vérifiant plutôt qu'en le
   * supposant, la phrase de l'assistant a été corrigée dans le même geste.
   *
   * Tout est libre SAUF la MONNAIE DE TENUE, qui n'est plus modifiable du
   * tout · elle ne convertissait rien, elle étiquetait le cartouche des états,
   * et la tenue en franc congolais n'est pas une option (loi n° 23/053
   * art. 141, 1° · AUDCIF art. 17, 1°). Ancien commentaire, pour mémoire :
   * changer l'étiquette monétaire ne convertit aucun montant déjà saisi, et
   * une liasse qui présenterait des francs congolais sous un sigle « USD »
   * serait fausse sans que rien ne le signale.
   */
  async modifierCoordonnees(
    tenantId: string,
    dto: {
      nom?: string;
      activite?: string | null;
      codeActivitePrincipale?: string | null;
      adresse?: string | null;
      ville?: string | null;
      pays?: string | null;
      telephone?: string | null;
      email?: string | null;
      siteWeb?: string | null;
      capitalSocial?: number | null;
      capitalVariable?: boolean;
      deviseFonctionnelle?: string | null;
    },
  ) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Dossier introuvable');
    }
    // UN CAPITAL SUR UNE ENTITÉ QUI N'EN A PAS EST REFUSÉ À LA ROUTE, pas
    // seulement masqué à l'écran (§ 6) · imprimé à côté de la dénomination
    // d'une ASBL, il lui prêterait une forme de société qu'elle n'a pas. Le
    // retrait (`null`, ou « non » au capital variable) reste toujours permis.
    if ((dto.capitalSocial !== undefined && dto.capitalSocial !== null) || dto.capitalVariable === true) {
      const motif = motifRefusCapital(tenant.referentiel, tenant.formeJuridiqueSyscohada);
      if (motif) throw new BadRequestException(motif);
    }
    // AUSCGIE art. 269-1 · la variabilité n'est ouverte qu'à la SA et à la
    // SAS. Refusée à la route aux SARL, SNC et SCS, pas seulement masquée ;
    // le retrait (false) reste permis.
    if (dto.capitalVariable === true) {
      const motif = motifRefusCapitalVariable(tenant.formeJuridiqueSyscohada);
      if (motif) throw new BadRequestException(motif);
    }
    // LE CODE ACTIVITÉ PRINCIPALE EST REFUSÉ À LA ROUTE hors SYSCOHADA et
    // hors format (six chiffres, NOTE 36), pas seulement masqué à l'écran
    // (§ 6). Un groupe hors des 44 n'est PAS refusé · aucun texte lu ne donne
    // la liste des postes, l'avertissement est rendu avec les paramètres.
    const codeActivite = normaliserCodeActivite(dto.codeActivitePrincipale);
    const motifCode = motifRefusCodeActivite(tenant.referentiel, codeActivite);
    if (motifCode) throw new BadRequestException(motifCode);
    // LA MONNAIE FONCTIONNELLE DOIT EXISTER DANS LE DOSSIER. Sans cette
    // vérification, un dossier pourrait nommer « USD » sans qu'aucun cours ne
    // soit jamais saisi · le second jeu se produirait alors avec des lignes
    // muettes, et un jeu incomplet qui ne se dit pas incomplet est pire qu'un
    // refus. Chaîne vide = on retire la monnaie fonctionnelle, toujours permis.
    // `null` aussi (2026-09-28) · il était lu comme « absent » et ignoré en
    // silence, là où l'appelant demandait un retrait.
    const fonctionnelle =
      dto.deviseFonctionnelle === null ? '' : dto.deviseFonctionnelle?.trim().toUpperCase();
    if (fonctionnelle) {
      if (fonctionnelle === MONNAIE_DE_TENUE) {
        throw new BadRequestException(
          `La monnaie fonctionnelle ne peut pas être ${MONNAIE_DE_TENUE} : c'est déjà la monnaie de tenue, ` +
            'et le second jeu de documents ferait double emploi avec le jeu légal.',
        );
      }
      const connue = await this.prisma.devise.findFirst({
        where: { tenantId, code: fonctionnelle, estActive: true },
        select: { id: true },
      });
      if (!connue) {
        throw new BadRequestException(
          `La devise ${fonctionnelle} n’est pas ouverte dans ce dossier. Ouvrez-la d’abord dans ` +
            'Structure > Devises et cours, avec ses cours, avant d’en faire la monnaie fonctionnelle.',
        );
      }
    }
    // Chaîne vide = effacement (`null`), sauf pour la raison sociale que le
    // DTO refuse déjà vide · elle figure en tête de chaque état imprimé.
    // `null` vaut effacement lui aussi (2026-09-28) · `@IsOptional` le laisse
    // passer, et `.trim()` sur lui rendait un 500 sans motif, comme sur les
    // identifiants légaux avant F237.
    const normaliser = (v: string | null | undefined) =>
      v === undefined ? undefined : v === null || v.trim() === '' ? null : v.trim();
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        nom: dto.nom === undefined ? undefined : dto.nom.trim(),
        activite: normaliser(dto.activite),
        codeActivitePrincipale: codeActivite,
        adresse: normaliser(dto.adresse),
        ville: normaliser(dto.ville),
        pays: normaliser(dto.pays),
        telephone: normaliser(dto.telephone),
        email: normaliser(dto.email),
        siteWeb: normaliser(dto.siteWeb),
        capitalSocial: dto.capitalSocial === undefined ? undefined : dto.capitalSocial === null ? null : new Prisma.Decimal(dto.capitalSocial),
        capitalVariable: dto.capitalVariable,
        // LA MONNAIE DE TENUE N'EST PLUS TOUCHÉE ICI. Elle ne convertissait
        // rien · elle étiquetait le cartouche (« montants en X »), si bien
        // qu'en changer la valeur imprimait une unité fausse sur toute la
        // liasse. Loi n° 23/053 art. 141, 1° et AUDCIF art. 17, 1° ne
        // prévoient d'ailleurs aucune option.
        deviseFonctionnelle: fonctionnelle === undefined ? undefined : fonctionnelle === '' ? null : fonctionnelle,
      },
    });
    return this.parametres(tenantId);
  }

  /**
   * Identifiants légaux du dossier. Contrairement au jeu d'états, ils restent
   * modifiables à tout moment : ce sont des données d'identité, pas de
   * structure, et une association les obtient souvent APRÈS avoir commencé à
   * tenir ses comptes.
   *
   * Une chaîne vide efface l'identifiant (`null` en base) plutôt que de
   * stocker `''`, pour que l'en-tête d'impression n'ait qu'un seul cas
   * d'absence à traiter.
   *
   * TOUS NE SONT PAS COMMUNS AUX DEUX RÉFÉRENTIELS, et la route les acceptait
   * tous pour tout dossier · seul l'écran filtrait, ce qui laisse la route
   * ouverte à un appel direct (CLAUDE.md § 6).
   *
   *  · le RCCM immatricule les commerçants, les sociétés commerciales, les GIE
   *    et les succursales (AUDCG art. 35, 1°), un commerçant étant celui qui
   *    fait des actes de commerce par nature sa profession (art. 2). Une ASBL
   *    n'est pas commerçante · elle n'a pas de RCCM ;
   *  · l'arrêté de personnalité juridique, l'enregistrement sectoriel, le
   *    certificat du Ministère du Plan et l'attestation d'exemption d'impôt
   *    sur les sociétés sont les identifiants d'une ASBL, d'une ONG ou d'un
   *    EUP · une société n'en a aucun ;
   *  · le numéro impôt et l'id. nat. sont communs.
   *
   * SEULES LES VALEURS NON VIDES SONT REFUSÉES. La chaîne vide est le geste
   * d'effacement voulu : un refus sec empêcherait de nettoyer un identifiant
   * hérité d'une conversion de référentiel.
   */
  async modifierIdentite(
    tenantId: string,
    dto: {
      numeroImpot?: string;
      idNat?: string;
      rccm?: string;
      numeroDeclarationActivite?: string;
      locataireGerantFonds?: ReponseFait;
      numeroRegistreCooperatives?: string;
      varianteCooperative?: 'SCOOPS' | 'COOP_CA' | 'PAS_ENCORE_DIT';
      dateDissolution?: string;
      liquidateurs?: string;
      actePersonnaliteJuridique?: string;
      dateActePersonnalite?: string;
      numeroEnregistrementSecteur?: string;
      certificatEnregistrementPlan?: string;
      attestationExemptionIs?: string;
      dateAttestationExemptionIs?: string;
    },
  ) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Dossier introuvable');
    }
    // `null` vaut effacement, comme la chaîne vide · `@IsOptional` le laisse
    // passer la validation, et `.trim()` sur lui levait une TypeError, soit un
    // 500 sans motif (audit de cohérence du lot F237, jumeau de
    // `dateSaisieOuEffacement`).
    const normaliser = (v: string | null | undefined) =>
      v === undefined ? undefined : v === null || v.trim() === '' ? null : v.trim();

    const renseigne = (v: string | null | undefined) => typeof v === 'string' && v.trim() !== '';
    if (tenant.referentiel === Referentiel.SYCEBNL && renseigne(dto.rccm)) {
      throw new BadRequestException(
        "Une entité à but non lucratif n'est pas commerçante : elle n'est pas immatriculée au registre du commerce " +
          "et du crédit mobilier, qui immatricule les commerçants, les sociétés commerciales, les GIE et les " +
          'succursales (AUDCG, art. 2 et art. 35, 1°).',
      );
    }
    // AUDCG art. 62 et 64 · l'entreprenant DÉCLARE son activité et « ne peut
    // être en même temps immatriculé » ; les autres formes n'ont pas de
    // déclaration d'activité. Et l'art. 138 lui ferme la location-gérance.
    const entreprenant = tenant.formeJuridiqueSyscohada === FormeJuridiqueSyscohada.ENTREPRENANT;
    if (entreprenant && renseigne(dto.rccm)) {
      throw new BadRequestException(
        "L'entreprenant n'est pas immatriculé au RCCM (AUDCG art. 64) · son numéro est celui de sa déclaration d'activité (art. 62).",
      );
    }
    if ((!entreprenant || tenant.referentiel !== Referentiel.SYSCOHADA) && renseigne(dto.numeroDeclarationActivite)) {
      throw new BadRequestException(
        "Le numéro de déclaration d'activité est celui de l'entreprenant (AUDCG art. 62) · une personne immatriculée porte son RCCM.",
      );
    }
    // AUSCOOP art. 74 et 77 al. 1 · la coopérative est au Registre des
    // Sociétés Coopératives et « ne peut être immatriculée à plusieurs
    // registres » · son numéro a son champ, le RCCM lui est refusé. Et ce
    // champ, comme la variante et la dissolution de l'art. 183, n'appartient
    // qu'à elle · les autres textes n'ont pas été lus ici.
    const cooperative =
      tenant.referentiel === Referentiel.SYSCOHADA &&
      tenant.formeJuridiqueSyscohada === FormeJuridiqueSyscohada.SOCIETE_COOPERATIVE;
    if (cooperative && renseigne(dto.rccm)) {
      throw new BadRequestException(
        "La coopérative est immatriculée au Registre des Sociétés Coopératives (AUSCOOP art. 74), et « aucune société coopérative ne peut être immatriculée à plusieurs registres » (art. 77 al. 1) · saisissez ce numéro-là, pas un RCCM.",
      );
    }
    if (
      !cooperative &&
      (renseigne(dto.numeroRegistreCooperatives) ||
        renseigne(dto.dateDissolution) ||
        renseigne(dto.liquidateurs) ||
        (dto.varianteCooperative !== undefined && dto.varianteCooperative !== 'PAS_ENCORE_DIT'))
    ) {
      throw new BadRequestException(
        'Le Registre des Sociétés Coopératives, la variante SCOOPS ou COOP-CA et la liquidation de l’art. 183 sont propres à la société coopérative (AUSCOOP).',
      );
    }
    if (dto.locataireGerantFonds === 'OUI' && (entreprenant || tenant.referentiel !== Referentiel.SYSCOHADA)) {
      throw new BadRequestException(
        entreprenant
          ? "L'entreprenant ne peut être partie à un contrat de location-gérance (AUDCG art. 138)."
          : "La location-gérance d'un fonds de commerce (AUDCG art. 138 à 140) ne concerne pas une entité à but non lucratif.",
      );
    }
    if (tenant.referentiel === Referentiel.SYSCOHADA) {
      const propresAuxEbnl: [string, string | undefined][] = [
        ['arrêté de personnalité juridique', dto.actePersonnaliteJuridique],
        ['date de cet arrêté', dto.dateActePersonnalite],
        ["numéro d'enregistrement sectoriel", dto.numeroEnregistrementSecteur],
        ["certificat d'enregistrement du Ministère du Plan", dto.certificatEnregistrementPlan],
        ["attestation d'exemption d'impôt sur les sociétés", dto.attestationExemptionIs],
        ['date de cette attestation', dto.dateAttestationExemptionIs],
      ];
      const fautif = propresAuxEbnl.find(([, v]) => renseigne(v));
      if (fautif) {
        throw new BadRequestException(
          `Le champ « ${fautif[0]} » est un identifiant d'entité à but non lucratif (loi n° 004/2001) · une société ` +
            "commerciale n'en a pas. Son immatriculation est le RCCM.",
        );
      }
    }
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        numeroImpot: normaliser(dto.numeroImpot),
        idNat: normaliser(dto.idNat),
        rccm: normaliser(dto.rccm),
        numeroDeclarationActivite: normaliser(dto.numeroDeclarationActivite),
        ...(dto.locataireGerantFonds === undefined
          ? {}
          : { locataireGerantFonds: dto.locataireGerantFonds === 'OUI' ? true : dto.locataireGerantFonds === 'NON' ? false : null }),
        numeroRegistreCooperatives: normaliser(dto.numeroRegistreCooperatives),
        ...(dto.varianteCooperative === undefined
          ? {}
          : { varianteCooperative: dto.varianteCooperative === 'PAS_ENCORE_DIT' ? null : dto.varianteCooperative }),
        dateDissolution: dateSaisieOuEffacement(dto.dateDissolution),
        liquidateurs: normaliser(dto.liquidateurs),
        actePersonnaliteJuridique: normaliser(dto.actePersonnaliteJuridique),
        // Date vide = pas d'arrêté encore obtenu (autorisation provisoire de
        // l'art. 5) · c'est un état légitime, pas une saisie incomplète. Lue
        // par `dateSaisieOuEffacement`, comme les deux dates du régime de TVA
        // (audit de cohérence du lot F237) · `new Date` laissait partir à
        // Prisma une forme ISO qu'il ne lit pas (« 2026-W05 », un 500) et
        // reportait en silence un « 2026-02-30 » au 2 mars.
        dateActePersonnalite: dateSaisieOuEffacement(dto.dateActePersonnalite),
        numeroEnregistrementSecteur: normaliser(dto.numeroEnregistrementSecteur),
        certificatEnregistrementPlan: normaliser(dto.certificatEnregistrementPlan),
        attestationExemptionIs: normaliser(dto.attestationExemptionIs),
        // Date de DÉLIVRANCE, jamais d'échéance · l'arrêté n° 007/2025 n'en
        // fixe aucune, et en déduire une serait inventer la règle qu'il
        // n'écrit pas. Vide = l'attestation est connue mais sa date ne l'est
        // pas, état légitime tant que la pièce n'est pas sous les yeux. Même
        // lecture que la date de l'acte, juste au-dessus.
        dateAttestationExemptionIs: dateSaisieOuEffacement(dto.dateAttestationExemptionIs),
      },
    });
    return this.parametres(tenantId);
  }

  /**
   * Forme juridique de l'entité (loi n° 004/2001). Comme les identifiants
   * légaux, modifiable à tout moment : elle ne change ni le plan de comptes ni
   * la présentation des états, seulement la liste des obligations annuelles
   * que le planning de clôture propose (voir jalonsApplicables).
   */
  async modifierFormeJuridique(tenantId: string, formeJuridique: FormeJuridiqueEbnl, droitEtranger?: boolean) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Dossier introuvable');
    }
    // SYMÉTRIE EXACTE DE modifierFormeSyscohada, et elle manquait. La porte
    // était ouverte dans un seul sens : une entreprise pouvait se voir poser
    // une forme EBNL, et le planning de clôture lui servait alors les
    // obligations de la loi n° 004/2001 (rapport d'activité au Ministère du
    // Plan, déclarations d'administrateur et de mouvement d'immeuble) dont
    // aucune ne la vise.
    if (tenant.referentiel !== Referentiel.SYCEBNL) {
      throw new BadRequestException(
        'La forme juridique de la loi n° 004/2001 ne concerne que les dossiers tenus en référentiel SYCEBNL. ' +
          "Une société commerciale relève de l'AUSCGIE : utilisez la forme juridique OHADA.",
      );
    }
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { formeJuridique, ...(droitEtranger === undefined ? {} : { droitEtranger }) },
    });
    return this.parametres(tenantId);
  }

  /**
   * Pendant SYSCOHADA de modifierFormeJuridique · droit OHADA des affaires.
   *
   * Refusée sur un dossier SYCEBNL, et symétriquement : les deux listes ne se
   * recouvrent nulle part, servir l'une à l'autre proposait « association
   * confessionnelle » à une SARL et « société anonyme » à une paroisse.
   *
   * Modifiable à tout moment, comme son pendant : une transformation de
   * société (AUSCGIE art. 181) est un événement ordinaire de la vie sociale,
   * elle ne change ni le plan de comptes ni la présentation des états, mais
   * elle change les obligations annuelles du planning de clôture.
   */
  async modifierFormeSyscohada(tenantId: string, formeJuridiqueSyscohada: FormeJuridiqueSyscohada) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Dossier introuvable');
    }
    if (tenant.referentiel !== Referentiel.SYSCOHADA) {
      throw new BadRequestException(
        'La forme juridique OHADA ne concerne que les dossiers tenus en référentiel SYSCOHADA. ' +
          "Une entité à but non lucratif relève de la loi n° 004/2001, pas de l'AUSCGIE.",
      );
    }
    await this.prisma.tenant.update({ where: { id: tenantId }, data: { formeJuridiqueSyscohada } });
    return this.parametres(tenantId);
  }

  /**
   * Fait générateur des cotisations et du droit d'entrée.
   *
   * Cadre conceptuel SYCEBNL § 5.4.2.1 : « Le fait générateur de la
   * comptabilisation des cotisations et du droit d'entrée est l'appel de
   * cotisation ou de paiement du droit d'entrée. Toutefois, si l'entité ne
   * peut justifier d'un droit d'agir en recouvrement, les cotisations et le
   * droit d'entrée sont comptabilisés lors de leur encaissement effectif. »
   *
   * LE LOGICIEL NE TRANCHE PAS · la réponse est dans les statuts (existence
   * d'une voie de recouvrement), pas dans la comptabilité. Il enregistre ce
   * que le cabinet a constaté, le REPROPOSE aux écritures de cotisation, et
   * rappelle la mention que le même paragraphe rend obligatoire en notes
   * annexes. Poser APPEL par défaut ferait constater des créances sur des
   * adhérents que l'entité n'a aucun moyen de poursuivre.
   *
   * Modifiable à tout moment : une modification des statuts est un événement
   * ordinaire, et la méthode ne vaut que pour les écritures à venir · celles
   * déjà passées se corrigent par contre-écriture, comme toujours.
   */
  async modifierMethodeCotisations(tenantId: string, methodeCotisations: MethodeCotisations) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Dossier introuvable');
    }
    if (tenant.referentiel !== Referentiel.SYCEBNL) {
      throw new BadRequestException(
        'Les cotisations et le droit d’entrée relèvent du SYCEBNL (cadre conceptuel § 5.4.2.1) · ' +
          "un dossier d'entreprise n'en a pas.",
      );
    }
    if (tenant.jeuEtatsFinanciersSycebnl !== JeuEtatsFinanciersSycebnl.ASSOCIATIONS_ORDRES_PROFESSIONNELS) {
      throw new BadRequestException(
        "Les cotisations sont celles des ADHÉRENTS d'une association ou d'un ordre professionnel · " +
          "un projet de développement est financé par un bailleur, il n'appelle pas de cotisation.",
      );
    }
    await this.prisma.tenant.update({ where: { id: tenantId }, data: { methodeCotisations } });
    return this.parametres(tenantId);
  }

  /**
   * MODE DE TENUE DES STOCKS · le choix que les deux textes laissent à
   * l'entité, et qu'aucun défaut ne remplace.
   *
   * AUDCIF Titre VII ch. 3 section 3 et SYCEBNL Partie 2 ch. 3 section 3, dans
   * les mêmes mots : « La comptabilisation des stocks repose sur la tenue SOIT
   * d'un inventaire PERMANENT, SOIT d'un inventaire INTERMITTENT. Toutefois,
   * les entités qui n'ont pas les moyens de tenir l'inventaire permanent
   * peuvent recourir au système de l'inventaire intermittent. »
   *
   * AUCUN REFUS PAR RÉFÉRENTIEL · les deux en ont une, contrairement aux
   * cotisations juste au-dessus. Et modifiable à tout moment : une entité qui
   * se dote d'un magasin passe du jour au lendemain de l'un à l'autre, et le
   * changement ne vaut que pour les clôtures à venir.
   */
  async modifierMethodeInventaireStocks(
    tenantId: string,
    methodeInventaireStocks: MethodeInventaireStocks,
  ) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Dossier introuvable');
    }
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { methodeInventaireStocks },
    });
    return this.parametres(tenantId);
  }

  /**
   * LONGUEUR DES NUMÉROS DE COMPTE · le paramètre existait, rien ne le posait.
   *
   * Le schéma annonçait depuis le début qu'il est « modifiable après coup
   * (TenantService.modifierParametres) mais jamais en dessous de la longueur du
   * plus long numéro de compte déjà créé ». Cette méthode n'existait pas :
   * aucune route, aucun DTO, et l'écran rangeait la longueur parmi « ce qui ne
   * se change pas ». Le champ ne servait donc que de PLAFOND, fixé à 8 pour
   * tous les dossiers, sans qu'aucun cabinet puisse le porter à 10 ou 12.
   *
   * CE QU'IL COMMANDE, ET CE QU'IL NE COMMANDE PAS · la distinction décide de
   * tout le reste. C'est la longueur MAXIMALE des numéros que le cabinet ouvre
   * lui-même. Le plan NORMALISÉ semé à la création garde, lui, ses huit
   * chiffres : ses numéros sont des littéraux, et les tables de correspondance
   * des deux référentiels (bilan, compte de résultat, flux, notes, SMT) comme
   * le routage des comptes de TVA sont écrits contre cette forme. Élargir la
   * borne ouvre des sous-comptes plus fins sous une racine semée (un adhérent,
   * un bailleur, un projet) · cela ne renumérote rien.
   *
   * LE PLANCHER EST LE PLUS LONG NUMÉRO DÉJÀ OUVERT, et il n'est pas
   * négociable : descendre en dessous rendrait des comptes existants invalides
   * RÉTROACTIVEMENT, c'est-à-dire des comptes déjà mouvementés, déjà lettrés,
   * déjà repris dans des états déposés. Sur un dossier semé ce plancher vaut
   * donc 8, et le refus le dit avec le numéro fautif plutôt qu'avec une borne
   * abstraite · c'est ce numéro-là qu'il faudrait supprimer pour descendre.
   *
   * La borne haute de 13 et la borne basse de 3 sont celles de Sage (skill
   * `sage-i7`, comptabilité générale : « longueur de compte paramétrable par
   * dossier, 3 à 13 caractères »). Elles sont déjà celles du DTO de création
   * de compte, qui valide le format sans connaître le dossier.
   */
  /**
   * Le plancher de la longueur des comptes · le plus long numéro DÉJÀ OUVERT,
   * avec un exemple.
   *
   * Lu EN BASE et pas déduit du semis : un cabinet qui a importé son propre
   * plan porte des numéros que le semis n'a jamais posés. Le tri SQL ne sert à
   * rien ici, il est lexicographique · « 9 » y passe après « 41100000 » alors
   * qu'il est plus court.
   *
   * Partagé par la LECTURE des paramètres et par l'ÉCRITURE, et c'est
   * délibéré : l'écran désactive les longueurs impossibles avec le même chiffre
   * que celui par lequel le serveur les refuse. Deux calculs auraient divergé,
   * et l'écran aurait alors proposé une valeur que la route rejette.
   */
  private async plancherLongueurCompte(tenantId: string): Promise<{ plancher: number; exemple: string }> {
    const comptes = await this.prisma.compte.findMany({ where: { tenantId }, select: { numero: true } });
    const plancher = comptes.reduce((max, c) => Math.max(max, c.numero.length), 0);
    return { plancher, exemple: comptes.find((c) => c.numero.length === plancher)?.numero ?? '' };
  }

  async modifierLongueurCompte(tenantId: string, longueurCompte: number) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Dossier introuvable');
    }
    if (!Number.isInteger(longueurCompte) || longueurCompte < 3 || longueurCompte > 13) {
      throw new BadRequestException(
        'La longueur des numéros de compte va de 3 à 13 chiffres · c’est la plage des logiciels de la place.',
      );
    }

    const { plancher, exemple } = await this.plancherLongueurCompte(tenantId);

    if (longueurCompte < plancher) {
      throw new BadRequestException(
        `Ce dossier porte déjà des numéros de ${plancher} chiffres (par exemple « ${exemple} ») · ` +
          `les ramener à ${longueurCompte} les rendrait invalides rétroactivement, alors qu'ils sont ` +
          'mouvementés et repris dans les états. Supprimez d’abord les comptes plus longs, ou gardez cette longueur.',
      );
    }

    await this.prisma.tenant.update({ where: { id: tenantId }, data: { longueurCompte } });
    return this.parametres(tenantId);
  }

  /**
   * DOUBLE REGARD À LA VALIDATION · le validateur doit-il différer de l'auteur.
   *
   * AUCUN REFUS DE RÉFÉRENTIEL, contrairement à `modifierMethodeCotisations`
   * juste au-dessus, et c'est la différence à ne pas gommer. L'obligation de se
   * donner des procédures atteint les deux référentiels, par deux chemins :
   * l'AUDCIF art. 69 (« L'entité détermine, sous sa responsabilité, les
   * procédures nécessaires à la mise en place d'une organisation comptable
   * permettant aussi bien un contrôle interne fiable que le contrôle
   * externe ») côté SYSCOHADA, et le SYCEBNL par son art. 16, 2) côté EBNL,
   * puisque son art. 3 exclut justement l'art. 69.
   *
   * MODIFIABLE À TOUT MOMENT, sans verrou lié aux écritures existantes,
   * contrairement au jeu d'états financiers. Une organisation comptable change
   * · un recrutement, un départ, l'ouverture d'une antenne. La désactiver ne
   * dévalide RIEN de ce qui est déjà entré au livre-journal : l'art. 22, 2°
   * pose que « l'irréversibilité des traitements interdise toute suppression,
   * addition ou modification ultérieure », et aucun chemin de dévalidation
   * n'existe dans ce dépôt.
   */
  /**
   * Modules affichés par le dossier · la liste remplace la précédente. Rien
   * n'est supprimé ni refusé ailleurs · un module désactivé garde ses données
   * et ses routes (`tenant/modules-optionnels.ts`).
   */
  async modifierModules(tenantId: string, modulesActives: ModuleOptionnel[]) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Dossier introuvable');
    }
    await this.prisma.tenant.update({ where: { id: tenantId }, data: { modulesActives: normaliserModules(modulesActives) } });
    return this.parametres(tenantId);
  }

  async modifierDoubleRegard(tenantId: string, doubleRegardValidation: boolean) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Dossier introuvable');
    }
    await this.prisma.tenant.update({ where: { id: tenantId }, data: { doubleRegardValidation } });
    return this.parametres(tenantId);
  }

  /**
   * Régime de TVA et effectif permanent.
   *
   * L'ASSUJETTISSEMENT ne se présume pas : l'ordonnance-loi n° 10/001 le lie
   * au franchissement de 80 000 000 FC de chiffre d'affaires annuel hors taxes
   * (art. 14), et l'article 15, 2° exonère par ailleurs les opérations
   * conformes à l'objet d'une entité à but non lucratif. Le logiciel partait
   * pourtant du principe inverse, en proposant la saisie « avec TVA » à tout
   * dossier · une association non assujettie collectait alors une taxe sans
   * droit, et la déduisait sans droit.
   *
   * L'EFFECTIF commande deux règles chiffrées : le troisième critère de
   * l'article 19 du SYCEBNL (au-delà de vingt personnes, l'auditeur devient
   * obligatoire) et la tranche de cotisation INPP.
   */
  async modifierRegime(
    tenantId: string,
    dto: {
      assujettiTva?: boolean;
      reponseAssujettissementTva?: ReponseFait;
      venteBiensServices?: ReponseFait;
      dateOptionTva?: string;
      effectifPermanent?: number;
      numeroAffiliationCnssEmployeur?: string | null;
      regimeExigibiliteTva?: RegimeExigibiliteTva;
      dateAutorisationDebitsTva?: string;
    },
  ) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Dossier introuvable');
    }
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...donneesAssujettissementTva(dto.reponseAssujettissementTva, dto.assujettiTva),
        ...donneesVenteBiensServices(dto.venteBiensServices),
        // Chaîne vide ou null = effacement (audit final F237) · `new Date`
        // seul posait une date invalide, ou le 1er janvier 1970 sur un null.
        ...(dto.dateOptionTva === undefined ? {} : { dateOptionTva: dateSaisieOuEffacement(dto.dateOptionTva) }),
        ...(dto.effectifPermanent === undefined ? {} : { effectifPermanent: dto.effectifPermanent }),
        // `null` efface, comme la chaîne vide (2026-09-28) · `.trim()` sur lui
        // rendait un 500. Les champs dont la colonne n'admet pas `null`
        // (booléen, effectif, régime) le refusent au DTO (`FacultatifNonNul`).
        ...(dto.numeroAffiliationCnssEmployeur === undefined
          ? {}
          : { numeroAffiliationCnssEmployeur: dto.numeroAffiliationCnssEmployeur?.trim() || null }),
        ...(dto.regimeExigibiliteTva === undefined ? {} : { regimeExigibiliteTva: dto.regimeExigibiliteTva }),
        ...(dto.dateAutorisationDebitsTva === undefined
          ? {}
          : { dateAutorisationDebitsTva: dateSaisieOuEffacement(dto.dateAutorisationDebitsTva) }),
      },
    });
    return this.parametres(tenantId);
  }
}
