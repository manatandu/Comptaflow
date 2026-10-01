import { montant } from './montants';

/**
 * LE COMPTE DU BIEN, CÔTÉ ÉCRAN · le serveur lit tout dans le plan du dossier
 * (`src/modules/immobilisations/compte-du-bien.ts`) · comptes 28 et 68,
 * sections du barème proposées, modes d'acquisition et leurs libellés.
 * L'écran ne recompose aucun numéro et ne recopie aucun libellé de mode.
 */
export interface CompteDuBien {
  id: string;
  numero: string;
  intitule: string;
  compteAmortissement: { id: string; numero: string; intitule: string } | null;
  compteDotation: { id: string; numero: string; intitule: string } | null;
  /** Un 28 ou un 68 absent du plan, dit · null quand les deux sont trouvés. */
  motifComptes: string | null;
  /** Le bien ne s'amortit pas (terrain, bien reçu en don destiné à la vente). */
  motifNonAmortissable: string | null;
  /** Sections de l'arrêté n° 013/2025 proposées · null, toutes ; vide, aucune. */
  sectionsBareme: string[] | null;
  /** Natures du barème que ce compte propose (lot 6, D-4) · vide, repli sur les sections. */
  naturesBareme?: string[];
  division: { numero: string; intitule: string | null };
  /** Sous-compte « location-acquisition » · le bien n'y entre que par un contrat. */
  locationAcquisition: boolean;
  /**
   * IMMOBILISATION EN COURS (serveur, `immobilisation-en-cours.ts`) · le
   * compte est lui-même un 2x9 ; les en-cours de sa division lus dans le plan
   * du dossier ; celui que le texte, ou l'unicité, présélectionne ; le motif
   * quand le bien ne peut pas être inscrit en cours.
   */
  estCompteEnCours?: boolean;
  comptesEnCours?: { id: string; numero: string; intitule: string }[];
  compteEnCoursProposeId?: string | null;
  motifSansEnCours?: string | null;
}

/**
 * LES COMPTES QU'ON PEUT CHOISIR COMME COMPTE DÉFINITIF · tous, sauf, quand
 * le bien est inscrit en cours, les 2x9 eux-mêmes · le compte définitif porte
 * la nature, la durée et la famille, l'en-cours se choisit à côté.
 */
export function comptesDefinitifs(comptes: CompteDuBien[], pasEncoreEnService: boolean): CompteDuBien[] {
  return pasEncoreEnService ? comptes.filter((c) => !c.estCompteEnCours) : comptes;
}

/**
 * LES CONTREPARTIES D'UN BIEN INSCRIT EN COURS · sans « Travaux en cours
 * achevés », qui crédite un 2x9 · le bien serait débité et crédité au même
 * en-cours, et le serveur le refuse.
 */
export function contrepartiesSelonEnCours(contreparties: ContrepartieAdmise[], pasEncoreEnService: boolean): ContrepartieAdmise[] {
  return pasEncoreEnService ? contreparties.filter((c) => c.mode !== 'EN_COURS_ACHEVE') : contreparties;
}

/**
 * L'EN-COURS POSÉ D'OFFICE quand on coche « Pas encore mis en service » ou
 * qu'on change de compte · celui que le serveur présélectionne (texte ou
 * candidat unique), sinon rien · le cabinet choisit.
 */
export function compteEnCoursInitial(compte: CompteDuBien | null): string {
  if (!compte || compte.motifSansEnCours) return '';
  return compte.compteEnCoursProposeId ?? '';
}

export interface ContrepartieAdmise {
  id: string;
  numero: string;
  intitule: string;
  mode: string | null;
  libelleMode: string | null;
}

export interface SeuilPetitMateriel {
  seuil: number | null;
  cours: number | null;
  dateCours: string | null;
  motif: string | null;
}

/** Les comptes regroupés par division, dans l'ordre du plan, sous l'intitulé du plan. */
export function comptesParDivision(comptes: CompteDuBien[]): { numero: string; intitule: string; comptes: CompteDuBien[] }[] {
  const groupes: { numero: string; intitule: string; comptes: CompteDuBien[] }[] = [];
  for (const c of comptes) {
    let g = groupes.find((x) => x.numero === c.division.numero);
    if (!g) {
      g = { numero: c.division.numero, intitule: c.division.intitule ?? `Division ${c.division.numero}`, comptes: [] };
      groupes.push(g);
    }
    g.comptes.push(c);
  }
  return groupes;
}

/** Les modes présents dans la liste admise, dans l'ordre servi, chacun avec son libellé. */
export function modesPresents(contreparties: ContrepartieAdmise[]): { mode: string; libelle: string }[] {
  const vus = new Map<string, string>();
  for (const c of contreparties) if (c.mode && !vus.has(c.mode)) vus.set(c.mode, c.libelleMode ?? c.mode);
  return [...vus].map(([mode, libelle]) => ({ mode, libelle }));
}

/**
 * L'AVERTISSEMENT DU PETIT MATÉRIEL, ou null · arrêté n° 014/CAB/MIN/FINANCES/
 * 2025, art. 2 : « valeur unitaire inférieure à l'équivalent en francs
 * congolais de cinq cents dollars américains ». Il ne vise que le petit
 * matériel et outillage et le matériel de bureau, ce qu'aucun numéro de compte
 * ne dit · la phrase est conditionnelle. Sans seuil chiffré (pas de cours,
 * date antérieure au 1er janvier 2026), rien n'est comparé et rien n'est dit.
 * Une valeur ÉGALE au seuil n'est pas « inférieure ».
 */
export function avertissementPetitMateriel(valeur: number | null, seuil: SeuilPetitMateriel | null): string | null {
  if (valeur == null || !Number.isFinite(valeur) || valeur <= 0) return null;
  if (!seuil || seuil.seuil == null) return null;
  if (valeur >= seuil.seuil) return null;
  const date = seuil.dateCours ? new Date(seuil.dateCours).toISOString().slice(0, 10).split('-').reverse().join('/') : '';
  return (
    `Valeur inférieure à l'équivalent de 500 USD (${montant(seuil.seuil)} au cours du ${date}) · ` +
    `petit matériel, outillage ou matériel de bureau, il est déductible en charges dès l'acquisition ` +
    `(arrêté n° 014/2025, art. 2).`
  );
}
