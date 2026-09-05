import { useAuth } from '../../lib/auth';
import { BlocMarqueOmegaX } from './Logo';

/**
 * DIVISION SYCEBNL / SYSCOHADA · la boîte annonçait « référentiel SYCEBNL »
 * à tout dossier, y compris à une société commerciale tenue en SYSCOHADA.
 * OmegaX sert les deux référentiels de l'OHADA · la ligne nomme celui du
 * dossier ouvert, et se contente de « OHADA » tant qu'aucun dossier ne l'est.
 */
const LIBELLE_REFERENTIEL: Record<string, string> = {
  SYCEBNL: 'référentiel SYCEBNL (entités à but non lucratif)',
  SYSCOHADA: 'référentiel SYSCOHADA révisé (entités à but lucratif)',
};

export function AProposModale({ onFermer }: { onFermer: () => void }) {
  const { utilisateur } = useAuth();
  const referentiel = utilisateur?.tenant.referentiel;
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center" onClick={onFermer}>
      <div
        className="bg-surface border border-border-dark w-[360px] shadow-none max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-chrome border-b border-border px-3 py-2 flex items-center justify-between">
          <span className="text-[11px] font-bold">À propos d'OmegaX</span>
          <button onClick={onFermer} className="text-text-dim hover:text-text text-[12px] leading-none px-1">
            ✕
          </button>
        </div>
        <div className="p-4 text-[11px] space-y-2">
          {/*
            La boîte « À propos » est le seul écran dont le SUJET est le
            logiciel lui-même : c'est la place du bloc complet, signe et mot
            dans leur rapport figé. Ailleurs le signe suffit, le nom étant
            déjà écrit à côté.
          */}
          <BlocMarqueOmegaX hauteur={26} className="text-[color:var(--a-900)] mb-3" />
          {/* Le filet de clôture · il sépare la marque de ce qui la décrit. */}
          <hr className="filet-cloture text-text-dim !mb-3" />
          <p className="text-text-dim">
            Logiciel de comptabilité OHADA
            {referentiel && LIBELLE_REFERENTIEL[referentiel] ? ` · ${LIBELLE_REFERENTIEL[referentiel]}` : ''}.
          </p>
          <p className="text-text-dim">Version de développement.</p>
        </div>
        <div className="border-t border-border px-3 py-2 flex justify-end">
          <button onClick={onFermer} className="bg-sel text-white text-[10.5px] font-semibold px-3 py-1">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
