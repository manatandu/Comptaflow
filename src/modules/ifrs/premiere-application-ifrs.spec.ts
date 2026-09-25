import { construireEtatsIfrs } from './etats-ifrs';
import { construirePremiereApplication, effetsRetraitement, lignesOuverture, motifRefusAjustementTransition, RetraitementIfrs1 } from './premiere-application-ifrs';

/**
 * Le moteur de première application · chiffres faits à la main. Capital 800,
 * immobilisations 800 à l'ouverture ; clôture du comparatif avec un résultat
 * de 100 porté en trésorerie.
 */
const REGLES = [
  { prefixe: '24', rubrique: 'SF_IMMOBILISATIONS_CORPORELLES' },
  { prefixe: '10', rubrique: 'SF_CAPITAL' },
  { prefixe: '52', rubrique: 'SF_TRESORERIE' },
  { prefixe: '70', rubrique: 'PL_PRODUITS' },
];
const r = (id: string, lignes: RetraitementIfrs1['lignes'], correctionErreur = false, fondement = 'IFRS 1 § D5'): RetraitementIfrs1 => ({
  id,
  libelle: id,
  fondement,
  correctionErreur,
  lignes,
});
const etat = (lignes: [string, number][], retraitements: RetraitementIfrs1[] = []) =>
  construireEtatsIfrs({ dateDebut: new Date('2025-01-01') }, lignes.map(([numero, solde]) => ({ numero, intitule: numero, solde })), REGLES, retraitements, 'AUCUNE');

describe('première application · les briques', () => {
  it('l’ouverture est le report des classes 1 à 5, jamais la contrepassation de clôture des classes 6 à 8', () => {
    const l = lignesOuverture([
      { numero: '24100000', intitule: 'a', reportDebit: 800, reportCredit: 0 },
      { numero: '10100000', intitule: 'b', reportDebit: 0, reportCredit: 800 },
      { numero: '60100000', intitule: 'c', reportDebit: 300, reportCredit: 0 },
      { numero: '52100000', intitule: 'd', reportDebit: 40, reportCredit: 40 },
    ]);
    expect(l).toEqual([
      { numero: '24100000', intitule: 'a', solde: 800 },
      { numero: '10100000', intitule: 'b', solde: -800 },
    ]);
  });

  it('les effets d’un retraitement · capitaux propres par ses actifs et passifs, résultat et OCI par l’opposé de leurs lignes', () => {
    expect(effetsRetraitement({ lignes: [{ rubrique: 'SF_IMMOBILISATIONS_CORPORELLES', montant: 100 }, { rubrique: 'SF_RESERVES', montant: -100 }] })).toEqual({
      capitauxPropres: 100,
      resultat: 0,
      oci: 0,
    });
    expect(
      effetsRetraitement({ lignes: [{ rubrique: 'PL_AUTRES_CHARGES_OPERATIONNELLES', montant: 20 }, { rubrique: 'SF_FOURNISSEURS', montant: -20 }] }),
    ).toEqual({ capitauxPropres: -20, resultat: -20, oci: 0 });
    expect(effetsRetraitement({ lignes: [{ rubrique: 'SF_IMMOBILISATIONS_CORPORELLES', montant: 30 }, { rubrique: 'OCI_NR_AUTRES', montant: -30 }] })).toEqual({
      capitauxPropres: 30,
      resultat: 0,
      oci: 30,
    });
  });

  it('§ 11 · un ajustement de transition ne touche ni le résultat ni les autres éléments du résultat global', () => {
    expect(motifRefusAjustementTransition(r('ok', [{ rubrique: 'SF_IMMOBILISATIONS_CORPORELLES', montant: 1 }, { rubrique: 'SF_RESERVES', montant: -1 }]))).toBeNull();
    expect(motifRefusAjustementTransition(r('pl', [{ rubrique: 'SF_IMMOBILISATIONS_CORPORELLES', montant: 1 }, { rubrique: 'PL_PRODUITS', montant: -1 }]))).toMatch(
      /IFRS 1 § 11/,
    );
    expect(motifRefusAjustementTransition(r('oci', [{ rubrique: 'SF_IMMOBILISATIONS_CORPORELLES', montant: 1 }, { rubrique: 'OCI_NR_AUTRES', montant: -1 }]))).toMatch(
      /IFRS 1 § 11/,
    );
  });
});

describe('première application · les rapprochements du § 24', () => {
  const ouvertureLegale: [string, number][] = [['24100000', 800], ['10100000', -800]];
  const clotureLegale: [string, number][] = [['24100000', 800], ['10100000', -800], ['52100000', 100], ['70100000', -100]];

  it('un ajustement que rien ne porte dans l’état d’ouverture laisse un écart nommé, et le jeu n’est pas publiable', () => {
    // L'état d'ouverture est calculé SANS l'ajustement, que le rapprochement cite pourtant · 850 attendus, 800 obtenus.
    const aj = r('ecart', [{ rubrique: 'SF_IMMOBILISATIONS_CORPORELLES', montant: 50 }, { rubrique: 'SF_RESERVES', montant: -50 }]);
    const pa = construirePremiereApplication({
      dateTransition: new Date('2025-01-01'),
      ouverture: etat(ouvertureLegale),
      ajustementsTransition: [aj],
      capitauxPropresSyscohadaTransition: 800,
      comparatif: etat(clotureLegale),
      retraitementsComparatif: [],
      capitauxPropresSyscohadaComparatif: 900,
    });
    expect(pa.rapprochements[0].ecart).toBe(-50);
    expect(pa.rapprochements[0].lignes.map((l) => l.cle)).toEqual(['DEPART', 'R_ecart', 'ECART', 'ARRIVEE']);
    expect(pa.motifsNonPubliable.join(' ')).toMatch(/capitaux propres à la date de transition \(IFRS 1 § 24 a i\) · écart non expliqué de -50/);
    expect(pa.rapprochements[1].ecart).toBe(0);
  });

  it('sans reclassement, aucune ligne de reclassement ; une erreur passe après une méthode déclarée après elle (§ 26)', () => {
    const erreur = r('erreur', [{ rubrique: 'PL_AUTRES_CHARGES_OPERATIONNELLES', montant: 10 }, { rubrique: 'SF_FOURNISSEURS', montant: -10 }], true, 'IAS 8 § 42');
    const methode = r('methode', [{ rubrique: 'SF_IMMOBILISATIONS_CORPORELLES', montant: 40 }, { rubrique: 'SF_RESERVES', montant: -40 }]);
    const pa = construirePremiereApplication({
      dateTransition: new Date('2025-01-01'),
      ouverture: etat(ouvertureLegale),
      ajustementsTransition: [],
      capitauxPropresSyscohadaTransition: 800,
      comparatif: etat(clotureLegale, [erreur, methode]),
      retraitementsComparatif: [erreur, methode],
      capitauxPropresSyscohadaComparatif: 900,
    });
    expect(pa.rapprochements[1].lignes.map((l) => [l.cle, l.montant])).toEqual([
      ['DEPART', 900],
      ['R_methode', 40],
      ['R_erreur', -10],
      ['ARRIVEE', 930],
    ]);
    expect(pa.rapprochements[2].lignes.map((l) => [l.cle, l.montant])).toEqual([
      ['DEPART', 100],
      ['R_erreur', -10],
      ['ARRIVEE', 90],
    ]);
    expect(pa.motifsNonPubliable.filter((m) => /écart non expliqué/.test(m))).toEqual([]);
  });

  it('§ 24 b · le résultat global compte les autres éléments du résultat global d’un retraitement, pas seulement son résultat', () => {
    // Réévaluation (IAS 16 § 39) · +30 aux immobilisations, +30 en autres éléments non recyclables.
    const reeval = r('reeval', [{ rubrique: 'SF_IMMOBILISATIONS_CORPORELLES', montant: 30 }, { rubrique: 'OCI_NR_AUTRES', montant: -30 }], false, 'IAS 16 § 39');
    const pa = construirePremiereApplication({
      dateTransition: new Date('2025-01-01'),
      ouverture: etat(ouvertureLegale),
      ajustementsTransition: [],
      capitauxPropresSyscohadaTransition: 800,
      comparatif: etat(clotureLegale, [reeval]),
      retraitementsComparatif: [reeval],
      capitauxPropresSyscohadaComparatif: 900,
    });
    expect(pa.rapprochements[2].lignes.map((l) => [l.cle, l.montant])).toEqual([
      ['DEPART', 100],
      ['R_reeval', 30],
      ['ARRIVEE', 130],
    ]);
    expect(pa.rapprochements[1].arrivee).toBe(930);
    expect(pa.rapprochements.every((x) => x.ecart === 0)).toBe(true);
  });

  it('les mentions · § 21 et § 23 toujours, § 24 c seulement devant une perte de valeur IAS 36 à l’ouverture', () => {
    const base = {
      dateTransition: new Date('2025-01-01'),
      ouverture: etat(ouvertureLegale),
      capitauxPropresSyscohadaTransition: 800,
      comparatif: etat(clotureLegale),
      retraitementsComparatif: [],
      capitauxPropresSyscohadaComparatif: 900,
    };
    const sans = construirePremiereApplication({ ...base, ajustementsTransition: [] });
    expect(sans.mentions.join(' ')).toMatch(/IFRS 1 § 21/);
    expect(sans.mentions.join(' ')).toMatch(/IFRS 1 § 23/);
    expect(sans.mentions.join(' ')).not.toMatch(/§ 24 c/);
    const perte = r('perte', [{ rubrique: 'SF_RESERVES', montant: 30 }, { rubrique: 'SF_IMMOBILISATIONS_CORPORELLES', montant: -30 }], false, 'IAS 36 § 59');
    const avec = construirePremiereApplication({ ...base, ouverture: etat(ouvertureLegale, [perte]), ajustementsTransition: [perte] });
    expect(avec.mentions.join(' ')).toMatch(/IFRS 1 § 24 c/);
    expect(avec.mentions.join(' ')).toMatch(/IFRS 1 § 25 · les ajustements significatifs du tableau des flux/);
  });

  it('un ajustement de transition vers le résultat est refusé par le moteur aussi', () => {
    const pl = r('pl', [{ rubrique: 'SF_IMMOBILISATIONS_CORPORELLES', montant: 1 }, { rubrique: 'PL_PRODUITS', montant: -1 }]);
    expect(() =>
      construirePremiereApplication({
        dateTransition: new Date('2025-01-01'),
        ouverture: etat(ouvertureLegale),
        ajustementsTransition: [pl],
        capitauxPropresSyscohadaTransition: 800,
        comparatif: etat(clotureLegale),
        retraitementsComparatif: [],
        capitauxPropresSyscohadaComparatif: 900,
      }),
    ).toThrow(/IFRS 1 § 11/);
  });
});
