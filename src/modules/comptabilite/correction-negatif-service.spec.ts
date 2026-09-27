import { Prisma, StatutEcriture, StatutExercice } from '@prisma/client';
import { EcritureService } from './ecriture.service';

/**
 * CORRECTION PAR INSCRIPTION EN NÉGATIF · le câblage du service (audit final
 * F1). Les lignes recréées en négatif oubliaient leur ventilation analytique
 * et leur devise : le grand livre revenait à zéro, mais le réalisé par
 * section, l'état budgétaire et la position en devise comptaient encore
 * l'opération annulée. La réimputation, elle, recopiait l'analytique · le
 * même geste avait deux réponses.
 */
const D = (x: number) => new Prisma.Decimal(x);

function service(surcharge: Record<string, unknown> = {}) {
  const origine = {
    id: 'e1',
    tenantId: 't1',
    statut: StatutEcriture.VALIDEE,
    exerciceId: 'ex',
    journalId: 'j',
    journal: { id: 'j', code: 'ACH' },
    exercice: { statut: StatutExercice.OUVERT, dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') },
    libelle: 'Facture FA-1',
    reference: 'FA-1',
    numeroPiece: 12,
    estGenereeParCloture: false,
    corrigeEcritureId: null,
    correction: null,
    immobilisationAcquisition: null,
    immobilisationSortie: null,
    dotationAmortissement: null,
    lignes: [
      {
        compteId: 'c601',
        libelle: 'Achat',
        debit: D(2_800_000),
        credit: D(0),
        lettre: null,
        rapprochementId: null,
        tauxTvaId: null,
        dateEcheance: null,
        dateVersement: null,
        deviseId: 'usd',
        montantDevise: D(1000),
        coursApplique: D(2800),
        ventilations: [{ sectionId: 's1', planId: 'p1', debit: D(2_800_000), credit: D(0) }],
      },
      {
        compteId: 'c401',
        libelle: 'Fournisseur',
        debit: D(0),
        credit: D(2_800_000),
        lettre: null,
        rapprochementId: null,
        tauxTvaId: null,
        dateEcheance: null,
        dateVersement: null,
        deviseId: 'usd',
        montantDevise: D(1000),
        coursApplique: D(2800),
        ventilations: [],
      },
    ],
    ...surcharge,
  };
  const tx = { ecriture: { create: jest.fn().mockResolvedValue({}) } };
  // Tout modèle détenteur d'écriture répond « aucune » · la liste vit dans
  // `detenteursDe`, et la recopier ici la ferait diverger au premier ajout.
  const prisma = new Proxy(
    {
      ecriture: { findFirst: jest.fn().mockResolvedValue(origine) },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    } as Record<string, unknown>,
    { get: (cible, cle: string) => cible[cle] ?? { count: jest.fn().mockResolvedValue(0) } },
  );
  const journal = { prochainNumeroPiece: jest.fn().mockResolvedValue(13) };
  const exercice = { verifierEcritureAutorisee: jest.fn().mockResolvedValue(undefined) };
  return { s: new EcritureService(prisma as never, journal as never, exercice as never, {} as never), tx };
}

describe('Correction par inscription en négatif · le service', () => {
  it('recopie en négatif la ventilation analytique · le cumul de la section revient à zéro', async () => {
    const { s, tx } = service();
    await s.corrigerParInscriptionEnNegatif('t1', 'u1', 'e1', { motifCorrection: 'Doublon', date: '2026-06-30' } as never);
    const lignes = tx.ecriture.create.mock.calls[0][0].data.lignes.create;
    const ventilation = lignes[0].ventilations.create[0];
    expect({ section: ventilation.sectionId, net: Number(ventilation.debit) - Number(ventilation.credit) + 2_800_000 }).toEqual({
      section: 's1',
      net: 0,
    });
  });

  it('recopie la devise sans signe, le sens venant de la ligne', async () => {
    const { s, tx } = service();
    await s.corrigerParInscriptionEnNegatif('t1', 'u1', 'e1', { motifCorrection: 'Doublon', date: '2026-06-30' } as never);
    const l = tx.ecriture.create.mock.calls[0][0].data.lignes.create[1];
    expect({
      devise: l.deviseId,
      montant: Number(l.montantDevise),
      cours: Number(l.coursApplique),
      credit: Number(l.credit),
    }).toEqual({ devise: 'usd', montant: 1000, cours: 2800, credit: -2_800_000 });
  });
});

describe('une écriture de la clôture · le refus nomme le chemin qui existe (audit final F64)', () => {
  it('renvoie à l’imputation déclarée aux capitaux propres d’ouverture, et ne passe rien', async () => {
    const { s, tx } = service({ estGenereeParCloture: true });
    const refus = s.corrigerParInscriptionEnNegatif('t1', 'u1', 'e1', { motifCorrection: 'x', date: '2026-06-30' } as never);
    await expect(refus).rejects.toThrow(/imputation déclarée aux capitaux propres d'ouverture \(fenêtre Exercices\)/);
    expect(tx.ecriture.create).not.toHaveBeenCalled();
  });

  it('le service porte bien cette route', () => {
    expect(typeof (EcritureService.prototype as unknown as Record<string, unknown>).imputerAuxCapitauxPropresDOuverture).toBe(
      'function',
    );
  });
});
