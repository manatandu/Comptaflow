import { FormeJuridiqueSyscohada, Referentiel } from '@prisma/client';
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

/**
 * LE CALENDRIER DE PAIEMENT SUIT LA FORME, ET L'ÉCHÉANCIER L'IGNORAIT.
 *
 * Le test ci-dessus verrouillait les quatre échéances de l'impôt sur les
 * sociétés. Il ne disait rien de QUI les doit · et l'échéancier les servait à
 * tout dossier SYSCOHADA, entreprise individuelle et entreprenant compris.
 *
 * Or l'article 57 bis vise « les acomptes provisionnels visés à l'article 57,
 * ALINÉA 2 », et cet alinéa ne couvre que l'impôt sur les sociétés et l'IRPP
 * au régime réel. Une petite entreprise relève de l'alinéa 3 et paie en DEUX
 * quotités (art. 57 quater), que l'échéancier taisait entièrement. Un
 * entrepreneur individuel lisait donc trois versements aux mauvaises dates et
 * ignorait les deux qu'il doit vraiment.
 *
 * CE QUE LE MODULE NE TRANCHE PAS, ET POURQUOI C'EST TESTÉ AUSSI. Le régime se
 * déduit du chiffre d'affaires sur plusieurs exercices (art. 113) et vit dans
 * le module fiscal. L'échéancier sert donc les DEUX calendriers à une personne
 * physique, chacun avec sa condition en réserve. Les assertions ci-dessous
 * gèlent ce choix : servir un seul calendrier ici serait une devinette, et
 * recalculer l'article 113 dans ce module le ferait diverger de l'autre.
 */
describe('Calendrier de paiement de l’impôt · art. 57, al. 2 et 3', () => {
  const cles = (forme: FormeJuridiqueSyscohada | null) =>
    obligationsDeclarativesApplicables(Referentiel.SYSCOHADA, forme).map((o) => o.cle);

  const QUOTITES = ['premiereQuotitePetiteEntreprise', 'secondeQuotitePetiteEntreprise'];
  const ACOMPTES = ['premierAcompteIs', 'deuxiemeAcompteIs', 'troisiemeAcompteIs'];

  it('NE SERT AUCUNE quotité à une personne morale · c’est l’impôt sur les sociétés', () => {
    for (const forme of [
      FormeJuridiqueSyscohada.SOCIETE_ANONYME,
      FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE,
      FormeJuridiqueSyscohada.SOCIETE_COOPERATIVE,
    ]) {
      const servies = cles(forme);
      expect(servies).toEqual(expect.arrayContaining(ACOMPTES));
      expect(`${forme}: ${servies.filter((c) => QUOTITES.includes(c)).join(', ')}`).toBe(`${forme}: `);
    }
  });

  it('SERT les deux quotités à une personne physique · c’est le défaut corrigé', () => {
    for (const forme of [
      FormeJuridiqueSyscohada.ENTREPRISE_INDIVIDUELLE,
      FormeJuridiqueSyscohada.ENTREPRENANT,
    ]) {
      const servies = cles(forme);
      expect(servies).toEqual(expect.arrayContaining(QUOTITES));
      // Les acomptes RESTENT servis : une personne physique au régime réel les
      // doit. C'est le sens de la réserve, pas d'une suppression.
      expect(servies).toEqual(expect.arrayContaining(ACOMPTES));
    }
  });

  it('accompagne CHAQUE calendrier de sa condition quand la forme est physique', () => {
    const servies = obligationsDeclarativesApplicables(
      Referentiel.SYSCOHADA,
      FormeJuridiqueSyscohada.ENTREPRISE_INDIVIDUELLE,
    );
    for (const cle of [...ACOMPTES, ...QUOTITES]) {
      const o = servies.find((x) => x.cle === cle)!;
      expect(`${cle}: ${o.reserve === null ? 'sans réserve' : 'avec réserve'}`).toBe(`${cle}: avec réserve`);
      expect(o.reserve).toMatch(/RÉGIME/);
    }
    // La réserve renvoie à la fenêtre qui tranche, jamais à une devinette.
    expect(servies.find((x) => x.cle === 'premierAcompteIs')!.reserve).toContain('Résultat fiscal');
  });

  it('ne pose AUCUNE réserve à une personne morale, dont le régime est certain', () => {
    const servies = obligationsDeclarativesApplicables(
      Referentiel.SYSCOHADA,
      FormeJuridiqueSyscohada.SOCIETE_ANONYME,
    );
    for (const cle of ACOMPTES) expect(servies.find((x) => x.cle === cle)!.reserve).toBeNull();
  });

  it('FORME NON RENSEIGNÉE · rien n’est retranché de ce qui était servi, rien n’est ajouté', () => {
    const servies = cles(null);
    expect(servies).toEqual(expect.arrayContaining(ACOMPTES));
    expect(servies.filter((c) => QUOTITES.includes(c))).toEqual([]);
  });

  it('date la première quotité au 31 janvier et la seconde au 30 avril, réserve du texte comprise', () => {
    const servies = obligationsDeclarativesApplicables(
      Referentiel.SYSCOHADA,
      FormeJuridiqueSyscohada.ENTREPRENANT,
    );
    const premiere = servies.find((o) => o.cle === 'premiereQuotitePetiteEntreprise')!;
    const seconde = servies.find((o) => o.cle === 'secondeQuotitePetiteEntreprise')!;
    expect([premiere.moisEcheance, premiere.jourEcheance]).toEqual([1, 31]);
    expect([seconde.moisEcheance, seconde.jourEcheance]).toEqual([4, 30]);
    // La coquille de l'art. 57 quater, al. 3 est SIGNALÉE, pas corrigée en
    // silence · le même alinéa ne peut pas fixer deux dates à la 1ère quotité.
    expect(seconde.contenu).toContain('À CONFIRMER');
    expect(seconde.baseLegale).toContain('57 quater');
  });
});
