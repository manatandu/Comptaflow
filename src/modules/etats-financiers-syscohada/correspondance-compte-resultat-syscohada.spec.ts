import { PLAN_COMPTES_SYSCOHADA } from '../comptes/compte-seed-syscohada';
import {
  CODES_NOTES_CH6,
  ORDRE_AFFICHAGE_COMPTE_RESULTAT,
  POSTES_CHARGES_SYSCOHADA,
  POSTES_COMPTE_RESULTAT_SYSCOHADA,
  POSTES_PRODUITS_SYSCOHADA,
  RENVOIS_NOTES_SUBDIVISES,
  SOLDES_INTERMEDIAIRES,
  calculerSoldesIntermediaires,
  compte13DuSolde,
  montantSigne,
  posteDuCompteSyscohada,
  resoudreRenvoiNote,
  signeConformeAuModele,
  trouvePosteCompteResultat,
  trouveSoldeIntermediaire,
} from './correspondance-compte-resultat-syscohada';

/**
 * La table est une transcription de l'AUDCIF (Titre IX ch. 4 et ch. 7). Une
 * régression ici ne planterait rien : elle produirait un compte de résultat
 * faux en silence, la seule catégorie de bug que le dépôt ne tolère pas
 * (CLAUDE.md §1). Ces tests relisent donc la source : chaque REF du modèle
 * dans l'ordre, aucun doublon, chaque compte de gestion du semis dans UN
 * poste, chaque formule de solde telle qu'imprimée.
 */
describe('correspondance compte de résultat SYSCOHADA (AUDCIF Titre IX ch. 4 et ch. 7)', () => {
  const comptesDetail = PLAN_COMPTES_SYSCOHADA.filter((c) => c.typeCompte !== 'TOTAL');
  const comptesDeGestion = comptesDetail.filter((c) => '678'.includes(c.numero[0]));
  const toutesLesRefs = [...POSTES_COMPTE_RESULTAT_SYSCOHADA.map((p) => p.ref), ...SOLDES_INTERMEDIAIRES.map((s) => s.ref)];

  describe('structure du modèle (ch. 4, section 2)', () => {
    it("reprend les 42 lignes du modèle dans l'ordre exact, postes et soldes entrelacés", () => {
      // Recopié ligne à ligne du modèle officiel : c'est la maquette déposée.
      expect(ORDRE_AFFICHAGE_COMPTE_RESULTAT).toEqual([
        'TA', 'RA', 'RB', 'XA',
        'TB', 'TC', 'TD', 'XB',
        'TE', 'TF', 'TG', 'TH', 'TI', 'RC', 'RD', 'RE', 'RF', 'RG', 'RH', 'RI', 'RJ', 'XC',
        'RK', 'XD',
        'TJ', 'RL', 'XE',
        'TK', 'TL', 'TM', 'RM', 'RN', 'XF',
        'XG',
        'TN', 'TO', 'RO', 'RP', 'XH',
        'RQ', 'RS', 'XI',
      ]);
    });

    it('compte 15 produits (TA à TO), 18 charges (RA à RQ puis RS) et 9 soldes (XA à XI)', () => {
      expect(POSTES_PRODUITS_SYSCOHADA.map((p) => p.ref)).toEqual([
        'TA', 'TB', 'TC', 'TD', 'TE', 'TF', 'TG', 'TH', 'TI', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO',
      ]);
      expect(POSTES_CHARGES_SYSCOHADA.map((p) => p.ref)).toEqual([
        'RA', 'RB', 'RC', 'RD', 'RE', 'RF', 'RG', 'RH', 'RI', 'RJ', 'RK', 'RL', 'RM', 'RN', 'RO', 'RP', 'RQ', 'RS',
      ]);
      expect(SOLDES_INTERMEDIAIRES.map((s) => s.ref)).toEqual(['XA', 'XB', 'XC', 'XD', 'XE', 'XF', 'XG', 'XH', 'XI']);
    });

    it("ne connaît ni RR, ni RT, ni XM, ni TP à TS · codes absents du modèle (anomalie n° 1 de la maquette du skill)", () => {
      for (const ref of ['RR', 'RT', 'XM', 'TP', 'TQ', 'TR', 'TS']) {
        expect(toutesLesRefs).not.toContain(ref);
      }
    });

    it('ne comporte aucun REF en double, postes et soldes confondus', () => {
      expect(new Set(toutesLesRefs).size).toBe(toutesLesRefs.length);
    });

    it("l'ordre d'affichage couvre exactement les postes + soldes, rien de plus, rien de moins", () => {
      expect(new Set(ORDRE_AFFICHAGE_COMPTE_RESULTAT)).toEqual(new Set(toutesLesRefs));
      expect(ORDRE_AFFICHAGE_COMPTE_RESULTAT).toHaveLength(toutesLesRefs.length);
    });

    it("l'ordre des postes de base dans la table est celui du modèle", () => {
      const refsPostesDansOrdreModele = ORDRE_AFFICHAGE_COMPTE_RESULTAT.filter((r) => !r.startsWith('X'));
      expect(POSTES_COMPTE_RESULTAT_SYSCOHADA.map((p) => p.ref)).toEqual(refsPostesDansOrdreModele);
    });

    it('les quatre composantes du chiffre d’affaires portent les lettres A à D, et elles seules', () => {
      const lettres = POSTES_COMPTE_RESULTAT_SYSCOHADA.filter((p) => p.lettre).map((p) => [p.ref, p.lettre]);
      expect(lettres).toEqual([['TA', 'A'], ['TB', 'B'], ['TC', 'C'], ['TD', 'D']]);
    });

    it.each([
      // Les deux libellés où le ch. 4 et le ch. 7 divergent (anomalie n° 9) :
      // c'est le ch. 4, modèle imprimé, qui est retenu.
      ['TJ', "Reprises d'amortissements, provisions et dépréciations"],
      ['RM', 'Frais financiers et charges assimilées'],
      // Majuscule à « Produits » et « Charges » dans les deux chapitres.
      ['TO', 'Autres Produits HAO'],
      ['RP', 'Autres Charges HAO'],
      ['TE', 'Production stockée (ou déstockage)'],
      ['RQ', 'Participation des travailleurs'],
    ])('%s porte le libellé du modèle du ch. 4 : %s', (ref, libelle) => {
      expect(trouvePosteCompteResultat(ref)!.libelle).toBe(libelle);
    });
  });

  describe('formules des soldes intermédiaires (ch. 4, « logique de signe » : des sommes, jamais des différences)', () => {
    it.each([
      ['XA', ['TA', 'RA', 'RB']],
      ['XB', ['TA', 'TB', 'TC', 'TD']],
      ['XC', ['XB', 'RA', 'RB', 'TE', 'TF', 'TG', 'TH', 'TI', 'RC', 'RD', 'RE', 'RF', 'RG', 'RH', 'RI', 'RJ']],
      ['XD', ['XC', 'RK']],
      ['XE', ['XD', 'TJ', 'RL']],
      ['XF', ['TK', 'TL', 'TM', 'RM', 'RN']],
      ['XG', ['XE', 'XF']],
      ['XH', ['TN', 'TO', 'RO', 'RP']],
      ['XI', ['XG', 'XH', 'RQ', 'RS']],
    ])('%s somme exactement %j', (ref, deRefs) => {
      expect(trouveSoldeIntermediaire(ref)?.deRefs).toEqual(deRefs);
    });

    it('chaque solde ne lit que des refs qui le PRÉCÈDENT dans l’ordre d’affichage · sinon le calcul en une passe lirait 0', () => {
      const dejaResolues = new Set<string>();
      for (const ref of ORDRE_AFFICHAGE_COMPTE_RESULTAT) {
        const solde = trouveSoldeIntermediaire(ref);
        if (solde) {
          for (const r of solde.deRefs) expect(dejaResolues.has(r)).toBe(true);
        }
        dejaResolues.add(ref);
      }
    });

    it('chaque solde ne référence que des refs qui existent', () => {
      const connues = new Set(toutesLesRefs);
      for (const s of SOLDES_INTERMEDIAIRES) for (const r of s.deRefs) expect(connues.has(r)).toBe(true);
    });

    it('« somme TE à RJ » couvre toutes les lignes entre TE et RJ dans l’ordre du modèle, aucune de plus', () => {
      const debut = ORDRE_AFFICHAGE_COMPTE_RESULTAT.indexOf('TE');
      const fin = ORDRE_AFFICHAGE_COMPTE_RESULTAT.indexOf('RJ');
      const plage = ORDRE_AFFICHAGE_COMPTE_RESULTAT.slice(debut, fin + 1);
      expect(trouveSoldeIntermediaire('XC')!.deRefs.slice(3)).toEqual(plage);
    });

    it('chaque poste de base entre EXACTEMENT UNE FOIS dans XI (un poste oublié ou compté deux fois fausserait le résultat net)', () => {
      const compter = (ref: string, compteur: Map<string, number>) => {
        const solde = trouveSoldeIntermediaire(ref);
        if (!solde) {
          compteur.set(ref, (compteur.get(ref) ?? 0) + 1);
          return;
        }
        for (const r of solde.deRefs) compter(r, compteur);
      };
      const compteur = new Map<string, number>();
      compter('XI', compteur);
      for (const p of POSTES_COMPTE_RESULTAT_SYSCOHADA) expect(compteur.get(p.ref)).toBe(1);
      expect(compteur.size).toBe(POSTES_COMPTE_RESULTAT_SYSCOHADA.length);
    });

    it('calculerSoldesIntermediaires : XI = somme signée de tous les postes, et chaque solde suit sa formule', () => {
      // Jeu volontairement complet : chaque poste non nul, charges en négatif.
      const montants: Record<string, number> = {};
      POSTES_COMPTE_RESULTAT_SYSCOHADA.forEach((p, i) => {
        const base = 1000 + i * 37;
        montants[p.ref] = p.sens === 'PRODUIT' ? base : -base;
      });
      const r = calculerSoldesIntermediaires(montants);
      const totalPostes = POSTES_COMPTE_RESULTAT_SYSCOHADA.reduce((s, p) => s + montants[p.ref], 0);
      expect(r.XI).toBeCloseTo(totalPostes, 6);
      expect(r.XA).toBeCloseTo(montants.TA + montants.RA + montants.RB, 6);
      expect(r.XB).toBeCloseTo(montants.TA + montants.TB + montants.TC + montants.TD, 6);
      expect(r.XD).toBeCloseTo(r.XC + montants.RK, 6);
      expect(r.XE).toBeCloseTo(r.XD + montants.TJ + montants.RL, 6);
      expect(r.XG).toBeCloseTo(r.XE + r.XF, 6);
      expect(r.XI).toBeCloseTo(r.XG + r.XH + montants.RQ + montants.RS, 6);
    });

    it('calculerSoldesIntermediaires : une ref absente vaut 0, pas NaN', () => {
      const r = calculerSoldesIntermediaires({ TA: 500, RA: -300 });
      expect(r.XA).toBe(200);
      expect(r.XI).toBe(200);
      expect(Number.isNaN(r.XC)).toBe(false);
    });

    it('porte sur chaque solde le sous-compte du 13 du Titre VII (132 à 138) · la maquette du skill les décalait (anomalie n° 2)', () => {
      const attendus: Record<string, string | undefined> = {
        XA: '132', XB: undefined, XC: '133', XD: '134', XE: '135', XF: '136', XG: '137', XH: '138', XI: undefined,
      };
      for (const s of SOLDES_INTERMEDIAIRES) expect({ ref: s.ref, compte13: s.compte13 }).toEqual({ ref: s.ref, compte13: attendus[s.ref] });
    });

    it('XI est le seul solde dont le compte dépend du signe : 131 bénéfice, 139 perte (Titre VII, COMPTE 13)', () => {
      const avecSigne = SOLDES_INTERMEDIAIRES.filter((s) => s.compte13ParSigne).map((s) => s.ref);
      expect(avecSigne).toEqual(['XI']);
      const xi = trouveSoldeIntermediaire('XI')!;
      expect(xi.compte13ParSigne).toEqual({ benefice: '131', perte: '139' });
      expect(compte13DuSolde(xi, 1000)).toBe('131');
      expect(compte13DuSolde(xi, -1000)).toBe('139');
      expect(compte13DuSolde(xi, 0)).toBe('131');
      expect(compte13DuSolde(trouveSoldeIntermediaire('XA')!, -50)).toBe('132');
      expect(compte13DuSolde(trouveSoldeIntermediaire('XB')!, 50)).toBeUndefined();
    });

    it('chaque solde porte compte13 OU compte13ParSigne, jamais les deux', () => {
      for (const s of SOLDES_INTERMEDIAIRES) expect(Boolean(s.compte13) && Boolean(s.compte13ParSigne)).toBe(false);
    });

    it('les huit soldes de gestion sont ceux qui ont un sous-compte 13 ; XB, agrégat de ventes, est la neuvième ligne X*', () => {
      const soldesDeGestion = SOLDES_INTERMEDIAIRES.filter((s) => s.compte13 || s.compte13ParSigne);
      expect(soldesDeGestion).toHaveLength(8);
      expect(SOLDES_INTERMEDIAIRES).toHaveLength(9);
      expect(SOLDES_INTERMEDIAIRES.filter((s) => !s.compte13 && !s.compte13ParSigne).map((s) => s.ref)).toEqual(['XB']);
    });
  });

  describe('rattachement des comptes du semis SYSCOHADA (ch. 7)', () => {
    it('chaque compte d’imputation des classes 6, 7 et 8 est réclamé par EXACTEMENT un poste', () => {
      expect(comptesDeGestion.length).toBeGreaterThan(200);
      for (const c of comptesDeGestion) {
        const postes = POSTES_COMPTE_RESULTAT_SYSCOHADA.filter((p) => p.comptes.some((prefixe) => c.numero.startsWith(prefixe)));
        expect({ numero: c.numero, postes: postes.map((p) => p.ref) }).toEqual({ numero: c.numero, postes: [expect.any(String)] });
      }
    });

    it.each([
      ['70110000', 'TA'], // 701 ventes de marchandises
      ['70210000', 'TB'], // 702 produits finis
      ['70410000', 'TB'], // 704 produits résiduels
      ['70510000', 'TC'], // 705 travaux facturés
      ['70610000', 'TC'], // 706 services vendus
      ['70710000', 'TD'], // 707 produits accessoires
      ['73600000', 'TE'], // 73 variation stocks produits
      ['72100000', 'TF'],
      ['71810000', 'TG'],
      ['75420000', 'TH'], // 754 cessions courantes : activité ordinaire (anomalie n° 7)
      ['78100000', 'TI'], // 781
      ['78700000', 'TM'], // 787
      ['79110000', 'TJ'], // 791
      ['79800000', 'TJ'], // 798
      ['79900000', 'TJ'], // 799 reprise de subvention d'investissement : exploitation
      ['79720000', 'TL'], // 797
      ['77120000', 'TK'],
      ['82200000', 'TN'],
      ['84500000', 'TO'],
      ['86100000', 'TO'],
      ['88100000', 'TO'], // 88 subventions d'équilibre : HAO selon ch. 7 (anomalie n° 6)
      ['60110000', 'RA'],
      ['60310000', 'RB'], // 6031
      ['60210000', 'RC'],
      ['60320000', 'RD'], // 6032
      ['60410000', 'RE'],
      ['60520000', 'RE'],
      ['60810000', 'RE'],
      ['60330000', 'RF'], // 6033
      ['61200000', 'RG'],
      ['62210000', 'RH'],
      ['63110000', 'RH'], // 63 avec 62 en RH
      ['64110000', 'RI'],
      ['65420000', 'RJ'], // 654 cessions courantes : activité ordinaire (anomalie n° 7)
      ['66110000', 'RK'],
      ['68120000', 'RL'], // 681
      ['69110000', 'RL'], // 691
      ['67120000', 'RM'],
      ['69710000', 'RN'], // 697
      ['81200000', 'RO'],
      ['83100000', 'RP'],
      ['85100000', 'RP'],
      ['87100000', 'RQ'], // 87 participation des travailleurs
      ['89110000', 'RS'], // 89 impôts sur le résultat
      ['89910000', 'RS'], // 899 dégrèvements : dans RS aussi, le 89 remonte en bloc
    ])('le compte %s alimente le poste %s', (numero, ref) => {
      expect(posteDuCompteSyscohada(numero)?.ref).toBe(ref);
    });

    it('éclate le 603 sur trois postes et jamais en bloc (ch. 7, clés de lecture)', () => {
      expect(posteDuCompteSyscohada('60310000')?.ref).toBe('RB');
      expect(posteDuCompteSyscohada('60320000')?.ref).toBe('RD');
      expect(posteDuCompteSyscohada('60330000')?.ref).toBe('RF');
      for (const p of POSTES_COMPTE_RESULTAT_SYSCOHADA) {
        expect(p.comptes).not.toContain('603');
        expect(p.comptes).not.toContain('60');
      }
    });

    it('éclate 68/69, 78 et 79 par destination (exploitation / financier)', () => {
      expect(trouvePosteCompteResultat('RL')!.comptes).toEqual(['681', '691']);
      expect(trouvePosteCompteResultat('RN')!.comptes).toEqual(['697']);
      expect(trouvePosteCompteResultat('TI')!.comptes).toEqual(['781']);
      expect(trouvePosteCompteResultat('TM')!.comptes).toEqual(['787']);
      expect(trouvePosteCompteResultat('TJ')!.comptes).toEqual(['791', '798', '799']);
      expect(trouvePosteCompteResultat('TL')!.comptes).toEqual(['797']);
    });

    it('chaque préfixe cité existe réellement au plan SYSCOHADA semé', () => {
      for (const p of POSTES_COMPTE_RESULTAT_SYSCOHADA) {
        for (const prefixe of p.comptes) {
          const existe = PLAN_COMPTES_SYSCOHADA.some((c) => c.numero.startsWith(prefixe));
          expect({ ref: p.ref, prefixe, existe }).toEqual({ ref: p.ref, prefixe, existe: true });
        }
      }
    });

    it('n’attribue jamais deux postes au même préfixe', () => {
      const vus = new Map<string, string>();
      for (const p of POSTES_COMPTE_RESULTAT_SYSCOHADA) {
        for (const prefixe of p.comptes) {
          expect(vus.get(prefixe) ?? p.ref).toBe(p.ref);
          vus.set(prefixe, p.ref);
        }
      }
    });

    it('ne cite aucun préfixe hors des classes 6, 7, 8', () => {
      for (const p of POSTES_COMPTE_RESULTAT_SYSCOHADA) {
        for (const prefixe of p.comptes) expect('678').toContain(prefixe[0]);
      }
    });

    it('ne rattache aucun compte de bilan (classes 1 à 5) ni de classe 9 du semis', () => {
      const horsGestion = comptesDetail.filter((c) => !'678'.includes(c.numero[0]));
      expect(horsGestion.length).toBeGreaterThan(500);
      for (const c of horsGestion) expect(posteDuCompteSyscohada(c.numero)).toBeNull();
    });
  });

  describe('signes et renvois de notes (ch. 4, colonnes SIGNE et NOTE)', () => {
    it('les postes « –/+ » sont exactement les trois variations de stocks achetés et la production stockée', () => {
      const refs = POSTES_COMPTE_RESULTAT_SYSCOHADA.filter((p) => p.signe === '-/+').map((p) => p.ref);
      expect(refs).toEqual(['RB', 'TE', 'RD', 'RF']);
    });

    it('un produit est « + » (ou –/+), une charge est « – » (ou –/+) · jamais l’inverse', () => {
      for (const p of POSTES_COMPTE_RESULTAT_SYSCOHADA) {
        if (p.signe === '-/+') continue;
        expect(p.signe).toBe(p.sens === 'PRODUIT' ? '+' : '-');
      }
    });

    it('montantSigne = crédit − débit pour tout poste : la convention du modèle, charges en négatif', () => {
      expect(montantSigne(600, 0)).toBe(-600); // une charge
      expect(montantSigne(0, 1000)).toBe(1000); // un produit
      expect(montantSigne(0, 50)).toBe(50); // 6031 créditeur = stockage, RB ressort positif
    });

    it('signeConformeAuModele signale une charge créditrice ou un produit débiteur, jamais un poste –/+', () => {
      const ra = trouvePosteCompteResultat('RA')!;
      const ta = trouvePosteCompteResultat('TA')!;
      const rb = trouvePosteCompteResultat('RB')!;
      expect(signeConformeAuModele(ra, -100)).toBe(true);
      expect(signeConformeAuModele(ra, 100)).toBe(false);
      expect(signeConformeAuModele(ta, 100)).toBe(true);
      expect(signeConformeAuModele(ta, -100)).toBe(false);
      expect(signeConformeAuModele(rb, -100)).toBe(true);
      expect(signeConformeAuModele(rb, 100)).toBe(true);
      expect(signeConformeAuModele(ra, 0)).toBe(true);
    });

    it.each([
      ['TA', ['21']], ['RA', ['22']], ['RB', ['6']], ['TB', ['21']], ['TC', ['21']], ['TD', ['21']],
      ['TE', ['6']], ['TF', ['21']], ['TG', ['21']], ['TH', ['21']], ['TI', ['12']],
      ['RC', ['22']], ['RD', ['6']], ['RE', ['22']], ['RF', ['6']], ['RG', ['23']], ['RH', ['24']], ['RI', ['25']], ['RJ', ['26']],
      ['RK', ['27']], ['TJ', ['28']], ['RL', ['3C', '28']],
      ['TK', ['29']], ['TL', ['28']], ['TM', ['12']], ['RM', ['29']], ['RN', ['3C', '28']],
      ['TN', ['3D']], ['TO', ['30']], ['RO', ['3D']], ['RP', ['30']],
      ['RQ', ['30']], ['RS', []],
    ])('%s renvoie aux notes %j', (ref, notes) => {
      expect(trouvePosteCompteResultat(ref)!.notes).toEqual(notes);
    });

    it('les renvois ne visent que des notes effectivement citées par le modèle du compte de résultat', () => {
      // Sous-ensemble de la liste des 36 notes cité par le ch. 4 (« 27 » est
      // le renvoi brut du ch. 4, que le ch. 6 subdivise en 27A/27B).
      const admis = new Set(['6', '12', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '3C', '3D']);
      for (const p of POSTES_COMPTE_RESULTAT_SYSCOHADA) for (const n of p.notes) expect(admis.has(n)).toBe(true);
      for (const s of SOLDES_INTERMEDIAIRES) for (const n of s.notes) expect(admis.has(n)).toBe(true);
    });

    it('la liste des codes du ch. 6 porte 46 en-têtes pour 36 numéros de notes, sous-lettres comprises', () => {
      // 36 en-têtes « #### NOTE » au ch. 6 : 1 à 36 avec 3A à 3F, 15A/15B,
      // 16A, 16B, 16B bis, 16C, 27A/27B en place des numéros simples.
      expect(new Set(CODES_NOTES_CH6).size).toBe(CODES_NOTES_CH6.length);
      expect(CODES_NOTES_CH6).toHaveLength(46);
      for (const absent of ['3', '15', '16', '27']) expect(CODES_NOTES_CH6).not.toContain(absent);
    });

    it('chaque renvoi de la table, une fois résolu, pointe sur une note qui existe au ch. 6 (anomalie n° 11 : « 27 » devient 27A et 27B)', () => {
      const connues = new Set(CODES_NOTES_CH6);
      const renvoisBruts = new Set<string>();
      for (const p of POSTES_COMPTE_RESULTAT_SYSCOHADA) for (const n of p.notes) renvoisBruts.add(n);
      for (const s of SOLDES_INTERMEDIAIRES) for (const n of s.notes) renvoisBruts.add(n);
      for (const brut of renvoisBruts) {
        for (const code of resoudreRenvoiNote(brut)) {
          expect({ brut, code, existe: connues.has(code) }).toEqual({ brut, code, existe: true });
        }
      }
      expect(resoudreRenvoiNote('27')).toEqual(['27A', '27B']);
      expect(resoudreRenvoiNote('28')).toEqual(['28']);
      expect(Object.keys(RENVOIS_NOTES_SUBDIVISES)).toEqual(['27']);
    });

    it('resoudreRenvoiNote rend une copie : un consommateur qui la modifie ne touche pas la table', () => {
      const a = resoudreRenvoiNote('27');
      a.push('X');
      expect(resoudreRenvoiNote('27')).toEqual(['27A', '27B']);
    });

    it('seul XD porte un renvoi parmi les soldes · transcrit tel quel et signalé (anomalie n° 4)', () => {
      const soldesAvecNote = SOLDES_INTERMEDIAIRES.filter((s) => s.notes.length > 0).map((s) => s.ref);
      expect(soldesAvecNote).toEqual(['XD']);
    });
  });
});
