import { Writable } from 'node:stream';
import { RestitutionService } from './restitution.service';
import { TABLES_RESTITUEES, fichierDeLaTable } from './tables-restitution';
import { analyserCsv } from '../../import/lecture-fichier';
import { ecrireManifeste } from './manifeste-restitution';

/**
 * L'ARCHIVE, ET CE QU'ELLE NE DOIT PAS CONTENIR.
 *
 * Le danger de ce module n'est pas de produire un fichier illisible · c'est
 * de produire un fichier parfaitement lisible contenant la comptabilité d'un
 * AUTRE cabinet. Les quinze modèles portés par leur parent échappent à la
 * garde de cloisonnement (voir lecture-bornee.spec.ts) : le premier test
 * ci-dessous regarde donc le `where` réellement envoyé à Prisma, et pas le
 * résultat rendu par un double complaisant.
 */

const DOSSIER = 'd-1';

/** Un client Prisma factice · on n'a besoin que de ce que l'extraction touche. */
function prismaFactice(lignes: Record<string, Record<string, unknown>[]> = {}) {
  const filtres: Array<{ modele: string; where: unknown; orderBy: unknown }> = [];
  const maillons: Record<string, unknown>[] = [];
  const client: Record<string, unknown> = {
    tenant: {
      findUniqueOrThrow: async () => ({ id: DOSSIER, nom: 'ASBL Espoir', referentiel: 'SYCEBNL' }),
    },
  };
  for (const modele of TABLES_RESTITUEES) {
    const propriete = modele.charAt(0).toLowerCase() + modele.slice(1);
    client[propriete] = {
      count: async () => (lignes[modele] ?? []).length,
      // Le double HONORE `take` · sans quoi il rendrait tout d'un coup et le
      // test de pagination ne testerait rien, alors même qu'il porte sur la
      // boucle qui, mal écrite, ne se termine jamais.
      findMany: async ({ where, orderBy, select, take }: any) => {
        filtres.push({ modele, where, orderBy });
        const toutes = [...(lignes[modele] ?? [])];
        const cle = Object.keys(orderBy)[0];
        toutes.sort((a, b) => String(a[cle]).localeCompare(String(b[cle])));
        const apres = (where as Record<string, any>)[cle]?.gt;
        const restantes = apres === undefined ? toutes : toutes.filter((l) => (l[cle] as string) > apres);
        return restantes
          .slice(0, take)
          .map((l) => Object.fromEntries(Object.keys(select).map((c) => [c, l[c] ?? null])));
      },
    };
  }
  const tx = {
    $executeRaw: async () => 1,
    evenementAudit: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        maillons.push(data);
        return data;
      },
    },
  };
  client.clientNu = { $transaction: async (f: any) => f(tx) };
  return { client: client as any, filtres, maillons };
}

/** Ramasse le ZIP en mémoire · un test n'a pas de disque à salir. */
function collecteur() {
  const morceaux: Buffer[] = [];
  const flux = new Writable({
    write(morceau, _enc, suite) {
      morceaux.push(Buffer.from(morceau));
      suite();
    },
  });
  return { flux, buffer: () => Buffer.concat(morceaux) };
}

describe('la lecture est bornée au dossier, table par table', () => {
  it('borne un modèle PORTÉ par sa relation parente, jamais par rien', async () => {
    // LE test de ce module. La garde de cloisonnement ne regarde pas
    // `LigneEcriture` · si ce `where` était vide, Prisma rendrait les lignes
    // de tous les cabinets et l'archive s'ouvrirait normalement.
    const { client, filtres } = prismaFactice();
    const service = new RestitutionService(client);
    const { flux } = collecteur();
    await service.produire(DOSSIER, { id: 'u-1', email: 'chef@asbl.cd', adresseIp: null }, flux);

    const lignesEcriture = filtres.filter((f) => f.modele === 'LigneEcriture');
    expect(lignesEcriture.length).toBeGreaterThan(0);
    expect(lignesEcriture[0].where).toEqual({ ecriture: { tenantId: DOSSIER } });
  });

  it('interroge les 54 tables, et chacune avec une borne', async () => {
    const { client, filtres } = prismaFactice();
    const service = new RestitutionService(client);
    const { flux } = collecteur();
    await service.produire(DOSSIER, { id: 'u-1', email: 'chef@asbl.cd', adresseIp: null }, flux);

    expect(new Set(filtres.map((f) => f.modele)).size).toBe(TABLES_RESTITUEES.length);
    for (const f of filtres) {
      expect([f.modele, JSON.stringify(f.where).includes(DOSSIER)]).toEqual([f.modele, true]);
    }
  });

  it('lit le journal d’audit par son rang', async () => {
    const { client, filtres } = prismaFactice();
    const service = new RestitutionService(client);
    const { flux } = collecteur();
    await service.produire(DOSSIER, { id: 'u-1', email: 'chef@asbl.cd', adresseIp: null }, flux);
    expect(filtres.find((f) => f.modele === 'EvenementAudit')!.orderBy).toEqual({ rang: 'asc' });
    expect(filtres.find((f) => f.modele === 'Ecriture')!.orderBy).toEqual({ id: 'asc' });
  });
});

describe('le CSV d’une table', () => {
  const JOURNAUX = [
    { id: 'a', tenantId: DOSSIER, code: 'OD', intitule: 'Opérations diverses', type: 'GENERAL' },
    // Un libellé qui casserait un CSV naïf · point-virgule, guillemet et
    // retour à la ligne dans la même cellule.
    { id: 'b', tenantId: DOSSIER, code: 'CA', intitule: 'Caisse; dite "petite"\ncaisse', type: 'TRESORERIE' },
  ];

  it('se relit à l’identique, libellés hostiles compris', async () => {
    const { client } = prismaFactice({ Journal: JOURNAUX });
    const service = new RestitutionService(client);
    let csv = '';
    for await (const bout of (service as any).lignesCsv('Journal', DOSSIER, { ecrites: 0 })) csv += bout;

    const relu = analyserCsv(csv, ';');
    const iLibelle = relu[0].indexOf('intitule');
    expect(relu).toHaveLength(3);
    expect(relu[1][iLibelle]).toBe('Opérations diverses');
    expect(relu[2][iLibelle]).toBe('Caisse; dite "petite"\ncaisse');
  });

  it('compte ce qu’il écrit', async () => {
    const { client } = prismaFactice({ Journal: JOURNAUX });
    const service = new RestitutionService(client);
    const compteur = { ecrites: 0 };
    for await (const _ of (service as any).lignesCsv('Journal', DOSSIER, compteur)) void _;
    // L'en-tête n'est pas une ligne de données.
    expect(compteur.ecrites).toBe(2);
  });

  it('avance son curseur au lieu de relire le même lot', async () => {
    // Le lot vaut 2 000 · il faut donc dépasser ce seuil pour que la seconde
    // lecture existe. Sans avancée du curseur, elle relirait le même lot et
    // la boucle ne s'arrêterait jamais · le serveur tournerait jusqu'au délai
    // de Cloud Run, sur la table la plus grosse du logiciel.
    const beaucoup = Array.from({ length: 2_100 }, (_, i) => ({
      id: `j-${String(i).padStart(5, '0')}`,
      tenantId: DOSSIER,
      code: 'OD',
      intitule: `Journal ${i}`,
    }));
    const { client, filtres } = prismaFactice({ Journal: beaucoup });
    const service = new RestitutionService(client);
    const compteur = { ecrites: 0 };
    for await (const _ of (service as any).lignesCsv('Journal', DOSSIER, compteur)) void _;

    const lectures = filtres.filter((f) => f.modele === 'Journal');
    expect(lectures).toHaveLength(2);
    expect(lectures[0].where).toEqual({ tenantId: DOSSIER });
    // La borne du dossier est CONSERVÉE au second tour · la perdre en
    // avançant le curseur rendrait les lignes de tous les cabinets.
    expect(lectures[1].where).toEqual({ tenantId: DOSSIER, id: { gt: 'j-01999' } });
    expect(compteur.ecrites).toBe(2_100);
  });
});

describe('la trace de l’extraction', () => {
  it('écrit UN maillon EXTRACTION, par le client NON étendu', async () => {
    // Par le client étendu, l'écriture d'un maillon déclencherait l'écriture
    // d'un maillon · `EvenementAudit` est lui-même un modèle audité.
    const { client, maillons } = prismaFactice();
    const service = new RestitutionService(client);
    const { flux } = collecteur();
    await service.produire(DOSSIER, { id: 'u-1', email: 'chef@asbl.cd', adresseIp: '41.243.0.1' }, flux);

    expect(maillons).toHaveLength(1);
    expect(maillons[0]).toMatchObject({
      tenantId: DOSSIER,
      action: 'EXTRACTION',
      entite: 'Tenant',
      entiteId: DOSSIER,
      acteurEmail: 'chef@asbl.cd',
      adresseIp: '41.243.0.1',
      rang: 1,
    });
  });
});

describe('le contrôle dit l’écart au lieu de le taire', () => {
  it('signale une table dont l’inventaire et l’écriture ne concordent pas', async () => {
    // Les tables sont lues l'une après l'autre, sans transaction commune · un
    // dossier en cours d'usage bouge pendant l'extraction. L'écart n'est pas
    // une erreur, mais le taire ferait croire à un instantané.
    const { client } = prismaFactice({ Journal: [{ id: 'a', tenantId: DOSSIER, code: 'OD' }] });
    // L'inventaire annonce trois lignes, la lecture n'en rendra qu'une.
    client.journal.count = async () => 3;
    const service = new RestitutionService(client);
    const ecrites = { Journal: { ecrites: 1 } } as Record<string, { ecrites: number }>;
    let texte = '';
    for await (const bout of (service as any).controles({ Journal: 3 }, ecrites)) texte += bout;

    expect(texte).toContain('Journal;3;1;ECART');
    expect(texte).toContain('table(s) en écart.');
  });

  it('dit « aucun écart » quand tout concorde', async () => {
    const { client } = prismaFactice();
    const service = new RestitutionService(client);
    let texte = '';
    for await (const bout of (service as any).controles({}, {})) texte += bout;
    expect(texte).toContain('Aucun écart.');
  });
});

describe('l’archive produite', () => {
  it('est un ZIP portant le manifeste, les 54 tables et le contrôle', async () => {
    const { client } = prismaFactice({ Journal: [{ id: 'a', tenantId: DOSSIER, code: 'OD' }] });
    const service = new RestitutionService(client);
    const { flux, buffer } = collecteur();
    const nom = await service.produire(DOSSIER, { id: 'u-1', email: 'chef@asbl.cd', adresseIp: null }, flux);

    const zip = buffer();
    expect(zip.subarray(0, 2).toString('latin1')).toBe('PK');
    // Les noms d'entrée figurent en clair dans les en-têtes locaux, même
    // quand le contenu est compressé.
    const texte = zip.toString('latin1');
    expect(texte).toContain('MANIFESTE.md');
    expect(texte).toContain('controles.txt');
    for (const table of TABLES_RESTITUEES) expect(texte).toContain(fichierDeLaTable(table));
    expect(nom).toMatch(/^restitution-asbl-espoir-\d{4}-\d{2}-\d{2}\.zip$/);
  });
});

describe('le manifeste dit ce que l’archive n’est pas', () => {
  const manifeste = ecrireManifeste({
    dossier: { id: DOSSIER, nom: 'ASBL Espoir', referentiel: 'SYCEBNL' },
    demandeePar: 'chef@asbl.cd',
    horodatage: '2026-09-18T08:00:00.000Z',
    maillon: { rang: 12, empreinte: 'abc123' },
    lignesParTable: { Journal: 4 },
  });

  it('cite le CPCC mot pour mot sur la valeur probante', () => {
    // La phrase est celle du § 1.5.3 b), première phrase · le brief d'origine
    // l'avait tronquée en gardant la suite, plus rassurante.
    // Le manifeste replie ses lignes · on compare le texte déplié, sinon le
    // test dépendrait de la largeur de la mise en page et non de la citation.
    const deplie = manifeste.replace(/\s+/g, ' ');
    expect(deplie).toContain(
      "Les écrits électroniques ne sont pas encore admis en preuve au même titre que l'écrit papier en RDC.",
    );
  });

  it('refuse d’annoncer une conservation, une réversibilité ou un instantané', () => {
    const deplie = manifeste.replace(/\s+/g, ' ');
    expect(deplie).toContain("Elle ne satisfait pas à elle seule à l'obligation de conservation");
    expect(deplie).toContain("Ce n'est pas une réversibilité");
    expect(deplie).toContain("Ce n'est pas un instantané");
    expect(deplie).toContain('AUCUNE pièce justificative numérisée');
    // Aucun délai affiché · le CPCC constate l'absence de délai fixe unique.
    expect(manifeste).not.toMatch(/conserver cette archive pendant/i);
  });

  it('nomme les tables dont le journal d’audit ne garde aucune trace', () => {
    expect(manifeste).toContain('- SaisieNote');
    expect(manifeste).toContain('- RattachementNote');
  });

  it('présente le format et le rôle comme des décisions, pas comme du droit', () => {
    const deplie = manifeste.replace(/\s+/g, ' ');
    expect(deplie).toContain("Décisions d'OmegaX, et non règles de droit");
    expect(deplie).toContain("Aucun texte lu n'impose la restitution d'un dossier complet");
  });
});
