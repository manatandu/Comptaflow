import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useExercice } from '../lib/exercice';
import { useRibbon } from '../components/chrome/ribbon-context';
import { IconCheck } from '../components/chrome/icons';
import type { Compte, Journal, TauxTva } from '../lib/types';

type TypeOperationSimple = 'don' | 'cotisation' | 'achat' | 'salaire';
type TypeOperationTva = 'vente_tva' | 'achat_tva';
type TypeOperation = TypeOperationSimple | TypeOperationTva;

const OPERATIONS: Record<TypeOperationSimple, { label: string; numeroContrepartie: string; sens: 'recette' | 'depense' }> = {
  don: { label: 'Don reçu', numeroContrepartie: '70410000', sens: 'recette' },
  cotisation: { label: 'Cotisation reçue', numeroContrepartie: '70100000', sens: 'recette' },
  achat: { label: 'Achat payé', numeroContrepartie: '60500000', sens: 'depense' },
  salaire: { label: 'Salaire payé', numeroContrepartie: '66100000', sens: 'depense' },
};

// Opérations TVA (cf. docs/plan-de-construction.md §5) : le compte de
// contrepartie n'est pas figé par numéro (contrairement aux 4 opérations
// ci-dessus) — l'utilisateur choisit un compte de charge (classe 6) ou de
// produit (classe 7), puis un taux parmi ceux actifs et rattachés à un
// compte de TVA pour le sens choisi (443 collecte / 445 déduction). Le
// montant saisi est le HT ; TVA et TTC sont calculés, jamais saisis.
const OPERATIONS_TVA: Record<TypeOperationTva, { label: string; sens: 'recette' | 'depense' }> = {
  vente_tva: { label: 'Vente avec TVA', sens: 'recette' },
  achat_tva: { label: 'Achat avec TVA', sens: 'depense' },
};

function estOperationTva(type: TypeOperation): type is TypeOperationTva {
  return type === 'vente_tva' || type === 'achat_tva';
}

/** Arrondi à 2 décimales — évite les écarts flottants entre HT+TVA et TTC. */
function arrondi2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function SaisiePage() {
  const { exerciceCourant } = useExercice();
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [comptesCharges, setComptesCharges] = useState<Compte[]>([]);
  const [comptesProduits, setComptesProduits] = useState<Compte[]>([]);
  const [tauxTvaListe, setTauxTvaListe] = useState<TauxTva[]>([]);
  const [journaux, setJournaux] = useState<Journal[]>([]);
  const [type, setType] = useState<TypeOperation>('don');
  const [compteTresorerieId, setCompteTresorerieId] = useState('');
  const [compteContrepartieTvaId, setCompteContrepartieTvaId] = useState('');
  const [tauxTvaId, setTauxTvaId] = useState('');
  const [montant, setMontant] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [libelle, setLibelle] = useState('');
  const [voirEcriture, setVoirEcriture] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.get<Compte[]>('/comptes?classe=CLASSE_5&actifsSeuls=true&typeCompte=DETAIL').then((c) => {
      setComptes(c);
      if (c[0]) setCompteTresorerieId(c[0].id);
    });
    api.get<Compte[]>('/comptes?classe=CLASSE_6&actifsSeuls=true&typeCompte=DETAIL').then(setComptesCharges);
    api.get<Compte[]>('/comptes?classe=CLASSE_7&actifsSeuls=true&typeCompte=DETAIL').then(setComptesProduits);
    api.get<TauxTva[]>('/taux-tva?actifsSeuls=true').then(setTauxTvaListe);
    // Journaux de type Trésorerie : chacun porte son compte de trésorerie
    // associé (voir Journal.compteTresorerieId) — c'est ce lien, pas une
    // règle de préfixe de numéro, qui détermine le journal à utiliser en saisie.
    // Récupérés tous (pas seulement les actifs) pour pouvoir distinguer, en cas
    // d'échec, « aucun journal associé » de « journal en sommeil » — voir onSubmit.
    api.get<Journal[]>('/journaux').then(setJournaux);
  }, []);

  useRibbon([{ titre: 'SAISIE', boutons: [{ label: 'Enregistrer', Icon: IconCheck }] }]);

  const operationTva = estOperationTva(type);
  const contrepartieSimple = !operationTva ? OPERATIONS[type] : null;
  const sens = operationTva ? OPERATIONS_TVA[type].sens : contrepartieSimple!.sens;
  const labelOperation = operationTva ? OPERATIONS_TVA[type].label : contrepartieSimple!.label;
  const compteTresorerie = comptes.find((c) => c.id === compteTresorerieId);
  const montantNombre = Number(montant) || 0;

  // Comptes de contrepartie proposés selon le sens (vente → produits classe
  // 7, achat → charges classe 6) et, parmi les taux actifs, seuls ceux
  // rattachés à un compte pour ce sens (443 pour une vente, 445 pour un achat).
  const comptesContrepartieTva = type === 'vente_tva' ? comptesProduits : comptesCharges;
  const tauxDisponibles = tauxTvaListe.filter((t) => (type === 'vente_tva' ? t.compteCollecteId : t.compteDeductibleId));
  const tauxSelectionne = tauxTvaListe.find((t) => t.id === tauxTvaId);
  const tauxPourcent = tauxSelectionne ? Number(tauxSelectionne.taux) : 0;
  const montantTva = arrondi2(montantNombre * (tauxPourcent / 100));
  const montantTtc = arrondi2(montantNombre + montantTva);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!exerciceCourant || !compteTresorerieId || montantNombre <= 0) return;
    if (operationTva && (!compteContrepartieTvaId || !tauxTvaId)) return;
    setErreur(null);
    setEnvoi(true);
    try {
      const journalTresorerie = journaux.find(
        (j) => j.type === 'TRESORERIE' && j.compteTresorerieId === compteTresorerieId,
      );
      if (!journalTresorerie) {
        throw new Error(`Aucun journal de trésorerie n'est associé au compte ${compteTresorerie?.numero}`);
      }
      if (!journalTresorerie.estActif) {
        throw new Error(
          `Le journal ${journalTresorerie.code} (${journalTresorerie.intitule}) est en sommeil — réactivez-le dans Codes journaux avant de saisir sur ce compte.`,
        );
      }

      const estRecette = sens === 'recette';
      let lignes: Array<{ compteId: string; debit?: number; credit?: number; tauxTvaId?: string }>;

      if (operationTva) {
        const ligneTva =
          montantTva > 0.005
            ? [
                {
                  compteId: estRecette ? tauxSelectionne!.compteCollecteId! : tauxSelectionne!.compteDeductibleId!,
                  debit: estRecette ? 0 : montantTva,
                  credit: estRecette ? montantTva : 0,
                  tauxTvaId: tauxSelectionne!.id,
                },
              ]
            : [];
        lignes = [
          { compteId: compteTresorerieId, debit: estRecette ? montantTtc : 0, credit: estRecette ? 0 : montantTtc },
          { compteId: compteContrepartieTvaId, debit: estRecette ? 0 : montantNombre, credit: estRecette ? montantNombre : 0 },
          ...ligneTva,
        ];
      } else {
        // Le compte de contrepartie (produit ou charge) est retrouvé par son numéro
        // seedé — voir compte-seed.ts côté API. S'il a été renommé/désactivé côté
        // tenant, l'API renverra une erreur explicite plutôt qu'un id invalide silencieux.
        const tousComptes = await api.get<Compte[]>(`/comptes?recherche=${contrepartieSimple!.numeroContrepartie}`);
        const compteContrepartie = tousComptes.find((c) => c.numero === contrepartieSimple!.numeroContrepartie);
        if (!compteContrepartie) throw new Error(`Compte ${contrepartieSimple!.numeroContrepartie} introuvable`);
        lignes = [
          { compteId: compteTresorerieId, debit: estRecette ? montantNombre : 0, credit: estRecette ? 0 : montantNombre },
          { compteId: compteContrepartie.id, debit: estRecette ? 0 : montantNombre, credit: estRecette ? montantNombre : 0 },
        ];
      }

      await api.post('/ecritures', {
        exerciceId: exerciceCourant.id,
        journalId: journalTresorerie.id,
        date,
        libelle: libelle || labelOperation,
        lignes,
      });
      setSucces(true);
      setTimeout(() => navigate('/'), 900);
    } catch (err) {
      // err instanceof Error couvre à la fois ApiError (messages venant du
      // backend) et les erreurs levées localement ci-dessus (journal absent
      // ou en sommeil) — les deux doivent remonter leur message précis,
      // jamais un message générique qui masquerait la vraie cause.
      setErreur(err instanceof Error ? err.message : "Erreur lors de l'enregistrement");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="p-2.5 flex justify-center">
      <form onSubmit={onSubmit} className="w-full max-w-[600px]">
        <div className="text-[10.5px] font-mono text-text-dim mb-1">SAISIR UNE OPÉRATION</div>
        <h1 className="text-[15px] font-bold mb-3">Enregistrer une opération</h1>

        <div className="bg-surface border border-border p-5 mb-3.5">
          <div className="font-mono text-[11px] font-semibold text-text-dim mb-2">TYPE D'OPÉRATION</div>
          <div className="flex flex-wrap border border-border w-fit mb-4">
            {[...(Object.keys(OPERATIONS) as TypeOperation[]), ...(Object.keys(OPERATIONS_TVA) as TypeOperation[])].map(
              (key, i) => (
                <button
                  type="button"
                  key={key}
                  onClick={() => {
                    setType(key);
                    setTauxTvaId('');
                    setCompteContrepartieTvaId('');
                  }}
                  className={`px-4 py-2 text-[12.5px] ${i > 0 ? 'border-l border-border' : ''} ${
                    type === key ? 'bg-sel text-white font-semibold' : 'text-text-dim'
                  }`}
                >
                  {estOperationTva(key) ? OPERATIONS_TVA[key].label : OPERATIONS[key as TypeOperationSimple].label}
                </button>
              ),
            )}
          </div>

          <div className="grid grid-cols-2 gap-px bg-border border border-border mb-px">
            <div className="bg-surface p-3">
              <label className="font-mono text-[10.5px] font-semibold text-text-dim block mb-1.5">DATE</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="font-mono text-[13px] w-full border-none p-0"
              />
            </div>
            <div className="bg-surface p-3">
              <label className="font-mono text-[10.5px] font-semibold text-text-dim block mb-1.5">
                {operationTva ? 'MONTANT HT' : 'MONTANT'}
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  required
                  min={0.01}
                  step="0.01"
                  value={montant}
                  onChange={(e) => setMontant(e.target.value)}
                  className="font-mono text-[14px] font-semibold w-full border-none p-0 text-right"
                />
                <span className="text-[11px] text-text-dim">CDF</span>
              </div>
            </div>
          </div>

          {operationTva && (
            <div className="border border-border border-t-0 mb-px">
              <div className="grid grid-cols-2 gap-px bg-border">
                <div className="bg-surface p-3">
                  <label className="font-mono text-[10.5px] font-semibold text-text-dim block mb-1.5">
                    {type === 'vente_tva' ? 'COMPTE DE PRODUIT' : 'COMPTE DE CHARGE'}
                  </label>
                  <select
                    required
                    value={compteContrepartieTvaId}
                    onChange={(e) => setCompteContrepartieTvaId(e.target.value)}
                    className="w-full border border-border-dark px-2 py-1 text-[12.5px]"
                  >
                    <option value="">— Sélectionner —</option>
                    {comptesContrepartieTva.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.numero} — {c.intitule}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="bg-surface p-3">
                  <label className="font-mono text-[10.5px] font-semibold text-text-dim block mb-1.5">TAUX DE TVA</label>
                  <select
                    required
                    value={tauxTvaId}
                    onChange={(e) => setTauxTvaId(e.target.value)}
                    className="w-full border border-border-dark px-2 py-1 text-[12.5px]"
                  >
                    <option value="">— Sélectionner —</option>
                    {tauxDisponibles.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.code} — {t.intitule}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {tauxTvaId && (
                <div className="p-2.5 font-mono text-[11px] text-text-dim flex justify-between bg-surface-alt">
                  <span>TVA ({tauxPourcent} %)</span>
                  <span>{montantTva.toLocaleString('fr-FR')} CDF</span>
                  <span className="font-semibold">TTC {montantTtc.toLocaleString('fr-FR')} CDF</span>
                </div>
              )}
            </div>
          )}

          <div className="border border-border border-t-0 mb-3">
            <div className="p-3">
              <label className="font-mono text-[10.5px] font-semibold text-text-dim block mb-1.5">
                {sens === 'recette' ? 'REÇU SUR LE COMPTE' : 'PAYÉ DEPUIS LE COMPTE'}
              </label>
              <select
                value={compteTresorerieId}
                onChange={(e) => setCompteTresorerieId(e.target.value)}
                className="w-full border border-border-dark px-2 py-1 text-[13px]"
              >
                {comptes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.intitule} ({c.numero})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="font-mono text-[10.5px] font-semibold text-text-dim block mb-1.5">
            LIBELLÉ (optionnel)
          </label>
          <input
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            placeholder={labelOperation}
            className="w-full border border-border-dark px-2 py-1.5 text-[13px]"
          />
        </div>

        <div className="border border-border mb-4">
          <button
            type="button"
            onClick={() => setVoirEcriture(!voirEcriture)}
            className="w-full flex items-center justify-between px-3 py-2 bg-surface-alt border-b border-border text-left"
          >
            <span className="font-mono text-[11px] font-semibold text-text-dim">
              {voirEcriture ? '▾' : '▸'} ÉCRITURE COMPTABLE GÉNÉRÉE
            </span>
            <span className="text-[10px] text-text-dim">pour les comptables</span>
          </button>
          {voirEcriture && (
            <div className="p-3 font-mono text-[11px] text-text-dim">
              {operationTva ? (
                <>
                  <div className="flex justify-between py-0.5">
                    <span>
                      {compteTresorerie?.numero} — {compteTresorerie?.intitule}
                    </span>
                    <span>{montantTtc.toLocaleString('fr-FR')}</span>
                  </div>
                  <div className="flex justify-between py-0.5 pl-4">
                    <span>
                      {comptesContrepartieTva.find((c) => c.id === compteContrepartieTvaId)?.numero ?? '—'} —{' '}
                      {comptesContrepartieTva.find((c) => c.id === compteContrepartieTvaId)?.intitule ?? 'compte'}
                    </span>
                    <span>{montantNombre.toLocaleString('fr-FR')}</span>
                  </div>
                  {montantTva > 0.005 && (
                    <div className="flex justify-between py-0.5 pl-4">
                      <span>
                        {(type === 'vente_tva' ? tauxSelectionne?.compteCollecte : tauxSelectionne?.compteDeductible)?.numero ?? '—'} — TVA {tauxPourcent} %
                      </span>
                      <span>{montantTva.toLocaleString('fr-FR')}</span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex justify-between py-0.5">
                    <span>
                      {compteTresorerie?.numero} — {compteTresorerie?.intitule}
                    </span>
                    <span>{montantNombre.toLocaleString('fr-FR')}</span>
                  </div>
                  <div className="flex justify-between py-0.5 pl-4">
                    <span>
                      {contrepartieSimple!.numeroContrepartie} — {contrepartieSimple!.label}
                    </span>
                    <span>{montantNombre.toLocaleString('fr-FR')}</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {erreur && <div className="text-[12px] text-danger bg-danger-soft border border-danger/30 px-3 py-2 mb-3">{erreur}</div>}
        {succes && (
          <div className="text-[12px] text-positive bg-positive-soft border border-positive/30 px-3 py-2 mb-3">
            Écriture enregistrée avec succès.
          </div>
        )}

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={envoi || !exerciceCourant}
            className="flex-1 bg-sel text-white text-[13px] font-semibold py-2.5 disabled:opacity-60"
          >
            {envoi ? 'Enregistrement…' : `Enregistrer ${labelOperation.toLowerCase()}`}
          </button>
          <button type="button" onClick={() => navigate('/')} className="text-[12.5px] text-text-dim">
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}
