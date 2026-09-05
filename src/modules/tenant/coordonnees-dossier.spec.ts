import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { FormeJuridiqueEbnl, FormeJuridiqueSyscohada, Referentiel, SystemeComptableSyscohada } from '@prisma/client';
import { TenantService } from './tenant.service';
import { ModifierCoordonneesDto } from './dto/parametres-dossier.dto';

/**
 * COORDONNÉES DU DOSSIER · l'assistant de création annonçait « modifiable
 * plus tard » alors que rien ne l'était. Trois règles se jouent ici, et
 * aucune ne se lit dans le modèle Prisma :
 *  · la raison sociale ne s'efface JAMAIS (elle figure en tête de chaque état
 *    imprimé) ;
 *  · les autres champs s'effacent par une chaîne vide, comme les
 *    identifiants légaux ;
 *  · la MONNAIE DE TENUE ne se modifie plus du tout · elle ne convertissait
 *    rien, elle étiquetait le cartouche (« montants en X »), si bien qu'en
 *    changer la valeur imprimait une unité fausse sur toute la liasse. La
 *    tenue en franc congolais n'est d'ailleurs pas une option : loi
 *    n° 23/053 art. 141, 1° et AUDCIF art. 17, 1° ;
 *  · la MONNAIE FONCTIONNELLE, elle, se pose et se retire librement · elle ne
 *    touche aucun montant et ne nomme que le second jeu de documents, sans
 *    valeur légale. Elle doit être une devise déjà ouverte dans le dossier.
 */
describe('Coordonnées du dossier', () => {
  const service = (
    capture: { data?: Record<string, unknown> },
    tenant: Record<string, unknown>,
    ecritures = 0,
    devisesOuvertes: string[] = [],
  ) =>
    new TenantService({
      tenant: {
        findUnique: async () => tenant,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          capture.data = data;
          return tenant;
        },
      },
      ecriture: { count: async () => ecritures },
      // Les devises OUVERTES du dossier · c'est par elles que la monnaie
      // fonctionnelle est validée.
      devise: {
        findFirst: async ({ where }: { where: { code: string } }) =>
          devisesOuvertes.includes(where.code) ? { id: 'd-1' } : null,
      },
    } as never);

  it('la chaîne vide efface l’adresse mais ne touche ni la raison sociale ni la tenue', async () => {
    const capture: { data?: Record<string, unknown> } = {};
    const s = service(capture, { id: 't1', devise: 'CDF' });
    await s.modifierCoordonnees('t1', { nom: '  VMG Consulting  ', adresse: '', ville: 'Kinshasa' });
    expect(capture.data!.nom).toBe('VMG Consulting');
    expect(capture.data!.adresse).toBeNull();
    expect(capture.data!.ville).toBe('Kinshasa');
    // La monnaie de tenue n'est plus écrite du tout par ce chemin.
    expect(capture.data!.devise).toBeUndefined();
    expect(capture.data!.telephone).toBeUndefined();
  });

  it('la monnaie de tenue n’est plus une valeur qu’un client puisse envoyer', async () => {
    // ELLE NE CONVERTISSAIT RIEN · elle étiquetait le cartouche de chaque état
    // (« montants en X »). La changer imprimait donc « montants en USD » sur
    // une liasse en francs, sans toucher un montant : une falsification de
    // tous les états publiés, en trois clics. Or la tenue en franc congolais
    // n'est pas une option · loi n° 23/053 art. 141, 1° et AUDCIF art. 17, 1°.
    //
    // Le champ ne se refuse pas, il n'existe plus : `forbidNonWhitelisted`
    // rejette la requête entière (voir bootstrap.ts).
    const avecDevise = await validate(
      plainToInstance(ModifierCoordonneesDto, { nom: 'A', devise: 'USD' }),
      { whitelist: true, forbidNonWhitelisted: true },
    );
    expect(avecDevise).toHaveLength(1);
    expect(JSON.stringify(avecDevise)).toContain('devise');
  });

  it('la monnaie FONCTIONNELLE se pose, et seulement si le dossier la connaît', async () => {
    const capture: { data?: Record<string, unknown> } = {};
    const s = service(capture, { id: 't1', devise: 'CDF' }, 12, ['USD']);
    // Un dossier mouvementé ne la bloque pas · elle ne touche aucun montant.
    await s.modifierCoordonnees('t1', { deviseFonctionnelle: 'usd' });
    expect(capture.data!.deviseFonctionnelle).toBe('USD');
  });

  it('refuse une monnaie fonctionnelle que le dossier n’a jamais ouverte', async () => {
    // Sans ce refus, le second jeu se produirait avec des lignes muettes,
    // faute de cours · un jeu incomplet qui ne se dit pas incomplet est pire
    // qu'un refus.
    const capture: { data?: Record<string, unknown> } = {};
    const s = service(capture, { id: 't1', devise: 'CDF' }, 0, []);
    await expect(s.modifierCoordonnees('t1', { deviseFonctionnelle: 'EUR' })).rejects.toThrow(
      /n’est pas ouverte dans ce dossier/,
    );
    expect(capture.data).toBeUndefined();
  });

  it('refuse le franc congolais comme monnaie fonctionnelle', async () => {
    // Le second jeu ferait double emploi avec le jeu légal.
    const capture: { data?: Record<string, unknown> } = {};
    const s = service(capture, { id: 't1', devise: 'CDF' }, 0, ['CDF']);
    await expect(s.modifierCoordonnees('t1', { deviseFonctionnelle: 'CDF' })).rejects.toThrow(
      /monnaie de tenue/,
    );
  });

  it('la chaîne vide retire la monnaie fonctionnelle', async () => {
    const capture: { data?: Record<string, unknown> } = {};
    const s = service(capture, { id: 't1', devise: 'CDF' }, 12, ['USD']);
    await s.modifierCoordonnees('t1', { deviseFonctionnelle: '' });
    expect(capture.data!.deviseFonctionnelle).toBeNull();
  });

  it('le DTO refuse une raison sociale vide', async () => {
    const vide = await validate(plainToInstance(ModifierCoordonneesDto, { nom: '' }));
    expect(vide).toHaveLength(1);
    const rempli = await validate(plainToInstance(ModifierCoordonneesDto, { nom: 'A', adresse: '' }));
    expect(rempli).toHaveLength(0);
  });

  it('le système comptable est refusé hors SYSCOHADA et figé par la première écriture', async () => {
    const capture: { data?: Record<string, unknown> } = {};
    // Un dossier SYCEBNL n'a pas de système SYSCOHADA : il a un jeu d'états.
    const sycebnl = service(capture, { id: 't1', referentiel: Referentiel.SYCEBNL });
    await expect(
      sycebnl.modifierSystemeSyscohada('t1', SystemeComptableSyscohada.MINIMAL_TRESORERIE),
    ).rejects.toThrow();

    const mouvemente = service(
      capture,
      {
        id: 't2',
        referentiel: Referentiel.SYSCOHADA,
        systemeComptableSyscohada: SystemeComptableSyscohada.NORMAL,
      },
      5,
    );
    await expect(
      mouvemente.modifierSystemeSyscohada('t2', SystemeComptableSyscohada.MINIMAL_TRESORERIE),
    ).rejects.toThrow();
    expect(capture.data).toBeUndefined();

    const vierge = service(capture, {
      id: 't3',
      referentiel: Referentiel.SYSCOHADA,
      systemeComptableSyscohada: SystemeComptableSyscohada.NORMAL,
    });
    await vierge.modifierSystemeSyscohada('t3', SystemeComptableSyscohada.MINIMAL_TRESORERIE);
    expect(capture.data!.systemeComptableSyscohada).toBe(SystemeComptableSyscohada.MINIMAL_TRESORERIE);
  });

  /*
    FORME JURIDIQUE · les deux référentiels ont chacun la leur, et elles
    n'ont AUCUNE valeur commune. L'écran servait pourtant la liste de la loi
    congolaise n° 004/2001 aux deux, proposant « association confessionnelle »
    à une SARL. Le refus est posé côté serveur, pas seulement côté écran : un
    appel direct à la route contournerait un simple masquage.
  */
  it('la forme juridique OHADA est refusée à un dossier SYCEBNL', async () => {
    const capture: { data?: Record<string, unknown> } = {};
    const asbl = service(capture, { id: 't1', referentiel: Referentiel.SYCEBNL });
    await expect(asbl.modifierFormeSyscohada('t1', FormeJuridiqueSyscohada.SOCIETE_ANONYME)).rejects.toThrow(
      /SYSCOHADA/,
    );
    expect(capture.data).toBeUndefined();
  });

  it('la forme juridique de la loi n° 004/2001 est refusée à un dossier SYSCOHADA', async () => {
    const capture: { data?: Record<string, unknown> } = {};
    // LA PORTE N'ÉTAIT FERMÉE QUE DANS UN SENS. Un dossier SYSCOHADA pouvait
    // recevoir une forme EBNL, et le planning de clôture lui servait alors le
    // rapport d'activité au Ministère du Plan (loi n° 004/2001, art. 44-45),
    // qui ne vise qu'une ONG.
    const societe = service(capture, { id: 't2', referentiel: Referentiel.SYSCOHADA });
    await expect(
      societe.modifierFormeJuridique('t2', FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE),
    ).rejects.toThrow(/SYCEBNL/);
    expect(capture.data).toBeUndefined();

    // Et elle reste ouverte là où elle a un sens.
    const asbl = service(capture, { id: 't1', referentiel: Referentiel.SYCEBNL });
    await asbl.modifierFormeJuridique('t1', FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE);
    expect(capture.data!.formeJuridique).toBe(FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE);
  });

  it('la forme juridique OHADA se pose et se corrige à tout moment sur un dossier SYSCOHADA', async () => {
    const capture: { data?: Record<string, unknown> } = {};
    // Contrairement au système comptable, elle n'est PAS figée par la
    // première écriture : la transformation d'une société en une autre forme
    // est un événement ordinaire de la vie sociale (AUSCGIE art. 181), et
    // elle ne change ni le plan de comptes ni la présentation des états.
    const societe = service(capture, { id: 't2', referentiel: Referentiel.SYSCOHADA }, 400);
    await societe.modifierFormeSyscohada('t2', FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE);
    expect(capture.data!.formeJuridiqueSyscohada).toBe(FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE);
  });
});
