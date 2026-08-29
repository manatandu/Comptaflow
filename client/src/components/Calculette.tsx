import { useEffect, useRef, useState } from 'react';
import { evaluerExpression } from '../lib/calcul';

/**
 * CALCULETTE · Édition → Calculette Sage.
 *
 * Anecdotique sur le papier, réclamée par tous les utilisateurs de Sage : ce
 * qui la distingue d'une calculatrice ordinaire, c'est qu'elle REVERSE son
 * résultat dans la zone de montant. Sans ce report, l'utilisateur recopie à
 * la main un nombre qu'il vient de calculer, et c'est là que se glissent les
 * fautes de frappe.
 *
 * L'expression est évaluée par un petit analyseur maison plutôt que par
 * `eval` : une zone de saisie ne doit jamais devenir un point d'exécution de
 * code, même dans une application authentifiée.
 */

const TOUCHES = [
  ['7', '8', '9', '/'],
  ['4', '5', '6', '*'],
  ['1', '2', '3', '-'],
  ['0', '.', '(', ')'],
];

export function Calculette({
  onFermer,
  onReporter,
}: {
  onFermer: () => void;
  /**
   * Reporte le résultat dans une zone de montant. ABSENT quand la calculette
   * est ouverte depuis la barre d'outils : il n'y a alors aucune zone de
   * saisie où reporter, et proposer « OK » y serait un bouton qui ne fait
   * rien. Le calcul se copie alors dans le presse-papiers, ce qui est le
   * service réellement rendu dans ce cas.
   */
  onReporter?: (valeur: number) => void;
}) {
  const [expression, setExpression] = useState('');
  const reporterOuCopier = (valeur: number) => {
    if (onReporter) return onReporter(valeur);
    navigator.clipboard?.writeText(String(valeur)).catch(() => {});
    onFermer();
  };
  const champ = useRef<HTMLInputElement>(null);
  const resultat = evaluerExpression(expression);

  useEffect(() => {
    champ.current?.focus();
    const surTouche = (e: KeyboardEvent) => e.key === 'Escape' && onFermer();
    document.addEventListener('keydown', surTouche);
    return () => document.removeEventListener('keydown', surTouche);
  }, [onFermer]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 anim-voile" onClick={onFermer}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[280px] bg-surface border border-border rounded-[10px] overflow-hidden shadow-flottante anim-modale"
      >
        <div
          className="h-[30px] flex items-center justify-between px-3 text-white text-[12px]"
          style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
        >
          <span>Calculette</span>
          <button onClick={onFermer} className="text-white/85 hover:text-white leading-none px-1">
            ✕
          </button>
        </div>

        <div className="p-3">
          <input
            ref={champ}
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && resultat !== null) reporterOuCopier(resultat);
            }}
            placeholder="1250 * 12 + 300"
            className="w-full border border-border rounded-[6px] px-2.5 py-2 text-[14px] font-mono text-right"
          />
          <div
            className={`mt-1.5 text-right font-mono text-[16px] font-bold h-[22px] ${
              expression && resultat === null ? 'text-danger text-[12px] font-normal' : ''
            }`}
          >
            {resultat !== null
              ? resultat.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : expression
                ? 'expression incomplète'
                : ''}
          </div>

          <div className="grid grid-cols-4 gap-1 mt-2">
            {TOUCHES.flat().map((t) => (
              <button
                key={t}
                onClick={() => {
                  setExpression((e) => e + t);
                  champ.current?.focus();
                }}
                className="border border-border rounded-[6px] py-1.5 text-[13px] font-mono hover:bg-chrome-alt"
              >
                {t}
              </button>
            ))}
            <button
              onClick={() => {
                setExpression('');
                champ.current?.focus();
              }}
              className="border border-border rounded-[6px] py-1.5 text-[12px] hover:bg-chrome-alt"
            >
              C
            </button>
            <button
              onClick={() => {
                setExpression((e) => e.slice(0, -1));
                champ.current?.focus();
              }}
              className="border border-border rounded-[6px] py-1.5 text-[12px] hover:bg-chrome-alt"
            >
              ←
            </button>
            <button
              onClick={() => {
                setExpression((e) => e + '+');
                champ.current?.focus();
              }}
              className="border border-border rounded-[6px] py-1.5 text-[13px] font-mono hover:bg-chrome-alt"
            >
              +
            </button>
            <button
              onClick={() => resultat !== null && reporterOuCopier(resultat)}
              disabled={resultat === null}
              className="bg-sel text-white rounded-[6px] py-1.5 text-[12px] font-bold hover:brightness-110 disabled:opacity-40"
            >
              {onReporter ? 'OK' : 'Copier'}
            </button>
          </div>

          <p className="text-[10.5px] text-text-dim mt-2 leading-[1.5]">
            {onReporter
              ? "Le résultat se reporte dans la zone de montant du côté qui manque à l'équilibre de la pièce."
              : 'Le résultat se copie dans le presse-papiers.'}
          </p>
        </div>
      </div>
    </div>
  );
}
