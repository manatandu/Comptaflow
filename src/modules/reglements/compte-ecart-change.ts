import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../common/prisma.service';
import {
  comptesPrescrits,
  motifRefusCompteEcart,
  type NatureCreanceDette,
  type Referentiel,
} from './ecart-change-realise';

type Lecteur = Pick<PrismaService, 'compte' | 'tenant'>;

/** Le référentiel du dossier · les comptes d'écart en dépendent (un numéro, deux plans). */
export async function referentielDuDossier(prisma: Lecteur, tenantId: string): Promise<Referentiel> {
  const t = await prisma.tenant.findFirst({ where: { id: tenantId }, select: { referentiel: true } });
  if (!t) throw new NotFoundException('Dossier introuvable.');
  return t.referentiel as Referentiel;
}

/**
 * LE COMPTE QUE L'ÉCART DE CHANGE MOUVEMENTE · celui que le cabinet a choisi,
 * vérifié contre la racine que le texte donne, sinon celui que le texte
 * prescrit, lu dans le plan du dossier par son numéro semé. Refus nommé quand
 * le texte n'en donne aucun et que rien n'a été choisi, ou quand le compte
 * prescrit n'est pas ouvert · jamais un compte de repli.
 */
export async function compteDeLEcart(
  prisma: Lecteur,
  p: {
    tenantId: string;
    referentiel: Referentiel;
    nature: NatureCreanceDette | null;
    ecart: 'PERTE' | 'GAIN';
    choisiId?: string | null;
  },
): Promise<{ id: string; numero: string }> {
  if (p.choisiId) {
    const c = await prisma.compte.findFirst({
      where: { id: p.choisiId, tenantId: p.tenantId },
      select: { id: true, numero: true, typeCompte: true },
    });
    if (!c) throw new NotFoundException("Compte d'écart de change introuvable pour ce dossier.");
    if (c.typeCompte !== 'DETAIL') {
      throw new BadRequestException(`Le compte ${c.numero} est un compte de regroupement · choisissez un compte de détail.`);
    }
    const motif = motifRefusCompteEcart({ referentiel: p.referentiel, nature: p.nature, ecart: p.ecart, numero: c.numero });
    if (motif) throw new BadRequestException(motif);
    return { id: c.id, numero: c.numero };
  }
  const prescrits = comptesPrescrits(p.referentiel, p.nature);
  if (prescrits.perte === null) throw new BadRequestException(prescrits.motif);
  const numero = p.ecart === 'PERTE' ? prescrits.perte : prescrits.gain;
  const c = await prisma.compte.findFirst({ where: { tenantId: p.tenantId, numero }, select: { id: true, numero: true } });
  if (!c) {
    throw new BadRequestException(
      `Le compte ${numero} que le texte donne pour cet écart de change n'est pas ouvert dans le plan du dossier · ` +
        'ouvrez-le dans Plan comptable, ou choisissez un sous-compte.',
    );
  }
  return c;
}
