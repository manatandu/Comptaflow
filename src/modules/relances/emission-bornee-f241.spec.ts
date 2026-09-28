import { Referentiel, StatutMessage, TypeRelance } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '../../common/prisma.service';
import { CourrierService, MessageAMettreEnFile } from '../courrier/courrier.service';
import { EmettreRelancesDto, PLAFOND_COMPTES_PAR_EMISSION } from './dto/relances.dto';
import { RelancesService } from './relances.service';

/**
 * AUDIT FINAL F241 · l'émission des relances tentait chaque remise SMTP dans
 * la requête, sans borne sur la sélection, et un second clic écrivait une
 * seconde lettre au même tiers.
 *
 * Trois choses sont gelées ici, chacune contre un défaut qui laisse le dossier
 * présentable · la sélection est bornée (à la porte ET dans le service),
 * l'émission met en file sans tenter (`ecrireEnFileSansTenter`, dans sa
 * transaction), et une lettre identique (même compte, même niveau, même jour
 * de Kinshasa, déjà en file ou partie) ne s'écrit qu'une fois, y compris
 * quand deux requêtes se croisent. Une relance du jour qui n'a fait partir
 * AUCUNE lettre (tiers sans adresse, envoi abandonné) ne bloque rien.
 *
 * LA DOUBLURE HONORE LE FILTRE DE LA RELECTURE (dossier, niveau, comptes,
 * bornes de date, origine et états des messages) et le VERROU · un verrou
 * simulé qui ne retiendrait rien ne prouverait pas que la seconde requête
 * attend la première.
 */

const DOSSIER = 'd-1';
const AGENT = 'u-1';
const JOUR = 86_400_000;

const NIVEAU = {
  id: 'n-2',
  tenantId: DOSSIER,
  niveau: 2,
  libelle: 'Premier rappel',
  type: TypeRelance.RAPPEL,
  joursApresEcheance: 15,
  modeleTexte: 'Cher {tiers}, {montant} au {date}.',
  estActif: true,
};
const AUTRE_NIVEAU = { ...NIVEAU, id: 'n-3', niveau: 3, libelle: 'Second rappel' };

function ligne(numero: string, email: string | null = `${numero}@client.cd`) {
  return {
    debit: 150_000,
    credit: 0,
    lettre: null,
    libelle: `Facture ${numero}`,
    dateEcheance: new Date(Date.now() - 60 * JOUR),
    compte: {
      id: `c-${numero}`,
      numero,
      intitule: 'Client',
      tiersCompte: { tiers: { id: `t-${numero}`, nom: `Client ${numero}`, type: 'CLIENT', email, horsRelance: false, motifHorsRelance: null, horsRelanceDepuis: null } },
    },
    ecriture: { date: new Date(Date.now() - 90 * JOUR), libelle: 'Vente' },
  };
}

type RelanceEnBase = { id: string; tenantId: string; compteId: string; niveauId: string; dateRelance: Date };
type MessageEnBase = { id: string; tenantId: string; origine: string; origineId: string; statut: StatutMessage };

/**
 * La base des relances EN MÉMOIRE, avec un verrou consultatif qui retient
 * vraiment · `$executeRaw` attend que la transaction qui tient le verrou soit
 * finie, comme `pg_advisory_xact_lock`.
 */
function service(lignes: ReturnType<typeof ligne>[], options: { lectureLente?: boolean } = {}) {
  const relances: RelanceEnBase[] = [];
  const messages: MessageEnBase[] = [];
  const ordre: string[] = [];
  let verrou: Promise<void> = Promise.resolve();

  const lireRelances = jest.fn(
    async (args: { where: { tenantId?: string; niveauId?: string; compteId?: { in: string[] }; dateRelance?: { gte?: Date; lt?: Date } } }) => {
      ordre.push('lecture');
      // Une lecture qui prend du temps · c'est pendant elle qu'une seconde
      // requête sans verrou lirait « rien ce jour » à son tour.
      if (options.lectureLente) await new Promise((r) => setTimeout(r, 20));
      const w = args.where;
      return relances
        .filter((r) => !w.tenantId || r.tenantId === w.tenantId)
        .filter((r) => !w.niveauId || r.niveauId === w.niveauId)
        .filter((r) => !w.compteId || w.compteId.in.includes(r.compteId))
        .filter((r) => !w.dateRelance?.gte || r.dateRelance >= w.dateRelance.gte)
        .filter((r) => !w.dateRelance?.lt || r.dateRelance < w.dateRelance.lt)
        .map((r) => ({ ...r, niveauRelance: { niveau: r.niveauId === NIVEAU.id ? 2 : 3 } }));
    },
  );
  /** Une ligne écrite · la doublure de `createMany` l'appelle pour chacune. */
  const creer = jest.fn((ligne: RelanceEnBase) => {
    relances.push(ligne);
  });
  const creerPlusieurs = jest.fn(async ({ data }: { data: RelanceEnBase[] }) => {
    ordre.push('ecriture');
    data.forEach((ligne) => creer(ligne));
    return { count: data.length };
  });
  /** Les messages de la file · la doublure honore dossier, origine, relances visées et états. */
  const lireMessages = jest.fn(
    async (args: { where: { tenantId?: string; origine?: string; origineId?: { in: string[] }; statut?: { in: StatutMessage[] } } }) => {
      const w = args.where;
      return messages
        .filter((m) => !w.tenantId || m.tenantId === w.tenantId)
        .filter((m) => !w.origine || m.origine === w.origine)
        .filter((m) => !w.origineId || w.origineId.in.includes(m.origineId))
        .filter((m) => !w.statut || w.statut.in.includes(m.statut))
        .map((m) => ({ origineId: m.origineId }));
    },
  );
  /** Les appels du verrou, pour les relire · le verrou lui-même vit par transaction. */
  const executeRaw = jest.fn();
  const prisma: Record<string, unknown> = {
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: Referentiel.SYSCOHADA }),
      findUnique: jest.fn().mockResolvedValue({ nom: 'SARL Kin' }),
    },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue(lignes) },
    niveauRelance: {
      findFirst: jest.fn(async (args: { where: { id: string } }) => [NIVEAU, AUTRE_NIVEAU].find((x) => x.id === args.where.id) ?? null),
      findMany: jest.fn().mockResolvedValue([NIVEAU, AUTRE_NIVEAU]),
    },
    relance: { findMany: lireRelances, createMany: creerPlusieurs },
    message: { findMany: lireMessages },
    compte: { findMany: jest.fn().mockResolvedValue([]) },
    // Chaque transaction reçoit SON client, dont le verrou se libère à la fin
    // de CETTE transaction · un verrou partagé entre deux transactions
    // simultanées ne dirait rien de leur ordre.
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      let liberer: () => void = () => undefined;
      let tenu = false;
      const tx = {
        ...prisma,
        // Le client de CETTE transaction, reconnaissable · la file doit y
        // écrire, jamais par le client ordinaire.
        estTransaction: true,
        $executeRaw: async (...args: unknown[]) => {
          executeRaw(...args);
          ordre.push('verrou');
          const precedent = verrou;
          verrou = new Promise<void>((r) => (liberer = r));
          tenu = true;
          await precedent;
          return 0;
        },
      };
      try {
        return await fn(tx);
      } finally {
        if (tenu) liberer();
      }
    }),
  };
  /**
   * La file, écrite dans la transaction reçue · chaque message entre dans la
   * base des messages, que la relecture d'une émission suivante consulte.
   */
  const ecrireEnFileSansTenter = jest.fn(
    async (client: { estTransaction?: boolean }, tenantId: string, lot: MessageAMettreEnFile[]) => {
      ordre.push(client.estTransaction ? 'message-dans-la-transaction' : 'message-hors-transaction');
      return lot.map((m) => {
        const id = `m-${messages.length + 1}`;
        messages.push({ id, tenantId, origine: m.origine, origineId: m.origineId!, statut: StatutMessage.EN_ATTENTE });
        return { id, statut: StatutMessage.EN_ATTENTE, motif: null };
      });
    },
  );
  /** Les messages écrits, à plat, dans l'ordre du lot. */
  const ecrits = () => (ecrireEnFileSansTenter.mock.calls as unknown as [unknown, string, MessageAMettreEnFile[]][]).flatMap(([, , lot]) => lot);
  const courrier = { ecrireEnFileSansTenter } as unknown as CourrierService;
  return {
    svc: new RelancesService(prisma as unknown as PrismaService, courrier),
    relances,
    messages,
    ecrireEnFileSansTenter,
    ecrits,
    creer,
    creerPlusieurs,
    executeRaw,
    ordre,
    lireRelances,
  };
}

const emettre = (svc: RelancesService, compteIds: string[], sur: Partial<EmettreRelancesDto> = {}) =>
  svc.emettre(DOSSIER, AGENT, { exerciceId: 'ex-1', niveauId: NIVEAU.id, compteIds, ...sur });

const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;

describe('F241 · la sélection est bornée, à la porte et dans le service', () => {
  it('le DTO refuse au-delà du plafond, en français, et admet le plafond lui-même', async () => {
    const trop = plainToInstance(EmettreRelancesDto, {
      exerciceId: uuid(0),
      niveauId: uuid(0),
      compteIds: Array.from({ length: PLAFOND_COMPTES_PAR_EMISSION + 1 }, (_, i) => uuid(i + 1)),
    });
    const erreurs = await validate(trop);
    expect(erreurs.map((e) => Object.values(e.constraints ?? {})).flat()).toContain(
      `Au plus ${PLAFOND_COMPTES_PAR_EMISSION} comptes par émission · découpez la sélection.`,
    );
    const juste = plainToInstance(EmettreRelancesDto, {
      exerciceId: uuid(0),
      niveauId: uuid(0),
      compteIds: Array.from({ length: PLAFOND_COMPTES_PAR_EMISSION }, (_, i) => uuid(i + 1)),
    });
    expect(await validate(juste)).toEqual([]);
  });

  it('le DTO refuse un compte nommé deux fois', async () => {
    const double = plainToInstance(EmettreRelancesDto, { exerciceId: uuid(0), niveauId: uuid(0), compteIds: [uuid(1), uuid(1)] });
    const erreurs = await validate(double);
    expect(erreurs.map((e) => Object.values(e.constraints ?? {})).flat()).toContain(
      'Un même compte figure deux fois dans la sélection.',
    );
  });

  it('le service revérifie le plafond avant toute lecture', async () => {
    const { svc, creer } = service([ligne('41100001')]);
    const ids = Array.from({ length: PLAFOND_COMPTES_PAR_EMISSION + 1 }, (_, i) => `c-${i}`);
    await expect(emettre(svc, ids)).rejects.toBeInstanceOf(BadRequestException);
    expect(creer).not.toHaveBeenCalled();
  });

  it('un compte nommé deux fois ne reçoit qu’une lettre, même sans passer par le DTO', async () => {
    const { svc, creer, ecrits } = service([ligne('41100001')]);
    const r = await emettre(svc, ['c-41100001', 'c-41100001']);
    expect(creer).toHaveBeenCalledTimes(1);
    expect(ecrits()).toHaveLength(1);
    expect(r.emises).toBe(1);
  });
});

describe('F241 · l’émission met en file, elle ne tente aucun envoi', () => {
  it('les lettres sont écrites pour la reprise, en UN lot, dans la transaction de l’émission', async () => {
    const { svc, ecrireEnFileSansTenter, ordre } = service([ligne('41100001'), ligne('41100002')]);
    const r = await emettre(svc, ['c-41100001', 'c-41100002']);
    expect(ecrireEnFileSansTenter).toHaveBeenCalledTimes(1);
    expect((ecrireEnFileSansTenter.mock.calls[0] as unknown[])[1]).toBe(DOSSIER);
    // DANS la transaction, après la relance · écrite après la transaction, la
    // lettre laissait une seconde émission lire la relance sans sa lettre.
    expect(ordre.slice(ordre.indexOf('verrou'))).toEqual(['verrou', 'lecture', 'ecriture', 'message-dans-la-transaction']);
    expect(r.lettres.map((l) => l.remise.statut)).toEqual([StatutMessage.EN_ATTENTE, StatutMessage.EN_ATTENTE]);
    expect(r.lettres.map((l) => l.remise.messageId)).toEqual(['m-1', 'm-2']);
    expect(r.misesEnFile).toBe(2);
  });

  it('le lot s’écrit en UNE insertion, et chaque message renvoie à SA relance', async () => {
    // Cinq cents écritures une à une tiendraient la transaction, et le verrou
    // du dossier, au-delà du délai d'une transaction interactive.
    const { svc, creerPlusieurs, relances, ecrits } = service([ligne('41100001'), ligne('41100002')]);
    await emettre(svc, ['c-41100001', 'c-41100002']);
    expect(creerPlusieurs).toHaveBeenCalledTimes(1);
    const origines = ecrits().map((m) => m.origineId);
    expect(origines).toEqual(relances.map((r) => r.id));
    expect(new Set(origines).size).toBe(2);
    expect(relances.map((r) => [r.compteId, r.tenantId, r.niveauId])).toEqual([
      ['c-41100001', DOSSIER, NIVEAU.id],
      ['c-41100002', DOSSIER, NIVEAU.id],
    ]);
  });
});

describe('F241 · une lettre identique ne part qu’une fois par jour', () => {
  it('le second clic n’écrit rien et le DIT, compte par compte', async () => {
    const { svc, creer, ecrits } = service([ligne('41100001'), ligne('41100002')]);
    const premier = await emettre(svc, ['c-41100001', 'c-41100002']);
    expect(premier.emises).toBe(2);
    expect(premier.dejaEmises).toEqual([]);

    const second = await emettre(svc, ['c-41100001', 'c-41100002']);
    expect(second.emises).toBe(0);
    expect(second.lettres).toEqual([]);
    expect(second.dejaEmises.map((d) => d.compteId)).toEqual(['c-41100001', 'c-41100002']);
    expect(second.dejaEmises[0].compte).toBe('41100001 · Client 41100001');
    expect(second.dejaEmises[0].motif).toContain('« Premier rappel » a déjà une lettre en file ou partie pour ce compte le');
    expect(creer).toHaveBeenCalledTimes(2);
    expect(ecrits()).toHaveLength(2);
  });

  it('une relance du jour SANS lettre ne bloque pas · le tiers dont on vient de compléter la fiche reçoit la sienne', async () => {
    // Premier passage · le tiers n'a pas d'adresse, la relance est écrite et
    // ne part à personne. Lui dire ensuite « déjà reçue » serait faux, et le
    // comptable qui a complété la fiche ne pourrait plus rien envoyer ce jour.
    const sansAdresse = service([ligne('41100001', null)]);
    const premier = await emettre(sansAdresse.svc, ['c-41100001']);
    expect(premier).toMatchObject({ emises: 1, misesEnFile: 0, nonRemises: 1 });
    expect(sansAdresse.ecrireEnFileSansTenter).not.toHaveBeenCalled();
    // Même base, fiche complétée entre-temps.
    const complete = service([ligne('41100001')]);
    complete.relances.push(...sansAdresse.relances);
    const second = await emettre(complete.svc, ['c-41100001']);
    expect(second.dejaEmises).toEqual([]);
    expect(second).toMatchObject({ emises: 1, misesEnFile: 1 });
  });

  it('une lettre ABANDONNÉE ne bloque pas · elle n’est pas partie et ne partira plus', async () => {
    const { svc, messages } = service([ligne('41100001')]);
    await emettre(svc, ['c-41100001']);
    messages[0].statut = StatutMessage.ABANDONNE;
    expect((await emettre(svc, ['c-41100001'])).emises).toBe(1);
  });

  it('une lettre gardée faute de messagerie, ou en échec qui sera retenté, bloque · elle partira', async () => {
    for (const statut of [StatutMessage.SANS_TRANSPORT, StatutMessage.ECHEC, StatutMessage.ENVOYE]) {
      const { svc, messages } = service([ligne('41100001')]);
      await emettre(svc, ['c-41100001']);
      messages[0].statut = statut;
      expect([statut, (await emettre(svc, ['c-41100001'])).dejaEmises.length]).toEqual([statut, 1]);
    }
  });

  it('un compte nouveau dans la même sélection reçoit sa lettre, les autres non', async () => {
    const { svc } = service([ligne('41100001'), ligne('41100002')]);
    await emettre(svc, ['c-41100001']);
    const r = await emettre(svc, ['c-41100001', 'c-41100002']);
    expect(r.lettres.map((l) => l.compteId)).toEqual(['c-41100002']);
    expect(r.dejaEmises.map((d) => d.compteId)).toEqual(['c-41100001']);
  });

  it('un AUTRE niveau le même jour reste permis · c’est une autre lettre', async () => {
    const { svc, creer } = service([ligne('41100001')]);
    await emettre(svc, ['c-41100001']);
    const r = await emettre(svc, ['c-41100001'], { niveauId: AUTRE_NIVEAU.id });
    expect(r.emises).toBe(1);
    expect(creer).toHaveBeenCalledTimes(2);
  });

  it('le lendemain, la même relance s’écrit de nouveau', async () => {
    const { svc } = service([ligne('41100001')]);
    await emettre(svc, ['c-41100001'], { dateReference: '2026-10-05' });
    const lendemain = await emettre(svc, ['c-41100001'], { dateReference: '2026-10-06' });
    expect(lendemain.emises).toBe(1);
    // Le même jour relu par une autre heure · la borne est le jour, pas l'instant.
    const memeJour = await emettre(svc, ['c-41100001'], { dateReference: '2026-10-06T15:30:00Z' });
    expect(memeJour.emises).toBe(0);
  });

  it('le jour est celui de Kinshasa · 23 h 30 UTC appartient déjà au lendemain', async () => {
    const { svc } = service([ligne('41100001')]);
    await emettre(svc, ['c-41100001'], { dateReference: '2026-10-06T10:00:00Z' });
    // 2026-10-06T23:30Z est le 7 octobre à 0 h 30 à Kinshasa (UTC+1).
    const r = await emettre(svc, ['c-41100001'], { dateReference: '2026-10-06T23:30:00Z' });
    expect(r.emises).toBe(1);
  });

  it('le jour de Kinshasa commence à 23 h UTC la veille · une lettre de 23 h 30 UTC compte pour le lendemain', async () => {
    const { svc } = service([ligne('41100001')]);
    // 2026-10-06T23:30Z est le 7 octobre à Kinshasa · la relance du 7 à midi
    // est la même, et ne s'écrit pas une seconde fois.
    await emettre(svc, ['c-41100001'], { dateReference: '2026-10-06T23:30:00Z' });
    const r = await emettre(svc, ['c-41100001'], { dateReference: '2026-10-07T11:00:00Z' });
    expect(r.emises).toBe(0);
    expect(r.dejaEmises).toHaveLength(1);
  });

  it('une relance d’un jour POSTÉRIEUR ne bloque pas celle d’un jour antérieur', async () => {
    // La borne est le jour entier, des deux côtés · une lettre datée du 7
    // n'est pas une lettre du 6.
    const { svc } = service([ligne('41100001')]);
    await emettre(svc, ['c-41100001'], { dateReference: '2026-10-07' });
    const r = await emettre(svc, ['c-41100001'], { dateReference: '2026-10-06' });
    expect(r.emises).toBe(1);
  });

  it('la relecture et l’écriture se font sous le verrou du dossier, verrou d’abord', async () => {
    const { svc, executeRaw, ordre } = service([ligne('41100001')]);
    await emettre(svc, ['c-41100001']);
    const gabarit = (executeRaw.mock.calls[0] as unknown[])[0] as TemplateStringsArray;
    expect(gabarit.join('?')).toContain('pg_advisory_xact_lock(hashtext(');
    expect((executeRaw.mock.calls[0] as unknown[])[1]).toBe(`relances:${DOSSIER}`);
    // La lecture des positions précède ; ce qui compte est la suite de la
    // transaction · verrou, relecture, écriture.
    expect(ordre.slice(ordre.indexOf('verrou'))).toEqual(['verrou', 'lecture', 'ecriture', 'message-dans-la-transaction']);
  });

  it('deux requêtes qui se croisent n’écrivent qu’une lettre', async () => {
    const { svc, creer } = service([ligne('41100001')], { lectureLente: true });
    const [a, b] = await Promise.all([emettre(svc, ['c-41100001']), emettre(svc, ['c-41100001'])]);
    expect(creer).toHaveBeenCalledTimes(1);
    expect(a.emises + b.emises).toBe(1);
    expect(a.dejaEmises.length + b.dejaEmises.length).toBe(1);
  });
});
