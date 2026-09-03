import { BadRequestException } from '@nestjs/common';
import {
  EcritureService,
  PLAFOND_ECRITURES_PAR_FENETRE,
  PLAFOND_LIGNES_GRAND_LIVRE,
} from './ecriture.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * BANC D'ESSAI DU 2026-09-03 · un dossier d'un million de lignes, un tas de
 * 460 Mio (la taille par défaut d'un conteneur Cloud Run).
 *
 *  · les états financiers tiennent en une demi-seconde · ils sont agrégés par
 *    la base, le volume ne les atteint pas ;
 *  · la fenêtre Journal sur l'exercice entier TUAIT le serveur
 *    (`JavaScript heap out of memory`, processus mort, et avec lui tous les
 *    autres dossiers servis par la même instance) ;
 *  · le grand livre complet et la liasse Excel complète, de même.
 *
 * Aucun test ne pouvait le voir : les doublures rendent dix lignes. Ce qui se
 * fige ici, ce n'est donc pas une performance, c'est la RÈGLE qui en découle ·
 * aucune collection sans borne, et une borne qui se DIT.
 */

function serviceListe(nombreEcritures: number, rendues: number) {
  const ecritures = Array.from({ length: rendues }, (_, i) => ({
    id: `e-${i}`,
    lignes: [{ debit: 1, credit: 0 }],
  }));
  const prisma = {
    ecriture: {
      findMany: jest.fn().mockResolvedValue(ecritures),
      count: jest.fn().mockResolvedValue(nombreEcritures),
    },
    ligneEcriture: {
      // Les totaux du JOURNAL, pas ceux de l'écran · sans rapport avec la
      // tranche rendue, c'est tout l'intérêt du test.
      aggregate: jest.fn().mockResolvedValue({ _sum: { debit: 987654, credit: 987654 } }),
    },
  } as unknown as PrismaService;
  return { svc: new EcritureService(prisma, {} as never, {} as never, {} as never), prisma: prisma as never };
}

describe('plafond de la fenêtre Journal', () => {
  it('borne la requête même quand personne n’a demandé de limite', async () => {
    const { svc, prisma } = serviceListe(500000, PLAFOND_ECRITURES_PAR_FENETRE);
    await svc.lister('t-1', {});
    expect((prisma as any).ecriture.findMany.mock.calls[0][0].take).toBe(PLAFOND_ECRITURES_PAR_FENETRE);
  });

  it('DIT qu’il ne montre pas tout', async () => {
    // Le taire ferait lire un journal de 2 000 écritures là où il y en a
    // 500 000, sans que rien à l'écran ne l'indique.
    const { svc } = serviceListe(500000, PLAFOND_ECRITURES_PAR_FENETRE);
    const r = await svc.lister('t-1', {});
    expect(r.tronque).toBe(true);
    expect(r.total).toBe(500000);
    expect(r.plafond).toBe(PLAFOND_ECRITURES_PAR_FENETRE);
  });

  it('ne crie pas à la troncature quand tout tient', async () => {
    const { svc } = serviceListe(12, 12);
    const r = await svc.lister('t-1', {});
    expect(r.tronque).toBe(false);
  });

  it('les totaux sont ceux du JOURNAL, jamais ceux de la tranche', async () => {
    // Additionner les seules écritures rendues donnerait un total juste pour
    // l'écran et faux pour le journal · la faute la plus difficile à voir,
    // puisque le chiffre paraît cohérent avec ce qui est affiché.
    const { svc } = serviceListe(500000, PLAFOND_ECRITURES_PAR_FENETRE);
    const r = await svc.lister('t-1', {});
    expect(r.totaux).toEqual({ debit: 987654, credit: 987654 });
  });

  it('une limite explicite garde la sienne · le tableau de bord ne veut que huit lignes', async () => {
    const { svc, prisma } = serviceListe(500000, 8);
    await svc.lister('t-1', { limite: 8 });
    expect((prisma as any).ecriture.findMany.mock.calls[0][0].take).toBe(8);
  });
});

describe('le grand livre ne se tronque pas, il se refuse', () => {
  function serviceGrandLivre(nombreLignes: number) {
    const prisma = {
      ligneEcriture: { count: jest.fn().mockResolvedValue(nombreLignes), findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    return new EcritureService(prisma, {} as never, {} as never, {} as never);
  }

  it('refuse au-delà du plafond, plutôt que d’amputer un livre obligatoire', async () => {
    // AUDCIF art. 22, 6° · l'organisation doit permettre « la reconstitution
    // du chemin de révision ». Un grand livre amputé en silence est un
    // document faux : la troncature acceptable pour un écran de travail ne
    // l'est pas pour un livre.
    const svc = serviceGrandLivre(PLAFOND_LIGNES_GRAND_LIVRE + 1);
    await expect(svc.grandLivreComplet('t-1', 'ex-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('le refus dit le volume et par où passer', async () => {
    const svc = serviceGrandLivre(1000000);
    await expect(svc.grandLivreComplet('t-1', 'ex-1')).rejects.toThrow(/compte par compte/);
  });

  it('laisse passer ce qui tient', async () => {
    const svc = serviceGrandLivre(10);
    await expect(svc.grandLivreComplet('t-1', 'ex-1')).resolves.toBeDefined();
  });
});
