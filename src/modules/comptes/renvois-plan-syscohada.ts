import { PLAN_COMPTES_SYSCOHADA } from './compte-seed-syscohada';

/**
 * LES RENVOIS ANNEXÉS AU PLAN SYSCOHADA · le texte que les marqueurs « [1] »
 * à « [10] » des intitulés semés appellent (passe R1, C8 · 2026-09-30).
 *
 * Le semis, engendré depuis le TSV de la compétence `syscohada`, porte le
 * marqueur dans l'intitulé (« Commissions et courtages [8] ») et le texte
 * n'était servi nulle part · le comptable voyait « [8] » à la saisie sans
 * pouvoir lire ce qu'il dit. Trois renvois sont des règles d'imputation ([5]
 * et [7] écartent les opérations avec les entités du groupe, [8] envoie au
 * 706 les produits de l'activité principale), et c'est pourquoi ils se
 * montrent à la saisie, à côté des Exclusions de la fiche.
 *
 * TEXTE VERBATIM, recopié de la compétence `syscohada`,
 * comptes/references/regles-et-notes.md, « Notes officielles annexées au
 * plan » (le même texte figure aux fiches du Titre VII de l'AUDCIF, classes 6
 * et 7). Seul le texte de la note est repris, sans son titre · le séparateur
 * qui les joint dans la compétence n'est pas recopié. Rien n'est tranché ·
 * qualifier l'activité principale reste l'affaire du cabinet, et aucun compte
 * n'est imputé d'office au 706.
 *
 * Le marqueur se lit sur l'intitulé SEMÉ du numéro, jamais sur celui du
 * dossier · un cabinet qui renomme un compte ne doit ni perdre ni fabriquer
 * un renvoi.
 */
export const RENVOIS_PLAN_SYSCOHADA: Record<number, string> = {
  1: "Pièces, barres, lingots, louis d'or et autres métaux précieux (argent, diamant…) acquis et que l'entité a l'intention de conserver de manière durable.",
  2: 'Le terme « associés » englobe les « actionnaires » et les « membres ».',
  3: 'Créer des sous-comptes distinguant les immobilisations corporelles des incorporelles.',
  4: "Pièces, barres, louis d'or et autres métaux précieux (argent, diamant…) acquis en vue d'une cession à court terme. Ils jouent donc le rôle d'instruments de trésorerie.",
  5: "À l'exception des achats effectués avec les entités du groupe.",
  6: "L'entité peut créer des sous-comptes pour les frais accessoires : douane, fret, assurance sur achats, commissions, courtages sur achats, frais de transit, et autres frais accessoires.",
  7: "À l'exclusion des ventes faites à des entités du groupe.",
  8: "À inscrire au compte 706 si ces produits correspondent à une activité principale de l'entité.",
  9: "En cas d'offre publique d'échange (OPE) ou d'achat (OPA) notamment.",
  10: "Cas de révision de plan d'amortissement.",
};

const MARQUEUR = /\[(\d+)\]/;

export interface RenvoiDuCompte {
  numero: string;
  renvoi: number;
  texte: string;
}

/** Les comptes semés qui portent un renvoi, avec son texte. */
export function renvoisDuPlanSyscohada(): RenvoiDuCompte[] {
  const resultat: RenvoiDuCompte[] = [];
  for (const ligne of PLAN_COMPTES_SYSCOHADA) {
    const m = MARQUEUR.exec(ligne.intitule);
    if (!m) continue;
    const renvoi = Number(m[1]);
    const texte = RENVOIS_PLAN_SYSCOHADA[renvoi];
    if (texte) resultat.push({ numero: ligne.numero, renvoi, texte });
  }
  return resultat;
}
