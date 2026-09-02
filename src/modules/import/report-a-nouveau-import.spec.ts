import { ClasseCompte, ModeReportANouveau } from '@prisma/client';
import { modeReportPourClasse } from './import.service';
import { PLAN_COMPTES_SYCEBNL } from '../comptes/compte-seed';
import { PLAN_COMPTES_SYSCOHADA } from '../comptes/compte-seed-syscohada';

/**
 * L'IMPORT DOIT DIRE LA MÊME CHOSE QUE LE SEMIS.
 *
 * Un compte peut naître de deux façons dans un dossier : semé à la création,
 * ou créé par un import (de plan, ou à la volée depuis une balance externe).
 * Les deux chemins décident du mode de report à-nouveau, et ils le décidaient
 * séparément · le semis rangeait la classe 8 en AUCUN, l'import la rangeait en
 * SOLDE, et personne ne comparait.
 *
 * L'écart était muet et durable. Un 81 « valeurs comptables des cessions » ou
 * un 82 « produits des cessions » importé était reporté au 1er janvier
 * suivant, alors que le PCGO (AUDCIF Titre VII ch. 3, section 8) répète pour
 * chacun de ces comptes qu'il est « crédité pour solde à la clôture de
 * l'exercice, par le débit du compte 13 », ou débité pour solde par son
 * crédit. L'à-nouveau de l'exercice d'après portait donc une charge et un
 * produit de l'exercice clos.
 *
 * Ce test ne récite pas la règle : il la CONFRONTE aux deux semis, compte par
 * compte. Ajouter demain une classe au semis sans l'ajouter à l'import le
 * fera échouer, ce qu'aucun test de la règle seule n'aurait fait.
 */
describe('report à-nouveau · l’import suit les semis, classe par classe', () => {
  const semis = [
    { nom: 'SYCEBNL', lignes: PLAN_COMPTES_SYCEBNL },
    { nom: 'SYSCOHADA', lignes: PLAN_COMPTES_SYSCOHADA },
  ];

  /**
   * L'invariant testé est celui du RÉSULTAT, et lui seul : un compte que le
   * semis ne reporte pas (AUCUN) ne doit jamais être reporté par l'import, et
   * réciproquement. C'est là qu'était le défaut, et c'est là que le dégât est
   * comptable · un compte de gestion reporté fait porter à l'exercice suivant
   * une charge ou un produit de l'exercice clos.
   *
   * L'égalité STRICTE des trois modes ne peut pas être exigée, et il faut le
   * dire plutôt que de l'assouplir en silence : `ModeReportANouveau` a une
   * troisième valeur, DETAIL, que les semis posent sur les comptes de tiers
   * (401, 41x…) pour que l'à-nouveau garde le détail poste par poste. L'import
   * ne connaît que AUCUN et SOLDE : un 401 créé depuis une balance externe
   * reçoit donc SOLDE là où le semis lui aurait donné DETAIL. C'est une
   * divergence réelle, mais d'une autre nature · elle appauvrit l'à-nouveau
   * sans le fausser, et la refermer suppose de décider ce qu'un import doit
   * faire d'un tiers qu'il ne connaît pas. Elle est laissée ouverte, ici, en
   * toutes lettres.
   */
  it.each(semis.map((s) => [s.nom, s] as const))(
    'aucun compte de gestion du semis %s n’est reporté par l’import, et aucun compte de bilan n’est perdu',
    (_, { lignes }) => {
      const divergences = lignes
        .filter((c) => {
          const semisReporte = c.modeReportANouveau !== ModeReportANouveau.AUCUN;
          const importReporte = modeReportPourClasse(c.classe) !== ModeReportANouveau.AUCUN;
          return semisReporte !== importReporte;
        })
        .map((c) => ({ numero: c.numero, semis: c.modeReportANouveau, import: modeReportPourClasse(c.classe) }));
      expect(divergences).toEqual([]);
    },
  );

  it('les classes soldées sur le résultat sont 6, 7 ET 8 · la 8 manquait', () => {
    expect(modeReportPourClasse(ClasseCompte.CLASSE_6)).toBe(ModeReportANouveau.AUCUN);
    expect(modeReportPourClasse(ClasseCompte.CLASSE_7)).toBe(ModeReportANouveau.AUCUN);
    // Le défaut d'origine : la classe 8 (hors activités ordinaires) partait en
    // SOLDE alors qu'elle se solde sur le compte 13 comme les deux autres.
    expect(modeReportPourClasse(ClasseCompte.CLASSE_8)).toBe(ModeReportANouveau.AUCUN);
  });

  it('les classes de bilan se reportent, elles', () => {
    for (const c of [ClasseCompte.CLASSE_1, ClasseCompte.CLASSE_2, ClasseCompte.CLASSE_3, ClasseCompte.CLASSE_4, ClasseCompte.CLASSE_5]) {
      expect(modeReportPourClasse(c)).toBe(ModeReportANouveau.SOLDE);
    }
  });
});
