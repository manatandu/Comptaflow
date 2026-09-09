import { readFileSync } from 'fs';
import { join } from 'path';
import { construireLigneTva, montantTva, sensDeLaLigne, type CompteSaisie } from './tva-saisie';
import type { TauxTva } from './types';

/**
 * LE CODE TAXE PAR DÉFAUT DANS LA GRILLE DE SAISIE.
 *
 * Le champ existait sur la fiche compte depuis longtemps · seule la modale
 * « Achat / Vente avec TVA » le lisait. Le comptable qui saisit sa facture
 * ligne à ligne, c'est-à-dire la voie NORMALE de l'écran central, devait
 * connaître de tête le compte 4454 et calculer ses 16 %.
 *
 * Ce qui est éprouvé ici est moins l'arithmétique que les trois décisions que
 * la règle porte, et qu'un second calcul écrit dans la grille aurait perdues :
 * le compte de taxe ROUTÉ selon la nature de la contrepartie, le sens pris sur
 * la LIGNE et non sur la classe du compte, et la ligne au taux zéro qui
 * qualifie une exportation pour le prorata de l'article 43.
 *
 * Aucun import de « vitest » (globales) : les deux lanceurs exécutent ce
 * fichier.
 */

const COMPTES: CompteSaisie[] = [
  { id: 'c-604', numero: '60410000', intitule: 'Achats stockés de matières' },
  { id: 'c-61', numero: '61100000', intitule: 'Transports sur achats' },
  { id: 'c-62', numero: '62100000', intitule: 'Services extérieurs' },
  { id: 'c-706', numero: '70600000', intitule: 'Services vendus' },
  { id: 'c-701', numero: '70100000', intitule: 'Ventes de marchandises' },
  { id: 'c-4452', numero: '44520000', intitule: 'TVA récupérable sur achats' },
  { id: 'c-4453', numero: '44530000', intitule: 'TVA récupérable sur transport' },
  { id: 'c-4454', numero: '44540000', intitule: 'TVA récupérable sur services extérieurs' },
  { id: 'c-4431', numero: '44310000', intitule: 'TVA facturée sur ventes' },
  { id: 'c-4432', numero: '44320000', intitule: 'TVA facturée sur prestations de services' },
];
const PLAN = new Set(COMPTES.map((c) => c.numero));
/** Le compte par son numéro · un indice de tableau se décale au premier ajout. */
const compte = (numero: string): CompteSaisie => COMPTES.find((c) => c.numero === numero)!;

const taux = (over: Partial<TauxTva> = {}): TauxTva => ({
  id: 't-16',
  code: 'TVA16',
  intitule: 'Taux normal',
  taux: '16.00',
  compteCollecteId: 'c-4431',
  compteDeductibleId: 'c-4452',
  estActif: true,
  ...over,
});

const construire = (over: Partial<Parameters<typeof construireLigneTva>[0]> = {}) =>
  construireLigneTva({
    referentiel: 'SYSCOHADA',
    sens: 'depense',
    contrepartie: compte('60410000'),
    ht: 1_000_000,
    taux: taux(),
    comptes: COMPTES,
    numerosDuPlan: PLAN,
    ...over,
  });

describe('Le sens de la taxe se lit sur la LIGNE, pas sur la classe du compte', () => {
  it('un débit est une dépense, un crédit une recette', () => {
    expect(sensDeLaLigne({ debit: 1000, credit: 0 })).toBe('depense');
    expect(sensDeLaLigne({ debit: 0, credit: 1000 })).toBe('recette');
  });

  it('ne se prononce pas sur une ligne à zéro ni sur une ligne des deux côtés', () => {
    // Une ligne sans montant n'a pas de base taxable ; une ligne servie des
    // deux côtés n'existe pas en saisie et ne doit pas se voir attribuer un
    // sens au hasard.
    expect(sensDeLaLigne({ debit: 0, credit: 0 })).toBeNull();
    expect(sensDeLaLigne({ debit: 500, credit: 500 })).toBeNull();
  });

  it('L’AVOIR FOURNISSEUR reverse la taxe RÉCUPÉRABLE, il ne la collecte pas', () => {
    // Le cas que la grille rend possible et que la modale ne connaît pas : un
    // compte de CHARGE CRÉDITÉ. Le sens dit qu'on reprend (crédit), la nature
    // du compte dit dans quelle famille (445, récupérable). Déduire la famille
    // du SENS poserait la contre-taxe en 443 « TVA facturée sur ventes » : le
    // montant serait juste, le compte faux, et la déclaration ventilerait un
    // reversement de déduction en collecte.
    const r = construire({ sens: sensDeLaLigne({ debit: 0, credit: 1_000_000 })!, contrepartie: compte('60410000') });
    expect(r.ligne?.numero).toBe('44520000');
    expect(r.ligne?.credit).toBe(160_000);
    expect(r.ligne?.debit).toBe(0);
  });

  it('l’AVOIR CLIENT reprend la taxe FACTURÉE, au débit du 443', () => {
    // Le symétrique · un compte de produit débité.
    const r = construire({ sens: sensDeLaLigne({ debit: 1_000_000, credit: 0 })!, contrepartie: compte('70100000') });
    expect(r.ligne?.numero).toBe('44310000');
    expect(r.ligne?.debit).toBe(160_000);
  });

  it('ne propose RIEN sur un compte de bilan · la TVA se rattache à l’opération', () => {
    // Un compte de tiers ou de trésorerie ne porte pas de base taxable. Le
    // paramétrage ne devrait pas y poser de code taxe, et la règle ne devine
    // pas une famille faute d'en avoir une.
    const r = construire({ contrepartie: { id: 'c-401', numero: '40100000', intitule: 'Fournisseurs' } });
    expect(r.ligne).toBeNull();
    expect(r.raison).toBe('SANS_COMPTE');
  });
});

describe('Le compte de taxe suit la nature de l’opération', () => {
  it('route un TRANSPORT vers le 4453, un SERVICE EXTÉRIEUR vers le 4454', () => {
    // Le compte semé sur le taux est le 4452 « sur achats » · c'est lui que la
    // modale imputait autrefois quelle qu'ait été la contrepartie.
    expect(construire({ contrepartie: compte('61100000') }).ligne?.numero).toBe('44530000');
    expect(construire({ contrepartie: compte('62100000') }).ligne?.numero).toBe('44540000');
  });

  it('route une PRESTATION vendue vers le 4432, pas vers le 4431 des ventes', () => {
    const r = construire({ sens: 'recette', contrepartie: compte('70600000') });
    expect(r.ligne?.numero).toBe('44320000');
  });

  it('retombe sur le compte du taux quand il n’y a rien à router (SYCEBNL)', () => {
    // Le plan SYCEBNL ne subdivise ni 443 ni 445 : le compte semé sur le taux
    // est le bon, et router serait inventer une subdivision qui n'existe pas.
    const r = construire({ referentiel: 'SYCEBNL', contrepartie: compte('61100000') });
    expect(r.ligne?.numero).toBe('44520000');
  });

  it('N’INVENTE AUCUN COMPTE quand le taux n’en porte pas · il le dit', () => {
    const r = construire({
      referentiel: 'SYCEBNL',
      taux: taux({ compteDeductibleId: null }),
    });
    expect(r.ligne).toBeNull();
    expect(r.raison).toBe('SANS_COMPTE');
    expect(r.motif).toContain('TVA16');
  });
});

describe('Le taux zéro qualifie l’opération, la taxe nulle ne qualifie rien', () => {
  it('POSE la ligne à zéro quand le TAUX est nul · sans elle le prorata ment', () => {
    // Art. 43 de l'O.-L. n° 10/001 : les exportations entrent au numérateur du
    // prorata. Côté serveur, `calculerProrata` reconnaît l'exportation par la
    // LIGNE DE TVA qui porte ce taux ; sans elle il ne voit qu'un crédit de
    // produit nu et ne peut pas la distinguer d'une recette exonérée.
    const r = construire({
      sens: 'recette',
      contrepartie: compte('70100000'),
      taux: taux({ id: 't-0', code: 'TVA0', taux: '0.00' }),
    });
    expect(r.ligne).not.toBeNull();
    expect(r.ligne?.debit).toBe(0);
    expect(r.ligne?.credit).toBe(0);
    expect(r.ligne?.tauxTvaId).toBe('t-0');
    expect(r.ligne?.libelle).toContain('art. 43');
  });

  it('ne pose RIEN quand la base est nulle à taux non nul · rien à qualifier', () => {
    const r = construire({ ht: 0 });
    expect(r.ligne).toBeNull();
    expect(r.raison).toBe('TAXE_NULLE');
  });
});

describe('Le taux est porté par la ligne de TVA, jamais par la ligne HT', () => {
  it('la ligne rendue porte le tauxTvaId, et elle siège sur le compte de taxe', () => {
    // C'est le sens que le schéma donne au champ (« la ligne de TVA
    // elle-même, pas la ligne HT ») et celui que la déclaration lit : elle ne
    // retient que les lignes qui portent un tauxTvaId ET siègent sur un 443 ou
    // un 445. Marquer la ligne de charge serait un « un champ, deux sens » de
    // plus.
    const r = construire();
    expect(r.ligne?.tauxTvaId).toBe('t-16');
    expect(r.ligne?.numero.startsWith('445')).toBe(true);
    expect(r.ligne?.debit).toBe(160_000);
  });

  it('arrondit à deux décimales, comme le reste de la saisie', () => {
    expect(montantTva(1_234_567.89, taux())).toBe(197_530.86);
  });
});

describe('La grille propose, elle n’impute pas', () => {
  const lire = (chemin: string) => readFileSync(join(__dirname, chemin), 'utf8');
  const saisie = lire('../pages/SaisiePage.tsx');

  it('la proposition attend un geste · aucune ligne ne s’ajoute à l’ajout de la ligne HT', () => {
    // Ce qui serait le défaut : pousser la ligne de taxe dans la pièce dès que
    // le compte est saisi. Sur une facture d'association exonérée, elle
    // passerait inaperçue jusqu'à la déclaration.
    expect(saisie).toContain('setPropositionTva({');
    expect(saisie).toContain('onClick={poserLigneTva}');
    // La pose ne se fait QUE dans le gestionnaire du bouton.
    expect(saisie.match(/setLignes\(\(prev\) => \[\s*\.\.\.prev,\s*\{\s*compteId: l\.compteId/g)?.length).toBe(1);
  });

  it('la proposition est retrouvée par son indice ET son compte', () => {
    // Une suppression ou un déplacement doit l'invalider, pas la reporter sur
    // la ligne voisine · poser une taxe sur une opération qui ne la porte pas
    // est exactement l'erreur qu'un automatisme commet à notre place.
    expect(saisie).toContain('ligneHt.compteId !== propositionTva.compteId');
  });

  it('le taux proposé reste modifiable, et la proposition s’abandonne', () => {
    expect(saisie).toContain('Sans TVA');
    expect(saisie).toContain('setPropositionTva((p) => (p ? { ...p, tauxTvaId: e.target.value } : p))');
  });
});
