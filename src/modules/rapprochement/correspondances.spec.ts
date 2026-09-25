import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RapprochementService } from './rapprochement.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * CONFIRMATION D'UNE CORRESPONDANCE · rien de ce que le client renvoie n'est
 * cru. Un groupe dont la somme ne vaut pas la ligne du relevé serait pointé,
 * l'écart du rapprochement se refermerait sur une opération fausse, et la
 * clôture passerait.
 */

function monter() {
  const rapprochement = { id: 'rap', tenantId: 't1', compteId: '521', statut: 'EN_COURS', dateReleve: new Date('2026-03-31') };
  const releve = [{ id: 'r1', tenantId: 't1', rapprochementId: 'rap', libelle: 'Remise chèques', debit: 0, credit: 300, lignesEcriture: [] as { id: string }[] }];
  const lignes = [
    { id: 'a', compteId: '521', debit: 100, credit: 0, rapprochementId: null, ligneReleveId: null },
    { id: 'b', compteId: '521', debit: 200, credit: 0, rapprochementId: null, ligneReleveId: null },
    { id: 'c', compteId: '521', debit: 250, credit: 0, rapprochementId: null, ligneReleveId: null },
    { id: 'x', compteId: '571', debit: 200, credit: 0, rapprochementId: null, ligneReleveId: null },
  ];
  const updateMany = jest.fn(async () => ({ count: 1 }));
  const prisma = {
    rapprochementBancaire: { findFirst: jest.fn(async () => rapprochement) },
    ligneReleveBancaire: {
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) => releve.filter((r) => where.id.in.includes(r.id))),
    },
    ligneEcriture: {
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) => lignes.filter((l) => where.id.in.includes(l.id))),
      updateMany,
    },
    $transaction: jest.fn(async (ops: unknown[]) => ops),
  } as unknown as PrismaService;
  return { service: new RapprochementService(prisma), updateMany, releve, lignes };
}

describe('confirmer une correspondance', () => {
  it('une remise de deux chèques · deux lignes du compte pour un crédit du relevé', async () => {
    const { service, updateMany } = monter();
    await service.confirmer('t1', 'rap', { correspondances: [{ ligneReleveId: 'r1', ligneEcritureIds: ['a', 'b'] }] });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { rapprochementId: 'rap', ligneReleveId: 'r1' } }),
    );
  });

  it('refuse un groupe dont la somme ne vaut pas le relevé', async () => {
    const { service, updateMany } = monter();
    await expect(
      service.confirmer('t1', 'rap', { correspondances: [{ ligneReleveId: 'r1', ligneEcritureIds: ['a', 'c'] }] }),
    ).rejects.toThrow(/un écart ne se rapproche pas, il se comptabilise/);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('refuse une ligne d’un autre compte', async () => {
    const { service } = monter();
    await expect(
      service.confirmer('t1', 'rap', { correspondances: [{ ligneReleveId: 'r1', ligneEcritureIds: ['a', 'x'] }] }),
    ).rejects.toThrow(/compte rapproché/);
  });

  it('refuse une ligne du relevé déjà rapprochée', async () => {
    const { service, releve } = monter();
    releve[0].lignesEcriture = [{ id: 'z' }];
    await expect(
      service.confirmer('t1', 'rap', { correspondances: [{ ligneReleveId: 'r1', ligneEcritureIds: ['a', 'b'] }] }),
    ).rejects.toThrow(/déjà rapprochée/);
  });

  it('refuse une ligne du compte déjà pointée ailleurs', async () => {
    const { service, lignes } = monter();
    (lignes[0] as { rapprochementId: string | null }).rapprochementId = 'autre';
    await expect(
      service.confirmer('t1', 'rap', { correspondances: [{ ligneReleveId: 'r1', ligneEcritureIds: ['a', 'b'] }] }),
    ).rejects.toThrow(/déjà pointée/);
  });
});

describe('dépointer dénoue aussi la correspondance', () => {
  it('le dépointage remet ligneReleveId à null', () => {
    const src = readFileSync(join(__dirname, 'rapprochement.service.ts'), 'utf8');
    const debut = src.indexOf('  async depointer(');
    const fin = src.indexOf('\n  async ', debut + 5);
    expect(src.slice(debut, fin)).toContain('data: { rapprochementId: null, ligneReleveId: null }');
  });
});
