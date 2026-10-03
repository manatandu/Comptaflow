import type { Prisma } from '@prisma/client';
import { lireParLots, LOT_LECTURE, pageApres } from '../../common/lecture-par-lots';

/**
 * LA PAIRE À CHEVAL (ligne A6 bis, second tour, m1).
 *
 * La règle (1) de `lettrages-a-cheval.ts` lit chaque exercice pour lui-même ·
 * la facture de N lettrée avec un règlement de N+1 passe au report comme
 * OUVERTE, et l'exercice N+1 la reçoit en ligne d'à-nouveau. Dans N+1, cette
 * ligne d'à-nouveau et le règlement du groupe forment une PAIRE · lus
 * ensemble, ils se compensent. Le règlement des tiers et les relances ne
 * lisaient que la ligne d'à-nouveau (le règlement est lettré) · la facture se
 * listait due et se payait en entier une seconde fois (1 160 USD payés deux
 * fois, 81 200 au 656, relecture adverse du second tour).
 *
 * CE QUE LA PAIRE RÉUNIT, groupe par groupe · les lignes de l'exercice lu
 * dans un groupe qui touche un exercice ANTÉRIEUR (le règlement, l'écart
 * réalisé passé sur le groupe), et les lignes d'à-nouveau de l'exercice lu
 * qui reportent les lignes antérieures du groupe.
 *  · Au DÉTAIL, chaque ligne antérieure a SA ligne d'à-nouveau · reconnue à
 *    son compte, ses montants, sa devise, son échéance et son libellé, que
 *    le report recopie (`report-a-nouveau.ts`, « RAN détail ... · libellé »).
 *    Aucun lien en base ne les relie · si une seule ligne antérieure n'a pas
 *    la sienne (un report d'avant la règle (1), qui sortait la facture lettrée
 *    et n'a donc rien laissé de fantôme), le groupe n'est pas apparié.
 *  · Au SOLDE, la ligne d'à-nouveau est le solde du compte, par devise · elle
 *    contient toujours les lignes antérieures, et le règlement du groupe s'en
 *    retranche.
 *
 * CE QUI EN SORT · `absorbees`, les lignes que la paire éteint (lues ouvertes,
 * elles se compenseraient une seconde fois), la ligne en devise soldée dans
 * sa devise comprise (son reste en francs est le réalisé, que le contrôle 35
 * nomme) ; `reste`, la ligne d'à-nouveau réglée EN PARTIE, avec ce qu'elle
 * doit encore. Le règlement d'un groupe
 * s'impute sur ses lignes d'à-nouveau les plus anciennes d'abord, comme le
 * règlement en devise (`ordreDeReglement`). Une paire qui AJOUTERAIT au dû (une
 * facture de l'exercice lettrée avec un acompte antérieur, au SOLDE) n'est
 * pas lue · relevé de l'éditeur, le dû n'en est que minoré, jamais payé deux
 * fois.
 *
 * NON LUE ICI · la balance âgée et les notes par échéance
 * (`ouverteALaCloture`), que le contrôle 35 nomme.
 */

/** Ce qu'une ligne d'à-nouveau réglée en partie doit encore. */
export interface ResteDeLaLigne {
  /** Débit moins crédit, au centime. */
  francs: number;
  /** Sans signe, dans la devise de la ligne · `null` sans devise. */
  devise: number | null;
  /** Le code du groupe à cheval qui la règle en partie. */
  groupe: string;
}

export interface PairesACheval {
  /** Lignes éteintes par la paire · ni dues, ni comptées. */
  absorbees: Set<string>;
  /** Ligne d'à-nouveau éteinte, par le code du groupe qui l'éteint · pour le dire. */
  groupeDe: Map<string, string>;
  /** Ligne d'à-nouveau réglée en partie, et son reste. */
  reste: Map<string, ResteDeLaLigne>;
}

type Lecteur = { ligneEcriture: { findMany: (args: Prisma.LigneEcritureFindManyArgs) => Promise<unknown[]> } };

/** Les drapeaux d'une écriture d'à-nouveau · provisoire, ou de clôture hors solde des comptes de gestion. */
export const ECRITURE_D_A_NOUVEAU: Prisma.EcritureWhereInput[] = [
  { estANouveauProvisoire: true },
  { estGenereeParCloture: true, estSoldeDesComptesDeGestion: false },
];

interface LigneLue {
  id: string;
  compteId: string;
  debit: unknown;
  credit: unknown;
  deviseId: string | null;
  montantDevise: unknown;
}
interface LigneDuGroupe extends LigneLue {
  lettrageId: string;
  compte: { modeReportANouveau: string };
  lettrage: { code: string };
}
interface LigneAnterieure extends LigneLue {
  lettrageId: string;
  dateEcheance: Date | null;
  libelle: string | null;
  ecriture: { date: Date; libelle: string };
}
interface LigneDAnouveau extends LigneLue {
  dateEcheance: Date | null;
  libelle: string | null;
}

const centimes = (x: unknown) => Math.round(Number(x ?? 0) * 100);
const signe = (l: LigneLue) => centimes(l.debit) - centimes(l.credit);
const enDevise = (l: LigneLue) => (l.deviseId !== null && l.montantDevise !== null && l.montantDevise !== undefined ? centimes(l.montantDevise) : null);
const memeJour = (a: Date | null, b: Date | null) => (a === null || b === null ? a === b : a.getTime() === b.getTime());
const TRANCHE_GROUPES = 500;

/**
 * IMPUTE CE QU'UN GROUPE A RÉGLÉ SUR LE RESTE D'UNE LIGNE D'À-NOUVEAU (ligne
 * A6 ter, seconde relecture, BLOQUANT). Une ligne EN DEVISE s'éteint dans sa
 * devise, et les francs qui partent avec elle sont son COÛT HISTORIQUE, au
 * prorata de la devise réglée · jamais les francs payés. Le dû d'une créance
 * ou d'une dette en devise est au cours historique (AUDCIF art. 54 · « au
 * cours de change à la date de l'opération » ; art. 55, l'écart de règlement
 * se constate « par rapport à leur coût historique »). Retrancher les francs
 * payés laissait sur le reste la perte ou le gain réalisé du groupe non
 * encore passé · 1 000 USD de G à 2 800 réglés à 2 700 laissaient H (500 USD,
 * 1 400 000) due de 1 500 000, son règlement chiffrait 150 000 de perte au
 * lieu de 50 000, puis l'écart de G passait 100 000 de plus · 656 à 250 000
 * et le client à −100 000. Le rapport francs sur devise du reste se garde
 * ainsi d'un groupe à l'autre. Une ligne SANS devise s'éteint en francs.
 */
function imputer(
  reste: { francs: number; devise: number | null },
  paye: number,
  payeDevise: number | null,
): { paye: number; payeDevise: number | null } {
  if (reste.devise !== null && payeDevise !== null) {
    const prisDevise = Math.min(reste.devise, payeDevise);
    const historique = reste.devise > 0 ? Math.min(reste.francs, Math.round((reste.francs * prisDevise) / reste.devise)) : 0;
    reste.francs -= historique;
    reste.devise -= prisDevise;
    return { paye: Math.max(0, paye - historique), payeDevise: payeDevise - prisDevise };
  }
  const pris = Math.min(reste.francs, paye);
  reste.francs -= pris;
  return { paye: paye - pris, payeDevise };
}

/**
 * Lit les paires d'un exercice, sur les comptes que `compte` désigne. Une
 * lecture par tranches (§ 8 bis) des lignes de l'exercice dans un groupe à
 * cheval, puis des lignes antérieures de ces groupes, puis des lignes
 * d'à-nouveau des comptes touchés ; rien n'est lu au-delà quand aucun groupe
 * ne touche l'exercice.
 */
export async function pairesACheval(
  prisma: unknown,
  p: { tenantId: string; exercice: { id: string; dateDebut: Date }; compte: Prisma.CompteWhereInput },
): Promise<PairesACheval> {
  const lecteur = prisma as Lecteur;
  const resultat: PairesACheval = { absorbees: new Set(), groupeDe: new Map(), reste: new Map() };

  const parGroupe = new Map<string, { compteId: string; mode: string; code: string; lignes: LigneDuGroupe[] }>();
  await lireParLots(
    (curseur) =>
      lecteur.ligneEcriture.findMany({
        where: {
          ecriture: { tenantId: p.tenantId, exerciceId: p.exercice.id },
          lettrageId: { not: null },
          compte: p.compte,
          lettrage: { lignes: { some: { ecriture: { tenantId: p.tenantId, date: { lt: p.exercice.dateDebut } } } } },
        },
        select: {
          id: true,
          compteId: true,
          debit: true,
          credit: true,
          deviseId: true,
          montantDevise: true,
          lettrageId: true,
          compte: { select: { modeReportANouveau: true } },
          lettrage: { select: { code: true } },
        },
        ...pageApres(curseur, LOT_LECTURE),
      }) as Promise<LigneDuGroupe[]>,
    (l) => {
      const g = parGroupe.get(l.lettrageId) ?? { compteId: l.compteId, mode: l.compte.modeReportANouveau, code: l.lettrage.code, lignes: [] };
      g.lignes.push(l);
      parGroupe.set(l.lettrageId, g);
    },
  );
  if (parGroupe.size === 0) return resultat;

  const anterieures = new Map<string, LigneAnterieure[]>();
  const ids = [...parGroupe.keys()];
  for (let i = 0; i < ids.length; i += TRANCHE_GROUPES) {
    const tranche = ids.slice(i, i + TRANCHE_GROUPES);
    await lireParLots(
      (curseur) =>
        lecteur.ligneEcriture.findMany({
          where: { lettrageId: { in: tranche }, ecriture: { tenantId: p.tenantId, date: { lt: p.exercice.dateDebut } } },
          select: {
            id: true,
            compteId: true,
            debit: true,
            credit: true,
            deviseId: true,
            montantDevise: true,
            lettrageId: true,
            dateEcheance: true,
            libelle: true,
            ecriture: { select: { date: true, libelle: true } },
          },
          ...pageApres(curseur, LOT_LECTURE),
        }) as Promise<LigneAnterieure[]>,
      (l) => anterieures.set(l.lettrageId, [...(anterieures.get(l.lettrageId) ?? []), l]),
    );
  }

  const comptes = [...new Set([...parGroupe.values()].map((g) => g.compteId))];
  const aNouveau = new Map<string, LigneDAnouveau[]>();
  await lireParLots(
    (curseur) =>
      lecteur.ligneEcriture.findMany({
        where: {
          compteId: { in: comptes },
          lettrageId: null,
          ecriture: { tenantId: p.tenantId, exerciceId: p.exercice.id, OR: ECRITURE_D_A_NOUVEAU },
        },
        select: { id: true, compteId: true, debit: true, credit: true, deviseId: true, montantDevise: true, dateEcheance: true, libelle: true },
        ...pageApres(curseur, LOT_LECTURE),
      }) as Promise<LigneDAnouveau[]>,
    (l) => aNouveau.set(l.compteId, [...(aNouveau.get(l.compteId) ?? []), l]),
  );

  // Ce qui reste de chaque ligne d'à-nouveau, en centimes sans signe · une
  // ligne au SOLDE se partage entre plusieurs groupes.
  const restant = new Map<string, { francs: number; devise: number | null; ligne: LigneDAnouveau; groupe: string }>();
  const prendre = (r: LigneDAnouveau, groupe: string) => {
    const vu = restant.get(r.id);
    if (vu) return vu;
    const neuf = { francs: Math.abs(signe(r)), devise: enDevise(r), ligne: r, groupe };
    restant.set(r.id, neuf);
    return neuf;
  };
  const utilisees = new Set<string>();

  for (const [groupeId, g] of parGroupe) {
    const avant = anterieures.get(groupeId) ?? [];
    if (avant.length === 0) continue;
    const devises = new Set([...avant, ...g.lignes].filter((l) => l.deviseId !== null).map((l) => l.deviseId));
    const devise = devises.size === 1 ? [...devises][0]! : null;
    const duCompte = aNouveau.get(g.compteId) ?? [];

    if (g.mode === 'DETAIL') {
      // Chaque ligne antérieure, et SA ligne d'à-nouveau · dans l'ordre des
      // lignes d'origine, les plus anciennes d'abord.
      const copies: LigneDAnouveau[] = [];
      const ordonnees = [...avant].sort((a, b) => a.ecriture.date.getTime() - b.ecriture.date.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      for (const e of ordonnees) {
        const libelle = e.libelle ?? e.ecriture.libelle;
        const r = duCompte.find(
          (x) =>
            !utilisees.has(x.id) &&
            !copies.includes(x) &&
            centimes(x.debit) === centimes(e.debit) &&
            centimes(x.credit) === centimes(e.credit) &&
            (x.deviseId ?? null) === (e.deviseId ?? null) &&
            enDevise(x) === enDevise(e) &&
            memeJour(x.dateEcheance, e.dateEcheance) &&
            (x.libelle ?? '').endsWith(libelle),
        );
        if (!r) break;
        copies.push(r);
      }
      if (copies.length !== avant.length) continue;
      for (const r of copies) utilisees.add(r.id);
      const net = [...copies, ...g.lignes].reduce((t, l) => t + signe(l), 0);
      for (const l of g.lignes) resultat.absorbees.add(l.id);
      const sens = Math.sign(net);
      // Les copies dans le sens du reste gardent ce reste · le règlement
      // s'impute sur les plus anciennes d'abord, le reste demeure sur les plus
      // récentes. Les autres copies sont éteintes.
      const memes = sens === 0 ? [] : copies.filter((r) => Math.sign(signe(r)) === sens);
      for (const r of copies) {
        if (!memes.includes(r)) {
          resultat.absorbees.add(r.id);
          resultat.groupeDe.set(r.id, g.code);
        }
      }
      if (memes.length === 0) continue;
      const netDevise =
        devise === null ? null : [...copies, ...g.lignes].reduce((t, l) => t + (l.deviseId === devise ? Math.sign(signe(l)) * (enDevise(l) ?? 0) : 0), 0);
      let paye = Math.max(0, memes.reduce((t, r) => t + Math.abs(signe(r)), 0) - Math.abs(net));
      let payeDevise =
        netDevise === null ? null : Math.max(0, memes.reduce((t, r) => t + (enDevise(r) ?? 0), 0) - Math.abs(netDevise));
      for (const r of memes) {
        const imputee = imputer(prendre(r, g.code), paye, payeDevise);
        paye = imputee.paye;
        payeDevise = imputee.payeDevise;
      }
      continue;
    }

    if (g.mode === 'SOLDE') {
      // Le règlement du groupe se retranche du solde reporté de sa devise.
      const regle = g.lignes.reduce((t, l) => t + signe(l), 0);
      if (regle === 0) continue;
      const parDevise = duCompte.filter((r) => (r.deviseId ?? null) === devise);
      const cibles = (parDevise.length > 0 ? parDevise : duCompte.filter((r) => r.deviseId === null)).filter(
        (r) => Math.sign(signe(r)) === -Math.sign(regle),
      );
      // Une paire qui ajouterait au dû n'est pas lue (en tête).
      if (cibles.length === 0) continue;
      for (const l of g.lignes) resultat.absorbees.add(l.id);
      let paye = Math.abs(regle);
      let payeDevise = devise === null ? null : Math.abs(g.lignes.reduce((t, l) => t + (l.deviseId === devise ? Math.sign(signe(l)) * (enDevise(l) ?? 0) : 0), 0));
      for (const r of cibles) {
        const imputee = imputer(prendre(r, g.code), paye, payeDevise);
        paye = imputee.paye;
        payeDevise = imputee.payeDevise;
      }
    }
  }

  for (const [id, r] of restant) {
    const initial = Math.abs(signe(r.ligne));
    if (r.francs === initial && r.devise === enDevise(r.ligne)) continue;
    // Éteinte en francs, ou DÉNOUÉE DANS SA DEVISE · le reste en francs d'une
    // ligne en devise soldée dans sa devise est l'écart RÉALISÉ (AUDCIF
    // art. 55), jamais une dette ni une position à réévaluer · le contrôle
    // 35 le nomme, l'écart se passe sur le groupe.
    if (r.francs <= 0 || (r.devise !== null && r.devise <= 0)) {
      resultat.absorbees.add(id);
      resultat.groupeDe.set(id, r.groupe);
      continue;
    }
    const sens = Math.sign(signe(r.ligne));
    resultat.reste.set(id, { francs: (sens * r.francs) / 100, devise: r.devise === null ? null : r.devise / 100, groupe: r.groupe });
  }
  return resultat;
}
