import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ClasseCompte, Prisma, StatutRapprochement, TypeCompteDetailTotal } from '@prisma/client';
import { ConfirmerCorrespondancesDto, ImporterReleveDto, OuvrirRapprochementDto } from './dto/rapprochement.dto';
import { lireFichier } from '../import/lecture-fichier';
import {
  arrondi,
  FENETRE_JOURS_DEFAUT,
  lireReleve,
  montantVuDuCompte,
  proposerCorrespondances,
  reconnaitreColonnes,
  type ChampReleve,
} from './releve-bancaire';
import { avecRetrySerialisable } from '../../common/prisma-retry.util';

const EPSILON = 0.005;

/**
 * Rapprochement bancaire manuel (§3.4 · cf. docs/plan-de-construction.md) :
 * pointage écriture par écriture d'un compte de trésorerie face à un relevé
 * bancaire, distinct du lettrage (qui rapproche des écritures entre elles,
 * pas contre une source externe). Un seul rapprochement EN_COURS par compte
 * à la fois ; le solde de clôture du précédent sert de solde de départ au
 * suivant, écart affiché en continu, clôture bloquée tant qu'il n'est pas
 * nul · même discipline que LettrageService (solde de sélection nul avant
 * de lettrer).
 */
@Injectable()
export class RapprochementService {
  constructor(private readonly prisma: PrismaService) {}

  private async trouverCompteTresorerie(tenantId: string, compteId: string) {
    const compte = await this.prisma.compte.findFirst({ where: { id: compteId, tenantId } });
    if (!compte) {
      throw new NotFoundException('Compte introuvable pour ce tenant');
    }
    if (compte.classe !== ClasseCompte.CLASSE_5) {
      throw new BadRequestException(
        `Le compte ${compte.numero} n'est pas un compte de trésorerie (classe 5) · le rapprochement bancaire ne porte que sur ces comptes`,
      );
    }
    // Même garde-fou qu'EcritureService.creer pour les écritures directes :
    // un compte Total (§3.1) ne reçoit jamais de mouvement · un rapprochement
    // ouvert dessus n'aurait structurellement aucune ligne à pointer et se
    // clôturerait trivialement à 0/0, un faux "rapproché" silencieux. Trouvé
    // en testant délibérément ce cas limite (pas de bug spontané observé).
    if (compte.typeCompte === TypeCompteDetailTotal.TOTAL) {
      throw new BadRequestException(
        `Le compte ${compte.numero} est un compte Total (regroupement) · il ne reçoit jamais d'écriture directement, le rapprochement bancaire ne porte que sur un compte Détail`,
      );
    }
    return compte;
  }

  /**
   * Solde de clôture du dernier rapprochement CLOTURE de ce compte
   * STRICTEMENT AVANT `avant` (sa date de clôture s'il est déjà clôturé, ou
   * "maintenant" s'il est encore en cours), ou 0 si aucun.
   *
   * Un simple `id: { not: ... }` (exclure seulement le rapprochement affiché
   * lui-même) NE SUFFIT PAS pour la RELECTURE d'un rapprochement déjà
   * clôturé : la requête reste triée par `clotureAt desc` et remonterait
   * alors le rapprochement clôturé APRÈS lui (chronologiquement plus
   * récent), pas celui d'AVANT · deux bugs réels trouvés en testant à
   * l'écran juste après une clôture (le nouveau rapprochement se voyait
   * d'abord comme son propre "dernier clôturé" ; corrigé une première fois
   * par exclusion d'id, ce qui cassait alors la relecture du rapprochement
   * précédent, qui se voyait attribuer le solde de départ du SUIVANT).
   */
  private async soldeDepart(tenantId: string, compteId: string, avant: Date): Promise<number> {
    const dernier = await this.prisma.rapprochementBancaire.findFirst({
      where: { tenantId, compteId, statut: StatutRapprochement.CLOTURE, clotureAt: { lt: avant } },
      orderBy: { clotureAt: 'desc' },
    });
    return dernier ? Number(dernier.soldeReleve) : 0;
  }

  private async trouverRapprochement(tenantId: string, id: string) {
    const r = await this.prisma.rapprochementBancaire.findFirst({ where: { id, tenantId } });
    if (!r) {
      throw new NotFoundException('Rapprochement introuvable pour ce tenant');
    }
    return r;
  }

  async lister(tenantId: string, compteId?: string) {
    return this.prisma.rapprochementBancaire.findMany({
      where: { tenantId, ...(compteId ? { compteId } : {}) },
      include: { compte: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async ouvrir(tenantId: string, userId: string, dto: OuvrirRapprochementDto) {
    await this.trouverCompteTresorerie(tenantId, dto.compteId);

    // Lecture (aucun EN_COURS existant) puis écriture (création) · même
    // risque de condition de course que le numéro de pièce des journaux et
    // la prochaine lettre de lettrage (voir prisma-retry.util.ts) : deux
    // ouvertures simultanées sur le même compte pourraient toutes deux lire
    // "aucun EN_COURS" et créer chacune leur rapprochement, violant la
    // règle "un seul EN_COURS par compte" sans qu'aucune ne le remarque.
    return avecRetrySerialisable(
      this.prisma,
      async (tx) => {
        const enCours = await tx.rapprochementBancaire.findFirst({
          where: { tenantId, compteId: dto.compteId, statut: StatutRapprochement.EN_COURS },
        });
        if (enCours) {
          throw new ConflictException(
            `Un rapprochement est déjà en cours sur ce compte (ouvert le ${enCours.createdAt.toISOString().slice(0, 10)}, id ${enCours.id}) · clôturez-le ou annulez-le avant d'en ouvrir un nouveau`,
          );
        }
        return tx.rapprochementBancaire.create({
          data: {
            tenantId,
            compteId: dto.compteId,
            dateReleve: new Date(dto.dateReleve),
            soldeReleve: dto.soldeReleve,
            createdBy: userId,
          },
        });
      },
      'Trop d\'ouvertures de rapprochement simultanées sur ce compte · veuillez réessayer.',
    );
  }

  /** Détail d'un rapprochement : lignes déjà pointées ici + lignes encore pointables sur ce compte. */
  async obtenir(tenantId: string, id: string) {
    const rapprochement = await this.trouverRapprochement(tenantId, id);

    const lignes = await this.prisma.ligneEcriture.findMany({
      where: {
        compteId: rapprochement.compteId,
        ecriture: { tenantId },
        OR: [{ rapprochementId: id }, { rapprochementId: null }],
      },
      include: { ecriture: { include: { journal: true } } },
      orderBy: { ecriture: { date: 'asc' } },
    });

    const soldeDepart = await this.soldeDepart(tenantId, rapprochement.compteId, rapprochement.clotureAt ?? new Date());
    const lignesPointees = lignes.filter((l) => l.rapprochementId === id);
    const soldePointe =
      soldeDepart + lignesPointees.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
    const ecart = soldePointe - Number(rapprochement.soldeReleve);

    const releve = await this.prisma.ligneReleveBancaire.findMany({
      where: { tenantId, rapprochementId: id },
      orderBy: { rang: 'asc' },
    });
    // CONTRÔLE DU RELEVÉ LUI-MÊME · solde de départ plus ses mouvements doit
    // donner le solde imprimé. Un écart dit que le fichier ne couvre pas toute
    // la période (lignes manquantes, export tronqué) ou que le solde de départ
    // n'est pas celui de la banque · il se lit AVANT de rapprocher, sinon on
    // rapproche un relevé incomplet.
    const ecartReleve =
      releve.length === 0
        ? null
        : arrondi(
            soldeDepart +
              releve.reduce((acc, r) => acc + Number(r.credit) - Number(r.debit), 0) -
              Number(rapprochement.soldeReleve),
          );

    return {
      rapprochement,
      soldeDepart,
      soldePointe,
      ecart,
      equilibre: Math.abs(ecart) < EPSILON,
      ecartReleve,
      releve: releve.map((r) => ({
        id: r.id,
        rang: r.rang,
        date: r.date,
        libelle: r.libelle,
        reference: r.reference,
        debit: Number(r.debit),
        credit: Number(r.credit),
        ligneEcritureIds: lignes.filter((l) => l.ligneReleveId === r.id).map((l) => l.id),
      })),
      lignes: lignes.map((l) => ({
        id: l.id,
        date: l.ecriture.date,
        journalCode: l.ecriture.journal.code,
        libelle: l.libelle ?? l.ecriture.libelle,
        reference: l.ecriture.reference,
        debit: Number(l.debit),
        credit: Number(l.credit),
        pointee: l.rapprochementId === id,
        ligneReleveId: l.ligneReleveId,
      })),
    };
  }

  private async assurerEnCours(tenantId: string, id: string) {
    const rapprochement = await this.trouverRapprochement(tenantId, id);
    if (rapprochement.statut !== StatutRapprochement.EN_COURS) {
      throw new BadRequestException('Ce rapprochement est déjà clôturé · plus aucun pointage possible');
    }
    return rapprochement;
  }

  async pointer(tenantId: string, id: string, ligneIds: string[]) {
    const rapprochement = await this.assurerEnCours(tenantId, id);

    const lignes = await this.prisma.ligneEcriture.findMany({
      where: { id: { in: ligneIds } },
      include: { ecriture: true },
    });
    if (lignes.length !== ligneIds.length) {
      throw new NotFoundException('Une ou plusieurs lignes sont introuvables');
    }
    for (const l of lignes) {
      if (l.compteId !== rapprochement.compteId || l.ecriture.tenantId !== tenantId) {
        throw new BadRequestException('Toutes les lignes doivent appartenir au compte rapproché et au tenant indiqué');
      }
      if (l.rapprochementId && l.rapprochementId !== id) {
        throw new BadRequestException('Une des lignes est déjà pointée sur un autre rapprochement');
      }
    }

    await this.prisma.ligneEcriture.updateMany({ where: { id: { in: ligneIds } }, data: { rapprochementId: id } });
    return { nombreLignes: ligneIds.length };
  }

  async depointer(tenantId: string, id: string, ligneIds: string[]) {
    await this.assurerEnCours(tenantId, id);
    const resultat = await this.prisma.ligneEcriture.updateMany({
      where: { id: { in: ligneIds }, rapprochementId: id, ecriture: { tenantId } },
      // Dépointer dénoue aussi la correspondance avec le relevé · une ligne
      // dépointée restée rattachée à une ligne du relevé la ferait passer pour
      // rapprochée à l'écran sans compter dans le solde pointé.
      data: { rapprochementId: null, ligneReleveId: null },
    });
    return { nombreLignes: resultat.count };
  }

  async cloturer(tenantId: string, id: string) {
    const rapprochement = await this.assurerEnCours(tenantId, id);
    const { ecart, equilibre } = await this.obtenir(tenantId, id);
    if (!equilibre) {
      throw new BadRequestException(
        `L'écart n'est pas nul (${ecart.toFixed(2)}) · pointez ou dépointez des lignes jusqu'à ce que le solde pointé corresponde exactement au solde du relevé avant de clôturer`,
      );
    }
    return this.prisma.rapprochementBancaire.update({
      where: { id: rapprochement.id },
      data: { statut: StatutRapprochement.CLOTURE, clotureAt: new Date() },
    });
  }

  /**
   * Annule un rapprochement EN_COURS ouvert par erreur : dépointe ses
   * lignes puis le supprime. Deux annulations simultanées du même
   * rapprochement passeraient toutes deux `assurerEnCours` (aucune n'a
   * encore supprimé la ligne au moment où l'autre la lit) ; la seconde
   * `delete` échouerait alors sur un enregistrement déjà supprimé · capturé
   * ici pour ne jamais renvoyer une erreur Prisma brute (P2025) à
   * l'utilisateur, même principe que le reste de l'API (jamais de 500 nu).
   */
  async annuler(tenantId: string, id: string) {
    const rapprochement = await this.assurerEnCours(tenantId, id);
    await this.prisma.ligneEcriture.updateMany({
      where: { rapprochementId: rapprochement.id },
      data: { rapprochementId: null, ligneReleveId: null },
    });
    try {
      await this.prisma.rapprochementBancaire.delete({ where: { id: rapprochement.id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundException('Ce rapprochement a déjà été annulé');
      }
      throw err;
    }
    return { supprime: true };
  }

  // =========================================================================
  // RELEVÉ IMPORTÉ ET CORRESPONDANCES (2026-09-25) · voir releve-bancaire.ts
  // =========================================================================

  /**
   * IMPORTE le relevé du rapprochement. Refusé dès qu'une anomalie est lue,
   * et quand une ligne est datée APRÈS la date du relevé · elle appartient au
   * relevé suivant, et la prendre ici ferait rapprocher une opération que le
   * solde imprimé ne contient pas. Un relevé déjà importé se REMPLACE tant
   * qu'aucune de ses lignes n'est rapprochée ; après, il faut dissocier
   * d'abord, pour qu'aucune correspondance confirmée ne disparaisse sans geste.
   */
  async importerReleve(tenantId: string, id: string, dto: ImporterReleveDto) {
    const rapprochement = await this.assurerEnCours(tenantId, id);
    const tableau = await lireFichier(dto.nomFichier, dto.contenuBase64);
    const index = reconnaitreColonnes(tableau.colonnes, (dto.colonnes ?? {}) as Partial<Record<ChampReleve, string>>);
    const { lignes, anomalies } = lireReleve(tableau, index);
    const fin = rapprochement.dateReleve.getTime();
    lignes.forEach((l) => {
      if (l.date.getTime() > fin) {
        anomalies.push(
          `Opération du ${l.date.toISOString().slice(0, 10)} (« ${l.libelle} ») postérieure à la date du relevé · elle appartient au relevé suivant.`,
        );
      }
    });
    if (anomalies.length > 0) {
      // Les dix premières seulement, et le compte du reste · un relevé mal
      // lu d'un bout à l'autre rendrait sinon un message de trois écrans.
      const reste = anomalies.length > 10 ? ` Et ${anomalies.length - 10} autre(s).` : '';
      throw new BadRequestException(
        `Relevé non importé · ${anomalies.slice(0, 10).join(' ')}${reste} Colonnes du fichier : ${tableau.colonnes.join(', ')}.`,
      );
    }
    if (lignes.length === 0) {
      throw new BadRequestException('Le relevé ne contient aucune opération.');
    }
    const dejaRapprochees = await this.prisma.ligneEcriture.count({
      where: { ecriture: { tenantId }, ligneReleve: { rapprochementId: id, tenantId } },
    });
    if (dejaRapprochees > 0) {
      throw new ConflictException(
        'Des lignes du relevé actuel sont déjà rapprochées · dissociez-les avant de réimporter le relevé.',
      );
    }
    await this.prisma.$transaction([
      this.prisma.ligneReleveBancaire.deleteMany({ where: { tenantId, rapprochementId: id } }),
      this.prisma.ligneReleveBancaire.createMany({
        data: lignes.map((l) => ({
          tenantId,
          rapprochementId: id,
          rang: l.rang,
          date: l.date,
          libelle: l.libelle,
          reference: l.reference,
          debit: l.debit,
          credit: l.credit,
        })),
      }),
    ]);
    return { nombreLignes: lignes.length };
  }

  /** Retire le relevé importé, s'il n'a encore aucune ligne rapprochée. */
  async retirerReleve(tenantId: string, id: string) {
    await this.assurerEnCours(tenantId, id);
    const dejaRapprochees = await this.prisma.ligneEcriture.count({
      where: { ecriture: { tenantId }, ligneReleve: { rapprochementId: id, tenantId } },
    });
    if (dejaRapprochees > 0) {
      throw new ConflictException('Des lignes du relevé sont rapprochées · dissociez-les avant de retirer le relevé.');
    }
    const r = await this.prisma.ligneReleveBancaire.deleteMany({ where: { tenantId, rapprochementId: id } });
    return { nombreLignes: r.count };
  }

  /**
   * PROPOSE les correspondances, sans rien écrire. Recalculée à chaque appel,
   * elle ne peut pas être périmée · même parti que le pré-lettrage.
   */
  async proposer(tenantId: string, id: string, fenetreJours = FENETRE_JOURS_DEFAUT) {
    const rapprochement = await this.assurerEnCours(tenantId, id);
    const releve = await this.prisma.ligneReleveBancaire.findMany({
      where: { tenantId, rapprochementId: id, lignesEcriture: { none: {} } },
      orderBy: { rang: 'asc' },
    });
    const compte = await this.prisma.ligneEcriture.findMany({
      where: { compteId: rapprochement.compteId, ecriture: { tenantId }, rapprochementId: null, ligneReleveId: null },
      include: { ecriture: { select: { date: true, reference: true } } },
    });
    const propositions = proposerCorrespondances(
      releve.map((r) => ({
        id: r.id,
        rang: r.rang,
        date: r.date,
        libelle: r.libelle,
        reference: r.reference,
        debit: Number(r.debit),
        credit: Number(r.credit),
      })),
      compte.map((l) => ({
        id: l.id,
        date: l.ecriture.date,
        reference: l.ecriture.reference,
        debit: Number(l.debit),
        credit: Number(l.credit),
      })),
      fenetreJours,
    );
    return {
      fenetreJours,
      propositions,
      // Ce qui n'a PAS été rapproché est compté · une proposition qui ne
      // montrerait que ses trouvailles laisserait croire que le reste l'est.
      lignesReleveSansProposition: releve.length - propositions.length,
    };
  }

  /**
   * CONFIRME des correspondances, proposées ou composées à la main. Rien de ce
   * que le client renvoie n'est cru · chaque groupe est REJOUÉ : ligne du
   * relevé de CE rapprochement et libre, lignes du compte rapproché, du
   * dossier, libres, et somme vue du compte ÉGALE au montant du relevé, au
   * centime. Puis la ligne est pointée · une correspondance confirmée EST un
   * pointage, et c'est lui que l'écart et la clôture lisent déjà.
   */
  async confirmer(tenantId: string, id: string, dto: ConfirmerCorrespondancesDto) {
    const rapprochement = await this.assurerEnCours(tenantId, id);
    const idsReleve = dto.correspondances.map((c) => c.ligneReleveId);
    const idsCompte = dto.correspondances.flatMap((c) => c.ligneEcritureIds);
    if (new Set(idsReleve).size !== idsReleve.length || new Set(idsCompte).size !== idsCompte.length) {
      throw new BadRequestException('Une même ligne figure dans deux correspondances.');
    }
    const releve = await this.prisma.ligneReleveBancaire.findMany({
      where: { tenantId, rapprochementId: id, id: { in: idsReleve } },
      include: { lignesEcriture: { select: { id: true } } },
    });
    if (releve.length !== idsReleve.length) {
      throw new NotFoundException('Une ligne du relevé est introuvable dans ce rapprochement.');
    }
    const compte = await this.prisma.ligneEcriture.findMany({
      where: { id: { in: idsCompte }, ecriture: { tenantId } },
    });
    if (compte.length !== idsCompte.length) {
      throw new NotFoundException('Une ligne d\'écriture est introuvable.');
    }
    for (const c of dto.correspondances) {
      const r = releve.find((x) => x.id === c.ligneReleveId)!;
      if (r.lignesEcriture.length > 0) {
        throw new BadRequestException(`La ligne du relevé « ${r.libelle} » est déjà rapprochée.`);
      }
      const lignes = compte.filter((l) => c.ligneEcritureIds.includes(l.id));
      for (const l of lignes) {
        if (l.compteId !== rapprochement.compteId) {
          throw new BadRequestException('Toutes les lignes doivent appartenir au compte rapproché.');
        }
        if ((l.rapprochementId && l.rapprochementId !== id) || l.ligneReleveId) {
          throw new BadRequestException('Une des lignes est déjà pointée ou rapprochée.');
        }
      }
      const attendu = montantVuDuCompte({ debit: Number(r.debit), credit: Number(r.credit) });
      const obtenu = arrondi(lignes.reduce((acc, l) => acc + Number(l.debit) - Number(l.credit), 0));
      if (Math.abs(attendu - obtenu) >= EPSILON) {
        throw new BadRequestException(
          `« ${r.libelle} » : le relevé porte ${attendu.toFixed(2)} vu du compte, les lignes choisies ${obtenu.toFixed(2)} · ` +
            'un écart ne se rapproche pas, il se comptabilise.',
        );
      }
    }
    await this.prisma.$transaction(
      dto.correspondances.map((c) =>
        this.prisma.ligneEcriture.updateMany({
          where: { id: { in: c.ligneEcritureIds }, ecriture: { tenantId }, ligneReleveId: null },
          data: { rapprochementId: id, ligneReleveId: c.ligneReleveId },
        }),
      ),
    );
    return { nombreCorrespondances: dto.correspondances.length };
  }

  /** Dissocie une ligne du relevé de ses écritures, et les dépointe. */
  async dissocier(tenantId: string, id: string, ligneReleveId: string) {
    await this.assurerEnCours(tenantId, id);
    const r = await this.prisma.ligneReleveBancaire.findFirst({ where: { id: ligneReleveId, tenantId, rapprochementId: id } });
    if (!r) throw new NotFoundException('Ligne du relevé introuvable dans ce rapprochement.');
    const res = await this.prisma.ligneEcriture.updateMany({
      where: { ligneReleveId, ecriture: { tenantId } },
      data: { ligneReleveId: null, rapprochementId: null },
    });
    return { nombreLignes: res.count };
  }
}
