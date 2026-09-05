import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { filtreBorne } from '../../../common/cloisonnement/extension-cloisonnement';
import { MODELES_CLOISONNES, MODELES_PORTES_PAR_LEUR_PARENT } from '../../../common/cloisonnement/modeles-cloisonnes';
import {
  BORNES_PORTEES,
  ModeleSansBorne,
  TABLES_RESTITUEES,
  borneDuModele,
  colonnesDuModele,
  fichierDeLaTable,
  ordreDuModele,
} from './tables-restitution';

/**
 * CE QUE CES TESTS EMPÊCHENT.
 *
 * La garde de cloisonnement commence par
 * `if (!MODELES_CLOISONNES.has(model)) return query(args)`. Les quinze
 * modèles portés par leur parent n'ont pas de `tenantId`, ne sont donc pas
 * dans cette liste, et LA GARDE NE LES REGARDE PAS. Un
 * `ligneEcriture.findMany({})` dans l'extracteur rendrait les lignes de tous
 * les cabinets · aucune erreur, aucun 403, aucune trace, et une archive
 * parfaitement bien formée contenant la comptabilité d'un autre client.
 *
 * La preuve ne passe donc pas par un `grep` sur la source mais par
 * `filtreBorne`, LA FONCTION QUE LE MOTEUR CONSULTE. Si elle accepte une
 * borne ici, la garde l'accepterait là-bas ; si elle la refuse, ces tests
 * tombent avant que le code ne parte.
 */

const RACINE = join(__dirname, '..', '..', '..', '..');
const DOSSIER = 'd-1';
const AUTRE = 'd-2';

describe('l’inventaire couvre le schéma, sans trou ni surplus', () => {
  it('compte exactement les modèles du schéma, Tenant mis à part', () => {
    const schema = readFileSync(join(RACINE, 'prisma/schema.prisma'), 'utf8');
    const modeles = [...schema.matchAll(/^model (\w+) \{/gm)].map(([, n]) => n);
    // 55 au total · 1 Tenant + 39 cloisonnés + 15 portés.
    expect(modeles).toHaveLength(62);
    expect([...TABLES_RESTITUEES].sort()).toEqual(modeles.filter((m) => m !== 'Tenant').sort());
  });

  it('déclare une borne pour CHAQUE modèle porté, et pour eux seuls', () => {
    // Un modèle porté ajouté demain et oublié ici serait lu sans borne ·
    // c'est exactement le cas que la garde ne rattrape pas.
    expect(Object.keys(BORNES_PORTEES).sort()).toEqual([...MODELES_PORTES_PAR_LEUR_PARENT].sort());
  });

  it('refuse un modèle inconnu au lieu de rendre un filtre vide', () => {
    // Rendre `{}` serait la panne · Prisma servirait alors le monde entier.
    expect(() => borneDuModele('ModeleInvente', DOSSIER)).toThrow(ModeleSansBorne);
  });
});

describe('chaque borne est acceptée par la garde du moteur', () => {
  it('borne les 54 tables au dossier, valeur comprise', () => {
    for (const modele of TABLES_RESTITUEES) {
      const where = borneDuModele(modele, DOSSIER);
      // `filtreBorne` vérifie l'ÉGALITÉ depuis G2a · une borne portant un
      // autre dossier ne passe plus pour une borne.
      expect([modele, filtreBorne(where, DOSSIER)]).toEqual([modele, true]);
      expect([modele, filtreBorne(where, AUTRE)]).toEqual([modele, false]);
    }
  });

  it('borne un modèle cloisonné par son tenantId', () => {
    expect(borneDuModele('Ecriture', DOSSIER)).toEqual({ tenantId: DOSSIER });
  });

  it('borne un modèle porté par sa relation parente obligatoire', () => {
    expect(borneDuModele('LigneEcriture', DOSSIER)).toEqual({ ecriture: { tenantId: DOSSIER } });
    // Le seul cas à deux étages · la ventilation appartient à une ligne, qui
    // appartient à une écriture.
    expect(borneDuModele('VentilationAnalytique', DOSSIER)).toEqual({
      ligne: { ecriture: { tenantId: DOSSIER } },
    });
  });

  it('ne borne par AUCUNE relation facultative', () => {
    // Une relation facultative perdrait en silence toutes les lignes où elle
    // est nulle · l'archive serait incomplète sans rien dire. On relit donc
    // le schéma : chaque relation nommée dans une borne doit y être
    // obligatoire.
    const schema = readFileSync(join(RACINE, 'prisma/schema.prisma'), 'utf8');
    const blocs = new Map(
      [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map(([, nom, corps]) => [nom, corps]),
    );
    for (const [modele, chemin] of Object.entries(BORNES_PORTEES)) {
      let courant = modele;
      for (const relation of chemin) {
        const ligne = blocs
          .get(courant)!
          .split('\n')
          .map((l) => l.trim())
          .find((l) => l.startsWith(`${relation} `));
        expect([modele, relation, ligne]).not.toEqual([modele, relation, undefined]);
        const type = ligne!.split(/\s+/)[1];
        expect([modele, relation, type.endsWith('?')]).toEqual([modele, relation, false]);
        courant = type;
      }
      // Le chemin aboutit bien sur un modèle qui porte un tenantId.
      expect([modele, MODELES_CLOISONNES.has(courant)]).toEqual([modele, true]);
    }
  });
});

describe('ce que l’archive écrit de chaque table', () => {
  it('ne recopie jamais une colonne exclue', () => {
    const colonnes = colonnesDuModele('User');
    expect(colonnes).toContain('email');
    expect(colonnes).not.toContain('motDePasse');
    expect(colonnes).not.toContain('estOperateurPlateforme');
  });

  it('ne recopie que des colonnes, jamais une relation', () => {
    // Suivre une relation dupliquerait la table voisine dans chaque ligne, et
    // ferait sortir par la bande des colonnes exclues du modèle voisin.
    const colonnes = colonnesDuModele('LigneEcriture');
    expect(colonnes).toContain('ecritureId');
    expect(colonnes).not.toContain('ecriture');
    expect(colonnes).not.toContain('compte');
  });

  it('lit le journal d’audit par son RANG, tout le reste par id', () => {
    // C'est le rang qui porte la chaîne d'empreintes · un journal servi dans
    // l'ordre des uuid serait invérifiable par son lecteur.
    expect(ordreDuModele('EvenementAudit')).toBe('rang');
    expect(ordreDuModele('Ecriture')).toBe('id');
  });

  it('range chaque table sous un nom de fichier stable', () => {
    expect(fichierDeLaTable('LigneEcriture')).toBe('tables/ligne-ecriture.csv');
    expect(fichierDeLaTable('Tiers')).toBe('tables/tiers.csv');
    // Deux tables ne se disputent jamais le même fichier.
    const noms = TABLES_RESTITUEES.map(fichierDeLaTable);
    expect(new Set(noms).size).toBe(noms.length);
  });
});
