import { readFileSync } from 'fs';
import { join } from 'path';
import {
  DECLARATION_METHODES_IDENTIQUES,
  RESERVE_JEU_INCOMPLET,
  finDeJournee,
  memePeriodeExercicePrecedent,
  motifRefusDateArrete,
} from './situation-intermediaire';

/**
 * LA SITUATION INTERMÉDIAIRE · AUDCIF, Titre VIII ch. 39.
 *
 * CE QUE RIEN NE POUVAIT FAIRE. Aucun état ne prenait de date, et la balance
 * elle-même était bornée à l'exercice : il n'existait AUCUN chemin, pas même
 * manuel, pour obtenir une situation arrêtée au 30 juin. Un cabinet à qui une
 * banque en demandait une devait la monter hors du logiciel.
 *
 * LE PIÈGE DE CE CHAPITRE, et ce que ces tests gèlent : une situation servie à
 * moitié est un état INCOMPLET au sens du texte, pas un service rendu. Le
 * § 2.1.2 réclame des comparatifs précis, le § 2.1.1 une déclaration sur les
 * méthodes, et le § 2.1 une liste de mentions qu'aucun solde ne porte.
 */

const EXERCICE_2026 = { dateDebut: new Date('2026-01-01T00:00:00Z'), dateFin: new Date('2026-12-31T23:59:59Z') };
const EXERCICE_2025 = { dateDebut: new Date('2025-01-01T00:00:00Z'), dateFin: new Date('2025-12-31T23:59:59Z') };

describe('la date d’arrêté d’une situation intermédiaire', () => {
  it('accepte une date à l’intérieur de l’exercice', () => {
    expect(motifRefusDateArrete(new Date('2026-06-30T23:59:59Z'), EXERCICE_2026)).toBeNull();
  });

  it('REFUSE une date antérieure à l’ouverture, et dit pourquoi', () => {
    // LE DÉFAUT QUE CE REFUS EMPÊCHE · l'écriture de report à-nouveau est
    // datée de l'ouverture. En deçà, elle sort de la lecture et les soldes
    // sont amputés du bilan d'ouverture · l'état boucle sur lui-même, aucun
    // total ne le trahit, et la situation est celle d'un dossier qui n'aurait
    // jamais eu d'exercice antérieur.
    const motif = motifRefusDateArrete(new Date('2025-12-31T23:59:59Z'), EXERCICE_2026);
    expect(motif).toContain('report à-nouveau');
    expect(motif).toContain('2026-01-01');
  });

  it('refuse une date postérieure à la clôture, et dit pourquoi', () => {
    // Au-delà, la borne ne retient rien de plus que l'exercice entier · mais
    // le document porterait la mention « arrêté au », qui serait fausse.
    const motif = motifRefusDateArrete(new Date('2027-03-01T23:59:59Z'), EXERCICE_2026);
    expect(motif).toContain('après la clôture');
    expect(motif).toContain('2026-12-31');
  });

  it('lit la date à la FIN de la journée', () => {
    // Une écriture datée du 30 juin appartient à la situation au 30 juin.
    // Sans cette borne, une date reçue à minuit exclurait les écritures du
    // jour même et la situation serait celle de la veille, sous un titre qui
    // dirait autre chose.
    const borne = finDeJournee(new Date('2026-06-30T00:00:00Z'));
    expect(borne.toISOString()).toBe('2026-06-30T23:59:59.999Z');
  });
});

describe('la MÊME PÉRIODE de l’exercice précédent · § 2.1.2, deuxième tiret', () => {
  it('rend le même jour du même mois sur l’exercice précédent', () => {
    // La colonne qui donne du sens à la première : comparer un semestre à une
    // année entière ferait conclure à un effondrement là où il n'y a qu'une
    // demi-période.
    const equivalent = memePeriodeExercicePrecedent(new Date('2026-06-30T23:59:59Z'), EXERCICE_2025);
    expect(equivalent?.toISOString().slice(0, 10)).toBe('2025-06-30');
  });

  it('n’en rend AUCUNE quand il n’y a pas d’exercice précédent', () => {
    expect(memePeriodeExercicePrecedent(new Date('2026-06-30T23:59:59Z'), null)).toBeNull();
  });

  it('n’en rend aucune quand la période équivalente tombe hors de l’exercice précédent', () => {
    // Premier exercice court, ou exercice de liquidation. Mieux vaut une
    // colonne absente qu'une colonne qui compare deux périodes de longueurs
    // différentes sans le dire · c'est la même discipline que le « jamais un
    // faux zéro » de la colonne N-1.
    const premierExerciceCourt = {
      dateDebut: new Date('2025-09-01T00:00:00Z'),
      dateFin: new Date('2025-12-31T23:59:59Z'),
    };
    expect(memePeriodeExercicePrecedent(new Date('2026-06-30T23:59:59Z'), premierExerciceCourt)).toBeNull();
    // Et elle revient dès que la date tombe dans la période couverte.
    expect(
      memePeriodeExercicePrecedent(new Date('2026-10-15T23:59:59Z'), premierExerciceCourt)?.toISOString().slice(0, 10),
    ).toBe('2025-10-15');
  });
});

describe('ce que la situation DIT d’elle-même', () => {
  it('porte la déclaration du § 2.1.1 sur les méthodes comptables', () => {
    expect(DECLARATION_METHODES_IDENTIQUES).toContain('identiques à celles utilisées dans les comptes');
    // Et la seconde branche du tiret, celle qu'on oublie : si elles ont changé.
    expect(DECLARATION_METHODES_IDENTIQUES).toContain('pro-forma');
    expect(DECLARATION_METHODES_IDENTIQUES).toContain('§ 2.1.1');
  });

  it('DIT qu’elle n’est pas un jeu complet, et ce qui manque', () => {
    // Une situation qui se présenterait comme le « jeu complet » du chapitre
    // sans les mentions du § 2.1.1 serait un document faux. Le logiciel ne
    // peut produire aucune d'entre elles : elles ne se déduisent d'aucun
    // solde.
    expect(RESERVE_JEU_INCOMPLET).toContain('n’est pas un jeu complet');
    for (const mention of ['éléments exceptionnels', 'estimation', 'parties liées', 'saisonnier']) {
      expect(RESERVE_JEU_INCOMPLET).toContain(mention);
    }
  });
});

describe('la borne traverse tout le chemin, de la balance aux trois états', () => {
  // La borne ne sert à rien si elle s'arrête en route. Ces vérifications
  // portent sur la SOURCE : le faux Prisma des specs de service ignore le
  // `where`, et un test par la donnée y prouverait n'importe quoi.
  const lire = (chemin: string) => readFileSync(join(__dirname, '..', '..', '..', chemin), 'utf8');
  const balance = lire('src/modules/comptabilite/ecriture.service.ts');
  const communs = lire('src/modules/etats-financiers/etats-financiers.communs.ts');
  const etats = lire('src/modules/etats-financiers-syscohada/etats-financiers-syscohada.service.ts');
  const controleur = lire('src/modules/etats-financiers-syscohada/etats-financiers-syscohada.controller.ts');

  it('la balance accepte une date d’arrêté et en fait un filtre sur la DATE COMPTABLE', () => {
    expect(balance).toContain('arreteAu?: Date');
    expect(balance).toContain('...(arreteAu ? { date: { lte: arreteAu } } : {})');
  });

  it('le chargement commun la transmet à la balance', () => {
    expect(communs).toContain('arreteAu?: Date');
    expect(communs).toContain('balance(tenantId, exerciceId, false, arreteAu)');
  });

  it('les TROIS états la prennent · bilan, compte de résultat, tableau des flux', () => {
    expect(etats).toContain('async bilan(tenantId: string, exerciceId: string, arreteAu?: string)');
    expect(etats).toMatch(/async compteDeResultat\(\s*tenantId: string,\s*exerciceId: string,\s*arreteAu\?: string,/);
    expect(etats).toMatch(/async tableauFluxTresorerie\(\s*tenantId: string,\s*exerciceId: string,\s*arreteAu\?: string,/);
  });

  it('SEULE la colonne N est bornée · le § 2.1.2 veut la CLÔTURE en comparatif', () => {
    // Borner aussi la colonne N-1 serait un contresens : le premier tiret
    // réclame « le bilan à la date de CLÔTURE de l'exercice précédent », pas à
    // la même date intermédiaire ; et le quatrième veut le tableau des flux de
    // l'exercice précédent ENTIER. Ni l'un ni l'autre ne se verrait : les
    // colonnes seraient simplement plus basses, l'état bouclerait sur lui-même
    // et le comparatif comparerait deux demi-périodes sous un titre qui dit
    // « exercice précédent ».
    //
    // L'assertion est ancrée sur le CORPS de chaque fonction · une recherche
    // sur le fichier entier passerait au vert grâce à la ligne d'une autre,
    // ce qui a laissé survivre une mutation à la première écriture de ce test.
    const corps = (nom: string) => {
      const debut = etats.indexOf(`async ${nom}(`);
      expect(debut).toBeGreaterThan(0);
      const fin = etats.indexOf('\n  }', debut);
      return etats.slice(debut, fin);
    };
    for (const nom of ['bilan', 'compteDeResultat', 'tableauFluxTresorerie']) {
      const bloc = corps(nom);
      expect([nom, bloc.includes('this.chargerLignes(tenantId, exerciceId, borneN)')]).toEqual([nom, true]);
      // La colonne comparative de RÉFÉRENCE n'est jamais bornée par borneN.
      expect([nom, bloc.includes('exerciceN1Id, borneN')]).toEqual([nom, false]);
      expect([nom, bloc.includes('this.chargerLignes(tenantId, exerciceN1Id),')]).toEqual([nom, true]);
    }
  });

  it('les trois routes exposent la date, et une seule des trois ouvre la colonne comparative', () => {
    expect((controleur.match(/@Query\('arreteAu'\) arreteAu\?: string/g) ?? [])).toHaveLength(3);
    expect(etats).toContain('borneMemePeriodeN1');
  });
});
