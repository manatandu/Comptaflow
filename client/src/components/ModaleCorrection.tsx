import { useEffect, useMemo, useState } from 'react';

/**
 * MOTIF DE CORRECTION · la boîte qui remplace le `window.prompt` d'avant.
 *
 * Le champ existe parce que l'art. 20 de l'AUDCIF, repris par la Partie 2
 * ch. 2 du SYCEBNL, impose que les documents comptables soient tenus « sans
 * blanc ni altération d'aucune sorte » : une écriture en négatif dont on
 * ignore la raison EST une altération, pas une correction. Le motif est donc
 * la pièce qui rend l'annulation lisible à un tiers · un commissaire aux
 * comptes, un auditeur de bailleur, un contrôleur, deux ans plus tard.
 *
 * D'où le reproche auquel cet écran répond, mot pour mot : « ça demande un
 * motif de correction, qu'est-ce qu'on est censé mettre dans ce champ ? ».
 * Une invite vide ne le disait pas. Elle demandait à l'utilisateur d'inventer
 * une convention que le logiciel connaît pourtant. La boîte propose donc les
 * NATURES D'ERREUR réellement rencontrées en tenue de comptes, puis réclame
 * la précision qu'aucune liste ne peut deviner : ce qui aurait dû être passé.
 *
 * Le motif enregistré est la phrase complète « Nature · précision », pour
 * qu'il reste lisible seul, dans le journal comme dans l'export Excel, sans
 * table de correspondance à consulter.
 */

/**
 * Les huit natures couvrent ce qu'on corrige effectivement dans un journal.
 * Chacune porte son exemple : c'est l'exemple, plus que le libellé, qui dit
 * à l'utilisateur le niveau de détail attendu dans la précision.
 */
const NATURES: { code: string; libelle: string; exemple: string }[] = [
  {
    code: 'COMPTE',
    libelle: 'Erreur de compte',
    exemple: 'Imputé au 6221 au lieu du 6222 · loyer et non entretien.',
  },
  {
    code: 'MONTANT',
    libelle: 'Erreur de montant',
    exemple: 'Saisi 1 250 000 au lieu de 1 205 000 · facture FA-2026-114.',
  },
  {
    code: 'SENS',
    libelle: 'Sens inversé (débit / crédit)',
    exemple: 'Le 521 a été débité au lieu d’être crédité.',
  },
  {
    code: 'TIERS',
    libelle: 'Erreur de tiers',
    exemple: 'Imputé au fournisseur MABANGA au lieu de KABEYA.',
  },
  {
    code: 'DATE',
    libelle: 'Erreur de date ou de période',
    exemple: 'Datée du 03/02 alors que la pièce est du 03/01.',
  },
  {
    code: 'DOUBLON',
    libelle: 'Pièce enregistrée deux fois',
    exemple: 'Facture FA-2026-087 déjà saisie sous la pièce n° 42.',
  },
  {
    code: 'JUSTIFICATIF',
    libelle: 'Pièce justificative absente ou non conforme',
    exemple: 'Aucune facture au dossier · dépense non justifiée.',
  },
  {
    code: 'AUTRE',
    libelle: 'Autre motif',
    exemple: 'Décrivez l’erreur et ce qui sera enregistré à la place.',
  },
];

export function ModaleCorrection({
  libelleEcriture,
  onValider,
  onFermer,
  enCours = false,
}: {
  libelleEcriture: string;
  onValider: (motif: string) => void;
  onFermer: () => void;
  enCours?: boolean;
}) {
  const [nature, setNature] = useState(NATURES[0]);
  const [precision, setPrecision] = useState('');

  useEffect(() => {
    const onEchap = (e: KeyboardEvent) => e.key === 'Escape' && onFermer();
    document.addEventListener('keydown', onEchap);
    return () => document.removeEventListener('keydown', onEchap);
  }, [onFermer]);

  const motif = useMemo(
    () => `${nature.libelle} · ${precision.trim()}`,
    [nature.libelle, precision],
  );

  // La précision est OBLIGATOIRE, et pas seulement non vide : « erreur » ne
  // renseigne personne. Le seuil de 10 caractères écarte les motifs réflexes
  // sans transformer la saisie en épreuve · une vraie précision les dépasse
  // toujours (« facture FA-2026-114 » en fait 20).
  const precisionSuffisante = precision.trim().length >= 10;

  return (
    <div className="fixed inset-0 z-50 bg-black/35 flex items-center justify-center p-4" onClick={onFermer}>
      <div
        className="anim-modale w-[560px] max-h-full overflow-auto rounded-[12px] bg-surface border border-border-dark shadow-dominante"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-3.5 py-2 text-white rounded-t-[11px]"
          style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
        >
          <span className="text-[12px] font-semibold">Correction par inscription en négatif</span>
          <button onClick={onFermer} className="text-white/70 hover:text-white text-[13px] leading-none px-1">
            ✕
          </button>
        </div>

        <div className="p-4 space-y-3.5">
          <p className="text-[12px] text-text-dim leading-relaxed">
            L’écriture <span className="font-semibold text-text">« {libelleEcriture} »</span> ne sera ni modifiée ni
            supprimée : elle reste au journal, et une écriture de sens identique et de montants négatifs l’annule
            (art. 20 de l’AUDCIF). Passez ensuite l’enregistrement exact.
          </p>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-dim mb-1.5">
              Nature de l’erreur
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {NATURES.map((n) => (
                <button
                  key={n.code}
                  type="button"
                  onClick={() => setNature(n)}
                  className={`rounded-[8px] border px-2.5 py-1.5 text-left text-[11.5px] transition-colors duration-150 ${
                    nature.code === n.code
                      ? 'border-sel bg-sel-soft text-sel font-semibold'
                      : 'border-border hover:bg-chrome-alt'
                  }`}
                >
                  {n.libelle}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-dim mb-1.5">
              Précision · ce qui était faux, et ce qui sera enregistré
            </label>
            <textarea
              autoFocus
              rows={3}
              value={precision}
              onChange={(e) => setPrecision(e.target.value)}
              placeholder={n_exemple(nature)}
              className="w-full rounded-[8px] border border-border bg-bg px-2.5 py-2 text-[12.5px] leading-relaxed focus:outline-none focus:border-sel"
            />
            <p className="mt-1 text-[11px] text-text-dim">
              Exemple : <span className="italic">{nature.exemple}</span>
            </p>
          </div>

          <div className="rounded-[8px] border border-border bg-chrome-alt px-3 py-2">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-dim mb-1">
              Motif tel qu’il figurera au journal
            </div>
            <div className="text-[12px] font-medium">
              {precisionSuffisante ? motif : <span className="text-text-dim italic">Complétez la précision…</span>}
            </div>
          </div>
        </div>

        <div className="border-t border-border px-3.5 py-2.5 flex justify-end gap-2">
          <button
            onClick={onFermer}
            className="rounded-[8px] border border-border px-3 py-1.5 text-[11.5px] font-semibold hover:bg-chrome-alt"
          >
            Annuler
          </button>
          <button
            onClick={() => onValider(motif)}
            disabled={!precisionSuffisante || enCours}
            className="rounded-[8px] bg-sel px-3.5 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-sel/90"
          >
            {enCours ? 'Correction…' : 'Passer la correction'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Placeholder = l'exemple, sans sa ponctuation finale · une invite, pas une phrase. */
function n_exemple(n: { exemple: string }) {
  return n.exemple.replace(/\.$/, '');
}
