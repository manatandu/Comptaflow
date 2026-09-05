import { PlateformeService } from './plateforme.service';
import { PrismaService } from '../../common/prisma.service';
import { AuthService } from '../auth/auth.service';
import { ConfigService } from '@nestjs/config';

/**
 * DOSSIER DE DÉMONSTRATION · la vitrine que tout magasin d'applications
 * réclame pour instruire une soumission.
 *
 * LE TEST QUI COMPTE EST LE DEUXIÈME. `MotDePasseAChangerGuard` ferme le
 * serveur tant qu'un mot de passe provisoire n'a pas été remplacé : sans
 * `doitChangerMotDePasse: false`, l'examinateur du magasin se connecte, reçoit
 * l'écran de changement de mot de passe à la place du logiciel, et rejette la
 * soumission pour une application « qui ne s'ouvre pas ». Rien dans les
 * journaux n'aurait signalé quoi que ce soit · la garde aurait fait exactement
 * son travail.
 */

type Faux = Record<string, unknown>;

function service(options: { existant?: unknown } = {}) {
  const tenantUpdate = jest.fn().mockResolvedValue({});
  const userUpdateMany = jest.fn().mockResolvedValue({});
  const prisma = {
    tenant: {
      findFirst: jest.fn().mockResolvedValue(options.existant ?? null),
      update: tenantUpdate,
    },
    user: { updateMany: userUpdateMany },
  } as Faux;
  const authService = {
    register: jest.fn().mockResolvedValue({ tenant: { id: 't-demo', nom: 'Démo' } }),
  } as unknown as AuthService;
  const config = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
  return {
    service: new PlateformeService(prisma as unknown as PrismaService, config, authService),
    prisma,
    authService,
    tenantUpdate,
    userUpdateMany,
  };
}

const DTO = { email: 'demonstration@vmgconsulting.cd', motDePasse: 'DemoOmegaX2026' };

describe("l'ouverture du dossier de démonstration", () => {
  it('marque le dossier, plutôt que de compter sur son intitulé', async () => {
    // Reconnaître la vitrine à son nom marcherait jusqu'au jour où un client
    // s'appellerait « DÉMO », et ce jour-là c'est un vrai dossier que la
    // remise à zéro effacerait.
    const { service: s, tenantUpdate } = service();
    await s.preparerDossierDemonstration(DTO);
    expect(tenantUpdate.mock.calls[0][0].data).toEqual({ estDemonstration: true });
  });

  it("n'impose PAS le changement de mot de passe · sinon la vitrine ne s'ouvre jamais", async () => {
    const { service: s, userUpdateMany } = service();
    await s.preparerDossierDemonstration(DTO);
    expect(userUpdateMany.mock.calls[0][0].data).toEqual({ doitChangerMotDePasse: false });
  });

  it('emploie le mot de passe CHOISI, jamais un tirage au sort', async () => {
    // Il figure dans le formulaire de soumission du magasin · un mot de passe
    // qui change à chaque ouverture y devient faux sans que personne ne s'en
    // aperçoive.
    const { service: s, authService } = service();
    await s.preparerDossierDemonstration(DTO);
    expect((authService.register as jest.Mock).mock.calls[0][0].motDePasse).toBe('DemoOmegaX2026');
  });

  it("refuse d'ouvrir une SECONDE vitrine, et nomme celle qui existe", async () => {
    // Deux vitrines divergent, et c'est toujours la mauvaise qu'on donne au
    // magasin.
    const { service: s } = service({
      existant: { id: 't1', nom: 'Démo OmegaX', users: [{ email: 'demo@vmgconsulting.cd' }] },
    });
    await expect(s.preparerDossierDemonstration(DTO)).rejects.toThrow(/existe déjà/i);
    await expect(s.preparerDossierDemonstration(DTO)).rejects.toThrow(/demo@vmgconsulting.cd/);
  });

  it("cherche la vitrine existante SUR SON DRAPEAU, et sur rien d'autre", async () => {
    // Ce test manquait, et une mutation l'a montré : la doublure rendait le
    // dossier existant quelle que soit la requête, si bien qu'une borne fausse
    // (un `id` improbable ajouté au `where`) laissait le refus s'endormir sans
    // qu'aucun test ne bouge. Une seconde vitrine s'ouvrait alors en silence.
    const { service: s, prisma } = service({ existant: null });
    await s.preparerDossierDemonstration(DTO);
    const where = (prisma.tenant as { findFirst: jest.Mock }).findFirst.mock.calls[0][0].where;
    expect(where).toEqual({ estDemonstration: true });
  });

  it('ne renvoie jamais le mot de passe', async () => {
    // L'opérateur vient de le choisir · le réémettre le ferait entrer dans un
    // journal de requêtes pour rien.
    const { service: s } = service();
    const r = await s.preparerDossierDemonstration(DTO);
    expect(JSON.stringify(r)).not.toContain('DemoOmegaX2026');
  });
});
