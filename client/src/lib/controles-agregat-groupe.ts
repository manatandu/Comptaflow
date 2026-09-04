import type { BalanceAgregeeGroupe } from './types';

/**
 * LES CONTRÔLES DE L'AGRÉGAT DU GROUPE, mis en forme pour l'écran.
 *
 * Un groupe d'établissements est UNE SEULE personne morale tenue en plusieurs
 * dossiers. Réunir ses comptes, c'est produire « les comptes d'un ensemble
 * d'entités liées comme si elles formaient une seule entité » (AUDCIF,
 * ch. XIII-4, section 1), ce qui suppose « cumul des comptes des entités du
 * périmètre […] ; élimination des comptes réciproques (actifs/passifs,
 * charges/produits) ; neutralisation des résultats provenant d'opérations
 * entre entités du périmètre » (même section).
 *
 * Un cumul qui élimine sans montrer ce qu'il élimine ne se vérifie pas, et
 * l'AUDCIF art. 22, 1° veut que les données « puissent être restituées sur
 * papier ou sous une forme directement intelligible ». Le service calcule ces
 * contrôles depuis le déploiement des tiers-cellules ; cette fonction est ce
 * qui les fait arriver sur un écran.
 *
 * AUCUN CONTRÔLE NE CORRIGE · le D4C fait de la « procédure de confirmation
 * de solde pour toutes les opérations » (ch. XII-5, section 2) le préalable
 * de toute élimination intra-groupe. Un écart, c'est cette confirmation qui a
 * échoué, et le logiciel n'a pas à choisir lequel des deux dossiers a raison.
 */
export interface ControleAgregat {
  cle: string;
  libelle: string;
  ok: boolean;
  /** Ce qu'il faut corriger, dossiers NOMMÉS · null quand le contrôle passe. */
  detail: string | null;
}

/** Deux décimales fixes · un montant de contrôle se lit au centime, pas arrondi à l'écran. */
const somme = (n: number) => n.toFixed(2);

/**
 * JJ/MM/AAAA depuis une date ISO, par découpage de la chaîne · passer par
 * `new Date()` ferait reculer d'un jour une date d'exercice servie à minuit
 * UTC dès que le poste est à l'ouest de Greenwich, et un exercice affiché au
 * 31/12 au lieu du 01/01 accuserait une cellule à tort.
 */
function jourFr(iso: string): string {
  const [annee, mois, jour] = iso.slice(0, 10).split('-');
  return jour && mois && annee ? `${jour}/${mois}/${annee}` : iso;
}

export function controlesDeLAgregat(agregat: BalanceAgregeeGroupe): ControleAgregat[] {
  const c = agregat.controles;
  const desequilibres = agregat.dossiers.filter((d) => !d.equilibre);
  return [
    {
      cle: 'equilibre',
      libelle: 'Chaque dossier du groupe est équilibré',
      ok: c.tousEquilibres,
      // Une cellule déséquilibrée fausse le total du groupe sans qu'aucune
      // ligne de l'agrégat ne le montre · le déséquilibre s'y noie.
      detail: c.tousEquilibres
        ? null
        : `Déséquilibre : ${desequilibres
            .map((d) => `${d.nom} (débit ${somme(d.totalDebit)}, crédit ${somme(d.totalCredit)})`)
            .join(' · ')}.`,
    },
    {
      cle: 'periodes',
      libelle: 'Chaque cellule couvre exactement la période du siège',
      ok: c.periodesConcordantes,
      // Les chiffres d'une cellule à période décalée sont DEHORS · un total
      // qui mêlerait deux périodes ne correspondrait à aucune.
      detail: c.periodesConcordantes
        ? null
        : `Écartée(s) de l’agrégat, période décalée : ${agregat.cellulesPeriodeDiscordante
            .map((x) => `${x.nom} (${jourFr(x.dateDebut)} au ${jourFr(x.dateFin)})`)
            .join(' · ')}. Aligner l’exercice de la cellule, puis recalculer.`,
    },
    {
      cle: 'liaison',
      libelle: 'Virements internes (58) neutralisés',
      ok: c.liaisonNeutralisee,
      detail: c.liaisonNeutralisee
        ? null
        : `Écart de ${somme(c.ecartLiaison)} · un transfert est enregistré d’un seul côté.`,
    },
    {
      cle: 'rattachements',
      libelle: 'Chaque tiers-cellule désigne un dossier de ce groupe',
      ok: c.rattachementsValides,
      // Rien n'a été éliminé sur la foi de ces tiers · éliminer aurait retiré
      // de l'agrégat une opération réellement externe.
      detail: c.rattachementsValides
        ? null
        : `Rattachement ignoré, rien n’a été éliminé : ${agregat.rattachementsRefuses
            .map((r) => `${r.dossier} · ${r.codeTiers} ${r.nomTiers} (${r.motif})`)
            .join(' · ')}.`,
    },
    {
      cle: 'reciprocites',
      libelle: 'La créance chez l’un est la dette chez l’autre',
      ok: c.reciprocitesEquilibrees,
      // L'écart DÉSIGNE une opération enregistrée d'un seul côté, ou pour deux
      // montants différents · c'est un signal de tenue, pas un arrondi.
      detail: c.reciprocitesEquilibrees
        ? null
        : `Confirmation de solde en échec : ${agregat.ecartsReciprocite
            .map((e) => `${e.dossier} contre ${e.contrepartie}, écart ${somme(e.ecart)}`)
            .join(' · ')}. Une opération est enregistrée d’un seul côté, ou pour deux montants différents.`,
    },
    {
      cle: 'eliminations',
      libelle: 'L’élimination sort autant au débit qu’au crédit',
      ok: c.eliminationsSymetriques,
      // Une élimination boiteuse déséquilibrerait l'agrégat lui-même, alors
      // que chaque dossier pris à part reste équilibré.
      detail: c.eliminationsSymetriques
        ? null
        : `Écart de ${somme(c.ecartElimination)} entre ${somme(agregat.totauxEliminations.debit)} retirés au ` +
          `débit et ${somme(agregat.totauxEliminations.credit)} au crédit.`,
    },
  ];
}

/** Les seuls contrôles qui appellent un geste · l'écran les met en tête. */
export function controlesEnEchec(agregat: BalanceAgregeeGroupe): ControleAgregat[] {
  return controlesDeLAgregat(agregat).filter((x) => !x.ok);
}
