/**
 * LE LIEU DU BIEN RECOPIÉ SUR SA FICHE DE COMPTAGE (ligne A19, relevé CPCC
 * C16).
 *
 * AUDCIF art. 16, al. 6 et 7 (non écarté par l'art. 3 du SYCEBNL, dont la
 * liste d'exclusion ne nomme pas l'art. 16 · il vaut aux deux) · « L'entité
 * procède à l'opération d'inventaire par le relevé physique de tous les
 * éléments de son patrimoine […] » et « Les données d'inventaire sont
 * organisées et conservées de manière à justifier le contenu de chacun des
 * éléments recensés du patrimoine. » Le séminaire du CPCC (étape 2) fait
 * « voir physiquement chaque bien à partir de son fichier » · un bien que la
 * fiche ne situe pas se cherche au lieu de se compter, et la fiche conservée
 * ne dit plus où il a été vu.
 *
 * UNE COPIE, PAS UN LIEN. Le lieu est écrit en clair dans `emplacement`, au
 * jour où la fiche naît · c'est ce que la commission avait sous les yeux en
 * allant compter. Un lien vers `LieuBien` suivrait un lieu renommé ou un bien
 * déplacé l'année suivante, et la fiche conservée (art. 16, al. 7) changerait
 * de contenu sans que personne ne l'ait touchée.
 *
 * Le libellé « code · intitulé » est une DÉFINITION D'OMEGAX · `LieuBien` n'en
 * porte pas d'autre (référentiel des lieux de Sage Immobilisations, sans texte
 * comptable qui le normalise).
 */
export function libelleLieuBien(lieu: { code: string; intitule: string } | null | undefined): string | null {
  if (!lieu) return null;
  const code = lieu.code.trim();
  const intitule = lieu.intitule.trim();
  if (!code && !intitule) return null;
  if (!code) return intitule;
  if (!intitule) return code;
  return `${code} · ${intitule}`;
}
