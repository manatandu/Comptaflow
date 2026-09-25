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
    // Le nombre est EN DUR pour qu'un modèle ajouté au schéma oblige
    // quelqu'un à décider par quelle borne il se lit · sans quoi il se lirait
    // sans borne du tout. C'est la SEULE fonction de ce chiffre : tomber.
    // Il est passé de 79 à 82 avec le registre du personnel (P1 de la paie),
    // puis à 83 avec le bulletin de paie émis (P8), borné par son tenantId,
    // puis à 86 avec le périmètre de consolidation (entités, participations,
    // faits de l'obligation), tous trois portant leur tenantId, puis à 88
    // avec le cumul (balances des filiales, comptes réciproques), idem, puis
    // à 89 avec les résultats internes de l'art. 86, 4°, idem ; à 90 avec les
    // écarts d'évaluation (tranche 4a), bornés par leur propre `tenantId` ; à
    // 91 avec les provisions pour pertes de change (tranche 4b), idem ; à 95
    // avec les états IFRS (paramètres, règles, retraitements et leurs lignes),
    // chacun borné par son propre `tenantId` ; à 96 avec les mouvements de
    // capitaux propres IFRS (tranche 2), idem ; à 97 avec les effets de change
    // sur la trésorerie IFRS (tranche 3), bornés par leur propre `tenantId` ;
    // à 98 avec les déclarations des notes IFRS (tranche 5), idem.
    // à 99 avec les règles de rangement des postes de consolidation IFRS, idem.
    // à 100 avec les lignes du relevé bancaire importé, cloisonnées par leur
    // propre tenantId et restituées comme pièce externe de la banque.
    // à 102 avec les OD analytiques et leurs lignes, chacune bornée par son
    // propre tenantId.
    // à 103 avec les natures de compte, paramétrage du dossier borné par son
    // tenantId.
    expect(modeles).toHaveLength(103);
    expect([...TABLES_RESTITUEES].sort()).toEqual(modeles.filter((m) => m !== 'Tenant').sort());
  });

  it('L’ARCHIVE REND LES DONNÉES QUE LE JOURNAL MASQUE · deux listes, deux fins', () => {
    // LE DÉFAUT QUE CE TEST EMPÊCHE, ET IL A FAILLI PASSER.
    //
    // `colonnesDuModele()` lisait la liste d'exclusion du JOURNAL D'AUDIT.
    // Tant qu'elle ne contenait que `motDePasse` et `estOperateurPlateforme`,
    // les deux usages coïncidaient et personne ne voyait qu'ils étaient
    // confondus. Le registre du personnel les a séparés : la date de
    // naissance, la nationalité et la rémunération doivent être MASQUÉES au
    // journal (que tout le dossier lit) et RENDUES à l'archive (que le
    // dossier seul reçoit, et qui est faite pour qu'il reconstitue sa base).
    //
    // Avec une seule liste, l'archive se serait amputée en silence de ce
    // qu'elle existe pour rendre, et elle se serait dite complète.
    const colonnes = colonnesDuModele('Salarie');
    for (const attendue of [
      'dateNaissance',
      'nationalite',
      'lieuNaissance',
      'nomConjoint',
      'numeroAffiliationCnss',
    ]) {
      expect(colonnes).toContain(attendue);
    }
    expect(colonnesDuModele('ContratTravail')).toContain('remunerationBase');
    expect(colonnesDuModele('EnfantACharge')).toContain('dateNaissance');

    // ET L'INVERSE RESTE VRAI · ce qui n'appartient pas au dossier ne sort
    // toujours pas. L'empreinte d'un mot de passe et le drapeau de
    // l'exploitant ne sont pas des données du client.
    expect(colonnesDuModele('User')).not.toContain('motDePasse');
    expect(colonnesDuModele('User')).not.toContain('estOperateurPlateforme');
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
