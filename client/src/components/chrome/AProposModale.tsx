export function AProposModale({ onFermer }: { onFermer: () => void }) {
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
          <p className="font-semibold">OmegaX</p>
          <p className="text-text-dim">Logiciel de comptabilité OHADA · référentiel SYCEBNL.</p>
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
