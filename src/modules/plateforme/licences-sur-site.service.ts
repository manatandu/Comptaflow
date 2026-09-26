import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createPublicKey } from 'crypto';
import { PrismaService } from '../../common/prisma.service';
import { CLE_PUBLIQUE_EDITEUR } from '../sur-site/cle-publique-editeur';
import { ContenuLicence, FORMAT_LICENCE, motifRefusContenu, signerLicence, verifierLicence } from '../sur-site/licence-signee';

export interface DemandeLicence {
  titulaire: string;
  empreinteMachine: string;
  finMaintenance: string;
  expiration: string | null;
  dossiersMax: number;
}

/** Le jour du calendrier de Kinshasa (UTC+1) · c'est la date que le client lira sur sa licence. */
export function jourKinshasa(d = new Date()): string {
  return new Date(d.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Le numéro suivant de l'année · continu, jamais réutilisé, la contrainte d'unicité tranchant une course. */
export function numeroSuivant(annee: string, numerosDeLAnnee: string[]): string {
  const prefixe = `OMX-${annee}-`;
  const max = numerosDeLAnnee
    .filter((n) => n.startsWith(prefixe))
    .map((n) => Number.parseInt(n.slice(prefixe.length), 10))
    .filter(Number.isInteger)
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefixe}${String(max + 1).padStart(4, '0')}`;
}

/**
 * L'ÉMISSION DES LICENCES SUR SITE, depuis la console de l'opérateur.
 *
 * La clé PRIVÉE arrive par l'environnement du service (`CLE_PRIVEE_LICENCE`,
 * posée par le déploiement depuis le secret `API_CLE_PRIVEE_LICENCE`) et
 * n'est lue qu'ici. Avant d'enregistrer quoi que ce soit, le fichier signé
 * est VÉRIFIÉ avec la clé publique que porte le code, par le même moteur que
 * le poste du client · une clé privée qui ne correspond pas à la clé publique
 * produirait des licences que tous les postes refuseraient, et on ne
 * l'apprendrait que chez le client.
 */
@Injectable()
export class LicencesSurSiteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly clePublique: string | null = CLE_PUBLIQUE_EDITEUR,
  ) {}

  lister() {
    return this.prisma.licenceSurSiteEmise.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true,
        numero: true,
        titulaire: true,
        empreinteMachine: true,
        emiseLe: true,
        finMaintenance: true,
        expiration: true,
        dossiersMax: true,
        emisePar: true,
        createdAt: true,
      },
    });
  }

  async fichier(id: string) {
    const l = await this.prisma.licenceSurSiteEmise.findUnique({ where: { id }, select: { numero: true, fichier: true } });
    if (!l) throw new NotFoundException('Licence introuvable.');
    return l;
  }

  async emettre(demande: DemandeLicence, operateur: string, maintenant = new Date()) {
    const clePrivee = this.env.CLE_PRIVEE_LICENCE?.replace(/\\n/g, '\n').trim();
    if (!clePrivee) {
      throw new BadRequestException('La clé privée de signature n’est pas posée sur ce serveur (secret API_CLE_PRIVEE_LICENCE) · aucune licence ne peut être émise.');
    }
    if (!this.clePublique) {
      throw new BadRequestException('Cette version ne porte pas la clé publique de VMG · une licence émise ne pourrait être vérifiée nulle part.');
    }
    const emiseLe = jourKinshasa(maintenant);
    const annee = emiseLe.slice(0, 4);
    const deLAnnee = await this.prisma.licenceSurSiteEmise.findMany({
      where: { numero: { startsWith: `OMX-${annee}-` } },
      select: { numero: true },
    });
    const contenu: ContenuLicence = {
      format: FORMAT_LICENCE,
      numero: numeroSuivant(annee, deLAnnee.map((l) => l.numero)),
      titulaire: demande.titulaire.trim(),
      empreinteMachine: demande.empreinteMachine.trim().toLowerCase(),
      emiseLe,
      finMaintenance: demande.finMaintenance,
      expiration: demande.expiration || null,
      dossiersMax: demande.dossiersMax,
    };
    const motif = motifRefusContenu(contenu);
    if (motif) throw new BadRequestException(`Licence irrecevable · ${motif}.`);

    let texte: string;
    try {
      createPublicKey(this.clePublique);
      texte = JSON.stringify(signerLicence(contenu, clePrivee), null, 2);
    } catch (e) {
      throw new BadRequestException(`La signature a échoué · ${(e as Error).message}`);
    }
    const controle = verifierLicence(texte, {
      clePubliquePem: this.clePublique,
      empreinte: contenu.empreinteMachine,
      aujourdhui: emiseLe,
      horlogeMax: null,
      dateVersion: emiseLe,
    });
    if (controle.statut === 'SIGNATURE_INVALIDE') {
      throw new BadRequestException('La clé privée posée sur ce serveur ne correspond pas à la clé publique du logiciel · la licence serait refusée par tous les postes. Rien n’a été enregistré.');
    }
    if (controle.statut !== 'VALIDE') {
      throw new BadRequestException(controle.motif ?? `Licence refusée au contrôle · ${controle.statut}`);
    }

    return this.prisma.licenceSurSiteEmise.create({
      data: {
        numero: contenu.numero,
        titulaire: contenu.titulaire,
        empreinteMachine: contenu.empreinteMachine,
        emiseLe: contenu.emiseLe,
        finMaintenance: contenu.finMaintenance,
        expiration: contenu.expiration,
        dossiersMax: contenu.dossiersMax,
        fichier: texte,
        emisePar: operateur,
      },
      select: { id: true, numero: true, fichier: true },
    });
  }
}
