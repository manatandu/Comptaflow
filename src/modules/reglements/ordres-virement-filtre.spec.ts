// Les décorateurs de class-validator lisent les métadonnées de conception ·
// hors du contexte Nest, personne ne charge ce polyfill à notre place.
import 'reflect-metadata';
import { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { Test } from '@nestjs/testing';
import { OrdresVirementController } from './ordres-virement.controller';
import { OrdresVirementService } from './ordres-virement.service';
import { ListerOrdresDto } from './ordres-virement.dto';
import { PrismaService } from '../../common/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { configurerApplication } from '../../bootstrap';

/**
 * AUDIT FINAL F207, LE RESTE · LA LISTE DES ORDRES SE FILTRE PAR ÉTAT, ET UN
 * ÉTAT INCONNU EST UN 400, JAMAIS UN FILTRE IGNORÉ.
 *
 * Ignoré, le paramètre rendrait la liste entière sous un filtre que
 * l'utilisateur croit posé · « aucun ordre à imprimer » se lirait sur une
 * liste qui en montre. Le refus vit au DTO (`IsEnum`) et, en dernière ligne,
 * au service ; ce spec monte un serveur Nest réel avec le `ValidationPipe`
 * de production, seul endroit où le DTO est vraiment joué.
 */

interface OrdreFactice {
  id: string;
  tenantId: string;
  numero: number;
  statut: string;
}

const ORDRES: OrdreFactice[] = [
  { id: 'o1', tenantId: 'dossier-1', numero: 1, statut: 'A_IMPRIMER' },
  { id: 'o2', tenantId: 'dossier-1', numero: 2, statut: 'IMPRIME' },
  { id: 'o3', tenantId: 'dossier-1', numero: 3, statut: 'ANNULE' },
  { id: 'o4', tenantId: 'dossier-1', numero: 4, statut: 'IMPRIME' },
  { id: 'x1', tenantId: 'dossier-2', numero: 1, statut: 'IMPRIME' },
];

/** La doublure HONORE le filtre (dossier, état), le tri et la borne. */
function prismaFactice() {
  const garde = (where: { tenantId: string; statut?: string }) =>
    ORDRES.filter((o) => o.tenantId === where.tenantId && (where.statut === undefined || o.statut === where.statut));
  return {
    ordreVirement: {
      findMany: jest.fn(async ({ where, take }: { where: { tenantId: string; statut?: string }; take: number }) =>
        [...garde(where)].sort((a, b) => b.numero - a.numero).slice(0, take),
      ),
      count: jest.fn(async ({ where }: { where: { tenantId: string; statut?: string } }) => garde(where).length),
    },
  };
}

describe('F207 · le contrôleur lit son filtre par le DTO', () => {
  it('un seul paramètre de requête, entier, typé par le DTO · sans quoi le ValidationPipe ne le voit pas', () => {
    const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, OrdresVirementController, 'lister') as Record<
      string,
      { index: number; data?: unknown }
    >;
    const requetes = Object.entries(args).filter(([cle]) => cle.startsWith(`${RouteParamtypes.QUERY}:`));
    expect(requetes).toHaveLength(1);
    const [, { index, data }] = requetes[0];
    expect(data).toBeUndefined();
    const types = Reflect.getMetadata('design:paramtypes', OrdresVirementController.prototype, 'lister') as unknown[];
    expect(types[index]).toBe(ListerOrdresDto);
  });
});

describe('F207 · sur un vrai serveur Nest, avec le ValidationPipe de production', () => {
  let app: INestApplication;
  let port: number;
  let prisma: ReturnType<typeof prismaFactice>;

  /** La session est posée par une garde de substitution · le sujet est le filtre, pas l'authentification. */
  const sessionFactice: CanActivate = {
    canActivate(ctx: ExecutionContext) {
      ctx.switchToHttp().getRequest().user = { id: 'u-1', tenantId: 'dossier-1', role: 'ADMIN_CABINET' };
      return true;
    },
  };

  beforeAll(async () => {
    prisma = prismaFactice();
    const mod = await Test.createTestingModule({
      controllers: [OrdresVirementController],
      providers: [OrdresVirementService, { provide: PrismaService, useValue: prisma }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(sessionFactice)
      .overrideGuard(LicenceGuard)
      .useValue(sessionFactice)
      .overrideGuard(RolesGuard)
      .useValue(sessionFactice)
      .compile();
    app = mod.createNestApplication();
    // Le MÊME montage que le serveur publié · c'est lui qui pose le pipe global.
    configurerApplication(app);
    await app.listen(0);
    port = (app.getHttpServer().address() as { port: number }).port;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    prisma.ordreVirement.findMany.mockClear();
    prisma.ordreVirement.count.mockClear();
  });

  const lire = async (requete: string) => {
    const reponse = await fetch(`http://127.0.0.1:${port}/ordres-virement${requete}`);
    return { statut: reponse.status, corps: (await reponse.json()) as Record<string, unknown> };
  };

  it('sans filtre · tous les ordres du dossier, le filtre rendu à null', async () => {
    const { statut, corps } = await lire('');
    expect(statut).toBe(200);
    expect((corps.ordres as OrdreFactice[]).map((o) => o.id)).toEqual(['o4', 'o3', 'o2', 'o1']);
    expect(corps).toMatchObject({ total: 4, tronque: false, enAttenteImpression: 1, statut: null });
  });

  it('filtré par état · seuls les ordres de cet état, le total sur le même filtre', async () => {
    const { statut, corps } = await lire('?statut=IMPRIME');
    expect(statut).toBe(200);
    expect((corps.ordres as OrdreFactice[]).map((o) => o.id)).toEqual(['o4', 'o2']);
    expect(corps).toMatchObject({ total: 2, tronque: false, enAttenteImpression: 1, statut: 'IMPRIME' });
  });

  it.each([['?statut=INCONNU'], ['?statut=imprime'], ['?statut=']])('%s · 400 avant toute lecture', async (requete) => {
    const { statut, corps } = await lire(requete);
    expect(statut).toBe(400);
    expect(JSON.stringify(corps.message)).toMatch(/statut/);
    expect(prisma.ordreVirement.findMany).not.toHaveBeenCalled();
    expect(prisma.ordreVirement.count).not.toHaveBeenCalled();
  });

  it('un paramètre mal nommé est refusé, jamais ignoré', async () => {
    const { statut, corps } = await lire('?etat=IMPRIME');
    expect(statut).toBe(400);
    expect(JSON.stringify(corps.message)).toMatch(/etat/);
    expect(prisma.ordreVirement.findMany).not.toHaveBeenCalled();
  });
});
