import { ModeReportANouveau } from '@prisma/client';
import { PLAN_COMPTES_SYSCOHADA } from './compte-seed-syscohada';
import { PLAN_COMPTES_SYCEBNL } from './compte-seed';
import { CompteService } from './compte.service';
import { FAMILLES_IMMOBILISATION_DEFAUT_SYSCOHADA } from '../immobilisations/famille-immobilisation-seed';
import { tauxTvaDefaut } from '../tva/taux-tva-seed';
import { journauxDefaut } from '../journaux/journal-seed';

/**
 * Intégrité du plan SYSCOHADA semé · mêmes garanties structurelles que
 * compte-seed.spec.ts pour le SYCEBNL (l'agrégation par racine et le couple
 * Total/Détail sont la même mécanique pour les deux référentiels), plus la
 * vérification que chaque semis annexe (journaux, taxes, familles
 * d'immobilisations) ne référence que des comptes d'imputation qui existent
 * réellement dans CE plan · c'est le point qui a imposé deux listes de
 * familles (2444/2834, voir famille-immobilisation-seed.ts).
 */
describe('plan SYSCOHADA · structure Total/Détail', () => {
  const totaux = PLAN_COMPTES_SYSCOHADA.filter((c) => c.typeCompte === 'TOTAL');
  const detail = PLAN_COMPTES_SYSCOHADA.filter((c) => c.typeCompte !== 'TOTAL');

  it('reprend le plan officiel, contreparties d’engagements développées au 4e chiffre', () => {
    // 1403 lignes source − l'en-tête − 2 lignes de plage (« 911 à 914 »,
    // « 915 à 918 », qui ne sont pas des numéros de compte) + 8 racines 911 à
    // 918 + 32 contreparties à quatre chiffres, en miroir des 32 comptes 90xx.
    // Les huit divisions 92 à 99 sont semées, en en-têtes sans imputation.
    expect(PLAN_COMPTES_SYSCOHADA).toHaveLength(1441);
    expect(totaux).toHaveLength(311);
    expect(detail).toHaveLength(1130);
  });

  it('ne porte aucun doublon de numéro', () => {
    const numeros = PLAN_COMPTES_SYSCOHADA.map((c) => c.numero);
    expect(new Set(numeros).size).toBe(numeros.length);
  });

  it('sème les Totaux non complétés (2-3 chiffres) et les Détails complétés à 8 chiffres', () => {
    expect(totaux.every((c) => /^\d{2,3}$/.test(c.numero))).toBe(true);
    expect(detail.every((c) => /^\d{8}$/.test(c.numero))).toBe(true);
  });

  it('chaque Total regroupe au moins un compte Détail réel de sa division', () => {
    // Seule exception assumée : 92 à 99, la comptabilité analytique de
    // gestion. Le Titre VII laisse leur découpage « à l'initiative des
    // entités » et n'en donne aucune subdivision · les semer vides est le
    // seul traitement fidèle. Toute autre division vide est un bug.
    const ANALYTIQUE_LIBRE = new Set(['92', '93', '94', '95', '96', '97', '98', '99']);
    for (const t of totaux) {
      const enfants = detail.filter((d) => d.numero.startsWith(t.numero) && d.classe === t.classe);
      if (ANALYTIQUE_LIBRE.has(t.numero)) {
        expect(enfants).toHaveLength(0);
        continue;
      }
      expect(enfants.length).toBeGreaterThan(0);
    }
  });

  /**
   * LE MIROIR DU 90 DANS LE 91 · ce test existe parce que le semis a porté
   * pendant des mois huit comptes `91100000` à `91800000` qui ne
   * correspondaient à RIEN. Le plan officiel ne donne que deux plages
   * (« 911 à 914 », « 915 à 918 ») ; le Titre VII, lui, opère toutes les
   * contreparties à quatre chiffres (« par le crédit du compte de
   * contrepartie 9111 »), et les cas pratiques passent 9162/9062, 9022/9122,
   * 9183/9083, 9043/9143. Avec l'ancien semis, aucune de ces écritures
   * n'était passable : la contrepartie du 9062 n'existait pas.
   */
  it('donne à chaque compte 90xx sa contrepartie 91xx, sans exception', () => {
    const engagements = detail.filter((c) => c.numero.startsWith('90'));
    expect(engagements).toHaveLength(32);
    for (const e of engagements) {
      const contrepartie = detail.find((c) => c.numero === `91${e.numero.slice(2)}`);
      expect({ engagement: e.numero, contrepartie: contrepartie?.numero }).toEqual({
        engagement: e.numero,
        contrepartie: `91${e.numero.slice(2)}`,
      });
    }
    // Et rien d'autre : une contrepartie orpheline serait un compte que le
    // texte ne connaît pas.
    expect(detail.filter((c) => c.numero.startsWith('91'))).toHaveLength(32);
  });

  it('sème les huit divisions 92 à 99 en en-têtes, sans compte d’imputation', () => {
    for (let n = 92; n <= 99; n += 1) {
      const tete = PLAN_COMPTES_SYSCOHADA.find((c) => c.numero === String(n));
      expect(tete?.typeCompte).toBe('TOTAL');
      expect(detail.some((c) => c.numero.startsWith(String(n)))).toBe(false);
    }
  });

  it('classe chaque compte selon son premier chiffre', () => {
    expect(PLAN_COMPTES_SYSCOHADA.every((c) => c.classe === `CLASSE_${c.numero[0]}`)).toBe(true);
  });
});

describe('plan SYSCOHADA · modes de report à-nouveau', () => {
  const parNumero = new Map(PLAN_COMPTES_SYSCOHADA.map((c) => [c.numero, c]));

  it('bilan (classes 1, 2, 3, 5) au SOLDE, gestion (6, 7, 8) sans report', () => {
    for (const c of PLAN_COMPTES_SYSCOHADA) {
      if ('1235'.includes(c.numero[0])) expect(c.modeReportANouveau).toBe(ModeReportANouveau.SOLDE);
      if ('678'.includes(c.numero[0])) expect(c.modeReportANouveau).toBe(ModeReportANouveau.AUCUN);
    }
  });

  it('tiers lettrés (40, 41, 45, 46, 47) au DÉTAIL, autres divisions de la classe 4 au SOLDE', () => {
    for (const c of PLAN_COMPTES_SYSCOHADA.filter((x) => x.numero[0] === '4')) {
      const attendu = ['40', '41', '45', '46', '47'].includes(c.numero.slice(0, 2))
        ? ModeReportANouveau.DETAIL
        : ModeReportANouveau.SOLDE;
      expect(c.modeReportANouveau).toBe(attendu);
    }
  });

  it('engagements hors bilan (classe 9) au SOLDE, comme la classe 9 du SYCEBNL', () => {
    expect(parNumero.get('90')!.modeReportANouveau).toBe(ModeReportANouveau.SOLDE);
    expect(parNumero.get('90110000')!.modeReportANouveau).toBe(ModeReportANouveau.SOLDE);
  });
});

/**
 * Les semis annexes tournent sur le plan du référentiel du dossier · chaque
 * numéro qu'ils référencent doit être un compte d'IMPUTATION du plan
 * SYSCOHADA (pas un Total, qui refuse toute écriture), sans quoi le seed
 * défensif les sauterait en silence et le dossier naîtrait sans journal de
 * banque, sans compte de TVA ou sans famille d'immobilisation.
 */
describe('plan SYSCOHADA · ancrage des semis annexes', () => {
  const imputation = new Set(
    PLAN_COMPTES_SYSCOHADA.filter((c) => c.typeCompte !== 'TOTAL').map((c) => c.numero),
  );

  it('journaux par défaut · banque commune (5211), caisse propre au référentiel (5711 et non 5710)', () => {
    for (const j of journauxDefaut('SYSCOHADA')) {
      if (j.numeroCompteTresorerie) expect(imputation.has(j.numeroCompteTresorerie)).toBe(true);
    }
    expect(journauxDefaut('SYSCOHADA').find((j) => j.code === 'CA')!.numeroCompteTresorerie).toBe('57110000');
    expect(journauxDefaut('SYCEBNL').find((j) => j.code === 'CA')!.numeroCompteTresorerie).toBe('57100000');
  });

  it('taux de TVA · collecte sur 4431, déductible sur 4452 (le 4451 SYSCOHADA est réservé aux immobilisations)', () => {
    for (const t of tauxTvaDefaut('SYSCOHADA')) {
      if (t.numeroCompteCollecte) expect(imputation.has(t.numeroCompteCollecte)).toBe(true);
      if (t.numeroCompteDeductible) {
        expect(t.numeroCompteDeductible).toBe('44520000');
        expect(imputation.has(t.numeroCompteDeductible)).toBe(true);
      }
    }
    // Et le SYCEBNL garde son compte générique · les deux listes divergent.
    expect(tauxTvaDefaut('SYCEBNL')[0].numeroCompteDeductible).toBe('44510000');
  });

  it("familles d'immobilisations · immobilisation, amortissement et dotation existent tous", () => {
    for (const f of FAMILLES_IMMOBILISATION_DEFAUT_SYSCOHADA) {
      expect(imputation.has(f.numeroCompteImmobilisation)).toBe(true);
      expect(imputation.has(f.numeroCompteAmortissement)).toBe(true);
      expect(imputation.has(f.numeroCompteDotation)).toBe(true);
    }
  });

  it('mobilier en 2444 et amortissement des agencements en 2834 · les deux divergences vérifiées', () => {
    const mobilier = FAMILLES_IMMOBILISATION_DEFAUT_SYSCOHADA.find((f) => f.code === 'MOBILIER')!;
    expect(mobilier.numeroCompteImmobilisation).toBe('24440000');
    const agencements = FAMILLES_IMMOBILISATION_DEFAUT_SYSCOHADA.find((f) => f.code === 'AGENCEMENTS')!;
    expect(agencements.numeroCompteAmortissement).toBe('28340000');
  });
});

/**
 * CompteService.seedPlan est l'aiguillage appelé par AuthService.register ·
 * il doit semer le plan du référentiel demandé, et appliquer la même règle
 * de lettrage que pour le SYCEBNL (classes 4 et 58 par défaut, jamais un
 * compte Total).
 */
describe('CompteService.seedPlan · aiguillage par référentiel', () => {
  function serviceCapturant() {
    const captures: Array<{ data: Array<{ numero: string; typeCompte?: string; lettrable: boolean }> }> = [];
    const prisma = { compte: { createMany: async (args: never) => void captures.push(args as never) } };
    return { service: new CompteService(prisma as never), captures };
  }

  it('sème le plan SYSCOHADA pour un dossier SYSCOHADA, le SYCEBNL sinon', async () => {
    const { service, captures } = serviceCapturant();
    await service.seedPlan('t1', 'SYSCOHADA');
    await service.seedPlan('t2', 'SYCEBNL');
    expect(captures[0].data).toHaveLength(PLAN_COMPTES_SYSCOHADA.length);
    expect(captures[1].data).toHaveLength(PLAN_COMPTES_SYCEBNL.length);
    // Un compte discriminant de chaque plan · 1012 « Capital souscrit,
    // appelé, non versé » n'existe qu'au SYSCOHADA, 1049 « Dotation
    // consomptible inscrite au compte de résultat » qu'au SYCEBNL.
    expect(captures[0].data.some((c) => c.numero === '10120000')).toBe(true);
    expect(captures[1].data.some((c) => c.numero === '10120000')).toBe(false);
    expect(captures[1].data.some((c) => c.numero === '10490000')).toBe(true);
    expect(captures[0].data.some((c) => c.numero === '10490000')).toBe(false);
  });

  it('ouvre le lettrage sur les tiers Détail et jamais sur un Total', async () => {
    const { service, captures } = serviceCapturant();
    await service.seedPlan('t1', 'SYSCOHADA');
    const fournisseurs = captures[0].data.find((c) => c.numero === '40110000')!;
    expect(fournisseurs.lettrable).toBe(true);
    const totalFournisseurs = captures[0].data.find((c) => c.numero === '401')!;
    expect(totalFournisseurs.lettrable).toBe(false);
    const banque = captures[0].data.find((c) => c.numero === '52110000')!;
    expect(banque.lettrable).toBe(false);
  });
});
