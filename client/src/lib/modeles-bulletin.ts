/**
 * BULLETINS MODÈLES, CÔTÉ ÉCRAN · la règle est au serveur
 * (src/modules/personnel/modeles-bulletin.ts). Ici, seulement la traduction
 * entre les lignes de la saisie de paie et les lignes d'un modèle.
 *
 * Deux règles de l'application, qui ne se devinent pas :
 *  - un montant n'est repris QUE dans la devise du modèle · une paie stipulée
 *    en francs ne reçoit pas les montants d'un modèle en dollars, et OmegaX
 *    ne les convertit pas (le cours est celui du jour, au serveur) ;
 *  - l'attestation de l'art. 69, 8 et le remboursement effectif de l'art. 68,
 *    1 ne viennent jamais d'un modèle · ils se donnent à chaque paie.
 */
export interface LigneModele {
  nature: string;
  libelle: string;
  rubriqueId?: string | null;
  montant?: number | null;
}

export interface ModeleBulletin {
  id: string;
  nom: string;
  categorie: string | null;
  deviseStipulation: 'CDF' | 'USD';
  lignes: LigneModele[];
}

export interface LigneSaisiePaie {
  nature: string;
  libelle: string;
  montantFc: string;
  attestee: '' | 'oui' | 'non';
  remboursement: boolean;
  rubriqueId?: string;
}

const nombre = (v: string) => Number(v.replace(/\s/g, '').replace(',', '.'));

/** Appliquer un modèle · rend les lignes de saisie et ce qu'il faut dire. */
export function lignesDepuisModele(
  modele: ModeleBulletin,
  deviseCourante: 'CDF' | 'USD',
  rubriquesActives: { id: string }[],
): { lignes: LigneSaisiePaie[]; avertissements: string[] } {
  const avertissements: string[] = [];
  const memeDevise = modele.deviseStipulation === deviseCourante;
  if (!memeDevise && modele.lignes.some((l) => l.montant !== null && l.montant !== undefined)) {
    avertissements.push(
      `Le modèle est en ${modele.deviseStipulation}, la paie en ${deviseCourante} · les montants sont à saisir.`,
    );
  }
  const lignes = modele.lignes.map((l) => {
    const rubriqueEncoreActive = !!l.rubriqueId && rubriquesActives.some((r) => r.id === l.rubriqueId);
    if (l.rubriqueId && !rubriqueEncoreActive) {
      avertissements.push(`« ${l.libelle} » · sa rubrique est désactivée, l'élément reste sans rubrique.`);
    }
    return {
      nature: l.nature,
      libelle: l.libelle,
      montantFc: memeDevise && l.montant !== null && l.montant !== undefined ? String(l.montant) : '',
      attestee: '' as const,
      remboursement: false,
      ...(rubriqueEncoreActive ? { rubriqueId: l.rubriqueId as string } : {}),
    };
  });
  return { lignes, avertissements };
}

/** Enregistrer la saisie comme modèle · une ligne sans libellé n'est pas reprise. */
export function lignesVersModele(lignes: LigneSaisiePaie[]): LigneModele[] {
  return lignes
    .filter((l) => l.libelle.trim())
    .map((l) => ({
      nature: l.nature,
      libelle: l.libelle.trim(),
      rubriqueId: l.rubriqueId ?? null,
      montant: l.montantFc.trim() && Number.isFinite(nombre(l.montantFc)) ? nombre(l.montantFc) : null,
    }));
}
