import { BadRequestException } from '@nestjs/common';
import { MESSAGE_EXERCICE_REQUIS } from '../../common/exercice-requis';
import { GroupeService } from './groupe.service';

/**
 * AUDIT FINAL F234, SUITE · LE GROUPE REFUSE L'EXERCICE ABSENT AVANT TOUTE
 * LECTURE.
 *
 * Les cinq entrées du service qui reçoivent un exercice le cherchaient par
 * `findFirst({ where: { id: exerciceId, tenantId } })`. Prisma ignore un
 * `id: undefined` · la recherche rendait alors le premier exercice venu, et
 * le groupe était agrégé, supervisé ou mis en liasse sur un exercice que
 * personne n'avait choisi. La route porte `EXERCICE_REQUIS`, mais un appel
 * qui ne passe pas par elle n'en est pas protégé.
 *
 * Ce fichier gèle deux choses, entrée par entrée :
 *  · le refus est le 400 NOMMÉ du porteur, jamais « Exercice introuvable »,
 *    qui reste le refus d'un identifiant donné qui n'est pas du dossier ;
 *  · RIEN n'est touché avant lui · ni lecture, ni la création du dossier de
 *    combinaison que la liasse fait en premier.
 */

/** Un témoin qui note tout appel, et le refuse · rien ne doit l'atteindre. */
function temoin(nom: string, touches: string[]): never {
  return new Proxy(
    {},
    {
      get: (_cible, modele) =>
        new Proxy(
          (..._args: unknown[]) => {
            touches.push(`${nom}.${String(modele)}`);
            return Promise.reject(new Error(`appel inattendu ${nom}.${String(modele)}`));
          },
          {
            get: (_m, operation) => (..._args: unknown[]) => {
              touches.push(`${nom}.${String(modele)}.${String(operation)}`);
              return Promise.reject(new Error(`appel inattendu ${nom}.${String(modele)}.${String(operation)}`));
            },
          },
        ),
    },
  ) as never;
}

function service() {
  const touches: string[] = [];
  const s = new GroupeService(
    temoin('prisma', touches),
    temoin('ecritures', touches),
    temoin('auth', touches),
    temoin('export', touches),
  );
  return { s, touches };
}

const ENTREES: Array<[string, (s: GroupeService, exerciceId: string) => Promise<unknown>]> = [
  ['balanceAgregee', (s, e) => s.balanceAgregee('siege', e)],
  ['balanceAgregeeExcel', (s, e) => s.balanceAgregeeExcel('siege', e)],
  ['supervision', (s, e) => s.supervision('siege', e)],
  ['balanceCellule', (s, e) => s.balanceCellule('siege', 'cellule', e)],
  ['liasseGroupe', (s, e) => s.liasseGroupe('siege', e, 'utilisateur')],
];

describe('groupe · l’exercice absent est refusé avant toute lecture (F234, suite)', () => {
  it.each(ENTREES)('%s refuse un exercice absent ou vide par le 400 du porteur, sans rien toucher', async (_nom, appel) => {
    for (const absent of [undefined, '', '   ']) {
      const { s, touches } = service();
      const refus = await appel(s, absent as never).then(
        () => null,
        (e: unknown) => e,
      );
      expect(refus).toBeInstanceOf(BadRequestException);
      expect((refus as BadRequestException).message).toBe(MESSAGE_EXERCICE_REQUIS);
      expect(touches).toEqual([]);
    }
  });

  it('le témoin n’est pas muet · un exercice donné atteint bien la base (un garde-fou qui ne voit rien ne garde rien)', async () => {
    const { s, touches } = service();
    await s.supervision('siege', '0b5f9c1e-3a4d-4c2b-9f1e-2a7d6c8b1e30').catch(() => undefined);
    expect(touches.length).toBeGreaterThan(0);
  });
});
