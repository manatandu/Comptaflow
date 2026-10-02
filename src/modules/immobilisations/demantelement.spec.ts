import { NatureMouvementDemantelement, StatutExercice, StatutImmobilisation, TypeComposant } from '@prisma/client';
import {
  desactualisationExercice,
  moisDeDesactualisation,
  motifRefusDesactualisation,
  motifRefusParametresDemantelement,
  motifRefusReprise,
  resteADesactualiser,
  valeurActualiseeDemantelement,
  ventilationReprise,
} from './demantelement';
import { COMPTES_DEMANTELEMENT, DemantelementService } from './demantelement.service';
import { PLAN_COMPTES_SYSCOHADA } from '../comptes/compte-seed-syscohada';
import { PLAN_COMPTES_SYCEBNL } from '../comptes/compte-seed';

/**
 * LOT 15 · DÉMANTÈLEMENT · AUDCIF Titre VIII ch. 6. Exemple du texte (§ 2.5) ·
 * matériel de 200 000 000 acquis le 02/01/N, dix ans, démantèlement de
 * 10 000 000 au terme, 12 % · actif de démantèlement 3 219 732 ; au 31/12/N,
 * provision 3 606 100, désactualisation 386 368 (D 6971 / C 1984).
 */
describe('provision pour démantèlement · règle (lot 15)', () => {
  it('exemple du texte · valeur actualisée 3 219 732 F', () => {
    expect(Math.round(valeurActualiseeDemantelement(10_000_000, 12, 10))).toBe(3_219_732);
  });

  it('exemple du texte · désactualisation de N 386 368 F, provision 3 606 100 F au 31/12/N', () => {
    const mois = moisDeDesactualisation({ dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') }, new Date('2026-01-02'));
    expect(mois).toBe(12);
    const d = desactualisationExercice({ provisionOuverture: 3_219_732, tauxPourcent: 12, mois, coutFutur: 10_000_000 });
    expect(Math.round(d)).toBe(386_368);
    expect(Math.round(3_219_732 + d)).toBe(Math.round(valeurActualiseeDemantelement(10_000_000, 12, 9)));
    expect(Math.round(valeurActualiseeDemantelement(10_000_000, 12, 9))).toBe(3_606_100);
  });

  it('dix désactualisations rendent la provision au coût attendu, jamais au-delà', () => {
    let provision = valeurActualiseeDemantelement(10_000_000, 12, 10);
    for (let k = 0; k < 12; k++) {
      provision += desactualisationExercice({ provisionOuverture: provision, tauxPourcent: 12, mois: 12, coutFutur: 10_000_000 });
    }
    expect(provision).toBeCloseTo(10_000_000, 2);
  });

  it('une entrée en cours d’exercice ne court que de son mois ; postérieure, rien', () => {
    const ex = { dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };
    expect(moisDeDesactualisation(ex, new Date('2026-07-15'))).toBe(6);
    expect(moisDeDesactualisation(ex, new Date('2027-01-02'))).toBe(0);
    expect(moisDeDesactualisation(ex, new Date('2024-01-02'))).toBe(12);
  });

  it('la reprise solde le 1984 · valeur d’entrée au 7911, désactualisations au 7971 (§ 4.1, § 4.2)', () => {
    expect(ventilationReprise(3_219_732, [386_367.84, 432_732])).toEqual({ exploitation: 3_219_732, financiere: 819_099.84, total: 4_038_831.84 });
  });

  it('les paramètres ne vont qu’au composant démantèlement, taux exigé, entrée sous le coût attendu', () => {
    const p = { estComposantDemantelement: true, coutFutur: 10_000_000, tauxPourcent: 12, valeurOrigine: 3_219_732 };
    expect(motifRefusParametresDemantelement(p)).toBeNull();
    expect(motifRefusParametresDemantelement({ ...p, coutFutur: null, tauxPourcent: null })).toBeNull();
    expect(motifRefusParametresDemantelement({ ...p, estComposantDemantelement: false })).toContain('composant démantèlement');
    expect(motifRefusParametresDemantelement({ ...p, tauxPourcent: null })).toContain("taux d'actualisation");
    expect(motifRefusParametresDemantelement({ ...p, valeurOrigine: 12_000_000 })).toContain('dépasse le coût attendu');
  });

  const etat = {
    estComposantDemantelement: true,
    entreParLaProvision: true,
    tauxPourcent: 12,
    exerciceOuvert: true,
    dejaPassee: false,
    repriseFaite: false,
    enService: true,
    mois: 12,
    exercicesManquants: [] as string[],
  };
  it('chaque refus de la désactualisation est nommé', () => {
    expect(motifRefusDesactualisation(etat)).toBeNull();
    expect(motifRefusDesactualisation({ ...etat, estComposantDemantelement: false })).toContain('composant démantèlement');
    expect(motifRefusDesactualisation({ ...etat, entreParLaProvision: false })).toContain('1984');
    expect(motifRefusDesactualisation({ ...etat, tauxPourcent: null })).toContain('Aucun taux');
    expect(motifRefusDesactualisation({ ...etat, exerciceOuvert: false })).toContain('clôturé');
    expect(motifRefusDesactualisation({ ...etat, repriseFaite: true })).toContain('reprise');
    expect(motifRefusDesactualisation({ ...etat, enService: false })).toContain('sorti');
    expect(motifRefusDesactualisation({ ...etat, dejaPassee: true })).toContain('déjà passée');
    expect(motifRefusDesactualisation({ ...etat, mois: 0 })).toContain('après la fin');
    expect(motifRefusDesactualisation({ ...etat, exercicesManquants: ["l'exercice 2026"] })).toContain("l'exercice 2026");
  });

  it('chaque refus de la reprise est nommé', () => {
    const r = { estComposantDemantelement: true, entreParLaProvision: true, exerciceOuvert: true, repriseFaite: false, dateDansExercice: true };
    expect(motifRefusReprise(r)).toBeNull();
    expect(motifRefusReprise({ ...r, entreParLaProvision: false })).toContain('1984');
    expect(motifRefusReprise({ ...r, repriseFaite: true })).toContain('déjà été reprise');
    expect(motifRefusReprise({ ...r, dateDansExercice: false })).toContain("dans l'exercice");
    expect(motifRefusReprise({ ...r, exerciceOuvert: false })).toContain('clôturé');
    expect(motifRefusReprise({ ...r, repris: true })).toContain("repris au bilan d'ouverture");
    expect(motifRefusReprise({ ...r, exercicesManquants: ["l'exercice 2025"] })).toContain("l'exercice 2025");
    expect(motifRefusReprise({ ...r, desactualiseeJusquAu: '2026-12-31' })).toContain('2026-12-31');
  });

  it('SMT et composant repris ferment la désactualisation, chacun par son motif', () => {
    expect(motifRefusDesactualisation({ ...etat, refusSystemeMinimal: 'SMT' })).toBe('SMT');
    expect(motifRefusDesactualisation({ ...etat, repris: true })).toContain("repris au bilan d'ouverture");
  });

  it('rien à désactualiser · taux nul ou absent, ou provision au coût attendu', () => {
    expect(resteADesactualiser({ tauxPourcent: 12, provision: 3_219_732, coutFutur: 10_000_000 })).toBe(true);
    expect(resteADesactualiser({ tauxPourcent: 0, provision: 3_219_732, coutFutur: 10_000_000 })).toBe(false);
    expect(resteADesactualiser({ tauxPourcent: null, provision: 3_219_732, coutFutur: null })).toBe(false);
    expect(resteADesactualiser({ tauxPourcent: 12, provision: 10_000_000, coutFutur: 10_000_000 })).toBe(false);
    expect(resteADesactualiser({ tauxPourcent: 12, provision: 3_219_732, coutFutur: null })).toBe(true);
  });

  it('la reprise en cours d’exercice arrête les mois à sa date', () => {
    const ex = { dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };
    expect(moisDeDesactualisation(ex, new Date('2026-01-02'), new Date('2026-06-30'))).toBe(6);
    expect(moisDeDesactualisation(ex, new Date('2026-01-02'))).toBe(12);
  });

  it('les comptes du texte sont semés, les mêmes aux deux plans', () => {
    for (const plan of [PLAN_COMPTES_SYSCOHADA, PLAN_COMPTES_SYCEBNL]) {
      const numeros = plan.map((c) => c.numero);
      for (const r of Object.values(COMPTES_DEMANTELEMENT)) expect(numeros).toContain(`${r}0000`);
    }
  });
});

/** Le câblage · écriture D 6971 / C 1984, ligne retenue, refus avant toute écriture. */
describe('provision pour démantèlement · service (lot 15)', () => {
  const exercice = { id: 'ex-1', tenantId: 't', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31'), statut: StatutExercice.OUVERT };
  function monter(
    options: { credit1984?: number; mouvements?: unknown[]; anterieurs?: unknown[]; regime?: Record<string, unknown>; ecritureAcquisitionId?: string | null } = {},
  ) {
    let rang = 0;
    const creer = jest.fn().mockImplementation(() => Promise.resolve({ id: `ecr-${++rang}` }));
    const retirer = jest.fn().mockResolvedValue(undefined);
    const create = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'mv-1', ...data }));
    const prisma: any = {
      immobilisation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'c-1',
          designation: 'Plate-forme · démantèlement',
          typeComposant: TypeComposant.DEMANTELEMENT,
          immobilisationPrincipaleId: 'p-1',
          valeurOrigine: 3_219_732,
          dateAcquisition: new Date('2026-01-02'),
          statut: StatutImmobilisation.EN_SERVICE,
          ecritureAcquisitionId: options.ecritureAcquisitionId === undefined ? 'acq-1' : options.ecritureAcquisitionId,
          coutFuturDemantelement: 10_000_000,
          tauxActualisationDemantelementPourcent: 12,
          mouvementsDemantelement: options.mouvements ?? [],
        }),
      },
      ligneEcriture: { count: jest.fn().mockResolvedValue(options.credit1984 ?? 1) },
      exercice: {
        findFirst: jest.fn().mockResolvedValue(exercice),
        findMany: jest.fn().mockResolvedValue(options.anterieurs ?? []),
      },
      compte: { findFirst: jest.fn().mockImplementation(({ where }) => Promise.resolve({ id: `cpt-${where.numero.startsWith}`, numero: `${where.numero.startsWith}0000` })) },
      mouvementDemantelement: { create, delete: jest.fn().mockResolvedValue({}) },
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: 'SYSCOHADA', systemeComptableSyscohada: 'NORMAL', ...options.regime }) },
      $transaction: (f: (tx: unknown) => unknown) => f(prisma),
    };
    const service = new DemantelementService(prisma, { creer, retirerCompensation: retirer } as any);
    return { service, creer, create, retirer, prisma };
  }

  it('désactualise au 31 décembre · D 6971 / C 1984 pour 386 367,84, ligne retenue', async () => {
    const { service, creer, create } = monter();
    await service.desactualiser('t', 'u', 'c-1', { exerciceId: 'ex-1', journalId: 'j-1' });
    const lignes = creer.mock.calls[0][2].lignes;
    expect(creer.mock.calls[0][2].date).toBe('2026-12-31');
    expect(lignes).toEqual([
      { compteId: 'cpt-6971', debit: 386_367.84, credit: 0 },
      { compteId: 'cpt-1984', debit: 0, credit: 386_367.84 },
    ]);
    expect(create.mock.calls[0][0].data).toMatchObject({ nature: NatureMouvementDemantelement.DESACTUALISATION, ecritureId: 'ecr-1', montant: 386_367.84 });
  });

  it('refusé avant toute écriture sur un composant qui n’est pas entré par le 1984', async () => {
    const { service, creer } = monter({ credit1984: 0 });
    await expect(service.desactualiser('t', 'u', 'c-1', { exerciceId: 'ex-1', journalId: 'j-1' })).rejects.toThrow('1984');
    expect(creer).not.toHaveBeenCalled();
  });

  it('refusé tant qu’un exercice antérieur traversé n’a pas sa désactualisation', async () => {
    const { service, creer } = monter({ anterieurs: [{ id: 'ex-0', dateDebut: new Date('2025-01-01'), dateFin: new Date('2025-12-31') }] });
    await expect(service.desactualiser('t', 'u', 'c-1', { exerciceId: 'ex-1', journalId: 'j-1' })).rejects.toThrow('2025-01-01');
    expect(creer).not.toHaveBeenCalled();
  });

  it('reprise au 31 décembre · D 1984 / C 7911 / C 7971, sur la valeur d’entrée et le cumul des désactualisations', async () => {
    // La désactualisation de l'exercice est passée jusqu'au 31/12 · rien de
    // couru ne reste, une seule écriture.
    const { service, creer, create } = monter({
      mouvements: [
        { nature: NatureMouvementDemantelement.DESACTUALISATION, exerciceId: 'ex-1', date: new Date('2026-12-31'), montant: 386_367.84 },
      ],
    });
    await service.reprendre('t', 'u', 'c-1', { exerciceId: 'ex-1', journalId: 'j-1', date: '2026-12-31', motif: 'ENGAGEMENT_COUTS' });
    expect(creer).toHaveBeenCalledTimes(1);
    expect(creer.mock.calls[0][2].lignes).toEqual([
      { compteId: 'cpt-1984', debit: 3_606_099.84, credit: 0 },
      { compteId: 'cpt-7911', debit: 0, credit: 3_219_732 },
      { compteId: 'cpt-7971', debit: 0, credit: 386_367.84 },
    ]);
    expect(create.mock.calls[0][0].data).toMatchObject({ nature: NatureMouvementDemantelement.REPRISE, motifReprise: 'ENGAGEMENT_COUTS' });
  });

  it('reprise en cours d’exercice · la désactualisation courue jusqu’à elle est passée d’abord, puis reprise au 7971', async () => {
    // Exemple du texte, entrée le 2 janvier 2026, démantelé le 30 juin ·
    // 3 219 732 × (1,12^(6/12) − 1) = 187 712,06 courus de janvier à juin.
    const { service, creer, create } = monter();
    await service.reprendre('t', 'u', 'c-1', { exerciceId: 'ex-1', journalId: 'j-1', date: '2026-06-30', motif: 'ENGAGEMENT_COUTS' });
    expect(creer).toHaveBeenCalledTimes(2);
    expect(creer.mock.calls[0][2]).toMatchObject({ date: '2026-06-30' });
    expect(creer.mock.calls[0][2].lignes).toEqual([
      { compteId: 'cpt-6971', debit: 187_712.06, credit: 0 },
      { compteId: 'cpt-1984', debit: 0, credit: 187_712.06 },
    ]);
    expect(creer.mock.calls[1][2].lignes).toEqual([
      { compteId: 'cpt-1984', debit: 3_407_444.06, credit: 0 },
      { compteId: 'cpt-7911', debit: 0, credit: 3_219_732 },
      { compteId: 'cpt-7971', debit: 0, credit: 187_712.06 },
    ]);
    expect(create.mock.calls.map((c) => c[0].data.nature)).toEqual([
      NatureMouvementDemantelement.DESACTUALISATION,
      NatureMouvementDemantelement.REPRISE,
    ]);
  });

  it('reprise refusée tant qu’un exercice antérieur traversé n’a pas sa désactualisation', async () => {
    const { service, creer } = monter({ anterieurs: [{ id: 'ex-0', dateDebut: new Date('2025-01-01'), dateFin: new Date('2025-12-31') }] });
    await expect(
      service.reprendre('t', 'u', 'c-1', { exerciceId: 'ex-1', journalId: 'j-1', date: '2026-06-30', motif: 'ENGAGEMENT_COUTS' }),
    ).rejects.toThrow(/Désactualisation non passée pour l'exercice du 2025-01-01/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('reprise refusée avant la date jusqu’à laquelle l’exercice est déjà désactualisé', async () => {
    const { service, creer } = monter({
      mouvements: [
        { nature: NatureMouvementDemantelement.DESACTUALISATION, exerciceId: 'ex-1', date: new Date('2026-12-31'), montant: 386_367.84 },
      ],
    });
    await expect(
      service.reprendre('t', 'u', 'c-1', { exerciceId: 'ex-1', journalId: 'j-1', date: '2026-06-30', motif: 'ENGAGEMENT_COUTS' }),
    ).rejects.toThrow(/déjà passée jusqu'au 2026-12-31/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('une reprise refusée à l’écriture défait la désactualisation courue qu’elle venait de passer', async () => {
    const { service, creer, retirer, prisma } = monter();
    creer.mockImplementationOnce(() => Promise.resolve({ id: 'ecr-couru' })).mockImplementationOnce(() => Promise.reject(new Error('journal fermé')));
    await expect(
      service.reprendre('t', 'u', 'c-1', { exerciceId: 'ex-1', journalId: 'j-1', date: '2026-06-30', motif: 'ENGAGEMENT_COUTS' }),
    ).rejects.toThrow('journal fermé');
    expect(prisma.mouvementDemantelement.delete).toHaveBeenCalledTimes(1);
    expect(retirer).toHaveBeenCalledWith('t', 'ecr-couru');
  });

  it.each([
    ['SYSCOHADA', { referentiel: 'SYSCOHADA', systemeComptableSyscohada: 'MINIMAL_TRESORERIE' }],
    ['SYCEBNL', { referentiel: 'SYCEBNL', jeuEtatsFinanciersSycebnl: 'SYSTEME_MINIMAL_TRESORERIE' }],
  ])('%s au SMT · la désactualisation est refusée, la reprise solde sans rien créer', async (_ref, regime) => {
    const { service, creer } = monter({ regime });
    await expect(service.desactualiser('t', 'u', 'c-1', { exerciceId: 'ex-1', journalId: 'j-1' })).rejects.toThrow(
      /Système minimal de trésorerie/,
    );
    expect(creer).not.toHaveBeenCalled();
    await service.reprendre('t', 'u', 'c-1', { exerciceId: 'ex-1', journalId: 'j-1', date: '2026-06-30', motif: 'CESSION_SOUS_JACENT' });
    expect(creer).toHaveBeenCalledTimes(1);
    expect(creer.mock.calls[0][2].lignes).toEqual([
      { compteId: 'cpt-1984', debit: 3_219_732, credit: 0 },
      { compteId: 'cpt-7911', debit: 0, credit: 3_219_732 },
    ]);
  });

  it('composant repris au bilan d’ouverture · désactualisation et reprise refusées, la raison dite', async () => {
    const { service, creer } = monter({ ecritureAcquisitionId: null, credit1984: 0 });
    await expect(service.desactualiser('t', 'u', 'c-1', { exerciceId: 'ex-1', journalId: 'j-1' })).rejects.toThrow(/repris au bilan d'ouverture/);
    await expect(
      service.reprendre('t', 'u', 'c-1', { exerciceId: 'ex-1', journalId: 'j-1', date: '2026-06-30', motif: 'ENGAGEMENT_COUTS' }),
    ).rejects.toThrow(/repris au bilan d'ouverture/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('l’état ne propose plus de reprise une fois faite', async () => {
    const { service } = monter({
      mouvements: [{ nature: NatureMouvementDemantelement.REPRISE, exerciceId: 'ex-1', date: new Date('2026-06-30'), montant: 3_219_732 }],
    });
    const etat = await service.etat('t', 'c-1', 'ex-1');
    expect(etat.repriseFaite).toBe(true);
    expect(etat.reprise).toBeNull();
  });

  it('une ligne refusée retire son écriture, et un double envoi se dit en 409', async () => {
    const { service, create, retirer } = monter();
    const { Prisma } = jest.requireActual('@prisma/client');
    create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('doublon', { code: 'P2002', clientVersion: 'x' }));
    await expect(service.desactualiser('t', 'u', 'c-1', { exerciceId: 'ex-1', journalId: 'j-1' })).rejects.toThrow('déjà passé');
    expect(retirer).toHaveBeenCalledWith('t', 'ecr-1');
  });
});
