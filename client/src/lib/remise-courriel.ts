import type { AvisAcces, RemiseCourriel } from './types';

/**
 * CE QUI A ÉTÉ REMIS, ET CE QUI NE L'A PAS ÉTÉ · le dire à l'écran.
 *
 * Le serveur ne ment plus : POST /relances/emettre rend `misesEnFile` et
 * `nonRemises`, POST /utilisateurs rend `avis`. Mais une correction qui vit
 * dans la charge utile de l'API sans atteindre un écran n'est pas livrée : le
 * comptable qui lit « 20 courriers préparés » croit que vingt tiers ont été
 * touchés, alors que dix-sept n'ont aucune adresse.
 *
 * Ces fonctions sont pures et sans JSX à dessein : le dépôt n'a ni jsdom ni
 * bibliothèque de rendu, et les phrases qui portent une affirmation doivent
 * s'EXÉCUTER dans un test plutôt que s'y faire relire (même raison que
 * courrier-file.ts et menu-groupes.ts).
 */

export type { AvisAcces, RemiseCourriel };

export type TonRemise = 'remis' | 'garde' | 'manque';

/**
 * SANS_TRANSPORT n'est ni un envoi ni une perte · il ne se peint donc pas en
 * rouge (ce serait une panne) ni en vert (ce serait un envoi). Le seul rouge
 * ici est pour ce qui n'est entré nulle part et ne repartira jamais tout seul.
 */
export function tonRemise(remise: RemiseCourriel): TonRemise {
  if (remise.statut === null) return 'manque';
  if (remise.statut === 'ENVOYE') return 'remis';
  return 'garde';
}

/** Ce que porte la ligne d'une lettre · court, sans jamais dire « envoyé ». */
export function libelleRemise(remise: RemiseCourriel): string {
  switch (remise.statut) {
    case null:
      return "Non remise";
    case 'ENVOYE':
      return 'Envoyée';
    case 'SANS_TRANSPORT':
      return 'Gardée, pas de messagerie';
    case 'ECHEC':
      return 'Échec, sera reprise';
    case 'ABANDONNE':
      return 'Abandonnée après plusieurs essais';
    case 'EN_ATTENTE':
      return "En file d'envoi";
  }
}

/**
 * LA PHRASE DU BILAN D'ÉMISSION.
 *
 * `emises` compte les LETTRES ÉCRITES dans l'historique · elles existent
 * toutes, elles s'impriment toutes, et c'est cela qu'annonçait l'ancienne
 * phrase. Ce qu'elle taisait, c'est combien sont parties à quelqu'un. Les
 * deux nombres sont donc dits, et le second ne se déduit pas du premier.
 */
export function phraseEmission(bilan: { emises: number; misesEnFile: number; nonRemises: number }): string {
  const lettres = bilan.emises <= 1 ? `${bilan.emises} courrier préparé` : `${bilan.emises} courriers préparés`;
  if (bilan.emises === 0) return 'Aucun courrier préparé.';
  if (bilan.nonRemises === 0) {
    return `${lettres} · tous mis en file de départ.`;
  }
  if (bilan.misesEnFile === 0) {
    return `${lettres} · AUCUN n'a de destinataire, ils sont enregistrés et s'impriment, ils ne sont partis à personne.`;
  }
  const restants =
    bilan.nonRemises === 1
      ? "1 n'a pas de destinataire"
      : `${bilan.nonRemises} n'ont pas de destinataire`;
  return `${lettres} · ${bilan.misesEnFile} mis en file de départ, ${restants} et ne sont partis à personne.`;
}

/**
 * CE QUE L'ADMINISTRATEUR DOIT LIRE APRÈS AVOIR OUVERT UN ACCÈS.
 *
 * Le mot de passe n'est jamais dans l'avis (voir avis-acces.service.ts) : la
 * phrase le rappelle, sans quoi l'administrateur croirait n'avoir plus rien à
 * faire alors que c'est LUI qui remet le mot de passe.
 */
export function phraseAvisAcces(avis: AvisAcces | null | undefined): string {
  if (!avis) return '';
  if (!avis.avise) {
    return `${avis.destinataire} n'a pas été averti · ${avis.motif ?? "la file a refusé le message."}`;
  }
  if (avis.statut === 'SANS_TRANSPORT') {
    return `Un avis est écrit pour ${avis.destinataire}, il n'est pas encore parti · aucune messagerie n'est configurée sur cette installation. Il repartira tel quel le jour où elle le sera. Le mot de passe, lui, n'y figure pas : c'est vous qui le remettez.`;
  }
  if (avis.statut === 'ENVOYE') {
    return `Un avis a été envoyé à ${avis.destinataire}. Le mot de passe n'y figure pas : c'est vous qui le remettez.`;
  }
  return `Un avis est en file de départ pour ${avis.destinataire}. Le mot de passe n'y figure pas : c'est vous qui le remettez.`;
}
