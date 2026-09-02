import { createHash } from 'node:crypto';

/**
 * CHAÎNE D'EMPREINTES · AUDCIF art. 22, 5° : « est réputée intègre toute
 * transcription indélébile entraînant une modification irréversible du
 * support ». Une table Postgres n'est pas indélébile · un UPDATE direct en
 * base reste possible pour qui tient les clés. Ce qu'on peut garantir, en
 * revanche, c'est que la retouche SE VOIE.
 *
 * Chaque événement porte l'empreinte du précédent. Retirer une ligne, en
 * insérer une, ou changer un seul caractère d'un champ journalisé casse le
 * chaînage à partir de ce point · la vérification le dit, et dit où.
 *
 * Le contenu haché comprend le RANG et l'empreinte précédente : deux
 * événements par ailleurs identiques (même acteur, même seconde, même valeur)
 * ne peuvent donc pas partager une empreinte, ce qui rendrait l'un des deux
 * suppressible sans trace.
 */
export interface ContenuEmpreinte {
  rang: number;
  tenantId: string | null;
  horodatage: Date;
  acteurId: string | null;
  acteurEmail: string;
  adresseIp: string | null;
  action: string;
  entite: string;
  entiteId: string | null;
  avant: unknown;
  apres: unknown;
  empreintePrecedente: string;
}

/** Premier maillon d'une chaîne · une valeur fixe, pas une chaîne vide. */
export const EMPREINTE_ORIGINE = 'origine';

/**
 * JSON.stringify ne garantit pas l'ordre des clés d'un objet reconstruit
 * depuis la base · deux relectures du même événement donneraient deux
 * empreintes différentes et une fausse alarme de falsification. On sérialise
 * donc en triant les clés, à toute profondeur.
 */
function serialiserStable(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return 'null';
  if (Array.isArray(valeur)) return `[${valeur.map(serialiserStable).join(',')}]`;
  if (valeur instanceof Date) return JSON.stringify(valeur.toISOString());
  if (typeof valeur === 'object') {
    const o = valeur as Record<string, unknown>;
    const cles = Object.keys(o).sort();
    return `{${cles.map((c) => `${JSON.stringify(c)}:${serialiserStable(o[c])}`).join(',')}}`;
  }
  // Un Decimal de Prisma, un BigInt · leur `toString` est stable, pas leur
  // sérialisation JSON (BigInt la fait même échouer).
  if (typeof valeur === 'bigint') return `"${valeur.toString()}"`;
  return JSON.stringify(valeur);
}

export function calculerEmpreinte(contenu: ContenuEmpreinte): string {
  const corps = serialiserStable({
    rang: contenu.rang,
    tenantId: contenu.tenantId,
    horodatage: contenu.horodatage.toISOString(),
    acteurId: contenu.acteurId,
    acteurEmail: contenu.acteurEmail,
    // L'adresse entre dans l'empreinte · elle fait partie de la trace, et ce
    // qui n'est pas haché se retouche sans laisser de marque.
    adresseIp: contenu.adresseIp,
    action: contenu.action,
    entite: contenu.entite,
    entiteId: contenu.entiteId,
    avant: contenu.avant ?? null,
    apres: contenu.apres ?? null,
    precedente: contenu.empreintePrecedente,
  });
  return createHash('sha256').update(corps, 'utf8').digest('hex');
}
