import { BadRequestException } from '@nestjs/common';
import { ClasseCompte, ModeLiberation, NatureLiberalite, Prisma, TypeCompteDetailTotal, TypeDonateur } from '@prisma/client';
import { DonationService, manquementsArticle17 } from './donation.service';
import { COMPTES_FRONTIERE, COMPTES_HORS_PERIMETRE, COMPTES_LIBERALITE } from './correspondance-registre';
import { EcritureService } from '../comptabilite/ecriture.service';
import { PrismaService } from '../../common/prisma.service';

/** Une ligne de balance telle que `EcritureService.balance()` la renvoie. */
function ligne(numero: string, classe: ClasseCompte, mouvementDebit: number, mouvementCredit: number) {
  return {
    compteId: `id-${numero}`, numero, intitule: `Compte ${numero}`, classe,
    typeCompte: TypeCompteDetailTotal.DETAIL,
    totalDebit: mouvementDebit, totalCredit: mouvementCredit,
    reportDebit: 0, reportCredit: 0,
    mouvementDebit, mouvementCredit,
    solde: mouvementDebit - mouvementCredit,
  };
}

const EXERCICE = { id: 'ex1', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };

type LigneRegistre = Partial<Prisma.DonationUncheckedCreateInput> & { id: string; numero: number };

/**
 * Registre en mémoire : `create` reproduit la contrainte
 * `@@unique([tenantId, numero])` de la base — c'est elle, et pas le service,
 * qui garantit l'unicité du numéro sous concurrence.
 */
function prismaAvec(registre: LigneRegistre[] = []) {
  const lignes = registre.map((l) => ({
    tenantId: 't1', dateOperation: new Date('2026-06-01'),
    nature: NatureLiberalite.DON, typeDonateur: TypeDonateur.PERSONNE_PHYSIQUE,
    nom: 'Kabila', prenoms: 'Jean', domicile: 'Kinshasa', adresseElectronique: 'j@k.cd',
    denomination: null, numeroImmatriculation: null, numeroIdentificationFiscale: null, adresseSiegeSocial: null,
    montant: new Prisma.Decimal(0), modeLiberation: ModeLiberation.ESPECES, designationNature: null,
    signeePar: null, signeeLe: null, ecritureId: null,
    annulee: false, motifAnnulation: null, annuleeLe: null,
    createdAt: new Date(), createdBy: 'u1',
    ...l,
  })) as any[];

  const donation = {
    findMany: jest.fn().mockImplementation(({ where }: any) =>
      Promise.resolve(
        lignes
          .filter((l) => (where?.annulee === false ? !l.annulee : true))
          .sort((a, b) => a.numero - b.numero),
      ),
    ),
    findFirst: jest.fn().mockImplementation(({ where, orderBy }: any) => {
      if (orderBy?.numero === 'desc') {
        const max = lignes.reduce((m, l) => Math.max(m, l.numero), 0);
        return Promise.resolve(max === 0 ? null : { numero: max });
      }
      return Promise.resolve(lignes.find((l) => l.id === where.id) ?? null);
    }),
    create: jest.fn().mockImplementation(({ data }: any) => {
      if (lignes.some((l) => l.numero === data.numero)) {
        throw new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '5' });
      }
      const cree = { id: `d${data.numero}`, ...data };
      lignes.push(cree);
      return Promise.resolve(cree);
    }),
    update: jest.fn().mockImplementation(({ where, data }: any) => {
      const l = lignes.find((x) => x.id === where.id)!;
      Object.assign(l, data);
      return Promise.resolve(l);
    }),
  };

  return {
    donation,
    exercice: { findFirst: jest.fn().mockResolvedValue(EXERCICE) },
    ecriture: { findFirst: jest.fn().mockResolvedValue({ id: 'e1' }) },
    $transaction: jest.fn().mockImplementation((fn: any) => fn({ donation })),
    _lignes: lignes,
  } as unknown as PrismaService & { _lignes: any[] };
}

function service(balance: ReturnType<typeof ligne>[] = [], prisma = prismaAvec()) {
  const ecriture = {
    balance: jest.fn().mockResolvedValue({ lignes: balance, totaux: { debit: 0, credit: 0 } }),
  } as unknown as EcritureService;
  return { svc: new DonationService(prisma, ecriture), prisma };
}

const donPP = (montant: number, extra: Partial<any> = {}) => ({
  dateOperation: '2026-06-01',
  nature: NatureLiberalite.DON,
  typeDonateur: TypeDonateur.PERSONNE_PHYSIQUE,
  nom: 'Kabila', prenoms: 'Jean', domicile: 'Kinshasa', adresseElectronique: 'j@k.cd',
  montant,
  modeLiberation: ModeLiberation.VIREMENT,
  ...extra,
});

// ---------------------------------------------------------------------------
// Article 17 — numérotation continue
// ---------------------------------------------------------------------------

describe('Article 17 — « numéroté de façon continue »', () => {
  it('attribue 1, 2, 3… sans que le client puisse imposer un numéro', async () => {
    const { svc } = service();
    const a = await svc.inscrire('t1', 'u1', donPP(100) as any);
    const b = await svc.inscrire('t1', 'u1', donPP(200) as any);
    const c = await svc.inscrire('t1', 'u1', donPP(300) as any);
    expect([a.numero, b.numero, c.numero]).toEqual([1, 2, 3]);
  });

  it('rejoue sur collision de numéro plutôt que de dupliquer', async () => {
    const { svc, prisma } = service();
    await svc.inscrire('t1', 'u1', donPP(100) as any);
    // Une inscription concurrente a pris le numéro 2 entre le calcul et
    // l'écriture : la contrainte d'unicité rejette, le service rejoue.
    let interceptee = false;
    const create = (prisma as any).donation.create;
    const vrai = create.getMockImplementation();
    create.mockImplementation((args: any) => {
      if (!interceptee) {
        interceptee = true;
        (prisma as any)._lignes.push({ id: 'concurrent', numero: 2, annulee: false });
      }
      return vrai(args);
    });
    const suivante = await svc.inscrire('t1', 'u1', donPP(200) as any);
    expect(suivante.numero).toBe(3);
  });

  it("l'annulation conserve le numéro : le registre ne prend pas de trou", async () => {
    const { svc } = service();
    await svc.inscrire('t1', 'u1', donPP(100) as any);
    const deux = await svc.inscrire('t1', 'u1', donPP(200) as any);
    await svc.annuler('t1', deux.id, { motifAnnulation: 'Double saisie' });
    const trois = await svc.inscrire('t1', 'u1', donPP(300) as any);
    expect(trois.numero).toBe(3);

    const rapport = await svc.rapportConformite('t1', 'ex1');
    expect(rapport.numerotation.continue).toBe(true);
    expect(rapport.numerotation.trous).toEqual([]);
  });

  it('signale les trous et les doublons d’un registre repris d’un autre outil', async () => {
    // 1, 3, 4, 4 : le service ne peut pas produire cela — un import le peut.
    const { svc } = service([], prismaAvec([
      { id: 'a', numero: 1 }, { id: 'b', numero: 3 }, { id: 'c', numero: 4 }, { id: 'd', numero: 4 },
    ]));
    const { numerotation } = await svc.rapportConformite('t1', 'ex1');
    expect(numerotation.trous).toEqual([2]);
    expect(numerotation.doublons).toEqual([4]);
    expect(numerotation.continue).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Article 17 — contenu obligatoire et cohérence des identifiants
// ---------------------------------------------------------------------------

describe('Article 17, points 2 et 3 — identifiants du donateur', () => {
  it('refuse un identifiant de personne morale sur une personne physique', async () => {
    const { svc } = service();
    await expect(
      svc.inscrire('t1', 'u1', donPP(100, { numeroIdentificationFiscale: 'A1234' }) as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse des prénoms sur une personne morale', async () => {
    const { svc } = service();
    await expect(
      svc.inscrire('t1', 'u1', {
        ...donPP(100), typeDonateur: TypeDonateur.PERSONNE_MORALE,
        nom: undefined, domicile: undefined, denomination: 'Fondation X', prenoms: 'Jean',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('exige la désignation du bien quand la libération est « en nature » (point 4)', async () => {
    const { svc } = service();
    await expect(
      svc.inscrire('t1', 'u1', donPP(100, { modeLiberation: ModeLiberation.NATURE }) as any),
    ).rejects.toThrow(/désignation du bien/i);
  });

  it('inscrit une ligne incomplète mais la signale au rapport, plutôt que de la refuser', async () => {
    // Art. 24 sanctionne le DÉFAUT de tenue : refuser un don réel parce que
    // l'e-mail du donateur est inconnu pousserait à ne l'inscrire nulle part.
    const { svc } = service();
    const d = await svc.inscrire('t1', 'u1', donPP(500, { adresseElectronique: undefined, domicile: undefined }) as any);
    expect(d.numero).toBe(1);

    const rapport = await svc.rapportConformite('t1', 'ex1');
    const incomplete = rapport.completude.lignesIncompletes.find((l) => l.numero === 1)!;
    expect(incomplete.manquements.map((m) => m.champ).sort()).toEqual(['adresseElectronique', 'domicile']);
    expect(incomplete.manquements[0].exigence).toContain('Art. 17, point 2');
  });

  it('exige les cinq mentions de la personne morale (point 3)', () => {
    const manque = manquementsArticle17({ typeDonateur: TypeDonateur.PERSONNE_MORALE, denomination: 'Fondation X' });
    expect(manque.map((m) => m.champ).sort()).toEqual([
      'adresseElectronique', 'adresseSiegeSocial', 'numeroIdentificationFiscale', 'numeroImmatriculation',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Article 17 — signature du représentant légal
// ---------------------------------------------------------------------------

describe('Article 17 — « signées par le représentant légal »', () => {
  it('liste les lignes non signées et retire celles qui le sont', async () => {
    const { svc } = service();
    const a = await svc.inscrire('t1', 'u1', donPP(100) as any);
    await svc.inscrire('t1', 'u1', donPP(200) as any);
    await svc.signer('t1', a.id, { signeePar: 'Mme la Présidente' });

    const { signature } = await svc.rapportConformite('t1', 'ex1');
    expect(signature.lignesNonSignees.map((l) => l.numero)).toEqual([2]);
  });

  it('refuse de retoucher une ligne déjà signée', async () => {
    const { svc } = service();
    const a = await svc.inscrire('t1', 'u1', donPP(100) as any);
    await svc.signer('t1', a.id, { signeePar: 'Mme la Présidente' });
    await expect(svc.modifier('t1', a.id, { domicile: 'Lubumbashi' })).rejects.toThrow(/signée/i);
  });

  it('refuse une annulation sans motif au niveau du DTO, et exige le motif en base', async () => {
    const { svc } = service();
    const a = await svc.inscrire('t1', 'u1', donPP(100) as any);
    await svc.annuler('t1', a.id, { motifAnnulation: 'Don restitué au donateur' });
    await expect(svc.annuler('t1', a.id, { motifAnnulation: 'x' })).rejects.toThrow(/déjà annulée/i);
  });
});

// ---------------------------------------------------------------------------
// Article 18 — rapprochement comptable
// ---------------------------------------------------------------------------

describe('Article 18 — rapprochement registre / comptabilité', () => {
  it('boucle quand le registre couvre exactement les comptes de libéralité', async () => {
    const { svc } = service([ligne('7041', ClasseCompte.CLASSE_7, 0, 800)]);
    await svc.inscrire('t1', 'u1', donPP(500) as any);
    await svc.inscrire('t1', 'u1', donPP(300) as any);

    const { rapprochement } = await svc.rapportConformite('t1', 'ex1');
    expect(rapprochement.totalRegistre).toBe(800);
    expect(rapprochement.totalComptable).toBe(800);
    expect(rapprochement.rapproche).toBe(true);
  });

  it('exclut du total la ligne annulée, qui reste au registre', async () => {
    const { svc } = service([ligne('7041', ClasseCompte.CLASSE_7, 0, 500)]);
    await svc.inscrire('t1', 'u1', donPP(500) as any);
    const b = await svc.inscrire('t1', 'u1', donPP(300) as any);
    await svc.annuler('t1', b.id, { motifAnnulation: 'Saisie en double' });

    const rapport = await svc.rapportConformite('t1', 'ex1');
    expect(rapport.rapprochement.totalRegistre).toBe(500);
    expect(rapport.rapprochement.rapproche).toBe(true);
    // La ligne annulée reste comptée dans l'existence du registre.
    expect(rapport.existence.lignesSurExercice).toBe(2);
    expect(rapport.existence.lignesAnnuleesSurExercice).toBe(1);
  });

  it('nomme le sens de l’écart — art. 24 quand la comptabilité dépasse le registre', async () => {
    const { svc } = service([ligne('7041', ClasseCompte.CLASSE_7, 0, 1000)]);
    await svc.inscrire('t1', 'u1', donPP(600) as any);
    const { rapprochement } = await svc.rapportConformite('t1', 'ex1');
    expect(rapprochement.ecart).toBe(400);
    expect(rapprochement.lecture).toMatch(/art\. 24/);
  });

  it('signale l’inverse — inscrit au registre sans contrepartie comptable', async () => {
    const { svc } = service([ligne('7041', ClasseCompte.CLASSE_7, 0, 100)]);
    await svc.inscrire('t1', 'u1', donPP(600) as any);
    const { rapprochement } = await svc.rapportConformite('t1', 'ex1');
    expect(rapprochement.ecart).toBe(-500);
    expect(rapprochement.lecture).toMatch(/sans contrepartie comptable/);
  });

  /**
   * DÉFAUT DE CLASSE — le même que celui rencontré au TFT : une écriture de
   * régularisation qui se compense silencieusement. Le don en nature non
   * consommé à la clôture est extourné au DÉBIT du 7542 (Partie 3 ch. 4
   * § 1.2). Lu en net, le don de 1 000 dont 400 restent en stock ne pèserait
   * plus que 600 face à un registre qui en porte bien 1 000 : l'écart de 400
   * accuserait le registre d'un manquement inexistant.
   */
  it('lit les dons en nature au crédit seul : l’extourne de clôture ne réduit pas le don reçu', async () => {
    const { svc } = service([ligne('7542', ClasseCompte.CLASSE_7, 400, 1000)]);
    await svc.inscrire('t1', 'u1', donPP(1000, { modeLiberation: ModeLiberation.NATURE, designationNature: 'Sacs de riz (200)' }) as any);

    const { rapprochement } = await svc.rapportConformite('t1', 'ex1');
    expect(rapprochement.totalComptable).toBe(1000);
    expect(rapprochement.rapproche).toBe(true);
  });

  it('lit le 167 au crédit seul : la reprise au rythme des amortissements n’efface pas le legs reçu', async () => {
    const { svc } = service([ligne('1671', ClasseCompte.CLASSE_1, 250, 5000)]);
    await svc.inscrire('t1', 'u1', {
      ...donPP(5000), nature: NatureLiberalite.LEGS,
      modeLiberation: ModeLiberation.NATURE, designationNature: 'Bâtiment légué (Gombe)',
    } as any);
    const { rapprochement } = await svc.rapportConformite('t1', 'ex1');
    expect(rapprochement.totalComptable).toBe(5000);
  });

  /**
   * Le parrainage est chiffré mais JAMAIS agrégé : le texte le range sous
   * « Revenus liés à la générosité » tout en le définissant « en vue d'en
   * retirer un bénéfice direct », ce qui contredit « sans contrepartie ».
   * Trancher ici, dans un sens ou dans l'autre, serait combler une lacune du
   * référentiel (règle §2.6).
   */
  it('chiffre les comptes frontière sans les agréger au rapprochement', async () => {
    const { svc } = service([
      ligne('7041', ClasseCompte.CLASSE_7, 0, 500),
      ligne('7047', ClasseCompte.CLASSE_7, 0, 900),
      ligne('7045', ClasseCompte.CLASSE_7, 0, 120),
    ]);
    await svc.inscrire('t1', 'u1', donPP(500) as any);

    const { rapprochement } = await svc.rapportConformite('t1', 'ex1');
    expect(rapprochement.totalComptable).toBe(500);
    expect(rapprochement.rapproche).toBe(true);
    const parrainage = rapprochement.comptesFrontiere.find((c) => c.numero === '7047')!;
    expect(parrainage.montant).toBe(900);
    expect(parrainage.fondement).toMatch(/BÉNÉFICE DIRECT/);
  });

  it('chiffre à part la générosité promise non encore reçue (475), hors du champ de l’art. 17', async () => {
    const { svc } = service([ligne('475', ClasseCompte.CLASSE_4, 700, 0)]);
    const { rapprochement } = await svc.rapportConformite('t1', 'ex1');
    expect(rapprochement.totalComptable).toBe(0);
    expect(rapprochement.comptesHorsPerimetre.find((c) => c.numero === '475')!.montant).toBe(-700);
  });

  it('exclut du rapprochement les libéralités hors bornes de l’exercice', async () => {
    const { svc } = service([ligne('7041', ClasseCompte.CLASSE_7, 0, 100)], prismaAvec([
      { id: 'vieux', numero: 1, dateOperation: new Date('2025-06-01'), montant: new Prisma.Decimal(9999) } as any,
      { id: 'bon', numero: 2, dateOperation: new Date('2026-06-01'), montant: new Prisma.Decimal(100) } as any,
    ]));
    const rapport = await svc.rapportConformite('t1', 'ex1');
    expect(rapport.rapprochement.totalRegistre).toBe(100);
    expect(rapport.existence.lignesTotalRegistre).toBe(2);
    expect(rapport.existence.lignesSurExercice).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Périmètre — balayage structurel
// ---------------------------------------------------------------------------

describe('Périmètre comptable du registre', () => {
  /**
   * Défaut de classe rencontré cinq fois sur ce projet : un compte réclamé
   * par deux tableaux, donc compté deux fois. Ici il rendrait le
   * rapprochement faux en gonflant le total comptable.
   */
  it('n’assigne aucun compte à deux catégories à la fois', () => {
    const tous = [...COMPTES_LIBERALITE, ...COMPTES_FRONTIERE, ...COMPTES_HORS_PERIMETRE];
    const numeros = tous.map((c) => c.numero);
    expect(new Set(numeros).size).toBe(numeros.length);
  });

  /**
   * Un préfixe court qui en absorbe un long ferait le même dégât : « 704 »
   * capterait 7047 (frontière) dans le total des libéralités certaines.
   */
  it('n’a aucun préfixe qui en absorbe un autre', () => {
    const tous = [...COMPTES_LIBERALITE, ...COMPTES_FRONTIERE, ...COMPTES_HORS_PERIMETRE];
    for (const a of tous) {
      for (const b of tous) {
        if (a.numero !== b.numero) expect(b.numero.startsWith(a.numero)).toBe(false);
      }
    }
  });

  it('cite le texte pour chaque compte retenu ou écarté', () => {
    for (const c of [...COMPTES_LIBERALITE, ...COMPTES_FRONTIERE, ...COMPTES_HORS_PERIMETRE]) {
      expect(c.fondement.length).toBeGreaterThan(40);
      expect(c.fondement).toMatch(/Art|Partie|Glossaire/);
    }
  });
});
