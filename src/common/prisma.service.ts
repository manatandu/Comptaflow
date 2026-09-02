import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { extensionAudit } from './audit/extension-audit';

/**
 * Le client Prisma de l'application, ÉTENDU par le journal d'audit.
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
    return this.$extends(extensionAudit(this)) as unknown as this;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
