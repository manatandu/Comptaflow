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

function service(lignes: ReturnType<typeof ligne>[], referentiel = 'SYCEBNL') {
  const prisma = {
    // Le référentiel du dossier commande l'avertissement de régime d'impôt,
    // les réserves de chaque nature et la liste des obligations déclaratives.
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel }) },
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

  it('le relevé trimestriel du trimestre CLOS reste dû tant que ses dix jours courent', async () => {
    // Le 5 juillet, le trimestre d'avril-juin est clos mais son relevé n'est
    // exigible que le 10 · l'échéancier doit encore l'annoncer, et non sauter
    // directement à celui du trimestre en cours (10 octobre).
    const e = await service([]).echeancierFiscal('t1', { exerciceId: 'e1', dateReference: '2026-07-05' });
    const releve = e.echeances.find((x) => x.cle === 'releveTrimestrielTiers')!;
    expect(releve.date.toISOString().slice(0, 10)).toBe('2026-07-10');
  });

  it('le relevé trimestriel du 10 janvier est celui du trimestre de l’année écoulée', async () => {
    // Le trimestre précédent est ici celui de l'AUTRE année · un calcul en
    // modulo se trompait d'un an sur ce seul cas.
    const e = await service([]).echeancierFiscal('t1', { exerciceId: 'e1', dateReference: '2026-01-05' });
    const releve = e.echeances.find((x) => x.cle === 'releveTrimestrielTiers')!;
    expect(releve.date.toISOString().slice(0, 10)).toBe('2026-01-10');
  });

  it('la déclaration mensuelle du mois CLOS reste due jusqu’à son dixième jour', async () => {
    // Le 1er septembre, la déclaration encore due est celle des rémunérations
    // d'août, exigible le 10 septembre.
    const e = await service([]).echeancierFiscal('t1', { exerciceId: 'e1', dateReference: '2026-09-01' });
    const declaration = e.echeances.find((x) => x.cle === 'declarationMensuelleOnem')!;
    expect(declaration.date.toISOString().slice(0, 10)).toBe('2026-09-10');
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

/**
 * LE CRÉDIT DE TVA N'EST PAS UN REVERSEMENT.
 *
 * Ce registre compte les CRÉDITS comme des retenues constituées et les DÉBITS
 * comme des reversements. La nature « TVA due » captait le préfixe « 444 » en
 * entier · exact en SYCEBNL, dont le plan ne subdivise pas ce compte, faux en
 * SYSCOHADA, qui en tire « 4441 État, TVA due » et « 4449 État, crédit de TVA
 * à reporter ».
 *
 * Le 4449 est une CRÉANCE sur l'État : ses débits n'ont jamais été versés à
 * personne. Les compter comme des reversements minorait la TVA due du montant
 * du crédit reporté · le registre annonçait une dette fiscale plus faible
 * qu'elle n'est, et l'échéancier s'en trouvait faussé dans le sens le plus
 * dangereux, celui qui rassure.
 */
describe('registre des retenues · le crédit de TVA reporté n’est pas un reversement', () => {
  it('compte la TVA due du 4441 et ignore le 4449', async () => {
    const s = service([
      // TVA due de janvier, constituée puis non reversée.
      ligne('44410000', '2026-01-31', { credit: 500_000 }),
      // Crédit de TVA reporté, porté au débit du 4449 · le registre ne doit
      // PAS le lire comme un reversement de 200 000.
      ligne('44490000', '2026-01-31', { debit: 200_000 }),
    ]);
    const r = await s.registre('t1', { exerciceId: 'e1', dateReference: '2026-06-15' });
    const tva = nature(r as never, 'tva');
    expect(tva.retenu).toBe(500_000);
    expect(tva.reverse).toBe(0);
    // 300 000 serait le solde si le crédit avait été pris pour un versement.
    expect(tva.solde).toBe(500_000);
  });

  it('reste exact en SYCEBNL, dont le plan n’a pas de 4449 · l’exclusion y est inerte', async () => {
    const s = service([
      ligne('44410000', '2026-01-31', { credit: 500_000 }),
      ligne('44410000', '2026-02-15', { debit: 500_000 }),
    ]);
    const r = await s.registre('t1', { exerciceId: 'e1', dateReference: '2026-06-15' });
    const tva = nature(r as never, 'tva');
    expect(tva.retenu).toBe(500_000);
    expect(tva.reverse).toBe(500_000);
    expect(tva.solde).toBe(0);
  });

  it('la nature TVA porte bien la forme commune aux deux référentiels', () => {
    const tva = NATURES_RETENUES.find((n) => n.cle === 'tva')!;
    // `['444']` + exclusion plutôt que `['4441']` : la première forme couvre
    // encore un dossier SYSCOHADA qui n'aurait pas ouvert son 4441.
    expect(tva.comptes).toEqual(['444']);
    expect(tva.exclusions).toEqual(['4449']);
  });
});

/**
 * LE RÉGIME D'IMPÔT DU DOSSIER · l'avertissement le plus faux qu'on puisse
 * servir au mauvais référentiel.
 *
 * L'écran annonçait à TOUT dossier « l'exemption d'impôt sur les sociétés dont
 * bénéficie une ASBL régulièrement constituée ». L'article 5 de la loi
 * n° 23/053 ne l'accorde qu'à l'État, aux provinces, aux ETD, aux
 * établissements publics, aux coopératives agricoles de forme civile, aux
 * ASBL, aux EUP et ONG, et à certains établissements privés d'enseignement.
 * Une société commerciale y est au contraire soumise par sa forme même
 * (art. 3) : lui écrire l'inverse en tête de son registre fiscal est la pire
 * chose que cet état puisse faire.
 *
 * Rien ne cassait, là non plus : un avertissement faux s'affiche comme un vrai.
 */
describe('registre des retenues · le régime d’impôt suit le référentiel', () => {
  const params = { exerciceId: 'ex1' };

  it('annonce l’exemption d’IS à une ASBL et la redevabilité à une société', async () => {
    const asbl = await service([], 'SYCEBNL').registre('t1', params);
    expect(asbl.avertissements.join(' ')).toContain("L'exemption d'impôt sur les sociétés");
    expect(asbl.avertissements.join(' ')).not.toContain('est redevable');

    const societe = await service([], 'SYSCOHADA').registre('t2', params);
    expect(societe.avertissements.join(' ')).toContain("redevable de l'impôt sur les sociétés");
    expect(societe.avertissements.join(' ')).not.toContain("L'exemption d'impôt sur les sociétés");
  });

  it('garde des deux côtés la conclusion, qui est tout l’objet de l’état', async () => {
    for (const referentiel of ['SYCEBNL', 'SYSCOHADA'] as const) {
      const r = await service([], referentiel).registre('t1', params);
      // Payer ou ne pas payer son propre impôt ne dispense de rien de ce qu'on
      // retient pour le compte d'autrui.
      expect(`${referentiel}: ${r.avertissements.join(' ')}`).toContain("pour le compte d'autrui");
    }
  });

  it('sert à une société la réserve du prélèvement expatriés dans le bon sens', async () => {
    // Celle de l'ASBL dit que son assujettissement est une tension du texte ·
    // pour une société, « les entreprises individuelles ou sociétaires », ce
    // sont elles, et il n'y a rien à faire trancher.
    const asbl = await service([], 'SYCEBNL').registre('t1', params);
    expect(nature(asbl, 'prelevementExpatries').reserve).toContain('tension du texte');

    const societe = await service([], 'SYSCOHADA').registre('t2', params);
    const reserve = nature(societe, 'prelevementExpatries').reserve ?? '';
    expect(reserve).not.toContain('tension du texte');
    expect(reserve).toContain('art. 145');
    // Trois règles mortes avec l'abrogation de l'O.-L. 69/007 : le registre ne
    // doit pas les ressusciter, il doit dire qu'elles sont mortes.
    expect(reserve).toContain('69/007');
  });

  it('ne parle plus d’ASBL exonérée de TVA à un dossier assujetti', async () => {
    const asbl = await service([], 'SYCEBNL').registre('t1', params);
    expect(nature(asbl, 'tva').reserve).toContain('exonérée de TVA');

    const societe = await service([], 'SYSCOHADA').registre('t2', params);
    const reserve = nature(societe, 'tva').reserve ?? '';
    expect(reserve).toContain('assujettie de plein droit');
    expect(reserve).not.toContain('exonérée de TVA');
  });

  it('retombe sur la réserve commune quand il n’y a pas de variante', async () => {
    // `autresRetenues` n'a qu'une réserve, valable des deux côtés : elle doit
    // continuer d'être servie, et pas disparaître au motif qu'il n'y a pas de
    // `reserveSyscohada`.
    const societe = await service([], 'SYSCOHADA').registre('t2', params);
    expect(nature(societe, 'autresRetenues').reserve).toContain('retenue locative');
  });
});

describe('échéancier · l’article 47 ne vise pas les mêmes redevables selon son alinéa', () => {
  const params = { exerciceId: 'ex1' };
  const cles = async (referentiel: 'SYCEBNL' | 'SYSCOHADA') =>
    (await service([], referentiel).echeancierFiscal('t1', params)).echeances.map((e) => e.cle);

  it('réserve le relevé général de l’alinéa 1er aux entités qu’il énumère', async () => {
    // « Les provinces, les ETD, les services publics, les établissements
    // publics, les organismes semi-publics, les entreprises publiques, les
    // ASBL et les établissements d'utilité publique ». Une société commerciale
    // privée n'y figure pas · l'échéancier lui servait pourtant l'obligation
    // ET son amende de 500 000 FC.
    expect(await cles('SYCEBNL')).toContain('releveTrimestrielTiers');
    expect(await cles('SYSCOHADA')).not.toContain('releveTrimestrielTiers');
  });

  it('sert aux deux le relevé de l’alinéa 2, qui vise « les entreprises ET les associations »', async () => {
    // Restreint aux droits d'auteurs ou d'inventeurs versés aux membres ou
    // mandants · une assiette bien plus étroite que celle de l'alinéa 1er,
    // d'où une ligne distincte plutôt qu'un élargissement de la première.
    for (const referentiel of ['SYCEBNL', 'SYSCOHADA'] as const) {
      expect(`${referentiel}`).toBe(referentiel);
      expect(await cles(referentiel)).toContain('releveTrimestrielDroitsAuteur');
    }
  });

  it('sert aux deux l’article 47 ter, qui vise « exonérée ou non »', async () => {
    for (const referentiel of ['SYCEBNL', 'SYSCOHADA'] as const) {
      expect(await cles(referentiel)).toContain('listeFournisseurs');
    }
  });
});
