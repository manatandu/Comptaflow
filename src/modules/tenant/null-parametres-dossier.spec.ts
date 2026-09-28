import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { Referentiel } from '@prisma/client';
import { ModifierCoordonneesDto, ModifierFormeJuridiqueDto, ModifierRegimeDto } from './dto/parametres-dossier.dto';
import { TenantService } from './tenant.service';

/**
 * `null` SUR LES PARAMÈTRES DU DOSSIER (2026-09-28) · refusé en 400 nommé là
 * où la colonne ne l'admet pas, lu comme un effacement là où elle l'admet et
 * où effacer a un sens. Avant, `@IsOptional` le laissait passer partout, et
 * la route répondait 500 · Prisma refusant `null` sur un booléen, un entier
 * ou une énumération, ou `.trim()` levant une TypeError sur une chaîne.
 *
 * Les refus sont éprouvés À TRAVERS LE PIPE GLOBAL (mêmes options que
 * `bootstrap.ts`, relues par `common/facultatif-non-nul.spec.ts`) · un refus
 * que seul `validate` verrait ne dirait rien du statut rendu.
 */

async function refusDuPipe(metatype: new () => object, corps: Record<string, unknown>): Promise<BadRequestException | null> {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  try {
    await pipe.transform(corps, { type: 'body', metatype, data: undefined });
    return null;
  } catch (e) {
    if (e instanceof BadRequestException) return e;
    throw e;
  }
}

function motifsDu(refus: BadRequestException | null): string[] {
  if (!refus) return [];
  const reponse = refus.getResponse() as { message?: string[] | string };
  return Array.isArray(reponse.message) ? reponse.message : [String(reponse.message)];
}

describe('null refusé en 400 nommé · colonnes qui ne l’admettent pas', () => {
  const cas: [string, new () => object, string, RegExp][] = [
    ['coordonnées · raison sociale', ModifierCoordonneesDto, 'nom', /raison sociale ne s'efface pas/],
    ['coordonnées · capital variable', ModifierCoordonneesDto, 'capitalVariable', /capital variable » se répond par true ou false/],
    ['régime · assujetti à la TVA', ModifierRegimeDto, 'assujettiTva', /PAS_ENCORE_DIT, jamais null/],
    ['régime · réponse sur la TVA', ModifierRegimeDto, 'reponseAssujettissementTva', /OUI, NON ou PAS_ENCORE_DIT/],
    ['régime · vente de biens ou de services', ModifierRegimeDto, 'venteBiensServices', /OUI, NON ou PAS_ENCORE_DIT/],
    ['régime · effectif permanent', ModifierRegimeDto, 'effectifPermanent', /zéro compris · null n'en est pas un/],
    ['régime · exigibilité de la TVA', ModifierRegimeDto, 'regimeExigibiliteTva', /null n'en est pas une/],
    ['forme juridique · droit étranger', ModifierFormeJuridiqueDto, 'droitEtranger', /Le droit étranger se répond par true ou false/],
  ];

  for (const [libelle, dto, champ, motif] of cas) {
    it(`${libelle} · 400 avec son motif, jamais 500`, async () => {
      const corps: Record<string, unknown> = { [champ]: null };
      // La forme juridique est obligatoire sur sa route · seul le champ
      // éprouvé doit porter le refus.
      if (dto === ModifierFormeJuridiqueDto) corps.formeJuridique = 'ASSOCIATION';
      const refus = await refusDuPipe(dto, corps);
      expect(refus).not.toBeNull();
      expect(refus!.getStatus()).toBe(400);
      expect(motifsDu(refus).some((m) => motif.test(m))).toBe(true);
    });
  }

  it('omis, ces champs passent · l’absence reste « inchangé »', async () => {
    expect(await refusDuPipe(ModifierCoordonneesDto, {})).toBeNull();
    expect(await refusDuPipe(ModifierRegimeDto, {})).toBeNull();
    expect(await refusDuPipe(ModifierFormeJuridiqueDto, { formeJuridique: 'ASSOCIATION' })).toBeNull();
  });

  it('une valeur explicite passe, zéro et false compris', async () => {
    expect(
      await refusDuPipe(ModifierRegimeDto, {
        assujettiTva: false,
        effectifPermanent: 0,
        reponseAssujettissementTva: 'PAS_ENCORE_DIT',
        venteBiensServices: 'NON',
        regimeExigibiliteTva: 'LIVRAISONS',
      }),
    ).toBeNull();
    expect(await refusDuPipe(ModifierCoordonneesDto, { nom: 'Entité', capitalVariable: false })).toBeNull();
  });
});

describe('null lu comme un effacement · colonnes qui l’admettent', () => {
  const CHAMPS_TEXTE = ['activite', 'adresse', 'ville', 'pays', 'telephone', 'email', 'siteWeb'] as const;

  it('la validation laisse passer null sur les coordonnées effaçables et le numéro CNSS', async () => {
    const coordonnees = Object.fromEntries([...CHAMPS_TEXTE, 'deviseFonctionnelle'].map((c) => [c, null]));
    expect(await refusDuPipe(ModifierCoordonneesDto, coordonnees)).toBeNull();
    expect(await refusDuPipe(ModifierRegimeDto, { numeroAffiliationCnssEmployeur: null })).toBeNull();
  });

  const monter = () => {
    const ecritures: { where: Record<string, unknown>; data: Record<string, unknown> }[] = [];
    const lecturesDevise: Record<string, unknown>[] = [];
    const prisma = {
      tenant: {
        // La doublure honore son filtre · un autre dossier est introuvable.
        findUnique: async ({ where }: { where: { id: string } }) =>
          where.id === 't1' ? { id: 't1', referentiel: Referentiel.SYSCOHADA, formeJuridiqueSyscohada: null } : null,
        update: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          ecritures.push(args);
          return { id: 't1' };
        },
      },
      devise: {
        findFirst: async ({ where }: { where: Record<string, unknown> }) => {
          lecturesDevise.push(where);
          return where.tenantId === 't1' && where.code === 'USD' && where.estActive === true ? { id: 'd1' } : null;
        },
      },
    };
    const s = new TenantService(prisma as never);
    (s as unknown as { parametres: () => Promise<null> }).parametres = async () => null;
    return { s, ecritures, lecturesDevise };
  };

  it('coordonnées · null écrit null sur chaque champ texte, jamais un 500', async () => {
    const { s, ecritures } = monter();
    await s.modifierCoordonnees('t1', Object.fromEntries(CHAMPS_TEXTE.map((c) => [c, null])));
    expect(ecritures).toHaveLength(1);
    expect(ecritures[0].where).toEqual({ id: 't1' });
    for (const c of CHAMPS_TEXTE) expect({ c, v: ecritures[0].data[c] }).toEqual({ c, v: null });
  });

  it('coordonnées · la monnaie fonctionnelle à null est retirée, plus ignorée en silence', async () => {
    const { s, ecritures, lecturesDevise } = monter();
    await s.modifierCoordonnees('t1', { deviseFonctionnelle: null });
    expect(ecritures[0].data.deviseFonctionnelle).toBeNull();
    // Retirer ne demande aucune devise ouverte.
    expect(lecturesDevise).toHaveLength(0);
  });

  it('coordonnées · un champ omis n’est pas touché, une valeur est posée', async () => {
    const { s, ecritures } = monter();
    await s.modifierCoordonnees('t1', { ville: ' Kinshasa ', deviseFonctionnelle: 'usd' });
    expect(ecritures[0].data.ville).toBe('Kinshasa');
    expect(ecritures[0].data.deviseFonctionnelle).toBe('USD');
    expect(ecritures[0].data.adresse).toBeUndefined();
  });

  it('régime · le numéro CNSS à null est effacé, la chaîne vide aussi', async () => {
    const { s, ecritures } = monter();
    await s.modifierRegime('t1', { numeroAffiliationCnssEmployeur: null });
    expect(ecritures[0].data.numeroAffiliationCnssEmployeur).toBeNull();
    await s.modifierRegime('t1', { numeroAffiliationCnssEmployeur: '  ' });
    expect(ecritures[1].data.numeroAffiliationCnssEmployeur).toBeNull();
    await s.modifierRegime('t1', { numeroAffiliationCnssEmployeur: ' 123/A ' });
    expect(ecritures[2].data.numeroAffiliationCnssEmployeur).toBe('123/A');
  });

  it('un autre dossier est introuvable, rien n’est écrit', async () => {
    const { s, ecritures } = monter();
    await expect(s.modifierCoordonnees('t2', { ville: null })).rejects.toThrow('Dossier introuvable');
    expect(ecritures).toHaveLength(0);
  });
});
