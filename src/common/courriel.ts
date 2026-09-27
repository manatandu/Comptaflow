import { Transform } from 'class-transformer';

/**
 * L'ADRESSE DE CONNEXION EST NORMALISÉE À CHAQUE PORTE (audit final F43) ·
 * espaces retirés, minuscules. L'unicité de `User.email` est sensible à la
 * casse, la promotion d'un opérateur ne l'était pas : un compte
 * « ADMIN@… » créé dans n'importe quel dossier recevait la console au
 * déploiement suivant. Une adresse normalisée partout rend les deux égales, et
 * la contrainte posée en base (migration 20261125000000) refuse ce qui
 * passerait à côté.
 */
export function normaliserCourriel(adresse: string): string {
  return adresse.trim().toLowerCase();
}

/** Le même geste, posé sur un champ de DTO · le pipe global transforme. */
export function CourrielNormalise(): PropertyDecorator {
  return Transform(({ value }) => (typeof value === 'string' ? normaliserCourriel(value) : value));
}
