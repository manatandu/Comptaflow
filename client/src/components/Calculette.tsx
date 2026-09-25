import { useEffect, useRef, useState } from 'react';
import { evaluerExpression } from '../lib/calcul';
import { PortailModale } from './PortailModale';
import { Aide } from './chrome/Aide';

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
    // `preventScroll` · sans lui, la mise au point ouvre le clavier d'un
    // téléphone, le navigateur fait défiler la page pour amener le champ dans
    // la fenêtre visible, et une modale `fixed` se retrouve décalée vers le
    // haut. Le champ est déjà au centre de l'écran : il n'y a rien à faire
    // défiler pour l'atteindre.
    champ.current?.focus({ preventScroll: true });
    const surTouche = (e: KeyboardEvent) => e.key === 'Escape' && onFermer();
    document.addEventListener('keydown', surTouche);
    return () => document.removeEventListener('keydown', surTouche);
  }, [onFermer]);

  return (
    // LE PORTAIL N'EST PAS UN DÉTAIL DE MISE EN OEUVRE · la calculette est
    // appelée depuis la barre de menus, dont le `backdrop-blur` faisait un
    // bloc conteneur pour `position: fixed`. Sans lui, elle se centre sur une
    // barre de 26 px et son sommet passe hors de l'écran. Voir PortailModale.
    //
    // LE PORTAIL NE SUFFISAIT PAS, ET IL RESTAIT TROIS FAÇONS DE SORTIR PAR LE
    // HAUT, toutes corrigées ici.
    //  1. `max-h-[calc(100dvh-2rem)]` était la SEULE borne de hauteur. `dvh`
    //     n'existe pas avant Chrome 108 ni Safari 15.4 : la déclaration y est
    //     invalide, jetée sans bruit, et la modale n'a plus de borne du tout.
    //     `modale-bornee` en pose deux, `vh` puis `dvh`, dans la même règle.
    //  2. `items-center` fait déborder un enfant trop haut des DEUX côtés à
    //     parts égales. `voile-centre-sur` le remplace par un voile défilant
    //     et un centrage par marges automatiques, qui ne deviennent jamais
    //     négatives.
    //  3. La mise au point du champ ouvrait le clavier d'un téléphone et
    //     faisait défiler la page sous la modale · `preventScroll` plus bas.
    <PortailModale>
    <div
      className="fixed inset-0 z-50 bg-black/40 flex justify-center p-4 anim-voile voile-centre-sur"
      onClick={onFermer}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[280px] bg-surface border border-border rounded-[4px] overflow-hidden shadow-flottante anim-modale modale-bornee max-h-[calc(100dvh-2rem)] overflow-y-auto"
      >
        <div
          className="h-[32px] flex items-center justify-between px-3 bg-surface text-text border-b border-border text-[11.5px]"
        >
          <span className="flex items-center gap-1.5">
            Calculette
            <Aide
              titre="Calculette"
              texte={
                onReporter
                  ? "Le résultat se reporte dans la zone de montant du côté qui manque à l'équilibre de la pièce."
                  : 'Le résultat se copie dans le presse-papiers.'
              }
              source="Édition · Calculette"
            />
          </span>
          <button onClick={onFermer} className="-mr-2 self-stretch w-[46px] flex items-center justify-center text-text-dim hover:text-white hover:bg-[#c42b1c]">
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
            className="w-full border border-border rounded-[3px] px-2.5 py-2 text-[13px] font-mono text-right"
          />
          <div
            className={`mt-1.5 text-right font-mono text-[13px] font-bold h-[22px] ${
              expression && resultat === null ? 'text-danger text-[11.5px] font-normal' : ''
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
                className="border border-border rounded-[3px] py-1.5 text-[12px] font-mono hover:bg-chrome-alt"
              >
                {t}
              </button>
            ))}
            <button
              onClick={() => {
                setExpression('');
                champ.current?.focus();
              }}
              className="border border-border rounded-[3px] py-1.5 text-[11.5px] hover:bg-chrome-alt"
            >
              C
            </button>
            <button
              onClick={() => {
                setExpression((e) => e.slice(0, -1));
                champ.current?.focus();
              }}
              className="border border-border rounded-[3px] py-1.5 text-[11.5px] hover:bg-chrome-alt"
            >
              ←
            </button>
            <button
              onClick={() => {
                setExpression((e) => e + '+');
                champ.current?.focus();
              }}
              className="border border-border rounded-[3px] py-1.5 text-[12px] font-mono hover:bg-chrome-alt"
            >
              +
            </button>
            <button
              onClick={() => resultat !== null && reporterOuCopier(resultat)}
              disabled={resultat === null}
              className="bg-sel text-white rounded-[3px] py-1.5 text-[11.5px] font-bold hover:brightness-110 disabled:opacity-40"
            >
              {onReporter ? 'OK' : 'Copier'}
            </button>
          </div>
        </div>
      </div>
    </div>
    </PortailModale>
  );
}
