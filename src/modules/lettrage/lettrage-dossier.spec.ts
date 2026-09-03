import { LettrageService } from './lettrage.service';
import { PrismaService } from '../../common/prisma.service';
import { StatutLettrage } from '@prisma/client';

/**
 * VUE D'ENSEMBLE DU LETTRAGE · la fenêtre s'ouvrait sur un message d'attente
 * tant qu'aucun compte n'était choisi. Or la première question de celui qui
 * l'ouvre n'est pas « quel compte », c'est « où en est le lettrage ».
 *
 * Ce que ces tests figent, ce n'est pas la mise en page, c'est la RÈGLE
 * D'AFFICHAGE : un groupe partiel porte son code en minuscules et son reste
 * dû, un groupe soldé porte son code en majuscules et ne doit plus rien
 * (CPCC, ch. 6 · le lettrage identifie les opérations restées totalement ou
 * partiellement ouvertes).
 */

const groupe = (p: Partial<Record<string, unknown>> = {}) => ({
  id: 'g-1',
  compteId: 'c-401-durand',
  compte: { id: 'c-401-durand', numero: '40110000', intitule: 'Fournisseur DURAND' },
  code: 'A',
  statut: StatutLettrage.SOLDE,
  solde: 0,
  origine: 'MANUEL',
  verrouille: false,
  ecartChange: null,
  _count: { lignes: 2 },
  createdAt: new Date('2026-09-01T08:00:00.000Z'),
  createdBy: 'u-1',
  soldeAt: new Date('2026-09-01T08:00:00.000Z'),
  ...p,
});

function service(groupes: unknown[]) {
  const findMany = jest.fn().mockResolvedValue(groupes);
  const prisma = { lettrage: { findMany } } as unknown as PrismaService;
  return { svc: new LettrageService(prisma), findMany };
}

describe('lettrage · la vue d’ensemble du dossier', () => {
  it('borne la requête au dossier · un lettrage d’un autre cabinet ne se lit pas', async () => {
    const { svc, findMany } = service([]);
    await svc.listerGroupesDuDossier('t-1');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 't-1' } }));
  });

  it('un groupe SOLDÉ porte son code en majuscules', async () => {
    const { svc } = service([groupe({ code: 'B', statut: StatutLettrage.SOLDE })]);
    const [g] = await svc.listerGroupesDuDossier('t-1');
    expect(g.code).toBe('B');
    expect(g.statut).toBe(StatutLettrage.SOLDE);
  });

  it('un groupe PARTIEL porte son code en minuscules et son reste dû', async () => {
    // La minuscule n'est pas un caprice : elle distingue à l'oeil, dans une
    // colonne de codes, ce qui est éteint de ce qui reste ouvert.
    const { svc } = service([groupe({ code: 'C', statut: StatutLettrage.PARTIEL, solde: 12500.5 })]);
    const [g] = await svc.listerGroupesDuDossier('t-1');
    expect(g.code).toBe('c');
    expect(g.solde).toBe(12500.5);
  });

  it('rend le compte porteur · sans lui, une lettre ne veut rien dire', async () => {
    // Les lettres se répètent d'un compte à l'autre (chaque compte a sa
    // série A, B, C). Une vue tous comptes confondus qui n'afficherait que
    // la lettre montrerait dix « A » sans dire lesquels.
    const { svc } = service([groupe()]);
    const [g] = await svc.listerGroupesDuDossier('t-1');
    expect(g.compteNumero).toBe('40110000');
    expect(g.compteIntitule).toBe('Fournisseur DURAND');
    expect(g.compteId).toBe('c-401-durand');
  });

  it('compte les lignes du groupe', async () => {
    const { svc } = service([groupe({ _count: { lignes: 5 } })]);
    const [g] = await svc.listerGroupesDuDossier('t-1');
    expect(g.nombreLignes).toBe(5);
  });

  it('le filtre d’état se transmet à la base, il ne se fait pas en mémoire', async () => {
    const { svc, findMany } = service([]);
    await svc.listerGroupesDuDossier('t-1', StatutLettrage.PARTIEL);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't-1', statut: StatutLettrage.PARTIEL } }),
    );
  });

  it('trie par compte puis par ancienneté · l’ordre du grand livre', async () => {
    const { svc, findMany } = service([]);
    await svc.listerGroupesDuDossier('t-1');
    expect(findMany.mock.calls[0][0].orderBy).toEqual([
      { compte: { numero: 'asc' } },
      { createdAt: 'asc' },
    ]);
  });
});
