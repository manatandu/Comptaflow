import { TenantService } from './tenant.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * LE DÉFAUT DU SCHÉMA QUI FUIT · trois colonnes du dossier ont une valeur par
 * défaut en base qui n'a de sens qu'en SYCEBNL :
 * `jeuEtatsFinanciersSycebnl` (ASSOCIATIONS_ORDRES_PROFESSIONNELS),
 * `formeJuridique` (ASSOCIATION, loi n° 004/2001) et `droitEtranger` (false,
 * art. 29 à 34 de la même loi). Une SARL tenue en SYSCOHADA les porte sans
 * les avoir jamais déclarées, et l'API les servait telles quelles · la bande
 * d'accueil a réellement annoncé « Associations et ordres professionnels » à
 * une société commerciale.
 *
 * Ce que ces tests figent : hors SYCEBNL, la RÉPONSE vaut `null` · pas le
 * défaut, pas une chaîne vide, pas une valeur à interpréter. Et en SYCEBNL,
 * elle vaut toujours ce que porte le dossier · un test qui ne vérifierait
 * que le `null` passerait avec une fonction qui renvoie toujours `null`.
 *
 * Le schéma, lui, ne bouge pas : trois lecteurs (export de la liasse, livre
 * d'inventaire, contrôles) lisent ces colonnes en supposant qu'elles ne sont
 * jamais nulles. Voir `src/common/reponse-referentiel.ts`.
 */

const DOSSIER = {
  id: 't1',
  nom: 'Dossier',
  jeuEtatsFinanciersSycebnl: 'ASSOCIATIONS_ORDRES_PROFESSIONNELS',
  systemeComptableSyscohada: null,
  activite: null,
  adresse: null,
  ville: null,
  pays: null,
  telephone: null,
  devise: 'CDF',
  numeroImpot: null,
  idNat: null,
  rccm: null,
  actePersonnaliteJuridique: null,
  dateActePersonnalite: null,
  numeroEnregistrementSecteur: null,
  certificatEnregistrementPlan: null,
  attestationExemptionIs: null,
  formeJuridique: 'ASSOCIATION',
  formeJuridiqueSyscohada: null,
  droitEtranger: false,
  longueurCompte: 8,
  assujettiTva: false,
  dateOptionTva: null,
  regimeExigibiliteTva: null,
  dateAutorisationDebitsTva: null,
  effectifPermanent: null,
};

function service(referentiel: string, surcharge: Record<string, unknown> = {}) {
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue({ ...DOSSIER, referentiel, ...surcharge }) },
    ecriture: { count: jest.fn().mockResolvedValue(0) },
  } as unknown as PrismaService;
  return new TenantService(prisma);
}

describe('Paramètres du dossier · les champs propres au SYCEBNL', () => {
  it('ne sert AUCUN champ SYCEBNL à un dossier SYSCOHADA', async () => {
    const p = await service('SYSCOHADA').parametres('t1');
    expect(p.jeuEtatsFinanciersSycebnl).toBeNull();
    expect(p.formeJuridique).toBeNull();
    expect(p.droitEtranger).toBeNull();
  });

  it('sert ces mêmes champs à un dossier SYCEBNL', async () => {
    const p = await service('SYCEBNL', {
      jeuEtatsFinanciersSycebnl: 'PROJETS_DEVELOPPEMENT',
      formeJuridique: 'ORGANISATION_NON_GOUVERNEMENTALE',
      droitEtranger: true,
    }).parametres('t1');
    expect(p.jeuEtatsFinanciersSycebnl).toBe('PROJETS_DEVELOPPEMENT');
    expect(p.formeJuridique).toBe('ORGANISATION_NON_GOUVERNEMENTALE');
    expect(p.droitEtranger).toBe(true);
  });

  it('sert `false` et non `null` à un dossier SYCEBNL de droit congolais', async () => {
    // Le piège du raccourci : `siSycebnl(ref, valeur) || null` aurait ramené
    // `false` à `null`, et l'écran aurait perdu la différence entre « de droit
    // congolais » et « non renseigné ».
    const p = await service('SYCEBNL', { droitEtranger: false }).parametres('t1');
    expect(p.droitEtranger).toBe(false);
  });

  it('laisse intacts les champs communs aux deux référentiels', async () => {
    // Le cloisonnement ne doit pas déborder : la devise, l'identifiant fiscal
    // et la longueur de compte n'ont rien de propre au SYCEBNL.
    const p = await service('SYSCOHADA', { numeroImpot: 'A1234567X', rccm: 'CD/KIN/RCCM/22-B-01' }).parametres('t1');
    expect(p.devise).toBe('CDF');
    expect(p.numeroImpot).toBe('A1234567X');
    expect(p.rccm).toBe('CD/KIN/RCCM/22-B-01');
    expect(p.longueurCompte).toBe(8);
  });
});
