import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ClasseCompte, ConditionEcheance, Prisma, Referentiel, TypeEcheance, TypeTiers } from '@prisma/client';
import { CreerTiersDto, ModifierTiersDto, RattacherCompteDto } from './dto/tiers.dto';
import {
  CreerModeleReglementDto,
  ModifierModeleReglementDto,
  CreerEcheanceReglementDto,
  CalculerEcheancesDto,
} from './dto/modele-reglement.dto';

/**
 * Tiers (cf. docs/plan-de-construction.md §3.2) : Client/Fournisseur/Salarié/
 * Autre, avec un ou plusieurs comptes généraux rattachés (dont un Principal)
 * et un modèle de règlement optionnel. Dépend du Lettrage déjà livré · le
 * suivi par tiers n'a de sens que parce que le solde réel (mouvements non
 * lettrés) est calculable.
 */
@Injectable()
export class TiersService {
  constructor(private readonly prisma: PrismaService) {}

  private async trouver(tenantId: string, tiersId: string) {
    const tiers = await this.prisma.tiers.findFirst({
      where: { id: tiersId, tenantId },
      include: {
        modeleReglement: true,
        // orderBy explicite : sans lui, Postgres ne garantit aucun ordre
        // stable, et l'ordre peut visiblement changer après un simple UPDATE
        // (ex. bascule du compte Principal) · repéré en testant le bouton
        // "Détacher" dans l'UI (la ligne visée changeait de position).
        comptesRattaches: { include: { compte: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!tiers) {
      throw new NotFoundException('Tiers introuvable pour ce tenant');
    }
    return tiers;
  }

  async lister(tenantId: string, filtres: { type?: TypeTiers; recherche?: string; actifsSeuls?: boolean }) {
    const where: Prisma.TiersWhereInput = {
      tenantId,
      ...(filtres.type ? { type: filtres.type } : {}),
      ...(filtres.actifsSeuls ? { estActif: true } : {}),
      ...(filtres.recherche
        ? {
            OR: [
              { code: { contains: filtres.recherche, mode: 'insensitive' } },
              { nom: { contains: filtres.recherche, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    return this.prisma.tiers.findMany({
      where,
      include: {
        modeleReglement: true,
        // orderBy explicite : sans lui, Postgres ne garantit aucun ordre
        // stable, et l'ordre peut visiblement changer après un simple UPDATE
        // (ex. bascule du compte Principal) · repéré en testant le bouton
        // "Détacher" dans l'UI (la ligne visée changeait de position).
        comptesRattaches: { include: { compte: true }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { code: 'asc' },
    });
  }

  async obtenir(tenantId: string, tiersId: string) {
    return this.trouver(tenantId, tiersId);
  }

  async creer(tenantId: string, dto: CreerTiersDto) {
    await this.refuserAdherentHorsSycebnl(tenantId, dto.type);
    const existant = await this.prisma.tiers.findUnique({ where: { tenantId_code: { tenantId, code: dto.code } } });
    if (existant) {
      throw new ConflictException(`Le tiers ${dto.code} existe déjà pour ce tenant`);
    }
    if (dto.modeleReglementId) {
      await this.trouverModeleReglement(tenantId, dto.modeleReglementId);
    }
    if (dto.celluleGroupeId) {
      await this.exigerMemeGroupe(tenantId, dto.celluleGroupeId);
    }
    return this.prisma.tiers.create({ data: { ...dto, tenantId } });
  }

  /**
   * L'ADHÉRENT EST UNE NOTION DU SYCEBNL, ET LE REFUS EST CÔTÉ SERVEUR.
   *
   * Le compte 41 du SYCEBNL loge deux populations distinctes, 411 Adhérents et
   * 412 Clients-usagers ; le plan SYSCOHADA n'en connaît qu'une, ses 411
   * Clients, le 412 y portant des effets à recevoir. Masquer le type dans
   * l'écran ne suffit pas : la route resterait ouverte à un appel direct
   * (CLAUDE.md § 6).
   */
  private async refuserAdherentHorsSycebnl(tenantId: string, type?: TypeTiers) {
    if (type !== TypeTiers.ADHERENT) return;
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { referentiel: true },
    });
    if (tenant.referentiel !== Referentiel.SYCEBNL) {
      throw new BadRequestException(
        "Le type « adhérent » relève du compte 411 du SYCEBNL, qui distingue les membres cotisants des " +
          'clients-usagers. Le plan SYSCOHADA ne porte que des clients : utilisez le type « client ».',
      );
    }
  }

  async modifier(tenantId: string, tiersId: string, dto: ModifierTiersDto) {
    await this.trouver(tenantId, tiersId);
    if (dto.modeleReglementId) {
      await this.trouverModeleReglement(tenantId, dto.modeleReglementId);
    }
    // null passe sans contrôle · il DÉTACHE, et détacher ne peut jamais faire
    // sortir de l'agrégat une opération qui doit y rester.
    if (dto.celluleGroupeId) {
      await this.exigerMemeGroupe(tenantId, dto.celluleGroupeId);
    }
    return this.prisma.tiers.update({ where: { id: tiersId }, data: dto });
  }

  /**
   * Rattache un compte à ce tiers. Un compte ne peut être rattaché qu'à un
   * seul tiers à la fois (contrainte @unique sur TiersCompte.compteId · voir
   * schéma) ; s'il est marqué Principal, tout autre compte Principal de ce
   * tiers perd cette marque (un seul Principal à la fois).
   */
  async rattacherCompte(tenantId: string, tiersId: string, dto: RattacherCompteDto) {
    await this.trouver(tenantId, tiersId);
    const compte = await this.prisma.compte.findFirst({ where: { id: dto.compteId, tenantId } });
    if (!compte) {
      throw new NotFoundException('Compte introuvable pour ce tenant');
    }
    if (compte.classe !== ClasseCompte.CLASSE_4) {
      throw new BadRequestException('Seul un compte de classe 4 (Tiers) peut être rattaché à un tiers');
    }
    const dejaRattache = await this.prisma.tiersCompte.findUnique({ where: { compteId: dto.compteId } });
    if (dejaRattache && dejaRattache.tiersId !== tiersId) {
      throw new ConflictException('Ce compte est déjà rattaché à un autre tiers');
    }
    if (dejaRattache) {
      throw new ConflictException('Ce compte est déjà rattaché à ce tiers');
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.estPrincipal) {
        await tx.tiersCompte.updateMany({ where: { tiersId }, data: { estPrincipal: false } });
      }
      return tx.tiersCompte.create({
        data: { tiersId, compteId: dto.compteId, estPrincipal: !!dto.estPrincipal },
      });
    });
  }

  async definirComptePrincipal(tenantId: string, tiersId: string, compteId: string) {
    await this.trouver(tenantId, tiersId);
    const rattachement = await this.prisma.tiersCompte.findFirst({ where: { tiersId, compteId } });
    if (!rattachement) {
      throw new NotFoundException("Ce compte n'est pas rattaché à ce tiers");
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.tiersCompte.updateMany({ where: { tiersId }, data: { estPrincipal: false } });
      return tx.tiersCompte.update({ where: { id: rattachement.id }, data: { estPrincipal: true } });
    });
  }

  async detacherCompte(tenantId: string, tiersId: string, compteId: string) {
    await this.trouver(tenantId, tiersId);
    const rattachement = await this.prisma.tiersCompte.findFirst({ where: { tiersId, compteId } });
    if (!rattachement) {
      throw new NotFoundException("Ce compte n'est pas rattaché à ce tiers");
    }
    await this.prisma.tiersCompte.delete({ where: { id: rattachement.id } });
    return { compteId, detache: true };
  }

  // -----------------------------------------------------------------------
  // Groupe d'établissements · le garde-fou que la base ne peut pas poser.
  // -----------------------------------------------------------------------

  /**
   * LES DOSSIERS QU'UN TIERS DE CE DOSSIER PEUT DÉSIGNER COMME CELLULE.
   *
   * Un groupe d'établissements n'a QU'UN NIVEAU (voir Tenant.dossierMereId et
   * PlateformeService.modifierGroupe) : une mère dont `dossierMereId` est nul,
   * et ses cellules qui portent son identifiant. Le périmètre visible depuis
   * un dossier se déduit donc entièrement de ces deux cas :
   *  · le dossier courant EST la mère · ses cellules, et elles seules ;
   *  · le dossier courant est une cellule · la mère, et ses dossiers sœurs.
   *
   * Le dossier courant lui-même n'y figure jamais : un tiers ne peut pas être
   * le dossier dans lequel il est ouvert. Sans cette exclusion, une cellule
   * passerait la règle des sœurs, puisqu'elle partage sa propre mère.
   *
   * Un dossier hors groupe (ni mère, ni cellule) rend une liste vide, et
   * l'écran n'a alors rien à proposer · ce qui est exact.
   */
  async dossiersDuGroupe(tenantId: string) {
    const courant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, dossierMereId: true },
    });
    if (!courant) {
      throw new NotFoundException('Dossier introuvable');
    }
    const membres = await this.prisma.tenant.findMany({
      where:
        courant.dossierMereId === null
          ? { dossierMereId: courant.id }
          : { OR: [{ id: courant.dossierMereId }, { dossierMereId: courant.dossierMereId }], NOT: { id: courant.id } },
      // IDENTITÉ SEULE · le nom suffit à choisir dans une liste. Aucune
      // donnée comptable ne franchit ici la frontière du dossier : la lecture
      // transversale des balances reste le monopole de GroupeService, dans le
      // seul sens du lien dossierMereId.
      select: { id: true, nom: true, dossierMereId: true },
      orderBy: { nom: 'asc' },
    });
    return membres.map((m) => ({ id: m.id, nom: m.nom, estDossierMere: m.dossierMereId === null }));
  }

  /**
   * REFUSE UN RATTACHEMENT HORS GROUPE, et la base ne sait pas le faire.
   *
   * La clé étrangère de `Tiers.celluleGroupeId` vise `tenants` sans pouvoir
   * exiger « même dossier mère » · aucune contrainte SQL n'exprime une
   * condition qui compare deux lignes d'une autre table (voir le commentaire
   * du schéma et celui de la migration).
   *
   * CE QUE COÛTERAIT L'ABSENCE DE CONTRÔLE · l'agrégation élimine les
   * opérations réciproques parce que le périmètre est UNE SEULE entité.
   * AUDCIF art. 107 : « élimination des comptes réciproques : actifs et
   * passifs, charges et produits ; neutralisation des résultats provenant
   * d'opérations effectuées entre les entités DU PÉRIMÈTRE ». Désigner un
   * dossier étranger au périmètre ferait disparaître de l'agrégat un chiffre
   * d'affaires réellement réalisé avec un tiers · l'inverse exact du défaut
   * que le champ corrige, et sans plus de trace.
   */
  private async exigerMemeGroupe(tenantId: string, celluleGroupeId: string) {
    const membres = await this.dossiersDuGroupe(tenantId);
    const vise = membres.find((m) => m.id === celluleGroupeId);
    if (!vise) {
      throw new BadRequestException(
        "Ce dossier n'appartient pas au groupe d'établissements du dossier courant · seuls le dossier mère " +
          'et ses cellules peuvent être désignés. Le rattachement sert à éliminer de la balance agrégée les ' +
          "opérations internes au groupe ; un dossier hors du périmètre en ferait disparaître des opérations " +
          'réellement conclues avec un tiers (AUDCIF art. 107).',
      );
    }
    return vise;
  }

  // -----------------------------------------------------------------------
  // Modèles de règlement · entité réutilisable entre tiers (§3.2).
  // -----------------------------------------------------------------------

  private async trouverModeleReglement(tenantId: string, id: string) {
    const modele = await this.prisma.modeleReglement.findFirst({ where: { id, tenantId } });
    if (!modele) {
      throw new NotFoundException('Modèle de règlement introuvable pour ce tenant');
    }
    return modele;
  }

  async listerModelesReglement(tenantId: string) {
    return this.prisma.modeleReglement.findMany({
      where: { tenantId },
      include: { echeances: { orderBy: { ordre: 'asc' } } },
      orderBy: { intitule: 'asc' },
    });
  }

  async creerModeleReglement(tenantId: string, dto: CreerModeleReglementDto) {
    const existant = await this.prisma.modeleReglement.findUnique({
      where: { tenantId_intitule: { tenantId, intitule: dto.intitule } },
    });
    if (existant) {
      throw new ConflictException(`Le modèle de règlement "${dto.intitule}" existe déjà pour ce tenant`);
    }
    return this.prisma.modeleReglement.create({ data: { ...dto, tenantId } });
  }

  async modifierModeleReglement(tenantId: string, id: string, dto: ModifierModeleReglementDto) {
    await this.trouverModeleReglement(tenantId, id);
    return this.prisma.modeleReglement.update({ where: { id }, data: dto });
  }

  // -----------------------------------------------------------------------
  // Fractionnement en plusieurs échéances (§3.2 · pattern Sage : type
  // pourcentage/équilibre/montant + délai + condition, par échéance). Un
  // modèle sans aucune ligne ici reste mono-échéance (delaiJours/echeance du
  // modèle lui-même) · voir calculerEcheances().
  // -----------------------------------------------------------------------

  async listerEcheances(tenantId: string, modeleId: string) {
    await this.trouverModeleReglement(tenantId, modeleId);
    return this.prisma.echeanceReglement.findMany({ where: { modeleReglementId: modeleId }, orderBy: { ordre: 'asc' } });
  }

  async ajouterEcheance(tenantId: string, modeleId: string, dto: CreerEcheanceReglementDto) {
    await this.trouverModeleReglement(tenantId, modeleId);

    if (dto.type !== TypeEcheance.EQUILIBRE && dto.valeur === undefined) {
      throw new BadRequestException(`Une échéance de type ${dto.type} doit préciser une valeur`);
    }

    const existantes = await this.prisma.echeanceReglement.findMany({ where: { modeleReglementId: modeleId } });

    if (dto.type === TypeEcheance.EQUILIBRE && existantes.some((e) => e.type === TypeEcheance.EQUILIBRE)) {
      throw new ConflictException('Ce modèle a déjà une échéance de type Équilibre · une seule est autorisée');
    }
    if (dto.type === TypeEcheance.POURCENTAGE) {
      const sommeExistante = existantes
        .filter((e) => e.type === TypeEcheance.POURCENTAGE)
        .reduce((s, e) => s + Number(e.valeur ?? 0), 0);
      if (sommeExistante + (dto.valeur ?? 0) > 100 + 0.005) {
        throw new BadRequestException(
          `La somme des échéances en pourcentage dépasserait 100 % (${sommeExistante} % déjà réparti)`,
        );
      }
    }

    const dejaCetOrdre = existantes.some((e) => e.ordre === dto.ordre);
    if (dejaCetOrdre) {
      throw new ConflictException(`Une échéance à l'ordre ${dto.ordre} existe déjà pour ce modèle`);
    }

    return this.prisma.echeanceReglement.create({
      data: {
        modeleReglementId: modeleId,
        ordre: dto.ordre,
        type: dto.type,
        valeur: dto.type === TypeEcheance.EQUILIBRE ? null : dto.valeur,
        delaiJours: dto.delaiJours,
        echeance: dto.echeance ?? ConditionEcheance.NET,
      },
    });
  }

  async supprimerEcheance(tenantId: string, modeleId: string, echeanceId: string) {
    await this.trouverModeleReglement(tenantId, modeleId);
    const echeance = await this.prisma.echeanceReglement.findFirst({ where: { id: echeanceId, modeleReglementId: modeleId } });
    if (!echeance) {
      throw new NotFoundException('Échéance introuvable pour ce modèle');
    }
    await this.prisma.echeanceReglement.delete({ where: { id: echeance.id } });
    return { id: echeanceId, supprimee: true };
  }

  /** dateFacture + delaiJours (NET), ou fin du mois de dateFacture + delaiJours (FIN_DE_MOIS). */
  private calculerDateEcheance(dateFacture: Date, delaiJours: number, condition: ConditionEcheance): Date {
    if (condition === ConditionEcheance.NET) {
      const d = new Date(dateFacture);
      d.setUTCDate(d.getUTCDate() + delaiJours);
      return d;
    }
    const finDeMois = new Date(Date.UTC(dateFacture.getUTCFullYear(), dateFacture.getUTCMonth() + 1, 0));
    finDeMois.setUTCDate(finDeMois.getUTCDate() + delaiJours);
    return finDeMois;
  }

  /**
   * Calcule l'échéancier d'un modèle pour une facture donnée : une seule
   * échéance (100 % à delaiJours/echeance du modèle) si aucune ligne
   * `EcheanceReglement` n'existe, sinon le détail par échéance dans l'ordre.
   * Pure fonction de simulation · ne persiste rien, aucune facture réelle
   * n'existe encore dans le modèle de données pour rattacher un échéancier.
   */
  async calculerEcheances(tenantId: string, modeleId: string, dto: CalculerEcheancesDto) {
    const modele = await this.trouverModeleReglement(tenantId, modeleId);
    const echeances = await this.prisma.echeanceReglement.findMany({
      where: { modeleReglementId: modeleId },
      orderBy: { ordre: 'asc' },
    });
    const dateFacture = new Date(dto.dateFacture);

    if (echeances.length === 0) {
      return [
        {
          ordre: 1,
          type: null,
          montant: dto.montantTotal,
          dateEcheance: this.calculerDateEcheance(dateFacture, modele.delaiJours, modele.echeance),
        },
      ];
    }

    let reste = dto.montantTotal;
    const resultat = echeances.map((e, i) => {
      let montant: number;
      if (e.type === TypeEcheance.EQUILIBRE || i === echeances.length - 1) {
        // La dernière échéance absorbe toujours le reste, même si elle
        // n'est pas explicitement de type EQUILIBRE · évite qu'un écart
        // d'arrondi sur les pourcentages laisse un centime non réparti.
        montant = Math.round(reste * 100) / 100;
      } else if (e.type === TypeEcheance.POURCENTAGE) {
        montant = Math.round(dto.montantTotal * (Number(e.valeur) / 100) * 100) / 100;
      } else {
        montant = Math.min(Number(e.valeur), Math.round(reste * 100) / 100);
      }
      reste = Math.round((reste - montant) * 100) / 100;
      return {
        ordre: e.ordre,
        type: e.type,
        montant,
        dateEcheance: this.calculerDateEcheance(dateFacture, e.delaiJours, e.echeance),
      };
    });

    return resultat;
  }
}
