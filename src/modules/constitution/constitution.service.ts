import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { parcoursConstitution, piecesDuParcours } from './catalogue-constitution';

/**
 * CHECKLIST DE CONSTITUTION · et ce qu'elle NE crée PAS.
 *
 * AUCUNE TABLE NOUVELLE, ET C'EST LA DÉCISION DE CE CHANTIER. Une checklist
 * cochable aurait paru plus riche et aurait dupliqué ce que le dossier porte
 * déjà : `actePersonnaliteJuridique`, `numeroEnregistrementSecteur` et
 * `certificatEnregistrementPlan` existent depuis le chantier des identifiants
 * légaux, et ce sont exactement les PRODUITS des trois étapes. Deux endroits
 * pour le même fait auraient divergé au premier correctif, et l'écart n'aurait
 * sauté aux yeux de personne · les deux listes sont plausibles séparément.
 *
 * Ce que le service rend est donc une CONFRONTATION : le parcours tel que les
 * textes l'écrivent, et en face, ce que le dossier détient déjà.
 *
 * ET LA CONSTITUTION EST UN FAIT PASSÉ. Un dossier ouvert dans OmegaX a
 * presque toujours été constitué avant · la checklist sert au cabinet qui
 * accompagne une constitution, et à celui qui reprend un dossier dont il faut
 * vérifier les pièces. Elle ne réclame rien et ne bloque rien.
 */
@Injectable()
export class ConstitutionService {
  constructor(private readonly prisma: PrismaService) {}

  async parcours(tenantId: string) {
    const t = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        formeJuridique: true,
        droitEtranger: true,
        actePersonnaliteJuridique: true,
        dateActePersonnalite: true,
        numeroEnregistrementSecteur: true,
        certificatEnregistrementPlan: true,
      },
    });

    // Ce que le dossier détient, étape par étape. La clé est celle de
    // l'étape · l'appariement par RANG se serait décalé le jour où le parcours
    // d'une ONG étrangère insère une étape, et un produit se serait retrouvé
    // en face de la mauvaise démarche.
    const detenu: Record<string, { champ: string; valeur: string | null }> = {
      // L'avis favorable du ministère de tutelle se matérialise, côté dossier,
      // par le numéro d'enregistrement auprès de ce ministère · c'est le seul
      // champ que le dossier porte pour cette étape.
      'avis-tutelle': { champ: 'Enregistrement au ministère du secteur', valeur: t.numeroEnregistrementSecteur },
      'personnalite-juridique': {
        champ: 'Acte accordant la personnalité juridique',
        valeur: t.actePersonnaliteJuridique,
      },
      'enregistrement-plan': {
        champ: 'Certificat d’enregistrement du Ministère du Plan',
        valeur: t.certificatEnregistrementPlan,
      },
    };

    const etapes = parcoursConstitution(t.formeJuridique, t.droitEtranger).map((e) => {
      const d = detenu[e.cle];
      return {
        ...e,
        // `null` et non `false` quand le dossier ne porte AUCUN champ pour
        // cette étape · l'ONG étrangère n'en a pas, et afficher « non
        // renseigné » y ferait croire à un manque alors que la fenêtre
        // Accord-cadre tient la réponse.
        produitDetenu: d ? { ...d, renseigne: Boolean(d.valeur) } : null,
      };
    });

    const pieces = piecesDuParcours(t.formeJuridique, t.droitEtranger);
    return {
      etapes,
      formeJuridique: t.formeJuridique,
      droitEtranger: t.droitEtranger,
      dateActePersonnalite: t.dateActePersonnalite,
      // Le décompte par fondement · c'est lui qui rend visible qu'une pièce de
      // la liste officielle ne repose sur aucun texte en vigueur.
      parFondement: {
        LOI: pieces.filter((p) => p.fondement === 'LOI').length,
        PRATIQUE_ADMINISTRATIVE: pieces.filter((p) => p.fondement === 'PRATIQUE_ADMINISTRATIVE').length,
        USAGE_SANS_BASE_LEGALE: pieces.filter((p) => p.fondement === 'USAGE_SANS_BASE_LEGALE').length,
      },
    };
  }
}
