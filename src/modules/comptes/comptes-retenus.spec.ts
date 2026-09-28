import { readFileSync } from 'fs';
import { join } from 'path';
import { CompteService } from './compte.service';

/**
 * COMPTES RETENUS · une liste de choix ne propose que les comptes retenus et
 * ceux déjà utilisés quelque part. La doublure honore ses filtres · chaque
 * relation ne rend que les identifiants demandés (`in`) et son `distinct`.
 */
const COMPTES = [
  { id: 'c521', tenantId: 't1', numero: '52110000', estRetenu: false },
  { id: 'c601', tenantId: 't1', numero: '60100000', estRetenu: false },
  { id: 'c411', tenantId: 't1', numero: '41110000', estRetenu: true },
  { id: 'c445', tenantId: 't1', numero: '44520000', estRetenu: false },
  { id: 'c622', tenantId: 't1', numero: '62200000', estRetenu: false },
];
// Le 521 est porté par un journal, le 601 mouvementé, le 445 par un taux ·
// le 622 n'est utilisé nulle part et n'est pas retenu.
const REFERENCES: Record<string, Record<string, string>[]> = {
  journal: [{ compteTresorerieId: 'c521' }],
  ligneEcriture: [{ compteId: 'c601' }, { compteId: 'c601' }],
  tauxTva: [{ compteDeductibleId: 'c445' }],
};

function prisma() {
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(cible, nom: string) {
      if (nom in cible) return cible[nom];
      return {
        findMany: jest.fn(async ({ where, select }: { where: Record<string, { in: string[] }>; select: Record<string, boolean> }) => {
          const champ = Object.keys(select)[0];
          const lignes = (REFERENCES[nom] ?? []).filter((l) => l[champ] && where[champ].in.includes(l[champ]));
          return [...new Map(lignes.map((l) => [l[champ], l])).values()];
        }),
      };
    },
  };
  return new Proxy(
    {
      compte: { findMany: jest.fn(async ({ where }: { where: { tenantId: string } }) => COMPTES.filter((c) => c.tenantId === where.tenantId)) },
      natureCompte: { findMany: jest.fn(async () => []), createMany: jest.fn(async () => ({ count: 0 })), count: jest.fn(async () => 7) },
    } as Record<string, unknown>,
    handler,
  );
}

describe('comptes retenus', () => {
  it('une liste de choix rend les retenus et les utilisés, jamais un compte ni retenu ni utilisé', async () => {
    const r = await new CompteService(prisma() as never).lister('t1', { retenus: true });
    expect(r.map((c) => c.numero).sort()).toEqual(['41110000', '44520000', '52110000', '60100000']);
  });

  it('sans le filtre, tout le plan est rendu, et l’usage se dit sur demande', async () => {
    const r = await new CompteService(prisma() as never).lister('t1', { usage: true });
    expect(r).toHaveLength(5);
    expect(r.find((c) => c.numero === '62200000')).toMatchObject({ utilise: false });
    expect(r.find((c) => c.numero === '52110000')).toMatchObject({ utilise: true });
  });

  it('le plan semé part non retenu, un compte créé par le cabinet naît retenu', () => {
    const service = readFileSync(join(__dirname, 'compte.service.ts'), 'utf8');
    const semis = service.slice(service.indexOf('async seedPlan('), service.indexOf('skipDuplicates', service.indexOf('async seedPlan(')));
    expect(semis).toContain('estRetenu: false');
    const schema = readFileSync(join(__dirname, '../../../prisma/schema.prisma'), 'utf8');
    expect(schema).toMatch(/estRetenu\s+Boolean\s+@default\(true\)/);
  });
});
