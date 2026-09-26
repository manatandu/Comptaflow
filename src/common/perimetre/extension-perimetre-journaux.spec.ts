import { ForbiddenException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { dansContexteAudit } from '../audit/contexte-audit';
import { garderPerimetreJournaux, journalHorsPerimetre, MESSAGE_HORS_PERIMETRE } from './extension-perimetre-journaux';
import { RoleUtilisateur } from '@prisma/client';
import { UtilisateurService } from '../../modules/utilisateurs/utilisateur.service';
import { PrismaService } from '../prisma.service';

const ACTEUR = { acteurEmail: 'caisse@exemple.cd', tenantId: 't1' };

function faire(journalDesVisees: (string | null)[]) {
  const findMany = jest.fn().mockResolvedValue(journalDesVisees.map((journalId) => ({ journalId })));
  const base = { ecriture: { findMany } } as never;
  const query = jest.fn().mockResolvedValue('fait');
  const appeler = (autorises: string[] | null, model: string, operation: string, args: unknown) =>
    dansContexteAudit({ ...ACTEUR, journauxAutorises: autorises }, () => garderPerimetreJournaux(base, { model, operation, args, query }));
  return { appeler, query, findMany };
}

describe('journalHorsPerimetre', () => {
  it('ne restreint rien sans liste', () => {
    expect(journalHorsPerimetre('j1', null)).toBe(false);
    expect(journalHorsPerimetre('j1', undefined)).toBe(false);
  });
  it('refuse un journal absent de la liste, et une écriture sans journal', () => {
    expect(journalHorsPerimetre('j2', ['j1'])).toBe(true);
    expect(journalHorsPerimetre(null, ['j1'])).toBe(true);
    expect(journalHorsPerimetre('j1', ['j1'])).toBe(false);
  });
  it('une liste vide ferme toute saisie', () => {
    expect(journalHorsPerimetre('j1', [])).toBe(true);
  });
});

describe('la saisie est gardée sur le client Prisma', () => {
  it('laisse passer toute écriture quand l’acteur n’est pas restreint', async () => {
    const { appeler, query } = faire(['j9']);
    await expect(appeler(null, 'Ecriture', 'create', { data: { journalId: 'j9' } })).resolves.toBe('fait');
    expect(query).toHaveBeenCalled();
  });

  it('refuse une création hors périmètre, par journalId ou par connect', async () => {
    const { appeler, query } = faire([]);
    await expect(appeler(['j1'], 'Ecriture', 'create', { data: { journalId: 'j2' } })).rejects.toThrow(MESSAGE_HORS_PERIMETRE);
    await expect(appeler(['j1'], 'Ecriture', 'create', { data: { journal: { connect: { id: 'j2' } } } })).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
    await expect(appeler(['j1'], 'Ecriture', 'create', { data: { journalId: 'j1' } })).resolves.toBe('fait');
    await expect(appeler(['j1'], 'Ecriture', 'create', { data: { journal: { connect: { id: 'j1' } } } })).resolves.toBe('fait');
  });

  it('refuse un lot dont une seule écriture sort du périmètre', async () => {
    const { appeler } = faire([]);
    await expect(appeler(['j1'], 'Ecriture', 'createMany', { data: [{ journalId: 'j1' }, { journalId: 'j2' }] })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuse de modifier, valider ou supprimer une écriture d’un autre journal', async () => {
    for (const operation of ['update', 'updateMany', 'delete', 'deleteMany']) {
      const { appeler, query, findMany } = faire(['j1', 'j2']);
      await expect(appeler(['j1'], 'Ecriture', operation, { where: { id: 'e' }, data: { statut: 'VALIDEE' } })).rejects.toBeInstanceOf(ForbiddenException);
      expect(findMany).toHaveBeenCalledWith({ where: { id: 'e' }, select: { journalId: true } });
      expect(query).not.toHaveBeenCalled();
    }
  });

  it('refuse de déplacer une écriture vers un journal hors périmètre', async () => {
    const { appeler } = faire(['j1']);
    await expect(appeler(['j1'], 'Ecriture', 'update', { where: { id: 'e' }, data: { journalId: 'j2' } })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('laisse la lecture et les autres tables, lettrage compris', async () => {
    const { appeler, findMany } = faire(['j2']);
    await expect(appeler(['j1'], 'Ecriture', 'findMany', { where: {} })).resolves.toBe('fait');
    await expect(appeler(['j1'], 'LigneEcriture', 'updateMany', { where: {}, data: { lettrageId: 'l' } })).resolves.toBe('fait');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('modifie une écriture de son journal', async () => {
    const { appeler } = faire(['j1']);
    await expect(appeler(['j1'], 'Ecriture', 'update', { where: { id: 'e' }, data: { libelle: 'x' } })).resolves.toBe('fait');
  });
});

describe('le câblage', () => {
  it('pose l’extension sur le client Prisma', () => {
    const source = readFileSync(join(__dirname, '..', 'prisma.service.ts'), 'utf8');
    expect(source).toContain('.$extends(extensionPerimetreJournaux(this))');
  });

  it("n'applique jamais la restriction à un administrateur", () => {
    const source = readFileSync(join(__dirname, '..', 'audit', 'audit-contexte.interceptor.ts'), 'utf8');
    expect(source).toMatch(/utilisateur\.role !== 'ADMIN_CABINET' && utilisateur\.restreindreJournaux\s*\?\s*\(utilisateur\.journauxAutorises \?\? \[\]\)\s*:\s*null/);
  });

  it('relit les journaux autorisés à chaque requête, comme le rôle', () => {
    const source = readFileSync(join(__dirname, '..', '..', 'modules', 'auth', 'jwt.strategy.ts'), 'utf8');
    expect(source).toContain('journauxAutorises: user.journauxAutorises,');
  });
});

describe('la définition des journaux autorisés', () => {
  function service(role: RoleUtilisateur, journauxDuDossier = 2) {
    const update = jest.fn(async (a: unknown) => a);
    const count = jest.fn(async () => journauxDuDossier);
    const p = { user: { findFirst: jest.fn(async () => ({ id: 'u2', role })), update }, journal: { count } };
    return { s: new UtilisateurService(p as unknown as PrismaService), update, count };
  }

  it('refuse de restreindre un administrateur, sans rien écrire', async () => {
    const { s, update } = service(RoleUtilisateur.ADMIN_CABINET);
    await expect(s.definirJournaux('t1', 'u2', { restreindre: true, journaux: [] })).rejects.toThrow(/jamais restreint/);
    expect(update).not.toHaveBeenCalled();
  });

  it('refuse un journal d’un autre dossier, bornant la vérification au dossier', async () => {
    const { s, update, count } = service(RoleUtilisateur.COMPTABLE, 1);
    await expect(s.definirJournaux('t1', 'u2', { restreindre: true, journaux: ['j1', 'jx'] })).rejects.toThrow(/n’appartient pas/);
    expect(count).toHaveBeenCalledWith({ where: { tenantId: 't1', id: { in: ['j1', 'jx'] } } });
    expect(update).not.toHaveBeenCalled();
  });

  it('pose la liste sans doublon et FERME les sessions', async () => {
    const { s, update } = service(RoleUtilisateur.COMPTABLE, 2);
    await s.definirJournaux('t1', 'u2', { restreindre: true, journaux: ['j1', 'j2', 'j1'] });
    const data = (update.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({ restreindreJournaux: true, journauxAutorises: ['j1', 'j2'] });
    expect(data.sessionsInvalidesAvant).toBeInstanceOf(Date);
  });

  it('lever la restriction vide la liste', async () => {
    const { s, update } = service(RoleUtilisateur.COMPTABLE);
    await s.definirJournaux('t1', 'u2', { restreindre: false, journaux: ['j1'] });
    expect((update.mock.calls[0][0] as { data: Record<string, unknown> }).data).toMatchObject({ restreindreJournaux: false, journauxAutorises: [] });
  });
});
