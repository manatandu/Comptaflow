import type { Compte, Journal, NumerotationPiece, TauxTva, Tiers, TypeJournal, TypeTiers } from './types';

/**
 * ÉDITIONS DES STRUCTURES (point 18 de la comparaison Sage i7).
 *
 * Le manuel i7 nomme les commandes · « Imprimer la liste des comptes », « des
 * journaux », « des tiers », « Imprimer les paramètres de la société » · sans
 * en donner la maquette. Les colonnes sont donc celles d'OmegaX, tirées des
 * champs de chaque fiche.
 *
 * DEUX RÈGLES. L'édition est une LISTE À PLAT, jamais l'écran imprimé · un
 * plan en arborescence ou une liste filtrée à l'écran sortait sur papier
 * tronquée sans le dire. Et le PÉRIMÈTRE SE DIT · « liste complète », ou la
 * sélection exacte qui a produit la liste, avec le nombre de lignes. Une
 * liste partielle qui ne dit pas qu'elle l'est se lit comme le plan entier.
 */

export interface Edition {
  colonnes: string[];
  lignes: string[][];
}

export const LIBELLE_TYPE_JOURNAL: Record<TypeJournal, string> = {
  ACHATS: 'Achats',
  VENTES: 'Ventes',
  TRESORERIE: 'Trésorerie',
  GENERAL: 'Général',
  SITUATION: 'Situation',
};

export const LIBELLE_NUMEROTATION: Record<NumerotationPiece, string> = {
  MANUELLE: 'Manuelle',
  CONTINUE_JOURNAL: 'Continue par journal',
  CONTINUE_FICHIER: 'Continue pour le fichier',
  MENSUELLE: 'Mensuelle',
};

const LIBELLE_TYPE_TIERS: Record<TypeTiers, string> = {
  ADHERENT: 'Adhérent',
  CLIENT: 'Client',
  FOURNISSEUR: 'Fournisseur',
  SALARIE: 'Salarié',
  AUTRE: 'Autre',
};

const REPORT: Record<Compte['modeReportANouveau'], string> = { AUCUN: 'Aucun', SOLDE: 'Solde', DETAIL: 'Détail' };
const ouiNon = (b: boolean) => (b ? 'Oui' : 'Non');
const etat = (actif: boolean) => (actif ? 'Actif' : 'En sommeil');
const parCode = <T,>(cle: (x: T) => string) => (a: T, b: T) => cle(a).localeCompare(cle(b), 'fr');

export function editionPlan(comptes: Compte[]): Edition {
  return {
    colonnes: ['N° de compte', 'Intitulé', 'Type', 'Nature', 'Report à-nouveau', 'Lettrable', 'État'],
    lignes: [...comptes].sort(parCode((c) => c.numero)).map((c) => [
      c.numero,
      c.intitule,
      c.typeCompte === 'TOTAL' ? 'Total' : 'Détail',
      c.nature ?? '',
      REPORT[c.modeReportANouveau],
      ouiNon(c.lettrable),
      etat(c.estActif),
    ]),
  };
}

export function editionTiers(tiers: Tiers[]): Edition {
  return {
    colonnes: ['Code', 'Nom', 'Type', 'Compte principal', 'Ville', 'Téléphone', 'N° impôt', 'État'],
    lignes: [...tiers].sort(parCode((t) => t.code)).map((t) => [
      t.code,
      t.nom,
      LIBELLE_TYPE_TIERS[t.type],
      t.comptesRattaches.find((r) => r.estPrincipal)?.compte.numero ?? '',
      t.ville ?? '',
      t.telephone ?? '',
      t.numeroImpot ?? '',
      etat(t.estActif),
    ]),
  };
}

export function editionJournaux(journaux: Journal[]): Edition {
  return {
    colonnes: ['Code', 'Intitulé', 'Type', 'Compte de trésorerie', 'Numérotation', 'Contrepartie à chaque ligne', 'État'],
    lignes: [...journaux].sort(parCode((j) => j.code)).map((j) => [
      j.code,
      j.intitule,
      LIBELLE_TYPE_JOURNAL[j.type],
      j.compteTresorerie?.numero ?? '',
      LIBELLE_NUMEROTATION[j.numerotation],
      j.type === 'TRESORERIE' ? ouiNon(!!j.contrepartieChaqueLigne) : '',
      etat(j.estActif),
    ]),
  };
}

export function editionTaux(taux: TauxTva[]): Edition {
  return {
    colonnes: ['Code', 'Intitulé', 'Taux', 'Compte collecté', 'Compte déductible', 'État'],
    lignes: [...taux].sort(parCode((t) => t.code)).map((t) => [
      t.code,
      t.intitule,
      `${Number(t.taux).toLocaleString('fr-FR', { maximumFractionDigits: 4 })} %`,
      t.compteCollecte?.numero ?? '',
      t.compteDeductible?.numero ?? '',
      etat(t.estActif),
    ]),
  };
}

/**
 * Ce que la liste couvre · les critères qui l'ont produite, dans l'ordre où
 * l'écran les pose. Aucun critère, c'est la liste complète.
 */
export function perimetreEdition(
  criteres: Array<[string, string | null | undefined]>,
  nombre: number,
  unite: string,
  pluriel = `${unite}s`,
): string {
  const actifs = criteres.filter(([, v]) => v && v.trim() !== '').map(([k, v]) => `${k} « ${v!.trim()} »`);
  const compte = `${nombre} ${nombre > 1 ? pluriel : unite}`;
  return actifs.length ? `Sélection · ${actifs.join(' · ')} · ${compte}` : `Liste complète · ${compte}`;
}

/**
 * « Imprimer les paramètres de la société » · une rubrique par ligne. Une
 * rubrique vide s'imprime « non renseigné » plutôt que de disparaître · une
 * fiche qui omet ce qu'elle n'a pas se lit comme complète.
 */
export function editionParametres(
  p: import('./types').ParametresDossier,
  libelles: { jeuOuSysteme: string | null; forme: string | null },
): Edition {
  const v = (x: string | number | null | undefined) => (x === null || x === undefined || x === '' ? 'non renseigné' : String(x));
  const date = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('fr-FR') : null);
  const sycebnl = p.referentiel === 'SYCEBNL';
  const lignes: Array<[string, string]> = [
    ['Dénomination', v(p.nom)],
    ['Référentiel', p.referentiel],
    [sycebnl ? "Jeu d'états financiers" : 'Système comptable', v(libelles.jeuOuSysteme)],
    ['Forme juridique', v(libelles.forme)],
    ['Activité', v(p.activite)],
    ['Adresse', v(p.adresse)],
    ['Ville', v(p.ville)],
    ['Pays', v(p.pays)],
    ['Téléphone', v(p.telephone)],
    ['Courriel', v(p.email)],
    ['Site', v(p.siteWeb)],
  ];
  if (!sycebnl) {
    lignes.push(
      ['Capital social', p.capitalSocial === null ? 'non renseigné' : `${p.capitalSocial.toLocaleString('fr-FR')} ${p.devise ?? ''}${p.capitalVariable ? ' · à capital variable' : ''}`.trim()],
      ['RCCM', v(p.rccm)],
    );
  }
  lignes.push(['N° impôt', v(p.numeroImpot)], ['Identification nationale', v(p.idNat)]);
  if (sycebnl) {
    lignes.push(
      ['Acte de personnalité juridique', v([p.actePersonnaliteJuridique, date(p.dateActePersonnalite)].filter(Boolean).join(' du ') || null)],
      ['Enregistrement sectoriel', v(p.numeroEnregistrementSecteur)],
      ['Certificat du Ministère du Plan', v(p.certificatEnregistrementPlan)],
      ["Attestation d'exemption d'IS", v(p.attestationExemptionIs)],
    );
  }
  lignes.push(
    ['Monnaie de tenue', v(p.devise)],
    ['Monnaie fonctionnelle', v(p.deviseFonctionnelle)],
    ['Longueur des comptes', `${p.longueurCompte} chiffres`],
    // La RÉPONSE, pas le booléen · un faux par défaut s'imprimerait « Non »
    // sur un dossier qui n'a jamais répondu.
    ['Assujetti à la TVA', p.assujettissementTva == null ? 'non renseigné' : ouiNon(p.assujettissementTva)],
    ['Vente de biens ou de services', p.venteBiensServices == null ? 'non renseigné' : ouiNon(p.venteBiensServices)],
    ['Double regard à la validation', ouiNon(p.doubleRegardValidation)],
  );
  return { colonnes: ['Rubrique', 'Valeur'], lignes };
}

export function libelleTypeTiers(t: TypeTiers): string {
  return LIBELLE_TYPE_TIERS[t];
}
