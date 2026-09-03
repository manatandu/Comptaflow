import 'reflect-metadata';
import * as ExcelJS from 'exceljs';
import { FormeJuridiqueSyscohada, Referentiel } from '@prisma/client';
import { REFERENTIELS_KEY } from '../../common/decorators/referentiels.decorator';
import { ExportService } from './export.service';
import { ExportController } from './export.controller';
import { PrismaService } from '../../common/prisma.service';
import { SECTIONS_RAPPORT_ACTIVITE } from '../documents-obligatoires/correspondance-inventaire';
import { SECTIONS_RAPPORT_GESTION_AUSCGIE } from '../documents-obligatoires/correspondance-inventaire-syscohada';

/**
 * PARITÉ DES DOCUMENTS OBLIGATOIRES · un document dû des deux côtés doit
 * SORTIR des deux côtés.
 *
 * Les documents obligatoires sont communs depuis le 2026-09-02, chacun lu dans
 * son texte : le livre d'inventaire (SYCEBNL art. 14 · AUDCIF art. 19) et le
 * rapport (SYCEBNL art. 16-3, quatre sections · AUSCGIE art. 138, six ·
 * AUSCOOP art. 108, six autres). Leur ÉTABLISSEMENT était bien commun ; leur
 * EXPORT était resté fermé au SYSCOHADA.
 *
 * CE QUE RIEN NE VOYAIT, ET C'EST LE PLUS INTÉRESSANT. La porte fermée ne
 * protégeait pas d'un oubli : elle en masquait un. L'export du rapport lisait
 * la constante SYCEBNL sans aucun aiguillage · ouvrir la route sans corriger
 * le service aurait servi à une société commerciale un rapport à QUATRE
 * sections portant les exigences d'un article qui ne la régit pas. La
 * fermeture avait donc, par accident, la vertu du refus · elle n'avait pas
 * celle de la correction.
 *
 * Un dossier SYSCOHADA pouvait ainsi ÉTABLIR son livre d'inventaire et son
 * rapport de gestion sans pouvoir les sortir du logiciel. Aucune erreur, aucun
 * total faux : simplement un document obligatoire que rien ne permettait de
 * remettre à qui le demande.
 */

type Faux = Record<string, unknown>;

const RAPPORT = {
  etabliLe: new Date('2027-03-15'),
  // Sections SYCEBNL et SYSCOHADA partagent trois clés (situation,
  // perspectives, trésorerie) · seules les autres distinguent les deux jeux.
  situationExerciceEcoule: 'Exercice de consolidation après reprise du portefeuille.',
  perspectivesDeveloppement: 'Ouverture d’une agence à Lubumbashi.',
  evolutionTresorerie: 'Trésorerie nette positive, en progression.',
  declarationDirigeants: null,
};

function service(referentiel: Referentiel, forme: FormeJuridiqueSyscohada | null) {
  const prisma = {
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel, formeJuridiqueSyscohada: forme }) },
    exercice: {
      findFirst: jest.fn().mockResolvedValue({ dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') }),
    },
  } as Faux;
  const rapportActivite = {
    courant: jest.fn().mockResolvedValue(RAPPORT),
    // La conformité aiguille DÉJÀ sur le référentiel depuis le 2026-09-02 ·
    // c'est l'export qui ne le faisait pas.
    conformite: jest.fn().mockResolvedValue({
      fenetreEvenementsPosterieurs: null,
      tresorerie: null,
      declarationRegistreDonateurs: { attendue: false, renseignee: false, registreConforme: true },
    }),
    conformiteRapportGestion: jest.fn().mockResolvedValue({
      fenetreEvenementsPosterieurs: null,
      tresorerie: null,
    }),
  } as Faux;

  return new ExportService(
    prisma as unknown as PrismaService,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    rapportActivite as never,
  );
}

/** Relit le classeur produit plutôt que d'affirmer qu'il est correct. */
async function feuilleDuRapport(referentiel: Referentiel, forme: FormeJuridiqueSyscohada | null) {
  const { buffer } = await service(referentiel, forme).rapportActiviteExcel('t1', 'ex');
  const classeur = new ExcelJS.Workbook();
  await classeur.xlsx.load(buffer as never);
  const feuille = classeur.worksheets[0];
  const titres: string[] = [];
  const exigences: string[] = [];
  feuille.eachRow((rang, i) => {
    if (i === 1) return;
    titres.push(String(rang.getCell(1).value ?? ''));
    exigences.push(String(rang.getCell(4).value ?? ''));
  });
  return { nom: feuille.name, titres, exigences: exigences.join(' ') };
}

describe('le rapport exporté porte les sections de SON texte', () => {
  it('un dossier SYCEBNL reçoit les quatre sections de l’art. 16-3', async () => {
    const f = await feuilleDuRapport(Referentiel.SYCEBNL, null);
    expect(f.nom).toBe("Rapport d'activité");
    for (const s of SECTIONS_RAPPORT_ACTIVITE) expect(f.titres).toContain(s.titre);
    // Et pas ceux de l'autre.
    expect(f.exigences).not.toContain('AUSCGIE');
  });

  it('une société commerciale reçoit les SIX sections de l’AUSCGIE art. 138', async () => {
    const f = await feuilleDuRapport(
      Referentiel.SYSCOHADA,
      FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE,
    );
    expect(f.nom).toBe('Rapport de gestion');
    for (const s of SECTIONS_RAPPORT_GESTION_AUSCGIE) expect(f.titres).toContain(s.titre);
    expect(f.exigences).toContain('AUSCGIE art. 138');
    // Le défaut exact que ce spec existe pour empêcher · l'export lisait la
    // constante SYCEBNL, quel que soit le dossier.
    expect(f.exigences).not.toContain('art. 16-3');
  });

  it('les deux jeux n’ont pas le même nombre de sections · ce n’est pas un détail', () => {
    // Quatre contre six : servir l'un pour l'autre laisserait deux sections
    // obligatoires sans ligne où les écrire, et personne ne verrait le manque.
    expect(SECTIONS_RAPPORT_ACTIVITE).toHaveLength(4);
    expect(SECTIONS_RAPPORT_GESTION_AUSCGIE).toHaveLength(6);
  });

  it('une forme juridique sans rapport dû n’en invente aucun', async () => {
    // AUSCGIE art. 138 nomme « le gérant, le conseil d'administration ou
    // l'administrateur général » · un entreprenant n'est aucun des trois. Le
    // classeur sort vide de sections plutôt que d'en emprunter à un autre
    // texte.
    const f = await feuilleDuRapport(Referentiel.SYSCOHADA, FormeJuridiqueSyscohada.ENTREPRENANT);
    for (const s of SECTIONS_RAPPORT_GESTION_AUSCGIE) expect(f.titres).not.toContain(s.titre);
    for (const s of SECTIONS_RAPPORT_ACTIVITE) expect(f.titres).not.toContain(s.titre);
  });

  it('la déclaration de l’art. 18 ne suit QUE le SYCEBNL', async () => {
    // Elle porte sur le registre des donateurs, que l'AUDCIF ne connaît pas.
    const sycebnl = await feuilleDuRapport(Referentiel.SYCEBNL, null);
    expect(sycebnl.titres.join(' ')).toContain('registre des donateurs');

    const syscohada = await feuilleDuRapport(
      Referentiel.SYSCOHADA,
      FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE,
    );
    expect(syscohada.titres.join(' ')).not.toContain('registre des donateurs');
  });
});

describe('les portes des documents communs restent ouvertes aux deux', () => {
  const metadonnee = (methode: string) =>
    Reflect.getMetadata(REFERENTIELS_KEY, ExportController.prototype[methode as keyof typeof ExportController.prototype]);

  it('le livre d’inventaire et le rapport ne portent AUCUN cloisonnement', () => {
    // Le livre est dû par tous (SYCEBNL art. 14 · AUDCIF art. 19), le rapport
    // aussi, chacun dans son texte. Reposer un `@ReferentielsAutorises` ici
    // refermerait la porte sans qu'aucun test de montant ne bronche.
    expect(metadonnee('livreInventaire')).toBeUndefined();
    expect(metadonnee('rapportActivite')).toBeUndefined();
  });

  it('en revanche l’éligibilité au Système minimal RESTE cloisonnée', () => {
    // Et c'est juste : les deux textes ne mesurent pas la même chose. Le
    // SYCEBNL compare les RESSOURCES à trente millions (art. 5 et 6, avec un
    // cumul biennal) ; l'AUDCIF compare le CHIFFRE D'AFFAIRES (art. 13). Les
    // deux services rendent d'ailleurs des formes différentes · un export
    // commun servirait le seuil d'un texte à l'entité de l'autre.
    expect(metadonnee('eligibiliteSmt')).toEqual([Referentiel.SYCEBNL]);
  });
});
