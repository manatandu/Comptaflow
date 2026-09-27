import { TypeContratTravail } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';

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
 *
 * UNE SEULE LECTURE, DEUX APPELANTS (audit final F146) · la fenêtre Personnel
 * et l'accord-cadre, qui la PROPOSE pour l'engagement de l'art. 37, point 4.
 * Deux calculs écrits à part auraient rendu deux parts plausibles et
 * différentes pour le même registre.
 */
export async function effectifDuRegistre(prisma: PrismaService, tenantId: string, ala: Date) {
  const contrats = await prisma.contratTravail.findMany({
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
