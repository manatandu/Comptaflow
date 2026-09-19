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
  lignesEnregistrees?: Array<{ sens: string; compte: { numero: string } }>;
} = {}) {
  const cree = jest.fn().mockResolvedValue({ id: 'm-1' });
  const supprime = jest.fn().mockResolvedValue({ id: 'm-1' });
  const prisma = {
    // COMPLÉTÉE, JAMAIS CONTOURNÉE (CLAUDE.md § 8) · le service relit le
    // référentiel du dossier et les lignes ENREGISTRÉES pour diagnostiquer le
    // modèle. Une doublure muette sur ces deux lectures validerait un service
    // qui n'existe pas.
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: 'SYSCOHADA' }) },
    ligneModeleSaisie: {
      findMany: jest.fn().mockResolvedValue(options.lignesEnregistrees ?? []),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    compte: { findMany: jest.fn().mockResolvedValue(options.comptes ?? []) },
    // `?? { id }` aurait été un PIÈGE : `null ?? défaut` rend le défaut, donc
    // le cas « journal absent » n'aurait jamais été joué et le test serait
    // passé au vert sans rien éprouver.
    journal: { findFirst: jest.fn().mockResolvedValue('journal' in options ? options.journal : { id: 'j-1' }) },
    modeleSaisie: {
      findFirst: jest.fn().mockResolvedValue('modele' in options ? options.modele : null),
      findMany: jest.fn().mockResolvedValue([]),
      create: cree,
      update: jest.fn().mockResolvedValue({ id: 'm-1' }),
      delete: supprime,
    },
  } as Record<string, unknown>;
  // La transaction rend le MÊME client · `modifier` y remplace les lignes en
  // bloc, et une doublure qui rendrait un autre objet ferait passer un
  // service qui écrit à côté.
  prisma.$transaction = (fn: (tx: unknown) => unknown) => fn(prisma);
  const client = prisma as unknown as PrismaService;
  return { svc: new ModeleSaisieService(client), prisma: prisma as never, cree, supprime };
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

/**
 * LE CÂBLAGE, ET PAS SEULEMENT LA RÈGLE.
 *
 * Trois passes de confrontation sur quatre ont vu la première réinjection
 * porter sur un POINT D'APPEL et non sur la règle : la fonction pure était
 * juste et le service ne l'appelait pas. `diagnostic-tiers.spec.ts` éprouve
 * la règle ; ces trois tests éprouvent que les trois portes la servent.
 */
describe('diagnostic du tiers · les trois portes le servent', () => {
  const achatSurBanque = [
    { sens: 'DEBIT', compte: { numero: '60110000' } },
    { sens: 'CREDIT', compte: { numero: '52100000' } },
  ];

  it('`lister` rend l’avertissement sur un modèle déjà enregistré', async () => {
    const { svc, prisma } = service();
    (prisma as never as { modeleSaisie: { findMany: jest.Mock } }).modeleSaisie.findMany.mockResolvedValue([
      {
        id: 'm-1',
        intitule: 'Achat',
        journalId: null,
        journal: null,
        estActif: true,
        lignes: achatSurBanque.map((l, ordre) => ({
          ordre,
          compteId: `c-${ordre}`,
          compte: { id: `c-${ordre}`, numero: l.compte.numero, intitule: '' },
          sens: l.sens,
          libelle: null,
          montant: null,
        })),
      },
    ]);
    const liste = await svc.lister('t-1');
    expect(liste[0].avertissements).toHaveLength(1);
    expect(liste[0].avertissements[0]).toContain('DIRECTEMENT');
  });

  it('`creer` rend l’avertissement avec l’identifiant', async () => {
    const { svc } = service({
      comptes: [DETAIL('c-1', '60110000'), DETAIL('c-2', '52100000')],
      lignesEnregistrees: achatSurBanque,
    });
    const cree = await svc.creer('t-1', 'u-1', {
      intitule: 'Achat',
      lignes: [
        { compteId: 'c-1', sens: SensModeleSaisie.DEBIT },
        { compteId: 'c-2', sens: SensModeleSaisie.CREDIT },
      ],
    });
    expect(cree.avertissements).toHaveLength(1);
  });

  it('`modifier` relit les lignes ENREGISTRÉES, même quand le DTO n’en porte aucune', async () => {
    // Une modification d'intitulé seul ne doit pas rendre un modèle « sans
    // avertissement » au motif que le DTO ne portait pas de ligne.
    const { svc } = service({ modele: { id: 'm-1' }, lignesEnregistrees: achatSurBanque });
    const modifie = await svc.modifier('t-1', 'm-1', { intitule: 'Achat comptant' });
    expect(modifie.avertissements).toHaveLength(1);
  });
});
