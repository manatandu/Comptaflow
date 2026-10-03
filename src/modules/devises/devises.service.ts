import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Prisma, Referentiel, StatutEcriture, StatutExercice } from '@prisma/client';
import { EcritureService } from '../comptabilite/ecriture.service';
import { motifLignesTenues } from '../comptabilite/lignes-tenues';
import { transactionJournalisee } from '../../common/audit/transaction-journalisee';
import { groupesDenoues, motifDateReevaluation, motifHorsReevaluation, motifPositionDenouee } from './perimetre-reevaluation';
import {
  AVERTISSEMENT_INTEGRALE,
  CodeContrePassationIntegrale,
  EcartDeDisponibilite,
  LIBELLE_INTEGRALE,
  RACINES_CHANGE_DISPONIBILITES,
  SommeDeviseDuCompte,
  ecartsDisponibilitesEnregistres,
  estDisponibilite,
  motifRefusVentilationDeclaree,
  partagerLignesDEcarts,
  ventilerEcartPasse,
} from './ecarts-disponibilites';
import { CreerDeviseDto, DeclarerVentilationDisponibilitesDto, ModifierDeviseDto, PoserCoursDto, ReevaluerDto } from './dto/devises.dto';

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
  perteRealisee: RACINES_CHANGE_DISPONIBILITES.perte, // Pertes de change financières
  gainRealise: RACINES_CHANGE_DISPONIBILITES.gain, // Gains de change financiers
} as const;

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
export const PROVISION_SYSCOHADA: Record<NaturePosition, FamilleProvisionChange> = {
  EXPLOITATION: { dotation: '6591', provision: '4991', reprise: '7591' },
  FINANCIER_COURT: { dotation: '6791', provision: '4997', reprise: '7791' },
  FINANCIER_LONG: { dotation: '6971', provision: '194', reprise: '7971' },
};

/**
 * Une famille de provision pour pertes de change · le compte de PROVISION la
 * désigne, et décide de la dotation qui l'augmente et de la reprise qui la
 * diminue. Les reprises sont lues aux fiches des comptes de produits, au même
 * rang que la dotation :
 *
 *  · 7591 « Reprises […] sur risques à court terme » (AUDCIF Titre VII,
 *    compte 759 · « crédité du montant […] des risques provisionnés existant
 *    à l'ouverture de l'exercice, par le débit du compte 49 ») ;
 *  · 7791 « sur risques financiers » (compte 779 · « par le débit du compte
 *    59 [...] pour solde ou pour rajustement ») ;
 *  · 7971 « pour risques et charges » (compte 79 · « crédité par le débit des
 *    comptes 19 et 29, pour le montant des diminutions des provisions »).
 *
 * REPRISE DU 4997 AU 7791 · décision de Manasse du 2026-10-02, et ANOMALIE
 * DU TEXTE, signalée et non corrigée. Le Titre VIII ch. 22 § 2.3 dote la
 * perte probable sur opération financière à court terme par « débit 6791
 * Charges pour provisions sur risques financiers · crédit 4997 Provisions
 * pour risque à court terme sur opérations financières ». La fiche du compte
 * 77 range la reprise au 779 · « Le compte 779 est crédité de la reprise des
 * dépréciations des comptes de trésorerie et des provisions pour risques à
 * court terme à caractère financier sans objet, existant au début de
 * l'exercice, par le débit du compte 59 […], pour solde ou pour
 * rajustement ». Mais les fiches ne relient pas le 4997 à ce couple · celle
 * du compte 49 crédite le 499 « par le débit du compte 659 » et le débite de
 * sa reprise « par le crédit du compte 759 », celle du 679 le débite « par le
 * crédit du compte 59 ». Le chapitre spécial est suivi pour la dotation
 * (6791), et la reprise prend le compte de même rang (7791), qui reçoit les
 * provisions pour risques à court terme À CARACTÈRE FINANCIER, comme le fait
 * déjà la consolidation (`FAMILLES_PROVISION_CHANGE`). Le texte ne tranche
 * pas · le 759 de la fiche 49 serait l'autre lecture.
 *
 * Au SYCEBNL, un seul couple · 194 « Provisions pour pertes de change » (fiche
 * du compte 19), dotée par le 6971 et reprise par le 7971 (fiches des comptes
 * 69 et 79, mêmes numéros aux deux semis). Le SYCEBNL n'ouvre pas de 4997.
 */
export interface FamilleProvisionChange {
  provision: string;
  dotation: string;
  reprise: string;
}

export const PROVISION_SYCEBNL: FamilleProvisionChange = { dotation: '6971', provision: '194', reprise: '7971' };

/**
 * Ajustement d'une famille de provision à la réévaluation · AUDCIF Titre VIII
 * ch. 22 § 2.3, « La provision pour pertes de change de fin d'exercice est
 * ajustée pour tenir compte des opérations dénouées au cours de l'exercice ».
 *
 * `requise` est la provision que demande la perte latente du jour (art. 54) ;
 * `enPlace` celle que les réévaluations ANTÉRIEURES ont laissée au compte.
 * Seul l'ÉCART se passe · en hausse par la dotation, en baisse par la reprise
 * (fiche du compte 19 des deux plans, « réajusté à la clôture de chaque
 * exercice soit par dotations supplémentaires, soit par reprises des
 * provisions antérieures » ; fiche du compte 69 de l'AUDCIF, « créées ou
 * ajustées en hausse » par le 69, « ajustées en baisse ou annulées » par le
 * 79). Doter la provision entière chaque année, comme le faisait le module,
 * l'empilait · une perte de 100 provisionnée en N et toujours de 100 en N+1
 * finissait à 200 au passif, et une créance encaissée gardait sa provision
 * pour toujours.
 */
export interface AjustementProvision {
  compteProvision: string;
  compteDotation: string;
  compteReprise: string;
  requise: number;
  enPlace: number;
  /**
   * Part de `enPlace` DÉCLARÉE par le cabinet à l'ouverture (dossier repris) ·
   * `null` quand rien n'est déclaré pour ce compte, jamais zéro par défaut.
   */
  declaree?: number | null;
  /** Réserve « non déclarée » ouverte sur ce compte · `enPlace` est incomplet. */
  enPlaceIncomplete?: boolean;
  /** Dotation et reprise calculées sur une provision incomplète · provisoires. */
  montantsProvisoires?: boolean;
  dotation: number;
  reprise: number;
}

/**
 * Pur · rapproche la provision requise de la provision en place, famille par
 * famille, et rend l'écart à passer. Une famille absente des deux côtés ne
 * rend rien ; une famille en place sans perte latente se REPREND en entier,
 * c'est le cas de la créance dénouée.
 */
export function ajusterProvisions(
  familles: FamilleProvisionChange[],
  requise: Map<string, number>,
  enPlace: Map<string, number>,
): AjustementProvision[] {
  const arrondi = (x: number) => Math.round(x * 100) / 100;
  const rendu: AjustementProvision[] = [];
  for (const f of familles) {
    const r = arrondi(requise.get(f.provision) ?? 0);
    const e = arrondi(enPlace.get(f.provision) ?? 0);
    if (Math.abs(r) < 0.005 && Math.abs(e) < 0.005) continue;
    const ecart = arrondi(r - e);
    rendu.push({
      compteProvision: f.provision,
      compteDotation: f.dotation,
      compteReprise: f.reprise,
      requise: r,
      enPlace: e,
      dotation: ecart > 0 ? ecart : 0,
      reprise: ecart < 0 ? -ecart : 0,
    });
  }
  return rendu;
}

/**
 * Nature de l'ouverture lue · seul VALIDE est au livre-journal (AUDCIF art.
 * 22, 2°) ; IMPORTE est le bilan d'ouverture d'un dossier repris, au
 * brouillard ; CLOTURE_PRECEDENTE est la provision du module à la clôture de
 * l'exercice précédent, pas un solde comptable.
 */
export type StatutSoldeOuverture = 'VALIDE' | 'IMPORTE' | 'CLOTURE_PRECEDENTE' | 'AUCUN';

export interface OuvertureProvision {
  montant: number;
  statut: StatutSoldeOuverture;
  /** Solde comptable fiable (à-nouveau non provisoire, ou rien) · seul il se compare à la part expliquée. */
  fiable: boolean;
  /** Le SOLDE reconstitué à la clôture de l'exercice précédent, s'il y en a un. */
  cloturePrecedente: number | null;
  /** La provision pour pertes de change du MODULE à cette clôture (version + écritures OmegaX). */
  provisionModule: number | null;
}

type ContexteProvision = {
  versions: {
    compteProvision: string;
    montant: unknown;
    dateReference: Date;
    provisionModuleContestee: boolean;
    provisionModuleContesteeMontant: unknown;
  }[];
  lignes: LigneProvisionOmegax[];
  exercices: { id: string; dateDebut: Date; dateFin: Date; statut: StatutExercice }[];
};

interface LigneProvisionOmegax {
  date: Date;
  numero: string;
  montant: number;
}

/**
 * Somme, crédit moins débit, des écritures de provision OmegaX d'une racine,
 * datées depuis `depuis` (compris, ou sans borne) jusqu'à `jusqua` (compris
 * ou non).
 */
function sommeProvision(lignes: LigneProvisionOmegax[], racine: string, depuis: Date | null, jusqua: Date, jusquaCompris: boolean): number {
  return lignes
    .filter(
      (l) =>
        l.numero.startsWith(racine) &&
        (!depuis || l.date.getTime() >= depuis.getTime()) &&
        (jusquaCompris ? l.date.getTime() <= jusqua.getTime() : l.date.getTime() < jusqua.getTime()),
    )
    .reduce((t, l) => t + l.montant, 0);
}

/**
 * La borne qu'une version franchit (huitième relecture) · au-dessus du
 * PLAFOND (le solde d'ouverture, fiable ou reconstitué), une reprise rendrait
 * le compte débiteur ; sous le PLANCHER (la provision du module à la clôture
 * précédente, bornée par ce solde), la perte déjà provisionnée par OmegaX
 * serait dotée une seconde fois.
 */
export type BorneVersion = 'PLAFOND' | 'PLANCHER';

/** Version en vigueur hors de ses bornes à l'ouverture. */
export interface ProvisionOuvertureExcessive {
  compteProvision: string;
  enPlaceOuverture: number;
  borne: BorneVersion;
  plancher: number;
  plafond: number;
  /** Le plafond est un solde comptable (à-nouveau non provisoire), sinon le solde reconstitué. */
  plafondFiable: boolean;
  /** La provision du module à la clôture précédente (à défaut, la part expliquée). */
  provisionModule: number;
  /** Version contestée dont la provision du module a changé depuis · le montant contesté, figé. */
  contesteeAuMontant: number | null;
}

/**
 * BORNES D'UNE VERSION (huitième relecture, règle unique pour les trois
 * chemins · solde fiable, solde reconstitué, provision du module). Plafond ·
 * le solde. Plancher · le plus petit de la provision du module à la clôture
 * précédente (à défaut, la part expliquée par les écritures OmegaX) et du
 * solde. Une version déclarée AVANT la réévaluation de l'exercice précédent
 * (vraie quand elle l'a été) tombe sous le plancher dès que cette
 * réévaluation dote · sans la borne basse, le module dotait la même perte une
 * seconde fois, écriture équilibrée et balance bouclée (CLAUDE.md § 10 bis).
 * Sous le plancher, seule une version qui CONTESTE expressément la provision
 * du module (`provisionModuleContestee`, avec son propre motif) passe · le
 * motif de correction ne l'ouvre jamais, sans quoi toute correction d'une
 * version utilisée (qui exige déjà un motif) rouvrait la double dotation.
 */
export function bornesDeVersion(ouverture: OuvertureProvision, explique: number): { plancher: number; plafond: number; module: number } {
  const module = ouverture.provisionModule ?? explique;
  return { plancher: arrondiCentime(Math.min(module, ouverture.montant)), plafond: ouverture.montant, module: arrondiCentime(module) };
}

/** Le refus, nommé, d'une version hors de ses bornes · montants, conséquence, issues. */
export function libelleVersionHorsBornes(x: ProvisionOuvertureExcessive): string {
  const v = x.enPlaceOuverture.toFixed(2);
  const solde = x.plafondFiable ? "solde créditeur d'ouverture" : "solde reconstitué à la clôture de l'exercice précédent";
  if (x.borne === 'PLAFOND') {
    return (
      `${x.compteProvision} · ${v} au-dessus du ${solde} (${x.plafond.toFixed(2)}) · une reprise rendrait le compte débiteur ; ` +
      `déclarez entre ${x.plancher.toFixed(2)} et ${x.plafond.toFixed(2)}`
    );
  }
  if (x.contesteeAuMontant !== null) {
    return (
      `${x.compteProvision} · la provision passée par OmegaX a changé depuis la contestation (${x.contesteeAuMontant.toFixed(2)} ` +
      `contestés, ${x.provisionModule.toFixed(2)} aujourd'hui) · la perte provisionnée depuis serait dotée une seconde fois ; ` +
      `confirmez ou corrigez par une version datée plus tard (retouchée si aucune réévaluation ne l'a utilisée), entre ` +
      `${x.plancher.toFixed(2)} et ${x.plafond.toFixed(2)} (le ${solde})`
    );
  }
  return (
    `${x.compteProvision} · ${v} sous la provision pour pertes de change passée par OmegaX jusqu'à la clôture précédente ` +
    `(${x.provisionModule.toFixed(2)}) · la perte déjà provisionnée par OmegaX serait dotée une seconde fois ; déclarez entre ` +
    `${x.plancher.toFixed(2)} et ${x.plafond.toFixed(2)} (le ${solde}) une version corrigée (retouchée si aucune réévaluation ne ` +
    "l'a utilisée, sinon au début d'un exercice postérieur avec son motif), ou, si la provision du module est erronée, " +
    'déclarez-le expressément (« La provision passée par OmegaX ne correspond pas à la provision de change réelle », avec le motif de la contestation)'
  );
}

export interface ProvisionOuvertureNonDeclaree {
  compteProvision: string;
  soldeOuverture: number;
  /** Part du solde d'ouverture expliquée par les écritures de provision OmegaX antérieures. */
  explique: number;
  statutOuverture: StatutSoldeOuverture;
}

const arrondiCentime = (x: number) => Math.round(x * 100) / 100;

/** Reprise d'un verrou de provision laissé par un processus tombé · convention d'OmegaX, quinze minutes. */
export const ECHEANCE_VERROU_PROVISION_MS = 15 * 60 * 1000;
export const MOTIF_VERROU_PROVISION =
  'Une opération sur la provision pour pertes de change est en cours sur ce dossier · réessayez après sa fin.';

/**
 * La version en vigueur à une date · la plus récente dont le début est AU
 * PLUS TARD cette date. Elle décrit la provision existant au début d'un
 * exercice (fiche du compte 77) · une réévaluation datée de ce jour même la
 * trouve en place.
 */
export function versionEnVigueur<T extends { dateReference: Date }>(versions: T[], date: Date): T | undefined {
  let retenue: T | undefined;
  for (const v of versions) {
    if (v.dateReference.getTime() > date.getTime()) continue;
    if (!retenue || v.dateReference.getTime() > retenue.dateReference.getTime()) retenue = v;
  }
  return retenue;
}

/**
 * Comptes de provision qu'une déclaration d'ouverture peut viser · ceux de la
 * famille du référentiel, et eux seuls. Au SYCEBNL, le 194 seul (pas de 4997
 * au semis, et l'unique couple du référentiel est 194 · 6971 / 7971).
 */
export function comptesProvisionDeclarables(referentiel: Referentiel): string[] {
  return referentiel === Referentiel.SYSCOHADA
    ? Object.values(PROVISION_SYSCOHADA).map((f) => f.provision)
    : [PROVISION_SYCEBNL.provision];
}

/**
 * Refus d'une déclaration de provision d'ouverture, ou `null`. Même règle à
 * la porte et au service · compte hors de la famille du référentiel, montant
 * négatif ou illisible (une provision est un passif, zéro admis · « ce 4991
 * ne porte aucune perte de change » est une réponse), date illisible, source
 * absente. La source est exigée parce que le solde du compte ne prouve rien ·
 * le 4991 et le 4997 portent aussi d'autres risques (un litige).
 */
export function motifRefusDeclarationOuverture(
  referentiel: Referentiel,
  d: { compteProvision?: string; montant?: number; dateReference?: string; source?: string; provisionModuleContestee?: boolean; motifContestation?: string },
): string | null {
  const admis = comptesProvisionDeclarables(referentiel);
  if (!d.compteProvision || !admis.includes(d.compteProvision)) {
    return (
      `Le compte ${d.compteProvision ?? '(absent)'} ne porte pas de provision pour pertes de change dans ce référentiel · ` +
      `comptes admis : ${admis.join(', ')}.`
    );
  }
  if (typeof d.montant !== 'number' || !Number.isFinite(d.montant) || d.montant < 0) {
    return 'Le montant de la provision existant à l’ouverture est un nombre positif ou nul.';
  }
  if (!d.dateReference || Number.isNaN(new Date(d.dateReference).getTime())) {
    return 'La date à laquelle la provision existait est exigée.';
  }
  if (!d.source || d.source.trim().length === 0) {
    return 'La source du montant déclaré est exigée (pièce, balance d’ouverture, liasse de l’exercice précédent).';
  }
  // LA CONTESTATION SE DÉCLARE AVEC SON PROPRE MOTIF (huitième relecture) ·
  // elle seule admet une version sous la provision du module, et le motif de
  // correction ne la remplace pas.
  if (d.provisionModuleContestee === true && (!d.motifContestation || d.motifContestation.trim().length === 0)) {
    return 'La provision passée par OmegaX est déclarée erronée · dites pourquoi (motif de la contestation, distinct du motif de correction).';
  }
  if (d.provisionModuleContestee !== true && d.motifContestation && d.motifContestation.trim().length > 0) {
    return 'Un motif de contestation sans contestation déclarée ne se garde pas · cochez « La provision passée par OmegaX est erronée », ou retirez ce motif.';
  }
  return null;
}

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
  /**
   * Provision REQUISE par la perte latente du jour (art. 54), toutes familles
   * confondues · ce n'est pas la dotation, qui n'en est que l'écart avec la
   * provision en place (`ajustementsProvision`).
   */
  provision: number;
  /**
   * Provision en place, toutes familles confondues · la provision DÉCLARÉE à
   * l'ouverture, plus ce que les réévaluations postérieures à sa date ont
   * passé.
   */
  provisionEnPlace: number;
  /**
   * Comptes de provision sans version déclarée en vigueur dont le solde
   * d'ouverture (validé, provisoire ou reconstitué) diffère de ce que les
   * réévaluations OmegaX expliquent · la provision en place est lue sans
   * cette part, sous RÉSERVE (null n'est pas zéro), et le passage des
   * écritures est REFUSÉ tant qu'elle n'est pas déclarée.
   */
  provisionsOuvertureNonDeclarees: ProvisionOuvertureNonDeclaree[];
  /** Vrai pendant une réserve · « Provision en place » manque la part non déclarée (M2). */
  provisionEnPlaceIncomplete: boolean;
  /**
   * Versions en vigueur qui dépassent le solde créditeur d'ouverture · la
   * reprise rendrait le compte débiteur. Le passage est REFUSÉ tant qu'elles
   * ne sont pas corrigées (troisième relecture) · c'est le cas d'une version
   * de N+1 déclarée avant que N ne reprenne sa provision.
   */
  provisionsOuvertureExcessives: ProvisionOuvertureExcessive[];
  /** Écart à passer, famille par famille · dotation ou reprise, jamais les deux. */
  ajustementsProvision: AjustementProvision[];
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
  /**
   * Positions en devise que le texte ne réévalue pas (immobilisations,
   * avances sur immobilisations, titres, stocks, fonds propres, gestion) ·
   * montrées avec leur motif, jamais réévaluées ni tues
   * (`perimetre-reevaluation.ts`).
   */
  positionsNonReevaluees: { numero: string; intitule: string; deviseCode: string; montantDevise: number; motif: string }[];
  /**
   * LE COURS RETENU, devise par devise (identifiant → cours) · gardé sur
   * l'enregistrement de la réévaluation (décision D5) · `poserCours` remplace
   * le cours d'une date sans trace, et l'écriture des écarts ne porte ni
   * devise ni cours.
   */
  coursUtilises: Record<string, number>;
  /**
   * Disponibilités dont l'écart passé à la clôture précédente ne se relit pas
   * sans deviner (ligne A5 bis) · leur valeur comptable serait fausse de cet
   * écart. Le calcul se montre, le PASSAGE est refusé tant que la cause n'est
   * pas levée (à-nouveau à relancer, réévaluation à repasser).
   */
  reportsDisponibilitesNonEtablis: string[];
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
/**
 * LES ÉCRITURES D'UNE RÉÉVALUATION ANNULÉE ET LEURS NÉGATIFS (relecture
 * adverse D6, M1) · validées, elles restent au journal avec leur inscription
 * en négatif, et se neutralisent. Ni l'une ni l'autre n'est une ligne « hors
 * réévaluation » · comptées comme telles, elles allumaient l'alerte de la
 * provision passée à la main.
 */
const ANNULEE = { is: { annuleeLe: { not: null } } };
const ECRITURES_D_UNE_REEVALUATION_ANNULEE: Prisma.EcritureWhereInput[] = [
  { reevaluationEcarts: ANNULEE },
  { reevaluationProvision: ANNULEE },
  { reevaluationExtourne: ANNULEE },
  { corrigeEcriture: { is: { OR: [{ reevaluationEcarts: ANNULEE }, { reevaluationProvision: ANNULEE }, { reevaluationExtourne: ANNULEE }] } } },
];

/**
 * Ce qu'il faut d'une réévaluation pour relire l'écart de ses disponibilités
 * (`ecartsDeDisponibilitesDe`) · une seule sélection, partagée par le report,
 * la contre-passation, la déclaration et la liste.
 */
const SELECTION_REEVALUATION_RELUE = {
  id: true,
  exerciceId: true,
  dateReevaluation: true,
  createdAt: true,
  annuleeLe: true,
  coursUtilises: true,
  ecartsDisponibilites: true,
  ventilationDisponibilites: true,
  ecritureEcarts: {
    select: {
      statut: true,
      valideeAt: true,
      lignes: { select: { compteId: true, debit: true, credit: true, compte: { select: { numero: true } } } },
    },
  },
} satisfies Prisma.ReevaluationSelect;

type ReevaluationRelue = Prisma.ReevaluationGetPayload<{ select: typeof SELECTION_REEVALUATION_RELUE }>;

/** Débit moins crédit de l'écriture des écarts, par banque ou caisse (52, 53, 55, 57, 58). */
function passeSurLesDisponibilites(reeval: Pick<ReevaluationRelue, 'ecritureEcarts'>): Map<string, number> {
  const passe = new Map<string, number>();
  for (const l of reeval.ecritureEcarts?.lignes ?? []) {
    if (!estDisponibilite(l.compte.numero)) continue;
    passe.set(l.compteId, (passe.get(l.compteId) ?? 0) + Number(l.debit) - Number(l.credit));
  }
  return passe;
}

@Injectable()
export class DevisesService {
  private readonly journal = new Logger(DevisesService.name);

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

  /**
   * COTE UN COURS SANS JAMAIS RÉÉCRIRE CELUI QUI EXISTE À LA MÊME DATE · la
   * voie du gestionnaire de paie (audit final F247, 2026-09-28). `poserCours`
   * est un `upsert`, juste pour le comptable qui corrige un cours, et faux
   * pour celui qui vient seulement combler le cours du jour · `CoursDevise`
   * n'est pas au journal d'audit, et le cours réécrit changerait sans trace.
   * Une vérification lue avant d'écrire ne suffisait pas · un cours posé entre
   * la lecture et l'écriture était réécrit quand même. C'est donc la clé
   * unique (devise, date) qui refuse, à l'instant de l'écriture, et le refus
   * est un 409 NOMMÉ (`dejaCote`), jamais la violation brute de la base.
   */
  async ajouterCours(tenantId: string, deviseId: string, dto: PoserCoursDto, dejaCote: string) {
    await this.trouver(tenantId, deviseId);
    const date = new Date(dto.date);
    try {
      return await this.prisma.coursDevise.create({
        data: { deviseId, date, cours: new Prisma.Decimal(dto.cours), source: dto.source },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(dejaCote);
      throw e;
    }
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
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { referentiel: true } });
    if (!tenant) throw new BadRequestException('Dossier introuvable');

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

    // LES GROUPES PARTIELS DÉNOUÉS DANS LEUR DEVISE sortent de la position,
    // quel que soit le reste du compte (ligne A6, `groupesDenoues`) · leur
    // reste en francs est du RÉALISÉ, proposé au lettrage, jamais un écart de
    // conversion. Lus sur toutes leurs lignes de l'exercice à la date, francs
    // compris.
    const idsGroupes = [
      ...new Set(lignes.filter((l) => l.lettrageId && !estDisponibilite(l.compte.numero)).map((l) => l.lettrageId!)),
    ];
    const denoues = idsGroupes.length
      ? groupesDenoues(
          (
            await this.prisma.ligneEcriture.findMany({
              // Bornée à l'EXERCICE de la position · un groupe à cheval sur N
              // et N+1 se lirait soldé en devise par ses lignes de N, et son
              // règlement de N+1 sortirait de la position, laissant
              // l'à-nouveau réévalué comme une dette vivante.
              where: { lettrageId: { in: idsGroupes }, ecriture: { tenantId, exerciceId: dto.exerciceId, date: { lte: date } } },
              select: {
                lettrageId: true,
                debit: true,
                credit: true,
                deviseId: true,
                montantDevise: true,
                lettrage: { select: { code: true } },
              },
            })
          ).map((l) => ({
            lettrageId: l.lettrageId!,
            code: l.lettrage?.code ?? '',
            debit: Number(l.debit),
            credit: Number(l.credit),
            deviseId: l.deviseId,
            montantDevise: l.montantDevise === null ? null : Number(l.montantDevise),
          })),
        )
      : new Map<string, { code: string; ecart: number }>();
    const groupesSignales = new Set<string>();
    const positionsNonReevaluees: RapportReevaluation['positionsNonReevaluees'] = [];

    // Agrégation par (compte, devise) : c'est la position nette qui se
    // réévalue, pas chaque ligne prise isolément.
    const positions = new Map<string, PositionDevise>();
    for (const l of lignes) {
      if (!l.devise) continue;
      const denoue = l.lettrageId ? denoues.get(l.lettrageId) : undefined;
      if (denoue) {
        if (!groupesSignales.has(l.lettrageId!)) {
          groupesSignales.add(l.lettrageId!);
          positionsNonReevaluees.push({
            numero: l.compte.numero,
            intitule: l.compte.intitule,
            deviseCode: l.devise.code,
            montantDevise: 0,
            motif: `lettrage ${denoue.code.toLowerCase()} · ${motifPositionDenouee(0, denoue.ecart) ?? 'position dénouée'}`,
          });
        }
        continue;
      }
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
      // (débit moins crédit) qui le donne. « Débit positif » ne suffisait pas ·
      // une ligne de crédit inscrite en négatif (correction, réimputation)
      // aurait compté une seconde fois l'opération qu'elle annule.
      const sens = Number(l.debit) - Number(l.credit) >= 0 ? 1 : -1;
      acc.montantDevise += sens * Number(l.montantDevise ?? 0);
      acc.valeurComptable += Number(l.debit) - Number(l.credit);
      positions.set(cle, acc);
    }

    // UNE DISPONIBILITÉ PART DE SA VALEUR DE CLÔTURE PRÉCÉDENTE (ligne A5
    // bis). Son écart de N est RÉALISÉ et ne se contre-passe pas (AUDCIF
    // art. 57) · la banque ouvre N+1 à la valeur de clôture de N. Or l'écart
    // a été passé sans devise, et l'à-nouveau le range dans le reste en
    // francs, hors de la ligne de la devise · lue sur ses seules lignes en
    // devise, la position repartait du coût historique et l'écart de N
    // était passé une seconde fois. Les écarts reportés s'ajoutent donc à sa
    // valeur comptable, compte par compte et devise par devise.
    const clesDisponibilites = [...positions.values()].filter((p) => p.estTresorerie).map((p) => `${p.compteId}|${p.deviseId}`);
    const reports =
      clesDisponibilites.length > 0
        ? await this.ecartsReportesDesDisponibilites(tenantId, exercice, clesDisponibilites)
        : { parCle: new Map<string, number>(), reserves: [] as string[] };
    for (const p of positions.values()) {
      const report = reports.parCle.get(`${p.compteId}|${p.deviseId}`);
      if (report !== undefined) p.valeurComptable = Math.round((p.valeurComptable + report) * 100) / 100;
    }

    const coursManquants = new Set<string>();
    const coursUtilises: Record<string, number> = {};
    const resultat: PositionDevise[] = [];
    for (const p of positions.values()) {
      if (Math.abs(p.montantDevise) < 0.005 && Math.abs(p.valeurComptable) < 0.005) continue;
      // AUDCIF Titre VIII ch. 22 · seuls créances, dettes et disponibilités
      // prennent le cours de clôture ; le reste garde le cours du jour de
      // l'opération, et c'est dit plutôt que tu.
      // UNE POSITION DÉNOUÉE NE SE RÉÉVALUE PAS (ligne A6). Soldée dans sa
      // devise, elle n'existe plus · ce qui reste en francs sur une créance
      // ou une dette est l'écart de change RÉALISÉ à son règlement (AUDCIF
      // art. 55, ch. 22 § 2.3, au 656 / 756 ou 676 / 776), jamais une perte
      // probable ou un gain latent (art. 54, 478 / 479). La réévaluer posait
      // le réalisé au 478 ou 479, le provisionnait (A5), puis l'extourne de
      // l'ouverture le rouvrait · il se dit et se passe par le lettrage
      // (« Écart de change »). Une disponibilité, elle, garde la conversion
      // de l'art. 57, dont l'écart est déjà réalisé.
      const motif =
        motifHorsReevaluation(p.numero, tenant.referentiel) ??
        (estDisponibilite(p.numero) ? null : motifPositionDenouee(p.montantDevise, p.valeurComptable));
      if (motif) {
        positionsNonReevaluees.push({
          numero: p.numero,
          intitule: p.intitule,
          deviseCode: p.deviseCode,
          montantDevise: Math.round(p.montantDevise * 100) / 100,
          motif,
        });
        continue;
      }
      const cours = await this.coursA(p.deviseId, date);
      if (cours === null) {
        coursManquants.add(p.deviseCode);
        continue;
      }
      p.coursCloture = cours;
      coursUtilises[p.deviseId] = cours;
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

    // --- AJUSTEMENT DE LA PROVISION EN PLACE · Titre VIII ch. 22 § 2.3 ------
    //
    // La provision requise se range par FAMILLE (le compte de provision que la
    // nature de la position appelle), puis se rapproche de celle que les
    // réévaluations antérieures ont laissée. Seul l'écart se passe.
    const estSyscohada = tenant.referentiel === Referentiel.SYSCOHADA;
    const familles = estSyscohada ? Object.values(PROVISION_SYSCOHADA) : [PROVISION_SYCEBNL];
    const requiseParFamille = new Map<string, number>();
    for (const p of resultat) {
      if (p.provisionnable <= 0.005) continue;
      const f = estSyscohada ? PROVISION_SYSCOHADA[naturePosition(p.numero)] : PROVISION_SYCEBNL;
      requiseParFamille.set(f.provision, (requiseParFamille.get(f.provision) ?? 0) + p.provisionnable);
    }
    const enPlace = await this.provisionsEnPlace(tenantId, exercice, date, familles);
    const ajustementsProvision = ajusterProvisions(familles, requiseParFamille, enPlace.parFamille).map((a) => ({
      ...a,
      declaree: enPlace.declarees.get(a.compteProvision) ?? null,
      // Réserve ouverte · la part non déclarée manque, le montant est incomplet (M2).
      enPlaceIncomplete: enPlace.nonDeclarees.some((n) => n.compteProvision === a.compteProvision),
    })).map((a) => ({
      ...a,
      // Dotation et reprise calculées sur une provision en place incomplète ·
      // PROVISOIRES, et dites telles (relecture adverse, troisième passe, point 1).
      montantsProvisoires: a.enPlaceIncomplete,
    }));

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
    const avertissements: string[] = [...enPlace.avertissements, ...reports.reserves];
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
      provisionEnPlace: Math.round(ajustementsProvision.reduce((t, a) => t + a.enPlace, 0) * 100) / 100,
      ajustementsProvision,
      provisionsOuvertureNonDeclarees: enPlace.nonDeclarees,
      provisionEnPlaceIncomplete: enPlace.nonDeclarees.length > 0,
      provisionsOuvertureExcessives: enPlace.excessives,
      provisionSansPositionGlobale: Math.round(perteLatente * 100) / 100,
      positionGlobaleRetenue: positionGlobale,
      avertissements,
      coursManquants: [...coursManquants],
      positionsNonReevaluees,
      coursUtilises,
      reportsDisponibilitesNonEtablis: reports.reserves,
    };
  }

  /** Passe les écritures de réévaluation, et la provision qui l'accompagne. */
  async reevaluer(tenantId: string, createdBy: string, dto: ReevaluerDto) {
    // À LA CLÔTURE, ET SEULEMENT À ELLE (décision D1 du 2026-10-03, Manasse,
    // « réfère-toi à la loi ») · AUDCIF art. 54, les créances et dettes « qui
    // subsistent au bilan à la date de clôture » sont corrigées « sur la base
    // du dernier cours de change à cette date » ; Titre VIII ch. 22 § 2.2,
    // « dernier cours de change à la date de clôture ». Une réévaluation datée
    // du 30 septembre portait au 478 une position dénouée en novembre, et le
    // réalisé passait à côté.
    if (dto.dateReevaluation !== undefined) {
      const exercice = await this.prisma.exercice.findFirst({ where: { id: dto.exerciceId, tenantId }, select: { dateFin: true } });
      if (!exercice) throw new BadRequestException('Exercice introuvable pour ce dossier');
      const motif = motifDateReevaluation(dto.dateReevaluation, exercice.dateFin);
      if (motif) throw new BadRequestException(motif);
    }
    if (dto.simulation) return { rapport: await this.calculer(tenantId, dto), ecritures: [] as string[] };
    return this.sousVerrouDuDossier(tenantId, 'REEVALUATION', () => this.reevaluerSousVerrou(tenantId, createdBy, dto));
  }

  /**
   * UN SEUL GESTE À LA FOIS PAR DOSSIER sur la provision pour pertes de
   * change · réévaluer, déclarer et retirer une version lisent tous « une
   * réévaluation est-elle passée dans cette période ? », et deux gestes
   * simultanés liraient chacun l'état d'avant l'autre.
   *
   * UN VERROU QUI NE RETIENT AUCUNE CONNEXION (relecture adverse, quatrième
   * passe). Le premier verrou (`pg_advisory_xact_lock` dans une transaction
   * gardée ouverte pendant le travail) retenait une connexion du pool pendant
   * que le travail en réclamait d'autres · à `connection_limit=3`, trois
   * déclarations simultanées figeaient dix secondes et finissaient en 500, et
   * une lecture d'un AUTRE dossier attendait aussi. Ici, une LIGNE par
   * dossier (`VerrouProvisionChange`, clé unique sur le dossier), posée par
   * une insertion seule et retirée en `finally` · un second geste reçoit
   * aussitôt un 409 nommé, sans attendre ni retenir quoi que ce soit.
   *
   * L'ÉCHÉANCE (`ECHEANCE_VERROU_PROVISION_MS`, convention d'OmegaX) ne sert
   * qu'à reprendre la ligne d'un processus tombé avant son `finally` · elle
   * est bien au-delà de la durée d'un geste, et c'est une borne de reprise,
   * pas une durée de travail.
   */
  private async sousVerrouDuDossier<T>(tenantId: string, geste: string, travail: () => Promise<T>): Promise<T> {
    const maintenant = new Date();
    await this.prisma.verrouProvisionChange.deleteMany({ where: { tenantId, echeance: { lt: maintenant } } });
    let verrou: { id: string };
    try {
      verrou = await this.prisma.verrouProvisionChange.create({
        data: { tenantId, geste, echeance: new Date(maintenant.getTime() + ECHEANCE_VERROU_PROVISION_MS) },
        select: { id: true },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // Le refus dit DEPUIS QUAND le geste en cours tient le verrou et QUAND
        // il échoit (cinquième passe, mineur 2) · un processus tombé laisse sa
        // ligne jusqu'à l'échéance, et « dans un instant » mentirait.
        const tenu = await this.prisma.verrouProvisionChange.findFirst({
          where: { tenantId },
          select: { geste: true, createdAt: true, echeance: true },
        });
        throw new ConflictException(
          tenu
            ? `${MOTIF_VERROU_PROVISION} Geste en cours · ${tenu.geste}, depuis le ${tenu.createdAt.toISOString()} ; ` +
                `le verrou échoit au plus tard le ${tenu.echeance.toISOString()}.`
            : MOTIF_VERROU_PROVISION,
        );
      }
      throw e;
    }
    let resultat!: T;
    let erreur: unknown = null;
    let echec = false;
    try {
      resultat = await travail();
    } catch (e) {
      echec = true;
      erreur = e;
    }
    try {
      await this.prisma.verrouProvisionChange.deleteMany({ where: { tenantId, id: verrou.id } });
    } catch (liberation) {
      // Le retrait du verrou a échoué · il ne MASQUE jamais l'issue du geste.
      // Consigné, et la ligne tombera à son échéance.
      this.journal.error(
        `Verrou de provision du dossier ${tenantId} non retiré · il échoit à son échéance`,
        liberation instanceof Error ? liberation.stack : String(liberation),
      );
    }
    if (echec) throw erreur;
    return resultat;
  }

  /**
   * RÉÉVALUER DANS L'ORDRE DES EXERCICES (relecture adverse, troisième passe ·
   * décision du coordinateur pour Manasse, 2026-10-02). Fiche du compte 19 ·
   * « Le compte 19 est réajusté à la clôture de CHAQUE exercice, soit par
   * dotations supplémentaires, soit par reprises des provisions antérieures »
   * · chaque réajustement part du précédent. Et règle d'OmegaX déjà posée
   * pour la clôture (« Clôture DANS L'ORDRE · refus si un antérieur est
   * ouvert », CLAUDE.md). Réévaluer N+1 avant N dotait deux fois la même
   * perte · N+1 lisait au 4991 un à-nouveau sans la provision que N n'avait
   * pas encore passée, et N la passait ensuite sur sa propre ouverture.
   * L'exercice est REFUSÉ tant qu'un exercice antérieur ENCORE OUVERT n'est ni
   * réévalué ni SANS OBJET (aucune position à convertir, aucune provision à
   * doter ou reprendre, aucune réserve ouverte) · sans cette exception, un N
   * sans devises ne pourrait jamais être réévalué et rouvrirait l'impasse.
   * Un antérieur CLÔTURÉ ne bloque pas.
   */
  /**
   * L'ÉCART DE CONVERSION DE L'EXERCICE PRÉCÉDENT DOIT ÊTRE CONTRE-PASSÉ
   * AVANT DE RÉÉVALUER (ligne A5 bis). Une créance ou une dette se réévalue
   * depuis ses lignes en devise, au coût historique (`calculer`) · l'écart de
   * N, passé sans devise au 478 ou 479 et au compte du tiers, n'est soldé que
   * par la contre-passation de l'ouverture (Guide, Partie 2 ch. 22,
   * Application 84, « Contrepassation de l'écart au 01/01/N+1 : 411 · 4781 » ;
   * Application 85, « 4793 · 4812 »). Oubliée, la réévaluation de
   * N+1 repassait l'écart de N au tiers et laissait le 478 ou le 479 de N en
   * place · deux fois le même écart, écriture équilibrée, balance bouclée.
   * Vise la DERNIÈRE réévaluation non annulée antérieure à l'exercice, à
   * travers les exercices qui n'en ont pas (second tour, B-II) · un N+1
   * clôturé sans réévaluation ne fait pas oublier la contre-passation de N.
   * Et seulement si elle porte un écart de conversion (une réévaluation des
   * seules disponibilités n'a rien à contre-passer, AUDCIF art. 57).
   *
   * LA CONTRE-PASSATION DOIT ÊTRE À SA PLACE (relecture adverse, M1 ; second
   * tour, B-II) · à l'ouverture du premier exercice OUVERT qui suit la
   * réévaluation, tous ceux d'entre eux clôturés (`cibleDeContrePassation`),
   * au plus tard dans celui-ci. Plus loin, l'écart de N restait en place
   * pendant un exercice ouvert, que sa réévaluation repassait depuis le coût
   * historique. L'issue est nommée · annuler cette contre-passation
   * (Devises), puis la repasser dans la cible.
   */
  private async motifContrePassationManquante(tenantId: string, exercice: { id: string; dateDebut: Date }): Promise<string | null> {
    const jourDe = (d: Date) => d.toISOString().slice(0, 10);
    // Borne de sûreté · dix ans de conservation (AUDCIF art. 24), et au-delà.
    const anterieurs = await this.prisma.exercice.findMany({
      where: { tenantId, dateFin: { lt: exercice.dateDebut } },
      orderBy: { dateFin: 'desc' },
      take: 50,
      select: { id: true, dateDebut: true, dateFin: true },
    });
    let exerciceReevalue: { id: string; dateDebut: Date; dateFin: Date } | null = null;
    let reeval: {
      dateReevaluation: Date;
      ecritureExtourneId: string | null;
      ecritureExtourne: { exerciceId: string; numeroPiece: number | null; date: Date; exercice: { dateDebut: Date } } | null;
      ecritureEcarts: { lignes: { debit: unknown; credit: unknown; compte: { numero: string } }[] } | null;
    } | null = null;
    for (const e of anterieurs) {
      if (e.id === exercice.id) continue;
      reeval = await this.prisma.reevaluation.findFirst({
        where: { tenantId, exerciceId: e.id, annuleeLe: null },
        select: {
          dateReevaluation: true,
          ecritureExtourneId: true,
          ecritureExtourne: { select: { exerciceId: true, numeroPiece: true, date: true, exercice: { select: { dateDebut: true } } } },
          ecritureEcarts: { select: { lignes: { select: { debit: true, credit: true, compte: { select: { numero: true } } } } } },
        },
      });
      if (reeval) {
        exerciceReevalue = e;
        break;
      }
    }
    if (!reeval?.ecritureEcarts || !exerciceReevalue) return null;
    const jour = jourDe(reeval.dateReevaluation);
    const cible = await this.cibleDeContrePassation(tenantId, exerciceReevalue.dateFin);
    const ouvertureCible =
      !cible || cible.id === exercice.id
        ? "à l'ouverture de cet exercice"
        : `à l'ouverture de l'exercice du ${jourDe(cible.dateDebut)} au ${jourDe(cible.dateFin)}, le premier ouvert après la réévaluation`;
    if (reeval.ecritureExtourneId) {
      const y = reeval.ecritureExtourne;
      if (!y) return null;
      // À SA PLACE · au plus tard dans cet exercice, et aucun exercice OUVERT
      // entre la réévaluation et elle.
      const auPlusTardIci = y.exercice.dateDebut.getTime() <= exercice.dateDebut.getTime();
      const ouvertEntreDeux = await this.prisma.exercice.findFirst({
        where: {
          tenantId,
          statut: StatutExercice.OUVERT,
          dateDebut: { gt: exerciceReevalue.dateFin, lt: y.exercice.dateDebut },
        },
        select: { id: true },
      });
      if (auPlusTardIci && !ouvertEntreDeux) return null;
      return (
        `La contre-passation de la réévaluation du ${jour} (pièce n° ${y.numeroPiece ?? '·'} du ${jourDe(y.date)}) n'est pas ` +
        "à l'ouverture du premier exercice ouvert qui suit la réévaluation · ses écarts de conversion y sont donc toujours en " +
        'place, et réévaluer cet exercice les repasserait. Annulez cette contre-passation (Devises, « Annuler la ' +
        `contre-passation »), passez-la ${ouvertureCible}, puis réévaluez.`
      );
    }
    const partage = partagerLignesDEcarts(
      reeval.ecritureEcarts.lignes.map((l) => ({ compteNumero: l.compte.numero, debit: Number(l.debit), credit: Number(l.credit) })),
    );
    if (partage.aContrePasser.length === 0) return null;
    return (
      `La réévaluation du ${jour} n'est pas contre-passée · ses écarts de conversion (478, 479 et comptes de tiers) sont ` +
      "toujours en place, et réévaluer cet exercice repasserait le même écart sur les créances et dettes en devise. " +
      `Passez la contre-passation de la réévaluation du ${jour} (Devises) ${ouvertureCible}, puis réévaluez · ` +
      "si la première période en est close, la pièce est reportée au premier jour non clôturé, sa date de valeur restant " +
      "l'ouverture (AUDCIF art. 22, 4°)." +
      (partage.motifRefus
        ? " Son écriture des écarts ne se partage pas · demandez la contre-passation intégrale (« Contre-passation intégrale »)."
        : '')
    );
  }

  /**
   * L'EXERCICE QUI REÇOIT LA CONTRE-PASSATION (second tour, B-II) · celui
   * qui suit immédiatement la réévaluation s'il est OUVERT, sinon le premier
   * exercice ouvert dont tous les intermédiaires sont clôturés. Refuser un
   * exercice suivant clôturé enfermait le dossier · la contre-passation
   * oubliée ne pouvait plus se passer nulle part, et la réévaluation de
   * N+2 repassait l'écart de N au tiers.
   *
   * La contre-passation des écarts de conversion ne touche que le BILAN (le
   * 478, le 479 et le compte de tiers qu'ils ajustent) · posée plus tard,
   * elle ne déplace aucun résultat ; l'exercice intermédiaire clôturé garde à
   * son bilan l'écart de N, qu'il n'a pas réévalué. L'intégrale (B2, M2),
   * qui touche le 676 ou le 776, se règle sur l'exercice qui la reçoit.
   * `null` · aucun exercice ouvert après la réévaluation.
   */
  private async cibleDeContrePassation(
    tenantId: string,
    finExerciceReevalue: Date,
  ): Promise<{ id: string; dateDebut: Date; dateFin: Date; statut: StatutExercice } | null> {
    return this.prisma.exercice.findFirst({
      where: { tenantId, dateDebut: { gt: finExerciceReevalue }, statut: StatutExercice.OUVERT },
      orderBy: { dateDebut: 'asc' },
      select: { id: true, dateDebut: true, dateFin: true, statut: true },
    });
  }

  private async motifRefusOrdre(tenantId: string, exercice: { id: string; dateDebut: Date }): Promise<string | null> {
    const anterieurs = await this.prisma.exercice.findMany({
      where: { tenantId, dateFin: { lt: exercice.dateDebut }, statut: { not: StatutExercice.CLOTURE } },
      orderBy: { dateDebut: 'asc' },
      select: { id: true, dateDebut: true, dateFin: true },
    });
    for (const e of anterieurs) {
      const passee = await this.prisma.reevaluation.findFirst({ where: { tenantId, exerciceId: e.id, annuleeLe: null }, select: { id: true } });
      if (passee) continue;
      const r = await this.calculer(tenantId, { exerciceId: e.id });
      const sansObjet =
        r.positions.length === 0 &&
        !r.ajustementsProvision.some((a) => a.dotation > 0.005 || a.reprise > 0.005) &&
        r.provisionsOuvertureNonDeclarees.length === 0 &&
        // Une version incohérente bloque comme une réserve (septième passe,
        // mineur 3) · l'antérieur ne peut pas se réévaluer, ni donc la suite.
        r.provisionsOuvertureExcessives.length === 0;
      if (sansObjet) continue;
      const jour = (d: Date) => d.toISOString().slice(0, 10);
      if (r.provisionsOuvertureExcessives.length > 0) {
        return (
          `L'exercice du ${jour(e.dateDebut)} au ${jour(e.dateFin)}, antérieur et encore ouvert, porte une provision pour pertes ` +
          `de change déclarée à l'ouverture qui ne concorde pas avec son ouverture (${r.provisionsOuvertureExcessives
            .map(libelleVersionHorsBornes)
            .join(' ; ')}) · mettez-la à jour, puis réévaluez-le s'il a des positions.`
        );
      }
      // Ce qui bloque est la provision d'ouverture non déclarée de cet
      // exercice · on le dit, plutôt que « réévaluez-le » qu'il refuserait
      // (sixième passe, m1).
      if (r.provisionsOuvertureNonDeclarees.length > 0) {
        return (
          `L'exercice du ${jour(e.dateDebut)} au ${jour(e.dateFin)}, antérieur et encore ouvert, porte une provision pour pertes ` +
          `de change à l'ouverture non déclarée (${r.provisionsOuvertureNonDeclarees.map((n) => n.compteProvision).join(', ')}) · ` +
          "déclarez-la au début de cet exercice (montant, source ; zéro si le solde porte un autre risque), puis réévaluez-le " +
          "s'il a des positions. La provision se réajuste à la clôture de chaque exercice à partir de la précédente (fiche du compte 19)."
        );
      }
      return (
        `L'exercice du ${jour(e.dateDebut)} au ${jour(e.dateFin)}, antérieur et encore ouvert, n'est pas réévalué · ` +
        "réévaluez-le d'abord. La provision pour pertes de change se réajuste à la clôture de chaque exercice à partir " +
        "de la précédente (fiche du compte 19) · réévaluer celui-ci avant doterait deux fois la même perte."
      );
    }
    return null;
  }

  private async reevaluerSousVerrou(tenantId: string, createdBy: string, dto: ReevaluerDto) {
    const exerciceCourant = await this.prisma.exercice.findFirst({
      where: { id: dto.exerciceId, tenantId },
      select: { id: true, dateDebut: true },
    });
    if (!exerciceCourant) throw new BadRequestException('Exercice introuvable pour ce dossier');
    const refusOrdre = await this.motifRefusOrdre(tenantId, exerciceCourant);
    if (refusOrdre) throw new BadRequestException(refusOrdre);
    const contrePassationManquante = await this.motifContrePassationManquante(tenantId, exerciceCourant);
    if (contrePassationManquante) throw new BadRequestException(contrePassationManquante);
    const rapport = await this.calculer(tenantId, dto);
    // La réserve et la version incohérente se disent AVANT « aucune position »
    // (sixième passe, m1) · un exercice sans devise mais à provision
    // d'ouverture non déclarée doit dire ce qui manque, pas qu'il n'a rien.
    // LA RÉSERVE « NON DÉCLARÉE » ARRÊTE LE PASSAGE (décision de Manasse du
    // 2026-10-02, Q1), jamais le calcul, qui reste affichable avec elle. Fiche
    // du compte 19 · « Le compte 19 est réajusté à la clôture de chaque
    // exercice, soit par dotations supplémentaires, soit par reprises des
    // provisions antérieures » · on ne réajuste pas sans connaître la
    // provision antérieure. Et l'erreur laisserait l'écriture équilibrée et la
    // balance bouclée (CLAUDE.md § 10 bis) · elle se refuse à la racine.
    //
    // Les écarts 478 / 479 (art. 54) sont arrêtés AVEC la provision, et ce
    // n'est pas un choix de confort · une seule réévaluation par exercice
    // (index unique, audit final F54) porte les deux écritures, si bien que
    // passer les écarts seuls fermerait la porte à la provision de l'exercice.
    // La déclaration, zéro compris, lève le refus en un geste.
    if (rapport.provisionsOuvertureNonDeclarees.length > 0) {
      throw new BadRequestException(
        `Provision pour pertes de change à l'ouverture non déclarée (${rapport.provisionsOuvertureNonDeclarees
          .map((n) => n.compteProvision)
          .join(', ')}) · déclarez-la (montant, source ; zéro si le solde porte un autre risque) avant de passer ` +
          "les écritures. La provision antérieure doit être connue pour être réajustée (fiche du compte 19).",
      );
    }
    // UNE VERSION QUI DÉPASSE L'OUVERTURE NE SE PASSE PAS (troisième relecture)
    // · déclarée au début de N+1 avant que N ne reprenne une part de sa
    // provision, elle ferait reprendre en N+1 ce que N a déjà repris, et le
    // compte finirait au-dessous de la perte requise, écriture équilibrée et
    // balance bouclée (CLAUDE.md § 10 bis). Le calcul le montre ; le passage
    // attend la correction de la version (motif, Q2).
    if (rapport.provisionsOuvertureExcessives.length > 0) {
      throw new BadRequestException(
        `La provision pour pertes de change déclarée à l'ouverture ne concorde pas avec l'ouverture (${rapport.provisionsOuvertureExcessives
          .map(libelleVersionHorsBornes)
          .join(' ; ')}) · mettez la déclaration à jour avant de passer les écritures.`,
      );
    }
    // UN ÉCART REPORTÉ QUI NE SE RELIT PAS ARRÊTE LE PASSAGE (ligne A5 bis) ·
    // la banque serait réévaluée depuis une valeur fausse de l'écart de la
    // clôture précédente, écriture équilibrée et balance bouclée (CLAUDE.md
    // § 10 bis). Le calcul reste affichable, la cause est nommée.
    if (rapport.reportsDisponibilitesNonEtablis.length > 0) {
      throw new BadRequestException(rapport.reportsDisponibilitesNonEtablis.join(' ; '));
    }
    // Sans position, il reste à REPRENDRE la provision des positions dénouées
    // (ch. 22 § 2.3) · une créance encaissée dans l'exercice ne laisse aucun
    // écart, mais sa provision de l'an passé est toujours au passif. Refuser
    // ici la gardait pour toujours.
    const aAjuster = rapport.ajustementsProvision.some((a) => a.dotation > 0.005 || a.reprise > 0.005);
    if (rapport.positions.length === 0 && !aAjuster) {
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
    // UNE SEULE RÉÉVALUATION PASSÉE PAR EXERCICE (audit final F54) · ses
    // écarts sont passés sans devise, si bien qu'une seconde, à une autre
    // date, relisait les positions à leur valeur d'origine et repassait
    // l'écart entier, provision comprise. Le garde-fou ne regardait que la
    // même date. Une situation intermédiaire se lit par le calcul, qui
    // n'enregistre rien ; la réévaluation se passe une fois, à l'arrêté. La
    // base porte la même règle (index unique sur l'exercice), contre deux
    // clics simultanés.
    const dejaFaite = await this.prisma.reevaluation.findFirst({
      // Une réévaluation ANNULÉE ne compte plus (D6) · la réévaluation exacte suit.
      where: { tenantId, exerciceId: dto.exerciceId, annuleeLe: null },
      select: { dateReevaluation: true },
    });
    if (dejaFaite) {
      throw new ConflictException(
        `Une réévaluation a déjà été passée au ${dejaFaite.dateReevaluation.toISOString().slice(0, 10)} sur cet exercice · ` +
          "une seconde repasserait l'écart entier, ses écarts étant passés sans devise, et doublerait la provision. " +
          "Pour une situation intermédiaire, utilisez le calcul sans enregistrement.",
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

    const ecritureEcarts =
      lignes.length > 0
        ? await this.ecritureService.creer(tenantId, createdBy, {
            exerciceId: dto.exerciceId,
            journalId: journal.id,
            date: rapport.dateReevaluation,
            libelle: `Réévaluation des créances et dettes en devises au ${rapport.dateReevaluation}`,
            reference: 'REEVAL',
            lignes,
          })
        : null;

    // --- Ajustement de la provision ----------------------------------------
    //
    // La provision se VENTILE par nature de position en SYSCOHADA : une perte
    // sur créance client est une charge d'exploitation (6591 / 4991), une
    // perte sur emprunt en devise une charge financière (6971 / 194). Une
    // dotation unique, comme le faisait le chemin hérité du SYCEBNL, range
    // tout au financier et fausse les deux soldes intermédiaires sans qu'un
    // seul total du compte de résultat ne bouge. En SYCEBNL, toutes les
    // positions retombent sur l'unique couple du référentiel.
    //
    // Et seul l'ÉCART avec la provision en place se passe (ch. 22 § 2.3) ·
    // dotation de la hausse, reprise de la baisse, au compte de SA famille.
    // Une même perte n'est donc jamais dotée deux fois, et une provision dont
    // la position a disparu est reprise.
    let ecritureProvision: { id: string } | null = null;
    const lignesProvision: { compteId: string; debit?: number; credit?: number; libelle: string }[] = [];
    for (const a of rapport.ajustementsProvision) {
      if (a.dotation <= 0.005 && a.reprise <= 0.005) continue;
      const nature = estSyscohada ? ` (${a.compteProvision === '4991' ? 'exploitation' : 'financier'})` : '';
      const provision = await compte(a.compteProvision);
      if (a.dotation > 0.005) {
        const dotation = await compte(a.compteDotation);
        lignesProvision.push({ compteId: dotation.id, debit: a.dotation, libelle: `Dotation provision perte de change${nature}` });
        lignesProvision.push({ compteId: provision.id, credit: a.dotation, libelle: `Provision pour pertes de change${nature}` });
      } else {
        const reprise = await compte(a.compteReprise);
        lignesProvision.push({ compteId: provision.id, debit: a.reprise, libelle: `Provision pour pertes de change${nature}` });
        lignesProvision.push({ compteId: reprise.id, credit: a.reprise, libelle: `Reprise provision perte de change${nature}` });
      }
    }
    if (lignesProvision.length > 0) {
      try {
        ecritureProvision = await this.ecritureService.creer(tenantId, createdBy, {
          exerciceId: dto.exerciceId,
          journalId: journal.id,
          date: rapport.dateReevaluation,
          libelle: `Provision pour perte de change au ${rapport.dateReevaluation} · ajustement`,
          reference: 'REEVAL',
          lignes: lignesProvision,
        });
      } catch (e) {
        // L'écriture des écarts resterait sans détenteur (audit F10).
        if (ecritureEcarts) await this.ecritureService.retirerCompensation(tenantId, ecritureEcarts.id);
        throw e;
      }
    }

    // Un échec du marqueur laissait deux écritures sans détenteur au journal
    // (audit F10) · elles sont retirées, lignes puis tête, et l'erreur remonte.
    let reevaluation: { id: string };
    try {
      reevaluation = await this.prisma.reevaluation.create({
        data: {
          tenantId,
          exerciceId: dto.exerciceId,
          dateReevaluation: new Date(rapport.dateReevaluation),
          ecritureEcartsId: ecritureEcarts?.id,
          ecritureProvisionId: ecritureProvision?.id,
          coursUtilises: rapport.coursUtilises,
          // L'écart de chaque disponibilité, gardé pour la réévaluation
          // suivante · il ne se contre-passe pas (AUDCIF art. 57, ligne A5 bis).
          ecartsDisponibilites: rapport.positions
            .filter((p) => p.estTresorerie)
            .map((p) => ({ compteId: p.compteId, deviseId: p.deviseId, ecart: p.ecart })),
          createdBy,
        },
      });
    } catch (e) {
      if (ecritureEcarts) await this.ecritureService.retirerCompensation(tenantId, ecritureEcarts.id);
      if (ecritureProvision) await this.ecritureService.retirerCompensation(tenantId, ecritureProvision.id);
      throw e;
    }

    return {
      rapport,
      reevaluationId: reevaluation.id,
      ecritures: [...(ecritureEcarts ? [ecritureEcarts.id] : []), ...(ecritureProvision ? [ecritureProvision.id] : [])],
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
   *
   * L'ÉCART DES DISPONIBILITÉS N'EN EST PAS (ligne A5 bis). Il est RÉALISÉ et
   * inscrit « directement dans les produits et charges de l'exercice » (AUDCIF
   * art. 57 ; ch. 22, section 4 ; Application 86 du Guide, aucune
   * contre-passation) · seuls le 478, le 479 et le compte de tiers qu'ils
   * ajustent se contre-passent (`partagerLignesDEcarts`). Contre-passer la
   * banque la remettait au cours historique et rouvrait au 676 ou au 776 de
   * N+1 une perte ou un gain déjà supporté.
   *
   * RELECTURE ADVERSE D'A5 BIS ·
   *  · M1 · l'exercice qui suit IMMÉDIATEMENT celui de la réévaluation, et lui
   *    seul · plus tard, l'écart de N vivait pendant tout l'exercice
   *    intermédiaire, que sa réévaluation repassait depuis le coût historique.
   *  · B3 · une première période close reporte la pièce au premier jour non
   *    clôturé, sa date de valeur restant l'ouverture (AUDCIF art. 22, 4°) ·
   *    sans quoi la contre-passation était impossible, et le portillon de la
   *    réévaluation suivante fermé pour de bon.
   *  · B2 · l'exercice suivant a déjà été réévalué SOUS L'ANCIEN RÉGIME (son
   *    `ecartsDisponibilites` est nul) · il a mesuré la banque depuis son coût
   *    historique, l'ancienne contre-passation devant l'y ramener. Ne
   *    contre-passer que le 478 et le 479 laisserait l'écart de N sur la
   *    banque PLUS celui que N+1 a recompté depuis le coût · la banque et la
   *    caisse sont donc contre-passées aussi, par exception nommée.
   *  · M2 · une écriture des écarts qui ne se partage pas · la
   *    contre-passation INTÉGRALE se demande expressément.
   *  · M6 · sous le verrou du dossier, lien posé par un `update` unitaire.
   */
  async extourner(
    tenantId: string,
    createdBy: string,
    reevaluationId: string,
    exerciceSuivantId: string,
    options: { integrale?: boolean } = {},
  ) {
    return this.sousVerrouDuDossier(tenantId, 'CONTRE_PASSATION', () =>
      this.extournerSousVerrou(tenantId, createdBy, reevaluationId, exerciceSuivantId, options),
    );
  }

  private async extournerSousVerrou(
    tenantId: string,
    createdBy: string,
    reevaluationId: string,
    exerciceSuivantId: string,
    options: { integrale?: boolean },
  ) {
    const reeval = await this.prisma.reevaluation.findFirst({
      where: { id: reevaluationId, tenantId },
      include: {
        exercice: { select: { dateFin: true } },
        ecritureEcarts: { include: { lignes: { include: { compte: { select: { numero: true } } } } } },
      },
    });
    if (!reeval) throw new NotFoundException('Réévaluation introuvable pour ce dossier');
    if (reeval.annuleeLe) throw new ConflictException('Cette réévaluation est annulée · il n’y a rien à contre-passer.');
    if (reeval.ecritureExtourneId) throw new ConflictException('Cette réévaluation a déjà été extournée.');
    if (!reeval.ecritureEcarts) throw new BadRequestException("Aucune écriture d'écarts à extourner.");

    const suivant = await this.prisma.exercice.findFirst({ where: { id: exerciceSuivantId, tenantId } });
    if (!suivant) throw new BadRequestException('Exercice suivant introuvable pour ce dossier');
    // L'extourne se passe « à l'ouverture de l'exercice SUIVANT » · un exercice
    // ouvert antérieur, ou celui de la réévaluation, l'aurait annulée dans la
    // période même où elle a été constatée (même règle que les régularisations,
    // audit final F79).
    if (suivant.dateDebut.getTime() <= reeval.dateReevaluation.getTime()) {
      throw new BadRequestException(
        "La contre-passation se passe à l'ouverture d'un exercice qui commence après la réévaluation · choisissez l'exercice suivant.",
      );
    }
    // M1 et B-II · l'exercice qui suit IMMÉDIATEMENT s'il est ouvert, sinon
    // le premier ouvert dont tous les intermédiaires sont clôturés, et lui
    // seul (`cibleDeContrePassation`).
    const fin = reeval.exercice?.dateFin ?? reeval.dateReevaluation;
    const cible = await this.cibleDeContrePassation(tenantId, fin);
    if (!cible) {
      throw new BadRequestException(
        "Aucun exercice ouvert après celui de la réévaluation · ouvrez l'exercice suivant (Fin d'exercice…), puis contre-passez.",
      );
    }
    if (cible.id !== suivant.id) {
      const jour = (d: Date) => d.toISOString().slice(0, 10);
      throw new BadRequestException(
        `La contre-passation se passe à l'ouverture du premier exercice ouvert qui suit la réévaluation, celui du ` +
          `${jour(cible.dateDebut)} au ${jour(cible.dateFin)} · passée ailleurs, l'écart de conversion vivrait pendant un ` +
          'exercice ouvert, que sa réévaluation repasserait depuis le coût historique.',
      );
    }

    // Partage par la RACINE du compte, jamais par le montant ni le libellé.
    const lignes = reeval.ecritureEcarts.lignes.map((l) => ({
      ...l,
      compteNumero: l.compte.numero,
      debit: Number(l.debit),
      credit: Number(l.credit),
    }));
    const partage = partagerLignesDEcarts(lignes);
    const integrale = await this.motifContrePassationIntegrale(tenantId, suivant.id, partage, options.integrale === true);
    if (integrale.refus) throw new BadRequestException(integrale.refus);
    const aContrePasser = integrale.code ? lignes : partage.aContrePasser;
    if (aContrePasser.length === 0) {
      throw new BadRequestException(
        "Cette réévaluation ne porte que des disponibilités · leur écart est réalisé et reste au résultat de l'exercice " +
          '(AUDCIF art. 57) · il n’y a aucun écart de conversion à contre-passer.',
      );
    }

    const jourReeval = reeval.dateReevaluation.toISOString().slice(0, 10);
    const journal = await this.journalGeneral(tenantId);
    const ecriture = await this.ecritureService.creer(tenantId, createdBy, {
      exerciceId: suivant.id,
      journalId: journal.id,
      date: suivant.dateDebut.toISOString().slice(0, 10),
      // B3 · AUDCIF art. 22, 4° · une première période close reporte la
      // pièce au premier jour non clôturé, date de valeur gardée. Ouverte, la
      // date reste l'ouverture.
      reporterAuPremierJourOuvert: true,
      libelle: integrale.code
        ? `Contre-passation intégrale des écarts du ${jourReeval}, banque et caisse comprises (${LIBELLE_INTEGRALE[integrale.code]})`
        : `Contre-passation des écarts de conversion du ${jourReeval}`,
      reference: 'REEVAL',
      lignes: aContrePasser.map((l) => ({
        compteId: l.compteId,
        // Sens inverse, ligne à ligne.
        debit: l.credit || undefined,
        credit: l.debit || undefined,
        libelle: l.libelle ?? undefined,
      })),
    });

    // Lien posé sur une réévaluation encore libre (audit F10) · deux
    // extournes simultanées passaient toutes deux le test du dessus, et la
    // première restait au journal sans détenteur. Un `update` UNITAIRE (M6)
    // · le journal d'audit garde l'avant et l'après ; P2025 si une autre
    // contre-passation est passée entre-temps.
    try {
      await this.prisma.reevaluation.update({
        where: { id: reevaluationId, tenantId, AND: [{ ecritureExtourneId: null }] },
        data: { ecritureExtourneId: ecriture.id, contrePassationIntegrale: integrale.code },
      });
    } catch (e) {
      await this.ecritureService.retirerCompensation(tenantId, ecriture.id);
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new ConflictException('Cette réévaluation a déjà été extournée.');
      }
      throw e;
    }
    const enregistree = await this.prisma.reevaluation.findFirstOrThrow({ where: { id: reevaluationId, tenantId } });
    return {
      ...enregistree,
      // Le dire dans la réponse (B2, M2) · l'exception n'est jamais tue.
      avertissement: integrale.code ? AVERTISSEMENT_INTEGRALE[integrale.code] : null,
    };
  }

  /**
   * LA CONTRE-PASSATION INTÉGRALE, exception nommée (B2, M2) · le code qui la
   * fonde, ou le refus. B2 s'impose · l'exercice qui reçoit la
   * contre-passation porte une réévaluation non annulée de l'ancien régime
   * (`ecartsDisponibilites` nul) et l'écriture contre-passée porte des
   * disponibilités. M2 se demande · l'écriture ne se partage pas. Demandée
   * hors de ce cas, elle est refusée · la banque garde son écart (art. 57).
   */
  private async motifContrePassationIntegrale(
    tenantId: string,
    exerciceSuivantId: string,
    partage: { realisees: unknown[]; motifRefus: string | null },
    demandee: boolean,
  ): Promise<{ code: CodeContrePassationIntegrale | null; refus: string | null }> {
    if (partage.realisees.length > 0) {
      const ancienRegime = await this.prisma.reevaluation.findFirst({
        where: { tenantId, exerciceId: exerciceSuivantId, annuleeLe: null, ecartsDisponibilites: { equals: Prisma.DbNull } },
        select: { id: true },
      });
      if (ancienRegime) return { code: 'EXERCICE_SUIVANT_ANCIEN_REGIME', refus: null };
    }
    if (partage.motifRefus) {
      return demandee ? { code: 'PARTAGE_IMPOSSIBLE', refus: null } : { code: null, refus: partage.motifRefus };
    }
    if (demandee) {
      return {
        code: null,
        refus:
          "La contre-passation intégrale n'est ouverte qu'à une écriture des écarts qui ne se partage pas · celle-ci se partage, " +
          "et seuls le 478, le 479 et les comptes de tiers se contre-passent (l'écart de la banque et de la caisse est réalisé, " +
          'AUDCIF art. 57).',
      };
    }
    return { code: null, refus: null };
  }

  /**
   * ANNULER UNE CONTRE-PASSATION (relecture adverse d'A5 bis, M1) · celle
   * qu'une version antérieure a laissé passer hors de l'exercice qui suit
   * immédiatement la réévaluation, pour la repasser au bon endroit. AUDCIF
   * art. 20, al. 2 · au brouillard, elle est supprimée ; validée, inscrite en
   * négatif (art. 22, 2° et 4°). La réévaluation redevient libre de toute
   * contre-passation, et la trace est gardée (`annulationsContrePassation`,
   * journal d'audit). C'est l'issue du refus de la réévaluation suivante
   * quand l'exercice de la réévaluation est clôturé, que l'annulation entière
   * (D6) n'atteint plus.
   *
   * REFUS · réévaluation annulée ; aucune contre-passation ; contre-passation
   * dans un exercice clôturé ; une réévaluation non annulée de l'exercice qui
   * porte la contre-passation (elle a mesuré ses positions après elle,
   * l'annuler d'abord) ; ligne lettrée ou pointée. Sous le verrou du dossier.
   */
  async annulerContrePassation(tenantId: string, userId: string, reevaluationId: string, motif: string) {
    const raison = (motif ?? '').trim();
    if (!raison) throw new BadRequestException("Le motif de l'annulation est obligatoire (AUDCIF art. 20).");
    return this.sousVerrouDuDossier(tenantId, 'ANNULATION DE CONTRE-PASSATION', () =>
      this.annulerContrePassationSousVerrou(tenantId, userId, reevaluationId, raison),
    );
  }

  private async annulerContrePassationSousVerrou(tenantId: string, userId: string, reevaluationId: string, motif: string) {
    const reeval = await this.prisma.reevaluation.findFirst({
      where: { id: reevaluationId, tenantId },
      select: {
        id: true,
        dateReevaluation: true,
        annuleeLe: true,
        annulationsContrePassation: true,
        ecritureExtourne: {
          select: {
            id: true,
            statut: true,
            numeroPiece: true,
            exerciceId: true,
            exercice: { select: { statut: true } },
            lignes: { select: { lettre: true, lettrageId: true, rapprochementId: true } },
          },
        },
      },
    });
    if (!reeval) throw new NotFoundException('Réévaluation introuvable pour ce dossier');
    const jour = (d: Date) => d.toISOString().slice(0, 10);
    if (reeval.annuleeLe) throw new ConflictException(`Cette réévaluation est annulée, le ${jour(reeval.annuleeLe)}.`);
    const e = reeval.ecritureExtourne;
    if (!e) throw new BadRequestException("Cette réévaluation n'est pas contre-passée · il n'y a rien à annuler.");
    if (e.exercice.statut === StatutExercice.CLOTURE) {
      throw new BadRequestException(
        "La contre-passation est passée dans un exercice clôturé · elle ne s'annule plus (AUDCIF art. 20, al. 3).",
      );
    }
    const lectrice = await this.prisma.reevaluation.findFirst({
      where: { tenantId, exerciceId: e.exerciceId, annuleeLe: null },
      select: { dateReevaluation: true },
    });
    if (lectrice) {
      throw new BadRequestException(
        `La réévaluation du ${jour(lectrice.dateReevaluation)}, passée dans l'exercice qui porte cette contre-passation, a ` +
          "mesuré ses positions après elle · annulez-la d'abord (Devises), puis la contre-passation.",
      );
    }
    const nom = `la contre-passation n° ${e.numeroPiece ?? '·'}`;
    const tenues = motifLignesTenues(e.lignes, nom, 'annuler');
    if (tenues) throw new BadRequestException(tenues);
    return transactionJournalisee(this.prisma, async (tx) => {
      const relues = await tx.ligneEcriture.findMany({
        where: { ecritureId: e.id, ecriture: { tenantId } },
        select: { lettre: true, lettrageId: true, rapprochementId: true },
      });
      const motifTenues = motifLignesTenues(relues, nom, 'annuler');
      if (motifTenues) throw new BadRequestException(motifTenues);
      // Le statut se RELIT dans la transaction · une contre-passation validée
      // entre la lecture et ce geste s'inscrit en négatif, jamais supprimée.
      const statut = (await tx.ecriture.findFirst({ where: { id: e.id, tenantId }, select: { statut: true } }))?.statut;
      const negatif =
        statut === StatutEcriture.BROUILLARD
          ? null
          : await this.ecritureService.inscrireEnNegatifPourAnnulation(tenantId, userId, e.id, motif, tx);
      const trace = {
        ecritureId: e.id,
        numeroPiece: e.numeroPiece,
        traitement: negatif ? 'INSCRITE_EN_NEGATIF' : 'SUPPRIMEE',
        ...(negatif ? { negatifId: negatif.id, negatifNumeroPiece: negatif.numeroPiece } : {}),
        motif,
        par: userId,
        le: new Date().toISOString(),
      };
      const anciennes = Array.isArray(reeval.annulationsContrePassation) ? reeval.annulationsContrePassation : [];
      // Délié AVANT la suppression du brouillard, par un `update` UNITAIRE
      // filtré sur le lien encore en place · deux gestes simultanés ne passent
      // pas tous les deux (P2025).
      try {
        await tx.reevaluation.update({
          where: { id: reeval.id, tenantId, ecritureExtourneId: e.id },
          data: {
            ecritureExtourneId: null,
            contrePassationIntegrale: null,
            annulationsContrePassation: [...anciennes, trace] as unknown as Prisma.InputJsonValue,
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          throw new ConflictException('La contre-passation de cette réévaluation a changé entre-temps · relancez le geste.');
        }
        throw err;
      }
      if (!negatif) {
        // Filtrée sur le statut, lignes comprises · validée entre-temps, rien
        // n'est supprimé et la transaction tombe (M1 d'A7, même règle).
        await tx.ligneEcriture.deleteMany({ where: { ecritureId: e.id, ecriture: { tenantId, statut: StatutEcriture.BROUILLARD } } });
        const { count } = await tx.ecriture.deleteMany({ where: { id: e.id, tenantId, statut: StatutEcriture.BROUILLARD } });
        if (count !== 1) throw new ConflictException('La contre-passation a été validée entre-temps · relancez le geste.');
      }
      return tx.reevaluation.findFirstOrThrow({ where: { id: reeval.id, tenantId } });
    });
  }

  /**
   * ANNULER UNE RÉÉVALUATION (ligne A6, décision D6 du 2026-10-03, Manasse,
   * « réfère-toi à la loi »). AUDCIF art. 20, al. 2 · la correction d'une
   * erreur de l'exercice en cours « s'effectue EXCLUSIVEMENT par inscription
   * en négatif des éléments erronés ; l'enregistrement exact est ensuite
   * opéré » · art. 22, 2° · une écriture VALIDÉE est irréversible ; 4° · dans
   * une période close, au premier jour de la période non clôturée, date de
   * valeur distincte ; art. 20, al. 3 · l'exercice antérieur clos relève du
   * report à nouveau, hors de ce geste.
   *
   *  · écriture au BROUILLARD (écarts, provision, contre-passation) ·
   *    supprimée, elle n'est pas entrée au livre-journal ;
   *  · écriture VALIDÉE · une inscription en négatif, même compte, même sens,
   *    montants négatifs (`EcritureService.inscrireEnNegatifPourAnnulation`) ;
   *  · l'enregistrement est MARQUÉ annulé (date, auteur, motif, et ce qui a
   *    été fait de chaque écriture), jamais supprimé ;
   *  · l'enregistrement exact suit · une nouvelle réévaluation de l'exercice,
   *    l'index unique ne comptant que les non annulées.
   * REFUS NOMMÉS · déjà annulée ; exercice clôturé ; contre-passation passée
   * dans un exercice clôturé ; une réévaluation POSTÉRIEURE non annulée (on
   * annule de la plus récente à la plus ancienne, l'ordre d'A5) ; une version
   * de provision d'ouverture d'un exercice suivant, qui s'appuie sur la
   * provision que celle-ci a passée. Sous le verrou du dossier.
   */
  async annulerReevaluation(tenantId: string, userId: string, reevaluationId: string, motif: string) {
    const raison = (motif ?? '').trim();
    if (!raison) throw new BadRequestException("Le motif de l'annulation est obligatoire (AUDCIF art. 20).");
    return this.sousVerrouDuDossier(tenantId, 'ANNULATION', () => this.annulerSousVerrou(tenantId, userId, reevaluationId, raison));
  }

  private async annulerSousVerrou(tenantId: string, userId: string, reevaluationId: string, motif: string) {
    const ecriture = {
      select: {
        id: true,
        statut: true,
        numeroPiece: true,
        exercice: { select: { statut: true } },
        lignes: { select: { lettre: true, lettrageId: true, rapprochementId: true } },
      },
    };
    const reeval = await this.prisma.reevaluation.findFirst({
      where: { id: reevaluationId, tenantId },
      include: {
        exercice: { select: { statut: true, dateDebut: true, dateFin: true } },
        ecritureEcarts: ecriture,
        ecritureProvision: ecriture,
        ecritureExtourne: ecriture,
      },
    });
    if (!reeval) throw new NotFoundException('Réévaluation introuvable pour ce dossier');
    const jour = (d: Date) => d.toISOString().slice(0, 10);
    if (reeval.annuleeLe) {
      throw new ConflictException(`Cette réévaluation est déjà annulée, le ${jour(reeval.annuleeLe)}.`);
    }
    if (reeval.exercice.statut === StatutExercice.CLOTURE) {
      throw new BadRequestException(
        "L'exercice de cette réévaluation est clôturé · son erreur se corrige par le report à nouveau (AUDCIF art. 20, al. 3), hors de ce geste.",
      );
    }
    if (reeval.ecritureExtourne && reeval.ecritureExtourne.exercice.statut === StatutExercice.CLOTURE) {
      throw new BadRequestException(
        "La contre-passation de cette réévaluation est passée dans un exercice clôturé · elle ne s'annule plus (AUDCIF art. 20, al. 3).",
      );
    }
    const posterieure = await this.prisma.reevaluation.findFirst({
      where: { tenantId, annuleeLe: null, dateReevaluation: { gt: reeval.dateReevaluation } },
      orderBy: { dateReevaluation: 'asc' },
      select: { dateReevaluation: true },
    });
    if (posterieure) {
      throw new BadRequestException(
        `La réévaluation du ${jour(posterieure.dateReevaluation)}, postérieure, n'est pas annulée · elle part de la provision que ` +
          "celle-ci a passée. On annule de la plus récente à la plus ancienne.",
      );
    }
    const version = await this.prisma.provisionChangeOuverture.findFirst({
      where: { tenantId, dateReference: { gt: reeval.dateReevaluation } },
      orderBy: { dateReference: 'asc' },
      select: { compteProvision: true, dateReference: true },
    });
    if (version) {
      throw new BadRequestException(
        `La provision d'ouverture déclarée au ${jour(version.dateReference)} (compte ${version.compteProvision}) s'appuie sur la ` +
          'provision que cette réévaluation a passée · retirez-la ou corrigez-la par une nouvelle version avant d’annuler.',
      );
    }

    const ecritures = [
      ['ECARTS', reeval.ecritureEcarts],
      ['PROVISION', reeval.ecritureProvision],
      ['CONTRE_PASSATION', reeval.ecritureExtourne],
    ] as const;
    // UNE LIGNE LETTRÉE OU POINTÉE ARRÊTE L'ANNULATION (relecture adverse,
    // B1) · l'écart de N lettré avec sa contre-passation de N+1 · le négatif
    // naîtrait non lettré, la contre-passation au brouillard serait supprimée,
    // et le groupe resterait « soldé » d'une seule ligne, un crédit fantôme à
    // la balance âgée et aux relances. Même refus que la correction
    // (`motifLignesTenues`), écriture par écriture, avant toute écriture.
    const NOMS = { ECARTS: "d'écarts", PROVISION: 'de provision', CONTRE_PASSATION: 'de contre-passation' } as const;
    for (const [role, e] of ecritures) {
      if (!e) continue;
      const motif = motifLignesTenues(
        e.lignes,
        `l'écriture ${NOMS[role]} n° ${e.numeroPiece ?? '·'}`,
        'annuler',
        ', puis annulez la réévaluation',
      );
      if (motif) throw new BadRequestException(motif);
    }
    return transactionJournalisee(this.prisma, async (tx) => {
      const fait: Array<{ role: string; ecritureId: string; numeroPiece: number | null; traitement: 'SUPPRIMEE' | 'INSCRITE_EN_NEGATIF'; negatifId?: string; negatifNumeroPiece?: number | null }> = [];
      // RELU DANS LA TRANSACTION (septième relecture, m1) · un lettrage ou un
      // pointage posé entre la vérification et la suppression ou le négatif
      // refuse aussi · le refus annule la transaction, rien n'est écrit.
      for (const [role, e] of ecritures) {
        if (!e) continue;
        const relues = await tx.ligneEcriture.findMany({
          where: { ecritureId: e.id, ecriture: { tenantId } },
          select: { lettre: true, lettrageId: true, rapprochementId: true },
        });
        const motifTenues = motifLignesTenues(relues, `l'écriture ${NOMS[role]} n° ${e.numeroPiece ?? '·'}`, 'annuler', ', puis annulez la réévaluation');
        if (motifTenues) throw new BadRequestException(motifTenues);
      }
      for (const [role, e] of ecritures) {
        if (!e) continue;
        if (e.statut === StatutEcriture.BROUILLARD) {
          fait.push({ role, ecritureId: e.id, numeroPiece: e.numeroPiece, traitement: 'SUPPRIMEE' });
        } else {
          const negatif = await this.ecritureService.inscrireEnNegatifPourAnnulation(tenantId, userId, e.id, motif, tx);
          fait.push({ role, ecritureId: e.id, numeroPiece: e.numeroPiece, traitement: 'INSCRITE_EN_NEGATIF', negatifId: negatif.id, negatifNumeroPiece: negatif.numeroPiece });
        }
      }
      // Marquée AVANT la suppression des brouillards · sur une ligne encore
      // non annulée, sans quoi deux gestes simultanés passeraient tous deux.
      // Un `update` UNITAIRE (relecture adverse, M2) · le journal d'audit
      // garde la ligne avant et après, motif, auteur et JSON `annulation`
      // compris ; un `updateMany` n'y laisse que filtre et compte. La garde
      // de concurrence est le filtre `annuleeLe: null` · P2025 si une autre
      // annulation est passée entre-temps.
      try {
        await tx.reevaluation.update({
          where: { id: reeval.id, tenantId, annuleeLe: null },
          data: { annuleeLe: new Date(), annuleePar: userId, motifAnnulation: motif, annulation: fait as unknown as Prisma.InputJsonValue },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
          throw new ConflictException('Cette réévaluation est déjà annulée.');
        }
        throw e;
      }
      for (const f of fait) {
        if (f.traitement !== 'SUPPRIMEE') continue;
        await tx.ligneEcriture.deleteMany({ where: { ecritureId: f.ecritureId } });
        await tx.ecriture.deleteMany({ where: { id: f.ecritureId, tenantId } });
      }
      return tx.reevaluation.findFirstOrThrow({ where: { id: reeval.id, tenantId } });
    });
  }

  async listerReevaluations(tenantId: string, exerciceId: string) {
    const exercice = await this.prisma.exercice.findFirst({ where: { id: exerciceId, tenantId }, select: { dateFin: true } });
    // L'exercice qui reçoit la contre-passation (M1, B-II) · celui qui suit
    // immédiatement s'il est ouvert, sinon le premier ouvert après des
    // clôturés ; et s'il a été réévalué sous l'ancien régime (B2).
    const suivant = exercice ? await this.cibleDeContrePassation(tenantId, exercice.dateFin) : null;
    const suivantAncienRegime = suivant
      ? (await this.prisma.reevaluation.findFirst({
          where: { tenantId, exerciceId: suivant.id, annuleeLe: null, ecartsDisponibilites: { equals: Prisma.DbNull } },
          select: { id: true },
        })) !== null
      : false;
    const reevaluations = await this.prisma.reevaluation.findMany({
      where: { tenantId, exerciceId },
      orderBy: { dateReevaluation: 'desc' },
      include: {
        ecritureEcarts: { select: { id: true, numeroPiece: true, date: true } },
        ecritureProvision: { select: { id: true, numeroPiece: true } },
        ecritureExtourne: { select: { id: true, numeroPiece: true, date: true } },
      },
    });
    // Une réévaluation passée AVANT la décision D1 à une autre date que la
    // clôture n'est pas retouchée · elle est SIGNALÉE, avec son motif.
    // Ce que l'écran doit savoir sans le recalculer (relecture adverse d'A5
    // bis) · ce qu'il reste à contre-passer et sous quelle forme
    // (`contrePassationAPasser` · les écarts de conversion seuls ; INTÉGRALE
    // imposée par l'exercice suivant de l'ancien régime, B2 ; INTÉGRALE à
    // demander, l'écriture ne se partageant pas, M2 ; rien, une réévaluation
    // des seules disponibilités n'ayant aucun écart de conversion, AUDCIF
    // art. 57), l'exercice où elle se passe (M1), et la ventilation à
    // déclarer d'une réévaluation antérieure (B1).
    const relues = await this.prisma.reevaluation.findMany({
      where: { tenantId, exerciceId, id: { in: reevaluations.map((r) => r.id) } },
      select: SELECTION_REEVALUATION_RELUE,
    });
    const relueDe = new Map(relues.map((r) => [r.id, r]));
    return Promise.all(
      reevaluations.map(async (r) => {
        const relue = relueDe.get(r.id);
        const partage = relue?.ecritureEcarts
          ? partagerLignesDEcarts(
              relue.ecritureEcarts.lignes.map((l) => ({ compteNumero: l.compte.numero, debit: Number(l.debit), credit: Number(l.credit) })),
            )
          : null;
        const libre = !r.annuleeLe && !r.ecritureExtourneId && partage !== null;
        const contrePassationAPasser: 'ECARTS_DE_CONVERSION' | 'INTEGRALE_ANCIEN_REGIME' | 'INTEGRALE_SUR_DEMANDE' | null = !libre
          ? null
          : partage.realisees.length > 0 && suivantAncienRegime
            ? 'INTEGRALE_ANCIEN_REGIME'
            : partage.motifRefus
              ? 'INTEGRALE_SUR_DEMANDE'
              : partage.aContrePasser.length > 0
                ? 'ECARTS_DE_CONVERSION'
                : null;
        return {
          ...r,
          horsCloture: exercice ? motifDateReevaluation(r.dateReevaluation.toISOString().slice(0, 10), exercice.dateFin) : null,
          contrePassationAPasser,
          exerciceDeContrePassation: suivant,
          ventilationAExiger: relue ? await this.ventilationAExiger(tenantId, relue) : null,
        };
      }),
    );
  }

  /**
   * Provision pour pertes de change EN PLACE à la date, famille par famille ·
   * la VERSION DÉCLARÉE en vigueur à la date (dossier repris), plus la somme,
   * crédits moins débits, des écritures de provision des réévaluations
   * ANTÉRIEURES à la date et datées au plus tôt du début de l'exercice de la
   * version, lue sur les comptes de provision.
   *
   * La déclaration d'abord (décision de Manasse du 2026-10-02) · fiche du
   * compte 19, « Le compte 19 est réajusté à la clôture de chaque exercice,
   * soit par dotations supplémentaires, soit par reprises des provisions
   * antérieures » ; fiche du compte 77, le 779 reprend les provisions
   * « existant au début de l'exercice ». La provision à ajuster est celle qui
   * EXISTE, pas seulement celle qu'OmegaX a passée · un dossier repris avec
   * 100 000 au 4991 et aucune réévaluation OmegaX les verrait à zéro, et la
   * même perte serait dotée une seconde fois. Les réévaluations antérieures à
   * l'ouverture de la version sont DANS le montant déclaré, et ne s'y
   * ajoutent pas.
   *
   * Lue sur les réévaluations, et non sur le solde du compte, pour deux
   * raisons. Le 4991 et le 4997 portent aussi d'autres risques à court terme
   * (« Provisions pour risques à court terme · sur opérations d'exploitation »)
   * · leur solde ferait reprendre une provision pour litige comme si c'était
   * une perte de change. Et le solde de l'exercice ne porte la provision de
   * N-1 qu'après le report à-nouveau, quand N+1 s'ouvre avant la clôture de N
   * (AUDCIF art. 23).
   *
   * Ce que le module ne voit pas se DIT, et ce qui fausserait l'ajustement se
   * RÉSERVE.
   *  (1) Une écriture de l'exercice passée à la main sur un de ces comptes,
   *      hors report à-nouveau, peut être une reprise que l'ajustement
   *      doublerait ; rien n'est retranché d'office.
   *  (2) RÉSERVE « NON DÉCLARÉE » (relecture adverse B1) · sans version en
   *      vigueur, le solde d'ouverture du compte doit être EXPLIQUÉ par les
   *      écritures de provision OmegaX antérieures à l'ouverture. Un écart,
   *      quel qu'il soit, est une provision venue d'ailleurs (dossier repris,
   *      écriture manuelle) que le module ne connaît pas · un dossier repris
   *      à 100 000, doté de 100 000 par OmegaX en N, s'ouvre en N+1 à 200 000
   *      et serait lu à 100 000 chaque année. Il ne suffit donc pas qu'une
   *      réévaluation OmegaX existe.
   *  (3) Une version en vigueur dont la provision à l'ouverture DÉPASSE le
   *      solde créditeur d'ouverture du compte est signalée (m2) · la reprise
   *      rendrait le compte débiteur.
   * Le solde d'ouverture est l'à-nouveau validé, sinon l'à-nouveau au
   * brouillard (bilan d'ouverture importé, à-nouveau provisoire), sinon le
   * report reconstitué du livre-journal de l'exercice précédent
   * (`soldesOuverture`) · la réserve joue sur chacun.
   */
  private async provisionsEnPlace(
    tenantId: string,
    exercice: { id: string; dateDebut: Date },
    date: Date,
    familles: FamilleProvisionChange[],
  ): Promise<{
    parFamille: Map<string, number>;
    declarees: Map<string, number>;
    nonDeclarees: ProvisionOuvertureNonDeclaree[];
    excessives: ProvisionOuvertureExcessive[];
    avertissements: string[];
  }> {
    const { enVigueur, parFamille, reevaluations, etats, exercices } = await this.etatsOuverture(
      tenantId,
      exercice,
      familles.map((f) => f.provision),
      date,
    );
    const declarees = new Map<string, number>();
    for (const [compte, v] of enVigueur) declarees.set(compte, v.montant);

    const idsDuModule = reevaluations.map((r) => r.ecritureProvisionId).filter((id): id is string => !!id);
    const avertissements: string[] = [];
    const nonDeclarees: ProvisionOuvertureNonDeclaree[] = [];
    const excessives: ProvisionOuvertureExcessive[] = [];
    for (const f of familles) {
      const hors = await this.prisma.ligneEcriture.aggregate({
        where: {
          compte: { tenantId, numero: { startsWith: f.provision } },
          ecriture: {
            tenantId,
            exerciceId: exercice.id,
            date: { lte: date },
            estGenereeParCloture: false,
            estANouveauProvisoire: false,
            ...(idsDuModule.length > 0 ? { id: { notIn: idsDuModule } } : {}),
            NOT: ECRITURES_D_UNE_REEVALUATION_ANNULEE,
          },
        },
        _count: { _all: true },
      });
      const nombre = hors._count?._all ?? 0;
      if (nombre > 0) {
        avertissements.push(
          `Le compte ${f.provision} porte ${nombre} ligne(s) passée(s) dans l'exercice hors réévaluation. ` +
            "La provision pour perte de change en place est lue sur les seules réévaluations passées · " +
            "si l'une de ces lignes dote ou reprend une provision pour perte de change, l'ajustement proposé la doublerait.",
        );
      }

      // CE QUE LA CLÔTURE PRÉCÉDENTE NE VOIT PAS (cinquième passe, mineur 3) ·
      // la provision d'un exercice antérieur encore ouvert se lit sur son
      // à-nouveau et sur les écritures du module ; une ligne passée à la main
      // sur ce compte dans cet exercice (reprise de balance, litige) n'y est
      // pas, et un exercice sans position passe « sans objet ». Elle se dit ici.
      const anterieursOuverts = exercices.filter(
        (x) => x.statut !== StatutExercice.CLOTURE && x.dateFin.getTime() < exercice.dateDebut.getTime(),
      );
      if (anterieursOuverts.length > 0) {
        const horsAnterieurs = await this.prisma.ligneEcriture.aggregate({
          where: {
            compte: { tenantId, numero: { startsWith: f.provision } },
            ecriture: {
              tenantId,
              exerciceId: { in: anterieursOuverts.map((x) => x.id) },
              estGenereeParCloture: false,
              estANouveauProvisoire: false,
              ...(idsDuModule.length > 0 ? { id: { notIn: idsDuModule } } : {}),
              NOT: ECRITURES_D_UNE_REEVALUATION_ANNULEE,
            },
          },
          _count: { _all: true },
        });
        const nombreAnterieur = horsAnterieurs._count?._all ?? 0;
        if (nombreAnterieur > 0) {
          avertissements.push(
            `Le compte ${f.provision} porte ${nombreAnterieur} ligne(s) passée(s) hors réévaluation dans un exercice antérieur encore ` +
              "ouvert · la provision lue à la clôture précédente ne les compte pas. Si elles dotent ou reprennent une provision pour " +
              "perte de change, déclarez la provision au début de l'exercice.",
          );
        }
      }

      const e = etats.get(f.provision)!;
      const ouverture = e.ouverture;
      const provisoire = ouverture.statut === 'IMPORTE' ? ' (à-nouveau au brouillard, bilan d’ouverture importé, provisoire, non validé)' : '';
      if (e.horsBornes) {
        // Le message nomme ce qui n'est pas à jour et dit quoi faire, jamais de
        // retirer (cinquième passe) · sans version, la provision serait relue
        // ailleurs, et une perte pourrait se doter sans source.
        const x = e.horsBornes;
        excessives.push(x);
        avertissements.push(
          `La provision pour pertes de change déclarée à l'ouverture ne concorde pas avec l'ouverture${x.plafondFiable ? provisoire : ''} · ` +
            `${libelleVersionHorsBornes(x)}.`,
        );
      }
      if (!e.reserve) continue;
      const explique = e.explique;
      nonDeclarees.push({ compteProvision: f.provision, soldeOuverture: ouverture.montant, explique, statutOuverture: ouverture.statut });
      const sens =
        explique > ouverture.montant
          ? `alors que les réévaluations OmegaX en expliquent ${explique.toFixed(2)}, plus que ce solde`
          : `dont les réévaluations OmegaX n'expliquent que ${explique.toFixed(2)}`;
      const consigne =
        "la provision pour pertes de change existant à l'ouverture n'est pas déclarée · elle est lue sans cette part, sous " +
        "réserve, et l'ajustement ne se passe pas tant qu'elle n'est pas déclarée (montant, source ; zéro si ce solde porte " +
        'un autre risque).';
      if (ouverture.statut === 'CLOTURE_PRECEDENTE') {
        // La clôture précédente reconstituée n'est pas expliquée (S8) · un
        // à-nouveau ou une écriture entrés dans l'exercice précédent après sa
        // réévaluation.
        avertissements.push(
          `Le compte ${f.provision} s'ouvre, faute d'à-nouveau validé, sur son solde à la clôture de l'exercice précédent ` +
            `reconstitué de ses écritures (${ouverture.montant.toFixed(2)}), ${sens} · un à-nouveau ou une écriture entrés dans ` +
            `cet exercice après sa réévaluation n'y sont pas expliqués (une provision pour litige du même compte, par exemple), ` +
            `et ${consigne} Deux issues · déclarez au début de l'exercice la part de change (au plus ${ouverture.montant.toFixed(2)}), ` +
            "ou clôturez l'exercice précédent pour que son à-nouveau soit validé.",
        );
        continue;
      }
      // UN SEUL MESSAGE PAR CAUSE (sixième passe, m3) · la clôture précédente ne
      // se nomme que si elle dit autre chose que la part expliquée.
      const clotureDitAutreChose =
        ouverture.cloturePrecedente !== null &&
        Math.abs(ouverture.montant - ouverture.cloturePrecedente) >= 0.005 &&
        Math.abs(ouverture.cloturePrecedente - explique) >= 0.005;
      if (clotureDitAutreChose) {
        avertissements.push(
          `L'à-nouveau du compte ${f.provision} (${ouverture.montant.toFixed(2)}${provisoire}) ne concorde pas avec le solde du ` +
            `compte reconstitué à la clôture de l'exercice précédent (${ouverture.cloturePrecedente!.toFixed(2)}) · ` +
            `déclarez au début de l'exercice la part de ${ouverture.montant.toFixed(2)} qui couvre des pertes de change (montant, source ; ` +
            'zéro si ce solde porte un autre risque).',
        );
      }
      if (Math.abs(ouverture.montant - explique) >= 0.005 || !clotureDitAutreChose) {
        avertissements.push(
          `Le compte ${f.provision} s'ouvre avec un solde de ${ouverture.montant.toFixed(2)}${provisoire}, ${sens}, et ${consigne}`,
        );
      }
    }
    return { parFamille, declarees, nonDeclarees, excessives, avertissements };
  }

  /**
   * ÉTAT D'OUVERTURE des comptes de provision, lu UNE fois pour le calcul et
   * pour l'écran (relecture adverse M1 · l'écran ne recalcule rien) ·
   *  · la version en vigueur à la date et la provision EN PLACE à la date
   *    (version + réévaluations OmegaX antérieures à la date et datées depuis
   *    son début, sinon toutes les réévaluations antérieures) ;
   *  · l'OUVERTURE de l'exercice et sa nature (`ouverturesDe`) ;
   *  · la part EXPLIQUÉE par les écritures de provision OmegaX antérieures à
   *    l'ouverture, d'où la RÉSERVE « non déclarée » (B1) · sans version en
   *    vigueur, TOUTE ouverture s'y confronte · un à-nouveau non provisoire
   *    (et, nommée, la clôture précédente calculée), comme la clôture
   *    précédente reconstituée quand l'à-nouveau n'est que provisoire, qui
   *    repart de l'ouverture de l'exercice précédent et peut porter un
   *    à-nouveau arrivé APRÈS sa réévaluation (sixième passe, S8) ;
   *  · la provision en place À L'OUVERTURE (version + réévaluations depuis son
   *    début jusqu'à l'ouverture) et ses BORNES (`bornesDeVersion`) · au-dessus
   *    du solde (la reprise rendrait le compte débiteur), ou sous la provision
   *    du module à la clôture précédente (la perte serait dotée deux fois).
   */
  private async etatsOuverture(
    tenantId: string,
    exercice: { id: string; dateDebut: Date },
    racines: string[],
    date: Date,
  ) {
    const ctx = await this.contexteProvision(tenantId);
    const enVigueur = new Map<string, { montant: number; dateReference: Date; contesteeAuMontant: number | null }>();
    for (const racine of racines) {
      const v = versionEnVigueur(
        ctx.versions.filter((x) => x.compteProvision === racine),
        date,
      );
      if (v) {
        enVigueur.set(racine, {
          montant: Number(v.montant),
          dateReference: v.dateReference,
          // Une contestation sans montant figé ne couvre rien · elle ne sait pas ce qu'elle contestait.
          contesteeAuMontant:
            v.provisionModuleContestee === true && v.provisionModuleContesteeMontant !== null && v.provisionModuleContesteeMontant !== undefined
              ? Number(v.provisionModuleContesteeMontant)
              : null,
        });
      }
    }
    const parFamille = new Map<string, number>();
    for (const racine of racines) {
      const v = enVigueur.get(racine);
      // Antérieures à la date, et depuis le début de la version · les autres
      // sont dans le montant déclaré.
      const montant =
        (v?.montant ?? 0) + sommeProvision(ctx.lignes, racine, v ? v.dateReference : null, date, false);
      if (v || Math.abs(montant) >= 0.005) parFamille.set(racine, montant);
    }

    const ouvertures = await this.ouverturesDe(tenantId, exercice, racines, ctx);
    const etats = new Map<
      string,
      {
        ouverture: OuvertureProvision;
        explique: number;
        enPlaceOuverture: number | null;
        depasse: boolean;
        horsBornes: ProvisionOuvertureExcessive | null;
        bornes: { plancher: number; plafond: number; module: number };
        reserve: boolean;
      }
    >();
    for (const racine of racines) {
      const ouverture = ouvertures.get(racine)!;
      const v = enVigueur.get(racine);
      const explique = arrondiCentime(sommeProvision(ctx.lignes, racine, null, exercice.dateDebut, false));
      const enPlaceOuverture = v
        ? arrondiCentime(v.montant + sommeProvision(ctx.lignes, racine, v.dateReference, exercice.dateDebut, false))
        : null;
      // UNE VERSION SE LIT ENTRE DEUX BORNES (huitième relecture), sur les
      // trois chemins à la fois · l'aiguillage qui jugeait un solde fiable par
      // le seul plafond, un solde reconstitué inexpliqué par le seul plafond,
      // et sinon l'égalité à la provision du module, est retiré · il laissait
      // passer une version périmée dès qu'un franc entrait à la main au compte
      // ou que l'exercice précédent était clôturé (X1, X3).
      const bornes = bornesDeVersion(ouverture, explique);
      let horsBornes: ProvisionOuvertureExcessive | null = null;
      if (enPlaceOuverture !== null && v) {
        // LA CONTESTATION EST RATTACHÉE À UN MONTANT (neuvième relecture) ·
        // elle n'écarte le plancher que tant que la provision du module à la
        // clôture précédente reste celle qu'elle a contestée. Déclarée avant
        // une réévaluation qui dote ensuite, elle ne couvre pas cette dotation
        // (Y9, Y9b) · sans ce rattachement, la version périmée revenait.
        const contestationValable = v.contesteeAuMontant !== null && Math.abs(v.contesteeAuMontant - bornes.module) < 0.005;
        const sousLePlancher = enPlaceOuverture < bornes.plancher - 0.005;
        const borne: BorneVersion | null =
          enPlaceOuverture > bornes.plafond + 0.005
            ? 'PLAFOND'
            : sousLePlancher && !contestationValable
              ? 'PLANCHER'
              : null;
        if (borne) {
          horsBornes = {
            compteProvision: racine,
            enPlaceOuverture,
            borne,
            plancher: bornes.plancher,
            plafond: bornes.plafond,
            plafondFiable: ouverture.fiable,
            provisionModule: bornes.module,
            contesteeAuMontant: borne === 'PLANCHER' && v.contesteeAuMontant !== null ? v.contesteeAuMontant : null,
          };
        }
      }
      const depasse = horsBornes !== null;
      etats.set(racine, {
        ouverture,
        explique,
        enPlaceOuverture,
        depasse,
        horsBornes,
        bornes,
        // Sans version, TOUTE ouverture se confronte à la part expliquée, la
        // clôture précédente calculée comprise (sixième passe) · elle repart de
        // l'ouverture de l'exercice précédent, qui peut être un à-nouveau
        // arrivé APRÈS sa réévaluation, et rien d'autre ne le confronterait.
        reserve:
          !v &&
          (Math.abs(ouverture.montant - explique) >= 0.005 ||
            (ouverture.fiable &&
              ouverture.cloturePrecedente !== null &&
              Math.abs(ouverture.montant - ouverture.cloturePrecedente) >= 0.005)),
      });
    }
    return { enVigueur, parFamille, reevaluations: ctx.reevaluations, etats, exercices: ctx.exercices };
  }

  /** Versions, écritures de provision OmegaX et exercices du dossier, lus une fois. */
  private async contexteProvision(tenantId: string) {
    // Quelques versions par compte et par dossier · une par exercice au plus.
    const versions = await this.prisma.provisionChangeOuverture.findMany({
      where: { tenantId },
      select: {
        compteProvision: true,
        montant: true,
        dateReference: true,
        provisionModuleContestee: true,
        provisionModuleContesteeMontant: true,
      },
      orderBy: { dateReference: 'asc' },
    });
    // Une réévaluation par exercice (index unique) · bornée par le nombre d'exercices.
    const reevaluations = await this.prisma.reevaluation.findMany({
      // Les ANNULÉES sortent (D6) · leur provision et son inscription en
      // négatif s'annulent au journal, et le module ne la compte plus.
      where: { tenantId, ecritureProvisionId: { not: null }, annuleeLe: null },
      select: {
        dateReevaluation: true,
        ecritureProvisionId: true,
        ecritureProvision: {
          select: { lignes: { select: { debit: true, credit: true, compte: { select: { numero: true } } } } },
        },
      },
    });
    const lignes: LigneProvisionOmegax[] = [];
    for (const r of reevaluations) {
      for (const l of r.ecritureProvision?.lignes ?? []) {
        lignes.push({ date: r.dateReevaluation, numero: l.compte.numero, montant: Number(l.credit) - Number(l.debit) });
      }
    }
    const exercices = await this.prisma.exercice.findMany({
      where: { tenantId },
      select: { id: true, dateDebut: true, dateFin: true, statut: true },
      orderBy: { dateDebut: 'asc' },
    });
    return { versions, reevaluations, lignes, exercices };
  }

  /**
   * L'OUVERTURE de la provision d'un exercice, compte par compte (relecture
   * adverse, quatrième passe). La provision existant au début de l'exercice
   * est un FAIT (fiche du compte 77) ; seul ce qui est validé est au
   * livre-journal (AUDCIF art. 22, 2°).
   *  · VALIDE · l'à-nouveau validé de l'exercice, solde comptable FIABLE ;
   *  · IMPORTE · faute de lui, l'à-nouveau au brouillard d'un exercice sans
   *    précédent dans OmegaX · le bilan d'ouverture importé d'un dossier
   *    repris, solde comptable FIABLE (m3) ;
   *  · CLOTURE_PRECEDENTE · faute d'à-nouveau validé, quand un exercice
   *    précède · la provision EN PLACE À SA CLÔTURE telle que le module la
   *    calcule (version en vigueur + écritures de provision OmegaX, tous
   *    statuts), récursivement jusqu'à un à-nouveau validé, un bilan importé
   *    ou une version. Ni l'à-nouveau provisoire ni un report reconstitué ·
   *    tous deux lisent le seul livre-journal, alors que la réévaluation
   *    passe sa provision au brouillard, si bien qu'ils portaient 0 au 4991
   *    après une dotation de 100 000, et que N+1 la dotait une seconde fois
   *    ou se voyait refuser une déclaration juste. Ce n'est pas un solde
   *    comptable · aucune réserve ne s'y compare ;
   *  · AUCUN · ni à-nouveau ni exercice précédent · zéro, fiable.
   */
  private async ouverturesDe(
    tenantId: string,
    exercice: { id: string; dateDebut: Date },
    racines: string[],
    ctx: ContexteProvision,
  ): Promise<Map<string, OuvertureProvision>> {
    const rendu = new Map<string, OuvertureProvision>();
    // UN À-NOUVEAU QUI N'EST PAS UN À-NOUVEAU PROVISOIRE D'OMEGAX (relecture
    // adverse, cinquième passe) · bilan d'ouverture importé, report de la
    // clôture, validé ou au brouillard · est un solde comptable FIABLE, et il
    // PRIME sur la clôture précédente, quel que soit le précédent. Un dossier
    // repris garde souvent un N-1 pour les comparatifs (vide, ou reprise de
    // balance) · lire alors la clôture de N-1 effaçait le bilan importé dans
    // N, et la même perte était dotée deux fois, ou une déclaration juste
    // refusée. Seul l'À-NOUVEAU PROVISOIRE (`estANouveauProvisoire`), lu sur
    // le seul livre-journal, cède la place à la clôture précédente.
    const nonProvisoire = {
      tenantId,
      exerciceId: exercice.id,
      estGenereeParCloture: true,
      estSoldeDesComptesDeGestion: false,
      estANouveauProvisoire: false,
    };
    const precedent = [...ctx.exercices]
      .filter((e) => e.dateFin.getTime() < exercice.dateDebut.getTime())
      .sort((x, y) => y.dateFin.getTime() - x.dateFin.getTime())[0];
    if ((await this.prisma.ecriture.count({ where: { ...nonProvisoire, tenantId } })) > 0) {
      const auBrouillard = await this.prisma.ecriture.count({
        where: { ...nonProvisoire, tenantId, statut: StatutEcriture.BROUILLARD },
      });
      const statut: StatutSoldeOuverture = auBrouillard > 0 ? 'IMPORTE' : 'VALIDE';
      const clotures = precedent ? await this.cloturesDe(tenantId, precedent, racines, ctx) : null;
      for (const racine of racines) {
        const r = await this.prisma.ligneEcriture.aggregate({
          where: { compte: { tenantId, numero: { startsWith: racine } }, ecriture: nonProvisoire },
          _sum: { debit: true, credit: true },
        });
        rendu.set(racine, {
          montant: arrondiCentime(Number(r._sum?.credit ?? 0) - Number(r._sum?.debit ?? 0)),
          statut,
          fiable: true,
          cloturePrecedente: clotures ? clotures.get(racine)!.reconstitue : null,
          provisionModule: clotures ? clotures.get(racine)!.module : null,
        });
      }
      return rendu;
    }
    if (!precedent) {
      for (const racine of racines) {
        rendu.set(racine, { montant: 0, statut: 'AUCUN', fiable: true, cloturePrecedente: null, provisionModule: null });
      }
      return rendu;
    }
    const clotures = await this.cloturesDe(tenantId, precedent, racines, ctx);
    for (const racine of racines) {
      const c = clotures.get(racine)!;
      rendu.set(racine, {
        montant: c.reconstitue,
        statut: 'CLOTURE_PRECEDENTE',
        fiable: false,
        cloturePrecedente: c.reconstitue,
        provisionModule: c.module,
      });
    }
    return rendu;
  }

  /**
   * Deux lectures de la clôture d'un exercice, qui ne se confondent jamais
   * (septième passe) :
   *  · RECONSTITUE · le SOLDE du compte à la clôture · son ouverture
   *    (récursive) et TOUTES ses écritures de l'exercice, tous statuts, du
   *    module ou non (une reprise de litige à la main en sort, un à-nouveau
   *    arrivé après la réévaluation y entre). Il dit qu'il y a de
   *    l'inexpliqué, et il BORNE une déclaration ; il ne dit jamais quelle part
   *    couvre des pertes de change ;
   *  · MODULE · la provision pour pertes de change que le module tient à la
   *    clôture · la version en vigueur et les écritures OmegaX depuis son
   *    début, sinon toutes les écritures OmegaX jusqu'à la clôture. Elle est
   *    le PLANCHER d'une version (bornée par le solde), le solde en est le
   *    plafond · comparée au seul solde, une provision pour litige du même
   *    compte passait pour du change ; ignorée, une version périmée faisait
   *    doter deux fois la perte déjà provisionnée.
   */
  private async cloturesDe(
    tenantId: string,
    exercice: { id: string; dateDebut: Date; dateFin: Date },
    racines: string[],
    ctx: ContexteProvision,
  ): Promise<Map<string, { reconstitue: number; module: number }>> {
    const rendu = new Map<string, { reconstitue: number; module: number }>();
    const ouverture = await this.ouverturesDe(tenantId, exercice, racines, ctx);
    for (const racine of racines) {
      const v = versionEnVigueur(
        ctx.versions.filter((x) => x.compteProvision === racine),
        exercice.dateFin,
      );
      const module = v
        ? Number(v.montant) + sommeProvision(ctx.lignes, racine, v.dateReference, exercice.dateFin, true)
        : sommeProvision(ctx.lignes, racine, null, exercice.dateFin, true);
      // TOUS STATUTS · la réévaluation passe sa provision au brouillard, et un
      // solde lu sur le seul livre-journal la perdrait (gelé par un test).
      const r = await this.prisma.ligneEcriture.aggregate({
        where: {
          compte: { tenantId, numero: { startsWith: racine } },
          ecriture: { tenantId, exerciceId: exercice.id, estGenereeParCloture: false },
        },
        _sum: { debit: true, credit: true },
      });
      rendu.set(racine, {
        reconstitue: arrondiCentime(ouverture.get(racine)!.montant + Number(r._sum?.credit ?? 0) - Number(r._sum?.debit ?? 0)),
        module: arrondiCentime(module),
      });
    }
    return rendu;
  }

  /**
   * Une version est UTILISÉE quand une réévaluation est passée dans sa période
   * (de son début au début de la version suivante). Lu sous le verrou du
   * dossier (`sousVerrouDuDossier`), ce constat d'EXISTENCE suffit · comparer
   * l'heure de création d'une réévaluation à l'heure de retouche d'une
   * version supposait une horloge commune que rien ne garantit (relecture
   * adverse, troisième passe). Et puisqu'une version ne naît jamais dans une
   * période déjà réévaluée, toute réévaluation de sa période l'a lue.
   */
  private async reevaluationUtilisatrice(
    tenantId: string,
    v: { dateReference: Date },
    suivante: { dateReference: Date } | undefined,
  ) {
    return this.prisma.reevaluation.findFirst({
      where: {
        tenantId,
        annuleeLe: null,
        dateReevaluation: { gte: v.dateReference, ...(suivante ? { lt: suivante.dateReference } : {}) },
      },
      select: { dateReevaluation: true },
    });
  }

  /**
   * Les comptes de provision du référentiel, chacun avec ses versions
   * déclarées, celle en vigueur à l'ouverture de l'exercice, et le solde
   * d'ouverture PROPOSÉ avec sa nature (validé, provisoire, reconstitué),
   * jamais imposé · le 4991 et le 4997 portent aussi d'autres risques.
   */
  async provisionsOuverture(tenantId: string, exerciceId: string) {
    const exercice = await this.prisma.exercice.findFirst({
      where: { id: exerciceId, tenantId },
      select: { id: true, dateDebut: true },
    });
    if (!exercice) throw new NotFoundException('Exercice introuvable pour ce dossier');
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { referentiel: true } });
    if (!tenant) throw new BadRequestException('Dossier introuvable');
    const racines = comptesProvisionDeclarables(tenant.referentiel);
    const versions = await this.prisma.provisionChangeOuverture.findMany({
      where: { tenantId },
      orderBy: { dateReference: 'asc' },
    });
    // Même état que le calcul, à l'ouverture · l'écran ne recalcule rien (M1).
    const { etats } = await this.etatsOuverture(tenantId, exercice, racines, exercice.dateDebut);
    const jour = (d: Date) => d.toISOString().slice(0, 10);
    const rendu = [];
    for (const compteProvision of racines) {
      const duCompte = versions.filter((v) => v.compteProvision === compteProvision);
      const lues = [];
      for (let i = 0; i < duCompte.length; i++) {
        const v = duCompte[i];
        const utilisatrice = await this.reevaluationUtilisatrice(tenantId, v, duCompte[i + 1]);
        lues.push({
          id: v.id,
          montant: Number(v.montant),
          dateReference: jour(v.dateReference),
          source: v.source,
          motif: v.motif,
          provisionModuleContestee: v.provisionModuleContestee,
          motifContestation: v.motifContestation,
          provisionModuleContesteeMontant:
            v.provisionModuleContesteeMontant === null ? null : Number(v.provisionModuleContesteeMontant),
          utilisee: !!utilisatrice,
        });
      }
      const enVigueur = versionEnVigueur(duCompte, exercice.dateDebut);
      const e = etats.get(compteProvision)!;
      rendu.push({
        compteProvision,
        soldeOuverturePropose: e.ouverture.montant,
        statutSoldeOuverture: e.ouverture.statut,
        // Un solde comptable fiable, ou la provision du module à la clôture précédente.
        ouvertureFiable: e.ouverture.fiable,
        // Servis par le serveur, jamais recalculés à l'écran (M1, M3).
        provisionEnPlaceOuverture: e.enPlaceOuverture,
        depasseSoldeOuverture: e.depasse,
        // Les bornes d'une version, et la provision du module à côté d'elle
        // (huitième relecture) · l'écran les montre, il ne les calcule pas.
        provisionModuleOuverture: e.bornes.module,
        plancherVersion: e.bornes.plancher,
        plafondVersion: e.bornes.plafond,
        horsBornes: e.horsBornes ? e.horsBornes.borne : null,
        reserve: e.reserve,
        explique: e.explique,
        versions: lues,
        enVigueur: enVigueur ? (lues.find((l) => l.id === enVigueur.id) ?? null) : null,
      });
    }
    return { dateOuverture: jour(exercice.dateDebut), comptes: rendu };
  }

  /**
   * DÉCLARER une version (décision de Manasse du 2026-10-02, Q2 et Q3).
   *  · Sa date est le DÉBUT d'un exercice du dossier (fiche du compte 77,
   *    provisions « existant au début de l'exercice ») · toute autre date est
   *    refusée, et la réévaluation de clôture est ainsi toujours postérieure.
   *  · La version de même date se RETOUCHE tant qu'aucune réévaluation ne l'a
   *    utilisée · utilisée, elle est GELÉE (AUDCIF art. 22, 2°, « l'irréversibilité
   *    des traitements interdise toute suppression, addition ou modification
   *    ultérieure » ; art. 20, une correction s'inscrit, elle ne réécrit pas).
   *  · Une version NOUVELLE vaut de sa date au début de la version suivante
   *    (ou sans fin). Elle est admise à toute date, même avant une autre,
   *    tant qu'AUCUNE réévaluation n'est déjà passée dans cette période · sinon
   *    elle changerait la provision en vigueur d'un calcul déjà passé, que ce
   *    soit celui d'une version utilisée ou celui qu'aucune version ne
   *    couvrait. C'est la correction de l'IMPASSE relevée en seconde relecture
   *    (N repris, N+1 ouvert avant la clôture de N, déclaré et réévalué ·
   *    refuser toute version antérieure à une autre interdisait de déclarer N,
   *    donc de jamais réévaluer N, AUDCIF art. 54). L'art. 22, 3° (« écarte
   *    toute insertion intercalaire ») vise la chronologie des ÉCRITURES, pas
   *    cette déclaration d'un fait · il n'est pas invoqué ici. Elle porte son
   *    MOTIF dès qu'une version antérieure existe (c'est alors une correction,
   *    Q2), et l'historique reste entier.
   */
  async declarerProvisionOuverture(
    tenantId: string,
    userId: string,
    dto: { compteProvision: string; montant: number; dateReference: string; source: string; motif?: string; provisionModuleContestee?: boolean; motifContestation?: string },
  ) {
    return this.sousVerrouDuDossier(tenantId, 'DECLARATION', () => this.declarerSousVerrou(tenantId, userId, dto));
  }

  private async declarerSousVerrou(
    tenantId: string,
    userId: string,
    dto: { compteProvision: string; montant: number; dateReference: string; source: string; motif?: string; provisionModuleContestee?: boolean; motifContestation?: string },
  ) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { referentiel: true } });
    if (!tenant) throw new BadRequestException('Dossier introuvable');
    const motif = motifRefusDeclarationOuverture(tenant.referentiel, dto);
    if (motif) throw new BadRequestException(motif);
    const dateReference = new Date(dto.dateReference.slice(0, 10));
    const exercice = await this.prisma.exercice.findFirst({
      where: { tenantId, dateDebut: dateReference },
      select: { id: true },
    });
    if (!exercice) {
      throw new BadRequestException(
        `La date ${dto.dateReference.slice(0, 10)} n'est le début d'aucun exercice du dossier · la provision se déclare ` +
          "telle qu'elle existe au début d'un exercice (fiche du compte 77, « existant au début de l'exercice »).",
      );
    }
    const versions = await this.prisma.provisionChangeOuverture.findMany({
      where: { tenantId, compteProvision: dto.compteProvision },
      orderBy: { dateReference: 'asc' },
    });
    // La provision du module contestée · lue comme le calcul la lit, à la
    // clôture qui précède cette ouverture (elle ne dépend pas de la version
    // déclarée ici, seulement des versions antérieures et des écritures OmegaX).
    const montantConteste =
      dto.provisionModuleContestee === true
        ? (
            await this.etatsOuverture(tenantId, { id: exercice.id, dateDebut: dateReference }, [dto.compteProvision], dateReference)
          ).etats.get(dto.compteProvision)!.bornes.module
        : null;
    const motifCorrection = dto.motif?.trim() || null;
    const memeDate = versions.findIndex((v) => v.dateReference.getTime() === dateReference.getTime());
    // LE MOTIF EST CELUI D'UNE CORRECTION (relecture adverse, troisième passe,
    // point 4) · exigé quand la version SUCCÈDE à une version UTILISÉE, dont
    // elle corrige la suite (Q2). La déclaration d'un exercice nouveau, après
    // une version encore inutilisée ou sans version avant elle, n'en demande pas.
    const precedenteIndex = versions.reduce(
      (i, v, k) => (v.dateReference.getTime() < dateReference.getTime() ? k : i),
      -1,
    );
    if (precedenteIndex >= 0 && !motifCorrection) {
      const precedente = versions[precedenteIndex];
      const utilisee = await this.reevaluationUtilisatrice(tenantId, precedente, versions[precedenteIndex + 1]);
      if (utilisee) {
        throw new BadRequestException(
          `La version précédente du ${dto.compteProvision} a servi à la réévaluation du ` +
            `${utilisee.dateReevaluation.toISOString().slice(0, 10)} · celle-ci la corrige et porte son motif.`,
        );
      }
    }
    const donnees = {
      montant: new Prisma.Decimal(Math.round(dto.montant * 100) / 100),
      source: dto.source.trim(),
      motif: motifCorrection,
      provisionModuleContestee: dto.provisionModuleContestee === true,
      motifContestation: dto.provisionModuleContestee === true ? dto.motifContestation!.trim() : null,
      // Figée ICI, par le serveur, jamais reçue du client · la provision du
      // module que l'écran montrait au moment de la contestation.
      provisionModuleContesteeMontant: montantConteste === null ? null : new Prisma.Decimal(montantConteste),
    };
    if (memeDate >= 0) {
      const existante = versions[memeDate];
      const utilisatrice = await this.reevaluationUtilisatrice(tenantId, existante, versions[memeDate + 1]);
      if (utilisatrice) {
        throw new ConflictException(
          `La provision d'ouverture du compte ${dto.compteProvision} a servi à la réévaluation du ` +
            `${utilisatrice.dateReevaluation.toISOString().slice(0, 10)} · elle ne se modifie plus. Déclarez une nouvelle ` +
            "version au début d'un exercice postérieur, avec son motif.",
        );
      }
      // Retouchée par son identifiant, jamais par la clé composée.
      return this.prisma.provisionChangeOuverture.update({
        where: { id: existante.id },
        data: { ...donnees, modifiedBy: userId },
      });
    }
    const suivante = versions.find((v) => v.dateReference.getTime() > dateReference.getTime());
    const dejaPassee = await this.prisma.reevaluation.findFirst({
      where: {
        tenantId,
        annuleeLe: null,
        dateReevaluation: { gte: dateReference, ...(suivante ? { lt: suivante.dateReference } : {}) },
      },
      select: { dateReevaluation: true },
    });
    if (dejaPassee) {
      throw new ConflictException(
        `La réévaluation du ${dejaPassee.dateReevaluation.toISOString().slice(0, 10)} est déjà passée dans la période ` +
          `de cette version du ${dto.compteProvision} · la déclarer changerait la provision en vigueur d'un calcul passé. ` +
          "Déclarez-la au début d'un exercice qu'aucune réévaluation n'a encore touché.",
      );
    }
    return this.prisma.provisionChangeOuverture.create({
      data: { tenantId, compteProvision: dto.compteProvision, dateReference, ...donnees, createdBy: userId },
    });
  }

  async retirerProvisionOuverture(tenantId: string, id: string) {
    return this.sousVerrouDuDossier(tenantId, 'RETRAIT', () => this.retirerSousVerrou(tenantId, id));
  }

  private async retirerSousVerrou(tenantId: string, id: string) {
    const existante = await this.prisma.provisionChangeOuverture.findFirst({ where: { id, tenantId } });
    if (!existante) throw new NotFoundException('Déclaration introuvable pour ce dossier');
    const suivante = await this.prisma.provisionChangeOuverture.findFirst({
      where: { tenantId, compteProvision: existante.compteProvision, dateReference: { gt: existante.dateReference } },
      orderBy: { dateReference: 'asc' },
    });
    const utilisatrice = await this.reevaluationUtilisatrice(tenantId, existante, suivante ?? undefined);
    if (utilisatrice) {
      throw new ConflictException(
        `La provision d'ouverture du compte ${existante.compteProvision} a servi à la réévaluation du ` +
          `${utilisatrice.dateReevaluation.toISOString().slice(0, 10)} · elle ne se modifie plus.`,
      );
    }
    await this.prisma.provisionChangeOuverture.delete({ where: { id: existante.id } });
    return { id: existante.id };
  }

  /**
   * L'ÉCART QUE CHAQUE DISPONIBILITÉ A REÇU d'une réévaluation, par compte et
   * par devise (ligne A5 bis) · celui qu'elle a gardé
   * (`Reevaluation.ecartsDisponibilites`) ; sinon, pour une réévaluation
   * antérieure, la ventilation que le cabinet a DÉCLARÉE ; sinon la ligne
   * passée SANS devise sur le compte, relue (`ventilerEcartPasse`).
   *
   * LA RELECTURE VOIT LE COMPTE TEL QU'IL ÉTAIT (relecture adverse, B1, même
   * règle que `reglements/reevaluation-et-ecart-realise.ts`) · les écritures
   * datées au plus tard d'elle et SAISIES avant elle, sauf l'à-nouveau du
   * début d'exercice, qui se recrée ; les lignes alors ouvertes (non
   * lettrées, ou lettrées soldées après elle). Une ligne saisie ou lettrée
   * depuis ne change pas ce qu'elle a lu. Les sommes sont demandées à la base
   * (M5) · par compte, devise et SENS de chaque ligne, le montant en devise
   * étant gardé sans signe (même lecture que `lireComptesDuReport`).
   *
   * `null` · rien ne se relit sans deviner, et l'appelant le dit avec son
   * issue (déclarer la ventilation).
   */
  private async ecartsDeDisponibilitesDe(tenantId: string, reeval: ReevaluationRelue): Promise<EcartDeDisponibilite[] | null> {
    const enregistres = ecartsDisponibilitesEnregistres(reeval.ecartsDisponibilites);
    if (enregistres) return enregistres;
    const passeParCompte = passeSurLesDisponibilites(reeval);
    if (passeParCompte.size === 0) return [];
    const declares = ecartsDisponibilitesEnregistres(reeval.ventilationDisponibilites);
    if (declares) {
      // Revérifiée à chaque lecture · une écriture des écarts retouchée
      // depuis la déclaration ne se lit plus par elle.
      const devises = new Set(declares.map((d) => d.deviseId));
      return motifRefusVentilationDeclaree(passeParCompte, declares, devises, 'déclarée') === null ? declares : null;
    }
    return this.relireLaLignePassee(tenantId, reeval, passeParCompte);
  }

  /** La relecture seule, sans la ventilation déclarée (la déclaration la refuse quand elle aboutit). */
  private async relireLaLignePassee(
    tenantId: string,
    reeval: ReevaluationRelue,
    passeParCompte: Map<string, number>,
  ): Promise<EcartDeDisponibilite[] | null> {
    const sommes = await this.sommesDesDisponibilitesALaReevaluation(tenantId, reeval, [...passeParCompte.keys()]);
    const gardes =
      reeval.coursUtilises && typeof reeval.coursUtilises === 'object' && !Array.isArray(reeval.coursUtilises)
        ? (reeval.coursUtilises as Record<string, unknown>)
        : {};
    // (b) À défaut du cours gardé (D5), celui de la table à la date de la
    // réévaluation · c'est celui qu'elle a lu, sauf correction depuis, que
    // la vérification au centime contre la ligne passée écarte.
    const coursDeLaTable = new Map<string, number | null>();
    for (const liste of sommes.values()) {
      for (const s of liste) {
        if (typeof gardes[s.deviseId] === 'number' || coursDeLaTable.has(s.deviseId)) continue;
        coursDeLaTable.set(s.deviseId, await this.coursA(s.deviseId, reeval.dateReevaluation));
      }
    }
    const cours = (deviseId: string) => {
      const garde = gardes[deviseId];
      return typeof garde === 'number' ? garde : (coursDeLaTable.get(deviseId) ?? null);
    };
    const sortie: EcartDeDisponibilite[] = [];
    for (const [compteId, passe] of passeParCompte) {
      const ventile = ventilerEcartPasse(compteId, passe, sommes.get(compteId) ?? [], cours);
      if (ventile === null) return null;
      sortie.push(...ventile);
    }
    return sortie;
  }

  /**
   * Les sommes, par compte et par devise, des lignes en devise que la
   * réévaluation a lues sur les disponibilités · TELLES QU'ELLES ÉTAIENT
   * (voir `ecartsDeDisponibilitesDe`). Le sens se lit sur chaque ligne par
   * une référence de champ (débit supérieur ou égal au crédit), comme au
   * calcul · une ligne inscrite en négatif retranche son montant en devise.
   */
  private async sommesDesDisponibilitesALaReevaluation(
    tenantId: string,
    reeval: ReevaluationRelue,
    comptes: string[],
  ): Promise<Map<string, SommeDeviseDuCompte[]>> {
    const exercice = await this.prisma.exercice.findFirst({
      where: { id: reeval.exerciceId, tenantId },
      select: { dateDebut: true },
    });
    const ecriture: Prisma.EcritureWhereInput = {
      tenantId,
      exerciceId: reeval.exerciceId,
      date: { lte: reeval.dateReevaluation },
      OR: [
        { createdAt: { lte: reeval.createdAt } },
        ...(exercice
          ? [
              {
                date: exercice.dateDebut,
                OR: [{ estANouveauProvisoire: true }, { estGenereeParCloture: true, estSoldeDesComptesDeGestion: false }],
              },
            ]
          : []),
      ],
    };
    const base = {
      compteId: { in: comptes },
      deviseId: { not: null },
      ecriture,
      // Ouverte à la réévaluation · non lettrée, ou lettrée SOLDE après elle
      // (le calcul d'alors lisait `lettre: null`).
      OR: [{ lettre: null }, { lettrage: { soldeAt: { gt: reeval.createdAt } } }],
    } satisfies Prisma.LigneEcritureWhereInput;
    const credit = this.prisma.ligneEcriture.fields.credit;
    const [positifs, negatifs] = await Promise.all([
      this.prisma.ligneEcriture.groupBy({
        by: ['compteId', 'deviseId'],
        where: { ...base, debit: { gte: credit } },
        _sum: { debit: true, credit: true, montantDevise: true },
      }),
      this.prisma.ligneEcriture.groupBy({
        by: ['compteId', 'deviseId'],
        where: { ...base, debit: { lt: credit } },
        _sum: { debit: true, credit: true, montantDevise: true },
      }),
    ]);
    const nombre = (x: Prisma.Decimal | number | null | undefined) => (x === null || x === undefined ? 0 : Number(x));
    const parCompte = new Map<string, Map<string, SommeDeviseDuCompte>>();
    for (const [groupes, sens] of [
      [positifs, 1],
      [negatifs, -1],
    ] as const) {
      for (const g of groupes) {
        if (!g.deviseId) continue;
        const duCompte = parCompte.get(g.compteId) ?? new Map<string, SommeDeviseDuCompte>();
        const s = duCompte.get(g.deviseId) ?? { deviseId: g.deviseId, devise: 0, francs: 0 };
        s.devise += sens * nombre(g._sum.montantDevise);
        s.francs += nombre(g._sum.debit) - nombre(g._sum.credit);
        duCompte.set(g.deviseId, s);
        parCompte.set(g.compteId, duCompte);
      }
    }
    return new Map([...parCompte].map(([compteId, m]) => [compteId, [...m.values()]]));
  }

  /**
   * DÉCLARER LA VENTILATION DES DISPONIBILITÉS d'une réévaluation antérieure
   * (relecture adverse d'A5 bis, B1, c). Quand l'écart passé sans devise sur
   * une banque tenue en plusieurs devises ne se relit pas au centime, ni par
   * le cours gardé ni par celui de la table, rien ne se devine · le cabinet
   * déclare l'écart de chaque devise, avec sa SOURCE, comme la provision
   * d'ouverture. Ouverte même sur un exercice clôturé · elle n'écrit rien au
   * journal, elle dit ce qui a été passé, et c'est la seule issue quand
   * l'annulation (D6) n'y est plus ouverte.
   *
   * REFUS · réévaluation annulée ; écart gardé ou ligne qui se relit (rien à
   * déclarer) ; source absente ; compte ou devise étrangers ; somme d'un
   * compte qui ne rend pas la ligne passée au centime ; ventilation déjà
   * déclarée qu'une réévaluation postérieure a lue (on ne change pas ce
   * qu'un calcul passé a utilisé, art. 22, 2°). Sous le verrou du dossier,
   * au journal d'audit par un `update` unitaire.
   */
  async declarerVentilationDisponibilites(
    tenantId: string,
    userId: string,
    reevaluationId: string,
    dto: DeclarerVentilationDisponibilitesDto,
  ) {
    return this.sousVerrouDuDossier(tenantId, 'VENTILATION', () =>
      this.declarerVentilationSousVerrou(tenantId, userId, reevaluationId, dto),
    );
  }

  private async declarerVentilationSousVerrou(
    tenantId: string,
    userId: string,
    reevaluationId: string,
    dto: DeclarerVentilationDisponibilitesDto,
  ) {
    const reeval = await this.prisma.reevaluation.findFirst({
      where: { id: reevaluationId, tenantId },
      select: SELECTION_REEVALUATION_RELUE,
    });
    if (!reeval) throw new NotFoundException('Réévaluation introuvable pour ce dossier');
    if (reeval.annuleeLe) {
      throw new ConflictException("Cette réévaluation est annulée · ses écritures sont neutralisées, il n'y a rien à ventiler.");
    }
    if (ecartsDisponibilitesEnregistres(reeval.ecartsDisponibilites)) {
      throw new ConflictException("Cette réévaluation a gardé l'écart de chaque devise · il n'y a rien à déclarer.");
    }
    const passeParCompte = passeSurLesDisponibilites(reeval);
    if (passeParCompte.size === 0) {
      throw new BadRequestException("Cette réévaluation n'a passé aucun écart sur une banque ou une caisse · il n'y a rien à ventiler.");
    }
    if (reeval.ventilationDisponibilites !== null) {
      const lectrice = await this.prisma.reevaluation.findFirst({
        where: { tenantId, annuleeLe: null, dateReevaluation: { gt: reeval.dateReevaluation } },
        orderBy: { dateReevaluation: 'asc' },
        select: { dateReevaluation: true },
      });
      if (lectrice) {
        throw new ConflictException(
          `La ventilation déclarée a servi à la réévaluation du ${lectrice.dateReevaluation.toISOString().slice(0, 10)} · ` +
            "elle ne se modifie plus. Annulez d'abord cette réévaluation postérieure (Devises) si la ventilation est fausse.",
        );
      }
    }
    const relue = await this.relireLaLignePassee(tenantId, reeval, passeParCompte);
    if (relue !== null) {
      throw new ConflictException(
        "L'écart passé sur les disponibilités se relit devise par devise sans déclaration · il n'y a rien à déclarer.",
      );
    }
    const devises = await this.prisma.devise.findMany({ where: { tenantId }, select: { id: true } });
    const ventilation = (dto.ventilation ?? []).map((v) => ({
      compteId: v.compteId,
      deviseId: v.deviseId,
      ecart: Math.round(Number(v.ecart) * 100) / 100,
    }));
    const motif = motifRefusVentilationDeclaree(passeParCompte, ventilation, new Set(devises.map((d) => d.id)), dto.source);
    if (motif) throw new BadRequestException(motif);
    // Un `update` UNITAIRE · le journal d'audit garde l'avant et l'après.
    await this.prisma.reevaluation.update({
      where: { id: reeval.id, tenantId },
      data: {
        ventilationDisponibilites: ventilation.filter((v) => Math.abs(v.ecart) >= 0.005) as unknown as Prisma.InputJsonValue,
        ventilationDisponibilitesSource: dto.source.trim(),
        ventilationDisponibilitesLe: new Date(),
        ventilationDisponibilitesPar: userId,
      },
    });
    return this.prisma.reevaluation.findFirstOrThrow({ where: { id: reeval.id, tenantId } });
  }

  /**
   * CE QU'UNE RÉÉVALUATION ANTÉRIEURE DEMANDE À DÉCLARER (B1, c), pour
   * l'écran · la ligne passée sur chaque banque ou caisse et ses devises
   * lues, quand ni l'écart gardé, ni la ventilation déclarée, ni la relecture
   * ne la rendent. `null` · rien à déclarer.
   */
  private async ventilationAExiger(tenantId: string, reeval: ReevaluationRelue) {
    if (reeval.annuleeLe || ecartsDisponibilitesEnregistres(reeval.ecartsDisponibilites)) return null;
    const passeParCompte = passeSurLesDisponibilites(reeval);
    if (passeParCompte.size === 0) return null;
    if ((await this.ecartsDeDisponibilitesDe(tenantId, reeval)) !== null) return null;
    const sommes = await this.sommesDesDisponibilitesALaReevaluation(tenantId, reeval, [...passeParCompte.keys()]);
    const devises = await this.prisma.devise.findMany({ where: { tenantId }, select: { id: true, code: true } });
    const code = new Map(devises.map((d) => [d.id, d.code]));
    const numeros = new Map((reeval.ecritureEcarts?.lignes ?? []).map((l) => [l.compteId, l.compte.numero] as const));
    return [...passeParCompte].map(([compteId, passe]) => ({
      compteId,
      numero: numeros.get(compteId) ?? '',
      passe: Math.round(passe * 100) / 100,
      devises: (sommes.get(compteId) ?? [])
        .filter((s) => Math.abs(s.devise) >= 0.005 || Math.abs(s.francs) >= 0.005)
        .map((s) => ({
          deviseId: s.deviseId,
          code: code.get(s.deviseId) ?? '',
          montantDevise: Math.round(s.devise * 100) / 100,
          francs: Math.round(s.francs * 100) / 100,
        })),
    }));
  }

  /**
   * LES ÉCARTS DES DISPONIBILITÉS QUE L'À-NOUVEAU A REPORTÉS SANS DEVISE
   * (ligne A5 bis) · pour chaque (compte, devise), la somme des écarts que
   * les réévaluations des exercices précédents ont passés sur la banque ou la
   * caisse, en remontant tant que l'ouverture est un report d'OmegaX.
   *
   * Pourquoi la chaîne · l'à-nouveau en SOLDE (`soldesParDevise`) reporte la
   * ligne de la devise au total de ses lignes en devise, et l'écart, passé
   * sans devise, tombe dans le reste en francs · chaque exercice ajoute le
   * sien. Une ouverture qui n'est pas un report d'OmegaX (bilan d'ouverture
   * saisi ou importé) porte la valeur que le cabinet y a mise · on s'y
   * arrête, elle ne doit rien aux réévaluations d'avant. Une devise que le
   * report n'a pas portée en devise (position soldée) a tout reporté dans le
   * reste en francs · rien à lui ajouter.
   *
   * Ne compte pas · une réévaluation annulée (D6, ses écritures sont
   * neutralisées) ; une réévaluation dont la contre-passation a inversé la
   * banque (avant A5 bis, ou intégrale par exception, `extourner`) · l'écart
   * est déjà sorti, et la banque est revenue au coût historique.
   *
   * RÉSERVES · un à-nouveau provisoire passé AVANT que l'écart n'entre au
   * livre-journal ne le porte pas (il ne lit que le validé) ; un écart qui
   * ne se relit pas sans deviner (`ecartsDeDisponibilitesDe`). Dans les deux
   * cas la valeur serait fausse · le passage est refusé, la cause nommée.
   */
  private async ecartsReportesDesDisponibilites(
    tenantId: string,
    exercice: { id: string; dateDebut: Date },
    cles: string[],
  ): Promise<{ parCle: Map<string, number>; reserves: string[] }> {
    const parCle = new Map<string, number>();
    const reserves: string[] = [];
    const jour = (d: Date) => d.toISOString().slice(0, 10);
    let actives = new Set(cles);
    let courant = { id: exercice.id, dateDebut: exercice.dateDebut };
    // LES EXERCICES TRAVERSÉS depuis la cible (relecture adverse d'A5 bis,
    // second tour, B-I) · une contre-passation qui a inversé la banque y est
    // dans le compte que la cible lit, où qu'elle soit tombée parmi eux (une
    // version antérieure la laissait poser deux exercices plus loin, ou après
    // un exercice clôturé sans réévaluation) ; posée APRÈS la cible, elle
    // n'a pas encore eu lieu pour elle.
    const parcourus = new Set<string>([exercice.id]);
    // Borne de sûreté · dix ans de conservation (AUDCIF art. 24), et au-delà.
    for (let pas = 0; pas < 50 && actives.size > 0; pas++) {
      const precedent = await this.prisma.exercice.findFirst({
        where: { tenantId, dateFin: { lt: courant.dateDebut } },
        orderBy: { dateFin: 'desc' },
        select: { id: true, dateDebut: true, dateFin: true, statut: true },
      });
      if (!precedent || precedent.id === courant.id || !(precedent.dateFin.getTime() < courant.dateDebut.getTime())) break;
      const aNouveau = await this.prisma.ligneEcriture.findMany({
        where: {
          compteId: { in: [...new Set([...actives].map((k) => k.split('|')[0]))] },
          deviseId: { not: null },
          ecriture: {
            tenantId,
            exerciceId: courant.id,
            date: courant.dateDebut,
            estGenereeParCloture: true,
            estSoldeDesComptesDeGestion: false,
          },
        },
        select: { compteId: true, deviseId: true, ecriture: { select: { estANouveauProvisoire: true, createdAt: true } } },
      });
      const reportees = new Map<string, { provisoire: boolean; creeeLe: Date }>();
      for (const l of aNouveau) {
        if (!l.deviseId || !l.ecriture) continue;
        reportees.set(`${l.compteId}|${l.deviseId}`, { provisoire: l.ecriture.estANouveauProvisoire, creeeLe: l.ecriture.createdAt });
      }
      actives = new Set([...actives].filter((k) => reportees.has(k)));
      if (actives.size === 0) break;
      const reeval = await this.prisma.reevaluation.findFirst({
        where: { tenantId, exerciceId: precedent.id, annuleeLe: null },
        select: {
          ...SELECTION_REEVALUATION_RELUE,
          ecritureExtourne: { select: { exerciceId: true, lignes: { select: { compte: { select: { numero: true } } } } } },
        },
      });
      // Inversée dans un exercice TRAVERSÉ, de celui qui suit jusqu'à la
      // cible · le compte que la cible lit la porte. Posée au-delà de la
      // cible, elle n'est pas encore faite pour elle, et l'écart se reporte.
      const inverseeParLAncienneContrePassation =
        (reeval?.ecritureExtourne !== null &&
          reeval?.ecritureExtourne !== undefined &&
          parcourus.has(reeval.ecritureExtourne.exerciceId) &&
          reeval.ecritureExtourne.lignes.some((l) => estDisponibilite(l.compte.numero))) ||
        false;
      if (reeval?.ecritureEcarts && !inverseeParLAncienneContrePassation) {
        const ecarts = await this.ecartsDeDisponibilitesDe(tenantId, reeval);
        if (ecarts === null) {
          // L'issue est RÉELLE dans les deux états de l'exercice (relecture
          // adverse, B1, d) · la déclaration est ouverte même clôturé ;
          // l'annulation (D6) n'est proposée que s'il est encore ouvert.
          const ouvert = precedent.statut !== StatutExercice.CLOTURE;
          reserves.push(
            `L'écart passé sur les disponibilités par la réévaluation du ${jour(reeval.dateReevaluation)} ne se relit pas ` +
              'devise par devise (banque ou caisse en plusieurs devises, ligne passée sans devise, cours qui ne la rend pas au ' +
              'centime) · la banque ou la caisse partirait du coût historique et cet écart, réalisé (AUDCIF art. 57), serait ' +
              `passé une seconde fois. Déclarez l'écart de chaque devise, avec sa source (Devises, exercice du ` +
              `${jour(precedent.dateDebut)} au ${jour(precedent.dateFin)}, « Ventiler l'écart des disponibilités »)` +
              (ouvert ? ", ou annulez cette réévaluation et repassez-la · elle gardera l'écart de chaque devise." : '.'),
          );
          break;
        }
        const ecritureEcarts = reeval.ecritureEcarts;
        for (const e of ecarts) {
          const cle = `${e.compteId}|${e.deviseId}`;
          const an = reportees.get(cle);
          if (!actives.has(cle) || !an) continue;
          const dansLeReport =
            !an.provisoire ||
            (ecritureEcarts.statut === StatutEcriture.VALIDEE &&
              ecritureEcarts.valideeAt !== null &&
              ecritureEcarts.valideeAt.getTime() <= an.creeeLe.getTime());
          if (!dansLeReport) {
            // L'issue dépend de l'état de l'écriture des écarts (relecture
            // adverse, M3) · déjà validée, « validez » serait un geste
            // impossible ; et la clôture de l'exercice précédent, qui reporte
            // le livre-journal entier, lève la réserve aussi bien.
            const validee = ecritureEcarts.statut === StatutEcriture.VALIDEE;
            reserves.push(
              `L'à-nouveau provisoire du ${jour(courant.dateDebut)} a été passé avant que la réévaluation du ` +
                `${jour(reeval.dateReevaluation)} n'entre au livre-journal · il ne porte pas l'écart de la banque ou de la ` +
                'caisse. ' +
                (validee
                  ? "Relancez l'à-nouveau provisoire, ou clôturez l'exercice précédent, avant de réévaluer."
                  : "Validez l'écriture des écarts, puis relancez l'à-nouveau provisoire ou clôturez l'exercice précédent, avant de réévaluer."),
            );
            continue;
          }
          parCle.set(cle, (parCle.get(cle) ?? 0) + e.ecart);
        }
      }
      courant = { id: precedent.id, dateDebut: precedent.dateDebut };
      parcourus.add(precedent.id);
    }
    return { parCle, reserves: [...new Set(reserves)] };
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
