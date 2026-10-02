import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { montant } from '../lib/montants';
import type { Tiers } from '../lib/types';
import type { ContrepartieAdmise } from '../lib/compte-du-bien';
import { Aide } from './chrome/Aide';
import { compteUnique, motifAucunCompteRetenu } from '../lib/comptes-proposes';
import {
  corpsSimulation,
  coutsNets,
  EcheancierServi,
  LIBELLES_NATURE,
  LIBELLES_PERIODICITE,
  NatureLocationAcquisition,
  PeriodiciteLoyer,
  SaisieContrat,
} from '../lib/location-acquisition';

/**
 * LE CONTRAT DE LOCATION-ACQUISITION dans la fiche « Nouvelle
 * immobilisation » · montré quand le compte du bien est un sous-compte
 * « location-acquisition ». La dette et l'échéancier viennent du serveur
 * (`POST /immobilisations/location-acquisition/simulation`), le même calcul
 * que l'entrée du bien.
 */
const champ = 'mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal';
const etiquette = 'text-[11.5px] font-semibold text-text-dim';

export function ChampsLocationAcquisition({
  compteImmobilisationId,
  saisie,
  onChange,
  contreparties,
}: {
  compteImmobilisationId: string;
  saisie: SaisieContrat;
  onChange: (s: SaisieContrat) => void;
  /** Contreparties admises, retenues ou utilisées · null tant qu'elles ne sont pas lues. */
  contreparties: ContrepartieAdmise[] | null;
}) {
  const [bailleurs, setBailleurs] = useState<Tiers[] | null>(null);
  const [echeancier, setEcheancier] = useState<EcheancierServi | null>(null);
  const [refus, setRefus] = useState<string | null>(null);
  const [calcul, setCalcul] = useState(false);

  useEffect(() => {
    let vivant = true;
    api.get<Tiers[]>('/tiers?actifsSeuls=true').then(
      (t) => vivant && setBailleurs(t),
      () => vivant && setBailleurs([]),
    );
    return () => {
      vivant = false;
    };
  }, []);

  // Une saisie qui change périme l'échéancier montré.
  const maj = (partiel: Partial<SaisieContrat>) => {
    setEcheancier(null);
    setRefus(null);
    onChange({ ...saisie, ...partiel });
  };

  // La simulation est réservée à qui peut saisir le bien (route @Roles
  // administrateur et comptable) · la fiche qui l'héberge l'est déjà.
  const { peutEcrire } = useAuth();
  const corps = corpsSimulation(compteImmobilisationId, saisie);
  const calculer = async () => {
    if (!corps) return;
    setCalcul(true);
    setRefus(null);
    try {
      setEcheancier(await api.post<EcheancierServi>('/immobilisations/location-acquisition/simulation', corps));
    } catch (err) {
      setEcheancier(null);
      setRefus(err instanceof ApiError ? err.message : 'Échéancier impossible à calculer');
    } finally {
      setCalcul(false);
    }
  };

  // Les coûts directs se paient au comptant ou à crédit · les autres modes
  // (apport, don, production) ne financent pas un contrat.
  const contrepartiesCouts = (contreparties ?? []).filter((c) => c.mode === 'ACHAT_COMPTANT' || c.mode === 'ACHAT_A_CREDIT');
  // Un seul compte proposé (retenu ou utilisé, `lib/comptes-proposes.ts`) se présélectionne.
  const unique = compteUnique(contrepartiesCouts);
  useEffect(() => {
    if (unique && !saisie.compteContrepartieCoutsId) maj({ compteContrepartieCoutsId: unique });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unique, saisie.compteContrepartieCoutsId]);
  const net = coutsNets(saisie);
  if (!peutEcrire) return null;

  return (
    <div className="col-span-3 border-t border-border pt-3">
      <div className="font-mono text-[11.5px] font-semibold text-text-dim mb-2 flex items-center gap-1.5">
        Contrat de location-acquisition
        <Aide
          titre="Location-acquisition"
          texte="Le bien entre au bilan pour la valeur actualisée des loyers et de l'option, au crédit de la dette de location-acquisition. Les loyers s'enregistrent en redevances au fil de l'exercice ; à la clôture, ils se ventilent entre remboursement de la dette et intérêts. Un contrat de douze mois ou moins, sur un bien de faible valeur, ou dont la levée d'option est hypothétique, est une location simple : ses loyers vont en charges et le bien n'entre pas au bilan."
          source="AUDCIF Titre VIII ch. 8 § 1.5, § 2.1"
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <label className={etiquette}>
          Nature du contrat
          <select value={saisie.nature} onChange={(e) => maj({ nature: e.target.value as NatureLocationAcquisition })} className={champ}>
            {(Object.keys(LIBELLES_NATURE) as NatureLocationAcquisition[]).map((n) => (
              <option key={n} value={n}>{LIBELLES_NATURE[n]}</option>
            ))}
          </select>
        </label>
        <label className={etiquette}>
          Référence du contrat
          <input required value={saisie.reference} onChange={(e) => maj({ reference: e.target.value })} className={champ} />
        </label>
        <label className={etiquette}>
          Bailleur
          <select value={saisie.bailleurTiersId} onChange={(e) => maj({ bailleurTiersId: e.target.value })} className={champ}>
            <option value="">{bailleurs === null ? 'Chargement…' : 'Non précisé'}</option>
            {(bailleurs ?? []).map((t) => (
              <option key={t.id} value={t.id}>{t.code} · {t.nom}</option>
            ))}
          </select>
        </label>
        <label className={etiquette}>
          Date de conclusion
          <input required type="date" value={saisie.dateConclusion} onChange={(e) => maj({ dateConclusion: e.target.value })} className={`${champ} font-mono`} />
        </label>
        <label className={etiquette}>
          <span className="flex items-center gap-1">
            Date de prise d'effet
            <Aide
              titre="Prise d'effet"
              texte="Le jour où le preneur peut utiliser le bien. Le bien entre au bilan et commence à s'amortir à cette date, sur sa durée d'utilité."
              source="AUDCIF Titre VIII ch. 8 § 1.3 et § 2.1.6"
            />
          </span>
          <input required type="date" value={saisie.datePriseEffet} onChange={(e) => maj({ datePriseEffet: e.target.value })} className={`${champ} font-mono`} />
        </label>
        <label className={etiquette}>
          Durée du contrat (mois)
          <input required type="number" min={1} value={saisie.dureeMois} onChange={(e) => maj({ dureeMois: e.target.value })} className={`${champ} font-mono`} />
        </label>
        <label className={etiquette}>
          Loyer
          <input required type="number" step="0.01" min={0} value={saisie.loyer} onChange={(e) => maj({ loyer: e.target.value })} className={`${champ} font-mono`} />
        </label>
        <label className={etiquette}>
          Périodicité
          <select value={saisie.periodicite} onChange={(e) => maj({ periodicite: e.target.value as PeriodiciteLoyer })} className={champ}>
            {(Object.keys(LIBELLES_PERIODICITE) as PeriodiciteLoyer[]).map((p) => (
              <option key={p} value={p}>{LIBELLES_PERIODICITE[p]}</option>
            ))}
          </select>
        </label>
        <label className={`${etiquette} flex items-center gap-1.5 self-end pb-1.5`}>
          <input type="checkbox" checked={saisie.termeAEchoir} onChange={(e) => maj({ termeAEchoir: e.target.checked })} />
          Loyers payables d'avance
        </label>
        <label className={etiquette}>
          Prix de levée de l'option
          <input type="number" step="0.01" min={0} value={saisie.prixOption} onChange={(e) => maj({ prixOption: e.target.value })} className={`${champ} font-mono`} />
        </label>
        <label className={etiquette}>
          <span className="flex items-center gap-1">
            Base de la dette
            <Aide
              titre="Taux implicite ou valeur du contrat"
              texte="Le taux implicite du contrat actualise les loyers et l'option ; à défaut, le taux marginal d'endettement du preneur. Si le contrat fixe la valeur du bien, le taux qui égalise loyers et valeur s'en déduit. Un taux annuel se lit sur des loyers mensuels au taux équivalent, convention d'OmegaX."
              source="AUDCIF Titre VIII ch. 8 § 2.1.2 et § 2.1.3"
            />
          </span>
          <select value={saisie.base} onChange={(e) => maj({ base: e.target.value as 'taux' | 'valeur' })} className={champ}>
            <option value="taux">Taux implicite annuel</option>
            <option value="valeur">Valeur du bien au contrat</option>
          </select>
        </label>
        {saisie.base === 'taux' ? (
          <label className={etiquette}>
            Taux annuel (%)
            <input required type="number" step="0.0001" min={0} value={saisie.tauxPourcent} onChange={(e) => maj({ tauxPourcent: e.target.value })} className={`${champ} font-mono`} />
          </label>
        ) : (
          <label className={etiquette}>
            Valeur du bien au contrat
            <input required type="number" step="0.01" min={0} value={saisie.valeurContrat} onChange={(e) => maj({ valeurContrat: e.target.value })} className={`${champ} font-mono`} />
          </label>
        )}
        <label className={`${etiquette} flex items-center gap-1.5`}>
          <input
            type="checkbox"
            checked={saisie.optionRaisonnablementCertaine}
            onChange={(e) => maj({ optionRaisonnablementCertaine: e.target.checked })}
          />
          Levée de l'option raisonnablement certaine
        </label>
        <label className={`${etiquette} flex items-center gap-1.5`}>
          <input type="checkbox" checked={saisie.bienDeFaibleValeur} onChange={(e) => maj({ bienDeFaibleValeur: e.target.checked })} />
          Bien de faible valeur à neuf
        </label>
        <span />
        <label className={etiquette}>
          <span className="flex items-center gap-1">
            Garantie de valeur résiduelle
            <Aide
              titre="Garantie de valeur résiduelle"
              texte="Ce que le preneur s'attend à payer si la revente du bien par le bailleur, au terme, ne rapporte pas le montant garanti. Ce montant attendu fait partie des paiements locatifs · il entre dans la dette, actualisé au terme du contrat. À l'échéance, déclarez si le bailleur l'a appelée."
              source="AUDCIF Titre VIII ch. 8 § 2.1.2 et § 2.1.3"
            />
          </span>
          <input
            type="number"
            step="0.01"
            min={0}
            value={saisie.garantieValeurResiduelle}
            onChange={(e) => maj({ garantieValeurResiduelle: e.target.value })}
            className={`${champ} font-mono`}
          />
        </label>
        <label className={`${etiquette} flex items-center gap-1.5`}>
          <input type="checkbox" checked={saisie.loyerIndexe} onChange={(e) => maj({ loyerIndexe: e.target.checked })} />
          Loyer indexé
          <Aide
            titre="Loyer indexé"
            texte="Un loyer qui dépend d'un indice ou d'un taux est un paiement locatif · à l'entrée, il est évalué avec l'indice ou le taux en vigueur à la prise d'effet. Saisissez le loyer que donne cet indice, et nommez-le. Les loyers fondés sur l'utilisation ou la performance du bien n'en font pas partie · ils vont en charges au fur et à mesure. Quand l'indice bouge ensuite, la dette n'est pas recalculée · l'écart avec les redevances payées se montre à la clôture."
            source="AUDCIF Titre VIII ch. 8 § 2.1.2"
          />
        </label>
        {saisie.loyerIndexe ? (
          <>
            <label className={etiquette}>
              Indice ou taux de référence
              <input required value={saisie.indiceLoyer} onChange={(e) => maj({ indiceLoyer: e.target.value })} className={champ} />
            </label>
            <label className={etiquette}>
              Valeur à la prise d'effet
              <input
                required
                type="number"
                step="0.000001"
                min={0}
                value={saisie.valeurIndiceCommencement}
                onChange={(e) => maj({ valeurIndiceCommencement: e.target.value })}
                className={`${champ} font-mono`}
              />
            </label>
          </>
        ) : (
          <span className="col-span-2" />
        )}
        <label className={etiquette}>
          <span className="flex items-center gap-1">
            Coûts directs initiaux
            <Aide
              titre="Valeur du bien"
              texte="Le bien vaut la dette, augmentée des coûts directs initiaux du preneur et diminuée des avantages reçus du bailleur."
              source="AUDCIF Titre VIII ch. 8 § 2.1.5"
            />
          </span>
          <input type="number" step="0.01" min={0} value={saisie.coutsDirects} onChange={(e) => maj({ coutsDirects: e.target.value })} className={`${champ} font-mono`} />
        </label>
        <label className={etiquette}>
          Avantages reçus du bailleur
          <input type="number" step="0.01" min={0} value={saisie.avantagesRecus} onChange={(e) => maj({ avantagesRecus: e.target.value })} className={`${champ} font-mono`} />
        </label>
        {net !== 0 && (
          <label className={etiquette}>
            Contrepartie des coûts
            <select
              required
              value={saisie.compteContrepartieCoutsId}
              onChange={(e) => maj({ compteContrepartieCoutsId: e.target.value })}
              className={champ}
            >
              <option value="" />
              {contrepartiesCouts.map((c) => (
                <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
              ))}
            </select>
            {compteImmobilisationId && contreparties && contrepartiesCouts.length === 0 && (
              <span className="block text-[11px] font-normal text-warning">
                {motifAucunCompteRetenu(contrepartiesCouts, 'de trésorerie ou de fournisseur admis pour ce bien')}
              </span>
            )}
          </label>
        )}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={!corps || calcul}
          onClick={() => void calculer()}
          className="border border-border-dark text-[11.5px] font-semibold px-3 py-1 disabled:opacity-50"
        >
          {calcul ? 'Calcul…' : "Calculer l'échéancier"}
        </button>
        {refus && <span className="text-[11px] text-danger">{refus}</span>}
      </div>
      {echeancier && (
        <div className="mt-3 text-[11.5px]">
          <div className="mb-1.5">
            Dette initiale <strong>{montant(echeancier.dette)}</strong> au {echeancier.comptes.dette} · valeur du bien{' '}
            <strong>{montant(echeancier.dette + net)}</strong> · taux périodique {(echeancier.tauxPeriodique * 100).toFixed(4)} %
          </div>
          <div className="max-h-[240px] overflow-auto border border-border">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-left">N°</th>
                  <th className="text-left">Échéance</th>
                  <th className="text-right">Paiement</th>
                  <th className="text-right">Intérêts</th>
                  <th className="text-right">Capital</th>
                  <th className="text-right">Restant dû</th>
                </tr>
              </thead>
              <tbody>
                {echeancier.lignes.map((l) => (
                  <tr key={l.rang}>
                    <td>{l.option ? 'Option' : l.garantie ? 'Garantie' : l.rang}</td>
                    <td>{new Date(l.date).toISOString().slice(0, 10).split('-').reverse().join('/')}</td>
                    <td className="text-right">{montant(l.paiement)}</td>
                    <td className="text-right">{montant(l.interets)}</td>
                    <td className="text-right">{montant(l.capital)}</td>
                    <td className="text-right">{montant(l.restant)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
