import * as bcrypt from 'bcryptjs';
import { ActionAudit } from '@prisma/client';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

/**
 * LA CONNEXION RÉUSSIE LAISSE UN MAILLON (passe D4, D4-C4).
 *
 * Code du numérique (ordonnance-loi n° 23/10 du 13 mars 2023), art. 219, 14° ·
 * le responsable du traitement doit « Garantir que soit vérifiée et constatée
 * à posteriori l'identité des personnes ayant eu accès au système
 * informatique contenant des données à caractère personnel […] le moment
 * auquel ces données ont été manipulées ». Une connexion n'écrivait en base
 * que pour remettre un compteur à zéro.
 *
 * La doublure de la chaîne HONORE le filtre de lecture du précédent (par
 * dossier), comme `ecrireMaillon` le demande · une doublure qui rendrait le
 * dernier maillon de n'importe quel dossier validerait un rang faux.
 */

type Maillon = { tenantId: string | null; rang: number; empreinte: string; [k: string]: unknown };

function chaine(existants: Maillon[] = []) {
  const ecrits: Maillon[] = [...existants];
  const tx = {
    $executeRaw: async () => 1,
    $queryRaw: async () => [],
    evenementAudit: {
      findFirst: async ({ where }: { where: { tenantId: string | null } }) =>
        ecrits.filter((m) => m.tenantId === where.tenantId).sort((a, b) => b.rang - a.rang)[0] ?? null,
      create: async ({ data }: { data: Maillon }) => {
        ecrits.push(data);
        return data;
      },
    },
  };
  return { ecrits, clientNu: { $transaction: async (f: (t: typeof tx) => unknown) => f(tx) } };
}

async function service(user: Record<string, unknown>, clientNu: unknown) {
  return new AuthService(
    {
      user: { findUnique: async () => user, update: async () => ({}) },
      clientNu,
    } as never,
    { sign: () => 'jeton' } as never,
    ...([undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined] as [never, never, never, never, never, never, never, never]),
  );
}

async function utilisateur() {
  return {
    id: 'u1',
    email: 'chef@asbl.cd',
    tenantId: 'd1',
    motDePasse: await bcrypt.hash('le-bon', 4),
    estActif: true,
    tentativesEchouees: 0,
    verrouilleJusqua: null,
    dernierEchecLe: null,
    doubleAuthActiveDepuis: null,
    estOperateurPlateforme: false,
  };
}

describe('la connexion réussie est inscrite au journal d’audit (art. 219, 14°)', () => {
  it('écrit un maillon CONNEXION · qui, quel dossier, d’où, à la suite de la chaîne du dossier', async () => {
    const c = chaine([
      { tenantId: 'd1', rang: 7, empreinte: 'e7' },
      { tenantId: 'autre', rang: 40, empreinte: 'x40' },
    ]);
    await (await service(await utilisateur(), c.clientNu)).login(
      { email: 'chef@asbl.cd', motDePasse: 'le-bon' } as never,
      '41.243.0.9',
    );
    const nouveau = c.ecrits.slice(2);
    expect(nouveau).toHaveLength(1);
    expect(nouveau[0]).toMatchObject({
      action: ActionAudit.CONNEXION,
      tenantId: 'd1',
      acteurId: 'u1',
      acteurEmail: 'chef@asbl.cd',
      adresseIp: '41.243.0.9',
      entite: 'User',
      entiteId: 'u1',
      rang: 8,
      empreintePrecedente: 'e7',
    });
  });

  it('un refus n’est pas un accès · le mot de passe faux n’écrit aucun maillon', async () => {
    const c = chaine();
    await expect(
      (await service(await utilisateur(), c.clientNu)).login({ email: 'chef@asbl.cd', motDePasse: 'faux' } as never, '1.2.3.4'),
    ).rejects.toThrow();
    expect(c.ecrits).toHaveLength(0);
  });

  it('un maillon non écrit ne refuse pas la connexion', async () => {
    const enPanne = { $transaction: async () => { throw new Error('table indisponible'); } };
    const r = await (await service(await utilisateur(), enPanne)).login({ email: 'chef@asbl.cd', motDePasse: 'le-bon' } as never, null);
    expect(r).toHaveProperty('csrfToken');
  });

  it('le contrôleur transmet `req.ip`, l’adresse que règlent les relais de confiance', async () => {
    const recus: unknown[] = [];
    const controleur = new AuthController(
      { login: async (...args: unknown[]) => { recus.push(...args); return { accessToken: 'j', csrfToken: 'c' }; } } as never,
      { get: () => undefined } as never,
    );
    const res = { cookie: () => undefined, req: { secure: true, hostname: 'oomega.web.app' } };
    await controleur.login({ email: 'a@b.cd', motDePasse: 'x' } as never, res as never, { ip: '41.243.0.9' } as never);
    expect(recus[1]).toBe('41.243.0.9');
  });
});
