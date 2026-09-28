import { FormeJuridiqueEbnl, Referentiel } from '@prisma/client';
import { AccordCadreService } from './accord-cadre.service';
import { ControlesService } from '../controles/controles.service';
import { PrismaService } from '../../common/prisma.service';
import {
  articleTrenteSeptApplicable,
  etatAccordCadre,
  MODELE_KAHASHA,
  PART_MAIN_OEUVRE_LOCALE_MINIMALE,
} from './conditions-ong-etrangere';

/**
 * LE MANQUE ÉTAIT DÉCLARÉ PAR LE LOGICIEL LUI-MÊME · `exemption-is-ebnl.ts`
 * écrivait « OmegaX NE TIENT PAS l'accord-cadre ». Il se ferme ici.
 */
type Faux = Record<string, unknown>;

describe('Périmètre de l’article 37 · la sous-section ne vise que l’ONG étrangère', () => {
  it('ne vise QUE l’organisation non gouvernementale de droit étranger', () => {
    expect(articleTrenteSeptApplicable(FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE, true)).toBe(true);
    // Une ONG de droit CONGOLAIS relève de la sous-section I (art. 36) · elle
    // ne conclut pas d'accord-cadre.
    expect(articleTrenteSeptApplicable(FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE, false)).toBe(false);
    // Et « ONG » n'est pas synonyme d'ASBL · art. 35.
    for (const forme of [
      FormeJuridiqueEbnl.ASSOCIATION,
      FormeJuridiqueEbnl.ASSOCIATION_CONFESSIONNELLE,
      FormeJuridiqueEbnl.ETABLISSEMENT_UTILITE_PUBLIQUE,
      FormeJuridiqueEbnl.UNITE_GESTION_PROJET,
    ]) {
      expect(articleTrenteSeptApplicable(forme, true)).toBe(false);
    }
  });

  it('les dix ans et les six mois portent leur ORIGINE · un modèle, pas la loi', () => {
    // C'est le piège du chantier. L'art. 37 ne fixe AUCUNE durée ; les dix ans
    // renouvelables par tacite reconduction avec préavis de six mois viennent
    // de l'article IX du MODÈLE annexé au guide Kahasha. Les présenter comme
    // une règle de droit ferait lire sur dix ans un accord conclu pour trois.
    expect(MODELE_KAHASHA.dureeAnnees).toBe(10);
    expect(MODELE_KAHASHA.preavisMois).toBe(6);
    expect(MODELE_KAHASHA.source).toMatch(/MODÈLE/);
    expect(MODELE_KAHASHA.source).toMatch(/n['’]est PAS une règle de la loi/);
  });

  it('le seuil de main-d’œuvre locale est celui de l’article · 60 %', () => {
    expect(PART_MAIN_OEUVRE_LOCALE_MINIMALE).toBe(60);
  });
});

const base = {
  dateSignature: new Date('2016-03-01'),
  dureeAnnees: 10,
  preavisMois: 6,
  denonceLe: null as Date | null,
};

describe('État d’un accord · une période écoulée n’est pas une fin', () => {
  it('sans tacite reconduction, la période écoulée EST la fin', () => {
    const e = etatAccordCadre({
      ...base,
      taciteReconduction: false,
      reference: new Date('2027-06-01'),
    });
    expect(e.finDePeriode.toISOString().slice(0, 10)).toBe('2026-03-01');
    expect(e.periodeEcoulee).toBe(true);
    expect(e.enTaciteReconduction).toBe(false);
  });

  it('AVEC tacite reconduction, l’accord repart pour une période · jamais « expiré »', () => {
    // Même forme que la prorogation de plein droit du mandat de l'auditeur
    // (SYCEBNL art. 22), rencontrée au chantier précédent. Annoncer « accord
    // expiré » ici serait un signalement faux.
    const e = etatAccordCadre({
      ...base,
      taciteReconduction: true,
      reference: new Date('2027-06-01'),
    });
    expect(e.finDePeriode.toISOString().slice(0, 10)).toBe('2036-03-01');
    expect(e.periodeEcoulee).toBe(false);
    expect(e.enTaciteReconduction).toBe(true);
  });

  it('une DÉNONCIATION arrête la reconduction · le seul fait qui l’arrête', () => {
    const e = etatAccordCadre({
      ...base,
      taciteReconduction: true,
      denonceLe: new Date('2025-09-01'),
      reference: new Date('2027-06-01'),
    });
    expect(e.enTaciteReconduction).toBe(false);
    expect(e.periodeEcoulee).toBe(true);
  });

  it('rend le DERNIER JOUR POUR DÉNONCER · la seule date encore utilisable', () => {
    const e = etatAccordCadre({ ...base, taciteReconduction: true, reference: new Date('2020-01-01') });
    expect(e.finDePeriode.toISOString().slice(0, 10)).toBe('2026-03-01');
    expect(e.dernierJourPourDenoncer!.toISOString().slice(0, 10)).toBe('2025-09-01');
  });

  // AUDIT FINAL F8 · le 31 mars moins un mois tombait au 3 mars.
  it('borne la fin de période et le dernier jour pour dénoncer à la fin du mois', () => {
    const e = etatAccordCadre({
      dateSignature: new Date('2024-02-29'),
      dureeAnnees: 2,
      preavisMois: 1,
      denonceLe: null,
      taciteReconduction: false,
      reference: new Date('2025-01-01'),
    });
    const f = etatAccordCadre({
      dateSignature: new Date('2024-03-31'),
      dureeAnnees: 2,
      preavisMois: 1,
      denonceLe: null,
      taciteReconduction: false,
      reference: new Date('2025-01-01'),
    });
    expect([e.finDePeriode, f.dernierJourPourDenoncer!].map((d) => d.toISOString().slice(0, 10))).toEqual([
      '2026-02-28',
      '2026-02-28',
    ]);
  });

  it('sans préavis stipulé, aucune date n’est inventée', () => {
    const e = etatAccordCadre({
      ...base,
      preavisMois: null,
      taciteReconduction: true,
      reference: new Date('2020-01-01'),
    });
    expect(e.dernierJourPourDenoncer).toBeNull();
  });
});

// ---------------------------------------------------------------------------

function service(forme: FormeJuridiqueEbnl, droitEtranger: boolean, accords: Faux[] = []) {
  const ecrit: Faux[] = [];
  const prisma = {
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 't', formeJuridique: forme, droitEtranger }),
    },
    accordCadrePlan: {
      findMany: jest.fn().mockResolvedValue(accords),
      findFirst: jest.fn().mockResolvedValue(accords[0] ?? null),
      create: jest.fn().mockImplementation(({ data }: { data: Faux }) => {
        ecrit.push(data);
        return Promise.resolve({ id: 'a1', ...data });
      }),
      update: jest.fn().mockImplementation(({ data }: { data: Faux }) => {
        ecrit.push(data);
        return Promise.resolve({ id: 'a1', ...data });
      }),
    },
  } as Faux;
  return { svc: new AccordCadreService(prisma as unknown as PrismaService), ecrit };
}

const accordValide = {
  reference: 'AC/PLAN/2026/014',
  dateSignature: '2026-03-01',
  dureeAnnees: 10,
  taciteReconduction: true,
  preavisMois: 6,
};

describe('Enregistrement · ce que l’article 37 refuse', () => {
  it('enregistre pour une ONG de droit étranger', async () => {
    const { svc, ecrit } = service(FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE, true);
    await svc.enregistrer('t', accordValide);
    expect(ecrit[0].dureeAnnees).toBe(10);
    expect(ecrit[0].taciteReconduction).toBe(true);
  });

  it('REFUSE à tout dossier que la sous-section II ne vise pas', async () => {
    for (const [forme, etranger] of [
      [FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE, false],
      [FormeJuridiqueEbnl.ASSOCIATION, true],
      [FormeJuridiqueEbnl.ASSOCIATION_CONFESSIONNELLE, true],
    ] as const) {
      const { svc } = service(forme, etranger);
      await expect(svc.enregistrer('t', accordValide)).rejects.toThrow(/DROIT ÉTRANGER|art\. 37/);
    }
  });

  it('la DURÉE est saisie · le refus cite l’origine des dix ans', async () => {
    const { svc } = service(FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE, true);
    await expect(svc.enregistrer('t', { ...accordValide, dureeAnnees: 0 })).rejects.toThrow(/MODÈLE/);
  });

  it('la part de main-d’œuvre EXIGE sa source · OmegaX ne la calcule pas', async () => {
    const { svc, ecrit } = service(FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE, true, [
      { id: 'a1', tenantId: 't' },
    ]);
    await expect(
      svc.declarerMainOeuvre('t', 'a1', { part: 72, source: '  ', date: '2026-12-31' }),
    ).rejects.toThrow(/source du relevé est exigée/);
    await svc.declarerMainOeuvre('t', 'a1', {
      part: 72,
      source: 'Registre du personnel au 31/12/2026',
      date: '2026-12-31',
    });
    expect(ecrit[0].sourceMainOeuvre).toBe('Registre du personnel au 31/12/2026');
  });

  it('une dénonciation sans motif est refusée', async () => {
    const { svc } = service(FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE, true, [
      { id: 'a1', tenantId: 't' },
    ]);
    await expect(svc.denoncer('t', 'a1', { denonceLe: '2027-01-01', motif: ' ' })).rejects.toThrow(
      /motif de la dénonciation/,
    );
  });

  it('un dossier hors périmètre rend `applicable: false` et AUCUN accord', async () => {
    // L'écran doit pouvoir dire « ce dossier n'est pas concerné » plutôt que
    // d'afficher un formulaire vide qui ressemble à un manquement.
    const { svc } = service(FormeJuridiqueEbnl.ASSOCIATION, false, [{ id: 'a1' }]);
    const etat = await svc.etat('t');
    expect(etat.applicable).toBe(false);
    expect(etat.accords).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------

function serviceControles(
  forme: FormeJuridiqueEbnl,
  droitEtranger: boolean,
  accords: Faux[],
) {
  const prisma = {
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ex',
        dateDebut: new Date('2027-01-01'),
        dateFin: new Date('2027-12-31'),
        dateArreteComptes: new Date('2028-03-31'),
      }),
    },
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 't',
        referentiel: Referentiel.SYCEBNL,
        formeJuridique: forme,
        droitEtranger,
        formeJuridiqueSyscohada: null,
      }),
    },
    ecriture: { findMany: jest.fn().mockResolvedValue([]) },
    compte: { findMany: jest.fn().mockResolvedValue([]) },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
    exoneration: { findMany: jest.fn().mockResolvedValue([]) },
    manuelProcedures: { findFirst: jest.fn().mockResolvedValue(null) },
    conventionFinancement: { findMany: jest.fn().mockResolvedValue([]) },
    mandatAuditeur: { findMany: jest.fn().mockResolvedValue([]) },
    accordCadrePlan: { findMany: jest.fn().mockResolvedValue(accords) },
    immobilisation: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  } as Faux;
  return new ControlesService(prisma as unknown as PrismaService);
}

const anomalie = async (code: string, forme: FormeJuridiqueEbnl, droitEtranger: boolean, accords: Faux[]) => {
  const rapport = await serviceControles(forme, droitEtranger, accords).analyser('t', 'ex');
  return rapport.anomalies.find((a) => a.code === code);
};

const ONG_ETR = FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE;

describe('Le contrôle de l’article 37', () => {
  it('signale l’absence d’accord-cadre pour une ONG de droit étranger', async () => {
    const a = await anomalie('ACCORD_CADRE_PLAN_ABSENT', ONG_ETR, true, []);
    expect(a).toBeDefined();
    expect(a!.gravite).toBe('AVERTISSEMENT');
    expect(a!.consequence).toMatch(/art\. 37/);
  });

  it('SE TAIT hors périmètre · une association ne conclut pas d’accord-cadre', async () => {
    // § 10 bis · c'est la borne du texte, et l'oublier ferait corriger à un
    // cabinet un manquement qui n'existe pas.
    expect(await anomalie('ACCORD_CADRE_PLAN_ABSENT', FormeJuridiqueEbnl.ASSOCIATION, true, [])).toBeUndefined();
    expect(await anomalie('ACCORD_CADRE_PLAN_ABSENT', ONG_ETR, false, [])).toBeUndefined();
  });

  it('un accord en TACITE RECONDUCTION n’est jamais signalé échu', async () => {
    const reconduit = [
      {
        id: 'a',
        reference: 'AC/1',
        dateSignature: new Date('2010-03-01'),
        dureeAnnees: 10,
        taciteReconduction: true,
        preavisMois: 6,
        denonceLe: null,
        partMainOeuvreLocale: null,
        sourceMainOeuvre: null,
      },
    ];
    expect(await anomalie('ACCORD_CADRE_PLAN_ECHU', ONG_ETR, true, reconduit)).toBeUndefined();
    expect(await anomalie('ACCORD_CADRE_PLAN_ABSENT', ONG_ETR, true, reconduit)).toBeUndefined();
  });

  it('SANS tacite reconduction, la période écoulée est signalée', async () => {
    const echu = [
      {
        id: 'a',
        reference: 'AC/2',
        dateSignature: new Date('2010-03-01'),
        dureeAnnees: 10,
        taciteReconduction: false,
        preavisMois: null,
        denonceLe: null,
        partMainOeuvreLocale: null,
        sourceMainOeuvre: null,
      },
    ];
    const a = await anomalie('ACCORD_CADRE_PLAN_ECHU', ONG_ETR, true, echu);
    expect(a).toBeDefined();
    expect(a!.gravite).toBe('AVERTISSEMENT');
  });

  it('une part DÉCLARÉE sous 60 % est signalée, une part ABSENTE ne l’est pas', async () => {
    // Une part absente n'est pas une part insuffisante · le contraire
    // accuserait tout dossier qui n'a rien saisi, OmegaX n'ayant aucune paie.
    const avec = (part: number | null) => [
      {
        id: 'a',
        reference: 'AC/3',
        dateSignature: new Date('2026-03-01'),
        dureeAnnees: 10,
        taciteReconduction: true,
        preavisMois: 6,
        denonceLe: null,
        partMainOeuvreLocale: part,
        sourceMainOeuvre: part === null ? null : 'Registre du personnel',
      },
    ];
    expect(await anomalie('MAIN_OEUVRE_LOCALE_SOUS_SEUIL', ONG_ETR, true, avec(null))).toBeUndefined();
    expect(await anomalie('MAIN_OEUVRE_LOCALE_SOUS_SEUIL', ONG_ETR, true, avec(72))).toBeUndefined();
    const a = await anomalie('MAIN_OEUVRE_LOCALE_SOUS_SEUIL', ONG_ETR, true, avec(41));
    expect(a).toBeDefined();
    expect(a!.consequence).toMatch(/60% au minimum/);
    expect(a!.consequence).toMatch(/ne calcule pas ce chiffre/);
  });
});

describe('F146 · le registre du personnel PROPOSE la part, il ne la substitue pas', () => {
  function avecRegistre(salaries: Faux[]) {
    const { svc, ecrit } = service(FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE, true, [
      { id: 'a1', tenantId: 't', dateSignature: new Date('2026-03-01'), dureeAnnees: 10, taciteReconduction: true, preavisMois: 6, denonceLe: null, partMainOeuvreLocale: 55 },
    ]);
    const prisma = (svc as unknown as { prisma: Faux }).prisma;
    // Audit final F259, reste · l'effectif se compte par la base. La doublure
    // honore la borne du dossier ET le filtre du contrat en vigueur (dossier,
    // entrée, fin, type), un salarié comptant une fois quel que soit le nombre
    // de ses contrats.
    type Contrat = { tenantId: string; type: string; dateEntreeEnVigueur: Date; dateFin: Date | null };
    type Filtre = { tenantId: string; dateEntreeEnVigueur: { lte: Date }; OR: unknown[]; type?: string };
    const enVigueur = (c: Contrat, f: Filtre) =>
      c.tenantId === f.tenantId &&
      c.dateEntreeEnVigueur <= f.dateEntreeEnVigueur.lte &&
      (c.dateFin === null || c.dateFin >= f.dateEntreeEnVigueur.lte) &&
      (f.type === undefined || c.type === f.type);
    type Arg = { where: { tenantId: string; contrats: { some: Filtre } } };
    const retenus = ({ where }: Arg) =>
      (salaries as { tenantId: string; contrats: Contrat[] }[]).filter(
        (s) => s.tenantId === where.tenantId && s.contrats.some((c) => enVigueur(c, where.contrats.some)),
      );
    prisma.salarie = {
      groupBy: jest.fn((args: Arg & { by: string[] }) => {
        const groupes = new Map<string, Faux & { _count: { _all: number } }>();
        for (const s of retenus(args) as Faux[]) {
          const cle = Object.fromEntries(args.by.map((k) => [k, s[k] ?? null]));
          const g = groupes.get(JSON.stringify(cle)) ?? { ...cle, _count: { _all: 0 } };
          g._count._all += 1;
          groupes.set(JSON.stringify(cle), g);
        }
        return Promise.resolve([...groupes.values()]);
      }),
      count: jest.fn((args: Arg) => Promise.resolve(retenus(args).length)),
    };
    return { svc, ecrit };
  }
  const salarie = (id: string, nationalite: string | null) => ({
    id,
    tenantId: 't',
    sexe: 'MASCULIN',
    nationalite,
    contrats: [
      { tenantId: 't', type: 'DUREE_INDETERMINEE', dateEntreeEnVigueur: new Date('2026-01-05'), dateFin: null },
    ],
  });

  it('l’état porte la part du registre, sa source, et laisse la part déclarée intacte', async () => {
    const { svc } = avecRegistre([salarie('s1', 'Congolaise'), salarie('s2', 'Congolaise'), salarie('s3', 'Belge'), salarie('s4', 'RDC')]);
    const etat = await svc.etat('t', { dateReference: '2026-12-31' });
    expect(etat.propositionMainOeuvre).toMatchObject({ part: 75, effectif: 4, nationaux: 3, source: 'Registre du personnel au 2026-12-31' });
    expect(etat.accords[0].partMainOeuvreLocale).toBe(55);
  });

  it('une nationalité manquante ne propose rien, et le dit', async () => {
    const { svc } = avecRegistre([salarie('s1', 'Congolaise'), salarie('s2', null)]);
    const etat = await svc.etat('t', { dateReference: '2026-12-31' });
    expect(etat.propositionMainOeuvre?.part).toBeNull();
    expect(etat.propositionMainOeuvre?.reserve).toMatch(/1 salarié\(s\) de l'effectif n'ont pas de nationalité/);
  });

  it('un dossier hors périmètre ne lit pas le registre', async () => {
    const { svc } = service(FormeJuridiqueEbnl.ASSOCIATION, false);
    expect((await svc.etat('t')).propositionMainOeuvre).toBeNull();
  });
});
