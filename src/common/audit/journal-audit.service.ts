import { Injectable } from '@nestjs/common';
import { ActionAudit } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { calculerEmpreinte, EMPREINTE_ORIGINE } from './empreinte-audit';

/**
 * Taille des lots de vérification de la chaîne. Mesurée, pas choisie : le banc
 * du 6 septembre 2026 donne 3 864 octets de tas par événement chargé, soit
 * environ 19 Mio pour 5 000 · une part tenable des 460 Mio de production, avec
 * de la marge pour le reste du service. Monter à 50 000 rendrait 190 Mio et
 * remettrait la fonction à portée de l'OOM qu'elle vient de quitter.
 */
const LOT_VERIFICATION = 5_000;

export interface FiltreJournal {
  entite?: string;
  entiteId?: string;
  acteurEmail?: string;
  depuis?: Date;
  jusqua?: Date;
  page?: number;
  taille?: number;
}

export interface RuptureChaine {
  rang: number;
  id: string;
  motif: 'RANG_MANQUANT' | 'CHAINAGE_ROMPU' | 'EMPREINTE_INVALIDE';
}

export interface VerdictChaine {
  evenements: number;
  intacte: boolean;
  ruptures: RuptureChaine[];
}

@Injectable()
export class JournalAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async lister(tenantId: string, filtre: FiltreJournal) {
    const taille = Math.min(Math.max(filtre.taille ?? 50, 1), 200);
    const page = Math.max(filtre.page ?? 1, 1);
    const where = {
      tenantId,
      ...(filtre.entite ? { entite: filtre.entite } : {}),
      ...(filtre.entiteId ? { entiteId: filtre.entiteId } : {}),
      ...(filtre.acteurEmail ? { acteurEmail: filtre.acteurEmail } : {}),
      ...(filtre.depuis || filtre.jusqua
        ? { horodatage: { ...(filtre.depuis ? { gte: filtre.depuis } : {}), ...(filtre.jusqua ? { lte: filtre.jusqua } : {}) } }
        : {}),
    };
    const [total, evenements] = await Promise.all([
      this.prisma.evenementAudit.count({ where }),
      this.prisma.evenementAudit.findMany({
        where,
        orderBy: { rang: 'desc' },
        skip: (page - 1) * taille,
        take: taille,
      }),
    ]);
    return { total, page, taille, evenements };
  }

  /**
   * VÉRIFICATION DE LA CHAÎNE · c'est le contrôle que l'AUDCIF art. 22, 6°
   * rend possible : « permettant la reconstitution du chemin de révision ».
   *
   * Trois ruptures possibles, et elles ne disent pas la même chose :
   *  · RANG_MANQUANT · un maillon a été SUPPRIMÉ de la table ;
   *  · CHAINAGE_ROMPU · un maillon ne pointe pas vers son prédécesseur, donc
   *    un maillon a été inséré ou remplacé ;
   *  · EMPREINTE_INVALIDE · le contenu d'un maillon a été RETOUCHÉ après coup.
   *
   * La vérification recalcule chaque empreinte depuis le contenu relu. Elle ne
   * fait donc confiance à rien de ce qui est stocké, sauf à l'ordre des rangs.
   *
   * ELLE LIT PAR LOTS, ET C'EST UNE CORRECTION DE CAPACITÉ, pas un raffinement.
   * Elle chargeait la chaîne ENTIÈRE en mémoire, et le banc du 6 septembre 2026
   * l'a mise par terre : 100 000 événements consomment 369 Mio de tas sur les
   * 460 d'un conteneur Cloud Run, et à 160 000 le processus meurt en OOM. Un
   * dossier ordinaire produit environ 40 000 événements par exercice · la
   * fonction qui PROUVE l'intégrité du journal cessait donc de répondre vers le
   * quatrième exercice, c'est-à-dire précisément quand un auditeur commence à
   * avoir de l'historique à contrôler.
   *
   * Le chaînage se vérifie séquentiellement · il n'a jamais eu besoin de tout
   * voir à la fois. Seul l'état de la boucle (empreinte attendue, rang attendu)
   * traverse les lots, et il pèse deux variables. Même famille que le grand
   * livre et le journal, § 8 bis : aucune route ne rend une collection sans
   * borne, et ce qui vaut pour une réponse HTTP vaut pour une lecture interne.
   */
  async verifier(tenantId: string | null): Promise<VerdictChaine> {
    const ruptures: RuptureChaine[] = [];
    let attendue = EMPREINTE_ORIGINE;
    let rangAttendu = 1;
    let compte = 0;
    let apres = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const lot = await this.prisma.evenementAudit.findMany({
        where: { tenantId, rang: { gt: apres } },
        orderBy: { rang: 'asc' },
        take: LOT_VERIFICATION,
      });
      if (lot.length === 0) break;
      // GARDE ANTI-BOUCLE · la sortie ne doit pas dépendre du seul fait que la
      // couche de données honore le curseur. Un `take` ou un `rang > apres`
      // ignoré ferait tourner cette boucle SANS FIN, et un service qui ne rend
      // jamais la main est pire qu'un service qui tombe : rien ne le signale.
      // Trouvé le 6 septembre 2026 en lançant les tests, dont le faux Prisma
      // rendait le même lot à chaque appel.
      const dernier = lot[lot.length - 1].rang;
      if (dernier <= apres) break;
      compte += lot.length;
      apres = dernier;
      this.verifierLot(lot, ruptures, () => attendue, (v) => { attendue = v; },
        () => rangAttendu, (v) => { rangAttendu = v; });
    }

    return { evenements: compte, intacte: ruptures.length === 0, ruptures };
  }

  /**
   * Un lot de la chaîne · l'état de la boucle entre par des accesseurs plutôt
   * que par des champs d'instance, pour que deux vérifications concurrentes ne
   * se marchent pas dessus (le service est un singleton NestJS).
   */
  private verifierLot(
    evenements: Array<{
      id: string; rang: number; tenantId: string | null; horodatage: Date;
      acteurId: string | null; acteurEmail: string; adresseIp: string | null;
      action: ActionAudit; entite: string; entiteId: string | null;
      avant: unknown; apres: unknown; empreintePrecedente: string; empreinte: string;
    }>,
    ruptures: RuptureChaine[],
    lireAttendue: () => string,
    ecrireAttendue: (v: string) => void,
    lireRangAttendu: () => number,
    ecrireRangAttendu: (v: number) => void,
  ): void {
    let attendue = lireAttendue();
    let rangAttendu = lireRangAttendu();
    for (const e of evenements) {
      if (e.rang !== rangAttendu) {
        ruptures.push({ rang: e.rang, id: e.id, motif: 'RANG_MANQUANT' });
        rangAttendu = e.rang;
      }
      if (e.empreintePrecedente !== attendue) {
        ruptures.push({ rang: e.rang, id: e.id, motif: 'CHAINAGE_ROMPU' });
      }
      const recalculee = calculerEmpreinte({
        rang: e.rang,
        tenantId: e.tenantId,
        horodatage: e.horodatage,
        acteurId: e.acteurId,
        acteurEmail: e.acteurEmail,
        adresseIp: e.adresseIp,
        action: e.action,
        entite: e.entite,
        entiteId: e.entiteId,
        avant: e.avant,
        apres: e.apres,
        empreintePrecedente: e.empreintePrecedente,
      });
      if (recalculee !== e.empreinte) {
        ruptures.push({ rang: e.rang, id: e.id, motif: 'EMPREINTE_INVALIDE' });
      }
      // On repart de l'empreinte STOCKÉE et non de la recalculée · sinon une
      // seule retouche ferait paraître falsifiés tous les maillons suivants,
      // et noierait le vrai point de rupture.
      attendue = e.empreinte;
      rangAttendu = e.rang + 1;
    }
    ecrireAttendue(attendue);
    ecrireRangAttendu(rangAttendu);
  }
}
