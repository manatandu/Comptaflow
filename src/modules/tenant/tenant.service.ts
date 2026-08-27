import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Referentiel, TypeLicence } from '@prisma/client';

/**
 * Crée un tenant et sa licence en une transaction. Le référentiel comptable
 * (SYCEBNL / SYSCOHADA) et le type de licence sont fixés à la création :
 * changer de référentiel en cours de vie du tenant n'est pas supporté
 * (le plan de comptes et les états financiers en dépendent structurellement).
 */
@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  async creerTenant(params: {
    nom: string;
    referentiel: Referentiel;
    typeLicence: TypeLicence;
    dateExpiration?: Date;
    activite?: string;
    adresse?: string;
    ville?: string;
    pays?: string;
    telephone?: string;
    devise?: string;
  }) {
    return this.prisma.tenant.create({
      data: {
        nom: params.nom,
        referentiel: params.referentiel,
        activite: params.activite,
        adresse: params.adresse,
        ville: params.ville,
        pays: params.pays,
        telephone: params.telephone,
        devise: params.devise,
        licence: {
          create: {
            type: params.typeLicence,
            dateExpiration: params.dateExpiration,
          },
        },
      },
      include: { licence: true },
    });
  }
}
