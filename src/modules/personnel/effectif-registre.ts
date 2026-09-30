import { TypeContratTravail } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';

/**
 * L'EFFECTIF À UNE DATE, et la part de main-d'œuvre locale.
 *
 * LE MOT EST CELUI DE LA LOI · l'art. 37, 4° de la loi n° 004/2001 impose
 * « d'utiliser la main d'œuvre LOCALE à concurrence de 60% au minimum ». Le
 * registre la lit sur la nationalité congolaise des salariés, parce que c'est
 * la seule donnée qu'il porte · c'est une LECTURE d'OmegaX, que la loi ne
 * définit pas, et la proposition reste soumise au cabinet. Le nom de la
 * propriété (`partMainOeuvreNationale`) dit ce qu'elle compte ; les textes
 * servis disent ce que la loi demande.
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
 *
 * UNE SEULE LECTURE, DEUX APPELANTS (audit final F146) · la fenêtre Personnel
 * et l'accord-cadre, qui la PROPOSE pour l'engagement de l'art. 37, point 4.
 * Deux calculs écrits à part auraient rendu deux parts plausibles et
 * différentes pour le même registre.
 *
 * DES NOMBRES, DONC DES AGRÉGATS DE LA BASE (audit final F259, reste ; § 8
 * bis). La lecture rapatriait chaque contrat en vigueur avec son salarié pour
 * ne rendre que des comptes · la mémoire dépendait de l'effectif. La base
 * compte désormais les SALARIÉS qui ont au moins un contrat en vigueur,
 * regroupés par sexe et par nationalité telle qu'écrite (une ligne par
 * couple distinct, jamais une par contrat), et la nationalité se lit ensuite
 * avec la même tolérance d'écriture qu'avant. UN SALARIÉ, PAS UN CONTRAT ·
 * deux contrats simultanés pour la même personne ne font pas deux personnes
 * à l'effectif, et c'est la base qui le garantit (`some`).
 *
 * PERMANENT · un salarié qui tient au moins un contrat à durée indéterminée
 * en vigueur. La lecture précédente prenait le type du premier contrat que la
 * base rendait, sans ordre · le même registre pouvait compter une personne
 * titulaire d'un CDD et d'un CDI simultanés tantôt permanente, tantôt non.
 * C'est une convention d'OmegaX, et elle est écrite ici.
 */
export async function effectifDuRegistre(prisma: PrismaService, tenantId: string, ala: Date) {
  const enVigueur = {
    tenantId,
    dateEntreeEnVigueur: { lte: ala },
    OR: [{ dateFin: null }, { dateFin: { gte: ala } }],
  };
  const [groupes, permanents] = await Promise.all([
    prisma.salarie.groupBy({
      by: ['sexe', 'nationalite'],
      where: { tenantId, contrats: { some: enVigueur } },
      _count: { _all: true },
    }),
    prisma.salarie.count({
      where: { tenantId, contrats: { some: { ...enVigueur, type: TypeContratTravail.DUREE_INDETERMINEE } } },
    }),
  ]);

  const nationalite = (n: string | null) => (n ?? '').trim().toLowerCase();
  const estCongolaise = (n: string | null) =>
    ['congolaise', 'congolais', 'rdc', 'rd congo'].includes(nationalite(n));
  const somme = (garder: (g: (typeof groupes)[number]) => boolean) =>
    groupes.filter(garder).reduce((total, g) => total + g._count._all, 0);

  const effectif = somme(() => true);
  const nationaux = somme((g) => estCongolaise(g.nationalite));
  const sansNationalite = somme((g) => nationalite(g.nationalite) === '');

  return {
    ala,
    effectif,
    hommes: somme((g) => g.sexe === 'MASCULIN'),
    femmes: somme((g) => g.sexe === 'FEMININ'),
    permanents,
    nationaux,
    sansNationalite,
    /**
     * NULLE TANT QU'UNE SEULE NATIONALITÉ MANQUE. Une part calculée sur un
     * registre incomplet est un chiffre faux d'apparence exacte, et c'est
     * précisément l'engagement de l'art. 37, point 4 de la loi n° 004/2001
     * (60 % de main-d'œuvre locale) qu'elle servirait.
     */
    partMainOeuvreNationale:
      effectif === 0 || sansNationalite > 0 ? null : (nationaux / effectif) * 100,
    source: `Registre du personnel au ${ala.toISOString().slice(0, 10)}`,
    reserve:
      sansNationalite > 0
        ? `${sansNationalite} salarié(s) de l'effectif n'ont pas de nationalité au registre. La part de main-d'œuvre locale (art. 37, 4° de la loi n° 004/2001) n'est pas calculée : un pourcentage tiré d'un registre incomplet serait faux sous une apparence de calcul, et c'est l'engagement des 60 % de cet article qu'il servirait.`
        : null,
  };
}
