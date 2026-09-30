import { readFileSync } from 'fs';
import { join } from 'path';
import { Referentiel, TypeComposant } from '@prisma/client';
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

  it('chaque texte ses propres comptes · 16 et 45 au SYCEBNL, 46 au SYSCOHADA seulement', () => {
    expect(contrepartieAcquisitionAdmise(EBNL, '24420000', '16200000')).toBe(true);
    expect(contrepartieAcquisitionAdmise(EBNL, '24420000', '45110000')).toBe(true);
    expect(contrepartieAcquisitionAdmise(EBNL, '24420000', '46110000')).toBe(false);
    expect(contrepartieAcquisitionAdmise(EBNL, '24420000', '16100000')).toBe(false);
    expect(contrepartieAcquisitionAdmise(EBNL, '24420000', '10300000')).toBe(false);
    // Le 16 du SYSCOHADA est un emprunt · jamais la contrepartie directe.
    expect(contrepartieAcquisitionAdmise(SYSCO, '24420000', '16200000')).toBe(false);
  });

  it('au SYCEBNL, la réserve de propriété et les factures non parvenues suivent la nature du bien', () => {
    // Semis · 48161/48181 incorporelles, 48162/48182 corporelles.
    expect(contrepartieAcquisitionAdmise(EBNL, '24420000', '48161000')).toBe(false);
    expect(contrepartieAcquisitionAdmise(EBNL, '24420000', '48181000')).toBe(false);
    expect(contrepartieAcquisitionAdmise(EBNL, '21300000', '48162000')).toBe(false);
    expect(contrepartieAcquisitionAdmise(EBNL, '21300000', '48182000')).toBe(false);
    expect(contrepartieAcquisitionAdmise(EBNL, '24420000', '48162000')).toBe(true);
    expect(contrepartieAcquisitionAdmise(EBNL, '24420000', '48182000')).toBe(true);
    expect(contrepartieAcquisitionAdmise(EBNL, '21300000', '48161000')).toBe(true);
    expect(contrepartieAcquisitionAdmise(EBNL, '21300000', '48181000')).toBe(true);
    // La liste proposée à l'écran est celle que le serveur admet.
    expect(racinesContrepartieAcquisition(EBNL, '24420000')).toEqual(
      ['101', '102', '104', '162', '163', '164', '165', '167', '45', '4812', '48162', '48182', '4822', '52', '53', '55', '57', '249', '252', '14', '72'],
    );
    expect(racinesContrepartieAcquisition(EBNL, '21300000')).toEqual(
      ['101', '102', '104', '162', '163', '164', '165', '167', '45', '4811', '48161', '48181', '4821', '52', '53', '55', '57', '251', '14', '72'],
    );
  });

  it('au SYSCOHADA, le 4816 et le 4818 non subdivisés restent communs aux deux natures', () => {
    for (const immo of ['21300000', '24420000']) {
      expect(contrepartieAcquisitionAdmise(SYSCO, immo, '48160000')).toBe(true);
      expect(contrepartieAcquisitionAdmise(SYSCO, immo, '48180000')).toBe(true);
    }
  });

  it('ce que la fiche du bien ajoute · AUDCIF Titre VII, classe 2 (passe R1, A2)', () => {
    // L'en-cours achevé, de la MÊME division que le bien (fiches 21 à 24).
    expect(contrepartieAcquisitionAdmise(SYSCO, '23110000', '23910000')).toBe(true);
    expect(contrepartieAcquisitionAdmise(SYSCO, '21300000', '21930000')).toBe(true);
    expect(contrepartieAcquisitionAdmise(SYSCO, '22200000', '22920000')).toBe(true);
    expect(contrepartieAcquisitionAdmise(SYSCO, '24420000', '24910000')).toBe(true);
    expect(contrepartieAcquisitionAdmise(SYSCO, '24420000', '23910000')).toBe(false);
    // Un bien porté sur l'en-cours ne se finance pas par lui-même.
    expect(contrepartieAcquisitionAdmise(SYSCO, '23910000', '23910000')).toBe(false);
    // L'avance soldée (fiche 25) · 251 incorporel, 252 corporel.
    expect(contrepartieAcquisitionAdmise(SYSCO, '21300000', '25100000')).toBe(true);
    expect(contrepartieAcquisitionAdmise(SYSCO, '21300000', '25200000')).toBe(false);
    expect(contrepartieAcquisitionAdmise(SYSCO, '24420000', '25200000')).toBe(true);
    // La part non libérée des titres (fiches 26 et 27) · pour eux seuls.
    expect(contrepartieAcquisitionAdmise(SYSCO, '26110000', '48130000')).toBe(true);
    expect(contrepartieAcquisitionAdmise(SYSCO, '27400000', '48130000')).toBe(true);
    expect(contrepartieAcquisitionAdmise(SYSCO, '24420000', '48130000')).toBe(false);
    // Le démantèlement, et lui seul, au 1984.
    const demantelement = { typeComposant: TypeComposant.DEMANTELEMENT };
    expect(contrepartieAcquisitionAdmise(SYSCO, '24420000', '19840000', demantelement)).toBe(true);
    expect(contrepartieAcquisitionAdmise(SYSCO, '24420000', '19840000', { typeComposant: TypeComposant.COMPOSANT })).toBe(false);
    expect(contrepartieAcquisitionAdmise(SYSCO, '24420000', '19840000')).toBe(false);
    expect(contrepartieAcquisitionAdmise(EBNL, '24420000', '19840000', demantelement)).toBe(false);
  });

  it('ce que la fiche du bien ajoute · SYCEBNL Partie 2 ch. 3 (passe R5, B2)', () => {
    // Subvention en nature (fiche 14), pour tout bien.
    expect(contrepartieAcquisitionAdmise(EBNL, '24420000', '14110000')).toBe(true);
    // Fonds reportés (fiche 20) · division 20 seulement, 171 pour l'usufruit.
    expect(contrepartieAcquisitionAdmise(EBNL, '20300000', '17200000')).toBe(true);
    expect(contrepartieAcquisitionAdmise(EBNL, '20300000', '17100000')).toBe(false);
    expect(contrepartieAcquisitionAdmise(EBNL, '20110000', '17100000')).toBe(true);
    expect(contrepartieAcquisitionAdmise(EBNL, '24420000', '17200000')).toBe(false);
    // En-cours achevé · fiches 23 et 24 seulement.
    expect(contrepartieAcquisitionAdmise(EBNL, '23110000', '23910000')).toBe(true);
    expect(contrepartieAcquisitionAdmise(EBNL, '24420000', '24910000')).toBe(true);
    expect(contrepartieAcquisitionAdmise(EBNL, '21300000', '21930000')).toBe(false);
    // Avance soldée, titres non libérés.
    expect(contrepartieAcquisitionAdmise(EBNL, '24420000', '25200000')).toBe(true);
    expect(contrepartieAcquisitionAdmise(EBNL, '26100000', '48130000')).toBe(true);
    // Production immobilisée (fiche 72) · 21, 23 ou 24, jamais un terrain.
    expect(contrepartieAcquisitionAdmise(EBNL, '24420000', '72200000')).toBe(true);
    expect(contrepartieAcquisitionAdmise(EBNL, '22200000', '72200000')).toBe(false);
  });

  it('le refus cite la fiche du compte du bien', () => {
    expect(motifRefusContrepartie(SYSCO, '24420000', '60100000')).toContain('AUDCIF, Titre VII, fiche du compte 24');
    expect(motifRefusContrepartie(EBNL, '26100000', '60100000')).toContain('SYCEBNL, Partie 2 ch. 3, fiche du compte 26');
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
        // Le 482 n'est pas semé au SYCEBNL.
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

  it('la liste servie à l’écran reçoit le type du composant · câblage du 1984', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ referentiel: SYSCO }) },
      familleImmobilisation: {
        findFirst: jest.fn().mockResolvedValue({ compteImmobilisation: { numero: '24420000' } }),
      },
      compte: { findMany },
    };
    const svc = new ImmobilisationService(prisma as never, {} as never);
    await svc.contrepartiesAcquisition('t1', 'f1', TypeComposant.DEMANTELEMENT);
    const racines = (findMany.mock.calls[0][0].where.OR as { numero: { startsWith: string } }[]).map((o) => o.numero.startsWith);
    expect(racines).toContain('1984');
    await svc.contrepartiesAcquisition('t1', 'f1');
    const sans = (findMany.mock.calls[1][0].where.OR as { numero: { startsWith: string } }[]).map((o) => o.numero.startsWith);
    expect(sans).not.toContain('1984');
  });
});
