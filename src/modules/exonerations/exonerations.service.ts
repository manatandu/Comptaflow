import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Prisma, StatutExoneration, TypeDemandeExoneration } from '@prisma/client';
import {
  AVERTISSEMENT_FRANCHISE,
  FRANCHISES_DOUANIERES_EBNL,
  JOURS_ALERTE_RENOUVELLEMENT,
  MODELES_DEMANDE,
} from './correspondance-exonerations';
import { ajouterMois } from '../../common/ajouter-mois';
import { lirePeriodeDeListe } from '../../common/periode-de-liste';
import { LOT_LECTURE, lireParLots, pageApres } from '../../common/lecture-par-lots';

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

/**
 * LES DOSSIERS EN ALERTE, EN REQUÊTE (audit final F188) · exactement ceux à
 * qui `enrichir` donne une alerte. L'alerte naît d'un titre ACCORDÉ dont les
 * jours restants, arrondis au jour supérieur, ne dépassent pas le seuil ;
 * un plafond entier ne tient que si la valeur exacte ne le dépasse pas, d'où
 * une fin au plus tard à la date de référence plus le seuil, expirés compris.
 */
export function filtreEnAlerte(aujourdhui: Date): Prisma.ExonerationWhereInput {
  return {
    statut: StatutExoneration.ACCORDE,
    dateFinValidite: { lte: new Date(aujourdhui.getTime() + JOURS_ALERTE_RENOUVELLEMENT * MS_PAR_JOUR) },
  };
}

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

  /**
   * LE REGISTRE À L'ÉCRAN · une période, une tranche qui se dit, et des
   * alertes qui restent celles du registre ENTIER (audit final F188, § 8 bis).
   *
   * LA PÉRIODE PORTE SUR L'OUVERTURE DU DOSSIER (`createdAt`) · c'est la seule
   * date que tout dossier porte, l'arrêté n'en ayant une qu'une fois accordé.
   *
   * MAIS UN TITRE EN ALERTE RESTE LISTÉ QUELLE QUE SOIT LA PÉRIODE. Un arrêté
   * prévisionnel ouvert il y a vingt mois tombe dans quatre, et c'est
   * exactement le dossier que ce registre existe pour montrer · le bandeau le
   * compte sur tout le registre, et une liste qui le tairait désignerait un
   * titre qu'on ne peut pas ouvrir. Même parti que les échéances du tableau de
   * bord, où ce qui presse est retenu hors de l'horizon. L'ordre, inchangé,
   * met d'ailleurs les échéances les plus proches en tête · une tranche pleine
   * coupe d'abord les dossiers sans échéance et les échéances lointaines, et
   * ne coupe un titre en alerte que si plus de `PLAFOND_LISTE_EXONERATIONS`
   * dossiers ont une fin antérieure à la sienne, ce que `tronque` dit alors.
   * Le TOTAL compte ce même périmètre, période et titres en alerte.
   *
   * LES TROIS COMPTEURS SE CALCULENT COMME AVANT, sur tout le registre et par
   * la même règle (`enrichir`), lus par tranches · la complétude dépend de la
   * liste des pièces, qui vit dans le code et non dans la base, et la traduire
   * en requête ferait deux règles pour un seul compte.
   */
  async lister(tenantId: string, dateReference?: string, filtre: { du?: string; au?: string } = {}) {
    // La période se lit avant toute lecture · illisible, elle est refusée.
    const periode = lirePeriodeDeListe(filtre);
    const aujourdhui = dateReference ? new Date(dateReference) : new Date();

    let aRenouveler = 0;
    let expires = 0;
    let incomplets = 0;
    await lireParLots(
      (curseur) =>
        this.prisma.exoneration.findMany({
          where: { tenantId },
          select: { id: true, type: true, statut: true, dateFinValidite: true, piecesFournies: true },
          ...pageApres(curseur, LOT_LECTURE),
        }),
      (d) => {
        // Ce qui doit sauter aux yeux : les titres périmés et ceux qui vont
        // l'être. Le reste du registre est de la consultation.
        const e = this.enrichir(d, aujourdhui);
        if (e.alerte === 'A_RENOUVELER') aRenouveler++;
        if (e.alerte === 'EXPIRE') expires++;
        if (!e.complet && d.statut === StatutExoneration.EN_PREPARATION) incomplets++;
      },
    );

    const perimetre: Prisma.ExonerationWhereInput = periode.bornes
      ? { OR: [{ createdAt: periode.bornes }, filtreEnAlerte(aujourdhui)] }
      : {};
    const [dossiers, total] = await Promise.all([
      this.prisma.exoneration.findMany({
        where: { tenantId, ...perimetre },
        // L'identifiant départage les ex aequo · la frontière d'une tranche
        // pleine ne bouge pas d'un appel à l'autre.
        orderBy: [{ dateFinValidite: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
        take: PLAFOND_LISTE_EXONERATIONS,
      }),
      this.prisma.exoneration.count({ where: { tenantId, ...perimetre } }),
    ]);
    const enrichis = dossiers.map((d) => ({
      ...d,
      valeurBiens: d.valeurBiens === null ? null : Number(d.valeurBiens),
      ...this.enrichir(d, aujourdhui),
    }));
    return {
      dateReference: aujourdhui,
      periode: { du: periode.du, au: periode.au },
      total,
      plafond: PLAFOND_LISTE_EXONERATIONS,
      tronque: total > dossiers.length,
      dossiers: enrichis,
      aRenouveler,
      expires,
      incomplets,
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

/** Plafond d'une tranche du registre à l'écran · une fenêtre, pas un export (§ 8 bis, audit final F188). */
export const PLAFOND_LISTE_EXONERATIONS = 500;
