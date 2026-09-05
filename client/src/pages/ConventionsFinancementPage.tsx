import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Aide } from '../components/chrome/Aide';
import { EnteteImpression } from '../components/chrome/EnteteImpression';
import type {
  Bailleur,
  CaractereEngagement,
  ConventionFinancement,
  NatureRapportBailleur,
} from '../lib/types';

/**
 * DOSSIER DE SUBVENTION · les conventions de financement.
 *
 * SYCEBNL, cadre conceptuel § 5.4.2.4 : « Un engagement de financement est
 * comptabilisé dans les créances à recevoir de l'entité bénéficiaire s'il
 * correspond à un engagement FERME ET INCONDITIONNEL et a fait l'objet d'un
 * ÉCRIT SIGNÉ par les représentants habilités des tiers financeurs. Un
 * engagement CONDITIONNEL doit faire l'objet d'une mention dans les Notes
 * annexes et ne sera comptabilisé que lorsque les conditions sont remplies. »
 *
 * L'écran met donc en avant, pour chaque convention, le TRAITEMENT que le
 * texte autorise · c'est la seule information dont le comptable a besoin pour
 * ne pas se tromper de côté, et c'est celle qu'aucun écran ne portait.
 *
 * Il n'écrit AUCUNE écriture : porter d'office une créance à recevoir serait
 * le logiciel qui tranche à la place du cabinet.
 */

const CARACTERES: { valeur: CaractereEngagement; libelle: string }[] = [
  { valeur: 'FERME_INCONDITIONNEL', libelle: 'Ferme et inconditionnel' },
  { valeur: 'CONDITIONNEL', libelle: 'Conditionnel' },
];

const NATURES_RAPPORT: { valeur: NatureRapportBailleur; libelle: string }[] = [
  { valeur: 'FINANCIER', libelle: 'Financier' },
  { valeur: 'NARRATIF', libelle: 'Narratif' },
  { valeur: 'AUDIT', libelle: 'Audit' },
];

function montant(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function jour(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('fr-FR') : '·';
}

export function ConventionsFinancementPage() {
  const { estAdmin, utilisateur } = useAuth();
  const peutTenir = estAdmin || utilisateur?.role === 'COMPTABLE';

  const [conventions, setConventions] = useState<ConventionFinancement[] | null>(null);
  const [bailleurs, setBailleurs] = useState<Bailleur[]>([]);
  const [mentions, setMentions] = useState<string[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [detailPour, setDetailPour] = useState<string | null>(null);

  const [bailleurId, setBailleurId] = useState('');
  const [reference, setReference] = useState('');
  const [objet, setObjet] = useState('');
  const [caractere, setCaractere] = useState<CaractereEngagement>('FERME_INCONDITIONNEL');
  const [conditions, setConditions] = useState('');
  const [ecritSigne, setEcritSigne] = useState(false);
  const [signataire, setSignataire] = useState('');
  const [dateSignature, setDateSignature] = useState('');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [accorde, setAccorde] = useState('');

  const charger = useCallback(async () => {
    try {
      const [liste, m] = await Promise.all([
        api.get<ConventionFinancement[]>('/conventions-financement'),
        api.get<string[]>('/conventions-financement/mentions-notes-annexes'),
      ]);
      setConventions(liste);
      setMentions(m);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Chargement impossible.');
    }
  }, []);

  useEffect(() => {
    void charger();
    (async () => {
      try {
        setBailleurs(await api.get<Bailleur[]>('/bailleurs?actifsSeuls=true'));
      } catch {
        setBailleurs([]);
      }
    })();
  }, [charger]);

  async function onCreer(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setInfo(null);
    try {
      await api.post('/conventions-financement', {
        bailleurId,
        reference,
        objet,
        caractere,
        conditions: conditions || undefined,
        ecritSigne,
        signataire: signataire || undefined,
        dateSignature: dateSignature || undefined,
        dateDebut,
        dateFin,
        montantAccorde: Number(accorde),
      });
      setReference('');
      setObjet('');
      setConditions('');
      setAccorde('');
      setInfo('Convention enregistrée.');
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Enregistrement impossible.');
    }
  }

  async function onAjouterTranche(e: FormEvent, conventionId: string) {
    e.preventDefault();
    const f = e.target as HTMLFormElement;
    const d = new FormData(f);
    setErreur(null);
    try {
      await api.post(`/conventions-financement/${conventionId}/tranches`, {
        numero: Number(d.get('numero')),
        libelle: String(d.get('libelle')),
        montant: Number(d.get('montant')),
        datePrevue: String(d.get('datePrevue')),
      });
      f.reset();
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Ajout impossible.');
    }
  }

  async function onEncaisser(conventionId: string, trancheId: string, prevu: number) {
    const date = window.prompt("Date d'encaissement (AAAA-MM-JJ) :");
    if (!date) return;
    const m = window.prompt('Montant encaissé :', String(prevu));
    if (!m) return;
    setErreur(null);
    try {
      await api.patch(`/conventions-financement/${conventionId}/tranches/${trancheId}/encaissement`, {
        dateEncaissement: date,
        montantEncaisse: Number(m),
      });
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Encaissement impossible.');
    }
  }

  async function onAjouterRapport(e: FormEvent, conventionId: string) {
    e.preventDefault();
    const f = e.target as HTMLFormElement;
    const d = new FormData(f);
    setErreur(null);
    try {
      await api.post(`/conventions-financement/${conventionId}/rapports`, {
        intitule: String(d.get('intitule')),
        nature: String(d.get('nature')),
        dateEcheance: String(d.get('dateEcheance')),
      });
      f.reset();
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Ajout impossible.');
    }
  }

  async function onTransmettre(conventionId: string, rapportId: string) {
    const date = window.prompt('Date de transmission (AAAA-MM-JJ) :');
    if (!date) return;
    setErreur(null);
    try {
      await api.patch(`/conventions-financement/${conventionId}/rapports/${rapportId}/transmission`, {
        dateTransmission: date,
      });
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Transmission impossible.');
    }
  }

  async function onClore(conventionId: string, statut: 'CLOTUREE' | 'RESILIEE') {
    let motif: string | null = null;
    if (statut === 'RESILIEE') {
      motif = window.prompt(
        'Motif de résiliation · elle fait tomber le reste à recevoir de la convention :',
      );
      if (motif === null) return;
    }
    setErreur(null);
    try {
      await api.patch(`/conventions-financement/${conventionId}/cloture`, { statut, motif: motif ?? undefined });
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Opération impossible.');
    }
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <EnteteImpression
        titre="Dossier de subvention"
        sousTitre="Conventions de financement, tranches attendues et rapports dus aux bailleurs"
      />

      <div className="ecran-seul flex items-center gap-2">
        <h1 className="text-[13px] font-bold">Conventions de financement</h1>
        <Aide
          titre="Ce que le caractère de l'engagement commande"
          texte={
            "Un engagement de financement n'entre en CRÉANCE À RECEVOIR que s'il est ferme et inconditionnel ET qu'il a " +
            "fait l'objet d'un écrit signé par les représentants habilités du financeur. Les deux conditions, pas une " +
            "seule : un accord verbal ferme ne se comptabilise pas. Un engagement CONDITIONNEL, lui, se mentionne en " +
            'Notes annexes et ne se comptabilise que lorsque les conditions sont remplies. OmegaX ne qualifie pas ' +
            "l'engagement à votre place et ne passe aucune écriture : il enregistre votre lecture de la convention, en " +
            'tire la mention de notes, et vous montre ce qui peut être porté en créance.'
          }
          source="SYCEBNL, cadre conceptuel § 5.4.2.4"
        />
      </div>

      {erreur && <div className="ecran-seul border border-danger bg-danger/10 px-3 py-1.5 text-[11px]">{erreur}</div>}
      {info && <div className="ecran-seul border border-border bg-surface-alt px-3 py-1.5 text-[11px]">{info}</div>}

      {estAdmin && (
        <form onSubmit={onCreer} className="ecran-seul flex flex-wrap items-end gap-2 border border-border bg-surface px-3 py-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-dim">BAILLEUR</span>
            <select value={bailleurId} onChange={(e) => setBailleurId(e.target.value)} required className="border border-border-dark bg-surface px-2 py-1 text-[11px] w-[200px]">
              <option value="">Choisir…</option>
              {bailleurs.map((b) => (
                <option key={b.id} value={b.id}>{b.code} · {b.nom}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-dim">RÉFÉRENCE</span>
            <input value={reference} onChange={(e) => setReference(e.target.value)} required className="border border-border-dark bg-surface px-2 py-1 text-[11px] font-mono w-[150px]" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-dim">OBJET</span>
            <input value={objet} onChange={(e) => setObjet(e.target.value)} required className="border border-border-dark bg-surface px-2 py-1 text-[11px] w-[240px]" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-dim" title="Ferme et inconditionnel : créance à recevoir, si l'écrit signé est joint. Conditionnel : mention en Notes annexes seulement.">
              CARACTÈRE DE L’ENGAGEMENT
            </span>
            <select value={caractere} onChange={(e) => setCaractere(e.target.value as CaractereEngagement)} className="border border-border-dark bg-surface px-2 py-1 text-[11px] w-[190px]">
              {CARACTERES.map((c) => (<option key={c.valeur} value={c.valeur}>{c.libelle}</option>))}
            </select>
          </label>
          {caractere === 'CONDITIONNEL' && (
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-text-dim" title="Le § 5.4.2.4 impose de les mentionner en Notes annexes : « conditionnel » sans ses conditions ne se mentionne pas">
                CONDITIONS
              </span>
              <input value={conditions} onChange={(e) => setConditions(e.target.value)} required className="border border-border-dark bg-surface px-2 py-1 text-[11px] w-[260px]" />
            </label>
          )}
          <label className="flex items-center gap-1.5 pb-1">
            <input type="checkbox" checked={ecritSigne} onChange={(e) => setEcritSigne(e.target.checked)} />
            <span className="text-[10px] font-bold text-text-dim" title="Sans écrit signé, aucun engagement ne se comptabilise en créance, si ferme soit-il">
              ÉCRIT SIGNÉ
            </span>
          </label>
          {ecritSigne && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-text-dim" title="Le texte parle des « représentants HABILITÉS » du financeur">SIGNATAIRE</span>
                <input value={signataire} onChange={(e) => setSignataire(e.target.value)} required className="border border-border-dark bg-surface px-2 py-1 text-[11px] w-[180px]" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-text-dim">DATE DE SIGNATURE</span>
                <input type="date" value={dateSignature} onChange={(e) => setDateSignature(e.target.value)} className="border border-border-dark bg-surface px-2 py-1 text-[11px] w-[140px]" />
              </label>
            </>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-dim">DÉBUT</span>
            <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} required className="border border-border-dark bg-surface px-2 py-1 text-[11px] w-[140px]" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-dim" title="Validité de la convention · le planning de clôture demande de la vérifier à chaque exercice">FIN</span>
            <input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} required className="border border-border-dark bg-surface px-2 py-1 text-[11px] w-[140px]" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-dim">MONTANT ACCORDÉ</span>
            <input type="number" step="0.01" value={accorde} onChange={(e) => setAccorde(e.target.value)} required className="border border-border-dark bg-surface px-2 py-1 text-[11px] font-mono text-right w-[150px]" />
          </label>
          <button type="submit" className="border border-border-dark bg-surface-alt px-3 py-1 text-[11px] font-bold">Enregistrer</button>
        </form>
      )}

      <div className="overflow-x-auto">
        <div className="min-w-[1120px] border border-border">
          <div className="grid grid-cols-[150px_130px_1fr_190px_140px_140px_150px] gap-2 bg-surface-alt px-3 py-1.5 text-[10px] font-bold border-b border-border">
            <span>BAILLEUR</span>
            <span>RÉFÉRENCE</span>
            <span>OBJET · VALIDITÉ</span>
            <span title="Ce que le § 5.4.2.4 autorise">TRAITEMENT</span>
            <span className="text-right">ACCORDÉ</span>
            <span className="text-right">ENCAISSÉ</span>
            <span className="text-right">RESTE À RECEVOIR</span>
          </div>

          {conventions?.map((c) => (
            <div key={c.id} className="border-b border-border last:border-b-0">
              <div className="grid grid-cols-[150px_130px_1fr_190px_140px_140px_150px] gap-2 px-3 py-1 text-[11px] items-center">
                <span className="truncate">{c.bailleur.code} · {c.bailleur.nom}</span>
                <span className="font-mono text-[10.5px]">{c.reference}</span>
                <span className="truncate">
                  {c.objet}
                  <span className={`text-text-dim ${c.expiree ? 'text-danger font-semibold' : ''}`}>
                    {' '}· {jour(c.dateDebut)} au {jour(c.dateFin)}
                    {c.expiree ? ' · EXPIRÉE' : ''}
                  </span>
                  {c.statut !== 'EN_COURS' && <span className="text-text-dim"> · {c.statut}</span>}
                </span>
                <span
                  className={`text-[10px] ${c.traitement === 'CREANCE_A_RECEVOIR' ? 'font-semibold' : 'text-text-dim'}`}
                  title={
                    c.traitement === 'CREANCE_A_RECEVOIR'
                      ? 'Ferme, inconditionnel et assorti de son écrit signé · portable en créance à recevoir'
                      : "Conditionnel, ou sans écrit signé · mention en Notes annexes seulement, pas de créance"
                  }
                >
                  {c.traitement === 'CREANCE_A_RECEVOIR' ? 'Créance à recevoir' : 'Mention en Notes annexes'}
                </span>
                <span className="font-mono text-right">{montant(c.montantAccorde)}</span>
                <span className="font-mono text-right text-text-dim">{montant(c.montantEncaisse)}</span>
                <span className="font-mono text-right font-semibold">{montant(c.resteARecevoir)}</span>
              </div>

              {c.caractere === 'CONDITIONNEL' && c.conditions && (
                <div className="px-3 pb-1 text-[10px] text-text-dim">Conditions · {c.conditions}</div>
              )}
              {c.motifCloture && <div className="px-3 pb-1 text-[10px] text-text-dim">{c.statut} · {c.motifCloture}</div>}

              <div className="ecran-seul px-3 pb-1.5 flex gap-1.5 text-[10px]">
                <button type="button" onClick={() => setDetailPour(detailPour === c.id ? null : c.id)} className="border border-border-dark px-1.5 py-0.5">
                  Tranches et rapports ({c.tranches.length} · {c.rapports.length})
                </button>
                {estAdmin && c.statut === 'EN_COURS' && (
                  <>
                    <button type="button" onClick={() => void onClore(c.id, 'CLOTUREE')} className="border border-border-dark px-1.5 py-0.5">Clôturer</button>
                    <button type="button" onClick={() => void onClore(c.id, 'RESILIEE')} className="border border-border-dark px-1.5 py-0.5">Résilier</button>
                  </>
                )}
              </div>

              {detailPour === c.id && (
                <div className="bg-surface-alt px-3 py-2 flex flex-col gap-2">
                  <div>
                    <div className="text-[10px] font-bold text-text-dim mb-1">TRANCHES ATTENDUES</div>
                    {c.tranches.map((t) => (
                      <div key={t.id} className="flex items-center gap-2 text-[10.5px]">
                        <span className="font-mono w-[24px]">{t.numero}</span>
                        <span className="w-[200px] truncate">{t.libelle}</span>
                        <span className="font-mono w-[130px] text-right">{montant(t.montant)}</span>
                        <span className={`w-[150px] ${t.enRetard ? 'text-danger font-semibold' : 'text-text-dim'}`}>
                          prévue {jour(t.datePrevue)}{t.enRetard ? ' · EN RETARD' : ''}
                        </span>
                        <span className="w-[180px] text-text-dim">
                          {t.dateEncaissement ? `encaissée ${jour(t.dateEncaissement)} · ${montant(t.montantEncaisse ?? 0)}` : 'non encaissée'}
                        </span>
                        {peutTenir && !t.dateEncaissement && (
                          <button type="button" onClick={() => void onEncaisser(c.id, t.id, t.montant)} className="ecran-seul border border-border px-1">
                            Encaisser
                          </button>
                        )}
                      </div>
                    ))}
                    {c.tranches.length === 0 && <div className="text-[10px] text-text-dim">Aucune tranche saisie.</div>}
                    {peutTenir && (
                      <form onSubmit={(e) => void onAjouterTranche(e, c.id)} className="ecran-seul flex flex-wrap items-end gap-1.5 mt-1.5">
                        <input name="numero" type="number" min="1" required placeholder="N°" className="border border-border-dark bg-surface px-1.5 py-0.5 text-[10.5px] w-[60px]" />
                        <input name="libelle" required placeholder="Libellé de la tranche" className="border border-border-dark bg-surface px-1.5 py-0.5 text-[10.5px] w-[220px]" />
                        <input name="montant" type="number" step="0.01" required placeholder="Montant" className="border border-border-dark bg-surface px-1.5 py-0.5 text-[10.5px] font-mono text-right w-[130px]" />
                        <input name="datePrevue" type="date" required className="border border-border-dark bg-surface px-1.5 py-0.5 text-[10.5px] w-[140px]" />
                        <button type="submit" className="border border-border-dark bg-surface px-2 py-0.5 text-[10.5px]">Ajouter</button>
                      </form>
                    )}
                  </div>

                  <div>
                    <div className="text-[10px] font-bold text-text-dim mb-1" title="Leur retard suspend le versement de la tranche suivante dans la plupart des conventions">
                      RAPPORTS DUS
                    </div>
                    {c.rapports.map((r) => (
                      <div key={r.id} className="flex items-center gap-2 text-[10.5px]">
                        <span className="w-[240px] truncate">{r.intitule}</span>
                        <span className="w-[80px] text-text-dim">{r.nature}</span>
                        <span className={`w-[170px] ${r.enRetard ? 'text-danger font-semibold' : 'text-text-dim'}`}>
                          dû le {jour(r.dateEcheance)}{r.enRetard ? ' · EN RETARD' : ''}
                        </span>
                        <span className="w-[170px] text-text-dim">
                          {r.dateTransmission ? `transmis le ${jour(r.dateTransmission)}` : 'non transmis'}
                        </span>
                        {peutTenir && !r.dateTransmission && (
                          <button type="button" onClick={() => void onTransmettre(c.id, r.id)} className="ecran-seul border border-border px-1">
                            Transmis
                          </button>
                        )}
                      </div>
                    ))}
                    {c.rapports.length === 0 && <div className="text-[10px] text-text-dim">Aucun rapport enregistré.</div>}
                    {peutTenir && (
                      <form onSubmit={(e) => void onAjouterRapport(e, c.id)} className="ecran-seul flex flex-wrap items-end gap-1.5 mt-1.5">
                        <input name="intitule" required placeholder="Intitulé du rapport" className="border border-border-dark bg-surface px-1.5 py-0.5 text-[10.5px] w-[240px]" />
                        <select name="nature" className="border border-border-dark bg-surface px-1.5 py-0.5 text-[10.5px] w-[110px]">
                          {NATURES_RAPPORT.map((n) => (<option key={n.valeur} value={n.valeur}>{n.libelle}</option>))}
                        </select>
                        <input name="dateEcheance" type="date" required className="border border-border-dark bg-surface px-1.5 py-0.5 text-[10.5px] w-[140px]" />
                        <button type="submit" className="border border-border-dark bg-surface px-2 py-0.5 text-[10.5px]">Ajouter</button>
                      </form>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {conventions?.length === 0 && (
            <div className="px-3 py-2 text-[10.5px] text-text-dim">
              Aucune convention enregistrée. Tant que ce dossier est vide, rien ne permet de dire si un financement
              annoncé peut être porté en créance à recevoir ou seulement mentionné en Notes annexes.
            </div>
          )}
        </div>
      </div>

      {mentions.length > 0 && (
        <div className="border border-border bg-surface px-3 py-2">
          <div className="text-[10px] font-bold text-text-dim mb-1">
            MENTIONS À PORTER EN NOTES ANNEXES · ENGAGEMENTS CONDITIONNELS
          </div>
          {mentions.map((m) => (
            <p key={m} className="text-[10.5px] mb-1 max-w-[900px]">{m}</p>
          ))}
        </div>
      )}

      <p className="text-[10px] text-text-dim max-w-[900px]">
        OmegaX ne qualifie pas l’engagement à votre place et ne passe aucune écriture : il enregistre votre lecture de
        la convention, en tire la mention de Notes annexes que le § 5.4.2.4 impose pour les engagements conditionnels,
        et vous montre ce qui peut être porté en créance à recevoir.
      </p>
    </div>
  );
}
