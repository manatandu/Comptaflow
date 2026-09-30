import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { FormeJuridiqueSyscohada, Prisma, Referentiel } from '@prisma/client';
import { mentionsArticle17, motifRefusCapital, motifRefusCapitalVariable, FORMES_SOCIETES_COMMERCIALES } from './mentions-societe';
import { TenantService } from './tenant.service';
import { ModifierCoordonneesDto } from './dto/parametres-dossier.dto';
import { AuthService } from '../auth/auth.service';

/**
 * POINT 16 · capital, courriel et site dans l'identification. Le capital
 * n'est pas un champ décoratif : l'AUSCGIE art. 17 l'impose à côté de la
 * dénomination sur tout document destiné aux tiers, avec la forme, le siège et
 * le RCCM, et l'art. 891-1, 2° en fait une infraction.
 */
describe('Mentions de l’art. 17 AUSCGIE', () => {
  const sarl = {
    referentiel: Referentiel.SYSCOHADA,
    formeJuridiqueSyscohada: FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE as FormeJuridiqueSyscohada | null,
    nom: 'Démo SARL',
    capitalSocial: 10000000 as number | null,
    capitalVariable: false,
    adresse: '12, avenue du Commerce' as string | null,
    ville: 'Kinshasa' as string | null,
    rccm: 'CD/KIN/RCCM/24-B-00001' as string | null,
    devise: 'CDF' as string | null,
  };

  it('compose la forme, le capital, le siège et le RCCM, dans cet ordre', () => {
    const m = mentionsArticle17(sarl);
    expect(m.ligne).toBe(
      'Société à responsabilité limitée · au capital de 10 000 000 CDF · siège social : 12, avenue du Commerce, Kinshasa · RCCM CD/KIN/RCCM/24-B-00001',
    );
    expect(m.manquantes).toEqual([]);
  });

  it('art. 269-2 · « à capital variable » s’ajoute à la forme sociale de la SA et de la SAS', () => {
    const sa = { ...sarl, formeJuridiqueSyscohada: FormeJuridiqueSyscohada.SOCIETE_ANONYME, capitalVariable: true };
    expect(mentionsArticle17(sa).ligne).toMatch(/^Société anonyme à capital variable · au capital de/);
    expect(
      mentionsArticle17({ ...sa, formeJuridiqueSyscohada: FormeJuridiqueSyscohada.SOCIETE_PAR_ACTIONS_SIMPLIFIEE }).ligne,
    ).toMatch(/^Société par actions simplifiée à capital variable/);
  });

  it('art. 269-1 · un drapeau hérité sur une SARL n’est pas imprimé, il est DIT', () => {
    const m = mentionsArticle17({ ...sarl, capitalVariable: true });
    expect(m.ligne).toMatch(/^Société à responsabilité limitée · au capital de/);
    expect(m.manquantes.join(' ')).toContain('AUSCGIE art. 269-1');
  });

  it('art. 269-1 · la variabilité est refusée aux SARL, SNC et SCS, pas à la SA, à la SAS ni à la coopérative', () => {
    for (const f of [
      FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE,
      FormeJuridiqueSyscohada.SOCIETE_NOM_COLLECTIF,
      FormeJuridiqueSyscohada.SOCIETE_COMMANDITE_SIMPLE,
    ]) {
      expect(motifRefusCapitalVariable(f)).toMatch(/art\. 269-1/);
    }
    expect(motifRefusCapitalVariable(FormeJuridiqueSyscohada.SOCIETE_ANONYME)).toBeNull();
    expect(motifRefusCapitalVariable(FormeJuridiqueSyscohada.SOCIETE_PAR_ACTIONS_SIMPLIFIEE)).toBeNull();
    // AUSCOOP art. 52 · le capital de la coopérative EST variable.
    expect(motifRefusCapitalVariable(FormeJuridiqueSyscohada.SOCIETE_COOPERATIVE)).toBeNull();
  });

  it('art. 25 · une ville seule n’est pas une adresse · elle s’imprime, l’adresse reste manquante', () => {
    const m = mentionsArticle17({ ...sarl, adresse: null });
    expect(m.ligne).toContain('siège social : Kinshasa');
    expect(m.manquantes).toEqual(['adresse du siège social']);
    expect(mentionsArticle17({ ...sarl, adresse: '  ' }).manquantes).toEqual(['adresse du siège social']);
  });

  it('une mention absente n’est pas remplacée, elle est DITE manquante', () => {
    const m = mentionsArticle17({ ...sarl, capitalSocial: null, adresse: null, ville: null, rccm: null });
    expect(m.ligne).toBe('Société à responsabilité limitée');
    expect(m.manquantes).toEqual([
      'montant du capital social',
      'adresse du siège social',
      "numéro d'immatriculation au RCCM",
    ]);
  });

  it('les cinq sociétés commerciales de l’art. 6, et elles seules', () => {
    expect(FORMES_SOCIETES_COMMERCIALES).toHaveLength(5);
    for (const f of Object.values(FormeJuridiqueSyscohada)) {
      const m = mentionsArticle17({ ...sarl, formeJuridiqueSyscohada: f });
      if (FORMES_SOCIETES_COMMERCIALES.includes(f)) expect(m.ligne).not.toBeNull();
      else expect(m).toEqual({ ligne: null, manquantes: [] });
    }
  });

  it('rien pour un dossier SYCEBNL, ni pour une forme non renseignée', () => {
    expect(mentionsArticle17({ ...sarl, referentiel: Referentiel.SYCEBNL })).toEqual({ ligne: null, manquantes: [] });
    expect(mentionsArticle17({ ...sarl, formeJuridiqueSyscohada: null })).toEqual({ ligne: null, manquantes: [] });
  });

  it('une EBNL et une personne physique n’ont pas de capital social', () => {
    expect(motifRefusCapital(Referentiel.SYCEBNL, null)).toMatch(/but non lucratif/);
    expect(motifRefusCapital(Referentiel.SYSCOHADA, FormeJuridiqueSyscohada.ENTREPRENANT)).toMatch(/personne physique/);
    expect(motifRefusCapital(Referentiel.SYSCOHADA, FormeJuridiqueSyscohada.ENTREPRISE_INDIVIDUELLE)).toMatch(/personne physique/);
    expect(motifRefusCapital(Referentiel.SYSCOHADA, FormeJuridiqueSyscohada.SOCIETE_ANONYME)).toBeNull();
    // Forme pas encore déclarée · le capital reste saisissable.
    expect(motifRefusCapital(Referentiel.SYSCOHADA, null)).toBeNull();
  });
});

describe('Capital, courriel et site · la route', () => {
  const service = (capture: { data?: Record<string, unknown> }, tenant: Record<string, unknown>) =>
    new TenantService({
      tenant: {
        findUnique: async () => tenant,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          capture.data = data;
          return tenant;
        },
      },
      ecriture: { count: async () => 0 },
      compte: { findMany: async () => [] },
      devise: { findFirst: async () => null },
    } as never);

  const sarl = {
    id: 't1',
    nom: 'Démo SARL',
    referentiel: Referentiel.SYSCOHADA,
    formeJuridiqueSyscohada: FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE,
    capitalSocial: new Prisma.Decimal('2500000.50'),
    capitalVariable: false,
    adresse: null,
    ville: 'Kinshasa',
    rccm: null,
    devise: 'CDF',
  };

  it('pose le capital, le courriel et le site, et la chaîne vide efface', async () => {
    const capture: { data?: Record<string, unknown> } = {};
    const sa = { ...sarl, formeJuridiqueSyscohada: FormeJuridiqueSyscohada.SOCIETE_ANONYME };
    await service(capture, sa).modifierCoordonnees('t1', {
      capitalSocial: 1000000,
      capitalVariable: true,
      email: '  contact@demo.cd ',
      siteWeb: '',
    });
    expect(String(capture.data!.capitalSocial)).toBe('1000000');
    expect(capture.data!.capitalVariable).toBe(true);
    expect(capture.data!.email).toBe('contact@demo.cd');
    expect(capture.data!.siteWeb).toBeNull();
  });

  it('art. 269-1 · la route refuse « à capital variable » à une SARL, sans rien écrire, et laisse le retrait', async () => {
    const capture: { data?: Record<string, unknown> } = {};
    await expect(service(capture, sarl).modifierCoordonnees('t1', { capitalVariable: true })).rejects.toThrow(/art\. 269-1/);
    expect(capture.data).toBeUndefined();
    await service(capture, sarl).modifierCoordonnees('t1', { capitalVariable: false });
    expect(capture.data!.capitalVariable).toBe(false);
  });

  it('null efface le capital · non envoyé, il n’est pas touché', async () => {
    const capture: { data?: Record<string, unknown> } = {};
    await service(capture, sarl).modifierCoordonnees('t1', { capitalSocial: null });
    expect(capture.data!.capitalSocial).toBeNull();
    await service(capture, sarl).modifierCoordonnees('t1', { ville: 'Goma' });
    expect(capture.data!.capitalSocial).toBeUndefined();
  });

  it('refuse un capital à une ASBL et à un entreprenant, sans rien écrire', async () => {
    for (const t of [
      { ...sarl, referentiel: Referentiel.SYCEBNL, formeJuridiqueSyscohada: null },
      { ...sarl, formeJuridiqueSyscohada: FormeJuridiqueSyscohada.ENTREPRENANT },
    ]) {
      const capture: { data?: Record<string, unknown> } = {};
      await expect(service(capture, t).modifierCoordonnees('t1', { capitalSocial: 1000 })).rejects.toThrow(/capital social/);
      await expect(service(capture, t).modifierCoordonnees('t1', { capitalVariable: true })).rejects.toThrow(/capital social/);
      expect(capture.data).toBeUndefined();
      // Le retrait reste permis · nettoyer une valeur héritée.
      await service(capture, t).modifierCoordonnees('t1', { capitalSocial: null, capitalVariable: false });
      expect(capture.data!.capitalSocial).toBeNull();
    }
  });

  it('les paramètres rendent le capital en nombre et la ligne de l’art. 17', async () => {
    const p = (await service({}, { ...sarl, email: 'a@b.cd', siteWeb: 'demo.cd' }).parametres('t1')) as Record<string, unknown>;
    expect(p.capitalSocial).toBe(2500000.5);
    expect(p.email).toBe('a@b.cd');
    expect(p.siteWeb).toBe('demo.cd');
    expect(p.mentionsSociete).toEqual({
      ligne: 'Société à responsabilité limitée · au capital de 2 500 000,5 CDF · siège social : Kinshasa',
      manquantes: ['adresse du siège social', "numéro d'immatriculation au RCCM"],
    });
  });

  it('/auth/me porte la ligne jusqu’à l’en-tête d’impression', async () => {
    const Auth = AuthService as unknown as new (...a: unknown[]) => AuthService;
    const auth = new Auth(
      {
        user: {
          findUnique: async () => ({
            id: 'u1',
            email: 'x@y.cd',
            role: 'ADMIN_CABINET',
            tenantId: 't1',
            estOperateurPlateforme: false,
            doitChangerMotDePasse: false,
            tenant: { ...sarl, _count: { cellules: 0 } },
          }),
        },
      },
      ...Array.from({ length: 9 }, () => ({})),
    );
    const me = ((await auth.me('u1')) as unknown as { tenant: Record<string, unknown> }).tenant;
    expect(me.mentionsSociete).toBe('Société à responsabilité limitée · au capital de 2 500 000,5 CDF · siège social : Kinshasa');
  });
});

describe('Courriel de l’entité · le DTO', () => {
  it('une adresse mal formée est refusée, la chaîne vide passe (effacement)', async () => {
    expect(await validate(plainToInstance(ModifierCoordonneesDto, { email: 'pas-une-adresse' }))).toHaveLength(1);
    expect(await validate(plainToInstance(ModifierCoordonneesDto, { email: '' }))).toHaveLength(0);
    expect(await validate(plainToInstance(ModifierCoordonneesDto, { capitalSocial: -5 }))).toHaveLength(1);
    expect(await validate(plainToInstance(ModifierCoordonneesDto, { capitalSocial: null }))).toHaveLength(0);
  });
});
