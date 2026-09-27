/**
 * CLÔTURE DE PÉRIODE · la seule clôture qui fige TOUS les journaux et ne
 * s'annule jamais (audit final F7). La confirmation nomme la date et le
 * caractère définitif, parce qu'une faute de frappe sur l'année ne se
 * rattrape plus ensuite.
 */
export function confirmationCloturePeriode(dateLimite: string): string {
  const date = new Date(`${dateLimite}T00:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC' });
  return (
    `Clôturer TOUS les journaux jusqu'au ${date} ?\n\n` +
    'Cette clôture est DÉFINITIVE : elle ne s’annule pas. Jusqu’à cette date, plus aucune saisie, ' +
    'aucun lettrage, aucune ventilation analytique ne sera possible.'
  );
}
