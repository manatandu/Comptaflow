import { Referentiel, StatutMessage, TypeRelance } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CourrierService, ORIGINE_RELANCE } from '../courrier/courrier.service';
import { RelancesService, objetDeLaRelance } from './relances.service';

/**
 * DES LETTRES QUI NE PARTAIENT NULLE PART.
 *
 * `RelancesService.emettre` composait des rappels complets, destinataire,
 * coordonnées et montants compris, les écrivait dans l'historique, et
 * s'arrêtait là. Le comptable voyait « 12 courriers préparés » et n'avait
 * aucun moyen d'apprendre que douze tiers n'avaient rien reçu.
 *
 * Ce qui est éprouvé ici, dans l'ordre de ce qui coûte cher :
 *
 *  · la lettre part à l'adresse du tiers, avec le texte EXACT de l'historique
 *    (un corps qui différerait d'un mot ferait perdre à l'historique sa
 *    valeur de preuve dans un dossier de recouvrement) ;
 *  · sans transport, l'émission ne ment pas et ne se refuse pas ;
 *  · sans adresse, elle le DIT au moment de l'émission, quand le comptable
 *    tient encore le tiers · pas au recouvrement, trois mois plus tard ;
 *  · une lettre qui ne trouve pas son destinataire n'emporte pas le lot.
 */

const DOSSIER = 'd-1';
const AGENT = 'u-1';
const JOUR = 86_400_000;

const MODELE =
  'Cher {tiers},\n\nSauf erreur de notre part, la somme de {montant} demeure due à ce jour, {date}.\n\n{detail}\n\n{entite}';

const NIVEAU = {
  id: 'n-2',
  tenantId: DOSSIER,
  niveau: 2,
  libelle: 'Premier rappel',
  type: TypeRelance.RAPPEL,
  joursApresEcheance: 15,
  modeleTexte: MODELE,
  estActif: true,
};

/** Un compte de tiers en retard · l'adresse est le seul paramètre qui varie. */
function ligne(numero: string, tiers: { id: string; nom: string; email: string | null } | null) {
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
      tiersCompte: tiers ? { tiers: { ...tiers, type: 'CLIENT' } } : null,
    },
    ecriture: { date: new Date(Date.now() - 90 * JOUR), libelle: 'Vente' },
  };
}

function service(
  lignes: ReturnType<typeof ligne>[],
  mettreEnFile: jest.Mock = jest.fn(async () => ({
    id: 'm-1',
    statut: StatutMessage.SANS_TRANSPORT,
    erreur: null,
  })),
) {
  let cree = 0;
  const relanceCreate = jest.fn(async () => ({ id: `r-${++cree}` }));
  const prisma = {
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: Referentiel.SYSCOHADA }),
      findUnique: jest.fn().mockResolvedValue({ nom: 'ONG Kin' }),
    },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue(lignes) },
    niveauRelance: {
      findFirst: jest.fn().mockResolvedValue(NIVEAU),
      findMany: jest.fn().mockResolvedValue([]),
    },
    relance: { findMany: jest.fn().mockResolvedValue([]), create: relanceCreate },
  } as unknown as PrismaService;
  const courrier = { mettreEnFile } as unknown as CourrierService;
  return { svc: new RelancesService(prisma, courrier), mettreEnFile, relanceCreate };
}

const emettre = (svc: RelancesService, compteIds: string[]) =>
  svc.emettre(DOSSIER, AGENT, { exerciceId: 'ex-1', niveauId: NIVEAU.id, compteIds });

// ---------------------------------------------------------------------------

describe('la lettre composée est remise, telle quelle', () => {
  it('part à l’adresse du tiers, avec le TEXTE ENREGISTRÉ mot pour mot', async () => {
    const { svc, mettreEnFile } = service([
      ligne('41100001', { id: 't-1', nom: 'Coopérative Lemba', email: 'tresorier@lemba.cd' }),
    ]);

    const resultat = await emettre(svc, ['c-41100001']);

    expect(mettreEnFile).toHaveBeenCalledTimes(1);
    const [dossier, message] = mettreEnFile.mock.calls[0];
    // Le cloisonnement se porte AUX DEUX BOUTS · la file écrit dans le
    // dossier qu'on lui donne, elle ne le devine pas.
    expect(dossier).toBe(DOSSIER);
    expect(message).toMatchObject({
      destinataire: 'tresorier@lemba.cd',
      destinataireNom: 'Coopérative Lemba',
      origine: ORIGINE_RELANCE,
      // La pièce d'origine · c'est par elle qu'on remonte de la file au
      // rappel qui l'a demandée.
      origineId: 'r-1',
      createdBy: AGENT,
    });
    // LE CORPS EST LE TEXTE DE L'HISTORIQUE, sans une virgule d'écart · c'est
    // l'historique qui fait foi, et il ne ferait plus foi s'il différait.
    expect(message.corps).toBe(resultat.lettres[0].texte);
    expect(message.corps).toContain('Cher Coopérative Lemba,');
    expect(message.corps).toContain('Facture 41100001');
  });

  it('donne un objet au courriel sans toucher au corps', async () => {
    const { svc, mettreEnFile } = service([
      ligne('41100001', { id: 't-1', nom: 'Coopérative Lemba', email: 'tresorier@lemba.cd' }),
    ]);
    await emettre(svc, ['c-41100001']);
    // Le libellé du niveau est ce que le DOSSIER a nommé, et le nom de
    // l'entité dit de qui vient le rappel.
    expect(mettreEnFile.mock.calls[0][1].sujet).toBe('Premier rappel · ONG Kin');
    // L'objet ne s'est pas glissé dans la lettre.
    expect(mettreEnFile.mock.calls[0][1].corps.startsWith('Cher ')).toBe(true);
  });

  it('rend le statut de la file · SANS_TRANSPORT n’est ni un envoi ni une perte', async () => {
    const { svc } = service([ligne('41100001', { id: 't-1', nom: 'Lemba', email: 'a@lemba.cd' })]);

    const resultat = await emettre(svc, ['c-41100001']);

    // Aucun transport n'est configuré sur cette installation : le logiciel ne
    // prétend pas avoir envoyé, et n'a rien perdu · le message repartira tel
    // quel le jour où les identifiants seront posés.
    expect(resultat.lettres[0].remise).toMatchObject({
      destinataire: 'a@lemba.cd',
      statut: StatutMessage.SANS_TRANSPORT,
      messageId: 'm-1',
      motif: null,
    });
    expect(resultat).toMatchObject({ emises: 1, misesEnFile: 1, nonRemises: 0 });
  });
});

describe('sans adresse · le dire à l’émission, pas au recouvrement', () => {
  it('n’écrit RIEN dans la file et nomme le tiers qu’il faut compléter', async () => {
    const { svc, mettreEnFile, relanceCreate } = service([
      ligne('41100002', { id: 't-2', nom: 'Établissements Nzita', email: null }),
    ]);

    const resultat = await emettre(svc, ['c-41100002']);

    expect(mettreEnFile).not.toHaveBeenCalled();
    // La lettre EXISTE quand même · elle s'imprime, elle se remet en main
    // propre, et l'historique en garde la trace. Ce n'est pas l'émission qui
    // est refusée, c'est la remise qui n'a pas eu lieu.
    expect(relanceCreate).toHaveBeenCalledTimes(1);
    expect(resultat).toMatchObject({ emises: 1, misesEnFile: 0, nonRemises: 1 });
    expect(resultat.lettres[0].remise.statut).toBeNull();
    expect(resultat.lettres[0].remise.motif).toContain('Établissements Nzita');
    expect(resultat.lettres[0].remise.motif).toContain("n'est partie à personne");
  });

  it('distingue le tiers sans adresse du compte sans tiers', async () => {
    const { svc } = service([ligne('41100003', null)]);
    const resultat = await emettre(svc, ['c-41100003']);
    // Deux lacunes différentes, deux gestes différents : compléter une fiche,
    // ou rattacher un tiers au compte.
    expect(resultat.lettres[0].remise.motif).toContain('Aucun tiers');
    expect(resultat.lettres[0].remise.motif).toContain('41100003');
  });

  it('rend l’adresse AVEC la position · la lacune se voit avant le clic', async () => {
    const { svc } = service([
      ligne('41100001', { id: 't-1', nom: 'Lemba', email: 'a@lemba.cd' }),
      ligne('41100002', { id: 't-2', nom: 'Nzita', email: null }),
    ]);
    const positions = await svc.positions(DOSSIER, { exerciceId: 'ex-1' });
    expect(new Map(positions.map((p) => [p.numero, p.tiersEmail]))).toEqual(
      new Map([
        ['41100001', 'a@lemba.cd'],
        ['41100002', null],
      ]),
    );
  });
});

describe('un destinataire perdu n’emporte pas le lot', () => {
  it('les autres relances partent, et le refus est rendu pour celle-là', async () => {
    // La file refuse À L'ÉCRITURE une adresse qu'aucune tentative ne
    // réparerait. Laisser remonter ce refus tuerait les dix-neuf autres
    // rappels du lot, tous déjà décidés et déjà écrits.
    const mettreEnFile = jest.fn(async (_dossier: string, message: { destinataire: string }) => {
      if (message.destinataire === 'deux, adresses@nzita.cd') {
        throw new BadRequestException('Adresse de destinataire inutilisable · « deux, adresses@nzita.cd ».');
      }
      return { id: 'm-1', statut: StatutMessage.SANS_TRANSPORT, erreur: null };
    });
    const { svc, relanceCreate } = service(
      [
        ligne('41100002', { id: 't-2', nom: 'Nzita', email: 'deux, adresses@nzita.cd' }),
        ligne('41100001', { id: 't-1', nom: 'Lemba', email: 'a@lemba.cd' }),
      ],
      mettreEnFile as unknown as jest.Mock,
    );

    const resultat = await emettre(svc, ['c-41100002', 'c-41100001']);

    expect(relanceCreate).toHaveBeenCalledTimes(2);
    expect(resultat).toMatchObject({ emises: 2, misesEnFile: 1, nonRemises: 1 });
    expect(resultat.lettres[0].remise.motif).toContain('inutilisable');
    expect(resultat.lettres[1].remise.statut).toBe(StatutMessage.SANS_TRANSPORT);
  });
});

describe('l’objet du courriel', () => {
  it('reprend le libellé du niveau et le nom du dossier', () => {
    expect(objetDeLaRelance('Mise en demeure préalable', 'ONG Kin')).toBe('Mise en demeure préalable · ONG Kin');
  });

  it('ne laisse jamais un objet vide · la file refuserait la lettre', () => {
    // Un niveau dont le libellé a été vidé depuis la fenêtre Rappel et relevé
    // ferait rester à quai une lettre pourtant composée.
    expect(objetDeLaRelance('   ', 'ONG Kin')).toBe('Rappel · ONG Kin');
    expect(objetDeLaRelance('Premier rappel', '')).toBe('Premier rappel');
  });
});
