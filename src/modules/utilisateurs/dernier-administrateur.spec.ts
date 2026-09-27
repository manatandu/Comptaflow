import { BadRequestException, ConflictException } from '@nestjs/common';
import { RoleUtilisateur } from '@prisma/client';
import { MOTIF_ADRESSE_PRISE, MOTIF_DERNIER_ADMINISTRATEUR, UtilisateurService, retireUnAdministrateur } from './utilisateur.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * AUDIT FINAL F157 ET F158.
 *
 * F157 · le dernier administrateur actif d'un dossier pouvait être rétrogradé
 * ou désactivé par un autre administrateur, puis celui-ci se rétrograder
 * lui-même · le dossier restait sans personne pour gérer ses comptes, et la
 * console, qui ne réinitialise que les administrateurs, ne le rattrapait pas.
 *
 * F158 · créer un utilisateur dont l'adresse existe dans un AUTRE dossier
 * rendait 500 · la lecture préalable ne voit pas le compte d'un voisin.
 */

type Compte = { id: string; tenantId: string; role: RoleUtilisateur; estActif: boolean };

/**
 * La doublure HONORE le filtre du décompte (dossier, rôle, activité, compte
 * exclu) · une doublure qui rendrait un nombre fixe validerait un filtre
 * qu'aucune requête ne pose.
 */
function prismaComptes(comptes: Compte[]) {
  const ecrits: Array<Record<string, unknown>> = [];
  const verrous: string[] = [];
  const correspond = (c: Compte, w: Record<string, unknown>) =>
    c.tenantId === w.tenantId &&
    (w.role === undefined || c.role === w.role) &&
    (w.estActif === undefined || c.estActif === w.estActif) &&
    (w.id === undefined || c.id !== (w.id as { not: string }).not);
  const user = {
    findFirst: jest.fn(({ where }: { where: { id: string; tenantId: string } }) =>
      Promise.resolve(comptes.find((c) => c.id === where.id && c.tenantId === where.tenantId) ?? null),
    ),
    count: jest.fn(({ where }: { where: Record<string, unknown> }) => Promise.resolve(comptes.filter((c) => correspond(c, where)).length)),
    update: jest.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      ecrits.push({ id: where.id, ...data });
      return Promise.resolve({ id: where.id });
    }),
  };
  const tx = {
    user,
    $executeRaw: jest.fn((_g: TemplateStringsArray, ...v: unknown[]) => {
      verrous.push(String(v[0]));
      return Promise.resolve(1);
    }),
  };
  const prisma = { user, $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)) };
  return { prisma, ecrits, verrous };
}

const service = (prisma: unknown) => new UtilisateurService(prisma as PrismaService);
const admin = (id: string, estActif = true): Compte => ({ id, tenantId: 'd-1', role: RoleUtilisateur.ADMIN_CABINET, estActif });
const comptable = (id: string): Compte => ({ id, tenantId: 'd-1', role: RoleUtilisateur.COMPTABLE, estActif: true });

describe('F157 · le dernier administrateur actif ne se retire pas', () => {
  it('se rétrograder quand on est le seul administrateur est refusé, et rien n’est écrit', async () => {
    const { prisma, ecrits } = prismaComptes([admin('a1'), comptable('c1')]);
    await expect(service(prisma).modifier('d-1', 'a1', 'a1', { role: RoleUtilisateur.COMPTABLE })).rejects.toThrow(
      MOTIF_DERNIER_ADMINISTRATEUR,
    );
    expect(ecrits).toEqual([]);
  });

  it('désactiver le seul autre administrateur actif, quand on n’est pas soi-même administrateur actif, est refusé', async () => {
    // Un administrateur INACTIF ne compte pas · il ne peut pas se connecter.
    const { prisma, ecrits } = prismaComptes([admin('a1'), admin('a2', false), comptable('c1')]);
    await expect(service(prisma).modifier('d-1', 'a1', 'c1', { estActif: false })).rejects.toBeInstanceOf(BadRequestException);
    expect(ecrits).toEqual([]);
  });

  it('un administrateur d’un AUTRE dossier ne compte pas', async () => {
    const { prisma, ecrits } = prismaComptes([admin('a1'), { ...admin('x1'), tenantId: 'd-2' }]);
    await expect(service(prisma).modifier('d-1', 'a1', 'a1', { role: RoleUtilisateur.LECTURE_SEULE })).rejects.toThrow(
      MOTIF_DERNIER_ADMINISTRATEUR,
    );
    expect(ecrits).toEqual([]);
  });

  it('avec un second administrateur actif, la rétrogradation passe, sous le verrou du dossier', async () => {
    const { prisma, ecrits, verrous } = prismaComptes([admin('a1'), admin('a2')]);
    await service(prisma).modifier('d-1', 'a1', 'a2', { role: RoleUtilisateur.COMPTABLE });
    expect(ecrits).toEqual([expect.objectContaining({ id: 'a1', role: RoleUtilisateur.COMPTABLE })]);
    expect(verrous).toEqual(['administrateurs:d-1']);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('le décompte exclut le compte visé lui-même', async () => {
    const { prisma } = prismaComptes([admin('a1'), admin('a2')]);
    await service(prisma).modifier('d-1', 'a1', 'a2', { estActif: false });
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: { tenantId: 'd-1', role: RoleUtilisateur.ADMIN_CABINET, estActif: true, id: { not: 'a1' } },
    });
  });

  it('un geste qui ne retire rien n’ouvre ni transaction ni décompte', async () => {
    const { prisma, ecrits } = prismaComptes([admin('a1'), comptable('c1')]);
    await service(prisma).modifier('d-1', 'c1', 'a1', { role: RoleUtilisateur.LECTURE_SEULE });
    await service(prisma).modifier('d-1', 'a1', 'a1', { role: RoleUtilisateur.ADMIN_CABINET, estActif: true });
    expect(ecrits).toHaveLength(2);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('la règle · seul un compte ADMINISTRATEUR ET ACTIF perd quelque chose', () => {
    const a = { role: RoleUtilisateur.ADMIN_CABINET, estActif: true };
    expect(retireUnAdministrateur(a, { role: RoleUtilisateur.COMPTABLE })).toBe(true);
    expect(retireUnAdministrateur(a, { estActif: false })).toBe(true);
    expect(retireUnAdministrateur(a, { role: RoleUtilisateur.ADMIN_CABINET })).toBe(false);
    expect(retireUnAdministrateur(a, { estActif: true })).toBe(false);
    expect(retireUnAdministrateur({ ...a, estActif: false }, { role: RoleUtilisateur.COMPTABLE })).toBe(false);
    expect(retireUnAdministrateur({ ...a, role: RoleUtilisateur.COMPTABLE }, { estActif: false })).toBe(false);
  });
});

describe('F158 · une adresse prise dans un autre dossier rend un conflit, pas une panne', () => {
  it('la contrainte d’unicité de la base devient un 409, sans dire à qui l’adresse appartient', async () => {
    const prisma = {
      user: {
        // Le compte du voisin est rendu « inexistant » par la garde de cloisonnement.
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })),
      },
    };
    const promesse = service(prisma).creer('d-1', { email: 'Voisin@Cabinet.cd', motDePasse: 'mot-de-passe-long', role: RoleUtilisateur.COMPTABLE });
    await expect(promesse).rejects.toBeInstanceOf(ConflictException);
    await expect(promesse).rejects.toThrow(MOTIF_ADRESSE_PRISE);
  });

  it('une autre panne de la base n’est pas déguisée en conflit', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue(Object.assign(new Error('connexion perdue'), { code: 'P1001' })),
      },
    };
    await expect(
      service(prisma).creer('d-1', { email: 'nouveau@cabinet.cd', motDePasse: 'mot-de-passe-long', role: RoleUtilisateur.COMPTABLE }),
    ).rejects.toThrow('connexion perdue');
  });
});
