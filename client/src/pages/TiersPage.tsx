import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useExercice } from '../lib/exercice';
import { useRibbon } from '../components/chrome/ribbon-context';
import { IconRefresh, IconCheck } from '../components/chrome/icons';
import type { Compte, ConditionEcheance, LigneBalance, ModeleReglement, Tiers, TypeTiers } from '../lib/types';

const LIBELLE_TYPE: Record<TypeTiers, string> = {
  CLIENT: 'Client',
  FOURNISSEUR: 'Fournisseur',
  SALARIE: 'Salarié',
  AUTRE: 'Autre',
};

const LIBELLE_ECHEANCE: Record<ConditionEcheance, string> = {
  NET: 'Net (date facture + délai)',
  FIN_DE_MOIS: 'Fin de mois + délai',
};

export function TiersPage() {
  const { estAdmin } = useAuth();
  const { exerciceCourant } = useExercice();
  const navigate = useNavigate();
  const [liste, setListe] = useState<Tiers[] | null>(null);
  const [modeles, setModeles] = useState<ModeleReglement[]>([]);
  const [comptesClasse4, setComptesClasse4] = useState<Compte[]>([]);
  const [soldes, setSoldes] = useState<Record<string, number>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [recherche, setRecherche] = useState('');
  const [filtreType, setFiltreType] = useState<TypeTiers | ''>('');
  const [selectionId, setSelectionId] = useState<string | null>(null);

  // Formulaire de création d'un tiers
  const [type, setType] = useState<TypeTiers>('CLIENT');
  const [code, setCode] = useState('');
  const [nom, setNom] = useState('');
  const [modeleReglementId, setModeleReglementId] = useState('');
  const [envoi, setEnvoi] = useState(false);

  // Formulaire de rattachement de compte
  const [compteARattacher, setCompteARattacher] = useState('');
  const [estPrincipal, setEstPrincipal] = useState(false);

  // Formulaire modèle de règlement
  const [intituleModele, setIntituleModele] = useState('');
  const [delaiJours, setDelaiJours] = useState(30);
  const [echeance, setEcheance] = useState<ConditionEcheance>('NET');

  const charger = async () => {
    try {
      const params = new URLSearchParams();
      if (recherche) params.set('recherche', recherche);
      if (filtreType) params.set('type', filtreType);
      setListe(await api.get<Tiers[]>(`/tiers?${params.toString()}`));
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de charger les tiers');
    }
  };

  useEffect(() => {
    const t = setTimeout(charger, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recherche, filtreType]);

  useEffect(() => {
    api.get<ModeleReglement[]>('/modeles-reglement').then(setModeles);
    api.get<Compte[]>('/comptes?classe=CLASSE_4&actifsSeuls=true').then(setComptesClasse4);
  }, []);

  // Solde des comptes rattachés (balance de l'exercice courant) — affiché à
  // côté du raccourci lettrage dans le panneau de détail d'un tiers.
  useEffect(() => {
    if (!exerciceCourant) return;
    api.get<{ lignes: LigneBalance[] }>(`/ecritures/balance?exerciceId=${exerciceCourant.id}`).then((r) => {
      setSoldes(Object.fromEntries(r.lignes.map((l) => [l.compteId, l.solde])));
    });
  }, [exerciceCourant]);

  useRibbon([{ titre: 'AFFICHAGE', boutons: [{ label: 'Actualiser', Icon: IconRefresh, onClick: charger }] }]);

  const tiersSelectionne = liste?.find((t) => t.id === selectionId) ?? null;
  // Comptes classe 4 non encore rattachés à un tiers (parmi ceux vus par la
  // liste courante) — approximation raisonnable pour le sélecteur : on
  // n'exclut que les comptes déjà rattachés au tiers sélectionné lui-même.
  const comptesDisponibles = comptesClasse4.filter(
    (c) => !tiersSelectionne?.comptesRattaches.some((tc) => tc.compteId === c.id),
  );

  const onCreerTiers = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setInfo(null);
    setEnvoi(true);
    try {
      await api.post('/tiers', { type, code, nom, ...(modeleReglementId ? { modeleReglementId } : {}) });
      setCode('');
      setNom('');
      setModeleReglementId('');
      setInfo(`Tiers ${code} créé.`);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de créer ce tiers');
    } finally {
      setEnvoi(false);
    }
  };

  const onRattacherCompte = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectionId || !compteARattacher) return;
    setErreur(null);
    setInfo(null);
    try {
      await api.post(`/tiers/${selectionId}/comptes`, { compteId: compteARattacher, estPrincipal });
      setCompteARattacher('');
      setEstPrincipal(false);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de rattacher ce compte');
    }
  };

  const definirPrincipal = async (compteId: string) => {
    if (!selectionId) return;
    setErreur(null);
    try {
      await api.put(`/tiers/${selectionId}/comptes/${compteId}/principal`, {});
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de définir ce compte comme principal');
    }
  };

  const detacherCompte = async (compteId: string) => {
    if (!selectionId) return;
    setErreur(null);
    try {
      await api.delete(`/tiers/${selectionId}/comptes/${compteId}`);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de détacher ce compte');
    }
  };

  const basculerActif = async (t: Tiers) => {
    try {
      await api.patch(`/tiers/${t.id}`, { estActif: !t.estActif });
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Action impossible');
    }
  };

  const onCreerModele = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    try {
      await api.post('/modeles-reglement', { intitule: intituleModele, delaiJours, echeance });
      setIntituleModele('');
      setDelaiJours(30);
      setModeles(await api.get<ModeleReglement[]>('/modeles-reglement'));
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de créer ce modèle de règlement');
    }
  };

  if (!estAdmin) {
    return (
      <div className="p-2.5">
        <h1 className="text-[15px] font-bold mb-2.5">Tiers</h1>
        <div className="border border-warning/30 bg-warning-soft px-4 py-3 text-[12.5px] max-w-[480px]">
          La gestion des tiers est réservée aux administrateurs du dossier.
        </div>
      </div>
    );
  }

  return (
    <div className="p-2.5">
      <h1 className="text-[15px] font-bold mb-2.5">Plan des tiers</h1>

      {erreur && <div className="text-[12px] text-danger bg-danger-soft border border-danger/30 px-2.5 py-1.5 mb-3 max-w-[900px]">{erreur}</div>}
      {info && <div className="text-[12px] text-positive bg-positive-soft border border-positive/30 px-2.5 py-1.5 mb-3 max-w-[900px]">{info}</div>}

      <form onSubmit={onCreerTiers} className="bg-surface border border-border p-4 mb-4 max-w-[720px]">
        <div className="font-mono text-[11px] font-semibold text-text-dim mb-3">AJOUTER UN TIERS</div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="text-[11.5px] font-semibold text-text-dim">
            Type
            <select value={type} onChange={(e) => setType(e.target.value as TypeTiers)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal">
              {(Object.keys(LIBELLE_TYPE) as TypeTiers[]).map((t) => (
                <option key={t} value={t}>
                  {LIBELLE_TYPE[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11.5px] font-semibold text-text-dim">
            Code
            <input required value={code} onChange={(e) => setCode(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal font-mono" />
          </label>
          <label className="text-[11.5px] font-semibold text-text-dim col-span-2">
            Nom
            <input required value={nom} onChange={(e) => setNom(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal" />
          </label>
          <label className="text-[11.5px] font-semibold text-text-dim col-span-2">
            Modèle de règlement (optionnel)
            <select value={modeleReglementId} onChange={(e) => setModeleReglementId(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal">
              <option value="">— Aucun —</option>
              {modeles.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.intitule}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="submit" disabled={envoi} className="bg-sel text-white text-[12.5px] font-semibold px-4 py-1.5 disabled:opacity-50">
          {envoi ? 'Création…' : 'Ajouter'}
        </button>
      </form>

      <div className="flex items-center gap-2 mb-2.5 max-w-[900px]">
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un tiers (code, nom)…"
          className="border border-border-dark bg-surface px-2.5 py-1 text-[12.5px] flex-1"
        />
        <select value={filtreType} onChange={(e) => setFiltreType(e.target.value as TypeTiers | '')} className="border border-border-dark px-2.5 py-1 text-[12.5px]">
          <option value="">Tous types</option>
          {(Object.keys(LIBELLE_TYPE) as TypeTiers[]).map((t) => (
            <option key={t} value={t}>
              {LIBELLE_TYPE[t]}
            </option>
          ))}
        </select>
      </div>

      <div className="border border-border max-w-[900px] mb-5">
        <div className="grid grid-cols-[90px_100px_1fr_150px_90px] gap-2 px-3.5 py-1.5 bg-chrome border-b border-border text-[10px] font-bold text-text-dim">
          <span>CODE</span><span>TYPE</span><span>NOM</span><span>RÈGLEMENT</span><span>STATUT</span>
        </div>
        {!liste && <div className="p-3 text-[12px] text-text-dim">Chargement…</div>}
        {liste?.length === 0 && <div className="p-3 text-[12px] text-text-dim">Aucun tiers.</div>}
        {liste?.map((t, i) => (
          <div
            key={t.id}
            onClick={() => setSelectionId(t.id)}
            className={`grid grid-cols-[90px_100px_1fr_150px_90px] gap-2 items-center px-3.5 py-1.5 border-b border-border last:border-b-0 cursor-pointer text-[11.5px] ${
              t.id === selectionId ? 'bg-sel/15' : i % 2 === 0 ? 'bg-surface' : 'bg-surface-alt'
            }`}
          >
            <span className="font-mono font-semibold">{t.code}</span>
            <span className="text-text-dim">{LIBELLE_TYPE[t.type]}</span>
            <span className="truncate">{t.nom}</span>
            <span className="text-[10.5px] text-text-dim truncate">{t.modeleReglement?.intitule ?? '—'}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                basculerActif(t);
              }}
              className={`font-mono text-[9.5px] font-bold px-1.5 py-0.5 w-fit ${t.estActif ? 'text-positive bg-positive-soft' : 'text-text-dim bg-surface-alt'}`}
            >
              {t.estActif ? 'ACTIF' : 'INACTIF'}
            </button>
          </div>
        ))}
      </div>

      {tiersSelectionne && (
        <div className="border border-border max-w-[900px] p-4 mb-5 bg-surface">
          <div className="font-mono text-[11px] font-semibold text-text-dim mb-3">
            COMPTES RATTACHÉS — {tiersSelectionne.code} {tiersSelectionne.nom}
          </div>

          {tiersSelectionne.comptesRattaches.length === 0 && (
            <div className="text-[11.5px] text-text-dim mb-3">Aucun compte rattaché.</div>
          )}
          {tiersSelectionne.comptesRattaches.length > 0 && (
            <div className="border border-border mb-3">
              <div className="grid grid-cols-[110px_1fr_100px_90px_90px_80px] gap-2 px-3 py-1 bg-chrome border-b border-border text-[9.5px] font-bold text-text-dim">
                <span>COMPTE</span><span>INTITULÉ</span><span className="text-right">SOLDE</span><span>PRINCIPAL</span><span /><span />
              </div>
              {tiersSelectionne.comptesRattaches.map((tc, i) => (
                <div
                  key={tc.id}
                  className={`grid grid-cols-[110px_1fr_100px_90px_90px_80px] gap-2 items-center px-3 py-1.5 border-b border-border last:border-b-0 text-[11.5px] ${
                    i % 2 === 0 ? 'bg-surface' : 'bg-surface-alt'
                  }`}
                >
                  <span className="font-mono">{tc.compte.numero}</span>
                  <span className="truncate">{tc.compte.intitule}</span>
                  <span className="font-mono text-right text-text-dim">
                    {tc.compteId in soldes ? soldes[tc.compteId].toLocaleString('fr-FR') : '—'}
                  </span>
                  <span>
                    {tc.estPrincipal ? (
                      <span className="font-mono text-[9.5px] font-bold px-1.5 py-0.5 bg-positive-soft text-positive flex items-center gap-1 w-fit">
                        <IconCheck width={10} height={10} /> PRINCIPAL
                      </span>
                    ) : (
                      <button onClick={() => definirPrincipal(tc.compteId)} className="text-[10.5px] font-semibold text-sel hover:underline">
                        Définir principal
                      </button>
                    )}
                  </span>
                  <button
                    onClick={() => navigate(`/comptes/${tc.compteId}/lettrage`)}
                    className="text-[10.5px] font-semibold text-sel hover:underline w-fit"
                  >
                    Lettrage
                  </button>
                  <button onClick={() => detacherCompte(tc.compteId)} className="text-[10.5px] font-semibold text-danger hover:underline w-fit">
                    Détacher
                  </button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={onRattacherCompte} className="flex items-end gap-3">
            <label className="text-[11px] font-semibold text-text-dim flex-1">
              Rattacher un compte (classe 4)
              <select
                required
                value={compteARattacher}
                onChange={(e) => setCompteARattacher(e.target.value)}
                className="mt-1 w-full border border-border-dark px-2 py-1.5 text-[12.5px] font-normal"
              >
                <option value="">— Sélectionner —</option>
                {comptesDisponibles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.numero} — {c.intitule}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] font-semibold text-text-dim flex items-center gap-1.5 pb-1.5">
              <input type="checkbox" checked={estPrincipal} onChange={(e) => setEstPrincipal(e.target.checked)} />
              Principal
            </label>
            <button type="submit" className="bg-sel text-white text-[12px] font-semibold px-3 py-1.5">
              Rattacher
            </button>
          </form>
        </div>
      )}

      <div className="border border-border max-w-[720px] p-4">
        <div className="font-mono text-[11px] font-semibold text-text-dim mb-3">MODÈLES DE RÈGLEMENT</div>
        <div className="border border-border mb-3">
          {modeles.length === 0 && <div className="p-2.5 text-[11.5px] text-text-dim">Aucun modèle de règlement.</div>}
          {modeles.map((m, i) => (
            <div key={m.id} className={`grid grid-cols-[1fr_90px_180px] gap-2 items-center px-3 py-1.5 border-b border-border last:border-b-0 text-[11.5px] ${i % 2 === 0 ? 'bg-surface' : 'bg-surface-alt'}`}>
              <span>{m.intitule}</span>
              <span className="text-text-dim">{m.delaiJours} j.</span>
              <span className="text-[10.5px] text-text-dim">{LIBELLE_ECHEANCE[m.echeance]}</span>
            </div>
          ))}
        </div>
        <form onSubmit={onCreerModele} className="grid grid-cols-4 gap-2 items-end">
          <label className="text-[11px] font-semibold text-text-dim col-span-2">
            Intitulé
            <input required value={intituleModele} onChange={(e) => setIntituleModele(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[12px] font-normal" />
          </label>
          <label className="text-[11px] font-semibold text-text-dim">
            Délai (j.)
            <input required type="number" min={0} value={delaiJours} onChange={(e) => setDelaiJours(Number(e.target.value))} className="mt-1 w-full border border-border-dark px-2 py-1 text-[12px] font-normal" />
          </label>
          <label className="text-[11px] font-semibold text-text-dim">
            Échéance
            <select value={echeance} onChange={(e) => setEcheance(e.target.value as ConditionEcheance)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[12px] font-normal">
              {(Object.keys(LIBELLE_ECHEANCE) as ConditionEcheance[]).map((c) => (
                <option key={c} value={c}>
                  {LIBELLE_ECHEANCE[c]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="bg-sel text-white text-[11.5px] font-semibold px-3 py-1.5 col-span-4 w-fit">
            Ajouter le modèle
          </button>
        </form>
      </div>
    </div>
  );
}
