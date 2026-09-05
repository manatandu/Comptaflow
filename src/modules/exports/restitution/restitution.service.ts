import { Injectable, Logger } from '@nestjs/common';
import { ActionAudit, Prisma } from '@prisma/client';
// `import = require` et non un import par défaut · `esModuleInterop` est
// désactivé dans ce dépôt (seul `allowSyntheticDefaultImports` l'est, qui ne
// vaut qu'au typage). Un import par défaut compilerait en
// `archiver_1.default(...)`, indéfini à l'exécution : le typage passerait, le
// serveur tomberait au premier appel. `import * as` ne convient pas non plus,
// le module CommonJS exportant une FONCTION et non un espace de noms.
//
// `@types/archiver` est ÉPINGLÉ en 6.x · la 8.x n'expose plus ni l'appel ni
// `create`, alors qu'archiver 7 les porte tous les deux à l'exécution. Le
// typage aurait donc décrit un module qui n'existe pas.
import archiver = require('archiver');
import { Readable, Writable } from 'node:stream';
import { PrismaService } from '../../../common/prisma.service';
import { ajouterMaillon } from '../../../common/audit/extension-audit';
import { ecrireCelluleCsv } from '../../import/lecture-fichier';
import {
  TABLES_RESTITUEES,
  borneDuModele,
  colonnesDuModele,
  fichierDeLaTable,
  ordreDuModele,
} from './tables-restitution';
import { ecrireManifeste } from './manifeste-restitution';

/** Le lot de lecture · assez grand pour ne pas multiplier les allers-retours,
 *  assez petit pour que la mémoire du serveur ne dépende pas de la taille du
 *  dossier. Même ordre de grandeur que `LOT_LECTURE` des notes annexes. */
const LOT = 2_000;
const SEPARATEUR = ';';

/**
 * LA RESTITUTION COMPLÈTE DU DOSSIER.
 *
 * POURQUOI UN ZIP DE CSV, ET PAS UN CLASSEUR. `writeBuffer()` d'ExcelJS
 * construit tout le classeur en mémoire · le banc du 2026-09-03 l'a mesuré
 * (liasse complète : 61 s et dépassement de tas avant correction). Un CSV
 * s'écrit ligne à ligne à mémoire constante, quelle que soit la taille du
 * dossier, et c'est la seule forme qui tienne sans borne de lignes.
 *
 * POURQUOI PAS DERRIÈRE `LicenceGuard`. Le contrôleur d'exports en porte un.
 * Une restitution posée derrière lui ne serait disponible que tant que le
 * client paie, c'est-à-dire pas dans le seul cas où elle sert : la sortie
 * d'un client (suspendre, archiver, restituer, purger). Ce sont ses données ;
 * les retenir comme moyen de pression est exactement ce qu'une garantie de
 * réversibilité doit exclure. C'est une décision de VMG et non une règle de
 * droit · aucun texte lu ne tranche, c'est une clause de contrat de licence.
 */
@Injectable()
export class RestitutionService {
  private readonly journal = new Logger(RestitutionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Une valeur de colonne, en texte. Aucune valeur n'est « jolie » ici · une
   * archive se relit par une machine avant de se lire par un œil.
   */
  private enTexte(v: unknown): string {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'bigint') return v.toString();
    // Un Decimal de Prisma · sa représentation textuelle est stable, sa
    // sérialisation JSON ne l'est pas selon la version.
    if (typeof v === 'object' && typeof (v as { toFixed?: unknown }).toFixed === 'function') {
      return String(v);
    }
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  /**
   * Lit une table par lots et rend son CSV, ligne à ligne.
   *
   * La borne vient de `borneDuModele` et JAMAIS d'un `where` écrit ici · les
   * quinze modèles portés par leur parent échappent à la garde de
   * cloisonnement, et un filtre construit à la main les rendrait pour tous
   * les cabinets. Voir `tables-restitution.ts`.
   */
  private async *lignesCsv(
    modele: string,
    tenantId: string,
    compteur: { ecrites: number },
  ): AsyncGenerator<string> {
    const colonnes = colonnesDuModele(modele);
    const cle = ordreDuModele(modele);
    const borne = borneDuModele(modele, tenantId);
    const delegue = (this.prisma as unknown as Record<string, {
      findMany: (a: unknown) => Promise<Record<string, unknown>[]>;
    }>)[modele.charAt(0).toLowerCase() + modele.slice(1)];

    yield `${colonnes.map((c) => ecrireCelluleCsv(c, SEPARATEUR)).join(SEPARATEUR)}\r\n`;

    let dernier: unknown = null;
    for (;;) {
      // La pagination se fait par CURSEUR et non par `skip` · un `OFFSET`
      // profond relit toutes les lignes sautées à chaque lot, et le coût
      // devient quadratique sur la table la plus grosse du logiciel.
      const lot = await delegue.findMany({
        where: dernier === null ? borne : { ...borne, [cle]: { gt: dernier } },
        orderBy: { [cle]: 'asc' },
        take: LOT,
        select: Object.fromEntries(colonnes.map((c) => [c, true])),
      });
      if (lot.length === 0) return;
      for (const ligne of lot) {
        yield `${colonnes.map((c) => ecrireCelluleCsv(this.enTexte(ligne[c]), SEPARATEUR)).join(SEPARATEUR)}\r\n`;
        compteur.ecrites++;
      }
      dernier = lot[lot.length - 1][cle];
      if (lot.length < LOT) return;
    }
  }

  /** Le compte de chaque table, pris AVANT l'extraction · c'est l'inventaire
   *  annoncé par le manifeste, et `controles.txt` dira s'il a tenu. */
  private async inventaire(tenantId: string): Promise<Record<string, number>> {
    const comptes: Record<string, number> = {};
    for (const modele of TABLES_RESTITUEES) {
      const delegue = (this.prisma as unknown as Record<string, { count: (a: unknown) => Promise<number> }>)[
        modele.charAt(0).toLowerCase() + modele.slice(1)
      ];
      comptes[modele] = await delegue.count({ where: borneDuModele(modele, tenantId) });
    }
    return comptes;
  }

  /**
   * Produit l'archive dans `sortie`. Rend le nom de fichier proposé.
   *
   * LE MAILLON EST ÉCRIT AVANT LA PREMIÈRE LIGNE. Une extraction qui
   * échouerait en cours de route laisserait donc un maillon pour une archive
   * incomplète · c'est le sens voulu. Poser le maillon après aurait laissé
   * sans trace toute extraction interrompue, y compris celle qu'on
   * interrompt exprès, et le chemin de révision aurait un trou à l'endroit
   * exact où il compte.
   */
  async produire(
    tenantId: string,
    acteur: { id: string | null; email: string; adresseIp: string | null },
    sortie: Writable,
  ): Promise<string> {
    const dossier = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { id: true, nom: true, referentiel: true },
    });
    const lignesParTable = await this.inventaire(tenantId);
    const horodatage = new Date();

    const maillon = await ajouterMaillon(this.prisma.clientNu, {
      tenantId,
      acteurId: acteur.id,
      acteurEmail: acteur.email,
      adresseIp: acteur.adresseIp,
      action: ActionAudit.EXTRACTION,
      entite: 'Tenant',
      entiteId: tenantId,
      avant: null,
      apres: { tables: TABLES_RESTITUEES.length, lignes: lignesParTable } as Prisma.InputJsonValue,
    });

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('warning', (e: archiver.ArchiverError) => this.journal.warn(`Archive · ${e.message}`));
    archive.pipe(sortie);

    archive.append(
      ecrireManifeste({
        dossier,
        demandeePar: acteur.email,
        horodatage: horodatage.toISOString(),
        maillon,
        lignesParTable,
      }),
      { name: 'MANIFESTE.md' },
    );

    const ecrites: Record<string, { ecrites: number }> = {};
    for (const modele of TABLES_RESTITUEES) {
      ecrites[modele] = { ecrites: 0 };
      archive.append(Readable.from(this.lignesCsv(modele, tenantId, ecrites[modele])), {
        name: fichierDeLaTable(modele),
      });
    }

    // APPENDU EN DERNIER, ET LU EN DERNIER. `archiver` consomme ses entrées
    // dans l'ordre : le corps de ce générateur ne s'exécute qu'une fois les
    // 54 tables écrites, donc une fois les compteurs remplis. C'est ce qui
    // permet de comparer l'inventaire annoncé à ce qui est réellement sorti,
    // sans rien garder en mémoire.
    archive.append(Readable.from(this.controles(lignesParTable, ecrites)), {
      name: 'controles.txt',
    });

    await archive.finalize();
    const jour = horodatage.toISOString().slice(0, 10);
    return `restitution-${dossier.nom.replace(/[^\w-]+/g, '-').toLowerCase()}-${jour}.zip`;
  }

  private async *controles(
    annonce: Record<string, number>,
    ecrites: Record<string, { ecrites: number }>,
  ): AsyncGenerator<string> {
    yield 'Contrôle de l\'extraction · lignes annoncées par l\'inventaire, lignes réellement écrites.\r\n';
    yield "Un écart n'est pas une erreur : les tables sont lues l'une après l'autre, sans\r\n";
    yield "transaction commune, et un dossier en cours d'usage bouge pendant l'extraction.\r\n";
    yield "Il est écrit ici plutôt que tu, pour que le lecteur sache ce qu'il tient.\r\n\r\n";
    let ecarts = 0;
    for (const modele of TABLES_RESTITUEES) {
      const a = annonce[modele] ?? 0;
      const e = ecrites[modele]?.ecrites ?? 0;
      if (a !== e) ecarts++;
      yield `${modele};${a};${e};${a === e ? 'conforme' : 'ECART'}\r\n`;
    }
    yield `\r\n${ecarts === 0 ? 'Aucun écart.' : `${ecarts} table(s) en écart.`}\r\n`;
  }
}
