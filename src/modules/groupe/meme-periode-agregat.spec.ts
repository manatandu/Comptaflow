import { BadRequestException } from '@nestjs/common';
import { GroupeService } from './groupe.service';

/**
 * UNE SEULE PÉRIODE DANS UN AGRÉGAT · ce que ce fichier gèle.
 *
 * Le service choisissait l'exercice de chaque cellule par « recouvrement
 * maximal » avec celui du siège : un seul jour de chevauchement suffisait.
 * Une cellule clôturant au 30 juin était donc additionnée à un siège
 * clôturant au 31 décembre, SANS UN MOT, et le total obtenu ne correspondait
 * à aucune période réelle. Rien ne pouvait le rattraper en aval : l'agrégat
 * s'équilibre quand même, puisque chaque livre est équilibré de son côté ; la
 * liasse sort sans réserve ; et son en-tête imprime la période du siège sur
 * des chiffres qui ne sont pas les siens. C'est exactement la catégorie de
 * défaut qui ne lève aucune erreur et ne se découvre qu'au dépôt.
 *
 * Ce qui fonde l'exigence (lu avant d'être écrit) :
 *  · les états financiers « décrivent les événements, opérations et
 *    situations DE L'EXERCICE » · SYCEBNL, art. 4 ;
 *  · postulat de la spécialisation des exercices : rattacher à chaque
 *    exercice « tous les produits et les charges qui le concernent, et
 *    ceux-là seulement » · SYCEBNL, cadre conceptuel § 3.3.1.1.4 ;
 *  · « L'exercice coïncide avec l'année civile », la durée n'échappant aux
 *    douze mois que pour le PREMIER exercice, et à l'année civile que pour la
 *    LIQUIDATION · AUDCIF art. 7, non exclu par l'art. 3 du SYCEBNL et repris
 *    mot pour mot à l'entrée EXERCICE de son glossaire.
 *
 * La tolérance de trois mois de l'AUDCIF art. 97 n'est PAS invoquée : elle
 * vise la consolidation d'entités juridiquement distinctes, alors qu'un
 * groupe d'établissements est une entité unique tenue en plusieurs dossiers.
 */

const EX_MERE = { id: 'ex-m', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };

// Mère : 1000 de cotisations, 300 envoyés à une cellule par le 58.
const BALANCE_MERE = {
  lignes: [
    { numero: '521000', intitule: 'Banque', typeCompte: 'DETAIL', totalDebit: 1000, totalCredit: 300, solde: 700 },
    { numero: '581000', intitule: 'Virements internes', typeCompte: 'DETAIL', totalDebit: 300, totalCredit: 0, solde: 300 },
    { numero: '701000', intitule: 'Cotisations', typeCompte: 'DETAIL', totalDebit: 0, totalCredit: 1000, solde: -1000 },
  ],
  totaux: { debit: 1300, credit: 1300 },
};

// Cellule : les 300 reçus, 100 dépensés.
const BALANCE_CELLULE = {
  lignes: [
    { numero: '571000', intitule: 'Caisse', typeCompte: 'DETAIL', totalDebit: 300, totalCredit: 100, solde: 200 },
    { numero: '581000', intitule: 'Virements internes', typeCompte: 'DETAIL', totalDebit: 0, totalCredit: 300, solde: -300 },
    { numero: '601000', intitule: 'Achats', typeCompte: 'DETAIL', totalDebit: 100, totalCredit: 0, solde: 100 },
  ],
  totaux: { debit: 400, credit: 400 },
};

/** Un groupe d'une seule cellule, dont on choisit les exercices. */
const service = (exercicesCellule: Array<{ id: string; dateDebut: Date; dateFin: Date }>) =>
  new GroupeService(
    {
      exercice: {
        findFirst: async ({ where }: { where: { id?: string; tenantId: string } }) =>
          where.id === 'ex-m' && where.tenantId === 'mere' ? EX_MERE : null,
      },
      tenant: {
        findUnique: async () => ({ id: 'mere', nom: 'Église centrale', dossierCombinaisonId: 't-comb' }),
        findMany: async ({ where }: { where: { dossierMereId: string } }) =>
          where.dossierMereId === 'mere' ? [{ id: 'c1', nom: 'Cellule Matete', exercices: exercicesCellule }] : [],
      },
    } as never,
    { balance: async (tenantId: string) => (tenantId === 'mere' ? BALANCE_MERE : BALANCE_CELLULE) } as never,
    undefined as never,
    {
      liasseCompleteExcel: async () => {
        throw new Error('la liasse ne doit jamais être produite sur un agrégat de périodes différentes');
      },
    } as never,
  );

// Exercice décalé de six mois · il recouvre la moitié de celui du siège, ce
// qui suffisait à le faire agréger avant la correction.
const DECALE = [{ id: 'ex-c1', dateDebut: new Date('2026-07-01'), dateFin: new Date('2027-06-30') }];
// Même période que le siège, en objets Date distincts (l'égalité se juge sur
// les valeurs, jamais sur l'identité des objets).
const CONCORDANT = [{ id: 'ex-c1', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') }];

describe('agrégat du groupe · une seule période, ou rien', () => {
  it('n’additionne pas une cellule décalée, et la nomme avec ses dates', async () => {
    const a = await service(DECALE).balanceAgregee('mere', 'ex-m');

    // AVANT : les 400 de la cellule entraient dans le total, sans un mot.
    expect(a.totaux.debit).toBe(1300);
    expect(a.totaux.credit).toBe(1300);
    expect(a.lignes.find((l) => l.numero === '601000')).toBeUndefined();
    expect(a.detailParDossier.some((d) => d.dossier === 'Cellule Matete')).toBe(false);

    // Et l'écart est dit, avec les dates qui permettent de le corriger.
    expect(a.controles.periodesConcordantes).toBe(false);
    expect(a.cellulesPeriodeDiscordante).toEqual([
      {
        id: 'c1',
        nom: 'Cellule Matete',
        dateDebut: new Date('2026-07-01'),
        dateFin: new Date('2027-06-30'),
      },
    ]);
  });

  it('une cellule décalée n’est pas une cellule « sans exercice » · les deux manques appellent deux gestes', async () => {
    const decalee = await service(DECALE).balanceAgregee('mere', 'ex-m');
    expect(decalee.cellulesSansExercice).toEqual([]);

    // Aucun recouvrement du tout · là, il faut OUVRIR l'exercice, pas l'aligner.
    const absente = await service([
      { id: 'ex-c1', dateDebut: new Date('2024-01-01'), dateFin: new Date('2024-12-31') },
    ]).balanceAgregee('mere', 'ex-m');
    expect(absente.cellulesSansExercice).toEqual([{ id: 'c1', nom: 'Cellule Matete' }]);
    expect(absente.cellulesPeriodeDiscordante).toEqual([]);
    expect(absente.controles.periodesConcordantes).toBe(true);
  });

  it('la même période, elle, s’agrège toujours · l’égalité se juge sur les valeurs des dates', async () => {
    const a = await service(CONCORDANT).balanceAgregee('mere', 'ex-m');
    expect(a.controles.periodesConcordantes).toBe(true);
    expect(a.cellulesPeriodeDiscordante).toEqual([]);
    expect(a.totaux.debit).toBe(1700);
    expect(a.totaux.credit).toBe(1700);
    // Les 58 se font face, la liaison est neutralisée.
    expect(a.controles.liaisonNeutralisee).toBe(true);
  });

  it('la liasse du groupe refuse, nomme la cellule et dit d’où l’écart peut venir', async () => {
    const promesse = service(DECALE).liasseGroupe('mere', 'ex-m', 'user-siege');
    await expect(promesse).rejects.toThrow(BadRequestException);
    const message = await promesse.catch((e: Error) => e.message);

    // La cellule est nommée, avec les deux périodes en présence.
    expect(message).toContain('Cellule Matete');
    expect(message).toContain('2026-07-01');
    expect(message).toContain('2027-06-30');
    expect(message).toContain('2026-01-01');
    // Et le refus dit POURQUOI un décalage est anormal, et d'où il peut venir.
    expect(message).toContain('art. 7');
    expect(message).toMatch(/PREMIER exercice/);
    expect(message).toMatch(/LIQUIDATION/);
  });

  it('la feuille « Contrôles » du classeur ne tait pas la cellule écartée', async () => {
    const classeur = await service(DECALE).balanceAgregeeExcel('mere', 'ex-m');
    const { Workbook } = await import('exceljs');
    const wb = new Workbook();
    await wb.xlsx.load(classeur.buffer as never);
    const controles = wb.getWorksheet('Contrôles')!;

    let trouvee = '';
    controles.eachRow((row) => {
      if (String(row.getCell(1).value ?? '').includes('Cellule Matete')) {
        trouvee = String(row.getCell(5).value ?? '');
      }
    });
    expect(trouvee).toContain('PÉRIODE DISCORDANTE');
    expect(trouvee).toContain('2026-07-01');

    // La feuille de données reste réimportable telle quelle · elle ne porte
    // que les comptes du siège, aucun chiffre de la cellule écartée.
    const feuille = wb.getWorksheet('Balance agrégée')!;
    expect(feuille.rowCount).toBe(1 + 3);
  });
});

describe('supervision · une cellule décalée n’est jamais annoncée « prête »', () => {
  const superviseur = (exercicesCellule: Array<{ id: string; dateDebut: Date; dateFin: Date }>) =>
    new GroupeService(
      {
        exercice: { findFirst: async () => EX_MERE },
        tenant: {
          findMany: async () => [
            {
              id: 'c1',
              nom: 'Cellule Matete',
              jeuEtatsFinanciersSycebnl: 'ASSOCIATIONS_ORDRES_PROFESSIONNELS',
              exercices: exercicesCellule,
            },
          ],
        },
        ecriture: {
          findFirst: async () => ({ date: new Date('2026-11-30') }),
          // Douze écritures, aucune en brouillard · la cellule est
          // irréprochable, seule sa période peut la disqualifier.
          count: async ({ where }: { where: { statut?: string } }) => (where.statut ? 0 : 12),
        },
      } as never,
      { balance: async () => BALANCE_CELLULE } as never,
      undefined as never,
      undefined as never,
    );

  it('décalée : l’activité reste visible, mais l’écran ne dira pas « PRÊTE »', async () => {
    const s = await superviseur(DECALE).supervision('mere', 'ex-m');
    const ligne = s.cellules[0];
    // L'exercice recouvrant reste rendu · le siège doit pouvoir ouvrir la
    // balance de la cellule pour comprendre.
    expect(ligne.exerciceId).toBe('ex-c1');
    expect(ligne.periodeDiscordante).toEqual({
      dateDebut: new Date('2026-07-01'),
      dateFin: new Date('2027-06-30'),
    });
    expect(ligne.prete).toBe(false);
  });

  it('concordante et équilibrée : « prête » comme avant', async () => {
    const s = await superviseur(CONCORDANT).supervision('mere', 'ex-m');
    expect(s.cellules[0].periodeDiscordante).toBeNull();
    expect(s.cellules[0].prete).toBe(true);
  });
});
