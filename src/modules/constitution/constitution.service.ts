import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import {
  champsIdentificationDeLaForme,
  motifHorsParcours,
  parcoursConstitution,
  piecesDuParcours,
} from './catalogue-constitution';

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
    //
    // UN CHAMP N'EST CONFRONTÉ QUE SI LA FORME LE PORTE (constats D1-A5,
    // D1-B3). Une association lisait « Certificat d'enregistrement du
    // Ministère du Plan : non renseigné au dossier » sans qu'aucun écran lui
    // ouvre ce champ · un manque qu'on ne peut pas lever n'est pas un manque,
    // c'est un défaut d'affichage. Et l'AVIS favorable des art. 3 et 5 n'est
    // pas l'ENREGISTREMENT au ministère du secteur (art. 36 pour l'ONG,
    // art. 31 pour l'association étrangère) · le numéro d'enregistrement ne
    // se met en face de l'avis que pour les formes que la loi enregistre.
    const champs = champsIdentificationDeLaForme(t.formeJuridique, t.droitEtranger);
    const enregistrement = {
      champ: `Enregistrement au ministère du secteur (${t.droitEtranger ? 'art. 31' : 'art. 36'})`,
      valeur: t.numeroEnregistrementSecteur,
    };
    const detenu: Record<string, { champ: string; valeur: string | null }> = {
      ...(champs.enregistrementSecteur
        ? { 'avis-tutelle': enregistrement, 'avis-enregistrement-secteur': enregistrement }
        : {}),
      'personnalite-juridique': {
        champ: t.droitEtranger ? 'Décret d’autorisation' : 'Acte accordant la personnalité juridique',
        valeur: t.actePersonnaliteJuridique,
      },
      ...(champs.certificatPlan
        ? {
            'enregistrement-plan': {
              champ: 'Certificat d’enregistrement du Ministère du Plan',
              valeur: t.certificatEnregistrementPlan,
            },
          }
        : {}),
    };

    const etapes = parcoursConstitution(t.formeJuridique, t.droitEtranger).map((e) => {
      const d = detenu[e.cle];
      return {
        ...e,
        // `null` et non `false` quand le dossier ne porte AUCUN champ pour
        // cette étape · afficher « non renseigné » y ferait croire à un
        // manque. Le motif dit pourquoi la ligne est vide.
        produitDetenu: d ? { ...d, renseigne: Boolean(d.valeur) } : null,
        motifSansProduit: d
          ? null
          : e.cle === 'conditions-ong-etrangere'
            ? 'Tenu dans la fenêtre Accord-cadre'
            : 'Aucun champ du dossier ne porte cet acte',
      };
    });

    const pieces = piecesDuParcours(t.formeJuridique, t.droitEtranger);
    return {
      etapes,
      // Ce que la loi n° 004/2001 ne régit pas se dit, au lieu d'une liste.
      horsParcours: motifHorsParcours(t.formeJuridique),
      champsPortes: champs,
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
