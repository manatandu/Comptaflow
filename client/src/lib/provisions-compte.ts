/**
 * LE COMPTE D'UNE PROVISION SUIT SA NATURE, SANS ÊTRE PERDU EN ROUTE.
 *
 * La racine de chaque nature vient du SERVEUR (`ProvisionsService.
 * naturesDuReferentiel`, servie dans le tableau de variation) et le serveur
 * refuse un compte qui ne commence pas par elle (`verifierCompte`, audit final
 * F138). Aucun numéro n'est écrit ici · au 192, les deux plans ne logent pas
 * la même chose, et une table recopiée côté client finirait par diverger.
 *
 * Jusqu'ici, changer la nature VIDAIT le compte d'office, même quand le
 * compte choisi convenait encore (contrat déficitaire et déménagement tombent
 * au même 1988 que les divers risques), et en silence. Le compte retiré
 * disparaissait sans un mot, et un choix unique n'était jamais présélectionné
 * (§ 9 ter du règlement intérieur). Les trois règles :
 *
 *  1. un compte qui commence encore par la racine de la nouvelle nature est
 *     GARDÉ ;
 *  2. sinon il est retiré, ET C'EST DIT, avec la raison ;
 *  3. quand un seul compte du plan convient, il est présélectionné, et c'est
 *     dit aussi · « Aucun (non comptabilisée) » reste choisissable, un compte
 *     posé sur une ligne qui n'est pas COMPTABILISÉE n'entre dans aucun
 *     rapprochement.
 */

export type NatureServie = { nature: string; compte: string; intitule: string };
export type CompteChoisissable = { id: string; numero: string; intitule: string };

/** Les comptes du plan que la nature admet, plus le compte courant s'il n'y est pas (pour qu'il reste lisible). */
export function comptesDeLaNature(
  comptes: CompteChoisissable[],
  natures: NatureServie[],
  nature: string,
  compteIdCourant: string,
): CompteChoisissable[] {
  const servie = natures.find((n) => n.nature === nature);
  return comptes.filter((c) => (servie !== undefined && c.numero.startsWith(servie.compte)) || c.id === compteIdCourant);
}

/** Les seuls comptes que la nature admet, sans le compte courant · c'est sur eux que se juge l'unicité. */
function comptesAdmis(comptes: CompteChoisissable[], natures: NatureServie[], nature: string): CompteChoisissable[] {
  const servie = natures.find((n) => n.nature === nature);
  if (!servie) return [];
  return comptes.filter((c) => c.numero.startsWith(servie.compte));
}

/**
 * Le compte à garder ou à proposer quand la nature change. `avis` est null
 * quand rien n'a changé sous les yeux de l'utilisateur ; sinon il dit ce qui
 * a été fait et pourquoi.
 *
 * `comptes` à null veut dire que le plan n'a pas été lu · on ne touche alors à
 * rien, un compte retiré faute de lecture serait un compte perdu pour rien.
 */
export function compteApresChangementDeNature(
  comptes: CompteChoisissable[] | null,
  natures: NatureServie[],
  nouvelleNature: string,
  compteIdActuel: string,
): { compteId: string; avis: string | null } {
  if (comptes === null) return { compteId: compteIdActuel, avis: null };
  const servie = natures.find((n) => n.nature === nouvelleNature);
  const admis = comptesAdmis(comptes, natures, nouvelleNature);
  const actuel = compteIdActuel ? comptes.find((c) => c.id === compteIdActuel) : undefined;

  if (compteIdActuel && admis.some((c) => c.id === compteIdActuel)) {
    return { compteId: compteIdActuel, avis: null };
  }

  const retire = compteIdActuel
    ? `Le compte ${actuel ? actuel.numero : 'choisi'} a été retiré · ${
        servie ? `il n'est pas un ${servie.compte} (${servie.intitule}), que cette nature appelle.` : 'cette nature ne se comptabilise pas, elle n\'a aucun compte.'
      }`
    : null;

  if (admis.length === 1) {
    const seul = admis[0];
    const pose = `Seul compte ${servie?.compte ?? ''} du plan, ${seul.numero} est présélectionné.`;
    return { compteId: seul.id, avis: retire ? `${retire} ${pose}` : pose };
  }
  return { compteId: '', avis: retire };
}

/**
 * Ligne A16 · les comptes d'une provision À MOINS D'UN AN · 499 ou 599, jamais
 * le 19 de la nature (fiches des comptes 19 et 49). Les racines viennent du
 * serveur (`comptesCourtTerme`), le compte courant reste lisible.
 */
export function comptesDuCourtTerme(
  comptes: CompteChoisissable[],
  racines: { compte: string }[],
  compteIdCourant: string,
): CompteChoisissable[] {
  return comptes.filter((c) => racines.some((r) => c.numero.startsWith(r.compte)) || c.id === compteIdCourant);
}

/**
 * Ligne A16 · le compte quand l'HORIZON change · gardé s'il convient encore,
 * sinon retiré en le disant, et le seul admis présélectionné (mêmes règles
 * qu'au changement de nature).
 */
export function compteApresChangementDHorizon(
  comptes: CompteChoisissable[] | null,
  natures: NatureServie[],
  racinesCourtTerme: { compte: string }[],
  nature: string,
  courtTerme: boolean,
  compteIdActuel: string,
): { compteId: string; avis: string | null } {
  if (comptes === null) return { compteId: compteIdActuel, avis: null };
  const servie = natures.find((n) => n.nature === nature);
  const admis = courtTerme
    ? comptes.filter((c) => racinesCourtTerme.some((r) => c.numero.startsWith(r.compte)))
    : servie
      ? comptes.filter((c) => c.numero.startsWith(servie.compte))
      : [];
  if (compteIdActuel && admis.some((c) => c.id === compteIdActuel)) return { compteId: compteIdActuel, avis: null };
  const actuel = compteIdActuel ? comptes.find((c) => c.id === compteIdActuel) : undefined;
  const retire = compteIdActuel
    ? `Le compte ${actuel ? actuel.numero : 'choisi'} a été retiré · une provision ${
        courtTerme ? "à moins d'un an se porte au 499 ou au 599" : "à plus d'un an se porte au 19"
      }.`
    : null;
  if (admis.length === 1) {
    const pose = `Seul compte admis du plan, ${admis[0].numero} est présélectionné.`;
    return { compteId: admis[0].id, avis: retire ? `${retire} ${pose}` : pose };
  }
  return { compteId: '', avis: retire };
}

/** Le compte à présélectionner à l'ouverture d'une création · le seul admis, ou aucun. */
export function compteInitial(comptes: CompteChoisissable[] | null, natures: NatureServie[], nature: string): string {
  if (comptes === null) return '';
  const admis = comptesAdmis(comptes, natures, nature);
  return admis.length === 1 ? admis[0].id : '';
}

/**
 * Pourquoi la liste des comptes est vide, et ce qu'il faut faire d'abord.
 * Null quand elle ne l'est pas. Un plan NON LU ne se dit jamais « aucun
 * compte » · ce serait répondre à la question sans l'avoir posée.
 */
export function motifListeComptesVide(
  comptes: CompteChoisissable[] | null,
  erreurComptes: string | null,
  natures: NatureServie[],
  nature: string,
): string | null {
  if (comptes === null) {
    return erreurComptes
      ? `Le plan de comptes n'a pas pu être lu (${erreurComptes}) · rouvrez le formulaire pour réessayer.`
      : 'Lecture du plan de comptes en cours.';
  }
  const servie = natures.find((n) => n.nature === nature);
  if (!servie) {
    return 'Cette nature ne se comptabilise pas · elle n\'a aucun compte, la ligne reste au registre sans écriture.';
  }
  if (comptesAdmis(comptes, natures, nature).length > 0) return null;
  return (
    `Aucun compte ${servie.compte} (${servie.intitule}) n'est ouvert ou retenu dans le plan du dossier · ` +
    `ouvrez-le ou retenez-le dans le plan de comptes, puis rouvrez le formulaire.`
  );
}
