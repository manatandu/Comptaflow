import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Referentiel } from '@prisma/client';
import { COMPTES_CESSION_COURANTE, COMPTES_SORTIE, natureImmobilisation } from './immobilisation.service';
import { dateReprise } from '../regularisation/regularisation.service';
import { TypeRegularisation } from '@prisma/client';

/**
 * CESSION COURANTE · LE NIVEAU H.A.O. N'EST PAS TOUJOURS LE BON.
 *
 * L'AUDCIF exclut expressément du niveau H.A.O. les cessions « considérées
 * comme courantes (fréquentes et récurrentes) » et les impute en exploitation,
 * aux comptes 654 et 754 · « exemples : transporteurs, loueurs de matériels »
 * (Titre VII, COMPTE 81, Exclusions ; COMPTE 82, Commentaires). Le service
 * n'offrait aucun choix : un transporteur qui renouvelle sa flotte voyait
 * chaque cession en hors activités ordinaires, ce qui déplace hors du résultat
 * d'exploitation un flux qui EST son exploitation.
 *
 * Deux refus valent autant que l'option elle-même, et pour des raisons
 * différentes · voir plus bas.
 */

const lire = (p: string) => readFileSync(join(__dirname, p), 'utf8');

describe('sortie d’immobilisation · cession courante', () => {
  it('vise les comptes que le plan SYSCOHADA porte réellement', () => {
    // 6541/6542 et 7541/7542 · les seules subdivisions de 654 et 754.
    expect(COMPTES_CESSION_COURANTE.INCORPORELLE).toEqual({
      valeurComptable: '65410000',
      produitCession: '75410000',
    });
    expect(COMPTES_CESSION_COURANTE.CORPORELLE).toEqual({
      valeurComptable: '65420000',
      produitCession: '75420000',
    });
  });

  it('n’ouvre AUCUN compte de cession courante à une immobilisation financière', () => {
    // 654 et 754 n'ont pas de subdivision financière : une immobilisation
    // financière reste en 816/826, quelle que soit la fréquence des cessions.
    expect(COMPTES_CESSION_COURANTE.FINANCIERE).toBeUndefined();
    expect(COMPTES_SORTIE.FINANCIERE).toEqual({ valeurComptable: '81600000', produitCession: '82600000' });
  });

  it('ne crée pas de compte 654 ou 754 non subdivisé, que le plan ne porte pas', () => {
    // CLAUDE.md § 7 : un compte à 3 chiffres AVEC subdivisions est semé non
    // complété, en TOTAL. 65400000 et 75400000 n'existent donc pas, et ne
    // doivent pas être inventés.
    const service = lire('./immobilisation.service.ts');
    expect(service).not.toContain('65400000');
    expect(service).not.toContain('75400000');
  });

  it('les quatre comptes d’imputation sont bien semés au plan SYSCOHADA, et absents du SYCEBNL', () => {
    const syscohada = lire('../comptes/compte-seed-syscohada.ts');
    for (const numero of ['65410000', '65420000', '75410000', '75420000']) {
      expect(`${numero}: ${syscohada.includes(`'${numero}'`)}`).toBe(`${numero}: true`);
    }
    // Au plan SYCEBNL, 654 est « Dons en nature courants reçus à distribuer » ·
    // y porter une valeur comptable de cession écrirait une cession dans le
    // compte des dons reçus. C'est la raison du refus côté serveur.
    const sycebnl = lire('../comptes/compte-seed.ts');
    expect(sycebnl).toContain('Dons en nature courants');
  });

  it('refuse la cession courante hors SYSCOHADA et hors nature amortissable, côté serveur', () => {
    // Le refus est dans le service, pas seulement dans l'écran · un appel
    // direct poserait l'indicateur quand même (CLAUDE.md § 6).
    const service = lire('./immobilisation.service.ts');
    expect(service).toContain('if (referentiel !== Referentiel.SYSCOHADA)');
    expect(service).toContain('const courants = COMPTES_CESSION_COURANTE[nature]');
    expect(service).toContain('if (!courants)');
  });

  it('range chaque nature sur sa racine de compte', () => {
    expect(natureImmobilisation('21100000', Referentiel.SYSCOHADA)).toBe('INCORPORELLE');
    expect(natureImmobilisation('24410000', Referentiel.SYSCOHADA)).toBe('CORPORELLE');
    expect(natureImmobilisation('26100000', Referentiel.SYSCOHADA)).toBe('FINANCIERE');
  });
});

/**
 * DATE DE REPRISE D'UNE RÉGULARISATION · les deux référentiels ne disent pas
 * la même chose, et le service imposait celle du SYCEBNL aux deux.
 */
describe('régularisation · la date de reprise suit le référentiel', () => {
  const cible = { dateDebut: new Date('2027-01-01'), dateFin: new Date('2027-12-31') };

  it('reprend à la CLÔTURE en SYCEBNL, comme la Partie 3 ch. 6 l’impose', () => {
    for (const type of [
      TypeRegularisation.CHARGE_CONSTATEE_AVANCE,
      TypeRegularisation.PRODUIT_CONSTATE_AVANCE,
      TypeRegularisation.SUBVENTION_PLURIANNUELLE,
    ]) {
      expect(dateReprise(Referentiel.SYCEBNL, type, cible)).toEqual(cible.dateFin);
    }
  });

  it('reprend à l’OUVERTURE en SYSCOHADA, comme le référentiel le recommande vivement', () => {
    // § 5.5 pour les charges, § 6.5 pour les produits : les deux dates sont
    // permises, la contre-passation à l'ouverture est « vivement recommandée ».
    // Reprise seulement à la clôture, la part différée reste au bilan douze
    // mois de plus et fausse les situations intermédiaires.
    expect(dateReprise(Referentiel.SYSCOHADA, TypeRegularisation.CHARGE_CONSTATEE_AVANCE, cible)).toEqual(
      cible.dateDebut,
    );
    expect(dateReprise(Referentiel.SYSCOHADA, TypeRegularisation.PRODUIT_CONSTATE_AVANCE, cible)).toEqual(
      cible.dateDebut,
    );
  });

  it('laisse la subvention pluriannuelle à la clôture des deux côtés', () => {
    // Sa mécanique vient du texte SYCEBNL qui la traite nommément, et le § 5.5
    // du SYSCOHADA tolère expressément « à la fin de n+1 ».
    expect(dateReprise(Referentiel.SYSCOHADA, TypeRegularisation.SUBVENTION_PLURIANNUELLE, cible)).toEqual(
      cible.dateFin,
    );
  });
});
