import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useExercice } from '../lib/exercice';
import { useAuth } from '../lib/auth';
import type {
  CatalogueOperations,
  EcritureProposee,
  Journal,
  ModeleEcriture,
  OperationSpecifique,
} from '../lib/types';

/**
 * ÉCRITURES-TYPES DES OPÉRATIONS SPÉCIFIQUES AUX EBNL
 * Partie 3 du référentiel SYCEBNL et les 22 cas chiffrés du Guide.
 *
 * L'écran affiche l'écriture AVANT de l'enregistrer. Ce n'est pas un confort :
 * une écriture-type impute sur des comptes que l'utilisateur n'a pas choisis,
 * et la lui faire signer sans la lui montrer reviendrait à lui faire valider
 * une imputation à l'aveugle. Les montants sont recalculés à chaque frappe.
 *
 * Trois choses que l'écran remonte telles quelles, sans les lisser :
 *  - la SOURCE de chaque modèle (article, chapitre, application du Guide) ;
 *  - les ANOMALIES du texte officiel, quand le modèle en rencontre une ;
 *  - les POLITIQUES que le texte laisse au dossier — le logiciel les pose,
 *    il ne les tranche pas.
 */
export function OperationsSpecifiquesPage() {
  const { exerciceCourant } = useExercice();
  const { utilisateur } = useAuth();
  const peutSaisir = utilisateur?.role === 'ADMIN_CABINET' || utilisateur?.role === 'COMPTABLE';

  const [catalogue, setCatalogue] = useState<CatalogueOperations | null>(null);
  const [journaux, setJournaux] = useState<Journal[]>([]);
  const [codeModele, setCodeModele] = useState<string | null>(null);
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const [choix, setChoix] = useState<Record<string, string>>({});
  const [proposition, setProposition] = useState<EcritureProposee | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [journalId, setJournalId] = useState('');
  const [date, setDate] = useState('');
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    api.get<CatalogueOperations>('/operations-specifiques').then(setCatalogue, (e) => setErreur(e.message));
    api.get<Journal[]>('/journaux').then((j) => {
      setJournaux(j);
      setJournalId((v) => v || j.find((x) => x.estActif)?.id || '');
    }, () => {});
  }, []);

  const toutes = useMemo(
    () => [...(catalogue?.operations ?? []), ...(catalogue?.operationsAutreJeu ?? [])],
    [catalogue],
  );
  const paire = useMemo(() => {
    for (const o of toutes) {
      const m = o.modeles.find((x) => x.code === codeModele);
      if (m) return { operation: o, modele: m };
    }
    return null;
  }, [toutes, codeModele]);

  /**
   * Recalcule la proposition à chaque changement. Le serveur reste seul maître
   * du calcul : refaire ici la résolution des comptes et le complément
   * donnerait deux implémentations d'une même règle, qui divergeraient.
   */
  useEffect(() => {
    if (!paire) return setProposition(null);
    const parametres: Record<string, number> = {};
    for (const p of paire.modele.parametres) {
      const brut = valeurs[p.nom];
      const v = brut === undefined || brut === '' ? p.defaut : Number(brut.replace(',', '.'));
      if (v !== undefined && !Number.isNaN(v)) parametres[p.nom] = v;
    }
    if (Object.keys(parametres).length < paire.modele.parametres.length) return setProposition(null);

    let annule = false;
    api
      .post<EcritureProposee>('/operations-specifiques/proposition', {
        codeModele: paire.modele.code, parametres, comptesChoisis: choix,
      })
      .then(
        (p) => !annule && (setProposition(p), setErreur(null)),
        (e) => !annule && (setProposition(null), setErreur(e instanceof ApiError ? e.message : String(e))),
      );
    return () => { annule = true; };
  }, [paire, valeurs, choix]);

  const choisirModele = (m: ModeleEcriture) => {
    setCodeModele(m.code);
    setProposition(null);
    setSucces(null);
    setErreur(null);
    setChoix({});
    // Les valeurs par défaut du référentiel (taux, durées) sont pré-remplies :
    // le texte les fixe, l'utilisateur n'a qu'à les confirmer.
    setValeurs(Object.fromEntries(m.parametres.filter((p) => p.defaut !== undefined).map((p) => [p.nom, String(p.defaut)])));
  };

  const appliquer = async () => {
    if (!paire || !exerciceCourant || !proposition) return;
    setErreur(null);
    setEnCours(true);
    try {
      const parametres = Object.fromEntries(
        paire.modele.parametres.map((p) => [p.nom, Number((valeurs[p.nom] ?? String(p.defaut ?? '')).replace(',', '.'))]),
      );
      const e = await api.post<{ numeroPiece: number | null }>('/operations-specifiques/application', {
        codeModele: paire.modele.code, parametres, comptesChoisis: choix,
        exerciceId: exerciceCourant.id, journalId, date,
      });
      setSucces(`Écriture enregistrée${e.numeroPiece ? ` — pièce n° ${e.numeroPiece}` : ''}.`);
      setValeurs({});
      setProposition(null);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Impossible d'enregistrer l'écriture");
    } finally {
      setEnCours(false);
    }
  };

  const montant = (v: number) => v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const blocOperations = (liste: OperationSpecifique[], titre: string, attenue = false) => (
    <>
      <div className="px-3 py-1.5 bg-chrome border-b border-border text-[10px] font-bold text-text-dim sticky top-0">{titre}</div>
      {liste.map((o) => (
        <div key={o.code} className={`border-b border-border last:border-b-0 ${attenue ? 'opacity-70' : ''}`}>
          <div className="px-3 py-1.5">
            <div className="text-[11.5px] font-semibold">
              <span className="font-mono text-text-dim mr-1.5">{o.code}</span>
              {o.libelle}
            </div>
            <div className="text-[10px] text-text-dim">{o.source}</div>
          </div>
          {o.modeles.map((m) => (
            <button
              key={m.code}
              onClick={() => choisirModele(m)}
              className={`w-full text-left px-3 py-1 text-[11px] border-t border-border ${
                codeModele === m.code ? 'bg-sel-soft font-semibold' : 'hover:bg-surface-alt'
              }`}
            >
              {m.libelle}
              {m.anomalie && <span className="text-danger" title="Anomalie du texte officiel"> ⚠</span>}
            </button>
          ))}
        </div>
      ))}
    </>
  );

  return (
    <div className="p-2.5">
      <div className="flex items-center justify-between mb-2.5">
        <h1 className="text-[15px] font-bold">Opérations spécifiques aux EBNL</h1>
        {exerciceCourant && (
          <span className="font-mono text-[11px] border border-border bg-surface px-2.5 py-1.5">
            Exercice {new Date(exerciceCourant.dateDebut).getFullYear()}
          </span>
        )}
      </div>

      <p className="text-[10.5px] text-text-dim mb-2">
        Écritures-types de la <strong>Partie 3</strong> du référentiel SYCEBNL, éprouvées contre les{' '}
        <strong>cas chiffrés du Guide d’application</strong>. Les comptes et les sens sont fixés par le texte ; seuls
        les montants varient. L’écriture est affichée avant d’être enregistrée.
      </p>

      {erreur && (
        <div className="flex items-start justify-between gap-3 border border-danger/30 bg-danger-soft px-3.5 py-2 mb-2.5">
          <span className="text-[11.5px]">{erreur}</span>
          <button onClick={() => setErreur(null)} className="text-[11px] font-bold shrink-0 hover:underline">Fermer</button>
        </div>
      )}
      {succes && (
        <div className="border border-positive/40 bg-positive-soft px-3.5 py-2 mb-2.5 text-[11.5px]">{succes}</div>
      )}

      <div className="flex gap-3 items-start">
        <div className="w-[380px] shrink-0 border border-border bg-surface max-h-[calc(100vh-210px)] overflow-y-auto">
          {catalogue && blocOperations(catalogue.operations, `CATALOGUE — JEU ${catalogue.jeu}`)}
          {catalogue && catalogue.operationsAutreJeu.length > 0 &&
            blocOperations(catalogue.operationsAutreJeu, "RELÈVE DE L'AUTRE JEU D'ÉTATS FINANCIERS", true)}
          {!catalogue && <div className="px-3 py-4 text-[12px] text-text-dim">Chargement…</div>}
        </div>

        <div className="flex-1 min-w-0">
          {!paire && <div className="border border-border px-4 py-4 text-[12px] text-text-dim">Choisissez une écriture-type.</div>}

          {paire && (
            <>
              <div className="border border-border bg-surface px-3.5 py-3 mb-2.5">
                <div className="text-[12.5px] font-bold">{paire.modele.libelle}</div>
                <div className="text-[11.5px] mt-0.5">{paire.modele.objet}</div>
                <div className="text-[10px] text-text-dim italic mt-1.5 border-t border-border pt-1.5">
                  {paire.modele.source}
                  {paire.modele.applicationGuide && ` — Guide, ${paire.modele.applicationGuide}.`}
                </div>
                {paire.modele.anomalie && (
                  <div className="text-[10.5px] text-danger mt-1.5">⚠ {paire.modele.anomalie}</div>
                )}
                {paire.operation.politiqueADecider && (
                  <div className="text-[10.5px] mt-1.5 border-t border-border pt-1.5">
                    <span className="font-bold">À décider par le dossier — </span>
                    {paire.operation.politiqueADecider}
                  </div>
                )}
                {paire.modele.aExtourner && (
                  <div className="text-[10.5px] text-text-dim italic mt-1.5">
                    Écriture d’inventaire : à extourner à l’ouverture de l’exercice suivant.
                  </div>
                )}
              </div>

              <div className="border border-border bg-surface px-3.5 py-3 mb-2.5">
                <div className="text-[10px] font-bold text-text-dim mb-2">PARAMÈTRES</div>
                <div className="grid grid-cols-3 gap-2.5">
                  {paire.modele.parametres.map((p) => (
                    <label key={p.nom} className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-text-dim">{p.libelle}</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={valeurs[p.nom] ?? ''}
                        placeholder={p.defaut !== undefined ? String(p.defaut) : ''}
                        onChange={(e) => setValeurs((v) => ({ ...v, [p.nom]: e.target.value }))}
                        className="border border-border-dark px-2 py-1 text-[11.5px] font-mono"
                      />
                      {p.aide && <span className="text-[9.5px] text-text-dim italic">{p.aide}</span>}
                    </label>
                  ))}
                </div>
              </div>

              {proposition && (
                <div className="border border-border bg-surface mb-2.5">
                  <div className="px-3.5 py-1.5 bg-chrome border-b border-border text-[10px] font-bold text-text-dim">
                    ÉCRITURE PROPOSÉE — non enregistrée
                  </div>
                  {proposition.comptesIntrouvables.length > 0 && (
                    <div className="px-3.5 py-2 text-[11px] text-danger border-b border-border">
                      Le dossier ne possède pas :{' '}
                      {proposition.comptesIntrouvables.map((c) => `${c.compte} (${c.libelle})`).join(', ')}. Créez ces
                      comptes au plan avant d’appliquer ce modèle.
                    </div>
                  )}
                  <div className="grid grid-cols-[92px_1fr_120px_120px] gap-2 px-3.5 py-1 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
                    <span>COMPTE</span><span>LIBELLÉ</span>
                    <span className="text-right">DÉBIT</span><span className="text-right">CRÉDIT</span>
                  </div>
                  {proposition.lignes.map((l, i) => (
                    <div key={i} className="grid grid-cols-[92px_1fr_120px_120px] gap-2 px-3.5 py-1 border-b border-border text-[11.5px] items-center">
                      {l.choixRequis ? (
                        <>
                          <span className="text-danger text-[10px] font-bold">à choisir</span>
                          <span>
                            {l.libelle}
                            <select
                              value={choix[l.choixRequis.racine] ?? ''}
                              onChange={(e) => setChoix((c) => ({ ...c, [l.choixRequis!.racine]: e.target.value }))}
                              className="ml-2 border border-border-dark px-1.5 py-0.5 text-[10.5px] max-w-[300px]"
                            >
                              <option value="">— choisir un compte —</option>
                              {l.choixRequis.candidats.map((c) => (
                                <option key={c.id} value={c.numero}>{c.numero} — {c.intitule}</option>
                              ))}
                            </select>
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="font-mono text-[10.5px] text-text-dim">{l.numero}</span>
                          <span>
                            {l.libelle}
                            {l.note && <span className="text-[9.5px] text-text-dim italic ml-1.5">{l.note}</span>}
                          </span>
                        </>
                      )}
                      <span className="font-mono text-right">{l.debit ? montant(l.debit) : ''}</span>
                      <span className="font-mono text-right">{l.credit ? montant(l.credit) : ''}</span>
                    </div>
                  ))}
                  <div className="grid grid-cols-[92px_1fr_120px_120px] gap-2 px-3.5 py-1.5 bg-surface-alt text-[11.5px] font-bold">
                    <span /><span className={proposition.equilibree ? '' : 'text-danger'}>
                      {proposition.equilibree ? 'Équilibrée' : 'DÉSÉQUILIBRÉE'}
                    </span>
                    <span className="font-mono text-right">{montant(proposition.totalDebit)}</span>
                    <span className="font-mono text-right">{montant(proposition.totalCredit)}</span>
                  </div>
                </div>
              )}

              {peutSaisir && proposition && (
                <div className="border border-border bg-surface px-3.5 py-3 flex items-end gap-2.5">
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-bold text-text-dim">Journal</span>
                    <select value={journalId} onChange={(e) => setJournalId(e.target.value)} className="border border-border-dark px-2 py-1 text-[11.5px]">
                      {journaux.filter((j) => j.estActif).map((j) => (
                        <option key={j.id} value={j.id}>{j.code} — {j.intitule}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-bold text-text-dim">Date</span>
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border border-border-dark px-2 py-1 text-[11.5px]" />
                  </label>
                  <button
                    onClick={appliquer}
                    disabled={enCours || !date || !journalId || !proposition.equilibree || proposition.lignes.some((l) => l.choixRequis)}
                    className="bg-sel text-white text-[11px] font-semibold px-3 py-1.5 disabled:opacity-50"
                  >
                    {enCours ? 'Enregistrement…' : "Enregistrer l'écriture"}
                  </button>
                  <span className="text-[10px] text-text-dim italic">
                    L’écriture rejoint le journal comme une saisie ordinaire : elle se corrige, se lettre et se rapproche.
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
