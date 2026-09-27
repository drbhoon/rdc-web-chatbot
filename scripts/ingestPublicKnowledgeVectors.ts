/**
 * Build the local RDC public knowledge vector corpus.
 *
 * Employee data is intentionally excluded. This corpus is for public RDC
 * company, product, plant, benefits, Vision 2030, and RMC industry material.
 *
 * Run:
 *   npm run ingest:public-vectors
 */

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

interface ExtractedUnit {
  unitType: "page" | "sheet" | "slide" | "section";
  unitName: string;
  page?: number;
  text: string;
}

interface ExtractedSource {
  path: string;
  sourceName: string;
  units: ExtractedUnit[];
  textChars: number;
  warnings: string[];
}

interface PublicKnowledgeSource {
  title: string;
  path: string;
  tags: string[];
}

interface PublicKnowledgeChunk {
  id: string;
  text: string;
  embedding: number[];
  metadata: {
    sourceName: string;
    sourcePath: string;
    page?: number;
    section?: string;
    tags: string[];
    embeddingModel: string;
    generatedAt: string;
    extractionMode: string;
  };
}

const PUBLIC_INFO_DIR =
  process.env.RDC_PUBLIC_INFO_DIR || "D:\\RDC Drive\\AI\\RDCAI Chatbot\\rdc_info_except_sitebased";

const REQUIRED_STRATEGY_SOURCES: PublicKnowledgeSource[] = [
  {
    title: "RDC Vision 2030",
    path: "D:\\RDC Drive\\BD\\Vision 2030\\RDC Vision 2030.pdf",
    tags: ["vision_2030", "strategy", "growth", "rdc"],
  },
  {
    title: "RMC Industry Perspective and 2025 Benchmarking Report",
    path: "D:\\RDC Drive\\BD\\Vision 2030\\Strategic Analysis of High-Performance B2B Marketing Paradigms in the Indian Ready-Mix Concrete Sector_ A 2025 Lead Generation and Economic Benchmarking Report.docx",
    tags: ["rmc_industry", "industry_perspective", "strategy", "india"],
  },
];

const SUPPORTED_EXTENSIONS = new Set([".pdf", ".xlsx", ".xlsm", ".pptx", ".pptm", ".docx"]);
const GENERATED_DIR = path.join(process.cwd(), "knowledge", "generated");
const CHUNKS_PATH = path.join(GENERATED_DIR, "public-knowledge-chunks.jsonl");
const INDEX_PATH = path.join(GENERATED_DIR, "public-knowledge-index.json");
const EMBEDDING_MODEL = "rdc-local-hash-v1";
const EMBEDDING_DIMS = 384;

function tokenize(text: string): string[] {
  const words = text
    .toLowerCase()
    .normalize("NFKC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 1);

  const expanded = [...words];
  for (const word of words) {
    if (word.length > 4) {
      for (let i = 0; i <= word.length - 3; i++) {
        expanded.push(word.slice(i, i + 3));
      }
    }
  }
  return expanded;
}

function hashToken(token: string): number {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function embedText(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMS).fill(0);
  for (const token of tokenize(text)) {
    const hash = hashToken(token);
    vector[hash % EMBEDDING_DIMS] += hash & 1 ? 1 : -1;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) return vector;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}

function resolvePython(): string {
  const candidates = [
    process.env.VISION_PYTHON,
    process.env.PYTHON,
    process.env.USERPROFILE
      ? path.join(
          process.env.USERPROFILE,
          ".cache",
          "codex-runtimes",
          "codex-primary-runtime",
          "dependencies",
          "python",
          "python.exe"
        )
      : undefined,
    "python",
    "py",
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const check = spawnSync(candidate, ["-c", "import pypdf, openpyxl"], {
      encoding: "utf-8",
      timeout: 10000,
    });
    if (check.status === 0) return candidate;
  }

  return candidates[0] || "python";
}

function sourceTitleFromFile(filePath: string): string {
  return path.basename(filePath, path.extname(filePath)).replace(/\s+/g, " ").trim();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function isEmployeeFile(filePath: string): boolean {
  const name = path.basename(filePath).toLowerCase();
  return /\b(employee|employees|emp directory|staff|hris)\b/.test(name);
}

function classifyTags(filePath: string): string[] {
  const name = path.basename(filePath).toLowerCase();
  const tags = new Set(["public_knowledge", "rdc"]);

  if (name.includes("vision")) tags.add("vision_2030");
  if (name.includes("rmc") || name.includes("readymix") || name.includes("ready-mix")) tags.add("rmc_industry");
  if (name.includes("benefit")) tags.add("benefits");
  if (name.includes("plant")) tags.add("plants");
  if (name.includes("address")) tags.add("plant_addresses");
  if (name.includes("commercial")) tags.add("commercial_plants");
  if (name.includes("captive")) tags.add("captive_plants");
  if (name.includes("corporate profile")) tags.add("corporate_profile");

  return Array.from(tags);
}

function collectPublicFolderSources(): PublicKnowledgeSource[] {
  if (!fs.existsSync(PUBLIC_INFO_DIR)) return [];

  return fs
    .readdirSync(PUBLIC_INFO_DIR)
    .map((name) => path.join(PUBLIC_INFO_DIR, name))
    .filter((filePath) => fs.statSync(filePath).isFile())
    .filter((filePath) => SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase()))
    .filter((filePath) => !isEmployeeFile(filePath))
    .map((filePath) => ({
      title: sourceTitleFromFile(filePath),
      path: filePath,
      tags: classifyTags(filePath),
    }));
}

function uniqueSources(sources: PublicKnowledgeSource[]): PublicKnowledgeSource[] {
  const seen = new Set<string>();
  const unique: PublicKnowledgeSource[] = [];
  for (const source of sources) {
    const key = path.resolve(source.path).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(source);
  }
  return unique;
}

function extractSource(source: PublicKnowledgeSource): ExtractedSource {
  const extractorPath = path.join(process.cwd(), "scripts", "extractPublicKnowledgeText.py");
  const result = spawnSync(resolvePython(), [extractorPath, source.path], {
    encoding: "utf-8",
    maxBuffer: 100 * 1024 * 1024,
  });

  if (result.error) {
    return {
      path: source.path,
      sourceName: source.title,
      units: [],
      textChars: 0,
      warnings: [`Text extraction failed: ${result.error.message}`],
    };
  }

  try {
    return JSON.parse(result.stdout || "{}") as ExtractedSource;
  } catch {
    return {
      path: source.path,
      sourceName: source.title,
      units: [],
      textChars: 0,
      warnings: [`Could not parse extractor output: ${result.stderr || result.stdout}`],
    };
  }
}

function splitIntoChunks(text: string, maxChars = 1200, overlapChars = 180): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const softEnd = Math.min(start + maxChars, normalized.length);
    let end = softEnd;
    const sentenceBreak = normalized.lastIndexOf(". ", softEnd);
    if (sentenceBreak > start + maxChars * 0.55) {
      end = sentenceBreak + 1;
    }

    const chunk = normalized.slice(start, end).trim();
    if (chunk.length > 60) chunks.push(chunk);
    if (end >= normalized.length) break;
    start = Math.max(0, end - overlapChars);
  }

  return chunks;
}

function makeChunk(
  id: string,
  text: string,
  source: PublicKnowledgeSource,
  unit: ExtractedUnit
): PublicKnowledgeChunk {
  return {
    id,
    text,
    embedding: embedText(text),
    metadata: {
      sourceName: source.title,
      sourcePath: source.path,
      page: unit.page,
      section: unit.unitName,
      tags: source.tags,
      embeddingModel: EMBEDDING_MODEL,
      generatedAt: new Date().toISOString(),
      extractionMode: unit.unitType,
    },
  };
}

function main() {
  fs.mkdirSync(GENERATED_DIR, { recursive: true });

  const sources = uniqueSources([...collectPublicFolderSources(), ...REQUIRED_STRATEGY_SOURCES]).filter((source) =>
    fs.existsSync(source.path)
  );

  const chunks: PublicKnowledgeChunk[] = [];
  const indexSources = [];

  for (const source of sources) {
    const extracted = extractSource(source);
    let sourceChunkCount = 0;

    for (const unit of extracted.units || []) {
      splitIntoChunks(unit.text).forEach((text, index) => {
        chunks.push(
          makeChunk(`${slugify(source.title)}-${slugify(unit.unitName)}-${index + 1}`, text, source, unit)
        );
        sourceChunkCount += 1;
      });
    }

    indexSources.push({
      title: source.title,
      path: source.path,
      tags: source.tags,
      extractedTextChars: extracted.textChars || 0,
      unitCount: extracted.units?.length || 0,
      chunkCount: sourceChunkCount,
      warnings: extracted.warnings || [],
    });
  }

  fs.writeFileSync(CHUNKS_PATH, chunks.map((chunk) => JSON.stringify(chunk)).join("\n") + "\n", "utf-8");

  const index = {
    generatedAt: new Date().toISOString(),
    embeddingModel: EMBEDDING_MODEL,
    embeddingDims: chunks[0]?.embedding.length || 384,
    chunkCount: chunks.length,
    chunksPath: CHUNKS_PATH,
    excluded: ["employee files", "Employees.csv", "employee directory data"],
    sources: indexSources,
  };

  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), "utf-8");

  console.log("RDC public knowledge vector ingestion complete");
  console.log(`Sources: ${sources.length}`);
  console.log(`Chunks: ${chunks.length}`);
  console.log(`Chunks file: ${CHUNKS_PATH}`);
  console.log(`Index file: ${INDEX_PATH}`);
  for (const source of indexSources) {
    console.log(`- ${source.title}: ${source.chunkCount} chunk(s), ${source.extractedTextChars} chars`);
    for (const warning of source.warnings) {
      console.warn(`  warning: ${warning}`);
    }
  }
}

main();
