import { POSTES_CHARGES, POSTES_HAO, POSTES_PRODUITS, TOUS_LES_POSTES, posteDuCompte } from './correspondance-compte-resultat';

/**
 * Le tableau de correspondance est une transcription du Journal officiel :
 * ces tests verrouillent le rattachement compte → poste, qui décide de la
 * conformité du compte de résultat. Une régression ici ne « planterait »
 * rien · elle produirait silencieusement un état faux.
 */
describe('correspondance compte de résultat (SYCEBNL, Partie 4 ch. 2)', () => {
  describe('rattachement des comptes aux postes officiels', () => {
    it.each([
      ['70100000', 'RA'], // Cotisations
      ['70300000', 'RB'], // Dotations consomptibles transférées
      ['70410000', 'RC'], // Générosité · dons
      ['70510000', 'RD'], // Ventes de marchandises
      ['70520000', 'RE'], // Services vendus
      ['70530000', 'RE'], // Ventes de produits finis
      ['71100000', 'RF'], // Subventions d'exploitation
      ['70600000', 'RG'], // Revenus des manifestations
      ['79000000', 'RH'], // Reprises
      ['60100000', 'TA'], // Achats de biens et services liés
      ['60310000', 'TB'], // Variation stocks biens liés
      ['60200000', 'TC'], // Achats de marchandises
      ['60400000', 'TD'], // Autres achats
      ['60320000', 'TE'], // Variation stocks marchandises
      ['61200000', 'TF'], // Transports
      ['62200000', 'TG'], // Services extérieurs
      ['64000000', 'TH'], // Impôts et taxes
      ['65000000', 'TI'], // Autres charges
      ['66100000', 'TJ'], // Charges de personnel
      ['67000000', 'TK'], // Frais financiers
      ['68000000', 'TL'], // Dotations
      ['82200000', 'TM'], // Produits de cession (H.A.O.)
      ['81200000', 'TN'], // Valeurs comptables des cessions (H.A.O.)
    ])('le compte %s alimente le poste %s', (numero, refAttendu) => {
      expect(posteDuCompte(numero)?.ref).toBe(refAttendu);
    });

    it('distingue 6031 (TB) de 6032-6035 (TE) · le préfixe le plus long l’emporte', () => {
      // Sans la règle du préfixe le plus long, « 603 » n'existant pas comme
      // jeton, ces comptes tomberaient tous dans le même poste (ou aucun) et
      // la ventilation officielle des variations de stocks serait perdue.
      expect(posteDuCompte('60310000')?.ref).toBe('TB');
      expect(posteDuCompte('60320000')?.ref).toBe('TE');
      expect(posteDuCompte('60330000')?.ref).toBe('TE');
      expect(posteDuCompte('60350000')?.ref).toBe('TE');
    });

    it('distingue 7051 (RD, marchandises) de 7052/7053 (RE, services et produits finis)', () => {
      expect(posteDuCompte('70510000')?.ref).toBe('RD');
      expect(posteDuCompte('70520000')?.ref).toBe('RE');
    });

    it('ne rattache aucun compte de bilan (classes 1 à 5)', () => {
      for (const numero of ['10110000', '24510000', '31100000', '41100000', '52110000']) {
        expect(posteDuCompte(numero)).toBeNull();
      }
    });

    it('ne rattache pas les comptes de classe 9 (hors bilan et hors résultat par construction)', () => {
      expect(posteDuCompte('90000000')).toBeNull();
      expect(posteDuCompte('91000000')).toBeNull();
    });
  });

  describe('lacunes du texte officiel, signalées et non comblées', () => {
    it('laisse 7054 et 7055 hors de tout poste (le tableau officiel ne les cite pas)', () => {
      // Les rattacher d'office à RE serait une interprétation, pas une
      // transcription. Ils doivent ressortir en « comptes non rattachés »
      // pour que le contrôle d'écart les rende visibles.
      expect(posteDuCompte('70540000')).toBeNull();
      expect(posteDuCompte('70550000')).toBeNull();
    });

    it('laisse 702 hors de tout poste (compte du jeu « projets de développement »)', () => {
      expect(posteDuCompte('70200000')).toBeNull();
    });
  });

  describe('intégrité du tableau', () => {
    it('ne comporte aucun code REF en double', () => {
      const refs = TOUS_LES_POSTES.map((p) => p.ref);
      expect(new Set(refs).size).toBe(refs.length);
    });

    it('couvre les 8 postes de produits, 12 de charges et 2 H.A.O. du texte officiel', () => {
      expect(POSTES_PRODUITS).toHaveLength(8); // RA → RH
      expect(POSTES_CHARGES).toHaveLength(12); // TA → TL
      expect(POSTES_HAO).toHaveLength(2); // TM, TN
    });

    it('n’attribue jamais deux postes au même préfixe de compte', () => {
      const vus = new Map<string, string>();
      for (const poste of TOUS_LES_POSTES) {
        for (const prefixe of poste.comptes) {
          expect(vus.has(prefixe)).toBe(false);
          vus.set(prefixe, poste.ref);
        }
      }
    });
  });
});
