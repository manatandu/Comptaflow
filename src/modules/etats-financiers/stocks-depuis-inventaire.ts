import { ClasseCompte } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';

/**
 * NOTE 2 DU SYSTÈME MINIMAL DE TRÉSORERIE · les quantités lues sur
 * l'inventaire physique du dossier (audit final F85).
 *
 * La maquette des deux textes porte Référence, Désignation, Quantité, Prix
 * unitaire et Montant. La note servait les deux colonnes du milieu à vide,
 * en écrivant que « OmegaX ne tient pas d'inventaire physique » · lacune
 * déclarée à tort : `CampagneInventaire` et `FicheInventaire` portent la
 * quantité comptée et la valeur d'inventaire de chaque bien, et le module est
 * ouvert au SMT. Le cabinet ressaisissait à la main ce que le dossier tenait.
 *
 * LA RÈGLE QUI TIENT TOUT · LE TOTAL DE LA NOTE RESTE CELUI DU BILAN. La
 * valeur du stock final est celle que la note rapproche de la variation du
 * compte de résultat ; elle se lit dans la balance, jamais dans un comptage.
 * Les fiches d'un compte ne remplacent donc sa ligne que si elles la
 * reconstituent au centime · comptées ET valorisées toutes, et leur somme
 * égale au montant du compte. Sinon la ligne du compte reste, sans quantité,
 * et la raison est dite · un écart d'inventaire non régularisé ferait sinon
 * publier une note dont les lignes ne font pas le total.
 *
 * Une dépréciation (39) n'a pas de quantité par nature · « 39X déprécie 3X,
 * dans les deux plans ». Sa ligne reste sans quantité, sans être un manque.
 */

export interface CompteStockNote {
  numero: string;
  intitule: string;
  montant: number;
}

export interface FicheStockNote {
  compteNumero: string;
  designation: string;
  uniteMesure: string | null;
  quantiteComptee: number | null;
  valeurInventaire: number | null;
}

export interface CampagneStockNote {
  libelle: string;
  dateInventaire: Date;
  fiches: FicheStockNote[];
}

export interface LigneNoteStock {
  reference: string;
  designation: string;
  quantite: number | null;
  prixUnitaire: number | null;
  montant: number;
}

export interface NoteStocksDepuisInventaire {
  lignes: LigneNoteStock[];
  /** Vrai quand aucun compte à quantités ne manque · la note est complète. */
  quantitesTenues: boolean;
  /** Les comptes non servis, chacun avec sa raison. */
  manques: string[];
  /** La campagne lue, nommée et datée · null sans campagne. */
  source: string | null;
}

const CENTIME = 0.005;

function estDepreciation(numero: string): boolean {
  return numero.startsWith('39');
}

function montantLu(n: number): string {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

export function lignesNoteStocks(
  comptes: CompteStockNote[],
  campagne: CampagneStockNote | null,
): NoteStocksDepuisInventaire {
  const lignes: LigneNoteStock[] = [];
  const manques: string[] = [];
  const ligneDuCompte = (c: CompteStockNote): LigneNoteStock => ({
    reference: c.numero,
    designation: c.intitule,
    quantite: null,
    prixUnitaire: null,
    montant: c.montant,
  });

  for (const c of comptes) {
    const fiches = campagne ? campagne.fiches.filter((f) => f.compteNumero === c.numero) : [];
    if (estDepreciation(c.numero) || (fiches.length === 0 && Math.abs(c.montant) <= CENTIME)) {
      lignes.push(ligneDuCompte(c));
      continue;
    }
    if (fiches.length === 0) {
      lignes.push(ligneDuCompte(c));
      if (campagne) manques.push(`${c.numero}, aucune fiche dans la campagne`);
      continue;
    }
    const incompletes = fiches.filter((f) => f.quantiteComptee === null || f.valeurInventaire === null);
    if (incompletes.length > 0) {
      lignes.push(ligneDuCompte(c));
      manques.push(`${c.numero}, ${incompletes.length} fiche(s) non comptée(s) ou non valorisée(s)`);
      continue;
    }
    const totalFiches = fiches.reduce((s, f) => s + (f.valeurInventaire as number), 0);
    if (Math.abs(totalFiches - c.montant) > CENTIME) {
      lignes.push(ligneDuCompte(c));
      manques.push(
        `${c.numero}, fiches à ${montantLu(totalFiches)} contre ${montantLu(c.montant)} au bilan (écart non régularisé)`,
      );
      continue;
    }
    for (const f of fiches) {
      const quantite = f.quantiteComptee as number;
      const valeur = f.valeurInventaire as number;
      lignes.push({
        reference: c.numero,
        designation: f.uniteMesure ? `${f.designation} (${f.uniteMesure})` : f.designation,
        quantite,
        // Une quantité nulle n'a pas de prix unitaire · diviser par zéro
        // imprimerait l'infini sur un état déposé.
        prixUnitaire: quantite !== 0 ? valeur / quantite : null,
        montant: valeur,
      });
    }
  }

  const source = campagne
    ? `Quantités et prix unitaires lus sur la campagne d'inventaire « ${campagne.libelle} » du ${campagne.dateInventaire.toLocaleDateString('fr-FR', { timeZone: 'UTC' })}.`
    : null;
  return { lignes, quantitesTenues: campagne !== null && manques.length === 0, manques, source };
}

/**
 * Le motif affiché quand la note n'est pas complète · sans campagne, le
 * chemin pour la compléter ; avec, les comptes non servis et pourquoi.
 * `suffixeSansCampagne` porte la référence propre au texte du dossier.
 */
export function motifQuantitesNote2(note: NoteStocksDepuisInventaire, suffixeSansCampagne: string): string {
  if (note.source === null) {
    return (
      "Aucune campagne d'inventaire n'est enregistrée pour cet exercice : les colonnes Quantité et Prix unitaire " +
      `se servent depuis la fenêtre Inventaire physique, ou se complètent à la main sur l'état imprimé${suffixeSansCampagne}.`
    );
  }
  if (note.manques.length === 0) return '';
  return `Quantité et Prix unitaire non servis pour · ${note.manques.join(' ; ')}.`;
}

/**
 * La DERNIÈRE campagne de l'exercice qui a compté un stock · une campagne
 * postérieure qui n'a compté que les caisses ne doit pas masquer celle qui a
 * compté le magasin.
 */
export async function chargerCampagneStocks(
  prisma: PrismaService,
  tenantId: string,
  exerciceId: string,
): Promise<CampagneStockNote | null> {
  const campagne = await prisma.campagneInventaire.findFirst({
    where: { tenantId, exerciceId, fiches: { some: { compte: { classe: ClasseCompte.CLASSE_3 } } } },
    orderBy: { dateInventaire: 'desc' },
    select: {
      libelle: true,
      dateInventaire: true,
      fiches: {
        select: {
          designation: true,
          uniteMesure: true,
          quantiteComptee: true,
          valeurInventaire: true,
          compte: { select: { numero: true } },
        },
        orderBy: { designation: 'asc' },
      },
    },
  });
  if (!campagne) return null;
  return {
    libelle: campagne.libelle,
    dateInventaire: campagne.dateInventaire,
    fiches: campagne.fiches.map((f) => ({
      compteNumero: f.compte.numero,
      designation: f.designation,
      uniteMesure: f.uniteMesure,
      quantiteComptee: f.quantiteComptee === null ? null : Number(f.quantiteComptee),
      valeurInventaire: f.valeurInventaire === null ? null : Number(f.valeurInventaire),
    })),
  };
}
