import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleUtilisateur } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import { FacturationController } from '../../modules/facturation/facturation.controller';
import { ProvisionsController } from '../../modules/provisions/provisions.controller';

/**
 * LECTURE_SEULE CONSULTE, ELLE N'ÉCRIT PAS · et ce n'est pas le garde qui le
 * garantit.
 *
 * `RolesGuard` laisse passer toute route qui ne porte pas `@Roles(...)` :
 * c'est voulu pour la consultation, et c'est écrit dans son en-tête. Mais la
 * même règle ouvre à un utilisateur en lecture seule toute route d'ÉCRITURE
 * dont le décorateur a été oublié. Le 2026-09-23, DIX contrôleurs étaient dans
 * ce cas (facturation, devis, provisions, inventaire, circularisation,
 * faiblesses, questionnaires, mandat de l'auditeur, accords-cadres,
 * exonérations), soit cinquante routes · un compte en lecture seule,
 * typiquement celui d'un auditeur ou d'un bailleur, pouvait y créer et
 * supprimer des factures, des provisions ou des fiches d'inventaire. Tous
 * importaient `RolesGuard` sans jamais poser `@Roles`.
 *
 * Aucun test ne pouvait le voir, puisque chaque spec de service appelle le
 * service directement, sans passer par le contrôleur. Celui-ci relit donc les
 * SOURCES de tous les contrôleurs : chaque route POST, PUT, PATCH ou DELETE
 * doit porter `@Roles(...)`, sur elle-même ou sur sa classe, ou figurer
 * ci-dessous avec son motif.
 */

/** Contrôleurs entiers dont la protection n'est pas un rôle du dossier. */
const CONTROLEURS_EXEMPTES: Record<string, { motif: string; exige?: string }> = {
  'auth/auth.controller.ts': {
    motif:
      "Authentification · connexion, déconnexion et changement de mot de passe concernent l'utilisateur " +
      'lui-même, quel que soit son rôle.',
  },
  'plateforme/plateforme.controller.ts': {
    motif: "Console de l'opérateur · protégée par un garde propre, qui ne dépend pas du rôle dans un dossier.",
    exige: 'OperateurPlateformeGuard',
  },
};

/**
 * Routes d'écriture au sens HTTP qui n'écrivent RIEN en base · elles
 * calculent et rendent. Vérifié le 2026-09-23 en relisant chaque méthode de
 * service appelée : aucune n'appelle create, update, upsert ni delete.
 */
const ROUTES_DE_CALCUL: Record<string, string> = {
  "devises/devises.controller.ts @Post('reevaluation/calcul')":
    "Calcule la réévaluation sans l'enregistrer · l'enregistrement est `@Post('reevaluation')`, réservé.",
  "operations-specifiques/operation-specifique.controller.ts @Post('proposition')":
    "Propose les lignes d'une opération · l'application est `@Post('application')`, réservée.",
  "regularisation/regularisation.controller.ts @Post('simuler')":
    'Simule une régularisation · sa création est `@Post()`, réservée.',
  "tiers/tiers.controller.ts @Post(':id/calculer')":
    "Calcule les échéances d'un modèle de règlement, sans rien enregistrer.",
};

const RACINE = join(__dirname, '..', '..', 'modules');

function controleurs(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return controleurs(chemin);
    return nom.endsWith('.controller.ts') ? [chemin] : [];
  });
}

interface RouteOuverte {
  fichier: string;
  route: string;
}

function routesOuvertes(): RouteOuverte[] {
  const ouvertes: RouteOuverte[] = [];
  for (const chemin of controleurs(RACINE)) {
    const fichier = relative(RACINE, chemin).split('\\').join('/');
    const lignes = readFileSync(chemin, 'utf-8').split('\n');
    const debutClasse = lignes.findIndex((l) => /^\s*export class/.test(l));
    if (debutClasse < 0) continue;
    const rolesSurLaClasse = lignes.slice(0, debutClasse).some((l) => l.includes('@Roles('));

    lignes.forEach((ligne, i) => {
      const m = ligne.match(/^\s*(@(?:Post|Put|Patch|Delete)\(.*\))\s*$/);
      if (!m) return;
      // Les décorateurs d'une méthode vont de la fin de la méthode précédente
      // jusqu'à sa signature · `@Roles` peut se trouver avant ou après le verbe.
      let debut = i;
      while (debut > 0 && !/^\s*}\s*$/.test(lignes[debut - 1]) && !/^\s*export class/.test(lignes[debut - 1])) debut--;
      let fin = i;
      while (fin < lignes.length && !/^\s*(async\s+)?[a-zA-Z_]\w*\s*\(/.test(lignes[fin])) fin++;
      const bloc = lignes.slice(debut, fin + 1).join('\n');
      if (!rolesSurLaClasse && !bloc.includes('@Roles(')) ouvertes.push({ fichier, route: m[1] });
    });
  }
  return ouvertes;
}
/**
 * Routes PUBLIQUES qui écrivent hors de toute base de dossier, avec leur
 * motif. Aucun compte n'existe quand elles servent.
 */
const ROUTES_PUBLIQUES: Record<string, string> = {
  "sur-site/sur-site.controller.ts @Post('licence')":
    "Dépôt du fichier de licence d'une installation sur site · à la première installation, aucun compte n'existe encore. " +
    'Le fichier ne vaut que signé par VMG et pour ce poste, et une licence plus ancienne ne remplace jamais une plus récente.',
};

describe('Routes d’écriture · réservées à un rôle', () => {
  const ouvertes = routesOuvertes();

  it('le balayage trouve bien des contrôleurs et des routes (un balayage vide ne prouverait rien)', () => {
    expect(controleurs(RACINE).length).toBeGreaterThan(40);
  });

  it('aucune route POST, PUT, PATCH ou DELETE n’est ouverte à la lecture seule sans motif écrit', () => {
    const sansMotif = ouvertes
      .filter((r) => !CONTROLEURS_EXEMPTES[r.fichier])
      .filter((r) => !ROUTES_DE_CALCUL[`${r.fichier} ${r.route}`])
      .filter((r) => !ROUTES_PUBLIQUES[`${r.fichier} ${r.route}`])
      .map((r) => `${r.fichier} ${r.route}`);
    expect(sansMotif).toEqual([]);
  });

  it('chaque exemption vise une route qui existe encore · une exemption orpheline masquerait la suivante', () => {
    for (const cle of [...Object.keys(ROUTES_DE_CALCUL), ...Object.keys(ROUTES_PUBLIQUES)]) {
      expect(ouvertes.map((r) => `${r.fichier} ${r.route}`)).toContain(cle);
    }
  });

  it('un contrôleur exempté porte bien le garde qui justifie son exemption', () => {
    for (const [fichier, { exige }] of Object.entries(CONTROLEURS_EXEMPTES)) {
      const source = readFileSync(join(RACINE, fichier), 'utf-8');
      if (exige) expect(source).toMatch(new RegExp(`@UseGuards\\([^)]*${exige}`));
    }
  });
});

/**
 * LE DÉCORATEUR EST BIEN LU · la présence de `@Roles` dans la source ne
 * suffit pas, il faut que le garde réel refuse. Le contexte d'exécution est
 * reconstitué à la main, avec la vraie méthode du contrôleur.
 */
describe('RolesGuard · une route d’écriture refuse la lecture seule', () => {
  const garde = new RolesGuard(new Reflector());
  const contexte = (classe: object, methode: Function, role: RoleUtilisateur) =>
    ({
      getHandler: () => methode,
      getClass: () => classe,
      switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
    }) as never;

  const cas: [string, object, Function][] = [
    ['facture · enregistrer', FacturationController, FacturationController.prototype.enregistrer],
    ['facture · note de crédit', FacturationController, FacturationController.prototype.emettreNoteDeCredit],
    ['facture · supprimer', FacturationController, FacturationController.prototype.supprimer],
    ['provision · supprimer', ProvisionsController, ProvisionsController.prototype.supprimer],
  ];

  it.each(cas)('%s · LECTURE_SEULE est refusée', (_nom, classe, methode) => {
    expect(() => garde.canActivate(contexte(classe, methode, RoleUtilisateur.LECTURE_SEULE))).toThrow(
      ForbiddenException,
    );
  });

  it.each(cas)('%s · COMPTABLE passe', (_nom, classe, methode) => {
    expect(garde.canActivate(contexte(classe, methode, RoleUtilisateur.COMPTABLE))).toBe(true);
  });

  it('la consultation reste ouverte à la lecture seule · le correctif ne ferme pas la lecture', () => {
    expect(
      garde.canActivate(
        contexte(FacturationController, FacturationController.prototype.lister, RoleUtilisateur.LECTURE_SEULE),
      ),
    ).toBe(true);
  });
});
