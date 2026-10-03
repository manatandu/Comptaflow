import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../common/prisma.service';
import {
  comptesPrescrits,
  racineDuPrescrit,
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

/** Un compte qui peut recevoir l'écart · de détail, actif (« mise en sommeil » réversible). */
function motifInutilisable(c: { numero: string; typeCompte: string; estActif: boolean }): string | null {
  if (c.typeCompte !== 'DETAIL') return `Le compte ${c.numero} est un compte de regroupement · choisissez un compte de détail.`;
  if (!c.estActif) return `Le compte ${c.numero} est en sommeil · réactivez-le dans Plan comptable, ou choisissez un autre compte.`;
  return null;
}

/**
 * LE COMPTE QUE L'ÉCART DE CHANGE MOUVEMENTE · celui que le cabinet a choisi,
 * vérifié contre les racines admises (`racinesAdmises`), sinon celui que le
 * texte prescrit, lu dans le plan du dossier par son numéro semé. L'un comme
 * l'autre de DÉTAIL et ACTIF. Refus nommé quand le texte n'en donne aucun et
 * que rien n'a été choisi, ou quand le compte prescrit n'est pas utilisable ·
 * le refus nomme alors ses sous-comptes de détail actifs, que l'écran propose
 * (un 656 subdivisé par le cabinet), jamais un compte de repli.
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
      select: { id: true, numero: true, typeCompte: true, estActif: true },
    });
    if (!c) throw new NotFoundException("Compte d'écart de change introuvable pour ce dossier.");
    const inutilisable = motifInutilisable(c);
    if (inutilisable) throw new BadRequestException(inutilisable);
    const motif = motifRefusCompteEcart({ referentiel: p.referentiel, nature: p.nature, ecart: p.ecart, numero: c.numero });
    if (motif) throw new BadRequestException(motif);
    return { id: c.id, numero: c.numero };
  }
  const prescrits = comptesPrescrits(p.referentiel, p.nature);
  if (prescrits.perte === null) throw new BadRequestException(prescrits.motif);
  const numero = p.ecart === 'PERTE' ? prescrits.perte : prescrits.gain;
  const c = await prisma.compte.findFirst({
    where: { tenantId: p.tenantId, numero },
    select: { id: true, numero: true, typeCompte: true, estActif: true },
  });
  const inutilisable = c ? motifInutilisable(c) : `Le compte ${numero} que le texte donne pour cet écart de change n'est pas ouvert dans le plan du dossier.`;
  if (c && !inutilisable) return { id: c.id, numero: c.numero };
  const racine = racineDuPrescrit(numero);
  const sousComptes = await prisma.compte.findMany({
    where: { tenantId: p.tenantId, numero: { startsWith: racine }, typeCompte: 'DETAIL', estActif: true },
    select: { numero: true },
    orderBy: { numero: 'asc' },
    take: 20,
  });
  throw new BadRequestException(
    `${inutilisable} ` +
      (sousComptes.length > 0
        ? `Choisissez le compte d'écart parmi ses sous-comptes · ${sousComptes.map((x) => x.numero).join(', ')}.`
        : `Ouvrez-le, ou un sous-compte du ${racine}, dans Plan comptable.`),
  );
}
