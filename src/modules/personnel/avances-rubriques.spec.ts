import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HORS_REMUNERATION_ARTICLE_7 } from './assiettes-paie';
import { NATURES_DES_RUBRIQUES, motifRefusRubrique } from './rubriques-paie';
import {
  compteDeLAvance,
  motifRefusAvance,
  motifRefusFinSaisie,
  motifRefusMoisSaisie,
  motifRefusRetenue,
  reserveQuotiteSaisies,
  soldeAvance,
  LITTERA_ARTICLE_112,
} from './avances-salaire';
import { AvancesRubriquesService } from './avances-rubriques.service';
import { passationPaie, type EntreePassation } from './passation-paie';
import { netAPayer } from './cotisations-paie';
import { entreeDuBulletin } from './comptabilisation-paie';
import { PersonnelService } from './personnel.service';

const SEMIS = join(__dirname, '..', 'comptes');
const SEMIS_SYCEBNL = readFileSync(join(SEMIS, 'compte-seed.ts'), 'utf8');
const SEMIS_SYSCOHADA = readFileSync(join(SEMIS, 'compte-seed-syscohada.ts'), 'utf8');

describe('rubriques de paie du cabinet · la rubrique nomme, la nature décide', () => {
  it("n'offre aucune des cinq exclusions de l'article 7, ni la participation aux bénéfices", () => {
    for (const n of HORS_REMUNERATION_ARTICLE_7) expect(NATURES_DES_RUBRIQUES).not.toContain(n);
    expect(NATURES_DES_RUBRIQUES).not.toContain('PARTICIPATION_AUX_BENEFICES');
    expect(NATURES_DES_RUBRIQUES).toContain('PRIME');
    expect(NATURES_DES_RUBRIQUES).toHaveLength(9);
  });

  it('refuse une prime baptisée transport, et une rubrique sans fondement', () => {
    const base = { code: 'PANC', libelle: "Prime d'ancienneté", nature: 'PRIME', fondement: 'CCE art. 12' };
    expect(motifRefusRubrique(base)).toBeNull();
    expect(motifRefusRubrique({ ...base, nature: 'INDEMNITE_DE_TRANSPORT' })).toMatch(/cinq exclusions/);
    expect(motifRefusRubrique({ ...base, fondement: ' ' })).toMatch(/fondement/);
    expect(motifRefusRubrique({ ...base, nature: 'PARTICIPATION_AUX_BENEFICES' })).toMatch(/refusée/);
  });
});

describe('avances et prêts · le compte que les deux plans écrivent', () => {
  it('avance au 4211, acompte au 4212, prêt au 272 selon sa catégorie', () => {
    expect(compteDeLAvance('AVANCE', null).compte).toBe('42110000');
    expect(compteDeLAvance('ACOMPTE', null).compte).toBe('42120000');
    expect(compteDeLAvance('PRET', 'IMMOBILIER').compte).toBe('27210000');
    expect(compteDeLAvance('PRET', 'MOBILIER_ET_INSTALLATION').compte).toBe('27220000');
    expect(compteDeLAvance('PRET', 'AUTRE').compte).toBe('27280000');
    expect(LITTERA_ARTICLE_112).toEqual({ AVANCE: 'c', ACOMPTE: 'c', PRET: 'f', SAISIE_ARRET: 'g' });
  });

  it('chaque compte est RÉELLEMENT ouvert dans les deux semis', () => {
    const tous = [
      compteDeLAvance('AVANCE', null),
      compteDeLAvance('ACOMPTE', null),
      compteDeLAvance('PRET', 'IMMOBILIER'),
      compteDeLAvance('PRET', 'MOBILIER_ET_INSTALLATION'),
      compteDeLAvance('PRET', 'AUTRE'),
      compteDeLAvance('SAISIE_ARRET', null),
    ];
    for (const { compte } of tous) {
      expect(SEMIS_SYCEBNL).toContain(`'${compte}'`);
      expect(SEMIS_SYSCOHADA).toContain(`'${compte}'`);
    }
  });

  it('un prêt exige sa catégorie, une avance la refuse, la pièce est obligatoire', () => {
    const a = { type: 'AVANCE' as const, montantFc: 100_000, objet: 'Rentrée scolaire', pieceJustificative: 'Reconnaissance du 02/09' };
    expect(motifRefusAvance(a)).toBeNull();
    expect(motifRefusAvance({ ...a, categoriePret: 'AUTRE' })).toMatch(/prêt/);
    expect(motifRefusAvance({ ...a, type: 'PRET' })).toMatch(/catégorie/);
    expect(motifRefusAvance({ ...a, pieceJustificative: '' })).toMatch(/pièce/);
    expect(motifRefusAvance({ ...a, retenueMensuelleFc: 200_000 })).toMatch(/dépasser/);
  });

  it("le solde ignore les retenues d'un bulletin annulé, et une retenue ne dépasse jamais le solde", () => {
    const solde = soldeAvance(300_000, [
      { montantFc: 100_000, bulletinAnnule: false },
      { montantFc: 100_000, bulletinAnnule: true },
    ]);
    expect(solde).toBe(200_000);
    expect(motifRefusRetenue(200_000, solde, 'Avance')).toBeNull();
    expect(motifRefusRetenue(200_000.01, solde, 'Avance')).toMatch(/dépasse le solde/);
  });
});

describe("la retenue sur le bulletin vire le 422 vers le compte de l'avance", () => {
  const entree = (over: Partial<EntreePassation> = {}): EntreePassation => ({
    referentiel: 'SYCEBNL',
    elements: [{ nature: 'SALAIRE_OU_TRAITEMENT', libelle: 'Salaire', montantFc: 1_000_000 }],
    cotisations: [{ cle: 'cnss-pension-travailleur', charge: 'TRAVAILLEUR', montantFc: 50_000 }],
    abstentionsCotisations: [],
    irppFc: 100_000,
    netAPayerFc: netAPayer(1_000_000, 50_000, 100_000, 150_000).netAPayerFc,
    retenuesAvances: [
      { type: 'AVANCE', categoriePret: null, libelle: 'Avance', montantFc: 100_000 },
      { type: 'PRET', categoriePret: 'IMMOBILIER', libelle: 'Prêt', montantFc: 50_000 },
    ],
    ...over,
  });

  it('le net baisse des retenues, et le 422 solde exactement au net', () => {
    expect(entree().netAPayerFc).toBe(700_000);
    const v = passationPaie(entree());
    expect(v.refus).toEqual([]);
    expect(v.equilibree).toBe(true);
    const ligne = (compte: string) => v.lignes.find((l) => l.compte === compte && l.bloc === 'RETENUES');
    expect(ligne('42110000')).toMatchObject({ sens: 'CREDIT', montantFc: 100_000 });
    expect(ligne('27210000')).toMatchObject({ sens: 'CREDIT', montantFc: 50_000 });
    expect(ligne('42200000')).toMatchObject({ sens: 'DEBIT', montantFc: 300_000 });
  });

  it('une retenue oubliée par la passation est un refus, pas une écriture fausse', () => {
    const v = passationPaie(entree({ retenuesAvances: [] }));
    expect(v.refus.map((r) => r.motif)).toContain('ECRITURE_DESEQUILIBREE');
  });

  it('P9 relit les retenues figées sur le bulletin', () => {
    const e = entreeDuBulletin(
      {
        id: 'b', numero: 1, nomComplet: 'X', statut: 'EMIS', ecritureId: null, netAPayerFc: 700_000,
        entree: { elements: entree().elements },
        calcul: {
          cotisations: { lignes: entree().cotisations, abstentions: [] },
          retenue: { retenueFc: 100_000 },
          net: { netAPayerFc: 700_000 },
          retenuesAvances: entree().retenuesAvances,
        },
      },
      'SYCEBNL',
    );
    expect(passationPaie(e!).equilibree).toBe(true);
  });
});

describe('la saisie relue au serveur', () => {
  const avance = (over: Record<string, unknown> = {}) => ({
    id: 'av1', salarieId: 's1', type: 'PRET', categoriePret: 'AUTRE', dateOctroi: new Date('2026-09-01'),
    montantFc: 300_000, objet: 'Moto',
    // Le bulletin ANNULÉ rend sa retenue · le solde reste 50 000, pas -50 000.
    retenues: [{ montantFc: 250_000, bulletin: { statut: 'EMIS' } }, { montantFc: 100_000, bulletin: { statut: 'ANNULE' } }], ...over,
  });
  const monter = (rubriques: unknown[] = [], avances: unknown[] = [avance()]) =>
    new PersonnelService({
      rubriquePaie: { findMany: jest.fn(async () => rubriques) },
      avanceSalaire: { findMany: jest.fn(async () => avances) },
    } as never);
  const dto = (over: Record<string, unknown> = {}) =>
    ({ moisDePaie: '2026-10', elements: [{ nature: 'INDEMNITE_DE_TRANSPORT', libelle: '', montantFc: 10, rubriqueId: 'r1' }], ...over }) as never;

  it('la rubrique impose sa nature, quelle que soit celle que le client envoie', async () => {
    const s = monter([{ id: 'r1', code: 'PANC', libelle: "Prime d'ancienneté", nature: 'PRIME', actif: true }]);
    const r = await s.resoudreSaisie('t', null, dto());
    expect(r.dto.elements[0]).toMatchObject({ nature: 'PRIME', libelle: "Prime d'ancienneté" });
  });

  it('refuse une rubrique désactivée ou inconnue', async () => {
    await expect(monter([{ id: 'r1', code: 'X', libelle: 'X', nature: 'PRIME', actif: false }]).resoudreSaisie('t', null, dto())).rejects.toThrow(/désactivée/);
    await expect(monter([]).resoudreSaisie('t', null, dto())).rejects.toThrow(/introuvable/);
  });

  it("le type et la catégorie de la retenue viennent du registre, et le solde la borne", async () => {
    const base = { elements: [], retenuesAvances: [{ avanceId: 'av1', montantFc: 50_000 }] };
    const r = await monter().resoudreSaisie('t', 's1', dto(base));
    expect(r.retenuesAvances[0]).toMatchObject({ type: 'PRET', categoriePret: 'AUTRE', littera: 'f', soldeAvantFc: 50_000 });
    await expect(monter().resoudreSaisie('t', 's1', dto({ elements: [], retenuesAvances: [{ avanceId: 'av1', montantFc: 50_001 }] }))).rejects.toThrow(/dépasse le solde/);
  });

  it("refuse l'avance d'un autre salarié, et une retenue sans salarié", async () => {
    const base = { elements: [], retenuesAvances: [{ avanceId: 'av1', montantFc: 10 }] };
    await expect(monter().resoudreSaisie('t', 's2', dto(base))).rejects.toThrow(/salarié/);
    await expect(monter().resoudreSaisie('t', null, dto(base))).rejects.toThrow(/salarié/);
  });
});

/**
 * PASSE O4-C2 · LA SAISIE-ARRÊT NOTIFIÉE. L'acte fixe le montant et la
 * retenue (AUPSRVE, art. 184), la notification rend la quotité indisponible
 * (art. 187), l'employeur verse au greffe ou à l'organisme désigné (art. 188),
 * la mainlevée y met fin (art. 201). La retenue vire le 422 au 4232 (Guide
 * SYSCOHADA, Partie 1 ch. 3, § 4.3 et Application 10).
 */
describe('la saisie-arrêt notifiée · le registre, le bulletin et la passation', () => {
  const saisie = {
    type: 'SAISIE_ARRET' as const,
    montantFc: 600_000,
    objet: 'Créance Banque X',
    pieceJustificative: 'Acte de saisie notifié',
    referenceActe: 'RH 1234/2026',
    greffe: 'Tripaix Gombe',
    destinataire: 'Greffe du Tripaix Gombe',
  };

  it('retient au 42320000 « Personnel, saisies-arrêts », au litera g) de l’article 112', () => {
    expect(compteDeLAvance('SAISIE_ARRET', null)).toEqual({ compte: '42320000', intitule: 'Personnel, saisies-arrêts' });
    expect(LITTERA_ARTICLE_112.SAISIE_ARRET).toBe('g');
  });

  it('exige la référence de l’acte, le greffe et le destinataire, et les refuse à une avance', () => {
    expect(motifRefusAvance(saisie)).toBeNull();
    expect(motifRefusAvance({ ...saisie, referenceActe: ' ' })).toMatch(/référence de l'acte/);
    expect(motifRefusAvance({ ...saisie, greffe: '' })).toMatch(/greffe/);
    expect(motifRefusAvance({ ...saisie, destinataire: undefined })).toMatch(/art\. 188/);
    expect(motifRefusAvance({ ...saisie, categoriePret: 'AUTRE' })).toMatch(/prêt/);
    const avance = { type: 'AVANCE' as const, montantFc: 100, objet: 'x', pieceJustificative: 'y' };
    expect(motifRefusAvance({ ...avance, referenceActe: 'RH 1' })).toMatch(/saisie-arrêt/);
  });

  it('ne mord que de la notification (art. 187) à la mainlevée (art. 201), mois entamés compris', () => {
    const notif = new Date('2026-09-15');
    expect(motifRefusMoisSaisie('2026-08', notif, null)).toMatch(/art\. 187/);
    expect(motifRefusMoisSaisie('2026-09', notif, null)).toBeNull();
    const fin = new Date('2026-11-10');
    expect(motifRefusMoisSaisie('2026-11', notif, fin)).toBeNull();
    expect(motifRefusMoisSaisie('2026-12', notif, fin)).toMatch(/art\. 201/);
  });

  it('la mainlevée se déclare une fois, jamais avant la notification, et sur une saisie seulement', () => {
    const a = { type: 'SAISIE_ARRET' as const, dateOctroi: new Date('2026-09-15'), dateFin: null };
    expect(motifRefusFinSaisie(a, new Date('2026-12-01'))).toBeNull();
    expect(motifRefusFinSaisie(a, new Date('2026-09-01'))).toMatch(/précéder/);
    expect(motifRefusFinSaisie({ ...a, dateFin: new Date('2026-10-01') }, new Date('2026-12-01'))).toMatch(/déjà/);
    expect(motifRefusFinSaisie({ ...a, type: 'PRET' }, new Date('2026-12-01'))).toMatch(/Seule une saisie/);
  });

  it('confronte la retenue à la quotité, sans la refuser (art. 188)', () => {
    expect(reserveQuotiteSaisies(0, 10)).toBeNull();
    expect(reserveQuotiteSaisies(100, 100)).toBeNull();
    expect(reserveQuotiteSaisies(100.01, 100)).toMatch(/dépasse la quotité/);
    expect(reserveQuotiteSaisies(100, null)).toMatch(/pas chiffrée/);
  });

  it('la passation vire le 422 au 42320000, et le 422 solde au net', () => {
    const v = passationPaie({
      referentiel: 'SYSCOHADA',
      elements: [{ nature: 'SALAIRE_OU_TRAITEMENT', libelle: 'Salaire', montantFc: 1_000_000 }],
      cotisations: [],
      abstentionsCotisations: [],
      irppFc: 0,
      netAPayerFc: netAPayer(1_000_000, 0, 0, 120_000).netAPayerFc,
      retenuesAvances: [{ type: 'SAISIE_ARRET', categoriePret: null, libelle: 'Saisie', montantFc: 120_000 }],
    });
    expect(v.equilibree).toBe(true);
    expect(v.lignes.find((l) => l.compte === '42320000')).toMatchObject({ bloc: 'RETENUES', sens: 'CREDIT', montantFc: 120_000 });
  });

  // La doublure HONORE le filtre (dossier et identifiants demandés) · une
  // doublure qui rendrait tout validerait un service qui ne filtrerait rien.
  const monterSaisie = (dateFin: Date | null) => {
    const lignes = [
      {
        id: 'sa1', tenantId: 't', salarieId: 's1', type: 'SAISIE_ARRET', categoriePret: null,
        dateOctroi: new Date('2026-09-15'), dateFin, montantFc: 600_000, objet: 'Créance', referenceActe: 'RH 1',
        retenues: [],
      },
    ];
    return new PersonnelService({
      rubriquePaie: { findMany: jest.fn(async () => []) },
      avanceSalaire: {
        findMany: jest.fn(async ({ where }: { where: { tenantId: string; id: { in: string[] } } }) =>
          lignes.filter((l) => l.tenantId === where.tenantId && where.id.in.includes(l.id)),
        ),
      },
    } as never);
  };
  const dtoSaisie = (mois: string) =>
    ({ moisDePaie: mois, elements: [], retenuesAvances: [{ avanceId: 'sa1', montantFc: 50_000 }] }) as never;

  it('le serveur refuse la retenue hors de la période de la saisie, et la nomme au litera g)', async () => {
    const r = await monterSaisie(null).resoudreSaisie('t', 's1', dtoSaisie('2026-10'));
    expect(r.retenuesAvances[0]).toMatchObject({ type: 'SAISIE_ARRET', littera: 'g' });
    expect(r.retenuesAvances[0].libelle).toContain('acte RH 1');
    await expect(monterSaisie(null).resoudreSaisie('t', 's1', dtoSaisie('2026-08'))).rejects.toThrow(/art\. 187/);
    await expect(monterSaisie(new Date('2026-10-31')).resoudreSaisie('t', 's1', dtoSaisie('2026-11'))).rejects.toThrow(/art\. 201/);
  });

  it('le registre recopie l’acte sur une saisie, et ne l’écrit jamais sur une avance', async () => {
    const create = jest.fn(async (a: unknown) => a);
    const svc = new AvancesRubriquesService({
      salarie: { findFirst: jest.fn(async ({ where }: { where: { id: string; tenantId: string } }) => (where.tenantId === 't' ? { id: where.id } : null)) },
      avanceSalaire: { create },
    } as never);
    await svc.creerAvance('t', 'x@y', 's1', { ...saisie, dateOctroi: '2026-09-15' } as never);
    expect((create.mock.calls[0][0] as { data: Record<string, unknown> }).data).toMatchObject({
      type: 'SAISIE_ARRET',
      referenceActe: 'RH 1234/2026',
      greffe: 'Tripaix Gombe',
      destinataire: 'Greffe du Tripaix Gombe',
    });
    await svc.creerAvance('t', 'x@y', 's1', { type: 'AVANCE', montantFc: 100, objet: 'x', pieceJustificative: 'y', dateOctroi: '2026-09-15' } as never);
    expect((create.mock.calls[1][0] as { data: Record<string, unknown> }).data).toMatchObject({ referenceActe: null, greffe: null, destinataire: null });
  });

  it('la mainlevée passe par une écriture unitaire, refusée sur une avance', async () => {
    const lignes: Record<string, { id: string; tenantId: string; type: string; dateOctroi: Date; dateFin: Date | null }> = {
      sa1: { id: 'sa1', tenantId: 't', type: 'SAISIE_ARRET', dateOctroi: new Date('2026-09-15'), dateFin: null },
      av1: { id: 'av1', tenantId: 't', type: 'AVANCE', dateOctroi: new Date('2026-09-15'), dateFin: null },
    };
    const update = jest.fn(async (a: unknown) => a);
    const svc = new AvancesRubriquesService({
      avanceSalaire: {
        findFirst: jest.fn(async ({ where }: { where: { id: string; tenantId: string } }) =>
          lignes[where.id]?.tenantId === where.tenantId ? lignes[where.id] : null,
        ),
        update,
      },
    } as never);
    await svc.terminerSaisie('t', 'sa1', { dateFin: '2026-12-01' });
    expect(update).toHaveBeenCalledWith({ where: { id: 'sa1' }, data: { dateFin: new Date('2026-12-01') } });
    await expect(svc.terminerSaisie('t', 'av1', { dateFin: '2026-12-01' })).rejects.toThrow(/Seule une saisie/);
    await expect(svc.terminerSaisie('autre', 'sa1', { dateFin: '2026-12-01' })).rejects.toThrow(/introuvable/);
  });
});

describe('la simulation confronte la saisie à la quotité · le câblage (O4-C2)', () => {
  it('rend la réserve de l’art. 188 dès qu’une retenue de saisie est portée, et rien sans elle', async () => {
    const svc = new PersonnelService({
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: 'SYSCOHADA', ville: null }) },
      versionBaremePaie: { findFirst: jest.fn().mockResolvedValue(null) },
    } as never);
    const dtoSim = { moisDePaie: '2026-10', elements: [{ nature: 'SALAIRE_OU_TRAITEMENT', libelle: 'Salaire', montantFc: 1_000_000 }] } as never;
    const retenue = { avanceId: 'sa1', type: 'SAISIE_ARRET' as const, categoriePret: null, littera: 'g' as const, libelle: 'Saisie', montantFc: 50_000, soldeAvantFc: 600_000 };
    jest.spyOn(svc, 'resoudreSaisie').mockImplementation(async (_t, _s, d) => ({ dto: d as never, retenuesAvances: [retenue] }));
    const avec = await svc.simulerPaie('t', null, dtoSim);
    // Sans classe professionnelle, la quotité s'abstient · la réserve le dit.
    expect(avec.reserveSaisies).toMatch(/art\. 188/);
    jest.spyOn(svc, 'resoudreSaisie').mockImplementation(async (_t, _s, d) => ({
      dto: d as never,
      retenuesAvances: [{ ...retenue, type: 'AVANCE' as never, littera: 'c' as const }],
    }));
    expect((await svc.simulerPaie('t', null, dtoSim)).reserveSaisies).toBeNull();
  });
});
