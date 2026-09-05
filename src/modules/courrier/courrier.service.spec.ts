import { BadRequestException } from '@nestjs/common';
import { StatutMessage } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { filtreBorne } from '../../common/cloisonnement/extension-cloisonnement';
import { CourrierService, ORIGINE_RELANCE } from './courrier.service';
import { PLAFOND_TENTATIVES } from './report-tentatives';
import { TransportCourriel } from './transport-courriel';

/**
 * LA FILE DES COURRIELS.
 *
 * Aucun transport n'est configuré sur cette installation, et c'est le cas qui
 * compte : le logiciel ne doit NI prétendre avoir envoyé, NI perdre le
 * message, NI refuser l'action du comptable. Les tests portent d'abord sur
 * cette conduite-là, puis sur ce qui casserait en silence · un message perdu
 * dans un état que rien ne relit, un abandon sans son erreur, un double envoi
 * au même tiers.
 *
 * La base est simulée EN MÉMOIRE et non par des `jest.fn()` rendant des
 * valeurs figées · ce qui est vérifié ici est une SUITE de transitions
 * d'états, et un faux qui rend toujours la même ligne ne montrerait aucune
 * transition.
 */

type Ligne = Record<string, any>;

function correspond(ligne: Ligne, filtre: any): boolean {
  if (!filtre) return true;
  for (const [cle, attendu] of Object.entries(filtre)) {
    if (cle === 'OR') {
      if (!(attendu as any[]).some((sous) => correspond(ligne, sous))) return false;
      continue;
    }
    const actuel = ligne[cle];
    if (attendu === null) {
      if (actuel !== null && actuel !== undefined) return false;
      continue;
    }
    if (attendu instanceof Date) {
      if (!(actuel instanceof Date) || actuel.getTime() !== attendu.getTime()) return false;
      continue;
    }
    if (typeof attendu === 'object') {
      const operateur = attendu as Record<string, any>;
      if ('lte' in operateur) {
        if (!(actuel instanceof Date) || actuel.getTime() > operateur.lte.getTime()) return false;
        continue;
      }
      throw new Error(`opérateur non simulé · ${JSON.stringify(attendu)}`);
    }
    if (actuel !== attendu) return false;
  }
  return true;
}

function baseMemoire(initiales: Ligne[] = []) {
  const table: Ligne[] = initiales.map((l) => ({ ...l }));
  /** Tous les filtres passés à Prisma · sert au contrôle de cloisonnement. */
  const filtres: unknown[] = [];
  let compteur = 0;
  /** Verrou posé sur la lecture, pour éprouver deux reprises qui se croisent. */
  let lectureRetardee: Promise<void> | null = null;

  const trier = (lignes: Ligne[], orderBy: any) => {
    if (!orderBy?.createdAt) return lignes;
    const sens = orderBy.createdAt === 'asc' ? 1 : -1;
    return [...lignes].sort((a, b) => sens * (a.createdAt.getTime() - b.createdAt.getTime()));
  };

  const prisma = {
    message: {
      create: jest.fn(async ({ data }: any) => {
        compteur += 1;
        const ligne: Ligne = {
          id: `m-${compteur}`,
          statut: StatutMessage.EN_ATTENTE,
          tentatives: 0,
          destinataireNom: null,
          origineId: null,
          createdBy: null,
          dernierEssaiAt: null,
          prochainEssaiAt: null,
          erreur: null,
          envoyeAt: null,
          createdAt: new Date(),
          ...data,
        };
        table.push(ligne);
        return { ...ligne };
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        filtres.push(where);
        const vises = table.filter((l) => correspond(l, where));
        for (const ligne of vises) Object.assign(ligne, data);
        return { count: vises.length };
      }),
      findMany: jest.fn(async ({ where, orderBy, take, select }: any) => {
        filtres.push(where);
        if (lectureRetardee) await lectureRetardee;
        const retenues = trier(
          table.filter((l) => correspond(l, where)),
          orderBy,
        ).slice(0, take ?? undefined);
        if (!select) return retenues.map((l) => ({ ...l }));
        return retenues.map((l) =>
          Object.fromEntries(Object.keys(select).map((champ) => [champ, l[champ]])),
        );
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        filtres.push(where);
        const trouvee = table.find((l) => correspond(l, where));
        return trouvee ? { ...trouvee } : null;
      }),
      count: jest.fn(async ({ where }: any) => {
        filtres.push(where);
        return table.filter((l) => correspond(l, where)).length;
      }),
      groupBy: jest.fn(async ({ where }: any) => {
        filtres.push(where);
        const parStatut = new Map<string, number>();
        for (const ligne of table.filter((l) => correspond(l, where))) {
          parStatut.set(ligne.statut, (parStatut.get(ligne.statut) ?? 0) + 1);
        }
        return [...parStatut].map(([statut, total]) => ({ statut, _count: { _all: total } }));
      }),
    },
  };

  return {
    prisma: prisma as unknown as PrismaService,
    table,
    filtres,
    retarderLecture: (promesse: Promise<void> | null) => {
      lectureRetardee = promesse;
    },
  };
}

function transportFactice(options: { configure: boolean; envoyer?: jest.Mock }) {
  const envoyer = options.envoyer ?? jest.fn(async () => undefined);
  return {
    etat: jest.fn(() => ({
      configure: options.configure,
      manques: options.configure ? [] : [{ variable: 'SMTP_HOST', raison: 'variable absente' }],
      expediteur: options.configure ? 'omegax@vmg-consulting.cd' : null,
    })),
    envoyer,
  } as unknown as TransportCourriel & { envoyer: jest.Mock; etat: jest.Mock };
}

const DOSSIER = 'd-1';
const RELANCE = {
  destinataire: 'tresorier@ong-kin.cd',
  destinataireNom: 'Trésorier · ONG Kin',
  sujet: 'Rappel · cotisation 2026',
  corps: 'Madame, Monsieur,\n\nNos livres font apparaître…',
  origine: ORIGINE_RELANCE,
  origineId: 'relance-7',
  createdBy: 'u-1',
};

const ilYA = (minutes: number) => new Date(Date.now() - minutes * 60_000);

// ---------------------------------------------------------------------------

describe('sans transport · ni mentir, ni perdre, ni refuser', () => {
  it('ÉCRIT le message, le marque SANS_TRANSPORT, et ne lève pas', async () => {
    const memoire = baseMemoire();
    const service = new CourrierService(memoire.prisma, transportFactice({ configure: false }));

    const resultat = await service.mettreEnFile(DOSSIER, RELANCE);

    // Le refus d'action serait la faute symétrique du mensonge · le comptable
    // perdrait son travail parce que la messagerie n'est pas encore posée.
    expect(resultat.statut).toBe(StatutMessage.SANS_TRANSPORT);
    expect(memoire.table).toHaveLength(1);
    expect(memoire.table[0]).toMatchObject({
      tenantId: DOSSIER,
      statut: StatutMessage.SANS_TRANSPORT,
      corps: RELANCE.corps,
      origine: ORIGINE_RELANCE,
      origineId: 'relance-7',
      createdBy: 'u-1',
      envoyeAt: null,
    });
  });

  it('ne consomme AUCUNE tentative · elles n’ont jamais eu leur chance', async () => {
    const memoire = baseMemoire();
    const service = new CourrierService(memoire.prisma, transportFactice({ configure: false }));
    await service.mettreEnFile(DOSSIER, RELANCE);
    expect(memoire.table[0].tentatives).toBe(0);
    expect(memoire.table[0].prochainEssaiAt).toBeNull();
    // `erreur` reste VIDE · la cause est globale à l'installation, et recopiée
    // sur chaque ligne elle deviendrait fausse le jour où le transport est posé.
    expect(memoire.table[0].erreur).toBeNull();
  });

  it('la reprise sans transport ne tente rien et le DIT', async () => {
    const memoire = baseMemoire();
    const service = new CourrierService(memoire.prisma, transportFactice({ configure: false }));
    await service.mettreEnFile(DOSSIER, RELANCE);

    const bilan = await service.reprendre(DOSSIER);
    expect(bilan).toMatchObject({ transportConfigure: false, examines: 0, envoyes: 0, restants: 1 });
    expect(bilan.manques[0].variable).toBe('SMTP_HOST');
    expect(memoire.table[0].tentatives).toBe(0);
  });

  it('LE JOUR OÙ LES IDENTIFIANTS SONT POSÉS, le message repart tel quel', async () => {
    const memoire = baseMemoire();
    const sansTransport = new CourrierService(memoire.prisma, transportFactice({ configure: false }));
    await sansTransport.mettreEnFile(DOSSIER, RELANCE);

    const transport = transportFactice({ configure: true });
    const bilan = await new CourrierService(memoire.prisma, transport).reprendre(DOSSIER);

    expect(bilan).toMatchObject({ examines: 1, envoyes: 1, restants: 0 });
    // Sans avoir été réécrit · c'est la promesse de l'état SANS_TRANSPORT.
    expect(transport.envoyer).toHaveBeenCalledWith({
      destinataire: RELANCE.destinataire,
      destinataireNom: RELANCE.destinataireNom,
      sujet: RELANCE.sujet,
      corps: RELANCE.corps,
    });
    expect(memoire.table[0]).toMatchObject({ statut: StatutMessage.ENVOYE, tentatives: 1 });
    expect(memoire.table[0].envoyeAt).toBeInstanceOf(Date);
  });
});

describe('ce qui est refusé À L’ÉCRITURE', () => {
  it('une adresse vide ou invalide ne rentre pas dans la file', async () => {
    const memoire = baseMemoire();
    const service = new CourrierService(memoire.prisma, transportFactice({ configure: false }));

    await expect(service.mettreEnFile(DOSSIER, { ...RELANCE, destinataire: '  ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.mettreEnFile(DOSSIER, { ...RELANCE, destinataire: 'tresorier-chez-ong' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // AUCUNE ligne écrite · découverte à la troisième tentative, la faute
    // remonterait des heures après le geste qui l'a produite.
    expect(memoire.table).toHaveLength(0);
  });

  it('un message sans objet, sans corps ou sans origine est refusé', async () => {
    const memoire = baseMemoire();
    const service = new CourrierService(memoire.prisma, transportFactice({ configure: false }));
    await expect(service.mettreEnFile(DOSSIER, { ...RELANCE, sujet: ' ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.mettreEnFile(DOSSIER, { ...RELANCE, corps: '\n\n' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.mettreEnFile(DOSSIER, { ...RELANCE, origine: '' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(memoire.table).toHaveLength(0);
  });
});

describe('le corps n’est tronqué NULLE PART', () => {
  it('un rappel de 60 000 caractères est écrit, remis et relu entier', async () => {
    const memoire = baseMemoire();
    const transport = transportFactice({ configure: true });
    const service = new CourrierService(memoire.prisma, transport);
    // Un relevé de compte détaillé sur un exercice entier atteint cette
    // taille · coupé, il devient un décompte FAUX remis à un tiers, sous la
    // signature du dossier.
    const corps = `Relevé détaillé\n${'ligne de facture impayée · 1 250 000 CDF\n'.repeat(1_500)}`;
    expect(corps.length).toBeGreaterThan(60_000);

    const { id } = await service.mettreEnFile(DOSSIER, { ...RELANCE, corps });

    expect(memoire.table[0].corps).toBe(corps);
    expect(transport.envoyer.mock.calls[0][0].corps).toBe(corps);
    expect((await service.lire(DOSSIER, id)).corps).toBe(corps);
  });

  it('la liste OMET le corps au lieu de l’abréger, la fiche le rend entier', async () => {
    const memoire = baseMemoire();
    const service = new CourrierService(memoire.prisma, transportFactice({ configure: false }));
    const { id } = await service.mettreEnFile(DOSSIER, RELANCE);

    const file = await service.lister(DOSSIER);
    // Un texte coupé à trois cents caractères se lit comme le message et n'en
    // est pas un · l'absence est honnête, l'aperçu ne l'est pas.
    expect(file.messages[0]).not.toHaveProperty('corps');
    expect(file.messages[0]).toMatchObject({ sujet: RELANCE.sujet, statut: StatutMessage.SANS_TRANSPORT });
    expect(file).toMatchObject({ total: 1, tronque: false });
    expect((await service.lire(DOSSIER, id)).corps).toBe(RELANCE.corps);
  });
});

describe('reprise sur échec', () => {
  const transportQuiEchoue = (message: string) =>
    transportFactice({
      configure: true,
      envoyer: jest.fn(async () => {
        throw new Error(message);
      }),
    });

  it('le premier échec laisse un ECHEC daté à cinq minutes, avec son erreur', async () => {
    const memoire = baseMemoire();
    const service = new CourrierService(memoire.prisma, transportQuiEchoue('421 service indisponible'));

    const resultat = await service.mettreEnFile(DOSSIER, RELANCE);

    expect(resultat.statut).toBe(StatutMessage.ECHEC);
    expect(resultat.erreur).toContain('421 service indisponible');
    const ligne = memoire.table[0];
    expect(ligne.tentatives).toBe(1);
    expect(ligne.prochainEssaiAt.getTime() - ligne.dernierEssaiAt.getTime()).toBe(5 * 60_000);
  });

  it('un échec dont l’heure n’est pas venue n’est PAS repris', async () => {
    const memoire = baseMemoire([
      {
        id: 'm-attente',
        tenantId: DOSSIER,
        ...RELANCE,
        statut: StatutMessage.ECHEC,
        tentatives: 1,
        dernierEssaiAt: ilYA(1),
        prochainEssaiAt: new Date(Date.now() + 4 * 60_000),
        erreur: '421',
        envoyeAt: null,
        createdAt: ilYA(1),
      },
    ]);
    const transport = transportFactice({ configure: true });
    const bilan = await new CourrierService(memoire.prisma, transport).reprendre(DOSSIER);
    // Marteler le serveur toutes les minutes fait classer l'expéditeur comme
    // indésirable, et c'est TOUT le courrier du cabinet qui cesse d'arriver.
    expect(bilan).toMatchObject({ examines: 0, envoyes: 0, restants: 0 });
    expect(transport.envoyer).not.toHaveBeenCalled();
  });

  it('au cinquième échec le message est ABANDONNÉ, GARDE son erreur, et sort de la file', async () => {
    const memoire = baseMemoire([
      {
        id: 'm-fin',
        tenantId: DOSSIER,
        ...RELANCE,
        statut: StatutMessage.ECHEC,
        tentatives: PLAFOND_TENTATIVES - 1,
        dernierEssaiAt: ilYA(300),
        prochainEssaiAt: ilYA(60),
        erreur: 'échec précédent',
        envoyeAt: null,
        createdAt: ilYA(600),
      },
    ]);
    const service = new CourrierService(memoire.prisma, transportQuiEchoue('550 boîte inconnue'));

    const bilan = await service.reprendre(DOSSIER);

    expect(bilan).toMatchObject({ examines: 1, abandonnes: 1, restants: 0 });
    const ligne = memoire.table[0];
    expect(ligne.statut).toBe(StatutMessage.ABANDONNE);
    expect(ligne.tentatives).toBe(PLAFOND_TENTATIVES);
    // Une relance jamais partie est une information comptable · un dossier de
    // recouvrement se défend avec ce qu'on a tenté.
    expect(ligne.erreur).toContain('550 boîte inconnue');
    // SANS date de prochain essai · datée, la ligne reparaîtrait indéfiniment.
    expect(ligne.prochainEssaiAt).toBeNull();
  });

  it('un ABANDONNE ne repart jamais, même relancé', async () => {
    const memoire = baseMemoire([
      {
        id: 'm-abandon',
        tenantId: DOSSIER,
        ...RELANCE,
        statut: StatutMessage.ABANDONNE,
        tentatives: PLAFOND_TENTATIVES,
        dernierEssaiAt: ilYA(600),
        prochainEssaiAt: null,
        erreur: '550 boîte inconnue',
        envoyeAt: null,
        createdAt: ilYA(900),
      },
    ]);
    const transport = transportFactice({ configure: true });
    await new CourrierService(memoire.prisma, transport).reprendre(DOSSIER);
    expect(transport.envoyer).not.toHaveBeenCalled();
    expect(memoire.table[0].statut).toBe(StatutMessage.ABANDONNE);
  });

  it('un message ORPHELIN d’une instance morte est rattrapé, un envoi en cours ne l’est pas', async () => {
    const memoire = baseMemoire([
      // Le processus est mort entre l'écriture et la tentative · sans ce
      // rattrapage la ligne resterait invisible pour toujours dans un état
      // que rien ne relit, exactement la coupure contre laquelle la file existe.
      {
        id: 'm-orphelin',
        tenantId: DOSSIER,
        ...RELANCE,
        statut: StatutMessage.EN_ATTENTE,
        tentatives: 0,
        dernierEssaiAt: null,
        prochainEssaiAt: null,
        erreur: null,
        envoyeAt: null,
        createdAt: ilYA(30),
      },
      // Écrit il y a dix secondes · une remise SMTP lente ne doit pas passer
      // pour un orphelin, ce qui l'enverrait deux fois.
      {
        id: 'm-en-cours',
        tenantId: DOSSIER,
        ...RELANCE,
        statut: StatutMessage.EN_ATTENTE,
        tentatives: 0,
        dernierEssaiAt: null,
        prochainEssaiAt: null,
        erreur: null,
        envoyeAt: null,
        createdAt: new Date(Date.now() - 10_000),
      },
    ]);
    const transport = transportFactice({ configure: true });
    const bilan = await new CourrierService(memoire.prisma, transport).reprendre(DOSSIER);

    expect(bilan).toMatchObject({ examines: 1, envoyes: 1 });
    expect(memoire.table.find((l) => l.id === 'm-orphelin')!.statut).toBe(StatutMessage.ENVOYE);
    expect(memoire.table.find((l) => l.id === 'm-en-cours')!.statut).toBe(StatutMessage.EN_ATTENTE);
  });

  it('DEUX reprises qui se croisent n’envoient qu’une fois', async () => {
    // Le comptable clique deux fois, ou deux instances Cloud Run servent deux
    // onglets · un double rappel au même tiers est une faute commerciale que
    // rien ne rattrape.
    const memoire = baseMemoire([
      {
        id: 'm-unique',
        tenantId: DOSSIER,
        ...RELANCE,
        statut: StatutMessage.SANS_TRANSPORT,
        tentatives: 0,
        dernierEssaiAt: null,
        prochainEssaiAt: null,
        erreur: null,
        envoyeAt: null,
        createdAt: ilYA(60),
      },
    ]);
    const transport = transportFactice({ configure: true });
    const service = new CourrierService(memoire.prisma, transport);

    let debloquer!: () => void;
    memoire.retarderLecture(new Promise<void>((resoudre) => (debloquer = resoudre)));
    const premier = service.reprendre(DOSSIER);
    const second = service.reprendre(DOSSIER);
    await new Promise((suite) => setImmediate(suite));
    // Les deux lectures rendent LA MÊME ligne · c'est là que se joue le doublon.
    memoire.retarderLecture(null);
    debloquer();
    const [a, b] = await Promise.all([premier, second]);

    expect(transport.envoyer).toHaveBeenCalledTimes(1);
    expect(a.examines + b.examines).toBe(1);
    expect(a.ignores + b.ignores).toBe(1);
    expect(memoire.table[0].statut).toBe(StatutMessage.ENVOYE);
  });
});

describe('ce que l’écran lit', () => {
  it('les cinq états sont rendus MÊME À ZÉRO, et aRelancer ne compte que l’actionnable', async () => {
    const memoire = baseMemoire([
      { id: 'a', tenantId: DOSSIER, ...RELANCE, statut: StatutMessage.ENVOYE, tentatives: 1, dernierEssaiAt: ilYA(60), prochainEssaiAt: null, erreur: null, envoyeAt: ilYA(60), createdAt: ilYA(60) },
      { id: 'b', tenantId: DOSSIER, ...RELANCE, statut: StatutMessage.SANS_TRANSPORT, tentatives: 0, dernierEssaiAt: null, prochainEssaiAt: null, erreur: null, envoyeAt: null, createdAt: ilYA(50) },
      { id: 'c', tenantId: DOSSIER, ...RELANCE, statut: StatutMessage.ECHEC, tentatives: 2, dernierEssaiAt: ilYA(40), prochainEssaiAt: ilYA(10), erreur: '421', envoyeAt: null, createdAt: ilYA(40) },
      { id: 'd', tenantId: DOSSIER, ...RELANCE, statut: StatutMessage.ECHEC, tentatives: 1, dernierEssaiAt: ilYA(1), prochainEssaiAt: new Date(Date.now() + 240_000), erreur: '421', envoyeAt: null, createdAt: ilYA(1) },
      { id: 'e', tenantId: 'AUTRE-DOSSIER', ...RELANCE, statut: StatutMessage.ECHEC, tentatives: 1, dernierEssaiAt: ilYA(1), prochainEssaiAt: ilYA(1), erreur: '421', envoyeAt: null, createdAt: ilYA(1) },
    ]);
    const service = new CourrierService(memoire.prisma, transportFactice({ configure: true }));

    const compteurs = await service.compterParStatut(DOSSIER);

    expect(compteurs).toEqual({
      EN_ATTENTE: 0,
      SANS_TRANSPORT: 1,
      ENVOYE: 1,
      ECHEC: 2,
      ABANDONNE: 0,
      // Ni l'envoyé, ni l'échec dont l'heure n'est pas venue · une pastille qui
      // compte ce sur quoi le bouton ne fera rien apprend à ignorer la pastille.
      aRelancer: 2,
    });
  });

  it('la liste et les compteurs s’arrêtent au dossier', async () => {
    const memoire = baseMemoire([
      { id: 'ici', tenantId: DOSSIER, ...RELANCE, statut: StatutMessage.ENVOYE, tentatives: 1, dernierEssaiAt: null, prochainEssaiAt: null, erreur: null, envoyeAt: null, createdAt: ilYA(2) },
      { id: 'ailleurs', tenantId: 'AUTRE-DOSSIER', ...RELANCE, statut: StatutMessage.ENVOYE, tentatives: 1, dernierEssaiAt: null, prochainEssaiAt: null, erreur: null, envoyeAt: null, createdAt: ilYA(1) },
    ]);
    const service = new CourrierService(memoire.prisma, transportFactice({ configure: true }));

    const file = await service.lister(DOSSIER);
    expect(file.messages.map((m: any) => m.id)).toEqual(['ici']);
    expect(file.total).toBe(1);
    // Une ligne d'un autre dossier est INEXISTANTE, pas refusée avec une
    // erreur qui apprendrait que l'identifiant existe ailleurs.
    await expect(service.lire(DOSSIER, 'ailleurs')).rejects.toThrow('introuvable');
  });

  it('le filtre par état ne desserre jamais la borne de dossier', async () => {
    const memoire = baseMemoire();
    const service = new CourrierService(memoire.prisma, transportFactice({ configure: false }));
    await service.lister(DOSSIER, { statut: StatutMessage.ECHEC, limite: 10 });
    expect(memoire.filtres.every((filtre) => filtreBorne(filtre))).toBe(true);
  });
});

describe('cloisonnement · la borne est posée aux DEUX bouts', () => {
  it('AUCUNE requête du module ne part sans son tenantId', async () => {
    // La garde de src/common/cloisonnement/ refuserait une collection non
    // bornée en production ; ici on éprouve la MOITIÉ qui relève du service,
    // écritures unitaires comprises, que la garde laisserait passer après
    // relecture. `filtreBorne` est celle de la garde, pas une copie.
    const memoire = baseMemoire();
    const transport = transportFactice({ configure: true });
    const service = new CourrierService(memoire.prisma, transport);

    const { id } = await service.mettreEnFile(DOSSIER, RELANCE);
    await service.lister(DOSSIER);
    await service.lire(DOSSIER, id);
    await service.compterParStatut(DOSSIER);
    await service.reprendre(DOSSIER);

    expect(memoire.filtres.length).toBeGreaterThan(5);
    expect(memoire.filtres.filter((filtre) => !filtreBorne(filtre))).toEqual([]);
  });

  it('la création porte le dossier dans ses données', async () => {
    const memoire = baseMemoire();
    const service = new CourrierService(memoire.prisma, transportFactice({ configure: false }));
    await service.mettreEnFile(DOSSIER, RELANCE);
    expect((memoire.prisma as any).message.create.mock.calls[0][0].data.tenantId).toBe(DOSSIER);
  });
});
