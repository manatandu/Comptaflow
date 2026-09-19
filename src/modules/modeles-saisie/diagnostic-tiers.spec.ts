import { Referentiel } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { diagnostiquerTiers, type LigneADiagnostiquer } from './diagnostic-tiers';

/**
 * LE MODÈLE DU CABINET N'AVAIT AUCUNE GARDE DE TIERS.
 *
 * Les modèles écrits dans le code ont été corrigés le 2026-09-18 ; ceux que
 * le cabinet fabrique lui-même passaient par `verifierLignes`, qui contrôle
 * l'existence des comptes, leur imputabilité et la présence d'un débit et
 * d'un crédit. Rien sur le tiers. Un modèle « Achat » soldé sur la banque
 * s'enregistrait, et engendrait ensuite une écriture fautive à chaque appel.
 */

const l = (numero: string, sens: 'DEBIT' | 'CREDIT'): LigneADiagnostiquer => ({ numero, sens });

describe('Diagnostic du tiers · un modèle qui solde une charge sur la trésorerie', () => {
  it('signale un achat soldé directement sur la banque', () => {
    const a = diagnostiquerTiers(
      [l('60110000', 'DEBIT'), l('52100000', 'CREDIT')],
      Referentiel.SYSCOHADA,
    );
    expect(a).toHaveLength(1);
    expect(a[0]).toContain('60110000');
    expect(a[0]).toContain('DIRECTEMENT');
    // Le texte du dossier, jamais celui de l'autre référentiel.
    expect(a[0]).toContain('contrepartie systématique = 401');
    expect(a[0]).not.toContain('SYCEBNL');
  });

  it('cite le SYCEBNL à un dossier SYCEBNL, et jamais le Guide du SYSCOHADA', () => {
    const a = diagnostiquerTiers(
      [l('60110000', 'DEBIT'), l('57100000', 'CREDIT')],
      Referentiel.SYCEBNL,
    );
    expect(a).toHaveLength(1);
    expect(a[0]).toContain('fonctionnement du compte 40');
    expect(a[0]).not.toContain('Recommandation SYSCOHADA');
  });

  it('signale aussi une VENTE encaissée sans créance client', () => {
    const a = diagnostiquerTiers(
      [l('52100000', 'DEBIT'), l('70110000', 'CREDIT')],
      Referentiel.SYSCOHADA,
    );
    expect(a).toHaveLength(1);
    expect(a[0]).toContain('Le PRODUIT');
    expect(a[0]).toContain('70110000');
  });

  it('DIT qu’il n’empêche rien · c’est un avertissement, pas un refus', () => {
    const a = diagnostiquerTiers(
      [l('60110000', 'DEBIT'), l('52100000', 'CREDIT')],
      Referentiel.SYSCOHADA,
    );
    expect(a[0]).toContain("N'EMPÊCHE PAS");
    // Et il nomme les deux cas légitimes, pour ne pas se faire ignorer.
    expect(a[0]).toContain('frais bancaires');
    expect(a[0]).toContain('don manuel');
  });
});

describe('Diagnostic du tiers · ce qui NE déclenche rien', () => {
  it('un modèle qui porte déjà un compte de tiers', () => {
    // Achat correct · charge au débit, fournisseur au crédit.
    expect(
      diagnostiquerTiers([l('60110000', 'DEBIT'), l('40110000', 'CREDIT')], Referentiel.SYSCOHADA),
    ).toEqual([]);
  });

  it('une facture réglée partiellement le jour même · le tiers y est nommé', () => {
    expect(
      diagnostiquerTiers(
        [l('60110000', 'DEBIT'), l('40110000', 'CREDIT'), l('52100000', 'CREDIT')],
        Referentiel.SYSCOHADA,
      ),
    ).toEqual([]);
  });

  it('un virement interne · deux comptes de trésorerie, aucun compte de nature', () => {
    expect(
      diagnostiquerTiers([l('52100000', 'DEBIT'), l('57100000', 'CREDIT')], Referentiel.SYSCOHADA),
    ).toEqual([]);
  });

  it('un règlement de fournisseur · le tiers au débit, la trésorerie au crédit', () => {
    expect(
      diagnostiquerTiers([l('40110000', 'DEBIT'), l('52100000', 'CREDIT')], Referentiel.SYSCOHADA),
    ).toEqual([]);
  });

  it('une charge CRÉDITÉE n’est pas une charge débitée · un avoir ne se diagnostique pas ici', () => {
    // Le déclencheur est la charge DÉBITÉE ou le produit CRÉDITÉ · c'est le
    // sens de l'opération que les deux textes décrivent. Un avoir prend
    // l'autre sens et relève d'une autre lecture, qu'aucune source lue ne
    // donne pour ce module.
    expect(
      diagnostiquerTiers([l('52100000', 'DEBIT'), l('60110000', 'CREDIT')], Referentiel.SYSCOHADA),
    ).toEqual([]);
  });
});

describe('Diagnostic du tiers · le don manuel, et le piège du 704', () => {
  it('un don reçu en numéraire ne déclenche RIEN au SYCEBNL', () => {
    // SYCEBNL, Partie 3 ch. 4 § 3 · le don est « une remise de fonds sans
    // contrepartie ». Il n'a pas de débiteur : le fait générateur est la
    // remise elle-même.
    expect(
      diagnostiquerTiers([l('57100000', 'DEBIT'), l('70410000', 'CREDIT')], Referentiel.SYCEBNL),
    ).toEqual([]);
  });

  it('LE MÊME 70410000 EST SIGNALÉ AU SYSCOHADA · un numéro, deux sens', () => {
    /*
      DIX-SEPTIÈME OCCURRENCE DU PREMIER PIÈGE DU DÉPÔT, et la première qu'une
      EXCEPTION aurait pu fabriquer. Le 7041 est « Revenus liés à la
      générosité · dons » au plan SYCEBNL et « Ventes de produits résiduels »
      au plan SYSCOHADA. Exempter le 704 sans regarder le référentiel
      dispenserait une société de tiers sur ses ventes de déchets, et
      l'écriture serait parfaitement équilibrée.
    */
    const a = diagnostiquerTiers(
      [l('52100000', 'DEBIT'), l('70410000', 'CREDIT')],
      Referentiel.SYSCOHADA,
    );
    expect(a).toHaveLength(1);
    expect(a[0]).toContain('70410000');
  });

  it('les deux intitulés sont bien ceux des deux semis · la prémisse se vérifie', () => {
    // CE QU'ON AFFIRME DU PLAN SE VÉRIFIE CONTRE LE PLAN (règle sortie de la
    // passe F2b) · le test précédent ne prouve rien si le 7041 ne veut pas
    // réellement dire deux choses.
    const racine = join(__dirname, '..', '..', '..');
    const sycebnl = readFileSync(join(racine, 'src/modules/comptes/compte-seed.ts'), 'utf8');
    const syscohada = readFileSync(
      join(racine, 'src/modules/comptes/compte-seed-syscohada.ts'),
      'utf8',
    );
    expect(sycebnl).toContain("'70410000', 'Revenus liés à la générosité · dons'");
    expect(syscohada).toContain('Ventes de produits résiduels');
  });
});
