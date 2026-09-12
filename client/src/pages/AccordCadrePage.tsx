import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';

/**
 * ACCORD-CADRE AVEC LE MINISTÈRE DU PLAN · le manque que le logiciel déclarait
 * lui-même. `exemption-is-ebnl.ts` écrivait « OmegaX NE TIENT PAS
 * l'accord-cadre » ; c'est cette fenêtre qui le tient.
 *
 * ELLE DIT AUSSI CE QU'ELLE N'EST PAS. L'accord-cadre conditionne l'EXISTENCE
 * de l'ONG étrangère en RDC (art. 37) ; ce sont l'arrêté interministériel de
 * l'art. 39 et le module Exonérations qui ouvrent les facilités. Croire qu'un
 * accord signé exonère ferait dédouaner sur une pièce qui ne le permet pas.
 */
type Etat = {
  applicable: boolean;
  modele: { dureeAnnees: number; preavisMois: number; source: string };
  partMinimaleMainOeuvreLocale: number;
  dateReference: string;
  accords: {
    id: string;
    reference: string;
    dateSignature: string;
    dureeAnnees: number;
    taciteReconduction: boolean;
    preavisMois: number | null;
    denonceLe: string | null;
    motifDenonciation: string | null;
    representationRdc: string | null;
    attestationsBonneConduiteLe: string | null;
    partMainOeuvreLocale: number | null;
    sourceMainOeuvre: string | null;
    dateMainOeuvre: string | null;
    etat: {
      finDePeriode: string;
      periodeEcoulee: boolean;
      enTaciteReconduction: boolean;
      dernierJourPourDenoncer: string | null;
    };
  }[];
};

const jour = (d: string | null) => (d ? d.slice(0, 10) : '·');

export function AccordCadrePage() {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [reference, setReference] = useState('');
  const [dateSignature, setDateSignature] = useState('');
  const [dureeAnnees, setDureeAnnees] = useState<number | ''>('');
  const [tacite, setTacite] = useState(false);
  const [preavisMois, setPreavisMois] = useState<number | ''>('');
  const [representationRdc, setRepresentationRdc] = useState('');

  const recharger = () => api.get<Etat>('/accord-cadre').then(setEtat);
  useEffect(() => {
    void recharger().catch(() => setEtat(null));
  }, []);

  async function enregistrer() {
    setErreur(null);
    try {
      await api.post('/accord-cadre', {
        reference,
        dateSignature,
        dureeAnnees: Number(dureeAnnees),
        taciteReconduction: tacite,
        preavisMois: preavisMois === '' ? undefined : Number(preavisMois),
        representationRdc: representationRdc || undefined,
      });
      setReference('');
      await recharger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "L'enregistrement n'a pas abouti.");
    }
  }

  if (!etat) return <div className="p-3 text-[11px] text-text-dim">Chargement…</div>;

  if (!etat.applicable) {
    // Dire « ce dossier n'est pas concerné » plutôt qu'afficher un formulaire
    // vide qui ressemblerait à un manquement · la sous-section II de la loi ne
    // vise QUE l'ONG de droit étranger.
    return (
      <div className="p-2 max-w-[760px]">
        <section className="border border-border bg-surface px-3.5 py-2.5">
          <h2 className="text-[11px] font-bold mb-1.5">Ce dossier n'est pas concerné</h2>
          <p className="text-[10.5px] text-text-dim leading-[1.6]">
            L'accord-cadre avec le Ministère du Plan n'est exigé que d'une <strong>organisation non
            gouvernementale de droit étranger</strong> · loi n° 004/2001, art. 37, sous-section II. Une ONG de
            droit congolais relève de l'art. 36, et le mot « ONG » lui-même ne désigne, à l'art. 35, que
            l'association « dont l'objet concourt au développement social, culturel et économique des
            communautés locales ».
          </p>
          <p className="text-[10.5px] text-text-dim leading-[1.6] mt-2">
            Si c'en est une, corrigez la forme juridique et le drapeau « droit étranger » dans les paramètres
            du dossier.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="p-2 max-w-[980px]">
      <p className="text-[10.5px] text-text-dim mb-2.5 leading-[1.6]">
        Loi n° 004/2001, <strong>art. 37</strong> · quatre conditions cumulatives pour une ONG de droit
        étranger : une représentation en RDC, un accord-cadre avec le Ministère du Plan, les attestations de
        bonne conduite du personnel expatrié, et {etat.partMinimaleMainOeuvreLocale} % au minimum de
        main-d'œuvre locale.
      </p>

      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[11px] font-bold mb-1.5">Ce que cet accord n'ouvre PAS</h2>
        <p className="text-[10.5px] text-text-dim leading-[1.6]">
          L'accord-cadre conditionne l'<strong>existence</strong> de l'ONG étrangère en RDC. Il n'ouvre aucune
          exonération : l'art. 39 réserve cela à un <strong>arrêté interministériel</strong> des Ministres du
          Plan et des Finances, pris après l'obtention de la personnalité juridique · c'est la fenêtre
          Exonérations qui le tient. Et il ne se confond pas non plus avec le certificat d'enregistrement du
          Ministère du Plan, qui est une troisième pièce.
        </p>
      </section>

      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[11px] font-bold mb-1.5">Enregistrer l'accord signé</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="text-[10.5px]">
            Référence
            <input className="w-full border border-border px-1.5 py-1 text-[10.5px]" value={reference} onChange={(e) => setReference(e.target.value)} />
          </label>
          <label className="text-[10.5px]">
            Date de signature
            <input type="date" className="w-full border border-border px-1.5 py-1 text-[10.5px]" value={dateSignature} onChange={(e) => setDateSignature(e.target.value)} />
          </label>
          <label className="text-[10.5px]">
            Durée (années)
            <input type="number" className="w-full border border-border px-1.5 py-1 text-[10.5px]" value={dureeAnnees} onChange={(e) => setDureeAnnees(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
          <label className="text-[10.5px]">
            Préavis de dénonciation (mois)
            <input type="number" className="w-full border border-border px-1.5 py-1 text-[10.5px]" value={preavisMois} onChange={(e) => setPreavisMois(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
          <label className="text-[10.5px] flex items-center gap-1.5 mt-4">
            <input type="checkbox" checked={tacite} onChange={(e) => setTacite(e.target.checked)} />
            Renouvelable par tacite reconduction
          </label>
          <label className="text-[10.5px]">
            Représentation en RDC (art. 37, 1)
            <input className="w-full border border-border px-1.5 py-1 text-[10.5px]" value={representationRdc} onChange={(e) => setRepresentationRdc(e.target.value)} />
          </label>
        </div>

        {/* LA DURÉE EST SAISIE, ET L'ORIGINE DES DIX ANS EST DITE · sans cette
            phrase, une clause de modèle passerait pour une règle de droit. */}
        <p className="text-[10px] text-text-dim mt-2 leading-[1.6]">
          <strong>La loi ne fixe aucune durée.</strong> Les {etat.modele.dureeAnnees} ans renouvelables par
          tacite reconduction, avec préavis de {etat.modele.preavisMois} mois, viennent de {etat.modele.source}{' '}
          Recopiez ce que porte l'accord réellement signé.
        </p>

        {erreur && <p className="text-[10.5px] text-danger mt-2">{erreur}</p>}
        <button className="mt-2 border border-border px-2.5 py-1 text-[10.5px]" onClick={() => void enregistrer()}>
          Enregistrer
        </button>
      </section>

      <section className="border border-border bg-surface px-3.5 py-2.5">
        <h2 className="text-[11px] font-bold mb-1.5">Accords enregistrés</h2>
        {etat.accords.length === 0 ? (
          <p className="text-[10.5px] text-text-dim">Aucun accord-cadre enregistré.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[10.5px]">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="py-1 pr-2">Référence</th>
                  <th className="py-1 pr-2">Signé le</th>
                  <th className="py-1 pr-2">Période en cours</th>
                  <th className="py-1 pr-2">Dénoncer avant</th>
                  <th className="py-1 pr-2">Main-d'œuvre locale</th>
                  <th className="py-1">État</th>
                </tr>
              </thead>
              <tbody>
                {etat.accords.map((a) => (
                  <tr key={a.id} className="border-b border-border/60">
                    <td className="py-1 pr-2">{a.reference}</td>
                    <td className="py-1 pr-2 font-mono text-[10px]">{jour(a.dateSignature)}</td>
                    <td className="py-1 pr-2 font-mono text-[10px]">jusqu'au {jour(a.etat.finDePeriode)}</td>
                    <td className="py-1 pr-2 font-mono text-[10px]">{jour(a.etat.dernierJourPourDenoncer)}</td>
                    <td className="py-1 pr-2">
                      {a.partMainOeuvreLocale === null ? (
                        <span className="text-text-dim">non déclarée</span>
                      ) : (
                        <span className={a.partMainOeuvreLocale < etat.partMinimaleMainOeuvreLocale ? 'text-danger font-bold' : ''}>
                          {a.partMainOeuvreLocale} %
                        </span>
                      )}
                    </td>
                    <td className="py-1">
                      {a.denonceLe
                        ? `Dénoncé le ${jour(a.denonceLe)}`
                        : a.etat.enTaciteReconduction
                          ? 'Reconduit tacitement'
                          : a.etat.periodeEcoulee
                            ? 'Période close'
                            : 'En cours'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[10px] text-text-dim mt-2 leading-[1.6]">
          Une période écoulée <strong>n'est pas une fin</strong> quand l'accord se reconduit tacitement · il
          repart pour une période identique tant qu'aucune partie ne l'a dénoncé. La part de main-d'œuvre
          locale est <strong>saisie</strong>, jamais calculée : OmegaX ne détient aucun effectif, et c'est la
          source du relevé qu'un contrôleur demandera.
        </p>
      </section>
    </div>
  );
}
