import { RetenuesService } from './retenues.service';
import { PrismaService } from '../../common/prisma.service';
import {
  AVERTISSEMENT_REVERSEMENT_ANTERIEUR,
  AVERTISSEMENT_REVERSEMENT_EXERCICE_SUIVANT,
  NATURES_RETENUES,
  OBLIGATIONS_DECLARATIVES,
  obligationsDeclarativesApplicables,
} from './correspondance-retenues';

/**
 * Les obligations SERVIES à un dossier SYCEBNL · toutes n'y sont pas. Les
 * quatre échéances de l'impôt sur les sociétés (déclaration du 30 avril et
 * trois acomptes) ne visent qu'une société, une ASBL en étant exemptée
 * (loi n° 23/053, art. 5). Compter `OBLIGATIONS_DECLARATIVES` en entier
 * reviendrait à réclamer à l'association l'impôt dont la loi la dispense.
 */
const OBLIGATIONS_SYCEBNL = obligationsDeclarativesApplicables('SYCEBNL' as never);

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
    mois: Array<{
      mois: string;
      retenu: number;
      /** Reversement IMPUTÉ au titre de ce mois. */
      reverse: number;
      /** Débit tel qu'il a été écrit ce mois-là · la trace de l'écriture. */
      reverseEcritures: number;
      solde: number;
      echeance: Date;
      enRetard: boolean;
    }>;
    reverseNonImpute: number;
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
    expect(e.echeances).toHaveLength(NATURES_RETENUES.length + OBLIGATIONS_SYCEBNL.length);
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
    expect(e.echeances.filter((x) => x.genre === 'DECLARATION')).toHaveLength(OBLIGATIONS_SYCEBNL.length);
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

/*
  LA CONSÉQUENCE, SUR L'IMPÔT DE L'ENTITÉ, D'UNE RETENUE COLLECTÉE ET NON
  REVERSÉE · le registre voyait le solde impayé, le résultat fiscal voyait la
  charge déduite, et rien ne rapprochait les deux.

  Loi n° 23/053, art. 20, dernier alinéa, parmi les conditions GÉNÉRALES de
  déductibilité des charges : « La société apporte la preuve de la déclaration
  et du paiement de la retenue correspondante pour les sommes donnant lieu à
  un prélèvement ou à une retenue à la source. »

  Ces tests figent autant ce que le registre DIT que ce qu'il refuse de dire :
  il nomme la charge exposée, il ne chiffre aucune réintégration · l'assiette
  de la charge n'est pas dans ce module. Et surtout, il ne le dit qu'à une
  entité RÉELLEMENT en défaut · voir le test du reversement fait à temps, qui
  est celui par lequel un signalement bâti sur le drapeau mensuel `enRetard`
  aurait accusé le contribuable à jour.
*/
describe('Retenue non reversée et déductibilité de la charge (loi n° 23/053, art. 20)', () => {
  const signalements = (r: { signalementsDeductibilite: unknown }) =>
    r.signalementsDeductibilite as Array<{
      cle: string;
      libelle: string;
      charge: string;
      montantEchuNonReverse: number;
      derniereEcheanceEchue: Date;
    }>;

  const ligneNature = (r: { natures: Array<{ cle: string }> }, cle: string) =>
    r.natures.find((n) => n.cle === cle) as unknown as {
      solde: number;
      moisEnRetard: number;
      retenuEchuNonReverse: number;
      derniereEcheanceEchue: Date | null;
      chargeSousConditionArticle20: string | null;
    };

  it('signale la charge exposée quand la retenue échue n’est pas reversée', async () => {
    // Prélèvement de 14 % sur un prestataire non-résident, retenu en mars et
    // jamais reversé · l'échéance du 15 avril est passée, la preuve du
    // paiement exigée par l'article 20 ne peut donc pas être rapportée.
    const s = service([ligne('44782000', '2026-03-31', { credit: 4_200_000 })], 'SYSCOHADA');
    const r = await s.registre('t1', { exerciceId: 'e1', dateReference: '2026-06-15' });
    const signale = signalements(r);
    expect(signale.map((x) => x.cle)).toEqual(['prestatairesNonResidents']);
    expect(signale[0].montantEchuNonReverse).toBe(4_200_000);
    expect(signale[0].derniereEcheanceEchue.toISOString().slice(0, 10)).toBe('2026-04-15');
    expect(signale[0].charge).toContain('non-résidents');
    const avertissement = r.avertissements.join(' ');
    expect(avertissement).toContain('article 20');
    expect(avertissement).toContain('preuve de la déclaration et du paiement');
  });

  /*
    LE TEST QUI TIENT TOUT LE RESTE · une retenue de mars reversée le 14 avril
    est reversée À TEMPS (loi de procédures fiscales, art. 22 bis : le 15 du
    mois suivant). Le registre rangeait ce débit dans le mois d'AVRIL, si bien
    que mars restait crédité et ressortait `enRetard` : le signalement de
    l'article 20 s'en gardait par une assiette cumulée tenue à part, mais
    l'écran, lui, annonçait « 1 mois en retard » à une entité à jour.

    Le rapprochement est corrigé À LA SOURCE · le reversement s'impute
    désormais sur le mois de la retenue qu'il éteint, et les deux lectures
    disent la même chose. Ce test le vérifie des deux côtés à la fois, ce qui
    est tout son intérêt : il tomberait si l'une des deux repartait.
  */
  it('ne signale RIEN quand la retenue a été reversée à temps, et le drapeau mensuel non plus', async () => {
    const s = service(
      [
        ligne('44782000', '2026-03-31', { credit: 4_200_000 }),
        ligne('44782000', '2026-04-14', { debit: 4_200_000 }),
      ],
      'SYSCOHADA',
    );
    const r = await s.registre('t1', { exerciceId: 'e1', dateReference: '2026-06-15' });
    expect(signalements(r)).toHaveLength(0);
    expect(r.avertissements.join(' ')).not.toContain('RETENUES ÉCHUES');
    const n = ligneNature(r, 'prestatairesNonResidents');
    expect(n.solde).toBe(0);
    expect(n.retenuEchuNonReverse).toBe(0);
    // Et le drapeau mensuel se tait, lui aussi · c'est la contradiction que
    // l'écran affichait, un solde nul en face d'un mois « en retard ».
    expect(n.moisEnRetard).toBe(0);
  });

  it('ne signale rien tant que l’échéance n’est pas passée · il n’y a pas encore de preuve à rapporter', async () => {
    // Retenue de juin, exigible le 15 juillet. Au 15 juin, l'entité n'est en
    // défaut de rien · crier au redressement ici serait faux.
    const s = service([ligne('44782000', '2026-06-12', { credit: 4_200_000 })], 'SYSCOHADA');
    const r = await s.registre('t1', { exerciceId: 'e1', dateReference: '2026-06-15' });
    expect(signalements(r)).toHaveLength(0);
    expect(ligneNature(r, 'prestatairesNonResidents').derniereEcheanceEchue).toBeNull();
  });

  it('ne retient que la part ÉCHUE, et impute le reversement sur les plus anciennes', async () => {
    // Mars est échu (15 avril), juin ne l'est pas encore (15 juillet). Le
    // reversement partiel de 400 000 s'impute sur mars : il reste 600 000 de
    // retenue échue non reversée, et la retenue de juin n'entre pas dans
    // l'assiette · personne n'a encore à en rendre compte.
    const s = service(
      [
        ligne('44782000', '2026-03-31', { credit: 1_000_000 }),
        ligne('44782000', '2026-04-10', { debit: 400_000 }),
        ligne('44782000', '2026-06-30', { credit: 700_000 }),
      ],
      'SYSCOHADA',
    );
    const r = await s.registre('t1', { exerciceId: 'e1', dateReference: '2026-07-05' });
    const n = ligneNature(r, 'prestatairesNonResidents');
    expect(n.solde).toBe(1_300_000);
    expect(n.retenuEchuNonReverse).toBe(600_000);
    expect(signalements(r)[0].montantEchuNonReverse).toBe(600_000);
  });

  it('ne rattache la condition ni à la TVA, ni aux cotisations sociales, ni à la retenue sur plus-values', async () => {
    // L'article 20 vise « les sommes donnant lieu à un prélèvement ou à une
    // retenue à la source ». Une cotisation sociale n'en est pas un, la TVA
    // n'est pas une charge, et la retenue sur plus-values ne suit aucune
    // charge · aucune des trois ne doit lever le signalement, même impayée.
    const s = service(
      [
        ligne('44400000', '2026-03-31', { credit: 900_000 }),
        ligne('43110000', '2026-03-31', { credit: 650_000 }),
        ligne('44785000', '2026-03-31', { credit: 300_000 }),
      ],
      'SYSCOHADA',
    );
    const r = await s.registre('t1', { exerciceId: 'e1', dateReference: '2026-06-15' });
    expect(signalements(r)).toHaveLength(0);
    for (const cle of ['tva', 'cnss', 'plusValues']) {
      const n = ligneNature(r, cle);
      // Impayées et échues, elles le sont bien · c'est la CONDITION qui ne
      // leur est pas rattachée, et non le retard qui leur manquerait.
      expect(n.retenuEchuNonReverse).toBeGreaterThan(0);
      expect(n.chargeSousConditionArticle20).toBeNull();
    }
  });

  it('AVERTIT sans chiffrer · il nomme la charge, ne calcule aucune réintégration', async () => {
    const s = service([ligne('44782000', '2026-03-31', { credit: 4_200_000 })], 'SYSCOHADA');
    const r = await s.registre('t1', { exerciceId: 'e1', dateReference: '2026-06-15' });
    const avertissement = r.avertissements.find((a) => a.includes('RETENUES ÉCHUES'))!;
    expect(avertissement).toContain('réintégration');
    expect(avertissement).toContain('applique aucun taux');
    expect(avertissement).toContain('Résultat fiscal');
    // Le seul montant porté est celui de la RETENUE échue · pas une assiette
    // de charge reconstituée, pas un impôt.
    expect(signalements(r)[0].montantEchuNonReverse).toBe(4_200_000);
    // Le montant est celui du signalement, mis en forme à la française.
    expect(avertissement).toContain((4_200_000).toLocaleString('fr-FR'));
    // Et la réserve du dernier mois, dont le reversement tombe sur l'exercice
    // suivant que ce registre ne lit pas.
    expect(avertissement).toContain('exercice suivant');
  });

  it('un dossier SYCEBNL est renvoyé à son exemption d’IS, et non à une réintégration', async () => {
    // Une condition de déductibilité d'une charge n'a d'effet que sur un
    // bénéfice imposable. Servir « réintégration au résultat fiscal » à une
    // ASBL exemptée (art. 5) serait la même faute que l'écran qui annonçait
    // l'exemption à une société commerciale, prise à l'envers.
    const s = service([ligne('44782000', '2026-03-31', { credit: 4_200_000 })], 'SYCEBNL');
    const r = await s.registre('t1', { exerciceId: 'e1', dateReference: '2026-06-15' });
    const avertissement = r.avertissements.find((a) => a.includes('RETENUES ÉCHUES'))!;
    expect(avertissement).toContain('article 5');
    expect(avertissement).toContain('007/CAB/MIN/FINANCES/2025');
    expect(avertissement).not.toContain('réintégration');
    // Le reversement, lui, reste dû des deux côtés.
    expect(avertissement).toContain('reste dû');
  });

  it('l’échéancier porte le même avertissement que le registre', async () => {
    const s = service([ligne('44782000', '2026-03-31', { credit: 4_200_000 })], 'SYSCOHADA');
    const e = await s.echeancierFiscal('t1', { exerciceId: 'e1', dateReference: '2026-06-15' });
    expect(e.avertissements.join(' ')).toContain('RETENUES ÉCHUES');
  });
});

/*
  LE REVERSEMENT SE RANGEAIT DANS LE MOIS DE SA PROPRE ÉCRITURE.

  Article 18 de la loi n° 004/2003 portant réforme des procédures fiscales,
  tel que modifié par la L.F. n° 23/056 du 10 décembre 2023, art. 24, et par
  la loi n° 23/052 du 30 novembre 2023, art. 1er : « Les retenues effectuées
  au titre d’Impôt sur le Revenu des Personnes Physiques par toute personne
  physique ou morale qui paye des revenus salariaux et revenus assimilés
  doivent être versées au plus tard le 15 du mois qui suit celui du versement
  de ces revenus aux bénéficiaires ou de leur mise à disposition. »
  (compilation DGI au 19 juillet 2026,
  `17-procedures-titre1-obligations-declaratives.md`, lignes 281 à 284.)

  Le texte donne une DATE LIMITE rattachée au mois de la retenue : un
  reversement du 14 avril éteint la dette de mars. Le registre, lui, rangeait
  ce débit dans avril, laissait mars crédité et le signalait en retard · une
  entité parfaitement à jour lisait « solde 0 » et « n mois en retard » sur le
  même écran.
*/
describe('Le reversement s’impute sur le mois de la retenue qu’il éteint (art. 18)', () => {
  it('une retenue de mars reversée le 14 avril ne laisse mars ni crédité ni en retard', async () => {
    const s = service([
      ligne('44720000', '2026-03-31', { credit: 350_000 }),
      ligne('44720000', '2026-04-14', { debit: 350_000 }),
    ]);
    const r = await s.registre('t1', { exerciceId: 'e1', dateReference: '2026-06-15' });
    const n = nature(r, 'irppSalaires');
    const mars = n.mois.find((m) => m.mois === '2026-03')!;
    expect(mars.reverse).toBe(350_000);
    expect(mars.solde).toBe(0);
    expect(mars.enRetard).toBe(false);
    expect(n.moisEnRetard).toBe(0);
  });

  it('douze mois de paie régulièrement reversés ne donnent AUCUN mois en retard', async () => {
    // Les montants CROISSENT d'un mois sur l'autre, et c'est ce qui rendait
    // le défaut spectaculaire : tant que la paie est stable, le débit du mois
    // annule le crédit du mois et le solde mensuel reste nul par accident.
    // Dès qu'elle bouge, chaque mois porte le résidu de l'écart et ressort en
    // retard, l'un après l'autre.
    const lignes = [];
    for (let mois = 1; mois <= 12; mois++) {
      const finDeMois = new Date(2026, mois, 0);
      lignes.push(
        ligne('44720000', finDeMois.toISOString().slice(0, 10), { credit: 100_000 * mois }),
      );
      // Reversé le 14 du mois suivant, la veille de l'échéance légale. Celui
      // de décembre tombe sur l'exercice d'après : il n'est pas ici.
      if (mois < 12) {
        lignes.push(ligne('44720000', `2026-${String(mois + 1).padStart(2, '0')}-14`, { debit: 100_000 * mois }));
      }
    }
    const r = await service(lignes).registre('t1', { exerciceId: 'e1', dateReference: '2026-12-20' });
    const n = nature(r, 'irppSalaires');
    expect(n.moisEnRetard).toBe(0);
    // Décembre reste dû · son échéance est au 15 janvier, elle n'est pas
    // passée, et c'est bien le solde de la nature.
    expect(n.solde).toBe(1_200_000);
    expect(n.mois.find((m) => m.mois === '2026-12')!.enRetard).toBe(false);
  });

  it('un solde nul et des mois en retard ne peuvent plus s’afficher ensemble', async () => {
    // L'invariant que l'écran violait. Il ne tient que parce que le
    // reversement s'impute sur les mois : tout reversé, rien en retard.
    const lignes = [];
    for (let mois = 1; mois <= 3; mois++) {
      const finDeMois = new Date(2026, mois, 0);
      lignes.push(ligne('44720000', finDeMois.toISOString().slice(0, 10), { credit: 100_000 * mois }));
      lignes.push(ligne('44720000', `2026-${String(mois + 1).padStart(2, '0')}-14`, { debit: 100_000 * mois }));
    }
    const r = await service(lignes).registre('t1', { exerciceId: 'e1', dateReference: '2026-06-15' });
    const n = nature(r, 'irppSalaires');
    expect(n.solde).toBe(0);
    expect(n.moisEnRetard).toBe(0);
    expect(r.totalDu).toBe(0);
  });

  it('impute un reversement partiel sur le mois le plus ancien, et garde la trace du débit', async () => {
    const s = service([
      ligne('44782000', '2026-03-31', { credit: 1_000_000 }),
      ligne('44782000', '2026-04-14', { debit: 400_000 }),
      ligne('44782000', '2026-04-30', { credit: 600_000 }),
    ]);
    const r = await s.registre('t1', { exerciceId: 'e1', dateReference: '2026-06-15' });
    const n = nature(r, 'prestatairesNonResidents');
    const mars = n.mois.find((m) => m.mois === '2026-03')!;
    const avril = n.mois.find((m) => m.mois === '2026-04')!;
    // Le plus ancien d'abord · mars reste dû de 600 000.
    expect(mars.reverse).toBe(400_000);
    expect(mars.solde).toBe(600_000);
    expect(mars.enRetard).toBe(true);
    // Rien n'est imputé sur avril, mais le débit qui y a été ÉCRIT reste
    // lisible · c'est la piste de l'écriture que l'imputation déplace.
    expect(avril.reverse).toBe(0);
    expect(avril.reverseEcritures).toBe(400_000);
    expect(avril.solde).toBe(600_000);
    expect(n.moisEnRetard).toBe(2);
    // L'arithmétique du compte, elle, ne bouge pas.
    expect(n.reverse).toBe(400_000);
    expect(n.solde).toBe(1_200_000);
  });

  it('le mois réellement impayé reste signalé · corriger n’est pas taire', async () => {
    const s = service([ligne('44782000', '2026-03-31', { credit: 4_200_000 })]);
    const r = await s.registre('t1', { exerciceId: 'e1', dateReference: '2026-06-15' });
    const n = nature(r, 'prestatairesNonResidents');
    expect(n.moisEnRetard).toBe(1);
    expect(n.mois.find((m) => m.mois === '2026-03')!.enRetard).toBe(true);
    expect(r.avertissements.join(' ')).toContain('RETENUES ÉCHUES');
  });

  it('dit le reversement qu’aucun mois de l’exercice n’absorbe, au lieu de le lisser', async () => {
    // Le reversement de janvier acquitte la retenue de décembre de l'exercice
    // PRÉCÉDENT, que cette requête ne voit pas. Il reste dans le total
    // reversé du compte, et dans aucun mois · l'écart de colonne est dit.
    const s = service([ligne('44720000', '2026-01-14', { debit: 250_000 })]);
    const r = await s.registre('t1', { exerciceId: 'e1', dateReference: '2026-06-15' });
    const n = nature(r, 'irppSalaires');
    expect(n.reverseNonImpute).toBe(250_000);
    expect(n.mois[0].reverse).toBe(0);
    expect(n.mois[0].reverseEcritures).toBe(250_000);
    expect(r.avertissements).toContain(AVERTISSEMENT_REVERSEMENT_ANTERIEUR);
  });

  it('avertit que le reversement de décembre peut vivre sur l’exercice suivant', async () => {
    // La seule fausse alerte que l'imputation ne peut pas lever : le
    // reversement du 14 janvier n'est pas dans l'exercice affiché.
    const s = service([ligne('44720000', '2026-12-31', { credit: 400_000 })]);
    const r = await s.registre('t1', { exerciceId: 'e1', dateReference: '2027-02-01' });
    expect(nature(r, 'irppSalaires').moisEnRetard).toBe(1);
    expect(r.avertissements).toContain(AVERTISSEMENT_REVERSEMENT_EXERCICE_SUIVANT);
  });

  it('ne crie pas la réserve d’exercice à un dossier qui n’a aucun mois signalé', async () => {
    const r = await service([ligne('44720000', '2026-06-30', { credit: 400_000 })]).registre('t1', {
      exerciceId: 'e1',
      dateReference: '2026-07-01',
    });
    expect(r.avertissements).not.toContain(AVERTISSEMENT_REVERSEMENT_EXERCICE_SUIVANT);
    expect(r.avertissements).not.toContain(AVERTISSEMENT_REVERSEMENT_ANTERIEUR);
  });
});

/*
  L'AMENDE DE L'ARTICLE 94 N'EST PLUS UN MONTANT UNIQUE.

  Article 94 de la loi n° 004/2003, « (modifié par l’O.-L. n° 13/005 du
  23 février 2013, par la L.F. n° 22/071 du 28 décembre 2022 et par la L.F.
  n° 23/056 du 10 décembre 2023, art. 29) » : « L’absence d’une déclaration ne
  servant pas au calcul de l’impôt est sanctionnée par une amende de :
  - 5.000.000,00 Francs congolais pour les grandes entreprises ;
  - 2.500.000,00 Francs congolais pour les moyennes entreprises et les
  associations sans but lucratif ; - 250.000,00 Francs congolais pour les
  entreprises de petite taille. Il faut entendre notamment par déclaration ne
  servant pas au calcul de l’impôt : - le relevé trimestriel des sommes
  versées aux tiers » (compilation DGI au 19 juillet 2026,
  `20-procedures-titre4-sanctions-fiscales-penales.md`, lignes 194 à 206).

  Les 500 000 FC servis jusqu'ici sont la rédaction d'AVANT la loi de finances
  n° 23/056, périmée depuis le 1er janvier 2024 : cinq fois trop bas pour une
  association, deux fois trop haut pour une entreprise de petite taille.
*/
describe('Sanction du relevé trimestriel non déposé (art. 94)', () => {
  it('sert la grille par TAILLE, et non les 500 000 FC de la rédaction abrogée', async () => {
    const e = await service([]).echeancierFiscal('t1', { exerciceId: 'e1', dateReference: '2026-05-02' });
    const releve = e.echeances.find((x) => x.cle === 'releveTrimestrielTiers')!;
    expect(releve.sanction).toContain('5 000 000');
    expect(releve.sanction).toContain('2 500 000');
    expect(releve.sanction).toContain('250 000');
    expect(releve.sanction).toContain('associations sans but lucratif');
    expect(releve.sanction).toContain('23/056');
    // La rédaction abrogée, mot pour mot, ne doit plus sortir.
    expect(releve.sanction).not.toContain('500 000 francs congolais pour une personne morale');
  });

  it('sert la même grille au relevé des droits d’auteurs, servi aux deux référentiels', async () => {
    for (const referentiel of ['SYCEBNL', 'SYSCOHADA']) {
      const e = await service([], referentiel).echeancierFiscal('t1', {
        exerciceId: 'e1',
        dateReference: '2026-05-02',
      });
      const releve = e.echeances.find((x) => x.cle === 'releveTrimestrielDroitsAuteur')!;
      expect(releve.sanction).toContain('2 500 000');
      expect(releve.sanction).not.toContain('500 000 francs congolais pour une personne morale');
    }
  });

  it('ne choisit AUCUN des trois montants · la taille de l’entité n’est pas dans le logiciel', async () => {
    const e = await service([]).echeancierFiscal('t1', { exerciceId: 'e1', dateReference: '2026-05-02' });
    const releve = e.echeances.find((x) => x.cle === 'releveTrimestrielTiers')!;
    expect(releve.sanction).toContain('ne connaît pas la taille');
  });
});

/*
  LE PRÉLÈVEMENT SUR LES REVENUS DE CAPITAUX MOBILIERS VERSÉS À DES
  NON-RÉSIDENTS · un chapitre entier créé par la loi de finances n° 25/060 du
  29 décembre 2025 (art. 40), et que le module ignorait.

  Art. 149 ter : « Le prélèvement est assis sur le montant brut des sommes
  payées ou mises à la disposition de leurs bénéficiaires, au titre de revenus
  de capitaux mobiliers versés par des sociétés établies en République
  Démocratique du Congo à des personnes morales ou physiques situées à
  l’étranger. » Art. 149 quater : « Le taux du prélèvement […] est fixé à 20 %
  du montant brut des revenus versés. » (compilation DGI au 19 juillet 2026,
  `06-loi23-053-titre4-7-communes-autres-abrogatoires.md`, lignes 218 à 228.)

  Art. 22 quater de la loi de procédures fiscales : « Les sociétés établies en
  République Démocratique du Congo qui paient des revenus des capitaux
  mobiliers versés à des personnes non-résidentes sont tenues de souscrire une
  déclaration, au plus tard le quinze du mois qui suit celui du paiement de
  ces revenus aux bénéficiaires ou de leur mise à disposition. »
  (`17-procedures-titre1-obligations-declaratives.md`, lignes 387 à 390.)
*/
describe('Prélèvement sur les capitaux mobiliers versés à des non-résidents', () => {
  it('porte la déclaration mensuelle de l’article 22 quater, au 15 du mois suivant', async () => {
    const e = await service([], 'SYSCOHADA').echeancierFiscal('t1', {
      exerciceId: 'e1',
      dateReference: '2026-05-02',
    });
    const o = e.echeances.find((x) => x.cle === 'prelevementCapitauxMobiliersNonResidents')!;
    expect(o.genre).toBe('DECLARATION');
    expect(o.periodicite).toBe('MENSUELLE');
    expect(o.date.toISOString().slice(0, 10)).toBe('2026-05-15');
    expect(o.baseLegale).toContain('22 quater');
    expect(o.baseLegale).toContain('149 quater');
    expect(o.baseLegale).toContain('20 %');
  });

  it('ne la sert PAS à une ASBL · l’article 149 ter ne vise que « des sociétés »', async () => {
    const cles = obligationsDeclarativesApplicables('SYCEBNL' as never).map((o) => o.cle);
    expect(cles).not.toContain('prelevementCapitauxMobiliersNonResidents');
    expect(obligationsDeclarativesApplicables('SYSCOHADA' as never).map((o) => o.cle)).toContain(
      'prelevementCapitauxMobiliersNonResidents',
    );
  });

  it('n’invente NI nature NI compte · le 44784 ne dit pas la résidence du bénéficiaire', async () => {
    // Le prélèvement se crédite sur le même 44784 que la retenue interne, et
    // rien dans un compte ne dit où réside le bénéficiaire. Ouvrir une
    // seconde nature reviendrait à couper un solde que rien ne permet de
    // partager · le module AVERTIT, et laisse la ventilation au comptable.
    expect(NATURES_RETENUES.filter((n) => n.comptes.includes('44784'))).toHaveLength(1);
    const r = await service([], 'SYSCOHADA').registre('t1', { exerciceId: 'e1' });
    expect(nature(r, 'capitauxMobiliers').reserve).toContain('RÉSIDENCE');
  });

  it('cite le chapitre non-résidents SANS inventer d’écart d’assiette avec l’interne', async () => {
    // L'article 120 renvoie au « montant net du revenu imposable déterminé
    // dans les conditions indiquées à l'article 81 », et l'article 81
    // détermine ce revenu « par le montant BRUT des dividendes versés » (1.)
    // et « par le montant BRUT des intérêts, arrérages et tous autres
    // produits » (4.). L'article 149 ter dit lui aussi le montant brut : les
    // deux prélèvements ont la MÊME assiette, et le module ne doit surtout
    // pas en poser deux.
    const r = await service([], 'SYSCOHADA').registre('t1', { exerciceId: 'e1' });
    const n = nature(r, 'capitauxMobiliers');
    expect(n.baseLegale).toContain('149 bis à 149 quinquies');
    expect(n.baseLegale).toContain('même assiette brute');
    expect(n.baseLegale).toContain('DEUX déclarations');
  });
});

/*
  PERSONNEL DOMESTIQUE ET SALARIÉS DE MICRO-ENTREPRISES · un forfait annuel
  reversé PAR QUOTITÉ TRIMESTRIELLE, et libératoire.

  Loi n° 23/053, art. 70, alinéa 2 : « Toutefois, les rémunérations versées au
  personnel domestique et aux salariés relevant des Micro-entreprises sont
  imposées suivant les taux forfaitaires fixés par voie d’Arrêté du Ministre
  ayant les Finances dans ses attributions. » (compilation DGI au 19 juillet
  2026, `05-loi23-053-titre3-irpp.md`, lignes 227 à 229.)

  Arrêté n° 019/CAB/MIN/FINANCES/2025 du 19 février 2025, art. 2 : « L'impôt
  est retenu à la source par l'employeur et reversé par quotité trimestrielle,
  au plus tard le 15 du mois qui suit la fin de chaque trimestre »
  (`fiscalite-rdc-socle/references/am-019-2025-taux-forfaitaires-personnel-domestique-micro-entreprises.md`,
  lignes 34 à 37 · 24 USD par an pour un salarié domestique, 36 USD pour un
  salarié de micro-entreprise, lignes 31 et 32 ; entrée en vigueur au
  1er janvier 2026, ligne 10).

  Art. 121, alinéa 2 : « Toutefois, la retenue opérée sur les rémunérations
  versées au personnel domestique et aux salariés relevant de l'Impôt sur le
  Revenu des Personnes Physiques de l'Administration des Micro-entreprises est
  libératoire de l'Impôt sur le Revenu des Personnes Physiques, pour autant
  que ces rémunérations constituent pour eux des revenus uniques »
  (`05-loi23-053-titre3-irpp.md`, lignes 966 à 970).
*/
describe('Le forfait trimestriel du personnel domestique et des micro-entreprises', () => {
  it('avertit, cite ses trois textes, et ne chiffre AUCUNE quotité', async () => {
    for (const referentiel of ['SYCEBNL', 'SYSCOHADA']) {
      const r = await service([], referentiel).registre('t1', { exerciceId: 'e1' });
      const reserve = nature(r, 'irppSalaires').reserve as string;
      expect(reserve).toContain('article 70, alinéa 2');
      expect(reserve).toContain('019/CAB/MIN/FINANCES/2025');
      expect(reserve).toContain('quotité trimestrielle');
      expect(reserve).toContain('LIBÉRATOIRE');
      expect(reserve).toContain('art. 121, alinéa 2');
      // Les forfaits sont dits en DOLLARS, comme l'arrêté les écrit · les
      // convertir supposerait un taux de change que ce module n'a pas.
      expect(reserve).toContain('24 dollars');
      expect(reserve).toContain('36 dollars');
      expect(reserve).toContain('CE QUE LE LOGICIEL NE SAIT PAS');
    }
  });

  it('date toujours la paie au 15 du mois suivant · il ne devine pas la catégorie du salarié', async () => {
    // Rien dans les comptes 4471 et 4472 ne distingue ces rémunérations : le
    // registre garde l'échéance de l'article 18 et le dit, plutôt que de
    // trancher au hasard entre deux régimes.
    const r = await service([ligne('44720000', '2026-03-31', { credit: 120_000 })]).registre('t1', {
      exerciceId: 'e1',
    });
    expect(nature(r, 'irppSalaires').mois[0].echeance.toISOString().slice(0, 10)).toBe('2026-04-15');
  });
});

/*
  LA SEULE LIGNE DU REGISTRE DONT L'ARTICLE CITÉ NE COUVRAIT PAS L'OBJET.

  « Contribution nationale » et « contribution nationale de solidarité » sont
  les intitulés des comptes 4473 et 4474 du plan de comptes, et non des
  impôts congolais : aucune occurrence dans le code général compilé au
  19 juillet 2026, dans la loi n° 004/2003, ni dans la loi de finances
  n° 25/060. Et l'article 18, qui était cité, ne vise que les retenues opérées
  par « toute personne physique ou morale qui paye des revenus salariaux et
  revenus assimilés » (`17-procedures-titre1-obligations-declaratives.md`,
  lignes 281 à 284) · il ne les fonde pas.
*/
describe('Contribution nationale · la base légale qui ne se vérifiait pas', () => {
  it('ne fonde plus la ligne sur l’article 18, qui ne la vise pas', async () => {
    const r = await service([]).registre('t1', { exerciceId: 'e1' });
    const n = nature(r, 'contributions');
    expect(n.baseLegale).not.toBe('Article 18 de la loi de procédures fiscales (retenues à la source).');
    expect(n.baseLegale).toContain("AUCUN PRÉLÈVEMENT DE DROIT CONGOLAIS N'EST IDENTIFIÉ");
    expect(n.baseLegale).toContain('revenus salariaux et revenus assimilés');
  });

  it('annonce sa date comme un REPÈRE, et non comme une échéance tirée d’un texte', async () => {
    const r = await service([]).registre('t1', { exerciceId: 'e1' });
    const n = nature(r, 'contributions');
    expect(n.echeance).toContain('repère');
    expect(n.reserve).toContain('ne le devine pas');
  });

  it('les douze autres natures citent toujours un texte qui les vise', async () => {
    // Le contrôle qui aurait attrapé la ligne fautive : chaque base légale
    // nomme un texte identifiable. `contributions` est la seule à dire
    // qu'elle n'en a pas, et elle le dit en toutes lettres.
    for (const n of NATURES_RETENUES) {
      if (n.cle === 'contributions') continue;
      expect(n.baseLegale).toMatch(/[Aa]rticle|[Aa]rt\.|loi|Loi|arrêté|Arrêté|décret|Décret|Ordonnance|conventions/);
    }
  });
});
