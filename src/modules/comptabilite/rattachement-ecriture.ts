/**
 * RATTACHER UNE ÉCRITURE DÉJÀ PASSÉE À L'OPÉRATION D'UN MODULE QUI PROPOSE.
 *
 * Audit du serveur de 2026-09, I2 · trois colonnes de liaison n'étaient
 * jamais écrites (`EcartInventaire.ecritureId`, `Consignation.
 * ecritureConsignationId` et `ecritureDenouementId`). Ces deux modules
 * PROPOSENT l'écriture et ne la passent jamais (CLAUDE.md § 6, inventaire
 * physique et emballages) : c'est le comptable qui la saisit au journal. Le
 * lien ne peut donc naître que d'un geste qui désigne cette écriture après
 * coup, et ce geste doit refuser une écriture qui ne porte pas ce que le
 * module a proposé · sinon le registre se dirait comptabilisé sur une pièce
 * qui passe autre chose, ce qui est pire que pas de lien du tout.
 *
 * LA RÈGLE · chaque ligne proposée doit trouver dans l'écriture une ligne
 * DISTINCTE, du même sens, du même montant au centime, sur ce compte ou l'une
 * de ses subdivisions (le plan semé est complété à huit chiffres, § 7, et les
 * modules proposent la racine du texte, 4194, 4094). Les lignes EN PLUS sont
 * admises · une ligne de TVA saisie à la main sur une consignation taxable,
 * que le module dit expressément ne pas proposer, ou les autres manquants
 * d'une même campagne passés en une seule pièce.
 */
export interface LigneAttendue {
  compte: string;
  sens: 'DEBIT' | 'CREDIT';
  montant: number;
}

export interface LigneDeLEcriture {
  numero: string;
  debit: number;
  credit: number;
}

const centimes = (n: number) => Math.round(n * 100);

/**
 * Les lignes proposées que l'écriture ne porte pas · vide, elle couvre la
 * proposition. Chaque ligne de l'écriture ne sert qu'une fois : deux lignes
 * proposées identiques demandent deux lignes, et une seule ligne au 4194 ne
 * peut pas justifier deux consignations.
 */
export function lignesManquantes(attendues: LigneAttendue[], lignes: LigneDeLEcriture[]): LigneAttendue[] {
  const libres = [...lignes];
  const manquantes: LigneAttendue[] = [];
  for (const a of attendues) {
    const i = libres.findIndex(
      (l) =>
        l.numero.startsWith(a.compte) &&
        centimes(a.sens === 'DEBIT' ? l.debit : l.credit) === centimes(a.montant) &&
        centimes(a.sens === 'DEBIT' ? l.credit : l.debit) === 0,
    );
    if (i === -1) manquantes.push(a);
    else libres.splice(i, 1);
  }
  return manquantes;
}

/** « 4194 au crédit pour 12 000,00 » · le message nomme ce qui manque. */
export function decrireLigne(l: LigneAttendue): string {
  const montant = l.montant.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${l.compte} au ${l.sens === 'DEBIT' ? 'débit' : 'crédit'} pour ${montant}`;
}
