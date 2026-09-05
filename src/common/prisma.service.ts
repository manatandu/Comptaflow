import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { extensionAudit } from './audit/extension-audit';
import { extensionCloisonnement } from './cloisonnement/extension-cloisonnement';
import { lireEtatDuPooling, messageDePooling } from './pooling-base';

/**
 * Le client Prisma de l'application, ÉTENDU par le CLOISONNEMENT puis par le
 * JOURNAL D'AUDIT.
 *
 * Le constructeur retourne le client étendu plutôt que `this` · c'est permis
 * en JavaScript et c'est le seul moyen d'étendre un client sans changer le
 * type injecté dans les trente modules qui en dépendent. Nest injecte l'objet
 * retourné, l'extension est donc posée partout, sans exception et sans
 * appel à écrire.
 *
 * `this` (le client NON étendu) est passé à l'extension : c'est par lui que le
 * journal s'écrit, faute de quoi l'écriture d'un maillon déclencherait
 * l'écriture d'un maillon.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  /**
   * LE CLIENT NU · sans cloisonnement et SANS AUDIT.
   *
   * Il existe pour un seul usage : écrire un maillon du journal d'audit.
   * `EvenementAudit` est lui-même un modèle audité ET un modèle cloisonné ·
   * écrire un maillon par le client étendu déclencherait l'écriture d'un
   * maillon, à l'infini. L'extension le sait déjà et reçoit `this` pour cette
   * raison ; ce qui manquait, c'est un accès pour un écrivain qui N'EST PAS
   * l'extension · la journalisation d'une EXTRACTION, qui est une LECTURE et
   * ne passe donc par aucun crochet d'écriture.
   *
   * CE N'EST PAS UNE PORTE DE SERVICE. Toute autre lecture ou écriture passe
   * par le client étendu · s'en servir pour contourner la garde de
   * cloisonnement serait exactement le geste que la garde existe pour
   * empêcher, et sans le moindre bruit. Un test fige la liste des fichiers
   * qui le nomment.
   */
  readonly clientNu!: PrismaClient;

  constructor() {
    super();
    // L'ordre des deux extensions est sans effet sur la propriété qui
    // compte · une requête refusée par le cloisonnement lève AVANT que le
    // journal n'ait de résultat à consigner, dans un sens comme dans l'autre.
    // Le journal ne consigne donc jamais un acte qui n'a pas eu lieu.
    const nu: PrismaClient = this;
    const etendu = this.$extends(extensionCloisonnement(this)).$extends(extensionAudit(this)) as unknown as this;
    // `defineProperty` et non une affectation · le champ doit être posé sur
    // l'objet ÉTENDU que le constructeur retourne (c'est lui que Nest
    // injecte), et rester NON énumérable pour qu'aucune sérialisation du
    // service ne le recopie par mégarde.
    Object.defineProperty(etendu, 'clientNu', { value: nu, enumerable: false });
    return etendu;
  }

  async onModuleInit() {
    await this.$connect();
    // CE QUE LE JOURNAL DE DÉMARRAGE DOIT DIRE · rien sur la chaîne, tout sur
    // le RÉGIME de connexion. Le jour où l'endpoint poolé sera posé en
    // production, c'est cette ligne qui prouvera qu'il a bien pris ; et si un
    // déploiement le perd (--env-vars-file remplace TOUTES les variables,
    // CLAUDE.md §5), c'est elle qui le dira, au lieu d'attendre la saturation.
    new Logger(PrismaService.name).log(messageDePooling(lireEtatDuPooling(process.env.DATABASE_URL)));
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
