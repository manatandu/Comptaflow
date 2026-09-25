import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FonctionMetier, RoleUtilisateur } from '@prisma/client';
import {
  CONTROLEURS_HORS_PROFIL,
  FONCTION_PAR_CONTROLEUR,
  FONCTION_PAR_METHODE,
  fonctionDeRoute,
  motifRefusFonction,
} from './fonctions-metier';
import { JwtAuthGuard } from '../../modules/auth/jwt-auth.guard';
import { EcritureController } from '../../modules/comptabilite/ecriture.controller';
import { LettrageController } from '../../modules/lettrage/lettrage.controller';
import { UtilisateurService } from '../../modules/utilisateurs/utilisateur.service';
import { PrismaService } from '../prisma.service';

/**
 * Point 15 de la comparaison Sage i7 · profil de fonctions par utilisateur.
 */

const RACINE = join(__dirname, '..', '..', 'modules');
function controleurs(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return controleurs(chemin);
    return nom.endsWith('.controller.ts') ? [chemin] : [];
  });
}

/** Classes de contrôleur qui portent au moins une route d'écriture, lues dans les sources. */
function classesQuiEcrivent(): Map<string, string[]> {
  const sortie = new Map<string, string[]>();
  for (const chemin of controleurs(RACINE)) {
    const source = readFileSync(chemin, 'utf-8');
    // Découpe par @Controller : un fichier peut en porter deux (tiers).
    const blocs = source.split(/@Controller\(/).slice(1);
    for (const bloc of blocs) {
      const classe = /export class (\w+)/.exec(bloc)?.[1];
      if (!classe) continue;
      // La méthode suit ses décorateurs, `async` ou non (la facturation n'en met pas).
      const methodes = [...bloc.matchAll(/@(?:Post|Put|Patch|Delete)\([^)]*\)[\s\S]*?\n {2}(?:async )?(\w+)\(/g)].map((m) => m[1]);
      if (methodes.length) sortie.set(classe, methodes);
    }
  }
  return sortie;
}

describe('la table est fermée · chaque contrôleur qui écrit est rangé', () => {
  const classes = classesQuiEcrivent();

  it('le relevé trouve encore des contrôleurs · un garde-fou qui ne trouve rien ne vérifie rien', () => {
    expect(classes.size).toBeGreaterThan(40);
    expect(classes.get('EcritureController')).toEqual(expect.arrayContaining(['valider', 'creer']));
  });

  it('aucun contrôleur qui écrit n’est oublié', () => {
    const oublies = [...classes.keys()].filter((c) => !(c in FONCTION_PAR_CONTROLEUR) && !(c in CONTROLEURS_HORS_PROFIL));
    expect(oublies).toEqual([]);
  });

  it('aucune entrée de la table ne vise un contrôleur ou une méthode qui n’existe plus', () => {
    expect(Object.keys(FONCTION_PAR_CONTROLEUR).filter((c) => !classes.has(c))).toEqual([]);
    for (const cle of Object.keys(FONCTION_PAR_METHODE)) {
      const [classe, methode] = cle.split('.');
      expect([cle, classes.get(classe)?.includes(methode)]).toEqual([cle, true]);
    }
  });

  it('valider n’est pas saisir', () => {
    expect(fonctionDeRoute('EcritureController', 'creer')).toBe(FonctionMetier.SAISIE);
    expect(fonctionDeRoute('EcritureController', 'valider')).toBe(FonctionMetier.VALIDATION);
    expect(fonctionDeRoute('EcritureController', 'validerJusqua')).toBe(FonctionMetier.VALIDATION);
  });
});

describe('la règle', () => {
  const comptable = { role: RoleUtilisateur.COMPTABLE, restreindreFonctions: true, fonctionsAutorisees: [FonctionMetier.SAISIE] };

  it('refuse une écriture hors profil, en nommant la fonction', () => {
    expect(motifRefusFonction(comptable, 'POST', FonctionMetier.VALIDATION)).toMatch(/Validation des écritures.*ne vous est pas ouverte/);
    expect(motifRefusFonction(comptable, 'DELETE', FonctionMetier.LETTRAGE)).not.toBeNull();
  });

  it('laisse passer la fonction ouverte, toute lecture, et tout utilisateur non restreint', () => {
    expect(motifRefusFonction(comptable, 'POST', FonctionMetier.SAISIE)).toBeNull();
    expect(motifRefusFonction(comptable, 'GET', FonctionMetier.VALIDATION)).toBeNull();
    expect(motifRefusFonction({ ...comptable, restreindreFonctions: false }, 'POST', FonctionMetier.VALIDATION)).toBeNull();
  });

  it('l’administrateur n’est jamais restreint, même si la base dit le contraire', () => {
    expect(motifRefusFonction({ ...comptable, role: RoleUtilisateur.ADMIN_CABINET }, 'POST', FonctionMetier.VALIDATION)).toBeNull();
  });
});

describe('JwtAuthGuard applique le profil', () => {
  const garde = new JwtAuthGuard(new Reflector());
  const parent = Object.getPrototypeOf(JwtAuthGuard.prototype) as { canActivate: () => Promise<boolean> };
  const contexte = (user: unknown, methode: string, handler: object, classe: object) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user, method: methode }) }),
      getHandler: () => handler,
      getClass: () => classe,
    }) as unknown as ExecutionContext;
  beforeEach(() => jest.spyOn(parent, 'canActivate').mockResolvedValue(true));
  afterEach(() => jest.restoreAllMocks());

  const saisieSeule = { role: RoleUtilisateur.COMPTABLE, restreindreFonctions: true, fonctionsAutorisees: [FonctionMetier.SAISIE] };

  it('refuse la validation à un profil de saisie, laisse la saisie', async () => {
    await expect(
      garde.canActivate(contexte(saisieSeule, 'POST', EcritureController.prototype.valider, EcritureController)),
    ).rejects.toThrow(/Validation des écritures/);
    await expect(garde.canActivate(contexte(saisieSeule, 'POST', EcritureController.prototype.creer, EcritureController))).resolves.toBe(true);
  });

  it('refuse le lettrage, mais laisse le consulter', async () => {
    const methodes = Object.getOwnPropertyNames(LettrageController.prototype).filter((m) => m !== 'constructor');
    const une = (LettrageController.prototype as unknown as Record<string, object>)[methodes[0]];
    await expect(garde.canActivate(contexte(saisieSeule, 'POST', une, LettrageController))).rejects.toThrow(/Lettrage/);
    await expect(garde.canActivate(contexte(saisieSeule, 'GET', une, LettrageController))).resolves.toBe(true);
  });
});

describe('la définition du profil', () => {
  function service(role: RoleUtilisateur) {
    const update = jest.fn(async (a: unknown) => a);
    const p = { user: { findFirst: jest.fn(async () => ({ id: 'u2', role })), update } };
    return { s: new UtilisateurService(p as unknown as PrismaService), update };
  }

  it('refuse de restreindre un administrateur, sans rien écrire', async () => {
    const { s, update } = service(RoleUtilisateur.ADMIN_CABINET);
    await expect(s.definirFonctions('t1', 'u2', { restreindre: true, fonctions: [] })).rejects.toThrow(/jamais restreint/);
    expect(update).not.toHaveBeenCalled();
  });

  it('pose le profil et FERME les sessions, pour qu’il prenne effet tout de suite', async () => {
    const { s, update } = service(RoleUtilisateur.COMPTABLE);
    await s.definirFonctions('t1', 'u2', { restreindre: true, fonctions: [FonctionMetier.SAISIE, FonctionMetier.SAISIE] });
    const data = (update.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({ restreindreFonctions: true, fonctionsAutorisees: [FonctionMetier.SAISIE] });
    expect(data.sessionsInvalidesAvant).toBeInstanceOf(Date);
  });

  it('lever la restriction vide la liste', async () => {
    const { s, update } = service(RoleUtilisateur.COMPTABLE);
    await s.definirFonctions('t1', 'u2', { restreindre: false, fonctions: [FonctionMetier.SAISIE] });
    expect((update.mock.calls[0][0] as { data: Record<string, unknown> }).data).toMatchObject({ restreindreFonctions: false, fonctionsAutorisees: [] });
  });
});
