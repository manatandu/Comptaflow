import { NotFoundException } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../common/prisma.service';
import { RestitutionController } from './restitution.controller';
import { RestitutionService, nomDeLArchive } from './restitution.service';

/**
 * LE NOM DE L'ARCHIVE DE RESTITUTION (audit final F225).
 *
 * Le contrôleur servait `restitution-<jour>.zip` pour tout dossier, et le nom
 * calculé par le service, rendu après l'envoi des en-têtes, n'était lu par
 * personne. Deux dossiers restitués le même jour portaient donc le même nom.
 * Ce spec passe par le CONTRÔLEUR, parce que c'est lui qui pose l'en-tête · un
 * nom juste que le contrôleur ne servirait pas serait le défaut d'origine.
 */

const JOUR = new Date('2026-09-28T10:00:00Z');

/** Deux dossiers de même dénomination · le cas que le jour seul confondait. */
const DOSSIERS: Record<string, { id: string; nom: string }> = {
  'd-1': { id: 'd-1', nom: 'ASBL Espoir' },
  'd-2': { id: 'd-2', nom: 'ASBL Espoir' },
};

/** La doublure HONORE l'identifiant demandé · elle rend le dossier nommé, ou rien. */
function prismaFactice(): PrismaService {
  return {
    tenant: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) => Promise.resolve(DOSSIERS[where.id] ?? null)),
    },
  } as unknown as PrismaService;
}

/** Une réponse qui retient ses en-têtes, sans flux · `produire` est remplacé. */
function reponse(): { res: Response; entetes: Record<string, string> } {
  const entetes: Record<string, string> = {};
  const res = {
    set: jest.fn((valeurs: Record<string, string>) => Object.assign(entetes, valeurs)),
  } as unknown as Response;
  return { res, entetes };
}

async function nomServi(tenantId: string): Promise<string> {
  const service = new RestitutionService(prismaFactice());
  jest.spyOn(service, 'produire').mockResolvedValue(undefined);
  const controleur = new RestitutionController(service);
  const { res, entetes } = reponse();
  await controleur.archive(
    { tenantId, userId: 'u-1', email: 'chef@asbl.cd' } as unknown as AuthenticatedUser,
    { ip: '127.0.0.1' } as unknown as Request,
    res,
  );
  const disposition = entetes['Content-Disposition'];
  const m = /filename="([^"]+)"/.exec(disposition);
  if (!m) throw new Error(`Content-Disposition illisible · ${disposition}`);
  return m[1];
}

describe('le nom de l’archive de restitution (audit final F225)', () => {
  it('le contrôleur sert deux noms différents à deux dossiers de même dénomination', async () => {
    const [premier, second] = await Promise.all([nomServi('d-1'), nomServi('d-2')]);
    expect(premier).not.toBe(second);
    // Chacun porte SON dossier, pas seulement une différence quelconque.
    expect(premier).toContain('d-1');
    expect(second).toContain('d-2');
    // La dénomination reste devant, pour reconnaître l'archive sans l'ouvrir.
    expect(premier).toMatch(/^restitution-asbl-espoir-/);
  });

  it('le nom servi est celui que le service calcule pour ce dossier', async () => {
    // Le jour est pris avant ET après l'appel · un appel qui enjambe minuit
    // ne fait pas tomber le test pour une raison qui n'est pas la sienne.
    const avant = new Date();
    const servi = await nomServi('d-1');
    const apres = new Date();
    expect([nomDeLArchive(DOSSIERS['d-1'], avant), nomDeLArchive(DOSSIERS['d-1'], apres)]).toContain(servi);
  });

  it('dénomination, identifiant et jour, en caractères sûrs pour un en-tête', () => {
    expect(nomDeLArchive({ id: 'd-1', nom: 'ASBL Espoir' }, JOUR)).toBe('restitution-asbl-espoir-d-1-2026-09-28.zip');
    // Les accents tombent, les guillemets et les sauts de ligne aussi ·
    // venus de la dénomination, ils casseraient `Content-Disposition`.
    const nom = nomDeLArchive({ id: 'd-1', nom: 'Église "Évangélique"\nde Goma' }, JOUR);
    expect(nom).toBe('restitution-eglise-evangelique-de-goma-d-1-2026-09-28.zip');
    expect(nom).toMatch(/^[a-z0-9.-]+$/);
  });

  it('une dénomination qui se réduit à rien garde l’identifiant, jamais un nom vide', () => {
    expect(nomDeLArchive({ id: 'd-9', nom: '联合会' }, JOUR)).toBe('restitution-d-9-2026-09-28.zip');
  });

  it('un dossier introuvable est un refus nommé, avant tout en-tête', async () => {
    const service = new RestitutionService(prismaFactice());
    await expect(service.nomDeLArchive('d-inconnu', JOUR)).rejects.toBeInstanceOf(NotFoundException);

    // Par le CONTRÔLEUR · le refus doit tomber avant `res.set` et avant la
    // première ligne. Une fois l'en-tête d'une archive posé, un 404 ne se
    // dirait plus proprement, et `produire` écrirait un maillon d'audit pour
    // une archive qui n'existe pas.
    const produire = jest.spyOn(service, 'produire').mockResolvedValue(undefined);
    const { res } = reponse();
    await expect(
      new RestitutionController(service).archive(
        { tenantId: 'd-inconnu', userId: 'u-1', email: 'chef@asbl.cd' } as unknown as AuthenticatedUser,
        { ip: '127.0.0.1' } as unknown as Request,
        res,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(res.set).not.toHaveBeenCalled();
    expect(produire).not.toHaveBeenCalled();
  });
});
