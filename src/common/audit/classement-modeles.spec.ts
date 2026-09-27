import { Prisma } from '@prisma/client';
import { COLONNES_EXCLUES_PAR_MODELE, MODELES_AUDITES, NON_AUDITES_MOTIVES } from './champs-audites';

/**
 * CHAQUE MODÈLE DU SCHÉMA EST CLASSÉ, UN PAR UN.
 *
 * Quinze tables de même nature que les auditées (dépréciation, facture,
 * consignation, engagement de dépense, mandat de l'auditeur…) étaient
 * restées hors du journal sans que personne l'ait décidé · une liste qu'on
 * complète « quand on y pense » est une liste qui oublie. Le schéma est donc
 * relu à chaque exécution (DMMF, la même source que le client Prisma), et un
 * modèle ajouté demain fait tomber ce test tant que quelqu'un n'a pas écrit,
 * soit qu'il est journalisé, soit pourquoi il ne l'est pas.
 */

const MODELES_DU_SCHEMA = Prisma.dmmf.datamodel.models.map((m) => m.name);

describe('classement des modèles au journal d’audit', () => {
  it('le schéma porte bien des modèles · un recensement vide ne vérifierait rien', () => {
    expect(MODELES_DU_SCHEMA.length).toBeGreaterThan(100);
  });

  it.each(MODELES_DU_SCHEMA)('%s est journalisé OU exempté avec son motif, jamais les deux', (modele) => {
    const audite = MODELES_AUDITES.has(modele);
    const exempte = Object.prototype.hasOwnProperty.call(NON_AUDITES_MOTIVES, modele);
    expect([modele, audite !== exempte]).toEqual([modele, true]);
  });

  it('aucune entrée ne nomme un modèle que le schéma ne porte plus', () => {
    const connus = new Set(MODELES_DU_SCHEMA);
    const perimes = [...MODELES_AUDITES, ...Object.keys(NON_AUDITES_MOTIVES)].filter((m) => !connus.has(m));
    expect(perimes).toEqual([]);
  });

  it.each(Object.entries(NON_AUDITES_MOTIVES))('le motif de %s est écrit', (modele, motif) => {
    expect([modele, motif.trim().length > 20]).toEqual([modele, true]);
  });

  it('les quinze tables relevées par l’audit serveur (point I4) sont TRANCHÉES', () => {
    // La présence dans l'une des deux listes suffit · c'est la décision qui
    // manquait, pas un sens particulier.
    for (const m of [
      'DotationAmortissement',
      'AmortissementDerogatoire',
      'ReclassementImmobilisation',
      'DepreciationImmobilisation',
      'Facture',
      'Consignation',
      'MouvementStock',
      'EngagementDepense',
      'ExecutionEngagement',
      'ConventionFinancement',
      'DossierFiscalExercice',
      'LotVirement',
      'CoursDevise',
      'ModeleReglement',
      'MandatAuditeur',
    ]) {
      expect([m, MODELES_AUDITES.has(m) || m in NON_AUDITES_MOTIVES]).toEqual([m, true]);
    }
  });

  it('un modèle journalisé qui porte une colonne BINAIRE l’exclut nommément', () => {
    // Le cas de DocumentTiers.contenu · cinq mégaoctets recopiés dans chaque
    // événement, lisibles par tout le dossier. Un modèle ajouté au journal
    // avec une colonne de ce type doit dire qu'il ne la recopie pas.
    const oublis = Prisma.dmmf.datamodel.models
      .filter((m) => MODELES_AUDITES.has(m.name))
      .flatMap((m) =>
        m.fields
          .filter((f) => f.kind === 'scalar' && f.type === 'Bytes')
          .filter((f) => !(COLONNES_EXCLUES_PAR_MODELE[m.name] ?? []).includes(f.name))
          .map((f) => `${m.name}.${f.name}`),
      );
    expect(oublis).toEqual([]);
  });
});
