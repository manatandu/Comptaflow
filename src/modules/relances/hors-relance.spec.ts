import { BadRequestException } from '@nestjs/common';
import { Referentiel, StatutMessage, TypeRelance } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { CourrierService } from '../courrier/courrier.service';
import { RelancesService } from './relances.service';

/**
 * EXCLURE UN TIERS DU CIRCUIT DE RELANCE · Sage, Rappels et relevés :
 * « Actions disponibles : exclure du circuit ».
 *
 * Le piège de cette fonction n'est pas la case à cocher, c'est ce qu'on lui
 * fait faire de trop. Une exclusion qui retirerait la position de la liste
 * paraîtrait plus propre, et serait fausse deux fois :
 *
 *  · la créance ne disparaît pas parce qu'on renonce à écrire. Le tiers doit
 *    rester visible partout où l'ouvert se recense, faute de quoi le poste
 *    paraît apuré et l'entité minore ses créances ;
 *  · une liste qui ne montre plus l'exclu ne permet plus de LEVER
 *    l'exclusion · elle se pérennise toute seule.
 *
 * Ce qui est éprouvé ici : la position reste, le montant ne bouge pas, aucun
 * niveau n'est suggéré, aucune lettre ne part même sur désignation expresse,
 * le lot survit, et l'exclusion ne s'enregistre pas sans motif.
 */

const DOSSIER = 'd-1';
const AGENT = 'u-1';
const JOUR = 86_400_000;

const NIVEAU = {
  id: 'n-2',
  tenantId: DOSSIER,
  niveau: 2,
  libelle: 'Premier rappel',
  type: TypeRelance.RAPPEL,
  joursApresEcheance: 15,
  modeleTexte: 'Cher {tiers}, la somme de {montant} demeure due au {date}.\n{detail}\n{entite}',
  estActif: true,
};

function ligne(
  numero: string,
  tiers: { id: string; nom: string; horsRelance: boolean; motifHorsRelance?: string | null },
) {
  return {
    debit: 150_000,
    credit: 0,
    lettre: null,
    libelle: `Facture ${numero}`,
    dateEcheance: new Date(Date.now() - 60 * JOUR),
    compte: {
      id: `c-${numero}`,
      numero,
      intitule: 'Client',
      tiersCompte: {
        tiers: {
          id: tiers.id,
          nom: tiers.nom,
          type: 'CLIENT',
          email: 'client@example.cd',
          horsRelance: tiers.horsRelance,
          motifHorsRelance: tiers.motifHorsRelance ?? null,
          horsRelanceDepuis: tiers.horsRelance ? new Date('2026-03-01') : null,
        },
      },
    },
    ecriture: { date: new Date(Date.now() - 90 * JOUR), libelle: 'Vente' },
  };
}

function service(lignes: ReturnType<typeof ligne>[], tiersEnBase?: Record<string, unknown> | null) {
  let cree = 0;
  const relanceCreate = jest.fn(async () => ({ id: `r-${++cree}` }));
  const tiersUpdate = jest.fn(async ({ data }: { data: unknown }) => data);
  const prisma = {
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: Referentiel.SYSCOHADA }),
      findUnique: jest.fn().mockResolvedValue({ nom: 'ONG Kin' }),
    },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue(lignes) },
    // Le niveau 2 est atteignable : sans lui, `niveauSuggere` serait nul pour
    // tout le monde et le test de l'exclusion ne prouverait rien.
    niveauRelance: {
      findFirst: jest.fn().mockResolvedValue(NIVEAU),
      findMany: jest.fn().mockResolvedValue([NIVEAU]),
    },
    relance: { findMany: jest.fn().mockResolvedValue([]), create: relanceCreate },
    tiers: {
      findFirst: jest.fn().mockResolvedValue(tiersEnBase === undefined ? { id: 'ti-1', tenantId: DOSSIER } : tiersEnBase),
      update: tiersUpdate,
    },
  } as unknown as PrismaService;
  const courrier = {
    mettreEnFile: jest.fn(async () => ({ id: 'm-1', statut: StatutMessage.SANS_TRANSPORT, erreur: null })),
  } as unknown as CourrierService;
  return { svc: new RelancesService(prisma, courrier), relanceCreate, tiersUpdate };
}

describe('Exclusion d’un tiers du circuit de relance', () => {
  it('LAISSE la position dans la liste, montant intact · l’exclusion ne solde rien', async () => {
    // Le défaut naturel serait de filtrer la position. Le tiers doit toujours
    // 150 000, et une liste qui ne le montre plus laisse croire l'inverse.
    const { svc } = service([ligne('41100001', { id: 'ti-1', nom: 'SARL Amani', horsRelance: true, motifHorsRelance: 'Litige confié à Me Kabeya' })]);
    const positions = await svc.positions(DOSSIER, { exerciceId: 'ex-1' });
    expect(positions).toHaveLength(1);
    expect(positions[0].montantDu).toBe(150_000);
    expect(positions[0].horsRelance).toBe(true);
    expect(positions[0].motifHorsRelance).toBe('Litige confié à Me Kabeya');
    expect(positions[0].horsRelanceDepuis).toBe('2026-03-01');
  });

  it('ne suggère AUCUN niveau à un tiers exclu, alors que le seuil est franchi', async () => {
    const exclu = service([ligne('41100001', { id: 'ti-1', nom: 'SARL Amani', horsRelance: true, motifHorsRelance: 'Litige' })]);
    const ordinaire = service([ligne('41100002', { id: 'ti-2', nom: 'SARL Bomoko', horsRelance: false })]);
    // Même retard, même montant : seule l'exclusion les sépare. Sans ce
    // second appel, un `niveauSuggere` toujours nul passerait pour un succès.
    expect((await ordinaire.svc.positions(DOSSIER, { exerciceId: 'ex-1' }))[0].niveauSuggere).toBe(2);
    expect((await exclu.svc.positions(DOSSIER, { exerciceId: 'ex-1' }))[0].niveauSuggere).toBeNull();
  });

  it('n’écrit AUCUNE lettre à un tiers exclu, même désigné expressément', async () => {
    // Le refus vit dans le service et pas seulement à l'écran · la route
    // reste ouverte à un appel direct (CLAUDE.md § 6).
    const { svc, relanceCreate } = service([
      ligne('41100001', { id: 'ti-1', nom: 'SARL Amani', horsRelance: true, motifHorsRelance: 'Échéancier convenu au 30/06' }),
    ]);
    const r = await svc.emettre(DOSSIER, AGENT, { exerciceId: 'ex-1', niveauId: NIVEAU.id, compteIds: ['c-41100001'] });
    expect(relanceCreate).not.toHaveBeenCalled();
    expect(r.emises).toBe(0);
    expect(r.exclues).toEqual([
      { compteId: 'c-41100001', tiers: 'SARL Amani', motif: 'Échéancier convenu au 30/06' },
    ]);
  });

  it('le tiers exclu n’emporte pas le lot · les autres lettres partent', async () => {
    const { svc, relanceCreate } = service([
      ligne('41100001', { id: 'ti-1', nom: 'SARL Amani', horsRelance: true, motifHorsRelance: 'Litige' }),
      ligne('41100002', { id: 'ti-2', nom: 'SARL Bomoko', horsRelance: false }),
    ]);
    const r = await svc.emettre(DOSSIER, AGENT, {
      exerciceId: 'ex-1',
      niveauId: NIVEAU.id,
      compteIds: ['c-41100001', 'c-41100002'],
    });
    expect(r.emises).toBe(1);
    expect(r.exclues).toHaveLength(1);
    expect(relanceCreate).toHaveBeenCalledTimes(1);
    expect(r.lettres[0].tiers).toBe('SARL Bomoko');
  });

  it('refuse une exclusion sans motif · une case seule ne se relit pas', async () => {
    const { svc, tiersUpdate } = service([]);
    await expect(svc.definirHorsRelance(DOSSIER, 'ti-1', { horsRelance: true })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      svc.definirHorsRelance(DOSSIER, 'ti-1', { horsRelance: true, motif: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tiersUpdate).not.toHaveBeenCalled();
  });

  it('exclut avec son motif et sa date, et la date vient du SERVEUR', async () => {
    // Une date d'exclusion venue de l'écran pourrait être antidatée pour
    // masquer un retard de relance.
    const { svc, tiersUpdate } = service([]);
    await svc.definirHorsRelance(DOSSIER, 'ti-1', { horsRelance: true, motif: '  Tiers en liquidation  ' });
    const data = tiersUpdate.mock.calls[0][0].data as {
      horsRelance: boolean;
      motifHorsRelance: string;
      horsRelanceDepuis: Date;
    };
    expect(data.horsRelance).toBe(true);
    expect(data.motifHorsRelance).toBe('Tiers en liquidation');
    expect(data.horsRelanceDepuis).toBeInstanceOf(Date);
  });

  it('remettre dans le circuit EFFACE le motif et la date', async () => {
    // Les garder laisserait un tiers de nouveau relançable porter les traces
    // d'une exclusion levée, que le prochain lecteur prendrait pour elle.
    const { svc, tiersUpdate } = service([]);
    await svc.definirHorsRelance(DOSSIER, 'ti-1', { horsRelance: false });
    expect(tiersUpdate.mock.calls[0][0].data).toEqual({
      horsRelance: false,
      motifHorsRelance: null,
      horsRelanceDepuis: null,
    });
  });
});
