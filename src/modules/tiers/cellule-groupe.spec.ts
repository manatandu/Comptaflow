import { BadRequestException } from '@nestjs/common';
import { TiersService } from './tiers.service';
import { PrismaService } from '../../common/prisma.service';
import { TypeTiers } from '@prisma/client';

/**
 * UN TIERS QUI EST UNE AUTRE CELLULE DU GROUPE, ET RIEN D'AUTRE.
 *
 * Un groupe d'établissements est UNE SEULE personne morale tenue en plusieurs
 * dossiers. Une vente du siège à une antenne n'est pas une vente : l'agrégat
 * doit l'éliminer des deux côtés · AUDCIF art. 107, « élimination des comptes
 * réciproques : actifs et passifs, charges et produits ; neutralisation des
 * résultats provenant d'opérations effectuées entre les entités DU
 * PÉRIMÈTRE ».
 *
 * Tout tient donc dans « du périmètre ». La clé étrangère vise `tenants` sans
 * pouvoir exiger « même dossier mère » · aucune contrainte SQL ne compare deux
 * lignes d'une autre table. Si le service n'y met pas la sienne, un dossier
 * étranger passe, et l'agrégat perd un chiffre d'affaires réellement réalisé
 * avec un tiers : l'inverse exact du défaut que le champ corrige, et sans plus
 * de trace que lui.
 *
 * LE GROUPE N'A QU'UN NIVEAU (voir Tenant.dossierMereId et
 * PlateformeService.modifierGroupe) · une mère sans mère, et ses cellules. Les
 * trois cas acceptés en découlent, et un seul cas les résume mal : une cellule
 * partage son `dossierMereId` avec elle-même, et se rattacherait donc à son
 * propre dossier si l'exclusion de soi manquait.
 */

/** Le groupe utilisé partout ici : une mère, deux cellules, un dossier libre. */
const DOSSIERS: Record<string, { id: string; nom: string; dossierMereId: string | null }> = {
  siege: { id: 'siege', nom: 'Siège national', dossierMereId: null },
  goma: { id: 'goma', nom: 'Antenne de Goma', dossierMereId: 'siege' },
  bukavu: { id: 'bukavu', nom: 'Antenne de Bukavu', dossierMereId: 'siege' },
  autreSiege: { id: 'autreSiege', nom: 'Autre église', dossierMereId: null },
  autreCellule: { id: 'autreCellule', nom: 'Cellule d’une autre église', dossierMereId: 'autreSiege' },
  // Ni mère, ni cellule · le cas de l'immense majorité des dossiers.
  libre: { id: 'libre', nom: 'Association indépendante', dossierMereId: null },
};

type Ou = { id?: string; dossierMereId?: string | null; OR?: Ou[]; NOT?: { id: string } };

function correspond(d: (typeof DOSSIERS)[string], ou: Ou): boolean {
  if (ou.OR) {
    if (!ou.OR.some((sous) => correspond(d, sous))) return false;
  }
  if (ou.NOT && d.id === ou.NOT.id) return false;
  if (ou.id !== undefined && d.id !== ou.id) return false;
  if (ou.dossierMereId !== undefined && d.dossierMereId !== ou.dossierMereId) return false;
  return true;
}

function service(capture: { cree?: any; modifie?: any } = {}) {
  return new TiersService({
    tenant: {
      findUnique: async ({ where }: { where: { id: string } }) => DOSSIERS[where.id] ?? null,
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => DOSSIERS[where.id],
      findMany: async ({ where }: { where: Ou }) => Object.values(DOSSIERS).filter((d) => correspond(d, where)),
    },
    tiers: {
      findUnique: async () => null,
      findFirst: async () => ({ id: 'ti1', tenantId: 'goma' }),
      create: async ({ data }: { data: unknown }) => {
        capture.cree = data;
        return data;
      },
      update: async (args: unknown) => {
        capture.modifie = args;
        return args;
      },
    },
  } as unknown as PrismaService);
}

const base = { code: 'CLI-1', nom: 'Siège', type: TypeTiers.CLIENT };

describe('tiers · rattachement à une cellule du groupe', () => {
  it('accepte le dossier mère depuis une cellule', async () => {
    const capture: { cree?: any } = {};
    await service(capture).creer('goma', { ...base, celluleGroupeId: 'siege' });
    expect(capture.cree).toMatchObject({ celluleGroupeId: 'siege', tenantId: 'goma' });
  });

  it('accepte un dossier sœur depuis une cellule', async () => {
    const capture: { cree?: any } = {};
    await service(capture).creer('goma', { ...base, celluleGroupeId: 'bukavu' });
    expect(capture.cree).toMatchObject({ celluleGroupeId: 'bukavu' });
  });

  it('accepte une cellule depuis le dossier mère', async () => {
    const capture: { cree?: any } = {};
    await service(capture).creer('siege', { ...base, celluleGroupeId: 'goma' });
    expect(capture.cree).toMatchObject({ celluleGroupeId: 'goma' });
  });

  it('refuse un dossier d’un AUTRE groupe, sans rien écrire', async () => {
    const capture: { cree?: any } = {};
    await expect(service(capture).creer('goma', { ...base, celluleGroupeId: 'autreCellule' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(capture.cree).toBeUndefined();
    // Le message dit POURQUOI · un refus muet enverrait le comptable
    // chercher une panne là où il y a une règle.
    await expect(service().creer('goma', { ...base, celluleGroupeId: 'autreSiege' })).rejects.toThrow(
      /groupe d'établissements/,
    );
  });

  it('refuse le dossier courant lui-même, qui partage pourtant sa propre mère', async () => {
    // LE PIÈGE. « Même dossierMereId » est vrai de la cellule pour elle-même :
    // sans exclusion de soi, un tiers se rattacherait au dossier qui le porte,
    // et l'agrégat éliminerait des opérations contre personne.
    const capture: { cree?: any } = {};
    await expect(service(capture).creer('goma', { ...base, celluleGroupeId: 'goma' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(capture.cree).toBeUndefined();
  });

  it('refuse tout rattachement depuis un dossier hors groupe', async () => {
    // Ni mère ni cellule · son périmètre est vide, il n'a rien à éliminer.
    await expect(service().creer('libre', { ...base, celluleGroupeId: 'siege' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('applique la même règle à la MODIFICATION, pas seulement à la création', async () => {
    const capture: { modifie?: any } = {};
    await expect(
      service(capture).modifier('goma', 'ti1', { celluleGroupeId: 'autreCellule' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(capture.modifie).toBeUndefined();
    await service(capture).modifier('goma', 'ti1', { celluleGroupeId: 'siege' });
    expect(capture.modifie).toMatchObject({ data: { celluleGroupeId: 'siege' } });
  });

  it('laisse passer le détachement (null) sans contrôle', async () => {
    // Détacher ne peut jamais faire SORTIR de l'agrégat une opération qui doit
    // y rester · c'est l'inverse. Le refuser bloquerait une correction.
    const capture: { modifie?: any } = {};
    await service(capture).modifier('goma', 'ti1', { celluleGroupeId: null });
    expect(capture.modifie).toMatchObject({ data: { celluleGroupeId: null } });
  });
});

describe('tiers · liste des dossiers du groupe servie à l’écran', () => {
  it('depuis le dossier mère : ses cellules, et elles seules', async () => {
    // Tri par nom laissé à Postgres · le double de test ne le simule pas, on
    // compare donc des ensembles.
    const membres = await service().dossiersDuGroupe('siege');
    expect(membres.map((m) => m.id).sort()).toEqual(['bukavu', 'goma']);
    expect(membres.every((m) => m.estDossierMere === false)).toBe(true);
  });

  it('depuis une cellule : la mère et les sœurs, jamais elle-même', async () => {
    const membres = await service().dossiersDuGroupe('goma');
    expect(membres.map((m) => m.id).sort()).toEqual(['bukavu', 'siege']);
    expect(membres.find((m) => m.id === 'siege')!.estDossierMere).toBe(true);
  });

  it('depuis un dossier hors groupe : rien', async () => {
    expect(await service().dossiersDuGroupe('libre')).toEqual([]);
  });
});

describe('tiers · les deux données de TVA d’après les débits se posent et se retirent', () => {
  it('enregistre la mention lue sur la facture et la référence de la décision', async () => {
    // Décret n° 011/42, art. 60 · la mention « Autorisation d'acquitter la TVA
    // d'après les débits » figure sur toutes les factures de l'autorisé. Elle
    // se LIT, aucun calcul ne l'établit.
    const capture: { cree?: any } = {};
    await service(capture).creer('goma', {
      ...base,
      type: TypeTiers.FOURNISSEUR,
      autoriseTvaDebits: true,
      referenceAutorisationDebits: 'DGI/DI/2026-118',
    });
    expect(capture.cree).toMatchObject({ autoriseTvaDebits: true, referenceAutorisationDebits: 'DGI/DI/2026-118' });
  });

  it('ne pose rien quand le comptable n’a rien saisi', async () => {
    // Le droit commun est le paiement · un tiers existant doit rester
    // exactement dans l'état où le module le traitait hier.
    const capture: { cree?: any } = {};
    await service(capture).creer('goma', base);
    expect(capture.cree.autoriseTvaDebits).toBeUndefined();
    expect(capture.cree.celluleGroupeId).toBeUndefined();
  });

  it('révoque l’autorisation par une simple modification', async () => {
    // Art. 63 du décret n° 011/42 · révocable sur simple demande écrite du
    // contribuable revenant au régime de droit commun.
    const capture: { modifie?: any } = {};
    await service(capture).modifier('goma', 'ti1', { autoriseTvaDebits: false, referenceAutorisationDebits: null });
    expect(capture.modifie).toMatchObject({
      data: { autoriseTvaDebits: false, referenceAutorisationDebits: null },
    });
  });
});
