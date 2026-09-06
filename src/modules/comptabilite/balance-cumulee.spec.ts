import { EcritureService } from './ecriture.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * BALANCE CUMULÉE DEPUIS L'ORIGINE · les deux règles de lecture, et chacune
 * fabrique un chiffre plausible et faux quand on l'oublie.
 *
 * Le Tableau emplois ressources du jeu « projets de développement » porte
 * officiellement trois colonnes (SYCEBNL, Partie 4 ch. 3, Section 1) : solde
 * cumulé début exercice N, exercice N, solde cumulé fin exercice N. Les deux
 * colonnes cumulées suivent la CONVENTION DE FINANCEMENT, qui court sur
 * plusieurs exercices · c'est le seul endroit de l'état où un bailleur lit ce
 * qu'il a versé en tout.
 *
 * Ce spec ne vérifie pas des montants, il vérifie QUELLES ÉCRITURES sont lues.
 * Les deux erreurs possibles ne se voient sur aucun total :
 *
 *  · prendre les reports à-nouveau TRIPLE les fonds reçus sur trois exercices,
 *    parce que le report rejoue chaque année le solde de l'année d'avant ;
 *  · les exclure TOUS ampute le cumul du bilan d'ouverture, c'est-à-dire de
 *    tout ce que le bailleur avait versé avant l'entrée du dossier dans
 *    OmegaX. Le montant manquant est exactement celui que le cabinet cherche.
 */

type Ecriture = { exerciceId: string; estGenereeParCloture: boolean; statut?: string };

function service(
  exercices: Array<{ id: string; annee: number }>,
  ecritures: Array<Ecriture & { compteId: string; debit: number; credit: number }>,
) {
  const correspond = (e: Ecriture, where: any) => {
    const f = where.ecriture;
    if (f.estGenereeParCloture !== undefined && e.estGenereeParCloture !== f.estGenereeParCloture) return false;
    if (f.statut !== undefined && (e.statut ?? 'VALIDEE') !== f.statut) return false;
    // `exerciceId` arrive soit en `{ in: [...] }` (la fenêtre), soit en valeur
    // simple (le premier exercice). Le faux doit honorer les DEUX, sans quoi
    // il validerait un service qui n'existe pas.
    const cible = f.exerciceId;
    if (cible === undefined) return true;
    if (typeof cible === 'object' && cible.in) return cible.in.includes(e.exerciceId);
    return cible === e.exerciceId;
  };

  const prisma = {
    exercice: {
      findFirstOrThrow: jest.fn(({ where }: any) => {
        const e = exercices.find((x) => x.id === where.id)!;
        return Promise.resolve({ id: e.id, dateDebut: new Date(`${e.annee}-01-01`) });
      }),
      findMany: jest.fn(({ where }: any) => {
        const borne = new Date(where.dateDebut.lte).getUTCFullYear();
        return Promise.resolve(
          exercices.filter((e) => e.annee <= borne).sort((a, b) => a.annee - b.annee).map((e) => ({ id: e.id })),
        );
      }),
    },
    compte: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'c-462', numero: '46200000', intitule: 'Bailleur', classe: 'CLASSE_4', typeCompte: 'DETAIL' },
      ]),
    },
    ligneEcriture: {
      groupBy: jest.fn(({ where }: any) => {
        const retenues = ecritures.filter((e) => correspond(e, where));
        const parCompte = new Map<string, { debit: number; credit: number }>();
        for (const l of retenues) {
          const a = parCompte.get(l.compteId) ?? { debit: 0, credit: 0 };
          a.debit += l.debit;
          a.credit += l.credit;
          parCompte.set(l.compteId, a);
        }
        return Promise.resolve([...parCompte].map(([compteId, a]) => ({ compteId, _sum: a })));
      }),
    },
  } as unknown as PrismaService;

  return new EcritureService(prisma, {} as any, {} as any, {} as any);
}

const EXERCICES = [
  { id: 'e2024', annee: 2024 },
  { id: 'e2025', annee: 2025 },
  { id: 'e2026', annee: 2026 },
];

describe('Balance cumulée depuis l’origine', () => {
  it('N’ADDITIONNE PAS LES REPORTS À-NOUVEAU, qui rejouent le solde de l’année précédente', async () => {
    // 300 000 reçus en 2024, 500 000 en 2025, rien en 2026. Chaque clôture
    // reporte le solde à l'ouverture de l'année suivante. Compter les reports
    // rendrait 300 + 300 + 500 + 800 = 1 900 000 au lieu de 800 000, sur un
    // état qui boucle parfaitement.
    const s = service(EXERCICES, [
      { exerciceId: 'e2024', estGenereeParCloture: false, compteId: 'c-462', debit: 0, credit: 300_000 },
      { exerciceId: 'e2025', estGenereeParCloture: true, compteId: 'c-462', debit: 0, credit: 300_000 },
      { exerciceId: 'e2025', estGenereeParCloture: false, compteId: 'c-462', debit: 0, credit: 500_000 },
      { exerciceId: 'e2026', estGenereeParCloture: true, compteId: 'c-462', debit: 0, credit: 800_000 },
    ]);
    const { lignes } = await s.balanceCumulee('t1', 'e2026');
    expect(lignes[0].totalCredit).toBe(800_000);
    expect(lignes[0].solde).toBe(-800_000);
  });

  it('GARDE le report du PREMIER exercice · c’est le bilan d’ouverture du dossier', async () => {
    // Un projet repris en cours de route : 1 000 000 déjà versé avant
    // l'entrée dans OmegaX, saisi par l'à-nouveau du premier exercice, puis
    // 200 000 reçus en 2025. Exclure tous les reports rendrait 200 000 et le
    // bailleur passerait pour n'avoir presque rien versé.
    const s = service(EXERCICES, [
      { exerciceId: 'e2024', estGenereeParCloture: true, compteId: 'c-462', debit: 0, credit: 1_000_000 },
      { exerciceId: 'e2025', estGenereeParCloture: false, compteId: 'c-462', debit: 0, credit: 200_000 },
    ]);
    const { lignes } = await s.balanceCumulee('t1', 'e2026');
    expect(lignes[0].totalCredit).toBe(1_200_000);
    // Le bilan d'ouverture reste exposé à part · c'est lui que le tableau
    // emplois-ressources lit comme « fonds disponible en début » sur la
    // colonne cumulée, et c'est ce qui fait tenir le contrôle VII.
    expect(lignes[0].reportCredit).toBe(1_000_000);
  });

  it('S’ARRÊTE À L’EXERCICE DEMANDÉ · la colonne « cumul début » ne voit pas l’exercice en cours', async () => {
    const s = service(EXERCICES, [
      { exerciceId: 'e2024', estGenereeParCloture: false, compteId: 'c-462', debit: 0, credit: 300_000 },
      { exerciceId: 'e2026', estGenereeParCloture: false, compteId: 'c-462', debit: 0, credit: 500_000 },
    ]);
    const { lignes } = await s.balanceCumulee('t1', 'e2025');
    expect(lignes[0].totalCredit).toBe(300_000);
  });

  it('NE LIT PAS LE BROUILLARD · un état financier n’engage personne sur des écritures non validées', async () => {
    const s = service(EXERCICES, [
      { exerciceId: 'e2025', estGenereeParCloture: false, compteId: 'c-462', debit: 0, credit: 300_000 },
      { exerciceId: 'e2025', estGenereeParCloture: false, statut: 'BROUILLARD', compteId: 'c-462', debit: 0, credit: 900_000 },
    ]);
    const { lignes } = await s.balanceCumulee('t1', 'e2026');
    expect(lignes[0].totalCredit).toBe(300_000);
  });
});
