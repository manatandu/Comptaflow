import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { StatutExoneration, TypeDemandeExoneration } from '@prisma/client';
import {
  AVERTISSEMENT_FRANCHISE,
  FRANCHISES_DOUANIERES_EBNL,
  JOURS_ALERTE_RENOUVELLEMENT,
  MODELES_DEMANDE,
} from './correspondance-exonerations';
import { ajouterMois } from '../../common/ajouter-mois';

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

/**
 * UN ARRÊTÉ ACCORDÉ SE DIT PAR SA RÉFÉRENCE ET SES DATES (audit final F123).
 * L'arrêté est le seul titre (loi n° 004/2001, art. 39), et un dossier porté
 * « accordé » sans référence ni date ne se présente pas au port. Pour un
 * arrêté à durée (prévisionnel, renouvellement), le début de validité est
 * exigé aussi · c'est de lui que la fin se déduit, et sans fin l'alerte de
 * renouvellement ne s'arme jamais.
 */
export function motifRefusAccorde(d: {
  referenceArrete: string | null;
  dateArrete: Date | null;
  dateDebutValidite: Date | null;
  validiteMois: number | null;
}): string | null {
  const manques = [
    !d.referenceArrete?.trim() ? 'la référence de l’arrêté' : null,
    !d.dateArrete ? 'la date de l’arrêté' : null,
    d.validiteMois && !d.dateDebutValidite ? 'le début de validité' : null,
  ].filter((m): m is string => m !== null);
  return manques.length === 0
    ? null
    : `Un dossier ACCORDÉ se dit par son arrêté · il manque ${manques.join(', ')} (loi n° 004/2001, art. 39).`;
}

/**
 * REGISTRE DES EXONÉRATIONS · ce que le logiciel surveille ici, et pourquoi.
 *
 * Il ne calcule aucun droit de douane et n'accorde aucune franchise · l'arrêté
 * interministériel du Plan et des Finances est le seul titre (loi n° 004/2001,
 * art. 39 ; code des douanes, art. 338). Il tient trois choses qu'une ASBL
 * suit d'ordinaire sur un carnet, et perd :
 *
 *  1. LES PIÈCES. La note circulaire n° 003/2013 en exige treize pour un
 *     arrêté ponctuel, onze pour un prévisionnel, quatre pour un
 *     renouvellement. Un dossier déposé incomplet revient, et le retour coûte
 *     des semaines de magasinage au port.
 *  2. L'ÉCHÉANCE. Un arrêté prévisionnel vaut deux ans. Périmé, il se découvre
 *     au port, la marchandise déjà débarquée.
 *  3. LE STATUT. Tant qu'un dossier n'est pas ACCORDÉ, il n'y a pas de titre,
 *     donc pas d'exonération · l'importation faite « en attendant l'arrêté »
 *     est une importation taxable.
 */
@Injectable()
export class ExonerationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Le référentiel seul · listes de pièces et cas de franchise, sans données. */
  referentiel() {
    return {
      modeles: MODELES_DEMANDE,
      franchisesDouanieres: FRANCHISES_DOUANIERES_EBNL,
      joursAlerteRenouvellement: JOURS_ALERTE_RENOUVELLEMENT,
      avertissement: AVERTISSEMENT_FRANCHISE,
    };
  }

  /**
   * Un dossier enrichi de ce que le registre sait en déduire : les pièces
   * manquantes, et le compte à rebours de validité. Les deux sont calculés
   * et jamais stockés · une date d'expiration figée en base serait fausse le
   * lendemain, et « il reste 12 jours » stocké est faux à la seconde près.
   */
  private enrichir(dossier: {
    type: TypeDemandeExoneration;
    statut: StatutExoneration;
    dateFinValidite: Date | null;
    piecesFournies: string[];
  }, aujourdhui: Date) {
    const modele = MODELES_DEMANDE.find((m) => m.type === dossier.type)!;
    const fournies = new Set(dossier.piecesFournies);
    const pieces = modele.pieces.map((p) => ({ ...p, fournie: fournies.has(p.cle) }));
    // Les pièces CONDITIONNELLES ne comptent pas comme manquantes : elles ne
    // s'appliquent qu'à certains dossiers (produits pharmaceutiques, ONG
    // internationale), et le logiciel ne sait pas lequel est le vôtre. Les
    // compter ferait afficher « dossier incomplet » à un dossier complet, ce
    // qui apprend vite à ignorer l'indicateur.
    const manquantes = pieces.filter((p) => !p.fournie && !p.conditionnelle);
    const conditionnellesAVerifier = pieces.filter((p) => !p.fournie && p.conditionnelle);

    let joursAvantExpiration: number | null = null;
    let alerte: 'EXPIRE' | 'A_RENOUVELER' | null = null;
    if (dossier.dateFinValidite && dossier.statut === StatutExoneration.ACCORDE) {
      joursAvantExpiration = Math.ceil((dossier.dateFinValidite.getTime() - aujourdhui.getTime()) / MS_PAR_JOUR);
      if (joursAvantExpiration < 0) alerte = 'EXPIRE';
      else if (joursAvantExpiration <= JOURS_ALERTE_RENOUVELLEMENT) alerte = 'A_RENOUVELER';
    }

    return {
      modele: { libelle: modele.libelle, objet: modele.objet, baseLegale: modele.baseLegale, validiteMois: modele.validiteMois },
      pieces,
      nombrePiecesFournies: pieces.filter((p) => p.fournie).length,
      nombrePiecesRequises: modele.pieces.filter((p) => !p.conditionnelle).length,
      piecesManquantes: manquantes.map((p) => p.libelle),
      conditionnellesAVerifier: conditionnellesAVerifier.map((p) => ({ libelle: p.libelle, condition: p.conditionnelle! })),
      complet: manquantes.length === 0,
      joursAvantExpiration,
      alerte,
    };
  }

  async lister(tenantId: string, dateReference?: string) {
    const aujourdhui = dateReference ? new Date(dateReference) : new Date();
    const dossiers = await this.prisma.exoneration.findMany({
      where: { tenantId },
      orderBy: [{ dateFinValidite: 'asc' }, { createdAt: 'desc' }],
    });
    const enrichis = dossiers.map((d) => ({
      ...d,
      valeurBiens: d.valeurBiens === null ? null : Number(d.valeurBiens),
      ...this.enrichir(d, aujourdhui),
    }));
    return {
      dateReference: aujourdhui,
      dossiers: enrichis,
      // Ce qui doit sauter aux yeux : les titres périmés et ceux qui vont
      // l'être. Le reste du registre est de la consultation.
      aRenouveler: enrichis.filter((d) => d.alerte === 'A_RENOUVELER').length,
      expires: enrichis.filter((d) => d.alerte === 'EXPIRE').length,
      incomplets: enrichis.filter((d) => !d.complet && d.statut === StatutExoneration.EN_PREPARATION).length,
      avertissement: AVERTISSEMENT_FRANCHISE,
    };
  }

  async creer(
    tenantId: string,
    userId: string,
    dto: {
      type: TypeDemandeExoneration;
      objet: string;
      statut?: StatutExoneration;
      referenceArrete?: string;
      dateArrete?: string;
      dateDebutValidite?: string;
      dateFinValidite?: string;
      lettreTransport?: string;
      valeurBiens?: number;
      franchiseDouaniere?: string;
      piecesFournies?: string[];
      observations?: string;
    },
  ) {
    const modele = MODELES_DEMANDE.find((m) => m.type === dto.type)!;
    // Validité déduite quand elle n'est pas donnée · deux ans à compter du
    // début, pour les types qui en ont une. La calculer évite la faute de
    // saisie la plus coûteuse du registre : une date de fin inventée, qui
    // ferait manquer le renouvellement.
    let dateFin = dto.dateFinValidite ? new Date(dto.dateFinValidite) : null;
    if (!dateFin && dto.dateDebutValidite && modele.validiteMois) {
      // Borné à la fin du mois (audit final F8) · un début au 31 décembre
      // ne fait pas finir la validité au 1er mars suivant.
      dateFin = ajouterMois(new Date(dto.dateDebutValidite), modele.validiteMois);
    }
    if (dto.statut === StatutExoneration.ACCORDE) {
      const refus = motifRefusAccorde({
        referenceArrete: dto.referenceArrete ?? null,
        dateArrete: dto.dateArrete ? new Date(dto.dateArrete) : null,
        dateDebutValidite: dto.dateDebutValidite ? new Date(dto.dateDebutValidite) : null,
        validiteMois: modele.validiteMois,
      });
      if (refus) throw new BadRequestException(refus);
    }
    return this.prisma.exoneration.create({
      data: {
        tenantId,
        createdBy: userId,
        type: dto.type,
        objet: dto.objet,
        statut: dto.statut ?? StatutExoneration.EN_PREPARATION,
        referenceArrete: dto.referenceArrete ?? null,
        dateArrete: dto.dateArrete ? new Date(dto.dateArrete) : null,
        dateDebutValidite: dto.dateDebutValidite ? new Date(dto.dateDebutValidite) : null,
        dateFinValidite: dateFin,
        lettreTransport: dto.lettreTransport ?? null,
        valeurBiens: dto.valeurBiens ?? null,
        franchiseDouaniere: dto.franchiseDouaniere ?? null,
        piecesFournies: dto.piecesFournies ?? [],
        observations: dto.observations ?? null,
      },
    });
  }

  async modifier(tenantId: string, id: string, dto: Record<string, unknown>) {
    const existant = await this.prisma.exoneration.findFirst({ where: { id, tenantId } });
    if (!existant) throw new NotFoundException('Dossier d’exonération introuvable');
    const dates = ['dateArrete', 'dateDebutValidite', 'dateFinValidite'] as const;
    const data: Record<string, unknown> = {};
    for (const [cle, valeur] of Object.entries(dto)) {
      if (valeur === undefined) continue;
      data[cle] = dates.includes(cle as (typeof dates)[number]) && valeur ? new Date(valeur as string) : valeur;
    }
    const modele = MODELES_DEMANDE.find((m) => m.type === existant.type)!;
    const apres = { ...existant, ...data } as typeof existant;
    // LA FIN SE DÉDUIT AUSSI À LA MODIFICATION (audit final F123) · un début
    // posé au passage à ACCORDÉ ne l'armait jamais, et l'alerte de
    // renouvellement restait muette. Une fin saisie à la main prime.
    if (modele.validiteMois && apres.dateDebutValidite && data.dateFinValidite === undefined && (data.dateDebutValidite !== undefined || !existant.dateFinValidite)) {
      data.dateFinValidite = ajouterMois(apres.dateDebutValidite, modele.validiteMois);
    }
    // Contrôlé au passage à ACCORDÉ et quand l'arrêté d'un dossier accordé se
    // retouche · jamais sur une simple pièce cochée, qui ne dit rien du titre.
    const toucheLArrete = ['referenceArrete', 'dateArrete', 'dateDebutValidite'].some((c) => c in data);
    if (data.statut === StatutExoneration.ACCORDE || (apres.statut === StatutExoneration.ACCORDE && toucheLArrete)) {
      const refus = motifRefusAccorde({
        referenceArrete: apres.referenceArrete,
        dateArrete: apres.dateArrete,
        dateDebutValidite: apres.dateDebutValidite,
        validiteMois: modele.validiteMois,
      });
      if (refus) throw new BadRequestException(refus);
    }
    return this.prisma.exoneration.update({ where: { id }, data });
  }

  async supprimer(tenantId: string, id: string) {
    const existant = await this.prisma.exoneration.findFirst({ where: { id, tenantId } });
    if (!existant) throw new NotFoundException('Dossier d’exonération introuvable');
    await this.prisma.exoneration.delete({ where: { id } });
    return { supprime: true };
  }
}
