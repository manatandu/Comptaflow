import { readFileSync } from 'fs';
import { join } from 'path';
import { NatureFacture, Prisma, SensFacture } from '@prisma/client';
import { FacturationService } from './facturation.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * I3 · LA NOTE DE CRÉDIT.
 *
 * O.-L. n° 10/001, art. 52 al. 2 : « Pour les opérations annulées ou
 * résiliées, la récupération de la taxe acquittée est subordonnée à
 * l'établissement et à l'envoi au client d'une facture nouvelle ou note de
 * crédit annulant et remplaçant la facture initiale. »
 *
 * Décret n° 011/42, art. 127 : « Celle-ci doit être barrée et conservée dans
 * le facturier ou classeur des factures selon l'ordre chronologique de
 * numérotation. »
 *
 * Avant I3, le module TVA imputait la récupération dès qu'il voyait un débit
 * au 443, et le module facturation ne savait émettre aucune note.
 */

type Faux = Record<string, unknown>;

const d = (n: number) => new Prisma.Decimal(n);

const INITIALE = {
  id: 'fv1',
  tenantId: 't',
  sens: SensFacture.VENTE,
  nature: NatureFacture.FACTURE,
  numeroSerie: 'FV-0001',
  dateFacture: new Date('2026-09-10'),
  tiersId: 'tiers1',
  emetteurNom: 'Le dossier (au 10 septembre)',
  emetteurAdresse: '12, avenue de la Justice',
  emetteurNumeroImpot: 'A0000000A',
  contrepartieNom: 'Client SARL',
  contrepartieAdresse: '4, boulevard du 30 Juin',
  contrepartieNumeroImpot: 'B7654321Y',
  mentionTvaDebits: false,
  mentionsSocieteEmetteur: { denomination: 'Le dossier (au 10 septembre)', ligne: 'Société anonyme · au capital de 1 000 000 CDF', manquantes: [] },
  autresImpotsEtTaxes: d(0),
  noteDeCredit: null as Faux | null,
  lignes: [
    { ordre: 1, designation: 'Conseil', quantite: d(1), prixUnitaire: d(100_000), montantHT: d(100_000), imposable: true, tauxTvaId: 'tx16', tauxApplique: d(16), montantTva: d(16_000) },
    { ordre: 2, designation: 'Débours', quantite: d(1), prixUnitaire: d(5_000), montantHT: d(5_000), imposable: false, tauxTvaId: null, tauxApplique: null, montantTva: d(0) },
  ],
};

function service(opts: { initiale?: Faux | null; doublon?: boolean } = {}) {
  const initiale = opts.initiale === undefined ? INITIALE : opts.initiale;
  const create = jest.fn().mockImplementation(({ data }: Faux) => {
    const x = data as Faux;
    return Promise.resolve({ ...x, id: 'nc1', lignes: ((x.lignes as Faux).create as Faux[]).map((l) => ({ ...l })) });
  });
  const findFirst = jest.fn().mockImplementation(({ where }: { where: Faux }) => {
    if (where.id) return Promise.resolve(initiale);
    if (where.numeroSerie) return Promise.resolve(opts.doublon ? { id: 'autre' } : null);
    return Promise.resolve(null);
  });
  const prisma = {
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 't',
        nom: 'Le dossier (aujourd’hui)',
        numeroImpot: 'A0000000A',
        formeJuridiqueSyscohada: 'SOCIETE_RESPONSABILITE_LIMITEE',
      }),
    },
    ecriture: { findFirst: jest.fn().mockResolvedValue({ id: 'e-avoir' }) },
    facture: { findFirst, findMany: jest.fn().mockResolvedValue([]), create, delete: jest.fn().mockResolvedValue({}) },
  } as Faux;
  return { svc: new FacturationService(prisma as unknown as PrismaService), prisma, create };
}

const NOTE = { numeroSerie: 'NC-0001', dateNote: '2026-09-20', ecritureId: 'e-avoir' };

describe('Émettre une note de crédit · elle ANNULE la facture initiale, entière', () => {
  it('est une NOTE_DE_CREDIT rattachée à la facture qu’elle annule, dans le même sens', async () => {
    const { svc, create } = service();
    await svc.emettreNoteDeCredit('t', 'fv1', NOTE);
    const data = (create.mock.calls[0][0] as Faux).data as Faux;
    expect(data.nature).toBe(NatureFacture.NOTE_DE_CREDIT);
    expect(data.factureAnnuleeId).toBe('fv1');
    expect(data.sens).toBe(SensFacture.VENTE);
    expect(data.tenantId).toBe('t');
    expect(data.ecritureId).toBe('e-avoir');
  });

  it('recopie TOUTES les lignes, montants POSITIFS · c’est la nature qui porte le sens, jamais un signe', async () => {
    const { svc, create } = service();
    await svc.emettreNoteDeCredit('t', 'fv1', NOTE);
    const lignes = (((create.mock.calls[0][0] as Faux).data as Faux).lignes as Faux).create as Faux[];
    expect(lignes).toHaveLength(2);
    expect(lignes.map((l) => Number(l.montantHT))).toEqual([100_000, 5_000]);
    expect(lignes.map((l) => Number(l.montantTva))).toEqual([16_000, 0]);
    // La ligne exonérée reste exonérée · la note ne réinvente pas un taux.
    expect(lignes[1].imposable).toBe(false);
    expect(lignes[1].tauxApplique).toBeNull();
  });

  it('les identités sont CELLES DE LA FACTURE ANNULÉE, pas celles du jour', async () => {
    // Le client doit retrouver sur la note exactement ce qu'il a déduit, pour
    // le reverser. Relire le dossier aujourd'hui y mettrait un autre nom.
    const { svc, create } = service();
    await svc.emettreNoteDeCredit('t', 'fv1', NOTE);
    const data = (create.mock.calls[0][0] as Faux).data as Faux;
    expect(data.emetteurNom).toBe('Le dossier (au 10 septembre)');
    expect(data.contrepartieNom).toBe('Client SARL');
    expect(data.contrepartieNumeroImpot).toBe('B7654321Y');
    // AUSCGIE art. 17 · la ligne recopiée de la facture, pas celle du jour.
    expect(data.mentionsSocieteEmetteur).toEqual(INITIALE.mentionsSocieteEmetteur);
  });

  it('rend les totaux de la note, égaux à ceux de la facture annulée', async () => {
    const { svc } = service();
    const r = await svc.emettreNoteDeCredit('t', 'fv1', NOTE);
    expect(r.factureAnnulee).toEqual({ id: 'fv1', numeroSerie: 'FV-0001' });
    expect(r.totaux.montantTva).toBe(16_000);
  });

  it('refuse une facture d’un autre dossier · la recherche est bornée au tenant', async () => {
    const { svc, prisma } = service({ initiale: null });
    await expect(svc.emettreNoteDeCredit('t', 'fv1', NOTE)).rejects.toThrow(/introuvable/);
    const ou = ((prisma.facture as Faux).findFirst as jest.Mock).mock.calls[0][0].where;
    expect(ou).toEqual({ id: 'fv1', tenantId: 't' });
  });

  it('refuse d’annuler une NOTE · on revient sur une note par une facture nouvelle', async () => {
    const { svc, create } = service({ initiale: { ...INITIALE, nature: NatureFacture.NOTE_DE_CREDIT } });
    await expect(svc.emettreNoteDeCredit('t', 'fv1', NOTE)).rejects.toThrow(/annule une FACTURE/);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuse une facture DÉJÀ annulée · elle ne l’est qu’une fois', async () => {
    const { svc, create } = service({ initiale: { ...INITIALE, noteDeCredit: { numeroSerie: 'NC-0000' } } });
    await expect(svc.emettreNoteDeCredit('t', 'fv1', NOTE)).rejects.toThrow(/déjà annulée.*NC-0000/);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuse une note ANTÉRIEURE à la facture · le facturier suit l’ordre chronologique', async () => {
    const { svc, create } = service();
    await expect(svc.emettreNoteDeCredit('t', 'fv1', { ...NOTE, dateNote: '2026-09-09' })).rejects.toThrow(/antérieure/);
    expect(create).not.toHaveBeenCalled();
  });

  it('accepte une note DU MÊME JOUR que la facture', async () => {
    const { svc, create } = service();
    await svc.emettreNoteDeCredit('t', 'fv1', { ...NOTE, dateNote: '2026-09-10' });
    expect(create).toHaveBeenCalled();
  });

  it('refuse un n° de série déjà porté dans le MÊME facturier', async () => {
    const { svc, prisma, create } = service({ doublon: true });
    await expect(svc.emettreNoteDeCredit('t', 'fv1', NOTE)).rejects.toThrow(/déjà porté/);
    const appels = ((prisma.facture as Faux).findFirst as jest.Mock).mock.calls.map((c) => c[0].where);
    expect(appels).toContainEqual({ tenantId: 't', sens: SensFacture.VENTE, numeroSerie: 'NC-0001' });
    expect(create).not.toHaveBeenCalled();
  });
});

describe('La facture annulée est BARRÉE et CONSERVÉE · décret art. 127', () => {
  it('refuse de supprimer une facture qu’une note annule', async () => {
    const { svc, prisma } = service({ initiale: { id: 'fv1', noteDeCredit: { numeroSerie: 'NC-0001' } } });
    await expect(svc.supprimer('t', 'fv1')).rejects.toThrow(/CONSERVÉE.*art\. 127/);
    expect((prisma.facture as Faux).delete as jest.Mock).not.toHaveBeenCalled();
  });

  it('supprime une facture qu’aucune note n’annule · la saisie erronée reste corrigeable', async () => {
    const { svc, prisma } = service({ initiale: { id: 'fv1', noteDeCredit: null } });
    await svc.supprimer('t', 'fv1');
    expect((prisma.facture as Faux).delete as jest.Mock).toHaveBeenCalledWith({ where: { id: 'fv1' } });
  });

  it('la liste marque la facture BARRÉE, et le calcule de l’existence de la note', async () => {
    const { svc, prisma } = service();
    ((prisma.facture as Faux).findMany as jest.Mock).mockResolvedValue([
      { ...INITIALE, tiers: null, factureAnnulee: null, noteDeCredit: { id: 'nc1', numeroSerie: 'NC-0001', dateFacture: new Date('2026-09-20') } },
      { ...INITIALE, id: 'fv2', numeroSerie: 'FV-0002', tiers: null, factureAnnulee: null, noteDeCredit: null },
    ]);
    const { factures } = await svc.lister('t');
    expect(factures.map((f) => [f.numeroSerie, f.barree])).toEqual([
      ['FV-0001', true],
      ['FV-0002', false],
    ]);
  });

  it('LA BASE REFUSE AUSSI · la relation est RESTRICT dans le schéma et dans la migration', () => {
    // Le service n'est pas le seul chemin vers la base. Une suppression par un
    // autre module, ou par un script, doit tomber sur la clé étrangère.
    const schema = readFileSync(join(__dirname, '..', '..', '..', 'prisma', 'schema.prisma'), 'utf-8');
    expect(schema).toMatch(/factureAnnulee\s+Facture\?\s+@relation\("AnnulationFacture"[^\n]*onDelete: Restrict/);
    const migration = readFileSync(
      join(__dirname, '..', '..', '..', 'prisma', 'migrations', '20261001000000_note_de_credit', 'migration.sql'),
      'utf-8',
    );
    expect(migration).toMatch(/factureAnnuleeId_fkey[^;]*ON DELETE RESTRICT/);
    expect(migration).toMatch(/UNIQUE INDEX "factures_factureAnnuleeId_key"/);
  });
});

describe('L’état détaillé n’additionne pas les notes de crédit', () => {
  it('borne sa requête aux FACTURES · une note reçue gonflerait la déduction du montant qu’elle annule', async () => {
    const { svc, prisma } = service();
    await svc.etatDetaille('t', '2026-09');
    const ou = ((prisma.facture as Faux).findMany as jest.Mock).mock.calls[0][0].where;
    expect(ou.nature).toBe(NatureFacture.FACTURE);
    expect(ou.sens).toBe(SensFacture.ACHAT);
  });
});
