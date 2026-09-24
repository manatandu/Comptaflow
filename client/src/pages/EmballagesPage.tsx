import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { EnteteImpression } from '../components/chrome/EnteteImpression';
import type { Tiers } from '../lib/types';

/**
 * CONSIGNATION D'EMBALLAGES · le compte d'attente qu'il faut dénouer.
 *
 * « Les comptes relatifs aux emballages fonctionnent de la même manière que
 * ceux relatifs aux marchandises et matières. La seule particularité concerne
 * la CONSIGNATION. »
 *
 * CE QUE CET ÉCRAN EXISTE POUR MONTRER · le 4094 et le 4194 sont des comptes
 * d'ATTENTE. Un 4194 laissé en l'état à la clôture est une dette envers un
 * client qui, peut-être, ne rendra jamais l'emballage. La balance boucle, et
 * rien n'y dit combien de consignations restent à qualifier : c'est le bandeau
 * du haut qui le dit.
 */

type Sens = 'EMISE' | 'RECUE';
type Nature = 'EMBALLAGE' | 'MATERIEL';
type Etat = 'EN_COURS' | 'RESTITUEE' | 'CONSERVEE' | 'REPRISE_SOUS_PRIX';
type Mode = 'RESTITUTION' | 'CONSERVATION' | 'REPRISE_PRIX_INFERIEUR';

interface ConsignationVue {
  id: string;
  tiers: { code: string; nom: string };
  sens: Sens;
  nature: Nature;
  designation: string;
  quantite: number | null;
  dateConsignation: string;
  montant: number;
  etat: Etat;
  dateDenouement: string | null;
  prixDeReprise: number | null;
}

interface Registre {
  referentiel: 'SYCEBNL' | 'SYSCOHADA';
  consignations: ConsignationVue[];
  enAttente: { nombre: number; detteEmise: number; creanceRecue: number };
}

interface Proposition {
  lignes: {
    compte: string;
    intitule: string;
    libelle: string;
    sens: 'DEBIT' | 'CREDIT';
    montant: number;
    reserve?: string;
  }[];
  refus: { motif: string; explication: string } | null;
  reserves: string[];
}

const mt = (n: number) =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const LIBELLE_ETAT: Record<Etat, string> = {
  EN_COURS: 'En cours',
  RESTITUEE: 'Restituée',
  CONSERVEE: 'Conservée',
  REPRISE_SOUS_PRIX: 'Reprise sous le prix',
};

export function EmballagesPage() {
  const { peutEcrire } = useAuth();
  const [registre, setRegistre] = useState<Registre | null>(null);
  const [tiers, setTiers] = useState<Tiers[]>([]);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');
  const [enCours, setEnCours] = useState(false);

  const [nouvelle, setNouvelle] = useState({
    tiersId: '',
    sens: 'EMISE' as Sens,
    nature: 'EMBALLAGE' as Nature,
    designation: '',
    quantite: '',
    dateConsignation: '',
    montant: '',
  });

  const [selection, setSelection] = useState<ConsignationVue | null>(null);
  const [mode, setMode] = useState<Mode>('RESTITUTION');
  const [prixDeReprise, setPrixDeReprise] = useState('');
  const [dateDenouement, setDateDenouement] = useState('');
  const [proposition, setProposition] = useState<Proposition | null>(null);

  const charger = useCallback(() => {
    api.get<Registre>('/emballages/consignations').then(setRegistre, (e: ApiError) =>
      setErreur(e.message),
    );
  }, []);

  useEffect(charger, [charger]);
  useEffect(() => {
    api.get<Tiers[]>('/tiers').then(setTiers, () => undefined);
  }, []);

  const creer = async () => {
    setErreur('');
    setSucces('');
    setEnCours(true);
    try {
      await api.post('/emballages/consignations', {
        tiersId: nouvelle.tiersId,
        sens: nouvelle.sens,
        nature: nouvelle.nature,
        designation: nouvelle.designation.trim(),
        ...(nouvelle.quantite ? { quantite: Number(nouvelle.quantite) } : {}),
        dateConsignation: nouvelle.dateConsignation,
        montant: Number(nouvelle.montant),
      });
      setSucces('Consignation enregistrée au registre.');
      setNouvelle({ ...nouvelle, designation: '', quantite: '', montant: '' });
      charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Enregistrement impossible');
    } finally {
      setEnCours(false);
    }
  };

  // LA SIMULATION NE FAIT BOUGER AUCUN REGISTRE · elle montre les lignes avant
  // que le comptable ne décide, et un refus s'y lit sans rien avoir engagé.
  const simuler = useCallback(
    async (c: ConsignationVue, m: Mode, prix: string) => {
      setErreur('');
      try {
        const query = new URLSearchParams({ mode: m });
        if (m === 'REPRISE_PRIX_INFERIEUR' && prix) query.set('prixDeReprise', prix);
        setProposition(
          await api.get<Proposition>(`/emballages/consignations/${c.id}/denouement?${query}`),
        );
      } catch (e) {
        setProposition(null);
        setErreur(e instanceof ApiError ? e.message : 'Simulation impossible');
      }
    },
    [],
  );

  useEffect(() => {
    if (selection) void simuler(selection, mode, prixDeReprise);
  }, [selection, mode, prixDeReprise, simuler]);

  const denouer = async () => {
    if (!selection || !dateDenouement) return;
    setErreur('');
    setSucces('');
    setEnCours(true);
    try {
      await api.post(`/emballages/consignations/${selection.id}/denouement`, {
        mode,
        dateDenouement,
        ...(mode === 'REPRISE_PRIX_INFERIEUR' && prixDeReprise
          ? { prixDeReprise: Number(prixDeReprise) }
          : {}),
      });
      setSucces('Consignation dénouée au registre. L\'écriture proposée reste à passer au journal.');
      setSelection(null);
      setProposition(null);
      charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Dénouement impossible');
    } finally {
      setEnCours(false);
    }
  };

  const champ =
    'border border-border bg-surface px-1.5 py-1 text-[12px] w-full focus:outline-none focus:border-accent';
  const cell = 'px-2 py-1 border border-border';

  return (
    <div className="p-2">
      <EnteteImpression titre="Consignation d'emballages" />
      <div className="ecran-seul mb-1.5 max-w-[1240px]">
        <div className="text-[11px] font-mono text-text-dim leading-none">
          Comptes 4094 et 4194 · comptes d'attente
        </div>
        <h1 className="text-[13px] font-bold leading-tight">Consignation d'emballages</h1>
        <div className="text-[11px] text-text-dim mt-0.5">
          « Les comptes relatifs aux emballages fonctionnent de la même manière que ceux relatifs aux
          marchandises et matières. La seule particularité concerne la CONSIGNATION. » · AUDCIF
          Titre VII et SYCEBNL Partie 2 ch. 3, fiches des comptes 40 et 41.
        </div>
      </div>

      {erreur && (
        <div className="border border-danger/30 bg-danger-soft px-3.5 py-2 mb-2.5 text-[12px] max-w-[1240px]">
          {erreur}
        </div>
      )}
      {succes && (
        <div className="border border-ok/30 bg-ok-soft px-3.5 py-2 mb-2.5 text-[12px] max-w-[1240px]">
          {succes}
        </div>
      )}

      {/* CE QUI RESTE À QUALIFIER · les deux sens ne s'additionnent JAMAIS.
          Une dette de consignation et une créance de consignation sont de sens
          opposés au bilan ; leur somme ne veut rien dire. */}
      {registre && (
        <div className="border border-border bg-surface-2 px-3.5 py-2.5 mb-2.5 text-[12px] max-w-[1240px]">
          <span className="font-semibold">{registre.enAttente.nombre} consignation(s) en attente</span>
          {' · '}
          dette envers les clients (4194) {mt(registre.enAttente.detteEmise)}
          {' · '}
          créance sur les fournisseurs (4094) {mt(registre.enAttente.creanceRecue)}.
          <div className="text-[10.5px] text-text-dim mt-1">
            Une consignation non dénouée à la clôture est une dette envers un client qui, peut-être,
            ne rendra jamais l'emballage. La balance boucle quand même : c'est ici que l'attente se
            voit. Les deux montants ne s'additionnent pas, ils sont de sens opposés au bilan.
          </div>
        </div>
      )}

      {peutEcrire && (
      <div className="ecran-seul border border-border bg-surface-2 px-3 py-2.5 mb-2.5 max-w-[1240px]">
        <div className="text-[12px] font-semibold mb-1.5">Nouvelle consignation</div>
        <div className="grid grid-cols-7 gap-2">
          <select
            className={champ}
            value={nouvelle.tiersId}
            onChange={(e) => setNouvelle({ ...nouvelle, tiersId: e.target.value })}
          >
            <option value="">Tiers…</option>
            {tiers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.code} {t.nom}
              </option>
            ))}
          </select>
          <select
            className={champ}
            value={nouvelle.sens}
            onChange={(e) => setNouvelle({ ...nouvelle, sens: e.target.value as Sens })}
          >
            <option value="EMISE">Émise (à un client)</option>
            <option value="RECUE">Reçue (d'un fournisseur)</option>
          </select>
          <select
            className={champ}
            value={nouvelle.nature}
            onChange={(e) => setNouvelle({ ...nouvelle, nature: e.target.value as Nature })}
          >
            <option value="EMBALLAGE">Emballage</option>
            <option value="MATERIEL">Matériel</option>
          </select>
          <input
            className={champ}
            placeholder="Désignation"
            value={nouvelle.designation}
            onChange={(e) => setNouvelle({ ...nouvelle, designation: e.target.value })}
          />
          <input
            className={champ}
            placeholder="Quantité (facultatif)"
            value={nouvelle.quantite}
            onChange={(e) => setNouvelle({ ...nouvelle, quantite: e.target.value })}
          />
          <input
            type="date"
            className={champ}
            value={nouvelle.dateConsignation}
            onChange={(e) => setNouvelle({ ...nouvelle, dateConsignation: e.target.value })}
          />
          <input
            className={champ}
            placeholder="Montant consigné"
            value={nouvelle.montant}
            onChange={(e) => setNouvelle({ ...nouvelle, montant: e.target.value })}
          />
        </div>
        <div className="mt-1.5 flex items-center gap-3">
          <button
            type="button"
            disabled={
              enCours ||
              !nouvelle.tiersId ||
              !nouvelle.designation.trim() ||
              !nouvelle.dateConsignation ||
              !nouvelle.montant
            }
            onClick={creer}
            className="px-3 py-1 text-[12px] border border-accent bg-accent/10 disabled:opacity-40"
          >
            Enregistrer au registre
          </button>
          <span className="text-[10.5px] text-text-dim">
            La NATURE est saisie, jamais déduite · les deux textes routent la conservation d'un
            emballage et celle d'un matériel vers des comptes différents.
          </span>
        </div>
      </div>
      )}

      <table className="w-full border-collapse text-[12px] mb-2.5 max-w-[1240px]">
        <thead>
          <tr className="bg-surface-2 text-text-dim">
            <th className={`${cell} text-left font-semibold`}>Date</th>
            <th className={`${cell} text-left font-semibold`}>Tiers</th>
            <th className={`${cell} text-left font-semibold`}>Sens</th>
            <th className={`${cell} text-left font-semibold`}>Nature</th>
            <th className={`${cell} text-left font-semibold`}>Désignation</th>
            <th className={`${cell} text-right font-semibold`}>Montant</th>
            <th className={`${cell} text-left font-semibold`}>État</th>
          </tr>
        </thead>
        <tbody>
          {registre?.consignations.map((c) => (
            <tr
              key={c.id}
              onClick={() => {
                if (c.etat === 'EN_COURS') setSelection(c);
              }}
              className={`${c.etat === 'EN_COURS' ? 'cursor-pointer' : 'text-text-dim'} ${
                selection?.id === c.id ? 'bg-accent/10' : ''
              }`}
            >
              <td className={`${cell} font-mono`}>{c.dateConsignation}</td>
              <td className={cell}>
                {c.tiers.code} {c.tiers.nom}
              </td>
              <td className={cell}>{c.sens === 'EMISE' ? 'Émise' : 'Reçue'}</td>
              <td className={cell}>{c.nature === 'EMBALLAGE' ? 'Emballage' : 'Matériel'}</td>
              <td className={cell}>{c.designation}</td>
              <td className={`${cell} text-right font-mono`}>{mt(c.montant)}</td>
              <td className={cell}>{LIBELLE_ETAT[c.etat]}</td>
            </tr>
          ))}
          {registre?.consignations.length === 0 && (
            <tr>
              <td className={`${cell} text-text-dim`} colSpan={7}>
                Aucune consignation au registre.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {selection && (
        <div className="ecran-seul border border-border bg-surface-2 px-3 py-2.5 max-w-[1240px]">
          <div className="text-[12px] font-semibold mb-1.5">
            Dénouer · {selection.designation} ({mt(selection.montant)})
          </div>
          <div className="grid grid-cols-4 gap-2">
            <select
              className={champ}
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
            >
              <option value="RESTITUTION">Restitution</option>
              <option value="CONSERVATION">Conservation par le consignataire</option>
              <option value="REPRISE_PRIX_INFERIEUR">Reprise sous le prix de consignation</option>
            </select>
            <input
              className={champ}
              placeholder="Prix repris"
              disabled={mode !== 'REPRISE_PRIX_INFERIEUR'}
              value={mode === 'REPRISE_PRIX_INFERIEUR' ? prixDeReprise : ''}
              onChange={(e) => setPrixDeReprise(e.target.value)}
            />
            {/* La simulation (GET) reste ouverte à la lecture seule, qui peut
                voir l'écriture proposée · seul l'enregistrement du dénouement
                est réservé à ADMIN_CABINET et COMPTABLE côté serveur. */}
            {peutEcrire && (
              <>
                <input
                  type="date"
                  className={champ}
                  value={dateDenouement}
                  onChange={(e) => setDateDenouement(e.target.value)}
                />
                <button
                  type="button"
                  disabled={enCours || !dateDenouement || !!proposition?.refus}
                  onClick={denouer}
                  className="px-3 py-1 text-[12px] border border-accent bg-accent/10 disabled:opacity-40"
                >
                  Dénouer
                </button>
              </>
            )}
          </div>

          {/* LE REFUS EST MONTRÉ AVANT LE GESTE, PAS APRÈS · c'est là que le
              comptable peut encore changer d'avis. */}
          {proposition?.refus && (
            <div className="border border-danger/30 bg-danger-soft px-3 py-2 mt-2 text-[11px]">
              {proposition.refus.explication}
            </div>
          )}

          {proposition && !proposition.refus && (
            <>
              <table className="w-full border-collapse text-[12px] mt-2">
                <thead>
                  <tr className="bg-surface text-text-dim">
                    <th className={`${cell} text-left font-semibold`}>Compte</th>
                    <th className={`${cell} text-left font-semibold`}>Intitulé</th>
                    <th className={`${cell} text-right font-semibold`}>Débit</th>
                    <th className={`${cell} text-right font-semibold`}>Crédit</th>
                  </tr>
                </thead>
                <tbody>
                  {proposition.lignes.map((l, i) => (
                    <tr key={`${l.compte}-${i}`}>
                      <td className={`${cell} font-mono`}>{l.compte}</td>
                      <td className={cell}>
                        {l.intitule}
                        {l.reserve && (
                          <span className="block text-[10px] text-warning mt-0.5">{l.reserve}</span>
                        )}
                      </td>
                      <td className={`${cell} text-right font-mono`}>
                        {l.sens === 'DEBIT' ? mt(l.montant) : ''}
                      </td>
                      <td className={`${cell} text-right font-mono`}>
                        {l.sens === 'CREDIT' ? mt(l.montant) : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {proposition.reserves.map((r) => (
                <div key={r} className="text-[10.5px] text-text-dim mt-1.5">
                  {r}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
