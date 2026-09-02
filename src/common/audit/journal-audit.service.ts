import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { calculerEmpreinte, EMPREINTE_ORIGINE } from './empreinte-audit';

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
   */
  async verifier(tenantId: string | null): Promise<VerdictChaine> {
    const evenements = await this.prisma.evenementAudit.findMany({
      where: { tenantId },
      orderBy: { rang: 'asc' },
    });

    const ruptures: RuptureChaine[] = [];
    let attendue = EMPREINTE_ORIGINE;
    let rangAttendu = 1;

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

    return { evenements: evenements.length, intacte: ruptures.length === 0, ruptures };
  }
}
