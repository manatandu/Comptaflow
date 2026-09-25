import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Aide } from '../components/chrome/Aide';
import type { Compte, Journal, NumerotationPiece, TypeJournal } from '../lib/types';

/**
 * CODES JOURNAUX · la fenêtre Structure → Codes journaux de Sage 100 i7 :
 * liste dense (code · intitulé · type · numérotation · compte de trésorerie
 * · état), création en boîte de dialogue. Le type d'un journal est figé
 * après création (règle Sage) ; un journal de trésorerie exige son compte
 * de trésorerie rattaché · c'est lui qui porte la contrepartie automatique.
 */

const LIBELLE_TYPE: Record<TypeJournal, string> = {
  ACHATS: 'Achats',
  VENTES: 'Ventes',
  TRESORERIE: 'Trésorerie',
  GENERAL: 'Général',
  SITUATION: 'Situation',
};

const LIBELLE_NUMEROTATION: Record<NumerotationPiece, string> = {
  MANUELLE: 'Manuelle',
  CONTINUE_JOURNAL: 'Continue par journal',
  CONTINUE_FICHIER: 'Continue pour le fichier',
  MENSUELLE: 'Mensuelle',
};

export function JournauxPage() {
  const { estAdmin } = useAuth();
  const [liste, setListe] = useState<Journal[] | null>(null);
  const [comptesTresorerie, setComptesTresorerie] = useState<Compte[]>([]);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);
  const [nouveauOuvert, setNouveauOuvert] = useState(false);

  // Codes journaux · seule la création est offerte ici. Un code journal ne se
  // « consulte » pas séparément : sa fiche EST la ligne de la liste.

  const [code, setCode] = useState('');
  const [intitule, setIntitule] = useState('');
  const [type, setType] = useState<TypeJournal>('GENERAL');
  const [compteTresorerieId, setCompteTresorerieId] = useState('');
  const [numerotation, setNumerotation] = useState<NumerotationPiece>('MANUELLE');
  const [erreurForm, setErreurForm] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = async () => {
    try {
      setListe(await api.get<Journal[]>('/journaux'));
      setErreurChargement(null);
    } catch (err) {
      setErreurChargement(err instanceof ApiError ? err.message : 'Impossible de charger les journaux');
    }
  };

  useEffect(() => {
    if (!estAdmin) return;
    charger();
    api.get<Compte[]>('/comptes?classe=CLASSE_5&actifsSeuls=true&typeCompte=DETAIL').then(setComptesTresorerie);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estAdmin]);

  if (!estAdmin) {
    return (
      <div className="p-4">
        <div className="border border-warning/30 bg-warning-soft px-4 py-3 text-[11.5px] max-w-[480px]">
          Cette fenêtre est réservée aux administrateurs du dossier.
        </div>
      </div>
    );
  }

  const onCreer = async (e: FormEvent) => {
    e.preventDefault();
    setErreurForm(null);
    setEnvoi(true);
    try {
      await api.post('/journaux', {
        code,
        intitule,
        type,
        numerotation,
        ...(type === 'TRESORERIE' ? { compteTresorerieId } : {}),
      });
      setCode('');
      setIntitule('');
      setType('GENERAL');
      setCompteTresorerieId('');
      setNumerotation('MANUELLE');
      setNouveauOuvert(false);
      await charger();
    } catch (err) {
      setErreurForm(err instanceof ApiError ? err.message : 'Impossible de créer ce journal');
    } finally {
      setEnvoi(false);
    }
  };

  // Suppression · le serveur refuse tout objet mouvementé ou utilisé, et
  // dit lequel (common/suppression/references.ts). La confirmation évite le
  // clic malheureux sur un objet libre, qui, lui, disparaît pour de bon.
  const supprimer = async (id: string, nom: string) => {
    if (!window.confirm(`Supprimer ${nom} ? Cette suppression est définitive.`)) return;
    setErreurChargement(null);
    try {
      await api.delete(`/journaux/${id}`);
      
      await charger();
    } catch (err) {
      setErreurChargement(err instanceof ApiError ? err.message : 'Suppression impossible');
    }
  };

  const basculerActif = async (j: Journal) => {
    try {
      await api.patch(`/journaux/${j.id}`, { estActif: !j.estActif });
      await charger();
    } catch (err) {
      setErreurChargement(err instanceof ApiError ? err.message : 'Action impossible');
    }
  };

  return (
    <div className="p-2">
      <div className="flex items-center justify-end gap-2 mb-2">
        <Aide
          titre="Codes journaux"
          texte="Le type d'un journal détermine le pré-positionnement du curseur en saisie (débit ou crédit selon la racine du compte) et n'est plus modifiable après création. Un journal de trésorerie porte son compte rattaché : la contrepartie s'y enregistre en un clic depuis la saisie. « Situation » : écritures provisoires, jamais clôturé."
          source="Codes journaux"
        />
        <button
          type="button"
          onClick={() => setNouveauOuvert(true)}
          className="bg-sel text-white px-3.5 py-1 text-[11.5px] font-semibold"
        >
          Nouveau journal
        </button>
      </div>

      {erreurChargement && (
        <div className="text-[11.5px] text-danger bg-danger-soft border border-danger/30 px-3 py-1.5 mb-2">
          {erreurChargement}
        </div>
      )}

      <div
        // `overflow-x-auto` ici, `min-w` sur les lignes · les 726 px de colonnes
        // incompressibles du tableau ne tiennent pas dans les ~326 px utiles d'une
        // fenêtre à 360 px, et sans conteneur le débordement remontait à la fenêtre,
        // qui emportait alors titre, onglets et boutons hors de l'écran.
        className="border border-border bg-surface shadow-posee overflow-x-auto"
      >
        <div className="entete-colonnes grid grid-cols-[76px_1fr_100px_160px_220px_92px_70px] min-w-[950px] gap-2.5 px-3.5 py-1.5 bg-surface-alt border-b border-border-dark text-[11px] font-bold text-text-dim">
          <span>Code</span>
          <span>Intitulé</span>
          <span>Type</span>
          <span>Numérotation des pièces</span>
          <span>Compte de trésorerie</span>
          <span>État</span>
          <span />
        </div>
        {!liste && <div className="px-3.5 py-3 text-[11.5px] text-text-dim">Chargement…</div>}
        {liste?.map((j) => (
          <div
            key={j.id}
            className={`grid grid-cols-[76px_1fr_100px_160px_220px_92px_70px] min-w-[950px] gap-2.5 items-center px-3.5 py-[4px] border-b border-border/50 last:border-b-0 text-[11.5px] hover:bg-sel-soft ${
              !j.estActif ? 'opacity-55' : ''
            }`}
          >
            <span className="font-mono font-semibold">{j.code}</span>
            <span className="truncate">{j.intitule}</span>
            <span className="text-text-dim">{LIBELLE_TYPE[j.type]}</span>
            <span className="text-[11px] text-text-dim">{LIBELLE_NUMEROTATION[j.numerotation]}</span>
            <span className="font-mono text-[11px] text-text-dim truncate">
              {j.compteTresorerie ? `${j.compteTresorerie.numero} ${j.compteTresorerie.intitule}` : ''}
            </span>
            <button
              onClick={() => basculerActif(j)}
              title={j.estActif ? 'Mettre en sommeil (bloque la saisie sur ce journal)' : 'Réactiver'}
              className={`text-[11px] text-left ${j.estActif ? 'text-positive hover:underline' : 'text-warning hover:underline'}`}
            >
              {j.estActif ? 'Actif' : 'En sommeil'}
            </button>
            <button onClick={() => supprimer(j.id, `le journal ${j.code}`)} className="text-[11px] text-left text-danger hover:underline">
              Supprimer
            </button>
          </div>
        ))}
      </div>


      {nouveauOuvert && (
        <div className="anim-voile fixed inset-0 z-40 bg-black/35 flex items-center justify-center p-4">
          <form onSubmit={onCreer} className="anim-modale w-full max-w-[460px] bg-surface border border-border-dark shadow-flottante max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div
              className="h-[32px] flex items-center justify-between px-2.5 bg-surface text-text border-b border-border text-[11.5px]"
            >
              <span>Nouveau code journal</span>
              <button type="button" onClick={() => setNouveauOuvert(false)} className="-mr-2 self-stretch w-[46px] flex items-center justify-center text-text-dim hover:text-white hover:bg-[#c42b1c]">
                ✕
              </button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-[130px_1fr] items-center gap-x-3 gap-y-2.5">
                <label className="text-[11.5px] text-right">Code :</label>
                <input
                  required
                  autoFocus
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="ACH, VEN, BQ…"
                  className="border border-border-dark px-2.5 py-1.5 text-[12px] font-mono"
                />
                <label className="text-[11.5px] text-right">Intitulé :</label>
                <input
                  required
                  value={intitule}
                  onChange={(e) => setIntitule(e.target.value)}
                  className="border border-border-dark px-2.5 py-1.5 text-[12px]"
                />
                <label className="text-[11.5px] text-right">Type :</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as TypeJournal)}
                  className="border border-border-dark px-2.5 py-1.5 text-[11.5px]"
                >
                  {(Object.keys(LIBELLE_TYPE) as TypeJournal[]).map((t) => (
                    <option key={t} value={t}>
                      {LIBELLE_TYPE[t]}
                    </option>
                  ))}
                </select>
                <label className="text-[11.5px] text-right">Numérotation :</label>
                <select
                  value={numerotation}
                  onChange={(e) => setNumerotation(e.target.value as NumerotationPiece)}
                  className="border border-border-dark px-2.5 py-1.5 text-[11.5px]"
                >
                  {(Object.keys(LIBELLE_NUMEROTATION) as NumerotationPiece[]).map((n) => (
                    <option key={n} value={n}>
                      {LIBELLE_NUMEROTATION[n]}
                    </option>
                  ))}
                </select>
                {type === 'TRESORERIE' && (
                  <>
                    <label className="text-[11.5px] text-right">Compte de trésorerie :</label>
                    <select
                      required
                      value={compteTresorerieId}
                      onChange={(e) => setCompteTresorerieId(e.target.value)}
                      className="border border-border-dark px-2.5 py-1.5 text-[11.5px]"
                    >
                      <option value="">Sélectionner</option>
                      {comptesTresorerie.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.numero} · {c.intitule}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
              {erreurForm && (
                <div className="text-[11.5px] text-danger bg-danger-soft border border-danger/30 px-2.5 py-1.5 mt-3">
                  {erreurForm}
                </div>
              )}
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setNouveauOuvert(false)}
                  className="border border-border-dark bg-chrome hover:bg-chrome-alt px-4 py-1.5 text-[11.5px]"
                >
                  Annuler
                </button>
                <button type="submit" disabled={envoi} className="bg-sel text-white px-4 py-1.5 text-[11.5px] font-semibold disabled:opacity-50">
                  {envoi ? 'Création…' : 'Créer le journal'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
