import { Referentiel, TypeCompteDetailTotal } from '@prisma/client';
import { PLAN_COMPTES_SYCEBNL } from '../comptes/compte-seed';
import { PLAN_COMPTES_SYSCOHADA } from '../comptes/compte-seed-syscohada';
import { BAREME_AMORTISSEMENT_013_2025 } from './bareme-amortissement-013-2025';
import { motifNonAmortissable } from './comptes-du-bien';
import {
  comptesSuivantLeBien,
  estCompteDeBien,
  modeDeLaRacine,
  modeDuCompteDeContrepartie,
  sectionsBaremeDuCompte,
} from './compte-du-bien';
import { racinesContrepartieAcquisition } from './contrepartie-acquisition';

/**
 * LE COMPTE DU BIEN COMMANDE LE RESTE · la prémisse est relue dans les DEUX
 * semis à chaque exécution (règle sortie de F2b) · un 28 ou un 68 déduit qui
 * n'existerait pas au plan serait refusé à la saisie après tout le chiffrage.
 */
const detail = (plan: { numero: string; typeCompte?: TypeCompteDetailTotal }[]) =>
  plan.filter((c) => (c.typeCompte ?? TypeCompteDetailTotal.DETAIL) === TypeCompteDetailTotal.DETAIL).map((c) => c.numero);
const PLANS: [Referentiel, string[]][] = [
  [Referentiel.SYCEBNL, detail(PLAN_COMPTES_SYCEBNL)],
  [Referentiel.SYSCOHADA, detail(PLAN_COMPTES_SYSCOHADA)],
];

describe('compte du bien · le 28 et le 68 se lisent dans le plan', () => {
  it.each(PLANS)('%s · tout compte de bien amortissable trouve son 28 de la division et son 68', (ref, numeros) => {
    // Le 221 (terrains agricoles et forestiers) reste au cabinet · la fiche 22
    // le dit amortissable quand le 282 ne lui ouvre aucun sous-compte
    // (comptes-du-bien.ts). Les en-cours (2x9) suivent leur bien achevé.
    const biens = numeros.filter(
      (n) => estCompteDeBien(ref, n) && !motifNonAmortissable(n, ref) && !/^2[1-4]9/.test(n) && !n.startsWith('221'),
    );
    expect(biens.length).toBeGreaterThan(20);
    for (const n of biens) {
      const r = comptesSuivantLeBien(ref, n, numeros);
      expect({ n, motif: r.motif }).toEqual({ n, motif: null });
      expect(numeros).toContain(r.amortissement);
      expect(numeros).toContain(r.dotation);
      const usufruit = ref === Referentiel.SYCEBNL && n.startsWith('20');
      // AUDCIF Titre VII ch. 2 · « développés selon la structure des comptes de la classe 2 ».
      expect(r.amortissement!.slice(0, 4)).toBe(usufruit ? '2800' : `28${n.charAt(1)}${n.charAt(2)}`);
      expect(r.dotation!.slice(0, 4)).toBe(usufruit ? '6800' : n.startsWith('21') ? '6812' : '6813');
    }
  });

  it('les cas lus dans les semis · véhicule, aménagement, logiciel, usufruit', () => {
    const [, sycebnl] = PLANS[0];
    const [, syscohada] = PLANS[1];
    expect(comptesSuivantLeBien(Referentiel.SYSCOHADA, '24510000', syscohada)).toMatchObject({ amortissement: '28450000', dotation: '68130000' });
    // 2345 relève du 234 aux deux plans · 2834, jamais 2835 (aménagements de bureaux).
    expect(comptesSuivantLeBien(Referentiel.SYCEBNL, '23450000', sycebnl)).toMatchObject({ amortissement: '28340000' });
    expect(comptesSuivantLeBien(Referentiel.SYSCOHADA, '21310000', syscohada)).toMatchObject({ amortissement: '28130000', dotation: '68120000' });
    expect(comptesSuivantLeBien(Referentiel.SYCEBNL, '20110000', sycebnl)).toMatchObject({ amortissement: '28000000', dotation: '68000000' });
  });

  it('le compte semé passe avant un sous-compte que le cabinet a ouvert dessous', () => {
    const r = comptesSuivantLeBien(Referentiel.SYSCOHADA, '24510000', ['28459000', '28450000', '28451000', '68130000']);
    expect(r.amortissement).toBe('28450000');
  });

  it('un compte absent du plan est NOMMÉ, jamais composé', () => {
    const r = comptesSuivantLeBien(Referentiel.SYSCOHADA, '24510000', ['68130000']);
    expect(r.amortissement).toBeNull();
    expect(r.motif).toContain('aucun compte 2845');
  });

  it('un terrain non amortissable reçoit un 28 inerte de sa division', () => {
    const [, syscohada] = PLANS[1];
    const r = comptesSuivantLeBien(Referentiel.SYSCOHADA, '22200000', syscohada, true);
    expect(r.motif).toBeNull();
    expect(r.amortissement!.startsWith('282')).toBe(true);
  });

  it('les 25 à 27 ne portent pas un bien, le 20 seulement au SYCEBNL', () => {
    expect(estCompteDeBien(Referentiel.SYSCOHADA, '25200000')).toBe(false);
    expect(estCompteDeBien(Referentiel.SYSCOHADA, '20000000')).toBe(false);
    expect(estCompteDeBien(Referentiel.SYCEBNL, '20110000')).toBe(true);
  });
});

describe('sections du barème proposées · un filtre, jamais un refus', () => {
  const sections = new Set(BAREME_AMORTISSEMENT_013_2025.map((n) => n.section));
  it('toute section proposée existe dans l’arrêté', () => {
    for (const n of ['21310000', '23450000', '24110000', '24210000', '24410000', '24510000', '24800000']) {
      for (const s of sectionsBaremeDuCompte(n) ?? []) expect(sections).toContain(s);
    }
  });
  it('incorporel en I, transport en V, terrain sans catégorie', () => {
    expect(sectionsBaremeDuCompte('21310000')).toEqual(['I']);
    expect(sectionsBaremeDuCompte('24510000')).toEqual(['V']);
    expect(sectionsBaremeDuCompte('22200000')).toEqual([]);
  });
});

describe("mode d'acquisition · chaque contrepartie admise a son mode", () => {
  it.each([Referentiel.SYCEBNL, Referentiel.SYSCOHADA])('%s · fournisseur, trésorerie, apport, en-cours', (ref) => {
    const racines = racinesContrepartieAcquisition(ref, '24510000');
    expect(modeDuCompteDeContrepartie(ref, '48120000', racines)).toBe('ACHAT_A_CREDIT');
    expect(modeDuCompteDeContrepartie(ref, '52110000', racines)).toBe('ACHAT_COMPTANT');
    expect(modeDuCompteDeContrepartie(ref, '10110000', racines)).toBe('APPORT');
    expect(modeDuCompteDeContrepartie(ref, '24950000', racines)).toBe('EN_COURS_ACHEVE');
    expect(modeDuCompteDeContrepartie(ref, '25200000', racines)).toBe('AVANCE_SOLDEE');
  });
  it('les dons et fonds affectés sont du SYCEBNL, la part non libérée a son mode', () => {
    // Le 14 n'enregistre que des subventions, jamais un don ni un legs (fiche du compte 14).
    expect(modeDeLaRacine(Referentiel.SYCEBNL, '14')).toBe('SUBVENTION_EN_NATURE');
    expect(modeDeLaRacine(Referentiel.SYSCOHADA, '14')).toBe('SUBVENTION_EN_NATURE');
    expect(modeDeLaRacine(Referentiel.SYCEBNL, '167')).toBe('DON_LEGS');
    expect(modeDeLaRacine(Referentiel.SYCEBNL, '171')).toBe('DON_LEGS');
    expect(modeDeLaRacine(Referentiel.SYCEBNL, '163')).toBe('FONDS_AFFECTES');
    expect(modeDeLaRacine(Referentiel.SYSCOHADA, '4813')).toBe('TITRES_NON_LIBERES');
    expect(modeDeLaRacine(Referentiel.SYSCOHADA, '4812')).toBe('ACHAT_A_CREDIT');
  });
  it('un compte hors de la liste fermée n’a pas de mode', () => {
    expect(modeDuCompteDeContrepartie(Referentiel.SYSCOHADA, '60100000', racinesContrepartieAcquisition(Referentiel.SYSCOHADA, '24510000'))).toBeNull();
  });
});

describe('la famille du compte · trouvée, ou créée avec les comptes du plan', () => {
  const { ImmobilisationService } = jest.requireActual('./immobilisation.service') as typeof import('./immobilisation.service');
  const plan = [
    { id: 'c2451', numero: '24510000', intitule: 'Véhicules de tourisme' },
    { id: 'c2845', numero: '28450000', intitule: 'Amortissements du matériel de transport' },
    { id: 'c6813', numero: '68130000', intitule: 'Dotations corporelles' },
    { id: 'c6011', numero: '60110000', intitule: 'Achats' },
  ];
  function service(existante: unknown = null) {
    const create = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'f-neuve', ...data }));
    const prisma = {
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: Referentiel.SYSCOHADA }) },
      familleImmobilisation: { findFirst: jest.fn().mockResolvedValue(existante), count: jest.fn().mockResolvedValue(0), create },
      compte: {
        findFirst: jest.fn().mockImplementation(({ where }) => Promise.resolve(plan.find((c) => c.id === where.id) ?? null)),
        findMany: jest.fn().mockResolvedValue(plan),
      },
    };
    const svc = new ImmobilisationService(prisma as never, {} as never) as unknown as {
      famillePourCompte: (t: string, c: string, d?: number, m?: unknown) => Promise<Record<string, unknown>>;
    };
    return { svc, create, prisma };
  }

  it('reprend la famille ACTIVE du même compte, sans en créer', async () => {
    const { svc, create, prisma } = service({ id: 'f-ancienne' });
    await expect(svc.famillePourCompte('t1', 'c2451', 3)).resolves.toEqual({ id: 'f-ancienne' });
    expect(prisma.familleImmobilisation.findFirst.mock.calls[0][0].where).toMatchObject({ compteImmobilisationId: 'c2451', estActif: true });
    expect(create).not.toHaveBeenCalled();
  });

  it('crée la famille avec le 28 et le 68 que le plan donne', async () => {
    const { svc, create } = service();
    await svc.famillePourCompte('t1', 'c2451', 3);
    expect(create.mock.calls[0][0].data).toMatchObject({
      code: '24510000',
      compteImmobilisationId: 'c2451',
      compteAmortissementId: 'c2845',
      compteDotationId: 'c6813',
      dureeAmortissementAns: 3,
    });
  });

  it('refuse un compte qui ne porte pas un bien, et un bien sans durée', async () => {
    await expect(service().svc.famillePourCompte('t1', 'c6011', 3)).rejects.toThrow('ne porte pas un bien');
    await expect(service().svc.famillePourCompte('t1', 'c2451')).rejects.toThrow("durée d'amortissement");
  });
});
