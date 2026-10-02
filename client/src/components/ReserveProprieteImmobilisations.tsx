import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { montant } from '../lib/montants';
import { Aide } from './chrome/Aide';

/**
 * LA RÉSERVE DE PROPRIÉTÉ (lot 15) · une information de fiche, aucune
 * écriture (AUDCIF Titre VIII ch. 9 ; SYCEBNL, cadre conceptuel § 3.3.1.1.6).
 * Le serveur refuse qu'un bien dont la dette est au 4816 se dise sans clause,
 * et un règlement final antérieur à l'acquisition.
 */
export function ReserveProprieteBien({
  bien,
  syscohada,
  onFait,
  onFermer,
}: {
  bien: { id: string; designation: string; reserveDePropriete?: boolean; reserveProprieteLeveeLe?: string | null };
  syscohada: boolean;
  onFait: (message: string) => void;
  onFermer: () => void;
}) {
  const { peutEcrire } = useAuth();
  const [clause, setClause] = useState(!!bien.reserveDePropriete);
  const [leveeLe, setLeveeLe] = useState(bien.reserveProprieteLeveeLe ? bien.reserveProprieteLeveeLe.slice(0, 10) : '');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  if (!peutEcrire) return null;

  const envoyer = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      await api.patch(`/immobilisations/${bien.id}/reserve-de-propriete`, {
        reserveDePropriete: clause,
        leveeLe: clause && leveeLe ? leveeLe : null,
      });
      onFait(
        clause
          ? leveeLe
            ? `« ${bien.designation} » · règlement final au ${leveeLe.split('-').reverse().join('/')}.`
            : `« ${bien.designation} » · frappé de réserve de propriété.`
          : `« ${bien.designation} » · sans réserve de propriété.`,
      );
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Déclaration refusée');
    } finally {
      setEnvoi(false);
    }
  };

  const libelle = 'text-[11.5px] font-semibold text-text-dim';
  return (
    <form onSubmit={(e) => void envoyer(e)} className="bg-chrome border-b border-border px-4 py-3" data-reserve-propriete>
      {erreur && <div className="mb-2 text-[11.5px] text-danger">{erreur}</div>}
      <div className="flex flex-wrap items-end gap-4">
        <label className={`${libelle} flex items-center gap-1.5`}>
          <input type="checkbox" checked={clause} onChange={(e) => setClause(e.target.checked)} />
          Clause de réserve de propriété
          <Aide
            titre="Réserve de propriété"
            texte="Le bien entre à l'actif dès sa livraison, comme si l'entité en était propriétaire, et s'amortit comme tel. La clause disparaît au règlement final, sans écriture · seule l'information change."
            source={syscohada ? 'AUDCIF, Titre VIII ch. 9 § 1.2 et § 2.1' : 'SYCEBNL, cadre conceptuel § 3.3.1.1.6'}
          />
        </label>
        {clause && (
          <label className={libelle}>
            Règlement final
            <input type="date" value={leveeLe} onChange={(e) => setLeveeLe(e.target.value)} className="mt-1 block border border-border-dark px-2 py-1 text-[11.5px] font-mono" />
          </label>
        )}
        <button type="submit" disabled={envoi} className="bg-sel text-white text-[11.5px] font-semibold px-3 py-1.5 disabled:opacity-50">
          {envoi ? '…' : 'Enregistrer'}
        </button>
        <button type="button" onClick={onFermer} className="text-[11.5px] font-semibold text-text-dim px-3 py-1.5">
          Annuler
        </button>
      </div>
    </form>
  );
}

interface BiensLus {
  source: string;
  date: string;
  biens: { id: string; designation: string; compte: string; dateAcquisition: string; valeurOrigine: number }[];
  total: number;
  nombre: number;
  tronque: boolean;
}

/**
 * Les immobilisations frappées de réserve de propriété à la clôture · le
 * montant que les Notes annexes indiquent (AUDCIF Titre VIII ch. 9 § 3).
 * `null` tant que la liste n'est pas lue · « aucun » ne se dit que sur une
 * liste lue.
 */
export function BiensSousReserveDePropriete({ exerciceId, syscohada }: { exerciceId: string | undefined; syscohada: boolean }) {
  const [lus, setLus] = useState<BiensLus | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!exerciceId) return;
    setLus(null);
    setErreur(null);
    api
      .get<BiensLus>(`/immobilisations/reserve-de-propriete?exerciceId=${encodeURIComponent(exerciceId)}`)
      .then(setLus)
      .catch((err) => setErreur(err instanceof ApiError ? err.message : 'Liste illisible'));
  }, [exerciceId]);

  return (
    <div className="border border-border bg-surface shadow-posee max-w-[1180px] mt-3 text-[11.5px]" data-biens-reserve-propriete>
      <div className="px-3.5 py-1.5 bg-chrome border-b border-border font-semibold text-text-dim flex items-center gap-1.5">
        Biens sous réserve de propriété
        <Aide
          titre="Biens sous réserve de propriété"
          texte="Les immobilisations frappées de la clause à la clôture de l'exercice, avec leur valeur d'entrée · le montant à indiquer aux Notes annexes quelle que soit son importance, sauf montant dérisoire."
          source={syscohada ? 'AUDCIF, Titre VIII ch. 9 § 3' : 'SYCEBNL, cadre conceptuel § 3.3.1.1.6'}
        />
      </div>
      <div className="px-3.5 py-1.5">
        {!exerciceId ? (
          <div className="text-text-dim">Choisissez d'abord un exercice.</div>
        ) : erreur ? (
          <div className="text-danger">{erreur}</div>
        ) : lus === null ? (
          <div className="text-text-dim">…</div>
        ) : lus.biens.length === 0 ? (
          <div className="text-text-dim">Aucun bien sous réserve de propriété au {lus.date.split('-').reverse().join('/')}.</div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-left">Bien</th>
                  <th className="text-left">Compte</th>
                  <th className="text-left">Acquis le</th>
                  <th className="text-right">Valeur d'entrée</th>
                </tr>
              </thead>
              <tbody>
                {lus.biens.map((b) => (
                  <tr key={b.id}>
                    <td>{b.designation}</td>
                    <td>{b.compte}</td>
                    <td>{new Date(b.dateAcquisition).toLocaleDateString('fr-FR')}</td>
                    <td className="text-right">{montant(b.valeurOrigine)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-1 font-semibold">
              Total au {lus.date.split('-').reverse().join('/')} · {montant(lus.total)} ({lus.nombre} bien{lus.nombre > 1 ? 's' : ''})
              {lus.tronque ? ' · liste limitée aux 500 premiers' : ''}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
