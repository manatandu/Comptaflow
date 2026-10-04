import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { montant } from '../lib/montants';
import type { Journal } from '../lib/types';
import { Aide } from './chrome/Aide';
import { conversionAffichee, dejaReevalue, produitCoefficients, type BaseCoefficient } from '../lib/coefficient-reevaluation';

/**
 * LA RÉÉVALUATION DES IMMOBILISATIONS (lot 14) · AUDCIF art. 35, 62 à 65,
 * Titre VIII ch. 28 ; SYCEBNL Partie 3 ch. 1 § 2.1.1.3. Une opération sur
 * L'ENSEMBLE des immobilisations corporelles et financières du dossier, à la
 * clôture de l'exercice. Le serveur tient tous les refus (périmètre entier,
 * valeur actuelle, coefficient, dotation passée avant, comptes du référentiel)
 * et calcule seul les valeurs · l'écran pose les questions et montre ce qui
 * a été fait.
 */

interface BienPerimetre {
  id: string;
  designation: string;
  numeroCompte: string;
  nature: 'CORPORELLE' | 'FINANCIERE' | null;
  valeurOrigine: number;
  cumulAmortissements: number;
  cumulDepreciation: number;
  valeurNette: number;
  bloquant: string | null;
  /** Inscrit au 2x9 à la date de la réévaluation · réévalué à ce compte (ch. 28 § 1.2). */
  enCours?: boolean;
  /** Coefficients retenus des réévaluations antérieures, déjà dans la valeur nette (ch. 28 § 4.2.1.1). */
  coefficientsAnterieurs?: number[];
  motifGarde: 'RECU_DESTINE_A_LA_VENTE' | 'ELEMENT_MONETAIRE' | 'DEPRECIE' | 'VALEUR_NETTE_NULLE' | null;
}
interface LigneLue {
  id: string;
  immobilisation: { id: string; designation: string };
  valeurNetteAvant: string | number;
  /** Légale · le coefficient appliqué à la valeur nette inscrite (après conversion). */
  coefficient: string | number | null;
  coefficientRetenu: string | number;
  valeurReevaluee: string | number;
  ecart: string | number;
  compteEcart: string | null;
  motifNonReevalue: string | null;
}
interface Perimetre {
  referentiel: 'SYCEBNL' | 'SYSCOHADA';
  dateReevaluation: string;
  exerciceClos: boolean;
  biens: BienPerimetre[];
  tronque: boolean;
  reevaluation: null | {
    type: 'LEGALE' | 'LIBRE';
    methodeLibre: 'AJUSTEMENT' | 'ELIMINATION' | null;
    neutraliteFiscale: boolean;
    totalEcart: string | number;
    decision: string;
    lignes: LigneLue[];
  };
}
interface PropositionReprise {
  lignes: Array<{
    ligneId: string;
    immobilisation: { designation: string };
    dotation: number | null;
    /** Produit des k' des réévaluations postérieures du bien, retranchées (ch. 28 § 4.2.4.2, reprise chaînée). */
    produitPosterieur?: number;
    resteProvision: number;
    montant: number;
    motif: string | null;
  }>;
  /** Biens sortis à la clôture · nommés, jamais proposés (ch. 28 § 4.2.4.2 et § 6). */
  sortis?: Array<{ ligneId: string; immobilisation: { designation: string }; resteProvision: number; motif: string }>;
  total: number;
  tronque: boolean;
  dejaPassee: { montant: number } | null;
}
interface Categorie {
  cle: string;
  libelle: string;
  coefficient: string;
  /** Exigée d'une catégorie dont un bien est déjà réévalué, sans défaut. */
  base: '' | BaseCoefficient;
  source: string;
}
interface Saisie {
  categorie: string;
  valeurActuelle: string;
  droitDeReprise: '' | 'oui' | 'non';
}

const dateCourte = (d: string) => new Date(d).toLocaleDateString('fr-FR', { timeZone: 'UTC' });

export function ReevaluationImmobilisations({
  exerciceId,
  journaux,
  onFait,
  onImprimerDeclaration,
  preparationDeclaration = false,
}: {
  exerciceId: string | undefined;
  journaux: Journal[];
  onFait: () => void;
  /** Ligne A15 · imprime les éléments de la déclaration spéciale (loi n° 23/053, art. 136 et 137). */
  onImprimerDeclaration?: () => void;
  preparationDeclaration?: boolean;
}) {
  const { peutEcrire } = useAuth();
  // null tant que rien n'est lu · « aucun bien » ne se dit que sur une liste lue.
  const [perimetre, setPerimetre] = useState<Perimetre | null>(null);
  const [reprise, setReprise] = useState<PropositionReprise | null>(null);
  const [erreurLecture, setErreurLecture] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [type, setType] = useState<'' | 'LEGALE' | 'LIBRE'>('');
  const [methode, setMethode] = useState<'' | 'AJUSTEMENT' | 'ELIMINATION'>('');
  const [neutralite, setNeutralite] = useState(false);
  const [decision, setDecision] = useState('');
  const [traitementFiscal, setTraitementFiscal] = useState('');
  const [methodeEvaluation, setMethodeEvaluation] = useState('');
  const [categories, setCategories] = useState<Categorie[]>([{ cle: 'C1', libelle: '', coefficient: '', base: '', source: '' }]);
  const [saisies, setSaisies] = useState<Record<string, Saisie>>({});
  // Choix unique présélectionné · le journal des opérations diverses, à défaut le premier.
  const [journalId, setJournalId] = useState(() => journaux.find((j) => j.code === 'OD')?.id ?? journaux[0]?.id ?? '');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const charger = () => {
    if (!exerciceId) return;
    const q = encodeURIComponent(exerciceId);
    setErreurLecture(null);
    // Deux lectures indépendantes · elles partent ensemble.
    Promise.all([
      api.get<Perimetre>(`/immobilisations/reevaluation-bilan?exerciceId=${q}`),
      api.get<PropositionReprise>(`/immobilisations/reevaluation-bilan/reprise-provision?exerciceId=${q}`),
    ])
      .then(([p, r]) => {
        setPerimetre(p);
        setReprise(r);
      })
      .catch((err) => setErreurLecture(err instanceof ApiError ? err.message : 'Réévaluation illisible'));
  };
  useEffect(charger, [exerciceId]);
  useEffect(() => {
    if (!journalId && journaux.length > 0) setJournalId(journaux.find((j) => j.code === 'OD')?.id ?? journaux[0].id);
  }, [journaux, journalId]);

  // LA LECTURE EST POUR TOUS · une réévaluation enregistrée change la valeur
  // de chaque bien, et le lecteur seul doit la voir. Seuls les gestes
  // (réévaluer, passer la reprise) se lisent sur `peutEcrire`, comme les
  // autres opérations de la fenêtre · le gestionnaire de paie, que
  // `peutEcrire` compte aussi, n'ouvre pas la fenêtre Immobilisations
  // (`fenetreOuverteAuRole`), et le serveur refuse de toute façon.

  const saisieDe = (id: string): Saisie => saisies[id] ?? { categorie: '', valeurActuelle: '', droitDeReprise: '' };
  const poser = (id: string, champ: keyof Saisie, valeur: string) =>
    setSaisies((s) => ({ ...s, [id]: { ...saisieDe(id), [champ]: valeur } }));
  // Une seule catégorie déclarée · elle vaut pour tous les biens sans autre choix.
  const categorieDe = (id: string) => saisieDe(id).categorie || (categories.length === 1 ? categories[0].cle : '');
  const sycebnl = perimetre?.referentiel === 'SYCEBNL';
  // Un bien déjà réévalué · la base du coefficient se déclare (serveur, `coefficientApplique`).
  const avecAnterieurs = (perimetre?.biens ?? []).some((b) => dejaReevalue(b.coefficientsAnterieurs));

  const envoyer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exerciceId || !perimetre) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await api.post<{ totalEcart: number }>('/immobilisations/reevaluation-bilan', {
        exerciceId,
        journalId,
        type,
        ...(type === 'LIBRE' && methode ? { methodeLibre: methode } : {}),
        ...(type === 'LEGALE' ? { neutraliteFiscale: neutralite } : {}),
        decision,
        traitementFiscal,
        methodeEvaluation,
        ...(type === 'LEGALE'
          ? {
              categories: categories.map((c) => ({
                cle: c.cle,
                libelle: c.libelle,
                coefficient: Number(c.coefficient),
                ...(c.base ? { base: c.base } : {}),
                source: c.source,
              })),
            }
          : {}),
        lignes: perimetre.biens.map((b) => {
          const s = saisieDe(b.id);
          return {
            immobilisationId: b.id,
            ...(type === 'LEGALE' && categorieDe(b.id) ? { categorie: categorieDe(b.id) } : {}),
            ...(s.valeurActuelle !== '' ? { valeurActuelle: Number(s.valeurActuelle) } : {}),
            ...(sycebnl && s.droitDeReprise ? { droitDeReprise: s.droitDeReprise === 'oui' } : {}),
          };
        }),
      });
      setInfo(`Réévaluation enregistrée · écart total ${montant(r.totalEcart)}.`);
      setOuvert(false);
      charger();
      onFait();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Réévaluation refusée');
    } finally {
      setEnvoi(false);
    }
  };

  const passerReprise = async () => {
    if (!exerciceId) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await api.post<{ montant: number }>('/immobilisations/reevaluation-bilan/reprise-provision', { exerciceId, journalId });
      setInfo(`Reprise de la provision spéciale passée · ${montant(r.montant)}.`);
      charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Reprise refusée');
    } finally {
      setEnvoi(false);
    }
  };

  const champ = 'border border-border px-1.5 py-0.5 text-[11.5px]';
  const existante = perimetre?.reevaluation ?? null;
  return (
    <div className="border border-border bg-surface shadow-posee max-w-[1180px] mt-3" data-reevaluation>
      <div className="px-3.5 py-1.5 bg-chrome border-b border-border text-[11.5px] font-semibold text-text-dim flex items-center gap-1.5">
        Réévaluation des immobilisations
        <Aide
          titre="Réévaluation des immobilisations"
          texte={
            "La réévaluation porte sur l'ENSEMBLE des immobilisations corporelles et financières, à la date de clôture de l'exercice ; toute réévaluation partielle est interdite. " +
            "Légale · la valeur nette multipliée par le coefficient de la catégorie, fixé par arrêté du Ministre des Finances (déclaré avec sa source), plafonnée par la valeur actuelle (k' = valeur actuelle ÷ valeur nette). Libre · la valeur actuelle. " +
            "Le coefficient multiplie la valeur nette INSCRITE à la clôture, qui porte déjà les réévaluations antérieures du bien. Le texte ne dit pas ce que mesure le coefficient de l'arrêté · quand un bien est déjà réévalué, déclarez pour sa catégorie s'il court depuis l'acquisition (il est alors divisé par les coefficients déjà appliqués au bien, division montrée ligne à ligne) ou depuis la dernière réévaluation (appliqué tel quel). Le plafond par la valeur actuelle joue ensuite. " +
            "Valeur brute et amortissements sont multipliés par le coefficient retenu ; en libre, la méthode 2 élimine les amortissements et inscrit la valeur réévaluée comme nouvelle valeur brute, amortie sur les annuités restantes. " +
            "L'écart va au 1061 (légale) ou au 1062 (libre) au SYSCOHADA ; au SYCEBNL, au 1061 pour un bien sans droit de reprise, au 1062 avec. Si la loi fiscale impose la neutralité, une réévaluation légale crédite le 154 pour les biens amortissables (l'écart d'un terrain ou d'un titre reste au 106), repris au 861 à chaque clôture du supplément de dotation ; cette reprise neutralise déjà le supplément, qui ne se réintègre pas une seconde fois. " +
            "La case est décochée par défaut, l'écart allant alors au 106 · la loi n° 23/053, art. 133, inscrit l'écart au compte « écart de réévaluation » des capitaux propres et obtient la neutralité « par une réintégration dans les bénéfices » ; cocher la case suit l'exception de l'Acte uniforme (154 au lieu du 1061, Titre VIII ch. 28 § 4.2.4.1), lecture retenue par le séminaire du CPCC. " +
            "Un bien déprécié reste à sa valeur nette. La dotation de l'exercice se passe avant. Une perte de valeur ultérieure s'impute d'abord sur l'écart. " +
            "La décision des organes de gestion indique la méthode, les postes, les montants et le traitement fiscal de l'écart. Déclaration spéciale à déposer au plus tard le 30 avril ; la plus-value peut supporter un prélèvement libératoire de 20 % (libre) ou 5 % (légale) dans le cas prévu par la loi, non calculé ici."
          }
          source="AUDCIF art. 35, 62 à 65 ; Titre VIII ch. 28, ch. 12 § 2.5, ch. 16 § 2.6 ; SYCEBNL Partie 3 ch. 1 § 2.1.1.3 ; loi n° 23/053, art. 129 à 138"
        />
        {existante && onImprimerDeclaration && (
          <button
            type="button"
            disabled={preparationDeclaration}
            onClick={onImprimerDeclaration}
            title="Éléments de la déclaration spéciale, par catégorie d'immobilisations · le modèle des imprimés du CPCC n'est pas au corpus"
            className="ml-auto border border-border-dark bg-surface text-[11px] font-semibold px-2.5 py-0.5 disabled:opacity-50"
          >
            {preparationDeclaration ? '…' : 'Déclaration spéciale'}
          </button>
        )}
        {peutEcrire && !ouvert && perimetre && !existante && !perimetre.exerciceClos && perimetre.biens.length > 0 && (
          <button type="button" onClick={() => setOuvert(true)} className="ml-auto bg-sel text-white text-[11px] font-semibold px-2.5 py-0.5">
            Réévaluer
          </button>
        )}
      </div>
      {erreurLecture && <div className="px-3.5 py-1.5 text-[11.5px] text-danger">{erreurLecture}</div>}
      {erreur && <div className="px-3.5 py-1.5 text-[11.5px] text-danger">{erreur}</div>}
      {info && <div className="px-3.5 py-1.5 text-[11.5px]">{info}</div>}
      {!exerciceId ? (
        <div className="px-3.5 py-1.5 text-[11.5px] text-text-dim">Choisissez d’abord un exercice.</div>
      ) : perimetre === null ? (
        erreurLecture ? null : <div className="px-3.5 py-1.5 text-[11.5px] text-text-dim">…</div>
      ) : existante ? (
        <div className="px-3.5 py-2 text-[11.5px]">
          <div className="mb-1">
            Réévaluation {existante.type === 'LEGALE' ? 'légale' : 'libre'}
            {existante.methodeLibre === 'ELIMINATION' ? ' (élimination des amortissements)' : ''}
            {existante.neutraliteFiscale ? ' · provision spéciale' : ''} au {dateCourte(perimetre.dateReevaluation)} · écart total{' '}
            {montant(existante.totalEcart)} · {existante.decision}
          </div>
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left">Bien</th>
                <th className="text-right">Valeur nette avant</th>
                <th className="text-right">Coefficient appliqué</th>
                <th className="text-right">Coefficient retenu</th>
                <th className="text-right">Valeur réévaluée</th>
                <th className="text-right">Écart</th>
                <th className="text-left">Compte</th>
                <th className="text-left">Observation</th>
              </tr>
            </thead>
            <tbody>
              {existante.lignes.map((l) => (
                <tr key={l.id}>
                  <td>{l.immobilisation.designation}</td>
                  <td className="text-right">{montant(l.valeurNetteAvant)}</td>
                  <td className="text-right">{l.coefficient === null ? '·' : Number(l.coefficient).toFixed(6)}</td>
                  <td className="text-right">{Number(l.coefficientRetenu).toFixed(4)}</td>
                  <td className="text-right">{montant(l.valeurReevaluee)}</td>
                  <td className="text-right">{montant(l.ecart)}</td>
                  <td>{l.compteEcart ?? '·'}</td>
                  <td className="text-text-dim">{l.motifNonReevalue ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : perimetre.biens.length === 0 ? (
        <div className="px-3.5 py-1.5 text-[11.5px] text-text-dim">
          Aucune immobilisation corporelle ou financière en service à la clôture de l’exercice · rien à réévaluer.
        </div>
      ) : !ouvert || !peutEcrire ? (
        <div className="px-3.5 py-1.5 text-[11.5px] text-text-dim">
          {perimetre.biens.length} bien(s) dans le périmètre{perimetre.exerciceClos ? ' · exercice clôturé' : ''}.
        </div>
      ) : (
        <form onSubmit={(e) => void envoyer(e)} className="px-3.5 py-2 flex flex-col gap-2 text-[11.5px]">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col">
              Nature
              <select required value={type} onChange={(e) => setType(e.target.value as typeof type)} className={champ}>
                <option value="">·</option>
                <option value="LEGALE">Légale</option>
                <option value="LIBRE">Libre</option>
              </select>
            </label>
            {type === 'LIBRE' && (
              <label className="flex flex-col">
                Méthode
                <select required value={methode} onChange={(e) => setMethode(e.target.value as typeof methode)} className={champ}>
                  <option value="">·</option>
                  <option value="AJUSTEMENT">Ajustement des amortissements</option>
                  <option value="ELIMINATION">Élimination des amortissements</option>
                </select>
              </label>
            )}
            {type === 'LEGALE' && (
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={neutralite} onChange={(e) => setNeutralite(e.target.checked)} />
                Neutralité fiscale imposée (provision spéciale)
              </label>
            )}
            <label className="flex flex-col">
              Journal
              <select required value={journalId} onChange={(e) => setJournalId(e.target.value)} className={champ}>
                {journaux.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.code} · {j.intitule}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col">
              Décision des organes de gestion
              <input required value={decision} onChange={(e) => setDecision(e.target.value)} className={`${champ} w-64`} />
            </label>
            <label className="flex flex-col">
              Méthode d’évaluation
              <input required value={methodeEvaluation} onChange={(e) => setMethodeEvaluation(e.target.value)} className={`${champ} w-64`} />
            </label>
            <label className="flex flex-col">
              Traitement fiscal de l’écart
              <input required value={traitementFiscal} onChange={(e) => setTraitementFiscal(e.target.value)} className={`${champ} w-64`} />
            </label>
          </div>
          {type === 'LEGALE' && (
            <div>
              <div className="font-semibold text-text-dim">Coefficients par catégorie</div>
              <div className="text-text-dim">Appliqués à la valeur nette inscrite à la clôture, réévaluations antérieures comprises.</div>
              {categories.map((c, i) => (
                <div key={c.cle} className="flex flex-wrap items-end gap-2 mt-1">
                  <label className="flex flex-col">
                    Catégorie
                    <input
                      required
                      value={c.libelle}
                      onChange={(e) => setCategories((cs) => cs.map((x, j) => (j === i ? { ...x, libelle: e.target.value } : x)))}
                      className={`${champ} w-48`}
                    />
                  </label>
                  <label className="flex flex-col">
                    Coefficient
                    <input
                      required
                      type="number"
                      min={0}
                      step="0.000001"
                      value={c.coefficient}
                      onChange={(e) => setCategories((cs) => cs.map((x, j) => (j === i ? { ...x, coefficient: e.target.value } : x)))}
                      className={`${champ} w-24`}
                    />
                  </label>
                  {avecAnterieurs && (
                    <label className="flex flex-col">
                      Base du coefficient
                      <select
                        aria-label={`Base du coefficient · ${c.libelle || 'catégorie'}`}
                        value={c.base}
                        onChange={(e) => setCategories((cs) => cs.map((x, j) => (j === i ? { ...x, base: e.target.value as Categorie['base'] } : x)))}
                        className={champ}
                      >
                        <option value="">·</option>
                        <option value="ORIGINE">Depuis l’acquisition</option>
                        <option value="DERNIERE_REEVALUATION">Depuis la dernière réévaluation</option>
                      </select>
                    </label>
                  )}
                  <label className="flex flex-col">
                    Source du coefficient
                    <input
                      required
                      value={c.source}
                      onChange={(e) => setCategories((cs) => cs.map((x, j) => (j === i ? { ...x, source: e.target.value } : x)))}
                      className={`${champ} w-64`}
                    />
                  </label>
                  {categories.length > 1 && (
                    <button type="button" onClick={() => setCategories((cs) => cs.filter((_, j) => j !== i))} className="text-text-dim">
                      Retirer
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setCategories((cs) => [...cs, { cle: `C${cs.length + 1}-${Date.now()}`, libelle: '', coefficient: '', base: '', source: '' }])}
                className="text-sel hover:underline mt-1"
              >
                Ajouter une catégorie
              </button>
            </div>
          )}
          {perimetre.tronque && <div className="text-danger">Le périmètre dépasse la limite de lecture · l’opération sera refusée.</div>}
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left">Bien</th>
                <th className="text-left">Compte</th>
                <th className="text-right">Valeur nette</th>
                {type === 'LEGALE' && <th className="text-left">Catégorie</th>}
                {type === 'LEGALE' && avecAnterieurs && <th className="text-right">Coefficients déjà appliqués</th>}
                {type === 'LEGALE' && <th className="text-right">Coefficient appliqué</th>}
                <th className="text-right">Valeur actuelle</th>
                {sycebnl && <th className="text-left">Droit de reprise</th>}
                <th className="text-left">Observation</th>
              </tr>
            </thead>
            <tbody>
              {perimetre.biens.map((b) => {
                const s = saisieDe(b.id);
                const cat = categories.find((c) => c.cle === categorieDe(b.id));
                const conversion =
                  type === 'LEGALE' && cat && cat.coefficient !== ''
                    ? conversionAffichee({ coefficient: Number(cat.coefficient), base: cat.base, anterieurs: b.coefficientsAnterieurs })
                    : null;
                return (
                  <tr key={b.id}>
                    <td>{b.designation}</td>
                    <td>{b.numeroCompte}</td>
                    <td className="text-right">{montant(b.valeurNette)}</td>
                    {type === 'LEGALE' && (
                      <td>
                        <select value={categorieDe(b.id)} onChange={(e) => poser(b.id, 'categorie', e.target.value)} className={champ}>
                          <option value="">·</option>
                          {categories.map((c) => (
                            <option key={c.cle} value={c.cle}>
                              {c.libelle || 'Sans nom'}
                            </option>
                          ))}
                        </select>
                      </td>
                    )}
                    {type === 'LEGALE' && avecAnterieurs && (
                      <td className="text-right">
                        {dejaReevalue(b.coefficientsAnterieurs)
                          ? produitCoefficients(b.coefficientsAnterieurs).toLocaleString('fr-FR', { maximumFractionDigits: 6 })
                          : '·'}
                      </td>
                    )}
                    {type === 'LEGALE' && (
                      <td className={`text-right ${conversion?.manque ? 'text-danger' : ''}`} data-coefficient-applique>
                        {conversion?.texte ?? '·'}
                      </td>
                    )}
                    <td className="text-right">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        aria-label={`Valeur actuelle · ${b.designation}`}
                        value={s.valeurActuelle}
                        onChange={(e) => poser(b.id, 'valeurActuelle', e.target.value)}
                        className={`${champ} w-36 text-right`}
                      />
                    </td>
                    {sycebnl && (
                      <td>
                        <select
                          aria-label={`Droit de reprise · ${b.designation}`}
                          value={s.droitDeReprise}
                          onChange={(e) => poser(b.id, 'droitDeReprise', e.target.value)}
                          className={champ}
                        >
                          <option value="">·</option>
                          <option value="non">Sans droit de reprise</option>
                          <option value="oui">Avec droit de reprise</option>
                        </select>
                      </td>
                    )}
                    <td className={b.bloquant ? 'text-danger' : 'text-text-dim'}>
                      {b.bloquant ??
                        (b.motifGarde === 'RECU_DESTINE_A_LA_VENTE'
                          ? 'Reçu et destiné à la vente · gardé à sa valeur'
                          : b.motifGarde === 'ELEMENT_MONETAIRE'
                          ? 'Élément monétaire · gardé à sa valeur'
                          : b.enCours
                          ? 'En cours · réévalué à son compte en cours'
                          : b.motifGarde === 'DEPRECIE'
                          ? 'Déprécié · gardé à sa valeur nette'
                          : b.motifGarde === 'VALEUR_NETTE_NULLE'
                            ? 'Valeur nette nulle'
                            : '')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex gap-2">
            <button type="submit" disabled={envoi || !type} className="bg-sel text-white text-[11.5px] font-semibold px-3 py-1.5 disabled:opacity-50">
              {envoi ? '…' : 'Enregistrer la réévaluation'}
            </button>
            <button type="button" onClick={() => setOuvert(false)} className="text-[11.5px] font-semibold text-text-dim px-3 py-1.5">
              Annuler
            </button>
          </div>
        </form>
      )}
      {reprise && (reprise.lignes.length > 0 || (reprise.sortis ?? []).length > 0) && (
        <div className="px-3.5 py-2 text-[11.5px] border-t border-border">
          <div className="font-semibold text-text-dim mb-1">Reprise de la provision spéciale de l’exercice</div>
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left">Bien</th>
                <th className="text-right">Dotation de l’exercice</th>
                <th className="text-right">Provision restante</th>
                <th className="text-right">Reprise proposée</th>
                <th className="text-left">Observation</th>
              </tr>
            </thead>
            <tbody>
              {reprise.lignes.map((l) => (
                <tr key={l.ligneId}>
                  <td>{l.immobilisation.designation}</td>
                  <td className="text-right">{montant(l.dotation)}</td>
                  <td className="text-right">{montant(l.resteProvision)}</td>
                  <td className="text-right">{montant(l.montant)}</td>
                  <td
                    className="text-text-dim"
                    title={
                      !l.motif && (l.produitPosterieur ?? 1) > 1 + 1e-9
                        ? `Dotation ÷ ${(l.produitPosterieur ?? 1).toLocaleString('fr-FR', { maximumFractionDigits: 6 })} (réévaluations suivantes du bien), puis × (1 − 1/k')`
                        : undefined
                    }
                  >
                    {l.motif ?? ((l.produitPosterieur ?? 1) > 1 + 1e-9 ? 'Part de cette réévaluation' : '')}
                  </td>
                </tr>
              ))}
              {(reprise.sortis ?? []).map((l) => (
                <tr key={l.ligneId}>
                  <td>{l.immobilisation.designation}</td>
                  <td className="text-right">{montant(null)}</td>
                  <td className="text-right">{montant(l.resteProvision)}</td>
                  <td className="text-right">{montant(null)}</td>
                  <td className="text-text-dim" title={l.motif}>
                    Bien sorti · non proposé
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {reprise.dejaPassee ? (
            <div className="mt-1">Reprise de l’exercice déjà passée · {montant(reprise.dejaPassee.montant)}.</div>
          ) : reprise.total > 0 && peutEcrire ? (
            <button type="button" disabled={envoi} onClick={() => void passerReprise()} className="mt-1 bg-sel text-white text-[11px] font-semibold px-2.5 py-0.5">
              Passer la reprise · {montant(reprise.total)}
            </button>
          ) : reprise.total > 0 ? (
            <div className="mt-1">Reprise proposée · {montant(reprise.total)}.</div>
          ) : (
            <div className="mt-1 text-text-dim">Aucun supplément de dotation à reprendre sur cet exercice.</div>
          )}
        </div>
      )}
    </div>
  );
}
