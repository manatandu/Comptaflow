import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { Referentiel } from '@prisma/client';
import { TenantService } from './tenant.service';
import { ModifierCoordonneesDto } from './dto/parametres-dossier.dto';
import {
  MOTIF_CODE_ACTIVITE_FORMAT,
  MOTIF_CODE_ACTIVITE_SYCEBNL,
  avertissementCodeActivite,
  motifRefusCodeActivite,
  normaliserCodeActivite,
} from './code-activite-principale';

/**
 * CODE ACTIVITÉ PRINCIPALE (passe R3) · AUDCIF Titre IX ch. 6, NOTE 36,
 * nomenclature à six chiffres dont le texte énumère les 44 GROUPES sans
 * donner la liste des postes. D'où trois règles : SYSCOHADA seul, le format
 * refusé, le groupe hors liste seulement signalé.
 */
describe('Code activité principale · règle', () => {
  it('six chiffres, les espaces de lecture retirés ; la chaîne vide et null effacent', () => {
    expect(normaliserCodeActivite(' 031 003 ')).toBe('031003');
    expect(normaliserCodeActivite('')).toBeNull();
    expect(normaliserCodeActivite(null)).toBeNull();
    expect(normaliserCodeActivite(undefined)).toBeUndefined();
  });

  it('refuse un dossier SYCEBNL et un format autre que six chiffres, jamais un effacement', () => {
    expect(motifRefusCodeActivite(Referentiel.SYCEBNL, '031003')).toBe(MOTIF_CODE_ACTIVITE_SYCEBNL);
    expect(motifRefusCodeActivite(Referentiel.SYSCOHADA, '31003')).toBe(MOTIF_CODE_ACTIVITE_FORMAT);
    expect(motifRefusCodeActivite(Referentiel.SYSCOHADA, 'A01020')).toBe(MOTIF_CODE_ACTIVITE_FORMAT);
    expect(motifRefusCodeActivite(Referentiel.SYSCOHADA, '031003')).toBeNull();
    expect(motifRefusCodeActivite(Referentiel.SYCEBNL, null)).toBeNull();
  });

  it('un groupe hors des 44 est AVERTI, un groupe de la NOTE 36 ne l’est pas', () => {
    expect(avertissementCodeActivite('044000')).toBeNull();
    expect(avertissementCodeActivite('001001')).toBeNull();
    expect(avertissementCodeActivite('045001')).toContain('045');
    expect(avertissementCodeActivite('000001')).toContain('000');
    expect(avertissementCodeActivite(null)).toBeNull();
  });
});

describe('Code activité principale · route des coordonnées', () => {
  const service = (capture: { data?: Record<string, unknown> }, tenant: Record<string, unknown>) =>
    new TenantService({
      tenant: {
        findUnique: async () => ({ dossierMereId: null, _count: { cellules: 0 }, ...tenant }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          capture.data = data;
          Object.assign(tenant, data);
          return tenant;
        },
      },
      ecriture: { count: async () => 0 },
      compte: { findMany: async () => [] },
      devise: { findFirst: async () => null },
    } as never);

  it('le DTO admet le champ, null compris', async () => {
    const erreurs = await validate(plainToInstance(ModifierCoordonneesDto, { codeActivitePrincipale: null }), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(erreurs).toHaveLength(0);
  });

  it('SYSCOHADA · enregistré normalisé, et les 44 groupes sont servis', async () => {
    const capture: { data?: Record<string, unknown> } = {};
    const tenant = { id: 't1', referentiel: Referentiel.SYSCOHADA, codeActivitePrincipale: null };
    const p = (await service(capture, tenant).modifierCoordonnees('t1', { codeActivitePrincipale: '031 003' })) as Record<
      string,
      unknown
    >;
    expect(capture.data!.codeActivitePrincipale).toBe('031003');
    expect(p.codeActivitePrincipale).toBe('031003');
    expect(p.avertissementCodeActivitePrincipale).toBeNull();
    expect((p.groupesActivites as unknown[]).length).toBe(44);
  });

  it('SYSCOHADA · un groupe hors liste est enregistré ET averti', async () => {
    const capture: { data?: Record<string, unknown> } = {};
    const tenant = { id: 't1', referentiel: Referentiel.SYSCOHADA, codeActivitePrincipale: null };
    const p = (await service(capture, tenant).modifierCoordonnees('t1', { codeActivitePrincipale: '099001' })) as Record<
      string,
      unknown
    >;
    expect(capture.data!.codeActivitePrincipale).toBe('099001');
    expect(String(p.avertissementCodeActivitePrincipale)).toContain('099');
  });

  it('SYSCOHADA · un format faux est refusé en 400 nommé, rien n’est écrit', async () => {
    const capture: { data?: Record<string, unknown> } = {};
    const tenant = { id: 't1', referentiel: Referentiel.SYSCOHADA };
    await expect(service(capture, tenant).modifierCoordonnees('t1', { codeActivitePrincipale: '3100' })).rejects.toThrow(
      MOTIF_CODE_ACTIVITE_FORMAT,
    );
    expect(capture.data).toBeUndefined();
  });

  it('SYCEBNL · refusé en 400 nommé, mais l’effacement passe, et aucun groupe n’est servi', async () => {
    const capture: { data?: Record<string, unknown> } = {};
    const tenant = { id: 't1', referentiel: Referentiel.SYCEBNL, codeActivitePrincipale: '031003' };
    await expect(service(capture, tenant).modifierCoordonnees('t1', { codeActivitePrincipale: '031003' })).rejects.toThrow(
      MOTIF_CODE_ACTIVITE_SYCEBNL,
    );
    expect(capture.data).toBeUndefined();
    const p = (await service(capture, tenant).modifierCoordonnees('t1', { codeActivitePrincipale: null })) as Record<
      string,
      unknown
    >;
    expect(capture.data!.codeActivitePrincipale).toBeNull();
    expect(p.groupesActivites).toEqual([]);
  });

  it('un appel qui ne porte pas le champ n’y touche pas', async () => {
    const capture: { data?: Record<string, unknown> } = {};
    await service(capture, { id: 't1', referentiel: Referentiel.SYCEBNL }).modifierCoordonnees('t1', { ville: 'Goma' });
    expect(capture.data!.codeActivitePrincipale).toBeUndefined();
  });
});
