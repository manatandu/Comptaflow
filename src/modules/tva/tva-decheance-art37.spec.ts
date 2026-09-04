import { TauxTvaService } from './taux-tva.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * LE DÉLAI D'EXERCICE DU DROIT À DÉDUCTION · article 37, alinéa 2.
 *
 * Fichier `code-general-2026/references/10-tva-ol10-001-loi-base-ch1-10.md`,
 * l. 989-991 : « Le droit à déduction est exercé jusqu'au 31 décembre de
 * l'année qui suit celle au cours de laquelle la taxe est devenue exigible. A
 * l'expiration de ce délai, la taxe sur la valeur ajoutée non déduite est
 * acquise définitivement au Trésor public. » Repris à l'identique par le
 * décret n° 011/42, art. 96 (fichier
 * `tva/references/14-decret-011-42-deductions.md`, l. 19). Article NON modifié
 * par la L.F. n° 25/060.
 *
 * NI LE MODULE TVA, NI LES CONTRÔLES, NI LES JALONS DE CLÔTURE n'en portaient
 * la moindre trace. La fenêtre de lecture de la déclaration remonte sans borne
 * inférieure (`date: { lte: dateFin }`), ce qui est nécessaire pour dater à
 * l'encaissement, mais rien ne disait au lecteur qu'une TVA d'amont ancienne
 * pouvait être PÉRIMÉE. L'écran affichait « TVA déductible admise » sans
 * réserve.
 *
 * CE QUE LE LOGICIEL PEUT DIRE, ET CE QU'IL NE PEUT PAS. Il ne sait pas si une
 * taxe a été déduite en son temps : une période peut avoir été déclarée sans
 * jamais être liquidée ici, et une facture ancienne ressaisie aujourd'hui
 * porte la date d'aujourd'hui. Il ne corrige donc rien · il COMPTE la TVA
 * d'amont dont l'exigibilité est antérieure au 1er janvier de l'année qui
 * précède la déclaration (exigible en Y-2 au plus tard, délai expiré le
 * 31 décembre Y-1) et la NOMME, pour que le comptable rectifie tant qu'il en
 * est temps.
 *
 * ET LE DÉLAI COURT DE L'EXIGIBILITÉ, JAMAIS DE LA FACTURE · c'est le sens
 * même de l'alinéa, et une facture de services ancienne réglée cette année
 * ouvre un droit tout neuf.
 */

const TAUX = { id: 'tx16', code: 'TVA16', intitule: 'TVA 16 %', taux: 16, compteCollecteId: 'c443', compteDeductibleId: 'c445' };

interface Achat {
  /** 4452 achats de biens (fait générateur) · 4454 services (encaissement). */
  numero: string;
  date: string;
  tva: number;
  /** Date d'écriture du règlement du fournisseur, pour les services. */
  regle?: string;
}

function service(achats: Achat[]) {
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue({ id: 't1', regimeExigibiliteTva: 'LIVRAISONS', referentiel: 'SYSCOHADA' }) },
    tauxTva: { findMany: jest.fn().mockResolvedValue([TAUX]) },
    ligneEcriture: {
      findMany: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        const compte = where.compte as { OR?: unknown } | undefined;
        if (!compte?.OR) return Promise.resolve([]);
        return Promise.resolve(
          achats.map((a) => ({
            id: `l-${a.date}`,
            tauxTvaId: TAUX.id,
            compte: { numero: a.numero },
            debit: a.tva,
            credit: 0,
            ecriture: {
              date: new Date(a.date),
              lignes: a.regle
                ? [
                    {
                      debit: 0,
                      credit: a.tva * 10,
                      compte: { numero: '40100000', classe: 'CLASSE_4' },
                      lettrage: {
                        statut: 'SOLDE',
                        solde: 0,
                        soldeAt: null,
                        lignes: [
                          { debit: 0, credit: a.tva * 10, ecriture: { date: new Date(a.date) } },
                          { debit: a.tva * 10, credit: 0, ecriture: { date: new Date(a.regle) } },
                        ],
                      },
                    },
                  ]
                : [],
            },
          })),
        );
      }),
      aggregate: jest.fn().mockResolvedValue({ _sum: { credit: 0, debit: 0 } }),
    },
    liquidationTva: { findFirst: jest.fn().mockResolvedValue(null) },
  } as unknown as PrismaService;
  return new TauxTvaService(prisma, {} as EcritureService);
}

const MARS_2026 = new Date('2026-03-01');
const FIN_MARS_2026 = new Date('2026-03-31T23:59:59.999Z');

describe('Déchéance du droit à déduction · article 37, alinéa 2', () => {
  it('compte et NOMME la TVA d’amont dont le délai est expiré', async () => {
    // Achat de biens de mai 2024 : la taxe y est devenue exigible, le droit
    // s'est éteint le 31 décembre 2025. Déclarée en mars 2026, elle n'entre
    // dans aucun total · et le logiciel le dit, au lieu de la laisser dormir.
    const s = service([{ numero: '44520000', date: '2024-05-10', tva: 500_000 }]);
    const d = await s.declaration('t1', MARS_2026, FIN_MARS_2026);
    expect(d.totalDeductible).toBe(0);
    expect(d.tvaDeductibleDechue).toBe(500_000);
    expect(d.mentionExigibilite).toContain('DÉLAI DE DÉDUCTION EXPIRÉ');
    expect(d.mentionExigibilite).toContain('article 37, alinéa 2');
    expect(d.mentionExigibilite).toContain('acquise définitivement au');
  });

  it('ne signale RIEN pour une taxe exigible l’année précédente · le délai court jusqu’au 31 décembre', async () => {
    // Exigible en 2025, déductible jusqu'au 31 décembre 2026 : rien à
    // signaler en mars 2026. C'est le garde-fou de la borne.
    const s = service([{ numero: '44520000', date: '2025-11-10', tva: 500_000 }]);
    const d = await s.declaration('t1', MARS_2026, FIN_MARS_2026);
    expect(d.tvaDeductibleDechue).toBe(0);
    expect(d.mentionExigibilite).not.toContain('DÉLAI DE DÉDUCTION EXPIRÉ');
  });

  it('le délai court de l’EXIGIBILITÉ · une prestation de 2023 réglée en 2026 est déductible en 2026', async () => {
    // La taxe n'est exigible chez le prestataire qu'à l'encaissement
    // (art. 25, 2°) : le droit à déduction naît alors, et court jusqu'au
    // 31 décembre 2027. Dater la déchéance sur la facture aurait fait perdre
    // au dossier une déduction parfaitement acquise.
    const s = service([{ numero: '44540000', date: '2023-09-10', tva: 160_000, regle: '2026-03-18' }]);
    const d = await s.declaration('t1', MARS_2026, FIN_MARS_2026);
    expect(d.totalDeductible).toBe(160_000);
    expect(d.tvaDeductibleDechue).toBe(0);
  });
});
