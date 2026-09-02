import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { extensionAudit } from './audit/extension-audit';
import { extensionCloisonnement } from './cloisonnement/extension-cloisonnement';

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
  constructor() {
    super();
    // L'ordre des deux extensions est sans effet sur la propriété qui
    // compte · une requête refusée par le cloisonnement lève AVANT que le
    // journal n'ait de résultat à consigner, dans un sens comme dans l'autre.
    // Le journal ne consigne donc jamais un acte qui n'a pas eu lieu.
    return this.$extends(extensionCloisonnement(this)).$extends(extensionAudit(this)) as unknown as this;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
