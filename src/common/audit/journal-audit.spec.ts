import { calculerEmpreinte, EMPREINTE_ORIGINE, ContenuEmpreinte } from './empreinte-audit';
import { masquer, estChampSensible, MARQUEUR_MASQUE, MODELES_AUDITES } from './champs-audites';
import { JournalAuditService } from './journal-audit.service';
import { JournalAuditController } from './journal-audit.controller';
import { intercepterEcriture } from './extension-audit';
import { dansContexteAudit, ACTEUR_SYSTEME } from './contexte-audit';
import { Logger } from '@nestjs/common';

/**
 * AUDCIF art. 22, 6° · « l'organisation garantisse toutes les possibilités de
 * contrôle en permettant la reconstitution du chemin de révision », et 5° ·
 * « est réputée intègre toute transcription indélébile entraînant une
 * modification irréversible du support ».
 *
 * Ces tests portent sur les trois propriétés qui font qu'un journal d'audit
 * vaut quelque chose · il est INOUBLIABLE (posé sur le client Prisma),
 * VÉRIFIABLE (chaîne d'empreintes) et il ne recopie PAS les secrets.
 */

const socle = (): ContenuEmpreinte => ({
  rang: 1,
  tenantId: 'dossier-1',
  horodatage: new Date('2026-09-02T10:00:00.000Z'),
  acteurId: 'u-1',
  acteurEmail: 'comptable@cabinet.cd',
  adresseIp: '41.243.0.1',
  action: 'MODIFICATION',
  entite: 'Compte',
  entiteId: 'c-1',
  avant: { intitule: 'Caisse' },
  apres: { intitule: 'Caisse siège' },
  empreintePrecedente: EMPREINTE_ORIGINE,
});

describe('empreinte de la chaîne d’audit', () => {
  it('est stable quel que soit l’ordre des clés relues', () => {
    // La base ne garantit pas l'ordre des clés d'un JSON relu · sans
    // sérialisation triée, une simple relecture ferait crier à la
    // falsification.
    const a = calculerEmpreinte({ ...socle(), avant: { x: 1, y: 2 }, apres: null });
    const b = calculerEmpreinte({ ...socle(), avant: { y: 2, x: 1 }, apres: null });
    expect(a).toBe(b);
  });

  it('change dès qu’un seul champ journalisé change', () => {
    const reference = calculerEmpreinte(socle());
    const variantes: Array<Partial<ContenuEmpreinte>> = [
      { rang: 2 },
      { tenantId: 'dossier-2' },
      { horodatage: new Date('2026-09-02T10:00:00.001Z') },
      { acteurId: 'u-2' },
      { acteurEmail: 'autre@cabinet.cd' },
      { adresseIp: '41.243.0.2' },
      { action: 'SUPPRESSION' },
      { entite: 'Journal' },
      { entiteId: 'c-2' },
      { avant: { intitule: 'Banque' } },
      { apres: { intitule: 'Banque' } },
      { empreintePrecedente: 'autre' },
    ];
    for (const v of variantes) {
      const cle = Object.keys(v)[0];
      expect([cle, calculerEmpreinte({ ...socle(), ...v }) === reference]).toEqual([cle, false]);
    }
  });

  it('couvre l’adresse IP · ce qui n’est pas haché se retouche sans marque', () => {
    // Défaut réel de la première rédaction : l'adresse était passée au
    // calcul avec un cast et n'entrait donc pas dans l'empreinte.
    expect(calculerEmpreinte({ ...socle(), adresseIp: null })).not.toBe(calculerEmpreinte(socle()));
  });
});

describe('ce que le journal ne recopie jamais', () => {
  it('masque tout champ sensible, à toute profondeur', () => {
    // Un journal qui recopie l'empreinte d'un mot de passe est une SECONDE
    // base de mots de passe, moins surveillée et conservée plus longtemps.
    const sortie = masquer({
      email: 'a@b.cd',
      motDePasse: '$2b$10$abcdef',
      profond: { ancienMotDePasseHash: 'x', jetonCsrf: 'y', role: 'ADMIN_CABINET' },
      liste: [{ apiKey: 'z' }],
    }) as Record<string, any>;

    expect(sortie.email).toBe('a@b.cd');
    expect(sortie.motDePasse).toBe(MARQUEUR_MASQUE);
    expect(sortie.profond.ancienMotDePasseHash).toBe(MARQUEUR_MASQUE);
    expect(sortie.profond.jetonCsrf).toBe(MARQUEUR_MASQUE);
    // La CLÉ reste · savoir que le rôle n'a pas bougé fait partie de la trace.
    expect(sortie.profond.role).toBe('ADMIN_CABINET');
    expect(sortie.liste[0].apiKey).toBe(MARQUEUR_MASQUE);
  });

  it('reconnaît les variantes d’écriture d’un champ sensible', () => {
    for (const nom of ['motDePasse', 'MotDePasseHash', 'password', 'jetonSession', 'refreshToken', 'jetonCsrf', 'DATABASE_URL'.replace('_', '')]) {
      expect([nom, estChampSensible(nom)]).toEqual([nom, true]);
    }
    for (const nom of ['email', 'intitule', 'numero', 'role']) {
      expect([nom, estChampSensible(nom)]).toEqual([nom, false]);
    }
  });
});

describe('périmètre journalisé', () => {
  it('couvre les accès, la configuration et les actes d’exercice', () => {
    for (const m of ['User', 'Tenant', 'Compte', 'Journal', 'Exercice', 'Cloture', 'Ecriture', 'TauxTva', 'AffectationResultat']) {
      expect([m, MODELES_AUDITES.has(m)]).toEqual([m, true]);
    }
  });

  it('exclut délibérément les lignes engendrées en masse', () => {
    // Ce n'est pas un oubli · journaliser LigneEcriture doublerait la table la
    // plus grosse du logiciel sans ajouter d'information que la tête d'écriture
    // ne porte déjà. Le test fige la décision pour qu'elle se discute plutôt
    // qu'elle ne se subisse.
    for (const m of ['LigneEcriture', 'DotationAmortissement', 'VentilationAnalytique', 'CoursDevise', 'EcheanceAbonnement']) {
      expect([m, MODELES_AUDITES.has(m)]).toEqual([m, false]);
    }
  });
});

describe('vérification de la chaîne', () => {
  /** Fabrique une chaîne saine de n maillons, telle que la base la porterait. */
  function chaineSaine(n: number) {
    const evenements: any[] = [];
    let precedente = EMPREINTE_ORIGINE;
    for (let rang = 1; rang <= n; rang++) {
      const e = {
        id: `e-${rang}`,
        rang,
        tenantId: 'dossier-1',
        horodatage: new Date(Date.UTC(2026, 8, 2, 10, rang)),
        acteurId: 'u-1',
        acteurEmail: 'comptable@cabinet.cd',
        adresseIp: '41.243.0.1',
        action: 'MODIFICATION',
        entite: 'Compte',
        entiteId: `c-${rang}`,
        avant: null,
        apres: { intitule: `libellé ${rang}` },
        empreintePrecedente: precedente,
        empreinte: '',
      };
      e.empreinte = calculerEmpreinte(e as ContenuEmpreinte);
      precedente = e.empreinte;
      evenements.push(e);
    }
    return evenements;
  }

  const service = (evenements: any[]) =>
    new JournalAuditService({ evenementAudit: { findMany: jest.fn().mockResolvedValue(evenements) } } as any);

  it('déclare intacte une chaîne non touchée', async () => {
    const verdict = await service(chaineSaine(5)).verifier('dossier-1');
    expect(verdict).toEqual({ evenements: 5, intacte: true, ruptures: [] });
  });

  it('voit une ligne RETOUCHÉE, et dit laquelle', async () => {
    const c = chaineSaine(5);
    c[2].acteurEmail = 'quelquun.dautre@cabinet.cd'; // on maquille l'auteur
    const verdict = await service(c).verifier('dossier-1');
    expect(verdict.intacte).toBe(false);
    expect(verdict.ruptures).toContainEqual({ rang: 3, id: 'e-3', motif: 'EMPREINTE_INVALIDE' });
  });

  it('voit une ligne SUPPRIMÉE', async () => {
    const c = chaineSaine(5).filter((e) => e.rang !== 3);
    const verdict = await service(c).verifier('dossier-1');
    expect(verdict.intacte).toBe(false);
    expect(verdict.ruptures.map((r) => r.motif)).toContain('RANG_MANQUANT');
  });

  it('voit une ligne INSÉRÉE après coup', async () => {
    const c = chaineSaine(5);
    // Un faux maillon glissé au rang 3, avec un chaînage inventé.
    c[2] = { ...c[2], empreintePrecedente: 'inventé', empreinte: 'inventée' };
    const verdict = await service(c).verifier('dossier-1');
    expect(verdict.ruptures.map((r) => r.motif)).toContain('CHAINAGE_ROMPU');
  });

  it('ne signale QUE le point de rupture, pas toute la suite', async () => {
    // Repartir de l'empreinte recalculée ferait paraître falsifiés tous les
    // maillons suivants et noierait le vrai point de rupture · c'est pourquoi
    // la vérification repart de l'empreinte STOCKÉE.
    const c = chaineSaine(6);
    c[1].entiteId = 'maquillé';
    const verdict = await service(c).verifier('dossier-1');
    expect(verdict.ruptures).toEqual([{ rang: 2, id: 'e-2', motif: 'EMPREINTE_INVALIDE' }]);
  });
});

describe('le journal se lit, il ne s’écrit pas', () => {
  it('n’expose aucune route d’écriture', () => {
    // Une route qui modifierait le journal viderait la garantie de son sens.
    // On relit le prototype plutôt que le fichier : c'est ce qui est monté.
    const methodes = Object.getOwnPropertyNames(JournalAuditController.prototype).filter((m) => m !== 'constructor');
    expect(methodes.sort()).toEqual(['lister', 'verifier']);
  });
});

describe('l’interception, telle qu’elle est branchée', () => {
  /** Un client Prisma factice · on n'a besoin que de ce que l'interception touche. */
  function baseFactice(precedent: { rang: number; empreinte: string } | null = null) {
    const maillons: any[] = [];
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{}]),
      evenementAudit: {
        findFirst: jest.fn().mockResolvedValue(precedent),
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          maillons.push(data);
          return data;
        }),
      },
    };
    return {
      maillons,
      tx,
      client: {
        $transaction: jest.fn().mockImplementation(async (f: any) => f(tx)),
        compte: { findFirst: jest.fn().mockResolvedValue({ id: 'c-1', tenantId: 'd-1', intitule: 'Caisse' }) },
        user: { findFirst: jest.fn().mockResolvedValue({ id: 'u-9', tenantId: 'd-1', email: 'x@y.cd', motDePasse: '$2b$10$secret' }) },
      } as any,
    };
  }

  it('écrit un maillon pour un modèle audité, avec l’état avant et après', async () => {
    const { client, maillons } = baseFactice();
    const resultat = await dansContexteAudit(
      { acteurId: 'u-1', acteurEmail: 'chef@cabinet.cd', tenantId: 'd-1', adresseIp: '41.243.0.1' },
      () =>
        intercepterEcriture(client, {
          model: 'Compte',
          operation: 'update',
          args: { where: { id: 'c-1' }, data: { intitule: 'Caisse siège' } },
          query: async () => ({ id: 'c-1', tenantId: 'd-1', intitule: 'Caisse siège' }),
        }),
    );

    expect(resultat).toEqual({ id: 'c-1', tenantId: 'd-1', intitule: 'Caisse siège' });
    expect(maillons).toHaveLength(1);
    expect(maillons[0]).toMatchObject({
      tenantId: 'd-1',
      rang: 1,
      acteurId: 'u-1',
      acteurEmail: 'chef@cabinet.cd',
      adresseIp: '41.243.0.1',
      action: 'MODIFICATION',
      entite: 'Compte',
      entiteId: 'c-1',
      empreintePrecedente: EMPREINTE_ORIGINE,
    });
    expect(maillons[0].avant).toEqual({ id: 'c-1', tenantId: 'd-1', intitule: 'Caisse' });
    expect(maillons[0].apres).toEqual({ id: 'c-1', tenantId: 'd-1', intitule: 'Caisse siège' });
  });

  it('n’écrit RIEN pour un modèle hors périmètre', async () => {
    const { client, maillons } = baseFactice();
    await intercepterEcriture(client, {
      model: 'LigneEcriture',
      operation: 'create',
      args: { data: {} },
      query: async () => ({ id: 'l-1' }),
    });
    expect(maillons).toHaveLength(0);
  });

  it('n’écrit RIEN pour une lecture', async () => {
    const { client, maillons } = baseFactice();
    await intercepterEcriture(client, {
      model: 'Compte',
      operation: 'findMany',
      args: {},
      query: async () => [],
    });
    expect(maillons).toHaveLength(0);
  });

  it('ne recopie jamais le mot de passe, même en passant par l’interception', async () => {
    // La garde de bout en bout · masquer() est testé plus haut, ici on
    // vérifie qu'il est bien appelé sur le chemin réel.
    const { client, maillons } = baseFactice();
    await intercepterEcriture(client, {
      model: 'User',
      operation: 'update',
      args: { where: { id: 'u-9' }, data: { motDePasse: 'nouveau' } },
      query: async () => ({ id: 'u-9', tenantId: 'd-1', email: 'x@y.cd', motDePasse: '$2b$10$nouveau' }),
    });
    expect(JSON.stringify(maillons[0])).not.toContain('$2b$10$');
    expect(maillons[0].avant.motDePasse).toBe(MARQUEUR_MASQUE);
    expect(maillons[0].apres.motDePasse).toBe(MARQUEUR_MASQUE);
  });

  it('chaîne sur le maillon précédent du dossier', async () => {
    const { client, maillons } = baseFactice({ rang: 41, empreinte: 'empreinte-41' });
    await intercepterEcriture(client, {
      model: 'Journal',
      operation: 'create',
      args: { data: {} },
      query: async () => ({ id: 'j-1', tenantId: 'd-1' }),
    });
    expect(maillons[0]).toMatchObject({ rang: 42, empreintePrecedente: 'empreinte-41' });
  });

  it('note l’acte au nom du système quand il n’y a pas de requête', async () => {
    // Semis, tâches de démarrage, scripts · perdus autrement.
    const { client, maillons } = baseFactice();
    await intercepterEcriture(client, {
      model: 'Compte',
      operation: 'create',
      args: { data: {} },
      query: async () => ({ id: 'c-2', tenantId: 'd-2' }),
    });
    expect(maillons[0]).toMatchObject({ acteurEmail: ACTEUR_SYSTEME, acteurId: null, tenantId: 'd-2' });
  });

  it('ne fait PAS échouer une opération réussie si le journal ne s’écrit pas', async () => {
    // Choix assumé · l'acte a eu lieu. Rendre une erreur ferait rejouer
    // l'utilisateur, et une écriture en double vaut pire qu'un trou.
    const { client } = baseFactice();
    client.$transaction = jest.fn().mockRejectedValue(new Error('base injoignable'));
    const silence = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const resultat = await intercepterEcriture(client, {
      model: 'Compte',
      operation: 'create',
      args: { data: {} },
      query: async () => ({ id: 'c-3', tenantId: 'd-1' }),
    });

    expect(resultat).toEqual({ id: 'c-3', tenantId: 'd-1' });
    expect(silence).toHaveBeenCalled();
    silence.mockRestore();
  });

  it('résume une opération de masse au lieu d’inventer un identifiant', async () => {
    const { client, maillons } = baseFactice();
    await dansContexteAudit({ acteurEmail: 'chef@cabinet.cd', tenantId: 'd-1' }, () =>
      intercepterEcriture(client, {
        model: 'Compte',
        operation: 'deleteMany',
        args: { where: { classe: 'CLASSE_9' } },
        query: async () => ({ count: 17 }),
      }),
    );
    expect(maillons[0]).toMatchObject({ entiteId: null, action: 'SUPPRESSION', tenantId: 'd-1' });
    expect(maillons[0].apres).toEqual({ operation: 'deleteMany', filtre: { classe: 'CLASSE_9' }, resultat: { count: 17 } });
  });
});
