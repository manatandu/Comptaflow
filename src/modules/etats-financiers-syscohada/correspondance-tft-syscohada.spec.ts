import { PLAN_COMPTES_SYSCOHADA } from '../comptes/compte-seed-syscohada';
import {
  POSTES_ACTIF_SYSCOHADA,
  POSTES_PASSIF_SYSCOHADA,
  REF_RESULTAT_SYSCOHADA,
  TOTAUX_ACTIF_SYSCOHADA,
  TOTAUX_PASSIF_SYSCOHADA,
} from './correspondance-bilan-syscohada';
import { POSTES_COMPTE_RESULTAT_SYSCOHADA, SOLDES_INTERMEDIAIRES } from './correspondance-compte-resultat-syscohada';
import {
  COMPTES_EXCLUS_SANS_REPRISE,
  COMPTES_SANS_TRESORERIE_SYSCOHADA,
  COMPTES_TFT_NON_VENTILES_JUSTIFIES,
  CONTROLE_ZH_PAR_LES_FLUX,
  CONTROLE_ZH_PAR_LE_BILAN,
  ORDRE_AFFICHAGE_FLUX_SYSCOHADA,
  RENVOI_1_TFT_SYSCOHADA,
  POSTES_CAPITAUX_ETRANGERS_SYSCOHADA,
  POSTES_CAPITAUX_PROPRES_SYSCOHADA,
  POSTES_INVESTISSEMENT_SYSCOHADA,
  POSTES_OPERATIONNELS_SYSCOHADA,
  POSTE_TRESORERIE_OUVERTURE_SYSCOHADA,
  TOTAUX_FLUX_SYSCOHADA,
  TOUS_LES_POSTES_FLUX_SYSCOHADA,
  TermeFluxTresorerie,
  besoinsDuPoste,
  comptesCitesParLeTftSyscohada,
  signeConformeAuModeleFlux,
  trouvePosteFluxSyscohada,
  trouveTotalFluxSyscohada,
} from './correspondance-tft-syscohada';

/**
 * La table est une transcription de l'AUDCIF (Titre IX ch. 5) assemblant
 * les postes du bilan et du compte de résultat SYSCOHADA. Une régression ici
 * ne planterait rien : elle produirait un tableau de flux faux en silence,
 * ou qui boucle à tort (CLAUDE.md §1 et §10). Ces tests relisent donc la
 * source : chaque REF du modèle dans l'ordre, aucun doublon, chaque formule
 * de total fermée sur des refs antérieures, chaque compte cité existant au
 * plan semé, chaque poste d'état cité existant dans la table voisine.
 */
describe('correspondance tableau des flux de trésorerie SYSCOHADA (AUDCIF Titre IX ch. 5)', () => {
  const comptesDetail = PLAN_COMPTES_SYSCOHADA.filter((c) => c.typeCompte !== 'TOTAL');
  const refsPostes = TOUS_LES_POSTES_FLUX_SYSCOHADA.map((p) => p.ref);
  const refsTotaux = TOTAUX_FLUX_SYSCOHADA.map((t) => t.ref);
  const refsBilan = new Set([
    ...POSTES_ACTIF_SYSCOHADA.map((p) => p.ref),
    ...POSTES_PASSIF_SYSCOHADA.map((p) => p.ref),
    ...TOTAUX_ACTIF_SYSCOHADA.map((t) => t.ref),
    ...TOTAUX_PASSIF_SYSCOHADA.map((t) => t.ref),
    REF_RESULTAT_SYSCOHADA,
  ]);
  const refsCompteResultat = new Set([...POSTES_COMPTE_RESULTAT_SYSCOHADA.map((p) => p.ref), ...SOLDES_INTERMEDIAIRES.map((s) => s.ref)]);
  const existeAuPlan = (prefixe: string) => PLAN_COMPTES_SYSCOHADA.some((c) => c.numero.startsWith(prefixe));
  const tousLesTermes: { ref: string; terme: TermeFluxTresorerie }[] = TOUS_LES_POSTES_FLUX_SYSCOHADA.flatMap((p) =>
    p.termes.map((terme) => ({ ref: p.ref, terme })),
  );

  describe('structure du modèle (ch. 5, section 2)', () => {
    it("reprend les REF du modèle dans l'ordre exact, rubriques et ligne sans code comprises", () => {
      // Recopié ligne à ligne du modèle officiel : c'est la maquette déposée.
      const refs = ORDRE_AFFICHAGE_FLUX_SYSCOHADA.filter((e): e is { ref: string } => 'ref' in e).map((e) => e.ref);
      expect(refs).toEqual([
        'ZA',
        'FA', 'FB', 'FC', 'FD', 'FE', '', 'ZB',
        'FF', 'FG', 'FH', 'FI', 'FJ', 'ZC',
        'FK', 'FL', 'FM', 'FN', 'ZD',
        'FO', 'FP', 'FQ', 'ZE',
        'ZF', 'ZG', 'ZH',
      ]);
      const sections = ORDRE_AFFICHAGE_FLUX_SYSCOHADA.filter((e): e is { section: string } => 'section' in e).map((e) => e.section);
      expect(sections).toHaveLength(4);
    });

    it('compte 17 postes FA à FQ, ZA à part, et les 7 totaux ZB à ZH plus la ligne sans code', () => {
      expect(POSTE_TRESORERIE_OUVERTURE_SYSCOHADA.ref).toBe('ZA');
      expect(POSTES_OPERATIONNELS_SYSCOHADA.map((p) => p.ref)).toEqual(['FA', 'FB', 'FC', 'FD', 'FE']);
      expect(POSTES_INVESTISSEMENT_SYSCOHADA.map((p) => p.ref)).toEqual(['FF', 'FG', 'FH', 'FI', 'FJ']);
      expect(POSTES_CAPITAUX_PROPRES_SYSCOHADA.map((p) => p.ref)).toEqual(['FK', 'FL', 'FM', 'FN']);
      expect(POSTES_CAPITAUX_ETRANGERS_SYSCOHADA.map((p) => p.ref)).toEqual(['FO', 'FP', 'FQ']);
      expect(refsTotaux).toEqual(['', 'ZB', 'ZC', 'ZD', 'ZE', 'ZF', 'ZG', 'ZH']);
    });

    it('ne comporte aucun REF en double, postes et totaux confondus', () => {
      const toutes = [...refsPostes, ...refsTotaux];
      expect(new Set(toutes).size).toBe(toutes.length);
    });

    it("l'ordre d'affichage couvre exactement les postes + totaux, rien de plus, rien de moins", () => {
      const refs = ORDRE_AFFICHAGE_FLUX_SYSCOHADA.filter((e): e is { ref: string } => 'ref' in e).map((e) => e.ref);
      expect(new Set(refs)).toEqual(new Set([...refsPostes, ...refsTotaux]));
      expect(refs).toHaveLength(refsPostes.length + refsTotaux.length);
    });

    it('porte les clés A à H du modèle sur ZA et les totaux, et sur eux seuls', () => {
      expect(POSTE_TRESORERIE_OUVERTURE_SYSCOHADA.section).toBe('OUVERTURE');
      const cles = TOTAUX_FLUX_SYSCOHADA.map((t) => [t.ref, t.cle]);
      expect(cles).toEqual([
        ['', undefined],
        ['ZB', 'B'], ['ZC', 'C'], ['ZD', 'D'], ['ZE', 'E'], ['ZF', 'F'], ['ZG', 'G'], ['ZH', 'H'],
      ]);
    });

    it('chaque poste est rangé dans la section de sa rubrique', () => {
      for (const p of POSTES_OPERATIONNELS_SYSCOHADA) expect(p.section).toBe('OPERATIONNEL');
      for (const p of POSTES_INVESTISSEMENT_SYSCOHADA) expect(p.section).toBe('INVESTISSEMENT');
      for (const p of POSTES_CAPITAUX_PROPRES_SYSCOHADA) expect(p.section).toBe('CAPITAUX_PROPRES');
      for (const p of POSTES_CAPITAUX_ETRANGERS_SYSCOHADA) expect(p.section).toBe('CAPITAUX_ETRANGERS');
    });

    it('le renvoi (1) est porté par FB et FE, et par eux seuls', () => {
      const avecRenvoi = TOUS_LES_POSTES_FLUX_SYSCOHADA.filter((p) => p.renvoi).map((p) => [p.ref, p.renvoi]);
      expect(avecRenvoi).toEqual([['FB', '(1)'], ['FE', '(1)']]);
    });
  });

  describe('fermeture des formules (modèle de la section 2 · anomalie n° 1, le schéma de la section 1 ne fait pas foi)', () => {
    it.each([
      ['', ['FB', 'FC', 'FD', 'FE']],
      ['ZB', ['FA', 'FB', 'FC', 'FD', 'FE']],
      ['ZC', ['FF', 'FG', 'FH', 'FI', 'FJ']],
      ['ZD', ['FK', 'FL', 'FM', 'FN']],
      ['ZE', ['FO', 'FP', 'FQ']],
      ['ZF', ['ZD', 'ZE']], // F = D + E
      ['ZG', ['ZB', 'ZC', 'ZF']], // G = B + C + F
      ['ZH', ['ZG', 'ZA']], // H = G + A
    ])('« %s » somme exactement %j', (ref, deRefs) => {
      expect(trouveTotalFluxSyscohada(ref)?.deRefs).toEqual(deRefs);
    });

    it('chaque total ne lit que des refs qui le PRÉCÈDENT dans l’ordre d’affichage · sinon le calcul en une passe lirait 0', () => {
      const dejaResolues = new Set<string>();
      for (const entree of ORDRE_AFFICHAGE_FLUX_SYSCOHADA) {
        if (!('ref' in entree)) continue;
        const total = trouveTotalFluxSyscohada(entree.ref);
        if (total) for (const r of total.deRefs) expect({ total: entree.ref, lit: r, resolue: dejaResolues.has(r) }).toEqual({ total: entree.ref, lit: r, resolue: true });
        dejaResolues.add(entree.ref);
      }
    });

    it('chaque total ne référence que des refs qui existent', () => {
      const connues = new Set([...refsPostes, ...refsTotaux]);
      for (const t of TOTAUX_FLUX_SYSCOHADA) for (const r of t.deRefs) expect(connues.has(r)).toBe(true);
    });

    it('chaque poste FA à FQ entre EXACTEMENT UNE FOIS dans ZH, et ZA une fois (un poste oublié ou compté deux fois fausserait la trésorerie de clôture)', () => {
      const compter = (ref: string, compteur: Map<string, number>) => {
        const total = trouveTotalFluxSyscohada(ref);
        if (!total) {
          compteur.set(ref, (compteur.get(ref) ?? 0) + 1);
          return;
        }
        for (const r of total.deRefs) compter(r, compteur);
      };
      const compteur = new Map<string, number>();
      compter('ZH', compteur);
      for (const p of TOUS_LES_POSTES_FLUX_SYSCOHADA) expect({ ref: p.ref, fois: compteur.get(p.ref) }).toEqual({ ref: p.ref, fois: 1 });
      expect(compteur.size).toBe(TOUS_LES_POSTES_FLUX_SYSCOHADA.length);
    });

    it('les deux contrôles de ZH : par les flux (ZA + ZB + ZC + ZF) et par le bilan (BT − DT sur N)', () => {
      expect(CONTROLE_ZH_PAR_LES_FLUX).toEqual(['ZA', 'ZB', 'ZC', 'ZF']);
      // ZA + ZB + ZC + ZF développe bien ZH = ZG + ZA = (ZB + ZC + ZF) + ZA.
      const zh = trouveTotalFluxSyscohada('ZH')!;
      const zg = trouveTotalFluxSyscohada('ZG')!;
      expect(new Set([...zg.deRefs, ...zh.deRefs.filter((r) => r !== 'ZG')])).toEqual(new Set(CONTROLE_ZH_PAR_LES_FLUX));
      expect(CONTROLE_ZH_PAR_LE_BILAN.map((t) => [t.signe, t.poste?.ref, t.poste?.lecture])).toEqual([[1, 'BT', 'N'], [-1, 'DT', 'N']]);
    });

    it('ZA lit BT et DT du bilan N-1, exactement comme le contrôle lit BT et DT de N', () => {
      expect(POSTE_TRESORERIE_OUVERTURE_SYSCOHADA.termes.map((t) => [t.signe, t.poste?.ref, t.poste?.lecture])).toEqual([[1, 'BT', 'N1'], [-1, 'DT', 'N1']]);
    });
  });

  describe('termes : forme, signes et postes cités', () => {
    it('chaque terme porte exactement un poste OU un ensemble de comptes, jamais les deux ni aucun', () => {
      for (const { ref, terme } of tousLesTermes) {
        const nature = [terme.poste ? 'poste' : null, terme.comptes ? 'comptes' : null].filter(Boolean);
        expect({ ref, nature }).toEqual({ ref, nature: [expect.any(String)] });
        expect([1, -1]).toContain(terme.signe);
        expect(terme.motif.length).toBeGreaterThan(10);
      }
    });

    it('une VARIATION_SOLDE porte toujours un sens de solde ; les autres lectures jamais', () => {
      for (const { ref, terme } of tousLesTermes) {
        if (!terme.comptes) continue;
        const attendu = terme.comptes.lecture === 'VARIATION_SOLDE';
        expect({ ref, lecture: terme.comptes.lecture, sens: terme.comptes.sensSolde !== undefined }).toEqual({ ref, lecture: terme.comptes.lecture, sens: attendu });
      }
    });

    it('chaque poste de bilan cité existe dans la table du bilan SYSCOHADA, chaque poste de compte de résultat dans la sienne', () => {
      for (const { ref, terme } of [...tousLesTermes, ...CONTROLE_ZH_PAR_LE_BILAN.map((terme) => ({ ref: 'ZH', terme }))]) {
        if (!terme.poste) continue;
        const connu = terme.poste.etat === 'BILAN' ? refsBilan.has(terme.poste.ref) : refsCompteResultat.has(terme.poste.ref);
        expect({ ref, poste: terme.poste.ref, connu }).toEqual({ ref, poste: terme.poste.ref, connu: true });
      }
    });

    it('un poste du compte de résultat se lit sur N seulement ; une colonne BRUT/NET ne se pose qu’au bilan', () => {
      for (const { terme } of tousLesTermes) {
        if (!terme.poste) continue;
        if (terme.poste.etat === 'COMPTE_RESULTAT') {
          expect(terme.poste.lecture).toBe('N');
          expect(terme.poste.colonne).toBeUndefined();
        }
      }
    });

    it('SOLDE_GESTION ne lit que des classes 6, 7, 8 ; mouvements et variations que des classes 1 à 5', () => {
      for (const { ref, terme } of tousLesTermes) {
        if (!terme.comptes) continue;
        for (const prefixe of terme.comptes.prefixes) {
          const classeGestion = '678'.includes(prefixe[0]);
          expect({ ref, prefixe, gestion: classeGestion }).toEqual({ ref, prefixe, gestion: terme.comptes.lecture === 'SOLDE_GESTION' });
        }
      }
    });

    it('signeAttendu suit la colonne signe du modèle : « – » → NEGATIF ou LIBRE, « + » → POSITIF ou LIBRE, vide → LIBRE', () => {
      for (const p of TOUS_LES_POSTES_FLUX_SYSCOHADA) {
        if (p.signeModele === '-') expect(['NEGATIF', 'LIBRE']).toContain(p.signeAttendu);
        if (p.signeModele === '+') expect(['POSITIF', 'LIBRE']).toContain(p.signeAttendu);
        if (p.signeModele === '') expect(p.signeAttendu).toBe('LIBRE');
      }
      // Les variations (FB à FE) et la CAFG changent de sens selon l'exercice.
      expect(TOUS_LES_POSTES_FLUX_SYSCOHADA.filter((p) => p.signeAttendu === 'LIBRE').map((p) => p.ref)).toEqual(['ZA', 'FA', 'FB', 'FC', 'FD', 'FE']);
      expect(TOUS_LES_POSTES_FLUX_SYSCOHADA.filter((p) => p.signeAttendu === 'NEGATIF').map((p) => p.ref)).toEqual(['FF', 'FG', 'FH', 'FM', 'FN', 'FQ']);
      expect(TOUS_LES_POSTES_FLUX_SYSCOHADA.filter((p) => p.signeAttendu === 'POSITIF').map((p) => p.ref)).toEqual(['FI', 'FJ', 'FK', 'FL', 'FO', 'FP']);
    });

    it('un décaissement porte ses termes principaux en négatif, un encaissement en positif · le « – » du modèle est dans les signes, pas à réappliquer', () => {
      // Premier terme de chaque poste = le fait générateur ; son signe est
      // celui du poste. Un service qui re-négativerait FF compterait deux
      // fois le signe (la même erreur que le compte de résultat interdit).
      for (const p of TOUS_LES_POSTES_FLUX_SYSCOHADA) {
        if (p.signeAttendu === 'NEGATIF') expect({ ref: p.ref, signe: p.termes[0].signe }).toEqual({ ref: p.ref, signe: -1 });
        if (p.signeAttendu === 'POSITIF') expect({ ref: p.ref, signe: p.termes[0].signe }).toEqual({ ref: p.ref, signe: 1 });
      }
      // Et les variations d'actif circulant (FB, FC, FD) entrent en −1, le passif (FE) en +1 · renvois (a) et (b) du ch. 5.
      expect(trouvePosteFluxSyscohada('FB')!.termes[0].signe).toBe(-1);
      expect(trouvePosteFluxSyscohada('FC')!.termes[0].signe).toBe(-1);
      expect(trouvePosteFluxSyscohada('FD')!.termes[0].signe).toBe(-1);
      expect(trouvePosteFluxSyscohada('FE')!.termes[0].signe).toBe(1);
    });

    it('signeConformeAuModeleFlux signale un décaissement positif ou un encaissement négatif, jamais un poste LIBRE', () => {
      const ff = trouvePosteFluxSyscohada('FF')!;
      const fi = trouvePosteFluxSyscohada('FI')!;
      const fb = trouvePosteFluxSyscohada('FB')!;
      expect(signeConformeAuModeleFlux(ff, -100)).toBe(true);
      expect(signeConformeAuModeleFlux(ff, 100)).toBe(false);
      expect(signeConformeAuModeleFlux(fi, 100)).toBe(true);
      expect(signeConformeAuModeleFlux(fi, -100)).toBe(false);
      expect(signeConformeAuModeleFlux(fb, -100)).toBe(true);
      expect(signeConformeAuModeleFlux(fb, 100)).toBe(true);
      expect(signeConformeAuModeleFlux(ff, 0)).toBe(true);
    });
  });

  describe('la CAFG (ch. 5 § 1.2.1.1), terme à terme', () => {
    const fa = trouvePosteFluxSyscohada('FA')!;
    const postesLus = fa.termes.filter((t) => t.poste).map((t) => [t.signe, t.poste!.ref]);
    const comptesLus = fa.termes.filter((t) => t.comptes).map((t) => [t.signe, t.comptes!.prefixes.join(',')]);

    it('intègre les DEUX quotes-parts sur opérations faites en commun', () => {
      // LE DÉFAUT QUE CE TEST GÈLE · le ch. 33 § 7.2 fait sortir le 652 et le
      // 752 des postes ordinaires pour les loger « à la fin du niveau
      // Exploitation » (RQP et TQP). Ils ont donc quitté XD, et la CAFG, qui
      // part de XD, les avait perdus · alors que leur contrepartie de bilan,
      // le compte 463 (§ 3.2), continue d'être lue par FD et FE, qui
      // n'excluent pas le 46. Le flux opérationnel d'un coparticipant s'en
      // trouvait décalé du montant de la quote-part, et la LIGNE CAFG était
      // fausse sans que rien ne la marque · la note 34 la reprend d'ailleurs
      // sans contrôle de bouclage à elle.
      //
      // Le coefficient est +1 des deux côtés parce que la valeur d'un poste
      // porte DÉJÀ son signe (RQP est `sens: 'CHARGE'`, `signe: '-'`), comme
      // XF que la CAFG prend de la même façon.
      expect(postesLus).toContainEqual([1, 'RQP']);
      expect(postesLus).toContainEqual([1, 'TQP']);
    });

    it("part de l'EBE (XD), jamais du résultat net", () => {
      expect(postesLus[0]).toEqual([1, 'XD']);
      expect(fa.termes.some((t) => t.poste?.ref === 'XI')).toBe(false);
    });

    it('retire 654 et 754 (cessions courantes), ajoute XF sans 797/697, TO sans 86, RP sans 85, puis RQ et RS', () => {
      // RQP et TQP suivent immédiatement XD · ils complètent le niveau
      // « Exploitation », dont le ch. 33 § 7.2 les fait la fin. Voir le test
      // suivant pour la raison de leur présence.
      expect(postesLus).toEqual([
        [1, 'XD'],
        [1, 'RQP'],
        [1, 'TQP'],
        [1, 'XF'],
        [1, 'TO'],
        [1, 'RP'],
        [1, 'RQ'],
        [1, 'RS'],
      ]);
      expect(comptesLus).toEqual([[-1, '654'], [-1, '754'], [-1, '797'], [-1, '697'], [-1, '86'], [-1, '85']]);
      for (const t of fa.termes) if (t.comptes) expect(t.comptes.lecture).toBe('SOLDE_GESTION');
    });

    it("n'entre ni 81 ni 82 : les cessions HAO relèvent de l'investissement", () => {
      for (const t of fa.termes) for (const p of t.comptes?.prefixes ?? []) expect(['81', '82']).not.toContain(p.slice(0, 2));
    });
  });

  describe('exclusions du renvoi (1) et des intérêts courus (ch. 5 § 1.2.1.3 · anomalie n° 4)', () => {
    const lit = (ref: string, prefixe: string, lecture: string) =>
      trouvePosteFluxSyscohada(ref)!.termes.some((t) => t.comptes?.lecture === lecture && t.comptes.prefixes.includes(prefixe));

    it('FD retire 414, 4493/458, 4494, 461/467, 4751 et ajoute 276 ; FE retire 404/481/482, 461/465, 4726, 4752 et ajoute 166/176/183', () => {
      for (const p of ['414', '4493', '458', '4494', '461', '467', '4751', '4713', '276', '4781', '4791']) expect({ p, lu: lit('FD', p, 'VARIATION_SOLDE') }).toEqual({ p, lu: true });
      for (const p of ['404', '481', '482', '461', '465', '4726', '4752', '166', '176', '183', '4783', '4793']) expect({ p, lu: lit('FE', p, 'VARIATION_SOLDE') }).toEqual({ p, lu: true });
    });

    it('les intérêts courus 166, 176, 183, 276 ne sont lus en mouvement par AUCUN poste de financement ou d’investissement', () => {
      for (const p of TOUS_LES_POSTES_FLUX_SYSCOHADA) {
        if (p.section === 'OPERATIONNEL' || p.section === 'OUVERTURE') continue;
        for (const t of p.termes) {
          if (!t.comptes) continue;
          for (const courus of ['166', '176', '183', '276']) {
            const capte = t.comptes.prefixes.some((pr) => courus.startsWith(pr)) && !(t.comptes.exclusions ?? []).some((e) => courus.startsWith(e));
            expect({ ref: p.ref, courus, capte }).toEqual({ ref: p.ref, courus, capte: false });
          }
        }
      }
    });

    it('chaque compte retiré de FD/FE est repris ailleurs (FF à FQ), sinon son flux disparaîtrait du tableau', () => {
      const reprisAilleurs = (prefixe: string) =>
        TOUS_LES_POSTES_FLUX_SYSCOHADA.some((p) => p.section !== 'OPERATIONNEL' && p.termes.some((t) => t.comptes?.prefixes.some((pr) => pr.startsWith(prefixe) || prefixe.startsWith(pr))));
      // 4713 y figure depuis la relecture : il était retiré de FO sans être
      // retiré de FD, donc compté deux fois (anomalie n° 5).
      for (const p of ['414', '4493', '458', '4494', '461', '467', '404', '481', '482', '465', '4713']) expect({ p, repris: reprisAilleurs(p) }).toEqual({ p, repris: true });
      // 4726, 4751, 4752 sont retirés SANS reprise, et c'est voulu (anomalies n° 7 et 14) · la liste les nomme pour le service.
      expect(COMPTES_EXCLUS_SANS_REPRISE.map((c) => c.prefixe)).toEqual(['4726', '4751', '4752']);
      for (const { prefixe } of COMPTES_EXCLUS_SANS_REPRISE) {
        expect({ prefixe, repris: reprisAilleurs(prefixe) }).toEqual({ prefixe, repris: false });
        // Un retrait porte le signe OPPOSÉ au premier terme du poste (−ΔBG en FD, donc +1 ; +ΔDP en FE, donc −1).
        const retire = [trouvePosteFluxSyscohada('FD')!, trouvePosteFluxSyscohada('FE')!].some((p) =>
          p.termes.some((t) => t.signe === -p.termes[0].signe && t.comptes?.lecture === 'VARIATION_SOLDE' && t.comptes.prefixes.includes(prefixe)),
        );
        expect({ prefixe, retire }).toEqual({ prefixe, retire: true });
      }
    });

    /**
     * Le contrôle INVERSE de celui du dessus, et celui qui manquait : le
     * test précédent vérifie que ce qui sort de FD/FE réapparaît en FF-FQ,
     * jamais qu'un compte lu par FF-FQ a bien été sorti de FB-FE. C'est
     * exactement par là que le 4713 était compté deux fois (anomalie n° 5),
     * et c'est ce qui casserait en silence si un futur terme se mettait à
     * lire un 4711, un 4712 ou un 42x. Écrit en relisant les postes du
     * bilan (`correspondance-bilan-syscohada.ts`) plutôt qu'une liste tenue
     * à la main, pour qu'un déplacement de compte au bilan le déclenche.
     */
    it('tout compte lu en mouvement ou en variation par FF à FQ et logé dans BA, BB, BG ou DP est retiré de FB à FE', () => {
      // BG = BH + BI + BJ, DP = DH + DI + DJ + DK + DM + DN (totaux du ch. 7) ;
      // BA et BB sont des postes de détail lus directement par FB et FC.
      const refsCirculantLues = new Set(['BA', 'BB', 'BH', 'BI', 'BJ', 'DH', 'DI', 'DJ', 'DK', 'DM', 'DN']);
      const postesCirculant = [...POSTES_ACTIF_SYSCOHADA, ...POSTES_PASSIF_SYSCOHADA].filter((p) => refsCirculantLues.has(p.ref));
      // « Loge dans le circulant » se juge sur des numéros RÉELS du plan semé,
      // pas sur la comparaison de deux préfixes : 4713 est capté par le « 47 »
      // de BJ et de DM, ce qu'aucune comparaison de chaînes ne dirait.
      const logeDansLeCirculant = (prefixe: string) =>
        comptesDetail.some(
          (c) =>
            c.numero.startsWith(prefixe) &&
            postesCirculant.some((p) => p.comptes.some((x) => c.numero.startsWith(x)) && !(p.exclusions ?? []).some((e) => c.numero.startsWith(e))),
        );
      // Un retrait porte le signe OPPOSÉ au terme principal du poste
      // (−ΔBA en FB et −ΔBG en FD, donc +1 ; +ΔDP en FE, donc −1).
      const retireDuBesoinEnFonds = (prefixe: string) =>
        ['FB', 'FC', 'FD', 'FE'].some((ref) => {
          const poste = trouvePosteFluxSyscohada(ref)!;
          return poste.termes.some(
            (t) => t.signe === -poste.termes[0].signe && t.comptes?.prefixes.some((pr) => prefixe.startsWith(pr) || pr.startsWith(prefixe)),
          );
        });

      let verifies = 0;
      for (const poste of TOUS_LES_POSTES_FLUX_SYSCOHADA) {
        if (poste.section === 'OUVERTURE' || poste.section === 'OPERATIONNEL') continue;
        for (const t of poste.termes) {
          if (!t.comptes || t.comptes.lecture === 'SOLDE_GESTION') continue;
          for (const prefixe of t.comptes.prefixes) {
            if (!logeDansLeCirculant(prefixe)) continue;
            verifies += 1;
            expect({ ref: poste.ref, prefixe, retire: retireDuBesoinEnFonds(prefixe) }).toEqual({ ref: poste.ref, prefixe, retire: true });
          }
        }
      }
      // Garde-fou : si le filtre cessait de reconnaître le circulant, la
      // boucle ne vérifierait plus rien et le test passerait à vide.
      expect(verifies).toBeGreaterThan(10);
      expect(logeDansLeCirculant('4713')).toBe(true);
    });
  });

  describe('investissement (ch. 5 § 1.3 · anomalies n° 3, 8, 9, 12)', () => {
    it('FF et FG lisent le BRUT de AD et AI en variation, avec les amortissements sortis et la VNC', () => {
      const ff = trouvePosteFluxSyscohada('FF')!;
      const fg = trouvePosteFluxSyscohada('FG')!;
      expect(ff.termes[0].poste).toEqual({ etat: 'BILAN', ref: 'AD', lecture: 'VARIATION', colonne: 'BRUT' });
      expect(fg.termes[0].poste).toEqual({ etat: 'BILAN', ref: 'AI', lecture: 'VARIATION', colonne: 'BRUT' });
      expect(ff.termes.find((t) => t.comptes?.lecture === 'MOUVEMENT_DEBIT' && t.comptes.prefixes.includes('281'))?.signe).toBe(-1);
      expect(ff.termes.find((t) => t.comptes?.lecture === 'SOLDE_GESTION')?.comptes?.prefixes).toEqual(['6541', '811']);
      expect(fg.termes.find((t) => t.comptes?.lecture === 'SOLDE_GESTION')?.comptes?.prefixes).toEqual(['6542', '812']);
    });

    it('FG neutralise la location acquisition (crédit 17 sauf 176), le démantèlement (1984) et la réévaluation (106, 154)', () => {
      const fg = trouvePosteFluxSyscohada('FG')!;
      const credits = fg.termes.filter((t) => t.comptes?.lecture === 'MOUVEMENT_CREDIT');
      expect(credits.find((t) => t.comptes!.prefixes.includes('17'))?.comptes?.exclusions).toEqual(['176']);
      expect(credits.some((t) => t.comptes!.prefixes.includes('1984'))).toBe(true);
      expect(credits.some((t) => t.comptes!.prefixes.includes('106') && t.comptes!.prefixes.includes('154'))).toBe(true);
    });

    it('FI = prix (754, 821, 822) − variation des créances 414 et 485 ; FJ = crédit 26/27 + 826 + 816 (anomalie n° 12)', () => {
      const fi = trouvePosteFluxSyscohada('FI')!;
      expect(fi.termes.map((t) => [t.signe, t.comptes?.lecture, t.comptes?.prefixes.join(',')])).toEqual([
        [1, 'SOLDE_GESTION', '754,821,822'],
        [-1, 'VARIATION_SOLDE', '414,485'],
      ]);
      const fj = trouvePosteFluxSyscohada('FJ')!;
      expect(fj.termes[0].comptes).toEqual({ prefixes: ['26', '27'], exclusions: ['276'], lecture: 'MOUVEMENT_CREDIT' });
      expect(fj.termes[1].comptes?.prefixes).toEqual(['826', '816']);
    });

    it('FF et FG déclarent 798 ET 862 : le débit du 28 porte les deux reprises (Titre VII COMPTE 28 · anomalie n° 22)', () => {
      // Le 862 est le plus gênant des deux : FA le retire de TO (ch. 7 :
      // TO = 84, 86, 88), donc la reprise HAO n'est nulle part dans la CAFG.
      for (const ref of ['FF', 'FG']) {
        const nd = trouvePosteFluxSyscohada(ref)!.nonDeterminables ?? [];
        const comptes = nd.flatMap((n) => n.comptes);
        expect({ ref, a798: comptes.includes('798'), a862: comptes.includes('862') }).toEqual({ ref, a798: true, a862: true });
      }
    });

    it('FG déclare la désactualisation du 1984 et la part « amortissements » de la réévaluation (anomalies n° 20 et 21)', () => {
      // Deux écarts de BOUCLAGE, pas de simples écarts de répartition : le
      // crédit 1984 par 6971 n'a aucun débit de classe 2 (Titre VIII ch. 6),
      // et le crédit 28 de réévaluation est dans le Δ brut sans être dans le
      // crédit 106/154 (Titre VIII ch. 28 § 4.2.4.1).
      const comptes = (trouvePosteFluxSyscohada('FG')!.nonDeterminables ?? []).flatMap((n) => n.comptes);
      expect(comptes).toContain('1984');
      expect(comptes).toContain('28');
      // FF n'a pas à les porter : le champ d'application de la réévaluation
      // (ch. 28 § 1.2) ne vise que les corporelles et les financières, et le
      // démantèlement s'impute à un composant corporel.
      const ff = (trouvePosteFluxSyscohada('FF')!.nonDeterminables ?? []).flatMap((n) => n.comptes);
      expect(ff).not.toContain('1984');
      expect(ff).not.toContain('28');
    });

    it("FJ renvoie la créance sur cession financière au 485 (lu par FI), plus jamais au 4711 (anomalie n° 9)", () => {
      // Titre VII COMPTE 82 : « crédité des produits de cession d'actif, par
      // le débit du compte de tiers 485 », sans restriction de nature · c'est
      // la répartition FI/FJ qui est faussée, pas FD/FJ.
      const comptes = (trouvePosteFluxSyscohada('FJ')!.nonDeterminables ?? []).flatMap((n) => n.comptes);
      expect(comptes).toContain('485');
      expect(comptes).not.toContain('4711');
      const fd = (trouvePosteFluxSyscohada('FD')!.nonDeterminables ?? []).flatMap((n) => n.comptes);
      expect(fd).not.toContain('4711');
    });

    it('FH lit le débit de 26 et 27 (sauf 276) et la variation du 4813 ; 4856 et 2766 ne sont cités nulle part (absents du plan)', () => {
      const fh = trouvePosteFluxSyscohada('FH')!;
      expect(fh.termes[0].comptes).toEqual({ prefixes: ['26', '27'], exclusions: ['276'], lecture: 'MOUVEMENT_DEBIT' });
      const cites = comptesCitesParLeTftSyscohada().map((c) => c.prefixe);
      expect(cites).not.toContain('4856');
      expect(cites).not.toContain('2766');
      expect(cites).not.toContain('19842');
      expect(cites).not.toContain('48161');
    });
  });

  describe('financement (ch. 5 § 1.4 · anomalies n° 5, 13, 16)', () => {
    it('FO lit le crédit de 161/162 et retranche la variation du 4713 (jamais « + débit 4713 »)', () => {
      const fo = trouvePosteFluxSyscohada('FO')!;
      expect(fo.termes[0]).toMatchObject({ signe: 1, comptes: { prefixes: ['161', '162'], lecture: 'MOUVEMENT_CREDIT' } });
      expect(fo.termes.find((t) => t.comptes?.prefixes.includes('4713'))).toMatchObject({ signe: -1, comptes: { lecture: 'VARIATION_SOLDE', sensSolde: 'DEBITEUR' } });
      expect(fo.termes.some((t) => t.comptes?.lecture === 'MOUVEMENT_DEBIT')).toBe(false);
    });

    it('FQ lit le débit de 16, 17, 181, 182 sans les intérêts courus ; FP le crédit des autres dettes sans 166/183', () => {
      const fq = trouvePosteFluxSyscohada('FQ')!;
      expect(fq.termes[0].comptes).toEqual({ prefixes: ['16', '17', '181', '182'], exclusions: ['166', '176'], lecture: 'MOUVEMENT_DEBIT' });
      const fp = trouvePosteFluxSyscohada('FP')!;
      expect(fp.termes[0].comptes?.prefixes).toEqual(['163', '164', '165', '167', '168', '181', '182']);
    });

    it('FK neutralise les incorporations (débit 11, 12, 130, 131, 106) et retranche le non-versé (109, 461, 467, 4493, 4581)', () => {
      const fk = trouvePosteFluxSyscohada('FK')!;
      expect(fk.termes[0]).toMatchObject({ signe: 1, comptes: { prefixes: ['101', '102', '105'], lecture: 'VARIATION_SOLDE', sensSolde: 'CREDITEUR' } });
      const debits = fk.termes.filter((t) => t.comptes?.lecture === 'MOUVEMENT_DEBIT').flatMap((t) => t.comptes!.prefixes);
      expect(new Set(debits)).toEqual(new Set(['11', '12', '130', '131', '106']));
      // Jamais « 13 » en bloc : une balance après clôture porterait l'écriture de solde des classes 6/7.
      expect(debits).not.toContain('13');
      const retranches = fk.termes.filter((t) => t.signe === -1 && t.comptes?.lecture === 'VARIATION_SOLDE').flatMap((t) => t.comptes!.prefixes);
      expect(new Set(retranches)).toEqual(new Set(['109', '461', '467', '4493', '4581']));
    });

    it('FK reprend au crédit le 130 EN ENTIER, symétriquement à son débit · sans quoi le 1301 reste orphelin (anomalie n° 23)', () => {
      // Titre VII COMPTE 13 : « à la réouverture […] la possibilité
      // d'utiliser un compte spécial Résultat en instance d'affectation
      // (130) », 1301 bénéfice et 1309 perte. Débit 131 / crédit 1301 puis
      // débit 1301 / crédit 11, 12, 465 : sans le crédit du 1301, FK
      // ressortait à −(bénéfice N-1) dans tout dossier passant par le 130.
      const fk = trouvePosteFluxSyscohada('FK')!;
      const credits = fk.termes.filter((t) => t.comptes?.lecture === 'MOUVEMENT_CREDIT').flatMap((t) => t.comptes!.prefixes);
      const debits = fk.termes.filter((t) => t.comptes?.lecture === 'MOUVEMENT_DEBIT').flatMap((t) => t.comptes!.prefixes);
      expect(credits).toContain('130');
      // Le 1309 n'est plus cité à part : le préfixe 130 le couvre, et le
      // citer en plus le compterait deux fois.
      expect(credits).not.toContain('1309');
      // Le 130 est le seul compte de résultat lu DANS LES DEUX SENS, et il
      // doit l'être : c'est un compte de transit, débité puis crédité du
      // même montant. Le 131, lui, n'est jamais crédité hors clôture (COMPTE
      // 13 : « crédité, à la clôture, par le débit des comptes de la classe
      // 7 »), sa contrepartie étant 101, 11, 12, 465, 103 ou 130.
      expect(debits).toContain('130');
      expect(credits).toContain('130');
      expect(credits).not.toContain('131');
    });

    it("FK et FM déclarent l'affectation d'une perte par le 103 (entité individuelle · anomalie n° 13)", () => {
      // Titre VII COMPTE 103 : « débité, à l'ouverture de l'exercice, du
      // montant de l'affectation du résultat […] par le crédit du 139 » ·
      // faux apport en FK, faux prélèvement en FM, ZD juste.
      const fk = (trouvePosteFluxSyscohada('FK')!.nonDeterminables ?? []).flatMap((n) => n.comptes);
      const fm = (trouvePosteFluxSyscohada('FM')!.nonDeterminables ?? []).flatMap((n) => n.comptes);
      expect(fk).toContain('139');
      expect(fm).toContain('103');
      // Le 103 reste lu au débit de FM : l'en sortir casserait le virement de
      // clôture 104 → 103, dont le crédit 104 est lu par FK.
      expect(trouvePosteFluxSyscohada('FM')!.termes.some((t) => t.comptes?.prefixes.includes('103'))).toBe(true);
    });

    it('FP lit le 1685 et le DIT, plutôt que de le déclarer laissé de côté', () => {
      // Le crédit 1685 (participation bloquée, COMPTE 16) neutralise la
      // charge 87 que RQ laisse dans la CAFG : l'exclure fausserait ZH.
      const fp = trouvePosteFluxSyscohada('FP')!;
      const lu = fp.termes.some((t) => t.comptes?.prefixes.some((pr) => '1685'.startsWith(pr)));
      expect(lu).toBe(true);
      expect((fp.nonDeterminables ?? []).flatMap((n) => n.comptes)).not.toContain('1685');
      expect(fp.note).toContain('1685');
    });

    it('FL = Δ14 + 799 − Δ(4494, 4582) ; FM et FN ne lisent que des débits (4619, 103, 104 ; 465)', () => {
      const fl = trouvePosteFluxSyscohada('FL')!;
      expect(fl.termes.map((t) => [t.signe, t.comptes?.lecture, t.comptes?.prefixes.join(',')])).toEqual([
        [1, 'VARIATION_SOLDE', '14'],
        [1, 'SOLDE_GESTION', '799'],
        [-1, 'VARIATION_SOLDE', '4494,4582'],
      ]);
      for (const ref of ['FM', 'FN']) {
        for (const t of trouvePosteFluxSyscohada(ref)!.termes) expect({ ref, lecture: t.comptes?.lecture, signe: t.signe }).toEqual({ ref, lecture: 'MOUVEMENT_DEBIT', signe: -1 });
      }
    });
  });

  describe('besoins de chaque poste (ce que le service laisse vide et signale)', () => {
    it("ZA et les variations de postes de bilan (FB à FG) exigent un exercice N-1 ; les autres non", () => {
      const exigent = TOUS_LES_POSTES_FLUX_SYSCOHADA.filter((p) => besoinsDuPoste(p).exerciceN1).map((p) => p.ref);
      expect(exigent).toEqual(['ZA', 'FB', 'FC', 'FD', 'FE', 'FF', 'FG']);
    });

    it('FA ne lit que le compte de résultat de N : ni N-1, ni mouvement, ni solde antérieur', () => {
      expect(besoinsDuPoste(trouvePosteFluxSyscohada('FA')!)).toEqual({ exerciceN1: false, soldesAnterieurs: false, mouvements: false });
    });

    it('FM et FN ne lisent que des mouvements ; FH à FQ n’exigent pas d’exercice N-1', () => {
      expect(besoinsDuPoste(trouvePosteFluxSyscohada('FM')!)).toEqual({ exerciceN1: false, soldesAnterieurs: false, mouvements: true });
      expect(besoinsDuPoste(trouvePosteFluxSyscohada('FN')!)).toEqual({ exerciceN1: false, soldesAnterieurs: false, mouvements: true });
      for (const ref of ['FH', 'FI', 'FJ', 'FK', 'FL', 'FO', 'FP', 'FQ']) expect({ ref, n1: besoinsDuPoste(trouvePosteFluxSyscohada(ref)!).exerciceN1 }).toEqual({ ref, n1: false });
    });
  });

  describe('rattachement des comptes du plan SYSCOHADA semé', () => {
    it('chaque préfixe cité (termes, exclusions, non-déterminables) existe réellement au plan semé', () => {
      const cites = comptesCitesParLeTftSyscohada();
      expect(cites.length).toBeGreaterThan(80);
      for (const { ref, prefixe } of cites) expect({ ref, prefixe, existe: existeAuPlan(prefixe) }).toEqual({ ref, prefixe, existe: true });
    });

    it('chaque exclusion est bien une subdivision d’un préfixe du même terme, sinon elle n’exclut rien', () => {
      for (const { ref, terme } of tousLesTermes) {
        for (const e of terme.comptes?.exclusions ?? []) {
          const couverte = terme.comptes!.prefixes.some((p) => e.startsWith(p) && e.length > p.length);
          expect({ ref, exclusion: e, couverte }).toEqual({ ref, exclusion: e, couverte: true });
        }
      }
    });

    it('les comptes sans trésorerie et les non-ventilés justifiés existent au plan et ne sont lus en mouvement ou variation par AUCUN terme', () => {
      const lusEnFlux = tousLesTermes
        .filter(({ terme }) => terme.comptes && terme.comptes.lecture !== 'SOLDE_GESTION')
        .flatMap(({ ref, terme }) => terme.comptes!.prefixes.map((prefixe) => ({ ref, prefixe, exclusions: terme.comptes!.exclusions ?? [] })));
      for (const { prefixe } of [...COMPTES_SANS_TRESORERIE_SYSCOHADA, ...COMPTES_TFT_NON_VENTILES_JUSTIFIES]) {
        expect({ prefixe, existe: existeAuPlan(prefixe) }).toEqual({ prefixe, existe: true });
        const lecteurs = lusEnFlux
          .filter((l) => (prefixe.startsWith(l.prefixe) || l.prefixe.startsWith(prefixe)) && !l.exclusions.some((e) => prefixe.startsWith(e)))
          .map((l) => l.ref);
        expect({ prefixe, lecteurs }).toEqual({ prefixe, lecteurs: [] });
      }
    });

    it('1984 est lu (FG) et 1962 est un décaissement sans poste, alors que le reste du 19 est sans trésorerie · liste granulaire, pas « 19 » en bloc', () => {
      expect(COMPTES_SANS_TRESORERIE_SYSCOHADA.some((c) => c.prefixe === '19' || c.prefixe === '196')).toBe(false);
      expect(COMPTES_SANS_TRESORERIE_SYSCOHADA.some((c) => c.prefixe === '1984' || c.prefixe === '1962')).toBe(false);
      expect(COMPTES_TFT_NON_VENTILES_JUSTIFIES.some((c) => c.prefixe === '1962')).toBe(true);
      const sous19 = comptesDetail.filter((c) => c.numero.startsWith('19')).map((c) => c.numero);
      for (const numero of sous19) {
        const couvert =
          numero.startsWith('1984') ||
          [...COMPTES_SANS_TRESORERIE_SYSCOHADA, ...COMPTES_TFT_NON_VENTILES_JUSTIFIES].some((c) => numero.startsWith(c.prefixe));
        expect({ numero, couvert }).toEqual({ numero, couvert: true });
      }
    });

    it('chaque compte de classe 1 du semis est couvert : par un terme, par un poste du circulant lu en variation, ou par une liste justifiée', () => {
      // Les classes 2 (AD/AI brut, FH/FJ), 3 (BB), 4 (BG/DP) et 5 (BT/DT)
      // sont couvertes par les postes de bilan que le tableau lit en
      // variation ; la classe 1, elle, n'est atteinte que compte par compte
      // (le 185 excepté, qui est en BJ/DM donc dans BG/DP). Un compte de
      // classe 1 hors de tout terme et de toute liste fausserait ZH en
      // silence.
      const lu = (numero: string) =>
        tousLesTermes.some(({ terme }) => terme.comptes && terme.comptes.prefixes.some((p) => numero.startsWith(p)) && !(terme.comptes.exclusions ?? []).some((e) => numero.startsWith(e)));
      const justifie = (numero: string) =>
        [...COMPTES_SANS_TRESORERIE_SYSCOHADA, ...COMPTES_TFT_NON_VENTILES_JUSTIFIES, ...COMPTES_EXCLUS_SANS_REPRISE].some((c) => numero.startsWith(c.prefixe));
      const refsCirculant = new Set(['BA', 'BB', 'BH', 'BI', 'BJ', 'DH', 'DI', 'DJ', 'DK', 'DM', 'DN']);
      const dansLeCirculant = (numero: string) =>
        [...POSTES_ACTIF_SYSCOHADA, ...POSTES_PASSIF_SYSCOHADA].some(
          (p) => refsCirculant.has(p.ref) && p.comptes.some((c) => numero.startsWith(c)) && !(p.exclusions ?? []).some((e) => numero.startsWith(e)),
        );
      const classe1 = comptesDetail.filter((c) => c.numero.startsWith('1'));
      expect(classe1.length).toBeGreaterThan(80);
      for (const c of classe1) {
        expect({ numero: c.numero, couvert: lu(c.numero) || justifie(c.numero) || dansLeCirculant(c.numero) }).toEqual({ numero: c.numero, couvert: true });
      }
      expect(dansLeCirculant('18500000')).toBe(true);
    });

    it('chaque subdivision du 478 et du 479 est lue par un terme ou nommée dans les non-ventilés (anomalie n° 24)', () => {
      // Le contrôle de couverture ne portait que sur la classe 1, ce qui a
      // laissé passer 4786, 4788, 4797, 4798 : le ch. 7 les range en BU et
      // DV, hors de BG et de DP, donc hors de tout poste du tableau, alors
      // que leur contrepartie (le 54, dans BT, ou une créance/dette de
      // BG/DP) est lue · un mouvement creusait un écart de bouclage que rien
      // n'expliquait.
      const lu = (numero: string) =>
        tousLesTermes.some(
          ({ terme }) =>
            terme.comptes && terme.comptes.prefixes.some((p) => numero.startsWith(p)) && !(terme.comptes.exclusions ?? []).some((e) => numero.startsWith(e)),
        );
      const nomme = (numero: string) =>
        [...COMPTES_TFT_NON_VENTILES_JUSTIFIES, ...COMPTES_EXCLUS_SANS_REPRISE, ...COMPTES_SANS_TRESORERIE_SYSCOHADA].some((c) => numero.startsWith(c.prefixe));
      const ecarts = comptesDetail.filter((c) => c.numero.startsWith('478') || c.numero.startsWith('479'));
      expect(ecarts.length).toBeGreaterThan(8);
      for (const c of ecarts) expect({ numero: c.numero, couvert: lu(c.numero) || nomme(c.numero) }).toEqual({ numero: c.numero, couvert: true });
      for (const orphelin of ['4786', '4788', '4797', '4798']) {
        expect({ orphelin, nomme: COMPTES_TFT_NON_VENTILES_JUSTIFIES.some((c) => c.prefixe === orphelin) }).toEqual({ orphelin, nomme: true });
      }
    });
  });

  describe('forme des libellés et des motifs', () => {
    it('reprend le demi-cadratin du modèle dans le libellé de ZA, sans jamais introduire de cadratin (CLAUDE.md §4)', () => {
      // Le modèle du ch. 5 section 2 imprime « Trésorerie actif N-1 –
      // Trésorerie passif N-1 » : un demi-cadratin, qui n'est pas le
      // cadratin interdit par le dépôt.
      expect(POSTE_TRESORERIE_OUVERTURE_SYSCOHADA.libelle).toContain('N-1 – Trésorerie passif N-1');
      const textes = [
        ...TOUS_LES_POSTES_FLUX_SYSCOHADA.flatMap((p) => [p.libelle, p.note ?? '', ...p.termes.map((t) => t.motif), ...(p.nonDeterminables ?? []).map((n) => n.motif)]),
        ...TOTAUX_FLUX_SYSCOHADA.map((t) => t.libelle),
        ...COMPTES_SANS_TRESORERIE_SYSCOHADA.map((c) => c.motif),
        ...COMPTES_TFT_NON_VENTILES_JUSTIFIES.map((c) => c.motif),
        ...COMPTES_EXCLUS_SANS_REPRISE.map((c) => c.motif),
        RENVOI_1_TFT_SYSCOHADA,
      ];
      for (const texte of textes) expect({ texte, cadratin: texte.includes('\u2014') }).toEqual({ texte, cadratin: false });
    });

    it('chaque terme porte un motif sourcé, et chaque non-déterminable dit pourquoi', () => {
      for (const { ref, terme } of tousLesTermes) expect({ ref, motif: terme.motif.length > 20 }).toEqual({ ref, motif: true });
      for (const p of TOUS_LES_POSTES_FLUX_SYSCOHADA) {
        for (const nd of p.nonDeterminables ?? []) {
          expect({ ref: p.ref, comptes: nd.comptes.length > 0, motif: nd.motif.length > 20 }).toEqual({ ref: p.ref, comptes: true, motif: true });
        }
      }
    });
  });
});
