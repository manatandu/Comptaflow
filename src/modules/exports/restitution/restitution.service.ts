import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
  TABLES_DE_L_ARCHIVE,
  TABLES_RESTITUEES,
  TABLE_DU_DOSSIER,
  borneDuModele,
  colonnesDuModele,
  fichierDeLaTable,
  fichierDuDocument,
  ordreDuModele,
} from './tables-restitution';
import { ecrireManifeste } from './manifeste-restitution';

/** Le lot de lecture · assez grand pour ne pas multiplier les allers-retours,
 *  assez petit pour que la mémoire du serveur ne dépende pas de la taille du
 *  dossier. Même ordre de grandeur que `LOT_LECTURE` des notes annexes. */
const LOT = 2_000;
const SEPARATEUR = ';';

/**
 * LE NOM DE L'ARCHIVE PORTE LE DOSSIER ET LE JOUR (audit final F225).
 *
 * Le contrôleur servait `restitution-<jour>.zip` · deux dossiers restitués le
 * même jour, par un opérateur qui passe d'un cabinet à l'autre, portaient le
 * même nom, et le second téléchargement écrasait le premier ou devenait
 * « restitution-<jour> (1).zip », sans rien qui dise de quel dossier il
 * s'agit. Le service calculait bien un nom avec la dénomination, rendu à la
 * fin de `produire` · trop tard, les en-têtes étant partis avec le premier
 * octet, et personne ne le lisait.
 *
 * La dénomination seule ne suffit pas à distinguer deux dossiers · deux
 * cabinets peuvent porter le même nom, et un nom tout en caractères non
 * latins se réduit à rien. L'IDENTIFIANT du dossier, celui que le manifeste
 * imprime déjà, les distingue toujours. La dénomination reste devant, pour
 * qu'un lecteur reconnaisse l'archive sans l'ouvrir.
 *
 * Le nom ne garde que des lettres ASCII, des chiffres et des traits d'union ·
 * il part dans `Content-Disposition` entre guillemets, où un guillemet ou un
 * retour à la ligne venus de la dénomination casseraient l'en-tête. Le jour
 * est celui de l'horodatage en temps universel, comme le manifeste.
 */
export function nomDeLArchive(dossier: { id: string; nom: string }, jour: Date): string {
  const denomination = dossier.nom
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .toLowerCase()
    .slice(0, 40)
    .replace(/^-+|-+$/g, '');
  const identifiant = dossier.id.replace(/[^A-Za-z0-9-]+/g, '-');
  const date = jour.toISOString().slice(0, 10);
  return `restitution-${denomination ? `${denomination}-` : ''}${identifiant}-${date}.zip`;
}

/** Ce que l'archive a réellement écrit des pièces attachées, pour `controles.txt`. */
interface SuiviPieces {
  annoncees: number;
  ecrites: number;
  manquantes: string[];
}

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
   * Le nom de l'archive du dossier (`nomDeLArchive`), lu AVANT que la
   * réponse ne parte · c'est le contrôleur qui le pose dans les en-têtes, et
   * il ne peut plus le faire une fois le premier octet envoyé.
   */
  async nomDeLArchive(tenantId: string, maintenant: Date = new Date()): Promise<string> {
    const dossier = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, nom: true } });
    if (!dossier) throw new NotFoundException('Dossier introuvable : aucune archive ne peut être produite.');
    return nomDeLArchive(dossier, maintenant);
  }

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
   * modèles portés par leur parent échappent à la garde de
   * cloisonnement, et un filtre construit à la main les rendrait pour tous
   * les cabinets. Voir `tables-restitution.ts`.
   */
  private async *lignesCsv(
    modele: string,
    tenantId: string,
    compteur: { ecrites: number },
    interrompre: (e: Error) => void,
  ): AsyncGenerator<string> {
    try {
      yield* this.lignesCsvBrutes(modele, tenantId, compteur);
    } catch (e) {
      interrompre(new Error(`table ${modele} non lue · ${e instanceof Error ? e.message : String(e)}`));
    }
  }

  private async *lignesCsvBrutes(
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

    yield this.ligneCsv(colonnes, Object.fromEntries(colonnes.map((c) => [c, c])));

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
        yield this.ligneCsv(colonnes, ligne);
        compteur.ecrites++;
      }
      dernier = lot[lot.length - 1][cle];
      if (lot.length < LOT) return;
    }
  }

  /** Une ligne de CSV, dans l'ordre des colonnes · la même pour toutes les tables. */
  private ligneCsv(colonnes: string[], ligne: Record<string, unknown>): string {
    return `${colonnes.map((c) => ecrireCelluleCsv(this.enTexte(ligne[c]), SEPARATEUR)).join(SEPARATEUR)}\r\n`;
  }

  /**
   * `tables/tenant.csv` · la ligne du dossier (audit du 2026-09-27, F9). Lue
   * par son identifiant, qui EST la borne · les colonnes et leur écriture sont
   * celles des autres tables, exclusions comprises.
   */
  private async *ligneDuDossierCsv(
    tenantId: string,
    compteur: { ecrites: number },
    interrompre: (e: Error) => void,
  ): AsyncGenerator<string> {
    const colonnes = colonnesDuModele(TABLE_DU_DOSSIER);
    yield this.ligneCsv(colonnes, Object.fromEntries(colonnes.map((c) => [c, c])));
    try {
      const dossier = await this.prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: Object.fromEntries(colonnes.map((c) => [c, true])),
      });
      yield this.ligneCsv(colonnes, dossier as Record<string, unknown>);
      compteur.ecrites++;
    } catch (e) {
      interrompre(new Error(`table ${TABLE_DU_DOSSIER} non lue · ${e instanceof Error ? e.message : String(e)}`));
    }
  }

  /** Le compte de chaque table, pris AVANT l'extraction · c'est l'inventaire
   *  annoncé par le manifeste, et `controles.txt` dira s'il a tenu. */
  private async inventaire(tenantId: string): Promise<Record<string, number>> {
    // Le dossier existe, sa ligne est unique · `findUniqueOrThrow` l'a lue.
    const comptes: Record<string, number> = { [TABLE_DU_DOSSIER]: 1 };
    for (const modele of TABLES_RESTITUEES) {
      const delegue = (this.prisma as unknown as Record<string, { count: (a: unknown) => Promise<number> }>)[
        modele.charAt(0).toLowerCase() + modele.slice(1)
      ];
      comptes[modele] = await delegue.count({ where: borneDuModele(modele, tenantId) });
    }
    return comptes;
  }

  /**
   * Produit l'archive dans `sortie`. Le nom du fichier n'est pas rendu ici ·
   * les en-têtes partent avant la première ligne, le contrôleur le demande à
   * `nomDeLArchive` avant d'appeler (audit final F225).
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
  ): Promise<void> {
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
      apres: { tables: TABLES_DE_L_ARCHIVE.length, lignes: lignesParTable } as Prisma.InputJsonValue,
    });

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('warning', (e: archiver.ArchiverError) => this.journal.warn(`Archive · ${e.message}`));
    // Une erreur émise par l'archive elle-même détruit la réponse plutôt que
    // de la clore · un ZIP tronqué est refusé par l'utilitaire d'archive, au
    // lieu de s'ouvrir incomplet. Sans écouteur, Node la lèverait hors de
    // toute promesse et le serveur tomberait pour tous les cabinets.
    archive.on('error', (e: Error) => {
      this.journal.error(`Archive interrompue · ${e.message}`);
      sortie.destroy(e);
    });
    archive.pipe(sortie);

    /**
     * UNE TABLE ILLISIBLE ARRÊTE L'ARCHIVE (audit final F96). L'erreur d'une
     * entrée est émise par son propre flux, qu'`archiver` n'écoute pas ·
     * levée dans un générateur, elle sortait hors de toute promesse et
     * arrêtait le serveur pour tous les cabinets, comme une pièce illisible
     * avant sa correction. Mais une table n'est pas une pièce · l'archive
     * sans elle serait une restitution amputée qui se dit complète. La sortie
     * est donc DÉTRUITE, et le ZIP tronqué refusé par l'utilitaire d'archive.
     * `finalize` ne se résout plus une fois l'archive abandonnée · on attend
     * donc l'une ou l'autre fin, jamais une promesse qui ne viendra pas.
     */
    let interrompue = false;
    let signalerArret: () => void = () => undefined;
    const arret = new Promise<void>((resoudre) => (signalerArret = resoudre));
    const interrompre = (e: Error) => {
      if (interrompue) return;
      interrompue = true;
      this.journal.error(`Restitution interrompue · ${e.message}`);
      archive.abort();
      sortie.destroy(e);
      signalerArret();
    };

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

    const ecrites: Record<string, { ecrites: number }> = { [TABLE_DU_DOSSIER]: { ecrites: 0 } };
    archive.append(Readable.from(this.ligneDuDossierCsv(tenantId, ecrites[TABLE_DU_DOSSIER], interrompre)), {
      name: fichierDeLaTable(TABLE_DU_DOSSIER),
    });
    for (const modele of TABLES_RESTITUEES) {
      ecrites[modele] = { ecrites: 0 };
      archive.append(Readable.from(this.lignesCsv(modele, tenantId, ecrites[modele], interrompre)), {
        name: fichierDeLaTable(modele),
      });
    }

    // LES DOCUMENTS ATTACHÉS AUX TIERS (point 21) · un fichier par entrée,
    // chacun lu au moment où l'archive l'écrit. `archiver` consomme ses
    // entrées une à une, si bien qu'une seule pièce est en mémoire à la fois,
    // quel que soit leur nombre.
    const documents = await this.prisma.documentTiers.findMany({
      where: { tenantId },
      orderBy: { id: 'asc' },
      select: { id: true, nomFichier: true },
    });
    const pieces: SuiviPieces = { annoncees: documents.length, ecrites: 0, manquantes: [] };
    for (const document of documents) {
      archive.append(Readable.from(this.contenuDocument(tenantId, document.id, pieces)), {
        name: fichierDuDocument(document.id, document.nomFichier),
      });
    }

    // APPENDU EN DERNIER, ET LU EN DERNIER. `archiver` consomme ses entrées
    // dans l'ordre : le corps de ce générateur ne s'exécute qu'une fois
    // toutes les tables écrites, donc une fois les compteurs remplis. C'est ce qui
    // permet de comparer l'inventaire annoncé à ce qui est réellement sorti,
    // sans rien garder en mémoire.
    archive.append(Readable.from(this.controles(lignesParTable, ecrites, pieces)), {
      name: 'controles.txt',
    });

    const fin = archive.finalize();
    // Rejetée seulement sur une archive abandonnée · déjà consignée ci-dessus.
    fin.catch(() => undefined);
    await Promise.race([fin, arret]);
  }

  /**
   * UNE PIÈCE ILLISIBLE NE FAIT JAMAIS TOMBER L'ARCHIVE. L'erreur d'une entrée
   * est émise par son propre flux, qu'`archiver` n'écoute pas · levée ici,
   * elle sortait hors de toute promesse et arrêtait le serveur pour tous les
   * cabinets (vu en test). Elle est donc consignée, et `controles.txt` nomme
   * la pièce · une entrée vide sans un mot se lirait comme une pièce vide.
   * Même traitement pour une pièce retirée entre l'inventaire et sa lecture.
   */
  private async *contenuDocument(tenantId: string, id: string, pieces: SuiviPieces): AsyncGenerator<Buffer> {
    try {
      const document = await this.prisma.documentTiers.findFirst({ where: { id, tenantId }, select: { contenu: true } });
      if (!document) {
        pieces.manquantes.push(`${id} · retirée pendant l'extraction`);
        return;
      }
      pieces.ecrites++;
      yield Buffer.from(document.contenu);
    } catch (e) {
      const motif = e instanceof Error ? e.message : String(e);
      this.journal.warn(`Pièce ${id} non lue · ${motif}`);
      pieces.manquantes.push(`${id} · illisible (${motif})`);
    }
  }

  private async *controles(
    annonce: Record<string, number>,
    ecrites: Record<string, { ecrites: number }>,
    pieces: SuiviPieces,
  ): AsyncGenerator<string> {
    yield 'Contrôle de l\'extraction · lignes annoncées par l\'inventaire, lignes réellement écrites.\r\n';
    yield "Un écart n'est pas une erreur : les tables sont lues l'une après l'autre, sans\r\n";
    yield "transaction commune, et un dossier en cours d'usage bouge pendant l'extraction.\r\n";
    yield "Il est écrit ici plutôt que tu, pour que le lecteur sache ce qu'il tient.\r\n\r\n";
    let ecarts = 0;
    for (const modele of TABLES_DE_L_ARCHIVE) {
      const a = annonce[modele] ?? 0;
      const e = ecrites[modele]?.ecrites ?? 0;
      if (a !== e) ecarts++;
      yield `${modele};${a};${e};${a === e ? 'conforme' : 'ECART'}\r\n`;
    }
    yield `\r\n${ecarts === 0 ? 'Aucun écart.' : `${ecarts} table(s) en écart.`}\r\n`;
    yield `\r\nDocuments attachés aux tiers · ${pieces.annoncees} annoncé(s), ${pieces.ecrites} écrit(s).\r\n`;
    for (const m of pieces.manquantes) yield `PIECE NON RESTITUEE;${m}\r\n`;
  }
}
