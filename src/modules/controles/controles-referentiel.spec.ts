import { Referentiel } from '@prisma/client';
import { ControlesService } from './controles.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * ANALYSE ET CONTRÔLES · LE MÊME NUMÉRO, PAS LE MÊME SENS.
 *
 * Ce service est servi aux deux référentiels et a été écrit pour un seul. Les
 * anomalies qu'il rend ne cassent rien : elles se lisent, se recopient dans un
 * rapport, et orientent une correction. Une phrase fausse y coûte donc plus
 * cher qu'ailleurs.
 *
 * Quatre points que ces tests figent :
 *
 *  · le 41 est « Clients et comptes rattachés » en SYSCOHADA et « Adhérents,
 *    clients-usagers et comptes rattachés » en SYCEBNL · le message ne parle
 *    d'adhérents qu'au second ;
 *  · la classe 9 porte les contributions volontaires en nature au SYCEBNL, et
 *    les engagements hors bilan (90-91) plus la comptabilité analytique de
 *    gestion (92-99) au SYSCOHADA · deux libellés, deux notes annexes ;
 *  · les exonérations douanières de la note circulaire 003/2013 sont un régime
 *    d'ASBL · le contrôle ne les cherche même pas ailleurs ;
 *  · 409 et 419 ont un sens NORMALEMENT inversé dans les deux plans · ce
 *    n'est pas une affaire de référentiel, et l'anomalie est le sens contraire
 *    du leur, pas leur existence.
 */

let idLigne = 0;
function ligne(numero: string, debit: number, credit = 0) {
  idLigne += 1;
  return { id: `l${idLigne}`, debit, credit, lettre: null, compte: { numero, intitule: `Compte ${numero}` } };
}

function ecriture(libelle: string, lignes: ReturnType<typeof ligne>[]) {
  return {
    id: `e-${libelle}`,
    date: new Date('2026-05-10'),
    libelle,
    reference: 'PJ-1',
    numeroPiece: 1,
    createdAt: new Date('2026-05-10'),
    statut: 'VALIDEE',
    journal: { code: 'OD' },
    lignes,
  };
}

function service(referentiel: Referentiel, ecritures: ReturnType<typeof ecriture>[]) {
  const exoneration = { findMany: jest.fn().mockResolvedValue([]) };
  const prisma = {
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ex',
        dateDebut: new Date('2026-01-01'),
        dateFin: new Date('2026-12-31'),
      }),
    },
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 't',
        referentiel,
        // Valeur par défaut du schéma · sans signification pour un dossier
        // SYSCOHADA, et c'est précisément le piège que le service doit éviter.
        jeuEtatsFinanciersSycebnl: 'ASSOCIATIONS_ORDRES_PROFESSIONNELS',
        systemeComptableSyscohada: null,
        formeJuridiqueSyscohada: null,
      }),
    },
    ecriture: { findMany: jest.fn().mockResolvedValue(ecritures) },
    compte: { findMany: jest.fn().mockResolvedValue([]) },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue([]) },
    exoneration,
  } as unknown as PrismaService;
  return { svc: new ControlesService(prisma), exoneration };
}

const anomalie = async (svc: ControlesService, code: string) =>
  (await svc.analyser('t', 'ex')).anomalies.find((a) => a.code === code);

/** Tout le texte rendu par une anomalie, messages et occurrences compris. */
const texte = (a: { libelle: string; consequence: string; action: string; occurrences: { detail?: string }[] }) =>
  [a.libelle, a.consequence, a.action, ...a.occurrences.map((o) => o.detail ?? '')].join(' | ');

describe('Contrôles · le vocabulaire suit le référentiel du dossier', () => {
  const clientCrediteur = [ecriture('Encaissement', [ligne('41100000', 0, 500_000), ligne('52110000', 500_000)])];

  it('ne parle jamais d’adhérent à un dossier SYSCOHADA', async () => {
    const { svc } = service(Referentiel.SYSCOHADA, clientCrediteur);
    const a = await anomalie(svc, 'TIERS_SOLDE_INVERSE');
    expect(a).toBeDefined();
    expect(texte(a as never)).not.toMatch(/adhérent|usager/i);
    expect(texte(a as never)).toMatch(/client/i);
  });

  it('parle bien d’adhérent et de client-usager à un dossier SYCEBNL', async () => {
    const { svc } = service(Referentiel.SYCEBNL, clientCrediteur);
    const a = await anomalie(svc, 'TIERS_SOLDE_INVERSE');
    expect(a).toBeDefined();
    expect(texte(a as never)).toMatch(/adhérent/i);
  });

  it('ne renvoie pas un dossier SYSCOHADA à un chapitre du SYCEBNL', async () => {
    // CHARGE_SANS_TIERS citait la Partie 1 ch. 2 et la Partie 3 ch. 3 du
    // SYCEBNL · ce dernier est le chapitre des projets de développement.
    const { svc } = service(Referentiel.SYSCOHADA, [
      ecriture('Loyer', [ligne('62210000', 300_000), ligne('52110000', 0, 300_000)]),
    ]);
    const a = await anomalie(svc, 'CHARGE_SANS_TIERS');
    expect(a).toBeDefined();
    expect(texte(a as never)).not.toMatch(/SYCEBNL|Partie \d/);
    expect(texte(a as never)).toMatch(/AUDCIF/);
  });
});

describe('Contrôles · la classe 9 ne porte pas la même chose dans les deux plans', () => {
  const engagement = [ecriture('Caution', [ligne('90110000', 4_000_000), ligne('91110000', 0, 4_000_000)])];

  it('annonce les contributions volontaires en nature au SYCEBNL', async () => {
    const { svc } = service(Referentiel.SYCEBNL, engagement);
    const a = await anomalie(svc, 'CLASSE_9_MOUVEMENTEE');
    expect(a!.libelle).toMatch(/contributions volontaires/i);
    expect(a!.action).toMatch(/contributions volontaires/i);
  });

  it('annonce les engagements hors bilan et l’analytique au SYSCOHADA', async () => {
    const { svc } = service(Referentiel.SYSCOHADA, engagement);
    const a = await anomalie(svc, 'CLASSE_9_MOUVEMENTEE');
    expect(a!.libelle).not.toMatch(/contributions volontaires/i);
    expect(a!.libelle).toMatch(/engagements hors bilan/i);
    // Les 92 à 99 ne sont pas des engagements : le message les distingue.
    expect(a!.consequence).toMatch(/92 à 99/);
    expect(a!.action).toMatch(/engagements hors bilan/i);
  });
});

describe('Contrôles · les exonérations douanières sont un régime d’ASBL', () => {
  it('un dossier SYSCOHADA n’interroge même pas la table des exonérations', async () => {
    const { svc, exoneration } = service(Referentiel.SYSCOHADA, []);
    await svc.analyser('t', 'ex');
    expect(exoneration.findMany).not.toHaveBeenCalled();
  });

  it('un dossier SYCEBNL l’interroge', async () => {
    const { svc, exoneration } = service(Referentiel.SYCEBNL, []);
    await svc.analyser('t', 'ex');
    expect(exoneration.findMany).toHaveBeenCalled();
  });
});

describe('Contrôles · 409 et 419 ont un sens normalement inversé, dans les deux plans', () => {
  // Le défaut ne vient d'aucun référentiel : les deux plans portent 409
  // « Fournisseurs débiteurs » (avances versées) et 419 « Clients créditeurs »
  // (avances reçues), avec toutes leurs subdivisions. Le test tourne donc sur
  // les deux, à l'identique.
  for (const referentiel of [Referentiel.SYCEBNL, Referentiel.SYSCOHADA]) {
    describe(referentiel, () => {
      const numeros = async (ecritures: ReturnType<typeof ecriture>[]) => {
        const { svc } = service(referentiel, ecritures);
        const a = await anomalie(svc, 'TIERS_SOLDE_INVERSE');
        return (a?.occurrences ?? []).map((o) => o.reference);
      };

      it('se tait sur une avance versée (4091 débiteur) et sur une avance reçue (4191 créditeur)', async () => {
        const lignes = await numeros([
          ecriture('Acompte fournisseur', [ligne('40910000', 200_000), ligne('52110000', 0, 200_000)]),
          ecriture('Acompte reçu', [ligne('52110000', 300_000), ligne('41910000', 0, 300_000)]),
        ]);
        expect(lignes).toEqual([]);
      });

      it('signale le sens CONTRAIRE au leur, que l’exclusion pure aurait masqué', async () => {
        const lignes = await numeros([
          ecriture('409 au crédit', [ligne('52110000', 200_000), ligne('40910000', 0, 200_000)]),
          ecriture('419 au débit', [ligne('41910000', 300_000), ligne('52110000', 0, 300_000)]),
        ]);
        expect(lignes.sort()).toEqual(['40910000', '41910000']);
      });

      it('signale toujours un 411 créditeur et un 401 débiteur', async () => {
        const lignes = await numeros([
          ecriture('Client créditeur', [ligne('52110000', 500_000), ligne('41100000', 0, 500_000)]),
          ecriture('Fournisseur débiteur', [ligne('40110000', 400_000), ligne('52110000', 0, 400_000)]),
        ]);
        expect(lignes.sort()).toEqual(['40110000', '41100000']);
      });
    });
  }
});

describe('Contrôles · la créance douteuse se reclasse au 416 et se déprécie au 491', () => {
  it('cite les deux comptes, et pas le 416 seul', async () => {
    const { svc } = service(Referentiel.SYSCOHADA, [
      {
        ...ecriture('Vieille facture', [ligne('41100000', 900_000), ligne('70100000', 0, 900_000)]),
        date: new Date('2026-01-05'),
      },
    ]);
    const a = await anomalie(svc, 'TIERS_ANCIEN_NON_LETTRE');
    expect(a).toBeDefined();
    expect(a!.consequence).toMatch(/416/);
    expect(a!.consequence).toMatch(/491/);
  });
});
