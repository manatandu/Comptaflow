import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { montant } from '../lib/montants';
import type { Compte, Journal } from '../lib/types';
import { Aide } from './chrome/Aide';
import { ChampReglePar } from './ChampReglePar';
import type { CibleReglePar } from '../lib/regle-par';

/**
 * LA VENTILATION D'UN PRIX GLOBAL (lot 8) · terrain et bâtiment, ou fonds
 * de commerce (SYSCOHADA). Le serveur ventile, contrôle et crée une fiche et
 * une pièce par bien (`ImmobilisationService.acquerirAPrixGlobal`) · l'écran
 * ne calcule rien.
 */
type Fondement = 'ACTE' | 'VALEURS_ATTRIBUABLES' | 'COMPARAISON_TERRAINS_NUS' | 'COUT_RECONSTRUCTION' | 'PRIX_DE_MARCHE' | 'FORFAIT';
const FONDEMENTS: { cle: Fondement; libelle: string }[] = [
  { cle: 'ACTE', libelle: "Montants portés à l'acte" },
  { cle: 'COMPARAISON_TERRAINS_NUS', libelle: 'Terrain par comparaison, bâtiment par différence' },
  { cle: 'COUT_RECONSTRUCTION', libelle: 'Bâtiment au coût de reconstruction, terrain par différence' },
  { cle: 'VALEURS_ATTRIBUABLES', libelle: 'Au prorata des valeurs attribuables' },
  { cle: 'PRIX_DE_MARCHE', libelle: 'Prix de marché, un bien par différence' },
  { cle: 'FORFAIT', libelle: 'Forfait, un bien par différence' },
];

interface LigneBien {
  compteImmobilisationId: string;
  designation: string;
  montant: string;
  parDifference: boolean;
  dureeAmortissementAns: string;
}
const ligneVide = (): LigneBien => ({ compteImmobilisationId: '', designation: '', montant: '', parDifference: false, dureeAmortissementAns: '' });

export function PrixGlobalImmobilisations({
  exerciceId,
  journaux,
  comptesBien,
  comptes,
  syscohada,
  onCree,
}: {
  exerciceId: string | undefined;
  journaux: Journal[];
  comptesBien: { id: string; numero: string; intitule: string }[];
  comptes: Compte[];
  syscohada: boolean;
  onCree: () => void;
}) {
  const { peutEcrire } = useAuth();
  const [ouvert, setOuvert] = useState(false);
  const [nature, setNature] = useState<'ENSEMBLE' | 'FONDS_DE_COMMERCE'>('ENSEMBLE');
  const [fondement, setFondement] = useState<Fondement>('ACTE');
  const [date, setDate] = useState('');
  const [reference, setReference] = useState('');
  const [prix, setPrix] = useState('');
  const [contrepartie, setContrepartie] = useState('');
  const [source, setSource] = useState('');
  const [motifSansComparaison, setMotifSansComparaison] = useState('');
  const [biens, setBiens] = useState<LigneBien[]>([ligneVide(), ligneVide()]);
  const [stocks, setStocks] = useState<{ compteId: string; montant: string }[]>([]);
  const [dureeFonds, setDureeFonds] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<{ modalite: string; biens: { designation: string; montant: number }[] } | null>(null);
  const journalOd = journaux.find((j) => j.code === 'OD') ?? journaux[0];
  const comptesStock = comptes.filter((c) => /^3[0-8]/.test(c.numero));
  /*
    LE MÊME COMPTE CRÉDITÉ POUR CHAQUE FICHE · le serveur vérifie la
    contrepartie bien par bien avant la première (`acquerirAPrixGlobal`,
    `motifRefusContrepartie`), fonds commercial compris. La liste proposée est
    donc l'intersection des listes fermées des biens (`lib/regle-par.ts`).
    Le fonds commercial (21500000, le seul compte que le serveur ouvre pour
    le reliquat, `immobilisation.service.ts`) n'est créé que si un reliquat
    reste · l'écran ne calcule pas la ventilation et le compte toujours, ce
    qui peut écarter un compte qu'un reliquat nul aurait admis, jamais
    proposer un compte refusé. Absent du plan, il n'est pas visé · le serveur
    le refuse alors avec son propre motif.
  */
  const fondsCommercial = nature === 'FONDS_DE_COMMERCE' ? comptesBien.find((c) => c.numero === '21500000') : undefined;
  const ciblesReglement: CibleReglePar[] = [
    ...biens.map((b) => ({ compteImmobilisationId: b.compteImmobilisationId || null })),
    ...(fondsCommercial ? [{ compteImmobilisationId: fondsCommercial.id }] : []),
  ];

  if (!peutEcrire) return null;

  const majBien = (i: number, champ: Partial<LigneBien>) => setBiens(biens.map((x, j) => (j === i ? { ...x, ...champ } : x)));
  const avecDifference = nature === 'ENSEMBLE' && !['ACTE', 'VALEURS_ATTRIBUABLES'].includes(fondement);

  const envoyer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exerciceId || !journalOd) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await api.post<{ modalite: string; biens: { designation: string; montant: number }[] }>('/immobilisations/prix-global', {
        exerciceId,
        journalId: journalOd.id,
        dateAcquisition: date,
        referenceActe: reference,
        compteContrepartieId: contrepartie,
        prix: Number(prix),
        nature,
        ...(nature === 'ENSEMBLE' ? { fondement } : {}),
        ...(source.trim() ? { sourceValeurs: source } : {}),
        ...(motifSansComparaison.trim() ? { motifSansComparaison } : {}),
        biens: biens.map((b) => ({
          compteImmobilisationId: b.compteImmobilisationId,
          designation: b.designation,
          ...(avecDifference && b.parDifference ? { parDifference: true } : { montant: Number(b.montant) }),
          ...(b.dureeAmortissementAns ? { dureeAmortissementAns: Number(b.dureeAmortissementAns) } : {}),
        })),
        ...(nature === 'FONDS_DE_COMMERCE'
          ? {
              stocks: stocks.map((s) => ({ compteId: s.compteId, montant: Number(s.montant) })),
              ...(dureeFonds ? { dureeFondsCommercialAns: Number(dureeFonds) } : {}),
            }
          : {}),
      });
      setResultat(r);
      setBiens([ligneVide(), ligneVide()]);
      setStocks([]);
      onCree();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Acquisition refusée');
    } finally {
      setEnvoi(false);
    }
  };

  const champ = 'border border-border px-1.5 py-0.5 text-[11.5px]';
  return (
    <div className="border border-border bg-surface shadow-posee max-w-[1180px] mt-3">
      <div className="px-3.5 py-1.5 bg-chrome border-b border-border text-[11.5px] font-semibold text-text-dim flex items-center gap-1.5">
        Acquisition à prix global
        <Aide
          titre="Acquisition à prix global"
          texte="Des biens acquis ensemble pour un seul prix entrent chacun à sa part. Un terrain et son bâtiment suivent l'acte notarié, sinon la comparaison avec des terrains nus (bâtiment par différence), à défaut le coût de reconstruction du bâtiment (terrain par différence). D'autres biens se ventilent au prorata de leurs valeurs, ou par un prix de marché ou un forfait, un seul bien prenant la différence. Un fonds de commerce n'est pas inscrit comme tel · chaque élément va à sa nature, les stocks en classe 3, et le reste au fonds commercial. La modalité est gardée sur chaque fiche pour les Notes annexes. Une pièce par bien."
          source="AUDCIF art. 38 · Titre VIII ch. 11 § 1.7.1 · ch. 2 § 7.2.1"
        />
        {!ouvert && (
          <button type="button" onClick={() => setOuvert(true)} className="ml-auto bg-sel text-white text-[11px] font-semibold px-2.5 py-0.5">
            Saisir une acquisition
          </button>
        )}
      </div>
      {erreur && <div className="px-3.5 py-1.5 text-[11.5px] text-danger">{erreur}</div>}
      {resultat && (
        <div className="px-3.5 py-1.5 text-[11.5px]">
          {resultat.biens.map((b) => `${b.designation} ${montant(b.montant)}`).join(' · ')}
        </div>
      )}
      {ouvert && (
        <form onSubmit={(e) => void envoyer(e)} className="px-3.5 py-2 flex flex-col gap-2 text-[11.5px]">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col">
              Nature
              <select value={nature} onChange={(e) => setNature(e.target.value as 'ENSEMBLE' | 'FONDS_DE_COMMERCE')} className={champ}>
                <option value="ENSEMBLE">Biens acquis ensemble</option>
                {syscohada && <option value="FONDS_DE_COMMERCE">Fonds de commerce</option>}
              </select>
            </label>
            {nature === 'ENSEMBLE' && (
              <label className="flex flex-col">
                Méthode
                <select value={fondement} onChange={(e) => setFondement(e.target.value as Fondement)} className={champ}>
                  {FONDEMENTS.map((f) => (
                    <option key={f.cle} value={f.cle}>{f.libelle}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex flex-col">
              Date
              <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className={champ} />
            </label>
            <label className="flex flex-col">
              Acte ou facture
              <input required value={reference} onChange={(e) => setReference(e.target.value)} className={`${champ} w-36`} />
            </label>
            <label className="flex flex-col">
              Prix global
              <input required type="number" min="0.01" step="0.01" value={prix} onChange={(e) => setPrix(e.target.value)} className={`${champ} w-32`} />
            </label>
            <label className="flex flex-col">
              Réglé par
              <ChampReglePar cibles={ciblesReglement} value={contrepartie} onChange={setContrepartie} className={champ} vide="·" />
            </label>
          </div>
          {(nature === 'FONDS_DE_COMMERCE' || fondement !== 'ACTE') && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col">
                Source des valeurs
                <input required={nature === 'ENSEMBLE'} value={source} onChange={(e) => setSource(e.target.value)} className={`${champ} w-80`} />
              </label>
              {nature === 'ENSEMBLE' && fondement === 'COUT_RECONSTRUCTION' && (
                <label className="flex flex-col">
                  Pourquoi aucune comparaison
                  <input required value={motifSansComparaison} onChange={(e) => setMotifSansComparaison(e.target.value)} className={`${champ} w-80`} />
                </label>
              )}
            </div>
          )}
          {biens.map((b, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col">
                Compte du bien
                <select required value={b.compteImmobilisationId} onChange={(e) => majBien(i, { compteImmobilisationId: e.target.value })} className={champ}>
                  <option value="">·</option>
                  {comptesBien.map((c) => (
                    <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col">
                Désignation
                <input required value={b.designation} onChange={(e) => majBien(i, { designation: e.target.value })} className={`${champ} w-48`} />
              </label>
              {avecDifference && (
                <label className="flex items-center gap-1 pb-1">
                  <input type="checkbox" checked={b.parDifference} onChange={(e) => majBien(i, { parDifference: e.target.checked })} />
                  Par différence
                </label>
              )}
              {!(avecDifference && b.parDifference) && (
                <label className="flex flex-col">
                  {fondement === 'VALEURS_ATTRIBUABLES' && nature === 'ENSEMBLE' ? 'Valeur attribuable' : 'Montant'}
                  <input required type="number" min="0.01" step="0.01" value={b.montant} onChange={(e) => majBien(i, { montant: e.target.value })} className={`${champ} w-32`} />
                </label>
              )}
              <label className="flex flex-col">
                Durée (ans)
                <input type="number" min="1" max="100" value={b.dureeAmortissementAns} onChange={(e) => majBien(i, { dureeAmortissementAns: e.target.value })} className={`${champ} w-20`} />
              </label>
              {biens.length > 1 && (
                <button type="button" onClick={() => setBiens(biens.filter((_, j) => j !== i))} className="text-[11px] text-text-dim px-1.5 py-0.5">
                  Retirer
                </button>
              )}
            </div>
          ))}
          {nature === 'FONDS_DE_COMMERCE' && (
            <>
              {stocks.map((s, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col">
                    Stock repris
                    <select required value={s.compteId} onChange={(e) => setStocks(stocks.map((x, j) => (j === i ? { ...x, compteId: e.target.value } : x)))} className={champ}>
                      <option value="">·</option>
                      {comptesStock.map((c) => (
                        <option key={c.id} value={c.id}>{c.numero} {c.intitule}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col">
                    Valeur
                    <input required type="number" min="0.01" step="0.01" value={s.montant} onChange={(e) => setStocks(stocks.map((x, j) => (j === i ? { ...x, montant: e.target.value } : x)))} className={`${champ} w-32`} />
                  </label>
                  <button type="button" onClick={() => setStocks(stocks.filter((_, j) => j !== i))} className="text-[11px] text-text-dim px-1.5 py-0.5">
                    Retirer
                  </button>
                </div>
              ))}
              <label className="flex flex-col w-fit">
                Durée du fonds commercial (ans)
                <input type="number" min="1" max="100" value={dureeFonds} onChange={(e) => setDureeFonds(e.target.value)} className={`${champ} w-20`} />
              </label>
            </>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => setBiens([...biens, ligneVide()])} className="text-[11px] font-semibold text-sel px-1.5 py-0.5">
              Ajouter un bien
            </button>
            {nature === 'FONDS_DE_COMMERCE' && (
              <button type="button" onClick={() => setStocks([...stocks, { compteId: '', montant: '' }])} className="text-[11px] font-semibold text-sel px-1.5 py-0.5">
                Ajouter un stock
              </button>
            )}
            <button type="submit" disabled={envoi || !journalOd || !exerciceId} className="bg-sel text-white text-[11px] font-semibold px-2.5 py-1 disabled:opacity-50">
              {envoi ? '…' : 'Enregistrer'}
            </button>
            <button type="button" onClick={() => setOuvert(false)} className="text-[11px] font-semibold text-text-dim px-2.5 py-1">
              Annuler
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
