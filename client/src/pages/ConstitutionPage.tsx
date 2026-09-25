import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Aide } from '../components/chrome/Aide';

/**
 * CHECKLIST DE CONSTITUTION D'UNE ASBL OU D'UNE ONG.
 *
 * Le logiciel tenait l'AVAL de cette chaîne sans son amont · la fenêtre
 * Exonérations exige « le certificat d'enregistrement en cours de validité »
 * sans que rien ne dise comment on l'obtient.
 *
 * TROIS FONDEMENTS, MONTRÉS COMME TELS. Une checklist qui présenterait les dix
 * pièces de la note circulaire comme également « légales » serait fausse :
 * l'une d'elles ne repose sur AUCUN texte en vigueur, et le cabinet doit le
 * savoir tout en la fournissant, puisque le dossier est recalé sans elle.
 */
type Fondement = 'LOI' | 'PRATIQUE_ADMINISTRATIVE' | 'USAGE_SANS_BASE_LEGALE';

type Parcours = {
  formeJuridique: string;
  droitEtranger: boolean;
  parFondement: Record<Fondement, number>;
  etapes: {
    cle: string;
    libelle: string;
    destinataire: string;
    source: string;
    produit: string;
    produitDetenu: { champ: string; valeur: string | null; renseigne: boolean } | null;
    pieces: { cle: string; libelle: string; fondement: Fondement; source: string; reserve?: string }[];
  }[];
};

const ETIQUETTE: Record<Fondement, { texte: string; classe: string }> = {
  LOI: { texte: 'loi', classe: 'text-text-dim' },
  PRATIQUE_ADMINISTRATIVE: { texte: 'pratique administrative', classe: 'text-text-dim' },
  // La seule qui se distingue à l'œil · c'est tout l'objet de la colonne.
  USAGE_SANS_BASE_LEGALE: { texte: 'sans base légale en vigueur', classe: 'text-danger font-bold' },
};

export function ConstitutionPage() {
  const [p, setP] = useState<Parcours | null>(null);
  useEffect(() => {
    api.get<Parcours>('/constitution').then(setP).catch(() => setP(null));
  }, []);

  if (!p) return <div className="p-3 text-[11.5px] text-text-dim">Chargement…</div>;

  return (
    <div className="p-2 max-w-[980px]">
      <section className="border border-border bg-surface px-3.5 py-2 mb-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11.5px]">
        <span>
          <strong>Loi</strong> ({p.parFondement.LOI})
        </span>
        <span>
          <strong>Pratique administrative</strong> ({p.parFondement.PRATIQUE_ADMINISTRATIVE})
        </span>
        <span>
          <strong className="text-danger">Sans base légale en vigueur</strong> ({p.parFondement.USAGE_SANS_BASE_LEGALE})
        </span>
        <Aide
          titre="Trois fondements, et ils ne se valent pas"
          texte="Loi · exigée par la loi n° 004/2001 elle-même, article à l'appui. Pratique administrative · exigée par la note circulaire n° 003/2013, qui écrit d'elle-même qu'elle « ne crée pas de droit nouveau » ; refuser de la fournir bloque le dossier, ce n'est pas pour autant une obligation légale. Sans base légale en vigueur · réclamée en pratique, mais son fondement est abrogé ; à fournir en le sachant. OmegaX n'engendre aucune pièce et ne saisit aucune administration · c'est une liste de contrôle, et les modèles d'actes sont au guide."
          source="Loi n° 004/2001 · note circulaire n° 003/2013"
        />
      </section>

      {p.etapes.map((e, rang) => (
        <section key={e.cle} className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="text-[11.5px] font-bold">
              Étape {rang + 1} · {e.libelle}
            </h2>
            {e.produitDetenu && (
              <span className={`text-[11px] ${e.produitDetenu.renseigne ? 'text-positive' : 'text-text-dim'}`}>
                {e.produitDetenu.champ} :{' '}
                {e.produitDetenu.renseigne ? e.produitDetenu.valeur : 'non renseigné au dossier'}
              </span>
            )}
          </div>
          <p className="text-[11px] text-text-dim mt-0.5 leading-[1.6]">
            Devant : {e.destinataire}. <span className="italic">{e.source}</span>
          </p>
          <p className="text-[11px] text-text-dim mt-1 leading-[1.6]">
            <strong>Produit :</strong> {e.produit}
          </p>

          {e.pieces.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {e.pieces.map((piece) => (
                <li key={piece.cle} className="text-[11.5px] border-t border-border/50 pt-1.5">
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <span>{piece.libelle}</span>
                    <span className={`text-[11px] ${ETIQUETTE[piece.fondement].classe}`}>
                      {ETIQUETTE[piece.fondement].texte}
                    </span>
                  </div>
                  <div className="text-[11px] text-text-dim italic">{piece.source}</div>
                  {piece.reserve && (
                    <div className="text-[11px] text-text-dim mt-0.5 leading-[1.6] border-l-2 border-border pl-2">
                      {piece.reserve}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
