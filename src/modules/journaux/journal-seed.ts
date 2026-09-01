import { NumerotationPiece, Referentiel, TypeJournal } from '@prisma/client';

/**
 * Journaux proposés automatiquement à la création d'un tenant · le minimum
 * réaliste pour démarrer une comptabilité (voir le cas pratique observé dans
 * les sources Sage : ACHAT/VENTE/BANQUE/CAISSE/OD reviennent
 * systématiquement). Les comptes de trésorerie référencés ici doivent
 * exister · voir compte-seed[-syscohada].ts, seedé juste avant l'appel à
 * seedJournauxDefaut.
 *
 * COMPTE DE CAISSE PAR RÉFÉRENTIEL · la banque est 5211 (« Banques en
 * monnaie nationale ») dans les deux plans, mais la caisse diverge : au
 * SYCEBNL, 571 « Caisse siège social » est lui-même le compte d'imputation
 * (57100000) ; au SYSCOHADA, 571 est subdivisé et la feuille est 5711
 * « Caisse en monnaie nationale » (57110000). Un 57100000 semé sur un
 * dossier SYSCOHADA ne correspondrait à aucun compte et le journal de
 * caisse naîtrait sans compte de contrepartie · c'est le spec
 * compte-seed-syscohada.spec.ts qui a attrapé l'écart.
 */
export function journauxDefaut(referentiel: Referentiel): Array<{
  code: string;
  intitule: string;
  type: TypeJournal;
  numerotation: NumerotationPiece;
  numeroCompteTresorerie?: string;
}> {
  const caisse = referentiel === Referentiel.SYSCOHADA ? '57110000' : '57100000';
  return [
    { code: 'ACH', intitule: 'Achats', type: TypeJournal.ACHATS, numerotation: NumerotationPiece.CONTINUE_JOURNAL },
    { code: 'VEN', intitule: 'Ventes', type: TypeJournal.VENTES, numerotation: NumerotationPiece.CONTINUE_JOURNAL },
    {
      code: 'BQ',
      intitule: 'Banque',
      type: TypeJournal.TRESORERIE,
      numerotation: NumerotationPiece.MENSUELLE,
      numeroCompteTresorerie: '52110000',
    },
    {
      code: 'CA',
      intitule: 'Caisse',
      type: TypeJournal.TRESORERIE,
      numerotation: NumerotationPiece.MENSUELLE,
      numeroCompteTresorerie: caisse,
    },
    { code: 'OD', intitule: 'Opérations diverses', type: TypeJournal.GENERAL, numerotation: NumerotationPiece.CONTINUE_FICHIER },
  ];
}
