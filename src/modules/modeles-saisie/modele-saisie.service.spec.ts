import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SensModeleSaisie } from '@prisma/client';
import { ModeleSaisieService } from './modele-saisie.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * MODÈLES DE SAISIE · ce qui doit être refusé, et pourquoi.
 *
 * Un modèle n'est pas une écriture : il ne mouvemente rien, il pré-remplit
 * une grille. Ses gardes ne sont donc pas comptables mais ERGONOMIQUES, et
 * elles ont toutes la même raison d'être · un modèle mal formé ne se voit
 * qu'au moment d'enregistrer la pièce, c'est-à-dire APRÈS que le comptable a
 * saisi ses montants. Le refus doit tomber à la création du modèle.
 */

function service(options: {
  comptes?: Array<{ id: string; numero: string; typeCompte: string }>;
  journal?: unknown;
  modele?: unknown;
} = {}) {
  const cree = jest.fn().mockResolvedValue({ id: 'm-1' });
  const supprime = jest.fn().mockResolvedValue({ id: 'm-1' });
  const prisma = {
    compte: { findMany: jest.fn().mockResolvedValue(options.comptes ?? []) },
    // `?? { id }` aurait été un PIÈGE : `null ?? défaut` rend le défaut, donc
    // le cas « journal absent » n'aurait jamais été joué et le test serait
    // passé au vert sans rien éprouver.
    journal: { findFirst: jest.fn().mockResolvedValue('journal' in options ? options.journal : { id: 'j-1' }) },
    modeleSaisie: {
      findFirst: jest.fn().mockResolvedValue('modele' in options ? options.modele : null),
      findMany: jest.fn().mockResolvedValue([]),
      create: cree,
      delete: supprime,
    },
  } as unknown as PrismaService;
  return { svc: new ModeleSaisieService(prisma), prisma: prisma as never, cree, supprime };
}

const DETAIL = (id: string, numero: string) => ({ id, numero, typeCompte: 'DETAIL' });

const deuxLignes = [
  { compteId: 'c-1', sens: SensModeleSaisie.DEBIT },
  { compteId: 'c-2', sens: SensModeleSaisie.CREDIT },
];

describe('création d’un modèle de saisie', () => {
  it('accepte un squelette à un débit et un crédit', async () => {
    const { svc, cree } = service({ comptes: [DETAIL('c-1', '60110000'), DETAIL('c-2', '40110000')] });
    await svc.creer('t-1', 'u-1', { intitule: 'Achat de marchandises', lignes: deuxLignes });
    expect(cree).toHaveBeenCalledTimes(1);
  });

  it('REFUSE un compte de totalisation', async () => {
    // Un compte TOTAL est un en-tête de division du plan (CLAUDE.md §7) : il
    // ne reçoit jamais d'écriture. Un modèle qui en poserait un ferait
    // échouer l'enregistrement APRÈS la saisie des montants.
    const { svc } = service({ comptes: [DETAIL('c-1', '60110000'), { id: 'c-2', numero: '40', typeCompte: 'TOTAL' }] });
    await expect(svc.creer('t-1', 'u-1', { intitule: 'Achat', lignes: deuxLignes })).rejects.toThrow(/totalisation/);
  });

  it('REFUSE un modèle qui n’a que des débits', async () => {
    // Un squelette d'un seul sens laisse la grille déséquilibrée à coup sûr ·
    // il ne fait gagner que la moitié du travail et coûte une correction.
    const { svc } = service({ comptes: [DETAIL('c-1', '60110000'), DETAIL('c-2', '60210000')] });
    await expect(
      svc.creer('t-1', 'u-1', {
        intitule: 'Deux achats',
        lignes: [
          { compteId: 'c-1', sens: SensModeleSaisie.DEBIT },
          { compteId: 'c-2', sens: SensModeleSaisie.DEBIT },
        ],
      }),
    ).rejects.toThrow(/débit et un crédit/);
  });

  it('REFUSE un compte qui n’est pas du dossier', async () => {
    // La requête est bornée par tenantId · un compte d'un autre cabinet ne
    // remonte pas, et son absence doit être un refus, pas une ligne muette.
    const { svc } = service({ comptes: [DETAIL('c-1', '60110000')] });
    await expect(svc.creer('t-1', 'u-1', { intitule: 'Achat', lignes: deuxLignes })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('REFUSE un journal étranger au dossier', async () => {
    const { svc } = service({ comptes: [DETAIL('c-1', '6'), DETAIL('c-2', '4')], journal: null });
    await expect(
      svc.creer('t-1', 'u-1', { intitule: 'Achat', journalId: 'j-autre', lignes: deuxLignes }),
    ).rejects.toThrow(/Journal introuvable/);
  });

  it('numérote les lignes dans l’ordre reçu', async () => {
    // L'ordre est celui dans lequel les lignes arrivent dans la grille · le
    // laisser au plan d'exécution le ferait changer d'un appel à l'autre.
    const { svc, cree } = service({ comptes: [DETAIL('c-1', '6'), DETAIL('c-2', '4')] });
    await svc.creer('t-1', 'u-1', { intitule: 'Achat', lignes: deuxLignes });
    const lignes = cree.mock.calls[0][0].data.lignes.create;
    expect(lignes.map((l: { ordre: number }) => l.ordre)).toEqual([0, 1]);
  });

  it('un montant absent reste ABSENT · ce n’est pas zéro', async () => {
    // Zéro serait un montant figé, donc une correction à faire à chaque
    // usage. L'absence est le cas normal d'un modèle.
    const { svc, cree } = service({ comptes: [DETAIL('c-1', '6'), DETAIL('c-2', '4')] });
    await svc.creer('t-1', 'u-1', { intitule: 'Achat', lignes: deuxLignes });
    const lignes = cree.mock.calls[0][0].data.lignes.create;
    expect(lignes.every((l: { montant: unknown }) => l.montant === null)).toBe(true);
  });
});

describe('modification et suppression', () => {
  it('un modèle d’un autre dossier est INTROUVABLE, pas refusé', async () => {
    // Distinguer « pas à vous » de « n'existe pas » apprendrait à un
    // attaquant que l'identifiant est réel ailleurs (même règle que la garde
    // de cloisonnement en lecture).
    const { svc } = service({ modele: null });
    await expect(svc.modifier('t-1', 'm-autre', { estActif: false })).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.supprimer('t-1', 'm-autre')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('supprime franchement · un modèle n’est rattaché à aucune écriture', async () => {
    const { svc, supprime } = service({ modele: { id: 'm-1' } });
    await expect(svc.supprimer('t-1', 'm-1')).resolves.toEqual({ supprime: true });
    expect(supprime).toHaveBeenCalledWith({ where: { id: 'm-1' } });
  });
});
