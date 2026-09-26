import { BadRequestException } from '@nestjs/common';
import { Licence, StatutLicence, TypeLicence } from '@prisma/client';
import { generateKeyPairSync } from 'crypto';
import { join } from 'path';
import { LicenceService } from '../licence/licence.service';
import { ContenuLicence, empreinteDe, FORMAT_LICENCE, signerLicence } from './licence-signee';
import { AccesPoste, LicenceSurSiteService } from './licence-sur-site.service';

/**
 * LE SERVICE DE L'INSTALLATION · un poste en mémoire (fichiers, identifiant,
 * calendrier), la vraie cryptographie. Ce qu'on vérifie ici est ce que le
 * moteur pur ne voit pas : le fichier lu et écrit, la borne d'horloge qui
 * avance, et la licence de l'installation qui prend le pas sur la ligne du
 * dossier.
 */
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const PRIVE = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const PUBLIQUE = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const ID = 'machine-guid-du-poste';
// Un chemin que même root ne peut pas créer (sous un fichier) · si le service touchait le
// disque au lieu de passer par l'accès au poste, le test tomberait partout,
// et pas seulement sur la CI qui ne tourne pas en root.
const DONNEES = '/dev/null/omegax-donnees-factices';
const VERSION = '/app';

function poste(jour = '2026-10-01') {
  const fichiers = new Map<string, string>([[join(VERSION, 'version-sur-site.json'), JSON.stringify({ date: '2026-09-26', commit: 'abc' })]]);
  const p = { jour };
  const acces: AccesPoste = {
    identifiantSysteme: () => ID,
    lire: (c) => fichiers.get(c) ?? null,
    ecrire: (c, v) => void fichiers.set(c, v),
    aujourdhui: () => p.jour,
  };
  return { acces, fichiers, p };
}
const contenu = (x: Partial<ContenuLicence> = {}): ContenuLicence => ({
  format: FORMAT_LICENCE,
  numero: 'OMX-2026-0001',
  titulaire: 'ASBL Test',
  empreinteMachine: empreinteDe(ID),
  emiseLe: '2026-09-26',
  finMaintenance: '2027-09-26',
  expiration: null,
  dossiersMax: 2,
  ...x,
});
const fichier = (x: Partial<ContenuLicence> = {}) => JSON.stringify(signerLicence(contenu(x), PRIVE));
const SUR_SITE = { MODE_INSTALLATION: 'SUR_SITE', DOSSIER_DONNEES: DONNEES } as NodeJS.ProcessEnv;
const service = (pp = poste(), env = SUR_SITE) => new LicenceSurSiteService(pp.acces, env, PUBLIQUE, VERSION);

describe('LicenceSurSiteService', () => {
  it('en ligne, il ne fait rien · et ne refuse rien au nom d’un fichier', () => {
    const s = service(poste(), {} as NodeJS.ProcessEnv);
    expect(s.etat().surSite).toBe(false);
    expect(() => s.verifierPlafondDossiers(500)).not.toThrow();
    expect(() => s.deposer(fichier())).toThrow(BadRequestException);
  });

  it('sans fichier, l’installation est fermée et montre son empreinte', () => {
    const s = service();
    expect(s.etat()).toMatchObject({ surSite: true, statut: 'ABSENTE', empreinte: empreinteDe(ID) });
    expect(s.autorisation().autorise).toBe(false);
  });

  it('le dépôt d’une licence valide l’écrit et ouvre l’installation', () => {
    const pp = poste();
    const s = service(pp);
    expect(s.deposer(fichier()).statut).toBe('VALIDE');
    expect(pp.fichiers.get(join(DONNEES, 'licence.omegax'))).toBe(fichier());
    expect(s.autorisation()).toEqual({ autorise: true });
    // Relue au redémarrage, depuis le disque.
    expect(service(pp).etat().statut).toBe('VALIDE');
  });

  it('un fichier refusé n’est jamais écrit · la licence en place reste', () => {
    const pp = poste();
    const s = service(pp);
    s.deposer(fichier());
    expect(() => s.deposer(fichier({ empreinteMachine: empreinteDe('autre') }))).toThrow(/autre poste/);
    expect(pp.fichiers.get(join(DONNEES, 'licence.omegax'))).toBe(fichier());
  });

  it('une licence plus ancienne ne remplace pas une plus récente', () => {
    const s = service();
    s.deposer(fichier({ numero: 'OMX-2026-0009', emiseLe: '2026-09-28' }));
    expect(() => s.deposer(fichier({ numero: 'OMX-2026-0001', emiseLe: '2026-09-26' }))).toThrow(/plus récente/);
    expect(s.deposer(fichier({ numero: 'OMX-2026-0010', emiseLe: '2026-09-29' })).contenu?.numero).toBe('OMX-2026-0010');
  });

  it('la borne d’horloge avance, et un recul du calendrier ferme l’installation', () => {
    const pp = poste('2026-10-05');
    const s = service(pp);
    s.deposer(fichier());
    expect(JSON.parse(pp.fichiers.get(join(DONNEES, 'horloge.json'))!)).toEqual({ max: '2026-10-05' });
    pp.p.jour = '2026-10-01';
    expect(s.actualiser().statut).toBe('HORLOGE_RECULEE');
    // La borne ne recule pas avec l'horloge.
    expect(JSON.parse(pp.fichiers.get(join(DONNEES, 'horloge.json'))!)).toEqual({ max: '2026-10-05' });
    pp.p.jour = '2026-10-06';
    expect(s.actualiser().statut).toBe('VALIDE');
  });

  it('le plafond de dossiers de la licence tient · et sans licence valide, aucun dossier ne naît', () => {
    const s = service();
    expect(() => s.verifierPlafondDossiers(0)).toThrow(/Aucune licence/);
    s.deposer(fichier({ dossiersMax: 2 }));
    expect(() => s.verifierPlafondDossiers(1)).not.toThrow();
    expect(() => s.verifierPlafondDossiers(2)).toThrow(/couvre 2 dossier/);
  });

  it('la date de version vient du fichier du paquet, jamais de l’horloge · absente, l’installation est fermée', () => {
    const pp = poste();
    pp.fichiers.delete(join(VERSION, 'version-sur-site.json'));
    const s = service(pp);
    expect(() => s.deposer(fichier())).toThrow(/date de cette version est inconnue/);
  });
});

describe('LicenceService · sur site, le fichier décide pour tous les dossiers', () => {
  const ligne = (p: Partial<Licence>): Licence =>
    ({ id: 'l', tenantId: 't', type: TypeLicence.ABONNEMENT, statut: StatutLicence.ACTIVE, dateDebut: new Date(), dateExpiration: null, dernierHeartbeatAt: null, joursGraceHorsLigne: 7, ...p }) as Licence;

  it('sans fichier valide, même une ligne PROPRIETAIRE ne passe pas', () => {
    const l = new LicenceService({} as never, service());
    expect(l.evaluerLicence(ligne({ type: TypeLicence.PROPRIETAIRE })).autorise).toBe(false);
  });

  it('avec un fichier valide, la ligne du dossier ne compte plus · ni son échéance, ni son absence', () => {
    const s = service();
    s.deposer(fichier());
    const l = new LicenceService({} as never, s);
    expect(l.evaluerLicence(ligne({ dateExpiration: new Date('2020-01-01') })).autorise).toBe(true);
    expect(l.evaluerLicence(null).autorise).toBe(true);
  });

  it('en ligne, les règles de toujours · le service sur site n’y change rien', () => {
    const l = new LicenceService({} as never, service(poste(), {} as NodeJS.ProcessEnv));
    expect(l.evaluerLicence(ligne({ dateExpiration: new Date('2020-01-01') })).motif).toBe('Abonnement expiré');
    expect(l.evaluerLicence(ligne({ type: TypeLicence.PROPRIETAIRE, statut: StatutLicence.SUSPENDUE })).autorise).toBe(true);
  });
});
