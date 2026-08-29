import { RetenuesService } from './retenues.service';
import { PrismaService } from '../../common/prisma.service';
import { NATURES_RETENUES, OBLIGATIONS_DECLARATIVES } from './correspondance-retenues';

/**
 * REGISTRE DES RETENUES · l'état ne calcule aucun impôt. Ce qu'il doit faire
 * juste, c'est le SENS des mouvements (crédit = retenue constituée, débit =
 * reversement), le découpage MENSUEL (chaque mois a son échéance) et le
 * signalement du retard.
 */

function ligne(numero: string, date: string, montant: { debit?: number; credit?: number }) {
  return {
    debit: montant.debit ?? 0,
    credit: montant.credit ?? 0,
    compte: { numero, intitule: `Compte ${numero}` },
    ecriture: { date: new Date(date), libelle: 'Écriture', reference: null },
  };
}

function service(lignes: ReturnType<typeof ligne>[]) {
  const prisma = {
    ligneEcriture: { findMany: jest.fn().mockResolvedValue(lignes) },
  } as unknown as PrismaService;
  return new RetenuesService(prisma);
}

const nature = (r: { natures: Array<{ cle: string }> }, cle: string) =>
  r.natures.find((n) => n.cle === cle) as {
    cle: string;
    retenu: number;
    reverse: number;
    solde: number;
    moisEnRetard: number;
    mois: Array<{ mois: string; retenu: number; reverse: number; solde: number; echeance: Date; enRetard: boolean }>;
    reserve: string | null;
    baseLegale: string;
    echeance: string;
  };

describe('Registre des retenues à la source', () => {
  it('un CRÉDIT est une retenue constituée, un DÉBIT est un reversement', async () => {
    const s = service([
      ligne('44720000', '2026-03-31', { credit: 350_000 }),
      ligne('44720000', '2026-04-14', { debit: 350_000 }),
    ]);
    const r = await s.registre('t1', { exerciceId: 'e1', dateReference: '2026-06-15' });
    const n = nature(r, 'irppSalaires');
    expect(n.retenu).toBe(350_000);
    expect(n.reverse).toBe(350_000);
    expect(n.solde).toBe(0);
  });

  it('découpe par MOIS · chaque mois a sa propre échéance de reversement', async () => {
    const s = service([
      ligne('44720000', '2026-03-31', { credit: 300_000 }),
      ligne('44720000', '2026-04-30', { credit: 320_000 }),
    ]);
    const r = await s.registre('t1', { exerciceId: 'e1', dateReference: '2026-06-15' });
    const n = nature(r, 'irppSalaires');
    expect(n.mois.map((m) => m.mois)).toEqual(['2026-03', '2026-04']);
    // Retenue de mars, reversée le 15 avril (art. 18 LPF).
    expect(n.mois[0].echeance.toISOString().slice(0, 10)).toBe('2026-04-15');
    expect(n.mois[1].echeance.toISOString().slice(0, 10)).toBe('2026-05-15');
  });

  it('signale le retard de reversement, mois par mois', async () => {
    const s = service([
      // Mars retenu et non reversé · l'échéance du 15 avril est passée.
      ligne('44720000', '2026-03-31', { credit: 300_000 }),
      // Juin retenu, échéance au 15 juillet · pas encore due.
      ligne('44720000', '2026-06-30', { credit: 280_000 }),
    ]);
    const r = await s.registre('t1', { exerciceId: 'e1', dateReference: '2026-06-15' });
    const n = nature(r, 'irppSalaires');
    expect(n.moisEnRetard).toBe(1);
    expect(n.mois.find((m) => m.mois === '2026-03')!.enRetard).toBe(true);
    expect(n.mois.find((m) => m.mois === '2026-06')!.enRetard).toBe(false);
  });

  it('un compte 44 qu’aucune nature ne réclame ressort en NON RATTACHÉ, jamais absorbé', async () => {
    // 442 « Etat, autres impôts et taxes » : ce n'est pas une retenue à la
    // source, il n'a donc pas de nature ici. Le registre le dit.
    const s = service([ligne('44210000', '2026-03-31', { credit: 90_000 })]);
    const r = await s.registre('t1', { exerciceId: 'e1', dateReference: '2026-06-15' });
    expect(r.comptesNonRattaches.map((c) => c.numero)).toEqual(['44210000']);
    expect(r.totalRetenu).toBe(0);
  });

  it('sépare l’État des organismes sociaux', async () => {
    const s = service([
      ligne('44720000', '2026-03-31', { credit: 350_000 }),
      ligne('43100000', '2026-03-31', { credit: 130_000 }),
    ]);
    const r = await s.registre('t1', { exerciceId: 'e1', dateReference: '2026-06-15' });
    expect(nature(r, 'irppSalaires').retenu).toBe(350_000);
    // 431 « Sécurité sociale » relève désormais de la CNSS nommément, et non
    // plus d'une ligne « cotisations sociales » qui mêlait trois organismes
    // aux taux et aux bases légales distincts.
    expect(nature(r, 'cnss').retenu).toBe(130_000);
    expect(r.natures.find((n) => n.cle === 'cnss')!.beneficiaire).toBe('ORGANISME_SOCIAL');
  });

  it('ne calcule AUCUN impôt et le dit · aucun taux n’est inscrit dans le référentiel', async () => {
    const r = await service([]).registre('t1', { exerciceId: 'e1' });
    expect(r.avertissements[0]).toContain("ne calcule aucun impôt");
    expect(r.avertissements[1]).toContain('DÉCLARER');
    // Aucun taux, nulle part : c'est la règle posée dans
    // docs/fiscalite-asbl-rdc.md, section 9.2.
    const serialise = JSON.stringify(NATURES_RETENUES);
    expect(serialise).not.toMatch(/"taux"/);
  });

  it('porte la réserve sur le compte 4478 non ventilé, dont les échéances diffèrent', async () => {
    const r = await service([]).registre('t1', { exerciceId: 'e1' });
    expect(nature(r, 'autresRetenues').reserve).toContain('44781');
  });

  /*
    LE BUG QUE CES TESTS FIGENT · la retenue sur les revenus locatifs est due
    « dans les dix jours du mois suivant » (loi de procédures fiscales,
    art. 57). Le registre l'écrivait et la datait pourtant au 15, comme les
    autres : le texte affiché contredisait la date calculée.
  */
  it('date la retenue locative au 10 du mois suivant, et non au 15', async () => {
    const r = await service([ligne('44781000', '2026-06-12', { credit: 100_000 })]).registre('t1', {
      exerciceId: 'e1',
    });
    const mois = nature(r, 'retenueLocative').mois[0];
    expect(mois.echeance.toISOString().slice(0, 10)).toBe('2026-07-10');
  });

  it('date les autres prélèvements au 15 du mois suivant', async () => {
    const r = await service([ligne('44782000', '2026-06-12', { credit: 100_000 })]).registre('t1', {
      exerciceId: 'e1',
    });
    expect(nature(r, 'prestatairesNonResidents').mois[0].echeance.toISOString().slice(0, 10)).toBe('2026-07-15');
  });

  it('une retenue de décembre s’échoit en janvier suivant', async () => {
    const r = await service([ligne('44781000', '2026-12-20', { credit: 50_000 })]).registre('t1', {
      exerciceId: 'e1',
    });
    expect(nature(r, 'retenueLocative').mois[0].echeance.toISOString().slice(0, 10)).toBe('2027-01-10');
  });

  it('le 4478 générique n’absorbe pas les lignes de ses sous-comptes ventilés', async () => {
    const r = await service([
      ligne('44781000', '2026-06-12', { credit: 100_000 }),
      ligne('44780000', '2026-06-12', { credit: 30_000 }),
    ]).registre('t1', { exerciceId: 'e1' });
    expect(nature(r, 'retenueLocative').retenu).toBe(100_000);
    expect(nature(r, 'autresRetenues').retenu).toBe(30_000);
  });

  it('sépare CNSS, INPP et ONEM · un taux et un bénéficiaire par organisme', async () => {
    const r = await service([
      ligne('43110000', '2026-06-12', { credit: 65_000 }),
      ligne('43340000', '2026-06-12', { credit: 35_000 }),
      ligne('43350000', '2026-06-12', { credit: 2_000 }),
    ]).registre('t1', { exerciceId: 'e1' });
    expect(nature(r, 'cnss').retenu).toBe(65_000);
    expect(nature(r, 'inpp').retenu).toBe(35_000);
    expect(nature(r, 'onem').retenu).toBe(2_000);
  });

  it('porte le taux ONEM de 0,5 % ET sa date d’effet', async () => {
    // 0,5 % depuis l'arrêté ministériel n° 028/2025, entré en vigueur le
    // 25 septembre 2025 ; 0,2 % avant lui (arrêté n° 095/2018). Le test fige
    // les deux : le chiffre en vigueur, et l'avertissement de date · un
    // exercice à cheval sur septembre 2025 porte les DEUX taux, et un taux
    // sans date d'effet, dans un logiciel comptable, est un piège.
    const r = await service([]).registre('t1', { exerciceId: 'e1' });
    expect(nature(r, 'onem').baseLegale).toContain('0,5 %');
    expect(nature(r, 'onem').baseLegale).toContain('028/CAB/MIN.ET');
    expect(nature(r, 'onem').reserve).toContain("DATE D'EFFET");
    expect(nature(r, 'onem').reserve).toContain('25 septembre 2025');
    // L'ancien taux doit rester lisible en réserve, et JAMAIS en base légale.
    expect(nature(r, 'onem').reserve).toMatch(/0,2\s*%/);
    expect(nature(r, 'onem').baseLegale).not.toMatch(/0[.,]2\s*%/);
  });

  it('sépare la déclaration ONEM (le 10) du versement ONEM (le 15)', async () => {
    // Deux dates, deux sanctions : 50 % de la contribution pour la déclaration
    // manquante ou inexacte, 0,5 % par jour pour le versement en retard. Les
    // confondre laisserait croire qu'être à jour du paiement suffit.
    const e = await service([]).echeancierFiscal('t1', { exerciceId: 'e1' });
    const declaration = e.echeances.find((x) => x.cle === 'declarationMensuelleOnem');
    const versement = e.echeances.find((x) => x.cle === 'onem');
    expect(declaration).toBeDefined();
    expect(versement).toBeDefined();
    expect(declaration!.genre).toBe('DECLARATION');
    expect(versement!.genre).toBe('REVERSEMENT');
    expect(declaration!.periodicite).toBe('MENSUELLE');
    expect(declaration!.sanction).toContain('50 %');
    // La déclaration tombe cinq jours AVANT le versement du même mois.
    expect(declaration!.date.getTime()).toBeLessThan(versement!.date.getTime());
  });

  it('avertit que la retenue omise est personnellement due (art. 96 bis)', async () => {
    const r = await service([]).registre('t1', { exerciceId: 'e1' });
    expect(r.avertissements.join(' ')).toContain('96 bis');
  });
});

describe('Échéancier fiscal et social', () => {
  it('trie par date et garde les natures sans solde · déclarer reste dû', async () => {
    const s = service([ligne('44720000', '2026-06-10', { credit: 200_000 })]);
    const e = await s.echeancierFiscal('t1', { exerciceId: 'e1', dateReference: '2026-06-20' });
    // Toutes les natures ET toutes les obligations déclaratives figurent.
    expect(e.echeances).toHaveLength(NATURES_RETENUES.length + OBLIGATIONS_DECLARATIVES.length);
    const dates = e.echeances.map((x) => x.date.getTime());
    expect([...dates].sort((a, b) => a - b)).toEqual(dates);
  });

  /*
    LES TROIS OBLIGATIONS DE LA LOI DE FINANCES 25/060 · elles ne portent
    aucun montant sur aucun compte, et c'est pour cela que le registre ne les
    voyait pas. L'article 47 nomme pourtant les ASBL, et l'amende est chiffrée.
  */
  it('porte le relevé trimestriel des sommes versées à des tiers (art. 47)', async () => {
    const e = await service([]).echeancierFiscal('t1', { exerciceId: 'e1', dateReference: '2026-05-02' });
    const releve = e.echeances.find((x) => x.cle === 'releveTrimestrielTiers')!;
    expect(releve.periodicite).toBe('TRIMESTRIELLE');
    // Trimestre clos le 30 juin → dix jours après.
    expect(releve.date.toISOString().slice(0, 10)).toBe('2026-07-10');
    expect(releve.sanction).toContain('500 000');
  });

  it('le relevé trimestriel bascule au trimestre suivant une fois l’échéance passée', async () => {
    const e = await service([]).echeancierFiscal('t1', { exerciceId: 'e1', dateReference: '2026-07-20' });
    const releve = e.echeances.find((x) => x.cle === 'releveTrimestrielTiers')!;
    expect(releve.date.toISOString().slice(0, 10)).toBe('2026-10-10');
  });

  it('porte les deux déclarations annuelles du 31 mars (art. 22 ter et 47 ter)', async () => {
    const e = await service([]).echeancierFiscal('t1', { exerciceId: 'e1', dateReference: '2026-05-02' });
    for (const cle of ['declarationAnnuelleSalaires', 'listeFournisseurs']) {
      const o = e.echeances.find((x) => x.cle === cle)!;
      expect(o.periodicite).toBe('ANNUELLE');
      // Le 31 mars 2026 est passé au 2 mai : la prochaine est celle de 2027.
      expect(o.date.toISOString().slice(0, 10)).toBe('2027-03-31');
    }
  });

  it('distingue un reversement d’une déclaration · l’un porte un montant, l’autre non', async () => {
    const e = await service([]).echeancierFiscal('t1', { exerciceId: 'e1' });
    expect(e.echeances.filter((x) => x.genre === 'DECLARATION')).toHaveLength(OBLIGATIONS_DECLARATIVES.length);
    for (const d of e.echeances.filter((x) => x.genre === 'DECLARATION')) {
      expect(d.contenu).toBeTruthy();
    }
  });

  it('la prochaine échéance passe au mois suivant quand celle du mois est passée', async () => {
    const s = service([]);
    // Visée par CLÉ et non par position : depuis que la retenue locative est
    // datée au 10, c'est elle qui ouvre la liste, et un test positionnel
    // mesurerait le tri plutôt que la règle qu'il prétend vérifier.
    const quand = (e: { echeances: Array<{ cle: string; date: Date }> }, cle: string) =>
      e.echeances.find((x) => x.cle === cle)!.date.toISOString().slice(0, 10);
    const avant = await s.echeancierFiscal('t1', { exerciceId: 'e1', dateReference: '2026-06-10' });
    const apres = await s.echeancierFiscal('t1', { exerciceId: 'e1', dateReference: '2026-06-20' });
    expect(quand(avant, 'irppSalaires')).toBe('2026-06-15');
    expect(quand(apres, 'irppSalaires')).toBe('2026-07-15');
    // Et la locative tombe bien au 10 · le 10 au matin, elle est due LE JOUR
    // MÊME et ne bascule pas encore au mois suivant.
    expect(quand(avant, 'retenueLocative')).toBe('2026-06-10');
    expect(quand(apres, 'retenueLocative')).toBe('2026-07-10');
  });

  it('expose la date de dernière vérification des échéances · elles changent', async () => {
    const e = await service([]).echeancierFiscal('t1', { exerciceId: 'e1' });
    expect(e.derniereVerificationEcheances).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
