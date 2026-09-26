import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Aide } from '../components/chrome/Aide';
import { BlocEmetteur, montantImprime, TableauLignes } from '../components/PieceImprimable';
import { avertissementArticle17, type MentionsRecopiees } from '../lib/mentions-piece';

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
    /** AUSCGIE art. 17, recopiée quand le dossier émet · null sur une offre reçue ou antérieure. */
    mentionsSocieteEmetteur: MentionsRecopiees | null;
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

type UnDevis = Etat['devis'][number];

export function DevisPage() {
  const { peutEcrire, utilisateur } = useAuth();
  // L'offre remise au client · seule imprimée tant qu'elle est ouverte.
  const [aImprimer, setAImprimer] = useState<UnDevis | null>(null);
  const dossierEstUneSociete = !!utilisateur?.tenant?.mentionsSociete;
  useEffect(() => {
    const fermer = () => setAImprimer(null);
    window.addEventListener('afterprint', fermer);
    return () => window.removeEventListener('afterprint', fermer);
  }, []);
  const imprimer = (d: UnDevis) => {
    setAImprimer(d);
    window.setTimeout(() => window.print(), 50);
  };
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

  if (!etat) return <div className="p-3 text-[11.5px] text-text-dim">Chargement…</div>;

  return (
    <div className={`p-2 max-w-[1100px] ${aImprimer ? 'avec-edition' : ''}`}>
      {aImprimer && <DevisImprime d={aImprimer} delais={etat.delaisDeConformite} nomDossier={utilisateur?.tenant?.nom ?? ''} />}
      {/* Émettre et répondre sont réservés à ADMIN_CABINET et COMPTABLE côté
          serveur · la lecture seule garde l'état de chaque offre et son motif. */}
      {peutEcrire && (
      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[11.5px] font-bold mb-1.5">Émettre un devis</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <label className="text-[11.5px]">
            Numéro
            <input className="w-full border border-border px-1.5 py-1 text-[11.5px]" value={numero} onChange={(e) => setNumero(e.target.value)} />
          </label>
          <label className="text-[11.5px]">
            Date d'émission
            <input type="date" className="w-full border border-border px-1.5 py-1 text-[11.5px]" value={dateEmission} onChange={(e) => setDateEmission(e.target.value)} />
          </label>
          <label className="text-[11.5px]">
            Client
            <input className="w-full border border-border px-1.5 py-1 text-[11.5px]" value={clientNom} onChange={(e) => setClientNom(e.target.value)} />
          </label>
          <label className="text-[11.5px]">
            Nature de l'opération
            <select className="w-full border border-border px-1.5 py-1 text-[11.5px]" value={nature} onChange={(e) => setNature(e.target.value)}>
              <option value="MARCHANDISES">Vente de marchandises</option>
              <option value="SERVICES">Prestation de services</option>
              <option value="MIXTE_SERVICES_PREPONDERANTS">Mixte, main-d'œuvre prépondérante</option>
              <option value="USAGE_PERSONNEL">Usage personnel, familial ou domestique</option>
              <option value="REGIME_PARTICULIER">Régime particulier (art. 236)</option>
            </select>
          </label>
          <label className="text-[11.5px]">
            Délai d'acceptation (jours)
            <input type="number" className="w-full border border-border px-1.5 py-1 text-[11.5px]" value={delaiJours} onChange={(e) => setDelaiJours(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
          <label className="text-[11.5px] flex items-center gap-1.5 mt-4">
            <input type="checkbox" checked={irrevocable} onChange={(e) => setIrrevocable(e.target.checked)} />
            Offre déclarée ferme (irrévocable)
            <Aide
              titre="Offre ferme"
              texte="Un délai seul ne rend PAS l'offre ferme : il faut un délai déterminé et la déclaration d'irrévocabilité. Sans délai stipulé, l'art. 243 renvoie à un « délai raisonnable » qu'aucune source ne chiffre, et que le logiciel ne remplace par aucune convention."
              source="AUDCG, art. 242 et 243"
            />
          </label>
          <label className="text-[11.5px]">
            Objet
            <input className="w-full border border-border px-1.5 py-1 text-[11.5px]" value={objet} onChange={(e) => setObjet(e.target.value)} />
          </label>
          <label className="text-[11.5px]">
            Désignation
            <input className="w-full border border-border px-1.5 py-1 text-[11.5px]" value={designation} onChange={(e) => setDesignation(e.target.value)} />
          </label>
          <label className="text-[11.5px]">
            Quantité
            <input type="number" className="w-full border border-border px-1.5 py-1 text-[11.5px]" value={quantite} onChange={(e) => setQuantite(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
          <label className="text-[11.5px]">
            Prix unitaire
            <input type="number" className="w-full border border-border px-1.5 py-1 text-[11.5px]" value={prixUnitaire} onChange={(e) => setPrixUnitaire(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
          <label className="text-[11.5px]">
            Montant HT
            <input type="number" className="w-full border border-border px-1.5 py-1 text-[11.5px]" value={montantHT} onChange={(e) => setMontantHT(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
        </div>

        {erreur && <p className="text-[11.5px] text-danger mt-2">{erreur}</p>}
        <button className="mt-2 border border-border px-2.5 py-1 text-[11.5px]" onClick={() => void emettre()}>
          Émettre
        </button>
      </section>
      )}

      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[11.5px] font-bold mb-1.5">Délais de dénonciation à rappeler au client</h2>
        <ul className="text-[11.5px] text-text-dim leading-[1.6]">
          {etat.delaisDeConformite.map((d) => (
            <li key={d.cle}>
              <strong>{d.libelle}</strong> · {d.delai} ({d.article})
            </li>
          ))}
        </ul>
      </section>

      <section className="border border-border bg-surface px-3.5 py-2.5">
        <h2 className="text-[11.5px] font-bold mb-1.5 flex items-center gap-1.5">
          Devis émis et reçus
          <Aide
            titre="Devis et offre"
            texte={`Un devis n'est pas un brouillon de facture. S'il est suffisamment précis et indique la volonté d'être lié, c'est une offre (art. 241), et son acceptation forme le contrat (art. 244). ${etat.aucuneConditionDeForme.mention}`}
            source="AUDCG, Livre 8"
          />
        </h2>
        {etat.devis.length === 0 ? (
          <p className="text-[11.5px] text-text-dim">Aucun devis enregistré.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11.5px]">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="py-1 pr-2">Numéro</th>
                  <th className="py-1 pr-2">Émis le</th>
                  <th className="py-1 pr-2">Client</th>
                  <th className="py-1 pr-2 text-right">
                    Total HT{' '}
                    {etat.devis[0] && (
                      <Aide titre="Prix" texte={etat.devis[0].prixPresume.mention} source={etat.devis[0].prixPresume.article} />
                    )}
                  </th>
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
                      {/* Seule une offre que le DOSSIER émet part chez le client. */}
                      {d.emetteur === 'DOSSIER' && (
                        <div>
                          <button className="text-[11px] underline" onClick={() => imprimer(d)}>
                            Imprimer
                          </button>
                          {avertissementArticle17(d.mentionsSocieteEmetteur, dossierEstUneSociete) && (
                            <p className="text-[11px] text-warning">{avertissementArticle17(d.mentionsSocieteEmetteur, dossierEstUneSociete)}</p>
                          )}
                        </div>
                      )}
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
                        <div className="mt-1">
                          <Aide
                            titre="Devis caduc"
                            texte="Une réponse tardive reste enregistrable : c'est un fait, et le logiciel n'en décide pas à la place des parties."
                            source={d.etat.article}
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * L'offre telle qu'elle part chez le client. Elle porte ce que le texte attache
 * à la vente et que le client découvre d'ordinaire trop tard · le prix présumé
 * hors taxes (art. 263) et les deux délais de dénonciation (art. 258 et 259).
 * Le délai d'acceptation court de la date portée sur l'offre (art. 246), et
 * « offre ferme » n'est imprimé que si elle a été DÉCLARÉE irrévocable avec un
 * délai (art. 242) · un délai seul n'engage à rien.
 */
function DevisImprime({ d, delais, nomDossier }: { d: UnDevis; delais: Etat['delaisDeConformite']; nomDossier: string }) {
  return (
    <div className="impression-seul text-[12px] text-black">
      <div className="flex justify-between gap-6 mb-6">
        {/* Le devis ne recopiait pas le nom avant l'art. 17 · à défaut, celui du
            dossier, et l'écran a dit que la pièce est antérieure. */}
        <BlocEmetteur mentions={d.mentionsSocieteEmetteur} nomRepli={nomDossier} />
        <div className="text-right font-bold">{d.clientNom}</div>
      </div>
      <div className="text-[15px] font-bold mb-1">DEVIS N° {d.numero}</div>
      <div className="mb-1">du {new Date(d.dateEmission).toLocaleDateString('fr-FR')}</div>
      {d.objet && <div className="mb-4">Objet : {d.objet}</div>}
      <TableauLignes lignes={d.lignes} avecTva={false} />
      <div className="text-right font-bold mb-4">Total hors taxes : {montantImprime(d.totalHT)}</div>
      <div className="mb-1">{d.prixPresume.mention} ({d.prixPresume.article})</div>
      {d.delaiJours !== null && (
        <div className="mb-1">
          Offre valable {d.delaiJours} jours à compter du {new Date(d.dateEmission).toLocaleDateString('fr-FR')}
          {d.declareeIrrevocable && ', ferme et irrévocable pendant ce délai'}.
        </div>
      )}
      <div className="mt-3">Dénonciation des défauts de conformité :</div>
      <ul className="list-disc pl-5">
        {delais.map((x) => (
          <li key={x.cle}>
            {x.libelle} : {x.delai} ({x.article}).
          </li>
        ))}
      </ul>
    </div>
  );
}
