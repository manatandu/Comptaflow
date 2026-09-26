import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HORS_REMUNERATION_ARTICLE_7 } from './assiettes-paie';
import { NATURES_DES_RUBRIQUES, motifRefusRubrique } from './rubriques-paie';
import { compteDeLAvance, motifRefusAvance, motifRefusRetenue, soldeAvance, LITTERA_ARTICLE_112 } from './avances-salaire';
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
    expect(LITTERA_ARTICLE_112).toEqual({ AVANCE: 'c', ACOMPTE: 'c', PRET: 'f' });
  });

  it('chaque compte est RÉELLEMENT ouvert dans les deux semis', () => {
    const tous = [
      compteDeLAvance('AVANCE', null),
      compteDeLAvance('ACOMPTE', null),
      compteDeLAvance('PRET', 'IMMOBILIER'),
      compteDeLAvance('PRET', 'MOBILIER_ET_INSTALLATION'),
      compteDeLAvance('PRET', 'AUTRE'),
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
