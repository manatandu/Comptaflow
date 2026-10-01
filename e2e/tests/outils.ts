import { expect, type Page, type Response } from '@playwright/test';

/**
 * L'API EST LE RELAIS /api DE `vite preview`, JAMAIS LE SERVEUR EN DIRECT ·
 * même adresse que la page, comme Firebase Hosting relaie vers Cloud Run.
 * Le relais n'existe que si le client est servi avec `OMEGAX_API_RELAIS` et
 * construit avec `VITE_API_URL=/api` (tests-navigateur.yml, CLAUDE.md § 10).
 * La marche locale écrite jusqu'au 2026-09-28 construisait le client contre
 * le serveur en direct et ne posait pas le relais · chaque appel d'ici
 * tombait (audit final F197). `reglement-interieur.spec.ts` tient cette
 * valeur égale à celle du workflow.
 */
export const API = process.env.OMEGAX_API ?? 'http://localhost:4173/api';
export const MOT_DE_PASSE = 'MotDePasse-e2e-2026!';

/** Ce qu'une fenêtre qui plante affiche (`LimiteErreur.tsx`). */
export const FENETRE_EN_ERREUR = 'Cette fenêtre n’a pas pu s’afficher';

/**
 * Un appel à l'API depuis la page, avec le cookie de session et le jeton
 * CSRF que le client range en localStorage · le même chemin que l'écran,
 * donc la même CORS et les mêmes cookies.
 */
export async function appelApi<T>(
  page: Page,
  methode: string,
  chemin: string,
  corps?: unknown,
  entetes: Record<string, string> = {},
): Promise<T> {
  return page.evaluate(
    async ({ api, methode, chemin, corps, entetes }) => {
      const csrf = localStorage.getItem('omegax:csrf');
      const res = await fetch(api + chemin, {
        method: methode,
        credentials: 'include',
        headers: {
          ...(corps === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(csrf && methode !== 'GET' ? { 'X-CSRF-Token': csrf } : {}),
          ...entetes,
        },
        body: corps === undefined ? undefined : JSON.stringify(corps),
      });
      const texte = await res.text();
      if (!res.ok) throw new Error(`${methode} ${chemin} · ${res.status} · ${texte.slice(0, 300)}`);
      const json = texte ? JSON.parse(texte) : undefined;
      if (json && typeof json.csrfToken === 'string') localStorage.setItem('omegax:csrf', json.csrfToken);
      return json;
    },
    { api: API, methode, chemin, corps, entetes },
  ) as Promise<T>;
}

export interface Dossier {
  email: string;
  exerciceId: string;
  libelle: string;
}

interface Compte { id: string; numero: string; typeCompte: string }
interface Journal { id: string; code: string; type: string }

/**
 * UN DOSSIER NEUF PAR PARCOURS · créé par la route d'inscription (ouverte en
 * CI seulement, `INSCRIPTION_PUBLIQUE=true`), avec un exercice et UNE
 * écriture équilibrée qui mouvemente la trésorerie contre un produit. Les
 * écrans lisent donc de vraies données, et le montant se retrouve à la
 * balance.
 */
export async function creerDossier(
  page: Page,
  options: {
    referentiel: 'SYSCOHADA' | 'SYCEBNL';
    nom: string;
    montant: number;
    /** SYCEBNL seulement · les associations par défaut. */
    jeuSycebnl?: 'ASSOCIATIONS_ORDRES_PROFESSIONNELS' | 'PROJETS_DEVELOPPEMENT';
  },
): Promise<Dossier> {
  await page.goto('/');
  const email = `e2e-${options.referentiel.toLowerCase()}-${Date.now()}@exemple.cd`;
  // UNE ADRESSE CLIENTE PAR DOSSIER · l'inscription est limitée à trente par
  // heure et par adresse (auth.controller.ts), et tout le job arrive par
  // 127.0.0.1 · la suite, qui crée une quarantaine de dossiers sous deux
  // moteurs, tombait en 429 (run 214). En production, Firebase Hosting écrit
  // l'adresse du client dans `X-Forwarded-For` et le serveur fait confiance à
  // deux relais (common/sauts-de-confiance.ts) · le test joue ce rôle, la
  // limite elle-même ne bouge pas.
  const n = (Date.now() + Math.floor(Math.random() * 1_000)) % 16_777_216;
  const adresse = `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
  // TOUTE LA SUITE DU TEST PART DE CETTE ADRESSE · la limite générale (trois
  // cents requêtes par minute et par adresse, app.module.ts) se partageait
  // entre les tests qui s'enchaînent, et la connexion de trois d'entre eux
  // tombait en 429 (tests navigateur, run 232). Même raison que
  // l'inscription · chaque test est un client, la limite ne bouge pas.
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': adresse });
  await appelApi(page, 'POST', '/auth/register', {
    nomEntite: options.nom,
    referentiel: options.referentiel,
    email,
    motDePasse: MOT_DE_PASSE,
    ...(options.referentiel === 'SYCEBNL'
      ? { jeuEtatsFinanciersSycebnl: options.jeuSycebnl ?? 'ASSOCIATIONS_ORDRES_PROFESSIONNELS' }
      : { systemeComptableSyscohada: 'NORMAL' }),
  }, { 'X-Forwarded-For': adresse });
  // L'inscription ouvre déjà l'exercice en cours · on le prend, on n'en crée
  // un que s'il manque.
  const exercices = await appelApi<{ id: string; dateDebut: string; dateFin: string }[]>(page, 'GET', '/exercices');
  const exercice =
    exercices[0] ?? (await appelApi<{ id: string; dateDebut: string; dateFin: string }>(page, 'POST', '/exercices', { dateDebut: '2026-01-01', dateFin: '2026-12-31' }));
  // L'écriture tombe au milieu de l'exercice, quel qu'il soit.
  const milieu = new Date((Date.parse(exercice.dateDebut) + Date.parse(exercice.dateFin)) / 2).toISOString().slice(0, 10);
  const comptes = await appelApi<Compte[]>(page, 'GET', '/comptes?typeCompte=DETAIL');
  const journaux = await appelApi<Journal[]>(page, 'GET', '/journaux');
  const detail = (racine: string) => {
    const c = comptes.find((x) => x.typeCompte === 'DETAIL' && x.numero.startsWith(racine));
    if (!c) throw new Error(`Aucun compte de détail sous ${racine} dans le plan semé`);
    return c;
  };
  const banque = detail('52');
  const produit = detail('7');
  const journal = journaux.find((j) => j.type === 'GENERAL') ?? journaux[0];
  const libelle = `Recette e2e ${options.referentiel}`;
  await appelApi(page, 'POST', '/ecritures', {
    exerciceId: exercice.id,
    journalId: journal.id,
    date: milieu,
    libelle,
    lignes: [
      { compteId: banque.id, libelle, debit: options.montant, credit: 0 },
      { compteId: produit.id, libelle, debit: 0, credit: options.montant },
    ],
  });
  await appelApi(page, 'POST', '/auth/logout');
  await page.evaluate(() => localStorage.clear());
  return { email, exerciceId: exercice.id, libelle };
}

/** Ouvre le dossier par l'écran de connexion, comme un utilisateur. */
export async function seConnecter(page: Page, email: string) {
  await page.goto('/');
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', MOT_DE_PASSE);
  await page.getByRole('button', { name: 'Ouvrir le dossier' }).click();
  await expect(page.getByRole('button', { name: 'Structure', exact: true })).toBeVisible();
}

/**
 * CE QUI NE DOIT JAMAIS ARRIVER, relevé pendant toute la durée d'un test ·
 * une exception JavaScript non rattrapée, et une réponse 5xx du serveur.
 * Un 4xx est une réponse (un refus nommé), pas une panne.
 */
export function surveiller(page: Page) {
  const pannes: string[] = [];
  page.on('pageerror', (e) => pannes.push(`exception · ${e.message}`));
  page.on('response', (r: Response) => {
    if (r.url().startsWith(API) && r.status() >= 500) pannes.push(`${r.status()} · ${r.request().method()} ${r.url().slice(API.length)}`);
  });
  return pannes;
}
