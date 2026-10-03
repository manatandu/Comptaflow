// Aucun import de « vitest » · convention du dépôt, le spec tourne aussi sous jest.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MOTIF_ANNULATION_MAX, MOTIF_ANNULATION_MIN, motifRefusMotifAnnulation } from './motif-annulation';

/**
 * DÉCISION D1 · la réévaluation des devises se fait à la date de CLÔTURE
 * (AUDCIF art. 54, Titre VIII ch. 22 § 2.2) · l'écran Devises propose la fin
 * de l'exercice et ne la laisse pas changer ; une réévaluation passée à une
 * autre date est signalée sur sa ligne. On gèle des PRÉSENCES.
 */
describe('écran Devises · la date de la réévaluation', () => {
  const source = readFileSync(join(__dirname, '../pages/DevisesPage.tsx'), 'utf8');

  it('la date suit la fin de l’exercice et le champ est en lecture seule', () => {
    expect(source).toContain('setDateReeval(exerciceCourant.dateFin.slice(0, 10));');
    expect(source).not.toContain('setDateReeval(e.target.value)');
    const champ = source.slice(source.indexOf('value={dateReeval}'), source.indexOf('/>', source.indexOf('value={dateReeval}')));
    expect(champ).toContain('readOnly');
  });

  it('une réévaluation hors clôture est signalée', () => {
    expect(source).toContain('r.horsCloture');
  });
});

/**
 * DÉCISION D6 · « Annuler la réévaluation » sur la ligne, réservé à qui
 * valide (`peutValider`), motif obligatoire, route `POST
 * /devises/reevaluations/:id/annuler` ; une annulée le dit et n'offre plus la
 * contre-passation.
 */
describe('écran Devises · annuler une réévaluation', () => {
  const source = readFileSync(join(__dirname, '../pages/DevisesPage.tsx'), 'utf8');

  it('le bouton est réservé à peutValider et la route reçoit le motif', () => {
    expect(source).toMatch(/\{peutValider && !r\.annuleeLe && \(\s*<button/);
    expect(source).toContain('Annuler la réévaluation');
    const debut = source.indexOf('const annulerReevaluation = async');
    const corps = source.slice(debut, source.indexOf('\n  };\n', debut));
    expect(corps).toContain('`/devises/reevaluations/${aAnnuler.reevaluation.id}/annuler`');
    // La même modale annule la seule contre-passation (relecture adverse d'A5 bis, M1).
    expect(corps).toContain('`/devises/reevaluations/${aAnnuler.reevaluation.id}/contre-passation/annuler`');
    expect(corps).toContain('{ motif: aAnnuler.motif.trim() }');
    // M7 · la règle du DTO (3 à 500), vérifiée avant l'envoi, et une modale de l'interface.
    expect(corps).toContain('motifRefusMotifAnnulation(aAnnuler.motif)');
    expect(corps).not.toContain('window.prompt');
    expect(source).toContain("setAAnnuler({ reevaluation: r, motif: '', geste: 'REEVALUATION' });");
    // m3 · l'erreur du serveur s'affiche DANS la modale.
    expect(corps).toContain("setErreurAnnulation(e instanceof ApiError ? e.message : 'Annulation impossible')");
    const modale = source.slice(source.indexOf('{aAnnuler && ('));
    expect(modale.slice(0, modale.indexOf('</PortailModale>'))).toContain('{erreurAnnulation}');
    expect(source).toMatch(/\{aAnnuler && \(\s*<PortailModale>/);
  });

  it('une annulée ne propose plus la contre-passation', () => {
    expect(source).toContain('if (r.annuleeLe || !r.ecritureEcarts) return null;');
  });

  // M8 (relecture adverse d'A5 bis) · aucun « Contre-passer » sur une
  // réévaluation des seules disponibilités · le geste suit ce que le serveur
  // sert, et la cible est l'exercice qui suit immédiatement, jamais une liste.
  it('le geste de contre-passation suit le serveur · « Rien à contre-passer » pour les seules disponibilités, une seule cible', () => {
    const debut = source.indexOf('function ColonneContrePassation(');
    const corps = source.slice(debut);
    expect(corps).toContain('libelleContrePassation(r.contrePassationAPasser)');
    expect(corps).toContain('Rien à contre-passer');
    expect(corps).toContain("r.contrePassationAPasser === 'INTEGRALE_SUR_DEMANDE'");
    expect(source).not.toContain('Contre-passer sur…');
    expect(source).not.toContain('exercicesDeContrePassation(');
  });

  it('la bulle dit que la banque et la caisse ne se contre-passent plus', () => {
    expect(source).toContain('La banque et la caisse ne se contre-passent plus');
  });
});

/**
 * A5 BIS, TROISIÈME TOUR · UNE CONTRE-PASSATION FAITE À LA MAIN SE DÉCLARE
 * depuis la ligne de la réévaluation, sous `peutValider` · le serveur propose
 * les écritures, le cabinet en désigne une avec un motif ; la déclarée se dit
 * et se retire. Le champ vide de la ventilation n'est plus un zéro (mineur 2).
 */
describe('écran Devises · la contre-passation manuelle déclarée', () => {
  const source = readFileSync(join(__dirname, '../pages/DevisesPage.tsx'), 'utf8');
  const colonne = source.slice(source.indexOf('function ColonneContrePassation('));

  it('les gestes sont réservés à qui valide · déclarer à côté de « Contre-passer », retirer sur la déclarée', () => {
    // Le geste est DANS le bloc gardé · aucun bloc refermé entre la garde et lui.
    const geste = colonne.indexOf('onClick={p.onDeclarer}');
    const garde = colonne.lastIndexOf('{p.peutValider && (', geste);
    expect(garde).toBeGreaterThan(-1);
    expect(colonne.slice(garde, geste)).not.toContain(')}');
    expect(colonne).toContain('Déclarer une contre-passation manuelle');
    expect(colonne).toMatch(/if \(r\.contrePassationDeclaree\) \{[\s\S]*Contre-passée à la main[\s\S]*\{p\.peutValider && \(\s*<button type="button" onClick=\{p\.onRetirerDeclaration\}/);
  });

  it('les routes · candidates lues, déclaration avec l’écriture et le motif, retrait', () => {
    expect(source).toContain('`/devises/reevaluations/${r.id}/contre-passation-manuelle/candidates`');
    const debut = source.indexOf('const declarerContrePassation = async');
    const corps = source.slice(debut, source.indexOf('\n  };\n', debut));
    expect(corps).toContain('`/devises/reevaluations/${aDeclarer.reevaluation.id}/contre-passation-manuelle`');
    expect(corps).toContain('ecritureId: aDeclarer.ecritureId');
    expect(corps).toContain('motif: aDeclarer.motif.trim()');
    // Le retrait passe par la modale du motif (quatrième tour, m3) · motif exigé, envoyé.
    const annulation = source.slice(source.indexOf('const annulerReevaluation = async'));
    const corpsAnnulation = annulation.slice(0, annulation.indexOf('\n  };\n'));
    expect(corpsAnnulation).toContain(
      'api.delete(`/devises/reevaluations/${aAnnuler.reevaluation.id}/contre-passation-manuelle`, { motif: aAnnuler.motif.trim() })',
    );
    expect(source).toContain("setAAnnuler({ reevaluation: r, motif: '', geste: 'DECLARATION' });");
    expect(source).not.toContain('window.confirm(`Retirer la déclaration');
  });

  it('une liste vide dit pourquoi et ce qu’il faut faire ; une seule candidate se présélectionne ; l’erreur reste dans la modale', () => {
    const modale = source.slice(source.indexOf('{aDeclarer && ('));
    const corps = modale.slice(0, modale.indexOf('</PortailModale>'));
    // Quatrième tour · la liste vide dit ce que le serveur sert (`motifHorsModule` · corriger, rétablir) ;
    // cinquième tour · `null` veut dire que l'état des comptes porte l'écart en place, et seulement alors
    // « contre-passez par le module ».
    expect(corps).toContain('aDeclarer.lues.motifHorsModule ??');
    expect(corps).toContain("Les comptes de l'écart le portent encore en place");
    expect(corps).not.toContain('Aucune écriture passée à la main ne touche ces comptes');
    expect(corps).not.toContain("Aucune écriture de ce dossier n'inverse exactement ces montants");
    expect(corps).toContain('{erreurDeclaration}');
    expect(source).toContain('lues.candidates.length === 1 ? lues.candidates[0].id');
  });

  it('m4 · une lecture périmée est jetée au succès COMME à l’échec ; Échap ferme la modale', () => {
    const debut = source.indexOf('const ouvrirDeclaration = async');
    const corps = source.slice(debut, source.indexOf('\n  };\n', debut));
    const succes = corps.slice(corps.indexOf('try {'), corps.indexOf('} catch'));
    const echec = corps.slice(corps.indexOf('} catch'));
    expect(succes).toContain('if (jeton !== jetonDeclaration.current) return;');
    expect(echec).toContain('if (jeton !== jetonDeclaration.current) return;');
    const echap = source.slice(source.indexOf('if (!declarationOuverte) return;'));
    expect(echap.slice(0, echap.indexOf('}, ['))).toContain('ecouterEchap(');
  });

  it('mineur 2 · la ventilation passe par `lireVentilationSaisie`, qui refuse le champ vide', () => {
    const debut = source.indexOf('const declarerVentilation = async');
    const corps = source.slice(debut, source.indexOf('\n  };\n', debut));
    expect(corps).toContain('lireVentilationSaisie(aVentiler.reevaluation.ventilationAExiger ?? [], aVentiler.ecarts)');
  });
});

describe('le motif d’annulation · la règle du DTO', () => {
  it('3 à 500 caractères, espaces retirés', () => {
    expect(motifRefusMotifAnnulation('  ab ')).toMatch(/3 caractères au moins/);
    expect(motifRefusMotifAnnulation('abc')).toBeNull();
    expect(motifRefusMotifAnnulation('x'.repeat(501))).toMatch(/500 caractères au plus/);
  });

  it('le DTO du serveur porte la même borne', () => {
    const dto = readFileSync(join(__dirname, '../../../src/modules/devises/dto/devises.dto.ts'), 'utf8');
    const bloc = dto.slice(dto.indexOf('export class AnnulerReevaluationDto'));
    expect(bloc).toContain(`@Length(${MOTIF_ANNULATION_MIN}, ${MOTIF_ANNULATION_MAX})`);
  });
});
