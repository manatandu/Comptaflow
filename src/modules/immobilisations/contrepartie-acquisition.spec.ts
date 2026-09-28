import { readFileSync } from 'fs';
import { join } from 'path';
import { Referentiel } from '@prisma/client';
import {
  contrepartieAcquisitionAdmise,
  motifRefusContrepartie,
  racinesContrepartieAcquisition,
} from './contrepartie-acquisition';
import { ImmobilisationService } from './immobilisation.service';

/**
 * LA CONTREPARTIE D'UNE ACQUISITION EST UNE LISTE FERMÉE, lue dans la fiche
 * des comptes 21 à 24 de chaque texte. La prémisse est relue dans les deux
 * semis · chaque racine admise doit y ouvrir au moins un compte.
 */
const SYSCO = Referentiel.SYSCOHADA;
const EBNL = Referentiel.SYCEBNL;

describe('contrepartie d’une acquisition d’immobilisation', () => {
  it('admet trésorerie, fournisseurs d’investissements et apports, refuse charges, clients et TVA', () => {
    for (const ok of ['52110000', '57110000', '48120000', '40420000', '46110000', '10130000', '72210000']) {
      expect(contrepartieAcquisitionAdmise(SYSCO, '24420000', ok)).toBe(true);
    }
    for (const ko of ['60100000', '41110000', '44520000', '40110000', '10610000', '48130000', '58100000']) {
      expect(contrepartieAcquisitionAdmise(SYSCO, '24420000', ko)).toBe(false);
    }
  });

  it('le fournisseur suit la nature du bien · 4811 pour un incorporel, 4812 pour un corporel', () => {
    expect(contrepartieAcquisitionAdmise(SYSCO, '21300000', '48110000')).toBe(true);
    expect(contrepartieAcquisitionAdmise(SYSCO, '21300000', '48120000')).toBe(false);
    expect(contrepartieAcquisitionAdmise(SYSCO, '24420000', '48110000')).toBe(false);
  });

  it('chaque texte ses propres comptes · 16 et 45 au SYCEBNL, 72 et 46 au SYSCOHADA seulement', () => {
    expect(contrepartieAcquisitionAdmise(EBNL, '24420000', '16200000')).toBe(true);
    expect(contrepartieAcquisitionAdmise(EBNL, '24420000', '45110000')).toBe(true);
    expect(contrepartieAcquisitionAdmise(EBNL, '24420000', '72200000')).toBe(false);
    expect(contrepartieAcquisitionAdmise(EBNL, '24420000', '16100000')).toBe(false);
    expect(contrepartieAcquisitionAdmise(EBNL, '24420000', '10300000')).toBe(false);
    // Le 16 du SYSCOHADA est un emprunt · jamais la contrepartie directe.
    expect(contrepartieAcquisitionAdmise(SYSCO, '24420000', '16200000')).toBe(false);
  });

  it('le refus cite le texte du dossier', () => {
    expect(motifRefusContrepartie(SYSCO, '24420000', '60100000')).toContain('AUDCIF, Titre VII');
    expect(motifRefusContrepartie(EBNL, '24420000', '60100000')).toContain('SYCEBNL, Partie 2');
    expect(motifRefusContrepartie(EBNL, '24420000', '52110000')).toBeNull();
  });

  it('chaque racine admise ouvre au moins un compte dans le semis de son référentiel', () => {
    const semis = {
      [SYSCO]: readFileSync(join(__dirname, '../comptes/compte-seed-syscohada.ts'), 'utf8'),
      [EBNL]: readFileSync(join(__dirname, '../comptes/compte-seed.ts'), 'utf8'),
    };
    for (const ref of [SYSCO, EBNL]) {
      for (const immo of ['21300000', '24420000']) {
        const orphelines = racinesContrepartieAcquisition(ref, immo).filter((r) => !new RegExp(`'${r}\\d*'`).test(semis[ref]));
        // Le 482 n'est pas semé au SYCEBNL, le 4816 et le 4818 y sont en 48161/48181.
        expect(orphelines.filter((r) => !(ref === EBNL && ['4821', '4822'].includes(r)))).toEqual([]);
      }
    }
  });

  it('la création refuse une contrepartie hors liste, avant toute écriture', async () => {
    const creerEcriture = jest.fn();
    const prisma = {
      familleImmobilisation: { findFirst: jest.fn().mockResolvedValue({ id: 'f1', estActif: true, compteImmobilisationId: 'cimmo', dureeAmortissementAns: 5 }) },
      exercice: { findFirst: jest.fn().mockResolvedValue({ dateDebut: new Date('2026-01-01') }) },
      compte: {
        findFirst: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve(where.id === 'cimmo' ? { id: 'cimmo', numero: '24420000' } : where.id === 'c601' ? { id: 'c601', numero: '60100000' } : null),
        ),
      },
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: 'SYSCOHADA' }) },
    };
    const svc = new ImmobilisationService(prisma as never, { creer: creerEcriture } as never);
    await expect(
      svc.creer('t1', 'u1', {
        familleId: 'f1',
        designation: 'Ordinateur',
        dateAcquisition: '2026-03-01',
        dateMiseEnService: '2026-03-01',
        valeurOrigine: 1000,
        exerciceId: 'ex',
        journalId: 'j',
        compteContrepartieId: 'c601',
      } as never),
    ).rejects.toThrow("n'est pas une contrepartie d'acquisition");
    expect(creerEcriture).not.toHaveBeenCalled();
  });
});
