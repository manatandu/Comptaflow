import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Prisma, Referentiel, StatutExercice } from '@prisma/client';
import { EcritureService } from '../comptabilite/ecriture.service';
import { CreerDeviseDto, ModifierDeviseDto, PoserCoursDto, ReevaluerDto } from './dto/devises.dto';

/**
 * Comptes de la réévaluation, par racine du plan SYCEBNL.
 *
 * Le SYCEBNL ne subdivise NI 478 NI 479 (Partie 2 ch. 3, compte 47) et ne
 * connaît qu'un seul couple de provision pour perte de change. Ces racines
 * génériques y résolvent donc sans ambiguïté. Le SYSCOHADA, lui, subdivise
 * les deux comptes en quatre chacun ET fait dépendre le couple de provision
 * de la nature de la position · voir plus bas. Servir ces racines-ci à un
 * dossier SYSCOHADA imputait tout sur la première subdivision venue.
 */
const RACINE = {
  ecartActif: '478', // Écarts de conversion-Actif · perte probable
  ecartPassif: '479', // Écarts de conversion-Passif · gain probable
  provision: '194', // Provisions pour pertes de change
  dotationProvision: '6971', // Dotations aux provisions pour risques et charges (financières)
  perteRealisee: '676', // Pertes de change financières
  gainRealise: '776', // Gains de change financiers
} as const;

/**
 * Une position en devise est-elle une DISPONIBILITÉ ?
 *
 * La question décide de tout : une disponibilité en devise donne un écart
 * RÉALISÉ, qui va droit au résultat financier (676 / 776) ; une créance ou
 * une dette donne un écart LATENT, qui passe par les écarts de conversion et
 * appelle une provision. L'AUDCIF le pose explicitement en excluant les
 * disponibilités de la position globale de change, « les écarts de change
 * étant comptabilisés immédiatement en résultat » (Titre VIII ch. 22 § 2.2).
 *
 * Le test portait sur la CLASSE ENTIÈRE (`numero.startsWith('5')`), ce qui
 * rangeait en disponibilités trois familles qui n'en sont pas :
 *
 *  · 50 « Titres de placement » · un placement, pas de la monnaie ;
 *  · 54 « Instruments de trésorerie » (SYSCOHADA seulement) ;
 *  · 56 « Banques, crédits de trésorerie et d'escompte » · une DETTE
 *    bancaire, dont l'alourdissement en devise est une perte PROBABLE à
 *    provisionner, pas une perte supportée.
 *
 * Un découvert bancaire en devise passait donc directement en 676, sans
 * écart de conversion et sans provision : le résultat financier de
 * l'exercice portait une perte que le texte veut latente.
 *
 * Les vraies disponibilités sont les mêmes dans les deux référentiels · 52
 * Banques, 53 Établissements financiers et assimilés, 55 Instruments de
 * monnaie électronique, 57 Caisse, 58 (régies d'avances et accréditifs en
 * SYSCOHADA, virements internes dans les deux, toujours soldés à la
 * clôture). Le SYCEBNL n'a pas de 54, et le 55 porte chez lui le même
 * intitulé qu'en SYSCOHADA : une seule liste suffit.
 */
const RACINES_DISPONIBILITES = /^(52|53|55|57|58)/;

function estDisponibilite(numero: string): boolean {
  return RACINES_DISPONIBILITES.test(numero);
}

/**
 * Nature d'une position en devise au sens du SYSCOHADA · elle commande À LA
 * FOIS la subdivision de l'écart de conversion et le couple de provision.
 *
 * AUDCIF Titre VIII ch. 22 § 2.3 sépare les deux mondes explicitement :
 * « Créances et dettes commerciales → résultat d'exploitation » d'un côté,
 * « Opérations à caractère financier (emprunt bancaire en devise, liquidités
 * en devises…) → résultat financier » de l'autre.
 *
 * La nature se lit sur la RACINE du compte réévalué, faute de mieux : la
 * position est un agrégat (compte, devise) et ne porte aucune échéance. Les
 * comptes de tiers de la classe 4 sont d'exploitation ; les emprunts et
 * dettes financières (16, 17, 18) et les immobilisations financières (26, 27)
 * sont financiers. Les disponibilités de la classe 5 ne passent jamais ici :
 * leur écart est RÉALISÉ, pas latent (voir `estTresorerie`).
 */
type NaturePosition = 'EXPLOITATION' | 'FINANCIER_COURT' | 'FINANCIER_LONG';

/**
 * Ressources et emplois DURABLES · classe 1 (emprunts et dettes financières)
 * et immobilisations financières. Ils sont à plus d'un an par construction du
 * plan, d'où le long terme.
 */
const RACINES_FINANCIERES_LONGUES = /^(16|17|18|26|27)/;

/**
 * Financier à MOINS d'un an · 50 titres de placement, 54 instruments de
 * trésorerie (SYSCOHADA seulement, le SYCEBNL n'a pas de 54) et 56 banques,
 * crédits de trésorerie et d'escompte, qui est une DETTE bancaire à court
 * terme et non une disponibilité.
 */
const RACINES_FINANCIERES_COURTES = /^(50|54|56)/;

function naturePosition(numero: string): NaturePosition {
  if (RACINES_FINANCIERES_LONGUES.test(numero)) return 'FINANCIER_LONG';
  if (RACINES_FINANCIERES_COURTES.test(numero)) return 'FINANCIER_COURT';
  // Tout le reste est d'exploitation, y compris le 51 « Valeurs à encaisser » :
  // un chèque ou un effet reçu d'un client est la queue d'une créance
  // COMMERCIALE, pas une opération financière.
  return 'EXPLOITATION';
}

/**
 * Subdivision de l'écart de conversion SYSCOHADA, plan de comptes compte 47 :
 *
 *   478 Écarts de conversion-actif   · 4781 diminution des créances d'exploitation
 *                                      4782 diminution des créances financières
 *                                      4783 augmentation des dettes d'exploitation
 *                                      4784 augmentation des dettes financières
 *   479 Écarts de conversion-passif  · 4791 augmentation des créances d'exploitation
 *                                      4792 augmentation des créances financières
 *                                      4793 diminution des dettes d'exploitation
 *                                      4794 diminution des dettes financières
 *
 * Les intitulés disent le SENS de la position autant que celui de l'écart :
 * une perte sur une CRÉANCE est une diminution de créance, une perte sur une
 * DETTE est une augmentation de dette. Les deux lectures doivent donc être
 * croisées, et c'est ce que faisait perdre la résolution par racine à trois
 * chiffres · elle rendait toujours 4781 et 4791, si bien qu'une dette
 * fournisseur en devise s'imputait sur la subdivision des créances.
 */
function racineEcartSyscohada(estCreance: boolean, estPerte: boolean, nature: NaturePosition): string {
  // Les subdivisions ne distinguent que exploitation / financier · la
  // distinction court terme / long terme ne joue que sur la PROVISION.
  const exploitation = nature === 'EXPLOITATION';
  if (estPerte) return estCreance ? (exploitation ? '4781' : '4782') : exploitation ? '4783' : '4784';
  return estCreance ? (exploitation ? '4791' : '4792') : exploitation ? '4793' : '4794';
}

/**
 * Couple dotation / provision de la perte probable de change, SYSCOHADA.
 *
 * AUDCIF Titre VIII ch. 22 § 2.3, mot pour mot : « S'agissant d'une créance
 * de nature commerciale, la provision relative à la perte probable de change
 * s'analyse comme une CHARGE D'EXPLOITATION : débit du 6591 […] par le crédit
 * du 4991 ». Et pour les opérations financières : « risques à long terme :
 * débit 6971 · crédit 194 ; risques à court terme : débit 6791 · crédit
 * 4997 ».
 *
 * Doter 6971/194 sur une créance client, comme le faisait le chemin unique
 * hérité du SYCEBNL, gonfle le résultat FINANCIER au détriment du résultat
 * d'EXPLOITATION · deux soldes intermédiaires faux, sans qu'aucun total du
 * compte de résultat ne bouge.
 *
 * Les trois couples du texte sont servis. Le court terme (6791 / 4997) l'a
 * été à partir du moment où `estTresorerie` a cessé de prendre TOUTE la
 * classe 5 : le compte 56 « Banques, crédits de trésorerie et d'escompte »,
 * qui est une dette bancaire à court terme et non une disponibilité, atteint
 * désormais ce code. La distinction court/long ne se lit pas sur une
 * échéance, que l'agrégat (compte, devise) ne porte pas, mais sur la NATURE
 * du compte : la classe 1 et les immobilisations financières sont durables
 * par construction du plan, la trésorerie financière ne l'est pas.
 */
const PROVISION_SYSCOHADA: Record<NaturePosition, { dotation: string; provision: string }> = {
  EXPLOITATION: { dotation: '6591', provision: '4991' },
  FINANCIER_COURT: { dotation: '6791', provision: '4997' },
  FINANCIER_LONG: { dotation: '6971', provision: '194' },
};

/** Une position en devise à réévaluer : un compte, une devise, son écart. */
export interface PositionDevise {
  compteId: string;
  numero: string;
  intitule: string;
  deviseCode: string;
  deviseId: string;
  /** Solde en devise (débit − crédit). */
  montantDevise: number;
  /** Contre-valeur inscrite en comptabilité, aux cours d'origine. */
  valeurComptable: number;
  coursCloture: number;
  /** Contre-valeur au cours de clôture. */
  valeurReevaluee: number;
  ecart: number;
  /** Vrai pour un compte de classe 5 · l'écart y est réalisé, non latent. */
  estTresorerie: boolean;
  /**
   * Part de la perte latente RÉELLEMENT dotée en provision. Égale à la perte
   * hors position globale de change ; réduite au prorata quand la position
   * globale est retenue (art. 58), nulle sur un gain ou une disponibilité.
   */
  provisionnable: number;
}

export interface RapportReevaluation {
  dateReevaluation: string;
  positions: PositionDevise[];
  /** Créances et dettes · écarts LATENTS, comptes 478 / 479. */
  perteLatente: number;
  gainLatent: number;
  /** Disponibilités · écarts RÉALISÉS, comptes 676 / 776. */
  perteRealisee: number;
  gainRealise: number;
  /** Provision à doter sur la perte latente (194 par 6971). */
  provision: number;
  /**
   * Provision qui serait dotée SANS position globale de change · égale à
   * `provision` quand l'option n'est pas retenue. Sert à montrer à l'écran ce
   * que l'option a retiré, plutôt que de faire varier un chiffre en silence.
   */
  provisionSansPositionGlobale: number;
  /** Vrai si la dotation a été limitée au titre de l'art. 58. */
  positionGlobaleRetenue: boolean;
  /**
   * Ce que le logiciel ne sait pas calculer et que le comptable doit trancher ·
   * l'étalement de l'art. 56, faute de tableau d'amortissement de l'emprunt.
   */
  avertissements: string[];
  coursManquants: string[];
}

/**
 * MULTIDEVISE ET RÉÉVALUATION · Traitement → Réévaluation des dettes et
 * créances en devise chez Sage 100 i7, calé sur la RDC et sur ce que le
 * SYCEBNL dit précisément.
 *
 * Le texte sépare deux traitements que l'on confond souvent (Partie 2 ch. 3,
 * comptes 47, 67 et 77) :
 *
 *  - une CRÉANCE ou une DETTE en devise donne à la clôture un écart LATENT :
 *    478 si l'entité y perdrait, 479 si elle y gagnerait. Le texte prend soin
 *    de le dire : « Le compte 676 ne doit pas être confondu avec le compte 478
 *    qui n'enregistre que les pertes probables de change. » Et par prudence, la
 *    perte probable appelle une provision (194 par 6971) ;
 *
 *  - une DISPONIBILITÉ en devise donne un écart RÉALISÉ : « les écarts de
 *    conversion négatifs constatés à la clôture sur les disponibilités en
 *    devises sont considérés comme étant des pertes de change supportées ».
 *    Ils vont donc droit au résultat, 676 ou 776, sans provision.
 *
 * Les écarts latents sont contre-passés à l'ouverture de l'exercice suivant :
 * ils décrivent une situation à une date, pas une opération.
 */
@Injectable()
export class DevisesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritureService: EcritureService,
  ) {}

  // --- Référentiel ---------------------------------------------------------

  async lister(tenantId: string) {
    return this.prisma.devise.findMany({
      where: { tenantId },
      orderBy: { code: 'asc' },
      include: { cours: { orderBy: { date: 'desc' }, take: 12 } },
    });
  }

  async creer(tenantId: string, dto: CreerDeviseDto) {
    const code = dto.code.toUpperCase();
    const existante = await this.prisma.devise.findFirst({ where: { tenantId, code } });
    if (existante) throw new ConflictException(`La devise ${code} existe déjà dans ce dossier`);
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (tenant?.devise && tenant.devise.toUpperCase() === code) {
      throw new BadRequestException(
        `${code} est la monnaie de tenue de ce dossier : elle n'a pas de cours et ne se réévalue pas.`,
      );
    }
    return this.prisma.devise.create({ data: { tenantId, code, intitule: dto.intitule } });
  }

  async modifier(tenantId: string, deviseId: string, dto: ModifierDeviseDto) {
    await this.trouver(tenantId, deviseId);
    return this.prisma.devise.update({ where: { id: deviseId }, data: dto });
  }

  async poserCours(tenantId: string, deviseId: string, dto: PoserCoursDto) {
    await this.trouver(tenantId, deviseId);
    const date = new Date(dto.date);
    return this.prisma.coursDevise.upsert({
      where: { deviseId_date: { deviseId, date } },
      create: { deviseId, date, cours: new Prisma.Decimal(dto.cours), source: dto.source },
      update: { cours: new Prisma.Decimal(dto.cours), source: dto.source },
    });
  }

  private async trouver(tenantId: string, deviseId: string) {
    const devise = await this.prisma.devise.findFirst({ where: { id: deviseId, tenantId } });
    if (!devise) throw new NotFoundException('Devise introuvable pour ce dossier');
    return devise;
  }

  /**
   * Cours applicable à une date : le dernier coté à cette date ou avant. Une
   * cotation postérieure n'est pas retenue · on ne réévalue pas une clôture
   * avec un cours qui n'existait pas encore.
   */
  private async coursA(deviseId: string, date: Date): Promise<number | null> {
    const cote = await this.prisma.coursDevise.findFirst({
      where: { deviseId, date: { lte: date } },
      orderBy: { date: 'desc' },
    });
    return cote ? Number(cote.cours) : null;
  }

  // --- Réévaluation --------------------------------------------------------

  /** Positions en devise d'un exercice, et leur écart au cours de clôture. */
  async calculer(tenantId: string, dto: ReevaluerDto): Promise<RapportReevaluation> {
    const exercice = await this.prisma.exercice.findFirst({ where: { id: dto.exerciceId, tenantId } });
    if (!exercice) throw new BadRequestException('Exercice introuvable pour ce dossier');
    const date = dto.dateReevaluation ? new Date(dto.dateReevaluation) : exercice.dateFin;

    const lignes = await this.prisma.ligneEcriture.findMany({
      where: {
        ecriture: { tenantId, exerciceId: dto.exerciceId, date: { lte: date } },
        deviseId: { not: null },
        // Une ligne lettrée est soldée : sa créance n'existe plus, il n'y a
        // rien à réévaluer.
        lettre: null,
      },
      include: {
        compte: { select: { id: true, numero: true, intitule: true } },
        devise: { select: { id: true, code: true } },
      },
    });

    // Agrégation par (compte, devise) : c'est la position nette qui se
    // réévalue, pas chaque ligne prise isolément.
    const positions = new Map<string, PositionDevise>();
    for (const l of lignes) {
      if (!l.devise) continue;
      const cle = `${l.compteId}|${l.deviseId}`;
      const acc =
        positions.get(cle) ??
        ({
          compteId: l.compte.id,
          numero: l.compte.numero,
          intitule: l.compte.intitule,
          deviseCode: l.devise.code,
          deviseId: l.devise.id,
          montantDevise: 0,
          valeurComptable: 0,
          coursCloture: 0,
          valeurReevaluee: 0,
          ecart: 0,
          estTresorerie: estDisponibilite(l.compte.numero),
          provisionnable: 0,
        } satisfies PositionDevise);
      // Le montant en devise est stocké sans signe : c'est le sens de la ligne
      // (débit ou crédit) qui le donne.
      const sens = Number(l.debit) > 0 ? 1 : -1;
      acc.montantDevise += sens * Number(l.montantDevise ?? 0);
      acc.valeurComptable += Number(l.debit) - Number(l.credit);
      positions.set(cle, acc);
    }

    const coursManquants = new Set<string>();
    const resultat: PositionDevise[] = [];
    for (const p of positions.values()) {
      if (Math.abs(p.montantDevise) < 0.005 && Math.abs(p.valeurComptable) < 0.005) continue;
      const cours = await this.coursA(p.deviseId, date);
      if (cours === null) {
        coursManquants.add(p.deviseCode);
        continue;
      }
      p.coursCloture = cours;
      p.valeurReevaluee = Math.round(p.montantDevise * cours * 100) / 100;
      p.ecart = Math.round((p.valeurReevaluee - p.valeurComptable) * 100) / 100;
      if (Math.abs(p.ecart) >= 0.005) resultat.push(p);
    }

    // Un écart POSITIF sur un actif (créance, disponibilité) est un gain ; sur
    // un passif (dette, solde créditeur) c'est aussi un gain, puisque la dette
    // en monnaie de tenue diminue quand l'écart calculé est positif au sens
    // débit − crédit. La lecture par le signe de l'écart est donc directe.
    const latentes = resultat.filter((p) => !p.estTresorerie);
    const tresorerie = resultat.filter((p) => p.estTresorerie);

    const perteLatente = latentes.filter((p) => p.ecart < 0).reduce((s, p) => s - p.ecart, 0);
    const gainLatent = latentes.filter((p) => p.ecart > 0).reduce((s, p) => s + p.ecart, 0);
    const perteRealisee = tresorerie.filter((p) => p.ecart < 0).reduce((s, p) => s - p.ecart, 0);
    const gainRealise = tresorerie.filter((p) => p.ecart > 0).reduce((s, p) => s + p.ecart, 0);

    // --- POSITION GLOBALE DE CHANGE · art. 58 --------------------------------
    //
    // « Lorsque les opérations en monnaies étrangères concourent à une position
    // globale de change au sein de l'entité, le montant de la dotation à la
    // provision pour pertes de change est limité à l'excédent des pertes
    // probables sur les gains latents afférents aux éléments inclus dans cette
    // position. La position globale de change s'entend de la situation,
    // DEVISE PAR DEVISE, de toutes les opérations engagées contractuellement
    // par l'entité » (AUDCIF art. 58 ; le cadre conceptuel du SYCEBNL reprend
    // la même limitation, ch. 2).
    //
    // TROIS RAISONS DE NE PAS L'APPLIQUER D'OFFICE, et c'est pourquoi elle est
    // une OPTION et non le comportement par défaut :
    //
    //  · le texte la subordonne à une justification par l'entité · elle « peut
    //    justifier » d'une position globale, ce n'est pas un automatisme ;
    //  · elle ne vaut qu'entre éléments dont l'échéance tombe dans le même
    //    exercice (Titre VIII ch. 22 § 2.2.3), et le logiciel ne connaît pas
    //    l'échéance d'une position · elle agrège un compte et une devise ;
    //  · elle DIMINUE une provision. Un défaut qui allège la prudence ne doit
    //    jamais s'installer sans que quelqu'un l'ait demandé.
    //
    // Les disponibilités en sont exclues de toute façon : leur écart est déjà
    // au résultat, il n'y a rien à provisionner (art. 57).
    const positionGlobale = dto.positionGlobale === true;
    const perteParDevise = new Map<string, number>();
    const gainParDevise = new Map<string, number>();
    for (const p of latentes) {
      const table = p.ecart < 0 ? perteParDevise : gainParDevise;
      table.set(p.deviseCode, (table.get(p.deviseCode) ?? 0) + Math.abs(p.ecart));
    }
    for (const p of resultat) {
      if (p.estTresorerie || p.ecart >= 0) {
        p.provisionnable = 0;
        continue;
      }
      const perteDevise = perteParDevise.get(p.deviseCode) ?? 0;
      const gainDevise = gainParDevise.get(p.deviseCode) ?? 0;
      // Ratio appliqué à CHAQUE position de la devise, pour que la ventilation
      // par nature (exploitation / financier) reste proportionnelle. Sans lui,
      // il faudrait décider arbitrairement quelle position absorbe la
      // réduction, et le compte de résultat s'en ressentirait.
      const ratio =
        positionGlobale && perteDevise > 0 ? Math.max(0, perteDevise - gainDevise) / perteDevise : 1;
      p.provisionnable = Math.round(-p.ecart * ratio * 100) / 100;
    }
    const provision = resultat.reduce((s, p) => s + p.provisionnable, 0);

    // --- ÉTALEMENT DE L'ART. 56 · ce que le logiciel ne peut pas calculer ----
    //
    // « Lorsqu'un emprunt est contracté ou qu'un prêt est consenti à
    // l'étranger pour une période supérieure à un an, la perte ou le gain
    // résultant à la clôture DOIT être étalé sur la durée restant à courir
    // jusqu'au dernier remboursement, en proportion des remboursements à venir
    // prévus au contrat » (AUDCIF art. 56 ; repris par le cadre conceptuel du
    // SYCEBNL). Le montant potentiel total se mentionne dans les Notes annexes.
    //
    // Cette proportion se lit dans le TABLEAU D'AMORTISSEMENT de l'emprunt, que
    // le logiciel ne détient pas : une position est un agrégat (compte, devise)
    // sans échéancier. Il ne peut donc pas la calculer, et il ne l'invente pas ·
    // il dote la totalité, ce qui est prudent mais dépasse ce que le texte
    // demande, et il le DIT, position par position, avec le montant à ventiler.
    const avertissements: string[] = [];
    for (const p of resultat) {
      if (p.estTresorerie || p.ecart >= 0) continue;
      if (!RACINES_FINANCIERES_LONGUES.test(p.numero)) continue;
      avertissements.push(
        `${p.numero} ${p.intitule} (${p.deviseCode}) · perte de change de ` +
          `${Math.abs(p.ecart).toFixed(2)} sur un emprunt, un prêt ou une immobilisation financière. ` +
          "Si l'échéance dépasse un an, l'AUDCIF (art. 56) impose d'ÉTALER cette perte sur la durée " +
          'restant à courir, en proportion des remboursements à venir prévus au contrat. La totalité est ' +
          "dotée ici, faute de tableau d'amortissement : ajustez la dotation et portez le montant " +
          'potentiel total dans les Notes annexes.',
      );
    }

    return {
      dateReevaluation: date.toISOString().slice(0, 10),
      positions: resultat,
      perteLatente: Math.round(perteLatente * 100) / 100,
      gainLatent: Math.round(gainLatent * 100) / 100,
      perteRealisee: Math.round(perteRealisee * 100) / 100,
      gainRealise: Math.round(gainRealise * 100) / 100,
      // Prudence : la perte probable est provisionnée, le gain probable ne
      // l'est pas · un gain latent ne se constate jamais en résultat. La
      // position globale de change est la seule exception, et sur option.
      provision: Math.round(provision * 100) / 100,
      provisionSansPositionGlobale: Math.round(perteLatente * 100) / 100,
      positionGlobaleRetenue: positionGlobale,
      avertissements,
      coursManquants: [...coursManquants],
    };
  }

  /** Passe les écritures de réévaluation, et la provision qui l'accompagne. */
  async reevaluer(tenantId: string, createdBy: string, dto: ReevaluerDto) {
    const rapport = await this.calculer(tenantId, dto);
    if (dto.simulation) return { rapport, ecritures: [] as string[] };
    if (rapport.positions.length === 0) {
      throw new BadRequestException("Aucune position en devise à réévaluer à cette date.");
    }
    if (rapport.coursManquants.length > 0) {
      throw new BadRequestException(
        `Aucun cours coté au ${rapport.dateReevaluation} ou avant pour : ${rapport.coursManquants.join(', ')}. ` +
          'Renseignez le cours de clôture avant de réévaluer.',
      );
    }

    const exercice = await this.prisma.exercice.findFirst({ where: { id: dto.exerciceId, tenantId } });
    if (!exercice) throw new BadRequestException('Exercice introuvable pour ce dossier');
    if (exercice.statut === StatutExercice.CLOTURE) {
      throw new BadRequestException("L'exercice est clôturé.");
    }
    const dejaFaite = await this.prisma.reevaluation.findFirst({
      where: { tenantId, exerciceId: dto.exerciceId, dateReevaluation: new Date(rapport.dateReevaluation) },
    });
    if (dejaFaite) {
      throw new ConflictException(
        `Une réévaluation a déjà été passée au ${rapport.dateReevaluation} sur cet exercice.`,
      );
    }

    const journal = await this.journalGeneral(tenantId);
    const compte = (racine: string) => this.compteParRacine(tenantId, racine);

    // Le référentiel du dossier décide des comptes à servir · il ne décide
    // PAS du calcul, qui est identique des deux côtés (l'écart se mesure de
    // la même façon). Seule l'imputation change, et elle change beaucoup.
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { referentiel: true },
    });
    const estSyscohada = tenant?.referentiel === Referentiel.SYSCOHADA;

    // --- Écriture des écarts ------------------------------------------------
    const lignes: { compteId: string; debit?: number; credit?: number; libelle: string }[] = [];
    for (const p of rapport.positions) {
      const contrepartie = p.estTresorerie
        ? // Disponibilités · l'écart est RÉALISÉ et va droit au résultat
          // financier, dans les deux référentiels (676 / 776).
          p.ecart < 0
          ? await compte(RACINE.perteRealisee)
          : await compte(RACINE.gainRealise)
        : estSyscohada
          ? // Créance ou dette · le SYSCOHADA veut la subdivision qui croise
            // le sens de la POSITION (créance = solde débiteur) et celui de
            // l'ÉCART. `valeurComptable` est un débit moins un crédit : un
            // solde nul est traité comme une créance, cas sans conséquence
            // puisqu'une position nulle est écartée en amont.
            await compte(racineEcartSyscohada(p.valeurComptable >= 0, p.ecart < 0, naturePosition(p.numero)))
          : p.ecart < 0
            ? await compte(RACINE.ecartActif)
            : await compte(RACINE.ecartPassif);
      const abs = Math.abs(p.ecart);
      const libelle = `Réévaluation ${p.deviseCode} au ${rapport.dateReevaluation}`;
      if (p.ecart > 0) {
        lignes.push({ compteId: p.compteId, debit: abs, libelle });
        lignes.push({ compteId: contrepartie.id, credit: abs, libelle });
      } else {
        lignes.push({ compteId: contrepartie.id, debit: abs, libelle });
        lignes.push({ compteId: p.compteId, credit: abs, libelle });
      }
    }

    const ecritureEcarts = await this.ecritureService.creer(tenantId, createdBy, {
      exerciceId: dto.exerciceId,
      journalId: journal.id,
      date: rapport.dateReevaluation,
      libelle: `Réévaluation des créances et dettes en devises au ${rapport.dateReevaluation}`,
      reference: 'REEVAL',
      lignes,
    });

    // --- Provision sur la perte latente ------------------------------------
    //
    // La provision se VENTILE par nature de position en SYSCOHADA : une perte
    // sur créance client est une charge d'exploitation (6591 / 4991), une
    // perte sur emprunt en devise une charge financière (6971 / 194). Une
    // dotation unique, comme le faisait le chemin hérité du SYCEBNL, range
    // tout au financier et fausse les deux soldes intermédiaires sans qu'un
    // seul total du compte de résultat ne bouge. En SYCEBNL, toutes les
    // positions retombent sur l'unique couple du référentiel.
    let ecritureProvision: { id: string } | null = null;
    if (rapport.provision > 0.005) {
      const parNature = new Map<NaturePosition, number>();
      for (const p of rapport.positions) {
        // `provisionnable` et non `-ecart` : la position globale de change
        // (art. 58) a pu réduire la dotation, et la réduction doit se répartir
        // sur les natures au prorata, pas s'imputer sur l'une d'elles.
        if (p.provisionnable <= 0.005) continue; // seule la perte LATENTE se provisionne
        const nature = estSyscohada ? naturePosition(p.numero) : 'FINANCIER_LONG';
        parNature.set(nature, Math.round(((parNature.get(nature) ?? 0) + p.provisionnable) * 100) / 100);
      }
      const lignesProvision: { compteId: string; debit?: number; credit?: number; libelle: string }[] = [];
      for (const [nature, montant] of parNature) {
        if (montant <= 0.005) continue;
        const couple = estSyscohada
          ? PROVISION_SYSCOHADA[nature]
          : { dotation: RACINE.dotationProvision, provision: RACINE.provision };
        const [dotation, provision] = await Promise.all([compte(couple.dotation), compte(couple.provision)]);
        const suffixe = estSyscohada ? ` (${nature === 'EXPLOITATION' ? 'exploitation' : 'financier'})` : '';
        lignesProvision.push({ compteId: dotation.id, debit: montant, libelle: `Dotation provision perte de change${suffixe}` });
        lignesProvision.push({ compteId: provision.id, credit: montant, libelle: `Provision pour pertes de change${suffixe}` });
      }
      if (lignesProvision.length > 0) {
        ecritureProvision = await this.ecritureService.creer(tenantId, createdBy, {
          exerciceId: dto.exerciceId,
          journalId: journal.id,
          date: rapport.dateReevaluation,
          libelle: `Provision pour perte de change au ${rapport.dateReevaluation}`,
          reference: 'REEVAL',
          lignes: lignesProvision,
        });
      }
    }

    const reevaluation = await this.prisma.reevaluation.create({
      data: {
        tenantId,
        exerciceId: dto.exerciceId,
        dateReevaluation: new Date(rapport.dateReevaluation),
        ecritureEcartsId: ecritureEcarts.id,
        ecritureProvisionId: ecritureProvision?.id,
        createdBy,
      },
    });

    return {
      rapport,
      reevaluationId: reevaluation.id,
      ecritures: [ecritureEcarts.id, ...(ecritureProvision ? [ecritureProvision.id] : [])],
    };
  }

  /**
   * Contre-passe les écarts de conversion à l'ouverture de l'exercice suivant.
   *
   * Contrairement à la reprise d'une régularisation, qui se fait à la FIN de
   * l'exercice concerné (Partie 3 ch. 6), l'écart de conversion se contre-passe
   * bien à l'OUVERTURE : il décrit une situation à une date d'arrêté, pas une
   * charge ou un produit rattaché à une période. Le laisser vivre fausserait
   * toutes les positions de l'exercice suivant.
   */
  async extourner(tenantId: string, createdBy: string, reevaluationId: string, exerciceSuivantId: string) {
    const reeval = await this.prisma.reevaluation.findFirst({
      where: { id: reevaluationId, tenantId },
      include: { ecritureEcarts: { include: { lignes: true } } },
    });
    if (!reeval) throw new NotFoundException('Réévaluation introuvable pour ce dossier');
    if (reeval.ecritureExtourneId) throw new ConflictException('Cette réévaluation a déjà été extournée.');
    if (!reeval.ecritureEcarts) throw new BadRequestException("Aucune écriture d'écarts à extourner.");

    const suivant = await this.prisma.exercice.findFirst({ where: { id: exerciceSuivantId, tenantId } });
    if (!suivant) throw new BadRequestException('Exercice suivant introuvable pour ce dossier');
    if (suivant.statut === StatutExercice.CLOTURE) throw new BadRequestException("L'exercice suivant est clôturé.");

    const journal = await this.journalGeneral(tenantId);
    const ecriture = await this.ecritureService.creer(tenantId, createdBy, {
      exerciceId: suivant.id,
      journalId: journal.id,
      date: suivant.dateDebut.toISOString().slice(0, 10),
      libelle: `Contre-passation des écarts de conversion du ${reeval.dateReevaluation.toISOString().slice(0, 10)}`,
      reference: 'REEVAL',
      lignes: reeval.ecritureEcarts.lignes.map((l) => ({
        compteId: l.compteId,
        // Sens inverse, ligne à ligne.
        debit: Number(l.credit) || undefined,
        credit: Number(l.debit) || undefined,
        libelle: l.libelle ?? undefined,
      })),
    });

    return this.prisma.reevaluation.update({
      where: { id: reevaluationId },
      data: { ecritureExtourneId: ecriture.id },
    });
  }

  async listerReevaluations(tenantId: string, exerciceId: string) {
    return this.prisma.reevaluation.findMany({
      where: { tenantId, exerciceId },
      orderBy: { dateReevaluation: 'desc' },
      include: {
        ecritureEcarts: { select: { id: true, numeroPiece: true, date: true } },
        ecritureProvision: { select: { id: true, numeroPiece: true } },
        ecritureExtourne: { select: { id: true, numeroPiece: true, date: true } },
      },
    });
  }

  private async compteParRacine(tenantId: string, racine: string) {
    const compte = await this.prisma.compte.findFirst({
      where: { tenantId, numero: { startsWith: racine }, typeCompte: 'DETAIL', estActif: true },
      orderBy: { numero: 'asc' },
    });
    if (!compte) {
      throw new BadRequestException(
        `Aucun compte ${racine} dans le plan de ce dossier. La réévaluation en a besoin ; créez-le avant de relancer.`,
      );
    }
    return compte;
  }

  private async journalGeneral(tenantId: string) {
    const journal =
      (await this.prisma.journal.findFirst({ where: { tenantId, code: 'OD' } })) ??
      (await this.prisma.journal.findFirst({ where: { tenantId, type: 'GENERAL' } }));
    if (!journal) {
      throw new BadRequestException("Aucun journal général (code OD) pour recevoir les écritures de réévaluation.");
    }
    return journal;
  }
}
