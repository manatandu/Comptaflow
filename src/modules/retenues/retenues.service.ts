import { Injectable } from '@nestjs/common';
import { Referentiel, StatutEcriture } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import {
  AVERTISSEMENT_REDEVABLE,
  AVERTISSEMENT_REGISTRE,
  DERNIERE_VERIFICATION,
  NATURES_RETENUES,
  NatureRetenue,
  ObligationDeclarative,
  avertissementRegimeImpot,
  obligationsDeclarativesApplicables,
  reservePourReferentiel,
} from './correspondance-retenues';

/**
 * REGISTRE DES RETENUES À LA SOURCE et ÉCHÉANCIER FISCAL ET SOCIAL.
 *
 * Le registre se lit comme un compte de tiers : ce qui a été RETENU (crédité
 * sur le compte de retenue) contre ce qui a été REVERSÉ (débité), le solde
 * étant ce qui reste dû à l'État ou à l'organisme social.
 *
 * Il n'y a aucun calcul d'impôt ici · voir la note de tête de
 * `correspondance-retenues.ts`.
 */
@Injectable()
export class RetenuesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Échéance de reversement de la retenue d'un mois donné.
   *
   * Le délai court à partir de la FIN DU MOIS de la retenue, en jours : dix
   * jours pour la retenue locative, quinze pour les autres. Écrire « le 15 du
   * mois suivant » revenait au même pour quinze, mais datait la retenue
   * locative au 15 alors que le texte dit dix jours · le registre affichait
   * une échéance et en calculait une autre.
   */
  private echeanceDuMois(nature: NatureRetenue, annee: number, moisZeroBase: number): Date {
    // Le délai part de la fin du mois de la retenue : « dans les dix jours du
    // mois suivant » tombe donc le 10 du mois suivant, « le 15 du mois
    // suivant » le 15. Le mois suivant s'écrit `moisZeroBase + 1`, que
    // `Date` reporte de lui-même sur janvier quand on part de décembre.
    return new Date(annee, moisZeroBase + 1, nature.joursApresPeriode);
  }

  /**
   * Prochaine date d'exigibilité pour une nature donnée, à partir d'une date
   * de référence · celle du mois courant si elle n'est pas passée, sinon
   * celle du mois suivant.
   */
  private prochaineEcheance(nature: NatureRetenue, reference: Date): Date {
    const echeance = new Date(reference.getFullYear(), reference.getMonth(), nature.joursApresPeriode);
    if (echeance < reference) echeance.setMonth(echeance.getMonth() + 1);
    return echeance;
  }

  /**
   * Prochaine échéance d'une obligation purement déclarative.
   *
   * Trimestrielle : `joursApresPeriode` jours après la fin du trimestre civil.
   * Annuelle : jour et mois fixes, sur l'année qui suit l'exercice · si la
   * date de cette année est passée, c'est celle de l'année prochaine.
   */
  private prochaineEcheanceDeclarative(obligation: ObligationDeclarative, reference: Date): Date {
    if (obligation.periodicite === 'MENSUELLE') {
      // N jours après la fin du mois, et le mois suivant si c'est déjà passé.
      //
      // La boucle part du mois PRÉCÉDENT (m = -1) : le 1er septembre, la
      // déclaration encore due est celle des rémunérations d'août, exigible le
      // 10 septembre · partir du mois courant l'aurait sautée pour annoncer le
      // 10 octobre, c'est-à-dire une échéance de plus qu'il n'en reste, et une
      // déclaration en cours présentée comme déjà réglée.
      const jours = obligation.joursApresPeriode ?? 10;
      for (let m = -1; m < 2; m++) {
        const finDeMois = new Date(reference.getFullYear(), reference.getMonth() + m + 1, 0);
        const echeance = new Date(finDeMois);
        echeance.setDate(echeance.getDate() + jours);
        if (echeance >= reference) return echeance;
      }
    }
    if (obligation.periodicite === 'TRIMESTRIELLE') {
      const jours = obligation.joursApresPeriode ?? 10;
      // Fin du trimestre PRÉCÉDENT, puis les suivants tant que l'échéance est
      // passée · même raison qu'au mensuel : le 5 juillet, le relevé du
      // deuxième trimestre est encore dû (le 10 juillet). Les trimestres
      // civils finissent en mars, juin, sept., déc.
      for (let t = Math.floor(reference.getMonth() / 3) - 1; t < 8; t++) {
        // Le mois est laissé DÉBORDER volontairement (0 ou > 11) : Date le
        // reporte sur l'année voisine · un calcul en modulo 4 se trompait
        // d'un an sur le trimestre précédent quand il est celui de l'année
        // écoulée (JS rend -1 pour -1 % 4).
        const finTrimestre = new Date(reference.getFullYear(), (t + 1) * 3, 0);
        const echeance = new Date(finTrimestre);
        echeance.setDate(echeance.getDate() + jours);
        if (echeance >= reference) return echeance;
      }
    }
    const mois = (obligation.moisEcheance ?? 3) - 1;
    const jour = obligation.jourEcheance ?? 31;
    const echeance = new Date(reference.getFullYear(), mois, jour);
    if (echeance < reference) echeance.setFullYear(echeance.getFullYear() + 1);
    return echeance;
  }

  /**
   * REGISTRE · une ligne par nature de retenue, avec le détail par compte et
   * par mois.
   *
   * Le découpage MENSUEL n'est pas cosmétique : chaque mois a sa propre
   * échéance de reversement, et un solde annuel ne dit pas lequel est en
   * retard. C'est le mois qui est l'unité de l'obligation.
   */
  async registre(tenantId: string, params: { exerciceId: string; dateReference?: string }) {
    const reference = params.dateReference ? new Date(params.dateReference) : new Date();
    reference.setHours(0, 0, 0, 0);

    // LE RÉGIME D'IMPÔT DU DOSSIER COMMANDE CE QUI EST ÉCRIT EN TÊTE DE CET
    // ÉTAT. Une société est redevable de l'IS, une ASBL en est exemptée : le
    // registre annonçait l'exemption à tout le monde.
    const { referentiel } = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { referentiel: true },
    });

    const lignes = await this.prisma.ligneEcriture.findMany({
      where: {
        ecriture: { tenantId, exerciceId: params.exerciceId, statut: StatutEcriture.VALIDEE },
        compte: { OR: [{ numero: { startsWith: '44' } }, { numero: { startsWith: '43' } }] },
      },
      include: {
        compte: { select: { numero: true, intitule: true } },
        ecriture: { select: { date: true, libelle: true, reference: true } },
      },
      orderBy: { ecriture: { date: 'asc' } },
    });

    const correspond = (numero: string, nature: NatureRetenue) =>
      nature.comptes.some((p) => numero.startsWith(p)) &&
      !(nature.exclusions ?? []).some((e) => numero.startsWith(e));

    const natures = NATURES_RETENUES.map((nature) => {
      const siennes = lignes.filter((l) => correspond(l.compte.numero, nature));

      // Par mois d'écriture · l'unité de l'obligation de reversement.
      const parMois = new Map<string, { retenu: number; reverse: number }>();
      const parCompte = new Map<string, { numero: string; intitule: string; retenu: number; reverse: number }>();
      for (const l of siennes) {
        const mois = `${l.ecriture.date.getFullYear()}-${String(l.ecriture.date.getMonth() + 1).padStart(2, '0')}`;
        // Crédit = retenue constituée (dette envers l'État) ;
        // débit = reversement effectué.
        const retenu = Number(l.credit);
        const reverse = Number(l.debit);
        const m = parMois.get(mois) ?? { retenu: 0, reverse: 0 };
        m.retenu += retenu;
        m.reverse += reverse;
        parMois.set(mois, m);

        const c = parCompte.get(l.compte.numero) ?? {
          numero: l.compte.numero,
          intitule: l.compte.intitule,
          retenu: 0,
          reverse: 0,
        };
        c.retenu += retenu;
        c.reverse += reverse;
        parCompte.set(l.compte.numero, c);
      }

      const mois = [...parMois.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([cle, m]) => {
          const [annee, numeroMois] = cle.split('-').map(Number);
          // Reversement dû `joursApresPeriode` jours après la fin du mois de
          // la retenue · voir echeanceDuMois.
          const echeance = this.echeanceDuMois(nature, annee, numeroMois - 1);
          const solde = Math.round((m.retenu - m.reverse) * 100) / 100;
          return {
            mois: cle,
            retenu: Math.round(m.retenu * 100) / 100,
            reverse: Math.round(m.reverse * 100) / 100,
            solde,
            echeance,
            // Un solde encore dû après l'échéance est un retard de
            // reversement · c'est ce que l'état doit crier.
            enRetard: solde > 0.005 && echeance < reference,
          };
        });

      const retenu = mois.reduce((s, m) => s + m.retenu, 0);
      const reverse = mois.reduce((s, m) => s + m.reverse, 0);
      return {
        cle: nature.cle,
        libelle: nature.libelle,
        beneficiaire: nature.beneficiaire,
        echeance: nature.echeance,
        baseLegale: nature.baseLegale,
        // Le code de l'imprimé DGI · celui qu'on demande au guichet.
        imprime: nature.imprime ?? null,
        reserve: reservePourReferentiel(nature, referentiel) ?? null,
        comptes: [...parCompte.values()].sort((a, b) => a.numero.localeCompare(b.numero)),
        mois,
        retenu: Math.round(retenu * 100) / 100,
        reverse: Math.round(reverse * 100) / 100,
        solde: Math.round((retenu - reverse) * 100) / 100,
        moisEnRetard: mois.filter((m) => m.enRetard).length,
        prochaineEcheance: this.prochaineEcheance(nature, reference),
      };
    });

    // Comptes 43/44 qu'aucune nature ne réclame · jamais absorbés en silence,
    // même discipline que les états financiers.
    const numerosRattaches = new Set(
      lignes.filter((l) => NATURES_RETENUES.some((n) => correspond(l.compte.numero, n))).map((l) => l.compte.numero),
    );
    const comptesNonRattaches = [
      ...new Map(
        lignes
          .filter((l) => !numerosRattaches.has(l.compte.numero))
          .map((l) => [l.compte.numero, { numero: l.compte.numero, intitule: l.compte.intitule }]),
      ).values(),
    ].sort((a, b) => a.numero.localeCompare(b.numero));

    return {
      dateReference: reference,
      derniereVerificationEcheances: DERNIERE_VERIFICATION,
      natures,
      totalRetenu: Math.round(natures.reduce((s, n) => s + n.retenu, 0) * 100) / 100,
      totalReverse: Math.round(natures.reduce((s, n) => s + n.reverse, 0) * 100) / 100,
      totalDu: Math.round(natures.reduce((s, n) => s + n.solde, 0) * 100) / 100,
      comptesNonRattaches,
      referentiel,
      avertissements: [AVERTISSEMENT_REGISTRE, avertissementRegimeImpot(referentiel), AVERTISSEMENT_REDEVABLE],
    };
  }

  /**
   * ÉCHÉANCIER FISCAL ET SOCIAL · les prochaines dates de reversement, avec
   * ce qui reste dû à chacune.
   *
   * Trié par date, parce que c'est ainsi qu'on s'en sert. Une nature sans
   * solde y figure quand même : l'exonération dispense du paiement, pas de
   * la déclaration, et une association qui ne doit rien oublie précisément
   * de déclarer pour cette raison.
   */
  async echeancierFiscal(tenantId: string, params: { exerciceId: string; dateReference?: string }) {
    const registre = await this.registre(tenantId, params);

    const reversements = registre.natures.map((n) => ({
      cle: n.cle,
      libelle: n.libelle,
      genre: 'REVERSEMENT' as const,
      periodicite: 'MENSUELLE' as const,
      beneficiaire: n.beneficiaire,
      date: n.prochaineEcheance,
      echeance: n.echeance,
      baseLegale: n.baseLegale,
      imprime: n.imprime,
      reserve: n.reserve,
      montantDu: n.solde,
      moisEnRetard: n.moisEnRetard,
      contenu: null as string | null,
      sanction: null as string | null,
      sourceDonnees: null as string | null,
    }));

    /*
      Les obligations PUREMENT DÉCLARATIVES rejoignent le même échéancier.
      Elles ne portent aucun montant · c'est justement pourquoi elles
      échappaient au logiciel, qui ne connaissait que ce qu'un compte crédite.
      Une échéance sans montant n'en est pas moins une échéance : l'amende de
      l'article 94 tombe pour un relevé non déposé, pas pour un solde impayé.
    */
    // Toutes ne visent pas tout le monde : l'article 47, alinéa 1er énumère
    // des entités publiques et non lucratives, et l'échéancier servait son
    // amende de 500 000 FC à une société commerciale privée.
    const declarations = obligationsDeclarativesApplicables(registre.referentiel).map((o: ObligationDeclarative) => ({
      cle: o.cle,
      libelle: o.libelle,
      genre: 'DECLARATION' as const,
      periodicite: o.periodicite,
      beneficiaire: 'ETAT' as const,
      date: this.prochaineEcheanceDeclarative(o, registre.dateReference),
      echeance: o.echeance,
      baseLegale: o.baseLegale,
      reserve: null as string | null,
      montantDu: 0,
      moisEnRetard: 0,
      imprime: null as string | null,
      contenu: o.contenu,
      sanction: o.sanction ?? null,
      sourceDonnees: o.sourceDonnees ?? null,
    }));

    const echeances = [...reversements, ...declarations].sort((a, b) => a.date.getTime() - b.date.getTime());

    return {
      dateReference: registre.dateReference,
      derniereVerificationEcheances: registre.derniereVerificationEcheances,
      echeances,
      totalDu: registre.totalDu,
      avertissements: registre.avertissements,
    };
  }
}
