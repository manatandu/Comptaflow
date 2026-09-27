import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { Prisma } from '@prisma/client';
import { transactionAuditee } from './contexte-audit';
import { transactionJournalisee } from './transaction-journalisee';

/**
 * AUDIT FINAL F159 · toute transaction du serveur porte son journal d'audit.
 *
 * Hors de `journaliserDansTransaction`, le maillon d'un acte partait par une
 * connexion à part · il survivait à l'annulation de l'acte, et la chaîne
 * attestait une écriture qui n'a jamais existé. Deux transactions l'oubliaient
 * encore, et rien n'empêchait la suivante de l'oublier.
 */

const RACINE = join(__dirname, '..', '..');

function sources(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return sources(chemin);
    return nom.endsWith('.ts') && !nom.endsWith('.spec.ts') ? [chemin] : [];
  });
}

/** Le CODE seul · un commentaire qui nomme `$transaction(` ne fait rien. */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
}

/**
 * Les deux seules exceptions, et pourquoi. L'utilitaire lui-même ; et
 * l'écrivain de la chaîne, qui ouvre sa transaction courte sur le client NU
 * pour un maillon hors de tout acte transactionnel (`ajouterMaillon`).
 */
const EXCEPTIONS = new Set(['common/audit/transaction-journalisee.ts', 'common/audit/extension-audit.ts']);

describe('F159 · une seule porte pour une transaction', () => {
  const fichiers = sources(RACINE);

  it('le recensement trouve encore des transactions · un garde-fou qui ne trouve rien ne vérifie rien', () => {
    const appelants = fichiers.filter((f) => /transactionJournalisee\(/.test(sansCommentaires(readFileSync(f, 'utf8'))));
    expect(appelants.length).toBeGreaterThan(15);
  });

  it('aucun fichier du serveur n’ouvre une transaction ailleurs que par transactionJournalisee', () => {
    const fautifs = fichiers
      .map((f) => relative(RACINE, f).split('\\').join('/'))
      .filter((r) => !EXCEPTIONS.has(r))
      .filter((r) => /\.\$transaction\s*\(/.test(sansCommentaires(readFileSync(join(RACINE, r), 'utf8'))));
    expect(fautifs).toEqual([]);
  });

  it('la transaction ouverte est celle que le journal d’audit voit', async () => {
    const tx = { marque: 'tx' } as unknown as Prisma.TransactionClient;
    let vue: unknown;
    const prisma = { $transaction: jest.fn(async (fn: (t: Prisma.TransactionClient) => Promise<unknown>) => fn(tx)) };
    const rendu = await transactionJournalisee(prisma as never, async (recu) => {
      vue = transactionAuditee();
      return recu;
    });
    expect(vue).toBe(tx);
    expect(rendu).toBe(tx);
    // Hors de la transaction, plus rien n'est déclaré.
    expect(transactionAuditee()).toBeUndefined();
  });

  it('les options passent telles quelles, et leur absence ne passe pas un second argument', async () => {
    const prisma = { $transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>, _options?: unknown) => fn({})) };
    await transactionJournalisee(prisma as never, async () => 1, { maxWait: 10_000, timeout: 30_000 });
    await transactionJournalisee(prisma as never, async () => 2);
    expect(prisma.$transaction.mock.calls[0][1]).toEqual({ maxWait: 10_000, timeout: 30_000 });
    expect(prisma.$transaction.mock.calls[1]).toHaveLength(1);
  });

  it('le retrait des commentaires ne retire pas le code', () => {
    expect(sansCommentaires("await this.prisma.$transaction([a]); // $transaction(")).toContain('this.prisma.$transaction([a]);');
    expect(sansCommentaires('/* this.prisma.$transaction( */ x')).not.toContain('$transaction');
    expect(sansCommentaires("const u = 'https://exemple.cd'; this.prisma.$transaction(f)")).toContain('$transaction(f)');
  });
});
