import { Licence, StatutLicence, TypeLicence } from '@prisma/client';
import { LicenceService } from './licence.service';

/**
 * LE MOTIF DE REFUS D'UNE LICENCE SUR SITE DÉSIGNE LA PANNE, PAS SA FAMILLE.
 *
 * `evaluerLicence` refusait PERPETUEL_ONPREMISE avec une phrase unique,
 * « Vérification de licence hors-ligne dépassée », pour deux situations qui
 * n'ont rien à voir :
 *
 * - `dernierHeartbeatAt` NUL · aucune vérification n'a jamais été reçue. C'est
 *   l'état de toute licence de ce type aujourd'hui, puisque
 *   `enregistrerHeartbeat` n'a aucun émetteur (ni route, ni tâche planifiée,
 *   ni client sur site). Rien n'a été « hors ligne » : rien n'a jamais été en
 *   ligne, et le support cherchait une panne de réseau qui n'existait pas ;
 * - `dernierHeartbeatAt` TROP ANCIEN · là, une installation émettait et s'est
 *   tue. C'est une coupure réseau, et ce ne sont pas les mêmes ennuis.
 *
 * Ce que la disparition de ces assertions ferait revenir : le motif unique,
 * donc un dossier neuf refusé dès sa première requête avec un message qui
 * envoie chercher la panne à l'endroit où elle n'est pas.
 */

const JOUR_MS = 24 * 60 * 60 * 1000;

const licence = (champs: Partial<Licence>): Licence =>
  ({
    id: 'l1',
    tenantId: 't1',
    type: TypeLicence.PERPETUEL_ONPREMISE,
    statut: StatutLicence.ACTIVE,
    dateDebut: new Date('2026-01-01'),
    dateExpiration: null,
    dernierHeartbeatAt: null,
    joursGraceHorsLigne: 7,
    ...champs,
  }) as Licence;

describe('LicenceService · motif de refus d’une licence « Perpétuelle (sur site) »', () => {
  const service = new LicenceService(undefined as never);

  it('heartbeat JAMAIS reçu : le motif dit que rien n’a jamais été reçu, il ne parle pas de dépassement', () => {
    const { autorise, motif } = service.evaluerLicence(licence({ dernierHeartbeatAt: null }));
    expect(autorise).toBe(false);
    // L'installation n'émet pas · c'est le cas de tout dossier créé
    // aujourd'hui avec ce type.
    expect(motif).toContain("aucune vérification en ligne n'a jamais été reçue");
    // Et surtout PAS l'ancien motif fourre-tout, qui faisait chercher une
    // coupure réseau là où aucune connexion n'a jamais existé.
    expect(motif).not.toContain('hors-ligne dépassée');
  });

  it('heartbeat TROP ANCIEN : le motif porte la date du dernier et la tolérance, pour dater la coupure', () => {
    const vieux = new Date(Date.now() - 30 * JOUR_MS);
    const { autorise, motif } = service.evaluerLicence(
      licence({ dernierHeartbeatAt: vieux, joursGraceHorsLigne: 7 }),
    );
    expect(autorise).toBe(false);
    // Sans la date, le support redemande « depuis quand ? » · seule question
    // qui sépare une coupure d'une heure d'un poste éteint depuis un mois.
    expect(motif).toContain(vieux.toISOString().slice(0, 10));
    expect(motif).toContain('tolérance de 7 jours');
    // La panne n'est PAS celle du cas précédent.
    expect(motif).not.toContain("n'a jamais été reçue");
  });

  it('les deux pannes ne portent JAMAIS le même motif · c’est tout l’objet de la correction', () => {
    const jamais = service.evaluerLicence(licence({ dernierHeartbeatAt: null })).motif;
    const tropAncien = service.evaluerLicence(
      licence({ dernierHeartbeatAt: new Date(Date.now() - 30 * JOUR_MS) }),
    ).motif;
    expect(jamais).not.toBe(tropAncien);
  });

  it('heartbeat frais : l’accès reste ouvert, la tolérance est bien comptée en jours', () => {
    // 3 jours pour une tolérance de 7 · dans la fenêtre.
    expect(service.evaluerLicence(licence({ dernierHeartbeatAt: new Date(Date.now() - 3 * JOUR_MS) }))).toEqual({
      autorise: true,
    });
    // 10 jours pour une tolérance de 30 · une tolérance plus large tient.
    expect(
      service.evaluerLicence(
        licence({ dernierHeartbeatAt: new Date(Date.now() - 10 * JOUR_MS), joursGraceHorsLigne: 30 }),
      ),
    ).toEqual({ autorise: true });
  });

  it('la suspension prime sur le heartbeat · une licence suspendue n’est pas un problème de réseau', () => {
    const { motif } = service.evaluerLicence(
      licence({ statut: StatutLicence.SUSPENDUE, dernierHeartbeatAt: null }),
    );
    expect(motif).toBe('Licence suspendue');
  });
});

describe('LicenceService · les autres types ne sont pas touchés par le heartbeat', () => {
  const service = new LicenceService(undefined as never);

  it('PERPETUEL_SAAS passe sans heartbeat, ABONNEMENT ne dépend que de son échéance', () => {
    // Le SaaS perpétuel est hébergé chez nous : aucun heartbeat à attendre.
    expect(
      service.evaluerLicence(licence({ type: TypeLicence.PERPETUEL_SAAS, dernierHeartbeatAt: null })),
    ).toEqual({ autorise: true });
    expect(
      service.evaluerLicence(
        licence({
          type: TypeLicence.ABONNEMENT,
          dernierHeartbeatAt: null,
          dateExpiration: new Date(Date.now() + 30 * JOUR_MS),
        }),
      ),
    ).toEqual({ autorise: true });
    expect(
      service.evaluerLicence(
        licence({
          type: TypeLicence.ABONNEMENT,
          dateExpiration: new Date(Date.now() - JOUR_MS),
        }),
      ).motif,
    ).toBe('Abonnement expiré');
  });

  it('aucune licence : le motif le dit, il ne parle pas de heartbeat', () => {
    expect(service.evaluerLicence(null)).toEqual({
      autorise: false,
      motif: 'Aucune licence associée à ce tenant',
    });
  });
});
