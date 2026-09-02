import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Referentiel } from '@prisma/client';
import { REFERENTIELS_KEY } from '../../common/decorators/referentiels.decorator';
import { ReferentielGuard } from '../../common/guards/referentiel.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { EtatsFinanciersController } from '../etats-financiers/etats-financiers.controller';
import { EtatsFinanciersSyscohadaController } from './etats-financiers-syscohada.controller';

/**
 * CLOISONNEMENT DES DEUX RÉFÉRENTIELS · ce spec ne teste aucun montant : il
 * teste la seule chose de ce contrôleur qui casserait EN SILENCE.
 *
 * Un état SYSCOHADA servi à un dossier SYCEBNL (ou l'inverse) ne lève
 * aucune erreur, ne déséquilibre rien, et ne se découvre qu'au dépôt des
 * états · c'est la catégorie de bug que CLAUDE.md §1 dit intolérable. Or
 * rien dans le code du contrôleur ne la signale : le cloisonnement tient à
 * DEUX métadonnées posées par décorateur, qu'un « nettoyage d'imports » ou
 * une fusion malheureuse retirent sans rien casser de visible.
 *
 * Les deux métadonnées, toujours les deux (CLAUDE.md §6) :
 *  - `@ReferentielsAutorises(SYSCOHADA)`, qui DIT le référentiel ;
 *  - `ReferentielGuard` dans `@UseGuards`, sans laquelle le décorateur
 *    n'est qu'un commentaire · c'est l'incident qu'évite le test des
 *    gardes ci-dessous, pas une redondance.
 *
 * Le contrôleur SYCEBNL est relu ici comme TÉMOIN : le cloisonnement se
 * vérifie dans les deux sens, et un seul des deux contrôleurs mal étiqueté
 * suffirait à croiser les référentiels.
 */
describe('EtatsFinanciersSyscohadaController · cloisonnement SYSCOHADA', () => {
  it('porte @ReferentielsAutorises(SYSCOHADA) au niveau de la CLASSE', () => {
    const referentiels = Reflect.getMetadata(REFERENTIELS_KEY, EtatsFinanciersSyscohadaController);
    expect(referentiels).toEqual([Referentiel.SYSCOHADA]);
  });

  it("n'autorise PAS le SYCEBNL, dont les états ont leur propre contrôleur", () => {
    const referentiels: Referentiel[] = Reflect.getMetadata(REFERENTIELS_KEY, EtatsFinanciersSyscohadaController);
    expect(referentiels).not.toContain(Referentiel.SYCEBNL);
  });

  it('laisse le contrôleur SYCEBNL sur son propre référentiel · aucun recouvrement', () => {
    const syscohada: Referentiel[] = Reflect.getMetadata(REFERENTIELS_KEY, EtatsFinanciersSyscohadaController);
    const sycebnl: Referentiel[] = Reflect.getMetadata(REFERENTIELS_KEY, EtatsFinanciersController);
    expect(sycebnl).toEqual([Referentiel.SYCEBNL]);
    expect(syscohada.filter((r) => sycebnl.includes(r))).toEqual([]);
  });

  it('monte ReferentielGuard, sans quoi le décorateur ne serait qu’un commentaire', () => {
    const gardes = Reflect.getMetadata(GUARDS_METADATA, EtatsFinanciersSyscohadaController) ?? [];
    expect(gardes).toContain(ReferentielGuard);
  });

  it('monte les quatre gardes du modèle, dans le même ordre', () => {
    // Même chaîne que le contrôleur SYCEBNL : JwtAuthGuard résout d'abord
    // `request.user`, dont ReferentielGuard tire le tenant ; RolesGuard est
    // présent pour qu'un `@Roles` ajouté plus tard soit réellement appliqué.
    const gardes = Reflect.getMetadata(GUARDS_METADATA, EtatsFinanciersSyscohadaController) ?? [];
    expect(gardes).toEqual([JwtAuthGuard, LicenceGuard, RolesGuard, ReferentielGuard]);
  });

  it('répond sous son propre préfixe, distinct de celui du SYCEBNL', () => {
    expect(Reflect.getMetadata(PATH_METADATA, EtatsFinanciersSyscohadaController)).toBe('etats-financiers-syscohada');
    expect(Reflect.getMetadata(PATH_METADATA, EtatsFinanciersController)).toBe('etats-financiers');
  });

  describe('routes', () => {
    const prototype = EtatsFinanciersSyscohadaController.prototype as unknown as Record<string, () => unknown>;
    const methodes = Object.getOwnPropertyNames(prototype).filter((nom) => nom !== 'constructor');
    const chemin = (nom: string) => Reflect.getMetadata(PATH_METADATA, prototype[nom]);
    const verbe = (nom: string) => Reflect.getMetadata(METHOD_METADATA, prototype[nom]);

    // Les neuf routes attendues : le Système normal (AUDCIF art. 26 · bilan,
    // compte de résultat, tableau des flux de trésorerie, notes annexes) et
    // le Système minimal de trésorerie (art. 13 et Titre X · bilan, compte
    // de résultat, journal de trésorerie, notes, et le contrôle des seuils).
    const attendues = [
      'bilan',
      'compte-de-resultat',
      'tableau-flux-tresorerie',
      'notes',
      'smt/bilan',
      'smt/compte-de-resultat',
      'smt/journal-tresorerie',
      'smt/notes',
      'smt/eligibilite',
    ];

    it.each(attendues)('expose GET %s', (route) => {
      const nom = methodes.find((m) => chemin(m) === route);
      expect(nom).toBeDefined();
      expect(verbe(nom as string)).toBe(RequestMethod.GET);
    });

    it("n'expose rien d'autre · une route en trop est une route non gardée par ce spec", () => {
      expect(methodes.map(chemin).sort()).toEqual([...attendues].sort());
    });

    it('ne redéfinit @ReferentielsAutorises sur AUCUNE route', () => {
      // `Reflector.getAllAndOverride` interroge la MÉTHODE avant la classe :
      // un décorateur posé sur une route écraserait celui de la classe et
      // rouvrirait la route au mauvais référentiel sans rien casser.
      for (const nom of methodes) {
        expect(Reflect.getMetadata(REFERENTIELS_KEY, prototype[nom])).toBeUndefined();
      }
    });
  });
});
