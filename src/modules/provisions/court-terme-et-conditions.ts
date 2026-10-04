/**
 * LIGNE A16 · REGISTRE DES PROVISIONS, LE COURT TERME ET LES CONDITIONS
 * PROPRES (relevé CPCC C13).
 *
 * ## Le court terme · 499 et 599, jamais 19
 *
 * Les deux plans écartent du 19 la provision à moins d'un an · SYCEBNL,
 * fiche du COMPTE 19, exclusions, « les provisions correspondant à des
 * risques à moins d'un an (utiliser 499 – Provisions pour risques à court
 * terme) » ; AUDCIF, Titre VII, fiche du COMPTE 49, « Les provisions pour
 * risques à court terme […] représentent une dette probable à moins d'un
 * an », exclusions, « Les provisions pour risques et charges à plus d'un an
 * → 19 ». Le tableau synoptique du ch. 18 range au 499 les risques à court
 * terme « sur opérations d'exploitation, sur opérations financières, sur
 * opérations H.A.O. » et au 599 ceux « à caractère financier portant sur la
 * trésorerie », tous deux « à inscrire au passif circulant ».
 *
 * UN NUMÉRO, DEUX PLANS · le SYSCOHADA subdivise 4991 (exploitation), 4997
 * (financières), 4998 (H.A.O.) ; le SYCEBNL n'ouvre que 4991 et 4998 (fiche
 * de son COMPTE 49) · pas de 4997. Le 599 existe des deux côtés.
 *
 * La dotation n'est pas passée par le registre (il documente et rapproche)
 * · elle est dite à l'écran avec son compte · 6591 pour le 4991 et 6791
 * pour le 4997 (ch. 18 § 2.2.1), 839 pour le 4998 (fiche du compte 49), 679
 * pour le 599 (fiche du compte 59) ; reprises 7591, 7791, 849, 779.
 *
 * ## Les conditions propres · § 4.1, § 4.3, § 4.10
 *
 * Au-delà des quatre conditions générales (§ 2.1), trois cas particuliers du
 * ch. 18 posent les leurs. Elles se COCHENT une à une, chacune citée, et la
 * provision ne se comptabilise pas tant qu'une manque · même forme que les
 * quatre conditions, même issue (passif éventuel avec motif, ou écartée).
 */
import { NatureProvision, Referentiel } from '@prisma/client';

export interface CompteCourtTerme {
  compte: string;
  intitule: string;
  dotation: string;
  reprise: string;
}

export function comptesCourtTerme(referentiel: Referentiel): CompteCourtTerme[] {
  const exploitation = { compte: '4991', intitule: "Provisions pour risques à court terme sur opérations d'exploitation", dotation: '6591', reprise: '7591' };
  const hao = { compte: '4998', intitule: 'Provisions pour risques à court terme sur opérations H.A.O.', dotation: '839', reprise: '849' };
  const tresorerie = { compte: '599', intitule: 'Provisions pour risques à court terme à caractère financier', dotation: '679', reprise: '779' };
  if (referentiel === Referentiel.SYCEBNL) return [exploitation, hao, tresorerie];
  return [
    exploitation,
    { compte: '4997', intitule: 'Provisions pour risques à court terme sur opérations financières', dotation: '6791', reprise: '7791' },
    hao,
    tresorerie,
  ];
}

/** Le refus du compte d'une provision à court terme, ou `null`. */
export function motifRefusCompteCourtTerme(referentiel: Referentiel, numero: string): string | null {
  const admis = comptesCourtTerme(referentiel);
  if (admis.some((c) => numero.startsWith(c.compte))) return null;
  return (
    `Une provision à moins d'un an se porte au ${admis.map((c) => c.compte).join(', ')}, jamais au ${numero} · ` +
    (referentiel === Referentiel.SYCEBNL
      ? "SYCEBNL, fiche du compte 19, exclusions (« les provisions correspondant à des risques à moins d'un an (utiliser 499) »)."
      : "AUDCIF, Titre VII, fiche du compte 49 (« dette probable à moins d'un an ») et tableau synoptique du ch. 18.")
  );
}

/** Le refus d'un compte de court terme sur une provision à plus d'un an. */
export function motifRefusCompteLongTerme(numero: string): string | null {
  if (!numero.startsWith('499') && !numero.startsWith('599')) return null;
  return (
    `Le ${numero} porte les provisions à moins d'un an · une provision à plus d'un an se porte au 19 (AUDCIF, ` +
    'Titre VII, fiche du compte 49, exclusions ; SYCEBNL, fiche du compte 19). Déclarez la ligne « à moins d’un an » ou choisissez le 19.'
  );
}

/**
 * L'horizon déclaré et l'échéance attendue ne se contredisent pas · « à
 * moins d'un an » se lit à la clôture de l'exercice. Sans échéance, rien
 * n'est jugé.
 */
export function motifRefusHorizon(courtTerme: boolean, echeance: Date | null, finExercice: Date): string | null {
  if (!echeance) return null;
  const unAn = new Date(finExercice);
  unAn.setUTCFullYear(unAn.getUTCFullYear() + 1);
  const dansLAnnee = echeance.getTime() <= unAn.getTime();
  if (courtTerme && !dansLAnnee) {
    return "L'échéance attendue est à plus d'un an de la clôture · la provision n'est pas à court terme, elle se porte au 19.";
  }
  if (!courtTerme && dansLAnnee) {
    return (
      "L'échéance attendue tombe dans l'année qui suit la clôture · la provision est à court terme et se porte au 499 " +
      'ou au 599 (fiches des comptes 19 et 49). Déclarez-la « à moins d’un an ».'
    );
  }
  return null;
}

/**
 * SECOND TOUR · QUAND L'HORIZON SE JUGE. Le refus ne vaut qu'au moment où la
 * ligne est CRÉÉE ou que son compte, son horizon ou son échéance CHANGENT ·
 * jamais sur une reprise, une utilisation ou une extinction, ni quand le
 * montant de clôture tombe à zéro, ni sur un passif éventuel, une ligne
 * écartée ou soldée (aucun compte ne la porte). Une ligne existante dont
 * l'échéance est entrée dans l'année reçoit un AVERTISSEMENT · on reclasse à
 * la clôture, on n'efface pas l'échéance (ce serait la falsifier).
 */
export function horizonAJuger(statut: string, montantCloture: number): boolean {
  if (statut === 'PASSIF_EVENTUEL' || statut === 'ECARTEE' || statut === 'SOLDEE') return false;
  return Math.abs(montantCloture) > 0.005;
}

/** L'avertissement d'une ligne existante dont l'horizon ne concorde plus, ou `null`. */
export function avertissementHorizon(courtTerme: boolean, echeance: Date | null, finExercice: Date): string | null {
  if (!motifRefusHorizon(courtTerme, echeance, finExercice)) return null;
  return courtTerme
    ? "L'échéance attendue est désormais à plus d'un an de la clôture · ligne à reclasser au 19 à la clôture (fiches des comptes 19 et 49)."
    : "L'échéance attendue tombe désormais dans l'année qui suit la clôture · ligne à reclasser au 499 (ou au 599) à la clôture (fiches des comptes 19 et 49).";
}

export interface ConditionPropre {
  cle: string;
  libelle: string;
  source: string;
}

/** Les conditions que le ch. 18 ajoute aux quatre, par cas particulier. */
export const CONDITIONS_PROPRES: Partial<Record<NatureProvision, ConditionPropre[]>> = {
  [NatureProvision.RESTRUCTURATION]: [
    {
      cle: 'PLAN_DETAILLE',
      libelle:
        "Un plan détaillé est formalisé à la clôture · activité concernée, principaux sites, localisation, fonction et nombre approximatif du personnel indemnisé, dépenses, date de mise en œuvre",
      source: 'AUDCIF Titre VIII ch. 18 § 4.1.1',
    },
    {
      cle: 'ATTENTE_FONDEE',
      libelle: 'Les personnes concernées ont une attente fondée · mise en œuvre commencée ou annonce publique claire du plan',
      source: 'AUDCIF Titre VIII ch. 18 § 4.1.1',
    },
    {
      cle: 'MISE_EN_OEUVRE_RAPPROCHEE',
      libelle: 'La mise en œuvre et l’achèvement sont programmés au plus tôt, toute modification importante du plan est improbable',
      source: 'AUDCIF Titre VIII ch. 18 § 4.1.1',
    },
    {
      cle: 'ACCORD_IRREVOCABLE',
      libelle: "S'il s'agit de la revente d'une branche d'activité, un accord de vente irrévocable existe à la clôture (sinon, sans objet)",
      source: 'AUDCIF Titre VIII ch. 18 § 4.1',
    },
    {
      cle: 'DEPENSES_DIRECTES',
      // Transcrit mot pour mot du § 4.1.2 (second tour · la phrase des pertes
      // futures identifiables manquait).
      libelle:
        "Le montant respecte le § 4.1.2 · « Une provision pour restructuration ne doit inclure que les dépenses directement " +
        "liées à la restructuration, sans tenir compte des charges liées aux activités poursuivies par l'entité. La " +
        "provision pour restructuration n'inclut pas les coûts : de reconversion ou une délocalisation du personnel " +
        "conservé ; de marketing ; ou de charges liées à la conduite future de l'activité. De même, les pertes futures " +
        "identifiables jusqu'à la date de restructuration ne peuvent pas faire l'objet de provision, sauf si elles " +
        "concernent un contrat déficitaire. Les profits attendus sur la sortie des actifs ne sont pas pris en compte dans " +
        "l'évaluation d'une provision pour restructuration, même s'ils correspondent à l'aboutissement de la " +
        'restructuration. »',
      source: 'AUDCIF Titre VIII ch. 18 § 4.1.2',
    },
  ],
  [NatureProvision.CONTRAT_DEFICITAIRE]: [
    {
      cle: 'COUTS_EXCEDENT_AVANTAGES',
      libelle: "Les coûts inévitables d'exécution du contrat excèdent les avantages économiques attendus",
      source: 'AUDCIF Titre VIII ch. 18 § 4.3',
    },
    {
      cle: 'PLUS_FAIBLE_COUT',
      libelle: "Le montant est le plus faible du coût d'exécution et de l'indemnisation ou pénalité de défaut d'exécution",
      source: 'AUDCIF Titre VIII ch. 18 § 4.3',
    },
    {
      cle: 'PERTES_DE_VALEUR_D_ABORD',
      libelle: 'Les pertes de valeur des actifs dédiés au contrat sont comptabilisées avant la provision',
      source: 'AUDCIF Titre VIII ch. 18 § 4.3',
    },
  ],
  [NatureProvision.DEMENAGEMENT]: [
    {
      cle: 'BAIL_ROMPU',
      libelle:
        "Une obligation existe à la clôture, formalisée par la rupture d'un bail ou son non-renouvellement, de la volonté du bailleur ou de l'entité",
      source: 'AUDCIF Titre VIII ch. 18 § 4.10',
    },
    {
      cle: 'SORTIE_AU_PROFIT_DU_BAILLEUR',
      libelle:
        'La sortie de ressources est au profit du bailleur · dédit, loyers des locaux inoccupés, remise en état des locaux, déménagement des biens qui ne seront plus réutilisés',
      source: 'AUDCIF Titre VIII ch. 18 § 4.10',
    },
    {
      cle: 'HORS_BIENS_REUTILISES',
      libelle: 'Le montant exclut le déménagement des biens qui seront réutilisés · il ne se comptabilise qu’une fois la prestation effectuée',
      source: 'AUDCIF Titre VIII ch. 18 § 4.10',
    },
  ],
};

/** Clés reçues qui n'appartiennent pas à la nature · refusées, jamais ignorées. */
export function clesInconnues(nature: NatureProvision, conditions: Record<string, boolean> | null | undefined): string[] {
  if (!conditions) return [];
  const admises = new Set((CONDITIONS_PROPRES[nature] ?? []).map((c) => c.cle));
  return Object.keys(conditions).filter((k) => !admises.has(k));
}

/** Les conditions propres de la nature qui ne sont pas cochées, en clair. */
export function conditionsPropresManquantes(nature: NatureProvision, conditions: Record<string, boolean> | null | undefined): string[] {
  return (CONDITIONS_PROPRES[nature] ?? []).filter((c) => conditions?.[c.cle] !== true).map((c) => `${c.libelle} (${c.source})`);
}
