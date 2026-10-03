import type { ReactNode } from 'react';
import type {
  CampagneEdition,
  EditionFichesVierges,
  EditionInventaire,
  EditionPvCaisse,
  EditionPvInventaire,
  MembreEdition,
  SousCommissionEdition,
} from '../lib/types';
import { montant } from '../lib/montants';
import { jourImprime, LIBELLE_DECISION_ECART, LIBELLE_SENS_ECART, quantiteImprimee } from '../lib/editions-inventaire';

/**
 * LES ÉDITIONS DE L'INVENTAIRE (ligne A19) · invisibles à l'écran, seules
 * imprimées (la fenêtre porte `avec-edition` tant qu'une édition est
 * préparée). Le contenu est celui que le serveur sert · rien n'est recalculé
 * ici, un montant passe par `lib/montants.ts`, une absence s'imprime « · ».
 *
 * LES SIGNATURES SE PORTENT À LA MAIN · la case reste vide, le nom du
 * signataire est imprimé à côté (même parti que `BlocCertification`).
 */

const CELLULE = 'border border-black px-1.5 py-1 align-top';
const CELLULE_D = `${CELLULE} text-right tabular-nums`;
/** Une case à remplir sur place · assez haute pour écrire à la main. */
const CASE_VIDE = `${CELLULE} h-7`;

const dansLUnite = (v: unknown, unite: string | null) => (unite ? `${montant(v)} ${unite}` : montant(v));

function Titre({ children }: { children: ReactNode }) {
  return <div className="font-bold uppercase text-[11.5px] mt-4 mb-1">{children}</div>;
}

function Campagne({ campagne }: { campagne: CampagneEdition }) {
  return (
    <div className="mb-2">
      <div className="font-bold text-[12.5px]">{campagne.libelle}</div>
      <div>
        Inventaire au {jourImprime(campagne.dateInventaire)} · exercice du {jourImprime(campagne.exercice.dateDebut)} au{' '}
        {jourImprime(campagne.exercice.dateFin)}
      </div>
    </div>
  );
}

const nomEtFonction = (m: MembreEdition) => (m.fonction ? `${m.nom}, ${m.fonction}` : m.nom);

function Membres({ sc }: { sc: SousCommissionEdition }) {
  return (
    <div>
      <div>
        Inventoriants · {sc.inventoriants.length > 0 ? sc.inventoriants.map(nomEtFonction).join(' ; ') : 'aucun enregistré'}
      </div>
      <div>Témoins · {sc.temoins.length > 0 ? sc.temoins.map(nomEtFonction).join(' ; ') : 'aucun enregistré'}</div>
    </div>
  );
}

/** Une colonne de signatures · nom imprimé, case blanche. */
function Signatures({ titre, membres }: { titre: string; membres: (MembreEdition & { sousCommission?: string })[] }) {
  return (
    <div>
      <div className="font-semibold mb-1">{titre}</div>
      {membres.length === 0 && <div>Aucun enregistré.</div>}
      {membres.map((m, i) => (
        <div key={i} className="flex items-end gap-2 mb-3">
          <div className="w-1/2">
            {nomEtFonction(m)}
            {m.sousCommission && <div className="text-[10px]">{m.sousCommission}</div>}
          </div>
          <div className="flex-1 h-7 border-b border-black" />
        </div>
      ))}
    </div>
  );
}

function Mentions({ mentions }: { mentions: string[] }) {
  if (mentions.length === 0) return null;
  return (
    <div className="border border-black px-2 py-1 my-2">
      {mentions.map((m) => (
        <div key={m}>{m}</div>
      ))}
    </div>
  );
}

// --- 1. Fiches de comptage ---------------------------------------------------

function FichesVierges({ e }: { e: EditionFichesVierges }) {
  return (
    <>
      <Campagne campagne={e.campagne} />
      <div className="font-semibold mb-2">{e.perimetre}</div>
      {e.sections.length === 0 && <div>Aucune fiche préparée pour cette campagne.</div>}
      {e.sections.map((s, i) => (
        <section key={s.sousCommission?.id ?? 'sans'} className={i > 0 ? 'break-before-page' : ''}>
          <Titre>{s.sousCommission ? `Sous-commission ${s.sousCommission.nom}` : 'Fiches sans sous-commission'}</Titre>
          {s.sousCommission?.perimetre && <div>Périmètre · {s.sousCommission.perimetre}</div>}
          {s.sousCommission && <Membres sc={s.sousCommission} />}
          {s.lignes.length === 0 ? (
            <div className="mt-1">Aucune fiche confiée à cette sous-commission.</div>
          ) : (
            <table className="w-full border-collapse mt-2">
              <thead>
                <tr>
                  <th className={`${CELLULE} text-left`}>N°</th>
                  <th className={`${CELLULE} text-left`}>Désignation</th>
                  <th className={`${CELLULE} text-left`}>Compte</th>
                  <th className={`${CELLULE} text-left`}>Lieu</th>
                  <th className={`${CELLULE} text-left`}>Unité</th>
                  {e.colonnesARemplir.map((c) => (
                    <th key={c} className={`${CELLULE} text-left w-[12%]`}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.lignes.map((l, n) => (
                  <tr key={l.ficheId}>
                    <td className={CELLULE}>{n + 1}</td>
                    <td className={CELLULE}>{l.designation}</td>
                    <td className={CELLULE}>{l.compte}</td>
                    <td className={CELLULE}>{l.lieu}</td>
                    <td className={CELLULE}>{l.unite ?? '·'}</td>
                    {e.colonnesARemplir.map((c) => (
                      <td key={c} className={CASE_VIDE} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}
    </>
  );
}

// --- 2. Procès-verbal d'inventaire physique ---------------------------------

function PvInventaire({ e }: { e: EditionPvInventaire }) {
  return (
    <>
      <Campagne campagne={e.campagne} />
      <div>
        {e.etabli ? `Procès-verbal établi le ${jourImprime(e.etabli.le)} par ${e.etabli.par}` : 'Procès-verbal non établi'}
      </div>
      {e.campagne.instructions && <div className="mt-1 whitespace-pre-line">Instructions · {e.campagne.instructions}</div>}
      <Mentions mentions={e.mentions} />

      <Titre>Sous-commissions</Titre>
      {e.sousCommissions.length === 0 && <div>Aucune sous-commission constituée.</div>}
      {e.sousCommissions.map((sc) => (
        <div key={sc.id} className="mb-1">
          <div className="font-semibold">
            {sc.nom}
            {sc.perimetre ? ` · ${sc.perimetre}` : ''}
          </div>
          <Membres sc={sc} />
        </div>
      ))}

      <Titre>Relevé physique</Titre>
      {e.releve.length === 0 ? (
        <div>Aucune fiche.</div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={`${CELLULE} text-left`}>Désignation</th>
              <th className={`${CELLULE} text-left`}>Compte</th>
              <th className={`${CELLULE} text-left`}>Lieu</th>
              <th className={`${CELLULE} text-left`}>Unité</th>
              <th className={`${CELLULE} text-right`}>Quantité</th>
              <th className={`${CELLULE} text-right`}>Valeur d’inventaire</th>
              <th className={`${CELLULE} text-left`}>Pièce</th>
              <th className={`${CELLULE} text-left`}>Sous-commission</th>
            </tr>
          </thead>
          <tbody>
            {e.releve.map((l, i) => (
              <tr key={i}>
                <td className={CELLULE}>{l.designation}</td>
                <td className={CELLULE}>{l.compte}</td>
                <td className={CELLULE}>{l.lieu}</td>
                <td className={CELLULE}>{l.unite ?? '·'}</td>
                <td className={CELLULE_D}>{quantiteImprimee(l.quantite)}</td>
                <td className={CELLULE_D}>{montant(l.valeur)}</td>
                <td className={CELLULE}>{l.piece ?? '·'}</td>
                <td className={CELLULE}>{l.sousCommission ?? '·'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {e.totauxParCompte.length > 0 && (
        <>
          <Titre>Valeur d’inventaire par compte</Titre>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={`${CELLULE} text-left`}>Compte</th>
                <th className={`${CELLULE} text-right`}>Fiches</th>
                <th className={`${CELLULE} text-right`}>Valeur d’inventaire</th>
              </tr>
            </thead>
            <tbody>
              {e.totauxParCompte.map((t) => (
                <tr key={t.compte}>
                  <td className={CELLULE}>{t.compte}</td>
                  <td className={CELLULE_D}>{t.nombreFiches}</td>
                  <td className={CELLULE_D}>
                    {t.valeurInventaire === null ? `${t.nonValorisees} fiche(s) non valorisée(s)` : montant(t.valeurInventaire)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <Titre>Écarts constatés</Titre>
      {!e.rapprochee ? (
        <div>Non rapprochés de la balance.</div>
      ) : e.ecarts.length === 0 ? (
        <div>Aucun compte rapproché.</div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={`${CELLULE} text-left`}>Compte</th>
              <th className={`${CELLULE} text-right`}>Inventaire</th>
              <th className={`${CELLULE} text-right`}>Comptabilité</th>
              <th className={`${CELLULE} text-right`}>Écart</th>
              <th className={`${CELLULE} text-left`}>Sens</th>
              <th className={`${CELLULE} text-left`}>Décision</th>
              <th className={`${CELLULE} text-left`}>Responsable</th>
              <th className={`${CELLULE} text-left`}>Explication</th>
            </tr>
          </thead>
          <tbody>
            {e.ecarts.map((x) => (
              <tr key={x.compte}>
                <td className={CELLULE}>{x.compte}</td>
                <td className={CELLULE_D}>{montant(x.valeurInventaire)}</td>
                <td className={CELLULE_D}>{montant(x.soldeComptable)}</td>
                <td className={CELLULE_D}>{montant(x.ecart)}</td>
                <td className={CELLULE}>{LIBELLE_SENS_ECART[x.sens]}</td>
                <td className={CELLULE}>{x.decision ? LIBELLE_DECISION_ECART[x.decision] : 'Sans décision'}</td>
                <td className={CELLULE}>{x.responsable ?? '·'}</td>
                <td className={CELLULE}>{x.explication ?? '·'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {e.caisses.length > 0 && (
        <>
          <Titre>Caisses comptées · procès-verbaux distincts</Titre>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={`${CELLULE} text-left`}>Caisse</th>
                <th className={`${CELLULE} text-left`}>Comptage</th>
                <th className={`${CELLULE} text-left`}>Sous-commission</th>
                <th className={`${CELLULE} text-right`}>Espèces comptées</th>
                <th className={`${CELLULE} text-right`}>Solde au livre-journal</th>
                <th className={`${CELLULE} text-right`}>Écart</th>
              </tr>
            </thead>
            <tbody>
              {e.caisses.map((c) => (
                <tr key={c.pvId}>
                  <td className={CELLULE}>{c.caisse}</td>
                  <td className={CELLULE}>
                    {jourImprime(c.dateComptage)}
                    {c.heureComptage ? ` à ${c.heureComptage}` : ''}
                  </td>
                  <td className={CELLULE}>{c.sousCommission}</td>
                  <td className={CELLULE_D}>{dansLUnite(c.especesComptees, c.unite)}</td>
                  <td className={CELLULE_D}>{dansLUnite(c.soldeComptable, c.unite)}</td>
                  <td className={CELLULE_D}>{dansLUnite(c.ecart, c.unite)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <Titre>Signatures</Titre>
      <div className="grid grid-cols-2 gap-6">
        <Signatures titre="Ont inventorié" membres={e.signataires.inventoriants} />
        <Signatures titre="Ont assisté" membres={e.signataires.temoins} />
      </div>
    </>
  );
}

// --- 3. Procès-verbal de comptage de caisse ---------------------------------

function PvCaisse({ e }: { e: EditionPvCaisse }) {
  const u = e.unite;
  const r = e.reconstitution;
  const ligne = (libelle: string, valeur: unknown) => (
    <tr>
      <td className={CELLULE}>{libelle}</td>
      <td className={CELLULE_D}>{dansLUnite(valeur, u)}</td>
    </tr>
  );
  return (
    <>
      <Campagne campagne={e.campagne} />
      <div className="font-bold text-[12.5px]">Caisse {e.caisse}</div>
      <div>
        Comptée le {jourImprime(e.dateComptage)}
        {e.heureComptage ? ` à ${e.heureComptage}` : ''} par la sous-commission {e.sousCommission.nom}
        {u ? ` · montants en ${u}` : ''}
      </div>
      <Mentions mentions={e.mentions} />
      {e.reconstitutionManquante && (
        <div className="border border-black px-2 py-1 my-2">
          Comptée après la clôture sans reconstitution figée · procès-verbal antérieur à la règle.
        </div>
      )}
      <table className="border-collapse mt-2 min-w-[60%]">
        <tbody>
          {r && ligne(`Solde à la clôture du ${jourImprime(r.dateCloture)}`, r.soldeALaCloture)}
          {r &&
            r.mouvementsValeurAvantCloture !== null &&
            r.mouvementsValeurAvantCloture !== 0 &&
            ligne('Opérations à date de valeur antérieure à la clôture', r.mouvementsValeurAvantCloture)}
          {r && ligne(`+ Encaissements jusqu’au comptage (${r.mouvementsPosterieurs ?? '·'} ligne(s) au total)`, r.encaissementsPosterieurs)}
          {r && ligne('− Paiements jusqu’au comptage', r.decaissementsPosterieurs)}
          {ligne('Solde au livre-journal au jour du comptage', e.soldeComptable)}
          {ligne('Espèces comptées', e.especesComptees)}
          {r && ligne('Espèces reconstituées à la clôture', r.especesReconstitueesALaCloture)}
          <tr>
            <td className={`${CELLULE} font-semibold`}>Écart</td>
            <td className={`${CELLULE_D} font-semibold`}>
              {dansLUnite(e.ecart, u)} · {e.ecart === 0 ? 'aucun écart' : e.ecart < 0 ? 'manquant' : 'excédent'}
            </td>
          </tr>
        </tbody>
      </table>

      {e.coupures.length > 0 && (
        <>
          <Titre>Ventilation par coupure</Titre>
          <table className="border-collapse min-w-[60%]">
            <thead>
              <tr>
                <th className={`${CELLULE} text-right`}>Valeur unitaire</th>
                <th className={`${CELLULE} text-right`}>Nombre</th>
                <th className={`${CELLULE} text-right`}>Total</th>
              </tr>
            </thead>
            <tbody>
              {e.coupures.map((c) => (
                <tr key={c.valeurUnitaire}>
                  <td className={CELLULE_D}>{dansLUnite(c.valeurUnitaire, u)}</td>
                  <td className={CELLULE_D}>{c.nombre}</td>
                  <td className={CELLULE_D}>{dansLUnite(c.total, u)}</td>
                </tr>
              ))}
              <tr>
                <td className={`${CELLULE} font-semibold`} colSpan={2}>
                  Total
                </td>
                <td className={`${CELLULE_D} font-semibold`}>{dansLUnite(e.totalCoupures, u)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      <div className="mt-3">
        {e.attestation
          ? `Attestation établie le ${jourImprime(e.attestation.le)}${e.attestation.par ? ` par ${e.attestation.par}` : ''}`
          : 'Aucune attestation enregistrée'}
      </div>
      {e.observations && <div className="mt-1 whitespace-pre-line">Observations · {e.observations}</div>}
      <div className="mt-1">
        Procès-verbal établi le {jourImprime(e.etabli.le)} par {e.etabli.par}
      </div>

      <Titre>Signatures</Titre>
      <div className="grid grid-cols-2 gap-6">
        <Signatures titre="Ont compté" membres={e.sousCommission.inventoriants} />
        <Signatures titre="Ont assisté" membres={e.sousCommission.temoins} />
      </div>
    </>
  );
}

/** L'édition préparée, mise en page selon sa nature. */
export function EditionInventaireImprimee({ edition }: { edition: EditionInventaire }) {
  return (
    <div className="impression-seul edition-inventaire text-[11px] text-black">
      {edition.nature === 'FICHES_DE_COMPTAGE' && <FichesVierges e={edition} />}
      {edition.nature === 'PROCES_VERBAL_INVENTAIRE' && <PvInventaire e={edition} />}
      {edition.nature === 'PROCES_VERBAL_CAISSE' && <PvCaisse e={edition} />}
    </div>
  );
}
