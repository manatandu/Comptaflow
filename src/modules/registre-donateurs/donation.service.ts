import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Donation, ModeLiberation, Prisma, TypeDonateur } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { chargerLignes, correspond, LigneBalancePourEtat } from '../etats-financiers/etats-financiers.communs';
import {
  COMPTES_FRONTIERE,
  COMPTES_HORS_PERIMETRE,
  COMPTES_LIBERALITE,
  CompteLiberalite,
} from './correspondance-registre';
import {
  AnnulerDonationDto,
  FiltreRegistreDto,
  InscrireDonationDto,
  ModifierDonationDto,
  SignerDonationDto,
} from './dto/donation.dto';

/** Tolérance de comparaison sur des montants en centimes (Decimal(18,2)). */
const EPSILON = 0.005;

/**
 * Les `Decimal` de Prisma sérialisent en CHAÎNES sur le JSON de réponse.
 * Même discipline que `ImmobilisationService.versImmobilisation` : convertir
 * ici, une fois, plutôt que laisser un `"1000" + "500" = "1000500"` se
 * produire dans un total côté écran.
 */
function versDonation<T extends { montant: unknown }>(d: T) {
  return { ...d, montant: Number(d.montant) };
}

/** Une mention de l'article 17 absente d'une ligne du registre. */
export interface ManquementArticle17 {
  champ: string;
  exigence: string;
}

export interface LigneNonConforme {
  id: string;
  numero: number;
  dateOperation: Date;
  manquements: ManquementArticle17[];
}

export interface MontantCompteLiberalite extends CompteLiberalite {
  montant: number;
  /** Comptes réels du dossier rattachés à ce préfixe · permet le pointage. */
  comptes: { numero: string; intitule: string; montant: number }[];
}

/**
 * REGISTRE DES DONATEURS · articles 17, 18 et 24 de l'Acte uniforme SYCEBNL
 * (Niamey, 22 décembre 2022), ancré au skill `sycebnl`.
 *
 * Trois garanties de ce service découlent directement du texte, et d'aucune
 * autre considération :
 *
 *  1. NUMÉROTATION CONTINUE · art. 17 : le registre est « coté, paraphé et
 *     numéroté de façon continue ». Le numéro est attribué ici (jamais par le
 *     client), sans trou et sans réemploi.
 *  2. PAS DE SUPPRESSION · corollaire du même alinéa : effacer une ligne
 *     ouvrirait un trou dans la numérotation. Une erreur s'ANNULE avec motif,
 *     en conservant son numéro · exactement comme une écriture comptable se
 *     contre-passe au lieu de disparaître.
 *  3. RAPPORT DE CONFORMITÉ · art. 18 : l'auditeur « constate l'existence du
 *     registre des donateurs et donne son avis sur sa tenue conforme » ; à
 *     défaut d'auditeur, « une déclaration des dirigeants attestant de la
 *     tenue conforme » est annexée. `rapportConformite()` produit les
 *     constatations sur lesquelles cet avis ou cette déclaration se fonde.
 *
 * L'enjeu n'est pas documentaire : l'ARTICLE 24 sanctionne PÉNALEMENT les
 * dirigeants « qui n'ont pas tenu et mis à jour le registre des donateurs ».
 */
@Injectable()
export class DonationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritureService: EcritureService,
  ) {}

  // -------------------------------------------------------------------------
  // Tenue du registre
  // -------------------------------------------------------------------------

  async lister(tenantId: string, filtre: FiltreRegistreDto = {}) {
    const where: Prisma.DonationWhereInput = { tenantId };

    if (filtre.exerciceId) {
      const exercice = await this.exercice(tenantId, filtre.exerciceId);
      where.dateOperation = { gte: exercice.dateDebut, lte: exercice.dateFin };
    }
    if (filtre.masquerAnnulees) where.annulee = false;
    if (filtre.recherche?.trim()) {
      const q = filtre.recherche.trim();
      where.OR = [
        { nom: { contains: q, mode: 'insensitive' } },
        { prenoms: { contains: q, mode: 'insensitive' } },
        { denomination: { contains: q, mode: 'insensitive' } },
        { numeroImmatriculation: { contains: q, mode: 'insensitive' } },
        { numeroIdentificationFiscale: { contains: q, mode: 'insensitive' } },
      ];
    }

    const lignes = await this.prisma.donation.findMany({
      where,
      // Ordre du registre = ordre de sa numérotation, jamais la date : c'est
      // la numérotation continue qui fait foi (art. 17), et deux lignes
      // peuvent porter la même date.
      orderBy: { numero: 'asc' },
      include: { ecriture: { select: { id: true, date: true, libelle: true, numeroPiece: true } } },
    });
    return lignes.map(versDonation);
  }

  /**
   * Inscrit une libéralité et lui attribue le numéro suivant.
   *
   * Le numéro est calculé puis écrit dans une même transaction, et la
   * contrainte `@@unique([tenantId, numero])` fait le reste : si deux
   * inscriptions concurrentes calculent le même `max + 1`, la seconde échoue
   * en P2002 et rejoue. Sans ce filet, deux dons simultanés partageraient un
   * numéro · le registre cesserait d'être « numéroté de façon continue »
   * (art. 17) au moment précis où il est le plus sollicité (une collecte).
   */
  async inscrire(tenantId: string, userId: string, dto: InscrireDonationDto) {
    this.verifierCoherenceDonateur(dto);
    if (dto.ecritureId) {
      const ecriture = await this.prisma.ecriture.findFirst({ where: { id: dto.ecritureId, tenantId } });
      if (!ecriture) throw new BadRequestException('Écriture introuvable pour ce dossier (ecritureId).');
    }

    const TENTATIVES = 5;
    for (let essai = 1; essai <= TENTATIVES; essai++) {
      try {
        const cree = await this.prisma.$transaction(async (tx) => {
          const dernier = await tx.donation.findFirst({
            where: { tenantId },
            orderBy: { numero: 'desc' },
            select: { numero: true },
          });
          return tx.donation.create({
            data: {
              tenantId,
              // Le registre commence à 1, pas à 0 : c'est un numéro d'ordre
              // destiné à être lu, pas un index technique.
              numero: (dernier?.numero ?? 0) + 1,
              dateOperation: new Date(dto.dateOperation),
              nature: dto.nature,
              typeDonateur: dto.typeDonateur,
              nom: dto.nom ?? null,
              prenoms: dto.prenoms ?? null,
              domicile: dto.domicile ?? null,
              denomination: dto.denomination ?? null,
              numeroImmatriculation: dto.numeroImmatriculation ?? null,
              numeroIdentificationFiscale: dto.numeroIdentificationFiscale ?? null,
              adresseSiegeSocial: dto.adresseSiegeSocial ?? null,
              adresseElectronique: dto.adresseElectronique ?? null,
              montant: new Prisma.Decimal(dto.montant),
              modeLiberation: dto.modeLiberation,
              designationNature: dto.designationNature ?? null,
              ecritureId: dto.ecritureId ?? null,
              createdBy: userId,
            },
          });
        });
        return versDonation(cree);
      } catch (err) {
        const collision = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
        if (!collision || essai === TENTATIVES) throw err;
      }
    }
    // Inatteignable : la boucle sort par `return` ou par `throw`.
    throw new ConflictException("Numérotation du registre indisponible, réessayez l'inscription.");
  }

  /**
   * Corrige les mentions descriptives d'une ligne. Le numéro, la date, le
   * montant, la nature et le mode de libération n'y sont PAS modifiables :
   * ce sont les données que l'article 17 érige en contenu du registre et que
   * la signature du représentant légal couvre. Les corriger reviendrait à
   * réécrire une ligne déjà signée · on annule et on réinscrit.
   */
  async modifier(tenantId: string, id: string, dto: ModifierDonationDto) {
    const ligne = await this.ligne(tenantId, id);
    if (ligne.annulee) throw new BadRequestException('Cette ligne est annulée : elle ne peut plus être modifiée.');
    if (ligne.signeeLe) {
      throw new BadRequestException(
        'Cette ligne est signée par le représentant légal (art. 17) : la corriger sans annulation reviendrait à modifier une écriture déjà signée. Annulez-la et réinscrivez-la.',
      );
    }
    if (dto.ecritureId) {
      const ecriture = await this.prisma.ecriture.findFirst({ where: { id: dto.ecritureId, tenantId } });
      if (!ecriture) throw new BadRequestException('Écriture introuvable pour ce dossier (ecritureId).');
    }
    // Cohérence vérifiée sur la ligne TELLE QU'ELLE SERA, pas telle qu'elle
    // est : `dto` est partiel, et valider après l'`update` laisserait la base
    // dans l'état incohérent que l'exception prétend avoir refusé.
    this.verifierCoherenceDonateur({ ...ligne, ...dto });
    const maj = await this.prisma.donation.update({ where: { id }, data: { ...dto } });
    return versDonation(maj);
  }

  /**
   * Art. 17 : « Toutes les écritures contenues dans ce registre doivent être
   * signées par le représentant légal de l'entité à but non lucratif. »
   */
  async signer(tenantId: string, id: string, dto: SignerDonationDto) {
    const ligne = await this.ligne(tenantId, id);
    if (ligne.annulee) throw new BadRequestException('Une ligne annulée n’a pas à être signée.');
    const maj = await this.prisma.donation.update({
      where: { id },
      data: { signeePar: dto.signeePar.trim(), signeeLe: new Date() },
    });
    return versDonation(maj);
  }

  /**
   * Annule une ligne SANS la supprimer ni libérer son numéro : la
   * numérotation doit rester continue (art. 17). Le montant annulé sort du
   * rapprochement comptable mais la ligne reste lisible au registre, motif
   * compris.
   */
  async annuler(tenantId: string, id: string, dto: AnnulerDonationDto) {
    const ligne = await this.ligne(tenantId, id);
    if (ligne.annulee) throw new BadRequestException('Cette ligne est déjà annulée.');
    const maj = await this.prisma.donation.update({
      where: { id },
      data: { annulee: true, motifAnnulation: dto.motifAnnulation.trim(), annuleeLe: new Date() },
    });
    return versDonation(maj);
  }

  // -------------------------------------------------------------------------
  // Article 18 · rapport de conformité
  // -------------------------------------------------------------------------

  /**
   * Constatations de l'article 18, sur un exercice donné.
   *
   * Le rapport ne conclut pas à la place de l'auditeur (ni des dirigeants) :
   * il expose ce qui se constate · existence, continuité, signature,
   * complétude, rapprochement · et laisse l'avis à qui le signe. C'est la
   * lettre de l'article 18, qui demande un rapport « qui constate » et
   * « donne son avis ».
   */
  async rapportConformite(tenantId: string, exerciceId: string) {
    const exercice = await this.exercice(tenantId, exerciceId);

    const [toutes, lignesBalance] = await Promise.all([
      this.prisma.donation.findMany({ where: { tenantId }, orderBy: { numero: 'asc' } }),
      chargerLignes(this.ecritureService, tenantId, exerciceId),
    ]);

    const surExercice = toutes.filter(
      (d) => d.dateOperation >= exercice.dateDebut && d.dateOperation <= exercice.dateFin,
    );
    const actives = surExercice.filter((d) => !d.annulee);

    const totalRegistre = actives.reduce((s, d) => s + Number(d.montant), 0);
    const liberalites = COMPTES_LIBERALITE.map((c) => this.montantDuCompte(c, lignesBalance));
    const totalComptable = liberalites.reduce((s, c) => s + c.montant, 0);
    const ecart = totalComptable - totalRegistre;

    return {
      exercice: { id: exercice.id, dateDebut: exercice.dateDebut, dateFin: exercice.dateFin },

      /**
       * Art. 18 : le rapport « constate l'existence du registre ». Un
       * registre vide sur l'exercice N'EST PAS un registre inexistant si le
       * dossier a inscrit des libéralités sur d'autres exercices · d'où les
       * deux constatations distinctes.
       */
      existence: {
        registreOuvert: toutes.length > 0,
        lignesTotalRegistre: toutes.length,
        lignesSurExercice: surExercice.length,
        lignesAnnuleesSurExercice: surExercice.length - actives.length,
      },

      numerotation: this.constaterNumerotation(toutes),

      /** Art. 17 : « Toutes les écritures […] doivent être signées ». */
      signature: {
        exigence:
          'Art. 17 : « Toutes les écritures contenues dans ce registre doivent être signées par le représentant légal de l’entité à but non lucratif. »',
        lignesNonSignees: actives
          .filter((d) => !d.signeeLe)
          .map((d) => ({ id: d.id, numero: d.numero, dateOperation: d.dateOperation, montant: Number(d.montant) })),
      },

      /** Art. 17, points 1 à 4 : contenu obligatoire, ligne par ligne. */
      completude: {
        lignesIncompletes: actives
          .map((d) => ({
            id: d.id,
            numero: d.numero,
            dateOperation: d.dateOperation,
            manquements: manquementsArticle17(d),
          }))
          .filter((l) => l.manquements.length > 0) as LigneNonConforme[],
      },

      rapprochement: {
        totalRegistre,
        totalComptable,
        ecart,
        rapproche: Math.abs(ecart) < EPSILON,
        /**
         * Le sens de l'écart se lit, il ne se devine pas : un écart POSITIF
         * dit qu'il existe des libéralités comptabilisées qui ne sont pas au
         * registre (le manquement visé par l'art. 24) ; un écart NÉGATIF dit
         * l'inverse · des libéralités inscrites sans trace comptable, ce qui
         * met en cause la comptabilité, pas le registre.
         */
        lecture:
          Math.abs(ecart) < EPSILON
            ? 'Le total du registre égale le total comptabilisé sur les comptes de libéralité de l’exercice.'
            : ecart > 0
              ? 'Des libéralités sont comptabilisées sans être inscrites au registre (art. 24 : défaut de tenue et de mise à jour).'
              : 'Des libéralités sont inscrites au registre sans contrepartie comptable sur l’exercice.',
        comptesLiberalite: liberalites,
        /** Chiffrés mais NI ajoutés NI retranchés · voir correspondance-registre.ts. */
        comptesFrontiere: COMPTES_FRONTIERE.map((c) => this.montantDuCompte(c, lignesBalance)),
        comptesHorsPerimetre: COMPTES_HORS_PERIMETRE.map((c) => this.montantDuCompte(c, lignesBalance)),
        avertissement:
          'Aucun tableau de correspondance officiel n’existe entre le registre des donateurs et le plan des comptes : le périmètre retenu est construit compte par compte à partir des définitions du référentiel, citées dans chaque ligne. Les comptes « frontière » ne sont pas rapprochés · le texte ne tranche pas s’ils relèvent de l’art. 17.',
      },
    };
  }

  // -------------------------------------------------------------------------
  // Internes
  // -------------------------------------------------------------------------

  /**
   * Constate la continuité exigée par l'art. 17. Le service ne peut pas
   * produire de trou lui-même (il n'efface jamais et incrémente toujours) ·
   * la vérification vise les registres repris d'un autre outil, les imports
   * et toute intervention directe en base. Un contrôle qui ne vérifie que ce
   * qu'il a lui-même écrit ne contrôle rien.
   */
  private constaterNumerotation(toutes: Donation[]) {
    const numeros = toutes.map((d) => d.numero).sort((a, b) => a - b);
    const trous: number[] = [];
    const doublons: number[] = [];
    for (let attendu = 1; attendu <= (numeros.at(-1) ?? 0); attendu++) {
      const occurrences = numeros.filter((n) => n === attendu).length;
      if (occurrences === 0) trous.push(attendu);
      if (occurrences > 1) doublons.push(attendu);
    }
    return {
      exigence:
        'Art. 17 : « Le registre des donateurs est coté, paraphé et numéroté de façon continue par la juridiction compétente de chaque État partie concerné. »',
      premier: numeros[0] ?? null,
      dernier: numeros.at(-1) ?? null,
      trous,
      doublons,
      continue: trous.length === 0 && doublons.length === 0,
    };
  }

  /** Agrège les comptes réels du dossier rattachés à un préfixe du périmètre. */
  private montantDuCompte(spec: CompteLiberalite, lignes: LigneBalancePourEtat[]): MontantCompteLiberalite {
    const comptes = lignes
      .filter((l) => correspond(l.numero, [spec.numero]))
      .map((l) => ({
        numero: l.numero,
        intitule: l.intitule,
        montant: spec.lecture === 'CREDIT_SEUL' ? l.mouvementCredit : l.mouvementCredit - l.mouvementDebit,
      }))
      .filter((c) => c.montant !== 0);
    return { ...spec, comptes, montant: comptes.reduce((s, c) => s + c.montant, 0) };
  }

  private async ligne(tenantId: string, id: string) {
    const ligne = await this.prisma.donation.findFirst({ where: { id, tenantId } });
    if (!ligne) throw new NotFoundException('Ligne de registre introuvable pour ce dossier.');
    return ligne;
  }

  private async exercice(tenantId: string, exerciceId: string) {
    const exercice = await this.prisma.exercice.findFirst({ where: { id: exerciceId, tenantId } });
    if (!exercice) throw new NotFoundException('Exercice introuvable pour ce dossier.');
    return exercice;
  }

  /**
   * Refuse les combinaisons INCOHÉRENTES, pas les combinaisons incomplètes :
   * l'article 17 prévoit deux jeux d'identifiants distincts (point 2 pour les
   * personnes physiques, point 3 pour les personnes morales) · un NIF sur une
   * personne physique, ou des prénoms sur une personne morale, ne sont pas
   * des mentions manquantes, ce sont des mentions du mauvais registre. Les
   * mentions simplement absentes relèvent du rapport de conformité, pas d'un
   * refus de saisie (voir l'en-tête de `InscrireDonationDto`).
   */
  private verifierCoherenceDonateur(d: {
    typeDonateur: TypeDonateur;
    nom?: string | null;
    prenoms?: string | null;
    domicile?: string | null;
    denomination?: string | null;
    numeroImmatriculation?: string | null;
    numeroIdentificationFiscale?: string | null;
    adresseSiegeSocial?: string | null;
    modeLiberation: ModeLiberation;
    designationNature?: string | null;
  }) {
    const champsMorale = ['denomination', 'numeroImmatriculation', 'numeroIdentificationFiscale', 'adresseSiegeSocial'] as const;
    const champsPhysique = ['nom', 'prenoms', 'domicile'] as const;

    if (d.typeDonateur === TypeDonateur.PERSONNE_PHYSIQUE) {
      const intrus = champsMorale.filter((c) => d[c]);
      if (intrus.length > 0) {
        throw new BadRequestException(
          `Donateur personne physique : ${intrus.join(', ')} relève des personnes morales (art. 17, point 3).`,
        );
      }
      if (!d.nom?.trim()) {
        throw new BadRequestException('Le nom du donateur est requis (art. 17, point 2) : un registre des donateurs nomme ses donateurs.');
      }
    } else {
      const intrus = champsPhysique.filter((c) => d[c]);
      if (intrus.length > 0) {
        throw new BadRequestException(
          `Donateur personne morale : ${intrus.join(', ')} relève des personnes physiques (art. 17, point 2).`,
        );
      }
      if (!d.denomination?.trim()) {
        throw new BadRequestException('La dénomination du donateur est requise (art. 17, point 3).');
      }
    }

    // Art. 17, point 4 : le mode de libération « en nature » n'a de sens que
    // si le bien est désigné · un montant seul ne dit pas ce qui a été donné.
    if (d.modeLiberation === ModeLiberation.NATURE && !d.designationNature?.trim()) {
      throw new BadRequestException(
        'Libération en nature (art. 17, point 4) : la désignation du bien reçu est requise, le montant seul ne dit pas ce qui a été donné.',
      );
    }
  }
}

/**
 * Contenu obligatoire de l'article 17, points 1 à 4, confronté à une ligne.
 * Exporté pour être testé et réutilisé par l'export du registre.
 */
export function manquementsArticle17(d: {
  typeDonateur: TypeDonateur;
  nom?: string | null;
  prenoms?: string | null;
  domicile?: string | null;
  adresseElectronique?: string | null;
  denomination?: string | null;
  numeroImmatriculation?: string | null;
  numeroIdentificationFiscale?: string | null;
  adresseSiegeSocial?: string | null;
}): ManquementArticle17[] {
  const manque: ManquementArticle17[] = [];
  const exiger = (valeur: string | null | undefined, champ: string, exigence: string) => {
    if (!valeur?.trim()) manque.push({ champ, exigence });
  };

  if (d.typeDonateur === TypeDonateur.PERSONNE_PHYSIQUE) {
    const point2 =
      'Art. 17, point 2 : « les nom et prénoms, le domicile et l’adresse électronique des personnes physiques donatrices ».';
    exiger(d.nom, 'nom', point2);
    exiger(d.prenoms, 'prenoms', point2);
    exiger(d.domicile, 'domicile', point2);
    exiger(d.adresseElectronique, 'adresseElectronique', point2);
  } else {
    const point3 =
      'Art. 17, point 3 : « la dénomination, le numéro d’immatriculation, le numéro d’identification fiscale, l’adresse du siège social et l’adresse électronique des personnes morales donatrices ».';
    exiger(d.denomination, 'denomination', point3);
    exiger(d.numeroImmatriculation, 'numeroImmatriculation', point3);
    exiger(d.numeroIdentificationFiscale, 'numeroIdentificationFiscale', point3);
    exiger(d.adresseSiegeSocial, 'adresseSiegeSocial', point3);
    exiger(d.adresseElectronique, 'adresseElectronique', point3);
  }
  return manque;
}
