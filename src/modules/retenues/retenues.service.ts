import { Injectable } from '@nestjs/common';
import { StatutEcriture } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import {
  AVERTISSEMENT_EXONERATION,
  AVERTISSEMENT_REGISTRE,
  DERNIERE_VERIFICATION,
  NATURES_RETENUES,
  NatureRetenue,
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
   * Prochaine date d'exigibilité pour une nature donnée, à partir d'une date
   * de référence.
   *
   * Règle : la retenue d'un mois se reverse le `jourEcheance` du mois
   * SUIVANT. Depuis une date de référence, la prochaine échéance est donc
   * celle du mois courant si elle n'est pas passée, sinon celle du mois
   * suivant.
   */
  private prochaineEcheance(nature: NatureRetenue, reference: Date): Date {
    const echeance = new Date(reference.getFullYear(), reference.getMonth(), nature.jourEcheance);
    if (echeance < reference) echeance.setMonth(echeance.getMonth() + 1);
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
          // Reversement dû le `jourEcheance` du mois SUIVANT celui de la
          // retenue.
          const echeance = new Date(annee, numeroMois, nature.jourEcheance);
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
        reserve: nature.reserve ?? null,
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
      avertissements: [AVERTISSEMENT_REGISTRE, AVERTISSEMENT_EXONERATION],
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
    const echeances = registre.natures
      .map((n) => ({
        cle: n.cle,
        libelle: n.libelle,
        beneficiaire: n.beneficiaire,
        date: n.prochaineEcheance,
        echeance: n.echeance,
        baseLegale: n.baseLegale,
        reserve: n.reserve,
        montantDu: n.solde,
        moisEnRetard: n.moisEnRetard,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    return {
      dateReference: registre.dateReference,
      derniereVerificationEcheances: registre.derniereVerificationEcheances,
      echeances,
      totalDu: registre.totalDu,
      avertissements: registre.avertissements,
    };
  }
}
