import { readFileSync } from 'fs';
import { join } from 'path';
import { NatureOperationVente, NatureReponseDevis, Prisma, Referentiel } from '@prisma/client';
import { CommercialService } from './commercial.service';
import { PrismaService } from '../../common/prisma.service';
import {
  dateLimiteAcceptation,
  DELAI_NON_CHIFFRE,
  etatDevis,
  MOTIF_HORS_SYCEBNL,
  perimetreVenteCommerciale,
  qualifierOffre,
  revocabilite,
} from './vente-commerciale';

type Faux = Record<string, unknown>;

describe('Le périmètre du Livre 8 · ce qu’il ne régit PAS', () => {
  it('régit la vente de marchandises entre commerçants', () => {
    const p = perimetreVenteCommerciale('MARCHANDISES');
    expect(p.regiParLeLivre8).toBe(true);
    expect(p.article).toMatch(/art\. 234/);
  });

  it('NE régit PAS une prestation de services · art. 235 b)', () => {
    // Le piège du chantier. Une société de conseil, d'ingénierie, de
    // gardiennage ou de nettoyage vend des services : lui estampiller
    // « art. 241 » appliquerait une règle hors de son domaine.
    const p = perimetreVenteCommerciale('SERVICES');
    expect(p.regiParLeLivre8).toBe(false);
    expect(p.motif).toMatch(/ne régit que la vente de MARCHANDISES/);
  });

  it('NE régit PAS un contrat mixte à part de main-d’œuvre prépondérante', () => {
    const p = perimetreVenteCommerciale('MIXTE_SERVICES_PREPONDERANTS');
    expect(p.regiParLeLivre8).toBe(false);
    expect(p.article).toMatch(/235 b\)/);
    // ET LE LOGICIEL NE CALCULE PAS LA PRÉPONDÉRANCE · aucun compte ne dit si
    // la part de main-d'œuvre l'emporte.
    expect(p.motif).toMatch(/qualification du cabinet, pas\s+un calcul du logiciel/);
  });

  it('NE régit ni l’usage personnel ni les six régimes particuliers', () => {
    expect(perimetreVenteCommerciale('USAGE_PERSONNEL').regiParLeLivre8).toBe(false);
    expect(perimetreVenteCommerciale('USAGE_PERSONNEL').article).toMatch(/235 a\)/);
    const r = perimetreVenteCommerciale('REGIME_PARTICULIER');
    expect(r.regiParLeLivre8).toBe(false);
    expect(r.motif).toMatch(/électricité/);
  });

  it('le refus opposé à une ASBL porte sa raison, et ce n’est pas « elle ne vend rien »', () => {
    expect(MOTIF_HORS_SYCEBNL).toMatch(/ENTRE COMMERÇANTS/);
    expect(MOTIF_HORS_SYCEBNL).toMatch(/n['’]est pas commerçante/);
    expect(MOTIF_HORS_SYCEBNL).toMatch(/004\/2001/);
  });
});

const lignesPrecises = [{ designation: 'Ciment 42,5', quantite: 100, prixUnitaire: 25_000 }];

describe('Ce qui fait d’une proposition une OFFRE · art. 241', () => {
  it('les trois conditions réunies font une offre', () => {
    const q = qualifierOffre({ destinataireDetermine: true, volonteDEtreLie: true, lignes: lignesPrecises });
    expect(q.estUneOffre).toBe(true);
    expect(q.requalification).toBeNull();
  });

  it('sans destinataire déterminé, ce n’est qu’une INVITATION à l’offre', () => {
    const q = qualifierOffre({ destinataireDetermine: false, volonteDEtreLie: true, lignes: lignesPrecises });
    expect(q.estUneOffre).toBe(false);
    expect(q.requalification).toMatch(/INVITATION À L[’']OFFRE/);
  });

  it('des lignes imprécises retirent la qualité d’offre · désignation, quantité ET prix', () => {
    for (const ligne of [
      { designation: '', quantite: 1, prixUnitaire: 10 },
      { designation: 'Ciment', quantite: null, prixUnitaire: 10 },
      { designation: 'Ciment', quantite: 1, prixUnitaire: null },
    ]) {
      const q = qualifierOffre({ destinataireDetermine: true, volonteDEtreLie: true, lignes: [ligne] });
      expect(q.manques).toContain('LIGNES_IMPRECISES');
    }
    expect(qualifierOffre({ destinataireDetermine: true, volonteDEtreLie: true, lignes: [] }).manques).toContain(
      'LIGNES_IMPRECISES',
    );
  });

  it('sans volonté d’être lié, il n’y a pas d’offre non plus', () => {
    const q = qualifierOffre({ destinataireDetermine: true, volonteDEtreLie: false, lignes: lignesPrecises });
    expect(q.manques).toEqual(['VOLONTE_DETRE_LIE_NON_EXPRIMEE']);
  });
});

describe('Le délai · deux dates, et une seule le fait courir', () => {
  it('court depuis l’ÉMISSION (art. 246), jamais depuis la réception (art. 242)', () => {
    // Compter depuis la réception rallongerait l'offre de tout le temps
    // d'acheminement, et le logiciel tiendrait pour ouverte une offre close.
    const limite = dateLimiteAcceptation(new Date('2026-09-01T00:00:00Z'), 30);
    expect(limite!.toISOString().slice(0, 10)).toBe('2026-10-01');
  });

  it('sans délai stipulé, AUCUNE date n’est inventée · art. 243 renvoie au « délai raisonnable »', () => {
    expect(dateLimiteAcceptation(new Date('2026-09-01T00:00:00Z'), null)).toBeNull();
    expect(DELAI_NON_CHIFFRE).toMatch(/délai raisonnable/);
    const e = etatDevis({
      dateEmission: new Date('2020-01-01T00:00:00Z'),
      delaiJours: null,
      dateReponse: null,
      natureReponse: null,
      revoqueLe: null,
      reference: new Date('2026-09-13T00:00:00Z'),
    });
    // Six ans plus tard, et toujours EN_ATTENTE · le texte ne chiffre rien, et
    // le logiciel ne le remplace par aucune convention.
    expect(e.etat).toBe('EN_ATTENTE');
  });

  it('la source ne porte AUCUN délai par défaut', () => {
    const source = readFileSync(join(__dirname, 'vente-commerciale.ts'), 'utf8');
    expect(source).not.toMatch(/DELAI_PAR_DEFAUT|delaiJours\s*\?\?\s*\d|DELAI_RAISONNABLE_JOURS/);
  });
});

const base = {
  dateEmission: new Date('2026-09-01T00:00:00Z'),
  delaiJours: 30,
  dateReponse: null as Date | null,
  natureReponse: null as NatureReponseDevis | null,
  revoqueLe: null as Date | null,
};

describe('L’état du devis · le silence ne vaut RIEN', () => {
  it('LE DÉLAI ÉCOULÉ SANS RÉPONSE REND CADUC, ni accepté ni refusé', () => {
    // Le refus central. Art. 243 · « le silence ou l'inaction ne peut à lui
    // seul valoir acceptation ». Le porter en REFUSE attribuerait au client un
    // rejet qu'il n'a jamais exprimé ; en ACCEPTE, inventerait un contrat.
    const e = etatDevis({ ...base, reference: new Date('2026-10-15T00:00:00Z') });
    expect(e.etat).toBe('CADUC');
    expect(e.etat).not.toBe('REFUSE');
    expect(e.explication).toMatch(/NI accepté NI refusé/);
    expect(e.explication).toMatch(/le silence ou l[’']inaction/);
  });

  it('avant l’échéance et sans réponse, il est en attente', () => {
    expect(etatDevis({ ...base, reference: new Date('2026-09-15T00:00:00Z') }).etat).toBe('EN_ATTENTE');
  });

  it('une MODIFICATION NON SUBSTANTIELLE vaut ACCEPTATION · art. 245, second alinéa', () => {
    const e = etatDevis({
      ...base,
      natureReponse: NatureReponseDevis.MODIFICATION_NON_SUBSTANTIELLE,
      dateReponse: new Date('2026-09-10T00:00:00Z'),
      reference: new Date('2026-09-15T00:00:00Z'),
    });
    expect(e.etat).toBe('ACCEPTE');
    expect(e.explication).toMatch(/termes du contrat sont ceux de l[’']offre avec les/);
  });

  it('une MODIFICATION SUBSTANTIELLE vaut REJET et contre-proposition · art. 245, premier alinéa', () => {
    // C'est l'erreur de modélisation que ce test ferme : un bon de commande qui
    // s'écarte du devis n'est PAS une acceptation, et l'enregistrer comme telle
    // inscrirait un contrat qui n'existe pas.
    const e = etatDevis({
      ...base,
      natureReponse: NatureReponseDevis.MODIFICATION_SUBSTANTIELLE,
      dateReponse: new Date('2026-09-10T00:00:00Z'),
      reference: new Date('2026-09-15T00:00:00Z'),
    });
    expect(e.etat).toBe('CONTRE_PROPOSITION');
    expect(e.etat).not.toBe('ACCEPTE');
    expect(e.explication).toMatch(/VAUT REJET/);
  });

  it('une réponse PARVENUE prime sur le délai écoulé · art. 244', () => {
    const e = etatDevis({
      ...base,
      natureReponse: NatureReponseDevis.ACCEPTATION,
      dateReponse: new Date('2026-09-10T00:00:00Z'),
      reference: new Date('2027-01-01T00:00:00Z'),
    });
    expect(e.etat).toBe('ACCEPTE');
  });

  it('une révocation antérieure à la référence rend l’offre révoquée', () => {
    const e = etatDevis({ ...base, revoqueLe: new Date('2026-09-05T00:00:00Z'), reference: new Date('2026-09-10T00:00:00Z') });
    expect(e.etat).toBe('REVOQUE');
  });
});

describe('La révocabilité · un délai seul ne rend pas l’offre ferme', () => {
  it('DEUX CONDITIONS CUMULATIVES · art. 242', () => {
    // Le piège : « valable jusqu'au 30 » n'engage à rien. Déduire
    // l'irrévocabilité de la seule présence d'une date ferait croire au cabinet
    // qu'il est tenu, et l'empêcherait de révoquer une offre devenue ruineuse.
    expect(revocabilite({ delaiJours: 30, declareeIrrevocable: false, dejaAcceptee: false }).revocable).toBe(true);
    expect(revocabilite({ delaiJours: null, declareeIrrevocable: true, dejaAcceptee: false }).revocable).toBe(true);
    expect(revocabilite({ delaiJours: 30, declareeIrrevocable: true, dejaAcceptee: false }).revocable).toBe(false);
  });

  it('une offre déjà acceptée ne se révoque plus', () => {
    expect(revocabilite({ delaiJours: null, declareeIrrevocable: false, dejaAcceptee: true }).revocable).toBe(false);
  });

  it('la SECONDE branche de l’art. 242 est dite, jamais calculée', () => {
    const r = revocabilite({ delaiJours: 30, declareeIrrevocable: false, dejaAcceptee: false });
    expect(r.reserve).toMatch(/raisonnablement fondé à croire/);
    expect(r.reserve).toMatch(/le logiciel ne tranche pas/);
  });
});

// ---------------------------------------------------------------------------

function service(opts: { referentiel?: Referentiel; devis?: Faux[]; unDevis?: Faux | null } = {}) {
  const update = jest.fn().mockImplementation(({ data }: Faux) => Promise.resolve({ ...(opts.unDevis as Faux), ...(data as Faux), lignes: [] }));
  const create = jest.fn().mockImplementation(({ data }: Faux) => {
    const d = data as Faux;
    return Promise.resolve({ ...d, id: 'd1', lignes: ((d.lignes as Faux).create as Faux[]).map((l) => ({ ...l })) });
  });
  const prisma = {
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 't',
        nom: 'Le dossier',
        referentiel: opts.referentiel ?? Referentiel.SYSCOHADA,
        formeJuridiqueSyscohada: 'SOCIETE_RESPONSABILITE_LIMITEE',
        capitalSocial: null,
        capitalVariable: false,
        adresse: null,
        ville: null,
        rccm: null,
        devise: 'CDF',
      }),
    },
    tiers: { findFirst: jest.fn().mockResolvedValue(null) },
    devis: {
      findMany: jest.fn().mockResolvedValue(opts.devis ?? []),
      // LA DOUBLURE DISCRIMINE SUR LE `where`, comme la vraie base · le
      // service interroge `findFirst` DEUX fois pour des questions
      // différentes (un numéro déjà pris, puis le devis d'origine d'une
      // contre-proposition). Une doublure qui répondrait la même chose aux
      // deux validerait un service qui ne distingue pas ses propres requêtes.
      findFirst: jest.fn().mockImplementation((args: Faux) => {
        const ou = (args?.where ?? {}) as Faux;
        if ('numero' in ou) return Promise.resolve(null);
        return Promise.resolve(opts.unDevis === undefined ? null : opts.unDevis);
      }),
      create,
      update,
    },
  } as Faux;
  return { svc: new CommercialService(prisma as unknown as PrismaService), prisma, create, update };
}

const dto = (sur: Faux = {}) => ({
  numero: 'DV-0001',
  dateEmission: '2026-09-01',
  nature: NatureOperationVente.MARCHANDISES,
  clientNom: 'Client SARL',
  delaiJours: 30,
  lignes: [{ designation: 'Ciment', quantite: 100, prixUnitaire: 25_000, montantHT: 2_500_000 }],
  ...sur,
});

describe('Le service · le refus de périmètre est au SERVEUR, pas seulement à l’écran', () => {
  it('refuse un dossier SYCEBNL avec la raison du texte', async () => {
    const { svc } = service({ referentiel: Referentiel.SYCEBNL });
    await expect(svc.lister('t')).rejects.toThrow(/ENTRE COMMERÇANTS/);
    await expect(svc.emettre('t', dto() as never)).rejects.toThrow(/n['’]est pas commerçante/);
  });
});

describe('Le service · la contre-proposition ne naît que d’un rejet', () => {
  it('refuse de rattacher une contre-proposition à un devis sans réponse', async () => {
    const { svc } = service({ unDevis: { id: 'p1', natureReponse: null, emetteur: 'DOSSIER', contreProposition: null } });
    await expect(svc.emettre('t', dto({ numero: 'DV-2', contrePropositionDeId: 'p1' }) as never)).rejects.toThrow(
      /MODIFICATION SUBSTANTIELLE/,
    );
  });

  it('refuse de la rattacher à un devis ACCEPTÉ · le contrat est formé', async () => {
    const { svc } = service({
      unDevis: { id: 'p1', natureReponse: NatureReponseDevis.ACCEPTATION, emetteur: 'DOSSIER', contreProposition: null },
    });
    await expect(svc.emettre('t', dto({ numero: 'DV-2', contrePropositionDeId: 'p1' }) as never)).rejects.toThrow(
      /art\. 245/,
    );
  });

  it('INVERSE L’ÉMETTEUR · l’offre nouvelle vient de celui qui a rejeté', async () => {
    const { svc, create } = service({
      unDevis: {
        id: 'p1',
        natureReponse: NatureReponseDevis.MODIFICATION_SUBSTANTIELLE,
        emetteur: 'DOSSIER',
        contreProposition: null,
      },
    });
    await svc.emettre('t', dto({ numero: 'DV-2', contrePropositionDeId: 'p1' }) as never);
    expect(((create.mock.calls[0][0] as Faux).data as Faux).emetteur).toBe('CLIENT');
    // L'offre vient du client · son capital n'est pas connu, rien n'est recopié.
    expect(((create.mock.calls[0][0] as Faux).data as Faux).mentionsSocieteEmetteur).toBe(Prisma.DbNull);
  });

  it('un devis ÉMIS par le dossier recopie les mentions de l’AUSCGIE art. 17 à sa date', async () => {
    const { svc, create } = service();
    await svc.emettre('t', dto() as never);
    const recopie = ((create.mock.calls[0][0] as Faux).data as Faux).mentionsSocieteEmetteur as Faux;
    expect(recopie.denomination).toBe('Le dossier');
    expect(recopie.ligne).toBe('Société à responsabilité limitée');
    // Rien n'est deviné · ce qui manque au dossier reste écrit sur la pièce.
    expect(recopie.manquantes).toEqual(['montant du capital social', 'adresse du siège social', "numéro d'immatriculation au RCCM"]);
  });
});

describe('Le service · la réponse est un fait REÇU', () => {
  const devisEnAttente = {
    id: 'd1',
    tenantId: 't',
    emetteur: 'DOSSIER',
    numero: 'DV-1',
    dateEmission: new Date('2026-09-01T00:00:00Z'),
    delaiJours: 30,
    declareeIrrevocable: false,
    destinataireDetermine: true,
    volonteDEtreLie: true,
    nature: NatureOperationVente.MARCHANDISES,
    clientNom: 'Client SARL',
    natureReponse: null,
    dateReponse: null,
    revoqueLe: null,
    lignes: [],
  };

  it('exige un écrit sur une modification · la substantialité se qualifie', async () => {
    const { svc } = service({ unDevis: devisEnAttente });
    await expect(
      svc.enregistrerReponse('t', 'd1', {
        natureReponse: NatureReponseDevis.MODIFICATION_SUBSTANTIELLE,
        dateReponse: '2026-09-10',
      } as never),
    ).rejects.toThrow(/elle se qualifie, elle ne se calcule pas/);
  });

  it('refuse une réponse parvenue APRÈS une révocation · art. 242', async () => {
    const { svc } = service({ unDevis: { ...devisEnAttente, revoqueLe: new Date('2026-09-05T00:00:00Z') } });
    await expect(
      svc.enregistrerReponse('t', 'd1', {
        natureReponse: NatureReponseDevis.ACCEPTATION,
        dateReponse: '2026-09-10',
      } as never),
    ).rejects.toThrow(/révoquée avant la date de cette réponse/);
  });

  it('refuse une réponse antérieure à l’émission', async () => {
    const { svc } = service({ unDevis: devisEnAttente });
    await expect(
      svc.enregistrerReponse('t', 'd1', {
        natureReponse: NatureReponseDevis.ACCEPTATION,
        dateReponse: '2026-08-01',
      } as never),
    ).rejects.toThrow(/avant que l[’']offre n[’']ait été émise/);
  });

  it('AUCUN CHEMIN DU SERVICE ne pose une réponse ailleurs que sur cet appel', () => {
    // Le garde-fou du « silence ne vaut pas acceptation » ne se montre par
    // aucun jeu d'essai : il tient à ce qu'aucune autre méthode n'écrive
    // `natureReponse`. La propriété se gèle donc dans la source.
    const source = readFileSync(join(__dirname, 'commercial.service.ts'), 'utf8');
    const ecritures = source.match(/natureReponse:\s*dto\.natureReponse/g) ?? [];
    expect(ecritures).toHaveLength(1);
    expect(source).not.toMatch(/natureReponse:\s*(NatureReponseDevis\.|'|")/);
  });
});

describe('Le prix du devis', () => {
  it('est un total HORS TAXES, et la présomption est rendue avec · art. 263', async () => {
    const { svc, create } = service();
    const vue = await svc.emettre('t', dto() as never);
    void create;
    expect(vue.totalHT).toBe(2_500_000);
    expect(vue.prixPresume.mention).toMatch(/présumé convenu hors taxes/);
    expect(vue.prixPresume.article).toMatch(/art\. 263/);
  });

  it('la liste rappelle qu’aucune forme n’est imposée · art. 240', async () => {
    const { svc } = service();
    const r = await svc.lister('t');
    expect(r.aucuneConditionDeForme.mention).toMatch(/écrit ou verbal/);
    expect(r.aucuneConditionDeForme.mention).toMatch(/Le devis n[’']est pas obligatoire/);
  });

  it('la liste porte les deux délais de dénonciation · art. 258 et 259', async () => {
    const { svc } = service();
    const r = await svc.lister('t');
    expect(r.delaisDeConformite.map((d) => d.cle)).toEqual(['APPARENT', 'CACHE']);
    expect(r.delaisDeConformite[0].delai).toMatch(/un mois/);
    expect(r.delaisDeConformite[1].delai).toMatch(/un an/);
  });
});

void Prisma;
