import { Prisma } from '@prisma/client';
import { DevisesService, PROVISION_SYCEBNL, PROVISION_SYSCOHADA, ajusterProvisions, motifRefusDeclarationOuverture, versionEnVigueur, MOTIF_VERROU_PROVISION } from './devises.service';
import { FAMILLES_PROVISION_CHANGE } from '../consolidation/cumul-consolidation';
import { PLAN_COMPTES_SYCEBNL } from '../comptes/compte-seed';
import { PLAN_COMPTES_SYSCOHADA } from '../comptes/compte-seed-syscohada';

/**
 * LIGNE A5 DU SUIVI · LA PROVISION POUR PERTES DE CHANGE S'AJUSTE, ELLE NE
 * S'EMPILE PAS (relevé CPCC C1, décision de Manasse du 2026-10-02).
 *
 * AUDCIF Titre VIII ch. 22 § 2.3 · « La provision pour pertes de change de fin
 * d'exercice est ajustée pour tenir compte des opérations dénouées au cours de
 * l'exercice ». Fiche du compte 19 des deux plans · « réajusté à la clôture
 * de chaque exercice soit par dotations supplémentaires, soit par reprises des
 * provisions antérieures ».
 *
 * Le module dotait la provision ENTIÈRE à chaque clôture sans lire celle déjà
 * en place, et l'extourne ne contre-passe que les 478 et 479 · une perte de
 * 100 000 toujours de 100 000 l'année suivante finissait à 200 000 au passif,
 * et une créance encaissée gardait sa provision pour toujours. Chaque
 * équilibre tenait, la balance bouclait : rien ne le montrait en aval.
 *
 * La doublure tient un GRAND LIVRE · les écritures passées par le service
 * sont relues par les réévaluations suivantes, comme en base.
 */

type Ligne = { compte: string; debit?: number; credit?: number };
interface Ecrite {
  id: string;
  exerciceId: string;
  libelle: string;
  lignes: Ligne[];
  /** À-nouveau de l'exercice (bilan importé, report) · hors des écritures de l'exercice. */
  aNouveau?: boolean;
}

const EXERCICES = {
  n: { id: 'n', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31'), statut: 'OUVERT' },
  n1: { id: 'n1', dateDebut: new Date('2027-01-01'), dateFin: new Date('2027-12-31'), statut: 'OUVERT' },
  n2: { id: 'n2', dateDebut: new Date('2028-01-01'), dateFin: new Date('2028-12-31'), statut: 'OUVERT' },
} as const;

/**
 * Le verrou des gestes, en mémoire · la clé unique du dossier rend P2002 au
 * second, comme la base. Rien n'attend, rien n'est retenu.
 */
function verrouEnMemoire() {
  const lignes = new Map<string, { id: string; echeance: Date; geste?: string; createdAt?: Date }>();
  let n = 0;
  return {
    findFirst: jest.fn(({ where }: { where: { tenantId: string } }) => {
      const l = lignes.get(where.tenantId);
      return Promise.resolve(l ? { geste: l.geste ?? 'REEVALUATION', createdAt: l.createdAt ?? new Date('2027-02-01T10:00:00Z'), echeance: l.echeance } : null);
    }),
    deleteMany: jest.fn(({ where }: { where: { tenantId: string; id?: string; echeance?: { lt: Date } } }) => {
      const l = lignes.get(where.tenantId);
      if (l && (!where.id || where.id === l.id) && (!where.echeance || l.echeance.getTime() < where.echeance.lt.getTime())) {
        lignes.delete(where.tenantId);
      }
      return Promise.resolve({ count: 0 });
    }),
    create: jest.fn(({ data }: { data: { tenantId: string; echeance: Date; geste: string } }) => {
      if (lignes.has(data.tenantId)) {
        return Promise.reject(new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }));
      }
      const l = { id: `verrou-${++n}`, echeance: data.echeance, geste: data.geste, createdAt: new Date() };
      lignes.set(data.tenantId, l);
      return Promise.resolve({ id: l.id });
    }),
    lignes,
  };
}

/** Une position en devise, telle que l'exercice la porte (historique, avant écart). */
interface Position {
  compte: string;
  debit: number;
  credit: number;
  usd: number;
}

interface Declaration {
  compteProvision: string;
  montant: number;
  dateReference: Date;
}

/**
 * L'à-nouveau d'un exercice · VALIDEE (livre-journal) ou BROUILLARD (bilan
 * d'ouverture importé, à-nouveau provisoire), et son solde créditeur par
 * racine de provision. Sans à-nouveau, le service reconstitue le report de
 * l'exercice précédent depuis les écritures de la doublure.
 */
interface ANouveau {
  statut: 'VALIDEE' | 'BROUILLARD';
  soldes: Record<string, number>;
  /** À-nouveau PROVISOIRE d'OmegaX (`estANouveauProvisoire`) · il cède la place à la clôture précédente. */
  provisoire?: boolean;
}

function dossier(
  referentiel: 'SYSCOHADA' | 'SYCEBNL',
  options: {
    horsReevaluation?: number;
    /** Lignes hors module dans un exercice ANTÉRIEUR encore ouvert (cinquième passe, mineur 3). */
    horsAnterieurs?: number;
    declarations?: Declaration[];
    aNouveau?: Partial<Record<'n' | 'n1' | 'n2', ANouveau>>;
  } = {},
) {
  const ecrites: Ecrite[] = [];
  const statuts: Record<string, string> = { n: 'OUVERT', n1: 'OUVERT', n2: 'OUVERT' };
  const declarations: Declaration[] = [...(options.declarations ?? [])];
  // Une horloge qui avance à chaque geste · « enregistrée après » se compare sans ex aequo.
  let instant = Date.parse('2027-02-01');
  const horloge = () => new Date((instant += 1000));
  const reevaluations: { id: string; exerciceId: string; dateReevaluation: Date; ecritureEcartsId?: string; ecritureProvisionId?: string }[] = [];
  const positions: Record<string, Position[]> = { n: [], n1: [], n2: [] };
  const cours: Record<string, number> = {};
  const agregats: unknown[] = [];

  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue({ referentiel }) },
    // Le verrou des gestes · une ligne par dossier, clé unique (P2002 au second).
    // Aucune transaction n'est ouverte pour le tenir · `$transaction` le prouve.
    $transaction: jest.fn(),
    verrouProvisionChange: verrouEnMemoire(),
    exercice: {
      // Deux questions · l'ordre des réévaluations (antérieurs encore ouverts),
      // et tous les exercices du dossier (ouverture récursive).
      findMany: jest.fn(({ where }: { where: { dateFin?: { lt: Date }; statut?: { not: string } } }) => {
        const tous = Object.values(EXERCICES).sort((a, b) => a.dateDebut.getTime() - b.dateDebut.getTime());
        if (!where.dateFin) return Promise.resolve(tous);
        expect(where.statut).toEqual({ not: 'CLOTURE' });
        return Promise.resolve(
          tous.filter((e) => statuts[e.id] !== 'CLOTURE' && e.dateFin.getTime() < where.dateFin!.lt.getTime()),
        );
      }),
      // Honore les trois questions du service · par identifiant, par début
      // (une déclaration se date au début d'un exercice), et le précédent.
      findFirst: jest.fn(({ where }: { where: { id?: 'n' | 'n1' | 'n2'; dateDebut?: Date; dateFin?: { lt: Date } } }) => {
        const tous = Object.values(EXERCICES);
        if (where.id) return Promise.resolve(EXERCICES[where.id] ?? null);
        if (where.dateDebut) return Promise.resolve(tous.find((e) => e.dateDebut.getTime() === where.dateDebut!.getTime()) ?? null);
        if (where.dateFin) {
          const avant = tous.filter((e) => e.dateFin.getTime() < where.dateFin!.lt.getTime());
          return Promise.resolve(avant.sort((a, b) => b.dateFin.getTime() - a.dateFin.getTime())[0] ?? null);
        }
        return Promise.resolve(null);
      }),
    },
    ecriture: {
      // Honore la requête · à-nouveau NON provisoire seulement, au statut demandé s'il l'est.
      count: jest.fn(({ where }: { where: { exerciceId: 'n' | 'n1' | 'n2'; statut?: string; estANouveauProvisoire: boolean } }) => {
        expect(where).toMatchObject({ tenantId: 't', estGenereeParCloture: true, estSoldeDesComptesDeGestion: false, estANouveauProvisoire: false });
        const an = options.aNouveau?.[where.exerciceId];
        return Promise.resolve(an && !an.provisoire && (!where.statut || an.statut === where.statut) ? 1 : 0);
      }),
    },
    // La reconstitution du report (`lireComptesDuReport`) · le plan des
    // racines lues, et les totaux par compte des écritures de l'exercice.
    compte: {
      findFirst: jest.fn(({ where }: { where: { numero: { startsWith: string } } }) =>
        Promise.resolve({ id: `c-${where.numero.startsWith}`, numero: where.numero.startsWith.padEnd(8, '0') }),
      ),
      findMany: jest.fn(({ where }: { where: { OR: { numero: { startsWith: string } }[] } }) =>
        Promise.resolve(
          where.OR.map((o) => ({ id: `c-${o.numero.startsWith}`, numero: o.numero.startsWith.padEnd(8, '0'), intitule: '', modeReportANouveau: 'SOLDE' })),
        ),
      ),
    },
    ligneEcriture: {
      findMany: jest.fn(({ where }: { where: { ecriture: { exerciceId: string }; compte?: unknown } }) =>
        // Les lignes au DÉTAIL de la reconstitution · aucun compte de provision n'y est.
        where.compte ? Promise.resolve([]) : Promise.resolve(
          positions[where.ecriture.exerciceId].map((p) => ({
            compteId: `c-${p.compte}`,
            deviseId: 'usd',
            debit: p.debit,
            credit: p.credit,
            montantDevise: p.usd,
            compte: { id: `c-${p.compte}`, numero: p.compte, intitule: `Compte ${p.compte}` },
            devise: { id: 'usd', code: 'USD' },
          })),
        ),
      ),
      groupBy: jest.fn(({ by, where }: { by: string[]; where: { ecriture: { exerciceId: string; statut: string } } }) => {
        // Brouillard compris · la réévaluation de N y passe sa provision (Q4).
        expect(where.ecriture.statut).toBeUndefined();
        if (by.length > 1) return Promise.resolve([]);
        const parCompte = new Map<string, { debit: number; credit: number }>();
        for (const l of ecrites.filter((e) => e.exerciceId === where.ecriture.exerciceId).flatMap((e) => e.lignes)) {
          const t = parCompte.get(`c-${l.compte}`) ?? { debit: 0, credit: 0 };
          t.debit += l.debit ?? 0;
          t.credit += l.credit ?? 0;
          parCompte.set(`c-${l.compte}`, t);
        }
        return Promise.resolve([...parCompte].map(([compteId, t]) => ({ compteId, _sum: t })));
      }),
      fields: { credit: 'credit' },
      aggregate: jest.fn((arg: { where: { compte: { numero: { startsWith: string } }; ecriture: { exerciceId: string | { in: string[] }; statut?: string } }; _sum?: unknown }) => {
        agregats.push(arg);
        // Le solde d'OUVERTURE se demande en somme · l'à-nouveau de l'exercice, au statut demandé.
        if (arg._sum && (arg.where.ecriture as { estGenereeParCloture?: boolean }).estGenereeParCloture === false) {
          // TOUS STATUTS (septième passe, M5) · la réévaluation passe sa provision au brouillard ; un solde
          // reconstitué sur le seul livre-journal la perdrait et rouvrirait p4-B1.
          expect(arg.where.ecriture).not.toHaveProperty('statut');
          // Le solde reconstitué · toutes les écritures de l'exercice, hors à-nouveau.
          const somme = ecrites
            .filter((e) => e.exerciceId === arg.where.ecriture.exerciceId && !e.aNouveau)
            .flatMap((e) => e.lignes)
            .filter((l) => l.compte.startsWith(arg.where.compte.numero.startsWith))
            .reduce((t, l) => t + (l.credit ?? 0) - (l.debit ?? 0), 0);
          return Promise.resolve({ _sum: { debit: 0, credit: somme } });
        }
        if (arg._sum) {
          expect(arg.where.ecriture).toMatchObject({ estANouveauProvisoire: false });
          const an = options.aNouveau?.[arg.where.ecriture.exerciceId as 'n'];
          const solde = an && !an.provisoire ? (an.soldes[arg.where.compte.numero.startsWith] ?? 0) : 0;
          return Promise.resolve({ _sum: { debit: 0, credit: solde } });
        }
        if (typeof arg.where.ecriture.exerciceId === 'object') {
          return Promise.resolve({ _count: { _all: options.horsAnterieurs ?? 0 } });
        }
        return Promise.resolve({ _count: { _all: options.horsReevaluation ?? 0 } });
      }),
    },
    coursDevise: {
      findFirst: jest.fn(({ where }: { where: { date: { lte: Date } } }) =>
        Promise.resolve({ cours: cours[where.date.lte.toISOString().slice(0, 10)] }),
      ),
    },
    journal: { findFirst: jest.fn().mockResolvedValue({ id: 'j-od', code: 'OD' }) },
    provisionChangeOuverture: {
      findMany: jest.fn(({ where }: { where: { tenantId: string; compteProvision?: string } }) => {
        expect(where.tenantId).toBe('t');
        return Promise.resolve(
          declarations
            .filter((d) => !where.compteProvision || d.compteProvision === where.compteProvision)
            .sort((a, b) => a.dateReference.getTime() - b.dateReference.getTime()),
        );
      }),
      create: jest.fn(({ data }: { data: Declaration }) => {
        const v = { ...data, montant: Number(data.montant), id: `v-${declarations.length + 1}`, updatedAt: horloge() };
        declarations.push(v);
        return Promise.resolve(v);
      }),
      findFirst: jest.fn(({ where }: { where: { id?: string; compteProvision?: string; dateReference?: { gt: Date } } }) => {
        const avecId = declarations as (Declaration & { id?: string })[];
        if (where.id) return Promise.resolve(avecId.find((x) => x.id === where.id) ?? null);
        return Promise.resolve(
          avecId
            .filter((x) => x.compteProvision === where.compteProvision && x.dateReference.getTime() > where.dateReference!.gt.getTime())
            .sort((a, b) => a.dateReference.getTime() - b.dateReference.getTime())[0] ?? null,
        );
      }),
      delete: jest.fn(({ where }: { where: { id: string } }) => {
        const i = (declarations as (Declaration & { id?: string })[]).findIndex((x) => x.id === where.id);
        declarations.splice(i, 1);
        return Promise.resolve({});
      }),
      update: jest.fn(({ where, data }: { where: { id: string }; data: Partial<Declaration> }) => {
        const v = declarations.find((x) => (x as Declaration & { id?: string }).id === where.id)!;
        Object.assign(v, { ...data, montant: Number(data.montant) });
        return Promise.resolve(v);
      }),
    },
    reevaluation: {
      // Honore la borne de date · « aucune réévaluation OmegaX avant la date ».
      count: jest.fn(({ where }: { where: { dateReevaluation: { lt: Date } } }) =>
        Promise.resolve(reevaluations.filter((r) => r.dateReevaluation.getTime() < where.dateReevaluation.lt.getTime()).length),
      ),
      // Honore les deux questions du service · une réévaluation par exercice
      // (F54), et une réévaluation déjà passée dans une période de dates.
      findFirst: jest.fn(({ where }: { where: { exerciceId?: string; dateReevaluation?: { gte: Date; lt?: Date } } }) => {
        if (where.dateReevaluation) {
          const { gte, lt } = where.dateReevaluation;
          return Promise.resolve(
            reevaluations.find(
              (r) => r.dateReevaluation.getTime() >= gte.getTime() && (!lt || r.dateReevaluation.getTime() < lt.getTime()),
            ) ?? null,
          );
        }
        return Promise.resolve(reevaluations.find((r) => r.exerciceId === where.exerciceId) ?? null);
      }),
      findMany: jest.fn(({ where }: { where: { ecritureProvisionId: { not: null } } }) => {
        expect(where.ecritureProvisionId).toEqual({ not: null });
        return Promise.resolve(
          reevaluations
            .filter((r) => r.ecritureProvisionId)
            .map((r) => ({
              dateReevaluation: r.dateReevaluation,
              ecritureProvisionId: r.ecritureProvisionId,
              ecritureProvision: {
                lignes: ecrites
                  .find((e) => e.id === r.ecritureProvisionId)!
                  .lignes.map((l) => ({ debit: l.debit ?? 0, credit: l.credit ?? 0, compte: { numero: l.compte.padEnd(8, '0') } })),
              },
            })),
        );
      }),
      create: jest.fn(({ data }: { data: (typeof reevaluations)[number] }) => {
        const r = { ...data, id: `r-${reevaluations.length + 1}` };
        reevaluations.push(r);
        return Promise.resolve(r);
      }),
    },
  };
  const ecritureService = {
    creer: jest.fn((_t: string, _u: string, dto: { exerciceId: string; libelle: string; lignes: { compteId: string; debit?: number; credit?: number }[] }) => {
      const e: Ecrite = {
        id: `e-${ecrites.length + 1}`,
        exerciceId: dto.exerciceId,
        libelle: dto.libelle,
        lignes: dto.lignes.map((l) => ({ compte: l.compteId.replace(/^c-/, ''), debit: l.debit, credit: l.credit })),
      };
      ecrites.push(e);
      return Promise.resolve({ id: e.id });
    }),
    retirerCompensation: jest.fn(),
  };
  const svc = new DevisesService(prisma as never, ecritureService as never);

  /** Solde créditeur d'un compte, tous exercices confondus · ce que reporte l'à-nouveau. */
  const solde = (racine: string) =>
    Math.round(
      ecrites
        .flatMap((e) => e.lignes)
        .filter((l) => l.compte.startsWith(racine))
        .reduce((t, l) => t + (l.credit ?? 0) - (l.debit ?? 0), 0) * 100,
    ) / 100;
  const provisionDe = (exerciceId: string) => ecrites.find((e) => e.exerciceId === exerciceId && e.libelle.startsWith('Provision'));
  return { svc, ecrites, reevaluations, positions, cours, solde, provisionDe, agregats, prisma, statuts };
}

// Créance client de 1 000 USD inscrite à 2 000 000 (cours 2 000).
const CREANCE: Position = { compte: '41110000', debit: 2_000_000, credit: 0, usd: 1000 };
// Emprunt de 1 000 USD inscrit à 2 000 000.
const EMPRUNT: Position = { compte: '16200000', debit: 0, credit: 2_000_000, usd: 1000 };

describe('A5 · SYSCOHADA, créance commerciale (4991, 6591, 7591)', () => {
  function premierExercice(referentiel: 'SYSCOHADA' | 'SYCEBNL' = 'SYSCOHADA', position: Position = CREANCE, coursN = 1900) {
    const d = dossier(referentiel);
    d.positions.n = [position];
    d.cours['2026-12-31'] = coursN;
    return d;
  }

  it('N · une perte latente de 100 000 est dotée en entier, rien n’étant en place', async () => {
    const d = premierExercice();
    const { rapport } = await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    expect(rapport.provision).toBe(100_000);
    expect(rapport.provisionEnPlace).toBe(0);
    expect(d.provisionDe('n')!.lignes).toEqual([
      { compte: '6591', debit: 100_000, credit: undefined },
      { compte: '4991', debit: undefined, credit: 100_000 },
    ]);
    expect(d.solde('4991')).toBe(100_000);
  });

  it('perte puis GAIN · la provision de N est reprise au 7591 en N+1, rien n’est doté', async () => {
    const d = premierExercice();
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    // N+1 · l'extourne a rendu la créance à son coût historique ; la devise
    // remonte à 2 100, la créance gagne 100 000 · plus rien à provisionner.
    d.positions.n1 = [CREANCE];
    d.cours['2027-12-31'] = 2100;
    const { rapport } = await d.svc.reevaluer('t', 'u', { exerciceId: 'n1' });
    expect(rapport.provision).toBe(0);
    expect(rapport.provisionEnPlace).toBe(100_000);
    expect(rapport.ajustementsProvision).toEqual([
      expect.objectContaining({ compteProvision: '4991', compteReprise: '7591', requise: 0, enPlace: 100_000, dotation: 0, reprise: 100_000 }),
    ]);
    expect(d.provisionDe('n1')!.lignes).toEqual([
      { compte: '4991', debit: 100_000, credit: undefined },
      { compte: '7591', debit: undefined, credit: 100_000 },
    ]);
    expect(d.solde('4991')).toBe(0);
  });

  it('perte puis perte PLUS FORTE · seul l’écart de 50 000 est doté, jamais deux fois la même perte', async () => {
    const d = premierExercice();
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    d.positions.n1 = [CREANCE];
    d.cours['2027-12-31'] = 1850;
    const { rapport } = await d.svc.reevaluer('t', 'u', { exerciceId: 'n1' });
    expect(rapport.provision).toBe(150_000);
    expect(d.provisionDe('n1')!.lignes).toEqual([
      { compte: '6591', debit: 50_000, credit: undefined },
      { compte: '4991', debit: undefined, credit: 50_000 },
    ]);
    // C'EST LE DÉFAUT D'ORIGINE · le module dotait 150 000 de plus, et le
    // passif portait 250 000 pour une perte de 150 000.
    expect(d.solde('4991')).toBe(150_000);
  });

  it('perte puis perte ÉGALE · aucune écriture de provision, le solde reste à 100 000', async () => {
    const d = premierExercice();
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    d.positions.n1 = [CREANCE];
    d.cours['2027-12-31'] = 1900;
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n1' });
    expect(d.provisionDe('n1')).toBeUndefined();
    expect(d.solde('4991')).toBe(100_000);
  });

  it('créance DÉNOUÉE · sans position, la réévaluation passe quand même, et reprend la provision seule', async () => {
    const d = premierExercice();
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    // La créance est encaissée et lettrée en N+1 · plus aucune position.
    d.positions.n1 = [];
    const { rapport, ecritures } = await d.svc.reevaluer('t', 'u', { exerciceId: 'n1' });
    expect(rapport.positions).toHaveLength(0);
    expect(ecritures).toHaveLength(1);
    expect(d.provisionDe('n1')!.lignes.map((l) => l.compte)).toEqual(['4991', '7591']);
    expect(d.solde('4991')).toBe(0);
    // Aucune écriture d'écarts vide · la réévaluation ne porte que la provision.
    expect(d.reevaluations[1]).toMatchObject({ ecritureEcartsId: undefined, ecritureProvisionId: ecritures[0] });
  });

  it('sans position ni provision en place, le refus demeure', async () => {
    const d = dossier('SYSCOHADA');
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n1' })).rejects.toThrow(/Aucune position en devise/);
  });

  it('le CALCUL montre l’ajustement sans rien passer', async () => {
    const d = premierExercice();
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    d.positions.n1 = [CREANCE];
    d.cours['2027-12-31'] = 1850;
    const avant = d.ecrites.length;
    const r = await d.svc.calculer('t', { exerciceId: 'n1' });
    expect(r.ajustementsProvision).toEqual([expect.objectContaining({ requise: 150_000, enPlace: 100_000, dotation: 50_000, reprise: 0 })]);
    expect(d.ecrites.length).toBe(avant);
  });
});

describe('A5 · les trois familles SYSCOHADA s’ajustent chacune dans la sienne', () => {
  it('emprunt (194 · 6971 / 7971) puis gain · reprise au 7971, jamais au 7591', async () => {
    const d = dossier('SYSCOHADA');
    d.positions.n = [EMPRUNT];
    d.cours['2026-12-31'] = 2100; // la dette s'alourdit de 100 000
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    expect(d.solde('194')).toBe(100_000);
    d.positions.n1 = [EMPRUNT];
    d.cours['2027-12-31'] = 1900;
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n1' });
    expect(d.provisionDe('n1')!.lignes.map((l) => l.compte)).toEqual(['194', '7971']);
    expect(d.solde('194')).toBe(0);
  });

  it('une famille reprise et une autre dotée cohabitent dans une écriture équilibrée', async () => {
    const d = dossier('SYSCOHADA');
    d.positions.n = [CREANCE];
    d.cours['2026-12-31'] = 1900;
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    // N+1 · la créance est encaissée, un emprunt est né et s'alourdit.
    d.positions.n1 = [EMPRUNT];
    d.cours['2027-12-31'] = 2050;
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n1' });
    const lignes = d.provisionDe('n1')!.lignes;
    expect(lignes).toEqual([
      { compte: '4991', debit: 100_000, credit: undefined },
      { compte: '7591', debit: undefined, credit: 100_000 },
      { compte: '6971', debit: 50_000, credit: undefined },
      { compte: '194', debit: undefined, credit: 50_000 },
    ]);
    expect(d.solde('4991')).toBe(0);
    expect(d.solde('194')).toBe(50_000);
  });

  it('un dossier dont le module a EMPILÉ les dotations voit l’excédent repris', async () => {
    // L'à-nouveau porte les 200 000 empilés · les réévaluations OmegaX les
    // expliquent entièrement, aucune réserve.
    const d = dossier('SYSCOHADA', { aNouveau: { n: { statut: 'VALIDEE', soldes: { '4991': 200_000 } } } });
    // Avant la correction · deux exercices dotés chacun de 100 000 pour la
    // même perte. On les rejoue comme le faisait l'ancien module.
    d.ecrites.push(
      { id: 'v1', exerciceId: 'v', libelle: 'Provision pour perte de change au 2024-12-31', lignes: [{ compte: '6591', debit: 100_000 }, { compte: '4991', credit: 100_000 }] },
      { id: 'v2', exerciceId: 'v', libelle: 'Provision pour perte de change au 2025-12-31', lignes: [{ compte: '6591', debit: 100_000 }, { compte: '4991', credit: 100_000 }] },
    );
    d.reevaluations.push(
      { id: 'a', exerciceId: 'x', dateReevaluation: new Date('2024-12-31'), ecritureProvisionId: 'v1' },
      { id: 'b', exerciceId: 'y', dateReevaluation: new Date('2025-12-31'), ecritureProvisionId: 'v2' },
    );
    d.positions.n = [CREANCE];
    d.cours['2026-12-31'] = 1900;
    const { rapport } = await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    expect(rapport.provisionEnPlace).toBe(200_000);
    expect(d.provisionDe('n')!.lignes.map((l) => [l.compte, l.debit ?? 0, l.credit ?? 0])).toEqual([
      ['4991', 100_000, 0],
      ['7591', 0, 100_000],
    ]);
    expect(d.solde('4991')).toBe(100_000);
  });

  it('une réévaluation POSTÉRIEURE n’est pas en place à la date', async () => {
    const d = dossier('SYSCOHADA');
    d.ecrites.push({ id: 'p', exerciceId: 'z', libelle: 'Provision', lignes: [{ compte: '6591', debit: 70_000 }, { compte: '4991', credit: 70_000 }] });
    d.reevaluations.push({ id: 'p', exerciceId: 'z', dateReevaluation: new Date('2027-12-31'), ecritureProvisionId: 'p' });
    d.positions.n = [CREANCE];
    d.cours['2026-12-31'] = 1900;
    const r = await d.svc.calculer('t', { exerciceId: 'n' });
    expect(r.provisionEnPlace).toBe(0);
    expect(r.ajustementsProvision[0]).toMatchObject({ dotation: 100_000 });
  });
});

describe('A5 · SYCEBNL, un seul couple · 194 doté au 6971, repris au 7971', () => {
  it('perte puis gain sur une créance', async () => {
    const d = dossier('SYCEBNL');
    d.positions.n = [{ ...CREANCE, compte: '41200000' }];
    d.cours['2026-12-31'] = 1900;
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    expect(d.provisionDe('n')!.lignes.map((l) => l.compte)).toEqual(['6971', '194']);
    d.positions.n1 = [{ ...CREANCE, compte: '41200000' }];
    d.cours['2027-12-31'] = 2100;
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n1' });
    expect(d.provisionDe('n1')!.lignes.map((l) => l.compte)).toEqual(['194', '7971']);
    expect(d.solde('194')).toBe(0);
  });
});

describe('A5 · ce que le module ne voit pas se dit', () => {
  it('une ligne passée hors réévaluation sur un compte de provision est signalée, rien n’est retranché', async () => {
    const d = dossier('SYSCOHADA', { horsReevaluation: 2 });
    d.positions.n = [CREANCE];
    d.cours['2026-12-31'] = 1900;
    const r = await d.svc.calculer('t', { exerciceId: 'n' });
    expect(r.avertissements.some((a) => /compte 4991 porte 2 ligne\(s\).*doublerait/.test(a))).toBe(true);
    expect(r.ajustementsProvision[0]).toMatchObject({ dotation: 100_000 });
  });

  it('la lecture des mouvements hors réévaluation écarte l’à-nouveau et les écritures du module', async () => {
    const d = dossier('SYSCOHADA');
    d.positions.n = [CREANCE];
    d.cours['2026-12-31'] = 1900;
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    d.positions.n1 = [CREANCE];
    d.cours['2027-12-31'] = 1900;
    await d.svc.calculer('t', { exerciceId: 'n1' });
    const comptages = d.agregats.filter(
      (a) => !(a as { _sum?: unknown })._sum && typeof (a as { where: { ecriture: { exerciceId: unknown } } }).where.ecriture.exerciceId === 'string',
    );
    const dernier = comptages[comptages.length - 1] as { where: { ecriture: Record<string, unknown>; compte: Record<string, unknown> } };
    expect(dernier.where.ecriture).toMatchObject({
      tenantId: 't',
      exerciceId: 'n1',
      estGenereeParCloture: false,
      estANouveauProvisoire: false,
      id: { notIn: ['e-2'] },
    });
    expect(dernier.where.compte).toMatchObject({ tenantId: 't' });
  });
});

describe('A5 · le moteur pur et ses tables', () => {
  it('rend la dotation de la hausse ou la reprise de la baisse, jamais les deux', () => {
    const f = [PROVISION_SYSCOHADA.EXPLOITATION];
    expect(ajusterProvisions(f, new Map([['4991', 30]]), new Map([['4991', 10]]))).toEqual([
      expect.objectContaining({ dotation: 20, reprise: 0 }),
    ]);
    expect(ajusterProvisions(f, new Map([['4991', 10]]), new Map([['4991', 30]]))).toEqual([
      expect.objectContaining({ dotation: 0, reprise: 20 }),
    ]);
    expect(ajusterProvisions(f, new Map(), new Map())).toEqual([]);
    expect(ajusterProvisions(f, new Map(), new Map([['4991', 30]]))).toEqual([
      expect.objectContaining({ requise: 0, enPlace: 30, reprise: 30 }),
    ]);
  });

  it('les familles du module sont celles de la consolidation, compte pour compte', () => {
    for (const f of Object.values(PROVISION_SYSCOHADA)) {
      expect(FAMILLES_PROVISION_CHANGE).toContainEqual(expect.objectContaining({ provision: f.provision, dotation: f.dotation, reprise: f.reprise }));
    }
  });

  it('chaque compte servi est ouvert en détail dans le semis de SON référentiel', () => {
    const ouvert = (plan: { numero: string; typeCompte?: string }[], racine: string) =>
      plan.some((c) => c.numero === racine.padEnd(8, '0') && c.typeCompte !== 'TOTAL');
    for (const f of Object.values(PROVISION_SYSCOHADA)) {
      for (const n of [f.provision, f.dotation, f.reprise]) expect([n, ouvert(PLAN_COMPTES_SYSCOHADA, n)]).toEqual([n, true]);
    }
    for (const n of [PROVISION_SYCEBNL.provision, PROVISION_SYCEBNL.dotation, PROVISION_SYCEBNL.reprise]) {
      expect([n, ouvert(PLAN_COMPTES_SYCEBNL, n)]).toEqual([n, true]);
    }
    // Un numéro, deux sens · le SYCEBNL n'ouvre pas de 4997, et c'est
    // pourquoi son unique couple reste le 194.
    expect(PLAN_COMPTES_SYCEBNL.some((c) => c.numero.startsWith('4997'))).toBe(false);
  });
});

// Crédit de trésorerie de 1 000 USD inscrit à 2 000 000 · opération
// financière à court terme (56), famille 4997 · 6791 / 7791.
const CREDIT_TRESORERIE: Position = { compte: '56100000', debit: 0, credit: 2_000_000, usd: 1000 };

describe('A5 · décision (1), 2026-10-02 · le 4997 se reprend au 7791', () => {
  it('une provision 4997 qui BAISSE est reprise au 7791, jamais au 7591 ni au 7971', async () => {
    const d = dossier('SYSCOHADA');
    d.positions.n = [CREDIT_TRESORERIE];
    d.cours['2026-12-31'] = 2100; // la dette s'alourdit de 100 000
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    expect(d.provisionDe('n')!.lignes.map((l) => [l.compte, l.debit ?? 0, l.credit ?? 0])).toEqual([
      ['6791', 100_000, 0],
      ['4997', 0, 100_000],
    ]);
    d.positions.n1 = [CREDIT_TRESORERIE];
    d.cours['2027-12-31'] = 2050; // la perte retombe à 50 000
    const { rapport } = await d.svc.reevaluer('t', 'u', { exerciceId: 'n1' });
    expect(rapport.ajustementsProvision).toEqual([
      expect.objectContaining({ compteProvision: '4997', compteReprise: '7791', requise: 50_000, enPlace: 100_000, reprise: 50_000 }),
    ]);
    expect(d.provisionDe('n1')!.lignes.map((l) => [l.compte, l.debit ?? 0, l.credit ?? 0])).toEqual([
      ['4997', 50_000, 0],
      ['7791', 0, 50_000],
    ]);
    expect(d.solde('4997')).toBe(50_000);
  });

  it('la table de la famille financière à court terme porte 6791 / 4997 / 7791', () => {
    expect(PROVISION_SYSCOHADA.FINANCIER_COURT).toEqual({ dotation: '6791', provision: '4997', reprise: '7791' });
  });
});

describe('A5 · décision (2), 2026-10-02 · dossier repris, la provision d’ouverture se DÉCLARE', () => {
  const DECLAREE_4991: Declaration = { compteProvision: '4991', montant: 100_000, dateReference: new Date('2026-01-01') };
  const REPRIS = { n: { statut: 'VALIDEE' as const, soldes: { '4991': 100_000 } } };

  it('100 000 déclarés au 4991, perte requise 100 000 · aucune écriture de provision', async () => {
    const d = dossier('SYSCOHADA', { declarations: [DECLAREE_4991], aNouveau: REPRIS });
    d.positions.n = [CREANCE];
    d.cours['2026-12-31'] = 1900;
    const { rapport } = await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    expect(rapport.provisionEnPlace).toBe(100_000);
    expect(rapport.ajustementsProvision).toEqual([
      expect.objectContaining({ compteProvision: '4991', requise: 100_000, enPlace: 100_000, declaree: 100_000, dotation: 0, reprise: 0 }),
    ]);
    expect(d.provisionDe('n')).toBeUndefined();
    expect(rapport.provisionsOuvertureNonDeclarees).toEqual([]);
    expect(rapport.avertissements.filter((a) => /dépasse/.test(a))).toEqual([]);
  });

  it('100 000 déclarés, perte requise 60 000 · reprise de 40 000 au 7591', async () => {
    const d = dossier('SYSCOHADA', { declarations: [DECLAREE_4991], aNouveau: REPRIS });
    d.positions.n = [CREANCE];
    d.cours['2026-12-31'] = 1940; // 1 000 USD à 1 940 · perte de 60 000
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    expect(d.provisionDe('n')!.lignes.map((l) => [l.compte, l.debit ?? 0, l.credit ?? 0])).toEqual([
      ['4991', 40_000, 0],
      ['7591', 0, 40_000],
    ]);
  });

  it('l’exercice suivant lit la déclaration PLUS la reprise passée après son début · 60 000 en place', async () => {
    const d = dossier('SYSCOHADA', {
      declarations: [DECLAREE_4991],
      aNouveau: { ...REPRIS, n1: { statut: 'VALIDEE', soldes: { '4991': 60_000 } } },
    });
    d.positions.n = [CREANCE];
    d.cours['2026-12-31'] = 1940;
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    d.positions.n1 = [CREANCE];
    d.cours['2027-12-31'] = 1940;
    const r = await d.svc.calculer('t', { exerciceId: 'n1' });
    expect(r.provisionEnPlace).toBe(60_000);
    expect(r.ajustementsProvision[0]).toMatchObject({ dotation: 0, reprise: 0 });
  });

  it('une réévaluation ANTÉRIEURE au début de la version est comprise dans le montant, jamais ajoutée', async () => {
    const d = dossier('SYSCOHADA', { declarations: [DECLAREE_4991], aNouveau: REPRIS });
    d.ecrites.push({ id: 'v', exerciceId: 'v', libelle: 'Provision', lignes: [{ compte: '6591', debit: 100_000 }, { compte: '4991', credit: 100_000 }] });
    d.reevaluations.push({ id: 'v', exerciceId: 'v', dateReevaluation: new Date('2025-12-31'), ecritureProvisionId: 'v' });
    d.positions.n = [CREANCE];
    d.cours['2026-12-31'] = 1900;
    const r = await d.svc.calculer('t', { exerciceId: 'n' });
    expect(r.provisionEnPlace).toBe(100_000);
  });

  it('m1 · une réévaluation datée du JOUR MÊME du début de la version trouve la version en place', async () => {
    const d = dossier('SYSCOHADA', { declarations: [DECLAREE_4991], aNouveau: REPRIS });
    d.positions.n = [CREANCE];
    d.cours['2026-01-01'] = 1900;
    const r = await d.svc.calculer('t', { exerciceId: 'n', dateReevaluation: '2026-01-01' });
    expect(r.ajustementsProvision[0]).toMatchObject({ declaree: 100_000, enPlace: 100_000, dotation: 0 });
    expect(r.provisionsOuvertureNonDeclarees).toEqual([]);
  });

  it('une réévaluation datée du début même de la version est APRÈS l’ouverture · elle s’ajoute au montant déclaré', async () => {
    const d = dossier('SYSCOHADA', { declarations: [DECLAREE_4991], aNouveau: REPRIS });
    d.ecrites.push({ id: 'o', exerciceId: 'n', libelle: 'Provision', lignes: [{ compte: '6591', debit: 10_000 }, { compte: '4991', credit: 10_000 }] });
    d.reevaluations.push({ id: 'o', exerciceId: 'o', dateReevaluation: new Date('2026-01-01'), ecritureProvisionId: 'o' });
    d.positions.n = [CREANCE];
    d.cours['2026-12-31'] = 1900;
    const r = await d.svc.calculer('t', { exerciceId: 'n' });
    expect(r.provisionEnPlace).toBe(110_000);
  });

  it('m1 · une version datée APRÈS la date du calcul n’est pas en place et NE COUPE PAS la réserve', async () => {
    const d = dossier('SYSCOHADA', {
      declarations: [{ compteProvision: '4991', montant: 100_000, dateReference: new Date('2027-01-01') }],
      aNouveau: REPRIS,
    });
    d.positions.n = [CREANCE];
    d.cours['2026-12-31'] = 1900;
    const r = await d.svc.calculer('t', { exerciceId: 'n' });
    expect(r.ajustementsProvision[0]).toMatchObject({ declaree: null, enPlace: 0 });
    expect(r.provisionsOuvertureNonDeclarees).toEqual([expect.objectContaining({ compteProvision: '4991', soldeOuverture: 100_000 })]);
  });

  it('NON DÉCLARÉE · 100 000 à l’à-nouveau validé, aucune réévaluation OmegaX · réserve écrite, rien de présumé', async () => {
    const d = dossier('SYSCOHADA', { aNouveau: REPRIS });
    d.positions.n = [CREANCE];
    d.cours['2026-12-31'] = 1900;
    const r = await d.svc.calculer('t', { exerciceId: 'n' });
    expect(r.provisionsOuvertureNonDeclarees).toEqual([
      { compteProvision: '4991', soldeOuverture: 100_000, explique: 0, statutOuverture: 'VALIDE' },
    ]);
    expect(r.avertissements.some((a) => /4991 s'ouvre avec un solde de 100000\.00, dont les réévaluations OmegaX n'expliquent que 0\.00.*n'est pas déclarée/.test(a))).toBe(true);
    // Lue sans cette part, jamais égalée au solde.
    expect(r.ajustementsProvision[0]).toMatchObject({ enPlace: 0, declaree: null, dotation: 100_000 });
  });

  it('Q1 · la réserve ARRÊTE le passage des écritures (écarts compris), le calcul reste affichable', async () => {
    const d = dossier('SYSCOHADA', { aNouveau: REPRIS });
    d.positions.n = [CREANCE];
    d.cours['2026-12-31'] = 1900;
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n' })).rejects.toThrow(
      /Provision pour pertes de change à l'ouverture non déclarée \(4991\).*fiche du compte 19/,
    );
    expect(d.ecrites).toHaveLength(0);
    expect(d.reevaluations).toHaveLength(0);
    // La simulation, elle, rend le calcul et sa réserve.
    const { rapport } = await d.svc.reevaluer('t', 'u', { exerciceId: 'n', simulation: true });
    expect(rapport.provisionsOuvertureNonDeclarees).toHaveLength(1);
  });

  it('B1 · repris à 100 000 non déclarés, 100 000 dotés par OmegaX · l’à-nouveau de 200 000 n’est expliqué qu’à 100 000, la réserve DEMEURE', async () => {
    const d = dossier('SYSCOHADA', { aNouveau: { n1: { statut: 'VALIDEE', soldes: { '4991': 200_000 } } } });
    // N · OmegaX a doté 100 000 (avant que la réserve ne l'arrête).
    d.ecrites.push({ id: 'p', exerciceId: 'n', libelle: 'Provision', lignes: [{ compte: '6591', debit: 100_000 }, { compte: '4991', credit: 100_000 }] });
    d.reevaluations.push({ id: 'p', exerciceId: 'n', dateReevaluation: new Date('2026-12-31'), ecritureProvisionId: 'p' });
    d.positions.n1 = [CREANCE];
    d.cours['2027-12-31'] = 1900;
    const r = await d.svc.calculer('t', { exerciceId: 'n1' });
    expect(r.provisionEnPlace).toBe(100_000);
    expect(r.provisionsOuvertureNonDeclarees).toEqual([
      { compteProvision: '4991', soldeOuverture: 200_000, explique: 100_000, statutOuverture: 'VALIDE' },
    ]);
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n1' })).rejects.toThrow(/non déclarée/);
  });

  it('pas de réserve quand les réévaluations OmegaX expliquent EXACTEMENT l’à-nouveau', async () => {
    const d = dossier('SYSCOHADA', { aNouveau: { n1: { statut: 'VALIDEE', soldes: { '4991': 100_000 } } } });
    d.positions.n = [CREANCE];
    d.cours['2026-12-31'] = 1900;
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    d.positions.n1 = [CREANCE];
    d.cours['2027-12-31'] = 1900;
    const r = await d.svc.calculer('t', { exerciceId: 'n1' });
    expect(r.provisionsOuvertureNonDeclarees).toEqual([]);
  });

  it('m3 · un bilan d’ouverture importé resté AU BROUILLARD est lu, provisoire, et la réserve joue sur lui', async () => {
    const d = dossier('SYSCOHADA', { aNouveau: { n: { statut: 'BROUILLARD', soldes: { '4991': 100_000 } } } });
    d.positions.n = [CREANCE];
    d.cours['2026-12-31'] = 1900;
    const r = await d.svc.calculer('t', { exerciceId: 'n' });
    expect(r.provisionsOuvertureNonDeclarees).toEqual([
      { compteProvision: '4991', soldeOuverture: 100_000, explique: 0, statutOuverture: 'IMPORTE' },
    ]);
    expect(r.avertissements.some((a) => /100000\.00 \(à-nouveau au brouillard, bilan d’ouverture importé, provisoire, non validé\)/.test(a))).toBe(true);
  });

  it('Q4 · N+1 sans à-nouveau validé · son ouverture est la provision EN PLACE à la clôture de N, pas un solde à expliquer', async () => {
    const d = dossier('SYSCOHADA');
    d.positions.n = [CREANCE];
    d.cours['2026-12-31'] = 1900;
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    d.positions.n1 = [CREANCE];
    d.cours['2027-12-31'] = 1900;
    const l = await d.svc.provisionsOuverture('t', 'n1');
    expect(l.comptes.find((c) => c.compteProvision === '4991')).toMatchObject({
      soldeOuverturePropose: 100_000,
      statutSoldeOuverture: 'CLOTURE_PRECEDENTE',
      ouvertureFiable: false,
      reserve: false,
    });
    const r = await d.svc.calculer('t', { exerciceId: 'n1' });
    expect(r.provisionsOuvertureNonDeclarees).toEqual([]);
    expect(r.ajustementsProvision[0]).toMatchObject({ enPlace: 100_000, dotation: 0, reprise: 0 });
  });

  it('m2 · une déclaration qui dépasse le solde créditeur d’ouverture est signalée', async () => {
    const d = dossier('SYSCOHADA', { declarations: [DECLAREE_4991] });
    d.positions.n = [CREANCE];
    d.cours['2026-12-31'] = 1940;
    const r = await d.svc.calculer('t', { exerciceId: 'n' });
    expect(r.avertissements.some((a) => /4991 · 100000\.00 au-dessus du solde créditeur d'ouverture \(0\.00\) · une reprise rendrait le compte débiteur/.test(a))).toBe(true);
  });

  it('une déclaration à ZÉRO lève la réserve (le 4991 porte un autre risque)', async () => {
    const d = dossier('SYSCOHADA', {
      declarations: [{ compteProvision: '4991', montant: 0, dateReference: new Date('2026-01-01') }],
      aNouveau: REPRIS,
    });
    d.positions.n = [CREANCE];
    d.cours['2026-12-31'] = 1900;
    const r = await d.svc.calculer('t', { exerciceId: 'n' });
    expect(r.provisionsOuvertureNonDeclarees).toEqual([]);
    expect(r.ajustementsProvision[0]).toMatchObject({ declaree: 0, dotation: 100_000 });
  });

  it('Q2 · une NOUVELLE version prend le relais à son début, sans toucher au passé', async () => {
    const d = dossier('SYSCOHADA', {
      declarations: [DECLAREE_4991, { compteProvision: '4991', montant: 80_000, dateReference: new Date('2027-01-01') }],
      aNouveau: { ...REPRIS, n1: { statut: 'VALIDEE', soldes: { '4991': 80_000 } } },
    });
    d.positions.n = [CREANCE];
    d.cours['2026-12-31'] = 1900;
    const rn = await d.svc.calculer('t', { exerciceId: 'n' });
    expect(rn.ajustementsProvision[0]).toMatchObject({ declaree: 100_000 });
    d.positions.n1 = [CREANCE];
    d.cours['2027-12-31'] = 1900;
    const rn1 = await d.svc.calculer('t', { exerciceId: 'n1' });
    expect(rn1.ajustementsProvision[0]).toMatchObject({ declaree: 80_000, enPlace: 80_000, dotation: 20_000 });
  });
});

describe('A5 · seconde relecture · M1 et M2, ce que le serveur sert à l’écran', () => {
  it('M1 · version de N à 100 000, reprise de 40 000 en N, ouverture de N+1 à 60 000 · AUCUN dépassement', async () => {
    const d = dossier('SYSCOHADA', {
      declarations: [{ compteProvision: '4991', montant: 100_000, dateReference: new Date('2026-01-01') }],
      aNouveau: { n: { statut: 'VALIDEE', soldes: { '4991': 100_000 } }, n1: { statut: 'VALIDEE', soldes: { '4991': 60_000 } } },
    });
    d.positions.n = [CREANCE];
    d.cours['2026-12-31'] = 1940;
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    const l = await d.svc.provisionsOuverture('t', 'n1');
    const c4991 = l.comptes.find((c) => c.compteProvision === '4991')!;
    expect(c4991).toMatchObject({ provisionEnPlaceOuverture: 60_000, depasseSoldeOuverture: false, reserve: false });
    // Le même état sert le calcul · aucun avertissement de dépassement.
    d.positions.n1 = [CREANCE];
    d.cours['2027-12-31'] = 1940;
    const r = await d.svc.calculer('t', { exerciceId: 'n1' });
    expect(r.avertissements.filter((a) => /dépasse/.test(a))).toEqual([]);
  });

  it('M1 · un vrai dépassement est servi par le serveur', async () => {
    const d = dossier('SYSCOHADA', {
      declarations: [{ compteProvision: '4991', montant: 100_000, dateReference: new Date('2026-01-01') }],
      aNouveau: { n: { statut: 'VALIDEE', soldes: { '4991': 50_000 } } },
    });
    const l = await d.svc.provisionsOuverture('t', 'n');
    expect(l.comptes.find((c) => c.compteProvision === '4991')).toMatchObject({ depasseSoldeOuverture: true, reserve: false });
  });

  it('M2 et M3 · réserve servie compte par compte, provision en place dite incomplète', async () => {
    const d = dossier('SYSCOHADA', { aNouveau: { n: { statut: 'VALIDEE', soldes: { '4991': 100_000 } } } });
    const l = await d.svc.provisionsOuverture('t', 'n');
    expect(l.comptes.map((c) => [c.compteProvision, c.reserve])).toEqual([
      ['4991', true],
      ['4997', false],
      ['194', false],
    ]);
    d.positions.n = [CREANCE];
    d.cours['2026-12-31'] = 1900;
    const r = await d.svc.calculer('t', { exerciceId: 'n' });
    expect(r.provisionEnPlaceIncomplete).toBe(true);
    expect(r.ajustementsProvision[0]).toMatchObject({ compteProvision: '4991', enPlaceIncomplete: true });
  });
});

describe('A5 · troisième relecture · on réévalue DANS L’ORDRE des exercices (fiche du compte 19)', () => {
  /** N repris (bilan d'ouverture au brouillard, 100 000 au 4991), N+1 ouvert, perte de 60 000 sur chacun. */
  function repris(declarerN = false) {
    const d = dossier('SYSCOHADA', {
      aNouveau: { n: { statut: 'BROUILLARD', soldes: { '4991': 100_000 } } },
      declarations: declarerN ? [{ compteProvision: '4991', montant: 100_000, dateReference: new Date('2026-01-01') }] : [],
    });
    d.ecrites.push({ id: 'bo', exerciceId: 'n', libelle: 'Bilan d’ouverture', aNouveau: true, lignes: [{ compte: '5211', debit: 100_000 }, { compte: '4991', credit: 100_000 }] });
    d.positions.n = [CREANCE];
    d.positions.n1 = [CREANCE];
    d.cours['2026-12-31'] = 1940;
    d.cours['2027-12-31'] = 1940;
    return d;
  }

  it('N+1 est REFUSÉ tant que N, antérieur et ouvert, n’est pas réévalué · sans version, rien n’est passé', async () => {
    const d = repris();
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n1' })).rejects.toThrow(
      // N porte une réserve · le refus dit de la déclarer (sixième passe, m1).
      /L'exercice du 2026-01-01 au 2026-12-31, antérieur et encore ouvert, porte une provision pour pertes de change à l'ouverture non déclarée \(4991\).*fiche du compte 19/,
    );
    expect(d.reevaluations).toHaveLength(0);
    expect(d.solde('4991')).toBe(100_000);
  });

  it('N+1 est refusé aussi quand N est déclaré mais pas réévalué (le cas qui finissait à 20 000)', async () => {
    const d = repris(true);
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n1' })).rejects.toThrow(/antérieur et encore ouvert/);
    expect(d.reevaluations).toHaveLength(0);
  });

  it('l’impasse finit juste · N+1 refusé, N déclaré et réévalué, N+1 réévalué · SOLDE FINAL DU 4991 = provision requise', async () => {
    const d = repris();
    const source = 'Bilan d’ouverture importé';
    await d.svc.declarerProvisionOuverture('t', 'u', { compteProvision: '4991', montant: 100_000, dateReference: '2027-01-01', source });
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n1' })).rejects.toThrow(/antérieur et encore ouvert/);
    // N · non déclaré, la réserve arrête ; déclaré à son début (avant la version de N+1, admis), il passe.
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n' })).rejects.toThrow(/non déclarée \(4991\)/);
    await d.svc.declarerProvisionOuverture('t', 'u', { compteProvision: '4991', montant: 100_000, dateReference: '2026-01-01', source });
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    expect(d.solde('4991')).toBe(60_000);
    // N+1 · sa version de 100 000, déclarée avant que N ne reprenne 40 000, ne décrit plus l'ouverture · le
    // serveur le dit (dépassement), et le cabinet corrige en retouchant la version, encore inutilisée.
    const avant = await d.svc.calculer('t', { exerciceId: 'n1' });
    // L'ouverture de N+1 n'est pas validée · elle se lit contre le solde reconstitué de N (60 000), son
    // plafond, et la provision du module (60 000), son plancher (huitième relecture).
    expect(avant.avertissements.some((a) => /4991 · 100000\.00 au-dessus du solde reconstitué à la clôture de l'exercice précédent \(60000\.00\)/.test(a))).toBe(true);
    expect(avant.provisionsOuvertureExcessives).toEqual([
      { compteProvision: '4991', enPlaceOuverture: 100_000, borne: 'PLAFOND', plancher: 60_000, plafond: 60_000, plafondFiable: false, provisionModule: 60_000, contesteeAuMontant: null },
    ]);
    // Passée telle quelle, elle reprendrait 40 000 de trop (le 4991 finissait à 20 000) · refusée.
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n1' })).rejects.toThrow(/4991 · 100000\.00 au-dessus du solde reconstitué à la clôture de l'exercice précédent \(60000\.00\)/);
    expect(d.solde('4991')).toBe(60_000);
    // Elle succède désormais à la version de N, utilisée · c'est une correction, motif exigé (point 4).
    await expect(
      d.svc.declarerProvisionOuverture('t', 'u', { compteProvision: '4991', montant: 60_000, dateReference: '2027-01-01', source }),
    ).rejects.toThrow(/porte son motif/);
    await d.svc.declarerProvisionOuverture('t', 'u', {
      compteProvision: '4991',
      montant: 60_000,
      dateReference: '2027-01-01',
      source,
      motif: 'Ouverture de N+1 après la reprise de 40 000 en N',
    });
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n1' });
    // Perte requise de 60 000 · le 4991 la porte UNE fois.
    expect(d.solde('4991')).toBe(60_000);
  });

  it('sans version au début de N+1, N+1 lit la version de N et ses reprises · SOLDE FINAL = provision requise', async () => {
    const d = repris(true);
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n1' });
    expect(d.provisionDe('n1')).toBeUndefined();
    expect(d.solde('4991')).toBe(60_000);
  });

  it('un antérieur SANS OBJET ne bloque pas (aucune position, aucune provision, aucune réserve)', async () => {
    const d = dossier('SYSCOHADA');
    d.positions.n1 = [CREANCE];
    d.cours['2027-12-31'] = 1900;
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n1' });
    expect(d.solde('4991')).toBe(100_000);
  });

  it('un antérieur sans position mais en RÉSERVE bloque · il a une provision à connaître', async () => {
    const d = dossier('SYSCOHADA', { aNouveau: { n: { statut: 'VALIDEE', soldes: { '4991': 100_000 } } } });
    d.positions.n1 = [CREANCE];
    d.cours['2027-12-31'] = 1900;
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n1' })).rejects.toThrow(/antérieur et encore ouvert/);
  });

  it('un antérieur CLÔTURÉ ne bloque pas', async () => {
    const d = repris(true);
    d.statuts.n = 'CLOTURE';
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n1' })).resolves.toBeDefined();
  });

  it('le refus d’ordre ne vaut que pour le PASSAGE · la simulation de N+1 reste ouverte', async () => {
    const d = repris();
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n1', simulation: true })).resolves.toMatchObject({ ecritures: [] });
  });

  it('verrou · une LIGNE par dossier, posée puis retirée, sans aucune transaction tenue', async () => {
    const d = repris(true);
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    expect(d.prisma.verrouProvisionChange.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: 't', geste: 'REEVALUATION' }) }),
    );
    expect(d.prisma.verrouProvisionChange.lignes.size).toBe(0);
    expect(d.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('verrou · un second geste CONCURRENT reçoit aussitôt un 409, sans attendre ni rien retenir', async () => {
    const d = repris(true);
    // La réévaluation est tenue au milieu de son travail (avant l'enregistrement).
    let liberer!: () => void;
    const tenue = new Promise<void>((r) => (liberer = r));
    const creer = d.prisma.reevaluation.create.getMockImplementation()!;
    d.prisma.reevaluation.create.mockImplementationOnce(async (arg: never) => {
      await tenue;
      return creer(arg);
    });
    const premiere = d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    // Attente BORNÉE · si le geste échoue avant d'atteindre l'enregistrement, le test tombe au lieu de tourner.
    for (let tour = 0; d.prisma.verrouProvisionChange.lignes.size === 0 || d.prisma.reevaluation.create.mock.calls.length === 0; tour++) {
      if (tour > 10_000) throw new Error('La réévaluation n’a jamais atteint son enregistrement');
      await new Promise((r) => setImmediate(r));
    }
    const debut = Date.now();
    await expect(
      d.svc.declarerProvisionOuverture('t', 'u', { compteProvision: '4991', montant: 1, dateReference: '2027-01-01', source: 'x' }),
    ).rejects.toThrow(MOTIF_VERROU_PROVISION);
    expect(Date.now() - debut).toBeLessThan(500);
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n1' })).rejects.toMatchObject({ status: 409 });
    liberer();
    await premiere;
    expect(d.prisma.verrouProvisionChange.lignes.size).toBe(0);
    expect(d.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('verrou · relâché même quand le geste échoue, et un verrou ÉCHU se reprend', async () => {
    const d = repris(true);
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n1' })).rejects.toThrow(/antérieur et encore ouvert/);
    expect(d.prisma.verrouProvisionChange.lignes.size).toBe(0);
    // Un processus tombé a laissé sa ligne, échue · le geste suivant la reprend.
    d.prisma.verrouProvisionChange.lignes.set('t', { id: 'mort', echeance: new Date(Date.now() - 1000) });
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    expect(d.prisma.verrouProvisionChange.lignes.size).toBe(0);
    // Non échue, elle refuse.
    d.prisma.verrouProvisionChange.lignes.set('t', { id: 'vivant', echeance: new Date(Date.now() + 60_000) });
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n1' })).rejects.toThrow(MOTIF_VERROU_PROVISION);
  });
});

describe('A5 · quatrième relecture · l’ouverture non validée est la provision de clôture précédente', () => {
  /** Créance de 1 000 USD à 2 000, clôture à 1 900 chaque année · perte requise de 100 000. */
  function aNouveauxProvisoires() {
    // N+1 né par à-nouveaux provisoires · lus sur le livre-journal seul, ils portent 0 au 4991, la dotation de N
    // étant au brouillard.
    const d = dossier('SYSCOHADA', { aNouveau: { n1: { statut: 'BROUILLARD', soldes: { '4991': 0 }, provisoire: true } } });
    d.positions.n = [CREANCE];
    d.positions.n1 = [CREANCE];
    d.cours['2026-12-31'] = 1900;
    d.cours['2027-12-31'] = 1900;
    return d;
  }

  it('N réévalué, à-nouveaux provisoires à 0, puis N+1 · ouverture 100 000, ni réserve ni dotation · SOLDE FINAL 100 000', async () => {
    const d = aNouveauxProvisoires();
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    const l = await d.svc.provisionsOuverture('t', 'n1');
    expect(l.comptes.find((c) => c.compteProvision === '4991')).toMatchObject({
      soldeOuverturePropose: 100_000,
      statutSoldeOuverture: 'CLOTURE_PRECEDENTE',
      reserve: false,
      depasseSoldeOuverture: false,
    });
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n1' });
    expect(d.provisionDe('n1')).toBeUndefined();
    expect(d.solde('4991')).toBe(100_000);
  });

  it('déclarer 100 000 au début de N+1 est juste, sans faux refus de dépassement · SOLDE FINAL 100 000', async () => {
    const d = aNouveauxProvisoires();
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    await d.svc.declarerProvisionOuverture('t', 'u', { compteProvision: '4991', montant: 100_000, dateReference: '2027-01-01', source: 's' });
    const r = await d.svc.calculer('t', { exerciceId: 'n1' });
    expect(r.provisionsOuvertureExcessives).toEqual([]);
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n1' });
    expect(d.solde('4991')).toBe(100_000);
  });

  it('déclarer 0 au début de N+1 ne fait PAS doter une seconde fois · la version contredit la clôture de N, passage refusé', async () => {
    const d = aNouveauxProvisoires();
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    await d.svc.declarerProvisionOuverture('t', 'u', { compteProvision: '4991', montant: 0, dateReference: '2027-01-01', source: 's' });
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n1' })).rejects.toThrow(/4991 · 0\.00 sous la provision pour pertes de change passée par OmegaX jusqu'à la clôture précédente \(100000\.00\) · la perte déjà provisionnée par OmegaX serait dotée une seconde fois/);
    expect(d.solde('4991')).toBe(100_000);
  });

  it('N, N+1, N+2 ouverts sans à-nouveau · l’ouverture se lit récursivement · SOLDE FINAL = perte requise de 150 000', async () => {
    const d = dossier('SYSCOHADA');
    d.positions.n = [CREANCE];
    d.positions.n1 = [CREANCE];
    d.positions.n2 = [CREANCE];
    d.cours['2026-12-31'] = 1950;
    d.cours['2027-12-31'] = 1900;
    d.cours['2028-12-31'] = 1850;
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n1' });
    const l = await d.svc.provisionsOuverture('t', 'n2');
    expect(l.comptes.find((c) => c.compteProvision === '4991')).toMatchObject({
      soldeOuverturePropose: 100_000,
      statutSoldeOuverture: 'CLOTURE_PRECEDENTE',
      reserve: false,
    });
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n2' });
    expect(d.provisionDe('n2')!.lignes.map((l) => [l.compte, l.debit ?? 0, l.credit ?? 0])).toEqual([
      ['6591', 50_000, 0],
      ['4991', 0, 50_000],
    ]);
    expect(d.solde('4991')).toBe(150_000);
  });

  it('S7 · un N importé non déclaré se confronte jusque dans N+1, et l’ordre dit de déclarer N (sixième passe)', async () => {
    const d = dossier('SYSCOHADA', { aNouveau: { n: { statut: 'BROUILLARD', soldes: { '4991': 100_000 } } } });
    d.positions.n1 = [CREANCE];
    d.cours['2027-12-31'] = 1900;
    const r = await d.svc.calculer('t', { exerciceId: 'n1' });
    expect(r.provisionsOuvertureNonDeclarees).toEqual([
      { compteProvision: '4991', soldeOuverture: 100_000, explique: 0, statutOuverture: 'CLOTURE_PRECEDENTE' },
    ]);
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n1' })).rejects.toThrow(/porte une provision pour pertes de change à l'ouverture non déclarée \(4991\) · déclarez-la/);
    // m1 · N sans position · la réserve se dit AVANT « aucune position ».
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n' })).rejects.toThrow(/non déclarée \(4991\)/);
  });

  it('la réserve ne compare un solde comptable que sur une ouverture fiable · pas sur l’à-nouveau provisoire', async () => {
    const d = aNouveauxProvisoires();
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    const r = await d.svc.calculer('t', { exerciceId: 'n1' });
    expect(r.provisionsOuvertureNonDeclarees).toEqual([]);
  });
});

describe('A5 · cinquième relecture · un à-nouveau non provisoire PRIME sur la clôture précédente', () => {
  /** Solde du 4991 dans UN exercice (à-nouveau compris dans la doublure par l'écriture « bo »). */
  const soldeDans = (d: ReturnType<typeof dossier>, exerciceId: string) =>
    Math.round(
      d.ecrites
        .filter((e) => e.exerciceId === exerciceId)
        .flatMap((e) => e.lignes)
        .filter((l) => l.compte.startsWith('4991'))
        .reduce((t, l) => t + (l.credit ?? 0) - (l.debit ?? 0), 0) * 100,
    ) / 100;

  /** N-1 (« n ») gardé pour les comparatifs, bilan d'ouverture importé au brouillard dans N (« n1 ») · 100 000 au 4991, perte 60 000. */
  function repris(options: { repriseDeBalanceN1?: boolean } = {}) {
    const d = dossier('SYSCOHADA', {
      aNouveau: { n1: { statut: 'BROUILLARD', soldes: { '4991': 100_000 } } },
      horsAnterieurs: options.repriseDeBalanceN1 ? 1 : 0,
    });
    if (options.repriseDeBalanceN1) {
      d.ecrites.push({ id: 'rb', exerciceId: 'n', libelle: 'Reprise de balance', lignes: [{ compte: '5211', debit: 100_000 }, { compte: '4991', credit: 100_000 }] });
    }
    d.ecrites.push({ id: 'bo', exerciceId: 'n1', libelle: 'Bilan d’ouverture', aNouveau: true, lignes: [{ compte: '5211', debit: 100_000 }, { compte: '4991', credit: 100_000 }] });
    d.positions.n1 = [CREANCE];
    d.cours['2027-12-31'] = 1940;
    return d;
  }

  it('S1 · N-1 vide · l’ouverture de N est le bilan importé (100 000), réserve nommée, passage refusé', async () => {
    const d = repris();
    const r = await d.svc.calculer('t', { exerciceId: 'n1' });
    expect(r.provisionsOuvertureNonDeclarees).toEqual([
      { compteProvision: '4991', soldeOuverture: 100_000, explique: 0, statutOuverture: 'IMPORTE' },
    ]);
    // m3 · N-1 vide, la clôture précédente (0) ne dit rien de plus que la part expliquée · UN seul message.
    expect(r.avertissements.filter((a) => /4991/.test(a) && /(ne concorde pas|s'ouvre avec un solde)/.test(a))).toHaveLength(1);
    expect(r.avertissements.some((a) => /ne concorde pas/.test(a))).toBe(false);
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n1' })).rejects.toThrow(/non déclarée \(4991\)/);
    expect(soldeDans(d, 'n1')).toBe(100_000);
  });

  it('S1 · déclaré au début de N (100 000), N se réévalue · reprise 40 000 · SOLDE FINAL du 4991 = 60 000 requis', async () => {
    const d = repris();
    await d.svc.declarerProvisionOuverture('t', 'u', { compteProvision: '4991', montant: 100_000, dateReference: '2027-01-01', source: 'Bilan importé' });
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n1' });
    expect(d.provisionDe('n1')!.lignes.map((l) => [l.compte, l.debit ?? 0, l.credit ?? 0])).toEqual([
      ['4991', 40_000, 0],
      ['7591', 0, 40_000],
    ]);
    expect(soldeDans(d, 'n1')).toBe(60_000);
  });

  it('S1b · N-1 porte une reprise de balance · la déclaration juste n’est PAS refusée, la ligne de N-1 est signalée', async () => {
    const d = repris({ repriseDeBalanceN1: true });
    const avant = await d.svc.calculer('t', { exerciceId: 'n1' });
    expect(avant.avertissements.some((a) => /1 ligne\(s\) passée\(s\) hors réévaluation dans un exercice antérieur encore ouvert/.test(a))).toBe(true);
    await d.svc.declarerProvisionOuverture('t', 'u', { compteProvision: '4991', montant: 100_000, dateReference: '2027-01-01', source: 'Bilan importé' });
    const r = await d.svc.calculer('t', { exerciceId: 'n1' });
    expect(r.provisionsOuvertureExcessives).toEqual([]);
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n1' });
    expect(soldeDans(d, 'n1')).toBe(60_000);
  });

  it('S1b · retirer la version rouvre la réserve · jamais une dotation sans source', async () => {
    const d = repris({ repriseDeBalanceN1: true });
    const v = await d.svc.declarerProvisionOuverture('t', 'u', { compteProvision: '4991', montant: 100_000, dateReference: '2027-01-01', source: 'Bilan importé' });
    await d.svc.retirerProvisionOuverture('t', (v as { id: string }).id);
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n1' })).rejects.toThrow(/non déclarée \(4991\)/);
    expect(d.provisionDe('n1')).toBeUndefined();
  });

  it('réserve NOMMÉE quand l’à-nouveau est expliqué par OmegaX mais ne concorde pas avec la clôture précédente calculée', async () => {
    // N s'ouvre à 50 000 (non expliqués), OmegaX y dote 100 000 · la clôture de N vaut 150 000 ; l'à-nouveau de
    // N+1 porte 100 000, autant que les écritures OmegaX · seule la clôture précédente le contredit.
    const d = dossier('SYSCOHADA', {
      aNouveau: { n: { statut: 'VALIDEE', soldes: { '4991': 50_000 } }, n1: { statut: 'VALIDEE', soldes: { '4991': 100_000 } } },
    });
    d.ecrites.push({ id: 'p', exerciceId: 'n', libelle: 'Provision', lignes: [{ compte: '6591', debit: 100_000 }, { compte: '4991', credit: 100_000 }] });
    d.reevaluations.push({ id: 'p', exerciceId: 'n', dateReevaluation: new Date('2026-12-31'), ecritureProvisionId: 'p' });
    d.positions.n1 = [CREANCE];
    d.cours['2027-12-31'] = 1900;
    const r = await d.svc.calculer('t', { exerciceId: 'n1' });
    expect(r.provisionsOuvertureNonDeclarees).toEqual([
      { compteProvision: '4991', soldeOuverture: 100_000, explique: 100_000, statutOuverture: 'VALIDE' },
    ]);
    expect(r.avertissements.some((a) => /ne concorde pas avec le solde du compte reconstitué à la clôture de l'exercice précédent \(150000\.00\)/.test(a))).toBe(true);
    // M3 · la clôture dit seule ce qui ne va pas · UN message, le nommé.
    expect(r.avertissements.filter((a) => /(ne concorde pas|s'ouvre avec un solde)/.test(a) && /4991/.test(a))).toHaveLength(1);
  });

  it('le message de dépassement dit quoi déclarer et contre quel solde, sans conseiller le retrait', async () => {
    const d = repris();
    await d.svc.declarerProvisionOuverture('t', 'u', { compteProvision: '4991', montant: 150_000, dateReference: '2027-01-01', source: 's' });
    const r = await d.svc.calculer('t', { exerciceId: 'n1' });
    const m = r.avertissements.find((a) => /au-dessus du solde créditeur d'ouverture/.test(a))!;
    expect(m).toMatch(/déclarez entre 0\.00 et 100000\.00/);
    expect(r.avertissements.join(' ')).not.toMatch(/retirez/i);
  });
});

describe('A5 · cinquième relecture · le verrou dit qui le tient et ne masque rien', () => {
  it('le 409 dit le geste en cours, depuis quand, et quand le verrou échoit', async () => {
    const d = dossier('SYSCOHADA');
    d.prisma.verrouProvisionChange.lignes.set('t', {
      id: 'v',
      geste: 'DECLARATION',
      createdAt: new Date('2027-02-01T10:00:00Z'),
      echeance: new Date(Date.now() + 60_000),
    });
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n' })).rejects.toThrow(
      /Geste en cours · DECLARATION, depuis le 2027-02-01T10:00:00\.000Z ; le verrou échoit au plus tard le /,
    );
  });

  it('un retrait de verrou qui échoue ne masque jamais l’issue du geste · ni son erreur, ni son résultat', async () => {
    const d = dossier('SYSCOHADA');
    const retrait = d.prisma.verrouProvisionChange.deleteMany.getMockImplementation()!;
    d.prisma.verrouProvisionChange.deleteMany.mockImplementation((arg: { where: { id?: string } }) =>
      arg.where.id ? Promise.reject(new Error('base injoignable')) : retrait(arg as never),
    );
    // L'erreur d'origine (compte hors famille) remonte, pas celle du retrait.
    await expect(
      d.svc.declarerProvisionOuverture('t', 'u', { compteProvision: '6591', montant: 1, dateReference: '2026-01-01', source: 's' }),
    ).rejects.toThrow(/ne porte pas de provision/);
    d.prisma.verrouProvisionChange.lignes.clear();
    // Un geste réussi rend son résultat malgré le retrait manqué.
    await expect(
      d.svc.declarerProvisionOuverture('t', 'u', { compteProvision: '4991', montant: 0, dateReference: '2026-01-01', source: 's' }),
    ).resolves.toMatchObject({ compteProvision: '4991' });
  });
});

describe('A5 · sixième relecture · la clôture précédente reconstituée se confronte aussi à la part expliquée', () => {
  it('S8 · N réévalué, puis N-1 porte 100 000 et se clôt, son report arrive dans N · N+1 en réserve (160 000 contre 60 000)', async () => {
    const aNouveau: Partial<Record<'n' | 'n1' | 'n2', ANouveau>> = {};
    const d = dossier('SYSCOHADA', { aNouveau });
    d.positions.n1 = [CREANCE];
    d.positions.n2 = [CREANCE];
    d.cours['2027-12-31'] = 1940;
    d.cours['2028-12-31'] = 1940;
    // N (« n1 ») réévalué · dotation de 60 000.
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n1' });
    // Puis N-1 (« n ») reçoit 100 000 au 4991, se clôt, et son report réel arrive dans N.
    d.ecrites.push({ id: 'rb', exerciceId: 'n', libelle: 'Provision N-1', lignes: [{ compte: '6591', debit: 100_000 }, { compte: '4991', credit: 100_000 }] });
    d.statuts.n = 'CLOTURE';
    aNouveau.n1 = { statut: 'VALIDEE', soldes: { '4991': 100_000 } };
    // N+1 (« n2 ») sur à-nouveau provisoire.
    aNouveau.n2 = { statut: 'BROUILLARD', soldes: {}, provisoire: true };
    const r = await d.svc.calculer('t', { exerciceId: 'n2' });
    expect(r.provisionsOuvertureNonDeclarees).toEqual([
      { compteProvision: '4991', soldeOuverture: 160_000, explique: 60_000, statutOuverture: 'CLOTURE_PRECEDENTE' },
    ]);
    expect(r.avertissements.some((a) => /reconstitué de ses écritures \(160000\.00\), dont les réévaluations OmegaX n'expliquent que 60000\.00/.test(a))).toBe(true);
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n2' })).rejects.toThrow(/non déclarée \(4991\)/);
    // Déclarée (160 000 au début de N+1), la reprise de 100 000 passe · SOLDE FINAL = 60 000 requis.
    await d.svc.declarerProvisionOuverture('t', 'u', { compteProvision: '4991', montant: 160_000, dateReference: '2028-01-01', source: 'Report de N' });
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n2' });
    expect(d.provisionDe('n2')!.lignes.map((l) => [l.compte, l.debit ?? 0, l.credit ?? 0])).toEqual([
      ['4991', 100_000, 0],
      ['7591', 0, 100_000],
    ]);
    expect(d.solde('4991')).toBe(60_000);
  });

  it('S8b · bilan importé dans N APRÈS sa réévaluation · N+1 en réserve, puis SOLDE FINAL = 60 000 requis', async () => {
    const aNouveau: Partial<Record<'n' | 'n1' | 'n2', ANouveau>> = {};
    const d = dossier('SYSCOHADA', { aNouveau });
    d.positions.n = [CREANCE];
    d.positions.n1 = [CREANCE];
    d.cours['2026-12-31'] = 1940;
    d.cours['2027-12-31'] = 1940;
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    // Le bilan d'ouverture de N est importé après coup.
    aNouveau.n = { statut: 'BROUILLARD', soldes: { '4991': 100_000 } };
    d.ecrites.push({ id: 'bo', exerciceId: 'n', libelle: 'Bilan d’ouverture', aNouveau: true, lignes: [{ compte: '5211', debit: 100_000 }, { compte: '4991', credit: 100_000 }] });
    aNouveau.n1 = { statut: 'BROUILLARD', soldes: {}, provisoire: true };
    const r = await d.svc.calculer('t', { exerciceId: 'n1' });
    expect(r.provisionsOuvertureNonDeclarees).toEqual([
      { compteProvision: '4991', soldeOuverture: 160_000, explique: 60_000, statutOuverture: 'CLOTURE_PRECEDENTE' },
    ]);
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n1' })).rejects.toThrow(/non déclarée \(4991\)/);
    await d.svc.declarerProvisionOuverture('t', 'u', { compteProvision: '4991', montant: 160_000, dateReference: '2027-01-01', source: 'Bilan importé et réévaluation de N' });
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n1' });
    expect(d.solde('4991')).toBe(60_000);
  });

  it('S12 (m2) · N-1 importé à 50 000 (litige), repris à la main, clôturé · N s’ouvre à 0, aucune réserve', async () => {
    const d = dossier('SYSCOHADA', {
      aNouveau: { n: { statut: 'BROUILLARD', soldes: { '4991': 50_000 } }, n1: { statut: 'VALIDEE', soldes: { '4991': 0 } } },
    });
    d.ecrites.push(
      { id: 'bo', exerciceId: 'n', libelle: 'Bilan d’ouverture', aNouveau: true, lignes: [{ compte: '5211', debit: 50_000 }, { compte: '4991', credit: 50_000 }] },
      { id: 'lit', exerciceId: 'n', libelle: 'Reprise du litige', lignes: [{ compte: '4991', debit: 50_000 }, { compte: '7591', credit: 50_000 }] },
    );
    d.statuts.n = 'CLOTURE';
    d.positions.n1 = [CREANCE];
    d.cours['2027-12-31'] = 1940;
    const r = await d.svc.calculer('t', { exerciceId: 'n1' });
    expect(r.provisionsOuvertureNonDeclarees).toEqual([]);
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n1' });
    expect(d.provisionDe('n1')!.lignes.map((l) => [l.compte, l.debit ?? 0, l.credit ?? 0])).toEqual([
      ['6591', 60_000, 0],
      ['4991', 0, 60_000],
    ]);
  });
});

describe('A5 · septième relecture · la version se compare à la provision du MODULE, le solde reconstitué la borne', () => {
  /** S8 · N (« n1 ») réévalué (60 000 de change), N-1 (« n ») porte 100 000 au 4991 et se clôt, N+1 (« n2 ») provisoire. */
  async function s8() {
    const aNouveau: Partial<Record<'n' | 'n1' | 'n2', ANouveau>> = {};
    const d = dossier('SYSCOHADA', { aNouveau });
    d.positions.n1 = [CREANCE];
    d.positions.n2 = [CREANCE];
    d.cours['2027-12-31'] = 1940;
    d.cours['2028-12-31'] = 1940;
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n1' });
    d.ecrites.push({ id: 'rb', exerciceId: 'n', libelle: 'Provision N-1', lignes: [{ compte: '6591', debit: 100_000 }, { compte: '4991', credit: 100_000 }] });
    d.statuts.n = 'CLOTURE';
    aNouveau.n1 = { statut: 'VALIDEE', soldes: { '4991': 100_000 } };
    aNouveau.n2 = { statut: 'BROUILLARD', soldes: {}, provisoire: true };
    return d;
  }

  it('S8, lecture LITIGE · les 100 000 de N-1 sont un litige · on déclare 60 000, accepté · SOLDE FINAL 160 000 (60 000 + litige)', async () => {
    const d = await s8();
    const avant = await d.svc.calculer('t', { exerciceId: 'n2' });
    // Les deux issues sont dites, et rien ne prétend qu'OmegaX a passé le solde reconstitué.
    const message = avant.avertissements.find((a) => /reconstitué de ses écritures \(160000\.00\)/.test(a))!;
    expect(message).toMatch(/déclarez au début de l'exercice la part de change \(au plus 160000\.00\), ou clôturez l'exercice précédent/);
    expect(avant.avertissements.join(' ')).not.toMatch(/telle qu'OmegaX l'a passée/);
    await d.svc.declarerProvisionOuverture('t', 'u', { compteProvision: '4991', montant: 60_000, dateReference: '2028-01-01', source: 'Part de change' });
    const r = await d.svc.calculer('t', { exerciceId: 'n2' });
    expect(r.provisionsOuvertureExcessives).toEqual([]);
    expect(r.provisionsOuvertureNonDeclarees).toEqual([]);
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n2' });
    expect(d.provisionDe('n2')).toBeUndefined();
    expect(d.solde('4991')).toBe(160_000);
  });

  it('S8 · la déclaration est BORNÉE par le solde reconstitué · 170 000 refusés au passage', async () => {
    const d = await s8();
    await d.svc.declarerProvisionOuverture('t', 'u', { compteProvision: '4991', montant: 170_000, dateReference: '2028-01-01', source: 's' });
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n2' })).rejects.toThrow(/4991 · 170000\.00 au-dessus du solde reconstitué à la clôture de l'exercice précédent \(160000\.00\) · une reprise rendrait le compte débiteur ; déclarez entre 60000\.00 et 160000\.00/);
  });

  it('S8b, lecture LITIGE · bilan importé de 100 000 (80 000 de litige, 20 000 de change) · 80 000 déclarés · SOLDE FINAL 140 000', async () => {
    const aNouveau: Partial<Record<'n' | 'n1' | 'n2', ANouveau>> = {};
    const d = dossier('SYSCOHADA', { aNouveau });
    d.positions.n = [CREANCE];
    d.positions.n1 = [CREANCE];
    d.cours['2026-12-31'] = 1940;
    d.cours['2027-12-31'] = 1940;
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    aNouveau.n = { statut: 'BROUILLARD', soldes: { '4991': 100_000 } };
    d.ecrites.push({ id: 'bo', exerciceId: 'n', libelle: 'Bilan d’ouverture', aNouveau: true, lignes: [{ compte: '5211', debit: 100_000 }, { compte: '4991', credit: 100_000 }] });
    aNouveau.n1 = { statut: 'BROUILLARD', soldes: {}, provisoire: true };
    // La part de change · les 60 000 de N et 20 000 du bilan importé.
    await d.svc.declarerProvisionOuverture('t', 'u', { compteProvision: '4991', montant: 80_000, dateReference: '2027-01-01', source: 'Part de change' });
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n1' });
    expect(d.provisionDe('n1')!.lignes.map((l) => [l.compte, l.debit ?? 0, l.credit ?? 0])).toEqual([
      ['4991', 20_000, 0],
      ['7591', 0, 20_000],
    ]);
    expect(d.solde('4991')).toBe(140_000);
  });

  it('L1 · litige saisi à la main dans N+1 ouvert · N+2 accepte 80 000 de change contre 110 000 de solde · SOLDE FINAL 110 000', async () => {
    const d = dossier('SYSCOHADA');
    d.positions.n = [CREANCE];
    d.positions.n1 = [CREANCE];
    d.positions.n2 = [CREANCE];
    d.cours['2026-12-31'] = 1950;
    d.cours['2027-12-31'] = 1920;
    d.cours['2028-12-31'] = 1920;
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    d.ecrites.push({ id: 'lit', exerciceId: 'n1', libelle: 'Litige', lignes: [{ compte: '6591', debit: 30_000 }, { compte: '4991', credit: 30_000 }] });
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n1' });
    const avant = await d.svc.calculer('t', { exerciceId: 'n2' });
    expect(avant.provisionsOuvertureNonDeclarees).toEqual([
      { compteProvision: '4991', soldeOuverture: 110_000, explique: 80_000, statutOuverture: 'CLOTURE_PRECEDENTE' },
    ]);
    await d.svc.declarerProvisionOuverture('t', 'u', { compteProvision: '4991', montant: 80_000, dateReference: '2028-01-01', source: 'Part de change' });
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n2' });
    expect(d.provisionDe('n2')).toBeUndefined();
    expect(d.solde('4991')).toBe(110_000);
  });

  it('mineur 3 · un antérieur ouvert SANS position mais à version incohérente bloque, et le dit', async () => {
    const d = dossier('SYSCOHADA', {
      aNouveau: { n: { statut: 'BROUILLARD', soldes: { '4991': 30_000 } } },
      declarations: [{ compteProvision: '4991', montant: 50_000, dateReference: new Date('2026-01-01') }],
    });
    d.positions.n1 = [CREANCE];
    d.cours['2027-12-31'] = 1900;
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n1' })).rejects.toThrow(
      /porte une provision pour pertes de change déclarée à l'ouverture qui ne concorde pas avec son ouverture \(4991 · 50000\.00 au-dessus du solde créditeur d'ouverture \(30000\.00\).*\) · mettez-la à jour/,
    );
  });

  it('mineur 3 · version incohérente SANS rien à ajuster (version à 0 contre 60 000 du module) · l’antérieur bloque quand même', async () => {
    const d = dossier('SYSCOHADA');
    d.positions.n = [CREANCE];
    d.positions.n2 = [CREANCE];
    d.cours['2026-12-31'] = 1940;
    d.cours['2028-12-31'] = 1940;
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    // N+1 (« n1 ») · aucune position, version déclarée à 0 · requise 0, en place 0, rien à ajuster.
    await d.svc.declarerProvisionOuverture('t', 'u', { compteProvision: '4991', montant: 0, dateReference: '2027-01-01', source: 's' });
    const r1 = await d.svc.calculer('t', { exerciceId: 'n1' });
    expect(r1.ajustementsProvision.every((a) => a.dotation === 0 && a.reprise === 0)).toBe(true);
    expect(r1.provisionsOuvertureExcessives).toHaveLength(1);
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n2' })).rejects.toThrow(/2027-01-01 au 2027-12-31.*ne concorde pas avec son ouverture \(4991 · 0\.00 sous la provision pour pertes de change passée par OmegaX jusqu'à la clôture précédente \(60000\.00\)/);
  });

  it('M3 · un message par cause · nommé seul, principal seul, ou les deux quand les trois montants diffèrent', async () => {
    // Les trois diffèrent · à-nouveau 100 000, clôture de N reconstituée 30 000, expliqué 0.
    const d = dossier('SYSCOHADA', { aNouveau: { n1: { statut: 'VALIDEE', soldes: { '4991': 100_000 } } } });
    d.ecrites.push({ id: 'm', exerciceId: 'n', libelle: 'Litige N', lignes: [{ compte: '6591', debit: 30_000 }, { compte: '4991', credit: 30_000 }] });
    d.positions.n1 = [CREANCE];
    d.cours['2027-12-31'] = 1900;
    const r = await d.svc.calculer('t', { exerciceId: 'n1' });
    const du4991 = r.avertissements.filter((a) => /(ne concorde pas|s'ouvre avec un solde)/.test(a) && /4991/.test(a));
    expect(du4991).toHaveLength(2);
    expect(du4991.filter((a) => /ne concorde pas/.test(a))).toHaveLength(1);
  });

  it('X4 · S8 avec 0 déclaré au lieu des 60 000 du module · refusé sous le plancher · corrigé à 60 000, SOLDE FINAL 160 000', async () => {
    const d = await s8();
    await d.svc.declarerProvisionOuverture('t', 'u', { compteProvision: '4991', montant: 0, dateReference: '2028-01-01', source: 's' });
    // Accepté, il dotait 60 000 une seconde fois · 220 000 pour 160 000.
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n2' })).rejects.toThrow(
      /4991 · 0\.00 sous la provision pour pertes de change passée par OmegaX jusqu'à la clôture précédente \(60000\.00\) · la perte déjà provisionnée par OmegaX serait dotée une seconde fois ; déclarez entre 60000\.00 et 160000\.00/,
    );
    expect(d.provisionDe('n2')).toBeUndefined();
    await d.svc.declarerProvisionOuverture('t', 'u', { compteProvision: '4991', montant: 60_000, dateReference: '2028-01-01', source: 's' });
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n2' });
    expect(d.solde('4991')).toBe(160_000);
  });
});

describe('A5 · huitième relecture · une version se lit entre un PLANCHER et un PLAFOND', () => {
  /**
   * Version PÉRIMÉE · 0 déclaré au début de N+1 AVANT la réévaluation de N
   * (vraie à ce moment), puis N dote 100 000 (créance de 1 000 USD à 2 000,
   * clôture à 1 900) ; N+1 sur à-nouveaux provisoires, clôture à 1 930 ·
   * provision requise 70 000. `ajout` passe une écriture à la main dans N.
   */
  async function perimee(ajout?: (d: ReturnType<typeof dossier>) => void, clore = false) {
    const aNouveau: Partial<Record<'n' | 'n1' | 'n2', ANouveau>> = { n1: { statut: 'BROUILLARD', soldes: {}, provisoire: true } };
    const d = dossier('SYSCOHADA', { aNouveau });
    d.positions.n = [CREANCE];
    d.positions.n1 = [CREANCE];
    d.cours['2026-12-31'] = 1900;
    d.cours['2027-12-31'] = 1930;
    await d.svc.declarerProvisionOuverture('t', 'u', { compteProvision: '4991', montant: 0, dateReference: '2027-01-01', source: 's' });
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    ajout?.(d);
    if (clore) {
      // N clôturé · l'à-nouveau de N+1 est validé, fiable, et porte le solde de N.
      d.statuts.n = 'CLOTURE';
      aNouveau.n1 = { statut: 'VALIDEE', soldes: { '4991': d.solde('4991') } };
    }
    return d;
  }
  const manuel = (montant: number, libelle: string) => (d: ReturnType<typeof dossier>) =>
    d.ecrites.push({
      id: `m-${libelle}`,
      exerciceId: 'n',
      libelle,
      lignes: montant >= 0 ? [{ compte: '6591', debit: montant }, { compte: '4991', credit: montant }] : [{ compte: '4991', debit: -montant }, { compte: '7591', credit: -montant }],
    });
  const corriger = (d: ReturnType<typeof dossier>, montant: number, motif?: string) =>
    d.svc.declarerProvisionOuverture('t', 'u', { compteProvision: '4991', montant, dateReference: '2027-01-01', source: 's', motif });
  const SOUS_LE_PLANCHER = /la perte déjà provisionnée par OmegaX serait dotée une seconde fois/;

  it('X0 · rien de manuel · refusé sous le plancher, la provision du module montrée à côté de la version', async () => {
    const d = await perimee();
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n1' })).rejects.toThrow(SOUS_LE_PLANCHER);
    const l = await d.svc.provisionsOuverture('t', 'n1');
    expect(l.comptes.find((c) => c.compteProvision === '4991')).toMatchObject({
      provisionEnPlaceOuverture: 0,
      provisionModuleOuverture: 100_000,
      plancherVersion: 100_000,
      plafondVersion: 100_000,
      horsBornes: 'PLANCHER',
      depasseSoldeOuverture: true,
    });
  });

  it('X1 · un franc au 4991 dans N · refusé (plancher 100 000, plafond 100 001) · corrigé à 100 000, SOLDE FINAL 70 001', async () => {
    const d = await perimee(manuel(1, 'Arrondi'));
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n1' })).rejects.toThrow(
      /4991 · 0\.00 sous la provision pour pertes de change passée par OmegaX jusqu'à la clôture précédente \(100000\.00\) · la perte déjà provisionnée par OmegaX serait dotée une seconde fois ; déclarez entre 100000\.00 et 100001\.00 \(le solde reconstitué à la clôture de l'exercice précédent\)/,
    );
    expect(d.provisionDe('n1')).toBeUndefined();
    await corriger(d, 100_000);
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n1' });
    // 70 000 de change requis, plus le franc passé à la main.
    expect(d.solde('4991')).toBe(70_001);
  });

  it('X1d · un franc au DÉBIT du 4991 dans N · refusé · le plafond 99 999 borne la correction, SOLDE FINAL 70 000', async () => {
    const d = await perimee(manuel(-1, 'Arrondi'));
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n1' })).rejects.toThrow(/déclarez entre 99999\.00 et 99999\.00/);
    // 100 000 dépasse le solde reconstitué · une reprise le rendrait débiteur.
    await corriger(d, 100_000);
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n1' })).rejects.toThrow(/4991 · 100000\.00 au-dessus du solde reconstitué/);
    await corriger(d, 99_999);
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n1' });
    expect(d.solde('4991')).toBe(70_000);
  });

  it('X2 · litige de 100 000 au 4991 dans N · refusé (plancher 100 000, plafond 200 000) · corrigé, SOLDE FINAL 170 000', async () => {
    const d = await perimee(manuel(100_000, 'Litige'));
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n1' })).rejects.toThrow(/déclarez entre 100000\.00 et 200000\.00/);
    await corriger(d, 100_000);
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n1' });
    expect(d.solde('4991')).toBe(170_000);
  });

  it('X3 · N clôturé, ouverture VALIDÉE de 100 000 · la version 0 est refusée contre le solde fiable aussi · corrigée, SOLDE FINAL 70 000', async () => {
    const d = await perimee(undefined, true);
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n1' })).rejects.toThrow(
      /4991 · 0\.00 sous la provision .*\(100000\.00\) · la perte déjà provisionnée par OmegaX serait dotée une seconde fois ; déclarez entre 100000\.00 et 100000\.00 \(le solde créditeur d'ouverture\)/,
    );
    expect(d.provisionDe('n1')).toBeUndefined();
    await corriger(d, 100_000);
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n1' });
    expect(d.solde('4991')).toBe(70_000);
  });

  it('X5 · la version corrigée à 100 000, entre ses bornes, passe · SOLDE FINAL 70 000', async () => {
    const d = await perimee();
    await corriger(d, 100_000);
    const r = await d.svc.calculer('t', { exerciceId: 'n1' });
    expect(r.provisionsOuvertureExcessives).toEqual([]);
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n1' });
    expect(d.solde('4991')).toBe(70_000);
  });

  it('sous le plancher, le motif de correction SEUL ne passe pas · il n’ouvre jamais le plancher', async () => {
    const d = await perimee();
    await corriger(d, 0, 'Correction de la version');
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n1' })).rejects.toThrow(SOUS_LE_PLANCHER);
    expect(d.provisionDe('n1')).toBeUndefined();
    expect(d.solde('4991')).toBe(100_000);
  });

  it('sous le plancher, la CONTESTATION expresse de la provision du module, avec son motif, passe', async () => {
    const d = await perimee();
    await d.svc.declarerProvisionOuverture('t', 'u', {
      compteProvision: '4991',
      montant: 0,
      dateReference: '2027-01-01',
      source: 's',
      provisionModuleContestee: true,
      motifContestation: 'La réévaluation de N a doté une créance déjà encaissée.',
    });
    const l = await d.svc.provisionsOuverture('t', 'n1');
    expect(l.comptes.find((c) => c.compteProvision === '4991')!.enVigueur).toMatchObject({
      provisionModuleContestee: true,
      motifContestation: 'La réévaluation de N a doté une créance déjà encaissée.',
    });
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n1' });
    // Le cabinet a déclaré 0 · le module dote 70 000 de plus, et c'est ce qu'il a écrit et motivé.
    expect(d.solde('4991')).toBe(170_000);
  });

  it('la contestation exige son propre motif, et un motif de contestation sans contestation est refusé', async () => {
    const d = await perimee();
    await expect(
      d.svc.declarerProvisionOuverture('t', 'u', { compteProvision: '4991', montant: 0, dateReference: '2027-01-01', source: 's', motif: 'm', provisionModuleContestee: true }),
    ).rejects.toThrow(/dites pourquoi \(motif de la contestation, distinct du motif de correction\)/);
    await expect(
      d.svc.declarerProvisionOuverture('t', 'u', { compteProvision: '4991', montant: 0, dateReference: '2027-01-01', source: 's', provisionModuleContestee: true, motifContestation: '   ' }),
    ).rejects.toThrow(/dites pourquoi/);
    await expect(
      d.svc.declarerProvisionOuverture('t', 'u', { compteProvision: '4991', montant: 0, dateReference: '2027-01-01', source: 's', motifContestation: 'x' }),
    ).rejects.toThrow(/sans contestation déclarée/);
  });

  const contester = (d: ReturnType<typeof dossier>, dateReference: string) =>
    d.svc.declarerProvisionOuverture('t', 'u', {
      compteProvision: '4991',
      montant: 0,
      dateReference,
      source: 's',
      provisionModuleContestee: true,
      motifContestation: 'Provision OmegaX sans fondement',
    });
  const A_CHANGE = /la provision passée par OmegaX a changé depuis la contestation/;

  it('la contestation FIGE, côté serveur, la provision du module qu’elle conteste', async () => {
    const d = await perimee();
    await contester(d, '2027-01-01');
    const l = await d.svc.provisionsOuverture('t', 'n1');
    expect(l.comptes.find((c) => c.compteProvision === '4991')!.enVigueur).toMatchObject({ provisionModuleContesteeMontant: 100_000 });
  });

  it('Y14 · le figé est la provision du MODULE, jamais le solde · solde 120 000, module 100 000 → figé 100 000', async () => {
    const d = await perimee(manuel(20_000, 'Litige'));
    await contester(d, '2027-01-01');
    const c = (await d.svc.provisionsOuverture('t', 'n1')).comptes.find((x) => x.compteProvision === '4991')!;
    expect(c).toMatchObject({ provisionModuleOuverture: 100_000, plafondVersion: 120_000 });
    expect(c.enVigueur).toMatchObject({ provisionModuleContesteeMontant: 100_000 });
  });

  it('Z3 · la retouche REFIGE au module du jour (50 000 → 150 000), et sans contestation remet le figé à null', async () => {
    const d = dossier('SYSCOHADA');
    d.positions.n = [CREANCE];
    d.positions.n1 = [CREANCE];
    d.cours['2026-12-31'] = 1950;
    d.cours['2027-12-31'] = 1850;
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    await contester(d, '2028-01-01');
    const fige = async () =>
      (await d.svc.provisionsOuverture('t', 'n2')).comptes.find((x) => x.compteProvision === '4991')!.enVigueur!.provisionModuleContesteeMontant;
    expect(await fige()).toBe(50_000);
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n1' });
    await contester(d, '2028-01-01');
    expect(await fige()).toBe(150_000);
    await d.svc.declarerProvisionOuverture('t', 'u', { compteProvision: '4991', montant: 150_000, dateReference: '2028-01-01', source: 's' });
    expect(await fige()).toBeNull();
    expect((await d.svc.provisionsOuverture('t', 'n2')).comptes.find((x) => x.compteProvision === '4991')!.enVigueur).toMatchObject({
      provisionModuleContestee: false,
      motifContestation: null,
    });
  });

  it('Y9 · 0 contesté quand le module montrait 0, puis N dote 100 000 · refusé (« a changé ») · corrigé, SOLDE FINAL 70 000', async () => {
    const d = dossier('SYSCOHADA', { aNouveau: { n1: { statut: 'BROUILLARD', soldes: {}, provisoire: true } } });
    d.positions.n = [CREANCE];
    d.positions.n1 = [CREANCE];
    d.cours['2026-12-31'] = 1900;
    d.cours['2027-12-31'] = 1930;
    await contester(d, '2027-01-01');
    expect((await d.svc.provisionsOuverture('t', 'n1')).comptes.find((c) => c.compteProvision === '4991')!.enVigueur).toMatchObject({
      provisionModuleContesteeMontant: 0,
    });
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    // Sans le rattachement au montant, 70 000 de plus · 170 000 pour 70 000.
    const r = await d.svc.calculer('t', { exerciceId: 'n1' });
    expect(r.provisionsOuvertureExcessives).toEqual([expect.objectContaining({ borne: 'PLANCHER', contesteeAuMontant: 0, provisionModule: 100_000 })]);
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n1' })).rejects.toThrow(
      /4991 · la provision passée par OmegaX a changé depuis la contestation \(0\.00 contestés, 100000\.00 aujourd'hui\) · la perte provisionnée depuis serait dotée une seconde fois ; confirmez ou corrigez/,
    );
    expect(d.provisionDe('n1')).toBeUndefined();
    await d.svc.declarerProvisionOuverture('t', 'u', { compteProvision: '4991', montant: 100_000, dateReference: '2027-01-01', source: 's' });
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n1' });
    expect(d.solde('4991')).toBe(70_000);
  });

  it('Y9b · la contestation visait les 50 000 de N-1, puis N dote 100 000 de plus · refusé · corrigé, SOLDE FINAL 70 000', async () => {
    const d = dossier('SYSCOHADA');
    d.positions.n = [CREANCE];
    d.positions.n1 = [CREANCE];
    d.positions.n2 = [CREANCE];
    d.cours['2026-12-31'] = 1950;
    d.cours['2027-12-31'] = 1850;
    d.cours['2028-12-31'] = 1930;
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    await contester(d, '2028-01-01');
    expect((await d.svc.provisionsOuverture('t', 'n2')).comptes.find((c) => c.compteProvision === '4991')!.enVigueur).toMatchObject({
      provisionModuleContesteeMontant: 50_000,
    });
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n1' });
    expect(d.solde('4991')).toBe(150_000);
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n2' })).rejects.toThrow(/\(50000\.00 contestés, 150000\.00 aujourd'hui\)/);
    expect(d.provisionDe('n2')).toBeUndefined();
    await d.svc.declarerProvisionOuverture('t', 'u', { compteProvision: '4991', montant: 150_000, dateReference: '2028-01-01', source: 's' });
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n2' });
    expect(d.solde('4991')).toBe(70_000);
  });

  it('SYCEBNL · la même règle au 194 · version périmée refusée, corrigée, SOLDE FINAL juste', async () => {
    const aNouveau: Partial<Record<'n' | 'n1' | 'n2', ANouveau>> = { n1: { statut: 'BROUILLARD', soldes: {}, provisoire: true } };
    const d = dossier('SYCEBNL', { aNouveau });
    d.positions.n = [CREANCE];
    d.positions.n1 = [CREANCE];
    d.cours['2026-12-31'] = 1900;
    d.cours['2027-12-31'] = 1930;
    await d.svc.declarerProvisionOuverture('t', 'u', { compteProvision: '194', montant: 0, dateReference: '2027-01-01', source: 's' });
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n' });
    await expect(d.svc.reevaluer('t', 'u', { exerciceId: 'n1' })).rejects.toThrow(/194 · 0\.00 sous la provision/);
    await d.svc.declarerProvisionOuverture('t', 'u', { compteProvision: '194', montant: 100_000, dateReference: '2027-01-01', source: 's' });
    await d.svc.reevaluer('t', 'u', { exerciceId: 'n1' });
    expect(d.solde('194')).toBe(70_000);
  });
});

describe('A5 · troisième relecture · points 1, 2 et 4', () => {
  it('1 · pendant une réserve, dotation et reprise sont dites provisoires', async () => {
    const d = dossier('SYSCOHADA', { aNouveau: { n: { statut: 'VALIDEE', soldes: { '4991': 100_000 } } } });
    d.positions.n = [CREANCE];
    d.cours['2026-12-31'] = 1900;
    const r = await d.svc.calculer('t', { exerciceId: 'n' });
    expect(r.ajustementsProvision[0]).toMatchObject({ montantsProvisoires: true, dotation: 100_000 });
    const sansReserve = dossier('SYSCOHADA');
    sansReserve.positions.n = [CREANCE];
    sansReserve.cours['2026-12-31'] = 1900;
    const r2 = await sansReserve.svc.calculer('t', { exerciceId: 'n' });
    expect(r2.ajustementsProvision[0]).toMatchObject({ montantsProvisoires: false });
  });

  it('2 · le libellé de la réserve suit le sens de l’écart', async () => {
    const d = dossier('SYSCOHADA', { aNouveau: { n1: { statut: 'VALIDEE', soldes: { '4991': 50_000 } } } });
    d.ecrites.push({ id: 'p', exerciceId: 'n', libelle: 'Provision', lignes: [{ compte: '6591', debit: 100_000 }, { compte: '4991', credit: 100_000 }] });
    d.reevaluations.push({ id: 'p', exerciceId: 'n', dateReevaluation: new Date('2026-12-31'), ecritureProvisionId: 'p' });
    d.positions.n1 = [CREANCE];
    d.cours['2027-12-31'] = 1900;
    const r = await d.svc.calculer('t', { exerciceId: 'n1' });
    const message = r.avertissements.find((a) => /4991 s'ouvre/.test(a))!;
    expect(message).toMatch(/en expliquent 100000\.00, plus que ce solde/);
    expect(message).not.toMatch(/n'expliquent que/);
  });
});

describe('A5 · la déclaration d’ouverture, ses refus', () => {
  it('compte hors de la famille du référentiel refusé · le 4997 au SYCEBNL, le 4991 aussi', () => {
    const base = { montant: 1, dateReference: '2026-01-01', source: 'Balance d’ouverture' };
    expect(motifRefusDeclarationOuverture('SYCEBNL' as never, { ...base, compteProvision: '4997' })).toMatch(/comptes admis : 194\./);
    expect(motifRefusDeclarationOuverture('SYCEBNL' as never, { ...base, compteProvision: '4991' })).toMatch(/ne porte pas/);
    expect(motifRefusDeclarationOuverture('SYSCOHADA' as never, { ...base, compteProvision: '6591' })).toMatch(/4991, 4997, 194/);
    expect(motifRefusDeclarationOuverture('SYSCOHADA' as never, { ...base, compteProvision: '4997' })).toBeNull();
    expect(motifRefusDeclarationOuverture('SYCEBNL' as never, { ...base, compteProvision: '194' })).toBeNull();
  });

  it('source absente, montant négatif ou date illisible refusés', () => {
    const base = { compteProvision: '194', montant: 1, dateReference: '2026-01-01', source: 'PV' };
    expect(motifRefusDeclarationOuverture('SYSCOHADA' as never, { ...base, source: '   ' })).toMatch(/source/);
    expect(motifRefusDeclarationOuverture('SYSCOHADA' as never, { ...base, montant: -1 })).toMatch(/positif ou nul/);
    expect(motifRefusDeclarationOuverture('SYSCOHADA' as never, { ...base, dateReference: 'x' })).toMatch(/date/);
    expect(motifRefusDeclarationOuverture('SYSCOHADA' as never, { ...base, montant: 0 })).toBeNull();
  });

  it('la version en vigueur est la plus récente dont le début est AU PLUS TARD la date', () => {
    const v = [{ dateReference: new Date('2026-01-01') }, { dateReference: new Date('2027-01-01') }];
    expect(versionEnVigueur(v, new Date('2026-12-31'))).toBe(v[0]);
    expect(versionEnVigueur(v, new Date('2027-01-01'))).toBe(v[1]);
    expect(versionEnVigueur(v, new Date('2025-12-31'))).toBeUndefined();
  });

  type Version = { id: string; compteProvision: string; montant: number; dateReference: Date; updatedAt: Date };
  type Passee = { dateReevaluation: Date; createdAt: Date };
  function service(versions: Version[], passees: Passee[], debutsExercices = ['2026-01-01', '2027-01-01']) {
    const prisma = {
      $transaction: jest.fn(),
      verrouProvisionChange: verrouEnMemoire(),
      tenant: { findUnique: jest.fn().mockResolvedValue({ referentiel: 'SYSCOHADA' }) },
      exercice: {
        findFirst: jest.fn(({ where }: { where: { dateDebut: Date } }) =>
          Promise.resolve(debutsExercices.includes(where.dateDebut.toISOString().slice(0, 10)) ? { id: 'x' } : null),
        ),
      },
      provisionChangeOuverture: {
        findMany: jest.fn().mockResolvedValue(versions),
        findFirst: jest.fn(({ where }: { where: { id?: string; dateReference?: { gt: Date } } }) =>
          Promise.resolve(
            where.id
              ? (versions.find((v) => v.id === where.id) ?? null)
              : (versions.find((v) => v.dateReference.getTime() > where.dateReference!.gt.getTime()) ?? null),
          ),
        ),
        create: jest.fn(({ data }) => Promise.resolve({ id: 'n', ...data })),
        update: jest.fn(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
        delete: jest.fn().mockResolvedValue({}),
      },
      // Honore la requête · période de dates, et « enregistrée après » quand elle est posée.
      reevaluation: {
        findFirst: jest.fn(({ where }: { where: { createdAt?: { gt: Date }; dateReevaluation: { gte: Date; lt?: Date } } }) =>
          Promise.resolve(
            passees.find(
              (r) =>
                (!where.createdAt || r.createdAt.getTime() > where.createdAt.gt.getTime()) &&
                r.dateReevaluation.getTime() >= where.dateReevaluation.gte.getTime() &&
                (!where.dateReevaluation.lt || r.dateReevaluation.getTime() < where.dateReevaluation.lt.getTime()),
            ) ?? null,
          ),
        ),
      },
    };
    return { prisma, svc: new DevisesService(prisma as never, {} as never) };
  }
  const DTO = { compteProvision: '4991', montant: 100_000, dateReference: '2026-01-01', source: 'Liasse 2025, note 28' };
  const N_PASSEE: Passee = { dateReevaluation: new Date('2026-12-31'), createdAt: new Date('2027-01-15') };
  const V2026: Version = { id: 'd1', compteProvision: '4991', montant: 90_000, dateReference: new Date('2026-01-01'), updatedAt: new Date('2026-03-01') };

  it('Q3 · une date qui n’est le début d’aucun exercice est refusée, nommée', async () => {
    const s = service([], []);
    await expect(s.svc.declarerProvisionOuverture('t', 'u', { ...DTO, dateReference: '2026-06-30' })).rejects.toThrow(
      /2026-06-30 n'est le début d'aucun exercice du dossier.*existant au début de l'exercice/,
    );
    expect(s.prisma.provisionChangeOuverture.create).not.toHaveBeenCalled();
  });

  it('crée, puis retouche PAR IDENTIFIANT la version de même date tant qu’aucune réévaluation ne l’a utilisée', async () => {
    const neuve = service([], []);
    await neuve.svc.declarerProvisionOuverture('t', 'u', DTO);
    expect(neuve.prisma.provisionChangeOuverture.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: 't', compteProvision: '4991', source: 'Liasse 2025, note 28', createdBy: 'u', motif: null }),
    });
    const retouche = service([V2026], []);
    await retouche.svc.declarerProvisionOuverture('t', 'u', DTO);
    expect(retouche.prisma.provisionChangeOuverture.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'd1' } }));
  });

  it('Q2 · une version UTILISÉE ne se retouche ni ne se retire · la correction est une nouvelle version', async () => {
    const s = service([V2026], [N_PASSEE]);
    await expect(s.svc.declarerProvisionOuverture('t', 'u', DTO)).rejects.toThrow(
      /a servi à la réévaluation du 2026-12-31 · elle ne se modifie plus\. Déclarez une nouvelle version/,
    );
    await expect(s.svc.retirerProvisionOuverture('t', 'd1')).rejects.toThrow(/ne se modifie plus/);
    expect(s.prisma.provisionChangeOuverture.update).not.toHaveBeenCalled();
    expect(s.prisma.provisionChangeOuverture.delete).not.toHaveBeenCalled();
    // « Utilisée » · une réévaluation EXISTE dans sa période, constat lu sous le verrou.
    expect(s.prisma.reevaluation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 't', annuleeLe: null, dateReevaluation: { gte: V2026.dateReference } },
      }),
    );
  });

  it('Q2 · la nouvelle version, datée plus tard, exige son MOTIF, et l’historique reste', async () => {
    const s = service([V2026], [N_PASSEE]);
    const plusTard = { ...DTO, dateReference: '2027-01-01', montant: 80_000 };
    await expect(s.svc.declarerProvisionOuverture('t', 'u', plusTard)).rejects.toThrow(/porte son motif/);
    await s.svc.declarerProvisionOuverture('t', 'u', { ...plusTard, motif: 'Litige reclassé hors change' });
    expect(s.prisma.provisionChangeOuverture.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ dateReference: new Date('2027-01-01'), motif: 'Litige reclassé hors change' }),
    });
    expect(s.prisma.provisionChangeOuverture.update).not.toHaveBeenCalled();
    expect(s.prisma.provisionChangeOuverture.delete).not.toHaveBeenCalled();
  });

  it('4 · un exercice NOUVEAU après une version encore inutilisée se déclare sans motif', async () => {
    const s = service([V2026], []);
    await s.svc.declarerProvisionOuverture('t', 'u', { ...DTO, dateReference: '2027-01-01' });
    expect(s.prisma.provisionChangeOuverture.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ dateReference: new Date('2027-01-01'), motif: null }),
    });
  });

  it('3 · « utilisée » est l’EXISTENCE d’une réévaluation dans la période, sans comparer deux horloges', async () => {
    // Réévaluation horodatée AVANT la retouche de la version (horloges décalées) · utilisée quand même.
    const s = service([V2026], [{ dateReevaluation: new Date('2026-12-31'), createdAt: new Date('2025-01-01') }]);
    await expect(s.svc.declarerProvisionOuverture('t', 'u', DTO)).rejects.toThrow(/ne se modifie plus/);
    for (const [args] of s.prisma.reevaluation.findFirst.mock.calls as [{ where: object }][]) {
      expect(args.where).not.toHaveProperty('createdAt');
    }
  });

  it('IMPASSE · une version au début de N s’insère AVANT celle de N+1 quand rien n’est passé dans sa période', async () => {
    const V2027 = { ...V2026, id: 'd2', dateReference: new Date('2027-01-01') };
    // N+1 déclaré et réévalué ; N, ouvert, n'a encore rien passé.
    const s = service([V2027], [{ dateReevaluation: new Date('2027-12-31'), createdAt: new Date('2028-01-10') }]);
    await s.svc.declarerProvisionOuverture('t', 'u', DTO);
    expect(s.prisma.provisionChangeOuverture.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ dateReference: new Date('2026-01-01'), motif: null }),
    });
    // La période cherchée s'arrête au début de la version de N+1.
    expect(s.prisma.reevaluation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't', annuleeLe: null, dateReevaluation: { gte: new Date('2026-01-01'), lt: new Date('2027-01-01') } } }),
    );
  });

  it('une version est REFUSÉE si une réévaluation est déjà passée dans sa période (version utilisée ou période sans version)', async () => {
    const V2027 = { ...V2026, id: 'd2', dateReference: new Date('2027-01-01') };
    const avant = service([V2027], [N_PASSEE]);
    await expect(avant.svc.declarerProvisionOuverture('t', 'u', DTO)).rejects.toThrow(/réévaluation du 2026-12-31 est déjà passée dans la période/);
    const sansVersion = service([], [N_PASSEE]);
    await expect(sansVersion.svc.declarerProvisionOuverture('t', 'u', DTO)).rejects.toThrow(/déjà passée/);
    // Q2 · la version de N utilisée par N, puis une correction au début de N+1 · admise, rien n'est passé en N+1.
    const correction = service([V2026], [N_PASSEE]);
    await correction.svc.declarerProvisionOuverture('t', 'u', { ...DTO, dateReference: '2027-01-01', motif: 'Correction' });
    expect(correction.prisma.provisionChangeOuverture.create).toHaveBeenCalled();
    expect(avant.prisma.provisionChangeOuverture.create).not.toHaveBeenCalled();
  });

  it('la période d’une version s’arrête au début de la suivante · une réévaluation de N+1 n’utilise pas la version de N', async () => {
    const V2027 = { ...V2026, id: 'd2', dateReference: new Date('2027-01-01') };
    const s = service([V2026, V2027], []);
    await s.svc.retirerProvisionOuverture('t', 'd1');
    expect(s.prisma.reevaluation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ dateReevaluation: { gte: V2026.dateReference, lt: V2027.dateReference } }),
      }),
    );
    expect(s.prisma.provisionChangeOuverture.delete).toHaveBeenCalledWith({ where: { id: 'd1' } });
  });

  it('refuse un compte hors famille avant toute écriture', async () => {
    const s = service([], []);
    await expect(s.svc.declarerProvisionOuverture('t', 'u', { ...DTO, compteProvision: '4998' })).rejects.toThrow(/ne porte pas/);
    expect(s.prisma.provisionChangeOuverture.create).not.toHaveBeenCalled();
  });
});
