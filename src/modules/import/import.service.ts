import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ClasseCompte, ModeReportANouveau, Prisma, StatutExercice, TypeCompteDetailTotal } from '@prisma/client';
import { AnalyserImportDto, ExecuterImportDto, TypeImport } from './dto/import.dto';
import { lireDate, lireFichier, lireMontant, type Tableau } from './lecture-fichier';

/** Un champ attendu par un type d'import, et les en-têtes qui le trahissent. */
interface ChampAttendu {
  cle: string;
  libelle: string;
  obligatoire: boolean;
  /** Fragments d'en-tête, en minuscules sans accents, qui désignent ce champ. */
  indices: string[];
}

const CHAMPS: Record<TypeImport, ChampAttendu[]> = {
  [TypeImport.PLAN_COMPTES]: [
    { cle: 'numero', libelle: 'Numéro de compte', obligatoire: true, indices: ['numero', 'compte', 'code'] },
    { cle: 'intitule', libelle: 'Intitulé', obligatoire: true, indices: ['intitule', 'libelle', 'designation', 'nom'] },
    { cle: 'type', libelle: 'Type (Détail / Total)', obligatoire: false, indices: ['type'] },
  ],
  [TypeImport.BALANCE]: [
    { cle: 'numero', libelle: 'Numéro de compte', obligatoire: true, indices: ['numero', 'compte', 'code'] },
    { cle: 'intitule', libelle: 'Intitulé', obligatoire: false, indices: ['intitule', 'libelle', 'designation'] },
    { cle: 'debit', libelle: 'Solde débiteur', obligatoire: true, indices: ['debit', 'debiteur'] },
    { cle: 'credit', libelle: 'Solde créditeur', obligatoire: true, indices: ['credit', 'crediteur'] },
  ],
  [TypeImport.ECRITURES]: [
    { cle: 'date', libelle: 'Date', obligatoire: true, indices: ['date'] },
    { cle: 'journal', libelle: 'Code journal', obligatoire: false, indices: ['journal', 'jal'] },
    { cle: 'piece', libelle: 'N° de pièce', obligatoire: false, indices: ['piece', 'pièce'] },
    { cle: 'reference', libelle: 'Référence', obligatoire: false, indices: ['reference', 'facture'] },
    { cle: 'numero', libelle: 'Numéro de compte', obligatoire: true, indices: ['numero', 'compte', 'code'] },
    { cle: 'libelle', libelle: 'Libellé', obligatoire: true, indices: ['libelle', 'intitule', 'designation'] },
    { cle: 'debit', libelle: 'Débit', obligatoire: true, indices: ['debit'] },
    { cle: 'credit', libelle: 'Crédit', obligatoire: true, indices: ['credit'] },
  ],
};

/** Minuscule, sans accent, sans ponctuation · pour comparer des en-têtes. */
function normaliser(texte: string): string {
  return texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export interface AnomalieImport {
  ligne: number;
  message: string;
}

export interface RapportImport {
  type: TypeImport;
  simulation: boolean;
  lignesLues: number;
  comptesCrees: number;
  comptesReconnus: number;
  ecrituresCreees: number;
  lignesEcritureCreees: number;
  totalDebit: number;
  totalCredit: number;
  anomalies: AnomalieImport[];
}

/**
 * IMPORT DE PLAN DE COMPTES, DE BALANCE ET D'ÉCRITURES.
 *
 * Aucun des manuels Sage du Drive ne décrit l'import paramétrable : ce
 * chantier est conçu sans appui documentaire, à partir de ce qu'une
 * association congolaise a réellement en main au moment d'arriver sur
 * OmegaX · un tableur, le plus souvent, ou l'export d'un logiciel précédent.
 *
 * Trois partis pris :
 *
 *  1. RIEN N'EST DEVINÉ SILENCIEUSEMENT. L'analyse propose une correspondance
 *     entre les colonnes du fichier et les champs attendus, mais c'est
 *     l'utilisateur qui la valide. Un import qui se trompe de colonne de
 *     montants est pire que pas d'import du tout.
 *
 *  2. TOUT PASSE PAR LE BROUILLARD. Les écritures importées ne sont pas
 *     validées : elles atterrissent dans le brouillard, où elles se relisent
 *     et se corrigent avant d'entrer au livre-journal. Un import est
 *     exactement le cas où l'on veut relire avant de s'engager.
 *
 *  3. UNE BALANCE S'IMPORTE COMME UNE ÉCRITURE D'À-NOUVEAU, pas comme des
 *     soldes posés d'autorité sur les comptes. Le SYCEBNL ne connaît pas de
 *     solde sans écriture : la reprise doit laisser une trace au journal,
 *     datée, équilibrée, et corrigeable comme n'importe quelle autre.
 */
/**
 * Mode de report à-nouveau d'un compte créé par un IMPORT, déduit de sa classe.
 *
 * La règle est la même que celle des deux semis (`compte-seed.ts` et
 * `compte-seed-syscohada.ts`), et c'est bien pour ça qu'elle vit désormais
 * dans UNE fonction : elle était écrite deux fois ici, à l'identique, et les
 * deux copies avaient le même trou.
 *
 * Ne se reportent PAS · les classes 6, 7 ET 8. La classe 8 manquait. Le
 * PCGO (AUDCIF Titre VII ch. 3, section 8) répète pour chacun de ses comptes
 * qu'il est « crédité pour solde à la clôture de l'exercice, par le débit du
 * compte 13 » ou « débité pour solde […] par le crédit du compte 13 » · un
 * compte H.A.O. se solde donc sur le résultat exactement comme une charge ou
 * un produit ordinaire, et les deux semis le posent bien en AUCUN.
 *
 * L'oubli était muet et durable : un 81 « valeurs comptables des cessions » ou
 * un 82 « produits des cessions » reçu d'une balance externe était créé en
 * report SOLDE, donc reporté au 1er janvier suivant. L'à-nouveau de l'exercice
 * d'après portait alors une charge et un produit de l'exercice clos, et le
 * bilan d'ouverture ne correspondait plus au bilan de clôture · ce que la
 * convention de correspondance bilan clôture / bilan ouverture interdit.
 */
export function modeReportPourClasse(classe: ClasseCompte): ModeReportANouveau {
  const soldeesSurLeResultat: ClasseCompte[] = [ClasseCompte.CLASSE_6, ClasseCompte.CLASSE_7, ClasseCompte.CLASSE_8];
  return soldeesSurLeResultat.includes(classe) ? ModeReportANouveau.AUCUN : ModeReportANouveau.SOLDE;
}

@Injectable()
export class ImportService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lit le fichier, propose une correspondance de colonnes, montre un aperçu. */
  async analyser(dto: AnalyserImportDto) {
    const tableau = await lireFichier(dto.nomFichier, dto.contenuBase64);
    const champs = CHAMPS[dto.type];
    const normalisees = tableau.colonnes.map(normaliser);

    const mappingPropose: Record<string, string | null> = {};
    const dejaPrises = new Set<number>();
    for (const champ of champs) {
      // On cherche d'abord une colonne dont l'en-tête CONTIENT un indice, en
      // privilégiant l'indice le plus long : « solde crediteur » doit tomber
      // sur `credit` et non sur `debit`, et « numero de compte » sur `numero`.
      let choix: number | null = null;
      for (const indice of [...champ.indices].sort((a, b) => b.length - a.length)) {
        const i = normalisees.findIndex((c, idx) => !dejaPrises.has(idx) && c.includes(normaliser(indice)));
        if (i >= 0) {
          choix = i;
          break;
        }
      }
      if (choix !== null) dejaPrises.add(choix);
      mappingPropose[champ.cle] = choix !== null ? tableau.colonnes[choix] : null;
    }

    return {
      colonnes: tableau.colonnes,
      separateur: tableau.separateur ?? null,
      nombreLignes: tableau.lignes.length,
      apercu: tableau.lignes.slice(0, 8),
      champs: champs.map((c) => ({ cle: c.cle, libelle: c.libelle, obligatoire: c.obligatoire })),
      mappingPropose,
      manquants: champs
        .filter((c) => c.obligatoire && !mappingPropose[c.cle])
        .map((c) => c.libelle),
    };
  }

  /** Index d'une colonne mappée, ou -1. */
  private indexDe(tableau: Tableau, mapping: Record<string, string>, cle: string): number {
    const nom = mapping[cle];
    if (!nom) return -1;
    return tableau.colonnes.indexOf(nom);
  }

  private valeur(ligne: string[], index: number): string {
    return index >= 0 ? (ligne[index] ?? '').trim() : '';
  }

  private classeDe(numero: string): ClasseCompte | null {
    const chiffre = numero.trim()[0];
    if (!/[1-9]/.test(chiffre)) return null;
    return `CLASSE_${chiffre}` as ClasseCompte;
  }

  async executer(tenantId: string, createdBy: string, dto: ExecuterImportDto): Promise<RapportImport> {
    const tableau = await lireFichier(dto.nomFichier, dto.contenuBase64, dto.separateur);
    const champs = CHAMPS[dto.type];
    for (const champ of champs) {
      if (champ.obligatoire && !dto.mapping[champ.cle]) {
        throw new BadRequestException(`La colonne « ${champ.libelle} » n'est pas renseignée dans la correspondance.`);
      }
    }
    for (const [cle, colonne] of Object.entries(dto.mapping)) {
      if (colonne && !tableau.colonnes.includes(colonne)) {
        throw new BadRequestException(`La colonne « ${colonne} » (${cle}) est absente du fichier.`);
      }
    }

    switch (dto.type) {
      case TypeImport.PLAN_COMPTES:
        return this.importerPlanComptes(tenantId, tableau, dto);
      case TypeImport.BALANCE:
        return this.importerBalance(tenantId, createdBy, tableau, dto);
      case TypeImport.ECRITURES:
        return this.importerEcritures(tenantId, createdBy, tableau, dto);
    }
  }

  // -------------------------------------------------------------------------

  private async importerPlanComptes(
    tenantId: string,
    tableau: Tableau,
    dto: ExecuterImportDto,
  ): Promise<RapportImport> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new BadRequestException('Dossier introuvable');

    const iNumero = this.indexDe(tableau, dto.mapping, 'numero');
    const iIntitule = this.indexDe(tableau, dto.mapping, 'intitule');
    const iType = this.indexDe(tableau, dto.mapping, 'type');

    const existants = new Set(
      (await this.prisma.compte.findMany({ where: { tenantId }, select: { numero: true } })).map((c) => c.numero),
    );

    const anomalies: AnomalieImport[] = [];
    const aCreer: Prisma.CompteCreateManyInput[] = [];
    let reconnus = 0;

    tableau.lignes.forEach((ligne, i) => {
      const numeroLigne = i + 2; // en-tête en ligne 1
      const numero = this.valeur(ligne, iNumero).replace(/\s/g, '');
      const intitule = this.valeur(ligne, iIntitule);
      if (!numero && !intitule) return;
      if (!/^\d{1,13}$/.test(numero)) {
        anomalies.push({ ligne: numeroLigne, message: `Numéro de compte invalide : « ${numero} »` });
        return;
      }
      if (numero.length > tenant.longueurCompte) {
        anomalies.push({
          ligne: numeroLigne,
          message: `Le compte ${numero} dépasse la longueur du dossier (${tenant.longueurCompte} chiffres).`,
        });
        return;
      }
      if (!intitule) {
        anomalies.push({ ligne: numeroLigne, message: `Le compte ${numero} n'a pas d'intitulé.` });
        return;
      }
      const classe = this.classeDe(numero);
      if (!classe) {
        anomalies.push({
          ligne: numeroLigne,
          message: `Le compte ${numero} ne commence pas par un chiffre de classe SYCEBNL (1 à 9).`,
        });
        return;
      }
      if (existants.has(numero) || aCreer.some((c) => c.numero === numero)) {
        reconnus++;
        return;
      }
      const typeBrut = normaliser(this.valeur(ligne, iType));
      const typeCompte = typeBrut.startsWith('tot') ? TypeCompteDetailTotal.TOTAL : TypeCompteDetailTotal.DETAIL;
      aCreer.push({
        tenantId,
        numero,
        intitule,
        classe,
        typeCompte,
        modeReportANouveau: modeReportPourClasse(classe),
      });
    });

    if (!dto.simulation && aCreer.length > 0) {
      await this.prisma.compte.createMany({ data: aCreer, skipDuplicates: true });
    }

    return {
      type: dto.type,
      simulation: !!dto.simulation,
      lignesLues: tableau.lignes.length,
      comptesCrees: aCreer.length,
      comptesReconnus: reconnus,
      ecrituresCreees: 0,
      lignesEcritureCreees: 0,
      totalDebit: 0,
      totalCredit: 0,
      anomalies,
    };
  }

  // -------------------------------------------------------------------------

  /**
   * Reprise d'une balance : une SEULE écriture d'à-nouveau, équilibrée, datée
   * de l'ouverture de l'exercice. Un déséquilibre arrête l'import et dit de
   * combien · reprendre une balance fausse contaminerait tous les états.
   */
  private async importerBalance(
    tenantId: string,
    createdBy: string,
    tableau: Tableau,
    dto: ExecuterImportDto,
  ): Promise<RapportImport> {
    const { exercice, journal, comptes, tenant } = await this.contexte(tenantId, dto);

    const iNumero = this.indexDe(tableau, dto.mapping, 'numero');
    const iIntitule = this.indexDe(tableau, dto.mapping, 'intitule');
    const iDebit = this.indexDe(tableau, dto.mapping, 'debit');
    const iCredit = this.indexDe(tableau, dto.mapping, 'credit');

    const anomalies: AnomalieImport[] = [];
    const comptesParNumero = new Map(comptes.map((c) => [c.numero, c]));
    const comptesACreer: Prisma.CompteCreateManyInput[] = [];
    const lignes: { numero: string; debit: number; credit: number }[] = [];

    tableau.lignes.forEach((ligne, i) => {
      const numeroLigne = i + 2;
      const numero = this.valeur(ligne, iNumero).replace(/\s/g, '');
      if (!numero) return;
      const debit = lireMontant(this.valeur(ligne, iDebit));
      const credit = lireMontant(this.valeur(ligne, iCredit));
      if (debit === null || credit === null) {
        anomalies.push({ ligne: numeroLigne, message: `Montant illisible sur le compte ${numero}.` });
        return;
      }
      if (Math.abs(debit) < 0.005 && Math.abs(credit) < 0.005) return;

      const compte = comptesParNumero.get(numero);
      if (!compte) {
        if (!dto.creerComptesManquants) {
          anomalies.push({
            ligne: numeroLigne,
            message: `Le compte ${numero} n'existe pas dans le plan du dossier.`,
          });
          return;
        }
        const classe = this.classeDe(numero);
        if (!classe || numero.length > tenant.longueurCompte) {
          anomalies.push({ ligne: numeroLigne, message: `Le compte ${numero} ne peut pas être créé.` });
          return;
        }
        comptesACreer.push({
          tenantId,
          numero,
          intitule: this.valeur(ligne, iIntitule) || `Compte ${numero}`,
          classe,
          modeReportANouveau: modeReportPourClasse(classe),
        });
      } else if (compte.typeCompte === TypeCompteDetailTotal.TOTAL) {
        // Une balance exportée porte souvent ses lignes de totalisation : les
        // reprendre doublerait tous les montants.
        anomalies.push({
          ligne: numeroLigne,
          message: `Le compte ${numero} est un compte Total : sa ligne de totalisation est ignorée.`,
        });
        return;
      }
      lignes.push({ numero, debit, credit });
    });

    const totalDebit = lignes.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lignes.reduce((s, l) => s + l.credit, 0);
    if (lignes.length > 0 && Math.abs(totalDebit - totalCredit) > 0.005) {
      anomalies.push({
        ligne: 0,
        message:
          `La balance est déséquilibrée de ${(totalDebit - totalCredit).toFixed(2)} ` +
          `(débit ${totalDebit.toFixed(2)}, crédit ${totalCredit.toFixed(2)}). ` +
          "Aucune écriture d'à-nouveau n'a été créée : une reprise fausse contaminerait tous les états.",
      });
    }

    const peutEcrire =
      !dto.simulation && lignes.length > 0 && Math.abs(totalDebit - totalCredit) <= 0.005;
    let ecrituresCreees = 0;

    if (peutEcrire) {
      const date = dto.dateOperation ? new Date(dto.dateOperation) : exercice.dateDebut;
      await this.prisma.$transaction(async (tx) => {
        if (comptesACreer.length > 0) {
          await tx.compte.createMany({ data: comptesACreer, skipDuplicates: true });
        }
        const tous = await tx.compte.findMany({ where: { tenantId }, select: { id: true, numero: true } });
        const parNumero = new Map(tous.map((c) => [c.numero, c.id]));
        await tx.ecriture.create({
          data: {
            tenantId,
            exerciceId: exercice.id,
            journalId: journal.id,
            date,
            libelle: `Reprise de balance · ${dto.nomFichier}`,
            reference: 'IMPORT',
            createdBy,
            lignes: {
              create: lignes.map((l) => ({
                compteId: parNumero.get(l.numero)!,
                debit: l.debit,
                credit: l.credit,
              })),
            },
          },
        });
        ecrituresCreees = 1;
      });
    }

    return {
      type: dto.type,
      simulation: !!dto.simulation,
      lignesLues: tableau.lignes.length,
      comptesCrees: peutEcrire ? comptesACreer.length : 0,
      comptesReconnus: lignes.length - comptesACreer.length,
      ecrituresCreees,
      lignesEcritureCreees: peutEcrire ? lignes.length : 0,
      totalDebit,
      totalCredit,
      anomalies,
    };
  }

  // -------------------------------------------------------------------------

  /**
   * Import d'écritures. Les lignes sont regroupées en pièces par la clé
   * (date, journal, n° de pièce) : c'est ainsi qu'un export de journal se
   * présente, une ligne par imputation. Chaque pièce doit être équilibrée pour
   * être créée ; celles qui ne le sont pas sont refusées nommément plutôt que
   * de contaminer les autres.
   */
  private async importerEcritures(
    tenantId: string,
    createdBy: string,
    tableau: Tableau,
    dto: ExecuterImportDto,
  ): Promise<RapportImport> {
    const { exercice, journal, comptes, journaux } = await this.contexte(tenantId, dto);

    const iDate = this.indexDe(tableau, dto.mapping, 'date');
    const iJournal = this.indexDe(tableau, dto.mapping, 'journal');
    const iPiece = this.indexDe(tableau, dto.mapping, 'piece');
    const iReference = this.indexDe(tableau, dto.mapping, 'reference');
    const iNumero = this.indexDe(tableau, dto.mapping, 'numero');
    const iLibelle = this.indexDe(tableau, dto.mapping, 'libelle');
    const iDebit = this.indexDe(tableau, dto.mapping, 'debit');
    const iCredit = this.indexDe(tableau, dto.mapping, 'credit');

    const comptesParNumero = new Map(comptes.map((c) => [c.numero, c]));
    const journauxParCode = new Map(journaux.map((j) => [j.code.toUpperCase(), j]));
    const anomalies: AnomalieImport[] = [];

    interface Piece {
      cle: string;
      date: Date;
      journalId: string;
      reference: string | null;
      libelle: string;
      lignes: { compteId: string; libelle: string; debit: number; credit: number }[];
      premiereLigne: number;
    }
    const pieces = new Map<string, Piece>();

    tableau.lignes.forEach((ligne, i) => {
      const numeroLigne = i + 2;
      const numero = this.valeur(ligne, iNumero).replace(/\s/g, '');
      if (!numero) return;

      const date = lireDate(this.valeur(ligne, iDate));
      if (!date) {
        anomalies.push({ ligne: numeroLigne, message: `Date illisible : « ${this.valeur(ligne, iDate)} »` });
        return;
      }
      if (date < exercice.dateDebut || date > exercice.dateFin) {
        anomalies.push({
          ligne: numeroLigne,
          message: `La date ${date.toISOString().slice(0, 10)} sort de l'exercice sélectionné.`,
        });
        return;
      }
      const codeJournal = this.valeur(ligne, iJournal).toUpperCase();
      const jal = codeJournal ? journauxParCode.get(codeJournal) : journal;
      if (!jal) {
        anomalies.push({ ligne: numeroLigne, message: `Journal « ${codeJournal} » inconnu du dossier.` });
        return;
      }
      const compte = comptesParNumero.get(numero);
      if (!compte) {
        anomalies.push({ ligne: numeroLigne, message: `Le compte ${numero} n'existe pas dans le plan du dossier.` });
        return;
      }
      if (compte.typeCompte === TypeCompteDetailTotal.TOTAL) {
        anomalies.push({ ligne: numeroLigne, message: `Le compte ${numero} est un compte Total : non mouvementable.` });
        return;
      }
      const debit = lireMontant(this.valeur(ligne, iDebit));
      const credit = lireMontant(this.valeur(ligne, iCredit));
      if (debit === null || credit === null) {
        anomalies.push({ ligne: numeroLigne, message: `Montant illisible sur le compte ${numero}.` });
        return;
      }
      if (Math.abs(debit) < 0.005 && Math.abs(credit) < 0.005) return;

      const piece = this.valeur(ligne, iPiece);
      const libelle = this.valeur(ligne, iLibelle);
      const cle = `${date.toISOString().slice(0, 10)}|${jal.id}|${piece}`;
      const existante = pieces.get(cle);
      if (existante) {
        existante.lignes.push({ compteId: compte.id, libelle, debit, credit });
      } else {
        pieces.set(cle, {
          cle,
          date,
          journalId: jal.id,
          reference: this.valeur(ligne, iReference) || null,
          libelle: libelle || `Import ${dto.nomFichier}`,
          lignes: [{ compteId: compte.id, libelle, debit, credit }],
          premiereLigne: numeroLigne,
        });
      }
    });

    const valides: Piece[] = [];
    for (const piece of pieces.values()) {
      const d = piece.lignes.reduce((s, l) => s + l.debit, 0);
      const c = piece.lignes.reduce((s, l) => s + l.credit, 0);
      if (piece.lignes.length < 2 || Math.abs(d - c) > 0.005) {
        anomalies.push({
          ligne: piece.premiereLigne,
          message:
            `Pièce déséquilibrée ou incomplète (débit ${d.toFixed(2)}, crédit ${c.toFixed(2)}, ` +
            `${piece.lignes.length} ligne(s)) : elle n'a pas été créée.`,
        });
        continue;
      }
      valides.push(piece);
    }

    let ecrituresCreees = 0;
    let lignesCreees = 0;
    if (!dto.simulation && valides.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        for (const piece of valides) {
          await tx.ecriture.create({
            data: {
              tenantId,
              exerciceId: exercice.id,
              journalId: piece.journalId,
              date: piece.date,
              libelle: piece.libelle,
              reference: piece.reference,
              createdBy,
              lignes: {
                create: piece.lignes.map((l) => ({
                  compteId: l.compteId,
                  libelle: l.libelle || undefined,
                  debit: l.debit,
                  credit: l.credit,
                })),
              },
            },
          });
          ecrituresCreees++;
          lignesCreees += piece.lignes.length;
        }
      });
    }

    return {
      type: dto.type,
      simulation: !!dto.simulation,
      lignesLues: tableau.lignes.length,
      comptesCrees: 0,
      comptesReconnus: comptesParNumero.size,
      ecrituresCreees: dto.simulation ? valides.length : ecrituresCreees,
      lignesEcritureCreees: dto.simulation
        ? valides.reduce((s, p) => s + p.lignes.length, 0)
        : lignesCreees,
      totalDebit: valides.reduce((s, p) => s + p.lignes.reduce((t, l) => t + l.debit, 0), 0),
      totalCredit: valides.reduce((s, p) => s + p.lignes.reduce((t, l) => t + l.credit, 0), 0),
      anomalies,
    };
  }

  /** Exercice, journal d'accueil, plan de comptes · communs à balance et écritures. */
  private async contexte(tenantId: string, dto: ExecuterImportDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new BadRequestException('Dossier introuvable');

    const exercice = dto.exerciceId
      ? await this.prisma.exercice.findFirst({ where: { id: dto.exerciceId, tenantId } })
      : await this.prisma.exercice.findFirst({
          where: { tenantId, statut: StatutExercice.OUVERT },
          orderBy: { dateDebut: 'desc' },
        });
    if (!exercice) throw new BadRequestException('Aucun exercice ouvert pour recevoir cet import.');
    if (exercice.statut === StatutExercice.CLOTURE) {
      throw new BadRequestException("L'exercice sélectionné est clôturé.");
    }

    const journaux = await this.prisma.journal.findMany({ where: { tenantId } });
    const journal = dto.journalId
      ? journaux.find((j) => j.id === dto.journalId)
      : (journaux.find((j) => j.code === 'OD') ?? journaux.find((j) => j.type === 'GENERAL'));
    if (!journal) {
      throw new BadRequestException(
        "Aucun journal d'accueil : indiquez le journal, ou créez un journal général (code OD).",
      );
    }

    const comptes = await this.prisma.compte.findMany({
      where: { tenantId },
      select: { id: true, numero: true, typeCompte: true },
    });
    return { tenant, exercice, journal, journaux, comptes };
  }
}
