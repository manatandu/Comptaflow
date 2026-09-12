import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';

/**
 * FACTURATION · la pièce que la loi exige pour chaque transaction.
 *
 * LA FENÊTRE DIT D'ABORD CE QU'ELLE N'EST PAS, et c'est sa première raison
 * d'exister. L'art. 58 de l'O.-L. n° 10/001 veut une facture NORMALISÉE
 * produite par un dispositif électronique fiscal, et l'art. 59 quater exige
 * qu'un système de facturation propre soit HOMOLOGUÉ avant toute utilisation.
 * OmegaX ne l'est pas. Un écran qui imprimerait une pièce d'allure officielle
 * sans le dire ferait croire à un cabinet qu'il est en règle · c'est
 * exactement le § 10 bis, dans le sens le plus coûteux.
 */
type Mention = { cle: string; libelle: string };

type Facture = {
  id: string;
  sens: 'VENTE' | 'ACHAT';
  numeroSerie: string;
  dateFacture: string;
  tiers: { id: string; code: string; nom: string } | null;
  emetteurNom: string;
  emetteurNumeroImpot: string | null;
  contrepartieNom: string;
  contrepartieNumeroImpot: string | null;
  mentionTvaDebits: boolean;
  ecritureId: string | null;
  lignes: {
    id: string;
    ordre: number;
    designation: string;
    quantite: number | null;
    prixUnitaire: number | null;
    montantHT: number | null;
    imposable: boolean;
    tauxApplique: number | null;
    montantTva: number | null;
  }[];
  totaux: {
    montantHT: number;
    montantNonTaxable: number;
    montantImposable: number;
    montantTva: number;
    montantTTC: number;
  };
  mentions: {
    conforme: boolean;
    manquantes: Mention[];
    amendeUnitaire: number;
    reserveAmende: string;
    source: string;
  };
};

type Etat = {
  homologation: { omegaxHomologue: boolean; source: string; consequence: string };
  factures: Facture[];
};

type EtatDetaille = {
  periode: string;
  lignes: {
    fournisseurNom: string | null;
    fournisseurNumeroImpot: string | null;
    numeroFacture: string;
    dateFacture: string;
    designation: string;
    quantite: number;
    prixHT: number;
    tvaFacturee: number;
    montantTTC: number;
  }[];
  totalHT: number;
  totalTva: number;
  totalTTC: number;
  incompletudes: { numeroFacture: string; designation: string; manques: string[] }[];
  complet: boolean;
  voletImportations: { couvert: boolean; motif: string };
  source: string;
  consequenceDuDefaut: string;
};

const somme = (n: number | null | undefined) =>
  typeof n === 'number' ? n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '·';

export function FacturationPage() {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [sens, setSens] = useState<'VENTE' | 'ACHAT'>('VENTE');
  const [numeroSerie, setNumeroSerie] = useState('');
  const [dateFacture, setDateFacture] = useState('');
  const [contrepartieNom, setContrepartieNom] = useState('');
  const [contrepartieNumeroImpot, setContrepartieNumeroImpot] = useState('');
  const [designation, setDesignation] = useState('');
  const [quantite, setQuantite] = useState<number | ''>('');
  const [prixUnitaire, setPrixUnitaire] = useState<number | ''>('');
  const [montantHT, setMontantHT] = useState<number | ''>('');
  const [imposable, setImposable] = useState(true);
  const [tauxApplique, setTauxApplique] = useState<number | ''>('');
  const [montantTva, setMontantTva] = useState<number | ''>('');
  const [periode, setPeriode] = useState('');
  const [detaille, setDetaille] = useState<EtatDetaille | null>(null);

  const recharger = () => api.get<Etat>('/facturation').then(setEtat);
  useEffect(() => {
    void recharger().catch(() => setEtat(null));
  }, []);

  async function enregistrer() {
    setErreur(null);
    try {
      await api.post('/facturation', {
        sens,
        numeroSerie,
        dateFacture,
        contrepartieNom: contrepartieNom || undefined,
        contrepartieNumeroImpot: contrepartieNumeroImpot || undefined,
        lignes: [
          {
            designation,
            quantite: Number(quantite),
            prixUnitaire: Number(prixUnitaire),
            montantHT: Number(montantHT),
            imposable,
            tauxApplique: tauxApplique === '' ? undefined : Number(tauxApplique),
            montantTva: montantTva === '' ? undefined : Number(montantTva),
          },
        ],
      });
      setNumeroSerie('');
      setDesignation('');
      await recharger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "L'enregistrement n'a pas abouti.");
    }
  }

  async function produireEtatDetaille() {
    setErreur(null);
    try {
      setDetaille(await api.get<EtatDetaille>(`/facturation/etat-detaille?periode=${encodeURIComponent(periode)}`));
    } catch (e) {
      setDetaille(null);
      setErreur(e instanceof ApiError ? e.message : "L'état détaillé n'a pas pu être produit.");
    }
  }

  if (!etat) return <div className="p-3 text-[11px] text-text-dim">Chargement…</div>;

  return (
    <div className="p-2 max-w-[1100px]">
      {/* CE QUE CETTE FENÊTRE N'EST PAS · en tête et non en note de bas de
          page, comme le second jeu en monnaie fonctionnelle : un document qui
          ressemble à une facture normalisée et qui n'en est pas une doit dire
          lequel des deux il est AVANT qu'on en lise les chiffres. */}
      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[11px] font-bold mb-1.5">Ce n'est pas une facture normalisée</h2>
        <p className="text-[10.5px] text-text-dim leading-[1.6]">{etat.homologation.consequence}</p>
        <p className="text-[10px] text-text-dim mt-1.5">{etat.homologation.source}</p>
      </section>

      <p className="text-[10.5px] text-text-dim mb-2.5 leading-[1.6]">
        Loi de procédures fiscales, <strong>art. 23</strong> · une facture est due « pour chaque transaction
        effectuée ». Ses mentions sont celles de l'<strong>art. 100 du décret n° 011/42</strong>, et l'art. 97
        bis sanctionne chaque omission. La fenêtre confronte chaque pièce à ces mentions ; elle ne les complète
        jamais d'office.
      </p>

      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[11px] font-bold mb-1.5">Enregistrer une facture</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <label className="text-[10.5px]">
            Sens
            <select
              className="w-full border border-border px-1.5 py-1 text-[10.5px]"
              value={sens}
              onChange={(e) => setSens(e.target.value as 'VENTE' | 'ACHAT')}
            >
              <option value="VENTE">Vente (facture émise)</option>
              <option value="ACHAT">Achat (facture reçue)</option>
            </select>
          </label>
          <label className="text-[10.5px]">
            N° de série
            <input className="w-full border border-border px-1.5 py-1 text-[10.5px]" value={numeroSerie} onChange={(e) => setNumeroSerie(e.target.value)} />
          </label>
          <label className="text-[10.5px]">
            Date
            <input type="date" className="w-full border border-border px-1.5 py-1 text-[10.5px]" value={dateFacture} onChange={(e) => setDateFacture(e.target.value)} />
          </label>
          <label className="text-[10.5px]">
            {sens === 'VENTE' ? 'Client' : 'Fournisseur'}
            <input className="w-full border border-border px-1.5 py-1 text-[10.5px]" value={contrepartieNom} onChange={(e) => setContrepartieNom(e.target.value)} />
          </label>
          <label className="text-[10.5px]">
            N° impôt de la contrepartie
            <input className="w-full border border-border px-1.5 py-1 text-[10.5px]" value={contrepartieNumeroImpot} onChange={(e) => setContrepartieNumeroImpot(e.target.value)} />
          </label>
          <label className="text-[10.5px]">
            Désignation
            <input className="w-full border border-border px-1.5 py-1 text-[10.5px]" value={designation} onChange={(e) => setDesignation(e.target.value)} />
          </label>
          <label className="text-[10.5px]">
            Quantité
            <input type="number" className="w-full border border-border px-1.5 py-1 text-[10.5px]" value={quantite} onChange={(e) => setQuantite(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
          <label className="text-[10.5px]">
            Prix unitaire
            <input type="number" className="w-full border border-border px-1.5 py-1 text-[10.5px]" value={prixUnitaire} onChange={(e) => setPrixUnitaire(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
          <label className="text-[10.5px]">
            Montant HT
            <input type="number" className="w-full border border-border px-1.5 py-1 text-[10.5px]" value={montantHT} onChange={(e) => setMontantHT(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
          <label className="text-[10.5px]">
            Taux de TVA (%)
            <input type="number" className="w-full border border-border px-1.5 py-1 text-[10.5px]" value={tauxApplique} onChange={(e) => setTauxApplique(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
          <label className="text-[10.5px]">
            Montant de TVA
            <input type="number" className="w-full border border-border px-1.5 py-1 text-[10.5px]" value={montantTva} onChange={(e) => setMontantTva(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
          <label className="text-[10.5px] flex items-center gap-1.5 mt-4">
            <input type="checkbox" checked={imposable} onChange={(e) => setImposable(e.target.checked)} />
            Ligne imposable
          </label>
        </div>
        {/* La distinction imposable / non imposable est demandée par l'art. 100
            lui-même · elle ne se déduit pas d'un taux nul, une opération au
            taux zéro (exportation) étant imposable. */}
        <p className="text-[10px] text-text-dim mt-2 leading-[1.6]">
          Décochez « imposable » pour une opération <strong>exonérée</strong>. Une opération au taux zéro
          (exportation) reste imposable : les deux zéros ne se confondent pas.
        </p>
        {erreur && <p className="text-[10.5px] text-danger mt-2">{erreur}</p>}
        <button className="mt-2 border border-border px-2.5 py-1 text-[10.5px]" onClick={() => void enregistrer()}>
          Enregistrer
        </button>
      </section>

      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[11px] font-bold mb-1.5">État détaillé de la déclaration mensuelle</h2>
        <p className="text-[10.5px] text-text-dim leading-[1.6] mb-2">
          O.-L. n° 10/001, <strong>art. 56</strong> · l'état détaillé n'est pas une pièce de confort, c'est la
          condition du droit à déduction. Son défaut entraîne la réintégration d'office des déductions opérées.
        </p>
        <div className="flex items-end gap-2">
          <label className="text-[10.5px]">
            Période (AAAA-MM)
            <input className="w-full border border-border px-1.5 py-1 text-[10.5px]" value={periode} onChange={(e) => setPeriode(e.target.value)} placeholder="2026-09" />
          </label>
          <button className="border border-border px-2.5 py-1 text-[10.5px]" onClick={() => void produireEtatDetaille()}>
            Produire
          </button>
        </div>

        {detaille && (
          <div className="mt-2.5">
            <div className="overflow-x-auto">
              <table className="w-full text-[10.5px]">
                <thead>
                  <tr className="text-left border-b border-border">
                    <th className="py-1 pr-2">Fournisseur</th>
                    <th className="py-1 pr-2">N° impôt</th>
                    <th className="py-1 pr-2">Facture</th>
                    <th className="py-1 pr-2">Date</th>
                    <th className="py-1 pr-2">Désignation</th>
                    <th className="py-1 pr-2 text-right">Quantité</th>
                    <th className="py-1 pr-2 text-right">Prix HT</th>
                    <th className="py-1 pr-2 text-right">TVA facturée</th>
                    <th className="py-1 text-right">TTC</th>
                  </tr>
                </thead>
                <tbody>
                  {detaille.lignes.map((l, i) => (
                    <tr key={`${l.numeroFacture}-${i}`} className="border-b border-border/50">
                      <td className="py-1 pr-2">{l.fournisseurNom ?? '·'}</td>
                      <td className="py-1 pr-2">{l.fournisseurNumeroImpot ?? '·'}</td>
                      <td className="py-1 pr-2">{l.numeroFacture}</td>
                      <td className="py-1 pr-2">{l.dateFacture}</td>
                      <td className="py-1 pr-2">{l.designation}</td>
                      <td className="py-1 pr-2 text-right">{somme(l.quantite)}</td>
                      <td className="py-1 pr-2 text-right">{somme(l.prixHT)}</td>
                      <td className="py-1 pr-2 text-right">{somme(l.tvaFacturee)}</td>
                      <td className="py-1 text-right">{somme(l.montantTTC)}</td>
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td className="py-1 pr-2" colSpan={6}>
                      Totaux
                    </td>
                    <td className="py-1 pr-2 text-right">{somme(detaille.totalHT)}</td>
                    <td className="py-1 pr-2 text-right">{somme(detaille.totalTva)}</td>
                    <td className="py-1 text-right">{somme(detaille.totalTTC)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {detaille.incompletudes.length > 0 && (
              <div className="mt-2 border border-border px-2.5 py-1.5">
                <p className="text-[10.5px] font-bold">Lignes incomplètes au regard de l'art. 134</p>
                <ul className="text-[10.5px] text-text-dim mt-1">
                  {detaille.incompletudes.map((i, r) => (
                    <li key={`${i.numeroFacture}-${r}`}>
                      Facture {i.numeroFacture} · {i.designation} · manque {i.manques.join(', ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* LA LACUNE DÉCLARÉE PLUTÔT QUE COMBLÉE · OmegaX ne tient aucune
                déclaration en douane, et déduire une valeur en douane d'un
                compte d'achat l'inventerait. */}
            <p className="text-[10px] text-text-dim mt-2 leading-[1.6]">{detaille.voletImportations.motif}</p>
            <p className="text-[10px] text-text-dim mt-1 leading-[1.6]">{detaille.consequenceDuDefaut}</p>
          </div>
        )}
      </section>

      <section className="border border-border bg-surface px-3.5 py-2.5">
        <h2 className="text-[11px] font-bold mb-1.5">Factures enregistrées</h2>
        {etat.factures.length === 0 ? (
          <p className="text-[10.5px] text-text-dim">Aucune facture enregistrée.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[10.5px]">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="py-1 pr-2">Sens</th>
                  <th className="py-1 pr-2">N° de série</th>
                  <th className="py-1 pr-2">Date</th>
                  <th className="py-1 pr-2">Contrepartie</th>
                  <th className="py-1 pr-2 text-right">HT</th>
                  <th className="py-1 pr-2 text-right">TVA</th>
                  <th className="py-1 pr-2 text-right">TTC</th>
                  <th className="py-1">Mentions de l'art. 100</th>
                </tr>
              </thead>
              <tbody>
                {etat.factures.map((f) => (
                  <tr key={f.id} className="border-b border-border/50 align-top">
                    <td className="py-1 pr-2">{f.sens === 'VENTE' ? 'Vente' : 'Achat'}</td>
                    <td className="py-1 pr-2">{f.numeroSerie}</td>
                    <td className="py-1 pr-2">{f.dateFacture.slice(0, 10)}</td>
                    <td className="py-1 pr-2">{f.sens === 'VENTE' ? f.contrepartieNom : f.emetteurNom}</td>
                    <td className="py-1 pr-2 text-right">{somme(f.totaux.montantHT)}</td>
                    <td className="py-1 pr-2 text-right">{somme(f.totaux.montantTva)}</td>
                    <td className="py-1 pr-2 text-right">{somme(f.totaux.montantTTC)}</td>
                    <td className="py-1">
                      {f.mentions.conforme ? (
                        <span>Les neuf groupes sont servis.</span>
                      ) : (
                        <>
                          <span className="text-danger">Manque : {f.mentions.manquantes.map((m) => m.libelle).join(' · ')}</span>
                          {/* LE TOTAL ENCOURU NE SE CALCULE PAS · l'art. 97 bis
                              sanctionne « par omission » sans définir l'unité
                              de l'omission. Multiplier serait inventer un
                              barème. */}
                          <p className="text-[10px] text-text-dim mt-0.5">
                            Amende de {f.mentions.amendeUnitaire.toLocaleString('fr-FR')} FC par omission.{' '}
                            {f.mentions.reserveAmende}
                          </p>
                        </>
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
