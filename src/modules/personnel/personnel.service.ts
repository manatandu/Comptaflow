import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TypeContratTravail } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { ContratTravailDto, SalarieDto, TerminerContratDto } from './dto/personnel.dto';
import {
  aptitudeProvisoirePerimee,
  declarationsDues,
  mentionsManquantes,
  requalifications,
  verdictEssai,
  type ContratPourControle,
} from './regles-contrat-travail';

/**
 * LE REGISTRE DU PERSONNEL · P1 de la paie.
 *
 * CE QU'IL FAIT : il tient l'état civil et les engagements, et il CONFRONTE
 * chaque contrat à l'article 212 et aux requalifications des articles 40 à
 * 45. CE QU'IL NE FAIT PAS : aucun bulletin, aucune assiette, aucun montant.
 * P0 a établi que le moteur bute sur des textes absents du corpus, et le
 * registre ne les contourne pas.
 *
 * IL EST COMMUN AUX DEUX RÉFÉRENTIELS, et ce n'est pas un oubli du
 * cloisonnement (CLAUDE.md § 6). Le Code du travail ne connaît ni le SYCEBNL
 * ni le SYSCOHADA : une ASBL et une SARL embauchent sous le MÊME texte. Ce
 * qui diffère est la note annexe où l'effectif ressort (27B en SYSCOHADA,
 * 29B en SYCEBNL), et elle est tranchée dans les tables de correspondance,
 * pas ici.
 *
 * DONNÉES PERSONNELLES. C'est le premier module du dépôt à en détenir. Trois
 * conséquences, toutes tenues ailleurs et rappelées ici pour qu'on ne les
 * défasse pas par distraction :
 *  · les trois tables entrent au journal d'audit AVEC une liste d'exclusion
 *    nommée colonne par colonne (`champs-audites.ts`) ;
 *  · le cloisonnement est posé AUX DEUX BOUTS · `tenantId` dans le `where` de
 *    chaque lecture ET de chaque écriture, jamais déduit d'un identifiant
 *    fourni par le client ;
 *  · l'archive de restitution du dossier les emporte, et le test qui compte
 *    les modèles restituables tombe tant que quelqu'un ne les y a pas classés.
 */
@Injectable()
export class PersonnelService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Le registre, salarié par salarié, avec le contrat EN COURS de chacun.
   *
   * UN SALARIÉ PARTI RESTE AU REGISTRE. Un registre qui efface les partants
   * ne peut plus servir ni le décompte final, ni la déclaration annuelle de
   * l'art. 218, ni un contrôle · c'est son CONTRAT qui se termine.
   */
  async lister(tenantId: string, inclureInactifs = false) {
    const salaries = await this.prisma.salarie.findMany({
      where: { tenantId, ...(inclureInactifs ? {} : { actif: true }) },
      orderBy: [{ nom: 'asc' }, { postNom: 'asc' }],
      include: {
        enfants: { orderBy: { dateNaissance: 'asc' } },
        contrats: { orderBy: { dateEntreeEnVigueur: 'desc' } },
      },
    });
    return salaries.map((s) => ({
      ...s,
      contratEnCours: s.contrats.find((c) => c.dateFin === null) ?? null,
      nombreContrats: s.contrats.length,
    }));
  }

  async creerSalarie(tenantId: string, userId: string, dto: SalarieDto) {
    await this.verifierMatriculeLibre(tenantId, dto.matricule, null);
    return this.prisma.salarie.create({
      data: {
        tenantId,
        createdBy: userId,
        ...this.champsSalarie(dto),
        ...(dto.enfants
          ? {
              enfants: {
                create: dto.enfants.map((e) => ({
                  tenantId,
                  nom: e.nom,
                  postNom: e.postNom ?? null,
                  prenoms: e.prenoms ?? null,
                  dateNaissance: e.dateNaissance ? new Date(e.dateNaissance) : null,
                })),
              },
            }
          : {}),
      },
      include: { enfants: true },
    });
  }

  async modifierSalarie(tenantId: string, salarieId: string, dto: SalarieDto) {
    // CLOISONNEMENT AU PREMIER BOUT · on vérifie que le salarié appartient au
    // dossier AVANT d'écrire, et jamais en faisant confiance à l'identifiant.
    const existant = await this.prisma.salarie.findFirst({
      where: { id: salarieId, tenantId },
      select: { id: true },
    });
    if (!existant) throw new NotFoundException('Salarié introuvable dans ce dossier.');
    await this.verifierMatriculeLibre(tenantId, dto.matricule, salarieId);

    return this.prisma.$transaction(async (tx) => {
      if (dto.enfants) {
        // Les enfants sont remplacés en bloc · la fiche les rend tous, et
        // une mise à jour partielle laisserait un enfant supprimé à l'écran
        // revenir au prochain chargement.
        await tx.enfantACharge.deleteMany({ where: { tenantId, salarieId } });
        for (const e of dto.enfants) {
          await tx.enfantACharge.create({
            data: {
              tenantId,
              salarieId,
              nom: e.nom,
              postNom: e.postNom ?? null,
              prenoms: e.prenoms ?? null,
              dateNaissance: e.dateNaissance ? new Date(e.dateNaissance) : null,
            },
          });
        }
      }
      // CLOISONNEMENT AU SECOND BOUT · `updateMany` porte le `tenantId` dans
      // son `where`, pour qu'aucun chemin ne puisse écrire hors du dossier,
      // même si le contrôle ci-dessus était un jour contourné.
      await tx.salarie.updateMany({
        where: { id: salarieId, tenantId },
        data: this.champsSalarie(dto),
      });
      return tx.salarie.findFirst({
        where: { id: salarieId, tenantId },
        include: { enfants: true, contrats: true },
      });
    });
  }

  private champsSalarie(dto: SalarieDto) {
    return {
      matricule: dto.matricule?.trim() || null,
      nom: dto.nom.trim(),
      postNom: dto.postNom?.trim() || null,
      prenoms: dto.prenoms?.trim() || null,
      sexe: dto.sexe,
      numeroAffiliationCnss: dto.numeroAffiliationCnss?.trim() || null,
      dateNaissance: dto.dateNaissance ? new Date(dto.dateNaissance) : null,
      millesimeNaissance: dto.millesimeNaissance ?? null,
      lieuNaissance: dto.lieuNaissance?.trim() || null,
      nationalite: dto.nationalite?.trim() || null,
      nomConjoint: dto.nomConjoint?.trim() || null,
      aptitudeConstateeLe: dto.aptitudeConstateeLe ? new Date(dto.aptitudeConstateeLe) : null,
      aptitudeConstateePar: dto.aptitudeConstateePar?.trim() || null,
      aptitudeProvisoire: dto.aptitudeProvisoire ?? false,
      declarationEngagementLe: dto.declarationEngagementLe
        ? new Date(dto.declarationEngagementLe)
        : null,
      declarationDepartLe: dto.declarationDepartLe ? new Date(dto.declarationDepartLe) : null,
      actif: dto.actif ?? true,
    };
  }

  private async verifierMatriculeLibre(
    tenantId: string,
    matricule: string | undefined,
    sauf: string | null,
  ) {
    const valeur = matricule?.trim();
    if (!valeur) return;
    const autre = await this.prisma.salarie.findFirst({
      where: { tenantId, matricule: valeur, ...(sauf ? { NOT: { id: sauf } } : {}) },
      select: { nom: true, postNom: true },
    });
    if (autre) {
      throw new BadRequestException(
        `Le matricule « ${valeur} » est déjà porté par ${autre.nom} ${autre.postNom ?? ''}`.trim() +
          ". Le matricule est « éventuel » au sens de l'article 212, point 4 · laissez-le vide plutôt que de le dédoubler.",
      );
    }
  }

  async creerContrat(
    tenantId: string,
    userId: string,
    salarieId: string,
    dto: ContratTravailDto,
  ) {
    const salarie = await this.prisma.salarie.findFirst({
      where: { id: salarieId, tenantId },
      select: { id: true },
    });
    if (!salarie) throw new NotFoundException('Salarié introuvable dans ce dossier.');

    if (dto.renouvelleDeId) {
      // UN RENOUVELLEMENT SE RATTACHE À UN CONTRAT DU MÊME SALARIÉ, dans le
      // MÊME dossier. Sans ces deux bornes, la chaîne de renouvellements se
      // laisserait construire à travers deux dossiers, et le décompte de
      // l'art. 41 compterait des contrats qui ne sont pas les siens.
      const source = await this.prisma.contratTravail.findFirst({
        where: { id: dto.renouvelleDeId, tenantId, salarieId },
        select: { id: true },
      });
      if (!source) {
        throw new BadRequestException(
          "Le contrat renouvelé est introuvable pour ce salarié dans ce dossier. Un renouvellement se rattache au contrat qu'il prolonge, et à lui seul.",
        );
      }
    }

    return this.prisma.contratTravail.create({
      data: {
        tenantId,
        salarieId,
        createdBy: userId,
        type: dto.type,
        constateParEcrit: dto.constateParEcrit ?? true,
        dateEntreeEnVigueur: new Date(dto.dateEntreeEnVigueur),
        dateConclusion: dto.dateConclusion ? new Date(dto.dateConclusion) : null,
        lieuConclusion: dto.lieuConclusion?.trim() || null,
        dateFinPrevue: dto.dateFinPrevue ? new Date(dto.dateFinPrevue) : null,
        separeDeSaFamille: dto.separeDeSaFamille ?? false,
        ouvrageDetermine: dto.ouvrageDetermine?.trim() || null,
        motifRemplacement: dto.motifRemplacement?.trim() || null,
        emploiPermanent: dto.emploiPermanent ?? false,
        natureTravail: dto.natureTravail?.trim() || null,
        lieuExecution: dto.lieuExecution?.trim() || null,
        categorieProfessionnelle: dto.categorieProfessionnelle?.trim() || null,
        manoeuvreSansSpecialite: dto.manoeuvreSansSpecialite ?? false,
        remunerationBase: dto.remunerationBase ?? null,
        avantagesConvenus: dto.avantagesConvenus?.trim() || null,
        clauseEssai: dto.clauseEssai ?? false,
        essaiConstateParEcrit: dto.essaiConstateParEcrit ?? false,
        essaiDureeJours: dto.essaiDureeJours ?? null,
        dureePreavisJours: dto.dureePreavisJours ?? null,
        viseParOnem: dto.viseParOnem ?? false,
        dateVisaOnem: dto.dateVisaOnem ? new Date(dto.dateVisaOnem) : null,
        renouvelleDeId: dto.renouvelleDeId ?? null,
      },
    });
  }

  async terminerContrat(tenantId: string, contratId: string, dto: TerminerContratDto) {
    const contrat = await this.prisma.contratTravail.findFirst({
      where: { id: contratId, tenantId },
      select: { id: true, dateEntreeEnVigueur: true, dateFin: true },
    });
    if (!contrat) throw new NotFoundException('Contrat introuvable dans ce dossier.');
    const fin = new Date(dto.dateFin);
    if (fin.getTime() < contrat.dateEntreeEnVigueur.getTime()) {
      throw new BadRequestException(
        "La date de fin est antérieure à l'entrée en vigueur du contrat.",
      );
    }
    await this.prisma.contratTravail.updateMany({
      where: { id: contratId, tenantId },
      data: { dateFin: fin, motifFin: dto.motifFin?.trim() || null },
    });
    return this.prisma.contratTravail.findFirst({ where: { id: contratId, tenantId } });
  }

  /**
   * LA CONFRONTATION · ce qu'un inspecteur du travail lirait.
   *
   * Elle est RECALCULÉE à chaque appel et jamais stockée : un contrat complété
   * hier doit cesser d'être signalé aujourd'hui, et une colonne du dossier
   * remplie entre-temps (le numéro CNSS de l'employeur, par exemple) lève le
   * manque sur TOUS les contrats d'un coup.
   */
  async confronter(tenantId: string, aujourdhui = new Date()) {
    const [tenant, salaries] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { nom: true, numeroAffiliationCnssEmployeur: true },
      }),
      this.prisma.salarie.findMany({
        where: { tenantId },
        include: { enfants: true, contrats: { orderBy: { dateEntreeEnVigueur: 'asc' } } },
        orderBy: [{ nom: 'asc' }],
      }),
    ]);

    const employeur = {
      nom: tenant.nom,
      numeroAffiliationCnssEmployeur: tenant.numeroAffiliationCnssEmployeur,
    };

    const fiches = salaries.flatMap((s) => {
      const pourControle = {
        nom: s.nom,
        postNom: s.postNom,
        prenoms: s.prenoms,
        sexe: s.sexe as string,
        numeroAffiliationCnss: s.numeroAffiliationCnss,
        dateNaissance: s.dateNaissance,
        millesimeNaissance: s.millesimeNaissance,
        lieuNaissance: s.lieuNaissance,
        nationalite: s.nationalite,
        nomConjoint: s.nomConjoint,
        aptitudeConstateeLe: s.aptitudeConstateeLe,
        enfantsSansDateNaissance: s.enfants.filter((e) => e.dateNaissance === null).length,
      };

      // LE DÉCOMPTE DE L'ART. 41 SE FAIT PAR SALARIÉ ET PAR RANG, pas en
      // masse : c'est le NOMBRE DE CDD DÉJÀ CONCLUS, celui-ci compris, qui
      // fait basculer le troisième. Compter tous les CDD du salarié pour
      // chacun d'eux ferait requalifier le premier rétroactivement.
      let rangCdd = 0;
      return s.contrats.map((c) => {
        if (c.type === TypeContratTravail.DUREE_DETERMINEE) rangCdd += 1;
        const contrat: ContratPourControle = {
          type: c.type,
          constateParEcrit: c.constateParEcrit,
          dateEntreeEnVigueur: c.dateEntreeEnVigueur,
          dateConclusion: c.dateConclusion,
          lieuConclusion: c.lieuConclusion,
          dateFinPrevue: c.dateFinPrevue,
          ouvrageDetermine: c.ouvrageDetermine,
          motifRemplacement: c.motifRemplacement,
          emploiPermanent: c.emploiPermanent,
          natureTravail: c.natureTravail,
          lieuExecution: c.lieuExecution,
          remunerationBase: c.remunerationBase === null ? null : Number(c.remunerationBase),
          avantagesConvenus: c.avantagesConvenus,
          dureePreavisJours: c.dureePreavisJours,
          separeDeSaFamille: c.separeDeSaFamille,
          manoeuvreSansSpecialite: c.manoeuvreSansSpecialite,
          clauseEssai: c.clauseEssai,
          essaiConstateParEcrit: c.essaiConstateParEcrit,
          essaiDureeJours: c.essaiDureeJours,
        };
        const nombreRenouvellements = this.longueurChaineRenouvellement(s.contrats, c.id);
        return {
          salarieId: s.id,
          salarie: [s.nom, s.postNom, s.prenoms].filter(Boolean).join(' '),
          contratId: c.id,
          type: c.type,
          dateEntreeEnVigueur: c.dateEntreeEnVigueur,
          dateFin: c.dateFin,
          mentionsManquantes: mentionsManquantes(employeur, pourControle, contrat),
          requalifications: requalifications(contrat, {
            nombreCdd: rangCdd,
            nombreRenouvellements,
          }),
          essai: verdictEssai(contrat),
          declarations: declarationsDues(
            {
              dateEntreeEnVigueur: c.dateEntreeEnVigueur,
              declarationEngagementLe: s.declarationEngagementLe,
              dateFin: c.dateFin,
              declarationDepartLe: s.declarationDepartLe,
            },
            aujourdhui,
          ),
          aptitudeProvisoirePerimee: aptitudeProvisoirePerimee(
            { aptitudeProvisoire: s.aptitudeProvisoire },
            contrat,
            aujourdhui,
          ),
          // ART. 47 · le défaut de visa ouvre au travailleur la résiliation
          // sans préavis. Il n'est pas une requalification · il est rendu à
          // part pour ne pas se confondre avec elles.
          visaOnemManquant: c.constateParEcrit && !c.viseParOnem,
        };
      });
    });

    return {
      employeur,
      // Un dossier qui n'a pas saisi son numéro CNSS d'employeur le voit UNE
      // fois, en tête, et non répété sur chaque contrat.
      manqueEmployeur: tenant.numeroAffiliationCnssEmployeur === null,
      fiches,
      totalSignalements: fiches.reduce(
        (n, f) =>
          n +
          f.mentionsManquantes.length +
          f.requalifications.length +
          f.declarations.filter((d) => d.enRetard).length,
        0,
      ),
    };
  }

  /** Le nombre de renouvellements qui MÈNENT à ce contrat, celui-ci compris. */
  private longueurChaineRenouvellement(
    contrats: Array<{ id: string; renouvelleDeId: string | null }>,
    id: string,
  ): number {
    const parId = new Map(contrats.map((c) => [c.id, c]));
    let n = 0;
    let courant = parId.get(id);
    // La chaîne est bornée par le nombre de contrats · une boucle
    // impossible en base (le lien est unique) ne doit pas pouvoir pendre ici.
    while (courant?.renouvelleDeId && n <= contrats.length) {
      n += 1;
      courant = parId.get(courant.renouvelleDeId);
    }
    return n;
  }

  /**
   * L'EFFECTIF À UNE DATE, et la part de main-d'œuvre nationale.
   *
   * ELLE EST PROPOSÉE, JAMAIS SUBSTITUÉE. `AccordCadrePlan.partMainOeuvreLocale`
   * reste une valeur SAISIE, avec sa source et sa date · c'est la règle posée
   * quand ce champ a été créé, et le registre ne la renverse pas. Ce que le
   * registre apporte est une PROPOSITION chiffrée, avec sa source nommée
   * (« le registre du personnel au JJ/MM/AAAA »), que le dossier confirme.
   *
   * POURQUOI NE PAS LA SUBSTITUER. Un registre incomplet donnerait une part
   * fausse d'apparence calculée, sur un engagement d'accord-cadre dont le
   * manquement se sanctionne. Une source saisie et assumée vaut mieux qu'un
   * calcul qui ne sait pas ce qu'il ignore.
   */
  async effectif(tenantId: string, ala: Date) {
    const contrats = await this.prisma.contratTravail.findMany({
      where: {
        tenantId,
        dateEntreeEnVigueur: { lte: ala },
        OR: [{ dateFin: null }, { dateFin: { gte: ala } }],
      },
      select: {
        salarieId: true,
        type: true,
        salarie: { select: { sexe: true, nationalite: true } },
      },
    });

    // UN SALARIÉ, PAS UN CONTRAT. Deux contrats simultanés pour la même
    // personne (rare, mais possible) ne font pas deux personnes à l'effectif.
    const parSalarie = new Map<string, (typeof contrats)[number]>();
    for (const c of contrats) if (!parSalarie.has(c.salarieId)) parSalarie.set(c.salarieId, c);
    const uniques = [...parSalarie.values()];

    const nationalite = (n: string | null) => (n ?? '').trim().toLowerCase();
    const estCongolaise = (n: string | null) =>
      ['congolaise', 'congolais', 'rdc', 'rd congo'].includes(nationalite(n));

    const nationaux = uniques.filter((c) => estCongolaise(c.salarie.nationalite)).length;
    const sansNationalite = uniques.filter((c) => nationalite(c.salarie.nationalite) === '').length;

    return {
      ala,
      effectif: uniques.length,
      hommes: uniques.filter((c) => c.salarie.sexe === 'MASCULIN').length,
      femmes: uniques.filter((c) => c.salarie.sexe === 'FEMININ').length,
      permanents: uniques.filter((c) => c.type === TypeContratTravail.DUREE_INDETERMINEE).length,
      nationaux,
      sansNationalite,
      /**
       * NULLE TANT QU'UNE SEULE NATIONALITÉ MANQUE. Une part calculée sur un
       * registre incomplet est un chiffre faux d'apparence exacte, et c'est
       * précisément l'engagement de l'art. 37, point 4 de la loi n° 004/2001
       * (60 % de main-d'œuvre locale) qu'elle servirait.
       */
      partMainOeuvreNationale:
        uniques.length === 0 || sansNationalite > 0 ? null : (nationaux / uniques.length) * 100,
      source: `Registre du personnel au ${ala.toISOString().slice(0, 10)}`,
      reserve:
        sansNationalite > 0
          ? `${sansNationalite} salarié(s) de l'effectif n'ont pas de nationalité au registre. La part de main-d'œuvre nationale n'est pas calculée : un pourcentage tiré d'un registre incomplet serait faux sous une apparence de calcul, et c'est l'engagement des 60 % de l'article 37, point 4 de la loi n° 004/2001 qu'il servirait.`
          : null,
    };
  }
}

export type Confrontation = Awaited<ReturnType<PersonnelService['confronter']>>;
export type Effectif = Awaited<ReturnType<PersonnelService['effectif']>>;
