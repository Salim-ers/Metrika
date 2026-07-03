warn The configuration property `package.json#prisma` is deprecated and will be removed in Prisma 7. Please migrate to a Prisma config file (e.g., `prisma.config.ts`).
For more information, see: https://pris.ly/prisma-config

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ADMIN',
    "twoFactorSecret" TEXT,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalForm" TEXT,
    "logoUrl" TEXT,
    "stampUrl" TEXT,
    "ice" TEXT,
    "rc" TEXT,
    "ifNumber" TEXT,
    "cnss" TEXT,
    "patente" TEXT,
    "capital" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Maroc',
    "currency" TEXT NOT NULL DEFAULT 'MAD',
    "siret" TEXT,
    "vatNumber" TEXT,
    "ape" TEXT,
    "address" TEXT,
    "city" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "bankName" TEXT,
    "rib" TEXT,
    "iban" TEXT,
    "swift" TEXT,
    "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "quotePrefix" TEXT NOT NULL DEFAULT 'DEV',
    "quoteCounter" INTEGER NOT NULL DEFAULT 1,
    "paymentTerms" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROSPECT',
    "company" TEXT,
    "ice" TEXT,
    "contact" TEXT,
    "address" TEXT,
    "city" TEXT,
    "region" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientDocument" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "mimeType" TEXT,
    "size" INTEGER,
    "dataUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reference" TEXT,
    "type" TEXT,
    "location" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'EN_COURS',
    "jurisdiction" TEXT NOT NULL DEFAULT 'Maroc',
    "currency" TEXT,
    "vatRate" DOUBLE PRECISION,
    "clientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectActor" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sourceFile" TEXT,
    "sourcePage" TEXT,
    "confidence" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'missing',
    "notes" TEXT,

    CONSTRAINT "ProjectActor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "category" TEXT,
    "mimeType" TEXT,
    "size" INTEGER,
    "pages" INTEGER,
    "storageKey" TEXT NOT NULL,
    "extractedText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "projectId" TEXT,
    "userId" TEXT,
    "treatmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Treatment" (
    "id" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "inputMeta" TEXT,
    "outputMeta" TEXT,
    "error" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Treatment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cctp" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "projectType" TEXT,
    "projectId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "mode" TEXT NOT NULL DEFAULT 'fidele',
    "jurisdiction" TEXT NOT NULL DEFAULT 'Maroc',
    "meta" TEXT,
    "planContext" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "indice" TEXT NOT NULL DEFAULT 'A',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cctp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CctpSection" (
    "id" TEXT NOT NULL,
    "cctpId" TEXT NOT NULL,
    "lot" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "content" TEXT NOT NULL,
    "validated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CctpSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dpgf" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "projectId" TEXT,
    "cctpId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "mode" TEXT NOT NULL DEFAULT 'dpgf',
    "provisional" BOOLEAN NOT NULL DEFAULT true,
    "currency" TEXT,
    "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "version" INTEGER NOT NULL DEFAULT 1,
    "indice" TEXT NOT NULL DEFAULT 'A',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dpgf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DpgfLine" (
    "id" TEXT NOT NULL,
    "dpgfId" TEXT NOT NULL,
    "lot" TEXT NOT NULL,
    "code" TEXT,
    "designation" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quantitySource" TEXT,
    "status" TEXT,
    "confidence" TEXT,
    "sourceExcerpt" TEXT,
    "calculation" TEXT,
    "priceSource" TEXT,
    "comment" TEXT,
    "cctpSectionId" TEXT,
    "cctpArticle" TEXT,
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DpgfLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SousDetail" (
    "id" TEXT NOT NULL,
    "dpgfLineId" TEXT,
    "designation" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "lot" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "yield" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "debourseSec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "wasteRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "generalFeesRate" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
    "profitRate" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
    "sellingPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "targetPrice" DOUBLE PRECISION,
    "hypotheses" TEXT,
    "sources" TEXT,
    "pointsToVerify" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SousDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SousDetailComponent" (
    "id" TEXT NOT NULL,
    "sousDetailId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costSource" TEXT,

    CONSTRAINT "SousDetailComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceLibrary" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL DEFAULT 'Maroc',
    "currency" TEXT NOT NULL DEFAULT 'MAD',
    "version" TEXT NOT NULL DEFAULT '1',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceItem" (
    "id" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "category" TEXT,
    "lot" TEXT,
    "supplier" TEXT,
    "source" TEXT,
    "marginRate" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
    "generalFeesRate" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
    "sellingPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "libraryId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL,
    "priceItemId" TEXT NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "sellingPrice" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferenceDoc" (
    "id" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "lot" TEXT,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "version" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferenceDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationIssue" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "docType" TEXT NOT NULL,
    "docId" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "context" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ValidationIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "indice" TEXT,
    "trigger" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportJob" (
    "id" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "docId" TEXT,
    "format" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DONE',
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT,
    "clientId" TEXT,
    "projectId" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validityDays" INTEGER NOT NULL DEFAULT 30,
    "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "totalHT" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalVAT" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalTTC" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteLine" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "ClientDocument_clientId_idx" ON "ClientDocument"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectActor_projectId_role_key" ON "ProjectActor"("projectId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "SousDetail_dpgfLineId_key" ON "SousDetail"("dpgfLineId");

-- CreateIndex
CREATE INDEX "PriceItem_designation_idx" ON "PriceItem"("designation");

-- CreateIndex
CREATE INDEX "PriceItem_lot_category_idx" ON "PriceItem"("lot", "category");

-- CreateIndex
CREATE INDEX "ReferenceDoc_jurisdiction_lot_idx" ON "ReferenceDoc"("jurisdiction", "lot");

-- CreateIndex
CREATE INDEX "ValidationIssue_docType_docId_idx" ON "ValidationIssue"("docType", "docId");

-- CreateIndex
CREATE INDEX "ValidationIssue_projectId_resolved_idx" ON "ValidationIssue"("projectId", "resolved");

-- CreateIndex
CREATE INDEX "DocumentVersion_docType_docId_idx" ON "DocumentVersion"("docType", "docId");

-- CreateIndex
CREATE INDEX "ExportJob_projectId_idx" ON "ExportJob"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_number_key" ON "Quote"("number");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientDocument" ADD CONSTRAINT "ClientDocument_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectActor" ADD CONSTRAINT "ProjectActor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "Treatment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Treatment" ADD CONSTRAINT "Treatment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cctp" ADD CONSTRAINT "Cctp_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CctpSection" ADD CONSTRAINT "CctpSection_cctpId_fkey" FOREIGN KEY ("cctpId") REFERENCES "Cctp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dpgf" ADD CONSTRAINT "Dpgf_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dpgf" ADD CONSTRAINT "Dpgf_cctpId_fkey" FOREIGN KEY ("cctpId") REFERENCES "Cctp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DpgfLine" ADD CONSTRAINT "DpgfLine_dpgfId_fkey" FOREIGN KEY ("dpgfId") REFERENCES "Dpgf"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DpgfLine" ADD CONSTRAINT "DpgfLine_cctpSectionId_fkey" FOREIGN KEY ("cctpSectionId") REFERENCES "CctpSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SousDetail" ADD CONSTRAINT "SousDetail_dpgfLineId_fkey" FOREIGN KEY ("dpgfLineId") REFERENCES "DpgfLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SousDetailComponent" ADD CONSTRAINT "SousDetailComponent_sousDetailId_fkey" FOREIGN KEY ("sousDetailId") REFERENCES "SousDetail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceItem" ADD CONSTRAINT "PriceItem_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "PriceLibrary"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_priceItemId_fkey" FOREIGN KEY ("priceItemId") REFERENCES "PriceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationIssue" ADD CONSTRAINT "ValidationIssue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

