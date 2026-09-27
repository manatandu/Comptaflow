import { courrielFactureAbonnement, courrielLicenceSurSite, dateLisible, montantFc } from './courriels-editeur';
import { CourrielsEditeurService } from './courriels-editeur.service';

const FACTURE = {
  numeroSerie: 'VMG-2026-0007',
  dateFacture: '2026-09-01',
  periode: '2026-09',
  emetteurNom: 'VMG Consulting',
  mentionsLigne: 'SARL · au capital de 10 000 000 FC · RCCM CD/KIN/1',
  contrepartieNom: 'ONG Kin',
  lignes: [{ designation: 'Formule Standard', quantite: 1, prixUnitaire: 290000, montantHT: 290000, montantTva: 46400 }],
  totaux: { montantHT: 290000, montantTva: 46400, montantTTC: 336400 },
  montantUsd: 100,
  cours: 2900,
  echeanceLicence: '2026-10-15',
};

describe('courriel de la facture d’abonnement', () => {
  const c = courrielFactureAbonnement(FACTURE);

  it('reprend la pièce · numéro, émetteur et mentions, client, lignes, totaux, cours', () => {
    expect(c.sujet).toBe('Facture VMG-2026-0007 · abonnement OmegaX 2026-09');
    for (const attendu of [
      'facture n° VMG-2026-0007 du 01/09/2026',
      'Émetteur : VMG Consulting',
      'SARL · au capital de 10 000 000 FC · RCCM CD/KIN/1',
      'Client : ONG Kin',
      'Formule Standard',
      'TVA 46 400,00 FC',
      'Montant TTC : 336 400,00 FC',
      'Soit 100 USD au cours de 2900 FC du 01/09/2026.',
      'court jusqu’au 15/10/2026',
    ]) expect(c.corps).toContain(attendu);
  });

  it('dit ce qu’elle n’est pas, comme la pièce imprimée', () => {
    expect(c.corps).toContain('système de facturation non homologué (décret n° 23/10 du 3 mars 2023, art. 22)');
    expect(c.pieceJointe).toBeNull();
  });

  it('sans licence connue, aucune échéance n’est inventée', () => {
    expect(courrielFactureAbonnement({ ...FACTURE, echeanceLicence: null }).corps).not.toContain('court jusqu’au');
  });

  it('montants et dates lisibles', () => {
    expect(montantFc(1234567.5)).toBe('1 234 567,50 FC');
    expect(dateLisible('2026-01-05')).toBe('05/01/2026');
  });
});

describe('courriel de la licence sur site', () => {
  const L = { numero: 'OMX-2026-0003', titulaire: 'ASBL X', empreinteMachine: 'ab'.repeat(32), emiseLe: '2026-09-20', finMaintenance: '2027-09-20', expiration: null, dossiersMax: 3, fichier: '{"signature":"s"}' };

  it('joint le fichier signé, sous le nom du téléchargement', () => {
    const c = courrielLicenceSurSite(L);
    expect(c.pieceJointe).toEqual({ nom: 'licence-OMX-2026-0003.omegax', texte: '{"signature":"s"}' });
    expect(c.corps).toContain('Expiration : aucune (licence perpétuelle)');
    expect(c.corps).toContain(`Empreinte du poste : ${'ab'.repeat(32)}`);
    expect(courrielLicenceSurSite({ ...L, expiration: '2027-01-31' }).corps).toContain('Expiration : 31/01/2027');
  });
});

describe('envoi des pièces de l’éditeur · service', () => {
  const monte = (o: { email?: string | null; tenantFacture?: string } = {}) => {
    const courrier = { mettreEnFile: jest.fn(async () => ({ id: 'm', statut: 'ENVOYE', erreur: null })) };
    const prisma = {
      licenceSurSiteEmise: { findUnique: jest.fn(async () => ({ id: 'l1', numero: 'OMX-2026-0003', titulaire: 'T', empreinteMachine: 'e', emiseLe: '2026-09-20', finMaintenance: '2027-09-20', expiration: null, dossiersMax: 1, fichier: 'F' })) },
      factureAbonnement: {
        findUnique: jest.fn(async () => ({
          id: 'fa1', periode: '2026-09', montantUsd: 100, cours: 2900,
          abonnement: { cabinet: { licence: { dateExpiration: new Date('2026-10-15T23:59:59Z') } } },
          facture: {
            tenantId: o.tenantFacture ?? 'editeur', numeroSerie: 'VMG-2026-0007', dateFacture: new Date('2026-09-01T00:00:00Z'),
            emetteurNom: 'VMG Consulting', mentionsSocieteEmetteur: { denomination: 'VMG', ligne: 'SARL', manquantes: [] },
            contrepartieNom: 'ONG Kin', tiers: { email: o.email === undefined ? 'compta@ong.cd' : o.email, nom: 'ONG Kin' },
            lignes: [{ designation: 'Standard', quantite: 1, prixUnitaire: 290000, montantHT: 290000, montantTva: 0, imposable: false }],
          },
        })),
      },
    };
    return { s: new CourrielsEditeurService(prisma as never, courrier as never), courrier };
  };
  const QUI = { tenantId: 'editeur', userId: 'u1' };

  it('la facture part à l’adresse du tiers facturé, dans le dossier de l’éditeur', async () => {
    const m = monte();
    await m.s.envoyerFacture(QUI, 'fa1');
    expect(m.courrier.mettreEnFile).toHaveBeenCalledWith('editeur', expect.objectContaining({
      destinataire: 'compta@ong.cd', origine: 'FACTURE_ABONNEMENT', origineId: 'fa1', createdBy: 'u1',
      corps: expect.stringContaining('Montant TTC : 290 000,00 FC'),
    }));
  });

  it('une adresse saisie prime sur celle du tiers', async () => {
    const m = monte();
    await m.s.envoyerFacture(QUI, 'fa1', 'dg@ong.cd');
    expect(m.courrier.mettreEnFile).toHaveBeenCalledWith('editeur', expect.objectContaining({ destinataire: 'dg@ong.cd' }));
  });

  it('sans adresse, rien n’est mis en file', async () => {
    const m = monte({ email: null });
    await expect(m.s.envoyerFacture(QUI, 'fa1')).rejects.toThrow(/pas d’adresse de courriel/);
    expect(m.courrier.mettreEnFile).not.toHaveBeenCalled();
  });

  it('hors du dossier de l’éditeur, refusé', async () => {
    const m = monte({ tenantFacture: 'autre' });
    await expect(m.s.envoyerFacture(QUI, 'fa1')).rejects.toThrow(/dossier de l’éditeur/);
    expect(m.courrier.mettreEnFile).not.toHaveBeenCalled();
  });

  it('la licence part avec son fichier joint', async () => {
    const m = monte();
    await m.s.envoyerLicence(QUI, 'l1', 'it@asbl.cd');
    expect(m.courrier.mettreEnFile).toHaveBeenCalledWith('editeur', expect.objectContaining({
      destinataire: 'it@asbl.cd', origine: 'LICENCE_SUR_SITE', pieceJointe: { nom: 'licence-OMX-2026-0003.omegax', texte: 'F' },
    }));
  });
});
