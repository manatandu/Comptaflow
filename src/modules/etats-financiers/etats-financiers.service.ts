import { Injectable } from '@nestjs/common';
import { ClasseCompte, TypeCompteDetailTotal } from '@prisma/client';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * ⚠️ Regroupement SIMPLIFIÉ classe de compte → poste ACTIF/PASSIF, à but de
 * démonstration MVP (calqué sur l'écran « États financiers » du canevas de
 * design). Ce n'est PAS le tableau de correspondance postes/comptes officiel
 * SYCEBNL (Partie 4, ch. 2 — voir le moteur `liasse/` du skill `sycebnl`,
 * bâti précisément pour ça et déjà vérifié contre le Journal officiel).
 *
 * Ne pas présenter le résultat de ce module comme un bilan SYCEBNL conforme
 * sans être passé par ce tableau de correspondance réel — à remplacer avant
 * toute mise en production. La règle appliquée ici :
 *   - Classe 1 (fonds propres/durables) → PASSIF, en totalité
 *   - Classe 2/3 (immobilisations/stocks) → ACTIF, en totalité
 *   - Classe 4/5 (tiers/trésorerie) → ACTIF si le compte est débiteur,
 *     PASSIF si créditeur (un compte de tiers ou de trésorerie peut être
 *     l'un ou l'autre selon son solde, contrairement aux classes 1/2/3)
 *   - Classe 6/7 (charges/produits) → jamais affichées comme postes de
 *     bilan ; leur solde net devient la ligne « Excédent / déficit de
 *     l'exercice » du passif (fonds propres), comme le fait le compte 13
 *     officiel (voir sycebnl, COMPTE 13) à la clôture.
 */
@Injectable()
export class EtatsFinanciersService {
  constructor(private readonly ecritureService: EcritureService) {}

  async bilan(tenantId: string, exerciceId: string) {
    const { lignes } = await this.ecritureService.balance(tenantId, exerciceId);

    const actif: Array<{ numero: string; intitule: string; montant: number }> = [];
    const passif: Array<{ numero: string; intitule: string; montant: number }> = [];
    let resultatNet = 0;

    // Comptes Total (§3.1) exclus : leur solde n'est qu'un agrégat
    // d'affichage des comptes Détail de même racine, déjà comptés
    // individuellement ci-dessous — les inclure aussi doublerait le montant
    // (même raison que balance() qui les exclut déjà de ses totaux généraux).
    const lignesDetailSeules = lignes.filter((l) => l.typeCompte !== TypeCompteDetailTotal.TOTAL);

    for (const l of lignesDetailSeules) {
      switch (l.classe) {
        case ClasseCompte.CLASSE_2:
        case ClasseCompte.CLASSE_3:
          actif.push({ numero: l.numero, intitule: l.intitule, montant: l.solde });
          break;
        case ClasseCompte.CLASSE_1:
          passif.push({ numero: l.numero, intitule: l.intitule, montant: -l.solde });
          break;
        case ClasseCompte.CLASSE_4:
        case ClasseCompte.CLASSE_5:
          if (l.solde >= 0) {
            actif.push({ numero: l.numero, intitule: l.intitule, montant: l.solde });
          } else {
            passif.push({ numero: l.numero, intitule: l.intitule, montant: -l.solde });
          }
          break;
        case ClasseCompte.CLASSE_6:
        case ClasseCompte.CLASSE_7:
          // Produits (7) : solde créditeur (négatif) → contribue positivement au résultat.
          // Charges (6) : solde débiteur (positif) → contribue négativement au résultat.
          resultatNet -= l.solde;
          break;
        default:
          break;
      }
    }

    if (resultatNet !== 0) {
      passif.push({ numero: '131000', intitule: "Excédent (déficit) de l'exercice", montant: resultatNet });
    }

    const totalActif = actif.reduce((s, l) => s + l.montant, 0);
    const totalPassif = passif.reduce((s, l) => s + l.montant, 0);

    return {
      actif,
      passif,
      totalActif,
      totalPassif,
      // Tolérance d'arrondi ; un écart réel signale un bug du moteur d'écritures,
      // pas de la présente répartition (voir le commentaire de classe ci-dessus).
      equilibre: Math.abs(totalActif - totalPassif) < 0.01,
    };
  }
}
