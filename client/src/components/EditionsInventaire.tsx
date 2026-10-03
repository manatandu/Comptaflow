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
import {
  jourImprime,
  lignesPvCaisse,
  type Table,
  tableCaisses,
  tableCoupures,
  tableEcarts,
  tableFichesVierges,
  tableReleve,
  tableTotauxParCompte,
} from '../lib/editions-inventaire';

/**
 * LES ÉDITIONS DE L'INVENTAIRE (ligne A19) · invisibles à l'écran, seules
 * imprimées (la fenêtre porte `avec-edition` tant qu'une édition est
 * préparée). Le contenu est celui que le serveur sert, mis en cellules par
 * `lib/editions-inventaire.ts` · ce composant ne fait que les poser.
 *
 * LES SIGNATURES SE PORTENT À LA MAIN · la case reste vide, le nom du
 * signataire est imprimé à côté (même parti que `BlocCertification`).
 */

const CELLULE = 'border border-black px-1.5 py-1 align-top';
/** Une case à remplir sur place · assez haute pour écrire à la main. */
const CASE_VIDE = `${CELLULE} h-7`;

/** Les colonnes de montants et de nombres se lisent à droite. */
const ADROITE = new Set([
  'Quantité',
  'Valeur d’inventaire',
  'Fiches',
  'Inventaire',
  'Comptabilité',
  'Écart',
  'Espèces comptées',
  'Solde au livre-journal',
  'Valeur unitaire',
  'Nombre',
  'Total',
]);

function Tableau({ table, aRemplir = 0 }: { table: Table; aRemplir?: number }) {
  const premiereARemplir = table.colonnes.length - aRemplir;
  return (
    <table className="w-full border-collapse mt-1">
      <thead>
        <tr>
          {table.colonnes.map((c, j) => (
            <th key={c} className={`${CELLULE} ${ADROITE.has(c) && j < premiereARemplir ? 'text-right' : 'text-left'}`}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.lignes.map((l, i) => (
          <tr key={i}>
            {l.map((v, j) =>
              j >= premiereARemplir ? (
                <td key={j} className={CASE_VIDE} />
              ) : (
                <td key={j} className={`${CELLULE} ${ADROITE.has(table.colonnes[j]) ? 'text-right tabular-nums' : ''}`}>
                  {v}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

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
            <Tableau table={tableFichesVierges(s, e.colonnesARemplir)} aRemplir={e.colonnesARemplir.length} />
          )}
        </section>
      ))}
    </>
  );
}

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
      {e.releve.length === 0 ? <div>Aucune fiche.</div> : <Tableau table={tableReleve(e)} />}

      {e.totauxParCompte.length > 0 && (
        <>
          <Titre>Valeur d’inventaire par compte</Titre>
          <Tableau table={tableTotauxParCompte(e)} />
        </>
      )}

      <Titre>Écarts constatés</Titre>
      {!e.rapprochee ? (
        <div>Non rapprochés de la balance.</div>
      ) : e.ecarts.length === 0 ? (
        <div>Aucun compte rapproché.</div>
      ) : (
        <Tableau table={tableEcarts(e)} />
      )}

      {e.caisses.length > 0 && (
        <>
          <Titre>Caisses comptées · procès-verbaux distincts</Titre>
          <Tableau table={tableCaisses(e)} />
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

function PvCaisse({ e }: { e: EditionPvCaisse }) {
  const coupures = tableCoupures(e);
  return (
    <>
      <Campagne campagne={e.campagne} />
      <div className="font-bold text-[12.5px]">Caisse {e.caisse}</div>
      <div>
        Comptée le {jourImprime(e.dateComptage)}
        {e.heureComptage ? ` à ${e.heureComptage}` : ''} par la sous-commission {e.sousCommission.nom}
        {e.unite ? ` · montants en ${e.unite}` : ''}
      </div>
      <Mentions mentions={e.mentions} />
      {e.reconstitutionManquante && (
        <div className="border border-black px-2 py-1 my-2">
          Comptée après la clôture sans reconstitution figée · procès-verbal antérieur à la règle.
        </div>
      )}
      <table className="border-collapse mt-2 min-w-[60%]">
        <tbody>
          {lignesPvCaisse(e).map(([libelle, valeur]) => (
            <tr key={libelle}>
              <td className={CELLULE}>{libelle}</td>
              <td className={`${CELLULE} text-right tabular-nums`}>{valeur}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {coupures && (
        <>
          <Titre>Ventilation par coupure</Titre>
          <Tableau table={coupures} />
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
