import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, Referentiel } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EnregistrerManuelDto } from './dto/manuel-procedures.dto';

/**
 * MANUEL DES PROCÉDURES ET DE L'ORGANISATION COMPTABLES · le quatrième
 * document obligatoire, et le seul qui n'avait aucune place dans le logiciel.
 *
 * AUDCIF, article 16, alinéa premier · « pour maintenir la continuité dans le
 * temps de l'accès à l'information, TOUTE ENTITÉ ÉTABLIT UN MANUEL décrivant
 * les procédures et l'organisation comptables. Ce manuel, MIS À JOUR
 * PÉRIODIQUEMENT, est destiné à garantir le caractère définitif de
 * l'enregistrement des mouvements. Il est CONSERVÉ AUSSI LONGTEMPS qu'est
 * exigée la présentation des états financiers successifs auxquels il se
 * rapporte. »
 *
 * L'article 17, 3° en fait la référence du classement : les pièces sont
 * « conservées, classées dans un ordre défini dans le manuel décrivant les
 * procédures et l'organisation comptables ». Sans manuel, cet ordre n'existe
 * nulle part, et la justification des écritures perd son point d'appui.
 *
 * DEUX ARTICLES 16, ET IL NE FAUT PAS LES CONFONDRE. Celui-ci est de l'AUDCIF.
 * Le SYCEBNL a AUSSI un article 16, qui porte sur les règles de présentation
 * des états financiers, et dont le 2) exige de son côté « la mise en place de
 * PROCÉDURES nécessaires à une organisation comptable permettant un contrôle
 * interne fiable et le contrôle externe ». L'article 16 de l'AUDCIF n'est pas
 * dans la liste d'exclusion de l'art. 3 du SYCEBNL : l'obligation vaut des
 * deux côtés, mais chacun l'atteint par son chemin, et les messages le disent.
 *
 * NI LA FORME NI LE CONTENU NE SONT FIXÉS. Le CPCC est formel (« Notes de
 * cours d'organisation comptable », § 0.1.4) : « la législation OHADA ne
 * définit ni la forme ni le contenu du manuel : les entités sont libres de le
 * définir en fonction de leur taille, de la complexité de leur système
 * d'information, de leur métier et de leur culture ». Le logiciel ne propose
 * donc qu'un SQUELETTE, jamais un gabarit imposé.
 */

/** Une section du manuel · titre libre, texte libre. */
export interface SectionManuel {
  cle: string;
  titre: string;
  texte: string;
}

/**
 * SQUELETTE DE DÉPART · les sept rubriques que le CPCC énumère au § 0.1.4
 * comme « informations pouvant y figurer ». « Pouvant », pas « devant » : ce
 * sont des propositions, librement supprimables et complétables. Les proposer
 * vides vaut mieux qu'une page blanche, qui est la raison ordinaire pour
 * laquelle ce document n'existe pas dans les dossiers.
 */
export const SQUELETTE_MANUEL: SectionManuel[] = [
  { cle: 'organisation', titre: 'Organisation générale et comptable de l’entité', texte: '' },
  { cle: 'plan-comptes', titre: 'Plan comptable particulier, livres et supports de traitement', texte: '' },
  { cle: 'etats-sortie', titre: 'États de sortie', texte: '' },
  {
    cle: 'travaux-etats-financiers',
    titre: 'Organisation des travaux d’élaboration et de présentation des états financiers',
    texte: '',
  },
  {
    cle: 'classement-archivage',
    titre: 'Système de classement et d’archivage des documents et pièces comptables',
    texte: '',
  },
  { cle: 'instruction-inventaire', titre: 'Modèle d’instruction d’inventaire', texte: '' },
  {
    cle: 'procedures-controle-interne',
    titre: 'Description des procédures comptables et de contrôle interne',
    texte: '',
  },
];

/**
 * La source à citer, selon le référentiel du dossier. Elle n'est pas la même,
 * et servir l'une pour l'autre serait la transposition que le dépôt s'interdit.
 */
export function sourceManuel(referentiel: Referentiel): string {
  return referentiel === Referentiel.SYCEBNL
    ? "AUDCIF art. 16 al. 1 et art. 17, 3°, rendus applicables aux entités à but non lucratif par l'art. 3 du " +
        "SYCEBNL, qui ne les exclut pas ; et art. 16, 2) du SYCEBNL lui-même, qui exige « la mise en place de " +
        'procédures nécessaires à une organisation comptable permettant un contrôle interne fiable et le contrôle ' +
        'externe »'
    : 'AUDCIF art. 16 al. 1 (établissement du manuel) et art. 17, 3° (classement des pièces dans l’ordre qu’il définit)';
}

@Injectable()
export class ManuelProceduresService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Toutes les versions, la plus récente d'abord. Aucune n'est jamais
   * supprimée · « conservé aussi longtemps qu'est exigée la présentation des
   * états financiers successifs auxquels il se rapporte ».
   */
  async lister(tenantId: string) {
    const versions = await this.prisma.manuelProcedures.findMany({
      where: { tenantId },
      orderBy: { version: 'desc' },
    });
    return versions.map((v) => ({ ...v, sections: v.sections as unknown as SectionManuel[] }));
  }

  /**
   * Conformité · ce que le logiciel peut vérifier, et rien de plus.
   *
   * Il ne peut pas juger si le manuel décrit fidèlement l'organisation réelle.
   * Il peut dire s'il EXISTE, et quelles sections restent vides · c'est tout,
   * et le message le dit plutôt que de laisser croire à un contrôle de fond.
   */
  async conformite(tenantId: string) {
    const { referentiel } = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { referentiel: true },
    });
    const versions = await this.lister(tenantId);
    const enVigueur = versions[0] ?? null;
    const sectionsVides = enVigueur
      ? enVigueur.sections.filter((s) => !s.texte.trim()).map((s) => s.titre)
      : [];
    return {
      source: sourceManuel(referentiel),
      existe: enVigueur !== null,
      versionEnVigueur: enVigueur?.version ?? null,
      dateApplication: enVigueur?.dateApplication ?? null,
      nombreVersions: versions.length,
      sectionsVides,
      // La seule vérification de fond que le texte permette : le manuel doit
      // décrire l'ordre de classement des pièces, puisque l'art. 17, 3° s'y
      // réfère. Une section vide sur ce point prive cet article de son objet.
      classementRenseigne: enVigueur
        ? enVigueur.sections.some((s) => s.cle === 'classement-archivage' && s.texte.trim().length > 0)
        : false,
    };
  }

  /**
   * Nouvelle version · JAMAIS une mise à jour de la précédente.
   *
   * « Mis à jour périodiquement » et « conservé aussi longtemps qu'est exigée
   * la présentation des états financiers successifs » ne se concilient que
   * par la version : écraser le manuel effacerait celui qui était en vigueur
   * au moment d'un exercice encore opposable, et personne ne pourrait plus
   * dire selon quelles procédures cet exercice a été tenu.
   */
  async enregistrer(tenantId: string, userId: string, dto: EnregistrerManuelDto) {
    if (dto.sections.length === 0) {
      throw new BadRequestException('Un manuel sans aucune section ne décrit rien');
    }
    const cles = dto.sections.map((s) => s.cle);
    if (new Set(cles).size !== cles.length) {
      throw new BadRequestException('Deux sections portent la même clé · chaque section doit être identifiable');
    }

    const derniere = await this.prisma.manuelProcedures.findFirst({
      where: { tenantId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return this.prisma.manuelProcedures.create({
      data: {
        tenantId,
        version: (derniere?.version ?? 0) + 1,
        dateApplication: new Date(dto.dateApplication),
        sections: dto.sections as unknown as Prisma.InputJsonValue,
        createdBy: userId,
      },
    });
  }
}
