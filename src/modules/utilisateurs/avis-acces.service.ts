import { Injectable } from '@nestjs/common';
import { RoleUtilisateur, StatutMessage } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { CourrierService, ORIGINE_MOT_DE_PASSE_TEMPORAIRE } from '../courrier/courrier.service';

/**
 * L'AVIS D'ACCÈS · ce que le titulaire n'apprenait nulle part.
 *
 * Un compte se crée et un mot de passe se réinitialise depuis la fenêtre
 * Autorisations d'accès, et le titulaire n'en était averti PAR RIEN. Dans le
 * meilleur des cas l'administrateur décrochait son téléphone ; dans le pire,
 * un comptable voyait ses sessions se fermer sous lui sans savoir pourquoi,
 * ce qui, du point de vue de celui qui le subit, ne se distingue pas d'une
 * intrusion.
 *
 * ------------------------------------------------------------------------
 * LE MOT DE PASSE PROVISOIRE N'EST PAS DANS LE MESSAGE, ET C'EST LE POINT
 * ------------------------------------------------------------------------
 * Le corps d'un message est écrit EN CLAIR dans la table `messages`. Il y
 * reste après l'envoi · un message envoyé, échoué ou abandonné demeure
 * lisible, c'est une décision assumée de la migration
 * 20260914180000_file_des_courriels. Il part dans la sauvegarde de chaque
 * nuit, et se relit sur le poste de test où cette sauvegarde est restaurée.
 * Et `GET /courrier/:id` rend ce corps ENTIER à tout utilisateur du dossier,
 * y compris en lecture seule.
 *
 * Y écrire le mot de passe provisoire d'un collègue le donnerait donc à tout
 * le dossier, et pour toujours. Ce serait pire que le silence d'hier.
 *
 * Le mot de passe est d'ailleurs CHOISI par l'administrateur, pas engendré
 * par le logiciel (voir CreerUtilisateurDto et ReinitialiserMotDePasseDto) :
 * il l'a sous les yeux au moment où il le tape, et c'est lui qui le remet, de
 * vive voix. Ce message n'a donc rien à remplacer · il AJOUTE ce que personne
 * ne disait au titulaire, à savoir que l'accès existe, sous quelle adresse,
 * qu'il est provisoire, qu'il devra être changé, et qu'il faut se manifester
 * si on ne l'attendait pas. `avis-acces.spec.ts` fait tomber le test le jour
 * où un mot de passe reparaîtrait dans un corps.
 *
 * ------------------------------------------------------------------------
 * L'AVIS N'EST JAMAIS UNE CONDITION DE L'ACCÈS
 * ------------------------------------------------------------------------
 * Aucune méthode d'ici ne lève. Le compte est créé, le mot de passe est posé,
 * les sessions sont fermées : tout cela a déjà eu lieu quand l'avis est
 * composé. Faire échouer la requête parce que la file a refusé une adresse
 * rendrait la création de comptes impossible sur une installation sans
 * messagerie, c'est-à-dire sur celle d'aujourd'hui. Le compte rendu dit ce
 * qui s'est passé, et l'écran le montre.
 */

/**
 * Les trois rôles, nommés comme la fenêtre les nomme
 * (client/src/pages/UtilisateursPage.tsx) · un titulaire qui lit
 * « ADMIN_CABINET » dans son courriel et « Administrateur » à l'écran se
 * demande légitimement s'il s'agit du même droit.
 */
export const LIBELLE_ROLE: Record<RoleUtilisateur, string> = {
  [RoleUtilisateur.ADMIN_CABINET]: 'Administrateur',
  [RoleUtilisateur.COMPTABLE]: 'Comptable',
  [RoleUtilisateur.LECTURE_SEULE]: 'Lecture seule',
};

/** Ce qu'il est advenu de l'avis · rendu à l'administrateur qui a agi. */
export interface AvisRemis {
  /** Un message a-t-il été ÉCRIT dans la file (envoyé ou non, c'est autre chose). */
  avise: boolean;
  destinataire: string;
  /** L'état dans la file, SANS_TRANSPORT compris · `null` si rien n'y est entré. */
  statut: StatutMessage | null;
  /** Ce qui a empêché l'avis, en toutes lettres · `null` quand il est en file. */
  motif: string | null;
}

export interface TexteAvis {
  sujet: string;
  corps: string;
}

/** « au dossier « X » » quand le dossier a un nom, sinon rien qui fasse croire. */
function mention(entite: string): string {
  const nom = entite.trim();
  return nom.length > 0 ? ` (${nom})` : '';
}

function signature(entite: string): string {
  return entite.trim().length > 0 ? entite.trim() : 'OmegaX';
}

function designation(entite: string): string {
  const nom = entite.trim();
  return nom.length > 0 ? `au dossier « ${nom} »` : 'à un dossier';
}

/** L'avis d'ouverture d'un accès · le mot de passe n'y figure pas, voir en tête. */
export function avisCompteCree(params: { entite: string; email: string; role: RoleUtilisateur }): TexteAvis {
  return {
    sujet: `OmegaX · un accès a été ouvert à votre nom${mention(params.entite)}`,
    corps: [
      'Madame, Monsieur,',
      '',
      `Un accès ${designation(params.entite)} vient d'être ouvert à votre nom dans OmegaX, avec le rôle « ${LIBELLE_ROLE[params.role]} ».`,
      '',
      `Votre identifiant est votre adresse de courriel : ${params.email}.`,
      '',
      "Votre mot de passe ne figure pas dans ce message. Il est provisoire, il a été choisi par l'administrateur qui a ouvert votre accès, et c'est lui qui vous le remet. Le logiciel vous demandera de le remplacer par le vôtre dès votre première connexion, et n'ouvrira aucune autre fenêtre tant que ce ne sera pas fait.",
      '',
      "Si vous n'attendiez pas cet accès, signalez-le à l'administrateur de votre dossier.",
      '',
      signature(params.entite),
    ].join('\n'),
  };
}

/**
 * L'avis de réinitialisation · il vaut aussi comme ALERTE.
 *
 * Une réinitialisation que son titulaire n'a pas demandée est exactement ce
 * qu'il doit apprendre le plus vite. Le message le dit, et dit aussi pourquoi
 * ses sessions se sont fermées · sans quoi la fermeture ressemble à une panne.
 */
export function avisReinitialisation(params: { entite: string; email: string }): TexteAvis {
  return {
    sujet: `OmegaX · votre mot de passe a été réinitialisé${mention(params.entite)}`,
    corps: [
      'Madame, Monsieur,',
      '',
      `L'administrateur ${designation(params.entite)} vient de réinitialiser le mot de passe de votre compte OmegaX (${params.email}).`,
      '',
      "Ce mot de passe ne figure pas dans ce message. Il est provisoire, et c'est l'administrateur qui l'a posé qui vous le remet. Le logiciel vous demandera de le remplacer par le vôtre dès votre prochaine connexion.",
      '',
      "Vos sessions ouvertes ont toutes été fermées, y compris sur vos autres postes. C'est voulu : un mot de passe perdu peut avoir été trouvé par quelqu'un d'autre.",
      '',
      "Si vous n'avez pas demandé cette réinitialisation, prévenez sans attendre l'administrateur de votre dossier.",
      '',
      signature(params.entite),
    ].join('\n'),
  };
}

@Injectable()
export class AvisAccesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly courrier: CourrierService,
  ) {}

  async annoncerCompteCree(
    tenantId: string,
    compte: { userId: string; email: string; role: RoleUtilisateur; parQui: string },
  ): Promise<AvisRemis> {
    const entite = await this.nomDuDossier(tenantId);
    return this.remettre(tenantId, {
      destinataire: compte.email,
      ...avisCompteCree({ entite, email: compte.email, role: compte.role }),
      origineId: compte.userId,
      createdBy: compte.parQui,
    });
  }

  async annoncerReinitialisation(
    tenantId: string,
    compte: { userId: string; email: string; parQui: string },
  ): Promise<AvisRemis> {
    const entite = await this.nomDuDossier(tenantId);
    return this.remettre(tenantId, {
      destinataire: compte.email,
      ...avisReinitialisation({ entite, email: compte.email }),
      origineId: compte.userId,
      createdBy: compte.parQui,
    });
  }

  // ----------------------------------------------------------------------

  private async nomDuDossier(tenantId: string): Promise<string> {
    // Le nom du dossier est dans le sujet et dans la signature · un
    // collaborateur d'un cabinet qui tient plusieurs dossiers doit savoir
    // DUQUEL on lui parle avant d'ouvrir le message.
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { nom: true } });
    return tenant?.nom ?? '';
  }

  private async remettre(
    tenantId: string,
    avis: { destinataire: string; sujet: string; corps: string; origineId: string; createdBy: string },
  ): Promise<AvisRemis> {
    try {
      const message = await this.courrier.mettreEnFile(tenantId, {
        destinataire: avis.destinataire,
        sujet: avis.sujet,
        corps: avis.corps,
        // La même origine que la console et le module groupe donneront à leurs
        // propres remises · la file se lit par origine, et deux étiquettes
        // pour un même geste la rendraient illisible. Voir courrier.service.ts,
        // qui les nomme toutes.
        origine: ORIGINE_MOT_DE_PASSE_TEMPORAIRE,
        // Le compte concerné · c'est par lui qu'on remonte de la file au
        // titulaire, des mois plus tard.
        origineId: avis.origineId,
        createdBy: avis.createdBy,
      });
      return { avise: true, destinataire: avis.destinataire, statut: message.statut, motif: null };
    } catch (erreur) {
      // L'ACCÈS EXISTE DÉJÀ, ET IL RESTE. La file refuse à l'écriture ce
      // qu'aucune tentative ne réparerait, une adresse inutilisable au
      // premier chef · c'est un avis qui manque, pas un compte à défaire.
      return {
        avise: false,
        destinataire: avis.destinataire,
        statut: null,
        motif:
          erreur instanceof Error
            ? `Le titulaire n'a pas pu être averti · ${erreur.message}`
            : "Le titulaire n'a pas pu être averti · la file a refusé le message.",
      };
    }
  }
}
