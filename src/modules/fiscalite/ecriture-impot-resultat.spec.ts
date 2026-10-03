import { FormeJuridiqueSyscohada, TypeCompteDetailTotal } from '@prisma/client';
import { PLAN_COMPTES_SYSCOHADA } from '../comptes/compte-seed-syscohada';
import { PLAN_COMPTES_SYCEBNL } from '../comptes/compte-seed';
import {
  COMPTES_IMPOT_RESULTAT,
  CONDITIONS_A_DECLARER,
  EntreeConstatImpot,
  compteDeLaCharge,
  imputationAcomptes,
  lignesConstat,
  montantFiscal,
  motifsRefusConstat,
} from './ecriture-impot-resultat';
import { FiscaliteService } from './fiscalite.service';

/**
 * Ligne A11 · l'écriture de l'impôt sur le résultat. Ce que ces tests gèlent
 * est ce qui casserait EN SILENCE · un mauvais compte (le plan est faux sans
 * qu'aucun total ne bouge), les acomptes retranchés de la charge (impôt de
 * l'exercice minoré au compte de résultat), un impôt non chiffré passé à zéro.
 */

const base: EntreeConstatImpot = {
  formeJuridique: FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE,
  regime: 'IMPOT_SOCIETES',
  impotDu: 3_000_000,
  minimumApplique: false,
  simulationAvantLaLoi: false,
  exerciceClos: false,
  brouillardGestion: 0,
  impotDejaConstate: 0,
  impotConstateAu89: 0,
  reintegrationsImpot: 0,
  attestationRegime: null,
};

describe('comptes de l’écriture · relus au semis', () => {
  const parNumero = new Map(PLAN_COMPTES_SYSCOHADA.map((l) => [l.numero, l]));

  it('les quatre comptes existent au semis SYSCOHADA, en détail, sous l’intitulé que la fiche nomme', () => {
    const attendus: Array<[string, RegExp]> = [
      [COMPTES_IMPOT_RESULTAT.charge, /Activités exercées dans l.État/],
      [COMPTES_IMPOT_RESULTAT.chargeMinimum, /Impôt minimum forfaitaire/],
      [COMPTES_IMPOT_RESULTAT.dette, /État, impôt sur les bénéfices/],
      [COMPTES_IMPOT_RESULTAT.acomptes, /avances et acomptes versés sur impôts/],
    ];
    for (const [numero, intitule] of attendus) {
      const ligne = parNumero.get(numero);
      expect(ligne).toBeDefined();
      expect(ligne!.typeCompte ?? TypeCompteDetailTotal.DETAIL).toBe(TypeCompteDetailTotal.DETAIL);
      expect(ligne!.intitule).toMatch(intitule);
    }
    // Le 891 est un EN-TÊTE (subdivisé 8911 à 8913) · on n'impute jamais un total.
    expect(parNumero.get('891')?.typeCompte).toBe(TypeCompteDetailTotal.TOTAL);
  });

  it('le SYCEBNL n’ouvre aucun 89 · l’EBNL est exemptée (loi n° 23/053, art. 5), la route lui est fermée', () => {
    expect(PLAN_COMPTES_SYCEBNL.some((l) => l.numero.startsWith('89'))).toBe(false);
  });
});

describe('lignes de l’écriture · fiche du compte 89 et art. 57 bis LPF', () => {
  it('D 8911 / C 441 pour l’impôt ENTIER, sans acompte retranché (fiche du 89, « quelles que soient les modalités de règlement »)', () => {
    expect(lignesConstat(180, false, 0)).toEqual([
      expect.objectContaining({ numero: '89110000', debit: 180, credit: 0 }),
      expect.objectContaining({ numero: '44100000', debit: 0, credit: 180 }),
    ]);
  });

  it('l’impôt minimum retenu va au 895 (loi n° 23/053, art. 45 et 57)', () => {
    expect(compteDeLaCharge(true)).toBe('89500000');
    expect(compteDeLaCharge(false)).toBe('89110000');
    expect(lignesConstat(50, true, 0)[0].numero).toBe('89500000');
  });

  it('l’imputation demandée est une seconde paire D 441 / C 4492, la charge reste entière', () => {
    const lignes = lignesConstat(180, false, 160);
    expect(lignes).toHaveLength(4);
    expect(lignes[0]).toMatchObject({ numero: '89110000', debit: 180 });
    expect(lignes[2]).toMatchObject({ numero: '44100000', debit: 160 });
    expect(lignes[3]).toMatchObject({ numero: '44920000', credit: 160 });
    const debits = lignes.reduce((s, l) => s + l.debit, 0);
    const credits = lignes.reduce((s, l) => s + l.credit, 0);
    expect(debits).toBe(credits);
  });
});

describe('imputation des acomptes · bornée par le déclaré, le 4492 et l’impôt', () => {
  it('rend le plus petit du déclaré et de l’impôt · l’excédent reste au 4492 (art. 57 ter LPF)', () => {
    expect(imputationAcomptes({ declares: 160, solde4492: 160, impot: 180 })).toEqual({ montant: 160, motifRefus: null });
    expect(imputationAcomptes({ declares: 200, solde4492: 250, impot: 180 })).toEqual({ montant: 180, motifRefus: null });
  });

  it('refuse sans acompte déclaré, sans 4492 débiteur, ou au-delà du 4492 (jamais un 4492 créditeur)', () => {
    expect(imputationAcomptes({ declares: 0, solde4492: 100, impot: 180 }).motifRefus).toMatch(/Aucun acompte/);
    expect(imputationAcomptes({ declares: 100, solde4492: 0, impot: 180 }).motifRefus).toMatch(/4492/);
    expect(imputationAcomptes({ declares: 150, solde4492: 100, impot: 180 }).motifRefus).toMatch(/créditeur/);
  });
});

describe('motifs de refus · un impôt non chiffré n’est jamais zéro', () => {
  it('une société au régime de l’IS, calcul complet · aucun motif', () => {
    expect(motifsRefusConstat(base)).toEqual([]);
  });

  it('une personne physique est refusée (art. 3), de même une forme non renseignée', () => {
    for (const forme of [FormeJuridiqueSyscohada.ENTREPRISE_INDIVIDUELLE, FormeJuridiqueSyscohada.ENTREPRENANT]) {
      expect(motifsRefusConstat({ ...base, formeJuridique: forme })[0]).toMatch(/personne physique/);
    }
    expect(motifsRefusConstat({ ...base, formeJuridique: null })[0]).toMatch(/forme juridique/);
  });

  it('impôt null ou nul · refus nommé, jamais une écriture à zéro', () => {
    expect(motifsRefusConstat({ ...base, impotDu: null }).join(' ')).toMatch(/pas chiffré/);
    expect(motifsRefusConstat({ ...base, impotDu: 0 }).join(' ')).toMatch(/nul/);
  });

  it('exercice d’avant la loi, exercice clos, brouillard de gestion · refusés', () => {
    expect(motifsRefusConstat({ ...base, simulationAvantLaLoi: true }).join(' ')).toMatch(/SIMULATION/);
    expect(motifsRefusConstat({ ...base, exerciceClos: true }).join(' ')).toMatch(/clôturé/);
    expect(motifsRefusConstat({ ...base, brouillardGestion: 2 }).join(' ')).toMatch(/2 écriture\(s\) au brouillard/);
  });

  it('un impôt déjà au 891 ou au 895 hors module refuse (pas deux fois pour un exercice)', () => {
    expect(motifsRefusConstat({ ...base, impotDejaConstate: 500, impotConstateAu89: 500 }).join(' ')).toMatch(/déjà constaté/);
  });

  it('un 89 non réintégré à sa mesure fausse la base · refus dans les deux sens', () => {
    expect(motifsRefusConstat({ ...base, impotConstateAu89: 40 }).join(' ')).toMatch(/réintégration/);
    expect(motifsRefusConstat({ ...base, reintegrationsImpot: 40 }).join(' ')).toMatch(/réintégration/);
    expect(motifsRefusConstat({ ...base, impotConstateAu89: 40, reintegrationsImpot: 40 })).toEqual([]);
  });

  it('personne physique · le refus renvoie au 1043 (AUDCIF, compte 104)', () => {
    expect(motifsRefusConstat({ ...base, formeJuridique: FormeJuridiqueSyscohada.ENTREPRISE_INDIVIDUELLE }).join(' ')).toMatch(/1043/);
  });

  it('acomptes passés au 441 selon le Guide · le refus d’imputation le dit, rien à imputer', () => {
    expect(imputationAcomptes({ declares: 160, solde4492: 0, impot: 180 }).motifRefus).toMatch(/Acomptes passés au 441[^·]*rien à imputer/);
  });

  it('forme dont l’assujettissement tient à un fait · attestation exigée au clic, pas à la lecture', () => {
    for (const forme of Object.keys(CONDITIONS_A_DECLARER) as FormeJuridiqueSyscohada[]) {
      expect(motifsRefusConstat({ ...base, formeJuridique: forme, attestationRegime: null }).join(' ')).toMatch(/Assujettissement à déclarer/);
      expect(motifsRefusConstat({ ...base, formeJuridique: forme, attestationRegime: undefined })).toEqual([]);
      expect(
        motifsRefusConstat({ ...base, formeJuridique: forme, attestationRegime: 'Option levée en AG du 12 mars 2026' }),
      ).toEqual([]);
    }
    // Les cinq sociétés de l'art. 3 (SA, SARL, SAS) n'ont rien à déclarer.
    expect(CONDITIONS_A_DECLARER.SOCIETE_ANONYME).toBeUndefined();
    expect(CONDITIONS_A_DECLARER.SOCIETE_RESPONSABILITE_LIMITEE).toBeUndefined();
    expect(CONDITIONS_A_DECLARER.SOCIETE_PAR_ACTIONS_SIMPLIFIEE).toBeUndefined();
  });
});

describe('observation · l’impôt déduit de son propre calcul (art. 45 et 50, 2°)', () => {
  it('se tait quand le 89 égale sa réintégration, parle dans les deux sens sinon', () => {
    expect(FiscaliteService.observationImpotNonReintegre(0, 0)).toBeNull();
    expect(FiscaliteService.observationImpotNonReintegre(180, 180)).toBeNull();
    expect(FiscaliteService.observationImpotNonReintegre(180, 0)).toMatch(/écart 180,00/);
    expect(FiscaliteService.observationImpotNonReintegre(0, 180)).toMatch(/écart -180,00/);
  });

  it('le même formateur que le motif jumeau du constat (montants à deux décimales)', () => {
    const motif = motifsRefusConstat({ ...base, impotConstateAu89: 180 }).join(' ');
    expect(motif).toContain(montantFiscal(180));
    expect(FiscaliteService.observationImpotNonReintegre(180, 0)).toContain(montantFiscal(180));
    // L'autre issue est nommée, pas seulement « ajustez ».
    expect(motif).toMatch(/ligne libre/);
    expect(motif).toMatch(/reclasse au 89/);
  });

  it('le dégrèvement au 899 est NOMMÉ, jamais déduit · son sort fiscal est au cabinet (art. 45 a contrario)', () => {
    expect(FiscaliteService.observationDegrevement(0)).toBeNull();
    const obs = FiscaliteService.observationDegrevement(500)!;
    expect(obs).toMatch(/DÉGRÈVEMENT AU 899/);
    expect(obs).toContain(montantFiscal(500));
    expect(obs).toMatch(/relève du cabinet/);
    expect(obs).toMatch(/Rien n'est déduit d'office/);
  });

  it('ne compte que les réintégrations du code IMPOT_SUR_LE_RESULTAT', () => {
    expect(
      FiscaliteService.reintegrationsImpot([
        { code: 'IMPOT_SUR_LE_RESULTAT', sens: 'REINTEGRATION', montant: '100' },
        { code: 'IMPOT_SUR_LE_RESULTAT', sens: 'REINTEGRATION', montant: 80 },
        { code: 'AMENDES_PENALITES', sens: 'REINTEGRATION', montant: 999 },
      ] as never),
    ).toBe(180);
  });
});
