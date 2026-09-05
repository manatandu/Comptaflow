import { BadRequestException } from '@nestjs/common';
import { RoleUtilisateur, StatutMessage } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { CourrierService, ORIGINE_MOT_DE_PASSE_TEMPORAIRE } from '../courrier/courrier.service';
import { AvisAccesService, avisCompteCree, avisReinitialisation } from './avis-acces.service';
import { UtilisateurController } from './utilisateur.controller';
import { UtilisateurService } from './utilisateur.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/**
 * LA REMISE D'UN ACCÈS ÉTAIT MUETTE.
 *
 * Un compte se créait, un mot de passe se réinitialisait, et le titulaire
 * n'apprenait rien · dans le meilleur des cas l'administrateur décrochait son
 * téléphone, dans le pire un comptable voyait ses sessions se fermer sous lui
 * sans savoir pourquoi.
 *
 * Ce que ces tests tiennent, du plus grave au moins grave :
 *
 *  · LE MOT DE PASSE PROVISOIRE N'EST JAMAIS DANS LE CORPS. Un corps de
 *    message est écrit en clair dans `messages`, il y reste, il part dans la
 *    sauvegarde de chaque nuit, et `GET /courrier/:id` le rend entier à tout
 *    utilisateur du dossier, lecture seule comprise. Le mot de passe d'un
 *    collègue y serait donné à tout le monde, pour toujours ;
 *  · l'avis n'est JAMAIS une condition de l'accès · une file qui refuse ne
 *    doit pas rendre la création de comptes impossible, ce qu'elle ferait sur
 *    l'installation d'aujourd'hui, qui n'a pas de transport ;
 *  · ce qui est ajouté est ajouté, rien n'est retiré · l'administrateur
 *    choisit le mot de passe, le voit, et le remet lui-même.
 */

const DOSSIER = 'd-1';
const ADMIN = 'u-admin';
const PROVISOIRE = 'mot-de-passe-provisoire-tres-long';

function service(
  mettreEnFile: jest.Mock = jest.fn(async () => ({
    id: 'm-1',
    statut: StatutMessage.SANS_TRANSPORT,
    erreur: null,
  })),
) {
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue({ nom: 'ONG Kin' }) },
  } as unknown as PrismaService;
  const avis = new AvisAccesService(prisma, { mettreEnFile } as unknown as CourrierService);
  return { avis, mettreEnFile };
}

// ---------------------------------------------------------------------------

describe('le mot de passe provisoire ne voyage pas dans la file', () => {
  const textes = [
    avisCompteCree({ entite: 'ONG Kin', email: 'comptable@ong-kin.cd', role: RoleUtilisateur.COMPTABLE }),
    avisReinitialisation({ entite: 'ONG Kin', email: 'comptable@ong-kin.cd' }),
  ];

  it('ne figure ni dans l’objet ni dans le corps d’aucun avis', () => {
    // Ce test est le garde-fou de la décision : le jour où quelqu'un croira
    // rendre service en glissant le mot de passe dans le message, il tombe.
    for (const texte of textes) {
      expect(texte.corps).not.toContain(PROVISOIRE);
      expect(texte.sujet).not.toContain(PROVISOIRE);
      // Et aucun jeton qui ferait croire qu'il aurait dû s'y trouver.
      expect(texte.corps).not.toMatch(/\{motDePasse|\{mot-de-passe/);
    }
  });

  it('dit d’où le mot de passe vient, puisqu’il n’est pas là', () => {
    // Un avis qui tairait la question laisserait le titulaire chercher dans
    // le message un mot de passe qui n'y est pas.
    for (const texte of textes) {
      expect(texte.corps).toContain('ne figure pas dans ce message');
      expect(texte.corps).toContain('provisoire');
    }
  });

  it('nomme le rôle comme la fenêtre le nomme', () => {
    // « ADMIN_CABINET » dans le courriel et « Administrateur » à l'écran
    // feraient douter qu'il s'agit du même droit.
    const texte = avisCompteCree({ entite: 'ONG Kin', email: 'a@b.cd', role: RoleUtilisateur.ADMIN_CABINET });
    expect(texte.corps).toContain('« Administrateur »');
    expect(texte.corps).not.toContain('ADMIN_CABINET');
  });

  it('la réinitialisation explique la fermeture des sessions et ouvre un recours', () => {
    // Une session qui se ferme sans explication ne se distingue pas d'une
    // panne · ou d'une intrusion, quand ce n'est pas le titulaire qui a
    // demandé la réinitialisation.
    const texte = avisReinitialisation({ entite: 'ONG Kin', email: 'a@b.cd' });
    expect(texte.corps).toContain('sessions');
    expect(texte.corps).toContain("Si vous n'avez pas demandé cette réinitialisation");
  });
});

describe('l’avis entre dans la file, borné au dossier', () => {
  it('porte le dossier, l’adresse du compte, l’origine et la pièce', async () => {
    const { avis, mettreEnFile } = service();

    const remis = await avis.annoncerCompteCree(DOSSIER, {
      userId: 'u-9',
      email: 'comptable@ong-kin.cd',
      role: RoleUtilisateur.COMPTABLE,
      parQui: ADMIN,
    });

    const [dossier, message] = mettreEnFile.mock.calls[0];
    // Le cloisonnement se porte AUX DEUX BOUTS.
    expect(dossier).toBe(DOSSIER);
    expect(message).toMatchObject({
      destinataire: 'comptable@ong-kin.cd',
      origine: ORIGINE_MOT_DE_PASSE_TEMPORAIRE,
      origineId: 'u-9',
      createdBy: ADMIN,
    });
    // Sans transport, l'avis n'est ni envoyé ni perdu · il repartira tel quel.
    expect(remis).toMatchObject({ avise: true, statut: StatutMessage.SANS_TRANSPORT, motif: null });
  });

  it('nomme le dossier · un collaborateur peut en avoir plusieurs', async () => {
    const { avis, mettreEnFile } = service();
    await avis.annoncerReinitialisation(DOSSIER, { userId: 'u-9', email: 'a@b.cd', parQui: ADMIN });
    expect(mettreEnFile.mock.calls[0][1].sujet).toContain('ONG Kin');
  });
});

describe('l’avis n’est jamais une condition de l’accès', () => {
  /** Une file qui refuse tout · l'adresse du compte lui déplaît. */
  const fileQuiRefuse = () =>
    jest.fn(async () => {
      throw new BadRequestException('Adresse de destinataire inutilisable · « comptable@intranet ».');
    });

  it('le compte est créé, et la réponse dit que le titulaire n’a pas été averti', async () => {
    const { avis } = service(fileQuiRefuse());
    const utilisateurs = {
      creer: jest.fn(async () => ({
        id: 'u-9',
        email: 'comptable@intranet',
        role: RoleUtilisateur.COMPTABLE,
      })),
    } as unknown as UtilisateurService;
    const controleur = new UtilisateurController(utilisateurs, avis);

    const reponse = await controleur.creer(
      { userId: ADMIN, tenantId: DOSSIER } as AuthenticatedUser,
      { email: 'comptable@intranet', motDePasse: PROVISOIRE, role: RoleUtilisateur.COMPTABLE },
    );

    // LE COMPTE EXISTE · sans transport opérationnel, faire dépendre la
    // création d'un avis rendrait la fenêtre Autorisations d'accès
    // inutilisable, c'est-à-dire pire qu'avant.
    expect(reponse).toMatchObject({ id: 'u-9', email: 'comptable@intranet' });
    // Et le silence n'est pas repris : la réponse dit qu'il n'a pas été averti.
    expect(reponse.avis).toMatchObject({ avise: false, statut: null });
    expect(reponse.avis.motif).toContain("n'a pas pu être averti");
  });

  it('la réinitialisation aboutit même quand l’avis ne part pas', async () => {
    const { avis } = service(fileQuiRefuse());
    const utilisateurs = {
      reinitialiserMotDePasse: jest.fn(async () => ({ reinitialise: true, email: 'comptable@intranet' })),
    } as unknown as UtilisateurService;
    const controleur = new UtilisateurController(utilisateurs, avis);

    const reponse = await controleur.reinitialiserMotDePasse(
      { userId: ADMIN, tenantId: DOSSIER } as AuthenticatedUser,
      'u-9',
      { motDePasseProvisoire: PROVISOIRE },
    );

    // Le mot de passe est posé, les sessions sont fermées · c'est fait, et
    // rien de ce qui suit ne le défait.
    expect(reponse).toMatchObject({ reinitialise: true, email: 'comptable@intranet' });
    expect(reponse.avis.avise).toBe(false);
  });
});
