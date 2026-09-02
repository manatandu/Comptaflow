import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fenetreDisponible } from '../lib/referentiel-fenetre';

/**
 * LE JOURNAL D'AUDIT EST COMMUN AUX DEUX RÉFÉRENTIELS, ET RÉSERVÉ À L'ADMIN.
 *
 * Commun · l'AUDCIF art. 22 impose le chemin de révision à toute entité qui
 * tient une comptabilité informatisée, et le SYCEBNL n'écarte pas cet article
 * (son art. 3 énumère ce qu'il exclut de l'AUDCIF · l'art. 22 n'y est pas).
 * Le cloisonner serait la faute inverse de celle qu'on corrige d'habitude.
 *
 * Réservé · le journal dit qui a fait quoi, il expose l'activité de chaque
 * collaborateur du dossier. Le cloisonnement se fait aux DEUX bouts, comme
 * toujours : `admin: true` sur la tuile côté client, `@Roles(ADMIN_CABINET)`
 * sur le contrôleur côté serveur. Masquer sans refuser laisserait la route
 * ouverte à un appel direct.
 */

const CLIENT = join(__dirname, '..');
const lire = (p: string) => readFileSync(join(CLIENT, p), 'utf8');
const lireServeur = (p: string) => readFileSync(join(CLIENT, '../../src', p), 'utf8');

describe('Fenêtre Journal d’audit', () => {
  it('est enregistrée et ouverte aux deux référentiels', () => {
    const registre = lire('lib/registre-fenetres.tsx');
    const bloc = registre.split(/\n  \{/).find((b) => b.includes('/journal-audit'));
    expect(bloc).toBeDefined();
    expect(bloc).not.toContain('referentielsApplicables');

    for (const referentiel of ['SYCEBNL', 'SYSCOHADA'] as const) {
      expect([referentiel, fenetreDisponible({}, referentiel)]).toEqual([referentiel, true]);
    }
  });

  it('est réservée à l’administrateur, aux deux bouts', () => {
    const accueil = lire('pages/AccueilPage.tsx');
    const tuile = accueil.split('\n').find((l) => l.includes("chemin: '/journal-audit'"));
    expect(tuile).toContain('admin: true');

    const controleur = lireServeur('common/audit/journal-audit.controller.ts');
    expect(controleur).toContain('RoleUtilisateur.ADMIN_CABINET');
  });

  it('n’offre AUCUNE action d’écriture', () => {
    // Un journal que l'on peut corriger depuis le logiciel ne prouve plus
    // rien. Ce n'est pas un oubli d'ergonomie, c'est la garantie elle-même.
    const page = lire('pages/JournalAuditPage.tsx');
    expect(page).not.toContain('api.post');
    expect(page).not.toContain('api.patch');
    expect(page).not.toContain('api.delete');
  });
});
