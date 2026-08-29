import { NumerotationPiece, TypeJournal } from '@prisma/client';

/**
 * Journaux proposés automatiquement à la création d'un tenant · le minimum
 * réaliste pour démarrer une comptabilité SYCEBNL (voir le cas pratique
 * observé dans les sources Sage : ACHAT/VENTE/BANQUE/CAISSE/OD reviennent
 * systématiquement). Les comptes de trésorerie référencés ici (52110000
 * Banque, 57100000 Caisse) doivent exister · voir compte-seed.ts, seedé juste
 * avant l'appel à seedJournauxDefaut.
 */
export const JOURNAUX_DEFAUT: Array<{
  code: string;
  intitule: string;
  type: TypeJournal;
  numerotation: NumerotationPiece;
  numeroCompteTresorerie?: string;
}> = [
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
    numeroCompteTresorerie: '57100000',
  },
  { code: 'OD', intitule: 'Opérations diverses', type: TypeJournal.GENERAL, numerotation: NumerotationPiece.CONTINUE_FICHIER },
];
