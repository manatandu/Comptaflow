import { readFileSync } from 'fs';
import { join } from 'path';
import { BadRequestException } from '@nestjs/common';
import { TenantService } from './tenant.service';

/**
 * LONGUEUR DES NUMÉROS DE COMPTE · le paramètre que le schéma annonçait et
 * qu'aucune route ne posait.
 *
 * `Tenant.longueurCompte` existe depuis l'origine, et son commentaire écrit
 * qu'il est « modifiable après coup (TenantService.modifierParametres) mais
 * jamais en dessous de la longueur du plus long numéro de compte déjà créé ».
 * Cette méthode n'existait pas : ni route, ni DTO, ni écran · la longueur
 * figurait au contraire dans le bloc « ce qui ne se change pas ». Le champ ne
 * servait donc que de PLAFOND, figé à 8 pour tous les dossiers.
 *
 * Ce qui se joue ici n'est pas la case à cocher, c'est le PLANCHER. Descendre
 * sous le plus long numéro déjà ouvert rendrait des comptes invalides
 * RÉTROACTIVEMENT · des comptes mouvementés, lettrés, repris dans des états
 * déjà déposés. Le refus doit donc nommer le numéro fautif, et le même chiffre
 * doit servir à l'écran, sinon il propose une valeur que la route rejette.
 */

const service = (numeros: string[], capture: { data?: Record<string, unknown> } = {}) =>
  new TenantService({
    tenant: {
      findUnique: async () => ({ id: 't1', longueurCompte: 8, referentiel: 'SYCEBNL' }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        capture.data = data;
        return { id: 't1' };
      },
    },
    compte: { findMany: async () => numeros.map((numero) => ({ numero })) },
    ecriture: { count: async () => 0 },
  } as never);

describe('Longueur des numéros de compte', () => {
  it('s’élargit · c’est le seul sens qui ne casse rien', async () => {
    // Un cabinet qui veut un sous-compte par adhérent sous la racine 411000
    // a besoin de dix chiffres. Rien de ce qui existe ne bouge.
    const capture: { data?: Record<string, unknown> } = {};
    await service(['41100000', '60410000'], capture).modifierLongueurCompte('t1', 10);
    expect(capture.data).toEqual({ longueurCompte: 10 });
  });

  it('REFUSE de descendre sous le plus long numéro déjà ouvert, et le NOMME', async () => {
    // Le message doit donner le numéro fautif : c'est celui-là qu'il faudrait
    // supprimer pour descendre, et une borne abstraite ne le dit pas.
    const capture: { data?: Record<string, unknown> } = {};
    const s = service(['411', '41100000'], capture);
    await expect(s.modifierLongueurCompte('t1', 6)).rejects.toBeInstanceOf(BadRequestException);
    await expect(s.modifierLongueurCompte('t1', 6)).rejects.toThrow('41100000');
    // RIEN n'est écrit · un refus qui laisserait passer l'écriture serait pire
    // que pas de refus du tout.
    expect(capture.data).toBeUndefined();
  });

  it('le plancher se lit sur la LONGUEUR, pas sur l’ordre alphabétique', async () => {
    // Le tri SQL sur `numero` est lexicographique : « 9 » y passe après
    // « 41100000 » alors qu'il est bien plus court. Un plancher déduit d'un
    // `orderBy desc` vaudrait donc 1, et laisserait tout passer.
    const capture: { data?: Record<string, unknown> } = {};
    const s = service(['9', '41100000', '411'], capture);
    await expect(s.modifierLongueurCompte('t1', 7)).rejects.toBeInstanceOf(BadRequestException);
    await s.modifierLongueurCompte('t1', 8);
    expect(capture.data).toEqual({ longueurCompte: 8 });
  });

  it('accepte la longueur ÉGALE au plancher · c’est un plancher, pas une exclusion', async () => {
    const capture: { data?: Record<string, unknown> } = {};
    await service(['41100000'], capture).modifierLongueurCompte('t1', 8);
    expect(capture.data).toEqual({ longueurCompte: 8 });
  });

  it('tient la plage de 3 à 13 · celle des logiciels de la place', async () => {
    // Bornes de Sage (skill `sage-i7`, comptabilité générale). Le DTO les pose
    // aussi, mais la route reste ouverte à un appel direct (CLAUDE.md § 6).
    const s = service([]);
    await expect(s.modifierLongueurCompte('t1', 2)).rejects.toBeInstanceOf(BadRequestException);
    await expect(s.modifierLongueurCompte('t1', 14)).rejects.toBeInstanceOf(BadRequestException);
    await expect(s.modifierLongueurCompte('t1', 8.5)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('SERT le plancher avec les paramètres · l’écran ne le recalcule pas', async () => {
    // Deux calculs auraient divergé, et l'écran aurait proposé une longueur que
    // la route refuse · l'utilisateur ne l'apprendrait qu'après le clic.
    const params = (await service(['411', '41100000']).parametres('t1')) as unknown as {
      longueurCompteMinimale: number;
      longueurCompteExemple: string;
    };
    expect(params.longueurCompteMinimale).toBe(8);
    expect(params.longueurCompteExemple).toBe('41100000');
  });

  it('l’écran désactive les longueurs impossibles avec ce chiffre-là', () => {
    const page = readFileSync(
      join(__dirname, '../../../client/src/pages/ParametresDossierPage.tsx'),
      'utf8',
    );
    expect(page).toContain("api.patch<ParametresDossier>('/dossier/longueur-compte'");
    expect(page).toContain('disabled={n < params.longueurCompteMinimale}');
    // Et la longueur n'est plus rangée parmi « ce qui ne se change pas ».
    expect(page).not.toContain("['Longueur des comptes', `${params.longueurCompte} caractères`]");
  });

  it('dit ce que la longueur NE FAIT PAS · le plan normalisé n’est pas renuméroté', () => {
    // Le semis pose des littéraux à huit chiffres, et les tables de
    // correspondance des deux référentiels sont écrites contre cette forme.
    // Laisser croire qu'élargir renumérote le plan serait la promesse la plus
    // coûteuse de cet écran.
    const page = readFileSync(
      join(__dirname, '../../../client/src/pages/ParametresDossierPage.tsx'),
      'utf8',
    );
    expect(page).toContain('garde ses huit chiffres et n’est pas renuméroté');
  });
});
