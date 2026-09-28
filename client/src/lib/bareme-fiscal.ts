import type { Referentiel } from './types';

/**
 * Barème fiscal d'amortissement · arrêté n° 013/CAB/MIN/FINANCES/2025 du
 * 19 février 2025, pris en exécution de la loi n° 23/053, art. 28, al. 1er.
 *
 * L'écran ne recopie AUCUNE ligne du barème · il le lit à
 * GET /immobilisations/bareme-fiscal, servi depuis la table engendrée du
 * serveur. Une seconde copie ici divergerait de la première au premier
 * correctif, sans qu'aucun total ne le dise.
 *
 * Ce module ne refuse RIEN. La durée comptable est l'estimation de la durée
 * d'utilité par l'entité (AUDCIF art. 45) ; le barème est une règle FISCALE.
 * L'écart se signale, avec son article, et la saisie passe.
 */

/** Une ligne du barème, telle que le serveur la sert. */
export interface NatureBaremeFiscal {
  cle: string;
  section: string;
  intituleSection: string;
  numero: number;
  designation: string;
  dureeAns: number;
  taux: number;
}

/**
 * Entrée en vigueur de l'arrêté · art. 6, « le 1er janvier 2026 ». Un
 * exercice clos avant ne se voit pas opposer un barème qui n'existait pas
 * encore (deuxième piège du dépôt, § 10 bis).
 */
export const ENTREE_EN_VIGUEUR_BAREME = '2026-01-01';

/** Les lignes regroupées par section, dans l'ordre servi, pour un select. */
export function sectionsDuBareme(
  bareme: NatureBaremeFiscal[],
): { section: string; intitule: string; lignes: NatureBaremeFiscal[] }[] {
  const groupes: { section: string; intitule: string; lignes: NatureBaremeFiscal[] }[] = [];
  for (const n of bareme) {
    let g = groupes.find((x) => x.section === n.section);
    if (!g) {
      g = { section: n.section, intitule: n.intituleSection, lignes: [] };
      groupes.push(g);
    }
    g.lignes.push(n);
  }
  return groupes;
}

/**
 * L'avertissement d'écart entre la durée saisie et celle du barème, ou null.
 *
 * Trois silences, chacun voulu · aucune nature choisie (rien à comparer),
 * durée égale ou illisible (rien à dire), exercice clos avant l'entrée en
 * vigueur de l'arrêté (art. 6). La date de fin d'exercice inconnue ne tait
 * rien · le barème est en vigueur pour tout exercice ouvert aujourd'hui.
 */
export function avertissementEcartBareme(
  dureeSaisie: number | null,
  nature: NatureBaremeFiscal | null | undefined,
  finExercice: string | null | undefined,
): string | null {
  if (!nature) return null;
  if (dureeSaisie == null || !Number.isFinite(dureeSaisie) || dureeSaisie <= 0) return null;
  if (dureeSaisie === nature.dureeAns) return null;
  if (finExercice && finExercice.slice(0, 10) < ENTREE_EN_VIGUEUR_BAREME) return null;

  const reference = `${nature.designation} · ${nature.dureeAns} ans, taux ${String(nature.taux).replace('.', ',')} % (arrêté n° 013/CAB/MIN/FINANCES/2025, art. 2)`;
  if (dureeSaisie < nature.dureeAns) {
    return (
      `Durée saisie plus courte que le barème fiscal (${reference}). ` +
      `Un taux supérieur n'est admis que si l'entreprise en justifie les circonstances lors du contrôle, sous peine de rejet (art. 4).`
    );
  }
  return (
    `Durée saisie plus longue que le barème fiscal (${reference}) · ` +
    `la dotation comptable reste en deçà du taux linéaire de l'arrêté.`
  );
}

/*
 * PLANCHER DE LA LOCATION-ACQUISITION · arrêté n° 013/CAB/MIN/FINANCES/2025,
 * art. 5 : « La durée d'amortissement des actifs exploités dans le cadre des
 * contrats de location-acquisition ne peut être inférieure à » sept ans pour
 * les constructions (hors la valeur du terrain), quatre ans pour les
 * équipements, trois ans pour le matériel de transport. Aucun écran ne le
 * portait : le formulaire proposait la durée de l'art. 2 sans rien dire, et
 * une durée plus courte faisait réintégrer l'excédent de dotation sans que
 * personne l'ait vu venir.
 *
 * LE BIEN SE RECONNAÎT À SON COMPTE, et le compte est lu PAR RÉFÉRENTIEL
 * (§ 7). Les sous-comptes « de location-acquisition » ont été relus dans les
 * deux semis (compte-seed.ts, compte-seed-syscohada.ts) : 23160000 et
 * 23260000 (bâtiments), 24160000 et 24260000 (matériel et outillage),
 * 24460000 (matériel et mobilier), 24560000 (matériel de transport), mêmes
 * numéros et même nature des deux côtés. Les deux tables restent écrites
 * séparément · une coïncidence de numérotation ne se présume pas, et le
 * spec relit les deux semis pour que la prémisse ne repose sur personne.
 * Le 22860000 (terrains) n'y est pas · l'art. 5 exclut « la valeur du
 * terrain », et un terrain ne s'amortit pas.
 *
 * LE 2446 EST UNE LECTURE D'OMEGAX, dite dans le message. L'art. 5 nomme
 * les « équipements » sans les définir ; le matériel et outillage l'est sans
 * discussion, le matériel et mobilier est rangé avec lui faute d'une autre
 * catégorie dans l'article.
 *
 * On SIGNALE, on ne refuse pas · la durée comptable est l'estimation de la
 * durée d'utilité (AUDCIF art. 45), et c'est l'effet fiscal que l'art. 5
 * règle. L'arrêté entre en vigueur le 1er janvier 2026 (art. 6).
 */
export interface PlancherLocationAcquisition {
  /** Racine du sous-compte de location-acquisition, lue dans le semis. */
  racine: string;
  /** Catégorie de l'art. 5. */
  nature: 'Constructions' | 'Équipements' | 'Matériel de transport';
  dureeMinimaleAns: number;
  /** Rattachement que l'article ne tranche pas lui-même, dit à l'écran. */
  lecture?: string;
}

const LECTURE_MOBILIER = 'le matériel et mobilier est rangé parmi les équipements, lecture d\'OmegaX';

export const PLANCHERS_LOCATION_ACQUISITION: Record<Referentiel, readonly PlancherLocationAcquisition[]> = {
  SYCEBNL: [
    { racine: '2316', nature: 'Constructions', dureeMinimaleAns: 7 },
    { racine: '2326', nature: 'Constructions', dureeMinimaleAns: 7 },
    { racine: '2416', nature: 'Équipements', dureeMinimaleAns: 4 },
    { racine: '2426', nature: 'Équipements', dureeMinimaleAns: 4 },
    { racine: '2446', nature: 'Équipements', dureeMinimaleAns: 4, lecture: LECTURE_MOBILIER },
    { racine: '2456', nature: 'Matériel de transport', dureeMinimaleAns: 3 },
  ],
  SYSCOHADA: [
    { racine: '2316', nature: 'Constructions', dureeMinimaleAns: 7 },
    { racine: '2326', nature: 'Constructions', dureeMinimaleAns: 7 },
    { racine: '2416', nature: 'Équipements', dureeMinimaleAns: 4 },
    { racine: '2426', nature: 'Équipements', dureeMinimaleAns: 4 },
    { racine: '2446', nature: 'Équipements', dureeMinimaleAns: 4, lecture: LECTURE_MOBILIER },
    { racine: '2456', nature: 'Matériel de transport', dureeMinimaleAns: 3 },
  ],
};

/** Le plancher de l'art. 5 qui vise ce compte, ou null. */
export function plancherLocationAcquisition(
  referentiel: Referentiel | null | undefined,
  numeroCompte: string | null | undefined,
): PlancherLocationAcquisition | null {
  if (!referentiel || !numeroCompte) return null;
  return PLANCHERS_LOCATION_ACQUISITION[referentiel].find((p) => numeroCompte.startsWith(p.racine)) ?? null;
}

/**
 * L'avertissement de l'art. 5, ou null. Se tait hors location-acquisition,
 * sur une durée égale ou supérieure au plancher ou illisible, et sur un
 * exercice clos avant le 1er janvier 2026 (art. 6).
 */
export function avertissementPlancherLocationAcquisition(
  dureeSaisie: number | null,
  referentiel: Referentiel | null | undefined,
  numeroCompte: string | null | undefined,
  finExercice: string | null | undefined,
): string | null {
  const p = plancherLocationAcquisition(referentiel, numeroCompte);
  if (!p) return null;
  if (dureeSaisie == null || !Number.isFinite(dureeSaisie) || dureeSaisie <= 0) return null;
  if (dureeSaisie >= p.dureeMinimaleAns) return null;
  if (finExercice && finExercice.slice(0, 10) < ENTREE_EN_VIGUEUR_BAREME) return null;
  const lecture = p.lecture ? ` (${p.lecture})` : '';
  return (
    `Bien en location-acquisition · ${p.nature}${lecture} : la durée d'amortissement ne peut être inférieure à ` +
    `${p.dureeMinimaleAns} ans (arrêté n° 013/CAB/MIN/FINANCES/2025, art. 5). ` +
    `Une durée plus courte fait réintégrer l'excédent de dotation.`
  );
}

/*
 * SEUIL DU PETIT MATÉRIEL · arrêté n° 014/CAB/MIN/FINANCES/2025 du 19 février
 * 2025. L'aide de l'écran disait « en dessous de 500 USD, le bien peut être
 * passé en charge », pour TOUT bien et sans date. Le texte est plus étroit
 * sur trois points, et chacun change la réponse :
 *  · art. 2 · il ne vise que le petit matériel et outillage et le matériel de
 *    bureau, de VALEUR UNITAIRE (le coût d'acquisition) inférieure à
 *    l'équivalent de 500 USD ;
 *  · art. 1er · c'est une règle FISCALE de déduction du bénéfice imposable,
 *    à l'IS et à l'IRPP (loi n° 23/053, art. 28 et 89), pas une règle de
 *    classement comptable ;
 *  · art. 3 · en vigueur au 1er janvier 2026.
 * Le classement COMPTABLE vient de la fiche du compte 24 (AUDCIF Titre VII ;
 * SYCEBNL Partie 2 ch. 3) · les biens de très faible valeur vont en classe 6,
 * SANS seuil chiffré. Les deux se disent séparément, pour que le seuil fiscal
 * ne passe pas pour une règle du plan de comptes.
 */
export const ENTREE_EN_VIGUEUR_SEUIL_PETIT_MATERIEL = '2026-01-01';

export const SOURCE_AIDE_SEUIL_IMMOBILISATION =
  'Arrêté n° 014/CAB/MIN/FINANCES/2025 du 19 février 2025, art. 1er à 3 ; loi n° 23/053, art. 28 et 89 · fiche du compte 24';

/** Le texte de l'aide « Seuil d'immobilisation », selon l'exercice affiché. */
export function texteAideSeuilImmobilisation(finExercice: string | null | undefined): string {
  const fiscal =
    "Fiscal : le petit matériel et outillage et le matériel de bureau de valeur unitaire (coût d'acquisition) inférieure à l'équivalent de 500 USD se déduisent dès l'acquisition, à l'IS comme à l'IRPP. En vigueur au 1er janvier 2026.";
  const avant =
    finExercice && finExercice.slice(0, 10) < ENTREE_EN_VIGUEUR_SEUIL_PETIT_MATERIEL
      ? " Cet exercice est clos avant cette date : la règle ne s'y applique pas."
      : '';
  const comptable =
    ' Comptable : un bien de très faible valeur va en classe 6, sans seuil chiffré.';
  return fiscal + avant + comptable;
}
