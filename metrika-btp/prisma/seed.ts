import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL ?? "admin@metrika.ma";
  const password = process.env.ADMIN_PASSWORD ?? "MetrikaMaroc2026!";
  const passwordHash = await bcrypt.hash(password, 12);

  // Utilisateur unique autorisé
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, name: "Administrateur Metrika", passwordHash, role: "ADMIN" },
  });

  // Fiche entreprise par défaut
  const existing = await prisma.company.findFirst();
  if (!existing) {
    await prisma.company.create({
      data: {
        name: "Metrika Métrage BTP",
        legalForm: "SARL",
        city: "Casablanca",
        email: "contact@metrika.ma",
        vatRate: 20,
        quotePrefix: "DEV",
        paymentTerms:
          "Paiement à 30 jours. Devis valable 30 jours. TVA 20% applicable.",
      },
    });
  }

  // Quelques prix de démarrage dans la bibliothèque
  const seedPrices = [
    { designation: "Béton armé dosé à 350 kg/m³", unit: "m³", unitPrice: 1100, lot: "Gros Œuvre", category: "Béton" },
    { designation: "Maçonnerie agglos creux 20 cm", unit: "m²", unitPrice: 120, lot: "Gros Œuvre", category: "Maçonnerie" },
    { designation: "Enduit ciment sur murs", unit: "m²", unitPrice: 65, lot: "Revêtements", category: "Enduit" },
    { designation: "Carrelage grès cérame 60x60", unit: "m²", unitPrice: 180, lot: "Revêtements", category: "Sol" },
    { designation: "Peinture vinylique 2 couches", unit: "m²", unitPrice: 35, lot: "Peinture", category: "Mur" },
  ];
  for (const p of seedPrices) {
    const sellingPrice = Math.round(p.unitPrice * 1.21);
    await prisma.priceItem.create({ data: { ...p, sellingPrice } });
  }

  console.log(`✓ Seed terminé — connexion : ${email}`);
}

main().finally(() => prisma.$disconnect());
