/**
 * PÉRIMÈTRE DE CONSOLIDATION · tranche 1 du plan (item 14, décision du
 * 2026-09-24). Moteur PUR : il reçoit les entités, leurs liens de
 * participation et ce que le cabinet a déclaré, et rend pour chaque entité son
 * pourcentage de contrôle, son pourcentage d'intérêt et sa méthode, plus
 * l'obligation de consolider et ses dispenses. Aucun montant n'est consolidé
 * ici · c'est la tranche 2.
 *
 * SOURCES, toutes lues le 2026-09-24 · AUDCIF, Titre II, art. 74 à 98
 * (`audcif-acte-uniforme/references/titre-2-consolidation-combinaison.md`) et
 * D4C, Titre XII, ch. XII-1, XII-2 et XII-5 § 3 (`titre-12-13-d4c-*`).
 * SYSCOHADA seulement · l'art. 3 du SYCEBNL écarte les art. 73 à 113.
 */

export type MethodeConsolidation = 'IG' | 'IP' | 'ME' | 'NC' | 'EXCLUE';

export type NatureControle = 'EXCLUSIF_DE_DROIT' | 'EXCLUSIF_DE_FAIT' | 'EXCLUSIF_CONTRACTUEL' | 'CONJOINT' | 'INFLUENCE_NOTABLE' | 'AUCUN';

/**
 * Art. 96 · les seules causes d'exclusion que le texte admet, chacune « justifiée
 * dans les Notes annexes ». Une liste FERMÉE · une exclusion de confort ferait
 * sortir du périmètre une filiale dont personne n'aurait à rendre compte.
 */
export type MotifExclusion =
  | 'PERTE_CONTROLE_DEMONTREE'
  | 'RESTRICTIONS_SEVERES_DURABLES'
  | 'DETENUE_EN_VUE_DE_CESSION'
  | 'INFORMATION_FRAIS_EXCESSIFS'
  | 'IMPORTANCE_NEGLIGEABLE';

export const LIBELLE_MOTIF_EXCLUSION: Record<MotifExclusion, string> = {
  PERTE_CONTROLE_DEMONTREE: 'Perte de contrôle ou de l’influence notable démontrée (art. 96, al. 1er)',
  RESTRICTIONS_SEVERES_DURABLES:
    'Restrictions sévères et durables remettant en cause substantiellement le contrôle ou le transfert de fonds (art. 96)',
  DETENUE_EN_VUE_DE_CESSION: 'Actions ou parts détenues uniquement en vue de leur cession ultérieure (art. 96)',
  INFORMATION_FRAIS_EXCESSIFS:
    'Informations impossibles à obtenir sans frais excessifs ou dans des délais compatibles (art. 96)',
  IMPORTANCE_NEGLIGEABLE: 'Importance négligeable par rapport à l’ensemble consolidé (art. 96, dernier alinéa)',
};

export interface EntitePerimetre {
  id: string;
  nom: string;
  estConsolidante: boolean;
  /**
   * CONTRÔLE DE FAIT · art. 78 : « la désignation, pendant DEUX EXERCICES
   * SUCCESSIFS, de la majorité des membres des organes d'administration ou de
   * direction », présumée au-delà de 40 % « et qu'aucun autre associé ne
   * détenait […] une fraction supérieure à la sienne ». Les deux faits sont
   * hors des livres · ils se DÉCLARENT, le pourcentage se calcule.
   */
  designationMajoriteDeuxExercices?: boolean;
  aucunAutreAssocieSuperieur?: boolean;
  /** Art. 78 · « influence dominante en vertu d'un contrat ou de clauses statutaires ». */
  controleContractuel?: boolean;
  /**
   * Art. 78 · contrôle conjoint : « un nombre limité d'associés » ET « un accord
   * contractuel qui prévoit l'exercice du contrôle conjoint ». L'accord se
   * déclare · aucun pourcentage ne le révèle.
   */
  accordControleConjoint?: boolean;
  /**
   * Art. 78 · l'influence notable peut résulter d'éléments autres que les
   * droits de vote (représentation aux organes, décisions stratégiques,
   * opérations importantes, échange de dirigeants, dépendance technique).
   */
  influenceNotableDeclaree?: boolean;
  exclusion?: { motif: MotifExclusion; justification: string } | null;
  /** Date de clôture de l'exercice de l'entité, pour l'art. 97. */
  dateCloture?: Date | null;
}

export interface LienParticipation {
  detentriceId: string;
  detenueId: string;
  /**
   * DROITS DE VOTE, pour le pourcentage de CONTRÔLE. Les actions sans droit de
   * vote en sont EXCLUES et les droits de vote doubles y sont COMPTÉS (D4C,
   * ch. XII-5 § 3 · AUSCGIE art. 752, 753, 778-1) · le cabinet saisit donc le
   * pourcentage de droits de vote, pas de capital.
   */
  pctDroitsVote: number;
  /** CAPITAL, pour le pourcentage d'INTÉRÊT (D4C, ch. XII-5 § 3). */
  pctCapital: number;
}

export interface ResultatEntite {
  id: string;
  nom: string;
  estConsolidante: boolean;
  pctControle: number;
  pctInteret: number;
  natureControle: NatureControle;
  methode: MethodeConsolidation;
  /** Pourquoi cette méthode, article à l'appui · ce que la note du périmètre demande de justifier. */
  fondement: string;
  /** Les justifications que le D4C (ch. XII-8 § 6) exige en Notes annexes pour ce cas. */
  aJustifierEnNotes: string[];
  exclusion: { motif: MotifExclusion; libelle: string; justification: string } | null;
  dateCloture: DateClotureVerdict | null;
}

export interface DateClotureVerdict {
  /** Écart en mois entiers entre les deux clôtures, en valeur absolue. */
  ecartMois: number;
  verdict: 'MEME_DATE' | 'DEROGATION_POSSIBLE' | 'ETATS_SUPPLEMENTAIRES';
  message: string;
}

const arrondi = (x: number) => Math.round(x * 10000) / 10000;

/** Seuils de l'art. 78, et ceux-là seulement. */
export const SEUIL_CONTROLE_DE_DROIT = 50; // « la majorité des droits de vote » · strictement plus de la moitié
export const SEUIL_PRESOMPTION_CONTROLE_DE_FAIT = 40; // « une fraction supérieure à quarante pour cent »
export const SEUIL_PRESOMPTION_INFLUENCE_NOTABLE = 20; // « au moins un cinquième »

/**
 * LE POURCENTAGE DE CONTRÔLE ne passe QUE par des entités contrôlées · D4C,
 * ch. XII-5 § 3 : « Le contrôle indirect n'existe que par l'intermédiaire
 * d'entités sous contrôle. » D'où un point fixe : on part de la consolidante,
 * on calcule, on ajoute au cercle ce qui devient contrôlé exclusivement, et on
 * recommence jusqu'à ce que rien ne bouge. Les votes détenus par une entité
 * sous contrôle CONJOINT ou sous influence notable ne se cumulent pas · le
 * groupe ne les dirige pas seul.
 */
export function analyserPerimetre(entites: EntitePerimetre[], liens: LienParticipation[]): ResultatEntite[] {
  const consolidante = entites.find((e) => e.estConsolidante);
  if (!consolidante) throw new Error('Le périmètre n’a pas d’entité consolidante.');
  if (entites.filter((e) => e.estConsolidante).length > 1) {
    throw new Error('Un périmètre n’a qu’une entité consolidante (art. 75).');
  }
  for (const l of liens) {
    for (const p of [l.pctDroitsVote, l.pctCapital]) {
      if (!(p >= 0 && p <= 100)) throw new Error('Un pourcentage de participation est compris entre 0 et 100.');
    }
  }
  verifierAbsenceDeCycle(entites, liens, consolidante.id);

  const nature = new Map<string, NatureControle>();
  const pctControle = new Map<string, number>();
  const controlees = new Set<string>([consolidante.id]);

  for (let tour = 0; tour <= entites.length; tour++) {
    let change = false;
    for (const e of entites) {
      if (e.estConsolidante) continue;
      const pct = arrondi(
        liens
          .filter((l) => l.detenueId === e.id && controlees.has(l.detentriceId))
          .reduce((s, l) => s + l.pctDroitsVote, 0),
      );
      pctControle.set(e.id, pct);
      const n = natureDuControle(e, pct);
      nature.set(e.id, n);
      const exclusive = n.startsWith('EXCLUSIF') && !controleRompu(e);
      if (exclusive && !controlees.has(e.id)) {
        controlees.add(e.id);
        change = true;
      }
      if (!exclusive && controlees.has(e.id)) {
        controlees.delete(e.id);
        change = true;
      }
    }
    if (!change) break;
  }

  const methodeDe = (e: EntitePerimetre): MethodeConsolidation => {
    if (e.estConsolidante) return 'IG';
    if (e.exclusion) return 'EXCLUE';
    return METHODE_PAR_NATURE[nature.get(e.id) ?? 'AUCUN'];
  };
  // UNE ENTITÉ EXCLUE N'EST PAS FORCÉMENT HORS DU GROUPE. Exclue pour importance
  // négligeable ou détenue en vue de cession, elle reste contrôlée, et une
  // sous-filiale qu'elle détient reste une participation du groupe. Seules la
  // perte de contrôle démontrée et les restrictions sévères rompent la chaîne.
  const retenues = new Set(
    entites
      .filter((e) => {
        const m = methodeDe(e);
        if (m === 'IG' || m === 'IP' || m === 'ME') return true;
        return m === 'EXCLUE' && nature.get(e.id) !== 'AUCUN' && !controleRompu(e);
      })
      .map((e) => e.id),
  );

  // LE POURCENTAGE D'INTÉRÊT · « pourcentage de participation directe MAJORÉ du
  // produit des pourcentages de participation indirecte sur toute la chaîne.
  // Plusieurs chaînes : multiplier les pourcentages de chaque chaîne, puis
  // SOMMER » (D4C, ch. XII-5 § 3). Il se lit sur le CAPITAL et ne remonte que par
  // des entités RETENUES dans le périmètre · une participation logée dans une
  // entité non consolidée n'est pas une part du groupe dans les capitaux propres
  // qu'il présente.
  const interet = new Map<string, number>([[consolidante.id, 100]]);
  const ordre = ordreTopologique(entites, liens, consolidante.id);
  for (const id of ordre) {
    if (id === consolidante.id) continue;
    const pct = liens
      .filter((l) => l.detenueId === id && (l.detentriceId === consolidante.id || retenues.has(l.detentriceId)))
      .reduce((s, l) => s + ((interet.get(l.detentriceId) ?? 0) * l.pctCapital) / 100, 0);
    interet.set(id, arrondi(pct));
  }

  return entites.map((e) => {
    const methode = methodeDe(e);
    const n = e.estConsolidante ? 'EXCLUSIF_DE_DROIT' : (nature.get(e.id) ?? 'AUCUN');
    const pc = e.estConsolidante ? 100 : (pctControle.get(e.id) ?? 0);
    return {
      id: e.id,
      nom: e.nom,
      estConsolidante: e.estConsolidante,
      pctControle: pc,
      pctInteret: interet.get(e.id) ?? 0,
      natureControle: n,
      methode,
      fondement: e.estConsolidante ? 'Entité consolidante (art. 75).' : fondementDe(n, pc, e),
      aJustifierEnNotes: e.estConsolidante ? [] : justificationsEnNotes(methode, pc),
      exclusion: e.exclusion
        ? { motif: e.exclusion.motif, libelle: LIBELLE_MOTIF_EXCLUSION[e.exclusion.motif], justification: e.exclusion.justification }
        : null,
      dateCloture:
        e.estConsolidante || !e.dateCloture || !consolidante.dateCloture || methode === 'EXCLUE' || methode === 'NC'
          ? null
          : verdictDateCloture(consolidante.dateCloture, e.dateCloture),
    };
  });
}

/** Art. 96 · les deux motifs d'exclusion qui disent que le contrôle lui-même n'est plus là. */
function controleRompu(e: EntitePerimetre): boolean {
  return e.exclusion?.motif === 'PERTE_CONTROLE_DEMONTREE' || e.exclusion?.motif === 'RESTRICTIONS_SEVERES_DURABLES';
}

const METHODE_PAR_NATURE: Record<NatureControle, MethodeConsolidation> = {
  // Art. 80 · contrôle exclusif → intégration globale ; conjoint → intégration
  // proportionnelle ; influence notable → mise en équivalence.
  EXCLUSIF_DE_DROIT: 'IG',
  EXCLUSIF_DE_FAIT: 'IG',
  EXCLUSIF_CONTRACTUEL: 'IG',
  CONJOINT: 'IP',
  INFLUENCE_NOTABLE: 'ME',
  AUCUN: 'NC',
};

function natureDuControle(e: EntitePerimetre, pct: number): NatureControle {
  if (pct > SEUIL_CONTROLE_DE_DROIT) return 'EXCLUSIF_DE_DROIT';
  if (
    pct > SEUIL_PRESOMPTION_CONTROLE_DE_FAIT &&
    e.designationMajoriteDeuxExercices === true &&
    e.aucunAutreAssocieSuperieur === true
  ) {
    return 'EXCLUSIF_DE_FAIT';
  }
  if (e.controleContractuel === true) return 'EXCLUSIF_CONTRACTUEL';
  // Le contrôle conjoint ne se présume d'aucun pourcentage · il suppose l'accord.
  if (e.accordControleConjoint === true) return 'CONJOINT';
  if (pct >= SEUIL_PRESOMPTION_INFLUENCE_NOTABLE || e.influenceNotableDeclaree === true) return 'INFLUENCE_NOTABLE';
  return 'AUCUN';
}

function fondementDe(n: NatureControle, pct: number, e: EntitePerimetre): string {
  const p = `${pct.toFixed(2)} % des droits de vote`;
  switch (n) {
    case 'EXCLUSIF_DE_DROIT':
      return `Contrôle exclusif de droit · ${p}, « la majorité des droits de vote » (art. 78) · intégration globale (art. 80).`;
    case 'EXCLUSIF_DE_FAIT':
      return `Contrôle exclusif de fait · ${p}, plus de 40 %, désignation de la majorité des organes pendant deux exercices successifs et aucun autre associé au-dessus, déclarés (art. 78) · intégration globale (art. 80).`;
    case 'EXCLUSIF_CONTRACTUEL':
      return `Contrôle exclusif contractuel · influence dominante en vertu d'un contrat ou de clauses statutaires, déclarée (art. 78) · intégration globale (art. 80).`;
    case 'CONJOINT':
      return `Contrôle conjoint · accord contractuel entre un nombre limité d'associés, déclaré (art. 78) · intégration proportionnelle (art. 80).`;
    case 'INFLUENCE_NOTABLE':
      return pct >= SEUIL_PRESOMPTION_INFLUENCE_NOTABLE
        ? `Influence notable présumée · ${p}, au moins un cinquième (art. 78) · mise en équivalence (art. 80).`
        : `Influence notable déclarée sous le seuil de présomption · ${p} (art. 78, éléments autres que les droits de vote) · mise en équivalence (art. 80).`;
    case 'AUCUN':
      return pct > SEUIL_PRESOMPTION_CONTROLE_DE_FAIT && !(e.designationMajoriteDeuxExercices && e.aucunAutreAssocieSuperieur)
        ? `${p} · au-delà de 40 %, mais le contrôle de fait suppose deux faits NON déclarés (désignation de la majorité des organes pendant deux exercices, aucun autre associé au-dessus, art. 78). Hors périmètre tant qu'ils ne le sont pas.`
        : `${p} · ni contrôle ni influence notable (art. 78) · titres non consolidés.`;
  }
}

/**
 * D4C, ch. XII-8 § 6 · « justifications » exigées dans l'information sur le
 * périmètre : « IG lorsque les droits de vote ≤ 40 % ; exclusion de l'IG lorsque
 * > 50 % ; ME lorsque < 20 % ; exclusion de la ME lorsque > 20 % ». Ce ne sont
 * PAS les seuils de l'art. 78 · le D4C le dit lui-même (« Points de
 * vigilance ») et les confondre ferait réclamer une justification à tort.
 */
function justificationsEnNotes(methode: MethodeConsolidation, pct: number): string[] {
  const j: string[] = [];
  if (methode === 'IG' && pct <= SEUIL_PRESOMPTION_CONTROLE_DE_FAIT) {
    j.push('Intégration globale avec 40 % des droits de vote ou moins · à justifier en Notes annexes (D4C, ch. XII-8 § 6).');
  }
  if (methode !== 'IG' && pct > SEUIL_CONTROLE_DE_DROIT) {
    j.push('Plus de 50 % des droits de vote sans intégration globale · à justifier en Notes annexes (D4C, ch. XII-8 § 6).');
  }
  if (methode === 'ME' && pct < SEUIL_PRESOMPTION_INFLUENCE_NOTABLE) {
    j.push('Mise en équivalence avec moins de 20 % des droits de vote · à justifier en Notes annexes (D4C, ch. XII-8 § 6).');
  }
  if ((methode === 'NC' || methode === 'EXCLUE') && pct > SEUIL_PRESOMPTION_INFLUENCE_NOTABLE) {
    j.push('Plus de 20 % des droits de vote sans mise en équivalence · à justifier en Notes annexes (D4C, ch. XII-8 § 6).');
  }
  if (methode === 'EXCLUE') {
    j.push('Toute exclusion du périmètre doit être justifiée dans les Notes annexes (art. 96).');
  }
  return j;
}

/**
 * ART. 97 · « La date de clôture […] doit être la même. Lorsqu'elles diffèrent,
 * la filiale prépare des états financiers supplémentaires » · dérogation
 * possible « si le décalage n'excède pas TROIS MOIS », avec un ajustement des
 * transactions significatives de la période intermédiaire. Le décalage se
 * compte en mois de calendrier, date à date · un décalage de trois mois et un
 * jour n'est pas « trois mois ».
 */
/**
 * Trois mois « de date à date », fin de mois comprise · du 30 septembre au
 * 31 décembre il y a trois mois, pas trois mois et un jour. Sans cette règle,
 * une filiale close au 30 septembre sous une mère close au 31 décembre, le cas
 * le plus courant, perdrait la dérogation de l'art. 97 pour un jour qui
 * n'existe pas en septembre. Et le 30 novembre ne mène pas au 2 mars.
 */
function ajouterTroisMois(d: Date): Date {
  const an = d.getUTCFullYear();
  const mois = d.getUTCMonth();
  const jour = d.getUTCDate();
  const dernierDu = (a: number, m: number) => new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
  const finDeMois = jour === dernierDu(an, mois);
  const cible = new Date(Date.UTC(an, mois + 3, 1));
  const dernierCible = dernierDu(cible.getUTCFullYear(), cible.getUTCMonth());
  return new Date(Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth(), finDeMois ? dernierCible : Math.min(jour, dernierCible)));
}

export function verdictDateCloture(mere: Date, filiale: Date): DateClotureVerdict {
  const [a, b] = mere.getTime() <= filiale.getTime() ? [mere, filiale] : [filiale, mere];
  if (a.getTime() === b.getTime()) {
    return { ecartMois: 0, verdict: 'MEME_DATE', message: 'Même date de clôture que l’entité consolidante (art. 97).' };
  }
  const troisMoisApres = ajouterTroisMois(a);
  const mois = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getTime() <= troisMoisApres.getTime()) {
    return {
      ecartMois: mois,
      verdict: 'DEROGATION_POSSIBLE',
      message:
        'Clôtures décalées de trois mois au plus · dérogation possible, avec un ajustement des comptes de la filiale pour les ' +
        'transactions et événements significatifs de la période intermédiaire (art. 97, al. 3).',
    };
  }
  return {
    ecartMois: mois,
    verdict: 'ETATS_SUPPLEMENTAIRES',
    message:
      'Clôtures décalées de plus de trois mois · la filiale prépare des états financiers supplémentaires à la date de ' +
      'clôture de la consolidante, soumis au contrôle d’un commissaire aux comptes ou d’un professionnel (art. 97).',
  };
}

function verifierAbsenceDeCycle(entites: EntitePerimetre[], liens: LienParticipation[], consolidanteId: string) {
  // Les titres d'AUTOCONTRÔLE (une filiale qui détient la consolidante) n'ont
  // « aucun impact sur le calcul des pourcentages de contrôle et d'intérêts »
  // (D4C, ch. XII-5 § 3, AUSCGIE art. 177) · ils sont ignorés, pas refusés.
  const utiles = liens.filter((l) => l.detenueId !== consolidanteId);
  const etat = new Map<string, 0 | 1 | 2>();
  const suivants = (id: string) => utiles.filter((l) => l.detentriceId === id).map((l) => l.detenueId);
  const visiter = (id: string, chemin: string[]) => {
    if (etat.get(id) === 2) return;
    if (etat.get(id) === 1) {
      const noms = [...chemin.slice(chemin.indexOf(id)), id].map((x) => entites.find((e) => e.id === x)?.nom ?? x);
      throw new Error(
        `Participations croisées entre filiales (${noms.join(' → ')}) · le calcul des pourcentages d'intérêt par ` +
          'chaînes ne se referme pas. Vérifiez les liens saisis ; les titres d’autocontrôle sur la consolidante sont, eux, ignorés.',
      );
    }
    etat.set(id, 1);
    for (const s of suivants(id)) visiter(s, [...chemin, id]);
    etat.set(id, 2);
  };
  for (const e of entites) visiter(e.id, []);
}

function ordreTopologique(entites: EntitePerimetre[], liens: LienParticipation[], consolidanteId: string): string[] {
  const utiles = liens.filter((l) => l.detenueId !== consolidanteId);
  const ordre: string[] = [];
  const vus = new Set<string>();
  const visiter = (id: string) => {
    if (vus.has(id)) return;
    vus.add(id);
    for (const l of utiles.filter((x) => x.detenueId === id)) visiter(l.detentriceId);
    ordre.push(id);
  };
  for (const e of entites) visiter(e.id);
  return ordre;
}

// ─── Obligation et dispenses ────────────────────────────────────────────────

export interface FaitsObligation {
  /** Art. 77 · la consolidante est elle-même sous le contrôle d'une entité de l'espace OHADA soumise à consolidation. */
  sousControleEntiteOhadaConsolidante?: boolean;
  /** Art. 77, 1er cas · les deux entités ont leur siège dans deux régions différentes de l'espace OHADA. */
  siegesDansDeuxRegions?: boolean;
  /** Art. 77, 2e cas et art. 75, al. 2 · appel public à l'épargne ou titres cotés. */
  appelPublicEpargne?: boolean;
  /** Art. 77, 3e cas · consolidation exigée par des associés représentant au moins le dixième du capital. */
  demandeAssociesDixieme?: boolean;
  /**
   * Art. 95 · chiffre d'affaires HORS TAXES de l'ensemble, pour chacun des deux
   * derniers exercices arrêtés, en francs congolais.
   */
  chiffreAffairesN?: number | null;
  chiffreAffairesN1?: number | null;
  /**
   * Art. 95 · le seuil est de 500 000 000 FCFA « ou l'équivalent dans l'unité
   * monétaire ayant cours légal dans l'État partie ». Aucune source lue ne fixe
   * cet équivalent en francs congolais, ni le cours à retenir · il se DÉCLARE,
   * avec sa source, et sans lui la dispense n'est pas examinée.
   */
  seuilEquivalentFc?: number | null;
  sourceSeuil?: string | null;
}

export interface VerdictObligation {
  obligation: 'OBLIGATOIRE' | 'DISPENSEE' | 'NON_REQUISE' | 'A_EXAMINER';
  motifs: string[];
  /** Art. 75, al. 2 · entité cotée ou faisant appel public à l'épargne. */
  normesIfrsRequises: boolean;
}

export const SEUIL_DISPENSE_FCFA = 500_000_000;

export function verdictObligation(resultats: ResultatEntite[], faits: FaitsObligation): VerdictObligation {
  const motifs: string[] = [];
  const controleExclusifOuConjoint = resultats.some((r) => !r.estConsolidante && (r.methode === 'IG' || r.methode === 'IP'));
  const normesIfrsRequises = faits.appelPublicEpargne === true;
  if (normesIfrsRequises) {
    motifs.push(
      'Entité cotée ou faisant appel public à l’épargne · ses états consolidés sont établis selon les normes IFRS (art. 75, al. 2), pas selon le D4C.',
    );
  }

  if (!controleExclusifOuConjoint) {
    motifs.push(
      'Aucune entité sous contrôle exclusif ou conjoint · pas d’obligation de consolider. L’influence notable seule ne l’impose pas (art. 74, al. 2).',
    );
    return { obligation: 'NON_REQUISE', motifs, normesIfrsRequises };
  }
  motifs.push('Au moins une entité sous contrôle exclusif ou conjoint · obligation d’établir et de publier des comptes consolidés (art. 74).');

  // ART. 77 · dispense de la sous-consolidante, et ses trois exceptions.
  if (faits.sousControleEntiteOhadaConsolidante === true) {
    const exceptions = [
      faits.siegesDansDeuxRegions === true ? 'sièges dans deux régions différentes de l’espace OHADA' : null,
      faits.appelPublicEpargne === true ? 'appel public à l’épargne' : null,
      faits.demandeAssociesDixieme === true ? 'consolidation exigée par des associés représentant au moins le dixième du capital' : null,
    ].filter((x): x is string => x !== null);
    if (exceptions.length === 0) {
      motifs.push(
        'La consolidante est elle-même sous le contrôle d’une entité de l’espace OHADA soumise à consolidation · dispensée (art. 77, al. 1er).',
      );
      return { obligation: 'DISPENSEE', motifs, normesIfrsRequises };
    }
    motifs.push(`Dispense de l’art. 77 écartée · ${exceptions.join(' ; ')} (art. 77, al. 2).`);
  }

  // ART. 95 · seuil de chiffre d'affaires sur deux exercices successifs.
  const { chiffreAffairesN: n, chiffreAffairesN1: n1, seuilEquivalentFc: seuil } = faits;
  if (seuil == null || !(seuil > 0)) {
    motifs.push(
      'Dispense de l’art. 95 non examinée · le seuil de 500 000 000 FCFA « ou l’équivalent dans l’unité monétaire ayant cours légal » ' +
        'n’a pas d’équivalent en francs congolais dans les sources lues. Déclarez-le, avec sa source, pour que la dispense soit examinée.',
    );
    return { obligation: 'A_EXAMINER', motifs, normesIfrsRequises };
  }
  if (n == null || n1 == null) {
    motifs.push('Dispense de l’art. 95 non examinée · il faut le chiffre d’affaires hors taxes de l’ensemble pour les DEUX derniers exercices arrêtés.');
    return { obligation: 'A_EXAMINER', motifs, normesIfrsRequises };
  }
  if (n <= seuil && n1 <= seuil) {
    motifs.push(
      `Chiffre d’affaires de l’ensemble sous le seuil pendant deux exercices successifs (${n1} puis ${n} FC, seuil déclaré ${seuil} FC` +
        `${faits.sourceSeuil ? `, source : ${faits.sourceSeuil}` : ''}) · dispensée (art. 95).`,
    );
    return { obligation: 'DISPENSEE', motifs, normesIfrsRequises };
  }
  motifs.push(`Chiffre d’affaires de l’ensemble au-dessus du seuil déclaré sur au moins un des deux exercices · la dispense de l’art. 95 ne joue pas.`);
  return { obligation: 'OBLIGATOIRE', motifs, normesIfrsRequises };
}
