/**
 * Knowledge Ingestion Script for RDC Saathi
 * Run: npx ts-node scripts/ingestKnowledge.ts
 *   or: node -r ts-node/register scripts/ingestKnowledge.ts
 *
 * This script reads knowledge JSON files and populates the database.
 * Re-running is idempotent — it upserts documents and recreates chunks.
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

interface KnowledgeEntry {
  id: string;
  title: string;
  category: string;
  sourceType: string;
  sourceName: string;
  audience: string;
  geography: string;
  visibility: string;
  tags: string[];
  content: string;
  language?: string;
  lastUpdated?: string;
}

/**
 * Split content into overlapping chunks of ~500 chars
 */
function chunkContent(content: string, chunkSize = 500, overlap = 100): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < content.length) {
    const end = Math.min(start + chunkSize, content.length);
    chunks.push(content.slice(start, end).trim());
    if (end >= content.length) break;
    start = end - overlap;
  }

  return chunks.filter((c) => c.length > 50);
}

/**
 * Ingest a single knowledge entry
 */
async function ingestEntry(entry: KnowledgeEntry): Promise<void> {
  // Upsert document
  await prisma.knowledgeDocument.upsert({
    where: { id: entry.id },
    create: {
      id: entry.id,
      title: entry.title,
      category: entry.category,
      sourceType: entry.sourceType,
      sourceName: entry.sourceName,
      language: entry.language || "en",
      audience: entry.audience,
      geography: entry.geography,
      visibility: entry.visibility,
      tags: JSON.stringify(entry.tags),
      isActive: true,
    },
    update: {
      title: entry.title,
      category: entry.category,
      sourceType: entry.sourceType,
      sourceName: entry.sourceName,
      language: entry.language || "en",
      audience: entry.audience,
      geography: entry.geography,
      visibility: entry.visibility,
      tags: JSON.stringify(entry.tags),
      isActive: true,
      lastUpdated: new Date(),
    },
  });

  // Delete existing chunks for this document
  await prisma.knowledgeChunk.deleteMany({
    where: { documentId: entry.id },
  });

  // Create new chunks
  const chunks = chunkContent(entry.content);
  for (let i = 0; i < chunks.length; i++) {
    await prisma.knowledgeChunk.create({
      data: {
        documentId: entry.id,
        content: chunks[i],
        chunkIndex: i,
        metadata: JSON.stringify({
          title: entry.title,
          category: entry.category,
          chunkOf: chunks.length,
        }),
      },
    });
  }

  console.log(
    `  ✓ [${entry.category}] "${entry.title}" — ${chunks.length} chunk(s)`
  );
}

/**
 * Main ingestion function
 */
async function main() {
  console.log("🚀 RDC Saathi — Knowledge Ingestion Script");
  console.log("==========================================\n");

  const knowledgeDir = path.join(process.cwd(), "knowledge");
  const jsonFiles = fs
    .readdirSync(knowledgeDir)
    .filter((f) => f.endsWith(".json"));

  if (jsonFiles.length === 0) {
    console.warn("⚠️  No JSON files found in /knowledge directory.");
    return;
  }

  let totalDocs = 0;
  let totalChunks = 0;

  for (const file of jsonFiles) {
    const filePath = path.join(knowledgeDir, file);
    console.log(`📄 Processing: ${file}`);

    const raw = fs.readFileSync(filePath, "utf-8");
    const entries: KnowledgeEntry[] = JSON.parse(raw);

    for (const entry of entries) {
      await ingestEntry(entry);
      totalDocs++;
      const chunks = Math.ceil(entry.content.length / 400);
      totalChunks += chunks;
    }
    console.log();
  }

  // Seed admin user if not exists
  const adminEmail = process.env.ADMIN_DEMO_EMAIL || "admin@rdcconcrete.com";
  const adminPassword = process.env.ADMIN_DEMO_PASSWORD || "rdcadmin2025";

  const existingAdmin = await prisma.adminUser.findFirst({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    // Simple hash for demo (not bcrypt to keep dependencies minimal for seed)
    const hash = Buffer.from(`${adminPassword}:rdc_salt_2025`).toString(
      "base64"
    );
    await prisma.adminUser.create({
      data: {
        email: adminEmail,
        passwordHash: hash,
        name: "Admin",
        role: "admin",
      },
    });
    console.log(`👤 Admin user created: ${adminEmail}`);
  }

  // Seed default app configs
  const configs = [
    { key: "USE_WEB_SEARCH", value: "false", type: "boolean", label: "Enable Web Search" },
    { key: "USE_MOCK_AI", value: "false", type: "boolean", label: "Use Mock AI (no API key)" },
    { key: "ENABLE_VOICE_UI", value: "true", type: "boolean", label: "Enable Voice UI" },
    { key: "ENABLE_TTS", value: "false", type: "boolean", label: "Enable Text-to-Speech" },
    { key: "ENABLE_STT", value: "false", type: "boolean", label: "Enable Speech-to-Text" },
    { key: "CHAT_GREETING", value: "Welcome to RDC Concrete! 🙏 I'm RDC Saathi, your digital assistant. How can I help you today?", type: "string", label: "Initial Greeting Message" },
    { key: "MAX_CONTEXT_CHUNKS", value: "5", type: "number", label: "Max Knowledge Chunks per Query" },
  ];

  for (const config of configs) {
    await prisma.appConfig.upsert({
      where: { key: config.key },
      create: config,
      update: { value: config.value, label: config.label },
    });
  }
  console.log("⚙️  App configs seeded.");

  console.log("\n==========================================");
  console.log(`✅ Ingestion complete!`);
  console.log(`   Documents: ${totalDocs}`);
  console.log(`   Estimated chunks: ~${totalChunks}`);
  console.log("==========================================\n");
}

main()
  .catch((err) => {
    console.error("❌ Ingestion failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
