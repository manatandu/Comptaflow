import { readFileSync } from 'fs';
import { join } from 'path';
import { Prisma, SensFacture } from '@prisma/client';
import { FacturationService } from './facturation.service';
import { PrismaService } from '../../common/prisma.service';
import {
  AMENDE_PAR_OMISSION,
  FactureVerifiable,
  HOMOLOGATION,
  MENTIONS_ARTICLE_100,
  totauxFacture,
  verifierMentions,
} from './mentions-facture';
import { construireEtatDetaille } from './etat-detaille-tva';

type Faux = Record<string, unknown>;

const ligne = (sur: Partial<FactureVerifiable['lignes'][number]> = {}) => ({
  designation: 'Prestation de conseil',
  quantite: 1,
  prixUnitaire: 100_000,
  montantHT: 100_000,
  imposable: true,
  tauxApplique: 16,
  montantTva: 16_000,
  ...sur,
});

const facture = (sur: Partial<FactureVerifiable> = {}): FactureVerifiable => ({
  emetteurNom: 'VMG Consulting',
  emetteurNumeroImpot: 'A1234567X',
  contrepartieNom: 'Client SARL',
  contrepartieNumeroImpot: 'B7654321Y',
  dateFacture: new Date('2026-09-10'),
  numeroSerie: 'FV-2026-0001',
  lignes: [ligne()],
  ...sur,
});

describe('Les mentions de l’art. 100 · les neuf groupes du texte', () => {
  it('les neuf groupes sont ceux du décret, dans son ordre, et pas un de plus', () => {
    // Le texte les sépare par NEUF points-virgules · en ajouter un dixième
    // inventerait une mention, en fusionner deux en effacerait une. Le nombre
    // est EN DUR pour qu'on rouvre le décret le jour où quelqu'un y touche.
    expect(MENTIONS_ARTICLE_100).toHaveLength(9);
    expect(MENTIONS_ARTICLE_100.map((m) => m.cle)).toEqual([
      'IDENTITE_VENDEUR',
      'IDENTITE_CLIENT',
      'DATE_ET_NUMERO',
      'DESIGNATION_ET_QUANTITE',
      'PRIX_UNITAIRE_ET_GLOBAL',
      'PRIX_HORS_TVA',
      'TAUX_ET_MONTANT_TVA',
      'MONTANT_NON_TAXABLE',
      'MONTANT_TTC',
    ]);
  });

  it('une facture complète sert les neuf', () => {
    const v = verifierMentions(facture(), true);
    expect(v.conforme).toBe(true);
    expect(v.manquantes).toEqual([]);
  });

  it('C’EST L’ÉTAT D’AVANT QUI EST FAUTIF · une pièce sans lignes manque SIX groupes', () => {
    // Le défaut que ce chantier ferme. Avant lui, une vente n'était qu'une
    // écriture avec un `reference` libre : ni désignation, ni quantité, ni
    // prix unitaire, ni ventilation imposable. Six des neuf groupes de
    // l'art. 100 manquaient, et rien dans le logiciel ne le disait.
    const v = verifierMentions(facture({ lignes: [] }), true);
    expect(v.conforme).toBe(false);
    expect(v.manquantes.map((m) => m.cle)).toEqual([
      'DESIGNATION_ET_QUANTITE',
      'PRIX_UNITAIRE_ET_GLOBAL',
      'PRIX_HORS_TVA',
      'TAUX_ET_MONTANT_TVA',
      'MONTANT_NON_TAXABLE',
      'MONTANT_TTC',
    ]);
    // Les trois servis sont ceux qu'une écriture portait déjà.
    expect(v.presentes).toEqual(['IDENTITE_VENDEUR', 'IDENTITE_CLIENT', 'DATE_ET_NUMERO']);
  });

  it('l’identité se sert du NOM ET du numéro impôt · pas de l’un des deux', () => {
    expect(verifierMentions(facture({ contrepartieNumeroImpot: null }), true).manquantes.map((m) => m.cle)).toEqual([
      'IDENTITE_CLIENT',
    ]);
    expect(verifierMentions(facture({ emetteurNumeroImpot: '   ' }), true).manquantes.map((m) => m.cle)).toEqual([
      'IDENTITE_VENDEUR',
    ]);
  });

  it('la date ET le n° de série sont un seul groupe · le texte les écrit ensemble', () => {
    expect(verifierMentions(facture({ numeroSerie: '' }), true).manquantes.map((m) => m.cle)).toEqual(['DATE_ET_NUMERO']);
  });

  it('une ligne EXONÉRÉE sans taux ne fait PAS manquer la mention de TVA', () => {
    // L'art. 100 demande au contraire de distinguer les sommes imposables des
    // non imposables · réclamer un taux sur une ligne exonérée ferait mentir la
    // facture, et le logiciel signalerait un manquement inexistant (§ 10 bis).
    const v = verifierMentions(
      facture({ lignes: [ligne({ imposable: false, tauxApplique: null, montantTva: 0 })] }),
      true,
    );
    expect(v.conforme).toBe(true);
  });

  it('une ligne IMPOSABLE sans taux fait manquer la mention de TVA', () => {
    const v = verifierMentions(facture({ lignes: [ligne({ tauxApplique: null })] }), true);
    expect(v.manquantes.map((m) => m.cle)).toEqual(['TAUX_ET_MONTANT_TVA']);
  });
});

describe('L’amende de l’art. 97 bis · un barème unitaire, jamais un total', () => {
  it('750.000 FC pour une personne morale, 250.000 FC pour une personne physique', () => {
    expect(verifierMentions(facture(), true).amendeUnitaire).toBe(750_000);
    expect(verifierMentions(facture(), false).amendeUnitaire).toBe(250_000);
    expect(AMENDE_PAR_OMISSION.source).toMatch(/art\. 97 bis/);
  });

  it('la réserve accompagne TOUJOURS le barème, même sur une facture conforme', () => {
    // L'art. 97 bis sanctionne « par omission » sans définir l'unité de
    // l'omission · le groupe de l'art. 100, ou chacun de ses éléments. Un
    // montant total serait un barème inventé.
    for (const conforme of [true, false]) {
      const v = verifierMentions(conforme ? facture() : facture({ lignes: [] }), true);
      expect(v.reserveAmende).toMatch(/ne se déduit donc pas du nombre de groupes manquants/);
    }
  });

  it('AUCUN TOTAL n’est calculé dans la source · la propriété se gèle là où elle vit', () => {
    // Aucun jeu d'essai ne peut montrer l'absence d'une multiplication : elle
    // se fige dans le fichier, comme l'absence de prorata dans
    // `comparabilite-exercices.ts`.
    const source = readFileSync(join(__dirname, 'mentions-facture.ts'), 'utf8');
    expect(source).not.toMatch(/amendeTotale|montantEncouru|manquantes\.length\s*\*/);
  });
});

describe('L’homologation que le logiciel n’a pas', () => {
  it('OmegaX n’est PAS homologué, et le module le dit au lieu de le taire', () => {
    // Art. 59 quater · « les systèmes de facturation propres doivent […] être
    // HOMOLOGUÉS avant toute utilisation ». Un écran qui imprimerait une pièce
    // d'allure officielle sans le dire ferait croire à un cabinet qu'il est en
    // règle · c'est le § 10 bis dans le sens le plus coûteux.
    expect(HOMOLOGATION.omegaxHomologue).toBe(false);
    expect(HOMOLOGATION.consequence).toMatch(/n[’']est PAS une facture normalisée/);
    expect(HOMOLOGATION.source).toMatch(/art\. 58 et 59 quater/);
  });

  it('aucun fichier du module ne présente sa sortie comme une facture normalisée', () => {
    for (const fichier of ['mentions-facture.ts', 'etat-detaille-tva.ts', 'facturation.service.ts']) {
      const source = readFileSync(join(__dirname, fichier), 'utf8');
      // Le mot peut figurer, mais jamais pour qualifier ce que le module
      // produit · il n'apparaît que dans la citation du texte et dans le refus.
      const affirmations = source.match(/produi[a-z]*\s+une\s+facture\s+normalisée/gi) ?? [];
      expect(affirmations).toEqual([]);
    }
  });
});

describe('Les totaux du pied de facture', () => {
  it('le montant NON TAXABLE se sépare du montant imposable', () => {
    const t = totauxFacture(
      facture({
        lignes: [
          ligne({ montantHT: 100_000, montantTva: 16_000 }),
          ligne({ montantHT: 40_000, imposable: false, tauxApplique: null, montantTva: 0 }),
        ],
      }),
    );
    expect(t.montantHT).toBe(140_000);
    expect(t.montantNonTaxable).toBe(40_000);
    expect(t.montantImposable).toBe(100_000);
    expect(t.montantTva).toBe(16_000);
    expect(t.montantTTC).toBe(156_000);
  });
});

// ---------------------------------------------------------------------------

const achat = (sur: Faux = {}) => ({
  numeroSerie: 'FA-001',
  dateFacture: new Date('2026-09-04'),
  fournisseurNom: 'Fournisseur SARL',
  fournisseurNumeroImpot: 'C1111111Z',
  lignes: [{ designation: 'Papier', quantite: 10, prixHT: 50_000, montantTva: 8_000, imposable: true }],
  ...sur,
});

describe('L’état détaillé de l’art. 56 · la condition du droit à déduction', () => {
  it('rend une ligne par ligne de facture, avec les données que l’art. 134 nomme', () => {
    const e = construireEtatDetaille('2026-09', [achat()]);
    expect(e.lignes).toHaveLength(1);
    expect(e.lignes[0]).toMatchObject({
      fournisseurNom: 'Fournisseur SARL',
      fournisseurNumeroImpot: 'C1111111Z',
      numeroFacture: 'FA-001',
      dateFacture: '2026-09-04',
      designation: 'Papier',
      quantite: 10,
      prixHT: 50_000,
      tvaFacturee: 8_000,
      montantTTC: 58_000,
    });
    expect(e.totalHT).toBe(50_000);
    expect(e.totalTva).toBe(8_000);
    expect(e.totalTTC).toBe(58_000);
  });

  it('une ligne SANS numéro impôt du fournisseur est signalée, jamais écartée', () => {
    // L'écarter ferait un état apparemment complet, et c'est justement ce que
    // l'Administration refuse. Il est rendu ET dit incomplet.
    const e = construireEtatDetaille('2026-09', [achat({ fournisseurNumeroImpot: null })]);
    expect(e.lignes).toHaveLength(1);
    expect(e.complet).toBe(false);
    expect(e.incompletudes[0].manques).toEqual(['NUMERO_IMPOT_FOURNISSEUR']);
  });

  it('le volet IMPORTATIONS n’est JAMAIS couvert, et l’état le dit sur lui-même', () => {
    // OmegaX ne tient aucune déclaration en douane · déduire une valeur en
    // douane d'un compte d'achat l'inventerait. Lacune déclarée, pas comblée.
    const e = construireEtatDetaille('2026-09', [achat()]);
    expect(e.voletImportations.couvert).toBe(false);
    expect(e.voletImportations.motif).toMatch(/déclaration de mise à la consommation/);
  });

  it('la conséquence du défaut est portée par l’état, avec son délai de cinq jours', () => {
    const e = construireEtatDetaille('2026-09', []);
    expect(e.consequenceDuDefaut).toMatch(/RÉINTÉGRATION D[’']OFFICE/);
    expect(e.consequenceDuDefaut).toMatch(/cinq jours/);
  });

  it('refuse une période qui n’est pas un MOIS · la déclaration est mensuelle', () => {
    expect(() => construireEtatDetaille('2026', [])).toThrow(/MENSUELLE/);
    expect(() => construireEtatDetaille('2026-13', [])).toThrow(/MENSUELLE/);
  });
});

// ---------------------------------------------------------------------------

function service(factures: Faux[] = [], doublon: Faux | null = null) {
  const create = jest.fn().mockImplementation(({ data }: Faux) => {
    const d = data as Faux;
    return Promise.resolve({
      ...d,
      id: 'f1',
      lignes: ((d.lignes as Faux).create as Faux[]).map((l) => ({ ...l })),
    });
  });
  const prisma = {
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 't',
        nom: 'Le dossier',
        numeroImpot: 'A0000000A',
        formeJuridique: null,
        formeJuridiqueSyscohada: 'SOCIETE_RESPONSABILITE_LIMITEE',
      }),
    },
    tiers: { findFirst: jest.fn().mockResolvedValue(null) },
    ecriture: { findFirst: jest.fn().mockResolvedValue({ id: 'e1' }) },
    facture: {
      findMany: jest.fn().mockResolvedValue(factures),
      findFirst: jest.fn().mockResolvedValue(doublon),
      create,
      delete: jest.fn().mockResolvedValue({}),
    },
  } as Faux;
  return { svc: new FacturationService(prisma as unknown as PrismaService), prisma, create };
}

const dto = (sur: Faux = {}) => ({
  sens: SensFacture.VENTE,
  numeroSerie: 'FV-0001',
  dateFacture: '2026-09-10',
  contrepartieNom: 'Client SARL',
  contrepartieNumeroImpot: 'B7654321Y',
  lignes: [{ designation: 'Conseil', quantite: 1, prixUnitaire: 100_000, montantHT: 100_000, tauxApplique: 16, montantTva: 16_000 }],
  ...sur,
});

describe('Le service · qui est l’émetteur, et qui est la contrepartie', () => {
  it('SUR UNE VENTE, l’émetteur est le dossier', async () => {
    const { svc, create } = service();
    await svc.enregistrer('t', dto() as never);
    const data = (create.mock.calls[0][0] as Faux).data as Faux;
    expect(data.emetteurNom).toBe('Le dossier');
    expect(data.emetteurNumeroImpot).toBe('A0000000A');
    expect(data.contrepartieNom).toBe('Client SARL');
  });

  it('SUR UN ACHAT, l’émetteur est le FOURNISSEUR · l’art. 100 nomme le vendeur', async () => {
    // L'inverser ferait porter à l'état détaillé le nom du dossier comme
    // fournisseur de lui-même, sur un état qui boucle parfaitement.
    const { svc, create } = service();
    await svc.enregistrer('t', dto({ sens: SensFacture.ACHAT, contrepartieNom: 'Fournisseur SARL' }) as never);
    const data = (create.mock.calls[0][0] as Faux).data as Faux;
    expect(data.emetteurNom).toBe('Fournisseur SARL');
    expect(data.contrepartieNom).toBe('Le dossier');
  });

  it('refuse un n° de série déjà porté par une facture du MÊME sens', async () => {
    const { svc } = service([], { id: 'deja' });
    await expect(svc.enregistrer('t', dto() as never)).rejects.toThrow(/déjà porté/);
  });

  it('l’unicité du n° de série est bornée au SENS · la numérotation reçue est celle du fournisseur', async () => {
    const { svc, prisma } = service();
    await svc.enregistrer('t', dto({ sens: SensFacture.ACHAT }) as never);
    const ou = ((prisma.facture as Faux).findFirst as jest.Mock).mock.calls[0][0].where;
    expect(ou.sens).toBe(SensFacture.ACHAT);
  });
});

describe('L’état détaillé ne lit QUE les factures d’achat', () => {
  it('borne sa requête au sens ACHAT et au mois demandé', async () => {
    const { svc, prisma } = service([]);
    await svc.etatDetaille('t', '2026-09');
    const ou = ((prisma.facture as Faux).findMany as jest.Mock).mock.calls[0][0].where;
    expect(ou.sens).toBe(SensFacture.ACHAT);
    expect(ou.dateFacture.gte).toEqual(new Date(Date.UTC(2026, 8, 1)));
    expect(ou.dateFacture.lt).toEqual(new Date(Date.UTC(2026, 9, 1)));
  });

  it('prend le FOURNISSEUR sur l’émetteur, jamais sur la contrepartie', async () => {
    // Sur un achat, la contrepartie EST le dossier · la lire ferait un état
    // détaillé où chaque ligne nomme le dossier comme son propre fournisseur.
    const { svc, prisma } = service([
      {
        numeroSerie: 'FA-9',
        dateFacture: new Date('2026-09-04'),
        emetteurNom: 'Fournisseur SARL',
        emetteurNumeroImpot: 'C1111111Z',
        contrepartieNom: 'Le dossier',
        contrepartieNumeroImpot: 'A0000000A',
        lignes: [
          {
            designation: 'Papier',
            quantite: new Prisma.Decimal(10),
            montantHT: new Prisma.Decimal(50_000),
            montantTva: new Prisma.Decimal(8_000),
            imposable: true,
          },
        ],
      },
    ]);
    void prisma;
    const e = await svc.etatDetaille('t', '2026-09');
    expect(e.lignes[0].fournisseurNom).toBe('Fournisseur SARL');
    expect(e.lignes[0].fournisseurNumeroImpot).toBe('C1111111Z');
  });

  it('refuse une période mal formée avant toute lecture de la base', async () => {
    const { svc, prisma } = service([]);
    await expect(svc.etatDetaille('t', '2026')).rejects.toThrow(/AAAA-MM/);
    expect((prisma.facture as Faux).findMany as jest.Mock).not.toHaveBeenCalled();
  });
});
