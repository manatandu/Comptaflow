import { generateKeyPairSync } from 'crypto';
import { empreinteDe, verifierLicence } from '../sur-site/licence-signee';
import { jourKinshasa, LicencesSurSiteService, numeroSuivant } from './licences-sur-site.service';

const paire = () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    pub: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    priv: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
};

function prismaFactice() {
  const lignes: Record<string, unknown>[] = [];
  return {
    lignes,
    licenceSurSiteEmise: {
      findMany: jest.fn(async ({ where }: { where?: { numero?: { startsWith: string } } }) =>
        lignes.filter((l) => !where?.numero || String(l.numero).startsWith(where.numero.startsWith)),
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        lignes.push(data);
        return { id: `id-${lignes.length}`, numero: data.numero, fichier: data.fichier };
      }),
    },
  };
}

const EMPREINTE = empreinteDe('poste-du-client');
const DEMANDE = { titulaire: 'ASBL Exemple', empreinteMachine: EMPREINTE.toUpperCase(), finMaintenance: '2027-12-31', expiration: null, dossiersMax: 2 };
const LE = new Date('2026-09-26T10:00:00Z');

describe('émission des licences sur site', () => {
  it('signe une licence que le poste du client accepte', async () => {
    const { pub, priv } = paire();
    const p = prismaFactice();
    const s = new LicencesSurSiteService(p as never, { CLE_PRIVEE_LICENCE: priv }, pub);
    const r = await s.emettre(DEMANDE, 'op@vmg.test', LE);
    expect(r.numero).toBe('OMX-2026-0001');
    const v = verifierLicence(r.fichier, { clePubliquePem: pub, empreinte: EMPREINTE, aujourdhui: '2026-09-27', horlogeMax: null, dateVersion: '2026-09-26' });
    expect(v.statut).toBe('VALIDE');
    expect(v.contenu?.empreinteMachine).toBe(EMPREINTE);
    expect(p.lignes[0].emisePar).toBe('op@vmg.test');
  });

  it('accepte une clé privée posée sur une seule ligne, retours échappés', async () => {
    const { pub, priv } = paire();
    const s = new LicencesSurSiteService(prismaFactice() as never, { CLE_PRIVEE_LICENCE: priv.replace(/\n/g, '\\n') }, pub);
    await expect(s.emettre(DEMANDE, 'op', LE)).resolves.toBeDefined();
  });

  it('refuse sans clé privée, et n’enregistre rien', async () => {
    const p = prismaFactice();
    const s = new LicencesSurSiteService(p as never, {}, paire().pub);
    await expect(s.emettre(DEMANDE, 'op', LE)).rejects.toThrow(/API_CLE_PRIVEE_LICENCE/);
    expect(p.lignes).toHaveLength(0);
  });

  it('refuse une clé privée qui ne correspond pas à la clé publique du logiciel', async () => {
    const p = prismaFactice();
    const s = new LicencesSurSiteService(p as never, { CLE_PRIVEE_LICENCE: paire().priv }, paire().pub);
    await expect(s.emettre(DEMANDE, 'op', LE)).rejects.toThrow(/ne correspond pas/);
    expect(p.lignes).toHaveLength(0);
  });

  it('refuse un contenu irrecevable (fin de maintenance antérieure à l’émission)', async () => {
    const { pub, priv } = paire();
    const s = new LicencesSurSiteService(prismaFactice() as never, { CLE_PRIVEE_LICENCE: priv }, pub);
    await expect(s.emettre({ ...DEMANDE, finMaintenance: '2026-01-01' }, 'op', LE)).rejects.toThrow(/irrecevable/);
  });

  it('numérote par année, en continu, sans réutiliser', () => {
    expect(numeroSuivant('2026', [])).toBe('OMX-2026-0001');
    expect(numeroSuivant('2026', ['OMX-2026-0001', 'OMX-2026-0007', 'OMX-2025-0042'])).toBe('OMX-2026-0008');
  });

  it('date l’émission au calendrier de Kinshasa', () => {
    expect(jourKinshasa(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
    expect(jourKinshasa(new Date('2026-12-31T22:30:00Z'))).toBe('2026-12-31');
  });
});
