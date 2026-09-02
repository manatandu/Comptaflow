import { DevisesService } from './devises.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * LES DEUX EXCEPTIONS DE L'AUDCIF QUE LA RÉÉVALUATION IGNORAIT.
 *
 * La provision dotée était 100 % de la perte latente, toutes positions
 * confondues. Deux articles disent autre chose, et le cadre conceptuel du
 * SYCEBNL les reprend l'un et l'autre :
 *
 *  · ART. 58 · POSITION GLOBALE DE CHANGE. « Le montant de la dotation à la
 *    provision pour pertes de change est limité à l'excédent des pertes
 *    probables sur les gains latents afférents aux éléments inclus dans cette
 *    position », qui s'entend « DEVISE PAR DEVISE ». Une entité qui a une
 *    créance et une dette en dollars ne perd pas sur les deux à la fois.
 *
 *  · ART. 56 · ÉTALEMENT. Sur un emprunt ou un prêt à plus d'un an, la perte
 *    « doit être étalée sur la durée restant à courir, en proportion des
 *    remboursements à venir prévus au contrat ». Un emprunt sur cinq ans était
 *    provisionné en totalité dès la première clôture.
 *
 * Ce que ces tests figent, et la différence entre les deux :
 *
 *  · l'art. 58 est CALCULABLE, mais reste une OPTION · le texte le subordonne
 *    à une justification par l'entité, il ne vaut qu'entre éléments dont
 *    l'échéance tombe dans le même exercice, et il DIMINUE une provision.
 *    Un réglage qui allège la prudence ne s'installe pas tout seul ;
 *  · l'art. 56 n'est PAS calculable ici · la proportion se lit dans le tableau
 *    d'amortissement de l'emprunt, qu'une position (compte, devise) ne porte
 *    pas. Le logiciel dote donc la totalité, ce qui est prudent mais dépasse
 *    le texte, et il le DIT plutôt que de le taire.
 */

type Faux = Record<string, unknown>;

interface LigneTest {
  compteNumero: string;
  deviseCode: string;
  debit: number;
  credit: number;
  montantDevise: number;
}

/** Un cours par devise, pour pouvoir opposer deux devises dans un même test. */
function service(lignes: LigneTest[], cours: Record<string, number>) {
  const prisma = {
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ex1',
        dateDebut: new Date('2026-01-01'),
        dateFin: new Date('2026-12-31'),
        statut: 'OUVERT',
      }),
    },
    ligneEcriture: {
      findMany: jest.fn().mockResolvedValue(
        lignes.map((l, i) => ({
          compteId: `c-${l.compteNumero}`,
          deviseId: `d-${l.deviseCode}`,
          debit: l.debit,
          credit: l.credit,
          montantDevise: l.montantDevise,
          compte: { id: `c-${l.compteNumero}`, numero: l.compteNumero, intitule: `Compte ${i}` },
          devise: { id: `d-${l.deviseCode}`, code: l.deviseCode },
        })),
      ),
    },
    coursDevise: {
      findFirst: jest.fn().mockImplementation(({ where }: { where: { deviseId: string } }) => {
        const code = where.deviseId.replace('d-', '');
        return Promise.resolve(cours[code] === undefined ? null : { cours: cours[code] });
      }),
    },
  } as Faux;
  return new DevisesService(prisma as unknown as PrismaService, {} as EcritureService);
}

/** Créance de 1 000 USD à 2 800 · elle perd 300 000 si le cours tombe à 2 500. */
const CREANCE_QUI_PERD: LigneTest = {
  compteNumero: '41100000',
  deviseCode: 'USD',
  debit: 2_800_000,
  credit: 0,
  montantDevise: 1000,
};
/** Dette de 1 000 USD à 2 800 · elle gagne 300 000 au même cours de 2 500. */
const DETTE_QUI_GAGNE: LigneTest = {
  compteNumero: '40100000',
  deviseCode: 'USD',
  debit: 0,
  credit: 2_800_000,
  montantDevise: 1000,
};

describe('Position globale de change · art. 58', () => {
  it('sans l’option, la perte est provisionnée EN ENTIER même compensée par un gain', async () => {
    const r = await service([CREANCE_QUI_PERD, DETTE_QUI_GAGNE], { USD: 2500 }).calculer('t1', {
      exerciceId: 'ex1',
    });
    expect(r.perteLatente).toBe(300_000);
    expect(r.gainLatent).toBe(300_000);
    expect(r.provision).toBe(300_000);
    expect(r.positionGlobaleRetenue).toBe(false);
  });

  it('avec l’option, la dotation tombe à l’excédent des pertes sur les gains', async () => {
    const r = await service([CREANCE_QUI_PERD, DETTE_QUI_GAGNE], { USD: 2500 }).calculer('t1', {
      exerciceId: 'ex1',
      positionGlobale: true,
    });
    // 300 000 de perte, 300 000 de gain, dans la MÊME devise : l'excédent est nul.
    expect(r.provision).toBe(0);
    // L'écart lui-même ne bouge pas · la position globale ne sert qu'au calcul
    // de la dotation, elle ne compense jamais 478 et 479 au bilan.
    expect(r.perteLatente).toBe(300_000);
    expect(r.gainLatent).toBe(300_000);
    // Et l'écran doit pouvoir montrer ce que l'option a retiré.
    expect(r.provisionSansPositionGlobale).toBe(300_000);
    expect(r.positionGlobaleRetenue).toBe(true);
  });

  it('la position se tient DEVISE PAR DEVISE · un gain en euros ne couvre pas une perte en dollars', async () => {
    const gainEnEuros: LigneTest = {
      compteNumero: '40100000',
      deviseCode: 'EUR',
      debit: 0,
      credit: 3_000_000,
      montantDevise: 1000,
    };
    const r = await service([CREANCE_QUI_PERD, gainEnEuros], { USD: 2500, EUR: 2700 }).calculer('t1', {
      exerciceId: 'ex1',
      positionGlobale: true,
    });
    // La dette en euros s'allège de 300 000 · un gain, mais dans une autre
    // devise. La perte en dollars reste entièrement provisionnée.
    expect(r.gainLatent).toBe(300_000);
    expect(r.provision).toBe(300_000);
  });

  it('la réduction se répartit au PRORATA entre les positions perdantes', async () => {
    // Toutes en USD, au cours de clôture 2 500 contre 2 800 à l'origine.
    //  · créance client de 1 000 USD → perte de 300 000 ;
    //  · prêt (27, immobilisation financière) de 400 USD → perte de 120 000 ;
    //  · dette fournisseur de 1 000 USD inscrite à 2 710 000 → gain de 210 000.
    // Pertes 420 000, gains 210 000 : l'excédent vaut la MOITIÉ des pertes,
    // chacune est donc dotée de moitié.
    const pret: LigneTest = {
      compteNumero: '27100000',
      deviseCode: 'USD',
      debit: 1_120_000,
      credit: 0,
      montantDevise: 400,
    };
    const detteQuiGagne: LigneTest = {
      compteNumero: '40100000',
      deviseCode: 'USD',
      debit: 0,
      credit: 2_710_000,
      montantDevise: 1000,
    };
    const r = await service([CREANCE_QUI_PERD, pret, detteQuiGagne], { USD: 2500 }).calculer('t1', {
      exerciceId: 'ex1',
      positionGlobale: true,
    });
    expect(r.perteLatente).toBe(420_000);
    expect(r.gainLatent).toBe(210_000);
    expect(r.provision).toBe(210_000);
    const parCompte = new Map(r.positions.map((p) => [p.numero, p.provisionnable]));
    expect(parCompte.get('41100000')).toBe(150_000);
    expect(parCompte.get('27100000')).toBe(60_000);
    // Le gain, lui, ne se provisionne jamais.
    expect(parCompte.get('40100000')).toBe(0);
  });

  it('une disponibilité n’entre pas dans la position · son écart est déjà au résultat', async () => {
    const banque: LigneTest = {
      compteNumero: '52120000',
      deviseCode: 'USD',
      debit: 2_800_000,
      credit: 0,
      montantDevise: 1000,
    };
    const r = await service([banque], { USD: 2500 }).calculer('t1', {
      exerciceId: 'ex1',
      positionGlobale: true,
    });
    expect(r.perteRealisee).toBe(300_000);
    expect(r.perteLatente).toBe(0);
    expect(r.provision).toBe(0);
  });
});

describe('Étalement de l’art. 56 · ce que le logiciel dit ne pas savoir calculer', () => {
  it('avertit sur une perte de change portant un emprunt à long terme', async () => {
    const emprunt: LigneTest = {
      compteNumero: '16100000',
      deviseCode: 'USD',
      debit: 0,
      credit: 2_800_000,
      montantDevise: 1000,
    };
    const r = await service([emprunt], { USD: 3100 }).calculer('t1', { exerciceId: 'ex1' });
    expect(r.avertissements).toHaveLength(1);
    expect(r.avertissements[0]).toMatch(/16100000/);
    expect(r.avertissements[0]).toMatch(/art\. 56/);
    expect(r.avertissements[0]).toMatch(/ÉTALER/);
    // La dotation reste intégrale · prudente, et assumée comme telle.
    expect(r.provision).toBe(300_000);
  });

  it('n’avertit pas sur une créance commerciale, que l’art. 56 ne vise pas', async () => {
    const r = await service([CREANCE_QUI_PERD], { USD: 2500 }).calculer('t1', { exerciceId: 'ex1' });
    expect(r.avertissements).toEqual([]);
  });

  it('n’avertit pas sur un GAIN de change · il n’y a rien à doter', async () => {
    const emprunt: LigneTest = {
      compteNumero: '16100000',
      deviseCode: 'USD',
      debit: 0,
      credit: 2_800_000,
      montantDevise: 1000,
    };
    const r = await service([emprunt], { USD: 2500 }).calculer('t1', { exerciceId: 'ex1' });
    expect(r.gainLatent).toBe(300_000);
    expect(r.avertissements).toEqual([]);
  });
});
