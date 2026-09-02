import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { FormeJuridiqueEbnl, FormeJuridiqueSyscohada, Referentiel, SystemeComptableSyscohada } from '@prisma/client';
import { TenantService } from './tenant.service';
import { ModifierCoordonneesDto } from './dto/parametres-dossier.dto';

/**
 * COORDONNÉES DU DOSSIER · l'assistant de création annonçait « modifiable
 * plus tard » alors que rien ne l'était. Trois règles se jouent ici, et
 * aucune ne se lit dans le modèle Prisma :
 *  · la raison sociale et la monnaie ne s'effacent JAMAIS (elles figurent en
 *    tête de chaque état imprimé, la seconde comme unité des montants) ;
 *  · les autres champs s'effacent par une chaîne vide, comme les
 *    identifiants légaux ;
 *  · la monnaie se fige à la première écriture, changer l'étiquette ne
 *    convertissant aucun montant déjà saisi.
 */
describe('Coordonnées du dossier', () => {
  const service = (capture: { data?: Record<string, unknown> }, tenant: Record<string, unknown>, ecritures = 0) =>
    new TenantService({
      tenant: {
        findUnique: async () => tenant,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          capture.data = data;
          return tenant;
        },
      },
      ecriture: { count: async () => ecritures },
    } as never);

  it('la chaîne vide efface l’adresse mais ne touche ni la raison sociale ni la monnaie', async () => {
    const capture: { data?: Record<string, unknown> } = {};
    const s = service(capture, { id: 't1', devise: 'CDF' });
    await s.modifierCoordonnees('t1', { nom: '  VMG Consulting  ', adresse: '', ville: 'Kinshasa', devise: '' });
    expect(capture.data!.nom).toBe('VMG Consulting');
    expect(capture.data!.adresse).toBeNull();
    expect(capture.data!.ville).toBe('Kinshasa');
    // Une monnaie effacée priverait tout montant imprimé de son unité.
    expect(capture.data!.devise).toBeUndefined();
    // Jamais transmis = jamais modifié.
    expect(capture.data!.telephone).toBeUndefined();
  });

  it('la monnaie ne change plus dès qu’une écriture existe', async () => {
    const capture: { data?: Record<string, unknown> } = {};
    const s = service(capture, { id: 't1', devise: 'CDF' }, 12);
    await expect(s.modifierCoordonnees('t1', { devise: 'USD' })).rejects.toThrow(/monnaie/i);
    expect(capture.data).toBeUndefined();
  });

  it('la même monnaie renvoyée sur un dossier mouvementé ne bloque pas l’enregistrement', async () => {
    const capture: { data?: Record<string, unknown> } = {};
    const s = service(capture, { id: 't1', devise: 'CDF' }, 12);
    await s.modifierCoordonnees('t1', { devise: 'CDF', ville: 'Goma' });
    expect(capture.data!.ville).toBe('Goma');
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
