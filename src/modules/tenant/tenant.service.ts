import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { siSycebnl } from '../../common/reponse-referentiel';
import { PrismaService } from '../../common/prisma.service';
import { MONNAIE_DE_TENUE } from '../../common/monnaie-de-tenue';
import { Prisma, FormeJuridiqueEbnl,
  FormeJuridiqueSyscohada, JeuEtatsFinanciersSycebnl, MethodeCotisations, Referentiel, RegimeExigibiliteTva, SystemeComptableSyscohada, TypeLicence } from '@prisma/client';

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
      jeuEtatsFinanciersSycebnl: siSycebnl(tenant.referentiel, tenant.jeuEtatsFinanciersSycebnl),
      systemeComptableSyscohada: tenant.systemeComptableSyscohada,
      activite: tenant.activite,
      adresse: tenant.adresse,
      ville: tenant.ville,
      pays: tenant.pays,
      telephone: tenant.telephone,
      // MONNAIE DE TENUE · lecture seule côté écran. Elle ne se choisit pas
      // (loi n° 23/053 art. 141, 1° · AUDCIF art. 17, 1°) et elle n'a jamais
      // rien converti · elle étiquette le cartouche des états.
      devise: tenant.devise ?? MONNAIE_DE_TENUE,
      deviseFonctionnelle: tenant.deviseFonctionnelle,
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
      assujettiTva: tenant.assujettiTva,
      dateOptionTva: tenant.dateOptionTva,
      regimeExigibiliteTva: tenant.regimeExigibiliteTva,
      dateAutorisationDebitsTva: tenant.dateAutorisationDebitsTva,
      effectifPermanent: tenant.effectifPermanent,
      // Fait générateur des cotisations · SYCEBNL seulement (§ 5.4.2.1) ·
      // `null` pour un dossier SYSCOHADA veut dire « sans objet », et pour un
      // dossier SYCEBNL « pas encore tranché ». Le référentiel du dossier
      // distingue les deux, comme pour la forme juridique.
      methodeCotisations: siSycebnl(tenant.referentiel, tenant.methodeCotisations),
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
      activite?: string;
      adresse?: string;
      ville?: string;
      pays?: string;
      telephone?: string;
      deviseFonctionnelle?: string;
    },
  ) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Dossier introuvable');
    }
    // LA MONNAIE FONCTIONNELLE DOIT EXISTER DANS LE DOSSIER. Sans cette
    // vérification, un dossier pourrait nommer « USD » sans qu'aucun cours ne
    // soit jamais saisi · le second jeu se produirait alors avec des lignes
    // muettes, et un jeu incomplet qui ne se dit pas incomplet est pire qu'un
    // refus. Chaîne vide = on retire la monnaie fonctionnelle, toujours permis.
    const fonctionnelle = dto.deviseFonctionnelle?.trim().toUpperCase();
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
    const normaliser = (v: string | undefined) => (v === undefined ? undefined : v.trim() === '' ? null : v.trim());

    const renseigne = (v: string | undefined) => v !== undefined && v.trim() !== '';
    if (tenant.referentiel === Referentiel.SYCEBNL && renseigne(dto.rccm)) {
      throw new BadRequestException(
        "Une entité à but non lucratif n'est pas commerçante : elle n'est pas immatriculée au registre du commerce " +
          "et du crédit mobilier, qui immatricule les commerçants, les sociétés commerciales, les GIE et les " +
          'succursales (AUDCG, art. 2 et art. 35, 1°).',
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
        // Date de DÉLIVRANCE, jamais d'échéance · l'arrêté n° 007/2025 n'en
        // fixe aucune, et en déduire une serait inventer la règle qu'il
        // n'écrit pas. Vide = l'attestation est connue mais sa date ne l'est
        // pas, état légitime tant que la pièce n'est pas sous les yeux.
        dateAttestationExemptionIs:
          dto.dateAttestationExemptionIs === undefined
            ? undefined
            : dto.dateAttestationExemptionIs.trim() === ''
              ? null
              : new Date(dto.dateAttestationExemptionIs),
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
