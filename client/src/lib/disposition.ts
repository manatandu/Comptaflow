/**
 * Le nom proposé par le serveur · la forme UTF-8 (`filename*`, RFC 5987)
 * d'abord, le repli ASCII ensuite. Lire le seul repli ferait télécharger
 * « Societe Demo.pdf » une pièce déposée sous « Société Démo.pdf ».
 */
export function nomDeDisposition(disposition: string | null): string | undefined {
  const utf8 = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf8) {
    try {
      return decodeURIComponent(utf8);
    } catch {
      // encodage invalide · on retombe sur le repli ASCII
    }
  }
  return disposition?.match(/filename="([^"]+)"/)?.[1];
}
