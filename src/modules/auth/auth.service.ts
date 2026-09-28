import { faitAssujettissementTva } from '../tenant/faits-declares';
import { BadRequestException, ConflictException, Injectable, Logger, Optional, UnauthorizedException } from '@nestjs/common';
import { LicenceSurSiteService } from '../sur-site/licence-sur-site.service';
import { identiteSociete, mentionsEmetteur } from '../tenant/mentions-societe';
import { articleTrenteSeptApplicable } from '../accord-cadre/conditions-ong-etrangere';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { siSycebnl } from '../../common/reponse-referentiel';
import { PrismaService } from '../../common/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { CompteService } from '../comptes/compte.service';
import { ExerciceService } from '../exercice/exercice.service';
import { JournalService } from '../journaux/journal.service';
import { TauxTvaService } from '../tva/taux-tva.service';
import { ImmobilisationService } from '../immobilisations/immobilisation.service';
import { AnalytiqueService } from '../analytique/analytique.service';
import { RelancesService } from '../relances/relances.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Referentiel, RoleUtilisateur, SystemeComptableSyscohada, TypeLicence } from '@prisma/client';
import { horsCloisonnement } from '../../common/cloisonnement/contexte-cloisonnement';
import { normaliserCourriel } from '../../common/courriel';
import { dansContexteAudit, acteurCourant, ACTEUR_SYSTEME } from '../../common/audit/contexte-audit';
import { transactionJournalisee } from '../../common/audit/transaction-journalisee';
import { avisDoubleAuth, EvenementDoubleAuth } from './avis-double-authentification';
import { CourrierService, ORIGINE_DOUBLE_AUTHENTIFICATION } from '../courrier/courrier.service';
import { normaliserModules } from '../tenant/modules-optionnels';
import { DECOMPTE_REMIS_A_ZERO, decompteApresEchec, MOTIF_IDENTIFIANTS_INVALIDES } from './verrouillage';
import { genererCodesSecours, genererSecret, secondFacteurAccepte, uriOtpauth, verifierCodeTotp } from './double-authentification';
import {
  demandeDeReemission,
  emettreSession,
  MOTIF_CONSOLE_SANS_SESSION_LONGUE,
  SessionEmise,
  SessionEnCours,
} from './session-longue';

export const SALT_ROUNDS = 12;

/**
 * EMPREINTE FACTICE (audit final F238) · une adresse INCONNUE répondait
 * aussitôt, une adresse connue après une centaine de millisecondes de bcrypt,
 * et la durée de la réponse disait donc ce que le message tait. Pour une
 * adresse inconnue, le mot de passe est comparé à cette empreinte, du même
 * coût que les vraies (`SALT_ROUNDS`, un spec le tient), et le résultat est
 * JETÉ · le refus ne dépend jamais de lui. C'est l'empreinte d'une chaîne
 * aléatoire tirée une fois et oubliée · elle ne protège rien et n'ouvre rien.
 * Écrite en dur plutôt que calculée · un calcul au démarrage coûterait une
 * empreinte de plus à la première adresse inconnue de chaque instance, et
 * c'est justement cette première différence de durée qu'on veut éviter.
 */
export const EMPREINTE_FACTICE = '$2b$12$zNSRXkByzfZhOQSR4/60ze6WWpSytqcVD.yZf5fl0OqDCsgj6X03y';

export const MOTIF_LICENCE_EDITEUR_A_LA_CREATION =
  "La licence de l'éditeur ne s'attribue pas à la création d'un dossier · elle se pose une seule fois, par le geste " +
  "« Désigner comme dossier de l'éditeur… » de la console.";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly tenantService: TenantService,
    private readonly compteService: CompteService,
    private readonly exerciceService: ExerciceService,
    private readonly journalService: JournalService,
    private readonly tauxTvaService: TauxTvaService,
    private readonly immobilisationService: ImmobilisationService,
    private readonly analytiqueService: AnalytiqueService,
    private readonly relancesService: RelancesService,
    @Optional() private readonly surSite?: LicenceSurSiteService,
    // La file des courriels · l'avis hors bande d'un second facteur changé.
    // Facultative ici pour que les specs construisent le service sans elle ;
    // AuthModule importe CourrierModule, et `avis-double-authentification.spec.ts`
    // le tient.
    @Optional() private readonly courrier?: CourrierService,
  ) {}

  /**
   * Crée le tenant, son admin, sa licence, son plan de comptes (SYCEBNL ou
   * SYSCOHADA, selon le référentiel choisi) et son exercice courant.
   * Reproduit le parcours de l'écran « Onboarding » du
   * canevas de design : le plan de comptes est prêt dès l'inscription, sans
   * étape de configuration manuelle.
   *
   * TOUT SE FAIT DANS UNE SEULE TRANSACTION · tenant, licence, admin, plan de
   * comptes, journaux, taxes, familles d'immobilisations, plans analytiques,
   * niveaux de relance et exercice. Le commentaire qui vivait ici annonçait
   * l'inverse comme une limite du MVP « à durcir avant une mise en prod
   * réelle » : la mise en production a eu lieu, et l'état incohérent qu'il
   * décrivait est un dossier ouvert SANS PLAN DE COMPTES · on s'y connecte,
   * rien n'y fonctionne, et aucun message ne dit pourquoi. Le tenant n'existe
   * désormais que si tout le reste existe.
   *
   * Le hachage du mot de passe reste DEHORS : bcrypt à 12 tours occupe le
   * processeur une centaine de millisecondes, et tenir une transaction
   * ouverte pendant ce temps ne servirait à rien.
   */
  async register(dto: RegisterDto) {
    // LA LICENCE DE L'ÉDITEUR NE NAÎT À AUCUNE PORTE DE CRÉATION (audit final
    // F161) · elle se pose par un geste nommé, une fois, sur un dossier qui
    // existe (`PlateformeService.designerDossierEditeur`). Acceptée ici, la
    // console, l'inscription publique ou le siège feraient naître un second
    // dossier incoupable, que plus rien ne retire ensuite, puisque la console
    // refuse de toucher à cette licence. Refusée AVANT toute écriture · le
    // dossier ne naît pas.
    if (dto.typeLicence === TypeLicence.PROPRIETAIRE) {
      throw new BadRequestException(MOTIF_LICENCE_EDITEUR_A_LA_CREATION);
    }
    // Normalisée ici aussi, et pas seulement au DTO · le siège et la console
    // appellent `register` sans passer par la porte HTTP (audit final F43).
    dto = { ...dto, email: normaliserCourriel(dto.email) };
    // SORTIE DE CLOISONNEMENT · la recherche se fait par COURRIEL, qui est
    // unique sur toute la plateforme et ne relève encore d'aucun dossier. Sans
    // cette déclaration, une création lancée depuis la console de l'opérateur
    // (dont la session porte SON dossier) verrait la garde traiter le compte
    // cherché comme inexistant, et le doublon passerait.
    const emailExistant = await horsCloisonnement('inscription · unicité du courriel sur toute la plateforme', () =>
      this.prisma.user.findUnique({ where: { email: dto.email } }),
    );
    if (emailExistant) {
      throw new ConflictException('Un compte existe déjà avec cet email');
    }

    // SUR SITE · un dossier de plus n'ouvre que si la licence de
    // l'installation le couvre, et il naît sous la licence de l'installation,
    // quoi qu'en dise l'appelant · une cellule de groupe créée par le siège
    // est un dossier comme un autre, et compte. LE DOSSIER DE COMBINAISON NE
    // COMPTE PAS (audit final F170) · technique, régénéré à chaque liasse du
    // groupe, personne n'y travaille, et il prenait la place d'un dossier
    // vendu dès la première liasse.
    if (this.surSite?.surSite) {
      const ouverts = await horsCloisonnement('installation sur site · plafond de dossiers de la licence', () =>
        this.prisma.tenant.count({ where: { combinaisonPour: null } }),
      );
      this.surSite.verifierPlafondDossiers(ouverts);
      dto = { ...dto, typeLicence: TypeLicence.PERPETUEL_ONPREMISE };
    }

    const motDePasseHache = await bcrypt.hash(dto.motDePasse, SALT_ROUNDS);
    const idDossier = randomUUID();

    // `timeout` généreux et assumé : le semis enchaîne environ quatre-vingts
    // allers-retours vers Neon (le plan entier en une passe, puis journaux,
    // taxes et familles compte par compte), ce qui dépasse largement les cinq
    // secondes par défaut de Prisma. Une inscription est un geste rare : la
    // tenir trente secondes ne coûte rien, et échouer à mi-chemin coûterait
    // un dossier inutilisable.
    const { tenant, user, exercice } = await transactionJournalisee(
      this.prisma,
      // LE JOURNAL D'AUDIT S'ÉCRIT DANS CETTE TRANSACTION · écrit à part, il
      // désignait un dossier que sa connexion ne voyait pas encore, et la clé
      // étrangère refusait chaque maillon de la création (contexte-audit.ts).
      (tx) =>
        // LE DOSSIER QUI NAÎT EST LE DOSSIER DE L'ACTE, DÈS SA CRÉATION · depuis
        // la console ou le siège, la session porte un AUTRE dossier, et la
        // garde de cloisonnement tenait chaque écriture du semis pour une
        // écriture chez un voisin. La CRÉATION du dossier elle-même y tombait
        // encore : son maillon d'audit ouvre la chaîne du nouveau dossier, et
        // il était refusé comme une écriture chez un voisin (création d'une
        // cellule par le siège en 500, vu sur une base réelle le 2026-09-27).
        // L'identifiant est donc tiré AVANT, et tout ce qui suit s'exécute au
        // nom du dossier créé, l'acteur restant celui qui crée (journal
        // d'audit). L'inscription publique, sans session, n'y voit aucune
        // différence.
        dansContexteAudit({ ...(acteurCourant() ?? { acteurEmail: ACTEUR_SYSTEME }), tenantId: idDossier }, async () => {
        // Les DEUX référentiels se sèment désormais (SYCEBNL depuis l'origine,
        // SYSCOHADA depuis compte-seed-syscohada.ts) · le refus historique du
        // SYSCOHADA est levé. Un dossier SYSCOHADA se TIENT et s'IMPRIME
        // complètement : plan, journaux, taxes, immobilisations, éditions, puis
        // les états des deux systèmes de l'AUDCIF art. 11 (Système normal du
        // Titre IX, Système minimal de trésorerie du Titre X) et les notes
        // annexes du Titre IX ch. 6, servis par leur PROPRE contrôleur
        // (etats-financiers-syscohada). Chaque jeu reste cloisonné sur son
        // référentiel par @ReferentielsAutorises : les deux ne partagent aucun
        // poste, aucun compte, aucun libellé. Les documents obligatoires sont
        // COMMUNS, chacun lu dans son texte (CLAUDE.md § 6) ; restent propres
        // au SYCEBNL les fenêtres bâties sur ses seuls textes.
        const tenant = await this.tenantService.creerTenant({
          id: idDossier,
          nom: dto.nomEntite,
          referentiel: dto.referentiel,
          typeLicence: dto.typeLicence ?? TypeLicence.ABONNEMENT,
          // Le jeu d'états est un concept SYCEBNL (art. 4 à 6) · jamais retenu
          // pour un dossier SYSCOHADA, même si le DTO en portait un.
          jeuEtatsFinanciersSycebnl: dto.referentiel === Referentiel.SYCEBNL ? dto.jeuEtatsFinanciersSycebnl : undefined,
          // Symétriquement, le système comptable de l'AUDCIF ne concerne QUE le
          // SYSCOHADA · Système normal par défaut, régime de droit commun de
          // l'art. 11 (« toute entité est, sauf exception liée à sa taille,
          // soumise au Système normal »).
          systemeComptableSyscohada:
            dto.referentiel === Referentiel.SYSCOHADA
              ? (dto.systemeComptableSyscohada ?? SystemeComptableSyscohada.NORMAL)
              : undefined,
          activite: dto.activite,
          adresse: dto.adresse,
          ville: dto.ville,
          pays: dto.pays,
          telephone: dto.telephone,
        }, tx);

        {

          const user = await tx.user.create({
            data: {
              tenantId: tenant.id,
              email: dto.email,
              motDePasse: motDePasseHache,
              role: RoleUtilisateur.ADMIN_CABINET,
            },
          });

          await this.compteService.seedPlan(tenant.id, dto.referentiel, tx);
          // Les journaux par défaut référencent des comptes de trésorerie du plan
          // qui vient d'être semé : le seed des comptes doit donc toujours précéder
          // celui des journaux. Même contrainte pour les taux de TVA et les
          // familles d'immobilisations. Les numéros référencés sont PROPRES à
          // chaque référentiel (caisse 5710/5711, TVA déductible 4451/4452,
          // mobilier 2441/2444... · voir chaque fichier *-seed.ts).
          await this.journalService.seedJournauxDefaut(tenant.id, dto.referentiel, tx);
          await this.tauxTvaService.seedTauxDefaut(tenant.id, dto.referentiel, tx);
          await this.immobilisationService.seedFamillesDefaut(tenant.id, dto.referentiel, tx);
          // Axes analytiques Projets (+ Bailleurs en SYCEBNL) · aucune dépendance
          // sur les comptes, mais placés ici pour que le dossier soit prêt à
          // ventiler dès la première écriture.
          await this.analytiqueService.seedPlansDefaut(tenant.id, dto.referentiel, tx);
          // Trois niveaux de relance, au ton d'une association à ses membres ou
          // d'une entreprise à ses clients selon le référentiel · voir
          // RelancesService.NIVEAUX_DEFAUT. Ces lettres partent vraiment, sous
          // la signature du dossier : c'est le seul texte du logiciel qui sort
          // de l'écran.
          await this.relancesService.seedNiveauxDefaut(tenant.id, dto.referentiel, tx);
          const exercice =
            dto.dateDebutExercice && dto.dateFinExercice
              ? await this.exerciceService.creer(
                  tenant.id,
                  { dateDebut: dto.dateDebutExercice, dateFin: dto.dateFinExercice },
                  tx,
                )
              : await this.exerciceService.creerExerciceCourant(tenant.id, tx);

          return { tenant, user, exercice };
        }
      }),
      { maxWait: 10_000, timeout: 30_000 },
    );

    return {
      tenant: {
        id: tenant.id,
        nom: tenant.nom,
        referentiel: tenant.referentiel,
        jeuEtatsFinanciersSycebnl: siSycebnl(tenant.referentiel, tenant.jeuEtatsFinanciersSycebnl),
        systemeComptableSyscohada: tenant.systemeComptableSyscohada,
        numeroImpot: tenant.numeroImpot,
      },
      exercice,
      // Session courte · un dossier naissant n'a pas coché « Rester connecté ».
      ...emettreSession(this.jwt, user.id, { longue: false }),
    };
  }

  /**
   * LE DOSSIER D'INSTALLATION (audit final F44) · sur site, le premier dossier
   * créé sur le poste. Son administrateur tient ce qui vaut pour TOUTE
   * l'installation · les sauvegardes, qui sont un `pg_dump` de la base
   * entière, et la création des dossiers suivants. L'administrateur d'un
   * autre dossier n'a aucun droit sur les données de ses voisins, et une
   * sauvegarde les lui donnerait toutes. Aucune colonne ne le désigne · le
   * premier dossier est un fait, lu à chaque demande, qu'aucun geste ne
   * déplace.
   */
  async dossierDInstallation(): Promise<string | null> {
    const t = await horsCloisonnement('installation sur site · le premier dossier du poste', () =>
      this.prisma.tenant.findFirst({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true } }),
    );
    return t?.id ?? null;
  }

  /**
   * L'inscription publique d'une installation sur site ne sert qu'au PREMIER
   * dossier (audit final F44) · ouverte à demeure, elle rendait à tout poste
   * du réseau un administrateur de dossier. Les suivants se créent depuis le
   * dossier d'installation.
   */
  async premierDossierAttendu(): Promise<boolean> {
    const ouverts = await horsCloisonnement('installation sur site · un dossier existe-t-il déjà', () => this.prisma.tenant.count());
    return ouverts === 0;
  }

  async login(dto: LoginDto) {
    // SORTIE DE CLOISONNEMENT · à la connexion, on ne sait pas encore de quel
    // dossier relève celui qui se présente. C'est cette requête qui l'apprend.
    const user = await horsCloisonnement('connexion · le dossier n’est pas encore connu', () =>
      this.prisma.user.findUnique({ where: { email: normaliserCourriel(dto.email) } }),
    );

    // UNE CONNEXION REFUSÉE NE DIT PAS SI LE COMPTE EXISTE, ni par son message
    // ni par sa durée (audit final F238). Trois cas se ressemblent désormais
    // de l'extérieur · adresse inconnue, mot de passe faux, compte verrouillé.
    // Les trois font tourner bcrypt une fois, et les trois rendent le MÊME
    // message (`MOTIF_IDENTIFIANTS_INVALIDES`). IL RESTE UNE DIFFÉRENCE, et
    // elle est dite plutôt que tue · sur un compte connu, non verrouillé, au
    // mot de passe faux, le décompte des échecs s'écrit en base, et `User`
    // est au journal d'audit (pré-image, mise à jour, maillon dans sa propre
    // transaction), soit plusieurs allers-retours que les deux autres cas
    // n'ont pas · quelques millisecondes à quelques dizaines, contre environ
    // trois cents pour bcryptjs à douze tours. Le verrou borne l'échantillon
    // à cinq essais par fenêtre, et `@Throttle` le débit par adresse. Le
    // rendre indiscernable demanderait un plancher de durée sur tout refus,
    // qui n'est pas posé (relecture adverse de l'audit final F238).
    if (!user) {
      await bcrypt.compare(dto.motDePasse, EMPREINTE_FACTICE);
      throw new UnauthorizedException(MOTIF_IDENTIFIANTS_INVALIDES);
    }

    const maintenant = new Date();
    // bcrypt TOURNE AVANT LE VERROU, et c'est le contraire de ce que ce code
    // faisait jusqu'au 2026-09-28. Le verrou répondait sans hachage, pour ne
    // pas offrir un levier d'épuisement du processeur ; mais une adresse
    // inconnue fait désormais tourner bcrypt elle aussi (empreinte factice),
    // si bien que le raccourci ne protégeait plus rien, et que sa RAPIDITÉ
    // disait « ce compte existe et il est verrouillé ». Le débit reste borné
    // par adresse IP (`@Throttle` de la route, vingt essais par minute).
    const motDePasseValide = await bcrypt.compare(dto.motDePasse, user.motDePasse);

    // LE VERROU TIENT, MÊME SUR LE BON MOT DE PASSE · et il ne le dit pas.
    // Dire « verrouillé » au seul bon mot de passe apprendrait à qui essaie des
    // mots de passe lequel est le bon · il n'aurait plus qu'à attendre la fin
    // du verrou. Le message commun nomme la suspension sans dire si elle
    // frappe ce compte. Un essai pendant le verrou n'est pas compté · le
    // compter prolongerait le verrou au gré de qui connaît l'adresse, et
    // l'adresse d'un comptable n'est pas un secret (verrouillage.ts).
    if (user.verrouilleJusqua && user.verrouilleJusqua > maintenant) {
      throw new UnauthorizedException(MOTIF_IDENTIFIANTS_INVALIDES);
    }

    // Le compteur NE repart PLUS de zéro à l'échéance du verrou · il
    // s'oublie douze heures après le DERNIER échec (`decompteApresEchec`,
    // verrouillage.ts). Remis à zéro à l'échéance, il laissait l'attaquant
    // patient au palier d'une minute pour toujours. Un code de vérification
    // faux compte comme un mot de passe faux · sans quoi six chiffres se
    // devineraient à l'infini derrière un mot de passe volé.
    const compterEchec = () =>
      horsCloisonnement('connexion · décompte des échecs sur un compte non encore identifié', () =>
        this.prisma.user.update({
          where: { id: user.id },
          data: decompteApresEchec(user, maintenant),
        }),
      );

    if (!motDePasseValide) {
      await compterEchec();
      // Le message reste le MÊME que pour un compte inexistant · dire « mot de
      // passe faux » apprendrait que l'adresse existe.
      throw new UnauthorizedException(MOTIF_IDENTIFIANTS_INVALIDES);
    }

    if (!user.estActif) {
      throw new UnauthorizedException('Ce compte a été désactivé');
    }

    // SECOND FACTEUR · sans code, la réponse dit seulement qu'il en faut un,
    // et aucune session n'est posée. Le mot de passe est redemandé avec le
    // code : aucun état intermédiaire n'est gardé entre les deux appels. La
    // case « Rester connecté » voyage de même avec le code, relue au second
    // appel comme le mot de passe (audit final F270).
    let consomme: Record<string, unknown> = {};
    if (user.doubleAuthActiveDepuis) {
      if (!dto.code?.trim()) return { deuxiemeFacteurRequis: true as const };
      const r = secondFacteurAccepte(user, dto.code, maintenant.getTime());
      if (!r) {
        await compterEchec();
        throw new UnauthorizedException('Code de vérification invalide');
      }
      consomme = r;
    }

    // Connexion réussie · le compteur d'échecs et le verrou tombent.
    // `> 0` et non `!== 0` · le compteur vaut 0 par défaut en base, mais
    // écrire l'inégalité stricte ferait tourner une écriture inutile à chaque
    // connexion sur tout compte dont le champ n'est pas encore servi.
    if (user.tentativesEchouees > 0 || user.verrouilleJusqua || user.dernierEchecLe || Object.keys(consomme).length > 0) {
      await horsCloisonnement('connexion · remise à zéro du décompte', () =>
        this.prisma.user.update({
          where: { id: user.id },
          data: { ...DECOMPTE_REMIS_A_ZERO, ...consomme },
        }),
      );
    }

    // « RESTER CONNECTÉ SUR CET APPAREIL » (audit final F270) · la case est
    // décochée par défaut, et seul `true` l'est · une valeur absente ou fausse
    // ouvre une session courte. JAMAIS POUR LA CONSOLE DE L'ÉDITEUR, même case
    // cochée · refusé ICI, au serveur, et relu à chaque requête par
    // JwtStrategy. La connexion n'est pas refusée pour autant · elle s'ouvre
    // en session courte, et la réponse le dit.
    const demandee = dto.resterConnecte === true;
    const longue = demandee && !user.estOperateurPlateforme;
    return {
      ...emettreSession(this.jwt, user.id, { longue }),
      ...(demandee && !longue ? { motifSessionCourte: MOTIF_CONSOLE_SANS_SESSION_LONGUE } : {}),
    };
  }

  // ── DOUBLE AUTHENTIFICATION ─────────────────────────────────────────────
  //
  // Ouverte à tout utilisateur, EXIGÉE pour la console de la plateforme
  // (OperateurPlateformeGuard) · la console tient les licences et les
  // administrateurs de tous les cabinets. L'exiger de chaque administrateur
  // de dossier fermerait des cabinets entiers le jour du déploiement, tant
  // qu'ils n'ont pas d'application d'authentification.

  private async compteDoubleAuth(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw new UnauthorizedException('Utilisateur introuvable');
    return u;
  }

  async etatDoubleAuth(userId: string) {
    const u = await this.compteDoubleAuth(userId);
    return {
      active: u.doubleAuthActiveDepuis !== null,
      depuis: u.doubleAuthActiveDepuis,
      codesSecoursRestants: u.doubleAuthActiveDepuis ? u.codesSecoursDoubleAuth.length : 0,
      exigeePourLaConsole: u.estOperateurPlateforme,
    };
  }

  /** Pose un secret NEUF, qui ne vaut rien tant qu'un premier code ne l'a pas confirmé. */
  async initierDoubleAuth(userId: string) {
    const u = await this.compteDoubleAuth(userId);
    if (u.doubleAuthActiveDepuis) throw new BadRequestException('La double authentification est déjà active · désactivez-la d’abord.');
    const secret = genererSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { secretDoubleAuth: secret } });
    return { secret, uri: uriOtpauth(secret, u.email) };
  }

  /**
   * LE MOT DE PASSE ACTUEL D'ABORD, PUIS LE CODE, et le même refus que le
   * retrait. OWASP ASVS 5.0, exigence 7.5.1 (« full re-authentication » avant
   * de modifier la configuration du second facteur), et NIST SP 800-63B-4
   * (un authentificateur ne se lie qu'après une authentification préalable) ·
   * une session « Rester connecté » peut dater de trente jours, et volée, elle
   * installerait sa propre application et fermerait la porte au titulaire.
   * Comme au retrait, un mot de passe ou un code faux ne compte pas au verrou
   * de connexion · il est déjà borné par le `@Throttle` de la route.
   *
   * Le premier code juste l'active · les codes de secours sont rendus UNE
   * fois, ici, et seules leurs empreintes restent. Les autres sessions sont
   * fermées : aucune n'a présenté de second facteur. Le titulaire est averti
   * par courriel, hors de la session (`aviserDoubleAuth`).
   */
  async activerDoubleAuth(
    userId: string,
    motDePasseActuel: string,
    code: string,
    maintenant = new Date(),
    session: SessionEnCours | null = null,
  ) {
    const u = await this.compteDoubleAuth(userId);
    if (u.doubleAuthActiveDepuis) throw new BadRequestException('La double authentification est déjà active.');
    if (!u.secretDoubleAuth) throw new BadRequestException('Affichez d’abord la clé à enregistrer dans l’application.');
    if (!(await bcrypt.compare(motDePasseActuel, u.motDePasse))) throw new UnauthorizedException('Le mot de passe actuel est incorrect');
    const pas = verifierCodeTotp(u.secretDoubleAuth, code, maintenant.getTime(), null);
    if (pas === null) {
      throw new BadRequestException('Code invalide · vérifiez que l’heure du téléphone est à l’heure, puis saisissez le code affiché.');
    }
    const { codes, empreintes } = genererCodesSecours();
    await this.prisma.user.update({
      where: { id: userId },
      data: { doubleAuthActiveDepuis: maintenant, dernierPasDoubleAuth: pas, codesSecoursDoubleAuth: empreintes, sessionsInvalidesAvant: maintenant },
    });
    await this.aviserDoubleAuth(u, 'ACTIVEE', maintenant);
    return { codesSecours: codes, ...this.reemettre(u, session) };
  }

  /** Mot de passe ET second facteur · un poste laissé ouvert ne suffit pas à la retirer. */
  async desactiverDoubleAuth(userId: string, motDePasse: string, code: string, maintenant = new Date(), session: SessionEnCours | null = null) {
    const u = await this.compteDoubleAuth(userId);
    if (!u.doubleAuthActiveDepuis) throw new BadRequestException('La double authentification n’est pas active.');
    if (!(await bcrypt.compare(motDePasse, u.motDePasse))) throw new UnauthorizedException('Le mot de passe actuel est incorrect');
    if (!secondFacteurAccepte(u, code, maintenant.getTime())) throw new UnauthorizedException('Code de vérification invalide');
    await this.prisma.user.update({
      where: { id: userId },
      data: { secretDoubleAuth: null, doubleAuthActiveDepuis: null, dernierPasDoubleAuth: null, codesSecoursDoubleAuth: [], sessionsInvalidesAvant: maintenant },
    });
    await this.aviserDoubleAuth(u, 'RETIREE', maintenant);
    return { desactivee: true, ...this.reemettre(u, session) };
  }

  /**
   * De nouveaux codes de secours · les anciens cessent de valoir. Mot de passe
   * ET code, comme le retrait · GitHub range cette régénération sous son
   * « sudo mode », et un code du téléphone présenté par une session volée ne
   * prouve pas qui la tient.
   */
  async regenererCodesSecours(userId: string, motDePasseActuel: string, code: string, maintenant = new Date()) {
    const u = await this.compteDoubleAuth(userId);
    if (!u.doubleAuthActiveDepuis) throw new BadRequestException('La double authentification n’est pas active.');
    if (!(await bcrypt.compare(motDePasseActuel, u.motDePasse))) throw new UnauthorizedException('Le mot de passe actuel est incorrect');
    const r = secondFacteurAccepte(u, code, maintenant.getTime());
    if (!r) throw new UnauthorizedException('Code de vérification invalide');
    const { codes, empreintes } = genererCodesSecours();
    await this.prisma.user.update({ where: { id: userId }, data: { ...r, codesSecoursDoubleAuth: empreintes } });
    await this.aviserDoubleAuth(u, 'CODES_SECOURS_REGENERES', maintenant);
    return { codesSecours: codes };
  }

  /**
   * L'AVIS HORS BANDE (NIST SP 800-63B-4, notification du titulaire quand un
   * authentificateur est lié ou retiré). Il est écrit APRÈS l'acte, et un
   * échec de mise en file ne le défait JAMAIS · l'acte est fait, c'est un avis
   * qui manque. Sans messagerie posée, le message attend en file
   * (SANS_TRANSPORT), comme partout. L'échec est consigné au journal du
   * serveur, jamais rendu à l'écran, qui dirait sinon « échoué » sur un second
   * facteur bel et bien activé.
   */
  private async aviserDoubleAuth(u: { id: string; tenantId: string; email: string }, evenement: EvenementDoubleAuth, instant: Date) {
    if (!this.courrier) return;
    try {
      await this.courrier.mettreEnFile(u.tenantId, {
        destinataire: u.email,
        ...avisDoubleAuth(evenement, { email: u.email, instant }),
        origine: ORIGINE_DOUBLE_AUTHENTIFICATION,
        origineId: u.id,
        createdBy: u.id,
      });
    } catch (erreur) {
      this.logger.warn(`Avis de double authentification non mis en file · ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  }

  /**
   * Changement de son propre mot de passe. Vérifie l'ACTUEL avant tout (un
   * poste laissé ouvert ne permet pas d'évincer le titulaire), et efface
   * doitChangerMotDePasse : c'est le geste qui clôt la période où un tiers
   * (console plateforme, siège de groupe, admin du dossier) connaissait le
   * mot de passe.
   */
  async changerMotDePasse(userId: string, motDePasseActuel: string, nouveauMotDePasse: string, session: SessionEnCours | null = null) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }
    const actuelValide = await bcrypt.compare(motDePasseActuel, user.motDePasse);
    if (!actuelValide) {
      throw new UnauthorizedException('Le mot de passe actuel est incorrect');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        motDePasse: await bcrypt.hash(nouveauMotDePasse, SALT_ROUNDS),
        doitChangerMotDePasse: false,
        // RÉVOCATION · un mot de passe change souvent PARCE QU'IL A FUITÉ.
        // Sans cette ligne, celui qui le détenait gardait sa session ouverte
        // jusqu'à huit heures, trente jours pour une session « Rester
        // connecté » (audit final F270), et le changement ne servait à rien
        // pour la seule période où il aurait servi.
        sessionsInvalidesAvant: new Date(),
        // Un mot de passe changé délie aussi le verrou · le titulaire a
        // prouvé qui il est en donnant l'ancien.
        ...DECOMPTE_REMIS_A_ZERO,
      },
    });
    // La session COURANTE est révoquée elle aussi · c'est voulu. Le client
    // redemande un jeton juste après (voir AuthController), et rien ne
    // distingue, côté serveur, la session du titulaire de celle du voleur.
    return { change: true, ...this.reemettre(user, session) };
  }

  /**
   * CHANGER SA PROPRE ADRESSE DE CONNEXION · l'adresse est l'identifiant de
   * connexion, unique dans tout le logiciel. Trois règles.
   *  · le mot de passe actuel est exigé, comme pour le changer ;
   *  · l'unicité est tenue par la contrainte de la base et non par une
   *    lecture préalable, qui devrait sortir du cloisonnement pour chercher
   *    l'adresse chez les autres dossiers · une adresse prise est refusée
   *    sans dire à qui elle appartient ;
   *  · les sessions sont fermées puis une neuve reposée, comme au changement
   *    de mot de passe. Le rôle, le dossier et le drapeau d'opérateur sont
   *    sur le COMPTE, pas sur l'adresse : ils suivent.
   */
  async changerAdresse(userId: string, motDePasseActuel: string, nouvelleAdresse: string, session: SessionEnCours | null = null) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Utilisateur introuvable');
    if (!(await bcrypt.compare(motDePasseActuel, user.motDePasse))) {
      throw new UnauthorizedException('Le mot de passe actuel est incorrect');
    }
    const adresse = normaliserCourriel(nouvelleAdresse);
    if (adresse === user.email) throw new BadRequestException("C'est déjà votre adresse de connexion.");
    try {
      await this.prisma.user.update({ where: { id: userId }, data: { email: adresse, sessionsInvalidesAvant: new Date() } });
    } catch (e) {
      if ((e as { code?: string })?.code === 'P2002') {
        throw new ConflictException('Cette adresse est déjà utilisée par un autre compte.');
      }
      throw e;
    }
    return { adresse, ...this.reemettre(user, session) };
  }

  /**
   * « DÉCONNECTER MES AUTRES APPAREILS » (audit final F270) · une session
   * longue vit trente jours, et un appareil perdu ou prêté la garde. Ferme
   * toutes les sessions du compte (`sessionsInvalidesAvant`, comparé à la
   * SECONDE par `sessionRevoquee`) et en repose AUSSITÔT une pour l'appareil
   * qui le demande, qui garde son choix « Rester connecté » et son origine ·
   * fermer ses autres appareils ne doit ni éjecter celui-ci ni lui rendre
   * trente jours neufs. Le mot de passe actuel est exigé, comme pour tout
   * acte qui touche aux accès · un poste laissé ouvert ne doit pas pouvoir
   * évincer le titulaire de ses autres appareils.
   *
   * La révocation et l'émission partagent le même instant · le jeton neuf
   * porte une émission que la comparaison à la seconde ne tient pas pour
   * antérieure à sa propre révocation. Limite connue, celle de toute
   * révocation · un jeton émis ailleurs DANS LA MÊME SECONDE survit.
   */
  async deconnecterAutresAppareils(
    userId: string,
    motDePasseActuel: string,
    session: SessionEnCours | null,
    maintenant = new Date(),
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Utilisateur introuvable');
    if (!(await bcrypt.compare(motDePasseActuel, user.motDePasse))) {
      throw new UnauthorizedException('Le mot de passe actuel est incorrect');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { sessionsInvalidesAvant: maintenant } });
    return { autresAppareilsDeconnectes: true, ...this.reemettre(user, session, maintenant.getTime()) };
  }

  /**
   * Ferme toutes les sessions du compte. Un seul champ à poser · aucune table
   * de sessions à tenir, aucune purge à programmer.
   */
  async deconnecterPartout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { sessionsInvalidesAvant: new Date() },
    });
    return { sessionsFermees: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: { include: { _count: { select: { cellules: true } } } } },
    });
    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      // Ouvre l'entrée de menu « Cabinets clients » côté client · le serveur
      // ne se fie jamais à ce que le client en fait : OperateurPlateformeGuard
      // relit le drapeau à chaque requête (via JwtStrategy).
      estOperateurPlateforme: user.estOperateurPlateforme,
      // Le client force l'écran de changement de mot de passe avant
      // l'espace de travail tant que ce drapeau est vrai.
      doitChangerMotDePasse: user.doitChangerMotDePasse,
      tenant: {
        id: user.tenant.id,
        nom: user.tenant.nom,
        referentiel: user.tenant.referentiel,
        // N'a de sens que si referentiel = SYCEBNL (voir prisma/schema.prisma) ·
        // le front s'en sert pour choisir le jeu d'états financiers à afficher.
        jeuEtatsFinanciersSycebnl: siSycebnl(user.tenant.referentiel, user.tenant.jeuEtatsFinanciersSycebnl),
        // Pendant SYSCOHADA · null pour un dossier SYCEBNL (voir le schéma).
        systemeComptableSyscohada: user.tenant.systemeComptableSyscohada,
        // Monnaie de tenue du dossier · portée jusqu'au front pour l'en-tête
        // d'impression : « l'unité monétaire dans laquelle sont exprimés les
        // états financiers » est l'une des trois mentions que les états
        // doivent comporter obligatoirement, et elle doit figurer « dans
        // chacune des pages des états financiers publiés » (AUDCIF Titre IX
        // ch. 1 § 2.4). Nullable : un dossier ancien peut ne pas la porter,
        // l'en-tête omet alors la mention au lieu d'inventer une monnaie.
        devise: user.tenant.devise,
        // Porté jusqu'au front pour l'en-tête d'impression : le n° impôt doit
        // figurer sur chaque page d'un état déposé (CPCC, § 7.4 règle 7-a).
        numeroImpot: user.tenant.numeroImpot,
        // AUSCGIE art. 17 · forme, capital, siège et RCCM à côté de la
        // dénomination d'une société ; pour les autres formes SYSCOHADA,
        // l'immatriculation de l'AUDCG (art. 14, 59, 62 et 140) · `null` en
        // SYCEBNL (`tenant/mentions-societe.ts`, `mentionsEmetteur`).
        mentionsSociete: mentionsEmetteur(identiteSociete(user.tenant)).ligne,
        // Dossier mère d'un groupe d'établissements · ouvre l'entrée de menu
        // « Balance agrégée du groupe » (le serveur re-vérifie de toute façon
        // le lien à chaque appel /groupe).
        nombreCellules: user.tenant._count.cellules,
        // Le siège qui n'a encore AUCUNE cellule doit pouvoir ouvrir la
        // fenêtre du groupe, qui est aussi celle qui les crée · sans ce
        // drapeau, un plafond posé par la console restait sans porte.
        // Mêmes conditions que `GroupeService.creerCellule` : un plafond
        // posé, et pas soi-même cellule d'un autre dossier.
        peutCreerCellules: user.tenant.plafondCellules !== null && user.tenant.dossierMereId === null,
        // FAIT DÉCLARÉ qui commande un menu · l'accord-cadre (loi n° 004/2001,
        // art. 37) ne vise que l'ONG de droit étranger. `null` hors SYCEBNL,
        // où la question ne se pose pas. Même règle que le module.
        ongEtrangere:
          user.tenant.referentiel === Referentiel.SYCEBNL
            ? articleTrenteSeptApplicable(user.tenant.formeJuridique, user.tenant.droitEtranger)
            : null,
        // DEUX FAITS DÉCLARÉS de plus · `null` = pas encore dit, et rien ne se
        // masque sur lui (`tenant/faits-declares.ts`).
        assujettissementTva: faitAssujettissementTva(user.tenant),
        venteBiensServices: user.tenant.venteBiensServices,
        // Modules affichés · masquer n'est pas refuser (`tenant/modules-optionnels.ts`).
        modulesActives: normaliserModules(user.tenant.modulesActives ?? []),
        // Longueur MAXIMALE des numéros que le cabinet ouvre (audit final
        // F144) · l'écran du plan de comptes l'imposait à huit, alors que le
        // dossier la porte jusqu'à treize (`CompteService.creer` la relit).
        longueurCompte: user.tenant.longueurCompte,
        // LA VITRINE SE DIT FICTIVE SUR CHAQUE ÉCRAN · le bandeau du chrome le
        // lit ici. Le drapeau du dossier, jamais son nom (`plateforme.service.ts`,
        // point 3) · un client qui s'appellerait « Démo » n'est pas une vitrine.
        // Un faux strict · une valeur absente ne fait pas un dossier fictif.
        estDemonstration: user.tenant.estDemonstration === true,
      },
    };
  }

  /**
   * RÉÉMET LA SESSION DE CET APPAREIL après un acte qui a fermé toutes les
   * autres (mot de passe, adresse, double authentification, autres appareils
   * déconnectés). Elle garde son régime et son origine (audit final F270) ·
   * une session longue qui redeviendrait courte ferait perdre « Rester
   * connecté » au premier changement de mot de passe, et une session courte
   * qui repartirait pour huit heures dépasserait les huit heures annoncées.
   * La console de l'éditeur ne reçoit jamais de session longue · JwtStrategy
   * la refuse déjà, et c'est redit ici, où le compte est sous la main.
   *
   * La charge reste minimale (voir `emettreSession`) · JwtStrategy.validate
   * relit dossier, adresse et rôle en base à chaque requête plutôt que de leur
   * faire confiance, pour qu'un rôle changé ou un compte désactivé prenne
   * effet tout de suite. Le claim `csrf` appareille le jeton de session
   * (cookie httpOnly) et le jeton CSRF que l'écran rejoue en en-tête
   * X-CSRF-Token · voir session.constants.ts et jwt.strategy.ts.
   */
  private reemettre(
    user: { id: string; estOperateurPlateforme?: boolean },
    session: SessionEnCours | null,
    instantMs?: number,
  ): SessionEmise {
    const demande = demandeDeReemission(session);
    return emettreSession(
      this.jwt,
      user.id,
      demande.longue && user.estOperateurPlateforme ? { longue: false } : demande,
      instantMs,
    );
  }
}
