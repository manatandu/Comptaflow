import {
  analyserPerimetre,
  EntitePerimetre,
  LienParticipation,
  verdictDateCloture,
  verdictObligation,
} from './perimetre-consolidation';

/**
 * LE PÉRIMÈTRE (AUDCIF art. 74 à 98, D4C ch. XII-1, XII-2, XII-5 § 3). Chaque
 * cas porte UNE règle du texte · un test qui en porterait trois ne dirait pas
 * laquelle a cassé.
 */
const M: EntitePerimetre = { id: 'M', nom: 'Mère', estConsolidante: true, dateCloture: new Date('2026-12-31') };
const ent = (id: string, extra: Partial<EntitePerimetre> = {}): EntitePerimetre => ({ id, nom: id, estConsolidante: false, ...extra });
const lien = (d: string, t: string, vote: number, capital = vote): LienParticipation => ({
  detentriceId: d,
  detenueId: t,
  pctDroitsVote: vote,
  pctCapital: capital,
});
const par = (r: ReturnType<typeof analyserPerimetre>, id: string) => r.find((x) => x.id === id)!;

describe('pourcentage de contrôle et méthode (art. 78 et 80)', () => {
  it('plus de 50 % des droits de vote · contrôle exclusif de droit, intégration globale', () => {
    const r = analyserPerimetre([M, ent('A')], [lien('M', 'A', 80)]);
    expect(par(r, 'A')).toMatchObject({ pctControle: 80, pctInteret: 80, natureControle: 'EXCLUSIF_DE_DROIT', methode: 'IG' });
  });

  it('exactement 50 % n’est pas « la majorité »', () => {
    const r = analyserPerimetre([M, ent('A')], [lien('M', 'A', 50)]);
    expect(par(r, 'A').methode).toBe('ME');
  });

  it('le contrôle indirect passe par une filiale CONTRÔLÉE, et le pourcentage d’intérêt multiplie la chaîne', () => {
    const r = analyserPerimetre([M, ent('A'), ent('B')], [lien('M', 'A', 80), lien('A', 'B', 60)]);
    expect(par(r, 'B')).toMatchObject({ pctControle: 60, pctInteret: 48, methode: 'IG' });
  });

  it('il ne passe PAS par une entité seulement sous influence notable', () => {
    const r = analyserPerimetre([M, ent('A'), ent('B')], [lien('M', 'A', 30), lien('A', 'B', 60)]);
    expect(par(r, 'A').methode).toBe('ME');
    expect(par(r, 'B')).toMatchObject({ pctControle: 0, methode: 'NC' });
  });

  it('plusieurs chaînes · les contrôles s’additionnent, les intérêts se somment chaîne par chaîne', () => {
    const r = analyserPerimetre([M, ent('A'), ent('B')], [lien('M', 'A', 80), lien('M', 'B', 20), lien('A', 'B', 40)]);
    expect(par(r, 'B')).toMatchObject({ pctControle: 60, pctInteret: 52, methode: 'IG' });
  });

  it('l’intérêt ne remonte pas par une entité laissée hors du périmètre', () => {
    const r = analyserPerimetre([M, ent('A'), ent('B')], [lien('M', 'A', 10), lien('M', 'B', 60), lien('A', 'B', 30)]);
    expect(par(r, 'A').methode).toBe('NC');
    expect(par(r, 'B')).toMatchObject({ pctControle: 60, pctInteret: 60 });
  });

  it('droits de vote et capital sont deux grandeurs · le contrôle lit les votes, l’intérêt le capital', () => {
    const r = analyserPerimetre([M, ent('A')], [lien('M', 'A', 60, 45)]);
    expect(par(r, 'A')).toMatchObject({ pctControle: 60, pctInteret: 45, methode: 'IG' });
  });

  it('contrôle de fait · au-delà de 40 % il faut les DEUX faits déclarés, sinon hors périmètre et le dire', () => {
    const sans = analyserPerimetre([M, ent('A')], [lien('M', 'A', 45)]);
    expect(par(sans, 'A').methode).toBe('ME');
    const avecUnSeul = analyserPerimetre([M, ent('A', { designationMajoriteDeuxExercices: true })], [lien('M', 'A', 45)]);
    expect(par(avecUnSeul, 'A').methode).toBe('ME');
    const avec = analyserPerimetre(
      [M, ent('A', { designationMajoriteDeuxExercices: true, aucunAutreAssocieSuperieur: true })],
      [lien('M', 'A', 45)],
    );
    expect(par(avec, 'A')).toMatchObject({ natureControle: 'EXCLUSIF_DE_FAIT', methode: 'IG' });
    const a40 = analyserPerimetre(
      [M, ent('A', { designationMajoriteDeuxExercices: true, aucunAutreAssocieSuperieur: true })],
      [lien('M', 'A', 40)],
    );
    expect(par(a40, 'A').methode).toBe('ME');
  });

  it('contrôle conjoint · jamais présumé d’un pourcentage, il suppose l’accord déclaré', () => {
    expect(par(analyserPerimetre([M, ent('A')], [lien('M', 'A', 50)]), 'A').methode).toBe('ME');
    expect(par(analyserPerimetre([M, ent('A', { accordControleConjoint: true })], [lien('M', 'A', 50)]), 'A')).toMatchObject({
      natureControle: 'CONJOINT',
      methode: 'IP',
    });
  });

  it('influence notable · présumée à 20 %, déclarable en dessous, et alors à justifier', () => {
    expect(par(analyserPerimetre([M, ent('A')], [lien('M', 'A', 20)]), 'A').methode).toBe('ME');
    expect(par(analyserPerimetre([M, ent('A')], [lien('M', 'A', 19.99)]), 'A').methode).toBe('NC');
    const declaree = par(analyserPerimetre([M, ent('A', { influenceNotableDeclaree: true })], [lien('M', 'A', 10)]), 'A');
    expect(declaree.methode).toBe('ME');
    expect(declaree.aJustifierEnNotes.join(' ')).toContain('moins de 20 %');
  });

  it('contrôle contractuel · intégration globale même à 10 %, justification réclamée', () => {
    const r = par(analyserPerimetre([M, ent('A', { controleContractuel: true })], [lien('M', 'A', 10)]), 'A');
    expect(r).toMatchObject({ natureControle: 'EXCLUSIF_CONTRACTUEL', methode: 'IG' });
    expect(r.aJustifierEnNotes.join(' ')).toContain('40 % des droits de vote ou moins');
  });
});

describe('exclusions (art. 96)', () => {
  it('une filiale exclue pour importance négligeable reste contrôlée · sa sous-filiale aussi', () => {
    const r = analyserPerimetre(
      [M, ent('A', { exclusion: { motif: 'IMPORTANCE_NEGLIGEABLE', justification: 'CA 0,2 % du groupe' } }), ent('B')],
      [lien('M', 'A', 70), lien('A', 'B', 60)],
    );
    expect(par(r, 'A').methode).toBe('EXCLUE');
    expect(par(r, 'A').aJustifierEnNotes.join(' ')).toContain('art. 96');
    expect(par(r, 'B')).toMatchObject({ pctControle: 60, pctInteret: 42, methode: 'IG' });
  });

  it('la perte de contrôle démontrée rompt la chaîne', () => {
    const r = analyserPerimetre(
      [M, ent('A', { exclusion: { motif: 'PERTE_CONTROLE_DEMONTREE', justification: 'Administrateur judiciaire' } }), ent('B')],
      [lien('M', 'A', 70), lien('A', 'B', 60)],
    );
    expect(par(r, 'B')).toMatchObject({ pctControle: 0, methode: 'NC' });
  });
});

describe('autocontrôle et participations croisées', () => {
  it('les titres d’autocontrôle sur la consolidante sont ignorés (D4C ch. XII-5 § 3)', () => {
    const r = analyserPerimetre([M, ent('A')], [lien('M', 'A', 80), lien('A', 'M', 5)]);
    expect(par(r, 'A')).toMatchObject({ pctControle: 80, pctInteret: 80 });
    expect(par(r, 'M')).toMatchObject({ pctInteret: 100 });
  });

  it('des participations croisées entre filiales sont refusées, nommées', () => {
    expect(() => analyserPerimetre([M, ent('A'), ent('B')], [lien('M', 'A', 80), lien('A', 'B', 30), lien('B', 'A', 10)])).toThrow(
      /Participations croisées entre filiales \(A → B → A|B → A → B\)/,
    );
  });
});

describe('dates de clôture (art. 97)', () => {
  it('même date, trois mois exactement, trois mois et un jour', () => {
    expect(verdictDateCloture(new Date('2026-12-31'), new Date('2026-12-31')).verdict).toBe('MEME_DATE');
    expect(verdictDateCloture(new Date('2026-12-31'), new Date('2026-09-30')).verdict).toBe('DEROGATION_POSSIBLE');
    expect(verdictDateCloture(new Date('2026-12-31'), new Date('2026-09-29')).verdict).toBe('ETATS_SUPPLEMENTAIRES');
    expect(verdictDateCloture(new Date('2026-06-30'), new Date('2026-09-30')).verdict).toBe('DEROGATION_POSSIBLE');
  });

  it('fin de mois contre fin de mois · le 30 novembre mène au 28 février, pas au 2 mars', () => {
    expect(verdictDateCloture(new Date('2027-02-28'), new Date('2026-11-30')).verdict).toBe('DEROGATION_POSSIBLE');
    expect(verdictDateCloture(new Date('2027-03-01'), new Date('2026-11-30')).verdict).toBe('ETATS_SUPPLEMENTAIRES');
    expect(verdictDateCloture(new Date('2026-12-15'), new Date('2026-09-15')).verdict).toBe('DEROGATION_POSSIBLE');
    expect(verdictDateCloture(new Date('2026-12-16'), new Date('2026-09-15')).verdict).toBe('ETATS_SUPPLEMENTAIRES');
  });

  it('est rendue pour les entités retenues', () => {
    const r = analyserPerimetre([M, ent('A', { dateCloture: new Date('2026-06-30') })], [lien('M', 'A', 80)]);
    expect(par(r, 'A').dateCloture?.verdict).toBe('ETATS_SUPPLEMENTAIRES');
  });
});

describe('obligation et dispenses (art. 74, 75, 77, 95)', () => {
  const avecIG = analyserPerimetre([M, ent('A')], [lien('M', 'A', 80)]);
  const sansIG = analyserPerimetre([M, ent('A')], [lien('M', 'A', 25)]);
  const seuil = { seuilEquivalentFc: 1_000_000, sourceSeuil: 'test' };

  it('l’influence notable seule n’oblige pas (art. 74, al. 2)', () => {
    expect(verdictObligation(sansIG, {}).obligation).toBe('NON_REQUISE');
  });

  it('art. 77 · dispensée sous une consolidante OHADA, sauf les trois exceptions', () => {
    expect(verdictObligation(avecIG, { sousControleEntiteOhadaConsolidante: true }).obligation).toBe('DISPENSEE');
    for (const exception of [{ siegesDansDeuxRegions: true }, { appelPublicEpargne: true }, { demandeAssociesDixieme: true }]) {
      const v = verdictObligation(avecIG, { sousControleEntiteOhadaConsolidante: true, ...exception, ...seuil, chiffreAffairesN: 2e6, chiffreAffairesN1: 2e6 });
      expect(v.obligation).toBe('OBLIGATOIRE');
    }
  });

  it('art. 95 · sans équivalent en francs déclaré, la dispense n’est pas examinée', () => {
    expect(verdictObligation(avecIG, { chiffreAffairesN: 1, chiffreAffairesN1: 1 }).obligation).toBe('A_EXAMINER');
  });

  it('art. 95 · sous le seuil DEUX exercices de suite, dispensée ; un seul au-dessus suffit à l’obliger', () => {
    expect(verdictObligation(avecIG, { ...seuil, chiffreAffairesN: 900_000, chiffreAffairesN1: 1_000_000 }).obligation).toBe('DISPENSEE');
    expect(verdictObligation(avecIG, { ...seuil, chiffreAffairesN: 900_000, chiffreAffairesN1: 1_000_001 }).obligation).toBe('OBLIGATOIRE');
    expect(verdictObligation(avecIG, { ...seuil, chiffreAffairesN: 900_000 }).obligation).toBe('A_EXAMINER');
  });

  it('art. 75, al. 2 · appel public à l’épargne, normes IFRS', () => {
    expect(verdictObligation(avecIG, { appelPublicEpargne: true }).normesIfrsRequises).toBe(true);
    expect(verdictObligation(avecIG, {}).normesIfrsRequises).toBe(false);
  });
});
