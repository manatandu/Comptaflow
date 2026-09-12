import { readFileSync } from 'fs';
import { join } from 'path';
import { echeancesAVenir, joursEntre, HORIZON_JOURS } from './echeances-a-venir';
import type { EcheancierFiscal } from './types';

type Echeance = EcheancierFiscal['echeances'][number];

const echeance = (p: Partial<Echeance> & { cle: string; date: string }): Echeance => ({
  libelle: p.libelle ?? 'Obligation',
  genre: p.genre ?? 'REVERSEMENT',
  periodicite: 'MENSUELLE',
  beneficiaire: 'ETAT',
  echeance: 'le 15 du mois suivant',
  baseLegale: 'texte',
  reserve: null,
  montantDu: p.montantDu ?? 0,
  moisEnRetard: p.moisEnRetard ?? 0,
  contenu: null,
  sanction: null,
  sourceDonnees: null,
  ...p,
});

const echeancier = (echeances: Echeance[], dateReference = '2026-09-12') => ({ echeances, dateReference });

describe('Prochaines échéances au tableau de bord', () => {
  it('borne par un HORIZON EN JOURS, et compte ce qui le dépasse', () => {
    // Un « les cinq prochaines » masquerait en silence tout ce qui tombe
    // après la cinquième. Un horizon se déclare, et le reste se COMPTE ·
    // « et 2 autres au-delà de 30 jours » est une phrase vraie.
    const r = echeancesAVenir(
      echeancier([
        echeance({ cle: 'a', date: '2026-09-20' }),
        echeance({ cle: 'b', date: '2026-10-05' }),
        echeance({ cle: 'c', date: '2026-11-15' }),
        echeance({ cle: 'd', date: '2026-12-15' }),
      ]),
    );
    expect(r.proches.map((e) => e.cle)).toEqual(['a', 'b']);
    expect(r.auDela).toBe(2);
    expect(r.horizonJours).toBe(HORIZON_JOURS);
  });

  it('UNE DÉCLARATION N’EST JAMAIS EN RETARD CONSTATÉ · le logiciel ne sait pas si elle a été déposée', () => {
    // LA RÈGLE QUI TIENT TOUT LE PANNEAU. Aucune comptabilité ne porte le
    // dépôt d'une déclaration. Marquer un retard là serait un signalement
    // faux, et le cabinet corrigerait un manquement qui n'existe peut-être
    // pas · § 10 bis.
    const r = echeancesAVenir(
      echeancier([echeance({ cle: 'decl', date: '2026-09-20', genre: 'DECLARATION', moisEnRetard: 4 })]),
    );
    expect(r.proches[0].retardConstate).toBe(false);
  });

  it('UN REVERSEMENT en retard l’est · la somme retenue non versée est un fait des livres', () => {
    const r = echeancesAVenir(
      echeancier([echeance({ cle: 'rev', date: '2026-09-20', moisEnRetard: 3, montantDu: 500 })]),
    );
    expect(r.proches[0].retardConstate).toBe(true);
  });

  it('un retard CONSTATÉ remonte en tête, même si sa date est plus lointaine', () => {
    // C'est le seul cas où une pénalité court DÉJÀ · le trier par date le
    // ferait disparaître sous des échéances qui, elles, ne coûtent encore
    // rien.
    const r = echeancesAVenir(
      echeancier([
        echeance({ cle: 'proche', date: '2026-09-14' }),
        echeance({ cle: 'enRetard', date: '2026-10-10', moisEnRetard: 2, montantDu: 900 }),
      ]),
    );
    expect(r.proches.map((e) => e.cle)).toEqual(['enRetard', 'proche']);
  });

  it('un retard constaté est retenu même HORS de l’horizon', () => {
    const r = echeancesAVenir(
      echeancier([echeance({ cle: 'loin', date: '2027-03-15', moisEnRetard: 5, montantDu: 100 })]),
    );
    expect(r.proches.map((e) => e.cle)).toEqual(['loin']);
    expect(r.auDela).toBe(0);
  });

  it('la référence est celle du SERVEUR, jamais l’horloge du poste', () => {
    // Deux navigateurs mal réglés afficheraient sinon deux calendriers
    // différents pour le même dossier, alors que c'est le serveur qui a
    // calculé les dates. LA MÊME échéance, lue depuis deux références, ne
    // tombe pas du même côté de l'horizon.
    const echeances = [echeance({ cle: 'x', date: '2026-09-20' })];
    const proche = echeancesAVenir(echeancier(echeances, '2026-09-19'));
    expect(proche.proches[0].joursRestants).toBe(1);
    expect(proche.auDela).toBe(0);
    // Trente et un jours plus tôt · au-delà de l'horizon, donc comptée et non
    // montrée. C'est la référence du serveur qui décide, pas celle du poste.
    const lointaine = echeancesAVenir(echeancier(echeances, '2026-08-20'));
    expect(lointaine.proches).toHaveLength(0);
    expect(lointaine.auDela).toBe(1);
  });

  it('compte les jours en CALENDAIRE, sans traîner d’heures', () => {
    expect(joursEntre(new Date('2026-09-12T23:00:00Z'), new Date('2026-09-13T01:00:00Z'))).toBe(1);
    expect(joursEntre(new Date('2026-09-12T01:00:00Z'), new Date('2026-09-12T23:00:00Z'))).toBe(0);
  });

  it('LE TABLEAU DE BORD NE DIT JAMAIS « À JOUR » ni « EN RÈGLE »', () => {
    // Une liste vide veut dire « rien dans les trente jours », pas « tout est
    // déposé et payé ». Ce test gèle l'absence de la phrase plutôt que de la
    // laisser à la mémoire de qui relira l'écran.
    //
    // LE DÉPOUILLEMENT DOIT RETIRER LES COMMENTAIRES DE BLOC, pas seulement
    // les lignes qui commencent par `//`. Première rédaction de ce test, et
    // elle échouait sur le commentaire JSX qui EXPLIQUE la règle · un test qui
    // se déclencherait sur sa propre justification apprendrait surtout à être
    // désactivé.
    const page = readFileSync(join(__dirname, '../pages/DashboardPage.tsx'), 'utf8');
    const rendu = page
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('//'))
      .join('\n');
    for (const interdit of ['à jour', 'en règle', 'aucun retard', 'conforme']) {
      expect(rendu.toLowerCase()).not.toContain(interdit);
    }
    // Et la réserve EST écrite, plutôt que simplement omise.
    expect(page).toContain('OmegaX ne détient pas cette information');
  });
});
