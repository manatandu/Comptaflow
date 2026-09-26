import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { execFile } from 'child_process';
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { estSurSite } from '../../common/mode-installation';

const executer = promisify(execFile);

/**
 * LA SAUVEGARDE D'UNE INSTALLATION SUR SITE · en ligne, c'est le workflow
 * nocturne (`sauvegarde-base.yml`) qui dump Neon ; chez un client, personne
 * ne le fait à sa place. Un disque qui lâche sans sauvegarde, c'est la
 * comptabilité de l'entité perdue, et c'est le cas ordinaire d'un PC de
 * bureau au bout de quelques années.
 *
 * UNE COPIE PAR JOUR, TENTÉE CHAQUE HEURE · un poste de bureau est éteint la
 * nuit ; une sauvegarde planifiée à 2 h ne partirait jamais. Le service
 * regarde chaque heure si la dernière copie a plus de vingt-quatre heures, et
 * en fait une si oui, dès que le poste est allumé.
 *
 * LE MOT DE PASSE NE PASSE JAMAIS EN ARGUMENT · une ligne de commande se lit
 * dans la liste des processus par n'importe quel utilisateur du poste. La
 * chaîne de connexion est décomposée en variables d'environnement du seul
 * processus `pg_dump`.
 */

/** Les variables PG* d'une chaîne de connexion postgresql:// · `null` si elle est illisible. */
export function parametresConnexion(url: string | undefined): Record<string, string> | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!/^postgres(ql)?:$/.test(u.protocol)) return null;
    const base = decodeURIComponent(u.pathname.replace(/^\//, ''));
    if (!base) return null;
    return {
      PGHOST: u.hostname,
      PGPORT: u.port || '5432',
      PGUSER: decodeURIComponent(u.username),
      PGPASSWORD: decodeURIComponent(u.password),
      PGDATABASE: base,
    };
  } catch {
    return null;
  }
}

const MOTIF_NOM = /^omegax-(\d{8}-\d{6})\.dump$/;

/** Le nom d'une copie · horodaté au calendrier du poste, triable comme une chaîne. */
export function nomSauvegarde(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `omegax-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.dump`;
}

/** Les copies à retirer pour n'en garder que `garder`, les plus récentes · seules celles d'OmegaX sont touchées. */
export function copiesARetirer(noms: string[], garder: number): string[] {
  const nos = noms.filter((n) => MOTIF_NOM.test(n)).sort().reverse();
  return nos.slice(Math.max(1, garder));
}

export interface CopieSauvegarde {
  nom: string;
  taille: number;
  date: string;
}

@Injectable()
export class SauvegardeSurSiteService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('SauvegardeSurSite');
  private enCours: Promise<CopieSauvegarde> | null = null;
  private minuterie: NodeJS.Timeout | null = null;
  readonly surSite: boolean;
  readonly dossier: string;
  private readonly garder: number;
  private readonly pgDump: string;

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {
    this.surSite = estSurSite(env);
    const donnees = env.DOSSIER_DONNEES || join(process.cwd(), 'donnees');
    this.dossier = env.DOSSIER_SAUVEGARDES || join(donnees, 'sauvegardes');
    const g = Number.parseInt(env.SAUVEGARDES_A_GARDER ?? '', 10);
    this.garder = Number.isInteger(g) && g > 0 ? g : 30;
    const exe = process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump';
    this.pgDump = env.PG_BIN ? join(env.PG_BIN, exe) : exe;
  }

  onModuleInit() {
    if (!this.surSite) return;
    const tenter = () => {
      this.siNecessaire().catch((e) => this.log.error(`Sauvegarde automatique échouée · ${(e as Error).message}`));
    };
    // Deux minutes après le démarrage · laisser les migrations et le premier
    // accès passer avant de charger le disque.
    setTimeout(tenter, 2 * 60 * 1000).unref();
    this.minuterie = setInterval(tenter, 60 * 60 * 1000);
    this.minuterie.unref();
  }

  onModuleDestroy() {
    if (this.minuterie) clearInterval(this.minuterie);
  }

  lister(): CopieSauvegarde[] {
    let noms: string[] = [];
    try {
      noms = readdirSync(this.dossier);
    } catch {
      return [];
    }
    return noms
      .filter((n) => MOTIF_NOM.test(n))
      .sort()
      .reverse()
      .map((nom) => {
        const s = statSync(join(this.dossier, nom));
        return { nom, taille: s.size, date: s.mtime.toISOString() };
      });
  }

  async siNecessaire(maintenant = new Date()): Promise<CopieSauvegarde | null> {
    const derniere = this.lister()[0];
    if (derniere && maintenant.getTime() - new Date(derniere.date).getTime() < 24 * 60 * 60 * 1000) return null;
    return this.lancer();
  }

  /** Une copie maintenant · une seule à la fois, un second clic attend la première. */
  lancer(): Promise<CopieSauvegarde> {
    if (!this.surSite) return Promise.reject(new BadRequestException('Ce serveur n’est pas une installation sur site · ses sauvegardes sont celles de la plateforme.'));
    if (!this.enCours) {
      this.enCours = this.executer().finally(() => {
        this.enCours = null;
      });
    }
    return this.enCours;
  }

  private async executer(): Promise<CopieSauvegarde> {
    const pg = parametresConnexion(this.env.DATABASE_URL);
    if (!pg) throw new BadRequestException('La chaîne de connexion à la base est illisible · la sauvegarde ne peut pas partir.');
    mkdirSync(this.dossier, { recursive: true });
    const nom = nomSauvegarde(new Date());
    const chemin = join(this.dossier, nom);
    try {
      await executer(this.pgDump, ['--format=custom', '--no-owner', '--file', chemin], {
        env: { ...process.env, ...pg },
        timeout: 30 * 60 * 1000,
        windowsHide: true,
      });
    } catch (e) {
      // Une copie à moitié écrite ne doit pas passer pour la dernière bonne.
      try {
        unlinkSync(chemin);
      } catch {
        /* rien à retirer */
      }
      throw new BadRequestException(`La sauvegarde a échoué · ${(e as { stderr?: string }).stderr?.trim() || (e as Error).message}`);
    }
    for (const n of copiesARetirer(readdirSync(this.dossier), this.garder)) {
      try {
        unlinkSync(join(this.dossier, n));
      } catch (e) {
        this.log.warn(`Ancienne copie non retirée (${n}) · ${(e as Error).message}`);
      }
    }
    const s = statSync(chemin);
    this.log.log(`Sauvegarde écrite · ${nom} (${s.size} octets)`);
    return { nom, taille: s.size, date: s.mtime.toISOString() };
  }
}
