import {
  NOMBRE_NOTES_SYSCOHADA,
  NOTES_SYSCOHADA,
  notesSyscohadaDuCode,
  numeroDeTeteNoteSyscohada,
} from './correspondance-notes-syscohada';

/**
 * Le jeu complet couvre EXACTEMENT la liste officielle · une note oubliée
 * par une tranche, un code inventé (« 8A », « 3G », « 15C », « 16D ») ou
 * transcrit deux fois par deux tranches ne lèverait aucune exception : la
 * fiche R4 serait fausse, en silence.
 *
 * Liste transcrite depuis AUDCIF Titre IX ch. 6 section 2 (skill
 * `audcif-acte-uniforme`, references/titre-9-ch6-7-notes-annexes-
 * correspondance.md, lignes 41 à 100), identique à celle du skill
 * `syscohada`, liasse/references/notes-ohada.md. Elle est ÉCRITE ici et
 * non lue dans un fichier de skill : les compétences ne sont pas des
 * fichiers du dépôt (CLAUDE.md §11) et un test ne doit pas dépendre de
 * leur chemin d'installation.
 */
const LISTE_OFFICIELLE: { code: string; intitule: string }[] = [
  { code: '1', intitule: 'DETTES GARANTIES PAR DES SÛRETÉS RÉELLES' },
  { code: '2', intitule: 'INFORMATIONS OBLIGATOIRES' },
  { code: '3A', intitule: 'IMMOBILISATION BRUTE' },
  { code: '3B', intitule: 'BIENS PRIS EN LOCATION ACQUISITION' },
  { code: '3C', intitule: 'IMMOBILISATIONS : AMORTISSEMENTS' },
  { code: '3D', intitule: 'IMMOBILISATIONS : PLUS-VALUES ET MOINS VALUE DE CESSION' },
  { code: '3E', intitule: "INFORMATIONS SUR LES RÉÉVALUATIONS EFFECTUÉES PAR L'ENTITÉ" },
  { code: '3F', intitule: "TABLEAU D'ÉTALEMENT DES CHARGES IMMOBILISÉES" },
  { code: '4', intitule: 'IMMOBILISATIONS FINANCIÈRES' },
  { code: '5', intitule: 'ACTIF CIRCULANT HAO' },
  { code: '6', intitule: 'STOCKS ET ENCOURS' },
  { code: '7', intitule: 'CLIENTS PRODUITS À RECEVOIR' },
  { code: '8', intitule: 'AUTRES CRÉANCES' },
  { code: '9', intitule: 'TITRES DE PLACEMENT' },
  { code: '10', intitule: 'VALEURS À ENCAISSER' },
  { code: '11', intitule: 'DISPONIBILITÉS' },
  { code: '12', intitule: 'ÉCARTS DE CONVERSION' },
  { code: '13', intitule: 'CAPITAL : VALEUR NOMINALE DES ACTIONS OU PARTS' },
  { code: '14', intitule: 'PRIMES ET RÉSERVES' },
  { code: '15A', intitule: 'SUBVENTIONS ET PROVISIONS RÉGLEMENTÉES' },
  { code: '15B', intitule: 'AUTRES FONDS PROPRES' },
  { code: '16A', intitule: 'DETTES FINANCIÈRES ET RESSOURCES ASSIMILÉES' },
  { code: '16B', intitule: 'ENGAGEMENTS DE RETRAITE ET AVANTAGES ASSIMILÉS (MÉTHODE ACTUARIELLE)' },
  // [texte officiel] même intitulé que la 16B dans la liste du ch. 6.
  { code: '16B bis', intitule: 'ENGAGEMENTS DE RETRAITE ET AVANTAGES ASSIMILÉS (MÉTHODE ACTUARIELLE)' },
  { code: '16C', intitule: 'ACTIFS ET PASSIFS ÉVENTUELS' },
  { code: '17', intitule: "FOURNISSEURS D'EXPLOITATION" },
  { code: '18', intitule: 'DETTES FISCALES ET SOCIALES' },
  { code: '19', intitule: 'AUTRES DETTES ET PROVISIONS POUR RISQUES À COURT TERME' },
  { code: '20', intitule: "BANQUES, CRÉDIT D'ESCOMPTE ET DE TRÉSORERIE" },
  { code: '21', intitule: "CHIFFRE D'AFFAIRES ET AUTRES PRODUITS" },
  { code: '22', intitule: 'ACHATS' },
  { code: '23', intitule: 'TRANSPORTS' },
  { code: '24', intitule: 'SERVICES EXTÉRIEURS' },
  { code: '25', intitule: 'IMPÔTS ET TAXES' },
  { code: '26', intitule: 'AUTRES CHARGES' },
  { code: '27A', intitule: 'CHARGES DE PERSONNEL' },
  { code: '27B', intitule: 'EFFECTIFS, MASSE SALARIALE ET PERSONNEL EXTÉRIEUR' },
  { code: '28', intitule: 'PROVISIONS ET DÉPRÉCIATIONS INSCRITES AU BILAN' },
  { code: '29', intitule: 'CHARGES ET REVENUS FINANCIERS' },
  { code: '30', intitule: 'AUTRES CHARGES ET PRODUITS HAO' },
  { code: '31', intitule: 'RÉPARTITION DU RÉSULTAT ET AUTRES ÉLÉMENTS CARACTÉRISTIQUES DES CINQ DERNIERS EXERCICES' },
  { code: '32', intitule: "PRODUCTION DE L'EXERCICE" },
  { code: '33', intitule: 'ACHATS DESTINÉS À LA PRODUCTION' },
  { code: '34', intitule: 'FICHE DE SYNTHÈSE DES PRINCIPAUX INDICATEURS FINANCIERS' },
  { code: '35', intitule: 'LISTE DES INFORMATIONS SOCIALES, ENVIRONNEMENTALES ET SOCIÉTALES À FOURNIR' },
  { code: '36', intitule: 'TABLES DES CODES' },
];

describe('notes annexes SYSCOHADA · jeu complet (AUDCIF Titre IX ch. 6 section 2)', () => {
  it('la liste officielle compte 46 codes pour 36 numéros de tête, ni 3G, ni 15C, ni 16D, ni 8A', () => {
    expect(LISTE_OFFICIELLE).toHaveLength(46);
    const tetes = new Set(LISTE_OFFICIELLE.map((n) => numeroDeTeteNoteSyscohada(n.code)));
    expect(tetes.size).toBe(NOMBRE_NOTES_SYSCOHADA);
    expect([...tetes].sort((a, b) => a - b)).toEqual(Array.from({ length: 36 }, (_, i) => i + 1));
    for (const absent of ['3G', '15C', '16D', '8A']) expect(LISTE_OFFICIELLE.some((n) => n.code === absent)).toBe(false);
  });

  it('les trois tranches couvrent exactement la liste officielle, chaque code une fois au moins et aucun code de trop', () => {
    const codes = [...new Set(NOTES_SYSCOHADA.map((n) => n.code))];
    expect(codes.sort()).toEqual(LISTE_OFFICIELLE.map((n) => n.code).sort());
    for (const n of LISTE_OFFICIELLE) expect({ code: n.code, presente: notesSyscohadaDuCode(n.code).length > 0 }).toEqual({ code: n.code, presente: true });
  });

  it('les codes apparaissent dans l’ordre officiel, une note à plusieurs tableaux restant groupée', () => {
    const ordreOfficiel = LISTE_OFFICIELLE.map((n) => n.code);
    const ordreTranscrit = NOTES_SYSCOHADA.map((n) => n.code).filter((c, i, a) => i === 0 || a[i - 1] !== c);
    expect(ordreTranscrit).toEqual(ordreOfficiel);
  });

  it('aucun tableau en double entre les tranches · un code seul, ou un code et son sous-tableau', () => {
    const cles = NOTES_SYSCOHADA.map((n) => `${n.code}::${n.sousTableau ?? ''}`);
    expect(new Set(cles).size).toBe(cles.length);
    const parCode = new Map<string, number>();
    for (const n of NOTES_SYSCOHADA) parCode.set(n.code, (parCode.get(n.code) ?? 0) + 1);
    for (const n of NOTES_SYSCOHADA) {
      expect({ code: n.code, nomme: (parCode.get(n.code) ?? 0) === 1 || !!n.sousTableau }).toEqual({ code: n.code, nomme: true });
    }
  });

  it('les clés de rattachement sont uniques par code, toutes tranches confondues', () => {
    const parCode = new Map<string, string[]>();
    for (const n of NOTES_SYSCOHADA) {
      for (const r of n.rubriques) if (r.cle) parCode.set(n.code, [...(parCode.get(n.code) ?? []), r.cle]);
    }
    for (const [code, cles] of parCode) expect({ code, uniques: new Set(cles).size === cles.length }).toEqual({ code, uniques: true });
  });

  it('le numéro de tête se lit sur tout code de la liste, y compris « 16B bis »', () => {
    expect(numeroDeTeteNoteSyscohada('3A')).toBe(3);
    expect(numeroDeTeteNoteSyscohada('16B bis')).toBe(16);
    expect(numeroDeTeteNoteSyscohada('27B')).toBe(27);
    expect(numeroDeTeteNoteSyscohada('36')).toBe(36);
    expect(() => numeroDeTeteNoteSyscohada('bis')).toThrow();
  });
});
