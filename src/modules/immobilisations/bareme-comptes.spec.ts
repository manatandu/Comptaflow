import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TypeCompteDetailTotal } from '@prisma/client';
import { BAREME_AMORTISSEMENT_013_2025 } from './bareme-amortissement-013-2025';
import { CORRESPONDANCE_BAREME_COMPTES } from './bareme-comptes-013-2025';
import { comptesDeLaNature, naturesDuCompte } from './bareme-comptes';
import { ImmobilisationService } from './immobilisation.service';
import { PLAN_COMPTES_SYSCOHADA } from '../comptes/compte-seed-syscohada';
import { PLAN_COMPTES_SYCEBNL } from '../comptes/compte-seed';

/**
 * LOT 6 · LE BARÈME ET LES COMPTES, DANS LES DEUX SENS (décision D-4).
 * Arrêté n° 013/CAB/MIN/FINANCES/2025, art. 2, contre les deux plans semés ·
 * aucun texte ne relie une nature à un compte, la table est une proposition
 * de l'éditeur, engendrée depuis `docs/bareme-013-2025-comptes.md`.
 */
const SEMIS = {
  SYSCOHADA: new Map(PLAN_COMPTES_SYSCOHADA.map((c) => [c.numero, c])),
  SYCEBNL: new Map(PLAN_COMPTES_SYCEBNL.map((c) => [c.numero, c])),
} as const;

describe('la correspondance engendrée', () => {
  it('couvre les 131 natures de l’art. 2, dans l’ordre de la table du barème', () => {
    expect(CORRESPONDANCE_BAREME_COMPTES.map((c) => c.cle)).toEqual(BAREME_AMORTISSEMENT_013_2025.map((n) => n.cle));
  });

  it('chaque numéro proposé est un compte de détail 21 à 24 de SON semis', () => {
    const fautes: string[] = [];
    for (const c of CORRESPONDANCE_BAREME_COMPTES) {
      for (const ref of ['SYSCOHADA', 'SYCEBNL'] as const) {
        for (const n of c[ref].comptes) {
          const compte = SEMIS[ref].get(n);
          if (!compte || !/^2[1-4]/.test(n) || (compte.typeCompte ?? TypeCompteDetailTotal.DETAIL) !== TypeCompteDetailTotal.DETAIL) {
            fautes.push(`${c.cle} ${ref} ${n}`);
          }
        }
      }
    }
    expect(fautes).toEqual([]);
  });

  it('un numéro, deux sens · le SYCEBNL ne propose jamais son 2443 (religieux) ni son 2444 (sportif) pour du bureau', () => {
    const proposes = CORRESPONDANCE_BAREME_COMPTES.flatMap((c) => c.SYCEBNL.comptes);
    expect(proposes).not.toContain('24430000');
    expect(proposes).not.toContain('24440000');
    expect(comptesDeLaNature('SYSCOHADA', 'VI.2').comptes).toEqual(['24440000']);
    expect(comptesDeLaNature('SYCEBNL', 'VI.2').comptes).toEqual(['24410000']);
  });

  it('le fichier committé est celui que la source engendre', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'bareme-comptes-'));
    const sortie = join(dossier, 'engendre.ts');
    execFileSync('node', [join(__dirname, '../../../scripts/extraire-bareme-comptes.cjs'), sortie]);
    expect(readFileSync(sortie, 'utf8')).toBe(readFileSync(join(__dirname, 'bareme-comptes-013-2025.ts'), 'utf8'));
  });
});

describe('dans les deux sens · décision D-4', () => {
  it('la nature propose ses comptes, le premier en tête ; aucun si le plan n’en ouvre pas', () => {
    expect(comptesDeLaNature('SYSCOHADA', 'I.1').comptes).toEqual(['21210000', '21220000', '21310000']);
    expect(comptesDeLaNature('SYSCOHADA', 'I.2').comptes).toEqual(['21500000']);
    expect(comptesDeLaNature('SYCEBNL', 'I.2').comptes).toEqual([]);
    expect(comptesDeLaNature('SYCEBNL', 'I.2').remarque).toMatch(/215/);
    expect(comptesDeLaNature('SYSCOHADA', 'ZZ.9').comptes).toEqual([]);
  });

  it('le compte ne propose que ses natures, sous-compte du cabinet compris', () => {
    expect(naturesDuCompte('SYSCOHADA', '24510000')).toEqual(['V.14', 'V.15', 'V.16', 'V.17', 'V.18']);
    expect(naturesDuCompte('SYSCOHADA', '24511000')).toEqual(naturesDuCompte('SYSCOHADA', '24510000'));
    // Le même numéro, deux listes · 2441 bureau des deux côtés, mais le
    // mobilier de bureau (VI.2) n'est au 2441 qu'au SYCEBNL.
    expect(naturesDuCompte('SYCEBNL', '24410000')).toContain('VI.2');
    expect(naturesDuCompte('SYSCOHADA', '24410000')).not.toContain('VI.2');
    expect(naturesDuCompte('SYSCOHADA', '22200000')).toEqual([]);
  });

  it('le serveur sert le barème avec les comptes du référentiel du dossier', async () => {
    const prisma = { tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: 'SYCEBNL' }) } };
    const svc = new ImmobilisationService(prisma as never, {} as never);
    const bareme = await svc.baremeFiscal('t');
    expect(bareme).toHaveLength(131);
    expect(bareme.find((n) => n.cle === 'VI.2')).toMatchObject({ dureeAns: 10, comptes: ['24410000'] });
    expect(prisma.tenant.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: 't' }, select: { referentiel: true } });
  });
});
