import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Prisma, FormeJuridiqueEbnl,
  FormeJuridiqueSyscohada, JeuEtatsFinanciersSycebnl, Referentiel, RegimeExigibiliteTva, SystemeComptableSyscohada, TypeLicence } from '@prisma/client';

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
    devise?: string;
  }, client: Prisma.TransactionClient = this.prisma) {
    return client.tenant.create({
      data: {
        nom: params.nom,
        referentiel: params.referentiel,
        jeuEtatsFinanciersSycebnl: params.jeuEtatsFinanciersSycebnl,
        systemeComptableSyscohada: params.systemeComptableSyscohada,
        activite: params.activite,
        adresse: params.adresse,
        ville: params.ville,
        pays: params.pays,
        telephone: params.telephone,
        devise: params.devise,
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
  async parametres(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Dossier introuvable');
    }
    const nombreEcritures = await this.prisma.ecriture.count({ where: { tenantId } });
    return {
      id: tenant.id,
      nom: tenant.nom,
      referentiel: tenant.referentiel,
      jeuEtatsFinanciersSycebnl: tenant.jeuEtatsFinanciersSycebnl,
      systemeComptableSyscohada: tenant.systemeComptableSyscohada,
      activite: tenant.activite,
      adresse: tenant.adresse,
      ville: tenant.ville,
      pays: tenant.pays,
      telephone: tenant.telephone,
      devise: tenant.devise,
      numeroImpot: tenant.numeroImpot,
      idNat: tenant.idNat,
      rccm: tenant.rccm,
      // Identifiants propres aux entités à but non lucratif · voir
      // docs/identifiants-legaux-ebnl-rdc.md. Le RCCM ci-dessus ne concerne
      // qu'un dossier SYSCOHADA : l'AUDCG (art. 2) n'assujettit au registre
      // que les commerçants et les sociétés, pas une ASBL, une ONG ou un
      // projet de développement.
      actePersonnaliteJuridique: tenant.actePersonnaliteJuridique,
      dateActePersonnalite: tenant.dateActePersonnalite,
      numeroEnregistrementSecteur: tenant.numeroEnregistrementSecteur,
      certificatEnregistrementPlan: tenant.certificatEnregistrementPlan,
      attestationExemptionIs: tenant.attestationExemptionIs,
      formeJuridique: tenant.formeJuridique,
      formeJuridiqueSyscohada: tenant.formeJuridiqueSyscohada,
      droitEtranger: tenant.droitEtranger,
      longueurCompte: tenant.longueurCompte,
      assujettiTva: tenant.assujettiTva,
      dateOptionTva: tenant.dateOptionTva,
      regimeExigibiliteTva: tenant.regimeExigibiliteTva,
      dateAutorisationDebitsTva: tenant.dateAutorisationDebitsTva,
      effectifPermanent: tenant.effectifPermanent,
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
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Dossier introuvable');
    }
    if (tenant.referentiel !== Referentiel.SYSCOHADA) {
      throw new BadRequestException(
        'Le système comptable normal / minimal de trésorerie ne concerne que les dossiers tenus en SYSCOHADA',
      );
    }
    if (tenant.systemeComptableSyscohada !== systeme) {
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
   * Tout est libre SAUF la devise, verrouillée dès la première écriture :
   * changer l'étiquette monétaire ne convertit aucun montant déjà saisi, et
   * une liasse qui présenterait des francs congolais sous un sigle « USD »
   * serait fausse sans que rien ne le signale.
   */
  async modifierCoordonnees(
    tenantId: string,
    dto: {
      nom?: string;
      activite?: string;
      adresse?: string;
      ville?: string;
      pays?: string;
      telephone?: string;
      devise?: string;
    },
  ) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Dossier introuvable');
    }
    if (dto.devise !== undefined && dto.devise.trim() !== (tenant.devise ?? '')) {
      const nombreEcritures = await this.prisma.ecriture.count({ where: { tenantId } });
      if (nombreEcritures > 0) {
        throw new BadRequestException(
          `Ce dossier porte déjà ${nombreEcritures} écriture(s) : la monnaie ne peut plus être changée. Les montants déjà saisis ne seraient pas convertis.`,
        );
      }
    }
    // Chaîne vide = effacement (`null`), sauf pour la raison sociale que le
    // DTO refuse déjà vide · elle figure en tête de chaque état imprimé.
    const normaliser = (v: string | undefined) => (v === undefined ? undefined : v.trim() === '' ? null : v.trim());
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        nom: dto.nom === undefined ? undefined : dto.nom.trim(),
        activite: normaliser(dto.activite),
        adresse: normaliser(dto.adresse),
        ville: normaliser(dto.ville),
        pays: normaliser(dto.pays),
        telephone: normaliser(dto.telephone),
        // La monnaie ne s'EFFACE pas : elle sert d'unité à tout montant
        // affiché et imprimé. Une saisie vide laisse donc la valeur en place
        // au lieu de poser `null`, qui priverait les états d'unité.
        devise: dto.devise === undefined || dto.devise.trim() === '' ? undefined : dto.devise.trim(),
      },
    });
    return this.parametres(tenantId);
  }

  /**
   * Identifiants légaux du dossier (n° impôt, id. nat., RCCM). Contrairement
   * au jeu d'états, ils restent modifiables à tout moment : ce sont des
   * données d'identité, pas de structure, et une association les obtient
   * souvent APRÈS avoir commencé à tenir ses comptes.
   *
   * Une chaîne vide efface l'identifiant (`null` en base) plutôt que de
   * stocker `''`, pour que l'en-tête d'impression n'ait qu'un seul cas
   * d'absence à traiter.
   */
  async modifierIdentite(
    tenantId: string,
    dto: {
      numeroImpot?: string;
      idNat?: string;
      rccm?: string;
      actePersonnaliteJuridique?: string;
      dateActePersonnalite?: string;
      numeroEnregistrementSecteur?: string;
      certificatEnregistrementPlan?: string;
      attestationExemptionIs?: string;
    },
  ) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Dossier introuvable');
    }
    const normaliser = (v: string | undefined) => (v === undefined ? undefined : v.trim() === '' ? null : v.trim());
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        numeroImpot: normaliser(dto.numeroImpot),
        idNat: normaliser(dto.idNat),
        rccm: normaliser(dto.rccm),
        actePersonnaliteJuridique: normaliser(dto.actePersonnaliteJuridique),
        // Date vide = pas d'arrêté encore obtenu (autorisation provisoire de
        // l'art. 5) · c'est un état légitime, pas une saisie incomplète.
        dateActePersonnalite:
          dto.dateActePersonnalite === undefined
            ? undefined
            : dto.dateActePersonnalite.trim() === ''
              ? null
              : new Date(dto.dateActePersonnalite),
        numeroEnregistrementSecteur: normaliser(dto.numeroEnregistrementSecteur),
        certificatEnregistrementPlan: normaliser(dto.certificatEnregistrementPlan),
        attestationExemptionIs: normaliser(dto.attestationExemptionIs),
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
      dateOptionTva?: string;
      effectifPermanent?: number;
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
        ...(dto.assujettiTva === undefined ? {} : { assujettiTva: dto.assujettiTva }),
        ...(dto.dateOptionTva === undefined ? {} : { dateOptionTva: new Date(dto.dateOptionTva) }),
        ...(dto.effectifPermanent === undefined ? {} : { effectifPermanent: dto.effectifPermanent }),
        ...(dto.regimeExigibiliteTva === undefined ? {} : { regimeExigibiliteTva: dto.regimeExigibiliteTva }),
        ...(dto.dateAutorisationDebitsTva === undefined
          ? {}
          : { dateAutorisationDebitsTva: new Date(dto.dateAutorisationDebitsTva) }),
      },
    });
    return this.parametres(tenantId);
  }
}
