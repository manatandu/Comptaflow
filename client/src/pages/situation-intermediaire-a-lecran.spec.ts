import { readFileSync } from 'fs';
import { join } from 'path';
import { DECLARATION_METHODES_IDENTIQUES, RESERVE_JEU_INCOMPLET } from '../lib/situation-intermediaire';

/**
 * LA SITUATION INTERMÉDIAIRE DOIT ÊTRE DEMANDABLE, ET SE DIRE.
 *
 * Le serveur sait borner les trois états à une date (ch. 39) · tant que
 * l'écran ne le propose pas, la correction vit dans la charge utile de l'API
 * et n'atteint personne. Et si elle l'atteint sans ses deux mentions, elle
 * remplace un manque par un document faux : le § 2.1.1 exige la déclaration
 * sur les méthodes, et une situation partielle ne doit jamais se présenter
 * comme le jeu complet du chapitre.
 *
 * Aucun import de « vitest » (globales) : les deux lanceurs exécutent ce
 * fichier.
 */

const page = readFileSync(join(__dirname, 'EtatsFinanciersSyscohadaPage.tsx'), 'utf8');
const serveur = readFileSync(
  join(__dirname, '..', '..', '..', 'src', 'modules', 'etats-financiers', 'situation-intermediaire.ts'),
  'utf8',
);

describe('la situation intermédiaire, à l’écran', () => {
  it('a son champ de date, et il est vide par défaut', () => {
    // L'exercice entier reste le cas ordinaire : le champ ne se remplit que
    // pour une situation, et il se vide d'un clic.
    expect(page).toContain("const [arreteAu, setArreteAu] = useState('')");
    expect(page).toContain('ARRÊTÉ AU');
    expect(page).toContain('Exercice entier');
  });

  it('borne les TROIS états, jamais un seul', () => {
    // Un bilan arrêté au 30 juin à côté d'un compte de résultat sur l'année
    // entière serait la pire des sorties : chaque état bouclerait, et leur
    // rapprochement serait faux sans que rien ne le dise.
    const appels = page.match(/etats-financiers-syscohada\/[a-z-]+\?exerciceId=\$\{exerciceCourant\.id\}\$\{borne\}/g);
    expect(appels).toHaveLength(3);
  });

  it('RECHARGE quand la date change · sinon l’écran mentirait sur son propre titre', () => {
    expect(page).toContain('}, [exerciceCourant?.id, arreteAu]);');
  });

  it('borne la saisie aux dates de l’exercice', () => {
    // Le serveur refuse déjà une date hors exercice, avec son motif. Le champ
    // évite d'y arriver · les deux, jamais l'un à la place de l'autre.
    expect(page).toContain('min={exerciceCourant?.dateDebut?.slice(0, 10)}');
    expect(page).toContain('max={exerciceCourant?.dateFin?.slice(0, 10)}');
  });

  it('porte les DEUX mentions du chapitre, et les IMPRIME', () => {
    expect(page).toContain('DECLARATION_METHODES_IDENTIQUES');
    expect(page).toContain('RESERVE_JEU_INCOMPLET');
    // Elles ne sont pas `ecran-seul` · un état déposé sans sa déclaration de
    // méthodes est un état incomplet au sens du § 2.1.1.
    const bloc = page.slice(page.indexOf('{arreteAu && ('), page.indexOf('ecran-seul flex flex-wrap'));
    expect(bloc).not.toContain('ecran-seul');
  });

  it('titre l’état pour ce qu’il est', () => {
    expect(page).toContain('situation intermédiaire arrêtée au');
  });

  it('les deux rédactions, serveur et client, N’ONT PAS divergé', () => {
    // Deux textes pour une même déclaration réglementaire, c'est l'un des
    // deux qui devient faux le jour où l'autre est corrigé.
    //
    // Les deux constantes sont écrites en concaténation de littéraux : on
    // recolle la source avant de comparer, plutôt que de découper la phrase
    // en fragments, ce qui rendait le test dépendant de la ponctuation.
    const recolle = (texte: string) =>
      texte
        .replace(/['"]\s*\+\s*['"]/g, '')
        .replace(/\s+/g, ' ');
    const source = recolle(serveur);
    for (const phrase of [DECLARATION_METHODES_IDENTIQUES, RESERVE_JEU_INCOMPLET]) {
      const attendue = recolle(phrase);
      expect([attendue.slice(0, 60), source.includes(attendue)]).toEqual([attendue.slice(0, 60), true]);
    }
  });
});
