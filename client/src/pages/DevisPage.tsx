import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

/**
 * DEVIS ET COMMANDE CLIENT · l'OFFRE et son ACCEPTATION au sens de l'AUDCG.
 *
 * CE QUE CETTE FENÊTRE REFUSE DE FAIRE, et c'est sa raison d'être : changer
 * l'état d'un devis parce qu'une date est passée. L'art. 243 dit que « le
 * silence ou l'inaction ne peut à lui seul valoir acceptation », et il ne vaut
 * pas davantage rejet · un devis sans réponse dont le délai est écoulé est
 * CADUC, ni accepté ni refusé. Tous les logiciels de la place le basculent en
 * « refusé » : c'est attribuer au client un rejet qu'il n'a jamais exprimé.
 */
type Etat = {
  dateReference: string;
  aucuneConditionDeForme: { article: string; mention: string };
  delaisDeConformite: { cle: string; libelle: string; delai: string; article: string }[];
  devis: {
    id: string;
    emetteur: 'DOSSIER' | 'CLIENT';
    numero: string;
    dateEmission: string;
    delaiJours: number | null;
    declareeIrrevocable: boolean;
    nature: string;
    clientNom: string;
    objet: string | null;
    natureReponse: string | null;
    dateReponse: string | null;
    detailReponse: string | null;
    revoqueLe: string | null;
    contrePropositionDeId: string | null;
    lignes: { id: string; ordre: number; designation: string; quantite: number; prixUnitaire: number; montantHT: number }[];
    totalHT: number;
    prixPresume: { article: string; mention: string };
    perimetre: { regiParLeLivre8: boolean; article: string; motif: string };
    qualification: { estUneOffre: boolean; manques: string[]; article: string; requalification: string | null };
    etat: { etat: string; dateLimite: string | null; article: string; explication: string };
    revocabilite: { revocable: boolean; article: string; motif: string; reserve: string };
  }[];
};

const LIBELLE_ETAT: Record<string, string> = {
  EN_ATTENTE: 'En attente',
  ACCEPTE: 'Accepté · contrat formé',
  REFUSE: 'Refusé',
  CONTRE_PROPOSITION: 'Rejeté · contre-proposition',
  REVOQUE: 'Révoqué',
  CADUC: 'Caduc · sans réponse',
};

const somme = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const jour = (d: string | null) => (d ? d.slice(0, 10) : '·');

export function DevisPage() {
  const { peutEcrire } = useAuth();
  const [etat, setEtat] = useState<Etat | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [numero, setNumero] = useState('');
  const [dateEmission, setDateEmission] = useState('');
  const [clientNom, setClientNom] = useState('');
  const [objet, setObjet] = useState('');
  const [nature, setNature] = useState('MARCHANDISES');
  const [delaiJours, setDelaiJours] = useState<number | ''>('');
  const [irrevocable, setIrrevocable] = useState(false);
  const [designation, setDesignation] = useState('');
  const [quantite, setQuantite] = useState<number | ''>('');
  const [prixUnitaire, setPrixUnitaire] = useState<number | ''>('');
  const [montantHT, setMontantHT] = useState<number | ''>('');

  const recharger = () => api.get<Etat>('/commercial/devis').then(setEtat);
  useEffect(() => {
    void recharger().catch(() => setEtat(null));
  }, []);

  async function emettre() {
    setErreur(null);
    try {
      await api.post('/commercial/devis', {
        numero,
        dateEmission,
        nature,
        clientNom: clientNom || undefined,
        objet: objet || undefined,
        delaiJours: delaiJours === '' ? undefined : Number(delaiJours),
        declareeIrrevocable: irrevocable,
        lignes: [
          {
            designation,
            quantite: Number(quantite),
            prixUnitaire: Number(prixUnitaire),
            montantHT: Number(montantHT),
          },
        ],
      });
      setNumero('');
      setDesignation('');
      await recharger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "L'émission n'a pas abouti.");
    }
  }

  async function repondre(id: string, natureReponse: string) {
    setErreur(null);
    const detail =
      natureReponse.startsWith('MODIFICATION')
        ? window.prompt('Que modifie la réponse ? (l’art. 245 fait de la substantialité la charnière)')
        : null;
    if (natureReponse.startsWith('MODIFICATION') && !detail) return;
    const dateReponse = window.prompt('Date à laquelle la réponse est PARVENUE (AAAA-MM-JJ)', etat?.dateReference ?? '');
    if (!dateReponse) return;
    try {
      await api.patch(`/commercial/devis/${id}/reponse`, { natureReponse, dateReponse, detailReponse: detail ?? undefined });
      await recharger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "La réponse n'a pas été enregistrée.");
    }
  }

  if (!etat) return <div className="p-3 text-[12.5px] text-text-dim">Chargement…</div>;

  return (
    <div className="p-2 max-w-[1100px]">
      <p className="text-[12px] text-text-dim mb-2.5 leading-[1.6]">
        AUDCG, <strong>Livre 8</strong> · un devis n'est pas un brouillon de facture. S'il est suffisamment précis et
        indique la volonté d'être lié, c'est une <strong>offre</strong> (art. 241), et son acceptation forme le contrat
        (art. 244). {etat.aucuneConditionDeForme.mention}
      </p>

      {/* Émettre et répondre sont réservés à ADMIN_CABINET et COMPTABLE côté
          serveur · la lecture seule garde l'état de chaque offre et son motif. */}
      {peutEcrire && (
      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[12.5px] font-bold mb-1.5">Émettre un devis</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <label className="text-[12px]">
            Numéro
            <input className="w-full border border-border px-1.5 py-1 text-[12px]" value={numero} onChange={(e) => setNumero(e.target.value)} />
          </label>
          <label className="text-[12px]">
            Date d'émission
            <input type="date" className="w-full border border-border px-1.5 py-1 text-[12px]" value={dateEmission} onChange={(e) => setDateEmission(e.target.value)} />
          </label>
          <label className="text-[12px]">
            Client
            <input className="w-full border border-border px-1.5 py-1 text-[12px]" value={clientNom} onChange={(e) => setClientNom(e.target.value)} />
          </label>
          <label className="text-[12px]">
            Nature de l'opération
            <select className="w-full border border-border px-1.5 py-1 text-[12px]" value={nature} onChange={(e) => setNature(e.target.value)}>
              <option value="MARCHANDISES">Vente de marchandises</option>
              <option value="SERVICES">Prestation de services</option>
              <option value="MIXTE_SERVICES_PREPONDERANTS">Mixte, main-d'œuvre prépondérante</option>
              <option value="USAGE_PERSONNEL">Usage personnel, familial ou domestique</option>
              <option value="REGIME_PARTICULIER">Régime particulier (art. 236)</option>
            </select>
          </label>
          <label className="text-[12px]">
            Délai d'acceptation (jours)
            <input type="number" className="w-full border border-border px-1.5 py-1 text-[12px]" value={delaiJours} onChange={(e) => setDelaiJours(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
          <label className="text-[12px] flex items-center gap-1.5 mt-4">
            <input type="checkbox" checked={irrevocable} onChange={(e) => setIrrevocable(e.target.checked)} />
            Offre déclarée ferme (irrévocable)
          </label>
          <label className="text-[12px]">
            Objet
            <input className="w-full border border-border px-1.5 py-1 text-[12px]" value={objet} onChange={(e) => setObjet(e.target.value)} />
          </label>
          <label className="text-[12px]">
            Désignation
            <input className="w-full border border-border px-1.5 py-1 text-[12px]" value={designation} onChange={(e) => setDesignation(e.target.value)} />
          </label>
          <label className="text-[12px]">
            Quantité
            <input type="number" className="w-full border border-border px-1.5 py-1 text-[12px]" value={quantite} onChange={(e) => setQuantite(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
          <label className="text-[12px]">
            Prix unitaire
            <input type="number" className="w-full border border-border px-1.5 py-1 text-[12px]" value={prixUnitaire} onChange={(e) => setPrixUnitaire(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
          <label className="text-[12px]">
            Montant HT
            <input type="number" className="w-full border border-border px-1.5 py-1 text-[12px]" value={montantHT} onChange={(e) => setMontantHT(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
        </div>

        {/* DEUX CONDITIONS CUMULATIVES · un délai seul n'engage à rien. Le dire
            ici évite qu'un cabinet se croie tenu, ou se croie libre. */}
        <p className="text-[11px] text-text-dim mt-2 leading-[1.6]">
          Un délai seul ne rend PAS l'offre ferme : l'art. 242 exige un délai déterminé <strong>et</strong> la
          déclaration d'irrévocabilité. Sans délai stipulé, l'art. 243 renvoie à un « délai raisonnable » qu'aucune
          source ne chiffre, et que le logiciel ne remplace par aucune convention.
        </p>
        {erreur && <p className="text-[12px] text-danger mt-2">{erreur}</p>}
        <button className="mt-2 border border-border px-2.5 py-1 text-[12px]" onClick={() => void emettre()}>
          Émettre
        </button>
      </section>
      )}

      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[12.5px] font-bold mb-1.5">Délais de dénonciation à rappeler au client</h2>
        <ul className="text-[12px] text-text-dim leading-[1.6]">
          {etat.delaisDeConformite.map((d) => (
            <li key={d.cle}>
              <strong>{d.libelle}</strong> · {d.delai} ({d.article})
            </li>
          ))}
        </ul>
      </section>

      <section className="border border-border bg-surface px-3.5 py-2.5">
        <h2 className="text-[12.5px] font-bold mb-1.5">Devis émis et reçus</h2>
        {etat.devis.length === 0 ? (
          <p className="text-[12px] text-text-dim">Aucun devis enregistré.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="py-1 pr-2">Numéro</th>
                  <th className="py-1 pr-2">Émis le</th>
                  <th className="py-1 pr-2">Client</th>
                  <th className="py-1 pr-2 text-right">Total HT</th>
                  <th className="py-1 pr-2">Limite</th>
                  <th className="py-1 pr-2">État</th>
                  <th className="py-1">Ce que le texte en dit</th>
                </tr>
              </thead>
              <tbody>
                {etat.devis.map((d) => (
                  <tr key={d.id} className="border-b border-border/50 align-top">
                    <td className="py-1 pr-2">
                      {d.numero}
                      {d.emetteur === 'CLIENT' && <div className="text-[11px] text-text-dim">reçu du client</div>}
                    </td>
                    <td className="py-1 pr-2">{jour(d.dateEmission)}</td>
                    <td className="py-1 pr-2">{d.clientNom}</td>
                    <td className="py-1 pr-2 text-right">{somme(d.totalHT)}</td>
                    <td className="py-1 pr-2">{jour(d.etat.dateLimite)}</td>
                    <td className="py-1 pr-2">{LIBELLE_ETAT[d.etat.etat] ?? d.etat.etat}</td>
                    <td className="py-1">
                      <p className="text-[11px] text-text-dim leading-[1.6]">
                        {d.etat.explication} ({d.etat.article})
                      </p>
                      {!d.perimetre.regiParLeLivre8 && (
                        // LE PÉRIMÈTRE EST DIT SUR LA LIGNE, pas en note de bas
                        // de page · un cabinet qui vend des services ne doit pas
                        // lire des règles qui ne le régissent pas.
                        <p className="text-[11px] text-text-dim leading-[1.6] mt-1">
                          <strong>Hors Livre 8</strong> · {d.perimetre.motif}
                        </p>
                      )}
                      {!d.qualification.estUneOffre && (
                        <p className="text-[11px] text-danger leading-[1.6] mt-1">{d.qualification.requalification}</p>
                      )}
                      {peutEcrire && d.etat.etat === 'EN_ATTENTE' && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          <button className="border border-border px-1.5 py-0.5 text-[11px]" onClick={() => void repondre(d.id, 'ACCEPTATION')}>
                            Acceptation reçue
                          </button>
                          <button className="border border-border px-1.5 py-0.5 text-[11px]" onClick={() => void repondre(d.id, 'MODIFICATION_NON_SUBSTANTIELLE')}>
                            Réponse modifiée, non substantielle
                          </button>
                          <button className="border border-border px-1.5 py-0.5 text-[11px]" onClick={() => void repondre(d.id, 'MODIFICATION_SUBSTANTIELLE')}>
                            Modification substantielle
                          </button>
                          <button className="border border-border px-1.5 py-0.5 text-[11px]" onClick={() => void repondre(d.id, 'REFUS')}>
                            Refus reçu
                          </button>
                        </div>
                      )}
                      {d.etat.etat === 'CADUC' && (
                        <p className="text-[11px] text-text-dim leading-[1.6] mt-1">
                          Une réponse tardive reste enregistrable : c'est un fait, et le logiciel n'en décide pas à la
                          place des parties.
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-text-dim mt-2 leading-[1.6]">
              {etat.devis[0]?.prixPresume.mention} ({etat.devis[0]?.prixPresume.article})
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
