import 'reflect-metadata';
import { AuthService } from './auth.service';

/**
 * /auth/me porte le FAIT qui commande le menu de l'accord-cadre (loi
 * n° 004/2001, art. 37) · client/src/lib/profil-dossier.ts. Même règle que le
 * module, jamais une seconde.
 */
function me(tenant: Record<string, unknown>) {
  const user = {
    id: 'u1',
    email: 'a@b.cd',
    role: 'ADMIN_CABINET',
    estOperateurPlateforme: false,
    doitChangerMotDePasse: false,
    tenant: { id: 't1', nom: 'X', _count: { cellules: 0 }, ...tenant },
  };
  const s = new AuthService(
    { user: { findUnique: async () => user } } as never,
    { sign: () => 'jeton' } as never,
    ...([undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined] as [never, never, never, never, never, never, never, never]),
  );
  return s.me('u1');
}

describe('/auth/me · le fait « ONG de droit étranger »', () => {
  it('vrai pour une ONG de droit étranger seulement', async () => {
    const base = { referentiel: 'SYCEBNL', jeuEtatsFinanciersSycebnl: 'ASSOCIATIONS_ORDRES_PROFESSIONNELS' };
    expect((await me({ ...base, formeJuridique: 'ORGANISATION_NON_GOUVERNEMENTALE', droitEtranger: true })).tenant.ongEtrangere).toBe(true);
    expect((await me({ ...base, formeJuridique: 'ORGANISATION_NON_GOUVERNEMENTALE', droitEtranger: false })).tenant.ongEtrangere).toBe(false);
    expect((await me({ ...base, formeJuridique: 'ASSOCIATION', droitEtranger: true })).tenant.ongEtrangere).toBe(false);
  });

  it('null hors SYCEBNL, où la question ne se pose pas', async () => {
    expect((await me({ referentiel: 'SYSCOHADA', systemeComptableSyscohada: 'NORMAL' })).tenant.ongEtrangere).toBeNull();
  });
});

describe('/auth/me · assujettissement à la TVA et ventes, trois valeurs', () => {
  const base = { referentiel: 'SYSCOHADA', systemeComptableSyscohada: 'NORMAL' };

  it('le faux par défaut, sans réponse, vaut « pas encore dit »', async () => {
    const t = (await me({ ...base, assujettiTva: false, assujettissementTvaRepondu: false, venteBiensServices: null })).tenant;
    expect(t.assujettissementTva).toBeNull();
    expect(t.venteBiensServices).toBeNull();
  });

  it('une réponse donnée est rendue telle quelle', async () => {
    const t = (await me({ ...base, assujettiTva: false, assujettissementTvaRepondu: true, venteBiensServices: false })).tenant;
    expect(t.assujettissementTva).toBe(false);
    expect(t.venteBiensServices).toBe(false);
    expect((await me({ ...base, assujettiTva: true, assujettissementTvaRepondu: true })).tenant.assujettissementTva).toBe(true);
  });
});
