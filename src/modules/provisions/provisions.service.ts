import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { NatureProvision, Referentiel, StatutProvision } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { CreerProvisionDto, ModifierProvisionDto, StatuerProvisionDto } from './dto/provision.dto';

/**
 * REGISTRE DES PROVISIONS POUR RISQUES ET CHARGES.
 *
 * LE FONDEMENT, et il est commun aux deux référentiels par un renvoi
 * EXPRÈS. L'AUDCIF traite la matière au Titre VIII, chapitre 18
 * (« Provisions, passifs éventuels et actifs éventuels »), et la fiche du
 * COMPTE 19 du SYCEBNL y renvoie mot pour mot : « Les provisions, passifs et
 * actifs éventuels sont traités au titre VIII Opérations et problèmes
 * spécifiques, chapitre 18 […] du SYSCOHADA ». Le module est donc ouvert aux
 * deux, sans `@ReferentielsAutorises` · ce n'est pas une tolérance, c'est le
 * texte du SYCEBNL lui-même qui envoie chercher la doctrine à côté.
 *
 * CE QU'IL NE PARTAGE PAS, c'est la NOMENCLATURE. Voir
 * `naturesDuReferentiel()` : au même numéro 192, les deux plans logent deux
 * choses différentes.
 *
 * TROIS REFUS, chacun contre un défaut qui laisse le bilan parfaitement
 * équilibré :
 *
 *  1. UNE PROVISION INTERDITE NE SE COMPTABILISE PAS, et le registre ne se
 *     contente pas de ne pas la proposer · il la propose pour la REFUSER avec
 *     son article. Le § 4.11 en nomme deux : les pertes opérationnelles
 *     futures (« il n'existe pas d'obligation actuelle résultant d'un
 *     événement passé ») et les grosses réparations (« les provisions pour
 *     grosses réparations sont interdites »). Les faire disparaître de la
 *     liste ne les empêcherait pas : elles seraient saisies sous « divers
 *     risques et charges », au 1988, et plus personne ne saurait ce qu'il y a
 *     dedans.
 *  2. UNE CONDITION QUI MANQUE NE FAIT PAS DISPARAÎTRE LA LIGNE · elle la
 *     bascule en PASSIF ÉVENTUEL. « Si les 4 conditions ne sont pas réunies,
 *     il faut expliquer en annexe la nature des passifs éventuels. » Le
 *     défaut que ce refus vise n'est pas une provision de trop, c'est une
 *     provision de moins : un risque examiné, écarté, et jamais mentionné
 *     nulle part. Le bilan est juste, l'annexe est muette, et c'est
 *     exactement ce que le texte interdit.
 *  3. LE REMBOURSEMENT ATTENDU NE SE COMPENSE JAMAIS. § 3.1.4 : il n'est
 *     comptabilisé « que s'il est certain que l'entité le recevra », et il est
 *     présenté « au bilan comme un actif DISTINCT, NON COMPENSÉ avec la
 *     provision comptabilisée au passif, car l'entité reste responsable de
 *     l'extinction de l'obligation en cas de défaillance du tiers ». Une
 *     provision nette du remboursement s'équilibre, boucle, et sous-estime à
 *     la fois le passif et l'actif du même montant.
 *
 * CE QUE LE MODULE NE FAIT PAS. Il ne passe AUCUNE écriture : le registre
 * documente et rapproche, la dotation reste au comptable. Il ne décide
 * d'aucune probabilité et n'évalue aucun montant · le § 3.1.1 demande « la
 * meilleure estimation de la dépense nécessaire au règlement de l'obligation
 * », jugement qu'aucun logiciel ne rend. Il n'ACTUALISE pas : § 3.1.2, le
 * taux doit refléter « l'appréciation actuelle par le marché et le risque
 * spécifique à ce passif externe », donnée qui n'est dans aucune table.
 */
@Injectable()
export class ProvisionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritures: EcritureService,
  ) {}

  /**
   * LA TYPOLOGIE, ET ELLE N'EST PAS LA MÊME DES DEUX CÔTÉS. C'est le piège
   * central de ce registre, et il est silencieux : les deux plans emploient
   * les MÊMES numéros pour des natures différentes.
   *
   *   192 · SYSCOHADA « Provisions pour garanties données aux clients »
   *         SYCEBNL   « Provisions pour charges sur donations et legs »
   *
   * Le SYCEBNL ne porte ni 193 (pertes sur marchés à achèvement futur), ni
   * 195 (impôts), ni 197 (restructurations) · sa fiche du COMPTE 19 énumère
   * 191, 192, 194, 196 et 198, et rien d'autre. Le SYSCOHADA, lui, ne connaît
   * pas les charges sur donations et legs, qui n'ont de sens que pour une
   * entité recevant des libéralités grevées d'obligations.
   *
   * Une nature choisie sans regarder le référentiel du dossier ferait porter
   * à une association, au 192, une provision de garantie client · le numéro
   * est valide, le compte existe, la balance boucle, et la Note annexe
   * l'intitule « charges sur donations et legs ». Rien ne bronche.
   *
   * Les natures qui n'ont pas de compte propre (contrat déficitaire,
   * déménagement, droits à réduction côté SYCEBNL) tombent sur le compte de
   * divers risques et charges que leur plan prévoit · le ch. 18 les traite en
   * cas particuliers sans leur donner de numéro dédié.
   */
  static naturesDuReferentiel(
    referentiel: Referentiel,
  ): { nature: NatureProvision; compte: string; intitule: string }[] {
    const communes: { nature: NatureProvision; compte: string; intitule: string }[] = [
      { nature: NatureProvision.LITIGE, compte: '191', intitule: 'Provisions pour litiges' },
      { nature: NatureProvision.PERTES_DE_CHANGE, compte: '194', intitule: 'Provisions pour pertes de change' },
      {
        nature: NatureProvision.PENSIONS_ET_OBLIGATIONS_SIMILAIRES,
        compte: '196',
        intitule: 'Provisions pour pensions et obligations similaires',
      },
      { nature: NatureProvision.AMENDES_ET_PENALITES, compte: '1981', intitule: 'Provisions pour amendes et pénalités' },
      {
        nature: NatureProvision.DEMANTELEMENT_ET_REMISE_EN_ETAT,
        compte: '1984',
        intitule: 'Provisions pour démantèlement et remise en état',
      },
      {
        nature: NatureProvision.DIVERS_RISQUES_ET_CHARGES,
        compte: '1988',
        intitule: 'Provisions pour divers risques et charges',
      },
      // Cas particuliers du ch. 18 (§ 4.3 contrat déficitaire, § 4.10
      // déménagement) : le texte les traite, aucun plan ne leur donne de
      // numéro. Ils tombent au 1988, et le registre garde la nature réelle ·
      // c'est elle qui fait la « brève description » du § 5.3.
      { nature: NatureProvision.CONTRAT_DEFICITAIRE, compte: '1988', intitule: 'Provisions pour divers risques et charges' },
      { nature: NatureProvision.DEMENAGEMENT, compte: '1988', intitule: 'Provisions pour divers risques et charges' },
    ];

    if (referentiel === Referentiel.SYCEBNL) {
      return [
        ...communes,
        {
          nature: NatureProvision.CHARGES_DONATIONS_LEGS,
          compte: '192',
          intitule: 'Provisions pour charges sur donations et legs',
        },
      ];
    }

    return [
      ...communes,
      { nature: NatureProvision.GARANTIE_CLIENTS, compte: '192', intitule: 'Provisions pour garanties données aux clients' },
      {
        nature: NatureProvision.PERTES_MARCHES_ACHEVEMENT_FUTUR,
        compte: '193',
        intitule: 'Provisions pour pertes sur marchés à achèvement futur',
      },
      { nature: NatureProvision.IMPOTS, compte: '195', intitule: 'Provisions pour impôts' },
      { nature: NatureProvision.RESTRUCTURATION, compte: '197', intitule: 'Provisions pour restructurations' },
      { nature: NatureProvision.PROPRE_ASSUREUR, compte: '1983', intitule: 'Provisions pour propre assureur' },
      {
        nature: NatureProvision.DROITS_A_REDUCTION,
        compte: '1985',
        intitule: 'Provisions pour droits à réduction ou avantage en nature',
      },
    ];
  }

  /**
   * LES DEUX NATURES QUE LE TEXTE INTERDIT NOMMÉMENT (ch. 18 § 4.11), avec
   * pour chacune ce qu'il faut faire à la place · un refus qui ne dit pas
   * l'issue se contourne par le compte « divers ».
   */
  static readonly INTERDICTIONS: Record<string, string> = {
    [NatureProvision.PERTES_OPERATIONNELLES_FUTURES]:
      "Ch. 18 § 4.11.1 : les pertes opérationnelles futures « ne répondent pas aux critères généraux de " +
      "comptabilisation. En particulier, il n'existe pas d'obligation actuelle résultant d'un événement passé. " +
      "Il n'est donc pas possible d'enregistrer une provision pour pertes opérationnelles futures. » " +
      "Si un ACTIF a perdu de la valeur, la voie est la DÉPRÉCIATION (comptes 29, 39, 49, 59), pas la provision.",
    [NatureProvision.GROSSES_REPARATIONS]:
      'Ch. 18 § 4.11.2 : « Les provisions pour grosses réparations sont INTERDITES ; cependant, elles peuvent ' +
      "être enregistrées comme COMPOSANT DISTINCT du coût d'acquisition ou comme une CHARGE. » La voie est " +
      "l'approche par composants du module Immobilisations (composant « révisions majeures »), ou la charge de " +
      "l'exercice où les travaux sont engagés.",
  };

  /**
   * LES QUATRE CONDITIONS. Le CPCC les compte quatre, l'AUDCIF trois · le
   * texte fusionne « obligation actuelle » et « résultant d'un événement
   * passé » dans une seule phrase (§ 2.1), là où le séminaire les sépare pour
   * les faire vérifier une par une. C'est le MÊME test : rien n'est ajouté au
   * texte, et quatre cases se cochent mieux que trois.
   */
  static conditionsManquantes(p: {
    obligationExiste: boolean;
    resulteEvenementPasse: boolean;
    sortieProbable: boolean;
    estimationFiable: boolean;
  }): string[] {
    const manques: string[] = [];
    if (!p.obligationExiste) manques.push("l'existence d'une obligation juridique ou implicite à la date de clôture");
    if (!p.resulteEvenementPasse) manques.push("le rattachement à un événement passé (le fait générateur)");
    if (!p.sortieProbable) manques.push('le caractère probable de la sortie de ressources (au-delà de 50 %)');
    if (!p.estimationFiable) manques.push("la possibilité d'une estimation fiable du montant");
    return manques;
  }

  /**
   * Le montant de clôture, dans l'ordre exact du § 5.3 : valeur d'ouverture,
   * plus les dotations, moins les montants UTILISÉS (le risque s'est
   * réalisé), moins les reprises NON UTILISÉES (la provision est devenue sans
   * objet), plus l'effet de l'actualisation.
   *
   * Les deux natures de sortie sont tenues séparément parce que le texte les
   * énumère séparément et qu'elles ne disent pas la même chose au lecteur :
   * une provision utilisée était justifiée, une provision reprise ne l'était
   * pas. Les additionner rendrait le même total et effacerait la seule
   * information que la ligne portait sur la qualité de l'estimation.
   */
  static montantCloture(p: {
    montantOuverture: unknown;
    dotationsExercice: unknown;
    montantsUtilises: unknown;
    reprisesNonUtilisees: unknown;
    effetActualisation: unknown;
  }): number {
    const n = (v: unknown) => Number(v ?? 0);
    return Number(
      (
        n(p.montantOuverture) +
        n(p.dotationsExercice) -
        n(p.montantsUtilises) -
        n(p.reprisesNonUtilisees) +
        n(p.effetActualisation)
      ).toFixed(2),
    );
  }

  private async referentielDu(tenantId: string): Promise<Referentiel> {
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId }, select: { referentiel: true } });
    if (!tenant) throw new NotFoundException('Dossier introuvable.');
    return tenant.referentiel;
  }

  /**
   * Contrôle commun à la création et à la modification. Il porte les trois
   * refus du module · les rassembler ici évite qu'un second chemin d'écriture
   * n'en oublie un.
   */
  private async controler(
    tenantId: string,
    dto: {
      nature: NatureProvision;
      statut?: StatutProvision;
      obligationExiste?: boolean;
      resulteEvenementPasse?: boolean;
      sortieProbable?: boolean;
      estimationFiable?: boolean;
      remboursementAttendu?: number | null;
      remboursementCertain?: boolean;
      motifNonComptabilisation?: string | null;
    },
    etat: {
      obligationExiste: boolean;
      resulteEvenementPasse: boolean;
      sortieProbable: boolean;
      estimationFiable: boolean;
    },
  ): Promise<void> {
    const statut = dto.statut ?? StatutProvision.EN_EXAMEN;

    // REFUS 1 · la nature interdite. Il passe AVANT tout le reste : une
    // provision pour grosses réparations dont les quatre conditions seraient
    // cochées resterait interdite, le texte ne l'admet sous aucune condition.
    const interdiction = ProvisionsService.INTERDICTIONS[dto.nature];
    if (interdiction && statut === StatutProvision.COMPTABILISEE) {
      throw new BadRequestException(`Cette provision ne peut pas être comptabilisée. ${interdiction}`);
    }

    // La nature doit exister dans le plan du dossier · c'est le garde-fou
    // contre le 192 qui ne veut pas dire la même chose des deux côtés.
    if (!interdiction) {
      const referentiel = await this.referentielDu(tenantId);
      const admises = ProvisionsService.naturesDuReferentiel(referentiel);
      if (!admises.some((n) => n.nature === dto.nature)) {
        throw new BadRequestException(
          `La nature ${dto.nature} n'existe pas dans le plan de comptes ${referentiel}. ` +
            'Les deux référentiels emploient les mêmes numéros pour des natures différentes · au 192, le ' +
            "SYSCOHADA loge les garanties données aux clients, le SYCEBNL les charges sur donations et legs. " +
            `Natures admises pour ce dossier : ${admises.map((n) => n.nature).join(', ')}.`,
        );
      }
    }

    // REFUS 2 · les quatre conditions, et ce qui arrive quand l'une manque.
    const manques = ProvisionsService.conditionsManquantes({
      obligationExiste: dto.obligationExiste ?? etat.obligationExiste,
      resulteEvenementPasse: dto.resulteEvenementPasse ?? etat.resulteEvenementPasse,
      sortieProbable: dto.sortieProbable ?? etat.sortieProbable,
      estimationFiable: dto.estimationFiable ?? etat.estimationFiable,
    });
    if (statut === StatutProvision.COMPTABILISEE && manques.length > 0) {
      throw new BadRequestException(
        `Une provision ne se comptabilise que si les quatre conditions sont réunies · AUDCIF Titre VIII ch. 18 ` +
          `§ 2.1 : « Si ces trois conditions ne sont pas réunies, aucune provision ne peut être constituée. » ` +
          `Il manque ici : ${manques.join(' ; ')}. Le risque ne disparaît pas pour autant · portez la ligne en ` +
          'PASSIF_EVENTUEL, qui la fait figurer aux Notes annexes sans rien inscrire au bilan, ou en ECARTEE si ' +
          'la probabilité de sortie de ressources est TRÈS FAIBLE (§ 2.1.2, seul cas où aucune information ' +
          "n'est nécessaire).",
      );
    }
    if (statut !== StatutProvision.COMPTABILISEE && statut !== StatutProvision.EN_EXAMEN) {
      const motif = dto.motifNonComptabilisation;
      if (motif === undefined || motif === null || motif.trim().length === 0) {
        throw new BadRequestException(
          "Un risque écarté sans motif écrit est un risque effacé, pas arbitré. Le § 5.3 exige « une brève " +
            "description de la nature de l'obligation » et « une indication des incertitudes » : indiquez " +
            'pourquoi la ligne ne figure pas au bilan.',
        );
      }
    }

    // REFUS 3 · le remboursement attendu.
    if (dto.remboursementAttendu !== undefined && dto.remboursementAttendu !== null) {
      if (Number(dto.remboursementAttendu) < 0) {
        throw new BadRequestException(
          'Un remboursement attendu ne se saisit jamais en négatif · § 3.1.4, il se présente « au bilan comme ' +
            'un ACTIF DISTINCT, NON COMPENSÉ avec la provision comptabilisée au passif, car l\'entité reste ' +
            "responsable de l'extinction de l'obligation en cas de défaillance du tiers ». Le porter en " +
            'diminution de la provision sous-estimerait du même montant le passif ET l\'actif.',
        );
      }
      if (!(dto.remboursementCertain ?? false)) {
        throw new BadRequestException(
          "Le remboursement attendu « ne doit être comptabilisé que s'il est CERTAIN que l'entité le recevra » " +
            '(§ 3.1.4). Tant que la certitude n\'est pas acquise, ne portez pas de montant · un remboursement ' +
            'probable est un ACTIF ÉVENTUEL, qui « ne peut pas être comptabilisé » (§ 1.1.4) et se mentionne ' +
            'aux Notes annexes.',
        );
      }
    }
  }

  async creer(tenantId: string, exerciceId: string, dto: CreerProvisionDto, utilisateur: string) {
    await this.controler(tenantId, dto, {
      obligationExiste: false,
      resulteEvenementPasse: false,
      sortieProbable: false,
      estimationFiable: false,
    });

    return this.prisma.provisionRisqueCharge.create({
      data: {
        tenantId,
        exerciceId,
        objet: dto.objet,
        nature: dto.nature,
        compteId: dto.compteId ?? null,
        statut: dto.statut ?? StatutProvision.EN_EXAMEN,
        obligationExiste: dto.obligationExiste ?? false,
        resulteEvenementPasse: dto.resulteEvenementPasse ?? false,
        sortieProbable: dto.sortieProbable ?? false,
        estimationFiable: dto.estimationFiable ?? false,
        justificationObligation: dto.justificationObligation,
        echeanceAttendue: dto.echeanceAttendue ? new Date(dto.echeanceAttendue) : null,
        incertitudes: dto.incertitudes ?? null,
        montantOuverture: dto.montantOuverture ?? 0,
        dotationsExercice: dto.dotationsExercice ?? 0,
        montantsUtilises: dto.montantsUtilises ?? 0,
        reprisesNonUtilisees: dto.reprisesNonUtilisees ?? 0,
        effetActualisation: dto.effetActualisation ?? 0,
        remboursementAttendu: dto.remboursementAttendu ?? null,
        remboursementCertain: dto.remboursementCertain ?? false,
        remboursementTiers: dto.remboursementTiers ?? null,
        motifNonComptabilisation: dto.motifNonComptabilisation ?? null,
        createdBy: utilisateur,
      },
    });
  }

  async modifier(tenantId: string, id: string, dto: ModifierProvisionDto) {
    const existante = await this.prisma.provisionRisqueCharge.findFirst({ where: { id, tenantId } });
    if (!existante) throw new NotFoundException('Provision introuvable.');

    await this.controler(
      tenantId,
      { ...dto, nature: dto.nature ?? existante.nature, statut: dto.statut ?? existante.statut },
      existante,
    );

    return this.prisma.provisionRisqueCharge.update({
      where: { id },
      data: {
        ...(dto.objet !== undefined ? { objet: dto.objet } : {}),
        ...(dto.nature !== undefined ? { nature: dto.nature } : {}),
        ...(dto.compteId !== undefined ? { compteId: dto.compteId } : {}),
        ...(dto.statut !== undefined ? { statut: dto.statut } : {}),
        ...(dto.obligationExiste !== undefined ? { obligationExiste: dto.obligationExiste } : {}),
        ...(dto.resulteEvenementPasse !== undefined ? { resulteEvenementPasse: dto.resulteEvenementPasse } : {}),
        ...(dto.sortieProbable !== undefined ? { sortieProbable: dto.sortieProbable } : {}),
        ...(dto.estimationFiable !== undefined ? { estimationFiable: dto.estimationFiable } : {}),
        ...(dto.justificationObligation !== undefined
          ? { justificationObligation: dto.justificationObligation }
          : {}),
        ...(dto.echeanceAttendue !== undefined
          ? { echeanceAttendue: dto.echeanceAttendue ? new Date(dto.echeanceAttendue) : null }
          : {}),
        ...(dto.incertitudes !== undefined ? { incertitudes: dto.incertitudes } : {}),
        ...(dto.montantOuverture !== undefined ? { montantOuverture: dto.montantOuverture } : {}),
        ...(dto.dotationsExercice !== undefined ? { dotationsExercice: dto.dotationsExercice } : {}),
        ...(dto.montantsUtilises !== undefined ? { montantsUtilises: dto.montantsUtilises } : {}),
        ...(dto.reprisesNonUtilisees !== undefined ? { reprisesNonUtilisees: dto.reprisesNonUtilisees } : {}),
        ...(dto.effetActualisation !== undefined ? { effetActualisation: dto.effetActualisation } : {}),
        ...(dto.remboursementAttendu !== undefined ? { remboursementAttendu: dto.remboursementAttendu } : {}),
        ...(dto.remboursementCertain !== undefined ? { remboursementCertain: dto.remboursementCertain } : {}),
        ...(dto.remboursementTiers !== undefined ? { remboursementTiers: dto.remboursementTiers } : {}),
        ...(dto.motifNonComptabilisation !== undefined
          ? { motifNonComptabilisation: dto.motifNonComptabilisation }
          : {}),
      },
    });
  }

  async statuer(tenantId: string, id: string, dto: StatuerProvisionDto) {
    return this.modifier(tenantId, id, {
      statut: dto.statut,
      motifNonComptabilisation: dto.motifNonComptabilisation,
    });
  }

  async supprimer(tenantId: string, id: string) {
    const existante = await this.prisma.provisionRisqueCharge.findFirst({ where: { id, tenantId } });
    if (!existante) throw new NotFoundException('Provision introuvable.');
    await this.prisma.provisionRisqueCharge.delete({ where: { id } });
    return { supprimee: true };
  }

  async lister(tenantId: string, exerciceId: string) {
    return this.prisma.provisionRisqueCharge.findMany({
      where: { tenantId, exerciceId },
      include: { compte: { select: { numero: true, intitule: true } } },
      orderBy: [{ nature: 'asc' }, { objet: 'asc' }],
    });
  }

  /**
   * LE TABLEAU DES MOUVEMENTS, exactement celui que le CPCC demande à
   * l'auditeur d'obtenir : « le tableau des mouvements des provisions par
   * rapport à l'exercice précédent (dotations, utilisations, reprises) ». Il
   * porte les six lignes du § 5.3 et, en regard, LE SOLDE COMPTABLE du compte
   * qui les reçoit.
   *
   * LE RAPPROCHEMENT EST L'INTÉRÊT DU TABLEAU. Un registre qui ne se compare
   * à rien est une feuille de calcul de plus : c'est l'écart entre le montant
   * de clôture des lignes d'un compte et le solde de ce compte qui dit qu'une
   * dotation a été passée sans être documentée, ou documentée sans être
   * passée. Aucun des deux ne déséquilibre quoi que ce soit.
   *
   * Le solde est pris en VALEUR ABSOLUE : les comptes 19, 499 et 599 sont
   * créditeurs, et selon la convention de signe de la balance un solde
   * créditeur peut être rendu négatif. Comparer un montant de provision
   * toujours positif à un solde signé ferait un écart du double du solde sur
   * chaque ligne, et le tableau crierait sur le dossier exemplaire.
   */
  async tableauDeVariation(tenantId: string, exerciceId: string) {
    const [lignes, balance] = await Promise.all([
      this.lister(tenantId, exerciceId),
      this.ecritures.balance(tenantId, exerciceId, true),
    ]);

    const soldeParNumero = new Map<string, number>();
    for (const l of balance.lignes) soldeParNumero.set(l.numero, Math.abs(Number(l.solde ?? 0)));

    const detail = lignes.map((l) => ({
      id: l.id,
      objet: l.objet,
      nature: l.nature,
      statut: l.statut,
      compte: l.compte ? { numero: l.compte.numero, intitule: l.compte.intitule } : null,
      montantOuverture: Number(l.montantOuverture),
      dotationsExercice: Number(l.dotationsExercice),
      montantsUtilises: Number(l.montantsUtilises),
      reprisesNonUtilisees: Number(l.reprisesNonUtilisees),
      effetActualisation: Number(l.effetActualisation),
      montantCloture: ProvisionsService.montantCloture(l),
      remboursementAttendu: l.remboursementAttendu === null ? null : Number(l.remboursementAttendu),
      echeanceAttendue: l.echeanceAttendue,
      conditionsManquantes: ProvisionsService.conditionsManquantes(l),
    }));

    // Seules les lignes COMPTABILISÉES se rapprochent d'un solde. Un passif
    // éventuel n'est dans aucun compte, par définition · l'y chercher
    // fabriquerait un écart égal à son montant, contre un texte qui interdit
    // précisément de l'inscrire.
    const parCompte = new Map<string, { numero: string; registre: number }>();
    for (const l of lignes) {
      if (l.statut !== StatutProvision.COMPTABILISEE || !l.compte) continue;
      const cle = l.compte.numero;
      const cumul = parCompte.get(cle) ?? { numero: cle, registre: 0 };
      cumul.registre = Number((cumul.registre + ProvisionsService.montantCloture(l)).toFixed(2));
      parCompte.set(cle, cumul);
    }

    const rapprochement = [...parCompte.values()].map((c) => {
      const solde = soldeParNumero.get(c.numero) ?? 0;
      return {
        numero: c.numero,
        montantRegistre: c.registre,
        soldeComptable: solde,
        ecart: Number((c.registre - solde).toFixed(2)),
      };
    });

    const somme = (cle: keyof (typeof detail)[number]) =>
      Number(detail.reduce((t, l) => t + Number(l[cle] ?? 0), 0).toFixed(2));

    return {
      detail,
      totaux: {
        montantOuverture: somme('montantOuverture'),
        dotationsExercice: somme('dotationsExercice'),
        montantsUtilises: somme('montantsUtilises'),
        reprisesNonUtilisees: somme('reprisesNonUtilisees'),
        effetActualisation: somme('effetActualisation'),
        montantCloture: somme('montantCloture'),
      },
      rapprochement,
      passifsEventuels: detail.filter((l) => l.statut === StatutProvision.PASSIF_EVENTUEL),
      natures: ProvisionsService.naturesDuReferentiel(await this.referentielDu(tenantId)),
    };
  }

  /**
   * REPORT À L'OUVERTURE · « la valeur comptable à l'ouverture » du § 5.3 ne
   * se saisit pas deux fois. Le montant de clôture d'une ligne devient
   * l'ouverture de la ligne du nouvel exercice, et les cinq colonnes de
   * mouvement repartent à zéro.
   *
   * DEUX LIGNES NE SE REPORTENT PAS. Une provision SOLDÉE (le risque s'est
   * réalisé, ou elle est devenue sans objet) n'a plus d'ouverture · la
   * reporter à zéro encombrerait le registre d'obligations éteintes. Et une
   * ligne dont le montant de clôture est nul non plus, pour la même raison.
   *
   * Un PASSIF ÉVENTUEL, lui, SE REPORTE, à zéro. C'est voulu : l'obligation
   * potentielle n'a pas disparu à la clôture, et le § 5.3 veut qu'elle
   * continue d'être mentionnée tant qu'elle existe. La perdre au passage d'un
   * exercice ferait exactement ce que le refus n° 2 empêche à la saisie.
   */
  async reporterALOuverture(
    tenantId: string,
    exerciceSourceId: string,
    exerciceCibleId: string,
    utilisateur: string,
  ) {
    const sources = await this.prisma.provisionRisqueCharge.findMany({
      where: { tenantId, exerciceId: exerciceSourceId },
    });

    const aReporter = sources.filter((l) => {
      if (l.statut === StatutProvision.SOLDEE) return false;
      if (l.statut === StatutProvision.PASSIF_EVENTUEL) return true;
      return ProvisionsService.montantCloture(l) !== 0;
    });

    const deja = await this.prisma.provisionRisqueCharge.findMany({
      where: { tenantId, exerciceId: exerciceCibleId },
      select: { objet: true, nature: true },
    });
    const dejaPresent = new Set(deja.map((l) => `${l.nature}::${l.objet}`));

    let reportees = 0;
    for (const l of aReporter) {
      if (dejaPresent.has(`${l.nature}::${l.objet}`)) continue;
      await this.prisma.provisionRisqueCharge.create({
        data: {
          tenantId,
          exerciceId: exerciceCibleId,
          objet: l.objet,
          nature: l.nature,
          compteId: l.compteId,
          statut: l.statut,
          obligationExiste: l.obligationExiste,
          resulteEvenementPasse: l.resulteEvenementPasse,
          sortieProbable: l.sortieProbable,
          estimationFiable: l.estimationFiable,
          justificationObligation: l.justificationObligation,
          echeanceAttendue: l.echeanceAttendue,
          incertitudes: l.incertitudes,
          montantOuverture: ProvisionsService.montantCloture(l),
          // Les cinq colonnes de mouvement repartent à zéro : ce sont les
          // mouvements DE L'EXERCICE, et le nouvel exercice n'en a aucun.
          dotationsExercice: 0,
          montantsUtilises: 0,
          reprisesNonUtilisees: 0,
          effetActualisation: 0,
          // Le remboursement attendu ne se reporte PAS : sa certitude
          // s'apprécie « à la date de clôture » (§ 3.1.4), et la reconduire
          // sans réexamen reviendrait à la présumer acquise pour toujours.
          remboursementAttendu: null,
          remboursementCertain: false,
          remboursementTiers: l.remboursementTiers,
          motifNonComptabilisation: l.motifNonComptabilisation,
          createdBy: utilisateur,
        },
      });
      reportees += 1;
    }

    return { reportees, examinees: sources.length, ignorees: sources.length - reportees };
  }
}
