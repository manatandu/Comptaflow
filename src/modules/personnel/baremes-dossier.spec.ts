import { readFileSync } from 'fs';
import { join } from 'path';
import { BadRequestException } from '@nestjs/common';
import { StatutBulletinPaie } from '@prisma/client';
import { cotisations, RESERVE_BAREME_CABINET } from './cotisations-paie';
import { DERNIERE_DATE_LIVREE, annexesSmigDuDossier, lireValeurs, moisCouverts, motifRefusVersion, versionsDuDossier } from './baremes-dossier';
import { ANNEXES, RESERVE_GRILLE_CABINET, allocationFamilialeJournaliere, annexeDuCabinet, tauxJournalierDeLaClasse } from './bareme-smig';
import { mensuelMinimumDeLaClasse, quotiteSaisissable } from './quotite-saisissable';
import { BaremesPaieService } from './baremes-paie.service';
import { PrismaService } from '../../common/prisma.service';

const ONEM_1 = { bareme: 'ONEM', aPartirDu: '2027-03-01', reference: 'Arrêté ministériel n° 001/2027, article 1er', valeurs: { tauxPourCent: 0.8 } };

describe('Une version de barème s’ajoute, elle ne remplace rien', () => {
  it('accepte une version postérieure à la dernière livrée', () => {
    expect(motifRefusVersion(ONEM_1, [])).toBeNull();
  });

  it('refuse une version à la date de la dernière livrée ou avant', () => {
    expect(motifRefusVersion({ ...ONEM_1, aPartirDu: DERNIERE_DATE_LIVREE.ONEM }, [])).toMatch(/après la dernière connue/);
    expect(motifRefusVersion({ ...ONEM_1, aPartirDu: '2025-01-01' }, [])).toMatch(/après la dernière connue/);
  });

  it('refuse une version insérée avant une version du cabinet déjà posée', () => {
    expect(motifRefusVersion({ ...ONEM_1, aPartirDu: '2027-02-01' }, ['2027-03-01'])).toMatch(/du 2027-03-01/);
  });

  it('borne la CNSS au 1er janvier 2019, fin du régime transitoire (art. 10)', () => {
    expect(DERNIERE_DATE_LIVREE.CNSS).toBe('2019-01-01');
    expect(motifRefusVersion({ bareme: 'CNSS', aPartirDu: '2019-01-20', reference: 'Décret n° 99/2027', valeurs: {} }, [])).toMatch(/2019-01-01/);
  });

  it('refuse une seconde version dans le mois de la dernière', () => {
    expect(motifRefusVersion({ ...ONEM_1, aPartirDu: '2027-03-20' }, ['2027-03-01'])).toMatch(/un mois après/);
    expect(motifRefusVersion({ ...ONEM_1, aPartirDu: '2025-09-30' }, [])).toMatch(/un mois après/);
    expect(motifRefusVersion({ ...ONEM_1, aPartirDu: '2025-10-01' }, [])).toBeNull();
  });

  it('refuse l’IRPP, qui reste celui de la loi lue', () => {
    expect(motifRefusVersion({ ...ONEM_1, bareme: 'IRPP' }, [])).toMatch(/barème de l'IRPP/);
  });

  it('exige le texte qui fonde la version', () => {
    expect(motifRefusVersion({ ...ONEM_1, reference: '  ' }, [])).toMatch(/texte qui fonde/);
  });

  it('refuse une date impossible', () => {
    expect(motifRefusVersion({ ...ONEM_1, aPartirDu: '2027-02-30' }, [])).toMatch(/date d'effet/);
  });
});

describe('Les valeurs se lisent par barème', () => {
  it('refuse un taux nul ou au-delà de 100', () => {
    expect(lireValeurs('ONEM', { tauxPourCent: 0 }).ok).toBe(false);
    expect(lireValeurs('ONEM', { tauxPourCent: 101 }).ok).toBe(false);
    expect(lireValeurs('ONEM', { tauxPourCent: 100 }).ok).toBe(true);
  });

  it('exige les quatre taux CNSS', () => {
    expect(lireValeurs('CNSS', { prestationsAuxFamilles: 6.5, pensionsEmployeur: 5, pensionsTravailleur: 5 }).ok).toBe(false);
    expect(lireValeurs('CNSS', { prestationsAuxFamilles: 6.5, pensionsEmployeur: 5, pensionsTravailleur: 5, risquesProfessionnels: 1.5 }).ok).toBe(true);
  });

  it('exige des tranches INPP croissantes, la dernière ouverte', () => {
    const t = (priveParTranche: unknown) => lireValeurs('INPP', { publicPourCent: 4, priveParTranche });
    expect(t([{ jusqua: 50, tauxPourCent: 3 }, { jusqua: null, tauxPourCent: 2 }]).ok).toBe(true);
    expect(t([{ jusqua: 50, tauxPourCent: 3 }, { jusqua: 50, tauxPourCent: 2 }, { jusqua: null, tauxPourCent: 1 }]).ok).toBe(false);
    expect(t([{ jusqua: 50, tauxPourCent: 3 }, { jusqua: 300, tauxPourCent: 2 }]).ok).toBe(false);
    expect(t([]).ok).toBe(false);
  });

  it('ne garde que les clés du barème', () => {
    const l = lireValeurs('ONEM', { tauxPourCent: 1, intrus: 9 });
    expect(l.ok && l.valeurs).toEqual({ tauxPourCent: 1 });
  });
});

describe('Le moteur prend la version du cabinet à partir de sa date, avec sa réserve', () => {
  const versions = versionsDuDossier([
    { bareme: 'ONEM', aPartirDu: '2027-03-01', reference: 'Arrêté n° 001/2027', valeurs: { tauxPourCent: 0.8 } },
    { bareme: 'CNSS', aPartirDu: '2027-03-15', reference: 'Décret n° 27/001', valeurs: { prestationsAuxFamilles: 7, pensionsEmployeur: 6, pensionsTravailleur: 6, risquesProfessionnels: 2 } },
    { bareme: 'INPP', aPartirDu: '2027-03-01', reference: 'Arrêté INPP 2027', valeurs: { publicPourCent: 5, priveParTranche: [{ jusqua: null, tauxPourCent: 4 }] } },
  ]);
  const ligne = (mois: string, cle: string) =>
    cotisations(1_000_000, { moisDePaie: mois, versionsDossier: versions, natureEmployeurInpp: 'PRIVE', effectif: 10 }).lignes.find((l) => l.cle === cle)!;

  it('garde le taux livré le mois précédent', () => {
    expect(ligne('2027-02', 'onem').tauxPourCent).toBe(0.5);
    expect(ligne('2027-02', 'cnss-pension-travailleur').tauxPourCent).toBe(5);
    expect(ligne('2027-02', 'inpp').tauxPourCent).toBe(3.5);
    expect(ligne('2027-02', 'onem').reserve).not.toContain(RESERVE_BAREME_CABINET);
  });

  it('prend la version dès son mois d’effet, même datée du 15', () => {
    expect(ligne('2027-03', 'onem').tauxPourCent).toBe(0.8);
    expect(ligne('2027-03', 'cnss-pension-travailleur').tauxPourCent).toBe(6);
    expect(ligne('2027-03', 'inpp').tauxPourCent).toBe(4);
  });

  it('porte la référence du cabinet et la réserve sur chaque ligne', () => {
    for (const cle of ['onem', 'inpp', 'cnss-pf', 'cnss-pension-travailleur', 'cnss-rp']) {
      expect(ligne('2027-04', cle).reserve).toContain(RESERVE_BAREME_CABINET);
    }
    expect(ligne('2027-04', 'onem').source).toBe('Arrêté n° 001/2027');
    expect(ligne('2027-04', 'cnss-pf').source).toContain('Décret n° 27/001');
  });
});

describe('Le SMIG du cabinet · la grille tirée de la tension salariale', () => {
  const SMIG_27 = { bareme: 'SMIG', aPartirDu: '2027-01-01', reference: 'Arrêté d’ajustement n° 001/2027', valeurs: { smigJournalierFc: 25_000 } };

  it('accepte un SMIG après janvier 2026, jamais dans ce mois ni avant', () => {
    expect(DERNIERE_DATE_LIVREE.SMIG).toBe('2026-01-01');
    expect(motifRefusVersion(SMIG_27, [])).toBeNull();
    expect(motifRefusVersion({ ...SMIG_27, aPartirDu: '2026-01-15' }, [])).toMatch(/un mois après/);
  });

  it('refuse un montant mensuel pris pour un journalier', () => {
    expect(lireValeurs('SMIG', { smigJournalierFc: 21_500 * 26 }).ok).toBe(false);
    expect(lireValeurs('SMIG', { smigJournalierFc: 215_000 }).ok).toBe(true);
    expect(lireValeurs('SMIG', { smigJournalierFc: 0 }).ok).toBe(false);
  });

  it('refait les annexes du décret à l’identique à partir du seul SMIG', () => {
    for (const a of ANNEXES) {
      const refaite = annexeDuCabinet({ aPartirDu: `${a.duMoisDePaie}-01`, reference: 'x', smigJournalierFc: a.smigJournalierFc });
      expect(refaite.tauxParClasse).toEqual(a.tauxParClasse);
      expect(refaite.allocationFamilialeJournaliereFc).toBe(a.allocationFamilialeJournaliereFc);
      expect(refaite.contreValeurLogementJournaliereFc).toBe(a.contreValeurLogementJournaliereFc);
    }
  });

  it('prend la grille du cabinet dès son mois, et le dit', () => {
    const annexes = annexesSmigDuDossier([SMIG_27, ONEM_1]);
    expect(annexes).toHaveLength(1);
    expect(tauxJournalierDeLaClasse(1, '2026-12', annexes).valeur!.tauxFc).toBe(21_500);
    const c17 = tauxJournalierDeLaClasse(17, '2027-01', annexes);
    expect(c17.valeur!.tauxFc).toBe(250_000);
    expect(c17.explication).toContain(RESERVE_GRILLE_CABINET);
    expect(c17.explication).toContain('Arrêté d’ajustement n° 001/2027');
    expect(allocationFamilialeJournaliere('2027-02', 1, annexes).valeur!.parEnfantFc).toBe(925.93);
  });

  it('porte la grille jusqu’au minimum du contrat et à la quotité saisissable', () => {
    const annexes = annexesSmigDuDossier([SMIG_27]);
    expect(mensuelMinimumDeLaClasse('2027-01', 1, annexes)!.montantFc).toBe(25_000 * 26);
    expect(mensuelMinimumDeLaClasse('2027-01', 1)!.montantFc).toBe(21_500 * 26);
    const q = quotiteSaisissable({ moisDePaie: '2027-01', annexesSmig: annexes, remunerationFc: 2_000_000, classeProfessionnelle: 1 });
    expect(q.mensuelMinimumFc).toBe(25_000 * 26);
  });

  it('retient la grille la plus récente, quel que soit l’ordre de lecture', () => {
    const annexes = annexesSmigDuDossier([
      { ...SMIG_27, aPartirDu: '2028-01-01', valeurs: { smigJournalierFc: 30_000 } },
      SMIG_27,
    ]);
    expect(tauxJournalierDeLaClasse(1, '2028-03', annexes).valeur!.tauxFc).toBe(30_000);
    expect(tauxJournalierDeLaClasse(1, '2027-06', annexes).valeur!.tauxFc).toBe(25_000);
  });
});

describe('La CNSS datée par le décret n° 18/041', () => {
  const ligne = (mois: string, cle: string) => cotisations(1_000_000, { moisDePaie: mois }).lignes.find((l) => l.cle === cle);

  it('applique le régime transitoire de l’article 10 en novembre et décembre 2018', () => {
    expect(ligne('2018-12', 'cnss-pension-travailleur')!.tauxPourCent).toBe(3.5);
    expect(ligne('2018-11', 'cnss-pension-employeur')!.tauxPourCent).toBe(3.5);
    expect(ligne('2018-12', 'cnss-rp')!.tauxPourCent).toBe(1.5);
    expect(ligne('2018-12', 'cnss-pf')).toBeUndefined();
    expect(cotisations(1_000_000, { moisDePaie: '2018-12' }).abstentions.join(' ')).toMatch(/ex-province du Katanga/);
  });

  it('applique les taux des articles 2 et 3 dès janvier 2019', () => {
    expect(ligne('2019-01', 'cnss-pension-travailleur')!.tauxPourCent).toBe(5);
    expect(ligne('2019-01', 'cnss-pf')!.tauxPourCent).toBe(6.5);
    expect(ligne('2019-01', 'cnss-pf')!.source).toContain('articles 2 à 4 et 10');
  });

  it('s’abstient avant le 24 novembre 2018', () => {
    const v = cotisations(1_000_000, { moisDePaie: '2018-10' });
    expect(v.lignes.filter((l) => l.organisme === 'CNSS')).toHaveLength(0);
    expect(v.abstentions.join(' ')).toMatch(/24 novembre 2018/);
  });
});

describe('La période couverte par une version', () => {
  it('va de son mois jusqu’au mois de la suivante', () => {
    expect(moisCouverts('2027-03-24', '2027-09-01')).toEqual({ depuis: '2027-03', avant: '2027-09' });
    expect(moisCouverts('2027-03-24', null)).toEqual({ depuis: '2027-03', avant: null });
  });
});

describe('Le service', () => {
  const faire = (versions: { id: string; bareme: string; aPartirDu: string }[], bulletins: { numero: number; moisDePaie: string }[]) => {
    const bulletinFindMany = jest.fn().mockImplementation(({ where }) =>
      Promise.resolve(
        bulletins.filter(
          (b) => where.statut === StatutBulletinPaie.EMIS && b.moisDePaie >= where.moisDePaie.gte && (!where.moisDePaie.lt || b.moisDePaie < where.moisDePaie.lt),
        ),
      ),
    );
    const del = jest.fn().mockResolvedValue({});
    const create = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'n', ...data }));
    const prisma = {
      bulletinPaie: { findMany: bulletinFindMany },
      versionBaremePaie: {
        findMany: jest.fn().mockImplementation(({ where }) => Promise.resolve(versions.filter((v) => v.bareme === where.bareme))),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.id) return Promise.resolve(versions.find((v) => v.id === where.id) ?? null);
          const s = versions.filter((v) => v.bareme === where.bareme && v.aPartirDu > where.aPartirDu.gt).sort((a, b) => (a.aPartirDu < b.aPartirDu ? -1 : 1));
          return Promise.resolve(s[0] ?? null);
        }),
        create,
        delete: del,
      },
    } as unknown as PrismaService;
    return { svc: new BaremesPaieService(prisma), del, create, bulletinFindMany };
  };

  it('rend les bulletins déjà émis sur la période, sans refuser l’ajout', async () => {
    const { svc, create } = faire([], [{ numero: 4, moisDePaie: '2027-03' }, { numero: 2, moisDePaie: '2027-02' }]);
    const r = await svc.ajouter('t1', 'a@b.cd', ONEM_1 as never);
    expect(create).toHaveBeenCalled();
    expect(r.bulletinsDejaEmis).toEqual([{ numero: 4, moisDePaie: '2027-03' }]);
  });

  it('enregistre les valeurs normalisées et l’auteur', async () => {
    const { svc, create } = faire([], []);
    await svc.ajouter('t1', 'a@b.cd', { ...ONEM_1, valeurs: { tauxPourCent: 0.8, intrus: 1 } } as never);
    expect(create.mock.calls[0][0].data).toMatchObject({ tenantId: 't1', saisiPar: 'a@b.cd', valeurs: { tauxPourCent: 0.8 } });
    expect(create.mock.calls[0][0].data.valeurs).not.toHaveProperty('intrus');
  });

  it('refuse avant d’écrire une version insérée avant une autre du dossier', async () => {
    const { svc, create } = faire([{ id: 'v', bareme: 'ONEM', aPartirDu: '2027-06-01' }], []);
    await expect(svc.ajouter('t1', 'a', ONEM_1 as never)).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuse le retrait quand un bulletin émis porte un mois couvert', async () => {
    const { svc, del } = faire([{ id: 'v', bareme: 'ONEM', aPartirDu: '2027-03-01' }], [{ numero: 7, moisDePaie: '2027-05' }]);
    await expect(svc.supprimer('t1', 'v')).rejects.toThrow(/n° 7 \(2027-05\)/);
    expect(del).not.toHaveBeenCalled();
  });

  it('borne la période du retrait à la version suivante du même barème', async () => {
    const { svc, del } = faire(
      [{ id: 'v', bareme: 'ONEM', aPartirDu: '2027-03-01' }, { id: 'w', bareme: 'ONEM', aPartirDu: '2027-05-01' }],
      [{ numero: 7, moisDePaie: '2027-05' }],
    );
    await svc.supprimer('t1', 'v');
    expect(del).toHaveBeenCalledWith({ where: { id: 'v' } });
  });

  it('ne compte que les bulletins ÉMIS, jamais les annulés', async () => {
    const { svc, bulletinFindMany } = faire([{ id: 'v', bareme: 'ONEM', aPartirDu: '2027-03-01' }], []);
    await svc.supprimer('t1', 'v');
    expect(bulletinFindMany.mock.calls[0][0].where).toMatchObject({ tenantId: 't1', statut: StatutBulletinPaie.EMIS });
  });
});

describe('Le câblage', () => {
  it('simulerPaie passe les versions du dossier au moteur de cotisations', () => {
    const source = readFileSync(join(__dirname, 'personnel.service.ts'), 'utf8');
    const debut = source.indexOf('async simulerPaie(');
    const corps = source.slice(debut, source.indexOf('\n  }\n', debut));
    expect(corps).toMatch(/versionBaremePaie\.findMany\(\{\s*where: \{ tenantId \}/);
    expect(corps).toContain('versionsDossier: versionsDuDossier(versionsBaremes)');
    expect(corps).toContain('this.tauxLegalAllocationsFamiliales(dto, annexesSmig)');
    expect(corps).toMatch(/quotiteSaisissable\(\{\s*moisDePaie: dto\.moisDePaie,\s*annexesSmig,/);
  });

  it('confronter lit les grilles SMIG du dossier pour le minimum du contrat', () => {
    const source = readFileSync(join(__dirname, 'personnel.service.ts'), 'utf8');
    const debut = source.indexOf('async confronter(');
    const corps = source.slice(debut, source.indexOf('\n  }\n', debut));
    expect(corps).toMatch(/versionBaremePaie\.findMany\(\{\s*where: \{ tenantId, bareme: 'SMIG' \}/);
    expect(corps).toContain('verdictRemunerationMinimale(contrat, moisDeReference, annexesSmig)');
  });
});
