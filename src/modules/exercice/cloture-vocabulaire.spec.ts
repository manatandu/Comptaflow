import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Referentiel } from '@prisma/client';
import { libellesResultat } from './exercice.service';

/**
 * LE COMPTE 13 PORTE LES MÊMES NUMÉROS DANS LES DEUX PLANS ET PAS LES MÊMES
 * INTITULÉS · c'est le genre d'écart qui ne casse rien et qui s'imprime.
 *
 * La clôture écrivait « Excédent de l'exercice » au livre-journal d'une
 * entreprise, et son message d'erreur lui parlait du « plan de comptes
 * SYCEBNL de ce dossier ». Aucun test ne pouvait le voir : les numéros
 * 13100000 et 13900000 sont justes des deux côtés, et c'est eux seuls que la
 * clôture manipule.
 *
 *  · SYCEBNL, Partie 2 ch. 2 · 131 Excédent, 139 Déficit ;
 *  · AUDCIF, Titre VII § COMPTE 13 · 131 Résultat net : Bénéfice, 139
 *    Résultat net : Perte ; art. 29 · « le bénéfice net ou la perte nette de
 *    l'exercice ».
 */

const lire = (p: string) => readFileSync(join(__dirname, p), 'utf8');

describe('clôture · vocabulaire du compte 13', () => {
  it('nomme le résultat comme le plan du dossier le nomme', () => {
    const sycebnl = libellesResultat(Referentiel.SYCEBNL);
    expect(sycebnl.excedent).toBe("Excédent de l'exercice (131)");
    expect(sycebnl.deficit).toBe("Déficit de l'exercice (139)");
    expect(sycebnl.ligneExcedent).toBe("Excédent de l'exercice");

    const syscohada = libellesResultat(Referentiel.SYSCOHADA);
    expect(syscohada.excedent).toBe('Résultat net : bénéfice (131)');
    expect(syscohada.deficit).toBe('Résultat net : perte (139)');
    // Art. 29 de l'AUDCIF : « le bénéfice net ou la perte nette de l'exercice ».
    expect(syscohada.ligneExcedent).toBe("Bénéfice net de l'exercice");
    expect(syscohada.ligneDeficit).toBe("Perte nette de l'exercice");
  });

  it('nomme le bon plan dans le message d’erreur de configuration', () => {
    // « Le plan de comptes SYCEBNL de ce dossier semble incomplet » servi à
    // une entreprise : le message désignait le mauvais référentiel, donc le
    // mauvais endroit où chercher.
    expect(libellesResultat(Referentiel.SYCEBNL).plan).toBe('SYCEBNL');
    expect(libellesResultat(Referentiel.SYSCOHADA).plan).toBe('SYSCOHADA');
  });

  it('reprend mot pour mot l’intitulé semé dans chaque plan', () => {
    // Le vrai garde-fou : si un semis change d'intitulé, le libellé du
    // livre-journal doit changer avec lui, sans quoi la ligne de clôture ne
    // dit plus la même chose que le compte qu'elle vise.
    const sycebnl = lire('../comptes/compte-seed.ts');
    expect(sycebnl).toContain(`['13100000', "${libellesResultat(Referentiel.SYCEBNL).ligneExcedent}"]`);
    expect(sycebnl).toContain(`['13900000', "${libellesResultat(Referentiel.SYCEBNL).ligneDeficit}"]`);

    const syscohada = lire('../comptes/compte-seed-syscohada.ts');
    expect(syscohada).toContain("d('13100000', 'Résultat net : bénéfice'");
    expect(syscohada).toContain("d('13900000', 'Résultat net : perte'");
  });

  it('n’écrit plus aucun libellé de résultat en dur dans la clôture', () => {
    const service = lire('./exercice.service.ts');
    // Hors de libellesResultat, plus une seule occurrence littérale : c'est
    // la forme du bug, et c'est elle qu'on interdit.
    const apresLaFonction = service.slice(service.indexOf('@Injectable()'));
    expect(apresLaFonction).not.toMatch(/"Excédent de l'exercice/);
    expect(apresLaFonction).not.toMatch(/"Déficit de l'exercice/);
    expect(apresLaFonction).toContain('mots.ligneDeficit');
    expect(apresLaFonction).toContain('libellesResultat(referentiel)');
  });

  it('garde les mêmes NUMÉROS des deux côtés · seuls les mots changent', () => {
    const service = lire('./exercice.service.ts');
    expect(service).toContain("deficitaire ? '13900000' : '13100000'");
    // Le compte 130 « Résultat en instance d'affectation » du plan SYSCOHADA
    // n'est qu'une possibilité offerte À LA RÉOUVERTURE (AUDCIF, Titre VII
    // § COMPTE 13) : la clôture ne doit pas s'en servir.
    expect(service).not.toContain('13010000');
    expect(service).not.toContain('13090000');
  });
});
