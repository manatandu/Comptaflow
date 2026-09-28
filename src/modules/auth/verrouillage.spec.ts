import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import {
  DECOMPTE_REMIS_A_ZERO,
  decompteApresEchec,
  DELAI_OUBLI_ECHECS_HEURES,
  PALIERS_VERROU_MINUTES,
  SEUIL_VERROUILLAGE,
} from './verrouillage';

/**
 * LE DÉLAI D'OUBLI (verrouillage.ts). Jusqu'au 2026-09-28, le compteur
 * d'échecs repartait de zéro dès que le verrou précédent était échu · un
 * attaquant qui attendait chaque échéance restait au palier d'une minute pour
 * toujours, et le verrou « croissant » ne croissait jamais contre lui.
 */

const HEURE = 3_600_000;
const T0 = new Date('2026-09-28T08:00:00.000Z');

describe('le délai d’oubli, règle pure', () => {
  it('dépasse le palier le plus long · sinon le plafond n’est jamais atteint (Keycloak, « Failure Reset Time »)', () => {
    expect(DELAI_OUBLI_ECHECS_HEURES * 60).toBeGreaterThan(Math.max(...PALIERS_VERROU_MINUTES));
  });

  it('les paliers restent ceux de l’exemple du NIST, une minute à une heure', () => {
    expect([...PALIERS_VERROU_MINUTES]).toEqual([1, 5, 15, 30, 60]);
  });

  it('un échec dans le délai s’ajoute au compteur, même verrou échu', () => {
    const r = decompteApresEchec({ tentativesEchouees: 5, dernierEchecLe: new Date(T0.getTime() - HEURE) }, T0);
    expect(r.tentativesEchouees).toBe(6);
    expect(r.dernierEchecLe).toEqual(T0);
    expect(r.verrouilleJusqua!.getTime() - T0.getTime()).toBe(5 * 60_000);
  });

  it('douze heures sans échec, le compteur s’oublie · une faute de frappe n’hérite pas d’un incident passé', () => {
    const juste = decompteApresEchec({ tentativesEchouees: 9, dernierEchecLe: new Date(T0.getTime() - DELAI_OUBLI_ECHECS_HEURES * HEURE) }, T0);
    expect(juste).toEqual({ tentativesEchouees: 1, verrouilleJusqua: null, dernierEchecLe: T0 });
    const avant = decompteApresEchec({ tentativesEchouees: 9, dernierEchecLe: new Date(T0.getTime() - DELAI_OUBLI_ECHECS_HEURES * HEURE + 1) }, T0);
    expect(avant.tentativesEchouees).toBe(10);
  });

  it('un compteur sans date de dernier échec repart de zéro · son ancienneté est inconnue', () => {
    expect(decompteApresEchec({ tentativesEchouees: 7, dernierEchecLe: null }, T0).tentativesEchouees).toBe(1);
  });

  it('la remise à zéro efface aussi la date du dernier échec', () => {
    expect(DECOMPTE_REMIS_A_ZERO).toEqual({ tentativesEchouees: 0, verrouilleJusqua: null, dernierEchecLe: null });
  });
});

describe('la connexion, rejouée contre le compte en base', () => {
  // Seule l'horloge est simulée · bcryptjs et les promesses gardent leurs
  // minuteries réelles.
  beforeEach(() => {
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'hrtime', 'performance'],
      now: T0,
    });
  });
  afterEach(() => jest.useRealTimers());

  async function compte() {
    const u: Record<string, unknown> = {
      id: 'u1',
      tenantId: 't1',
      email: 'comptable@cabinet.cd',
      estActif: true,
      estOperateurPlateforme: false,
      motDePasse: await bcrypt.hash('le-bon', 4),
      tentativesEchouees: 0,
      verrouilleJusqua: null,
      dernierEchecLe: null,
      doubleAuthActiveDepuis: null,
    };
    const prisma = {
      user: {
        findUnique: async () => ({ ...u }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(u, data);
          return {};
        },
      },
    };
    const s = new AuthService(
      prisma as never,
      { sign: () => 'jeton' } as never,
      ...([undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined] as [never, never, never, never, never, never, never, never]),
    );
    const essayer = (motDePasse: string) => s.login({ email: 'comptable@cabinet.cd', motDePasse } as never).catch((e: Error) => e);
    return { u, essayer };
  }

  it('l’attaquant PATIENT voit le verrou croître jusqu’à une heure, et y rester', async () => {
    // Il essaie tant que le compte est ouvert, attend l'échéance de chaque
    // verrou, et recommence. Contre l'ancienne règle, chaque verrou durait
    // une minute · la suite ci-dessous tombait sur le deuxième terme.
    const { u, essayer } = await compte();
    const durees: number[] = [];
    let maintenant = T0.getTime();
    while (durees.length < 7) {
      jest.setSystemTime(maintenant);
      await essayer('faux');
      const jusqua = u.verrouilleJusqua as Date | null;
      if (jusqua && jusqua.getTime() > maintenant) {
        durees.push((jusqua.getTime() - maintenant) / 60_000);
        maintenant = jusqua.getTime();
      } else {
        maintenant += 1_000;
      }
    }
    expect(durees).toEqual([1, 5, 15, 30, 60, 60, 60]);
    expect(u.tentativesEchouees).toBe(SEUIL_VERROUILLAGE + 6);
  });

  it('un essai pendant le verrou n’est toujours pas compté', async () => {
    const { u, essayer } = await compte();
    for (let i = 0; i < SEUIL_VERROUILLAGE; i++) await essayer('faux');
    const pose = { ...u };
    jest.setSystemTime(T0.getTime() + 30_000);
    await essayer('faux');
    expect(u.tentativesEchouees).toBe(pose.tentativesEchouees);
    expect(u.verrouilleJusqua).toEqual(pose.verrouilleJusqua);
  });

  it('douze heures après le dernier échec, le compteur est oublié', async () => {
    const { u, essayer } = await compte();
    for (let i = 0; i < SEUIL_VERROUILLAGE + 2; i++) {
      jest.setSystemTime(T0.getTime() + i * HEURE);
      await essayer('faux');
    }
    expect(u.tentativesEchouees).toBe(SEUIL_VERROUILLAGE + 2);
    jest.setSystemTime(T0.getTime() + (SEUIL_VERROUILLAGE + 1) * HEURE + DELAI_OUBLI_ECHECS_HEURES * HEURE);
    await essayer('faux');
    expect(u.tentativesEchouees).toBe(1);
    expect(u.verrouilleJusqua).toBeNull();
  });

  it('une connexion réussie efface compteur, verrou et date · le prochain échec repart de un', async () => {
    const { u, essayer } = await compte();
    for (let i = 0; i < SEUIL_VERROUILLAGE - 1; i++) await essayer('faux');
    expect(u.tentativesEchouees).toBe(SEUIL_VERROUILLAGE - 1);
    await expect(essayer('le-bon')).resolves.toHaveProperty('accessToken');
    expect(u).toMatchObject(DECOMPTE_REMIS_A_ZERO);
    await essayer('faux');
    expect(u.tentativesEchouees).toBe(1);
  });
});
