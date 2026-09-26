import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { join } from 'path';
import { estSurSite } from '../../common/mode-installation';
import { CLE_PUBLIQUE_EDITEUR } from './cle-publique-editeur';
import { ContenuLicence, empreinteDe, StatutLicenceSurSite, verifierLicence, VerdictLicence } from './licence-signee';

/** Ce que le service lit du poste · remplaçable dans les tests, jamais par l'environnement. */
export interface AccesPoste {
  identifiantSysteme: () => string | null;
  lire: (chemin: string) => string | null;
  ecrire: (chemin: string, contenu: string) => void;
  aujourdhui: () => string;
}

/**
 * L'identifiant du poste · MachineGuid sous Windows (posé à l'installation du
 * système, il survit aux redémarrages et aux changements de carte réseau),
 * machine-id sous Linux. Une adresse MAC aurait été plus simple et fausse :
 * elle change avec une clé wifi ou une carte réseau remplacée, et le client
 * perdrait sa licence pour un câble.
 */
function identifiantSystemeParDefaut(): string | null {
  try {
    if (process.platform === 'win32') {
      const sortie = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { encoding: 'utf8', windowsHide: true });
      const m = /MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/.exec(sortie);
      return m ? m[1] : null;
    }
    for (const f of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
      if (existsSync(f)) {
        const v = readFileSync(f, 'utf8').trim();
        if (v) return v;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** Le jour du CALENDRIER DU POSTE · c'est lui que le client voit, et que la licence compare. */
function jourLocal(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const ACCES_POSTE_PAR_DEFAUT: AccesPoste = {
  identifiantSysteme: identifiantSystemeParDefaut,
  lire: (chemin) => (existsSync(chemin) ? readFileSync(chemin, 'utf8') : null),
  // Écriture en deux temps · un poste qui s'éteint en pleine écriture (une
  // coupure de courant, le cas ordinaire) laisserait sinon un fichier de
  // licence tronqué, donc illisible, et un client coupé au redémarrage.
  ecrire: (chemin, contenu) => {
    const provisoire = `${chemin}.tmp`;
    writeFileSync(provisoire, contenu, 'utf8');
    renameSync(provisoire, chemin);
  },
  aujourdhui: () => jourLocal(),
};

export interface EtatSurSite extends VerdictLicence {
  surSite: boolean;
  empreinte: string | null;
  dateVersion: string | null;
}

/**
 * LA LICENCE DE L'INSTALLATION, tenue en mémoire et relue chaque heure.
 *
 * En ligne, ce service ne fait RIEN · `surSite` est faux, et
 * `LicenceService` garde ses règles de toujours. Sur site, il remplace toute
 * la logique de licence par dossier : une installation n'a qu'une licence,
 * celle du fichier, et elle vaut pour tous ses dossiers.
 */
@Injectable()
export class LicenceSurSiteService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('LicenceSurSite');
  private etatCourant: EtatSurSite;
  private minuterie: NodeJS.Timeout | null = null;
  readonly surSite: boolean;
  readonly dossierDonnees: string;

  constructor(
    private readonly acces: AccesPoste = ACCES_POSTE_PAR_DEFAUT,
    env: NodeJS.ProcessEnv = process.env,
    private readonly clePublique: string | null = CLE_PUBLIQUE_EDITEUR,
    private readonly dossierVersion: string = process.cwd(),
  ) {
    this.surSite = estSurSite(env);
    this.dossierDonnees = env.DOSSIER_DONNEES || join(process.cwd(), 'donnees');
    this.etatCourant = { surSite: this.surSite, empreinte: null, dateVersion: null, statut: 'ABSENTE', motif: null, contenu: null };
    if (this.surSite) this.actualiser();
  }

  onModuleInit() {
    if (!this.surSite) return;
    // Relue chaque heure · une licence qui expire à minuit doit cesser de
    // valoir sans redémarrage, et l'horloge doit avancer sa borne.
    this.minuterie = setInterval(() => this.actualiser(), 60 * 60 * 1000);
    this.minuterie.unref();
  }

  onModuleDestroy() {
    if (this.minuterie) clearInterval(this.minuterie);
  }

  get cheminLicence() {
    return join(this.dossierDonnees, 'licence.omegax');
  }

  private get cheminHorloge() {
    return join(this.dossierDonnees, 'horloge.json');
  }

  /**
   * La date de la version installée · posée par le paquet d'installation
   * (`version-sur-site.json`, écrit par le workflow qui le construit), jamais
   * par l'horloge du poste.
   */
  private dateVersion(): string | null {
    const brut = this.acces.lire(join(this.dossierVersion, 'version-sur-site.json'));
    if (!brut) return null;
    try {
      const d = (JSON.parse(brut) as { date?: unknown }).date;
      return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
    } catch {
      return null;
    }
  }

  private horlogeMax(): string | null {
    const brut = this.acces.lire(this.cheminHorloge);
    if (!brut) return null;
    try {
      const d = (JSON.parse(brut) as { max?: unknown }).max;
      return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
    } catch {
      return null;
    }
  }

  private verifier(texte: string | null): EtatSurSite {
    const id = this.acces.identifiantSysteme();
    const empreinte = id ? empreinteDe(id) : null;
    const dateVersion = this.dateVersion();
    if (!empreinte) {
      return {
        surSite: true,
        empreinte: null,
        dateVersion,
        statut: 'AUTRE_MACHINE',
        motif: 'L’identifiant de ce poste est illisible · la licence ne peut pas y être rattachée. Contactez VMG Consulting.',
        contenu: null,
      };
    }
    const v = verifierLicence(texte, {
      clePubliquePem: this.clePublique,
      empreinte,
      aujourdhui: this.acces.aujourdhui(),
      horlogeMax: this.horlogeMax(),
      dateVersion,
    });
    return { ...v, surSite: true, empreinte, dateVersion };
  }

  /** Relit le fichier et fait avancer la borne de l'horloge · jamais reculer. */
  actualiser(): EtatSurSite {
    if (!this.surSite) return this.etatCourant;
    this.etatCourant = this.verifier(this.acces.lire(this.cheminLicence));
    // La borne n'avance que sous une licence authentique qui ne dénonce pas
    // déjà un recul · sinon remettre l'horloge en avant puis en arrière
    // suffirait à la faire glisser.
    const aujourdhui = this.acces.aujourdhui();
    const max = this.horlogeMax();
    if (this.etatCourant.statut !== 'HORLOGE_RECULEE' && (!max || aujourdhui > max)) {
      try {
        mkdirSync(this.dossierDonnees, { recursive: true });
        this.acces.ecrire(this.cheminHorloge, JSON.stringify({ max: aujourdhui }));
      } catch (e) {
        this.log.warn(`Borne d’horloge non écrite · ${(e as Error).message}`);
      }
    }
    if (this.etatCourant.statut !== 'VALIDE') this.log.warn(`Licence sur site · ${this.etatCourant.statut}`);
    return this.etatCourant;
  }

  etat(): EtatSurSite {
    return this.etatCourant;
  }

  /** L'accès aux dossiers · le verdict du fichier, pour tous. */
  autorisation(): { autorise: boolean; motif?: string } {
    const e = this.etatCourant;
    return e.statut === 'VALIDE' ? { autorise: true } : { autorise: false, motif: e.motif ?? `Licence sur site · ${e.statut}` };
  }

  /**
   * Installe un fichier de licence reçu de VMG. N'importe qui sur le réseau
   * local peut en déposer un, puisqu'aucun compte n'existe encore à la
   * première installation · ce n'est pas une faille : un fichier ne vaut que
   * signé par VMG et pour CE poste. La seule malveillance possible serait de
   * remplacer une licence récente par une plus ancienne encore valide, d'où
   * le refus d'une émission antérieure.
   */
  deposer(texte: string): EtatSurSite {
    if (!this.surSite) throw new BadRequestException('Ce serveur n’est pas une installation sur site.');
    const candidat = this.verifier(texte);
    if (candidat.statut !== 'VALIDE') {
      throw new BadRequestException(candidat.motif ?? `Licence refusée · ${candidat.statut}`);
    }
    const actuel = this.etatCourant;
    if (actuel.statut === 'VALIDE' && actuel.contenu && candidat.contenu!.emiseLe < actuel.contenu.emiseLe) {
      throw new BadRequestException(
        `La licence n° ${actuel.contenu.numero}, émise le ${actuel.contenu.emiseLe}, est plus récente que celle déposée (n° ${candidat.contenu!.numero}, émise le ${candidat.contenu!.emiseLe}).`,
      );
    }
    mkdirSync(this.dossierDonnees, { recursive: true });
    this.acces.ecrire(this.cheminLicence, texte);
    return this.actualiser();
  }

  /**
   * Le plafond de dossiers · vérifié avant toute création, cellules d'un
   * groupe comprises, puisque chacune est un dossier que l'installation tient.
   */
  verifierPlafondDossiers(nombreActuel: number) {
    if (!this.surSite) return;
    const e = this.etatCourant;
    if (e.statut !== 'VALIDE') throw new BadRequestException(e.motif ?? `Licence sur site · ${e.statut}`);
    const max = (e.contenu as ContenuLicence).dossiersMax;
    if (nombreActuel >= max) {
      throw new BadRequestException(`La licence n° ${e.contenu!.numero} couvre ${max} dossier(s), et ${nombreActuel} sont déjà ouverts sur cette installation.`);
    }
  }
}

export type { StatutLicenceSurSite };
