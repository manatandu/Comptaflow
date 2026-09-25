import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Aide } from '../components/chrome/Aide';

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
  const { peutEcrire } = useAuth();
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

  if (!etat) return <div className="p-3 text-[11.5px] text-text-dim">Chargement…</div>;

  if (!etat.applicable) {
    // Dire « ce dossier n'est pas concerné » plutôt qu'afficher un formulaire
    // vide qui ressemblerait à un manquement · la sous-section II de la loi ne
    // vise QUE l'ONG de droit étranger.
    return (
      <div className="p-2 max-w-[760px]">
        <section className="border border-border bg-surface px-3.5 py-2.5">
          <h2 className="text-[11.5px] font-bold flex items-center gap-1.5">
            Ce dossier n'est pas concerné
            <Aide
              titre="Accord-cadre · champ d'application"
              texte="L'accord-cadre avec le Ministère du Plan n'est exigé que d'une organisation non gouvernementale de droit étranger (sous-section II). Une ONG de droit congolais relève de l'art. 36 ; l'art. 35 ne désigne par « ONG » que l'association « dont l'objet concourt au développement social, culturel et économique des communautés locales ». Si le dossier est une ONG étrangère, corrigez la forme juridique et le drapeau « droit étranger » dans les paramètres du dossier."
              source="Loi n° 004/2001, art. 35 à 37"
            />
          </h2>
        </section>
      </div>
    );
  }

  return (
    <div className="p-2 max-w-[980px]">
      <div className="flex items-center justify-end gap-1.5 mb-2">
        <Aide
          titre="Accord-cadre · conditions de l'art. 37"
          texte={`Quatre conditions cumulatives pour une ONG de droit étranger : une représentation en RDC, un accord-cadre avec le Ministère du Plan, les attestations de bonne conduite du personnel expatrié, et ${etat.partMinimaleMainOeuvreLocale} % au minimum de main-d'œuvre locale. L'accord-cadre conditionne l'existence de l'ONG étrangère en RDC ; il n'ouvre aucune exonération : l'art. 39 la réserve à un arrêté interministériel des Ministres du Plan et des Finances, pris après l'obtention de la personnalité juridique (fenêtre Exonérations). Il ne se confond pas non plus avec le certificat d'enregistrement du Ministère du Plan.`}
          source="Loi n° 004/2001, art. 37 et 39"
        />
      </div>

      {/* Le serveur réserve l'enregistrement à ADMIN_CABINET et COMPTABLE · la
          lecture seule consulte les accords sans voir un formulaire refusé. */}
      {peutEcrire && (
      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[11.5px] font-bold mb-1.5">Enregistrer l'accord signé</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="text-[11.5px]">
            Référence
            <input className="w-full border border-border px-1.5 py-1 text-[11.5px]" value={reference} onChange={(e) => setReference(e.target.value)} />
          </label>
          <label className="text-[11.5px]">
            Date de signature
            <input type="date" className="w-full border border-border px-1.5 py-1 text-[11.5px]" value={dateSignature} onChange={(e) => setDateSignature(e.target.value)} />
          </label>
          <label className="text-[11.5px]">
            {/* L'origine des dix ans est dite dans la bulle · sans elle, une
                clause de modèle passerait pour une règle de droit. */}
            <span className="flex items-center gap-1.5">
              Durée (années)
              <Aide
                titre="Durée de l'accord-cadre"
                texte={`La loi ne fixe aucune durée. Les ${etat.modele.dureeAnnees} ans renouvelables par tacite reconduction, avec préavis de ${etat.modele.preavisMois} mois, viennent de ${etat.modele.source} Recopiez ce que porte l'accord réellement signé.`}
                source="Loi n° 004/2001"
              />
            </span>
            <input type="number" className="w-full border border-border px-1.5 py-1 text-[11.5px]" value={dureeAnnees} onChange={(e) => setDureeAnnees(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
          <label className="text-[11.5px]">
            Préavis de dénonciation (mois)
            <input type="number" className="w-full border border-border px-1.5 py-1 text-[11.5px]" value={preavisMois} onChange={(e) => setPreavisMois(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
          <label className="text-[11.5px] flex items-center gap-1.5 mt-4">
            <input type="checkbox" checked={tacite} onChange={(e) => setTacite(e.target.checked)} />
            Renouvelable par tacite reconduction
          </label>
          <label className="text-[11.5px]">
            Représentation en RDC (art. 37, 1)
            <input className="w-full border border-border px-1.5 py-1 text-[11.5px]" value={representationRdc} onChange={(e) => setRepresentationRdc(e.target.value)} />
          </label>
        </div>

        {erreur && <p className="text-[11.5px] text-danger mt-2">{erreur}</p>}
        <button className="mt-2 border border-border px-2.5 py-1 text-[11.5px]" onClick={() => void enregistrer()}>
          Enregistrer
        </button>
      </section>
      )}

      <section className="border border-border bg-surface px-3.5 py-2.5">
        <h2 className="text-[11.5px] font-bold mb-1.5 flex items-center gap-1.5">
          Accords enregistrés
          <Aide
            titre="Période et main-d'œuvre locale"
            texte="Une période écoulée n'est pas une fin quand l'accord se reconduit tacitement · il repart pour une période identique tant qu'aucune partie ne l'a dénoncé. La part de main-d'œuvre locale est saisie, jamais calculée : OmegaX ne détient aucun effectif, et c'est la source du relevé qu'un contrôleur demandera."
            source="Loi n° 004/2001, art. 37"
          />
        </h2>
        {etat.accords.length === 0 ? (
          <p className="text-[11.5px] text-text-dim">Aucun accord-cadre enregistré.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11.5px]">
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
                    <td className="py-1 pr-2 font-mono text-[11px]">{jour(a.dateSignature)}</td>
                    <td className="py-1 pr-2 font-mono text-[11px]">jusqu'au {jour(a.etat.finDePeriode)}</td>
                    <td className="py-1 pr-2 font-mono text-[11px]">{jour(a.etat.dernierJourPourDenoncer)}</td>
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
      </section>
    </div>
  );
}
