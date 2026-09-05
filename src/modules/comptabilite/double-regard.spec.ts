import { BadRequestException } from '@nestjs/common';
import { EcritureService } from './ecriture.service';
import { PrismaService } from '../../common/prisma.service';
import { JournalService } from '../journaux/journal.service';
import { ExerciceService } from '../exercice/exercice.service';
import { AnalytiqueService } from '../analytique/analytique.service';

/**
 * DOUBLE REGARD À LA VALIDATION · le validateur comparé à l'auteur.
 *
 * `valider` recevait `valideeBy` et ne le comparait JAMAIS à `createdBy`. Un
 * comptable saisissait et validait sa propre écriture, et c'est la validation
 * qui la fait entrer au livre-journal · franchissement que l'AUDCIF art. 22, 2°
 * rend irréversible.
 *
 * CE QUE CES TESTS PROTÈGENT, dans l'ordre de ce qui casserait le plus
 * silencieusement :
 *
 *  1. le refus ÉCARTE au lieu de JETER · un jet sur le lot entier ferait
 *     qu'une seule écriture bloquerait toute la période ;
 *  2. le compteur des écartées EXISTE dans les deux retours, y compris le
 *     retour anticipé · sans lui l'écran annonce « rien à valider » sur un
 *     brouillard plein, et la période passe pour centralisée ;
 *  3. le message est AIGUILLÉ sur le référentiel, et ne sert JAMAIS l'art. 19
 *     de l'AUDCIF ni le mot « mensuelle » à un dossier SYCEBNL · c'est la
 *     transposition que ce dépôt a déjà payée une fois.
 */

type Faux = Record<string, unknown>;

function service(prisma: Faux) {
  return new EcritureService(
    prisma as unknown as PrismaService,
    {} as JournalService,
    {} as unknown as ExerciceService,
    {} as AnalytiqueService,
  );
}

function ecriture(id: string, createdBy: string, options: { cloture?: boolean } = {}) {
  return {
    id,
    createdBy,
    statut: 'BROUILLARD',
    numeroPiece: 1,
    estGenereeParCloture: options.cloture ?? false,
    exercice: { statut: 'OUVERT' },
    journal: { code: 'ACH' },
    lignes: [
      { debit: 100, credit: 0 },
      { debit: 0, credit: 100 },
    ],
  };
}

function prismaAvec(ecritures: unknown[], doubleRegard: boolean, referentiel = 'SYCEBNL') {
  const updateMany = jest.fn().mockResolvedValue({ count: 0 });
  return {
    prisma: {
      ecriture: { findMany: jest.fn().mockResolvedValue(ecritures), updateMany },
      tenant: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ doubleRegardValidation: doubleRegard, referentiel }),
      },
    } as Faux,
    updateMany,
  };
}

describe('le double regard écarte, il ne jette pas', () => {
  it('écarte celles que leur auteur valide, et laisse passer les autres', async () => {
    const { prisma, updateMany } = prismaAvec(
      [ecriture('sienne', 'moi'), ecriture('autre', 'toi')],
      true,
    );
    const r = await service(prisma).valider('t1', 'moi', ['sienne', 'autre']);
    expect(r.validees).toBe(1);
    expect(r.refuseesSecondRegard).toBe(1);
    // L'ÉCARTÉE N'ENTRE PAS AU LIVRE-JOURNAL · c'est ce qui fait le refus.
    // Un compteur juste sur un `updateMany` qui les prendrait toutes serait
    // le pire des deux mondes : l'écran dirait « écartée », la base dirait
    // « validée », et personne ne comparerait.
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['autre'] }, tenantId: 't1' } }),
    );
  });

  it('ne jette aucune exception quand tout le lot est écarté', async () => {
    // L'art. 22, 2° veut la validation faite « au terme de chaque période qui
    // ne peut excéder un mois ». Jeter bloquerait la période entière pour une
    // seule pièce.
    const { prisma, updateMany } = prismaAvec([ecriture('a', 'moi'), ecriture('b', 'moi')], true);
    const r = await service(prisma).valider('t1', 'moi', ['a', 'b']);
    expect(r.validees).toBe(0);
    expect(r.refuseesSecondRegard).toBe(2);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('ne fait rien du tout quand le dossier n’a pas activé l’option', async () => {
    const { prisma } = prismaAvec([ecriture('sienne', 'moi')], false);
    const r = await service(prisma).valider('t1', 'moi', ['sienne']);
    expect(r.validees).toBe(1);
    expect(r.refuseesSecondRegard).toBe(0);
    expect(r.motifRefus).toBeNull();
  });

  it('épargne les écritures engendrées par la clôture', async () => {
    // Personne ne « saisit » un report à nouveau calculé à partir de soldes
    // déjà validés. L'inverse serait muet : le report resterait au brouillard,
    // les états financiers ne prennent que le validé, et le bilan d'ouverture
    // cesserait de correspondre au bilan de clôture sans qu'aucun total ne
    // bouge.
    const { prisma } = prismaAvec([ecriture('report', 'moi', { cloture: true })], true);
    const r = await service(prisma).valider('t1', 'moi', ['report']);
    expect(r.validees).toBe(1);
    expect(r.refuseesSecondRegard).toBe(0);
  });
});

describe('la dérogation nominative', () => {
  it('laisse passer et pose le visa, nom et motif', async () => {
    const { prisma, updateMany } = prismaAvec([ecriture('sienne', 'moi')], true);
    const r = await service(prisma).valider('t1', 'moi', ['sienne'], {
      secondRegardNom: 'Me KABILA, expert-comptable',
      secondRegardMotif: 'Relecture des pièces d’achat du mois',
    });
    expect(r.validees).toBe(1);
    expect(r.sousDerogation).toBe(1);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          secondRegardNom: 'Me KABILA, expert-comptable',
          secondRegardMotif: 'Relecture des pièces d’achat du mois',
        }),
      }),
    );
  });

  it('refuse un nom sans motif, et un motif sans nom', async () => {
    // Un nom seul n'atteste de rien : il ne dit pas ce qui a été relu, et le
    // visa imprimé au journal ne serait opposable à personne.
    const { prisma } = prismaAvec([ecriture('sienne', 'moi')], true);
    await expect(
      service(prisma).valider('t1', 'moi', ['sienne'], { secondRegardNom: 'Un nom' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service(prisma).valider('t1', 'moi', ['sienne'], { secondRegardMotif: 'Un motif' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ne tamponne PAS le visa sur un lot ordinaire', async () => {
    // Tamponner tout le lot apposerait un second regard nominatif sur des
    // pièces qui n'en avaient pas besoin, et le document remis à un auditeur
    // affirmerait une relecture qui n'a pas eu lieu.
    const { prisma, updateMany } = prismaAvec([ecriture('autre', 'toi')], true);
    await service(prisma).valider('t1', 'moi', ['autre']);
    const data = updateMany.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).not.toHaveProperty('secondRegardNom');
  });
});

describe('le message est aiguillé, et ne transpose pas', () => {
  it('un dossier SYCEBNL est renvoyé à SON article, pas à celui de l’AUDCIF', async () => {
    const { prisma } = prismaAvec([ecriture('sienne', 'moi')], true, 'SYCEBNL');
    const r = await service(prisma).valider('t1', 'moi', ['sienne']);
    expect(r.motifRefus).toContain('art. 16, 2)');
    // L'art. 69 de l'AUDCIF lui est EXCLU par son art. 3 · le nommer comme
    // fondement serait faux, le nommer comme exclusion est exact.
    expect(r.motifRefus).toContain('exclu par l’art. 3');
    // ET SURTOUT · jamais l'art. 19 ni « mensuelle ». La centralisation d'un
    // dossier SYCEBNL est HEBDOMADAIRE (Partie 2, ch. 2), et ce dépôt a déjà
    // corrigé une fois le fait de servir le délai de l'un à l'autre.
    expect(r.motifRefus).not.toContain('art. 19');
    expect(r.motifRefus).not.toContain('mensuel');
  });

  it('un dossier SYSCOHADA est renvoyé à l’art. 69', async () => {
    const { prisma } = prismaAvec([ecriture('sienne', 'moi')], true, 'SYSCOHADA');
    const r = await service(prisma).valider('t1', 'moi', ['sienne']);
    expect(r.motifRefus).toContain('art. 69');
    expect(r.motifRefus).toContain('sous sa responsabilité');
    expect(r.motifRefus).not.toContain('art. 16, 2)');
  });

  it('les deux messages disent qu’AUCUN texte n’impose la séparation', async () => {
    // Sans cette phrase, un refus servi par un logiciel de comptabilité se lit
    // comme une règle légale, et le cabinet croit contrevenir à quelque chose.
    for (const ref of ['SYCEBNL', 'SYSCOHADA']) {
      const { prisma } = prismaAvec([ecriture('sienne', 'moi')], true, ref);
      const r = await service(prisma).valider('t1', 'moi', ['sienne']);
      expect(r.motifRefus).toContain('Aucun texte n’impose');
    }
  });
});

describe('validerJusqua rend la forme COMPLÈTE, même à vide', () => {
  it('le retour anticipé porte les cinq champs', async () => {
    // C'EST LE CAS QUI CASSE EN SILENCE. À quatre champs, l'écran lit
    // `undefined` sur le compteur des écartées, n'affiche rien, et annonce
    // « Rien à valider » sur un brouillard qui vient d'être refusé en entier.
    const prisma = {
      ecriture: { findMany: jest.fn().mockResolvedValue([]) },
    } as Faux;
    const r = await service(prisma).validerJusqua('t1', 'moi', {
      exerciceId: 'ex',
      dateLimite: '2026-06-30',
    });
    expect(r).toEqual({
      validees: 0,
      dejaValidees: 0,
      refuseesSecondRegard: 0,
      sousDerogation: 0,
      motifRefus: null,
    });
  });
});
