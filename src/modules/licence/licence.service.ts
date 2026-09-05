import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Licence, StatutLicence, TypeLicence } from '@prisma/client';

/**
 * Logique d'accès dictée par le type de licence :
 *
 * - ABONNEMENT            → coupure automatique si `dateExpiration` est dépassée.
 * - PERPETUEL_SAAS        → jamais de coupure (payé une fois, hébergé chez nous).
 * - PERPETUEL_ONPREMISE   → jamais de coupure sur la date, MAIS un heartbeat
 *   périodique vers LICENCE_CHECK_URL est exigé (anti-piratage) ; au-delà de
 *   `joursGraceHorsLigne` sans heartbeat réussi, l'accès est aussi coupé.
 *   C'est ce qui distingue "perpétuel installé chez le client" d'un simple
 *   logiciel copiable sans contrôle.
 *
 * PHASE 4, PAS ENCORE LIVRÉE · `enregistrerHeartbeat` n'a aucun émetteur dans
 * le produit (ni route, ni tâche planifiée, ni client sur site). La règle
 * ci-dessous n'est donc pas fausse, elle est EN AVANCE : elle sera juste le
 * jour où une installation sur site existera. En attendant, c'est
 * l'ATTRIBUTION du type qui est fermée, dans PlateformeService · aucun
 * dossier neuf ne peut plus tomber sur ce verrou.
 */
@Injectable()
export class LicenceService {
  constructor(private readonly prisma: PrismaService) {}

  async estAccesAutorise(tenantId: string): Promise<{ autorise: boolean; motif?: string }> {
    const licence = await this.prisma.licence.findUnique({ where: { tenantId } });
    return this.evaluerLicence(licence);
  }

  /**
   * Évaluation PURE d'une licence déjà chargée · aucun accès base. C'est ce
   * qu'appelle LicenceGuard quand JwtStrategy a préchargé la licence avec
   * l'utilisateur (le cas de toute requête HTTP normale) ; estAccesAutorise
   * reste la voie de service pour les appels qui partent d'un tenantId seul.
   */
  evaluerLicence(licence: Licence | null): { autorise: boolean; motif?: string } {
    if (!licence) {
      return { autorise: false, motif: 'Aucune licence associée à ce tenant' };
    }

    // L'ÉDITEUR N'EST JAMAIS COUPÉ, et ce test passe AVANT la suspension.
    //
    // Ce n'est pas une faveur commerciale, c'est un verrou de sûreté. Le
    // dossier de l'éditeur est celui depuis lequel on rouvre les licences des
    // autres : le couper, par une échéance ou par une suspension posée par
    // mégarde, verrouille l'opérateur HORS de la console qui sert à
    // déverrouiller. La panne serait sans issue, et silencieuse jusqu'à la
    // première connexion refusée.
    //
    // Placé APRÈS le test de suspension, ce court-circuit ne servirait à rien
    // dans le cas qui compte · c'est justement la suspension par erreur qu'il
    // doit absorber. Le seul geste qui retire cette protection est de changer
    // le TYPE de la licence, et `PlateformeService` le refuse.
    if (licence.type === TypeLicence.PROPRIETAIRE) {
      return { autorise: true };
    }
    // Le `switch` plus bas n'a PAS de branche PROPRIETAIRE, et ce n'est pas un
    // oubli : ce retour anticipé a rétréci le type, et TypeScript refuse une
    // branche devenue inatteignable. Le typage prouve donc que le
    // court-circuit est le seul traitement de ce cas.

    if (licence.statut === StatutLicence.SUSPENDUE) {
      return { autorise: false, motif: 'Licence suspendue' };
    }

    switch (licence.type) {
      case TypeLicence.ABONNEMENT: {
        if (licence.dateExpiration && licence.dateExpiration < new Date()) {
          return { autorise: false, motif: 'Abonnement expiré' };
        }
        return { autorise: true };
      }

      case TypeLicence.PERPETUEL_SAAS: {
        return { autorise: true };
      }

      case TypeLicence.PERPETUEL_ONPREMISE: {
        // DEUX PANNES, DEUX PHRASES. Un heartbeat JAMAIS reçu désigne une
        // installation qui n'émet pas · aujourd'hui, c'est le cas de TOUTE
        // licence de ce type, puisque `enregistrerHeartbeat` n'a aucun
        // émetteur. Un heartbeat trop ancien désigne au contraire une coupure
        // réseau chez un client qui, lui, émettait. Le motif unique
        // « Vérification de licence hors-ligne dépassée » couvrait les deux et
        // envoyait le support chercher une panne de réseau dans le premier
        // cas, où rien n'avait jamais été en ligne.
        if (!licence.dernierHeartbeatAt) {
          return {
            autorise: false,
            motif:
              "Licence « Perpétuelle (sur site) » · aucune vérification en ligne n'a jamais été reçue de cette " +
              'installation',
          };
        }
        const limite = new Date();
        limite.setDate(limite.getDate() - licence.joursGraceHorsLigne);
        if (licence.dernierHeartbeatAt < limite) {
          // La date et la tolérance sont dans le motif : sans elles, le
          // support redemande au client « depuis quand ? », seule question qui
          // sépare une coupure d'une heure d'un poste éteint depuis un mois.
          const derniere = licence.dernierHeartbeatAt.toISOString().slice(0, 10);
          return {
            autorise: false,
            motif:
              `Licence « Perpétuelle (sur site) » · dernière vérification en ligne le ${derniere}, au-delà de la ` +
              `tolérance de ${licence.joursGraceHorsLigne} jours hors ligne`,
          };
        }
        return { autorise: true };
      }

      default:
        return { autorise: false, motif: 'Type de licence inconnu' };
    }
  }

  /** Appelé périodiquement par l'installation on-premise pour prouver qu'elle est toujours en ligne. */
  async enregistrerHeartbeat(tenantId: string): Promise<void> {
    await this.prisma.licence.update({
      where: { tenantId },
      data: { dernierHeartbeatAt: new Date() },
    });
  }
}
