import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TypeCompteDetailTotal } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { OPERATIONS_FONDS_PROPRES } from './catalogue-operations';
import { OPERATIONS_DONS_ET_AUTRES } from './catalogue-operations-dons';
import {
  EcritureProposee,
  LigneModele,
  LigneProposee,
  ModeleEcriture,
  OperationSpecifique,
} from './operation-specifique.types';
import { AppliquerModeleDto, ProposerModeleDto } from './dto/operation-specifique.dto';

export const CATALOGUE: OperationSpecifique[] = [...OPERATIONS_FONDS_PROPRES, ...OPERATIONS_DONS_ET_AUTRES];

/** Deux montants sont égaux au centime près (les Decimal sont en 18,2). */
const EPSILON = 0.005;

/** Arrondi au centime · le référentiel raisonne en unités monétaires, pas en flottants. */
function auCentime(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * ÉCRITURES-TYPES DES OPÉRATIONS SPÉCIFIQUES · Partie 3 du référentiel
 * SYCEBNL et Guide d'application.
 *
 * Ce service PROPOSE une écriture ; il ne l'enregistre qu'en passant par
 * `EcritureService.creer`, qui garde tous ses contrôles (équilibre, exercice
 * ouvert, comptes du dossier, comptes Total interdits, verrous de période).
 * Une écriture issue d'un modèle est ensuite une écriture ordinaire : elle se
 * corrige par inscription en négatif, se lettre et se rapproche comme les
 * autres. Aucun chemin dérobé vers la base.
 *
 * Deux garanties de la proposition :
 *
 * 1. **Rien n'est imputé au hasard.** Un préfixe du catalogue qui désigne
 *    plusieurs comptes du dossier · une banque parmi plusieurs, le compte
 *    d'immobilisation correspondant au bien reçu · ne se résout PAS d'office
 *    sur le premier venu : la proposition remonte les candidats et attend le
 *    choix. Choisir seul reviendrait à imputer sans savoir.
 * 2. **Un compte absent est nommé, pas contourné.** Si le dossier ne possède
 *    aucun compte sous un préfixe du modèle, l'écriture est déclarée
 *    inapplicable en désignant le compte manquant · plutôt que de proposer
 *    une écriture amputée qui ne bouclerait pas.
 */
@Injectable()
export class OperationSpecifiqueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritureService: EcritureService,
  ) {}

  /** Le catalogue, filtré sur le jeu d'états financiers du dossier. */
  async catalogue(tenantId: string) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { jeuEtatsFinanciersSycebnl: true },
    });
    const jeu = tenant.jeuEtatsFinanciersSycebnl === 'PROJETS_DEVELOPPEMENT' ? 'PROJETS' : 'ASSOCIATIONS';
    return {
      jeu,
      operations: CATALOGUE.filter((o) => o.portee === 'TOUS' || o.portee === jeu),
      /**
       * Les opérations de l'AUTRE jeu ne sont pas cachées : un dossier peut
       * légitimement recevoir un legs alors qu'il gère un projet. Elles sont
       * seulement signalées comme relevant d'un autre jeu d'états financiers.
       */
      operationsAutreJeu: CATALOGUE.filter((o) => o.portee !== 'TOUS' && o.portee !== jeu),
    };
  }

  private trouverModele(codeModele: string): { operation: OperationSpecifique; modele: ModeleEcriture } {
    for (const operation of CATALOGUE) {
      const modele = operation.modeles.find((m) => m.code === codeModele);
      if (modele) return { operation, modele };
    }
    throw new NotFoundException(`Modèle d'écriture « ${codeModele} » inconnu du catalogue.`);
  }

  /**
   * Calcule le montant d'une ligne à partir des paramètres saisis.
   * `COMPLEMENT` est traité à part, une fois les autres lignes connues.
   */
  private montantDeLaLigne(ligne: LigneModele, valeurs: Record<string, number>, codeModele: string): number | null {
    const lire = (nom: string): number => {
      const v = valeurs[nom];
      if (v === undefined || v === null || Number.isNaN(v)) {
        throw new BadRequestException(`Le paramètre « ${nom} » est requis par le modèle ${codeModele}.`);
      }
      return v;
    };

    switch (ligne.montant.mode) {
      case 'PARAMETRE':
        return auCentime(lire(ligne.montant.parametre));
      case 'PROPORTION': {
        const taux = typeof ligne.montant.taux === 'number' ? ligne.montant.taux : lire(ligne.montant.taux);
        return auCentime(lire(ligne.montant.parametre) * taux);
      }
      case 'ANNUITE': {
        const duree = lire(ligne.montant.parametreDuree);
        if (duree <= 0) throw new BadRequestException(`La durée du modèle ${codeModele} doit être supérieure à zéro.`);
        // Mois omis = exercice plein : c'est le cas du bien NON amortissable,
        // pour lequel le texte exclut expressément le prorata temporis.
        const mois = ligne.montant.parametreMois ? lire(ligne.montant.parametreMois) : 12;
        return auCentime((lire(ligne.montant.parametre) / duree) * (mois / 12));
      }
      case 'COMPLEMENT':
        return null;
    }
  }

  /**
   * Résout le compte du dossier visé par une ligne.
   *
   * Les comptes TOTAL sont écartés : ce sont des agrégats de regroupement,
   * jamais mouvementables (`EcritureService.creer` les refuse). Les comptes
   * inactifs le sont aussi · les proposer conduirait à une écriture rejetée.
   */
  private async resoudreComptes(tenantId: string) {
    return this.prisma.compte.findMany({
      where: { tenantId, typeCompte: TypeCompteDetailTotal.DETAIL, estActif: true },
      select: { id: true, numero: true, intitule: true },
      orderBy: { numero: 'asc' },
    });
  }

  /**
   * Propose l'écriture, sans rien enregistrer. C'est ce que l'écran affiche
   * avant validation : l'utilisateur voit les comptes, les sens et les
   * montants AVANT de s'engager.
   */
  async proposer(tenantId: string, dto: ProposerModeleDto): Promise<EcritureProposee> {
    const { modele } = this.trouverModele(dto.codeModele);
    const valeurs = dto.parametres ?? {};
    const choix = dto.comptesChoisis ?? {};
    const comptes = await this.resoudreComptes(tenantId);

    // 1) Montants, hors complément.
    const montants = modele.lignes.map((l) => this.montantDeLaLigne(l, valeurs, modele.code));

    // 2) Complément : ce qu'il faut pour équilibrer. Au plus un par modèle ·
    //    deux compléments rendraient la répartition indéterminée.
    const indexComplement = modele.lignes.findIndex((l) => l.montant.mode === 'COMPLEMENT');
    if (modele.lignes.filter((l) => l.montant.mode === 'COMPLEMENT').length > 1) {
      throw new BadRequestException(`Le modèle ${modele.code} déclare plusieurs compléments : la répartition serait indéterminée.`);
    }
    if (indexComplement !== -1) {
      const somme = (sens: 'DEBIT' | 'CREDIT') =>
        modele.lignes.reduce((s, l, i) => (l.sens === sens && montants[i] !== null ? s + montants[i]! : s), 0);
      const sensComplement = modele.lignes[indexComplement].sens;
      const autre = sensComplement === 'DEBIT' ? somme('CREDIT') : somme('DEBIT');
      const dejaPose = somme(sensComplement);
      const complement = auCentime(autre - dejaPose);
      if (complement < 0) {
        throw new BadRequestException(
          `Les parts saisies dépassent le montant global : le complément du modèle ${modele.code} serait négatif (${complement}).`,
        );
      }
      montants[indexComplement] = complement;
    }

    // 3) Comptes.
    const introuvables: { compte: string; libelle: string }[] = [];
    const lignes: LigneProposee[] = [];

    for (let i = 0; i < modele.lignes.length; i++) {
      const l = modele.lignes[i];
      const montant = montants[i] ?? 0;
      // Une ligne à zéro n'est pas une ligne : elle alourdit l'écriture sans
      // rien constater (ex. un legs sans dette successorale reprise).
      if (Math.abs(montant) < EPSILON) continue;

      const candidats = comptes.filter(
        (c) => c.numero.startsWith(l.compte) && !(l.exclusions ?? []).some((e) => c.numero.startsWith(e)),
      );
      if (candidats.length === 0) {
        introuvables.push({ compte: l.compte, libelle: l.libelle });
        continue;
      }

      const impose = choix[l.compte];
      const choisi = impose ? candidats.find((c) => c.id === impose || c.numero === impose) : undefined;
      if (impose && !choisi) {
        throw new BadRequestException(
          `Le compte choisi pour « ${l.libelle} » ne commence pas par ${l.compte} : il ne convient pas à cette ligne.`,
        );
      }

      // Un seul candidat : aucune ambiguïté, même si la ligne est marquée
      // « au choix » · inutile de faire choisir entre une seule option.
      const resolu = choisi ?? (candidats.length === 1 ? candidats[0] : undefined);

      lignes.push({
        compteId: resolu?.id ?? null,
        numero: resolu?.numero ?? '',
        intitule: resolu?.intitule ?? '',
        libelle: l.libelle,
        debit: l.sens === 'DEBIT' ? montant : 0,
        credit: l.sens === 'CREDIT' ? montant : 0,
        note: l.note,
        choixRequis: resolu ? undefined : { racine: l.compte, candidats },
      });
    }

    const totalDebit = auCentime(lignes.reduce((s, l) => s + l.debit, 0));
    const totalCredit = auCentime(lignes.reduce((s, l) => s + l.credit, 0));

    return {
      modele: modele.code,
      libelle: modele.libelle,
      objet: modele.objet,
      source: modele.source,
      applicationGuide: modele.applicationGuide,
      anomalie: modele.anomalie,
      aExtourner: modele.aExtourner,
      lignes,
      totalDebit,
      totalCredit,
      equilibree: Math.abs(totalDebit - totalCredit) < EPSILON,
      comptesIntrouvables: introuvables,
    };
  }

  /**
   * Enregistre l'écriture proposée, via `EcritureService.creer` · donc avec
   * tous ses contrôles. Refuse tant qu'un choix de compte reste ouvert ou
   * qu'un compte manque : une écriture incomplète n'a pas à atteindre la base.
   */
  async appliquer(tenantId: string, userId: string, dto: AppliquerModeleDto) {
    const proposition = await this.proposer(tenantId, dto);

    if (proposition.comptesIntrouvables.length > 0) {
      throw new BadRequestException(
        `Ce modèle suppose des comptes que le dossier ne possède pas : ${proposition.comptesIntrouvables
          .map((c) => `${c.compte} (${c.libelle})`)
          .join(', ')}. Créez-les au plan de comptes avant d'appliquer le modèle.`,
      );
    }
    const enAttente = proposition.lignes.filter((l) => l.choixRequis);
    if (enAttente.length > 0) {
      throw new BadRequestException(
        `Un compte reste à choisir pour : ${enAttente.map((l) => l.libelle).join(', ')}. Plusieurs comptes du dossier conviennent · le modèle ne tranche pas à votre place.`,
      );
    }
    if (!proposition.equilibree) {
      throw new BadRequestException(
        `L'écriture proposée n'est pas équilibrée (débit ${proposition.totalDebit}, crédit ${proposition.totalCredit}).`,
      );
    }

    return this.ecritureService.creer(tenantId, userId, {
      exerciceId: dto.exerciceId,
      journalId: dto.journalId,
      date: dto.date,
      // Le libellé du modèle est repris par défaut : il nomme l'opération du
      // référentiel, ce qui rend le journal lisible sans revenir au catalogue.
      libelle: dto.libelle?.trim() || proposition.libelle,
      reference: dto.reference,
      lignes: proposition.lignes.map((l) => ({
        compteId: l.compteId!,
        libelle: l.libelle,
        debit: l.debit,
        credit: l.credit,
      })),
    });
  }
}
