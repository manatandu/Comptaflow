import { RetenuesService } from './retenues.service';
import { PrismaService } from '../../common/prisma.service';
import { obligationsDeclarativesApplicables } from './correspondance-retenues';

/**
 * L'IMPÔT PROPRE DE L'ENTITÉ, ABSENT DE SON PROPRE ÉCHÉANCIER.
 *
 * Le registre et l'échéancier ont été bâtis pour une ASBL, exemptée d'impôt
 * sur les sociétés (loi n° 23/053, art. 5). Servis à une société commerciale,
 * ils énuméraient scrupuleusement tout ce qu'elle retient POUR AUTRUI · TVA,
 * impôts sur salaires, loyers, prestations d'associés · et passaient sous
 * silence les quatre échéances de son IMPÔT PRINCIPAL.
 *
 * Un échéancier fiscal qui omet l'impôt principal du redevable n'est pas
 * incomplet, il est trompeur : on le consulte précisément pour ne rien
 * oublier.
 *
 * Les quatre échéances, et leur source :
 *  · déclaration, au plus tard le 30 avril de l'année qui suit celle de la
 *    réalisation des revenus (art. 12 LPF, modifié par la loi n° 23/052) ;
 *  · trois acomptes provisionnels de 30 %, 30 % et 20 %, au plus tard les
 *    25 juillet, 25 septembre et 25 novembre (art. 57 bis LPF, tel que modifié
 *    par la loi de finances n° 25/060 du 29 décembre 2025).
 *
 * Le piège de la mémoire, que ce spec verrouille : la rédaction de 2023 disait
 * « avant le 1er août, avant le 1er octobre et avant le 1er décembre ». Elle
 * est périmée, et c'est elle qu'un praticien cite spontanément.
 */

const CLES_IS = ['declarationImpotSocietes', 'premierAcompteIs', 'deuxiemeAcompteIs', 'troisiemeAcompteIs'];

function service(referentiel: 'SYCEBNL' | 'SYSCOHADA') {
  const prisma = {
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'e1',
        dateDebut: new Date('2026-01-01'),
        dateFin: new Date('2026-12-31'),
      }),
    },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel }) },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue([]) },
    compte: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;
  return new RetenuesService(prisma);
}

const echeances = async (referentiel: 'SYCEBNL' | 'SYSCOHADA', dateReference = '2026-01-15') =>
  (await service(referentiel).echeancierFiscal('t1', { exerciceId: 'e1', dateReference })).echeances;

describe('Échéances de l’impôt sur les sociétés', () => {
  it('les quatre figurent à l’échéancier d’une société', async () => {
    const cles = (await echeances('SYSCOHADA')).map((e) => e.cle);
    for (const cle of CLES_IS) expect(cles).toContain(cle);
  });

  it('aucune n’est servie à une ASBL, que la loi en exempte', async () => {
    const cles = (await echeances('SYCEBNL')).map((e) => e.cle);
    for (const cle of CLES_IS) expect(cles).not.toContain(cle);
  });

  it('les acomptes tombent les 25 juillet, septembre et novembre · pas les 1er août, octobre et décembre', async () => {
    const parCle = new Map((await echeances('SYSCOHADA')).map((e) => [e.cle, e]));
    expect(parCle.get('premierAcompteIs')!.date.toISOString().slice(0, 10)).toBe('2026-07-25');
    expect(parCle.get('deuxiemeAcompteIs')!.date.toISOString().slice(0, 10)).toBe('2026-09-25');
    expect(parCle.get('troisiemeAcompteIs')!.date.toISOString().slice(0, 10)).toBe('2026-11-25');
  });

  it('la déclaration tombe le 30 avril', async () => {
    const d = (await echeances('SYSCOHADA')).find((e) => e.cle === 'declarationImpotSocietes')!;
    expect(d.date.toISOString().slice(0, 10)).toBe('2026-04-30');
  });

  it('une échéance passée bascule sur l’année suivante, sans disparaître', async () => {
    // Au 1er décembre, les trois acomptes de l'année sont passés · l'échéancier
    // annonce ceux de l'an prochain plutôt que de les taire.
    const parCle = new Map((await echeances('SYSCOHADA', '2026-12-01')).map((e) => [e.cle, e]));
    expect(parCle.get('premierAcompteIs')!.date.toISOString().slice(0, 10)).toBe('2027-07-25');
    expect(parCle.get('troisiemeAcompteIs')!.date.toISOString().slice(0, 10)).toBe('2027-11-25');
  });

  it('ce sont des DÉCLARATIONS sans montant · aucune ne se lit dans un solde de compte', async () => {
    // L'IS se liquide sur le résultat fiscal, les acomptes sur l'impôt de
    // l'exercice PRÉCÉDENT : ni l'un ni l'autre ne sort d'une balance. Les
    // ranger en « reversement » aurait affiché un montant dû faux, à zéro.
    for (const e of (await echeances('SYSCOHADA')).filter((x) => CLES_IS.includes(x.cle))) {
      expect(e.genre).toBe('DECLARATION');
      expect(e.montantDu).toBe(0);
      expect(e.contenu).toBeTruthy();
      expect(e.sourceDonnees).toBeTruthy();
    }
  });

  it('la base légale des acomptes nomme la loi de finances, sans inventer son numéro d’article', async () => {
    // La source consultée porte une réserve expresse sur la numérotation de
    // l'article modificateur · un numéro faux serait pire qu'un renvoi par
    // l'intitulé.
    const a = (await echeances('SYSCOHADA')).find((e) => e.cle === 'premierAcompteIs')!;
    expect(a.baseLegale).toContain('57 bis');
    expect(a.baseLegale).toContain('25/060');
    expect(a.baseLegale).not.toMatch(/loi de finances[^.]*art(icle)?\.?\s*\d/i);
  });

  it('la table le dit aussi, hors de tout calcul de date', async () => {
    const syscohada = obligationsDeclarativesApplicables('SYSCOHADA' as never).map((o) => o.cle);
    const sycebnl = obligationsDeclarativesApplicables('SYCEBNL' as never).map((o) => o.cle);
    expect(CLES_IS.every((c) => syscohada.includes(c))).toBe(true);
    expect(CLES_IS.some((c) => sycebnl.includes(c))).toBe(false);
  });
});
