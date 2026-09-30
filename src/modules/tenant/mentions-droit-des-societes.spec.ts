import { FormeJuridiqueSyscohada, Referentiel } from '@prisma/client';
import { mentionsArticle17, mentionsEmetteur, mentionLiquidation } from './mentions-societe';
import { mentionImmatriculation } from './mentions-immatriculation';
import { exerciceDeTransformation, formeApplicable, motifRefusTransformation } from './forme-applicable';
import { TenantService } from './tenant.service';

/**
 * CE QUE CHAQUE LIVRE DE L'AUSCGIE AJOUTE À LA DÉNOMINATION (passes O1a et
 * O1b). Une ligne complète en apparence se lit comme conforme · chaque manque
 * est donc DIT, et rien n'est présumé.
 */
const base = {
  referentiel: Referentiel.SYSCOHADA,
  nom: 'Démo',
  capitalSocial: 10000000 as number | null,
  capitalVariable: false,
  adresse: '12, avenue du Commerce' as string | null,
  ville: 'Kinshasa' as string | null,
  rccm: 'CD/KIN/RCCM/24-B-00001' as string | null,
  devise: 'CDF' as string | null,
};

describe('SA · le mode d’administration fait partie de la forme (art. 386 et 414)', () => {
  const sa = { ...base, formeJuridiqueSyscohada: FormeJuridiqueSyscohada.SOCIETE_ANONYME as FormeJuridiqueSyscohada | null };

  it('déclaré, il s’imprime avec la forme', () => {
    expect(mentionsArticle17({ ...sa, modeAdministrationSa: 'CONSEIL_ADMINISTRATION' }).ligne).toMatch(
      /^Société anonyme avec conseil d’administration · au capital/,
    );
    expect(mentionsArticle17({ ...sa, modeAdministrationSa: 'ADMINISTRATEUR_GENERAL' }).ligne).toMatch(
      /^Société anonyme avec administrateur général · /,
    );
    expect(mentionsArticle17({ ...sa, modeAdministrationSa: 'ADMINISTRATEUR_GENERAL' }).manquantes).toEqual([]);
  });

  it('non déclaré, le manque est dit · jamais un mode présumé', () => {
    const m = mentionsArticle17({ ...sa, modeAdministrationSa: null });
    expect(m.ligne).toMatch(/^Société anonyme · au capital/);
    expect(m.manquantes).toContain('mode d’administration de la société anonyme (AUSCGIE art. 386 et 414)');
  });

  it('n’est pas réclamé à la SAS, que l’art. 853-3 exclut des art. 414 à 561', () => {
    const m = mentionsArticle17({
      ...base,
      formeJuridiqueSyscohada: FormeJuridiqueSyscohada.SOCIETE_PAR_ACTIONS_SIMPLIFIEE,
      associeUniqueSas: false,
    });
    expect(m.manquantes).toEqual([]);
  });
});

describe('SAS · l’associé unique fait une SASU (art. 853-2, al. 2)', () => {
  const sas = { ...base, formeJuridiqueSyscohada: FormeJuridiqueSyscohada.SOCIETE_PAR_ACTIONS_SIMPLIFIEE as FormeJuridiqueSyscohada | null };

  it('« société par actions simplifiée unipersonnelle » quand l’associé est unique', () => {
    expect(mentionsArticle17({ ...sas, associeUniqueSas: true }).ligne).toMatch(
      /^Société par actions simplifiée unipersonnelle · /,
    );
  });

  it('pas encore dit · la ligne ne change pas, le manque se dit', () => {
    const m = mentionsArticle17({ ...sas, associeUniqueSas: null });
    expect(m.ligne).toMatch(/^Société par actions simplifiée · /);
    expect(m.manquantes).toContain('associé unique ou non (AUSCGIE art. 853-2)');
  });
});

describe('Société en liquidation · art. 204', () => {
  const sarl = {
    ...base,
    formeJuridiqueSyscohada: FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE as FormeJuridiqueSyscohada | null,
    dateDissolution: new Date('2026-03-01'),
  };

  it('la mention et le liquidateur précèdent la ligne de l’art. 17', () => {
    const m = mentionsEmetteur({ ...sarl, liquidateurs: 'Me Kabila Mwamba' }, new Date('2026-04-01'));
    expect(m.ligne).toMatch(/^Société en liquidation · liquidateur\(s\) : Me Kabila Mwamba · Société à responsabilité limitée/);
  });

  it('un liquidateur non nommé se dit, il n’est pas inventé', () => {
    const m = mentionsEmetteur({ ...sarl, liquidateurs: null }, new Date('2026-04-01'));
    expect(m.ligne).toMatch(/^Société en liquidation · Société à responsabilité limitée/);
    expect(m.manquantes).toContain('nom du ou des liquidateurs (AUSCGIE art. 204)');
  });

  it('une pièce antérieure à la dissolution ne la porte pas, et une société non dissoute non plus', () => {
    expect(mentionLiquidation({ ...sarl, liquidateurs: 'X' }, new Date('2026-02-01')).ligne).toBeNull();
    expect(mentionLiquidation({ ...sarl, dateDissolution: null, liquidateurs: 'X' }).ligne).toBeNull();
  });
});

describe('GIE · « groupement d’intérêt économique » après la dénomination (art. 876)', () => {
  it('la ligne du GIE porte sa nature, avant le RCCM', () => {
    const m = mentionImmatriculation({
      referentiel: Referentiel.SYSCOHADA,
      formeJuridiqueSyscohada: FormeJuridiqueSyscohada.GROUPEMENT_INTERET_ECONOMIQUE,
      rccm: 'CD/KIN/RCCM/24-C-00002',
    });
    expect(m.ligne).toBe('Groupement d’intérêt économique · RCCM CD/KIN/RCCM/24-C-00002');
  });

  it('sans RCCM, la nature reste imprimée et le RCCM est dit manquant', () => {
    const m = mentionImmatriculation({
      referentiel: Referentiel.SYSCOHADA,
      formeJuridiqueSyscohada: FormeJuridiqueSyscohada.GROUPEMENT_INTERET_ECONOMIQUE,
      rccm: null,
    });
    expect(m.ligne).toBe('Groupement d’intérêt économique');
    expect(m.manquantes).toHaveLength(1);
  });
});

describe('La forme d’un exercice est celle qu’il avait (art. 182 et 183, passe O1a, D3)', () => {
  const t = {
    formeJuridiqueSyscohada: FormeJuridiqueSyscohada.SOCIETE_ANONYME,
    formeJuridiqueSyscohadaAnterieure: FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE,
    dateTransformationForme: new Date('2027-05-15'),
  };

  it('un exercice clos avant la décision garde l’ancienne forme', () => {
    expect(formeApplicable(t, new Date('2025-12-31'))).toBe(FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE);
    expect(formeApplicable(t, new Date('2026-12-31'))).toBe(FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE);
  });

  it('l’exercice au cours duquel elle intervient suit la nouvelle forme (art. 183, al. 2)', () => {
    expect(formeApplicable(t, new Date('2027-12-31'))).toBe(FormeJuridiqueSyscohada.SOCIETE_ANONYME);
    expect(exerciceDeTransformation(t, { dateDebut: new Date('2027-01-01'), dateFin: new Date('2027-12-31') })).toBe(true);
    expect(exerciceDeTransformation(t, { dateDebut: new Date('2028-01-01'), dateFin: new Date('2028-12-31') })).toBe(false);
  });

  it('une correction sans date vaut pour tous les exercices', () => {
    expect(formeApplicable({ formeJuridiqueSyscohada: FormeJuridiqueSyscohada.SOCIETE_ANONYME }, new Date('2020-12-31'))).toBe(
      FormeJuridiqueSyscohada.SOCIETE_ANONYME,
    );
  });

  it('une transformation n’existe qu’entre sociétés commerciales, et ne se date pas dans le futur', () => {
    const auj = new Date('2027-06-01');
    expect(
      motifRefusTransformation(FormeJuridiqueSyscohada.ENTREPRISE_INDIVIDUELLE, FormeJuridiqueSyscohada.SOCIETE_ANONYME, new Date('2027-01-01'), auj),
    ).toContain('art. 188');
    expect(
      motifRefusTransformation(FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE, FormeJuridiqueSyscohada.SOCIETE_ANONYME, new Date('2027-07-01'), auj),
    ).toContain('art. 182');
    expect(
      motifRefusTransformation(FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE, FormeJuridiqueSyscohada.SOCIETE_ANONYME, new Date('2027-05-15'), auj),
    ).toBeNull();
  });
});

describe('Les faits de la dénomination se déclarent à la route, chacun à sa forme', () => {
  const service = (forme: FormeJuridiqueSyscohada | null, capture: { data?: Record<string, unknown> } = {}) =>
    new TenantService({
      tenant: {
        findUnique: async () => ({ id: 't1', referentiel: Referentiel.SYSCOHADA, formeJuridiqueSyscohada: forme }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          capture.data = data;
          return {};
        },
      },
      ecriture: { count: async () => 0 },
      compte: { findMany: async () => [] },
    } as never);

  it('le mode d’administration n’est reçu que d’une SA', async () => {
    await expect(
      service(FormeJuridiqueSyscohada.SOCIETE_PAR_ACTIONS_SIMPLIFIEE).modifierIdentite('t1', {
        modeAdministrationSa: 'CONSEIL_ADMINISTRATION',
      }),
    ).rejects.toThrow(/art\. 386 et 414/);
    const capture: { data?: Record<string, unknown> } = {};
    await service(FormeJuridiqueSyscohada.SOCIETE_ANONYME, capture).modifierIdentite('t1', {
      modeAdministrationSa: 'ADMINISTRATEUR_GENERAL',
    });
    expect(capture.data!.modeAdministrationSa).toBe('ADMINISTRATEUR_GENERAL');
  });

  it('l’associé unique n’est reçu que d’une SAS', async () => {
    await expect(
      service(FormeJuridiqueSyscohada.SOCIETE_ANONYME).modifierIdentite('t1', { associeUniqueSas: 'OUI' }),
    ).rejects.toThrow(/art\. 853-2/);
  });

  it('la dissolution d’une société commerciale se déclare, jamais dans le futur', async () => {
    const capture: { data?: Record<string, unknown> } = {};
    await service(FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE, capture).modifierIdentite('t1', {
      dateDissolution: '2026-03-01',
      liquidateurs: ' Me Kabila ',
    });
    expect([(capture.data!.dateDissolution as Date).toISOString().slice(0, 10), capture.data!.liquidateurs]).toEqual([
      '2026-03-01',
      'Me Kabila',
    ]);
    await expect(
      service(FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE).modifierIdentite('t1', { dateDissolution: '2999-01-01' }),
    ).rejects.toThrow(/art\. 204/);
    await expect(
      service(FormeJuridiqueSyscohada.ENTREPRISE_INDIVIDUELLE).modifierIdentite('t1', { dateDissolution: '2026-03-01' }),
    ).rejects.toThrow(/art\. 203 et 204/);
  });

  it('une transformation garde la forme d’avant et sa date · une correction n’y touche pas', async () => {
    const capture: { data?: Record<string, unknown> } = {};
    await service(FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE, capture).modifierFormeSyscohada(
      't1',
      FormeJuridiqueSyscohada.SOCIETE_ANONYME,
      '2026-05-15',
    );
    expect(capture.data!.formeJuridiqueSyscohadaAnterieure).toBe(FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE);
    expect((capture.data!.dateTransformationForme as Date).toISOString().slice(0, 10)).toBe('2026-05-15');
    const correction: { data?: Record<string, unknown> } = {};
    await service(FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE, correction).modifierFormeSyscohada(
      't1',
      FormeJuridiqueSyscohada.SOCIETE_ANONYME,
    );
    expect(correction.data).toEqual({ formeJuridiqueSyscohada: FormeJuridiqueSyscohada.SOCIETE_ANONYME });
    await expect(
      service(FormeJuridiqueSyscohada.ENTREPRENANT).modifierFormeSyscohada('t1', FormeJuridiqueSyscohada.SOCIETE_ANONYME, '2026-05-15'),
    ).rejects.toThrow(/art\. 188/);
  });
});
