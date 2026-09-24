import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Referentiel } from '@prisma/client';
import { TenantService } from './tenant.service';
import { REFERENTIELS_KEY } from '../../common/decorators/referentiels.decorator';
import { ReferentielGuard } from '../../common/guards/referentiel.guard';
import { GroupeController } from '../groupe/groupe.controller';

/**
 * LES IDENTIFIANTS LÉGAUX NE SONT PAS LES MÊMES DES DEUX CÔTÉS, et la route
 * les acceptait tous pour tout dossier · seul l'écran filtrait, ce qui laisse
 * la porte ouverte à un appel direct (CLAUDE.md § 6).
 *
 *  · le RCCM immatricule les commerçants, les sociétés commerciales, les GIE
 *    et les succursales (AUDCG art. 35, 1°) · une ASBL n'est pas commerçante
 *    au sens de l'art. 2, elle n'en a pas ;
 *  · l'arrêté de personnalité juridique, l'enregistrement sectoriel, le
 *    certificat du Ministère du Plan et l'attestation d'exemption d'IS sont
 *    les identifiants d'une ASBL, d'une ONG ou d'un EUP · une société n'en a
 *    aucun ;
 *  · le numéro impôt et l'id. nat. sont communs.
 */

function service(referentiel: Referentiel, capture: { data?: Record<string, unknown> } = {}) {
  return new TenantService({
    tenant: {
      findUnique: async () => ({ id: 't1', referentiel }),
      findUniqueOrThrow: async () => ({ id: 't1', referentiel }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        capture.data = data;
        return { id: 't1' };
      },
    },
    exercice: { findFirst: async () => null, count: async () => 0 },
    ecriture: { count: async () => 0 },
    // La doublure répond à la lecture des comptes que `parametres()` fait
    // désormais · le plancher de la longueur des numéros s'y calcule. Une
    // doublure muette sur une lecture réelle validerait un service qui
    // n'existe pas.
    compte: { findMany: async () => [] },
  } as never);
}

describe('identifiants légaux · chacun son référentiel', () => {
  it('refuse un RCCM à une entité à but non lucratif, et cite le texte', async () => {
    const capture: { data?: Record<string, unknown> } = {};
    await expect(service(Referentiel.SYCEBNL, capture).modifierIdentite('t1', { rccm: 'CD/KIN/RCCM/24-B-1' }))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service(Referentiel.SYCEBNL).modifierIdentite('t1', { rccm: 'X' })).rejects.toThrow(/AUDCG/);
    expect(capture.data).toBeUndefined();
  });

  it('refuse les identifiants d’ASBL à une société commerciale', async () => {
    const champs = [
      { actePersonnaliteJuridique: 'ARR-2024-01' },
      { numeroEnregistrementSecteur: 'SEC-9' },
      { certificatEnregistrementPlan: 'PLAN-9' },
      { attestationExemptionIs: 'EX-9' },
      { dateActePersonnalite: '2024-01-01' },
    ];
    for (const champ of champs) {
      const capture: { data?: Record<string, unknown> } = {};
      await expect(service(Referentiel.SYSCOHADA, capture).modifierIdentite('t1', champ)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(`${Object.keys(champ)[0]} écrit ? ${capture.data !== undefined}`).toBe(
        `${Object.keys(champ)[0]} écrit ? false`,
      );
    }
  });

  it('laisse EFFACER un identifiant hérité, dans les deux sens', async () => {
    // La chaîne vide est le geste d'effacement voulu : un refus sec
    // empêcherait de nettoyer un identifiant resté d'une conversion.
    const capture: { data?: Record<string, unknown> } = {};
    await service(Referentiel.SYCEBNL, capture).modifierIdentite('t1', { rccm: '' });
    expect(capture.data!.rccm).toBeNull();

    const capture2: { data?: Record<string, unknown> } = {};
    await service(Referentiel.SYSCOHADA, capture2).modifierIdentite('t1', { attestationExemptionIs: '  ' });
    expect(capture2.data!.attestationExemptionIs).toBeNull();
  });

  it('laisse passer les identifiants COMMUNS aux deux référentiels', async () => {
    for (const referentiel of [Referentiel.SYCEBNL, Referentiel.SYSCOHADA]) {
      const capture: { data?: Record<string, unknown> } = {};
      await service(referentiel, capture).modifierIdentite('t1', { numeroImpot: 'A1234567X', idNat: '01-A-4567' });
      expect(capture.data!.numeroImpot).toBe('A1234567X');
      expect(capture.data!.idNat).toBe('01-A-4567');
    }
  });
});

describe('module groupe · les deux référentiels, sauf le canevas', () => {
  it('le contrôleur autorise le SYCEBNL et le SYSCOHADA, sous sa garde', () => {
    // Depuis le 2026-09-24 · une association et ses cellules, une société et
    // ses succursales (fiche du COMPTE 18, 184 à 187). La garde reste posée :
    // c'est elle qui refuserait un troisième référentiel.
    expect(Reflect.getMetadata(REFERENTIELS_KEY, GroupeController)).toEqual([Referentiel.SYCEBNL, Referentiel.SYSCOHADA]);
    expect(Reflect.getMetadata(GUARDS_METADATA, GroupeController)).toContain(ReferentielGuard);
  });

  it('le canevas de trésorerie reste au SYCEBNL · ses rubriques sont des comptes de son plan', () => {
    // Le filtre de la route l'emporte sur celui de la classe (getAllAndOverride).
    const proto = GroupeController.prototype as unknown as Record<string, object>;
    expect(Reflect.getMetadata(REFERENTIELS_KEY, proto.canevas)).toEqual([Referentiel.SYCEBNL]);
    expect(Reflect.getMetadata(REFERENTIELS_KEY, proto.importerCanevas)).toEqual([Referentiel.SYCEBNL]);
    // La balance agrégée et la liasse, elles, suivent la classe.
    expect(Reflect.getMetadata(REFERENTIELS_KEY, proto.balanceAgregee)).toBeUndefined();
    expect(Reflect.getMetadata(REFERENTIELS_KEY, proto.liasseGroupe)).toBeUndefined();
  });

  it('la fenêtre du client est commune aux deux référentiels', () => {
    const registre = readFileSync(join(__dirname, '../../../client/src/lib/registre-fenetres.tsx'), 'utf8');
    const bloc = registre.slice(registre.indexOf("motif: /^\\/groupe$/"), registre.indexOf("motif: /^\\/groupe$/") + 600);
    expect(bloc).toContain('FENÊTRE COMMUNE AUX DEUX RÉFÉRENTIELS');
  });
});
