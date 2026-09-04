import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * UN HORS-SCOPE INCOMPLET SE LIT COMME UNE COUVERTURE COMPLÈTE.
 *
 * Le module TVA déclarait ce qu'il ne fait pas · c'est une bonne pratique du
 * dépôt, et elle ne vaut que si la liste est exacte. Elle ne nommait que les
 * art. 46 et 49, ce qui laissait entendre que les RÉGULARISATIONS DES ART. 50
 * ET 51 étaient traitées. Elles ne le sont pas, et par personne :
 * `grep -rni "tva" src/modules/immobilisations/` ne rend aucune occurrence,
 * et la sortie d'un bien pose une écriture de cession complète, équilibrée,
 * sans une ligne de taxe ni le moindre signal.
 *
 * Ce que dit l'art. 50 (l. 1202-1212) : « L'assujetti est redevable d'une
 * fraction de la taxe antérieurement déduite, en cas de sortie des actifs de
 * l'entreprise d'un bien ayant fait l'objet d'une déduction au titre
 * d'immobilisation […] avant la fin de la quatrième année suivant celle de
 * l'acquisition, pour les biens meubles, ou avant la fin de la dix-neuvième
 * année […] pour les immeubles. La fraction visée à l'alinéa ci-dessus est
 * égale au montant de la déduction, diminué, selon le cas, d'un cinquième ou
 * d'un vingtième par année ou fraction d'année depuis l'acquisition des
 * biens. » L'art. 51 y ajoute la vente à perte, la disparition et le
 * changement d'affectation.
 *
 * L'ART. 52 A CHANGÉ DE CÔTÉ, et c'est la raison d'être de la révision de ce
 * spec. La récupération sur ventes ANNULÉES ou RÉSILIÉES est désormais
 * traitée : l'annulation laisse une écriture, le débit du 443 par la note de
 * crédit, que la déclaration lit et reporte sur les déductions du mois suivant
 * (décret n° 011/42, art. 126). Reste hors scope la récupération sur ventes
 * IMPAYÉES, qui ne laisse AUCUNE écriture · la créance demeure au 411, et le
 * décret art. 127 la subordonne à trois éléments qui ne sont dans aucun
 * modèle : une créance « réellement et définitivement irrécouvrable », un
 * duplicata surchargé de la mention réglementaire envoyé au client, et la
 * preuve de l'irrécouvrabilité, qui « incombe à l'assujetti ».
 *
 * LE CALCUL N'EST PAS POSÉ ICI, ET C'EST VOULU. Il appartient au module
 * `immobilisations`, qui seul connaît la date d'acquisition, la nature meuble
 * ou immeuble du bien et la TVA déduite à l'entrée · aucun de ces trois
 * éléments n'est dans le modèle aujourd'hui (`Immobilisation` ne porte pas la
 * TVA d'acquisition). Ce que ce module peut faire, et fait, c'est NE PAS
 * laisser croire qu'il s'en charge.
 */

const service = readFileSync(join(__dirname, 'taux-tva.service.ts'), 'utf8');

describe('le module TVA nomme exactement ce qu’il ne traite pas', () => {
  it('déclare hors scope les régularisations des articles 50 et 51', () => {
    expect(service).toContain('LES RÉGULARISATIONS DES ART. 50 ET 51');
    expect(service).toContain("sortie d'actif");
    expect(service).toContain('attestation à');
  });

  it('déclare hors scope la récupération sur ventes IMPAYÉES (art. 52, al. 3)', () => {
    const horsScope = service.slice(service.indexOf('RESTE HORS SCOPE'), service.indexOf('@Injectable()'));
    expect(horsScope).toContain('VENTES IMPAYÉES');
    expect(horsScope).toContain('art. 127');
    // Ce qui manque est NOMMÉ · un hors-scope qui ne dit pas pourquoi laisse
    // croire à un oubli, et le lecteur cherche la fonction qui n'existe pas.
    expect(horsScope).toContain('irrécouvrable');
  });

  it('n’annonce PLUS hors scope la récupération sur ventes ANNULÉES ou RÉSILIÉES, désormais traitée', () => {
    // Elles laissent une écriture · la déclaration la lit, la reporte sur le
    // mois suivant (décret art. 126) et la liquidation solde le 443. La
    // laisser en hors-scope ferait renoncer le cabinet à ce qu'il a.
    const horsScope = service.slice(service.indexOf('RESTE HORS SCOPE'), service.indexOf('@Injectable()'));
    expect(horsScope).toContain('Les ventes ANNULÉES et RÉSILIÉES sont traitées');
    expect(service).toContain('art. 126');
  });

  it('garde les hors-scope déjà déclarés · art. 46 et 49', () => {
    // Option pour secteurs distincts, et régularisation pluriannuelle du
    // prorata sur les immobilisations.
    expect(service).toContain('art. 49');
    expect(service).toContain('art. 46');
  });

  it('n’annonce PLUS de hors-scope pour ce qui est désormais traité', () => {
    // L'exigibilité par nature (art. 25-26), la naissance du droit à déduction
    // (art. 37) et le report du crédit (art. 63) sont couverts et testés · les
    // laisser dans la liste ferait renoncer le cabinet à ce qu'il a.
    const horsScope = service.slice(service.indexOf('RESTE HORS SCOPE'), service.indexOf('@Injectable()'));
    for (const article of ['art. 25', 'art. 37', 'art. 63', 'art. 43', 'art. 41']) {
      expect(horsScope).not.toContain(article);
    }
  });
});
